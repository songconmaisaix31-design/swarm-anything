import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, realpath, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { build, stop } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/cloud-setup/question-ask'), { recursive: true })
const directory = await mkdtemp(join(root, '.verification/cloud-setup/question-ask/case-'))
const bundle = join(directory, 'question-ask.cjs')
const dependencies = await realpath(join(root, 'runtime/swa-orca/node_modules'))
await symlink(dependencies, join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
assert.equal(await realpath(join(directory, 'node_modules')), dependencies)
try {
  await build({ stdin: { contents: [
    "export { OrchestrationDb } from './third_party/orca-v1.4.230/src/main/runtime/orchestration/db';",
    "export { OrcaRuntimeService } from './third_party/orca-v1.4.230/src/main/runtime/orca-runtime';",
    "export { OrchestrationError } from './third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error';",
    "export { getOrchestrationMutationExecutor } from './third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-executor';",
    "export { ORCHESTRATION_MUTATION_REQUEST_METHODS } from './third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/runs/mutation-request-show';",
    "export { commandSchema, roleDefinitionSchema, questionToolParamsSchema, questionResumeBody } from './runtime/swa-orca/src/contracts';",
    "export { questionAskMethod, admitQuestionProducer, observeRunQuestions, assertQuestionResume, hasQuestionSettlementBlock, hasTaskQuestionSettlementBlock } from './runtime/swa-orca/src/question-ask';",
    "export { assertTaskQuestionSettlementReady, RunSettlementWaiting, handoffResumeInvocation, validateHandoffInput, handoffParentDisposition, confirmedWorkerStop } from './runtime/swa-orca/src/run-settlement';",
    "export { assertDelegationParentStopOpen, storedDelegationObservation } from './runtime/swa-orca/src/delegation';",
    "export { assertNativePiStopInvocation } from './runtime/swa-orca/src/agent-launch-admission';",
    "export { startJournalRowFold } from './third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-open';",
    "export { renderJournalState } from './third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-reducer';",
    "export { delegationRequestID, delegationWorkerRequestID } from './runtime/swa-orca/src/contracts';",
    "export { initializeCollaborationRecords, writeCollaborationRecords, resolveCollaborationReferences } from './runtime/swa-orca/src/collaboration-records';",
    "export { hashCanonical } from './third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-receipt';",
    "export { inspectStructuredTrace, resultObservationLimits, journalReadWithinBounds } from './runtime/swa-orca/src/task-result';",
    "export { readRunView } from './runtime/swa-orca/src/run-view';"
  ].join('\n'), resolveDir: root }, platform: 'node', target: 'node24', format: 'cjs', bundle: true, outfile: bundle, conditions: ['orca-source'],
    external: ['electron', 'node-pty', '@parcel/watcher', 'fsevents', '@orca/windows-security', '@orca/windows-registry', '@vscode/windows-process-tree', '@anthropic-ai/claude-agent-sdk'],
    banner: { js: 'var __swaModuleUrl = require("node:url").pathToFileURL(__filename).href;' }, define: { 'import.meta.url': '__swaModuleUrl', 'process.env.NODE_ENV': '"production"' }, logOverride: { 'empty-import-meta': 'error' },
    plugins: [{ name: 'original-native-externals', setup(builder) { builder.onResolve({ filter: /\.node$/ }, args => ({ path: args.path, external: true })) } },
      { name: 'original-jsonc-esm', setup(builder) { builder.onResolve({ filter: /^jsonc-parser$/ }, () => ({ path: join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') })) } }],
    nodePaths: [join(root, 'runtime/swa-orca/node_modules'), join(root, 'node_modules')], logLevel: 'error' })
} finally { stop() }
const { OrchestrationDb, OrcaRuntimeService, OrchestrationError, getOrchestrationMutationExecutor, ORCHESTRATION_MUTATION_REQUEST_METHODS, commandSchema, roleDefinitionSchema, questionToolParamsSchema, questionResumeBody, questionAskMethod, admitQuestionProducer, observeRunQuestions, assertQuestionResume, hasQuestionSettlementBlock, hasTaskQuestionSettlementBlock, assertTaskQuestionSettlementReady, readRunView } = createRequire(bundle)(bundle)

function storage(name) {
  const db = new OrchestrationDb(join(directory, `${name}.sqlite`)), runtime = new OrcaRuntimeService()
  runtime.setOrchestrationDb(db)
  const project = randomUUID(), run = db.createRun({ objective: 'Read original native question storage', coordinatorHandle: null, coordinatorPaneKey: null })
  const task = db.createTask({ runId: run.id, spec: JSON.stringify({ project_id: project, spec: { max_workers: 4 } }) })
  const dispatch = db.createDispatchContext({ taskId: task.id, assigneeHandle: 'question-storage-only', creator: { kind: 'system' }, maxDepth: 4 })
  const scope = { project_id: project, controller: 'question-storage-only', run_id: run.id, root_task_id: task.id, authority_domain: db.getOrCreateLocalMutationCallerFingerprint(), context: {} }
  return { db, runtime, project, run, task, dispatch, scope }
}

test('journal capacity counts SQLite UTF-8 bytes and keeps source, result and wire budgets separate', () => {
  const { resultObservationLimits: limits, journalReadWithinBounds } = createRequire(bundle)(bundle)
  assert.equal(limits.journal_bytes, 32 * 1024 * 1024); assert.equal(limits.journal_rows, 100_000)
  assert.equal(limits.source_bytes, 12 * 1024 * 1024); assert.equal(limits.result_bytes, 96 * 1024 * 1024); assert.equal(limits.response_bytes, 128 * 1024 * 1024)
  // 构造普通文本验证容量规则，不生成原生会话或模型完成记录。
  const db = new DatabaseSync(':memory:')
  try {
    db.exec('CREATE TABLE capacity_text(body TEXT NOT NULL)')
    const text = '汉'.repeat(Math.floor(limits.journal_bytes / 3)) + 'x'.repeat(limits.journal_bytes % 3)
    db.prepare('INSERT INTO capacity_text(body) VALUES (?)').run(text)
    const read = () => db.prepare('SELECT COUNT(*) count,SUM(LENGTH(CAST(body AS BLOB))) bytes FROM capacity_text').get()
    assert.equal(read().bytes, limits.journal_bytes); assert.equal(journalReadWithinBounds(read()), true)
    db.exec("UPDATE capacity_text SET body=body||'x'")
    assert.equal(read().bytes, limits.journal_bytes + 1); assert.equal(journalReadWithinBounds(read()), false)
    assert.equal(journalReadWithinBounds({ count: limits.journal_rows, bytes: 1 }), true)
    assert.equal(journalReadWithinBounds({ count: limits.journal_rows + 1, bytes: 1 }), false)
    assert.equal(journalReadWithinBounds({ count: 1, bytes: -1 }), false)
    assert.equal(journalReadWithinBounds({ count: 1, bytes: Number.MAX_SAFE_INTEGER + 1 }), false)
  } finally { db.close() }
})

test('the original N4 journals above the former bound replay completely without modifying their rows', { skip: !process.env.SWA_JOURNAL_CAPACITY_DB }, t => {
  const { journalReadWithinBounds, resultObservationLimits: limits, startJournalRowFold, renderJournalState } = createRequire(bundle)(bundle)
  const db = new DatabaseSync(process.env.SWA_JOURNAL_CAPACITY_DB, { readOnly: true }), measured = []
  try {
    db.exec('BEGIN')
    for (const { session_id: sessionId, epoch } of db.prepare('SELECT session_id,epoch FROM journal_sessions ORDER BY session_id').all()) {
      const bound = db.prepare('SELECT COUNT(*) count,SUM(LENGTH(CAST(row_json AS BLOB))) bytes,MAX(seq) sequence FROM journal_rows WHERE session_id=? AND epoch=?').get(sessionId, epoch)
      assert.equal(journalReadWithinBounds(bound), true)
      const fold = startJournalRowFold({ sessionId, epoch }); let rows = 0
      for (const row of db.prepare('SELECT seq,ts,row_json FROM journal_rows WHERE session_id=? AND epoch=? ORDER BY seq').iterate(sessionId, epoch)) {
        assert.equal(fold.add({ seq: row.seq, ts: row.ts, rowJson: row.row_json }), true); rows++
      }
      const observed = fold.finish()
      assert.equal(observed.damage, null); assert.equal(observed.newer, null); assert.equal(rows, bound.count); assert.equal(observed.state.lastSequence, bound.sequence)
      measured.push({ session_id: sessionId, rows, bytes: bound.bytes, snapshot_bytes: Buffer.byteLength(JSON.stringify(renderJournalState(observed.state))) })
    }
    db.exec('COMMIT')
  } finally { db.close() }
  assert.ok(measured.filter(row => row.bytes > limits.source_bytes).length >= 2, 'The supplied original failure data must exercise both journals above the former 12 MiB bound')
  t.diagnostic(JSON.stringify({ scope: 'read-only original rows and mature replay; complete export not tested here', journals: measured }))
})

test('owned Pi stop retains its stable scope after project permissions change', () => {
  const { assertNativePiStopInvocation } = createRequire(bundle)(bundle)
  // 仅验证停止来源规则；这些对象不表示实际 Worker、模型调用或进程退出证据。
  const requestId = randomUUID(), dispatchId = randomUUID()
  const original = { project: { id: randomUUID(), root, settings: { revision: 1, allowed_tools: ['project_shell'] } }, scope: { controller: 'rule-only-controller', run_id: randomUUID(), root_task_id: randomUUID(), authority_domain: 'rule-only-authority', context: {} } }
  const current = { ...structuredClone(original), command: { action: 'worker.stop', controller: original.scope.controller, dispatch_id: dispatchId, request_id: requestId } }
  current.project.settings = { revision: 2, allowed_tools: [] }
  assert.doesNotThrow(() => assertNativePiStopInvocation(current, original, requestId, dispatchId))
  for (const change of [
    value => { value.project.id = randomUUID() },
    value => { value.project.root = join(root, 'different-project') },
    value => { value.scope.run_id = randomUUID() },
    value => { value.scope.root_task_id = randomUUID() },
    value => { value.scope.authority_domain = 'different-authority' },
    value => { value.command.dispatch_id = randomUUID() },
    value => { value.command.controller = 'different-controller' },
    value => { value.command.request_id = randomUUID() },
    value => { value.command.action = 'worker.send' }
  ]) {
    const changed = structuredClone(current); change(changed)
    assert.throws(() => assertNativePiStopInvocation(changed, original, requestId, dispatchId), /left its original scope/)
  }
})

test('cancelled settlement requires the exact completed stop, original start and released owner', () => {
  const { confirmedWorkerStop, hashCanonical } = createRequire(bundle)(bundle)
  const value = storage('confirmed-worker-stop-rule'), { db, runtime, scope } = value
  try {
    // 仅在真实 SQLite 中验证构造的权限/回执规则，不构造实际 CLI 或进程退出证明。
    const session = randomUUID(), startId = randomUUID(), stopId = randomUUID(), incarnation = `structured:${session}`
    const task = db.createTask({ runId: value.run.id, parentId: value.task.id, spec: 'Stop receipt boundary rule' })
    const dispatch = db.createDispatchContext({ taskId: task.id, assigneeHandle: 'rule-worker', creator: { kind: 'system' }, maxDepth: 4 })
    db.db.prepare('UPDATE runs SET coordinator_handle=? WHERE id=?').run(scope.controller, value.run.id)
    db.db.prepare("UPDATE dispatch_contexts SET status='failed',last_failure='stopped',capability_revoked_at='rule-stop',completed_at='rule-stop',assignee_orca_session_id=?,process_incarnation=? WHERE id=?").run(session, incarnation, dispatch.id)
    db.db.prepare("INSERT INTO worker_dispatches(dispatch_id,runtime_epoch,state,stage) VALUES (?,?,'stopped','process_stopped')").run(dispatch.id, runtime.getRuntimeId())
    db.createWorkerTerminalResourceStatement({ dispatchId: dispatch.id, worktreeId: 'rule-workspace', terminalHandle: 'rule-worker', paneKey: null, processIncarnation: incarnation, ownership: 'owned' })
    const selection = { agent_id: 'pi', adapter: 'rule-only', execution_mode: 'structured', executable: '/rule/pi', version: '1.0.1', model: 'stepfun/step-3.5-flash', provider: 'stepfun', external_target: 'pi', settings_source: { kind: 'native' }, settings_revision: 1, configuration_version: 'rule-only', native_launch: { schema: 'swa.native-launch.v1', account: { kind: 'pi-native-api-key-per-session', provider: 'stepfun', source_home: '/rule/source', auth_source: { path: '/rule/source/auth.json', version: 'rule-only' }, models_source: null, private_root: '/rule/private', model_target: { model_id: 'step-3.5-flash', api: 'openai-completions', base_url: 'https://api.stepfun.com/v1' } }, tools: { mode: 'disabled', native_contract: 'pi-cli-1.0.1' } } }
    const caller = { id: 'rule-human', kind: 'human', project_id: value.project, settings_revision: 1 }, project = { id: value.project, root, settings: { revision: 1, allowed_tools: ['project_shell'] } }
    const binding = { parent_request: startId, child_request: `${startId}/native`, dispatch_id: dispatch.id, agent: 'pi', execution_mode: 'structured', session_id: session, operation_id: 'rule-original-input', runtime_fence: 2, consumer_generation: db.getRun(value.run.id).consumer_generation, body: {} }
    const receipt = (requestId, action, invocation, native) => ({ action, project_id: value.project, controller: scope.controller, run_id: scope.run_id, root_task_id: scope.root_task_id, child_request: `${requestId}/native`, invocation, native })
    const started = receipt(startId, 'worker.start', { command: { action: 'worker.start', controller: scope.controller, request_id: startId }, caller, project, scope, selection }, { dispatchId: dispatch.id, taskId: task.id, state: 'ready' })
    Object.assign(started, { selection, swa_input_binding: binding })
    const nativeStop = { dispatchId: dispatch.id, state: 'stopped', alreadySettled: false, processAction: 'closed_agent_terminal' }
    const stopped = receipt(stopId, 'worker.stop', { command: { action: 'worker.stop', controller: scope.controller, dispatch_id: dispatch.id, request_id: stopId }, caller: { ...caller, settings_revision: 2 }, project: { ...project, settings: { revision: 2, allowed_tools: [] } }, scope }, nativeStop)
    const save = (id, method, body) => {
      const identity = { callerFingerprint: scope.authority_domain, requestId: id, method, payloadHash: hashCanonical(body) }
      db.beginMutationReceipt(identity); db.completeMutationReceipt({ ...identity, receipt: JSON.stringify(body) })
    }
    save(startId, 'swa.controllerDeliver', started)
    save(`${startId}/native`, 'orchestration.workerStart', { ...started.native, swa_input_binding: binding })
    save(stopId, 'swa.controllerDeliver', stopped)
    save(`${stopId}/native`, 'orchestration.workerStop', nativeStop)
    const record = { sessionId: session, provider: 'pi', lease: { claimStatus: 'released', ownerProcess: null, runtimeFence: 3, unreconciled: false, deathEvidence: { kind: 'exit-observed', ownerFence: 2 } } }
    const read = (candidate = record, currentScope = scope) => confirmedWorkerStop(runtime, currentScope, dispatch.id, candidate)
    const counts = () => [db.db.prepare('SELECT count(*) n FROM tasks').get().n, db.db.prepare('SELECT count(*) n FROM mutation_receipts').get().n]
    const before = counts(), proof = read()
    assert.equal(proof?.source, 'confirmed_worker_stop'); assert.equal(proof.request_id, stopId); assert.equal(proof.owner_fence, 2)
    assert.deepEqual(read(), proof); assert.deepEqual(counts(), before)
    for (const sql of [
      "UPDATE mutation_receipts SET state='pending' WHERE request_id=?",
      "UPDATE mutation_receipts SET receipt=json_set(receipt,'$.native.alreadySettled',json('true')) WHERE request_id=?",
      "UPDATE mutation_receipts SET receipt=json_set(receipt,'$.invocation.project.root','/different-project') WHERE request_id=?",
      "UPDATE mutation_receipts SET receipt=json_set(receipt,'$.invocation.scope.run_id','different-run') WHERE request_id=?"
    ]) {
      db.db.exec('BEGIN'); try { db.db.prepare(sql).run(stopId); assert.equal(read(), null) } finally { db.db.exec('ROLLBACK') }
    }
    for (const [id, sql] of [
      [`${stopId}/native`, "UPDATE mutation_receipts SET state='pending' WHERE request_id=?"],
      [`${stopId}/native`, "UPDATE mutation_receipts SET receipt=json_set(receipt,'$.dispatchId','other-dispatch') WHERE request_id=?"],
      [startId, "UPDATE mutation_receipts SET receipt=json_set(receipt,'$.swa_input_binding.session_id','other-session') WHERE request_id=?"],
      [startId, "UPDATE mutation_receipts SET caller_fingerprint='other-authority' WHERE request_id=?"],
      [dispatch.id, "UPDATE worker_dispatches SET runtime_epoch='other-runtime' WHERE dispatch_id=?"],
      [dispatch.id, "UPDATE worker_terminal_resources SET release_state='requested' WHERE owner_dispatch_id=?"]
    ]) {
      db.db.exec('BEGIN'); try { db.db.prepare(sql).run(id); assert.equal(read(), null) } finally { db.db.exec('ROLLBACK') }
    }
    for (const lease of [{ claimStatus: 'live' }, { ownerProcess: {} }, { deathEvidence: null }, { deathEvidence: { kind: 'exit-observed', ownerFence: 1 } }, { runtimeFence: 2 }, { unreconciled: true }]) assert.equal(read({ ...record, lease: { ...record.lease, ...lease } }), null)
    assert.equal(read(record, { ...scope, project_id: randomUUID() }), null)
    db.db.exec('BEGIN')
    try {
      db.db.prepare("UPDATE worker_terminal_resources SET ownership_state='released',release_state='released' WHERE owner_dispatch_id=?").run(dispatch.id)
      assert.deepEqual(read(), proof)
    } finally { db.db.exec('ROLLBACK') }
    assert.deepEqual(read(), proof); assert.deepEqual(counts(), before)
  } finally { db.close() }
})

test('parent delegation rejects its exact pending stop or release, including unknown effects', async () => {
  const { assertDelegationParentStopOpen } = createRequire(bundle)(bundle)
  // 只验证真实 SQLite reservation 的权限与范围规则，不构造 Worker 或原生终止证据。
  for (const action of ['worker.stop', 'worker.release']) {
    const value = storage(`parent-${action}-reservation`), executor = getOrchestrationMutationExecutor(value.runtime)
    const check = () => assertDelegationParentStopOpen(value.runtime, value.run.id, value.dispatch.id)
    try {
      for (const variant of ['other-authority', 'other-run', 'other-dispatch', 'completed-rejection']) {
        const id = randomUUID(), caller = variant === 'other-authority' ? randomUUID() : value.scope.authority_domain
        const request = { id, authToken: '', method: 'swa.controllerDeliver', orchestrationRequestId: id }
        const receipt = { action, run_id: variant === 'other-run' ? randomUUID() : value.run.id, invocation: { command: { dispatch_id: variant === 'other-dispatch' ? randomUUID() : value.dispatch.id } } }
        const operation = executor.run(request, { variant, action }, mutation => {
          value.db.checkpointPendingMutationReceipt({ ...mutation.identity, receipt: JSON.stringify(receipt) })
          if (variant === 'completed-rejection') { mutation.recordReceipt({ ...receipt, state: 'rejected', effects_applied: false }); return }
          throw new OrchestrationError('operation_unknown', 'Preserve the original unrelated reservation')
        }, caller)
        if (variant === 'completed-rejection') await operation
        else await assert.rejects(operation, { code: 'operation_unknown' })
        assert.doesNotThrow(check)
      }
      const id = randomUUID(), request = { id, authToken: '', method: 'swa.controllerDeliver', orchestrationRequestId: id }
      await assert.rejects(executor.run(request, { action }, mutation => {
        value.db.checkpointPendingMutationReceipt({ ...mutation.identity, receipt: JSON.stringify({ action, run_id: value.run.id, invocation: { command: { dispatch_id: value.dispatch.id } } }) })
        assert.throws(check, { code: 'scope_denied' })
        throw new OrchestrationError('operation_unknown', 'Preserve the exact parent stop reservation')
      }, value.scope.authority_domain), { code: 'operation_unknown' })
      assert.throws(check, { code: 'scope_denied' })
      await assert.rejects(executor.run(request, { action }, () => assert.fail('An unknown stop cannot execute twice'), value.scope.authority_domain), { code: 'operation_unknown' })
      assert.throws(check, { code: 'scope_denied' })
    } finally { value.db.close() }
  }
})

test('a saved rejected delegation remains observable after its role changes without selecting or creating a child', async () => {
  const { storedDelegationObservation, delegationRequestID, delegationWorkerRequestID, initializeCollaborationRecords, writeCollaborationRecords, resolveCollaborationReferences, hashCanonical } = createRequire(bundle)(bundle)
  const value = storage('rejected-delegation-role'), executor = getOrchestrationMutationExecutor(value.runtime)
  try {
    // 构造父来源只用于存储规则，不声称存在实际 Worker 或原生模型工具调用。
    initializeCollaborationRecords(value.db)
    const caller = { id: 'storage-rule-owner', kind: 'human', project_id: value.project, settings_revision: 1 }, project = { id: value.project, root }
    const writeRole = command => {
      const invocation = { command: { ...command, request_id: randomUUID() }, caller, project, scope: value.scope }
      const identity = { callerFingerprint: value.scope.authority_domain, requestId: invocation.command.request_id, method: 'swa.collaborationWrite', payloadHash: hashCanonical(invocation) }
      value.db.beginMutationReceipt(identity)
      return writeCollaborationRecords(value.db, invocation, identity).native.role
    }
    const definition = { name: 'Worker role', responsibilities: 'Return a public code review', default_agent: 'opencode', default_model: 'stepfun/step-3.5-flash', skills: [], knowledge: [] }
    const role = writeRole({ action: 'role.create', role: definition })
    const origin = { nativeSessionId: '0199dc51-df41-7000-8000-000000000001', assistantEntryId: 'rule-only-entry', toolCallId: 'rule-only-call' }, sessionId = 'rule-only-session'
    const requestId = delegationRequestID(sessionId, origin), workerRequest = delegationWorkerRequestID(requestId)
    const params = { role_id: role.id, revision: role.revision, input: 'Review the public source.', completion_criteria: ['Return findings.'], mode: 'work' }
    const saved = { schema: 'swa.native-delegation.v1', request_id: requestId, worker_request_id: workerRequest, state: 'rejected', project_id: value.project, run_id: value.run.id, parent_task_id: value.task.id, parent_dispatch_id: value.dispatch.id, session_id: sessionId, origin, params, error: { code: 'context_stale', message: 'The original start was rejected' } }
    await executor.run({ id: requestId, authToken: '', method: 'swa.delegate', orchestrationRequestId: requestId }, params, mutation => { mutation.recordReceipt(saved); return saved }, value.scope.authority_domain)
    writeRole({ action: 'role.update', role_id: role.id, revision: 1, role: { ...definition, responsibilities: 'Updated role responsibilities' } })
    assert.throws(() => resolveCollaborationReferences(value.db, value.project, { role_id: role.id, role_revision: 1 }), { code: 'context_stale' })
    const selection = { agent_id: 'pi', adapter: 'rule-only', execution_mode: 'structured', executable: '/rule/pi', version: '1.0.1', model: 'stepfun/step-3.5-flash', provider: 'stepfun', external_target: 'pi', settings_source: { kind: 'native' }, settings_revision: 1, configuration_version: 'rule-only', native_launch: { schema: 'swa.native-launch.v1', account: { kind: 'pi-native-api-key-per-session', provider: 'stepfun', source_home: '/rule/source', auth_source: { path: '/rule/source/auth.json', version: 'rule-only' }, models_source: null, private_root: '/rule/private', model_target: { model_id: 'step-3.5-flash', api: 'openai-completions', base_url: 'https://api.stepfun.com/v1' } }, tools: { mode: 'collaboration', native_contract: 'pi-cli-1.0.1', extension: { path: '/rule/runtime/pi-collaboration-extension.mjs', version: 'rule-only' }, allowed: ['swa_delegate'] } } }
    const call = { requestId, sessionId, row: { request_id: randomUUID() }, scope: value.scope, dispatch: value.dispatch, selection, origin, params, invocation: { caller, project } }
    const counts = () => [value.db.db.prepare('SELECT count(*) count FROM tasks').get().count, value.db.db.prepare('SELECT count(*) count FROM dispatch_contexts').get().count]
    const before = counts(), observed = storedDelegationObservation(value.runtime, call)
    assert.equal(observed.command.action, 'request.show')
    assert.equal(observed.command.request_id, requestId)
    assert.equal(observed.command.project_id, undefined)
    assert.equal(observed.command.controller, value.scope.controller)
    assert.equal(observed.native_delegation.observation_only, true)
    assert.equal(observed.input, undefined)
    assert.deepEqual(observed.selection, selection)
    const show = ORCHESTRATION_MUTATION_REQUEST_METHODS.find(method => method.name === 'orchestration.requestShow')
    const { mutation, ...original } = show.handler({ request: requestId }, { runtime: value.runtime, authenticatedCallerFingerprint: value.scope.authority_domain }).receipt
    assert.equal(mutation.requestId, requestId)
    assert.deepEqual(original, saved)
    assert.deepEqual(counts(), before)
    assert.equal(value.db.getMutationReceipt(value.scope.authority_domain, workerRequest), undefined)
    assert.throws(() => storedDelegationObservation(value.runtime, { ...call, params: { ...params, revision: 2 } }), { code: 'scope_denied' })
  } finally { value.db.close() }
})

test('rolled-back settlement can observe a new turn under the same request while unknown effects stay reserved', async () => {
  const { RunSettlementWaiting } = createRequire(bundle)(bundle)
  const value = storage('settlement-reobserve'), executor = getOrchestrationMutationExecutor(value.runtime)
  const requestID = `${value.task.id}/native-lifecycle/execution`
  const request = { id: requestID, authToken: '', method: 'swa.runSettle', orchestrationRequestId: requestID }
  try {
    // 实际 SQLite 事务与原 executor；输入只表示观察已变化，不构造模型完成事件。
    await assert.rejects(executor.run(request, { turn: 'previous-observation' }, () => {
      value.db.db.exec('BEGIN IMMEDIATE')
      try { throw new RunSettlementWaiting('The Run changed before its execution settlement') }
      catch (error) { value.db.db.exec('ROLLBACK'); throw error }
    }, value.scope.authority_domain), RunSettlementWaiting)
    assert.equal(value.db.getMutationReceipt(value.scope.authority_domain, requestID), undefined)
    await executor.run(request, { turn: 'current-observation' }, mutation => {
      value.db.db.exec('BEGIN IMMEDIATE')
      const result = { phase: 'storage-check-completed' }
      mutation.recordReceipt(result)
      value.db.db.exec('COMMIT')
      return result
    }, value.scope.authority_domain)
    assert.equal(value.db.getMutationReceipt(value.scope.authority_domain, requestID).state, 'completed')
    await executor.run(request, { turn: 'current-observation' }, () => assert.fail('Completed settlement must not run twice'), value.scope.authority_domain)
    const unknownID = randomUUID(), unknownRequest = { ...request, id: unknownID, orchestrationRequestId: unknownID }
    await assert.rejects(executor.run(unknownRequest, {}, () => { throw new OrchestrationError('operation_unknown', 'An actual effect is not confirmed') }, value.scope.authority_domain), { code: 'operation_unknown' })
    assert.equal(value.db.getMutationReceipt(value.scope.authority_domain, unknownID).state, 'pending')
    await assert.rejects(executor.run(unknownRequest, {}, () => assert.fail('Unknown effects must not run twice'), value.scope.authority_domain), { code: 'operation_unknown' })
  } finally { value.db.close() }
})

test('parent continuation keeps its original authority without copying first-submission or question fields', () => {
  const { handoffResumeInvocation } = createRequire(bundle)(bundle)
  // 仅构造跨入口的字段投影；Go 的真实 SQLite 准入另行检查来源、撤销与原 Run 关联。
  const original = { caller: { id: 'original-human', kind: 'human', project_id: 'project', settings_revision: 3 }, project: { id: 'project', root: directory },
    context: { id: 'original-context', project_id: 'project', settings_revision: 3, files: [] },
    submission: { operation: 'first-start-only' }, question_ask: { operation: 'original-question-only' }, handoff: { operation: 'previous-handoff-only' } }
  const scope = { project_id: 'project', controller: 'controller', run_id: 'run', root_task_id: 'root', authority_domain: 'original-authority', context: original.context }
  const mail = { id: 'child/completed', body: '子任务的已记录结果', handoff: { schema: 'swa.handoff-completion.v1', source_task_id: 'child', source_dispatch_id: 'child-dispatch', parent_task_id: 'lead', parent_dispatch_id: 'lead-dispatch', reply: 'resume', outcome: 'success', acceptance: 'unreviewed', resume_request_id: randomUUID() } }
  const value = handoffResumeInvocation(original, scope, mail)
  assert.equal(Object.hasOwn(value, 'submission'), false)
  assert.equal(Object.hasOwn(value, 'question_ask'), false)
  assert.deepEqual(value.caller, original.caller)
  assert.deepEqual(value.project, original.project)
  assert.deepEqual(value.context, original.context)
  assert.deepEqual(value.scope, scope)
  assert.equal(value.command.action, 'worker.send')
  assert.equal(value.command.dispatch_id, 'lead-dispatch')
  assert.equal(value.command.request_id, mail.handoff.resume_request_id)
  assert.equal(value.input.path, 'native-handoff:child/completed'); assert.equal(value.input.version, mail.id)
  assert.deepEqual(JSON.parse(value.input.text.split('\n')[1]), { source_task_id: 'child', source_dispatch_id: 'child-dispatch', outcome: 'success', acceptance: 'unreviewed' })
  assert.ok(value.input.text.endsWith('\n' + mail.body))
  assert.equal(value.handoff.source_dispatch_id, 'child-dispatch')
})

test('handoff delivers the recorded outcome with empty or partial child output and rejects changed execution metadata', () => {
  const { handoffResumeInvocation, validateHandoffInput, hashCanonical } = createRequire(bundle)(bundle)
  for (const [name, outcome, body, continuation] of [
    ['empty-cancellation', 'cancellation', ''],
    ['partial-cancellation', 'cancellation', '已读取模块\n尚未完成检查。'],
    ['failed-child', 'error', '真实错误的部分说明'],
    ['successful-child', 'success', '完成实现与检查。'],
    ['interrupted-parent', 'success', '', 'parent_interrupted']
  ]) {
    // 构造真实 SQLite 规则输入；不冒充模型、原生工具、实际取消或会话恢复证据。
    const value = storage(`handoff-${name}`), { db, runtime, scope } = value
    try {
      const parent = db.createTask({ runId: scope.run_id, parentId: scope.root_task_id, spec: 'Rule parent' })
      const child = db.createTask({ runId: scope.run_id, parentId: parent.id, spec: 'Rule child' })
      const dispatch = (task, handle) => db.createDispatchContext({ taskId: task.id, assigneeHandle: handle, creator: { kind: 'system' }, maxDepth: 4 })
      const a = dispatch(parent, 'rule-parent'), b = dispatch(child, 'rule-child'), session = randomUUID(), start = randomUUID()
      const original = { caller: { id: 'rule-human', kind: 'human', project_id: value.project, settings_revision: 1 }, project: { id: value.project, root: directory }, scope,
        command: { action: 'worker.start', controller: scope.controller, request_id: start } }
      const terminal = outcome === 'success' && !continuation ? 'completed' : 'failed'
      db.db.prepare('UPDATE tasks SET status=?,result=? WHERE id=?').run(terminal, body, child.id)
      db.db.prepare('UPDATE dispatch_contexts SET status=?,assignee_orca_session_id=? WHERE id=?').run(terminal, session, b.id)
      const binding = { parent_request: start, child_request: `${start}/native`, dispatch_id: b.id, agent: 'pi', execution_mode: 'structured', session_id: session, operation_id: 'rule-input', runtime_fence: 2, consumer_generation: db.getRun(scope.run_id).consumer_generation, body: {} }
      const save = (requestId, method, receipt) => {
        const identity = { callerFingerprint: scope.authority_domain, requestId, method, payloadHash: hashCanonical(receipt) }
        db.beginMutationReceipt(identity); db.completeMutationReceipt({ ...identity, receipt: JSON.stringify(receipt) })
      }
      save(start, 'swa.controllerDeliver', { action: 'worker.start', run_id: scope.run_id, native: { dispatchId: b.id }, invocation: original, child_request: binding.child_request, swa_input_binding: binding })
      const handoff = { schema: 'swa.handoff-completion.v1', source_task_id: child.id, source_dispatch_id: b.id, parent_task_id: parent.id, parent_dispatch_id: a.id, reply: 'resume', outcome: continuation ?? outcome, acceptance: 'unreviewed', resume_request_id: randomUUID() }
      const message = db.insertMessage({ id: `${child.id}/completed`, runId: scope.run_id, from: `dispatch:${b.id}`, to: `dispatch:${a.id}`, type: 'handoff', deliveryContract: 'audit_only', subject: 'Rule completion', body, payload: JSON.stringify(handoff) })
      const executionID = `${scope.root_task_id}/native-lifecycle/${child.id}/execution`
      save(executionID, 'swa.runSettle', { phase: 'execution_completed', acceptance: 'unreviewed', project_id: value.project, run_id: scope.run_id, root_task_id: scope.root_task_id, task_id: child.id, mail_id: message.id, result: body,
        turn: { task_id: child.id, dispatch_id: b.id, outcome }, ...(continuation ? { continuation } : {}) })
      const call = () => handoffResumeInvocation(original, scope, { id: message.id, body: db.getMessageById(message.id).body, handoff: JSON.parse(db.getMessageById(message.id).payload) })
      const observed = call()
      assert.doesNotThrow(() => validateHandoffInput(runtime, observed))
      assert.deepEqual(JSON.parse(observed.input.text.split('\n')[1]), { source_task_id: child.id, source_dispatch_id: b.id, outcome: continuation ?? outcome, acceptance: 'unreviewed' })
      assert.ok(observed.input.text.endsWith('Child result (verbatim; may be empty):\n' + body))
      assert.equal(db.getTask(child.id).result, body); assert.equal(db.getMessageById(message.id).body, body)
      assert.equal(JSON.parse(db.getMutationReceipt(scope.authority_domain, executionID).receipt).result, body)
      const originalReceipt = db.getMutationReceipt(scope.authority_domain, executionID)
      for (const [sql, id] of [
        ["UPDATE messages SET payload=json_set(payload,'$.outcome','made-up-success') WHERE id=?", message.id],
        ["UPDATE messages SET payload=json_set(payload,'$.acceptance','accepted') WHERE id=?", message.id],
        ["UPDATE mutation_receipts SET receipt=json_set(receipt,'$.acceptance','accepted') WHERE request_id=?", executionID],
        ["UPDATE mutation_receipts SET receipt=json_set(receipt,'$.turn.task_id','another-task') WHERE request_id=?", executionID],
        ["UPDATE mutation_receipts SET receipt=json_set(receipt,'$.turn.dispatch_id','another-dispatch') WHERE request_id=?", executionID],
        ["UPDATE mutation_receipts SET receipt=json_set(receipt,'$.continuation','made-up-continuation') WHERE request_id=?", executionID]
      ]) {
        db.db.exec('BEGIN')
        try { db.db.prepare(sql).run(id); assert.throws(() => validateHandoffInput(runtime, call())) }
        finally { db.db.exec('ROLLBACK') }
      }
      if (!continuation) {
        db.db.exec('BEGIN')
        try { db.db.prepare("UPDATE mutation_receipts SET receipt=json_set(receipt,'$.turn.outcome','different-outcome') WHERE request_id=?").run(executionID); assert.throws(() => validateHandoffInput(runtime, observed), /outcome differs/) }
        finally { db.db.exec('ROLLBACK') }
      }
      const changed = structuredClone(observed); changed.input.text += '\nforged outcome'
      assert.throws(() => validateHandoffInput(runtime, changed), /differs from its original child result/)
      assert.deepEqual(db.getMutationReceipt(scope.authority_domain, executionID), originalReceipt)
      assert.equal(db.getMutationReceipt(scope.authority_domain, handoff.resume_request_id), undefined, 'Rule validation must not deliver or create a resume receipt')
    } finally { db.close() }
  }
})

test('native ask without a real Worker is rejected before creation and the original executor query stays absent', async () => {
  const value = storage('no-worker'), executor = getOrchestrationMutationExecutor(value.runtime), requestID = randomUUID()
  try {
    const method = questionAskMethod(async () => assert.fail('A missing real Worker must fail before external admission'))
    const params = method.params.parse({ question: 'Which public acceptance requirement applies?' })
    await assert.rejects(executor.run({ id: requestID, authToken: '', method: 'orchestration.ask', orchestrationRequestId: requestID }, params,
      mutation => method.handler(params, { runtime: value.runtime, authenticatedCallerFingerprint: value.scope.authority_domain, orchestrationMutation: mutation.identity, recordMutationReceipt: mutation.recordReceipt, markMutationEffectPossible: mutation.markEffectPossible }), value.scope.authority_domain), { code: 'scope_denied' })
    await assert.rejects(admitQuestionProducer({ id: requestID, authToken: '', method: 'orchestration.ask', orchestrationRequestId: requestID }, params, { runtime: value.runtime }), { code: 'scope_denied' })
    const show = ORCHESTRATION_MUTATION_REQUEST_METHODS.find(method => method.name === 'orchestration.requestShow')
    const actual = show.handler(show.params.parse({ request: requestID }), { runtime: value.runtime, authenticatedCallerFingerprint: value.scope.authority_domain })
    assert.equal(actual.state, 'absent')
    assert.equal(value.db.db.prepare('SELECT COUNT(*) count FROM question_threads').get().count, 0)
  } finally { value.db.close() }
})

test('real SQLite answers alone never claim native reading or unlock question resume and delivery', () => {
  const value = storage('stored-answer')
  try {
    // 原生产数据库接口可验证存储语义；没有创建 Worker 或伪造模型提问证据。
    const created = value.db.createQuestion({ runId: value.run.id, dispatchId: value.dispatch.id, askerHandle: 'question-storage-only', question: 'Which public acceptance requirement applies?' })
    const questionID = created.question.message_id
    assert.equal(observeRunQuestions(value.runtime, value.scope)[0].read_state, 'pending')
    assert.equal(hasQuestionSettlementBlock(value.runtime, value.scope), true)
    const answered = value.db.answerQuestion({ runId: value.run.id, messageId: questionID, consumerGeneration: value.run.consumer_generation, body: 'Use the original published acceptance requirement.' })
    const observation = observeRunQuestions(value.runtime, value.scope)[0]
    assert.equal(observation.read_state, 'read_unconfirmed')
    assert.equal(observation.continuation_required, false)
    assert.equal(observation.blocks_settlement, true)
    const view = readRunView(value.db, value.scope, { executor: getOrchestrationMutationExecutor(value.runtime), runtimeEpoch: value.runtime.getRuntimeId(), questions: () => observeRunQuestions(value.runtime, value.scope) })
    assert.equal(view.status, 'waiting_input')
    assert.equal(view.complete, false)
    assert.equal(view.answered_questions[0].answer_message_id, answered.message.id)
    assert.equal(view.answered_questions[0].read_state, 'read_unconfirmed')
    const requestID = randomUUID(), command = commandSchema.parse({ action: 'question.resume', project_id: value.project, controller: value.scope.controller, run_id: value.run.id, task_id: value.task.id, dispatch_id: value.dispatch.id, question_id: questionID, request_id: requestID })
    assert.throws(() => assertQuestionResume(value.runtime, { command, scope: value.scope, project: { id: value.project, root }, caller: { id: 'question-storage-only', kind: 'human', project_id: value.project, settings_revision: 1 }, input: { path: `native-question-resume:${questionID}`, version: requestID, text: questionResumeBody(questionID) } }), { code: 'question_not_resumable' })
    assert.equal(value.db.getQuestion(questionID).answer_message_id, answered.message.id)
  } finally { value.db.close() }
})

test('public mode and question input rules retain exact text and forbid arbitrary resume input', () => {
  const text = '  按公开验收条件继续吗？\n'
  assert.equal(questionToolParamsSchema.parse({ question: text }).question, text)
  assert.throws(() => questionToolParamsSchema.parse({ question: text, resume: randomUUID() }))
  assert.throws(() => questionToolParamsSchema.parse({ question: '界'.repeat(10667) }))
  assert.throws(() => commandSchema.parse({ action: 'worker.send', question_mode: 'native' }))
  const command = { action: 'question.resume', controller: 'question-storage-only', run_id: randomUUID(), task_id: randomUUID(), dispatch_id: randomUUID(), question_id: randomUUID(), request_id: randomUUID() }
  assert.equal(commandSchema.parse(command).action, 'question.resume')
  for (const input of [{ text }, { input_file: 'custom-input' }, { question_mode: 'native' }]) assert.throws(() => commandSchema.parse({ ...command, ...input }))
  const role = { name: 'Reviewer', responsibilities: 'Ask about published requirements', default_agent: 'pi', default_model: 'configured', question_mode: 'native', skills: [], knowledge: [] }
  assert.equal(roleDefinitionSchema.parse(role).question_mode, 'native')
  assert.equal(roleDefinitionSchema.parse({ ...role, question_mode: undefined }).question_mode, undefined)
})

test('original SQLite Task settlement isolates another Task question and defers only its exact affected Dispatch group', async () => {
  const value = storage('task-question-group'), executor = getOrchestrationMutationExecutor(value.runtime)
  try {
    const current = value.db.createTask({ runId: value.run.id, parentId: value.task.id, spec: 'Check the first published requirement' })
    const currentDispatch = value.db.createDispatchContext({ taskId: current.id, assigneeHandle: 'current-question-storage', creator: { kind: 'system' }, maxDepth: 4 })
    const other = value.db.createTask({ runId: value.run.id, parentId: value.task.id, spec: 'Check the other published requirement' })
    const otherDispatch = value.db.createDispatchContext({ taskId: other.id, assigneeHandle: 'other-question-storage', creator: { kind: 'system' }, maxDepth: 4 })
    const question = value.db.createQuestion({ runId: value.run.id, dispatchId: otherDispatch.id, askerHandle: 'other-question-storage', question: 'Which published requirement applies to this Task?' })
    assert.equal(hasTaskQuestionSettlementBlock(value.runtime, value.scope, current.id, currentDispatch.id), false)
    assert.equal(hasTaskQuestionSettlementBlock(value.runtime, value.scope, other.id, otherDispatch.id), true)
    assert.equal(hasQuestionSettlementBlock(value.runtime, value.scope), true)
    value.db.answerQuestion({ runId: value.run.id, messageId: question.question.message_id, consumerGeneration: value.run.consumer_generation, body: 'Use the original requirement.' })
    assert.equal(hasTaskQuestionSettlementBlock(value.runtime, value.scope, current.id, currentDispatch.id), false)
    assert.equal(hasTaskQuestionSettlementBlock(value.runtime, value.scope, other.id, otherDispatch.id), true)
    assert.throws(() => value.db.createDispatchContext({ taskId: current.id, assigneeHandle: 'sibling-question-storage', creator: { kind: 'system' }, maxDepth: 4 }), { code: 'task_not_startable' })
    value.db.createQuestion({ runId: value.run.id, dispatchId: currentDispatch.id, askerHandle: 'current-question-storage', question: 'Which condition completes this Task?' })
    assert.equal(hasTaskQuestionSettlementBlock(value.runtime, value.scope, current.id, currentDispatch.id), true)
    const requestID = randomUUID()
    // 真实 reservation 只调用无效果等待门；不生成 Worker 完成或模型回执。
    await assert.rejects(executor.run({ id: requestID, authToken: '', method: 'swa.runSettle', orchestrationRequestId: requestID }, { scope: value.scope }, () => assertTaskQuestionSettlementReady(value.runtime, value.scope, current.id, currentDispatch.id), value.scope.authority_domain), error => !(error instanceof OrchestrationError) && error.message === 'The original Task is waiting for its native question')
    const show = ORCHESTRATION_MUTATION_REQUEST_METHODS.find(method => method.name === 'orchestration.requestShow')
    assert.equal(show.handler(show.params.parse({ request: requestID }), { runtime: value.runtime, authenticatedCallerFingerprint: value.scope.authority_domain }).state, 'absent')
    const view = readRunView(value.db, value.scope, { executor, runtimeEpoch: value.runtime.getRuntimeId(), questions: () => observeRunQuestions(value.runtime, value.scope) })
    assert.equal(view.status, 'waiting_input')
    assert.equal(value.db.db.prepare("SELECT COUNT(*) count FROM messages WHERE type='escalation'").get().count, 0)
  } finally { value.db.close() }
})

test('handoff waits for a busy parent and permits failed or cancelled parents to settle without a resume', () => {
  const { handoffParentDisposition } = createRequire(bundle)(bundle)
  // 构造终态只验证结算规则；不作为模型、工具调用或停止的执行证据。
  assert.equal(handoffParentDisposition(null, 'ready'), 'waiting')
  assert.equal(handoffParentDisposition({ outcome: 'success' }, 'ready'), 'resume')
  for (const outcome of ['error', 'aborted']) assert.equal(handoffParentDisposition({ outcome }, 'ready'), 'failed')
  assert.equal(handoffParentDisposition({ outcome: 'success' }, 'stopped'), 'failed')
  assert.equal(handoffParentDisposition({ outcome: 'success' }, 'starting'), 'waiting')
})

test('the original pending ask checkpoint remains visible in its Run and cannot reuse its request with different parameters', async () => {
  const value = storage('pending-scope'), executor = getOrchestrationMutationExecutor(value.runtime), requestID = randomUUID()
  try {
    const request = { id: requestID, authToken: '', method: 'orchestration.ask', orchestrationRequestId: requestID }, params = { question: 'Check the published requirement' }
    // 只验证原 executor 的真实未完成 reservation 与 scope 库存，不冒充原生工具来源。
    await assert.rejects(executor.run(request, params, mutation => {
      value.db.checkpointPendingMutationReceipt({ ...mutation.identity, receipt: JSON.stringify({ run_id: value.run.id, root_task_id: value.task.id, project_id: value.project, dispatch_id: value.dispatch.id, stage: 'local_scope_storage_check' }) })
      throw new OrchestrationError('operation_unknown', 'Keep the original reservation for inspection')
    }, value.scope.authority_domain), { code: 'operation_unknown' })
    const show = ORCHESTRATION_MUTATION_REQUEST_METHODS.find(method => method.name === 'orchestration.requestShow')
    const observed = show.handler(show.params.parse({ request: requestID }), { runtime: value.runtime, authenticatedCallerFingerprint: value.scope.authority_domain })
    assert.equal(observed.state, 'pending')
    assert.equal(hasQuestionSettlementBlock(value.runtime, value.scope, value.dispatch.id), true)
    const view = readRunView(value.db, value.scope, { executor, runtimeEpoch: value.runtime.getRuntimeId(), questions: () => observeRunQuestions(value.runtime, value.scope) })
    assert.equal(view.status, 'unknown')
    assert.ok(JSON.stringify(view.blockers).includes(requestID))
    await assert.rejects(executor.run(request, { question: 'Change the original request' }, () => assert.fail('Changed original input cannot execute'), value.scope.authority_domain), { code: 'request_mismatch' })
  } finally { value.db.close() }
})
