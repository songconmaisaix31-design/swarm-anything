import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual, stripVTControlCharacters } from 'node:util'
import { z } from 'zod'
import { buildRegistry, defineMethod, isStreamingMethod, type RpcContext } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/core'
import type { OrcaRuntimeService } from '../../../third_party/orca-v1.4.230/src/main/runtime/orca-runtime'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import { deriveRemoteRuntimeTerminalCreateHandle } from '../../../third_party/orca-v1.4.230/src/main/runtime/remote-runtime-terminal-create-identity'
import { getRepoMainWorktreeId } from '../../../third_party/orca-v1.4.230/src/shared/worktree/id'
import { getLocalPtyProvider } from '../../../third_party/orca-v1.4.230/src/main/ipc/pty/provider/registry'
import { readWindowsProcessTableFresh } from '../../../third_party/orca-v1.4.230/src/main/windows/windows-process-table'
import { quotePowerShellNativeArgument } from '../../../third_party/orca-v1.4.230/src/shared/powershell-native-argument'
import { resolveWindowsShellLaunchArgs } from '../../../third_party/orca-v1.4.230/src/main/providers/windows-shell-args'
import { createIncrementalNdjsonFramer } from '../../../third_party/orca-v1.4.230/src/shared/main-process-ndjson-framer'
import { getPendingWorkerStartRecovery } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-receipt'
import { invocationSchema, helperReply, nativeObject, nativeError, commandSchema, capabilityRequirementsSchema, agentSelectionSchema, scopeSchema, type AgentSelection, type Invocation, type Scope } from './contracts'
import { discoverAgents, selectAgent, registeredAgent } from './agent-discovery'
import { admitWorkerResources } from './resource-admission'
import { completeTaskResult, observeWorkerSource, readNativeInputStatus } from './task-result'
import { createPrivatePiHome } from './private-pi-account'
import { createPrivateOpenCodeRoot } from './private-opencode-account'
import { deliverNativeWorkerInput } from './worker-input'
import { assertDeliveryGrantCurrent } from './delivery-admission'
import { authority, controllerOwnerSchema, controllerScope, exactController, observeControllerExited, recorded } from './controller-scope'
import { ORCHESTRATION_RUN_METHODS } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/runs/runs'
import { ORCHESTRATION_MESSAGE_METHODS } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/messaging/message-methods'
import { ORCHESTRATION_WORKER_CONTROL_METHODS } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/worker/worker-control'
import { ORCHESTRATION_WORKER_LIST_METHOD } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/worker/worker-list-method'

const wrapper = z.object({ invocation: invocationSchema })
const lookup = z.object({ project_id: z.string().min(1), controller: z.string().min(1) })
function fail(code: string, message: string): never { throw new OrchestrationError(code, message) }
const historyMethods = new Set(['orchestration.runShow', 'orchestration.taskList', 'orchestration.workerShow', 'orchestration.workerList', 'orchestration.workerRead'])
const history = buildRegistry([...ORCHESTRATION_RUN_METHODS, ...ORCHESTRATION_MESSAGE_METHODS, ...ORCHESTRATION_WORKER_CONTROL_METHODS, ORCHESTRATION_WORKER_LIST_METHOD].filter(method => historyMethods.has(method.name)))

async function nativeHistory(runtime: OrcaRuntimeService, method: string, params: unknown) {
  const declaration = history.get(method)
  if (!declaration || isStreamingMethod(declaration)) throw new Error('The original native history method is unavailable')
  return declaration.handler(declaration.params?.parse(params), { runtime, authenticatedCallerFingerprint: authority(runtime) })
}

async function observeTask(runtime: OrcaRuntimeService, invocation: Invocation, scope: Scope) {
  const c = invocation.command, run = scope.run_id
  if (c.action === 'worker.show') return nativeHistory(runtime, 'orchestration.workerShow', { dispatch: c.dispatch_id })
  if (c.action === 'worker.read') return nativeHistory(runtime, 'orchestration.workerRead', { dispatch: c.dispatch_id, source: 'transcript', limit: c.limit, ...(c.cursor ? { cursor: c.cursor } : {}) })
  if (c.action === 'worker.list') return nativeHistory(runtime, 'orchestration.workerList', { run, paginate: true, limit: 100 })
  const tasks = nativeObject(await nativeHistory(runtime, 'orchestration.taskList', { run }))
  if (c.action !== 'task.result') return tasks
  const rows = z.array(z.looseObject({ id: z.string(), parent_id: z.string().nullable() })).parse(tasks.tasks)
  if (!rows.some(task => task.id === scope.root_task_id)) throw new Error('The original native root task is unavailable')
  const children = new Set(rows.filter(task => task.parent_id === scope.root_task_id).map(task => task.id))
  const fleet = nativeObject(await nativeHistory(runtime, 'orchestration.workerList', { run, paginate: true, limit: 100 }))
  if (z.object({ hasMore: z.boolean() }).parse(fleet.page).hasMore) throw new Error('The fixed task Worker inventory is incomplete')
  const workers = z.array(z.looseObject({ dispatchId: z.string(), taskId: z.string(), runId: z.string() })).parse(fleet.workers)
  const outputs = []
  for (const worker of workers) {
    if (worker.runId !== run || !children.has(worker.taskId)) throw new Error('The native Worker belongs to another fixed task')
    outputs.push({ worker, observation: await nativeHistory(runtime, 'orchestration.workerShow', { dispatch: worker.dispatchId }) })
  }
  return { run: await nativeHistory(runtime, 'orchestration.runShow', { id: run }), tasks, workers: outputs }
}

