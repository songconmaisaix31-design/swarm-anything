import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { link, mkdir, mkdtemp, readFile, readlink, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/project-shell'), { recursive: true })
const directory = await mkdtemp(join(root, '.verification/project-shell/case-'))
const bundle = join(directory, 'shell.cjs')
const built = buildSync({ stdin: { contents: "export * from './runtime/swa-orca/src/project-shell'; export { CHEAP_PS_ARGS, parseCheapProcessTableRows } from './third_party/orca-v1.4.230/src/shared/process-table-snapshot'", resolveDir: root }, platform: 'node', format: 'cjs', bundle: true, write: false, nodePaths: [join(root, 'runtime/swa-orca/node_modules')] })
await writeFile(bundle, built.outputFiles[0].contents)
const { prepareProjectShell, runProjectShell, CHEAP_PS_ARGS, parseCheapProcessTableRows } = createRequire(bundle)(bundle)
const project = join(directory, 'project'), allowed = join(project, 'allowed'), another = join(project, 'another'), protectedRoot = join(directory, 'runtime'), outside = join(directory, 'outside.txt')
for (const path of [allowed, another, protectedRoot]) await mkdir(path, { recursive: true })
await writeFile(outside, 'public test marker\n')
await writeFile(join(allowed, 'input.txt'), 'public project input\n')
await symlink(outside, join(allowed, 'external-link'))
const policy = { schema: 'swa.project-shell.v1', project_root: project, writable_roots: [allowed, another], protected_roots: [protectedRoot, bundle], toolchain_roots: [dirname(dirname(process.execPath))] }

test('project shell rejects unapproved directories and protected executable overlap before spawning', () => {
  assert.throws(() => prepareProjectShell(policy, { command: 'true', cwd: project }), { code: 'scope_denied' })
  assert.throws(() => prepareProjectShell({ ...policy, writable_roots: [directory] }, { command: 'true', cwd: allowed }), { code: 'scope_denied' })
  assert.throws(() => prepareProjectShell({ ...policy, protected_roots: [allowed] }, { command: 'true', cwd: allowed }), { code: 'scope_denied' })
  assert.throws(() => prepareProjectShell({ ...policy, toolchain_roots: [allowed] }, { command: 'true', cwd: allowed }), { code: 'scope_denied' })
  assert.throws(() => prepareProjectShell({ ...policy, toolchain_roots: [protectedRoot] }, { command: 'true', cwd: allowed }), { code: 'scope_denied' })
  assert.throws(() => prepareProjectShell({ ...policy, protected_roots: ['/usr/local'] }, { command: 'true', cwd: allowed }), { code: 'scope_denied' })
  assert.throws(() => prepareProjectShell(policy, { command: 'true', cwd: join(allowed, 'external-link') }), { code: 'scope_denied' })
})

test('project shell rejects shared hard links before modifying an external inode', async () => {
  const shared = join(project, 'shared')
  await mkdir(shared)
  await link(outside, join(shared, 'external-hardlink'))
  assert.throws(() => prepareProjectShell({ ...policy, writable_roots: [shared] }, { command: 'printf changed > external-hardlink', cwd: shared }), { code: 'scope_denied' })
  assert.equal(await readFile(outside, 'utf8'), 'public test marker\n')
})

test('project shell rejects a host socket inside a writable project directory', async () => {
  const special = join(project, 'special')
  await mkdir(special)
  const server = createServer()
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(join(special, 's'), resolve) })
    assert.throws(() => prepareProjectShell({ ...policy, writable_roots: [special] }, { command: 'true', cwd: special }), { code: 'scope_denied' })
  } finally { if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
})

