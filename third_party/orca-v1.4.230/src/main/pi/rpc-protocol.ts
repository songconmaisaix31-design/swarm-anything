import { z } from 'zod'
import { parseTree, type Node as JsonNode, type ParseError } from 'jsonc-parser'
import { isDeepStrictEqual } from 'node:util'

export function parseStrictPiJson(line: string): unknown {
  const errors: ParseError[] = []
  const root = parseTree(line, errors, { allowTrailingComma: false, disallowComments: true, allowEmptyContent: false })
  if (!root || errors.length) throw new Error('native_pi_invalid_json')
  function unique(node: JsonNode) {
    if (node.type === 'object') {
      const keys = new Set<string>()
      for (const property of node.children ?? []) { const key = property.children?.[0]?.value; if (typeof key !== 'string' || keys.has(key)) throw new Error('native_pi_duplicate_json_key'); keys.add(key) }
    }
    for (const child of node.children ?? []) unique(child)
  }
  unique(root)
  // 库的getNodeValue返回null-prototype对象；原生JSON与现有语义比较使用普通JSON对象。
  try { return JSON.parse(line) as unknown } catch { throw new Error('native_pi_invalid_json') }
}

export const piRpcModelSchema = z.looseObject({
  id: z.string(),
  provider: z.string(),
  name: z.string().optional(),
  contextWindow: z.number().nonnegative().optional(),
  reasoning: z.boolean().optional(),
  input: z.array(z.string()).optional()
})
export type PiRpcModel = z.infer<typeof piRpcModelSchema>

export const piRpcStateSchema = z.looseObject({
  model: piRpcModelSchema.nullish(),
  thinkingLevel: z.string().optional(),
  sessionFile: z.string().min(1),
  sessionId: z.string().optional(),
  isStreaming: z.boolean(),
  isCompacting: z.boolean(),
  autoCompactionEnabled: z.boolean().optional(),
  pendingMessageCount: z.number().int().nonnegative().optional()
})
export type PiRpcState = z.infer<typeof piRpcStateSchema>

export function piRpcIdle(state: PiRpcState): boolean {
  return !state.isStreaming && !state.isCompacting && (state.pendingMessageCount ?? 0) === 0
}

export const piRpcContentSchema = z.looseObject({
  type: z.string(),
  text: z.string().optional(),
  thinking: z.string().optional()
})
export const piRpcUsageSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative()
})
export const piRpcMessageSchema = z.looseObject({
  role: z.string(),
  content: z.union([z.string(), z.array(piRpcContentSchema)]),
  stopReason: z.string().optional(),
  errorMessage: z.string().optional(),
  usage: piRpcUsageSchema.optional(),
  timestamp: z.number().optional()
})
export const piRpcMessageEventSchema = z.object({
  type: z.enum(['message_start', 'message_update', 'message_end']),
  message: piRpcMessageSchema.optional(),
  usage: piRpcUsageSchema.optional(),
  assistantMessageEvent: z
    .looseObject({
      type: z.string(),
      delta: z.string().optional(),
      contentIndex: z.number().int().nonnegative().optional(),
      partial: piRpcMessageSchema.optional()
    })
    .optional()
})
export type PiRpcMessageEvent = z.infer<typeof piRpcMessageEventSchema>

export const piRpcToolEventSchema = z.object({
  type: z.enum(['tool_execution_start', 'tool_execution_update', 'tool_execution_end']),
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.unknown().optional(),
  partialResult: z.unknown().optional(),
  result: z.unknown().optional(),
  isError: z.boolean().optional()
})
export type PiRpcToolEvent = z.infer<typeof piRpcToolEventSchema>

export const piRpcPromptReplySchema = z.object({
  type: z.literal('response'),
  command: z.literal('prompt'),
  success: z.boolean(),
  error: z.string().optional(),
  data: z
    .object({
      disposition: z.enum(['started', 'queued', 'handled']).optional(),
      agentInvoked: z.boolean().optional()
    })
    .optional()
})

