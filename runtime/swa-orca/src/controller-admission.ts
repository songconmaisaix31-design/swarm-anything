import { timingSafeEqual } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { RpcContext, RpcRequest } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/core'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import { invocationSchema, nativeObject } from './contracts'
import { authority, controllerOwnerSchema, controllerScope, exactController, observeControllerExited, type Controller } from './controller-scope'
import { admitNativeWorkerInputRPC } from './worker-input'
import { assertDeliveryGrantCurrent } from './delivery-admission'

function deny(message: string): never { throw new OrchestrationError('scope_denied', message, { effectsApplied: false }) }
const historyReads = new Set(['status.get', 'orchestration.requestShow', 'orchestration.runShow', 'orchestration.taskList', 'orchestration.workerShow', 'orchestration.workerList', 'orchestration.workerRead'])
const workerReads = new Set(['orchestration.workerShow', 'orchestration.workerRead'])

export function isProductOwner(request: RpcRequest, context: RpcContext, capability: Buffer) {
  const value = request.swaOwnerCapability
  return context.caller?.kind === 'local-cli' && typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && timingSafeEqual(Buffer.from(value, 'hex'), capability)
}

export async function admitControllerRPC(request: RpcRequest, input: unknown, context: RpcContext, capability: Buffer) {
  const params = input == null ? {} : nativeObject(input)
  const ownerBridge = isProductOwner(request, context, capability)
  if (request.method.startsWith('swa.')) {
    if (request.method === 'swa.workerSend') {
      if (ownerBridge) deny('Worker input requires the actual controller helper')
      await admitNativeWorkerInputRPC(params, request.orchestrationRequestId, { ...context, orchestrationCompatibilityEvidence: request.orchestrationCompatibilityEvidence })
      return
    }
    if (!ownerBridge) deny('The private product owner capability is required')
    return
  }
  if (ownerBridge) {
    if (!historyReads.has(request.method)) deny('The private bridge only observes explicit native history')
    if (request.orchestrationCompatibilityEvidence || params.from || params.callerTerminalHandle) deny('The private history bridge cannot claim a helper identity')
    if (request.method === 'orchestration.taskList' || request.method === 'orchestration.workerList') z.string().min(1).parse(params.run)
    return
  }
  if (request.swaOwnerCapability !== undefined || context.caller?.kind !== 'local-cli') deny('A real local controller caller is required')
  const evidence = request.orchestrationCompatibilityEvidence
  if (!evidence?.terminalHandle || !evidence.paneKey || !evidence.launchToken) deny('The actual native helper launch evidence is required')
  const handle = evidence.terminalHandle
  const runtime = context.runtime, db = runtime.getOrchestrationDb()
  const live = runtime.getOrchestrationDispatchAuthority(handle)
  const caller = runtime.verifyOrchestrationCompatibilityCaller(evidence, { currentRuntimeLaunchSufficient: !!live?.launchTokenHash })
  if (!caller || caller.hostScope.kind !== 'local') deny('The native helper launch or restored attestation is unavailable')
  const rows = z.array(z.object({ method: z.string(), state: z.string(), receipt: z.string() })).parse(db.db.prepare(`SELECT method, state, receipt FROM mutation_receipts
    WHERE caller_fingerprint=? AND method IN ('swa.controllerOpen','swa.controllerRecover') AND json_valid(receipt)=1
    AND json_extract(receipt, '$.controller')=?`).all(authority(runtime), handle))
  if (rows.length !== 1) deny('The actual helper owner receipt is not unique')
  const open = rows[0]!, receipt = nativeObject(JSON.parse(open.receipt))
  const owner = controllerOwnerSchema.parse(receipt)
  if (!isDeepStrictEqual(caller, owner.caller_authority)) deny('The actual native helper authority differs from its owner receipt')
  await exactController(runtime, owner)
  if (open.method === 'swa.controllerRecover') await observeControllerExited(runtime, controllerOwnerSchema.parse(receipt.prior_owner))
  for (const field of ['from', 'callerTerminalHandle']) if (params[field] !== undefined && params[field] !== handle) deny('A helper may only declare its actual controller')
  if (request.method === 'orchestration.runCurrent' || request.method === 'status.get') {
    if (request.method === 'orchestration.runCurrent' && params.from !== handle || request.method === 'status.get' && Object.keys(params).length || open.state !== 'completed' && !['helper-ready', 'run-use'].includes(String(receipt.stage))) deny('The original helper has not reached its ready checkpoint')
    return
  }
  if (request.method === 'orchestration.runUse') {
    admitRecoveryBinding(request, params, context, owner)
    return
  }
  if (open.state !== 'completed') deny('Pending controller open only admits its own readiness observation')
  if (request.method === 'orchestration.runCreate' || request.method === 'orchestration.taskCreate') {
    if (open.method !== 'swa.controllerOpen') deny('A recovered helper retains its existing fixed task')
    admitInitialTask(request, params, context, owner)
    return
  }
  const { scope } = controllerScope(runtime, owner.project_id, handle)
  if (!scope.run_id) deny('The native helper has no completed fixed task')
  assertCurrentConsumer(context, owner, scope.run_id)
  if (request.method === 'orchestration.callerShow') return
  if (request.method === 'orchestration.runShow') {
    if (params.id !== scope.run_id) deny('The helper may only observe its bound Run')
    return
  }
  if (request.method === 'orchestration.taskList' || request.method === 'orchestration.workerList') {
    if (params.run !== scope.run_id) deny('The helper query must name its actual fixed Run')
    return
  }
  if (workerReads.has(request.method)) {
    assertDispatch(context, params.dispatch, scope.run_id, scope.root_task_id)
    return
  }
  admitOrdinaryMutation(request, params, context, owner, scope.run_id, scope.root_task_id)
}

