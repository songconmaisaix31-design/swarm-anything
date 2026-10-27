import type { SwaEnvelope } from '../../api/swa';
import type { components } from '../../api/schema';
import { modelCLIAllowed } from '../workspace/modelCLIPermission';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('执行服务未返回可核对的原生对象');
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`执行服务缺少 ${field}，保持未知`);
  return value;
}

export interface SwaWorker {
  dispatchID: string;
  taskID: string;
  runID: string;
  workerState: string;
  dispatchStatus: string;
  terminalState: string | null;
}

/** 字段来自固定 Orca workerList 的原生投影，不推断额外状态或协作连线。 */
export function readSwaFleet(reply: SwaEnvelope, projectID: string, controller: string, taskID: string) {
  const result = object(reply.result), scope = object(result.scope), native = object(result.native);
  if (scope.project_id !== projectID || scope.controller !== controller || scope.root_task_id !== taskID) throw new Error('任务观察范围与当前选择不一致');
  const runID = text(scope.run_id, 'run_id');
  if (!Array.isArray(native.workers)) throw new Error('执行服务未返回 Worker 清单');
  const workers: SwaWorker[] = native.workers.map(value => {
    const row = object(value);
    if (row.runId !== runID) throw new Error('Worker 不属于当前 Run');
    return { dispatchID: text(row.dispatchId, 'dispatchId'), taskID: text(row.taskId, 'taskId'), runID, workerState: text(row.workerState, 'workerState'), dispatchStatus: text(row.dispatchStatus, 'dispatchStatus'), terminalState: row.terminalState === null ? null : text(row.terminalState, 'terminalState') };
  });
  if (new Set(workers.map(worker => worker.dispatchID)).size !== workers.length) throw new Error('Worker 清单包含重复 Dispatch，保持未确认');
  const page = object(native.page);
  if (typeof page.hasMore !== 'boolean' || typeof page.total !== 'number') throw new Error('执行服务未提供清单完整性');
  return { workers, runID, hasMore: page.hasMore, total: page.total };
}

export function nativeObservation(reply: SwaEnvelope): unknown {
  return object(reply.result).native;
}

export function observationJSON(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? '服务未提供';
}

type SwaObservation = components['schemas']['observation'];
type ProjectSettings = components['schemas']['LocalProjectSettingsV1'];

function readObservation(value: unknown): SwaObservation {
  const observation = object(value);
  if (typeof observation.status !== 'string' || !['available', 'unavailable', 'unknown'].includes(observation.status)) throw new Error('服务返回了未知的能力观察状态');
  const basis = observation.basis;
  if (basis !== undefined && !['declaration', 'configuration', 'probe', 'session', 'result'].includes(String(basis))) throw new Error('能力观察依据不明');
  return { status: observation.status as SwaObservation['status'], reason: text(observation.reason, 'observation.reason'), source: text(observation.source, 'observation.source'), ...(basis ? { basis: basis as NonNullable<SwaObservation['basis']> } : {}) };
}

function choice<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error(`执行服务的 ${field} 无法核对，保持未知`);
  return value as T;
}

