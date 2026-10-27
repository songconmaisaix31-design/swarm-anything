import { appendFileSync, closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, type Stats } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, toNamespacedPath } from 'node:path'
import { performance } from 'node:perf_hooks'
import { isDeepStrictEqual } from 'node:util'
import { currentUserSid, createFileWithDacl } from '@orca/windows-security'
import { z } from 'zod'
import type { AgentSessionRecord } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-record'
import type { CodexPolicyConnection, SwaCodexToolsPolicy, SwaProviderJobLauncher } from '../../../third_party/orca-v1.4.230/src/main/provider-process/provider-process-launch'
import type { SwaProviderProcessTree } from '../../../third_party/orca-v1.4.230/src/main/provider-process/swa-provider-process-tree'
import { agentSessionRuntimeIncarnation } from '../../../third_party/orca-v1.4.230/src/main/runtime/agent-session-runtime-attribution'
import { assertNativeCodexCurrent, codexDisabledFeatures, nativeCodexAppServerArgs, nativeCodexConfiguration, requireNativeCodexPrivatePath, type NativeCodexSnapshot } from './native-codex-policy'
import { provisionPrivateCodexAccount, verifyPrivateCodexAccount } from './private-codex-account'
import { nativeConfigurationSource } from './native-pi-policy'
import { createPosixPrivateFile } from './private-posix-security'

const maximum = 12 * 1024 * 1024
const object = z.record(z.string(), z.unknown())
const valueAt = (value: unknown, path: string): unknown => path.split('.').reduce<unknown>((current, part) => object.safeParse(current).success ? (current as Record<string, unknown>)[part] : undefined, value)
const samePath = (left: string, right: string) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
const identity = (value: Stats) => `${value.dev}:${value.ino}:${value.birthtimeMs}`
const notifications = new Set(['thread/started', 'thread/status/changed', 'thread/name/updated', 'thread/tokenUsage/updated', 'turn/started', 'turn/completed', 'item/started', 'item/completed', 'item/agentMessage/delta', 'item/reasoning/textDelta', 'item/reasoning/summaryTextDelta', 'item/reasoning/summaryPartAdded', 'rawResponseItem/completed'])
const itemTypes = new Set(['userMessage', 'agentMessage', 'reasoning'])
const unsubmittedSteer = z.strictObject({ id: z.number().int().positive(), error: z.strictObject({ code: z.literal(-32600), message: z.literal('no active turn to steer'), data: z.null().optional() }) })
const notificationEnvelope = z.strictObject({ method: z.string(), params: object, emittedAtMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) })
const disabledRemoteControl = notificationEnvelope.extend({ method: z.literal('remoteControl/status/changed'), params: z.strictObject({ status: z.literal('disabled'), serverName: z.string(), installationId: z.string(), environmentId: z.null().optional() }) })
const nullRequirements = ['modelProvider', 'modelProviders', 'cliAuthCredentialsStore', 'chatgptBaseUrl', 'additionalDeveloperInstructions', 'allowedApprovalPolicies', 'allowedApprovalsReviewers', 'allowedSandboxModes', 'allowedWindowsSandboxImplementations', 'allowedPermissionProfiles', 'defaultPermissions', 'allowedWebSearchModes', 'allowManagedHooksOnly', 'allowBrowserAndComputerUse', 'allowAppshots', 'allowRemoteControl', 'computerUse', 'browserUse', 'inAppBrowser', 'featureRequirements', 'hooks', 'enforceResidency', 'network', 'application', 'autoReview', 'models', 'sqliteHome', 'logDir', 'modelCatalogJson', 'checkForUpdateOnStartup', 'allowLoginShell', 'feedback'] as const
const apiRequirements = z.strictObject({ allowedLoginMethods: z.tuple([z.literal('api')]), ...Object.fromEntries(nullRequirements.map(key => [key, z.null().optional()])) })

export function isApiOnlyCodexRequirements(value: unknown) { return apiRequirements.safeParse(value).success }
export function isDisabledCodexRemoteControl(value: unknown) { return disabledRemoteControl.safeParse(value).success }

