import { useMemo, useState } from 'react';
import { DevelopmentSpacePanel } from './DevelopmentSpacePanel';
import { useMissions } from '../../hooks/useReadApi';
import { SectionCard } from '../../components/SectionCard';
import { QueryState } from '../../components/QueryState';
import { EmptyState } from '../../components/EmptyState';
import { DetailPanel } from '../../components/DetailPanel';
import { PageFrame, RailSummary } from '../../components/PageFrame';
import { MissionDAGRegion } from './dag/MissionDAGRegion';
import type { SwarmMission } from '../../api/swarm';
import { matchesQuery } from '../../utils/search';
import { MissionList } from './missions/MissionRecords';
import { MissionDetailWorkspace } from './missions/MissionDetailWorkspace';
import { MissionCreateWorkspace } from './missions/MissionCreateWorkspace';
import { SwaWorkspace } from './SwaWorkspace';
import { ArtifactCollection, MissionEventCollection, WorkItemCollection } from './missions/MissionCollections';
import { useMissionCollections } from './missions/useMissionCollections';
import styles from './SwarmPage.module.css';

export { MissionList, MissionDetail, WorkItemList, WorkItemDetail } from './missions/MissionRecords';

const EMPTY_MISSIONS: SwarmMission[] = [];

export function SwarmPage({ query }: { query: string }) {
  const missions = useMissions();
  const records = useMissionCollections(missions);
  const [selected, setSelected] = useState<{ kind: 'mission'; id: string; workItemID?: string; artifactID?: string } | { kind: 'create' } | null>(null);
  const items = useMemo(() => (missions.data?.items ?? EMPTY_MISSIONS).filter(item => matchesQuery(query, [item.id, item.grant.goal, item.grant.id, item.grant.project_id, item.reason])), [missions.data, query]);
  const workItemCount = items.reduce((count, item) => count + item.work_item_count, 0);
  const count = (value: number) => missions.loading && !missions.data ? '加载中…' : missions.error && !missions.data ? '无法获取' : value;
  return <PageFrame section="swarm" title="蜂群空间" subtitle="查看批准范围内的任务、执行记录和待验收产物。" onRefresh={() => { missions.retry(); records.retry(); }} rail={<RailSummary title="执行概览" rows={[{ label: '任务', value: count(items.length) }, { label: '工作项', value: count(workItemCount) }, { label: '产物引用', value: '按任务查看' }]} note="提交产物后等待人工验收；当前授权由服务逐次核查。" />}>
    <div className={styles.grid}>
      <SwaWorkspace />
      <DevelopmentSpacePanel query={query} />
      <div><button className="ac-button compact" type="button" disabled={missions.loading || missions.stale || !missions.data} onClick={() => setSelected({ kind: 'create' })}>从批准建立任务</button></div>
      <details className="ac-secondary-records" open={items.length > 0}><summary>已有任务记录 · {missions.data ? items.length : '未知'} 项</summary>
      <SectionCard title={`任务(${missions.data ? items.length : '未知'})`} tabs={['overview', 'timeline']}>
        <p className={styles.itemDesc}>打开任务查看真实事件时间线、当前工作项、租约与产物。建立任务保存批准账本，执行由已绑定的 Agent 另行认领。</p>
        <QueryState state={missions} empty={data => !data.items.length} emptyTitle="暂无任务">{() => items.length ? <MissionList items={items} onSelect={item => setSelected({ kind: 'mission', id: item.id })} /> : <EmptyState title="没有匹配的任务" description="请调整搜索词" />}</QueryState>
      </SectionCard>
      <SectionCard title={`工作项(${records.data ? records.data.reduce((count, detail) => count + (detail.work_items?.length ?? 0), 0) : missions.data?.items.length === 0 ? 0 : '未知'})`} tabs={['overview', 'timeline']}>
        <WorkItemCollection missions={missions} records={records} query={query} onSelect={(work, missionId) => setSelected({ kind: 'mission', id: missionId, workItemID: work.id })} />
      </SectionCard>
      </details>
      <SectionCard title="任务依赖 DAG" tabs={['overview', 'timeline']}><MissionDAGRegion missions={missions} onOpenWorkItem={(id, workItemID) => setSelected({ kind: 'mission', id, workItemID })} /></SectionCard>
      <SectionCard title="任务时间线" tabs={['timeline']}><MissionEventCollection missions={missions} records={records} /></SectionCard>
      <SectionCard title="产物引用" tabs={['artifacts']} count={records.data?.reduce((count, detail) => count + (detail.artifacts?.length ?? 0), 0)}>
        <ArtifactCollection missions={missions} records={records} query={query} onSelect={(artifactID, missionId) => setSelected({ kind: 'mission', id: missionId, artifactID })} />
      </SectionCard>
    </div>
    {selected?.kind === 'mission' && <DetailPanel title={selected.artifactID ? '产物详情' : selected.workItemID ? '工作项详情' : '任务详情'} onClose={() => setSelected(null)}><MissionDetailWorkspace key={`${selected.id}:${selected.workItemID ?? ''}:${selected.artifactID ?? ''}`} id={selected.id} initialWorkItemID={selected.workItemID} initialArtifactID={selected.artifactID} onChanged={missions.retry} /></DetailPanel>}
    {selected?.kind === 'create' && <DetailPanel title="从批准建立任务" onClose={() => setSelected(null)}><MissionCreateWorkspace onCreated={id => { missions.retry(); setSelected({ kind: 'mission', id }); }} /></DetailPanel>}
  </PageFrame>;
}
