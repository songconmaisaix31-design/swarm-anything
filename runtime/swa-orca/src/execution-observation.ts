import { z } from 'zod'
import type { StructuredAgentDefinition } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-wire/structured-agent-definition'
import type { AgentSessionModelCatalogResult } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-wire'
import { parseAgentJournalItemKey } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-journal-item-key'
import { isAgentSessionProviderHandleLink } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-provider-handle'
import { readWholeAgentSessionFailureFact } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-failure'
import { agentSelectionSchema, declaredAgentFeaturesSchema, executionObservationSchema, modelCatalogObservationSchema, observationSchema, structuredInputBindingSchema } from './contracts'

export type AgentObservation = z.infer<typeof observationSchema>
export type ExecutionObservation = z.infer<typeof executionObservationSchema>

export function agentObservation(status: AgentObservation['status'], reason: string, source: string, basis: NonNullable<AgentObservation['basis']>): AgentObservation {
  return observationSchema.parse({ status, reason, source, basis })
}

export function describeAgentFeatures(definition: Pick<StructuredAgentDefinition, 'capabilities' | 'restingOptions'>) {
  return {
    declared_features: declaredAgentFeaturesSchema.parse({ images: definition.capabilities.imagePrompts, model_switch: definition.restingOptions.acceptsKey('model'), steering: definition.capabilities.steering }),
    images: agentObservation('unavailable', 'The SWA Worker input command accepts text only', 'swa-worker-input-contract', 'declaration'),
    model_switch: agentObservation('unavailable', 'The SWA Worker keeps its original approved model selection', 'swa-worker-selection-contract', 'declaration')
  }
}

/** catalog 只能由调用方按已核对的原 session 读取 savedOnly 结果。 */
export function modelCatalogObservation(configured: { model?: string; provider?: string }, catalog?: AgentSessionModelCatalogResult) {
  if (catalog && catalog.origin !== 'unknown') {
    const ids = new Set<string>()
    const models = catalog.models.map(model => {
      if (!model.id || ids.has(model.id)) throw new Error('The observed native model catalog has duplicate or empty identities')
      ids.add(model.id)
      return { id: model.id, label: model.label || model.id }
    })
    if (!Number.isFinite(catalog.fetchedAt) || catalog.fetchedAt < 0) throw new Error('The observed native model catalog has no valid observation time')
    return modelCatalogObservationSchema.parse({ origin: catalog.origin, availability: 'verified', models, observed_at: new Date(catalog.fetchedAt).toISOString() })
  }
  return modelCatalogObservationSchema.parse({ origin: configured.model ? 'configured' : 'unknown', availability: 'unverified', models: configured.model ? [{ id: configured.model, label: configured.model, ...(configured.provider ? { provider: configured.provider } : {}) }] : [] })
}

const sourceSchema = z.looseObject({ selection: agentSelectionSchema, native_session_id: z.string().regex(/^[a-zA-Z0-9_-]+$/), fence: z.number().int().nonnegative(), provider_link: z.unknown() })
const inputStatusSchema = z.looseObject({
  request_id: z.string().min(1), native_request_id: z.string().min(1), dispatch_id: z.string().min(1),
  agent: z.string().min(1), session_id: z.string().min(1), operation_id: z.string().min(1),
  state: z.enum(['journaled', 'queued', 'accepted', 'rejected', 'unknown']), binding: structuredInputBindingSchema,
  submission: z.looseObject({ clientMessageId: z.string().min(1), fence: z.number().int().nonnegative(), dispatchState: z.enum(['pending', 'accepted', 'rejected', 'unknown']), providerItemId: z.string().nullable() }).nullable()
})
const rejectionSchema = z.looseObject({
  request_id: z.string().min(1), native_request_id: z.string().min(1), dispatch_id: z.string().min(1),
  agent: z.string().min(1), state: z.literal('rejected'), effects_applied: z.literal(false),
  source: z.looseObject({ kind: z.literal('native_pre_input_admission'), child_request: z.string().min(1) })
})
const pendingInputSchema = z.looseObject({
  request_id: z.string().min(1), native_request_id: z.string().min(1), dispatch_id: z.string().min(1),
  agent: z.string().min(1), state: z.literal('unknown'),
  source: z.looseObject({ kind: z.literal('native_input_request_pending') })
})

