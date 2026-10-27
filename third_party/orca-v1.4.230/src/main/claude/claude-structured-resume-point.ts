import type {
  ClaudeSession,
  ClaudeStructuredSessionAdapterDeps
} from './claude-structured-session-state'
import { settleClaudeTurnEndWaiters } from './claude-request-end-wait'

/**
 * Record a completed turn: its leaf becomes the one close and exit persist, and the durable point
 * advances in place so an owner that dies before its close path runs keeps it. Writes run one at a
 * time, and a failure is only logged: this is bookkeeping and must never fail the turn.
 */
export function persistClaudeTurnResumePoint(
  sessionId: string,
  session: ClaudeSession,
  deps: Pick<ClaudeStructuredSessionAdapterDeps, 'persistResumePoint'>
): void {
  if (session.closeFinalization || session.closeFinalized) {
    return
  }
  session.turnEndLeafUuid = session.leafUuid
  // The turn ended: a Stop waiting to end the child re-reads what Claude still has in flight.
  settleClaudeTurnEndWaiters(session)
  const leafUuid = session.turnEndLeafUuid
  const persist = deps.persistResumePoint
  if (!persist || leafUuid === null || session.resumePointWrite?.leafUuid === leafUuid) {
    return
  }
  const previous = session.resumePointWrite?.settled ?? Promise.resolve()
  const write: NonNullable<ClaudeSession['resumePointWrite']> = {
    leafUuid,
    settled: previous
      .then(() =>
        persist({
          sessionId,
          providerSessionId: session.providerSessionId,
          leafUuid,
          fence: session.fence
        })
      )
      .catch((error: unknown) => {
        if (session.swaClaudePolicy) {
          // 受限会话的持久化失败保留原拒绝，close/ended 必须等待并传播它。
          session.swaClaudePolicy.reject('resume_persistence_failed')
        }
        console.warn('[claude-resume-point] turn-end resume point was not persisted:', {
          sessionId,
          leafUuid,
          error
        })
        // Forget the failed leaf so the next turn end retries it even when the leaf has not moved.
        if (session.resumePointWrite === write) {
          session.resumePointWrite = undefined
        }
      })
  }
  session.resumePointWrite = write
  if (session.swaClaudePolicy) void write.settled.catch(() => undefined)
}

/** Close and exit persist the last completed turn, after any in-flight turn-end write settles. */
export async function settledClaudeTurnEndLeaf(session: ClaudeSession): Promise<string | null> {
  await session.resumePointWrite?.settled
  // 停止中的受限会话也保存实际已观察的 user/assistant leaf，供原件返回不完整结果。
  return session.swaClaudePolicy ? session.leafUuid : session.turnEndLeafUuid
}
