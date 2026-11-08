import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = require('esbuild')
const source = buildSync({ entryPoints: [join(root, 'runtime/swa-orca/src/darwin-model-configuration.ts')], bundle: true, write: false, platform: 'node', format: 'cjs', nodePaths: [join(root, 'runtime/swa-orca/node_modules')] }).outputFiles[0].text
const outputRoot = join(root, '.verification/macos-port2')
mkdirSync(outputRoot, { recursive: true })
const data = mkdtempSync(join(outputRoot, 'configuration-'))
function load(mocks = {}, platform = 'darwin') {
  const module = { exports: {} }
  runInNewContext(source, { module, exports: module.exports, require: name => mocks[name] ?? require(name), process: { platform, getuid: process.getuid, env: { SWA_DATA_DIR: data, SWA_NODE_EXECUTABLE: process.execPath, OPENAI_API_KEY: 'public-fixture', NODE_OPTIONS: '--invalid' } }, Buffer })
  return module.exports
}
const table = 'provider  model              context  max-out  thinking  images\nomlx      CyberTiel-MLX-MTP   8.2K     4.1K     no        no\n'
const input = { executable: join(homedir(), '.local/bin/pi'), home: homedir(), sourceHome: join(homedir(), '.pi/agent'), version: '1.5.0' }
const api = load()

test('official table preserves only the approved exact model', () => {
  const models = api.parseDarwinPiModels(table + 'other model 10K 1K yes yes\n')
  assert.equal(JSON.stringify(models), JSON.stringify([{ id: api.darwinPiModel, label: api.darwinPiModel, provider: 'omlx' }]))
})

test('missing, duplicate, malformed and fuzzy-only matches remain unverified', () => {
  for (const output of ['', 'No models available', table.replace('CyberTiel-MLX-MTP', 'CyberTiel-MLX-MTP2'), table + table.split('\n')[1], table.replace('8.2K', 'unknown'), table.replace('no        no', 'maybe     no'), table + 'unexpected warning\n']) {
    assert.throws(() => api.parseDarwinPiModels(output))
  }
})

test('probe invokes only official metadata with isolated environment and no auth file reads', () => {
  let call
  const fs = require('node:fs')
  const fake = load({
    'node:fs': { ...fs, realpathSync: path => path === input.executable ? join(homedir(), '.pi/agent/bin/pi') : fs.realpathSync(path), readFileSync: () => assert.fail('account content must not be read') },
    'node:child_process': { spawnSync(command, args, options) { call = { command, args, options }; return { status: 0, signal: null, stdout: table, stderr: '' } } }
  })
  const result = fake.observeDarwinPiConfiguration(input)
  assert.equal(result.account, undefined)
  assert.equal(result.catalog.origin, 'probe')
  assert.equal(result.catalog.availability, 'verified')
  assert.equal(call.command, input.executable)
  assert.equal(call.args[0], '--list-models')
  assert.equal(call.args[1], api.darwinPiModel)
  for (const flag of ['--offline', '--no-mcp', '--no-tools', '--no-extensions', '--no-context-files', '--no-session', '--no-approve']) assert.ok(call.args.includes(flag))
  assert.equal(call.options.env.PI_CODING_AGENT_DIR, input.sourceHome)
  assert.equal(call.options.env.OPENAI_API_KEY, undefined)
  assert.equal(call.options.env.NODE_OPTIONS, undefined)
  assert.ok(call.options.cwd.startsWith(data + '/'))
  assert.equal(call.options.env.HOME, call.options.cwd)
  assert.equal(call.options.shell, false)
})

test('unapproved version, model, platform and launcher are rejected before spawning', () => {
  const fake = load({ 'node:child_process': { spawnSync() { assert.fail('must not spawn') } } })
  for (const change of [{ version: '1.0.1' }, { requestedModel: 'other/model' }, { sourceHome: 'relative' }, { executable: process.execPath }]) assert.throws(() => fake.observeDarwinPiConfiguration({ ...input, ...change }))
  assert.throws(() => load({}, 'linux').observeDarwinPiConfiguration(input))
})

test('CLI errors, diagnostics and partial output never establish a catalog or leak diagnostics', () => {
  for (const result of [{ status: 1 }, { status: 0, signal: 'SIGTERM' }, { status: 0, error: new Error('private-marker') }, { status: 0, stderr: 'private-marker' }, { status: 0, stdout: 'incomplete' }]) {
    const fake = load({ 'node:child_process': { spawnSync() { return { stdout: table, stderr: '', signal: null, ...result } } } })
    assert.throws(() => fake.observeDarwinPiConfiguration(input), error => !error.message.includes('private-marker') && error.message.startsWith('darwin_pi_'))
  }
})

test('actual official Pi 1.5 lists the approved model without an inference request', { skip: process.platform !== 'darwin' || process.env.SWA_TEST_LOCAL_DISCOVERY !== '1' }, () => {
  const result = api.observeDarwinPiConfiguration(input)
  assert.equal(result.model, api.darwinPiModel)
  console.log(JSON.stringify({ configured: 'available', ...result, authenticated: 'unknown', control: 'unknown' }))
})

