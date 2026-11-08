import type { RelayFacts } from '../../api/relay';
import { Field } from '../../components/DetailPanel';
import { formatDate } from './relayEventFormat';

const kindLabels: Record<RelayFacts['facts'][number]['kind'], string> = {
  action_claimed: '动作执行权已记录', action_result: '动作结果', observation_rejected: '观察拒绝',
  handoff_declared: '人工上下文交接声明', human_target_confirmed: '人工目标声明',
  resources_released: '执行资源释放', input_result: '输入交付结果',
  controller_initialized: '控制器初始化', session_confirmed: '原生会话确认',
  input_channel_open: '输入通道开放', input_written: '输入通道写入', input_closed: '输入通道关闭',
  input_accepted: '客户端接受输入', turn_started: '原生回合开始', input_consumption: '客户端消费输入',
};
const statusLabels: Record<RelayFacts['facts'][number]['status'], string> = {
  confirmed: '已确认', unknown: '未知', pending: '等待结果', accepted: '动作已接受', rejected: '已拒绝', delivery_unknown: '交付未知',
};
const relationLabels: Record<RelayFacts['session_relations'][number]['kind'], string> = {
  new: '新会话', resume: '恢复原会话', handoff: '跨 Agent 上下文交接', unknown: '会话关系未知',
};

export function RelayRuntimeFacts({ data }: { data: RelayFacts }) {
  return <div className="relay-flow">
    <Field label="当前控制器归属">{data.current_ownership.status === 'confirmed' ? '当前原控制器归属已确认' : '当前原控制器归属未知'}{data.current_ownership.reason && ` · ${data.current_ownership.reason}`}</Field>
    <p className="relay-note">当前归属、历史事实与终端活性分别核查。动作接受、输入写入和原生回合结束均不证明人工目标通过；缺少的初始化、开始或消费证据保持未知。</p>
    {!data.facts.length ? <p role="status">尚无已记录动作事实；输入与原生执行证据未知。</p> : <ol aria-label="已记录动作事实">{data.facts.map(fact => <li key={fact.fact_id}>
      <strong>{kindLabels[fact.kind]}</strong> · {statusLabels[fact.status]} · {formatDate(fact.ts)}
      <div>来源 {fact.source}{fact.reason && ` · ${fact.reason}`}</div>
      <div>事实 ID <code>{fact.fact_id}</code>{fact.operation_id && <> · 操作 <code>{fact.operation_id}</code></>}{fact.receipt_id && <> · 原收据 <code>{fact.receipt_id}</code></>}</div>
    </li>)}</ol>}
    {!data.session_relations.length ? <p role="status">尚无已记录会话关系；不能据历史终端或工作区推断交接。</p> : <ol aria-label="已记录会话关系">{data.session_relations.map((relation, index) => <li key={`${relation.operation_id}:${relation.kind}:${relation.status}:${index}`}>
      <strong>{relationLabels[relation.kind]}</strong> · {statusLabels[relation.status]} · {formatDate(relation.ts)}
      <div>来源 {relation.source} · 操作 <code>{relation.operation_id}</code>{relation.previous_task_id && <> · 原任务 <code>{relation.previous_task_id}</code></>}</div>
      {relation.source === 'human_intent' && <p>人工声明已记录，新执行者的原生会话确认仍须另行核查。</p>}
    </li>)}</ol>}
  </div>;
}
