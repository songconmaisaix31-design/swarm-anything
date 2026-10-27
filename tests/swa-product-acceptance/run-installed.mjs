import assert from 'node:assert/strict'
import { driverFailure } from './driver-failure.mjs'
import { execFileSync, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { constants, closeSync, fsyncSync, lstatSync, openSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { delimiter, dirname, isAbsolute, join, relative, resolve, toNamespacedPath } from 'node:path'
import { createInterface } from 'node:readline'
import { DatabaseSync } from 'node:sqlite'
import { Readable } from 'node:stream'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { openCodeSingleCase, publicCase, publicFiles, publicRevision, publicSource } from './public-case-definition.mjs'
import { codexEnds, codexStarts, isCodexDelta, originalLinuxTreeProof, validateCodexEventView, validateLinuxServiceReady } from './codex-event-view.mjs'
import { isControlledPiTarget, isPiDelta, originalPiTreeProof, piEnds, piStarts, readPiPrivateJson, requireWindowsPrivatePath, validatePiEventView, validatePiLaunchRecord, validatePiSelection, validateStructuredFinalCustody } from './pi-event-view.mjs'

const help = `真实安装物多Worker验收；不会签发Grant、启动服务或直接调用原生Agent。
使用同安装Node运行本文件，显式传入：
--candidate ABS --data-root ABS --project ABS --project-id ID --endpoint LOOPBACK
--agent ID --model ID --output ABS_NEW_DIRECTORY [--workers 3]
Windows Pi/OpenCode另需--service-log ABS；所有受控Agent另需--source-repository ABS。
StepFun Pi仅Linux workers=3、4、6或Windows workers=4、6，另需--pi-launch-record ABS --pi-launch-sha256 SHA256，取自本次serve owner原件。
StepFun OpenCode仅workers=1、4、6，另需--opencode-launch-record ABS --opencode-launch-sha256 SHA256及相同来源的ready原件。
所有受控Agent另需--service-ready-record ABS --service-ready-sha256 SHA256，绑定本次独立serve readiness。
SWA_PROJECT_TOKEN仅通过受保护环境提供。来源、ToolsOff、当前Grant或完整资源证据缺失时不发送worker.start。
支持Windows Pi/OpenCode、Linux Codex0.163.0及封闭StepFun Pi1.0.1/OpenCode2.0.31来源；缺项目化静态配置仍在启动前NOT_RUN。
业务成果必须由真实Reviewer/Agent控制端审阅；驱动不会自动生成通过记录。
退出：0=已执行断言与成果交接完成，1=失败，2=参数无效，3=未运行/前置不足；最终接受另由Reviewer决定。
`
if (process.argv.length === 3 && process.argv[2] === '--help') {
  process.stdout.write(help)
  process.exit(0)
}

class NotRun extends Error {}
const object = value => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'product_object_missing')
  return value
}
const samePath = (left, right) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
const within = (parent, child) => {
  const path = relative(parent, child)
  return !path || path !== '..' && !path.startsWith('../') && !path.startsWith('..\\') && !isAbsolute(path)
}
let values, workers
try {
  values = parseArgs({ options: Object.fromEntries(['candidate', 'data-root', 'project', 'project-id', 'endpoint', 'agent', 'model', 'output', 'service-log', 'source-repository', 'workers', 'pi-launch-record', 'pi-launch-sha256', 'opencode-launch-record', 'opencode-launch-sha256', 'service-ready-record', 'service-ready-sha256'].map(key => [key, { type: 'string' }])), allowPositionals: false }).values
  values.workers ??= '3'
  if (!/^[1-9]\d*$/.test(values.workers) || !Number.isSafeInteger(Number(values.workers)) || Number(values.workers) < (values.agent === 'opencode' ? 1 : 3) || Number(values.workers) > 100) throw new Error()
  workers = Number(values.workers)
  for (const key of ['candidate', 'data-root', 'project', 'output']) if (!values[key] || !isAbsolute(values[key])) throw new Error()
  if (process.platform === 'win32' && (!values['service-log'] || !isAbsolute(values['service-log']))) throw new Error()
  if (['codex', 'pi', 'opencode'].includes(values.agent) && (!values['source-repository'] || !isAbsolute(values['source-repository']))) throw new Error()
  if (['linux', 'win32'].includes(process.platform) && values.agent === 'pi') {
    if (!isControlledPiTarget(process.platform, values.agent, values.model, workers) || !isAbsolute(values['pi-launch-record'] ?? '') || !/^[a-f0-9]{64}$/.test(values['pi-launch-sha256'] ?? '')) throw new Error()
  } else if (values['pi-launch-record'] !== undefined || values['pi-launch-sha256'] !== undefined) throw new Error()
  if (['linux', 'win32'].includes(process.platform) && values.agent === 'opencode') {
    if (values.model !== 'stepfun/step-3.5-flash' || ![1, 4, 6].includes(workers) || !isAbsolute(values['opencode-launch-record'] ?? '') || !/^[a-f0-9]{64}$/.test(values['opencode-launch-sha256'] ?? '')) throw new Error()
  } else if (values['opencode-launch-record'] !== undefined || values['opencode-launch-sha256'] !== undefined) throw new Error()
  if (['linux', 'win32'].includes(process.platform) && ['codex', 'pi', 'opencode'].includes(values.agent)) {
    if (!isAbsolute(values['service-ready-record'] ?? '') || !/^[a-f0-9]{64}$/.test(values['service-ready-sha256'] ?? '')) throw new Error()
  } else if (values['service-ready-record'] !== undefined || values['service-ready-sha256'] !== undefined) throw new Error()
  for (const key of ['project-id', 'endpoint', 'agent', 'model']) if (!values[key]?.trim()) throw new Error()
  const endpoint = new URL(values.endpoint)
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(endpoint.hostname) || !endpoint.port || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw new Error()
  values.endpoint = endpoint.origin
} catch {
  process.stderr.write('INVALID_ARGUMENTS: explicit current installation, isolated paths, loopback endpoint and workers=3..100 are required; use --help\n')
  process.exit(2)
}

process.umask(0o077)
const piTarget = isControlledPiTarget(process.platform, values.agent, values.model, workers)
const openCodeTarget = ['linux', 'win32'].includes(process.platform) && values.agent === 'opencode'
const openCodeSingle = openCodeTarget && workers === 1
const runFlow = (piTarget || openCodeTarget) && workers > 3
const structured = process.platform === 'linux' && values.agent === 'codex' || piTarget || openCodeTarget
const windows = process.platform === 'win32'
// 旧 profile 不加载未列入其准确依赖清单的 OpenCode 消费者。
const openCodeView = openCodeTarget ? await import('./opencode-event-view.mjs') : null
const token = process.env.SWA_PROJECT_TOKEN
const report = { status: 'NOT_RUN', workers, agent: values.agent, model: values.model, model_execution: 'NOT_RUN', acceptance: 'REQUIRES_INDEPENDENT_REVIEW', checks: [], commands: [], unknown_requests: [], provider_events: [], started_workers: [] }
let output, candidate, dataRoot, project, inputDirectory, swa, runtimeId, controller, rootTask, runId, database, requireRuntime, processAPI, security, daemonOwner
let serviceReady, runtimeCustodian, serviceCustodianBinding, windowsDriverCreationTimeMs
let source, inputs, spec, jsonlParser, foldJournal, observer, capabilityRevision, resultLimits, completed = false
const sources = new Map(), witnesses = new Map(), stopped = new Set()
const sessionOwners = new Map()
const stopRequests = new Map(), releaseRequests = new Map()
const issuedWork = []
const approvedFiles = new Map()
const codexViews = new Map()
const piViews = new Map()
const openCodeViews = new Map()
let openCodeLaunch, openCodeSourceHome, openCodeExecutable
const structuredViews = openCodeTarget ? openCodeViews : piTarget ? piViews : codexViews
let piLaunch, piSourceHome, piSourceRoot, piExecutable
let piProtocol
let submittedRun, runningRun, runArguments, runProcess, leadCompletion, controllerCloseRequest
const roleDefinitions = [
  { name: '公开来源分析', responsibilities: '核对固定stats四原文的模块、Mean API、来源事实、复杂度与实现选择条件。' },
  { name: 'Median设计审阅', responsibilities: '审阅Median设计条件、奇偶长度、输入顺序保持与现有API兼容。' },
  { name: '边界条件审阅', responsibilities: '核对空输入、NaN/Infinity、有限大值和中间值溢出边界，区分事实与待验证行为。' },
  { name: '独立成果审阅', responsibilities: '独立核对现有测试覆盖、证据缺口和任务交付可审性，不把建议当已实现。' },
]
const actualRoles = []
let conversation
const piMetadata = new Map()
const piRecords = new Map(), piNativeFiles = new Map()
const piDriverSources = new Map()
const piPrivateSources = new Map()
const check = (name, detail) => report.checks.push({ name, status: 'PASS', detail })
const native = reply => object(object(reply.result).native)
async function ordinary(path, directory) {
  const canonical = await realpath(path)
  assert.ok(samePath(canonical, resolve(path)), 'redirected_path')
  for (let current = canonical; ; current = dirname(current)) {
    const entry = await lstat(current)
    assert.ok(!entry.isSymbolicLink(), 'symbolic_link_path')
    if (current === canonical) assert.ok(directory ? entry.isDirectory() : entry.isFile(), 'ordinary_input_required')
    else assert.ok(entry.isDirectory(), 'ordinary_ancestor_required')
    if (dirname(current) === current) return canonical
  }
}
async function piSourceMetadata(path, directory) {
  assert.equal(await ordinary(path, directory), path, 'pi_source_path_must_be_canonical')
  const info = await lstat(path, { bigint: true })
  if (windows) requireWindowsPrivatePath(path, directory, security)
  else {
    assert.equal(info.uid, BigInt(process.getuid()))
    assert.equal(info.mode & 0o7777n, directory ? 0o700n : 0o600n)
  }
  if (!directory) assert.equal(info.nlink, 1n)
  return { path, version: `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}`, identity: `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.uid}:${info.mode}:${info.nlink}` }
}
async function readPiOwnedLaunch(revision, daemon) {
  const path = await ordinary(values['pi-launch-record'], false)
  const { value, bytes, source: before } = readPiPrivateJson(path, 16 * 1024, piProtocol.parseStrictPiJson, security)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), values['pi-launch-sha256'], 'pi_owned_launch_hash_changed')
  const launch = validatePiLaunchRecord(value, { installation: candidate, source_revision: revision, data_root: dataRoot, endpoint: values.endpoint })
  assert.equal(launch.serve_pid, daemon.swa_service_job.serve_pid)
  const serve = await observeSource('incarnation', launch.serve_pid)
  assert.equal(serve.absent, false)
  if (windows) assert.equal(serve.incarnation.creationTimeMs, daemon.swa_service_job.serve_created_at_ms)
  else {
    assert.equal(serve.incarnation.boot_id, daemon.swa_service_job.boot_id)
    assert.equal(serve.incarnation.start_ticks, daemon.swa_service_job.serve_start_ticks)
    assert.equal(serve.incarnation.owner_uid, daemon.swa_service_job.owner_uid)
    assert.equal(await realpath(`/proc/${launch.serve_pid}/exe`), join(candidate, 'swa'))
  }
  piSourceHome = launch.pi_source_home
  piSourceRoot = await piSourceMetadata(piSourceHome, true)
  const roots = [candidate, dataRoot, project, await ordinary(values['source-repository'], true), process.env.CODEX_HOME, process.env.CLAUDE_CONFIG_DIR, process.env.SWA_AGENT_PROFILE, ...(process.env.SWA_PROTECTED_ROOTS?.split(delimiter) ?? [])].filter(Boolean)
  for (const root of roots) {
    const canonical = await realpath(root)
    assert.ok(!within(canonical, piSourceHome) && !within(piSourceHome, canonical), 'pi_source_overlaps_protected_root')
  }
  piMetadata.set(path, before)
  for (const name of ['auth.json', 'models.json', 'settings.json']) {
    const file = join(piSourceHome, name)
    piMetadata.set(file, await piSourceMetadata(file, false))
  }
  return { value: launch, serve: serve.incarnation, source: before }
}
async function verifyPiMetadata() {
  if (!piTarget) return
  assert.ok(piLaunch, 'pi_owned_launch_not_observed')
  assert.deepEqual(await piSourceMetadata(piSourceHome, true), piSourceRoot, 'pi_source_root_changed')
  for (const [path, expected] of piMetadata) assert.deepEqual(await piSourceMetadata(path, false), expected, 'pi_source_or_launch_metadata_changed')
  assert.deepEqual(await observeSource('incarnation', piLaunch.value.serve_pid), { absent: false, incarnation: piLaunch.serve }, 'pi_owned_serve_changed')
  if (!windows) assert.equal(await realpath(`/proc/${piLaunch.value.serve_pid}/exe`), join(candidate, 'swa'))
  if (serviceReady) verifyServiceReadySource()
}
async function readOpenCodeOwnedLaunch(revision, daemon) {
  const path = await ordinary(values['opencode-launch-record'], false)
  const actual = readPiPrivateJson(path, 16 * 1024, JSON.parse, security)
  assert.equal(createHash('sha256').update(actual.bytes).digest('hex'), values['opencode-launch-sha256'])
  const value = openCodeView.validateOpenCodeLaunchRecord(actual.value, { installation: candidate, source_revision: revision, data_root: dataRoot, endpoint: values.endpoint })
  assert.equal(value.serve_pid, daemon.swa_service_job.serve_pid)
  assert.equal(path, join(dirname(dataRoot), 'evidence', 'opencode-launch-record.json'))
  openCodeSourceHome = value.opencode_api_key_home
  const source = await piSourceMetadata(openCodeSourceHome, true)
  for (const root of [candidate, dataRoot, project, await ordinary(values['source-repository'], true)]) assert.ok(!within(root, openCodeSourceHome) && !within(openCodeSourceHome, root), 'opencode_source_overlaps_driver_input')
  const serve = await observeSource('incarnation', value.serve_pid)
  assert.equal(serve.absent, false)
  if (windows) assert.equal(serve.incarnation.creationTimeMs, daemon.swa_service_job.serve_created_at_ms)
  else {
    assert.equal(serve.incarnation.boot_id, daemon.swa_service_job.boot_id)
    assert.equal(serve.incarnation.start_ticks, daemon.swa_service_job.serve_start_ticks)
    assert.equal(serve.incarnation.owner_uid, daemon.swa_service_job.owner_uid)
  }
  return { value, serve: serve.incarnation, source: actual.source, sourceRoot: source }
}
async function verifyOpenCodeMetadata() {
  if (!openCodeTarget) return
  assert.ok(openCodeLaunch)
  assert.deepEqual(await piSourceMetadata(openCodeSourceHome, true), openCodeLaunch.sourceRoot)
  const actual = readPiPrivateJson(openCodeLaunch.source.path, 16 * 1024, JSON.parse, security)
  assert.deepEqual(actual.source, openCodeLaunch.source); assert.deepEqual(actual.value, openCodeLaunch.value)
  assert.deepEqual(await observeSource('incarnation', openCodeLaunch.value.serve_pid), { absent: false, incarnation: openCodeLaunch.serve })
  if (!windows) assert.equal(await realpath(`/proc/${openCodeLaunch.value.serve_pid}/exe`), join(candidate, 'swa'))
  if (serviceReady) verifyServiceReadySource()
}
function readServiceReady() {
  const actual = readPiPrivateJson(values['service-ready-record'], 16 * 1024, piTarget ? piProtocol.parseStrictPiJson : JSON.parse, security)
  assert.equal(createHash('sha256').update(actual.bytes).digest('hex'), values['service-ready-sha256'], 'linux_service_ready_hash_changed')
  const expected = { endpoint: values.endpoint, data_root: dataRoot, installation: candidate, runtime_id: runtimeId, node: join(candidate, 'node', windows ? 'node.exe' : 'node') }
  if (windows) {
    const { resource_samples, ...ready } = actual.value
    validateLinuxServiceReady(ready, expected)
    if (resource_samples !== undefined) {
      assert.deepEqual(Object.keys(object(resource_samples)).sort(), ['available_bytes', 'logical_cpus', 'platform', 'sampled_at'])
      assert.equal(resource_samples.platform, 'win32')
      assert.ok(Number.isSafeInteger(resource_samples.available_bytes) && resource_samples.available_bytes >= 0)
      assert.ok(Number.isSafeInteger(resource_samples.logical_cpus) && resource_samples.logical_cpus > 0)
      assert.ok(Number.isFinite(Date.parse(resource_samples.sampled_at)))
    }
  } else validateLinuxServiceReady(actual.value, expected)
  return actual
}
function verifyServiceReadySource() {
  const current = readServiceReady()
  assert.deepEqual(current.source, serviceReady.source, 'linux_service_ready_source_changed')
  assert.deepEqual(current.value, serviceReady.value, 'linux_service_ready_changed')
}
async function verifyRuntimeCustodian() {
  verifyServiceReadySource()
  if (windows) assert.deepEqual(await observeWindowsService(), runtimeCustodian, 'windows_runtime_custodian_changed')
  else assert.deepEqual(await observeSource('runtime-custodian', JSON.stringify(serviceCustodianBinding)), runtimeCustodian, 'linux_runtime_custodian_changed')
}
async function windowsProcesses() {
  assert.equal(windows, true)
  assert.equal(typeof processAPI.getAllProcesses, 'function')
  assert.equal(typeof processAPI.getProcessCreationTime, 'function')
  assert.ok(Number.isSafeInteger(processAPI.supportedProcessDataFlags) && (processAPI.supportedProcessDataFlags & 4) === 4, 'windows_native_birth_flag_missing')
  const driverBirth = processAPI.getProcessCreationTime(process.pid)
  assert.ok(Number.isSafeInteger(driverBirth) && driverBirth > 0, 'windows_driver_birth_unknown')
  windowsDriverCreationTimeMs ??= driverBirth
  assert.equal(driverBirth, windowsDriverCreationTimeMs, 'windows_driver_birth_changed')
  let timer
  const rows = await Promise.race([
    new Promise((resolveRows, reject) => processAPI.getAllProcesses(rows => rows ? resolveRows(rows) : reject(new Error('windows_process_inventory_unknown')), 4)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('windows_process_inventory_timeout')), 10_000) })
  ]).finally(() => clearTimeout(timer))
  assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length <= 100_000)
  assert.equal(new Set(rows.map(row => row.pid)).size, rows.length, 'windows_process_inventory_duplicate')
  const driver = rows.find(row => row.pid === process.pid)
  assert.ok(driver && Number.isSafeInteger(driver.creationTimeMs) && driver.creationTimeMs > 0, 'windows_process_inventory_driver_unknown')
  assert.equal(driver.creationTimeMs, windowsDriverCreationTimeMs, 'windows_process_inventory_driver_changed')
  const currentDriverBirth = processAPI.getProcessCreationTime(process.pid)
  assert.ok(Number.isSafeInteger(currentDriverBirth) && currentDriverBirth > 0, 'windows_driver_birth_unknown')
  assert.equal(currentDriverBirth, windowsDriverCreationTimeMs, 'windows_driver_birth_changed')
  return rows
}
function windowsMember(job, expected) {
  const actual = security.readServiceJobMember(job, expected.pid), user = security.currentUserSid()
  assert.equal(actual.name, job); assert.equal(actual.pid, expected.pid)
  assert.ok(Number.isSafeInteger(actual.creationTimeMs) && actual.creationTimeMs > 0)
  if (expected.creationTimeMs !== undefined) assert.equal(actual.creationTimeMs, expected.creationTimeMs)
  assert.equal(actual.ownerSid, user); assert.equal(actual.protected, true)
  const trustees = new Set([user, 'S-1-5-18'])
  assert.equal(actual.aces.length, trustees.size)
  for (const ace of actual.aces) { assert.equal(ace.flags, 0); assert.equal(ace.mask, 0x1f003f); assert.equal(trustees.delete(ace.sid), true) }
  assert.equal(trustees.size, 0)
  return { pid: actual.pid, creationTimeMs: actual.creationTimeMs }
}
async function observeWindowsService() {
  const rows = await windowsProcesses(), { job, members } = serviceCustodianBinding
  let runtime
  for (const expected of members) {
    const actual = windowsMember(job, expected), matches = rows.filter(row => row.pid === expected.pid)
    assert.equal(matches.length, 1); assert.equal(matches[0].creationTimeMs, actual.creationTimeMs)
    assert.equal(matches[0].name.toLowerCase(), expected.name)
    if (expected.parentPid !== undefined) assert.equal(matches[0].ppid, expected.parentPid)
    if (expected.role === 'runtime') runtime = actual
  }
  assert.ok(runtime)
  return runtime
}
async function verifyPiDriverSources(revision) {
  const repository = await ordinary(values['source-repository'], true)
  for (const name of ['run-installed.mjs', 'driver-failure.mjs', 'public-case-definition.mjs', 'codex-event-view.mjs', 'prepare-source-observer.mjs', 'source-observer-entry.ts', 'extract-observer-source.py', 'pi-event-view.mjs', ...(openCodeTarget ? ['opencode-event-view.mjs', 'opencode-source-observer-entry.ts'] : ['pi-source-observer-entry.ts'])]) {
    const relativePath = 'tests/swa-product-acceptance/' + name
    const path = await ordinary(fileURLToPath(new URL('./' + name, import.meta.url)), false)
    assert.equal(path, join(repository, relativePath), 'pi_driver_not_from_explicit_source_repository')
    const before = await stat(path, { bigint: true })
    assert.ok(before.size > 0n && before.size <= 1024n * 1024n)
    const actual = await readFile(path), original = execFileSync('git', ['--no-pager', 'show', `${revision}:${relativePath}`], { cwd: repository, timeout: 30_000, maxBuffer: 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat' } })
    assert.ok(actual.equals(original), 'pi_driver_source_differs_from_installed_revision')
    const info = await stat(path, { bigint: true }), version = value => `${value.dev}:${value.ino}:${value.birthtimeNs}:${value.mtimeNs}:${value.size}`
    assert.equal(version(info), version(before))
    piDriverSources.set(path, { version: version(info), sha256: createHash('sha256').update(actual).digest('hex') })
  }
}
const safeText = text => {
  assert.ok(!token || !text.includes(token), 'credential_in_output_refused')
  return text
}
async function privateDirectory(path) {
  await ordinary(dirname(path), true)
  if (windows) {
    assert.equal(security.createPrivateDirectory(toNamespacedPath(path)), true, 'private_output_directory_exists')
    await ordinary(path, true); requireWindowsPrivatePath(path, true, security)
  } else await mkdir(path, { mode: 0o700 })
}
function writePrivateTextSync(path, text) {
  const bytes = Buffer.from(safeText(text))
  let fd
  try {
    if (windows) {
      const user = security.currentUserSid()
      security.createFileWithDacl(toNamespacedPath(path), `O:${user}D:P${[...new Set([user, 'S-1-5-18'])].map(sid => `(A;;FA;;;${sid})`).join('')}`, bytes)
      requireWindowsPrivatePath(path, false, security)
      fd = openSync(path, constants.O_RDWR | constants.O_NOFOLLOW)
    } else {
      fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600)
      writeFileSync(fd, bytes)
    }
    fsyncSync(fd)
  } finally { if (fd !== undefined) closeSync(fd); bytes.fill(0) }
}
const save = async (name, value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n'
  writePrivateTextSync(join(output, name), text)
}
async function verifyObserverSources() {
  assert.ok(observer, 'same_revision_observer_not_prepared')
  for (const expected of [...observer.manifest.inputs, observer.manifest.journal_module, observer.manifest.observer, ...(piTarget ? [observer.manifest.protocol_module, observer.manifest.protocol_metafile] : [])]) {
    const path = await ordinary(expected.path, false)
    assert.ok(within(observer.root, path) || within(join(candidate, 'runtime'), path), 'observer_input_outside_approved_sources')
    const before = await stat(path, { bigint: true })
    const version = value => `${value.dev}:${value.ino}:${value.birthtimeNs}:${value.mtimeNs}:${value.size}`
    assert.equal(version(before), expected.version, 'observer_source_version_changed')
    assert.ok(before.size <= 8n * 1024n * 1024n)
    assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), expected.sha256, 'observer_source_bytes_changed')
    assert.equal(version(await stat(path, { bigint: true })), expected.version, 'observer_source_changed_during_read')
  }
}
async function observeSource(mode, input) {
  if (windows && mode === 'incarnation') {
    assert.ok(Number.isSafeInteger(input) && input > 0)
    const rows = await windowsProcesses(), row = rows.find(row => row.pid === input)
    if (!row) return { absent: true, pid: input }
    assert.ok(Number.isSafeInteger(row.creationTimeMs) && row.creationTimeMs > 0, 'windows_process_birth_unknown')
    return { absent: false, incarnation: { pid: row.pid, creationTimeMs: row.creationTimeMs } }
  }
  if (openCodeTarget) {
    assert.ok(observer?.module, 'same_revision_opencode_observer_not_loaded')
    if (mode === 'incarnation') return object(observer.module.observeIncarnation(input))
    if (mode === 'decode-opencode-record') return object(observer.module.decodeOpenCodeRecord(JSON.parse(input)))
    if (mode === 'runtime-custodian') return object(observer.module.observeRuntimeCustodian(JSON.parse(input.toString('utf8'))))
    assert.equal(mode, 'validate-opencode-trace')
    return object(observer.module.validateOpenCodeTrace(Buffer.isBuffer(input) ? input : Buffer.from(input)))
  }
  if (piTarget) {
    assert.ok(observer?.module && piProtocol, 'same_revision_pi_observer_not_loaded')
    if (mode === 'incarnation') return object(observer.module.observeIncarnation(input))
    if (mode === 'decode-pi-record') return object(observer.module.decodePiRecord(piProtocol.parseStrictPiJson(input)))
    if (mode === 'runtime-custodian') return object(observer.module.observeRuntimeCustodian(piProtocol.parseStrictPiJson(input.toString('utf8'))))
    assert.ok(['validate-pi-trace', 'validate-pi-native'].includes(mode), 'pi_observer_mode_unreviewed')
    return object(observer.module.validatePiSource(mode, Buffer.isBuffer(input) ? input : Buffer.from(input)))
  }
  await verifyObserverSources()
  const node = join(candidate, 'node/node')
  const args = mode === 'incarnation' ? [observer.manifest.observer.path, mode, String(input)] : [observer.manifest.observer.path, mode]
  const text = execFileSync(node, args, { input: mode !== 'incarnation' ? input : undefined, encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024, cwd: observer.home, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', HOME: observer.home, TMPDIR: observer.home }, stdio: ['pipe', 'pipe', 'pipe'] })
  await verifyObserverSources()
  return object(JSON.parse(text))
}
function requestId(args) {
  const index = args.indexOf('--request-id')
  return index < 0 ? null : args[index + 1]
}
async function cli(args, expected = 0, observeProgress) {
  const ordinal = report.commands.length + 1
  const entry = { ordinal, args, request_id: requestId(args), mutation: !!requestId(args) && args[0] !== 'request', prepared_at: new Date().toISOString(), state: 'not-submitted' }
  report.commands.push(entry)
  // 原请求先独占落盘并同步，再允许修改到达产品。
  writePrivateTextSync(join(output, `cli-${ordinal}.command.json`), JSON.stringify({ ...entry, state: 'command-intent-only', effect: 'UNKNOWN_WITHOUT_ACTUAL_RECEIPT' }, null, 2) + '\n')
  for (const flag of ['--input-file', '--spec-file', '--result-file']) {
    const index = args.indexOf(flag)
    if (index >= 0) {
      const path = args[index + 1]
      assert.ok(approvedFiles.has(path), 'public_input_was_not_verified')
      assert.equal(await readFile(await ordinary(path, false), 'utf8'), approvedFiles.get(path), 'public_input_changed_before_command')
    }
  }
  entry.state = 'pending'
  entry.started_at = new Date().toISOString()
  const child = spawn(swa, [...args, '--json'], { cwd: project, env: { ...process.env, SWA_ENDPOINT: values.endpoint, SWA_PROJECT_ID: values['project-id'] }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  if (args === runArguments) runProcess = child
  const stdout = [], stderr = []
  const exportsResult = args[0] === 'export' || args[0] === 'task' && args[1] === 'result' || ['run', 'wait'].includes(args[0]) && args.includes('--export')
  const stdoutLimit = exportsResult ? resultLimits.response_bytes : 16 * 1024 * 1024
  let stdoutBytes = 0, stderrBytes = 0, transportUnknown = false
  const timer = setTimeout(() => { transportUnknown = true; child.kill('SIGTERM') }, observeProgress ? 31 * 60_000 : 150_000)
  const progress = observeProgress ? createInterface({ input: child.stderr, crlfDelay: Infinity, terminal: false }) : null
  progress?.on('line', line => {
    try { observeProgress(object(JSON.parse(line))) }
    catch { transportUnknown = true; child.kill('SIGTERM') }
  })
  child.stdout.on('data', bytes => {
    stdoutBytes += bytes.length
    if (stdoutBytes > stdoutLimit) { transportUnknown = true; child.kill('SIGTERM') }
    else stdout.push(bytes)
  })
  child.stderr.on('data', bytes => {
    stderrBytes += bytes.length
    if (stderrBytes <= 256 * 1024) stderr.push(bytes)
    else if (observeProgress) { transportUnknown = true; child.kill('SIGTERM') }
  })
  for (const stream of [child.stdout, child.stderr]) stream.on('error', () => { transportUnknown = true; child.kill('SIGTERM') })
  let result
  try {
    result = await new Promise((resolveExit, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolveExit({ code, signal }))
    })
  } finally { clearTimeout(timer); progress?.close() }
  Object.assign(entry, result, { ended_at: new Date().toISOString(), pid: child.pid })
  const text = safeText(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(stdout)))
  await save(`cli-${ordinal}.stdout.json`, text)
  await save(`cli-${ordinal}.stderr.log`, safeText(Buffer.concat(stderr).toString('utf8')))
  const reply = text.trim() ? object(JSON.parse(text)) : null
  const expectedCodes = Array.isArray(expected) ? expected : [expected]
  if (transportUnknown || result.signal || !expectedCodes.includes(result.code) || !reply || result.code === 0 && reply.ok !== true || result.code === 7 && ['run', 'wait'].includes(args[0]) && reply.error?.code !== 'run_failed') {
    entry.state = 'unknown-or-refused'
    if (entry.mutation) report.unknown_requests.push({ request_id: entry.request_id, args, original_command: ordinal })
    throw new Error('actual_cli_command_failed_preserve_original_request')
  }
  entry.state = result.code === 0 ? 'completed-response-observed' : result.code === 7 && ['run', 'wait'].includes(args[0]) ? 'completed-run-failure-observed' : 'refused-response-observed'
  if (runtimeId && (result.code === 0 || result.code === 7 && ['run', 'wait'].includes(args[0]))) assert.equal(reply.runtime_id, runtimeId, 'runtime_changed')
  return reply
}

// 角色与交接消费既有公开命令入口；原请求先保存，未知不重新提交。
async function publicCommand(command) {
  assert.ok(['role.create', 'role.show', 'conversation.create', 'conversation.append', 'conversation.show', 'handoff.notify', 'worker.start'].includes(command.action))
  for (const flag of ['input_file']) if (command[flag]) {
    assert.ok(approvedFiles.has(command[flag]))
    assert.equal(await readFile(await ordinary(command[flag], false), 'utf8'), approvedFiles.get(command[flag]))
  }
  const commands = report.collaboration_commands ??= []
  const entry = { ordinal: commands.length + 1, command, state: 'intent-only', prepared_at: new Date().toISOString() }
  commands.push(entry)
  await save(`collaboration-${entry.ordinal}.command.json`, entry)
  entry.state = 'pending'
  entry.started_at = new Date().toISOString()
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 150_000)
  try {
    const response = await fetch(`${values.endpoint}/api/v1/local-projects/${encodeURIComponent(values['project-id'])}/orca/commands`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(command.request_id ? { 'Idempotency-Key': command.request_id } : {}) },
      body: JSON.stringify(command), redirect: 'error', signal: abort.signal,
    })
    const chunks = []
    let bytes = 0
    for await (const chunk of Readable.fromWeb(response.body)) {
      bytes += chunk.length
      assert.ok(bytes <= 12 * 1024 * 1024, 'collaboration_response_exceeds_bound')
      chunks.push(chunk)
    }
    const text = safeText(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
    await save(`collaboration-${entry.ordinal}.response.json`, text)
    const reply = object(JSON.parse(text))
    assert.equal(response.status, 200)
    assert.equal(reply.ok, true)
    assert.equal(reply.runtime_id, runtimeId)
    if (command.request_id) assert.equal(reply.request_id, command.request_id)
    entry.state = 'completed-response-observed'
    return reply
  } catch (error) {
    entry.state = 'unknown-or-refused'
    if (command.request_id) report.unknown_requests.push({ request_id: command.request_id, args: ['public-command', command.action], original_command: entry.ordinal })
    throw error
  } finally { entry.ended_at = new Date().toISOString(); clearTimeout(timer) }
}

