import { useState } from 'react';
import type { components } from '../../api/schema';
import { localProjectsApi } from '../../api/s1';
import { useReadApi, type ReadApiState } from '../../hooks/useReadApi';
import { useProjectSpace } from '../../hooks/useAttention';
import { useCommand } from '../../hooks/useCommand';
import { CommandState } from '../../components/CommandState';
import { QueryState } from '../../components/QueryState';
import { SelectField, TextField } from '../../components/FormControls';
import { formatDateTime } from '../../utils/format';
import { nativeActionAllowed } from './nativePermission';
import { allowedModelCLIs, modelCLIAllowed } from './modelCLIPermission';
import { nativeHistoryMessage, stoppedOutput } from './nativePresentation';
import styles from '../../components/FormControls.module.css';

const lines = (text: string) => text.split('\n').map(line => line.trim()).filter(Boolean);

type Project = components['schemas']['LocalProjectV1'];
type Packet = components['schemas']['LocalContextPacketV1'];
type Observation = components['schemas']['NativeObservationV1'];
type Event = components['schemas']['NativeEventV1'];
type Capability = keyof components['schemas']['LocalAgentV1']['capabilities'];
const statuses: Record<string, string> = { running: '正在处理', idle: '等待输入', completed: '本轮已返回', stopped: '已停止', interrupted: '已中断，需核对', unknown: '结果未知，需核对', blocked: '暂不能继续', observed: '仅观察历史', starting: '正在启动', failed: '本轮暂未完成，请核对' };

