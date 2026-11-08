// One provider event's journal writes, admitted as a single sink operation.
//
// A producer that keeps state about what it wrote must change that state only for writes the sink
// took; when an event needs several rows, a refusal of the third after the first two were taken
// would leave the producer and the journal disagreeing. A transition is admitted whole or not at
// all. At execution its steps run as one turn in the journal's write queue, each resolved against
// the fold with every earlier write landed (the steps before it included), so what a step writes
// is decided by the journal, not by memory. Admitted whole, executed as a prefix: once a step
// fails, the steps after it never run, the steps before it stay written, and the sink fails.

import type {
  AgentJournalItemBody,
  AgentJournalItemIdentity
} from '../../../shared/agent-session-journal-types'
import type { JournalLifecycleMutationInput } from '../agent-session-journal/journal-row-builders'
import type { AgentSessionJournal } from '../agent-session-journal/journal-store'
import type { JournalStep } from '../agent-session-journal/journal-step-writer'
import { estimateStructuredAgentSessionItemBytes } from './structured-agent-session-event-sink-estimate'
import type {
  StructuredAgentSessionItemAppendOptions,
  StructuredAgentSessionSinkAdmission
} from './structured-agent-session-event-sink'
import type { StructuredAgentSessionSinkQueue } from './structured-agent-session-event-sink-queue'
import { structuredAgentSessionJournalAppendOptions } from './structured-agent-session-journal-append-options'
import { agentJournalItemKey } from '../../../shared/agent-session-journal-item-key'

export type ProviderTimelinePublishedReport = {
  journalEpoch: string
  published: boolean
  steps: readonly (
    | { kind: 'item'; written: boolean; itemId: string | null }
    | { kind: 'settlement'; written: boolean; settlementId: string }
  )[]
}

/** What a transition step reads: rows by key, every row, and the turns they joined. */
export type StructuredAgentSessionTransitionJournal = Pick<
  AgentSessionJournal,
  'epoch' | 'visitItems' | 'itemBody' | 'item' | 'visitItemsWithLinkage'
>

export type StructuredAgentSessionTransitionStep =
  | {
      kind: 'item'
      /** Bounds what `resolve` may write; a larger write fails the sink. */
      reservedBytes: number
      /** The row and its whole body; null writes nothing. */
      resolve: (journal: StructuredAgentSessionTransitionJournal) => {
        identity: AgentJournalItemIdentity
        body: AgentJournalItemBody
      } | null
      options: StructuredAgentSessionItemAppendOptions
    }
  | {
      kind: 'settlement'
      /** Unique per settlement: the journal applies one id once. */
      settlementId: string
      recovered?: true
      /** Paces the queue only; the mutations are the journal's to choose. */
      reservedBytes: number
      /** Read at execution; none writes nothing. */
      resolve: (
        journal: StructuredAgentSessionTransitionJournal
      ) => readonly JournalLifecycleMutationInput[]
    }

export type StructuredAgentSessionTransition = {
  steps: readonly StructuredAgentSessionTransitionStep[]
  /** Rides the sink's lifecycle budget: it ends or settles something. */
  lifecycle: boolean
  /** Internal admission only, for a provider's bounded tail after finalization. */
  finalTail?: true
  /** Announce the writes once they land, when any step wrote. */
  publish: boolean
  /** Host-internal delivery after these writes and their parent publication, in queue order. */
  onPublished?: (report: ProviderTimelinePublishedReport) => void
}

const STEP_OVERFLOW = 'structured agent-session transition step exceeded its reserved size'

/** The sink members a transition writer uses. */
export type StructuredAgentSessionTransitionSink = {
  /** Queues one event's writes as a single admitted operation. */
  tryAppendTransition?(
    transition: StructuredAgentSessionTransition
  ): StructuredAgentSessionSinkAdmission
  /** The bound journal's rows as they stand now; null until bound. */
  journalItems?(): StructuredAgentSessionTransitionJournal | null
}

export function createStructuredAgentSessionTransitionMembers(
  queue: StructuredAgentSessionSinkQueue
): Required<StructuredAgentSessionTransitionSink> {
  return { tryAppendTransition: transitionAppend(queue), journalItems: queue.journalItems }
}

function transitionAppend(
  queue: StructuredAgentSessionSinkQueue
): (transition: StructuredAgentSessionTransition) => StructuredAgentSessionSinkAdmission {
  return (transition) =>
    queue.submit({
      bytes:
        transition.steps.reduce((total, step) => total + step.reservedBytes, 0) +
        (transition.publish ? 1 : 0),
      lifecycle: transition.lifecycle,
      finalTail: transition.finalTail,
      run: async (bound) => {
        const { journal, fence } = bound
        const journalEpoch = journal.epoch
        const steps = [...transition.steps]
        const resolvedItemIds: (string | null)[] = steps.map(() => null)
        const wrote = await journal.appendSteps(
          steps.map((step, index): JournalStep =>
            step.kind === 'item'
              ? {
                  kind: 'item',
                  resolve: () => {
                    const resolved = step.resolve(journal)
                    resolvedItemIds[index] = resolved ? agentJournalItemKey(resolved.identity) : null
                    if (
                      resolved &&
                      estimateStructuredAgentSessionItemBytes(resolved.identity, resolved.body) >
                        step.reservedBytes
                    ) {
                      throw new Error(STEP_OVERFLOW)
                    }
                    return resolved
                  },
                  options: structuredAgentSessionJournalAppendOptions(fence, step.options)
                }
              : {
                  kind: 'settlement',
                  batch: {
                    settlementId: step.settlementId,
                    fence,
                    ownerFence: fence,
                    recovered: step.recovered,
                    resolve: () => step.resolve(journal)
                  }
                }
          )
        )
        if (journal.epoch !== journalEpoch || wrote.length !== steps.length) {
          throw new Error('Structured transition publication source changed')
        }
        const published = transition.publish && wrote.includes(true)
        if (published) {
          bound.publish()
        }
        transition.onPublished?.({
          journalEpoch,
          published,
          steps: steps.map((step, index) => step.kind === 'item'
            ? { kind: 'item', written: wrote[index] === true, itemId: wrote[index] === true ? resolvedItemIds[index]! : null }
            : { kind: 'settlement', written: wrote[index] === true, settlementId: step.settlementId })
        })
      }
    })
}
