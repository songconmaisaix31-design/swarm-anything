import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'

// 新建验收数据和观察授权；临时凭据仅留在内存，不读既有账户文件。
const [install, output, ...protectedRoots] = process.argv.slice(2).map(value => resolve(value))
assert.equal(process.platform, 'darwin')
assert.ok(install && output && protectedRoots.length)
await mkdir(output, { mode: 0o700 })
const data = join(output, 'data'), projectRoot = join(output, 'public-project')
await mkdir(projectRoot, { mode: 0o700 })
execFileSync('/usr/bin/git', ['init', '--quiet', projectRoot])
await writeFile(join(projectRoot, 'README.md'), '# SWA macOS installation acceptance\n', { flag: 'wx' })
const swa = join(install, 'swa'), endpoint = 'http://127.0.0.1:8787'
const env = { ...process.env }
for (const key of Object.keys(env)) if (key.startsWith('SWA_') || key.startsWith('ORCA_')) delete env[key]
const version = execFileSync(swa, ['--version'], { encoding: 'utf8', env }).trim()
assert.equal(version, (await readFile(join(install, 'VERSION'), 'utf8')).trim())
await writeFile(join(output, 'help.txt'), execFileSync(swa, ['--help'], { env }))
console.log(JSON.stringify({ stage: 'installed-cli', version, help: 'passed' }))
const service = spawn(swa, ['serve', '--data-dir', data, '--port', '8787', '--protected-roots', protectedRoots.join(':'), '--json'], { env, stdio: ['pipe', 'pipe', 'pipe'] })
let stderr = '', stdout = '', closed = false
service.stderr.on('data', chunk => { stderr += chunk.toString() })
service.stdout.on('data', chunk => { stdout += chunk.toString() })
const exit = new Promise(resolve => service.once('close', (code, signal) => { closed = true; resolve({ code, signal }) }))
const lines = createInterface({ input: service.stdout })
let cookie, csrf, token, project
const observed = new Set([service.pid])
async function human(method, path, body, expected = 200) {
  const request = body ? randomUUID() : undefined
  const headers = { Origin: endpoint, ...(cookie ? { Cookie: cookie } : {}) }
  if (body) Object.assign(headers, { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'Idempotency-Key': request })
  const response = await fetch(endpoint + path, { method, headers, redirect: 'error', signal: AbortSignal.timeout(30_000), body: body ? JSON.stringify({ ...body, schema_version: 1, request_id: request, expected_version: 1 }) : undefined })
  assert.equal(response.status, expected, 'Unexpected status for ' + path)
  if (path === '/api/v1/auth/session') cookie = response.headers.getSetCookie().find(value => value.startsWith('astrocyte_session='))?.split(';')[0]
  return await response.json()
}
try {
  const readiness = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Readiness timed out')), 90_000)
    lines.once('line', line => { clearTimeout(timer); try { resolve(JSON.parse(line)) } catch { reject(new Error('Invalid readiness JSON')) } })
    service.once('exit', () => { clearTimeout(timer); reject(new Error('Service exited before readiness')) })
  })
  assert.equal(readiness.ok, true)
  await writeFile(join(output, 'readiness.json'), JSON.stringify(readiness, null, 2) + '\n')
  console.log(JSON.stringify({ stage: 'readiness', ...readiness }))
  const record = JSON.parse(await readFile(join(data, 'daemon', 'daemon-v49.pid'), 'utf8'))
  observed.add(record.pid)
  for (const match of stderr.matchAll(/pid=(\d+) start_us=/g)) observed.add(Number(match[1]))
  await new Promise(resolve => setTimeout(resolve, 1500))
  assert.equal(closed, false, 'Service did not stay running')
  const session = await human('GET', '/api/v1/auth/session')
  assert.equal(session.actor_kind, 'human'); assert.equal(session.actor_id, 'local-human')
  csrf = session.csrf_token
  assert.ok(cookie && csrf)
  const space = (await human('POST', '/api/v1/project-spaces', { title: 'macOS installed observation acceptance' }, 201)).space
  project = (await human('POST', '/api/v1/local-projects', { name: 'macOS observation', root: projectRoot, space_id: space.id })).project
  project = (await human('PUT', `/api/v1/local-projects/${project.id}/settings`, { expected_revision: project.settings.revision, settings: { ...project.settings, allowed_actions: ['observe'] } })).project
  const agent = 'macos-acceptance-' + randomUUID()
  await human('POST', `/api/v1/local-projects/${project.id}/grants`, { agent_id: agent, actions: ['observe'] })
  const credential = (await human('POST', `/api/v1/local-projects/${project.id}/agent-token`, { agent_id: agent })).credential
  assert.equal(credential.project_id, project.id)
  token = credential.token
  assert.ok(token)
  const result = execFileSync(swa, ['capabilities', '--json'], { env: { ...env, SWA_ENDPOINT: endpoint, SWA_PROJECT_ID: project.id, SWA_PROJECT_TOKEN: token }, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 })
  const capabilities = JSON.parse(result)
  assert.equal(capabilities.ok, true)
  await writeFile(join(output, 'capabilities.json'), result)
  console.log(JSON.stringify({ stage: 'capabilities', result: capabilities }))
} finally {
  token = cookie = csrf = undefined
  if (!closed) service.kill('SIGINT')
  const stopped = await Promise.race([exit, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Service shutdown timed out; inspect original process')), 45_000); timer.unref() })])
  lines.close()
  service.stdin.destroy()
  await writeFile(join(output, 'serve.stdout.log'), stdout)
  await writeFile(join(output, 'serve.stderr.log'), stderr)
  const verification = []
  for (const pid of observed) {
    const state = JSON.parse(execFileSync(swa, ['darwin-process-identity', String(pid)], { env, encoding: 'utf8' }))
    verification.push(state)
    assert.equal(state.state, 'absent', 'Observed service process remains')
  }
  const result = { stage: 'shutdown', exit: stopped, observed_processes: verification, complete_tree_release: stopped.code === 0 ? 'confirmed' : 'unknown' }
  await writeFile(join(output, 'shutdown.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
}
