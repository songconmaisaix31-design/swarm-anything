import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rename, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/project-capabilities'), { recursive: true })
const directory = await mkdtemp(join(root, '.verification/project-capabilities/run-'))
function compile(name, entry) {
  const output = join(directory, name + '.cjs')
  buildSync({ entryPoints: [join(root, entry)], outfile: output, tsconfig: join(root, 'runtime/swa-orca/tsconfig.json'), bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['*.node'], nodePaths: [join(root, 'runtime/swa-orca/node_modules'), join(root, 'node_modules')], alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib', 'esm', 'main.js') }, logLevel: 'silent' })
  return createRequire(output)(output)
}
const { readDiscoveryProjectRoot, assertDiscoverySnapshot, observeAgentStage } = compile('discovery', 'runtime/swa-orca/src/agent-discovery.ts')
const { readAgentSettings } = compile('settings', 'runtime/swa-orca/src/agent-settings.ts')

// 仅真实普通目录/配置原文和快照规则；不启动 registry、账号、Agent、RPC 或模型。
test('actual project directory identity refuses aliases, non-directories and replacement', async t => {
  const project = join(directory, 'project')
  await mkdir(project)
  const observed = readDiscoveryProjectRoot(await realpath(project))
  assert.equal(observed.path, await realpath(project))
  assert.throws(() => readDiscoveryProjectRoot('relative'), /unavailable or redirected/)
  const file = join(directory, 'ordinary.txt')
  await writeFile(file, '公开普通文件\n', { flag: 'wx' })
  assert.throws(() => readDiscoveryProjectRoot(file), /unavailable or redirected/)
  const alias = join(directory, 'project-alias')
  try {
    await symlink(project, alias)
    assert.throws(() => readDiscoveryProjectRoot(alias), /unavailable or redirected/)
  } catch (error) {
    if (process.platform !== 'win32' || !['EPERM', 'EACCES'].includes(error.code)) throw error
    t.diagnostic('Windows directory symlink privilege unavailable; alias branch NOT_RUN')
  }
  if (process.platform === 'linux') {
    const differentCase = join(directory, 'Project')
    await mkdir(differentCase)
    assert.notDeepEqual(readDiscoveryProjectRoot(differentCase), observed)
  }
  await rename(project, project + '-moved')
  await mkdir(project)
  assert.notEqual(readDiscoveryProjectRoot(project).identity, observed.identity)
})

test('actual settings source and directory changes invalidate an observed discovery snapshot', async () => {
  const home = join(directory, 'empty-discovery-home'), profile = join(directory, 'explicit-profile'), project = join(directory, 'snapshot-project')
  await Promise.all([mkdir(home), mkdir(profile), mkdir(project)])
  const file = join(profile, 'orca-data.json')
  await writeFile(file, JSON.stringify({ settings: { disabledTuiAgents: [] } }), { flag: 'wx', mode: 0o600 })
  const originalHome = process.env.SWA_DISCOVERY_HOME, originalProfile = process.env.SWA_AGENT_PROFILE
  try {
    process.env.SWA_DISCOVERY_HOME = home
    process.env.SWA_AGENT_PROFILE = profile
    const before = await readAgentSettings(), observed = readDiscoveryProjectRoot(project)
    assert.doesNotThrow(() => assertDiscoverySnapshot(observed, before, before))
    assert.doesNotThrow(() => assertDiscoverySnapshot(observed, before, structuredClone(before)))
    await writeFile(file, JSON.stringify({ settings: { disabledTuiAgents: ['codex'] } }))
    const after = await readAgentSettings()
    assert.throws(() => assertDiscoverySnapshot(observed, before, after), /changed during discovery/)
    await rename(project, project + '-moved')
    await mkdir(project)
    assert.throws(() => assertDiscoverySnapshot(observed, after, after), /changed during discovery/)
  } finally {
    if (originalHome === undefined) delete process.env.SWA_DISCOVERY_HOME
    else process.env.SWA_DISCOVERY_HOME = originalHome
    if (originalProfile === undefined) delete process.env.SWA_AGENT_PROFILE
    else process.env.SWA_AGENT_PROFILE = originalProfile
  }
})

test('actual local read failures become safe discovery observations while selection throws the original error', async () => {
  const malformed = join(directory, 'public-malformed-settings.json')
  const ordinary = join(directory, 'public-valid-settings.json')
  await writeFile(malformed, '{ public-invalid-json', { flag: 'wx' })
  await writeFile(ordinary, JSON.stringify({ model: 'public-local-rule' }), { flag: 'wx' })
  let originalError
  const read = async () => {
    try { return JSON.parse(await readFile(malformed, 'utf8')) }
    catch (error) { originalError = error; throw error }
  }
  const rejected = await observeAgentStage('discovery', 'configuration', read)
  assert.equal(rejected.failure.status, 'unavailable')
  assert.equal(rejected.failure.source, 'native-configuration-invalid')
  assert.equal(rejected.value, undefined)
  assert.doesNotMatch(JSON.stringify(rejected), /public-invalid-json|public-malformed-settings|\.verification/)
  await assert.rejects(observeAgentStage('selection', 'configuration', read), error => error === originalError && error instanceof SyntaxError)
  const missing = await observeAgentStage('discovery', 'installation', () => realpath(join(directory, 'not-created')))
  assert.equal(missing.failure.source, 'native-installation-missing')
  assert.equal(missing.failure.status, 'unavailable')
  await assert.rejects(observeAgentStage('selection', 'installation', () => realpath(join(directory, 'not-created'))), { code: 'ENOENT' })
  // 真实文件错误之后仍可读取另一普通配置；没有启动或替代 Agent registry。
  const next = await observeAgentStage('discovery', 'configuration', async () => JSON.parse(await readFile(ordinary, 'utf8')))
  assert.deepEqual(next, { value: { model: 'public-local-rule' } })
  const directoryRead = await observeAgentStage('discovery', 'configuration', () => readFile(directory, 'utf8'))
  assert.equal(directoryRead.failure.status, 'unknown')
  assert.equal(directoryRead.failure.source, 'native-configuration-unverified')
  assert.doesNotMatch(JSON.stringify(directoryRead), /EISDIR|\.verification/)
})
