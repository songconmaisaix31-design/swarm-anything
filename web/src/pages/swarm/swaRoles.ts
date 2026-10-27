import type { components } from '../../api/schema';
import { SwaCommandError, SwaCommandNotSubmittedError, type SwaEnvelope } from '../../api/swa';
import type { CommandOutcome } from '../../hooks/usePersistentCommand';
import { formatError } from '../../hooks/useReadState';
import { readSwaAgents, readSwaCapabilityDetails, swaDelegationBlock, swaDevelopmentBlock, swaStartRequestBlock } from './swaObservation';
import { modelCLIAllowed } from '../workspace/modelCLIPermission';

export type RoleDefinition = Omit<NonNullable<components['schemas']['command']['role']>, 'skills' | 'knowledge'> & { skills: string[]; knowledge: string[] };
export interface SwaRole extends RoleDefinition { id: string; project_id: string; revision: number; archived: boolean; created_at: string; updated_at: string }
export interface SwaConversation { id: string; project_id: string; title: string; role_id: string | null; created_at: string }
export interface SwaConversationEntry { id: string; request_id: string; text: string; created_at: string; status: 'stored'; author_id: string; author_kind: string }
export interface CollaborationRequest { action: string; roleID?: string; conversationID?: string }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('服务未返回可读取的角色或讨论记录');
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`服务记录缺少 ${field}`);
  return value;
}
function strings(value: unknown, field: string): string[] {
  // 公共 Go 合同将没有引用的 nil slice 表示为 null。
  if (value === null) return [];
  if (!Array.isArray(value)) throw new Error(`服务记录缺少 ${field} 列表`);
  return value.map(item => text(item, field));
}
function scoped(value: unknown, projectID: string) {
  const row = object(value);
  if (row.project_id !== projectID) throw new Error('角色或讨论记录不属于当前项目');
  return row;
}
function role(value: unknown, projectID: string): SwaRole {
  const row = scoped(value, projectID);
  if (!Number.isSafeInteger(row.revision) || Number(row.revision) < 1 || typeof row.archived !== 'boolean') throw new Error('角色版本或归档状态无法确认');
  if (row.question_mode !== undefined && row.question_mode !== 'disabled' && row.question_mode !== 'native') throw new Error('角色的问题模式无法确认');
  if (row.delegation_mode !== undefined && row.delegation_mode !== 'disabled' && row.delegation_mode !== 'native') throw new Error('角色的委派模式无法确认');
  if (row.development_mode !== undefined && row.development_mode !== 'disabled' && row.development_mode !== 'project') throw new Error('角色的开发模式无法确认');
  return { id: text(row.id, 'role.id'), project_id: projectID, revision: Number(row.revision), archived: row.archived, name: text(row.name, 'name'), responsibilities: text(row.responsibilities, 'responsibilities'), default_agent: text(row.default_agent, 'default_agent'), default_model: text(row.default_model, 'default_model'), question_mode: row.question_mode ?? 'disabled', delegation_mode: row.delegation_mode ?? 'disabled', development_mode: row.development_mode ?? 'disabled', skills: strings(row.skills, 'skills'), knowledge: strings(row.knowledge, 'knowledge'), created_at: text(row.created_at, 'created_at'), updated_at: text(row.updated_at, 'updated_at') };
}
function conversation(value: unknown, projectID: string): SwaConversation {
  const row = scoped(value, projectID);
  return { id: text(row.id, 'conversation.id'), project_id: projectID, title: text(row.title, 'title'), role_id: row.role_id === null ? null : text(row.role_id, 'role_id'), created_at: text(row.created_at, 'created_at') };
}
function native(reply: SwaEnvelope) { return object(object(reply.result).native); }
function unique<T extends { id: string }>(rows: T[]): T[] {
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('服务返回了重复记录身份');
  return rows;
}
export function readSwaRoles(reply: SwaEnvelope, projectID: string): SwaRole[] {
  const rows = native(reply).roles;
  if (!Array.isArray(rows)) throw new Error('服务未返回角色列表');
  return unique(rows.map(row => role(row, projectID)));
}
export function readSwaRole(reply: SwaEnvelope, projectID: string): SwaRole { return role(native(reply).role, projectID); }
export function readSwaConversations(reply: SwaEnvelope, projectID: string): SwaConversation[] {
  const rows = native(reply).conversations;
  if (!Array.isArray(rows)) throw new Error('服务未返回讨论列表');
  return unique(rows.map(row => conversation(row, projectID)));
}
export function readSwaConversation(reply: SwaEnvelope, projectID: string, expectedID?: string) {
  const data = native(reply), selected = conversation(data.conversation, projectID);
  if (expectedID && selected.id !== expectedID) throw new Error('服务返回了另一个讨论');
  if (!Array.isArray(data.entries)) throw new Error('服务未返回有序讨论记录');
  const entries = unique(data.entries.map(value => {
    const row = object(value);
    if (row.status !== 'stored') throw new Error('服务未返回已保存的讨论状态');
    return { id: text(row.id, 'entry.id'), request_id: text(row.request_id, 'request_id'), text: text(row.text, 'text'), created_at: text(row.created_at, 'created_at'), status: 'stored' as const, author_id: text(row.author_id, 'author_id'), author_kind: text(row.author_kind, 'author_kind') };
  }));
  return { conversation: selected, entries };
}

