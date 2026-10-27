import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { checkCodexCatalog, checkWebAssets } from './swa-package-config.mjs'
import { NODE_RUNTIME_ASSETS } from '../third_party/orca-v1.4.230/src/shared/node-runtime-pin.ts'

const { values } = parseArgs({ options: { candidate: { type: 'string' }, native: { type: 'boolean' } }, allowPositionals: false })
if (!values.candidate || !isAbsolute(values.candidate)) throw new Error('An explicit absolute --candidate is required')
const candidate = await realpath(values.candidate)
const runtime = join(candidate, 'runtime')
let platform = 'win32-x64'
try { platform = (await readFile(join(candidate, 'PLATFORM'), 'utf8')).trim() }
catch (error) { if (error.code !== 'ENOENT') throw error }
assert.ok(['win32-x64', 'linux-x64-glibc'].includes(platform), 'Unknown candidate platform')
assert.equal(platform, process.platform === 'linux' ? 'linux-x64-glibc' : process.platform + '-' + process.arch, 'A candidate must be checked on its native platform')
const linux = platform === 'linux-x64-glibc'
const node = join(candidate, 'node', linux ? 'node' : 'node.exe')
const expected = (await readFile(join(candidate, 'VERSION'), 'utf8')).trim()
assert.match(expected, /^[0-9a-f]{40}$/)
let edition = 'cli', legacy = false
try { edition = (await readFile(join(candidate, 'EDITION'), 'utf8')).trim() }
catch (error) { if (error.code !== 'ENOENT') throw error; legacy = true }
assert.ok(['cli', 'combined'].includes(edition), 'Unknown candidate edition')
if (!legacy) for (const file of ['package.json', 'web-package.json', 'dependencies.lock.json', 'pnpm-lock.yaml']) assert.ok((await readFile(join(candidate, 'metadata', file))).length > 0)
const hash = createHash('sha256').update(await readFile(node)).digest('hex')
assert.equal(hash, NODE_RUNTIME_ASSETS[platform].executableSha256)

function assertContained(path) {
  const rel = relative(candidate, path)
  if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) throw new Error(`Candidate closure escapes: ${path}`)
}

