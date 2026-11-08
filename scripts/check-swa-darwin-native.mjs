import assert from 'node:assert/strict'
import { access, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative } from 'node:path'

export async function checkDarwinNative(candidate) {
  assert.equal(process.platform, 'darwin')
  assert.equal(process.arch, 'arm64')
  const installed = createRequire(join(candidate, 'runtime', 'package.json'))
  const release = join(dirname(installed.resolve('node-pty/package.json')), 'build', 'Release')
  const ptyPath = await realpath(join(release, 'pty.node'))
  for (const name of ['pty.node', 'spawn-helper']) {
    const actual = await realpath(join(release, name)), within = relative(candidate, actual)
    assert.ok(within && !within.startsWith('..') && !isAbsolute(within))
  }
  await access(join(release, 'spawn-helper'), constants.X_OK)
  const terminal = installed('node-pty')
  assert.ok(Object.hasOwn(installed.cache, ptyPath), 'The PTY loader must use the actual privately compiled binary')
  const observed = await new Promise((resolve, reject) => {
    let output = ''
    const child = terminal.spawn('/bin/sh', ['-c', 'IFS= read -r input; printf "SWA_PTY_INPUT:%s\\n" "$input"'], { cwd: candidate, env: { PATH: '/usr/bin:/bin' }, cols: 80, rows: 24 })
    const timer = setTimeout(() => { child.kill(); reject(new Error('Actual macOS PTY input/output timed out')) }, 10_000)
    child.onData(data => { output += data })
    child.onExit(result => { clearTimeout(timer); resolve({ ...result, output, pid: child.pid }) })
    child.write('swa-native-check\n')
  })
  assert.equal(observed.exitCode, 0)
  assert.equal(observed.signal, 0)
  assert.ok(observed.output.includes('SWA_PTY_INPUT:swa-native-check'))
  const watcher = installed('@parcel/watcher'), directory = await mkdtemp(join(dirname(candidate), '.swa-native-check-'))
  let subscription, timer
  try {
    let report, fail
    const events = new Promise((resolve, reject) => { report = resolve; fail = reject })
    const result = Promise.race([events, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Actual macOS file watcher timed out')), 10_000) })])
    // 同时等待订阅和事件，避免订阅失败时留下未处理的事件 Promise。
    await Promise.all([
      (async () => {
        subscription = await watcher.subscribe(directory, (error, changes) => {
          if (error) fail(error)
          else if (changes.some(event => event.type === 'create' && event.path === join(directory, 'actual-file'))) report(changes)
        })
        await writeFile(join(directory, 'actual-file'), 'actual watcher check\n', { flag: 'wx' })
      })(),
      result
    ])
  } catch (error) { throw new Error('macOS watcher failed; retained ' + directory, { cause: error }) }
  finally { clearTimeout(timer); if (subscription) await subscription.unsubscribe() }
  await rm(directory, { recursive: true })
  console.log(JSON.stringify({ native_platform: process.platform, native_arch: process.arch, node: process.version, pty_binary: ptyPath, actual_pty: observed, actual_watcher: 'create_observed', provider_ownership_acceptance: 'NOT_RUN', agent_acceptance: 'NOT_RUN' }))
}
