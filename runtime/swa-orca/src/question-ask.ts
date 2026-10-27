import { timingSafeEqual } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import type { OrcaRuntimeService } from '../../../third_party/orca-v1.4.230/src/main/runtime/orca-runtime'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import { buildRegistry, defineMethod, isStreamingMethod, type RpcContext, type RpcRequest } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/core'
import { ORCHESTRATION_ASK_METHODS } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/messaging/ask-methods'
import { AskParams } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/schemas'
import { structuredWorkerIdentities } from '../../../third_party/orca-v1.4.230/src/main/runtime/structured-worker-identity'
import { agentSessionProviderHandleChainHead } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-provider-handle'
import { getStructuredAgentSessionHost } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-wire/structured-agent-session-registry'
import { strictPiQuestionResultSchema } from '../../../third_party/orca-v1.4.230/src/main/pi/rpc-protocol'
import { strictPiQuestionRawSchema, parseStrictPiJson } from '../../../third_party/orca-v1.4.230/src/main/pi/rpc-protocol'
import { createIncrementalNdjsonFramer } from '../../../third_party/orca-v1.4.230/src/shared/main-process-ndjson-framer'
import { replayJournal } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-open'
import { renderJournalState } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-reducer'
import { latestStructuredAgentSessionRequest } from '../../../third_party/orca-v1.4.230/src/shared/structured-agent-session-latest-request'
import { agentSelectionSchema, invocationSchema, nativeError, nativeObject, questionOriginSchema, questionRequestID, questionResumeBody, questionToolParamsSchema, questionWaitID, readQuestionMutationResult, structuredInputBindingSchema, type Invocation, type Scope } from './contracts'
import { authority, controllerScope } from './controller-scope'
import { assertDeliveryGrantCurrent } from './delivery-admission'
import { readPiQuestionEntries, readPiJournalInputTurn } from './pi-session-result'
import { isTaskDescendant } from './run-view'
import { readNativePiFile } from './native-pi-policy'
import { inspectStructuredTrace } from './task-result'

function deny(code: string, message: string): never { throw new OrchestrationError(code, message, { effectsApplied: false }) }
const rowsSchema = z.array(z.object({ request_id: z.string(), state: z.enum(['pending', 'completed']), receipt: z.string() }))

function startForSession(runtime: OrcaRuntimeService, sessionId: string) {
  const db = runtime.getOrchestrationDb()
  const rows = rowsSchema.parse(db.db.prepare(`SELECT request_id,state,receipt FROM mutation_receipts WHERE caller_fingerprint=? AND method='swa.controllerDeliver' AND json_valid(receipt)=1
    AND json_extract(receipt,'$.action')='worker.start' AND json_extract(receipt,'$.swa_input_binding.session_id')=?`).all(authority(runtime), sessionId))
  if (rows.length !== 1) deny('evidence_missing', 'The actual question Worker has no unique original start binding')
  const row = rows[0]!, receipt = nativeObject(JSON.parse(row.receipt)), invocation = invocationSchema.parse(receipt.invocation)
  const selection = agentSelectionSchema.parse(receipt.selection), binding = structuredInputBindingSchema.parse(receipt.swa_input_binding)
  const dispatch = db.getDispatchContextById(binding.dispatch_id), task = dispatch && db.getTask(dispatch.task_id)
  if (invocation.command.action !== 'worker.start' || invocation.command.request_id !== row.request_id || binding.parent_request !== row.request_id || binding.child_request !== `${row.request_id}/native` || receipt.child_request !== binding.child_request || !isDeepStrictEqual(selection, invocation.selection) || selection.agent_id !== 'pi' || selection.native_launch.account.kind !== 'pi-native-api-key-per-session' || selection.native_launch.tools.mode !== 'questions-only' || !dispatch || !task || dispatch.assignee_orca_session_id !== sessionId || dispatch.run_id !== invocation.scope.run_id || !isTaskDescendant(db, dispatch.run_id, invocation.scope.root_task_id, task.id)) deny('scope_denied', 'The native question source differs from its original Run, Dispatch and selection')
  const run = db.getRun(dispatch.run_id)
  if (!run || run.legacy || !run.coordinator_handle) deny('scope_denied', 'The question Run has no current local consumer')
  const { scope, owner } = controllerScope(runtime, invocation.project.id, run.coordinator_handle)
  if (scope.root_task_id !== invocation.scope.root_task_id || scope.run_id !== invocation.scope.run_id || !isDeepStrictEqual(scope.context, invocation.scope.context) || run.coordinator_pane_key !== owner.caller_authority.paneKey) deny('scope_denied', 'The original question Run consumer or fixed context changed')
  return { row, receipt, invocation, selection, binding, dispatch, scope, owner }
}

