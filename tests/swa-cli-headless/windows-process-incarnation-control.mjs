import assert from 'node:assert/strict'
import { fork, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { collectOwnedIncarnations, incarnationOrder } from './process-incarnation-closure.mjs'

const { values } = parseArgs({ options: Object.fromEntries(['fixture-role', 'source-root', 'runtime-root', 'data-root', 'output-dir', 'source-revision'].map(name => [name, { type: 'string' }])), allowPositionals: false })
const helper = fileURLToPath(import.meta.url)
const validCreation = value => Number.isSafeInteger(value) && value > 0
const validPID = value => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const identity = row => ({ pid: row.pid, ppid: row.ppid, creationTimeMs: row.creationTimeMs })

async function bounded(promise, milliseconds, label) {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), milliseconds) })])
  } finally { clearTimeout(timer) }
}

function settle(child) {
  return new Promise(resolveExit => {
    let failed = false
    child.once('error', () => { failed = true })
    child.once('close', (exit, signal) => resolveExit({ exit, signal, spawn_failed: failed }))
  })
}

function countStream(stream) {
  const state = { bytes: 0, eof: false, failed: false, exceeded: false }
  stream.on('data', chunk => { state.bytes += chunk.length; if (state.bytes > 16_384) { state.exceeded = true; stream.destroy() } })
  stream.on('end', () => { state.eof = true })
  stream.on('error', () => { state.failed = true })
  return state
}

async function send(message) {
  assert.equal(typeof process.send, 'function')
  await new Promise((resolveSend, reject) => process.send(message, error => error ? reject(error) : resolveSend()))
}

async function fixtureChild() {
  process.stdin.resume()
  const ended = once(process.stdin, 'end')
  await send({ type: 'fixture-child-ready', pid: process.pid })
  await bounded(ended, 30_000, 'Fixture child stdin did not close')
  process.disconnect()
}

async function fixtureRoot() {
  const child = fork(helper, ['--fixture-role', 'child'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })
  const exited = settle(child), output = countStream(child.stdout), errors = countStream(child.stderr)
  let closed = false, inputFailed = false
  child.once('close', () => { closed = true })
  child.stdin.on('error', () => { inputFailed = true })
  try {
    const [ready] = await bounded(once(child, 'message'), 10_000, 'Fixture child readiness was not observed')
    assert.deepEqual(ready, { type: 'fixture-child-ready', pid: child.pid })
    process.stdin.resume()
    const ended = once(process.stdin, 'end')
    await send({ type: 'fixture-root-ready', pid: process.pid, child_pid: child.pid })
    await bounded(ended, 25_000, 'Fixture root stdin did not close')
    child.stdin.end()
    const actualExit = await bounded(exited, 10_000, 'Fixture child did not exit after EOF')
    assert.deepEqual(actualExit, { exit: 0, signal: null, spawn_failed: false })
    assert.ok(!inputFailed && output.eof && errors.eof && !output.failed && !errors.failed && !output.exceeded && !errors.exceeded)
    await send({ type: 'fixture-child-closed', pid: child.pid, actual_exit: actualExit, stdout_eof: output.eof, stderr_eof: errors.eof })
    process.disconnect()
  } finally {
    if (!closed) {
      child.stdin.end()
      try { await bounded(exited, 3000, 'Fixture child cleanup remains unknown') } catch {
        // 只尝试关闭本次真实创建的 child，不将此操作作为正常退出证据。
        child.kill()
        await bounded(exited, 2000, 'Fixture child cleanup did not settle')
      }
    }
  }
}

async function continuityChild() {
  const lifetime = delay(30_000)
  await send({ type: 'continuity-child-ready', pid: process.pid, lifetime_ms: 30_000 })
  await lifetime
  if (process.connected) process.disconnect()
}

