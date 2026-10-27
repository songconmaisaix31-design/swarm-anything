import { appendFileSync, closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, type Stats } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { AgentSessionRecord } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-record'
import { activeProviderContext } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-provider-context'
import { claudeSessionIdForOrcaSession } from '../../../third_party/orca-v1.4.230/src/main/claude/claude-structured-session-id'
import type { ClaudeDispatchObservation, ClaudePolicyConnection, SwaClaudeToolsPolicy, SwaProviderJobLauncher } from '../../../third_party/orca-v1.4.230/src/main/provider-process/provider-process-launch'
import type { SwaProviderProcessTree } from '../../../third_party/orca-v1.4.230/src/main/provider-process/swa-provider-process-tree'
import { agentSessionRuntimeIncarnation } from '../../../third_party/orca-v1.4.230/src/main/runtime/agent-session-runtime-attribution'
import { getAppEnvironment, hasAppEnvironment } from '../../../third_party/orca-v1.4.230/src/shared/app-environment'
import { prependOrcaCliDirToChildPath } from '../../../third_party/orca-v1.4.230/src/main/cli/orca-cli-child-path'
import { assertNativeClaudeCurrent, nativeClaudeSdkOptions, type NativeClaudeSnapshot } from './native-claude-policy'
import { materializePrivateClaudeAccount, privateClaudeEnvironment, verifyPrivateClaudeAccount } from './private-claude-account'
import { createPrivateClaudeFile, requireNativeClaudePath } from './claude-file-security'
import { findPrivateClaudeTranscript } from './claude-session-result'

const maximum = 12 * 1024 * 1024
const object = z.record(z.string(), z.unknown())
const uuid = z.uuid()
const identity = (info: Stats) => `${info.dev}:${info.ino}:${info.birthtimeMs}`
const samePath = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
const sdkEnvironment = { CLAUDE_CODE_ENTRYPOINT: 'sdk-ts', CLAUDE_AGENT_SDK_VERSION: '0.3.284', CLAUDE_CODE_SDK_READS_SESSION_STATE: '1' }
const sealedEnvironment = new Set(['ORCA_AGENT_SESSION_ID', 'ORCA_AGENT_SESSION_SPAWN_TOKEN', 'ORCA_STRUCTURED_SESSION', 'ORCA_TERMINAL_HANDLE', 'ORCA_CLI_COMMAND', 'ORCA_USER_DATA_PATH', 'ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING'])

function disabledUsage(value: unknown) {
  if (value === undefined || value === null) return
  const usage = object.parse(value)
  if (usage.server_tool_use !== undefined && usage.server_tool_use !== null) z.strictObject({ web_search_requests: z.literal(0), web_fetch_requests: z.literal(0) }).parse(usage.server_tool_use)
}
function stopReason(value: unknown) {
  if (value !== undefined && value !== null && !['end_turn', 'max_tokens', 'stop_sequence', 'refusal'].includes(String(value))) throw new Error('native_claude_tool_stop_rejected')
}

export function validateClaudeExport(snapshot: NativeClaudeSnapshot, text: string): void {
  const escaped = JSON.stringify(snapshot.key).slice(1, -1)
  if (!snapshot.key || text.includes(snapshot.key) || text.includes(escaped)) throw new Error('native_claude_export_contains_credential')
}

