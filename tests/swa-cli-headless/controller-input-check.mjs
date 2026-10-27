import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, stat, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs, stripVTControlCharacters } from 'node:util'
import { collectOwnedIncarnations } from './process-incarnation-closure.mjs'

// 外层先完成真实 task.create 并导出 receipt.invocation；本入口只消费该原件。
const { values } = parseArgs({ options: {
  'install-root': { type: 'string' }, 'invocation-file': { type: 'string' }, 'output-dir': { type: 'string' }
}, strict: true, allowPositionals: false })
for (const key of ['install-root', 'invocation-file', 'output-dir']) assert.ok(values[key] && isAbsolute(values[key]), `--${key} must be absolute`)
assert.ok(process.platform === 'linux' || process.platform === 'win32', 'native Linux or Windows required')
const root = fileURLToPath(new URL('../../', import.meta.url)), runtime = join(root, 'runtime/swa-orca')
const install = await realpath(values['install-root']), invocationFile = await realpath(values['invocation-file'])
const output = join(await realpath(dirname(values['output-dir'])), relative(dirname(values['output-dir']), values['output-dir']))
const maxBytes = 1024 * 1024
const contains = (parent, path) => { const part = relative(parent, path); return part !== '..' && !part.startsWith('../') && !part.startsWith('..\\') && !isAbsolute(part) }
assert.ok(!contains(install, output) && !contains(output, install), 'output and installation must be separate')
assert.ok(!contains(output, invocationFile), 'the invocation must exist outside the new output directory')
assert.ok((await stat(invocationFile)).size <= maxBytes, 'actual invocation exceeds 1 MiB')
assert.ok((await lstat(invocationFile)).isFile(), 'invocation must be an ordinary file')
const actualInvocation = JSON.parse(await readFile(invocationFile, 'utf8'))
assert.equal(actualInvocation.command?.action, 'task.create', 'a completed task.create invocation is required')
assert.ok(actualInvocation.spec && actualInvocation.context, 'actual task spec and context are required')
const executable = await realpath(join(install, process.platform === 'win32' ? 'swa.exe' : 'swa'))
const node = await realpath(join(install, 'node', process.platform === 'win32' ? 'node.exe' : 'node'))
const helper = await realpath(join(install, 'runtime/controller-helper.cjs'))
for (const path of [executable, node, helper]) assert.ok(contains(install, path), 'native inputs must remain in the explicit installation')
assert.equal(await realpath(process.execPath), node, 'run this check with the explicit installation Node')
await mkdir(output, { mode: 0o700 })
const save = (name, value) => writeFile(join(output, name), value, { flag: 'wx', mode: 0o600 })
const digest = async path => ({ path: await realpath(path), sha256: createHash('sha256').update(await readFile(path)).digest('hex') })
const report = { schema: 'swa.controller-input-check.v1', status: 'FAIL', platform: process.platform,
  coverage: 'installed_helper_transport_with_actual_task_create_invocation', rpc_mutations: 'NOT_RUN', model_execution: 'NOT_RUN',
  process_proof: 'observed_process_identities_and_absence', kernel_job_empty: 'NOT_CLAIMED', tty: null, pipe: null }
