import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pipeline } from 'node:stream/promises'
import { setTimeout } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { readJSONL } from './read-jsonl.mjs'
import { verifyInstalledProductSource } from './installed-product-source.mjs'

const { values } = parseArgs({ options: Object.fromEntries(['phase', 'config', 'state', 'output', 'readiness', 'current-serve-process'].map(key => [key, { type: 'string' }])), allowPositionals: false })
assert.ok(['prepare', 'observe'].includes(values.phase))
for (const key of ['config', 'state', 'output']) assert.ok(values[key] && isAbsolute(values[key]))
const config = JSON.parse(await readFile(values.config, 'utf8'))
for (const key of ['candidate', 'data_root', 'project_root', 'source_directory', 'evidence_directory', 'service_readiness_file']) assert.ok(isAbsolute(config[key]))
assert.ok(config.project_id && config.agent && config.model && process.env.SWA_PROJECT_TOKEN)
assert.ok(['pi', 'opencode'].includes(config.agent))
const candidate = await realpath(config.candidate), data = await realpath(config.data_root), project = await realpath(config.project_root)
const sourceDirectory = await realpath(config.source_directory), source = (await readFile(join(candidate, 'VERSION'), 'utf8')).trim()
assert.match(source, /^[0-9a-f]{40}$/)
assert.equal((await realpath(process.execPath)).toLowerCase(), join(candidate, 'node', 'node.exe').toLowerCase())
await verifyInstalledProductSource(candidate, sourceDirectory, values.output + '.source-versions.json')
const endpoint = new URL(config.endpoint)
assert.equal(endpoint.protocol, 'http:')
assert.equal(endpoint.hostname, '127.0.0.1')
const environment = { ...process.env, SWA_ENDPOINT: config.endpoint, SWA_PROJECT_ID: config.project_id }
const commands = []
let ordinal = 0
async function cli(args, allowed = [0]) {
  const prefix = join(config.evidence_directory, `restart-${values.phase}-${++ordinal}`)
  const child = spawn(join(candidate, 'swa.exe'), [...args, '--json'], { env: environment, cwd: project, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const stdoutPath = prefix + '.stdout.json'
  const saved = [pipeline(child.stdout, createWriteStream(stdoutPath, { flags: 'wx' })), pipeline(child.stderr, createWriteStream(prefix + '.stderr.log', { flags: 'wx' }))].map(promise => promise.then(() => null, error => error))
  let error = null
  child.once('error', actual => { error = actual })
  const actual = await new Promise(resolve => child.once('close', (exit, signal) => resolve({ pid: child.pid, exit, signal })))
  const failures = await Promise.all(saved)
  assert.ok(failures.every(failure => failure === null), 'The actual CLI streams were not completely saved')
  if (error) throw error
  assert.ok((await stat(stdoutPath)).size <= 16 * 1024 * 1024)
  const reply = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(stdoutPath)))
  commands.push({ args, ...actual, request_id: reply.request_id, actual_stdout: stdoutPath })
  assert.ok(allowed.includes(actual.exit) && actual.signal === null)
  assert.equal(reply.ok, actual.exit === 0)
  return reply
}
async function contained(path) {
  const actual = await realpath(path), suffix = relative(data, actual)
  assert.ok(suffix && suffix !== '..' && !suffix.startsWith('..\\') && !isAbsolute(suffix))
  return actual
}
async function inspection(ownerFile, suffix) {
  const output = join(config.evidence_directory, `restart-${values.phase}-${suffix}.json`)
  execFileSync(process.execPath, [join(candidate, 'runtime', 'controller-inspection.cjs'), '--candidate', candidate, '--data-root', data, '--database', databasePath, '--owner-file', ownerFile, '--output', output], { windowsHide: true, timeout: 15_000 })
  return JSON.parse(await readFile(output, 'utf8'))
}
const status = await cli(['status'])
assert.equal(status.ok, true)
const databasePath = await contained(status.result.databases.find(row => row.name === 'main')?.file)
const db = new DatabaseSync(databasePath, { readOnly: true })
const nativeRow = row => row === undefined ? undefined : JSON.parse(JSON.stringify(row))
const receipts = request => nativeRow(db.prepare('SELECT request_id, method, state, payload_hash, receipt FROM mutation_receipts WHERE caller_fingerprint=? AND request_id=?').get(status.authority_domain, request))
const counts = () => ({ runs: db.prepare('SELECT COUNT(*) AS n FROM runs WHERE legacy=0').get().n, legacy_coordinator_runs: db.prepare('SELECT COUNT(*) AS n FROM coordinator_runs').get().n, tasks: db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, workers: db.prepare('SELECT COUNT(*) AS n FROM worker_dispatches').get().n })
const inputDirectory = join(project, '.verification', 'swa-cli-input')
const fixed = JSON.parse(await readFile(join(inputDirectory, 'source.json'), 'utf8'))
assert.equal(fixed.revision, 'da3bdddb085808863090a05f60cc1c64415039cf')
assert.equal((await realpath(fixed.project_root)).toLowerCase(), project.toLowerCase())
try {
  if (values.phase === 'prepare') {
    const ready = JSON.parse(await readFile(config.service_readiness_file, 'utf8'))
    assert.equal(ready.ok, true)
    assert.equal(ready.readiness.runtimeId, status.runtime_id)
    assert.equal(ready.readiness.dataRoot.toLowerCase(), data.toLowerCase())
    const opened = await cli(['controller', 'open', '--project', config.project_id, '--workdir', project, '--request-id', randomUUID()])
    const ownerFile = join(config.evidence_directory, 'restart-actual-controller-owner.json')
    await writeFile(ownerFile, JSON.stringify(opened, null, 2) + '\n', { flag: 'wx' })
    const created = await cli(['task', 'create', '--controller', opened.controller, '--spec-file', join(inputDirectory, 'task.json'), '--request-id', randomUUID()])
    const actualRun = db.prepare('SELECT * FROM runs WHERE id=? AND legacy=0').get(created.run_id)
    assert.ok(actualRun)
    assert.equal(actualRun.coordinator_handle, opened.controller)
    assert.equal(actualRun.coordinator_pane_key, opened.result.caller_authority.paneKey)
    assert.equal(actualRun.consumer_generation, created.result.native.run.consumer_generation)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE run_id=? AND parent_id IS NULL').get(created.run_id).n, 1)
    const startRequest = randomUUID(), sendRequest = randomUUID()
    const started = await cli(['worker', 'start', '--controller', opened.controller, '--task', created.task_id, '--name', 'restart-observation', '--agent', config.agent, '--model', config.model, '--input-file', join(inputDirectory, 'a.txt'), '--request-id', startRequest])
    const worker = await cli(['worker', 'show', '--controller', opened.controller, '--dispatch', started.dispatch_id])
    const native = worker.result.native, observedSource = native.source
    assert.equal(observedSource.availability, 'observed')
    assert.equal(observedSource.selection.execution_mode, 'structured')
    assert.equal(observedSource.process.runtime_id, status.runtime_id)
    assert.ok(observedSource.process.pid > 0 && observedSource.process.creation_time_ms > 0)
    await cli(['worker', 'send', '--controller', opened.controller, '--dispatch', started.dispatch_id, '--input-file', join(inputDirectory, 'b.txt'), '--request-id', sendRequest])
    let accepted = null
    const deadline = Date.now() + 180_000
    while (Date.now() < deadline) {
      const shown = await cli(['request', 'show', '--controller', opened.controller, '--request-id', sendRequest])
      const current = shown.result.current_input
      if (current?.state === 'accepted') { accepted = current; break }
      assert.ok(current && ['queued', 'journaled'].includes(current.state))
      await setTimeout(250)
    }
    assert.ok(accepted, 'The actual original input did not reach accepted; no restart fault is authorized by this case')
    assert.equal(accepted.dispatch_id, started.dispatch_id)
    assert.equal(accepted.session_id, observedSource.native_session_id)
    assert.equal(accepted.operation_id, accepted.client_message_id)
    assert.equal(accepted.binding.runtime_fence, observedSource.fence)
    const journalPath = await contained(observedSource.journal_database)
    const journal = new DatabaseSync(journalPath, { readOnly: true })
    let originalJournal
    try {
      originalJournal = nativeRow(journal.prepare('SELECT seq, ts, row_json FROM journal_rows WHERE session_id=? AND epoch=? AND seq<=? ORDER BY seq').all(accepted.session_id, accepted.source.epoch, accepted.source.sequence))
      assert.ok(originalJournal.length && originalJournal.at(-1).seq === accepted.source.sequence)
    } finally { journal.close() }
    assert.ok(Buffer.byteLength(JSON.stringify(originalJournal)) <= 16 * 1024 * 1024)
    const eventsPath = await contained(observedSource.provider_events), providerEvents = await readJSONL(candidate, eventsPath)
    const before = await inspection(ownerFile, 'inspection-before')
    const state = { candidate, data_root: data, project_root: project, source_revision: source, authority_domain: status.authority_domain, runtime_id: status.runtime_id, database: databasePath, controller: opened.controller, owner_file: ownerFile, run_id: created.run_id, root_task_id: created.task_id, dispatch_id: started.dispatch_id, start_request: startRequest, send_request: sendRequest, start_receipt: receipts(startRequest), send_receipt: receipts(sendRequest), input: accepted, source: observedSource, journal_file: journalPath, journal_rows: originalJournal, provider_events_file: eventsPath, provider_events: providerEvents, counts: counts(), run: actualRun, root: db.prepare('SELECT * FROM tasks WHERE id=?').get(created.task_id), dispatch: db.prepare('SELECT * FROM dispatch_contexts WHERE id=?').get(started.dispatch_id), worker: db.prepare('SELECT * FROM worker_dispatches WHERE dispatch_id=?').get(started.dispatch_id), resource: db.prepare('SELECT * FROM worker_terminal_resources WHERE owner_dispatch_id=?').get(started.dispatch_id), actual_inspection: before }
    assert.ok(state.start_receipt && state.send_receipt && state.dispatch && state.worker && state.resource)
    await writeFile(values.state, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' })
    const faultFile = join(config.evidence_directory, 'actual-service-fault-request.json')
    await writeFile(faultFile, JSON.stringify({ action: 'stop-service', candidate, data_root: data, database: databasePath, owner_file: ownerFile, readiness_file: config.service_readiness_file, inspection_output: join(config.evidence_directory, 'actual-service-fault-inspection.json'), actual_serve_process: config.actual_serve_process, protected_process_ids: config.protected_process_ids }, null, 2) + '\n', { flag: 'wx' })
    await writeFile(values.output, JSON.stringify({ source_revision: source, state_file: values.state, actual_service_fault_request: faultFile, actual_input: accepted, commands, actual_model_acceptance: 'observed_native_journal', runtime_restart: 'NOT_RUN' }, null, 2) + '\n', { flag: 'wx' })
  } else {
    for (const key of ['readiness', 'current-serve-process']) assert.ok(values[key] && isAbsolute(values[key]))
    const state = JSON.parse(await readFile(values.state, 'utf8'))
    assert.equal(state.source_revision, source)
    assert.equal(state.database.toLowerCase(), databasePath.toLowerCase())
    assert.equal(state.authority_domain, status.authority_domain)
    assert.notEqual(state.runtime_id, status.runtime_id)
    const ready = JSON.parse(await readFile(values.readiness, 'utf8'))
    assert.equal(ready.ok, true)
    assert.equal(ready.readiness.runtimeId, status.runtime_id)
    assert.deepEqual(counts(), state.counts)
    assert.deepEqual(receipts(state.start_request), state.start_receipt)
    assert.deepEqual(receipts(state.send_request), state.send_receipt)
    const run = db.prepare('SELECT * FROM runs WHERE id=? AND legacy=0').get(state.run_id), root = db.prepare('SELECT * FROM tasks WHERE id=?').get(state.root_task_id)
    assert.ok(run && state.run && root)
    assert.equal(run.id, state.run.id)
    for (const key of ['coordinator_handle','coordinator_pane_key','consumer_generation','objective','legacy']) assert.equal(run[key], state.run[key])
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE run_id=? AND parent_id IS NULL').get(state.run_id).n, 1)
    assert.equal(root.spec, state.root.spec)
    assert.equal(root.run_id, state.run_id)
    const dispatch = db.prepare('SELECT * FROM dispatch_contexts WHERE id=?').get(state.dispatch_id), worker = db.prepare('SELECT * FROM worker_dispatches WHERE dispatch_id=?').get(state.dispatch_id)
    assert.equal(dispatch.assignee_orca_session_id, state.dispatch.assignee_orca_session_id)
    assert.equal(dispatch.process_incarnation, state.dispatch.process_incarnation)
    assert.equal(worker.runtime_epoch, state.worker.runtime_epoch)
    const observed = await inspection(state.owner_file, 'inspection-after')
    assert.deepEqual(observed.daemon, state.actual_inspection.daemon)
    assert.deepEqual(observed.service_job, state.actual_inspection.service_job)
    const currentRoot = JSON.parse(await readFile(values['current-serve-process'], 'utf8'))
    const verifyRequest = join(config.evidence_directory, 'actual-restarted-service-observe-request.json')
    await writeFile(verifyRequest, JSON.stringify({ action: 'observe', candidate, data_root: data, database: databasePath, owner_file: state.owner_file, readiness_file: values.readiness, inspection_output: join(config.evidence_directory, 'actual-restarted-service-held-inspection.json'), actual_serve_process: currentRoot, protected_process_ids: config.protected_process_ids }, null, 2) + '\n', { flag: 'wx' })
    execFileSync(join(candidate, 'runtime', 'controller-fault.exe'), ['--service-request-file', verifyRequest, '--output', join(config.evidence_directory, 'actual-restarted-service-held-observation.json')], { windowsHide: true, timeout: 30_000, env: environment })
    const journal = new DatabaseSync(state.journal_file, { readOnly: true })
    try {
      const original = nativeRow(journal.prepare('SELECT seq, ts, row_json FROM journal_rows WHERE session_id=? AND epoch=? AND seq<=? ORDER BY seq').all(state.input.session_id, state.input.source.epoch, state.input.source.sequence))
      assert.deepEqual(original, state.journal_rows)
    } finally { journal.close() }
    for (const command of [['worker', 'send', '--input-file', join(inputDirectory, 'b.txt')], ['worker', 'stop'], ['worker', 'release']]) await cli([...command, '--controller', state.controller, '--dispatch', state.dispatch_id, '--request-id', randomUUID()], [6])
    const events = await readJSONL(candidate, state.provider_events_file)
    assert.deepEqual(events.slice(0, state.provider_events.length), state.provider_events)
    for (const event of events) {
      assert.equal(event.process.pid, state.source.process.pid)
      assert.equal(event.process.creationTimeMs, state.source.process.creation_time_ms)
    }
    assert.deepEqual(counts(), state.counts)
    const resource = db.prepare('SELECT * FROM worker_terminal_resources WHERE owner_dispatch_id=?').get(state.dispatch_id)
    assert.equal(resource.process_incarnation, state.resource.process_incarnation)
    assert.notEqual(resource.release_state, 'released')
    assert.deepEqual(db.prepare('PRAGMA integrity_check').all().map(row => row.integrity_check), ['ok'])
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
    await writeFile(values.output, JSON.stringify({ candidate, source_revision: source, prior_runtime_id: state.runtime_id, actual_runtime_id: status.runtime_id, actual_run: run, actual_root: root, actual_dispatch: dispatch, actual_worker: worker, actual_resource: resource, actual_inspection: observed, commands, remainingCases: ['actual_controller_restored_attestation_and_fresh_exit_cleanup', 'actual_serve_exit_and_two_whole_job_observations', 'other_R08_effect_boundaries_and_full_T12'] }, null, 2) + '\n', { flag: 'wx' })
    process.exitCode = 6
  }
} finally { db.close() }
