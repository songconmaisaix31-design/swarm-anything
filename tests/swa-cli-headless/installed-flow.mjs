import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { createInterface } from 'node:readline'
import { setTimeout } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { readJSONL } from './read-jsonl.mjs'

const { values } = parseArgs({ options: { candidate: { type: 'string' }, 'data-root': { type: 'string' }, project: { type: 'string' }, 'project-id': { type: 'string' }, endpoint: { type: 'string' }, output: { type: 'string' }, 'orca-observation': { type: 'string' }, agent: { type: 'string' }, model: { type: 'string' } }, allowPositionals: false })
for (const key of ['candidate', 'data-root', 'project', 'output', 'orca-observation']) if (!values[key] || !isAbsolute(values[key])) throw new Error(`Explicit absolute ${key} is required`)
if (!values['project-id'] || !values.endpoint || !process.env.SWA_PROJECT_TOKEN) throw new Error('The actual current project ID, endpoint and human-issued project token are required')
if (!values.agent || !values.model) throw new Error('An explicit approved native Agent and model are required')
const candidate = await realpath(values.candidate), dataRoot = await realpath(values['data-root']), project = await realpath(values.project)
const node = join(candidate, 'node', 'node.exe'), swa = join(candidate, 'swa.exe')
assert.equal((await realpath(process.execPath)).toLowerCase(), node.toLowerCase())
const revision = (await readFile(join(candidate, 'VERSION'), 'utf8')).trim()
assert.equal(execFileSync(swa, ['--version'], { encoding: 'utf8', windowsHide: true }).trim(), revision)
const evidence = dirname(values.output), inputDirectory = join(project, '.verification', 'swa-cli-input')
const source = JSON.parse(await readFile(join(inputDirectory, 'source.json'), 'utf8'))
assert.equal(source.revision, 'da3bdddb085808863090a05f60cc1c64415039cf')
assert.equal((await realpath(source.project_root)).toLowerCase(), project.toLowerCase())
const environment = { ...process.env, SWA_ENDPOINT: values.endpoint, SWA_PROJECT_ID: values['project-id'], NODE_OPTIONS: '--max-old-space-size=1024' }
const requireRuntime = createRequire(join(candidate, 'runtime', 'package.json'))
const processAPI = requireRuntime('@vscode/windows-process-tree')
const { startJournalRowFold } = requireRuntime('./journal-open.cjs')
const commands = [], observations = [], eventSources = new Map(), idempotency = []
let commandNumber = 0, runtimeId, controller, rootTask, runId
const request = () => randomUUID()
const native = envelope => envelope.result.native
const identity = source => ({ session: source.native_session_id, fence: source.fence, pid: source.process?.pid, creation_time_ms: source.process?.creation_time_ms, runtime: source.process?.runtime_id, provider_link: source.provider_link })

