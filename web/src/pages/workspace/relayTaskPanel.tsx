import { useState } from 'react';
import { relayApi, type RelayReceipt, type RelayTaskView, type RelayTaskResult } from '../../api/relay';
import { useReadApi } from '../../hooks/useReadApi';
import { QueryState } from '../../components/QueryState';
import { Field } from '../../components/DetailPanel';
import { EventTable } from './relayEventTable';
import { useRelayCommand } from './relayCommand';
import { RelayIntentPanel } from './relayIntentPanel';
import { relayActionLabel, relayDisplayState, relayElapsed, relayLivenessLabel, relayReceiptLabel, relayUnresolved, relaySingleInput } from './relayPresentation';
import { RelayReceipts } from './relayReceipts';
import { RelayTransitionControls } from './relayTransitionControls';
import { RelayRuntimeFacts } from './relayFacts';

export function RelayTaskSummary({ view, workName }: { view: RelayTaskView; workName?: string }) {
  return <div className="relay-task-summary">
    <Field label="任务 ID"><code>{view.task.task_id}</code></Field>
    <Field label="Agent">{view.task.agent}</Field><Field label="作品">{workName || view.task.work_id}</Field>
    <Field label="分支">{view.worktree?.branch || '工作区尚未准备'}</Field>
    <Field label="当前状态">{relayDisplayState(view)}</Field>
    <p className="relay-note">原生回合开始、输入消费与人工目标声明见动作事实，缺少证据时保持未知。</p>
    <Field label="已持续时间">{relayElapsed(view)}</Field>
    <Field label="终端活性"><span className={`relay-liveness relay-${view.terminal?.liveness || 'unverifiable'}`}>{view.terminal ? relayLivenessLabel[view.terminal.liveness] : '终端尚未创建 · 活性未知'}</span></Field>
    {view.terminal && <Field label="终端 ID">{view.terminal.terminal_id}</Field>}
    {view.task.degraded_launch && <p role="status">degraded_launch · 服务端已安全降级为终端路径</p>}
    <Field label="事件接入">{{ none: '尚无事件', pending: '等待接入', published: '已接入本机应用事件', error: '事件接入失败' }[view.event_publication.status]} · 待接入 {view.event_publication.pending_events} · 已接入 {view.event_publication.published_events}</Field>
  </div>;
}