async function prepareCollaboration() {
  for (const definition of roleDefinitions) {
    const command = { action: 'role.create', request_id: randomUUID(), role: { ...definition, default_agent: values.agent, default_model: values.model, skills: [], knowledge: [] } }
    const role = object(native(await publicCommand(command)).role)
    assert.equal(role.id, command.request_id)
    assert.equal(role.project_id, values['project-id'])
    assert.equal(role.revision, 1)
    assert.equal(role.archived, false)
    for (const [key, value] of Object.entries(command.role)) assert.deepEqual(role[key], value)
    actualRoles.push(role)
  }
  conversation = object(native(await publicCommand({ action: 'conversation.create', request_id: randomUUID(), conversation: { title: `固定公开stats N${workers}审阅`, role_id: actualRoles[0].id } })).conversation)
  assert.equal(conversation.project_id, values['project-id'])
  assert.equal(conversation.role_id, actualRoles[0].id)
  report.collaboration = { roles: actualRoles, conversation, role_slots: [0, 1, 2, 3, 0, 3].slice(0, workers) }
  await appendConversation(approvedFiles.get(inputs[0].input_file))
}

async function appendConversation(text) {
  assert.ok(typeof text === 'string' && text.length > 0)
  const command = { action: 'conversation.append', conversation_id: conversation.id, text: text.trim(), request_id: randomUUID() }
  const observed = native(await publicCommand(command))
  assert.deepEqual(observed.conversation, conversation)
  const entry = observed.entries.find(item => item.id === command.request_id)
  assert.ok(entry)
  assert.equal(entry.request_id, command.request_id); assert.equal(entry.text, command.text)
  assert.equal(entry.status, 'stored'); assert.equal(entry.author_kind, 'agent')
  report.collaboration.conversation_observation = observed
}

function runView(reply, complete = false) {
  const view = object(native(reply).run_view)
  assert.equal(view.schema, 'swa.run-view.v1')
  assert.equal(view.controller, controller)
  assert.equal(view.run_id, runId)
  assert.equal(view.root_task_id, rootTask)
  assert.equal(view.root.id, rootTask)
  for (const name of ['tasks', 'dispatches', 'questions', 'blockers', 'failures', 'deliverables', 'handoffs']) assert.ok(Array.isArray(view[name]))
  assert.equal(view.acceptance, 'unreviewed')
  assert.equal(view.tasks.length, workers + 1)
  assert.equal(new Set(view.tasks.map(task => task.id)).size, workers + 1)
  assert.deepEqual(view.tasks.filter(task => task.id !== rootTask).map(task => task.id).sort(), report.started_workers.map(worker => worker.task_id).sort())
  assert.deepEqual(view.dispatches.map(item => item.id).sort(), report.started_workers.map(worker => worker.dispatch_id).sort())
  assert.equal(view.tasks.find(task => task.id === report.started_workers[0].task_id).parent_id, rootTask)
  assert.equal(view.tasks.find(task => task.id === report.started_workers[3].task_id).parent_id, report.started_workers[0].task_id)
  if (complete) {
    assert.equal(view.complete, true)
    assert.ok(['completed', 'failed'].includes(view.status))
    assert.equal(view.questions.length, 0)
    assert.equal(view.blockers.length, 0)
    assert.ok(view.tasks.every(task => ['completed', 'failed'].includes(task.status)))
    assert.ok(view.dispatches.every(item => item.release_state === 'released'))
  }
  return view
}

// 只读原阶段是否已产生可查询的回执，避免把尚未checkpoint的pending当作失败或反复复制完整正文。
async function waitRunStage(request, method, deadline, caller, accepted = false) {
  const db = new DatabaseSync(database, { readOnly: true })
  try {
    while (Date.now() < deadline) {
      const rows = db.prepare(`SELECT caller_fingerprint,method,state,json_valid(receipt) AS valid,
        CASE WHEN json_valid(receipt) THEN json_extract(receipt,'$.state') END AS native_state,
        CASE WHEN json_valid(receipt) THEN json_extract(receipt,'$.accepted.taskId') END AS task_id,
        CASE WHEN json_valid(receipt) THEN json_extract(receipt,'$.accepted.dispatchId') END AS dispatch_id
        FROM mutation_receipts WHERE request_id=?`).all(request)
      assert.ok(rows.length <= 1, 'run_stage_request_ambiguous')
      if (rows.length) {
        const row = rows[0]
        assert.equal(row.method, method, 'run_stage_method_changed')
        if (caller) assert.equal(row.caller_fingerprint, caller, 'run_stage_caller_changed')
        assert.ok(['pending', 'completed'].includes(row.state), 'run_stage_state_unknown')
        if (row.state === 'completed') {
          assert.equal(row.valid, 1, 'completed_run_stage_has_no_receipt')
          if (accepted) assert.equal(row.native_state, 'ready', 'lead_native_start_not_ready')
          return row
        }
        if (accepted && row.valid && row.task_id && row.dispatch_id) return row
      }
      await Promise.race([delay(50), runningRun.then(outcome => { throw outcome.error ?? new Error('run_ended_before_stage_observation') })])
    }
    throw new Error('run_submission_observation_deadline')
  } finally { db.close() }
}

