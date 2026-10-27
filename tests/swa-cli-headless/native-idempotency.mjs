import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: Object.fromEntries(['candidate', 'data-root', 'project', 'project-id', 'endpoint', 'output', 'case'].map(key => [key, { type: 'string' }])), allowPositionals: false })
assert.ok(values.case === undefined || ['idempotency', 'storage', 'disconnect'].includes(values.case))
for (const key of ['candidate', 'data-root', 'project', 'output']) assert.ok(values[key] && isAbsolute(values[key]))
assert.ok(values['project-id'] && values.endpoint && process.env.SWA_PROJECT_TOKEN)
const candidate = await realpath(values.candidate), dataRoot = await realpath(values['data-root']), project = await realpath(values.project)
const node = join(candidate, 'node', 'node.exe'), swa = join(candidate, 'swa.exe'), evidence = dirname(values.output)
assert.equal((await realpath(process.execPath)).toLowerCase(), node.toLowerCase())
const revision = (await readFile(join(candidate, 'VERSION'), 'utf8')).trim()
assert.equal(execFileSync(swa, ['--version'], { encoding: 'utf8', windowsHide: true }).trim(), revision)
const input = join(project, '.verification', 'swa-cli-input'), source = JSON.parse(await readFile(join(input, 'source.json'), 'utf8'))
assert.equal(source.revision, 'da3bdddb085808863090a05f60cc1c64415039cf')
assert.equal((await realpath(source.project_root)).toLowerCase(), project.toLowerCase())
const environment = { ...process.env, SWA_ENDPOINT: values.endpoint, SWA_PROJECT_ID: values['project-id'], NODE_OPTIONS: '--max-old-space-size=1024' }
const requireRuntime = createRequire(join(candidate, 'runtime', 'package.json'))
const processAPI = requireRuntime('@vscode/windows-process-tree')
const commands = [], checks = []
let ordinal = 0, runtimeId, database

function launchCLI(args, allowed = [0]) {
  const index = ++ordinal, started = new Date().toISOString()
  const child = spawn(swa, [...args, '--json'], { cwd: project, env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  const stdout = [], stderr = []
  const state = { finished: false, interruptionRequested: false, stdoutBytes: 0 }
  child.stdout.on('data', bytes => { state.stdoutBytes += bytes.length; if (state.stdoutBytes > 16 * 1024 * 1024) child.stdout.destroy(new Error('Actual CLI output exceeds its declared bound')); else stdout.push(bytes) })
  child.stderr.on('data', bytes => { if (Buffer.concat(stderr).length < 256 * 1024) stderr.push(bytes) })
  const exited = new Promise(resolve => {
    const fail = error => { state.finished = true; resolve({ error }) }
    child.once('error', fail)
    child.stdout.once('error', fail)
    child.once('close', (exit, signal) => { state.finished = true; resolve({ exit, signal }) })
  })
  return { child, state, async result() {
    const outcome = await exited
    if (outcome.error) throw outcome.error
    const text = Buffer.concat(stdout).toString('utf8')
    await writeFile(join(evidence, `idempotency-${index}.stdout.json`), text, { flag: 'wx' })
    await writeFile(join(evidence, `idempotency-${index}.stderr.log`), Buffer.concat(stderr), { flag: 'wx' })
    const envelope = state.interruptionRequested || !text.trim() ? null : JSON.parse(text)
    commands.push({ ordinal: index, args, started, ended: new Date().toISOString(), pid: child.pid, ...outcome, request_id: envelope?.request_id ?? null, interruptionRequested: state.interruptionRequested, stdoutBytes: state.stdoutBytes })
    if (!state.interruptionRequested) {
      assert.ok(envelope && allowed.includes(outcome.exit) && !outcome.signal, `Actual CLI failed; preserve idempotency-${index} and the original request`)
      if (outcome.exit === 0) { assert.equal(envelope.ok, true); if (runtimeId) assert.equal(envelope.runtime_id, runtimeId) }
    }
    return { envelope, ...outcome, stdoutBytes: state.stdoutBytes }
  } }
}
async function cli(args, allowed) { return await launchCLI(args, allowed).result() }

function receipt(request, method) {
  const rows = database.prepare('SELECT request_id, method, state, receipt FROM mutation_receipts WHERE caller_fingerprint=? AND request_id=?').all(authority, request)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].method, method)
  assert.equal(rows[0].state, 'completed')
  return { ...rows[0], receipt: JSON.parse(rows[0].receipt) }
}
async function inspect(request, controller) {
  const selector = controller ? ['--controller', controller] : ['--project', values['project-id']]
  const observed = (await cli(['request', 'show', ...selector, '--request-id', request])).envelope.result
  assert.equal(observed.state, 'completed')
  return observed
}
async function mismatch(args) {
  const result = await cli(args, [2])
  assert.equal(result.envelope.ok, false)
  assert.equal(result.envelope.error.code, 'request_mismatch')
}
async function gone(owner) {
  const identities = [owner.process, owner.helper]
  assert.ok(identities.length === 2 && identities.every(row => row.pid > 0 && row.creationTimeMs > 0))
  const samples = []
  for (let index = 0; index < 2; index++) {
    if (index) await setTimeout(75)
    const rows = await new Promise((resolve, reject) => processAPI.getAllProcesses(value => value ? resolve(value) : reject(new Error('Actual native process inventory is unavailable')), 4))
    for (const expected of identities) {
      const row = rows.find(item => item.pid === expected.pid)
      assert.ok(!row || row.creationTimeMs !== undefined && row.creationTimeMs !== expected.creationTimeMs)
    }
    samples.push({ utc: new Date().toISOString(), expected: identities, observed: rows.filter(row => identities.some(old => old.pid === row.pid)) })
  }
  return samples
}

