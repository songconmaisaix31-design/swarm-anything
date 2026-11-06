import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { candidate: { type: 'string' }, native: { type: 'boolean' } }, allowPositionals: false })
if (!values.candidate || !isAbsolute(values.candidate)) throw new Error('An explicit absolute --candidate is required')
const candidate = await realpath(values.candidate)
const runtime = join(candidate, 'runtime')
const node = join(candidate, 'node', 'node.exe')
const expected = (await readFile(join(candidate, 'VERSION'), 'utf8')).trim()
assert.match(expected, /^[0-9a-f]{40}$/)
const hash = createHash('sha256').update(await readFile(node)).digest('hex')
assert.equal(hash, 'ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32')

function assertContained(path) {
  const rel = relative(candidate, path)
  if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) throw new Error(`Candidate closure escapes: ${path}`)
}

if (!values.native) {
  const seen = new Set()
  async function walk(path) {
    const actual = await realpath(path)
    assertContained(actual)
    if (seen.has(actual)) return
    seen.add(actual)
    const entry = await lstat(actual)
    if (entry.isDirectory()) for (const name of await readdir(actual)) await walk(join(actual, name))
    else if (!entry.isFile()) throw new Error(`Unsupported candidate payload: ${actual}`)
  }
  await walk(candidate)
  const actual = execFileSync(join(candidate, 'swa.exe'), ['--version'], { encoding: 'utf8', windowsHide: true }).trim()
  assert.equal(actual, expected)
  for (const file of ['install-swa.ps1', 'USAGE.md', 'LICENSE', 'ORCA_LICENSE', 'THIRD_PARTY_SWA.md']) assert.ok((await readFile(join(candidate, file))).length > 0)
  const result = execFileSync(node, ['--max-old-space-size=1024', import.meta.filename, '--candidate', candidate, '--native'], { encoding: 'utf8', windowsHide: true, env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1024' }, timeout: 30_000 })
  process.stdout.write(result)
  console.log(JSON.stringify({ candidate, source_revision: expected, closure_paths: seen.size, native_authentication: 'NOT_RUN', functional_acceptance: 'NOT_RUN' }))
} else {
  assert.equal(process.version, 'v24.21.0')
  const requireRuntime = createRequire(join(runtime, 'package.json'))
  const packageJSON = JSON.parse(await readFile(join(runtime, 'package.json'), 'utf8'))
  assert.equal(packageJSON.type, 'commonjs')
  for (const file of ['host.cjs', 'client.cjs', 'controller-helper.cjs', 'native-cli-entry.cjs', 'strict-caller-probe.cjs', 'controller-inspection.cjs', 'controller-fault.exe', 'cli-fault-control.exe', 'task-result.cjs', 'journal-open.cjs', 'swa-provider-process-tree.cjs', 'daemon-entry.js', 'profile-state-writer-worker-entry.js', 'opencode-policy/server.js', 'opencode-policy/package.json']) await readFile(join(runtime, file))
  const utils = requireRuntime('node-pty/lib/utils')
  const loaded = utils.loadNativeModule('conpty')
  const ptyRoot = dirname(requireRuntime.resolve('node-pty/package.json'))
  for (const file of ['conpty.node', 'conpty_console_list.node', 'conpty/conpty.dll', 'conpty/OpenConsole.exe']) assert.ok((await readFile(join(ptyRoot, 'build', 'Release', file))).length > 0)
  assert.equal(loaded.module.providerJobIsolationVersion, 1)
  for (const name of ['createProviderJob', 'assignProviderJob', 'queryProviderJob', 'terminateProviderJob', 'closeProviderJob']) assert.equal(typeof loaded.module[name], 'function')
  const job = loaded.module.createProviderJob()
  const observed = loaded.module.queryProviderJob(job)
  assert.equal(observed.ownerPid, process.pid)
  assert.equal(observed.assigned, false)
  assert.equal(observed.rootPid, 0)
  assert.deepEqual(observed.members, [])
  assert.equal(loaded.module.closeProviderJob(job), true)
  assert.throws(() => loaded.module.queryProviderJob(job))
  const processes = requireRuntime('@vscode/windows-process-tree')
  assert.equal(processes.supportedProcessDataFlags & 4, 4)
  const creationTimeMs = processes.getProcessCreationTime(process.pid)
  assert.ok(Number.isFinite(creationTimeMs) && creationTimeMs > 0)
  const security = requireRuntime('@orca/windows-security')
  const currentSid = security.currentUserSid()
  assert.match(currentSid, /^S-1-/)
  requireRuntime('@orca/windows-registry').getRegistryKey(0x80000001, 'Software')
  requireRuntime('@parcel/watcher')
  assertContained(await realpath(dirname(requireRuntime.resolve('node-pty/package.json'))))
  console.log(JSON.stringify({ native_node: process.version, native_pid: process.pid, native_creation_time_ms: creationTimeMs, provider_job_api: loaded.module.providerJobIsolationVersion, actual_empty_job: observed, job_descendant_test: 'NOT_RUN' }))
}
