import { z } from 'zod'
import { isDeepStrictEqual } from 'node:util'
import type { OrchestrationDb } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/db'
import type { RpcContext } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/core'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import { roleDefinitionSchema, nativeObject, type Invocation, type Scope } from './contracts'
import { assertDeliveryGrantCurrent } from './delivery-admission'
import { isTaskDescendant } from './run-view'
import { roleSchema } from './role-selection'

const roleDefinition = roleDefinitionSchema
const conversationSchema = z.object({ id: z.string(), project_id: z.string(), title: z.string(), role_id: z.string().nullable(), created_at: z.string() })
const entrySchema = z.object({ id: z.string(), request_id: z.string(), text: z.string(), created_at: z.string(), status: z.literal('stored'), author_id: z.string(), author_kind: z.enum(['human', 'agent']) })
const storedRole = z.object({ id: z.string(), project_id: z.string(), revision: z.number().int(), archived: z.number().int(), definition: z.string(), created_at: z.string(), updated_at: z.string() })
const storedEntry = entrySchema.omit({ status: true })
type Role = z.infer<typeof roleSchema>
function fail(code: string, message: string): never { throw new OrchestrationError(code, message, { effectsApplied: false }) }

export function initializeCollaborationRecords(db: OrchestrationDb) {
  db.db.exec(`CREATE TABLE IF NOT EXISTS swa_roles (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
    archived INTEGER NOT NULL CHECK(archived IN (0,1)), definition TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS swa_roles_project ON swa_roles(project_id,id);
    CREATE TABLE IF NOT EXISTS swa_conversations (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL,
      role_id TEXT REFERENCES swa_roles(id), created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS swa_conversations_project ON swa_conversations(project_id,id);
    CREATE TABLE IF NOT EXISTS swa_conversation_entries (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES swa_conversations(id),
      request_id TEXT NOT NULL UNIQUE, text TEXT NOT NULL, author_id TEXT NOT NULL,
      author_kind TEXT NOT NULL CHECK(author_kind IN ('human','agent')), created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS swa_conversation_entries_order ON swa_conversation_entries(conversation_id,created_at,id);`)
}

function roleValue(value: unknown): Role {
  const row = storedRole.parse(value)
  return roleSchema.parse({ ...JSON.parse(row.definition), id: row.id, project_id: row.project_id, revision: row.revision, archived: row.archived === 1, created_at: row.created_at, updated_at: row.updated_at })
}
export function requireRole(db: OrchestrationDb, project: string, id: string, revision?: number, active = false) {
  const row = db.db.prepare('SELECT * FROM swa_roles WHERE project_id=? AND id=?').get(project, id)
  if (!row) fail('scope_denied', 'The role does not belong to this project')
  const role = roleValue(row)
  if (revision !== undefined && role.revision !== revision) fail('context_stale', 'The role revision changed')
  if (active && role.archived) fail('scope_denied', 'An archived role cannot receive a new assignment')
  return role
}
function requireConversation(db: OrchestrationDb, project: string, id: string) {
  const row = db.db.prepare('SELECT * FROM swa_conversations WHERE project_id=? AND id=?').get(project, id)
  if (!row) fail('scope_denied', 'The conversation does not belong to this project')
  return conversationSchema.parse(row)
}
function bounded(db: OrchestrationDb, sql: string, parameters: string[]) {
  const bound = z.object({ count: z.number(), bytes: z.number() }).parse(db.db.prepare(sql).get(...parameters))
  if (bound.count > 100_000 || bound.bytes > 12 * 1024 * 1024) fail('resource_limit', 'The complete collaboration record exceeds its read bound')
}
function conversationView(db: OrchestrationDb, project: string, id: string) {
  const conversation = requireConversation(db, project, id)
  bounded(db, "SELECT COUNT(*) count,COALESCE(SUM(LENGTH(CAST(id||request_id||text||author_id||author_kind||created_at AS BLOB))),0) bytes FROM swa_conversation_entries WHERE conversation_id=?", [id])
  const entries = z.array(storedEntry).parse(db.db.prepare('SELECT id,request_id,text,author_id,author_kind,created_at FROM swa_conversation_entries WHERE conversation_id=? ORDER BY created_at,id').all(id))
  return { conversation, entries: entries.map(entry => ({ ...entry, status: 'stored' as const })) }
}

