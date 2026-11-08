import { useState } from 'react';
import { workspaceContextApi, type WorkspaceContextPacketResult } from '../../../api/workspaceContext';
import type { ApprovalGrant } from '../../../api/proposals';
import { usePersistentCommand } from '../../../hooks/usePersistentCommand';
import { CommandState } from '../../../components/CommandState';
import { TextField } from '../../../components/FormControls';
import { commandError } from '../../../utils/commandError';
import { ContextPacketReference } from './ContextPacketReference';
import { lines } from './proposalDraft';
import styles from './ProposalWorkspace.module.css';

const noteFields = [
  ['decisions', '上下文关键决定'], ['results', '上下文已有结果'], ['checks', '上下文检查记录'],
  ['failures', '上下文失败记录'], ['open_questions', '上下文未解决问题'], ['next_steps', '上下文下一步'],
] as const;
type Notes = Record<typeof noteFields[number][0], string>;

export function ContextPacketWorkspace({ grant, disabled }: { grant: ApprovalGrant; disabled: boolean }) {
  const [maxBytes, setMaxBytes] = useState('');
  const [predecessor, setPredecessor] = useState('');
  const [packetInput, setPacketInput] = useState('');
  const [packetID, setPacketID] = useState('');
  const [notes, setNotes] = useState<Notes>({ decisions: '', results: '', checks: '', failures: '', open_questions: '', next_steps: '' });
  const [validation, setValidation] = useState('');
  const command = usePersistentCommand<WorkspaceContextPacketResult>(`approval:${grant.id}:context-build`, () => ({ status: 'succeeded', message: '固定上下文包已保存' }), { failureMessage: cause => commandError(cause).message });
  const permitted = grant.scope.actions?.includes('read_context');
  const blocked = disabled || grant.status !== 'active' || !permitted || command.pending || command.uncertain;
  return <section className={styles.review} aria-label="批准范围内的固定上下文">
    <h4>固定上下文包</h4>
    <p>保存当前批准、目标和资料版本与实际项目快照。重建时填写前序包 ID，原包继续保留；建立上下文后由人工另行选择会话操作。</p>
    {!permitted && <p>当前批准未包含 read_context 动作，建立上下文需要具有该动作的有效批准。</p>}
    <form className={styles.formFields} onSubmit={event => {
      event.preventDefault();
      if (blocked) return;
      const limit = Number(maxBytes);
      if (!maxBytes.trim() || !Number.isSafeInteger(limit) || limit < 1 || limit > 2 * 1024 * 1024) { setValidation('请明确填写 1 至 2097152 字节的上下文预算。'); return; }
      setValidation('');
      void command.run(key => workspaceContextApi.buildPacket({
        schema_version: 1, request_id: key, expected_version: 0, grant_id: grant.id, grant_epoch: grant.epoch,
        max_bytes: limit, predecessor_id: predecessor.trim() || undefined,
        decisions: lines(notes.decisions), results: lines(notes.results), checks: lines(notes.checks),
        failures: lines(notes.failures), open_questions: lines(notes.open_questions), next_steps: lines(notes.next_steps),
      }, key), (result, outcome) => {
        if (outcome.status === 'succeeded') { setPacketID(result.context_packet.id); setPacketInput(result.context_packet.id); }
      });
    }}>
      <fieldset disabled={blocked}><legend>建立或重建固定上下文</legend>
        <TextField label="上下文预算（字节）" value={maxBytes} onChange={setMaxBytes} type="number" numberRange={{ min: 1, max: 2 * 1024 * 1024, step: '1' }} required hint="预算包含完整约束与来源；超限由服务拒绝，输入不会截断。" />
        <TextField label="前序上下文包 ID" value={predecessor} onChange={setPredecessor} hint="重建已有上下文时填写，首次建立保持空白。" />
        {noteFields.map(([field, label]) => <TextField key={field} label={label} value={notes[field]} onChange={value => setNotes(current => ({ ...current, [field]: value }))} multiline hint="每行一项，记录真实决定、结果或待查问题。" />)}
        <button className="ac-button" type="submit">{predecessor.trim() ? '建立后继上下文包' : '建立固定上下文包'}</button>
      </fieldset>
    </form>
    {validation && <p role="alert">{validation}</p>}<CommandState {...command} />
    {command.uncertain && <p role="alert">上下文建立请求 {command.operationID} 的结果未知；关闭或刷新后保持锁定。请只读取已知包 ID 核查，读取不会重新提交。</p>}
    <form className={styles.formFields} onSubmit={event => { event.preventDefault(); if (packetInput.trim()) setPacketID(packetInput.trim()); }}>
      <TextField label="读取固定上下文包 ID" value={packetInput} onChange={setPacketInput} required />
      <button className="ac-button secondary compact" type="submit" disabled={!packetInput.trim()}>读取指定上下文包</button>
    </form>
    {!!packetID && <ContextPacketReference key={packetID} id={packetID} projectId={grant.scope.project_id} />}
  </section>;
}
