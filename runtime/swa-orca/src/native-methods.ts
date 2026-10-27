import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { isDeepStrictEqual, stripVTControlCharacters } from 'node:util'
import { z } from 'zod'
import { buildRegistry, defineMethod, isStreamingMethod, type RpcContext } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/core'
import type { OrcaRuntimeService } from '../../../third_party/orca-v1.4.230/src/main/runtime/orca-runtime'
import type { TerminalCreateOptions } from '../../../third_party/orca-v1.4.230/src/main/runtime/runtime-terminal-contracts'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import { deriveRemoteRuntimeTerminalCreateHandle } from '../../../third_party/orca-v1.4.230/src/main/runtime/remote-runtime-terminal-create-identity'
import { getRepoMainWorktreeId } from '../../../third_party/orca-v1.4.230/src/shared/worktree/id'
import { getLocalPtyProvider } from '../../../third_party/orca-v1.4.230/src/main/ipc/pty/provider/registry'
import { getStructuredAgentSessionHost } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-wire/structured-agent-session-registry'
import { readWindowsProcessIdentityTableFresh } from '../../../third_party/orca-v1.4.230/src/main/windows/windows-process-table'
import { quotePowerShellNativeArgument } from '../../../third_party/orca-v1.4.230/src/shared/powershell-native-argument'
import { resolveWindowsShellLaunchArgs } from '../../../third_party/orca-v1.4.230/src/main/providers/windows-shell-args'
import { quotePosixShellString } from '../../../third_party/orca-v1.4.230/src/main/agent-hooks/posix-hook-command'
import { readSwaLinuxProcess, requireSwaLinuxAncestor } from '../../../third_party/orca-v1.4.230/src/main/daemon/swa-linux-process-identity'
import { createIncrementalNdjsonFramer } from '../../../third_party/orca-v1.4.230/src/shared/main-process-ndjson-framer'
import { getPendingWorkerStartRecovery } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-receipt'
import { invocationSchema, helperReply, nativeObject, nativeError, commandSchema, capabilityRequirementsSchema, agentSelectionSchema, scopeSchema, type AgentSelection, type Invocation, type Scope } from './contracts'
import { discoverAgents, selectAgent, registeredAgent } from './agent-discovery'
import { admitWorkerResources } from './resource-admission'
import { completeTaskResult, observeWorkerSource, readNativeInputStatus } from './task-result'
import { createPrivatePiProjectRoot } from './private-pi-account'
import { createPrivateOpenCodeRoot } from './private-opencode-account'
import { createPrivateCodexRoot } from './private-codex-account'
import { deliverNativeWorkerInput } from './worker-input'
import { assertDeliveryGrantCurrent } from './delivery-admission'
import { authority, controllerOwnerSchema, controllerScope, exactController, observeControllerExited, recorded } from './controller-scope'
import { approvedWorkerLimit, assertCompletionInventory, assertWorkerCapacity, assertWorkerStartOpen } from './task-budget'
import { readRunView, readRunTaskTree, isTaskDescendant } from './run-view'
import { collaborationRead, writeCollaborationRecords, resolveCollaborationReferences, assertCurrentCollaborationAssignment } from './collaboration-records'
import { requestRunSettlement, validateHandoffInput } from './run-settlement'
import { assertQuestionReservation, questionStartSelection, readAnswerQuestion, validateQuestionAnswer } from './question-answer'
import { assertQuestionResume, observeRunQuestions } from './question-ask'
import { getOrchestrationMutationExecutor } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-executor'
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