async function helperCall(runtime: OrcaRuntimeService, controller: string, requestId: string, action: string, invocation?: Invocation) {
  const ptyId = runtime.getTerminalPtyIdForHandle(controller)
  if (!ptyId) return fail('operation_unknown', 'The native helper is unavailable')
  let stop = () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  let rejectReply: (error: Error) => void = () => {}
  const response = new Promise<z.infer<typeof helperReply>>((resolve, reject) => {
    rejectReply = reject
    const framer = createIncrementalNdjsonFramer(value => {
      const parsed = helperReply.safeParse(value)
      if (!parsed.success || parsed.data.request_id !== requestId || parsed.data.controller !== controller) return
      resolve(parsed.data)
    }, rejected => {
      if (rejected.kind === 'line-too-long') reject(new OrchestrationError('operation_unknown', 'Controller response exceeded the declared bound'))
    }, { maxLineBytes: 16 * 1024 * 1024 })
    stop = runtime.subscribeToTerminalData(ptyId, data => framer.feed(stripVTControlCharacters(data)))
    timer = setTimeout(() => reject(new OrchestrationError('operation_unknown', 'The controller action may have reached its exact PTY')), 120_000)
  })
  try {
    const written = await runtime.sendTerminal(controller, { text: JSON.stringify({ type: 'swa_controller_action', request_id: requestId, action, ...(invocation ? { invocation } : {}) }), enter: true }, { inputKind: 'driving', requireWriteSettlement: true })
    if (!written.accepted) rejectReply(new OrchestrationError('operation_unknown', 'The controller input settlement is unknown'))
    const reply = await response
    if (reply.error) throw new OrchestrationError(reply.error.code, reply.error.message)
    return reply
  } finally {
    clearTimeout(timer)
    stop()
  }
}

function checkpoint(context: RpcContext, receipt: unknown) {
  const mutation = context.orchestrationMutation
  if (!mutation) return fail('request_mismatch', 'A durable native mutation identity is required')
  context.runtime.getOrchestrationDb().checkpointPendingMutationReceipt({ ...mutation, receipt: JSON.stringify(receipt) })
  context.markMutationEffectPossible?.()
  return mutation.requestId
}

async function effect<T>(run: () => Promise<T>): Promise<T> {
  try { return await run() } catch (error) {
    throw new OrchestrationError('operation_unknown', error instanceof Error ? error.message : 'The native effect is unknown')
  }
}

async function createController(context: RpcContext, project: string, workspace: string, save: (receipt: Record<string, unknown>) => void) {
  const runtime = context.runtime, requestId = context.orchestrationMutation!.requestId
  const childId = `${requestId}/controller-pty`
  const controller = deriveRemoteRuntimeTerminalCreateHandle('swa-controller-local', workspace, childId)
  const fixed = { project_id: project, worktree_id: workspace, client_identity: 'swa-controller-local', client_mutation_id: childId }
  save({ ...fixed, expected_controller: controller, stage: 'pty-spawn' })
  context.markMutationEffectPossible?.()
  const node = process.env.SWA_NODE_EXECUTABLE
  const entry = join(process.env.SWA_INSTALL_ROOT!, 'runtime', 'controller-helper.cjs')
  if (!node) throw new Error('installed_node_missing')
  const launchScope = await runtime.resolveTerminalWorkspaceLaunchScope(`id:${workspace}`)
  const command = `& ${quotePowerShellNativeArgument(node)} ${quotePowerShellNativeArgument(entry)}`
  if (process.platform !== 'win32' || launchScope.connectionId || !resolveWindowsShellLaunchArgs('pwsh.exe', launchScope.path, launchScope.path, undefined, command).startupCommandDeliveredInShellArgs) throw new Error('native_controller_startup_delivery_unavailable')
  const terminal = await runtime.dedupeTerminalCreate('swa-controller-local', `id:${workspace}`, childId, false,
    (canonical, preAllocatedHandle) => runtime.createTerminal(canonical, {
      command, env: { SWA_CONTROLLER_HELPER: '1' }, shellOverride: 'pwsh.exe', startupCommandDelivery: 'fast',
      launchConfig: { agentCommand: `"${node}"`, agentArgs: `"${entry}"`, agentEnv: { SWA_CONTROLLER_HELPER: '1' } },
      title: 'SWA controller', presentation: 'background', focus: false, activate: false, preAllocatedHandle
    }))
  if (terminal.handle !== controller) throw new Error('native_controller_handle_mismatch')
  const observed = await helperCall(runtime, controller, requestId, 'identify')
  const binding = runtime.getTerminalPromptRequestBinding(controller)
  const listed = await getLocalPtyProvider().listProcesses()
  const pty = listed.find(row => row.id === binding.ptyId && row.terminalHandle === controller && row.incarnationId === binding.processIncarnation)
  if (!pty?.rootProcessId) throw new Error('native_controller_process_missing')
  const rows = await readWindowsProcessTableFresh()
  const root = rows.find(row => row.pid === pty.rootProcessId), helper = rows.find(row => row.pid === observed.pid)
  if (!root?.creationTimeMs || !helper?.creationTimeMs) throw new Error('native_controller_creation_time_missing')
  const ancestors = new Set<number>()
  for (let item: typeof helper | undefined = helper; item && !ancestors.has(item.pid);) {
    ancestors.add(item.pid)
    if (item.pid === root.pid) break
    const parentPid: number = item.ppid
    item = rows.find(row => row.pid === parentPid)
  }
  if (!ancestors.has(root.pid)) throw new Error('helper_not_owned_by_controller_pty')
  const live = runtime.getOrchestrationDispatchAuthority(controller)
  const processIncarnation = runtime.getTerminalProcessIncarnation(controller)
  if (!live?.launchTokenHash || !live.paneKey || !processIncarnation || live.hostScope.kind !== 'local' || live.ptyId !== binding.ptyId || live.processIncarnation !== processIncarnation) throw new Error('The actual controller launch commitment is unavailable')
  const caller_authority = { terminalHandle: controller, paneKey: live.paneKey, processIncarnation, launchTokenHash: live.launchTokenHash, hostScope: live.hostScope }
  const owner = { ...fixed, controller, binding, process: { pid: root.pid, creationTimeMs: root.creationTimeMs, name: root.name }, helper: { pid: helper.pid, creationTimeMs: helper.creationTimeMs, name: helper.name }, caller_authority }
  save({ ...owner, stage: 'helper-ready' })
  const current = await helperCall(runtime, controller, requestId, 'observe')
  return { ...owner, observation: current.result }
}

