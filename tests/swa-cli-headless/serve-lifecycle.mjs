import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { renameSync, writeFileSync } from 'node:fs'
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { setTimeout } from 'node:timers/promises'
import { collectOwnedIncarnations } from './process-incarnation-closure.mjs'

const { values } = parseArgs({ options: { ...Object.fromEntries(['candidate', 'evidence', 'data-parent', 'protected-roots', 'port', 'mode', 'source-revision', 'edition'].map(name => [name, { type: 'string' }])), 'controller-input-check': { type: 'boolean', default: false }, 'retain-query-evidence': { type: 'boolean', default: false } }, allowPositionals: false })
const edition = values.edition ?? 'cli'
assert.ok(['cli', 'combined'].includes(edition), 'Unknown candidate edition')
for (const key of ['candidate', 'evidence', 'data-parent']) assert.ok(values[key] && isAbsolute(values[key]))
assert.ok(values['protected-roots'] && /^\d+$/.test(values.port))
const candidate = await realpath(values.candidate), evidence = values.evidence, dataParent = values['data-parent']
assert.equal((await realpath(process.execPath)).toLowerCase(), join(candidate, 'node', 'node.exe').toLowerCase())
await mkdir(evidence)
const source = (await readFile(join(candidate, 'VERSION'), 'utf8')).trim()
assert.match(source, /^[0-9a-f]{40}$/)
if (edition === 'combined') assert.equal((await readFile(join(candidate, 'EDITION'), 'utf8')).trim(), edition)
if (values['source-revision'] !== undefined) {
  assert.match(values['source-revision'], /^[0-9a-f]{40}$/)
  assert.equal(source, values['source-revision'])
}
assert.equal(execFileSync(join(candidate, 'swa.exe'), ['--version'], { encoding: 'utf8', windowsHide: true }).trim(), source)
const requireRuntime = createRequire(join(candidate, 'runtime', 'package.json'))
const native = requireRuntime('@vscode/windows-process-tree')
const security = requireRuntime('@orca/windows-security')
const sourceRoot = await realpath(join(dirname(import.meta.filename), '..', '..'))
assert.ok(process.env.ProgramFiles && isAbsolute(process.env.ProgramFiles))
const powershell = await realpath(join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe'))
const processes = () => new Promise((resolve, reject) => native.getAllProcesses(rows => rows ? resolve(rows) : reject(new Error('Actual process identities unavailable')), 4))
const records = []
const modes = ['immediate-eof', 'startup-eof', 'readiness-eof', 'startup-stdout-close']
assert.ok(values.mode === undefined || modes.includes(values.mode))
const selectedModes = values.mode === undefined ? modes : [values.mode]
if (values['controller-input-check']) assert.equal(values.mode, 'readiness-eof', 'Controller input checking requires the explicit readiness-eof mode')
if (values['retain-query-evidence']) assert.ok(values['controller-input-check'] && values.mode === 'readiness-eof')

// 仅记录这次观察器实际取得的输入和事件；不改变原所有权集合或退出门。
async function retainQueryEvidence(directory) {
  const digest = bytes => createHash('sha256').update(bytes).digest('hex')
  const nativeRoot = dirname(requireRuntime.resolve('@vscode/windows-process-tree/package.json'))
  const sources = Object.fromEntries(await Promise.all([
    ['observer', import.meta.filename], ['producer', join(dirname(import.meta.filename), 'controller-taskcreate-check.mjs')],
    ['closure', join(dirname(import.meta.filename), 'process-incarnation-closure.mjs')], ['native', join(nativeRoot, 'build/Release/windows_process_tree.node')]
  ].map(async ([name, path]) => [name, digest(await readFile(path))])))
  const query = { schema_version: 2, source_revision: source, sources, status: 'OBSERVING', evidence_incomplete: false, error_kind: null, first_failure: null, observer_abort: null,
    query_count: 0, ownership_closure_incomplete: false, first_sample: null, first_unknown_sample: null, last_sample: null }
  const lifecycle = { schema_version: 2, source_revision: source, sources, status: 'OBSERVING', evidence_incomplete: false, error_kind: null, first_failure: null, observer_abort: null, events: [] }
  const origins = new Map()
  const kinds = ['serve_native_identity', 'callback_owned', 'named_job_member', 'transport_native_identity', 'transport_receipt_identity', 'producer_command_native_identity', 'controller_receipt_native_identity']
  const roles = ['serve', 'runtime', 'server', 'daemon', 'callback', 'transport', 'tty_root', 'tty_helper', 'pipe_helper', 'producer_command', 'controller_process', 'controller_helper']
  const eventKinds = ['spawn', 'spawn-error', 'identity-confirm', 'receipt-observed', 'exit', 'close', 'stdout-end', 'stderr-end', 'stdin-end-request', 'stdin-finish', 'cleanup-request']
  const instant = () => ({ observed_at_ms: Date.now(), monotonic_ms: performance.now() })
  const uint = value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff
  const identity = value => { assert.ok(value && uint(value.pid) && value.pid > 0 && Number.isSafeInteger(value.creationTimeMs) && value.creationTimeMs > 0); return { pid: value.pid, creationTimeMs: value.creationTimeMs } }
  const fail = kind => { query.evidence_incomplete = lifecycle.evidence_incomplete = true; query.error_kind ??= kind; lifecycle.error_kind ??= kind }
  const save = (fileName, value, maximum) => {
    try {
      const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n'); assert.ok(bytes.length <= maximum)
      const temporary = join(directory, fileName + '.pending')
      writeFileSync(temporary, bytes)
      renameSync(temporary, join(directory, fileName))
    }
    catch { fail('EVIDENCE_WRITE_OR_LIMIT') }
  }
  const failurePhases = {
    observer: ['spawn-record', 'query-freeze', 'native-query', 'collect-primary', 'collect-additional', 'record-query', 'write-unknown', 'write-latest', 'readiness-envelope', 'start-readiness-work', 'stdin-eof', 'loop-wait', 'await-readiness-work', 'save-service-streams', 'require-service-settled', 'native-exit-query', 'cim-request', 'cim-spawn', 'cim-wait', 'cim-read', 'exit-verdict', 'save-final-record', 'service-assertions'],
    readiness: ['ready-service', 'job-members', 'ready-record', 'controller-input'],
    'controller-input': ['prepare-output', 'import-producer', 'transport-spawn', 'transport-identity', 'transport-wait', 'transport-report', 'transport-validate', 'transport-receipts', 'producer-call'],
    'producer-command': ['identity', 'wait-close'],
    producer: ['public-clone', 'human-project-permission', 'controller-open', 'task-create', 'controller-observe-close', 'complete']
  }
  const errorNames = ['Error', 'AssertionError', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'SystemError', 'UNKNOWN']
  const errorCodes = ['ERR_ASSERTION', 'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE', 'ERR_SWA_CONTROLLER_INPUT', 'ENOENT', 'EACCES', 'EPERM', 'EEXIST', 'ENOSPC', 'EMFILE', 'EIO', 'ETIMEDOUT', 'EPIPE', 'ECONNRESET', 'ECONNREFUSED', 'ABORT_ERR', 'UNKNOWN']
  const requireSource = createRequire(join(sourceRoot, 'package.json'))
  const errorStackParser = requireSource(join(sourceRoot, 'node_modules/error-stack-parser'))
  const allowedLocations = new Map()
  for (const [file, name] of [['observer', 'serve-lifecycle.mjs'], ['producer', 'controller-taskcreate-check.mjs'], ['transport', 'controller-input-check.mjs'], ['closure', 'process-incarnation-closure.mjs']]) {
    const path = join(dirname(import.meta.filename), name), source_sha256 = digest(await readFile(path))
    for (const location of [path, pathToFileURL(path).href]) allowedLocations.set(location, { file, source_sha256 })
  }
  const failureLocations = error => {
    try {
      const stack = error?.stack
      if (typeof stack !== 'string') return { status: 'NOT_RECORDED', frames: [] }
      if (Buffer.byteLength(stack) > 64 * 1024) return { status: 'BOUND_EXCEEDED', frames: [] }
      const frames = []
      for (const frame of errorStackParser.parse({ stack })) {
        const known = allowedLocations.get(frame.fileName)
        if (!known) continue
        const lineNumber = frame.lineNumber, column = frame.columnNumber
        if (![lineNumber, column].every(value => Number.isSafeInteger(value) && value > 0 && value <= 1000000) || frames.length === 8) return { status: 'BOUND_EXCEEDED', frames: [] }
        frames.push({ ...known, line: lineNumber, column })
      }
      return { status: frames.length ? 'CAPTURED' : 'NO_ALLOWED_FRAME', frames }
    } catch { return { status: 'NOT_RECORDED', frames: [] } }
  }
  const diagnosticFailure = (error, component, phase, facts, observerAbort = false) => {
    try {
      if (query.first_failure && !observerAbort) return
      assert.ok(Object.hasOwn(failurePhases, component) && failurePhases[component].includes(phase))
      const bool = value => { assert.equal(typeof value, 'boolean'); return value }
      const count = value => { assert.ok(Number.isSafeInteger(value) && value >= 0); return value }
      const nullableIdentity = value => value === null ? null : identity(value)
      const nullableIndex = value => value === null ? null : count(value)
      let actual
      if (component === 'observer') actual = {
        query_sequence: count(facts.query_sequence), root: nullableIdentity(facts.root), scope_index: nullableIndex(facts.scope_index), check_index: nullableIndex(facts.check_index),
        closed: bool(facts.closed), acted: bool(facts.acted), readiness_started: bool(facts.readiness_started), readiness_complete: bool(facts.readiness_complete),
        closure_incomplete: bool(facts.closure_incomplete), root_exit_seen: bool(facts.root_exit_seen), root_close_seen: bool(facts.root_close_seen)
      }
      else if (component === 'readiness') actual = { readiness_started: bool(facts.readiness_started), readiness_complete: bool(facts.readiness_complete), controller_input_recorded: bool(facts.controller_input_recorded) }
      else if (component === 'controller-input') actual = { transport_identity: nullableIdentity(facts.transport_identity), transport_spawned: bool(facts.transport_spawned), transport_closed: bool(facts.transport_closed), producer_recorded: bool(facts.producer_recorded) }
      else if (component === 'producer-command') {
        assert.ok(typeof facts.command_name === 'string' && /^(?:git|cli)-[0-9]{2,8}$/.test(facts.command_name))
        assert.ok(count(facts.command_sequence) > 0 && Number(facts.command_name.split('-')[1]) === facts.command_sequence)
        let exit = null
        if (facts.exit !== null) {
          assert.ok(facts.exit.exit === null || Number.isSafeInteger(facts.exit.exit))
          exit = { exit: facts.exit.exit, signal: facts.exit.signal === null ? null : ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGHUP', 'SIGPIPE'].includes(facts.exit.signal) ? facts.exit.signal : 'UNKNOWN',
            spawn_error: facts.exit.spawn_error === null ? null : errorCodes.includes(facts.exit.spawn_error) ? facts.exit.spawn_error : 'UNKNOWN' }
        }
        actual = { command_name: facts.command_name, command_sequence: facts.command_sequence, identity: nullableIdentity(facts.identity), exit,
          timed_out: bool(facts.timed_out), stdout_eof: bool(facts.stdout_eof), stderr_eof: bool(facts.stderr_eof), stream_failure: bool(facts.stream_failure), cleanup_attempted: bool(facts.cleanup_attempted) }
      } else {
        assert.ok(['main', 'grant-revoke', 'dispatcher-close'].includes(facts.operation))
        actual = { operation: facts.operation, request_id_assigned: bool(facts.request_id_assigned), grant_created: bool(facts.grant_created), controller_recorded: bool(facts.controller_recorded) }
      }
      const record = { component, phase, at: instant(), error: { name: typeof error?.name === 'string' && errorNames.includes(error.name) ? error.name : 'UNKNOWN',
        code: error?.code === undefined || error?.code === null ? null : typeof error.code === 'string' && errorCodes.includes(error.code) ? error.code : 'UNKNOWN' }, facts: actual, locations: failureLocations(error) }
      assert.ok(Buffer.byteLength(JSON.stringify(record)) <= 4096)
      query.first_failure ??= record; lifecycle.first_failure ??= record
      if (observerAbort) query.observer_abort = lifecycle.observer_abort = record
      save('service-query-evidence.json', query, 8 * 1024 * 1024); save('service-process-lifecycle.json', lifecycle, 2 * 1024 * 1024)
    } catch { fail('FAILURE_RECORD_INCOMPLETE') }
  }
  const sourceInfo = value => {
    assert.ok(value && kinds.includes(value.kind) && roles.includes(value.role))
    const info = { kind: value.kind, role: value.role, command_sequence: value.command_sequence ?? null, command_name: value.command_name ?? null,
      query_sequence: value.query_sequence ?? null, scope_index: value.scope_index ?? null, scope_anchor: value.scope_anchor ? identity(value.scope_anchor) : null }
    assert.ok(info.command_sequence === null || Number.isSafeInteger(info.command_sequence) && info.command_sequence > 0)
    assert.ok(info.command_name === null || typeof info.command_name === 'string' && /^(?:git|cli)-[0-9]{2,8}$/.test(info.command_name))
    assert.ok(info.query_sequence === null || Number.isSafeInteger(info.query_sequence) && info.query_sequence > 0)
    assert.ok(info.scope_index === null || Number.isSafeInteger(info.scope_index) && info.scope_index >= 0 && info.scope_index <= 2048)
    return info
  }
  const event = value => {
    try {
      assert.ok(eventKinds.includes(value.kind)); assert.ok(lifecycle.events.length < 4096)
      const row = { sequence: lifecycle.events.length + 1, at: instant(), kind: value.kind, source: sourceInfo(value.source),
        pid: value.pid ?? null, identity: value.identity ? identity(value.identity) : null,
        exit: value.exit ?? null, signal: value.signal ?? null, spawn_error: value.spawn_error ?? null,
        stdio_policy: value.kind === 'spawn' ? value.source.kind === 'serve_native_identity' ? 'pipe_pipe_pipe' : 'ignore_pipe_pipe' : null }
      assert.ok(row.pid === null || uint(row.pid) && row.pid > 0)
      assert.ok(row.exit === null || Number.isSafeInteger(row.exit))
      for (const atom of [row.signal, row.spawn_error]) assert.ok(atom === null || typeof atom === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(atom))
      if (row.identity) assert.equal(row.pid, row.identity.pid)
      assert.ok(Buffer.byteLength(JSON.stringify({ ...lifecycle, events: [...lifecycle.events, row] }, null, 2)) < 2 * 1024 * 1024 - 1024)
      lifecycle.events.push(row)
      save('service-process-lifecycle.json', lifecycle, 2 * 1024 * 1024)
      return row
    } catch { fail('LIFECYCLE_INCOMPLETE'); return null }
  }
  const confirmed = (value, metadata) => {
    try {
      const actual = identity(value), info = sourceInfo(metadata), key = actual.pid + ':' + actual.creationTimeMs
      const row = event({ kind: info.kind.includes('receipt') ? 'receipt-observed' : 'identity-confirm', source: info, pid: actual.pid, identity: actual })
      if (!row) return
      if (!origins.has(key)) {
        assert.ok(origins.size < 2048)
        origins.set(key, { identity: actual, confirmed_at: row.at, event_sequence: row.sequence, source: info })
      }
    } catch { fail('SOURCE_INCOMPLETE') }
  }
  const before = (prior, additional) => {
    try {
      assert.ok(prior.length <= 2048 && additional.length <= 2048)
      const prior_sources = prior.map(value => { const actual = identity(value), item = origins.get(actual.pid + ':' + actual.creationTimeMs); assert.ok(item); return structuredClone(item) })
      return { prior_sources, additional_roots: additional.map(identity) }
    } catch { fail('PRIOR_SOURCE_INCOMPLETE'); return null }
  }
  const scope = (anchor, result, prior, window) => {
    try {
      const actual = identity(anchor), origin = origins.get(actual.pid + ':' + actual.creationTimeMs)
      assert.ok(origin)
      return { anchor: actual, source: structuredClone(origin), existed_before_query: prior.some(value => value.pid === anchor.pid && value.creationTimeMs === anchor.creationTimeMs),
        confirmed_during_query: origin.confirmed_at.monotonic_ms >= window.start.monotonic_ms && origin.confirmed_at.monotonic_ms <= window.end.monotonic_ms,
        result: { rootVerified: result.rootVerified, ownedRows: [...result.ownedRows], excludedEdges: [...result.excludedEdges], unknownRows: [...result.unknownRows] } }
    } catch { fail('SCOPE_SOURCE_INCOMPLETE'); return null }
  }
  const sample = value => {
    query.query_count = value.sequence
    query.ownership_closure_incomplete = value.ownership_closure_incomplete
    try {
      assert.ok(value.before && value.rows.length > 0 && value.rows.length <= 16384 && value.scopes.length <= 2049 && value.scopes.every(Boolean))
      for (const row of value.rows) {
        assert.deepEqual(Object.keys(row).sort(), ['pid', 'ppid', 'name', 'creationTimeDiagnosticVersion', 'creationTimeProvider', 'creationTimeNtStatus', 'creationTimeSnapshotComplete', ...(Object.hasOwn(row, 'creationTimeMs') ? ['creationTimeMs'] : [])].sort())
        assert.ok(uint(row.pid) && row.pid > 0 && uint(row.ppid))
        assert.ok(typeof row.name === 'string' && row.name.length <= 260 && /^[\p{L}\p{N}_. ()-]*$/u.test(row.name))
        assert.equal(row.creationTimeDiagnosticVersion, 2); assert.equal(row.creationTimeProvider, 'NtQuerySystemInformation')
        assert.ok(uint(row.creationTimeNtStatus)); assert.equal(typeof row.creationTimeSnapshotComplete, 'boolean')
        if (Object.hasOwn(row, 'creationTimeMs')) identity(row)
        if (!row.creationTimeSnapshotComplete || row.creationTimeNtStatus > 0x7fffffff || row.creationTimeNtStatus !== value.rows[0].creationTimeNtStatus) fail('NATIVE_BATCH_INCOMPLETE')
      }
      const actual = structuredClone(value), next = { ...query, first_sample: query.first_sample ?? actual,
        first_unknown_sample: query.first_unknown_sample ?? (value.scopes.some(item => item.result.unknownRows.length > 0) ? actual : null), last_sample: actual }
      assert.ok(Buffer.byteLength(JSON.stringify(next, null, 2)) < 8 * 1024 * 1024 - 1024)
      const first = query.first_sample === null, firstUnknown = query.first_unknown_sample === null && next.first_unknown_sample !== null
      Object.assign(query, next)
      if (first || firstUnknown || query.evidence_incomplete) save('service-query-evidence.json', query, 8 * 1024 * 1024)
    } catch { fail('QUERY_EVIDENCE_INCOMPLETE'); save('service-query-evidence.json', query, 8 * 1024 * 1024) }
  }
  const owned = (rows, scopes, sequence) => {
    for (const row of rows) if (!origins.has(row.pid + ':' + row.creationTimeMs)) {
      const index = scopes.findIndex(item => item?.result.ownedRows.includes(row))
      if (index < 0) { fail('OWNED_SCOPE_MISSING'); continue }
      confirmed(row, { kind: 'callback_owned', role: 'callback', query_sequence: sequence, scope_index: index, scope_anchor: scopes[index].anchor })
    }
  }
  const finish = incomplete => {
    query.ownership_closure_incomplete = incomplete
    query.status = lifecycle.status = query.evidence_incomplete ? 'INCOMPLETE' : 'COMPLETE'
    save('service-query-evidence.json', query, 8 * 1024 * 1024); save('service-process-lifecycle.json', lifecycle, 2 * 1024 * 1024)
    return { evidence_incomplete: query.evidence_incomplete, error_kind: query.error_kind, query_count: query.query_count, event_count: lifecycle.events.length }
  }
  save('service-query-evidence.json', query, 8 * 1024 * 1024); save('service-process-lifecycle.json', lifecycle, 2 * 1024 * 1024)
  return { event, confirmed, before, scope, sample, owned, finish, diagnosticFailure,
    aborted: (error, phase, facts) => { diagnosticFailure(error, 'observer', phase, facts, true); fail('OBSERVER_ABORTED') },
    unavailable: () => { fail('QUERY_FAILED'); save('service-query-evidence.json', query, 8 * 1024 * 1024) } }
}

async function observeControllerInput(endpoint, data, directory, deadline, observeIdentity, processEvent, diagnosticFailure) {
  const observation = { status: 'FAIL', ownership_incomplete: false, producer: null, transport: null, transport_process: null, transport_actual_spawned: false }
  let control, controlClosed = false, controlExit, failure
  const output = [], errors = []
  let outputBytes = 0, errorBytes = 0, outputEOF = false, errorEOF = false, streamFailure = false
  const outputParent = join(directory, 'controller-input')
  let inputPhase = 'prepare-output'
  await mkdir(outputParent)
  try {
    inputPhase = 'import-producer'
    const { runControllerTaskCreateCheck } = await import('./controller-taskcreate-check.mjs')
    inputPhase = 'producer-call'
    const producer = await runControllerTaskCreateCheck({ candidate, endpoint, dataRoot: data,
      publicParent: join(dataParent, 'controller-input-public'), outputDir: join(outputParent, 'producer'),
      sourceRevision: source, deadline, onProcessIdentity: observeIdentity, onProcessEvent: processEvent, onDiagnosticFailure: diagnosticFailure })
    observation.producer = producer.result
    const transportOutput = join(outputParent, 'transport')
    inputPhase = 'transport-spawn'
    control = spawn(process.execPath, [join(sourceRoot, 'tests/swa-cli-headless/controller-input-check.mjs'), '--install-root', candidate,
      '--invocation-file', producer.invocationFile, '--output-dir', transportOutput], { cwd: candidate, env: { ...process.env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    observation.transport_actual_spawned = Number.isSafeInteger(control.pid) && control.pid > 0
    const transportEvent = (kind, details = {}) => processEvent?.({ kind, source: { kind: 'transport_native_identity', role: 'transport' }, pid: control.pid ?? null, identity: observation.transport_process, ...details })
    transportEvent('spawn')
    const closed = new Promise(resolve => {
      control.once('error', error => { transportEvent('spawn-error', { spawn_error: typeof error.code === 'string' ? error.code : 'UNKNOWN' }); controlClosed = true; controlExit = { exit: null, signal: null, spawn_error: typeof error.code === 'string' ? error.code : 'UNKNOWN' }; resolve(controlExit) })
      control.once('close', (exit, signal) => { transportEvent('close', { exit, signal }); controlClosed = true; controlExit = { exit, signal, spawn_error: null }; resolve(controlExit) })
    })
    control.once('exit', (exit, signal) => transportEvent('exit', { exit, signal }))
    control.stdout.on('data', chunk => { outputBytes += chunk.length; if (outputBytes <= 64 * 1024) output.push(chunk); else streamFailure = true })
    control.stderr.on('data', chunk => { errorBytes += chunk.length; if (errorBytes <= 256 * 1024) errors.push(chunk); else streamFailure = true })
    control.stdout.on('end', () => { outputEOF = true; transportEvent('stdout-end') })
    control.stderr.on('end', () => { errorEOF = true; transportEvent('stderr-end') })
    for (const stream of [control.stdout, control.stderr]) stream.on('error', () => { streamFailure = true })
    inputPhase = 'transport-identity'
    assert.ok(Number.isSafeInteger(control.pid) && control.pid > 0)
    const created = native.getProcessCreationTime(control.pid)
    assert.ok(Number.isSafeInteger(created) && created > 0, 'Actual transport process identity is unavailable')
    observation.transport_process = { pid: control.pid, creationTimeMs: created }
    observeIdentity(observation.transport_process, { kind: 'transport_native_identity', role: 'transport' })
    inputPhase = 'transport-wait'
    const transportDeadline = Math.min(deadline, Date.now() + 120_000)
    while (!controlClosed && Date.now() < transportDeadline) await setTimeout(25)
    assert.equal(controlClosed, true, 'Installed helper transport completion remains unknown')
    await closed
    observation.transport_exit = controlExit
    inputPhase = 'transport-report'
    const reportPath = join(transportOutput, 'report.json')
    assert.ok((await lstat(reportPath)).isFile() && (await lstat(reportPath)).size <= 2 * 1024 * 1024)
    const transportReport = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(reportPath)))
    inputPhase = 'transport-validate'
    const summary = transportReport.summary
    assert.equal(summary?.schema, 'swa.controller-input-check.v1')
    assert.ok(['PASS', 'FAIL'].includes(summary.status)); assert.equal(summary.platform, 'win32')
    const safeTransport = { schema: summary.schema, status: summary.status, platform: summary.platform }
    for (const kind of ['tty', 'pipe']) {
      const row = summary[kind]
      assert.ok(row && ['PASS', 'FAIL'].includes(row.status))
      assert.equal(typeof row.natural_eof, 'boolean'); assert.equal(typeof row.forced_cleanup, 'boolean')
      assert.ok(Number.isSafeInteger(row.reply_count) && row.reply_count >= 0 && row.reply_count <= 3)
      assert.ok(row.long_bytes === null || Number.isSafeInteger(row.long_bytes) && row.long_bytes > 0 && row.long_bytes <= 1024 * 1024)
      assert.ok(row.exit_code === null || Number.isInteger(row.exit_code))
      safeTransport[kind] = { status: row.status, natural_eof: row.natural_eof, forced_cleanup: row.forced_cleanup,
        reply_count: row.reply_count, long_bytes: row.long_bytes, exit_code: row.exit_code }
    }
    assert.equal(summary.rpc_mutations, 'NOT_RUN'); assert.equal(summary.model_execution, 'NOT_RUN'); assert.equal(summary.kernel_job_empty, 'NOT_CLAIMED')
    Object.assign(safeTransport, { rpc_mutations: 'NOT_RUN', model_execution: 'NOT_RUN', kernel_job_empty: 'NOT_CLAIMED' })
    observation.transport = safeTransport
    inputPhase = 'transport-receipts'
    // 这些身份由原 checker 在进程仍可读时取得，不在退出后用裸 PID 补取创建时间。
    for (const identity of [transportReport.tty?.root, transportReport.tty?.helper, transportReport.pipe?.helper]) {
      assert.ok(identity && Number.isSafeInteger(identity.pid) && identity.pid > 0 && Number.isSafeInteger(identity.creationTimeMs) && identity.creationTimeMs > 0)
      observeIdentity({ pid: identity.pid, creationTimeMs: identity.creationTimeMs }, { kind: 'transport_receipt_identity',
        role: identity === transportReport.tty?.root ? 'tty_root' : identity === transportReport.tty?.helper ? 'tty_helper' : 'pipe_helper' })
    }
    assert.deepEqual(controlExit, { exit: 0, signal: null, spawn_error: null })
    assert.ok(outputEOF && errorEOF && !streamFailure)
    assert.equal(safeTransport.status, 'PASS')
    for (const kind of ['tty', 'pipe']) {
      const row = safeTransport[kind]
      assert.equal(row.status, 'PASS'); assert.equal(row.natural_eof, true); assert.equal(row.forced_cleanup, false)
      assert.equal(row.reply_count, 3); assert.ok(row.long_bytes > 4095); assert.equal(row.exit_code, 0)
    }
    observation.status = 'PASS'
  } catch (error) {
    diagnosticFailure?.(error, 'controller-input', inputPhase, { transport_identity: observation.transport_process, transport_spawned: observation.transport_actual_spawned,
      transport_closed: controlClosed, producer_recorded: observation.producer !== null })
    failure = error
    if (error.observation) observation.producer = error.observation
    observation.ownership_incomplete ||= observation.producer?.ownership_incomplete === true || observation.transport_actual_spawned && !observation.transport_process
    observation.error = { name: error instanceof Error ? error.name : 'UnknownError', code: typeof error.code === 'string' ? error.code : null }
  } finally {
    if (control && !controlClosed) {
      const identity = observation.transport_process
      let cleanupAttempted = false
      if (identity && native.getProcessCreationTime(identity.pid) === identity.creationTimeMs) {
        processEvent?.({ kind: 'cleanup-request', source: { kind: 'transport_native_identity', role: 'transport' }, pid: identity.pid, identity })
        cleanupAttempted = control.kill()
      }
      const cleanupDeadline = Date.now() + 5000
      while (!controlClosed && Date.now() < cleanupDeadline) await setTimeout(25)
      observation.transport_cleanup = { attempted: cleanupAttempted, exit: controlClosed ? controlExit : 'UNKNOWN', normal_exit_proven: false }
      if (!controlClosed) { control.stdout.destroy(); control.stderr.destroy(); control.unref() }
    }
    observation.transport_exit ??= controlExit ?? 'NOT_STARTED'
    observation.transport_streams = { stdout_bytes: outputBytes, stderr_bytes: errorBytes, stdout_eof: outputEOF, stderr_eof: errorEOF, failure: streamFailure }
    await writeFile(join(outputParent, 'transport.stdout'), Buffer.concat(output), { flag: 'wx' })
    await writeFile(join(outputParent, 'transport.stderr'), Buffer.concat(errors), { flag: 'wx' })
  }
  if (failure) {
    const error = new Error('The actual controller input check failed; bounded observations retained')
    error.code = 'ERR_SWA_CONTROLLER_INPUT'
    error.observation = observation
    throw error
  }
  return observation
}
async function webAssetInventory(installation) {
  const root = await realpath(join(installation, 'web'))
  const manifestFile = join(root, '.vite', 'manifest.json')
  assert.ok((await lstat(manifestFile)).size <= 1024 * 1024, 'Web manifest exceeds its read bound')
  const { checkWebAssets } = await import(pathToFileURL(join(installation, 'scripts', 'swa-package-config.mjs')).href)
  const closure = await checkWebAssets(root)
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  const references = new Set(['index.html'])
  for (const entry of Object.values(manifest)) {
    references.add(entry.file)
    for (const field of ['css', 'assets']) for (const path of entry[field] ?? []) references.add(path)
  }
  assert.ok(references.size <= 128, 'Web asset count exceeds its read bound')
  const mimeTypes = { '.html': ['text/html'], '.js': ['text/javascript', 'application/javascript'], '.mjs': ['text/javascript', 'application/javascript'], '.css': ['text/css'], '.svg': ['image/svg+xml'], '.json': ['application/json'], '.png': ['image/png'], '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'], '.gif': ['image/gif'], '.webp': ['image/webp'], '.ico': ['image/x-icon', 'image/vnd.microsoft.icon'], '.woff': ['font/woff'], '.woff2': ['font/woff2'] }
  const files = []
  let total = 0
  for (const path of references) {
    assert.ok(path.split('/').every(part => part && part !== '.' && part !== '..'), 'Web HTTP reference has an ambiguous path segment')
    const info = await lstat(join(root, path))
    assert.ok(info.isFile() && info.size <= 16 * 1024 * 1024, 'Web asset exceeds its read bound')
    total += info.size
    assert.ok(total <= 64 * 1024 * 1024, 'Total Web assets exceed their read bound')
    const types = mimeTypes[extname(path).toLowerCase()]
    assert.ok(types, 'Web asset MIME type is not covered by this check')
    const bytes = await readFile(join(root, path))
    assert.equal(bytes.length, info.size)
    files.push({ path, bytes, types, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  return { root, closure, files }
}

async function observeWebAssets(endpoint, deadline, output) {
  const observation = { source_revision: source, edition, endpoint, status: 'NOT_RUN', requests: [] }
  async function request(path, maximum) {
    const remaining = deadline - Date.now()
    assert.ok(remaining > 0, 'Web HTTP check reached the original service deadline')
    const response = await fetch(new URL(path, endpoint + '/'), { redirect: 'manual', signal: AbortSignal.timeout(Math.min(5000, remaining)) })
    const chunks = [], reader = response.body?.getReader()
    let size = 0, complete = false
    try {
      if (reader) for (;;) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        assert.ok(size <= maximum, 'Web HTTP response exceeds its actual installed file bound')
        chunks.push(Buffer.from(part.value))
      }
      complete = true
    } finally {
      if (reader) {
        if (!complete) await reader.cancel()
        reader.releaseLock()
      }
    }
    return { response, bytes: Buffer.concat(chunks) }
  }
  try {
    const inventory = await webAssetInventory(candidate)
    observation.manifest = inventory.closure
    const redirect = await request('/index.html', 64 * 1024)
    observation.requests.push({ path: '/index.html', status: redirect.response.status, location: redirect.response.headers.get('location') })
    assert.equal(redirect.response.status, 301)
    assert.equal(redirect.response.headers.get('location'), './')
    assert.equal(new URL(redirect.response.headers.get('location'), endpoint + '/index.html').href, endpoint + '/')
    for (const file of inventory.files) {
      const path = file.path === 'index.html' ? '/' : '/' + file.path.split('/').map(encodeURIComponent).join('/')
      const actual = await request(path, file.bytes.length)
      const contentType = actual.response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? null
      const sha256 = createHash('sha256').update(actual.bytes).digest('hex')
      observation.requests.push({ path, status: actual.response.status, content_type: contentType, byte_length: actual.bytes.length, sha256, installed_sha256: file.sha256 })
      assert.equal(actual.response.status, 200)
      assert.ok(file.types.includes(contentType), 'Web HTTP MIME differs from the actual asset type')
      assert.equal(sha256, file.sha256)
      assert.ok(actual.bytes.equals(file.bytes), 'Web HTTP content differs from the installed asset')
    }
    observation.status = 'PASS'
  } catch (error) {
    observation.status = 'FAIL'
    observation.error = { name: error instanceof Error ? error.name : 'UnknownError', code: typeof error?.code === 'string' ? error.code : null }
    throw error
  } finally {
    await writeFile(output, JSON.stringify(observation, null, 2) + '\n', { flag: 'wx' })
  }
}

async function observeReadyService(ready, child, data, created, deadline) {
  const actualData = await realpath(data), endpoint = `http://127.0.0.1:${Number(values.port)}`
  const samePath = (actual, expected) => {
    assert.equal(typeof actual, 'string')
    assert.equal(actual.toLowerCase(), expected.toLowerCase())
  }
  samePath(ready.install_root, candidate)
  samePath(ready.data_root, actualData)
  samePath(ready.readiness?.dataRoot, actualData)
  samePath(ready.readiness?.node, join(candidate, 'node', 'node.exe'))
  assert.match(ready.readiness.runtimeId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  assert.equal(ready.http, endpoint)
  const remaining = deadline - Date.now()
  assert.ok(remaining > 0, 'Health check reached the original service deadline')
  const response = await fetch(endpoint + '/api/v1/health', { redirect: 'error', signal: AbortSignal.timeout(Math.min(5000, remaining)) })
  assert.equal(response.status, 200)
  const health = await response.json()
  assert.deepEqual(health, { schema_version: 1, status: 'ok', service: 'astrocyte' })
  const metadata = JSON.parse(await readFile(join(actualData, 'orca-runtime.json'), 'utf8'))
  assert.equal(metadata.runtimeId, ready.readiness.runtimeId)
  assert.equal(metadata.pid, ready.runtime_pid)
  const daemon = JSON.parse(await readFile(join(actualData, 'daemon', 'daemon-v49.pid'), 'utf8'))
  const job = daemon.swa_service_job
  assert.match(job.name, /^Local\\SWAService[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  assert.equal(job.platform, undefined)
  assert.equal(job.source_revision, source)
  samePath(job.data_root, actualData)
  samePath(job.install_root, candidate)
  assert.equal(job.serve_pid, child.pid)
  assert.ok(Number.isSafeInteger(created) && created > 0)
  assert.equal(job.serve_created_at_ms, created)
  assert.equal(job.daemon_pid, daemon.pid)
  assert.ok(Number.isSafeInteger(job.daemon_created_at_ms) && job.daemon_created_at_ms > 0)
  assert.match(job.daemon_session, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  assert.equal(job.daemon_session, daemon.launchNonce)
  const expected = [
    { role: 'serve', pid: child.pid, created, name: 'swa.exe' },
    { role: 'runtime', pid: ready.runtime_pid, name: 'node.exe' },
    { role: 'server', pid: ready.server_pid, name: 'server.exe' },
    { role: 'daemon', pid: job.daemon_pid, created: job.daemon_created_at_ms, name: 'node.exe' }
  ]
  assert.equal(new Set(expected.map(member => member.pid)).size, expected.length)
  const rows = await processes(), user = security.currentUserSid(), members = []
  for (const member of expected) {
    assert.ok(Number.isSafeInteger(member.pid) && member.pid > 0)
    const actual = security.readServiceJobMember(job.name, member.pid)
    assert.equal(actual.name, job.name)
    assert.equal(actual.pid, member.pid)
    assert.ok(Number.isSafeInteger(actual.creationTimeMs) && actual.creationTimeMs > 0)
    if (member.created !== undefined) assert.equal(actual.creationTimeMs, member.created)
    assert.equal(actual.ownerSid, user)
    assert.equal(actual.protected, true)
    const trustees = new Set([user, 'S-1-5-18'])
    assert.equal(actual.aces.length, trustees.size)
    for (const ace of actual.aces) {
      assert.equal(ace.flags, 0)
      assert.equal(ace.mask, 0x1f003f)
      assert.equal(trustees.delete(ace.sid), true)
    }
    assert.equal(trustees.size, 0)
    const process = rows.find(row => row.pid === member.pid)
    assert.ok(process)
    assert.equal(process.creationTimeMs, actual.creationTimeMs)
    assert.equal(process.name.toLowerCase(), member.name)
    if (member.role === 'runtime' || member.role === 'server') assert.equal(process.ppid, child.pid)
    members.push({ role: member.role, pid: member.pid, creation_time_ms: actual.creationTimeMs, name: process.name, parent_pid: process.ppid, actual_named_job_membership: true })
  }
  // 只保存核验所需字段，daemon PID 原记录中的 nonce 不进入证据。
  return { source_revision: source, runtime_id: ready.readiness.runtimeId, data_root: actualData, health, service_job_name: job.name, members, job_owner_and_dacl_verified: true, observed_at: new Date().toISOString() }
}
for (const mode of selectedModes) {
  const directory = join(evidence, mode)
  await mkdir(directory)
  const capture = values['retain-query-evidence'] ? await retainQueryEvidence(directory) : null
  const child = spawn(join(candidate, 'swa.exe'), ['serve', '--data-dir', join(dataParent, mode), '--port', values.port, '--protected-roots', values['protected-roots'], '--json', ...(edition === 'combined' ? ['--web-dir', join(candidate, 'web')] : [])], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env } })
  capture?.event({ kind: 'spawn', source: { kind: 'serve_native_identity', role: 'serve' }, pid: child.pid ?? null })
  const stdout = [], stderr = [], observed = new Map(), events = [], unknown = [], additionalRoots = new Map()
  const rootCreationTimeMs = native.getProcessCreationTime(child.pid)
  observed.set(child.pid + ':' + rootCreationTimeMs, { pid: child.pid, creationTimeMs: rootCreationTimeMs, launched_executable: join(candidate, 'swa.exe'), parent_pid: process.pid })
  capture?.confirmed({ pid: child.pid, creationTimeMs: rootCreationTimeMs }, { kind: 'serve_native_identity', role: 'serve' })
  const serveEvent = (kind, details = {}) => capture?.event({ kind, source: { kind: 'serve_native_identity', role: 'serve' }, pid: child.pid ?? null,
    identity: Number.isSafeInteger(rootCreationTimeMs) && rootCreationTimeMs > 0 ? { pid: child.pid, creationTimeMs: rootCreationTimeMs } : null, ...details })
  let settled = null, exitEvent = null, spawnError = null, streamError = null, closed = false, acted = false, readiness = null, readinessFailure = null
  let readinessStarted = false, readinessComplete = false, readinessWork, controllerInput = null
  let closureIncomplete = !Number.isSafeInteger(rootCreationTimeMs) || rootCreationTimeMs <= 0, sampleSequence = 0
  let failurePhase = 'spawn-record', failureQuery = 0, failureScope = null, failureCheck = null
  const failureFacts = () => ({ query_sequence: failureQuery, root: Number.isSafeInteger(rootCreationTimeMs) && rootCreationTimeMs > 0 ? { pid: child.pid, creationTimeMs: rootCreationTimeMs } : null,
    scope_index: failureScope, check_index: failureCheck, closed, acted, readiness_started: readinessStarted, readiness_complete: readinessComplete,
    closure_incomplete: closureIncomplete, root_exit_seen: exitEvent !== null, root_close_seen: settled !== null })
  try {
  const exited = new Promise(resolve => {
    child.once('error', error => { serveEvent('spawn-error', { spawn_error: typeof error.code === 'string' ? error.code : 'UNKNOWN' }); spawnError = error })
    child.once('exit', (exit, signal) => { exitEvent = { exit, signal, observed_at_ms: Date.now(), monotonic_ms: performance.now() }; serveEvent('exit', { exit, signal }) })
    child.once('close', (exit, signal) => { closed = true; settled = { exit, signal, observed_at_ms: Date.now(), monotonic_ms: performance.now() }; serveEvent('close', { exit, signal }); resolve(settled) })
  })
  child.stdout.on('end', () => serveEvent('stdout-end'))
  child.stderr.on('end', () => serveEvent('stderr-end'))
  child.stdin.on('finish', () => serveEvent('stdin-finish'))
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
  const deadline = Date.now() + (values['controller-input-check'] ? 600_000 : 150_000)
  while (!closed && Date.now() < deadline) {
    failurePhase = 'query-freeze'; failureQuery = sampleSequence + 1; failureScope = null; failureCheck = null
    // 在原生查询发出前冻结已证明 owned 的身份，不接纳查询在途或后继结果。
    const knownOwnedBeforeQuery = Object.freeze([...observed.values()].map(({ pid, creationTimeMs }) => Object.freeze({ pid, creationTimeMs })))
    const beforeQueryEvidence = capture?.before(knownOwnedBeforeQuery, [...additionalRoots.values()])
    const queryStart = { observed_at_ms: Date.now(), monotonic_ms: performance.now(), root_exit_event: exitEvent, root_close_event: settled }
    let rows
    failurePhase = 'native-query'
    try { rows = await processes() } catch (error) { capture?.diagnosticFailure(error, 'observer', failurePhase, failureFacts()); capture?.unavailable(); throw error }
    const queryEnd = { observed_at_ms: Date.now(), monotonic_ms: performance.now(), root_exit_event: exitEvent, root_close_event: settled }
    const sampleSequenceNumber = ++sampleSequence, sampleObservedAt = Date.now()
    failurePhase = 'collect-primary'; failureScope = 0
    const { rootVerified, ownedRows, excludedEdges, unknownRows } = collectOwnedIncarnations(rows, { pid: child.pid, creationTimeMs: rootCreationTimeMs }, knownOwnedBeforeQuery)
    const scopes = capture ? [capture.scope({ pid: child.pid, creationTimeMs: rootCreationTimeMs }, { rootVerified, ownedRows, excludedEdges, unknownRows }, knownOwnedBeforeQuery, { start: queryStart, end: queryEnd })] : []
    const annotatedUnknown = unknownRows.map(entry => ({ ...entry, source_anchor: entry.source_anchor ?? { kind: 'serve', pid: child.pid, creation_time_ms: rootCreationTimeMs } }))
    for (const anchor of additionalRoots.values()) {
      failurePhase = 'collect-additional'; failureScope++
      const extra = collectOwnedIncarnations(rows, anchor, knownOwnedBeforeQuery)
      if (capture) scopes.push(capture.scope(anchor, extra, beforeQueryEvidence?.additional_roots ?? [], { start: queryStart, end: queryEnd }))
      for (const row of extra.ownedRows) if (!ownedRows.some(value => value.pid === row.pid && value.creationTimeMs === row.creationTimeMs)) ownedRows.push(row)
      excludedEdges.push(...extra.excludedEdges)
      unknownRows.push(...extra.unknownRows)
      annotatedUnknown.push(...extra.unknownRows.map(entry => ({ ...entry, source_anchor: entry.source_anchor ?? { kind: 'additional', pid: anchor.pid, creation_time_ms: anchor.creationTimeMs } })))
    }
    // Once provenance is incomplete, disappearance of its first unknown PID
    // cannot prove that unobserved descendants have also exited.
    closureIncomplete ||= unknownRows.length > 0
    for (const row of ownedRows) observed.set(row.pid + ':' + row.creationTimeMs, row)
    failurePhase = 'record-query'; failureScope = null
    capture?.owned(ownedRows, scopes, sampleSequenceNumber)
    capture?.sample({ sequence: sampleSequenceNumber, query_window: { start: queryStart, end: queryEnd }, root: { pid: child.pid, creationTimeMs: rootCreationTimeMs },
      priors: knownOwnedBeforeQuery, before: beforeQueryEvidence, rows, scopes, ownership_closure_incomplete: closureIncomplete })
    if (unknownRows.length) {
      failurePhase = 'write-unknown'
      for (const entry of annotatedUnknown) unknown.push({ observed_at_ms: sampleObservedAt, sample_sequence: sampleSequenceNumber, query_window: { start: queryStart, end: queryEnd }, ...entry })
      await writeFile(join(directory, 'unknown-process-observations.json'), JSON.stringify(unknown, null, 2) + '\n')
    }
    failurePhase = 'write-latest'
    await writeFile(join(directory, 'latest-actual-observation.json'), JSON.stringify({ mode, pid: child.pid, creation_time_ms: rootCreationTimeMs, events, current_owned_processes: ownedRows, excluded_parent_edges: excludedEdges, ownership_closure_incomplete: closureIncomplete, observed_processes: [...observed.values()], unknown_process_observations: unknown, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'), observed_at_ms: Date.now() }, null, 2) + '\n')
    failurePhase = 'readiness-envelope'
    const currentStdout = Buffer.concat(stdout).toString('utf8')
    if (!readiness && currentStdout.includes('\n')) {
      readiness = JSON.parse(currentStdout)
      events.push({ type: 'actual-stdout-envelope', ok: readiness.ok, observed_at_ms: Date.now() })
    }
    if (!readinessStarted && mode === 'readiness-eof' && readiness?.ok) {
      failurePhase = 'start-readiness-work'
      readinessStarted = true
      let readinessPhase = 'ready-service'
      readinessWork = (async () => { try {
        const observation = await observeReadyService(readiness, child, join(dataParent, mode), rootCreationTimeMs, deadline)
        readinessPhase = 'job-members'
        for (const member of observation.members) {
          observed.set(member.pid + ':' + member.creation_time_ms, { pid: member.pid, creationTimeMs: member.creation_time_ms,
            ppid: member.parent_pid, name: member.name, role: member.role, actual_named_job_membership: true })
          capture?.confirmed({ pid: member.pid, creationTimeMs: member.creation_time_ms }, { kind: 'named_job_member', role: member.role })
        }
        readinessPhase = 'ready-record'
        await writeFile(join(directory, 'ready-service-observation.json'), JSON.stringify(observation, null, 2) + '\n', { flag: 'wx' })
        if (edition === 'combined') await observeWebAssets(`http://127.0.0.1:${Number(values.port)}`, deadline, join(directory, 'web-http-observation.json'))
        readinessPhase = 'controller-input'
        if (values['controller-input-check']) controllerInput = await observeControllerInput(`http://127.0.0.1:${Number(values.port)}`, join(dataParent, mode), directory, deadline, (identity, sourceInfo) => {
          assert.ok(Number.isSafeInteger(identity.pid) && identity.pid > 0 && Number.isSafeInteger(identity.creationTimeMs) && identity.creationTimeMs > 0)
          const key = identity.pid + ':' + identity.creationTimeMs
          observed.set(key, identity)
          additionalRoots.set(key, identity)
          capture?.confirmed(identity, sourceInfo)
        }, capture?.event, capture?.diagnosticFailure)
      } catch (error) {
        capture?.diagnosticFailure(error, 'readiness', readinessPhase, { readiness_started: readinessStarted, readiness_complete: readinessComplete, controller_input_recorded: controllerInput !== null })
        readinessFailure = error
        if (values['controller-input-check'] && error.observation) controllerInput = error.observation
        if (values['controller-input-check'] && (controllerInput?.ownership_incomplete || controllerInput?.producer?.ownership_incomplete)) closureIncomplete = true
      } finally {
        readinessComplete = true
      } })()
      if (!values['controller-input-check']) await readinessWork
    }
    if (!acted && mode === 'readiness-eof' && readinessComplete) {
      failurePhase = 'stdin-eof'
      serveEvent('stdin-end-request')
      child.stdin.end(); acted = true
      events.push({ type: 'actual-owned-stdin-closed', observed_at_ms: Date.now() })
    }
    if (!acted && rootVerified && mode.startsWith('startup-') && ownedRows.some(row => row.ppid === child.pid && row.name.toLowerCase() === 'node.exe')) {
      const noPublishedReadiness = !currentStdout.length
      events.push({ type: 'actual-owned-node-observed', no_published_readiness: noPublishedReadiness, observed_at_ms: Date.now() })
      if (mode === 'startup-eof') child.stdin.end()
      else child.stdout.destroy()
      acted = true
      events.push({ type: mode === 'startup-eof' ? 'actual-owned-stdin-closed' : 'actual-owned-stdout-read-end-closed', observed_at_ms: Date.now() })
    }
    failurePhase = 'loop-wait'
    if (!closed) await setTimeout(20)
  }
  failurePhase = 'await-readiness-work'
  if (readinessWork) await readinessWork
  capture?.finish(closureIncomplete)
  failurePhase = 'save-service-streams'
  await writeFile(join(directory, 'stdout.json'), Buffer.concat(stdout), { flag: 'wx' })
  await writeFile(join(directory, 'stderr.log'), Buffer.concat(stderr), { flag: 'wx' })
  failurePhase = 'require-service-settled'
  if (!closed) {
    await writeFile(join(directory, 'unsettled.json'), JSON.stringify({ pid: child.pid, observed: [...observed.values()], events }, null, 2) + '\n', { flag: 'wx' })
    throw new Error('Actual owned serve remains unsettled; preserve its recorded identity')
  }
  await exited
  const observations = []
  for (let check = 0; check < 2; check++) {
    failurePhase = 'native-exit-query'; failureCheck = check
    const rows = await processes()
    const remaining = [...observed.values()].filter(old => rows.some(row => row.pid === old.pid && (!(row.creationTimeMs > 0) || row.creationTimeMs === old.creationTimeMs)))
    observations.push({ observed_at_ms: Date.now(), remaining })
    if (check === 0) await setTimeout(250)
  }
  const cimRequest = join(directory, 'cim-request.json'), cimOutput = join(directory, 'cim-exit-observations.json')
  failurePhase = 'cim-request'; failureCheck = null
  await writeFile(cimRequest, JSON.stringify({ schema_version: 1, known: [...observed.values()], unknown: unknown.map(entry => entry.actual) }, null, 2) + '\n', { flag: 'wx' })
  failurePhase = 'cim-spawn'
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
  failurePhase = 'cim-wait'
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
  failurePhase = 'cim-read'
  if ((await readdir(directory)).includes('cim-exit-observations.json')) {
    try { cimReport = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(cimOutput))) }
    catch (error) { cimError = String(error) }
  }
  failurePhase = 'exit-verdict'
  const completeCIM = !cimTimedOut && cimExit.exit === 0 && cimExit.signal === null && cimError === null && cimReport?.schema_version === 1 && cimReport.query_failure === null && cimReport.all_exited === true && Array.isArray(cimReport.observations) && cimReport.observations.length === 2 && cimReport.observations.every(row => row.query_succeeded === true && row.complete_result_count > 0 && row.required_identity_fields_complete === true && row.known_identities_exited === true && row.unknown_pids_absent === true) && cimReport.observations[1].monotonic_ms - cimReport.observations[0].monotonic_ms >= 50
  const identitiesExited = !closureIncomplete && observations.every(row => row.remaining.length === 0) && completeCIM
  const actualErrorText = Buffer.concat(stderr).toString('utf8')
  const startupHit = !mode.startsWith('startup-') || events.some(event => event.type === 'actual-owned-node-observed' && event.no_published_readiness)
  const record = { mode, edition, pid: child.pid, ...settled, service_process_observations: { pid: child.pid, creation_time_ms: rootCreationTimeMs, exit_event: exitEvent, close_event: settled }, events, actual_spawn_error: spawnError?.message ?? null, actual_stream_error: streamError, readiness_check_error: readinessFailure ? { name: readinessFailure instanceof Error ? readinessFailure.name : 'UnknownError', code: typeof readinessFailure?.code === 'string' ? readinessFailure.code : null } : null, ...(values['controller-input-check'] ? { controller_input_check: controllerInput } : {}), ownership_closure_incomplete: closureIncomplete, observed_processes: [...observed.values()], unknown_process_observations: unknown, exit_observations: observations, actual_cim_process_exit: cimExit, actual_cim_report: cimReport, actual_cim_error: cimError, status: !identitiesExited ? 'UNKNOWN' : startupHit ? 'AWAITING_ASSERTIONS' : 'INCONCLUSIVE' }
  if (capture) record.query_evidence = capture.finish(closureIncomplete)
  failurePhase = 'save-final-record'
  await writeFile(join(directory, 'actual-observation.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' })
  if (!identitiesExited) {
    records.push(record)
    await writeFile(join(directory, 'result.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' })
    process.exitCode = 6
    break
  }
  if (readinessFailure) {
    record.status = 'FAIL'
    records.push(record)
    await writeFile(join(directory, 'result.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' })
    console.error(readinessFailure)
    process.exitCode = 1
    break
  }
  failurePhase = 'service-assertions'
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
  failurePhase = 'save-final-record'
  await writeFile(join(directory, 'result.json'), JSON.stringify(records.at(-1), null, 2) + '\n', { flag: 'wx' })
  } catch (error) { capture?.aborted(error, failurePhase, failureFacts()); throw error } finally { capture?.finish(closureIncomplete) }
}
await writeFile(join(evidence, 'result.json'), JSON.stringify({ candidate, source_revision: source, edition, selected_modes: selectedModes, unselected_modes: modes.filter(mode => !selectedModes.includes(mode)), records, model_calls: 0, human_session_created: records.some(row => row.controller_input_check?.producer?.human_session_created), project_status_check: 'NOT_RUN', controller_check: values['controller-input-check'] ? records.some(row => row.controller_input_check?.status === 'PASS') ? 'PASS' : 'FAIL' : 'NOT_RUN', remainingCases: selectedModes.filter(mode => !records.some(row => row.mode === mode && row.status === 'OBSERVED')) }, null, 2) + '\n', { flag: 'wx' })
if (records.some(row => row.status !== 'OBSERVED') && !process.exitCode) process.exitCode = 6