export const piRpcDialogSchema = z.discriminatedUnion('method', [
  z.object({
    id: z.union([z.string(), z.number()]),
    method: z.literal('confirm'),
    title: z.string(),
    message: z.string().optional()
  }),
  z.object({
    id: z.union([z.string(), z.number()]),
    method: z.literal('select'),
    title: z.string(),
    message: z.string().optional(),
    options: z.array(z.string()).min(1).max(64)
  }),
  z.object({
    id: z.union([z.string(), z.number()]),
    method: z.enum(['input', 'editor']),
    title: z.string(),
    message: z.string().optional(),
    placeholder: z.string().optional(),
    prefill: z.string().optional()
  })
])
export type PiRpcDialog = z.infer<typeof piRpcDialogSchema>

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const amount = z.number().nonnegative().finite()
export const strictPiThinkingLevelSchema = z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
const rates = { input: amount, output: amount, cacheRead: amount, cacheWrite: amount }
const compatBooleanFields = ['supportsStore', 'supportsDeveloperRole', 'supportsReasoningEffort', 'supportsUsageInStreaming', 'supportsFinishReason', 'requiresToolResultName', 'requiresAssistantAfterToolResult', 'requiresThinkingAsText', 'requiresReasoningContentOnAssistantMessages', 'supportsOpenAIGrammarTools', 'supportsStrictMode', 'sendSessionAffinityHeaders', 'supportsLongCacheRetention', 'supportsMaxOutputTokens'] as const
const strictCompat = z.strictObject({
  ...Object.fromEntries(compatBooleanFields.map(key => [key, z.boolean().optional()])),
  maxTokensField: z.enum(['max_completion_tokens', 'max_tokens']).optional(),
  thinkingFormat: z.enum(['openai', 'openrouter', 'deepseek', 'together', 'baseten', 'zai', 'qwen', 'chat-template', 'qwen-chat-template', 'string-thinking', 'ant-ling']).optional(),
  chatTemplateKwargs: z.strictObject({}).optional(), chatTemplateArgs: z.strictObject({}).optional(),
  cacheControlFormat: z.literal('anthropic').optional(), sessionAffinityFormat: z.enum(['headers', 'safety_identifier']).optional(),
  vllmPriority: z.number().finite().optional(), allowedFallbackModels: z.tuple([]).optional(),
  openRouterRouting: z.strictObject({}).optional(), vercelGatewayRouting: z.strictObject({}).optional()
})
export const strictPiModelSchema = z.strictObject({
  id: z.string().min(1), name: z.string(), api: z.string().min(1), provider: z.string().min(1), baseUrl: z.string().url(),
  input: z.array(z.enum(['text', 'image'])), type: z.literal('chat').optional(), reasoning: z.boolean(),
  inputLimits: z.strictObject({ maxRequestBytes: amount.optional(), images: z.strictObject({
    resize: z.strictObject({ maxWidth: amount.optional(), maxHeight: amount.optional(), maxBytes: amount.optional(), jpegQuality: amount.optional() }).optional(),
    maxPerMessage: amount.optional(), maxPerRequest: amount.optional()
  }).optional() }).optional(),
  cost: z.strictObject({ ...rates, tiers: z.array(z.strictObject({ ...rates, inputTokensAbove: amount })).optional() }),
  headers: z.record(z.string(), z.string()).optional(),
  thinkingLevelMap: z.strictObject(Object.fromEntries(strictPiThinkingLevelSchema.options.map(key => [key, z.string().nullable().optional()]))).optional(),
  promptCache: z.strictObject({ short: amount.optional(), long: amount.optional() }).optional(),
  contextWindow: amount, maxTokens: amount, samplingParams: z.strictObject({}).optional(), compat: strictCompat.optional()
})
export type StrictPiModel = z.infer<typeof strictPiModelSchema>
export const strictPiUsageSchema = z.strictObject({ ...rates, totalTokens: amount, cost: z.strictObject({ ...rates, total: amount }), cacheWrite1h: amount.optional(), reasoning: amount.optional() })
const strictText = z.strictObject({ type: z.literal('text'), text: z.string(), textSignature: z.string().optional() })
const strictThinking = z.strictObject({ type: z.literal('thinking'), thinking: z.string(), thinkingSignature: z.string().optional(), redacted: z.boolean().optional() })
const strictUser = z.strictObject({ role: z.literal('user'), content: z.union([z.string(), z.array(strictText)]), timestamp: amount })
const strictSystem = z.strictObject({ role: z.literal('system'), content: z.union([z.string(), z.array(strictText)]), timestamp: amount,
  sections: z.record(z.string(), z.string().nullable()).optional(), toolsAdded: z.tuple([]).optional(), toolsRemoved: z.tuple([]).optional() })