function admitRecoveryBinding(request: RpcRequest, params: Record<string, unknown>, context: RpcContext, owner: Controller) {
  const original = parentMutation(request, context, '/run-use', 'swa.controllerRecover')
  const receipt = original.receipt, invocation = original.invocation
  const prior = controllerOwnerSchema.parse(receipt.prior_owner)
  const scope = z.object({ run_id: z.string().min(1), root_task_id: z.string().min(1), context: z.unknown() }).parse(receipt.scope)
  if (invocation.command.action !== 'controller.recover' || invocation.command.controller !== prior.controller || invocation.project.id !== owner.project_id || receipt.controller !== owner.controller || receipt.run_use_request !== request.orchestrationRequestId || !isDeepStrictEqual(params, { id: scope.run_id, from: owner.controller }) || !isDeepStrictEqual(invocation.scope.context, scope.context)) deny('Native Run binding differs from the exact original recovery')
  const db = context.runtime.getOrchestrationDb(), run = db.getRun(scope.run_id), task = db.getTask(scope.root_task_id)
  if (!run || !task || task.run_id !== run.id || task.parent_id !== null || !isDeepStrictEqual(nativeObject(JSON.parse(task.spec)).context, scope.context)) deny('Recovery cannot change the fixed Run, root or context')
  if (original.child?.state === 'completed') {
    assertCurrentConsumer(context, owner, run.id)
    const completed = nativeObject(nativeObject(JSON.parse(original.child.receipt!)).run)
    if (run.consumer_generation !== completed.consumer_generation || run.consumer_generation <= z.number().int().parse(receipt.prior_generation)) deny('The completed native recovery belongs to another consumer generation')
  } else if (run.coordinator_handle !== prior.controller || run.coordinator_pane_key !== prior.caller_authority.paneKey || run.consumer_generation !== receipt.prior_generation) deny('The prior native consumer changed before recovery binding')
}

function assertCurrentConsumer(context: RpcContext, owner: Controller, runId: string) {
  const run = context.runtime.getOrchestrationDb().getRun(runId)
  if (!run || run.coordinator_handle !== owner.controller || run.coordinator_pane_key !== owner.caller_authority.paneKey) deny('The exact native helper is no longer the current Run consumer')
  return run
}

function parentMutation(request: RpcRequest, context: RpcContext, suffix: string, method: string) {
  const childId = request.orchestrationRequestId
  if (!childId?.endsWith(suffix)) deny('The exact original native child request is required')
  const parentId = z.uuid().parse(childId.slice(0, -suffix.length))
  const db = context.runtime.getOrchestrationDb(), fingerprint = authority(context.runtime)
  const parent = db.getMutationReceipt(fingerprint, parentId)
  if (!parent?.receipt || parent.method !== method) deny('The original SWA parent reservation is unavailable')
  const receipt = nativeObject(JSON.parse(parent.receipt)), invocation = invocationSchema.parse(receipt.invocation)
  assertDeliveryGrantCurrent(invocation)
  const child = db.getMutationReceipt(fingerprint, childId)
  if (invocation.command.request_id !== parentId || parent.state !== 'pending' && (parent.state !== 'completed' || child?.state !== 'completed' || child.method !== request.method)) deny('Only the original pending mutation or completed native child can execute')
  return { parent, receipt, invocation, child }
}

