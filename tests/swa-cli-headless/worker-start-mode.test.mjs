import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, realpath, symlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const output = join(root, '.verification/worker-structured-mode-20261023')
await mkdir(output, { recursive: true })
const directory = await mkdtemp(join(output, 'rules-'))
const home = join(directory, 'empty-home')
await mkdir(home, { mode: 0o700 })
const dependencies = await realpath(join(root, 'runtime/swa-orca/node_modules'))
await symlink(dependencies, join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
assert.equal(await realpath(join(directory, 'node_modules')), dependencies)
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { build, stop } = requireRuntime('esbuild')
const bundle = join(directory, 'production-rules.cjs')
try {
  await build({
    stdin: { contents: [
      "export { getDefaultPersistedState } from './third_party/orca-v1.4.230/src/shared/constants';",
      "export { decideWorkerStartMode, downgradeWorkerStartModeForHost } from './third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration-worker-start-mode';",
      "export { requireStructuredWorkerMode } from './runtime/swa-orca/src/agent-launch-admission';"
    ].join('\n'), resolveDir: root },
    bundle: true, platform: 'node', target: 'node24', format: 'cjs', outfile: bundle, conditions: ['orca-source'],
    external: ['electron', 'node-pty', '@parcel/watcher', 'fsevents', '@orca/windows-security', '@orca/windows-registry', '@vscode/windows-process-tree', '@anthropic-ai/claude-agent-sdk'],
    banner: { js: 'var __swaModuleUrl = require("node:url").pathToFileURL(__filename).href;' }, define: { 'import.meta.url': '__swaModuleUrl', 'process.env.NODE_ENV': '"production"' }, logOverride: { 'empty-import-meta': 'error' },
    plugins: [{ name: 'original-native-externals', setup(builder) { builder.onResolve({ filter: /\.node$/ }, args => ({ path: args.path, external: true })) } },
      { name: 'original-jsonc-esm', setup(builder) { builder.onResolve({ filter: /^jsonc-parser$/ }, () => ({ path: join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') })) } }],
    nodePaths: [join(root, 'runtime/swa-orca/node_modules'), join(root, 'node_modules')], logLevel: 'error'
  })
} finally { stop() }
const rules = createRequire(import.meta.url)(bundle)
const defaults = rules.getDefaultPersistedState(home).settings
const params = { agent: 'pi', worktree: 'current', model: 'stepfun/step-3.5-flash' }
const structuredSettings = { ...defaults, experimentalNativeChat: true, nativeChatProviders: {} }
const rejected = mode => assert.throws(() => rules.requireStructuredWorkerMode(mode.mode), { code: 'unsupported_capability', data: { effectsApplied: false } })

test('Original native defaults choose terminal and the SWA mode admission refuses it', () => {
  assert.equal(defaults.experimentalNativeChat, false)
  const mode = rules.decideWorkerStartMode({ params, settings: defaults })
  assert.deepEqual({ mode: mode.mode, preferred: mode.preferred, reason: mode.reason }, { mode: 'terminal', preferred: 'terminal', reason: 'user_default' })
  rejected(mode)
})

test('The existing native settings select structured for the approved Pi Worker', () => {
  const mode = rules.decideWorkerStartMode({ params, settings: structuredSettings })
  assert.equal(mode.mode, 'structured')
  assert.equal(mode.preferred, 'structured')
  assert.doesNotThrow(() => rules.requireStructuredWorkerMode(mode.mode))
})

test('A provider terminal override cannot pass the SWA structured requirement', () => {
  const mode = rules.decideWorkerStartMode({ params, settings: { ...structuredSettings, nativeChatProviders: { pi: false } } })
  assert.equal(mode.mode, 'terminal')
  rejected(mode)
})

test('Actual host-mode rule downgrades are rejected while supported structured mode passes', () => {
  const mode = rules.decideWorkerStartMode({ params, settings: structuredSettings })
  for (const support of [null, { supported: false, reason: 'agent' }, { supported: false, reason: 'remote' }, { supported: false, reason: 'wsl' }]) {
    const actual = rules.downgradeWorkerStartModeForHost(mode, support)
    assert.equal(actual.mode, 'terminal')
    assert.equal(actual.preferred, 'structured')
    rejected(actual)
  }
  const supported = rules.downgradeWorkerStartModeForHost(mode, { supported: true })
  assert.equal(supported.mode, 'structured')
  assert.doesNotThrow(() => rules.requireStructuredWorkerMode(supported.mode))
})

process.stdout.write(JSON.stringify({ evidence: directory, coverage: 'original_pure_mode_rules_and_product_guard', native_host_support: 'NOT_OBSERVED', worker_model: 'NOT_RUN', windows_native: 'NOT_RUN' }) + '\n')
