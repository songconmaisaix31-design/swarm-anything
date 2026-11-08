import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative } from 'node:path'

export async function checkLinuxNative(candidate) {
  assert.equal(process.platform, 'linux')
  assert.equal(process.arch, 'x64')
  assert.ok(process.report.getReport().header.glibcVersionRuntime)
  const installed = createRequire(join(candidate, 'runtime', 'package.json'))
  const ptyPath = await realpath(join(dirname(installed.resolve('node-pty/package.json')), 'build', 'Release', 'pty.node'))
  const within = relative(candidate, ptyPath)
  assert.ok(within && !within.startsWith('..') && !isAbsolute(within))
  const elf = await readFile(ptyPath)
  assert.deepEqual([...elf.subarray(0, 6)], [0x7f, 0x45, 0x4c, 0x46, 2, 1])
  assert.equal(elf.readUInt16LE(18), 62)
  const terminal = installed('node-pty')
  assert.ok(Object.hasOwn(installed.cache, ptyPath), 'The PTY loader must use the actual privately compiled binary')
  const observed = await new Promise((resolve, reject) => {
    let output = ''
    const child = terminal.spawn('/bin/sh', ['-c', 'IFS= read -r input; printf "SWA_PTY_INPUT:%s\\n" "$input"'], { cwd: candidate, env: { PATH: '/usr/bin:/bin' }, cols: 80, rows: 24 })
    const timer = setTimeout(() => { child.kill(); reject(new Error('Actual Linux PTY input/output timed out')) }, 10_000)
    child.onData(data => { output += data })
    child.onExit(result => { clearTimeout(timer); resolve({ ...result, output, pid: child.pid }) })
    child.write('swa-native-check\n')
  })
  assert.equal(observed.exitCode, 0)
  assert.equal(observed.signal, 0)
  assert.ok(observed.output.includes('SWA_PTY_INPUT:swa-native-check'))
  const watcher = installed('@parcel/watcher'), directory = await mkdtemp(join(dirname(candidate), '.swa-native-check-'))
  let subscription
  try {
    const events = new Promise((resolve, reject) => {
      subscription = watcher.subscribe(directory, (error, events) => {
        if (error) reject(error)
        else if (events.some(event => event.type === 'create' && event.path === join(directory, 'actual-file'))) resolve(events)
      })
    })
    const active = await subscription
    try {
      await writeFile(join(directory, 'actual-file'), 'actual watcher check\n', { flag: 'wx' })
      let timer
      try { await Promise.race([events, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Actual file watcher timed out')), 10_000) })]) }
      finally { clearTimeout(timer) }
    } finally { await active.unsubscribe() }
    await rm(directory, { recursive: true })
  } catch (error) { throw new Error('Linux watcher failed; retained ' + directory, { cause: error }) }
  process.stdout.write(execFileSync(process.execPath, [join(import.meta.dirname, 'check-swa-linux-provider.mjs'), '--addon', ptyPath], { encoding: 'utf8', timeout: 40_000 }))
  console.log(JSON.stringify({ native_platform: process.platform, native_arch: process.arch, glibc: process.report.getReport().header.glibcVersionRuntime, node: process.version, pty_binary: ptyPath, actual_pty: observed, actual_watcher: 'create_observed', agent_acceptance: 'NOT_RUN' }))
}
