// The sends of one ACP session. ACP runs one prompt at a time, so a message sent while Orca's prompt
// runs steers: that prompt is cancelled (the session stays) and the message goes as the next prompt
// once the agent answers the cancel, however long that takes. Each running prompt gets one cancel,
// however many steers arrive; steers wait here, the last one runs, and a Stop withdraws what waits.
// A turn the agent began itself is not Orca's to cut short: a message sent during it goes to the
// agent at once. Each send is settled exactly once:
// accepted when the agent's first event for its turn (or its answer) arrives, rejected when the
// agent refused it or it never left Orca, unknown when the agent died with it or its connection
// broke before it answered.

import {
  agentSessionFailureFact,
  providerDiagnostic,
  type SubmissionRejectionFact
} from '../../shared/agent-session-failure'
import {
  agentSessionFailureWords,
  type AgentJournalDispatchRejection
} from '../../shared/agent-session-failure-words'
import type { AgentJournalItemIdentity } from '../../shared/agent-session-journal-types'
import type {
  AgentSessionCommandAdmission,
  StructuredAgentSessionCommandRun
} from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import { ACP_COMPACT_PROMPT } from './acp-compaction-turn'
import { AcpAgentError, AcpAuthRequiredError, AcpConnectionClosedError, AcpInputAdmissionError } from './acp-errors'
import type { AcpStructuredConnection } from './acp-structured-connection'
import type { AcpStructuredLane } from './acp-structured-lane'
import type { ContentBlock } from './generated/acp-protocol.generated'
import type { ProviderTimelineEvent } from '../native-chat/agent-session-timeline/provider-timeline-event'

export type AcpDispatchSettlement = { clientMessageId: string } & (
  | { providerIdentity: AgentJournalItemIdentity }
  | ({ state: 'rejected' } & AgentJournalDispatchRejection)
  | { state: 'unknown'; reason: string }
)

type Send = { clientMessageId: string; prompt: ContentBlock[]; requestedAt: number; beforeEffect?: () => void }

export type AcpStructuredTurnsDeps = {
  connection: Pick<AcpStructuredConnection, 'prompt' | 'cancel' | 'nativeInputDisposition' | 'onNativeInputObservation'>
  /** Answers the agent's open requests cancelled, as a steer's cancel ends what they belong to. */
  withdrawRequests: () => void
  lane: AcpStructuredLane
  agentName: string
  now: () => number
  settle: (settlement: AcpDispatchSettlement) => void
}

export class AcpStructuredTurns {
  private active: Send | null = null
  /** The running send a steer already cancelled: one cancel per prompt, retried if its write failed. */
  private steerCancelled: Send | null = null
  /** Steers waiting for the prompt ahead of them to answer its cancel. */
  private readonly steers: Send[] = []
  private readonly unsettled = new Set<string>()
  private readonly deferredAcceptance = new Map<string, Extract<ProviderTimelineEvent, { type: 'input.accepted' }>>()
  private readonly publishingAcceptance = new Set<string>()
  private readonly stopObservingNativeInput?: () => void
  private readonly idleWaiters = new Set<() => void>()
  private ended = false
  /** When a Stop or a requested close reached this session; it ends with the process. */
  private stopAt: number | null = null

  constructor(private readonly deps: AcpStructuredTurnsDeps) {
    this.stopObservingNativeInput = deps.connection.onNativeInputObservation?.(() => {
      if (this.active) this.accept(this.active.clientMessageId)
    })
  }

  get running(): boolean {
    return this.active !== null
  }

  /** Whether an agent request may reach the person: Orca's prompt runs and nobody is cutting it
   *  short (no steer's cancel, no Stop). */
  get acceptsRequests(): boolean {
    return (
      this.stopAt === null &&
      this.active !== null &&
      this.steerCancelled !== this.active &&
      !this.ended
    )
  }

  /** Steers wait behind the running prompt's cancel. */
  get holdsSteers(): boolean {
    return this.steers.length > 0
  }

  /** Whether a Stop reached this session. */
  get stopped(): boolean {
    return this.stopAt !== null
  }

  /** When the first Stop reached this session (`Date.now()` time); null before one did. */
  get stoppedAt(): number | null {
    return this.stopAt
  }

  /** A Stop: held steers never reach the agent, and nothing it asks from now on is shown. */
  stop(at: number): boolean {
    this.stopAt ??= at
    return this.withdrawSteers()
  }

  /** Resolves once no prompt of Orca's is running. */
  whenIdle(): Promise<void> {
    if (!this.active) {
      return Promise.resolve()
    }
    return new Promise((resolve) => this.idleWaiters.add(resolve))
  }

  dispatch(send: Send): void {
    this.unsettled.add(send.clientMessageId)
    if (this.active) {
      this.steers.push(send)
      this.cancelForSteer()
      return
    }
    this.start(send)
  }

