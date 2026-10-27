import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: Object.fromEntries(['source-root', 'install-root', 'evidence', 'source-revision', 'observer-exit-file', 'output'].map(name => [name, { type: 'string' }])), allowPositionals: false })
const sourceRoot = values['source-root'], installRoot = values['install-root'], evidence = values.evidence, source = values['source-revision']
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const result = { observation_revision: source, status: 'FAIL', observer_sources: [] }
const samePath = (actual, expected) => assert.equal(resolve(actual).toLowerCase(), resolve(expected).toLowerCase())
const kind = error => diagnosticError(error).code ?? diagnosticError(error).name
const ordinary = async (path, maximum) => {
  const info = await lstat(path)
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.size <= maximum)
  samePath(await realpath(path), path)
  return info
}
async function stableBytes(path, maximum) {
  const before = await ordinary(path, maximum), bytes = await readFile(path), after = await ordinary(path, maximum)
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'nlink']) assert.equal(after[key], before[key])
  assert.equal(bytes.length, before.size)
  return bytes
}
const jsonBytes = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
const object = value => { assert.ok(value && typeof value === 'object' && !Array.isArray(value)); return value }
const exactKeys = (value, keys) => assert.deepEqual(Object.keys(object(value)).sort(), [...keys].sort())
const bool = value => { assert.equal(typeof value, 'boolean'); return value }
const count = value => { assert.ok(Number.isSafeInteger(value) && value >= 0); return value }
const positive = value => { assert.ok(Number.isSafeInteger(value) && value > 0); return value }
const choice = (value, choices) => { assert.ok(typeof value === 'string' && choices.includes(value)); return value }
const exitCode = value => { assert.ok(value === null || Number.isSafeInteger(value)); return value }
const signal = value => value === null ? null : choice(value, diagnosticSignals)
const optional = (value, check) => value === undefined ? 'NOT_RECORDED' : check(value)

const diagnosticErrorNames = ['Error', 'AssertionError', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'SystemError', 'UNKNOWN']
const diagnosticErrorCodes = ['ERR_ASSERTION', 'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE', 'ERR_SWA_CONTROLLER_INPUT', 'ENOENT', 'EACCES', 'EPERM', 'EEXIST', 'ENOSPC', 'EMFILE', 'EIO', 'ETIMEDOUT', 'EPIPE', 'ECONNRESET', 'ECONNREFUSED', 'ABORT_ERR', 'UNKNOWN']
const diagnosticSignals = ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGHUP', 'SIGPIPE', 'UNKNOWN']
const diagnosticFailurePhases = {
  observer: ['spawn-record', 'query-freeze', 'native-query', 'collect-primary', 'collect-additional', 'record-query', 'write-unknown', 'write-latest', 'readiness-envelope', 'start-readiness-work', 'stdin-eof', 'loop-wait', 'await-readiness-work', 'save-service-streams', 'require-service-settled', 'native-exit-query', 'cim-request', 'cim-spawn', 'cim-wait', 'cim-read', 'exit-verdict', 'save-final-record', 'service-assertions'],
  readiness: ['ready-service', 'job-members', 'ready-record', 'controller-input'],
  'controller-input': ['prepare-output', 'import-producer', 'transport-spawn', 'transport-identity', 'transport-wait', 'transport-report', 'transport-validate', 'transport-receipts', 'producer-call'],
  'producer-command': ['identity', 'wait-close'], producer: ['public-clone', 'human-project-permission', 'controller-open', 'task-create', 'controller-observe-close', 'complete']
}
const diagnosticError = error => ({ name: typeof error?.name === 'string' && diagnosticErrorNames.includes(error.name) ? error.name : 'UNKNOWN',
  code: error?.code === undefined || error?.code === null ? null : typeof error.code === 'string' && diagnosticErrorCodes.includes(error.code) ? error.code : 'UNKNOWN' })
