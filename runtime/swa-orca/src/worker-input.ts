import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { RpcContext } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/core'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import { sendAgentTurn } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/send-agent-turn'
import { mintAgentSessionOperationId } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/structured-pointer-operation-id'
import { structuredPointerCallerKey } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/structured-mailbox-pointer-host'
import { structuredWorkerIdentities } from '../../../third_party/orca-v1.4.230/src/main/runtime/structured-worker-identity'
import { getStructuredAgentSessionHost } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-wire/structured-agent-session-registry'
import type { AgentJournalMessageItem } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-journal-types'
import { invocationSchema, nativeError, nativeObject, structuredInputBindingSchema, type Invocation } from './contracts'
import { controllerScope, exactController } from './controller-scope'
import { isTaskDescendant } from './run-view'
import { validateHandoffInput } from './run-settlement'
import { assertQuestionResume } from './question-ask'

let admitCurrentApproval: ((invocation: z.infer<typeof invocationSchema>) => Promise<unknown>) | null = null

export function installWorkerInputApproval(admit: NonNullable<typeof admitCurrentApproval>) {
  if (admitCurrentApproval) throw new Error('Worker input approval is already installed')
  admitCurrentApproval = admit
  return () => { if (admitCurrentApproval === admit) admitCurrentApproval = null }
}

export async function admitNativeWorkerInputRPC(params: unknown, requestId: string | undefined, context: RpcContext) {
  const input = z.strictObject({ controller: z.string().min(1), parent_request: z.uuid() }).parse(params)
  if (requestId !== `${input.parent_request}/native`) throw new OrchestrationError('request_mismatch', 'The original native child input request is required')
  const db = context.runtime.getOrchestrationDb()
  const row = db.getMutationReceipt(db.getOrCreateLocalMutationCallerFingerprint(), input.parent_request)
  if (!row?.receipt || row.method !== 'swa.controllerDeliver') throw new OrchestrationError('scope_denied', 'The original parent input reservation is unavailable')
  const invocation = invocationSchema.parse(nativeObject(JSON.parse(row.receipt)).invocation)
  if (!['worker.send', 'question.resume'].includes(invocation.command.action) || invocation.command.controller !== input.controller || invocation.command.request_id !== input.parent_request) throw new OrchestrationError('scope_denied', 'The original parent input scope differs')
  const { owner, scope } = controllerScope(context.runtime, invocation.project.id, input.controller)
  validateHandoffInput(context.runtime, invocation)
  await exactController(context.runtime, owner)
  const current = context.runtime.getOrchestrationDispatchAuthority(input.controller)
  const caller = context.runtime.verifyOrchestrationCompatibilityCaller(context.orchestrationCompatibilityEvidence, { currentRuntimeLaunchSufficient: !!current?.launchTokenHash })
  if (!caller || !isDeepStrictEqual(caller, owner.caller_authority) || scope.run_id !== invocation.scope.run_id || scope.root_task_id !== invocation.scope.root_task_id || !admitCurrentApproval) throw new OrchestrationError('scope_denied', 'The actual current controller and input scope are required')
  const child = z.array(z.object({ state: z.string() })).parse(db.db.prepare("SELECT state FROM mutation_receipts WHERE request_id=? AND method='swa.workerSend'").all(requestId))
  if (child.length > 1) throw new OrchestrationError('operation_unknown', 'The original native child request is ambiguous')
  if (child[0]?.state === 'completed') await admitCurrentApproval(invocation)
}

async function prepareStructuredInput(invocation: Invocation, controller: string, context: RpcContext) {
  const { runtime } = context, db = runtime.getOrchestrationDb(), selection = invocation.selection
  const dispatchId = invocation.command.dispatch_id
  if (!selection || !dispatchId) throw new OrchestrationError('scope_denied', 'The original selected Worker input is unavailable')
  const { owner, scope } = controllerScope(runtime, invocation.project.id, controller)
  await exactController(runtime, owner)
  const live = runtime.getOrchestrationDispatchAuthority(controller)
  const caller = runtime.verifyOrchestrationCompatibilityCaller(context.orchestrationCompatibilityEvidence, { currentRuntimeLaunchSufficient: !!live?.launchTokenHash })
  if (!caller || !isDeepStrictEqual(caller, owner.caller_authority) || scope.run_id !== invocation.scope.run_id || scope.root_task_id !== invocation.scope.root_task_id) throw new OrchestrationError('scope_denied', 'The actual controller launch and current Run consumer are required')
  const dispatch = db.getDispatchContextById(dispatchId), task = dispatch && db.getTask(dispatch.task_id), worker = db.getWorkerDispatch(dispatchId)
  const host = getStructuredAgentSessionHost(), sessionId = dispatch?.assignee_orca_session_id
  const identity = sessionId && structuredWorkerIdentities.getBySessionId(sessionId), record = sessionId && host?.deps.store.getRecord(sessionId)
  if (!host || !sessionId || !identity || identity.dispatchId !== dispatchId || !record || record.provider !== selection.agent_id || record.options?.model !== selection.model || record.lease.claimStatus !== 'live' || record.lease.unreconciled || !record.lease.ownerProcess || dispatch?.run_id !== scope.run_id || !task || !isTaskDescendant(db, scope.run_id, scope.root_task_id, task.id) || worker?.state !== 'ready' || worker.runtime_epoch !== runtime.getRuntimeId()) throw new OrchestrationError('worker_identity_changed', 'The original live Worker session is unavailable')
  if (!admitCurrentApproval) throw new OrchestrationError('approval_unverified', 'Current Worker input approval is unavailable')
  await admitCurrentApproval(invocation)
  assertQuestionResume(runtime, invocation)
  const run = db.getRun(scope.run_id)
  if (!run || run.coordinator_handle !== controller) throw new OrchestrationError('scope_denied', 'The original controller is no longer the current consumer')
  return { scope, host, sessionId, record, run }
}

