import { useEffect, useRef, useState } from 'react';
import type { components } from '../../api/schema';
import { swaApi, type SwaCommand, type SwaEnvelope } from '../../api/swa';
import { useReadApi, formatError } from '../../hooks/useReadState';
import { QueryState } from '../../components/QueryState';
import { canRequestSwaStart, readSwaAgents, readSwaCapabilityDetails, observationJSON, swaStartRequestBlock, type PendingSwaRequest } from './swaObservation';
import { readSwaRun, submittedRun, type SwaQuestionReadState, type SwaRunSelection } from './swaRunView';
import { modelCLIAllowed } from '../workspace/modelCLIPermission';
import { readRunConnection, saveRunConnection } from './swaRunConnection';
import styles from './SwaWorkspace.module.css';

type Project = components['schemas']['LocalProjectV1'];
export interface SwaRunRoleSelection { id: string; revision: number; default_agent: string; default_model: string; question_mode?: 'disabled' | 'native' }
interface CommandState {
  pending: boolean; error: string | null; reply: SwaEnvelope | null; unresolved: PendingSwaRequest | null;
  blocked: boolean; storageError: string | null; reloadPending: () => void;
  run: (body: SwaCommand, onSuccess?: (reply: SwaEnvelope) => void) => Promise<void>;
  inspect: (onRecovered?: (reply: SwaEnvelope) => void) => Promise<void>;
}
type UseAnswerCommand = (projectID: string, scope: string) => CommandState;

const statusLabel: Record<string, string> = { active: '执行中', waiting_input: '等待回答或继续原问题', blocked: '等待依赖或结算', completed: '执行已完成', failed: '任务失败', unknown: '效果尚未确认' };

export function SwaAgentCapabilities({ reply }: { reply: SwaEnvelope }) {
  let agents: ReturnType<typeof readSwaCapabilityDetails>;
  try { agents = readSwaCapabilityDetails(reply); } catch (error) { return <p role="alert">{formatError(error)}</p>; }
  const bases: Record<string, string> = { declaration: '声明支持', configuration: '已配置', probe: '探测通过', session: '会话可用', result: '结果可用' };
  return <section className={styles.workspace} aria-label="Agent 能力状态"><h3>Agent 状态与能力</h3><ul className={styles.workers}>{agents.map(agent => <li key={agent.id} className={styles.message}><strong>{agent.id}</strong>{agent.model && <p>配置模型 · {agent.model}</p>}<dl>{agent.stages.map(stage => <div key={stage.label}><dt>{stage.label}</dt><dd>{stage.observation ? stage.observation.status === 'unknown' ? '未知' : stage.observation.status === 'unavailable' ? '不可用' : bases[stage.observation.basis ?? ''] ?? '可用' : '未知'}{stage.observation?.status === 'unavailable' && <small> · {stage.observation.reason}</small>}</dd></div>)}</dl>{agent.catalog && <details><summary>模型目录 · {agent.catalog.verified ? '已获取' : '未核实'} · {agent.catalog.origin}</summary><ul>{agent.catalog.models.map(model => <li key={`${model.provider}:${model.id}`}>{model.label} · {model.id}{model.provider && ` · ${model.provider}`}</li>)}</ul></details>}</li>)}</ul></section>;
}

