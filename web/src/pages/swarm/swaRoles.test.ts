import { describe, expect, it } from 'vitest';
import { SwaCommandError, SwaCommandNotSubmittedError, type SwaEnvelope } from '../../api/swa';
import { ApiError } from '../../api/transport';
import { commandDeliveryUnknown } from '../../hooks/usePersistentCommand';
import type { components } from '../../api/schema';
import { collaborationFailure, collaborationOutcome, collaborationPermission, explicitReferences, readSwaConversation, readSwaRoles, recoverCollaborationReply } from './swaRoles';

// 纯记录解码与权限规则的明确参数；不代表服务、浏览器或模型实测结果。
const projectID = 'record-rule-project', requestID = '0ff0ec12-d039-4c27-b41a-f61b46cf7be7';
const role = { id: requestID, project_id: projectID, revision: 1, archived: false, name: '规则输入角色', responsibilities: '核查公开文本', default_agent: 'pi', default_model: 'rule-model', skills: ['explicit-skill-reference'], knowledge: ['explicit-knowledge-reference'], created_at: '2026-10-23T00:00:00.000Z', updated_at: '2026-10-23T00:00:00.000Z' };
const conversation = { id: 'record-rule-conversation', project_id: projectID, title: '规则输入讨论', role_id: role.id, created_at: role.created_at };
const entry = { id: requestID, request_id: requestID, text: '显式追加要求', created_at: role.created_at, status: 'stored', author_id: 'rule-author', author_kind: 'human' };
const envelope = (native: unknown): SwaEnvelope => ({ ok: true, request_id: requestID, result: { native } });
const receipt = (action: string, native: unknown): SwaEnvelope => ({ ok: true, result: { requestId: requestID, state: 'completed', method: 'swa.collaborationWrite', receipt: { project_id: projectID, action, native, mutation: { requestId: requestID, replayed: false } } } });
const settings: components['schemas']['LocalProjectSettingsV1'] = { revision: 4, allow_directory: true, allowed_subdirs: [], expand_references: false, allowed_actions: ['observe', 'start', 'send'], allowed_tools: [], external_model_cli: 'pi', allow_agent_control: true, history_roots: {} };

describe('角色与讨论的原记录边界', () => {
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
