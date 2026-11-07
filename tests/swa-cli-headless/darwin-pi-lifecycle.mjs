import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'

const [root, destination] = process.argv.slice(2)
assert.ok(root && destination)
const install = await realpath(root), output = resolve(destination)
await mkdir(output, { mode: 0o700 })
process.env.SWA_INSTALL_ROOT = install
process.env.SWA_EXECUTABLE = join(install, 'swa')
const { startDarwinWorker } = createRequire(import.meta.url)(join(install, 'runtime/darwin-worker.cjs'))
const program = await realpath('/Users/tester/.local/bin/pi')
const home = join(output, 'home'), project = join(output, 'project')
await mkdir(home, { mode: 0o700 }); await mkdir(project, { mode: 0o700 })
const readme = '# Example\nfunction add(a, b) { return a + b; }\n'
await writeFile(join(project, 'README.md'), readme)
const env = { PATH: `${install}/node:/opt/homebrew/bin:/usr/bin:/bin`, HOME: home, USERPROFILE: home, TMPDIR: home, TMP: home, TEMP: home, XDG_CONFIG_HOME: home, XDG_DATA_HOME: home, XDG_CACHE_HOME: home, PI_CODING_AGENT_DIR: '/Users/tester/.pi/agent', PI_OFFLINE: '1', PI_TELEMETRY: '0', PI_SKIP_VERSION_CHECK: '1', NO_COLOR: '1', TERM: 'dumb' }
const args = ['--provider', 'omlx', '--model', 'CyberTiel-MLX-MTP', '--offline', '--no-tools', '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', '--no-session', '--no-approve', '--system-prompt', '只根据用户给定的文本回答，不使用工具。']
const query = pid => JSON.parse(execFileSync(join(install, 'swa'), ['darwin-process-identity', String(pid)], { encoding: 'utf8', timeout: 5000 }))
const save = (name, value) => writeFile(join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
const owned = new Set()
const readers = new Set()
async function bounded(promise, milliseconds) {
  let timer
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Owned supervisor did not finish within the observation deadline')), milliseconds) })]) }
  finally { clearTimeout(timer) }
}
async function open(name, extra) {
  const worker = await startDarwinWorker({ install, program, args: [...args, ...extra], cwd: project, env })
  owned.add(worker)
  let out = '', err = ''
  let outBytes = 0, errBytes = 0, outputComplete = true
  const overflow = () => { if (outputComplete) { outputComplete = false; worker.disconnect() } }
  worker.stdout.setEncoding('utf8').on('data', value => { outBytes += Buffer.byteLength(value); if (outBytes > 4 * 1024 * 1024) overflow(); else out += value })
  worker.stderr.setEncoding('utf8').on('data', value => { errBytes += Buffer.byteLength(value); if (errBytes > 4 * 1024 * 1024) overflow(); else err += value })
  return { worker, async finish() {
    const result = await bounded(worker.finished, 110_000)
    owned.delete(worker)
    await writeFile(join(output, name + '.stdout.jsonl'), out)
    await writeFile(join(output, name + '.stderr.log'), err)
    const absence = query(worker.identity.pid)
    assert.equal(absence.state, 'absent')
    assert.equal(result.final.tree, 'unknown')
    await save(name + '.json', { identity: worker.identity, result, absence, outputComplete, outBytes, errBytes })
    assert.equal(outputComplete, true, 'Actual CLI output exceeded the recorded byte limit')
    return { result, out, err }
  } }
}

try {
const first = await open('read-only-model', ['--mode', 'json', '--print', '只解释以下 README 的 add 函数，给出 add(2,3) 结果，最多两句话。\n' + readme])
let timeout = false
const timer = setTimeout(() => { timeout = true; void first.worker.stop('SIGTERM').catch(() => first.worker.disconnect()) }, 90_000)
const answer = await first.finish().finally(() => clearTimeout(timer))
await save('model-attempt.json', { model: 'omlx/CyberTiel-MLX-MTP', timeout, result: answer.result, stdout_file: 'read-only-model.stdout.jsonl', note: '实际监督器下官方 Pi 调用；不代表 SWA Run 或完整释放验收' })
console.log(JSON.stringify({ stage: 'official-pi-model', model: 'omlx/CyberTiel-MLX-MTP', timeout, ...answer.result }))

const second = await open('running-stop', ['--mode', 'rpc'])
const forged = { ...second.worker.identity, start_ticks: String(BigInt(second.worker.identity.start_ticks) + 1n) }
const refused = await second.worker.stop('SIGTERM', randomUUID(), forged)
assert.equal(refused.accepted, false)
assert.equal(query(second.worker.identity.pid).state, 'present')
let resolveActive, rejectActive
const active = new Promise((resolve, reject) => { resolveActive = resolve; rejectActive = reject })
const lines = createInterface({ input: second.worker.stdout })
readers.add(lines)
lines.on('line', line => {
  try { const frame = JSON.parse(line); if (frame.type === 'agent_start') resolveActive(frame) } catch { rejectActive(new Error('Invalid actual Pi RPC output')) }
})
second.worker.write(JSON.stringify({ id: randomUUID(), type: 'prompt', message: '基于 function add(a,b){return a+b;} 写一段详细的中文解释，逐步列出二十个整数例子。不要调用工具。' }) + '\n')
let activeEvidence = null
const activeTimer = setTimeout(() => rejectActive(new Error('No actual agent_start observed')), 30_000)
try { activeEvidence = await active } catch { /* 缺失实际启动事件会在记录中保留，仍收尾本次所属进程。 */ }
finally { clearTimeout(activeTimer) }
const receipt = await second.worker.stop('SIGTERM')
assert.equal(receipt.accepted, true)
const stopped = await second.finish()
lines.close()
await save('stop-evidence.json', { activeEvidence, running_model_verified: activeEvidence !== null, refused, receipt, result: stopped.result, tree: 'unknown' })
assert.equal(await readFile(join(project, 'README.md'), 'utf8'), readme)
console.log(JSON.stringify({ stage: 'official-pi-stop', activeEvidence, refused, receipt, ...stopped.result }))
} finally {
  for (const reader of readers) reader.close()
  for (const worker of owned) {
    worker.disconnect()
    try { await bounded(worker.finished, 5000) }
    catch {
      let observed
      try { observed = query(worker.identity.pid) } catch { observed = { state: 'unknown', reason: 'identity_query_failed' } }
      const evidence = { identity: worker.identity, supervisor: worker.supervisor, observed, tree: 'unknown' }
      try { await save('incomplete-cleanup-' + worker.identity.pid + '.json', evidence) }
      catch { console.error(JSON.stringify({ stage: 'cleanup_evidence_write_failed', ...evidence })) }
    }
  }
}
