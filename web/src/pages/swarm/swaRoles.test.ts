import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SwaCommandError, SwaCommandNotSubmittedError, type SwaEnvelope } from '../../api/swa';
import { ApiError } from '../../api/transport';
import { commandDeliveryUnknown, readPersistentRequestID, usePersistentCommand } from '../../hooks/usePersistentCommand';
import type { components } from '../../api/schema';
import { collaborationFailure, collaborationOutcome, collaborationPermission, explicitReferences, readRoleAgentChoices, roleAgentSelectionBlock, readSwaConversation, readSwaRoles, recoverCollaborationReply } from './swaRoles';
import { SwaAgentCapabilities } from './SwaRunWorkspace';

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useEffect: vi.fn(actual.useEffect) };
});

// 纯记录解码与权限规则的明确参数；不代表服务、浏览器或模型实测结果。
const projectID = 'record-rule-project', requestID = '0ff0ec12-d039-4c27-b41a-f61b46cf7be7';
const role = { id: requestID, project_id: projectID, revision: 1, archived: false, name: '规则输入角色', responsibilities: '核查公开文本', default_agent: 'pi', default_model: 'rule-model', skills: ['explicit-skill-reference'], knowledge: ['explicit-knowledge-reference'], created_at: '2026-10-23T00:00:00.000Z', updated_at: '2026-10-23T00:00:00.000Z' };
const conversation = { id: 'record-rule-conversation', project_id: projectID, title: '规则输入讨论', role_id: role.id, created_at: role.created_at };
const entry = { id: requestID, request_id: requestID, text: '显式追加要求', created_at: role.created_at, status: 'stored', author_id: 'rule-author', author_kind: 'human' };
const envelope = (native: unknown): SwaEnvelope => ({ ok: true, request_id: requestID, result: { native } });
const receipt = (action: string, native: unknown): SwaEnvelope => ({ ok: true, result: { requestId: requestID, state: 'completed', method: 'swa.collaborationWrite', receipt: { project_id: projectID, action, native, mutation: { requestId: requestID, replayed: false } } } });
const settings: components['schemas']['LocalProjectSettingsV1'] = { revision: 4, allow_directory: true, allowed_subdirs: [], expand_references: false, allowed_actions: ['observe', 'start', 'send'], allowed_tools: [], external_model_cli: 'pi', allow_agent_control: true, history_roots: {} };