export function RelayTaskPanel({ taskID, onChanged }: { taskID: string; onChanged: () => void }) {
  const task = useReadApi(signal => relayApi.task(taskID, signal), { key: taskID, refreshMs: 3000 });
  const events = useReadApi(signal => relayApi.events(taskID, signal), { key: taskID, refreshMs: 3000 });
  const receipts = useReadApi(signal => relayApi.receipts(taskID, signal), { key: taskID, refreshMs: 3000 });
  const facts = useReadApi(signal => relayApi.facts(taskID, signal), { key: taskID, refreshMs: 3000 });
  const projects = useReadApi(signal => relayApi.projects(signal), { refreshMs: 5000 });
  const registry = useReadApi(signal => relayApi.agents(signal));
  const [input, setInput] = useState('');
  const send = useRelayCommand(`send:${taskID}`), read = useRelayCommand(`read:${taskID}`), stop = useRelayCommand(`stop:${taskID}`);
  const reconcile = useRelayCommand<RelayTaskResult>(`reconcile:${taskID}`);
  const changed = () => { task.retry(); events.retry(); receipts.retry(); facts.retry(); onChanged(); };
  const view = task.data?.view;
  const permission = projects.data?.projects.find(project => project.project_id === view?.task.project_id);
  const singleInput = relaySingleInput(view?.terminal ?? null, registry.data?.agents.find(agent => agent.name === view?.task.agent));
  const active = view && ['accepted', 'working', 'done'].includes(view.task.state) && !!view.terminal;
  const unavailable = !active || task.stale || receipts.stale || projects.stale || !receipts.data || !permission;
  const pending = send.pending || read.pending || stop.pending || reconcile.pending;
  const currentControllerUnavailable = !facts.data || facts.loading || facts.stale || facts.data.current_ownership.status !== 'confirmed';
  const pendingReceipt = receipts.data?.receipts.some(receipt => receipt.status === 'pending');
  const disabled = (action: RelayReceipt['action']) => unavailable || pending || !permission?.allowed_actions.includes(action === 'read' ? 'observe' : action) || relayUnresolved(receipts.data?.receipts || [], action) ||
    (['read', 'send', 'stop'].includes(action) && (currentControllerUnavailable || pendingReceipt)) ||
    (action === 'read' && (view?.terminal?.liveness === 'exited' || !!view?.terminal?.exited_at || view?.task.condition === 'terminal_exited' || view?.task.condition === 'delivery_unknown')) ||
    (action === 'send' && (singleInput || view?.task.state === 'done' || view?.task.condition === 'delivery_unknown' || view?.task.condition === 'terminal_exited' || view?.terminal?.liveness === 'exited')) || (action === 'stop' && view?.terminal?.liveness === 'exited');
  return <div className="relay-flow">
    <QueryState state={task}>{data => <><RelayTaskSummary view={data.view} />
      {data.view.task.state === 'ready' && <RelayIntentPanel existing={data.view} onChanged={changed} />}
      {data.view.task.condition === 'terminal_exited' && <p role="alert">终端退出，任务未完成；不会自动重派。</p>}
      {data.view.worktree && <Field label="中性工作区"><code>{data.view.worktree.worktree_id} · {data.view.worktree.root}</code></Field>}
      <details><summary>服务端持久状态迁移</summary><ol>{data.view.transitions.map((transition, index) => <li key={`${transition.ts}-${index}`}>{transition.from} → {transition.to} · {transition.ts} · {transition.operator}</li>)}</ol>{!data.view.transitions.length && <p>尚无状态迁移记录。</p>}</details>
      <RelayTransitionControls view={data.view} disabled={task.stale || receipts.stale || projects.stale || !receipts.data || pending || !permission?.allowed_actions.includes('observe') || relayUnresolved(receipts.data?.receipts || [], 'transition') || !!receipts.data?.receipts.some(receipt => receipt.status === 'pending')} transition={(body, key) => relayApi.transition(taskID, body, key)} onChanged={changed} />
    </>}</QueryState>
    <QueryState state={projects}>{() => null}</QueryState>
    <QueryState state={registry}>{() => null}</QueryState>
    <section aria-label="动作事实与会话关系"><h3>动作事实与会话关系</h3><QueryState state={facts}>{data => <RelayRuntimeFacts data={data} />}</QueryState></section>
    {singleInput && <p role="status">当前终端登记为一次性输入：首条手册与任务发送后关闭标准输入，不支持继续发送；仍可读取和停止。</p>}
    <form onSubmit={event => { event.preventDefault(); if (!disabled('send') && !send.uncertain && input.trim()) void send.run(key => relayApi.send(taskID, input, key), result => { if (result.receipt.status === 'accepted' && !result.receipt.error) setInput(''); changed(); }); }}>
      <label>发送输入<textarea aria-label="发送输入" value={input} onChange={event => setInput(event.target.value)} rows={4} disabled={pending || singleInput} /></label>
      <div className="relay-card-actions">
        <button type="submit" className="ac-button compact" disabled={!!disabled('send') || send.uncertain || !input.trim()}>发送输入</button>
        <button type="button" className="ac-button secondary compact" disabled={!!disabled('read') || read.uncertain} onClick={() => { void read.run(key => relayApi.read(taskID, key), changed); }}>读取会话并留收据</button>
        <button type="button" className="ac-button secondary compact" disabled={!!disabled('stop') || stop.uncertain} onClick={() => { void stop.run(key => relayApi.stop(taskID, key), changed); }}>停止 Agent</button>
      </div>
    </form>
    {[send, read, stop].map((command, index) => <div key={index}>{command.error && <p role="alert">{command.error} · 操作 {command.operationID}</p>}{command.uncertain && <p role="alert">动作结果未知，保留输入并禁止重复该动作；读取收据核对。</p>}{command.result && <p role="status">{relayActionLabel[command.result.receipt.action]}收据 {command.result.receipt.receipt_id} · {relayReceiptLabel[command.result.receipt.status]}</p>}</div>)}
    <button type="button" className="ac-button secondary compact" onClick={changed}>只读取任务、事件和收据</button>
    <section aria-label="任务收据"><h3>动作收据</h3><QueryState state={receipts}>{data => <RelayReceipts receipts={data.receipts} />}</QueryState></section>
    <section aria-label="任务事件流"><h3>任务事件</h3><p className="relay-note">按时间倒序 · 仅六个派生字段</p><QueryState state={events}>{data => <EventTable events={[...data.events].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts) || a.event_id.localeCompare(b.event_id))} />}</QueryState></section>
    <p className="relay-note">事件接入状态指本机应用事件存储。Today 展示 Session 派生事件，认知数值来自已发布快照。</p>
    <button type="button" className="ac-button secondary compact" disabled={pending || reconcile.uncertain || !permission?.allowed_actions.includes('reconcile') || task.stale || receipts.stale || projects.stale || !receipts.data || relayUnresolved(receipts.data?.receipts || [], 'reconcile_events')} onClick={() => { void reconcile.run(key => relayApi.reconcileEvents(taskID, key), changed); }}>核对事件接入</button>
    {reconcile.error && <p role="alert">{reconcile.error} · 操作 {reconcile.operationID}</p>}
    {reconcile.uncertain && <p role="alert">事件核对结果未知，不重复提交；请读取收据。</p>}
    <p className="relay-note">认知活动由独立 Astrocyte 工作台提供，请在对应产品中查看。</p>
  </div>;
}