function serviceFirstFailureProjection() {
  const compact = value => {
    if (!value || value === 'NOT_CAPTURED') return 'NOT_CAPTURED'
    const { frames, status } = value.locations
    const facts = value.component === 'producer-command' ? {
      command_name: value.facts.command_name, command_sequence: value.facts.command_sequence, identity: value.facts.identity,
      exit_known: value.facts.exit !== null, exit_code: value.facts.exit?.exit ?? null, timed_out: value.facts.timed_out,
      stdout_eof: value.facts.stdout_eof, stderr_eof: value.facts.stderr_eof, stream_failure: value.facts.stream_failure, cleanup_attempted: value.facts.cleanup_attempted
    } : value.facts
    const projected = { component: value.component, phase: value.phase, at: value.at, error: value.error, facts,
      locations: { status, count: ['NOT_RECORDED', 'BOUND_EXCEEDED'].includes(status) ? null : frames.length, shown_count: frames.length ? 1 : 0,
        truncated: frames.length > 1, first: frames[0] ?? null } }
    assert.ok(Buffer.byteLength(JSON.stringify(projected)) <= 1024, 'Safe failure projection exceeds its bound; full files retained')
    return projected
  }
  const nonzero = result.first_nonzero_command ?? 'NOT_CAPTURED', outer = result.safe_outer_error ?? 'NOT_CAPTURED'
  assert.ok(Buffer.byteLength(JSON.stringify(nonzero)) <= 512 && Buffer.byteLength(JSON.stringify(outer)) <= 128)
  const envelope = { observation_revision: result.observation_revision, status: result.status, failure_records_match: result.service_evidence?.failure_records_match ?? 'NOT_CAPTURED', first_failure: null, observer_abort: null, first_nonzero_command: null, outer_error: null }
  assert.ok(Buffer.byteLength(JSON.stringify(envelope)) <= 512)
  const projection = { ...envelope, first_failure: compact(result.service_evidence?.first_failure), observer_abort: compact(result.service_evidence?.observer_abort), first_nonzero_command: nonzero, outer_error: outer }
  const text = JSON.stringify(projection)
  assert.ok(Buffer.byteLength(text) <= 3500, 'First failure annotation exceeds its bound; full files retained')
  return text
}
async function retainServiceEvidence(directory) {
  const keys = (value, names) => { assert.ok(value && typeof value === 'object' && !Array.isArray(value)); assert.deepEqual(Object.keys(value).sort(), [...names].sort()) }
  const uint = value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff
  const birth = value => Number.isSafeInteger(value) && value > 0
  const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
  const list = (value, maximum, check) => { assert.ok(Array.isArray(value) && value.length <= maximum); for (const row of value) check(row) }
  const bool = value => assert.equal(typeof value, 'boolean')
  const atom = value => assert.ok(value === null || typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value))
  const identity = value => { keys(value, ['pid', 'creationTimeMs']); assert.ok(uint(value.pid) && value.pid > 0 && birth(value.creationTimeMs)) }
  const instant = value => { keys(value, ['observed_at_ms', 'monotonic_ms']); assert.ok(birth(value.observed_at_ms) && finite(value.monotonic_ms)) }
  const sourceRoles = { serve_native_identity: ['serve'], callback_owned: ['callback'], named_job_member: ['serve', 'runtime', 'server', 'daemon'],
    transport_native_identity: ['transport'], transport_receipt_identity: ['tty_root', 'tty_helper', 'pipe_helper'],
    producer_command_native_identity: ['producer_command'], controller_receipt_native_identity: ['controller_process', 'controller_helper'] }
  const sourceInfo = value => {
    keys(value, ['kind', 'role', 'command_sequence', 'command_name', 'query_sequence', 'scope_index', 'scope_anchor'])
    assert.ok(typeof value.kind === 'string' && Object.hasOwn(sourceRoles, value.kind) && sourceRoles[value.kind].includes(value.role))
    if (value.kind === 'producer_command_native_identity') {
      assert.ok(birth(value.command_sequence)); assert.ok(typeof value.command_name === 'string' && /^(?:git|cli)-[0-9]{2,8}$/.test(value.command_name))
      assert.equal(Number(value.command_name.split('-')[1]), value.command_sequence)
    } else { assert.equal(value.command_sequence, null); assert.equal(value.command_name, null) }
    if (value.kind === 'callback_owned') { assert.ok(birth(value.query_sequence) && uint(value.scope_index) && value.scope_index <= 2048); identity(value.scope_anchor) }
    else { assert.equal(value.query_sequence, null); assert.equal(value.scope_index, null); assert.equal(value.scope_anchor, null) }
  }
  const origin = value => { keys(value, ['identity', 'confirmed_at', 'event_sequence', 'source']); identity(value.identity); instant(value.confirmed_at); assert.ok(birth(value.event_sequence)); sourceInfo(value.source) }
  const nativeRow = value => {
    keys(value, ['pid', 'ppid', 'name', 'creationTimeDiagnosticVersion', 'creationTimeProvider', 'creationTimeNtStatus', 'creationTimeSnapshotComplete', ...(Object.hasOwn(value, 'creationTimeMs') ? ['creationTimeMs'] : [])])
    assert.ok(uint(value.pid) && value.pid > 0 && uint(value.ppid)); assert.ok(typeof value.name === 'string' && value.name.length <= 260 && /^[\p{L}\p{N}_. ()-]*$/u.test(value.name))
    if (Object.hasOwn(value, 'creationTimeMs')) assert.ok(birth(value.creationTimeMs))
    assert.equal(value.creationTimeDiagnosticVersion, 2); assert.equal(value.creationTimeProvider, 'NtQuerySystemInformation'); assert.ok(uint(value.creationTimeNtStatus)); bool(value.creationTimeSnapshotComplete)
  }
  const processEvent = value => {
    if (value === null) return
    keys(value, ['exit', 'signal', 'observed_at_ms', 'monotonic_ms']); assert.ok(value.exit === null || Number.isSafeInteger(value.exit)); atom(value.signal)
    assert.ok(birth(value.observed_at_ms) && finite(value.monotonic_ms))
  }
  const queryInstant = value => { keys(value, ['observed_at_ms', 'monotonic_ms', 'root_exit_event', 'root_close_event']); assert.ok(birth(value.observed_at_ms) && finite(value.monotonic_ms)); processEvent(value.root_exit_event); processEvent(value.root_close_event) }
  const unknownReasons = ['invalid_native_process_row', 'current_root_identity_unverified', 'root_in_descendant_branch', 'parent_incarnation_unverified', 'process_identity_not_unique', 'creation_time_unavailable', 'parent_incarnation_changed']
  const closure = value => {
    keys(value, ['rootVerified', 'ownedRows', 'excludedEdges', 'unknownRows']); bool(value.rootVerified); list(value.ownedRows, 16384, nativeRow)
    list(value.excludedEdges, 32768, row => { keys(row, ['reason', 'actual', ...(Object.hasOwn(row, 'anchor') ? ['anchor'] : ['parent'])]); assert.ok(['different-root-incarnation', 'predates-root', 'predates-parent'].includes(row.reason)); nativeRow(row.actual); identity(row.anchor ?? row.parent) })
    list(value.unknownRows, 32768, row => {
      keys(row, ['reason', 'actual', ...(Object.hasOwn(row, 'source_anchor') ? ['source_anchor'] : [])]); assert.ok(unknownReasons.includes(row.reason)); nativeRow(row.actual)
      if (row.source_anchor) { keys(row.source_anchor, ['kind', 'pid', 'creation_time_ms']); assert.ok(['serve', 'additional'].includes(row.source_anchor.kind)); assert.ok(uint(row.source_anchor.pid) && row.source_anchor.pid > 0 && birth(row.source_anchor.creation_time_ms)) }
    })
  }
  const sample = value => {
    if (value === null) return
    keys(value, ['sequence', 'query_window', 'root', 'priors', 'before', 'rows', 'scopes', 'ownership_closure_incomplete']); assert.ok(birth(value.sequence)); identity(value.root)
    keys(value.query_window, ['start', 'end']); queryInstant(value.query_window.start); queryInstant(value.query_window.end)
    assert.ok(value.query_window.start.monotonic_ms <= value.query_window.end.monotonic_ms)
    list(value.priors, 2048, identity); keys(value.before, ['prior_sources', 'additional_roots']); list(value.before.prior_sources, 2048, origin); list(value.before.additional_roots, 2048, identity)
    assert.deepEqual(value.before.prior_sources.map(row => row.identity), value.priors)
    for (const row of value.before.prior_sources) assert.ok(row.confirmed_at.monotonic_ms <= value.query_window.start.monotonic_ms)
    list(value.rows, 16384, nativeRow); bool(value.ownership_closure_incomplete)
    list(value.scopes, 2049, row => {
      keys(row, ['anchor', 'source', 'existed_before_query', 'confirmed_during_query', 'result']); identity(row.anchor); origin(row.source); assert.deepEqual(row.anchor, row.source.identity)
      bool(row.existed_before_query); bool(row.confirmed_during_query); closure(row.result)
      assert.equal(row.confirmed_during_query, row.source.confirmed_at.monotonic_ms >= value.query_window.start.monotonic_ms && row.source.confirmed_at.monotonic_ms <= value.query_window.end.monotonic_ms)
    })
    assert.ok(value.scopes.length > 0); assert.deepEqual(value.scopes[0].anchor, value.root)
    value.scopes.forEach((row, index) => assert.equal(row.existed_before_query, (index === 0 ? value.priors : value.before.additional_roots).some(prior => prior.pid === row.anchor.pid && prior.creationTimeMs === row.anchor.creationTimeMs)))
    if (value.scopes.some(row => row.result.unknownRows.length > 0)) assert.equal(value.ownership_closure_incomplete, true)
  }
  const sourceHashes = { observer: result.observer_sources.find(row => row.name === 'serve-lifecycle.mjs').observation_sha256,
    producer: result.observer_sources.find(row => row.name === 'controller-taskcreate-check.mjs').observation_sha256,
    closure: result.observer_sources.find(row => row.name === 'process-incarnation-closure.mjs').observation_sha256, native: result.diagnostic_process_tree.binary_sha256 }
  const locationHashes = { observer: sourceHashes.observer, producer: sourceHashes.producer, closure: sourceHashes.closure,
    transport: result.observer_sources.find(row => row.name === 'controller-input-check.mjs').observation_sha256 }
  const failureRecord = value => {
    if (value === null) return
    keys(value, ['component', 'phase', 'at', 'error', 'facts', 'locations']); assert.ok(Buffer.byteLength(JSON.stringify(value)) <= 4096)
    assert.ok(typeof value.component === 'string' && Object.hasOwn(diagnosticFailurePhases, value.component) && diagnosticFailurePhases[value.component].includes(value.phase)); instant(value.at)
    keys(value.error, ['name', 'code']); assert.ok(diagnosticErrorNames.includes(value.error.name)); assert.ok(value.error.code === null || diagnosticErrorCodes.includes(value.error.code))
    const facts = value.facts, nullableIdentity = actual => { if (actual !== null) identity(actual) }
    const index = actual => assert.ok(actual === null || uint(actual))
    if (value.component === 'observer') {
      keys(facts, ['query_sequence', 'root', 'scope_index', 'check_index', 'closed', 'acted', 'readiness_started', 'readiness_complete', 'closure_incomplete', 'root_exit_seen', 'root_close_seen'])
      assert.ok(uint(facts.query_sequence)); nullableIdentity(facts.root); index(facts.scope_index); index(facts.check_index)
      for (const key of ['closed', 'acted', 'readiness_started', 'readiness_complete', 'closure_incomplete', 'root_exit_seen', 'root_close_seen']) bool(facts[key])
    } else if (value.component === 'readiness') {
      keys(facts, ['readiness_started', 'readiness_complete', 'controller_input_recorded']); for (const actual of Object.values(facts)) bool(actual)
    } else if (value.component === 'controller-input') {
      keys(facts, ['transport_identity', 'transport_spawned', 'transport_closed', 'producer_recorded']); nullableIdentity(facts.transport_identity)
      for (const key of ['transport_spawned', 'transport_closed', 'producer_recorded']) bool(facts[key])
    } else if (value.component === 'producer-command') {
      keys(facts, ['command_name', 'command_sequence', 'identity', 'exit', 'timed_out', 'stdout_eof', 'stderr_eof', 'stream_failure', 'cleanup_attempted'])
      assert.ok(typeof facts.command_name === 'string' && /^(?:git|cli)-[0-9]{2,8}$/.test(facts.command_name)); assert.ok(birth(facts.command_sequence)); assert.equal(Number(facts.command_name.split('-')[1]), facts.command_sequence)
      nullableIdentity(facts.identity)
      if (facts.exit !== null) {
        keys(facts.exit, ['exit', 'signal', 'spawn_error']); assert.ok(facts.exit.exit === null || Number.isSafeInteger(facts.exit.exit))
        assert.ok(facts.exit.signal === null || diagnosticSignals.includes(facts.exit.signal)); assert.ok(facts.exit.spawn_error === null || diagnosticErrorCodes.includes(facts.exit.spawn_error))
      }
      for (const key of ['timed_out', 'stdout_eof', 'stderr_eof', 'stream_failure', 'cleanup_attempted']) bool(facts[key])
    } else {
      keys(facts, ['operation', 'request_id_assigned', 'grant_created', 'controller_recorded']); assert.ok(['main', 'grant-revoke', 'dispatcher-close'].includes(facts.operation))
      for (const key of ['request_id_assigned', 'grant_created', 'controller_recorded']) bool(facts[key])
    }
    keys(value.locations, ['status', 'frames']); assert.ok(['CAPTURED', 'NOT_RECORDED', 'BOUND_EXCEEDED', 'NO_ALLOWED_FRAME'].includes(value.locations.status))
    list(value.locations.frames, 8, frame => {
      keys(frame, ['file', 'source_sha256', 'line', 'column']); assert.ok(typeof frame.file === 'string' && Object.hasOwn(locationHashes, frame.file)); assert.equal(frame.source_sha256, locationHashes[frame.file])
      assert.ok([frame.line, frame.column].every(actual => birth(actual) && actual <= 1000000))
    })
    assert.equal(value.locations.status === 'CAPTURED', value.locations.frames.length > 0)
  }
  const documents = {}, files = []
  for (const [name, maximum] of [['service-query-evidence.json', 8 * 1024 * 1024], ['service-process-lifecycle.json', 2 * 1024 * 1024]]) {
    const path = join(directory, name)
    try {
      let before
      try { before = await lstat(path) } catch (error) { if (error.code !== 'ENOENT') throw error; files.push({ file_name: name, status: 'NOT_CAPTURED' }); continue }
      assert.ok(before.isFile() && !before.isSymbolicLink() && before.nlink === 1 && before.size <= maximum)
      assert.equal((await realpath(path)).toLowerCase(), resolve(path).toLowerCase())
      const bytes = await readFile(path), after = await lstat(path)
      for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs', 'nlink']) assert.equal(after[key], before[key])
      assert.equal(bytes.length, before.size)
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), query = name === 'service-query-evidence.json'
      keys(value, ['schema_version', 'source_revision', 'sources', 'status', 'evidence_incomplete', 'error_kind', 'first_failure', 'observer_abort', ...(query ? ['query_count', 'ownership_closure_incomplete', 'first_sample', 'first_unknown_sample', 'last_sample'] : ['events'])])
      assert.equal(value.schema_version, 2); assert.equal(value.source_revision, result.observation_revision); assert.deepEqual(value.sources, sourceHashes)
      assert.ok(['OBSERVING', 'COMPLETE', 'INCOMPLETE'].includes(value.status)); bool(value.evidence_incomplete)
      assert.ok(value.error_kind === null || ['EVIDENCE_WRITE_OR_LIMIT', 'LIFECYCLE_INCOMPLETE', 'SOURCE_INCOMPLETE', 'PRIOR_SOURCE_INCOMPLETE', 'SCOPE_SOURCE_INCOMPLETE', 'NATIVE_BATCH_INCOMPLETE', 'QUERY_EVIDENCE_INCOMPLETE', 'OWNED_SCOPE_MISSING', 'QUERY_FAILED', 'OBSERVER_ABORTED', 'FAILURE_RECORD_INCOMPLETE'].includes(value.error_kind))
      failureRecord(value.first_failure); failureRecord(value.observer_abort)
      if (value.observer_abort) { assert.equal(value.observer_abort.component, 'observer'); assert.ok(value.first_failure && value.first_failure.at.monotonic_ms <= value.observer_abort.at.monotonic_ms) }
      if (query) {
        assert.ok(uint(value.query_count)); bool(value.ownership_closure_incomplete)
        for (const item of [value.first_sample, value.first_unknown_sample, value.last_sample]) { sample(item); if (item) assert.ok(item.sequence <= value.query_count) }
        if (value.first_unknown_sample) assert.ok(value.first_unknown_sample.scopes.some(row => row.result.unknownRows.length > 0))
      } else list(value.events, 4096, row => {
        keys(row, ['sequence', 'at', 'kind', 'source', 'pid', 'identity', 'exit', 'signal', 'spawn_error', 'stdio_policy']); assert.ok(birth(row.sequence)); instant(row.at); sourceInfo(row.source)
        assert.ok(['spawn', 'spawn-error', 'identity-confirm', 'receipt-observed', 'exit', 'close', 'stdout-end', 'stderr-end', 'stdin-end-request', 'stdin-finish', 'cleanup-request'].includes(row.kind))
        assert.ok(row.pid === null || uint(row.pid) && row.pid > 0); if (row.identity !== null) { identity(row.identity); assert.equal(row.pid, row.identity.pid) }
        assert.ok(row.exit === null || Number.isSafeInteger(row.exit)); atom(row.signal); atom(row.spawn_error)
        assert.equal(row.stdio_policy, row.kind === 'spawn' ? row.source.kind === 'serve_native_identity' ? 'pipe_pipe_pipe' : 'ignore_pipe_pipe' : null)
      })
      const sha256 = hash(bytes)
      assert.equal(hash(await stableBytes(path, maximum)), sha256)
      documents[name] = value; files.push({ file_name: name, status: 'SAVED', sha256, byte_count: bytes.length })
    } catch (error) { files.push({ file_name: name, status: 'FAILED', error_kind: kind(error) }) }
  }
  const query = documents['service-query-evidence.json'], lifecycle = documents['service-process-lifecycle.json']
  let complete = !!query && !!lifecycle && [query, lifecycle].every(value => value.status === 'COMPLETE' && !value.evidence_incomplete)
  let binding = 'NOT_CHECKED'
  let failuresMatch = false
  if (query && lifecycle) {
    try {
      assert.deepEqual(query.first_failure, lifecycle.first_failure); assert.deepEqual(query.observer_abort, lifecycle.observer_abort)
      failuresMatch = true
      lifecycle.events.forEach((row, index) => { assert.equal(row.sequence, index + 1); if (index) assert.ok(row.at.monotonic_ms >= lifecycle.events[index - 1].at.monotonic_ms) })
      for (const sample of [query.first_sample, query.first_unknown_sample, query.last_sample].filter(Boolean)) {
        for (const origin of [...sample.before.prior_sources, ...sample.scopes.map(row => row.source)]) {
          const event = lifecycle.events[origin.event_sequence - 1]
          assert.ok(event && ['identity-confirm', 'receipt-observed'].includes(event.kind)); assert.deepEqual(event.identity, origin.identity); assert.deepEqual(event.at, origin.confirmed_at); assert.deepEqual(event.source, origin.source)
        }
      }
      assert.ok(query.first_sample && query.last_sample && query.query_count > 0)
      assert.equal(query.last_sample.sequence, query.query_count)
      binding = 'VERIFIED'
    } catch { binding = 'FAILED'; complete = false }
  }
  const describe = sample => sample === undefined ? 'NOT_CAPTURED' : sample === null ? null : { sequence: sample.sequence, query_window: sample.query_window,
    actual_row_count: sample.rows.length, prior_count: sample.priors.length, additional_before_count: sample.before.additional_roots.length,
    used_scope_count: sample.scopes.length, added_during_query_count: sample.scopes.slice(1).filter(row => !row.existed_before_query).length,
    root_verified: sample.scopes[0].result.rootVerified, unknown_count: sample.scopes.reduce((count, row) => count + row.result.unknownRows.length, 0) }
  const first = query?.first_unknown_sample, unknown = first?.scopes.flatMap((scope, index) => scope.result.unknownRows.map(row => ({ ...row, source_anchor: row.source_anchor ?? { kind: index === 0 ? 'serve' : 'additional', pid: scope.anchor.pid, creation_time_ms: scope.anchor.creationTimeMs } })))[0]
  result.service_evidence = { complete, binding, sources: sourceHashes, files, query_count: query?.query_count ?? 'NOT_RECORDED',
    failure_records_match: failuresMatch, first_failure: failuresMatch ? query.first_failure ?? 'NOT_CAPTURED' : 'NOT_CAPTURED', observer_abort: failuresMatch ? query.observer_abort ?? 'NOT_CAPTURED' : 'NOT_CAPTURED',
    ownership_closure_incomplete: query?.ownership_closure_incomplete ?? 'NOT_RECORDED', evidence_incomplete: query?.evidence_incomplete ?? 'NOT_RECORDED', error_kind: query ? query.error_kind : 'NOT_CAPTURED',
    first_sample: describe(query?.first_sample), first_unknown_sample: describe(first), last_sample: describe(query?.last_sample),
    lifecycle_event_count: lifecycle?.events.length ?? 'NOT_RECORDED', lifecycle_incomplete: lifecycle?.evidence_incomplete ?? 'NOT_RECORDED',
    source_kind_counts: lifecycle ? Object.keys(sourceRoles).map(kind => ({ kind, count: lifecycle.events.filter(row => row.source.kind === kind).length })) : 'NOT_RECORDED',
    first_unknown: !query ? 'NOT_CAPTURED' : unknown ? { reason: unknown.reason, actual: { pid: unknown.actual.pid, ppid: unknown.actual.ppid, creation_time_ms: unknown.actual.creationTimeMs ?? 'NOT_RECORDED' }, source_anchor: unknown.source_anchor,
      prior_exact_match: first.priors.some(row => row.pid === unknown.actual.pid && row.creationTimeMs === unknown.actual.creationTimeMs),
      pid_match_count: first.rows.filter(row => row.pid === unknown.actual.pid).length, parent_match_count: first.rows.filter(row => row.pid === unknown.actual.ppid).length,
      anchor_match_count: first.rows.filter(row => row.pid === unknown.source_anchor.pid).length } : null }
  if (result.service_evidence.first_failure !== 'NOT_CAPTURED') result.first_failure ??= { basis: 'CAPTURED_EXCEPTION', record: result.service_evidence.first_failure }
}