function producerIdentity(context: RpcContext) {
  const { runtime } = context, sessionId = context.orchestrationCaller?.sessionId ?? context.orchestrationCompatibilityEvidence?.agentSessionId
  if (context.caller?.kind !== 'local-cli' || !sessionId || typeof sessionId !== 'string' || typeof context.swaQuestionProducerProof !== 'string') deny('scope_denied', 'The actual local question Worker source is required')
  const identity = structuredWorkerIdentities.getBySessionId(sessionId), original = startForSession(runtime, sessionId)
  const record = runtime.openedAgentSessionRecordStore()?.getRecord(sessionId), worker = runtime.getOrchestrationDb().getWorkerDispatch(original.dispatch.id)
  const owner = record?.lease.ownerProcess, head = record && agentSessionProviderHandleChainHead(record.providerHandleChain)
  if (!record || !identity || identity.hostScope.kind !== 'local' || identity.agent !== 'pi' || identity.dispatchId !== original.dispatch.id || identity.processIncarnation !== original.dispatch.process_incarnation || record.provider !== 'pi' || record.options?.model !== original.selection.model || record.location.wslDistro !== null || record.location.workspaceId !== original.owner.worktree_id || record.lease.claimStatus !== 'live' || record.lease.unreconciled || record.lease.handoffStage || record.lease.handoffOperationId || !owner || record.lease.runtimeFence !== original.binding.runtime_fence || !head || head.handle.agent !== 'pi' || head.handle.transport !== 'jsonl-rpc' || head.linkId !== record.lease.provenHandleLinkId || head.mintedAtFence !== record.lease.runtimeFence || !worker || !['starting', 'ready'].includes(worker.state) || worker.runtime_epoch !== runtime.getRuntimeId()) deny('worker_identity_changed', 'The native question Worker lease, source, fence or consumer is no longer current')
  const supplied = Buffer.from(context.swaQuestionProducerProof), actual = Buffer.from(owner.spawnToken)
  if (supplied.length !== actual.length || !timingSafeEqual(supplied, actual)) deny('scope_denied', 'The current native question Worker source proof is invalid')
  const account = original.selection.native_launch.account
  if (account.kind !== 'pi-native-api-key-per-session' || !('variable' in record.accountHome) || record.accountHome.variable !== 'PI_CODING_AGENT_DIR' || record.accountHome.path !== join(account.private_root, sessionId)) deny('worker_identity_changed', 'The actual native question account changed')
  assertDeliveryGrantCurrent(original.invocation)
  return { ...original, record, identity, worker, head, account, sessionId }
}

function sourceFor(producer: ReturnType<typeof producerIdentity>, cwd?: string) {
  return readPiQuestionEntries({ path: producer.head.handle.nativeId, privateRoot: join(producer.account.private_root, producer.sessionId), ...(cwd === undefined ? {} : { cwd: realpathSync.native(cwd) }), provider: producer.account.provider, modelId: producer.account.model_target.model_id, api: producer.account.model_target.api })
}

function questionReceipts(runtime: OrcaRuntimeService, dispatchId: string) {
  const db = runtime.getOrchestrationDb(), where = `FROM mutation_receipts WHERE caller_fingerprint=? AND method='orchestration.ask' AND json_valid(receipt)=1
    AND json_extract(receipt,'$.schema')='swa.native-question.v1' AND json_extract(receipt,'$.dispatch_id')=?`
  const bound = z.object({ count: z.number(), bytes: z.number().nullable() }).parse(db.db.prepare(`SELECT COUNT(*) count,SUM(LENGTH(CAST(receipt AS BLOB))) bytes ${where}`).get(authority(runtime), dispatchId))
  if (bound.count > 100_000 || (bound.bytes ?? 0) > 12 * 1024 * 1024) deny('evidence_missing', 'The complete native question receipt inventory exceeds its bound')
  return rowsSchema.parse(db.db.prepare(`SELECT request_id,state,receipt ${where}`).all(authority(runtime), dispatchId)).map(row => ({ ...row, value: row.state === 'completed' ? readQuestionMutationResult(JSON.parse(row.receipt), row.request_id) : nativeObject(JSON.parse(row.receipt)) }))
}

