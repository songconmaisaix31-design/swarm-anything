import { appendFileSync, closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, type Stats } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import { join, toNamespacedPath } from 'node:path'
import { performance } from 'node:perf_hooks'
import { DatabaseSync } from 'node:sqlite'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { SwaOpenCodeToolsPolicy, SwaProviderJobLauncher } from '../../../third_party/orca-v1.4.230/src/main/provider-process/provider-process-launch'
import type { SwaProviderProcessTree } from '../../../third_party/orca-v1.4.230/src/main/provider-process/swa-provider-process-tree'
import { currentUserSid, createFileWithDacl } from '@orca/windows-security'
import type { AgentSessionRecord } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-record'
import { agentSessionRuntimeIncarnation } from '../../../third_party/orca-v1.4.230/src/main/runtime/agent-session-runtime-attribution'
import { assertNativeOpenCodeCurrent, openCodePlugins, openCodeTargets, openCodePolicyPluginId, readOpenCodeCredential, type NativeOpenCodeSnapshot } from './native-opencode-policy'
import { importPrivateOpenCodeCredential } from './native-opencode-import'
import { privateOpenCodeEnvironment, readPrivateOpenCodeInputKey, verifyPrivateOpenCodeAccount } from './private-opencode-account'
import { requireNativeCodexPrivatePath } from './native-codex-policy'
import { createPosixPrivateFile } from './private-posix-security'
import { structuredInputBindingSchema } from './contracts'
import { encodeOpenCodeInput, openCodeInputPayloadSchema, verifyOpenCodeInputReceipt, type OpenCodeInputPayload } from './opencode-policy-plugin'

const common = { type: z.literal('swa_opencode_policy'), correlation: z.string(), pid: z.number().int().positive(), root: z.string(), sequence: z.number().int().positive() }
const statusSchema = z.discriminatedUnion('state', [
  z.strictObject({ ...common, state: z.literal('active'), tools_count: z.literal(0), directory: z.string(), roots: z.record(z.string(), z.string()), plugins: z.array(z.strictObject({ id: z.string(), state: z.literal('active') })) }),
  z.strictObject({ ...common, state: z.literal('http_request'), session_id: z.string(), model: z.enum(['deepseek-v4-pro', 'step-3.5-flash']), tools_count: z.literal(0), initial_url: z.enum(['https://api.deepseek.com/chat/completions', 'https://api.stepfun.com/v1/chat/completions']), monotonic_ms: z.number().nonnegative() }),
  z.strictObject({ ...common, state: z.literal('http_response'), session_id: z.string(), status: z.number().int(), monotonic_ms: z.number().nonnegative() }),
  z.strictObject({ ...common, state: z.literal('retry_disabled'), session_id: z.string(), attempt: z.number().int() }),
  z.strictObject({ ...common, state: z.literal('rejected'), session_id: z.string(), code: z.literal('native_session_selection_changed') }),
  z.strictObject({ ...common, state: z.literal('failed'), code: z.string(), checking: z.string(), error_type: z.string(), issue_paths: z.array(z.string()) }),
  z.strictObject({ ...common, state: z.literal('inactive') })
])

