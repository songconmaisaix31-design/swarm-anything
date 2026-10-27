import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { parseArgs, promisify } from 'node:util'

const execute = promisify(execFile)
const help = `真实角色启动验收：由调用方先准备同一安装的服务、两个项目、Grant、Controller 与未结算根 Task。
node role-launch.mjs --config ABS_JSON --output ABS_NEW_DIRECTORY
config: installation, revision, endpoint, runtime_id, authority_domain,
  primary/restricted: {project_id, project_root, controller, run_id, root_task_id, input_file},
  default/override: {agent, model}。
primary 许可两种已配置 CLI，restricted 只许可 default；两个项目使用公开测试仓库。
primary 至少保留两个 Worker 席位。input_file 是项目已获准读取的公开输入。
令牌只通过 SWA_PROJECT_TOKEN、SWA_RESTRICTED_PROJECT_TOKEN 提供，禁止写入 config。
本脚本不签发权限、不启动或停止服务、不重发未知请求。Worker 的成果与退出由调用方继续观察。
退出 0 仅证明角色启动、拒绝及原记录断言通过，不代表开发工具、模型成果或完整进程退出已验收。
`

if (process.argv.includes('--help')) {
  process.stdout.write(help)
  process.exit(0)
}

const { values } = parseArgs({ options: { config: { type: 'string' }, output: { type: 'string' } }, allowPositionals: false })
assert.ok(isAbsolute(values.config ?? '') && isAbsolute(values.output ?? ''), 'Explicit absolute config/output paths are required')
const config = JSON.parse(await readFile(values.config, 'utf8'))
for (const name of ['installation', 'revision', 'endpoint', 'runtime_id', 'authority_domain']) assert.ok(typeof config[name] === 'string' && config[name], `Missing ${name}`)
assert.ok(isAbsolute(config.installation) && /^[a-f0-9]{40}$/.test(config.revision), 'An exact installed revision is required')
const endpoint = new URL(config.endpoint)
assert.equal(endpoint.protocol, 'http:')
assert.ok(['127.0.0.1', '[::1]'].includes(endpoint.hostname) && endpoint.port && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash && endpoint.pathname === '/', 'The actual loopback service is required')
for (const name of ['primary', 'restricted']) {
  for (const field of ['project_id', 'project_root', 'controller', 'run_id', 'root_task_id', 'input_file']) assert.ok(typeof config[name]?.[field] === 'string' && config[name][field], `Missing ${name}.${field}`)
  assert.equal(await realpath(config[name].project_root), config[name].project_root)
}
for (const name of ['default', 'override']) for (const field of ['agent', 'model']) assert.ok(typeof config[name]?.[field] === 'string' && config[name][field], `Missing ${name}.${field}`)
assert.notEqual(config.default.agent, config.override.agent, 'The override must select another installed CLI')
assert.notEqual(config.primary.project_id, config.restricted.project_id)
const tokens = { primary: process.env.SWA_PROJECT_TOKEN, restricted: process.env.SWA_RESTRICTED_PROJECT_TOKEN }
assert.ok(tokens.primary && tokens.restricted, 'Both project grants must be supplied through the environment')
const swa = join(config.installation, process.platform === 'win32' ? 'swa.exe' : 'swa')
assert.equal((await readFile(join(config.installation, 'VERSION'), 'utf8')).trim(), config.revision)
assert.equal((await execute(swa, ['--version'], { timeout: 10_000 })).stdout.trim(), config.revision)
await mkdir(values.output, { mode: 0o700 })
const report = { revision: config.revision, runtime_id: config.runtime_id, status: 'RUNNING', checks: [], workers: [], model_results: 'NOT_CHECKED', process_exit: 'NOT_CHECKED' }
const native = reply => { assert.ok(reply.result?.native && typeof reply.result.native === 'object'); return reply.result.native }
let ordinal = 0