const strictAssistant = z.strictObject({
  role: z.literal('assistant'), content: z.array(z.union([strictText, strictThinking])), api: z.string(), provider: z.string(), model: z.string(),
  usage: strictPiUsageSchema, stopReason: z.enum(['pending', 'stop', 'length', 'aborted', 'error']), timestamp: amount,
  responseModel: z.string().optional(), responseId: z.string().optional(), providerThinkingLevel: z.string().optional(),
  thinkingLevel: strictPiThinkingLevelSchema.optional(), rawStopReason: z.enum(['stop', 'end', 'length']).optional(), endTurn: z.boolean().optional(),
  diagnostics: z.tuple([]).optional(), errorMessage: z.string().optional()
}).superRefine((message, ctx) => {
  if (message.stopReason === 'aborted'
    ? message.errorMessage !== 'Request aborted' && message.errorMessage !== 'Request was aborted'
    : message.stopReason !== 'error' && message.errorMessage !== undefined) ctx.addIssue({ code: 'custom', message: 'native_pi_error_unreviewed' })
})
export const strictPiMessageSchema = z.union([strictUser, strictSystem, strictAssistant])
export type StrictPiMessage = z.infer<typeof strictPiMessageSchema>
const entryCommon = { id: z.string().regex(/^(?:[a-f0-9]{8}|[a-f0-9]{8}-[a-f0-9-]{27})$/), parentId: z.string().nullable(), timestamp: z.iso.datetime() }
export const strictPiNativeHeaderSchema = z.strictObject({ type: z.literal('session'), version: z.literal(3), id: z.uuidv7(), timestamp: z.iso.datetime(), cwd: z.string().min(1) })
export const strictPiNativeEntrySchema = z.discriminatedUnion('type', [
  z.strictObject({ ...entryCommon, type: z.literal('message'), message: strictPiMessageSchema }),
  z.strictObject({ ...entryCommon, type: z.literal('thinking_level_change'), thinkingLevel: strictPiThinkingLevelSchema }),
  z.strictObject({ ...entryCommon, type: z.literal('model_change'), provider: z.string(), modelId: z.string() }),
  z.strictObject({ ...entryCommon, type: z.literal('session_info'), name: z.string().optional() }),
  z.strictObject({ ...entryCommon, type: z.literal('label'), targetId: z.string(), label: z.string().optional() })
])
export type StrictPiNativeEntry = z.infer<typeof strictPiNativeEntrySchema>
export const strictPiStateSchema = z.strictObject({
  model: strictPiModelSchema.optional(), thinkingLevel: strictPiThinkingLevelSchema, isStreaming: z.boolean(), isCompacting: z.boolean(),
  steeringMode: z.enum(['all', 'one-at-a-time']), followUpMode: z.enum(['all', 'one-at-a-time']), sessionFile: z.string().optional(),
  sessionId: z.uuidv7(), sessionName: z.string().optional(), autoCompactionEnabled: z.boolean(), messageCount: count, pendingMessageCount: count
})
const strictDelta = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('text_start'), contentIndex: count }), z.strictObject({ type: z.literal('thinking_start'), contentIndex: count }),
  z.strictObject({ type: z.literal('text_delta'), contentIndex: count, delta: z.string() }), z.strictObject({ type: z.literal('thinking_delta'), contentIndex: count, delta: z.string() }),
  z.strictObject({ type: z.literal('text_end'), contentIndex: count, content: z.string() }), z.strictObject({ type: z.literal('thinking_end'), contentIndex: count, content: z.string() })
])
const strictStats = z.strictObject({ sessionId: z.uuidv7(), sessionFile: z.string().optional(), userMessages: count, assistantMessages: count,
  toolCalls: z.literal(0), toolResults: z.literal(0), totalMessages: count,
  tokens: z.strictObject({ input: amount, output: amount, cacheRead: amount, cacheWrite: amount, total: amount }), cost: amount,
  contextUsage: z.strictObject({ tokens: amount.nullable(), contextWindow: amount, percent: amount.nullable() }).optional() })
const response = <const C extends string, T extends z.ZodType>(command: C, data: T) => z.strictObject({ id: z.string().min(1), type: z.literal('response'), command: z.literal(command), success: z.literal(true), data })
const noDataResponse = <const C extends string>(command: C) => z.strictObject({ id: z.string().min(1), type: z.literal('response'), command: z.literal(command), success: z.literal(true) })
export const strictPiRawSchema = z.union([
  ...(['agent_start', 'turn_start', 'agent_settled'] as const).map(type => z.strictObject({ type: z.literal(type) })),
  z.strictObject({ type: z.literal('queue_update'), steering: z.array(z.string()), followUp: z.array(z.string()) }),
  z.strictObject({ type: z.literal('message_start'), message: strictPiMessageSchema }), z.strictObject({ type: z.literal('message_end'), message: strictPiMessageSchema }),
  z.strictObject({ type: z.literal('message_update'), usage: strictPiUsageSchema, assistantMessageEvent: strictDelta }),
  z.strictObject({ type: z.literal('turn_end'), message: strictPiMessageSchema, toolResults: z.tuple([]) }),
  z.strictObject({ type: z.literal('agent_end'), messages: z.array(strictPiMessageSchema), willRetry: z.literal(false) }),
  z.strictObject({ type: z.literal('thinking_level_changed'), level: strictPiThinkingLevelSchema }),
  z.strictObject({ type: z.literal('session_info_changed'), name: z.string().optional() }),
  z.strictObject({ type: z.literal('entry_appended'), entry: strictPiNativeEntrySchema }),
  response('prompt', z.strictObject({ disposition: z.enum(['started', 'queued']) })),
  ...(['abort', 'set_auto_compaction', 'set_auto_retry', 'set_thinking_level'] as const).map(noDataResponse),
  response('get_state', strictPiStateSchema), response('set_model', strictPiModelSchema),
  response('get_available_models', z.strictObject({ models: z.array(strictPiModelSchema) })),
  response('get_available_thinking_levels', z.strictObject({ levels: z.array(strictPiThinkingLevelSchema) })),
  response('get_last_assistant_text', z.strictObject({ text: z.string().nullable() })), response('get_session_stats', strictStats)
])
export type StrictPiRaw = z.infer<typeof strictPiRawSchema>