export function SwaRunWorkspace({ project, capabilities, disabled, startDisabled, command, useAnswerCommand, onAttached, onForgotten, role = null, conversationID = '' }: { project: Project; capabilities: SwaEnvelope | null; disabled: boolean; startDisabled: boolean; command: CommandState; useAnswerCommand: UseAnswerCommand; onAttached: (selection: SwaRunSelection) => void; onForgotten: () => void; role?: SwaRunRoleSelection | null; conversationID?: string }) {
  const [workdir, setWorkdir] = useState(project.root), [specFile, setSpecFile] = useState(''), [inputFile, setInputFile] = useState(''), [name, setName] = useState('lead');
  const [agentChoice, setAgentChoice] = useState({ roleKey: '', value: project.settings.external_model_cli }), [modelChoice, setModelChoice] = useState({ key: '', value: '' });
  const [questionChoice, setQuestionChoice] = useState<{ roleKey: string; value: 'disabled' | 'native' }>({ roleKey: '', value: 'disabled' });
  const roleKey = role ? `${role.id}:${role.revision}` : '';
  const agentID = agentChoice.roleKey === roleKey ? agentChoice.value : role?.default_agent ?? '';
  const questionMode = questionChoice.roleKey === roleKey ? questionChoice.value : role?.question_mode ?? 'disabled';
  const [connection, setConnection] = useState(() => readRunConnection(project.id));
  const selected = connection.selection;
  const [controller, setController] = useState(selected?.controller ?? ''), [taskID, setTaskID] = useState(selected?.taskID ?? ''), [runID, setRunID] = useState(selected?.runID ?? '');
  let agents: ReturnType<typeof readSwaAgents> = [], capabilityError: string | null = null;
  if (capabilities) {
    try { agents = readSwaAgents(capabilities).filter(agent => modelCLIAllowed(project.settings, agent.id)); } catch (error) { capabilityError = formatError(error); }
  }
  const agent = agents.find(item => item.id === agentID);
  const modelKey = `${roleKey}:${agentID}`;
  const model = modelChoice.key === modelKey ? modelChoice.value : role?.default_agent === agentID ? role.default_model : agent?.model ?? '';
  const nativeQuestionsAvailable = agent?.id === 'pi' && agent.questions?.status === 'available';
  const canSubmit = !!workdir.trim() && !!specFile.trim() && (questionMode === 'disabled' || nativeQuestionsAvailable) && canRequestSwaStart({ agent: agent ? { ...agent, model } : undefined, settings: project.settings, disabled: disabled || startDisabled, pending: command.pending, unresolved: command.blocked, name, inputFile });
  function attach(selection: SwaRunSelection) {
    setConnection({ selection, warning: saveRunConnection(project.id, selection) }); setController(selection.controller); setTaskID(selection.taskID); setRunID(selection.runID); onAttached(selection);
  }
  return <section className={styles.workspace} aria-label="完整任务">
    <h3>提交目标，跟踪到交付</h3>
    <p className={styles.note}>使用服务端的任务规格和输入文件提交目标，在此跟踪进度、子任务和成果。</p>
    {role && <p className={styles.identity}>复用角色 · {role.id} · 版本 {role.revision}</p>}{conversationID && <p className={styles.identity}>关联讨论会话 · {conversationID}</p>}
    <form className={styles.form} onSubmit={event => { event.preventDefault(); if (!canSubmit || !agent) return; void command.run({ action: 'run.submit', project_id: project.id, workdir: workdir.trim(), spec_file: specFile.trim(), input_file: inputFile.trim(), agent: agent.id, model: model.trim(), question_mode: questionMode, name: name.trim(), ...(role ? { role_id: role.id, revision: role.revision } : {}), ...(conversationID ? { conversation_id: conversationID } : {}) }, reply => attach(submittedRun(reply))); }}>
      <label>任务工作目录<input required value={workdir} onChange={event => setWorkdir(event.target.value)} /></label>
      <label>任务规格文件<input required value={specFile} onChange={event => setSpecFile(event.target.value)} /></label>
      <label>目标与要求的输入文件<input required value={inputFile} onChange={event => setInputFile(event.target.value)} /></label>
      <label>主 Agent<select required value={agentID} onChange={event => setAgentChoice({ roleKey, value: event.target.value })}><option value="">选择当前项目 Agent</option>{agents.map(item => <option key={item.id} value={item.id} disabled={!!swaStartRequestBlock(item, project.settings)}>{item.id} · {item.model || '模型未配置'}</option>)}</select></label>
      <label>本次模型<input required value={model} onChange={event => setModelChoice({ key: modelKey, value: event.target.value })} /></label>
      <SwaQuestionModeField value={questionMode} nativeAvailable={nativeQuestionsAvailable} disabled={disabled || startDisabled || command.pending || command.blocked} onChange={value => setQuestionChoice({ roleKey, value })} />
      <label>主 Worker 名称<input required value={name} onChange={event => setName(event.target.value)} /></label>
      <button type="submit" className="ac-button compact" disabled={!canSubmit}>提交完整任务</button>
    </form>
    {capabilityError && <p role="alert">{capabilityError}</p>}
    {agent && <p className={styles.note}>{swaStartRequestBlock({ ...agent, model }, project.settings) ?? `当前选择 ${agent.id} · ${model}`}</p>}{role && !agent && <p className={styles.note}>角色默认的 Agent 不可用，请检查项目许可和 Agent 配置。</p>}
    <div aria-live="polite">{command.pending && <p role="status">正在提交或查询原请求…</p>}{command.error && <p role="alert">{command.error}</p>}{command.storageError && <button type="button" className="ac-button secondary compact" disabled={command.pending} onClick={command.reloadPending}>重新读取请求记录</button>}{command.unresolved && <div role="alert"><p>提交结果未知：{command.unresolved.requestID}。不会重发，请查询原请求。</p><button type="button" className="ac-button secondary compact" disabled={disabled || command.pending} onClick={() => { if (!disabled) void command.inspect(reply => attach(submittedRun(reply))); }}>查询完整任务原请求</button></div>}{command.reply && <details><summary>提交回执</summary><pre className={styles.output}>{observationJSON(command.reply)}</pre></details>}</div>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); if (disabled || !controller.trim() || !taskID.trim() || !runID.trim()) return; attach({ controller: controller.trim(), taskID: taskID.trim(), runID: runID.trim() }); }}>
      <label>原 Run ID<input required value={runID} onChange={event => setRunID(event.target.value)} /></label>
      <label>原 Run 的 Controller<input required value={controller} onChange={event => setController(event.target.value)} /></label>
      <label>原 Run 的根 Task ID<input required value={taskID} onChange={event => setTaskID(event.target.value)} /></label>
      <button type="submit" className="ac-button secondary compact" disabled={disabled || !controller.trim() || !taskID.trim() || !runID.trim()}>重新连接完整任务</button>
    </form>
    {connection.warning && <p role="status">{connection.warning}</p>}
    {selected && <button type="button" className="ac-button secondary compact" onClick={() => { setConnection({ selection: null, warning: saveRunConnection(project.id, null) }); setController(''); setTaskID(''); setRunID(''); onForgotten(); }}>忘记此项目的运行连接（任务继续运行）</button>}
    {selected && <RunProgress key={`${selected.controller}:${selected.runID}:${selected.taskID}`} project={project} selected={selected} disabled={disabled} useAnswerCommand={useAnswerCommand} />}
  </section>;
}

