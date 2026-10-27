import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

// 必须提供实际编译的 node-pty 包目录；没有能力时不伪造成功或替换 native API。
const packageDirectory = process.env.SWA_LINUX_PTY_PACKAGE
const installInput = process.env.SWA_LINUX_INSTALL_ROOT
if (process.platform !== 'linux' || !packageDirectory && !installInput) throw new Error('Linux and an actual compiled SWA_LINUX_PTY_PACKAGE or installed SWA_LINUX_INSTALL_ROOT are required')
const root = fileURLToPath(new URL('../../', import.meta.url))
let installation
if (installInput) {
  installation = await realpath(installInput)
  const expected = process.env.SWA_EXPECTED_SOURCE_REVISION
  assert.match(expected ?? '', /^[a-f0-9]{40}$/)
  assert.equal(await realpath(process.execPath), await realpath(join(installation, 'node/node')))
  assert.equal((await readFile(join(installation, 'VERSION'), 'utf8')).trim(), expected)
  assert.equal(execFileSync(join(installation, 'swa'), ['--version'], { encoding: 'utf8' }).trim(), expected)
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), expected)
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(), '', 'Installed checks require the matching clean source for the external identity observer')
  console.log(JSON.stringify({ verification_mode: 'installed-original-runtime', installation, source_revision: expected, native_agent_acceptance: 'NOT_RUN' }))
} else console.log(JSON.stringify({ verification_mode: 'development-source', native_agent_acceptance: 'NOT_RUN' }))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/linux-provider-tree'), { recursive: true })
const directory = await mkdtemp(join(root, '.verification/linux-provider-tree/run-'))
if (!installation) {
  await mkdir(join(directory, 'node_modules'))
  await symlink(await realpath(packageDirectory), join(directory, 'node_modules/node-pty'), 'dir')
}
const host = join(root, 'third_party/orca-v1.4.230/src/packages/process-host')
const pkg = JSON.parse(await readFile(join(host, 'package.json'), 'utf8'))
const alias = Object.fromEntries(Object.entries(pkg.exports).map(([name, value]) => [name === '.' ? '@orca/process-host' : '@orca/process-host' + name.slice(1), resolve(host, value['orca-source'])]))
const compiled = new Map()
for (const [name, entry] of [
  ['entry', 'runtime/swa-orca/src/native-cli-entry.ts'],
  ['tree', 'third_party/orca-v1.4.230/src/main/provider-process/swa-provider-process-tree.ts'],
  ['managed', 'third_party/orca-v1.4.230/src/main/provider-process/managed-provider-process.ts'],
  ['identity', 'third_party/orca-v1.4.230/src/main/daemon/swa-linux-process-identity.ts']
]) {
  if (installation && name !== 'identity') {
    const filename = { entry: 'native-cli-entry.cjs', tree: 'swa-provider-process-tree.cjs', managed: 'managed-provider-process.cjs' }[name]
    compiled.set(name, await realpath(join(installation, 'runtime', filename)))
    continue
  }
  const output = join(directory, name + '.cjs')
  buildSync({ entryPoints: [join(root, entry)], outfile: output, bundle: true, platform: 'node', target: 'node24', format: 'cjs', alias, conditions: ['orca-source'], nodePaths: [join(root, 'runtime/swa-orca/node_modules')], external: ['node-pty', '@vscode/windows-process-tree', '@orca/windows-security', '@orca/windows-registry'], banner: { js: 'var __swaModuleUrl = require("node:url").pathToFileURL(__filename).href;' }, define: { 'import.meta.url': '__swaModuleUrl' } })
  compiled.set(name, output)
}
const { SwaProviderProcessTree } = createRequire(compiled.get('tree'))(compiled.get('tree'))
const { spawnManagedProviderProcess } = createRequire(compiled.get('managed'))(compiled.get('managed'))
const identity = createRequire(compiled.get('identity'))(compiled.get('identity'))
const native = createRequire(installation ? join(installation, 'runtime/package.json') : join(directory, 'test.cjs'))('node-pty/lib/utils').loadNativeModule('pty').module
assert.equal(native.providerLinuxIsolationVersion, 1)
native.enableSwaChildSubreaper()
const python = await realpath('/usr/bin/python3')
const fixture = join(root, 'tests/swa-cli-headless/linux-provider-process-fixture.py')
const timeout = async (promise, message, ms = 15_000) => {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms) })]) }
  finally { clearTimeout(timer) }
}
function linesFrom(stream) {
  const lines = [], listeners = new Set()
  const reader = createInterface({ input: stream })
  reader.on('line', line => { lines.push(line); for (const listener of [...listeners]) listener(line) })
  return { lines, wait(prefix) {
    const seen = lines.find(line => line.startsWith(prefix))
    if (seen) return Promise.resolve(seen)
    return timeout(new Promise(resolve => { const listener = line => { if (line.startsWith(prefix)) { listeners.delete(listener); resolve(line) } }; listeners.add(listener) }), 'Actual process fixture did not emit ' + prefix)
  } }
}
async function worker(onMessage) {
  const tree = new SwaProviderProcessTree()
  let managed
  managed = spawnManagedProviderProcess({ command: process.execPath, args: [compiled.get('entry'), JSON.stringify({ command: python, args: ['-u', fixture] })], cwd: directory, swaJobIPC: true }, { site: 'linux-kernel-fixture', acceptClose: result => result.root === 'exited' && (result.tree === 'exited' || managed.processless) })
  assert.equal(managed.supervised, false)
  const output = linesFrom(managed.child.stdout), messages = []
  managed.child.on('message', message => { messages.push(message); onMessage?.(message, managed) })
  tree.bind(managed.child, () => ({ observed: managed.rootExitObserved, processless: managed.processless }), true)
  await timeout(tree.ready(), 'Actual native fixture readiness was not confirmed')
  const nativePid = Number((await output.wait('ROOT ')).slice(5))
  assert.equal(tree.readObservation().platform, 'linux')
  assert.equal(tree.readObservation().nativeCLI.pid, nativePid)
  assert.equal(tree.readFinalObservation(), null)
  return { tree, managed, output, messages, nativePid, rootIdentity: tree.readObservation().root }
}
async function waitMessage(actual, type) {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const found = actual.messages.find(message => message.type === type)
    if (found) return found
    await delay(20)
  }
  throw new Error('Actual bootstrap did not emit ' + type)
}
async function cleanupRejectedFixture(actual) {
  const deadline = Date.now() + 5000
  while (!identity.isSwaLinuxProcessAbsent(actual.nativePid) && Date.now() < deadline) await delay(20)
  assert.equal(identity.isSwaLinuxProcessAbsent(actual.nativePid), true)
  const rootIdentity = actual.rootIdentity
  identity.requireSwaLinuxIncarnation(rootIdentity)
  const handle = native.openSwaPidfd(rootIdentity.pid)
  try { identity.requireSwaLinuxIncarnation(rootIdentity); native.signalSwaPidfd(handle, 'SIGTERM') }
  finally { native.closeSwaPidfd(handle) }
  await timeout(actual.managed.exitPromise, 'Explicit test bootstrap cleanup did not exit')
  assert.equal(actual.tree.treeVerdict, 'unverifiable')
  assert.equal(await actual.tree.reap(), 'unverifiable')
  assert.equal(actual.tree.readFinalObservation(), null)
}
async function closed(worker) {
  const result = await timeout(worker.managed.close(worker.tree), 'Actual full-tree cleanup was not confirmed', 20_000)
  assert.deepEqual(result, { root: 'exited', tree: 'exited' }, worker.managed.stderrTail())
  assert.equal(worker.tree.treeVerdict, 'exited')
  assert.equal(identity.isSwaLinuxProcessAbsent(worker.nativePid), true)
  assert.equal(identity.isSwaLinuxProcessAbsent(worker.managed.child.pid), true)
  const proof = worker.messages.find(message => message.type === 'swa_linux_fulltreeclosed')
  assert.ok(proof)
  assert.equal(proof.native_cli.state, 'created')
  assert.equal(proof.native_cli.identity.pid, worker.nativePid)
  assert.ok(proof.observations[1].monotonic_ms > proof.observations[0].monotonic_ms)
  const final = worker.tree.readFinalObservation()
  assert.equal(final.platform, 'linux')
  assert.deepEqual(final.observation.fullTreeProof, proof)
  assert.equal(final.acknowledgement_delivered, true)
  assert.equal(final.root_exit_observed, true)
  assert.equal(final.root_absent, true)
  final.observation.fullTreeProof.observations[0].state = 'changed-by-consumer'
  assert.equal(worker.tree.readFinalObservation().observation.fullTreeProof.observations[0].state, 'no-children')
  return proof
}

