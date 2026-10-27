import { isDeepStrictEqual } from 'node:util'
import { Type } from '@earendil-works/pi-ai'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { RuntimeClient } from '../../../third_party/orca-v1.4.230/src/cli/runtime/client'
import { readInjectedAgentSessionId, ORCA_AGENT_SESSION_SPAWN_TOKEN_ENV } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-caller-env'
import { nativeObject, questionOriginSchema, questionRequestID, questionToolParamsSchema, questionWaitID, readQuestionMutationResult } from './contracts'
import { piQuestionDescription, piQuestionParameters } from '../../../third_party/orca-v1.4.230/src/main/pi/rpc-protocol'

// 固定扩展只读取本次真实调用；请求标识不能由模型或重连次数决定。
export default function registerQuestionTool(pi: ExtensionAPI, collaboration = false, project = false) {
  const sessionId = readInjectedAgentSessionId(), proof = process.env[ORCA_AGENT_SESSION_SPAWN_TOKEN_ENV]
  if (!sessionId || !proof) throw new Error('The native question Worker identity is unavailable')
  const client = new RuntimeClient(undefined, undefined, undefined, undefined, undefined, undefined, { proof })
  const toolsCurrent = () => project ? [['bash'], ['bash', 'swa_ask'], ['bash', 'swa_delegate'], ['bash', 'swa_ask', 'swa_delegate']].some(allowed => isDeepStrictEqual([...pi.getActiveTools()].sort(), allowed)) : collaboration ? [['swa_delegate'], ['swa_ask', 'swa_delegate']].some(allowed => isDeepStrictEqual([...pi.getActiveTools()].sort(), allowed)) : isDeepStrictEqual(pi.getActiveTools(), ['swa_ask'])
  pi.on('before_agent_start', () => {
    if (!toolsCurrent()) {
      process.stderr.write('native_question_active_tools_changed\n')
      process.exit(1)
    }
  })
  pi.registerTool({
    name: 'swa_ask', label: 'Ask the Run owner',
    description: piQuestionDescription,
    exposure: 'model-only', executionMode: 'sequential',
    parameters: Type.Unsafe(piQuestionParameters),
    async execute(toolCallId, input, signal, _onUpdate, context) {
      if (!toolsCurrent() || !pi.getActiveTools().includes('swa_ask')) { process.stderr.write('native_question_active_tools_changed\n'); process.exit(1) }
      const params = questionToolParamsSchema.parse(input)
      const entries = context.sessionManager.getEntries().filter(entry => entry.type === 'message' && entry.message.role === 'assistant' && entry.message.content.some(block => block.type === 'toolCall' && block.id === toolCallId))
      if (entries.length !== 1) throw new Error('The actual native assistant tool entry is not unique')
      const entry = entries[0]!
      if (entry.type !== 'message' || entry.message.role !== 'assistant') throw new Error('The actual native tool entry is unavailable')
      const calls = entry.message.content.filter(block => block.type === 'toolCall' && block.id === toolCallId)
      if (calls.length !== 1 || calls[0]!.type !== 'toolCall' || calls[0]!.name !== 'swa_ask' || !isDeepStrictEqual(calls[0]!.arguments, params)) throw new Error('The actual native tool parameters changed')
      const origin = questionOriginSchema.parse({ nativeSessionId: context.sessionManager.getSessionId(), assistantEntryId: entry.id, toolCallId })
      const requestId = questionRequestID(sessionId, origin)
      const options = { orchestrationRequestId: requestId, swaQuestionOrigin: origin, signal, timeoutMs: 695_000 }
      let result: Record<string, unknown>
      try {
        result = readQuestionMutationResult((await client.call('orchestration.ask', params, options)).result, requestId)
      } catch {
        // 断线只能查询原 R；无法确认已创建的问题时不再发送任何 mutation。
        if (signal?.aborted) return output({ state: 'unknown', request_id: requestId, reason: 'connection_cancelled', required_action: 'Inspect the original request; do not create another question' })
        try {
          const observed = nativeObject((await client.call('orchestration.requestShow', { request: requestId }, { swaQuestionOrigin: origin, signal })).result)
          if (observed.state !== 'completed' || observed.method !== 'orchestration.ask') return output({ state: 'unknown', request_id: requestId, required_action: 'Inspect the original request; do not create another question' })
          result = readQuestionMutationResult(observed.receipt, requestId)
        } catch { return output({ state: 'unknown', request_id: requestId, required_action: 'Inspect the original request; do not create another question' }) }
      }
      if (result.accepted === true && result.answer === null && typeof result.messageId === 'string' && result.timedOut === false && result.cancelled === false && result.connectionLost === false) {
        const waitingId = questionWaitID(requestId)
        try {
          result = readQuestionMutationResult((await client.call('orchestration.ask', { resume: result.messageId }, { ...options, orchestrationRequestId: waitingId })).result, waitingId)
        } catch { return output({ state: 'unknown', request_id: requestId, wait_request_id: waitingId, question_id: result.messageId, required_action: 'Inspect the original wait request; do not create another question' }) }
      }
      return output(result)
    }
  })
}

function output(result: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], details: { schema: 'swa.native-question.v1', ...result } }
}
