import { z } from 'zod'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import { roleDefinitionSchema, type Invocation } from './contracts'

export const roleSchema = roleDefinitionSchema.extend({ id: z.string(), project_id: z.string(), revision: z.number().int().positive(), archived: z.boolean(), created_at: z.string(), updated_at: z.string() })

export function assignedAgent(command: Pick<Invocation['command'], 'agent' | 'model' | 'role_id' | 'revision'>, project: string, snapshot?: unknown) {
  const role = snapshot === undefined ? undefined : roleSchema.parse(snapshot)
  if (!!command.role_id !== !!command.revision || !command.role_id && role || command.role_id && (!role || role.id !== command.role_id || role.project_id !== project || role.revision !== command.revision || role.archived)) throw new OrchestrationError('context_stale', 'The selected role snapshot does not match the assignment', { effectsApplied: false })
  if (!!command.agent !== !!command.model || command.agent !== undefined && command.agent !== command.agent.trim() || command.model !== undefined && command.model !== command.model.trim()) throw new OrchestrationError('invalid_argument', 'Select both Agent and model or use a role', { effectsApplied: false })
  const agent = command.agent ?? role?.default_agent, model = command.model ?? role?.default_model
  if (!agent || !model) throw new OrchestrationError('invalid_argument', 'An Agent and model or an assigned role is required', { effectsApplied: false })
  return { agent, model }
}

export function workerSelectionMatches(invocation: Invocation) {
  if (!invocation.selection) return false
  const selected = assignedAgent(invocation.command, invocation.project.id, invocation.spec?.role_snapshot)
  return selected.agent === invocation.selection.agent_id && selected.model === invocation.selection.model
}
