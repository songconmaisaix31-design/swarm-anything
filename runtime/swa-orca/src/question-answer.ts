import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { OrcaRuntimeService } from '../../../third_party/orca-v1.4.230/src/main/runtime/orca-runtime'
import type { OrchestrationDb } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/db'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import { buildRegistry, defineMethod, isStreamingMethod, type RpcContext } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/core'
import { ORCHESTRATION_MESSAGE_METHODS } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/messaging/message-methods'
import { ReplyParams } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/schemas'
import { structuredWorkerIdentities } from '../../../third_party/orca-v1.4.230/src/main/runtime/structured-worker-identity'
import { answerTextSchema, agentSelectionSchema, invocationSchema, nativeError, nativeObject, structuredInputBindingSchema, type Invocation, type Scope } from './contracts'
import { authority, controllerScope } from './controller-scope'
import { assertDeliveryGrantCurrent } from './delivery-admission'
import { isTaskDescendant } from './run-view'
import { observeRunQuestions } from './question-ask'

function deny(code: string, message: string): never { throw new OrchestrationError(code, message, { effectsApplied: false }) }

export function questionAnswerBody(invocation: Invocation) {
  const c = invocation.command
  if (c.action !== 'question.answer' || invocation.handoff || invocation.submission) deny('scope_denied', 'Only an original question answer without handoff or submission is permitted')
  if (c.text !== undefined) {
    if (c.input_file !== undefined || invocation.input !== undefined) deny('scope_denied', 'An inline answer cannot carry another input source')
    return answerTextSchema.parse(c.text)
  }
  if (!c.input_file || !invocation.input?.path || !invocation.input.version) deny('evidence_missing', 'The original approved answer file is required')
  return answerTextSchema.parse(invocation.input.text)
}

export function questionReplyParams(invocation: Invocation) {
  return { from: invocation.command.controller, run: invocation.scope.run_id, id: invocation.command.question_id, body: questionAnswerBody(invocation) }
}

// 所有身份来自原表；外部 ID 只选择要回答的原问题。
export function readAnswerQuestion(db: OrchestrationDb, scope: Scope, command: Invocation['command'], answer?: string) {
  if (!['question.answer', 'question.resume'].includes(command.action) || command.controller !== scope.controller || command.run_id !== scope.run_id || command.task_id !== scope.root_task_id || !command.dispatch_id || !command.question_id) deny('scope_denied', 'The answer must identify its exact controller, Run, root, Dispatch and question')
  const question = db.getQuestion(command.question_id), message = db.getMessageById(command.question_id)
  const dispatch = db.getDispatchContextById(command.dispatch_id)
  if (!question || question.run_id !== scope.run_id || question.dispatch_id !== command.dispatch_id || !dispatch || dispatch.run_id !== scope.run_id || !isTaskDescendant(db, scope.run_id, scope.root_task_id, dispatch.task_id) || !message || message.type !== 'question' || message.run_id !== scope.run_id || message.thread_id !== question.message_id || message.from_handle !== `dispatch:${dispatch.id}` || message.to_handle !== `run:${scope.run_id}` || message.delivery_contract === 'legacy_direct' || message.delivery_contract === 'audit_only' || db.getRun(scope.run_id)?.legacy !== 0 || db.getFederatedDispatch(dispatch.id)) deny('scope_denied', 'The original local question, message and Dispatch do not belong to this Run')
  if (question.status === 'closed' || question.status === 'pending' && !['pending', 'dispatched'].includes(dispatch.status)) deny('dispatch_inactive', 'The original question is closed or its Dispatch is inactive')
  if (question.status === 'answered') {
    const stored = question.answer_message_id && db.getMessageById(question.answer_message_id)
    if (!stored || stored.run_id !== scope.run_id || stored.thread_id !== question.message_id || stored.from_handle !== `run:${scope.run_id}` || stored.to_handle !== `dispatch:${dispatch.id}` || stored.body !== question.answer_body || question.answered_by_generation === null || !question.answered_at) deny('evidence_missing', 'The original answer binding is incomplete')
    if (answer !== undefined && answer !== stored.body) deny('answer_conflict', 'The original question already has a different answer')
  }
  return { question, message, dispatch }
}

