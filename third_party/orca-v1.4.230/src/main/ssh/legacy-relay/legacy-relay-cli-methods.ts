import { ORCHESTRATION_CHECK_METHODS } from '../../runtime/rpc/methods/orchestration/messaging/check-methods'
import { ORCHESTRATION_MESSAGE_METHODS } from '../../runtime/rpc/methods/orchestration/messaging/message-methods'
import { ORCHESTRATION_SEND_METHODS } from '../../runtime/rpc/methods/orchestration/messaging/send-methods'
import { ORCHESTRATION_ASK_METHODS } from '../../runtime/rpc/methods/orchestration/messaging/ask-methods'

// 调度和完成回执使用同一组原生声明，避免引入完整产品功能表。
const names = new Set(['orchestration.check', 'orchestration.inbox', 'orchestration.send', 'orchestration.ask', 'orchestration.reply'])
export const LEGACY_RELAY_CLI_METHODS = [
  ...ORCHESTRATION_CHECK_METHODS,
  ...ORCHESTRATION_SEND_METHODS,
  ...ORCHESTRATION_MESSAGE_METHODS,
  ...ORCHESTRATION_ASK_METHODS
].filter(method => names.has(method.name))
if (LEGACY_RELAY_CLI_METHODS.length !== names.size || new Set(LEGACY_RELAY_CLI_METHODS.map(method => method.name)).size !== names.size) throw new Error('The native legacy relay CLI method declarations are incomplete')
