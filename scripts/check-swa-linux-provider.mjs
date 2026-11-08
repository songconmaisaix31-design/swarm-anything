import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { isAbsolute } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { addon: { type: 'string' }, fixture: { type: 'string' } }, allowPositionals: false })
const environment = { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' }

if (values.fixture === 'adopted') {
  // 真实普通子进程由内核收养，未实现任何 Agent 或模型协议。
  const timeout = setTimeout(() => process.exit(0), 30_000)
  process.send({ pid: process.pid })
  process.on('disconnect', () => { assert.ok(timeout) })
} else if (values.fixture === 'parent') {
  const child = fork(import.meta.filename, ['--fixture', 'adopted'], { env: environment, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
  const [ready] = await once(child, 'message')
  assert.equal(ready.pid, child.pid)
  child.disconnect()
  process.on('message', message => {
    assert.equal(message, 'release')
    process.exit(0)
  })
  process.send({ pid: child.pid })
} else {
  assert.equal(process.platform, 'linux')
  assert.ok(values.addon && isAbsolute(values.addon))
  const native = createRequire(import.meta.url)(values.addon)
  assert.equal(native.providerLinuxIsolationVersion, 1)
  for (const name of ['enableSwaChildSubreaper', 'observeSwaChildExit', 'openSwaPidfd', 'signalSwaPidfd', 'reapSwaAdoptedChild', 'closeSwaPidfd']) assert.equal(typeof native[name], 'function')
  assert.equal(native.enableSwaChildSubreaper(), true)
  assert.deepEqual(native.observeSwaChildExit(), { state: 'no-children' })
  for (const pid of [0, -1, 1.5, NaN, Infinity, process.pid, process.ppid]) assert.throws(() => native.openSwaPidfd(pid))
  assert.throws(() => native.signalSwaPidfd({}, 'SIGTERM'))
  let child, adopted, adoptedPID, originalClosed = false, reaped = false
  try {
    child = fork(import.meta.filename, ['--fixture', 'parent'], { env: environment, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
    const closed = once(child, 'close').then(result => { originalClosed = true; return result })
    const [ready] = await once(child, 'message')
    adoptedPID = ready.pid
    assert.ok(Number.isInteger(adoptedPID) && adoptedPID > 0)
    assert.throws(() => native.openSwaPidfd(adoptedPID), 'A live grandchild is not this Node process\'s direct child')
    assert.deepEqual(native.observeSwaChildExit(), { state: 'children-remain' })
    const direct = native.openSwaPidfd(child.pid)
    assert.equal(native.closeSwaPidfd(direct), true)
    assert.throws(() => native.signalSwaPidfd(direct, 'SIGTERM'))
    assert.throws(() => native.reapSwaAdoptedChild(direct))
    assert.throws(() => native.closeSwaPidfd(direct))
    child.send('release')
    assert.deepEqual(await closed, [0, null])
    originalClosed = true
    adopted = native.openSwaPidfd(adoptedPID)
    assert.deepEqual(native.observeSwaChildExit(), { state: 'children-remain' })
    assert.throws(() => native.reapSwaAdoptedChild(adopted))
    assert.throws(() => native.signalSwaPidfd(adopted, 'SIGINT'))
    assert.equal(native.signalSwaPidfd(adopted, 'SIGTERM'), true)
    let exited
    for (let attempt = 0; attempt < 100; attempt++) {
      exited = native.observeSwaChildExit()
      if (exited.state === 'exited-child') break
      assert.equal(exited.state, 'children-remain')
      await delay(10)
    }
    assert.deepEqual(exited, { state: 'exited-child', pid: adoptedPID, code: 2, status: 15 })
    assert.deepEqual(native.observeSwaChildExit(), exited, 'WNOWAIT must preserve the actual exited child')
    assert.equal(native.reapSwaAdoptedChild(adopted), true)
    reaped = true
    assert.throws(() => native.reapSwaAdoptedChild(adopted))
    assert.equal(native.closeSwaPidfd(adopted), true)
    const closedHandle = adopted
    adopted = undefined
    assert.throws(() => native.signalSwaPidfd(closedHandle, 'SIGKILL'))
    assert.throws(() => native.closeSwaPidfd(closedHandle))
    const observations = []
    for (let count = 0; count < 2; count++) {
      await delay(20)
      const observed = native.observeSwaChildExit()
      assert.deepEqual(observed, { state: 'no-children' })
      observations.push({ ...observed, monotonic_ms: performance.now() })
    }
    assert.ok(observations[1].monotonic_ms > observations[0].monotonic_ms)
    console.log(JSON.stringify({ linux_provider_isolation: native.providerLinuxIsolationVersion, actual_adopted_pid: adoptedPID, wrong_parent_refused: true, closed_handle_refused: true, running_child_reap_refused: true, actual_exited_child: exited, actual_exact_reap: reaped, observations, agent_acceptance: 'NOT_RUN' }))
  } finally {
    if (child && !originalClosed) {
      const closed = once(child, 'close')
      child.kill('SIGTERM')
      await closed
      originalClosed = true
    }
    if (adoptedPID && !reaped) {
      adopted ??= native.openSwaPidfd(adoptedPID)
      native.signalSwaPidfd(adopted, 'SIGKILL')
      for (let attempt = 0; attempt < 100; attempt++) {
        const observed = native.observeSwaChildExit()
        if (observed.state === 'exited-child' && observed.pid === adoptedPID) {
          native.reapSwaAdoptedChild(adopted)
          reaped = true
          break
        }
        await delay(10)
      }
      assert.equal(reaped, true, 'Actual owned fixture cleanup remains unconfirmed')
    }
    if (adopted) native.closeSwaPidfd(adopted)
  }
}