/** 同一个 worker.show 的只读投影；业务完成状态不能代替实际执行证据。 */
export function readSwaExecution(reply: SwaEnvelope, projectID: string, controller: string, runID: string, dispatchID: string) {
  const result = object(reply.result), scope = object(result.scope), native = object(result.native), dispatch = object(native.dispatch);
  if (scope.project_id !== projectID || scope.controller !== controller || scope.run_id !== runID || dispatch.runId !== runID || dispatch.id !== dispatchID) throw new Error('Worker 执行观察不属于当前项目、Run 或 Dispatch');
  if (native.execution === undefined) return null;
  const execution = object(native.execution), selected = object(execution.selection), source = object(native.source);
  const original = object(source.selection), account = object(object(original.native_launch).account);
  if (source.availability !== 'observed' || selected.agent !== original.agent_id || selected.adapter !== original.adapter || selected.version !== original.version || selected.execution_mode !== original.execution_mode || selected.model !== original.model || selected.provider !== original.provider || selected.account_source !== account.kind) throw new Error('Worker 实际选择与原生来源不一致');
  const selection = {
    agent: text(selected.agent, 'selection.agent'), adapter: text(selected.adapter, 'selection.adapter'), version: text(selected.version, 'selection.version'),
    model: text(selected.model, 'selection.model'), provider: text(selected.provider, 'selection.provider'), accountSource: text(selected.account_source, 'selection.account_source'),
    executionMode: choice(selected.execution_mode, ['structured'], 'selection.execution_mode'),
  };
  const input = object(execution.delivery), restored = object(execution.resume), catalog = object(execution.model_catalog);
  const delivery = {
    state: choice(input.state, ['sent', 'not_sent', 'unknown'], 'delivery.state'), phase: choice(input.phase, ['journaled', 'queued', 'accepted', 'rejected', 'unknown'], 'delivery.phase'),
    requestID: input.request_id === undefined ? null : text(input.request_id, 'delivery.request_id'), operationID: input.operation_id === undefined ? null : text(input.operation_id, 'delivery.operation_id'), source: text(input.source, 'delivery.source'),
  };
  if (delivery.state === 'sent' && (delivery.phase !== 'accepted' || !delivery.requestID || !delivery.operationID) || delivery.state === 'not_sent' && (delivery.phase !== 'rejected' || !delivery.requestID)) throw new Error('输入送达状态缺少原请求依据，保持未知');
  const resume = {
    state: choice(restored.state, ['not_requested', 'resumed', 'rebuilt', 'failed', 'unknown'], 'resume.state'), source: text(restored.source, 'resume.source'),
    sessionID: restored.session_id === undefined ? null : text(restored.session_id, 'resume.session_id'),
  };
  if (resume.sessionID !== null && (resume.sessionID !== source.native_session_id || !/^[a-zA-Z0-9_-]+$/.test(resume.sessionID))) throw new Error('恢复观察的原生会话身份不一致');
  if (!Array.isArray(catalog.models)) throw new Error('模型目录缺少实际来源列表');
  const models = catalog.models.map(value => { const model = object(value); return { id: text(model.id, 'model.id'), label: text(model.label, 'model.label') }; });
  if (new Set(models.map(model => model.id)).size !== models.length) throw new Error('模型目录含重复身份');
  const observedAt = catalog.observed_at === undefined ? null : text(catalog.observed_at, 'model_catalog.observed_at');
  if (observedAt && !Number.isFinite(Date.parse(observedAt))) throw new Error('模型目录的观察时间不可解析');
  return {
    selection, delivery, resume,
    launch: readObservation(execution.launch), control: readObservation(execution.control), result: readObservation(execution.result), authenticated: readObservation(execution.authenticated),
    catalog: { origin: choice(catalog.origin, ['live-session', 'probe', 'configured', 'unknown'], 'model_catalog.origin'), availability: choice(catalog.availability, ['verified', 'unverified'], 'model_catalog.availability'), models, observedAt },
  };
}

export function readSwaCapabilityDetails(reply: SwaEnvelope) {
  const result = object(reply.result);
  if (result.schema !== 'swa.capabilities.v1' || !Array.isArray(result.agents)) throw new Error('服务未返回已知 Agent 能力合同');
  return result.agents.map(value => {
    const agent = object(value), control = object(agent.control), configured = object(agent.configured);
    const stages = [
      ['注册', agent.registered], ['安装', agent.installed], ['配置', agent.configured], ['账号认证', agent.authenticated], ['可启动', agent.launchable],
      ['追加指令', control.send], ['读取', control.read], ['停止', control.stop], ['会话恢复', control.resume], ['图片', control.images], ['切换模型', control.model_switch], ['工具限制', control.tools], ['原生问答', control.questions],
    ].map(([label, observation]) => ({ label: String(label), observation: observation === undefined ? null : readObservation(observation) }));
    let catalog: { origin: string; verified: boolean; models: { id: string; label: string; provider: string | null }[] } | null = null;
    if (agent.model_catalog !== undefined) {
      const source = object(agent.model_catalog);
      if (!['live-session', 'probe', 'configured', 'unknown'].includes(String(source.origin)) || !['verified', 'unverified'].includes(String(source.availability)) || !Array.isArray(source.models)) throw new Error('模型目录来源不完整');
      catalog = { origin: String(source.origin), verified: source.availability === 'verified', models: source.models.map(value => { const model = object(value); return { id: text(model.id, 'model.id'), label: text(model.label, 'model.label'), provider: typeof model.provider === 'string' ? model.provider : null }; }) };
    }
    return { id: text(agent.id, 'agent.id'), model: typeof configured.model === 'string' ? configured.model : null, stages, catalog };
  });
}