function RunProgress({ project, selected, disabled, useAnswerCommand }: { project: Project; selected: SwaRunSelection; disabled: boolean; useAnswerCommand: UseAnswerCommand }) {
  const [following, setFollowing] = useState(true), [exporting, setExporting] = useState(false), [exportError, setExportError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionAction, setQuestionAction] = useState<'question.answer' | 'question.resume'>('question.answer');
  const answer = useAnswerCommand(project.id, `question.answer:${selected.controller}:${selected.runID}:${selected.taskID}`);
  const active = useRef(false), exportAbort = useRef<AbortController | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; exportAbort.current?.abort(); }; }, [project.id, project.settings.revision]);
  const view = useReadApi(async signal => readSwaRun(await swaApi.command(project.id, { action: 'run.show', controller: selected.controller, task_id: selected.taskID, run_id: selected.runID }, signal), project.id, selected), { key: `${project.id}:${project.settings.revision}:${selected.runID}`, enabled: !disabled, refreshMs: following ? 3000 : undefined });
  async function exportRun() {
    if (disabled || exporting || !view.data || view.loading || view.stale) return;
    setExporting(true); setExportError(null);
    const abort = new AbortController();
    exportAbort.current = abort;
    try {
      const separator = project.root.includes('\\') ? '\\' : '/';
      const output = `${project.root}${project.root.endsWith(separator) ? '' : separator}swa-export-${crypto.randomUUID()}`;
      const reply = await swaApi.command(project.id, { action: 'run.export', controller: selected.controller, task_id: selected.taskID, run_id: selected.runID, output_dir: output }, abort.signal);
      if (!active.current || abort.signal.aborted) return;
      readSwaRun(reply, project.id, selected);
      const native = (reply.result as { native: { result?: unknown } }).native;
      if (native.result === undefined || native.result === null) throw new Error('服务未提供任务结果快照');
      download(`swa-run-${selected.runID}.json`, JSON.stringify(reply, null, 2), 'application/json');
    } catch (error) { if (active.current && !abort.signal.aborted) setExportError(formatError(error)); }
    finally { if (active.current) setExporting(false); }
  }
  return <div className={styles.workspace}>
    <div className={styles.form}><button type="button" className="ac-button secondary compact" disabled={disabled || view.loading} onClick={view.retry}>刷新完整任务</button><label><input type="checkbox" checked={following} onChange={event => setFollowing(event.target.checked)} />自动观察同一 Run</label></div>
    <QueryState state={view}>{data => <>
      <p className={styles.identity}>Run · {data.runID} · 根任务 {data.taskID}</p>
      <p role="status">{statusLabel[data.status]} · {data.tasks.filter(task => task.status === 'completed').length}/{data.tasks.length} 个任务已完成 · {data.failures.length} 项失败记录</p>
      {data.failures.length > 0 && <p role="alert">存在失败任务，请查看失败记录。CLI 严格模式将返回失败。</p>}
      {data.blockers.length > 0 && <section aria-label="阻塞原因"><h4>当前等待原因</h4><ul>{data.blockers.map((blocker, index) => <li key={`${blocker.kind}:${blocker.taskID}:${index}`}>{blocker.reason}{blocker.taskID && ` · Task ${blocker.taskID}`}{blocker.dispatchID && ` · Dispatch ${blocker.dispatchID}`}</li>)}</ul></section>}
      {data.questions.length > 0 && <section aria-label="需要回答"><h4>需要用户回答</h4>{data.questions.map(question => <SwaQuestionAnswerForm key={question.id} question={question} text={answers[question.id] ?? ''} disabled={disabled || view.stale || view.loading || answer.pending || answer.blocked || !project.settings.allow_agent_control || !project.settings.allowed_actions.includes('send')} onChange={text => setAnswers(previous => ({ ...previous, [question.id]: text }))} onSubmit={() => { setQuestionAction('question.answer'); void answer.run({ action: 'question.answer', controller: selected.controller, run_id: selected.runID, task_id: selected.taskID, dispatch_id: question.dispatchID, question_id: question.id, text: answers[question.id] }, view.retry); }} />)}</section>}
      {data.answeredQuestions.length > 0 && <section aria-label="原问题与回答"><h4>已保存的回答</h4>{data.answeredQuestions.map(question => <SwaQuestionHistory key={question.id} question={question} disabled={disabled || view.stale || view.loading || answer.pending || answer.blocked || !project.settings.allow_agent_control || !project.settings.allowed_actions.includes('send')} onResume={() => { setQuestionAction('question.resume'); void answer.run({ action: 'question.resume', controller: selected.controller, run_id: selected.runID, task_id: selected.taskID, dispatch_id: question.dispatchID, question_id: question.id }, view.retry); }} />)}</section>}
      <section aria-label="交接记录"><h4>交接与返回</h4><p className={styles.note}>下方已读状态指接收 Agent 是否读取消息。</p>{data.handoffs.length ? <ul className={styles.workers}>{data.handoffs.map(handoff => <li key={handoff.id} className={styles.message}><p className={styles.identity}>{handoff.from} → {handoff.to} · {handoff.read ? '已读取' : '尚未确认读取'}</p>{handoff.text && <pre className={styles.output}>{handoff.text}</pre>}<details><summary>交接详情</summary><pre className={styles.output}>{JSON.stringify(handoff.record, null, 2)}</pre></details></li>)}</ul> : <p className={styles.note}>暂无交接消息。</p>}</section>
      <section aria-label="完整递归任务"><h4>全部任务与交接</h4><ul className={styles.workers}>{data.tasks.map(task => <li key={task.id} className={styles.message}><strong>{task.title || task.id}</strong><p>{task.status} · {task.parentID ? `父任务 ${task.parentID}` : '根任务'}</p><p className={styles.identity}>Task {task.id}{task.dependencies.length > 0 && ` · 等待 ${task.dependencies.join('、')}`}</p>{data.dispatches.filter(dispatch => dispatch.taskID === task.id).map(dispatch => <p className={styles.identity} key={dispatch.id}>Dispatch {dispatch.id} · 业务 {dispatch.status} · Worker {dispatch.workerState ?? '未知'} · 资源 {dispatch.releaseState ?? '未知'}{dispatch.parentDispatch && ` · 交接来源 ${dispatch.parentDispatch}`}{dispatch.sessionID && ` · 会话 ${dispatch.sessionID}`}</p>)}{task.result !== null && <details><summary>任务成果</summary><pre className={styles.output}>{task.result}</pre><button type="button" className="ac-button secondary compact" disabled={view.stale || view.loading} onClick={() => download(`swa-task-${task.id}.txt`, task.result!, 'text/plain')}>下载此任务成果文本</button></details>}</li>)}</ul></section>
      {data.failures.length > 0 && <details open><summary>失败记录</summary><ul>{data.failures.map((failure, index) => <li key={`${failure.taskID}:${index}`}>{failure.taskID} · {failure.reason}{failure.dispatchID && ` · ${failure.dispatchID}`}</li>)}</ul></details>}
      <button type="button" className="ac-button compact" disabled={disabled || view.stale || view.loading || exporting} onClick={() => { void exportRun(); }}>{exporting ? '正在导出已有结果…' : '下载已有任务结果'}</button>
      <p className={styles.note}>可下载进行中或失败任务的已有结果，缺失项会单独标记。最近更新：{data.observedAt}</p>
    </>}</QueryState>
    <div aria-live="polite">{answer.pending && <p role="status">正在处理问题或查询原请求…</p>}{answer.error && <p role="alert">{answer.error}</p>}{answer.storageError && <button type="button" className="ac-button secondary compact" disabled={answer.pending} onClick={answer.reloadPending}>重新读取请求记录</button>}{answer.unresolved && <div role="alert"><p>问题 {answer.unresolved.questionID} 的操作 {answer.unresolved.action} 结果未知 · {answer.unresolved.requestID}。不会重发，请查询原请求。</p><button type="button" className="ac-button secondary compact" disabled={disabled || answer.pending} onClick={() => { const action = answer.unresolved?.action; void answer.inspect(() => { setQuestionAction(action === 'question.resume' ? 'question.resume' : 'question.answer'); view.retry(); }); }}>查询原问题请求</button></div>}{answer.reply?.ok && !answer.blocked && <p role="status">{questionAction === 'question.resume' ? '继续指令已投递，请查看问题的答案读取状态。' : '回答已保存。若 Worker 已结束等待，请使用该问题的继续按钮。'}</p>}</div>
    {exportError && <p role="alert">{exportError}</p>}
  </div>;
}