function runSubmission(original, inputFile) {
  assert.equal(original.requestId, requestId(runArguments))
  assert.equal(original.method, 'swa.controllerOpen')
  assert.equal(original.state, 'completed')
  const receipt = object(original.receipt), submission = object(receipt.submission)
  assert.equal(receipt.project_id, values['project-id'])
  assert.ok(typeof receipt.controller === 'string' && receipt.controller.length > 0)
  assert.equal(submission.schema, 'swa.run-submission.v1')
  assert.equal(submission.command.action, 'run.submit')
  assert.equal(submission.command.request_id, requestId(runArguments))
  assert.equal(submission.command.project_id, values['project-id'])
  assert.equal(submission.command.workdir, project)
  assert.equal(submission.command.name, inputs[0].name)
  assert.equal(submission.command.agent, values.agent)
  assert.equal(submission.command.model, values.model)
  assert.equal(submission.command.role_id, actualRoles[0].id)
  assert.equal(submission.command.revision, actualRoles[0].revision)
  assert.equal(submission.command.conversation_id, conversation.id)
  assert.equal(submission.command.spec_file, join(inputDirectory, 'task.json'))
  assert.equal(resolve(project, submission.spec_input.path), join(inputDirectory, 'task.json'))
  assert.equal(submission.spec_input.text, approvedFiles.get(join(inputDirectory, 'task.json')))
  assert.equal(submission.command.input_file, inputFile)
  assert.equal(resolve(project, submission.lead_input.path), inputFile)
  assert.equal(submission.lead_input.text, approvedFiles.get(inputFile))
  for (const key of ['task_request_id', 'worker_request_id']) assert.match(submission[key], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  assert.equal(new Set([original.requestId, submission.task_request_id, submission.worker_request_id]).size, 3)
  return submission
}

function runLeadIdentity(worker, submission, task, ready = false) {
  assert.equal(worker.requestId, submission.worker_request_id)
  assert.equal(worker.method, 'swa.controllerDeliver')
  assert.ok(ready ? worker.state === 'completed' : ['pending', 'completed'].includes(worker.state))
  assert.equal(task.requestId, submission.task_request_id)
  assert.equal(task.method, 'swa.taskCreate')
  assert.equal(task.state, 'completed')
  const receipt = object(worker.receipt), invocation = object(receipt.invocation), scope = object(invocation.scope)
  for (const value of [receipt, task.receipt, scope]) {
    assert.equal(value.project_id, values['project-id'])
    assert.equal(value.controller, controller)
    assert.equal(value.run_id, runId)
    assert.equal(value.root_task_id, rootTask)
  }
  assert.equal(receipt.action, 'worker.start')
  assert.equal(receipt.child_request, `${worker.requestId}/native`)
  assert.deepEqual(invocation.command, { action: 'worker.start', project_id: values['project-id'], controller, task_id: rootTask,
    name: submission.command.name, agent: submission.command.agent, model: submission.command.model, input_file: submission.command.input_file,
    role_id: submission.command.role_id, revision: submission.command.revision, request_id: submission.worker_request_id })
  for (const [key, value] of Object.entries(submission.caller)) assert.deepEqual(invocation.caller[key], value, 'lead_submission_caller_changed')
  assert.deepEqual(invocation.submission, submission)
  assert.deepEqual(invocation.input, submission.lead_input)
  assert.deepEqual(invocation.selection, submission.selection)
  assert.deepEqual(receipt.selection, submission.selection)
  assert.equal(scope.authority_domain, task.receipt.invocation.scope.authority_domain)
  // Go在每次准入时新建context并补当前Grant期限；核原提交保存的内容，不比较阶段时间戳。
  const currentContext = { ...object(scope.context) }, submittedContext = { ...object(submission.context) }
  for (const context of [currentContext, submittedContext]) { delete context.id; delete context.created_at }
  assert.deepEqual(currentContext, submittedContext)
  assert.ok(Array.isArray(worker.children) && worker.children.length === 1)
  const child = object(worker.children[0])
  assert.equal(child.requestId, receipt.child_request)
  assert.equal(child.method, 'orchestration.workerStart')
  assert.ok(['pending', 'completed'].includes(child.state))
  let accepted
  if (child.state === 'pending') {
    assert.equal(ready, false)
    assert.equal(worker.state, 'pending')
    accepted = object(child.receipt.accepted)
  } else {
    assert.equal(child.receipt.state, 'ready', 'lead_native_start_not_ready')
    assert.equal(child.receipt.runId, runId)
    accepted = child.receipt
  }
  for (const key of ['taskId', 'dispatchId']) assert.ok(typeof accepted[key] === 'string' && accepted[key].length > 0)
  assert.notEqual(accepted.taskId, rootTask)
  if (ready) {
    assert.equal(child.state, 'completed')
    assert.equal(receipt.native.state, 'ready')
    assert.equal(receipt.native.taskId, accepted.taskId)
    assert.equal(receipt.native.dispatchId, accepted.dispatchId)
    assert.deepEqual(receipt.swa_input_binding, child.receipt.swa_input_binding)
  }
  return { task_id: accepted.taskId, dispatch_id: accepted.dispatchId }
}

function acceptedLeadInventory(identity, submission, caller) {
  const db = new DatabaseSync(database, { readOnly: true })
  try {
    db.exec('BEGIN')
    const requests = db.prepare(`SELECT caller_fingerprint,request_id,method,state,receipt FROM mutation_receipts WHERE request_id IN (?,?)`).all(submission.worker_request_id, `${submission.worker_request_id}/native`)
    assert.equal(requests.length, 2)
    for (const row of requests) {
      assert.equal(row.caller_fingerprint, caller)
      assert.ok(['pending', 'completed'].includes(row.state))
      const receipt = object(JSON.parse(row.receipt))
      if (row.request_id === submission.worker_request_id) {
        assert.equal(row.method, 'swa.controllerDeliver')
        assert.equal(receipt.child_request, `${row.request_id}/native`)
        for (const [key, value] of Object.entries({ project_id: values['project-id'], controller, run_id: runId, root_task_id: rootTask })) assert.equal(receipt[key], value)
        assert.deepEqual(receipt.invocation.submission, submission)
      } else {
        assert.equal(row.method, 'orchestration.workerStart')
        const accepted = row.state === 'pending' ? object(receipt.accepted) : receipt
        if (row.state === 'completed') assert.equal(receipt.state, 'ready')
        assert.equal(accepted.taskId, identity.task_id)
        assert.equal(accepted.dispatchId, identity.dispatch_id)
      }
    }
    const rows = db.prepare(`SELECT t.id AS task_id,t.run_id,t.parent_id,t.status AS task_status,root.run_id AS root_run_id,
      d.id AS dispatch_id,d.run_id AS dispatch_run_id,d.status AS dispatch_status,w.state AS worker_state,w.runtime_epoch
      FROM tasks t JOIN tasks root ON root.id=t.parent_id JOIN runs r ON r.id=t.run_id
      JOIN dispatch_contexts d ON d.task_id=t.id JOIN worker_dispatches w ON w.dispatch_id=d.id WHERE t.id=?`).all(identity.task_id)
    assert.equal(rows.length, 1, 'accepted_lead_inventory_ambiguous')
    const row = rows[0]
    assert.equal(row.dispatch_id, identity.dispatch_id)
    assert.equal(row.run_id, runId); assert.equal(row.dispatch_run_id, runId); assert.equal(row.root_run_id, runId)
    assert.equal(row.parent_id, rootTask)
    assert.ok(['pending', 'ready', 'dispatched'].includes(row.task_status), 'accepted_lead_task_not_active')
    assert.ok(['pending', 'dispatched'].includes(row.dispatch_status), 'accepted_lead_dispatch_not_active')
    assert.ok(['starting', 'ready'].includes(row.worker_state), 'accepted_lead_worker_not_starting_or_ready')
    assert.equal(row.runtime_epoch, runtimeId, 'accepted_lead_runtime_changed')
    db.exec('COMMIT')
    return { ...row, observed_at: new Date().toISOString(), requests: requests.map(({ receipt, ...value }) => value) }
  } finally { db.close() }
}

async function submitRun(inputFile) {
  const ready = Promise.withResolvers()
  const deadline = Date.now() + 180_000
  runArguments = ['run', '--workdir', project, '--spec-file', join(inputDirectory, 'task.json'), '--input-file', inputFile, '--agent', values.agent, '--model', values.model,
    '--name', inputs[0].name, '--role', actualRoles[0].id, '--role-revision', String(actualRoles[0].revision), '--conversation', conversation.id, '--request-id', randomUUID()]
  runningRun = cli(runArguments, [0, 7], event => {
    assert.ok(['run_submitted', 'run_reconnect', 'run_progress', 'run_reconnecting'].includes(event.event), 'unknown_run_progress_event')
    report.run_progress ??= []
    report.run_progress.push(event)
    if (event.event === 'run_submitted') {
      assert.equal(event.request_id, requestId(runArguments))
      for (const key of ['controller', 'run_id', 'task_id', 'dispatch_id']) assert.ok(typeof event[key] === 'string' && event[key].length > 0)
      if (submittedRun) assert.deepEqual(event, submittedRun)
      submittedRun = event
      ready.resolve(event)
    }
  }).then(reply => ({ reply }), error => ({ error }))
  const outerStage = await waitRunStage(requestId(runArguments), 'swa.controllerOpen', deadline)
  const original = object((await cli(['request', 'show', '--project', values['project-id'], '--request-id', requestId(runArguments)])).result)
  const submission = runSubmission(original, inputFile)
  controller = original.receipt.controller
  report.controller = controller
  await waitRunStage(submission.task_request_id, 'swa.taskCreate', deadline, outerStage.caller_fingerprint)
  const task = object((await cli(['request', 'show', '--controller', controller, '--request-id', submission.task_request_id])).result)
  assert.equal(task.state, 'completed')
  assert.equal(task.receipt.controller, controller)
  for (const key of ['run_id', 'root_task_id']) assert.ok(typeof task.receipt[key] === 'string' && task.receipt[key].length > 0)
  runId = task.receipt.run_id; rootTask = task.receipt.root_task_id
  Object.assign(report, { run_id: runId, root_task_id: rootTask })
  await waitRunStage(`${submission.worker_request_id}/native`, 'orchestration.workerStart', deadline, outerStage.caller_fingerprint, true)
  const worker = object((await cli(['request', 'show', '--controller', controller, '--request-id', submission.worker_request_id])).result)
  const identity = runLeadIdentity(worker, submission, task)
  report.run_early_submission = { outer: original, task, worker, inventory: acceptedLeadInventory(identity, submission, outerStage.caller_fingerprint) }
  // 完成观察与其余真实启动共同allSettled；这里不将accepted声明为ready。
  leadCompletion = (async () => {
    const submitted = await Promise.race([ready.promise, runningRun.then(outcome => { throw outcome.error ?? new Error('run_ended_before_submission_observation') }), delay(Math.max(1, deadline - Date.now()), undefined, { ref: false }).then(() => { throw new Error('run_submission_observation_deadline') })])
    assert.equal(submitted.controller, controller); assert.equal(submitted.task_id, rootTask); assert.equal(submitted.run_id, runId)
    assert.equal(submitted.dispatch_id, identity.dispatch_id)
    const finalOuter = object((await cli(['request', 'show', '--project', values['project-id'], '--request-id', requestId(runArguments)])).result)
    assert.equal(finalOuter.receipt.controller, controller)
    assert.deepEqual(runSubmission(finalOuter, inputFile), submission)
    const finalTask = object((await cli(['request', 'show', '--controller', controller, '--request-id', submission.task_request_id])).result)
    const finalWorker = object((await cli(['request', 'show', '--controller', controller, '--request-id', submission.worker_request_id])).result)
    assert.deepEqual(runLeadIdentity(finalWorker, submission, finalTask, true), identity)
    report.run_submission = { submitted, outer: finalOuter, task: finalTask, worker: finalWorker }
    return finalWorker
  })().then(worker => ({ worker }), error => ({ error }))
  return { ...identity, request_id: submission.worker_request_id, name: inputs[0].name,
    start_receipt: worker, source_checkpoint: null, actual_input_file: inputFile }
}

const identity = value => ({ session: value.native_session_id, fence: value.fence, process: value.process, provider_link: value.provider_link })
async function queryWorker(dispatch) {
  const observed = native(await cli(['worker', 'show', '--controller', controller, '--dispatch', dispatch]))
  assert.equal(observed.worker.dispatchId, dispatch, 'worker_dispatch_changed')
  assert.equal(observed.worker.runtimeEpoch, runtimeId, 'worker_service_epoch_changed')
  if (runFlow) verifyExecution(observed.execution, observed.source)
  return observed
}
function verifyExecution(value, source, complete = false) {
  const execution = object(value), selection = object(source.selection)
  assert.deepEqual(execution.selection, { agent: selection.agent_id, adapter: selection.adapter, version: selection.version, execution_mode: selection.execution_mode,
    provider: selection.provider, model: selection.model, account_source: selection.native_launch.account.kind })
  for (const name of ['launch', 'control', 'result', 'authenticated']) {
    const observation = object(execution[name])
    assert.ok(['available', 'unavailable', 'unknown'].includes(observation.status))
    assert.ok(typeof observation.reason === 'string' && typeof observation.source === 'string' && typeof observation.basis === 'string')
  }
  assert.equal(execution.launch.status, 'available')
  assert.ok(['sent', 'not_sent', 'unknown'].includes(execution.delivery.state))
  assert.ok(['not_requested', 'resumed', 'rebuilt', 'failed', 'unknown'].includes(execution.resume.state))
  assert.equal(execution.resume.state, 'not_requested', 'this_fresh_worker_must_not_claim_session_recovery')
  if (complete) {
    assert.equal(execution.result.status, 'available')
    assert.equal(execution.authenticated.status, 'available')
    assert.equal(execution.result.basis, 'result')
    assert.equal(execution.authenticated.basis, 'result')
  }
  return execution
}
async function originalStartBinding(worker, observed) {
  const originalSource = object(observed.source)
  let request = object((await cli(['request', 'show', '--controller', controller, '--request-id', worker.request_id])).result)
  const inputWasPending = request.current_input?.state !== 'accepted'
  if (piTarget || openCodeTarget) for (const deadline = Date.now() + 30_000; request.current_input?.state !== 'accepted' && Date.now() < deadline;) {
    assert.ok(!['unknown', 'failed'].includes(request.current_input?.state), 'pi_original_input_unresolved')
    await delay(100)
    request = object((await cli(['request', 'show', '--controller', controller, '--request-id', worker.request_id])).result)
  }
  assert.equal(request.state, 'completed', 'original_start_not_completed')
  // 输入在查询之间才被接受时，重新取得完整来源；不修改较早的 delivery 状态。
  if (((piTarget || openCodeTarget) && inputWasPending) || (runFlow && object(observed.execution).delivery.state !== 'sent')) observed = await queryWorker(worker.dispatch_id)
  const workerSource = object(observed.source)
  assert.deepEqual(identity(workerSource), identity(originalSource), 'original_input_source_changed_during_acceptance')
  const binding = object(object(request.receipt).swa_input_binding)
  const input = object(request.current_input)
  assert.equal(input.state, 'accepted', 'original_start_input_not_accepted')
  assert.deepEqual(input.binding, binding, 'original_start_input_binding_changed')
  assert.equal(input.request_id, worker.request_id)
  assert.equal(input.dispatch_id, worker.dispatch_id)
  assert.equal(input.session_id, workerSource.native_session_id)
  assert.equal(binding.parent_request, worker.request_id)
  assert.equal(binding.dispatch_id, worker.dispatch_id)
  assert.equal(binding.session_id, workerSource.native_session_id)
  assert.equal(binding.agent, values.agent)
  assert.equal(binding.execution_mode, 'structured')
  assert.equal(binding.runtime_fence, workerSource.fence)
  assert.equal(input.operation_id, binding.operation_id)
  if (runFlow) {
    const execution = object(observed.execution)
    assert.equal(execution.delivery.state, 'sent')
    assert.equal(execution.delivery.request_id, worker.request_id)
    assert.equal(execution.delivery.operation_id, binding.operation_id)
  }
  assert.equal(object(object(request.receipt).invocation).caller.settings_revision, capabilityRevision, 'project_settings_changed_after_static_discovery')
  if (values.agent === 'codex') {
    const selection = object(object(request.receipt).selection)
    assert.deepEqual(selection, workerSource.selection, 'original_native_selection_changed')
    assert.equal(selection.agent_id, 'codex')
    assert.equal(selection.version, '0.163.0')
    assert.equal(selection.model, values.model)
    assert.equal(selection.provider, 'openai')
    assert.equal(selection.native_launch.account.kind, 'codex-native-api-key')
    assert.equal(selection.native_launch.tools.mode, 'disabled')
    assert.equal(selection.native_launch.tools.native_contract, 'codex-cli-0.163.0')
  }
  if (piTarget) {
    await verifyPiMetadata()
    const selection = object(object(request.receipt).selection)
    assert.deepEqual(selection, workerSource.selection, 'original_pi_selection_changed')
    validatePiSelection(selection, { executable: piExecutable, sourceHome: piSourceHome, privateRoot: join(dataRoot, 'pi-workers', values['project-id']) })
    for (const source of [selection.native_launch.account.auth_source, selection.native_launch.account.models_source]) assert.equal((await piSourceMetadata(source.path, false)).version, source.version, 'pi_original_source_version_changed')
    assert.ok(selection.configuration_version.includes(`;${piMetadata.get(join(piSourceHome, 'settings.json')).version};${piMetadata.get(join(piSourceHome, 'auth.json')).version};`), 'pi_actual_configuration_version_changed')
  }
  if (openCodeTarget) {
    await verifyOpenCodeMetadata()
    const selection = object(request.receipt.selection)
    assert.deepEqual(selection, workerSource.selection)
    openCodeView.validateOpenCodeSelection(selection, { executable: openCodeExecutable, sourceHome: openCodeSourceHome, privateRoot: join(dataRoot, 'opencode', values['project-id']) })
  }
  return { binding, observed }
}
async function sessionRecord(workerSource) {
  const path = await ordinary(workerSource.journal_database, false)
  assert.ok(within(dataRoot, path), 'session_journal_outside_private_root')
  const before = await stat(path, { bigint: true })
  const journalSource = { path, identity: `${before.dev}:${before.ino}:${before.birthtimeNs}` }
  const journal = new DatabaseSync(path, { readOnly: true })
  try {
    if (structured) {
      const actual = journal.prepare(`SELECT session_id,
        CASE WHEN length(CAST(record_json AS BLOB)) BETWEEN 1 AND 1048576 THEN record_json ELSE NULL END AS record_json
        FROM agent_session_records WHERE session_id=?`).get(workerSource.native_session_id)
      assert.ok(actual && typeof actual.record_json === 'string', 'actual_session_record_missing_or_exceeds_bound')
      assert.equal(actual.session_id, workerSource.native_session_id)
      const decoded = await observeSource(openCodeTarget ? 'decode-opencode-record' : piTarget ? 'decode-pi-record' : 'decode-record', actual.record_json)
      assert.equal(decoded.schema_version, 2)
      assert.equal(decoded.session_id, actual.session_id)
      assert.equal(decoded.provider, values.agent)
      assert.equal(decoded.model, values.model)
      assert.equal(decoded.head.handle.agent, values.agent)
      assert.equal(decoded.head.handle.transport, openCodeTarget ? 'acp' : piTarget ? 'jsonl-rpc' : 'codex-app-server')
      assert.equal(decoded.lease.runtimeKind, 'native')
      assert.equal(decoded.lease.sessionId, actual.session_id)
      assert.equal(decoded.lease.handoffStage, null)
      assert.equal(decoded.lease.unreconciled, false)
      const after = await stat(path, { bigint: true })
      assert.equal(`${after.dev}:${after.ino}:${after.birthtimeNs}`, journalSource.identity, 'session_journal_replaced')
      if (piTarget) assert.deepEqual(decoded.account_home, { variable: 'PI_CODING_AGENT_DIR', path: join(dataRoot, 'pi-workers', values['project-id'], decoded.session_id) })
      if (piTarget) piRecords.set(decoded.session_id, { path, projection: decoded })
      if (openCodeTarget) assert.deepEqual(decoded.account_home, { kind: 'opencode', locator: { kind: 'private', root: join(dataRoot, 'opencode', values['project-id'], decoded.session_id) } })
      return { journal_source: journalSource, session_id: decoded.session_id, provider: decoded.provider, model: decoded.model, head: decoded.head, lease: decoded.lease, ...(piTarget || openCodeTarget ? { account_home: decoded.account_home, journal_epoch: journal.prepare('SELECT epoch FROM journal_sessions WHERE session_id=?').get(decoded.session_id)?.epoch } : {}) }
    }
    const row = journal.prepare(`SELECT session_id,
      json_extract(record_json, '$.schemaVersion') AS schema_version,
      json_extract(record_json, '$.sessionId') AS record_session_id,
      json_extract(record_json, '$.provider') AS provider,
      json_extract(record_json, '$.options.model') AS model,
      json_extract(record_json, '$.providerHandleChain') AS handles,
      json_extract(record_json, '$.lease') AS lease
      FROM agent_session_records WHERE session_id=? AND json_valid(record_json)=1`).get(workerSource.native_session_id)
    assert.ok(row, 'actual_session_record_missing')
    assert.equal(row.schema_version, 2, 'session_record_schema_unreviewed')
    assert.equal(row.session_id, workerSource.native_session_id)
    assert.equal(row.record_session_id, row.session_id)
    assert.equal(row.provider, values.agent)
    assert.equal(row.model, values.model)
    const handles = JSON.parse(row.handles), lease = object(JSON.parse(row.lease))
    assert.ok(Array.isArray(handles) && handles.length > 0)
    // 此入口只支持现有 Pi/OpenCode neutral handles，typed handles 另行审查。
    const head = object(handles.at(-1)), handle = object(head.handle)
    assert.equal(handle.agent, values.agent)
    assert.equal(handle.transport, values.agent === 'pi' ? 'jsonl-rpc' : 'acp')
    assert.equal(lease.sessionId, row.session_id)
    assert.equal(lease.runtimeKind, 'native')
    assert.equal(lease.unreconciled, false, 'session_record_unreconciled')
    assert.equal(lease.handoffStage, null, 'session_record_handoff_in_progress')
    const after = await stat(path, { bigint: true })
    assert.equal(`${after.dev}:${after.ino}:${after.birthtimeNs}`, journalSource.identity, 'session_journal_replaced')
    return { journal_source: journalSource, session_id: row.session_id, provider: row.provider, model: row.model, head, lease: { claimStatus: lease.claimStatus, runtimeFence: lease.runtimeFence, provenHandleLinkId: lease.provenHandleLinkId, ownerProcess: lease.ownerProcess, deathEvidence: lease.deathEvidence } }
  } finally { journal.close() }
}
async function verifySessionOwner(record, workerSource, owner, worker) {
  assert.deepEqual(record.journal_source, owner.journal_source, 'original_session_journal_changed')
  assert.deepEqual(record.head, owner.head, 'original_provider_head_changed')
  assert.equal(record.head.mintedAtFence, owner.binding.runtime_fence)
  if (record.lease.claimStatus === 'live') {
    assert.equal(record.lease.runtimeFence, owner.binding.runtime_fence)
    assert.equal(record.lease.provenHandleLinkId, record.head.linkId)
    assert.deepEqual(record.lease.ownerProcess, owner.process, 'original_session_owner_changed')
  } else {
    assert.equal(record.lease.claimStatus, 'released', 'session_owner_unproven')
    assert.equal(record.lease.ownerProcess, null)
    assert.ok(record.lease.runtimeFence > owner.binding.runtime_fence)
    assert.equal(record.lease.deathEvidence?.kind, 'exit-observed')
    assert.equal(record.lease.deathEvidence?.ownerFence, owner.binding.runtime_fence)
    if (structured) {
      if (runFlow && !worker.stop?.reply) await verifyAutomaticRelease(worker, owner)
      else {
        assert.ok(worker.stop?.reply && stopRequests.get(worker.dispatch_id)?.request_id === worker.stop.request_id, 'released_owner_has_no_original_stop_response')
        assert.equal(native(worker.stop.reply).state, 'stopped')
      }
      const final = validateStructuredFinalCustody(workerSource.custody, structuredViews.get(workerSource.native_session_id))
      assert.deepEqual(windows ? final.root : final.observation.root, owner.incarnation)
      assert.equal(windows ? final.forced : final.observation.fullTreeProof.forced, false)
    } else {
      assert.ok(stopped.has(worker.dispatch_id) && worker.stop?.proof, 'released_owner_has_no_original_complete_job_proof')
      assert.equal(worker.stop.proof.root.pid, owner.process.pid)
      assert.equal(worker.stop.proof.root.creationTimeMs, owner.process.processStartTimeMs)
    }
  }
  assert.equal(workerSource.process.runtime_id, owner.process.runtime)
  assert.equal(workerSource.process.pid, owner.process.pid)
  if (structured) {
    const { runtime_id, ...linuxProcess } = workerSource.process
    const expected = windows ? { pid: workerSource.process.pid, creationTimeMs: workerSource.process.creation_time_ms } : linuxProcess
    assert.deepEqual(expected, owner.incarnation)
    const observed = await observeSource('incarnation', owner.process.pid)
    if (record.lease.claimStatus === 'live') assert.deepEqual(observed, { absent: false, incarnation: expected })
    else assert.ok(observed.absent || JSON.stringify(observed.incarnation) !== JSON.stringify(expected), 'original_bootstrap_identity_still_alive')
  } else assert.equal(workerSource.process.creation_time_ms, owner.process.processStartTimeMs)
}
function workerResource(dispatch) {
  const db = new DatabaseSync(database, { readOnly: true })
  try {
    const rows = db.prepare('SELECT id,origin_dispatch_id,owner_dispatch_id,terminal_handle,process_incarnation,ownership_state,release_state FROM worker_terminal_resources WHERE owner_dispatch_id=?').all(dispatch)
    assert.equal(rows.length, 1, 'original_worker_resource_missing_or_ambiguous')
    return rows[0]
  } finally { db.close() }
}
async function verifyAutomaticRelease(worker, owner) {
  const request = `${rootTask}/native-lifecycle/${worker.dispatch_id}/release`
  const db = new DatabaseSync(database, { readOnly: true })
  let row
  try {
    for (const deadline = Date.now() + 30_000; Date.now() < deadline;) {
      const rows = db.prepare('SELECT method,state,receipt FROM mutation_receipts WHERE request_id=?').all(request)
      assert.ok(rows.length <= 1, 'automatic_release_receipt_ambiguous')
      if (rows.length && rows[0].state === 'completed') { row = rows[0]; break }
      assert.ok(!rows.length || rows[0].method === 'orchestration.workerRelease' && rows[0].state === 'pending', 'automatic_release_has_unknown_terminal_state')
      await delay(100)
    }
  } finally { db.close() }
  assert.ok(row, 'automatic_release_original_request_not_completed')
  assert.equal(row.method, 'orchestration.workerRelease')
  const receipt = object(JSON.parse(row.receipt)), resource = workerResource(worker.dispatch_id)
  assert.equal(receipt.dispatchId, worker.dispatch_id)
  assert.ok(['released', 'already_released'].includes(receipt.state))
  assert.equal(resource.release_state, 'released')
  assert.equal(resource.ownership_state, 'released')
  for (const key of ['id', 'origin_dispatch_id', 'owner_dispatch_id', 'terminal_handle', 'process_incarnation']) assert.equal(resource[key], owner.resource[key], 'automatic_release_changed_original_resource')
  worker.automatic_release = { request_id: request, receipt, resource }
}
async function events(workerSource, observed, originalOwner) {
  assert.equal(workerSource.availability, 'observed')
  assert.equal(workerSource.provider, values.agent)
  const worker = report.started_workers.find(item => item.source?.native_session_id === workerSource.native_session_id)
  assert.ok(worker, 'source_has_no_original_dispatch')
  let owner = sessionOwners.get(workerSource.native_session_id) ?? originalOwner
  observed ??= piTarget && owner ? { source: sources.get(workerSource.native_session_id).source } : await queryWorker(worker.dispatch_id)
  let binding = owner?.binding
  if (!owner) ({ binding, observed } = await originalStartBinding(worker, observed))
  const latest = object(observed.source)
  assert.deepEqual(identity(latest), identity(workerSource), 'source_changed_its_original_binding')
  if (structured) {
    const observed = object(latest.provider_events_observation)
    assert.equal(observed.kind, 'prefix')
    assert.ok(Number.isSafeInteger(observed.byte_length) && observed.byte_length > 0)
    assert.ok(Number.isSafeInteger(observed.incomplete_tail_bytes) && observed.incomplete_tail_bytes >= 0)
    assert.ok(Number.isSafeInteger(observed.record_count) && observed.record_count > 0 && observed.record_count <= 100_000)
    assert.ok(Number.isFinite(Date.parse(observed.observed_at)))
    assert.ok(observed.byte_length + observed.incomplete_tail_bytes <= 12 * 1024 * 1024)
  }
  workerSource = latest
  const beforeRecord = await sessionRecord(workerSource)
  const startedAt = performance.now()
  worker.last_observation = { phase: 'owner_before', request_id: worker.request_id, dispatch_id: worker.dispatch_id,
    before_lease: beforeRecord.lease.claimStatus, source_version: workerSource.provider_events_source?.version }
  if (!owner) {
    assert.equal(beforeRecord.lease.claimStatus, 'live', 'first_owner_observation_must_be_live')
    const process = object(beforeRecord.lease.ownerProcess)
    assert.match(process.runtime, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, 'actual_process_runtime_incarnation_missing')
    assert.deepEqual(beforeRecord.head, workerSource.provider_link, 'provider_source_head_differs_from_actual_record')
    owner = { binding, process, head: beforeRecord.head, journal_source: beforeRecord.journal_source }
    if (runFlow) {
      owner.resource = workerResource(worker.dispatch_id)
      assert.equal(owner.resource.ownership_state, 'owned')
      assert.equal(owner.resource.owner_dispatch_id, worker.dispatch_id)
    }
    if (structured) {
      const observed = await observeSource('incarnation', process.pid)
      assert.equal(observed.absent, false)
      owner.incarnation = observed.incarnation
    }
  }
  // A released lease requires the final source and complete trace, obtained below.
  // Checking the cached live custody here loses the release transition.
  if (!structured || beforeRecord.lease.claimStatus === 'live') await verifySessionOwner(beforeRecord, workerSource, owner, worker)
  assert.ok(Number.isSafeInteger(workerSource.process.pid) && (!windows || workerSource.process.creation_time_ms > 0))
  const path = await ordinary(workerSource.provider_events, false)
  assert.ok(within(dataRoot, path), 'provider_source_outside_private_root')
  let rows, observation, finalRecord
  if (structured) {
    const { readProviderTraceObservation } = requireRuntime('./task-result.cjs')
    let snapshot = await readProviderTraceObservation({ path, maximum: 12 * 1024 * 1024, requirePrivatePath: async path => { await piSourceMetadata(path, false) } })
    let afterRecord = await sessionRecord(workerSource)
    if (beforeRecord.lease.claimStatus === 'released' || afterRecord.lease.claimStatus === 'released' || snapshot.rows.at(-1)?.event === 'custody_closed') {
      const originalPrefix = snapshot.bytes
      const closedSource = object((await queryWorker(worker.dispatch_id)).source)
      assert.deepEqual(identity(closedSource), identity(workerSource), 'closed_source_changed_original_binding')
      workerSource = closedSource
      snapshot = await readProviderTraceObservation({ path, maximum: 12 * 1024 * 1024, requirePrivatePath: async path => { await piSourceMetadata(path, false) } })
      assert.ok(snapshot.bytes.length >= originalPrefix.length && snapshot.bytes.subarray(0, originalPrefix.length).equals(originalPrefix), 'released_provider_prefix_changed')
      assert.equal(snapshot.rows.at(-1)?.event, 'custody_closed', 'released_provider_has_no_final_custody')
      assert.deepEqual(workerSource.custody, snapshot.rows.at(-1).detail, 'released_source_final_custody_differs')
      for (const deadline = Date.now() + 30_000;;) {
        afterRecord = await sessionRecord(workerSource)
        if (afterRecord.lease.claimStatus === 'released') break
        assert.equal(afterRecord.lease.claimStatus, 'live', 'unreviewed_session_owner_transition')
        assert.ok(Date.now() < deadline, 'closed_provider_lease_not_released')
        await delay(100)
      }
    }
    const { bytes } = snapshot
    observation = snapshot.observation
    Object.assign(worker.last_observation, { phase: 'trace', source_version: snapshot.source.version, prefix_bytes: bytes.length,
      last_sequence: snapshot.rows.at(-1)?.sequence, last_event: snapshot.rows.at(-1)?.event, after_lease: afterRecord.lease.claimStatus })
    assert.equal(snapshot.source.path, workerSource.provider_events_source.path)
    assert.equal(snapshot.source.version.split(':').slice(0, 3).join(':'), workerSource.provider_events_source.version.split(':').slice(0, 3).join(':'))
    assert.ok(observation.byte_length >= workerSource.provider_events_observation.byte_length, 'provider_observation_regressed')
    let aggregate = BigInt(bytes.length + observation.incomplete_tail_bytes)
    for (const [otherPath, value] of witnesses) if (otherPath !== path) aggregate += BigInt(value.bytes.length)
    assert.ok(aggregate <= BigInt(resultLimits.result_bytes), 'aggregate_provider_bytes_exceed_bound')
    const signature = snapshot.source.version.split(':').slice(0, 3).join(':')
    const old = witnesses.get(path)
    if (old) assert.ok(old.signature === signature && bytes.length >= old.bytes.length && bytes.subarray(0, old.bytes.length).equals(old.bytes), 'provider_prefix_changed')
    assert.equal(bytes.at(-1), 10, 'provider_observation_has_no_complete_record')
    if (piTarget) await observeSource('validate-pi-trace', bytes)
    if (openCodeTarget) await observeSource('validate-opencode-trace', bytes)
    rows = snapshot.rows
    if (rows.at(-1)?.event === 'custody_closed') {
      assert.equal(observation.incomplete_tail_bytes, 0, 'closed_provider_has_incomplete_tail')
      const current = await stat(path, { bigint: true })
      assert.equal(`${current.dev}:${current.ino}:${current.birthtimeNs}:${current.mtimeNs}:${current.size}`, snapshot.source.version, 'closed_provider_source_changed')
      assert.deepEqual(workerSource.custody, rows.at(-1).detail)
    }
    // The synchronous strict parser can span release; re-read the lease after it.
    const parsedRecord = await sessionRecord(workerSource)
    if (afterRecord.lease.claimStatus === 'live' && parsedRecord.lease.claimStatus === 'released') {
      // Keep the exact read prefix as a witness before the bounded final-source read.
      witnesses.set(path, { signature, bytes, source_version: snapshot.source.version, observation })
      return events(workerSource, await queryWorker(worker.dispatch_id), owner)
    }
    assert.deepEqual(parsedRecord, afterRecord, 'session_owner_changed_during_strict_parse')
    if (beforeRecord.lease.claimStatus === afterRecord.lease.claimStatus) assert.deepEqual(afterRecord, beforeRecord, 'session_owner_changed_during_event_read')
    else assert.ok(beforeRecord.lease.claimStatus === 'live' && afterRecord.lease.claimStatus === 'released', 'unreviewed_session_owner_transition')
    finalRecord = afterRecord
    witnesses.set(path, { signature, bytes, source_version: snapshot.source.version, observation })
  } else {
    const handle = await open(path, 'r')
    try {
      const before = await handle.stat({ bigint: true })
      assert.ok(before.size > 0n && before.size <= 64n * 1024n * 1024n, 'provider_source_bound')
      const bytes = Buffer.concat(await Array.fromAsync(handle.createReadStream({ start: 0, end: Number(before.size) - 1, autoClose: false })))
      const signature = `${before.dev}:${before.ino}:${before.birthtimeNs}`
      const old = witnesses.get(path)
      if (old) assert.ok(old.signature === signature && bytes.length >= old.bytes.length && bytes.subarray(0, old.bytes.length).equals(old.bytes), 'provider_prefix_changed')
      assert.equal(bytes.length, Number(before.size))
      assert.equal(bytes.at(-1), 10, 'provider_source_incomplete_record')
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      rows = []
      for await (const item of Readable.from([bytes]).pipe(jsonlParser.asStream())) rows.push(item.value)
      const after = await stat(path, { bigint: true })
      assert.equal(`${after.dev}:${after.ino}:${after.birthtimeNs}`, signature)
      assert.ok(after.size >= before.size)
      const afterRecord = await sessionRecord(workerSource)
      await verifySessionOwner(afterRecord, workerSource, owner, worker)
      if (beforeRecord.lease.claimStatus === afterRecord.lease.claimStatus) assert.deepEqual(afterRecord, beforeRecord, 'session_owner_changed_during_event_read')
      else assert.ok(beforeRecord.lease.claimStatus === 'live' && afterRecord.lease.claimStatus === 'released', 'unreviewed_session_owner_transition')
      witnesses.set(path, { signature, bytes })
    } finally { await handle.close() }
  }
  if (values.agent === 'opencode' && !openCodeTarget) rows = rows.filter(row => row.session_id === workerSource.native_session_id && row.runtime_fence === workerSource.fence)
  if (values.agent === 'codex') {
    assert.equal(workerSource.runtime_epoch, runtimeId)
    const view = validateCodexEventView(rows, { session: workerSource.native_session_id, fence: owner.binding.runtime_fence, runtimeEpoch: runtimeId, process: workerSource.process, executable: workerSource.selection.executable, nodeExecutable: join(candidate, 'node/node'), nativeId: owner.head.handle.nativeId, model: values.model })
    const previous = codexViews.get(workerSource.native_session_id)
    if (previous) {
      assert.deepEqual(view.custody, previous.custody)
      assert.deepEqual(view.nativeCLI, previous.nativeCLI)
    } else {
      assert.deepEqual((await observeSource('incarnation', view.nativeCLI.pid)), { absent: false, incarnation: { platform: 'linux', pid: view.nativeCLI.pid, boot_id: view.nativeCLI.boot_id, start_ticks: view.nativeCLI.start_ticks, owner_uid: view.nativeCLI.owner_uid } })
      assert.deepEqual(view.custody.owner, runtimeCustodian, 'linux_custody_owner_differs_from_service_runtime')
    }
    if (rows.at(-1).event === 'custody_closed') assert.deepEqual(workerSource.custody, rows.at(-1).detail)
    codexViews.set(workerSource.native_session_id, view)
    let aggregate = Buffer.byteLength(JSON.stringify(rows))
    for (const [session, value] of sources) if (session !== workerSource.native_session_id) aggregate += Buffer.byteLength(JSON.stringify(value.rows))
    assert.ok(aggregate <= resultLimits.result_bytes, 'aggregate_actual_provider_sources_exceed_bound')
  } else if (openCodeTarget) {
    const view = openCodeView.validateOpenCodeEventView(rows, { session: workerSource.native_session_id, fence: owner.binding.runtime_fence, runtimeEpoch: runtimeId, process: workerSource.process, owner: runtimeCustodian, executable: openCodeExecutable, nativeId: owner.head.handle.nativeId, home: beforeRecord.account_home.locator.root, cwd: project })
    const previous = openCodeViews.get(workerSource.native_session_id)
    if (previous) { assert.deepEqual(view.custody, previous.custody); assert.deepEqual(view.nativeCLI, previous.nativeCLI); assert.deepEqual(view.ready, previous.ready) }
    else {
      assert.deepEqual(await observeSource('incarnation', view.nativeCLI.pid), { absent: false, incarnation: custodyIncarnation(view.nativeCLI) })
      assertCustodyOwner(view)
    }
    if (view.finalRow) assert.deepEqual(workerSource.custody, view.finalRow.detail)
    openCodeViews.set(workerSource.native_session_id, view)
  } else if (piTarget) {
    assert.equal(workerSource.runtime_epoch, runtimeId)
    const view = validatePiEventView(rows, { session: workerSource.native_session_id, fence: owner.binding.runtime_fence, runtimeEpoch: runtimeId, process: workerSource.process, owner: runtimeCustodian, executable: piExecutable, nodeExecutable: join(candidate, 'node', windows ? 'node.exe' : 'node'), sessionFile: owner.head.handle.nativeId, home: beforeRecord.account_home.path, journalEpoch: beforeRecord.journal_epoch })
    await piSourceMetadata(beforeRecord.account_home.path, true)
    await piSourceMetadata(join(beforeRecord.account_home.path, 'settings.json'), false)
    for (const name of ['auth.json', 'models.json']) {
      const path = join(beforeRecord.account_home.path, name), source = view.ready.sources.find(value => value.path === path)
      assert.equal((await piSourceMetadata(path, false)).version, source.version, 'pi_private_projection_source_changed')
      piPrivateSources.set(path, source)
    }
    const previous = piViews.get(workerSource.native_session_id)
    if (previous) {
      assert.deepEqual(view.custody, previous.custody)
      assert.deepEqual(view.nativeCLI, previous.nativeCLI)
      assert.deepEqual(view.ready, previous.ready)
    } else {
      assert.deepEqual(await observeSource('incarnation', view.nativeCLI.pid), { absent: false, incarnation: custodyIncarnation(view.nativeCLI) })
      assertCustodyOwner(view)
    }
    if (view.finalRow) assert.deepEqual(workerSource.custody, view.finalRow.detail)
    piViews.set(workerSource.native_session_id, view)
  } else for (const row of rows) {
    assert.equal(row.process.pid, workerSource.process.pid)
    assert.equal(row.process.creationTimeMs, workerSource.process.creation_time_ms)
    assert.ok(Number.isFinite(row.monotonic_ms) && typeof row.observed_at === 'string')
    assert.ok(row.native_cli?.pid > 0 && row.native_cli.creationTimeMs > 0 && row.native_cli.pid !== row.process.pid)
    assert.equal(row.projection, values.agent === 'pi' ? 'actual_native_cli_lifecycle_and_delta_fields' : 'actual_native_acp_lifecycle_and_delta_fields')
  }
  if (structured) {
    worker.last_observation.phase = 'owner_after'
    await verifySessionOwner(finalRecord, workerSource, owner, worker)
    if (worker.automatic_release && finalRecord.lease.claimStatus === 'released') stopped.add(worker.dispatch_id)
  }
  Object.assign(worker.last_observation, { phase: 'complete', elapsed_ms: performance.now() - startedAt })
  if (!sessionOwners.has(workerSource.native_session_id)) check('worker.runtime_identity', { dispatch_id: worker.dispatch_id, session_id: workerSource.native_session_id, service_runtime_epoch: runtimeId, process_runtime_incarnation: owner.process.runtime, original_fence: owner.binding.runtime_fence })
  sessionOwners.set(workerSource.native_session_id, owner)
  sources.set(workerSource.native_session_id, { source: workerSource, rows, ...(observation ? { observation } : {}) })
  return rows
}
async function workerEventLists() {
  const observed = await Promise.allSettled(report.started_workers.map(worker => events(worker.source)))
  const failed = observed.find(item => item.status === 'rejected')
  if (failed) throw failed.reason
  return observed.map(item => item.value)
}
function assertCustodyOwner(view) {
  if (windows) assert.equal(view.custody.ownerPid, runtimeCustodian.pid, 'windows_custody_owner_differs_from_service_runtime')
  else assert.deepEqual(view.custody.owner, runtimeCustodian, 'linux_custody_owner_differs_from_service_runtime')
}
const custodyIncarnation = row => windows ? { pid: row.pid, creationTimeMs: row.creationTimeMs } : { platform: 'linux', pid: row.pid, boot_id: row.boot_id, start_ticks: row.start_ticks, owner_uid: row.owner_uid }
const isDelta = row => openCodeTarget ? openCodeView.isOpenCodeDelta(row) : row.protocol === 'pi-jsonl-rpc' ? isPiDelta(row) : row.protocol === 'codex-app-server' ? isCodexDelta(row) : row.protocol === 'acp'
  ? row.event === 'session/update' && row.detail?.kind === 'known' && ['agent_message_chunk', 'agent_thought_chunk'].includes(row.detail.notification?.update?.sessionUpdate) && row.detail.notification.update.content?.type === 'text' && !!row.detail.notification.update.content.text
  : row.record?.type === 'message_update' && ['text_delta', 'thinking_delta'].includes(row.record.assistantMessageEvent?.type) && typeof row.record.assistantMessageEvent.delta === 'string' && !!row.record.assistantMessageEvent.delta
const starts = rows => openCodeTarget ? openCodeView.openCodeStarts(rows) : piTarget ? piStarts(rows) : values.agent === 'codex' ? codexStarts(rows) : rows.filter(row => row.protocol === 'acp' ? row.event === 'session/prompt' : row.record?.type === 'agent_start')
const ends = rows => openCodeTarget ? openCodeView.openCodeEnds(rows) : piTarget ? piEnds(rows) : values.agent === 'codex' ? codexEnds(rows) : rows.filter(row => row.protocol === 'acp' ? row.event === 'session/prompt/response' : row.record?.type === 'agent_end')
async function piReplayNativeInventory(view) {
  const path = view.ready.session_file
  const before = await piSourceMetadata(path, false)
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  const version = info => `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}`
  let bytes
  try {
    const info = await handle.stat({ bigint: true })
    assert.equal(version(info), before.version)
    assert.ok(info.size > 0n && info.size <= 12n * 1024n * 1024n, 'pi_replay_native_bound')
    const buffer = Buffer.alloc(Number(info.size) + 1)
    let size = 0
    while (size < buffer.length) {
      const read = await handle.read(buffer, size, buffer.length - size, null)
      if (!read.bytesRead) break
      size += read.bytesRead
    }
    assert.equal(size, Number(info.size), 'pi_replay_native_changed_during_read')
    assert.equal(version(await handle.stat({ bigint: true })), before.version)
    assert.deepEqual(await piSourceMetadata(path, false), before)
    bytes = buffer.subarray(0, size)
  } finally { await handle.close() }
  const checked = await observeSource('validate-pi-native', bytes)
  assert.equal(checked.header.id, view.ready.session_id)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  assert.equal(bytes.at(-1), 10)
  const entries = text.slice(0, -1).split('\n').map(line => piProtocol.parseStrictPiJson(line))
  assert.equal(entries.length, checked.record_count)
  return { path, source_version: before.version, sha256: createHash('sha256').update(bytes).digest('hex'), entry_ids: entries.slice(1).map(entry => entry.id) }
}
async function settledReplay(args, original, submit, originalRequest = requestId(args)) {
  const status = await cli(['request', 'show', '--controller', controller, '--request-id', originalRequest])
  assert.equal(status.result.state, 'completed', 'unknown_request_must_not_replay')
  const executionCounts = async () => Promise.all([...sources.values()].map(async ({ source: actual }) => {
    const rows = await events(actual)
    const counts = { session: actual.native_session_id, fence: actual.fence, starts: starts(rows), ends: ends(rows) }
    if (piTarget) {
      const view = piViews.get(actual.native_session_id)
      counts.prompt_writes = rows.filter(row => row.event === 'write_intent' && row.detail.command === 'prompt')
      counts.user_echoes = rows.filter(row => row.event === 'native_record' && row.detail.frame.type === 'message_end' && row.detail.frame.message.role === 'user')
      counts.native = await piReplayNativeInventory(view)
    }
    if (openCodeTarget) {
      const result = native(await cli(['task', 'result', '--controller', controller, '--task', rootTask, '--output-dir', join(inputDirectory, 'replay-observation-' + randomUUID())]))
      const worker = result.workers.find(worker => worker.source.native_session_id === actual.native_session_id)
      assert.ok(worker && worker.native_session.format === 'opencode-sqlite-v2')
      counts.prompt_writes = rows.filter(row => row.event === 'write_intent')
      counts.user_echoes = rows.filter(row => row.event === 'input_delivered')
      counts.native = { native_id: worker.native_session.native_id, message_ids: worker.native_session.messages.map(row => ({ id: row.id, seq: row.seq, type: row.type })), input_receipts: worker.native_session.input_receipts }
    }
    return counts
  }))
  const before = await executionCounts()
  const replay = submit ? await submit() : await cli(args)
  for (const key of ['request_id', 'controller', 'run_id', 'task_id', 'dispatch_id']) if (original[key] !== undefined) assert.equal(replay[key], original[key])
  const afterRequest = await cli(['request', 'show', '--controller', controller, '--request-id', originalRequest])
  assert.deepEqual(afterRequest.result.receipt, status.result.receipt, 'replay_changed_original_receipt')
  assert.deepEqual(afterRequest.result.current_input, status.result.current_input, 'replay_changed_input_operation')
  assert.deepEqual(await executionCounts(), before, 'replay_started_another_native_operation')
  await delay(300)
  assert.deepEqual(await executionCounts(), before, 'replay_native_execution_count_changed_after_response')
  check('completed_request_replay.native_execution_counts', { request_id: originalRequest, sessions: before.map(row => ({ session: row.session, fence: row.fence, starts: row.starts.length, ends: row.ends.length, ...(piTarget ? { prompt_writes: row.prompt_writes.length, user_echoes: row.user_echoes.length, native_entry_ids: row.native.entry_ids, native_sha256: row.native.sha256 } : {}) })), observation_ms: 300 })
  return replay
}
async function proveWindowsTree(workerSource, checkpoint) {
  const proofs = []
  const log = await ordinary(values['service-log'], false)
  const offset = BigInt(checkpoint.size)
  for (const deadline = Date.now() + 2000; Date.now() < deadline && (await stat(log, { bigint: true })).size <= offset;) await delay(50)
  const handle = await open(log, 'r')
  const before = await handle.stat({ bigint: true })
  assert.equal(`${before.dev}:${before.ino}:${before.birthtimeNs}`, checkpoint.identity, 'service_log_replaced')
  assert.ok(before.size > offset, 'service_log_truncated_or_tree_proof_not_observed')
  assert.ok(before.size - offset <= 64n * 1024n * 1024n, 'service_log_observation_bound')
  const lines = createInterface({ input: handle.createReadStream({ start: Number(offset), end: Number(before.size) - 1, autoClose: false }), crlfDelay: Infinity })
  let lineNumber = 0
  try {
  for await (const line of lines) {
    lineNumber++
    if (!line.startsWith('{')) continue
    let row
    try { row = JSON.parse(line) } catch { continue }
    if (row.type !== 'swa_provider_job_tree_exited' || row.root?.pid !== workerSource.process.pid || row.root.creationTimeMs !== workerSource.process.creation_time_ms) continue
    assert.equal(row.observations.length, 2)
    assert.equal(row.independentIdentityObservations.length, 2)
    for (const observation of row.observations) {
      assert.equal(observation.observation.ownerPid, runtimeCustodian.pid)
      assert.equal(observation.observation.rootPid, workerSource.process.pid)
      assert.equal(observation.observation.rootCreationTimeMs, workerSource.process.creation_time_ms)
      assert.equal(observation.observation.assigned, true)
      assert.equal(observation.observation.rootExited, true)
      assert.deepEqual(observation.observation.members, [])
    }
    assert.ok(row.observations[1].elapsedMs > row.observations[0].elapsedMs)
    for (const observation of row.independentIdentityObservations) for (const item of observation.identities) assert.ok(item.observed == null || item.observed.creationTimeMs !== item.expected.creationTimeMs)
    proofs.push({ ...row, actual_source: { path: log, source_identity: checkpoint.identity, observed_after_byte: checkpoint.size.toString(), relative_line_number: lineNumber } })
  }
    const after = await stat(log, { bigint: true })
    assert.equal(`${after.dev}:${after.ino}:${after.birthtimeNs}`, checkpoint.identity)
    assert.ok(after.size >= before.size)
  } finally { lines.close(); await handle.close() }
  assert.equal(proofs.length, 1, 'complete_original_job_tree_proof_missing_or_ambiguous')
  for (let index = 0; index < 2; index++) {
    if (index) await delay(75)
    const rows = await windowsProcesses()
    const root = rows.find(row => row.pid === workerSource.process.pid)
    assert.ok(!root || root.creationTimeMs !== undefined && root.creationTimeMs !== workerSource.process.creation_time_ms)
  }
  return proofs[0]
}
async function stopWorker(worker, active = false, observedEvents) {
  assert.ok(!stopRequests.has(worker.dispatch_id) && !releaseRequests.has(worker.dispatch_id), 'preserve_original_stop_or_release_request')
  const args = ['worker', 'stop', '--controller', controller, '--dispatch', worker.dispatch_id, '--request-id', randomUUID()]
  const priorEvents = structured ? observedEvents ?? await events(worker.source) : null
  if (observedEvents) assert.equal(sources.get(worker.source.native_session_id)?.rows, observedEvents, 'active_stop_observation_is_not_current')
  if (structured && active && !openCodeTarget) assert.equal(ends(priorEvents).length, 0, 'turn_ended_before_active_stop')
  if (!piTarget) stopRequests.set(worker.dispatch_id, { args, request_id: requestId(args) })
  let checkpoint
  if (structured) {
    checkpoint = { sequence: priorEvents.at(-1).sequence, request_id: requestId(args) }
    if (piTarget && active) {
      const cycle = piViews.get(worker.source.native_session_id).active
      assert.ok(cycle && !cycle.end && !cycle.settled, 'pi_active_stop_checkpoint_is_not_running')
      Object.assign(checkpoint, { cid: cycle.cid, running: true })
    }
    if (openCodeTarget) {
      checkpoint.monotonic_ms = priorEvents.at(-1).monotonic_ms
      if (active) {
        const cycle = openCodeViews.get(worker.source.native_session_id).active
        assert.ok(cycle?.start && cycle.deltas.length > 0 && !cycle.end, 'opencode_active_stop_checkpoint_missing')
        checkpoint.cid = cycle.cid
      }
    }
  }
  else {
    const log = await stat(await ordinary(values['service-log'], false), { bigint: true })
    checkpoint = active || !worker.source_checkpoint ? { identity: `${log.dev}:${log.ino}:${log.birthtimeNs}`, size: log.size.toString() } : worker.source_checkpoint
  }
  if (windows && structured) {
    await verifyRuntimeCustodian()
    const info = await stat(await ordinary(values['service-log'], false), { bigint: true })
    checkpoint.job_log = { identity: `${info.dev}:${info.ino}:${info.birthtimeNs}`, size: info.size.toString() }
  }
  if (piTarget) stopRequests.set(worker.dispatch_id, { args, request_id: requestId(args) })
  const reply = await cli(args)
  assert.equal(native(reply).state, 'stopped')
  worker.stop = { request_id: requestId(args), args, reply, proof: null, active_stop_requested: active }
  let proof
  if (structured) {
    const rows = await events(worker.source), view = structuredViews.get(worker.source.native_session_id)
    proof = openCodeTarget ? openCodeView.originalOpenCodeTreeProof(rows, view, checkpoint, active) : piTarget ? originalPiTreeProof(rows, view, checkpoint, active) : originalLinuxTreeProof(rows, view, checkpoint)
    for (const expected of windows ? [proof.final.root, custodyIncarnation(view.nativeCLI)] : [view.custody.root, view.custody.nativeState.identity]) {
      const observed = await observeSource('incarnation', expected.pid)
      assert.ok(observed.absent || JSON.stringify(observed.incarnation) !== JSON.stringify(expected), 'original_stopped_process_identity_still_alive')
    }
    if (windows) {
      const job = await proveWindowsTree(worker.source, checkpoint.job_log)
      assert.deepEqual(job.root, proof.final.root)
      assert.deepEqual(job.observations, proof.final.observations)
      assert.deepEqual(job.independentIdentityObservations, proof.final.independentIdentityObservations)
      assert.equal(job.forced, proof.final.forced)
      proof.job_log = job
      await verifyRuntimeCustodian()
    }
  } else proof = await proveWindowsTree(worker.source, checkpoint)
  stopped.add(worker.dispatch_id)
  worker.stop.proof = proof
  return worker.stop
}
async function readTranscript(dispatch) {
  const pages = [], seen = new Set(), messages = new Map()
  let cursor
  for (;;) {
    const reply = await cli(['worker', 'read', '--controller', controller, '--dispatch', dispatch, '--source', 'transcript', '--limit', '100', ...(cursor ? ['--cursor', cursor] : [])])
    const page = native(reply)
    assert.equal(page.source, 'transcript')
    assert.equal(page.sourceExact, true)
    assert.ok(Array.isArray(page.transcript.messages) && typeof page.transcript.limited === 'boolean')
    if (pages.length) assert.equal(page.sourceIdentity, pages[0].sourceIdentity)
    for (const message of page.transcript.messages) {
      if (messages.has(message.id)) assert.deepEqual(messages.get(message.id), message)
      messages.set(message.id, message)
    }
    pages.push(page)
    if (!page.transcript.limited) { assert.equal(page.contentComplete, true); break }
    cursor = page.transcript.nextCursor
    assert.ok(typeof cursor === 'string' && !seen.has(cursor), 'incomplete_or_cyclic_transcript_page')
    seen.add(cursor)
    assert.ok(pages.length < 1000, 'transcript_page_bound')
  }
  return { pages, messages: [...messages.values()] }
}

async function readCompleteNativeFile(value) {
  assert.ok(within(dataRoot, await ordinary(value.path, false)), 'native_rollout_outside_private_root')
  if (piTarget || openCodeTarget) await piSourceMetadata(value.path, false)
  const handle = await open(value.path, piTarget || openCodeTarget ? constants.O_RDONLY | constants.O_NOFOLLOW : 'r')
  let bytes
  try {
    const before = await handle.stat({ bigint: true })
    const version = info => `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}`
    assert.equal(version(before), value.source_version)
    assert.ok(before.size > 0n && before.size <= 12n * 1024n * 1024n)
    const buffer = Buffer.alloc(Number(before.size) + 1)
    let size = 0
    while (size < buffer.length) {
      const read = await handle.read(buffer, size, buffer.length - size, size)
      if (!read.bytesRead) break
      size += read.bytesRead
    }
    assert.equal(size, Number(before.size))
    assert.equal(version(await handle.stat({ bigint: true })), value.source_version)
    assert.equal(version(await stat(value.path, { bigint: true })), value.source_version)
    bytes = buffer.subarray(0, size)
  } finally { await handle.close() }
  assert.equal(bytes.at(-1), 10)
  assert.equal(new TextDecoder('utf-8', { fatal: true }).decode(bytes), value.content, 'complete_native_export_differs_from_actual_file')
  if (piTarget) piNativeFiles.set(value.path, { source_version: value.source_version, bytes })
  return bytes
}

async function piNativeRows(value) {
  assert.equal(value.format, 'pi-session-jsonl')
  const bytes = await readCompleteNativeFile(value)
  const checked = await observeSource('validate-pi-native', bytes)
  const rows = []
  for await (const item of Readable.from([bytes]).pipe(jsonlParser.asStream())) rows.push(item.value)
  assert.equal(rows.length, checked.record_count)
  assert.equal(rows.length, value.record_count)
  assert.deepEqual(rows[0], checked.header)
  assert.equal(checked.header.id, value.native_id)
  assert.equal(checked.header.cwd, project)
  assert.ok(value.path.endsWith(`_${value.native_id}.jsonl`))
  let parent = null
  const ids = new Set()
  for (const entry of rows.slice(1)) {
    assert.ok(!ids.has(entry.id) && entry.parentId === parent, 'pi_native_parent_chain_changed')
    ids.add(entry.id); parent = entry.id
    if (entry.type === 'model_change') { assert.equal(entry.provider, 'stepfun'); assert.equal(entry.modelId, 'step-3.5-flash') }
  }
  return { bytes, header: checked.header, entries: rows.slice(1) }
}

async function verifyPiJournalInputs(worker, original, bindings, actualNative) {
  const view = piViews.get(original.source.native_session_id)
  assert.ok(view && view.ready.session_id === worker.native_session.native_id && view.ready.session_file === worker.native_session.path)
  const folded = foldJournal({ sessionId: worker.journal.session_id, epoch: worker.journal.epoch })
  for (const row of worker.journal.rows) assert.equal(folded.add({ seq: row.seq, ts: row.ts, rowJson: JSON.stringify(row.row) }), true)
  const actual = folded.finish()
  assert.equal(actual.damage, null); assert.equal(actual.newer, null)
  const { readPiJournalInputTurn, readPiFinalBlock } = requireRuntime('./task-result.cjs')
  assert.equal(typeof readPiJournalInputTurn, 'function')
  assert.equal(typeof readPiFinalBlock, 'function')
  for (const submission of actual.state.submissions.values()) assert.ok(!['pending', 'unknown'].includes(submission.dispatchState), 'pi_unresolved_journal_input')
  const messages = actualNative.entries.filter(entry => entry.type === 'message')
  const raw = sources.get(original.source.native_session_id).rows.filter(row => row.event === 'native_record' && row.detail.frame.type === 'message_end')
  assert.deepEqual(messages.map(entry => entry.message), raw.map(row => row.detail.frame.message), 'pi_raw_and_native_full_messages_differ')
  const submitted = []
  for (const binding of bindings) {
    const status = object((await cli(['request', 'show', '--controller', controller, '--request-id', binding.parent_request])).result.current_input)
    assert.equal(status.state, 'accepted'); assert.deepEqual(status.binding, binding)
    const submission = actual.state.submissions.get(binding.operation_id), receipt = actual.state.receipts.get(binding.operation_id)
    assert.deepEqual(submission, status.submission)
    assert.equal(submission?.dispatchState, 'accepted')
    assert.equal(submission?.fence, original.source.fence)
    assert.equal(submission?.payloadFingerprint, observer.module.fingerprintPiBody(binding.session_id, binding.body))
    assert.equal(submission?.clientMessageId, binding.operation_id)
    assert.ok(Number.isSafeInteger(submission?.submittedSequence) && submission.submittedSequence > 0)
    assert.equal(receipt?.providerItemId, submission.providerItemId)
    assert.equal(receipt?.clientMessageId, binding.operation_id)
    assert.equal(receipt?.cursor.epoch, worker.journal.epoch)
    assert.ok(Number.isSafeInteger(receipt?.cursor.sequence) && receipt.cursor.sequence > 0 && receipt.cursor.sequence <= actual.state.lastSequence)
    const item = actual.state.items.get(actual.state.aliases.get(submission.providerItemId) ?? submission.providerItemId)
    assert.equal(item?.body.kind, 'message'); assert.equal(item.body.role, 'user')
    assert.equal(item.agentId, undefined)
    assert.deepEqual(item.body.blocks, binding.body.blocks)
    assert.equal(actual.state.itemFences.get(item.itemId), binding.runtime_fence)
    const prompt = view.prompts.filter(value => value.cid === binding.operation_id)
    assert.equal(prompt.length, 1)
    assert.deepEqual(prompt[0].write.detail.binding, binding)
    assert.ok(prompt[0].echo && prompt[0].write.settled && prompt[0].write.reply)
    const rawIndex = raw.indexOf(prompt[0].echo)
    assert.ok(rawIndex >= 0 && messages[rawIndex].message.role === 'user')
    const baseline = prompt[0].write.detail.native_baseline
    if (baseline.source) {
      assert.equal(baseline.source.path, worker.native_session.path)
      assert.equal(baseline.source.version.split(':').slice(0, 3).join(':'), worker.native_session.source_version.split(':').slice(0, 3).join(':'))
      assert.ok(baseline.bytes >= 0 && baseline.bytes < actualNative.bytes.length)
      const prefix = actualNative.bytes.subarray(0, baseline.bytes)
      assert.equal(createHash('sha256').update(prefix).digest('hex'), baseline.sha256)
      if (prefix.length) {
        await observeSource('validate-pi-native', prefix)
        for await (const value of Readable.from([prefix]).pipe(jsonlParser.asStream())) assert.notEqual(value.value.id, messages[rawIndex].id, 'pi_user_entry_predates_original_submit')
      }
    } else assert.equal(baseline.absent, true)
    const turn = readPiJournalInputTurn(actual.state, item, binding.session_id, binding.runtime_fence)
    assert.equal(turn?.body.kind, 'turn'); assert.equal(turn.agentId, undefined)
    assert.equal(actual.state.itemFences.get(turn.itemId), binding.runtime_fence)
    submitted.push({ sequence: submission.submittedSequence, cid: binding.operation_id, nativeEntry: messages[rawIndex], baseline, turn })
  }
  submitted.sort((a, b) => a.sequence - b.sequence)
  assert.equal(submitted.length, view.prompts.length)
  for (const [index, row] of submitted.entries()) {
    if (index) {
      assert.ok(row.sequence > submitted[index - 1].sequence)
      assert.ok(!row.baseline.absent, 'pi_later_input_has_no_original_prefix')
    }
    assert.equal(row.cid, view.prompts[index].cid, 'pi_original_submission_order_changed')
  }
  for (const submission of actual.state.submissions.values()) if (submission.dispatchState === 'accepted') assert.ok(bindings.some(binding => binding.operation_id === submission.clientMessageId))
  const latest = submitted.at(-1)
  assert.ok(latest)
  for (const projection of view.projections) {
    const report = projection.detail.report
    assert.equal(report.journalEpoch, worker.journal.epoch)
    for (const step of report.steps.filter(value => value.written)) {
      const rows = worker.journal.rows.filter(value => value.epoch === report.journalEpoch && value.row.fence === original.source.fence)
      if (step.kind === 'settlement') assert.ok(rows.some(value => value.row.kind === 'lifecycle-batch' && value.row.settlementId === step.settlementId), 'pi_written_settlement_missing_from_actual_journal')
      else {
        const sameItem = itemId => itemId === step.itemId || (actual.state.aliases.get(itemId) ?? itemId) === (actual.state.aliases.get(step.itemId) ?? step.itemId)
        assert.ok(rows.some(value => value.row.kind === 'item' && sameItem(value.row.itemId) || value.row.kind === 'lifecycle-batch' && value.row.mutations.some(mutation => mutation.kind === 'item' && sameItem(mutation.itemId))), 'pi_written_item_missing_from_actual_journal')
      }
    }
  }
  check('pi.actual_chunks_and_full_native_messages', { session_id: original.source.native_session_id, native_id: view.ready.session_id, native_message_count: messages.length,
    cycles: view.cycles.map(cycle => ({ cid: cycle.cid, delta_count: cycle.deltas.length, assistant_messages: cycle.completedMessages.map(message => ({ timestamp: message.final.detail.frame.message.timestamp, content_indices: [...message.blocks.keys()], block_ends_observed: [...message.blocks.values()].every(block => !!block.ended), stop_reason: message.final.detail.frame.message.stopReason })) })) })
  if (worker.native_session.availability === 'complete') {
    const final = messages.at(-1), finalRaw = raw.at(-1)
    assert.equal(final.message.role, 'assistant'); assert.equal(final.message.stopReason, 'stop')
    assert.equal(final.id, worker.native_session.final.entry_id)
    assert.equal(worker.native_session.final.text, final.message.content.filter(block => block.type === 'text').map(block => block.text).join(''))
    assert.equal(latest.turn?.body.kind, 'turn'); assert.equal(latest.turn.body.state, 'completed'); assert.equal(latest.turn.body.outcome, 'success')
    const cycle = view.cycles.at(-1)
    assert.equal(cycle.cid, latest.cid)
    assert.ok(cycle.end && cycle.settled && cycle.idle && cycle.finalMessage === finalRaw)
    const closes = view.projections.filter(row => row.detail.eventType === 'text.close' && row.detail.sourceSequence === finalRaw.sequence)
    assert.ok(closes.length)
    for (const close of closes) {
      const expected = readPiFinalBlock(final.message.content, close.detail.providerItem)
      const block = final.message.content[expected.index]
      const candidates = view.projections.filter(row => row.sequence <= close.sequence && row.detail.providerItem === close.detail.providerItem)
      const itemIds = new Set(candidates.flatMap(row => row.detail.report.steps.filter(step => step.kind === 'item' && step.written).map(step => step.itemId)).filter(itemId => observer.module.matchesPiJournalItem(itemId, original.source.native_session_id, close.detail.providerItem)))
      assert.ok(itemIds.size)
      for (const itemId of itemIds) {
        const item = actual.state.items.get(actual.state.aliases.get(itemId) ?? itemId)
        assert.equal(item?.body.kind, 'message')
        assert.equal(item.body.role, expected.role)
        assert.equal(item.agentId, undefined)
        assert.equal(item.turnScope?.kind, 'turn')
        assert.equal(item.turnScope?.turnItemId, latest.turn.itemId)
        assert.equal(actual.state.itemFences.get(item.itemId), original.source.fence)
        assert.equal(item.body.blocks.flatMap(value => value.type === 'text' ? [value.text] : []).join(''), block.type === 'text' ? block.text : block.thinking)
      }
    }
  } else assert.equal(original.stop?.active_stop_requested, true, 'pi_only_real_stopped_worker_may_be_partial')
}

function piRootInventory() {
  const db = new DatabaseSync(database, { readOnly: true })
  try {
    db.exec('BEGIN')
    const receiptsWhere = `FROM mutation_receipts WHERE json_valid(receipt)=1 AND method='swa.controllerDeliver'
      AND json_extract(receipt,'$.project_id')=? AND json_extract(receipt,'$.run_id')=? AND json_extract(receipt,'$.root_task_id')=?`
    const params = [values['project-id'], runId, rootTask]
    const bound = db.prepare(`SELECT COUNT(*) AS count,SUM(LENGTH(CAST(receipt AS BLOB))) AS bytes FROM mutation_receipts WHERE request_id IN
      (SELECT request_id ${receiptsWhere} UNION SELECT request_id||'/native' ${receiptsWhere})`).get(...params, ...params)
    assert.ok(bound.count <= 100_000 && (bound.bytes ?? 0) <= 12 * 1024 * 1024)
    const receipts = db.prepare(`SELECT caller_fingerprint,request_id,method,state,payload_hash,receipt FROM mutation_receipts WHERE request_id IN
      (SELECT request_id ${receiptsWhere} UNION SELECT request_id||'/native' ${receiptsWhere}) ORDER BY caller_fingerprint,request_id`).all(...params, ...params)
    for (const receipt of receipts) assert.ok(!['pending', 'unknown'].includes(receipt.state), 'pi_root_has_unresolved_original_request')
    const taskWhere = runFlow ? 'run_id=?' : 'run_id=? AND (id=? OR parent_id=?)'
    const taskParameters = runFlow ? [runId] : [runId, rootTask, rootTask]
    const taskBound = db.prepare(`SELECT COUNT(*) AS count,SUM(LENGTH(CAST(spec AS BLOB))) AS bytes FROM tasks WHERE ${taskWhere}`).get(...taskParameters)
    assert.ok(taskBound.count <= 101 && (taskBound.bytes ?? 0) <= 12 * 1024 * 1024)
    const tasks = db.prepare(`SELECT id,run_id,parent_id,status,spec FROM tasks WHERE ${taskWhere} ORDER BY id`).all(...taskParameters)
    if (runFlow) {
      assert.equal(tasks.length, workers + 1)
      assert.equal(tasks.find(task => task.id === rootTask).parent_id, null)
      for (const [index, worker] of report.started_workers.entries()) {
        const task = tasks.find(item => item.id === worker.task_id)
        assert.ok(task)
        assert.equal(task.parent_id, index === 3 ? report.started_workers[0].task_id : rootTask)
        const spec = object(JSON.parse(task.spec)), role = actualRoles[[0, 1, 2, 3, 0, 3][index]]
        assert.equal(spec.role_snapshot.id, role.id)
        assert.equal(spec.role_snapshot.revision, role.revision)
      }
    } else assert.equal(tasks.filter(row => row.parent_id === rootTask).length, workers)
    const run = db.prepare('SELECT id,coordinator_handle,consumer_generation FROM runs WHERE id=?').get(runId)
    assert.equal(run.coordinator_handle, controller)
    const dispatches = db.prepare(`SELECT d.id,d.run_id,d.task_id,d.status,d.assignee_handle,d.assignee_orca_session_id,d.process_incarnation,d.contract_version,d.capability_revoked_at,
      w.runtime_epoch,w.state,w.stage,w.agent_terminal_handle FROM dispatch_contexts d JOIN tasks t ON t.id=d.task_id
      LEFT JOIN worker_dispatches w ON w.dispatch_id=d.id WHERE d.run_id=? ${runFlow ? '' : 'AND t.parent_id=?'} ORDER BY d.id LIMIT 101`).all(...(runFlow ? [runId] : [runId, rootTask]))
    assert.equal(dispatches.length, workers)
    assert.deepEqual(dispatches.map(row => row.id).sort(), report.started_workers.map(row => row.dispatch_id).sort())
    const resources = db.prepare(`SELECT id,origin_dispatch_id,owner_dispatch_id,terminal_handle,process_incarnation,ownership_state,release_state
      FROM worker_terminal_resources WHERE origin_dispatch_id IN (SELECT d.id FROM dispatch_contexts d JOIN tasks t ON t.id=d.task_id WHERE d.run_id=? ${runFlow ? '' : 'AND t.parent_id=?'})
      OR owner_dispatch_id IN (SELECT d.id FROM dispatch_contexts d JOIN tasks t ON t.id=d.task_id WHERE d.run_id=? ${runFlow ? '' : 'AND t.parent_id=?'}) ORDER BY id LIMIT 101`).all(...(runFlow ? [runId, runId] : [runId, rootTask, runId, rootTask]))
    assert.equal(resources.length, workers)
    const value = JSON.stringify({ run, tasks, receipts, dispatches, resources })
    assert.ok(Buffer.byteLength(value) <= 12 * 1024 * 1024)
    return value
  } finally { db.close() }
}

function piFinalSourceCheck(inventory, result, windowsSnapshot) {
  assert.equal(piRootInventory(), inventory, 'pi_complete_root_or_original_request_inventory_changed')
  const version = info => `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}`
  const privateFile = path => {
    assert.equal(realpathSync(path), path)
    const info = lstatSync(path, { bigint: true })
    assert.ok(info.isFile() && !info.isSymbolicLink() && info.nlink === 1n)
    if (windows) requireWindowsPrivatePath(path, false, security)
    else assert.ok(info.uid === BigInt(process.getuid()) && (info.mode & 0o7777n) === 0o600n)
    return info
  }
  assert.equal(realpathSync(piSourceHome), piSourceHome)
  const rootInfo = lstatSync(piSourceHome, { bigint: true })
  assert.ok(rootInfo.isDirectory() && !rootInfo.isSymbolicLink())
  if (windows) requireWindowsPrivatePath(piSourceHome, true, security)
  else assert.ok(rootInfo.uid === BigInt(process.getuid()) && (rootInfo.mode & 0o7777n) === 0o700n)
  assert.equal(version(rootInfo), piSourceRoot.version, 'pi_source_root_changed_before_export')
  for (const [path, expected] of piMetadata) assert.equal(version(privateFile(path)), expected.version, 'pi_source_metadata_changed_before_export')
  for (const [path, expected] of piNativeFiles) assert.equal(version(privateFile(path)), expected.source_version, 'pi_native_source_changed_before_export')
  for (const [path, expected] of piPrivateSources) assert.equal(version(privateFile(path)), expected.version, 'pi_private_projection_changed_before_export')
  for (const snapshot of piRecords.values()) {
    const home = snapshot.projection.account_home.path, info = lstatSync(home, { bigint: true })
    assert.equal(realpathSync(home), home)
    assert.ok(info.isDirectory() && !info.isSymbolicLink())
    if (windows) requireWindowsPrivatePath(home, true, security)
    else assert.ok(info.uid === BigInt(process.getuid()) && (info.mode & 0o7777n) === 0o700n)
    privateFile(join(home, 'settings.json'))
  }
  for (const expected of [...observer.manifest.inputs, observer.manifest.journal_module, observer.manifest.observer, observer.manifest.protocol_module, observer.manifest.protocol_metafile]) {
    assert.equal(realpathSync(expected.path), expected.path)
    assert.equal(version(statSync(expected.path, { bigint: true })), expected.version, 'pi_observer_source_changed_before_export')
  }
  for (const [path, expected] of piDriverSources) assert.equal(version(statSync(path, { bigint: true })), expected.version, 'pi_driver_changed_before_export')
  verifyServiceReadySource()
  if (windows) {
    for (const expected of serviceCustodianBinding.members) assert.deepEqual(windowsMember(serviceCustodianBinding.job, expected), { pid: expected.pid, creationTimeMs: expected.creationTimeMs })
  } else {
    assert.deepEqual(observer.module.observeIncarnation(piLaunch.value.serve_pid), { absent: false, incarnation: piLaunch.serve })
    assert.deepEqual(observer.module.observeIncarnation(daemonOwner.pid), { absent: false, incarnation: daemonOwner })
    assert.deepEqual(observer.module.observeRuntimeCustodian(serviceCustodianBinding), runtimeCustodian, 'linux_runtime_custodian_changed_before_export')
  }
  // 产品完整导出已含原 trace/native content，不能重复把同一原件另计一次。
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= resultLimits.result_bytes, 'pi_total_export_observation_exceeds_bound')
  for (const worker of result.workers) {
    const session = worker.source.native_session_id, snapshot = piRecords.get(session)
    assert.ok(snapshot)
    const db = new DatabaseSync(snapshot.path, { readOnly: true })
    try {
      const original = db.prepare(`SELECT CASE WHEN length(CAST(record_json AS BLOB)) BETWEEN 1 AND 1048576 THEN record_json ELSE NULL END AS value
        FROM agent_session_records WHERE session_id=?`).get(session)
      assert.ok(typeof original?.value === 'string')
      assert.deepEqual(observer.module.decodePiRecord(piProtocol.parseStrictPiJson(original.value)), snapshot.projection, 'pi_record_or_original_owner_changed_before_export')
      assert.equal(db.prepare('SELECT epoch FROM journal_sessions WHERE session_id=?').get(session)?.epoch, worker.journal.epoch)
      assert.equal(db.prepare('SELECT MAX(seq) AS seq FROM journal_rows WHERE session_id=? AND epoch=?').get(session, worker.journal.epoch)?.seq, worker.journal.rows.at(-1)?.seq ?? 0)
    } finally { db.close() }
    const owner = sessionOwners.get(session), view = piViews.get(session)
    for (const incarnation of [owner.incarnation, windows ? custodyIncarnation(view.nativeCLI) : view.custody.nativeState.identity]) {
      let observed
      if (windows) {
        assert.ok(Array.isArray(windowsSnapshot))
        const actual = windowsSnapshot.find(row => row.pid === incarnation.pid)
        if (actual) assert.ok(Number.isSafeInteger(actual.creationTimeMs) && actual.creationTimeMs > 0, 'windows_process_birth_unknown')
        observed = actual ? { absent: false, incarnation: { pid: actual.pid, creationTimeMs: actual.creationTimeMs } } : { absent: true, pid: incarnation.pid }
      } else observed = observer.module.observeIncarnation(incarnation.pid)
      if (snapshot.projection.lease.claimStatus === 'live') assert.deepEqual(observed, { absent: false, incarnation })
      else assert.ok(observed.absent || JSON.stringify(observed.incarnation) !== JSON.stringify(incarnation))
    }
  }
}

