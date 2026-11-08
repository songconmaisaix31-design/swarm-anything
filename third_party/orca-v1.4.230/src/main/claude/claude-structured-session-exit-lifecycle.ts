import { agentSessionFailureFact, providerDiagnosticOf } from '../../shared/agent-session-failure'
import { providerExitObserved } from '../native-chat/agent-session-wire/structured-agent-session-failure-text'
import { settledClaudeTurnEndLeaf } from './claude-structured-resume-point'
import { drainClaudeChildWork } from './claude-child-work-evidence'
import {
  claudeRootExitObserved,
  settleClaudeExitedSession
} from './claude-structured-session-close'
import type {
  ClaudeAcquisitionAttempt,
  ClaudeSession,
  ClaudeSessionExit,
  ClaudeStructuredSessionAdapterDeps,
  ClaudeStructuredSessionEvent
} from './claude-structured-session-state'

export type ClaudeExitLifecycle = {
  sessions: Map<string, ClaudeSession>
  exits: Map<string, ClaudeSessionExit>
  /** A settled exit's diagnostic, kept for a send admitted before the host heard of the exit. */
  settledExitErrors: Map<string, Error>
  deps: Pick<ClaudeStructuredSessionAdapterDeps, 'persistHandle' | 'now' | 'onEvent' | 'onChildWorkEvidence'>
  emit: (session: ClaudeSession, event: ClaudeStructuredSessionEvent) => void
}

export function observeClaudeSessionExit(
  lifecycle: ClaudeExitLifecycle,
  sessionId: string,
  attempt: ClaudeAcquisitionAttempt,
  error: Error
): void {
  const session = lifecycle.sessions.get(sessionId)
  if (!session || session.connection !== attempt.connection) {
    return
  }
  lifecycle.sessions.delete(sessionId)
  // Re-enter the provider's close ladder before publishing lifecycle recovery.
  // An exit callback is root evidence only; the retained tree proof must run
  // before the host releases and reacquires this exact child.
  const closePromise = session.connection.close().catch(() => false)
  const exit: ClaudeSessionExit = {
    connection: session.connection,
    session,
    error,
    closePromise
  }
  lifecycle.exits.set(sessionId, exit)
  exit.publication = closePromise
    .then((proven) => {
      // 受限分支不接受仅根退出；普通分支保留原有根退出语义。
      if (!proven && (session.connection.swaFullTreeCloseRequired || !claudeRootExitObserved(session.connection))) {
        return undefined
      }
      return settleClaudeUnexpectedExit(lifecycle, sessionId, exit)
    })
    .catch(() => undefined)
}

/** 受限分支只在完整树和持久化成功后发布恢复；普通分支沿原关闭语义。 */
export function settleClaudeUnexpectedExit(
  lifecycle: ClaudeExitLifecycle,
  sessionId: string,
  exit: ClaudeSessionExit
): Promise<void> {
  const { exits, deps } = lifecycle
  exit.settlementPromise ??= (async () => {
    const restricted = exit.connection.swaFullTreeCloseRequired === true
    if (restricted && await exit.connection.close() !== true) throw new Error('native_claude_exit_tree_unproven')
    exit.session.unbindReadingControl?.()
    if (exits.get(sessionId) !== exit) {
      settleClaudeExitedSession(exit.session)
      return
    }
    // Persist the last completed turn before publishing the lifecycle
    // event that lets the host release and reacquire this exact child.
    if (restricted) {
      await persistClaudeSessionHandle(sessionId, exit.session, deps)
      if (!exit.session.events?.written || !exit.session.translator) throw new Error('native_claude_exit_journal_port_missing')
      if (!(await exit.session.events.written()).ok) throw new Error('native_claude_exit_journal_unproven')
    } else {
      await persistClaudeSessionHandle(sessionId, exit.session, deps).catch((error: unknown) => {
        console.warn('[claude-resume-point] exit cursor was not persisted:', { sessionId, error })
      })
    }
    if (exits.get(sessionId) !== exit) {
      settleClaudeExitedSession(exit.session)
      return
    }
    const ended: ClaudeStructuredSessionEvent = {
      type: 'ended',
      sessionId,
      reason: restricted ? 'native_claude_session_ended' : exit.error.message,
      // A start that never landed says why it failed. After it landed, only the child's own exit
      // blames the provider; an Orca fault that closed it is Orca's.
      failure: providerExitObserved(exit.error)
        ? agentSessionFailureFact('providerExited', { detail: restricted ? undefined : providerDiagnosticOf(exit.error) })
        : agentSessionFailureFact('hostFault'),
      cause: 'unexpected-exit',
      fence: exit.session.fence,
      acquisitionGeneration: exit.session.acquisitionGeneration,
      observedAt: deps.now?.() ?? Date.now()
    }
    if (restricted) {
      const session = exit.session
      session.childWork.clear()
      session.backgroundTasks.clear()
      session.translator!.handle(ended)
      if (!(await session.events!.written!()).ok) throw new Error('native_claude_exit_journal_unproven')
      exits.delete(sessionId)
      lifecycle.settledExitErrors.set(sessionId, new Error('native_claude_session_ended'))
      try {
        deps.onEvent?.(ended)
        const evidence = drainClaudeChildWork(session, null, deps.now?.() ?? Date.now())
        if (evidence.length) deps.onChildWorkEvidence?.(sessionId, evidence, session.events)
      } finally { settleClaudeExitedSession(session) }
      return
    }
    exits.delete(sessionId)
    lifecycle.settledExitErrors.set(sessionId, exit.error)
    try {
      lifecycle.emit(exit.session, ended)
    } finally {
      settleClaudeExitedSession(exit.session)
    }
  })()
  return exit.settlementPromise
}

/** Wait for each first-hand exit's publication, including exits observed while waiting. */
export async function drainClaudeObservedExits(
  exits: Map<string, ClaudeSessionExit>
): Promise<void> {
  const awaited = new Set<Promise<void>>()
  for (;;) {
    const pending = [...exits.values()]
      .map((exit) => exit.publication)
      .filter(
        (publication): publication is Promise<void> =>
          publication !== undefined && !awaited.has(publication)
      )
    if (pending.length === 0) {
      return
    }
    for (const publication of pending) {
      awaited.add(publication)
    }
    await Promise.all(pending)
  }
}

export async function persistClaudeSessionHandle(
  sessionId: string,
  session: ClaudeSession,
  deps: Pick<ClaudeStructuredSessionAdapterDeps, 'persistHandle'>
): Promise<void> {
  if (session.connection.swaFullTreeCloseRequired && !deps.persistHandle) throw new Error('native_claude_handle_persistence_missing')
  const leafUuid = await settledClaudeTurnEndLeaf(session)
  await deps.persistHandle?.({
    sessionId,
    providerSessionId: session.providerSessionId,
    leafUuid,
    fence: session.fence
  })
}