test('actual Linux custody admits one native process and closes after two kernel no-child observations', async () => {
  const actual = await worker()
  actual.managed.child.stdin.write('public-input\n')
  assert.equal(await actual.output.wait('ECHO '), 'ECHO public-input')
  const proof = await closed(actual)
  assert.equal(proof.forced, false)
})

test('dedicated Linux bootstrap gives native children private default file modes', async () => {
  const savedMask = process.umask(0o022)
  let managed, tree, closeCompleted = false
  try {
    const ordinaryFixture = join(directory, 'ordinary-node-private-modes.mjs')
    // 普通文件控制不设置子进程 mask，必须实际继承生产 bootstrap 的设置。
    await writeFile(ordinaryFixture, `import { closeSync, mkdirSync, openSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const target = join(process.argv[2], 'default-created-directory')
mkdirSync(target)
const file = join(target, 'public-text.txt')
const fd = openSync(file, 'wx')
try { writeFileSync(fd, 'public ordinary filesystem fixture\\n') } finally { closeSync(fd) }
console.log('PUBLIC_MODES ' + JSON.stringify({ pid: process.pid, uid: process.getuid(), mask: process.umask(), directory: statSync(target).mode & 0o777, file: statSync(file).mode & 0o777 }))
process.stdin.on('end', () => console.log('PUBLIC_EOF'))
process.stdin.resume()
`, { mode: 0o600, flag: 'wx' })
    tree = new SwaProviderProcessTree()
    managed = spawnManagedProviderProcess({ command: process.execPath, args: [compiled.get('entry'), JSON.stringify({ command: ordinaryFixture, args: [directory] })], cwd: directory, swaJobIPC: true }, { site: 'linux-private-creation-fixture', acceptClose: result => result.root === 'exited' && result.tree === 'exited' })
    const output = linesFrom(managed.child.stdout), messages = []
    managed.child.on('message', message => messages.push(message))
    tree.bind(managed.child, () => ({ observed: managed.rootExitObserved, processless: managed.processless }), true)
    await timeout(tree.ready(), 'Actual ordinary Node fixture readiness was not confirmed')
    const observed = JSON.parse((await output.wait('PUBLIC_MODES ')).slice('PUBLIC_MODES '.length))
    assert.equal(observed.pid, tree.readObservation().nativeCLI.pid)
    assert.equal(observed.uid, process.getuid())
    assert.equal(observed.mask, 0o077)
    assert.equal(observed.directory, 0o700)
    assert.equal(observed.file, 0o600)
    assert.equal(process.umask(), 0o022, 'The dedicated bootstrap must not change its parent mask')
    const stdoutEnded = once(managed.child.stdout, 'end')
    managed.child.stdin.end()
    assert.equal(await output.wait('PUBLIC_EOF'), 'PUBLIC_EOF')
    const proof = await closed({ tree, managed, output, messages, nativePid: observed.pid })
    closeCompleted = true
    await timeout(stdoutEnded, 'Actual ordinary Node fixture stdout did not reach EOF')
    assert.equal(proof.forced, false)
  } finally {
    try {
      if (managed && !closeCompleted) {
        const result = await timeout(managed.close(tree), 'Actual ordinary Node fixture cleanup remains unknown', 20_000)
        assert.deepEqual(result, { root: 'exited', tree: 'exited' })
      }
    } finally { process.umask(savedMask) }
  }
})

