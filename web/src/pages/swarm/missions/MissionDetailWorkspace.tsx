import { useState } from 'react';
import { swarmApi } from '../../../api/swarm';
import { proposalsApi } from '../../../api/proposals';
import type { components } from '../../../api/schema';
import { useReadApi } from '../../../hooks/useReadApi';
import { usePersistentCommand } from '../../../hooks/usePersistentCommand';
import { QueryState } from '../../../components/QueryState';
import { CommandState } from '../../../components/CommandState';
import { Field } from '../../../components/DetailPanel';
import { commandError } from '../../../utils/commandError';
import { TextField } from '../../../components/FormControls';
import { MissionDetail, MissionTimeline, WorkItemDetail, WorkItemList } from './MissionRecords';
import { MissionStopActions } from './MissionStopActions';
import { WorkItemEditor } from './WorkItemEditor';
import { ArtifactWorkspace } from './ArtifactWorkspace';
import styles from './MissionWorkspace.module.css';

export function MissionDetailWorkspace({ id, initialWorkItemID = '', initialArtifactID = '', onChanged }: { id: string; initialWorkItemID?: string; initialArtifactID?: string; onChanged: () => void }) {
  const current = useReadApi(signal => swarmApi.mission(id, signal), { key: id });
  const grantID = current.data?.mission.grant.id ?? '';
  const grant = useReadApi(signal => proposalsApi.approval(grantID, signal), { key: grantID, enabled: !!grantID });
  const [workItemID, setWorkItemID] = useState(initialWorkItemID);
  const [artifactID, setArtifactID] = useState(initialArtifactID);
  const [recoveryReason, setRecoveryReason] = useState('');
  const command = usePersistentCommand<components['schemas']['SwarmMissionEnvelopeV1']>(`swarm:${id}:lifecycle`, () => ({ status: 'succeeded', message: '任务状态已保存' }), { failureMessage: cause => commandError(cause).message });
  const changed = () => { current.retry(); grant.retry(); onChanged(); };
  const blocked = current.loading || current.stale || !current.data || command.pending || command.uncertain;
  const grantBlocked = grant.loading || grant.stale || !grant.data || grant.data.approval.status !== 'active';
  return <>
    <div className={styles.actions}><button type="button" className="ac-button secondary compact" onClick={() => { current.retry(); if (grantID) grant.retry(); }}>刷新当前任务</button></div>
    <QueryState state={current}>{data => {
      if (data.mission.id !== id) throw new Error('读取的任务与当前任务身份不一致');
      const mission = data.mission;
      const works = data.work_items ?? [];
      const artifacts = data.artifacts ?? [];
      const selectedWork = works.find(item => item.id === workItemID);
      const executable = mission.state === 'ready' || mission.state === 'running';
      return <>
        <MissionDetail item={mission} workItems={works} artifacts={artifacts} />
        <QueryState state={grant}>{({ approval }) => <><Field label="当前 Grant 有效状态">{approval.status} · Epoch {approval.epoch} · {approval.expires_at}</Field><Field label="批准的停止条件">{approval.stops.conditions?.join('；') || '无'}</Field></>}</QueryState>
        <Field label="当前有效执行并发上限">{data.max_active_executors}</Field>
        <MissionTimeline items={data.timeline ?? []} />
        <section aria-label="任务工作项"><h4>工作项 · {works.length}</h4>{works.length ? <WorkItemList items={works} missions={[mission]} leases={data.leases ?? []} onSelect={item => setWorkItemID(item.id)} /> : <p>暂无工作项。</p>}</section>
        {!!workItemID && (selectedWork ? <section className={styles.record}>
          <WorkItemDetail item={selectedWork} missionId={id} lease={data.leases?.find(item => item.work_item_id === selectedWork.id && item.fence === selectedWork.fence)} executions={data.executions?.filter(item => item.work_item_id === selectedWork.id) ?? []} />
          <div className={styles.actions}><button type="button" className="ac-button secondary" disabled title="认领接口需要已绑定的 Agent 身份">认领工作项</button><button type="button" className="ac-button secondary" disabled title="提交接口需要原租约持有 Agent 身份及真实产物证据">提交产物</button><button type="button" className="ac-button secondary compact" onClick={() => setWorkItemID('')}>关闭工作项详情</button></div>
          <p>认领与提交由已经绑定的 Agent 使用原执行身份完成。人工网页显示服务记录的租约、上下文和产物。</p>
          {!!selectedWork.artifact_id && <button type="button" className="ac-button secondary" onClick={() => setArtifactID(selectedWork.artifact_id)}>查看此工作项产物</button>}
        </section> : <p role="alert">当前任务详情未包含所选工作项，请重新选择。</p>)}
        <details><summary>添加工作项</summary><WorkItemEditor key={mission.id} mission={mission} disabled={blocked || grantBlocked || !executable} onChanged={changed} /></details>
        <section aria-label="任务产物"><h4>产物引用 · {artifacts.length}</h4>{artifacts.length ? <ul className={styles.list}>{artifacts.map(artifact => <li key={artifact.id}><button className="ac-button secondary" type="button" aria-label={`查看产物 ${artifact.id}`} onClick={() => setArtifactID(artifact.id)}>{artifact.id} · v{artifact.version} · {artifact.state}</button></li>)}</ul> : <p>暂无产物引用。实际提交后由人工采用或退回。</p>}</section>
        {!!artifactID && <><ArtifactWorkspace key={artifactID} id={artifactID} missionId={id} disabled={blocked || grantBlocked} onChanged={changed} /><button type="button" className="ac-button secondary compact" onClick={() => setArtifactID('')}>关闭产物详情</button></>}
        <MissionStopActions state={mission.state} disabled={blocked} pending={command.pending}
          onPause={reason => { void command.run(key => swarmApi.pause(id, { schema_version: 1, request_id: key, expected_version: mission.version, reason }, key), (_, outcome) => { if (outcome.status === 'succeeded') changed(); }); }}
          onCancel={reason => { void command.run(key => swarmApi.cancel(id, { schema_version: 1, request_id: key, expected_version: mission.version, reason }, key), (_, outcome) => { if (outcome.status === 'succeeded') changed(); }); }} />
        {['paused', 'blocked', 'cancelled'].includes(mission.state) && <section aria-label="核查并恢复任务"><fieldset className={styles.fields} disabled={blocked}><legend>{mission.state === 'cancelled' ? '核查取消任务的原执行' : '核查并恢复任务'}</legend><TextField label="任务恢复或核查原因" value={recoveryReason} onChange={setRecoveryReason} required multiline /><button className="ac-button secondary" type="button" disabled={!recoveryReason.trim()} onClick={() => { void command.run(key => swarmApi.recover(id, { schema_version: 1, request_id: key, expected_version: mission.version, reason: recoveryReason.trim() }, key), (_, outcome) => { if (outcome.status === 'succeeded') changed(); }); }}>{mission.state === 'cancelled' ? '核查原执行并保留取消状态' : '核查原执行并恢复任务'}</button><p>服务核查原执行、租约和当前授权。未知执行继续保留资源占用。</p></fieldset></section>}
      </>;
    }}</QueryState>
    <CommandState {...command} />{command.uncertain && <p role="alert">任务命令 {command.operationID} 的结果未知，暂停、取消和恢复操作保持锁定；请只读取原记录核查。</p>}
  </>;
}