export function SwaQuestionAnswerForm({ question, text, disabled, onChange, onSubmit }: { question: { id: string; taskID: string; dispatchID: string; question: string }; text: string; disabled: boolean; onChange: (text: string) => void; onSubmit: () => void }) {
  const bytes = new TextEncoder().encode(text).length;
  const valid = !!text.trim() && bytes <= 32000;
  return <article><p>{question.question}</p><p className={styles.identity}>Task {question.taskID} · Dispatch {question.dispatchID} · 问题 {question.id}</p><form className={styles.form} onSubmit={event => { event.preventDefault(); if (!disabled && valid) onSubmit(); }}><label>回答原问题<textarea required value={text} disabled={disabled} onChange={event => onChange(event.target.value)} /></label><p className={styles.note}>{bytes}/32000 UTF-8字节。回答保留原文字和换行。</p><button type="submit" className="ac-button compact" disabled={disabled || !valid}>保存原问题的回答</button></form></article>;
}

export function SwaQuestionModeField({ value, nativeAvailable, disabled, onChange }: { value: 'disabled' | 'native'; nativeAvailable: boolean; disabled: boolean; onChange: (value: 'disabled' | 'native') => void }) {
  return <><label>本次问题模式<select value={value} disabled={disabled} onChange={event => onChange(event.target.value as 'disabled' | 'native')}><option value="disabled">禁用工具</option><option value="native" disabled={!nativeAvailable}>原生问答 · 仅允许提问与读取原答案</option></select></label>{value === 'native' && !nativeAvailable ? <p role="alert">当前 Agent 的原生问答能力不可用。已选模式保留，请明确选择可用 Agent 或禁用工具。</p> : <p className={styles.note}>{value === 'native' ? '允许 Worker 在此 Run 提问。此模式不提供文件或命令工具。' : '本次 Worker 的模型工具保持关闭。'}</p>}</>;
}

export function SwaQuestionHistory({ question, disabled, onResume }: { question: { id: string; dispatchID: string; question: string; answer: string; answerID: string; answeredAt: string; readState: SwaQuestionReadState; continuationRequired: boolean }; disabled: boolean; onResume: () => void }) {
  const labels: Record<SwaQuestionReadState, string> = { answer_saved: '回答已保存，等待原工具读取', read_unconfirmed: '回答已保存，模型读取尚未确认', read_observed: '原工具已读取答案', interrupted: '原 Worker 已中断，保留已保存的答案', continuation_required: '回答已保存，需要明确继续此问题' };
  return <article><p>{question.question}</p><pre className={styles.output}>{question.answer}</pre><p className={styles.identity}>问题 {question.id} · Dispatch {question.dispatchID} · 答案 {question.answerID} · {question.answeredAt}</p><p role="status">{labels[question.readState]}</p>{question.continuationRequired && <><p className={styles.note}>原等待已结束，当前 Worker 可接收继续指令。明确继续后，模型通过原问题读取已保存的答案。</p><button type="button" className="ac-button compact" disabled={disabled} onClick={() => { if (!disabled) onResume(); }}>继续此问题</button></>}</article>;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