function inspectCall(context: RpcContext, requestId: string, params: unknown, cwd?: string, query = false) {
  const producer = producerIdentity(context), origin = questionOriginSchema.parse(context.swaQuestionOrigin), source = sourceFor(producer, cwd)
  if (source.header.id !== origin.nativeSessionId) deny('request_mismatch', 'The native question session changed')
  const entry = source.entries.find(item => item.id === origin.assistantEntryId)
  if (!entry || entry.type !== 'message' || entry.message.role !== 'assistant') deny('scope_denied', 'The actual native question assistant entry is unavailable')
  const calls = entry.message.content.filter(block => block.type === 'toolCall' && block.id === origin.toolCallId)
  if (calls.length !== 1 || calls[0]!.type !== 'toolCall' || calls[0]!.name !== 'swa_ask') deny('scope_denied', 'The actual native question tool call is not unique')
  const toolParams = questionToolParamsSchema.parse(calls[0]!.arguments), baseId = questionRequestID(producer.sessionId, origin)
  const original = context.runtime.getOrchestrationDb().getMutationReceipt(authority(context.runtime), requestId)
  let effective = toolParams, createId = baseId
  if (requestId === questionWaitID(baseId)) {
    const created = context.runtime.getOrchestrationDb().getMutationReceipt(authority(context.runtime), baseId)
    const value = created?.receipt && nativeObject(JSON.parse(created.receipt))
    if (!value || created?.method !== 'orchestration.ask' || created.state !== 'completed' || typeof value.messageId !== 'string' || !isDeepStrictEqual(value.origin, origin) || !isDeepStrictEqual(value.params, toolParams)) deny('request_mismatch', 'The fixed wait request has no confirmed original question')
    effective = { resume: value.messageId }
  } else if (requestId !== baseId) deny('request_mismatch', 'The request ID differs from its exact native tool origin')
  if ('resume' in effective) {
    const question = context.runtime.getOrchestrationDb().getQuestion(effective.resume)
    const created = questionReceipts(context.runtime, producer.dispatch.id).filter(row => row.value.messageId === effective.resume && row.value.request_id === row.value.create_request_id && 'question' in nativeObject(row.value.params))
    if (!question || question.dispatch_id !== producer.dispatch.id || question.run_id !== producer.scope.run_id || created.length !== 1) deny('scope_denied', 'The resumed question does not belong to this original Worker')
    createId = z.uuid().parse(created[0]!.request_id)
  }
  if (!query) {
    const declared = nativeObject(params), { from, ...rest } = declared
    if (from !== undefined && from !== producer.identity.handle || !isDeepStrictEqual(rest, effective)) deny('request_mismatch', 'The native ask differs from its actual tool parameters')
  }
  if (original && !(original.state === 'pending' && original.receipt === null && context.orchestrationMutation?.requestId === requestId)) {
    const value = original.receipt && nativeObject(JSON.parse(original.receipt))
    if (original.method !== 'orchestration.ask' || !value || value.schema !== 'swa.native-question.v1' || value.request_id !== requestId || value.create_request_id !== createId || value.session_id !== producer.sessionId || value.dispatch_id !== producer.dispatch.id || value.run_id !== producer.scope.run_id || !isDeepStrictEqual(value.origin, origin) || !isDeepStrictEqual(value.params, effective)) deny('request_mismatch', 'The original question receipt has a different native origin')
  }
  return { ...producer, origin, params: effective, source, requestId, createId }
}