export function collaborationRead(db: OrchestrationDb, invocation: Invocation) {
  const c = invocation.command, project = invocation.project.id
  if (invocation.caller.project_id !== project) fail('scope_denied', 'The collaboration caller belongs to another project')
  if (c.action === 'role.show' && c.role_id) return { role: requireRole(db, project, c.role_id) }
  if (c.action === 'conversation.show' && c.conversation_id) return conversationView(db, project, c.conversation_id)
  if (c.action === 'role.list') {
    bounded(db, "SELECT COUNT(*) count,COALESCE(SUM(LENGTH(CAST(id||project_id||definition||created_at||updated_at AS BLOB))),0) bytes FROM swa_roles WHERE project_id=?", [project])
    return { roles: db.db.prepare('SELECT * FROM swa_roles WHERE project_id=? ORDER BY created_at,id').all(project).map(roleValue) }
  }
  if (c.action === 'conversation.list') {
    bounded(db, "SELECT COUNT(*) count,COALESCE(SUM(LENGTH(CAST(id||project_id||title||COALESCE(role_id,'')||created_at AS BLOB))),0) bytes FROM swa_conversations WHERE project_id=?", [project])
    return { conversations: z.array(conversationSchema).parse(db.db.prepare('SELECT * FROM swa_conversations WHERE project_id=? ORDER BY created_at,id').all(project)) }
  }
  return fail('invalid_argument', 'An exact collaboration read is required')
}

// 元数据和原生 mutation receipt 在同一事务提交；断线重连只回放同一 request。
export function writeCollaborationRecords(db: OrchestrationDb, invocation: Invocation, mutation: NonNullable<RpcContext['orchestrationMutation']>, scope?: Scope) {
  const c = invocation.command, project = invocation.project.id, request = mutation.requestId
  if (request !== c.request_id || mutation.method !== 'swa.collaborationWrite') fail('request_mismatch', 'The original durable collaboration request is required')
  if (invocation.caller.project_id !== project) fail('scope_denied', 'The collaboration caller belongs to another project')
  assertDeliveryGrantCurrent(invocation)
  db.db.exec('BEGIN IMMEDIATE')
  try {
    const now = new Date().toISOString()
    let native: unknown
    if (c.action === 'role.create' && c.role) {
      const definition = roleDefinition.parse(c.role)
      db.db.prepare('INSERT INTO swa_roles(id,project_id,revision,archived,definition,created_at,updated_at) VALUES (?,?,1,0,?,?,?)').run(request, project, JSON.stringify(definition), now, now)
      native = { role: requireRole(db, project, request) }
    } else if ((c.action === 'role.update' || c.action === 'role.archive') && c.role_id && c.revision) {
      const prior = requireRole(db, project, c.role_id, c.revision, true)
      if (prior.revision === Number.MAX_SAFE_INTEGER) fail('resource_limit', 'The role revision bound has been reached')
      const definition = c.action === 'role.update' ? roleDefinition.parse(c.role) : roleDefinition.parse({ name: prior.name, responsibilities: prior.responsibilities, default_agent: prior.default_agent, default_model: prior.default_model, question_mode: prior.question_mode, skills: prior.skills, knowledge: prior.knowledge })
      db.db.prepare('UPDATE swa_roles SET definition=?,revision=revision+1,archived=?,updated_at=? WHERE project_id=? AND id=? AND revision=?').run(JSON.stringify(definition), c.action === 'role.archive' ? 1 : 0, now, project, c.role_id, c.revision)
      native = { role: requireRole(db, project, c.role_id) }
    } else if (c.action === 'conversation.create' && c.conversation) {
      if (c.conversation.role_id) requireRole(db, project, c.conversation.role_id, undefined, true)
      db.db.prepare('INSERT INTO swa_conversations(id,project_id,title,role_id,created_at) VALUES (?,?,?,?,?)').run(request, project, c.conversation.title, c.conversation.role_id ?? null, now)
      native = conversationView(db, project, request)
    } else if (c.action === 'conversation.append' && c.conversation_id && c.text) {
      requireConversation(db, project, c.conversation_id)
      db.db.prepare('INSERT INTO swa_conversation_entries(id,conversation_id,request_id,text,author_id,author_kind,created_at) VALUES (?,?,?,?,?,?,?)').run(request, c.conversation_id, request, c.text, invocation.caller.id, invocation.caller.kind, now)
      native = conversationView(db, project, c.conversation_id)
    } else if (c.action === 'handoff.notify' && c.controller && c.dispatch_id && c.input_file && invocation.input && c.text === undefined) {
      if (!scope || scope.project_id !== project || scope.controller !== c.controller || c.task_id !== scope.root_task_id) fail('scope_denied', 'The notification must name its original root task')
      const dispatch = db.getDispatchContextById(c.dispatch_id)
      if (!dispatch || dispatch.run_id !== scope.run_id || !isTaskDescendant(db, scope.run_id, scope.root_task_id, dispatch.task_id)) fail('scope_denied', 'The notification recipient is outside this task tree')
      const payload = { schema: 'swa.handoff.v1', mode: 'notify', reply: 'none', parent_task_id: scope.root_task_id,
        origin: { kind: invocation.caller.kind, caller_id: invocation.caller.id, project_id: project, request_id: request }, recipient_dispatch_id: dispatch.id }
      const message = db.insertMessage({ id: `${request}/notify`, runId: scope.run_id, from: `${invocation.caller.kind}:${invocation.caller.id}`, to: `dispatch:${dispatch.id}`,
        type: 'handoff', deliveryContract: 'audit_only', subject: 'SWA notification', body: invocation.input.text, payload: JSON.stringify(payload) })
      native = { handoff: payload, message, delivery: 'stored', new_task: false, new_worker: false }
    } else return fail('invalid_argument', 'An exact collaboration mutation is required')
    assertDeliveryGrantCurrent(invocation)
    const receipt = { project_id: project, action: c.action, ...(c.controller ? { controller: c.controller } : {}), native }
    db.completeMutationReceipt({ ...mutation, receipt: JSON.stringify(receipt) })
    db.db.exec('COMMIT')
    return receipt
  } catch (error) {
    db.db.exec('ROLLBACK')
    throw error
  }
}