async function codexNativeUserTexts(value) {
  assert.equal(value.format, 'codex-rollout-jsonl')
  const bytes = await readCompleteNativeFile(value)
  const texts = []
  let count = 0
  for await (const item of Readable.from([bytes]).pipe(jsonlParser.asStream())) {
    assert.ok(++count <= 100_000)
    const row = object(item.value), payload = object(row.payload)
    if (row.type === 'response_item' && payload.type === 'message' && payload.role === 'user') texts.push(payload.content.map(part => part.text).join(''))
    if (row.type === 'event_msg' && payload.type === 'user_message') texts.push(payload.message)
    if (row.type === 'event_msg' && payload.type === 'item_completed' && payload.item?.type === 'UserMessage') texts.push(payload.item.content.map(part => part.text).join(''))
  }
  assert.equal(count, value.record_count)
  return texts
}

async function verifyCodexJournalInputs(worker, original, bindings) {
  const folded = foldJournal({ sessionId: worker.journal.session_id, epoch: worker.journal.epoch })
  for (const row of worker.journal.rows) assert.equal(folded.add({ seq: row.seq, ts: row.ts, rowJson: JSON.stringify(row.row) }), true)
  const actual = folded.finish()
  assert.equal(actual.damage, null)
  assert.equal(actual.newer, null)
  for (const submission of actual.state.submissions.values()) assert.ok(!['pending', 'unknown'].includes(submission.dispatchState), 'accepted_input_remains_unsettled')
  const submitted = []
  for (const binding of bindings) {
    const status = object((await cli(['request', 'show', '--controller', controller, '--request-id', binding.parent_request])).result.current_input)
    assert.equal(status.state, 'accepted')
    assert.deepEqual(status.binding, binding)
    const submission = actual.state.submissions.get(binding.operation_id), receipt = actual.state.receipts.get(binding.operation_id)
    assert.deepEqual(submission, status.submission, 'actual_original_submission_changed')
    assert.equal(submission?.fence, original.source.fence)
    assert.equal(receipt?.providerItemId, submission.providerItemId)
    const item = actual.state.items.get(actual.state.aliases.get(submission.providerItemId) ?? submission.providerItemId)
    assert.equal(item?.body.kind, 'message')
    assert.equal(item.body.role, 'user')
    assert.equal(item.turnScope?.kind, 'turn')
    const turn = actual.state.items.get(item.turnScope.turnItemId)
    assert.equal(turn?.body.kind, 'turn')
    assert.equal(actual.state.itemFences.get(turn.itemId), binding.runtime_fence)
    submitted.push({ sequence: submission.submittedSequence, turn: turn.body })
  }
  submitted.sort((left, right) => left.sequence - right.sequence)
  if (worker.native_session.availability === 'complete') {
    const latest = submitted.at(-1).turn
    assert.equal(latest.turnId, worker.native_session.final.turn_id)
    assert.equal(latest.state, 'completed')
    assert.equal(latest.outcome, 'success')
    assert.ok(ends(await events(original.source)).some(row => row.detail.frame.params.turn.id === latest.turnId && row.detail.frame.params.turn.status === 'completed'))
  }
}