async function cli(args, expected = 0) {
  const ordinal = ++commandNumber
  const started = new Date().toISOString()
  const child = spawn(swa, [...args, '--json'], { env: environment, cwd: project, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  const stdout = [], stderr = []
  let length = 0
  child.stdout.on('data', value => { length += value.length; if (length > 16 * 1024 * 1024) child.stdout.destroy(new Error('Actual CLI output exceeds its declared bound')); else stdout.push(value) })
  child.stderr.on('data', value => { if (Buffer.concat(stderr).length < 256 * 1024) stderr.push(value) })
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.stdout.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  const text = Buffer.concat(stdout).toString('utf8'), diagnostic = Buffer.concat(stderr).toString('utf8')
  await writeFile(join(evidence, `cli-${ordinal}.stdout.json`), text, { flag: 'wx' })
  await writeFile(join(evidence, `cli-${ordinal}.stderr.log`), diagnostic, { flag: 'wx' })
  const envelope = text.trim() ? JSON.parse(text) : null
  commands.push({ ordinal, args, started, ended: new Date().toISOString(), pid: child.pid, exit: result.code, signal: result.signal, request_id: envelope?.request_id ?? null })
  if (result.code !== expected || result.signal) throw new Error(`Actual CLI ${args.slice(0, 2).join(' ')} failed: exit ${result.code}, signal ${result.signal}; preserve request ${envelope?.request_id ?? 'unavailable'} and evidence cli-${ordinal}`)
  assert.ok(envelope)
  if (expected === 0) {
    assert.equal(envelope.ok, true)
    if (runtimeId) assert.equal(envelope.runtime_id, runtimeId)
  }
  return envelope
}

const originalConfig = JSON.parse(await readFile(values['orca-observation'], 'utf8'))
const originalBytes = new Map(await Promise.all(originalConfig.protected_files.map(async file => [file, await readFile(file)])))
let originalBaseline
async function preserveOriginal(stage, pids = []) {
  const args = ['-NoProfile', '-File', join(dirname(import.meta.filename), 'observe-original-orca.ps1'), '-ConfigFile', values['orca-observation']]
  if (pids.length) args.push('-WorkerPids', pids.join(','))
  const observed = JSON.parse(execFileSync('pwsh', args, { encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 2 * 1024 * 1024 }))
  for (const [file, bytes] of originalBytes) assert.deepEqual(await readFile(file), bytes, `Actual protected file bytes changed: ${file}`)
  const stable = { commands: observed.public.commands, metadata: observed.public.metadata, processes: observed.public.processes, listeners: observed.public.listeners, files: observed.files }
  if (!originalBaseline) originalBaseline = stable
  else assert.deepEqual(stable, originalBaseline)
  observations.push({ stage, ...observed, targetedBytesUnchanged: true })
  process.stdout.write(JSON.stringify({ type: 'swa_real_orca_preservation', stage, runtime_id: observed.public.metadata.runtimeId, worker_observations: observed.worker_observations }) + '\n')
}

async function events(source) {
  assert.equal(source.availability, 'observed')
  assert.equal(source.process.runtime_id, runtimeId)
  assert.ok(source.process.pid > 0 && source.process.creation_time_ms > 0)
  const rel = relative(dataRoot, source.provider_events)
  assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel))
  const allRows = await readJSONL(candidate, source.provider_events)
  const rows = source.provider === 'opencode' ? allRows.filter(row => row.session_id === source.native_session_id && row.runtime_fence === source.fence && row.process.pid === source.process.pid && row.process.creationTimeMs === source.process.creation_time_ms) : allRows
  for (const row of rows) {
    assert.equal(row.process.pid, source.process.pid)
    assert.equal(row.process.creationTimeMs, source.process.creation_time_ms)
    assert.equal(row.projection, source.provider === 'opencode' ? 'actual_native_acp_lifecycle_and_delta_fields' : 'actual_native_cli_lifecycle_and_delta_fields')
    assert.ok(row.native_cli?.pid > 0 && row.native_cli.creationTimeMs > 0 && row.native_cli.pid !== row.process.pid)
  }
  const previous = eventSources.get(source.native_session_id)
  if (previous) assert.deepEqual(rows.slice(0, previous.rows.length), previous.rows, 'The observed append-only native event prefix changed')
  eventSources.set(source.native_session_id, { source, rows })
  return rows
}
const delta = row => row.protocol === 'acp'
  ? row.event === 'session/update' && row.detail.kind === 'known' && ['agent_message_chunk', 'agent_thought_chunk'].includes(row.detail.notification.update.sessionUpdate) && row.detail.notification.update.content?.type === 'text' && row.detail.notification.update.content.text.length > 0
  : row.record.type === 'message_update' && ['text_delta', 'thinking_delta'].includes(row.record.assistantMessageEvent?.type) && typeof row.record.assistantMessageEvent.delta === 'string' && row.record.assistantMessageEvent.delta.length > 0
const starts = rows => rows.filter(row => row.protocol === 'acp' ? row.event === 'session/prompt' : row.record.type === 'agent_start')
const ends = rows => rows.filter(row => row.protocol === 'acp' ? row.event === 'session/prompt/response' : row.record.type === 'agent_end')
async function freshProcessRows() { return new Promise((resolve, reject) => processAPI.getAllProcesses(rows => rows ? resolve(rows) : reject(new Error('Actual native process snapshot unavailable')), 4)) }
async function requireRootGone(processIdentity) {
  const checks = []
  for (let index = 0; index < 2; index++) {
    if (index) await setTimeout(75)
    const rows = await freshProcessRows(), row = rows.find(item => item.pid === processIdentity.pid)
    assert.ok(!row || row.creationTimeMs !== undefined && row.creationTimeMs !== processIdentity.creation_time_ms)
    checks.push({ utc: new Date().toISOString(), expected: processIdentity, observed: row ?? null })
  }
  return checks
}
async function queryWorker(dispatch) { return native(await cli(['worker', 'show', '--controller', controller, '--dispatch', dispatch])) }