export const SWA_METHODS = [
  defineMethod({ name: 'swa.registeredAgent', permission: 'workspace', params: z.strictObject({ agent_id: z.string().min(1) }), handler: ({ agent_id }, { runtime }) => registeredAgent(runtime, agent_id) }),
  defineMethod({ name: 'swa.status', permission: 'workspace', params: null, handler: (_params, { runtime }) => ({
    native: runtime.getStatus(), authority_domain: authority(runtime),
    databases: runtime.getOrchestrationDb().db.pragma('database_list'),
    agent_discovery: 'swa.capabilities', execution_validation: 'requires_actual_selected_native_agent_session'
  }) }),
  defineMethod({ name: 'swa.capabilities', permission: 'workspace', params: z.object({ project_id: z.string().min(1), requirements: capabilityRequirementsSchema }), handler: ({ requirements }, { runtime }) => discoverAgents(runtime, requirements) }),
  defineMethod({ name: 'swa.resolveSelection', permission: 'workspace', params: z.object({ project_id: z.string().min(1), command: commandSchema }), handler: ({ project_id, command }, { runtime }) => resolveSelection(runtime, project_id, command) }),
  defineMethod({ name: 'swa.workerSend', permission: 'workspace', params: z.strictObject({ controller: z.string().min(1), parent_request: z.uuid() }), handler: deliverNativeWorkerInput }),
  defineMethod({ name: 'swa.inputStatus', permission: 'workspace', params: z.strictObject({ project_id: z.uuid(), request_id: z.uuid() }), handler: ({ project_id, request_id }, { runtime }) => readNativeInputStatus(runtime, project_id, request_id) }),
  defineMethod({ name: 'swa.scope', permission: 'workspace', params: lookup, handler: (params, { runtime }) => controllerScope(runtime, params.project_id, params.controller, { history: true }).scope }),
  defineMethod({ name: 'swa.controllerShow', permission: 'workspace', params: lookup, handler: async (params, { runtime }) => {
    const owned = controllerScope(runtime, params.project_id, params.controller, { history: true })
    try {
      await exactController(runtime, owned.owner)
      return { ...owned, observation: await helperCall(runtime, params.controller, randomUUID(), 'observe') }
    } catch (error) {
      throw new OrchestrationError('controller_unverifiable', 'The recorded controller could not be observed as a live helper', { ...owned, observation: nativeObject(nativeError(error)) })
    }
  } }),
  defineMethod({ name: 'swa.controllerOpen', permission: 'workspace', params: wrapper, handler: async ({ invocation }, context) => {
    const { runtime } = context
    if (invocation.command.action !== 'controller.open' || !invocation.command.workdir || invocation.project.id !== invocation.caller.project_id) return fail('scope_denied', 'The project open scope is invalid')
    const workdir = await realpath(invocation.command.workdir)
    checkpoint(context, { project_id: invocation.project.id, workdir, stage: 'workspace-registration' })
    return effect(async () => {
      await createPrivatePiHome(invocation.project.id)
      await createPrivateOpenCodeRoot(invocation.project.id)
      const repo = await runtime.addRepo(workdir, 'folder')
      const workspace = getRepoMainWorktreeId(repo)
      return createController(context, invocation.project.id, workspace, receipt => checkpoint(context, receipt))
    })
  } }),
  defineMethod({ name: 'swa.controllerRecover', permission: 'workspace', params: wrapper, handler: ({ invocation }, context) => recoverController(invocation, context) }),
  defineMethod({ name: 'swa.taskCreate', permission: 'workspace', params: wrapper, handler: async ({ invocation }, context) => {
    const c = invocation.command
    if (!c.controller || c.action !== 'task.create' || !invocation.context || !invocation.spec) return fail('invalid_argument', 'A fixed task and context are required')
    const owned = controllerScope(context.runtime, invocation.project.id, c.controller)
    if (owned.scope.run_id) throw new OrchestrationError('request_mismatch', 'The controller already belongs to its fixed user task', { effectsApplied: false })
    await exactController(context.runtime, owned.owner)
    const requestId = reserve(context, invocation, { project_id: invocation.project.id, controller: c.controller, children: [`${c.request_id}/run-create`, `${c.request_id}/root-task`], stage: 'helper-input' })
    return effect(async () => {
      const reply = nativeObject((await helperCall(context.runtime, c.controller!, requestId, c.action, invocation)).result)
      const run = nativeObject(reply.run), task = nativeObject(reply.task)
      return { project_id: invocation.project.id, controller: c.controller, run_id: z.string().parse(run.id), root_task_id: z.string().parse(task.id), invocation, children: [`${requestId}/run-create`, `${requestId}/root-task`], native: reply }
    })
  } }),
  defineMethod({ name: 'swa.controllerDeliver', permission: 'workspace', params: wrapper, handler: async ({ invocation }, context) => {
    const c = invocation.command
    if (!c.controller || !['worker.start', 'worker.send', 'worker.stop', 'worker.release', 'task.complete'].includes(c.action)) return fail('invalid_argument', 'Unsupported controller mutation')
    const { scope, owner } = controllerScope(context.runtime, invocation.project.id, c.controller)
    await exactController(context.runtime, owner)
    validateTaskAction(context.runtime, invocation, scope)
    if (c.action === 'worker.start' || c.action === 'worker.send') {
      const selected = await resolveSelection(context.runtime, invocation.project.id, c)
      if (!invocation.selection || !isDeepStrictEqual(selected, invocation.selection)) return fail('request_mismatch', 'The exact selected Agent configuration changed before native execution')
    }
    if (c.action === 'worker.start') {
      if (c.agent !== 'pi' && c.agent !== 'opencode') return fail('unsupported_capability', 'The selected Agent has no approved structured launch policy')
      const support = await context.runtime.getStructuredAgentSessionCreateSupport(`id:${owner.worktree_id}`, c.agent)
      if (!support.supported) return fail('unsupported_capability', 'The selected workspace cannot launch the approved structured Agent')
      await admitWorkerResources()
    }
    const requestId = reserve(context, invocation, { project_id: invocation.project.id, controller: c.controller, run_id: scope.run_id, root_task_id: scope.root_task_id, action: c.action, selection: invocation.selection, child_request: `${c.request_id}/native`, stage: 'helper-input' })
    return effect(async () => ({ project_id: invocation.project.id, controller: c.controller, run_id: scope.run_id, root_task_id: scope.root_task_id, action: c.action, selection: invocation.selection, invocation: { ...invocation, scope }, child_request: `${requestId}/native`, native: (await helperCall(context.runtime, c.controller!, requestId, c.action, { ...invocation, scope })).result }))
  } }),
  defineMethod({ name: 'swa.observe', permission: 'workspace', params: wrapper, handler: async ({ invocation }, { runtime }) => {
    const c = invocation.command
    if (!c.controller || !['task.show', 'task.list', 'task.result', 'worker.show', 'worker.list', 'worker.read'].includes(c.action)) return fail('invalid_argument', 'Unsupported observation')
    const { scope, owner } = controllerScope(runtime, invocation.project.id, c.controller, { history: true })
    validateTaskAction(runtime, invocation, scope)
    const native = await observeTask(runtime, invocation, scope)
    const result = c.action === 'task.result' ? await completeTaskResult(runtime, scope, owner.worktree_id, native)
      : c.action === 'worker.show' ? { ...nativeObject(native), source: await observeWorkerSource(runtime, scope, owner.worktree_id, c.dispatch_id!) } : native
    return { scope, ...(c.action === 'task.result' ? { output_dir: c.output_dir } : {}), native: result }
  } }),
  defineMethod({ name: 'swa.controllerClose', permission: 'workspace', params: wrapper, handler: async ({ invocation }, context) => {
    const c = invocation.command
    if (!c.controller || c.action !== 'controller.close') return fail('invalid_argument', 'Exact controller close required')
    const { owner, scope } = controllerScope(context.runtime, invocation.project.id, c.controller)
    await exactController(context.runtime, owner)
    reserve(context, invocation, { project_id: invocation.project.id, controller: c.controller, action: c.action, binding: owner.binding, process: owner.process, helper: owner.helper, stage: 'controller-close' })
    return effect(async () => {
      await exactController(context.runtime, owner)
      const close = await context.runtime.closeTerminal(c.controller!)
      if (!close.ptyKilled) throw new Error('controller_exit_unproven')
      const remaining = await getLocalPtyProvider().listProcesses()
      if (remaining.some(row => row.id === owner.binding.ptyId)) throw new Error('controller_pty_still_present')
      const rows = await readWindowsProcessTableFresh()
      if (rows.some(row => [owner.process, owner.helper].some(old => old.pid === row.pid && old.creationTimeMs === row.creationTimeMs))) throw new Error('controller_process_exit_unproven')
      return { project_id: invocation.project.id, controller: c.controller, binding: owner.binding, process: owner.process, helper: owner.helper, close }
    })
  } })
]

