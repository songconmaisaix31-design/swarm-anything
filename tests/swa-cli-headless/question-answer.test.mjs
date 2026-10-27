import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { build, stop } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/question-answer'), { recursive: true })
const directory = await mkdtemp(join(root, '.verification/question-answer/case-'))
const bundle = join(directory, 'question-answer.cjs')
const dependencies = await realpath(join(root, 'runtime/swa-orca/node_modules'))
await symlink(dependencies, join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
assert.equal(await realpath(join(directory, 'node_modules')), dependencies)
try {
  await build({ stdin: { contents: [
    "export { OrchestrationDb } from './third_party/orca-v1.4.230/src/main/runtime/orchestration/db';",
    "export { OrcaRuntimeService } from './third_party/orca-v1.4.230/src/main/runtime/orca-runtime';",
    "export { getOrchestrationMutationExecutor } from './third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-executor';",
    "export { ORCHESTRATION_MUTATION_REQUEST_METHODS } from './third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/runs/mutation-request-show';",
    "export { ReplyParams } from './third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/schemas';",
    "export { commandSchema } from './runtime/swa-orca/src/contracts';",
    "export { createDeliveryAdmission } from './runtime/swa-orca/src/delivery-admission';",
    "export * from './runtime/swa-orca/src/question-answer';",
    "export { readRunView } from './runtime/swa-orca/src/run-view';",
    "export { recoverSwaRequest } from './web/src/pages/swarm/swaObservation';",
    "export { readSwaRun } from './web/src/pages/swarm/swaRunView';"
  ].join('\n'), resolveDir: root }, platform: 'node', target: 'node24', format: 'cjs', bundle: true, outfile: bundle, conditions: ['orca-source'],
    external: ['electron', 'node-pty', '@parcel/watcher', 'fsevents', '@orca/windows-security', '@orca/windows-registry', '@vscode/windows-process-tree', '@anthropic-ai/claude-agent-sdk'],
    banner: { js: 'var __swaModuleUrl = require("node:url").pathToFileURL(__filename).href;' }, define: { 'import.meta.url': '__swaModuleUrl', 'process.env.NODE_ENV': '"production"' }, logOverride: { 'empty-import-meta': 'error' },
    plugins: [{ name: 'original-native-externals', setup(builder) { builder.onResolve({ filter: /\.node$/ }, args => ({ path: args.path, external: true })) } },
      { name: 'original-jsonc-esm', setup(builder) { builder.onResolve({ filter: /^jsonc-parser$/ }, () => ({ path: join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') })) } }],
    nodePaths: [join(root, 'runtime/swa-orca/node_modules'), join(root, 'web/node_modules'), join(root, 'node_modules')], logLevel: 'error' })
} finally { stop() }
const { OrchestrationDb, OrcaRuntimeService, getOrchestrationMutationExecutor, ORCHESTRATION_MUTATION_REQUEST_METHODS, ReplyParams, commandSchema, createDeliveryAdmission, questionReplyMethod, questionReplyParams, readAnswerQuestion, readRunView, recoverSwaRequest, readSwaRun } = createRequire(bundle)(bundle)

function storage(name) {
  const db = new OrchestrationDb(join(directory, `${name}.sqlite`)), runtime = new OrcaRuntimeService()
  runtime.setOrchestrationDb(db)
  const project = randomUUID(), run = db.createRun({ objective: 'Observe original public question records', coordinatorHandle: null, coordinatorPaneKey: null })
  const rootTask = db.createTask({ runId: run.id, spec: JSON.stringify({ project_id: project, spec: { max_workers: 4 } }) })
  const task = db.createTask({ runId: run.id, parentId: rootTask.id, taskTitle: 'Public question storage', spec: 'Check the public requirements' })
  const dispatch = db.createDispatchContext({ taskId: task.id, assigneeHandle: 'local-question-storage', creator: { kind: 'system' }, maxDepth: 4 })
  const created = db.createQuestion({ runId: run.id, dispatchId: dispatch.id, askerHandle: 'local-question-storage', question: '按哪个公开要求继续？' })
  // 仅生产数据库和纯准入边界；此选择器不宣称存在 helper、进程或模型会话。
  const scope = { project_id: project, controller: 'local-question-storage', run_id: run.id, root_task_id: rootTask.id, authority_domain: db.getOrCreateLocalMutationCallerFingerprint(), context: {} }
  const command = { action: 'question.answer', controller: scope.controller, run_id: run.id, task_id: rootTask.id, dispatch_id: dispatch.id, question_id: created.question.message_id, request_id: randomUUID(), text: '  按原公开要求继续。\n保留正文与换行。 \n' }
  const invocation = { command, project: { id: project, root }, scope, caller: { id: 'local-question-storage', kind: 'human', project_id: project, settings_revision: 1 } }
  return { db, runtime, project, run, rootTask, task, dispatch, created, scope, invocation }
}

test('Go UTF-8 answer survives the public schema and original reply params into the actual SQLite thread', async () => {
  const source = join(directory, 'go-command.json')
  execFileSync('go', ['test', './internal/workspace/app', '-run', '^TestOrcaQuestionAnswerWireSource$', '-count=1'], { cwd: root, env: { ...process.env, SWA_QUESTION_WIRE_OUTPUT: source }, timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] })
  const wire = JSON.parse(await readFile(source, 'utf8')), value = storage('answer-lifecycle')
  try {
    const command = commandSchema.parse({ ...value.invocation.command, text: wire.text })
    const params = ReplyParams.parse(questionReplyParams({ ...value.invocation, command }))
    assert.equal(params.body, wire.text)
    const pending = readAnswerQuestion(value.db, value.scope, command, params.body)
    assert.equal(pending.question.status, 'pending')
    const before = value.db.getMessageById(value.created.message.id)
    const answered = value.db.answerQuestion({ runId: value.run.id, messageId: params.id, consumerGeneration: value.run.consumer_generation, body: params.body })
    assert.equal(answered.message.body, wire.text)
    assert.equal(value.db.getMessageById(answered.message.id).read, 1)
    assert.deepEqual(value.db.getMessageById(value.created.message.id), before)
    const duplicate = value.db.answerQuestion({ runId: value.run.id, messageId: params.id, consumerGeneration: value.run.consumer_generation, body: params.body })
    assert.equal(duplicate.duplicate, true)
    assert.equal(duplicate.message.id, answered.message.id)
    assert.equal(value.db.db.prepare('SELECT COUNT(*) count FROM messages WHERE thread_id=? AND type<>?').get(params.id, 'question').count, 1)
    assert.throws(() => value.db.answerQuestion({ runId: value.run.id, messageId: params.id, consumerGeneration: value.run.consumer_generation, body: 'Different answer' }), { code: 'answer_conflict' })
    assert.throws(() => value.db.answerQuestion({ runId: value.run.id, messageId: params.id, consumerGeneration: value.run.consumer_generation + 1, body: params.body }), { code: 'consumer_fenced' })
    assert.throws(() => readAnswerQuestion(value.db, value.scope, { ...command, run_id: randomUUID() }, params.body), { code: 'scope_denied' })
    const view = readRunView(value.db, value.scope)
    assert.equal(view.questions.length, 0)
    assert.equal(view.answered_questions.length, 1)
    assert.equal(view.answered_questions[0].answer_message_id, answered.message.id)
    const selected = { controller: value.scope.controller, runID: value.run.id, taskID: value.rootTask.id }
    const actual = readSwaRun({ ok: true, controller: selected.controller, run_id: selected.runID, task_id: selected.taskID, result: { scope: value.scope, native: { run_view: view } } }, value.project, selected)
    assert.equal(actual.answeredQuestions[0].answer, wire.text)
    const closed = value.db.createQuestion({ runId: value.run.id, dispatchId: value.dispatch.id, askerHandle: 'local-question-storage', question: 'Second public question' })
    value.db.closeQuestionsForDispatch(value.dispatch.id)
    assert.throws(() => value.db.answerQuestion({ runId: value.run.id, messageId: closed.message.id, consumerGeneration: value.run.consumer_generation, body: params.body }), { code: 'dispatch_inactive' })
    assert.equal(commandSchema.parse({ action: 'conversation.append', text: wire.text }).text, wire.text.trim())
    assert.throws(() => commandSchema.parse({ ...command, text: '界'.repeat(10667) }))
    assert.throws(() => commandSchema.parse({ ...command, input_file: 'another-source' }))
  } finally { value.db.close() }
})

test('closed owner rejects before effects and the real durable request query releases only that exact rejected answer', async () => {
  const value = storage('no-effect-recovery'), executor = getOrchestrationMutationExecutor(value.runtime)
  const requestID = value.invocation.command.request_id, childID = `${requestID}/native`, fingerprint = value.scope.authority_domain
  const priorPort = process.env.ASTROCYTE_PORT
  process.env.ASTROCYTE_PORT = '1'
  try {
    // 原 factory 的 ownerAlive=false 在 fetch 之前拒绝；没有启动 HTTP 或伪造服务返回。
    const method = questionReplyMethod(createDeliveryAdmission(randomBytes(32), () => false))
    const params = questionReplyParams(value.invocation)
    const parentParams = { invocation: value.invocation }
    const parent = { id: requestID, authToken: '', method: 'swa.controllerDeliver', orchestrationRequestId: requestID }
    const receipt = { ...value.scope, action: 'question.answer', child_request: childID, invocation: value.invocation }
    const result = await executor.run(parent, parentParams, async mutation => {
      value.db.checkpointPendingMutationReceipt({ ...mutation.identity, receipt: JSON.stringify(receipt) })
      const native = await executor.run({ id: childID, authToken: '', method: 'orchestration.reply', orchestrationRequestId: childID }, params, child => method.handler(method.params.parse(params), { runtime: value.runtime, authenticatedCallerFingerprint: fingerprint, orchestrationMutation: child.identity, recordMutationReceipt: child.recordReceipt, markMutationEffectPossible: child.markEffectPossible }), fingerprint)
      return { ...receipt, native, state: native.state, effects_applied: native.effects_applied, error: native.error }
    }, fingerprint)
    assert.equal(result.native.state, 'rejected')
    assert.equal(result.native.effects_applied, false)
    assert.equal(value.db.getQuestion(value.created.question.message_id).status, 'pending')
    const show = ORCHESTRATION_MUTATION_REQUEST_METHODS.find(method => method.name === 'orchestration.requestShow')
    const query = id => show.handler(show.params.parse({ request: id }), { runtime: value.runtime, authenticatedCallerFingerprint: fingerprint })
    const actual = query(requestID), child = query(childID)
    assert.equal(actual.state, 'completed')
    assert.equal(child.state, 'completed')
    const pending = { requestID, action: 'question.answer', controller: value.scope.controller, runID: value.run.id, taskID: value.rootTask.id, dispatchID: value.dispatch.id, questionID: value.created.question.message_id }
    const inspected = { ok: true, result: { ...actual, children: [child] } }
    const recovered = recoverSwaRequest(inspected, value.project, pending)
    assert.equal(recovered.ok, false)
    assert.equal(recovered.error.code, 'operation_unknown')
    assert.equal(recovered.result.invocation.command.text, value.invocation.command.text)
    assert.equal(value.db.db.prepare('SELECT COUNT(*) count FROM messages WHERE thread_id=? AND type<>?').get(pending.questionID, 'question').count, 0)
    await assert.rejects(executor.run(parent, { invocation: { ...value.invocation, command: { ...value.invocation.command, text: 'Changed answer with old ID' } } }, () => assert.fail('A changed old request cannot execute'), fingerprint), { code: 'request_mismatch' })
    for (const field of ['runID', 'questionID', 'dispatchID']) assert.throws(() => recoverSwaRequest(inspected, value.project, { ...pending, [field]: randomUUID() }))
    // 下列仅为恢复器的损坏/未知参数输入，不是 HTTP 或原生执行证据。
    for (const state of ['pending', 'absent']) assert.equal(recoverSwaRequest({ ok: true, result: { requestId: requestID, state } }, value.project, pending), null)
    const incomplete = structuredClone(inspected)
    incomplete.result.children[0].state = 'pending'
    assert.equal(recoverSwaRequest(incomplete, value.project, pending), null)
    const noProof = structuredClone(inspected)
    delete noProof.result.receipt.native.effects_applied
    assert.equal(recoverSwaRequest(noProof, value.project, pending), null)
  } finally {
    if (priorPort === undefined) delete process.env.ASTROCYTE_PORT
    else process.env.ASTROCYTE_PORT = priorPort
    value.db.close()
  }
})
