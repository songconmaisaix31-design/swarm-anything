import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, realpath, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

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
    "export { assertTaskQuestionSettlementReady } from './runtime/swa-orca/src/run-settlement';",
    "export { inspectStructuredTrace } from './runtime/swa-orca/src/task-result';",
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