async function observeRecovery(context: RpcContext, receipt: Record<string, unknown>) {
  const { runtime } = context, db = runtime.getOrchestrationDb()
  const prior = controllerOwnerSchema.parse(receipt.prior_owner)
  const scope = z.object({ project_id: z.string(), controller: z.string(), run_id: z.string().min(1), root_task_id: z.string().min(1), authority_domain: z.string(), context: z.unknown() }).parse(receipt.scope)
  const owner = controllerOwnerSchema.parse(receipt)
  await observeControllerExited(runtime, prior)
  await exactController(runtime, owner)
  const live = runtime.getOrchestrationDispatchAuthority(owner.controller)
  if (!live?.launchTokenHash || live.launchTokenHash !== owner.caller_authority.launchTokenHash || live.paneKey !== owner.caller_authority.paneKey || live.processIncarnation !== owner.caller_authority.processIncarnation || !isDeepStrictEqual(live.hostScope, owner.caller_authority.hostScope)) return fail('operation_unknown', 'The recovered helper current authority is unavailable')
  const runUse = db.getMutationReceipt(authority(runtime), z.string().parse(receipt.run_use_request))
  if (runUse?.method !== 'orchestration.runUse' || runUse.state !== 'completed' || !runUse.receipt) return fail('operation_unknown', 'The original native Run binding remains unconfirmed')
  const bound = nativeObject(nativeObject(JSON.parse(runUse.receipt)).run)
  const run = db.getRun(scope.run_id), task = db.getTask(scope.root_task_id)
  const oldGeneration = z.number().int().nonnegative().parse(receipt.prior_generation)
  if (!run || !task || task.run_id !== run.id || task.parent_id !== null || run.id !== bound.id || run.coordinator_handle !== owner.controller || run.coordinator_pane_key !== owner.caller_authority.paneKey || run.consumer_generation <= oldGeneration || run.consumer_generation !== bound.consumer_generation || bound.coordinator_handle !== owner.controller || !isDeepStrictEqual(nativeObject(JSON.parse(task.spec)).context, scope.context)) return fail('operation_unknown', 'The recovered Run, root, context or native consumer generation differs')
  return { ...receipt, scope: { ...scope, controller: owner.controller }, run_id: run.id, root_task_id: task.id, consumer_generation: run.consumer_generation, native: JSON.parse(runUse.receipt), stage: 'completed' }
}