test('actual setsid and double-fork descendants survive root exit until their own custody reaps them', async () => {
  const actual = await worker()
  actual.managed.child.stdin.write('fork\n')
  const leaf = Number((await actual.output.wait('LEAF ')).slice(5))
  const observed = identity.readSwaLinuxProcessIncarnation(leaf)
  actual.managed.child.stdin.write('leave\n')
  await delay(200)
  identity.requireSwaLinuxIncarnation(observed)
  assert.equal(actual.tree.treeVerdict, 'unverifiable')
  const proof = await closed(actual)
  assert.equal(proof.forced, true)
  assert.equal(identity.isSwaLinuxProcessAbsent(leaf), true)
})

test('stopping one actual Linux Worker preserves a separate live sibling Worker', async () => {
  const first = await worker(), second = await worker()
  first.managed.child.stdin.write('fork\n')
  const leaf = Number((await first.output.wait('LEAF ')).slice(5))
  try {
    await closed(first)
    assert.equal(identity.isSwaLinuxProcessAbsent(leaf), true)
    identity.requireSwaLinuxIncarnation(second.tree.readObservation().nativeState.identity)
    second.managed.child.stdin.write('sibling-still-live\n')
    assert.equal(await second.output.wait('ECHO '), 'ECHO sibling-still-live')
  } finally { await closed(second) }
})

