import assert from 'node:assert/strict'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium, expect } from '../../web/node_modules/@playwright/test/index.mjs'

const help = `观察已有真实服务中的角色与 Run，不创建服务、角色、Worker 或项目许可。
node browser-observe.mjs --config ABS_JSON --output ABS_NEW_DIRECTORY
config: endpoint, project_id, controller, run_id, root_task_id；
可选 runtime_id, project_root, roles（实际 role.list 记录或 id/revision/default_agent/default_model）。
roles 省略时观察服务当前全部未归档角色；单角色结果不代表双 CLI 验收。
已有人工会话只通过 SWA_BROWSER_SESSION_COOKIE 完整 Cookie header 传入，不写入配置或日志。
使用仓库 web 的 Playwright 和 /usr/bin/chromium；只观察 Linux 安装。
输出 result.json 仅包含身份、角色选择、CLI 观察与检查结果，不保存 Cookie、响应正文或截图。
`
if (process.argv.includes('--help')) { process.stdout.write(help); process.exit(0) }

const { values } = parseArgs({ options: { config: { type: 'string' }, output: { type: 'string' } }, allowPositionals: false })
assert.ok(isAbsolute(values.config ?? '') && isAbsolute(values.output ?? ''), 'Explicit absolute config/output paths are required')
assert.equal(process.platform, 'linux', 'This browser observation requires Linux')
const config = JSON.parse(await readFile(values.config, 'utf8'))
for (const key of ['endpoint', 'project_id', 'controller', 'run_id', 'root_task_id']) assert.ok(typeof config[key] === 'string' && config[key], `Missing ${key}`)
const endpoint = new URL(config.endpoint)
assert.ok(endpoint.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(endpoint.hostname) && endpoint.port && endpoint.pathname === '/' && !endpoint.search && !endpoint.hash && !endpoint.username && !endpoint.password, 'An explicit loopback service is required')
const cookie = process.env.SWA_BROWSER_SESSION_COOKIE
assert.ok(typeof cookie === 'string' && /^astrocyte_session=[A-Za-z0-9_-]+$/.test(cookie) && !/[\r\n]/.test(cookie), 'Exactly one existing astrocyte_session Cookie is required through the environment')
assert.equal(values.output, resolve(values.output), 'The output must use a canonical absolute path')
assert.equal(await realpath(dirname(values.output)), dirname(values.output), 'The output parent must not redirect')
assert.equal(join(dirname(values.output), basename(values.output)), values.output, 'The output must name a new child directory')
await mkdir(values.output, { mode: 0o700 })
const temporary = join(values.output, 'browser-temp')
await mkdir(temporary, { mode: 0o700 })
const priorTemporary = process.env.TMPDIR
process.env.TMPDIR = temporary