export async function admitQuestionProducer(request: RpcRequest, params: unknown, context: RpcContext) {
  if (request.swaOwnerCapability !== undefined || !['status.get', 'orchestration.ask', 'orchestration.requestShow'].includes(request.method)) deny('scope_denied', 'The native question producer cannot invoke this method')
  const producer = producerIdentity(context)
  if (request.method === 'status.get') {
    if (Object.keys(nativeObject(params)).length || request.swaQuestionOrigin !== undefined) deny('scope_denied', 'Question producer status may only perform the original compatibility check')
    return
  }
  const host = getStructuredAgentSessionHost()
  if (!host?.deps.resolveWorkspacePath) deny('worker_identity_changed', 'The actual structured workspace resolver is unavailable')
  const cwd = realpathSync.native(await host.deps.resolveWorkspacePath(producer.record.location.workspaceId))
  const requestId = request.method === 'orchestration.requestShow' ? z.strictObject({ request: z.uuid() }).parse(params).request : z.uuid().parse(request.orchestrationRequestId)
  inspectCall(context, requestId, params, cwd, request.method === 'orchestration.requestShow')
}

function askInvocation(call: ReturnType<typeof inspectCall>): Invocation {
  const inputPath = `native-question:${call.requestId}`
  return invocationSchema.parse({ ...call.invocation, spec: undefined, context: undefined, handoff: undefined, submission: undefined,
    command: { action: 'worker.send', project_id: call.invocation.project.id, controller: call.scope.controller, dispatch_id: call.dispatch.id, request_id: call.requestId, input_file: inputPath }, scope: call.scope,
    input: { path: inputPath, version: call.requestId, text: JSON.stringify(call.params) },
    question_ask: { start_request_id: call.row.request_id, request_id: call.requestId, ...('resume' in call.params ? { question_id: call.params.resume } : {}), session_id: call.sessionId, dispatch_id: call.dispatch.id, origin: call.origin, params: call.params }
  })
}

function assertCreationAvailable(context: RpcContext, call: ReturnType<typeof inspectCall>) {
  if (!('question' in call.params)) return
  const db = context.runtime.getOrchestrationDb()
  const pending = z.object({ count: z.number() }).parse(db.db.prepare("SELECT COUNT(*) count FROM question_threads WHERE dispatch_id=? AND status='pending'").get(call.dispatch.id)).count
  const unknown = questionReceipts(context.runtime, call.dispatch.id).some(row => row.request_id !== call.requestId && row.state === 'pending')
  if (pending || unknown) deny('operation_in_progress', 'This Dispatch already has a pending question or unknown original request; resume or inspect that request')
}

export function questionAskMethod(admit: (invocation: Invocation) => Promise<unknown>) {
  const original = buildRegistry(ORCHESTRATION_ASK_METHODS).get('orchestration.ask')
  if (!original || isStreamingMethod(original)) throw new Error('The original native ask method is unavailable')
  return defineMethod({ name: 'orchestration.ask', permission: original.permission, params: AskParams, handler: async (params, context) => {
    const mutation = context.orchestrationMutation, host = getStructuredAgentSessionHost()
    if (!mutation || mutation.method !== 'orchestration.ask' || !host?.deps.resolveWorkspacePath) deny('scope_denied', 'The original native ask reservation and workspace resolver are required')
    let call = inspectCall(context, mutation.requestId, params)
    const base = { schema: 'swa.native-question.v1' as const, project_id: call.invocation.project.id, controller: call.scope.controller, run_id: call.scope.run_id, root_task_id: call.scope.root_task_id, dispatch_id: call.dispatch.id, session_id: call.sessionId, start_request_id: call.row.request_id, request_id: call.requestId, create_request_id: call.createId, origin: call.origin, params: call.params }
    const save = (value: Record<string, unknown>) => {
      const result = strictPiQuestionResultSchema.parse({ ...base, ...value })
      if (!context.recordMutationReceipt) throw new OrchestrationError('operation_unknown', 'The original question receipt is unavailable')
      context.recordMutationReceipt(result)
      return result
    }
    const checkpoint = (stage: string) => context.runtime.getOrchestrationDb().checkpointPendingMutationReceipt({ ...mutation, receipt: JSON.stringify({ ...base, stage }) })
    try {
      // 原来源已在 executor 前准入；再次核实际文件并在首个 await 前保存归属。
      checkpoint('resolving_workspace')
      const cwd = realpathSync.native(await host.deps.resolveWorkspacePath(call.record.location.workspaceId))
      call = inspectCall(context, mutation.requestId, params, cwd)
      checkpoint('waiting_for_start')
      const deadline = Date.now() + 90_000
      while (call.row.state !== 'completed' || call.worker.state !== 'ready') {
        if (context.signal?.aborted || Date.now() >= deadline) deny('start_unsettled', 'The original Worker start did not settle before the question deadline')
        await delay(100, undefined, { signal: context.signal })
        call = inspectCall(context, mutation.requestId, params, cwd)
      }
      const invocation = askInvocation(call)
      await admit(invocation)
      call = inspectCall(context, mutation.requestId, params, cwd)
      if (!isDeepStrictEqual(askInvocation(call), invocation) || call.row.state !== 'completed' || call.worker.state !== 'ready') deny('request_mismatch', 'The original question source changed after current project admission')
      assertCreationAvailable(context, call)
    } catch (error) { const failure = nativeError(error); return save({ state: 'rejected', effects_applied: false, error: { code: failure.code, message: failure.message } }) }
    try {
      checkpoint('question-ask')
      context.markMutationEffectPossible?.()
      const recorded = (value: unknown) => {
        const result = nativeObject(value), question = typeof result.messageId === 'string' && context.runtime.getOrchestrationDb().getQuestion(result.messageId)
        if (!question || question.run_id !== call.scope.run_id || question.dispatch_id !== call.dispatch.id || result.threadId !== question.message_id || result.answer !== null && (question.status !== 'answered' || result.answerMessageId !== question.answer_message_id || result.answer !== question.answer_body)) throw new Error('The native question result binding is incomplete')
        producerIdentity(context)
        return save({ ...result, question_id: question.message_id, state: result.answer !== null ? 'answered' : result.accepted === true ? 'accepted' : 'waiting' })
      }
      return recorded(await original.handler(original.params?.parse({ ...call.params, from: call.identity.handle, run: call.scope.run_id }), { ...context, recordMutationReceipt: value => { recorded(value) } }))
    } catch { throw new OrchestrationError('operation_unknown', 'The original native question outcome or answer delivery is unconfirmed; inspect its original request') }
  } })
}

