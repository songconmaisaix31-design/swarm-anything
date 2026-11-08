import { useState } from 'react';
import { proposalsApi } from '../../../api/proposals';
import type { components } from '../../../api/schema';
import { useReadApi } from '../../../hooks/useReadApi';
import { usePersistentCommand } from '../../../hooks/usePersistentCommand';
import { Field, FieldRow, MutedValue } from '../../../components/DetailPanel';
import { StatusBadge } from '../../../components/StatusBadge';
import { QueryState } from '../../../components/QueryState';
import { CommandState } from '../../../components/CommandState';
import { commandError } from '../../../utils/commandError';
import { TextField } from '../../../components/FormControls';
import { ContextPacketWorkspace } from './ContextPacketWorkspace';
import styles from './ProposalWorkspace.module.css';

const statusLabels = { active: '有效', revoked: '已撤销', expired: '已过期', completed: '已完成' };

export function ApprovalPanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const approval = useReadApi(signal => proposalsApi.approval(id, signal), { enabled: !!id, key: id });
  const [reason, setReason] = useState('');
  const command = usePersistentCommand<components['schemas']['S2ApprovalResultV1']>(`approval:${id || 'none'}`, () => ({ status: 'succeeded', message: '批准记录已撤销' }), { failureMessage: cause => commandError(cause).message });
  if (!id) return <p>当前提案版本尚无批准记录。</p>;
  return <section aria-label="审批授权" className={styles.review}><h4>批准记录与当前有效状态</h4><QueryState state={approval}>{({ approval: grant }) => <>
    <Field label="Grant 状态"><StatusBadge value={grant.status} label={statusLabels[grant.status]} /></Field>
    <FieldRow><Field label="批准提案版本">r{grant.proposal_revision}</Field><Field label="授权 Epoch">{grant.epoch}</Field></FieldRow>
    <Field label="批准者">{grant.approver_id}</Field><Field label="批准时间">{grant.approved_at}</Field><Field label="有效期">{grant.expires_at}</Field><Field label="状态变更时间">{grant.changed_at}</Field>
    <Field label="批准的固定目标"><code>{grant.goal.id}</code> · r{grant.goal.revision}</Field>
    <Field label="授权项目">{grant.scope.project_id}</Field><Field label="批准时的项目权限版本">r{grant.scope.settings_revision}</Field><Field label="允许根目录">{grant.scope.roots?.join('；') || <MutedValue>无</MutedValue>}</Field>
    <Field label="允许修改的路径">{grant.scope.write_paths?.join('；') || <MutedValue>无</MutedValue>}</Field>
    <Field label="允许动作">{grant.scope.actions?.join('；') || <MutedValue>无</MutedValue>}</Field>
    <Field label="允许工具">{grant.scope.tools?.join('；') || <MutedValue>无</MutedValue>}</Field>
    <Field label="允许外发目标">{grant.scope.external_targets?.join('；') || <MutedValue>无</MutedValue>}</Field>
    <Field label="最大并发数">{grant.scope.max_concurrency}</Field>
    <FieldRow><Field label="调用上限">{grant.budget.calls ?? <MutedValue>未知</MutedValue>}</Field><Field label="Token 上限">{grant.budget.tokens ?? <MutedValue>未知</MutedValue>}</Field></FieldRow>
    <Field label="费用上限">{grant.budget.money_minor === null ? <MutedValue>未知</MutedValue> : `${grant.budget.money_minor} ${grant.budget.currency}（最小货币单位）`}</Field>
    <Field label="停止条件">{grant.stops.conditions?.length ? <ul className={styles.values}>{grant.stops.conditions.map((condition, index) => <li key={`${index}:${condition}`}>{condition}</li>)}</ul> : <MutedValue>无</MutedValue>}</Field>
    <Field label="执行截止时间">{grant.stops.deadline}</Field>
    <FieldRow><Field label="最大工作项数">{grant.stops.max_work_items}</Field><Field label="最大尝试次数">{grant.stops.max_attempts}</Field></FieldRow>
    <FieldRow><Field label="连续无进展轮数上限">{grant.stops.max_no_progress_rounds}</Field><Field label="无进展时限（秒）">{grant.stops.no_progress_seconds}</Field></FieldRow>
    <Field label="Grant ID"><code>{grant.id}</code></Field>{grant.reason && <Field label="变更原因">{grant.reason}</Field>}
    <ContextPacketWorkspace key={grant.id} grant={grant} disabled={approval.loading || approval.stale || command.pending || command.uncertain} />
    <form className={styles.formFields} onSubmit={event => {
      event.preventDefault();
      if (!reason.trim() || grant.status !== 'active' || approval.loading || approval.stale || command.pending || command.uncertain) return;
      void command.run(key => proposalsApi.revokeApproval(id, { schema_version: 1, request_id: key, expected_version: grant.epoch, reason: reason.trim() }, key), (_, outcome) => { if (outcome.status === 'succeeded') { approval.retry(); onChanged(); } });
    }}><TextField label="撤销原因" value={reason} onChange={setReason} multiline required disabled={grant.status !== 'active' || command.pending || command.uncertain} /><CommandState {...command} />{command.uncertain && <p role="alert">撤销请求 {command.operationID} 的结果未知，禁止重发；请重新读取原 Grant 核对。</p>}<button className="ac-button secondary" type="submit" disabled={!reason.trim() || grant.status !== 'active' || approval.loading || approval.stale || command.pending || command.uncertain}>撤销批准</button></form>
  </>}</QueryState><button className="ac-button secondary compact" type="button" onClick={approval.retry}>重新读取批准记录</button></section>;
}