const commandPath = `/api/v1/local-projects/${config.project_id}/orca/commands`
const readActions = new Set(['status', 'capabilities', 'role.list', 'role.show', 'conversation.list', 'conversation.show', 'run.show', 'task.show', 'task.list', 'worker.list', 'worker.show', 'worker.read', 'request.show'])
const report = { status: 'RUNNING', project_id: config.project_id, controller: config.controller, run_id: config.run_id, root_task_id: config.root_task_id, roles: [], agents: [], reads: {}, blocked_requests: 0, page_errors: 0, checks: [], browser_closed: false }
let browser, phase = 'launch'
function waiting(operation) {
  // 提前失败并关闭浏览器时，未到达的响应不会产生未处理拒绝；正常路径仍 await 原 Promise。
  void operation.catch(() => {})
  return operation
}
const commandResponse = (page, action) => waiting(page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === commandPath && response.request().postDataJSON()?.action === action, { timeout: 30_000 }))
async function reply(response) {
  report.last_response = { action: response.request().postDataJSON()?.action, status: response.status() }
  assert.equal(response.status(), 200, 'An observed command did not return HTTP 200')
  assert.equal(await response.request().headerValue('authorization'), null, 'Browser reads must use the human session')
  const bytes = await response.body()
  assert.ok(bytes.length <= 12 * 1024 * 1024, 'The command response exceeds the observation limit')
  const value = JSON.parse(bytes.toString('utf8'))
  assert.equal(value.ok, true, 'The observed command was rejected')
  assert.ok(typeof value.runtime_id === 'string' && value.runtime_id, 'The observed command omitted its runtime')
  if (report.runtime_id) assert.equal(value.runtime_id, report.runtime_id, 'The browser changed runtimes')
  report.runtime_id = value.runtime_id
  if (config.runtime_id) assert.equal(value.runtime_id, config.runtime_id, 'The browser reached a different runtime')
  return value
}
function sameRun(value) {
  for (const [field, expected] of [['controller', config.controller], ['run_id', config.run_id], ['task_id', config.root_task_id]]) assert.equal(value[field], expected)
  const scope = value.result?.scope, view = value.result?.native?.run_view
  assert.equal(scope?.project_id, config.project_id)
  assert.equal(scope.controller, config.controller)
  assert.equal(scope.run_id, config.run_id)
  assert.equal(scope.root_task_id, config.root_task_id)
  assert.equal(view?.schema, 'swa.run-view.v1')
  assert.equal(view.controller, config.controller)
  assert.equal(view.run_id, config.run_id)
  assert.equal(view.root_task_id, config.root_task_id)
  assert.equal(view.root?.id, config.root_task_id)
  assert.ok(Array.isArray(view.tasks) && Array.isArray(view.dispatches))
  return view
}
async function checkRunDOM(page, view) {
  const run = page.getByRole('region', { name: '完整任务', exact: true })
  await expect(run.getByText(`Run · ${config.run_id} · 根任务 ${config.root_task_id}`, { exact: true })).toBeVisible()
  const tasks = run.getByRole('region', { name: '完整递归任务', exact: true })
  await expect(tasks).toBeVisible()
  for (const task of view.tasks) await expect(tasks).toContainText(task.id)
  for (const dispatch of view.dispatches) await expect(tasks).toContainText(dispatch.id)
  await expect(run.getByLabel('原 Run ID', { exact: true })).toHaveValue(config.run_id)
  await expect(run.getByLabel('原 Run 的 Controller', { exact: true })).toHaveValue(config.controller)
  await expect(run.getByLabel('原 Run 的根 Task ID', { exact: true })).toHaveValue(config.root_task_id)
}

