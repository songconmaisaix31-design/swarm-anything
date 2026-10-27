import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const keys = (value, expected) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort())
}
const pid = value => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff
const unsignedPID = value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff
const birth = value => Number.isSafeInteger(value) && value > 0
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const revision = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
const jobName = value => typeof value === 'string' && value.startsWith('Local\\SWAService') && uuid(value.slice('Local\\SWAService'.length))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const samePath = (left, right) => typeof left === 'string' && typeof right === 'string' && resolve(left).toLowerCase() === resolve(right).toLowerCase()

function ordinary(path, directory = false) {
  assert.ok(typeof path === 'string' && isAbsolute(path))
  assert.ok(samePath(realpathSync(path), path))
  for (let current = path; ; current = dirname(current)) {
    const info = lstatSync(current)
    assert.equal(info.isSymbolicLink(), false)
    assert.equal(current === path && !directory ? info.isFile() : info.isDirectory(), true)
    if (dirname(current) === current) break
  }
}

function inside(root, path) {
  const part = relative(root, path)
  return part !== '' && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part)
}

function stableBytes(path, maximum = 1024 * 1024) {
  ordinary(path)
  const handle = openSync(path, 'r')
  let bytes
  try {
    const before = fstatSync(handle)
    assert.ok(before.isFile() && before.size > 0 && before.size <= maximum)
    const storage = Buffer.alloc(before.size + 1)
    let used = 0
    while (used < storage.length) {
      const count = readSync(handle, storage, used, storage.length - used, null)
      if (count === 0) break
      used += count
    }
    bytes = storage.subarray(0, used)
    const after = fstatSync(handle)
    assert.equal(bytes.length, before.size)
    assert.deepEqual([after.dev, after.ino, after.size, after.mtimeMs, after.ctimeMs], [before.dev, before.ino, before.size, before.mtimeMs, before.ctimeMs])
    const current = statSync(path)
    assert.deepEqual([current.dev, current.ino, current.size, current.mtimeMs, current.ctimeMs], [before.dev, before.ino, before.size, before.mtimeMs, before.ctimeMs])
    ordinary(path)
  } finally {
    closeSync(handle)
  }
  return bytes
}

function stableJSON(path, expected) {
  const bytes = stableBytes(path)
  const digest = hash(bytes)
  if (expected !== undefined) {
    assert.ok(sha(expected))
    assert.equal(digest, expected)
  }
  return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), digest }
}