async function cli(project, args, rejected = []) {
  const scope = config[project], request = args[args.indexOf('--request-id') + 1]
  const entry = { ordinal: ++ordinal, project_id: scope.project_id, args, state: 'prepared', ...(args.includes('--request-id') ? { request_id: request } : {}) }
  await appendFile(join(values.output, 'commands.jsonl'), JSON.stringify(entry) + '\n', { mode: 0o600 })
  const env = { ...process.env, SWA_ENDPOINT: config.endpoint, SWA_PROJECT_ID: scope.project_id, SWA_PROJECT_TOKEN: tokens[project] }
  delete env.SWA_RESTRICTED_PROJECT_TOKEN
  const projectArgs = args[0] === 'request' && args[1] === 'show' && args.includes('--controller') ? [] : ['--project', scope.project_id]
  let output, exit = 0
  try {
    output = await execute(swa, [...args, ...projectArgs, '--json'], { cwd: scope.project_root, env, timeout: 150_000, maxBuffer: 12 * 1024 * 1024, windowsHide: true })
  } catch (error) {
    if (!Number.isInteger(error.code) || error.signal || error.killed) {
      await appendFile(join(values.output, 'commands.jsonl'), JSON.stringify({ ...entry, state: 'UNKNOWN', reason: 'CLI did not return a complete ordinary exit' }) + '\n')
      throw new Error(`CLI result unknown; preserve request ${entry.request_id ?? '(read)'}`)
    }
    output = error
    exit = error.code
  }
  for (const token of Object.values(tokens)) assert.ok(!output.stdout.includes(token) && !output.stderr.includes(token), 'CLI output contains a project credential')
  const reply = JSON.parse(output.stdout)
  await appendFile(join(values.output, 'commands.jsonl'), JSON.stringify({ ...entry, state: 'responded', exit, reply, stderr: output.stderr }) + '\n')
  if (rejected.length) {
    assert.notEqual(exit, 0)
    assert.equal(reply.ok, false)
    assert.ok(rejected.includes(reply.error?.code), `Expected ${rejected.join('/')} but received ${reply.error?.code}`)
  } else {
    assert.equal(exit, 0, reply.error?.message)
    assert.equal(reply.ok, true)
    assert.equal(reply.runtime_id, config.runtime_id)
    assert.equal(reply.authority_domain, config.authority_domain)
  }
  if (entry.request_id) assert.equal(reply.request_id, entry.request_id)
  return reply
}

async function taskInventory(project) {
  const scope = config[project]
  const result = native(await cli(project, ['task', 'list', '--controller', scope.controller]))
  assert.ok(Array.isArray(result.tasks))
  assert.ok(result.tasks.some(task => task.id === scope.root_task_id && task.parent_id === null))
  for (const task of result.tasks) assert.equal(task.run_id, scope.run_id)
  assert.equal(new Set(result.tasks.map(task => task.id)).size, result.tasks.length)
  return result.tasks
}

async function saveRole(project, selection, id, revision) {
  const definition = { name: 'Role launch acceptance', responsibilities: 'Complete the approved public input and return its result', default_agent: selection.agent, default_model: selection.model, question_mode: 'disabled', delegation_mode: 'disabled', skills: [], knowledge: [] }
  const file = join(values.output, `${randomUUID()}.role.json`), request = randomUUID()
  await writeFile(file, JSON.stringify(definition), { flag: 'wx', mode: 0o600 })
  const args = ['role', id ? 'update' : 'create', '--role-file', file, '--request-id', request, ...(id ? ['--role', id, '--role-revision', String(revision)] : [])]
  const role = native(await cli(project, args)).role
  assert.equal(role.project_id, config[project].project_id)
  assert.equal(role.id, id ?? request)
  assert.equal(role.revision, id ? revision + 1 : 1)
  for (const [key, value] of Object.entries(definition)) assert.deepEqual(role[key], value)
  return role
}

function startArgs(scope, role, request, selection) {
  return ['worker', 'start', '--controller', scope.controller, '--task', scope.root_task_id, '--name', `role-${request}`, '--input-file', scope.input_file,
    '--role', role.id, '--role-revision', String(role.revision), '--parent-task', scope.root_task_id, '--handoff-mode', 'work', '--reply-mode', 'poll',
    '--completion-criterion', 'Complete the approved public input', '--completion-criterion', 'Return an inspectable final answer', '--question-mode', 'disabled', '--delegation-mode', 'disabled', '--request-id', request,
    ...(selection ? ['--agent', selection.agent, '--model', selection.model] : [])]
}

async function verifyStart(reply, role, selection, request) {
  const scope = config.primary
  const original = (await cli('primary', ['request', 'show', '--controller', scope.controller, '--request-id', request])).result
  assert.equal(original.state, 'completed')
  assert.equal(original.method, 'swa.controllerDeliver')
  const receipt = original.receipt, invocation = receipt.invocation
  for (const record of [receipt, invocation.scope]) {
    assert.equal(record.project_id, scope.project_id)
    assert.equal(record.run_id, scope.run_id)
    assert.equal(record.root_task_id, scope.root_task_id)
  }
  assert.equal(receipt.native.state, 'ready')
  assert.equal(receipt.native.dispatchId, reply.dispatch_id)
  assert.equal(receipt.native.taskId, reply.task_id)
  assert.equal(receipt.selection.agent_id, selection.agent)
  assert.equal(receipt.selection.model, selection.model)
  const observed = native(await cli('primary', ['worker', 'show', '--controller', scope.controller, '--dispatch', reply.dispatch_id]))
  assert.equal(observed.worker.dispatchId, reply.dispatch_id)
  assert.equal(observed.worker.runtimeEpoch, config.runtime_id)
  assert.equal(observed.source.availability, 'observed')
  assert.ok(observed.source.native_session_id && observed.source.provider_link)
  assert.equal(observed.source.selection.agent_id, selection.agent)
  assert.equal(observed.source.selection.model, selection.model)
  assert.equal(observed.execution.launch.status, 'available')
  assert.equal(observed.execution.selection.agent, selection.agent)
  assert.equal(observed.execution.selection.model, selection.model)
  const task = (await taskInventory('primary')).find(task => task.id === reply.task_id)
  assert.ok(task)
  assert.equal(task.parent_id, scope.root_task_id)
  const spec = JSON.parse(task.spec)
  assert.deepEqual(spec.role_snapshot, role)
  assert.deepEqual(spec.handoff, invocation.spec.handoff)
  assert.equal(spec.handoff.parent_task_id, scope.root_task_id)
  assert.equal(spec.handoff.origin.project_id, scope.project_id)
  assert.equal(spec.handoff.mode, 'work')
  assert.equal(spec.handoff.reply, 'poll')
  assert.deepEqual(spec.handoff.completion_criteria, ['Complete the approved public input', 'Return an inspectable final answer'])
  const worker = { request_id: request, task_id: reply.task_id, dispatch_id: reply.dispatch_id, session_id: observed.source.native_session_id, agent: selection.agent, model: selection.model }
  report.workers.push(worker)
  return worker
}

