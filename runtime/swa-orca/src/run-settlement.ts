import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { OrcaRuntimeService } from '../../../third_party/orca-v1.4.230/src/main/runtime/orca-runtime'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import { getOrchestrationMutationExecutor, type OrchestrationMutationExecutor } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-executor'
import { ORCHESTRATION_WORKER_RELEASE_METHODS } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/worker/worker-release'
import { ORCHESTRATION_WORKER_STOP_METHODS } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/worker/worker-stop'
import { getStructuredAgentSessionHost } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-wire/structured-agent-session-registry'
import { replayJournal } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-open'
import { renderJournalState } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-reducer'
import { latestStructuredAgentSessionRequest, latestStructuredAgentSessionAssistantMessage } from '../../../third_party/orca-v1.4.230/src/shared/structured-agent-session-latest-request'
import { authority, controllerScope, recorded } from './controller-scope'
import { invocationSchema, nativeObject, type Invocation, type Scope } from './contracts'
import { readRunTaskTree } from './run-view'
import { readRootResultInventory, readNativeInputStatus, type completeTaskResult } from './task-result'
import { hasQuestionSettlementBlock, hasTaskQuestionSettlementBlock } from './question-ask'

type CompleteResult = Awaited<ReturnType<typeof completeTaskResult>>
type Collector = (scope: Scope, workspaceId: string, dispatchId?: string) => Promise<CompleteResult>
type HandoffDeliver = (invocation: Invocation) => Promise<unknown>
const triggers = new WeakMap<OrcaRuntimeService, (scope: Scope) => void>()
const cleanupGuards = new WeakMap<OrcaRuntimeService, Map<string, () => void>>()
const completionMailSchema = z.object({ schema: z.literal('swa.handoff-completion.v1'), source_task_id: z.string(), source_dispatch_id: z.string(), parent_task_id: z.string(), parent_dispatch_id: z.string(), reply: z.enum(['poll', 'resume']), outcome: z.string(), resume_request_id: z.uuid().nullable() })
function fail(message: string): never { throw new OrchestrationError('operation_unknown', message) }
// 完整回滚的只读前置等待可重新观察；已经可能产生效果的未知状态仍保留原回执。
export class RunSettlementWaiting extends Error {}

export function handoffResumeInvocation(original: Invocation, scope: Scope, mail: { id: string; body: string; handoff: z.infer<typeof completionMailSchema> }): Invocation {
  const h = mail.handoff, marker = `native-handoff:${mail.id}`
  // 新输入沿用原调用者和账号；首次提交、问题工具等字段只属于原操作。
  return invocationSchema.parse({ caller: original.caller, project: original.project, selection: original.selection, context: original.context,
    command: { action: 'worker.send', controller: scope.controller, task_id: scope.root_task_id, dispatch_id: h.parent_dispatch_id, request_id: h.resume_request_id, input_file: marker }, scope,
    input: { path: marker, version: mail.id, text: mail.body }, handoff: { schema: 'swa.handoff-resume.v1', source_task_id: h.source_task_id, source_dispatch_id: h.source_dispatch_id, parent_task_id: h.parent_task_id, parent_dispatch_id: h.parent_dispatch_id, mail_id: mail.id } })
}

export function assertTaskQuestionSettlementReady(runtime: OrcaRuntimeService, scope: Scope, taskId: string, dispatchId: string) {
  if (hasTaskQuestionSettlementBlock(runtime, scope, taskId, dispatchId)) throw new RunSettlementWaiting('The original Task is waiting for its native question')
}

export function requestRunSettlement(runtime: OrcaRuntimeService, scope: Scope) { triggers.get(runtime)?.(scope) }
export function runCleanupApproval(runtime: OrcaRuntimeService, sessionId: string) { return cleanupGuards.get(runtime)?.get(sessionId) }