async function retainObserverExit() {
  const bytes = await stableBytes(values['observer-exit-file'], 4096), value = jsonBytes(bytes)
  exactKeys(value, ['schema_version', 'source_revision', 'phase', 'started', 'exit', 'timed_out', 'stdout_bytes', 'stderr_bytes', 'stdout_eof', 'stderr_eof', 'outer_error'])
  assert.equal(value.schema_version, 1); assert.equal(value.source_revision, source); assert.equal(value.phase, 'service-observer')
  bool(value.started); bool(value.timed_out); exitCode(value.exit); bool(value.stdout_eof); bool(value.stderr_eof)
  for (const key of ['stdout_bytes', 'stderr_bytes']) if (value[key] !== null) count(value[key])
  assert.ok(value.outer_error === null || value.outer_error === 'UNKNOWN')
  result.safe_outer_error = value.outer_error === null ? 'NOT_CAPTURED' : { name: 'UNKNOWN', code: null }
  if (value.exit !== null && value.exit !== 0) result.first_nonzero_command = {
    phase: value.phase, exit: value.exit, signal: 'NOT_OBSERVABLE', timed_out: value.timed_out,
    stdout_bytes: value.stdout_bytes, stderr_bytes: value.stderr_bytes, stdout_eof: value.stdout_eof, stderr_eof: value.stderr_eof
  }
  return { file_name: 'service-observer-exit.json', status: 'SAVED', sha256: hash(bytes), byte_count: bytes.length,
    started: value.started, exit: value.exit, timed_out: value.timed_out, stdout_eof: value.stdout_eof, stderr_eof: value.stderr_eof }
}