/** 此函数只投影 task-result 已核验的原来源，不读取来源、重试输入或建立执行记录。 */
export function executionObservation(sourceValue: unknown, options: { dispatchId: string; currentInput?: unknown; nativeResult?: unknown; modelCatalog?: AgentSessionModelCatalogResult }): ExecutionObservation {
  const source = sourceSchema.parse(sourceValue), selected = source.selection, link = source.provider_link
  z.string().min(1).parse(options.dispatchId)
  if (!isAgentSessionProviderHandleLink(link) || link.handle.agent !== selected.agent_id || link.mintedAtFence !== source.fence) throw new Error('The execution observation does not match its original provider identity')
  const delivery: ExecutionObservation['delivery'] = { state: 'unknown', phase: 'unknown', source: 'native_input_unobserved' }
  let restart: 'failed' | 'unknown' | undefined
  if (options.currentInput !== undefined) {
    const rejection = rejectionSchema.safeParse(options.currentInput)
    const pending = pendingInputSchema.safeParse(options.currentInput)
    if (pending.success) {
      const row = pending.data
      if (row.agent !== selected.agent_id || row.dispatch_id !== options.dispatchId || row.native_request_id !== `${row.request_id}/native`) throw new Error('The pending input does not match its original native request')
      Object.assign(delivery, { request_id: row.request_id, source: 'native_input_request_pending' })
    } else if (rejection.success) {
      const row = rejection.data
      if (row.agent !== selected.agent_id || row.dispatch_id !== options.dispatchId || row.native_request_id !== `${row.request_id}/native` || row.source.child_request !== row.native_request_id) throw new Error('The rejected input does not match its original native request')
      Object.assign(delivery, { state: 'not_sent', phase: 'rejected', request_id: row.request_id, source: 'native_pre_input_admission' })
    } else {
      const input = inputStatusSchema.parse(options.currentInput), binding = input.binding, submission = input.submission
      if (input.agent !== selected.agent_id || input.dispatch_id !== options.dispatchId || input.session_id !== source.native_session_id || binding.agent !== input.agent || binding.session_id !== input.session_id || binding.runtime_fence !== source.fence || binding.parent_request !== input.request_id || binding.child_request !== input.native_request_id || input.native_request_id !== `${input.request_id}/native` || binding.dispatch_id !== input.dispatch_id || binding.operation_id !== input.operation_id || submission && (submission.clientMessageId !== binding.operation_id || submission.fence !== binding.runtime_fence)) throw new Error('The input observation changed its original request, session or fence')
      const expectedState = input.state === 'journaled' || input.state === 'queued' ? 'pending' : input.state
      if (submission && submission.dispatchState !== expectedState || !submission && input.state !== 'unknown') throw new Error('The input phase differs from its original journal settlement')
      Object.assign(delivery, { phase: input.state, request_id: input.request_id, operation_id: input.operation_id, source: 'native_input_journal' })
      if (input.state === 'accepted' && submission?.dispatchState === 'accepted' && submission.providerItemId) {
        const item = parseAgentJournalItemKey(submission.providerItemId)
        const sameProvider = item?.provider === 'codex' ? selected.agent_id === 'codex' && item.threadId === link.handle.nativeId
          : item?.provider === 'claude' ? selected.agent_id === 'claude' && item.sessionId === link.handle.nativeId
            : item?.provider === 'orca' ? selected.agent_id === 'pi' && selected.native_launch.account.kind === 'pi-native-api-key-per-session' && link.handle.transport === 'jsonl-rpc' && item.clientMessageId === binding.operation_id
              : item?.provider === 'legacy' && item.agent === selected.agent_id && item.sessionId === source.native_session_id
        if (!sameProvider) throw new Error('The accepted input has no matching native provider identity')
        delivery.state = 'sent'
      } else if (input.state === 'rejected' && submission?.dispatchState === 'rejected' && submission.providerItemId === null) {
        delivery.state = 'not_sent'
        if (submission.rejection !== undefined) {
          const fact = readWholeAgentSessionFailureFact(submission.rejection)
          if (!fact) restart = 'unknown'
          else if (fact.kind === 'restartFailed') {
            const refusal = fact.refusal
            // 只解释原生明确结束的恢复拒绝；其他 reason 或所有权状态继续未知。
            restart = refusal?.code === 'agent_session_operation_invalid' && refusal.details?.ownerVerdict === 'exited' && Object.keys(refusal.details).length === 1 ? 'failed' : 'unknown'
          }
        }
      }
    }
  }
  const resume: ExecutionObservation['resume'] = {
    state: restart ?? (link.origin === 'resumed' ? 'resumed' : link.origin === 'created' ? link.replaces ? 'rebuilt' : 'not_requested' : 'unknown'),
    source: restart === 'failed' ? 'native_journal_restart_refused' : restart === 'unknown' ? 'native_journal_restart_unconfirmed' : link.replaces ? 'native_provider_handle_replaced_context' : 'native_provider_handle_chain', session_id: source.native_session_id
  }
  const completed = delivery.source !== 'native_input_request_pending' && z.looseObject({ availability: z.literal('complete'), persistence: z.literal('observed'), final: z.looseObject({ text: z.string().trim().min(1) }) }).safeParse(options.nativeResult).success
  const launch = agentObservation('available', 'The original Worker has a verified native session and provider identity', 'native_worker_source', 'session')
  const control = delivery.state === 'sent'
    ? agentObservation('available', 'The original native session acknowledged this exact input', 'native_input_journal', 'session')
    : agentObservation('unknown', 'Native input acceptance has not been observed for this request', 'native_input_journal', 'session')
  const result = completed
    ? agentObservation('available', 'The verified native result completed the original latest input', 'native_session_result', 'result')
    : agentObservation('unknown', 'No complete successful native result was supplied', 'native_session_result', 'result')
  const authenticated = completed
    ? agentObservation('available', 'The selected account produced this verified native model result', 'native_session_result', 'result')
    : agentObservation('unknown', 'Configuration and session startup do not prove model authentication', 'native_session_result', 'result')
  return executionObservationSchema.parse({
    selection: { agent: selected.agent_id, adapter: selected.adapter, version: selected.version, execution_mode: selected.execution_mode, provider: selected.provider, model: selected.model, account_source: selected.native_launch.account.kind },
    launch, control, result, authenticated, delivery, resume, model_catalog: modelCatalogObservation({ model: selected.model, provider: selected.provider }, options.modelCatalog)
  })
}