await preserveOriginal('before_task')
const status = await cli(['status'])
runtimeId = status.runtime_id
assert.ok(runtimeId && status.result.execution_validation === 'requires_actual_selected_native_agent_session')
const database = status.result.databases.find(row => row.name === 'main')?.file
assert.ok(database && !relative(dataRoot, await realpath(database)).startsWith('..'))
const opened = await cli(['controller', 'open', '--project', values['project-id'], '--workdir', project, '--request-id', request()])
controller = opened.controller
assert.ok(controller)
const createArgs = ['task', 'create', '--controller', controller, '--spec-file', join(inputDirectory, 'task.json'), '--request-id', request()]
const created = await cli(createArgs)
rootTask = created.task_id
runId = created.run_id
assert.ok(rootTask && runId)
const repeatedCreate = await cli(createArgs)
assert.equal(repeatedCreate.task_id, rootTask)
assert.equal(repeatedCreate.run_id, runId)
idempotency.push({ action: 'task.create', request: createArgs.at(-1), original: created, replay: repeatedCreate })
const startArgs = ['A', 'B'].map(name => ['worker', 'start', '--controller', controller, '--task', rootTask, '--name', name, '--agent', values.agent, '--model', values.model, '--input-file', join(inputDirectory, `${name.toLowerCase()}.txt`), '--request-id', request()])
const started = await Promise.all(startArgs.map(args => cli(args)))
const [dispatchA, dispatchB] = started.map(row => row.dispatch_id)
assert.ok(dispatchA && dispatchB && dispatchA !== dispatchB)
assert.notEqual(started[0].task_id, started[1].task_id)
assert.ok(started.every(row => row.run_id === runId && row.task_id !== rootTask))
const [initialA, initialB] = await Promise.all([queryWorker(dispatchA), queryWorker(dispatchB)])
const initialIdentityA = identity(initialA.source), initialIdentityB = identity(initialB.source)
assert.notEqual(initialIdentityA.session, initialIdentityB.session)
assert.notEqual(initialIdentityA.pid, initialIdentityB.pid)
let rowsA, rowsB, actualOverlap
const overlapDeadline = Date.now() + 180_000
while (Date.now() < overlapDeadline) {
  ;[rowsA, rowsB] = await Promise.all([events(initialA.source), events(initialB.source)])
  if (ends(rowsA).length || ends(rowsB).length) throw new Error('One actual turn settled before execution overlap and an active stop could be observed; no automatic replacement task is allowed')
  const a = rowsA.filter(delta), b = rowsB.filter(delta)
  if (a.length >= 2 && b.length >= 2 && Math.max(a[0].monotonic_ms, b[0].monotonic_ms) < Math.min(a.at(-1).monotonic_ms, b.at(-1).monotonic_ms)) {
    actualOverlap = { firstA: a[0], lastA: a.at(-1), firstB: b[0], lastB: b.at(-1) }
    break
  }
  await setTimeout(500)
}
assert.ok(actualOverlap, 'Actual model delta intervals did not overlap')
await preserveOriginal('actual_A_B_overlap', [initialIdentityA.pid, initialIdentityB.pid])
const partialA = await cli(['worker', 'read', '--controller', controller, '--dispatch', dispatchA, '--source', 'transcript', '--limit', '100'])
const activeBeforeStop = await events(initialA.source)
assert.equal(ends(activeBeforeStop).length, 0)
const stopA = await cli(['worker', 'stop', '--controller', controller, '--dispatch', dispatchA, '--request-id', request()])
assert.equal(native(stopA).state, 'stopped')
const stoppedAt = Date.now()
const eventsAAfterStop = await events(initialA.source)
const stopCommandA = commands.at(-1)
const goneA = await requireRootGone(initialIdentityA)
const afterStopB = await queryWorker(dispatchB)
assert.deepEqual(identity(afterStopB.source), initialIdentityB)
assert.equal(processAPI.getProcessCreationTime(initialIdentityB.pid), initialIdentityB.creation_time_ms)
await preserveOriginal('after_exact_A_stop', [initialIdentityB.pid])
const firstTurnDeadline = Date.now() + 600_000
let firstTurnB
while (Date.now() < firstTurnDeadline) {
  firstTurnB = await events(initialB.source)
  if (ends(firstTurnB).length) break
  await setTimeout(1000)
}
assert.equal(starts(firstTurnB).length, 1)
assert.equal(ends(firstTurnB).length, 1, 'B did not finish its original actual turn before follow-up')
assert.deepEqual(identity((await queryWorker(dispatchB)).source), initialIdentityB)
for (let index = 0; index < startArgs.length; index++) {
  const replay = await cli(startArgs[index])
  assert.equal(replay.dispatch_id, started[index].dispatch_id)
  assert.equal(replay.task_id, started[index].task_id)
  idempotency.push({ action: 'worker.start', request: startArgs[index].at(-1), original: started[index], replay })
}
const repeatedStopA = await cli(stopCommandA.args)
assert.equal(native(repeatedStopA).state, 'stopped')
idempotency.push({ action: 'worker.stop', request: stopCommandA.args.at(-1), original: stopA, replay: repeatedStopA })
const sendRequest = request()
const followupFile = join(inputDirectory, `b-followup-${sendRequest}.txt`)
await writeFile(followupFile, 'A已按固定条件停止。请在当前同一会话根据下列实际A部分输出和准确公开原文，完成最终Median设计及验证说明；逐项覆盖原固定业务条件并引用文件位置。保持原Mean不变，禁止声称已运行程序测试。\n实际A读取回执：\n' + JSON.stringify(partialA) + '\n固定公开原文：\n' + JSON.stringify(source) + '\n', { flag: 'wx' })
const sendArgs = ['worker', 'send', '--controller', controller, '--dispatch', dispatchB, '--input-file', followupFile, '--request-id', sendRequest]
const originalSend = await cli(sendArgs), repeatedSend = await cli(sendArgs)
const sendResult = native(originalSend)
assert.equal(sendResult.request_id, sendRequest)
assert.equal(sendResult.native_request_id, `${sendRequest}/native`)
assert.equal(sendResult.agent, values.agent)
assert.equal(sendResult.execution_mode, 'structured')
assert.equal(sendResult.session_id, initialB.source.native_session_id)
assert.equal(sendResult.operation_id, sendResult.client_message_id)
assert.deepEqual(native(repeatedSend).swa_input_binding, sendResult.swa_input_binding)
assert.deepEqual(sendResult.swa_input_binding.body, { kind: 'message', role: 'user', blocks: [{ type: 'text', text: await readFile(followupFile, 'utf8') }] })
const inputDatabase = new DatabaseSync(database, { readOnly: true })
let sendNativeReceipt
try {
  sendNativeReceipt = inputDatabase.prepare('SELECT method, state, receipt FROM mutation_receipts WHERE caller_fingerprint=? AND request_id=?').get(status.authority_domain, `${sendRequest}/native`)
  assert.equal(sendNativeReceipt.method, 'swa.workerSend')
  assert.equal(sendNativeReceipt.state, 'completed')
  assert.deepEqual(JSON.parse(sendNativeReceipt.receipt).swa_input_binding, sendResult.swa_input_binding)
} finally { inputDatabase.close() }
idempotency.push({ action: 'worker.send', request: sendRequest, original: originalSend, replay: repeatedSend, actual_native_receipt: sendNativeReceipt })
const finalDeadline = Date.now() + 600_000
let finalEventsB
while (Date.now() < finalDeadline) {
  finalEventsB = await events(initialB.source)
  if (starts(finalEventsB).length >= 2 && ends(finalEventsB).length >= 2 && finalEventsB.some(row => delta(row) && Date.parse(row.observed_at) > stoppedAt)) break
  await setTimeout(1000)
}
assert.equal(starts(finalEventsB).length, 2, 'The same approved follow-up was executed more than once')
assert.equal(ends(finalEventsB).length, 2)
const inputStatus = await cli(['request', 'show', '--controller', controller, '--request-id', sendRequest])
assert.equal(inputStatus.result.current_input.state, 'accepted')
assert.equal(inputStatus.result.current_input.operation_id, sendResult.operation_id)
assert.equal(inputStatus.result.current_input.session_id, initialB.source.native_session_id)
assert.equal(inputStatus.result.current_input.source.session_id, initialB.source.native_session_id)
assert.ok(finalEventsB.some(row => delta(row) && Date.parse(row.observed_at) > stoppedAt))
assert.deepEqual(await events(initialA.source), eventsAAfterStop, 'A produced additional native events after its confirmed stop')
assert.deepEqual(identity((await queryWorker(dispatchB)).source), initialIdentityB)
const exported = await cli(['task', 'result', '--controller', controller, '--task', rootTask, '--output-dir', join(inputDirectory, 'result-' + randomUUID())])
const result = native(exported), outputB = result.workers.find(row => row.worker.dispatchId === dispatchB)
assert.ok(outputB && outputB.native_session.availability === 'complete')
const outputA = result.workers.find(row => row.worker.dispatchId === dispatchA)
assert.ok(outputA && outputA.journal.session_id === initialA.source.native_session_id)
const nativeStopsA = outputA.journal.rows.filter(row => row.row.kind === 'tombstone' && row.row.stopEvent?.reason === 'evict' && typeof row.row.stopEvent.turnId === 'string' && row.row.stopEvent.at >= Date.parse(stopCommandA.started))
assert.equal(nativeStopsA.length, 1, 'The actual stop did not record one active target turn; idle close is insufficient')
const nativeStopA = nativeStopsA[0]
const beforeStopFold = startJournalRowFold({ sessionId: outputA.journal.session_id, epoch: outputA.journal.epoch })
for (const row of outputA.journal.rows.filter(row => row.seq < nativeStopA.seq)) assert.equal(beforeStopFold.add({ seq: row.seq, ts: row.ts, rowJson: JSON.stringify(row.row) }), true)
const beforeStop = beforeStopFold.finish()
assert.equal(beforeStop.damage, null)
assert.equal(beforeStop.newer, null)
const targetTurnId = nativeStopA.row.stopEvent.turnId
const beforeTurn = [...beforeStop.state.items.values()].find(item => item.body.kind === 'turn' && item.body.turnId === targetTurnId)
assert.ok(beforeTurn && beforeTurn.body.state === 'running', 'The exact native stop target was not running at its accepted journal mark')
assert.ok(!ends(eventsAAfterStop).some(row => Date.parse(row.observed_at) < nativeStopA.row.stopEvent.at), 'The actual native turn ended before the native stop was processed')
const endedTurn = outputA.journal.snapshot.items.find(item => item.body.kind === 'turn' && item.body.turnId === targetTurnId)
const actualNativeAbort = eventsAAfterStop.find(row => (row.protocol === 'acp' ? row.event === 'session/prompt/response' && row.detail.response.stopReason === 'cancelled' : row.record.type === 'message_end' && row.record.message?.role === 'assistant' && row.record.message.stopReason === 'aborted') && Date.parse(row.observed_at) >= nativeStopA.row.stopEvent.at)
assert.ok(endedTurn && (endedTurn.body.state === 'interrupted' && endedTurn.body.outcome === undefined || endedTurn.body.outcome === 'cancellation' && actualNativeAbort), 'The active stop was not proven by the native interrupted turn or actual native cancellation')
const actualLast = outputB.native_session.format === 'opencode-sqlite-v2' ? outputB.native_session.messages.filter(row => row.type === 'assistant').at(-1).data : outputB.native_session.entries.filter(row => row.type === 'message' && row.message.role === 'assistant').at(-1).message
const fullText = typeof actualLast.content === 'string' ? actualLast.content : actualLast.content.filter(row => row.type === 'text').map(row => row.text).join('\n')
assert.ok(fullText.length > 1200, 'The actual long-output case did not occur')
for (const worker of result.workers) {
  const sourceInfo = worker.journal
  const path = eventSources.get(worker.source.native_session_id)?.source.journal_database
  assert.ok(path)
  const journal = new DatabaseSync(path, { readOnly: true })
  try {
    for (const row of sourceInfo.rows) {
      const actual = journal.prepare('SELECT ts, row_json FROM journal_rows WHERE session_id=? AND epoch=? AND seq=?').get(sourceInfo.session_id, row.epoch, row.seq)
      assert.ok(actual)
      assert.equal(actual.ts, row.ts)
      assert.deepEqual(JSON.parse(actual.row_json), row.row)
    }
  } finally { journal.close() }
}
await writeFile(join(evidence, 'B-final-output.txt'), fullText, { flag: 'wx' })
await writeFile(join(evidence, 'actual-result.json'), JSON.stringify(exported, null, 2) + '\n', { flag: 'wx' })
const thirdWorker = await cli(['worker', 'start', '--controller', controller, '--task', rootTask, '--name', 'third-worker-quota-check', '--agent', values.agent, '--model', values.model, '--input-file', join(inputDirectory, 'a.txt'), '--request-id', request()], 5)
assert.equal(thirdWorker.error.code, 'resource_limit')
const fleet = native(await cli(['worker', 'list', '--controller', controller, '--task', rootTask]))
assert.deepEqual(fleet.workers.map(row => row.dispatchId).sort(), [dispatchA, dispatchB].sort())
assert.equal(starts(await events(initialA.source)).length, 1)
assert.equal(starts(await events(initialB.source)).length, 2)
await cli(['worker', 'stop', '--controller', controller, '--dispatch', dispatchB, '--request-id', request()])
const goneB = await requireRootGone(initialIdentityB)
for (const dispatch of [dispatchA, dispatchB]) {
  const args = ['worker', 'release', '--controller', controller, '--dispatch', dispatch, '--request-id', request()]
  const original = await cli(args), replay = await cli(args)
  assert.equal(native(replay).state, native(original).state)
  idempotency.push({ action: 'worker.release', request: args.at(-1), original, replay })
}
await preserveOriginal('after_both_workers_released')
const preliminary = { candidate, source_revision: revision, runtime_id: runtimeId, controller, run_id: runId, root_task_id: rootTask, dispatchA, dispatchB, initialA, initialB, actualOverlap, partialA, stopA, activeStop: { nativeStopA, beforeTurn, endedTurn, actualNativeAbort: actualNativeAbort ?? null }, goneA, goneB, resultFile: join(evidence, 'actual-result.json'), commands, observations, idempotency, resource_quota: { thirdWorker, fleet }, provider_events: [...eventSources.values()], business_review: 'required', ordinary_terminal_invocation: 'requires_actual_evidence' }
await writeFile(values.output, JSON.stringify(preliminary, null, 2) + '\n', { flag: 'wx' })
process.stdout.write(JSON.stringify({ type: 'swa_actual_business_review_required', final_output: join(evidence, 'B-final-output.txt'), evidence: values.output, instruction: '核查真实B最终说明及固定业务条件，并从实际普通终端执行同候选查询后，输入一行JSON，含checked_result和ordinary_terminal_evidence绝对文件路径；该输入仅表示当前Agent控制端实际核查，不取得human身份。' }) + '\n')
const input = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false })
const answer = await new Promise((resolve, reject) => { input.once('line', resolve); input.once('close', () => reject(new Error('Actual controller business review was not supplied'))) })
input.close()
const checked = JSON.parse(answer)
assert.ok(typeof checked.checked_result === 'string' && checked.checked_result.trim().length >= 40)
assert.ok(typeof checked.ordinary_terminal_evidence === 'string' && isAbsolute(checked.ordinary_terminal_evidence))
const terminalEvidence = await readFile(checked.ordinary_terminal_evidence, 'utf8')
assert.ok(terminalEvidence.includes(revision) && terminalEvidence.includes(runtimeId) && /term_[a-zA-Z0-9-]+/.test(terminalEvidence))
const checkedFile = join(inputDirectory, 'checked-result.json')
await writeFile(checkedFile, JSON.stringify({ checked_by: 'current_project_agent_controller', actual_result: join(evidence, 'actual-result.json'), ordinary_terminal_evidence: checked.ordinary_terminal_evidence, result: checked.checked_result }, null, 2) + '\n', { flag: 'wx' })
await cli(['task', 'complete', '--controller', controller, '--task', rootTask, '--result-file', checkedFile, '--request-id', request()])
const finalTasks = await cli(['task', 'show', '--controller', controller, '--task', rootTask])
assert.equal(native(finalTasks).tasks.find(row => row.id === rootTask)?.status, 'completed')
await cli(['controller', 'close', '--controller', controller, '--request-id', request()])
await preserveOriginal('after_controller_close')
await writeFile(join(evidence, 'installed-flow-final.json'), JSON.stringify({ ...preliminary, commands, observations, finalTasks, business_review: checked, ordinary_terminal_invocation: 'actual_evidence_supplied_for_independent_review', functional_flow: 'passed' }, null, 2) + '\n', { flag: 'wx' })
process.stdout.write(JSON.stringify({ type: 'swa_installed_flow_completed', evidence: join(evidence, 'installed-flow-final.json'), acceptance: 'requires_independent_review' }) + '\n')
