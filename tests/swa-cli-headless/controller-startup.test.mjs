import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, stat, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const runtime = join(root, 'runtime/swa-orca'), requireRuntime = createRequire(join(runtime, 'package.json'))
const executable = await realpath(process.env.SWA_CONTROLLER_TEST_EXECUTABLE ?? join(root, 'dist/swa'))
const requireInstalled = createRequire(join(dirname(executable), 'runtime/package.json'))
const installedNode = await realpath(join(dirname(executable), 'node/node'))
const installedVersion = JSON.parse(execFileSync(installedNode, ['-p', 'JSON.stringify({version:process.version,modules:process.versions.modules,arch:process.arch,platform:process.platform})'], { encoding: 'utf8' }))
assert.equal(process.versions.modules, installedVersion.modules, 'test Node must use the installed native addon ABI')
assert.equal(process.arch, installedVersion.arch)
assert.equal(process.platform, installedVersion.platform)
const ptyPackage = requireInstalled.resolve('node-pty/package.json')
const ptyAddon = await realpath(join(dirname(ptyPackage), 'build/Release/pty.node'))
const nativeInputs = {
  runner: { executable: process.execPath, version: process.version, modules: process.versions.modules },
  installed_node: { executable: installedNode, ...installedVersion },
  node_pty: { package: ptyPackage, version: requireInstalled('node-pty/package.json').version,
    addon: ptyAddon, sha256: createHash('sha256').update(await readFile(ptyAddon)).digest('hex') }
}
const { build } = requireRuntime('esbuild')
const outputRoot = process.platform === 'darwin' ? join(root, '.verification/macos-port2/controller-startup') : join(root, '.verification/controller-linux-startup')
await mkdir(outputRoot, { recursive: true })
const directory = await mkdtemp(join(outputRoot, 'run-'))
if (process.platform === 'darwin') {
  // 原生预检查通过 require.resolve 查找 spawn-helper，与加载的 addon 必须来自同一安装。
  const spawnHelper = join(dirname(ptyAddon), 'spawn-helper')
  const info = await stat(spawnHelper)
  assert.ok(info.isFile() && (info.mode & 0o111) !== 0, 'installed spawn-helper must already be executable; do not repair the installation')
  await mkdir(join(directory, 'node_modules'))
  await symlink(dirname(ptyPackage), join(directory, 'node_modules/node-pty'), 'dir')
  assert.equal(await realpath(createRequire(join(directory, 'source.cjs')).resolve('node-pty/lib/unixTerminal.js')), await realpath(requireInstalled.resolve('node-pty/lib/unixTerminal.js')))
  nativeInputs.node_pty.spawn_helper = { path: spawnHelper, sha256: createHash('sha256').update(await readFile(spawnHelper)).digest('hex') }
}
for (const name of ['home', 'cwd', 'temp', 'data']) await mkdir(join(directory, name), { mode: 0o700 })
process.env.ORCA_USER_DATA_PATH = join(directory, 'data')
process.env.TMPDIR ??= join(directory, 'temp')
if (process.platform === 'darwin') {
  process.env.SWA_INSTALL_ROOT = dirname(executable)
  process.env.SWA_EXECUTABLE = executable
}
const common = {
  absWorkingDir: root, bundle: true, platform: 'node', target: 'node24', format: 'cjs', conditions: ['orca-source'],
  nodePaths: [join(runtime, 'node_modules'), join(root, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
  plugins: [{ name: 'real-native-dependencies', setup(builder) {
    builder.onResolve({ filter: /^node-pty$/ }, () => ({ path: requireInstalled.resolve('node-pty'), external: true }))
    builder.onResolve({ filter: /^electron$/ }, args => ({ path: args.path, external: true }))
    builder.onResolve({ filter: /^(?:@parcel\/watcher|@orca\/windows-security|@orca\/windows-registry|@vscode\/windows-process-tree|@anthropic-ai\/claude-agent-sdk)$/ }, args => ({ path: requireRuntime.resolve(args.path), external: true }))
    builder.onResolve({ filter: /\.node$/ }, args => ({ path: args.path, external: true }))
    builder.onResolve({ filter: /^@orca\/process-host(?:\/|$)/ }, args => {
      const suffix = args.path.slice('@orca/process-host'.length)
      return { path: join(root, 'third_party/orca-v1.4.230/src/packages/process-host/src', suffix ? suffix.slice(1) + '.ts' : 'run-process.ts') }
    })
    builder.onResolve({ filter: /^jsonc-parser$/ }, () => ({ path: join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') }))
  } }]
}
const source = join(directory, 'source.cjs'), helper = join(directory, 'controller-helper.cjs')
await build({ ...common, entryPoints: [join(root, 'tests/swa-cli-headless/controller-startup-source.ts')], outfile: source })
await build({ ...common, entryPoints: [join(runtime, 'src/controller-helper.ts')], outfile: helper })
const production = await createRequire(source)(source).loadProduction(directory, executable)
const makeOptions = platform => production.controllerTerminalOptions(process.execPath, helper, 'local-parameter-rule', platform)

test('controller parameters respect the actual local Windows-only shell override contract', () => {
  const scope = { connectionId: null, projectRuntime: undefined, cwd: join(directory, 'cwd'), workspacePath: join(directory, 'cwd') }
  const refused = production.terminalShellOverrideRefusal({ ...scope, platform: 'linux', shellOverride: '/bin/bash' })
  assert.match(refused.message, /No terminal was created; omit --shell/)
  const linux = makeOptions('linux')
  assert.equal(Object.hasOwn(linux, 'shellOverride'), false)
  assert.equal(production.terminalShellOverrideRefusal({ ...scope, platform: 'linux', shellOverride: linux.shellOverride }), null)
  const darwin = makeOptions('darwin')
  assert.equal(Object.hasOwn(darwin, 'shellOverride'), false)
  assert.equal(darwin.command, linux.command)
  assert.equal(production.terminalShellOverrideRefusal({ ...scope, platform: 'darwin', shellOverride: darwin.shellOverride }), null)
  const windows = makeOptions('win32')
  assert.equal(windows.shellOverride, 'pwsh.exe')
  assert.equal(production.terminalShellOverrideRefusal({ ...scope, platform: 'win32', shellOverride: windows.shellOverride }), null)
  assert.ok(production.terminalShellOverrideRefusal({ ...scope, platform: 'win32', connectionId: 'explicit-ssh-rule', shellOverride: windows.shellOverride }))
  assert.equal(production.resolveWindowsShellLaunchArgs('pwsh.exe', scope.cwd, scope.cwd, undefined, windows.command).startupCommandDeliveredInShellArgs, true)
})

test('actual native PTY starts the original controller helper, identifies twice and exits through EOF', { skip: !['linux', 'darwin'].includes(process.platform), timeout: 25_000 }, async () => {
  const sessionId = randomUUID(), requestId = randomUUID(), workspace = randomUUID()
  const handle = production.deriveRemoteRuntimeTerminalCreateHandle('swa-controller-local', workspace, `${requestId}/controller-pty`)
  const options = production.controllerTerminalOptions(process.execPath, helper, handle)
  const data = join(directory, 'data'), cwd = join(directory, 'cwd')
  const env = { ...options.env, ORCA_TERMINAL_HANDLE: handle, ORCA_USER_DATA: data, ORCA_USER_DATA_PATH: data, SWA_EXECUTABLE: executable, HOME: join(directory, 'home'), ZDOTDIR: join(directory, 'home'), TMPDIR: process.env.TMPDIR }
  const readiness = [], replies = new Map()
  let transcript = '', exit = null, spawnIncarnation = null, rootIdentity = null, helperIdentity = null, naturalExit = false
  let failure = null
  const darwin = process.platform === 'darwin'
  const readIdentity = darwin ? production.readSwaDarwinProcess : production.readSwaLinuxProcess
  const requireAncestor = darwin ? production.requireSwaDarwinAncestor : production.requireSwaLinuxAncestor
  const isAbsent = darwin ? pid => production.observeSwaDarwinProcess(pid).state === 'absent' : production.isSwaLinuxProcessAbsent
  // exec 可改变程序路径；Darwin 的 PID、UID、微秒启动时间及 boottime 必须保持同一进程实例。
  const darwinIncarnation = identity => ({ platform: identity.platform, pid: identity.pid, owner_uid: identity.owner_uid, start_ticks: identity.start_ticks, boot_id: identity.boot_id })
  const framer = production.createIncrementalNdjsonFramer(value => {
    const parsed = production.helperReply.safeParse(value)
    if (parsed.success) replies.set(parsed.data.request_id, parsed.data)
  }, rejected => { assert.notEqual(rejected.kind, 'line-too-long') }, { maxLineBytes: 1024 * 1024 })
  const host = new production.TerminalHost({ spawnSubprocess: production.createPtySubprocess, reportReadinessEvent: (event, details) => readiness.push({ event, details }) })
  const waitUntil = async (predicate, message) => {
    const deadline = Date.now() + 10_000
    while (!predicate()) {
      assert.ok(Date.now() < deadline, message)
      await delay(25)
    }
  }
  try {
    const effectiveShell = production.resolvePtyShellPath(env)
    const created = await host.createOrAttach({ sessionId, cwd, cols: 120, rows: 30, command: options.command,
      startupCommandDelivery: options.startupCommandDelivery, env,
      shellReadySupported: production.shellPathSupportsPtyStartupBarrier(effectiveShell),
      streamClient: {
        onData: data => {
          const clean = stripVTControlCharacters(data)
          transcript += clean
          assert.ok(Buffer.byteLength(transcript) <= 1024 * 1024, 'bounded actual PTY transcript')
          framer.feed(clean)
        },
        onExit: (code, incarnationId, cause) => { exit = { code, incarnationId, cause } }
      }
    })
    assert.ok(created.pid > 0)
    spawnIncarnation = darwin ? darwinIncarnation(readIdentity(created.pid)) : production.readSwaLinuxProcessIncarnation(created.pid)
    for (const id of [requestId, randomUUID()]) {
      host.write(sessionId, JSON.stringify(production.helperInput.parse({ type: 'swa_controller_action', action: 'identify', request_id: id })) + '\n')
      await waitUntil(() => replies.has(id) || exit !== null, 'original helper did not identify')
      assert.equal(exit, null, 'helper exited before identify')
      const reply = replies.get(id)
      assert.equal(reply.controller, handle)
      assert.deepEqual(reply.result, { ready: true })
      assert.equal(reply.error, undefined)
      const current = readIdentity(reply.pid)
      if (darwin) {
        assert.deepEqual(darwinIncarnation(readIdentity(created.pid)), spawnIncarnation)
        assert.equal(current.executable.path, await realpath(process.execPath), 'helper must execute the selected real Node')
      } else production.requireSwaLinuxIncarnation(spawnIncarnation)
      rootIdentity ??= readIdentity(created.pid)
      requireAncestor(current, rootIdentity)
      if (helperIdentity) assert.deepEqual(current, helperIdentity)
      else helperIdentity = current
    }
    host.write(sessionId, '\x04')
    await waitUntil(() => exit !== null, 'original helper did not exit on EOF')
    assert.equal(exit.code, 0)
    await waitUntil(() => isAbsent(helperIdentity.pid) && isAbsent(rootIdentity.pid), 'owned PTY/helper process still exists')
    naturalExit = true
    assert.deepEqual(host.listSessions(), [])
  } catch (error) {
    failure = { name: error.name, message: error.message, code: error.code }
    throw error
  } finally {
    await host.dispose()
    await writeFile(join(directory, 'actual-controller-report.json'), JSON.stringify({ status: naturalExit ? 'PASS' : 'FAIL', natural_eof: naturalExit, platform: process.platform, identity_source: darwin ? 'swa.darwin-process-identity.v1' : 'linux-proc', complete_tree_release: darwin ? 'unknown' : 'NOT_CLAIMED', failure, nativeInputs, spawnIncarnation, rootIdentity, helperIdentity, exit, readiness, reply_count: replies.size, sessions_after_dispose: host.listSessions(), coverage: 'original_terminal_host_pty_helper_only', model_execution: 'NOT_RUN' }, null, 2) + '\n', { flag: 'wx' })
    await writeFile(join(directory, 'actual-controller-transcript.txt'), transcript, { flag: 'wx', mode: 0o600 })
  }
  assert.equal(naturalExit, true)
  assert.deepEqual(host.listSessions(), [])
})
