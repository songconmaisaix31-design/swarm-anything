import { swaApi, type SwaEnvelope } from '../../api/swa';
import { recoverSwaRequest, type PendingSwaRequest } from './swaObservation';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Run 观察缺少实际对象');
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Run 观察缺少 ${field}`);
  return value;
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`Run 观察中的 ${field} 格式不明`);
  return value;
}

function rows(value: unknown, field: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`Run 观察缺少完整 ${field}`);
  return value.map(object);
}

export interface SwaRunSelection { controller: string; taskID: string; runID: string }
export type SwaQuestionReadState = 'answer_saved' | 'read_unconfirmed' | 'read_observed' | 'interrupted' | 'continuation_required';

export function readQuestionContinuation(question: Record<string, unknown>): { readState: SwaQuestionReadState; continuationRequired: boolean } {
  const state = question.read_state;
  if (typeof state !== 'string' || !['answer_saved', 'read_unconfirmed', 'read_observed', 'interrupted', 'continuation_required'].includes(state) || typeof question.continuation_required !== 'boolean' || question.continuation_required !== (state === 'continuation_required')) throw new Error('原答案的读取与继续状态无法确认');
  return { readState: state as SwaQuestionReadState, continuationRequired: question.continuation_required };
}

export function submittedRun(reply: SwaEnvelope): SwaRunSelection {
  return { controller: text(reply.controller, 'controller'), taskID: text(reply.task_id, 'root_task_id'), runID: text(reply.run_id, 'run_id') };
}

export function readSwaRun(reply: SwaEnvelope, projectID: string, selected: SwaRunSelection) {
  const result = object(reply.result), scope = object(result.scope), native = object(result.native), view = object(native.run_view), root = object(view.root);
  if (!reply.ok || reply.controller !== selected.controller || reply.run_id !== selected.runID || reply.task_id !== selected.taskID || scope.project_id !== projectID || scope.controller !== selected.controller || scope.run_id !== selected.runID || scope.root_task_id !== selected.taskID || view.schema !== 'swa.run-view.v1' || view.controller !== selected.controller || view.run_id !== selected.runID || view.root_task_id !== selected.taskID || root.id !== selected.taskID) throw new Error('Run 视图不属于当前项目与原任务');
  const status = text(view.status, 'status');
  if (!['active', 'waiting_input', 'blocked', 'completed', 'failed', 'unknown'].includes(status) || typeof view.complete !== 'boolean' || status === 'completed' && !view.complete) throw new Error('Run 状态或完整性未得到确认');
  if (view.acceptance !== 'unreviewed') throw new Error('Run 未提供可核查的成果验收状态');
  const tasks = rows(view.tasks, 'tasks').map(task => {
    if (!Array.isArray(task.dependencies) || task.dependencies.some(value => typeof value !== 'string')) throw new Error('任务依赖不完整');
    return { id: text(task.id, 'task.id'), parentID: nullableText(task.parent_id, 'parent_id'), status: text(task.status, 'task.status'), title: nullableText(task.title, 'task.title'), dependencies: task.dependencies as string[], result: nullableText(task.result, 'task.result') };
  });
  if (new Set(tasks.map(task => task.id)).size !== tasks.length || !tasks.some(task => task.id === selected.taskID)) throw new Error('Run 任务集合缺失或身份重复');
  const dispatches = rows(view.dispatches, 'dispatches').map(dispatch => ({ id: text(dispatch.id, 'dispatch.id'), taskID: text(dispatch.task_id, 'dispatch.task_id'), status: text(dispatch.status, 'dispatch.status'), workerState: nullableText(dispatch.worker_state, 'worker_state'), releaseState: nullableText(dispatch.release_state, 'release_state'), parentDispatch: nullableText(dispatch.creator_dispatch_id, 'creator_dispatch_id'), sessionID: nullableText(dispatch.recipient_session_id, 'recipient_session_id') }));
  const blockers = rows(view.blockers, 'blockers').map(blocker => ({ kind: text(blocker.kind, 'blocker.kind'), reason: text(blocker.reason, 'blocker.reason'), taskID: nullableText(blocker.task_id, 'blocker.task_id'), dispatchID: nullableText(blocker.dispatch_id, 'blocker.dispatch_id') }));
  const questions = rows(view.questions, 'questions').map(question => ({ id: text(question.id, 'question.id'), taskID: text(question.task_id, 'question.task_id'), dispatchID: text(question.dispatch_id, 'question.dispatch_id'), question: text(question.question, 'question.question') }));
  const answeredQuestions = rows(view.answered_questions, 'answered_questions').map(question => {
    const answeredAt = text(question.answered_at, 'question.answered_at');
    if (!Number.isSafeInteger(question.answered_by_generation) || Number(question.answered_by_generation) < 0 || !Number.isFinite(Date.parse(answeredAt))) throw new Error('原答案缺少实际代次或时间');
    return { id: text(question.question_id, 'question.question_id'), taskID: text(question.task_id, 'question.task_id'), dispatchID: text(question.dispatch_id, 'question.dispatch_id'), question: text(question.question, 'question.question'), answerID: text(question.answer_message_id, 'question.answer_message_id'), answer: text(question.answer, 'question.answer'), answeredAt, ...readQuestionContinuation(question) };
  });
  const allQuestions = [...questions, ...answeredQuestions];
  if (new Set(allQuestions.map(question => question.id)).size !== allQuestions.length || allQuestions.some(question => !tasks.some(task => task.id === question.taskID) || !dispatches.some(dispatch => dispatch.id === question.dispatchID && dispatch.taskID === question.taskID))) throw new Error('原问题记录缺失或属于其它任务');
  const failures = rows(view.failures, 'failures').map(failure => ({ taskID: text(failure.task_id, 'failure.task_id'), dispatchID: typeof failure.dispatch_id === 'string' ? failure.dispatch_id : null, reason: text(failure.reason, 'failure.reason') }));
  const deliverables = rows(view.deliverables, 'deliverables').map(deliverable => {
    if (deliverable.kind !== 'result' || typeof deliverable.available !== 'boolean') throw new Error('成果来源与可用性未确认');
    return { taskID: text(deliverable.task_id, 'deliverable.task_id'), available: deliverable.available };
  });
  const handoffs = rows(view.handoffs, 'handoffs').map(handoff => {
    if (typeof handoff.read !== 'boolean' || typeof handoff.text !== 'string') throw new Error('交接内容或实际读取状态未确认');
    return { id: text(handoff.id, 'handoff.id'), from: text(handoff.from, 'handoff.from'), to: text(handoff.to, 'handoff.to'), text: handoff.text, read: handoff.read, record: object(handoff.record) };
  });
  if (new Set(handoffs.map(handoff => handoff.id)).size !== handoffs.length) throw new Error('Run 交接记录包含重复身份');
  return { ...selected, status, acceptance: view.acceptance, complete: view.complete, tasks, dispatches, blockers, questions, answeredQuestions, failures, deliverables, handoffs, rootResult: nullableText(root.result, 'root.result'), observedAt: text(view.observed_at, 'observed_at') };
}

/** 逐一查询原提交已记录的阶段，绝不继续执行缺失或未知的阶段。 */
export async function inspectSwaRunSubmission(projectID: string, pending: PendingSwaRequest): Promise<SwaEnvelope | null> {
  const first = await swaApi.command(projectID, { action: 'request.show', project_id: projectID, request_id: pending.requestID });
  const request = object(first.result);
  if (request.requestId !== pending.requestID) throw new Error('原 Run 请求身份改变');
  if (request.state !== 'completed') return null;
  const receipt = object(request.receipt), submission = object(receipt.submission), command = object(submission.command);
  if (request.method !== 'swa.controllerOpen' || receipt.project_id !== projectID || submission.schema !== 'swa.run-submission.v1' || command.action !== 'run.submit' || command.project_id !== projectID || command.request_id !== pending.requestID) throw new Error('Run 提交回执与当前项目或请求不符');
  const controller = text(receipt.controller, 'receipt.controller');
  const taskRequest = text(submission.task_request_id, 'task_request_id'), workerRequest = text(submission.worker_request_id, 'worker_request_id');
  const taskReply = await swaApi.command(projectID, { action: 'request.show', project_id: projectID, request_id: taskRequest });
  const task = recoverSwaRequest(taskReply, projectID, { requestID: taskRequest, action: 'task.create', controller });
  if (!task) return null;
  const taskReceipt = object(task.result), taskID = text(task.task_id, 'task_id'), runID = text(taskReceipt.run_id, 'run_id');
  const workerReply = await swaApi.command(projectID, { action: 'request.show', project_id: projectID, request_id: workerRequest });
  const worker = recoverSwaRequest(workerReply, projectID, { requestID: workerRequest, action: 'worker.start', controller, taskID });
  if (!worker) return null;
  const workerReceipt = object(worker.result);
  if (workerReceipt.run_id !== runID || workerReceipt.root_task_id !== taskID) throw new Error('主 Worker 与原 Run 的绑定不一致');
  return { ...worker, request_id: pending.requestID, run_id: runID, task_id: taskID, controller };
}