async function recoverController(invocation: Invocation, context: RpcContext) {
  const { runtime } = context, db = runtime.getOrchestrationDb(), mutation = context.orchestrationMutation
  const command = invocation.command
  if (command.action !== 'controller.recover' || !command.controller || !mutation || mutation.requestId !== command.request_id) return fail(context.replayedMutationReceipt === undefined ? 'request_mismatch' : 'operation_unknown', 'The exact public recovery request is required')
  if (context.replayedMutationReceipt !== undefined) {
    const observed = await effect(async () => {
      const receipt = nativeObject(context.replayedMutationReceipt)
      const fields = {
        project_id: z.string().min(1), prior_controller: z.string().min(1), prior_owner: controllerOwnerSchema,
        prior_generation: z.number().int().nonnegative(), scope: scopeSchema, invocation: invocationSchema,
        run_use_request: z.string().min(1), children: z.array(z.string().min(1)),
        stage: z.enum(['scope-reserved', 'pty-spawn', 'helper-ready', 'run-use'])
      }
      const original = z.object(fields).parse(receipt)
      if (original.stage === 'scope-reserved') z.strictObject(fields).parse(receipt)
      if (original.project_id !== invocation.project.id || original.prior_controller !== command.controller || original.prior_owner.controller !== command.controller || original.prior_owner.project_id !== invocation.project.id || !isDeepStrictEqual(original.invocation, invocation) || !isDeepStrictEqual(original.scope, invocation.scope) || original.run_use_request !== `${mutation.requestId}/run-use` || !isDeepStrictEqual(original.children, [`${mutation.requestId}/controller-pty`, `${mutation.requestId}/run-use`])) throw new Error('The original pending recovery scope is incomplete or inconsistent')
      if (receipt.stage === 'scope-reserved') {
        const scope = z.object({ run_id: z.string().min(1) }).parse(receipt.scope)
        const prior = controllerOwnerSchema.parse(receipt.prior_owner), run = db.getRun(scope.run_id)
        if (!run || run.coordinator_handle !== prior.controller || run.consumer_generation !== receipt.prior_generation) return fail('operation_unknown', 'The original pre-effect recovery consumer changed')
        let exits: Awaited<ReturnType<typeof observeControllerExited>>
        try { exits = await observeControllerExited(runtime, prior) }
        catch (error) {
          const proof = z.object({ effectsApplied: z.literal(false), observations: z.array(z.object({ observed_at: z.iso.datetime(), ptys: z.number().int().nonnegative(), processes: z.number().int().nonnegative() })).length(2) }).safeParse(error instanceof OrchestrationError ? error.data : undefined)
          if (error instanceof OrchestrationError && error.code === 'controller_unverifiable' && proof.success && proof.data.observations.every(row => row.ptys > 0 || row.processes > 0)) return { kind: 'effect-free' as const, error }
          throw error
        }
        return { kind: 'effect-free' as const, error: new OrchestrationError('controller_unverifiable', 'The original recovery stopped before controller creation and will not replay effects', { effectsApplied: false, stage: receipt.stage, observations: exits }) }
      }
      return { kind: 'completed' as const, result: await observeRecovery(context, receipt) }
    })
    if (observed.kind === 'effect-free') throw observed.error
    return observed.result
  }
  let reserved: Record<string, unknown>
  db.db.exec('BEGIN IMMEDIATE')
  try {
    const { owner, scope } = controllerScope(runtime, invocation.project.id, command.controller, { history: true })
    const run = db.getRun(scope.run_id)
    if (!run || !scope.root_task_id || !isDeepStrictEqual(invocation.scope, scope) || run.coordinator_handle !== owner.controller || run.coordinator_pane_key !== owner.caller_authority.paneKey) return fail('scope_denied', 'Recovery requires the original fixed Run, root and current prior consumer')
    const competing = z.object({ count: z.number().int() }).parse(db.db.prepare(`SELECT COUNT(*) AS count FROM mutation_receipts
      WHERE caller_fingerprint=? AND method='swa.controllerRecover' AND state='pending' AND request_id<>?
      AND json_valid(receipt)=1 AND json_extract(receipt, '$.scope.run_id')=?`).get(authority(runtime), mutation.requestId, run.id))
    if (competing.count) throw new OrchestrationError('operation_in_progress', 'Another original recovery still owns this Run', { effectsApplied: false })
    reserved = { project_id: invocation.project.id, prior_controller: owner.controller, prior_owner: owner, prior_generation: run.consumer_generation, scope, invocation, run_use_request: `${mutation.requestId}/run-use`, children: [`${mutation.requestId}/controller-pty`, `${mutation.requestId}/run-use`], stage: 'scope-reserved' }
    db.checkpointPendingMutationReceipt({ ...mutation, receipt: JSON.stringify(reserved) })
    db.db.exec('COMMIT')
  } catch (error) {
    db.db.exec('ROLLBACK')
    if (error instanceof OrchestrationError) throw error
    throw new OrchestrationError('operation_unknown', 'The original recovery reservation could not be confirmed')
  }
  const prior = controllerOwnerSchema.parse(reserved.prior_owner)
  try {
    reserved.prior_exit_observations = await observeControllerExited(runtime, prior)
  } catch (error) {
    if (error instanceof OrchestrationError && error.code === 'controller_unverifiable') throw error
    throw new OrchestrationError('operation_unknown', 'The prior controller exit remains unconfirmed')
  }
  assertDeliveryGrantCurrent(invocation)
  return effect(async () => {
    const scope = z.object({ run_id: z.string().min(1) }).parse(reserved.scope)
    const current = db.getRun(scope.run_id)
    if (!current || current.coordinator_handle !== prior.controller || current.consumer_generation !== reserved.prior_generation) throw new Error('The original Run consumer changed before controller creation')
    const owner = await createController(context, invocation.project.id, prior.worktree_id, partial => {
      reserved = { ...reserved, ...partial }
      db.checkpointPendingMutationReceipt({ ...mutation, receipt: JSON.stringify(reserved) })
    })
    reserved = { ...reserved, ...owner, stage: 'run-use' }
    db.checkpointPendingMutationReceipt({ ...mutation, receipt: JSON.stringify(reserved) })
    await exactController(runtime, owner)
    assertDeliveryGrantCurrent(invocation)
    await helperCall(runtime, owner.controller, mutation.requestId, 'recover.v1', invocation)
    return observeRecovery(context, reserved)
  })
}