async function verifyQuotaRejection() {
  const extra = await cli(['worker', 'start', '--controller', controller, '--task', rootTask, '--name', 'extra-quota-check', '--agent', values.agent, '--model', values.model, '--input-file', inputs[0].input_file, '--request-id', randomUUID()], 5)
  assert.equal(extra.error.code, 'resource_limit')
  report.quota = { extra, refused_at: new Date().toISOString() }
}
async function verifyQuota() {
  if (!report.quota) await verifyQuotaRejection()
  const fleet = native(await cli(['worker', 'list', '--controller', controller, '--task', rootTask]))
  assert.equal(fleet.page.hasMore, false)
  assert.equal(fleet.page.total, workers)
  assert.deepEqual(fleet.workers.map(worker => worker.dispatchId).sort(), report.started_workers.map(worker => worker.dispatch_id).sort())
  const inventory = native(await cli(['task', 'show', '--controller', controller, '--task', rootTask])).tasks
  if (runFlow) {
    assert.equal(inventory.length, workers + 1, 'quota_refusal_created_extra_task')
    assert.deepEqual(inventory.filter(task => task.id !== rootTask).map(task => task.id).sort(), report.started_workers.map(worker => worker.task_id).sort())
  } else assert.equal(inventory.filter(task => task.parent_id === rootTask).length, workers, 'quota_refusal_created_extra_child_task')
  Object.assign(report.quota, { fleet, inventory })
}

function createdQuotaInventory(commands) {
  const caller = report.run_early_submission.inventory.requests[0].caller_fingerprint
  const originalCaller = report.run_early_submission.worker.receipt.invocation.caller
  const db = new DatabaseSync(database, { readOnly: true })
  try {
    db.exec('BEGIN')
    const root = db.prepare(`SELECT id,run_id,parent_id,status,json_extract(spec,'$.project_id') AS project_id,
      json_extract(spec,'$.spec.max_workers') AS max_workers FROM tasks WHERE id=?`).get(rootTask)
    assert.ok(root && root.run_id === runId && root.parent_id === null)
    assert.equal(root.project_id, values['project-id']); assert.equal(root.max_workers, workers)
    assert.ok(!['completed', 'failed', 'cancelled'].includes(root.status), 'quota_root_already_terminal')
    const completion = db.prepare(`SELECT COUNT(*) AS count FROM mutation_receipts WHERE caller_fingerprint=? AND method='swa.controllerDeliver'
      AND state='pending' AND json_valid(receipt)=1 AND json_extract(receipt,'$.run_id')=?
      AND json_extract(receipt,'$.root_task_id')=? AND json_extract(receipt,'$.action')='task.complete'`).get(caller, runId, rootTask)
    assert.equal(completion.count, 0, 'quota_root_completion_pending')
    assert.equal(db.prepare('SELECT coordinator_handle FROM runs WHERE id=?').get(runId)?.coordinator_handle, controller)
    const tasks = db.prepare(`SELECT t.id,t.parent_id,t.run_id,t.status,t.created_at,d.id AS dispatch_id,d.run_id AS dispatch_run_id,
      w.runtime_epoch FROM tasks t LEFT JOIN dispatch_contexts d ON d.task_id=t.id
      LEFT JOIN worker_dispatches w ON w.dispatch_id=d.id WHERE t.run_id=?`).all(runId)
    assert.ok(tasks.length <= workers + 1, 'quota_unexpected_created_tasks')
    assert.equal(new Set(tasks.map(task => task.id)).size, tasks.length, 'quota_ambiguous_task_dispatch')
    const byId = new Map(tasks.map(task => [task.id, task])), accepted = []
    for (const command of commands) {
      const rows = db.prepare(`SELECT caller_fingerprint,request_id,method,state,receipt FROM mutation_receipts WHERE request_id IN (?,?)`).all(command.request_id, command.request_id + '/native')
      assert.ok(rows.length <= 2, 'quota_original_requests_ambiguous')
      for (const row of rows) assert.equal(row.caller_fingerprint, caller, 'quota_original_caller_changed')
      const parent = rows.find(row => row.request_id === command.request_id), child = rows.find(row => row.request_id === command.request_id + '/native')
      if (!parent || !child || !parent.receipt || !child.receipt) return null
      assert.equal(parent.method, 'swa.controllerDeliver'); assert.equal(child.method, 'orchestration.workerStart')
      assert.ok(['pending', 'completed'].includes(parent.state) && ['pending', 'completed'].includes(child.state), 'quota_original_start_state_unknown')
      const receipt = object(JSON.parse(parent.receipt)), invocation = object(receipt.invocation), scope = object(invocation.scope)
      assert.equal(receipt.action, 'worker.start'); assert.equal(receipt.child_request, child.request_id)
      for (const [key, value] of Object.entries({ project_id: values['project-id'], controller, run_id: runId, root_task_id: rootTask })) {
        assert.equal(receipt[key], value); assert.equal(scope[key], value)
      }
      assert.equal(scope.authority_domain, caller)
      assert.deepEqual(invocation.caller, originalCaller)
      assert.deepEqual(invocation.command, command)
      const nativeReceipt = object(JSON.parse(child.receipt))
      const dispatchId = child.state === 'pending' ? observer.module.getPendingWorkerStartRecovery(child.method, child.receipt)?.dispatchId : nativeReceipt.dispatchId
      if (child.state === 'completed') { assert.equal(nativeReceipt.state, 'ready'); assert.equal(nativeReceipt.runId, runId) }
      if (!dispatchId) return null
      if (parent.state === 'completed') {
        assert.equal(child.state, 'completed')
        assert.equal(receipt.native?.state, 'ready')
        assert.equal(receipt.native.dispatchId, dispatchId)
        assert.equal(receipt.native.taskId, nativeReceipt.taskId)
      }
      const matches = tasks.filter(task => task.dispatch_id === dispatchId)
      assert.ok(matches.length <= 1, 'quota_original_dispatch_ambiguous')
      if (!matches.length) return null
      const task = matches[0]
      assert.equal(task.id, (child.state === 'pending' ? nativeReceipt.accepted : nativeReceipt).taskId)
      assert.equal(task.parent_id, command.parent_task_id ?? rootTask)
      assert.equal(task.dispatch_run_id, runId); assert.equal(task.runtime_epoch, runtimeId)
      const seen = new Set()
      for (let current = task; current.id !== rootTask; current = byId.get(current.parent_id)) {
        assert.ok(current.parent_id && byId.has(current.parent_id) && !seen.has(current.id), 'quota_task_outside_original_root')
        seen.add(current.id)
      }
      accepted.push({ request_id: command.request_id, child_request: child.request_id, dispatch_id: dispatchId, task_id: task.id,
        task_created_at: task.created_at, parent_state: parent.state, child_state: child.state })
    }
    assert.equal(tasks.length, workers + 1)
    assert.equal(new Set(accepted.map(item => item.task_id)).size, workers)
    assert.equal(new Set(accepted.map(item => item.dispatch_id)).size, workers)
    db.exec('COMMIT')
    return { root_status: root.status, caller_fingerprint: caller, observed_at: new Date().toISOString(), accepted }
  } finally { db.close() }
}