export function resolveCollaborationReferences(db: OrchestrationDb, project: string, references: { role_id?: string; role_revision?: number; conversation_id?: string }) {
  const role = references.role_id ? requireRole(db, project, references.role_id, references.role_revision, true) : undefined
  if (!!references.role_id !== !!references.role_revision) fail('invalid_argument', 'A role assignment requires its exact revision')
  const conversation = references.conversation_id ? requireConversation(db, project, references.conversation_id) : undefined
  if (conversation?.role_id && conversation.role_id !== role?.id) fail('scope_denied', 'The conversation and task roles differ')
  return { ...(role ? { role_snapshot: role } : {}), ...(conversation ? { conversation_id: conversation.id } : {}) }
}


// 接受新 Task/Worker 的原 reservation 事务内重核，接受后保留不可变历史快照。
export function assertCurrentCollaborationAssignment(db: OrchestrationDb, invocation: Invocation) {
  const c = invocation.command
  if (c.action !== 'task.create' && c.action !== 'worker.start') return
  const metadata = nativeObject(invocation.spec)
  const references = c.action === 'task.create'
    ? z.object({ role_id: z.string().optional(), role_revision: z.number().int().positive().optional(), conversation_id: z.string().optional() }).parse(metadata)
    : { role_id: c.role_id, role_revision: c.revision }
  const current = resolveCollaborationReferences(db, invocation.project.id, references)
  if (!isDeepStrictEqual(metadata.role_snapshot, current.role_snapshot) || metadata.conversation_id !== current.conversation_id) fail('context_stale', 'The collaboration assignment changed before its original reservation')
}

export function fixedTaskSpec(invocation: Invocation) {
  const metadata = nativeObject(invocation.spec)
  return { schema: 'swa.task-spec.v2', spec: invocation.spec, context: invocation.context, project_id: invocation.project.id,
    settings_revision: invocation.caller.settings_revision,
    origin: { kind: invocation.caller.kind, caller_id: invocation.caller.id, project_id: invocation.project.id, request_id: invocation.command.request_id },
    ...(metadata.role_snapshot ? { role_snapshot: metadata.role_snapshot } : {}),
    ...(invocation.submission ? { execution_policy: 'complete_native_turns', acceptance: 'unreviewed' } : {}) }
}

export function workerTaskSpec(invocation: Invocation) {
  if (!invocation.input) fail('invalid_argument', 'The exact Worker input is required')
  const metadata = invocation.spec?.handoff
  return metadata === undefined ? `${invocation.input.text}\n\n固定公开上下文：\n${JSON.stringify(invocation.scope.context)}`
    : JSON.stringify({ schema: 'swa.handoff-task.v1', goal: invocation.input.text, context: invocation.scope.context, handoff: metadata,
      ...(invocation.spec?.role_snapshot ? { role_snapshot: invocation.spec.role_snapshot } : {}) })
}
