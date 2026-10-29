import type { Invocation } from './contracts'

export const builtinWorkerRoles = [
  { id: 'developer', name: '开发者', description: '实施分配的功能，运行相关检查并报告真实结果。', instruction: '你负责指定范围的功能开发。先依据需求明确验收，复用现有实现，只修改获准文件；保留其他 Agent 的修改。依据实际运行结果报告完成内容、检查命令和剩余限制。' },
  { id: 'reviewer', name: '审查者', description: '独立核对需求、源码与实际验证结果。', instruction: '你负责独立审查。依据需求自行推导正确条件，核对准确源码、真实结果、权限和失败路径。明确接受、退回或证据不足及依据；不要把开发者说明当作已验证事实，不修改业务代码。' },
  { id: 'coordinator', name: '协调者', description: '安排互斥职责、依赖顺序与交接，汇总实际结果。', instruction: '你负责协调当前任务。按文件写入范围安排职责，明确依赖、验收和交接；汇总实际结果及未决条件。遵守当前任务权限，不扩大范围，不将状态汇报当作功能验证。' }
] as const

export function workerSpec(invocation: Invocation): string {
  if (!invocation.input) throw new Error('selected_native_worker_input_required')
  const role = invocation.command.role
  const card = role === undefined ? undefined : builtinWorkerRoles.find(item => item.id === role)
  if (role !== undefined && !card) throw new Error('unknown_worker_role')
  const prefix = card ? `内置角色 ${card.id}（${card.name}）：\n${card.instruction}\n角色卡不增加工具、目录、账号或网络权限；遵守本次任务实际授权。\n\n` : ''
  return `${prefix}${invocation.input.text}\n\n固定公开上下文：\n${JSON.stringify(invocation.scope.context)}`
}