/** DTO 只限制受限 lane 的实际 SDK 对象；不将缺失字段补成成功事实。 */
export function validateClaudeSdkMessage(message: Record<string, unknown>): void {
  uuid.parse(message.uuid)
  uuid.parse(message.session_id)
  if (message.parent_tool_use_id !== undefined && message.parent_tool_use_id !== null) throw new Error('native_claude_nested_tool_rejected')
  if (message.type === 'assistant' || message.type === 'user') {
    const envelope = object.parse(message.message)
    if (envelope.role !== message.type) throw new Error('native_claude_message_role_changed')
    if (message.isSynthetic === true || message.tool_use_result !== undefined) throw new Error('native_claude_synthetic_input_rejected')
    if (message.type === 'assistant' && envelope.model !== 'claude-opus-5') throw new Error('native_claude_message_model_changed')
    if (typeof envelope.content !== 'string') {
      for (const block of z.array(object).parse(envelope.content)) {
        if (!['text', 'thinking', 'redacted_thinking'].includes(String(block.type)) || message.type === 'user' && block.type !== 'text') throw new Error('native_claude_tool_block_rejected')
      }
    } else if (message.type !== 'user') throw new Error('native_claude_assistant_content_invalid')
    disabledUsage(envelope.usage)
    stopReason(envelope.stop_reason)
    return
  }
  if (message.type === 'stream_event') {
    const event = object.parse(message.event)
    if (!['message_start', 'message_delta', 'message_stop', 'content_block_start', 'content_block_delta', 'content_block_stop'].includes(String(event.type))) throw new Error('native_claude_stream_event_unreviewed')
    if (event.type === 'content_block_start' && !['text', 'thinking', 'redacted_thinking'].includes(String(object.parse(event.content_block).type))) throw new Error('native_claude_tool_block_rejected')
    if (event.type === 'content_block_delta' && !['text_delta', 'thinking_delta', 'signature_delta'].includes(String(object.parse(event.delta).type))) throw new Error('native_claude_tool_delta_rejected')
    if (event.type === 'message_start') {
      const native = object.parse(event.message)
      if (native.role !== 'assistant' || native.model !== 'claude-opus-5' || z.array(object).parse(native.content).length) throw new Error('native_claude_stream_identity_changed')
      disabledUsage(native.usage)
    }
    if (event.type === 'message_delta') stopReason(object.parse(event.delta).stop_reason)
    disabledUsage(event.usage)
    return
  }
  if (message.type === 'system' && message.subtype === 'init') {
    if (message.claude_code_version !== '2.1.284' || message.model !== 'claude-opus-5' || message.apiKeySource !== 'ANTHROPIC_API_KEY' || message.permissionMode !== 'dontAsk') throw new Error('native_claude_init_identity_changed')
    for (const key of ['tools', 'mcp_servers', 'skills', 'plugins', 'slash_commands']) if (z.array(z.unknown()).parse(message[key]).length) throw new Error('native_claude_init_capability_present')
    if (message.agents !== undefined && z.array(z.unknown()).parse(message.agents).length || message.plugin_errors !== undefined && z.array(z.unknown()).parse(message.plugin_errors).length) throw new Error('native_claude_init_capability_present')
    return
  }
  if (message.type === 'system' && message.subtype === 'status') {
    if (message.permissionMode !== undefined && message.permissionMode !== 'dontAsk' || ![null, 'compacting', 'requesting'].includes(message.status as null | string)) throw new Error('native_claude_status_unreviewed')
    return
  }
  if (message.type === 'system' && message.subtype === 'session_state_changed') {
    if (message.state !== 'idle' && message.state !== 'running') throw new Error('native_claude_action_required')
    return
  }
  if (message.type === 'system' && message.subtype === 'thinking_tokens') {
    z.number().nonnegative().finite().parse(message.estimated_tokens)
    z.number().nonnegative().finite().parse(message.estimated_tokens_delta)
    return
  }
  if (message.type === 'system' && message.subtype === 'api_retry') {
    for (const key of ['attempt', 'max_retries', 'retry_delay_ms']) z.number().int().nonnegative().parse(message[key])
    z.number().int().nullable().parse(message.error_status)
    z.string().parse(message.error)
    return
  }
  if (message.type === 'result') {
    if (!['success', 'error_during_execution', 'error_max_turns', 'error_max_budget_usd', 'error_max_structured_output_retries'].includes(String(message.subtype)) || typeof message.is_error !== 'boolean') throw new Error('native_claude_result_unreviewed')
    if (message.permission_denials !== undefined && z.array(z.unknown()).parse(message.permission_denials).length || message.local_command !== undefined) throw new Error('native_claude_result_tool_rejected')
    disabledUsage(message.usage)
    stopReason(message.stop_reason)
    return
  }
  throw new Error('native_claude_sdk_message_unreviewed')
}

