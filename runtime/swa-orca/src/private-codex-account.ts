import { lstatSync, readdirSync, realpathSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join, toNamespacedPath } from 'node:path'
import { createPrivateDirectory } from '@orca/windows-security'
import { z } from 'zod'
import { spawnManagedProviderProcess, type ManagedProviderProcess } from '../../../third_party/orca-v1.4.230/src/main/provider-process/managed-provider-process'
import type { SwaInitializationProcess, SwaProviderJobLauncher } from '../../../third_party/orca-v1.4.230/src/main/provider-process/provider-process-launch'
import { SwaProviderProcessTree } from '../../../third_party/orca-v1.4.230/src/main/provider-process/swa-provider-process-tree'
import { assertNativeCodexCurrent, nativeCodexConfiguration, readNativeCodexApiKeyFile, requireNativeCodexPrivatePath, type NativeCodexSnapshot } from './native-codex-policy'

const directories = ['home', 'appdata', 'localappdata', 'temp', 'config', 'cache', 'sqlite', 'logs'] as const
function fail(code: string): never { throw new Error(`private_codex_${code}`) }
function absent(path: string) {
  try { lstatSync(path) } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
  fail('unexpected_existing_file')
}
async function directory(path: string, exclusive = false) {
  if (process.platform === 'win32') {
    requireNativeCodexPrivatePath(dirname(path), true)
    const created = createPrivateDirectory(toNamespacedPath(path))
    if (exclusive && !created) throw Object.assign(new Error('private_codex_directory_exists'), { code: 'EEXIST' })
  } else {
    try { await mkdir(path, { mode: 0o700 }) } catch (error) {
      if (exclusive || !(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
    }
  }
  requireNativeCodexPrivatePath(path, true)
}
function home(snapshot: NativeCodexSnapshot, sessionId: string) {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(sessionId)) fail('session_identity_invalid')
  assertNativeCodexCurrent(snapshot)
  requireNativeCodexPrivatePath(dirname(snapshot.policy.account.private_root), true)
  requireNativeCodexPrivatePath(snapshot.policy.account.private_root, true)
  return join(snapshot.policy.account.private_root, sessionId)
}
function checkHome(path: string, emptyAuth: boolean) {
  requireNativeCodexPrivatePath(path, true)
  for (const name of directories) requireNativeCodexPrivatePath(join(path, name), true)
  for (const root of [path, join(path, 'home'), join(path, 'home', '.codex'), join(path, 'config')]) {
    for (const name of ['config.toml', 'AGENTS.md', 'AGENTS.override.md', 'hooks.json']) absent(join(root, name))
  }
  if (emptyAuth) absent(join(path, 'auth.json'))
}

export async function createPrivateCodexRoot(projectId: string) {
  if (!z.uuid().safeParse(projectId).success || projectId !== projectId.toLowerCase()) fail('project_identity_invalid')
  const data = realpathSync.native(z.string().min(1).parse(process.env.SWA_DATA_DIR))
  requireNativeCodexPrivatePath(data, true)
  await directory(join(data, 'codex'))
  const root = join(data, 'codex', projectId)
  await directory(root)
  return root
}

export async function materializePrivateCodexAccount(snapshot: NativeCodexSnapshot, sessionId: string) {
  const path = home(snapshot, sessionId)
  await directory(path, true)
  if (readdirSync(path).length) fail('destination_not_empty')
  for (const name of directories) await directory(join(path, name), true)
  assertNativeCodexCurrent(snapshot)
  checkHome(path, true)
  return path
}

export function privateCodexEnvironment(snapshot: NativeCodexSnapshot, sessionId: string): Record<string, string> {
  const path = home(snapshot, sessionId)
  return { ...snapshot.env, CODEX_HOME: path, HOME: join(path, 'home'), USERPROFILE: join(path, 'home'), APPDATA: join(path, 'appdata'), LOCALAPPDATA: join(path, 'localappdata'), TEMP: join(path, 'temp'), TMP: join(path, 'temp'), TMPDIR: join(path, 'temp'), XDG_CONFIG_HOME: join(path, 'config'), XDG_CACHE_HOME: join(path, 'cache') }
}

export function verifyUninitializedPrivateCodexAccount(snapshot: NativeCodexSnapshot, sessionId: string): void {
  checkHome(home(snapshot, sessionId), true)
}

export async function verifyPrivateCodexAccount(snapshot: NativeCodexSnapshot, sessionId: string) {
  const path = home(snapshot, sessionId)
  checkHome(path, false)
  const actual = readNativeCodexApiKeyFile(join(path, 'auth.json'))
  if (actual.key !== snapshot.key) fail('account_changed')
  assertNativeCodexCurrent(snapshot)
  checkHome(path, false)
  return actual.source
}

export async function provisionPrivateCodexAccount(input: {
  snapshot: NativeCodexSnapshot; sessionId: string; cwd: string; launcher: SwaProviderJobLauncher;
  track(resource: SwaInitializationProcess): void; beforeInput(): Promise<() => void>
}): Promise<void> {
  const { snapshot, sessionId } = input, path = home(snapshot, sessionId)
  checkHome(path, true)
  const env = privateCodexEnvironment(snapshot, sessionId), tree = new SwaProviderProcessTree()
  const args = [...Object.entries(nativeCodexConfiguration({ privateHome: path, catalogPath: snapshot.policy.account.catalog_source.path })).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]), 'login', '--with-api-key']
  let managed: ManagedProviderProcess | undefined, closeRequested = false, released = false, unusedTreeClosed = false, closing: Promise<boolean> | undefined
  let successLines = 0, stdoutBytes = 0, stderrBytes = 0, outputExceeded = false, aborted = false
  const listeners = new Set<() => void>()
  const settled = () => {
    if (!managed) return unusedTreeClosed
    return managed.rootVerdict === 'exited' && (managed.processless || managed.rootExitObserved && tree.readFinalObservation() !== null)
  }
  const publish = () => {
    if (released || !settled()) return
    released = true
    for (const listener of listeners) listener()
    listeners.clear()
  }
  const closeOwned = () => {
    if (closing) return closing
    closing = (async () => {
      if (managed) {
        const result = await managed.close(tree)
        if (result.root !== 'exited' || result.tree !== 'exited' && !managed.processless || !settled()) return false
      } else if (!unusedTreeClosed) { tree.closeBeforeSpawnFailure(); unusedTreeClosed = true }
      publish()
      return released
    })().finally(() => { closing = undefined })
    return closing
  }
  const resource: SwaInitializationProcess = {
    close() { closeRequested = true; return closeOwned() },
    onExit(listener) { if (released) listener(); else listeners.add(listener) },
    get exited() { return released },
    stderrTail() { return outputExceeded ? 'native_codex_login_output_limit' : '' }
  }
  // 先登记真实资源，再同步核取消并启动；bind失败时仍由同一资源保留退出责任。
  let timer: ReturnType<typeof setTimeout> | undefined
  let body: Buffer | undefined
  try {
    input.track(resource)
    if (closeRequested) fail('login_cancelled')
    managed = spawnManagedProviderProcess({ command: input.launcher.node, args: [input.launcher.entry, JSON.stringify({ command: snapshot.executable, args })], cwd: input.cwd, env, envToDelete: Object.keys(process.env).filter(name => !(name in env)), swaJobIPC: true, swaEventDirectory: input.launcher.eventDirectory }, {
      site: 'native-codex-account-login', lifetime: 'one-shot', acceptClose: result => result.root === 'exited' && (result.tree === 'exited' || managed?.processless === true) && settled(),
      stderrLineMaxChars: 1024,
      onStderrLine(line, cut) { if (!cut && line.trimEnd() === 'Successfully logged in') successLines++; return true }
    })
    const actual = managed
    let rejectFailure: (error: Error) => void = () => undefined
    const failure = new Promise<never>((_resolve, reject) => { rejectFailure = reject })
    void failure.catch(() => undefined)
    const countOutput = () => {
      if (stdoutBytes > 65536 || stderrBytes > 65536) { outputExceeded = true; aborted = true; rejectFailure(new Error('private_codex_login_output_limit')) }
    }
    actual.child.stdout.on('data', (chunk: Buffer) => { stdoutBytes += chunk.length; countOutput() })
    actual.child.stderr.on('data', (chunk: string) => { stderrBytes += Buffer.byteLength(chunk); countOutput() })
    const streamsClosed = new Promise<void>((resolve, reject) => {
      actual.child.once('close', () => resolve())
      actual.child.once('error', () => reject(new Error('private_codex_login_process_failed')))
    })
    void streamsClosed.catch(() => undefined)
    tree.bind(actual.child, () => ({ observed: actual.rootExitObserved, processless: actual.processless }), true)
    timer = setTimeout(() => { aborted = true; rejectFailure(new Error('private_codex_login_deadline')) }, 30_000)
    const operation = async () => {
      await tree.ready()
      if (aborted || closeRequested) fail('login_cancelled')
      checkHome(path, true)
      const admission = await input.beforeInput()
      if (aborted || closeRequested) fail('login_cancelled')
      checkHome(path, true)
      assertNativeCodexCurrent(snapshot)
      admission()
      if (aborted || closeRequested) fail('login_cancelled')
      body = Buffer.from(snapshot.key + '\n', 'utf8')
      if (body.length > 16385) fail('login_input_limit')
      await new Promise<void>((resolve, reject) => actual.child.stdin.end(body, (error?: Error | null) => { body?.fill(0); if (error) reject(new Error('private_codex_login_stdin_failed')); else resolve() }))
      await Promise.all([actual.exitPromise, streamsClosed])
    }
    await Promise.race([operation(), failure])
    if (closeRequested) fail('login_cancelled')
    if (actual.child.exitCode !== 0 || actual.child.signalCode !== null || successLines !== 1 || stdoutBytes !== 0 || outputExceeded) fail('login_failed')
  } finally {
    aborted = true
    body?.fill(0)
    clearTimeout(timer)
    if (!await closeOwned()) fail('login_cleanup_unknown')
  }
  if (closeRequested) fail('login_cancelled')
  await verifyPrivateCodexAccount(snapshot, sessionId)
  if (closeRequested) fail('login_cancelled')
}
