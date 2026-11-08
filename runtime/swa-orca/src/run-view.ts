import { z } from 'zod'
import type { OrchestrationDb } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/db'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import type { OrchestrationMutationExecutor } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-executor'
import { getPendingWorkerStartRecovery } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-receipt'
import { approvedWorkerLimit } from './task-budget'
import type { QuestionObservation, QuestionReadState } from './question-ask'

type RunScope = { project_id: string; controller: string; run_id: string; root_task_id: string }
type RunExecution = { executor: OrchestrationMutationExecutor; runtimeEpoch: string; questions?: () => QuestionObservation[] }
const mutationSchema = z.object({ caller_fingerprint: z.string(), request_id: z.string(), method: z.string(), payload_hash: z.string(), receipt: z.string() })
const mutationIdentity = (row: z.infer<typeof mutationSchema>) => ({ callerFingerprint: row.caller_fingerprint, requestId: row.request_id, method: row.method, payloadHash: row.payload_hash })
const taskSchema = z.object({
  id: z.string(), run_id: z.string(), parent_id: z.string().nullable(),
  task_title: z.string().nullable(), status: z.enum(['pending', 'ready', 'dispatched', 'completed', 'failed', 'blocked']),
  deps: z.string(), result: z.string().nullable()
})
const dispatchSchema = z.object({
  id: z.string(), task_id: z.string(), status: z.enum(['pending', 'dispatched', 'completed', 'failed', 'circuit_broken']),
  creator_dispatch_id: z.string().nullable(), assignee_orca_session_id: z.string().nullable(),
  worker_state: z.enum(['starting', 'ready', 'start_unknown', 'failed', 'succeeded', 'stopping', 'stop_unknown', 'stopped', 'abandoned']).nullable(),
  release_state: z.string().nullable(), runtime_epoch: z.string().nullable()
})
const terminalTask = (status: string) => status === 'completed' || status === 'failed'

// 使用已读事务快照，导出成功不改变执行状态或人工验收状态。
export function recordedRunResults(view: RunView) {
  const tasks = view.tasks.map(task => ({ task_id: task.id, status: task.status,
    availability: task.result === null ? 'missing' as const : 'available' as const,
    result: task.result }))
  return { schema: 'swa.recorded-results.v1' as const, source: 'native_task_records' as const,
    run_id: view.run_id, root_task_id: view.root_task_id, status: view.status,
    complete: view.complete, acceptance: view.acceptance, observed_at: view.observed_at,
    completeness: tasks.every(task => task.availability === 'available') ? 'complete' as const : 'partial' as const,
    audit: 'not_requested' as const, tasks }
}
const terminalDispatch = (status: string) => ['completed', 'failed', 'circuit_broken'].includes(status)
function fail(message: string): never { throw new OrchestrationError('evidence_missing', message) }

export function isTaskDescendant(db: OrchestrationDb, runId: string, rootId: string, taskId: string) {
  const visited = new Set<string>()
  let current = db.getTask(taskId)
  if (!current || taskId === rootId) return false
  while (current && current.id !== rootId) {
    if (current.run_id !== runId || !current.parent_id || visited.has(current.id)) return false
    visited.add(current.id)
    current = db.getTask(current.parent_id)
  }
  return current?.id === rootId && current.run_id === runId && current.parent_id === null
}

export type RunView = {
  schema: 'swa.run-view.v1'
  controller: string; run_id: string; root_task_id: string
  status: 'active' | 'waiting_input' | 'blocked' | 'completed' | 'failed' | 'unknown'
  root: { id: string; status: string; result: string | null }
  tasks: { id: string; parent_id: string | null; status: string; title: string | null; dependencies: string[]; result: string | null }[]
  dispatches: { id: string; task_id: string; status: string; worker_state: string | null; release_state: string | null; creator_dispatch_id: string | null; recipient_session_id: string | null }[]
  questions: { id: string; task_id: string; dispatch_id: string; question: string }[]
  answered_questions: { question_id: string; task_id: string; dispatch_id: string; question: string; answer_message_id: string; answer: string; answered_by_generation: number; answered_at: string; read_state: QuestionReadState; continuation_required: boolean }[]
  handoffs: { id: string; from: string; to: string; text: string; read: boolean; record: Record<string, unknown> }[]
  blockers: { kind: string; task_id: string | null; dispatch_id: string | null; reason: string }[]
  failures: { task_id: string; dispatch_id?: string; reason: string }[]
  deliverables: { task_id: string; dispatch_id?: string; kind: 'result'; available: boolean }[]
  complete: boolean
  acceptance: 'unreviewed'
  observed_at: string
}