export function isCodexSteerNotSubmitted(parsed: Record<string, unknown>, responseMethod?: string) {
  return responseMethod === 'turn/steer' && unsubmittedSteer.safeParse(parsed).success
}

export function validateCodexExport(snapshot: NativeCodexSnapshot, serialized: string) {
  const escaped = JSON.stringify(snapshot.key).slice(1, -1)
  if (serialized.includes(snapshot.key) || serialized.includes(escaped)) throw new Error('native_codex_export_contains_credential')
}

export function createCodexSessionPolicy(input: {
  snapshot: NativeCodexSnapshot
  sessionId: string
  fence: number
  runtimeEpoch: string
  launcher: SwaProviderJobLauncher
  record(): AgentSessionRecord | undefined
  approveInitialization(): Promise<() => void>
}): SwaCodexToolsPolicy {
  const { snapshot, sessionId } = input
  const privateHome = join(snapshot.policy.account.private_root, sessionId)
  const tracePath = join(input.launcher.eventDirectory, 'provider-events.ndjson')
  const configuration = nativeCodexConfiguration({ privateHome, catalogPath: snapshot.policy.account.catalog_source.path })
  let tree: SwaProviderProcessTree | undefined, failure: Error | undefined, sequence = 0, traceIdentity: string | undefined
  let processIdentity: Record<string, unknown> | undefined, nativeCLI: unknown, threadId: string | undefined, cwd: string | undefined
  let privateSource: Awaited<ReturnType<typeof nativeConfigurationSource>> | undefined
  let configurationSignature: string | undefined, sourceFiles: Awaited<ReturnType<typeof nativeConfigurationSource>>[] = []
  let absentSources: string[] = []
  let remoteControlDisabledObserved = false
  const activeTurns = new Set<string>()
  function fail(code: string): never { failure ??= new Error(`native_codex_${code}`); throw failure }
  function checkRecord() {
    if (failure) throw failure
    const record = input.record()
    if (!record || record.provider !== 'codex' || record.sessionId !== sessionId || record.lease.runtimeFence !== input.fence || record.lease.ownerProcess?.runtime !== agentSessionRuntimeIncarnation() || !record.lease.ownerProcess || processIdentity && record.lease.ownerProcess.pid !== processIdentity.pid) fail('source_owner_changed')
    return record
  }
  function observeCustody() {
    if (!tree) fail('custody_missing')
    const observed = tree.readObservation(), record = checkRecord()
    if (observed.platform === 'linux') {
      if (!observed.root || !observed.custodyAdmitted || observed.nativeState?.state !== 'created' || observed.root.pid !== record.lease.ownerProcess!.pid) fail('custody_identity_changed')
      processIdentity = { ...observed.root, runtime_id: record.lease.ownerProcess!.runtime! }
    } else {
      if (!observed.assigned || observed.rootPid !== record.lease.ownerProcess!.pid || observed.rootCreationTimeMs !== record.lease.ownerProcess!.processStartTimeMs || !observed.nativeCLI) fail('custody_identity_changed')
      processIdentity = { pid: observed.rootPid, creation_time_ms: observed.rootCreationTimeMs, runtime_id: record.lease.ownerProcess!.runtime! }
    }
    nativeCLI = observed.nativeCLI
    const native = object.parse(nativeCLI)
    if (native.kind === 'executable' ? typeof native.program !== 'string' || !samePath(native.program, snapshot.executable) : native.kind !== 'node-script' || typeof native.entry !== 'string' || !samePath(native.entry, snapshot.executable)) fail('native_executable_changed')
    return observed
  }
  function trace(event: string, detail: unknown, durable = false) {
    try {
      checkRecord()
      requireNativeCodexPrivatePath(tracePath, false)
      const before = lstatSync(tracePath)
      if (identity(before) !== traceIdentity || !processIdentity) fail('trace_source_changed')
      const line = JSON.stringify({ protocol: 'codex-app-server', projection: 'actual_native_app_server_frames', session_id: sessionId, runtime_fence: input.fence, runtime_epoch: input.runtimeEpoch, sequence: ++sequence, observed_at: new Date().toISOString(), monotonic_ms: performance.now(), event, process: processIdentity, native_cli: nativeCLI, detail }) + '\n'
      validateCodexExport(snapshot, line)
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
  async function verifyConfiguration(connection: CodexPolicyConnection) {
    if (failure) throw failure
    assertNativeCodexCurrent(snapshot)
    const actualPrivate = await verifyPrivateCodexAccount(snapshot, sessionId)
    if (privateSource && !isDeepStrictEqual(privateSource, actualPrivate)) fail('private_account_changed')
    privateSource = actualPrivate
    const effective = object.parse(await connection.request('config/read', { includeLayers: true, cwd }))
    const config = object.parse(effective.config), origins = object.parse(effective.origins)
    const layers = z.array(z.looseObject({ name: object, version: z.string(), config: object, disabledReason: z.string().nullish() })).parse(effective.layers)
    const modelOrigin = object.parse(origins.model)
    if (object.parse(modelOrigin.name).type !== 'sessionFlags') fail('configuration_origin_changed')
    const sessionFlags = layers.find(row => row.name.type === 'sessionFlags' && row.version === modelOrigin.version && !row.disabledReason)
    if (!sessionFlags) fail('configuration_origin_changed')
    for (const [key, expected] of Object.entries(configuration)) {
      const originKey = ['features.code_mode', 'features.multi_agent_v2', 'features.sleep_tool'].includes(key) ? `${key}.enabled` : key
      if (key !== 'notify') {
        const origin = object.parse(origins[originKey])
        if (object.parse(origin.name).type !== 'sessionFlags' || origin.version !== sessionFlags.version) fail('configuration_origin_changed')
      }
      if (!isDeepStrictEqual(valueAt(sessionFlags.config, key), expected)) fail('configuration_origin_changed')
      if (!['tools.update_plan.enabled', 'tools.experimental_request_user_input.enabled'].includes(key) && !isDeepStrictEqual(valueAt(config, key), expected)) fail('effective_configuration_changed')
    }
    for (const key of ['instructions', 'developer_instructions', 'compact_prompt']) if (config[key] !== undefined && config[key] !== null) fail('instructions_not_disabled')
    if (Object.keys(object.parse(config.mcp_servers ?? {})).length || Object.keys(object.parse(config.model_providers ?? {})).length) fail('external_capability_present')
    const sources = [], absent = []
    for (const layer of layers) {
      if (layer.disabledReason || layer.name.type === 'sessionFlags') continue
      if (Object.keys(layer.config).length && (layer.name.type !== 'system' || Object.keys(layer.config).some(key => !['plugins', 'marketplaces'].includes(key)))) fail('configuration_layer_unreviewed')
      if (!['system', 'user', 'project', 'packagedDefaults'].includes(String(layer.name.type))) fail('configuration_layer_unreviewed')
      const path = layer.name.type === 'project' ? typeof layer.name.dotCodexFolder === 'string' && isAbsolute(layer.name.dotCodexFolder) ? join(layer.name.dotCodexFolder, 'config.toml') : undefined : layer.name.file
      if (typeof path !== 'string' || !isAbsolute(path)) fail('configuration_source_unknown')
      try { const source = await nativeConfigurationSource(path); if (!samePath(source.path, path)) fail('configuration_source_redirected'); sources.push(source) }
      catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; absent.push(path) }
    }
    const repeated = await connection.request('config/read', { includeLayers: true, cwd })
    if (!isDeepStrictEqual(effective, repeated)) fail('configuration_changed_during_snapshot')
    for (const source of sources) if (!isDeepStrictEqual(source, await nativeConfigurationSource(source.path))) fail('configuration_changed_during_snapshot')
    for (const path of absent) {
      try { lstatSync(path) } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue; throw error }
      fail('configuration_source_appeared')
    }
    const requirements = object.parse(await connection.request('configRequirements/read', {}))
    if (!isApiOnlyCodexRequirements(requirements.requirements)) fail('managed_requirements_unreviewed')
    async function pages(method: string, extra: Record<string, unknown> = {}) {
      const all: Record<string, unknown>[] = [], cursors = new Set<string>()
      let cursor: string | null = null
      let pageCount = 0
      do {
        if (++pageCount > 100) fail('native_inventory_incomplete')
        const page = z.looseObject({ data: z.array(object).max(100), nextCursor: z.string().min(1).nullable() }).parse(await connection.request(method, { ...extra, cursor, limit: 100 }))
        if (all.length + page.data.length > 10_000 || page.nextCursor !== null && (page.data.length === 0 || cursors.has(page.nextCursor))) fail('native_inventory_incomplete')
        all.push(...page.data)
        cursor = page.nextCursor
        if (cursor !== null) cursors.add(cursor)
      } while (cursor !== null)
      return all
    }
    const features = await pages('experimentalFeature/list')
    for (const name of codexDisabledFeatures) if (features.filter(row => row.name === name && row.enabled === false).length !== 1) fail('native_feature_changed')
    if (features.filter(row => row.name === 'skip_host_skill_discovery' && row.enabled === true).length !== 1) fail('native_skill_discovery_enabled')
    if ((await pages('model/list', { includeHidden: true })).filter(row => row.model === 'gpt-5.5').length !== 1) fail('native_model_unavailable')
    const account = object.parse(await connection.request('account/read', { refreshToken: false }))
    if (!z.object({ type: z.literal('apiKey') }).safeParse(account.account).success) fail('native_api_account_unavailable')
    if (!remoteControlDisabledObserved) fail('remote_control_state_unobserved')
    const signature = JSON.stringify({ effective, sources, absent, features })
    if (configurationSignature && configurationSignature !== signature) fail('effective_source_changed')
    configurationSignature = signature
    sourceFiles = sources
    absentSources = absent
    assertNativeCodexCurrent(snapshot)
  }
  async function verify(connection: CodexPolicyConnection) {
    try { await verifyConfiguration(connection) } catch { fail('policy_verification_failed') }
  }
  return {
    nativeContract: 'codex-cli-0.163.0', model: 'gpt-5.5', appServerArgs: nativeCodexAppServerArgs({ privateHome, catalogPath: snapshot.policy.account.catalog_source.path }),
    async initialize(track, directory) {
      cwd = await realpath(directory)
      await provisionPrivateCodexAccount({ snapshot, sessionId, cwd, launcher: input.launcher, track, beforeInput: input.approveInitialization })
      requireNativeCodexPrivatePath(input.launcher.eventDirectory, true)
      if (process.platform === 'linux') createPosixPrivateFile(tracePath, Buffer.alloc(0))
      else createFileWithDacl(toNamespacedPath(tracePath), `O:${currentUserSid()}D:P${[...new Set([currentUserSid(), 'S-1-5-18'])].map(sid => `(A;;FA;;;${sid})`).join('')}`, Buffer.alloc(0))
      traceIdentity = identity(lstatSync(tracePath))
    },
    attach(value) { if (tree) fail('custody_rebound'); tree = value },
    async ready(connection) { const observation = observeCustody(); trace('custody', observation); await verify(connection); trace('policy_ready', { native_contract: 'codex-cli-0.163.0', model: 'gpt-5.5', provider: 'openai', remote_control_status: 'disabled', effective_sources: sourceFiles }) },
    verifyCurrent: verify,
    assertCurrent() {
      if (failure || !privateSource || !configurationSignature || !remoteControlDisabledObserved) fail('policy_unavailable')
      assertNativeCodexCurrent(snapshot)
      for (const source of [privateSource, ...sourceFiles]) {
        const info = lstatSync(source.path, { bigint: true })
        if (`${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}` !== source.version) fail('source_changed_before_effect')
      }
      for (const path of absentSources) {
        try { lstatSync(path) } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue; throw error }
        fail('configuration_source_appeared')
      }
      checkRecord()
    },
    record(parsed, line, responseMethod) {
      try {
        if (failure) throw failure
        if (isDisabledCodexRemoteControl(parsed)) { remoteControlDisabledObserved = true; return 'remote-control-disabled' }
        if (isCodexSteerNotSubmitted(parsed, responseMethod)) return 'steer-not-submitted'
        if (parsed.error !== undefined || parsed.method !== undefined && parsed.id !== undefined) fail('native_request_or_error_rejected')
        if (parsed.method === undefined) {
          if (responseMethod !== 'thread/start') return
          const result = object.safeParse(parsed.result)
          if (!result.success || result.data.thread === undefined) fail('thread_reply_unverified')
          if (!configurationSignature || threadId && object.parse(result.data.thread).id !== threadId) fail('thread_reply_changed')
          const thread = object.parse(result.data.thread)
          threadId = z.uuid().parse(thread.id)
          if (result.data.model !== 'gpt-5.5' || result.data.modelProvider !== 'openai' || thread.modelProvider !== 'openai' || thread.cliVersion !== '0.163.0' || !['legacy', 'paginated'].includes(String(thread.historyMode)) || typeof thread.path !== 'string' || !isAbsolute(thread.path)) fail('thread_reply_unverified')
          const part = relative(join(privateHome, 'sessions'), thread.path)
          if (!part || part.startsWith('..') || isAbsolute(part)) fail('thread_rollout_outside_private_home')
          trace('thread_opened', { frame: parsed, raw_line: line })
          return
        }
        const { method, params } = notificationEnvelope.parse(parsed)
        if (!notifications.has(method)) fail('native_notification_unreviewed')
        if (method === 'thread/started') {
          if (!configurationSignature) fail('thread_started_before_policy')
          const thread = object.parse(params.thread), id = z.uuid().parse(thread.id)
          if (threadId && threadId !== id || thread.modelProvider !== 'openai' || thread.cliVersion !== '0.163.0' || thread.ephemeral !== false) fail('thread_identity_changed')
          threadId = id
        } else {
          if (!threadId || params.threadId !== threadId) fail('notification_thread_changed')
          if (method === 'turn/started' || method === 'turn/completed') {
            const turn = object.parse(params.turn), id = z.string().min(1).parse(turn.id)
            if (method === 'turn/started') { if (activeTurns.has(id)) fail('turn_started_twice'); activeTurns.add(id) }
            else { if (!activeTurns.delete(id) || !['completed', 'interrupted'].includes(String(turn.status)) || turn.error !== null && turn.error !== undefined) fail('turn_completion_unverified') }
            if (turn.items !== undefined) for (const item of z.array(object).parse(turn.items)) if (!itemTypes.has(String(item.type))) fail('native_tool_item_rejected')
          } else if (params.turnId !== undefined && !activeTurns.has(z.string().min(1).parse(params.turnId))) fail('notification_turn_changed')
          if (method === 'item/started' || method === 'item/completed') { if (!itemTypes.has(String(object.parse(params.item).type))) fail('native_tool_item_rejected') }
          if (method === 'rawResponseItem/completed') { if (!['message', 'reasoning'].includes(String(object.parse(params.item).type))) fail('native_response_tool_rejected') }
          if (method.endsWith('/delta') || method.endsWith('Delta')) z.looseObject({ turnId: z.string().min(1), itemId: z.string().min(1), delta: z.string() }).parse(params)
        }
        trace('notification', { method, frame: parsed, raw_line: line })
      } catch { fail('native_frame_unavailable') }
    },
    closed() {
      if (failure || !tree || !processIdentity) fail('final_custody_unknown')
      const final = tree.readFinalObservation()
      if (!final) fail('final_custody_unknown')
      const root = final.platform === 'linux' ? final.observation.root : final.root
      if (!root || (final.platform === 'linux' ? !isDeepStrictEqual({ ...root, runtime_id: agentSessionRuntimeIncarnation() }, processIdentity) || !isDeepStrictEqual(final.observation.nativeCLI, nativeCLI) : final.root.pid !== processIdentity.pid || final.root.creationTimeMs !== processIdentity.creation_time_ms || !isDeepStrictEqual(final.nativeCLI, nativeCLI))) fail('final_custody_changed')
      trace('custody_closed', final, true)
    }
  }
}