test('an actual bootstrap spawn failure is processless and produces no tree proof', async () => {
  const tree = new SwaProviderProcessTree()
  const managed = spawnManagedProviderProcess({ command: join(directory, 'nonexistent-node'), args: [], swaJobIPC: true }, { site: 'linux-kernel-processless' })
  tree.bind(managed.child, () => ({ observed: managed.rootExitObserved, processless: managed.processless }), true)
  await timeout(managed.exitPromise, 'Actual ENOENT spawn did not settle')
  assert.equal(managed.processless, true)
  assert.equal(managed.child.pid, undefined)
  const result = await managed.close(tree)
  assert.deepEqual(result, { root: 'exited', tree: null })
  assert.equal(tree.treeVerdict, 'unverifiable')
  assert.equal(tree.readFinalObservation(), null)
})

test('actual EACCES native spawn settles not-created while the existing bootstrap still owes its full tree proof', async () => {
  const tree = new SwaProviderProcessTree()
  let managed
  managed = spawnManagedProviderProcess({ command: process.execPath, args: [compiled.get('entry'), JSON.stringify({ command: fixture, args: [] })], cwd: directory, swaJobIPC: true }, { site: 'linux-kernel-native-spawn-error', acceptClose: result => result.root === 'exited' && result.tree === 'exited' })
  const messages = []
  managed.child.on('message', message => messages.push(message))
  tree.bind(managed.child, () => ({ observed: managed.rootExitObserved, processless: managed.processless }), true)
  await assert.rejects(timeout(tree.ready(), 'Actual EACCES spawn did not settle'), /did not create|did not start/)
  const result = await timeout(managed.close(tree), 'Existing bootstrap did not prove its cleanup')
  assert.deepEqual(result, { root: 'exited', tree: 'exited' }, managed.stderrTail())
  assert.equal(managed.processless, false)
  const proof = messages.find(message => message.type === 'swa_linux_fulltreeclosed')
  assert.equal(proof.native_cli.state, 'not-created')
  assert.equal(proof.native_cli.reason, 'spawn-error')
  assert.equal(proof.native_cli.spawn_error_code, 'EACCES')
  assert.equal('identity' in proof.native_cli, false)
})

test('real stdin stop before admission never spawns a native process and still proves the existing bootstrap cleanup', async () => {
  const tree = new SwaProviderProcessTree()
  const managed = spawnManagedProviderProcess({ command: process.execPath, args: [compiled.get('entry'), JSON.stringify({ command: python, args: ['-u', fixture] })], cwd: directory, swaJobIPC: true }, { site: 'linux-kernel-stop-before-spawn' })
  const output = linesFrom(managed.child.stdout), messages = []
  managed.child.on('message', message => messages.push(message))
  managed.child.stdin.end()
  // 未发送准入，真实 native 不可能开始；让实际 EOF 在子进程启动后到达。
  await delay(250)
  tree.bind(managed.child, () => ({ observed: managed.rootExitObserved, processless: managed.processless }), true)
  await assert.rejects(tree.ready(), /did not create|did not start/)
  const result = await managed.close(tree)
  assert.deepEqual(result, { root: 'exited', tree: 'exited' })
  assert.equal(managed.processless, false)
  const proof = messages.find(message => message.type === 'swa_linux_fulltreeclosed')
  assert.equal(proof.native_cli.state, 'not-created')
  assert.equal(proof.native_cli.reason, 'stopped-before-spawn')
  assert.equal(output.lines.some(line => line.startsWith('ROOT ')), false)
})

test('actual owner IPC loss performs owned cleanup and cannot publish a full-tree receipt to its disconnected owner', async () => {
  const actual = await worker()
  actual.managed.child.stdin.write('fork\n')
  const leaf = Number((await actual.output.wait('LEAF ')).slice(5))
  actual.managed.child.disconnect()
  actual.managed.child.stdin.end()
  await timeout(actual.managed.exitPromise, 'Owner-lost bootstrap did not finish its owned cleanup')
  assert.equal(identity.isSwaLinuxProcessAbsent(leaf), true)
  assert.equal(identity.isSwaLinuxProcessAbsent(actual.nativePid), true)
  assert.equal(actual.messages.some(message => message.type === 'swa_linux_fulltreeclosed'), false)
  assert.equal(await actual.tree.reap(), 'unverifiable')
  assert.equal(actual.tree.readFinalObservation(), null)
})