export type QuestionReadState = 'pending' | 'answer_saved' | 'read_observed' | 'continuation_required' | 'read_unconfirmed' | 'interrupted'
export type QuestionObservation = { question_id: string; dispatch_id: string; read_state: QuestionReadState; continuation_required: boolean; blocks_settlement: boolean }

function confirmedQuestionStop(runtime: OrcaRuntimeService, dispatchId: string) {
  const db = runtime.getOrchestrationDb()
  if (db.getWorkerDispatch(dispatchId)?.state !== 'stopped') return false
  return z.object({ count: z.number() }).parse(db.db.prepare(`SELECT COUNT(*) count FROM mutation_receipts WHERE caller_fingerprint=? AND method='orchestration.workerStop' AND state='completed'
    AND json_valid(receipt)=1 AND json_extract(receipt,'$.dispatchId')=? AND json_extract(receipt,'$.state')='stopped'`).get(authority(runtime), dispatchId)).count > 0
}

function readQuestionJournal(sessionId: string) {
  const host = getStructuredAgentSessionHost()
  if (!host) deny('evidence_missing', 'The actual question journal host is unavailable')
  const bound = z.object({ count: z.number(), bytes: z.number().nullable() }).parse(host.deps.journalDatabase.db.prepare(`SELECT COUNT(*) count,SUM(LENGTH(CAST(r.row_json AS BLOB))) bytes
    FROM journal_rows r JOIN journal_sessions s ON s.session_id=r.session_id AND s.epoch=r.epoch WHERE r.session_id=?`).get(sessionId))
  if (bound.count > 100_000 || (bound.bytes ?? 0) > 12 * 1024 * 1024) deny('evidence_missing', 'The complete question journal exceeds its read bound')
  return replayJournal(host.deps.journalDatabase.db, sessionId)
}

