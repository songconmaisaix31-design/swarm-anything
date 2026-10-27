import { appendFileSync, closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { createFileWithDacl, currentUserSid } from '@orca/windows-security'
import { z } from 'zod'
import type { AgentSessionRecord } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-record'
import { agentSessionRuntimeIncarnation } from '../../../third_party/orca-v1.4.230/src/main/runtime/agent-session-runtime-attribution'
import type { SwaPiSessionPolicy, SwaProviderJobLauncher, PiPolicyConnection, PiWriteContext, PiObservedProjection, ProviderProcessLaunch } from '../../../third_party/orca-v1.4.230/src/main/provider-process/provider-process-launch'
import type { SwaProviderProcessTree } from '../../../third_party/orca-v1.4.230/src/main/provider-process/swa-provider-process-tree'
import { parseStrictPiJson, strictPiOutboundSchema, strictPiRawSchema, strictPiQuestionRawSchema, strictPiCollaborationRawSchema, strictPiStateSchema, type StrictPiCollaborationMessage as StrictPiQuestionMessage } from '../../../third_party/orca-v1.4.230/src/main/pi/rpc-protocol'
import { structuredInputBindingSchema } from './contracts'
import { assertNativePiSnapshotCurrent, inspectPrivatePiModelMetadata, nativeConfigurationSource, readNativePiFile, type NativePiPerSessionSnapshot } from './native-pi-policy'
import { acquirePrivatePiSettingsGuardSync, privatePiEnvironment, verifyPrivatePiSessionAccount } from './private-pi-account'
import { requireNativeCodexPrivatePath } from './native-codex-policy'
import { createPosixPrivateFile } from './private-posix-security'
import { preparePiRpcPrompt } from '../../../third_party/orca-v1.4.230/src/main/pi/rpc-prompt'
import { SendBodyStructure } from '../../../third_party/orca-v1.4.230/src/shared/rpc-contract/structured-agent-session-message-params'
import { getAppEnvironment, hasAppEnvironment } from '../../../third_party/orca-v1.4.230/src/shared/app-environment'
import { prependOrcaCliDirToChildPath } from '../../../third_party/orca-v1.4.230/src/main/cli/orca-cli-child-path'
import { structuredWorkerIdentities } from '../../../third_party/orca-v1.4.230/src/main/runtime/structured-worker-identity'
import { requireNativeClaudePath } from './claude-file-security'
import { nativeSessionOptionsFromReport } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-wire/structured-agent-session-option-restoration'
import { agentSessionProviderHandleChainHead } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-provider-handle'
import type { StructuredAgentAttachedAdmission } from '../../../third_party/orca-v1.4.230/src/main/runtime/structured-agent-launch-composition'
import { getRuntimeSourceStamp } from '../../../third_party/orca-v1.4.230/src/main/runtime/host-descriptor'
import { readRuntimeSourceStamp, stampRuntimeSourceEnv } from '../../../third_party/orca-v1.4.230/src/shared/runtime-source-env'

const maximum = 12 * 1024 * 1024
const samePath = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
const identity = (path: string) => { const info = lstatSync(path, { bigint: true }); return `${info.dev}:${info.ino}:${info.birthtimeNs}` }
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
type Binding = z.infer<typeof structuredInputBindingSchema>
const inputBodySchema = SendBodyStructure.omit({ kind: true }).extend({ kind: z.literal('message'), from: z.unknown().optional() })
const localFailureSchema = z.strictObject({ stage: z.enum(['source', 'approval', 'settings', 'write', 'protocol', 'stdout', 'custody', 'persistence']),
  code: z.enum(['source_changed', 'approval_changed', 'settings_unverifiable', 'write_unsettled', 'protocol_unverifiable', 'stdout_incomplete', 'custody_unverifiable', 'trace_unavailable']), writeAttempted: z.boolean().optional() })

export function assertPiAcquiredRecord(input: {
  initial: AgentSessionRecord; record: AgentSessionRecord; generation: string | undefined; acquisitionGeneration: string | null
  native: { sessionId: string; sessionFile: string } | undefined
  state: z.infer<typeof strictPiStateSchema> | undefined
}) {
  const { initial, record, native, state } = input, link = agentSessionProviderHandleChainHead(record.providerHandleChain)
  if (!input.generation || input.acquisitionGeneration !== input.generation || !native || !state?.model || state.sessionId !== native.sessionId || state.sessionFile !== native.sessionFile || record.sessionId !== initial.sessionId || record.provider !== 'pi' || record.lease.runtimeFence !== initial.lease.runtimeFence || record.lease.claimStatus !== 'live' || record.lease.unreconciled || !record.lease.ownerProcess || !isDeepStrictEqual(record.accountHome, initial.accountHome) || !link || link.linkId !== record.lease.provenHandleLinkId || link.mintedAtFence !== record.lease.runtimeFence || link.handle.transport !== 'jsonl-rpc' || link.handle.agent !== 'pi' || link.handle.nativeId !== native.sessionFile) throw new Error('native_pi_acquired_record_unverifiable')
  const observed = nativeSessionOptionsFromReport({ priorOptions: initial.options, restoreSkipped: [], reported: { model: `${state.model.provider}/${state.model.id}`, effort: state.thinkingLevel } })
  if (initial.options?.model && observed.model !== initial.options.model || initial.options?.effort && observed.effort !== initial.options.effort || !isDeepStrictEqual(record.options, observed)) throw new Error('native_pi_acquired_options_changed')
}

export function validatePiExport(snapshot: NativePiPerSessionSnapshot, text: string, env: Readonly<Record<string, string>> = {}) {
  const secrets = Object.values(snapshot.auth).map(value => value.key)
  for (const key of ['ORCA_AGENT_SESSION_SPAWN_TOKEN', 'ORCA_TERMINAL_HANDLE']) if (env[key]) secrets.push(env[key]!)
  for (const [key, value] of Object.entries(env)) {
    if (!/^(?:https?|all)_proxy$/i.test(key)) continue
    try { const url = new URL(value); if (url.username || url.password) { secrets.push(value, url.username, url.password, decodeURIComponent(url.username), decodeURIComponent(url.password)) } }
    catch { throw new Error('native_pi_proxy_unverifiable') }
  }
  for (const secret of secrets) if (secret && (text.includes(secret) || text.includes(JSON.stringify(secret).slice(1, -1)))) throw new Error('native_pi_export_contains_credential')
}

export function assertPiStartupSources(privateHome: string, cwd: string, entry: string) {
  requireNativeClaudePath(cwd, { directory: true, private: false })
  requireNativeClaudePath(privateHome, { directory: true, private: true })
  const absent = [join(privateHome, '.config/gcloud/application_default_credentials.json'), join(cwd, '.pi/settings.json'),
    ...['SYSTEM.md', 'APPEND_SYSTEM.md'].flatMap(name => [join(privateHome, name), join(cwd, '.pi', name)]),
    ...['extensions', 'skills', 'prompts', 'themes'].flatMap(name => [join(privateHome, name), join(cwd, '.pi', name)]),
    join(privateHome, '.agents/skills')]
  for (let current = cwd; ; current = dirname(current)) {
    absent.push(join(current, '.agents/skills'))
    const git = join(current, '.git')
    let info: ReturnType<typeof lstatSync> | undefined
    try { info = lstatSync(git) }
    catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error }
    if (info) {
      // 官方existsSync跟随链接；这里直接拒链接，避免dangling .git令双方停止边界不同。
      if (info.isSymbolicLink()) throw new Error('native_pi_git_boundary_redirected')
      requireNativeClaudePath(git, { directory: info.isDirectory(), private: false })
      break
    }
    if (dirname(current) === current) break
  }
  if (process.platform === 'win32') {
    // 官方入口会删除这个固定库存；缺席门不把force rm当没有效果。
    for (let current = dirname(entry); ; current = dirname(current)) {
      if (basename(current).toLowerCase() === 'node_modules') { absent.push(join(current, '.pi-native-quarantine')); break }
      if (dirname(current) === current) throw new Error('native_pi_package_root_unverifiable')
    }
  }
  for (const path of absent) {
    let ancestor = path
    for (;;) {
      try { lstatSync(ancestor) }
      catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT' || dirname(ancestor) === ancestor) throw error
        ancestor = dirname(ancestor)
        continue
      }
      if (ancestor === path) throw new Error('native_pi_startup_source_present')
      requireNativeClaudePath(ancestor, { directory: true, private: false })
      const before = identity(ancestor)
      let present = false
      try { lstatSync(path); present = true }
      catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error }
      if (present) throw new Error('native_pi_startup_source_present')
      requireNativeClaudePath(ancestor, { directory: true, private: false })
      if (identity(ancestor) !== before) throw new Error('native_pi_startup_source_changed')
      break
    }
  }
}

