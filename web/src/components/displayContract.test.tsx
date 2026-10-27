import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MissionList, MissionDetail, WorkItemList, WorkItemDetail } from '../pages/swarm/SwarmPage';
import { ProjectDetail, ProposalList, ProposalDetail, SessionList, SessionDetail } from '../pages/workspace/WorkspacePage';
import { DesignGraph, DesignTimeline, ResearchRoutes } from './DesignExamples';
import type { components } from '../api/schema';

type S = components['schemas'];
// 明确的函数参数输入只验证显示契约，不表示存在相应来源、会话或执行结果。
const workItem: S['SwarmWorkItemV1'] = { id: 'input-workitem', mission_id: 'input-mission', version: 2, state: 'open', title: '输入工作项', inputs: [], dependencies: [], write_paths: ['src/api'], required_capabilities: [], artifact_inputs: [], attempts: 0, fence: 0, artifact_id: 'input-artifact', reason: '' };
const mission: S['SwarmMissionV1'] = { id: 'input-mission', version: 3, state: 'blocked', reason: '输入阻塞原因', work_item_count: 1, no_progress: 0, settled_operations: 0, created_at: '2026-10-15T00:00:00Z', last_progress_at: '2026-10-15T00:00:00Z', reserved: { calls: 0, tokens: 0, money: null, currency: '' }, used: { calls: null, tokens: null, money: null, currency: '' }, grant: { id: 'input-grant', epoch: 1, proposal_id: 'input-proposal', proposal_revision: 1, project_id: 'input-project', root: '输入目录', goal: '输入目标', inputs: [], actions: [], write_paths: ['src/api'], budget: { calls: null, tokens: null, money: null, currency: '' }, limits: { max_work_items: 1, max_attempts: 1, max_no_progress: 1, no_progress_seconds: 300, max_active: 1, deadline: '2026-10-16T00:00:00Z' }, expires_at: '2026-10-16T00:00:00Z' } };
const artifact: S['SwarmArtifactV1'] = { id: 'input-artifact', version: 1, work_item_id: workItem.id, operation_id: 'input-operation', session_id: 'input-session', fence: 1, inputs: [], commit: '输入commit', base_commit: '输入base', object_ref: '输入对象', checks_ref: '输入检查', project_checks_ref: '输入项目检查', changed_paths: ['src/api'], context_packet_id: 'input-packet', state: 'submitted', acceptance_id: '', accepted_by: '', accepted_actor_kind: '', review_reason: '', reviewed_by: '', reviewed_at: null, experience_id: '', experience_status: '', execution_outcome: 'unknown', execution_failure_code: '', usage: null, created_at: '2026-10-15T00:00:00Z' };
const lease: S['SwarmLeaseV1'] = { work_item_id: workItem.id, mission_id: mission.id, project_id: mission.grant.project_id, holder_id: 'input-member', fence: 1, operation_id: artifact.operation_id, session_id: artifact.session_id, member_version: '1', worktree: '输入工作区', base_commit: artifact.base_commit, write_paths: workItem.write_paths, reserved: mission.reserved, expires_at: mission.grant.expires_at, context_packet_id: artifact.context_packet_id, binding_id: 'input-binding', policy_version: 'input-policy' };
const project: S['ProjectV1'] = { id: 'input-project', name: '输入项目', root_path: '输入目录', environment_id: 'input-environment', repo_id: null, worktree_id: null };
const proposal: S['ProposalV1'] = { id: 'input-proposal', revision: 1, version: 1, status: 'declined', created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:00Z', content: { title: '输入提案', goal: { id: 'input-goal', revision: 1 }, inputs: null, scope: { project_id: 'input-project', roots: null, actions: null, tools: null, external_targets: null, write_paths: null, max_concurrency: 1, settings_revision: 1 }, deliverables: ['输入交付物'], success_criteria: ['输入成功条件'], budget: { calls: null, tokens: null, money_minor: null, currency: '' }, stops: { deadline: '2026-10-16T00:00:00Z', conditions: ['输入停止条件'], max_work_items: 1, max_attempts: 1, no_progress_seconds: 1, max_no_progress_rounds: 1 } } };
const session: S['SessionV1'] = { id: 'input-session', adapter: 'input-adapter', native_session_id: null, project_id: 'input-project', binding_status: 'unavailable', capabilities: { native_resume: null, handoff: null }, context_state: 'unknown' };
const select = () => { throw new Error('静态显示测试不得触发操作'); };

describe('项目、提案和会话显示契约', () => {
  it('显示项目原始目录和标识', () => {
    const html = renderToStaticMarkup(<ProjectDetail item={project} />);
    expect(html).toContain(project.root_path);
    expect(html).toContain(project.id);
  });
  it('显示提案标题、状态和交付数量', () => {
    const html = renderToStaticMarkup(<ProposalList items={[proposal]} onSelect={select} />);
    expect(html).toContain(proposal.content.title);
    expect(html).toContain('已拒绝');
    expect(html).toContain('1');
  });
  it('提案详情保留未知预算和停止条件', () => {
    const html = renderToStaticMarkup(<ProposalDetail item={proposal} />);
    expect(html).toContain('未知');
    expect(html).toContain('输入停止条件');
    expect(html).toContain('输入交付物');
  });
  it('会话列表保留 unknown 能力', () => {
    const html = renderToStaticMarkup(<SessionList items={[session]} onSelect={select} />);
    expect(html).toContain(session.adapter);
    expect(html).toContain('未知');
  });
  it('会话能力保留三值语义', () => {
    for (const [value, label] of [[null, '未知'], [false, '不可用'], [true, '可用']] as const) {
      const html = renderToStaticMarkup(<SessionDetail item={{ ...session, capabilities: { native_resume: value, handoff: value } }} />);
      expect(html).toContain(label);
      expect(html).toContain('能力');
      expect(html).toContain('上下文状态');
    }
  });
});

describe('Mission 显示契约，实际生命周期验收 NOT_RUN', () => {
  it('显示运行、阻塞和失败输入状态', () => {
    const html = renderToStaticMarkup(<MissionList items={(['running', 'blocked', 'failed'] as const).map(state => ({ ...mission, id: state, state }))} onSelect={select} />);
    for (const label of ['执行中', '已阻塞', '失败']) expect(html).toContain(label);
  });
  it('详情显示工作项、产物引用和阻塞原因', () => {
    const html = renderToStaticMarkup(<MissionDetail item={mission} workItems={[workItem]} artifacts={[artifact]} />);
    for (const value of ['工作项', workItem.id, '产物引用', 'input-artifact', '输入阻塞原因']) expect(html).toContain(value);
  });
  it('工作项列表保持数量和输入状态', () => {
    const html = renderToStaticMarkup(<WorkItemList items={[workItem]} missions={[mission]} onSelect={select} />);
    expect(html.match(/<button(?:\s|>)/g)).toHaveLength(1);
    expect(html).toContain(workItem.id);
    expect(html).toContain('未认领');
  });
  it('工作项详情保留所属任务和产物引用', () => {
    const html = renderToStaticMarkup(<WorkItemDetail item={workItem} missionId={mission.id} />);
    for (const value of [mission.id, 'input-artifact', '未认领', '上下文包']) expect(html).toContain(value);
    const bound = renderToStaticMarkup(<WorkItemDetail item={{ ...workItem, state: 'claimed', fence: lease.fence }} missionId={mission.id} lease={lease} />);
    for (const value of [lease.context_packet_id, lease.binding_id, lease.session_id, lease.operation_id]) expect(bound).toContain(value);
  });
});

describe('缺少事实来源时的协作显示', () => {
  it('拓扑按钮禁用且没有构造任务', () => {
    const html = renderToStaticMarkup(<DesignGraph />);
    expect(html).toContain('disabled');
    expect(html).toContain('拓扑尚未接入');
    expect(html).not.toContain('T-11');
  });
  it('时间线显示缺少接口，保留未知观察状态', () => {
    const html = renderToStaticMarkup(<DesignTimeline />);
    expect(html).toContain('事件时间线尚未接入');
    expect(html).not.toContain('14:32');
  });
  it('研究路线缺少关系来源时明确提示', () => {
    expect(renderToStaticMarkup(<ResearchRoutes />)).toContain('研究路线尚未接入');
  });
});
