import type { CognitionEvent } from '../../api/cognitionTypes';
import { EmptyState } from '../../components/EmptyState';
import { formatDate, formatNumber } from './relayEventFormat';
import '../../styles/relaySession.css';

export function EventTable({ events }: { events: CognitionEvent[] }) {
  if (!events.length) return <EmptyState title="当前条件下没有事件" />;
  return <div className="cg-table-scroll"><table className="cg-events"><thead><tr><th>事件 ID</th><th>类型</th><th>主题</th><th>Token 数</th><th>范围</th><th>时间（上海）</th></tr></thead><tbody>{events.map(event => <tr key={event.event_id}><td className="cg-event-id">{event.event_id}</td><td>{event.kind}</td><td>{event.topic || '未标注'}</td><td>{formatNumber(event.tokens)}</td><td>{event.scope || '未标注'}</td><td className="cg-nowrap">{formatDate(event.ts)}</td></tr>)}</tbody></table></div>;
}
