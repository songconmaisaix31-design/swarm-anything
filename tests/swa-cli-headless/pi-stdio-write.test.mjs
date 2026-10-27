import assert from 'node:assert/strict'
import { closeSync, existsSync, openSync, unlinkSync } from 'node:fs'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { PassThrough } from 'node:stream'
import { finished } from 'node:stream/promises'
import { setImmediate as immediate } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/pi-stdio-write'), { recursive: true, mode: 0o700 })
const directory = await mkdtemp(join(root, '.verification/pi-stdio-write/run-'))
const output = join(directory, 'queue.cjs')
buildSync({ entryPoints: [join(root, 'third_party/orca-v1.4.230/src/main/provider-process/provider-stdio-write-queue.ts')], outfile: output, bundle: true, platform: 'node', format: 'cjs', target: 'node24', logLevel: 'silent' })
const { ProviderStdioWriteQueue, ProviderWriteAdmissionError } = createRequire(output)(output)
const consumerModules = {}
for (const [name, relative] of [['peer', 'jsonl-rpc/peer.ts'], ['idle', 'pi/rpc-idle-check.ts']]) {
  const target = join(directory, `${name}.cjs`)
  buildSync({ entryPoints: [join(root, 'third_party/orca-v1.4.230/src/main', relative)], outfile: target, bundle: true, platform: 'node', format: 'cjs', target: 'node24', logLevel: 'silent', nodePaths: [join(root, 'runtime/swa-orca/node_modules')], tsconfig: join(root, 'runtime/swa-orca/tsconfig.json'), alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') } })
  consumerModules[name] = createRequire(target)(target)
}
const { JsonlRpcPeer } = consumerModules.peer
const { PiRpcIdleCheck } = consumerModules.idle

// 仅普通文件和真实 Node stream 的本地队列控制，不产生 Agent/RPC/模型协议。
function queueFor(stream) {
  const failures = []
  let queue
  queue = new ProviderStdioWriteQueue(stream, 1024 * 1024, error => {
    failures.push(error)
    queue.close(error)
  }, { capacity: () => new Error('Public test queue capacity exceeded'), closed: () => new Error('Public test stream is closed') })
  return { queue, failures }
}

async function publicFile(name) {
  const path = join(directory, name)
  const stream = createWriteStream(path, { flags: 'wx', mode: 0o600, highWaterMark: 1 })
  await once(stream, 'open')
  return { path, stream }
}

async function endStream(stream) {
  const ended = finished(stream)
  stream.end()
  await ended
}

test('actual file write releases its guard before settlement and preserves the original three arguments', { timeout: 10_000 }, async () => {
  const { path, stream } = await publicFile('ordered-public-text.txt')
  const { queue, failures } = queueFor(stream)
  const guard = join(directory, 'ordered.guard'), order = [], facts = []
  await queue.write('public first line\n', undefined, async () => () => {
    const fd = openSync(guard, 'wx', 0o600)
    order.push('guard')
    return () => { closeSync(fd); unlinkSync(guard); order.push('cleanup') }
  }, fact => {
    assert.equal(existsSync(guard), false)
    order.push('observer')
    facts.push(fact)
  })
  order.push('resolved')
  await queue.write('public second line\n', undefined, async () => () => { order.push('legacy-guard') })
  await queue.settled()
  await endStream(stream)
  assert.deepEqual(order, ['guard', 'cleanup', 'observer', 'resolved', 'legacy-guard'])
  assert.deepEqual(facts, [{ outcome: 'resolved', writeAttempted: true, cleanupCompleted: true }])
  assert.equal(await readFile(path, 'utf8'), 'public first line\npublic second line\n')
  assert.deepEqual(failures, [])
})

test('actual pipe backpressure keeps the next write behind its complete settlement', { timeout: 10_000 }, async () => {
  const stream = new PassThrough({ highWaterMark: 1 })
  stream.pause()
  const { queue, failures } = queueFor(stream)
  const received = [], facts = [], first = 'public pipe text\n'.repeat(8192)
  let firstResolved = false, secondAdmitted = false
  const writing = queue.write(first, undefined, undefined, fact => facts.push(fact)).then(() => { firstResolved = true })
  const next = queue.write('public tail\n', undefined, async () => () => { secondAdmitted = true })
  await immediate()
  assert.equal(firstResolved, false)
  assert.equal(secondAdmitted, false)
  stream.on('data', chunk => received.push(chunk))
  stream.resume()
  await Promise.all([writing, next, queue.settled()])
  await endStream(stream)
  assert.equal(Buffer.concat(received).toString(), first + 'public tail\n')
  assert.deepEqual(facts, [{ outcome: 'resolved', writeAttempted: true, cleanupCompleted: true }])
  assert.deepEqual(failures, [])
})

test('beginClose rejects unwritten input and waits for the real already-written pipe tail', { timeout: 10_000 }, async () => {
  const stream = new PassThrough({ highWaterMark: 1 })
  stream.pause()
  const { queue, failures } = queueFor(stream)
  const received = [], facts = [], body = 'public in-flight text\n'.repeat(8192)
  const first = queue.write(body, undefined, undefined, fact => facts.push(fact))
  const second = queue.write('must remain unwritten\n', undefined, undefined, fact => facts.push(fact))
  const stopping = new Error('Public stream is stopping')
  queue.beginClose(stopping)
  await assert.rejects(second, error => error === stopping)
  await assert.rejects(queue.write('must remain new\n'), error => error === stopping)
  let settled = false
  const barrier = queue.settled().then(() => { settled = true })
  await immediate()
  assert.equal(settled, false)
  stream.on('data', chunk => received.push(chunk))
  stream.resume()
  await Promise.all([first, barrier])
  await endStream(stream)
  assert.equal(Buffer.concat(received).toString(), body)
  assert.deepEqual(facts, [
    { outcome: 'rejected', writeAttempted: false, cleanupCompleted: true },
    { outcome: 'resolved', writeAttempted: true, cleanupCompleted: true }
  ])
  assert.deepEqual(failures, [])
})

test('a real synchronous data observer closes only after the write guard cleanup', { timeout: 10_000 }, async () => {
  const stream = new PassThrough()
  const { queue } = queueFor(stream)
  const guard = join(directory, 'synchronous-close.guard'), facts = [], order = []
  const stopping = new Error('Public synchronous close')
  stream.on('data', () => { order.push('data'); queue.close(stopping) })
  const writing = queue.write('public synchronous bytes\n', undefined, async () => () => {
    const fd = openSync(guard, 'wx', 0o600)
    return () => { closeSync(fd); unlinkSync(guard); order.push('cleanup') }
  }, fact => { assert.equal(existsSync(guard), false); order.push('observer'); facts.push(fact) })
  await assert.rejects(writing, error => error === stopping && !(error instanceof ProviderWriteAdmissionError))
  await assert.rejects(queue.settled(), /did not settle safely/)
  await endStream(stream)
  assert.deepEqual(order, ['data', 'cleanup', 'observer'])
  assert.deepEqual(facts, [{ outcome: 'rejected', writeAttempted: true, cleanupCompleted: true }])
})

test('settlement persistence refusal permanently stops the queue before the next file write', { timeout: 10_000 }, async () => {
  const { path, stream } = await publicFile('settlement-failure.txt')
  const { queue, failures } = queueFor(stream)
  let nextAdmitted = false
  const first = queue.write('public committed prefix\n', undefined, undefined, () => { throw new Error('Public settlement refusal') })
  const second = queue.write('must not be written\n', undefined, async () => () => { nextAdmitted = true })
  await Promise.all([
    assert.rejects(first, /settlement could not be confirmed/),
    assert.rejects(second, /settlement could not be confirmed/),
    assert.rejects(queue.settled(), /did not settle safely/)
  ])
  await endStream(stream)
  assert.equal(nextAdmitted, false)
  assert.equal(await readFile(path, 'utf8'), 'public committed prefix\n')
  assert.equal(failures.length, 1)
})

test('an actual cleanup ENOENT after writing keeps attempted input out of AdmissionError', { timeout: 10_000 }, async () => {
  const stream = new PassThrough(), received = [], facts = []
  stream.on('data', chunk => received.push(chunk))
  const { queue, failures } = queueFor(stream)
  const guard = join(directory, 'cleanup-failure.guard')
  const writing = queue.write('public bytes before cleanup failure\n', undefined, async () => () => {
    const fd = openSync(guard, 'wx', 0o600)
    return () => { closeSync(fd); unlinkSync(join(directory, 'actual-missing-cleanup-target')) }
  }, fact => facts.push(fact))
  await assert.rejects(writing, error => error.code === 'ENOENT' && !(error instanceof ProviderWriteAdmissionError))
  await assert.rejects(queue.settled(), /did not settle safely/)
  await endStream(stream)
  assert.equal(Buffer.concat(received).toString(), 'public bytes before cleanup failure\n')
  assert.deepEqual(facts, [{ outcome: 'rejected', writeAttempted: true, cleanupCompleted: false }])
  assert.equal(failures.length, 1)
})

test('an actual exclusive guard EEXIST refuses input before the stream write', { timeout: 10_000 }, async () => {
  const { path, stream } = await publicFile('guard-refused-empty.txt')
  const { queue } = queueFor(stream)
  const guard = join(directory, 'existing.guard'), facts = []
  await writeFile(guard, 'public existing guard\n', { flag: 'wx', mode: 0o600 })
  const writing = queue.write('must not reach the file\n', undefined, async () => () => { openSync(guard, 'wx', 0o600) }, fact => facts.push(fact))
  await assert.rejects(writing, error => error instanceof ProviderWriteAdmissionError && error.cause.code === 'EEXIST')
  await assert.rejects(queue.settled(), /did not settle safely/)
  await endStream(stream)
  assert.equal(await readFile(path, 'utf8'), '')
  assert.equal(await readFile(guard, 'utf8'), 'public existing guard\n')
  assert.deepEqual(facts, [{ outcome: 'rejected', writeAttempted: false, cleanupCompleted: false }])
})

test('beginClose during a real asynchronous input wait never executes its later final guard', { timeout: 10_000 }, async () => {
  const { path, stream } = await publicFile('async-refused-empty.txt')
  const { queue, failures } = queueFor(stream)
  const approvalInput = new PassThrough(), facts = []
  let entered, finalGuardCalls = 0
  const admissionEntered = new Promise(resolve => { entered = resolve })
  const writing = queue.write('must stay unwritten\n', undefined, async () => {
    const input = once(approvalInput, 'data')
    entered()
    await input
    return () => { finalGuardCalls += 1 }
  }, fact => facts.push(fact))
  await admissionEntered
  const stopping = new Error('Public close during admission')
  const rejected = assert.rejects(writing, error => error === stopping)
  queue.beginClose(stopping)
  let settled = false
  const barrier = queue.settled().then(() => { settled = true })
  await immediate()
  assert.equal(settled, false)
  approvalInput.write('public local control input\n')
  await Promise.all([rejected, barrier])
  assert.equal(finalGuardCalls, 0)
  approvalInput.resume()
  await endStream(approvalInput)
  await endStream(stream)
  assert.equal(await readFile(path, 'utf8'), '')
  assert.deepEqual(facts, [{ outcome: 'rejected', writeAttempted: false, cleanupCompleted: true }])
  assert.deepEqual(failures, [])
})

test('a real admission EEXIST after beginClose remains a terminal refusal', { timeout: 10_000 }, async () => {
  const { path, stream } = await publicFile('async-admission-failure.txt')
  const { queue, failures } = queueFor(stream)
  const input = new PassThrough(), guard = join(directory, 'async-existing.guard'), facts = []
  await writeFile(guard, 'public existing guard\n', { flag: 'wx', mode: 0o600 })
  let entered
  const admissionEntered = new Promise(resolve => { entered = resolve })
  const writing = queue.write('must stay unwritten\n', undefined, async () => {
    const waiting = once(input, 'data')
    entered()
    await waiting
    openSync(guard, 'wx', 0o600)
  }, fact => facts.push(fact))
  await admissionEntered
  const rejected = assert.rejects(writing, error => error instanceof ProviderWriteAdmissionError && error.cause.code === 'EEXIST')
  queue.beginClose(new Error('Public normal close'))
  const barrier = assert.rejects(queue.settled(), /did not settle safely/)
  input.write('public local admission decision\n')
  await Promise.all([rejected, barrier])
  input.resume(); await endStream(input); await endStream(stream)
  assert.equal(await readFile(path, 'utf8'), '')
  assert.equal(failures.length, 1)
  assert.equal(failures[0].cause.code, 'EEXIST')
  assert.deepEqual(facts, [{ outcome: 'rejected', writeAttempted: false, cleanupCompleted: true }])
})

test('same-tick beginClose does not start a deferred admission', { timeout: 10_000 }, async () => {
  const { path, stream } = await publicFile('never-admitted.txt')
  const { queue, failures } = queueFor(stream)
  let admitted = false
  const writing = queue.write('must stay unwritten\n', undefined, async () => { admitted = true })
  const stopping = new Error('Public same-tick close')
  queue.beginClose(stopping)
  await Promise.all([assert.rejects(writing, error => error === stopping), queue.settled()])
  await endStream(stream)
  assert.equal(admitted, false)
  assert.equal(await readFile(path, 'utf8'), '')
  assert.deepEqual(failures, [])
})

test('real peer beginClose notifies once before refusing new requests without emitting protocol bytes', { timeout: 10_000 }, async () => {
  const input = new PassThrough(), stream = new PassThrough(), received = [], order = []
  stream.on('data', chunk => received.push(chunk))
  const peer = new JsonlRpcPeer(input, stream, { onWritesClosing: () => order.push('closing') })
  peer.beginClose()
  peer.beginClose()
  await assert.rejects(peer.request('get_state'), error => { order.push('rejected'); return error.name === 'JsonlRpcStreamClosedError' })
  await peer.waitForWrites()
  assert.deepEqual(order, ['closing', 'rejected'])
  assert.equal(Buffer.concat(received).length, 0)
  peer.close()
  input.resume(); await endStream(input); await endStream(stream)
})

test('a real local close observer EEXIST keeps the peer write barrier failed', { timeout: 10_000 }, async () => {
  const guard = join(directory, 'close-observer.guard')
  await writeFile(guard, 'public existing observer guard\n', { flag: 'wx', mode: 0o600 })
  const input = new PassThrough(), stream = new PassThrough(), errors = []
  stream.resume()
  const peer = new JsonlRpcPeer(input, stream, { onWritesClosing: () => { openSync(guard, 'wx', 0o600) }, onClose: error => errors.push(error) })
  peer.beginClose()
  await assert.rejects(peer.waitForWrites(), /did not settle safely/)
  assert.equal(peer.closed, true)
  assert.equal(errors.length, 1)
  input.resume(); await endStream(input); await endStream(stream)
})

// 仅验证已有探测定时算法与真实文件错误，不构造 Pi 响应或原生成功。
test('idle-check disposal cancels local retries while live real file failures still fail', { timeout: 10_000 }, async () => {
  const guard = join(directory, 'idle-check-existing.guard')
  await writeFile(guard, 'public existing check guard\n', { flag: 'wx', mode: 0o600 })
  let liveAttempts = 0, closedAttempts = 0
  const liveFailures = [], closedFailures = []
  const liveFailed = Promise.withResolvers()
  const live = new PiRpcIdleCheck({ request: async () => { liveAttempts += 1; openSync(guard, 'wx', 0o600) }, current: () => true, settled: () => assert.fail('No provider response exists'), failed: error => { liveFailures.push(error); liveFailed.resolve() } })
  const closing = new PiRpcIdleCheck({ request: async () => { closedAttempts += 1; openSync(guard, 'wx', 0o600) }, current: () => true, settled: () => assert.fail('No provider response exists'), failed: error => closedFailures.push(error) })
  live.schedule(1)
  closing.schedule(1)
  await immediate()
  assert.equal(closedAttempts, 1)
  closing.dispose()
  closing.schedule(1)
  const deadline = setTimeout(() => liveFailed.reject(new Error('Actual local retry failure did not arrive')), 9_000)
  try { await liveFailed.promise }
  finally { clearTimeout(deadline); live.dispose() }
  assert.equal(liveAttempts, 3)
  assert.equal(liveFailures.length, 1)
  assert.equal(liveFailures[0].code, 'EEXIST')
  assert.equal(closedAttempts, 1)
  assert.deepEqual(closedFailures, [])
})