// 以下用构造的 registry 和 CLI 结果验证发现/选择规则，不声称真实 Worker 执行。
function discoveryFixture(agent = 'pi', env = {}) {
  const ts = require('typescript')
  const compiled = ts.transpileModule(readFileSync(join(root, 'runtime/swa-orca/src/agent-discovery.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2024 } }).outputText
  const snapshot = { home: data, settings: {}, launch: { disabledTuiAgents: [] }, source: 'constructed', revision: 1, version: 'constructed' }
  const calls = { models: 0, accounts: 0, policy: 0 }
  const failAccount = () => { calls.accounts++; throw new Error('constructed-account-refusal') }
  class OrchestrationError extends Error { constructor(code, message) { super(message); this.code = code } }
  const observation = (status, reason, source, basis) => ({ status, reason, source, basis })
  const mocks = {
    'node:fs/promises': { realpath: async path => path, readFile: async path => path.endsWith('VERSION') ? 'a'.repeat(40) : 'public-artifact' },
    './agent-settings': { readAgentSettings: async () => snapshot },
    './project-tools': { inspectProjectToolSupport: async () => ({ available: false, reason: 'Darwin shell unavailable' }) },
    './darwin-discovery': { darwinDiscoveryDirectories: () => [], readDarwinDiscoveryVersion: () => '1.5.0' },
    './darwin-model-configuration': { observeDarwinPiConfiguration() { calls.models++; return { model: api.darwinPiModel, provider: 'omlx', account: undefined, catalog: { origin: 'probe', availability: 'verified', models: [{ id: api.darwinPiModel, label: api.darwinPiModel, provider: 'omlx' }] } } } },
    './native-pi-policy': { inspectNativePiPolicy() { calls.policy++; assert.fail('Pi policy must not run') }, readNativePiFile: failAccount, requireNativePiSourceHome: failAccount },
    './native-codex-policy': { inspectNativeCodexAccountSource: failAccount },
    './execution-observation': { agentObservation: observation, describeAgentFeatures: () => ({}), modelCatalogObservation: () => ({ origin: 'unknown', availability: 'unverified', models: [] }) },
    './contracts': { agentCapabilitiesSchema: { parse: value => value }, agentSelectionSchema: { parse: value => value } }
  }
  const module = { exports: {} }
  runInNewContext(compiled, { module, exports: module.exports, process: { platform: 'darwin', env: { SWA_INSTALL_ROOT: data, ...env } }, Buffer, require(name) {
    if (mocks[name]) return mocks[name]
    if (name.startsWith('node:') || name === 'zod') return require(name)
    if (name.endsWith('/structured-agent-session-registry')) return { getStructuredAgentSessionHost: () => ({ deps: { agents: { registrations: () => [{ definition: { agent }, adapter: {} }] } } }) }
    if (name.endsWith('/structured-agent-command-resolution')) return { resolveStructuredAgentCommand: () => process.execPath }
    if (name.endsWith('/tui-agent-config')) return { isTuiAgent: () => true }
    if (name.endsWith('/acp-launch-specs')) return { ACP_LAUNCH_SPECS: [] }
    if (name.endsWith('/orchestration-error')) return { OrchestrationError }
    return {}
  } })
  return { api: module.exports, calls, runtime: { ensureStructuredAgentSessionHost: async () => {} } }
}

test('Darwin discovery reports CLI configuration and catalog but retains unknown authentication and control', async () => {
  const f = discoveryFixture()
  const result = await f.api.discoverAgents(f.runtime, {}, data)
  const pi = result.agents[0]
  assert.equal(pi.configured.status, 'available')
  assert.equal(pi.configured.account_source, undefined)
  assert.equal(pi.model_catalog.origin, 'probe')
  assert.equal(pi.model_catalog.models[0].id, api.darwinPiModel)
  assert.equal(pi.authenticated.status, 'unknown')
  for (const key of ['start', 'send', 'stop']) {
    assert.equal(pi.control[key].status, 'unknown')
    assert.match(pi.control[key].reason, /Pi 1\.5\.0.*合同未验证.*完整进程树释放 unknown/)
  }
  assert.equal(f.calls.accounts, 0)
})

test('Darwin Pi selection rejects unsupported_capability before configuration or native policy', async () => {
  const f = discoveryFixture()
  await assert.rejects(f.api.selectAgent(f.runtime, 'constructed-project', 'pi', api.darwinPiModel, data), error => error.code === 'unsupported_capability' && /Pi 1\.5\.0 原生会话合同未验证，完整进程树释放 unknown/.test(error.message))
  assert.deepEqual(f.calls, { models: 0, accounts: 0, policy: 0 })
})

test('Darwin Codex never falls back to OAuth or CODEX_HOME without explicit API-key home', async () => {
  const f = discoveryFixture('codex', { CODEX_HOME: '/must-not-read' })
  const result = await f.api.discoverAgents(f.runtime, {}, data)
  assert.equal(result.agents[0].configured.status, 'unavailable')
  assert.equal(result.agents[0].model_catalog.models.length, 0)
  assert.equal(f.calls.accounts, 0)
  const explicit = discoveryFixture('codex', { SWA_CODEX_API_KEY_HOME: '/explicit-constructed-source' })
  const refused = await explicit.api.discoverAgents(explicit.runtime, {}, data)
  assert.equal(explicit.calls.accounts, 1)
  assert.equal(refused.agents[0].configured.status, 'unknown')
})
