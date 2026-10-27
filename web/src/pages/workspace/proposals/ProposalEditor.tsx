import { useState } from 'react';
import { proposalsApi, type Proposal } from '../../../api/proposals';
import { localProjectsApi } from '../../../api/s1';
import type { components } from '../../../api/schema';
import { useReadApi } from '../../../hooks/useReadApi';
import { useProjectSpaces } from '../../../hooks/useAttention';
import { usePersistentCommand } from '../../../hooks/usePersistentCommand';
import { CommandState } from '../../../components/CommandState';
import { QueryState } from '../../../components/QueryState';
import { commandError } from '../../../utils/commandError';
import { SelectField } from '../../../components/FormControls';
import { ProposalContentFields } from './ProposalContentFields';
import { FixedInputPicker } from './FixedInputPicker';
import { ProposalRevision } from './ProposalRevision';
import { contentToDraft, draftToContent, newProposalDraft } from './proposalDraft';
import styles from './ProposalWorkspace.module.css';

type Result = components['schemas']['S2ProposalResultV1'];
type Reference = components['schemas']['FixedReferenceV1'];

export function ProposalEditor({ initial, latest, disabled = false, onSaved }: { initial?: Proposal; latest?: Proposal; disabled?: boolean; onSaved: (proposal: Proposal) => void }) {
  const [draft, setDraft] = useState(() => initial ? contentToDraft(initial.content) : newProposalDraft());
  const [inputs, setInputs] = useState<Reference[]>(() => initial?.content.inputs ?? []);
  const [expectedVersion, setExpectedVersion] = useState(initial?.version ?? 0);
  const [validation, setValidation] = useState('');
  const projects = useReadApi(signal => localProjectsApi.listProjects({ signal }), { key: 'proposal-editor-projects' });
  const goals = useReadApi(signal => proposalsApi.goals(signal), { key: 'proposal-editor-goals' });
  const spaces = useProjectSpaces();
  const command = usePersistentCommand<Result>(initial ? `proposal:${initial.id}:revise` : 'proposal:create', () => ({ status: 'succeeded', message: '提案版本已保存' }), { failureMessage: cause => commandError(cause).message });
  const unavailable = disabled || command.pending || command.uncertain || projects.loading || projects.stale || !projects.data || goals.loading || goals.stale || !goals.data || spaces.loading || spaces.stale || !spaces.data;
  const project = projects.data?.items.find(value => value.id === draft.projectId);
  const available = spaces.data?.items.find(space => space.id === project?.space_id)?.material_refs ?? [];
  const goalOptions = (goals.data?.items ?? []).filter(goal => goal.project_id === draft.projectId).map(goal => ({ value: `${goal.id}@${goal.revision}`, label: `${goal.title} · r${goal.revision}` }));
  const goalValue = draft.goalId ? `${draft.goalId}@${draft.goalRevision}` : '';
  const projectLocked = !!initial?.content.scope.project_id;
  return <form className={styles.formFields} onSubmit={event => {
    event.preventDefault();
    if (unavailable || !project) return;
    let content: components['schemas']['S2ProposalContentV1'];
    try { content = draftToContent(draft, inputs, project.settings.revision, initial?.content); }
    catch (cause) { setValidation(cause instanceof Error ? cause.message : '请核对提案内容'); return; }
    setValidation('');
    void command.run(key => {
      const body = { schema_version: 1 as const, request_id: key, expected_version: expectedVersion, content };
      return initial ? proposalsApi.reviseProposal(initial.id, body, key) : proposalsApi.createProposal(body, key);
    }, (result, outcome) => { if (outcome.status === 'succeeded') onSaved(result.proposal); });
  }}>
    <QueryState state={projects}>{data => <SelectField label="选择已登记项目" value={draft.projectId} disabled={unavailable || projectLocked} options={[{ value: '', label: '请选择项目' }, ...data.items.map(value => ({ value: value.id, label: value.name }))]} onChange={projectId => { setDraft({ ...draft, projectId, goalId: '', goalRevision: '', roots: '', writePaths: '', actions: '', tools: '', externalTargets: '' }); setInputs([]); }} />}</QueryState>
    <QueryState state={goals}>{() => <SelectField label="选择已保存目标" value={goalValue} disabled={unavailable} options={[{ value: '', label: '请选择固定目标版本' }, ...(!goalValue || goalOptions.some(value => value.value === goalValue) ? [] : [{ value: goalValue, label: `当前填写的固定引用 · ${draft.goalId} · r${draft.goalRevision}` }]), ...goalOptions]} onChange={value => {
      const goal = goals.data?.items.find(item => `${item.id}@${item.revision}` === value);
      if (!goal && value) throw new Error('所选目标版本不在当前已读取记录中');
      setDraft({ ...draft, goalId: goal?.id ?? '', goalRevision: goal ? String(goal.revision) : '' });
    }} />}</QueryState>
    {project && <div><p>本次保存使用项目权限版本 r{project.settings.revision}。已许可目录：{project.settings.allowed_subdirs.join('；') || '无'}。</p><p>项目允许动作：{project.settings.allowed_actions.join('；') || '无'}。原生控制：{project.settings.allow_agent_control ? '已许可' : '未许可'}。</p><p>项目允许工具：{project.settings.allowed_tools.join('；') || '无'}。模型 CLI：{project.settings.external_model_cli || '未配置'}。</p></div>}
    <ProposalContentFields draft={draft} disabled={unavailable} projectLocked={projectLocked} onChange={next => { if (next.projectId !== draft.projectId) setInputs([]); setDraft(next); }} />
    <QueryState state={spaces}>{() => <FixedInputPicker available={available} selected={inputs} disabled={unavailable} onChange={setInputs} />}</QueryState>
    {validation && <p role="alert">{validation} 输入已保留。</p>}
    <CommandState {...command} />
    {command.uncertain && <p role="alert">原请求 {command.operationID} 的结果未知，重新打开或刷新后仍禁止重发。请只读取当前提案核对。</p>}
    {initial && latest && latest.version !== expectedVersion && <details><summary>核对最新提案 r{latest.revision} · v{latest.version}</summary><ProposalRevision proposal={latest} /><p>编辑内容已保留。核对最新记录后，可明确选择本次保存使用的版本。</p><button className="ac-button secondary compact" type="button" disabled={unavailable} onClick={() => setExpectedVersion(latest.version)}>使用已核对的最新记录版本</button></details>}
    <button type="submit" className="ac-button" disabled={unavailable || !project}>{initial ? '保存新版本' : '保存提案草稿'}</button>
  </form>;
}
