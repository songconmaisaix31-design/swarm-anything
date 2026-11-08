import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { build, stop } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/recorded-export'), { recursive: true })
const directory = await mkdtemp(join(root, '.verification/recorded-export/case-'))
await symlink(await realpath(join(root, 'runtime/swa-orca/node_modules')), join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
const output = join(directory, 'export.cjs')

// 构造存储与账号读取端口，执行真实身份判断和凭据过滤；不声称真实模型或账号验收。
globalThis.swaExportRules = { snapshots: new Map(), changed: false }
const replacements = {
  'native-codex-policy': ['inspectNativeCodexPolicy', 'assertNativeCodexCurrent'],
  'native-claude-policy': ['inspectNativeClaudePolicy', 'assertNativeClaudeCurrent'],
  'native-pi-policy': ['inspectNativePiPolicy', 'assertNativePiSnapshotCurrent'],
  'native-opencode-policy': ['inspectNativeOpenCodePolicy', 'assertNativeOpenCodeCurrent']
}
try {
  await build({ stdin: { contents: [
    "export { validateRecordedRunExport } from './runtime/swa-orca/src/task-result';",
    "export { setStructuredAgentSessionHost } from './third_party/orca-v1.4.230/src/main/native-chat/agent-session-wire/structured-agent-session-registry';"
  ].join('\n'), resolveDir: root }, outfile: output, platform: 'node', format: 'cjs', target: 'node24', bundle: true,
  tsconfig: join(root, 'runtime/swa-orca/tsconfig.json'), conditions: ['orca-source'], logLevel: 'error',
  banner: { js: 'var __swaModuleUrl = require("node:url").pathToFileURL(__filename).href;' }, define: { 'import.meta.url': '__swaModuleUrl' },
  nodePaths: [join(root, 'runtime/swa-orca/node_modules'), join(root, 'node_modules')],
  external: ['electron', 'node-pty', '*.node', '@parcel/watcher', '@orca/windows-security', '@orca/windows-registry', '@vscode/windows-process-tree', '@anthropic-ai/claude-agent-sdk'],
  alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') },
  plugins: [{ name: 'constructed-account-read-ports', setup(builder) {
    builder.onResolve({ filter: /\/(native-(codex|claude|pi|opencode)-policy|agent-settings|agent-discovery)$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'account-port' }))
    builder.onLoad({ filter: /.*/, namespace: 'account-port' }, args => {
      const original = join(root, 'runtime/swa-orca/src', `${args.path}.ts`)
      let overrides
      if (args.path === 'agent-settings') overrides = 'export async function readAgentSettings() { return {} }'
      else if (args.path === 'agent-discovery') overrides = 'export function codexProtectedRoots() { return [] }'
      else {
        const [inspect, current] = replacements[args.path]
        overrides = `export async function ${inspect}(input) { return globalThis.swaExportRules.snapshots.get(input.sourceHome) }
          export function ${current}() { if (globalThis.swaExportRules.changed) throw new Error('constructed_source_changed') }`
      }
      return { contents: `export * from ${JSON.stringify(original)};\n${overrides}`, loader: 'js', resolveDir: root }
    })
  } }] })
} finally { stop() }
const { validateRecordedRunExport, setStructuredAgentSessionHost } = createRequire(output)(output)
after(() => { setStructuredAgentSessionHost(null); delete globalThis.swaExportRules })