test('actual pre-admission IPC rejects changed boot, ticks, UID and owner without launching the native fixture', async () => {
  for (const field of ['boot_id', 'start_ticks', 'owner_uid', 'pid']) {
    const child = spawn(process.execPath, [compiled.get('entry'), JSON.stringify({ command: python, args: ['-u', fixture] })], { cwd: directory, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })
    await once(child, 'spawn')
    const exited = once(child, 'exit'), output = linesFrom(child.stdout), errors = linesFrom(child.stderr)
    const original = identity.readSwaLinuxProcessIncarnation(process.pid)
    const changed = { ...original, [field]: field === 'boot_id' ? randomUUID() : field === 'pid' ? child.pid : String(BigInt(original[field]) + 1n) }
    child.send({ type: 'swa_linux_admit', custody_id: randomUUID(), owner: changed, root: identity.readSwaLinuxProcessIncarnation(child.pid) })
    await errors.wait('{"code":"swa_linux_custody_unknown"')
    child.stdin.end()
    child.disconnect()
    const [code, signal] = await timeout(exited, 'Rejected actual bootstrap did not exit')
    assert.equal(code, 1)
    assert.equal(signal, null)
    assert.equal(identity.isSwaLinuxProcessAbsent(child.pid), true)
    assert.equal(output.lines.some(line => line.startsWith('ROOT ')), false)
  }
})

test('a real early ACK is rejected and retains unknown until separate explicit test cleanup', async () => {
  const actual = await worker()
  const observed = actual.tree.readObservation()
  actual.managed.child.send({ type: 'swa_linux_fulltree_ack', custody_id: observed.custody_id, owner: observed.owner, root: observed.root, stop_id: randomUUID() })
  await waitMessage(actual, 'swa_linux_custody_failed')
  await assert.rejects(actual.managed.close(actual.tree), /rejected its Linux custody/)
  assert.equal(await actual.tree.reap(), 'unverifiable')
  assert.equal(actual.tree.treeVerdict, 'unverifiable')
  assert.equal(actual.messages.some(message => message.type === 'swa_linux_fulltreeclosed'), false)
  assert.equal(actual.tree.readFinalObservation(), null)
  // 测试单独清理自己的已无 native child 的拒绝 bootstrap，不把此操作记为产品释放。
  await cleanupRejectedFixture(actual)
})

test('real IPC disconnect between native full-tree proof and parent ACK keeps the old proof unknown', async () => {
  const actual = await worker((message, managed) => { if (message.type === 'swa_linux_fulltreeclosed') managed.child.disconnect() })
  const result = await timeout(actual.managed.close(actual.tree), 'Disconnected actual cleanup did not settle')
  assert.equal(result.tree, 'unverifiable')
  assert.equal(actual.tree.treeVerdict, 'unverifiable')
  assert.ok(actual.messages.some(message => message.type === 'swa_linux_fulltreeclosed'))
  assert.equal(actual.tree.readFinalObservation(), null)
  assert.equal(identity.isSwaLinuxProcessAbsent(actual.nativePid), true)
  assert.equal(await actual.tree.reap(), 'unverifiable')
})

test('a real duplicate admission after proof cannot be recovered by a later otherwise valid ACK', async () => {
  const actual = await worker((message, managed) => {
    if (message.type === 'swa_linux_fulltreeclosed') managed.child.send({ type: 'swa_linux_admit', custody_id: message.custody_id, owner: message.owner, root: message.root })
  })
  await assert.rejects(timeout(actual.managed.close(actual.tree), 'Late-invalid actual close did not return unknown'), /rejected its Linux custody/)
  await waitMessage(actual, 'swa_linux_custody_failed')
  assert.ok(actual.messages.some(message => message.type === 'swa_linux_fulltreeclosed'))
  assert.equal(actual.tree.treeVerdict, 'unverifiable')
  assert.equal(actual.tree.readFinalObservation(), null)
  await cleanupRejectedFixture(actual)
})