function nativeTurn(runtime: OrcaRuntimeService, dispatchId: string, scope: Scope) {
  const db = runtime.getOrchestrationDb(), host = getStructuredAgentSessionHost()
  if (!host) fail('The actual structured session host is unavailable')
  const dispatch = db.getDispatchContextById(dispatchId), worker = db.getWorkerDispatch(dispatchId), sessionId = dispatch?.assignee_orca_session_id
  if (!dispatch || !sessionId || worker?.runtime_epoch !== runtime.getRuntimeId()) return null
  if (hasQuestionSettlementBlock(runtime, scope, dispatchId)) return null
  const record = host.deps.store.getRecord(sessionId)
  if (!record) return null
  const journal = host.deps.journalDatabase.db
  const bound = z.object({ count: z.number(), bytes: z.number() }).parse(journal.prepare('SELECT COUNT(*) count,COALESCE(SUM(LENGTH(CAST(row_json AS BLOB))),0) bytes FROM journal_rows WHERE session_id=?').get(sessionId))
  if (bound.count > 100_000 || bound.bytes > 12 * 1024 * 1024) fail('The complete native turn journal exceeds its read bound')
  const replay = replayJournal(journal, sessionId)
  if (!replay || replay.damage || replay.newer) fail('The original native turn journal is unavailable')
  const snapshot = renderJournalState(replay.state), latest = latestStructuredAgentSessionRequest(snapshot.items, snapshot.submissions)
  if (!latest || latest.turnState === 'running' || !latest.outcome || snapshot.submissions.some(row => row.dispatchState === 'pending' || row.dispatchState === 'unknown')) return null
  if (snapshot.items.some(item => (item.body.kind === 'question' || item.body.kind === 'approval') && item.body.resolution.state === 'pending')) return null
  return { dispatch_id: dispatch.id, task_id: dispatch.task_id, session_id: sessionId, turn_id: latest.id, outcome: latest.outcome, epoch: replay.state.epoch, sequence: replay.state.lastSequence, fence: record.lease.runtimeFence, result: latestStructuredAgentSessionAssistantMessage(snapshot.items) }
}

export function validateHandoffInput(runtime: OrcaRuntimeService, invocation: Invocation) {
  if (!invocation.handoff) return
  const db = runtime.getOrchestrationDb(), h = invocation.handoff, c = invocation.command, scope = invocation.scope
  const message = db.getMessageById(h.mail_id), source = db.getTask(h.source_task_id), parent = db.getTask(h.parent_task_id)
  const sourceDispatch = db.getDispatchContextById(h.source_dispatch_id), parentDispatch = db.getDispatchContextById(h.parent_dispatch_id)
  if (!message?.payload || !source || !parent || !sourceDispatch || !parentDispatch) fail('The original handoff source is unavailable')
  const payload = completionMailSchema.parse(JSON.parse(message.payload))
  const execution = db.getMutationReceipt(authority(runtime), `${scope.root_task_id}/native-lifecycle/${source.id}/execution`)
  const evidence = execution?.receipt ? nativeObject(JSON.parse(execution.receipt)) : null
  if (c.action !== 'worker.send' || c.dispatch_id !== h.parent_dispatch_id || c.input_file !== `native-handoff:${h.mail_id}` || invocation.input?.path !== c.input_file || invocation.input.version !== h.mail_id || invocation.input.text !== message.body
    || !message.body || message.run_id !== scope.run_id || message.type !== 'handoff' || message.delivery_contract !== 'audit_only' || message.from_handle !== `dispatch:${h.source_dispatch_id}` || message.to_handle !== `dispatch:${h.parent_dispatch_id}`
    || source.run_id !== scope.run_id || parent.run_id !== scope.run_id || source.parent_id !== parent.id || source.result !== message.body || !['completed', 'failed'].includes(source.status)
    || sourceDispatch.run_id !== scope.run_id || sourceDispatch.task_id !== source.id || !['completed', 'failed', 'circuit_broken'].includes(sourceDispatch.status) || parentDispatch.run_id !== scope.run_id || parentDispatch.task_id !== parent.id
    || execution?.state !== 'completed' || execution.method !== 'swa.runSettle' || evidence?.phase !== 'execution_completed' || evidence.project_id !== scope.project_id || evidence.run_id !== scope.run_id || evidence.root_task_id !== scope.root_task_id || evidence.task_id !== source.id || evidence.mail_id !== message.id || evidence.result !== message.body
    || payload.source_task_id !== source.id || payload.source_dispatch_id !== sourceDispatch.id || payload.parent_task_id !== parent.id || payload.parent_dispatch_id !== parentDispatch.id || payload.reply !== 'resume' || payload.resume_request_id !== c.request_id) fail('The handoff input differs from its original child result and native mailbox')
}