async function continuityParent() {
  const spawnRequest = once(process, 'message')
  await send({ type: 'continuity-parent-ready', pid: process.pid })
  const [request] = await bounded(spawnRequest, 10_000, 'Continuity child start was not requested')
  assert.deepEqual(request, { type: 'spawn-continuity-child' })
  const child = fork(helper, ['--fixture-role', 'continuity-child'], { windowsHide: true, detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  try {
    const [ready] = await bounded(once(child, 'message'), 10_000, 'Continuity child readiness was not observed')
    assert.deepEqual(ready, { type: 'continuity-child-ready', pid: child.pid, lifetime_ms: 30_000 })
    const finishRequest = once(process, 'message')
    await send(ready)
    const [finish] = await bounded(finishRequest, 10_000, 'Continuity parent exit was not requested')
    assert.deepEqual(finish, { type: 'finish-continuity-parent' })
  } finally {
    // 子进程只由启动时的 timer 自然结束；父进程释放引用后自行退出。
    if (child.connected) {
      const disconnected = once(child, 'disconnect')
      child.disconnect()
      await bounded(disconnected, 3000, 'Continuity child IPC did not disconnect')
    }
    child.unref()
    if (process.connected) process.disconnect()
  }
}

async function observeContinuity(processes, output, known, unknown, record) {
  let parent, parentExit, parentClosed = false, childIdentity, childDeadline, completed = false
  record.status = 'RUNNING'
  record.stage = 'parent-ready'
  record.snapshots = []
  record.forced_cleanup = false
  const unique = (rows, pid) => {
    const matches = rows.filter(row => row.pid === pid)
    assert.equal(matches.length, 1)
    assert.ok(validPID(pid) && validCreation(matches[0].creationTimeMs))
    return matches[0]
  }
  const query = async () => {
    const start = { observed_at_ms: Date.now(), monotonic_ms: performance.now() }
    const rows = await processes()
    const end = { observed_at_ms: Date.now(), monotonic_ms: performance.now() }
    return { schema_version: 1, query_window: { start, end }, rows }
  }
  const nativeComplete = rows => {
    assert.ok(rows.length > 0)
    for (const row of rows) {
      assert.equal(row.creationTimeDiagnosticVersion, 2)
      assert.equal(row.creationTimeProvider, 'NtQuerySystemInformation')
      assert.equal(row.creationTimeSnapshotComplete, true)
      assert.equal(row.creationTimeNtStatus, 0)
      assert.equal(Object.hasOwn(row, 'commandLine'), false)
    }
  }
  const snapshot = async label => {
    const actual = await query()
    const bytes = Buffer.from(JSON.stringify({ ...actual, label }, null, 2) + '\n')
    const fileName = 'continuity-snapshot-' + label + '.json'
    await writeFile(join(output, fileName), bytes, { flag: 'wx' })
    record.snapshots.push({ label, file_name: fileName, sha256: digest(bytes), byte_count: bytes.length,
      actual_row_count: actual.rows.length, query_window: actual.query_window, native_query: {
        provider: actual.rows[0]?.creationTimeProvider ?? 'UNKNOWN', version: actual.rows[0]?.creationTimeDiagnosticVersion ?? 'UNKNOWN',
        ntstatus: actual.rows[0]?.creationTimeNtStatus ?? 'UNKNOWN', snapshot_complete: actual.rows[0]?.creationTimeSnapshotComplete ?? 'UNKNOWN'
      } })
    nativeComplete(actual.rows)
    return actual.rows
  }
  const freezeOwned = closure => Object.freeze(closure.ownedRows.map(({ pid, creationTimeMs }) => Object.freeze({ pid, creationTimeMs })))
  const owns = (closure, row) => closure.ownedRows.includes(row)
  try {
    parent = fork(helper, ['--fixture-role', 'continuity-parent'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    parentExit = settle(parent)
    parent.once('close', () => { parentClosed = true; record.parent_close_observed = { observed_at_ms: Date.now(), monotonic_ms: performance.now() } })
    const stdout = countStream(parent.stdout), stderr = countStream(parent.stderr)
    const [ready] = await bounded(once(parent, 'message'), 10_000, 'Continuity parent readiness was not observed')
    assert.deepEqual(ready, { type: 'continuity-parent-ready', pid: parent.pid })
    record.stage = 'snapshot-a'
    const rowsA = await snapshot('a'), controller = unique(rowsA, process.pid), parentRow = unique(rowsA, parent.pid)
    assert.equal(parentRow.ppid, controller.pid)
    assert.equal(incarnationOrder(controller.creationTimeMs, parentRow.creationTimeMs), 'ordered')
    const anchor = { pid: controller.pid, creationTimeMs: controller.creationTimeMs }
    record.controller = identity(controller); record.parent = identity(parentRow)
    const strictA = collectOwnedIncarnations(rowsA, anchor)
    assert.equal(strictA.rootVerified, true); assert.equal(strictA.unknownRows.length, 0); assert.ok(owns(strictA, parentRow))
    const priorA = freezeOwned(strictA)
    record.prior_a = priorA
    const childReady = once(parent, 'message')
    record.child_requested = true
    await new Promise((resolveSend, reject) => parent.send({ type: 'spawn-continuity-child' }, error => error ? reject(error) : resolveSend()))
    const [child] = await bounded(childReady, 10_000, 'Continuity child was not reported')
    assert.equal(child.type, 'continuity-child-ready'); assert.equal(child.lifetime_ms, 30_000); assert.ok(validPID(child.pid))
    record.child_ready_observed = { observed_at_ms: Date.now(), monotonic_ms: performance.now() }
    childDeadline = record.child_ready_observed.monotonic_ms + child.lifetime_ms
    record.stage = 'snapshot-b'
    const rowsB = await snapshot('b'), currentController = unique(rowsB, controller.pid), currentParent = unique(rowsB, parent.pid)
    const childRow = unique(rowsB, child.pid)
    assert.equal(currentController.creationTimeMs, controller.creationTimeMs)
    assert.equal(currentParent.creationTimeMs, parentRow.creationTimeMs)
    assert.equal(currentParent.ppid, controller.pid); assert.equal(childRow.ppid, parent.pid)
    assert.equal(incarnationOrder(parentRow.creationTimeMs, childRow.creationTimeMs), 'ordered')
    childIdentity = { pid: childRow.pid, creationTimeMs: childRow.creationTimeMs }
    record.child = identity(childRow)
    const strictB = collectOwnedIncarnations(rowsB, anchor)
    assert.equal(strictB.rootVerified, true); assert.equal(strictB.unknownRows.length, 0); assert.ok(owns(strictB, childRow))
    const priorB = freezeOwned(strictB)
    record.prior_b = priorB
    assert.ok(!priorA.some(row => row.pid === childIdentity.pid && row.creationTimeMs === childIdentity.creationTimeMs))
    record.stage = 'parent-exit'
    await new Promise((resolveSend, reject) => parent.send({ type: 'finish-continuity-parent' }, error => error ? reject(error) : resolveSend()))
    record.parent_exit = await bounded(parentExit, 10_000, 'Continuity parent did not naturally exit')
    record.parent_stdout_eof = stdout.eof; record.parent_stderr_eof = stderr.eof
    assert.deepEqual(record.parent_exit, { exit: 0, signal: null, spawn_failed: false })
    assert.ok(stdout.eof && stderr.eof && !stdout.failed && !stderr.failed && !stdout.exceeded && !stderr.exceeded)
    record.stage = 'snapshot-c'
    const rowsC = await snapshot('c'), survivor = unique(rowsC, child.pid)
    assert.equal(rowsC.filter(row => row.pid === parent.pid).length, 0)
    assert.equal(unique(rowsC, controller.pid).creationTimeMs, controller.creationTimeMs)
    assert.equal(survivor.creationTimeMs, childRow.creationTimeMs); assert.equal(survivor.ppid, parent.pid)
    record.stage = 'prior-comparison'
    const original = collectOwnedIncarnations(rowsC, anchor)
    const withoutChild = collectOwnedIncarnations(rowsC, anchor, priorA), withChild = collectOwnedIncarnations(rowsC, anchor, priorB)
    record.comparison = { original_owned_child: owns(original, survivor), prior_a_owned_child: owns(withoutChild, survivor),
      prior_b_owned_child: owns(withChild, survivor), original_root_verified: original.rootVerified,
      prior_a_root_verified: withoutChild.rootVerified, prior_b_root_verified: withChild.rootVerified,
      original_unknown_count: original.unknownRows.length, prior_a_unknown_count: withoutChild.unknownRows.length,
      prior_b_unknown_count: withChild.unknownRows.length, expected_unknown: withoutChild.unknownRows.map(entry => ({
        reason: entry.reason, actual: identity(entry.actual), source_anchor: entry.source_anchor })) }
    assert.equal(original.rootVerified, true); assert.equal(withoutChild.rootVerified, true); assert.equal(withChild.rootVerified, true)
    assert.equal(owns(original, survivor), false); assert.equal(owns(withoutChild, survivor), false); assert.ok(owns(withChild, survivor))
    assert.equal(original.unknownRows.length, 0); assert.equal(withChild.unknownRows.length, 0)
    assert.ok(withoutChild.unknownRows.length > 0)
    for (const entry of withoutChild.unknownRows) {
      assert.equal(entry.actual, survivor); assert.equal(entry.reason, 'parent_incarnation_unverified')
      assert.deepEqual(entry.source_anchor, { kind: 'additional', pid: parentRow.pid, creation_time_ms: parentRow.creationTimeMs })
    }
    unknown.push(...withoutChild.unknownRows.map(entry => entry.actual))
    for (const row of [parentRow, childRow]) known.set(row.pid + ':' + row.creationTimeMs, row)
    assert.ok(!known.has(controller.pid + ':' + controller.creationTimeMs))
    record.stage = 'child-timer-exit'
    await delay(Math.max(0, childDeadline - performance.now()))
    const waitDeadline = childDeadline + 5000
    const wait = { schema_version: 1, source_revision: values['source-revision'], helper_sha256: digest(await readFile(helper)),
      closure_sha256: digest(await readFile(join(dirname(helper), 'process-incarnation-closure.mjs'))),
      controller: identity(controller), parent: identity(parentRow), child: identity(childRow), prior_b: priorB,
      child_ready_observed: record.child_ready_observed, child_deadline_ms: childDeadline, wait_deadline_ms: waitDeadline,
      budget_ms: 5000, interval_ms: 250, maximum_samples: 21, status: 'WAITING', stop_reason: null,
      retention_incomplete: false, unretained_sample_count: 0, first_zero_index: null, samples: [] }
    const waitPath = join(output, 'continuity-exit-wait.json')
    let waitCreated = false
    const saveWait = async () => {
      const bytes = Buffer.from(JSON.stringify(wait, null, 2) + '\n')
      assert.ok(bytes.length <= 2 * 1024 * 1024, 'Exit wait evidence exceeds its bound')
      await writeFile(waitPath, bytes, { flag: waitCreated ? 'w' : 'wx' })
      waitCreated = true
    }
    try {
      await saveWait()
      for (let index = 0; index < 21; index++) {
        const remainingBudget = waitDeadline - performance.now()
        if (remainingBudget <= 0) { wait.stop_reason = 'DEADLINE'; throw new Error('Natural exit observation deadline reached') }
        let actual
        try { actual = await bounded(query(), Math.min(5000, remainingBudget), 'Natural exit query deadline reached') }
        catch (error) { wait.stop_reason = error?.message === 'Natural exit query deadline reached' ? 'QUERY_TIMEOUT' : 'QUERY_FAILED'; throw error }
        const rows = actual.rows, closure = collectOwnedIncarnations(rows, anchor, priorB)
        const remaining = [parentRow, childRow].filter(old => rows.some(row => row.pid === old.pid && (!validCreation(row.creationTimeMs) || row.creationTimeMs === old.creationTimeMs)))
        const sample = { index, query_window: actual.query_window, rows, remaining: remaining.map(identity), closure }
        wait.samples.push(sample)
        if (Buffer.byteLength(JSON.stringify(wait, null, 2) + '\n') > 2 * 1024 * 1024 - 1024) {
          wait.samples.pop(); wait.retention_incomplete = true; wait.unretained_sample_count++
          wait.stop_reason = 'EVIDENCE_LIMIT'
          throw new Error('Complete exit wait callback exceeds the retained evidence bound')
        }
        await saveWait()
        nativeComplete(rows)
        assert.equal(unique(rows, controller.pid).creationTimeMs, controller.creationTimeMs)
        assert.equal(closure.rootVerified, true); assert.equal(closure.unknownRows.length, 0)
        if (actual.query_window.end.monotonic_ms > waitDeadline || performance.now() > waitDeadline) {
          wait.stop_reason = 'DEADLINE'; throw new Error('Natural exit callback exceeded its deadline')
        }
        if (remaining.length === 0) {
          wait.first_zero_index = index; wait.status = 'ABSENCE_OBSERVED'; wait.stop_reason = 'FIRST_ZERO'
          break
        }
        if (index === 20) { wait.stop_reason = 'SAMPLE_LIMIT'; throw new Error('Natural exit sample limit reached') }
        await delay(Math.min(250, Math.max(0, waitDeadline - performance.now())))
      }
      assert.equal(wait.status, 'ABSENCE_OBSERVED')
    } catch (error) {
      wait.status = 'FAIL'; wait.stop_reason ??= 'VALIDATION_FAILED'
      throw error
    } finally {
      await saveWait()
      record.exit_wait_file = { file_name: 'continuity-exit-wait.json', sha256: digest(await readFile(waitPath)),
        status: wait.status, sample_count: wait.samples.length, retention_incomplete: wait.retention_incomplete }
    }
    record.native_exit_observations = []
    record.child_exit_code = 'NOT_OBSERVABLE_FROM_NONPARENT'
    for (let index = 0; index < 2; index++) {
      const actual = await query(), rows = actual.rows
      nativeComplete(rows)
      const remaining = [parentRow, childRow].filter(old => rows.some(row => row.pid === old.pid && (!validCreation(row.creationTimeMs) || row.creationTimeMs === old.creationTimeMs)))
      const closure = collectOwnedIncarnations(rows, anchor, priorB)
      record.native_exit_observations.push({ query_window: actual.query_window, actual_row_count: rows.length,
        remaining_count: remaining.length, remaining: remaining.map(identity), root_verified: closure.rootVerified, unknown_count: closure.unknownRows.length })
      assert.equal(unique(rows, controller.pid).creationTimeMs, controller.creationTimeMs)
      assert.equal(remaining.length, 0); assert.equal(closure.rootVerified, true); assert.equal(closure.unknownRows.length, 0)
      if (index === 0) await delay(250)
    }
    record.status = 'PASS'; record.stage = 'complete'; completed = true
  } catch (error) {
    record.status = 'FAIL'
    record.error_kind = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(error?.code ?? error?.name ?? '') ? error.code ?? error.name : 'UNKNOWN'
    throw error
  } finally {
    if (parent && !parentClosed) {
      record.cleanup_attempted = true
      if (parent.connected) parent.disconnect()
      try { await bounded(parentExit, 5000, 'Continuity parent cleanup remains unknown') } catch {
        record.forced_cleanup = true
        parent.kill()
        try { await bounded(parentExit, 2000, 'Continuity parent cleanup did not settle') } catch { record.cleanup_unknown = true }
      }
    }
    if (!completed && record.child_requested && !childDeadline) record.cleanup_unknown = true
    if (!completed && childDeadline) {
      // 失败也只等原 timer；无原始出生身份时不按 PID 猜测或发送信号。
      await delay(Math.max(0, childDeadline - performance.now()))
      if (!childIdentity) record.cleanup_unknown = true
      else try {
        const rows = await processes()
        nativeComplete(rows)
        record.failure_child_remaining = rows.some(row => row.pid === childIdentity.pid && (!validCreation(row.creationTimeMs) || row.creationTimeMs === childIdentity.creationTimeMs))
        if (record.failure_child_remaining) record.cleanup_unknown = true
      } catch { record.cleanup_unknown = true }
    }
  }
}

async function control() {
  assert.equal(process.platform, 'win32')
  assert.equal(process.arch, 'x64')
  assert.equal(process.versions.node, '24.21.0')
  for (const key of ['source-root', 'runtime-root', 'data-root', 'output-dir']) assert.ok(values[key] && isAbsolute(values[key]))
  assert.match(values['source-revision'] ?? '', /^[0-9a-f]{40}$/)
  const source = await realpath(values['source-root']), runtime = await realpath(values['runtime-root']), data = await realpath(values['data-root'])
  assert.equal((await realpath(helper)).toLowerCase(), join(source, 'tests', 'swa-cli-headless', 'windows-process-incarnation-control.mjs').toLowerCase())
  for (const path of [source, runtime, data]) assert.ok((await lstat(path)).isDirectory() && !(await lstat(path)).isSymbolicLink())
  const output = resolve(values['output-dir'])
  await mkdir(output)
  const result = {
    schema_version: 1, diagnostic_only: true, source_revision: values['source-revision'], helper_sha256: digest(await readFile(helper)),
    closure_sha256: digest(await readFile(join(source, 'tests/swa-cli-headless/process-incarnation-closure.mjs'))),
    status: 'NOT_RUN', control_complete: false, probe_exit: 2, cases: [], candidate_built: false, install_started: false,
    service_started: false, account_session_started: false, model_calls: 0, kernel_tree_exit_proven: false
  }
  const requireRuntime = createRequire(join(runtime, 'package.json'))
  let root, rootExit, rootClosed = false, phase = 'native-preflight'
  try {
    const packageRoot = await realpath(dirname(requireRuntime.resolve('@vscode/windows-process-tree/package.json')))
    const packageRelative = relative(runtime, packageRoot)
    assert.ok(packageRelative && !packageRelative.startsWith('..') && !isAbsolute(packageRelative))
    const native = requireRuntime('@vscode/windows-process-tree')
    assert.ok(Number.isSafeInteger(native.supportedProcessDataFlags) && (native.supportedProcessDataFlags & 4) === 4)
    assert.equal(typeof native.getProcessCreationTime, 'function')
    const binary = await realpath(join(packageRoot, 'build', 'Release', 'windows_process_tree.node'))
    assert.ok(!relative(runtime, binary).startsWith('..'))
    const loadedAddons = await Promise.all(Object.keys(requireRuntime.cache).filter(path => path.toLowerCase().endsWith('.node')).map(path => realpath(path)))
    assert.equal(loadedAddons.length, 1)
    assert.equal(loadedAddons[0].toLowerCase(), binary.toLowerCase())
    result.native_component = { name: '@vscode/windows-process-tree', version: requireRuntime('@vscode/windows-process-tree/package.json').version, addon_sha256: digest(await readFile(binary)), supported_process_data_flags: native.supportedProcessDataFlags, loaded_binary_matches_compiled: true }
    assert.equal(result.native_component.version, '0.8.0')
    const processes = () => bounded(new Promise((resolveRows, reject) => native.getAllProcesses(rows => Array.isArray(rows) ? resolveRows(rows) : reject(new Error('Actual native process callback unavailable')), 4)), 5000, 'Native process callback timed out')
    phase = 'live-root-child'
    root = fork(helper, ['--fixture-role', 'root'], { windowsHide: true, cwd: data, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })
    rootExit = settle(root)
    root.once('close', () => { rootClosed = true })
    let rootInputFailed = false
    root.stdin.on('error', () => { rootInputFailed = true })
    const rootOutput = countStream(root.stdout), rootErrors = countStream(root.stderr)
    const childClosed = new Promise(resolveChild => { root.on('message', message => { if (message?.type === 'fixture-child-closed') resolveChild(message) }) })
    const [ready] = await bounded(once(root, 'message'), 10_000, 'Fixture root readiness was not observed')
    assert.equal(ready.type, 'fixture-root-ready')
    assert.equal(ready.pid, root.pid)
    assert.ok(validPID(root.pid) && validPID(ready.child_pid) && root.pid !== ready.child_pid)
    const anchor = { pid: root.pid, creationTimeMs: native.getProcessCreationTime(root.pid) }
    assert.ok(validCreation(anchor.creationTimeMs))
    const known = new Map(), unknown = []
    const live = { name: phase, observations: [] }
    result.cases.push(live)
    for (let index = 0; index < 2; index++) {
      const rows = await processes(), closure = collectOwnedIncarnations(rows, anchor)
      const childRows = closure.ownedRows.filter(row => row.pid === ready.child_pid)
      live.observations.push({ observed_at_ms: Date.now(), actual_row_count: rows.length, root_verified: closure.rootVerified, owned_count: closure.ownedRows.length, owned: closure.ownedRows.slice(0, 8).map(identity), owned_truncated: closure.ownedRows.length > 8, excluded_edge_count: closure.excludedEdges.length, unknown_count: closure.unknownRows.length })
      for (const row of closure.ownedRows) known.set(row.pid + ':' + row.creationTimeMs, row)
      unknown.push(...closure.unknownRows.map(entry => entry.actual))
      assert.equal(closure.rootVerified, true)
      assert.equal(closure.unknownRows.length, 0)
      assert.equal(childRows.length, 1)
      assert.equal(childRows[0].ppid, root.pid)
      assert.equal(incarnationOrder(anchor.creationTimeMs, childRows[0].creationTimeMs), 'ordered')
      if (index === 0) await delay(250)
    }
    phase = 'normal-eof'
    const normal = { name: phase, native_exit_observations: [] }
    result.cases.push(normal)
    root.stdin.end()
    normal.root_exit = await bounded(rootExit, 10_000, 'Fixture root did not exit after EOF')
    normal.child_wait = await bounded(childClosed, 1000, 'Fixture child close record was not observed')
    normal.root_stdout_eof = rootOutput.eof
    normal.root_stderr_eof = rootErrors.eof
    normal.root_stdin_failed = rootInputFailed
    assert.deepEqual(normal.root_exit, { exit: 0, signal: null, spawn_failed: false })
    assert.deepEqual(normal.child_wait.actual_exit, { exit: 0, signal: null, spawn_failed: false })
    assert.equal(normal.child_wait.pid, ready.child_pid)
    assert.ok(!rootInputFailed && normal.child_wait.stdout_eof && normal.child_wait.stderr_eof && rootOutput.eof && rootErrors.eof && !rootOutput.failed && !rootErrors.failed && !rootOutput.exceeded && !rootErrors.exceeded)
    for (let index = 0; index < 2; index++) {
      const rows = await processes(), closure = collectOwnedIncarnations(rows, anchor)
      const remaining = [...known.values()].filter(old => rows.some(row => row.pid === old.pid && (!validCreation(row.creationTimeMs) || row.creationTimeMs === old.creationTimeMs)))
      const rootRows = rows.filter(row => row.pid === anchor.pid)
      normal.native_exit_observations.push({ observed_at_ms: Date.now(), actual_row_count: rows.length, remaining_count: remaining.length, remaining: remaining.slice(0, 8).map(identity), remaining_truncated: remaining.length > 8, root_rows_count: rootRows.length, root_verified: closure.rootVerified, owned_count: closure.ownedRows.length, unknown_count: closure.unknownRows.length })
      unknown.push(...closure.unknownRows.map(entry => entry.actual))
      assert.equal(remaining.length, 0)
      assert.equal(rootRows.length, 0)
      assert.equal(closure.rootVerified, false)
      assert.equal(closure.ownedRows.length, 0)
      assert.equal(closure.unknownRows.length, 0)
      if (index === 0) await delay(250)
    }
    phase = 'prior-owned-continuity'
    const continuity = { name: phase }
    result.cases.push(continuity)
    await observeContinuity(processes, output, known, unknown, continuity)
    phase = 'normal-eof'
    const request = join(output, 'cim-request.json'), cimOutput = join(output, 'cim-exit-observations.json')
    await writeFile(request, JSON.stringify({ schema_version: 1, known: [...known.values()], unknown }, null, 2) + '\n', { flag: 'wx' })
    assert.ok(process.env.ProgramFiles && isAbsolute(process.env.ProgramFiles))
    const powershell = await realpath(join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe'))
    const cim = spawn(powershell, ['-NoProfile', '-NonInteractive', '-File', join(source, 'tests/swa-cli-headless/observe-process-exits.ps1'), '-RequestFile', request, '-OutputFile', cimOutput], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const cimOutputState = countStream(cim.stdout), cimErrorState = countStream(cim.stderr), cimExit = settle(cim)
    try { normal.cim_process_exit = await bounded(cimExit, 15_000, 'Actual CIM process observation timed out') } catch (error) {
      // 只收尾本次创建的 CIM helper；超时始终失败，不宣称其退出结果。
      cim.kill()
      await bounded(cimExit, 3000, 'CIM helper cleanup remains unknown')
      throw error
    }
    normal.cim_stdout_eof = cimOutputState.eof
    normal.cim_stderr_eof = cimErrorState.eof
    const report = JSON.parse(await readFile(cimOutput, 'utf8'))
    const number = value => Number.isFinite(value) && value >= 0 ? value : 'UNKNOWN'
    const boolean = value => typeof value === 'boolean' ? value : 'UNKNOWN'
    normal.cim_report = {
      schema_version: number(report?.schema_version), all_exited: boolean(report?.all_exited),
      query_failure: report?.query_failure === null ? null : { query_index: number(report?.query_failure?.query_index), query_succeeded: boolean(report?.query_failure?.query_succeeded), exception_type: /^[A-Za-z_][A-Za-z0-9_.+]{0,159}$/.test(report?.query_failure?.exception_type ?? '') ? report.query_failure.exception_type : 'UNKNOWN' },
      observation_count: Array.isArray(report?.observations) ? report.observations.length : 'UNKNOWN',
      observations_truncated: Array.isArray(report?.observations) ? report.observations.length > 2 : 'UNKNOWN',
      observations: Array.isArray(report?.observations) ? report.observations.slice(0, 2).map(row => ({ query_succeeded: boolean(row.query_succeeded), complete_result_count: number(row.complete_result_count), invalid_pid_record_count: number(row.invalid_pid_record_count), required_identity_fields_complete: boolean(row.required_identity_fields_complete), known_identities_exited: boolean(row.known_identities_exited), unknown_pids_absent: boolean(row.unknown_pids_absent), monotonic_ms: number(row.monotonic_ms), actual_match_count: Array.isArray(row.actual_matches) ? row.actual_matches.length : 'UNKNOWN' })) : 'UNKNOWN'
    }
    assert.deepEqual(normal.cim_process_exit, { exit: 0, signal: null, spawn_failed: false })
    assert.ok(cimOutputState.eof && cimErrorState.eof && !cimOutputState.failed && !cimErrorState.failed && !cimOutputState.exceeded && !cimErrorState.exceeded)
    assert.equal(report.schema_version, 1)
    assert.equal(report.query_failure, null)
    assert.equal(report.all_exited, true)
    assert.equal(report.observations.length, 2)
    assert.ok(report.observations.every(row => row.query_succeeded === true && row.complete_result_count > 0 && row.required_identity_fields_complete === true && row.known_identities_exited === true && row.unknown_pids_absent === true))
    assert.ok(report.observations[1].monotonic_ms - report.observations[0].monotonic_ms >= 50)
    result.status = 'CONTROL_COMPLETE'
    result.control_complete = true
    result.probe_exit = 0
  } catch {
    result.status = 'FAIL'
    result.failed_phase = phase
    result.probe_exit = 6
  } finally {
    if (root && !rootClosed) {
      result.cleanup_attempted = true
      root.stdin.end()
      try { await bounded(rootExit, 5000, 'Fixture root cleanup remains unknown') } catch {
        // 此句柄来自本次 fork；不按未知外部 PID 发信号。
        root.kill()
        try { await bounded(rootExit, 2000, 'Fixture root cleanup did not settle') } catch { result.cleanup_unknown = true }
      }
    }
    try {
      await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
      console.log(JSON.stringify({ diagnostic_only: true, status: result.status, probe_exit: result.probe_exit, source_revision: result.source_revision, failed_phase: result.failed_phase ?? null, model_calls: 0 }))
    } catch {
      process.stderr.write('Fixture evidence write failed\n')
      result.probe_exit = 2
    }
    process.exitCode = result.probe_exit
  }
}

if (values['fixture-role'] === 'child') {
  try { await fixtureChild() } catch { process.stderr.write('Fixture child failed\n'); process.exitCode = 6 }
} else if (values['fixture-role'] === 'root') {
  try { await fixtureRoot() } catch { process.stderr.write('Fixture root failed\n'); process.exitCode = 6 }
} else if (values['fixture-role'] === 'continuity-child') {
  try { await continuityChild() } catch { process.stderr.write('Continuity child failed\n'); process.exitCode = 6 }
} else if (values['fixture-role'] === 'continuity-parent') {
  try { await continuityParent() } catch { if (process.connected) process.disconnect(); process.stderr.write('Continuity parent failed\n'); process.exitCode = 6 }
} else {
  assert.equal(values['fixture-role'], undefined)
  await control()
}