export function createClaudeSessionPolicy(input: {
  snapshot: NativeClaudeSnapshot; sessionId: string; fence: number; runtimeEpoch: string; launcher: SwaProviderJobLauncher
  record(): AgentSessionRecord | undefined
  approve(): Promise<() => void>
}): SwaClaudeToolsPolicy {
  const { snapshot, sessionId } = input
  const tracePath = join(input.launcher.eventDirectory, 'provider-events.ndjson')
  let failure: Error | undefined, tree: SwaProviderProcessTree | undefined, sequence = 0
  let traceIdentity: string | undefined, cwd: string | undefined, nativeId: string | undefined
  let processIdentity: Record<string, unknown> | undefined, nativeCLI: unknown, ready = false, closed = false, inputHandedOff = false
  let metadataSignature: string | undefined
  let startupAdmission: (() => void) | undefined
  let transcriptAdmission: (() => void) | undefined
  function fail(code: string): never { failure ??= new Error(`native_claude_${code}`); throw failure }
  function checkRecord(owner: boolean) {
    if (failure) throw failure
    const record = input.record()
    const accountHome = record?.accountHome
    if (!record || record.provider !== 'claude' || record.sessionId !== sessionId || record.lease.runtimeFence !== input.fence || !accountHome || !('variable' in accountHome) || accountHome.variable !== 'CLAUDE_CONFIG_DIR' || !samePath(accountHome.path, join(snapshot.policy.account.private_root, sessionId, 'config'))) fail('source_record_changed')
    if (owner && (!record.lease.ownerProcess || record.lease.ownerProcess.runtime !== agentSessionRuntimeIncarnation() || processIdentity && record.lease.ownerProcess.pid !== processIdentity.pid)) fail('source_owner_changed')
    return record
  }
  function nativeContext(record: AgentSessionRecord) {
    const active = activeProviderContext(record)
    if (active.head && active.head.handle.transport !== 'claude-sdk') fail('provider_context_changed')
    const id = active.head?.handle.nativeId ?? claudeSessionIdForOrcaSession(sessionId, active.pendingClear ? record.providerContextBoundary?.operationId : undefined)
    uuid.parse(id)
    return { id, signature: JSON.stringify({ head: active.head?.handle ?? null, boundary: record.providerContextBoundary ?? null }) }
  }
  function observeCustody() {
    if (!tree) fail('custody_missing')
    const actual = tree.readObservation(), record = checkRecord(true)
    if (actual.platform === 'linux') {
      if (!actual.root || !actual.custodyAdmitted || actual.nativeState?.state !== 'created' || actual.root.pid !== record.lease.ownerProcess!.pid) fail('custody_identity_changed')
      processIdentity = { ...actual.root, runtime_id: record.lease.ownerProcess!.runtime! }
    } else {
      if (!actual.assigned || actual.rootPid !== record.lease.ownerProcess!.pid || actual.rootCreationTimeMs !== record.lease.ownerProcess!.processStartTimeMs || !actual.nativeCLI) fail('custody_identity_changed')
      processIdentity = { pid: actual.rootPid, creation_time_ms: actual.rootCreationTimeMs, runtime_id: record.lease.ownerProcess!.runtime! }
    }
    nativeCLI = actual.nativeCLI
    const native = object.parse(nativeCLI)
    if (native.kind !== 'executable' || typeof native.program !== 'string' || !samePath(native.program, snapshot.executable)) fail('native_executable_changed')
    return actual
  }
  function trace(event: string, detail: unknown, durable = false, observedAt = new Date().toISOString(), monotonic = performance.now()) {
    try {
      checkRecord(true)
      requireNativeClaudePath(tracePath, { directory: false, private: true })
      const before = lstatSync(tracePath)
      if (!processIdentity || identity(before) !== traceIdentity) fail('trace_source_changed')
      const line = JSON.stringify({ protocol: 'claude-agent-sdk', projection: 'actual_sdk_messages', session_id: sessionId, runtime_fence: input.fence, runtime_epoch: input.runtimeEpoch, sequence: ++sequence, observed_at: observedAt, monotonic_ms: monotonic, event, process: processIdentity, native_cli: nativeCLI, detail }) + '\n'
      validateClaudeExport(snapshot, line)
      if (before.size + Buffer.byteLength(line) > maximum) fail('trace_exceeds_bound')
      const fd = openSync(tracePath, constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0))
      try {
        if (identity(fstatSync(fd)) !== traceIdentity) fail('trace_source_changed')
        appendFileSync(fd, line, 'utf8')
        if (durable) fsyncSync(fd)
        if (identity(lstatSync(tracePath)) !== traceIdentity) fail('trace_source_changed')
      } finally { closeSync(fd) }
    } catch { fail('trace_unavailable') }
  }
  async function verify(connection: ClaudePolicyConnection) {
    try {
      if (failure || closed) fail('policy_unavailable')
      const finalAdmission = await input.approve()
      assertNativeClaudeCurrent(snapshot)
      await verifyPrivateClaudeAccount(snapshot, sessionId)
      checkRecord(true)
      const initialization = object.parse(await connection.initializationResult())
      const account = object.parse(initialization.account)
      if (account.apiKeySource !== 'ANTHROPIC_API_KEY' || account.apiProvider !== 'firstParty' || account.tokenSource !== undefined && account.tokenSource !== 'none') fail('api_account_unverified')
      if (z.array(z.unknown()).parse(initialization.agents).length || z.array(z.unknown()).parse(initialization.commands).length) fail('native_capability_present')
      z.array(object).parse(initialization.models)
      const settings = object.parse(await connection.getSettings())
      if (settings.errors !== undefined && z.array(z.unknown()).parse(settings.errors).length) fail('native_settings_unverified')
      const expected = nativeClaudeSdkOptions({ nativeId: nativeId!, resume: false }).settings
      const effective = object.parse(settings.effective)
      for (const [key, value] of Object.entries(expected!)) if (!isDeepStrictEqual(effective[key], value)) fail('effective_configuration_changed')
      const sources = z.array(z.strictObject({ source: z.literal('flagSettings'), settings: object })).parse(settings.sources)
      if (sources.length !== 1 || !isDeepStrictEqual(sources[0]!.settings, expected)) fail('configuration_source_changed')
      const hooks = object.parse(await connection.getHooksListing())
      for (const key of ['hooks', 'events']) if (z.array(z.unknown()).parse(hooks[key]).length) fail('native_hooks_present')
      if (hooks.errors !== undefined && z.array(z.unknown()).parse(hooks.errors).length) fail('native_hooks_unverified')
      if (object.parse(hooks.policy).allDisabled !== true || hooks.safeMode !== undefined) fail('hook_policy_changed')
      if (z.array(z.unknown()).parse(await connection.mcpServerStatus()).length) fail('native_mcp_present')
      const signature = JSON.stringify({ settings, hooks })
      if (metadataSignature !== undefined && signature !== metadataSignature) fail('effective_source_changed')
      metadataSignature = signature
      assertNativeClaudeCurrent(snapshot)
      checkRecord(true)
      finalAdmission()
    } catch { fail('policy_verification_failed') }
  }
  return {
    nativeContract: 'claude-cli-2.1.284-sdk-0.3.284', model: 'claude-opus-5', launcher: input.launcher,
    reject(reason) { return fail(reason) },
    async resolveTranscript(requestedNativeId) {
      try {
        const firstAdmission = await input.approve()
        assertNativeClaudeCurrent(snapshot)
        const context = nativeContext(checkRecord(false))
        if (requestedNativeId !== context.id) fail('transcript_native_identity_changed')
        await verifyPrivateClaudeAccount(snapshot, sessionId)
        firstAdmission()
        const inventory = await findPrivateClaudeTranscript(join(snapshot.policy.account.private_root, sessionId, 'config'), requestedNativeId)
        await verifyPrivateClaudeAccount(snapshot, sessionId)
        const finalAdmission = await input.approve()
        assertNativeClaudeCurrent(snapshot)
        if (!isDeepStrictEqual(nativeContext(checkRecord(false)), context)) fail('transcript_context_changed')
        inventory.verify()
        finalAdmission()
        transcriptAdmission = inventory.verify
        return inventory.path
      } catch { fail('transcript_source_unavailable') }
    },
    async initialize(directory) {
      try {
        const finalAdmission = await input.approve()
        assertNativeClaudeCurrent(snapshot)
        if (!transcriptAdmission) fail('transcript_source_unverified')
        const verifyTranscript = transcriptAdmission
        verifyTranscript()
        cwd = await realpath(directory)
        const context = nativeContext(checkRecord(false))
        nativeId = context.id
        await materializePrivateClaudeAccount(snapshot, sessionId)
        requireNativeClaudePath(input.launcher.eventDirectory, { directory: true, private: true })
        finalAdmission()
        assertNativeClaudeCurrent(snapshot)
        createPrivateClaudeFile(tracePath, Buffer.alloc(0))
        traceIdentity = identity(lstatSync(tracePath))
        startupAdmission = () => {
          finalAdmission(); assertNativeClaudeCurrent(snapshot)
          if (!isDeepStrictEqual(nativeContext(checkRecord(false)), context)) fail('startup_context_changed')
          verifyTranscript()
        }
        startupAdmission()
        return startupAdmission
      } catch { fail('initialization_unavailable') }
    },
    assertSpawn(options) {
      try {
        if (failure || !cwd || !nativeId || !traceIdentity || !startupAdmission || closed) fail('spawn_not_initialized')
        startupAdmission()
        assertNativeClaudeCurrent(snapshot)
        if (!samePath(options.command, snapshot.executable) || options.cwd !== cwd) fail('spawn_source_changed')
        const resumed = options.args.includes(`--resume=${nativeId}`)
        const settings = nativeClaudeSdkOptions({ nativeId, resume: resumed }).settings
        const expected = ['--output-format', 'stream-json', '--verbose', '--input-format', 'stream-json', '--model', 'claude-opus-5', '--permission-prompt-tool', 'stdio', '--permission-prompts', 'none', ...(resumed ? [`--resume=${nativeId}`] : []), '--tools', '', '--setting-sources=', '--strict-mcp-config', '--permission-mode', 'dontAsk', '--include-partial-messages', ...(!resumed ? [`--session-id=${nativeId}`] : []), '--bare', '--disable-slash-commands', '--replay-user-messages', '--no-chrome', '--settings', JSON.stringify(settings)]
        if (!isDeepStrictEqual(options.args, expected)) fail('spawn_arguments_changed')
        const expectedEnv: Record<string, string> = { ...privateClaudeEnvironment(snapshot, sessionId), ...sdkEnvironment }
        const hostLauncher = join(snapshot.roots.install, process.platform === 'win32' ? 'swa.exe' : 'swa')
        if (!hasAppEnvironment()) fail('host_environment_unavailable')
        const app = getAppEnvironment()
        if (!app.isPackaged() || app.getCliLauncherPath?.() !== hostLauncher || app.getPath('userData') !== snapshot.roots.data || !expectedEnv.PATH) fail('host_environment_changed')
        // 已证明实际 headless launcher 分支后复用原封装；此分支不会创建普通 desktop shim。
        prependOrcaCliDirToChildPath(expectedEnv, { isPackaged: true, userDataPath: snapshot.roots.data })
        for (const name of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) expectedEnv[name] = ''
        for (const [key, value] of Object.entries(expectedEnv)) if (options.env[key] !== value) fail('spawn_environment_changed')
        for (const [key, value] of Object.entries(options.env)) {
          if (Object.hasOwn(expectedEnv, key)) continue
          if (!sealedEnvironment.has(key) || typeof value !== 'string' || /[\0\r\n]/.test(value)) fail('spawn_environment_unapproved')
        }
        if (options.env.ORCA_AGENT_SESSION_ID !== sessionId || options.env.ORCA_STRUCTURED_SESSION !== '1' || !options.env.ORCA_AGENT_SESSION_SPAWN_TOKEN) fail('spawn_identity_changed')
        if (options.signal?.aborted) fail('spawn_cancelled')
        checkRecord(false)
        startupAdmission()
      } catch { fail('spawn_policy_failed') }
    },
    attach(value) { if (failure || tree) fail('custody_rebound'); tree = value },
    async ready(connection) {
      try {
        const observed = observeCustody()
        trace('custody', observed)
        await verify(connection)
        trace('policy_ready', { native_contract: 'claude-cli-2.1.284-sdk-0.3.284', model: 'claude-opus-5', provider: 'anthropic', tools: 'disabled' }, true)
        ready = true
      } catch { fail('readiness_unavailable') }
    },
    verifyCurrent: verify,
    assertCurrent() {
      if (failure || !ready || closed || !metadataSignature) fail('policy_unavailable')
      assertNativeClaudeCurrent(snapshot)
      checkRecord(true)
    },
    record(message) {
      const observedAt = new Date().toISOString(), monotonic = performance.now()
      try {
        if (failure || closed) fail('policy_unavailable')
        // 当前固定源没有已审安全 startup yielded DTO，不能把模型或用户帧暂存成合法启动事件。
        if (!processIdentity) fail('startup_sdk_message_unreviewed')
        if (!ready || !inputHandedOff) fail('sdk_message_before_input')
        validateClaudeSdkMessage(message)
        if (message.session_id !== nativeId) fail('native_session_changed')
        const text = JSON.stringify(message)
        validateClaudeExport(snapshot, text)
        trace('sdk_message', message, false, observedAt, monotonic)
      } catch { fail('sdk_message_unavailable') }
    },
    recordDispatch(observed: ClaudeDispatchObservation) {
      try {
        if (!ready || failure || closed || observed.providerSessionId !== nativeId || !observed.clientMessageId) fail('dispatch_source_changed')
        uuid.parse(observed.sentUuid)
        if (observed.phase === 'user-replay') uuid.parse(observed.providerInputUuid)
        trace('dispatch_binding', observed, true)
        if (observed.phase === 'handoff') inputHandedOff = true
      } catch { fail('dispatch_binding_unavailable') }
    },
    closed() {
      if (failure || !tree || !processIdentity || closed) fail('final_custody_unknown')
      const final = tree.readFinalObservation()
      if (!final) fail('final_custody_unknown')
      const root = final.platform === 'linux' ? final.observation.root : final.root
      if (!root || (final.platform === 'linux' ? !isDeepStrictEqual({ ...root, runtime_id: agentSessionRuntimeIncarnation() }, processIdentity) || !isDeepStrictEqual(final.observation.nativeCLI, nativeCLI) : final.root.pid !== processIdentity.pid || final.root.creationTimeMs !== processIdentity.creation_time_ms || !isDeepStrictEqual(final.nativeCLI, nativeCLI))) fail('final_custody_changed')
      trace('custody_closed', final, true)
      closed = true
    }
  }
}
