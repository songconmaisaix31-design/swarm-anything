import { isDeepStrictEqual } from 'node:util'
import { createBashToolDefinition, type ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { RuntimeClient } from '../../../third_party/orca-v1.4.230/src/cli/runtime/client'
import { readInjectedAgentSessionId, ORCA_AGENT_SESSION_SPAWN_TOKEN_ENV } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-caller-env'
import { piProjectInputSchema, projectToolOriginSchema, projectToolAuthorizationSchema } from './contracts'
import { runProjectShell } from './project-shell'
import registerCollaboration from './pi-collaboration-extension'

export default function registerProjectTools(pi: ExtensionAPI) {
  registerCollaboration(pi, true)
  const session = readInjectedAgentSessionId(), proof = process.env[ORCA_AGENT_SESSION_SPAWN_TOKEN_ENV]
  if (!session || !proof) throw new Error('The native project Worker identity is unavailable')
  const client = new RuntimeClient(undefined, undefined, undefined, undefined, undefined, undefined, { proof })
  const definition = createBashToolDefinition(process.cwd(), { exposeSessionEnvironment: false, operations: { exec: async () => { throw new Error('Project bash requires its exact native call authorization') } } })
  pi.registerTool({ ...definition, executionMode: 'sequential', async execute(toolCallId, input, signal, onUpdate, context) {
    if (![['bash'], ['bash', 'swa_ask'], ['bash', 'swa_delegate'], ['bash', 'swa_ask', 'swa_delegate']].some(allowed => isDeepStrictEqual([...pi.getActiveTools()].sort(), allowed))) throw new Error('The native project tools changed')
    const params = piProjectInputSchema.parse(input)
    const entries = context.sessionManager.getEntries().filter(entry => entry.type === 'message' && entry.message.role === 'assistant' && entry.message.content.some(item => item.type === 'toolCall' && item.id === toolCallId))
    const entry = entries[0]
    if (entries.length !== 1 || !entry || entry.type !== 'message' || entry.message.role !== 'assistant') throw new Error('The project command has no unique native assistant entry')
    const calls = entry.message.content.filter(item => item.type === 'toolCall' && item.id === toolCallId)
    if (calls.length !== 1 || calls[0]!.type !== 'toolCall' || calls[0]!.name !== 'bash' || !isDeepStrictEqual(calls[0]!.arguments, params)) throw new Error('The project command changed its native arguments')
    const origin = projectToolOriginSchema.parse({ agent: 'pi', native_session_id: context.sessionManager.getSessionId(), assistant_entry_id: entry.id, tool_call_id: toolCallId })
    const approved = projectToolAuthorizationSchema.parse((await client.call('swa.projectToolAuthorize', { input: params, cwd: context.cwd }, { swaProjectToolOrigin: origin, signal, timeoutMs: 120_000 })).result)
    const current = () => {
      if (signal?.aborted || approved.agent_session_id !== session || !isDeepStrictEqual(approved.origin, origin) || context.sessionManager.getSessionId() !== origin.native_session_id || approved.grant_expires_at !== undefined && (!Number.isFinite(Date.parse(approved.grant_expires_at)) || Date.now() >= Date.parse(approved.grant_expires_at))) throw new Error('The project command authorization expired or its native session changed')
    }
    current()
    const native = createBashToolDefinition(context.cwd, { exposeSessionEnvironment: false, operations: { exec: async (command, cwd, options) => {
      current()
      if (command !== params.command || cwd !== context.cwd || options.timeout !== params.timeout) throw new Error('The native bash execution differs from its authorized command')
      return runProjectShell(approved.policy, { command, cwd }, { signal: options.signal, timeoutMs: options.timeout === undefined ? undefined : Math.ceil(options.timeout * 1000), onData: options.onData })
    } } })
    return native.execute(toolCallId, input, signal, onUpdate, context)
  } })
}
