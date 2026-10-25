import { useEffect, useRef, useState } from 'react';
import type { components } from '../../api/schema';
import { workspaceApi as localProjectsApi } from '../../api/workspace';
import { swaApi, SwaCommandError, SwaCommandNotSubmittedError, SwaRuntimeUnavailableError, type SwaCommand, type SwaEnvelope } from '../../api/swa';
import { useReadApi, formatError } from '../../hooks/useReadState';
import { QueryState } from '../../components/QueryState';
import { SectionCard } from '../../components/SectionCard';
import { readSwaFleet, readSwaAgents, readSwaTranscript, readPendingSwaRequest, recoverSwaRequest, observationJSON, swaStartRequestBlock, canRequestSwaStart, type PendingSwaRequest } from './swaObservation';
import { SwaAgentCapabilities, SwaQuestionModeField, SwaRunWorkspace } from './SwaRunWorkspace';
import { SwaRoles, type SelectedSwaRole } from './SwaRolesPanel';
import { SwaExecutionDetails } from './SwaExecutionDetails';
import { inspectSwaRunSubmission } from './swaRunView';
import { modelCLIAllowed } from '../workspace/modelCLIPermission';
import { readRunConnection } from './swaRunConnection';
import styles from './SwaWorkspace.module.css';

type Project = components['schemas']['LocalProjectV1'];

