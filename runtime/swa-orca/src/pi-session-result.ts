import { createHash } from 'node:crypto'
import { basename, dirname, isAbsolute, relative } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { createIncrementalNdjsonFramer } from '../../../third_party/orca-v1.4.230/src/shared/main-process-ndjson-framer'
import type { JournalReducerState } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-reducer'
import { agentSessionSendBodyFingerprint } from '../../../third_party/orca-v1.4.230/src/shared/structured-agent-session-send-mutation'
import { SendBodyStructure } from '../../../third_party/orca-v1.4.230/src/shared/rpc-contract/structured-agent-session-message-params'
import { preparePiRpcPrompt } from '../../../third_party/orca-v1.4.230/src/main/pi/rpc-prompt'
import { parseAgentJournalItemKey } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-journal-item-key'
import { isRootAgentJournalItem } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-journal-producer'
import type { AgentJournalRenderItem } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-journal-types'
import { providerTimelineKeyPart, spelledProviderTimelineItemKey } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-timeline/provider-timeline-identity'
import { parseStrictPiJson, strictPiNativeEntrySchema, strictPiQuestionNativeEntrySchema, strictPiCollaborationNativeEntrySchema, strictPiProjectNativeEntrySchema, strictPiMorphNativeEntrySchema, strictPiNativeHeaderSchema, strictPiOutboundSchema, strictPiRawSchema, strictPiQuestionRawSchema, strictPiCollaborationRawSchema, strictPiProjectRawSchema, strictPiMorphRawSchema, type StrictPiProjectMessage, type StrictPiMorphMessage } from '../../../third_party/orca-v1.4.230/src/main/pi/rpc-protocol'
import { structuredInputBindingSchema } from './contracts'
import { readNativePiFile, type nativeConfigurationSource } from './native-pi-policy'
import { requireNativeCodexPrivatePath } from './native-codex-policy'

type Source = Awaited<ReturnType<typeof nativeConfigurationSource>>
type StrictPiQuestionMessage = StrictPiProjectMessage | StrictPiMorphMessage
type TraceRow = { event: string; sequence: number; detail: unknown }
type Binding = z.infer<typeof structuredInputBindingSchema>
export type NativePiSessionSourceInput = {
  path: string; privateRoot: string; nativeId?: string; cwd: string; provider: string; modelId: string; api: string; baseUrl: string
  source: Source; stopped: boolean; maximum: number; traceRows: readonly TraceRow[]; bindings: readonly Binding[]
  journal: JournalReducerState; fence: number; validateExport(serialized: string): void
  toolsMode?: 'disabled' | 'questions-only' | 'collaboration' | 'project' | 'morph'
}
const maximum = 12 * 1024 * 1024
const bodySchema = SendBodyStructure.omit({ kind: true }).extend({ kind: z.literal('message'), from: z.unknown().optional() })
const sourceSchema = z.strictObject({ path: z.string(), version: z.string() })
const baselineSchema = z.union([z.strictObject({ absent: z.literal(true) }), z.strictObject({ source: sourceSchema, bytes: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })])
const writeIntentSchema = z.strictObject({ command: z.string(), id: z.string(), cid: z.string().optional(), frame: strictPiOutboundSchema,
  binding: structuredInputBindingSchema.optional(), settings: sourceSchema, native_baseline: baselineSchema.optional() })
const writeSettledSchema = z.strictObject({ command: z.string(), id: z.string(), cid: z.string().optional(), outcome: z.enum(['resolved', 'rejected']), writeAttempted: z.boolean(), cleanupCompleted: z.boolean() })
const nativeRecordSchema = z.strictObject({ frame: strictPiRawSchema, raw_line: z.string(), response: z.strictObject({ id: z.string(), command: z.string() }).optional(), cid: z.string().optional() })
const projectionSchema = z.strictObject({ sourceSequence: z.number().int().positive(), eventType: z.string(), clientMessageId: z.string().optional(), acquisitionGeneration: z.string(), providerItem: z.string().optional(),
  report: z.strictObject({ journalEpoch: z.string(), published: z.boolean(), steps: z.array(z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('item'), written: z.boolean(), itemId: z.string().nullable() }),
    z.strictObject({ kind: z.literal('settlement'), written: z.boolean(), settlementId: z.string() })
  ])) }) })
