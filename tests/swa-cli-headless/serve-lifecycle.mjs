import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { parseArgs } from 'node:util'
import { setTimeout } from 'node:timers/promises'

const { values } = parseArgs({ options: Object.fromEntries(['candidate', 'evidence', 'data-parent', 'protected-roots', 'port', 'mode'].map(name => [name, { type: 'string' }])), allowPositionals: false })
for (const key of ['candidate', 'evidence', 'data-parent']) assert.ok(values[key] && isAbsolute(values[key]))
assert.ok(values['protected-roots'] && /^\d+$/.test(values.port))
const candidate = await realpath(values.candidate), evidence = values.evidence, dataParent = values['data-parent']
assert.equal((await realpath(process.execPath)).toLowerCase(), join(candidate, 'node', 'node.exe').toLowerCase())
await mkdir(evidence)
const source = (await readFile(join(candidate, 'VERSION'), 'utf8')).trim()
const requireRuntime = createRequire(join(candidate, 'runtime', 'package.json'))
const native = requireRuntime('@vscode/windows-process-tree')
const sourceRoot = await realpath(join(dirname(import.meta.filename), '..', '..'))
assert.ok(process.env.ProgramFiles && isAbsolute(process.env.ProgramFiles))
const powershell = await realpath(join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe'))
const processes = () => new Promise((resolve, reject) => native.getAllProcesses(rows => rows ? resolve(rows) : reject(new Error('Actual process identities unavailable')), 4))
const records = []
const modes = ['immediate-eof', 'startup-eof', 'readiness-eof', 'startup-stdout-close']
assert.ok(values.mode === undefined || modes.includes(values.mode))
const selectedModes = values.mode === undefined ? modes : [values.mode]
for (const mode of selectedModes) {
  const directory = join(evidence, mode)
  await mkdir(directory)
  const child = spawn(join(candidate, 'swa.exe'), ['serve', '--data-dir', join(dataParent, mode), '--port', values.port, '--protected-roots', values['protected-roots'], '--json'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env } })
  const stdout = [], stderr = [], observed = new Map(), events = [], unknown = []
  const rootCreationTimeMs = native.getProcessCreationTime(child.pid)
  observed.set(child.pid + ':' + rootCreationTimeMs, { pid: child.pid, creationTimeMs: rootCreationTimeMs, launched_executable: join(candidate, 'swa.exe'), parent_pid: process.pid })
  let settled = null, spawnError = null, streamError = null, closed = false, acted = false, readiness = null
  const exited = new Promise(resolve => {
    child.once('error', error => { spawnError = error })
    child.once('close', (exit, signal) => { closed = true; settled = { exit, signal, observed_at_ms: Date.now() }; resolve(settled) })
  })
  child.stdout.on('data', chunk => { stdout.push(chunk); assert.ok(Buffer.concat(stdout).length < 16 * 1024 * 1024) })
  child.stdout.on('error', error => { streamError = error.message })
  child.stderr.on('data', chunk => { stderr.push(chunk); assert.ok(Buffer.concat(stderr).length < 16 * 1024 * 1024) })
  child.stdin.on('error', error => { events.push({ type: 'stdin-error', code: error.code, observed_at_ms: Date.now() }) })
  events.push({ type: 'actual-spawn', pid: child.pid, creation_time_ms: rootCreationTimeMs, observed_at_ms: Date.now() })
  if (mode === 'immediate-eof') {
    child.stdin.end()
    acted = true
    events.push({ type: 'actual-owned-stdin-closed', observed_at_ms: Date.now() })
  }
  await writeFile(join(directory, 'actual-spawn.json'), JSON.stringify({ candidate, pid: child.pid, creation_time_ms: rootCreationTimeMs, mode, events }, null, 2) + '\n', { flag: 'wx' })
  const deadline = Date.now() + 150_000
  while (!closed && Date.now() < deadline) {
    const rows = await processes(), owned = new Set([child.pid])
    let changed = true
    while (changed) {
      changed = false
      for (const row of rows) if (owned.has(row.ppid) && !owned.has(row.pid)) { owned.add(row.pid); changed = true }
    }
    const rootVerified = rows.some(row => row.pid === child.pid && row.creationTimeMs === rootCreationTimeMs)
    await writeFile(join(directory, 'latest-actual-observation.json'), JSON.stringify({ mode, pid: child.pid, creation_time_ms: rootCreationTimeMs, events, current_owned_processes: rows.filter(row => owned.has(row.pid)), observed_processes: [...observed.values()], unknown_process_observations: unknown, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), observed_at_ms: Date.now() }, null, 2) + '\n')
    for (const row of rows) if (owned.has(row.pid)) {
      if (row.creationTimeMs > 0 && rootVerified) observed.set(row.pid + ':' + row.creationTimeMs, row)
      else {
        unknown.push({ observed_at_ms: Date.now(), reason: row.creationTimeMs > 0 ? 'current_root_identity_unverified' : 'creation_time_unavailable', actual: row })
        await writeFile(join(directory, 'unknown-process-observations.json'), JSON.stringify(unknown, null, 2) + '\n')
      }
    }
    const currentStdout = Buffer.concat(stdout).toString('utf8')
    if (!readiness && currentStdout.includes('\n')) {
      readiness = JSON.parse(currentStdout)
      events.push({ type: 'actual-stdout-envelope', ok: readiness.ok, observed_at_ms: Date.now() })
    }
    if (!acted && mode === 'readiness-eof' && readiness?.ok) {
      assert.equal(readiness.install_root.toLowerCase(), candidate.toLowerCase())
      child.stdin.end()
      acted = true
      events.push({ type: 'actual-owned-stdin-closed', observed_at_ms: Date.now() })
    }
    if (!acted && rootVerified && mode.startsWith('startup-') && rows.some(row => row.ppid === child.pid && row.creationTimeMs > 0 && row.name.toLowerCase() === 'node.exe')) {
      const noPublishedReadiness = !currentStdout.length
      events.push({ type: 'actual-owned-node-observed', no_published_readiness: noPublishedReadiness, observed_at_ms: Date.now() })
      if (mode === 'startup-eof') child.stdin.end()
      else child.stdout.destroy()
      acted = true
      events.push({ type: mode === 'startup-eof' ? 'actual-owned-stdin-closed' : 'actual-owned-stdout-read-end-closed', observed_at_ms: Date.now() })
    }
    if (!closed) await setTimeout(20)
  }
  await writeFile(join(directory, 'stdout.json'), Buffer.concat(stdout), { flag: 'wx' })
  await writeFile(join(directory, 'stderr.log'), Buffer.concat(stderr), { flag: 'wx' })
  if (!closed) {
    await writeFile(join(directory, 'unsettled.json'), JSON.stringify({ pid: child.pid, observed: [...observed.values()], events }, null, 2) + '\n', { flag: 'wx' })
    throw new Error('Actual owned serve remains unsettled; preserve its recorded identity')
  }
  await exited
  const observations = []
  for (let check = 0; check < 2; check++) {
    const rows = await processes()
    const remaining = [...observed.values()].filter(old => rows.some(row => row.pid === old.pid && (!(row.creationTimeMs > 0) || row.creationTimeMs === old.creationTimeMs)))
    observations.push({ observed_at_ms: Date.now(), remaining })
    if (check === 0) await setTimeout(250)
  }
  const cimRequest = join(directory, 'cim-request.json'), cimOutput = join(directory, 'cim-exit-observations.json')
  await writeFile(cimRequest, JSON.stringify({ schema_version: 1, known: [...observed.values()], unknown: unknown.map(entry => entry.actual) }, null, 2) + '\n', { flag: 'wx' })
  const cim = spawn(powershell, ['-NoProfile', '-File', join(sourceRoot, 'tests/swa-cli-headless/observe-process-exits.ps1'), '-RequestFile', cimRequest, '-OutputFile', cimOutput], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const cimStdout = [], cimStderr = []
  cim.stdout.on('data', chunk => cimStdout.push(chunk))
  cim.stderr.on('data', chunk => cimStderr.push(chunk))
  let cimSettled = false
  const cimClosed = new Promise(resolve => {
    cim.once('error', error => { cimSettled = true; resolve({ pid: cim.pid, spawn_error: String(error), exit: null, signal: null }) })
    cim.once('close', (exit, signal) => { cimSettled = true; resolve({ pid: cim.pid, exit, signal }) })
  })
  const cimDeadline = Date.now() + 15_000
  while (!cimSettled && Date.now() < cimDeadline) await setTimeout(50)
  const cimTimedOut = !cimSettled
  const cimTermination = cimTimedOut ? { attempted_at: new Date().toISOString(), actual_created_pid: cim.pid, signal_sent: cim.kill() } : null
  const cimCleanupDeadline = Date.now() + 5_000
  while (!cimSettled && Date.now() < cimCleanupDeadline) await setTimeout(50)
  const cimExit = { ...(cimSettled ? await cimClosed : { pid: cim.pid, exit: null, signal: null, completion_unknown: true }), query_timed_out: cimTimedOut, query_deadline_ms: 15_000, actual_helper_termination: cimTermination }
  if (!cimSettled) { cim.stdout.destroy(); cim.stderr.destroy(); cim.unref() }
  await writeFile(join(directory, 'cim.stdout.log'), Buffer.concat(cimStdout), { flag: 'wx' })
  await writeFile(join(directory, 'cim.stderr.log'), Buffer.concat(cimStderr), { flag: 'wx' })
  await writeFile(join(directory, 'cim-process-exit.json'), JSON.stringify(cimExit, null, 2) + '\n', { flag: 'wx' })
  let cimReport = null, cimError = null
  if ((await readdir(directory)).includes('cim-exit-observations.json')) {
    try { cimReport = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(cimOutput))) }
    catch (error) { cimError = String(error) }
  }
  const completeCIM = !cimTimedOut && cimExit.exit === 0 && cimExit.signal === null && cimError === null && cimReport?.schema_version === 1 && cimReport.query_failure === null && cimReport.all_exited === true && Array.isArray(cimReport.observations) && cimReport.observations.length === 2 && cimReport.observations.every(row => row.query_succeeded === true && row.complete_result_count > 0 && row.required_identity_fields_complete === true && row.known_identities_exited === true && row.unknown_pids_absent === true) && cimReport.observations[1].monotonic_ms - cimReport.observations[0].monotonic_ms >= 50
  const identitiesExited = observations.every(row => row.remaining.length === 0) && completeCIM
  const actualErrorText = Buffer.concat(stderr).toString('utf8')
  const startupHit = !mode.startsWith('startup-') || events.some(event => event.type === 'actual-owned-node-observed' && event.no_published_readiness)
  const record = { mode, pid: child.pid, ...settled, events, actual_spawn_error: spawnError?.message ?? null, actual_stream_error: streamError, observed_processes: [...observed.values()], unknown_process_observations: unknown, exit_observations: observations, actual_cim_process_exit: cimExit, actual_cim_report: cimReport, actual_cim_error: cimError, status: !identitiesExited ? 'UNKNOWN' : startupHit ? 'AWAITING_ASSERTIONS' : 'INCONCLUSIVE' }
  await writeFile(join(directory, 'actual-observation.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' })
  if (!identitiesExited) {
    records.push(record)
    await writeFile(join(directory, 'result.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' })
    process.exitCode = 6
    break
  }
  if (spawnError) throw spawnError
  assert.equal(settled.signal, null)
  assert.equal(acted, true)
  const beforeReady = mode === 'immediate-eof' || mode === 'startup-eof'
  if (beforeReady && startupHit) {
    assert.ok([130, 6].includes(settled.exit))
    const reply = JSON.parse(Buffer.concat(stdout).toString('utf8'))
    assert.equal(reply.ok, false)
    assert.equal(reply.error.code, 'delivery_unknown')
  } else if (mode === 'readiness-eof') {
    assert.equal(settled.exit, 0)
    assert.equal(JSON.parse(Buffer.concat(stdout).toString('utf8')).ok, true)
  } else if (mode === 'startup-stdout-close' && startupHit) {
    assert.equal(settled.exit, 6)
    assert.match(actualErrorText, /readiness|stdout|输出|R=/)
    assert.equal(actualErrorText.match(/^已知关联：.*$/gm)?.length, 1)
    assert.match(actualErrorText, /^已知关联：runtime_id="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"\r?$/m)
  }
  if (mode !== 'immediate-eof') {
    assert.match(actualErrorText, /active=1 consecutive=1/)
    assert.match(actualErrorText, /active=1 consecutive=2/)
  }
  record.status = startupHit ? 'OBSERVED' : 'INCONCLUSIVE'
  records.push(record)
  await writeFile(join(directory, 'result.json'), JSON.stringify(records.at(-1), null, 2) + '\n', { flag: 'wx' })
}
await writeFile(join(evidence, 'result.json'), JSON.stringify({ candidate, source_revision: source, selected_modes: selectedModes, unselected_modes: modes.filter(mode => !selectedModes.includes(mode)), records, model_calls: 0, human_session_created: false, remainingCases: selectedModes.filter(mode => !records.some(row => row.mode === mode && row.status === 'OBSERVED')) }, null, 2) + '\n', { flag: 'wx' })
if (records.some(row => row.status !== 'OBSERVED')) process.exitCode = 6