export function SwaWorkspace() {
  const projects = useReadApi(signal => localProjectsApi.listProjects({ signal }));
  const [projectID, setProjectID] = useState('');
  const project = projects.data?.items.find(item => item.id === projectID);
  return <SectionCard title="SWA 执行工作台" padded>
    <div className={styles.workspace}>
      <p className={styles.note}>管理项目任务，也可连接 CLI 创建的任务。关闭页面后，后台任务继续运行。</p>
      <button className="ac-button secondary compact" type="button" disabled={projects.loading} onClick={projects.retry}>刷新项目权限快照</button>
      <QueryState state={projects} empty={data => !data.items.length} emptyTitle="尚无已登记项目，请先在共同工作区登记并审阅权限">{data => <label className={styles.form}>选择已登记项目<select aria-label="SWA 项目" value={projectID} disabled={projects.loading || projects.stale} onChange={event => setProjectID(event.target.value)}><option value="">请选择项目</option>{data.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</QueryState>
      <a href="/workspace?tab=overview">管理项目与批准范围</a>
      {project && <ProjectRuntime key={project.id} project={project} disabled={projects.loading || projects.stale} />}
    </div>
  </SectionCard>;
}

function ProjectRuntime({ project, disabled }: { project: Project; disabled: boolean }) {
  const snapshotKey = `${project.id}:${project.settings.revision}`;
  const status = useReadApi(signal => swaApi.command(project.id, { action: 'status' }, signal), { key: snapshotKey, enabled: !disabled });
  const capabilities = useReadApi(signal => swaApi.command(project.id, { action: 'capabilities' }, signal), { key: snapshotKey, enabled: !disabled && !!status.data && !status.error });
  const [attached, setAttached] = useState<{ controller: string; taskID: string } | null>(() => readRunConnection(project.id).selection);
  const [controller, setController] = useState(attached?.controller ?? ''), [taskID, setTaskID] = useState(attached?.taskID ?? '');
  const [workdir, setWorkdir] = useState(project.root);
  const [selectedRole, setSelectedRole] = useState<SelectedSwaRole | null>(null), [conversationID, setConversationID] = useState('');
  const open = useSwaCommand(project.id, 'controller.open');
  const submitRun = useSwaCommand(project.id, 'run.submit');
  const available = !disabled && !!status.data && !status.loading && !status.stale && !status.error && !!capabilities.data && !capabilities.loading && !capabilities.stale && !capabilities.error;
  const canStart = available && project.settings.allow_agent_control && project.settings.allowed_actions?.includes('start');
  return <div className={styles.workspace}>
    <p className={styles.identity}>项目 · {project.name} · {project.id} · 权限版本 {project.settings.revision}</p>
    <QueryState state={status}>{reply => <details><summary>执行服务状态</summary><pre className={styles.output}>{observationJSON(reply)}</pre></details>}</QueryState>
    {!!status.data && <QueryState state={capabilities}>{reply => <><SwaAgentCapabilities reply={reply} /><details><summary>能力详情</summary><pre className={styles.output}>{observationJSON(reply.result)}</pre></details></>}</QueryState>}
    <SwaRoles key={project.id} project={project} disabled={disabled} onRoleSelected={setSelectedRole} onConversationSelected={setConversationID} />
    {(selectedRole || conversationID) && <div className={styles.form}>{selectedRole && <button type="button" className="ac-button secondary compact" onClick={() => setSelectedRole(null)}>清除本次角色选择</button>}{conversationID && <button type="button" className="ac-button secondary compact" onClick={() => setConversationID('')}>清除本次讨论关联</button>}</div>}
    <SwaRunWorkspace project={project} capabilities={capabilities.data} disabled={disabled || !status.data || status.loading || status.stale || !!status.error} startDisabled={!available} command={submitRun} useAnswerCommand={useSwaCommand} role={selectedRole} conversationID={conversationID} onAttached={selection => { setController(selection.controller); setTaskID(selection.taskID); setAttached({ controller: selection.controller, taskID: selection.taskID }); }} onForgotten={() => { setAttached(null); setController(''); setTaskID(''); }} />
    <details><summary>新建 Controller 与固定任务</summary><p className={styles.note}>请填写服务机器上的路径。任务规格中的 max_workers 限制 Worker 总名额，释放 Worker 不归还名额。</p><form className={styles.form} onSubmit={event => { event.preventDefault(); void open.run({ action: 'controller.open', project_id: project.id, workdir: workdir.trim() }, reply => { if (!reply.controller) throw new Error('回执缺少 Controller，请查询原请求'); setController(reply.controller); }); }}><label>已批准的服务端工作目录<input required value={workdir} onChange={event => setWorkdir(event.target.value)} /></label><button className="ac-button secondary compact" type="submit" disabled={!canStart || open.pending || open.blocked}>创建 Controller</button></form><OperationState command={open} onRecovered={reply => { if (reply.controller) setController(reply.controller); }} />
      {controller.trim() && <TaskCreateForm key={controller.trim()} projectID={project.id} controller={controller.trim()} disabled={!canStart} onCreated={id => { setTaskID(id); setAttached({ controller: controller.trim(), taskID: id }); }} />}
    </details>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); setAttached({ controller: controller.trim(), taskID: taskID.trim() }); }}>
      <label>CLI 回执中的 Controller<input required value={controller} onChange={event => setController(event.target.value)} /></label>
      <label>同一任务的根 Task ID<input required value={taskID} onChange={event => setTaskID(event.target.value)} /></label>
      <button className="ac-button compact" disabled={disabled || !status.data || status.loading || status.stale || !controller.trim() || !taskID.trim()} type="submit">连接已有任务</button>
    </form>
    {attached && !disabled && capabilities.data && <TaskWorkspace key={`${attached.controller}:${attached.taskID}`} project={project} capabilities={capabilities.data} startDisabled={!available} {...attached} />}
  </div>;
}

function TaskCreateForm({ projectID, controller, disabled, onCreated }: { projectID: string; controller: string; disabled: boolean; onCreated: (id: string) => void }) {
  const [specFile, setSpecFile] = useState('');
  const create = useSwaCommand(projectID, `task.create:${controller}`);
  return <><form className={styles.form} onSubmit={event => { event.preventDefault(); void create.run({ action: 'task.create', controller, spec_file: specFile.trim() }, reply => { if (!reply.task_id) throw new Error('回执缺少根 Task ID，请查询原请求'); onCreated(reply.task_id); }); }}><label>已批准的服务端任务规格文件<input required value={specFile} onChange={event => setSpecFile(event.target.value)} /></label><button className="ac-button secondary compact" type="submit" disabled={disabled || !specFile.trim() || create.pending || create.blocked}>在当前 Controller 建立任务</button></form><OperationState command={create} controller={controller} onRecovered={reply => { if (reply.task_id) onCreated(reply.task_id); }} /></>;
}