// 原生 Run 的完整 parent/dependency 库存是递归范围；无分页截断或独立状态表。
export function readRunTaskTree(db: OrchestrationDb, scope: RunScope) {
  const bound = z.object({ count: z.number().int(), bytes: z.number() }).parse(db.db.prepare(`SELECT COUNT(*) AS count,
    COALESCE(SUM(LENGTH(CAST(id||run_id||COALESCE(parent_id,'')||status||spec||COALESCE(result,'')||deps||COALESCE(task_title,'') AS BLOB))),0) AS bytes
    FROM tasks WHERE run_id=?`).get(scope.run_id))
  if (bound.count > 100_000 || bound.bytes > 12 * 1024 * 1024) fail('The complete native task inventory exceeds the read bound')
  const run = db.getRun(scope.run_id), root = db.getTask(scope.root_task_id)
  if (!run || !root || root.run_id !== run.id || root.parent_id !== null) fail('The exact native Run/root task is unavailable')
  const limit = approvedWorkerLimit(root, scope)
  const rows = z.array(taskSchema).parse(db.db.prepare(`SELECT id,run_id,parent_id,task_title,status,deps,result
    FROM tasks WHERE run_id=? ORDER BY created_at,id`).all(scope.run_id))
  if (rows.length !== bound.count || rows.length - 1 > limit) fail('The complete task inventory exceeds the approved Worker capacity')
  const byId = new Map(rows.map(row => [row.id, row]))
  if (byId.size !== rows.length || !byId.has(scope.root_task_id)) fail('The native task inventory is not unique and complete')
  const resolved = new Set([scope.root_task_id])
  for (const row of rows) {
    const visiting = new Set<string>()
    let current = row
    while (!resolved.has(current.id)) {
      if (visiting.has(current.id) || !current.parent_id) fail('The native task tree has a cycle or another root')
      visiting.add(current.id)
      const parent = byId.get(current.parent_id)
      if (!parent) fail('The native task tree has an orphan or cross-Run parent')
      current = parent
    }
    for (const id of visiting) resolved.add(id)
  }
  const tasks = rows.map(row => {
    const dependencies = z.array(z.string().min(1)).parse(JSON.parse(row.deps))
    if (new Set(dependencies).size !== dependencies.length || dependencies.some(id => !byId.has(id) || id === row.id)) fail('A native task dependency is missing, repeated or outside this Run')
    return { id: row.id, parent_id: row.parent_id, status: row.status, title: row.task_title, dependencies, result: row.result }
  })
  const remaining = new Map(tasks.map(task => [task.id, new Set(task.dependencies)]))
  const dependants = new Map<string, string[]>()
  for (const task of tasks) for (const dependency of task.dependencies) {
    const entries = dependants.get(dependency) ?? []
    entries.push(task.id)
    dependants.set(dependency, entries)
  }
  const ready = tasks.filter(task => task.dependencies.length === 0).map(task => task.id)
  for (let index = 0; index < ready.length; index++) for (const id of dependants.get(ready[index]!) ?? []) {
    const pending = remaining.get(id)!
    pending.delete(ready[index]!)
    if (pending.size === 0) ready.push(id)
  }
  if (ready.length !== tasks.length) fail('The native task dependency graph contains a cycle')
  return { run, root, tasks }
}