// 问答模式独立校验；原 disabled DTO 继续拒绝全部工具。
export const piQuestionDescription = 'Ask the owner of this Run a necessary clarification, or resume one existing question by its exact question ID. The original answer returns to this tool. On timeout keep the question ID; never create a second question to retry it.'
export const piQuestionParameters = { anyOf: [
  { type: 'object', properties: { question: { type: 'string', minLength: 1, maxLength: 32000 } }, required: ['question'], additionalProperties: false },
  { type: 'object', properties: { resume: { type: 'string', minLength: 1, maxLength: 512 } }, required: ['resume'], additionalProperties: false }
] }
export const strictPiQuestionParamsSchema = z.union([
  z.strictObject({ question: z.string().refine(value => value.trim().length > 0 && Buffer.byteLength(value, 'utf8') <= 32000 && Buffer.from(value, 'utf8').toString('utf8') === value) }),
  z.strictObject({ resume: z.string().min(1).max(512) })
])
const questionOrigin = z.strictObject({ nativeSessionId: z.uuidv7(), assistantEntryId: z.string().min(1).max(64), toolCallId: z.string().min(1).max(512) })
export const strictPiQuestionResultSchema = z.strictObject({
  schema: z.literal('swa.native-question.v1'), request_id: z.uuid(),
  state: z.enum(['accepted', 'answered', 'waiting', 'rejected', 'unknown', 'interrupted']).optional(),
  project_id: z.string().optional(), controller: z.string().optional(), run_id: z.string().optional(), root_task_id: z.string().optional(), dispatch_id: z.string().optional(), session_id: z.string().optional(),
  start_request_id: z.uuid().optional(), create_request_id: z.uuid().optional(), wait_request_id: z.uuid().optional(), question_id: z.string().optional(), origin: questionOrigin.optional(), params: strictPiQuestionParamsSchema.optional(),
  accepted: z.boolean().optional(), answer: z.string().nullable().optional(), answerMessageId: z.string().optional(), messageId: z.string().optional(), threadId: z.string().optional(),
  timedOut: z.boolean().optional(), cancelled: z.boolean().optional(), connectionLost: z.boolean().optional(), timeoutMs: count.optional(), effects_applied: z.literal(false).optional(),
  reason: z.string().optional(), required_action: z.string().optional(), error: z.strictObject({ code: z.string(), message: z.string() }).optional()
})
const questionResult = z.strictObject({ content: z.array(strictText), details: strictPiQuestionResultSchema })
const questionErrorResult = z.strictObject({ content: z.array(strictText), details: z.strictObject({}) })
const questionToolCall = z.strictObject({ type: z.literal('toolCall'), id: z.string().min(1).max(512), name: z.literal('swa_ask'), arguments: strictPiQuestionParamsSchema, thoughtSignature: z.string().optional() })
const questionAssistant = z.strictObject({ ...strictAssistant.shape, content: z.array(z.union([strictText, strictThinking, questionToolCall])), stopReason: z.enum(['pending', 'stop', 'toolUse', 'length', 'aborted', 'error']), rawStopReason: z.enum(['stop', 'end', 'length', 'function_call', 'tool_calls']).optional() }).superRefine((message, ctx) => {
  if (message.stopReason === 'aborted' ? message.errorMessage !== 'Request aborted' && message.errorMessage !== 'Request was aborted' : message.stopReason !== 'error' && message.errorMessage !== undefined) ctx.addIssue({ code: 'custom', message: 'native_pi_error_unreviewed' })
})
const questionSystem = strictSystem.extend({ toolsAdded: z.array(z.strictObject({ name: z.literal('swa_ask'), description: z.literal(piQuestionDescription), parameters: z.unknown().refine(value => isDeepStrictEqual(value, piQuestionParameters)) })).max(1).optional() })
const questionToolResult = z.discriminatedUnion('isError', [
  z.strictObject({ role: z.literal('toolResult'), toolCallId: z.string().min(1), toolName: z.literal('swa_ask'), ...questionResult.shape, isError: z.literal(false), timestamp: amount }),
  z.strictObject({ role: z.literal('toolResult'), toolCallId: z.string().min(1), toolName: z.literal('swa_ask'), ...questionErrorResult.shape, isError: z.literal(true), timestamp: amount })
])
export const strictPiQuestionMessageSchema = z.union([strictUser, questionSystem, questionAssistant, questionToolResult])
export type StrictPiQuestionMessage = z.infer<typeof strictPiQuestionMessageSchema>
export const strictPiQuestionNativeEntrySchema = z.discriminatedUnion('type', [
  z.strictObject({ ...entryCommon, type: z.literal('message'), message: strictPiQuestionMessageSchema }),
  ...strictPiNativeEntrySchema.options.filter(option => option.shape.type.value !== 'message')
])
const questionDelta = z.union([strictDelta,
  z.strictObject({ type: z.literal('toolcall_start'), contentIndex: count, id: z.string(), toolName: z.enum(['', 'swa_ask']) }),
  z.strictObject({ type: z.literal('toolcall_delta'), contentIndex: count, delta: z.string() }),
  z.strictObject({ type: z.literal('toolcall_end'), contentIndex: count, toolCall: questionToolCall })
])
export const strictPiQuestionRawSchema = z.union([
  ...(['agent_start', 'turn_start', 'agent_settled'] as const).map(type => z.strictObject({ type: z.literal(type) })),
  z.strictObject({ type: z.literal('queue_update'), steering: z.array(z.string()), followUp: z.array(z.string()) }),
  z.strictObject({ type: z.literal('message_start'), message: strictPiQuestionMessageSchema }), z.strictObject({ type: z.literal('message_end'), message: strictPiQuestionMessageSchema }),
  z.strictObject({ type: z.literal('message_update'), usage: strictPiUsageSchema, assistantMessageEvent: questionDelta }),
  z.strictObject({ type: z.literal('turn_end'), message: strictPiQuestionMessageSchema, toolResults: z.array(questionToolResult) }),
  z.strictObject({ type: z.literal('agent_end'), messages: z.array(strictPiQuestionMessageSchema), willRetry: z.literal(false) }),
  z.strictObject({ type: z.literal('tool_execution_start'), toolCallId: z.string().min(1).max(512), toolName: z.literal('swa_ask'), args: strictPiQuestionParamsSchema }),
  z.discriminatedUnion('isError', [
    z.strictObject({ type: z.literal('tool_execution_end'), toolCallId: z.string().min(1).max(512), toolName: z.literal('swa_ask'), result: questionResult, isError: z.literal(false) }),
    z.strictObject({ type: z.literal('tool_execution_end'), toolCallId: z.string().min(1).max(512), toolName: z.literal('swa_ask'), result: questionErrorResult, isError: z.literal(true) })
  ]),
  z.strictObject({ type: z.literal('thinking_level_changed'), level: strictPiThinkingLevelSchema }),
  z.strictObject({ type: z.literal('session_info_changed'), name: z.string().optional() }),
  z.strictObject({ type: z.literal('entry_appended'), entry: strictPiQuestionNativeEntrySchema }),
  response('prompt', z.strictObject({ disposition: z.enum(['started', 'queued']) })),
  ...(['abort', 'set_auto_compaction', 'set_auto_retry', 'set_thinking_level'] as const).map(noDataResponse),
  response('get_state', strictPiStateSchema), response('set_model', strictPiModelSchema),
  response('get_available_models', z.strictObject({ models: z.array(strictPiModelSchema) })),
  response('get_available_thinking_levels', z.strictObject({ levels: z.array(strictPiThinkingLevelSchema) })),
  response('get_last_assistant_text', z.strictObject({ text: z.string().nullable() })), response('get_session_stats', strictStats.extend({ toolCalls: count, toolResults: count }))
])