  /** A `/compact` in the command turn the host opened. The host settles its message, so nothing
   *  here does; the answer ends the turn, or the child's end does. The prompt's write is the
   *  receipt. */
  async compact(command: StructuredAgentSessionCommandRun): Promise<AgentSessionCommandAdmission> {
    if (this.active || this.ended) {
      throw new Error(`${this.deps.agentName} is still working`)
    }
    const { lane } = this.deps
    const send: Send = {
      clientMessageId: command.clientMessageId,
      prompt: [...ACP_COMPACT_PROMPT],
      requestedAt: this.deps.now()
    }
    lane.beginCommand(command)
    try {
      const opened = lane.translator.openPrompt(
        send.clientMessageId,
        send.requestedAt,
        command.turnId
      )
      this.active = send
      this.run(send, opened.promptId)
    } catch (error) {
      lane.forgetCommand(command.turnId)
      throw error
    }
    return { state: 'accepted', providerIdentity: null }
  }

  /** The agent took the send: its turn's first event, or its answer, arrived. */
  accept(clientMessageId: string): void {
    if (!this.unsettled.has(clientMessageId)) return
    const native = this.deps.connection.nativeInputDisposition?.(clientMessageId)
    if (native && native.state !== 'accepted') return
    if (native) {
      if (this.publishingAcceptance.has(clientMessageId)) return
      const deferred = this.deferredAcceptance.get(clientMessageId)
      if (deferred) {
        this.deferredAcceptance.delete(clientMessageId)
        this.publishingAcceptance.add(clientMessageId)
        const settled = (published: boolean): void => {
          this.publishingAcceptance.delete(clientMessageId)
          if (!this.unsettled.delete(clientMessageId)) return
          this.deps.settle(published
            ? { clientMessageId, providerIdentity: native.providerIdentity }
            : { clientMessageId, state: 'unknown', reason: 'Native OpenCode input has no confirmed journal opener' })
        }
        void this.deps.lane.publishInputAcceptance(deferred).then(settled, () => settled(false))
      } else if (this.unsettled.delete(clientMessageId)) this.deps.settle({ clientMessageId, state: 'unknown', reason: 'Native OpenCode input has no original journal acceptance event' })
      return
    }
    if (this.unsettled.delete(clientMessageId)) {
      this.deps.settle({
        clientMessageId,
        providerIdentity: { provider: 'orca', clientMessageId }
      })
    }
  }

  private withdrawSteers(): boolean {
    const withdrawn = this.steers.splice(0)
    for (const send of withdrawn) {
      this.reject(
        send.clientMessageId,
        agentSessionFailureFact('cancelled', { neverReachedAgent: true })
      )
    }
    return withdrawn.length > 0
  }

  /** The child is gone: held sends never left Orca, and the running one's fate is unknown. */
  end(reason: string, cause?: Error): void {
    this.ended = true
    this.stopObservingNativeInput?.()
    for (const send of this.steers.splice(0)) {
      this.reject(send.clientMessageId, agentSessionFailureFact('providerExited'))
    }
    const active = this.active
    if (active && this.deps.connection.nativeInputDisposition?.(active.clientMessageId)) {
      this.settleNativeEnd(active, reason)
    } else if (active && cause instanceof AcpAuthRequiredError) {
      // The connection ended to ask for sign-in: the turn fails as the agent's sign-in answer does.
      this.agentFailed(active, cause)
    } else if (active && this.unsettled.delete(active.clientMessageId)) {
      this.deps.settle({ clientMessageId: active.clientMessageId, state: 'unknown', reason })
    }
    this.active = null
    this.steerCancelled = null
    this.notifyIdle()
  }

  private start(send: Send): void {
    const { lane } = this.deps
    try { send.beforeEffect?.() }
    catch {
      this.reject(send.clientMessageId, agentSessionFailureFact('hostFault', { neverReachedAgent: true }))
      this.finish(send)
      return
    }
    this.active = send
    const opened = lane.translator.openPrompt(send.clientMessageId, send.requestedAt)
    if (this.deps.connection.nativeInputDisposition?.(send.clientMessageId)) {
      for (const event of opened.events) if (event.type === 'input.accepted') this.deferredAcceptance.set(send.clientMessageId, event)
      lane.apply(opened.events.filter(event => event.type !== 'input.accepted'))
    } else lane.apply(opened.events)
    this.run(send, opened.promptId)
  }