function TaskWorkspace({ project, controller, taskID, capabilities, startDisabled }: { project: Project; controller: string; taskID: string; capabilities: SwaEnvelope; startDisabled: boolean }) {
  const fleet = useReadApi(async signal => readSwaFleet(await swaApi.command(project.id, { action: 'worker.list', controller, task_id: taskID }, signal), project.id, controller, taskID), { key: `${project.id}:${controller}:${taskID}` });
  const [dispatchID, setDispatchID] = useState('');
  const selected = fleet.data?.workers.find(worker => worker.dispatchID === dispatchID);
  const [outputDir, setOutputDir] = useState('');
  const exportCommand = useSwaCommand(project.id, `task.result:${controller}:${taskID}`);
  return <div className={styles.workspace}>
    <div><button className="ac-button secondary compact" type="button" disabled={fleet.loading} onClick={fleet.retry}>刷新任务快照</button></div>
    <QueryState state={fleet}>{data => <>
      <p className={styles.identity}>Run · {data.runID} · 根任务 {taskID}</p>
      {!fleet.stale && <WorkerStartForm key={`${project.id}:${controller}:${taskID}`} project={project} controller={controller} taskID={taskID} capabilities={capabilities} disabled={startDisabled || fleet.loading} onStarted={fleet.retry} />}
      <p className={styles.note}>已加载 {data.workers.length} / {data.total} 个 Worker。{data.hasMore && '还有未加载的 Worker，请使用 CLI 查看完整列表。'}</p>
      <div className={styles.columns}>
        <ul className={styles.workers} aria-label="Worker 列表">{data.workers.map(worker => <li key={worker.dispatchID}><button className={styles.worker} aria-pressed={worker.dispatchID === selected?.dispatchID} type="button" disabled={fleet.stale || fleet.loading} onClick={() => setDispatchID(worker.dispatchID)}><strong>{worker.dispatchID}</strong><small>Task · {worker.taskID}</small><span>业务 · {worker.dispatchStatus}</span><span>Worker · {worker.workerState}</span><span>资源 · {worker.terminalState ?? '未知'}</span></button></li>)}</ul>
        {selected && !fleet.stale ? <WorkerWorkspace key={selected.dispatchID} project={project} controller={controller} runID={data.runID} dispatchID={selected.dispatchID} onChanged={fleet.retry} /> : <p className={styles.note}>{data.workers.length ? '选择 Worker 查看输出和操作。' : '暂无 Worker。'}</p>}
      </div>
    </>}</QueryState>
    <details><summary>查询完整成果</summary><p className={styles.note}>此处显示查询结果；下载请使用上方任务下载，或用 CLI 导出到新目录。</p><form className={styles.form} onSubmit={event => { event.preventDefault(); void exportCommand.run({ action: 'task.result', controller, task_id: taskID, output_dir: outputDir.trim() }); }}><label>服务端新的绝对输出目录<input required value={outputDir} onChange={event => setOutputDir(event.target.value)} /></label><button className="ac-button secondary compact" type="submit" disabled={fleet.loading || fleet.stale || !fleet.data || exportCommand.pending || exportCommand.blocked || !outputDir.trim()}>查询完整成果</button></form><OperationState command={exportCommand} controller={controller} /></details>
  </div>;
}

