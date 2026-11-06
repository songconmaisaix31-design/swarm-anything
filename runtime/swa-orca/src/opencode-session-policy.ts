import { appendFileSync } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { DatabaseSync } from 'node:sqlite'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { SwaOpenCodeToolsPolicy, SwaProviderJobLauncher } from '../../../third_party/orca-v1.4.230/src/main/provider-process/provider-process-launch'
import type { SwaProviderProcessTree } from '../../../third_party/orca-v1.4.230/src/main/provider-process/swa-provider-process-tree'
import { readWindowsProcessCreationTime } from '../../../third_party/orca-v1.4.230/src/main/windows/windows-process-table'
import { assertNativeOpenCodeCurrent, openCodeBuiltinPlugins, openCodePolicyPluginId, readOpenCodeCredential, type NativeOpenCodeSnapshot } from './native-opencode-policy'
import { importPrivateOpenCodeCredential } from './native-opencode-import'
import { privateOpenCodeEnvironment, verifyPrivateOpenCodeAccount } from './private-opencode-account'

const common = { type: z.literal('swa_opencode_policy'), correlation: z.string(), pid: z.number().int().positive(), root: z.string(), sequence: z.number().int().positive() }
const statusSchema = z.discriminatedUnion('state', [
  z.strictObject({ ...common, state: z.literal('active'), tools_count: z.literal(0), directory: z.string(), roots: z.record(z.string(), z.string()), plugins: z.array(z.strictObject({ id: z.string(), state: z.literal('active') })) }),
  z.strictObject({ ...common, state: z.literal('http_request'), session_id: z.string(), model: z.literal('deepseek-v4-pro'), tools_count: z.literal(0), initial_url: z.literal('https://api.deepseek.com/chat/completions'), monotonic_ms: z.number().nonnegative() }),
  z.strictObject({ ...common, state: z.literal('http_response'), session_id: z.string(), status: z.number().int(), monotonic_ms: z.number().nonnegative() }),
  z.strictObject({ ...common, state: z.literal('retry_disabled'), session_id: z.string(), attempt: z.number().int() }),
  z.strictObject({ ...common, state: z.literal('rejected'), session_id: z.string(), code: z.literal('native_session_selection_changed') }),
  z.strictObject({ ...common, state: z.literal('failed'), code: z.string(), checking: z.string(), error_type: z.string(), issue_paths: z.array(z.string()) }),
  z.strictObject({ ...common, state: z.literal('inactive') })
])