async function fixture() {
  const scope = { project_id: 'constructed-project', controller: 'controller', run_id: 'run', root_task_id: 'root' }
  const rootTask = { id: 'root', run_id: 'run', parent_id: null, spec: JSON.stringify({ project_id: scope.project_id, spec: { max_workers: 4 } }) }
  const source = { path: join(directory, 'constructed-account'), version: 'constructed-version' }
  const dispatches = new Map(), receipts = new Map(), records = new Map(), snapshots = new Map()
  const inputKey = 'a'.repeat(64)
  for (const agent of ['codex', 'claude', 'pi', 'opencode']) {
    const sessionId = `session-${agent}`, dispatchId = `dispatch-${agent}`
    const privateRoot = join(directory, `private-${agent}`), home = join(privateRoot, sessionId)
    await mkdir(home, { recursive: true, mode: 0o700 })
    if (agent === 'pi') for (const name of ['appdata', 'localappdata', 'temp', 'xdg-config', 'xdg-data', 'xdg-cache', 'xdg-state', 'xdg-runtime', 'xdg-config-dirs', 'xdg-data-dirs']) await mkdir(join(home, name), { recursive: true, mode: 0o700 })
    const models = { codex: ['openai', 'gpt-5.5', 'openai-responses', 'https://api.openai.com/v1', 'codex-cli-0.163.0'], claude: ['anthropic', 'claude-opus-5', 'anthropic-messages', 'https://api.anthropic.com', 'claude-cli-2.1.284-sdk-0.3.284'], pi: ['test', 'test-model', 'openai-completions', 'https://example.invalid/v1', 'pi-cli-1.0.1'], opencode: ['stepfun', 'step-3.5-flash', 'openai-completions', 'https://api.stepfun.com/v1', 'opencode-cli-2.0.31'] }
    const [provider, model, api, baseUrl, contract] = models[agent]
    const account = { kind: agent === 'pi' ? 'pi-native-api-key-per-session' : agent === 'opencode' ? 'opencode-native-stepfun-api-key' : `${agent}-native-api-key`, provider, source_home: `${directory}/${agent}-source`, auth_source: source, private_root: privateRoot, model_target: { model_id: model, api, base_url: baseUrl } }
    if (agent === 'codex') account.catalog_source = source
    if (agent === 'pi') account.models_source = null
    if (agent === 'opencode') {
      Object.assign(account, { config_source: source, database_source: source, credential_id: 'constructed-credential', credential_updated_at: 1 })
      await writeFile(join(home, 'swa-input-key.json'), JSON.stringify({ key: inputKey }), { mode: 0o600 })
    }
    const policy = { schema: 'swa.native-launch.v1', account, tools: { mode: 'disabled', native_contract: contract } }
    const key = `constructed-${agent}-key-"\\\n-secret`
    snapshots.set(account.source_home, { policy, key, auth: { test: { key } } })
    const selection = { agent_id: agent, adapter: agent, execution_mode: 'structured', executable: '/constructed/cli', version: '1', model, provider, external_target: agent, settings_source: { kind: 'native' }, settings_revision: 1, configuration_version: '1', native_launch: policy }
    receipts.set(dispatchId, { selection, swa_input_binding: { parent_request: 'parent', child_request: 'child', dispatch_id: dispatchId, agent, execution_mode: 'structured', session_id: sessionId, operation_id: 'operation', runtime_fence: 1, consumer_generation: 1, body: {} } })
    const accountHome = agent === 'opencode' ? { kind: 'opencode', locator: { kind: 'private', root: home } } : { variable: { codex: 'CODEX_HOME', claude: 'CLAUDE_CONFIG_DIR', pi: 'PI_CODING_AGENT_DIR' }[agent], path: agent === 'claude' ? join(home, 'config') : home }
    records.set(sessionId, { sessionId, provider: agent, options: { model }, accountHome, location: { workspaceId: 'workspace', wslDistro: null } })
    dispatches.set(dispatchId, { id: dispatchId, task_id: `task-${agent}`, run_id: 'run', assignee_orca_session_id: sessionId, process_incarnation: `structured:${sessionId}` })
  }
  globalThis.swaExportRules.snapshots = snapshots
  globalThis.swaExportRules.changed = false
  const db = {
    getTask: id => id === 'root' ? rootTask : { id, run_id: 'run', parent_id: 'root' },
    getDispatchContextById: id => dispatches.get(id),
    getWorkerTerminalResourceByOwner: id => ({ process_incarnation: dispatches.get(id).process_incarnation }),
    getOrCreateLocalMutationCallerFingerprint: () => 'constructed-caller',
    db: { prepare: () => ({ all: (...args) => [{ receipt: JSON.stringify(receipts.get(args.at(-1))) }] }) }
  }
  setStructuredAgentSessionHost({ deps: { resolveWorkspacePath: async () => directory, store: { getRecord: id => records.get(id) } } })
  const view = { ...scope, dispatches: [...dispatches.values()].map(row => ({ id: row.id, task_id: row.task_id, recipient_session_id: row.assignee_orca_session_id })) }
  const validate = text => validateRecordedRunExport({ getOrchestrationDb: () => db }, scope, 'workspace', view, text)
  return { validate, dispatches, records, view, snapshots, inputKey }
}

test('recorded results need no native logs and reject credentials anywhere in the complete response', async () => {
  const value = await fixture()
  await value.validate(JSON.stringify({ native: { run_view: { root: { result: 'available' }, status: 'active' }, result: { completeness: 'partial' } } }))
  for (const key of [...value.snapshots.values()].map(row => row.key).concat(value.inputKey)) {
    for (const field of ['result', 'question', 'answer', 'handoff']) {
      await assert.rejects(value.validate(JSON.stringify({ native: { run_view: { [field]: key } } })), /contains_credential/)
    }
    await assert.rejects(value.validate(key), /contains_credential/)
  }
  globalThis.swaExportRules.changed = true
  await assert.rejects(value.validate('{}'), /source_changed/)
})

test('recorded export rejects original binding changes and cross-Run dispatches', async () => {
  const value = await fixture(), record = value.records.get('session-pi'), dispatch = value.dispatches.get('dispatch-pi')
  const other = { ...record, sessionId: 'another-session', accountHome: { ...record.accountHome, path: join(dirname(record.accountHome.path), 'another-session') } }
  value.records.set(other.sessionId, other)
  dispatch.assignee_orca_session_id = other.sessionId
  dispatch.process_incarnation = `structured:${other.sessionId}`
  value.view.dispatches.find(row => row.id === dispatch.id).recipient_session_id = other.sessionId
  await assert.rejects(value.validate('{}'), /Dispatch\/session binding/)
  dispatch.run_id = 'another-run'
  await assert.rejects(value.validate('{}'), /left its original Run/)
})