async function resolveSelection(runtime: OrcaRuntimeService, project: string, command: Invocation['command']): Promise<AgentSelection> {
  if (command.action === 'worker.start') {
    if (!command.agent || !command.model) return fail('invalid_argument', 'An explicit native Agent and model are required')
    return selectAgent(runtime, project, command.agent, command.model)
  }
  if (command.action !== 'worker.send' || !command.controller || !command.dispatch_id) return fail('invalid_argument', 'Only a start or an exact existing Worker input resolves a model selection')
  const { scope } = controllerScope(runtime, project, command.controller)
  validateTaskAction(runtime, { command }, scope)
  const db = runtime.getOrchestrationDb()
  const rows = z.array(z.object({ receipt: z.string() })).parse(db.db.prepare(`SELECT receipt FROM mutation_receipts
    WHERE caller_fingerprint=? AND method='swa.controllerDeliver' AND state='completed'
    AND json_valid(receipt)=1 AND json_extract(receipt, '$.project_id')=?
    AND json_extract(receipt, '$.run_id')=? AND json_extract(receipt, '$.root_task_id')=? AND json_extract(receipt, '$.action')='worker.start'
    AND json_extract(receipt, '$.native.dispatchId')=?`).all(authority(runtime), project, scope.run_id, scope.root_task_id, command.dispatch_id))
  if (rows.length !== 1) return fail('operation_unknown', 'The exact original Worker start selection is unavailable')
  const original = agentSelectionSchema.parse(nativeObject(JSON.parse(rows[0]!.receipt)).selection)
  const dispatch = db.getDispatchContextById(command.dispatch_id)
  const record = dispatch?.assignee_orca_session_id && runtime.openedAgentSessionRecordStore()?.getRecord(dispatch.assignee_orca_session_id)
  if (!record || record.provider !== original.agent_id || record.options?.model !== original.model) return fail('worker_identity_changed', 'The actual Worker session does not match its original Agent selection')
  const current = await selectAgent(runtime, project, original.agent_id, original.model)
  if (!isDeepStrictEqual(original, current)) return fail('request_mismatch', 'The original Worker Agent source changed; preserve the original selection')
  return original
}