export function readSwaAgents(reply: SwaEnvelope) {
  const result = object(reply.result);
  if (result.schema !== 'swa.capabilities.v1' || !Array.isArray(result.agents)) throw new Error('服务未返回已知 Agent 能力合同');
  const agents = result.agents.map(value => {
    const agent = object(value), configured = object(agent.configured), control = object(agent.control), requirements = object(agent.requirements);
    if (agent.execution_mode !== 'structured' || !Number.isSafeInteger(requirements.settings_revision) || Number(requirements.settings_revision) < 0) throw new Error('服务未提供当前结构化 Agent 的权限版本');
    return {
      id: text(agent.id, 'agent.id'), model: typeof configured.model === 'string' ? configured.model : '', settingsRevision: Number(requirements.settings_revision),
      registered: readObservation(agent.registered), enabled: readObservation(agent.enabled), installed: readObservation(agent.installed), configured: readObservation(configured),
      launchable: readObservation(agent.launchable), start: readObservation(control.start), read: readObservation(control.read), tools: readObservation(control.tools),
      questions: control.questions === undefined ? null : readObservation(control.questions),
    };
  });
  if (new Set(agents.map(agent => agent.id)).size !== agents.length) throw new Error('能力清单包含重复 Agent，保持未确认');
  return agents;
}

type SwaAgent = ReturnType<typeof readSwaAgents>[number];

/** 只判定是否可向原启动门提交请求，不改变任何原生能力观察。 */
export function swaStartRequestBlock(agent: SwaAgent, settings: ProjectSettings): string | null {
  if (!modelCLIAllowed(settings, agent.id)) return '当前项目未许可此 Agent';
  if (agent.settingsRevision !== settings.revision) return '能力清单的权限版本已过期，请刷新项目';
  if (!settings.allow_agent_control || !settings.allowed_actions.includes('start')) return '当前项目未允许启动';
  for (const [label, observation] of [['注册', agent.registered], ['启用', agent.enabled], ['安装', agent.installed], ['配置', agent.configured], ['启动支持', agent.start]] as const) {
    if (observation.status !== 'available') return `${label}尚未核实可用：${observation.reason}`;
  }
  if (!agent.model.trim()) return '服务未提供已配置模型';
  for (const [label, observation] of [['启动', agent.launchable], ['读取', agent.read], ['工具限制', agent.tools]] as const) {
    if (observation.status === 'unavailable') return `${label}不可用：${observation.reason}`;
  }
  return null;
}

export function canRequestSwaStart(input: { agent: SwaAgent | undefined; settings: ProjectSettings; disabled: boolean; pending: boolean; unresolved: boolean; name: string; inputFile: string }): boolean {
  return !input.disabled && !input.pending && !input.unresolved && !!input.name.trim() && !!input.inputFile.trim() && !!input.agent && swaStartRequestBlock(input.agent, input.settings) === null;
}

export function readSwaTranscript(reply: SwaEnvelope) {
  const native = object(nativeObservation(reply));
  if (native.source !== 'transcript') throw new Error('服务未返回原生 transcript，不能解释为聊天消息');
  const transcript = object(native.transcript);
  if (!Array.isArray(transcript.messages) || typeof transcript.limited !== 'boolean' || typeof transcript.nextCursor !== 'string') throw new Error('原生消息页或完整性字段缺失');
  const messages = transcript.messages.map(value => {
    const message = object(value);
    if (!Array.isArray(message.blocks)) throw new Error('原生消息缺少内容块');
    const role = text(message.role, 'message.role');
    if (!['user', 'assistant', 'tool', 'reasoning', 'system'].includes(role)) throw new Error('原生消息角色尚未支持，保留诊断');
    return { id: text(message.id, 'message.id'), role, blocks: message.blocks.map(value => {
      const block = object(value);
      if (block.type === 'text' && typeof block.text !== 'string') throw new Error('原生消息文字不可解析');
      return { type: text(block.type, 'block.type'), text: block.type === 'text' ? block.text as string : observationJSON(block) };
    }) };
  });
  if (new Set(messages.map(message => message.id)).size !== messages.length) throw new Error('消息页包含重复身份，保持未确认');
  return { messages, limited: transcript.limited, nextCursor: transcript.nextCursor, sourceIdentity: text(native.sourceIdentity, 'sourceIdentity'), complete: native.contentComplete === true };
}

