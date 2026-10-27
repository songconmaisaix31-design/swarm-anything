import { join } from 'node:path'
import { realpath } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { defineMethod, type RpcContext, type RpcRequest } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/core'
import type { OrcaRuntimeService } from '../../../third_party/orca-v1.4.230/src/main/runtime/orca-runtime'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import { getStructuredAgentSessionHost } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-wire/structured-agent-session-registry'
import { strictPiDelegationResultSchema } from '../../../third_party/orca-v1.4.230/src/main/pi/rpc-protocol'
import { authority } from './controller-scope'
import { producerIdentity, nativePiToolSource } from './question-ask'
import { readPiQuestionEntries } from './pi-session-result'
import { delegationRequestID, delegationWorkerRequestID, delegationToolParamsSchema, questionOriginSchema, invocationSchema, nativeObject, nativeError, type Invocation } from './contracts'
import { resolveCollaborationReferences } from './collaboration-records'
import { deliverRunHandoff, resolveSelection } from './native-methods'
import { requestRunSettlement } from './run-settlement'

function deny(message: string): never { throw new OrchestrationError('scope_denied', message, { effectsApplied: false }) }

export function assertDelegationParentStopOpen(runtime: OrcaRuntimeService, runId: string, dispatchId: string) {
  const held = z.object({ count: z.number().int().nonnegative() }).parse(runtime.getOrchestrationDb().db.prepare(`SELECT COUNT(*) count FROM mutation_receipts
    WHERE caller_fingerprint=? AND method='swa.controllerDeliver' AND state='pending' AND json_valid(receipt)=1
    AND json_extract(receipt,'$.run_id')=? AND json_extract(receipt,'$.invocation.command.dispatch_id')=?
    AND json_extract(receipt,'$.action') IN ('worker.stop','worker.release')`).get(authority(runtime), runId, dispatchId))
  if (held.count > 0) deny('The original delegation parent has a reserved stop or release; inspect that original request')
}

export function assertDelegationParentCurrent(runtime: OrcaRuntimeService, invocation: Invocation) {
  const binding = invocation.native_delegation
  if (!binding) return
  if (binding.observation_only) deny('A delegation observation cannot authorize a new Worker effect')
  const parent = nativePiToolSource(runtime, binding.session_id, 'swa_delegate'), db = runtime.getOrchestrationDb()
  assertDelegationParentStopOpen(runtime, parent.scope.run_id, parent.dispatch.id)
  const task = db.getTask(parent.dispatch.task_id), row = db.getMutationReceipt(authority(runtime), binding.request_id)
  const receipt = row?.receipt && nativeObject(JSON.parse(row.receipt))
  if (parent.row.state !== 'completed' || parent.worker.state !== 'ready' || !task || ['completed', 'failed'].includes(task.status) || binding.start_request_id !== parent.row.request_id || binding.dispatch_id !== parent.dispatch.id || binding.parent_task_id !== parent.dispatch.task_id || invocation.command.parent_task_id !== parent.dispatch.task_id || !isDeepStrictEqual(binding.parent_selection, parent.selection) || !isDeepStrictEqual(invocation.caller, parent.invocation.caller) || !isDeepStrictEqual(invocation.scope, parent.scope) || invocation.project.id !== parent.invocation.project.id || binding.request_id !== delegationRequestID(binding.session_id, binding.origin) || invocation.command.request_id !== delegationWorkerRequestID(binding.request_id) || row?.method !== 'swa.delegate' || !receipt || !isDeepStrictEqual(receipt.origin, binding.origin) || !isDeepStrictEqual(receipt.params, binding.params)) deny('The original delegation parent is no longer current')
  const source = readPiQuestionEntries({ path: parent.head.handle.nativeId, privateRoot: join(parent.account.private_root, parent.sessionId), provider: parent.account.provider, modelId: parent.account.model_target.model_id, api: parent.account.model_target.api, collaboration: true, project: parent.selection.native_launch.tools.mode === 'project' })
  const entry = source.entries.find(item => item.id === binding.origin.assistantEntryId)
  if (source.header.id !== binding.origin.nativeSessionId || !entry || entry.type !== 'message' || entry.message.role !== 'assistant') deny('The original delegation parent entry changed')
  const calls = entry.message.content.filter(item => item.type === 'toolCall' && item.id === binding.origin.toolCallId)
  if (calls.length !== 1 || calls[0]!.type !== 'toolCall' || calls[0]!.name !== 'swa_delegate' || !isDeepStrictEqual(calls[0]!.arguments, binding.params)) deny('The original delegation parent parameters changed')
}