function requireReleased(runtime: OrcaRuntimeService, scope: Scope) {
  if (!scope.run_id) return
  const resources = runtime.getOrchestrationDb().listWorkerTerminalResources({ runId: scope.run_id, limit: 100 })
  if (resources.some(row => row.resource ? row.resource.release_state !== 'released' : !confirmedUnstartedWorker(runtime, scope, row.dispatchId))) fail('worker_release_unconfirmed', 'All exact Worker resources must be archived and released')
}

function confirmedUnstartedWorker(runtime: OrcaRuntimeService, scope: Scope, dispatchId: string): boolean {
  const db = runtime.getOrchestrationDb(), worker = db.getWorkerDispatch(dispatchId), dispatch = db.getDispatchContextById(dispatchId)
  if (!worker || !dispatch || worker.state !== 'failed' || worker.stage !== 'terminal_create' || worker.runtime_epoch !== runtime.getRuntimeId() ||
      dispatch.status !== 'failed' || dispatch.run_id !== scope.run_id || dispatch.assignee_handle || dispatch.assignee_pane_key ||
      dispatch.assignee_orca_session_id || dispatch.process_incarnation || worker.agent_terminal_handle ||
      db.getWorkerTerminalResourceByOwner(dispatchId) || db.getWorkerTerminalResourceFormerlyOwnedBy(dispatchId)) return false
  const effects = z.array(z.union([
    z.strictObject({ kind: z.literal('worktree'), action: z.literal('reused'), id: z.string() }),
    z.strictObject({ kind: z.literal('setup'), action: z.literal('not_applicable'), state: z.literal('not_applicable') })
  ])).safeParse(JSON.parse(worker.effects))
  if (!effects.success || effects.data.some(effect => effect.kind === 'worktree' && effect.id !== worker.worktree_id) ||
      !isDeepStrictEqual(JSON.parse(worker.residual_resources), [])) return false
  const parents = z.array(z.object({ receipt: z.string() })).parse(db.db.prepare(`SELECT receipt FROM mutation_receipts
    WHERE caller_fingerprint=? AND method='swa.controllerDeliver' AND state='completed' AND json_valid(receipt)=1
    AND json_extract(receipt, '$.controller')=? AND json_extract(receipt, '$.run_id')=?
    AND json_extract(receipt, '$.root_task_id')=? AND json_extract(receipt, '$.action')='worker.start'
    AND json_extract(receipt, '$.native.dispatchId')=?`).all(authority(runtime), scope.controller, scope.run_id, scope.root_task_id, dispatchId))
  if (parents.length !== 1) return false
  const parent = nativeObject(JSON.parse(parents[0]!.receipt)), child = db.getMutationReceipt(authority(runtime), z.string().parse(parent.child_request))
  if (!child || child.method !== 'orchestration.workerStart' || child.state !== 'completed' || !child.receipt) return false
  const original = nativeObject(JSON.parse(child.receipt)), mirrored = nativeObject(parent.native)
  if (original.dispatchId !== dispatchId || original.runId !== scope.run_id || original.taskId !== dispatch.task_id ||
      original.state !== 'failed' || original.stage !== worker.stage || original.nativeCreation !== 'not_started' ||
      !isDeepStrictEqual(mirrored, original) || !isDeepStrictEqual(original.effects, effects.data) ||
      !isDeepStrictEqual(original.residualResources, [])) return false
  const pending = z.object({ count: z.number().int() }).parse(db.db.prepare(`SELECT COUNT(*) AS count FROM mutation_receipts
    WHERE state='pending' AND json_valid(receipt)=1 AND (
      (json_extract(receipt, '$.runId')=? AND json_extract(receipt, '$.dispatchId')=?) OR
      (json_extract(receipt, '$.run_id')=? AND json_extract(receipt, '$.action') IN ('worker.start','worker.send','worker.stop','worker.release'))
    )`).get(scope.run_id, dispatchId, scope.run_id))
  return pending.count === 0
}