  private run(send: Send, promptId: string): void {
    const { lane } = this.deps
    // An agent whose dialect echoes this id on every event of the turn gets it, so its rows join the
    // turn Orca opened; no other agent is sent the extension.
    const meta = lane.translator.injectsPromptIdentity
      ? { promptId, requestId: promptId }
      : undefined
    const answered = this.deps.connection.prompt(send.prompt, meta, send.beforeEffect, send.clientMessageId)
    if (this.steers.length > 0) {
      this.cancelForSteer()
    }
    answered.then(
      (result) => {
        if (this.active !== send) {
          return
        }
        if (this.deps.connection.nativeInputDisposition?.(send.clientMessageId)) this.accept(send.clientMessageId)
        lane.apply(lane.translator.promptResult(send.clientMessageId, result, this.deps.now()))
        this.accept(send.clientMessageId)
        this.finish(send)
      },
      (error: unknown) => {
        if (this.active === send && error instanceof AcpInputAdmissionError) {
          lane.apply(lane.translator.promptFailed(send.clientMessageId, error, this.deps.now()))
          this.reject(send.clientMessageId, agentSessionFailureFact('hostFault', { neverReachedAgent: true }))
          this.finish(send)
          return
        }
        if (this.active !== send || error instanceof AcpConnectionClosedError) {
          // A lost connection: the session's end settles the send, as unknown.
          return
        }
        if (!(error instanceof AcpAgentError)) {
          // Answered, but not in a way Orca can read: the turn failed and the next send may go.
          if (this.deps.connection.nativeInputDisposition?.(send.clientMessageId)) this.accept(send.clientMessageId)
          lane.apply(
            lane.translator.promptFailed(
              send.clientMessageId,
              error instanceof Error ? error : new Error(String(error)),
              this.deps.now()
            )
          )
          this.accept(send.clientMessageId)
          this.finish(send)
          return
        }
        this.agentFailed(send, error)
      }
    )
  }

  private agentFailed(send: Send, error: AcpAgentError): void {
    const { lane } = this.deps
    if (this.deps.connection.nativeInputDisposition?.(send.clientMessageId)) {
      this.accept(send.clientMessageId)
      lane.apply(lane.translator.promptFailed(send.clientMessageId, error, this.deps.now()))
      this.finish(send)
      return
    }
    const refusal = lane.translator.promptRefused(send.clientMessageId, error)
    if (refusal !== null) {
      // The agent answered the prompt with an error before starting it: its own refusal.
      const detail = providerDiagnostic(refusal, 'person')
      this.reject(
        send.clientMessageId,
        agentSessionFailureFact(
          lane.translator.authenticationRequired(error) ? 'notSignedIn' : 'providerRejected',
          detail ? { detail } : {}
        )
      )
    } else {
      lane.apply(lane.translator.promptFailed(send.clientMessageId, error, this.deps.now()))
    }
    this.finish(send)
  }

  private finish(send: Send): void {
    if (this.deps.connection.nativeInputDisposition?.(send.clientMessageId)) this.settleNativeEnd(send, 'Native OpenCode delivery was not proven')
    if (this.active === send) {
      this.active = null
    }
    if (this.steerCancelled === send) {
      this.steerCancelled = null
    }
    const next = this.ended ? undefined : this.steers.shift()
    if (next) {
      this.start(next)
    } else if (!this.active) {
      this.notifyIdle()
    }
  }

  private settleNativeEnd(send: Send, reason: string): void {
    const native = this.deps.connection.nativeInputDisposition?.(send.clientMessageId)
    if (!native) return
    if (native.state === 'accepted') this.accept(send.clientMessageId)
    else if (native.state === 'rejected') this.reject(send.clientMessageId, agentSessionFailureFact('hostFault', { neverReachedAgent: true }))
    else if (this.unsettled.delete(send.clientMessageId)) {
      this.deferredAcceptance.delete(send.clientMessageId)
      this.deps.settle({ clientMessageId: send.clientMessageId, state: 'unknown', reason })
    }
  }

  /** Asks once per running prompt to end it; never bounded, so a slow answer only delays the steer,
   *  and a Stop still ends the session. */
  private cancelForSteer(): void {
    const send = this.active
    if (!send) {
      return
    }
    this.deps.withdrawRequests()
    if (this.steerCancelled === send) {
      return
    }
    this.steerCancelled = send
    this.deps.connection.cancel().catch(() => {
      // Never written: the next steer may ask again.
      if (this.steerCancelled === send) {
        this.steerCancelled = null
      }
    })
  }

  private notifyIdle(): void {
    for (const wake of this.idleWaiters) {
      wake()
    }
    this.idleWaiters.clear()
  }

  private reject(clientMessageId: string, fact: SubmissionRejectionFact): void {
    if (!this.unsettled.delete(clientMessageId)) {
      return
    }
    this.deferredAcceptance.delete(clientMessageId)
    this.deps.settle({
      clientMessageId,
      state: 'rejected',
      ...agentSessionFailureWords(fact, { surface: 'rejection', agentName: this.deps.agentName })
    })
  }
}