function completionMail(child, parent) {
  const db = new DatabaseSync(database, { readOnly: true })
  try {
    db.exec('BEGIN')
    const rows = db.prepare(`SELECT id,run_id,delivery_contract,from_handle,to_handle,body,type,payload,read,delivered_at FROM messages WHERE id=?`).all(`${child.task_id}/completed`)
    assert.ok(rows.length <= 1)
    if (!rows.length) return null
    const mail = rows[0], payload = object(JSON.parse(mail.payload))
    const task = db.prepare('SELECT id,run_id,parent_id,status,result FROM tasks WHERE id=?').get(child.task_id)
    assert.equal(mail.run_id, runId); assert.equal(mail.type, 'handoff')
    assert.equal(mail.delivery_contract, 'audit_only')
    assert.equal(mail.from_handle, `dispatch:${child.dispatch_id}`)
    assert.equal(mail.to_handle, `dispatch:${parent.dispatch_id}`)
    assert.equal(payload.schema, 'swa.handoff-completion.v1')
    assert.equal(payload.source_task_id, child.task_id); assert.equal(payload.source_dispatch_id, child.dispatch_id)
    assert.equal(payload.parent_task_id, parent.task_id); assert.equal(payload.parent_dispatch_id, parent.dispatch_id)
    assert.equal(payload.reply, 'resume'); assert.equal(payload.acceptance, 'unreviewed')
    assert.equal(payload.outcome, 'success'); assert.match(payload.resume_request_id, /^[0-9a-f-]{36}$/)
    assert.equal(task.run_id, runId); assert.equal(task.parent_id, parent.task_id)
    assert.equal(task.status, 'completed'); assert.equal(mail.body, task.result)
    assert.ok(typeof mail.body === 'string' && mail.body.length > 0 && Buffer.byteLength(mail.body) <= 1024 * 1024)
    return { ...mail, payload }
  } finally { db.close() }
}

async function continueLead(prepared) {
  const follow = report.started_workers[0], child = report.started_workers[3]
  let sent, input, sendRequest, sendArgs, followup
  if (workers === 4) {
    let window
    for (const deadline = Date.now() + 600_000; Date.now() < deadline;) {
      await events(follow.source); await events(child.source)
      const leadView = structuredViews.get(follow.source.native_session_id), childView = structuredViews.get(child.source.native_session_id)
      if (leadView.cycles[0]?.idle && !childView.cycles[0]?.idle) {
        const record = await sessionRecord((await queryWorker(follow.dispatch_id)).source)
        assert.equal(record.lease.claimStatus, 'live', 'lead_released_before_mid_run_followup')
        window = { lead_first_idle: leadView.cycles[0].idle, grandchild_active: childView.active, original_lease: record.lease }
        assert.ok(window.grandchild_active && !window.grandchild_active.end)
        break
      }
      assert.ok(!childView.cycles[0]?.idle, 'grandchild_finished_before_lead_followup_window')
      await delay(100)
    }
    assert.ok(window, 'actual_mid_run_followup_window_not_observed')
    const followupFile = join(inputDirectory, 'followup.txt')
    followup = await readFile(await ordinary(followupFile, false), 'utf8')
    assert.equal(followup, prepared.followup)
    await appendConversation(followup)
    await events(child.source)
    assert.ok(!structuredViews.get(child.source.native_session_id).cycles[0]?.idle, 'grandchild_completed_before_mid_run_send')
    assert.equal((await sessionRecord((await queryWorker(follow.dispatch_id)).source)).lease.claimStatus, 'live')
    sendRequest = randomUUID()
    sendArgs = ['worker', 'send', '--controller', controller, '--dispatch', follow.dispatch_id, '--input-file', followupFile, '--request-id', sendRequest]
    sent = await cli(sendArgs); input = native(sent)
    report.followup_window = window
  } else {
    let mail
    for (const deadline = Date.now() + 600_000; Date.now() < deadline;) {
      await events(child.source); await events(follow.source)
      mail = completionMail(child, follow)
      if (mail) {
        sendRequest = mail.payload.resume_request_id
        const db = new DatabaseSync(database, { readOnly: true })
        let row
        try { row = db.prepare('SELECT method,state,receipt FROM mutation_receipts WHERE request_id=?').get(sendRequest) } finally { db.close() }
        if (row) {
          assert.equal(row.method, 'swa.controllerDeliver')
          assert.ok(['pending', 'completed'].includes(row.state), 'parent_resume_original_request_failed_or_unknown')
          if (row.state === 'completed') {
            const original = object((await cli(['request', 'show', '--controller', controller, '--request-id', sendRequest])).result)
            assert.equal(original.state, 'completed')
            const receipt = object(original.receipt), invocation = object(receipt.invocation)
            assert.equal(receipt.action, 'worker.send')
            assert.equal(receipt.run_id, runId); assert.equal(receipt.root_task_id, rootTask)
            assert.deepEqual(invocation.handoff, { schema: 'swa.handoff-resume.v1', source_task_id: child.task_id, source_dispatch_id: child.dispatch_id,
              parent_task_id: follow.task_id, parent_dispatch_id: follow.dispatch_id, mail_id: mail.id })
            assert.equal(invocation.command.dispatch_id, follow.dispatch_id)
            assert.equal(invocation.command.request_id, sendRequest)
            assert.deepEqual(invocation.input, { path: `native-handoff:${mail.id}`, version: mail.id, text: mail.body })
            followup = mail.body; input = object(receipt.native)
            assert.deepEqual(input.swa_input_binding, receipt.swa_input_binding)
            sent = original
            report.parent_resume = { mail, request: original }
            break
          }
        }
      }
      await delay(250)
    }
    assert.ok(input, 'real_parent_resume_request_not_observed')
  }
  assert.equal(input.session_id, follow.source.native_session_id)
  assert.equal(input.request_id, sendRequest)
  const binding = object(input.swa_input_binding)
  assert.equal(binding.parent_request, sendRequest)
  assert.equal(binding.child_request, `${sendRequest}/native`)
  assert.equal(binding.dispatch_id, follow.dispatch_id)
  assert.equal(binding.session_id, follow.source.native_session_id)
  assert.equal(binding.runtime_fence, follow.source.fence)
  assert.equal(binding.body.kind, 'message')
  assert.deepEqual(binding.body.blocks, [{ type: 'text', text: followup }])
  for (const deadline = Date.now() + 600_000; Date.now() < deadline;) {
    const rows = await events(follow.source)
    if (ends(rows).length >= 2 && structuredViews.get(follow.source.native_session_id).cycles[1]?.idle) break
    await delay(250)
  }
  const rows = await events(follow.source), view = structuredViews.get(follow.source.native_session_id)
  assert.equal(starts(rows).length, 2); assert.equal(ends(rows).length, 2)
  assert.equal(view.cycles[1].cid, binding.operation_id)
  assert.ok(view.cycles[1].idle && view.cycles[1].deltas.length > 0, 'lead_second_turn_has_no_actual_continuation_output')
  assert.deepEqual(identity((await queryWorker(follow.dispatch_id)).source), identity(follow.source))
  const sendStatus = (await cli(['request', 'show', '--controller', controller, '--request-id', sendRequest])).result.current_input
  assert.equal(sendStatus.state, 'accepted'); assert.deepEqual(sendStatus.binding, binding)
  assert.equal(sendStatus.session_id, follow.source.native_session_id); assert.equal(sendStatus.operation_id, input.operation_id)
  report.followup = { kind: workers === 6 ? 'actual_parent_resume' : 'mid_run_manual_input', dispatch_id: follow.dispatch_id, request_id: sendRequest, reply: sent, current_input: sendStatus }
  return { follow, followup, input, sendArgs, sent }
}

async function finishRun(target, continuation) {
  const outcome = await runningRun
  if (outcome.error) throw outcome.error
  const reply = outcome.reply, view = runView(reply, true)
  assert.equal(reply.ok, true, 'planned_nonlead_stop_must_preserve_successful_lead_run')
  assert.equal(view.status, 'completed')
  assert.ok(view.failures.every(failure => failure.task_id === target.task_id && (!failure.dispatch_id || failure.dispatch_id === target.dispatch_id)), 'unplanned_worker_or_root_failure')
  const notification = native(report.notification), projectedNotification = view.handoffs.find(item => item.id === notification.message.id)
  assert.ok(projectedNotification)
  assert.equal(projectedNotification.from, notification.message.from_handle)
  assert.equal(projectedNotification.to, notification.message.to_handle)
  assert.equal(projectedNotification.text, notification.message.body)
  assert.deepEqual(projectedNotification.record, notification.handoff)
  for (const worker of report.started_workers) {
    const rows = await events(worker.source)
    assert.equal(ends(rows).length, worker === continuation.follow ? 2 : 1)
    const record = await sessionRecord((await queryWorker(worker.dispatch_id)).source)
    assert.equal(record.lease.claimStatus, 'released')
    const owner = sessionOwners.get(worker.source.native_session_id)
    await verifyAutomaticRelease(worker, owner)
  }
  const sameView = value => { const { observed_at, ...rest } = value; return rest }
  const args = ['wait', '--controller', controller, '--task', rootTask, '--run', runId]
  const waited = await cli(args)
  assert.deepEqual(sameView(runView(waited, true)), sameView(view))
  const strict = await cli([...args, '--strict'], view.failures.length ? 7 : 0)
  assert.deepEqual(sameView(runView(strict, true)), sameView(view))
  if (workers === 6) {
    const mail = completionMail(report.started_workers[3], continuation.follow)
    assert.equal(mail.read, 1); assert.ok(mail.delivered_at)
    assert.deepEqual({ ...mail, read: report.parent_resume.mail.read, delivered_at: report.parent_resume.mail.delivered_at }, report.parent_resume.mail)
    const projected = view.handoffs.find(item => item.id === mail.id)
    assert.deepEqual(projected, { id: mail.id, from: mail.from_handle, to: mail.to_handle, text: mail.body, read: true, record: mail.payload })
    report.parent_resume.completed_mail = mail
  }
  await settledReplay(runArguments, reply, () => cli(runArguments), requestId(runArguments))
  for (const worker of report.started_workers.slice(1)) await settledReplay(null, worker.start, () => publicCommand(worker.start_command), worker.request_id)
  if (continuation.sendArgs) await settledReplay(continuation.sendArgs, continuation.sent)
  const changed = [...runArguments]
  changed[changed.indexOf('--input-file') + 1] = inputs[1].input_file
  const mismatched = await cli(changed, 2)
  assert.equal(mismatched.error.code, 'request_mismatch')
  report.changed_original_request_refusal = mismatched
  for (const role of actualRoles) {
    const current = object(native(await publicCommand({ action: 'role.show', role_id: role.id })).role)
    assert.deepEqual(current, role, 'role_changed_when_workers_released')
  }
  assert.deepEqual(native(await publicCommand({ action: 'conversation.show', conversation_id: conversation.id })), report.collaboration.conversation_observation)
  report.run_completion = { default_wait: reply, reconnected_wait: waited, strict_wait: strict }
  return view
}

async function openCodeRequestBinding(worker, request) {
  const shown = object((await cli(['request', 'show', '--controller', controller, '--request-id', request])).result)
  assert.equal(shown.state, 'completed', 'opencode_original_request_not_complete')
  const input = object(shown.current_input), binding = object(input.binding)
  assert.equal(input.state, 'accepted'); assert.equal(input.request_id, request)
  assert.equal(binding.parent_request, request); assert.equal(binding.dispatch_id, worker.dispatch_id)
  assert.equal(binding.session_id, worker.source.native_session_id); assert.equal(binding.runtime_fence, worker.source.fence)
  assert.equal(binding.agent, 'opencode'); assert.equal(input.operation_id, binding.operation_id)
  return binding
}
async function verifyOpenCodeResult(worker, original, bindings) {
  assert.equal(worker.native_session.format, 'opencode-sqlite-v2')
  assert.equal(worker.native_session.native_id, sessionOwners.get(original.source.native_session_id).head.handle.nativeId)
  const view = openCodeViews.get(original.source.native_session_id)
  assert.equal(worker.provider_events.format, 'opencode-acp-events-ndjson')
  assert.equal(worker.provider_events.path, original.source.provider_events)
  const bytes = await readCompleteNativeFile(worker.provider_events), witness = witnesses.get(original.source.provider_events)
  assert.equal(worker.provider_events.source_version, witness.source_version)
  assert.ok(bytes.equals(witness.bytes), 'opencode_export_trace_differs_from_actual_source')
  const validated = await observeSource('validate-opencode-trace', bytes)
  assert.equal(validated.record_count, worker.provider_events.record_count)
  assert.equal(validated.record_count, sources.get(original.source.native_session_id).rows.length)
  const fold = foldJournal({ sessionId: worker.journal.session_id, epoch: worker.journal.epoch })
  const journal = new DatabaseSync(original.source.journal_database, { readOnly: true, allowExtension: false })
  try {
    for (const row of worker.journal.rows) {
      const stored = journal.prepare('SELECT ts,row_json FROM journal_rows WHERE session_id=? AND epoch=? AND seq=?').get(worker.journal.session_id, row.epoch, row.seq)
      assert.ok(stored && stored.ts === row.ts); assert.deepEqual(JSON.parse(stored.row_json), row.row)
      assert.equal(fold.add({ seq: row.seq, ts: row.ts, rowJson: JSON.stringify(row.row) }), true)
    }
  } finally { journal.close() }
  const actual = fold.finish()
  assert.equal(actual.damage, null); assert.equal(actual.newer, null)
  assert.equal(actual.state.submissions.size, bindings.length)
  const opened = []
  const receipts = worker.native_session.input_receipts
  assert.ok(Array.isArray(receipts)); assert.equal(receipts.length, bindings.length)
  const delivered = view.cycles.filter(cycle => cycle.delivery)
  assert.equal(delivered.length, bindings.length)
  assert.equal(new Set(delivered.map(cycle => cycle.requestId)).size, bindings.length)
  assert.equal(new Set(delivered.map(cycle => cycle.delivery.detail.message_id)).size, bindings.length)
  for (const binding of bindings) {
    const matching = receipts.filter(receipt => receipt.receipt.payload.binding.operation_id === binding.operation_id)
    assert.equal(matching.length, 1)
    const receipt = matching[0], cycle = delivered.find(cycle => cycle.cid === binding.operation_id)
    assert.ok(cycle)
    assert.deepEqual(receipt.receipt.payload.binding, binding)
    assert.equal(receipt.receipt.payload.request_id, cycle.requestId)
    assert.equal(receipt.message_id, cycle.delivery.detail.message_id); assert.equal(receipt.sequence, cycle.delivery.detail.seq)
    const user = worker.native_session.messages.find(message => message.id === receipt.message_id)
    assert.equal(user?.type, 'user'); assert.equal(user.seq, receipt.sequence)
    assert.equal(user.data.text, binding.body.blocks.map(block => block.text).join('\n'))
    const status = object((await cli(['request', 'show', '--controller', controller, '--request-id', binding.parent_request])).result.current_input)
    assert.equal(status.state, 'accepted'); assert.deepEqual(status.binding, binding)
    const submission = actual.state.submissions.get(binding.operation_id), journalReceipt = actual.state.receipts.get(binding.operation_id)
    assert.deepEqual(submission, status.submission); assert.equal(submission?.dispatchState, 'accepted')
    assert.equal(submission.fence, binding.runtime_fence); assert.equal(submission.clientMessageId, binding.operation_id)
    assert.equal(submission.payloadFingerprint, observer.module.fingerprintOpenCodeBody(binding.session_id, binding.body))
    assert.equal(journalReceipt?.clientMessageId, binding.operation_id); assert.equal(journalReceipt?.providerItemId, submission.providerItemId)
    assert.equal(journalReceipt.cursor.epoch, worker.journal.epoch)
    const item = actual.state.items.get(submission.providerItemId)
    assert.equal(item?.body.kind, 'message'); assert.equal(item.body.role, 'user'); assert.equal(item.agentId, undefined)
    assert.deepEqual(item.body.blocks, binding.body.blocks); assert.equal(actual.state.itemFences.get(item.itemId), binding.runtime_fence)
    const turns = [...actual.state.items.values()].filter(value => !value.agentId && value.body.kind === 'turn' && value.body.userItemId === item.itemId && actual.state.itemFences.get(value.itemId) === binding.runtime_fence)
    assert.equal(turns.length, 1, 'opencode_actual_journal_opener_missing')
    opened.push({ operation_id: binding.operation_id, request_id: cycle.requestId, message_id: receipt.message_id, turn_item_id: turns[0].itemId, user_item_id: item.itemId })
  }
  if (worker.native_session.availability === 'complete') {
    const latest = receipts.at(-1), assistant = worker.native_session.messages.find(row => row.id === worker.native_session.final.assistant_message_id)
    assert.equal(worker.native_session.final.input_message_id, latest.message_id)
    assert.ok(assistant?.type === 'assistant' && assistant.seq > latest.sequence)
    assert.equal(worker.native_session.final.text, assistant.data.content.filter(block => block.type === 'text').map(block => block.text).join(''))
    const opener = opened.find(row => row.message_id === latest.message_id), turn = actual.state.items.get(opener.turn_item_id)
    assert.equal(turn.body.state, 'completed'); assert.equal(turn.body.outcome, 'success')
    const finalMessages = [...actual.state.items.values()].filter(item => !item.agentId && item.body.kind === 'message' && item.body.role === 'assistant' && item.turnScope?.kind === 'turn' && item.turnScope.turnItemId === turn.itemId && item.body.blocks.filter(block => block.type === 'text').map(block => block.text).join('') === worker.native_session.final.text)
    assert.equal(finalMessages.length, 1, 'opencode_final_journal_assistant_missing')
  }
  check('opencode.actual_bound_native_result', { session_id: original.source.native_session_id, native_id: worker.native_session.native_id, availability: worker.native_session.availability, input_ids: receipts.map(receipt => ({ operation_id: receipt.receipt.payload.binding.operation_id, request_id: receipt.receipt.payload.request_id, message_id: receipt.message_id, sequence: receipt.sequence })), journal_openers: opened, mac_verification: 'PERFORMED_BY_INSTALLED_PRODUCT_RESULT_READER' })
}
async function runOpenCodeSingle(prepared, startArgs) {
  assert.equal(runFlow, false); assert.equal(report.started_workers.length, 1)
  const worker = report.started_workers[0], bindings = []
  const originalIdentity = identity(worker.source)
  const live = async () => {
    const observed = await queryWorker(worker.dispatch_id), value = object(observed.source)
    assert.deepEqual(identity(value), originalIdentity)
    assert.equal(value.claim_status, 'live'); assert.equal(value.worker_state, 'ready'); assert.equal(value.release_state, 'not_requested')
    assert.deepEqual(value.process, worker.source.process); assert.deepEqual(value.provider_link, worker.source.provider_link)
    assert.deepEqual(value.custody, worker.source.custody)
    assert.equal(value.runtime_epoch, runtimeId)
    await verifyOpenCodeMetadata(); await verifyRuntimeCustodian()
    return observed
  }
  const waitCycle = async (ordinal, phase) => {
    for (const deadline = Date.now() + 600_000;;) {
      const rows = await events(worker.source), cycle = openCodeViews.get(worker.source.native_session_id).cycles[ordinal]
      if (phase === 'complete' && cycle?.idle && cycle.delivery) return cycle
      if (phase === 'active' && cycle?.deltas.length && !cycle.end) return { cycle, rows }
      if (phase === 'active' && cycle?.end) return null
      assert.ok(Date.now() < deadline, 'opencode_single_original_cycle_not_observed')
      await delay(100)
    }
  }
  const collect = async name => {
    const result = await cli(['task', 'result', '--controller', controller, '--task', rootTask, '--output-dir', join(inputDirectory, name + '-' + randomUUID())])
    const workers = native(result).workers
    assert.equal(workers.length, 1); assert.equal(workers[0].worker.dispatchId, worker.dispatch_id)
    await events(worker.source)
    await verifyOpenCodeResult(workers[0], worker, bindings)
    await save(name + '.json', result)
    return { reply: result, worker: workers[0] }
  }
  const send = async file => {
    await live()
    const request = randomUUID(), args = ['worker', 'send', '--controller', controller, '--dispatch', worker.dispatch_id, '--input-file', file, '--request-id', request]
    const pending = cli(args).then(reply => ({ reply }), error => ({ error }))
    issuedWork.push(pending)
    return { request, args, pending }
  }
  const accept = async sent => {
    const outcome = await sent.pending
    if (outcome.error) throw outcome.error
    const binding = await openCodeRequestBinding(worker, sent.request)
    bindings.push(binding)
    return { ...sent, reply: outcome.reply, binding }
  }
  await waitCycle(0, 'complete')
  bindings.push(await openCodeRequestBinding(worker, worker.request_id))
  const first = await collect('single-first-complete')
  assert.equal(first.worker.native_session.availability, 'complete')
  await live()
  const second = await send(worker.actual_input_file)
  const activeSecond = await waitCycle(1, 'active')
  assert.ok(activeSecond, 'opencode_same_body_steer_window_not_observed')
  const third = await send(worker.actual_input_file)
  const secondAccepted = await accept(second), thirdAccepted = await accept(third)
  await waitCycle(2, 'complete')
  assert.notEqual(secondAccepted.binding.operation_id, thirdAccepted.binding.operation_id)
  const thirdResult = await collect('single-third-complete')
  assert.equal(thirdResult.worker.native_session.availability, 'complete')
  assert.equal(thirdResult.worker.native_session.input_receipts.at(-1).receipt.payload.binding.operation_id, thirdAccepted.binding.operation_id)
  await settledReplay(thirdAccepted.args, thirdAccepted.reply)
  await settledReplay(startArgs, worker.start)
  const fourth = await send(join(inputDirectory, 'followup.txt'))
  const fourthAccepted = await accept(fourth)
  const activeFourth = await waitCycle(3, 'active')
  if (activeFourth) await stopWorker(worker, true, activeFourth.rows)
  else {
    report.checks.push({ name: 'opencode_single_active_stop', status: 'NOT_RUN', reason: 'original_fourth_turn_completed_before_active_observation' })
    await stopWorker(worker)
  }
  await events(worker.source)
  const final = await collect('single-final-stopped')
  await save('actual-result.json', thirdResult.reply)
  const releaseArgs = ['worker', 'release', '--controller', controller, '--dispatch', worker.dispatch_id, '--request-id', randomUUID()]
  releaseRequests.set(worker.dispatch_id, { args: releaseArgs, request_id: requestId(releaseArgs) })
  const released = await cli(releaseArgs)
  assert.equal(native(released).state, 'released')
  await settledReplay(releaseArgs, released)
  report.single = { first_complete: 'single-first-complete.json', latest_complete: 'single-third-complete.json', final_stopped: 'single-final-stopped.json', final_availability: final.worker.native_session.availability, second: secondAccepted.binding, third: thirdAccepted.binding, fourth: fourthAccepted.binding, active_stop: activeFourth ? 'OBSERVED' : 'NOT_RUN', concurrency: 'NOT_RUN', siblings: 'NOT_RUN', automatic_run_delivery: 'NOT_RUN', unknown_effect_fault: 'NOT_RUN' }
  report.provider_events = [...sources.values()]
  await finishBusinessReview()
}