function nativeQuestionIdle(runtime: OrcaRuntimeService, original: ReturnType<typeof startForSession>) {
  const sessionId = original.binding.session_id, host = getStructuredAgentSessionHost(), record = host?.deps.store.getRecord(sessionId)
  const identity = structuredWorkerIdentities.getBySessionId(sessionId), worker = runtime.getOrchestrationDb().getWorkerDispatch(original.dispatch.id)
  if (!record || !host || identity?.dispatchId !== original.dispatch.id || worker?.state !== 'ready' || worker.runtime_epoch !== runtime.getRuntimeId() || record.lease.claimStatus !== 'live' || record.lease.unreconciled || !record.lease.ownerProcess || record.lease.runtimeFence !== original.binding.runtime_fence) return false
  const journal = readQuestionJournal(sessionId)
  if (!journal || journal.damage || journal.newer) return false
  const view = renderJournalState(journal.state), latest = latestStructuredAgentSessionRequest(view.items, view.submissions)
  if (!latest || latest.turnState === 'running' || !latest.outcome || view.submissions.some(value => value.dispatchState === 'pending' || value.dispatchState === 'unknown')) return false
  const trace = readNativePiFile(join(z.string().min(1).parse(process.env.SWA_DATA_DIR), 'workers', sessionId, 'provider-events.ndjson'), 12 * 1024 * 1024, true)
  if (trace.bytes.at(-1) !== 10) return false
  let sequence = 0, lastPrompt = 0, settled = 0, idle = 0
  const framer = createIncrementalNdjsonFramer((value, line) => {
    if (!isDeepStrictEqual(value, parseStrictPiJson(line))) deny('evidence_missing', 'The actual native question trace changed')
    const row = z.object({ protocol: z.literal('pi-jsonl-rpc'), projection: z.literal('actual_native_rpc_frames'), session_id: z.string(), runtime_fence: z.number(), runtime_epoch: z.string(), sequence: z.number(), event: z.string(), detail: z.unknown() }).parse(value)
    if (row.session_id !== sessionId || row.runtime_fence !== original.binding.runtime_fence || row.runtime_epoch !== runtime.getRuntimeId() || row.sequence !== ++sequence) deny('evidence_missing', 'The actual native question trace identity changed')
    if (row.event === 'failure') deny('operation_unknown', 'The actual native question provider recorded a failure')
    if (row.event === 'write_intent' && nativeObject(row.detail).command === 'prompt') lastPrompt = row.sequence
    if (row.event === 'native_record') {
      const detail = nativeObject(row.detail), frame = strictPiQuestionRawSchema.parse(detail.frame)
      if (!isDeepStrictEqual(parseStrictPiJson(z.string().parse(detail.raw_line)), frame)) deny('evidence_missing', 'The actual native question frame changed')
      if (frame.type === 'agent_settled') settled = row.sequence
      if (frame.type === 'response' && frame.command === 'get_state' && !frame.data.isStreaming && !frame.data.isCompacting && frame.data.pendingMessageCount === 0) idle = row.sequence
    }
  }, () => deny('evidence_missing', 'The actual native question trace is incomplete'), { maxLineBytes: 8 * 1024 * 1024 })
  framer.feed(new TextDecoder('utf-8', { fatal: true }).decode(trace.bytes))
  return !framer.takeTail() && settled > lastPrompt && idle > settled
}