export function questionStartSelection(runtime: OrcaRuntimeService, scope: Scope, command: Invocation['command']) {
  const db = runtime.getOrchestrationDb()
  readAnswerQuestion(db, scope, command)
  const rows = z.array(z.object({ request_id: z.string(), receipt: z.string() })).parse(db.db.prepare(`SELECT request_id,receipt FROM mutation_receipts
    WHERE caller_fingerprint=? AND method='swa.controllerDeliver' AND state='completed' AND json_valid(receipt)=1
    AND json_extract(receipt,'$.project_id')=? AND json_extract(receipt,'$.run_id')=? AND json_extract(receipt,'$.root_task_id')=?
    AND json_extract(receipt,'$.action')='worker.start' AND json_extract(receipt,'$.native.dispatchId')=?`).all(authority(runtime), scope.project_id, scope.run_id, scope.root_task_id, command.dispatch_id!))
  if (rows.length !== 1) deny('operation_unknown', 'The question has no unique original Worker start selection')
  const row = rows[0]!, receipt = nativeObject(JSON.parse(row.receipt)), invocation = invocationSchema.parse(receipt.invocation)
  const selection = agentSelectionSchema.parse(receipt.selection), binding = structuredInputBindingSchema.parse(receipt.swa_input_binding)
  const native = nativeObject(receipt.native), dispatch = db.getDispatchContextById(command.dispatch_id!)!
  if (invocation.command.action !== 'worker.start' || invocation.command.request_id !== row.request_id || invocation.project.id !== scope.project_id || invocation.scope.run_id !== scope.run_id || invocation.scope.root_task_id !== scope.root_task_id || !isDeepStrictEqual(invocation.selection, selection) || native.runId !== scope.run_id || native.taskId !== dispatch.task_id || binding.parent_request !== row.request_id || binding.child_request !== `${row.request_id}/native` || receipt.child_request !== binding.child_request || binding.dispatch_id !== dispatch.id || binding.agent !== selection.agent_id || binding.session_id !== dispatch.assignee_orca_session_id) deny('evidence_missing', 'The original Worker start and question session binding differ')
  return { selection, binding }
}

export function validateQuestionAnswer(runtime: OrcaRuntimeService, invocation: Invocation, scope: Scope) {
  const body = questionAnswerBody(invocation)
  const target = readAnswerQuestion(runtime.getOrchestrationDb(), scope, invocation.command, body)
  const original = questionStartSelection(runtime, scope, invocation.command)
  if (!invocation.selection || !isDeepStrictEqual(invocation.selection, original.selection)) deny('request_mismatch', 'The answer changed the original Worker selection')
  if (target.question.status === 'pending') {
    const session = runtime.openedAgentSessionRecordStore()?.getRecord(original.binding.session_id)
    const identity = structuredWorkerIdentities.getBySessionId(original.binding.session_id)
    const worker = runtime.getOrchestrationDb().getWorkerDispatch(target.dispatch.id)
    if (!session || session.provider !== original.selection.agent_id || session.options?.model !== original.selection.model || session.lease.claimStatus !== 'live' || session.lease.unreconciled || !session.lease.ownerProcess || session.lease.runtimeFence !== original.binding.runtime_fence || identity?.dispatchId !== target.dispatch.id || worker?.state !== 'ready' || worker.runtime_epoch !== runtime.getRuntimeId()) deny('worker_identity_changed', 'The pending question no longer has its original live Worker session and fence')
  }
  return { ...target, ...original, body }
}

export function assertQuestionReservation(runtime: OrcaRuntimeService, invocation: Invocation) {
  const c = invocation.command
  if (!c.request_id || !c.question_id) deny('invalid_argument', 'The original answer request and question are required')
  const count = z.object({ count: z.number().int() }).parse(runtime.getOrchestrationDb().db.prepare(`SELECT COUNT(*) AS count FROM mutation_receipts
    WHERE caller_fingerprint=? AND method='swa.controllerDeliver' AND state='pending' AND request_id<>?
    AND json_valid(receipt)=1 AND json_extract(receipt,'$.action')='question.answer'
    AND json_extract(receipt,'$.invocation.command.question_id')=?`).get(authority(runtime), c.request_id, c.question_id)).count
  if (count) deny('operation_in_progress', 'Another original answer to this question is unresolved; inspect that request')
}

function originalQuestionAnswer(params: unknown, context: RpcContext) {
  const mutation = context.orchestrationMutation
  if (!mutation || mutation.method !== 'orchestration.reply' || !mutation.requestId.endsWith('/native')) deny('request_mismatch', 'The original answer child request is required')
  const requestId = z.uuid().parse(mutation.requestId.slice(0, -'/native'.length))
  const parent = context.runtime.getOrchestrationDb().getMutationReceipt(authority(context.runtime), requestId)
  if (!parent?.receipt || parent.method !== 'swa.controllerDeliver' || parent.state !== 'pending') deny('scope_denied', 'The original pending answer parent is required')
  const receipt = nativeObject(JSON.parse(parent.receipt)), invocation = invocationSchema.parse(receipt.invocation)
  if (receipt.action !== 'question.answer' || receipt.child_request !== mutation.requestId || invocation.command.request_id !== requestId || !isDeepStrictEqual(params, questionReplyParams(invocation))) deny('scope_denied', 'The native reply differs from the original answer request')
  return invocation
}