function WorkerWorkspace({ project, controller, runID, dispatchID, onChanged }: { project: Project; controller: string; runID: string; dispatchID: string; onChanged: () => void }) {
  const detail = useReadApi(signal => swaApi.command(project.id, { action: 'worker.show', controller, dispatch_id: dispatchID }, signal), { key: dispatchID });
  const [cursor, setCursor] = useState(''), [readCursor, setReadCursor] = useState<string | null>(null);
  const transcript = useReadApi(signal => swaApi.command(project.id, { action: 'worker.read', controller, dispatch_id: dispatchID, source: 'transcript', limit: 100, ...(readCursor ? { cursor: readCursor } : {}) }, signal), { key: `${dispatchID}:${readCursor}`, enabled: readCursor !== null });
  const [inputFile, setInputFile] = useState(''), [confirmStop, setConfirmStop] = useState(false);
  const command = useSwaCommand(project.id, `worker.send:${controller}:${dispatchID}`);
  const stop = useSwaCommand(project.id, `worker.stop:${controller}:${dispatchID}`);
  const blocked = command.pending || command.blocked || stop.pending || !detail.data || detail.stale || detail.loading;
  const stopBlocked = stop.pending || stop.blocked || !detail.data || detail.stale || detail.loading;
  return <section className={styles.detail} aria-label={`Worker ${dispatchID}`}>
    <h3>当前 Worker</h3><code className={styles.identity}>{dispatchID}</code>
    <QueryState state={detail}>{reply => <><SwaExecutionDetails reply={reply} projectID={project.id} controller={controller} runID={runID} dispatchID={dispatchID} /><details><summary>Worker 详情</summary><pre className={styles.output}>{observationJSON(reply.result)}</pre></details></>}</QueryState>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); setReadCursor(cursor.trim()); transcript.retry(); }}><label>继续读取游标（空值从头）<input value={cursor} onChange={event => setCursor(event.target.value)} /></label><button className="ac-button secondary compact" type="submit" disabled={detail.loading || detail.stale || !detail.data || transcript.loading}>读取会话</button></form>
    {readCursor !== null && <QueryState state={transcript}>{reply => <Transcript reply={reply} />}</QueryState>}
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void command.run({ action: 'worker.send', controller, dispatch_id: dispatchID, input_file: inputFile.trim() }, () => { detail.retry(); onChanged(); }); }}><label>追加输入的已批准服务端 UTF-8 文件<input required value={inputFile} onChange={event => setInputFile(event.target.value)} /></label><button className="ac-button compact" type="submit" disabled={blocked || !inputFile.trim() || !project.settings.allow_agent_control || !project.settings.allowed_actions?.includes('send')}>提交此 Worker 的输入</button></form>
    <p className={styles.note}>请将追加内容保存为服务端项目中的 UTF-8 文件。追加输入使用你的当前项目权限。</p>
    <button className="ac-button secondary compact" type="button" disabled={stopBlocked} onClick={() => setConfirmStop(true)}>停止此 Worker…</button>
    {confirmStop && <div className={styles.confirm}><p>停止 Dispatch {dispatchID}？其他 Worker 继续运行。提交后请等待停止状态更新。</p><button className="ac-button compact" type="button" disabled={stopBlocked} onClick={() => { setConfirmStop(false); void stop.run({ action: 'worker.stop', controller, dispatch_id: dispatchID }, () => { detail.retry(); onChanged(); }); }}>确认停止 {dispatchID}</button><button className="ac-button secondary compact" type="button" onClick={() => setConfirmStop(false)}>取消</button></div>}
    <OperationState command={command} controller={controller} onRecovered={() => { detail.retry(); onChanged(); }} />
    <OperationState command={stop} controller={controller} onRecovered={() => { detail.retry(); onChanged(); }} />
  </section>;
}

