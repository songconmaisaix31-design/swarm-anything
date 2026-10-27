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
    "export { assertTaskQuestionSettlementReady, RunSettlementWaiting, handoffResumeInvocation, handoffParentDisposition } from './runtime/swa-orca/src/run-settlement';",
    "export { assertDelegationParentStopOpen } from './runtime/swa-orca/src/delegation';",
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
  const mail = { id: 'child/completed', body: '子任务的已记录结果', handoff: { schema: 'swa.handoff-completion.v1', source_task_id: 'child', source_dispatch_id: 'child-dispatch', parent_task_id: 'lead', parent_dispatch_id: 'lead-dispatch', reply: 'resume', outcome: 'success', resume_request_id: randomUUID() } }
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
  assert.deepEqual(value.input, { path: 'native-handoff:child/completed', version: mail.id, text: mail.body })
  assert.equal(value.handoff.source_dispatch_id, 'child-dispatch')
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