export function isDelegationRequest(request: RpcRequest, context: RpcContext) {
  if (request.method === 'swa.delegate') return true
  if (request.method !== 'orchestration.requestShow') return false
  const session = context.orchestrationCaller?.sessionId ?? request.orchestrationCompatibilityEvidence?.agentSessionId
  const origin = questionOriginSchema.safeParse(request.swaQuestionOrigin)
  return typeof session === 'string' && origin.success && nativeObject(request.params).request === delegationRequestID(session, origin.data)
}

async function inspectCall(context: RpcContext, requestId: string, params?: unknown) {
  const producer = producerIdentity(context, 'swa_delegate'), origin = questionOriginSchema.parse(context.swaQuestionOrigin)
  if (!['collaboration', 'project'].includes(producer.selection.native_launch.tools.mode)) deny('The parent Worker delegation capability is not current')
  const resolvePath = getStructuredAgentSessionHost()?.deps.resolveWorkspacePath
  if (!resolvePath) deny('The native parent workspace is unavailable')
  const cwd = await realpath(await resolvePath(producer.record.location.workspaceId))
  const source = readPiQuestionEntries({ path: producer.head.handle.nativeId, privateRoot: join(producer.account.private_root, producer.sessionId), cwd, provider: producer.account.provider, modelId: producer.account.model_target.model_id, api: producer.account.model_target.api, collaboration: true, project: producer.selection.native_launch.tools.mode === 'project' })
  const entry = source.entries.find(row => row.id === origin.assistantEntryId)
  if (source.header.id !== origin.nativeSessionId || !entry || entry.type !== 'message' || entry.message.role !== 'assistant') deny('The native delegation assistant entry is unavailable')
  const calls = entry.message.content.filter(block => block.type === 'toolCall' && block.id === origin.toolCallId)
  if (calls.length !== 1 || calls[0]!.type !== 'toolCall' || calls[0]!.name !== 'swa_delegate') deny('The native delegation tool call is not unique')
  const actual = delegationToolParamsSchema.parse(calls[0]!.arguments)
  if (requestId !== delegationRequestID(producer.sessionId, origin) || params !== undefined && !isDeepStrictEqual(params, actual)) deny('The delegation differs from its original tool call')
  const row = context.runtime.getOrchestrationDb().getMutationReceipt(authority(context.runtime), requestId)
  if (row?.receipt) {
    const receipt = nativeObject(JSON.parse(row.receipt))
    if (row.method !== 'swa.delegate' || receipt.session_id !== producer.sessionId || receipt.parent_dispatch_id !== producer.dispatch.id || !isDeepStrictEqual(receipt.origin, origin) || !isDeepStrictEqual(receipt.params, actual)) deny('The original delegation receipt belongs to a different native call')
  }
  producerIdentity(context, 'swa_delegate')
  return { ...producer, origin, params: actual, requestId }
}

export async function admitDelegationProducer(request: RpcRequest, params: unknown, context: RpcContext, admit: (invocation: Invocation) => Promise<unknown>) {
  if (request.swaOwnerCapability !== undefined || !['swa.delegate', 'orchestration.requestShow'].includes(request.method)) deny('The native delegation producer cannot invoke this method')
  const query = request.method === 'orchestration.requestShow'
  const requestId = query ? z.strictObject({ request: z.uuid() }).parse(params).request : z.uuid().parse(request.orchestrationRequestId)
  const call = await inspectCall(context, requestId, query ? undefined : params)
  await admit(query ? storedDelegationObservation(context.runtime, call) ?? await delegationAdmissionInvocation(context, call) : await delegationAdmissionInvocation(context, call))
  producerIdentity(context, 'swa_delegate')
}