function WorkerStartForm({ project, controller, taskID, capabilities, disabled, onStarted }: { project: Project; controller: string; taskID: string; capabilities: SwaEnvelope; disabled: boolean; onStarted: () => void }) {
  let agents: ReturnType<typeof readSwaAgents> = [], capabilityError: string | null = null;
  try { agents = readSwaAgents(capabilities).filter(agent => modelCLIAllowed(project.settings, agent.id)); } catch (error) { capabilityError = formatError(error); }
  const [agentID, setAgentID] = useState(project.settings.external_model_cli), [name, setName] = useState(''), [inputFile, setInputFile] = useState('');
  const [questionMode, setQuestionMode] = useState<'disabled' | 'native'>('disabled');
  const agent = agents.find(item => item.id === agentID);
  const command = useSwaCommand(project.id, `worker.start:${controller}:${taskID}`);
  const nativeQuestionsAvailable = agent?.id === 'pi' && agent.questions?.status === 'available';
  const canRequestStart = (questionMode === 'disabled' || nativeQuestionsAvailable) && canRequestSwaStart({ agent, settings: project.settings, disabled, pending: command.pending, unresolved: command.blocked, name, inputFile });
  const observationLabel = (status: string) => status === 'unknown' ? '未知' : status === 'available' ? '可用' : '不可用';
  return <details><summary>向同一任务添加 Worker</summary><p className={styles.note}>Worker 数量受任务额度和可用资源限制。</p><form className={styles.form} onSubmit={event => { event.preventDefault(); if (!canRequestStart || !agent) return; void command.run({ action: 'worker.start', controller, task_id: taskID, name: name.trim(), agent: agent.id, model: agent.model, question_mode: questionMode, input_file: inputFile.trim() }, reply => { if (!reply.dispatch_id) throw new Error('回执缺少 Dispatch，请查询原请求'); onStarted(); }); }}>
    <label>当前项目的 Agent<select required value={agentID} onChange={event => setAgentID(event.target.value)}><option value="">选择 Agent</option>{agents.map(item => {
      const blocked = swaStartRequestBlock(item, project.settings);
      return <option key={item.id} value={item.id} disabled={!!blocked}>{item.id} · {item.model || '模型未提供'} · {blocked ?? `启动${observationLabel(item.launchable.status)}`}</option>;
    })}</select></label>
    <SwaQuestionModeField value={questionMode} nativeAvailable={nativeQuestionsAvailable} disabled={disabled || command.pending || command.blocked} onChange={setQuestionMode} />
    <label>此 Worker 名称<input required value={name} onChange={event => setName(event.target.value)} /></label><label>已批准的服务端输入文件<input required value={inputFile} onChange={event => setInputFile(event.target.value)} /></label><button className="ac-button compact" type="submit" disabled={!canRequestStart}>提交启动请求</button>
  </form>{agent && <p className={styles.note}>启动：{observationLabel(agent.launchable.status)}；读取：{observationLabel(agent.read.status)}；工具限制：{observationLabel(agent.tools.status)}。{swaStartRequestBlock(agent, project.settings)}</p>}{capabilityError && <p role="alert">{capabilityError}</p>}{!agents.length && <p role="status">未找到已许可的 Agent，请检查项目设置和能力清单。</p>}<OperationState command={command} controller={controller} onRecovered={onStarted} /></details>;
}

function Transcript({ reply }: { reply: SwaEnvelope }) {
  let page: ReturnType<typeof readSwaTranscript>;
  try { page = readSwaTranscript(reply); } catch (error) { return <div role="alert"><p>{formatError(error)}</p><pre className={styles.output}>{observationJSON(reply.result)}</pre></div>; }
  return <section aria-label="会话记录"><p className={styles.note}>{page.sourceIdentity} · {page.limited ? '还有未加载的消息。' : '本页已读完。'}{page.complete ? '记录完整。' : '完整性未知。'}</p>{page.messages.map(message => <article className={styles.message} key={message.id}><strong>{message.role}</strong>{message.blocks.map((block, index) => <pre key={index} className={styles.output}>{block.type === 'text' ? block.text : `${block.type}\n${block.text}`}</pre>)}</article>)}<p className={styles.identity}>继续读取游标 · {page.nextCursor}</p></section>;
}