export async function deliverNativeWorkerInput(params: { controller: string; parent_request: string }, context: RpcContext) {
  const { runtime } = context, db = runtime.getOrchestrationDb(), mutation = context.orchestrationMutation
  if (!mutation || mutation.requestId !== `${params.parent_request}/native`) throw new OrchestrationError('request_mismatch', 'The original native child input request is required')
  const parent = db.getMutationReceipt(db.getOrCreateLocalMutationCallerFingerprint(), params.parent_request)
  if (!parent || parent.state !== 'pending' || parent.method !== 'swa.controllerDeliver' || !parent.receipt) throw new OrchestrationError('operation_unknown', 'The original parent input reservation is unavailable')
  const receipt = nativeObject(JSON.parse(parent.receipt)), invocation = invocationSchema.parse(receipt.invocation)
  validateHandoffInput(runtime, invocation)
  const command = invocation.command, selection = invocation.selection
  if (!['worker.send', 'question.resume'].includes(command.action) || command.controller !== params.controller || command.request_id !== params.parent_request || !command.dispatch_id || !invocation.input || !selection || receipt.child_request !== mutation.requestId) throw new OrchestrationError('scope_denied', 'The native child does not match its original Worker input')
  const recordNativeResult = context.recordMutationReceipt
  if (!recordNativeResult) throw new OrchestrationError('operation_unknown', 'Durable native input settlement is unavailable')
  const recordResult = (result: Record<string, unknown>) => {
    try { recordNativeResult(result); return result }
    catch (error) { throw new OrchestrationError('operation_unknown', error instanceof Error ? error.message : 'Native input settlement could not be saved') }
  }
  let prepared: Awaited<ReturnType<typeof prepareStructuredInput>>
  try { prepared = await prepareStructuredInput(invocation, params.controller, context) }
  catch (error) { return recordResult({ project_id: invocation.project.id, controller: params.controller, run_id: invocation.scope.run_id, request_id: parent.request_id, native_request_id: mutation.requestId, dispatch_id: command.dispatch_id, agent: selection.agent_id, execution_mode: selection.execution_mode, state: 'rejected', effects_applied: false, error: nativeError(error), source: { kind: 'native_pre_input_admission', child_request: mutation.requestId } }) }
  const { scope, host, sessionId, record, run } = prepared
  const operationId = mintAgentSessionOperationId(Date.now())
  const body: AgentJournalMessageItem = { kind: 'message', role: 'user', blocks: [{ type: 'text', text: invocation.input.text }] }
  const binding = structuredInputBindingSchema.parse({ parent_request: parent.request_id, child_request: mutation.requestId, dispatch_id: command.dispatch_id, agent: selection.agent_id, execution_mode: selection.execution_mode, session_id: sessionId, operation_id: operationId, runtime_fence: record.lease.runtimeFence, consumer_generation: run.consumer_generation, body })
  try {
    db.db.exec('BEGIN IMMEDIATE')
    try {
      db.checkpointPendingMutationReceipt({ callerFingerprint: parent.caller_fingerprint, requestId: parent.request_id, method: parent.method, payloadHash: parent.payload_hash, receipt: JSON.stringify({ ...receipt, swa_input_binding: binding }) })
      db.checkpointPendingMutationReceipt({ ...mutation, receipt: JSON.stringify({ project_id: invocation.project.id, controller: params.controller, parent_request: parent.request_id, dispatch_id: command.dispatch_id, swa_input_binding: binding, stage: 'input-submit' }) })
      db.db.exec('COMMIT')
    } catch (error) { db.db.exec('ROLLBACK'); throw error }
  } catch (error) { throw new OrchestrationError('operation_unknown', error instanceof Error ? error.message : 'Native input binding could not be saved') }
  context.markMutationEffectPossible?.()
  try {
    const delivery = await sendAgentTurn({ kind: 'structured-session', host, sessionId, callerKey: structuredPointerCallerKey(command.dispatch_id), turn: { body, operationId, expectedRuntimeFence: record.lease.runtimeFence, delivery: 'now', beforeRun: () => {
      const current = host.deps.store.getRecord(sessionId)
      if (current?.lease.runtimeFence !== binding.runtime_fence || !isDeepStrictEqual(current.lease.ownerProcess, record.lease.ownerProcess) || db.getRun(run.id)?.consumer_generation !== binding.consumer_generation || db.getWorkerDispatch(command.dispatch_id!)?.state !== 'ready') throw new Error('The original Worker identity changed before input admission')
      assertQuestionResume(runtime, invocation)
    } } })
    if (delivery.kind === 'refused') throw new Error(`The native host refused this operation without a confirmed input settlement: ${delivery.refusal.code}`)
    const state = delivery.kind === 'queued' ? 'queued' : delivery.submission?.dispatchState
    if (!state || state === 'unknown') throw new Error('The original native input settlement is unknown')
    return recordResult({ project_id: invocation.project.id, controller: params.controller, run_id: scope.run_id, request_id: parent.request_id, native_request_id: mutation.requestId, dispatch_id: command.dispatch_id, agent: selection.agent_id, execution_mode: selection.execution_mode, session_id: sessionId, operation_id: operationId, client_message_id: delivery.clientMessageId, state: state === 'pending' ? 'journaled' : state, swa_input_binding: binding, delivery, source: { kind: 'native_session_operation', session_id: sessionId, operation_id: operationId, child_request: mutation.requestId } })
  } catch (error) { throw new OrchestrationError('operation_unknown', error instanceof Error ? error.message : 'The original native input outcome is unknown') }
}