export function storedDelegationObservation(runtime: OrcaRuntimeService, call: Pick<Awaited<ReturnType<typeof inspectCall>>, 'requestId' | 'sessionId' | 'row' | 'scope' | 'dispatch' | 'selection' | 'origin' | 'params' | 'invocation'>): Invocation | undefined {
  const db = runtime.getOrchestrationDb(), workerRequest = delegationWorkerRequestID(call.requestId)
  if (db.getMutationReceipt(authority(runtime), workerRequest)) return undefined
  const row = db.getMutationReceipt(authority(runtime), call.requestId)
  if (!row?.receipt) return undefined
  const saved = nativeObject(JSON.parse(row.receipt))
  if (row.method !== 'swa.delegate' || saved.request_id !== call.requestId || saved.worker_request_id !== workerRequest || saved.session_id !== call.sessionId || saved.parent_dispatch_id !== call.dispatch.id || saved.parent_task_id !== call.dispatch.task_id || saved.run_id !== call.scope.run_id || saved.project_id !== call.invocation.project.id || !isDeepStrictEqual(saved.origin, call.origin) || !isDeepStrictEqual(saved.params, call.params)) deny('The saved delegation observation differs from its original native source')
  return invocationSchema.parse({ command: { action: 'request.show', controller: call.scope.controller, task_id: call.scope.root_task_id, dispatch_id: call.dispatch.id, request_id: call.requestId }, caller: call.invocation.caller, project: call.invocation.project, scope: call.scope, selection: call.selection,
    native_delegation: { schema: 'swa.native-delegation.v1', observation_only: true, start_request_id: call.row.request_id, request_id: call.requestId, worker_request_id: workerRequest, session_id: call.sessionId, dispatch_id: call.dispatch.id, parent_task_id: call.dispatch.task_id, parent_selection: call.selection, origin: call.origin, params: call.params } })
}

async function delegationAdmissionInvocation(context: RpcContext, call: Awaited<ReturnType<typeof inspectCall>>) {
  const row = context.runtime.getOrchestrationDb().getMutationReceipt(authority(context.runtime), delegationWorkerRequestID(call.requestId))
  if (row?.receipt) {
    const receipt = nativeObject(JSON.parse(row.receipt)), original = invocationSchema.parse(receipt.invocation), binding = original.native_delegation
    if (row.method !== 'swa.controllerDeliver' || !binding || binding.start_request_id !== call.row.request_id || binding.request_id !== call.requestId || binding.session_id !== call.sessionId || binding.dispatch_id !== call.dispatch.id || !isDeepStrictEqual(binding.parent_selection, call.selection) || !isDeepStrictEqual(binding.origin, call.origin) || !isDeepStrictEqual(binding.params, call.params)) deny('The original child admission differs from its native delegation')
    return original
  }
  return invocationFor(context, call)
}

async function invocationFor(context: RpcContext, call: Awaited<ReturnType<typeof inspectCall>>) {
  const requestId = delegationWorkerRequestID(call.requestId), inputPath = `native-delegation:${call.requestId}`
  const command: Invocation['command'] = { action: 'worker.start', project_id: call.invocation.project.id, controller: call.scope.controller, task_id: call.scope.root_task_id, parent_task_id: call.dispatch.task_id, request_id: requestId, input_file: inputPath, name: `Delegated ${call.params.role_id}`, role_id: call.params.role_id, revision: call.params.revision, handoff_mode: call.params.mode, reply_mode: 'resume', completion_criteria: call.params.completion_criteria, question_mode: 'disabled', delegation_mode: 'disabled' }
  const references = resolveCollaborationReferences(context.runtime.getOrchestrationDb(), call.invocation.project.id, { role_id: command.role_id, role_revision: command.revision })
  command.development_mode = call.params.mode === 'consult' ? 'disabled' : references.role_snapshot?.development_mode ?? 'disabled'
  const selection = await resolveSelection(context.runtime, call.invocation.project.id, command)
  return invocationSchema.parse({ command, caller: call.invocation.caller, project: call.invocation.project, scope: call.scope, spec: references, selection,
    input: { path: inputPath, version: call.requestId, text: call.params.input },
    native_delegation: { schema: 'swa.native-delegation.v1', start_request_id: call.row.request_id, request_id: call.requestId, worker_request_id: requestId, session_id: call.sessionId, dispatch_id: call.dispatch.id, parent_task_id: call.dispatch.task_id, parent_selection: call.selection, origin: call.origin, params: call.params }
  })
}

