import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createWriteStream } from 'node:fs'
import { readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { createInterface } from 'node:readline'
import { pipeline } from 'node:stream/promises'
import { parseArgs } from 'node:util'
import { setTimeout } from 'node:timers/promises'
import { verifyInstalledProductSource } from './installed-product-source.mjs'

const { values } = parseArgs({ options: { state: { type: 'string' }, output: { type: 'string' }, action: { type: 'string' } }, allowPositionals: false })
assert.ok(values.state && values.output && isAbsolute(values.state) && isAbsolute(values.output))
assert.ok(['cancel', 'stdout-close'].includes(values.action))
const state = JSON.parse(await readFile(values.state, 'utf8'))
for (const key of ['candidate', 'data_root', 'database', 'evidence_directory', 'source_directory', 'prior_owner_file']) assert.ok(isAbsolute(state[key]))
assert.ok(process.env.SWA_PROJECT_TOKEN && state.project_id && state.prior_controller && state.run_id && state.root_task_id && state.authority_domain)
const candidate = await realpath(state.candidate), data = await realpath(state.data_root), databasePath = await realpath(state.database)
assert.equal((await realpath(process.execPath)).toLowerCase(), join(candidate, 'node', 'node.exe').toLowerCase())
const sourceRevision = (await readFile(join(candidate, 'VERSION'), 'utf8')).trim()
assert.match(sourceRevision, /^[0-9a-f]{40}$/)
assert.equal(sourceRevision, state.source_revision)
const sourceDirectory = await realpath(state.source_directory)
await verifyInstalledProductSource(candidate, sourceDirectory, values.output + '.source-versions.json')
const within = relative(data, databasePath)
assert.ok(within && !within.startsWith('..') && !isAbsolute(within))
const endpoint = new URL(state.endpoint)
assert.equal(endpoint.protocol, 'http:')
assert.equal(endpoint.hostname, '127.0.0.1')
const environment = { ...process.env, SWA_ENDPOINT: state.endpoint, SWA_PROJECT_ID: state.project_id, NODE_OPTIONS: '--max-old-space-size=1024', GOMAXPROCS: '4', GOMEMLIMIT: '512MiB' }
const db = new DatabaseSync(databasePath, { readOnly: true })
const original = request => db.prepare('SELECT request_id, method, state, payload_hash, receipt FROM mutation_receipts WHERE caller_fingerprint=? AND request_id=?').get(state.authority_domain, request)
const priorEnvelope = JSON.parse(await readFile(state.prior_owner_file, 'utf8'))
assert.equal(priorEnvelope.ok, true)
assert.equal(priorEnvelope.authority_domain, state.authority_domain)
assert.equal(priorEnvelope.result.controller, state.prior_controller)
const priorRecord = original(priorEnvelope.request_id)
assert.ok(priorRecord && priorRecord.state === 'completed' && ['swa.controllerOpen', 'swa.controllerRecover'].includes(priorRecord.method))
assert.deepEqual(JSON.parse(priorRecord.receipt), priorEnvelope.result)
const priorPty = priorEnvelope.result.binding.ptyId
const allRunUses = () => db.prepare('SELECT request_id, method, state, payload_hash, receipt FROM mutation_receipts WHERE caller_fingerprint=? AND method=? ORDER BY request_id').all(state.authority_domain, 'orchestration.runUse')
const counts = () => ({ runs: db.prepare('SELECT COUNT(*) AS count FROM runs WHERE legacy=0').get().count, legacy_coordinator_runs: db.prepare('SELECT COUNT(*) AS count FROM coordinator_runs').get().count, tasks: db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count })
const beforeCounts = counts(), beforeRun = db.prepare('SELECT * FROM runs WHERE id=? AND legacy=0').get(state.run_id), beforeRoot = db.prepare('SELECT * FROM tasks WHERE id=?').get(state.root_task_id)
assert.ok(beforeRun && beforeRoot)
assert.equal(beforeRun.coordinator_handle, state.prior_controller)
assert.equal(beforeRun.coordinator_pane_key, priorEnvelope.result.caller_authority.paneKey)
assert.equal(beforeRoot.run_id, state.run_id)
assert.equal(beforeRoot.parent_id, null)
const requestID = randomUUID(), prefix = join(state.evidence_directory, `${values.action}-${requestID}`)
const beforeRunUses = allRunUses()
assert.equal(beforeRunUses.some(row => row.request_id === `${requestID}/run-use`), false)
async function inventory(suffix) {
  const output = prefix + `.${suffix}.json`
  execFileSync(process.execPath, ['--max-old-space-size=1024', join(candidate, 'runtime', 'controller-inspection.cjs'), '--candidate', candidate, '--data-root', data, '--inventory-only', '--database', databasePath, '--output', output], { windowsHide: true, timeout: 15_000 })
  return JSON.parse(await readFile(output, 'utf8'))
}
const beforeInventory = await inventory('inventory-before')
assert.ok(Array.isArray(beforeInventory.inventory))
assert.equal(beforeInventory.inventory.some(session => session.sessionId === priorPty && session.isAlive), false, 'The actual prior PTY must already be observed exited before this recovery fault case')
await writeFile(prefix + '.run-use-before.json', JSON.stringify(beforeRunUses, null, 2) + '\n', { flag: 'wx' })
const requestFile = prefix + '.request.json'
await writeFile(requestFile, JSON.stringify({ candidate, source_revision: sourceRevision, controller: state.prior_controller, request_id: requestID, arguments: ['controller', 'recover', '--controller', state.prior_controller, '--request-id', requestID, '--json'], output_prefix: prefix, protected_process_ids: state.protected_process_ids }, null, 2) + '\n', { flag: 'wx' })
const child = spawn(join(candidate, 'runtime', 'cli-fault-control.exe'), ['--request-file', requestFile], { env: environment, cwd: candidate, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
const stdoutSaved = pipeline(child.stdout, createWriteStream(prefix + '.helper.stdout.log', { flags: 'wx' })).then(() => null, error => error)
const stderrSaved = pipeline(child.stderr, createWriteStream(prefix + '.helper.stderr.log', { flags: 'wx' })).then(() => null, error => error)
const lines = createInterface({ input: child.stdout, terminal: false, crlfDelay: Infinity })
const ready = new Promise((resolve, reject) => {
  lines.once('line', line => { try { resolve(JSON.parse(line)) } catch (error) { reject(error) } })
  lines.once('close', () => reject(new Error('Actual console controller did not publish its real CLI identity')))
  child.once('error', reject)
})
let spawnError = null
let inputError = null
child.stdin.once('error', error => { inputError = String(error) })
const finished = new Promise(resolve => { child.once('error', error => { spawnError = String(error) }); child.once('close', (exit, signal) => resolve({ exit, signal, error: spawnError })) })
let actualReady, beforeFault, helperExit, lifecycleError = null
try {
  actualReady = await ready
  assert.equal(actualReady.type, 'swa_actual_cli_fault_ready')
  assert.equal(actualReady.request_id, requestID)
  assert.equal(actualReady.controller, state.prior_controller)
  assert.equal(actualReady.group_id, actualReady.pid)
  assert.ok(actualReady.creation_time_ms > 0)
  assert.equal(actualReady.console_members.length, 2)
  assert.ok(actualReady.console_members.includes(actualReady.pid))
  const hitDeadline = Date.now() + 120_000
  while (Date.now() < hitDeadline) {
    const row = original(requestID)
    if (row) { beforeFault = row; break }
    if (child.exitCode !== null) break
    await setTimeout(10)
  }
  if (beforeFault) assert.equal(beforeFault.method, 'swa.controllerRecover')
  await writeFile(prefix + '.before-fault.json', JSON.stringify(beforeFault ?? null, null, 2) + '\n', { flag: 'wx' })
  const selectedAction = beforeFault ? values.action : 'observe'
  child.stdin.end(JSON.stringify({ request_id: requestID, action: selectedAction }) + '\n')
} catch (error) {
  lifecycleError = error
  child.stdin.destroy()
} finally {
  helperExit = await finished
  const saved = await Promise.all([stdoutSaved, stderrSaved])
  lines.close()
  await writeFile(prefix + '.helper-lifecycle.json', JSON.stringify({ actual_ready: actualReady ?? null, actual_exit: helperExit, failure: lifecycleError ? String(lifecycleError) : null, control_input_error: inputError, stream_errors: saved.map(error => error ? String(error) : null) }, null, 2) + '\n', { flag: 'wx' })
  assert.ok(saved.every(error => error === null), 'Actual helper streams were not completely saved')
}
if (lifecycleError) throw lifecycleError
const helperResult = JSON.parse(await readFile(prefix + '.result.json', 'utf8'))
assert.equal(helperResult.request_id, requestID)
assert.equal(helperResult.controller, state.prior_controller)
assert.equal(helperResult.pid, actualReady.pid)
assert.equal(helperResult.creation_time_ms, actualReady.creation_time_ms)
assert.equal(helperResult.group_id, actualReady.group_id)
const expectedCLIExit = values.action === 'cancel' ? 130 : 6
const processWindowHit = !!beforeFault && helperExit.exit === 0 && helperExit.signal === null && !inputError && !helperResult.control_error && !helperResult.deadline && helperResult.actual_action === values.action && helperResult.actual_cli_exit === expectedCLIExit && helperResult.actual_handle_signaled === true
assert.ok((await stat(prefix + '.stdout.log')).size <= 4 * 1024 * 1024, 'Actual CLI response exceeds the inspection bound; the original stream remains in evidence')
const cliBytes = await readFile(prefix + '.stdout.log')
let cliReply = null, parseError = null
if (cliBytes.length) {
  try { cliReply = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(cliBytes)) }
  catch (error) { parseError = String(error) }
}
if (cliReply) {
  assert.equal(cliReply.request_id, requestID)
}
const cliStderrFile = prefix + '.stderr.log'
assert.ok((await stat(cliStderrFile)).size <= 4 * 1024 * 1024, 'Actual CLI diagnostic exceeds its bound; the original stream remains in evidence')
const cliDiagnostic = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(cliStderrFile))
assert.doesNotMatch(cliDiagnostic, /\b(?:request_id|runtime_id|authority_domain|controller|run_id|task_id|dispatch_id|requested_controller|requested_task_id|requested_dispatch_id)=""(?:\s|$)/)
const queryDiagnostic = cliDiagnostic.includes('PowerShell 查询原请求：swa request show ') && cliDiagnostic.includes(`--request-id '${requestID}'`) && cliDiagnostic.includes('--json') && cliDiagnostic.includes(`--project '${state.project_id.replaceAll("'", "''")}'`)
const cancellationEnvelope = parseError === null && cliReply !== null && !Array.isArray(cliReply) && cliReply.ok === false && cliReply.request_id === requestID && cliReply.controller === state.prior_controller && cliReply.error?.code === 'delivery_unknown' && typeof cliReply.error.message === 'string' && cliReply.error.message.length > 0 && typeof cliReply.error.retryable === 'boolean' && cliReply.error.required_action === 'inspect_original_request'
const streamFilesSaved = !helperResult.actual_stdout_file_error && !helperResult.actual_unclassified_copy_error
const cancellationStreamSaved = streamFilesSaved && !helperResult.actual_pipe_read_error
if (processWindowHit && values.action === 'cancel') {
  assert.ok(cancellationStreamSaved, 'Actual cancellation stdout must be completely saved without pipe or file errors')
  assert.ok(cancellationEnvelope, 'Actual cancellation must publish exactly one complete UTF-8 JSON failure envelope with the original request and controller')
  assert.ok(queryDiagnostic, 'Actual cancellation must publish the original request query diagnostic')
}
const commandResults = []
let ordinal = 0
async function cli(args) {
  const child = spawn(join(candidate, 'swa.exe'), [...args, '--json'], { env: environment, cwd: candidate, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const index = ++ordinal
  const stdoutPath = prefix + `.query-${index}.stdout.json`
  const savedOutput = pipeline(child.stdout, createWriteStream(stdoutPath, { flags: 'wx' })).then(() => null, error => error)
  const savedDiagnostic = pipeline(child.stderr, createWriteStream(prefix + `.query-${index}.stderr.log`, { flags: 'wx' })).then(() => null, error => error)
  let failure = null
  child.once('error', error => { failure = error })
  const exit = await new Promise(resolve => child.once('close', (exit, signal) => resolve({ exit, signal })))
  const streamErrors = await Promise.all([savedOutput, savedDiagnostic])
  assert.ok(streamErrors.every(error => error === null), 'Actual query streams were not completely saved')
  if (failure) throw failure
  assert.ok((await stat(stdoutPath)).size <= 4 * 1024 * 1024, 'Actual query response exceeds the inspection bound; the original stream remains in evidence')
  const reply = JSON.parse(await readFile(stdoutPath, 'utf8'))
  assert.equal(reply.runtime_id, state.runtime_id)
  assert.equal(reply.authority_domain, state.authority_domain)
  commandResults.push({ args, ...exit, reply })
  return { ...exit, reply }
}
const query = await cli(['request', 'show', '--controller', state.prior_controller, '--request-id', requestID])
assert.ok([0, 6].includes(query.exit) && query.signal === null)
const after = original(requestID)
assert.ok(after && after.method === 'swa.controllerRecover')
assert.deepEqual(counts(), beforeCounts)
const afterRoot = db.prepare('SELECT * FROM tasks WHERE id=?').get(state.root_task_id)
assert.equal(afterRoot.run_id, beforeRoot.run_id)
assert.equal(afterRoot.spec, beforeRoot.spec)
const receipt = after.receipt ? JSON.parse(after.receipt) : null
const knownControllers = [state.prior_controller, ...(after.state === 'completed' && typeof receipt?.controller === 'string' ? [receipt.controller] : [])]
const stdoutCorrelation = cliDiagnostic.includes('已知关联：') && cliDiagnostic.includes(`request_id="${requestID}"`) && cliDiagnostic.includes(`requested_controller=${JSON.stringify(state.prior_controller)}`) && knownControllers.some(controller => cliDiagnostic.includes(` controller=${JSON.stringify(controller)} `))
const publishedNewControllerKnown = after.state === 'completed' && typeof receipt?.controller === 'string' && cliDiagnostic.includes(` controller=${JSON.stringify(receipt.controller)} `)
const publishedNewScopeRetained = !publishedNewControllerKnown || cliDiagnostic.includes(` run_id=${JSON.stringify(state.run_id)} `) && cliDiagnostic.includes(` task_id=${JSON.stringify(state.root_task_id)} `)
const stdoutFailure = streamFilesSaved && cliDiagnostic.includes('CLI 输出失败：') && typeof helperResult.actual_pipe_read_error === 'string' && helperResult.actual_pipe_read_error.length > 0 && stdoutCorrelation && publishedNewScopeRetained && queryDiagnostic
const outputEvidence = { actual_stderr_file: cliStderrFile, query_diagnostic: queryDiagnostic, cancellation_single_failure_envelope: cancellationEnvelope, cancellation_stream_completely_saved: cancellationStreamSaved, actual_reply_new_controller_known: publishedNewControllerKnown, actual_reply_new_run_and_root_retained: publishedNewScopeRetained, stdout_actual_stream_failure_and_known_association: stdoutFailure }
const hit = processWindowHit && (values.action === 'cancel' ? cancellationEnvelope && cancellationStreamSaved && queryDiagnostic : stdoutFailure)
const status = hit ? 'OBSERVED' : 'INCONCLUSIVE'
const afterInventory = await inventory('inventory-after')
assert.deepEqual(afterInventory.daemon, beforeInventory.daemon)
assert.deepEqual(afterInventory.service_job, beforeInventory.service_job)
const beforeIDs = new Set(beforeInventory.inventory.map(session => session.sessionId))
const createdSessions = afterInventory.inventory.filter(session => !beforeIDs.has(session.sessionId))
assert.ok(createdSessions.length <= 1, 'Only the original recovery may add one actual PTY')
for (const session of beforeInventory.inventory) {
  if (session.sessionId === priorPty) continue
  const current = afterInventory.inventory.find(value => value.sessionId === session.sessionId)
  assert.ok(current, 'An unrelated actual PTY disappeared during the isolated recovery case')
  for (const field of ['sessionId', 'terminalHandle', 'incarnationId', 'pid', 'isAlive', 'wslDistro']) assert.deepEqual(current[field], session[field])
}
if (createdSessions.length) {
  const expectedController = receipt?.controller ?? receipt?.expected_controller
  assert.ok(expectedController)
  assert.equal(createdSessions[0].terminalHandle, expectedController)
}
const afterRunUses = allRunUses()
for (const row of beforeRunUses) assert.deepEqual(afterRunUses.find(value => value.request_id === row.request_id), row)
const existingUses = new Set(beforeRunUses.map(row => row.request_id))
const newUses = afterRunUses.filter(row => !existingUses.has(row.request_id))
assert.ok(newUses.length <= 1)
for (const row of newUses) assert.equal(row.request_id, `${requestID}/run-use`)
await writeFile(prefix + '.run-use-after.json', JSON.stringify(afterRunUses, null, 2) + '\n', { flag: 'wx' })
let observedController = null
if (after.state === 'completed') {
  assert.ok(receipt && receipt.controller && receipt.prior_controller === state.prior_controller)
  observedController = receipt.controller
  assert.equal(receipt.run_id, state.run_id)
  assert.equal(receipt.root_task_id, state.root_task_id)
  const runUse = original(`${requestID}/run-use`)
  assert.ok(runUse && runUse.method === 'orchestration.runUse' && runUse.state === 'completed')
  const afterRun = db.prepare('SELECT * FROM runs WHERE id=? AND legacy=0').get(state.run_id)
  assert.ok(afterRun)
  assert.equal(afterRun.id, beforeRun.id)
  assert.equal(afterRun.coordinator_handle, observedController)
  assert.equal(afterRun.coordinator_pane_key, receipt.caller_authority.paneKey)
  assert.ok(afterRun.consumer_generation > beforeRun.consumer_generation)
  const completedQuery = query.exit === 0 && query.reply.ok && query.reply.result.state === 'completed' ? query : await cli(['request', 'show', '--controller', state.prior_controller, '--request-id', requestID])
  assert.equal(completedQuery.exit, 0)
  assert.equal(completedQuery.reply.ok, true)
  assert.equal(completedQuery.reply.result.state, 'completed')
  assert.equal(completedQuery.reply.result.method, 'swa.controllerRecover')
  assert.equal(completedQuery.reply.result.receipt.controller, observedController)
  assert.equal(createdSessions.length, 1)
  assert.equal(createdSessions[0].sessionId, receipt.binding.ptyId)
  assert.equal(newUses.length, 1)
  const expectedAliveIDs = beforeInventory.inventory.filter(session => session.isAlive).map(session => session.sessionId)
  expectedAliveIDs.push(receipt.binding.ptyId)
  assert.deepEqual(afterInventory.inventory.filter(session => session.isAlive).map(session => session.sessionId).sort(), expectedAliveIDs.sort())
  const actualRequestFile = prefix + '.actual-request-show.json'
  await writeFile(actualRequestFile, JSON.stringify(completedQuery.reply, null, 2) + '\n', { flag: 'wx' })
  execFileSync(process.execPath, ['--max-old-space-size=1024', join(candidate, 'runtime', 'controller-inspection.cjs'), '--candidate', candidate, '--data-root', data, '--request-show-file', actualRequestFile, '--database', databasePath, '--output', prefix + '.actual-inspection.json'], { windowsHide: true, timeout: 15_000 })
  const replay = await cli(['controller', 'recover', '--controller', state.prior_controller, '--request-id', requestID])
  assert.equal(replay.exit, 0)
  assert.equal(replay.reply.ok, true)
  assert.deepEqual(replay.reply.result, receipt)
  assert.deepEqual(original(requestID), after)
  assert.deepEqual(allRunUses(), afterRunUses)
  const replayInventory = await inventory('inventory-after-replay')
  assert.deepEqual(replayInventory.inventory.map(session => session.sessionId).sort(), afterInventory.inventory.map(session => session.sessionId).sort())
  assert.deepEqual(replayInventory.inventory.filter(session => session.isAlive).map(session => session.sessionId).sort(), afterInventory.inventory.filter(session => session.isAlive).map(session => session.sessionId).sort())
  for (const session of afterInventory.inventory) {
    const current = replayInventory.inventory.find(value => value.sessionId === session.sessionId)
    assert.ok(current)
    for (const field of ['sessionId', 'terminalHandle', 'incarnationId', 'pid', 'isAlive', 'wslDistro']) assert.deepEqual(current[field], session[field])
  }
  assert.deepEqual(replayInventory.daemon, afterInventory.daemon)
  assert.deepEqual(replayInventory.service_job, afterInventory.service_job)
  const closed = await cli(['controller', 'close', '--controller', observedController, '--request-id', randomUUID()])
  assert.equal(closed.exit, 0)
  assert.equal(closed.reply.ok, true)
} else assert.equal(after.state, 'pending')
const remainingCases = [...(hit ? [] : [`real_${values.action}_${processWindowHit ? 'required_output_evidence_not_confirmed' : 'window_not_confirmed'}`]), ...(after.state === 'pending' ? ['original_pending_recovery_remains_unknown_do_not_repeat', 'request_show_only_reads_the_original_receipt_pending_recover_observation_was_not_executed'] : []), 'real_connection_failure_and_network_disconnect_are_separate_cases']
await writeFile(values.output, JSON.stringify({ candidate, source_revision: sourceRevision, action: values.action, status, request_id: requestID, prior_controller: state.prior_controller, actual_controller: observedController, before_fault: beforeFault ?? null, after_request: after, actual_helper_ready: actualReady, actual_helper_exit: helperExit, actual_helper_result: helperResult, actual_cli_reply: cliReply, actual_cli_parse_error: parseError, actual_output_evidence: outputEvidence, queries: commandResults, actual_pty_inventory_files: ['inventory-before', 'inventory-after', ...(after.state === 'completed' ? ['inventory-after-replay'] : [])].map(suffix => prefix + `.${suffix}.json`), actual_run_use_files: [prefix + '.run-use-before.json', prefix + '.run-use-after.json'], model_calls: 0, remainingCases }, null, 2) + '\n', { flag: 'wx' })
db.close()
if (remainingCases.length) process.exitCode = 6
