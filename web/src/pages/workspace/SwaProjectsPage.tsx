import { useState } from 'react';
import type { components } from '../../api/schema';
import { workspaceApi } from '../../api/workspace';
import { swaApi } from '../../api/swa';
import { useReadApi } from '../../hooks/useReadState';
import { useCommand } from '../../hooks/useCommand';
import { SectionCard } from '../../components/SectionCard';
import { QueryState } from '../../components/QueryState';
import { CommandState } from '../../components/CommandState';
import { SelectField, TextField } from '../../components/FormControls';
import { ProjectSettingsForm } from './ProjectSettingsForm';
import { allowedModelCLIs } from './modelCLIPermission';
import { ProjectAgentAccess } from './ProjectAgentAccess';
import { readSwaAgents } from '../swarm/swaObservation';
import styles from '../../components/FormControls.module.css';

type Project = components['schemas']['LocalProjectV1'];

export function SwaProjectsPage() {
  const projects = useReadApi(signal => workspaceApi.listProjects({ signal }));
  const spaces = useReadApi(signal => workspaceApi.listSpaces({ signal }));
  const [selectedID, setSelectedID] = useState('');
  const [name, setName] = useState(''), [root, setRoot] = useState(''), [spaceID, setSpaceID] = useState(''), [spaceTitle, setSpaceTitle] = useState('');
  const [candidates, setCandidates] = useState<components['schemas']['LocalProjectCandidateV1'][] | null>(null);
  const command = useCommand(projects.loading || projects.stale || !projects.data);
  const selected = projects.data?.items.find(project => project.id === selectedID);
  const stale = projects.loading || projects.stale || !projects.data;
  return <SectionCard title="项目与权限" padded>
    <div className={styles.form}>
      <p className={styles.note}>登记项目目录，设置可用的 Agent、文件范围和操作权限。</p>
      <button className="ac-button secondary compact" type="button" disabled={projects.loading} onClick={projects.retry}>刷新登记项目</button>
      <QueryState state={projects} empty={data => !data.items.length} emptyTitle="尚无已登记项目">{data => <ul className={styles.list}>{data.items.map(project => <li key={project.id} className={styles.record}><button className="ac-button secondary compact" type="button" disabled={stale} aria-pressed={project.id === selectedID} onClick={() => setSelectedID(project.id)}>{project.name} · 查看项目与权限</button><code>{project.root}</code><p className={styles.note}>许可 Agent · {allowedModelCLIs(project.settings).join('、') || '尚未许可'} · 默认 {project.settings.external_model_cli || '无'} · 权限版本 {project.settings.revision}</p></li>)}</ul>}</QueryState>
      <details><summary>登记项目 / 发现子项目</summary>
        <form className={styles.form} onSubmit={event => {
          event.preventDefault(); if (stale || !spaceID || spaces.loading || spaces.stale) return;
          const request = command.prepare({ expected_version: 1, name: name.trim(), root: root.trim(), space_id: spaceID });
          void command.run(() => workspaceApi.registerProject(request.body, request.key), result => { setSelectedID(result.project.id); projects.retry(); }, '项目已登记，请设置许可后提交任务。');
        }}><fieldset disabled={stale || command.pending}><legend>允许接入的项目</legend>
          <TextField label="项目名称" value={name} onChange={setName} required />
          <TextField label="项目绝对目录" value={root} onChange={value => { setRoot(value); setCandidates(null); }} required hint="只检查明确目录；发现结果由你逐项选择登记。" />
          <button className="ac-button secondary compact" type="button" disabled={!root.trim()} onClick={() => { const request = command.prepare({ expected_version: 1, root: root.trim() }); void command.run(() => workspaceApi.discoverProjects(request.body, request.key), result => setCandidates(result.items), '已返回所选目录的项目候选。'); }}>发现此目录的子项目</button>
          {candidates && <div>{candidates.length ? candidates.map(candidate => <button key={candidate.root} className="ac-button secondary compact" type="button" onClick={() => { setName(candidate.name); setRoot(candidate.root); setCandidates(null); }}>选择 {candidate.name} · {candidate.root}</button>) : <p>此目录没有返回项目候选。</p>}</div>}
          <QueryState state={spaces}>{data => <SelectField label="关联项目空间" value={spaceID} onChange={setSpaceID} disabled={spaces.loading || spaces.stale} options={[{ value: '', label: '请选择项目空间' }, ...data.items.map(space => ({ value: space.id, label: space.title }))]} />}</QueryState>
        </fieldset><button className="ac-button compact" type="submit" disabled={stale || command.pending || spaces.loading || spaces.stale || !spaces.data || !spaceID || !name.trim() || !root.trim()}>登记此项目</button></form>
        <form className={styles.form} onSubmit={event => { event.preventDefault(); if (stale || !spaceTitle.trim()) return; const request = command.prepare({ expected_version: 1, title: spaceTitle.trim() }); void command.run(() => workspaceApi.createSpace(request.body, request.key), result => { spaces.retry(); setSpaceID(result.space.id); setSpaceTitle(''); }, '已创建项目空间。'); }}><TextField label="新项目空间名称" value={spaceTitle} onChange={setSpaceTitle} disabled={stale || command.pending} required /><button className="ac-button secondary compact" type="submit" disabled={stale || command.pending || !spaceTitle.trim()}>创建空间用于此项目</button></form>
        <CommandState {...command} />
      </details>
      {selected && <details open><summary>项目接入、权限与原生操作</summary><ProjectPermissions key={selected.id} project={selected} disabled={stale} onChanged={projects.retry} /></details>}
    </div>
  </SectionCard>;
}

function ProjectPermissions({ project, disabled, onChanged }: { project: Project; disabled: boolean; onChanged: () => void }) {
  const capabilities = useReadApi(async signal => readSwaAgents(await swaApi.command(project.id, { action: 'capabilities' }, signal)), { key: `${project.id}:${project.settings.revision}`, enabled: !disabled && project.settings.allowed_actions.includes('observe') });
  const agents = !capabilities.stale && !capabilities.error ? capabilities.data?.map(agent => agent.id) ?? [] : [];
  return <section className={styles.record} aria-label="已登记项目管理"><h3>{project.name}</h3><code>{project.root}</code>
    <ProjectSettingsForm project={project} disabled={disabled} onChanged={onChanged} swaOnly knownAgents={agents} />
    <ProjectAgentAccess project={project} disabled={disabled} swaOnly />
    {capabilities.error && <details><summary>Agent 能力查询失败</summary><p>{capabilities.error}</p><button className="ac-button secondary compact" type="button" disabled={disabled || capabilities.loading} onClick={capabilities.retry}>重新查询项目能力</button></details>}
  </section>;
}
