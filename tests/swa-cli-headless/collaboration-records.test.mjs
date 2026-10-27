import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/collaboration-records'), { recursive: true })
const directory = await mkdtemp(join(root, '.verification/collaboration-records/case-'))
const bundle = join(directory, 'records.cjs')
const built = buildSync({ stdin: { contents: "export { OrchestrationDb } from './third_party/orca-v1.4.230/src/main/runtime/orchestration/db'; export { hashCanonical } from './third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-receipt'; export * from './runtime/swa-orca/src/collaboration-records'; export * from './runtime/swa-orca/src/role-selection'; export { deliveryAdmissionInvocation } from './runtime/swa-orca/src/delivery-admission'", resolveDir: root }, platform: 'node', format: 'cjs', bundle: true, write: false, alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') }, nodePaths: [join(root, 'runtime/swa-orca/node_modules')], external: ['*.node'] })
await writeFile(bundle, built.outputFiles[0].contents)
const { OrchestrationDb, hashCanonical, initializeCollaborationRecords, collaborationRead, writeCollaborationRecords, resolveCollaborationReferences, assertCurrentCollaborationAssignment, assignedAgent, workerSelectionMatches, deliveryAdmissionInvocation } = createRequire(bundle)(bundle)
const role = { name: 'Code reviewer', responsibilities: 'Review public repository changes', default_agent: 'pi', default_model: 'stepfun/step-3.5-flash', skills: ['Review task specifications'], knowledge: ['Public repository coding rules'] }

function createCase(name) {
  const path = join(directory, `${name}.sqlite`), db = new OrchestrationDb(path), project = randomUUID()
  initializeCollaborationRecords(db)
  return { db, path, project }
}
function invocation(value, command) {
  return { command, project: { id: value.project, root }, caller: { id: 'public-task-author', kind: 'human', project_id: value.project, settings_revision: 1 }, scope: { project_id: value.project, controller: '', run_id: '', root_task_id: '', authority_domain: value.db.getOrCreateLocalMutationCallerFingerprint(), context: {} } }
}
function write(value, command, scope, file) {
  const input = invocation(value, { ...command, request_id: command.request_id ?? randomUUID() })
  if (file) input.input = file
  const identity = { callerFingerprint: value.db.getOrCreateLocalMutationCallerFingerprint(), requestId: input.command.request_id, method: 'swa.collaborationWrite', payloadHash: hashCanonical(input) }
  const reserved = value.db.beginMutationReceipt(identity)
  const result = reserved.disposition === 'completed' ? JSON.parse(reserved.row.receipt) : writeCollaborationRecords(value.db, input, identity, scope)
  return { result, input, identity }
}

test('roles survive reopen, retain immutable assignment snapshots and require revision CAS', () => {
  const value = createCase('roles')
  const selectedRole = { ...role, question_mode: 'native' }
  const created = write(value, { action: 'role.create', role: selectedRole })
  const id = created.result.native.role.id
  try {
    assert.equal(created.result.native.role.revision, 1)
    const snapshot = resolveCollaborationReferences(value.db, value.project, { role_id: id, role_revision: 1 })
    assert.equal(snapshot.role_snapshot.question_mode, 'native')
    const assignments = [
      { ...invocation(value, { action: 'task.create' }), spec: { role_id: id, role_revision: 1, ...snapshot } },
      { ...invocation(value, { action: 'worker.start', role_id: id, revision: 1 }), spec: snapshot }
    ]
    value.db.db.exec('BEGIN IMMEDIATE')
    for (const input of assignments) assertCurrentCollaborationAssignment(value.db, input)
    value.db.db.exec('ROLLBACK')
    const updated = write(value, { action: 'role.update', role_id: id, revision: 1, role: { ...selectedRole, responsibilities: 'Review security and behavior' } })
    assert.equal(updated.result.native.role.revision, 2)
    assert.equal(updated.result.native.role.question_mode, 'native')
    assert.equal(snapshot.role_snapshot.responsibilities, role.responsibilities)
    value.db.db.exec('BEGIN IMMEDIATE')
    for (const input of assignments) assert.throws(() => assertCurrentCollaborationAssignment(value.db, input), { code: 'context_stale' })
    value.db.db.exec('ROLLBACK')
    assert.throws(() => write(value, { action: 'role.update', role_id: id, revision: 1, role }), { code: 'context_stale' })
    assert.equal(value.db.db.isTransaction, false)
    assert.throws(() => resolveCollaborationReferences(value.db, 'another-project', { role_id: id, role_revision: 2 }), { code: 'scope_denied' })
    assert.equal(write(value, { action: 'role.archive', role_id: id, revision: 2 }).result.native.role.archived, true)
    assert.throws(() => resolveCollaborationReferences(value.db, value.project, { role_id: id, role_revision: 3 }), { code: 'scope_denied' })
  } finally { value.db.close() }
  const reopened = new OrchestrationDb(value.path)
  try {
    initializeCollaborationRecords(reopened)
    const saved = collaborationRead(reopened, invocation({ ...value, db: reopened }, { action: 'role.show', role_id: id })).role
    assert.equal(saved.archived, true)
    assert.equal(saved.revision, 3)
    assert.equal(saved.question_mode, 'native')
  } finally { reopened.close() }
})

test('role defaults select the original worker and its admission target', () => {
  const value = createCase('role-selection')
  try {
    const id = write(value, { action: 'role.create', role }).result.native.role.id
    const snapshot = resolveCollaborationReferences(value.db, value.project, { role_id: id, role_revision: 1 })
    const command = { action: 'worker.start', role_id: id, revision: 1, question_mode: 'native' }
    const input = { ...invocation(value, command), spec: snapshot, selection: { agent_id: 'pi', model: 'stepfun/step-3.5-flash' } }
    assert.deepEqual(assignedAgent(command, value.project, snapshot.role_snapshot), { agent: 'pi', model: 'stepfun/step-3.5-flash' })
    assert.equal(workerSelectionMatches(input), true)
    const admission = deliveryAdmissionInvocation(input)
    assert.equal(admission.command.agent, 'pi')
    assert.equal(admission.command.model, 'stepfun/step-3.5-flash')
    assert.equal(admission.command.question_mode, 'native')
    assert.equal(input.command.agent, undefined)
    const override = { ...command, agent: 'codex', model: 'gpt-5.5' }
    assert.deepEqual(assignedAgent(override, value.project, snapshot.role_snapshot), { agent: 'codex', model: 'gpt-5.5' })
    assert.equal(workerSelectionMatches({ ...input, command: override }), false)
    assert.throws(() => deliveryAdmissionInvocation({ ...input, command: override }), { code: 'request_mismatch' })
    assert.throws(() => assignedAgent({ ...command, agent: 'codex' }, value.project, snapshot.role_snapshot), { code: 'invalid_argument' })
    assert.throws(() => assignedAgent(command, 'other-project', snapshot.role_snapshot), { code: 'context_stale' })
    assert.throws(() => assignedAgent({ ...command, revision: 2 }, value.project, snapshot.role_snapshot), { code: 'context_stale' })
    write(value, { action: 'role.update', role_id: id, revision: 1, role: { ...role, default_agent: 'codex', default_model: 'gpt-5.5' } })
    assert.throws(() => assertCurrentCollaborationAssignment(value.db, input), { code: 'context_stale' })
    assert.throws(() => resolveCollaborationReferences(value.db, value.project, { role_id: id, role_revision: 1 }), { code: 'context_stale' })
  } finally { value.db.close() }
})

test('conversation append and native receipt commit together and same request never duplicates', () => {
  const value = createCase('conversations')
  try {
    const roleId = write(value, { action: 'role.create', role }).result.native.role.id
    const conversation = write(value, { action: 'conversation.create', conversation: { title: 'Review requirements', role_id: roleId } }).result.native.conversation
    const request_id = randomUUID(), command = { action: 'conversation.append', conversation_id: conversation.id, text: 'Check the exact public commit.', request_id }
    const first = write(value, command), second = write(value, command)
    assert.deepEqual(first.result, second.result)
    assert.equal(first.result.native.entries.length, 1)
    assert.equal(first.result.native.entries[0].status, 'stored')
    assert.equal(first.result.native.entries[0].author_kind, 'human')
    assert.equal(value.db.getMutationReceipt(first.identity.callerFingerprint, request_id).state, 'completed')
    assert.throws(() => write(value, { ...command, text: 'Different request body' }), { code: 'request_mismatch' })
    assert.throws(() => resolveCollaborationReferences(value.db, value.project, { conversation_id: conversation.id }), { code: 'scope_denied' })
    const references = resolveCollaborationReferences(value.db, value.project, { role_id: roleId, role_revision: 1, conversation_id: conversation.id })
    assert.equal(references.conversation_id, conversation.id)
    assert.equal(value.db.db.prepare('SELECT COUNT(*) count FROM tasks').get().count, 0)
    assert.equal(value.db.db.prepare('SELECT COUNT(*) count FROM worker_dispatches').get().count, 0)
    assert.throws(() => collaborationRead(value.db, invocation({ ...value, project: randomUUID() }, { action: 'conversation.show', conversation_id: conversation.id })), { code: 'scope_denied' })
  } finally { value.db.close() }
})

test('missing original mutation receipt rolls back metadata instead of leaving an orphan role', () => {
  const value = createCase('atomic')
  try {
    const input = invocation(value, { action: 'role.create', role, request_id: randomUUID() })
    const identity = { callerFingerprint: value.db.getOrCreateLocalMutationCallerFingerprint(), requestId: input.command.request_id, method: 'swa.collaborationWrite', payloadHash: hashCanonical(input) }
    assert.throws(() => writeCollaborationRecords(value.db, input, identity), { code: 'request_mismatch' })
    assert.equal(collaborationRead(value.db, invocation(value, { action: 'role.list' })).roles.length, 0)
    assert.equal(value.db.db.isTransaction, false)
  } finally { value.db.close() }
})

test('notify stores the approved file verbatim in one native mailbox record without another task or worker', async () => {
  const value = createCase('notification')
  try {
    const path = 'README.md', info = await stat(join(root, path), { bigint: true })
    const file = { path, version: `mtime:${info.mtimeNs};size:${info.size}`, text: await readFile(join(root, path), 'utf8') }
    const run = value.db.createRun({ objective: 'Observe notification records', coordinatorHandle: null, coordinatorPaneKey: null })
    const parent = value.db.createTask({ runId: run.id, spec: JSON.stringify({ project_id: value.project, spec: { max_workers: 2 } }) })
    const task = value.db.createTask({ runId: run.id, parentId: parent.id, spec: 'Observe native mailbox delivery' })
    const dispatch = value.db.createDispatchContext({ taskId: task.id, assigneeHandle: 'database-recipient', creator: { kind: 'system' }, maxDepth: 4 })
    const scope = { project_id: value.project, controller: 'database-observation', run_id: run.id, root_task_id: parent.id, authority_domain: value.db.getOrCreateLocalMutationCallerFingerprint(), context: {} }
    const request_id = randomUUID(), command = { action: 'handoff.notify', controller: scope.controller, task_id: parent.id, dispatch_id: dispatch.id, input_file: path, request_id }
    assert.throws(() => write(value, { ...command, request_id: randomUUID() }, scope), { code: 'invalid_argument' })
    assert.throws(() => write(value, { ...command, request_id: randomUUID(), text: file.text }, scope, file), { code: 'invalid_argument' })
    assert.equal(value.db.db.prepare('SELECT COUNT(*) count FROM messages').get().count, 0)
    assert.equal(value.db.db.isTransaction, false)
    const first = write(value, command, scope, file), second = write(value, command, scope, file)
    assert.equal(first.result.native.delivery, 'stored')
    assert.equal(first.result.native.message.delivery_contract, 'audit_only')
    assert.equal(first.result.native.message.id, second.result.native.message.id)
    assert.equal(first.result.native.message.body, file.text)
    assert.equal(first.result.native.handoff.reply, 'none')
    assert.equal(value.db.db.prepare('SELECT COUNT(*) count FROM tasks').get().count, 2)
    assert.equal(value.db.db.prepare('SELECT COUNT(*) count FROM worker_dispatches').get().count, 0)
    assert.equal(value.db.db.prepare('SELECT COUNT(*) count FROM messages').get().count, 1)
    assert.deepEqual(value.db.getUnreadMessages(`dispatch:${dispatch.id}`), [])
  } finally { value.db.close() }
})