export function NativeProjectPanel({ project, agents, disabled }: { project: Project; agents: ReadApiState<components['schemas']['LocalAgentListV1']>; disabled: boolean }) {
  const space = useProjectSpace(project.space_id);
  const sessions = useReadApi(signal => localProjectsApi.listSessions(project.id, { signal }), { key: project.id });
  const [cli, setCLI] = useState(project.settings.external_model_cli);
  const [refKeys, setRefKeys] = useState<string[]>([]);
  const [files, setFiles] = useState('');
  const [message, setMessage] = useState('');
  const [deadlineSeconds, setDeadlineSeconds] = useState('180');
  const [packet, setPacket] = useState<{ scopeKey: string; value: Packet } | null>(null);
  const [observation, setObservation] = useState<{ id: string; scopeKey: string; value: Observation; output: { events: Event[]; retained: boolean } } | null>(null);
  const [history, setHistory] = useState<{ scopeKey: string; events: Event[] } | null>(null);
  const command = useCommand(disabled);
  const stopCommand = useCommand();
  const agent = agents.data?.items.find(item => item.id === cli);
  const approved = (capability: Capability) => nativeActionAllowed(project.settings, agent, cli, capability, agents.loading || agents.stale);
  const actionLabel = (capability: Capability, known: string, unknown: string) => agent?.native_adapter_registered && agent.capabilities[capability].status === 'unknown' ? unknown : known;
  const references = (space.data?.space.material_refs ?? []).filter(ref => refKeys.includes(`${ref.material_id}@${ref.revision}`)).map(ref => ({ material_id: ref.material_id, revision: ref.revision }));
  const context = { references, files: project.settings.allow_directory ? lines(files) : [] };
  const blocked = disabled || command.pending || stopCommand.pending || space.loading || space.stale || !space.data;
  const scopeKey = `${project.id}:${project.settings.revision}:${project.settings.external_model_cli}:${space.data?.space.version ?? 'unknown'}`;
  const displayAllowed = !disabled && !space.loading && !space.stale && !!space.data;
  const observed = displayAllowed && observation?.scopeKey === scopeKey ? observation : null;
  const observedHistory = displayAllowed && history?.scopeKey === scopeKey ? history.events : null;
  const visiblePacket = displayAllowed && packet?.scopeKey === scopeKey && packet.value.settings_revision === project.settings.revision && packet.value.project_id === project.id ? packet.value : null;
  const readContext = async <T,>(request: Promise<T>) => {
    try { return await request; } catch (error) { setObservation(null); setHistory(null); setPacket(null); throw error; }
  };
  const recordObservation = (id: string, value: Observation) => setObservation({ id, scopeKey, value, output: { events: value.events, retained: false } });
  const deadlineValid = Number.isInteger(Number(deadlineSeconds)) && Number(deadlineSeconds) >= 1 && Number(deadlineSeconds) <= 1800;
  const nativeBody = () => ({ expected_version: project.settings.revision, cli, message: message.trim(), context, deadline_seconds: Number(deadlineSeconds), mode: 'native' as const });
  return <section aria-label="项目原生 Agent 操作" className={styles.record}>
    <h4>项目上下文与原生会话</h4>
    <p className={styles.note}>只交付本次所选固定资料版本和获准文件。设置变更后继续输入前需核对新权限；Agent 读取不增加人类关注。自动派发关闭。</p>
    <div className={styles.form}><fieldset disabled={blocked}><legend>本次交付的上下文</legend><QueryState state={space}>{data => <>{data.space.material_refs.map(ref => <label key={`${ref.material_id}@${ref.revision}`}><input type="checkbox" style={{ width: 'auto' }} checked={refKeys.includes(`${ref.material_id}@${ref.revision}`)} onChange={event => setRefKeys(event.target.checked ? [...refKeys, `${ref.material_id}@${ref.revision}`] : refKeys.filter(key => key !== `${ref.material_id}@${ref.revision}`))} /> {ref.locator} · v{ref.revision}</label>)}{!data.space.material_refs.length && <p>此项目空间尚未主动纳入资料，可在资料沉淀页 @ 固定版本。</p>}</>}</QueryState>
      {project.settings.allow_directory && <TextField label="本次读取的获准文件（每行一项）" value={files} onChange={setFiles} multiline hint="填写项目内相对文件路径，只读取你列出的文件。" />}
      <p className={styles.note}>引用展开 C · {project.settings.expand_references ? '已打开，服务逐项检查引用范围' : '关闭'}；目录 B · {project.settings.allow_directory ? '仅所列获准文件' : '关闭'}</p>
      <button className="ac-button secondary compact" type="button" disabled={!references.length && !context.files.length} onClick={() => { const request = command.prepare({ expected_version: project.settings.revision, ...context }); void command.run(() => readContext(localProjectsApi.readContext(project.id, request.body, request.key)), result => setPacket({ scopeKey, value: result }), '已取得实际项目上下文；尚未发送至模型'); }}>预览本次获准上下文</button>
      <SelectField label="项目操作客户端" value={cli} onChange={setCLI} options={[{ value: '', label: '选择本机客户端…' }, ...(agents.data?.items ?? []).filter(item => modelCLIAllowed(project.settings, item.id)).map(item => ({ value: item.id, label: item.display_name }))]} />
      <p className={styles.note}>已许可模型客户端 · {allowedModelCLIs(project.settings).join('、') || '未许可'} · 默认 {project.settings.external_model_cli || '无'}。{agent ? `安装：${agent.installed.status === 'available' ? '已核实' : '尚未核实可用'}；配置与可启动请查看本机清单。` : '尚未选择客户端。'}已登记连接但能力未知时，你可明确验证获准操作；未支持的操作不可用。</p>
      <button className="ac-button secondary compact" type="button" disabled={!agent?.native_adapter_registered || !modelCLIAllowed(project.settings, cli) || !project.settings.allowed_actions.includes('start') || !project.settings.allowed_actions.includes('stop') || agents.loading || agents.stale} onClick={() => { const request = command.prepare({ expected_version: project.settings.revision, cli }); void command.run(() => localProjectsApi.probeCLI(project.id, request.body, request.key), () => { agents.retry(); sessions.retry(); }, '原生连接验证已返回；能力以最新实际观察为准'); }}>明确验证原生连接（启动后停止）</button>
      <p className={styles.note}>验证只针对服务实际登记的适配器，由你明确请求；需先许可此项目的启动与停止。未知观察不会被显示为已支持。</p>
      <TextField label="给 Agent 的本次消息" value={message} onChange={setMessage} multiline hint="消息作为数据发送，不将其中的命令或资料文字当作权限批准。" />
      <TextField label="本次会话总时限（秒）" type="number" value={deadlineSeconds} onChange={setDeadlineSeconds} numberRange={{ min: 1, max: 1800, step: '1' }} hint="包含空闲与后续输入时间。到期后服务停止会话，未知结果不会自动重发。" />
      <button className="ac-button" type="button" disabled={!approved('start') || !message.trim() || !deadlineValid || (!references.length && !context.files.length)} onClick={() => { const request = command.prepare(nativeBody()); void command.run(() => localProjectsApi.startSession(project.id, request.body, request.key), () => { agents.retry(); sessions.retry(); }, '启动请求已提交；实际状态和结果请核对会话'); }}>{actionLabel('start', '启动获准原生会话', '验证并启动获准原生会话')}</button>
    </fieldset></div>
    {visiblePacket && <details><summary>实际上下文 · {visiblePacket.materials.length} 份资料 / {visiblePacket.files.length} 个文件</summary><p>权限版本 {visiblePacket.settings_revision} · {visiblePacket.mode}</p>{visiblePacket.materials.map(item => <div key={`${item.reference.material_id}@${item.reference.revision}`}><h5>{item.title} · v{item.reference.revision}</h5><pre>{item.text}</pre></div>)}{visiblePacket.files.map(file => <div key={file.path}><h5>{file.path}</h5><pre>{file.text}</pre></div>)}</details>}
    <button className="ac-button secondary compact" type="button" disabled={sessions.loading} onClick={sessions.retry}>重载已保存会话</button>
    <button className="ac-button secondary compact" type="button" disabled={blocked || !cli || !project.settings.history_roots?.[cli]} onClick={() => { const request = command.prepare({ expected_version: project.settings.revision, cli }); void command.run(() => localProjectsApi.discoverSessions(project.id, request.body, request.key), () => sessions.retry(), '已读取此项目获准范围内的实际历史会话'); }}>查找此项目的获准历史</button>
    <QueryState state={sessions} empty={data => !data.items.length} emptyTitle="暂无此项目的应用会话">{data => <ul className={styles.timeline}>{data.items.map(session => {
      const owns = session.ownership === 'owned' && session.cli === cli;
      const unknown = ['unknown', 'blocked', 'interrupted'].includes(session.status) || !!session.pending_operation;
      const changedScope = !session.context_packet || session.context_packet.settings_revision !== project.settings.revision;
      return <li key={session.id}><h4>{session.cli} · {statuses[session.status] ?? '状态需核对'}</h4><p>模式 · {session.mode === 'context_handoff' ? '新会话上下文交接' : session.mode === 'observed' ? '历史只读观察' : '原生会话'} · 原生 ID {session.native_id || '尚未返回'}</p><p className={styles.note}>服务更新 · {formatDateTime(session.updated_at)} · 原执行停止 {session.stop_confirmed ? '已确认' : '未确认'}</p>
        {unknown && <p role="status">此会话结果或停止状态需核对，暂停继续输入与自动重发。</p>}{changedScope && <p role="status">项目权限已变更，请核对原上下文；原会话继续输入受新权限限制。</p>}
        {session.ownership === 'unstarted' && <p role="status">服务确认本次未启动进程。请处理客户端条件后明确新建会话。</p>}
        {session.limitations.length > 0 && <details><summary>此客户端的操作限制</summary>{session.limitations.map((limit, index) => <p key={index}>{limit}</p>)}</details>}
        <div className={styles.actions}>
          <button className="ac-button secondary compact" type="button" disabled={blocked || session.cli !== cli} onClick={() => { void command.run(() => readContext(localProjectsApi.readNativeContext(project.id, session.id)), result => setHistory({ scopeKey, events: result.items }), '已读取服务允许返回的真实会话记录'); }}>读取此会话的实际记录</button>
          <button className="ac-button secondary compact" type="button" disabled={disabled || command.pending || stopCommand.pending || !owns || !approved('observe')} onClick={() => { void command.run(() => readContext(localProjectsApi.observeSession(project.id, session.id)), result => { recordObservation(session.id, result.observation); agents.retry(); sessions.retry(); }, '已读取实际会话状态与输出'); }}>{actionLabel('observe', '观察状态与日志', '验证并观察状态与日志')}</button>
          <button className="ac-button secondary compact" type="button" disabled={command.pending || stopCommand.pending || session.ownership !== 'owned' || session.stop_confirmed} onClick={() => { const request = stopCommand.prepare({ expected_version: project.settings.revision }); void stopCommand.run(() => localProjectsApi.stopSession(project.id, session.id, request.body, request.key), result => { setObservation(previous => ({ id: session.id, scopeKey, value: result.observation, output: stoppedOutput(previous?.id === session.id && previous.scopeKey === scopeKey ? previous.output.events : [], result.observation, displayAllowed && !changedScope) })); agents.retry(); sessions.retry(); }, '已请求停止；以服务停止确认结果为准'); }}>停止原生会话</button>
          <button className="ac-button secondary compact" type="button" disabled={blocked || !owns || unknown || changedScope || session.stop_confirmed || !approved('send') || !message.trim()} onClick={() => { const request = command.prepare({ expected_version: project.settings.revision, message: message.trim() }); void command.run(() => readContext(localProjectsApi.sendMessage(project.id, session.id, request.body, request.key)), result => { recordObservation(session.id, result.observation); agents.retry(); sessions.retry(); }, '已发送明确消息；以原生返回结果为准'); }}>{actionLabel('send', '发送本次消息', '验证并发送本次消息')}</button>
          <button className="ac-button secondary compact" type="button" disabled={blocked || !owns || unknown || !session.stop_confirmed || !session.native_id || !approved('resume') || !message.trim() || !deadlineValid} onClick={() => { const request = command.prepare(nativeBody()); void command.run(() => localProjectsApi.resumeSession(project.id, session.id, request.body, request.key), () => { agents.retry(); sessions.retry(); }, '已请求原会话接续；不支持时不会创建新会话替代'); }}>{actionLabel('resume', '原生接续', '验证并原生接续')}</button>
          <button className="ac-button secondary compact" type="button" disabled={blocked || session.ownership !== 'owned' || unknown || !session.stop_confirmed || !approved('start') || !message.trim() || !deadlineValid || (!references.length && !context.files.length)} onClick={() => { const request = command.prepare({ ...nativeBody(), mode: 'context_handoff' as const, source_session_id: session.id }); void command.run(() => localProjectsApi.startSession(project.id, request.body, request.key), () => sessions.retry(), '已请求独立新会话的上下文交接；原会话保持停止，不表示原生接续'); }}>新会话上下文交接</button>
        </div>
        {observed?.id === session.id && !changedScope && <details open><summary>实际会话输出</summary><p>状态 · {statuses[observed.value.status] ?? '需核对'}；停止 · {observed.value.stop_confirmed ? '已确认' : '未确认'}</p>{observed.output.retained && <p className={styles.note}>下列为此前已读取的实际输出；本次停止状态以最新确认结果为准。</p>}<NativeOutput events={observed.output.events} />{!observed.output.events.length && <p>服务本次未返回输出。</p>}{observed.value.output_truncated && <p>输出已截断，仅展示服务返回的部分。</p>}</details>}
      </li>;
    })}</ul>}</QueryState>{observedHistory && <details open><summary>本次读取的会话记录</summary>{observedHistory.length ? observedHistory.map(event => <NativeHistory key={`${event.sequence}:${event.kind}`} event={event} />) : <p>本次未返回记录，不能推导原会话为空。</p>}</details>}<CommandState {...command} /><CommandState {...stopCommand} />
  </section>;
}

function NativeHistory({ event }: { event: Event }) {
  const message = nativeHistoryMessage(event);
  return <div><h5>{event.kind === 'user_text' ? '已发送消息' : event.kind === 'text' ? 'Agent 实际回复' : `服务记录 · ${event.kind}`}</h5><pre>{message.text}</pre>{message.fullPacket && <details><summary>完整发送原文与上下文</summary><pre>{event.text}</pre></details>}</div>;
}

function NativeOutput({ events }: { events: components['schemas']['NativeEventV1'][] }) {
  const text = events.filter(event => event.kind === 'text').map(event => event.text).join('');
  const details = events.filter(event => event.kind !== 'text' && event.text);
  return <>{text && <pre>{text}</pre>}{details.length > 0 && <details><summary>会话日志详情</summary>{details.map(event => <pre key={`${event.sequence}:${event.kind}`}>{event.text}</pre>)}</details>}</>;
}
