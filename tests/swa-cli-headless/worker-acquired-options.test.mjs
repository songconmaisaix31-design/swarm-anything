import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, realpath, symlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const output = join(root, '.verification/worker-approval-options-20261023')
await mkdir(output, { recursive: true })
const directory = await mkdtemp(join(output, 'rules-'))
const dependencies = await realpath(join(root, 'runtime/swa-orca/node_modules'))
await symlink(dependencies, join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
assert.equal(await realpath(join(directory, 'node_modules')), dependencies)
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { build, stop } = requireRuntime('esbuild')
const bundle = join(directory, 'acquired-options.cjs')
try {
  await build({
    stdin: { contents: "export { assertPiAcquiredRecord } from './runtime/swa-orca/src/pi-session-policy';", resolveDir: root },
    bundle: true, platform: 'node', target: 'node24', format: 'cjs', outfile: bundle, conditions: ['orca-source'],
    external: ['electron', 'node-pty', '@parcel/watcher', 'fsevents', '@orca/windows-security', '@orca/windows-registry', '@vscode/windows-process-tree', '@anthropic-ai/claude-agent-sdk'],
    banner: { js: 'var __swaModuleUrl = require("node:url").pathToFileURL(__filename).href;' }, define: { 'import.meta.url': '__swaModuleUrl', 'process.env.NODE_ENV': '"production"' }, logOverride: { 'empty-import-meta': 'error' },
    plugins: [{ name: 'original-native-externals', setup(builder) { builder.onResolve({ filter: /\.node$/ }, args => ({ path: args.path, external: true })) } },
      { name: 'original-jsonc-esm', setup(builder) { builder.onResolve({ filter: /^jsonc-parser$/ }, () => ({ path: join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') })) } }],
    nodePaths: [join(root, 'runtime/swa-orca/node_modules'), join(root, 'node_modules')], logLevel: 'error'
  })
} finally { stop() }
const rules = createRequire(import.meta.url)(bundle)

// pi04 实际非秘密 metadata 的纯规则投影；不构造完整原生回执、进程或提供者接口。
const sessionId = '35aa7dc5-e3a6-4f01-a1d0-0bcf4d639ef4'
const home = `/workspace/swa-worker-pi-04-zo0osP/data/pi-workers/89074d41-93e6-4e6a-9dbf-3fc6c7907d24/${sessionId}`
const nativeId = '01a167fd-f372-738c-88fb-c4e2d0f40417'
const sessionFile = `${home}/sessions/--workspace-swa-worker-pi-04-zo0osP-public-project--/2026-10-23T09-00-58-610Z_${nativeId}.jsonl`
const linkId = 'c5013342-c3ce-4256-83cf-523aa5529b4b'
const record = {
  sessionId, provider: 'pi', accountHome: { variable: 'PI_CODING_AGENT_DIR', path: home },
  options: { model: 'stepfun/step-3.5-flash', effort: 'off' },
  providerHandleChain: [{ linkId, handle: { transport: 'jsonl-rpc', agent: 'pi', nativeId: sessionFile }, origin: 'created', mintedAtFence: 1, observedAt: 1792746061430 }],
  lease: { runtimeFence: 1, claimStatus: 'live', unreconciled: false, provenHandleLinkId: linkId, ownerProcess: { hostId: 'local', pid: 428284, processStartTimeMs: 1792746057520, runtime: '43f87b77-03a2-4c6f-9bb8-7f992092b817' } }
}
const actual = {
  initial: { ...structuredClone(record), options: { model: record.options.model } }, record,
  generation: '11327e42-f697-417a-bc17-6aaeb4ff28f2', acquisitionGeneration: '11327e42-f697-417a-bc17-6aaeb4ff28f2',
  native: { sessionId: nativeId, sessionFile },
  state: { sessionId: nativeId, sessionFile, model: { provider: 'stepfun', id: 'step-3.5-flash' }, thinkingLevel: 'off' }
}

test('The actual Pi reported default agrees with persisted options and the original explicit model', () => {
  assert.doesNotThrow(() => rules.assertPiAcquiredRecord(actual))
  assert.notDeepEqual(actual.initial.options, actual.record.options)
})

test('Acquisition identity and actual provider link must remain bound', () => {
  for (const change of [
    value => { value.acquisitionGeneration = null },
    value => { value.generation = undefined },
    value => { value.record.sessionId = 'different-session' },
    value => { value.record.provider = 'codex' },
    value => { value.record.lease.runtimeFence++ },
    value => { value.record.lease.claimStatus = 'reserved' },
    value => { value.record.lease.unreconciled = true },
    value => { value.record.lease.ownerProcess = null },
    value => { value.record.accountHome.path += '/changed' },
    value => { value.record.lease.provenHandleLinkId = 'different-link' },
    value => { value.record.providerHandleChain[0].mintedAtFence++ },
    value => { value.record.providerHandleChain[0].handle.nativeId += '.changed' },
    value => { value.state.sessionId = 'different-native-session' },
    value => { value.native = undefined }
  ]) {
    const value = structuredClone(actual)
    change(value)
    assert.throws(() => rules.assertPiAcquiredRecord(value), /native_pi_acquired_record_unverifiable/)
  }
})

test('Options must equal the observed values and keep explicit selections', () => {
  for (const change of [
    value => { value.record.options.effort = 'high' },
    value => { value.record.options.model = 'stepfun/different-model' },
    value => { value.record.options.extra = 'unobserved' },
    value => { value.state.thinkingLevel = 'high' },
    value => { value.initial.options.effort = 'high' },
    value => { value.state.model.id = 'different-model'; value.record.options.model = 'stepfun/different-model' }
  ]) {
    const value = structuredClone(actual)
    change(value)
    assert.throws(() => rules.assertPiAcquiredRecord(value), /native_pi_acquired_options_changed/)
  }
})

process.stdout.write(JSON.stringify({ evidence: directory, coverage: 'pure recorded-metadata rules; no live owner claim', worker_model: 'NOT_RUN', windows_native: 'NOT_RUN' }) + '\n')