async function retainActualService() {
  const path = join(evidence, 'result.json')
  try {
    const bytes = await stableBytes(path, 8 * 1024 * 1024), value = jsonBytes(bytes)
    assert.equal(value.mode, 'readiness-eof'); choice(value.edition, ['cli', 'combined'])
    choice(value.status, ['OBSERVED', 'FAIL', 'UNKNOWN', 'INCONCLUSIVE', 'AWAITING_ASSERTIONS'])
    positive(value.pid); exitCode(value.exit); signal(value.signal); bool(value.ownership_closure_incomplete)
    assert.ok(Array.isArray(value.observed_processes) && value.observed_processes.length <= 2048)
    assert.ok(Array.isArray(value.unknown_process_observations) && value.unknown_process_observations.length <= 32768)
    assert.ok(Array.isArray(value.exit_observations) && value.exit_observations.length <= 2)
    const native = value.exit_observations.map(row => {
      exactKeys(row, ['observed_at_ms', 'remaining']); positive(row.observed_at_ms); assert.ok(Array.isArray(row.remaining) && row.remaining.length <= 2048)
      return { observed_at_ms: row.observed_at_ms, remaining: row.remaining.length }
    })
    const control = value.controller_input_check
    let controller = 'NOT_CAPTURED'
    if (control !== null && control !== undefined) {
      choice(control.status, ['PASS', 'FAIL']); bool(control.ownership_incomplete)
      const producer = control.producer, transport = control.transport
      let producerSummary = 'NOT_CAPTURED', transportSummary = 'NOT_CAPTURED'
      if (producer !== null && producer !== undefined) {
        assert.equal(producer.schema_version, 1); assert.equal(producer.source_revision, source)
        producerSummary = { status: choice(producer.status, ['PASS', 'FAIL']), phase: choice(producer.phase, diagnosticFailurePhases.producer),
          model_calls: count(producer.model_calls), worker_start_calls: count(producer.worker_start_calls),
          ownership_incomplete: bool(producer.ownership_incomplete), task_create_completed: optional(producer.task_create_completed, bool),
          sqlite_original_request_unchanged: optional(producer.sqlite_original_request_unchanged, bool), cleanup: {} }
        object(producer.cleanup)
        for (const key of ['controller_closed', 'grant_revoked', 'dispatcher_closed']) {
          const actual = producer.cleanup[key]
          producerSummary.cleanup[key] = actual === undefined ? 'NOT_RECORDED' : typeof actual === 'boolean' ? actual : choice(actual, ['UNKNOWN', 'NOT_CREATED'])
        }
      }
      if (transport !== null && transport !== undefined) {
        exactKeys(transport, ['schema', 'status', 'platform', 'tty', 'pipe', 'rpc_mutations', 'model_execution', 'kernel_job_empty'])
        assert.equal(transport.schema, 'swa.controller-input-check.v1'); assert.equal(transport.platform, 'win32')
        assert.equal(transport.rpc_mutations, 'NOT_RUN'); assert.equal(transport.model_execution, 'NOT_RUN'); assert.equal(transport.kernel_job_empty, 'NOT_CLAIMED')
        transportSummary = { status: choice(transport.status, ['PASS', 'FAIL']) }
        for (const kind of ['tty', 'pipe']) {
          const row = transport[kind]
          exactKeys(row, ['status', 'natural_eof', 'forced_cleanup', 'reply_count', 'long_bytes', 'exit_code'])
          assert.ok(row.long_bytes === null || Number.isSafeInteger(row.long_bytes) && row.long_bytes > 0 && row.long_bytes <= 1024 * 1024)
          assert.ok(Number.isSafeInteger(row.reply_count) && row.reply_count >= 0 && row.reply_count <= 3)
          transportSummary[kind] = { status: choice(row.status, ['PASS', 'FAIL']), natural_eof: bool(row.natural_eof), forced_cleanup: bool(row.forced_cleanup),
            reply_count: row.reply_count, long_bytes: row.long_bytes, exit_code: exitCode(row.exit_code) }
        }
      }
      controller = { status: control.status, ownership_incomplete: control.ownership_incomplete, producer: producerSummary, transport: transportSummary }
    }
    let cim = 'NOT_CAPTURED'
    if (value.actual_cim_report !== null && value.actual_cim_report !== undefined) {
      const report = value.actual_cim_report, actual = object(value.actual_cim_process_exit)
      assert.equal(report.schema_version, 1); bool(report.all_exited)
      assert.ok(Object.hasOwn(report, 'query_failure'))
      if (report.query_failure !== null) {
        const failure = report.query_failure
        exactKeys(failure, ['query_index', 'query_succeeded', 'observed_at', 'monotonic_ms', 'exception_type', 'message'])
        assert.ok(Number.isSafeInteger(failure.query_index) && failure.query_index >= 0 && failure.query_index <= 2)
        assert.equal(failure.query_succeeded, false)
        assert.ok(typeof failure.monotonic_ms === 'number' && Number.isFinite(failure.monotonic_ms) && failure.monotonic_ms >= 0)
        for (const key of ['observed_at', 'exception_type', 'message']) assert.equal(typeof failure[key], 'string')
      }
      assert.ok(Array.isArray(report.observations) && report.observations.length <= 2)
      cim = { exit: exitCode(actual.exit), signal: signal(actual.signal), timed_out: bool(actual.query_timed_out), query_failed: report.query_failure !== null,
        all_exited: report.all_exited, observations: report.observations.map(row => {
          assert.ok(typeof row.monotonic_ms === 'number' && Number.isFinite(row.monotonic_ms) && row.monotonic_ms >= 0)
          return { monotonic_ms: row.monotonic_ms, query_succeeded: bool(row.query_succeeded), complete_result_count: count(row.complete_result_count),
            required_identity_fields_complete: bool(row.required_identity_fields_complete), known_identities_exited: bool(row.known_identities_exited), unknown_pids_absent: bool(row.unknown_pids_absent) }
        }) }
    }
    const actual = { file_name: 'result.json', status: 'SAVED', sha256: hash(bytes), byte_count: bytes.length, edition: value.edition, service_status: value.status,
      exit: value.exit, signal: value.signal, ownership_closure_incomplete: value.ownership_closure_incomplete,
      owned_count: value.observed_processes.length, unknown_count: value.unknown_process_observations.length, native_exit: native, controller, cim, kernel_tree_exit_proven: false }
    assert.equal(hash(await stableBytes(path, 8 * 1024 * 1024)), actual.sha256)
    return actual
  } catch (error) {
    return { file_name: 'result.json', status: error.code === 'ENOENT' ? 'NOT_CAPTURED' : 'FAILED', ...(error.code === 'ENOENT' ? {} : { error_kind: kind(error) }) }
  }
}

