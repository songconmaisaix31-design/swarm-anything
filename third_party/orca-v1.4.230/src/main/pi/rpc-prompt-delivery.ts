import {
  agentSessionFailureFact,
  providerDiagnostic,
  type SubmissionRejectionFact
} from '../../shared/agent-session-failure'
import { agentSessionFailureWords } from '../../shared/agent-session-failure-words'
import type { AgentSessionDispatchOutcome } from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import type { JsonlRpcRecord } from '../jsonl-rpc/peer'
import { piRpcPromptReplySchema } from './rpc-protocol'
import { ProviderWriteAdmissionError } from '../provider-process/provider-stdio-write-queue'
import { strictPiMessageSchema } from './rpc-protocol'
import { isDeepStrictEqual } from 'node:util'

type Submission = {
  id: string
  at: number
  frame?: JsonlRpcRecord
  bytes: number
  accepted: boolean
  retries: number
  acknowledged?: boolean
  /** Pi's last sign-in refusal, while the prompt waits to be re-sent. */
  signInRefusal?: string
}
type DeliveryDeps = {
  retrySignIn?: boolean
  correlatedPrompts?: boolean
  send: (frame: JsonlRpcRecord, beforeWrite?: () => Promise<void | (() => void)>) => Promise<void>
  accepted: (id: string, at: number) => void
  commandOnly: () => void
  rejectedAfterAcceptance: (error: string) => void
  settled: (id: string, outcome: AgentSessionDispatchOutcome) => void
  failed: (error: Error) => void
  beforeWrite?: () => void
  refused?: () => void
}

/** Idless prompt acknowledgements are FIFO and may wait indefinitely on extension dialogs. */
export function piRpcFailureFact(error: string) {
  return agentSessionFailureFact(
    error.startsWith('No API key found for ') ? 'notSignedIn' : 'providerRejected',
    { detail: providerDiagnostic(error, 'person') }
  )
}

function piRejection(fact: SubmissionRejectionFact): AgentSessionDispatchOutcome {
  return {
    state: 'rejected',
    ...agentSessionFailureWords(fact, { agentName: 'Pi', surface: 'rejection' })
  }
}

export class PiRpcPromptDelivery {
  private readonly acknowledgements: Submission[] = []
  private readonly waiting: Submission[] = []
  private readonly retries = new Set<ReturnType<typeof setTimeout>>()
  private readonly pending = new Set<Submission>()
  private heldBytes = 0
  private ended = false
  constructor(private readonly deps: DeliveryDeps) {}
  get holdsDispatch(): boolean {
    return this.waiting.length > 0 || this.retries.size > 0
  }

  async submit(
    id: string,
    at: number,
    frame: JsonlRpcRecord,
    before?: () => Promise<void | (() => void)>
  ): Promise<AgentSessionDispatchOutcome> {
    if (this.ended) {
      throw new Error('Pi prompt queue unavailable')
    }
    if (this.deps.correlatedPrompts && (this.waiting.length || [...this.pending].some(item => item.id === id))) throw new Error('native_pi_input_lane_unavailable')
    const bytes = Buffer.byteLength(JSON.stringify(frame))
    if (this.pending.size >= 128 || this.heldBytes + bytes > 32 * 1024 * 1024) {
      return {
        state: 'rejected',
        ...agentSessionFailureWords(agentSessionFailureFact('queueFull'), {
          agentName: 'Pi',
          surface: 'rejection'
        })
      }
    }
    const submission: Submission = { id, at, frame, bytes, accepted: false, retries: 0 }
    this.pending.add(submission)
    this.heldBytes += bytes
    let admittedToWriter = false
    try {
      await before?.()
      if (this.ended) {
        throw new Error('Pi ended before writing the prompt')
      }
      this.deps.beforeWrite?.()
      if (!this.deps.correlatedPrompts) this.acknowledgements.push(submission)
      this.waiting.push(submission)
      admittedToWriter = true
      await this.deps.send(this.deps.correlatedPrompts ? { ...frame, id } : frame, before)
      if (this.deps.correlatedPrompts) {
        submission.acknowledged = true
        this.finishIfConsumed(submission)
      }
      return { state: 'admitted' }
    } catch (error) {
      if (!this.deps.correlatedPrompts || !admittedToWriter || error instanceof ProviderWriteAdmissionError) this.remove(submission)
      this.deps.refused?.()
      if (this.deps.correlatedPrompts && submission.accepted) return { state: 'accepted', providerIdentity: { provider: 'orca', clientMessageId: id } }
      if (!admittedToWriter || error instanceof ProviderWriteAdmissionError) return piRejection({ ...agentSessionFailureFact('hostFault'), neverReachedAgent: true })
      return { state: 'unknown', reason: 'Pi prompt write did not settle' }
    }
  }

