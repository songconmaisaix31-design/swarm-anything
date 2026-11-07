import assert from 'node:assert/strict'
import { spawn, execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'

const [installation, destination] = process.argv.slice(2)
assert.ok(installation && destination)
const install = await realpath(installation), output = resolve(destination)
assert.ok(!output.includes('fl-data-parent') && output.length < 70)
const endpoint = 'http://127.0.0.1:8788', protectedRoots = ['/Users/tester/.codex', '/Users/tester/.pi', '/Users/tester/.claude', '/Users/tester/.config/opencode']
await mkdir(output, { mode: 0o700 })
const projectRoot = join(output, 'project'), data = join(output, 'd')
await mkdir(projectRoot, { mode: 0o700 })
const readme = '# Add example\n\n```js\nfunction add(a, b) { return a + b; }\n```\n'
await writeFile(join(projectRoot, 'README.md'), readme, { flag: 'wx' })
const git = args => execFileSync('/usr/bin/git', ['-C', projectRoot, ...args], { encoding: 'utf8' }).trim()
git(['init', '--quiet']); git(['add', 'README.md'])
git(['-c', 'user.name=SWA acceptance', '-c', 'user.email=swa-test@example.invalid', 'commit', '--quiet', '-m', 'Add public synthetic README'])
const sourceRevision = git(['rev-parse', 'HEAD'])
const spec = { goal: '只读解释 README 中 add 函数。', source_repo: projectRoot, source_revision: sourceRevision, success_criteria: ['解释两个参数相加并给出 add(2,3) 的结果。'], max_workers: 1, context: { references: [], files: ['README.md'] } }
await writeFile(join(projectRoot, 'task.json'), JSON.stringify(spec))
await writeFile(join(projectRoot, 'input.txt'), '只解释以下 README 中 add 函数，给出 add(2,3) 结果。不调用工具、不修改文件。\n' + readme)
const env = { ...process.env }
for (const key of Object.keys(env)) if (key.startsWith('SWA_') || key.startsWith('ORCA_')) delete env[key]
const swa = join(install, 'swa')
const service = spawn(swa, ['serve', '--data-dir', data, '--port', '8788', '--protected-roots', protectedRoots.join(':'), '--json'], { env, stdio: ['pipe', 'pipe', 'pipe'] })
let stdout = '', stderr = '', closed = false, cookie, csrf, token, project
service.stdout.setEncoding('utf8').on('data', value => { stdout += value })
service.stderr.setEncoding('utf8').on('data', value => { stderr += value })
const exit = new Promise(resolve => service.once('close', (code, signal) => { closed = true; resolve({ code, signal }) }))
const lines = createInterface({ input: service.stdout })
const save = (name, value) => writeFile(join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
const report = { endpoint, install, data, sourceRevision, run: null, export: null, workerStop: 'not_attempted_without_real_worker' }
async function human(method, path, body, expected = 200) {
  const request = body ? randomUUID() : undefined
  const headers = { Origin: endpoint, ...(cookie ? { Cookie: cookie } : {}) }
  if (body) Object.assign(headers, { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'Idempotency-Key': request })
  const response = await fetch(endpoint + path, { method, headers, redirect: 'error', signal: AbortSignal.timeout(30_000), body: body ? JSON.stringify({ ...body, schema_version: 1, request_id: request, expected_version: 1 }) : undefined })
  assert.equal(response.status, expected, 'HTTP status at ' + path)
  if (path === '/api/v1/auth/session') cookie = response.headers.getSetCookie().find(value => value.startsWith('astrocyte_session='))?.split(';')[0]
  return response.json()
}
async function cli(name, args) {
  const result = spawnSync(swa, [...args, '--json'], { env: { ...env, SWA_ENDPOINT: endpoint, SWA_PROJECT_ID: project.id, SWA_PROJECT_TOKEN: token }, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 })
  await writeFile(join(output, name + '.stdout'), result.stdout ?? '')
  await writeFile(join(output, name + '.stderr'), result.stderr ?? '')
  let body = null
  if (result.stdout?.trim()) body = JSON.parse(result.stdout)
  const record = { args, exit: result.status, signal: result.signal, error: result.error?.code ?? null, body }
  await save(name + '.json', record)
  return record
}
const observed = new Set([service.pid])
try {
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Readiness timeout')), 90_000)
    lines.once('line', value => { clearTimeout(timer); try { resolve(JSON.parse(value)) } catch { reject(new Error('Invalid readiness')) } })
    service.once('exit', () => { clearTimeout(timer); reject(new Error('Service exited before readiness')) })
  })
  assert.equal(ready.ok, true)
  assert.equal(ready.http, endpoint)
  await save('readiness.json', ready)
  console.log(JSON.stringify({ stage: 'readiness', ...ready }))
  observed.add(ready.runtime_pid); observed.add(ready.server_pid)
  observed.add(JSON.parse(await readFile(join(data, 'daemon/daemon-v49.pid'), 'utf8')).pid)
  const session = await human('GET', '/api/v1/auth/session')
  assert.equal(session.actor_kind, 'human'); assert.equal(session.actor_id, 'local-human')
  csrf = session.csrf_token; assert.ok(cookie && csrf)
  const space = (await human('POST', '/api/v1/project-spaces', { title: 'Darwin second-round execution' }, 201)).space
  project = (await human('POST', '/api/v1/local-projects', { name: 'Read-only add explanation', root: projectRoot, space_id: space.id })).project
  const actions = ['read_context', 'observe', 'start', 'send', 'stop']
  project = (await human('PUT', `/api/v1/local-projects/${project.id}/settings`, { expected_revision: project.settings.revision, settings: { ...project.settings, allow_directory: true, allowed_subdirs: ['.'], allow_agent_control: true, allowed_actions: actions, allowed_tools: [], external_model_cli: 'pi' } })).project
  const caller = 'darwin-worker-check-' + randomUUID()
  await human('POST', `/api/v1/local-projects/${project.id}/grants`, { agent_id: caller, actions })
  const credential = (await human('POST', `/api/v1/local-projects/${project.id}/agent-token`, { agent_id: caller })).credential
  assert.equal(credential.project_id, project.id); token = credential.token; assert.ok(token)
  const capability = await cli('capabilities', ['capabilities'])
  assert.equal(capability.exit, 0)
  const pi = capability.body.result.agents.find(agent => agent.id === 'pi')
  console.log(JSON.stringify({ stage: 'pi-capabilities', configured: pi.configured, model_catalog: pi.model_catalog, control: pi.control }))
  const model = pi.model_catalog?.models.find(model => model.id === 'omlx/CyberTiel-MLX-MTP' || model.id === 'CyberTiel-MLX-MTP' && model.provider === 'omlx')
  assert.ok(model, 'Expected the explicitly approved local model in actual capabilities')
  const request = randomUUID()
  report.run = await cli('run', ['run', '--agent', 'pi', '--model', 'omlx/CyberTiel-MLX-MTP', '--project', project.id, '--workdir', projectRoot, '--spec-file', join(projectRoot, 'task.json'), '--input-file', join(projectRoot, 'input.txt'), '--request-id', request, '--timeout', '60s', '--strict', '--export', join(projectRoot, 'export')])
  console.log(JSON.stringify({ stage: 'run', ...report.run }))
  report.export = report.run.exit === 0 ? 'see_requested_export_directory' : 'run_not_completed_no_successful_export_claimed'
  assert.equal(await readFile(join(projectRoot, 'README.md'), 'utf8'), readme)
} finally {
  token = cookie = csrf = undefined
  if (!closed) service.kill('SIGINT')
  let stopped, timer
  try { stopped = await Promise.race([exit, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Owned 8788 service shutdown timeout')), 45_000) })]) }
  catch { stopped = { code: null, signal: null, state: 'unknown', reason: 'shutdown_deadline' } }
  finally { clearTimeout(timer); lines.close(); service.stdin.destroy(); service.stdout.destroy(); service.stderr.destroy(); service.unref() }
  await writeFile(join(output, 'serve.stdout.log'), stdout)
  await writeFile(join(output, 'serve.stderr.log'), stderr)
  const identities = [...observed].filter(Number.isSafeInteger).map(pid => {
    try { return JSON.parse(execFileSync(swa, ['darwin-process-identity', String(pid)], { env, encoding: 'utf8', timeout: 5000 })) }
    catch { return { pid, state: 'unknown', reason: 'identity_query_failed' } }
  })
  Object.assign(report, { shutdown: stopped, observedAfterShutdown: identities, tree: 'unknown' })
  await save('report.json', report)
  console.log(JSON.stringify({ stage: 'shutdown', exit: stopped, identities }))
  for (const identity of identities) assert.equal(identity.state, 'absent')
  assert.notEqual(stopped.code, null, 'Owned service shutdown is unknown')
}