export const piDelegationDescription = 'Delegate work to one approved project role at its exact revision. This returns the child task identity after startup. Finish your current turn while waiting; its result will arrive as a continuation. Never repeat a delegation after an unknown result; inspect the original request ID instead.'
export const piDelegationParameters = { type: 'object', properties: { role_id: { type: 'string', minLength: 1, maxLength: 200 }, revision: { type: 'integer', minimum: 1 }, input: { type: 'string', minLength: 1, maxLength: 32000 }, completion_criteria: { type: 'array', minItems: 1, maxItems: 32, items: { type: 'string', minLength: 1, maxLength: 2048 } }, mode: { type: 'string', enum: ['work', 'consult'] } }, required: ['role_id', 'revision', 'input', 'completion_criteria', 'mode'], additionalProperties: false }
export const strictPiDelegationParamsSchema = z.strictObject({ role_id: z.string().trim().min(1).max(200), revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), input: z.string().refine(value => value.trim().length > 0 && Buffer.byteLength(value, 'utf8') <= 32000 && Buffer.from(value, 'utf8').toString('utf8') === value), completion_criteria: z.array(z.string().trim().min(1).max(2048)).min(1).max(32), mode: z.enum(['work', 'consult']) })
export const strictPiDelegationResultSchema = z.strictObject({ schema: z.literal('swa.native-delegation.v1'), request_id: z.uuid(), worker_request_id: z.uuid(), state: z.enum(['ready', 'failed', 'rejected', 'unknown']), task_id: z.string().optional(), dispatch_id: z.string().optional(), required_action: z.string().optional(), error: z.strictObject({ code: z.string(), message: z.string() }).optional() })
const delegationToolCall = z.strictObject({ type: z.literal('toolCall'), id: z.string().min(1).max(512), name: z.literal('swa_delegate'), arguments: strictPiDelegationParamsSchema, thoughtSignature: z.string().optional() })
const delegationResult = z.strictObject({ content: z.array(strictText), details: strictPiDelegationResultSchema })
const collaborationToolCall = z.union([questionToolCall, delegationToolCall])
const collaborationToolResult = z.union([questionToolResult,
  z.strictObject({ role: z.literal('toolResult'), toolCallId: z.string().min(1), toolName: z.literal('swa_delegate'), ...delegationResult.shape, isError: z.literal(false), timestamp: amount }),
  z.strictObject({ role: z.literal('toolResult'), toolCallId: z.string().min(1), toolName: z.literal('swa_delegate'), ...questionErrorResult.shape, isError: z.literal(true), timestamp: amount })
])
const collaborationAssistant = z.strictObject({ ...strictAssistant.shape, content: z.array(z.union([strictText, strictThinking, collaborationToolCall])), stopReason: z.enum(['pending', 'stop', 'toolUse', 'length', 'aborted', 'error']), rawStopReason: z.enum(['stop', 'end', 'length', 'function_call', 'tool_calls']).optional() }).superRefine((message, ctx) => {
  if (message.stopReason === 'aborted' ? message.errorMessage !== 'Request aborted' && message.errorMessage !== 'Request was aborted' : message.stopReason !== 'error' && message.errorMessage !== undefined) ctx.addIssue({ code: 'custom', message: 'native_pi_error_unreviewed' })
})
const collaborationSystem = strictSystem.extend({ toolsAdded: z.array(z.union([
  z.strictObject({ name: z.literal('swa_ask'), description: z.literal(piQuestionDescription), parameters: z.unknown().refine(value => isDeepStrictEqual(value, piQuestionParameters)) }),
  z.strictObject({ name: z.literal('swa_delegate'), description: z.literal(piDelegationDescription), parameters: z.unknown().refine(value => isDeepStrictEqual(value, piDelegationParameters)) })
])).max(2).optional() })
export const strictPiCollaborationMessageSchema = z.union([strictUser, collaborationSystem, collaborationAssistant, collaborationToolResult])
export type StrictPiCollaborationMessage = z.infer<typeof strictPiCollaborationMessageSchema>
export const strictPiCollaborationNativeEntrySchema = z.discriminatedUnion('type', [
  z.strictObject({ ...entryCommon, type: z.literal('message'), message: strictPiCollaborationMessageSchema }),
  ...strictPiNativeEntrySchema.options.filter(option => option.shape.type.value !== 'message')
])
export const strictPiCollaborationRawSchema = z.union([
  ...(['agent_start', 'turn_start', 'agent_settled'] as const).map(type => z.strictObject({ type: z.literal(type) })),
  z.strictObject({ type: z.literal('queue_update'), steering: z.array(z.string()), followUp: z.array(z.string()) }),
  z.strictObject({ type: z.literal('message_start'), message: strictPiCollaborationMessageSchema }), z.strictObject({ type: z.literal('message_end'), message: strictPiCollaborationMessageSchema }),
  z.strictObject({ type: z.literal('message_update'), usage: strictPiUsageSchema, assistantMessageEvent: z.union([strictDelta, z.strictObject({ type: z.literal('toolcall_start'), contentIndex: count, id: z.string(), toolName: z.enum(['', 'swa_ask', 'swa_delegate']) }), z.strictObject({ type: z.literal('toolcall_delta'), contentIndex: count, delta: z.string() }), z.strictObject({ type: z.literal('toolcall_end'), contentIndex: count, toolCall: collaborationToolCall })]) }),
  z.strictObject({ type: z.literal('turn_end'), message: strictPiCollaborationMessageSchema, toolResults: z.array(collaborationToolResult) }),
  z.strictObject({ type: z.literal('agent_end'), messages: z.array(strictPiCollaborationMessageSchema), willRetry: z.literal(false) }),
  z.strictObject({ type: z.literal('tool_execution_start'), toolCallId: z.string().min(1).max(512), toolName: z.literal('swa_delegate'), args: strictPiDelegationParamsSchema }),
  z.strictObject({ type: z.literal('tool_execution_end'), toolCallId: z.string().min(1).max(512), toolName: z.literal('swa_delegate'), result: delegationResult, isError: z.literal(false) }),
  z.strictObject({ type: z.literal('tool_execution_end'), toolCallId: z.string().min(1).max(512), toolName: z.literal('swa_delegate'), result: questionErrorResult, isError: z.literal(true) }),
  z.strictObject({ type: z.literal('entry_appended'), entry: strictPiCollaborationNativeEntrySchema }),
  strictPiQuestionRawSchema
])

