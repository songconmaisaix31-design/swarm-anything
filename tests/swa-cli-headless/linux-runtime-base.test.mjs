import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { chmod, mkdir, mkdtemp, readFile, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createInterface } from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/linux-runtime-base'), { recursive: true })
const directory = await mkdtemp(join(root, '.verification/linux-runtime-base/run-'))
function compiled(name, entry) {
  const output = join(directory, `${name}.cjs`)
  buildSync({ entryPoints: [join(root, entry)], outfile: output, platform: 'node', format: 'cjs', bundle: true, nodePaths: [join(root, 'runtime/swa-orca/node_modules')] })
  return createRequire(output)(output)
}
const identity = compiled('process', 'third_party/orca-v1.4.230/src/main/daemon/swa-linux-process-identity.ts')
const security = compiled('security', 'runtime/swa-orca/src/private-posix-security.ts')
const linux = process.platform === 'linux'

test('Linux identity fences its actual process and real child without fabricated timestamps', { skip: !linux }, async () => {
  const parent = identity.readSwaLinuxProcess(process.pid)
  assert.equal(parent.pid, process.pid)
  assert.equal(parent.owner_uid, String(process.getuid()))
  assert.match(parent.boot_id, /^[0-9a-f-]{36}$/)
  const child = spawn(process.execPath, ['-e', 'process.stdin.resume()'], { stdio: ['pipe', 'ignore', 'pipe'] })
  await once(child, 'spawn')
  const closed = once(child, 'close')
  try {
    const observed = identity.readSwaLinuxProcess(child.pid)
    assert.equal(observed.boot_id, parent.boot_id)
    identity.requireSwaLinuxAncestor(observed, parent)
    assert.throws(() => identity.requireSwaLinuxProcess({ ...observed, start_ticks: String(BigInt(observed.start_ticks) + 1n) }), /incarnation changed/)
    assert.throws(() => identity.requireSwaLinuxProcess({ ...observed, owner_uid: String(process.getuid() + 1) }), /incarnation changed/)
    assert.throws(() => identity.requireSwaLinuxAncestor(parent, observed), /not owned|incomplete|owner changed/)
  } finally {
    child.stdin.end()
    const [code, signal] = await closed
    assert.equal(code, 0)
    assert.equal(signal, null)
  }
  assert.throws(() => identity.readSwaLinuxProcess(child.pid), /ENOENT|ESRCH/)
  assert.equal(identity.isSwaLinuxProcessAbsent(child.pid), true)
})

test('Linux process absence requires its actual proc directory to disappear, including an unreaped zombie', { skip: !linux }, async () => {
  const parent = spawn('python3', ['-u', '-c', 'import os,sys\npid=os.fork()\nif pid == 0: os._exit(0)\nprint(pid, flush=True)\nsys.stdin.read()\nos.waitpid(pid,0)'], { stdio: ['pipe', 'pipe', 'pipe'] })
  const lines = createInterface({ input: parent.stdout })
  const announced = once(lines, 'line')
  const closed = once(parent, 'close')
  const [value] = await announced
  const pid = Number(value)
  assert.ok(Number.isSafeInteger(pid) && pid > 0)
  try {
    const deadline = Date.now() + 5000
    while (!execFileSync('/bin/ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' }).trim().startsWith('Z')) {
      assert.ok(Date.now() < deadline, 'The actual child did not reach its unreaped zombie state')
      await delay(20)
    }
    assert.throws(() => identity.readSwaLinuxProcess(pid))
    const incarnation = identity.readSwaLinuxProcessIncarnation(pid)
    assert.equal(incarnation.pid, pid)
    identity.requireSwaLinuxIncarnation(incarnation)
    assert.equal(identity.isSwaLinuxProcessAbsent(pid), false)
  } finally {
    parent.stdin.end()
    const [code, signal] = await closed
    lines.close()
    assert.equal(code, 0)
    assert.equal(signal, null)
  }
  assert.equal(identity.isSwaLinuxProcessAbsent(pid), true)
})

test('Linux private paths use owner-only modes and refuse redirected or existing files', { skip: !linux }, async () => {
  const privateRoot = join(directory, 'private')
  await mkdir(privateRoot, { mode: 0o700 })
  security.requirePosixPrivatePath(privateRoot, true)
  const file = join(privateRoot, 'public-rule-input.txt')
  security.createPosixPrivateFile(file, Buffer.from('公开的权限检查输入\n'))
  assert.equal(await readFile(file, 'utf8'), '公开的权限检查输入\n')
  assert.throws(() => security.createPosixPrivateFile(file, Buffer.from('must not overwrite')), /EEXIST/)
  await chmod(file, 0o644)
  assert.throws(() => security.requirePosixPrivatePath(file, false), /permissions changed/)
  await chmod(file, 0o600)
  const alias = join(directory, 'redirected-private')
  await symlink(privateRoot, alias)
  assert.throws(() => security.requirePosixPrivatePath(alias, true), /unavailable|redirected/)
  await chmod(privateRoot, 0o755)
  assert.throws(() => security.createPosixPrivateFile(join(privateRoot, 'rejected.txt'), Buffer.from('public')), /permissions changed/)
  await assert.rejects(readFile(join(privateRoot, 'rejected.txt')), { code: 'ENOENT' })
})
