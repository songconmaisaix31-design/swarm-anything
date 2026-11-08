import { lstat } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { spawnManagedProviderProcess, type ManagedProviderProcess } from '../../../third_party/orca-v1.4.230/src/main/provider-process/managed-provider-process'
import { SwaProviderProcessTree } from '../../../third_party/orca-v1.4.230/src/main/provider-process/swa-provider-process-tree'
import { assertNativeOpenCodeCurrent, readOpenCodeCredential, type NativeOpenCodeSnapshot } from './native-opencode-policy'
import { abandonPrivateOpenCodeInitialization, claimPrivateOpenCodeInitialization, completePrivateOpenCodeInitialization, privateOpenCodeEnvironment, verifyPrivateOpenCodeAccount } from './private-opencode-account'

export type NativeOpenCodeImportResource = { managed: ManagedProviderProcess; tree: SwaProviderProcessTree }

export async function importPrivateOpenCodeCredential(input: {
  snapshot: NativeOpenCodeSnapshot; root: string; plugin: string; correlation: string;
  node: string; entry: string; executable: string; cwd: string;
  inherited: Readonly<Record<string, string>>;
  observe(resource: NativeOpenCodeImportResource): void
  beforeInput?(): Promise<() => void>
}) {
  const { snapshot } = input, provider = snapshot.policy.account.provider
  claimPrivateOpenCodeInitialization(input.root)
  let body: Buffer | undefined
  try {
  await verifyPrivateOpenCodeAccount(snapshot, input.root, input.plugin, input.correlation, true)
  const env = privateOpenCodeEnvironment(input.root, input.inherited)
  try {
    await lstat(env.OPENCODE_DB)
    throw new Error('native_opencode_import_destination_exists')
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
  }
  const original = readOpenCodeCredential(snapshot.policy.account.database_source.path, provider)
  assertNativeOpenCodeCurrent(snapshot)
  body = Buffer.from(JSON.stringify([{ id: original.id, integrationID: provider, label: original.label, active: true, value: { type: 'key', key: original.key } }]))
  const tree = new SwaProviderProcessTree()
  let imported = 0, stdoutBytes = 0, otherStderrLines = 0, stdoutEnded = false, stderrEnded = false
  let streamFailure: Error | undefined, rejectStreams!: (error: Error) => void
  const streamErrors = new Promise<never>((_resolve, reject) => { rejectStreams = reject })
  void streamErrors.catch(() => undefined)
  let managed: ManagedProviderProcess
  try {
    managed = spawnManagedProviderProcess({ command: input.node, args: [input.entry, JSON.stringify({ command: input.executable, args: ['auth', 'import', '--standalone'] })], cwd: input.cwd, env, envToDelete: Object.keys(process.env).filter(name => !(name in env)), swaJobIPC: true }, {
      site: 'native-opencode-account-import', lifetime: 'one-shot', acceptClose: value => value.root === 'exited' && (value.tree === 'exited' || managed.processless), stderrLineMaxChars: 4096,
      onStderrLine(line, cut) { if (!cut && line.trimEnd() === 'Imported 1 credential') imported++; else otherStderrLines++; return true }
    })
  } catch (spawnError) {
    try { tree.closeBeforeSpawnFailure() }
    catch (cleanupError) { throw new AggregateError([spawnError, cleanupError], 'native_opencode_import_spawn_cleanup_unknown', { cause: spawnError }) }
    throw spawnError
  }
  const streamError = () => { streamFailure ??= new Error('native_opencode_import_stream_failed'); rejectStreams(streamFailure) }
  let timer: ReturnType<typeof setTimeout> | undefined
  let operationFailed = false, operationError: unknown
  try {
    managed.child.stdin.on('error', streamError)
    managed.child.stdout.on('error', streamError)
    managed.child.stderr.on('error', streamError)
    managed.child.once('error', streamError)
    managed.child.stdout.on('data', (chunk: Buffer) => { stdoutBytes += chunk.length })
    managed.child.stdout.once('end', () => { stdoutEnded = true })
    managed.child.stderr.once('end', () => { stderrEnded = true })
    const streamsClosed = new Promise<void>(resolve => {
      managed.child.once('close', () => resolve())
    })
    tree.bind(managed.child, () => ({ observed: managed.rootExitObserved, processless: managed.processless }), true)
    input.observe({ managed, tree })
    await Promise.race([tree.ready(), streamErrors])
    await verifyPrivateOpenCodeAccount(snapshot, input.root, input.plugin, input.correlation, true)
    const finalAdmission = await input.beforeInput?.()
    assertNativeOpenCodeCurrent(snapshot)
    if (streamFailure) throw streamFailure
    finalAdmission?.()
    const secretBody = body
    await Promise.race([streamErrors, new Promise<void>((resolve, reject) => managed.child.stdin.end(secretBody, (error?: Error | null) => { secretBody.fill(0); if (error) reject(new Error('native_opencode_import_stdin_failed')); else resolve() }))])
    await Promise.race([Promise.all([managed.exitPromise, streamsClosed]), streamErrors, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('native_opencode_import_exit_unknown')), 30_000) })])
  } catch (error) { operationFailed = true; operationError = error }
  body.fill(0)
  clearTimeout(timer)
  let closed
  try {
    closed = await managed.close(tree)
    if (closed.root !== 'exited' || closed.tree !== 'exited' || tree.forcedReapAttempted || !tree.readFinalObservation()) throw new Error('native_opencode_import_cleanup_unknown')
  } catch (cleanupError) {
    if (operationFailed) throw new AggregateError([operationError, cleanupError], 'native_opencode_import_cleanup_unknown', { cause: operationError })
    throw cleanupError
  }
  if (operationFailed) throw operationError
  if (streamFailure || !stdoutEnded || !stderrEnded || managed.child.exitCode !== 0 || managed.child.signalCode !== null || imported !== 1 || stdoutBytes !== 0) throw new Error('native_opencode_import_failed')
  assertNativeOpenCodeCurrent(snapshot)
  const actual = readOpenCodeCredential(env.OPENCODE_DB, provider)
  const db = new DatabaseSync(env.OPENCODE_DB, { readOnly: true, allowExtension: false })
  try {
    db.exec('PRAGMA query_only=ON')
    if (db.prepare('SELECT count(*) AS count FROM credential').get()?.count !== 1) throw new Error('native_opencode_import_result_changed')
  } finally { db.close() }
  if (actual.count !== 1 || actual.id !== original.id || actual.key !== original.key) throw new Error('native_opencode_import_result_changed')
  // 唯一原生导入完成前不创建 legacy 投影，避免触发第二份凭据迁移。
  await completePrivateOpenCodeInitialization(snapshot, input.root, input.plugin, input.correlation)
  return { imported, stdoutBytes, otherStderrLines, credential_id: actual.id, credential_type: 'key' as const, matches_source: true as const, closed }
  } catch (error) { abandonPrivateOpenCodeInitialization(input.root); throw error }
  finally { body?.fill(0) }
}