if (!values.native) {
  const seen = new Set()
  async function walk(path) {
    if (linux && (await lstat(path)).isSymbolicLink()) throw new Error('A Linux install payload must not contain symbolic links: ' + path)
    const actual = await realpath(path)
    assertContained(actual)
    if (seen.has(actual)) return
    seen.add(actual)
    const entry = await lstat(actual)
    if (entry.isDirectory()) for (const name of await readdir(actual)) await walk(join(actual, name))
    else if (!entry.isFile()) throw new Error(`Unsupported candidate payload: ${actual}`)
  }
  await walk(candidate)
  const codexCatalog = await checkCodexCatalog(candidate)
  const web = edition === 'combined' ? await checkWebAssets(join(candidate, 'web')) : null
  const actual = execFileSync(join(candidate, linux ? 'swa' : 'swa.exe'), ['--version'], { encoding: 'utf8', windowsHide: true }).trim()
  assert.equal(actual, expected)
  for (const file of [linux ? 'install-swa.mjs' : 'install-swa.ps1', 'USAGE.md', 'LICENSE', 'ORCA_LICENSE', 'THIRD_PARTY_SWA.md']) assert.ok((await readFile(join(candidate, file))).length > 0)
  const result = execFileSync(node, ['--max-old-space-size=1024', import.meta.filename, '--candidate', candidate, '--native'], { encoding: 'utf8', windowsHide: true, env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1024' }, timeout: 30_000 })
  process.stdout.write(result)
  console.log(JSON.stringify({ candidate, source_revision: expected, platform, edition, legacy_edition: legacy, web_manifest: web, codex_catalog: codexCatalog, closure_paths: seen.size, native_authentication: 'NOT_RUN', functional_acceptance: 'NOT_RUN', gui_http_acceptance: 'NOT_RUN' }))
} else {
  assert.equal(process.version, 'v24.21.0')
  const requireRuntime = createRequire(join(runtime, 'package.json'))
  const packageJSON = JSON.parse(await readFile(join(runtime, 'package.json'), 'utf8'))
  assert.equal(packageJSON.type, 'commonjs')
  for (const file of ['host.cjs', 'client.cjs', 'controller-helper.cjs', 'native-cli-entry.cjs', 'pi-question-extension.mjs', 'pi-collaboration-extension.mjs', 'pi-project-extension.mjs', 'project-shell-entry.cjs', 'project-shell', 'strict-caller-probe.cjs', 'controller-inspection.cjs', ...(!linux ? ['controller-fault.exe', 'cli-fault-control.exe'] : []), 'task-result.cjs', 'journal-open.cjs', 'swa-provider-process-tree.cjs', 'daemon-entry.js', 'profile-state-writer-worker-entry.js', 'opencode-policy/server.js', 'opencode-policy/package.json']) await readFile(join(runtime, file))
  if (linux) {
    const { checkLinuxNative } = await import('./check-swa-linux-native.mjs')
    await checkLinuxNative(candidate)
  } else {
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
  const processTreeDirectory = dirname(requireRuntime.resolve('@vscode/windows-process-tree/package.json'))
  const processTreeBinary = await realpath(join(processTreeDirectory, 'build', 'Release', 'windows_process_tree.node'))
  assertContained(processTreeBinary)
  const loadedProcessTreeBinaries = Object.keys(requireRuntime.cache).filter(file => file.endsWith('.node') && /[\\/]windows_process_tree\.node$/i.test(file))
  assert.equal(loadedProcessTreeBinaries.length, 1)
  assert.equal((await realpath(loadedProcessTreeBinaries[0])).toLowerCase(), processTreeBinary.toLowerCase())
  const processTreeSha256 = createHash('sha256').update(await readFile(processTreeBinary)).digest('hex')
  let queryTimer
  const identityRows = await new Promise((resolveRows, reject) => {
    queryTimer = setTimeout(() => reject(new Error('Native identity snapshot timed out')), 5000)
    processes.getAllProcesses(rows => {
      clearTimeout(queryTimer)
      if (!Array.isArray(rows)) { reject(new Error('Native identity snapshot unavailable')); return }
      resolveRows(rows)
    }, 4)
  }).finally(() => clearTimeout(queryTimer))
  assert.ok(identityRows.length > 0)
  for (const row of identityRows) {
    assert.ok(row && typeof row === 'object')
    assert.ok(Number.isInteger(row.pid) && row.pid > 0 && row.pid <= 0xffffffff)
    assert.ok(Number.isInteger(row.ppid) && row.ppid >= 0 && row.ppid <= 0xffffffff)
    assert.equal(typeof row.name, 'string')
    assert.equal(row.creationTimeDiagnosticVersion, 2)
    assert.equal(row.creationTimeProvider, 'NtQuerySystemInformation')
    assert.equal(row.creationTimeSnapshotComplete, true)
    assert.ok(Number.isInteger(row.creationTimeNtStatus) && row.creationTimeNtStatus >= 0 && row.creationTimeNtStatus <= 0x7fffffff)
    if (row.creationTimeMs !== undefined) assert.ok(Number.isSafeInteger(row.creationTimeMs) && row.creationTimeMs > 0)
  }
  const selfRows = identityRows.filter(row => row.pid === process.pid)
  assert.equal(selfRows.length, 1)
  assert.equal(selfRows[0].creationTimeMs, creationTimeMs)
  const psutilLicense = await readFile(join(candidate, 'third-party-licenses', 'psutil@7.2.2', 'LICENSE'))
  assert.equal(psutilLicense.length, 1548)
  assert.equal(createHash('sha256').update(psutilLicense).digest('hex'), 'b89c063b3786e28e0c0a38f1931db61fed35e69dd2a2966fbecffee0f46c8d10')
  const security = requireRuntime('@orca/windows-security')
  const currentSid = security.currentUserSid()
  assert.match(currentSid, /^S-1-/)
  requireRuntime('@orca/windows-registry').getRegistryKey(0x80000001, 'Software')
  requireRuntime('@parcel/watcher')
  assertContained(await realpath(dirname(requireRuntime.resolve('node-pty/package.json'))))
  console.log(JSON.stringify({ native_node: process.version, native_pid: process.pid, native_creation_time_ms: creationTimeMs, provider_job_api: loaded.module.providerJobIsolationVersion, actual_empty_job: observed, job_descendant_test: 'NOT_RUN', identity_snapshot: { rows: identityRows.length, provider: selfRows[0].creationTimeProvider, version: selfRows[0].creationTimeDiagnosticVersion, complete: true, nt_status: selfRows[0].creationTimeNtStatus, self_identity_matches: true, loaded_addon_sha256: processTreeSha256, psutil_license_verified: true } }))
  }
}