async function input() {
  const chunks = []
  let length = 0
  for await (const chunk of process.stdin) {
    length += chunk.length
    assert.ok(length <= 64 * 1024)
    chunks.push(chunk)
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
}

function addonPath(requireRuntime, installation, name, binary) {
  const packageFile = realpathSync(requireRuntime.resolve(name + '/package.json'))
  assert.ok(inside(installation, packageFile))
  const path = realpathSync(join(dirname(packageFile), 'build', 'Release', binary))
  ordinary(path)
  assert.ok(inside(installation, path))
  return path
}

function loadedAddon(requireRuntime, path) {
  const matches = Object.keys(requireRuntime.cache).filter(key => basename(key).toLowerCase() === basename(path).toLowerCase())
  assert.equal(matches.length, 1)
  assert.ok(samePath(realpathSync(matches[0]), path))
}

async function snapshot(native) {
  assert.equal(typeof native.getAllProcesses, 'function')
  assert.ok(Number.isSafeInteger(native.supportedProcessDataFlags) && (native.supportedProcessDataFlags & 4) === 4)
  const rows = await new Promise((resolveRows, reject) => {
    const timer = setTimeout(() => reject(new Error('actual_snapshot_unavailable')), 5000)
    native.getAllProcesses(value => {
      clearTimeout(timer)
      if (!Array.isArray(value)) { reject(new Error('actual_snapshot_unavailable')); return }
      resolveRows(value)
    }, 4)
  })
  // 原 callback 正常返回后再校验，保持 native wrapper 队列释放。
  assert.ok(rows.length > 0)
  let status
  for (const row of rows) {
    keys(row, ['pid', 'ppid', 'name', 'creationTimeDiagnosticVersion', 'creationTimeProvider', 'creationTimeNtStatus', 'creationTimeSnapshotComplete', ...(Object.hasOwn(row, 'creationTimeMs') ? ['creationTimeMs'] : [])])
    assert.ok(pid(row.pid) && unsignedPID(row.ppid) && typeof row.name === 'string')
    assert.equal(row.creationTimeDiagnosticVersion, 2)
    assert.equal(row.creationTimeProvider, 'NtQuerySystemInformation')
    assert.equal(row.creationTimeSnapshotComplete, true)
    assert.ok(Number.isInteger(row.creationTimeNtStatus) && row.creationTimeNtStatus >= 0 && row.creationTimeNtStatus <= 0x7fffffff)
    if (status === undefined) status = row.creationTimeNtStatus
    assert.equal(row.creationTimeNtStatus, status)
    if (Object.hasOwn(row, 'creationTimeMs')) assert.ok(birth(row.creationTimeMs))
  }
  return rows
}

async function main() {
  assert.equal(process.platform, 'win32')
  assert.equal(process.arch, 'x64')
  assert.equal(process.versions.node, '24.21.0')
  const p = await input()
  keys(p, ['installation', 'source_revision', 'data_root', 'endpoint', 'expected_runtime_id', 'agent', 'source_home', 'ready_file', 'ready_sha256', 'proof_file', 'proof_sha256', 'launch_file', 'launch_sha256', 'daemon_sha256'])
  assert.ok(revision(p.source_revision) && uuid(p.expected_runtime_id))
  assert.ok(p.agent === 'pi' || p.agent === 'opencode')
  for (const path of [p.installation, p.data_root, p.source_home]) ordinary(path, true)
  assert.ok(samePath(realpathSync(process.execPath), join(p.installation, 'node', 'node.exe')))
  const version = new TextDecoder('utf-8', { fatal: true }).decode(stableBytes(join(p.installation, 'VERSION'), 4096))
  assert.equal(version.trim(), p.source_revision)
  const ready = stableJSON(p.ready_file, p.ready_sha256).value
  const proof = stableJSON(p.proof_file, p.proof_sha256).value
  const launch = stableJSON(p.launch_file, p.launch_sha256).value
  const daemonPath = join(p.data_root, 'daemon', 'daemon-v49.pid')
  const daemonRead = stableJSON(daemonPath, p.daemon_sha256)
  const daemon = daemonRead.value
  assert.ok(ready && typeof ready === 'object' && daemon && typeof daemon === 'object')
  keys(ready.readiness, ['runtimeId', 'dataRoot', 'node'])
  assert.equal(ready.ok, true)
  assert.equal(ready.http, p.endpoint)
  assert.ok(samePath(ready.data_root, p.data_root) && samePath(ready.install_root, p.installation))
  assert.ok(samePath(ready.readiness.dataRoot, p.data_root) && samePath(ready.readiness.node, process.execPath))
  assert.equal(ready.readiness.runtimeId, p.expected_runtime_id)
  assert.ok(pid(ready.runtime_pid) && pid(ready.server_pid) && pid(daemon.pid) && uuid(daemon.launchNonce))
  const sourceKey = p.agent === 'pi' ? 'pi_source_home' : 'opencode_api_key_home'
  keys(launch, ['installation', 'source_revision', 'data_root', 'endpoint', 'serve_pid', sourceKey])
  assert.ok(samePath(launch.installation, p.installation) && samePath(launch.data_root, p.data_root) && samePath(launch[sourceKey], p.source_home))
  assert.equal(launch.source_revision, p.source_revision)
  assert.equal(launch.endpoint, p.endpoint)
  assert.ok(pid(launch.serve_pid))
  const job = daemon.swa_service_job
  keys(job, ['name', 'serve_pid', 'serve_created_at_ms', 'data_root', 'install_root', 'source_revision', 'daemon_pid', 'daemon_created_at_ms', 'daemon_session'])
  assert.ok(jobName(job.name) && birth(job.serve_created_at_ms) && birth(job.daemon_created_at_ms))
  assert.equal(job.serve_pid, launch.serve_pid)
  assert.equal(job.daemon_pid, daemon.pid)
  assert.equal(job.daemon_session, daemon.launchNonce)
  assert.equal(job.source_revision, p.source_revision)
  assert.ok(samePath(job.data_root, p.data_root) && samePath(job.install_root, p.installation))
  keys(proof, ['source_revision', 'runtime_id', 'data_root', 'health', 'service_job_name', 'members', 'job_owner_and_dacl_verified', 'observed_at'])
  assert.equal(proof.source_revision, p.source_revision)
  assert.equal(proof.runtime_id, p.expected_runtime_id)
  assert.ok(samePath(proof.data_root, p.data_root))
  assert.equal(proof.service_job_name, job.name)
  assert.equal(proof.job_owner_and_dacl_verified, true)
  keys(proof.health, ['schema_version', 'status', 'service'])
  assert.deepEqual(proof.health, { schema_version: 1, status: 'ok', service: 'astrocyte' })
  assert.ok(typeof proof.observed_at === 'string' && new Date(proof.observed_at).toISOString() === proof.observed_at)
  assert.ok(Array.isArray(proof.members) && proof.members.length === 4)
  const roles = [
    { role: 'serve', pid: launch.serve_pid, name: 'swa.exe', birth: job.serve_created_at_ms },
    { role: 'runtime', pid: ready.runtime_pid, name: 'node.exe', parent: launch.serve_pid },
    { role: 'server', pid: ready.server_pid, name: 'server.exe', parent: launch.serve_pid },
    { role: 'daemon', pid: daemon.pid, name: 'node.exe', birth: job.daemon_created_at_ms },
  ]
  assert.equal(new Set(roles.map(row => row.pid)).size, 4)
  const baseline = new Map()
  for (const member of proof.members) {
    keys(member, ['role', 'pid', 'creation_time_ms', 'name', 'parent_pid', 'actual_named_job_membership'])
    const role = roles.find(row => row.role === member.role)
    assert.ok(role && !baseline.has(member.role))
    assert.equal(member.pid, role.pid)
    assert.ok(birth(member.creation_time_ms) && unsignedPID(member.parent_pid) && typeof member.name === 'string' && member.name.toLowerCase() === role.name)
    assert.equal(member.actual_named_job_membership, true)
    if (role.birth !== undefined) assert.equal(member.creation_time_ms, role.birth)
    if (role.parent !== undefined) assert.equal(member.parent_pid, role.parent)
    baseline.set(member.role, member)
  }
  const requireRuntime = createRequire(join(p.installation, 'runtime', 'package.json'))
  const nativePath = addonPath(requireRuntime, p.installation, '@vscode/windows-process-tree', 'windows_process_tree.node')
  const securityPath = addonPath(requireRuntime, p.installation, '@orca/windows-security', 'orca_windows_security.node')
  const native = requireRuntime('@vscode/windows-process-tree')
  const security = requireRuntime('@orca/windows-security')
  const user = security.currentUserSid()
  assert.ok(typeof user === 'string' && /^S-1-/.test(user))
  loadedAddon(requireRuntime, nativePath)
  loadedAddon(requireRuntime, securityPath)
  const rows = await snapshot(native)
  const members = []
  for (const role of roles) {
    const matches = rows.filter(row => row.pid === role.pid)
    assert.equal(matches.length, 1)
    const row = matches[0], expected = baseline.get(role.role)
    assert.ok(birth(row.creationTimeMs))
    assert.equal(row.creationTimeMs, expected.creation_time_ms)
    assert.equal(row.name.toLowerCase(), role.name)
    if (role.parent !== undefined) assert.equal(row.ppid, role.parent)
    const actual = security.readServiceJobMember(job.name, role.pid)
    keys(actual, ['name', 'pid', 'creationTimeMs', 'ownerSid', 'protected', 'aces'])
    assert.equal(actual.name, job.name)
    assert.equal(actual.pid, role.pid)
    assert.equal(actual.creationTimeMs, row.creationTimeMs)
    assert.equal(actual.ownerSid, user)
    assert.equal(actual.protected, true)
    assert.ok(Array.isArray(actual.aces))
    const trustees = new Set([user, 'S-1-5-18'])
    assert.equal(actual.aces.length, trustees.size)
    for (const ace of actual.aces) {
      keys(ace, ['sid', 'mask', 'flags'])
      assert.equal(ace.mask, 0x1f003f)
      assert.equal(ace.flags, 0)
      assert.ok(trustees.delete(ace.sid))
    }
    assert.equal(trustees.size, 0)
    members.push({ role: role.role, pid: row.pid, creation_time_ms: row.creationTimeMs, name: row.name, parent_pid: row.ppid, actual_named_job_membership: true })
  }
  // 原绑定文件及 daemon nonce 在本次观察结束时仍须保持；不从历史补身份。
  stableJSON(p.ready_file, p.ready_sha256)
  stableJSON(p.proof_file, p.proof_sha256)
  stableJSON(p.launch_file, p.launch_sha256)
  assert.equal(stableJSON(daemonPath, p.daemon_sha256).digest, daemonRead.digest)
  loadedAddon(requireRuntime, nativePath)
  loadedAddon(requireRuntime, securityPath)
  const result = { source_revision: p.source_revision, runtime_id: p.expected_runtime_id, data_root: p.data_root, health: proof.health, service_job_name: job.name, members, job_owner_and_dacl_verified: true, observed_at: new Date().toISOString() }
  const output = JSON.stringify(result) + '\n'
  assert.ok(Buffer.byteLength(output) <= 64 * 1024)
  process.stdout.write(output)
}

main().catch(() => {
  process.stderr.write('windows_service_identity_failed\n')
  process.exitCode = 1
})