export function observeRunQuestions(runtime: OrcaRuntimeService, scope: Pick<Scope, 'run_id' | 'root_task_id' | 'project_id'>, dispatchId?: string, excludedResume?: string): QuestionObservation[] {
  const db = runtime.getOrchestrationDb()
  const bound = z.object({ count: z.number() }).parse(db.db.prepare('SELECT COUNT(*) count FROM question_threads WHERE run_id=?').get(scope.run_id))
  if (bound.count > 100_000) deny('evidence_missing', 'The complete Run question inventory exceeds its read bound')
  const rows = z.array(z.object({ message_id: z.string(), dispatch_id: z.string() })).parse(db.db.prepare(`SELECT message_id,dispatch_id FROM question_threads WHERE run_id=?${dispatchId ? ' AND dispatch_id=?' : ''} ORDER BY created_at,message_id`).all(...(dispatchId ? [scope.run_id, dispatchId] : [scope.run_id])))
  return rows.map(row => {
    const question = db.getQuestion(row.message_id)!, result = (read_state: QuestionReadState, blocks_settlement = true): QuestionObservation => ({ question_id: row.message_id, dispatch_id: row.dispatch_id, read_state, continuation_required: read_state === 'continuation_required', blocks_settlement })
    const receipts = questionReceipts(runtime, row.dispatch_id).filter(value => value.value.messageId === question.message_id)
    const stopped = confirmedQuestionStop(runtime, row.dispatch_id), unconfirmed = () => result(stopped ? 'interrupted' : 'read_unconfirmed', !stopped)
    if (question.status === 'pending') return stopped ? result('interrupted', false) : result('pending')
    if (question.status !== 'answered' || !receipts.length) return unconfirmed()
    try {
      const dispatch = db.getDispatchContextById(row.dispatch_id), sessionId = dispatch?.assignee_orca_session_id
      if (!sessionId) return unconfirmed()
      const original = startForSession(runtime, sessionId), record = runtime.openedAgentSessionRecordStore()?.getRecord(sessionId)
      const head = record && agentSessionProviderHandleChainHead(record.providerHandleChain), account = original.selection.native_launch.account
      if (!head || !record || account.kind !== 'pi-native-api-key-per-session' || head.mintedAtFence !== original.binding.runtime_fence || head.origin !== 'created' || head.forkedFromKey || head.handle.agent !== 'pi' || head.handle.transport !== 'jsonl-rpc') return unconfirmed()
      if (record.lease.claimStatus === 'released') {
        const snapshot = readNativePiFile(join(z.string().min(1).parse(process.env.SWA_DATA_DIR), 'workers', sessionId, 'provider-events.ndjson'), 12 * 1024 * 1024, true), trace: unknown[] = []
        if (snapshot.bytes.at(-1) !== 10) return unconfirmed()
        const framer = createIncrementalNdjsonFramer((value, line) => {
          if (trace.length >= 100_000 || !isDeepStrictEqual(value, parseStrictPiJson(line))) deny('evidence_missing', 'The original closed question source is incomplete')
          trace.push(value)
        }, () => deny('evidence_missing', 'The original closed question source is unreadable'), { maxLineBytes: 12 * 1024 * 1024 })
        framer.feed(new TextDecoder('utf-8', { fatal: true }).decode(snapshot.bytes))
        if (framer.takeTail()) return unconfirmed()
        const worker = db.getWorkerDispatch(row.dispatch_id)
        inspectStructuredTrace({ agent: 'pi', record, binding: original.binding, nativeId: head.handle.nativeId, runtimeId: z.string().min(1).parse(worker?.runtime_epoch), requireClosed: true, rows: trace })
      } else if (record.lease.claimStatus !== 'live' || !record.lease.ownerProcess || record.lease.runtimeFence !== original.binding.runtime_fence) return unconfirmed()
      const source = readPiQuestionEntries({ path: head.handle.nativeId, privateRoot: join(account.private_root, sessionId), provider: account.provider, modelId: account.model_target.model_id, api: account.model_target.api })
      let ended = false
      for (const entry of source.entries) {
        if (entry.type !== 'message' || entry.message.role !== 'toolResult' || entry.message.isError) continue
        const value = strictPiQuestionResultSchema.parse(entry.message.details)
        if (value.messageId !== question.message_id) continue
        const receipt = receipts.find(item => item.request_id === value.request_id && item.state === 'completed' && isDeepStrictEqual(item.value, value))
        const origin = value.origin, toolEntry = origin && source.entries.find(item => item.id === origin.assistantEntryId)
        if (!receipt || !origin || origin.nativeSessionId !== source.header.id || origin.toolCallId !== entry.message.toolCallId || !toolEntry || toolEntry.type !== 'message' || toolEntry.message.role !== 'assistant' || !toolEntry.message.content.some(block => block.type === 'toolCall' && block.id === origin.toolCallId && block.name === 'swa_ask') || value.session_id !== sessionId || value.dispatch_id !== row.dispatch_id || value.run_id !== scope.run_id) continue
        if (value.state === 'answered' && value.answerMessageId === question.answer_message_id && value.answer === question.answer_body) return result('read_observed', false)
        if (value.timedOut || value.cancelled || value.connectionLost) ended = true
      }
      if (stopped) return result('interrupted', false)
      if (!ended || !nativeQuestionIdle(runtime, original)) return result('answer_saved')
      const continuing = rowsSchema.parse(db.db.prepare(`SELECT request_id,state,receipt FROM mutation_receipts WHERE caller_fingerprint=? AND method='swa.controllerDeliver' AND json_valid(receipt)=1
        AND json_extract(receipt,'$.action')='question.resume' AND json_extract(receipt,'$.invocation.command.question_id')=? AND request_id<>?`).all(authority(runtime), question.message_id, excludedResume ?? ''))
      for (const row of continuing) {
        const receipt = nativeObject(JSON.parse(row.receipt)), native = receipt.native === undefined ? null : nativeObject(receipt.native)
        if (row.state !== 'completed' || !native) return result('read_unconfirmed')
        if (native.state === 'rejected' && native.effects_applied === false) continue
        const binding = structuredInputBindingSchema.parse(receipt.swa_input_binding ?? native.swa_input_binding)
        const replay = readQuestionJournal(sessionId)
        if (!replay || replay.damage || replay.newer) return result('read_unconfirmed')
        const submission = replay.state.submissions.get(binding.operation_id)
        if (submission?.dispatchState !== 'accepted' || !submission.providerItemId) return result('read_unconfirmed')
        const user = replay.state.items.get(replay.state.aliases.get(submission.providerItemId) ?? submission.providerItemId)
        if (!user) return result('read_unconfirmed')
        const turn = readPiJournalInputTurn(replay.state, user, sessionId, binding.runtime_fence)
        if (turn.body.kind !== 'turn' || turn.body.state !== 'completed') return result('read_unconfirmed')
      }
      return result('continuation_required')
    } catch { return unconfirmed() }
  })
}