async function observeTask(runtime: OrcaRuntimeService, invocation: Pick<Invocation, 'command'>, scope: Scope) {
  const c = invocation.command, run = scope.run_id
  if (c.action === 'worker.show') return nativeHistory(runtime, 'orchestration.workerShow', { dispatch: c.dispatch_id })
  if (c.action === 'worker.read') return nativeHistory(runtime, 'orchestration.workerRead', { dispatch: c.dispatch_id, source: 'transcript', limit: c.limit, ...(c.cursor ? { cursor: c.cursor } : {}) })
  if (c.action === 'worker.list') return nativeHistory(runtime, 'orchestration.workerList', { run, paginate: true, limit: 100 })
  const tasks = nativeObject(await nativeHistory(runtime, 'orchestration.taskList', { run }))
  if (c.action !== 'task.result') return tasks
  const rows = z.array(z.looseObject({ id: z.string(), parent_id: z.string().nullable() })).parse(tasks.tasks)
  if (!rows.some(task => task.id === scope.root_task_id)) throw new Error('The original native root task is unavailable')
  const children = new Set(readRunTaskTree(runtime.getOrchestrationDb(), scope).tasks.filter(task => task.id !== scope.root_task_id).map(task => task.id))
  const workers: { dispatchId: string; taskId: string; runId: string; [key: string]: unknown }[] = []
  const cursors = new Set<string>()
  let cursor: string | undefined
  for (;;) {
    const fleet = nativeObject(await nativeHistory(runtime, 'orchestration.workerList', { run, paginate: true, limit: 100, ...(cursor ? { cursor } : {}) }))
    workers.push(...z.array(z.looseObject({ dispatchId: z.string(), taskId: z.string(), runId: z.string() })).parse(fleet.workers))
    if (workers.length > 100_000) throw new Error('The complete native Worker inventory exceeds its read bound')
    const page = z.object({ hasMore: z.boolean(), nextCursor: z.string().nullable() }).parse(fleet.page)
    if (!page.hasMore) break
    if (!page.nextCursor || cursors.has(page.nextCursor)) throw new Error('The native Worker listing did not advance its original cursor')
    cursor = page.nextCursor
    cursors.add(cursor)
  }
  if (new Set(workers.map(worker => worker.dispatchId)).size !== workers.length) throw new Error('The native Worker listing repeated a Dispatch')
  const outputs = []
  for (const worker of workers) {
    if (worker.runId !== run || !children.has(worker.taskId)) throw new Error('The native Worker belongs to another fixed task')
    outputs.push({ worker, observation: await nativeHistory(runtime, 'orchestration.workerShow', { dispatch: worker.dispatchId }) })
  }
  return { run: await nativeHistory(runtime, 'orchestration.runShow', { id: run }), tasks, workers: outputs }
}

export async function collectRunResult(runtime: OrcaRuntimeService, scope: Scope, workspaceId: string, dispatchId?: string) {
  return completeTaskResult(runtime, scope, workspaceId, await observeTask(runtime, { command: { action: 'task.result' } }, scope), dispatchId)
}

export async function deliverRunHandoff(runtime: OrcaRuntimeService, invocation: Invocation) {
  if (!invocation.handoff || !invocation.command.request_id) return fail('scope_denied', 'The native handoff continuation is required')
  validateHandoffInput(runtime, invocation)
  const method = buildRegistry(SWA_METHODS).get('swa.controllerDeliver')
  if (!method || isStreamingMethod(method)) return fail('evidence_missing', 'The original native input handler is unavailable')
  const id = invocation.command.request_id
  return getOrchestrationMutationExecutor(runtime).run({ id, authToken: '', method: method.name, orchestrationRequestId: id }, { invocation }, mutation => {
    if (!mutation) return fail('request_mismatch', 'The original native handoff mutation identity is unavailable')
    return method.handler(method.params?.parse({ invocation }), { runtime, authenticatedCallerFingerprint: authority(runtime), orchestrationMutation: mutation.identity, recordMutationReceipt: mutation.recordReceipt, markMutationEffectPossible: mutation.markEffectPossible })
  }, authority(runtime))
}