export function createOpenCodeSessionPolicy(input: {
  snapshot: NativeOpenCodeSnapshot; root: string; plugin: string; correlation: string;
  executable: string; launcher: SwaProviderJobLauncher;
  sessionId: string; fence: number; runtimeEpoch: string;
  record(): AgentSessionRecord | undefined
  approve(): Promise<() => void>
  approveInitialization(): Promise<() => void>
  inputBinding(clientMessageId: string): z.infer<typeof structuredInputBindingSchema>
}): SwaOpenCodeToolsPolicy {
  const { snapshot, root, plugin, correlation, launcher } = input
  const env = privateOpenCodeEnvironment(root, process.env as Record<string, string>)
  const provider = snapshot.policy.account.provider, target = openCodeTargets[provider]
  const samePath = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
  const identity = (value: Stats) => `${value.dev}:${value.ino}:${value.birthtimeMs}`
  const tracePath = join(launcher.eventDirectory, 'provider-events.ndjson')
  let traceIdentity: string | undefined, processIdentity: Record<string, unknown> | undefined, nativeCLI: unknown, custodyRecorded = false, policyRecorded = false, stdoutComplete = false, closed = false
  let inputKey: Awaited<ReturnType<typeof readPrivateOpenCodeInputKey>> | undefined
  type Delivery = { binding: z.infer<typeof structuredInputBindingSchema>; payload?: OpenCodeInputPayload; state: 'prepared' | 'written' | 'unknown' | 'rejected'; accepted?: { message_id: string; seq: number } }
  const deliveries = new Map<string, Delivery>()
  let tree: SwaProviderProcessTree | undefined, active = false, failure: Error | undefined, sequence = 0, traceSequence = 0
  let server: ReturnType<SwaProviderProcessTree['requireOwnedExecutable']> | undefined, session: string | undefined, workingDirectory: string | undefined
  let resolveReady!: () => void, rejectReady!: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  void ready.catch(() => undefined)
  const fail = () => {
    active = false
    if (!failure) {
      failure = new Error('native_opencode_policy_status_invalid')
      try { if (custodyRecorded && !closed) trace('failure', { code: 'native_policy_unverifiable' }, true) } catch { /* 原失败不能被证据写入失败覆盖。 */ }
    }
    rejectReady(failure)
  }
  function checkRecord() {
    const record = input.record()
    if (!record || record.provider !== 'opencode' || record.sessionId !== input.sessionId || record.lease.runtimeFence !== input.fence || record.lease.ownerProcess?.runtime !== agentSessionRuntimeIncarnation() || processIdentity && record.lease.ownerProcess.pid !== processIdentity.pid) throw new Error('native_opencode_source_owner_changed')
    return record
  }
  function ensureCustody() {
    if (custodyRecorded) return
    if (!tree) throw new Error('native_opencode_custody_missing')
    const observed = tree.readObservation(), record = checkRecord()
    if (observed.platform === 'linux') {
      if (!observed.root || !observed.custodyAdmitted || observed.nativeState?.state !== 'created' || observed.root.pid !== record.lease.ownerProcess!.pid) throw new Error('native_opencode_custody_changed')
      processIdentity = { ...observed.root, runtime_id: record.lease.ownerProcess!.runtime }
    } else {
      if (!observed.assigned || observed.rootPid !== record.lease.ownerProcess!.pid || observed.rootCreationTimeMs !== record.lease.ownerProcess!.processStartTimeMs) throw new Error('native_opencode_custody_changed')
      processIdentity = { pid: observed.rootPid, creation_time_ms: observed.rootCreationTimeMs, runtime_id: record.lease.ownerProcess!.runtime }
    }
    if (observed.nativeCLI?.kind !== 'executable' || !samePath(observed.nativeCLI.program, input.executable)) throw new Error('native_opencode_executable_changed')
    nativeCLI = observed.nativeCLI; custodyRecorded = true
    trace('custody', observed)
  }
  function trace(event: string, detail: unknown, durable = false) {
    ensureCustody()
    checkRecord()
    requireNativeCodexPrivatePath(tracePath, false)
    const before = lstatSync(tracePath)
    if (!traceIdentity || identity(before) !== traceIdentity || !processIdentity || closed) throw new Error('native_opencode_trace_source_changed')
    const body = JSON.stringify({ protocol: 'acp', projection: 'actual_native_acp_frames_and_input_bindings', session_id: input.sessionId, runtime_fence: input.fence, runtime_epoch: input.runtimeEpoch, sequence: ++traceSequence, observed_at: new Date().toISOString(), monotonic_ms: performance.now(), event, process: processIdentity, native_cli: nativeCLI, detail }) + '\n'
    if (body.includes(snapshot.key) || inputKey && body.includes(inputKey.key) || before.size + Buffer.byteLength(body) > 12 * 1024 * 1024) throw new Error('native_opencode_trace_bound_or_credential_violation')
    const fd = openSync(tracePath, constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0))
    try {
      if (identity(fstatSync(fd)) !== traceIdentity) throw new Error('native_opencode_trace_source_changed')
      appendFileSync(fd, body, 'utf8')
      if (durable) fsyncSync(fd)
      if (identity(lstatSync(tracePath)) !== traceIdentity) throw new Error('native_opencode_trace_source_changed')
    } finally { closeSync(fd) }
  }
  async function verifyAccount() {
    await verifyPrivateOpenCodeAccount(snapshot, root, plugin, correlation)
    const info = await lstat(env.OPENCODE_DB)
    if (!info.isFile() || info.isSymbolicLink() || !samePath(await realpath(env.OPENCODE_DB), env.OPENCODE_DB)) throw new Error('native_opencode_private_database_redirected')
    const credential = readOpenCodeCredential(env.OPENCODE_DB, provider)
    if (credential.count !== 1 || credential.id !== snapshot.policy.account.credential_id || credential.key !== snapshot.key) throw new Error('native_opencode_private_credential_changed')
    const db = new DatabaseSync(env.OPENCODE_DB, { readOnly: true, allowExtension: false })
    try {
      db.exec('PRAGMA query_only=ON')
      if (db.prepare('SELECT count(*) AS count FROM credential').get()?.count !== 1 || db.prepare('SELECT active FROM credential WHERE id=?').get(credential.id)?.active !== 1) throw new Error('native_opencode_private_credential_changed')
    } finally { db.close() }
  }
  return {
    nativeContract: 'opencode-cli-2.0.31', model: target.model,
    async initialize(track, cwd) {
      workingDirectory = await realpath(cwd)
      await verifyPrivateOpenCodeAccount(snapshot, root, plugin, correlation, true)
      let exists = false
      try { const info = await lstat(env.OPENCODE_DB); if (!info.isFile() || info.isSymbolicLink()) throw new Error('native_opencode_private_database_redirected'); exists = true }
      catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error }
      if (exists) { await verifyAccount(); (await input.approve())() }
      else await importPrivateOpenCodeCredential({ snapshot, root, plugin, correlation, node: launcher.node, entry: launcher.entry, executable: input.executable, cwd, inherited: process.env as Record<string, string>, beforeInput: input.approveInitialization,
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
      inputKey = await readPrivateOpenCodeInputKey(root)
      requireNativeCodexPrivatePath(launcher.eventDirectory, true)
      if (process.platform === 'linux') createPosixPrivateFile(tracePath, Buffer.alloc(0))
      else createFileWithDacl(toNamespacedPath(tracePath), `O:${currentUserSid()}D:P${[...new Set([currentUserSid(), 'S-1-5-18'])].map(sid => `(A;;FA;;;${sid})`).join('')}`, Buffer.alloc(0))
      traceIdentity = identity(lstatSync(tracePath))
    },
    attach(value) { if (tree) throw new Error('native_opencode_policy_rebound'); tree = value },
    stderr(line, cut) {
      if (!line.startsWith('SWA_OPENCODE_POLICY ')) return true
      try {
        if (cut || !tree) throw new Error('native_opencode_policy_status_invalid')
        const row = statusSchema.parse(JSON.parse(line.slice('SWA_OPENCODE_POLICY '.length)))
        // inactive 只关闭已有状态，不作为退出或活体归属证明。
        const actualServer = row.state === 'inactive' && server ? server : tree.requireOwnedExecutable(row.pid, input.executable)
        if (row.correlation !== correlation || !samePath(row.root, root) || row.sequence !== sequence + 1 || row.pid !== actualServer.pid || server && !isDeepStrictEqual(server, actualServer)) throw new Error('native_opencode_policy_identity_changed')
        server = actualServer; sequence = row.sequence
        if (row.state === 'active') {
          const actual = row.plugins.map(item => item.id).sort(), expected = [...openCodePlugins(provider), openCodePolicyPluginId].sort()
          const roots = { home: env.HOME, data: env.XDG_DATA_HOME, cache: env.XDG_CACHE_HOME, config: env.XDG_CONFIG_HOME, state: env.XDG_STATE_HOME, programdata: env.ProgramData, temp: env.TEMP, database: env.OPENCODE_DB }
          if (failure || !isDeepStrictEqual(actual, expected) || !isDeepStrictEqual(row.roots, roots)) throw new Error('native_opencode_policy_inventory_changed')
          active = true; resolveReady()
        } else if (row.state === 'failed' || row.state === 'rejected') fail()
        else if (row.state === 'inactive') active = false
        else if (row.state === 'http_request' && (row.model !== target.model_id || row.initial_url !== target.initial_url || row.session_id !== session)) throw new Error('native_opencode_policy_target_changed')
        const { correlation: _nonce, ...publicRow } = row
        trace('native_policy', { server, identity_basis: row.state === 'inactive' ? 'previously_verified_identity' : 'live_process_observation', row: publicRow })
      } catch { fail() }
      return true
    },
    async ready() {
      let timer: ReturnType<typeof setTimeout> | undefined
      try { await Promise.race([ready, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('native_opencode_policy_active_missing')), 20_000) })]) }
      finally { clearTimeout(timer) }
      if (!active || failure || !tree || !server) throw failure ?? new Error('native_opencode_policy_inactive')
      if (!isDeepStrictEqual(server, tree.requireOwnedExecutable(server.pid, input.executable))) throw new Error('native_opencode_policy_process_changed')
      if (!policyRecorded) { trace('policy_ready', { native_contract: 'opencode-cli-2.0.31', provider, model: target.model, server }); policyRecorded = true }
    },
    async verifySession(sessionId) {
      await verifyAccount()
      const db = new DatabaseSync(env.OPENCODE_DB, { readOnly: true, allowExtension: false })
      let row
      try { db.exec('PRAGMA query_only=ON'); row = z.object({ id: z.literal(sessionId), agent: z.literal('build'), directory: z.string(), model: z.string(), permission: z.string().nullable() }).parse(db.prepare('SELECT id,agent,directory,model,permission FROM session_v2 WHERE id=?').get(sessionId)) }
      finally { db.close() }
      if (session && session !== sessionId || !isDeepStrictEqual(JSON.parse(row.model), { id: target.model_id, providerID: provider })) throw new Error('native_opencode_session_selection_changed')
      if (row.permission !== null && z.array(z.object({ effect: z.literal('deny') })).parse(JSON.parse(row.permission)).some(rule => rule.effect !== 'deny')) throw new Error('native_opencode_session_permission_changed')
      if (!workingDirectory || !samePath(await realpath(row.directory), workingDirectory)) throw new Error('native_opencode_session_directory_changed')
      session = sessionId
      assertNativeOpenCodeCurrent(snapshot)
    },
    async preparePrompt(clientMessageId, prompt, beforeSend) {
      if (!session || !inputKey || failure || !active || deliveries.has(clientMessageId)) throw new Error('native_opencode_input_unavailable')
      const binding = structuredInputBindingSchema.parse(input.inputBinding(clientMessageId))
      const blocks = z.array(z.strictObject({ type: z.literal('text'), text: z.string() })).min(1).parse(prompt)
      const body = z.object({ blocks: z.array(z.strictObject({ type: z.literal('text'), text: z.string() })).min(1) }).parse(binding.body)
      if (binding.operation_id !== clientMessageId || binding.session_id !== input.sessionId || binding.runtime_fence !== input.fence || binding.agent !== 'opencode' || !isDeepStrictEqual(blocks, body.blocks)) throw new Error('native_opencode_original_input_changed')
      const delivery: Delivery = { binding, state: 'prepared' }; deliveries.set(clientMessageId, delivery)
      return {
        prepareParams(id, params) {
          const request = z.strictObject({ sessionId: z.literal(session!), prompt: z.array(z.unknown()) }).parse(params)
          if (delivery.payload || !isDeepStrictEqual(request.prompt, blocks)) throw new Error('native_opencode_input_id_reused')
          const payload = openCodeInputPayloadSchema.parse({ version: 1, native_session_id: session, request_id: id, binding, blocks })
          delivery.payload = payload
          trace('write_intent', { binding, request_id: id, native_session_id: session }, true)
          return { sessionId: session, prompt: [{ type: 'text', text: encodeOpenCodeInput(payload, inputKey!.key) }] }
        },
        async beforeWrite() {
          await verifyAccount()
          const approval = await input.approve()
          if (!inputKey || !isDeepStrictEqual(inputKey, await readPrivateOpenCodeInputKey(root))) throw new Error('native_opencode_input_key_changed')
          return () => {
            if (failure || !active || !tree || !server || !delivery.payload || !isDeepStrictEqual(binding, input.inputBinding(clientMessageId)) || !isDeepStrictEqual(server, tree.requireOwnedExecutable(server.pid, input.executable))) throw new Error('native_opencode_input_admission_changed')
            checkRecord(); assertNativeOpenCodeCurrent(snapshot); approval(); beforeSend?.()
          }
        },
        onSettled(fact) {
          delivery.state = fact.outcome === 'resolved' && fact.writeAttempted && fact.cleanupCompleted ? 'written' : fact.writeAttempted ? 'unknown' : 'rejected'
          trace('write_settled', { operation_id: clientMessageId, request_id: delivery.payload?.request_id ?? null, ...fact }, true)
        }
      }
    },
    inputDisposition(clientMessageId) {
      const delivery = deliveries.get(clientMessageId)
      // openPrompt 早于实际请求分配；未登记绝不代表已经接受。
      if (!delivery || delivery.state === 'prepared' || delivery.state === 'unknown' || failure) return { state: 'unknown' }
      if (delivery.state === 'rejected') return { state: 'rejected' }
      if (!delivery.payload || !inputKey) return { state: 'unknown' }
      if (!delivery.accepted) {
        try {
          requireNativeCodexPrivatePath(env.OPENCODE_DB, false)
          const db = new DatabaseSync(env.OPENCODE_DB, { readOnly: true, allowExtension: false })
          let rows
          try {
            db.exec('PRAGMA query_only=ON; BEGIN')
            const bound = z.object({ count: z.number().int().nonnegative(), bytes: z.number().int().nonnegative().nullable() }).parse(db.prepare("SELECT count(*) AS count,sum(length(CAST(data AS BLOB))) AS bytes FROM session_message WHERE session_id=? AND type='user'").get(session!))
            if (bound.count > 100_000 || (bound.bytes ?? 0) > 12 * 1024 * 1024) throw new Error('native_opencode_user_inventory_exceeds_bound')
            rows = z.array(z.object({ id: z.string(), seq: z.number().int().positive(), data: z.string().max(1024 * 1024) })).parse(db.prepare("SELECT id,seq,data FROM session_message WHERE session_id=? AND type='user' AND json_extract(data,'$.metadata.swa_input.payload.binding.operation_id')=? LIMIT 2").all(session!, clientMessageId))
            db.exec('COMMIT')
          } finally { db.close() }
          if (!rows.length) return { state: 'unknown' }
          if (rows.length !== 1) throw new Error('native_opencode_user_ambiguous')
          const row = rows[0]!, data = z.object({ text: z.string(), metadata: z.object({ swa_input: z.unknown() }) }).parse(JSON.parse(row.data))
          const receipt = verifyOpenCodeInputReceipt(data.metadata.swa_input, inputKey.key)
          if (receipt.message_id !== row.id || !isDeepStrictEqual(receipt.payload, delivery.payload) || data.text !== delivery.payload.blocks.map(block => block.text).join('\n')) throw new Error('native_opencode_user_binding_changed')
          delivery.accepted = { message_id: row.id, seq: row.seq }
          trace('input_delivered', { binding: delivery.binding, request_id: delivery.payload.request_id, native_session_id: session, ...delivery.accepted }, true)
        } catch { fail(); return { state: 'unknown' } }
      }
      return { state: 'accepted', providerIdentity: { provider: 'orca', clientMessageId } }
    },
    record(frame, line) { trace('native_record', { frame, raw_line: line }) },
    protocolFailed: fail,
    stdoutEnded() { stdoutComplete = true; trace('stdout_end', { complete: true }) },
    closed() {
      if (closed) return
      const final = tree?.readFinalObservation()
      if (!stdoutComplete || !final || !processIdentity || !isDeepStrictEqual(final.platform === 'linux' ? final.observation.nativeCLI : final.nativeCLI, nativeCLI)) throw new Error('native_opencode_final_custody_unknown')
      trace('custody_closed', final, true); closed = true
    },
    trace(event, detail) { trace('projection', { event, detail }) }
  }
}