function useSwaCommand(projectID: string, scope: string) {
  const storageKey = `swa-pending:${projectID}:${scope}`;
  const [initial] = useState(() => readPendingSwaRequest(storageKey));
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(initial.error);
  const [storageError, setStorageError] = useState(initial.error);
  const [reply, setReply] = useState<SwaEnvelope | null>(null), [unresolved, setUnresolved] = useState<PendingSwaRequest | null>(initial.pending);
  const active = useRef(false), busy = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  function reloadPending() {
    if (busy.current || !storageError) return;
    const saved = readPendingSwaRequest(storageKey);
    setStorageError(saved.error); setError(saved.error); setUnresolved(saved.pending);
  }
  function clearSavedRequest() {
    if (active.current) setUnresolved(null);
    try { sessionStorage.removeItem(storageKey); }
    catch { if (active.current) setError('原请求已确认，但浏览器未能清除保存的请求身份；刷新后可再查询原请求。'); }
  }
  async function run(body: SwaCommand, onSuccess?: (reply: SwaEnvelope) => void) {
    if (busy.current || unresolved || storageError) return;
    busy.current = true;
    const mutation = ['controller.open', 'task.create', 'worker.start', 'worker.send', 'worker.stop', 'run.submit', 'question.answer', 'question.resume'].includes(body.action);
    const questionMutation = body.action === 'question.answer' || body.action === 'question.resume';
    const requestID = mutation ? crypto.randomUUID() : undefined;
    const original: PendingSwaRequest | null = requestID ? { requestID, action: body.action, ...(body.controller ? { controller: body.controller } : {}), ...(body.task_id ? { taskID: body.task_id } : {}), ...(body.dispatch_id ? { dispatchID: body.dispatch_id } : {}), ...(body.run_id ? { runID: body.run_id } : {}), ...(body.question_id ? { questionID: body.question_id } : {}) } : null;
    let commandReturned = false;
    setPending(true); setError(null); setReply(null);
    try {
      if (original) { sessionStorage.setItem(storageKey, JSON.stringify(original)); setUnresolved(original); }
      let result = await swaApi.command(projectID, { ...body, ...(requestID ? { request_id: requestID } : {}) });
      commandReturned = true;
      if (questionMutation && original) {
        const queried = await swaApi.command(projectID, { action: 'request.show', controller: original.controller, request_id: original.requestID });
        const recovered = recoverSwaRequest(queried, projectID, original);
        if (!recovered?.ok) throw new Error('原问题操作尚未取得完整成功回执，请继续查询原请求');
        result = recovered;
      }
      if (active.current) { setReply(result); onSuccess?.(result); clearSavedRequest(); }
    } catch (failure) {
      const notSubmitted = !commandReturned && (failure instanceof SwaCommandNotSubmittedError || failure instanceof SwaRuntimeUnavailableError && !questionMutation);
      if (active.current) {
        setError(formatError(failure));
        if (failure instanceof SwaCommandError) setReply(failure.reply);
        // 其余不确定错误保留原请求，不推断已执行效果。
      }
      if (notSubmitted) clearSavedRequest();
    } finally { busy.current = false; if (active.current) setPending(false); }
  }
  async function inspect(onRecovered?: (reply: SwaEnvelope) => void) {
    if (!unresolved || busy.current) return;
    busy.current = true; setPending(true);
    try {
      if (unresolved.action === 'run.submit') {
        const recovered = await inspectSwaRunSubmission(projectID, unresolved);
        if (active.current && recovered) { setReply(recovered); onRecovered?.(recovered); setError(null); clearSavedRequest(); }
        return;
      }
      const result = await swaApi.command(projectID, { action: 'request.show', ...(unresolved.controller ? { controller: unresolved.controller } : { project_id: projectID }), request_id: unresolved.requestID });
      if (active.current) {
        setReply(result);
        const recovered = recoverSwaRequest(result, projectID, unresolved);
        if (recovered) {
          if (recovered.ok) onRecovered?.(recovered);
          setReply(recovered);
          setError(recovered.ok ? null : recovered.error?.message ?? '原操作已明确拒绝且没有效果，可修正后重新提交');
          clearSavedRequest();
        }
      }
    } catch (failure) { if (active.current) setError(formatError(failure)); }
    finally { busy.current = false; if (active.current) setPending(false); }
  }
  return { pending, error, reply, unresolved, blocked: !!unresolved || !!storageError, storageError, reloadPending, run, inspect };
}

function OperationState({ command, onRecovered }: { command: ReturnType<typeof useSwaCommand>; controller?: string; onRecovered?: (reply: SwaEnvelope) => void }) {
  return <div aria-live="polite">{command.pending && <p role="status">正在提交…</p>}{command.error && <p role="alert">{command.error}</p>}{command.storageError && <button type="button" className="ac-button secondary compact" disabled={command.pending} onClick={command.reloadPending}>重新读取请求记录</button>}{command.unresolved && <div role="alert"><p>操作结果未知 · {command.unresolved.action} · 请求 {command.unresolved.requestID}。不会自动重发，请查询原请求。</p><button className="ac-button secondary compact" type="button" disabled={command.pending} onClick={() => { void command.inspect(onRecovered); }}>查询原请求</button></div>}{command.reply && <details open><summary>命令回执 · {command.reply.ok ? '已返回' : '未确认成功'}</summary><pre className={styles.output}>{observationJSON(command.reply)}</pre></details>}</div>;
}