const status = (await cli(['status'])).envelope
runtimeId = status.runtime_id
const authority = status.authority_domain, dbPath = status.result.databases.find(row => row.name === 'main')?.file
assert.ok(authority && dbPath)
const rel = relative(dataRoot, await realpath(dbPath))
assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel))
database = new DatabaseSync(dbPath, { readOnly: true })
const remainingCases = ['actual_response_loss_after_each_effect_boundary', 'runtime_restart_pending_queries', 'worker_start_send_concurrent_and_disconnected_replays', 'different_request_close_create_start_interleavings']
try {
  if (values.case === 'storage') {
    const counts = () => ({ runs: database.prepare('SELECT COUNT(*) AS total FROM runs WHERE legacy=0').get().total, legacy_coordinator_runs: database.prepare('SELECT COUNT(*) AS total FROM coordinator_runs').get().total, tasks: database.prepare('SELECT COUNT(*) AS total FROM tasks').get().total })
    const before = counts(), lock = new DatabaseSync(dbPath), refusedR = randomUUID()
    let acquiredAt, refused
    try {
      lock.exec('BEGIN IMMEDIATE')
      acquiredAt = new Date().toISOString()
      refused = await cli(['controller', 'open', '--project', values['project-id'], '--workdir', project, '--request-id', refusedR], [7])
      assert.equal(refused.envelope.ok, false)
      assert.equal(refused.envelope.error.code, 'runtime_error')
      assert.deepEqual(counts(), before)
      assert.equal(database.prepare('SELECT COUNT(*) AS total FROM mutation_receipts WHERE caller_fingerprint=? AND request_id=?').get(authority, refusedR).total, 0)
    } finally {
      if (acquiredAt) lock.exec('ROLLBACK')
      lock.close()
    }
    const queried = (await cli(['request', 'show', '--project', values['project-id'], '--request-id', refusedR])).envelope.result
    assert.equal(queried.state, 'absent')
    const after = (await cli(['status'])).envelope
    assert.equal(after.result.native.liveTabCount, status.result.native.liveTabCount)
    assert.equal(after.result.native.liveLeafCount, status.result.native.liveLeafCount)
    assert.deepEqual(counts(), before)
    await writeFile(values.output, JSON.stringify({ candidate, source_revision: revision, runtime_id: runtimeId, actual_lock: { database: dbPath, statement: 'BEGIN IMMEDIATE', acquired_at: acquiredAt }, request: refusedR, refused, queried, before, after: counts(), commands, model_calls: 0, remainingCases: ['two_slots_and_third_worker_refusal_in_T13', 'post_effect_result_storage_failure', 'actual_natural_low_resources'], scope: 'actual_private_sqlite_write_lock_refusal_before_receipt_and_pty_only' }, null, 2) + '\n', { flag: 'wx' })
  } else if (values.case === 'disconnect') await verifyDisconnect()
  else await verifyIdempotency()
} finally { database.close() }