const readySchema = z.strictObject({ native_contract: z.literal('pi-cli-1.0.1'), session_id: z.uuidv7(), session_file: z.string(), acquisition_generation: z.uuid(),
  provider: z.string(), model: z.strictObject({ model_id: z.string(), api: z.string(), base_url: z.string() }), tools: z.literal('disabled'), sources: z.array(sourceSchema), settings: sourceSchema })
function fail(reason: string): never { throw new Error(`native_pi_result_${reason}`) }
const checked = <T extends z.ZodType>(schema: T, value: unknown): z.output<T> => { const parsed = schema.safeParse(value); if (!parsed.success) fail('invalid_record'); return parsed.data }
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const samePath = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b

// 准入读取当前原件，不要求模型已经结束；准确工具 entry 由调用方核对。
export function readPiQuestionEntries(input: { path: string; privateRoot: string; cwd?: string; provider: string; modelId: string; api: string; collaboration?: boolean; project?: boolean; morph?: boolean }) {
  if (!isAbsolute(input.path) || !isAbsolute(input.privateRoot)) fail('source_binding_invalid')
  const part = relative(input.privateRoot, input.path)
  if (!part || part === '..' || part.startsWith('../') || part.startsWith('..\\') || isAbsolute(part)) fail('outside_private_home')
  requireNativeCodexPrivatePath(input.privateRoot, true)
  requireNativeCodexPrivatePath(dirname(input.path), true)
  const snapshot = readNativePiFile(input.path, maximum, true)
  if (snapshot.bytes.at(-1) !== 10) fail('source_changed_or_incomplete')
  const rows: unknown[] = []
  const framer = createIncrementalNdjsonFramer((record, line) => {
    if (rows.length >= 100_000 || !isDeepStrictEqual(record, parseStrictPiJson(line))) fail('invalid_record')
    rows.push(record)
  }, () => fail('invalid_jsonl'), { maxLineBytes: 8 * 1024 * 1024 })
  framer.feed(new TextDecoder('utf-8', { fatal: true }).decode(snapshot.bytes))
  if (framer.takeTail()) fail('unterminated_jsonl')
  const header = checked(strictPiNativeHeaderSchema, rows[0])
  if (input.cwd !== undefined && !samePath(header.cwd, input.cwd) || !basename(input.path).endsWith(`_${header.id}.jsonl`)) fail('native_identity_changed')
  const entries = rows.slice(1).map(row => checked(input.morph ? strictPiMorphNativeEntrySchema : input.project ? strictPiProjectNativeEntrySchema : input.collaboration ? strictPiCollaborationNativeEntrySchema : strictPiQuestionNativeEntrySchema, row)), ids = new Set<string>()
  let parent: string | null = null
  for (const entry of entries) {
    if (ids.has(entry.id) || entry.parentId !== parent) fail('native_parent_chain_changed')
    ids.add(entry.id); parent = entry.id
    if (entry.type === 'model_change' && (entry.provider !== input.provider || entry.modelId !== input.modelId)) fail('native_model_changed')
    if (entry.type === 'message' && entry.message.role === 'assistant' && (entry.message.provider !== input.provider || entry.message.model !== input.modelId || entry.message.api !== input.api || entry.message.stopReason === 'pending')) fail('native_message_unreviewed')
  }
  return { header, entries, source: snapshot.source }
}