describe('角色与讨论的原记录边界', () => {
  it('命令 hook 在存储读取失败时仍可渲染错误并锁住提交，重读保留原 ID', () => {
    let unavailable = true;
    const storage = { getItem() { if (unavailable) throw new Error('storage denied'); return requestID; } };
    function PendingCommand() {
      const command = usePersistentCommand('storage-rule', () => { throw new Error('渲染不提交命令'); });
      return createElement('button', { disabled: command.uncertain }, command.error ?? command.operationID);
    }
    vi.stubGlobal('window', { sessionStorage: storage });
    try {
      const html = renderToStaticMarkup(createElement(PendingCommand));
      expect(html).toContain('disabled=""');
      expect(html).toContain('无法读取');
      expect(html).not.toContain(requestID);
      unavailable = false;
      expect(readPersistentRequestID('storage-rule')).toEqual({ operationID: requestID, error: null });
      const restored = renderToStaticMarkup(createElement(PendingCommand));
      expect(restored).toContain(requestID);
      expect(restored).toContain('disabled=""');
    } finally { vi.unstubAllGlobals(); }
  });
  it('读取可用但保存请求失败时，hook 不发送命令、不删除原存储且不抛出未处理异常', async () => {
    let writeAttempts = 0, actionCalled = false;
    let run: ((action: (id: string) => Promise<{ ok: true }>) => Promise<void>) | undefined;
    const original = new Map([['other-operation', requestID]]);
    const storage = { getItem: (key: string) => original.get(key) ?? null, setItem() { writeAttempts++; throw new Error('QuotaExceeded'); }, removeItem() { throw new Error('不能删除原记录'); } };
    function PendingCommand() {
      run = usePersistentCommand<{ ok: true }>('storage-write-rule', () => ({ status: 'succeeded' })).run;
      return null;
    }
    vi.stubGlobal('window', { sessionStorage: storage });
    try {
      renderToStaticMarkup(createElement(PendingCommand));
      await expect(run!(async () => { actionCalled = true; return { ok: true }; })).resolves.toBeUndefined();
      expect(writeAttempts).toBe(1);
      expect(actionCalled).toBe(false);
      expect([...original]).toEqual([['other-operation', requestID]]);
    } finally { vi.unstubAllGlobals(); }
  });
  it('清理请求记录失败保留已知业务结果与原 ID，后续调用不会重发', async () => {
    // SSR 不运行 effect；这里只建立挂载标志，直接调用生产 hook 的命令路径。
    const effect = vi.mocked(React.useEffect).mockImplementation(setup => { setup(); });
    try {
      for (const state of ['succeeded', 'rejected', 'not_submitted', 'unknown'] as const) {
        const values = new Map<string, string>();
        let calls = 0, removals = 0;
        type Result = { status: 'succeeded' | 'rejected' };
        let run: ReturnType<typeof usePersistentCommand<Result>>['run'] | undefined;
        const received: string[] = [];
        const storage = { getItem: (key: string) => values.get(key) ?? null, setItem(key: string, value: string) { values.set(key, value); }, removeItem() { removals++; throw new Error('storage cleanup denied'); } };
        function PendingCommand() {
          run = usePersistentCommand<Result>(`cleanup-${state}`, response => ({ status: response.status })).run;
          return null;
        }
        vi.stubGlobal('window', { sessionStorage: storage });
        renderToStaticMarkup(createElement(PendingCommand));
        const action = async () => {
          calls++;
          if (state === 'not_submitted') throw new SwaCommandNotSubmittedError(new Error('authentication unavailable'));
          if (state === 'unknown') throw new Error('connection lost after POST');
          return { status: state };
        };
        await expect(run!(action, (_response, outcome) => { received.push(outcome.status); }, requestID)).resolves.toBeUndefined();
        expect([...values.values()]).toEqual([requestID]);
        expect(received).toEqual(state === 'succeeded' || state === 'rejected' ? [state] : []);
        expect(removals).toBe(state === 'unknown' ? 0 : 1);
        await expect(run!(action)).resolves.toBeUndefined();
        expect(calls).toBe(1);
      }
    } finally { effect.mockRestore(); vi.unstubAllGlobals(); }
  });
  it('认证前置未提交不会锁住角色命令，POST 后拒绝或断线继续核查原请求', () => {
    const notSubmitted = new SwaCommandNotSubmittedError(new Error('authentication failed'));
    expect(() => collaborationFailure(notSubmitted, requestID)).toThrow(notSubmitted);
    expect(commandDeliveryUnknown(notSubmitted)).toBe(false);
    expect(commandDeliveryUnknown(new SwaCommandError(403, { ok: false, error: { code: 'scope_denied', message: 'POST rejected', retryable: false, required_action: 'inspect_original_request' } }))).toBe(true);
    expect(commandDeliveryUnknown(new Error('POST disconnected'))).toBe(true);
  });
  it('只接受当前项目、唯一身份与明确角色版本，归档仍保留历史记录', () => {
    expect(readSwaRoles(envelope({ roles: [role, { ...role, id: 'archived-rule-role', revision: 2, archived: true }] }), projectID)).toHaveLength(2);
    expect(readSwaRoles(envelope({ roles: [{ ...role, skills: null, knowledge: null }] }), projectID)[0]).toMatchObject({ skills: [], knowledge: [] });
    expect(() => readSwaRoles(envelope({ roles: [role] }), 'other-project')).toThrow('项目');
    expect(() => readSwaRoles(envelope({ roles: [role, role] }), projectID)).toThrow('重复');
    for (const revision of [0, 1.5, '1']) expect(() => readSwaRoles(envelope({ roles: [{ ...role, revision }] }), projectID)).toThrow('版本');
    expect(() => readSwaConversation(envelope({ conversation, entries: [entry] }), projectID, 'other-conversation')).toThrow('另一个讨论');
  });

  it('旧角色明确使用 disabled，保存和归档记录保留原生问答选择', () => {
    expect(readSwaRoles(envelope({ roles: [role] }), projectID)[0]?.question_mode).toBe('disabled');
    for (const archived of [false, true]) expect(readSwaRoles(envelope({ roles: [{ ...role, question_mode: 'native', archived }] }), projectID)[0]).toMatchObject({ question_mode: 'native', archived });
    for (const question_mode of [null, '', 'all-tools']) expect(() => readSwaRoles(envelope({ roles: [{ ...role, question_mode }] }), projectID)).toThrow('问题模式');
    expect(readSwaRoles(envelope({ roles: [role] }), projectID)[0]?.delegation_mode).toBe('disabled');
    expect(readSwaRoles(envelope({ roles: [{ ...role, delegation_mode: 'native' }] }), projectID)[0]?.delegation_mode).toBe('native');
    for (const delegation_mode of [null, '', 'all-tools']) expect(() => readSwaRoles(envelope({ roles: [{ ...role, delegation_mode }] }), projectID)).toThrow('委派模式');
    expect(readSwaRoles(envelope({ roles: [role] }), projectID)[0]?.development_mode).toBe('disabled');
    expect(readSwaRoles(envelope({ roles: [{ ...role, development_mode: 'project', revision: 2 }] }), projectID)[0]).toMatchObject({ revision: 2, development_mode: 'project' });
    for (const development_mode of [null, '', 'all-tools']) expect(() => readSwaRoles(envelope({ roles: [{ ...role, development_mode }] }), projectID)).toThrow('开发模式');
  });

  it('原创建身份和原追加条目必须出现在成功回执中，未保存不能显示成功', () => {
    expect(collaborationOutcome(envelope({ role }), projectID, { action: 'role.create' }).status).toBe('succeeded');
    expect(() => collaborationOutcome(envelope({ role: { ...role, id: 'another-role' } }), projectID, { action: 'role.create' })).toThrow('原创建请求');
    const expected = { action: 'conversation.append', conversationID: conversation.id };
    expect(collaborationOutcome(envelope({ conversation, entries: [entry] }), projectID, expected)).toMatchObject({ status: 'succeeded', message: '已保存到讨论；此操作未向 Worker 发送' });
    expect(() => collaborationOutcome(envelope({ conversation, entries: [] }), projectID, expected)).toThrow('尚未出现');
    expect(() => collaborationOutcome(envelope({ role }), projectID, { action: 'role.archive', roleID: role.id })).toThrow('归档尚未确认');
  });

  it('未知与缺席保持原请求，恢复严格核对原动作、项目、请求和目标', () => {
    const expected = { action: 'role.update', roleID: role.id };
    for (const state of ['pending', 'absent', 'unknown']) expect(recoverCollaborationReply({ ok: true, result: { requestId: requestID, state } }, projectID, requestID, expected)).toBeNull();
    const original = receipt(expected.action, { role });
    expect(recoverCollaborationReply(original, projectID, requestID, expected)).toEqual(envelope({ role }));
    expect(() => recoverCollaborationReply(original, projectID, 'another-request', expected)).toThrow('原请求');
    expect(() => recoverCollaborationReply(original, 'another-project', requestID, expected)).toThrow('项目');
    expect(() => recoverCollaborationReply(original, projectID, requestID, { ...expected, action: 'role.archive' })).toThrow('动作');
    expect(() => recoverCollaborationReply(original, projectID, requestID, { ...expected, roleID: 'another-role' })).toThrow('另一个角色');
    expect(() => recoverCollaborationReply({ ...original, result: { ...(original.result as object), method: 'swa.controllerDeliver' } }, projectID, requestID, expected)).toThrow('动作');
  });

  it('仅原回复明确无效果拒绝可解除锁，超时与普通错误保持未知', () => {
    const rejected: SwaEnvelope = { ok: false, request_id: requestID, error: { code: 'context_stale', message: '角色版本已变化', data: { effectsApplied: false }, retryable: false, required_action: 'inspect_original_request' } };
    expect(collaborationOutcome(rejected, projectID, { action: 'role.update', roleID: role.id })).toMatchObject({ requestID, status: 'rejected' });
    for (const data of [undefined, {}, { effectsApplied: true }, { effectsApplied: 'false' }]) expect(collaborationOutcome({ ...rejected, error: { ...rejected.error!, data } }, projectID, { action: 'role.update' }).status).toBe('unknown');
    expect(() => collaborationOutcome({ ...rejected, request_id: undefined }, projectID, { action: 'role.update' })).toThrow('request_id');
    expect(collaborationFailure(new SwaCommandError(409, rejected), requestID)).toBe(rejected);
    // 使用实际异常类型和原 hook 分类函数，普通 HTTP 4xx 不能绕过本操作的未知锁。
    for (const error of [new ApiError(403, { schema_version: 1, error: { code: 'scope_denied', message: '授权已撤销', retryable: false, request_id: 'http-request', required_action: 'refresh_current_permissions' } }), new SwaCommandError(409, { ...rejected, request_id: 'another-request' }), new Error('连接中断')]) {
      try { collaborationFailure(error, requestID); throw new Error('必须保持原请求未确认'); }
      catch (unknown) { expect(commandDeliveryUnknown(unknown)).toBe(true); expect(unknown).toHaveProperty('cause', error); }
    }
  });

  it('读写分别使用当前项目权限，停用或读取过期时禁写，引用只由显式输入产生', () => {
    for (const permission of ['observe', 'start', 'send'] as const) {
      expect(collaborationPermission(settings, permission, false)).toBe(true);
      expect(collaborationPermission(settings, permission, true)).toBe(false);
      expect(collaborationPermission({ ...settings, allowed_actions: [] }, permission, false)).toBe(false);
    }
    expect(collaborationPermission({ ...settings, allow_agent_control: false }, 'observe', false)).toBe(true);
    for (const permission of ['start', 'send'] as const) expect(collaborationPermission({ ...settings, allow_agent_control: false }, permission, false)).toBe(false);
    expect(explicitReferences('  docs/review.md \n\ndocs/review.md\n https://example.org/public-spec ')).toEqual(['docs/review.md', 'https://example.org/public-spec']);
  });
});