export function collaborationPermission(settings: components['schemas']['LocalProjectSettingsV1'], permission: 'observe' | 'start' | 'send', disabled: boolean): boolean {
  return !disabled && settings.allowed_actions.includes(permission) && (permission === 'observe' || settings.allow_agent_control);
}

/** 没有原 UUID 回执的 HTTP 错误也保持未知，避免通用 hook 将普通 4xx 解锁。 */
export function collaborationFailure(error: unknown, requestID: string): SwaEnvelope {
  if (error instanceof SwaCommandNotSubmittedError) throw error;
  if (error instanceof SwaCommandError && error.reply.request_id === requestID) return error.reply;
  throw new Error(`原请求结果尚未确认：${formatError(error)}`, { cause: error });
}

export function collaborationOutcome(reply: SwaEnvelope, projectID: string, expected: CollaborationRequest): CommandOutcome {
  const requestID = text(reply.request_id, 'request_id');
  if (!reply.ok) {
    const error = object(reply.error);
    const data = error.data && typeof error.data === 'object' && !Array.isArray(error.data) ? error.data as Record<string, unknown> : {};
    return { requestID, status: data.effectsApplied === false ? 'rejected' : 'unknown', message: text(error.message, 'error.message') };
  }
  if (expected.action.startsWith('role.')) {
    const current = readSwaRole(reply, projectID);
    if (expected.roleID && current.id !== expected.roleID) throw new Error('服务返回了另一个角色');
    if (expected.action === 'role.create' && current.id !== requestID) throw new Error('新角色未关联原创建请求');
    if (expected.action === 'role.archive' && !current.archived) throw new Error('原角色归档尚未确认');
  } else {
    const current = readSwaConversation(reply, projectID, expected.conversationID);
    if (expected.action === 'conversation.create' && current.conversation.id !== requestID) throw new Error('新讨论未关联原创建请求');
    if (expected.action === 'conversation.append' && !current.entries.some(entry => entry.request_id === requestID)) throw new Error('原追加要求尚未出现在讨论记录中');
  }
  return { requestID, status: 'succeeded', message: expected.action === 'conversation.append' ? '已保存到讨论；此操作未向 Worker 发送' : '记录已保存' };
}

/** 只解释原已完成回执；未知、缺席和 pending 保留原请求锁。 */
export function recoverCollaborationReply(reply: SwaEnvelope, projectID: string, requestID: string, expected: CollaborationRequest): SwaEnvelope | null {
  const result = object(reply.result);
  if (result.requestId !== requestID) throw new Error('查询返回了不同的原请求');
  if (result.state !== 'completed') return null;
  const receipt = object(result.receipt);
  if (result.method !== 'swa.collaborationWrite' || receipt.project_id !== projectID || receipt.action !== expected.action) throw new Error('原回执的动作或项目不一致');
  const restored: SwaEnvelope = { ok: true, request_id: requestID, result: { native: receipt.native } };
  collaborationOutcome(restored, projectID, expected);
  return restored;
}

export function explicitReferences(value: string): string[] { return [...new Set(value.split('\n').map(item => item.trim()).filter(Boolean))]; }

/** 目录候选来自当前服务观察；配置来源仍保留未验证状态。 */
export function readRoleAgentChoices(reply: SwaEnvelope, settings: components['schemas']['LocalProjectSettingsV1']) {
  const details = new Map(readSwaCapabilityDetails(reply).map(agent => [agent.id, agent]));
  return readSwaAgents(reply).filter(agent => modelCLIAllowed(settings, agent.id)).map(agent => {
    const catalog = details.get(agent.id)?.catalog ?? null;
    return { ...agent, blocked: swaStartRequestBlock(agent, settings), catalog, models: catalog && catalog.origin !== 'unknown' ? catalog.models : [] };
  });
}

export function roleAgentSelectionBlock(choices: ReturnType<typeof readRoleAgentChoices>, definition: Pick<RoleDefinition, 'default_agent' | 'default_model' | 'question_mode' | 'delegation_mode' | 'development_mode'>, settings: components['schemas']['LocalProjectSettingsV1']): string | null {
  const selected = choices.find(agent => agent.id === definition.default_agent);
  if (!selected) return '角色默认的 Agent 未在当前项目的已发现许可列表中；原选择已保留';
  if (selected.blocked) return selected.blocked;
  if (!selected.models.some(model => model.id === definition.default_model)) return '角色默认模型未在当前 Agent 的已观察目录中，请明确选择当前模型';
  if (definition.question_mode === 'native' && selected.questions?.status !== 'available') return selected.questions?.reason ?? '当前 Agent 未声明原生问答能力';
  if (definition.delegation_mode === 'native') { const blocked = swaDelegationBlock(selected, settings); if (blocked) return blocked; }
  if (definition.development_mode === 'project') return swaDevelopmentBlock(selected, settings);
  return null;
}
