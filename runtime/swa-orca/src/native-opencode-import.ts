import { lstat } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { spawnManagedProviderProcess, type ManagedProviderProcess } from '../../../third_party/orca-v1.4.230/src/main/provider-process/managed-provider-process'
import { SwaProviderProcessTree } from '../../../third_party/orca-v1.4.230/src/main/provider-process/swa-provider-process-tree'
import { assertNativeOpenCodeCurrent, readOpenCodeCredential, type NativeOpenCodeSnapshot } from './native-opencode-policy'
import { privateOpenCodeEnvironment, verifyPrivateOpenCodeAccount } from './private-opencode-account'

export type NativeOpenCodeImportResource = { managed: ManagedProviderProcess; tree: SwaProviderProcessTree }

export async function importPrivateOpenCodeCredential(input: {
  snapshot: NativeOpenCodeSnapshot; root: string; plugin: string; correlation: string;
  node: string; entry: string; executable: string; cwd: string;
  inherited: Readonly<Record<string, string>>;
  observe(resource: NativeOpenCodeImportResource): void
  beforeInput?(): Promise<() => void>
}) {
  const { snapshot } = input
  await verifyPrivateOpenCodeAccount(snapshot, input.root, input.plugin, input.correlation)
  const env = privateOpenCodeEnvironment(input.root, input.inherited)
  try {
    const info = await lstat(env.OPENCODE_DB)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('native_opencode_import_database_redirected')
    const db = new DatabaseSync(env.OPENCODE_DB, { readOnly: true })
    try {
      db.exec('PRAGMA query_only=ON')
      if (db.prepare('SELECT count(*) AS count FROM credential').get()?.count !== 0) throw new Error('native_opencode_import_destination_not_empty')
    } finally { db.close() }
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
  }
  const original = readOpenCodeCredential(snapshot.policy.account.database_source.path)
  assertNativeOpenCodeCurrent(snapshot)
  const body = Buffer.from(JSON.stringify([{ id: original.id, integrationID: 'deepseek', label: original.label, active: true, value: { type: 'key', key: original.key } }]))
  const tree = new SwaProviderProcessTree()
  let imported = 0, stdoutBytes = 0, otherStderrLines = 0
  const managed: ManagedProviderProcess = spawnManagedProviderProcess({ command: input.node, args: [input.entry, JSON.stringify({ command: input.executable, args: ['auth', 'import', '--standalone'] })], cwd: input.cwd, env, envToDelete: Object.keys(process.env).filter(name => !(name in env)), swaJobIPC: true }, {
    site: 'native-opencode-account-import', lifetime: 'one-shot', acceptClose: value => value.root === 'exited' && (value.tree === 'exited' || managed.processless),
    onStderrLine(line, cut) { if (!cut && line.trimEnd() === 'Imported 1 credential') imported++; else otherStderrLines++; return true }
  })
  tree.bind(managed.child, () => ({ observed: managed.rootExitObserved, processless: managed.processless }), true)
  input.observe({ managed, tree })
  managed.child.stdout.on('data', (chunk: Buffer) => { stdoutBytes += chunk.length })
  const streamsClosed = new Promise<void>((resolve, reject) => {
    managed.child.once('close', () => resolve())
    managed.child.once('error', () => reject(new Error('native_opencode_import_process_failed')))
  })
  void streamsClosed.catch(() => undefined)
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed
  try {
    await tree.ready()
    await verifyPrivateOpenCodeAccount(snapshot, input.root, input.plugin, input.correlation)
    const finalAdmission = await input.beforeInput?.()
    assertNativeOpenCodeCurrent(snapshot)
    finalAdmission?.()
    await new Promise<void>((resolve, reject) => managed.child.stdin.end(body, (error?: Error | null) => { body.fill(0); if (error) reject(new Error('native_opencode_import_stdin_failed')); else resolve() }))
    await Promise.race([Promise.all([managed.exitPromise, streamsClosed]), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('native_opencode_import_exit_unknown')), 30_000) })])
  } finally {
    body.fill(0)
    clearTimeout(timer)
    closed = await managed.close(tree)
    if (closed.root !== 'exited' || closed.tree !== 'exited' && !managed.processless) throw new Error('native_opencode_import_cleanup_unknown')
  }
  if (managed.child.exitCode !== 0 || managed.child.signalCode !== null || imported !== 1 || stdoutBytes !== 0) throw new Error('native_opencode_import_failed')
  assertNativeOpenCodeCurrent(snapshot)
  const actual = readOpenCodeCredential(env.OPENCODE_DB)
  if (actual.count !== 1 || actual.id !== original.id || actual.key !== original.key) throw new Error('native_opencode_import_result_changed')
  return { imported, stdoutBytes, otherStderrLines, credential_id: actual.id, credential_type: 'key' as const, matches_source: true as const, closed }
}
