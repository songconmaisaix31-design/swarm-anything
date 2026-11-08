import type { DirectoryAccountAgentDefinition } from '../native-chat/agent-session-wire/structured-agent-definition'

export const PI_RPC_AGENT: DirectoryAccountAgentDefinition = {
  agent: 'pi',
  handleTransport: 'jsonl-rpc',
  accountHomeVariable: 'PI_CODING_AGENT_DIR',
  capabilities: {
    rewind: false,
    compact: false,
    threadGoal: false,
    contextUsage: true,
    imagePrompts: false,
    steering: 'inject',
    approvalEnforcement: 'provider'
  },
  restingOptions: {
    acceptsKey: (key) => key === 'model' || key === 'effort',
    fallbackModels: () => null,
    effortDefaultsToModel: false
  }
}