export async function createPiSessionPolicy(input: {
  snapshot: NativePiPerSessionSnapshot; sessionId: string; fence: number; runtimeEpoch: string; launcher: SwaProviderJobLauncher; cwd: string
  record(): AgentSessionRecord | undefined
  approveInitialization(): Promise<() => void>
  approveStop(): () => void
  inputBinding(clientMessageId: string): Binding
  expectedEnvironment: Readonly<Record<string, string>>
}): Promise<SwaPiSessionPolicy & { adoptAcquiredRecord(input: StructuredAgentAttachedAdmission): Promise<void> }> {
  const { snapshot, sessionId } = input, account = snapshot.policy.account
  const initialRecord = input.record()
  if (!initialRecord || initialRecord.sessionId !== sessionId || initialRecord.provider !== 'pi' || initialRecord.lease.runtimeFence !== input.fence) throw new Error('native_pi_initial_record_unavailable')
  const home = join(account.private_root, sessionId), tracePath = join(input.launcher.eventDirectory, 'provider-events.ndjson')
  let approval = await input.approveInitialization()
  await verifyPrivatePiSessionAccount(snapshot, sessionId)
  approval()
  const metadata = await inspectPrivatePiModelMetadata({ sources: snapshot.sources, privateHome: home, provider: account.provider, target: account.model_target, expectedModels: snapshot.models })
  approval()
  const privateSources = await Promise.all(['auth.json', ...(snapshot.models === null ? [] : ['models.json'])].map(name => nativeConfigurationSource(join(home, name))))
  const env = privatePiEnvironment(home, input.expectedEnvironment)
  if (snapshot.policy.tools.mode !== 'disabled') {
    const stamp = getRuntimeSourceStamp({ getRuntimeId: () => input.runtimeEpoch }, getAppEnvironment().getPath('userData'))
    if (!stamp?.profilePath || !isDeepStrictEqual(readRuntimeSourceStamp(input.expectedEnvironment), stamp)) throw new Error('native_question_runtime_source_changed')
    stampRuntimeSourceEnv(env, stamp)
  }
  const workerIdentity = structuredWorkerIdentities.getBySessionId(sessionId)
  // 实际launch的公开transport值只在assertSpawn后保存，绝不保存完整继承环境。
  let childEnvironment: Readonly<Record<string, string>> = env
  requireNativeCodexPrivatePath(input.launcher.eventDirectory, true)
  if (process.platform === 'linux') createPosixPrivateFile(tracePath, Buffer.alloc(0))
  else {
    const user = currentUserSid(), trustees = [...new Set([user, 'S-1-5-18'])]
    createFileWithDacl(tracePath, `O:${user}D:P${trustees.map(sid => `(A;;FA;;;${sid})`).join('')}`, Buffer.alloc(0))
  }
  const traceIdentity = identity(tracePath)
  let tree: SwaProviderProcessTree | undefined, failed: Error | undefined, sequence = 0, generation: string | undefined
  let processIdentity: Record<string, unknown> | undefined, nativeCLI: unknown
  let native: { sessionId: string; sessionFile: string } | undefined, available: unknown
  let lastState: z.infer<typeof strictPiStateSchema> | undefined, adoptionAttempted = false
  let pendingInput: { id: string; frame: PiWriteContext['frame']; binding: Binding; echo?: StrictPiQuestionMessage } | undefined
  let preparedInput: { id: string; frame: PiWriteContext['frame']; binding: Binding } | undefined
  const usedInputs = new Set<string>(), unsettled = new Set<string>()
  let running = false, stopping = false, settled = true, closed = false
  let stopApproval: (() => void) | undefined
  function fail(code: string, reason: z.infer<typeof localFailureSchema> = { stage: 'protocol', code: 'protocol_unverifiable' }): never {
    if (!failed) {
      failed = new Error(`native_pi_${code}`)
      // 失败仍抛出；仅尽力保存固定失败事实，绝不把原异常/被拒帧写入证据。
      if (processIdentity && nativeCLI) { try { trace('failure', reason, true, true) } catch { /* 来源不可写时保留原永久UNKNOWN。 */ } }
    }
    throw failed
  }
  function record(allowFailure = false) {
    if (failed && !allowFailure) throw failed
    const current = input.record()
    if (!current || current.provider !== 'pi' || current.sessionId !== sessionId || current.lease.runtimeFence !== input.fence || !current.lease.ownerProcess || current.lease.ownerProcess.runtime !== agentSessionRuntimeIncarnation()) fail('owner_changed')
    return current
  }
  function custody() {
    if (!tree) fail('custody_missing')
    const current = record(), observed = tree.readObservation()
    if (observed.platform === 'linux') {
      if (!observed.root || !observed.custodyAdmitted || observed.nativeState?.state !== 'created' || observed.root.pid !== current.lease.ownerProcess!.pid || !observed.nativeCLI) fail('custody_changed')
      processIdentity = { ...observed.root, runtime_id: current.lease.ownerProcess!.runtime! }
    } else {
      if (!observed.assigned || observed.rootExited || observed.rootPid !== current.lease.ownerProcess!.pid || observed.rootCreationTimeMs !== current.lease.ownerProcess!.processStartTimeMs || !observed.nativeCLI) fail('custody_changed')
      processIdentity = { pid: observed.rootPid, creation_time_ms: observed.rootCreationTimeMs, runtime_id: current.lease.ownerProcess!.runtime! }
    }
    nativeCLI = observed.nativeCLI
    const actual = z.object({ kind: z.literal('node-script'), program: z.string(), entry: z.string() }).safeParse(nativeCLI)
    if (!actual.success || !samePath(actual.data.entry, snapshot.sources.entry.path) || !snapshot.sources.interpreter || !samePath(actual.data.program, snapshot.sources.interpreter.path)) fail('native_interpreter_changed')
    return observed
  }
  function trace(event: string, detail: unknown, durable = false, allowFailure = false): number {
    record(allowFailure)
    if (!processIdentity || !nativeCLI || identity(tracePath) !== traceIdentity) fail('trace_binding_missing')
    requireNativeCodexPrivatePath(tracePath, false)
    const line = JSON.stringify({ protocol: 'pi-jsonl-rpc', projection: 'actual_native_rpc_frames', session_id: sessionId, runtime_fence: input.fence, runtime_epoch: input.runtimeEpoch,
      sequence: sequence + 1, observed_at: new Date().toISOString(), monotonic_ms: performance.now(), process: processIdentity, native_cli: nativeCLI, event, detail }) + '\n'
    validatePiExport(snapshot, line, childEnvironment)
    if (lstatSync(tracePath).size + Buffer.byteLength(line) > maximum || sequence >= 100_000) fail('trace_exceeds_bound')
    const fd = openSync(tracePath, constants.O_WRONLY | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0))
    try {
      const info = fstatSync(fd, { bigint: true })
      if (`${info.dev}:${info.ino}:${info.birthtimeNs}` !== traceIdentity) fail('trace_changed')
      appendFileSync(fd, line)
      if (durable) fsyncSync(fd)
      if (identity(tracePath) !== traceIdentity) fail('trace_changed')
      return ++sequence
    } catch { fail('trace_unavailable') } finally { closeSync(fd) }
  }
  function assertApproval() {
    if (stopping) { if (!stopApproval) fail('stop_approval_missing'); stopApproval() }
    else approval()
  }
  function assertSources(checkApproval = assertApproval) {
    if (failed) throw failed
    checkApproval(); assertNativePiSnapshotCurrent(snapshot)
    for (const source of privateSources) if (readNativePiFile(source.path, 64 * 1024, true).source.version !== source.version) fail('private_source_changed')
    if (snapshot.models === null) {
      try { lstatSync(join(home, 'models.json')); fail('private_models_appeared') }
      catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error }
    }
    assertPiStartupSources(home, input.cwd, snapshot.sources.entry.path)
  }
  function assertCurrent() {
    assertSources()
    const current = input.record()
    if (!current || current.provider !== 'pi' || current.sessionId !== sessionId || current.lease.runtimeFence !== input.fence) fail('owner_record_unavailable')
    if (current.lease.ownerProcess) { record(); if (!closed) custody() }
    else if (generation || processIdentity) fail('owner_changed')
  }
  function model(value: unknown) {
    if (!metadata.models.some(expected => isDeepStrictEqual(expected, value))) fail('model_unreviewed')
  }
  function message(value: StrictPiQuestionMessage, terminal: boolean) {
    if (value.role !== 'assistant') return
    if (value.provider !== account.provider || value.model !== account.model_target.model_id || value.api !== account.model_target.api || terminal && value.stopReason === 'pending' || value.stopReason === 'aborted' && !stopping) fail('message_policy_changed')
  }
  function state(value: unknown, idle: boolean) {
    const parsed = strictPiStateSchema.safeParse(value)
    if (!parsed.success || !parsed.data.model || parsed.data.autoCompactionEnabled || idle && (parsed.data.isStreaming || parsed.data.isCompacting || parsed.data.pendingMessageCount !== 0)) fail('state_unverifiable')
    const result = parsed.data
    model(result.model)
    if (result.model!.provider !== account.provider || result.model!.id !== account.model_target.model_id || !result.sessionFile || !isAbsolute(result.sessionFile)) fail('session_identity_changed')
    const part = relative(home, result.sessionFile)
    if (!part || part.startsWith('..') || isAbsolute(part) || !basename(result.sessionFile).endsWith(`_${result.sessionId}.jsonl`)) fail('session_outside_private_home')
    requireNativeCodexPrivatePath(dirname(result.sessionFile), true)
    if (native && (native.sessionId !== result.sessionId || !samePath(native.sessionFile, result.sessionFile))) fail('session_identity_changed')
    native ??= { sessionId: result.sessionId, sessionFile: result.sessionFile }
    lastState = result
    return result as ReturnType<typeof strictPiStateSchema.parse> & { sessionFile: string }
  }
  const policy: SwaPiSessionPolicy & { adoptAcquiredRecord(input: StructuredAgentAttachedAdmission): Promise<void> } = {
    nativeContract: 'pi-cli-1.0.1',
    async adoptAcquiredRecord(attached) {
      if (adoptionAttempted) fail('acquired_record_already_admitted')
      adoptionAttempted = true
      const before = record()
      const check = () => {
        const current = record()
        assertPiAcquiredRecord({ initial: initialRecord, record: current, generation, acquisitionGeneration: attached.acquisitionGeneration, native, state: lastState })
        if (attached.record.sessionId !== sessionId || attached.record.lease.runtimeFence !== input.fence || !isDeepStrictEqual(current.accountHome, attached.record.accountHome) || !isDeepStrictEqual(current.options, attached.record.options) || !isDeepStrictEqual(current.providerHandleChain, attached.record.providerHandleChain) || !isDeepStrictEqual(current.lease.ownerProcess, attached.record.lease.ownerProcess) || !isDeepStrictEqual(current.lease.ownerProcess, before.lease.ownerProcess)) fail('acquired_record_changed')
        custody()
      }
      // 原生读回持久化后重新批准；旧闭包只在这个准确 acquisition 边界替换一次。
      check()
      const freshApproval = await input.approveInitialization()
      check(); assertSources(freshApproval); freshApproval()
      approval = freshApproval
    },
    hasRecordedOwner() { const current = input.record(); if (!current || current.sessionId !== sessionId || current.lease.runtimeFence !== input.fence) fail('owner_record_unavailable'); return current.lease.ownerProcess !== null && current.lease.ownerProcess !== undefined },
    attach(value) { if (tree) fail('custody_attached_twice'); tree = value },
    assertSpawn(launch: ProviderProcessLaunch) {
      assertSources()
      if (launch.command !== input.launcher.node || launch.cwd !== input.cwd || launch.args.length !== 3 || launch.args[0] !== '--max-old-space-size=1024' || launch.args[1] !== input.launcher.entry) fail('launch_changed')
      let payload: unknown
      try { payload = parseStrictPiJson(launch.args[2]!) } catch { fail('launch_changed') }
      const command = z.strictObject({ command: z.string(), args: z.array(z.string()) }).safeParse(payload)
      const toolArgs = snapshot.policy.tools.mode !== 'disabled' ? ['--no-builtin-tools', '--tools', snapshot.policy.tools.allowed.join(','), '--no-extensions', '--extension', snapshot.policy.tools.extension.path] : ['--no-tools', '--no-extensions']
      const expectedArgs = ['--mode', 'rpc', '--offline', '--no-approve', '--provider', account.provider, '--model', account.model_target.model_id, ...toolArgs, '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files']
      if (!command.success || !samePath(command.data.command, snapshot.sources.launch.path) || !isDeepStrictEqual(command.data.args, expectedArgs)) fail('native_argv_changed')
      const actual = launch.env ?? {}, projected = { ...env }
      const install = snapshot.sourceInput.env.SWA_INSTALL_ROOT, data = dirname(dirname(account.private_root))
      if (!install || !isAbsolute(install) || !hasAppEnvironment()) fail('host_environment_unavailable')
      const app = getAppEnvironment(), hostLauncher = join(install, process.platform === 'win32' ? 'swa.exe' : 'swa')
      if (!app.isPackaged() || app.getCliLauncherPath?.() !== hostLauncher || app.getPath('userData') !== data || !projected.PATH) fail('host_environment_changed')
      prependOrcaCliDirToChildPath(projected, { isPackaged: true, userDataPath: data })
      for (const name of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) projected[name] = ''
      if (!workerIdentity || !isDeepStrictEqual(workerIdentity, structuredWorkerIdentities.getBySessionId(sessionId))) fail('worker_identity_changed')
      Object.assign(projected, { ORCA_AGENT_SESSION_ID: sessionId, ORCA_STRUCTURED_SESSION: '1', ORCA_TERMINAL_HANDLE: workerIdentity.handle })
      if (!actual.ORCA_AGENT_SESSION_SPAWN_TOKEN || /[\0\r\n]/.test(actual.ORCA_AGENT_SESSION_SPAWN_TOKEN)) fail('spawn_identity_missing')
      projected.ORCA_AGENT_SESSION_SPAWN_TOKEN = actual.ORCA_AGENT_SESSION_SPAWN_TOKEN
      for (const [key, value] of Object.entries(actual)) if (projected[key] !== value) fail('native_environment_changed')
      for (const [key, value] of Object.entries(projected)) if (actual[key] !== value || launch.envToDelete?.includes(key)) fail('native_environment_changed')
      childEnvironment = Object.freeze({ ...actual })
    },
    async ready(connection, context) {
      assertSources(); generation = z.uuid().parse(context.acquisitionGeneration)
      if (!tree) fail('custody_missing')
      await tree.ready(); approval(); custody(); trace('custody', tree.readObservation(), true)
      await connection.request('set_auto_compaction', { enabled: false }); assertCurrent()
      await connection.request('set_auto_retry', { enabled: false }); assertCurrent()
      const actual = state(await connection.request('get_state'), true)
      assertCurrent()
      await connection.request('get_available_models'); assertCurrent()
      if (available === undefined) fail('available_models_missing')
      trace('policy_ready', { native_contract: 'pi-cli-1.0.1', session_id: actual.sessionId, session_file: actual.sessionFile, acquisition_generation: generation,
        provider: account.provider, model: account.model_target, tools: snapshot.policy.tools.mode, sources: [...snapshot.sources.pinnedFiles, ...privateSources, ...(snapshot.policy.tools.mode !== 'disabled' ? [snapshot.policy.tools.extension] : [])], settings: acquireSettingsObservation() }, true)
      return actual
    },
    async verifyCurrent(connection: PiPolicyConnection) {
      assertCurrent()
      if (!stopping) { approval = await input.approveInitialization(); assertApproval() }
      await verifyPrivatePiSessionAccount(snapshot, sessionId); assertCurrent()
      const actual = state(await connection.request('get_state'), false)
      assertCurrent()
      return actual
    },
    assertCurrent,
    async prepareInput(id, frame) {
      assertCurrent()
      if (stopping || preparedInput || pendingInput && !pendingInput.echo || usedInputs.has(id) || frame.type !== 'prompt' || frame.id !== id) fail('input_lane_unverifiable')
      const binding = structuredInputBindingSchema.parse(input.inputBinding(id))
      if (binding.operation_id !== id || binding.session_id !== sessionId || binding.runtime_fence !== input.fence || binding.agent !== 'pi') fail('input_binding_changed')
      const parsedBody = inputBodySchema.safeParse(binding.body)
      if (!parsedBody.success || parsedBody.data.role !== 'user' || parsedBody.data.blocks.some(block => block.type !== 'text')) fail('input_body_unreviewed')
      // from由宿主记录；原完整binding继续参与末核，提供者只消费消息正文。
      const { from: _sender, ...body } = parsedBody.data
      const prompt = await preparePiRpcPrompt(body)
      if (prompt.message.startsWith('/') || frame.message !== prompt.message || !isDeepStrictEqual(frame.images ?? [], prompt.images)) fail('input_body_changed')
      const preparedFrame = structuredClone(frame)
      const assert = () => {
        assertCurrent()
        if (!isDeepStrictEqual(binding, input.inputBinding(id)) || !isDeepStrictEqual(frame, preparedFrame)) fail('input_binding_changed')
      }
      assert()
      preparedInput = { id, frame: preparedFrame, binding }
      return assert
    },
    beforeWrite(context) {
      assertCurrent()
      const guard = acquirePrivatePiSettingsGuardSync(join(home, 'settings.json'))
      try {
        const settings = guard.assertCurrent(), parsed = strictPiOutboundSchema.safeParse(context.frame)
        if (!parsed.success || !isDeepStrictEqual(parseStrictPiJson(context.line), context.frame)) fail('write_parameters_unreviewed')
        const frame = parsed.data
        if (stopping && frame.type !== 'abort' && frame.type !== 'get_state') fail('stopping_command_unreviewed')
        if (frame.type === 'set_model' && (frame.provider !== account.provider || frame.modelId !== account.model_target.model_id)) fail('model_changed')
        if (typeof frame.id !== 'string' || !frame.id || unsettled.has(frame.id)) fail('write_identity_repeated')
        if (frame.type === 'prompt') {
          if (stopping || pendingInput && !pendingInput.echo || usedInputs.has(frame.id) || context.clientMessageId !== frame.id || !native) fail('input_lane_unverifiable')
          const binding = structuredInputBindingSchema.parse(input.inputBinding(frame.id))
          if (binding.operation_id !== frame.id || binding.session_id !== sessionId || binding.runtime_fence !== input.fence || binding.agent !== 'pi') fail('input_binding_changed')
          if (!preparedInput || preparedInput.id !== frame.id || !isDeepStrictEqual(preparedInput.frame, frame) || !isDeepStrictEqual(preparedInput.binding, binding)) fail('input_preparation_missing')
          if (typeof frame.message !== 'string' || frame.message.startsWith('/') || frame.images !== undefined && (!Array.isArray(frame.images) || frame.images.length)) fail('input_unreviewed')
          let baseline: { absent: true } | { source: { path: string; version: string }; bytes: number; sha256: string }
          try { const result = readNativePiFile(native.sessionFile, maximum, true); baseline = { source: result.source, bytes: result.bytes.length, sha256: hash(result.bytes) } }
          catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; requireNativeCodexPrivatePath(dirname(native.sessionFile), true); baseline = { absent: true } }
          trace('write_intent', { command: frame.type, id: frame.id, cid: frame.id, frame, binding, settings, native_baseline: baseline }, true)
          pendingInput = { id: frame.id, frame, binding }; usedInputs.add(frame.id)
          preparedInput = undefined
        } else trace('write_intent', { command: frame.type, id: frame.id, frame, settings }, true)
        unsettled.add(frame.id)
        guard.assertCurrent()
        return () => { try { guard.assertCurrent() } finally { guard.release() } }
      } catch { try { guard.release() } catch { fail('settings_cleanup_unknown') }; fail('write_admission_unverifiable') }
    },
    rawRecord(value, line, response) {
      if (!processIdentity || !generation) { custody(); if (!generation) fail('preowner_native_record') }
      if (Buffer.byteLength(line) > 8 * 1024 * 1024 || !isDeepStrictEqual(parseStrictPiJson(line), value)) fail('raw_line_unverifiable')
      validatePiExport(snapshot, line, childEnvironment)
      const parsed = (snapshot.policy.tools.mode === 'collaboration' ? strictPiCollaborationRawSchema : snapshot.policy.tools.mode === 'questions-only' ? strictPiQuestionRawSchema : strictPiRawSchema).safeParse(value)
      if (!parsed.success) fail('raw_dto_unreviewed')
      const frame = parsed.data
      if (frame.type === 'response') {
        if (!response || frame.id !== response.id || frame.command !== response.command) fail('reply_binding_changed')
        if (frame.command === 'get_state') state(frame.data, false)
        if (frame.command === 'set_model') model(frame.data)
        if (frame.command === 'get_available_models') {
          const list = frame.data.models
          for (const item of list) model(item)
          if (new Set(list.map(item => `${item.provider}/${item.id}`)).size !== list.length || list.filter(item => item.provider === account.provider && item.id === account.model_target.model_id).length !== 1 || available !== undefined && !isDeepStrictEqual(available, list)) fail('available_models_changed')
          available ??= list
        }
      } else if (frame.type === 'message_start' || frame.type === 'message_end') {
        message(frame.message, frame.type === 'message_end')
        if (frame.message.role === 'user') {
          if (!pendingInput || !isDeepStrictEqual(frame.message.content, [{ type: 'text', text: pendingInput.frame.message }])) fail('user_echo_unbound')
          if (frame.type === 'message_end') { if (pendingInput.echo) fail('user_echo_repeated'); pendingInput.echo = frame.message }
        }
      } else if (frame.type === 'turn_end') message(frame.message, true)
      else if (frame.type === 'agent_end') { for (const item of frame.messages) message(item, true); if (!running) fail('run_end_unbound'); running = false }
      else if (frame.type === 'agent_start') { if (running || !pendingInput || pendingInput.echo) fail('run_start_unbound'); running = true; settled = false }
      else if (frame.type === 'agent_settled') { if (running) fail('run_settled_early'); settled = true }
      else if (frame.type === 'queue_update') {
        const expected = pendingInput && !pendingInput.echo ? [pendingInput.frame.message] : []
        const actual = [...frame.steering, ...frame.followUp]
        if (actual.length && !isDeepStrictEqual(actual, expected)) fail('native_queue_unbound')
      } else if (frame.type === 'entry_appended' && frame.entry.type === 'message') message(frame.entry.message, true)
      const sourceSequence = trace('native_record', { frame, raw_line: line, ...(response ? { response } : {}), ...(pendingInput && frame.type === 'message_end' && frame.message.role === 'user' ? { cid: pendingInput.id } : {}) })
      return { sequence: sourceSequence }
    },
    writeSettled(context, outcome, phase) {
      if (typeof context.frame.id !== 'string' || !unsettled.delete(context.frame.id)) fail('write_settlement_unbound')
      trace('write_settled', { command: context.frame.type, id: context.frame.id, ...(context.clientMessageId ? { cid: context.clientMessageId } : {}), outcome, ...phase }, true)
      if (!phase.cleanupCompleted || outcome !== 'resolved') fail('write_unsettled')
    },
    beginStop({ turnId }) {
      if (stopping) { assertCurrent(); return }
      const cleanupApproval = input.approveStop()
      cleanupApproval(); assertSources(cleanupApproval); record(); if (!closed) custody(); cleanupApproval()
      stopApproval = cleanupApproval; stopping = true
      trace('stop_intent', { turn_id: turnId, cid: pendingInput?.id ?? null }, true)
    },
    projectionPublished(observed: PiObservedProjection) {
      if (observed.acquisitionGeneration !== generation || observed.sourceSequence < 1 || observed.sourceSequence > sequence) fail('projection_binding_changed')
      trace('projection_published', observed, true)
    },
    failure(reason) { const parsed = localFailureSchema.safeParse(reason); if (!parsed.success) fail('local_failure_unreviewed'); fail(parsed.data.code, parsed.data) },
    closed() {
      if (failed || !tree || !native || !generation || unsettled.size || pendingInput && !pendingInput.echo || running || !settled) fail('final_source_unknown')
      assertSources()
      const final = tree.readFinalObservation()
      if (!final || !processIdentity) fail('final_custody_unknown')
      const root = final.platform === 'linux' ? final.observation.root : final.root
      if (!root || (final.platform === 'linux' ? !isDeepStrictEqual({ ...root, runtime_id: agentSessionRuntimeIncarnation() }, processIdentity) || !isDeepStrictEqual(final.observation.nativeCLI, nativeCLI) : root.pid !== processIdentity.pid || !isDeepStrictEqual(final.nativeCLI, nativeCLI))) fail('final_custody_changed')
      closed = true
      trace('custody_closed', final, true)
    }
  }
  function acquireSettingsObservation() { const guard = acquirePrivatePiSettingsGuardSync(join(home, 'settings.json')); try { return guard.assertCurrent() } finally { guard.release() } }
  return policy
}
