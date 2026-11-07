import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'

const install = await realpath(process.env.SWA_WORKER_TEST_INSTALL)
process.env.SWA_INSTALL_ROOT = install
process.env.SWA_EXECUTABLE = join(install, 'swa')
const { startDarwinWorker } = createRequire(import.meta.url)(join(install, 'runtime/darwin-worker.cjs'))
const parent = join(process.cwd(), '.verification/macos-port2/worker-consumer')
await mkdir(parent, { recursive: true })
const cwd = await mkdtemp(join(parent, 'run-'))
const env = { PATH: '/usr/bin:/bin', HOME: cwd, TMPDIR: cwd }
const query = pid => JSON.parse(execFileSync(join(install, 'swa'), ['darwin-process-identity', String(pid)], { encoding: 'utf8', timeout: 5000 }))
async function withWorker(program, args, check) {
  const worker = await startDarwinWorker({ install, program: await realpath(program), args, cwd, env })
  let stdout = '', stderr = ''
  worker.stdout.on('data', chunk => { stdout += chunk })
  worker.stderr.on('data', chunk => { stderr += chunk })
  try { await check(worker, () => ({ stdout, stderr })) }
  finally { worker.disconnect(); await worker.finished.catch(() => undefined) }
}

test('actual direct child exchanges input and reaps on EOF', { timeout: 15000 }, async () => {
  await withWorker('/bin/cat', [], async (worker, output) => {
    worker.write('真实输入 add(2,3)\n'); worker.end()
    const result = await worker.finished
    assert.equal(result.final.reaped, true)
    assert.equal(result.final.code, 0)
    assert.equal(result.final.tree, 'unknown')
    assert.equal(result.supervisorExit, 6)
    assert.equal(output().stdout, '真实输入 add(2,3)\n')
    assert.equal(query(worker.identity.pid).state, 'absent')
  })
})

for (const signal of ['SIGTERM', 'SIGKILL']) test('actual child rejects a stale identity then accepts ' + signal, { timeout: 15000 }, async () => {
  await withWorker('/bin/cat', [], async worker => {
    const id = randomUUID()
    const refused = await worker.stop(signal, id, { ...worker.identity, start_ticks: String(BigInt(worker.identity.start_ticks) + 1n) })
    assert.equal(refused.accepted, false)
    assert.equal(refused.reason, 'identity_mismatch')
    assert.equal(query(worker.identity.pid).state, 'present')
    await assert.rejects(worker.stop(signal, id), /unavailable/)
    assert.equal((await worker.stop(signal)).accepted, true)
    const result = await worker.finished
    assert.equal(result.final.signal, signal)
    assert.equal(result.final.reaped, true)
    assert.equal(query(worker.identity.pid).state, 'absent')
  })
})

test('actual control EOF requests bounded owner-loss cleanup', { timeout: 15000 }, async () => {
  await withWorker('/bin/cat', [], async worker => {
    worker.disconnect()
    assert.equal((await worker.finished).final.reaped, true)
    assert.equal(query(worker.identity.pid).state, 'absent')
  })
})

test('a real descendant holding output cannot make finished wait forever', { timeout: 20000 }, async () => {
  // 构造的真实进程场景，仅验证管道与生命周期，不作为模型执行证据。
  const source = "const c=require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},8000)'],{stdio:['ignore',1,2],detached:true});console.log(c.pid);c.unref();setTimeout(()=>{},500)"
  await withWorker(join(install, 'node/node'), ['-e', source], async (worker, output) => {
    const start = Date.now()
    await assert.rejects(worker.finished, /cleanup is unknown/)
    assert.ok(Date.now() - start < 10000)
    const descendant = Number(output().stdout.trim())
    assert.ok(Number.isSafeInteger(descendant) && descendant > 0)
    const deadline = Date.now() + 6000
    while (query(descendant).state !== 'absent' && Date.now() < deadline) await delay(50)
    assert.equal(query(descendant).state, 'absent')
    assert.equal(query(worker.identity.pid).state, 'absent')
  })
})