function actualServicePassed(actual) {
  const controller = actual.controller, producer = controller?.producer, transport = controller?.transport, cim = actual.cim
  return actual.status === 'SAVED' && actual.service_status === 'OBSERVED' && actual.exit === 0 && actual.signal === null &&
    actual.ownership_closure_incomplete === false && actual.unknown_count === 0 && actual.native_exit.length === 2 &&
    actual.native_exit.every(row => row.remaining === 0) && actual.native_exit[1].observed_at_ms - actual.native_exit[0].observed_at_ms >= 250 &&
    controller?.status === 'PASS' && controller.ownership_incomplete === false && producer?.status === 'PASS' &&
    producer.model_calls === 0 && producer.worker_start_calls === 0 && producer.ownership_incomplete === false &&
    producer.task_create_completed === true && producer.sqlite_original_request_unchanged === true &&
    Object.values(producer.cleanup).every(value => value === true) && transport?.status === 'PASS' &&
    ['tty', 'pipe'].every(kind => transport[kind]?.status === 'PASS' && transport[kind].natural_eof === true && transport[kind].forced_cleanup === false &&
      transport[kind].reply_count === 3 && transport[kind].long_bytes > 4095 && transport[kind].exit_code === 0) &&
    cim?.exit === 0 && cim.signal === null && cim.timed_out === false && cim.query_failed === false && cim.all_exited === true &&
    cim.observations.length === 2 && cim.observations[1].monotonic_ms - cim.observations[0].monotonic_ms >= 50 &&
    cim.observations.every(row => row.query_succeeded && row.complete_result_count > 0 && row.required_identity_fields_complete && row.known_identities_exited && row.unknown_pids_absent)
}