async function verifyDisconnect() {
  const request = randomUUID(), args = ['controller', 'open', '--project', values['project-id'], '--workdir', project, '--request-id', request]
  const launched = launchCLI(args), clientBirth = processAPI.getProcessCreationTime(launched.child.pid)
  await writeFile(join(evidence, 'disconnect-started.json'), JSON.stringify({ request, args, client: { pid: launched.child.pid, creation_time_ms: clientBirth }, created_at: new Date().toISOString(), acceptance: 'not_yet_observed' }, null, 2) + '\n', { flag: 'wx' })
  const deadline = performance.now() + 150_000
  let accepted, attempted, interrupted = false
  while (performance.now() < deadline && !launched.state.finished) {
    const row = database.prepare('SELECT method, state, receipt FROM mutation_receipts WHERE caller_fingerprint=? AND request_id=?').get(authority, request)
    if (row?.state === 'completed') {
      assert.equal(row.method, 'swa.controllerOpen')
      accepted = { observed_at: new Date().toISOString(), ...row, receipt: JSON.parse(row.receipt) }
      for (const owner of [accepted.receipt.process, accepted.receipt.helper]) {
        assert.ok(owner.pid > 0 && owner.creationTimeMs > 0)
        assert.equal(processAPI.getProcessCreationTime(owner.pid), owner.creationTimeMs)
      }
      const currentBirth = processAPI.getProcessCreationTime(launched.child.pid)
      attempted = { utc: new Date().toISOString(), client: { pid: launched.child.pid, creation_time_ms: clientBirth, observed_creation_time_ms: currentBirth }, stdout_bytes_before: launched.state.stdoutBytes }
      if (clientBirth > 0 && currentBirth === clientBirth && !launched.state.finished && launched.state.stdoutBytes === 0) {
        launched.state.interruptionRequested = true
        interrupted = launched.child.kill()
      }
      break
    }
    await setTimeout(10)
  }
  if (!launched.state.finished && !attempted) {
    await writeFile(values.output, JSON.stringify({ candidate, source_revision: revision, runtime_id: runtimeId, request, client: { pid: launched.child.pid, creation_time_ms: clientBirth }, scope: 'actual_owned_client_unsettled_at_observation_deadline', remainingCases, acceptance: 'INCONCLUSIVE', required_action: 'inspect_original_request_and_exact_owned_client' }, null, 2) + '\n', { flag: 'wx' })
    throw new Error('The real controller open did not reach an observable effect boundary; preserve the live owned client and original request')
  }
  const response = await launched.result()
  const queried = await inspect(request), actual = receipt(request, 'swa.controllerOpen')
  assert.equal(queried.receipt.controller, actual.receipt.controller)
  const confirmed = (await cli(['controller', 'show', '--controller', actual.receipt.controller])).envelope
  assert.deepEqual(confirmed.result.owner.binding, actual.receipt.binding)
  const matched = Boolean(accepted && interrupted && response.stdoutBytes === 0 && (response.exit !== 0 || response.signal))
  const close = await cli(['controller', 'close', '--controller', actual.receipt.controller, '--request-id', randomUUID()])
  const exited = await gone(actual.receipt)
  await writeFile(values.output, JSON.stringify({ candidate, source_revision: revision, runtime_id: runtimeId, request, accepted: accepted ?? null, attempted: attempted ?? null, interrupted, response, queried, actual, confirmed, close, exited, commands, model_calls: 0, coveredCases: matched ? ['actual_completed_pty_effect_before_empty_response_client_disconnect_and_read_only_original_request_query'] : [], inconclusive: matched ? [] : ['The actual effect-before-response-loss window was not observed; no repeated attempt was made'], remainingCases: ['task_create_run_and_root_effect_boundaries', 'worker_start_send_stop_effect_boundaries', 'runtime_restart_pending_queries', 'different_request_close_create_start_interleavings'], scope: 'one_actual_owned_client_disconnect_attempt_only' }, null, 2) + '\n', { flag: 'wx' })
}