export function createOpenCodeSessionPolicy(input: {
  snapshot: NativeOpenCodeSnapshot; root: string; plugin: string; correlation: string;
  executable: string; launcher: SwaProviderJobLauncher;
  sessionId: string; fence: number;
  approve(): Promise<() => void>
}): SwaOpenCodeToolsPolicy {
  const { snapshot, root, plugin, correlation, launcher } = input
  const env = privateOpenCodeEnvironment(root, process.env as Record<string, string>)
  let tree: SwaProviderProcessTree | undefined, active = false, failure: Error | undefined, sequence = 0, traceSequence = 0
  let server: { pid: number; creationTimeMs: number } | undefined, session: string | undefined, workingDirectory: string | undefined
  let resolveReady!: () => void, rejectReady!: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  void ready.catch(() => undefined)
  const fail = () => { active = false; failure ??= new Error('native_opencode_policy_status_invalid'); rejectReady(failure) }
  const trace = (event: string, detail: unknown) => {
    const observation = tree?.readObservation()
    const body = JSON.stringify({ protocol: 'acp', projection: 'actual_native_acp_lifecycle_and_delta_fields', session_id: input.sessionId, runtime_fence: input.fence, sequence: ++traceSequence, observed_at: new Date().toISOString(), monotonic_ms: performance.now(), event, process: observation ? { pid: observation.rootPid, creationTimeMs: observation.rootCreationTimeMs } : undefined, native_cli: observation?.nativeCLI, native_server: server, detail })
    if (body.includes(snapshot.key)) { fail(); throw new Error('native_opencode_trace_contains_credential') }
    appendFileSync(join(launcher.eventDirectory, 'provider-events.ndjson'), body + '\n', { encoding: 'utf8', flag: 'a' })
  }
  async function verifyAccount() {
    await verifyPrivateOpenCodeAccount(snapshot, root, plugin, correlation)
    const info = await lstat(env.OPENCODE_DB)
    if (!info.isFile() || info.isSymbolicLink() || (await realpath(env.OPENCODE_DB)).toLowerCase() !== env.OPENCODE_DB.toLowerCase()) throw new Error('native_opencode_private_database_redirected')
    const credential = readOpenCodeCredential(env.OPENCODE_DB)
    if (credential.count !== 1 || credential.id !== snapshot.policy.account.credential_id || credential.key !== snapshot.key) throw new Error('native_opencode_private_credential_changed')
    const db = new DatabaseSync(env.OPENCODE_DB, { readOnly: true })
    try {
      db.exec('PRAGMA query_only=ON')
      if (db.prepare('SELECT count(*) AS count FROM credential').get()?.count !== 1 || db.prepare('SELECT active FROM credential WHERE id=?').get(credential.id)?.active !== 1) throw new Error('native_opencode_private_credential_changed')
    } finally { db.close() }
  }
  return {
    nativeContract: 'opencode-cli-2.0.31', model: 'deepseek/deepseek-v4-pro',
    async initialize(track, cwd) {
      workingDirectory = await realpath(cwd)
      await verifyPrivateOpenCodeAccount(snapshot, root, plugin, correlation)
      let exists = false
      try { const info = await lstat(env.OPENCODE_DB); if (!info.isFile() || info.isSymbolicLink()) throw new Error('native_opencode_private_database_redirected'); exists = true }
      catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error }
      if (exists) { await verifyAccount(); (await input.approve())(); return }
      await importPrivateOpenCodeCredential({ snapshot, root, plugin, correlation, node: launcher.node, entry: launcher.entry, executable: input.executable, cwd, inherited: process.env as Record<string, string>, beforeInput: input.approve,
        observe({ managed, tree: importTree }) {
          track({
            async close() { const result = await managed.close(importTree); return result.root === 'exited' && (result.tree === 'exited' || managed.processless) },
            onExit(listener) { managed.onExit(() => { if (importTree.treeVerdict === 'exited' || managed.processless) listener() }) },
            get exited() { return managed.rootVerdict === 'exited' && (importTree.treeVerdict === 'exited' || managed.processless) },
            stderrTail() { return 'Restricted OpenCode account initialization' }
          })
        }
      })
      await verifyAccount()
    },
    attach(value) { if (tree) throw new Error('native_opencode_policy_rebound'); tree = value },
    stderr(line, cut) {
      if (!line.startsWith('SWA_OPENCODE_POLICY ')) return true
      try {
        if (cut || !tree) throw new Error('native_opencode_policy_status_invalid')
        const row = statusSchema.parse(JSON.parse(line.slice('SWA_OPENCODE_POLICY '.length)))
        const birth = readWindowsProcessCreationTime(row.pid), observation = tree.readObservation()
        if (row.correlation !== correlation || row.root.toLowerCase() !== root.toLowerCase() || row.sequence !== sequence + 1 || !birth || !observation.members.some(member => member.pid === row.pid && member.creationTimeMs === birth) || server && (server.pid !== row.pid || server.creationTimeMs !== birth)) throw new Error('native_opencode_policy_identity_changed')
        server = { pid: row.pid, creationTimeMs: birth }; sequence = row.sequence
        if (row.state === 'active') {
          const actual = row.plugins.map(item => item.id).sort(), expected = [...openCodeBuiltinPlugins, openCodePolicyPluginId].sort()
          const roots = { home: env.HOME, data: env.XDG_DATA_HOME, cache: env.XDG_CACHE_HOME, config: env.XDG_CONFIG_HOME, state: env.XDG_STATE_HOME, programdata: env.ProgramData, temp: env.TEMP, database: env.OPENCODE_DB }
          if (failure || !isDeepStrictEqual(actual, expected) || !isDeepStrictEqual(row.roots, roots)) throw new Error('native_opencode_policy_inventory_changed')
          active = true; resolveReady()
        } else if (row.state === 'failed' || row.state === 'inactive' || row.state === 'rejected') fail()
        const { correlation: _nonce, ...publicRow } = row
        trace('native_policy', publicRow)
      } catch { fail() }
      return true
    },
    async ready() {
      let timer: ReturnType<typeof setTimeout> | undefined
      try { await Promise.race([ready, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('native_opencode_policy_active_missing')), 20_000) })]) }
      finally { clearTimeout(timer) }
      if (!active || failure || !tree || !server) throw failure ?? new Error('native_opencode_policy_inactive')
      const observation = tree.readObservation()
      if (observation.nativeCLI?.kind !== 'executable' || observation.nativeCLI.program.toLowerCase() !== input.executable.toLowerCase() || !observation.members.some(member => member.pid === server!.pid && member.creationTimeMs === server!.creationTimeMs)) throw new Error('native_opencode_policy_process_changed')
    },
    async verifySession(sessionId) {
      await verifyAccount()
      const db = new DatabaseSync(env.OPENCODE_DB, { readOnly: true })
      let row
      try { db.exec('PRAGMA query_only=ON'); row = z.object({ id: z.literal(sessionId), agent: z.literal('build'), directory: z.string(), model: z.string(), permission: z.string().nullable() }).parse(db.prepare('SELECT id,agent,directory,model,permission FROM session_v2 WHERE id=?').get(sessionId)) }
      finally { db.close() }
      if (session && session !== sessionId || !isDeepStrictEqual(JSON.parse(row.model), { id: 'deepseek-v4-pro', providerID: 'deepseek' })) throw new Error('native_opencode_session_selection_changed')
      if (row.permission !== null && z.array(z.object({ effect: z.literal('deny') })).parse(JSON.parse(row.permission)).some(rule => rule.effect !== 'deny')) throw new Error('native_opencode_session_permission_changed')
      if (!workingDirectory || (await realpath(row.directory)).toLowerCase() !== workingDirectory.toLowerCase()) throw new Error('native_opencode_session_directory_changed')
      session = sessionId
      assertNativeOpenCodeCurrent(snapshot)
    },
    trace
  }
}
