import { isDeepStrictEqual } from 'node:util'
import { Type } from '@earendil-works/pi-ai'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { RuntimeClient } from '../../../third_party/orca-v1.4.230/src/cli/runtime/client'
import { readInjectedAgentSessionId, ORCA_AGENT_SESSION_SPAWN_TOKEN_ENV } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-caller-env'
import { piDelegationDescription, piDelegationParameters, strictPiDelegationResultSchema } from '../../../third_party/orca-v1.4.230/src/main/pi/rpc-protocol'
import { delegationToolParamsSchema, delegationRequestID, delegationWorkerRequestID, questionOriginSchema, nativeObject } from './contracts'
import registerQuestionTool from './pi-question-extension'

export default function registerCollaboration(pi: ExtensionAPI) {
  const sessionId = readInjectedAgentSessionId(), proof = process.env[ORCA_AGENT_SESSION_SPAWN_TOKEN_ENV]
  if (!sessionId || !proof) throw new Error('The native delegation Worker identity is unavailable')
  const client = new RuntimeClient(undefined, undefined, undefined, undefined, undefined, undefined, { proof })
  registerQuestionTool(pi, true)
  pi.registerTool({ name: 'swa_delegate', label: 'Delegate to a project role', description: piDelegationDescription, exposure: 'model-only', executionMode: 'sequential', parameters: Type.Unsafe(piDelegationParameters),
    async execute(toolCallId, input, signal, _onUpdate, context) {
      if (![['swa_delegate'], ['swa_ask', 'swa_delegate']].some(allowed => isDeepStrictEqual([...pi.getActiveTools()].sort(), allowed))) throw new Error('The native delegation tools changed')
      const params = delegationToolParamsSchema.parse(input)
      const entries = context.sessionManager.getEntries().filter(entry => entry.type === 'message' && entry.message.role === 'assistant' && entry.message.content.some(block => block.type === 'toolCall' && block.id === toolCallId))
      if (entries.length !== 1) throw new Error('The actual native delegation entry is not unique')
      const entry = entries[0]!
      if (entry.type !== 'message' || entry.message.role !== 'assistant') throw new Error('The actual native delegation entry is unavailable')
      const calls = entry.message.content.filter(block => block.type === 'toolCall' && block.id === toolCallId)
      if (calls.length !== 1 || calls[0]!.type !== 'toolCall' || calls[0]!.name !== 'swa_delegate' || !isDeepStrictEqual(calls[0]!.arguments, params)) throw new Error('The native delegation arguments changed')
      const origin = questionOriginSchema.parse({ nativeSessionId: context.sessionManager.getSessionId(), assistantEntryId: entry.id, toolCallId })
      const requestId = delegationRequestID(sessionId, origin), workerRequest = delegationWorkerRequestID(requestId)
      const unknown = () => output({ schema: 'swa.native-delegation.v1', request_id: requestId, worker_request_id: workerRequest, state: 'unknown', required_action: `Inspect request ${requestId}; never repeat this delegation with a new tool call` })
      const read = (value: unknown) => {
        const result = strictPiDelegationResultSchema.strip().parse(value)
        if (result.request_id !== requestId || result.worker_request_id !== workerRequest) throw new Error('The native delegation result changed its request')
        return output(result)
      }
      try { return read((await client.call('swa.delegate', params, { orchestrationRequestId: requestId, swaQuestionOrigin: origin, signal, timeoutMs: 130_000 })).result) }
      catch {
        if (signal?.aborted) return unknown()
        try {
          const observed = nativeObject((await client.call('orchestration.requestShow', { request: requestId }, { swaQuestionOrigin: origin, signal })).result)
          return observed.method === 'swa.delegate' && observed.state === 'completed' ? read(observed.receipt) : unknown()
        } catch { return unknown() }
      }
    }
  })
}

function output(value: unknown) {
  const details = strictPiDelegationResultSchema.parse(value)
  return { content: [{ type: 'text' as const, text: JSON.stringify(details) }], details }
}
