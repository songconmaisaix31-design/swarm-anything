import type { OrchestrationDb } from '../../../../orchestration/db'
import { isUnknownWorkerStartOutcome, type WorkerSetupReceipt } from './worker-topology'
import type { OrchestrationWorkerLaunchReceipt } from './worker-launch-preferences'
import type { WorkerStartModeReceipt } from '../../orchestration-worker-start-mode'
import { isStructuredWorkerHandle } from '../../../../../../shared/structured-worker-handle'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'

export function failWorkerStartWithReceipt(args: {
  db: OrchestrationDb
  runId: string
  taskId: string
  dispatchId: string
  failedStage: string
  error: unknown
  setup: WorkerSetupReceipt
  launch: OrchestrationWorkerLaunchReceipt
  mode: WorkerStartModeReceipt
}): unknown {
  const reason = args.error instanceof Error ? args.error.message : String(args.error)
  const unknown = isUnknownWorkerStartOutcome(args.error, args.failedStage)
  const worker = unknown
    ? args.db.markWorkerStartUnknown(args.dispatchId, args.failedStage, reason)
    : args.db.failWorkerStart(args.dispatchId, args.failedStage, reason)
  // Only name cleanup this start actually left behind: a terminal it created and still owns. A
  // structured session is discarded by the teardown, a pane the user typed into is theirs, and an
  // unknown outcome is not settled — none of the three has anything for `worker-release` to close.
  const residual = unknown ? undefined : args.db.getWorkerTerminalResourceByOwner(args.dispatchId)
  const releasable =
    residual?.ownership_state === 'owned' && !isStructuredWorkerHandle(residual.terminal_handle)
  // 仅原生创建入口的明确准入拒绝可以证明没有启动；未知结果不保存此结论。
  const unstarted = !unknown && args.error instanceof OrchestrationError &&
    args.error.data !== null && typeof args.error.data === 'object' &&
    'nativeCreation' in args.error.data && args.error.data.nativeCreation === 'not_started'
  return {
    runId: args.runId,
    taskId: args.taskId,
    dispatchId: args.dispatchId,
    state: worker.state === 'start_unknown' ? 'outcome_unknown' : worker.state,
    stage: worker.stage,
    failedStage: args.failedStage,
    lastError: reason,
    setup: args.setup,
    launch: args.launch,
    mode: args.mode,
    effects: JSON.parse(worker.effects) as unknown[],
    residualResources: JSON.parse(worker.residual_resources) as unknown[],
    ...(unstarted ? { nativeCreation: 'not_started' } : {}),
    ...(releasable
      ? {
          recovery: `This start created a terminal that never ran the Task. Close it with: orca orchestration worker-release --dispatch ${args.dispatchId}`
        }
      : {}),
    ...(unknown
      ? {
          nextCommands: [
            `orca orchestration worker-show --dispatch ${args.dispatchId} --json`,
            `orca orchestration worker-abandon --dispatch ${args.dispatchId} --json`
          ]
        }
      : {})
  }
}