export interface PendingSwaRequest {
  requestID: string;
  action: string;
  controller?: string;
  taskID?: string;
  dispatchID?: string;
  runID?: string;
  questionID?: string;
}

/** 只恢复同范围已完成的原生回执；absent 和 pending 不能证明没有执行。 */
export function recoverSwaRequest(reply: SwaEnvelope, projectID: string, pending: PendingSwaRequest): SwaEnvelope | null {
  const request = object(reply.result);
  if (request.requestId !== pending.requestID) throw new Error('原请求查询返回了不同的请求身份');
  if (request.state !== 'completed') return null;
  const receipt = object(request.receipt);
  const methods: Record<string, string> = { 'controller.open': 'swa.controllerOpen', 'task.create': 'swa.taskCreate', 'worker.start': 'swa.controllerDeliver', 'worker.send': 'swa.controllerDeliver', 'worker.stop': 'swa.controllerDeliver', 'question.answer': 'swa.controllerDeliver', 'question.resume': 'swa.controllerDeliver' };
  if (!methods[pending.action] || request.method !== methods[pending.action] || receipt.project_id !== projectID || pending.controller && receipt.controller !== pending.controller) throw new Error('原请求回执不属于当前项目、动作或 Controller');
  if (pending.action !== 'controller.open') {
    const command = object(object(receipt.invocation).command);
    if (command.action !== pending.action || command.request_id !== pending.requestID || pending.taskID && command.task_id !== pending.taskID || pending.dispatchID && command.dispatch_id !== pending.dispatchID) throw new Error('原请求回执的任务或 Worker 选择不一致');
  }
  const expectedChildren = receipt.children ?? (receipt.child_request ? [receipt.child_request] : []);
  if (!Array.isArray(expectedChildren) || expectedChildren.some(id => typeof id !== 'string') || !Array.isArray(request.children) || request.children.length !== expectedChildren.length) throw new Error('原请求的子回执范围不完整');
  const children = request.children.map(object);
  if (children.some(child => !expectedChildren.includes(child.requestId)) || new Set(children.map(child => child.requestId)).size !== children.length) throw new Error('原请求的子回执身份不一致');
  if (children.some(child => child.state !== 'completed')) return null;
  const controller = text(receipt.controller, 'receipt.controller');
  if (pending.action === 'question.answer') return recoverQuestionAnswer(reply, projectID, pending, receipt, children);
  if (pending.action === 'question.resume') {
    const invocation = object(receipt.invocation), command = object(invocation.command), scope = object(invocation.scope), input = object(invocation.input), native = object(receipt.native);
    if (!pending.questionID || !pending.runID || !pending.taskID || !pending.dispatchID || !pending.controller || receipt.action !== pending.action || object(invocation.project).id !== projectID || object(invocation.caller).project_id !== projectID || scope.project_id !== projectID || scope.controller !== pending.controller || command.controller !== pending.controller || command.question_id !== pending.questionID || command.run_id !== pending.runID || command.task_id !== pending.taskID || scope.run_id !== pending.runID || scope.root_task_id !== pending.taskID || receipt.run_id !== pending.runID || receipt.root_task_id !== pending.taskID || command.text !== undefined || command.input_file !== undefined || invocation.handoff !== undefined || invocation.submission !== undefined || invocation.question_ask !== undefined || input.path !== `native-question-resume:${pending.questionID}` || input.version !== pending.requestID || input.text !== `使用 swa_ask 的 resume 参数读取原问题 ${pending.questionID} 的答案，并继续当前任务。`) throw new Error('原问题继续回执的身份或固定输入不一致');
    if (children.length !== 1 || children[0].method !== 'swa.workerSend' || children[0].requestId !== `${pending.requestID}/native`) throw new Error('原问题继续缺少准确子请求');
    const child = object(children[0].receipt);
    for (const value of [native, child]) if (value.project_id !== projectID || value.controller !== pending.controller || value.run_id !== pending.runID || value.request_id !== pending.requestID || value.native_request_id !== `${pending.requestID}/native` || value.dispatch_id !== pending.dispatchID) throw new Error('原问题继续父子回执的身份不一致');
    if (receipt.state === 'rejected' && receipt.effects_applied === false && native.state === 'rejected' && native.effects_applied === false && child.state === 'rejected' && child.effects_applied === false && object(native.source).kind === 'native_pre_input_admission' && object(child.source).kind === 'native_pre_input_admission' && object(native.source).child_request === `${pending.requestID}/native` && object(child.source).child_request === `${pending.requestID}/native` && receipt.swa_input_binding === undefined && native.swa_input_binding === undefined && child.swa_input_binding === undefined) {
      const error = object(native.error), other = object(child.error);
      if (error.code !== other.code || error.message !== other.message) throw new Error('原问题继续拒绝回执不一致');
      return { ...reply, ok: false, request_id: pending.requestID, controller, task_id: pending.taskID, dispatch_id: pending.dispatchID, result: receipt, error: { code: text(error.code, 'error.code'), message: text(error.message, 'error.message'), retryable: false, required_action: 'revise_explicit_question_resume' } };
    }
    const binding = object(receipt.swa_input_binding), body = object(binding.body), current = object(request.current_input);
    if (binding.parent_request !== pending.requestID || binding.child_request !== `${pending.requestID}/native` || binding.dispatch_id !== pending.dispatchID || binding.agent !== 'pi' || binding.execution_mode !== 'structured' || typeof binding.session_id !== 'string' || !binding.session_id || typeof binding.operation_id !== 'string' || !binding.operation_id || !Number.isSafeInteger(binding.runtime_fence) || !Number.isSafeInteger(binding.consumer_generation) || body.kind !== 'message' || body.role !== 'user' || !Array.isArray(body.blocks) || body.blocks.length !== 1 || object(body.blocks[0]).type !== 'text' || object(body.blocks[0]).text !== input.text || JSON.stringify(binding) !== JSON.stringify(native.swa_input_binding) || JSON.stringify(binding) !== JSON.stringify(child.swa_input_binding) || JSON.stringify(binding) !== JSON.stringify(current.binding) || native.session_id !== binding.session_id || child.session_id !== binding.session_id || native.operation_id !== binding.operation_id || child.operation_id !== binding.operation_id) throw new Error('原问题继续的输入绑定不一致');
  }
  let taskID = pending.taskID, dispatchID = pending.dispatchID;
  if (pending.action === 'task.create') taskID = text(receipt.root_task_id, 'receipt.root_task_id');
  if (pending.action.startsWith('worker.') || pending.action === 'question.resume') {
    if (receipt.action !== pending.action) throw new Error('原请求回执的动作不一致');
    const native = object(receipt.native);
    const states: Record<string, string[]> = { 'worker.start': ['ready'], 'worker.stop': ['stopped'], 'worker.send': ['journaled', 'queued', 'accepted', 'handed-to-terminal'], 'question.resume': ['journaled', 'queued', 'accepted', 'handed-to-terminal'] };
    if (!states[pending.action]?.includes(String(native.state))) return null;
    if (pending.action === 'worker.start') dispatchID = text(native.dispatchId, 'receipt.native.dispatchId');
    if (pending.action === 'worker.send' || pending.action === 'question.resume') {
      const current = object(request.current_input);
      if (current.request_id !== pending.requestID || current.dispatch_id !== pending.dispatchID) throw new Error('原输入的当前结算身份不一致');
      if (!states['worker.send'].includes(String(current.state))) return null;
    }
  }
  return { ...reply, request_id: pending.requestID, controller, ...(taskID ? { task_id: taskID } : {}), ...(dispatchID ? { dispatch_id: dispatchID } : {}), result: receipt };
}