// 准入与 checkpoint 在同一个原生事务中完成，未知请求继续占用原生 receipt。
function reserve(context: RpcContext, invocation: Invocation, receipt: Record<string, unknown>) {
  const runtime = context.runtime, db = runtime.getOrchestrationDb(), c = invocation.command
  if (!context.orchestrationMutation || context.orchestrationMutation.requestId !== c.request_id || !c.controller) fail('request_mismatch', 'The public and native request IDs must match')
  db.db.exec('BEGIN IMMEDIATE')
  try {
    const fresh = controllerScope(runtime, invocation.project.id, c.controller)
    if (recorded(runtime, 'swa.controllerClose', c.controller)) fail('controller_closing', 'The exact controller already reserved its close; inspect the original request')
    if (c.action === 'task.create') {
      if (fresh.scope.run_id || recorded(runtime, 'swa.taskCreate', c.controller)) fail('request_mismatch', 'This controller already reserved its one user task')
    } else if (c.action === 'controller.close') {
      const pending = z.object({ count: z.number().int() }).parse(db.db.prepare(`SELECT COUNT(*) AS count FROM mutation_receipts
        WHERE caller_fingerprint=? AND state='pending' AND json_valid(receipt)=1
        AND (json_extract(receipt, '$.controller')=? OR json_extract(receipt, '$.run_id')=?)
        AND (method='swa.taskCreate' OR (method='swa.controllerDeliver' AND json_extract(receipt, '$.action')='worker.start'))`).get(authority(runtime), c.controller, fresh.scope.run_id))
      if (pending.count > 0) fail('operation_in_progress', 'A native task or Worker creation still owns its reservation')
      requireReleased(runtime, fresh.scope)
    } else {
      validateTaskAction(runtime, invocation, fresh.scope)
      if (c.action === 'worker.start') {
        const children = db.listTasksWithDispatch({ runId: fresh.scope.run_id }).filter(task => task.parent_id === fresh.scope.root_task_id)
        const taskIds = new Set(children.map(task => task.id))
        const pending = z.array(z.object({ receipt: z.string() })).parse(db.db.prepare(`SELECT receipt FROM mutation_receipts
          WHERE caller_fingerprint=? AND method='swa.controllerDeliver' AND state='pending'
          AND json_valid(receipt)=1 AND json_extract(receipt, '$.run_id')=?
          AND json_extract(receipt, '$.action')='worker.start'`).all(authority(runtime), fresh.scope.run_id))
        let uncreated = 0
        for (const item of pending) {
          const held = z.object({ child_request: z.string() }).parse(JSON.parse(item.receipt))
          const child = db.getMutationReceipt(authority(runtime), held.child_request)
          const accepted = child && getPendingWorkerStartRecovery('orchestration.workerStart', child.receipt)
          const complete = child?.receipt ? z.object({ dispatchId: z.string().optional() }).parse(JSON.parse(child.receipt)).dispatchId : undefined
          const dispatchId = accepted?.dispatchId ?? complete
          const dispatch = dispatchId ? db.getDispatchContextById(dispatchId) : undefined
          if (!dispatch || !taskIds.has(dispatch.task_id)) uncreated++
        }
        if (children.length + uncreated >= 2) fail('resource_limit', 'The fixed task has reserved both Worker slots')
      }
    }
    const requestId = checkpoint(context, { ...receipt, invocation: { ...invocation, scope: fresh.scope } })
    db.db.exec('COMMIT')
    return requestId
  } catch (error) {
    db.db.exec('ROLLBACK')
    throw error
  }
}

function validateTaskAction(runtime: OrcaRuntimeService, invocation: Pick<Invocation, 'command' | 'input'>, scope: Scope) {
  const c = invocation.command, db = runtime.getOrchestrationDb()
  if (!scope.run_id || c.task_id && c.task_id !== scope.root_task_id) fail('scope_denied', 'The command must name its exact root task')
  if (c.dispatch_id) {
    const dispatch = db.getDispatchContextById(c.dispatch_id)
    const task = dispatch && db.getTask(dispatch.task_id)
    if (!dispatch || dispatch.run_id !== scope.run_id || !task || task.parent_id !== scope.root_task_id) fail('scope_denied', 'The exact Worker does not belong to this root task')
    if (['worker.send', 'worker.stop', 'worker.release'].includes(c.action)) {
      const worker = db.getWorkerDispatch(c.dispatch_id)
      if (!worker || worker.runtime_epoch !== runtime.getRuntimeId()) fail('operation_unknown', 'The original Worker Job belongs to a different runtime generation; preserve its resources')
      if (c.action === 'worker.send' && worker.state !== 'ready') fail('operation_unknown', 'The exact Worker is not ready for a new approved input')
    }
  }
  const tasks = db.listTasksWithDispatch({ runId: scope.run_id })
  if (c.action === 'worker.start' && tasks.filter(task => task.parent_id === scope.root_task_id).length >= 2) fail('resource_limit', 'The fixed task permits exactly two Workers')
  if (c.action === 'task.complete') {
    requireReleased(runtime, scope)
    if (tasks.filter(task => task.parent_id === scope.root_task_id).length !== 2 || !invocation.input) fail('evidence_missing', 'The two Worker tasks and explicit result are required')
  }
}