export function readRunView(db: OrchestrationDb, scope: RunScope, execution?: RunExecution): RunView {
  if (db.db.isTransaction) throw new OrchestrationError('operation_in_progress', 'A Run view requires its own consistent read transaction')
  db.db.exec('BEGIN')
  try {
    const { root, tasks } = readRunTaskTree(db, scope)
    const ids = new Set(tasks.map(task => task.id))
    const dispatchBound = z.object({ count: z.number().int(), bytes: z.number() }).parse(db.db.prepare(`SELECT COUNT(*) AS count,
      COALESCE(SUM(LENGTH(CAST(d.id || d.task_id || d.status || COALESCE(d.creator_dispatch_id,'') || COALESCE(d.assignee_orca_session_id,'') || COALESCE(w.state,'') || COALESCE(w.runtime_epoch,'') || COALESCE(r.release_state,'') AS BLOB))),0) AS bytes
      FROM dispatch_contexts d LEFT JOIN worker_dispatches w ON w.dispatch_id=d.id
      LEFT JOIN worker_terminal_resources r ON r.owner_dispatch_id=d.id WHERE d.run_id=?`).get(scope.run_id))
    if (dispatchBound.count > 100_000 || dispatchBound.bytes > 12 * 1024 * 1024) fail('The complete native Dispatch inventory exceeds its read bound')
    const dispatches = z.array(dispatchSchema).parse(db.db.prepare(`SELECT d.id,d.task_id,d.status,d.creator_dispatch_id,d.assignee_orca_session_id,
      w.state AS worker_state,w.runtime_epoch,r.release_state FROM dispatch_contexts d
      LEFT JOIN worker_dispatches w ON w.dispatch_id=d.id
      LEFT JOIN worker_terminal_resources r ON r.owner_dispatch_id=d.id
      WHERE d.run_id=? ORDER BY d.created_at,d.id`).all(scope.run_id))
    if (dispatches.length > 100_000 || new Set(dispatches.map(row => row.id)).size !== dispatches.length || dispatches.some(row => !ids.has(row.task_id))) fail('The complete native Dispatch inventory differs from its task tree')
    const dispatchIds = new Set(dispatches.map(row => row.id))
    const dispatchById = new Map(dispatches.map(row => [row.id, row]))
    if (dispatches.some(row => row.creator_dispatch_id !== null && !dispatchIds.has(row.creator_dispatch_id))) fail('A native Dispatch creator is outside this Run')
    const questionBound = z.object({ count: z.number().int(), bytes: z.number() }).parse(db.db.prepare(`SELECT COUNT(*) AS count,
      COALESCE(SUM(LENGTH(CAST(q.message_id || q.dispatch_id || COALESCE(d.task_id,'') || COALESCE(m.body,'') || COALESCE(q.answer_message_id,'') || COALESCE(q.answer_body,'') || COALESCE(a.body,'') AS BLOB))),0) AS bytes
      FROM question_threads q LEFT JOIN dispatch_contexts d ON d.id=q.dispatch_id LEFT JOIN messages m ON m.id=q.message_id LEFT JOIN messages a ON a.id=q.answer_message_id
      WHERE q.run_id=? AND q.status IN ('pending','answered')`).get(scope.run_id))
    if (questionBound.count > 100_000 || questionBound.bytes > 12 * 1024 * 1024) fail('The complete native question inventory exceeds its read bound')
    const questions = z.array(z.object({ id: z.string(), task_id: z.string(), dispatch_id: z.string(), question: z.string() })).parse(db.db.prepare(`SELECT q.message_id AS id,d.task_id,q.dispatch_id,m.body AS question
      FROM question_threads q LEFT JOIN dispatch_contexts d ON d.id=q.dispatch_id LEFT JOIN messages m ON m.id=q.message_id
      WHERE q.run_id=? AND q.status='pending' ORDER BY q.created_at,q.message_id`).all(scope.run_id))
    if (questions.some(row => !ids.has(row.task_id) || !dispatchIds.has(row.dispatch_id))) fail('A pending native question belongs to another task tree')
    const answers = z.array(z.object({ question_id: z.string(), task_id: z.string(), dispatch_id: z.string(), question: z.string(), answer_message_id: z.string(), answer: z.string(), answered_by_generation: z.number().int().nonnegative(), answer_body: z.string(), thread_id: z.string(), answer_run_id: z.string(), from_handle: z.string(), to_handle: z.string(), question_run_id: z.string(), question_from: z.string(), question_to: z.string(), question_thread: z.string() })).parse(db.db.prepare(`SELECT q.message_id AS question_id,d.task_id,q.dispatch_id,m.body AS question,q.answer_message_id,a.body AS answer,q.answered_by_generation,q.answer_body,a.thread_id,a.run_id AS answer_run_id,a.from_handle,a.to_handle,m.run_id AS question_run_id,m.from_handle AS question_from,m.to_handle AS question_to,m.thread_id AS question_thread
      FROM question_threads q LEFT JOIN dispatch_contexts d ON d.id=q.dispatch_id LEFT JOIN messages m ON m.id=q.message_id LEFT JOIN messages a ON a.id=q.answer_message_id
      WHERE q.run_id=? AND q.status='answered' ORDER BY q.created_at,q.message_id`).all(scope.run_id))
    if (questions.length + answers.length !== questionBound.count || new Set([...questions.map(row => row.id), ...answers.map(row => row.question_id)]).size !== questionBound.count) fail('The complete native question inventory is inconsistent')
    const nativeQuestions = execution?.questions?.() ?? []
    const answered_questions = answers.map(row => {
      if (!ids.has(row.task_id) || !dispatchIds.has(row.dispatch_id) || row.thread_id !== row.question_id || row.answer_run_id !== scope.run_id || row.answer_body !== row.answer || row.from_handle !== `run:${scope.run_id}` || row.to_handle !== `dispatch:${row.dispatch_id}` || row.question_run_id !== scope.run_id || row.question_from !== `dispatch:${row.dispatch_id}` || row.question_to !== `run:${scope.run_id}` || row.question_thread !== row.question_id) fail('An answered native question has a mismatched original message or task binding')
      const question = db.getQuestion(row.question_id)
      if (!question?.answered_at) fail('The original answer timestamp is unavailable')
      const observed = nativeQuestions.find(value => value.question_id === row.question_id)
      return { question_id: row.question_id, task_id: row.task_id, dispatch_id: row.dispatch_id, question: row.question, answer_message_id: row.answer_message_id, answer: row.answer, answered_by_generation: row.answered_by_generation, answered_at: question.answered_at, read_state: observed?.read_state ?? 'read_unconfirmed' as const, continuation_required: observed?.continuation_required ?? false }
    })
    const pendingWhere = `FROM mutation_receipts WHERE state='pending' AND json_valid(receipt)=1 AND
      (json_extract(receipt,'$.run_id')=? OR json_extract(receipt,'$.scope.run_id')=? OR json_extract(receipt,'$.invocation.scope.run_id')=?)`
    const pendingBound = z.object({ count: z.number().int(), bytes: z.number() }).parse(db.db.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(LENGTH(CAST(caller_fingerprint||request_id||method||payload_hash||receipt AS BLOB))),0) AS bytes ${pendingWhere}`).get(scope.run_id, scope.run_id, scope.run_id))
    if (pendingBound.count > 100_000 || pendingBound.bytes > 12 * 1024 * 1024) fail('The complete native request inventory exceeds its read bound')
    const pending = z.array(mutationSchema).parse(db.db.prepare(`SELECT caller_fingerprint,request_id,method,payload_hash,receipt ${pendingWhere} ORDER BY request_id`).all(scope.run_id, scope.run_id, scope.run_id))
    const active = new Set(pending.filter(row => execution?.executor.isExecuting(mutationIdentity(row))))
    const starting = new Set<string>(), children: z.infer<typeof mutationSchema>[] = []
    let pendingBytes = pendingBound.bytes
    for (const parent of pending) {
      if (parent.method !== 'swa.controllerDeliver') continue
      const source = z.object({ action: z.string(), project_id: z.string(), controller: z.string(), run_id: z.string(), root_task_id: z.string(), child_request: z.string() }).parse(JSON.parse(parent.receipt))
      if (source.project_id !== scope.project_id || source.controller !== scope.controller || source.run_id !== scope.run_id || source.root_task_id !== scope.root_task_id || source.child_request !== `${parent.request_id}/native`) fail('The original pending delivery left this Run scope')
      if (source.action !== 'worker.start') continue
      const bound = z.object({ method: z.string(), state: z.string(), bytes: z.number() }).optional().parse(db.db.prepare(`SELECT method,state,LENGTH(CAST(caller_fingerprint||request_id||method||payload_hash||COALESCE(receipt,'') AS BLOB)) bytes
        FROM mutation_receipts WHERE caller_fingerprint=? AND request_id=?`).get(parent.caller_fingerprint, source.child_request))
      if (!bound) continue
      if (bound.method !== 'orchestration.workerStart') fail('The original Worker child request has another method')
      if (bound.state !== 'pending') continue
      pendingBytes += bound.bytes
      if (pending.length + children.length + 1 > 100_000 || pendingBytes > 12 * 1024 * 1024) fail('The complete native request inventory exceeds its read bound')
      const child = mutationSchema.parse(db.getMutationReceipt(parent.caller_fingerprint, source.child_request))
      children.push(child)
      if (!execution?.executor.isExecuting(mutationIdentity(child))) continue
      active.add(child)
      const accepted = z.object({ accepted: z.object({ taskId: z.string(), dispatchId: z.string() }) }).parse(JSON.parse(child.receipt)).accepted
      const recovery = getPendingWorkerStartRecovery(child.method, child.receipt)
      const dispatch = recovery && dispatchById.get(recovery.dispatchId)
      if (!dispatch || accepted.dispatchId !== dispatch.id || accepted.taskId !== dispatch.task_id || !isTaskDescendant(db, scope.run_id, scope.root_task_id, dispatch.task_id)) fail('The executing Worker receipt left its original task tree')
      if (active.has(parent) && dispatch.worker_state === 'starting' && dispatch.runtime_epoch === execution.runtimeEpoch) starting.add(dispatch.id)
    }
    pending.push(...children)
    const mailWhere = `FROM messages WHERE run_id=? AND (type='handoff' OR (delivery_contract='audit_only' AND json_valid(payload)=1 AND json_extract(payload,'$.schema')='swa.run-lifecycle-observation.v1'))`
    const mailBound = z.object({ count: z.number(), bytes: z.number() }).parse(db.db.prepare(`SELECT COUNT(*) count,COALESCE(SUM(LENGTH(CAST(id||from_handle||to_handle||body||COALESCE(payload,'') AS BLOB))),0) bytes ${mailWhere}`).get(scope.run_id))
    if (mailBound.count > 100_000 || mailBound.bytes > 12 * 1024 * 1024) fail('The complete native handoff mailbox exceeds its read bound')
    const mail = z.array(z.object({ id: z.string(), type: z.string(), from_handle: z.string(), to_handle: z.string(), body: z.string(), read: z.number(), payload: z.string() })).parse(db.db.prepare(`SELECT id,type,from_handle,to_handle,body,read,payload ${mailWhere} ORDER BY sequence`).all(scope.run_id))
    const handoffs = mail.filter(row => row.type === 'handoff').map(row => ({ id: row.id, from: row.from_handle, to: row.to_handle, text: row.body, read: row.read !== 0, record: z.record(z.string(), z.unknown()).parse(JSON.parse(row.payload)) }))
    const blockers: RunView['blockers'] = []
    const failures: RunView['failures'] = []
    const taskById = new Map(tasks.map(task => [task.id, task]))
    for (const task of tasks) {
      if (task.status === 'failed') failures.push({ task_id: task.id, reason: 'native_task_failed' })
      if (task.status === 'blocked') blockers.push({ kind: 'task', task_id: task.id, dispatch_id: null, reason: 'native_task_blocked' })
      const waiting = task.dependencies.filter(id => taskById.get(id)?.status !== 'completed')
      if (waiting.length && !terminalTask(task.status)) blockers.push({ kind: 'dependency', task_id: task.id, dispatch_id: null, reason: `waiting_for:${waiting.join(',')}` })
    }
    let unknown = pending.some(row => !active.has(row))
    for (const row of mail.filter(row => row.type !== 'handoff' && !row.read)) {
      unknown = true
      blockers.push({ kind: 'lifecycle', task_id: root.id, dispatch_id: null, reason: row.body })
    }
    for (const request of pending) blockers.push({ kind: 'request', task_id: null, dispatch_id: null, reason: `${active.has(request) ? 'original_request_in_progress' : 'original_request_pending'}:${request.request_id}` })
    for (const dispatch of dispatches) {
      if (['failed', 'circuit_broken'].includes(dispatch.status)) failures.push({ task_id: dispatch.task_id, dispatch_id: dispatch.id, reason: 'native_dispatch_failed' })
      if (dispatch.worker_state === 'start_unknown' || dispatch.worker_state === 'stop_unknown') {
        unknown = true
        blockers.push({ kind: 'worker', task_id: dispatch.task_id, dispatch_id: dispatch.id, reason: dispatch.worker_state })
      }
      if (dispatch.worker_state !== null && dispatch.release_state === null) {
        if (!starting.has(dispatch.id)) unknown = true
        blockers.push({ kind: 'resource', task_id: dispatch.task_id, dispatch_id: dispatch.id, reason: starting.has(dispatch.id) ? 'worker_resources_being_created' : 'resource_inventory_unavailable' })
      } else if (dispatch.worker_state !== null && dispatch.release_state !== 'released') {
        blockers.push({ kind: 'resource', task_id: dispatch.task_id, dispatch_id: dispatch.id, reason: 'worker_resources_not_released' })
      }
    }
    for (const question of questions) blockers.push({ kind: 'question', task_id: question.task_id, dispatch_id: question.dispatch_id, reason: question.id })
    for (const question of answered_questions) if (nativeQuestions.find(value => value.question_id === question.question_id)?.blocks_settlement) blockers.push({ kind: 'question', task_id: question.task_id, dispatch_id: question.dispatch_id, reason: `${question.read_state}:${question.question_id}` })
    if (tasks.length === 1) blockers.push({ kind: 'task', task_id: root.id, dispatch_id: null, reason: 'no_worker_task_submitted' })
    const initial = z.object({ spec: z.object({ initial_workers: z.number().int().positive().optional() }) }).parse(JSON.parse(root.spec)).spec.initial_workers ?? 1
    if (tasks.length - 1 < initial) blockers.push({ kind: 'task', task_id: root.id, dispatch_id: null, reason: `initial_workers_missing:${initial - tasks.length + 1}` })
    const complete = tasks.length > 1 && tasks.every(task => terminalTask(task.status)) && dispatches.every(dispatch => terminalDispatch(dispatch.status)) && blockers.length === 0
    const status: RunView['status'] = unknown ? 'unknown' : questions.length || nativeQuestions.some(value => value.blocks_settlement) ? 'waiting_input'
      : complete ? root.status === 'failed' ? 'failed' : 'completed'
      : active.size > 0 || tasks.some(task => task.status === 'dispatched') || dispatches.some(dispatch => ['starting', 'ready', 'stopping'].includes(dispatch.worker_state ?? '')) ? 'active' : 'blocked'
    const view: RunView = {
      schema: 'swa.run-view.v1', controller: scope.controller, run_id: scope.run_id, root_task_id: scope.root_task_id,
      status, root: { id: root.id, status: root.status, result: root.result }, tasks,
      dispatches: dispatches.map(row => ({ id: row.id, task_id: row.task_id, status: row.status, worker_state: row.worker_state, release_state: row.release_state, creator_dispatch_id: row.creator_dispatch_id, recipient_session_id: row.assignee_orca_session_id })),
      questions, answered_questions, handoffs, blockers, failures,
      deliverables: tasks.filter(task => task.result !== null).map(task => ({ task_id: task.id, kind: 'result', available: task.result !== null })),
      complete, acceptance: 'unreviewed', observed_at: new Date().toISOString()
    }
    if (Buffer.byteLength(JSON.stringify(view)) > 12 * 1024 * 1024) fail('The complete Run view exceeds the declared read bound')
    db.db.exec('COMMIT')
    return view
  } catch (error) {
    db.db.exec('ROLLBACK')
    throw error
  }
}
