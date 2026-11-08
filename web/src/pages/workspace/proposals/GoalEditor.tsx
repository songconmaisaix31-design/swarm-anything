import { useState } from 'react';
import { proposalsApi, type Goal } from '../../../api/proposals';
import { localProjectsApi } from '../../../api/s1';
import type { components } from '../../../api/schema';
import { useReadApi } from '../../../hooks/useReadApi';
import { usePersistentCommand } from '../../../hooks/usePersistentCommand';
import { QueryState } from '../../../components/QueryState';
import { CommandState } from '../../../components/CommandState';
import { commandError } from '../../../utils/commandError';
import { SelectField, TextField } from '../../../components/FormControls';
import { lines } from './proposalDraft';
import { GoalRevision } from './GoalRevision';
import { goalStatuses } from './goalDraft';
import styles from './ProposalWorkspace.module.css';

export function GoalEditor({ initial, latest, disabled: parentDisabled = false, onSaved }: { initial?: Goal; latest?: Goal; disabled?: boolean; onSaved: (goal: Goal) => void }) {
  const [projectId, setProjectId] = useState(initial?.project_id ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [criteria, setCriteria] = useState(initial?.success_criteria.join('\n') ?? '');
  const [priority, setPriority] = useState(initial ? String(initial.priority) : '');
  const [status, setStatus] = useState<Goal['status']>(initial?.status ?? 'active');
  const [expectedRevision, setExpectedRevision] = useState(initial?.revision ?? 0);
  const [validation, setValidation] = useState('');
  const projects = useReadApi(signal => localProjectsApi.listProjects({ signal }), { key: 'goal-editor-projects' });
  const command = usePersistentCommand<components['schemas']['S2GoalResultV1']>(initial ? `goal:${initial.id}:revise` : 'goal:create', () => ({ status: 'succeeded', message: '目标版本已保存' }), { failureMessage: cause => commandError(cause).message });
  const disabled = parentDisabled || command.pending || command.uncertain || projects.loading || projects.stale || !projects.data;
  return <form className={styles.formFields} onSubmit={event => {
    event.preventDefault();
    if (disabled) return;
    if (!title.trim() || !Number.isSafeInteger(Number(priority)) || !priority.trim() || !lines(criteria).length) { setValidation('请填写目标名称、整数优先级和至少一项成功条件'); return; }
    setValidation('');
    void command.run(key => {
      const body: components['schemas']['S2GoalRequestV1'] = { schema_version: 1, request_id: key, expected_version: expectedRevision, goal: { project_id: projectId, title: title.trim(), success_criteria: lines(criteria), priority: Number(priority), status } };
      return initial ? proposalsApi.reviseGoal(initial.id, body, key) : proposalsApi.createGoal(body, key);
    }, (result, outcome) => { if (outcome.status === 'succeeded') onSaved(result.goal); });
  }}>
    <QueryState state={projects}>{data => <SelectField label="目标所属项目" value={projectId} onChange={setProjectId} disabled={disabled || !!initial} options={[{ value: '', label: '请选择项目' }, ...data.items.map(project => ({ value: project.id, label: project.name }))]} />}</QueryState>
    <fieldset disabled={disabled}><legend>目标与成功条件</legend><TextField label="目标名称" value={title} onChange={setTitle} required /><TextField label="目标成功条件" value={criteria} onChange={setCriteria} required multiline hint="每行一项可检查的成功条件。" /><TextField label="目标优先级" value={priority} onChange={setPriority} required type="number" numberRange={{ min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER, step: '1' }} /></fieldset>
    {initial && <SelectField label="目标状态" value={status} onChange={value => { const selected = goalStatuses.find(item => item.value === value); if (!selected) throw new Error('目标状态不在可选范围内'); setStatus(selected.value); }} disabled={disabled} options={goalStatuses} />}
    {initial && <p>保存将建立新的固定目标版本。历史提案和批准继续引用原目标版本。</p>}
    {validation && <p role="alert">{validation}</p>}<CommandState {...command} />
    {command.uncertain && <p role="alert">目标保存请求 {command.operationID} 的结果未知，重新打开或刷新后仍禁止重复提交；请只读取目标记录核对。</p>}
    {initial && latest && latest.revision !== expectedRevision && <details><summary>核对最新目标 r{latest.revision}</summary><GoalRevision goal={latest} /><p>编辑内容已保留。核对当前目标后，明确选择保存使用的版本。</p><button className="ac-button secondary compact" type="button" disabled={disabled} onClick={() => setExpectedRevision(latest.revision)}>使用已核对的最新目标版本</button></details>}
    <button className="ac-button" type="submit" disabled={disabled || !projectId}>{initial ? '保存目标新版本' : '保存目标'}</button>
  </form>;
}