async function verifyIdempotency() {
  const openR = randomUUID(), openArgs = ['controller', 'open', '--project', values['project-id'], '--workdir', project, '--request-id', openR]
  const opened = await Promise.all([cli(openArgs), cli(openArgs)])
  const controller = opened[0].envelope.controller
  assert.ok(controller)
  assert.equal(opened[1].envelope.controller, controller)
  assert.equal((await cli(openArgs)).envelope.controller, controller)
  const openReceipt = receipt(openR, 'swa.controllerOpen')
  assert.equal(openReceipt.receipt.controller, controller)
  assert.equal(openReceipt.receipt.client_mutation_id, `${openR}/controller-pty`)
  await inspect(openR)
  await mismatch(['controller', 'open', '--project', values['project-id'], '--workdir', input, '--request-id', openR])
  checks.push({ case: 'controller_open_same_request_concurrent_completed_and_changed_workdir', request: openR, receipt: openReceipt })

  const taskR = randomUUID(), specPath = join(input, `idempotency-${taskR}.json`), contextPath = join(input, `idempotency-${taskR}.txt`)
  const originalContext = await readFile(join(project, 'README.md'))
  await writeFile(contextPath, originalContext, { flag: 'wx' })
  const spec = JSON.parse(await readFile(join(input, 'task.json'), 'utf8'))
  spec.context.files.push(relative(project, contextPath).replaceAll('\\', '/'))
  await writeFile(specPath, JSON.stringify(spec) + '\n', { flag: 'wx' })
  const taskArgs = ['task', 'create', '--controller', controller, '--spec-file', specPath, '--request-id', taskR]
  const created = await Promise.all([cli(taskArgs, [0, 6]), cli(taskArgs, [0, 6])])
  assert.ok(created.some(row => row.exit === 0))
  for (const row of created.filter(row => row.exit === 6)) assert.equal(row.envelope.error.code, 'operation_unknown')
  const replay = (await cli(taskArgs)).envelope
  for (const row of created.filter(row => row.exit === 0)) { assert.equal(row.envelope.run_id, replay.run_id); assert.equal(row.envelope.task_id, replay.task_id) }
  const nativeTask = database.prepare('SELECT id, run_id, spec FROM tasks WHERE id=?').get(replay.task_id)
  assert.ok(nativeTask && nativeTask.run_id === replay.run_id)
  const fixedContext = JSON.parse(nativeTask.spec).context
  assert.ok(fixedContext.id && fixedContext.created_at)
  const taskReceipt = receipt(taskR, 'swa.taskCreate'), observedTask = await inspect(taskR)
  assert.deepEqual(await inspect(taskR, controller), observedTask)
  assert.deepEqual(taskReceipt.receipt.children, [`${taskR}/run-create`, `${taskR}/root-task`])
  assert.deepEqual(observedTask.children.map(row => row.requestId), taskReceipt.receipt.children)
  assert.ok(observedTask.children.every(row => row.state === 'completed'))
  for (const child of taskReceipt.receipt.children) receipt(child, child.endsWith('/run-create') ? 'orchestration.runCreate' : 'orchestration.taskCreate')
  await writeFile(specPath, JSON.stringify({ ...spec, goal: spec.goal + ' 请同时报告准确公开来源。' }) + '\n')
  try { await mismatch(taskArgs) } finally { await writeFile(specPath, JSON.stringify(spec) + '\n') }
  assert.equal((await cli(taskArgs)).envelope.task_id, replay.task_id)
  const beforeContextChange = await stat(contextPath, { bigint: true })
  await writeFile(contextPath, Buffer.concat([originalContext, Buffer.from('\n来源：' + source.source + '\n')]))
  try { await mismatch(taskArgs) } finally { await writeFile(contextPath, originalContext) }
  const restoredContext = await stat(contextPath, { bigint: true })
  assert.deepEqual(await readFile(contextPath), originalContext)
  assert.equal(restoredContext.size, beforeContextChange.size)
  assert.notEqual(restoredContext.mtimeNs, beforeContextChange.mtimeNs)
  await mismatch(taskArgs)
  assert.deepEqual(JSON.parse(database.prepare('SELECT spec FROM tasks WHERE id=?').get(replay.task_id).spec).context, fixedContext)
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM runs WHERE coordinator_handle=? AND legacy=0').get(controller).total, 1)
  const actualRun = database.prepare('SELECT * FROM runs WHERE id=? AND legacy=0').get(replay.run_id)
  assert.ok(actualRun)
  assert.equal(actualRun.coordinator_handle, controller)
  assert.equal(actualRun.coordinator_pane_key, openReceipt.receipt.caller_authority.paneKey)
  assert.equal(actualRun.consumer_generation, replay.result.native.run.consumer_generation)
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM tasks WHERE run_id=? AND parent_id IS NULL').get(replay.run_id).total, 1)
  checks.push({ case: 'task_create_same_request_concurrent_completed_and_changed_spec_or_real_context', request: taskR, receipt: taskReceipt, fixedContext, contextVersionChange: { before_mtime_ns: beforeContextChange.mtimeNs.toString(), restored_mtime_ns: restoredContext.mtimeNs.toString(), size: restoredContext.size.toString(), restored_bytes: 'equal', expected_after_restore: 'request_mismatch' }, concurrentUnknownResponses: created.filter(row => row.exit === 6).length })

  const closeR = randomUUID(), closeArgs = ['controller', 'close', '--controller', controller, '--request-id', closeR]
  await Promise.all([cli(closeArgs), cli(closeArgs)])
  await cli(closeArgs)
  const closed = receipt(closeR, 'swa.controllerClose'), exited = await gone(openReceipt.receipt)
  await inspect(closeR)
  const another = (await cli(['controller', 'open', '--project', values['project-id'], '--workdir', project, '--request-id', randomUUID()])).envelope.controller
  assert.ok(another && another !== controller)
  await mismatch(['controller', 'close', '--controller', another, '--request-id', closeR])
  const foreignRequest = await cli(['request', 'show', '--controller', another, '--request-id', taskR], [3])
  assert.equal(foreignRequest.envelope.error.code, 'scope_denied')
  const anotherOwner = (await cli(['controller', 'show', '--controller', another])).envelope.result.owner
  await cli(['controller', 'close', '--controller', another, '--request-id', randomUUID()])
  const anotherExited = await gone(anotherOwner)
  checks.push({ case: 'controller_close_same_request_concurrent_completed_and_other_controller', request: closeR, receipt: closed, exited, anotherExited, foreignRequest })
  await writeFile(values.output, JSON.stringify({ candidate, source_revision: revision, runtime_id: runtimeId, checks, commands, model_calls: 0, remainingCases, scope: 'actual_native_non_model_idempotency_checks_only' }, null, 2) + '\n', { flag: 'wx' })
}
