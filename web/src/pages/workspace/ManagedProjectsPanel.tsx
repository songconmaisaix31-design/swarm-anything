import { useRef, useState } from 'react';
import type { components } from '../../api/schema';
import { localProjectsApi } from '../../api/s1';
import { attentionApi } from '../../api/client';
import { useReadApi, type ReadApiState } from '../../hooks/useReadApi';
import { useProjectSpaces } from '../../hooks/useAttention';
import { useCommand } from '../../hooks/useCommand';
import { SectionCard } from '../../components/SectionCard';
import { CollectionOverview } from '../../components/CollectionOverview';
import { QueryState } from '../../components/QueryState';
import { CommandState } from '../../components/CommandState';
import { SelectField, TextField } from '../../components/FormControls';
import { ProjectSettingsForm } from './ProjectSettingsForm';
import { NativeProjectPanel } from './NativeProjectPanel';
import { ProjectAgentAccess } from './ProjectAgentAccess';
import { ProjectProgressPanel } from './ProjectProgressPanel';
import { RegisteredProjectsPanel } from './RegisteredProjectsPanel';
import { matchesQuery } from '../../utils/search';
import styles from './LocalProjectsPanel.module.css';
import formStyles from '../../components/FormControls.module.css';

export function ManagedProjectsPanel({ agents, query, initialRoot = '', initialName = '' }: { agents: ReadApiState<components['schemas']['LocalAgentListV1']>; query: string; initialRoot?: string; initialName?: string }) {
  const projects = useReadApi(signal => localProjectsApi.listProjects({ signal }));
  const spaces = useProjectSpaces();
  const [selectedID, setSelectedID] = useState('');
  const [sort, setSort] = useState('source');
  const [name, setName] = useState(initialName);
  const [root, setRoot] = useState(initialRoot);
  const [spaceID, setSpaceID] = useState('');
  const [spaceTitle, setSpaceTitle] = useState('');
  const [candidates, setCandidates] = useState<components['schemas']['LocalProjectCandidateV1'][] | null>(null);
  const registration = useRef<HTMLDetailsElement>(null);
  const command = useCommand(projects.loading || projects.stale || !projects.data);
  const selected = projects.data?.items.find(project => project.id === selectedID) ?? projects.data?.items.find(project => project.root === initialRoot);
  const visible = (projects.data?.items ?? []).filter(project => matchesQuery(query, [project.name, project.root]));
  if (sort === 'name') visible.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  return <SectionCard title="本地 Agent 与项目" tabs={['overview']} padded>
    <CollectionOverview title="项目接入与设置" description="登记你允许接入的目录，按项目设置资料、目录和模型许可。" metrics={[
      { label: '已登记项目', value: projects.data ? projects.data.items.length : projects.loading ? '加载中' : '未知' },
    ]}><p className={styles.note}>已允许从 Orca 登记范围发现项目，候选由你逐项登记，也可手动填写具体目录。</p><div className={styles.controls}><label>排序<select aria-label="项目排序" value={sort} onChange={event => setSort(event.target.value)}><option value="source">服务返回顺序</option><option value="name">项目名称</option><option value="activity" disabled>最近活动 · 未提供</option></select></label></div></CollectionOverview>
    <button className="ac-button secondary compact" type="button" disabled={projects.loading} onClick={projects.retry}>重载登记项目</button>
    <QueryState state={projects} empty={() => !visible.length} emptyTitle={projects.data?.items.length ? '没有匹配的本地项目' : '暂无本地项目'}>{() => <ul className={styles.cards}>{visible.map(project => <li key={project.id} className={styles.card}><button className={styles.open} type="button" onClick={() => setSelectedID(project.id)}><h3>{project.name}</h3><span>查看项目与权限 →</span></button><p>来源目录</p><code className={styles.path}>{project.root}</code><p>模型客户端 · {project.settings.external_model_cli || '尚未许可'}</p><p>A 主动纳入资料 · 默认；B 目录 · {project.settings.allow_directory ? '已打开' : '关闭'}；C 引用展开 · {project.settings.expand_references ? '已打开' : '关闭'}</p></li>)}</ul>}</QueryState>
    <details className="ac-discovery"><summary>从 Orca 登记目录选择项目</summary><RegisteredProjectsPanel query={query} registeredRoots={projects.data?.items.map(project => project.root) ?? []} onSelect={candidate => { setName(candidate.name); setRoot(candidate.root); setCandidates(null); if (registration.current) { registration.current.open = true; registration.current.scrollIntoView({ block: 'nearest' }); } }} /></details>
    <details ref={registration} open={initialRoot && !selected ? true : undefined}><summary>登记项目 / 发现子项目</summary><form className={formStyles.form} onSubmit={event => {
      event.preventDefault(); const request = command.prepare({ expected_version: 1, name: name.trim(), root: root.trim(), space_id: spaceID });
      void command.run(() => localProjectsApi.registerProject(request.body, request.key), result => { setSelectedID(result.project.id); projects.retry(); }, '已登记所选项目；默认仅主动纳入资料，目录与引用展开关闭');
    }}><fieldset disabled={command.pending || projects.loading || projects.stale || !projects.data}><legend>手动输入允许目录</legend><TextField label="项目名称" value={name} onChange={setName} required /><TextField label="项目绝对目录" value={root} onChange={value => { setRoot(value); setCandidates(null); }} required hint="仅访问你明确填写的目录，不自动登记发现结果。" />
      <button className="ac-button secondary compact" type="button" disabled={!root.trim()} onClick={() => { const request = command.prepare({ expected_version: 1, root: root.trim() }); void command.run(() => localProjectsApi.discoverProjects(request.body, request.key), result => setCandidates(result.items), '已完成所选目录的项目发现；请自行选择登记'); }}>发现此目录的子项目</button>
      {candidates && <div>{candidates.length ? candidates.map(candidate => <button className="ac-button secondary compact" type="button" key={candidate.root} onClick={() => { setName(candidate.name); setRoot(candidate.root); setCandidates(null); }}>选择 {candidate.name} · {candidate.root}</button>) : <p>此目录没有返回可登记的项目；也可手动填写明确项目目录。</p>}</div>}
      <QueryState state={spaces}>{data => <SelectField label="关联项目顶层空间" value={spaceID} onChange={setSpaceID} options={[{ value: '', label: '选择空间…' }, ...data.items.map(space => ({ value: space.id, label: space.title }))]} />}</QueryState>
    </fieldset><button className="ac-button" type="submit" disabled={command.pending || projects.loading || projects.stale || !projects.data || spaces.loading || spaces.stale || !spaces.data || !spaceID}>登记此项目</button></form>
      <form className={formStyles.form} onSubmit={event => { event.preventDefault(); const request = command.prepare({ expected_version: 1, title: spaceTitle.trim() }); void command.run(() => attentionApi.createProjectSpace(request.body, request.key), result => { spaces.retry(); setSpaceID(result.space.id); setSpaceTitle(''); }, '已创建项目顶层空间，可将资料主动 @ 纳入'); }}><TextField label="新项目顶层空间名称" value={spaceTitle} onChange={setSpaceTitle} required disabled={command.pending} /><button className="ac-button secondary compact" type="submit" disabled={command.pending || projects.loading || projects.stale || !projects.data}>创建空间用于此项目</button></form><CommandState {...command} /></details>
    {selected && <section className={formStyles.record} aria-label="已登记项目管理"><h3>{selected.name}</h3><p className={styles.path}>{selected.root}</p><ProjectSettingsForm key={selected.id} project={selected} agents={agents} disabled={projects.loading || projects.stale} onChanged={projects.retry} /><ProjectAgentAccess key={`access:${selected.id}`} project={selected} disabled={projects.loading || projects.stale} /><NativeProjectPanel key={`native:${selected.id}`} project={selected} agents={agents} disabled={projects.loading || projects.stale} /><ProjectProgressPanel key={`progress:${selected.id}`} project={selected} disabled={projects.loading || projects.stale} /></section>}
  </SectionCard>;
}