function recoverQuestionAnswer(reply: SwaEnvelope, projectID: string, pending: PendingSwaRequest, receipt: Record<string, unknown>, children: Record<string, unknown>[]): SwaEnvelope | null {
  const invocation = object(receipt.invocation), command = object(invocation.command), scope = object(invocation.scope);
  if (!pending.controller || !pending.runID || !pending.taskID || !pending.dispatchID || !pending.questionID || receipt.action !== pending.action || receipt.run_id !== pending.runID || receipt.root_task_id !== pending.taskID || object(invocation.project).id !== projectID || object(invocation.caller).project_id !== projectID || scope.project_id !== projectID || scope.controller !== pending.controller || scope.run_id !== pending.runID || scope.root_task_id !== pending.taskID || command.controller !== pending.controller || command.run_id !== pending.runID || command.task_id !== pending.taskID || command.dispatch_id !== pending.dispatchID || command.question_id !== pending.questionID || invocation.handoff !== undefined || invocation.submission !== undefined) throw new Error('回答回执的项目、Run、问题或原始选择不一致');
  const inline = command.text !== undefined;
  if (inline && (command.input_file !== undefined || invocation.input !== undefined) || !inline && (typeof command.input_file !== 'string' || !command.input_file)) throw new Error('原回答正文来源不完整');
  const input = inline ? null : object(invocation.input);
  if (input && (typeof input.path !== 'string' || !input.path || typeof input.version !== 'string' || !input.version)) throw new Error('原回答文件来源不完整');
  const body = text(inline ? command.text : input?.text, 'answer.body');
  if (!body.trim() || new TextEncoder().encode(body).length > 32000) throw new Error('原回答正文不满足字节上界');
  const childID = `${pending.requestID}/native`;
  if (receipt.child_request !== childID || children.length !== 1 || children[0].requestId !== childID || children[0].method !== 'orchestration.reply') throw new Error('原回答缺少准确的 reply 子回执');
  const child = object(children[0].receipt), native = object(receipt.native);
  for (const value of [child, native]) if (value.project_id !== projectID || value.controller !== pending.controller || value.run_id !== pending.runID || value.root_task_id !== pending.taskID || value.dispatch_id !== pending.dispatchID || value.question_id !== pending.questionID || value.request_id !== pending.requestID || value.native_request_id !== childID || value.body !== body) throw new Error('原回答子回执的身份或完整正文不一致');
  const recovered = { ...reply, request_id: pending.requestID, controller: pending.controller, run_id: pending.runID, task_id: pending.taskID, dispatch_id: pending.dispatchID, result: receipt };
  if (native.state === 'rejected') {
    if (receipt.state !== 'rejected' || receipt.effects_applied !== false || child.state !== 'rejected' || child.effects_applied !== false || native.effects_applied !== false) return null;
    const error = object(child.error);
    if (JSON.stringify(error) !== JSON.stringify(native.error) || JSON.stringify(error) !== JSON.stringify(receipt.error) || typeof error.code !== 'string' || typeof error.message !== 'string' || error.retryable !== false || typeof error.required_action !== 'string') throw new Error('原回答未提供同一明确无效果拒绝');
    return { ...recovered, ok: false, error: { code: error.code, message: error.message, retryable: error.retryable, required_action: error.required_action, ...(error.data === undefined ? {} : { data: error.data }) } };
  }
  if (native.state !== 'answered' || child.state !== 'answered') return null;
  for (const value of [child, native]) {
    const question = object(value.question), message = object(value.message);
    if (question.message_id !== pending.questionID || question.run_id !== pending.runID || question.dispatch_id !== pending.dispatchID || question.status !== 'answered' || question.answer_body !== body || question.answer_message_id !== message.id || message.body !== body || message.thread_id !== pending.questionID || message.run_id !== pending.runID || message.from_handle !== `run:${pending.runID}` || message.to_handle !== `dispatch:${pending.dispatchID}` || !Number.isSafeInteger(question.answered_by_generation) || typeof question.answered_at !== 'string' || typeof value.duplicate !== 'boolean') throw new Error('原问题和唯一答案消息尚未完全确认');
  }
  if (object(child.question).answer_message_id !== object(native.question).answer_message_id) throw new Error('父子回执引用了不同的答案消息');
  return { ...recovered, ok: true };
}
