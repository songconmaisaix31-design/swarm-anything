import { isDeepStrictEqual } from 'node:util'
import { Type } from '@earendil-works/pi-ai'
import type { ExtensionAPI, ExtensionToolContext } from '@earendil-works/pi-coding-agent'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { z } from 'zod'
import { readInjectedAgentSessionId, ORCA_AGENT_SESSION_SPAWN_TOKEN_ENV } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-caller-env'
import { piMorphListDescription, piMorphCallDescription, piMorphListParameters, piMorphCallParameters, strictPiMorphListParamsSchema, strictPiMorphCallParamsSchema, strictPiMorphOriginSchema, strictPiMorphResultSchema } from '../../../third_party/orca-v1.4.230/src/main/pi/rpc-protocol'
import { morphBackendEnvironment, readMorphDescriptor } from './morph-config'

const toolNames = ['morph_call_tool', 'morph_list_tools']
type Operation = 'morph_list_tools' | 'morph_call_tool'
const maximum = 1024 * 1024

export default function registerMorphTools(pi: ExtensionAPI) {
  const session = readInjectedAgentSessionId(), proof = process.env[ORCA_AGENT_SESSION_SPAWN_TOKEN_ENV]
  if (!session || !proof) throw new Error('The native Morphogenesis Worker identity is unavailable')
  const configPath = z.string().min(1).parse(process.env.SWA_MORPH_CONFIG)
  const expected = { configVersion: z.string().min(1).parse(process.env.SWA_MORPH_CONFIG_VERSION), hostConfigVersion: z.string().min(1).parse(process.env.SWA_MORPH_HOST_CONFIG_VERSION) }
  const initial = readMorphDescriptor(configPath, expected)
  const current = () => {
    if (readInjectedAgentSessionId() !== session || process.env[ORCA_AGENT_SESSION_SPAWN_TOKEN_ENV] !== proof
        || !isDeepStrictEqual([...pi.getActiveTools()].sort(), toolNames)
        || !isDeepStrictEqual(readMorphDescriptor(configPath, expected), initial)) throw new Error('The native Morphogenesis Worker configuration changed')
  }
  const client = new Client({ name: 'swa-morphogenesis', version: '1.0.0' }, { capabilities: {} })
  const transport = new StdioClientTransport({ command: initial.descriptor.python,
    args: ['-m', 'swarm.research', '--config', initial.descriptor.host_config], cwd: initial.descriptor.cwd,
    env: { ...morphBackendEnvironment(configPath, process.env), PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1' }, stderr: 'ignore', maxBufferSize: maximum })
  let connection: Promise<void> | undefined, broken = false, nativeSession: string | undefined
  const delivered = new Set<string>()
  const close = async () => { broken = true; await client.close() }
  client.onclose = () => { broken = true }
  client.onerror = () => { broken = true; void client.close().catch(() => {}) }
  pi.on('before_agent_start', current)
  pi.on('session_shutdown', close)

  async function execute(operation: Operation, toolCallId: string, input: unknown, signal: AbortSignal | undefined, context: ExtensionToolContext) {
    current()
    const params = operation === 'morph_list_tools' ? strictPiMorphListParamsSchema.parse(input) : strictPiMorphCallParamsSchema.parse(input)
    const entries = context.sessionManager.getEntries()
    const matching = entries.filter(entry => entry.type === 'message' && entry.message.role === 'assistant'
      && entry.message.content.some(block => block.type === 'toolCall' && block.id === toolCallId))
    const entry = matching[0]
    if (matching.length !== 1 || !entry || entry.type !== 'message' || entry.message.role !== 'assistant') throw new Error('The actual Morphogenesis tool entry is not unique')
    const calls = entry.message.content.filter(block => block.type === 'toolCall' && block.id === toolCallId)
    if (calls.length !== 1 || calls[0]!.type !== 'toolCall' || calls[0]!.name !== operation || !isDeepStrictEqual(calls[0]!.arguments, params)) throw new Error('The actual Morphogenesis tool arguments changed')
    const origin = strictPiMorphOriginSchema.parse({ native_session_id: context.sessionManager.getSessionId(), assistant_entry_id: entry.id, tool_call_id: toolCallId })
    nativeSession ??= origin.native_session_id
    if (nativeSession !== origin.native_session_id || entries.some(row => row.type === 'message' && row.message.role === 'toolResult' && row.message.toolCallId === toolCallId)) throw new Error('The original Morphogenesis tool call already completed or its session changed')
    const unknown = () => output({ schema: 'swa.native-morph.v1', operation, origin, state: 'unknown', reason: 'connection_unconfirmed', required_action: 'Inspect existing Morphogenesis evidence; do not repeat this operation' }, true)
    if (broken || delivered.has(toolCallId) || signal?.aborted) return unknown()
    delivered.add(toolCallId)
    try {
      connection ??= client.connect(transport, { signal, timeout: 10_000, maxTotalTimeout: 10_000 })
      await connection
      current()
      if (broken || signal?.aborted) throw new Error('Morphogenesis connection unavailable')
      const options = { signal, timeout: 120_000, maxTotalTimeout: 120_000 }
      const result = operation === 'morph_list_tools'
        ? await client.listTools(undefined, options)
        : await client.callTool(strictPiMorphCallParamsSchema.parse(params), undefined, options)
      if (Buffer.byteLength(JSON.stringify(result), 'utf8') > maximum) throw new Error('Morphogenesis result exceeds its bound')
      current()
      return output({ schema: 'swa.native-morph.v1', operation, origin, state: 'completed', mcp_result: result }, result.isError === true)
    } catch {
      // 未知交付关闭本次连接；后续工具调用不能创建第二个 host 进程。
      try { await close() } catch { broken = true }
      return unknown()
    }
  }

  pi.registerTool({ name: 'morph_list_tools', label: 'List Morphogenesis tools', description: piMorphListDescription,
    exposure: 'model-only', executionMode: 'sequential', parameters: Type.Unsafe(piMorphListParameters),
    execute: (id, input, signal, _onUpdate, context) => execute('morph_list_tools', id, input, signal, context) })
  pi.registerTool({ name: 'morph_call_tool', label: 'Call a Morphogenesis tool', description: piMorphCallDescription,
    exposure: 'model-only', executionMode: 'sequential', parameters: Type.Unsafe(piMorphCallParameters),
    execute: (id, input, signal, _onUpdate, context) => execute('morph_call_tool', id, input, signal, context) })
}

function output(value: unknown, isError: boolean) {
  const details = strictPiMorphResultSchema.parse(value)
  return { content: [{ type: 'text' as const, text: JSON.stringify(details) }], details, isError }
}
