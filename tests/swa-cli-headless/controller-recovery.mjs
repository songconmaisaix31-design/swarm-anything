import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { parseArgs } from 'node:util'
import { setTimeout } from 'node:timers/promises'
import { verifyInstalledProductSource } from './installed-product-source.mjs'

const { values } = parseArgs({ options: Object.fromEntries(['candidate', 'data-root', 'project', 'project-id', 'endpoint', 'protected-pids', 'output', 'fault-case'].map(key => [key, { type: 'string' }])), allowPositionals: false })
assert.ok(values['fault-case'] === undefined || ['cancel', 'stdout-close'].includes(values['fault-case']))
for (const key of ['candidate', 'data-root', 'project', 'output']) assert.ok(values[key] && isAbsolute(values[key]), `Actual absolute ${key} is required`)
assert.ok(values['project-id'] && process.env.SWA_PROJECT_TOKEN && values['protected-pids'])
const candidate = await realpath(values.candidate), data = await realpath(values['data-root']), project = await realpath(values.project), evidence = dirname(values.output)
assert.equal((await realpath(process.execPath)).toLowerCase(), join(candidate, 'node', 'node.exe').toLowerCase())
const sourceRevision = (await readFile(join(candidate, 'VERSION'), 'utf8')).trim()
const codeRoot = await realpath(join(dirname(import.meta.filename), '..', '..'))
await verifyInstalledProductSource(candidate, codeRoot, values.output + '.source-versions.json')
const inputs = join(project, '.verification', 'swa-cli-input')
const source = JSON.parse(await readFile(join(inputs, 'source.json'), 'utf8'))
assert.equal(source.revision, 'da3bdddb085808863090a05f60cc1c64415039cf')
assert.equal((await realpath(source.project_root)).toLowerCase(), project.toLowerCase())
const spec = JSON.parse(await readFile(join(inputs, 'task.json'), 'utf8'))
const environment = { ...process.env, SWA_ENDPOINT: values.endpoint, SWA_PROJECT_ID: values['project-id'], NODE_OPTIONS: '--max-old-space-size=1024' }
const swa = join(candidate, 'swa.exe'), requireRuntime = createRequire(join(candidate, 'runtime', 'package.json'))
const processAPI = requireRuntime('@vscode/windows-process-tree')
const commands = [], checks = []
let ordinal = 0, runtimeId
async function cli(args, expected = 0) {
  const index = ++ordinal, child = spawn(swa, [...args, '--json'], { env: environment, cwd: project, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  const stdout = [], stderr = []
  let bytes = 0
  child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 16 * 1024 * 1024) child.stdout.destroy(new Error('Actual CLI output exceeds its bound')); else stdout.push(chunk) })
  child.stderr.on('data', chunk => { if (Buffer.concat(stderr).length < 256 * 1024) stderr.push(chunk) })
  const actual = await new Promise((resolve, reject) => { child.once('error', reject); child.stdout.once('error', reject); child.once('close', (exit, signal) => resolve({ exit, signal })) })
  const text = Buffer.concat(stdout).toString('utf8')
  await writeFile(join(evidence, `recovery-${index}.stdout.json`), text, { flag: 'wx' })
  await writeFile(join(evidence, `recovery-${index}.stderr.log`), Buffer.concat(stderr), { flag: 'wx' })
  const reply = JSON.parse(text)
  commands.push({ args, pid: child.pid, ...actual, request_id: reply.request_id })
  assert.ok((Array.isArray(expected) ? expected : [expected]).includes(actual.exit), `Actual CLI failed; preserve recovery-${index}`)
  assert.equal(actual.signal, null)
  assert.equal(reply.ok, expected === 0)
  if (runtimeId) assert.equal(reply.runtime_id, runtimeId)
  return reply
}
const status = await cli(['status'])
runtimeId = status.runtime_id
const dbPath = status.result.databases.find(row => row.name === 'main')?.file
assert.ok(dbPath && relative(data, await realpath(dbPath)) && !relative(data, await realpath(dbPath)).startsWith('..'))
const database = new DatabaseSync(dbPath, { readOnly: true }), fingerprint = status.authority_domain
const row = request => database.prepare('SELECT request_id, method, state, payload_hash, receipt FROM mutation_receipts WHERE caller_fingerprint=? AND request_id=?').get(fingerprint, request)
const counts = () => ({ runs: database.prepare('SELECT COUNT(*) AS count FROM runs WHERE legacy=0').get().count, legacy_coordinator_runs: database.prepare('SELECT COUNT(*) AS count FROM coordinator_runs').get().count, tasks: database.prepare('SELECT COUNT(*) AS count FROM tasks').get().count })
const openRequest = randomUUID(), taskRequest = randomUUID()
const opened = await cli(['controller', 'open', '--project', values['project-id'], '--workdir', project, '--request-id', openRequest])
const controller = opened.controller
assert.ok(controller && opened.result.process && opened.result.helper)
const ownerFile = join(evidence, 'actual-controller-owner.json')
await writeFile(ownerFile, JSON.stringify(opened, null, 2) + '\n', { flag: 'wx' })
const created = await cli(['task', 'create', '--controller', controller, '--spec-file', join(inputs, 'task.json'), '--request-id', taskRequest])
const fixedRun = created.run_id, root = created.task_id, initialGeneration = created.result.native.run.consumer_generation
assert.ok(fixedRun && root && Number.isInteger(initialGeneration))
const originalRun = database.prepare('SELECT * FROM runs WHERE id=? AND legacy=0').get(fixedRun)
assert.ok(originalRun)
assert.equal(originalRun.coordinator_handle, controller)
assert.equal(originalRun.coordinator_pane_key, opened.result.caller_authority.paneKey)
assert.equal(originalRun.consumer_generation, initialGeneration)
const before = counts(), originalChild = row(`${taskRequest}/run-create`)
assert.equal(originalChild.state, 'completed')
const probeState = join(evidence, 'strict-probe-source.json'), probeOutput = join(evidence, 'strict-probe-result.json')
await writeFile(probeState, JSON.stringify({ candidate, data_root: data, source_revision: sourceRevision, runtime_id: runtimeId, controller, task_request: taskRequest, objective: spec.goal }, null, 2) + '\n', { flag: 'wx' })
const probeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(SYSTEMROOT|WINDIR|COMSPEC|PATH|PATHEXT|TEMP|TMP)$/i.test(key)))
execFileSync(process.execPath, ['--max-old-space-size=1024', join(candidate, 'runtime', 'strict-caller-probe.cjs'), '--state', probeState, '--output', probeOutput], { env: probeEnv, windowsHide: true, timeout: 45_000 })
assert.deepEqual(row(`${taskRequest}/run-create`), originalChild)
assert.deepEqual(counts(), before)
checks.push({ case: 'missing_real_helper_evidence_before_completed_native_replay', source: probeOutput })
const liveRequest = randomUUID()
const live = await cli(['controller', 'recover', '--controller', controller, '--request-id', liveRequest], 6)
assert.equal(live.error.code, 'controller_unverifiable')
assert.equal(row(liveRequest), undefined)
assert.deepEqual(counts(), before)
checks.push({ case: 'live_prior_helper_effect_free_rejection', request_id: liveRequest, actual_discard: true })
const daemonDirectory = join(data, 'daemon')
const { readdir } = await import('node:fs/promises')
const pidFiles = (await readdir(daemonDirectory)).filter(file => /^daemon-v.*\.pid$/.test(file))
assert.equal(pidFiles.length, 1)
assert.equal(pidFiles[0], 'daemon-v49.pid')
const daemon = JSON.parse(await readFile(join(daemonDirectory, pidFiles[0]), 'utf8'))
assert.equal(daemon.swa_service_job.data_root.toLowerCase(), data.toLowerCase())
assert.equal(daemon.swa_service_job.install_root.toLowerCase(), candidate.toLowerCase())
execFileSync(join(candidate, 'runtime', 'controller-fault.exe'), ['--candidate', candidate, '--data-root', data, '--owner-file', ownerFile, '--database', dbPath, '--protected-pids', values['protected-pids'], '--inspection-output', join(evidence, 'actual-controller-held-inspection.json'), '--output', join(evidence, 'actual-controller-fault.json')], { windowsHide: true, timeout: 35_000 })
const actualFault = JSON.parse(await readFile(join(evidence, 'actual-controller-fault.json'), 'utf8'))
assert.equal(actualFault.actual_exit, true)
assert.equal(actualFault.controller, controller)
assert.equal(actualFault.service_job.name, daemon.swa_service_job.name)
assert.equal(actualFault.actual_held_chains.length, 2)
for (let attempt = 0; ; attempt++) {
  const rows = await new Promise((resolve, reject) => processAPI.getAllProcesses(result => result ? resolve(result) : reject(new Error('Actual process inventory unavailable')), 4))
  if (![opened.result.process, opened.result.helper].some(expected => rows.some(actual => actual.pid === expected.pid))) break
  if (attempt >= 40) throw new Error('The actual prior helper exit remains unknown')
  await setTimeout(100)
}
const unavailable = await cli(['controller', 'show', '--controller', controller], 6)
assert.equal(unavailable.error.code, 'controller_unverifiable')
const historical = await cli(['task', 'show', '--controller', controller, '--task', root])
assert.ok(historical.result.native.tasks.some(task => task.id === root))
if (values['fault-case']) {
  const stateFile = join(evidence, 'actual-recovery-fault-state.json'), faultOutput = join(evidence, 'actual-recovery-cli-fault.json')
  const protectedPIDs = values['protected-pids'].split(',').map(value => { assert.match(value, /^[1-9][0-9]*$/); return Number(value) })
  await writeFile(stateFile, JSON.stringify({ candidate, data_root: data, database: dbPath, evidence_directory: evidence, source_directory: codeRoot, source_revision: sourceRevision, prior_owner_file: ownerFile, project_id: values['project-id'], prior_controller: controller, run_id: fixedRun, root_task_id: root, authority_domain: fingerprint, runtime_id: runtimeId, endpoint: values.endpoint, protected_process_ids: protectedPIDs }, null, 2) + '\n', { flag: 'wx' })
  const child = spawn(process.execPath, ['--max-old-space-size=1024', join(codeRoot, 'tests', 'swa-cli-headless', 'cli-failure.mjs'), '--state', stateFile, '--action', values['fault-case'], '--output', faultOutput], { env: environment, cwd: project, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'] })
  const actual = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (exit, signal) => resolve({ pid: child.pid, exit, signal })) })
  await writeFile(join(evidence, 'actual-cli-failure-driver-exit.json'), JSON.stringify(actual, null, 2) + '\n', { flag: 'wx' })
  assert.ok([0, 6].includes(actual.exit) && actual.signal === null)
  const fault = JSON.parse(await readFile(faultOutput, 'utf8'))
  assert.equal(fault.source_revision, sourceRevision)
  assert.equal(fault.prior_controller, controller)
  const remainingCases = [...fault.remainingCases, 'other_original_T12_recovery_cases_require_their_own_actual_evidence']
  await writeFile(values.output, JSON.stringify({ candidate, source_revision: sourceRevision, runtime_id: runtimeId, model_calls: 0, commands, checks, actual_cli_fault: fault, remainingCases }, null, 2) + '\n', { flag: 'wx' })
  process.exitCode = 6
} else {
const request = randomUUID(), args = ['controller', 'recover', '--controller', controller, '--request-id', request]
let recoverySettled = false
const recovery = cli(args)
void recovery.then(() => { recoverySettled = true }, () => { recoverySettled = true })
const competingStages = new Map(['scope-reserved', 'pty-spawn'].map(stage => [stage, { stage, status: 'INCONCLUSIVE', reason: 'the_original_pending_stage_was_not_observed' }]))
async function observeCompetition() {
  const deadline = Date.now() + 140_000
  while (!recoverySettled && Date.now() < deadline) {
    const original = row(request)
    if (original?.state === 'pending' && original.receipt) {
      assert.equal(original.method, 'swa.controllerRecover')
      const checkpoint = JSON.parse(original.receipt), stage = checkpoint.stage, entry = competingStages.get(stage)
      if (entry && !entry.request_id) {
        const competingRequest = randomUUID()
        entry.request_id = competingRequest
        await writeFile(join(evidence, `actual-competing-${stage}-before.json`), JSON.stringify(original, null, 2) + '\n', { flag: 'wx' })
        const reply = await cli(['controller', 'recover', '--controller', controller, '--request-id', competingRequest], [3, 6])
        const after = row(request), afterCheckpoint = after?.receipt ? JSON.parse(after.receipt) : null
        await writeFile(join(evidence, `actual-competing-${stage}-after.json`), JSON.stringify(after ?? null, null, 2) + '\n', { flag: 'wx' })
        assert.ok(['operation_in_progress', 'scope_denied'].includes(reply.error.code))
        assert.equal(row(competingRequest), undefined)
        assert.deepEqual(counts(), before)
        assert.equal(row(`${competingRequest}/run-use`), undefined)
        entry.actual_error = reply.error
        const sameStage = after?.method === 'swa.controllerRecover' && after.state === 'pending' && after.payload_hash === original.payload_hash && afterCheckpoint?.stage === stage
        entry.status = reply.error.code === 'operation_in_progress' && sameStage ? 'OBSERVED' : 'INCONCLUSIVE'
        entry.reason = entry.status === 'OBSERVED' ? 'the_original_pending_checkpoint_remained_at_the_named_stage_across_competing_admission' : 'the_named_stage_was_not_proven_to_span_competing_admission'
      }
    }
    await setTimeout(10)
  }
}
const recoveryChecks = await Promise.allSettled([recovery, observeCompetition()])
for (const result of recoveryChecks) if (result.status === 'rejected') throw result.reason
const recovered = recoveryChecks[0].value
assert.ok(recovered.controller && recovered.controller !== controller)
assert.equal(recovered.run_id, fixedRun)
assert.equal(recovered.task_id, root)
assert.ok(recovered.result.consumer_generation > initialGeneration)
assert.equal(recovered.result.native.run.id, fixedRun)
assert.equal(recovered.result.native.run.coordinator_handle, recovered.controller)
const recoveredRun = database.prepare('SELECT * FROM runs WHERE id=? AND legacy=0').get(fixedRun)
assert.ok(recoveredRun)
assert.equal(recoveredRun.coordinator_handle, recovered.controller)
assert.equal(recoveredRun.coordinator_pane_key, recovered.result.caller_authority.paneKey)
assert.equal(recoveredRun.consumer_generation, recovered.result.consumer_generation)
assert.equal(recoveredRun.objective, originalRun.objective)
assert.equal(database.prepare('SELECT COUNT(*) AS count FROM tasks WHERE run_id=? AND parent_id IS NULL').get(fixedRun).count, 1)
assert.equal(recovered.result.prior_exit_observations.length, 2)
const completedRecovery = row(request), replay = await cli(args)
assert.equal(replay.controller, recovered.controller)
assert.equal(replay.result.consumer_generation, recovered.result.consumer_generation)
assert.deepEqual(row(request), completedRecovery)
assert.deepEqual(counts(), before)
const changedPayload = await cli(['controller', 'recover', '--controller', recovered.controller, '--request-id', request], 2)
assert.equal(changedPayload.error.code, 'request_mismatch')
assert.deepEqual(row(request), completedRecovery)
checks.push({ case: 'distinct_recovery_requests_at_actual_pending_stages', stages: [...competingStages.values()] })
const recoveredOwner = join(evidence, 'actual-recovered-controller-owner.json'), recoveredInspection = join(evidence, 'actual-recovered-controller-inspection.json')
await writeFile(recoveredOwner, JSON.stringify(recovered, null, 2) + '\n', { flag: 'wx' })
execFileSync(process.execPath, ['--max-old-space-size=1024', join(candidate, 'runtime', 'controller-inspection.cjs'), '--candidate', candidate, '--data-root', data, '--owner-file', recoveredOwner, '--database', dbPath, '--output', recoveredInspection], { windowsHide: true, timeout: 15_000 })
const currentInventory = JSON.parse(await readFile(recoveredInspection, 'utf8')), priorInventory = JSON.parse(await readFile(join(evidence, 'actual-controller-held-inspection.json'), 'utf8'))
const expectedPtys = priorInventory.inventory.filter(session => session.isAlive && session.sessionId !== opened.result.binding.ptyId).map(session => session.sessionId)
expectedPtys.push(recovered.result.binding.ptyId)
assert.deepEqual(currentInventory.inventory.filter(session => session.isAlive).map(session => session.sessionId).sort(), expectedPtys.sort())
const stale = await cli(['controller', 'recover', '--controller', controller, '--request-id', randomUUID()], 3)
assert.equal(stale.error.code, 'scope_denied')
const duplicateTask = await cli(['task', 'create', '--controller', recovered.controller, '--spec-file', join(inputs, 'task.json'), '--request-id', randomUUID()], 2)
assert.equal(duplicateTask.error.code, 'request_mismatch')
await cli(['controller', 'close', '--controller', recovered.controller, '--request-id', randomUUID()])
checks.push({ case: 'same_run_root_context_new_helper_and_completed_replay', request_id: request, prior_controller: controller, controller: recovered.controller, run_id: fixedRun, root_task_id: root, consumer_generation: recovered.result.consumer_generation })
const remainingCases = ['runtime_and_serve_restart_same_named_job_and_authenticated_daemon', 'real_response_loss_each_recovery_effect_boundary', 'pending_recovery_observation_after_restart', 'real_restored_helper_attestation_and_old_generation', 'other_real_project_and_run_scope', 'same_live_worker_session_and_unknown_resource_preservation']
for (const entry of competingStages.values()) if (entry.status !== 'OBSERVED') remainingCases.push(`distinct_request_competition_${entry.stage}`)
await writeFile(values.output, JSON.stringify({ candidate, source_revision: sourceRevision, runtime_id: runtimeId, model_calls: 0, commands, checks, same_native_counts: before, remainingCases }, null, 2) + '\n', { flag: 'wx' })
}
database.close()
