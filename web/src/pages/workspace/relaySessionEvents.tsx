import { useState } from 'react';
import { relaySessionApi, type RelaySessionQuery, type RelaySessionCoverage } from '../../api/relaySession';
import { useReadApi } from '../../hooks/useReadApi';
import { QueryState } from '../../components/QueryState';
import { SectionCard } from '../../components/SectionCard';
import { EventTable } from './relayEventTable';
import { relaySessionGap, relaySessionHasGap, relaySessionQueryError } from './relaySessionPresentation';
import '../../styles/relaySession.css';

const statusLabels = { unknown: '未知', partial: '部分覆盖', complete: '完整（服务报告）' };
const sourceLabels = { unknown: '未知', archive: '获准原生归档文件', native_notifications: '原生公开通知' };
export function RelaySessionCoverageCard({ item }: { item: RelaySessionCoverage }) {
  const disputedComplete = item.status === 'complete' && (!item.source || item.source === 'unknown' || relaySessionHasGap(item) || !item.snapshot_complete || !item.session_complete);
  const notifications = item.source === 'native_notifications';
  const counts = [[notifications ? '公开通知' : item.source === 'archive' ? '完整行' : '记录（单位未提供）', item.lines], ['已派生', item.projected], ['重复', item.duplicates], ['未知格式', item.unknown], ['错误', item.errors], ['Token 未知', item.unknown_tokens], ['剩余字节', item.remaining_bytes], ['未完成尾部字节', item.tail_bytes]] as const;
  return <article className="relay-session-coverage" aria-label={`会话覆盖 ${item.task_id}`}>
    <p>任务 <code>{item.task_id}</code></p>
    <p>来源协议：{item.source ? sourceLabels[item.source] : '未提供，保持未知'}</p>
    <p>服务报告覆盖：{disputedComplete ? '完整主张尚未核实' : statusLabels[item.status]} · {item.status}</p>
    <p>{notifications ? '当前公开通知范围' : item.source === 'archive' ? '当前文件快照' : '当前来源范围'}：{item.snapshot_complete ? notifications ? '已处理当前已接收通知' : item.source === 'archive' ? '已读完当前冻结字节范围' : '服务报告已处理当前范围，来源协议仍未知' : '尚未完成或无法核实'}</p>
    <p>所选来源协议生命周期：{item.session_complete ? '服务报告已核实' : '尚未核实'}</p>
    {notifications && <p>字节计数不适用于公开通知；零字节不证明原生归档完整。协议未公开的内部事件仍在此覆盖范围之外。</p>}
    <p>缺口：{relaySessionGap(item.gap)}</p>
    {relaySessionHasGap(item) && <p role="status">仍有覆盖缺口；未知格式、错误和尾部均计入，不能据此宣称会话完整。</p>}
    <dl>{counts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </article>;
}

export function RelaySessionEvents({ revision }: { revision: number }) {
  const [task, setTask] = useState(''), [start, setStart] = useState(''), [end, setEnd] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [query, setQuery] = useState<RelaySessionQuery>({ page: 1, page_size: 50 });
  const [queryError, setQueryError] = useState('');
  const state = useReadApi(signal => relaySessionApi.events(query, signal), { key: `${revision}:${JSON.stringify(query)}`, refreshMs: 5000 });
  return <section aria-label="本机 Session 派生事件" className="relay-session">
    <SectionCard title="本机会话事件 · 独立接入库" padded actions={<button type="button" className="ac-button secondary compact" onClick={state.retry}>只读刷新会话事件</button>}>
      <p className="cg-muted">仅显示获准 Session 的六字段派生事件。本机 admission 独立于不可变认知快照，不更新 A / M / C、Sleep 或近七日数值。</p>
      <p className="cg-muted">来源绑定不代表完整覆盖；当前文件快照读完，也不代表完整会话生命周期已核实。只读刷新缓存不会启动、发送、恢复或停止 Agent。</p>
      <form className="relay-session-filters" onSubmit={event => {
        event.preventDefault();
        const next: RelaySessionQuery = { page: 1, page_size: pageSize, ...(task.trim() ? { task_id: task.trim() } : {}), ...(start.trim() ? { start: start.trim() } : {}), ...(end.trim() ? { end: end.trim() } : {}) };
        const error = relaySessionQueryError(next); setQueryError(error);
        if (!error) { if (JSON.stringify(next) === JSON.stringify(query)) state.retry(); else setQuery(next); }
      }}>
        <label className="cg-field">任务 ID<input aria-label="会话任务 ID" value={task} onChange={event => setTask(event.target.value)} placeholder="可选 UUID" /></label>
        <label className="cg-field">开始时间<input aria-label="会话开始时间" value={start} onChange={event => setStart(event.target.value)} placeholder="可选 RFC3339（含时区）" /></label>
        <label className="cg-field">结束时间<input aria-label="会话结束时间" value={end} onChange={event => setEnd(event.target.value)} placeholder="可选 RFC3339（含时区）" /></label>
        <label className="cg-field">每页条数<select aria-label="会话每页条数" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>{[1, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
        <button type="submit" className="ac-button secondary compact">读取所选事件</button>
      </form>
      {queryError && <p role="alert">{queryError} 查询未提交，保留上次结果。</p>}
      {(state.error || state.stale) && <p role="alert">当前会话覆盖未知：此次读取失败，不能用旧缓存宣称当前完整。</p>}
      <QueryState state={state.error || state.stale ? { ...state, data: null } : state}>{data => <>
        <div className="relay-session-coverages">{data.coverage.length ? data.coverage.map(item => <RelaySessionCoverageCard key={`${item.task_id}:${item.terminal_id}`} item={item} />) : <p>尚无会话覆盖证据 · unknown。空列表不证明全部会话已采集。</p>}</div>
        <p className="cg-muted">派生事件按时间倒序 · Token 缺失保持未知 · 不含原文或原生身份</p>
        {data.events.length ? <EventTable events={data.events} /> : <p>本次查询没有可展示的派生事件；空结果不证明会话完整。</p>}
        <div className="cg-pagination"><span>当前查询 {data.total} 条 · 第 {data.page} 页 · 每页 {data.page_size} 条</span><div>
          <button type="button" className="ac-button secondary compact" disabled={state.loading || !!state.error || data.page <= 1} onClick={() => setQuery({ ...query, page: data.page - 1 })}>会话上一页</button>
          <button type="button" className="ac-button secondary compact" disabled={state.loading || !!state.error || data.page * data.page_size >= data.total} onClick={() => setQuery({ ...query, page: data.page + 1 })}>会话下一页</button>
        </div></div>
      </>}</QueryState>
    </SectionCard>
  </section>;
}