test('real project shell reads, changes and checks two allowed directories while denying external files and network', { timeout: 30_000 }, async () => {
  const source = `import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
assert.equal(fs.readFileSync('input.txt','utf8'),'public project input\\n');
fs.writeFileSync('result.txt','reviewable change\\n');
fs.writeFileSync(${JSON.stringify(join(another, 'second.txt'))},'second allowed directory\\n');
assert.equal(process.env.SWA_EXTERNAL_TEST_MARKER,undefined);
for (const path of ${JSON.stringify([outside, join(allowed, 'external-link'), protectedRoot, bundle])}) {
  assert.throws(()=>fs.readFileSync(path));
  assert.throws(()=>fs.writeFileSync(path,'must not escape'));
}
await new Promise((resolve,reject)=>{const socket=net.createConnection({host:'198.51.100.1',port:443});socket.setTimeout(1000);socket.on('connect',()=>{socket.destroy();reject(new Error('Network unexpectedly available'));});socket.on('error',()=>resolve());socket.on('timeout',()=>{socket.destroy();reject(new Error('Network isolation did not reject the connection'));});});
console.log('project checks passed');
`
  await writeFile(join(allowed, 'check.mjs'), source)
  const previous = process.env.SWA_EXTERNAL_TEST_MARKER
  process.env.SWA_EXTERNAL_TEST_MARKER = 'public-not-for-child'
  let output = ''
  try {
    const result = await runProjectShell(policy, { command: 'node check.mjs', cwd: allowed }, { timeoutMs: 15_000, onData: data => { output += data.toString() } })
    assert.equal(result.exitCode, 0, output)
    assert.equal(result.signal, null)
  } finally {
    if (previous === undefined) delete process.env.SWA_EXTERNAL_TEST_MARKER
    else process.env.SWA_EXTERNAL_TEST_MARKER = previous
  }
  assert.match(output, /project checks passed/u)
  assert.equal(await readFile(join(allowed, 'result.txt'), 'utf8'), 'reviewable change\n')
  assert.equal(await readFile(join(another, 'second.txt'), 'utf8'), 'second allowed directory\n')
  assert.equal(await readFile(outside, 'utf8'), 'public test marker\n')
})

async function ownedTree(pid) {
  const rows = parseCheapProcessTableRows(execFileSync('/bin/ps', [...CHEAP_PS_ARGS], { encoding: 'utf8', timeout: 5000, maxBuffer: 32 * 1024 * 1024, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' } }))
  assert.ok(rows.some(row => row.pid === pid), 'The actual shell parent must be present in the process table')
  const owned = new Set([pid])
  for (let changed = true; changed;) {
    changed = false
    for (const row of rows) if (!owned.has(row.pid) && owned.has(row.ppid)) { owned.add(row.pid); changed = true }
  }
  return Promise.all([...owned].map(async child => ({ pid: child, stat: await readFile(`/proc/${child}/stat`, 'utf8'), namespace: await readlink(`/proc/${child}/ns/pid`) })))
}
function incarnation(stat) { return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] }
async function noLongerRunning(identity) {
  try {
    const current = await readFile(`/proc/${identity.pid}/stat`, 'utf8')
    return incarnation(current) !== incarnation(identity.stat) || ['Z', 'X'].includes(current.slice(current.lastIndexOf(')') + 2).split(' ')[0])
  } catch (error) { if (error?.code === 'ENOENT' || error?.code === 'ESRCH') return true; throw error }
}

test('cancelling a real project shell ends its observed child process namespace', { timeout: 30_000 }, async () => {
  assert.equal(await readlink('/proc/self'), String(process.pid), 'Lifecycle validation requires /proc mounted for the current PID namespace')
  await writeFile(join(allowed, 'hold.mjs'), `import {spawn} from 'node:child_process'; const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});child.once('spawn',()=>console.log('child started'));setInterval(()=>{},1000);\n`)
  const controller = new AbortController()
  let pid, output = '', ready
  const started = new Promise(resolve => { ready = resolve })
  const run = runProjectShell(policy, { command: 'node hold.mjs', cwd: allowed }, { signal: controller.signal, timeoutMs: 20_000, onSpawn: value => { pid = value }, onData: data => { output += data.toString(); if (output.includes('child started')) ready() } })
  const settled = run.then(result => ({ result }), error => ({ error }))
  try {
    await Promise.race([started, settled.then(value => { throw new Error(`Shell exited before child startup: ${JSON.stringify(value)} ${output}`) })])
    assert.ok(pid)
    const identities = await ownedTree(pid)
    const ownNamespace = await readlink('/proc/self/ns/pid')
    assert.ok(identities.length >= 3, 'Expected bubblewrap and its real child processes')
    assert.ok(identities.some(identity => identity.namespace !== ownNamespace), 'Expected a distinct PID namespace')
    controller.abort()
    const outcome = await settled
    assert.equal(outcome.error?.name, 'AbortError')
    for (let attempt = 0; attempt < 40 && !(await Promise.all(identities.map(noLongerRunning))).every(Boolean); attempt++) await delay(25)
    assert.ok((await Promise.all(identities.map(noLongerRunning))).every(Boolean), 'An observed sandbox process is still running')
  } finally { controller.abort(); await settled }
})
