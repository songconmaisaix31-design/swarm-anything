import { z } from 'zod'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import type { Scope } from './contracts'

export const workerLimitSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)

export function approvedWorkerLimit(root: unknown, scope: Pick<Scope, 'project_id' | 'run_id' | 'root_task_id'>) {
  const task = z.object({ id: z.string(), run_id: z.string(), parent_id: z.null(), spec: z.string() }).parse(root)
  const fixed = z.object({ project_id: z.string(), spec: z.object({ max_workers: workerLimitSchema }) }).parse(JSON.parse(task.spec))
  if (task.id !== scope.root_task_id || task.run_id !== scope.run_id || fixed.project_id !== scope.project_id) throw new OrchestrationError('scope_denied', 'The Worker budget belongs to another fixed task')
  return fixed.spec.max_workers
}

export function assertWorkerCapacity(limit: number, created: number, pending: number) {
  workerLimitSchema.parse(limit)
  z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(created)
  z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(pending)
  if (created >= limit || pending >= limit - created) throw new OrchestrationError('resource_limit', 'The fixed task has reserved its approved Worker capacity')
}

export function assertWorkerStartOpen(status: string, pendingCompletions: number) {
  z.enum(['pending', 'ready', 'dispatched', 'completed', 'failed', 'blocked']).parse(status)
  z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(pendingCompletions)
  if (status === 'completed' || status === 'failed') throw new OrchestrationError('scope_denied', 'The fixed root task has reached its terminal state')
  if (pendingCompletions) throw new OrchestrationError('operation_in_progress', 'The fixed task completion still owns its original reservation')
}

export function assertCompletionInventory(limit: number, created: number, pending: number) {
  workerLimitSchema.parse(limit)
  z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(created)
  z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(pending)
  if (!created || created > limit || pending) throw new OrchestrationError('evidence_missing', 'At least one Worker, a complete approved inventory and no pending Worker starts are required')
}
