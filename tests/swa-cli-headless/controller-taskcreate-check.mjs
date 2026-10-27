import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { publicCase, publicFiles, publicRevision, publicSource } from '../swa-product-acceptance/public-case-definition.mjs'

const json = value => JSON.stringify(value, null, 2) + '\n'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const object = value => { assert.ok(value && typeof value === 'object' && !Array.isArray(value)); return value }
const safeKind = error => typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code) ? error.code : error instanceof Error ? error.name : 'UnknownError'
const samePath = (actual, expected) => assert.equal(actual.toLowerCase(), expected.toLowerCase())

// 只在本次已就绪的真实服务中创建公开任务，不启动 Worker 或模型。
export async function runControllerTaskCreateCheck({ candidate, endpoint, dataRoot, publicParent, outputDir, sourceRevision, deadline, onProcessIdentity, onProcessEvent, onDiagnosticFailure }) {
  assert.equal(process.platform, 'win32')
  assert.equal(process.arch, 'x64')
  assert.equal(process.versions.node, '24.21.0')
  for (const path of [candidate, dataRoot, publicParent, outputDir]) assert.ok(isAbsolute(path))
  assert.match(sourceRevision, /^[0-9a-f]{40}$/)
  assert.equal(typeof onProcessIdentity, 'function')
  assert.ok(onProcessEvent === undefined || typeof onProcessEvent === 'function')
  assert.ok(onDiagnosticFailure === undefined || typeof onDiagnosticFailure === 'function')
  assert.equal(new URL(endpoint).origin, endpoint)
  assert.equal(new URL(endpoint).hostname, '127.0.0.1')
  samePath(await realpath(process.execPath), join(candidate, 'node/node.exe'))
  assert.equal((await readFile(join(candidate, 'VERSION'), 'utf8')).trim(), sourceRevision)
  for (const path of [candidate, dataRoot]) assert.ok((await lstat(path)).isDirectory() && !(await lstat(path)).isSymbolicLink())
  await mkdir(outputDir)
  const privateOutput = join(outputDir, 'private')
  await mkdir(privateOutput)
  await mkdir(publicParent)
  const publicProject = join(publicParent, 'public-project')
  const requireRuntime = createRequire(join(candidate, 'runtime/package.json'))
  const { fetch, getSetCookies, Agent } = requireRuntime('undici')
  const native = requireRuntime('@vscode/windows-process-tree')
  const dispatcher = new Agent({ connections: 1 })
  const report = { schema_version: 1, source_revision: sourceRevision, status: 'FAIL', phase: 'public-clone',
    public_source: publicSource, public_revision: publicRevision, model_calls: 0, worker_start_calls: 0,
    human_session_created: false, old_requests_replayed: false, ownership_incomplete: false, commands: [], human: [], cleanup: {} }
  const persist = (name, value) => writeFile(join(privateOutput, name), json(value), { flag: 'wx' })
  const remaining = cap => { const value = Math.min(cap, deadline - Date.now()); assert.ok(value > 0, 'Controller check deadline expired'); return value }
  let sequence = 0, cookie = '', csrf = '', token = '', project, caller, controller, grantAttempted = false, grantCreated = false, humanUnknown = false, primary, invocationFile
  const diagnosticFailure = (error, component, phase, facts) => { try { onDiagnosticFailure?.(error, component, phase, facts) } catch { /* 诊断回调不得替换原始异常。 */ } }
  const producerFailure = (error, operation) => diagnosticFailure(error, 'producer', report.phase, {
    operation, request_id_assigned: !!report.open_request_id, grant_created: grantCreated, controller_recorded: !!controller })

  async function bounded(promise, cap, reason) {
    let timer
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(reason)), remaining(cap)) })]) }
    finally { clearTimeout(timer) }
  }
  function recordIdentity(pid, expected, sourceInfo) {
    assert.ok(Number.isSafeInteger(pid) && pid > 0)
    const creationTimeMs = native.getProcessCreationTime(pid)
    assert.ok(Number.isSafeInteger(creationTimeMs) && creationTimeMs > 0, 'Actual child creation time is unavailable')
    if (expected !== undefined) assert.equal(creationTimeMs, expected)
    onProcessIdentity({ pid, creationTimeMs }, sourceInfo)
    return { pid, creationTimeMs }
  }
  async function command(executable, args, name, env, cwd, cap = 150_000) {
    const child = spawn(executable, args, { env, cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const actuallySpawned = Number.isSafeInteger(child.pid) && child.pid > 0
    const stdout = [], stderr = []
    let outBytes = 0, errBytes = 0, outEOF = false, errEOF = false, streamFailure = false, identity
    const commandSource = { kind: 'producer_command_native_identity', role: 'producer_command', command_sequence: Number(name.split('-')[1]), command_name: name }
    const event = (kind, details = {}) => onProcessEvent?.({ kind, source: commandSource, pid: child.pid ?? null, identity: identity ?? null, ...details })
    event('spawn')
    const closed = new Promise(resolve => {
      child.once('error', error => { event('spawn-error', { spawn_error: safeKind(error) }); resolve({ exit: null, signal: null, spawn_error: safeKind(error) }) })
      child.once('close', (exit, signal) => { event('close', { exit, signal }); resolve({ exit, signal, spawn_error: null }) })
    })
    child.once('exit', (exit, signal) => event('exit', { exit, signal }))
    child.stdout.on('data', chunk => { outBytes += chunk.length; if (outBytes <= 16 * 1024 * 1024) stdout.push(chunk); else streamFailure = true })
    child.stderr.on('data', chunk => { errBytes += chunk.length; if (errBytes <= 256 * 1024) stderr.push(chunk); else streamFailure = true })
    child.stdout.on('end', () => { outEOF = true; event('stdout-end') })
    child.stderr.on('end', () => { errEOF = true; event('stderr-end') })
    for (const stream of [child.stdout, child.stderr]) stream.on('error', () => { streamFailure = true })
    let exit, timedOut = false, cleanupAttempted = false
    let commandPhase = 'identity'
    try {
      if (child.pid) identity = recordIdentity(child.pid, undefined, commandSource)
      commandPhase = 'wait-close'
      exit = await bounded(closed, cap, 'Actual CLI or Git completion remains unknown')
    } catch (error) {
      timedOut = true
      diagnosticFailure(error, 'producer-command', commandPhase, { command_name: name, command_sequence: commandSource.command_sequence,
        identity: identity ?? null, exit: exit ?? null, timed_out: timedOut, stdout_eof: outEOF, stderr_eof: errEOF, stream_failure: streamFailure, cleanup_attempted: cleanupAttempted })
      // 只关闭本次仍保持原创建时间的 child；这不是自然退出证明。
      if (identity && native.getProcessCreationTime(identity.pid) === identity.creationTimeMs) { event('cleanup-request'); cleanupAttempted = child.kill() }
      try { exit = await Promise.race([closed, new Promise(resolve => setTimeout(() => resolve(null), 5000))]) } catch { /* 原结果仍为 UNKNOWN。 */ }
      throw error
    } finally {
      report.ownership_incomplete ||= actuallySpawned && !identity
      const result = { name, actual_spawned: actuallySpawned, identity: identity ?? null, exit: exit ?? 'UNKNOWN', timed_out: timedOut, cleanup_attempted: cleanupAttempted,
        stdout_bytes: outBytes, stderr_bytes: errBytes, stdout_eof: outEOF, stderr_eof: errEOF, stream_failure: streamFailure }
      report.commands.push(result)
      await writeFile(join(privateOutput, name + '.stdout'), Buffer.concat(stdout), { flag: 'wx' })
      await writeFile(join(privateOutput, name + '.stderr'), Buffer.concat(stderr), { flag: 'wx' })
      await persist(name + '.exit.json', result)
    }
    assert.deepEqual(exit, { exit: 0, signal: null, spawn_error: null })
    assert.ok(outEOF && errEOF && !streamFailure)
    return Buffer.concat(stdout)
  }
  async function git(args, cwd = publicParent) {
    return command('git', ['-c', 'credential.helper=', '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', ...args], 'git-' + String(++sequence).padStart(2, '0'),
      { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }, cwd, 60_000)
  }
  async function cli(args) {
    const name = 'cli-' + String(++sequence).padStart(2, '0')
    await persist(name + '.intent.json', { args, effect: 'UNKNOWN_WITHOUT_ORIGINAL_RECEIPT' })
    const bytes = await command(join(candidate, 'swa.exe'), [...args, '--json'], name,
      { ...process.env, SWA_ENDPOINT: endpoint, SWA_PROJECT_ID: project.id, SWA_PROJECT_TOKEN: token }, publicProject)
    const response = object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
    assert.equal(response.ok, true)
    return response
  }
  async function human(method, path, body, status) {
    const requestID = body ? randomUUID() : undefined
    const payload = body ? { ...body, schema_version: 1, request_id: requestID, expected_version: 1 } : undefined
    const headers = { Origin: endpoint, ...(cookie ? { Cookie: cookie } : {}) }
    if (payload) Object.assign(headers, { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'Idempotency-Key': requestID })
    const observation = { method, path, request_id: requestID, status: 'UNKNOWN' }
    report.human.push(observation)
    let response, value
    try {
      response = await fetch(endpoint + path, { method, headers, redirect: 'manual', body: payload ? JSON.stringify(payload) : undefined,
        signal: AbortSignal.timeout(remaining(30_000)), dispatcher })
      const chunks = [], reader = response.body?.getReader()
      let bytes = 0, complete = false
      try {
        if (reader) for (;;) {
          const part = await reader.read()
          if (part.done) break
          bytes += part.value.byteLength
          assert.ok(bytes <= 1024 * 1024, 'Human response exceeds its declared bound')
          chunks.push(Buffer.from(part.value))
        }
        complete = true
      } finally {
        if (reader) { if (!complete) await reader.cancel(); reader.releaseLock() }
      }
      assert.equal(response.status, status)
      value = object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))))
    } catch (error) { if (payload) humanUnknown = true; throw error }
    observation.status = 'COMPLETE_JSON_RESPONSE'
    observation.http_status = response.status
    if (path === '/api/v1/auth/session') {
      const cookies = getSetCookies(response.headers).filter(value => value.name === 'astrocyte_session')
      assert.equal(cookies.length, 1); assert.ok(cookies[0].value)
      cookie = `astrocyte_session=${cookies[0].value}`
    }
    return value
  }
  try {
    await git(['clone', '--no-checkout', '--no-local', publicSource, publicProject])
    await git(['checkout', '--detach', publicRevision], publicProject)
    assert.equal((await git(['rev-parse', 'HEAD'], publicProject)).toString().trim(), publicRevision)
    assert.equal((await git(['status', '--porcelain', '--untracked-files=normal'], publicProject)).length, 0)
    const originals = []
    for (const path of publicFiles) {
      const original = await git(['show', `${publicRevision}:${path}`], publicProject)
      const bytes = await readFile(join(publicProject, path))
      assert.ok(bytes.equals(original))
      originals.push({ path, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) })
    }
    const spec = publicCase(4, originals).spec
    const specFile = join(publicProject, 'controller-taskcreate-check.json')
    await writeFile(specFile, json(spec), { flag: 'wx' })
    report.phase = 'human-project-permission'
    const session = await human('GET', '/api/v1/auth/session', undefined, 200)
    assert.equal(session.actor_kind, 'human'); assert.equal(session.actor_id, 'local-human'); assert.ok(session.csrf_token)
    csrf = session.csrf_token; report.human_session_created = true
    const space = object((await human('POST', '/api/v1/project-spaces', { title: 'Controller transport public stats' }, 201)).space)
    assert.equal(typeof space.id, 'string'); assert.ok(space.id.trim())
    project = object((await human('POST', '/api/v1/local-projects', { name: 'Controller transport public stats', root: publicProject, space_id: space.id }, 200)).project)
    samePath(project.root, publicProject); assert.equal(project.space_id, space.id); assert.equal(project.settings.revision, 1)
    const actions = ['observe', 'read_context', 'start', 'stop']
    const settings = { ...project.settings, allow_directory: true, allowed_subdirs: ['.'], expand_references: false,
      allowed_actions: actions, allowed_tools: [], external_model_cli: '', allow_agent_control: true }
    project = object((await human('PUT', `/api/v1/local-projects/${project.id}/settings`, { expected_revision: 1, settings }, 200)).project)
    assert.equal(project.settings.revision, 2); assert.deepEqual(project.settings.allowed_actions, actions)
    caller = 'controller-transport-' + randomUUID()
    grantAttempted = true
    const granted = object((await human('POST', `/api/v1/local-projects/${project.id}/grants`, { agent_id: caller, actions }, 200)).grant)
    grantCreated = true
    assert.equal(granted.agent_id, caller); assert.deepEqual(granted.actions, actions); assert.equal(granted.revoked_at, null)
    const credential = object((await human('POST', `/api/v1/local-projects/${project.id}/agent-token`, { agent_id: caller }, 200)).credential)
    assert.equal(credential.project_id, project.id); assert.equal(credential.agent_id, caller); assert.ok(credential.token)
    token = credential.token
    report.project_id = project.id
    report.phase = 'controller-open'
    const status = await cli(['status'])
    const databases = status.result.databases.filter(value => value.name === 'main')
    assert.equal(databases.length, 1)
    const database = await realpath(databases[0].file)
    const databaseRelative = relative(await realpath(dataRoot), database)
    assert.ok(databaseRelative && !databaseRelative.startsWith('..') && !isAbsolute(databaseRelative))
    const openR = randomUUID()
    report.open_request_id = openR
    const opened = await cli(['controller', 'open', '--project', project.id, '--workdir', publicProject, '--request-id', openR])
    controller = opened.controller; assert.ok(controller)
    const owner = object(opened.result)
    assert.equal(owner.controller, controller)
    for (const identity of [owner.process, owner.helper]) recordIdentity(identity.pid, identity.creationTimeMs, {
      kind: 'controller_receipt_native_identity', role: identity === owner.process ? 'controller_process' : 'controller_helper'
    })
    report.controller = controller
    report.controller_process = { pid: owner.process.pid, creationTimeMs: owner.process.creationTimeMs }
    report.helper_process = { pid: owner.helper.pid, creationTimeMs: owner.helper.creationTimeMs }
    const openRequest = await cli(['request', 'show', '--controller', controller, '--request-id', openR])
    assert.equal(openRequest.result.requestId, openR); assert.equal(openRequest.result.state, 'completed'); assert.equal(openRequest.result.method, 'swa.controllerOpen')
    const openReceipt = object(openRequest.result.receipt)
    assert.equal(openReceipt.project_id, project.id); assert.equal(openReceipt.controller, controller)
    for (const field of ['binding', 'process', 'helper', 'caller_authority']) assert.deepEqual(openReceipt[field], owner[field])
    report.open_receipt = { request_id: openR, state: 'completed', method: 'swa.controllerOpen', original_owner_verified: true }
    report.phase = 'task-create'
    const createR = randomUUID()
    report.create_request_id = createR
    const created = await cli(['task', 'create', '--controller', controller, '--spec-file', specFile, '--request-id', createR])
    const request = await cli(['request', 'show', '--controller', controller, '--request-id', createR])
    assert.equal(request.result.requestId, createR); assert.equal(request.result.state, 'completed'); assert.equal(request.result.method, 'swa.taskCreate')
    const receipt = object(request.result.receipt), invocation = object(receipt.invocation)
    assert.deepEqual(receipt.children, [`${createR}/run-create`, `${createR}/root-task`])
    assert.equal(request.result.children.length, 2); assert.ok(request.result.children.every(child => child.state === 'completed'))
    assert.deepEqual(request.result.children.map(child => child.requestId).sort(), [`${createR}/root-task`, `${createR}/run-create`].sort())
    assert.deepEqual(request.result.children.map(child => child.method).sort(), ['orchestration.runCreate', 'orchestration.taskCreate'])
    assert.deepEqual(invocation.spec, spec)
    assert.equal(invocation.context.files.length, originals.length)
    for (const original of originals) assert.equal(invocation.context.files.find(file => file.path === original.path)?.text, original.text)
    const packetBytes = Buffer.byteLength(JSON.stringify({ type: 'swa_controller_action', request_id: createR, action: 'task.create', invocation }))
    assert.ok(packetBytes > 4095 && packetBytes <= 1024 * 1024, 'Actual public invocation does not meet the long-input bound')
    report.helper_packet_bytes = packetBytes
    report.helper_packet_length_basis = 'reconstructed_from_original_completed_receipt_using_unmodified_helperCall_serialization'
    report.invocation_sha256 = hash(JSON.stringify(invocation))
    report.run_id = created.run_id; report.root_task_id = created.task_id
    const snapshot = () => {
      const db = new DatabaseSync(database, { readOnly: true })
      try { return {
        tasks: db.prepare('SELECT id,run_id,parent_id,spec FROM tasks WHERE run_id=? ORDER BY id').all(created.run_id),
        run: db.prepare('SELECT id,coordinator_handle FROM runs WHERE id=?').get(created.run_id),
        receipts: db.prepare('SELECT request_id,method,state,receipt FROM mutation_receipts WHERE request_id IN (?,?,?) ORDER BY request_id').all(createR, `${createR}/run-create`, `${createR}/root-task`),
        mutation_receipt_count: db.prepare('SELECT COUNT(*) AS count FROM mutation_receipts').get().count,
        dispatch_count: db.prepare('SELECT COUNT(*) AS count FROM dispatch_contexts').get().count,
        worker_count: db.prepare('SELECT COUNT(*) AS count FROM worker_dispatches').get().count,
        resource_count: db.prepare('SELECT COUNT(*) AS count FROM worker_terminal_resources').get().count
      } } finally { db.close() }
    }
    const before = snapshot()
    assert.equal(before.tasks.length, 1); assert.equal(before.tasks[0].id, created.task_id); assert.equal(before.tasks[0].parent_id, null)
    assert.equal(before.run.id, created.run_id); assert.equal(before.run.coordinator_handle, controller)
    assert.equal(before.receipts.length, 3); assert.ok(before.receipts.every(row => row.state === 'completed'))
    assert.equal(before.dispatch_count, 0); assert.equal(before.worker_count, 0); assert.equal(before.resource_count, 0)
    const fixed = JSON.parse(before.tasks[0].spec)
    assert.equal(fixed.schema, 'swa.task-spec.v2'); assert.deepEqual(fixed.spec, spec); assert.deepEqual(fixed.context, invocation.context)
    assert.equal(fixed.origin.request_id, createR); assert.equal(fixed.project_id, project.id)
    await cli(['request', 'show', '--controller', controller, '--request-id', createR])
    assert.deepEqual(snapshot(), before, 'Original read-only request query changed the native rows')
    await persist('native-database.json', before)
    invocationFile = join(privateOutput, 'invocation.json')
    await writeFile(invocationFile, JSON.stringify(invocation) + '\n', { flag: 'wx' })
    report.phase = 'controller-observe-close'
    const observed = await cli(['controller', 'show', '--controller', controller])
    assert.deepEqual(observed.result.owner.process, owner.process); assert.deepEqual(observed.result.owner.helper, owner.helper)
    assert.equal(observed.result.scope.run_id, created.run_id)
    assert.equal(observed.result.observation.result.current.run.id, created.run_id)
    const task = await cli(['task', 'show', '--controller', controller, '--task', created.task_id])
    assert.equal(task.result.native.tasks.filter(row => row.id === created.task_id).length, 1)
    const closeR = randomUUID()
    report.close_request_id = closeR
    const closed = await cli(['controller', 'close', '--controller', controller, '--request-id', closeR])
    assert.equal(closed.result.controller, controller)
    assert.equal(closed.result.close.ptyKilled, true)
    const closeRequest = await cli(['request', 'show', '--controller', controller, '--request-id', closeR])
    assert.equal(closeRequest.result.requestId, closeR); assert.equal(closeRequest.result.state, 'completed'); assert.equal(closeRequest.result.method, 'swa.controllerClose')
    const closeReceipt = object(closeRequest.result.receipt)
    assert.equal(closeReceipt.project_id, project.id); assert.equal(closeReceipt.controller, controller)
    for (const field of ['binding', 'process', 'helper']) assert.deepEqual(closeReceipt[field], owner[field])
    assert.deepEqual(closeReceipt.close, closed.result.close); assert.equal(closeReceipt.close.ptyKilled, true)
    report.close_receipt = { request_id: closeR, state: 'completed', method: 'swa.controllerClose', original_close_verified: true }
    report.cleanup.controller_closed = true
    report.task_create_completed = true; report.sqlite_original_request_unchanged = true
    report.controller_close_basis = 'original_ptyKilled_and_production_exit_observations_not_natural_EOF'
  } catch (error) {
    producerFailure(error, 'main')
    primary = error
    report.error = { phase: report.phase, kind: safeKind(error) }
  } finally {
    if (grantCreated && !humanUnknown) {
      try {
        const revoked = await human('POST', `/api/v1/local-projects/${project.id}/grants/revoke`, { agent_id: caller }, 200)
        assert.ok(revoked.grant.revoked_at)
        report.cleanup.grant_revoked = true
      } catch (error) { if (primary == null) producerFailure(error, 'grant-revoke'); primary ??= error; report.cleanup.grant_revoked = 'UNKNOWN' }
    } else report.cleanup.grant_revoked = grantAttempted ? 'UNKNOWN' : 'NOT_CREATED'
    report.cleanup.controller_closed ??= report.open_request_id ? 'UNKNOWN' : 'NOT_CREATED'
    cookie = ''; csrf = ''; token = ''
    try {
      let timer
      try { await Promise.race([dispatcher.close(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Local HTTP dispatcher close remains unknown')), 5000) })]) }
      finally { clearTimeout(timer) }
      report.cleanup.dispatcher_closed = true
    }
    catch (error) { if (primary == null) producerFailure(error, 'dispatcher-close'); primary ??= error; report.cleanup.dispatcher_closed = 'UNKNOWN' }
    report.status = primary ? 'FAIL' : 'PASS'
    report.phase = primary ? report.phase : 'complete'
    await writeFile(join(outputDir, 'result.json'), json(report), { flag: 'wx' })
  }
  if (primary) {
    const error = new Error('The actual controller task creation check failed; bounded metadata retained')
    error.code = 'ERR_SWA_CONTROLLER_INPUT'
    error.observation = report
    throw error
  }
  return { invocationFile, result: report }
}