try {
  const env = Object.fromEntries(['PATH', 'HOME', 'LANG', 'LC_ALL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, timeout: 20_000, env: { ...env, TMPDIR: temporary } })
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false })
  phase = 'existing_human_session'
  // 由真实服务的 Set-Cookie 建立有域和路径限制的 Cookie，不把凭据设为通用浏览器 header。
  const sessionResponse = await context.request.get(`${endpoint.origin}/api/v1/auth/session`, { headers: { Cookie: cookie }, maxRedirects: 0, timeout: 10_000 })
  assert.equal(sessionResponse.status(), 200)
  const session = await sessionResponse.json()
  assert.equal(session.actor_kind, 'human')
  assert.equal(session.actor_id, 'local-human')
  await sessionResponse.dispose()
  // 所有写入命令在发出前拒绝；已有会话仅通过同源只读请求使用。
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    let allowed = url.origin === endpoint.origin && request.method() === 'GET' && (!url.pathname.startsWith('/api/') || ['/api/v1/auth/session', '/api/v1/local-projects'].includes(url.pathname))
    if (url.origin === endpoint.origin && url.pathname === commandPath && request.method() === 'POST') {
      let body
      try { body = request.postDataJSON() } catch { body = null }
      allowed = !!body && readActions.has(body.action) && (body.project_id === undefined || body.project_id === config.project_id) && (body.controller === undefined || body.controller === config.controller) && (body.run_id === undefined || body.run_id === config.run_id)
      if (allowed) report.reads[body.action] = (report.reads[body.action] ?? 0) + 1
    }
    if (!allowed) { report.blocked_requests++; await route.abort('blockedbyclient'); return }
    await route.continue()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  page.on('pageerror', () => { report.page_errors++ })
  phase = 'load_existing_project'
  const capabilitiesResponse = commandResponse(page, 'capabilities'), rolesResponse = commandResponse(page, 'role.list')
  const projectsResponse = waiting(page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/local-projects', { timeout: 30_000 }))
  const document = await page.goto(`${endpoint.origin}/swarm?project=${encodeURIComponent(config.project_id)}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  assert.equal(document?.status(), 200)
  await expect(page.getByLabel('SWA 项目', { exact: true })).toHaveValue(config.project_id)
  const human = await page.evaluate(async () => {
    const response = await fetch('/api/v1/auth/session', { signal: AbortSignal.timeout(10_000) })
    const session = await response.json()
    return { status: response.status, actor_kind: session.actor_kind, actor_id: session.actor_id }
  })
  assert.deepEqual(human, { status: 200, actor_kind: 'human', actor_id: 'local-human' })
  const projectsReply = await projectsResponse
  assert.equal(projectsReply.status(), 200)
  const projectsBytes = await projectsReply.body()
  assert.ok(projectsBytes.length <= 1024 * 1024)
  const project = JSON.parse(projectsBytes.toString('utf8')).items?.find(item => item.id === config.project_id)
  assert.ok(project && project.settings.allowed_actions.includes('observe'), 'The current project does not allow observation')
  if (config.project_root) assert.equal(project.root, config.project_root)
  const capabilities = (await reply(await capabilitiesResponse)).result
  const roles = (await reply(await rolesResponse)).result?.native?.roles
  assert.equal(capabilities?.schema, 'swa.capabilities.v1')
  assert.ok(Array.isArray(capabilities.agents) && Array.isArray(roles))
  const selectedRoles = config.roles ?? roles.filter(role => !role.archived)
  assert.ok(Array.isArray(selectedRoles) && selectedRoles.length > 0, 'At least one existing role is required')
  assert.equal(new Set(selectedRoles.map(role => role.id)).size, selectedRoles.length)
  phase = 'select_existing_roles'
  const run = page.getByRole('region', { name: '完整任务', exact: true })
  await page.getByText('可复用角色与讨论', { exact: true }).click()
  const roleButtons = page.getByRole('list', { name: '项目角色', exact: true }).getByRole('button')
  await expect(roleButtons).toHaveCount(roles.length)
  for (const expected of selectedRoles) {
    const index = roles.findIndex(role => role.id === expected.id), role = roles[index]
    assert.ok(role && !role.archived && role.project_id === config.project_id, 'The requested role is not current in this project')
    for (const field of ['id', 'revision', 'default_agent', 'default_model']) assert.equal(role[field], expected[field], `The current role differs in ${field}`)
    const agent = capabilities.agents.find(item => item.id === role.default_agent)
    assert.ok(agent && agent.installed.status === 'available' && agent.configured.status === 'available', 'The role CLI is not installed and configured')
    assert.ok(typeof agent.installed.version === 'string' && agent.installed.version)
    await roleButtons.nth(index).click()
    await expect(page.getByLabel('默认 Agent', { exact: true })).toHaveValue(role.default_agent)
    await expect(page.getByLabel('默认模型', { exact: true })).toHaveValue(role.default_model)
    await expect(run.getByLabel('主 Agent', { exact: true })).toHaveValue(role.default_agent)
    await expect(run.getByLabel('本次模型', { exact: true })).toHaveValue(role.default_model)
    await expect(run.getByLabel('本次问题模式', { exact: true })).toHaveValue(role.question_mode ?? 'disabled')
    await expect(run.getByLabel('本次委派模式', { exact: true })).toHaveValue(role.delegation_mode ?? 'disabled')
    await expect(run.getByLabel('本次开发模式', { exact: true })).toHaveValue(role.development_mode ?? 'disabled')
    await expect(run.getByText(`复用角色 · ${role.id} · 版本 ${role.revision}`, { exact: true })).toBeVisible()
    const modelListed = agent.model_catalog?.origin !== 'unknown' && Array.isArray(agent.model_catalog?.models) && agent.model_catalog.models.some(model => model.id === role.default_model)
    const save = page.getByRole('button', { name: '保存角色新版本', exact: true })
    if (!modelListed) {
      await expect(page.getByLabel('默认模型', { exact: true }).getByRole('option', { name: `${role.default_model} · 原选择当前不可用`, exact: true })).toBeDisabled()
      await expect(save).toBeDisabled()
    }
    report.roles.push({ id: role.id, revision: role.revision, agent: role.default_agent, model: role.default_model, model_in_current_catalog: modelListed, save_disabled: await save.isDisabled(), launch_checked: false })
    if (!report.agents.some(item => item.id === agent.id)) report.agents.push({ id: agent.id, version: agent.installed.version, configured_model: agent.configured.model, authenticated: agent.authenticated?.status ?? 'unknown', model_catalog: { origin: agent.model_catalog?.origin ?? 'unknown', availability: agent.model_catalog?.availability ?? 'unverified' } })
  }
  report.checks.push('existing_roles_and_models_match_service')
  phase = 'attach_existing_run'
  await page.getByLabel('原 Run ID', { exact: true }).fill(config.run_id)
  await page.getByLabel('原 Run 的 Controller', { exact: true }).fill(config.controller)
  await page.getByLabel('原 Run 的根 Task ID', { exact: true }).fill(config.root_task_id)
  const observed = commandResponse(page, 'run.show')
  await page.getByRole('button', { name: '重新连接完整任务', exact: true }).click()
  await page.getByLabel('自动观察同一 Run', { exact: true }).uncheck()
  const first = sameRun(await reply(await observed))
  await checkRunDOM(page, first)
  report.checks.push('existing_run_and_tasks_visible')
  phase = 'reload_same_run'
  const reconnected = commandResponse(page, 'run.show')
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.getByLabel('自动观察同一 Run', { exact: true }).uncheck()
  const after = sameRun(await reply(await reconnected))
  await expect(page.getByLabel('SWA 项目', { exact: true })).toHaveValue(config.project_id)
  assert.equal(new URL(page.url()).searchParams.get('project'), config.project_id)
  await checkRunDOM(page, after)
  report.checks.push('reload_retains_project_and_original_run')
  report.observed_run = { status_before: first.status, status_after: after.status, tasks_before: first.tasks.length, tasks_after: after.tasks.length, dispatches_before: first.dispatches.length, dispatches_after: after.dispatches.length }
  assert.equal(report.blocked_requests, 0, 'The page attempted an out-of-scope request')
  assert.equal(report.page_errors, 0, 'The browser reported a page error')
  report.status = 'BROWSER_OBSERVATION_PASSED'
} catch (error) {
  report.status = 'FAILED'
  report.failure = { phase, name: error?.name === 'TimeoutError' ? 'TimeoutError' : error?.code === 'ERR_ASSERTION' ? 'AssertionError' : 'Error' }
  process.exitCode = 1
} finally {
  if (browser) {
    try { await browser.close(); report.browser_closed = true }
    catch { report.status = 'FAILED'; report.close_failed = true; process.exitCode = 1 }
  }
  if (priorTemporary === undefined) delete process.env.TMPDIR
  else process.env.TMPDIR = priorTemporary
  if (report.blocked_requests || report.page_errors) { report.status = 'FAILED'; process.exitCode = 1 }
  await writeFile(join(values.output, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  process.stdout.write(JSON.stringify({ status: report.status, output: values.output, roles: report.roles.length, distinct_agents: report.agents.length, browser_closed: report.browser_closed, ...(report.failure ? { failure: report.failure } : {}) }) + '\n')
}