  consumeNext(): boolean {
    if (this.deps.correlatedPrompts) throw new Error('native_pi_input_requires_user_echo')
    const submission = this.waiting[0]
    if (!submission) {
      return false
    }
    this.accept(submission)
    return true
  }

  consumeUserEcho(value: unknown): void {
    if (!this.deps.correlatedPrompts) throw new Error('native_pi_echo_policy_unavailable')
    const submission = this.waiting[0], parsed = strictPiMessageSchema.safeParse(value)
    if (this.waiting.length !== 1 || !submission?.frame || !parsed.success || parsed.data.role !== 'user' || !isDeepStrictEqual(parsed.data.content, [{ type: 'text', text: submission.frame.message }])) throw new Error('native_pi_user_echo_unbound')
    this.accept(submission)
  }

  reply(frame: JsonlRpcRecord): void {
    const reply = piRpcPromptReplySchema.parse(frame)
    const submission = this.acknowledgements.shift()
    if (!submission) {
      throw new Error('Pi prompt reply has no request')
    }
    if (!reply.success) {
      const error = reply.error ?? 'Pi rejected the prompt'
      const fact = piRpcFailureFact(error)
      if (this.deps.retrySignIn !== false && !submission.accepted && fact.kind === 'notSignedIn' && submission.retries++ < 8) {
        submission.signInRefusal = error
        this.removeWaiting(submission)
        const timer = setTimeout(() => {
          this.retries.delete(timer)
          if (this.ended) {
            return
          }
          const frame = submission.frame
          if (!frame) {
            this.deps.failed(new Error('Pi retry lost its unaccepted prompt'))
            return
          }
          submission.signInRefusal = undefined
          this.acknowledgements.push(submission)
          this.waiting.push(submission)
          void this.deps
            .send(frame)
            .catch((error: unknown) =>
              this.deps.failed(error instanceof Error ? error : new Error(String(error)))
            )
        }, 250)
        timer.unref()
        this.retries.add(timer)
        return
      }
      this.remove(submission)
      // Pi checks sign-in before it records a prompt (0.84.0 onward), so this one never reached it.
      const settledFact =
        fact.kind === 'notSignedIn' && !submission.accepted
          ? { ...fact, neverReachedAgent: true as const }
          : fact
      this.deps.settled(submission.id, piRejection(settledFact))
      if (submission.accepted) {
        this.deps.rejectedAfterAcceptance(error)
      } else {
        this.deps.refused?.()
      }
      return
    }
    this.releaseFrame(submission)
    if (reply.data?.disposition === 'handled' || reply.data?.agentInvoked === false) {
      this.accept(submission)
      this.deps.commandOnly()
    }
    this.finishIfConsumed(submission)
  }

  end(): void {
    this.ended = true
    for (const timer of this.retries) {
      clearTimeout(timer)
    }
    this.retries.clear()
    for (const submission of this.pending) {
      // Waiting out a sign-in refusal, not yet re-sent: every reply so far proved Pi never had it.
      if (submission.signInRefusal !== undefined) {
        this.deps.settled(
          submission.id,
          piRejection({ ...piRpcFailureFact(submission.signInRefusal), neverReachedAgent: true })
        )
      } else if (!submission.accepted) {
        this.deps.settled(submission.id, {
          state: 'unknown',
          reason: 'Pi ended before confirming delivery'
        })
      }
      this.releaseFrame(submission)
    }
    this.waiting.length = 0
    this.acknowledgements.length = 0
    this.pending.clear()
  }

  private accept(submission: Submission): void {
    if (submission.accepted) {
      return
    }
    submission.accepted = true
    this.removeWaiting(submission)
    this.releaseFrame(submission)
    this.finishIfConsumed(submission)
    this.deps.accepted(submission.id, submission.at)
  }
  private remove(submission: Submission): void {
    for (const list of [this.waiting, this.acknowledgements]) {
      const index = list.indexOf(submission)
      if (index !== -1) {
        list.splice(index, 1)
      }
    }
    this.releaseFrame(submission)
    this.pending.delete(submission)
  }
  private removeWaiting(submission: Submission): void {
    const index = this.waiting.indexOf(submission)
    if (index !== -1) {
      this.waiting.splice(index, 1)
    }
  }
  private releaseFrame(submission: Submission): void {
    if (submission.frame) {
      this.heldBytes -= submission.bytes
      submission.frame = undefined
    }
  }
  private finishIfConsumed(submission: Submission): void {
    if (!this.waiting.includes(submission) && (this.deps.correlatedPrompts ? submission.acknowledged : !this.acknowledgements.includes(submission))) {
      this.pending.delete(submission)
    }
  }
}