async function helperCall(runtime: OrcaRuntimeService, controller: string, requestId: string, action: string, invocation?: Invocation) {
  const ptyId = runtime.getTerminalPtyIdForHandle(controller)
  if (!ptyId) return fail('operation_unknown', 'The native helper is unavailable')
  let stop = () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  const writeAbort = new AbortController()
  const response = new Promise<z.infer<typeof helperReply>>((resolve, reject) => {
    const framer = createIncrementalNdjsonFramer(value => {
      const parsed = helperReply.safeParse(value)
      if (!parsed.success || parsed.data.request_id !== requestId || parsed.data.controller !== controller) return
      resolve(parsed.data)
    }, rejected => {
      if (rejected.kind === 'line-too-long') reject(new OrchestrationError('operation_unknown', 'Controller response exceeded the declared bound'))
    }, { maxLineBytes: 16 * 1024 * 1024 })
    stop = runtime.subscribeToTerminalData(ptyId, data => framer.feed(stripVTControlCharacters(data)))
    timer = setTimeout(() => {
      writeAbort.abort()
      reject(new OrchestrationError('operation_unknown', 'The controller action may have reached its exact PTY'))
    }, 120_000)
  })
  try {
    const write = runtime.sendTerminal(controller, { text: JSON.stringify({ type: 'swa_controller_action', request_id: requestId, action, ...(invocation ? { invocation } : {}) }), enter: true }, { inputKind: 'driving', requireWriteSettlement: true, signal: writeAbort.signal }).then(written => {
      if (!written.accepted) throw new OrchestrationError('operation_unknown', 'The controller input settlement is unknown')
    })
    const [, reply] = await Promise.all([write, response])
    if (reply.error) throw new OrchestrationError(reply.error.code, reply.error.message)
    return reply
  } finally {
    writeAbort.abort()
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

// Linux 由原生宿主选择登录 shell；per-terminal override 只适用于 Windows。
export function controllerTerminalOptions(node: string, entry: string, preAllocatedHandle: string, platform: NodeJS.Platform = process.platform): TerminalCreateOptions {
  const command = platform === 'linux' ? `exec ${quotePosixShellString(node)} ${quotePosixShellString(entry)}` : `& ${quotePowerShellNativeArgument(node)} ${quotePowerShellNativeArgument(entry)}; exit $LASTEXITCODE`
  return {
    command, env: { SWA_CONTROLLER_HELPER: '1' }, ...(platform === 'win32' ? { shellOverride: 'pwsh.exe' } : {}), startupCommandDelivery: 'fast',
    launchConfig: { agentCommand: `"${node}"`, agentArgs: `"${entry}"`, agentEnv: { SWA_CONTROLLER_HELPER: '1' } },
    title: 'SWA controller', presentation: 'background', focus: false, activate: false, preAllocatedHandle
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
  const options = controllerTerminalOptions(node, entry, controller)
  if (launchScope.connectionId || process.platform !== 'linux' && process.platform !== 'win32' || process.platform === 'win32' && !resolveWindowsShellLaunchArgs('pwsh.exe', launchScope.path, launchScope.path, undefined, options.command).startupCommandDeliveredInShellArgs) throw new Error('native_controller_startup_delivery_unavailable')
  const terminal = await runtime.dedupeTerminalCreate('swa-controller-local', `id:${workspace}`, childId, false,
    (canonical, preAllocatedHandle) => runtime.createTerminal(canonical, {
      ...options, preAllocatedHandle
    }))
  if (terminal.handle !== controller) throw new Error('native_controller_handle_mismatch')
  const observed = await helperCall(runtime, controller, requestId, 'identify')
  const binding = runtime.getTerminalPromptRequestBinding(controller)
  const listed = await getLocalPtyProvider().listProcesses()
  const pty = listed.find(row => row.id === binding.ptyId && row.terminalHandle === controller && row.incarnationId === binding.processIncarnation)
  if (!pty?.rootProcessId) throw new Error('native_controller_process_missing')
  let rootProcess: z.infer<typeof controllerOwnerSchema>['process'], helperProcess: z.infer<typeof controllerOwnerSchema>['helper']
  if (process.platform === 'linux') {
    rootProcess = readSwaLinuxProcess(pty.rootProcessId)
    helperProcess = readSwaLinuxProcess(observed.pid)
    requireSwaLinuxAncestor(helperProcess, rootProcess)
  } else {
    const rows = await readWindowsProcessIdentityTableFresh()
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
    rootProcess = { pid: root.pid, creationTimeMs: root.creationTimeMs, name: root.name }
    helperProcess = { pid: helper.pid, creationTimeMs: helper.creationTimeMs, name: helper.name }
  }
  const live = runtime.getOrchestrationDispatchAuthority(controller)
  const processIncarnation = runtime.getTerminalProcessIncarnation(controller)
  if (!live?.launchTokenHash || !live.paneKey || !processIncarnation || live.hostScope.kind !== 'local' || live.ptyId !== binding.ptyId || live.processIncarnation !== processIncarnation) throw new Error('The actual controller launch commitment is unavailable')
  const caller_authority = { terminalHandle: controller, paneKey: live.paneKey, processIncarnation, launchTokenHash: live.launchTokenHash, hostScope: live.hostScope }
  const owner = { ...fixed, controller, binding, process: rootProcess, helper: helperProcess, caller_authority }
  save({ ...owner, stage: 'helper-ready' })
  const current = await helperCall(runtime, controller, requestId, 'observe')
  return { ...owner, observation: current.result }
}

export const SWA_METHODS = [
  defineMethod({ name: 'swa.collaborationRead', permission: 'workspace', params: wrapper, handler: ({ invocation }, { runtime }) => ({ native: collaborationRead(runtime.getOrchestrationDb(), invocation) }) }),
  defineMethod({ name: 'swa.collaborationWrite', permission: 'workspace', params: wrapper, handler: ({ invocation }, context) => {
    if (!context.orchestrationMutation) return fail('request_mismatch', 'The original durable collaboration request is required')
    const scope = invocation.command.action === 'handoff.notify' && invocation.command.controller ? controllerScope(context.runtime, invocation.project.id, invocation.command.controller).scope : undefined
    const receipt = writeCollaborationRecords(context.runtime.getOrchestrationDb(), invocation, context.orchestrationMutation, scope)
    context.markMutationEffectPossible?.()
    return receipt
  } }),
  defineMethod({ name: 'swa.registeredAgent', permission: 'workspace', params: z.strictObject({ agent_id: z.string().min(1) }), handler: ({ agent_id }, { runtime }) => registeredAgent(runtime, agent_id) }),
  defineMethod({ name: 'swa.status', permission: 'workspace', params: null, handler: (_params, { runtime }) => ({
    native: runtime.getStatus(), authority_domain: authority(runtime),
    databases: runtime.getOrchestrationDb().db.pragma('database_list'),
    agent_discovery: 'swa.capabilities', execution_validation: 'requires_actual_selected_native_agent_session'
  }) }),
  defineMethod({ name: 'swa.capabilities', permission: 'workspace', params: z.strictObject({ project_id: z.string().min(1), project_root: z.string().min(1).refine(isAbsolute), requirements: capabilityRequirementsSchema }), handler: ({ requirements, project_root }, { runtime }) => discoverAgents(runtime, requirements, project_root) }),
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
    const submission = invocation.submission ? { submission: invocation.submission, children: [invocation.submission.task_request_id, invocation.submission.worker_request_id] } : {}
    checkpoint(context, { ...submission, project_id: invocation.project.id, workdir, stage: 'workspace-registration' })
    return effect(async () => {
      await createPrivatePiProjectRoot(invocation.project.id)
      await createPrivateOpenCodeRoot(invocation.project.id)
      await createPrivateCodexRoot(invocation.project.id)
      const repo = await runtime.addRepo(workdir, 'folder')
      const workspace = getRepoMainWorktreeId(repo)
      return { ...await createController(context, invocation.project.id, workspace, receipt => checkpoint(context, { ...submission, ...receipt })), ...submission }
    })
  } }),
  defineMethod({ name: 'swa.runObserve', permission: 'workspace', params: wrapper, handler: async ({ invocation }, { runtime }) => {
    const command = invocation.command
    if (!command.controller || !command.run_id || !command.task_id || !['run.show', 'run.export'].includes(command.action)) return fail('invalid_argument', 'An exact Run, root task and controller are required')
    const { scope, owner } = controllerScope(runtime, invocation.project.id, command.controller, { history: true })
    if (scope.run_id !== command.run_id || scope.root_task_id !== command.task_id) return fail('scope_denied', 'The Run observation differs from its original project association')
    requestRunSettlement(runtime, scope)
    const execution = { executor: getOrchestrationMutationExecutor(runtime), runtimeEpoch: runtime.getRuntimeId(), questions: () => observeRunQuestions(runtime, scope) }
    const runView = readRunView(runtime.getOrchestrationDb(), scope, execution)
    if (command.action === 'run.show') return { scope, native: { run_view: runView } }
    const summary = await observeTask(runtime, { ...invocation, command: { ...command, action: 'task.result' } }, scope)
    const result = await completeTaskResult(runtime, scope, owner.worktree_id, summary)
    const after = readRunView(runtime.getOrchestrationDb(), scope, execution)
    if (!isDeepStrictEqual({ ...runView, observed_at: null }, { ...after, observed_at: null })) return fail('operation_unknown', 'The Run changed while collecting its complete export')
    return { scope, output_dir: command.output_dir, native: { run_view: after, result } }
  } }),
  defineMethod({ name: 'swa.controllerRecover', permission: 'workspace', params: wrapper, handler: ({ invocation }, context) => recoverController(invocation, context) }),
  defineMethod({ name: 'swa.taskCreate', permission: 'workspace', params: wrapper, handler: async ({ invocation }, context) => {
    const c = invocation.command
    if (!c.controller || c.action !== 'task.create' || !invocation.context || !invocation.spec) return fail('invalid_argument', 'A fixed task and context are required')
    const references = z.object({ role_id: z.string().optional(), role_revision: z.number().int().positive().optional(), conversation_id: z.string().optional() }).parse(invocation.spec)
    invocation.spec = { ...invocation.spec, ...resolveCollaborationReferences(context.runtime.getOrchestrationDb(), invocation.project.id, references) }
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
    if (!c.controller || !['worker.start', 'worker.send', 'worker.stop', 'worker.release', 'task.complete', 'question.answer', 'question.resume'].includes(c.action)) return fail('invalid_argument', 'Unsupported controller mutation')
    const { scope, owner } = controllerScope(context.runtime, invocation.project.id, c.controller)
    await exactController(context.runtime, owner)
    validateTaskAction(context.runtime, invocation, scope)
    validateHandoffInput(context.runtime, invocation)
    if (['worker.start', 'worker.send', 'question.answer', 'question.resume'].includes(c.action)) {
      const selected = await resolveSelection(context.runtime, invocation.project.id, c)
      if (!invocation.selection || !isDeepStrictEqual(selected, invocation.selection)) return fail('request_mismatch', 'The exact selected Agent configuration changed before native execution')
    }
    if (c.action === 'worker.start') {
      const db = context.runtime.getOrchestrationDb(), root = db.getTask(scope.root_task_id)
      const fixed = nativeObject(JSON.parse(root!.spec)), spec = nativeObject(fixed.spec)
      const parent = db.getTask(c.parent_task_id ?? scope.root_task_id)!
      const parentCount = z.object({ count: z.number() }).parse(db.db.prepare("SELECT COUNT(*) count FROM dispatch_contexts WHERE task_id=? AND status IN ('pending','dispatched')").get(parent.id)).count
      if (parentCount > 1 || parent.id !== scope.root_task_id && parentCount !== 1 || parent.id === scope.root_task_id && c.reply_mode === 'resume') return fail('scope_denied', 'The handoff needs one exact active parent Worker for continuation')
      const parentDispatch = db.db.prepare("SELECT id FROM dispatch_contexts WHERE task_id=? AND status IN ('pending','dispatched')").get(parent.id)
      const references = resolveCollaborationReferences(db, invocation.project.id, { role_id: c.role_id, role_revision: c.revision })
      if (c.handoff_mode === 'consult' && invocation.selection?.native_launch.tools.mode !== 'disabled') return fail('capability_unavailable', 'This Agent cannot enforce a consultation without external operations')
      invocation.spec = { ...z.object({ goal: z.string(), source_repo: z.string(), source_revision: z.string(), success_criteria: z.array(z.string()), max_workers: z.number() }).parse(spec), ...references,
        handoff: { schema: 'swa.handoff.v1', mode: c.handoff_mode ?? 'work', reply: c.reply_mode ?? 'poll', origin: fixed.origin ?? { kind: invocation.caller.kind, caller_id: invocation.caller.id, project_id: invocation.project.id, request_id: invocation.command.request_id },
          parent_task_id: parent.id, requester_dispatch_id: parentDispatch ? z.object({ id: z.string() }).parse(parentDispatch).id : null,
          completion_criteria: c.completion_criteria ?? spec.success_criteria,
          ...(c.role_id ? { recipient_role_id: c.role_id, recipient_role_revision: c.revision } : {}) } }
      await admitWorkerResources()
    }
    const requestId = reserve(context, invocation, { project_id: invocation.project.id, controller: c.controller, run_id: scope.run_id, root_task_id: scope.root_task_id, action: c.action, selection: invocation.selection, child_request: `${c.request_id}/native`, stage: 'helper-input' })
    return effect(async () => {
      const native = (await helperCall(context.runtime, c.controller!, requestId, c.action, { ...invocation, scope })).result
      const rejected = ['question.answer', 'question.resume'].includes(c.action) && nativeObject(native).state === 'rejected' && nativeObject(native).effects_applied === false
      const result = { project_id: invocation.project.id, controller: c.controller, run_id: scope.run_id, root_task_id: scope.root_task_id, action: c.action, selection: invocation.selection, invocation: { ...invocation, scope }, child_request: `${requestId}/native`, native, ...(rejected ? { state: 'rejected', effects_applied: false, error: nativeObject(native).error } : {}) }
      if (!context.recordMutationReceipt) return fail('operation_unknown', 'The original native delivery receipt cannot be committed')
      context.recordMutationReceipt(result)
      requestRunSettlement(context.runtime, scope)
      return result
    })
  } }),
  defineMethod({ name: 'swa.observe', permission: 'workspace', params: wrapper, handler: async ({ invocation }, { runtime }) => {
    const c = invocation.command
    if (!c.controller || !['task.show', 'task.list', 'task.result', 'worker.show', 'worker.list', 'worker.read'].includes(c.action)) return fail('invalid_argument', 'Unsupported observation')
    const { scope, owner } = controllerScope(runtime, invocation.project.id, c.controller, { history: true })
    validateTaskAction(runtime, invocation, scope)
    const native = await observeTask(runtime, invocation, scope)
    let result = native
    if (c.action === 'task.result') result = await completeTaskResult(runtime, scope, owner.worktree_id, native)
    else if (c.action === 'worker.show') {
      const observed = await observeWorkerSource(runtime, scope, owner.worktree_id, c.dispatch_id!)
      if ('execution' in observed) {
        const { execution, ...source } = observed
        result = { ...nativeObject(native), source, execution }
      } else result = { ...nativeObject(native), source: observed }
    }
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
      await observeControllerExited(context.runtime, owner)
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
  if (command.action === 'run.submit') {
    if (!command.workdir || !isAbsolute(command.workdir) || !command.agent || !command.model || command.controller) return fail('invalid_argument', 'Run submission requires its explicit project directory, Agent and model')
    const projectRoot = await realpath(command.workdir)
    const references = resolveCollaborationReferences(runtime.getOrchestrationDb(), project, { role_id: command.role_id, role_revision: command.revision, conversation_id: command.conversation_id })
    await runtime.ensureStructuredAgentSessionHost({ prewarmModelCatalog: false })
    return selectAgent(runtime, project, command.agent, command.model, projectRoot, command.question_mode ?? references.role_snapshot?.question_mode ?? 'disabled')
  }
  if (!command.controller) return fail('invalid_argument', 'An exact controller is required for the native account source boundary')
  const { owner, scope } = controllerScope(runtime, project, command.controller)
  if (command.action === 'question.answer' || command.action === 'question.resume') {
    const target = readAnswerQuestion(runtime.getOrchestrationDb(), scope, command)
    const original = questionStartSelection(runtime, scope, command)
    if (target.question.status === 'answered') return original.selection
  }
  await runtime.ensureStructuredAgentSessionHost({ prewarmModelCatalog: false })
  const resolvePath = getStructuredAgentSessionHost()?.deps.resolveWorkspacePath
  if (!resolvePath) return fail('evidence_missing', 'The exact native project directory is unavailable')
  const projectRoot = await realpath(await resolvePath(owner.worktree_id))
  if (command.action === 'worker.start') {
    if (!command.agent || !command.model) return fail('invalid_argument', 'An explicit native Agent and model are required')
    const references = resolveCollaborationReferences(runtime.getOrchestrationDb(), project, { role_id: command.role_id, role_revision: command.revision })
    return selectAgent(runtime, project, command.agent, command.model, projectRoot, command.question_mode ?? references.role_snapshot?.question_mode ?? 'disabled')
  }
  if (!['worker.send', 'question.answer', 'question.resume'].includes(command.action) || !command.controller || !command.dispatch_id) return fail('invalid_argument', 'Only a start or an exact existing Worker input resolves a model selection')
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
  const current = await selectAgent(runtime, project, original.agent_id, original.model, projectRoot, original.native_launch.tools.mode === 'questions-only' ? 'native' : 'disabled')
  if (!isDeepStrictEqual(original, current)) return fail('request_mismatch', 'The original Worker Agent source changed; preserve the original selection')
  return original
}

function requireReleased(runtime: OrcaRuntimeService, scope: Scope) {
  if (!scope.run_id) return
  const db = runtime.getOrchestrationDb()
  const resources = db.listWorkerTerminalResources({ runId: scope.run_id, limit: 100_001 })
  if (resources.length > 100_000) fail('worker_release_unconfirmed', 'The complete Worker resource inventory exceeds the current observation bound')
  const children = readRunTaskTree(db, scope).tasks.filter(task => task.id !== scope.root_task_id)
  if (children.some(task => !resources.some(resource => resource.taskId === task.id && resource.parentTaskId === task.parent_id))) fail('worker_release_unconfirmed', 'An exact Worker task has no observed resource closure')
  if (resources.some(row => !row.resource || row.resource.release_state !== 'released')) fail('worker_release_unconfirmed', 'All exact Worker resources must be archived and released')
}

// 准入与 checkpoint 在同一个原生事务中完成，未知请求继续占用原生 receipt。
function reserve(context: RpcContext, invocation: Invocation, receipt: Record<string, unknown>) {
  const runtime = context.runtime, db = runtime.getOrchestrationDb(), c = invocation.command
  if (!context.orchestrationMutation || context.orchestrationMutation.requestId !== c.request_id || !c.controller) fail('request_mismatch', 'The public and native request IDs must match')
  db.db.exec('BEGIN IMMEDIATE')
  try {
    const fresh = controllerScope(runtime, invocation.project.id, c.controller)
    if (recorded(runtime, 'swa.controllerClose', c.controller)) fail('controller_closing', 'The exact controller already reserved its close; inspect the original request')
    assertCurrentCollaborationAssignment(db, invocation)
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
      validateHandoffInput(runtime, invocation)
      assertQuestionResume(runtime, invocation)
      if (c.action === 'question.answer') {
        validateQuestionAnswer(runtime, invocation, fresh.scope)
        assertQuestionReservation(runtime, invocation)
      }
      if (c.action === 'worker.start') {
        const completion = z.object({ count: z.number().int().nonnegative() }).parse(db.db.prepare(`SELECT COUNT(*) AS count FROM mutation_receipts
          WHERE caller_fingerprint=? AND method='swa.controllerDeliver' AND state='pending'
          AND json_valid(receipt)=1 AND json_extract(receipt, '$.run_id')=?
          AND json_extract(receipt, '$.root_task_id')=? AND json_extract(receipt, '$.action')='task.complete'`).get(authority(runtime), fresh.scope.run_id, fresh.scope.root_task_id))
        assertWorkerStartOpen(z.object({ status: z.string() }).parse(db.getTask(fresh.scope.root_task_id)).status, completion.count)
        const children = readRunTaskTree(db, fresh.scope).tasks.filter(task => task.id !== fresh.scope.root_task_id)
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
        assertWorkerCapacity(approvedWorkerLimit(db.getTask(fresh.scope.root_task_id), fresh.scope), children.length, uncreated)
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
    if (!dispatch || dispatch.run_id !== scope.run_id || !task || !isTaskDescendant(db, scope.run_id, scope.root_task_id, task.id)) fail('scope_denied', 'The exact Worker does not belong to this root task')
    if (['worker.send', 'worker.stop', 'worker.release', 'question.resume'].includes(c.action)) {
      const worker = db.getWorkerDispatch(c.dispatch_id)
      if (!worker || worker.runtime_epoch !== runtime.getRuntimeId()) fail('operation_unknown', 'The original Worker Job belongs to a different runtime generation; preserve its resources')
      if (['worker.send', 'question.resume'].includes(c.action) && worker.state !== 'ready') fail('operation_unknown', 'The exact Worker is not ready for a new approved input')
    }
  }
  const tasks = readRunTaskTree(db, scope).tasks
  if (c.action === 'worker.start') {
    const parentId = c.parent_task_id ?? scope.root_task_id, parent = db.getTask(parentId)
    if (!parent || parent.run_id !== scope.run_id || parentId !== scope.root_task_id && !isTaskDescendant(db, scope.run_id, scope.root_task_id, parentId)) fail('scope_denied', 'The handoff parent is outside this Run')
    if (parent.status === 'completed' || parent.status === 'failed') fail('scope_denied', 'A terminal parent cannot delegate another task')
    if (c.parent_task_id && !c.completion_criteria?.length) fail('invalid_argument', 'A delegated task requires explicit completion criteria')
    assertWorkerCapacity(approvedWorkerLimit(db.getTask(scope.root_task_id), scope), tasks.length - 1, 0)
  }
  if (c.action === 'task.complete') {
    const pending = z.object({ count: z.number().int().nonnegative() }).parse(db.db.prepare(`SELECT COUNT(*) AS count FROM mutation_receipts
      WHERE caller_fingerprint=? AND method='swa.controllerDeliver' AND state='pending'
      AND json_valid(receipt)=1 AND json_extract(receipt, '$.run_id')=?
      AND json_extract(receipt, '$.root_task_id')=? AND json_extract(receipt, '$.action')='worker.start'`).get(authority(runtime), scope.run_id, scope.root_task_id))
    assertCompletionInventory(approvedWorkerLimit(db.getTask(scope.root_task_id), scope), tasks.length - 1, pending.count)
    requireReleased(runtime, scope)
    if (!invocation.input) fail('evidence_missing', 'The explicit task result is required')
  }
}