export function assertQuestionResume(runtime: OrcaRuntimeService, invocation: Invocation) {
  if (invocation.command.action !== 'question.resume') return
  const c = invocation.command, scope = invocation.scope
  if (!c.question_id || !c.dispatch_id || c.run_id !== scope.run_id || c.task_id !== scope.root_task_id || c.controller !== scope.controller || invocation.handoff || invocation.submission || invocation.question_ask || invocation.input?.path !== `native-question-resume:${c.question_id}` || invocation.input.version !== c.request_id || invocation.input.text !== questionResumeBody(c.question_id)) deny('scope_denied', 'The explicit question continuation differs from its original fixed input')
  const rows = observeRunQuestions(runtime, scope, c.dispatch_id, c.request_id)
  if (!rows.find(row => row.question_id === c.question_id)?.continuation_required) deny('question_not_resumable', 'The original question is not confirmed answered, timed out and idle; inspect its original Run and request')
}

export function hasQuestionSettlementBlock(runtime: OrcaRuntimeService, scope: Pick<Scope, 'run_id' | 'root_task_id' | 'project_id'>, dispatchId?: string) {
  if (observeRunQuestions(runtime, scope, dispatchId).some(row => row.blocks_settlement)) return true
  const db = runtime.getOrchestrationDb()
  const pending = z.array(z.object({ dispatch_id: z.string().nullable() })).parse(db.db.prepare(`SELECT DISTINCT json_extract(receipt,'$.dispatch_id') dispatch_id FROM mutation_receipts WHERE caller_fingerprint=? AND method='orchestration.ask' AND state='pending' AND json_valid(receipt)=1
    AND json_extract(receipt,'$.run_id')=?${dispatchId ? " AND json_extract(receipt,'$.dispatch_id')=?" : ''} LIMIT 100001`).all(...(dispatchId ? [authority(runtime), scope.run_id, dispatchId] : [authority(runtime), scope.run_id])))
  if (pending.length > 100_000) deny('evidence_missing', 'The complete pending question inventory exceeds its read bound')
  return pending.some(row => !row.dispatch_id || !confirmedQuestionStop(runtime, row.dispatch_id))
}

export function hasTaskQuestionSettlementBlock(runtime: OrcaRuntimeService, scope: Pick<Scope, 'run_id' | 'root_task_id' | 'project_id'>, taskId: string, dispatchId: string) {
  const db = runtime.getOrchestrationDb(), dispatch = db.getDispatchContextById(dispatchId)
  if (!dispatch || dispatch.task_id !== taskId || dispatch.run_id !== scope.run_id || !isTaskDescendant(db, scope.run_id, scope.root_task_id, taskId)) deny('scope_denied', 'The original question settlement Task and Dispatch changed')
  const affected = z.array(z.object({ id: z.string() })).parse(db.db.prepare(`SELECT id FROM dispatch_contexts WHERE task_id=? AND run_id=? AND (id=? OR status IN ('pending','dispatched')) LIMIT 100001`).all(taskId, scope.run_id, dispatchId))
  if (affected.length > 100_000) deny('evidence_missing', 'The complete question settlement Dispatch group exceeds its read bound')
  return affected.some(row => hasQuestionSettlementBlock(runtime, scope, row.id))
}