let failure = null
let stopBuild = () => {}, readAddonPaths = async () => [], cleanupUnknown = false
const boundedCleanup = async (operation, label) => {
  let timer
  try {
    await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} cleanup exceeded 5 seconds; outcome unknown`)), 5000) })])
  } catch (error) { cleanupUnknown = true; throw error }
  finally { clearTimeout(timer) }
}
try {
  for (const name of ['home', 'cwd', 'temp', 'data']) await mkdir(join(output, name), { mode: 0o700 })
  const installedModules = await realpath(join(install, 'runtime/node_modules'))
  assert.ok(contains(install, installedModules), 'installed dependencies escaped installation')
  // 原 Windows reader 使用 createRequire(__filename)，显式提供同安装依赖目录。
  await symlink(installedModules, join(output, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal(await realpath(join(output, 'node_modules')), installedModules)
  const requireRuntime = createRequire(join(runtime, 'package.json')), requireInstalled = createRequire(join(install, 'runtime/package.json'))
  const { build, stop } = requireRuntime('esbuild')
  stopBuild = stop
  const bundle = join(output, 'source.cjs'), sourceEntry = join(root, 'tests/swa-cli-headless/controller-startup-source.ts')
  process.env.ORCA_USER_DATA_PATH = join(output, 'data')
  process.env.TMPDIR = join(output, 'temp')
  const built = await build({
    absWorkingDir: root, bundle: true, platform: 'node', target: 'node24', format: 'cjs', conditions: ['orca-source'],
    nodePaths: [join(runtime, 'node_modules'), join(root, 'node_modules')], metafile: true, logLevel: 'silent',
    banner: { js: 'var __swaModuleUrl = require("node:url").pathToFileURL(__filename).href;' },
    define: { 'import.meta.url': '__swaModuleUrl', 'process.env.NODE_ENV': '"production"' }, logOverride: { 'empty-import-meta': 'error' },
    plugins: [{ name: 'installed-native-dependencies', setup(builder) {
      builder.onResolve({ filter: /^(?:node-pty|@parcel\/watcher|@orca\/windows-security|@orca\/windows-registry|@vscode\/windows-process-tree|@anthropic-ai\/claude-agent-sdk)$/ }, args => {
        const path = requireInstalled.resolve(args.path)
        return { path: args.kind === 'dynamic-import' ? pathToFileURL(path).href : path, external: true }
      })
      builder.onResolve({ filter: /^(?:electron|fsevents)$/ }, args => ({ path: args.path, external: true }))
      builder.onResolve({ filter: /\.node$/ }, args => ({ path: args.path, external: true }))
      builder.onResolve({ filter: /^@orca\/process-host(?:\/|$)/ }, async args => {
        const base = join(root, 'third_party/orca-v1.4.230/src/packages/process-host')
        const pkg = JSON.parse(await readFile(join(base, 'package.json'), 'utf8'))
        const key = args.path === '@orca/process-host' ? '.' : '.' + args.path.slice('@orca/process-host'.length)
        const entry = pkg.exports[key]?.['orca-source']
        assert.equal(typeof entry, 'string', `missing original process-host export ${key}`)
        return { path: resolve(base, entry) }
      })
      builder.onResolve({ filter: /^jsonc-parser$/ }, () => ({ path: join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') }))
    } }], entryPoints: [sourceEntry], outfile: bundle
  })
  const sourcePaths = [...new Set([fileURLToPath(import.meta.url), fileURLToPath(new URL('./process-incarnation-closure.mjs', import.meta.url)), join(root, 'runtime/swa-orca/src/controller-helper.ts'), ...Object.keys(built.metafile.inputs).map(path => resolve(root, path))])].sort()
  report.source_before = await Promise.all(sourcePaths.map(digest))
  report.install_before = await Promise.all([node, helper, executable, join(install, 'VERSION')].map(digest))
  report.node = { version: process.version, abi: process.versions.modules, arch: process.arch }
  report.base_version = await readFile(join(install, 'VERSION'), 'utf8')
  const production = await createRequire(bundle)(bundle).loadProduction(output, executable)
  requireInstalled('node-pty')
  if (process.platform === 'win32') await production.readWindowsProcessTableFresh()
  const addonPaths = async () => {
    const paths = await Promise.all(Object.keys(requireInstalled.cache).filter(path => path.endsWith('.node')).map(path => realpath(path)))
    assert.ok(paths.every(path => contains(install, path)), 'loaded native addon escaped the explicit installation')
    return [...new Set(paths)].sort()
  }
  readAddonPaths = addonPaths
  let addons = []
  const env = { PATH: process.env.PATH ?? '', HOME: join(output, 'home'), USERPROFILE: join(output, 'home'),
    APPDATA: join(output, 'home'), LOCALAPPDATA: join(output, 'home'), TMPDIR: join(output, 'temp'), TMP: join(output, 'temp'), TEMP: join(output, 'temp'),
    ORCA_USER_DATA: join(output, 'data'), ORCA_USER_DATA_PATH: join(output, 'data'), SWA_EXECUTABLE: executable, SWA_CONTROLLER_HELPER: '1' }
  for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key]

  const identity = async pid => {
    if (process.platform === 'linux') return production.readSwaLinuxProcess(pid)
    const row = (await production.readWindowsProcessTableFresh()).find(value => value.pid === pid)
    assert.ok(row?.creationTimeMs, 'actual Windows process creation time is required')
    return { pid: row.pid, ppid: row.ppid, name: row.name, creationTimeMs: row.creationTimeMs }
  }
  const requireIdentity = async expected => assert.deepEqual(await identity(expected.pid), expected, 'actual process incarnation changed')
  const requireAncestor = async (child, parent) => {
    if (process.platform === 'linux') return production.requireSwaLinuxAncestor(child, parent)
    const rows = await production.readWindowsProcessTableFresh()
    const closure = collectOwnedIncarnations(rows, parent)
    assert.equal(closure.rootVerified, true, 'actual Windows PTY root incarnation is unavailable')
    assert.deepEqual(closure.unknownRows, [], 'Windows ancestry contains unknown identities')
    assert.ok(closure.ownedRows.some(row => row.pid === child.pid && row.creationTimeMs === child.creationTimeMs), 'helper is outside the actual PTY incarnation closure')
    await requireIdentity(child)
    await requireIdentity(parent)
  }
  const absent = async identities => {
    if (process.platform === 'linux') return identities.every(value => production.isSwaLinuxProcessAbsent(value.pid))
    const rows = await production.readWindowsProcessTableFresh()
    return identities.every(value => !rows.some(row => row.pid === value.pid))
  }
  const packets = () => [undefined, actualInvocation, undefined].map(invocation => {
    const requestId = randomUUID()
    const text = JSON.stringify(production.helperInput.parse({ type: 'swa_controller_action', request_id: requestId, action: 'identify', ...(invocation ? { invocation } : {}) }))
    assert.ok(Buffer.byteLength(text) <= maxBytes, 'helper packet exceeds 1 MiB')
    return { request_id: requestId, text, bytes: Buffer.byteLength(text) }
  })
  const observe = () => {
    const replies = new Map(), rejected = []
    let stdout = '', stderr = '', rawStdout = '', rawStderr = '', error = null
    const framer = production.createIncrementalNdjsonFramer(value => {
      const parsed = production.helperReply.safeParse(value)
      if (parsed.success) replies.set(parsed.data.request_id, parsed.data)
    }, value => { rejected.push(value.kind); if (value.kind === 'line-too-long') error = new Error('helper reply exceeded output limit') }, { maxLineBytes: maxBytes })
    return { replies, rejected, get error() { return error }, get stdout() { return stdout }, get stderr() { return stderr }, get rawStdout() { return rawStdout },
      fail: value => { error ??= value },
      data(value, isError = false) {
        const raw = value.toString('utf8')
        if (Buffer.byteLength(rawStdout) + Buffer.byteLength(rawStderr) + Buffer.byteLength(raw) > maxBytes) { error = new Error('actual raw helper output exceeded 1 MiB'); return }
        const clean = stripVTControlCharacters(raw)
        if (isError) { rawStderr += raw; stderr += clean }
        else { rawStdout += raw; stdout += clean; framer.feed(clean) }
      }
    }
  }
  const waitUntil = async (condition, deadline, observation, message) => {
    while (!await condition()) {
      if (observation.error) throw observation.error
      assert.ok(Date.now() < deadline, message)
      await delay(25)
    }
    if (observation.error) throw observation.error
  }
  const checkReply = async (observation, packet, handle, rootIdentity, helperIdentity) => {
    const reply = observation.replies.get(packet.request_id)
    assert.equal(reply?.controller, handle)
    assert.deepEqual(reply.result, { ready: true })
    assert.equal(reply.error, undefined)
    const actual = await identity(reply.pid)
    if (helperIdentity) assert.deepEqual(actual, helperIdentity)
    await requireIdentity(rootIdentity)
    await requireAncestor(actual, rootIdentity)
    return actual
  }

  async function checkTty() {
    const result = report.tty = { status: 'FAIL', natural_eof: false, forced_cleanup: false, exit: null, root: null, helper: null, observations: [] }
    const sessionId = randomUUID(), input = packets(), handle = production.deriveRemoteRuntimeTerminalCreateHandle('swa-controller-local', randomUUID(), `${input[0].request_id}/controller-pty`)
    assert.ok(input[1].bytes > 4095, 'actual task packet must exercise the long-line boundary')
    const options = production.controllerTerminalOptions(node, helper, handle), observation = observe(), readiness = []
    const deadline = Date.now() + 25_000
    const host = new production.TerminalHost({ spawnSubprocess: production.createPtySubprocess, reportReadinessEvent: (event, details) => readiness.push({ event, details }) })
    // 复用正式发送器的分块、延迟和 CR；这里只观察本地 host 写入，不声称远程结算。
    const writer = new production.RuntimeTerminalWriter((id, text) => { host.write(id, text); return true })
    try {
      if (process.platform === 'win32') {
        assert.equal(options.shellOverride, 'pwsh.exe')
        assert.equal(production.resolveWindowsShellLaunchArgs('pwsh.exe', join(output, 'cwd'), join(output, 'cwd'), undefined, options.command).startupCommandDeliveredInShellArgs, true)
      } else assert.equal(Object.hasOwn(options, 'shellOverride'), false)
      const childEnv = { ...env, ...options.env, ORCA_TERMINAL_HANDLE: handle }
      const created = await host.createOrAttach({ sessionId, cwd: join(output, 'cwd'), cols: 120, rows: 40,
        command: options.command, startupCommandDelivery: options.startupCommandDelivery, shellOverride: options.shellOverride, env: childEnv,
        envToDelete: Object.keys(process.env).filter(key => !Object.keys(childEnv).some(allowed => allowed.toLowerCase() === key.toLowerCase())),
        cancelSignal: AbortSignal.timeout(25_000),
        shellReadySupported: production.shellPathSupportsPtyStartupBarrier(options.shellOverride ?? production.resolvePtyShellPath(childEnv)),
        streamClient: { onData: value => observation.data(value), onExit: (code, incarnationId, cause) => { result.exit = { code, incarnationId, cause } } }
      })
      result.spawn_incarnation = process.platform === 'linux' ? production.readSwaLinuxProcessIncarnation(created.pid) : await identity(created.pid)
      addons = await addonPaths()
      assert.ok(addons.length > 0 && addons.some(path => path.includes('node-pty')), 'actual installed node-pty addon must be loaded')
      report.addons_before = await Promise.all(addons.map(digest))
      for (const packet of input) {
        await writer.writeAction(sessionId, { text: packet.text, enter: true }, packet.text + '\r', { inputKind: 'driving', signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) })
        await waitUntil(() => observation.replies.has(packet.request_id) || result.exit, deadline, observation, 'TTY reply timed out')
        assert.equal(result.exit, null, 'helper exited before TTY reply')
        if (process.platform === 'linux') production.requireSwaLinuxIncarnation(result.spawn_incarnation)
        else await requireIdentity(result.spawn_incarnation)
        result.root ??= await identity(created.pid)
        result.helper = await checkReply(observation, packet, handle, result.root, result.helper)
        result.observations.push({ request_id: packet.request_id, bytes: packet.bytes, ready: true, pid: result.helper.pid })
      }
      host.write(sessionId, '\x04')
      await waitUntil(() => result.exit, deadline, observation, 'TTY Ctrl-D did not reach natural EOF')
      assert.equal(result.exit.code, 0)
      await waitUntil(() => absent([result.root, result.helper]), deadline, observation, 'observed TTY processes remain after EOF')
      assert.deepEqual(host.listSessions(), [])
      result.natural_eof = true
      result.status = 'PASS'
    } finally {
      result.forced_cleanup = result.exit === null
      try { await boundedCleanup(host.dispose(), 'TTY host') }
      finally {
        result.sessions_after_dispose = host.listSessions()
        result.readiness = readiness
        result.rejected_output = observation.rejected
        result.raw_output_bytes = Buffer.byteLength(observation.rawStdout)
        await save('tty-transcript.txt', observation.stdout)
        await save('tty-raw-transcript.txt', observation.rawStdout)
      }
    }
  }

  async function checkPipe() {
    const result = report.pipe = { status: 'FAIL', natural_eof: false, forced_cleanup: false, exit: null, helper: null, observations: [] }
    const input = packets(), handle = `pipe-controller-${randomUUID()}`, observation = observe(), deadline = Date.now() + 25_000
    assert.ok(input[1].bytes > 4095)
    const child = spawn(node, [helper], { cwd: join(output, 'cwd'), env: { ...env, ORCA_TERMINAL_HANDLE: handle }, stdio: ['pipe', 'pipe', 'pipe'] })
    child.stdout.on('data', value => observation.data(value))
    child.stderr.on('data', value => observation.data(value, true))
    child.stdin.on('error', value => observation.fail(value))
    child.on('error', value => observation.fail(value))
    const closed = new Promise(done => child.once('close', (code, signal) => { result.exit = { code, signal }; done() }))
    try {
      result.helper = await identity(child.pid)
      for (const packet of input) {
        child.stdin.write(packet.text + '\n')
        await waitUntil(() => observation.replies.has(packet.request_id) || result.exit, deadline, observation, 'pipe reply timed out')
        assert.equal(result.exit, null, 'helper exited before pipe reply')
        await checkReply(observation, packet, handle, result.helper, result.helper)
        result.observations.push({ request_id: packet.request_id, bytes: packet.bytes, ready: true, pid: result.helper.pid })
      }
      child.stdin.end()
      await waitUntil(() => result.exit, deadline, observation, 'pipe stdin EOF did not settle')
      await closed
      assert.equal(result.exit.code, 0)
      assert.equal(result.exit.signal, null)
      await waitUntil(() => absent([result.helper]), deadline, observation, 'pipe helper remains after EOF')
      result.natural_eof = true
      result.status = 'PASS'
    } finally {
      try {
        if (!result.exit) { result.forced_cleanup = true; child.kill('SIGKILL'); await boundedCleanup(closed, 'pipe helper') }
      } finally {
        result.rejected_output = observation.rejected
        await save('pipe-stdout.jsonl', observation.stdout)
        await save('pipe-stderr.log', observation.stderr)
      }
    }
  }
  await checkTty()
  await checkPipe()
  report.status = 'PASS'
} catch (error) {
  failure = error
  report.error = { name: error.name, message: error.message }
} finally {
  stopBuild()
  report.cleanup_unknown = cleanupUnknown
  try {
    for (const kind of ['install', 'source', 'addons']) {
      const before = report[`${kind}_before`]
      if (!before) continue
      const after = report[`${kind}_after`] = await Promise.all(before.map(value => digest(value.path)))
      assert.deepEqual(after, before, `${kind} inputs changed`)
    }
    if (report.addons_before) assert.deepEqual(await readAddonPaths(), report.addons_before.map(value => value.path), 'native addon inventory changed')
  } catch (error) {
    failure ??= error
    report.status = 'FAIL'
    report.input_guard_error = { name: error.name, message: error.message }
  }
  // 公开汇总不含 invocation、路径、环境或原进程命令行；完整原件只存本地私有目录。
  report.summary = { schema: report.schema, status: report.status, platform: report.platform,
    tty: report.tty && { status: report.tty.status, natural_eof: report.tty.natural_eof, forced_cleanup: report.tty.forced_cleanup, reply_count: report.tty.observations.length, long_bytes: report.tty.observations[1]?.bytes ?? null, exit_code: report.tty.exit?.code ?? null },
    pipe: report.pipe && { status: report.pipe.status, natural_eof: report.pipe.natural_eof, forced_cleanup: report.pipe.forced_cleanup, reply_count: report.pipe.observations.length, long_bytes: report.pipe.observations[1]?.bytes ?? null, exit_code: report.pipe.exit?.code ?? null },
    rpc_mutations: 'NOT_RUN', model_execution: 'NOT_RUN', kernel_job_empty: 'NOT_CLAIMED' }
  await save('report.json', JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(JSON.stringify(report.summary) + '\n')
}
if (failure) process.exitCode = 1
if (cleanupUnknown) process.exit(1)