try {
  for (const project of ['primary', 'restricted']) {
    const capabilities = (await cli(project, ['capabilities'])).result
    assert.equal(capabilities.source_revision, config.revision)
    const selected = capabilities.agents.find(agent => agent.id === config.override.agent)
    assert.ok(selected)
    assert.equal(selected.installed.status, 'available')
    assert.equal(selected.configured.status, 'available')
    assert.equal(selected.enabled.status, 'available')
    const allowed = selected.requirements.external_model_clis?.length ? selected.requirements.external_model_clis : [selected.requirements.external_model_cli]
    assert.equal(allowed.includes(config.override.agent), project === 'primary')
  }
  const before = await taskInventory('primary'), restrictedBefore = await taskInventory('restricted')
  const role = await saveRole('primary', config.default)
  const defaultRequest = randomUUID(), defaultArgs = startArgs(config.primary, role, defaultRequest)
  const defaultReply = await cli('primary', defaultArgs)
  await verifyStart(defaultReply, role, config.default, defaultRequest)
  const replay = await cli('primary', defaultArgs)
  assert.equal(replay.dispatch_id, defaultReply.dispatch_id)
  assert.equal(replay.task_id, defaultReply.task_id)
  assert.equal((await taskInventory('primary')).length, before.length + 1)
  report.checks.push('role_default_actual_session', 'same_request_same_worker')
  const overrideRequest = randomUUID(), overrideReply = await cli('primary', startArgs(config.primary, role, overrideRequest, config.override))
  await verifyStart(overrideReply, role, config.override, overrideRequest)
  assert.notEqual(defaultReply.dispatch_id, overrideReply.dispatch_id)
  report.checks.push('explicit_other_cli_override', 'backend_parent_and_handoff')
  const updated = await saveRole('primary', config.override, role.id, role.revision)
  await cli('primary', startArgs(config.primary, role, randomUUID()), ['context_stale'])
  await cli('primary', startArgs(config.primary, updated, defaultRequest), ['context_stale', 'request_mismatch'])
  await cli('primary', startArgs(config.primary, updated, defaultRequest, config.override), ['context_stale', 'request_mismatch'])
  const original = (await cli('primary', ['request', 'show', '--controller', config.primary.controller, '--request-id', defaultRequest])).result
  assert.equal(original.receipt.native.dispatchId, defaultReply.dispatch_id)
  assert.equal(original.receipt.selection.agent_id, config.default.agent)
  assert.equal(original.receipt.selection.model, config.default.model)
  const afterUpdate = await taskInventory('primary')
  assert.equal(afterUpdate.length, before.length + 2)
  for (const worker of report.workers) assert.deepEqual(JSON.parse(afterUpdate.find(task => task.id === worker.task_id).spec).role_snapshot, role)
  report.checks.push('stale_role_rejected', 'updated_role_cannot_retarget_original_request')
  await cli('restricted', startArgs(config.restricted, updated, randomUUID()), ['scope_denied'])
  const unapproved = await saveRole('restricted', config.override)
  await cli('restricted', startArgs(config.restricted, unapproved, randomUUID()), ['scope_denied', 'approval_required'])
  assert.deepEqual((await taskInventory('restricted')).map(task => task.id).sort(), restrictedBefore.map(task => task.id).sort())
  report.checks.push('cross_project_role_rejected', 'unapproved_installed_agent_rejected')
  report.status = 'STARTUP_CHECKS_PASSED'
} catch (error) {
  report.status = 'FAILED'
  report.error = error.message
  process.exitCode = 1
} finally {
  await writeFile(join(values.output, 'summary.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  process.stdout.write(JSON.stringify(report) + '\n')
}
