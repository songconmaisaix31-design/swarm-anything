// 仅通过本次安装的公开 Run/命令执行固定问答验收；服务与授权仍由原 owner/helper 持有。
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as delay } from 'node:timers/promises'
import { isDeepStrictEqual, parseArgs } from 'node:util'
import { questionCase, publicFiles, publicRevision, publicSource } from './question-case-definition.mjs'
import { readPiPrivateJson, validatePiLaunchRecord } from './pi-event-view.mjs'
import { validateLinuxServiceReady } from './codex-event-view.mjs'
import { validatePiQuestionSelection, validatePiQuestionSources } from './pi-question-event-view.mjs'
import { driverFailure } from './driver-failure.mjs'

const help = '固定 StepFun Pi 1.0.1 questions-only 安装验收。仅 Linux x64；由授权 helper 传入安装、项目、原 owner、GUI及 question-scenario=full|answer-conflict。独立冲突场景必须绑定同S主场景的 question-baseline-file/sha256。不会启动服务或签发 Grant；未知只保原请求，不自动重发。\n'
if (process.argv.length === 3 && process.argv[2] === '--help') { process.stdout.write(help); process.exit(0) }
const object = value => { assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'question_driver_object_required'); return value }
const sha = value => createHash('sha256').update(value).digest('hex')
const inside = (root, path) => { const name = relative(root, path); return !name || name !== '..' && !name.startsWith('../') && !isAbsolute(name) }
const version = info => `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}`
const identity = info => `${info.dev}:${info.ino}:${info.birthtimeNs}`
const uuid = value => assert.match(value, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
class NotRun extends Error {}
class ObservationMoving extends Error {}
let values
try {
  const names = ['candidate', 'data-root', 'project', 'project-id', 'endpoint', 'agent', 'model', 'workers', 'output', 'source-repository', 'pi-launch-record', 'pi-launch-sha256', 'service-ready-record', 'service-ready-sha256', 'owner-handoff', 'gui-driver', 'gui-sha256', 'question-scenario']
  values = parseArgs({ options: Object.fromEntries([...names, 'question-baseline-file', 'question-baseline-sha256'].map(name => [name, { type: 'string' }])), allowPositionals: false }).values
  assert.ok(names.every(name => typeof values[name] === 'string' && values[name].trim() === values[name] && values[name]))
  assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64')
  assert.equal(values.agent, 'pi'); assert.equal(values.model, 'stepfun/step-3.5-flash'); assert.equal(values.workers, '2')
  assert.ok(['full', 'answer-conflict'].includes(values['question-scenario']))
  if (values['question-scenario'] === 'answer-conflict') { assert.ok(isAbsolute(values['question-baseline-file'])); assert.match(values['question-baseline-sha256'], /^[a-f0-9]{64}$/) }
  else { assert.equal(values['question-baseline-file'], undefined); assert.equal(values['question-baseline-sha256'], undefined) }
  uuid(values['project-id'])
  for (const name of ['candidate', 'data-root', 'project', 'output', 'source-repository', 'pi-launch-record', 'service-ready-record', 'owner-handoff', 'gui-driver']) assert.ok(isAbsolute(values[name]))
  for (const name of ['pi-launch-sha256', 'service-ready-sha256', 'gui-sha256']) assert.match(values[name], /^[a-f0-9]{64}$/)
  const endpoint = new URL(values.endpoint)
  assert.ok(endpoint.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(endpoint.hostname) && endpoint.port && !endpoint.username && !endpoint.password && endpoint.pathname === '/' && !endpoint.search && !endpoint.hash)
  values.endpoint = endpoint.origin
} catch { process.stderr.write('question_driver_invalid_fixed_arguments\n'); process.exit(2) }
process.umask(0o077)
const token = process.env.SWA_PROJECT_TOKEN
const report = { status: 'NOT_RUN', scenario: values['question-scenario'], source_revision: null, model_execution: 'NOT_RUN', phases: [], commands: [], unknown_requests: [], checks: [], not_run: ['independent_no_model_extension_success', 'windows_native_questions', 'private_cross_worker_rpc', 'workspace_resolution_disconnect', 'legacy_active_same_task_siblings', 'sdk_abort_result_without_actual_evidence'], service_shutdown: 'REQUIRES_ORIGINAL_OWNER_PROOF' }
let output, installation, dataRoot, project, inputRoot, swa, node, revision, runtimeId, database, protocol, observer, runtimeRequire, sourceReader, journalFold
let owned, ready, launch, runtimeCustodian, custodianInput, deadline, cleanupDeadline, piExecutable, settingsRevision, gui, guiChild, cleaning = false
const filePins = new Map(), sourcePins = new Map(), approved = new Map(), tracePrefixes = new Map(), nativePrefixes = new Map()
const observers = new Set(), issued = new Set()
const minimalEnv = () => ({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', HOME: output, TMPDIR: output, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' })
const safeText = value => { assert.ok(!token || !value.includes(token), 'question_credential_output_refused'); return value }
function publicProjection(value) {
  if (Array.isArray(value)) return value.map(publicProjection)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['invocation', 'ownerProcess', 'spawnToken', 'swaQuestionProducerProof', 'swaOwnerCapability', 'csrf_token', 'token', 'credential'].includes(key)).map(([key, item]) => [key, publicProjection(key === 'source_check' ? Object.fromEntries(Object.entries(item).filter(([name]) => name !== 'view')) : item)]))
  return value
}
const remaining = (limit = 150_000) => { const left = (cleaning ? cleanupDeadline : deadline) - Date.now(); assert.ok(left > 0, 'question_business_deadline'); return Math.min(left, limit) }
const native = reply => object(object(reply.result).native)
const check = (name, detail) => report.checks.push({ name, status: 'PASS', detail })
async function ordinary(path, directory = false, privatePath = false) {
  const canonical = await realpath(path)
  assert.equal(canonical, resolve(path), 'question_redirected_path')
  for (let current = canonical; ; current = dirname(current)) {
    const entry = await lstat(current, { bigint: true })
    assert.ok(!entry.isSymbolicLink() && (current !== canonical || directory ? entry.isDirectory() : entry.isFile()), 'question_ordinary_path_required')
    if (current === canonical && privatePath) {
      assert.equal(entry.uid, BigInt(process.getuid())); assert.equal(entry.mode & 0o7777n, directory ? 0o700n : 0o600n)
      if (!directory) assert.equal(entry.nlink, 1n)
    }
    if (dirname(current) === current) return canonical
  }
}
async function bytes(path, maximum = 1024 * 1024, privatePath = false) {
  await ordinary(path, false, privatePath)
  const before = await stat(path, { bigint: true })
  assert.ok(before.size > 0n && before.size <= BigInt(maximum), 'question_file_bound')
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    assert.equal(version(await handle.stat({ bigint: true })), version(before), 'question_file_fd_changed')
    const content = await handle.readFile()
    assert.equal(content.length, Number(before.size), 'question_file_length_changed')
    assert.equal(version(await handle.stat({ bigint: true })), version(before), 'question_file_changed_during_read')
    assert.equal(version(await stat(path, { bigint: true })), version(before), 'question_file_path_changed')
    return { content, version: version(before), identity: identity(before), path }
  } finally { await handle.close() }
}
async function save(name, value) {
  assert.ok(output && !isAbsolute(name) && name.split('/').every(part => part && part !== '..'), 'question_evidence_name')
  const text = safeText(typeof value === 'string' ? value : JSON.stringify(publicProjection(value), null, 2) + '\n')
  const handle = await open(join(output, name), 'wx', 0o600)
  try { await handle.writeFile(text); await handle.sync() } finally { await handle.close() }
  return join(output, name)
}
async function pin(path, maximum = 1024 * 1024) {
  const current = await bytes(path, maximum)
  filePins.set(path, { version: current.version, sha256: sha(current.content) })
  return current.content
}
async function verifyPins() {
  for (const [path, expected] of filePins) {
    const current = await bytes(path, 8 * 1024 * 1024)
    assert.deepEqual({ version: current.version, sha256: sha(current.content) }, expected, 'question_pinned_source_changed')
  }
  for (const [path, expected] of sourcePins) {
    await ordinary(path, expected.directory, true)
    assert.equal(version(await stat(path, { bigint: true })), expected.version, 'question_account_source_metadata_changed')
  }
}
async function assertOwned() {
  remaining(); await verifyPins()
  assert.deepEqual(observer.observeRuntimeCustodian(custodianInput), runtimeCustodian, 'question_original_runtime_changed')
  assert.equal(await realpath(`/proc/${owned.serve_pid}/exe`), swa, 'question_original_serve_executable_changed')
}
function exactRun(reply, phase) {
  const result = native(reply), view = object(result.run_view)
  assert.equal(view.schema, 'swa.run-view.v1')
  for (const [key, expected] of Object.entries({ controller: phase.controller, run_id: phase.run_id, root_task_id: phase.root_task_id })) assert.equal(view[key], expected, 'question_run_identity_changed')
  for (const key of ['tasks', 'dispatches', 'questions', 'answered_questions', 'failures', 'blockers', 'handoffs']) assert.ok(Array.isArray(view[key]), 'question_complete_run_array_missing')
  assert.equal(new Set(view.tasks.map(task => task.id)).size, view.tasks.length)
  assert.equal(new Set(view.dispatches.map(dispatch => dispatch.id)).size, view.dispatches.length)
  assert.ok(view.tasks.length <= phase.spec.max_workers + 1 && view.dispatches.length <= phase.spec.max_workers, 'question_run_inventory_exceeds_spec')
  phase.view = view
  return view
}
async function cli(args, { codes = [0], onProgress, cancelOnProgress = false, limit = 150_000 } = {}) {
  await assertOwned()
  for (const flag of ['--input-file', '--spec-file']) if (args.includes(flag)) {
    const path = args[args.indexOf(flag) + 1]
    assert.equal((await bytes(path)).content.toString('utf8'), approved.get(path), 'question_approved_input_changed')
  }
  const rIndex = args.indexOf('--request-id'), requestId = rIndex < 0 ? null : args[rIndex + 1]
  const entry = { ordinal: report.commands.length + 1, args, request_id: requestId, mutation: !!requestId && args[0] !== 'request', state: 'intent_only' }
  report.commands.push(entry)
  await save(`cli-${entry.ordinal}.intent.json`, entry)
  const task = new Promise((resolveCall, reject) => {
    const child = spawn(swa, [...args, '--json'], { cwd: project, env: { ...minimalEnv(), SWA_PROJECT_TOKEN: token, SWA_PROJECT_ID: values['project-id'], SWA_ENDPOINT: values.endpoint }, stdio: ['ignore', 'pipe', 'pipe'] })
    observers.add(child)
    const out = [], err = [], progress = []
    let outSize = 0, errSize = 0, failed, cancelled = false
    const stop = reason => { failed ??= reason; if (child.exitCode === null) child.kill('SIGTERM') }
    const timer = setTimeout(() => stop(new Error('question_cli_response_unknown')), remaining(limit))
    const lines = createInterface({ input: child.stderr, crlfDelay: Infinity, terminal: false })
    child.on('spawn', () => {
      entry.state = 'submitted'; entry.started_at = new Date().toISOString()
      if (args[0] === 'run' || args[0] === 'worker' && args[1] === 'start') {
        entry.model_effect = 'UNKNOWN_SUBMISSION_EFFECTS_POSSIBLE'
        if (report.model_execution === 'NOT_RUN') report.model_execution = entry.model_effect
      }
    })
    child.on('error', stop)
    child.stdout.on('data', value => { outSize += value.length; if (outSize > 128 * 1024 * 1024) stop(new Error('question_cli_response_bound')); else out.push(value) })
    child.stderr.on('data', value => { errSize += value.length; if (errSize > 1024 * 1024) stop(new Error('question_cli_diagnostic_bound')); else err.push(value) })
    lines.on('line', line => {
      try {
        safeText(line)
        if (!line.trim().startsWith('{')) return
        const event = JSON.parse(line); progress.push(event)
        if (onProgress) onProgress(event)
        if (cancelOnProgress && event.event === 'run_progress' && !cancelled) { cancelled = true; child.kill('SIGINT') }
      } catch (error) { stop(error) }
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer); lines.close(); observers.delete(child)
      entry.exit_code = code; entry.signal = signal; entry.progress = progress
      try {
        safeText(Buffer.concat(err).toString('utf8'))
        if (failed) throw failed
        const reply = object(protocol.parseStrictPiJson(safeText(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(out)))))
        assert.ok(codes.includes(code), 'question_cli_unexpected_exit')
        assert.equal(reply.ok, code === 0, 'question_cli_success_status_mismatch')
        if (code !== 0) assert.equal(reply.error?.code, ({ 7: 'run_failed', 8: 'run_wait_timed_out', 9: 'run_input_required', 130: 'run_wait_cancelled' })[code], 'question_cli_failure_class_changed')
        if (reply.runtime_id) assert.equal(reply.runtime_id, runtimeId, 'question_cli_runtime_changed')
        if (requestId && args[0] !== 'run') assert.equal(reply.request_id, requestId, 'question_cli_original_request_changed')
        entry.state = code === 6 ? 'unknown' : 'response_observed'; entry.reply = publicProjection(reply)
        resolveCall({ reply, entry, code, progress })
      } catch (error) {
        entry.state = entry.mutation ? 'unknown' : 'failed_observation'
        if (entry.mutation) report.unknown_requests.push({ request_id: requestId, args, ordinal: entry.ordinal })
        reject(error)
      }
    })
  })
  issued.add(task)
  try { const result = await task; await save(`cli-${entry.ordinal}.response.json`, entry); return result }
  finally { issued.delete(task) }
}
const runArgs = phase => ['wait', '--controller', phase.controller, '--task', phase.root_task_id, '--run', phase.run_id, '--strict']
async function observeRun(phase, expected = [9]) { const actual = await cli(runArgs(phase), { codes: expected, limit: 60_000 }); return { ...actual, view: exactRun(actual.reply, phase) } }
async function waitUntil(name, read, test, timeout = 180_000) {
  const end = Date.now() + remaining(timeout)
  for (;;) {
    try { const value = await read(); if (test(value)) return value }
    catch (error) { if (!(error instanceof ObservationMoving)) throw error }
    assert.ok(Date.now() < end, name)
    await delay(Math.min(500, Math.max(1, end - Date.now())))
  }
}
function readonly(path, operation) {
  const db = new DatabaseSync(path, { readOnly: true })
  try { return operation(db) } finally { db.close() }
}
function originalRequest(requestId, phase) {
  return readonly(database, db => {
    const rows = db.prepare('SELECT caller_fingerprint,request_id,method,state,CASE WHEN LENGTH(CAST(receipt AS BLOB))<=1048576 THEN receipt END receipt FROM mutation_receipts WHERE request_id=?').all(requestId)
    assert.ok(rows.length <= 1, 'question_request_ambiguous')
    if (!rows.length) return null
    const row = rows[0], receipt = row.receipt === null ? null : protocol.parseStrictPiJson(row.receipt)
    if (phase && receipt) for (const [key, value] of Object.entries({ project_id: values['project-id'], controller: phase.controller, run_id: phase.run_id, root_task_id: phase.root_task_id })) assert.equal(receipt[key] ?? receipt.invocation?.scope?.[key], value, 'question_receipt_scope_changed')
    return { ...row, receipt }
  })
}
function questionInventory(phase, dispatchId) {
  return readonly(database, db => {
    const questionRows = db.prepare(`SELECT q.message_id,q.run_id,q.dispatch_id,q.status,q.answer_message_id,q.answer_body,m.id,m.run_id message_run,m.thread_id,m.type,m.from_handle,m.to_handle,m.body
      FROM question_threads q JOIN messages m ON m.id=q.message_id WHERE q.run_id=? AND q.dispatch_id=? ORDER BY q.created_at,q.message_id`).all(phase.run_id, dispatchId)
    assert.ok(questionRows.length <= 1, 'question_unexpected_second_question')
    const row = questionRows[0]
    const question = row ? { message_id: row.message_id, run_id: row.run_id, dispatch_id: row.dispatch_id, status: row.status, answer_message_id: row.answer_message_id, answer_body: row.answer_body,
      message: { id: row.id, run_id: row.message_run, thread_id: row.thread_id, type: row.type, from_handle: row.from_handle, to_handle: row.to_handle, body: row.body } } : null
    const answer = row?.answer_message_id ? db.prepare('SELECT id,run_id,thread_id,type,from_handle,to_handle,body FROM messages WHERE id=?').get(row.answer_message_id) : null
    const where = `FROM mutation_receipts WHERE method='orchestration.ask' AND json_valid(receipt)=1 AND json_extract(receipt,'$.run_id')=? AND json_extract(receipt,'$.dispatch_id')=?`
    const bound = db.prepare(`SELECT COUNT(*) count,COALESCE(SUM(LENGTH(CAST(receipt AS BLOB))),0) bytes ${where}`).get(phase.run_id, dispatchId)
    assert.ok(bound.count <= 100_000 && bound.bytes <= 12 * 1024 * 1024, 'question_receipt_inventory_bound')
    const receipts = db.prepare(`SELECT request_id,method,state,receipt ${where} ORDER BY request_id`).all(phase.run_id, dispatchId).map(row => ({ ...row, receipt: protocol.parseStrictPiJson(row.receipt) }))
    return { question, answer, receipts }
  })
}
async function recordOf(source) {
  const path = await ordinary(source.journal_database, false, true)
  assert.ok(inside(dataRoot, path), 'question_journal_outside_owned_data')
  const before = identity(await stat(path, { bigint: true }))
  const value = readonly(path, db => {
    const actual = db.prepare('SELECT CASE WHEN LENGTH(CAST(record_json AS BLOB)) BETWEEN 1 AND 1048576 THEN record_json END value FROM agent_session_records WHERE session_id=?').get(source.native_session_id)
    assert.equal(typeof actual?.value, 'string', 'question_actual_record_unavailable')
    return { record: observer.decodePiRecord(protocol.parseStrictPiJson(actual.value)), journalEpoch: db.prepare('SELECT epoch FROM journal_sessions WHERE session_id=?').get(source.native_session_id)?.epoch }
  })
  assert.equal(identity(await stat(path, { bigint: true })), before, 'question_journal_identity_changed')
  assert.equal(value.record.session_id, source.native_session_id)
  return value
}
async function nativeRows(path) {
  await ordinary(path, false, true)
  const before = await stat(path, { bigint: true })
  const actual = await sourceReader({ path, maximum: 12 * 1024 * 1024, requirePrivatePath: async source => { await ordinary(source, false, true) } })
  assert.ok(actual.source.version.startsWith(`${identity(before)}:`), 'question_native_open_identity_changed')
  assert.equal(identity(await stat(path, { bigint: true })), identity(before), 'question_native_path_identity_changed')
  const snapshot = { content: actual.bytes, identity: identity(before), source: actual.source, observation: actual.observation }
  observer.validatePiSource('validate-pi-question-native', actual.bytes)
  const rows = actual.rows
  assert.ok(rows.length > 0)
  const prior = nativePrefixes.get(path)
  if (prior) assert.ok(snapshot.identity === prior.identity && snapshot.content.length >= prior.content.length && snapshot.content.subarray(0, prior.content.length).equals(prior.content), 'question_native_prefix_changed')
  nativePrefixes.set(path, snapshot)
  return { header: rows[0], entries: rows.slice(1), snapshot }
}
function releaseOf(phase, worker) {
  return readonly(database, db => {
    const resources = db.prepare('SELECT id,origin_dispatch_id,owner_dispatch_id,terminal_handle,process_incarnation,ownership_state,release_state FROM worker_terminal_resources WHERE owner_dispatch_id=?').all(worker.dispatch_id)
    assert.equal(resources.length, 1, 'question_original_resource_ambiguous')
    const requestId = `${phase.root_task_id}/native-lifecycle/${worker.dispatch_id}/release`
    const rows = db.prepare('SELECT request_id,method,state,receipt FROM mutation_receipts WHERE request_id=?').all(requestId)
    assert.ok(rows.length <= 1, 'question_original_release_ambiguous')
    return { ...(rows[0] ? { ...rows[0], receipt: rows[0].receipt && protocol.parseStrictPiJson(rows[0].receipt) } : { request_id: requestId, state: 'absent' }), resource: resources[0] }
  })
}
async function workerSources(phase, worker, observationAttempt = 0) {
  await assertOwned()
  let observed = native((await cli(['worker', 'show', '--controller', phase.controller, '--dispatch', worker.dispatch_id])).reply)
  assert.equal(observed.worker.dispatchId, worker.dispatch_id); assert.equal(observed.worker.runtimeEpoch, runtimeId)
  let source = object(observed.source)
  assert.equal(source.availability, 'observed'); assert.equal(source.provider, 'pi')
  const original = originalRequest(worker.request_id, phase)
  assert.equal(original?.state, 'completed'); assert.equal(original.method, 'swa.controllerDeliver')
  const receipt = original.receipt, binding = object(receipt.swa_input_binding)
  assert.equal(receipt.action, 'worker.start'); assert.equal(receipt.child_request, `${worker.request_id}/native`)
  assert.equal(binding.parent_request, worker.request_id); assert.equal(binding.child_request, receipt.child_request)
  assert.equal(binding.dispatch_id, worker.dispatch_id); assert.equal(binding.session_id, source.native_session_id)
  assert.equal(binding.runtime_fence, source.fence)
  assert.equal(receipt.invocation.input.text, approved.get(worker.input_file), 'question_original_input_changed')
  assert.equal(receipt.invocation.command.question_mode, 'native')
  assert.equal(receipt.invocation.caller.kind, 'agent'); assert.equal(receipt.invocation.caller.id, 'swa-stepfun-pi-questions-20261023')
  assert.deepEqual(receipt.selection, source.selection)
  const extensionPath = join(installation, 'runtime', 'pi-question-extension.mjs')
  const extension = { path: extensionPath, version: version(await stat(extensionPath, { bigint: true })) }
  validatePiQuestionSelection(receipt.selection, { executable: piExecutable, sourceHome: owned.pi_source_home, privateRoot: join(dataRoot, 'pi-workers', values['project-id']), extension })
  for (const entry of [receipt.selection.native_launch.account.auth_source, receipt.selection.native_launch.account.models_source]) assert.equal(sourcePins.get(entry.path)?.version, entry.version, 'question_start_account_source_changed')
  let current = await recordOf(source)
  const path = await ordinary(source.provider_events, false, true)
  assert.equal(path, join(dataRoot, 'workers', source.native_session_id, 'provider-events.ndjson'))
  let trace = await sourceReader({ path, maximum: 12 * 1024 * 1024, requirePrivatePath: async path => { await ordinary(path, false, true) } })
  const after = await recordOf(source)
  if (current.record.lease.claimStatus === 'released' || after.record.lease.claimStatus === 'released' || trace.rows.at(-1)?.event === 'custody_closed') {
    observed = native((await cli(['worker', 'show', '--controller', phase.controller, '--dispatch', worker.dispatch_id])).reply)
    const closed = object(observed.source)
    for (const key of ['native_session_id', 'fence', 'provider_events', 'journal_database']) assert.equal(closed[key], source[key], 'question_closed_source_changed')
    source = closed
    trace = await sourceReader({ path, maximum: 12 * 1024 * 1024, requirePrivatePath: async path => { await ordinary(path, false, true) } })
    current = await recordOf(source)
    assert.equal(current.record.lease.claimStatus, 'released', 'question_closed_lease_not_released')
    assert.equal(trace.rows.at(-1)?.event, 'custody_closed', 'question_closed_trace_incomplete')
    assert.deepEqual(source.custody, trace.rows.at(-1).detail)
  } else if (!isDeepStrictEqual(current, after)) {
    assert.ok(observationAttempt < 3, 'question_live_record_changed')
    return workerSources(phase, worker, observationAttempt + 1)
  }
  observer.validatePiSource('validate-pi-question-trace', trace.bytes)
  const prior = tracePrefixes.get(path)
  if (prior) assert.ok(identity(await stat(path, { bigint: true })) === prior.identity && trace.bytes.length >= prior.bytes.length && trace.bytes.subarray(0, prior.bytes.length).equals(prior.bytes), 'question_provider_prefix_changed')
  tracePrefixes.set(path, { bytes: trace.bytes, identity: identity(await stat(path, { bigint: true })), source: trace.source })
  const sessionFile = current.record.head.handle.nativeId
  assert.ok(inside(join(dataRoot, 'pi-workers', values['project-id'], source.native_session_id), await ordinary(sessionFile, false, true)), 'question_native_path_outside_original_home')
  const actualNative = await nativeRows(sessionFile), inventory = questionInventory(phase, worker.dispatch_id)
  const rawMessages = trace.rows.filter(row => row.event === 'native_record' && row.detail.frame.type === 'message_end').map(row => row.detail.frame.message)
  const persistedMessages = actualNative.entries.filter(row => row.type === 'message').map(row => row.message)
  if (!isDeepStrictEqual(rawMessages, persistedMessages)) {
    const count = Math.min(rawMessages.length, persistedMessages.length)
    assert.ok(current.record.lease.claimStatus === 'live' && rawMessages.length !== persistedMessages.length && isDeepStrictEqual(rawMessages.slice(0, count), persistedMessages.slice(0, count)), 'question_native_trace_message_changed')
    await delay(100)
    const laterTrace = await sourceReader({ path, maximum: 12 * 1024 * 1024, requirePrivatePath: async source => { await ordinary(source, false, true) } })
    const laterNative = await nativeRows(sessionFile)
    assert.equal(identity(await stat(path, { bigint: true })), tracePrefixes.get(path).identity, 'question_provider_identity_changed')
    assert.ok(laterTrace.bytes.length >= trace.bytes.length && laterTrace.bytes.subarray(0, trace.bytes.length).equals(trace.bytes), 'question_provider_prefix_changed')
    const grew = laterTrace.bytes.length > trace.bytes.length || laterNative.snapshot.content.length > actualNative.snapshot.content.length
    assert.ok(grew, 'question_native_trace_stable_mismatch')
    if (observationAttempt >= 3) throw new ObservationMoving('question_sources_still_appending')
    return workerSources(phase, worker, observationAttempt + 1)
  }
  const release = releaseOf(phase, worker)
  const expected = { session: source.native_session_id, fence: binding.runtime_fence, runtimeEpoch: runtimeId, process: source.process, executable: piExecutable, nodeExecutable: node,
    sessionFile, home: join(dataRoot, 'pi-workers', values['project-id'], source.native_session_id), cwd: project, journalEpoch: current.journalEpoch, extension,
    scope: { project_id: values['project-id'], controller: phase.controller, run_id: phase.run_id, root_task_id: phase.root_task_id }, dispatchId: worker.dispatch_id, startRequestId: worker.request_id, startBinding: binding,
    workerState: observed.worker.state, resource: release.resource, release, runtimeCustodian, source, selection: receipt.selection,
    ...(worker.stop_request ? { stop: originalRequest(`${worker.stop_request}/native`) } : {}) }
  const checked = validatePiQuestionSources({ protocol, identities: observer, trace: trace.rows, native: { header: actualNative.header, entries: actualNative.entries }, record: current.record, expected, ...inventory })
  for (const entry of [...checked.view.ready.sources.filter(entry => ['auth.json', 'models.json'].some(name => entry.path === join(expected.home, name))), checked.view.ready.settings]) {
    await ordinary(entry.path, false, true)
    assert.equal(version(await stat(entry.path, { bigint: true })), entry.version, 'question_private_account_metadata_changed')
  }
  assert.ok(receipt.selection.configuration_version.includes(`;${sourcePins.get(join(owned.pi_source_home, 'settings.json')).version};${sourcePins.get(join(owned.pi_source_home, 'auth.json')).version};`), 'question_original_configuration_changed')
  if (!isDeepStrictEqual(await recordOf(source), current)) {
    assert.ok(observationAttempt < 3, 'question_record_changed_after_source_check')
    return workerSources(phase, worker, observationAttempt + 1)
  }
  if (current.record.lease.claimStatus === 'released') {
    assert.equal(trace.observation.incomplete_tail_bytes, 0); assert.equal(actualNative.snapshot.observation.incomplete_tail_bytes, 0)
    assert.equal(version(await stat(path, { bigint: true })), trace.source.version, 'question_closed_provider_changed')
    assert.equal(version(await stat(sessionFile, { bigint: true })), actualNative.snapshot.source.version, 'question_closed_native_changed')
    for (const value of [source.process, trace.rows[0].detail.nativeState.identity]) {
      const actual = observer.observeIncarnation(value.pid)
      assert.ok(actual.absent || actual.incarnation.boot_id !== value.boot_id || actual.incarnation.start_ticks !== value.start_ticks, 'question_released_process_still_present')
    }
    assert.equal(release.state, 'completed'); assert.equal(release.method, 'orchestration.workerRelease')
    assert.equal(release.receipt.dispatchId, worker.dispatch_id); assert.ok(['released', 'already_released'].includes(release.receipt.state))
    assert.equal(release.resource.release_state, 'released'); assert.equal(release.resource.ownership_state, 'released')
  }
  worker.source = publicProjection(source); worker.binding = binding; worker.selection = receipt.selection; worker.record = current.record; worker.journal_epoch = current.journalEpoch; worker.release = release
  worker.question = inventory.question; worker.answer = inventory.answer; worker.source_check = checked
  worker.native = { header: actualNative.header, entries: actualNative.entries }; worker.trace = trace.rows
  worker.question_receipts = inventory.receipts
  worker.model_evidence ??= {}
  if (checked.view.prompts.some(prompt => prompt.write.settled)) worker.model_evidence.native_prompt_written = true
  if (trace.rows.some(row => row.event === 'native_record' && row.detail.frame.type === 'message_end' && row.detail.frame.message.role === 'assistant')) worker.model_evidence.actual_assistant_output = true
  if (checked.tools.some(tool => tool.started_sequence !== null)) worker.model_evidence.actual_question_tool = true
  if (checked.reads.length > 0) worker.model_evidence.actual_answer_read = true
  if (checked.followup.some(turn => turn.complete)) worker.model_evidence.actual_followup_complete = true
  if (worker.model_evidence.actual_followup_complete) report.model_execution = 'ACTUAL_QUESTION_TOOL_AND_FOLLOWUP_OBSERVED'
  else if (worker.model_evidence.actual_assistant_output && report.model_execution !== 'ACTUAL_QUESTION_TOOL_AND_FOLLOWUP_OBSERVED') report.model_execution = 'ACTUAL_NATIVE_ASSISTANT_OUTPUT_OBSERVED'
  else if (worker.model_evidence.native_prompt_written && ['NOT_RUN', 'UNKNOWN_SUBMISSION_EFFECTS_POSSIBLE'].includes(report.model_execution)) report.model_execution = 'ACTUAL_NATIVE_PROMPT_WRITTEN'
  await assertOwned()
  return worker
}
async function startGui() {
  const root = join(output, 'gui')
  const child = spawn(node, [values['gui-driver'], '--owner-handoff', values['owner-handoff'], '--project-id', values['project-id'], '--project', project, '--output', root, '--deadline', new Date(deadline).toISOString(), '--question-scenario', report.scenario], { cwd: project, env: minimalEnv(), stdio: ['pipe', 'pipe', 'pipe'] })
  guiChild = child
  const pending = new Map(), readyPromise = Promise.withResolvers(), closed = Promise.withResolvers()
  let stderrBytes = 0, stdoutBytes = 0, failed
  const abort = error => { failed ??= error; readyPromise.reject(error); for (const item of pending.values()) item.reject(error); pending.clear() }
  child.on('error', abort)
  child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 256 * 1024 || token && chunk.toString('utf8').includes(token)) abort(new Error('question_gui_diagnostic_refused')) })
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity, terminal: false })
  lines.on('line', line => {
    try {
      stdoutBytes += Buffer.byteLength(line); assert.ok(stdoutBytes <= 32 * 1024 * 1024, 'question_gui_response_bound')
      const value = object(protocol.parseStrictPiJson(safeText(line)))
      if (value.op === 'ready' && value.id === null) { assert.equal(value.ok, true); readyPromise.resolve(value.result); return }
      const item = pending.get(value.id); assert.ok(item, 'question_gui_unexpected_response')
      pending.delete(value.id); item.resolve(value)
    } catch (error) { abort(error) }
  })
  child.once('close', (code, signal) => { lines.close(); abort(new Error('question_gui_closed')); closed.resolve({ code, signal }) })
  const initial = await Promise.race([readyPromise.promise, delay(remaining(45_000), undefined, { ref: false }).then(() => { throw new Error('question_gui_start_unknown') })])
  assert.equal(initial.source_revision, revision); assert.equal(initial.runtime_id, runtimeId); assert.equal(initial.project_id, values['project-id'])
  assert.equal(initial.question_scenario, report.scenario)
  let number = 0
  return { child, closed: closed.promise, async call(op, fields = {}, acceptFailure = false) {
    if (failed) throw failed
    remaining()
    const id = `question-gui-${++number}`, item = Promise.withResolvers()
    pending.set(id, item)
    await save(`${id}.intent.json`, { id, op, ...fields, gui_persistence: 'original_sessionStorage_before_fetch' })
    child.stdin.write(JSON.stringify({ id, op, ...fields }) + '\n')
    const reply = await Promise.race([item.promise, delay(remaining(180_000), undefined, { ref: false }).then(() => { throw new Error('question_gui_response_unknown') })])
    await save(`${id}.response.json`, reply)
    if (reply.ok !== true) { report.gui_failure = { op, response: reply }; if (!acceptFailure) assert.fail('question_gui_operation_failed') }
    return reply.result ?? reply
  } }
}
const guiScope = phase => ({ controller: phase.controller, run_id: phase.run_id, root_task_id: phase.root_task_id, ...(phase.question_id ? { question_id: phase.question_id, dispatch_id: phase.workers[0].dispatch_id } : {}) })
async function guiAttach(phase) { return gui.call('attach', guiScope(phase)) }
async function startPhase(definition) {
  remaining(definition.name === 'b' ? 16 * 60_000 : 6 * 60_000)
  assert.ok(deadline - Date.now() > (definition.name === 'b' ? 16 : 6) * 60_000, 'question_insufficient_phase_and_cleanup_window')
  const directory = join(inputRoot, definition.name), phase = { name: definition.name, spec: definition.spec, workers: [], request_id: randomUUID(), controller: null, run_id: null, root_task_id: null }
  report.phases.push(phase)
  const input = definition.inputs[0], args = ['run', '--workdir', project, '--spec-file', join(directory, 'task.json'), '--input-file', join(directory, input.file), '--agent', 'pi', '--model', values.model, '--question-mode', 'native', '--name', input.name, '--request-id', phase.request_id, '--strict']
  const result = await cli(args, { codes: [9], limit: 180_000, onProgress: event => {
    if (event.event === 'run_submitted') {
      assert.equal(event.request_id, phase.request_id)
      Object.assign(phase, { controller: event.controller, run_id: event.run_id, root_task_id: event.task_id })
    }
  } })
  for (const value of [phase.controller, phase.run_id, phase.root_task_id]) assert.equal(typeof value, 'string')
  const root = originalRequest(phase.request_id)
  assert.equal(root?.state, 'completed'); assert.equal(root.receipt.controller, phase.controller)
  const submission = object(root.receipt.submission)
  assert.equal(submission.caller.kind, 'agent'); assert.equal(submission.caller.id, 'swa-stepfun-pi-questions-20261023')
  const start = originalRequest(submission.worker_request_id, phase)
  assert.equal(start?.state, 'completed')
  const binding = object(start.receipt.swa_input_binding)
  const worker = { request_id: submission.worker_request_id, dispatch_id: binding.dispatch_id, input_file: join(directory, input.file) }
  phase.workers.push(worker)
  const view = exactRun(result.reply, phase)
  assert.equal(view.status, 'waiting_input'); assert.equal(view.questions.length, 1)
  const q = view.questions[0]
  assert.equal(q.dispatch_id, worker.dispatch_id); phase.question_id = q.id
  assert.ok(result.progress.some(event => event.event === 'run_question' && event.question_id === q.id && event.command?.includes('question answer')), 'question_cli_answer_guidance_missing')
  await waitUntil('question_initial_sources_not_stable', () => workerSources(phase, worker), () => true, 30_000)
  assert.equal(worker.question?.message_id, q.id); assert.equal(worker.question.status, 'pending')
  assert.ok(worker.source_check.tools.length > 0, 'question_actual_tool_not_observed')
  await observeRun(phase)
  await guiAttach(phase)
  check(`phase_${phase.name}_real_question_wait9`, { run_id: phase.run_id, question_id: q.id, dispatch_id: worker.dispatch_id })
  return phase
}
function answerCommand(phase, text, requestId = randomUUID()) { return { action: 'question.answer', controller: phase.controller, run_id: phase.run_id, task_id: phase.root_task_id, dispatch_id: phase.workers[0].dispatch_id, question_id: phase.question_id, request_id: requestId, text } }
async function answerInGui(phase, answerBody) {
  const answered = await gui.call('answer', { question_id: phase.question_id, dispatch_id: phase.workers[0].dispatch_id, text: answerBody })
  assert.ok(answered.request_id && answered.command, 'question_gui_actual_answer_request_missing')
  uuid(answered.request_id)
  assert.deepEqual(answered.command, answerCommand(phase, answerBody, answered.request_id))
  assert.equal(answered.pending, null, 'question_answer_effect_unresolved')
  assert.equal(answered.reply?.ok, true, 'question_answer_not_confirmed')
  phase.answer_command = answered.command; phase.answer_result = answered
  return answered
}
async function finishPhase(phase, expectedCode = 0) {
  const completed = await cli([...runArgs(phase), '--on-input', 'wait', '--timeout', '10m'], { codes: [expectedCode], limit: 11 * 60_000 })
  const view = exactRun(completed.reply, phase)
  assert.equal(view.complete, true); assert.equal(view.status, expectedCode === 0 ? 'completed' : 'failed')
  assert.equal(view.questions.length, 0)
  assert.equal(view.dispatches.length, phase.spec.initial_workers)
  assert.ok(view.dispatches.every(row => row.release_state === 'released'))
  if (expectedCode === 0) assert.equal(view.failures.length, 0)
  for (const worker of phase.workers) await workerSources(phase, worker)
  await gui.call('observe')
  const exported = await cli(['export', '--controller', phase.controller, '--task', phase.root_task_id, '--run', phase.run_id, '--output-dir', join(inputRoot, `result-${phase.name}-${randomUUID()}`)])
  const exportedView = exactRun(exported.reply, phase), { observed_at: _at, ...stable } = view, { observed_at: _exportAt, ...exportedStable } = exportedView
  assert.deepEqual(exportedStable, stable)
  phase.exported = exported.reply
  const result = object(native(exported.reply).result)
  assert.equal(result.workers.length, phase.workers.length)
  for (const original of phase.workers) {
    const worker = result.workers.find(row => row.worker.dispatchId === original.dispatch_id)
    assert.ok(worker, 'question_export_worker_missing')
    assert.equal(worker.source.native_session_id, original.source.native_session_id)
    assert.equal(worker.native_session.native_id, original.native.header.id)
    assert.equal(worker.provider_events.path, original.source.provider_events)
    assert.equal(worker.provider_events.source_version, tracePrefixes.get(worker.provider_events.path).source.version)
    if (expectedCode === 0) assert.equal(worker.native_session.availability, 'complete')
    const journal = object(worker.journal), actual = readonly(original.source.journal_database, db => {
      assert.equal(db.prepare('SELECT epoch FROM journal_sessions WHERE session_id=?').get(original.source.native_session_id)?.epoch, journal.epoch)
      const rows = db.prepare('SELECT seq,ts,row_json FROM journal_rows WHERE session_id=? AND epoch=? ORDER BY seq').all(original.source.native_session_id, journal.epoch)
      assert.ok(rows.length <= 100_000 && rows.reduce((total, row) => total + Buffer.byteLength(row.row_json), 0) <= 12 * 1024 * 1024)
      return rows
    })
    assert.deepEqual(journal.rows.map(row => ({ seq: row.seq, ts: row.ts, row: row.row })), actual.map(row => ({ seq: row.seq, ts: row.ts, row: protocol.parseStrictPiJson(row.row_json) })), 'question_export_journal_differs')
    const fold = journalFold({ sessionId: original.source.native_session_id, epoch: journal.epoch })
    for (const row of actual) assert.equal(fold.add({ seq: row.seq, ts: row.ts, rowJson: row.row_json }), true)
    const state = fold.finish(); assert.equal(state.damage, null); assert.equal(state.newer, null)
    for (const submission of state.state.submissions.values()) assert.ok(!['pending', 'unknown'].includes(submission.dispatchState), 'question_native_input_unresolved_at_export')
    const bindings = [original.binding]
    if (phase.resume_command && original === phase.workers[0]) {
      const resumed = originalRequest(phase.resume_command.request_id, phase)
      assert.equal(resumed?.state, 'completed'); assert.equal(resumed.method, 'swa.controllerDeliver')
      assert.equal(resumed.receipt.action, 'question.resume')
      assert.deepEqual(resumed.receipt.invocation.command, phase.resume_command)
      assert.equal(resumed.receipt.invocation.caller.kind, 'human')
      assert.equal(resumed.receipt.invocation.input.text, observer.questionResumeBody(phase.question_id))
      const binding = object(resumed.receipt.swa_input_binding)
      assert.equal(binding.parent_request, phase.resume_command.request_id); assert.equal(binding.child_request, `${phase.resume_command.request_id}/native`)
      assert.equal(binding.dispatch_id, original.dispatch_id); assert.equal(binding.session_id, original.source.native_session_id); assert.equal(binding.runtime_fence, original.binding.runtime_fence)
      assert.deepEqual(binding.body, { kind: 'message', role: 'user', blocks: [{ type: 'text', text: observer.questionResumeBody(phase.question_id) }] })
      bindings.push(binding)
    }
    assert.equal(state.state.submissions.size, bindings.length, 'question_unplanned_model_input')
    for (const binding of bindings) {
      const current = object((await cli(['request', 'show', '--controller', phase.controller, '--request-id', binding.parent_request])).reply.result.current_input)
      assert.equal(current.state, 'accepted'); assert.deepEqual(current.binding, binding)
      const submission = state.state.submissions.get(binding.operation_id), receipt = state.state.receipts.get(binding.operation_id)
      assert.deepEqual(current.submission, submission)
      assert.equal(submission?.dispatchState, 'accepted'); assert.equal(submission.fence, binding.runtime_fence)
      assert.equal(submission.payloadFingerprint, observer.fingerprintPiBody(binding.session_id, binding.body))
      assert.equal(submission.clientMessageId, binding.operation_id); assert.equal(receipt?.clientMessageId, binding.operation_id)
      assert.equal(receipt.providerItemId, submission.providerItemId); assert.equal(receipt.cursor.epoch, journal.epoch)
      const item = state.state.items.get(state.state.aliases.get(submission.providerItemId) ?? submission.providerItemId)
      assert.equal(item?.body.kind, 'message'); assert.equal(item.body.role, 'user'); assert.deepEqual(item.body.blocks, binding.body.blocks)
      assert.equal(state.state.itemFences.get(item.itemId), binding.runtime_fence)
      const prompts = original.source_check.view.prompts.filter(prompt => prompt.cid === binding.operation_id)
      assert.equal(prompts.length, 1); assert.deepEqual(prompts[0].write.detail.binding, binding)
      assert.ok(prompts[0].echo && prompts[0].write.settled && prompts[0].write.reply)
    }
  }
  if (expectedCode === 0) {
    const answer = view.answered_questions.find(row => row.question_id === phase.question_id)
    assert.ok(answer && answer.read_state === 'read_observed', 'question_released_read_history_missing')
    assert.equal(answer.answer, preparedCase.answer.body)
    assert.ok(phase.workers[0].source_check.reads.length > 0, 'question_exact_tool_result_missing')
    assert.ok(phase.workers[0].source_check.followup.some(turn => turn.complete && turn.question_id === phase.question_id), 'question_followup_turn_missing')
  }
  phase.completed_exit_code = expectedCode
  phase.verified_complete = true
  await save(`phase-${phase.name}.json`, phase)
  return phase
}
let preparedCase
async function businessReview(phase) {
  const path = await save(`actual-result-${phase.name}.json`, phase.exported)
  process.stdout.write(JSON.stringify({ state: 'ACTUAL_BUSINESS_REVIEW_REQUIRED', result: path, phase: phase.name, input: '真实审阅者读取成果后回复一行JSON：reviewed_result、accepted:boolean、checked_result（至少40字）。不自动生成通过意见。' }) + '\n')
  const lines = createInterface({ input: process.stdin, terminal: false, crlfDelay: Infinity })
  let line
  try { line = await Promise.race([new Promise((resolveLine, reject) => { lines.once('line', resolveLine); lines.once('close', () => reject(new NotRun('question_business_review_not_supplied'))) }), delay(remaining(10 * 60_000), undefined, { ref: false }).then(() => { throw new NotRun('question_business_review_deadline') })]) }
  finally { lines.close() }
  assert.ok(Buffer.byteLength(line) <= 64 * 1024, 'question_review_bound')
  const review = object(protocol.parseStrictPiJson(safeText(line)))
  assert.deepEqual(Object.keys(review).sort(), ['accepted', 'checked_result', 'reviewed_result'])
  assert.equal(review.reviewed_result, path); assert.equal(typeof review.accepted, 'boolean'); assert.ok(typeof review.checked_result === 'string' && review.checked_result.trim().length >= 40)
  phase.business_review = review; await save(`phase-${phase.name}.review.json`, review)
  assert.equal(review.accepted, true, 'question_actual_business_review_rejected')
}
async function scenarioA(definition) {
  const phase = await startPhase(definition)
  await gui.call('reload')
  await answerInGui(phase, preparedCase.answer.body)
  await finishPhase(phase)
  const before = phase.workers[0].native.entries.length, answerId = phase.workers[0].answer.id
  const replay = await gui.call('command', { command: phase.answer_command })
  assert.equal(replay.reply?.ok, true); assert.equal(replay.resolved, true)
  phase.answer_replay = replay
  const duplicate = await cli(['question', 'answer', '--controller', phase.controller, '--run', phase.run_id, '--task', phase.root_task_id, '--dispatch', phase.workers[0].dispatch_id, '--question', phase.question_id, '--input-file', join(inputRoot, preparedCase.answer.file), '--request-id', randomUUID()])
  phase.cli_duplicate = duplicate.reply
  const actual = await workerSources(phase, phase.workers[0])
  assert.equal(actual.answer.id, answerId); assert.equal(actual.answer.body, preparedCase.answer.body); assert.equal(actual.native.entries.length, before, 'question_duplicate_sent_new_model_input')
  await observeRun(phase, [0]); await gui.call('observe')
  await businessReview(phase)
  return phase
}
async function scenarioB(definition) {
  const phase = await startPhase(definition), input = definition.inputs[1]
  const requestId = randomUUID(), inputFile = join(inputRoot, definition.name, input.file)
  const started = await cli(['worker', 'start', '--controller', phase.controller, '--task', phase.root_task_id, '--name', input.name, '--agent', 'pi', '--model', values.model, '--question-mode', 'native', '--input-file', inputFile, '--request-id', requestId])
  assert.equal(started.reply.run_id, phase.run_id)
  const worker = { request_id: requestId, dispatch_id: started.reply.dispatch_id, input_file: inputFile }
  assert.equal(typeof worker.dispatch_id, 'string'); phase.workers.push(worker)
  await waitUntil('question_other_task_not_settled_while_pending', async () => observeRun(phase), value => {
    assert.equal(value.view.status, 'waiting_input'); assert.equal(value.view.questions[0]?.id, phase.question_id)
    assert.ok(!value.view.blockers.some(row => row.kind === 'unknown'), 'question_known_wait_became_unknown')
    const actual = value.view.dispatches.find(row => row.id === worker.dispatch_id)
    return actual?.release_state === 'released' && actual.worker_state === 'succeeded'
  })
  await workerSources(phase, worker)
  assert.equal(worker.question, null, 'question_independent_worker_asked_unplanned_question')
  const timeout = await cli([...runArgs(phase), '--on-input', 'wait', '--timeout', '1s'], { codes: [8] })
  const cancel = await cli([...runArgs(phase), '--on-input', 'wait', '--timeout', '30s'], { codes: [130], cancelOnProgress: true })
  phase.cli_observation_timeout = timeout.reply; phase.cli_observation_cancel = cancel.reply
  await waitUntil('question_original_six_hundred_second_timeout_missing', async () => workerSources(phase, phase.workers[0]), value => value.source_check.waiting.some(row => row.timed_out && row.timeout_ms === 600_000 && row.cycle_idle_sequence !== null), 12 * 60_000)
  for (const waited of phase.workers[0].source_check.waiting.filter(row => row.timed_out)) {
    assert.equal(waited.timeout_ms, 600_000); assert.ok(waited.started_sequence && waited.result_sequence && waited.cycle_idle_sequence)
    const rows = phase.workers[0].trace
    assert.ok(rows[waited.result_sequence - 1].monotonic_ms - rows[waited.started_sequence - 1].monotonic_ms >= waited.timeout_ms, 'question_original_wait_shorter_than_six_hundred_seconds')
  }
  const originalQuestion = phase.workers[0].question
  assert.equal(originalQuestion.status, 'pending')
  phase.original_timeout = phase.workers[0].source_check.waiting
  await answerInGui(phase, preparedCase.answer.body)
  await waitUntil('question_continuation_eligibility_not_observed', async () => observeRun(phase), value => value.view.answered_questions.some(row => row.question_id === phase.question_id && row.continuation_required), 180_000)
  const shown = await gui.call('observe')
  assert.ok(shown.view.answered_questions.some(row => row.question_id === phase.question_id && row.continuation_required))
  const resumed = await gui.call('resume', { question_id: phase.question_id, dispatch_id: phase.workers[0].dispatch_id, disconnect_after_post: true })
  assert.ok(resumed.request_id && resumed.command)
  phase.disconnect = resumed.disconnect
  if (resumed.disconnect?.requested || resumed.pending || resumed.http_unknown || resumed.gui_unknown) {
    phase.resume_recovery = await gui.call('recover')
    assert.equal(phase.resume_recovery.pending, null, 'question_resume_original_request_unresolved')
    assert.ok(phase.resume_recovery.resolved && !phase.resume_recovery.http_unknown && !phase.resume_recovery.gui_unknown && !phase.resume_recovery.settings_unknown && !phase.resume_recovery.offline, 'question_resume_original_request_unknown')
  }
  phase.resume_command = resumed.command; phase.resume_result = resumed
  assert.notEqual(resumed.request_id, phase.answer_command.request_id)
  await finishPhase(phase)
  const before = phase.workers[0].native.entries.length
  phase.resume_replay = await gui.call('command', { command: resumed.command })
  assert.equal(phase.resume_replay.reply?.ok, true); assert.equal(phase.resume_replay.resolved, true)
  await workerSources(phase, phase.workers[0])
  assert.equal(phase.workers[0].native.entries.length, before, 'question_resume_replay_sent_second_input')
  const resumedRead = phase.workers[0].source_check.reads.find(row => row.question_id === phase.question_id && phase.workers[0].question_receipts.some(receipt => receipt.request_id === row.request_id && receipt.receipt.params?.resume === phase.question_id))
  assert.ok(resumedRead, 'question_actual_resume_tool_did_not_read_original_answer')
  await businessReview(phase)
  await closePhase(phase)
  return phase
}
async function scenarioC(definition) {
  const phase = await startPhase(definition), worker = phase.workers[0]
  const requestId = randomUUID(); worker.stop_request = requestId
  const stopped = await cli(['worker', 'stop', '--controller', phase.controller, '--dispatch', worker.dispatch_id, '--request-id', requestId])
  worker.stop_reply = stopped.reply
  assert.equal(native(stopped.reply).state, 'stopped')
  await finishPhase(phase, 7)
  assert.equal(worker.question.status, 'closed'); assert.equal(worker.answer, null)
  assert.equal(phase.view.answered_questions.length, 0)
  if (worker.source_check.waiting.some(row => row.cancelled || row.connection_lost)) check('actual_stop_tool_cancellation_observed', { dispatch_id: worker.dispatch_id })
  await closePhase(phase)
  return phase
}
async function closePhase(phase) {
  phase.close_request = randomUUID()
  phase.controller_close = (await cli(['controller', 'close', '--controller', phase.controller, '--request-id', phase.close_request])).reply
  const original = originalRequest(phase.close_request)
  assert.equal(original?.method, 'swa.controllerClose'); assert.equal(original.state, 'completed')
  assert.equal(original.receipt.project_id, values['project-id']); assert.equal(original.receipt.controller, phase.controller)
  assert.equal(original.receipt.close?.handle, phase.controller); assert.equal(original.receipt.close?.ptyKilled, true)
  phase.controller_closed = true
}
async function setup() {
  installation = await ordinary(values.candidate, true); dataRoot = await ordinary(values['data-root'], true, true); project = await ordinary(values.project, true)
  assert.equal(project, '/workspace/swa-public-question-case-20261023/public-project')
  output = resolve(values.output); await ordinary(dirname(output), true, true)
  for (const [left, right] of [[installation, dataRoot], [installation, project], [dataRoot, project], [output, dataRoot], [output, project], [output, installation]]) assert.ok(!inside(left, right) && !inside(right, left), 'question_roots_overlap')
  await mkdir(output, { mode: 0o700 })
  node = join(installation, 'node/node'); swa = join(installation, 'swa')
  assert.equal(await realpath(process.execPath), node)
  const running = await stat('/proc/self/exe', { bigint: true }), installed = await stat(node, { bigint: true }); assert.equal(`${running.dev}:${running.ino}`, `${installed.dev}:${installed.ino}`)
  assert.equal((await pin(join(installation, 'PLATFORM'))).toString('utf8').trim(), 'linux-x64-glibc')
  assert.equal((await pin(join(installation, 'EDITION'))).toString('utf8').trim(), 'combined')
  revision = (await pin(join(installation, 'VERSION'))).toString('ascii').trim(); assert.match(revision, /^[a-f0-9]{40}$/)
  assert.equal(execFileSync(swa, ['--version'], { encoding: 'utf8', env: minimalEnv(), timeout: 5000, maxBuffer: 4096 }).trim(), revision)
  report.source_revision = revision
  const repository = await ordinary(values['source-repository'], true)
  for (const name of ['run-question-installed.mjs', 'question-case-definition.mjs', 'public-case-definition.mjs', 'pi-question-event-view.mjs', 'pi-event-view.mjs', 'codex-event-view.mjs', 'driver-failure.mjs', 'prepare-source-observer.mjs', 'pi-source-observer-entry.ts', 'extract-observer-source.py']) {
    const path = join(repository, 'tests/swa-product-acceptance', name), actual = await pin(path)
    assert.ok(actual.equals(execFileSync('git', ['--no-pager', 'show', `${revision}:tests/swa-product-acceptance/${name}`], { cwd: repository, env: minimalEnv(), timeout: 30_000, maxBuffer: 1024 * 1024 })), 'question_driver_differs_from_installed_revision')
  }
  assert.equal(values['gui-driver'], join(repository, '.verification/cloud-setup/question-gui-installed.mjs'))
  assert.equal(sha(await pin(values['gui-driver'])), values['gui-sha256'])
  runtimeRequire = createRequire(join(installation, 'runtime/package.json')); protocol = runtimeRequire('./pi-protocol.cjs')
  sourceReader = runtimeRequire('./task-result.cjs').readProviderTraceObservation
  journalFold = runtimeRequire('./journal-open.cjs').startJournalRowFold
  owned = protocol.parseStrictPiJson((await pin(values['owner-handoff'])).toString('utf8'))
  assert.equal(owned.status, 'SERVICE_BASELINE_OBSERVED')
  for (const [key, expected] of Object.entries({ installation, source_revision: revision, data_root: dataRoot, endpoint: values.endpoint, ready_file: values['service-ready-record'], ready_sha256: values['service-ready-sha256'], launch_record_file: values['pi-launch-record'], launch_record_sha256: values['pi-launch-sha256'] })) assert.equal(owned[key], expected, 'question_owner_handoff_changed')
  assert.equal(dirname(output), owned.evidence_root)
  deadline = Math.min(Date.parse(owned.hold_until) - 5 * 60_000, Date.now() + 45 * 60_000)
  cleanupDeadline = Date.parse(owned.hold_until) - 30_000
  remaining(); assert.ok(deadline - Date.now() >= (report.scenario === 'full' ? 25 : 10) * 60_000, 'question_owner_window_too_short')
  runtimeId = owned.expected_runtime_id; uuid(runtimeId)
  Object.assign(report, { installation, data_root: dataRoot, runtime_id: runtimeId, project_id: values['project-id'] })
  if (report.scenario === 'answer-conflict') {
    await ordinary(values['question-baseline-file'], false, true)
    const content = await pin(values['question-baseline-file'])
    assert.equal(sha(content), values['question-baseline-sha256'], 'question_main_baseline_bytes_changed')
    const baseline = object(protocol.parseStrictPiJson(content.toString('utf8')))
    assert.equal(baseline.schema, 'swa.question-acceptance-baseline.v1'); assert.equal(baseline.scenario, 'full'); assert.equal(baseline.baseline_eligible, true)
    assert.equal(baseline.source_revision, revision); assert.equal(baseline.installation, installation)
    for (const [key, value] of Object.entries({ data_root: dataRoot, runtime_id: runtimeId, project_id: values['project-id'] })) assert.ok(typeof baseline[key] === 'string' && baseline[key] && baseline[key] !== value, 'question_conflict_requires_independent_service_and_project')
    assert.deepEqual(baseline.phases.map(phase => [phase.name, phase.exit_code, phase.complete, phase.released, phase.business_reviewed, phase.read_observed]), [['a', 0, true, true, true, true], ['b', 0, true, true, true, true], ['c', 7, true, true, null, null]])
    assert.equal(baseline.terminal?.kind, 'revoked-send'); assert.equal(baseline.terminal.actual_rejection, true); assert.equal(baseline.controllers_closed, true)
    report.baseline_reference = { path: values['question-baseline-file'], sha256: values['question-baseline-sha256'], actual: baseline }
    report.not_run.push('scenario_b_six_hundred_second_timeout_resume', 'scenario_c_active_question_stop', 'revoked_send_terminal')
  } else report.not_run.push('different_answer_conflict_terminal')
  const launchBytes = await pin(values['pi-launch-record']); assert.equal(sha(launchBytes), values['pi-launch-sha256'])
  launch = validatePiLaunchRecord(protocol.parseStrictPiJson(launchBytes.toString('utf8')), { installation, source_revision: revision, data_root: dataRoot, endpoint: values.endpoint })
  assert.equal(launch.serve_pid, owned.serve_pid); assert.equal(launch.pi_source_home, owned.pi_source_home)
  const readyBytes = await pin(values['service-ready-record']); assert.equal(sha(readyBytes), values['service-ready-sha256'])
  ready = validateLinuxServiceReady(protocol.parseStrictPiJson(readyBytes.toString('utf8')), { installation, endpoint: values.endpoint, data_root: dataRoot, runtime_id: runtimeId, node })
  for (const [path, directory] of [[owned.pi_source_home, true], ...['auth.json', 'models.json', 'settings.json'].map(name => [join(owned.pi_source_home, name), false])]) {
    await ordinary(path, directory, true); sourcePins.set(path, { directory, version: version(await stat(path, { bigint: true })) })
  }
  for (const root of [installation, dataRoot, project, output, repository]) assert.ok(!inside(root, owned.pi_source_home) && !inside(owned.pi_source_home, root), 'question_account_source_overlap')
  await pin(join(installation, 'runtime/pi-question-extension.mjs'))
  const observerRoot = join(output, 'source-observer')
  execFileSync(node, [join(repository, 'tests/swa-product-acceptance/prepare-source-observer.mjs'), '--candidate', installation, '--source-repository', repository, '--output', observerRoot, '--profile', 'stepfun-pi-questions'], { cwd: repository, env: minimalEnv(), timeout: 90_000, maxBuffer: 16 * 1024 })
  const manifest = protocol.parseStrictPiJson((await bytes(join(observerRoot, 'manifest.json'), 4 * 1024 * 1024)).content.toString('utf8'))
  assert.equal(manifest.installed_revision, revision); assert.equal(manifest.profile, 'stepfun-pi-questions')
  for (const entry of [...manifest.inputs, manifest.journal_module, manifest.observer, manifest.protocol_module, manifest.protocol_metafile]) {
    assert.ok(inside(observerRoot, entry.path) || inside(join(installation, 'runtime'), entry.path), 'question_observer_source_outside_installation')
    const actual = await pin(entry.path, 8 * 1024 * 1024); assert.equal(sha(actual), entry.sha256); assert.equal(filePins.get(entry.path).version, entry.version)
  }
  observer = createRequire(manifest.observer.path)(manifest.observer.path)
  const daemon = protocol.parseStrictPiJson((await bytes(join(dataRoot, 'daemon/daemon-v49.pid'), 64 * 1024, true)).content.toString('utf8'))
  assert.equal(daemon.swa_service_job.source_revision, revision); assert.equal(daemon.swa_service_job.serve_pid, owned.serve_pid)
  const daemonProcess = observer.observeIncarnation(daemon.pid), serveProcess = observer.observeIncarnation(owned.serve_pid)
  assert.equal(daemonProcess.absent, false); assert.equal(serveProcess.absent, false)
  for (const [current, ticks] of [[daemonProcess.incarnation, daemon.swa_service_job.daemon_start_ticks], [serveProcess.incarnation, daemon.swa_service_job.serve_start_ticks]]) {
    assert.equal(current.start_ticks, ticks); assert.equal(current.boot_id, daemon.swa_service_job.boot_id); assert.equal(current.owner_uid, daemon.swa_service_job.owner_uid)
  }
  custodianInput = { daemon: daemonProcess.incarnation, serve: serveProcess.incarnation, runtime_pid: ready.runtime_pid, node_executable: node, serve_executable: swa }
  runtimeCustodian = observer.observeRuntimeCustodian(custodianInput)
  const proof = readPiPrivateJson(owned.live_proof_file, 64 * 1024, protocol.parseStrictPiJson)
  assert.equal(sha(proof.bytes), owned.live_proof_sha256); await pin(owned.live_proof_file)
  assert.equal(proof.value.type, 'process_tree_observed'); assert.equal(proof.value.root_pid, owned.serve_pid)
  assert.equal(proof.value.boot_id, daemon.swa_service_job.boot_id)
  for (const process of [serveProcess.incarnation, daemonProcess.incarnation, runtimeCustodian]) assert.ok(proof.value.members.some(member => member.pid === process.pid && member.start_ticks === process.start_ticks), 'question_original_custody_proof_missing_member')
  await assertOwned()
  inputRoot = join(project, '.verification/swa-question-input')
  const source = protocol.parseStrictPiJson((await bytes(join(inputRoot, 'source.json'))).content.toString('utf8'))
  assert.equal(source.project_root, project); assert.equal(source.source, publicSource); assert.equal(source.revision, publicRevision)
  assert.deepEqual(source.originals.map(row => row.path), publicFiles)
  for (const original of source.originals) {
    assert.equal(original.source_revision, publicRevision)
    assert.equal((await bytes(join(project, original.path))).content.toString('utf8'), original.text)
    assert.equal(execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${join(dirname(project), 'empty-hooks')}`, '-C', project, 'show', `${publicRevision}:${original.path}`], { env: minimalEnv(), encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024 }), original.text)
  }
  preparedCase = questionCase(source.originals)
  for (const stage of preparedCase.stages) {
    const directory = join(inputRoot, stage.name), specPath = join(directory, 'task.json'), specBytes = (await bytes(specPath)).content.toString('utf8')
    assert.deepEqual(protocol.parseStrictPiJson(specBytes), stage.spec); approved.set(specPath, specBytes)
    for (const input of stage.inputs) { const path = join(directory, input.file); assert.equal((await bytes(path)).content.toString('utf8'), input.body); approved.set(path, input.body) }
  }
  const answerPath = join(inputRoot, preparedCase.answer.file); assert.equal((await bytes(answerPath)).content.toString('utf8'), preparedCase.answer.body); approved.set(answerPath, preparedCase.answer.body)
  if (!token) throw new NotRun('question_project_token_missing')
  const status = (await cli(['status'])).reply; assert.equal(status.runtime_id, runtimeId)
  database = status.result.databases.find(row => row.name === 'main')?.file
  assert.ok(database && inside(dataRoot, await ordinary(database, false, true)))
  const capabilities = (await cli(['capabilities'])).reply.result, agent = capabilities.agents.find(row => row.id === 'pi')
  assert.equal(capabilities.source_revision, revision)
  for (const observation of [agent?.registered, agent?.enabled, agent?.installed, agent?.configured, agent?.control?.start, agent?.control?.send, agent?.control?.stop, agent?.control?.questions]) assert.equal(observation?.status, 'available', 'question_actual_capability_unavailable')
  assert.equal(agent.installed.version, '1.0.1'); assert.equal(agent.configured.provider, 'stepfun'); assert.equal(agent.configured.model, values.model); assert.equal(agent.configured.account_source, 'pi-api-key-file')
  piExecutable = await ordinary(agent.installed.executable); settingsRevision = agent.requirements.settings_revision
  gui = await startGui()
  check('fixed_installation_source_and_project', { source_revision: revision, public_revision: publicRevision, runtime_id: runtimeId, question_mode: 'native', model: values.model, settings_revision: settingsRevision })
}
async function cleanupFailure() {
  cleaning = true
  await Promise.allSettled([...issued])
  for (const pending of report.unknown_requests) {
    const controller = pending.command?.controller ?? (pending.args?.includes('--controller') ? pending.args[pending.args.indexOf('--controller') + 1] : null)
    try { pending.observation = (await cli(['request', 'show', ...(controller ? ['--controller', controller] : ['--project', values['project-id']]), '--request-id', pending.request_id])).reply }
    catch { pending.recovery = 'UNKNOWN_ORIGINAL_REQUEST_PRESERVED' }
  }
  if (gui) {
    try { report.gui_recovery = await gui.call('recover', {}, true) } catch { report.gui_recovery = 'UNKNOWN' }
    const a = report.phases[0]
    if (a && !a.close_request && report.gui_recovery?.settings_unknown && report.phases.length === 3 && report.phases.every(phase => phase.verified_complete && phase.workers.every(worker => worker.record?.lease.claimStatus === 'released'))) {
      try {
        a.close_request = randomUUID()
        a.controller_close = await gui.call('command', { command: { action: 'controller.close', controller: a.controller, request_id: a.close_request } }, true)
        a.controller_closed = a.controller_close.reply?.ok === true && a.controller_close.resolved === true
      } catch { a.controller_closed = false }
    }
  }
  for (const phase of report.phases) for (const worker of phase.workers) {
    if (worker.record?.lease.claimStatus === 'released') continue
    if (worker.stop_request) { report.checks.push({ name: 'cleanup_original_stop_preserved', status: 'UNKNOWN', dispatch_id: worker.dispatch_id, request_id: worker.stop_request }); continue }
    try {
      worker.stop_request = randomUUID()
      worker.stop_reply = (await cli(['worker', 'stop', '--controller', phase.controller, '--dispatch', worker.dispatch_id, '--request-id', worker.stop_request])).reply
      assert.equal(native(worker.stop_reply).state, 'stopped')
      await workerSources(phase, worker)
    } catch { report.checks.push({ name: 'cleanup_worker', status: 'UNKNOWN', dispatch_id: worker.dispatch_id, request_id: worker.stop_request }) }
  }
}
async function terminalCase(phase) {
  const worker = phase.workers[0], previousAnswer = { ...worker.answer }, priorNative = worker.native.entries
  if (report.scenario === 'full') {
    report.send_revocation = await gui.call('revoke_send', { expected_revision: settingsRevision })
    assert.equal(report.send_revocation.revoked_confirmed, true); assert.equal(report.send_revocation.settings_unknown, null)
  }
  const kind = report.scenario === 'full' ? 'revoked-send' : 'answer-conflict', expectedCode = report.scenario === 'full' ? 'approval_required' : 'answer_conflict'
  const command = answerCommand(phase, report.scenario === 'full' ? preparedCase.answer.body : '改为原地排序，覆盖原答案。')
  const actual = await gui.call('command', { command }, true)
  report.terminal = { kind, request_id: command.request_id, command, expected_error_code: expectedCode, actual_rejection: false, response: actual }
  assert.equal(actual.command?.request_id, command.request_id); assert.ok(actual.reply && actual.reply.ok !== true)
  assert.equal(actual.reply.error?.code, expectedCode, 'question_terminal_expected_rejection_not_observed')
  assert.equal(actual.terminal_case?.request_id, command.request_id); assert.equal(actual.terminal_case.actual_error_code, expectedCode)
  const inventory = questionInventory(phase, worker.dispatch_id), currentNative = await nativeRows(worker.record.head.handle.nativeId)
  assert.deepEqual(inventory.answer, previousAnswer); assert.equal(inventory.question.status, 'answered')
  assert.deepEqual(currentNative.entries, priorNative, 'question_terminal_sent_new_model_input')
  assert.deepEqual(await recordOf(worker.source), { record: worker.record, journalEpoch: worker.journal_epoch }, 'question_terminal_changed_released_record')
  report.terminal.actual_rejection = true
  report.terminal.unresolved = !!(actual.http_unknown || actual.pending || actual.gui_unknown || actual.settings_unknown)
  if (report.terminal.unresolved) report.unknown_requests.push({ request_id: command.request_id, command, recovery: 'NO_COMPLETE_NO_EFFECT_RECEIPT_ORIGINAL_REQUEST_PRESERVED' })
  phase.close_request = randomUUID()
  phase.controller_close = await gui.call('command', { command: { action: 'controller.close', controller: phase.controller, request_id: phase.close_request } })
  assert.equal(phase.controller_close.reply?.ok, true, 'question_final_controller_close_unconfirmed'); assert.equal(phase.controller_close.resolved, true)
  phase.controller_closed = true
  assert.equal(phase.controller_close.http_unknown?.request_id, actual.http_unknown?.request_id, 'question_close_cleared_terminal_request')
}
function baselineReport() {
  const phases = report.phases.map(phase => ({ name: phase.name, run_id: phase.run_id, root_task_id: phase.root_task_id, question_id: phase.question_id,
    dispatch_ids: phase.workers.map(worker => worker.dispatch_id), exit_code: phase.completed_exit_code ?? null, complete: phase.verified_complete === true,
    released: phase.workers.length === phase.spec.initial_workers && phase.workers.every(worker => worker.release?.state === 'completed' && worker.release.resource.release_state === 'released'),
    business_reviewed: phase.name === 'c' ? null : phase.business_review?.accepted === true,
    read_observed: phase.name === 'c' ? null : phase.view?.answered_questions.some(row => row.question_id === phase.question_id && row.read_state === 'read_observed') === true }))
  const controllersClosed = report.phases.length > 0 && report.phases.every(phase => phase.controller_closed === true)
  return { schema: 'swa.question-acceptance-baseline.v1', scenario: report.scenario, source_revision: revision ?? null, installation: installation ?? null,
    data_root: dataRoot ?? null, runtime_id: runtimeId ?? null, project_id: values['project-id'], main_report: join(output, 'report.json'), phases,
    terminal: report.terminal ? { kind: report.terminal.kind, request_id: report.terminal.request_id, actual_rejection: report.terminal.actual_rejection, unresolved: report.terminal.unresolved ?? true } : null,
    controllers_closed: controllersClosed,
    baseline_eligible: report.scenario === 'full' && ['EXECUTED_ASSERTIONS_COMPLETED', 'COMPLETED_WITH_UNRESOLVED_REQUEST'].includes(report.status) && phases.length === 3 && phases.every(phase => phase.complete && phase.released && (phase.name === 'c' ? phase.exit_code === 7 : phase.exit_code === 0 && phase.business_reviewed && phase.read_observed)) && report.terminal?.actual_rejection === true && controllersClosed && report.gui_close?.code === 0,
    owner_shutdown: 'REQUIRES_ORIGINAL_OWNER_PROOF', model_execution: report.model_execution, not_run: report.not_run }
}
try {
  await setup()
  const a = await scenarioA(preparedCase.stages[0])
  if (report.scenario === 'full') { await scenarioB(preparedCase.stages[1]); await scenarioC(preparedCase.stages[2]); await guiAttach(a) }
  await terminalCase(a)
  report.status = report.terminal.unresolved ? 'COMPLETED_WITH_UNRESOLVED_REQUEST' : 'EXECUTED_ASSERTIONS_COMPLETED'
  if (report.terminal.unresolved) process.exitCode = 3
  await assertOwned()
} catch (error) {
  report.status = error instanceof NotRun ? report.model_execution === 'NOT_RUN' ? 'NOT_RUN' : 'INCOMPLETE' : 'FAIL'; report.failure = driverFailure(error, import.meta.url)
  if (error instanceof NotRun) report.not_run.push(report.failure.label ?? 'required_business_review')
  process.exitCode = error instanceof NotRun ? 3 : 1
  if (output && observer && runtimeCustodian && token) await cleanupFailure()
} finally {
  for (const child of observers) if (child.exitCode === null) child.kill('SIGTERM')
  if (gui) {
    try { await gui.call('quit'); gui.child.stdin.end(); report.gui_close = await Promise.race([gui.closed, delay(5000, { state: 'UNKNOWN' })]) }
    catch { gui.child.stdin.end(); report.gui_close = 'UNKNOWN'; if (gui.child.exitCode === null) gui.child.kill('SIGTERM') }
  }
  else if (guiChild) { guiChild.stdin.end(); if (guiChild.exitCode === null) guiChild.kill('SIGTERM') }
  if (output) {
    try { await save('report.json', report); await save('question-baseline.json', baselineReport()); process.stdout.write(JSON.stringify({ state: report.status, result: join(output, 'report.json'), service_shutdown: report.service_shutdown }) + '\n') }
    catch { process.stderr.write('question_final_evidence_write_failed\n'); process.exitCode = 1 }
  }
}