export const strictPiBashParamsSchema = z.strictObject({ command: z.string().min(1).refine(value => Buffer.byteLength(value, 'utf8') <= 128 * 1024), timeout: z.number().positive().max(2147483.647).optional() })
const bashToolCall = z.strictObject({ type: z.literal('toolCall'), id: z.string().min(1).max(512), name: z.literal('bash'), arguments: strictPiBashParamsSchema, thoughtSignature: z.string().optional() })
const bashTruncation = z.strictObject({ content: z.string(), truncated: z.boolean(), truncatedBy: z.enum(['lines', 'bytes']).nullable(), totalLines: count, totalBytes: count, outputLines: count, outputBytes: count, lastLinePartial: z.boolean(), firstLineExceedsLimit: z.boolean(), maxLines: count, maxBytes: count })
export const strictPiBashResultSchema = z.strictObject({ content: z.array(strictText), details: z.strictObject({ truncation: bashTruncation.optional(), fullOutputPath: z.string().optional() }).optional(), structuredContent: z.strictObject({ output: z.string(), truncated: z.boolean(), full_output_path: z.string().optional(), exit_code: z.number().int(), wall_time_seconds: amount }).optional(), isError: z.boolean().optional() })
const bashResult = strictPiBashResultSchema
// 官方 agent-loop 的持久消息仅保存 content/details/isError；RPC 工具完成事件保留 structuredContent。
const bashToolResult = z.strictObject({ role: z.literal('toolResult'), toolCallId: z.string().min(1), toolName: z.literal('bash'), ...bashResult.omit({ structuredContent: true }).shape, isError: z.boolean(), timestamp: amount })
const projectToolCall = z.union([collaborationToolCall, bashToolCall]), projectToolResult = z.union([collaborationToolResult, bashToolResult])
const projectAssistant = z.strictObject({ ...collaborationAssistant.shape, content: z.array(z.union([strictText, strictThinking, projectToolCall])) }).superRefine((message, ctx) => {
  if (message.stopReason === 'aborted' ? message.errorMessage !== 'Request aborted' && message.errorMessage !== 'Request was aborted' : message.stopReason !== 'error' && message.errorMessage !== undefined) ctx.addIssue({ code: 'custom', message: 'native_pi_error_unreviewed' })
})
const projectSystem = strictSystem.extend({ toolsAdded: z.array(z.union([
  z.strictObject({ name: z.literal('bash'), description: z.string().min(1), parameters: z.strictObject({ type: z.literal('object'), properties: z.strictObject({ command: z.strictObject({ type: z.literal('string'), description: z.string() }), timeout: z.strictObject({ type: z.literal('number'), description: z.string() }) }), required: z.tuple([z.literal('command')]) }) }),
  z.strictObject({ name: z.literal('swa_ask'), description: z.literal(piQuestionDescription), parameters: z.unknown().refine(value => isDeepStrictEqual(value, piQuestionParameters)) }),
  z.strictObject({ name: z.literal('swa_delegate'), description: z.literal(piDelegationDescription), parameters: z.unknown().refine(value => isDeepStrictEqual(value, piDelegationParameters)) })
])).max(3).optional() })
export const strictPiProjectMessageSchema = z.union([strictUser, projectSystem, projectAssistant, projectToolResult])
export type StrictPiProjectMessage = z.infer<typeof strictPiProjectMessageSchema>
export const strictPiProjectNativeEntrySchema = z.discriminatedUnion('type', [
  z.strictObject({ ...entryCommon, type: z.literal('message'), message: strictPiProjectMessageSchema }),
  ...strictPiNativeEntrySchema.options.filter(option => option.shape.type.value !== 'message')
])
export const strictPiProjectRawSchema = z.union([
  z.strictObject({ type: z.literal('message_start'), message: strictPiProjectMessageSchema }), z.strictObject({ type: z.literal('message_end'), message: strictPiProjectMessageSchema }),
  z.strictObject({ type: z.literal('message_update'), usage: strictPiUsageSchema, assistantMessageEvent: z.union([strictDelta, z.strictObject({ type: z.literal('toolcall_start'), contentIndex: count, id: z.string(), toolName: z.enum(['', 'bash', 'swa_ask', 'swa_delegate']) }), z.strictObject({ type: z.literal('toolcall_delta'), contentIndex: count, delta: z.string() }), z.strictObject({ type: z.literal('toolcall_end'), contentIndex: count, toolCall: projectToolCall })]) }),
  z.strictObject({ type: z.literal('turn_end'), message: strictPiProjectMessageSchema, toolResults: z.array(projectToolResult) }),
  z.strictObject({ type: z.literal('agent_end'), messages: z.array(strictPiProjectMessageSchema), willRetry: z.literal(false) }),
  z.strictObject({ type: z.literal('tool_execution_start'), toolCallId: z.string().min(1).max(512), toolName: z.literal('bash'), args: strictPiBashParamsSchema }),
  z.strictObject({ type: z.literal('tool_execution_update'), toolCallId: z.string().min(1).max(512), toolName: z.literal('bash'), args: strictPiBashParamsSchema.optional(), partialResult: bashResult }),
  z.strictObject({ type: z.literal('tool_execution_end'), toolCallId: z.string().min(1).max(512), toolName: z.literal('bash'), result: bashResult, isError: z.boolean() }),
  z.strictObject({ type: z.literal('entry_appended'), entry: strictPiProjectNativeEntrySchema }),
  strictPiCollaborationRawSchema
])