// 构造能力 DTO，仅验证界面选择规则和来源显示。
const observed = (status: 'available' | 'unavailable' | 'unknown', reason = '角色选择规则输入') => ({ status, reason, source: 'role-form-parameter', basis: 'configuration' as const });
function capability(id: string, model: string) {
  return { id, execution_mode: 'structured', registered: observed('available'), enabled: observed('available'), installed: { ...observed('available'), version: 'rule-version', executable: '/explicit/cli-path' }, configured: { ...observed('available'), model }, launchable: observed('unknown'), authenticated: observed('unknown', '配置尚未验证登录'), control: { start: observed('available'), read: observed('unknown'), tools: observed('unknown'), questions: observed('available'), delegation: observed('available'), development: observed('available') }, requirements: { settings_revision: settings.revision }, model_catalog: { origin: 'configured', availability: 'unverified', models: [{ id: model, label: model, provider: 'rule-provider' }] } };
}
const capabilityEnvelope = (agents = [capability('pi', 'rule-model'), capability('opencode', 'other-model')]): SwaEnvelope => ({ ok: true, result: { schema: 'swa.capabilities.v1', agents } });
const multiSettings = { ...settings, external_model_clis: ['pi', 'opencode'] };

describe('角色默认 CLI 与模型的实际能力选择', () => {
  it('同一项目允许两个已配置 CLI，目录未验证状态保留且模型不跨 CLI', () => {
    const choices = readRoleAgentChoices(capabilityEnvelope(), multiSettings);
    expect(choices.map(item => item.id)).toEqual(['pi', 'opencode']);
    expect(choices[0]?.catalog).toMatchObject({ origin: 'configured', verified: false });
    expect(roleAgentSelectionBlock(choices, role, multiSettings)).toBeNull();
    expect(roleAgentSelectionBlock(choices, { ...role, default_agent: 'opencode', default_model: 'other-model' }, multiSettings)).toBeNull();
    expect(roleAgentSelectionBlock(choices, { ...role, default_model: 'other-model' }, multiSettings)).toContain('已观察目录');
    expect(choices[0]?.launchable.status).toBe('unknown');
  });
  it('旧值失效、项目撤权、能力版本变化和未配置时保留原选择并阻止保存', () => {
    const original = { ...role, default_agent: 'opencode', default_model: 'other-model' };
    expect(roleAgentSelectionBlock(readRoleAgentChoices(capabilityEnvelope(), settings), original, settings)).toContain('原选择已保留');
    expect(original.default_agent).toBe('opencode');
    expect(original.default_model).toBe('other-model');
    const stale = { ...multiSettings, revision: multiSettings.revision + 1 };
    expect(roleAgentSelectionBlock(readRoleAgentChoices(capabilityEnvelope(), stale), role, stale)).toContain('已过期');
    const item = capability('pi', 'rule-model');
    item.configured.status = 'unknown';
    expect(roleAgentSelectionBlock(readRoleAgentChoices(capabilityEnvelope([item]), settings), role, settings)).toContain('配置尚未核实');
  });
  it('目录来源未知或模型消失时不产生候选，能力不会自动授权委派', () => {
    const item = capability('pi', 'rule-model');
    item.model_catalog.origin = 'unknown';
    const unknown = readRoleAgentChoices(capabilityEnvelope([item]), settings);
    expect(unknown[0]?.models).toEqual([]);
    expect(roleAgentSelectionBlock(unknown, role, settings)).toContain('已观察目录');
    const choices = readRoleAgentChoices(capabilityEnvelope(), multiSettings);
    expect(roleAgentSelectionBlock(choices, { ...role, delegation_mode: 'native' }, multiSettings)).toContain('未允许自主委派');
    expect(roleAgentSelectionBlock(choices, { ...role, delegation_mode: 'native' }, { ...multiSettings, allowed_tools: ['swa_delegate'] })).toBeNull();
  });
  it('能力卡展示实际版本与执行文件，配置目录和认证未知不显示为执行成功', () => {
    const html = renderToStaticMarkup(createElement(SwaAgentCapabilities, { reply: capabilityEnvelope() }));
    expect(html).toContain('rule-version');
    expect(html).toContain('/explicit/cli-path');
    expect(html).toContain('配置尚未验证登录');
    expect(html).toContain('尚未验证');
    expect(html).not.toContain('已登录');
  });

  it('角色同时启用委派与开发时分别检查许可，失效开发模式保留', () => {
    const definition = { ...role, delegation_mode: 'native' as const, development_mode: 'project' as const };
    const permitted = { ...multiSettings, allowed_tools: ['swa_delegate', 'project_shell'], allowed_subdirs: ['src'], allowed_actions: ['start', 'send', 'read_context'] };
    const choices = readRoleAgentChoices(capabilityEnvelope(), permitted);
    expect(roleAgentSelectionBlock(choices, definition, permitted)).toBeNull();
    expect(roleAgentSelectionBlock(choices, definition, { ...permitted, allowed_tools: ['swa_delegate'] })).toContain('未允许开发');
    expect(roleAgentSelectionBlock(choices, definition, { ...permitted, allowed_tools: ['project_shell'] })).toContain('未允许自主委派');
    expect(definition.development_mode).toBe('project');
    expect(roleAgentSelectionBlock(choices, { ...definition, development_mode: 'disabled' }, { ...permitted, allowed_tools: ['swa_delegate'] })).toBeNull();
  });
});