async function run() {
  candidate = await ordinary(values.candidate, true)
  dataRoot = await ordinary(values['data-root'], true)
  project = await ordinary(values.project, true)
  await ordinary(dirname(values.output), true)
  const requestedOutput = resolve(values.output)
  for (const [left, right] of [[candidate, dataRoot], [candidate, project], [dataRoot, project], [requestedOutput, candidate], [requestedOutput, dataRoot], [requestedOutput, project]]) assert.ok(!within(left, right) && !within(right, left), 'input_roots_overlap')
  const platform = (await readFile(join(candidate, 'PLATFORM'), 'utf8')).trim()
  assert.equal(platform, process.platform === 'win32' ? 'win32-x64' : 'linux-x64-glibc')
  assert.equal(process.arch, 'x64')
  const node = join(candidate, 'node', process.platform === 'win32' ? 'node.exe' : 'node')
  swa = join(candidate, process.platform === 'win32' ? 'swa.exe' : 'swa')
  assert.ok(samePath(await realpath(process.execPath), node), 'run_with_bundled_node')
  const revision = (await readFile(join(candidate, 'VERSION'), 'utf8')).trim()
  const edition = (await readFile(join(candidate, 'EDITION'), 'utf8')).trim()
  assert.ok(['cli', 'combined'].includes(edition), 'unknown_candidate_edition')
  assert.match(revision, /^[0-9a-f]{40}$/)
  assert.equal(execFileSync(swa, ['--version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true }).trim(), revision)
  if (piTarget || openCodeTarget) await verifyPiDriverSources(revision)
  requireRuntime = createRequire(join(candidate, 'runtime', 'package.json'))
  if (windows) {
    for (const name of ['@orca/windows-security', '@vscode/windows-process-tree']) {
      const entry = await ordinary(requireRuntime.resolve(name), false)
      assert.ok(within(await ordinary(join(candidate, 'runtime/node_modules', name), true), entry), 'windows_dependency_outside_installation')
    }
    security = requireRuntime('@orca/windows-security'); processAPI = requireRuntime('@vscode/windows-process-tree')
    assert.ok(isAbsolute(process.env.RUNNER_TEMP ?? ''))
    const root = join(await ordinary(process.env.RUNNER_TEMP, true), 'swa-n46-' + revision)
    await piSourceMetadata(root, true)
    assert.ok(samePath(project, join(root, 'public', openCodeSingle ? 'opencode-single' : 'n' + workers, 'public-project')), 'windows_public_case_root_changed')
    assert.ok(within(dataRoot, await ordinary(values['service-log'], false)), 'select_only_this_services_private_log')
  }
  await privateDirectory(requestedOutput)
  output = requestedOutput
  Object.assign(report, { source_revision: revision, candidate, data_root: dataRoot, project, endpoint: values.endpoint, platform, edition })
  check('candidate.version', revision)
  inputDirectory = join(project, '.verification', 'swa-product-input')
  source = JSON.parse(await readFile(await ordinary(join(inputDirectory, 'source.json'), false), 'utf8'))
  spec = JSON.parse(await readFile(await ordinary(join(inputDirectory, 'task.json'), false), 'utf8'))
  inputs = JSON.parse(await readFile(await ordinary(join(inputDirectory, 'inputs.json'), false), 'utf8'))
  assert.equal(source.source, publicSource)
  assert.equal(source.revision, publicRevision)
  assert.ok(samePath(source.project_root, project))
  assert.equal(spec.source_repo, source.source)
  assert.equal(spec.source_revision, source.revision)
  assert.equal(spec.max_workers, workers)
  assert.equal(inputs.length, workers)
  assert.equal(new Set(inputs.map(input => input.name)).size, workers)
  const git = args => execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=' + join(dirname(project), 'empty-hooks'), '-C', project, ...args], { encoding: 'utf8', timeout: 30_000 })
  assert.equal(git(['rev-parse', 'HEAD']).trim(), source.revision)
  for (const original of source.originals) {
    assert.ok(publicFiles.includes(original.path))
    assert.deepEqual(Object.keys(original).sort(), ['path', 'source_revision', 'text'])
    assert.equal(original.source_revision, publicRevision)
    assert.equal(await readFile(await ordinary(join(project, original.path), false), 'utf8'), original.text)
    assert.equal(git(['show', source.revision + ':' + original.path]), original.text)
  }
  assert.equal(source.originals.length, 4)
  assert.deepEqual(source.originals.map(original => original.path), publicFiles)
  const prepared = openCodeSingle ? openCodeSingleCase(source.originals) : publicCase(workers, source.originals)
  if (openCodeSingle) {
    if (!windows) assert.equal(project, '/workspace/swa-public-opencode-single-20261023/public-project')
    assert.equal(Object.hasOwn(spec, 'execution_policy'), false)
    assert.equal(Object.hasOwn(spec, 'initial_workers'), false)
  }
  assert.deepEqual(spec, prepared.spec, 'public_task_spec_changed')
  assert.deepEqual(inputs, prepared.inputs.map(({ name, file }) => ({ name, input_file: join(inputDirectory, file) })), 'public_input_manifest_changed')
  for (const input of prepared.inputs) {
    const path = await ordinary(join(inputDirectory, input.file), false)
    assert.equal(await readFile(path, 'utf8'), input.body, 'public_worker_body_changed')
    approvedFiles.set(path, input.body)
  }
  assert.equal(await readFile(await ordinary(join(inputDirectory, 'followup.txt'), false), 'utf8'), prepared.followup, 'public_followup_changed')
  approvedFiles.set(join(inputDirectory, 'followup.txt'), prepared.followup)
  const specFile = join(inputDirectory, 'task.json'), specText = await readFile(await ordinary(specFile, false), 'utf8')
  assert.deepEqual(JSON.parse(specText), prepared.spec, 'public_task_spec_changed_before_snapshot')
  approvedFiles.set(specFile, specText)
  check('public.originals', { revision: source.revision, max_workers: workers })
  if (!token) throw new NotRun('current_project_grant_token_not_supplied_no_human_bootstrap')
  if (!(process.platform === 'linux' && values.agent === 'codex' && values.model === 'gpt-5.5' || piTarget || openCodeTarget)) throw new NotRun('selected_platform_and_agent_source_contract_not_implemented')
  resultLimits = object(requireRuntime('./task-result.cjs').resultObservationLimits)
  for (const key of ['source_bytes', 'result_bytes', 'response_bytes']) assert.ok(Number.isSafeInteger(resultLimits[key]) && resultLimits[key] > 0)
  assert.equal(resultLimits.source_bytes, 12 * 1024 * 1024)
  assert.ok(resultLimits.result_bytes >= resultLimits.source_bytes && resultLimits.response_bytes > resultLimits.result_bytes)
  if (structured) {
    if (!windows) {
      const processNode = await stat('/proc/self/exe', { bigint: true }), installedNode = await stat(node, { bigint: true })
      assert.equal(`${processNode.dev}:${processNode.ino}`, `${installedNode.dev}:${installedNode.ino}`, 'actual_running_node_inode_differs_from_installation')
    }
    const toolEnvironment = { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', HOME: output, TMPDIR: output,
      ...(windows ? { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, RUNNER_TEMP: process.env.RUNNER_TEMP, USERPROFILE: output, TEMP: output, TMP: output, LC_ALL: 'C.UTF-8' } : {}) }
    const prepared = execFileSync(node, [fileURLToPath(new URL('./prepare-source-observer.mjs', import.meta.url)), '--candidate', candidate, '--source-repository', await ordinary(values['source-repository'], true), '--output', join(output, 'source-observer'), ...(openCodeTarget ? ['--profile', 'stepfun-opencode'] : piTarget ? ['--profile', 'stepfun-pi-n3'] : [])], { timeout: 90_000, maxBuffer: 4096, encoding: 'utf8', stdio: 'pipe', env: toolEnvironment })
    const root = join(output, 'source-observer'), manifestFile = await ordinary(join(root, 'manifest.json'), false)
    assert.ok((await stat(manifestFile)).size <= 4 * 1024 * 1024)
    observer = { root, home: join(root, 'observer-home'), manifest: JSON.parse(await readFile(manifestFile, 'utf8')) }
    assert.equal(observer.manifest.installed_revision, revision)
    if (piTarget) assert.equal(observer.manifest.profile, 'stepfun-pi-n3')
    if (openCodeTarget) assert.equal(observer.manifest.profile, 'stepfun-opencode')
    await privateDirectory(observer.home)
    await verifyObserverSources()
    if (piTarget) {
      piProtocol = requireRuntime('./pi-protocol.cjs')
      assert.equal(typeof piProtocol.parseStrictPiJson, 'function')
      observer.module = createRequire(observer.manifest.observer.path)(observer.manifest.observer.path)
      assert.equal(typeof observer.module.decodePiRecord, 'function')
      assert.equal(typeof observer.module.observeIncarnation, 'function')
      assert.equal(typeof observer.module.observeRuntimeCustodian, 'function')
      assert.equal(typeof observer.module.matchesPiJournalItem, 'function')
      assert.equal(typeof observer.module.fingerprintPiBody, 'function')
      assert.equal(typeof observer.module.validatePiSource, 'function')
      assert.equal(typeof observer.module.getPendingWorkerStartRecovery, 'function')
      await verifyObserverSources()
    }
    if (openCodeTarget) {
      observer.module = createRequire(observer.manifest.observer.path)(observer.manifest.observer.path)
      for (const name of ['decodeOpenCodeRecord', 'observeIncarnation', 'observeRuntimeCustodian', 'matchesOpenCodeJournalItem', 'fingerprintOpenCodeBody', 'validateOpenCodeTrace', 'getPendingWorkerStartRecovery']) assert.equal(typeof observer.module[name], 'function')
      await verifyObserverSources()
    }
    check('same_revision_read_only_observer', JSON.parse(prepared))
  } else {
    assert.ok(within(dataRoot, await ordinary(values['service-log'], false)), 'select_only_this_services_private_log')
    processAPI = requireRuntime('@vscode/windows-process-tree')
  }
  const daemon = JSON.parse(await readFile(await ordinary(join(dataRoot, 'daemon', 'daemon-v49.pid'), false), 'utf8'))
  assert.equal(daemon.swa_service_job.source_revision, revision)
  assert.ok(samePath(daemon.swa_service_job.data_root, dataRoot) && samePath(daemon.swa_service_job.install_root, candidate))
  if (!windows) {
    assert.equal(daemon.swa_service_job.platform, 'linux')
    const current = await observeSource('incarnation', daemon.pid)
    assert.equal(current.absent, false)
    daemonOwner = current.incarnation
    assert.equal(daemonOwner.boot_id, daemon.swa_service_job.boot_id)
    assert.equal(daemonOwner.start_ticks, daemon.swa_service_job.daemon_start_ticks)
    assert.equal(daemonOwner.owner_uid, daemon.swa_service_job.owner_uid)
  } else {
    assert.deepEqual(Object.keys(daemon.swa_service_job).sort(), ['name', 'serve_pid', 'serve_created_at_ms', 'data_root', 'install_root', 'source_revision', 'daemon_pid', 'daemon_created_at_ms', 'daemon_session'].sort())
    assert.match(daemon.swa_service_job.name, /^Local\\SWAService[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)
    assert.equal(daemon.swa_service_job.daemon_pid, daemon.pid)
    assert.equal(daemon.swa_service_job.daemon_session, daemon.launchNonce)
    daemonOwner = windowsMember(daemon.swa_service_job.name, { pid: daemon.pid, creationTimeMs: daemon.swa_service_job.daemon_created_at_ms })
  }
  if (piTarget) piLaunch = await readPiOwnedLaunch(revision, daemon)
  if (openCodeTarget) openCodeLaunch = await readOpenCodeOwnedLaunch(revision, daemon)
  jsonlParser = (await import(pathToFileURL(requireRuntime.resolve('stream-json/jsonl/parser.js')).href)).default
  foldJournal = requireRuntime('./journal-open.cjs').startJournalRowFold
  const checker = join(candidate, 'scripts', 'check-swa-runtime.mjs')
  try { await ordinary(checker, false) } catch { throw new NotRun('installed_production_checker_not_packaged_no_source_substitution') }
  execFileSync(node, [checker, '--candidate', candidate], { stdio: 'pipe', timeout: 60_000, windowsHide: true })
  check('candidate.complete_native_closure', 'existing_production_checker_completed')
  const status = await cli(['status'])
  runtimeId = status.runtime_id
  assert.ok(runtimeId)
  if (structured) {
    serviceReady = readServiceReady()
    const ownership = daemon.swa_service_job
    const serve = windows ? { pid: ownership.serve_pid, creationTimeMs: ownership.serve_created_at_ms } : { platform: 'linux', pid: ownership.serve_pid, boot_id: ownership.boot_id,
      start_ticks: ownership.serve_start_ticks, owner_uid: ownership.owner_uid }
    assert.deepEqual(await observeSource('incarnation', serve.pid), { absent: false, incarnation: serve }, 'linux_owned_serve_changed')
    if (piTarget) assert.deepEqual(serve, piLaunch.serve)
    if (openCodeTarget) assert.deepEqual(serve, openCodeLaunch.serve)
    if (windows) {
      const members = [
        { role: 'serve', ...serve, name: 'swa.exe' },
        { role: 'runtime', pid: serviceReady.value.runtime_pid, name: 'node.exe', parentPid: serve.pid },
        { role: 'server', pid: serviceReady.value.server_pid, name: 'server.exe', parentPid: serve.pid },
        { role: 'daemon', ...daemonOwner, name: 'node.exe' }
      ]
      assert.equal(new Set(members.map(member => member.pid)).size, 4)
      serviceCustodianBinding = { job: ownership.name, members }
      runtimeCustodian = await observeWindowsService()
      for (const member of members) member.creationTimeMs = windowsMember(ownership.name, member).creationTimeMs
      assert.deepEqual(await observeWindowsService(), runtimeCustodian)
    } else {
      serviceCustodianBinding = { runtime_pid: serviceReady.value.runtime_pid, serve, daemon: daemonOwner,
        node_executable: join(candidate, 'node/node'), serve_executable: join(candidate, 'swa') }
      runtimeCustodian = await observeSource('runtime-custodian', JSON.stringify(serviceCustodianBinding))
    }
    check('service.runtime_custodian', { ready: serviceReady.source, incarnation: runtimeCustodian })
  }
  database = status.result.databases.find(row => row.name === 'main')?.file
  assert.ok(database && within(dataRoot, await ordinary(database, false)))
  const capabilities = (await cli(['capabilities'])).result
  assert.equal(capabilities.source_revision, revision)
  const agent = capabilities.agents.find(row => row.id === values.agent)
  if (!agent || agent.configured.model !== values.model) throw new NotRun('selected_project_agent_or_model_not_observed')
  for (const observation of [agent.registered, agent.enabled, agent.installed, agent.configured, ...['start', 'send', 'stop'].map(key => agent.control[key])]) {
    assert.ok(['available', 'unknown', 'unavailable'].includes(observation.status), 'invalid_observation_status')
    if (observation.status !== 'available') throw new NotRun('static_source_or_declared_control_not_observed_available')
  }
  for (const observation of [agent.launchable, ...['read', 'tools'].map(key => agent.control[key])]) {
    assert.ok(['available', 'unknown', 'unavailable'].includes(observation.status), 'invalid_observation_status')
    if (observation.status === 'unavailable') throw new NotRun('live_capability_explicitly_unavailable')
  }
  capabilityRevision = agent.requirements.settings_revision
  assert.ok(Number.isSafeInteger(capabilityRevision) && capabilityRevision > 0, 'actual_project_settings_revision_missing')
  if (values.agent === 'codex') {
    assert.equal(agent.installed.version, '0.163.0')
    assert.equal(agent.configured.provider, 'openai')
    assert.equal(agent.configured.account_source, 'codex-native-api-key')
    await ordinary(agent.installed.executable, false)
  }
  if (piTarget) {
    assert.equal(agent.installed.version, '1.0.1')
    assert.equal(agent.configured.provider, 'stepfun')
    assert.equal(agent.configured.account_source, 'pi-api-key-file')
    piExecutable = await ordinary(agent.installed.executable, false)
    assert.equal(piExecutable, agent.installed.executable)
    await verifyPiMetadata()
    check('pi.independent_owned_source', { launch: piLaunch.source, source_home: piSourceHome, provider: 'stepfun', model: values.model, auth: 'NOT_READ_BY_DRIVER' })
  }
  if (openCodeTarget) {
    assert.equal(capabilities.agents.filter(row => row.id === 'opencode').length, 1)
    assert.equal(agent.installed.version, '2.0.31'); assert.equal(agent.configured.provider, 'stepfun')
    assert.equal(agent.configured.account_source, 'opencode-native-stepfun-api-key')
    assert.equal(agent.control.questions.status, 'unavailable')
    openCodeExecutable = await ordinary(agent.installed.executable, false)
    assert.equal(openCodeExecutable, agent.installed.executable)
    await verifyOpenCodeMetadata()
    check('opencode.independent_owned_source', { launch: openCodeLaunch.source, source_home: openCodeSourceHome, provider: 'stepfun', model: values.model, auth: 'NOT_READ_BY_DRIVER' })
  }
  Object.assign(report, { runtime_id: runtimeId, capabilities })
  if (!runFlow) {
    const opened = await cli(['controller', 'open', '--project', values['project-id'], '--workdir', project, '--request-id', randomUUID()])
    controller = opened.controller
    assert.ok(controller)
    const createArgs = ['task', 'create', '--controller', controller, '--spec-file', join(inputDirectory, 'task.json'), '--request-id', randomUUID()]
    const created = await cli(createArgs)
    rootTask = created.task_id; runId = created.run_id
    assert.ok(rootTask && runId)
    Object.assign(report, { controller, run_id: runId, root_task_id: rootTask })
    await settledReplay(createArgs, created)
  } else await prepareCollaboration()
  const startArgs = [], startFiles = [], startCommands = [], workerSlots = [], firstObservations = []
  const registerWorker = (slot, worker) => {
    assert.equal(workerSlots[slot], undefined, 'worker_slot_already_registered')
    workerSlots[slot] = worker
    report.started_workers = workerSlots.filter(Boolean)
  }
  const beforeStarts = structured ? null : await stat(values['service-log'], { bigint: true })
  const sourceCheckpoint = beforeStarts ? { identity: `${beforeStarts.dev}:${beforeStarts.ino}:${beforeStarts.birthtimeNs}`, size: beforeStarts.size.toString() } : null
  for (const [index, input] of inputs.entries()) {
    assert.ok(within(inputDirectory, await ordinary(input.input_file, false)))
    let body = await readFile(input.input_file, 'utf8')
    assert.equal(body, prepared.inputs[index].body, 'public_worker_body_changed_before_start')
    const publicCopy = '\n同一固定公开原文的复核副本，不增加事实：\n' + JSON.stringify(source.originals) + '\n'
    while (!openCodeSingle && Buffer.byteLength(body) <= 2 * 16 * 1024) body += publicCopy
    const file = join(inputDirectory, input.name + '-chunked-' + randomUUID() + '.txt')
    writePrivateTextSync(file, body)
    approvedFiles.set(file, body)
    startFiles.push(file)
    startArgs.push(['worker', 'start', '--controller', controller, '--task', rootTask, '--name', input.name, '--agent', values.agent, '--model', values.model, '--input-file', file, '--request-id', randomUUID()])
  }
  report.model_execution = 'REQUESTED_THROUGH_PRODUCT'
  if (runFlow) {
    assert.equal(spec.initial_workers, workers)
    registerWorker(0, await submitRun(startFiles[0]))
    for (let index = 1; index < workers; index++) {
      const role = actualRoles[[0, 1, 2, 3, 0, 3][index]]
      startCommands.push({ action: 'worker.start', controller, task_id: rootTask, parent_task_id: index === 3 ? report.started_workers[0].task_id : rootTask,
        handoff_mode: index === 3 ? 'consult' : 'work', reply_mode: index === 3 && workers === 6 ? 'resume' : 'poll',
        completion_criteria: [prepared.spec.success_criteria[2]], role_id: role.id, revision: role.revision,
        name: inputs[index].name, agent: values.agent, model: values.model, input_file: startFiles[index], request_id: randomUUID() })
    }
  }
  const pendingStarts = runFlow
    ? [leadCompletion.then(outcome => { if (outcome.error) throw outcome.error; return outcome.worker }), ...startCommands.map(command => publicCommand(command))]
    : startArgs.map(args => cli(args))
  let startsFinished = false, startsFailed = false, quotaReady = false, quotaError
  const startsObservation = Promise.allSettled(pendingStarts.map((pending, slot) => pending.then(reply => {
    if (!runFlow) return reply
    if (slot === 0) workerSlots[0].start_receipt = reply
    else {
      assert.equal(reply.run_id, runId)
      assert.ok(reply.dispatch_id && reply.task_id && reply.task_id !== rootTask)
      registerWorker(slot, { dispatch_id: reply.dispatch_id, task_id: reply.task_id, request_id: startCommands[slot - 1].request_id, name: inputs[slot].name,
        start: reply, start_command: startCommands[slot - 1], source_checkpoint: sourceCheckpoint, actual_input_file: startFiles[slot] })
    }
    // 先登记真实启动，再立即捕获独立观察；启动或观察失败均须收齐其他已发操作。
    firstObservations[slot] = Promise.allSettled([(async () => {
      const worker = workerSlots[slot], observed = await queryWorker(worker.dispatch_id)
      worker.source = object(observed.source)
      return events(worker.source, observed)
    })()]).then(([result]) => result)
    issuedWork.push(firstObservations[slot])
    return reply
  }))).then(results => { startsFinished = true; startsFailed = results.some(item => item.status === 'rejected'); return results })
  issuedWork.push(startsObservation)
  // Capacity is decided from the actual created tasks, before model readiness.
  // A real resource_limit response must already exist before an active stop.
  const quotaObservation = runFlow ? (async () => {
    const leadCommand = report.run_early_submission.worker.receipt.invocation.command
    for (const deadline = Date.now() + 180_000;;) {
      assert.ok(!(startsFinished && startsFailed), 'quota_original_start_failed')
      const inventory = createdQuotaInventory([leadCommand, ...startCommands])
      if (inventory) {
        report.quota_created_inventory = inventory
        await verifyQuotaRejection()
        quotaReady = true
        return
      }
      assert.ok(Date.now() < deadline, 'quota_original_tasks_not_created')
      await delay(50)
    }
  })().then(() => ({ status: 'fulfilled' }), error => { quotaError = error; return { status: 'rejected', reason: error } }) : Promise.resolve({ status: 'fulfilled' })
  issuedWork.push(quotaObservation)
  const allStarts = await startsObservation
  const firstSettled = await Promise.all(firstObservations)
  const startsSettled = runFlow ? allStarts.slice(1) : allStarts
  if (!runFlow) for (let index = 0; index < startsSettled.length; index++) {
    const item = startsSettled[index]
    if (item.status === 'fulfilled') {
      const reply = item.value
      assert.equal(reply.run_id, runId)
      assert.ok(reply.dispatch_id && reply.task_id && reply.task_id !== rootTask)
      registerWorker(index, { dispatch_id: reply.dispatch_id, task_id: reply.task_id, request_id: requestId(startArgs[index]), name: inputs[index].name,
        start: reply, source_checkpoint: sourceCheckpoint, actual_input_file: startFiles[index] })
    }
  }
  const failedStart = allStarts.find(item => item.status === 'rejected')
  if (failedStart) throw failedStart.reason
  const failedObservation = firstSettled.find(item => item?.status === 'rejected')
  if (failedObservation) throw failedObservation.reason
  assert.equal(new Set(report.started_workers.map(worker => worker.dispatch_id)).size, workers)
  assert.equal(new Set(report.started_workers.map(worker => worker.task_id)).size, workers)
  if (!runFlow) for (const worker of report.started_workers) worker.source = object((await queryWorker(worker.dispatch_id)).source)
  assert.equal(new Set(report.started_workers.map(worker => worker.source.native_session_id)).size, workers)
  assert.equal(new Set(report.started_workers.map(worker => worker.source.process.pid)).size, workers)
  if (openCodeTarget) {
    await workerEventLists()
    assert.equal(new Set([...sessionOwners.values()].map(owner => owner.binding.session_id)).size, workers)
    assert.equal(new Set([...sessionOwners.values()].map(owner => owner.head.handle.nativeId)).size, workers)
    assert.equal(new Set([...openCodeViews.values()].map(view => view.nativeCLI.pid)).size, workers)
    if (openCodeSingle) return runOpenCodeSingle(prepared, startArgs[0])
  }
  if (piTarget) {
    if (!runFlow) await workerEventLists()
    assert.equal(new Set([...sessionOwners.values()].map(owner => owner.binding.session_id)).size, workers)
    assert.equal(new Set([...piViews.values()].map(view => view.ready.session_id)).size, workers)
    assert.equal(new Set([...piViews.values()].map(view => view.ready.session_file)).size, workers)
    assert.equal(new Set([...piViews.values()].map(view => view.nativeCLI.pid)).size, workers)
    assert.equal(new Set([...piViews.values()].map(view => view.ready.acquisition_generation)).size, workers)
  }
  const target = report.started_workers[runFlow ? 1 : 0], survivors = report.started_workers.filter(worker => worker !== target)
  let stoppedAt
  const overlapObservation = (async () => {
    let lists
    for (const deadline = Date.now() + 180_000; Date.now() < deadline;) {
      if (quotaError) throw quotaError
      lists ??= await workerEventLists()
      assert.ok(lists.every(rows => (runFlow ? starts(rows).length <= 1 : starts(rows).length === 1) && ends(rows).length === 0), 'turn_ended_before_all_worker_overlap')
      if (piTarget || openCodeTarget) for (const worker of report.started_workers) {
        const cycle = structuredViews.get(worker.source.native_session_id).active
        assert.ok((runFlow && !cycle) || (cycle && !cycle.end && !cycle.settled), 'pi_run_ended_before_all_worker_overlap')
      }
      const deltas = lists.map(rows => rows.filter(isDelta))
      if (lists.every(rows => starts(rows).length === 1) && deltas.every(rows => rows.length >= 2)) {
        if (piTarget || openCodeTarget) for (const worker of report.started_workers) assert.ok(structuredViews.get(worker.source.native_session_id).active, 'native_overlap_has_no_active_cycle')
        if (windows) {
          await verifyRuntimeCustodian()
          for (const worker of report.started_workers) assertCustodyOwner(structuredViews.get(worker.source.native_session_id))
        }
        const from = Math.max(...deltas.map(rows => rows[0].monotonic_ms)), to = Math.min(...deltas.map(rows => rows.at(-1).monotonic_ms))
        if (from < to && (!runFlow || quotaReady)) {
          report.overlap = { from_monotonic_ms: from, to_monotonic_ms: to, evidence: deltas.map(rows => ({ first: rows[0], last: rows.at(-1) })) }
          if (!structured) assert.equal(ends(await events(target.source)).length, 0)
          stoppedAt = Date.now()
          await stopWorker(target, true, structured ? lists[report.started_workers.indexOf(target)] : undefined)
          return report.overlap
        }
      }
      await delay(250)
      lists = null
    }
    assert.fail('no_common_actual_native_delta_interval')
  })()
  issuedWork.push(overlapObservation)
  const quotaAndOverlap = await Promise.allSettled([quotaObservation, overlapObservation])
  const failedGate = quotaAndOverlap.find(item => item.status === 'rejected')
  if (failedGate) throw failedGate.reason
  if (quotaError) throw quotaError
  report.overlap = quotaAndOverlap[1].value
  if (runFlow) await verifyQuota()
  for (const worker of survivors) {
    assert.deepEqual(identity((await queryWorker(worker.dispatch_id)).source), identity(worker.source))
    const rows = await events(worker.source)
    if (!piTarget && !openCodeTarget) assert.ok(rows.some(row => isDelta(row) && Date.parse(row.observed_at) > stoppedAt), 'survivor_has_no_actual_output_after_stop')
  }
  let follow, followup, input, continuation
  if (runFlow) {
    const notificationText = approvedFiles.get(inputs[3].input_file)
    const current = await publicCommand({ action: 'handoff.notify', controller, task_id: rootTask, dispatch_id: report.started_workers[3].dispatch_id,
      input_file: inputs[3].input_file, request_id: randomUUID() })
    assert.equal(native(current).delivery, 'stored')
    assert.equal(native(current).message.delivery_contract, 'audit_only')
    assert.equal(native(current).new_task, false)
    assert.equal(native(current).new_worker, false)
    assert.equal(native(current).message.body, notificationText)
    report.notification = current
    continuation = await continueLead(prepared)
    follow = continuation.follow; followup = continuation.followup; input = continuation.input
    await finishRun(target, continuation)
  } else {
  for (const deadline = Date.now() + 600_000; Date.now() < deadline;) {
    const lists = await Promise.all(survivors.map(worker => events(worker.source)))
    if (lists.every((rows, index) => ends(rows).length === 1 && (!piTarget || piViews.get(survivors[index].source.native_session_id).cycles[0]?.idle))) break
    await delay(500)
  }
  for (const worker of survivors) assert.equal(ends(await events(worker.source)).length, 1, 'survivor_first_turn_not_complete')
  if (piTarget) {
    if (windows) await verifyRuntimeCustodian()
    const proof = target.stop.proof
    for (const worker of survivors) {
      const view = piViews.get(worker.source.native_session_id)
      assertCustodyOwner(view); assertCustodyOwner(piViews.get(target.source.native_session_id))
      const rows = await events(worker.source)
      assert.ok(rows.some(row => isPiDelta(row) && row.monotonic_ms > proof.stop_intent.monotonic_ms && row.monotonic_ms > proof.row.monotonic_ms), 'pi_survivor_has_no_same_daemon_monotonic_delta_after_full_stop')
      assert.ok(view.cycles[0].idle, 'pi_survivor_not_idle_before_followup')
    }
  }
  follow = survivors[0]
  const followupFile = join(inputDirectory, 'followup.txt'), sendRequest = randomUUID()
  followup = await readFile(await ordinary(followupFile, false), 'utf8')
  assert.equal(followup, prepared.followup, 'public_followup_changed_before_send')
  const sendArgs = ['worker', 'send', '--controller', controller, '--dispatch', follow.dispatch_id, '--input-file', followupFile, '--request-id', sendRequest]
  const sent = await cli(sendArgs)
  input = native(sent)
  assert.equal(input.session_id, follow.source.native_session_id)
  assert.equal(input.request_id, sendRequest)
  assert.equal(input.swa_input_binding.dispatch_id, follow.dispatch_id)
  assert.equal(input.swa_input_binding.body.kind, 'message')
  assert.deepEqual(input.swa_input_binding.body.blocks, [{ type: 'text', text: followup }])
  for (const deadline = Date.now() + 600_000; Date.now() < deadline;) {
    if (ends(await events(follow.source)).length >= 2) break
    await delay(500)
  }
  assert.equal(starts(await events(follow.source)).length, 2)
  assert.equal(ends(await events(follow.source)).length, 2)
  await settledReplay(sendArgs, sent)
  assert.deepEqual(identity((await queryWorker(follow.dispatch_id)).source), identity(follow.source))
  const sendStatus = (await cli(['request', 'show', '--controller', controller, '--request-id', sendRequest])).result.current_input
  assert.equal(sendStatus.state, 'accepted')
  assert.equal(sendStatus.session_id, follow.source.native_session_id)
  assert.equal(sendStatus.operation_id, input.operation_id)
  report.followup = { request_id: sendRequest, reply: sent, current_input: sendStatus }
  await verifyQuota()
  for (let index = 0; index < startArgs.length; index++) await settledReplay(startArgs[index], startsSettled[index].value)
  const changedInput = [...startArgs[0]]
  changedInput[changedInput.indexOf('--input-file') + 1] = inputs[1].input_file
  const mismatched = await cli(changedInput, 2)
  assert.equal(mismatched.error.code, 'request_mismatch')
  report.changed_original_request_refusal = mismatched
  }
  await settledReplay(target.stop.args, target.stop.reply)
  if (runFlow) {
    if (windows) await verifyRuntimeCustodian()
    for (const worker of survivors) {
      await events(worker.source)
      const view = structuredViews.get(worker.source.native_session_id), proof = target.stop.proof
      assertCustodyOwner(view); assertCustodyOwner(structuredViews.get(target.source.native_session_id))
      assert.ok(view.cycles[0].idle)
      const checkpoint = openCodeTarget ? proof.stop_checkpoint : proof.stop_intent
      assert.ok(sources.get(worker.source.native_session_id).rows.some(row => isDelta(row) && row.monotonic_ms > checkpoint.monotonic_ms && row.monotonic_ms > proof.row.monotonic_ms), 'survivor_has_no_same_daemon_monotonic_delta_after_full_stop')
    }
  }
  for (const worker of report.started_workers) worker.transcript = await readTranscript(worker.dispatch_id)
  const piInventory = piTarget ? piRootInventory() : null
  const exported = await cli(runFlow ? ['export', '--controller', controller, '--task', rootTask, '--run', runId, '--output-dir', join(inputDirectory, 'result-' + randomUUID())]
    : ['task', 'result', '--controller', controller, '--task', rootTask, '--output-dir', join(inputDirectory, 'result-' + randomUUID())])
  const result = runFlow ? object(native(exported).result) : native(exported)
  if (runFlow) {
    const view = runView(exported, true), { observed_at: exportedAt, ...exportedView } = view, { observed_at: completedAt, ...completedView } = runView(report.run_completion.default_wait, true)
    assert.deepEqual(exportedView, completedView)
    assert.deepEqual(result.tasks.tasks.map(task => task.id).sort(), view.tasks.map(task => task.id).sort())
    report.run_completion.exported = exported
  }
  assert.equal(result.workers.length, workers)
  for (const worker of result.workers) {
    const original = report.started_workers.find(item => item.dispatch_id === worker.worker.dispatchId)
    assert.ok(original && worker.source.native_session_id === original.source.native_session_id)
    if (original !== target) assert.equal(worker.native_session.availability, 'complete')
    const originalRequest = (await cli(['request', 'show', '--controller', controller, '--request-id', original.request_id])).result
    assert.equal(originalRequest.state, 'completed')
    const binding = originalRequest.receipt.swa_input_binding
    assert.equal(binding.parent_request, original.request_id)
    assert.equal(binding.dispatch_id, original.dispatch_id)
    assert.equal(binding.session_id, original.source.native_session_id)
    const body = await readFile(original.actual_input_file, 'utf8')
    assert.equal(originalRequest.receipt.invocation.input.text, body)
    const textOf = message => typeof message.content === 'string' ? message.content : message.content.filter(part => part.type === 'text').map(part => part.text).join('\n')
    const piNative = piTarget ? await piNativeRows(worker.native_session) : undefined
    const userTexts = piNative ? piNative.entries.filter(entry => entry.type === 'message' && entry.message.role === 'user').map(entry => textOf(entry.message)) : worker.native_session.format === 'codex-rollout-jsonl' ? await codexNativeUserTexts(worker.native_session) : worker.native_session.format === 'opencode-sqlite-v2'
      ? worker.native_session.messages.filter(message => message.type === 'user').map(message => message.data.text)
      : worker.native_session.entries.filter(entry => entry.type === 'message' && entry.message.role === 'user').map(entry => textOf(entry.message))
    const originalText = binding.body.blocks.filter(block => block.type === 'text').map(block => block.text).join('\n')
    assert.ok(originalText.includes(body) && userTexts.includes(originalText), 'actual_original_input_or_native_source_differs')
    if (original.dispatch_id === follow.dispatch_id) {
      assert.ok(userTexts.includes(followup), 'actual_followup_user_body_missing_from_native_source')
      assert.notEqual(binding.operation_id, input.operation_id, 'followup_must_have_its_own_operation')
    }
    if (values.agent === 'codex') {
      assert.equal(worker.native_session.native_id, original.source.provider_link.handle.nativeId)
      const actualRows = await events(original.source)
      assert.equal(worker.provider_events.format, 'codex-provider-events-ndjson')
      await readCompleteNativeFile(worker.provider_events)
      assert.equal(worker.provider_events.record_count, actualRows.length)
      await verifyCodexJournalInputs(worker, original, original.dispatch_id === follow.dispatch_id ? [binding, input.swa_input_binding] : [binding])
    }
    if (piTarget) {
      const actualRows = await events(original.source)
      const view = piViews.get(original.source.native_session_id)
      assert.equal(worker.native_session.native_id, view.ready.session_id)
      assert.equal(worker.native_session.path, view.ready.session_file)
      assert.equal(worker.provider_events.format, 'pi-native-rpc-events-ndjson')
      assert.equal(worker.provider_events.path, original.source.provider_events, 'pi_export_trace_path_not_original_source')
      const rawBytes = await readCompleteNativeFile(worker.provider_events)
      const actualWitness = witnesses.get(original.source.provider_events)
      assert.equal(worker.provider_events.source_version, actualWitness.source_version, 'pi_export_trace_version_not_actual_snapshot')
      assert.ok(rawBytes.equals(actualWitness.bytes), 'pi_export_trace_differs_from_actual_original_source')
      const validated = await observeSource('validate-pi-trace', rawBytes)
      assert.equal(validated.record_count, actualRows.length)
      assert.equal(worker.provider_events.record_count, actualRows.length)
      await verifyPiJournalInputs(worker, original, original.dispatch_id === follow.dispatch_id ? [binding, input.swa_input_binding] : [binding], piNative)
    }
    if (openCodeTarget) {
      await events(original.source)
      await verifyOpenCodeResult(worker, original, original.dispatch_id === follow.dispatch_id ? [binding, input.swa_input_binding] : [binding])
    }
    if (runFlow) {
      verifyExecution(worker.execution, worker.source, original !== target)
      assert.equal(worker.execution.delivery.state, 'sent')
      assert.equal(worker.execution.delivery.operation_id, original === follow ? input.operation_id : binding.operation_id)
    }
    const journal = new DatabaseSync(original.source.journal_database, { readOnly: true })
    try {
      for (const row of worker.journal.rows) {
        const actual = journal.prepare('SELECT ts,row_json FROM journal_rows WHERE session_id=? AND epoch=? AND seq=?').get(worker.journal.session_id, row.epoch, row.seq)
        assert.ok(actual && actual.ts === row.ts)
        assert.deepEqual(JSON.parse(actual.row_json), row.row)
      }
    } finally { journal.close() }
  }
  const stoppedOutput = result.workers.find(worker => worker.worker.dispatchId === target.dispatch_id)
  const mark = stoppedOutput.journal.rows.find(row => row.row.kind === 'tombstone' && row.row.stopEvent?.reason === 'evict' && row.row.stopEvent.at >= stoppedAt)
  assert.ok(mark, 'actual_active_stop_mark_missing')
  if (!piTarget && !openCodeTarget) for (const worker of survivors) assert.ok((await events(worker.source)).some(row => isDelta(row) && Date.parse(row.observed_at) > mark.row.stopEvent.at), 'survivor_has_no_actual_delta_after_native_stop_mark')
  const fold = foldJournal({ sessionId: stoppedOutput.journal.session_id, epoch: stoppedOutput.journal.epoch })
  for (const row of stoppedOutput.journal.rows.filter(row => row.seq < mark.seq)) assert.equal(fold.add({ seq: row.seq, ts: row.ts, rowJson: JSON.stringify(row.row) }), true)
  const prior = fold.finish()
  assert.equal(prior.damage, null)
  assert.equal(prior.newer, null)
  assert.ok([...prior.state.items.values()].some(item => item.body.kind === 'turn' && item.body.turnId === mark.row.stopEvent.turnId && item.body.state === 'running'))
  const endedTurn = stoppedOutput.journal.snapshot.items.find(item => item.body.kind === 'turn' && item.body.turnId === mark.row.stopEvent.turnId)
  const stoppedEvents = await events(target.source)
  const actualAbort = stoppedEvents.find(row => openCodeTarget
    ? row.event === 'native_record' && row.sequence > target.stop.proof.checkpoint.sequence && row.detail.frame.id === openCodeViews.get(target.source.native_session_id).cycles.find(cycle => cycle.cid === target.stop.proof.checkpoint.cid)?.requestId && row.detail.frame.result?.stopReason === 'cancelled'
    : row.protocol === 'pi-jsonl-rpc'
    ? row.event === 'native_record' && row.detail.frame.type === 'message_end' && row.detail.frame.message.role === 'assistant' && row.detail.frame.message.stopReason === 'aborted' && row.sequence > target.stop.proof.stop_intent.sequence
    : Date.parse(row.observed_at) >= mark.row.stopEvent.at && (row.protocol === 'codex-app-server' ? row.event === 'notification' && row.detail.method === 'turn/completed' && row.detail.frame.params.turn.status === 'interrupted' : row.protocol === 'acp' ? row.event === 'session/prompt/response' && row.detail.response.stopReason === 'cancelled' : row.record?.type === 'message_end' && row.record.message?.role === 'assistant' && row.record.message.stopReason === 'aborted'))
  if (piTarget) {
    assert.ok(actualAbort && endedTurn && (endedTurn.body.state === 'interrupted' || endedTurn.body.outcome === 'cancellation'), 'pi_actual_same_cycle_abort_missing')
    assert.equal(target.stop.proof.stop_intent.detail.turn_id, mark.row.stopEvent.turnId, 'pi_stop_turn_differs_from_actual_journal_mark')
    assert.equal(target.stop.proof.stop_intent.detail.cid, sessionOwners.get(target.source.native_session_id).binding.operation_id)
  } else assert.ok(endedTurn && (endedTurn.body.state === 'interrupted' || endedTurn.body.outcome === 'cancellation' && actualAbort), 'active_native_turn_cancellation_not_proven')
  if (piTarget) {
    await verifyPiMetadata(); await verifyObserverSources()
    if (windows) await verifyRuntimeCustodian()
    const windowsSnapshot = windows ? await windowsProcesses() : undefined
    piFinalSourceCheck(piInventory, result, windowsSnapshot)
    writePrivateTextSync(join(output, 'actual-result.json'), JSON.stringify(exported, null, 2) + '\n')
  } else await save('actual-result.json', exported)
  if (!runFlow) {
  for (const worker of survivors) await stopWorker(worker)
  for (const worker of report.started_workers) {
    const args = ['worker', 'release', '--controller', controller, '--dispatch', worker.dispatch_id, '--request-id', randomUUID()]
    releaseRequests.set(worker.dispatch_id, { args, request_id: requestId(args) })
    const released = await cli(args)
    assert.equal(native(released).state, 'released')
    await settledReplay(args, released)
  }
  }
  await finishBusinessReview()
}

async function finishBusinessReview() {
  report.provider_events = [...sources.values()]
  await save('before-business-review.json', report)
  process.stdout.write(JSON.stringify({ state: 'ACTUAL_BUSINESS_REVIEW_REQUIRED', result: join(output, 'actual-result.json'), evidence: join(output, 'before-business-review.json'), input: '当前真实Reviewer/Agent读取成果后提供一行JSON：reviewed_result绝对路径、checked_result实际审阅说明；此输入不取得human身份。' }) + '\n')
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false })
  let answer
  try {
    answer = await Promise.race([new Promise((resolveLine, reject) => { lines.once('line', resolveLine); lines.once('close', () => reject(new NotRun('actual_business_review_not_supplied'))) }), delay(600_000, undefined, { ref: false }).then(() => { throw new NotRun('actual_business_review_deadline') })])
  } finally { lines.close() }
  const review = object(JSON.parse(answer))
  assert.equal(review.reviewed_result, join(output, 'actual-result.json'))
  assert.ok(typeof review.checked_result === 'string' && review.checked_result.trim().length >= 40)
  const checkedFile = join(inputDirectory, 'checked-result-' + randomUUID() + '.json')
  const checkedBody = JSON.stringify({ reviewed_result: review.reviewed_result, checked_result: review.checked_result, reviewed_by: 'current_actual_agent_controller' }) + '\n'
  writePrivateTextSync(checkedFile, checkedBody)
  approvedFiles.set(checkedFile, checkedBody)
  if (!runFlow) await cli(['task', 'complete', '--controller', controller, '--task', rootTask, '--result-file', checkedFile, '--request-id', randomUUID()])
  const tasks = native(await cli(['task', 'show', '--controller', controller, '--task', rootTask]))
  assert.equal(tasks.tasks.find(task => task.id === rootTask)?.status, 'completed')
  controllerCloseRequest = randomUUID()
  report.controller_close = { request_id: controllerCloseRequest, state: 'issued' }
  report.controller_close.reply = await cli(['controller', 'close', '--controller', controller, '--request-id', controllerCloseRequest])
  report.controller_close.state = 'completed-response-observed'
  if (structured) await verifyRuntimeCustodian()
  report.business_review = review
  report.status = 'EXECUTED_ASSERTIONS_COMPLETED'
  report.model_execution = 'ACTUAL_NATIVE_EVENTS_OBSERVED'
  report.scenarios = { cli_multiworker: openCodeSingle ? 'NOT_RUN' : 'REQUIRES_INDEPENDENT_REVIEW', single_long_session: openCodeSingle ? 'REQUIRES_INDEPENDENT_REVIEW' : 'NOT_RUN', run_recursive_role_handoff: runFlow ? 'REQUIRES_INDEPENDENT_REVIEW_OF_SAME_RUN_ACTUAL_RESULTS' : 'NOT_RUN',
    parent_continuation: runFlow && workers === 6 ? 'REQUIRES_INDEPENDENT_REVIEW_OF_REAL_CHILD_MAIL_AND_LEAD_SECOND_TURN' : 'NOT_RUN',
    input_chunk_observation: openCodeTarget ? 'REQUIRES_INDEPENDENT_REVIEW_OF_ACTUAL_ACP_CHUNKS_AND_NATIVE_BINDINGS' : piTarget ? 'REQUIRES_INDEPENDENT_REVIEW_OF_ACTUAL_PI_CHUNKS' : 'NOT_RUN_WITHOUT_PER_CHUNK_NATIVE_OBSERVATION', lost_effect_fault: openCodeTarget ? 'NOT_RUN' : 'INCONCLUSIVE', expired_or_cross_project_permission: 'NOT_RUN', human_cross_creator: 'NOT_RUN', gui_consistency: 'NOT_RUN', service_shutdown: 'REQUIRES_ACTUAL_SERVICE_OWNER_EVIDENCE' }
  completed = true
}

try {
  await run()
} catch (error) {
  report.status = error instanceof NotRun ? 'NOT_RUN' : 'FAIL'
  report.reason = error instanceof NotRun ? error.message : 'actual_check_failed_preserve_original_evidence'
  report.failure = driverFailure(error, import.meta.url)
  process.exitCode = error instanceof NotRun ? 3 : 1
  // First settle all already-issued work, including observations registered by
  // start responses that arrive during this drain. Nothing is re-submitted.
  for (let count = 0; count < issuedWork.length;) {
    const batch = issuedWork.slice(count)
    count += batch.length
    await Promise.allSettled(batch)
  }
  for (const command of report.commands) if (command.mutation && !['not-submitted', 'completed-response-observed', 'completed-run-failure-observed', 'refused-response-observed'].includes(command.state) && !report.unknown_requests.some(request => request.request_id === command.request_id)) report.unknown_requests.push({ request_id: command.request_id, args: command.args, original_command: command.ordinal })
  // 修改结果未知时只查询原请求，不复发原修改或替换Worker。
  if (swa && token && output) await resolveOriginalRequests()
  for (const worker of report.started_workers) if (!stopped.has(worker.dispatch_id)) {
    const pending = releaseRequests.get(worker.dispatch_id) ?? stopRequests.get(worker.dispatch_id)
    if (pending) {
      try { await cli(['request', 'show', '--controller', controller, '--request-id', pending.request_id]) }
      catch { /* 原请求仍保留，不能用新键重新停止。 */ }
      report.checks.push({ name: 'owned_worker_cleanup_original_stop_or_release_only', status: 'UNKNOWN', dispatch_id: worker.dispatch_id, request_id: pending.request_id })
      continue
    }
    try {
      worker.source ??= object((await queryWorker(worker.dispatch_id)).source)
      if (runFlow && sessionOwners.has(worker.source.native_session_id)) {
        await events(worker.source)
        if (stopped.has(worker.dispatch_id)) continue
      }
      await stopWorker(worker)
    }
    catch { report.checks.push({ name: 'owned_worker_cleanup', status: 'UNKNOWN', dispatch_id: worker.dispatch_id }) }
  }
  if (swa && token && output) await resolveOriginalRequests()
  if (controller && !controllerCloseRequest && report.unknown_requests.length === 0 && report.started_workers.every(worker => stopped.has(worker.dispatch_id))) {
    try {
      const db = new DatabaseSync(database, { readOnly: true })
      try {
        const resources = db.prepare(`SELECT r.owner_dispatch_id,r.release_state,r.ownership_state FROM worker_terminal_resources r
          JOIN dispatch_contexts d ON d.id=r.owner_dispatch_id WHERE d.run_id=?`).all(runId)
        assert.equal(resources.length, report.started_workers.length, 'cleanup_has_unobserved_worker_resources')
        for (const resource of resources) {
          assert.ok(stopped.has(resource.owner_dispatch_id), 'cleanup_worker_exit_unproven')
          assert.equal(resource.release_state, 'released'); assert.equal(resource.ownership_state, 'released')
        }
      } finally { db.close() }
      controllerCloseRequest = randomUUID()
      report.controller_close = { request_id: controllerCloseRequest, state: 'issued_after_proven_worker_cleanup' }
      report.controller_close.reply = await cli(['controller', 'close', '--controller', controller, '--request-id', controllerCloseRequest])
      report.controller_close.state = 'completed-response-observed'
    } catch { report.checks.push({ name: 'owned_controller_cleanup', status: 'UNKNOWN', request_id: controllerCloseRequest ?? null }) }
  }
} finally {
  if (runProcess && runProcess.exitCode === null && runProcess.signalCode === null) {
    // 只终止本次CLI观察者；产品Worker退出仍由原资源证据判断。
    runProcess.kill('SIGTERM')
    await Promise.race([runningRun, delay(5000)])
    report.run_observer_cleanup = { pid: runProcess.pid, exit_code: runProcess.exitCode, signal: runProcess.signalCode, worker_exit_proven_by_cli: false }
  }
  if (report.unknown_requests.length && swa && token && output) await resolveOriginalRequests()
  if (!completed && observer) {
    try { await verifyObserverSources(); check('same_revision_observer_final_sources', 'unchanged_after_failure_cleanup') }
    catch {
      report.status = 'FAIL'
      process.exitCode = 1
      report.checks.push({ name: 'same_revision_observer_final_sources', status: 'FAIL' })
    }
  }
  report.completed_at = new Date().toISOString()
  if (output) await save(completed ? 'driver-completed.json' : 'driver-incomplete.json', report)
  process.stdout.write(JSON.stringify({ status: report.status, reason: report.reason, evidence: output ?? null, acceptance: report.acceptance }) + '\n')
}

async function resolveOriginalRequests() {
  const unresolved = [], terminal = ['not-submitted', 'completed-response-observed', 'completed-run-failure-observed', 'refused-response-observed']
  report.request_resolution_history ??= []
  for (const request of report.unknown_requests) {
    const commands = request.args[0] === 'public-command' ? report.collaboration_commands : report.commands
    const original = commands?.find(command => command.ordinal === request.original_command)
    let state = original?.state ?? 'unknown', observation
    if (!terminal.includes(state)) {
      try {
        const shown = object((await cli(['request', 'show', ...(controller ? ['--controller', controller] : ['--project', values['project-id']]), '--request-id', request.request_id])).result)
        assert.equal(shown.requestId, request.request_id)
        // A completed durable row may still contain outcome_unknown/stop_unknown.
        // Only the original command's known terminal outcome clears this list.
        const status = value => ['absent', 'pending', 'completed', 'failed', 'rejected', 'unknown', 'ready', 'stopped', 'released', 'already_released',
          'outcome_unknown', 'start_unknown', 'stop_unknown', 'release_unknown', 'delivery_unknown', 'operation_unknown', 'unreconciled',
          'journaled', 'queued', 'accepted', 'handed-to-terminal', 'answered', 'sent', 'not_sent', 'stored'].includes(value) ? value : null
        const children = Array.isArray(shown.children) ? shown.children : []
        observation = { state: status(shown.state), receipt_state: status(shown.receipt?.state), native_state: status(shown.receipt?.native?.state),
          current_input_state: status(shown.current_input?.state), children_count: children.length,
          children: children.slice(0, 16).map(child => ({ state: status(child?.state), receipt_state: status(child?.receipt?.state), native_state: status(child?.receipt?.native?.state) })),
          effect: 'UNCONFIRMED_BY_ORIGINAL_COMMAND' }
        state = 'unknown'
      } catch { state = 'unknown' }
    }
    report.request_resolution_history.push({ ...request, original_command_state: original?.state ?? null, current_state: state,
      ...(observation ? { observation } : {}), observed_at: new Date().toISOString() })
    if (!terminal.includes(state)) unresolved.push(request)
  }
  report.unknown_requests = unresolved
}
