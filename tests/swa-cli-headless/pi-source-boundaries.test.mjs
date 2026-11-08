import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, realpath, rename, symlink, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const esbuild = requireRuntime('esbuild')
await mkdir(join(root, '.verification/pi-source-boundaries'), { recursive: true, mode: 0o700 })
const directory = await mkdtemp(join(root, '.verification/pi-source-boundaries/run-'))
const output = join(directory, 'sources.cjs')
try {
  await esbuild.build({ stdin: { contents: `export * from './native-pi-policy'; export * from './private-pi-account'; export * from './pi-session-policy'; export * from './pi-session-result';`, resolveDir: join(root, 'runtime/swa-orca/src'), loader: 'ts' },
    absWorkingDir: root, outfile: output, bundle: true, platform: 'node', format: 'cjs', target: 'node24', logLevel: 'silent',
    nodePaths: [join(root, 'runtime/swa-orca/node_modules'), join(root, 'node_modules')],
    conditions: ['orca-source'], banner: { js: 'var __swaModuleUrl = require("node:url").pathToFileURL(__filename).href;' },
    define: { 'import.meta.url': '__swaModuleUrl', 'process.env.NODE_ENV': '"production"' },
    logOverride: { 'empty-import-meta': 'error' }, sourcemap: false, minify: false,
    alias: { '@orca/windows-security': join(root, 'third_party/orca-v1.4.230/native/windows-security/index.js') },
    external: ['electron', 'node-pty', '@parcel/watcher', 'fsevents', '@orca/windows-registry', '@vscode/windows-process-tree', '@anthropic-ai/claude-agent-sdk', join(root, 'third_party/orca-v1.4.230/native/windows-security/index.js')],
    plugins: [{ name: 'swa-process-host-source', setup(builder) { builder.onResolve({ filter: /^@orca\/process-host(?:\/|$)/ }, async args => {
      const base = join(root, 'third_party/orca-v1.4.230/src/packages/process-host')
      const pkg = JSON.parse(await readFile(join(base, 'package.json'), 'utf8'))
      const key = args.path === '@orca/process-host' ? '.' : '.' + args.path.slice('@orca/process-host'.length)
      const entry = pkg.exports[key]?.['orca-source']
      if (typeof entry !== 'string') throw new Error('Missing exact process-host source export')
      return { path: join(base, entry) }
    }) } }, { name: 'swa-native-addons', setup(builder) { builder.onResolve({ filter: /\.node$/ }, args => ({ path: args.path, external: true })) } },
    { name: 'swa-jsonc-esm', setup(builder) { builder.onResolve({ filter: /^jsonc-parser$/ }, () => ({ path: join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') })) } }] })
} finally { await esbuild.stop() }
const api = createRequire(output)(output)
const data = join(directory, 'data')
await mkdir(data, { mode: 0o700 })
const oldData = process.env.SWA_DATA_DIR
process.env.SWA_DATA_DIR = data
test.after(() => { if (oldData === undefined) delete process.env.SWA_DATA_DIR; else process.env.SWA_DATA_DIR = oldData })

test('project container and real minted session directories remain exclusive', async () => {
  const projectId = randomUUID(), sessionId = randomUUID()
  const privateRoot = await api.createPrivatePiProjectRoot(projectId)
  assert.equal(privateRoot, join(data, 'pi-workers', projectId))
  const first = await api.createPrivatePiSessionHome(privateRoot, sessionId)
  assert.equal(first, join(privateRoot, sessionId))
  await api.preparePrivatePiEnvironment(first)
  await assert.rejects(api.createPrivatePiSessionHome(privateRoot, sessionId), { code: 'EEXIST' })
  const second = await api.createPrivatePiSessionHome(privateRoot, randomUUID())
  assert.notEqual(first, second)
  assert.equal((await lstat(first)).mode & 0o777, 0o700)
  assert.equal((await lstat(second)).mode & 0o777, 0o700)
  const env = api.privatePiEnvironment(first, { PATH: '/usr/bin', Path: 'must-not-be-promoted', OPENAI_API_KEY: 'public-negative-marker', GOOGLE_APPLICATION_CREDENTIALS: '/public/never-read', NODE_OPTIONS: '--require=/public/never-read' })
  assert.equal(env.PATH, '/usr/bin')
  for (const key of ['Path', 'OPENAI_API_KEY', 'GOOGLE_APPLICATION_CREDENTIALS', 'NODE_OPTIONS']) assert.equal(env[key], undefined)
  for (const key of ['TMPDIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_DIRS', 'XDG_DATA_DIRS']) assert.equal((await lstat(env[key])).mode & 0o777, 0o700)
})

test('source metadata rejects overlaps and linked account leaves before content is read', async () => {
  const source = join(directory, 'public-source'), protectedRoot = join(directory, 'protected')
  await mkdir(source, { mode: 0o700 }); await mkdir(protectedRoot, { mode: 0o700 })
  const outside = join(directory, 'outside-public.txt')
  await writeFile(outside, 'public malformed text, not credentials', { mode: 0o600 })
  await symlink(outside, join(source, 'auth.json'))
  await assert.rejects(api.requireNativePiSourceHome({ sourceHome: source, protectedRoots: [protectedRoot], env: {} }), /redirected/)
  await assert.rejects(api.requireNativePiSourceHome({ sourceHome: source, protectedRoots: [directory], env: {} }), /overlap/)
  await assert.rejects(api.requireNativePiSourceHome({ sourceHome: source, protectedRoots: [join(source, 'future')], env: {} }), /overlap/)
  const clean = join(directory, 'protected-neighbor')
  await mkdir(clean, { mode: 0o700 })
  assert.equal(await api.requireNativePiSourceHome({ sourceHome: clean, protectedRoots: [protectedRoot], env: {} }), clean)
  await chmod(clean, 0o755)
  await assert.rejects(api.requireNativePiSourceHome({ sourceHome: clean, protectedRoots: [protectedRoot], env: {} }), /permissions/)
})

test('bounded FD reader rejects oversized and linked real files', async () => {
  const file = join(directory, 'bounded-public.json'), link = join(directory, 'bounded-link.json')
  await writeFile(file, '{"public":true}\n', { mode: 0o600 })
  assert.throws(() => api.readNativePiFile(file, 3), /bound/)
  assert.equal(api.readNativePiFile(file, 64).bytes.toString(), '{"public":true}\n')
  await symlink(file, link)
  assert.throws(() => api.readNativePiFile(link, 64), /redirected/)
})

test('actual proper-lockfile guard releases a real lock and rejects reentry', async () => {
  const home = join(directory, 'settings-normal')
  await mkdir(home, { mode: 0o700 })
  const path = join(home, 'settings.json')
  await writeFile(path, JSON.stringify(api.nativePiSettings), { mode: 0o600 })
  const guard = api.acquirePrivatePiSettingsGuardSync(path)
  assert.equal(guard.assertCurrent().path, path)
  assert.equal((await lstat(path + '.lock')).isDirectory(), true)
  assert.throws(() => api.acquirePrivatePiSettingsGuardSync(path), /guard_active/)
  guard.release()
  await assert.rejects(lstat(path + '.lock'), { code: 'ENOENT' })
  const next = api.acquirePrivatePiSettingsGuardSync(path)
  next.assertCurrent(); next.release()
})

test('actual replacement holder survives guarded release and keeps the failed path blocked', async () => {
  const home = join(directory, 'settings-replaced')
  await mkdir(home, { mode: 0o700 })
  const path = join(home, 'settings.json')
  await writeFile(path, JSON.stringify(api.nativePiSettings), { mode: 0o600 })
  const guard = api.acquirePrivatePiSettingsGuardSync(path)
  await rename(path + '.lock', path + '.lock-original')
  await mkdir(path + '.lock', { mode: 0o700 })
  const foreign = await lstat(path + '.lock', { bigint: true })
  assert.throws(() => guard.assertCurrent(), /identity/)
  assert.throws(() => guard.release(), /identity/)
  assert.equal((await lstat(path + '.lock', { bigint: true })).ino, foreign.ino)
  assert.throws(() => api.acquirePrivatePiSettingsGuardSync(path), /guard_active/)
})

test('actual removed holder is not silently released through ENOENT', async () => {
  const home = join(directory, 'settings-missing')
  await mkdir(home, { mode: 0o700 })
  const path = join(home, 'settings.json')
  await writeFile(path, JSON.stringify(api.nativePiSettings), { mode: 0o600 })
  const guard = api.acquirePrivatePiSettingsGuardSync(path)
  await rename(path + '.lock', path + '.moved')
  assert.throws(() => guard.release(), error => error.code === 'EPI_LOCK_IDENTITY')
  assert.throws(() => guard.release(), error => error.code === 'EPI_LOCK_IDENTITY')
  assert.equal((await lstat(path + '.moved')).isDirectory(), true)
})

test('native mutable settings are checked semantically under each actual lock', async () => {
  const home = join(directory, 'settings-semantic')
  await mkdir(home, { mode: 0o700 })
  const path = join(home, 'settings.json')
  await writeFile(path, JSON.stringify(api.nativePiSettings), { mode: 0o600 })
  const before = api.acquirePrivatePiSettingsGuardSync(path)
  before.assertCurrent(); before.release()
  await writeFile(path, JSON.stringify(api.nativePiSettings, null, 2), { mode: 0o600 })
  const formatted = api.acquirePrivatePiSettingsGuardSync(path)
  formatted.assertCurrent(); formatted.release()
  await writeFile(path, '{"compaction":{"enabled":true}}', { mode: 0o600 })
  const changed = api.acquirePrivatePiSettingsGuardSync(path)
  assert.throws(() => changed.assertCurrent(), /settings_changed/)
  changed.release()
})

test('official source table pins the real package closure and rejects a changed copy', { timeout: 30_000 }, async () => {
  const cli = process.env.SWA_PI_TEST_CLI
  assert.ok(cli, 'SWA_PI_TEST_CLI must select the approved public installation')
  assert.ok(process.env.SWA_INSTALL_ROOT && process.env.SWA_NODE_EXECUTABLE, 'the actual installed Node must run this test')
  const pins = JSON.parse(await readFile(join(root, 'runtime/swa-orca/src/pi-official-sources.json'), 'utf8'))
  assert.equal(pins.files.length, 1128)
  assert.equal(new Set(pins.files.map(pin => pin.path)).size, 1128)
  const actual = await api.inspectNativePiSources(cli, '1.0.1', {})
  assert.equal(actual.pinnedFiles.length, 1128)
  api.assertNativePiSourcesCurrent(actual)
  const copyRoot = join(directory, 'official-copy/node_modules')
  await mkdir(copyRoot, { recursive: true, mode: 0o700 })
  const packageNames = [...new Set(pins.files.map(pin => pin.path.startsWith('@') ? pin.path.split('/').slice(0, 2).join('/') : pin.path.split('/')[0]))]
  const originalModules = dirname(dirname(dirname(dirname(dirname(await realpath(cli))))))
  // 复制公开安装的实际包，不制作CLI脚本、认证材料或成功协议帧。
  for (const name of packageNames) {
    const original = join(originalModules, name)
    await mkdir(dirname(join(copyRoot, name)), { recursive: true, mode: 0o700 })
    await cp(original, join(copyRoot, name), { recursive: true, dereference: true, errorOnExist: true, force: false })
  }
  const copiedCli = join(copyRoot, '@earendil-works/pi-coding-agent/dist/bundle/cli.js')
  const copied = await api.inspectNativePiSources(copiedCli, '1.0.1', {})
  const home = join(directory, 'public-model-metadata')
  await mkdir(home, { mode: 0o700 })
  const publicModels = { providers: { stepfun: { api: 'openai-completions', baseUrl: 'https://api.stepfun.com/v1', models: [{ id: 'step-3.5-flash' }] } } }
  await writeFile(join(home, 'models.json'), JSON.stringify(publicModels), { mode: 0o600 })
  const metadata = await api.inspectPrivatePiModelMetadata({ sources: copied, privateHome: home, provider: 'stepfun',
    target: { model_id: 'step-3.5-flash', api: 'openai-completions', base_url: 'https://api.stepfun.com/v1' }, expectedModels: publicModels })
  assert.equal(metadata.models.length, 1)
  assert.equal(metadata.models[0].id, 'step-3.5-flash')
  assert.equal(metadata.modelsSource.path, join(home, 'models.json'))
  const changed = copied.pinnedFiles[0].path
  await writeFile(changed, (await readFile(changed, 'utf8')) + '\n')
  assert.throws(() => api.assertNativePiSourcesCurrent(copied), /changed/)
  await assert.rejects(api.inspectNativePiSources(copiedCli, '1.0.1', {}), /mismatch|bound/)
})