export function questionReplyMethod(admit: (invocation: Invocation) => Promise<unknown>) {
  const original = buildRegistry(ORCHESTRATION_MESSAGE_METHODS).get('orchestration.reply')
  if (!original || isStreamingMethod(original)) throw new Error('The original question reply method is unavailable')
  return defineMethod({ name: 'orchestration.reply', permission: original.permission, params: ReplyParams, handler: async (params, context) => {
    const invocation = originalQuestionAnswer(params, context), { runtime } = context
    const c = invocation.command, mutation = context.orchestrationMutation!
    const base = { project_id: invocation.project.id, controller: c.controller, run_id: c.run_id, root_task_id: c.task_id, dispatch_id: c.dispatch_id, question_id: c.question_id, request_id: c.request_id, native_request_id: mutation.requestId, body: questionAnswerBody(invocation) }
    const save = (value: Record<string, unknown>) => {
      try {
        if (!context.recordMutationReceipt) throw new Error('The durable answer receipt is unavailable')
        context.recordMutationReceipt(value)
        return value
      } catch { throw new OrchestrationError('operation_unknown', 'The original answer receipt could not be confirmed') }
    }
    let answerGeneration: number
    try {
      await admit(invocation)
      // 当前审批返回后到原 reply 的本地事务之间不再 await。
      const fresh = originalQuestionAnswer(params, context)
      if (!isDeepStrictEqual(fresh, invocation)) deny('request_mismatch', 'The original answer invocation changed')
      const { scope, owner } = controllerScope(runtime, invocation.project.id, c.controller!)
      if (!isDeepStrictEqual(scope, invocation.scope)) deny('scope_denied', 'The original answer Run scope changed')
      const live = runtime.getOrchestrationDispatchAuthority(c.controller!)
      const caller = runtime.verifyOrchestrationCompatibilityCaller(context.orchestrationCompatibilityEvidence, { currentRuntimeLaunchSufficient: !!live?.launchTokenHash })
      const run = runtime.getOrchestrationDb().getRun(scope.run_id)
      if (!caller || !isDeepStrictEqual(caller, owner.caller_authority) || run?.coordinator_handle !== owner.controller || run.coordinator_pane_key !== owner.caller_authority.paneKey) deny('scope_denied', 'The actual controller is no longer the current Run consumer')
      assertDeliveryGrantCurrent(invocation)
      const target = validateQuestionAnswer(runtime, invocation, scope)
      answerGeneration = target.question.status === 'answered' ? target.question.answered_by_generation! : run.consumer_generation
    } catch (error) { return save({ ...base, state: 'rejected', effects_applied: false, error: nativeError(error) }) }
    try {
      runtime.getOrchestrationDb().checkpointPendingMutationReceipt({ ...mutation, receipt: JSON.stringify({ ...base, stage: 'question-answer' }) })
      context.markMutationEffectPossible?.()
      const recorded = (value: unknown) => {
        const result = nativeObject(value), question = nativeObject(result.question), message = nativeObject(result.message)
        if (question.message_id !== c.question_id || question.run_id !== c.run_id || question.dispatch_id !== c.dispatch_id || question.status !== 'answered' || question.answer_message_id !== message.id || question.answer_body !== base.body || question.answered_by_generation !== answerGeneration || typeof question.answered_at !== 'string' || !question.answered_at || message.body !== base.body || message.thread_id !== c.question_id || message.run_id !== c.run_id || message.from_handle !== `run:${c.run_id}` || message.to_handle !== `dispatch:${c.dispatch_id}` || typeof result.duplicate !== 'boolean') throw new Error('The original answer result does not confirm its exact question, generation and body')
        const observed = observeRunQuestions(runtime, invocation.scope, c.dispatch_id).find(value => value.question_id === c.question_id)
        const continuationRequired = observed?.continuation_required === true
        const requiredAction = continuationRequired
          ? `swa question resume --project ${JSON.stringify(invocation.project.id)} --controller ${JSON.stringify(c.controller)} --run ${JSON.stringify(c.run_id)} --task ${JSON.stringify(c.task_id)} --dispatch ${JSON.stringify(c.dispatch_id)} --question ${JSON.stringify(c.question_id)} --request-id "<NEW_UUID>" --json`
          : `swa wait --project ${JSON.stringify(invocation.project.id)} --controller ${JSON.stringify(c.controller)} --run ${JSON.stringify(c.run_id)} --task ${JSON.stringify(c.task_id)} --json`
        return save({ ...base, ...result, state: 'answered', read_state: observed?.read_state ?? 'read_unconfirmed', continuation_required: continuationRequired, required_action: requiredAction })
      }
      return recorded(await original.handler(original.params?.parse(params), { ...context, recordMutationReceipt: value => { recorded(value) } }))
    } catch (error) { throw new OrchestrationError('operation_unknown', error instanceof Error ? error.message : 'The original answer outcome is unknown') }
  } })
}