export const piMorphListDescription = 'List the tools of this Worker\'s approved Morphogenesis research host. Tool names, arguments and current permissions come from this host.'
export const piMorphCallDescription = 'Call one tool of this Worker\'s approved Morphogenesis research host. Preserve lease tokens and follow the tool contract. An unknown result must not be repeated; inspect existing evidence instead.'
export const piMorphListParameters = { type: 'object', properties: {}, additionalProperties: false }
export const piMorphCallParameters = { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 200 }, arguments: { type: 'object' } }, required: ['name', 'arguments'], additionalProperties: false }
export const strictPiMorphListParamsSchema = z.strictObject({})
export const strictPiMorphCallParamsSchema = z.strictObject({ name: z.string().min(1).max(200), arguments: z.record(z.string(), z.json()) }).refine(value => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 256 * 1024)
const morphToolName = z.enum(['morph_list_tools', 'morph_call_tool'])
export const strictPiMorphOriginSchema = z.strictObject({ native_session_id: z.uuidv7(), assistant_entry_id: z.string().min(1).max(64), tool_call_id: z.string().min(1).max(512) })
export const strictPiMorphResultSchema = z.discriminatedUnion('state', [
  z.strictObject({ schema: z.literal('swa.native-morph.v1'), operation: morphToolName, origin: strictPiMorphOriginSchema, state: z.literal('completed'), mcp_result: z.record(z.string(), z.json()) }),
  z.strictObject({ schema: z.literal('swa.native-morph.v1'), operation: morphToolName, origin: strictPiMorphOriginSchema, state: z.literal('unknown'), reason: z.literal('connection_unconfirmed'), required_action: z.literal('Inspect existing Morphogenesis evidence; do not repeat this operation') })
])
const morphResult = z.strictObject({ content: z.array(strictText), details: strictPiMorphResultSchema, isError: z.boolean().optional() })
const morphToolCall = z.discriminatedUnion('name', [
  z.strictObject({ type: z.literal('toolCall'), id: z.string().min(1).max(512), name: z.literal('morph_list_tools'), arguments: strictPiMorphListParamsSchema, thoughtSignature: z.string().optional() }),
  z.strictObject({ type: z.literal('toolCall'), id: z.string().min(1).max(512), name: z.literal('morph_call_tool'), arguments: strictPiMorphCallParamsSchema, thoughtSignature: z.string().optional() })
])
const morphToolResult = z.union([
  z.strictObject({ role: z.literal('toolResult'), toolCallId: z.string().min(1), toolName: morphToolName, ...morphResult.omit({ isError: true }).shape, isError: z.boolean(), timestamp: amount }),
  z.strictObject({ role: z.literal('toolResult'), toolCallId: z.string().min(1), toolName: morphToolName, ...questionErrorResult.shape, isError: z.literal(true), timestamp: amount })
])
const morphAssistant = z.strictObject({ ...collaborationAssistant.shape, content: z.array(z.union([strictText, strictThinking, morphToolCall])) }).superRefine((message, ctx) => {
  if (message.stopReason === 'aborted' ? message.errorMessage !== 'Request aborted' && message.errorMessage !== 'Request was aborted' : message.stopReason !== 'error' && message.errorMessage !== undefined) ctx.addIssue({ code: 'custom', message: 'native_pi_error_unreviewed' })
})
const morphSystem = strictSystem.extend({ toolsAdded: z.array(z.union([
  z.strictObject({ name: z.literal('morph_list_tools'), description: z.literal(piMorphListDescription), parameters: z.unknown().refine(value => isDeepStrictEqual(value, piMorphListParameters)) }),
  z.strictObject({ name: z.literal('morph_call_tool'), description: z.literal(piMorphCallDescription), parameters: z.unknown().refine(value => isDeepStrictEqual(value, piMorphCallParameters)) })
])).max(2).optional() })
export const strictPiMorphMessageSchema = z.union([strictUser, morphSystem, morphAssistant, morphToolResult])
export type StrictPiMorphMessage = z.infer<typeof strictPiMorphMessageSchema>
export const strictPiMorphNativeEntrySchema = z.discriminatedUnion('type', [
  z.strictObject({ ...entryCommon, type: z.literal('message'), message: strictPiMorphMessageSchema }),
  ...strictPiNativeEntrySchema.options.filter(option => option.shape.type.value !== 'message')
])
export const strictPiMorphRawSchema = z.union([
  z.strictObject({ type: z.literal('message_start'), message: strictPiMorphMessageSchema }), z.strictObject({ type: z.literal('message_end'), message: strictPiMorphMessageSchema }),
  z.strictObject({ type: z.literal('message_update'), usage: strictPiUsageSchema, assistantMessageEvent: z.union([strictDelta, z.strictObject({ type: z.literal('toolcall_start'), contentIndex: count, id: z.string(), toolName: z.enum(['', 'morph_list_tools', 'morph_call_tool']) }), z.strictObject({ type: z.literal('toolcall_delta'), contentIndex: count, delta: z.string() }), z.strictObject({ type: z.literal('toolcall_end'), contentIndex: count, toolCall: morphToolCall })]) }),
  z.strictObject({ type: z.literal('turn_end'), message: strictPiMorphMessageSchema, toolResults: z.array(morphToolResult) }),
  z.strictObject({ type: z.literal('agent_end'), messages: z.array(strictPiMorphMessageSchema), willRetry: z.literal(false) }),
  z.strictObject({ type: z.literal('tool_execution_start'), toolCallId: z.string().min(1).max(512), toolName: z.literal('morph_list_tools'), args: strictPiMorphListParamsSchema }),
  z.strictObject({ type: z.literal('tool_execution_start'), toolCallId: z.string().min(1).max(512), toolName: z.literal('morph_call_tool'), args: strictPiMorphCallParamsSchema }),
  z.strictObject({ type: z.literal('tool_execution_end'), toolCallId: z.string().min(1).max(512), toolName: morphToolName, result: morphResult, isError: z.boolean() }),
  z.strictObject({ type: z.literal('tool_execution_end'), toolCallId: z.string().min(1).max(512), toolName: morphToolName, result: questionErrorResult, isError: z.literal(true) }),
  z.strictObject({ type: z.literal('entry_appended'), entry: strictPiMorphNativeEntrySchema }),
  response('get_session_stats', strictStats.extend({ toolCalls: count, toolResults: count })),
  strictPiRawSchema
])

export const strictPiOutboundSchema = z.union([
  z.strictObject({ type: z.literal('prompt'), id: z.string().min(1), message: z.string().min(1), images: z.tuple([]).optional(), streamingBehavior: z.enum(['steer', 'followUp']).optional() }),
  ...(['abort', 'get_state', 'get_available_models', 'get_available_thinking_levels', 'get_last_assistant_text', 'get_session_stats'] as const).map(type => z.strictObject({ type: z.literal(type), id: z.string().min(1) })),
  ...(['set_auto_compaction', 'set_auto_retry'] as const).map(type => z.strictObject({ type: z.literal(type), id: z.string().min(1), enabled: z.literal(false) })),
  z.strictObject({ type: z.literal('set_model'), id: z.string().min(1), provider: z.string().min(1), modelId: z.string().min(1) }),
  z.strictObject({ type: z.literal('set_thinking_level'), id: z.string().min(1), level: strictPiThinkingLevelSchema })
])