function admitInitialTask(request: RpcRequest, params: Record<string, unknown>, context: RpcContext, owner: Controller) {
  const creatingRun = request.method === 'orchestration.runCreate'
  const original = parentMutation(request, context, creatingRun ? '/run-create' : '/root-task', 'swa.taskCreate')
  const { invocation, parent } = original, command = invocation.command
  if (command.action !== 'task.create' || command.controller !== owner.controller || invocation.project.id !== owner.project_id || !invocation.spec || !invocation.context) deny('The exact fixed task creation is required')
  const db = context.runtime.getOrchestrationDb()
  if (creatingRun) {
    if (!isDeepStrictEqual(params, { from: owner.controller, objective: invocation.spec.goal })) deny('Native Run creation differs from the fixed task')
    if (parent.state === 'completed' || original.child?.state === 'completed') {
      const runId = parent.state === 'completed' ? z.string().min(1).parse(original.receipt.run_id) : z.string().min(1).parse(nativeObject(nativeObject(JSON.parse(original.child!.receipt!)).run).id)
      assertCurrentConsumer(context, owner, runId)
    } else {
      const existing = z.object({ count: z.number().int() }).parse(db.db.prepare(`SELECT COUNT(*) AS count FROM mutation_receipts
        WHERE caller_fingerprint=? AND method='swa.taskCreate' AND request_id<>? AND json_valid(receipt)=1
        AND json_extract(receipt, '$.controller')=?`).get(authority(context.runtime), parent.request_id, owner.controller))
      if (existing.count) deny('This helper already reserved another user task')
    }
    return
  }
  const createdRun = db.getMutationReceipt(authority(context.runtime), `${parent.request_id}/run-create`)
  if (createdRun?.method !== 'orchestration.runCreate' || createdRun.state !== 'completed' || !createdRun.receipt) deny('The original native Run creation is not completed')
  const runId = z.string().min(1).parse(nativeObject(nativeObject(JSON.parse(createdRun.receipt)).run).id)
  assertCurrentConsumer(context, owner, runId)
  const fixed = { spec: invocation.spec, context: invocation.context, project_id: invocation.project.id, settings_revision: invocation.caller.settings_revision }
  if (!isDeepStrictEqual(params, { run: runId, callerTerminalHandle: owner.controller, taskTitle: invocation.spec.goal, spec: JSON.stringify(fixed) })) deny('The native root task differs from its fixed public parent')
  const roots = db.listTasksWithDispatch({ runId }).filter(task => task.parent_id === null)
  if (roots.length) {
    if (original.child?.state !== 'completed' || !original.child.receipt) deny('The fixed Run already contains another root task')
    const taskId = z.string().min(1).parse(nativeObject(nativeObject(JSON.parse(original.child.receipt)).task).id)
    if (roots.length !== 1 || roots[0]!.id !== taskId) deny('The fixed Run already contains another root task')
  }
}

function assertDispatch(context: RpcContext, dispatchId: unknown, runId: string, rootId: string) {
  const db = context.runtime.getOrchestrationDb(), dispatch = db.getDispatchContextById(z.string().min(1).parse(dispatchId))
  if (!dispatch || dispatch.run_id !== runId || db.getTask(dispatch.task_id)?.parent_id !== rootId) deny('The actual Worker does not belong to this fixed task')
}

function admitOrdinaryMutation(request: RpcRequest, params: Record<string, unknown>, context: RpcContext, owner: Controller, runId: string, rootId: string) {
  const original = parentMutation(request, context, '/native', 'swa.controllerDeliver')
  const { invocation } = original, command = invocation.command
  const method = new Map([['worker.start', 'orchestration.workerStart'], ['worker.stop', 'orchestration.workerStop'], ['worker.release', 'orchestration.workerRelease'], ['task.complete', 'orchestration.taskUpdate']]).get(command.action)
  if (request.method !== method || command.controller !== owner.controller || invocation.project.id !== owner.project_id || invocation.scope.run_id !== runId || invocation.scope.root_task_id !== rootId || original.receipt.child_request !== request.orchestrationRequestId) deny('The native mutation differs from its exact original parent and current consumer')
  if (command.action === 'worker.start') {
    if (!invocation.input || !invocation.selection || !isDeepStrictEqual(params, { from: owner.controller, run: runId, parent: rootId, worktree: 'current', taskTitle: command.name, agent: invocation.selection.agent_id, model: invocation.selection.model, timeoutMs: 90_000, spec: `${invocation.input.text}\n\n固定公开上下文：\n${JSON.stringify(invocation.scope.context)}` })) deny('The native Worker start differs from the approved fixed input')
  } else if (command.action === 'task.complete') {
    if (!isDeepStrictEqual(params, { id: rootId, run: runId, callerTerminalHandle: owner.controller, status: 'completed', result: invocation.input?.text })) deny('The native completion differs from the original fixed task')
  } else {
    if (!isDeepStrictEqual(params, { dispatch: command.dispatch_id })) deny('The native Worker target differs from the original parent')
    assertDispatch(context, params.dispatch, runId, rootId)
  }
}