try {
  for (const path of [sourceRoot, installRoot, evidence, values['observer-exit-file'], values.output]) assert.ok(typeof path === 'string' && isAbsolute(path))
  assert.ok(typeof source === 'string' && /^[0-9a-f]{40}$/.test(source))
  assert.equal(process.platform, 'win32'); assert.equal(process.arch, 'x64'); assert.equal(process.version, 'v24.21.0')
  samePath(fileURLToPath(import.meta.url), join(sourceRoot, 'tests/swa-cli-headless/windows-service-evidence-summary.mjs'))
  samePath(evidence, join(sourceRoot, '.verification/swa-ci/windows/smoke/readiness-eof'))
  samePath(values['observer-exit-file'], join(sourceRoot, '.verification/swa-ci/windows/service-observer-exit.json'))
  samePath(values.output, join(sourceRoot, '.verification/swa-ci/windows/service-evidence-summary.json'))
  samePath(await realpath(process.execPath), join(installRoot, 'node/node.exe'))
  assert.equal((await stableBytes(join(installRoot, 'VERSION'), 128)).toString('utf8').trim(), source)
  const sourceInputs = []
  for (const name of ['serve-lifecycle.mjs', 'controller-taskcreate-check.mjs', 'controller-input-check.mjs', 'process-incarnation-closure.mjs']) {
    const path = join(sourceRoot, 'tests/swa-cli-headless', name), sha256 = hash(await stableBytes(path, 1024 * 1024))
    sourceInputs.push({ path, sha256, maximum: 1024 * 1024 }); result.observer_sources.push({ name, observation_sha256: sha256 })
  }
  const requireInstalled = createRequire(join(installRoot, 'runtime/package.json'))
  const native = join(dirname(requireInstalled.resolve('@vscode/windows-process-tree/package.json')), 'build/Release/windows_process_tree.node')
  const rel = relative(await realpath(join(installRoot, 'runtime')), await realpath(native))
  assert.ok(rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..\\'))
  const nativeSHA = hash(await stableBytes(native, 16 * 1024 * 1024))
  result.diagnostic_process_tree = { binary_sha256: nativeSHA }; sourceInputs.push({ path: native, sha256: nativeSHA, maximum: 16 * 1024 * 1024 })
  let observer
  try { observer = await retainObserverExit() } catch (error) { observer = { status: 'FAILED', error_kind: kind(error) } }
  await retainServiceEvidence(evidence)
  const actual = await retainActualService(), service = result.service_evidence
  for (const input of sourceInputs) assert.equal(hash(await stableBytes(input.path, input.maximum)), input.sha256)
  result.status = result.safe_outer_error === 'NOT_CAPTURED' && observer.exit === 0 && observer.started && !observer.timed_out && observer.stdout_eof && observer.stderr_eof &&
    service.complete && service.binding === 'VERIFIED' && service.failure_records_match && !service.ownership_closure_incomplete &&
    service.first_failure === 'NOT_CAPTURED' && service.observer_abort === 'NOT_CAPTURED' && actualServicePassed(actual) ? 'PASS' : 'FAIL'
  const describe = sample => sample === null || typeof sample === 'string' ? sample : {
    sequence: sample.sequence, query_start_ms: sample.query_window.start.monotonic_ms, query_end_ms: sample.query_window.end.monotonic_ms,
    actual_row_count: sample.actual_row_count, prior_count: sample.prior_count, used_scope_count: sample.used_scope_count,
    added_during_query_count: sample.added_during_query_count, root_verified: sample.root_verified, unknown_count: sample.unknown_count
  }
  const summary = { source_revision: source, status: result.status, observer, actual, complete: service.complete, binding: service.binding,
    sources: service.sources, files: service.files, query_count: service.query_count, ownership_closure_incomplete: service.ownership_closure_incomplete,
    evidence_incomplete: service.evidence_incomplete, error_kind: service.error_kind, first_sample: describe(service.first_sample),
    first_unknown_sample: describe(service.first_unknown_sample), last_sample: describe(service.last_sample),
    lifecycle_event_count: service.lifecycle_event_count, lifecycle_incomplete: service.lifecycle_incomplete }
  assert.ok(Buffer.byteLength(JSON.stringify(summary)) <= 3500, 'Service evidence annotation exceeds its bound; full files retained')
  const output = { schema_version: 1, source_revision: source, status: result.status,
    first_failure: JSON.parse(serviceFirstFailureProjection()), service_evidence: summary }
  await writeFile(values.output, JSON.stringify(output, null, 2) + '\n', { flag: 'wx' })
  process.stdout.write(JSON.stringify(output) + '\n')
  if (result.status !== 'PASS') process.exitCode = 6
} catch {
  process.stdout.write(JSON.stringify({ schema_version: 1, status: 'FAIL', error_kind: 'SAFE_SUMMARY_UNAVAILABLE' }) + '\n')
  process.exitCode = 6
}