/** 开局用户项可属于thread；它打开的turn由原userItemId声明，不能按顺序或最新项猜测。 */
export function readPiJournalInputTurn(journal: Pick<JournalReducerState, 'items' | 'aliases' | 'itemFences'>,
  user: Pick<AgentJournalRenderItem, 'itemId' | 'turnScope'>, sessionId: string, fence: number) {
  const resolve = (id: string) => journal.aliases.get(id) ?? id
  const scope = user.turnScope
  let candidates: AgentJournalRenderItem[]
  if (scope?.kind === 'turn') {
    const item = journal.items.get(resolve(scope.turnItemId))
    candidates = item ? [item] : []
  } else if (scope?.kind === 'thread') {
    candidates = [...journal.items.values()].filter(item => item.body.kind === 'turn' && item.body.userItemId !== undefined && resolve(item.body.userItemId) === user.itemId)
  } else fail('accepted_user_turn_missing')
  if (candidates.length !== 1) fail('accepted_user_turn_missing')
  const turn = candidates[0]!, identity = parseAgentJournalItemKey(turn.itemId)
  if (!isRootAgentJournalItem(turn) || turn.body.kind !== 'turn' || identity?.provider !== 'legacy' || identity.agent !== 'pi' || identity.sessionId !== sessionId || journal.itemFences.get(turn.itemId) !== fence) fail('accepted_user_turn_changed')
  return turn
}

/** 原Pi内容块索引与channel共同绑定journal角色；两种文本不能互换。 */
export function readPiFinalBlock(content: readonly { type: string }[], providerItem: string) {
  const matches = content.flatMap((block, index) => {
    const role = block.type === 'text' ? 'assistant' as const : block.type === 'thinking' ? 'reasoning' as const : null
    return role && providerItem.endsWith(`:${index}:${role}`) ? [{ index, role }] : []
  })
  if (matches.length !== 1) fail('final_journal_text_changed')
  return matches[0]!
}

