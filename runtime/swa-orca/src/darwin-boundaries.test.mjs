import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, mkdirSync, mkdtempSync, chmodSync, symlinkSync, realpathSync } from 'node:fs'
import { join, delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = require('esbuild')
const daemon = 'third_party/orca-v1.4.230/src/main/daemon/'
function bundle(entry) {
  return buildSync({ entryPoints: [join(root, entry)], bundle: true, write: false, platform: 'node', format: 'cjs', nodePaths: [join(root, 'runtime/swa-orca/node_modules')] }).outputFiles[0].text
}
const identitySource = bundle(daemon + 'swa-darwin-process-identity.ts')
const securitySource = bundle('runtime/swa-orca/src/private-posix-security.ts')
const discoverySource = bundle('runtime/swa-orca/src/darwin-discovery.ts')
const resolutionSource = bundle('third_party/orca-v1.4.230/src/shared/node-cli-command-resolution.ts')
function load(source, processValue = process, mocks = {}) {
  const module = { exports: {} }
  runInNewContext(source, { module, exports: module.exports, require: name => mocks[name] ?? require(name), process: processValue, Buffer, console, URL, setTimeout, clearTimeout })
  return module.exports
}
const revision = 'a'.repeat(40)
const row = (pid, ppid = 1) => ({ schema: 'swa.darwin-process-identity.v1', platform: 'darwin', state: 'present', pid, ppid, owner_uid: '501', start_ticks: String(1000000 + pid), boot_id: 'darwin-boottime:1700000000:123', executable: { state: 'observed', path: '/install/node/node' } })
function fixture(reply = row(20, 10)) {
  const calls = [], env = { SWA_INSTALL_ROOT: '/install', SWA_EXECUTABLE: '/install/swa' }
  const state = { reply, version: revision }
  const api = load(identitySource, { platform: 'darwin', getuid: () => 501, env }, {
    'node:fs': { realpathSync: path => path, lstatSync: () => ({ isFile: () => true }), readFileSync: () => revision },
    'node:child_process': { execFileSync(command, args, options) {
      calls.push({ command, args, options })
      if (args[0] === '--version') return state.version
      if (state.reply instanceof Error) throw state.reply
      return JSON.stringify(typeof state.reply === 'function' ? state.reply(Number(args[1])) : state.reply)
    } }
  })
  return { api, state, calls, env }
}

test('identity uses fixed executable, exact arguments and bounded clean environment', () => {
  const { api, calls } = fixture()
  assert.equal(api.readSwaDarwinProcess(20).start_ticks, '1000020')
  assert.equal(calls.length, 2)
  assert.equal(calls[1].command, '/install/swa')
  assert.equal(JSON.stringify(calls[1].args), '["darwin-process-identity","20"]')
  assert.equal(calls[1].options.shell, false)
  assert.equal(calls[1].options.timeout, 5000)
  assert.equal(calls[1].options.maxBuffer, 16384)
  assert.equal(Object.keys(calls[1].options.env).sort().join(','), 'LC_ALL,PATH')
})

test('absent is distinct from exit 6 and malformed or mismatched identity', () => {
  const f = fixture({ schema: 'swa.darwin-process-identity.v1', platform: 'darwin', state: 'absent', pid: 20 })
  assert.equal(f.api.observeSwaDarwinProcess(20).state, 'absent')
  assert.throws(() => f.api.readSwaDarwinProcess(20), /absent/)
  f.state.reply = Object.assign(new Error('unknown'), { status: 6 })
  assert.throws(() => f.api.observeSwaDarwinProcess(20), error => error.status === 6)
  for (const invalid of [row(21), { ...row(20), owner_uid: '502' }, { ...row(20), start_ticks: 1000020 }, { ...row(20), boot_id: 'linux-boot' }, { ...row(20), extra: true }]) {
    f.state.reply = invalid
    assert.throws(() => f.api.observeSwaDarwinProcess(20))
  }
})

test('helper version, launcher and invalid PID fail before identity invocation', () => {
  const f = fixture()
  f.state.version = 'b'.repeat(40)
  assert.throws(() => f.api.observeSwaDarwinProcess(20), /version/)
  assert.equal(f.calls.length, 1)
  f.env.SWA_EXECUTABLE = '/other/swa'
  assert.throws(() => f.api.observeSwaDarwinProcess(20), /executable/)
  for (const pid of [0, -1, 1.5, NaN, 0x80000000]) assert.throws(() => f.api.observeSwaDarwinProcess(pid))
  assert.equal(f.calls.length, 1)
})

test('ancestor rechecks incarnation, parent changes, boot identity and cycles', () => {
  const f = fixture(pid => pid === 10 ? row(10) : row(20, 10))
  const parent = f.api.swaDarwinProcessIdentitySchema.parse(row(10)), child = f.api.swaDarwinProcessIdentitySchema.parse(row(20, 10))
  f.api.requireSwaDarwinAncestor(child, parent)
  for (const changed of [{ ...child, start_ticks: '9999999' }, { ...child, ppid: 11 }]) {
    f.state.reply = pid => pid === 10 ? parent : changed
    assert.throws(() => f.api.requireSwaDarwinAncestor(child, parent), /changed/)
  }
  assert.throws(() => f.api.requireSwaDarwinAncestor({ ...child, boot_id: 'darwin-boottime:1:0' }, parent))
  f.state.reply = pid => row(pid, pid === 20 ? 21 : 20)
  assert.throws(() => f.api.requireSwaDarwinAncestor(row(20, 21), parent))
})

const outputRoot = join(root, '.verification/macos-port')
mkdirSync(outputRoot, { recursive: true })
const privateRoot = mkdtempSync(join(outputRoot, 'node-darwin-'))
test('actual Darwin POSIX permissions reject permissive modes and symlinks', { skip: process.platform !== 'darwin' }, () => {
  const api = load(securitySource), home = join(privateRoot, 'home')
  mkdirSync(home, { mode: 0o700 })
  api.requirePosixPrivatePath(home, true)
  const file = join(home, 'public')
  api.createPosixPrivateFile(file, Buffer.from('public fixture'))
  assert.throws(() => api.createPosixPrivateFile(file, Buffer.alloc(0)))
  chmodSync(file, 0o644)
  assert.throws(() => api.requirePosixPrivatePath(file, false), /permissions/)
  symlinkSync(home, join(privateRoot, 'link'))
  assert.throws(() => api.requirePosixPrivatePath(join(privateRoot, 'link'), true))
  chmodSync(home, 0o755)
  assert.throws(() => api.requirePosixPrivatePath(home, true), /permissions/)
})

test('Darwin version environment excludes existing accounts and injected variables', { skip: process.platform !== 'darwin' }, () => {
  let observed
  const api = load(discoverySource, { platform: 'darwin', getuid: process.getuid, env: { SWA_DATA_DIR: privateRoot, SWA_NODE_EXECUTABLE: process.execPath, OPENAI_API_KEY: 'public-test-marker', NODE_OPTIONS: '--invalid' } }, {
    'node:child_process': { execFileSync(command, args, options) { observed = options; return '1.5.0\n' } }
  })
  assert.equal(api.readDarwinDiscoveryVersion('/public/pi'), '1.5.0')
  assert.equal(observed.env.OPENAI_API_KEY, undefined)
  assert.equal(observed.env.NODE_OPTIONS, undefined)
  assert.equal(observed.env.CODEX_HOME, observed.env.HOME)
  assert.equal(observed.env.PI_CODING_AGENT_DIR, observed.env.HOME)
  assert.ok(observed.env.HOME.startsWith(privateRoot + '/'))
  assert.equal(observed.cwd, observed.env.HOME)
  assert.equal(observed.shell, false)
})

test('actual local Pi and ChatGPT Codex resolve and return versions in new private homes', { skip: process.platform !== 'darwin' || process.env.SWA_TEST_LOCAL_DISCOVERY !== '1' }, () => {
  const env = { SWA_DATA_DIR: privateRoot, SWA_NODE_EXECUTABLE: process.execPath }
  const api = load(discoverySource, { platform: 'darwin', getuid: process.getuid, env })
  const resolver = load(resolutionSource)
  for (const agent of ['pi', 'codex']) {
    const pathEnv = api.darwinDiscoveryDirectories(agent, '/Users/tester').join(delimiter)
    const executable = realpathSync(resolver.resolveCliCommand(agent, { pathEnv, homePath: '/Users/tester' }))
    const version = api.readDarwinDiscoveryVersion(executable)
    assert.ok(version, `${agent} CLI version remains unknown`)
    console.log(JSON.stringify({ agent, executable, version, configuration: 'unknown', authentication: 'unknown', worker_release: 'unknown' }))
  }
})

test('Darwin configuration guard precedes every native configuration read', () => {
  const source = readFileSync(join(root, 'runtime/swa-orca/src/agent-discovery.ts'), 'utf8')
  assert.match(source, /if \(process\.platform === 'darwin'\) throw new Error\('darwin_native_configuration_unverified'\)\s+return configuration\(/)
})