// 真实 journal 完成事件驱动原 Task/Dispatch；原生 mutation executor 保留重复与未知结果。
export function installRunSettlement(runtime: OrcaRuntimeService, collect: Collector, deliver: HandoffDeliver, ownerAlive: () => boolean) {
  const host = getStructuredAgentSessionHost()
  if (!host || triggers.has(runtime)) throw new Error('The Run lifecycle consumer requires one actual structured host')
  const db = runtime.getOrchestrationDb(), executor = getOrchestrationMutationExecutor(runtime), guards = new Map<string, () => void>()
  cleanupGuards.set(runtime, guards)
  let closed = false, queue = Promise.resolve()
  const active = new Set<string>(), changed = new Set<string>()
  const nativeRelease = ORCHESTRATION_WORKER_RELEASE_METHODS.find(method => method.name === 'orchestration.workerRelease')!, nativeStop = ORCHESTRATION_WORKER_STOP_METHODS[0]!
  const runMutation = (method: string, id: string, params: unknown, invoke: Parameters<OrchestrationMutationExecutor['run']>[2]) => executor.run({ id, authToken: '', method, orchestrationRequestId: id }, params, invoke, authority(runtime))
  function workers(scope: Scope) {
    const bound = z.object({ count: z.number(), bytes: z.number() }).parse(db.db.prepare(`SELECT COUNT(*) count,COALESCE(SUM(LENGTH(CAST(d.id||d.task_id||d.run_id AS BLOB))),0) bytes FROM dispatch_contexts d JOIN worker_dispatches w ON w.dispatch_id=d.id WHERE d.run_id=?`).get(scope.run_id))
    if (bound.count > 100_000 || bound.bytes > 12 * 1024 * 1024) fail('The complete lifecycle Worker inventory exceeds its read bound')
    return z.array(z.object({ dispatchId: z.string(), taskId: z.string(), runId: z.string() })).parse(db.db.prepare('SELECT d.id dispatchId,d.task_id taskId,d.run_id runId FROM dispatch_contexts d JOIN worker_dispatches w ON w.dispatch_id=d.id WHERE d.run_id=? ORDER BY d.created_at,d.id').all(scope.run_id))
  }
  function submittedLead(scope: Scope) {
    const opened = recorded(runtime, 'swa.controllerOpen', scope.controller)
    if (opened?.state !== 'completed' || opened.receipt.project_id !== scope.project_id) fail('The original Run submission is unavailable')
    const submission = z.object({ schema: z.literal('swa.run-submission.v1'), worker_request_id: z.uuid() }).parse(opened.receipt.submission)
    const row = db.getMutationReceipt(authority(runtime), submission.worker_request_id)
    if (!row?.receipt || row.state !== 'completed' || row.method !== 'swa.controllerDeliver') fail('The submitted lead Worker receipt is unavailable')
    const receipt = z.object({ project_id: z.string(), controller: z.string(), run_id: z.string(), root_task_id: z.string(), action: z.literal('worker.start'), native: z.object({ taskId: z.string(), dispatchId: z.string() }) }).parse(JSON.parse(row.receipt))
    const task = db.getTask(receipt.native.taskId), dispatch = db.getDispatchContextById(receipt.native.dispatchId)
    if (receipt.project_id !== scope.project_id || receipt.controller !== scope.controller || receipt.run_id !== scope.run_id || receipt.root_task_id !== scope.root_task_id || !task || task.run_id !== scope.run_id || task.parent_id !== scope.root_task_id || !dispatch || dispatch.run_id !== scope.run_id || dispatch.task_id !== task.id) fail('The original Run lead changed its exact task and Dispatch binding')
    return task
  }
  function pending(scope: Scope) {
    return z.object({ count: z.number() }).parse(db.db.prepare(`SELECT COUNT(*) count FROM mutation_receipts WHERE state='pending' AND method NOT IN ('swa.runSettle','orchestration.ask') AND json_valid(receipt)=1 AND (json_extract(receipt,'$.run_id')=? OR json_extract(receipt,'$.scope.run_id')=? OR json_extract(receipt,'$.invocation.scope.run_id')=?)`).get(scope.run_id, scope.run_id, scope.run_id)).count
  }
  function mails(scope: Scope, parentDispatch?: string) {
    const where = `FROM messages WHERE run_id=? AND type='handoff' AND json_valid(payload)=1 AND json_extract(payload,'$.schema')='swa.handoff-completion.v1'${parentDispatch ? ' AND to_handle=?' : ''}`, args = parentDispatch ? [scope.run_id, `dispatch:${parentDispatch}`] : [scope.run_id]
    const bound = z.object({ count: z.number(), bytes: z.number() }).parse(db.db.prepare(`SELECT COUNT(*) count,COALESCE(SUM(LENGTH(CAST(payload||body AS BLOB))),0) bytes ${where}`).get(...args))
    if (bound.count > 100_000 || bound.bytes > 12 * 1024 * 1024) fail('The complete handoff mailbox exceeds its read bound')
    return z.array(z.object({ id: z.string(), payload: z.string(), read: z.number() })).parse(db.db.prepare(`SELECT id,payload,read ${where} ORDER BY sequence`).all(...args)).map(row => ({ ...row, handoff: completionMailSchema.parse(JSON.parse(row.payload)) }))
  }
  async function cleanup(scope: Scope, dispatchId: string, sessionId: string, requestId: string, stop: boolean) {
    const resource = db.getWorkerTerminalResourceByOwner(dispatchId), record = host!.deps.store.getRecord(sessionId)
    if (!resource || !record) fail('The original Worker cleanup identity is unavailable')
    if (resource.release_state === 'released') return
    const run = db.getRun(scope.run_id)
    const verify = () => {
      if (hasQuestionSettlementBlock(runtime, scope, dispatchId)) fail('The original Worker still has an unanswered or unread native question')
      const current = host!.deps.store.getRecord(sessionId), currentResource = db.getWorkerTerminalResourceByOwner(dispatchId), dispatch = db.getDispatchContextById(dispatchId)
      if (!ownerAlive() || !current || current.lease.runtimeFence !== record.lease.runtimeFence || !isDeepStrictEqual(current.lease.ownerProcess, record.lease.ownerProcess) || !dispatch || dispatch.run_id !== scope.run_id || dispatch.assignee_orca_session_id !== sessionId || !currentResource || currentResource.id !== resource.id || currentResource.owner_dispatch_id !== dispatchId || currentResource.process_incarnation !== resource.process_incarnation || currentResource.ownership_state !== 'owned' || db.getWorkerDispatch(dispatchId)?.runtime_epoch !== runtime.getRuntimeId() || db.getRun(scope.run_id)?.consumer_generation !== run?.consumer_generation) fail('The original Worker cleanup identity changed')
    }
    verify(); guards.set(sessionId, verify)
    try {
      const method = stop ? nativeStop : nativeRelease
      const receipt = nativeObject(await runMutation(method.name, requestId, { dispatch: dispatchId }, mutation => method.handler({ dispatch: dispatchId }, { runtime, orchestrationMutation: mutation?.identity })))
      if (stop ? receipt.state !== 'stopped' : receipt.state !== 'released' && receipt.state !== 'already_released') fail('The actual native Worker cleanup remains unconfirmed')
    } finally { guards.delete(sessionId) }
  }
  async function resume(scope: Scope, mail: ReturnType<typeof mails>[number]) {
    const h = mail.handoff
    if (h.reply !== 'resume' || !h.resume_request_id || mail.read) return
    const prior = db.getMutationReceipt(authority(runtime), h.resume_request_id)
    if (prior) {
      if (prior.method !== 'swa.controllerDeliver' || prior.state !== 'completed') fail('The original parent continuation remains pending; automatic resend is forbidden')
      const status = await readNativeInputStatus(runtime, scope.project_id, h.resume_request_id)
      if (status.state === 'rejected' || status.state === 'unknown') fail('The actual parent continuation was rejected or remains unknown')
      return
    }
    const starts = z.array(z.object({ receipt: z.string() })).parse(db.db.prepare(`SELECT receipt FROM mutation_receipts WHERE method='swa.controllerDeliver' AND state='completed' AND caller_fingerprint=? AND json_valid(receipt)=1 AND json_extract(receipt,'$.action')='worker.start' AND json_extract(receipt,'$.run_id')=? AND json_extract(receipt,'$.native.dispatchId')=?`).all(authority(runtime), scope.run_id, h.parent_dispatch_id))
    if (starts.length !== 1) fail('The original parent Worker input authorization is unavailable')
    const original = invocationSchema.parse(nativeObject(JSON.parse(starts[0]!.receipt)).invocation), message = db.getMessageById(mail.id)!
    const invocation = handoffResumeInvocation(original, scope, { ...mail, body: message.body })
    validateHandoffInput(runtime, invocation)
    await deliver(invocation)
  }
  async function settle(scope: Scope) {
    if (!ownerAlive() || closed) return
    const owned = controllerScope(runtime, scope.project_id, scope.controller, { history: true })
    if (owned.scope.run_id !== scope.run_id || owned.scope.root_task_id !== scope.root_task_id) fail('The Run lifecycle scope changed')
    const initial = readRunTaskTree(db, scope), fixed = z.object({ execution_policy: z.string().optional(), spec: z.object({ initial_workers: z.number().int().positive().optional() }) }).parse(JSON.parse(initial.root.spec))
    if (fixed.execution_policy !== 'complete_native_turns' || ['completed', 'failed'].includes(initial.root.status) || initial.tasks.length - 1 < (fixed.spec.initial_workers ?? 1) || pending(scope)) return
    const base = `${scope.root_task_id}/native-lifecycle`
    for (const mail of mails(scope)) await resume(scope, mail)
    for (const worker of workers(scope)) {
      if (hasQuestionSettlementBlock(runtime, scope, worker.dispatchId)) continue
      const task = db.getTask(worker.taskId)!
      if (['completed', 'failed'].includes(task.status)) {
        const session = db.getDispatchContextById(worker.dispatchId)?.assignee_orca_session_id
        if (session) await cleanup(scope, worker.dispatchId, session, `${base}/${worker.dispatchId}/release`, false)
        continue
      }
      const tree = readRunTaskTree(db, scope)
      if (tree.tasks.some(child => child.parent_id === task.id && !['completed', 'failed'].includes(child.status)) || pending(scope)) continue
      if (hasTaskQuestionSettlementBlock(runtime, scope, task.id, worker.dispatchId)) continue
      const received = mails(scope, worker.dispatchId).filter(mail => mail.handoff.reply === 'resume')
      if (received.some(mail => !mail.handoff.resume_request_id || db.getMutationReceipt(authority(runtime), mail.handoff.resume_request_id)?.state !== 'completed')) continue
      let turn = nativeTurn(runtime, worker.dispatchId, scope)
      if (!turn) continue
      if (turn.outcome !== 'success' && db.getWorkerDispatch(worker.dispatchId)?.state !== 'stopped') await cleanup(scope, worker.dispatchId, turn.session_id, `${base}/${worker.dispatchId}/stop`, true)
      turn = nativeTurn(runtime, worker.dispatchId, scope)
      if (!turn) fail('The native terminal changed during its cleanup')
      const complete = await collect(scope, owned.owner.worktree_id, worker.dispatchId), output = complete.workers[0]
      const actual = z.object({ availability: z.string(), final: z.object({ text: z.string() }).nullable().optional() }).parse(output?.native_session)
      if (!output || turn.outcome === 'success' && (actual.availability !== 'complete' || !actual.final?.text)) fail('The native turn has no complete actual delivery')
      const result = actual.final?.text ?? turn.result, inventory = readRootResultInventory(db, scope, workers(scope)).signature
      const assignment = task.spec.startsWith('{') ? z.object({ schema: z.literal('swa.handoff-task.v1'), handoff: z.object({ reply: z.enum(['resume', 'poll']), requester_dispatch_id: z.string().nullable(), parent_task_id: z.string() }) }).safeParse(JSON.parse(task.spec)) : null
      const handoff = assignment?.success ? assignment.data.handoff : null
      try { await runMutation('swa.runSettle', `${base}/${task.id}/execution`, { scope, turn }, mutation => {
        if (!mutation) fail('The native Run settlement identity is unavailable')
        db.db.exec('BEGIN IMMEDIATE')
        try {
          assertTaskQuestionSettlementReady(runtime, scope, task.id, worker.dispatchId)
          if (!ownerAlive() || !isDeepStrictEqual(nativeTurn(runtime, worker.dispatchId, scope), turn) || pending(scope) || readRootResultInventory(db, scope, workers(scope)).signature !== inventory) throw new RunSettlementWaiting('The Run changed before its execution settlement')
          if (turn.outcome === 'success') {
            const settled = db.settleWorkerReportInTransaction({ taskId: task.id, dispatchId: worker.dispatchId, outcome: 'succeeded', result })
            if (settled.action !== 'settled') fail('The original Worker lifecycle refused its observed native completion')
          } else db.updateTaskStatus(task.id, 'failed', result)
          for (const mail of received) db.markAsReadAndDelivered([mail.id])
          let mailId: string | null = null
          if (handoff?.requester_dispatch_id) {
            const parent = db.getDispatchContextById(handoff.requester_dispatch_id)
            if (!parent || parent.run_id !== scope.run_id || parent.task_id !== task.parent_id || handoff.parent_task_id !== task.parent_id) fail('The original handoff parent changed')
            const payload = { schema: 'swa.handoff-completion.v1', source_task_id: task.id, source_dispatch_id: worker.dispatchId, parent_task_id: parent.task_id, parent_dispatch_id: parent.id, reply: handoff.reply, outcome: turn.outcome, acceptance: 'unreviewed', resume_request_id: handoff.reply === 'resume' ? randomUUID() : null }
            mailId = `${task.id}/completed`
            db.insertMessage({ id: mailId, runId: scope.run_id, from: `dispatch:${worker.dispatchId}`, to: `dispatch:${parent.id}`, type: 'handoff', deliveryContract: 'audit_only', subject: 'SWA child execution completed', body: result, payload: JSON.stringify(payload) })
          }
          const receipt = { project_id: scope.project_id, controller: scope.controller, run_id: scope.run_id, root_task_id: scope.root_task_id, task_id: task.id, phase: 'execution_completed', acceptance: 'unreviewed', turn, result, mail_id: mailId }
          mutation.recordReceipt(receipt); db.db.exec('COMMIT'); return receipt
        } catch (error) { db.db.exec('ROLLBACK'); throw error }
      }) } catch (error) { if (error instanceof RunSettlementWaiting) continue; throw error }
      changed.add(scope.run_id)
      await cleanup(scope, worker.dispatchId, turn.session_id, `${base}/${worker.dispatchId}/release`, false)
      for (const mail of mails(scope)) await resume(scope, mail)
    }
    const tree = readRunTaskTree(db, scope)
    if (pending(scope) || hasQuestionSettlementBlock(runtime, scope) || tree.tasks.some(task => task.id !== scope.root_task_id && !['completed', 'failed'].includes(task.status))) return
    const complete = await collect(scope, owned.owner.worktree_id), fleet = workers(scope), inventory = readRootResultInventory(db, scope, fleet).signature
    try { await runMutation('swa.runSettle', `${base}/delivery`, { scope }, mutation => {
      if (!mutation) fail('The original native delivery settlement identity is unavailable')
      db.db.exec('BEGIN IMMEDIATE')
      try {
        if (hasQuestionSettlementBlock(runtime, scope)) throw new RunSettlementWaiting('The original Run is waiting for its native question')
        if (!ownerAlive() || pending(scope) || readRootResultInventory(db, scope, fleet).signature !== inventory) throw new RunSettlementWaiting('The complete Run changed before delivery settlement')
        const actual = readRunTaskTree(db, scope)
        if (actual.tasks.some(task => task.id !== scope.root_task_id && !['completed', 'failed'].includes(task.status)) || fleet.some(row => db.getWorkerTerminalResourceByOwner(row.dispatchId)?.release_state !== 'released')) throw new RunSettlementWaiting('The Run still has an incomplete descendant or retained Worker')
        const lead = submittedLead(scope), text = actual.tasks.filter(task => task.id !== scope.root_task_id).map(task => `${task.title ?? task.id}\n\n${task.result ?? ''}`).join('\n\n')
        db.updateTaskStatus(scope.root_task_id, lead.status === 'completed' ? 'completed' : 'failed', text)
        const observation = db.getMessageById(`${base}/unconfirmed`)
        if (observation) db.markAsReadAndDelivered([observation.id])
        const receipt = { project_id: scope.project_id, controller: scope.controller, run_id: scope.run_id, root_task_id: scope.root_task_id, phase: 'delivery_completed', acceptance: 'unreviewed', workers: complete.workers.map(row => row.worker.dispatchId) }
        mutation.recordReceipt(receipt); db.db.exec('COMMIT'); return receipt
      } catch (error) { db.db.exec('ROLLBACK'); throw error }
    }) } catch (error) { if (error instanceof RunSettlementWaiting) return; throw error }
  }
  const trigger = (scope: Scope) => {
    if (closed) return
    if (active.has(scope.run_id)) { changed.add(scope.run_id); return }
    active.add(scope.run_id)
    queue = queue.then(() => settle(scope)).catch(error => {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(JSON.stringify({ code: 'swa_run_settlement_unconfirmed', run_id: scope.run_id, message }) + '\n')
      const id = `${scope.root_task_id}/native-lifecycle/unconfirmed`
      if (ownerAlive() && db.getRun(scope.run_id) && !db.getMessageById(id)) db.insertMessage({ id, runId: scope.run_id, from: 'swa-native-run-lifecycle', to: scope.controller, type: 'escalation', deliveryContract: 'audit_only', subject: 'Run lifecycle requires confirmation', body: message, payload: JSON.stringify({ schema: 'swa.run-lifecycle-observation.v1', root_task_id: scope.root_task_id, code: 'swa_run_settlement_unconfirmed' }) })
    })
      .finally(() => { active.delete(scope.run_id); if (changed.delete(scope.run_id)) trigger(scope) })
  }
  triggers.set(runtime, trigger)
  const unsubscribe = host.subscribeTurnCompletions({ id: 'swa-native-run-lifecycle', emit: event => {
    if (event.type !== 'completion' || event.completion.awaitingUser) return
    const rows = z.array(z.object({ receipt: z.string() })).parse(db.db.prepare(`SELECT m.receipt FROM mutation_receipts m JOIN dispatch_contexts d ON d.run_id=json_extract(m.receipt,'$.run_id') WHERE m.method='swa.taskCreate' AND m.state='completed' AND json_valid(m.receipt)=1 AND d.assignee_orca_session_id=?`).all(event.completion.sessionId))
    if (rows.length !== 1) return
    const receipt = nativeObject(JSON.parse(rows[0]!.receipt))
    trigger(controllerScope(runtime, z.string().parse(receipt.project_id), z.string().parse(receipt.controller), { history: true }).scope)
  } })
  return async () => { closed = true; unsubscribe(); triggers.delete(runtime); await queue; cleanupGuards.delete(runtime) }
}