export function delegationMethod(admit: (invocation: Invocation) => Promise<unknown>) {
  return defineMethod({ name: 'swa.delegate', permission: 'workspace', params: delegationToolParamsSchema, handler: async (params, context) => {
    const mutation = context.orchestrationMutation
    if (!mutation || mutation.method !== 'swa.delegate' || !context.recordMutationReceipt) deny('The original delegation reservation is required')
    const producer = producerIdentity(context, 'swa_delegate'), origin = questionOriginSchema.parse(context.swaQuestionOrigin)
    const requestId = mutation.requestId, workerRequest = delegationWorkerRequestID(requestId)
    if (requestId !== delegationRequestID(producer.sessionId, origin)) deny('The delegation reservation differs from its exact native origin')
    const base = { schema: 'swa.native-delegation.v1', project_id: producer.invocation.project.id, controller: producer.scope.controller, run_id: producer.scope.run_id, root_task_id: producer.scope.root_task_id, session_id: producer.sessionId, parent_dispatch_id: producer.dispatch.id, parent_task_id: producer.dispatch.task_id, origin, params, request_id: requestId, worker_request_id: workerRequest }
    context.runtime.getOrchestrationDb().checkpointPendingMutationReceipt({ ...mutation, receipt: JSON.stringify(base) })
    const save = (value: unknown) => {
      const result = strictPiDelegationResultSchema.parse(value), receipt = { ...base, ...result }
      context.recordMutationReceipt!(receipt)
      requestRunSettlement(context.runtime, producer.scope)
      return receipt
    }
    let invocation: Invocation
    try {
      let call = await inspectCall(context, requestId, params)
      invocation = await delegationAdmissionInvocation(context, call)
      const deadline = Date.now() + 90_000
      while (call.row.state !== 'completed' || call.worker.state !== 'ready') {
        if (context.signal?.aborted || Date.now() >= deadline) deny('The parent Worker start did not settle before delegation')
        await admit(invocation)
        await delay(100, undefined, { signal: context.signal })
        call = await inspectCall(context, requestId, params)
      }
      await admit(invocation)
      const current = await inspectCall(context, requestId, params)
      if (current.row.state !== 'completed' || current.worker.state !== 'ready') deny('The parent Worker changed before delegation')
      if (context.signal?.aborted) deny('The parent cancelled before the child start')
    } catch (error) {
      const failure = nativeError(error)
      return save({ schema: base.schema, request_id: requestId, worker_request_id: workerRequest, state: 'rejected', error: { code: failure.code, message: failure.message } })
    }
    context.markMutationEffectPossible?.()
    try {
      // 送达后独立记录原启动结果；连接取消不能留下阻止子任务结算的外层等待。
      const reply = nativeObject(await deliverRunHandoff(context.runtime, invocation)), native = nativeObject(reply.native)
      return save({ schema: base.schema, request_id: requestId, worker_request_id: workerRequest, state: native.state === 'ready' ? 'ready' : native.state === 'failed' ? 'failed' : 'unknown', ...(typeof native.taskId === 'string' ? { task_id: native.taskId } : {}), ...(typeof native.dispatchId === 'string' ? { dispatch_id: native.dispatchId } : {}), ...(native.state === 'ready' || native.state === 'failed' ? {} : { required_action: `Inspect original request ${workerRequest}; do not start another child` }) })
    } catch (error) {
      const failure = nativeError(error)
      return save({ schema: base.schema, request_id: requestId, worker_request_id: workerRequest, state: 'unknown', error: { code: failure.code, message: failure.message }, required_action: `Inspect original request ${workerRequest}; do not start another child` })
    }
  } })
}