/** 真正native原件、原R回执和已发布journal交叉消费；没有来源时不补造会话。 */
export async function readNativePiSessionSource(input: NativePiSessionSourceInput) {
  const entrySchema = input.toolsMode === 'morph' ? strictPiMorphNativeEntrySchema : input.toolsMode === 'project' ? strictPiProjectNativeEntrySchema : input.toolsMode === 'collaboration' ? strictPiCollaborationNativeEntrySchema : input.toolsMode === 'questions-only' ? strictPiQuestionNativeEntrySchema : strictPiNativeEntrySchema
  const recordSchema = input.toolsMode === 'morph' ? nativeRecordSchema.extend({ frame: strictPiMorphRawSchema }) : input.toolsMode === 'project' ? nativeRecordSchema.extend({ frame: strictPiProjectRawSchema }) : input.toolsMode === 'collaboration' ? nativeRecordSchema.extend({ frame: strictPiCollaborationRawSchema }) : input.toolsMode === 'questions-only' ? nativeRecordSchema.extend({ frame: strictPiQuestionRawSchema }) : nativeRecordSchema
  const cap = Math.min(maximum, input.maximum)
  if (!Number.isSafeInteger(cap) || cap < 1 || !isAbsolute(input.path) || !isAbsolute(input.privateRoot) || !isAbsolute(input.cwd) || !samePath(input.path, input.source.path)) fail('source_binding_invalid')
  const part = relative(input.privateRoot, input.path)
  if (!part || part === '..' || part.startsWith('../') || part.startsWith('..\\') || isAbsolute(part)) fail('outside_private_home')
  requireNativeCodexPrivatePath(input.privateRoot, true)
  requireNativeCodexPrivatePath(dirname(input.path), true)
  const snapshot = readNativePiFile(input.path, cap, true)
  if (!isDeepStrictEqual(snapshot.source, input.source) || snapshot.bytes.at(-1) !== 10) fail('source_changed_or_incomplete')
  let content: string
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(snapshot.bytes) } catch { fail('invalid_utf8') }
  input.validateExport(content)
  const rows: unknown[] = []
  const framer = createIncrementalNdjsonFramer((record, line) => {
    if (rows.length >= 100_000 || !isDeepStrictEqual(record, parseStrictPiJson(line))) fail('invalid_record')
    rows.push(record)
  }, () => fail('invalid_jsonl'), { maxLineBytes: 8 * 1024 * 1024 })
  framer.feed(content)
  if (framer.takeTail()) fail('unterminated_jsonl')
  const header = checked(strictPiNativeHeaderSchema, rows[0])
  if (!samePath(header.cwd, input.cwd) || !basename(input.path).endsWith(`_${header.id}.jsonl`) || input.nativeId !== undefined && input.nativeId !== header.id) fail('native_identity_changed')
  const entries = rows.slice(1).map(row => checked(entrySchema, row))
  const ids = new Set<string>()
  let parent: string | null = null
  for (const entry of entries) {
    if (ids.has(entry.id) || entry.parentId !== parent) fail('native_parent_chain_changed')
    ids.add(entry.id); parent = entry.id
    if (entry.type === 'model_change' && (entry.provider !== input.provider || entry.modelId !== input.modelId)) fail('native_model_changed')
    if (entry.type === 'message') assertMessage(entry.message)
  }
  function assertMessage(message: StrictPiQuestionMessage) {
    if (message.role === 'assistant' && (message.provider !== input.provider || message.model !== input.modelId || message.api !== input.api || message.stopReason === 'pending')) fail('native_message_unreviewed')
  }
  const readyRows = input.traceRows.filter(row => row.event === 'policy_ready')
  if (readyRows.length !== 1) fail('policy_ready_missing')
  const ready = checked(readySchema.extend({ tools: z.literal(input.toolsMode ?? 'disabled') }), readyRows[0]!.detail)
  if (ready.session_id !== header.id || !samePath(ready.session_file, input.path) || ready.provider !== input.provider || ready.model.model_id !== input.modelId || ready.model.api !== input.api || ready.model.base_url !== input.baseUrl) fail('policy_ready_changed')
  const writes = new Map<string, { sequence: number; detail: z.output<typeof writeIntentSchema>; settled: boolean; reply: boolean }>()
  const rawMessages: { sequence: number; message: StrictPiQuestionMessage; cid?: string }[] = []
  const projections: { sequence: number; value: z.output<typeof projectionSchema> }[] = []
  let stopSequence: number | undefined, endedSequence = 0, settledSequence = 0, idleSequence = 0
  for (const row of input.traceRows) {
    if (row.event === 'write_intent') {
      const detail = checked(writeIntentSchema, row.detail)
      if (writes.has(detail.id) || detail.frame.id !== detail.id || detail.frame.type !== detail.command) fail('write_identity_changed')
      writes.set(detail.id, { sequence: row.sequence, detail, settled: false, reply: false })
    } else if (row.event === 'write_settled') {
      const detail = checked(writeSettledSchema, row.detail), original = writes.get(detail.id)
      if (!original || original.settled || detail.command !== original.detail.command || detail.cid !== original.detail.cid || !detail.writeAttempted || !detail.cleanupCompleted || detail.outcome !== 'resolved') fail('write_unsettled')
      original.settled = true
    } else if (row.event === 'stop_intent') {
      checked(z.strictObject({ turn_id: z.string().nullable(), cid: z.string().nullable() }), row.detail)
      if (stopSequence !== undefined) fail('stop_repeated')
      stopSequence = row.sequence
    } else if (row.event === 'native_record') {
      const detail = checked(recordSchema, row.detail), frame = detail.frame
      if (!isDeepStrictEqual(parseStrictPiJson(detail.raw_line), frame)) fail('raw_line_changed')
      if (frame.type === 'response') {
        const original = writes.get(frame.id)
        if (!detail.response || detail.response.id !== frame.id || detail.response.command !== frame.command || !original || original.reply || original.detail.command !== frame.command || original.sequence >= row.sequence) fail('reply_binding_changed')
        original.reply = true
        if (frame.command === 'get_state' && !frame.data.isStreaming && !frame.data.isCompacting && frame.data.pendingMessageCount === 0) idleSequence = row.sequence
      } else if (frame.type === 'message_end') {
        assertMessage(frame.message)
        if (frame.message.role === 'assistant' && frame.message.stopReason === 'aborted' && (stopSequence === undefined || stopSequence >= row.sequence)) fail('abort_without_stop')
        rawMessages.push({ sequence: row.sequence, message: frame.message, ...(detail.cid ? { cid: detail.cid } : {}) })
      } else if (frame.type === 'agent_end') endedSequence = row.sequence
      else if (frame.type === 'agent_settled') settledSequence = row.sequence
    } else if (row.event === 'projection_published') {
      const value = checked(projectionSchema, row.detail)
      if (value.sourceSequence >= row.sequence || value.acquisitionGeneration !== ready.acquisition_generation || value.report.journalEpoch !== input.journal.epoch) fail('projection_source_changed')
      for (const step of value.report.steps) if (step.kind === 'item' && step.written && !step.itemId || step.kind === 'item' && !step.written && step.itemId !== null) fail('projection_identity_changed')
      projections.push({ sequence: row.sequence, value })
    } else if (row.event === 'failure') {
      checked(z.strictObject({ stage: z.enum(['source', 'approval', 'settings', 'write', 'protocol', 'stdout', 'custody', 'persistence']),
        code: z.enum(['source_changed', 'approval_changed', 'settings_unverifiable', 'write_unsettled', 'protocol_unverifiable', 'stdout_incomplete', 'custody_unverifiable', 'trace_unavailable']), writeAttempted: z.boolean().optional() }), row.detail)
      fail('source_failed')
    } else if (!['custody', 'custody_closed', 'policy_ready'].includes(row.event)) fail('unknown_trace_event')
  }
  if ([...writes.values()].some(write => !write.settled || !write.reply)) fail('outstanding_native_command')
  const nativeMessages = entries.filter(entry => entry.type === 'message')
  if (nativeMessages.length !== rawMessages.length || nativeMessages.some((entry, index) => !isDeepStrictEqual(entry.message, rawMessages[index]!.message))) fail('raw_native_message_join_missing')
  if ([...input.journal.submissions.values()].some(value => value.dispatchState === 'pending' || value.dispatchState === 'unknown')) fail('journal_input_unknown')
  const users = rawMessages.filter(row => row.message.role === 'user')
  const orderedBindings = input.bindings.map(binding => {
    const submission = input.journal.submissions.get(binding.operation_id)
    if (!submission || submission.dispatchState !== 'accepted' || !Number.isSafeInteger(submission.submittedSequence) || !submission.submittedSequence || submission.submittedSequence < 0) fail('accepted_input_missing')
    return { binding, sequence: submission.submittedSequence }
  }).sort((a, b) => a.sequence - b.sequence)
  if (new Set(orderedBindings.map(row => row.binding.operation_id)).size !== orderedBindings.length || orderedBindings.some((row, index) => index > 0 && row.sequence <= orderedBindings[index - 1]!.sequence)) fail('latest_input_ambiguous')
  const joined: { cid: string; sequence: number; sourceSequence: number; turnItemId: string; entry: Extract<z.output<typeof strictPiProjectNativeEntrySchema> | z.output<typeof strictPiMorphNativeEntrySchema>, { type: 'message' }> }[] = []
  for (const { binding } of orderedBindings) {
    if (binding.agent !== 'pi' || binding.runtime_fence !== input.fence) fail('input_binding_changed')
    const { from: _sender, ...body } = checked(bodySchema, binding.body)
    if (body.role !== 'user' || body.blocks.some(block => block.type !== 'text')) fail('input_body_unreviewed')
    const prompt = await preparePiRpcPrompt(body)
    const submission = input.journal.submissions.get(binding.operation_id), receipt = input.journal.receipts.get(binding.operation_id)
    if (!submission || submission.clientMessageId !== binding.operation_id || submission.fence !== input.fence || submission.dispatchState !== 'accepted' || submission.payloadFingerprint !== agentSessionSendBodyFingerprint(binding.session_id, body) || !submission.submittedSequence || !submission.providerItemId || !receipt || receipt.providerItemId !== submission.providerItemId || receipt.clientMessageId !== binding.operation_id || receipt.cursor.epoch !== input.journal.epoch) fail('accepted_input_missing')
    const userItem = input.journal.items.get(input.journal.aliases.get(submission.providerItemId) ?? submission.providerItemId)
    if (!userItem || !isRootAgentJournalItem(userItem) || userItem.body.kind !== 'message' || userItem.body.role !== 'user' || !isDeepStrictEqual(userItem.body.blocks, body.blocks) || input.journal.itemFences.get(userItem.itemId) !== input.fence) fail('accepted_user_journal_missing')
    const inputTurn = readPiJournalInputTurn(input.journal, userItem, binding.session_id, input.fence)
    const original = writes.get(binding.operation_id)
    const echoes = users.filter(row => row.cid === binding.operation_id)
    if (!original || original.detail.command !== 'prompt' || original.detail.cid !== binding.operation_id || !isDeepStrictEqual(original.detail.binding, binding) || !original.detail.native_baseline || original.detail.frame.type !== 'prompt' || original.detail.frame.message !== prompt.message || !isDeepStrictEqual(original.detail.frame.images ?? [], prompt.images) || echoes.length !== 1 || !isDeepStrictEqual(echoes[0]!.message.content, [{ type: 'text', text: prompt.message }])) fail('original_request_echo_join_missing')
    const echo = echoes[0]!, nativeIndex = rawMessages.indexOf(echo), entry = nativeMessages[nativeIndex]!
    const baseline = original.detail.native_baseline
    if ('absent' in baseline && joined.length) fail('native_prefix_missing')
    if ('source' in baseline) {
      if (!samePath(baseline.source.path, input.path) || baseline.source.version.split(':').slice(0, 3).join(':') !== snapshot.source.version.split(':').slice(0, 3).join(':') || baseline.bytes >= snapshot.bytes.length || hash(snapshot.bytes.subarray(0, baseline.bytes)) !== baseline.sha256) fail('native_prefix_changed')
      const prefix: unknown[] = []
      const prefixFramer = createIncrementalNdjsonFramer(value => prefix.push(value), () => fail('native_prefix_invalid'), { maxLineBytes: 8 * 1024 * 1024 })
      prefixFramer.feed(new TextDecoder('utf-8', { fatal: true }).decode(snapshot.bytes.subarray(0, baseline.bytes)))
      if (prefixFramer.takeTail() || prefix.some(value => { const parsed = entrySchema.safeParse(value); return parsed.success && parsed.data.id === entry.id })) fail('native_input_before_submit')
    }
    const acceptance = projections.filter(row => row.value.sourceSequence === echo.sequence && row.value.eventType === 'input.accepted' && row.value.clientMessageId === binding.operation_id)
    // opener-only事件可没有真实journal step，也就没有onPublished回调；真实accepted回执仍是前置。
    if (acceptance.length > 1 || acceptance.some(row => row.value.report.published !== row.value.report.steps.some(step => step.written))) fail('accepted_projection_changed')
    joined.push({ cid: binding.operation_id, sequence: submission.submittedSequence, sourceSequence: echo.sequence, turnItemId: inputTurn.itemId, entry })
  }
  if ([...input.journal.submissions.values()].some(value => value.dispatchState === 'accepted' && !input.bindings.some(binding => binding.operation_id === value.clientMessageId))) fail('unbound_accepted_journal_input')
  if (!joined.length || joined.length !== users.length || new Set(joined.map(row => row.cid)).size !== users.length || joined.some((row, index) => index > 0 && (row.sequence <= joined[index - 1]!.sequence || row.sourceSequence <= joined[index - 1]!.sourceSequence))) fail('latest_input_ambiguous')
  const latest = joined.at(-1)!, finalMessage = rawMessages.at(-1), finalEntry = nativeMessages.at(-1)
  let complete = finalMessage?.message.role === 'assistant' && finalMessage.message.stopReason === 'stop' && finalMessage.sequence > latest.sourceSequence && endedSequence > finalMessage.sequence && settledSequence > endedSequence && idleSequence > settledSequence
  let final: { entry_id: string; text: string } | null = null
  if (complete && finalMessage?.message.role === 'assistant' && finalEntry) {
    const text = finalMessage.message.content.filter(block => block.type === 'text').map(block => block.text).join('')
    const closes = projections.filter(row => row.value.sourceSequence === finalMessage.sequence && row.value.eventType === 'text.close' && row.value.providerItem)
    if (!text || !closes.length) complete = false
    for (const close of closes) {
      const histories = projections.filter(row => row.sequence <= close.sequence && row.value.providerItem === close.value.providerItem)
      const itemIds = new Set(histories.flatMap(row => row.value.report.steps.flatMap(step => step.kind === 'item' && step.written && step.itemId ? [step.itemId] : [])).filter(itemId => {
        const actual = parseAgentJournalItemKey(itemId)
        return actual?.provider === 'legacy' && actual.agent === 'pi' && actual.sessionId === input.bindings[0]!.session_id && spelledProviderTimelineItemKey(actual.recordId) === providerTimelineKeyPart(close.value.providerItem!)
      }))
      if (!itemIds.size) fail('final_projection_missing')
      const expected = readPiFinalBlock(finalMessage.message.content, close.value.providerItem!)
      const block = finalMessage.message.content[expected.index]!
      const expectedText = block.type === 'text' ? block.text : block.type === 'thinking' ? block.thinking : fail('final_journal_text_changed')
      for (const itemId of itemIds) {
        const item = input.journal.items.get(input.journal.aliases.get(itemId) ?? itemId)
        if (!item || !isRootAgentJournalItem(item) || item.body.kind !== 'message' || item.body.role !== expected.role || input.journal.itemFences.get(item.itemId) !== input.fence || item.turnScope?.kind !== 'turn' || item.turnScope.turnItemId !== latest.turnItemId) fail('final_journal_identity_changed')
        const actualText = item.body.blocks.flatMap(block => block.type === 'text' ? [block.text] : []).join('')
        if (actualText !== expectedText) fail('final_journal_text_changed')
        const turn = input.journal.items.get(item.turnScope.turnItemId)
        if (!turn || turn.body.kind !== 'turn' || turn.body.state !== 'completed' || turn.body.outcome !== 'success') complete = false
      }
    }
    if (complete) final = { entry_id: finalEntry.id, text }
  }
  if (!complete && !input.stopped) fail('final_output_incomplete')
  const value = { format: 'pi-session-jsonl' as const, availability: complete ? 'complete' : 'incomplete', reason: complete ? null : 'no_complete_final_assistant_message', persistence: 'observed',
    path: input.path, native_id: header.id, source_version: snapshot.source.version, content, record_count: rows.length, final,
    usage: { known: nativeMessages.some(entry => entry.message.role === 'assistant'), value: nativeMessages.flatMap(entry => entry.message.role === 'assistant' ? [{ entry_id: entry.id, usage: entry.message.usage }] : []), source: 'actual_native_pi_usage', billed_cost: { known: false, value: null, reason: 'native_usage_does_not_prove_billed_amount' } } }
  const serialized = JSON.stringify(value)
  if (Buffer.byteLength(serialized) > cap) fail('aggregate_exceeds_bound')
  input.validateExport(serialized)
  const finalVerify = () => {
    requireNativeCodexPrivatePath(input.privateRoot, true)
    const current = readNativePiFile(input.path, cap, true)
    if (!isDeepStrictEqual(current.source, snapshot.source) || !current.bytes.equals(snapshot.bytes)) fail('changed_during_collection')
  }
  finalVerify()
  return { value, verify: async () => { finalVerify() }, finalVerify, validateExport: input.validateExport }
}
