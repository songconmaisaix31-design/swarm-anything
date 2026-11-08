import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { build } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/pi-morph-bridge'), { recursive: true })
const directory = await mkdtemp(join(root, '.verification/pi-morph-bridge/case-')), bundle = join(directory, 'contract.cjs')
// 仅用替身验证转发边界；真实 Pi、MCP 进程和模型链路由独立验收覆盖。
const built = await build({
  stdin: { contents: "export { default as register } from './runtime/swa-orca/src/pi-morph-extension'; export { strictPiMorphRawSchema, strictPiMorphMessageSchema, strictPiMorphCallParamsSchema, strictPiMorphListParamsSchema, strictPiMorphResultSchema, strictPiProjectRawSchema } from './third_party/orca-v1.4.230/src/main/pi/rpc-protocol'", resolveDir: root },
  platform: 'node', format: 'cjs', bundle: true, write: false,
  alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') },
  nodePaths: [join(root, 'runtime/swa-orca/node_modules')],
  plugins: [{ name: 'explicit-offline-fixtures', setup(build) {
    build.onResolve({ filter: /^(@modelcontextprotocol\/sdk\/client\/(index|stdio)\.js|@earendil-works\/pi-ai)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    build.onResolve({ filter: /^\.\/morph-config$/ }, args => args.importer.endsWith('pi-morph-extension.ts') ? { path: 'morph-config', namespace: 'fixture' } : undefined)
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents:
      args.path === 'morph-config' ? `export function readMorphDescriptor() { const f=globalThis.__morphFixture; if(f.changed) throw Error('changed'); return f.config; } export function morphBackendEnvironment(){return {APPROVED_BACKEND_KEY:'fixture-value'};}` :
      args.path === '@earendil-works/pi-ai' ? `export const Type={Unsafe:x=>x};` :
      args.path.includes('stdio') ? `export class StdioClientTransport { constructor(options) { globalThis.__morphFixture.transport=options; } }` :
      `export class Client {
        constructor(){globalThis.__morphFixture.client=this;}
        async connect(){const f=globalThis.__morphFixture; f.connects++; if(f.fail==='connect') throw Error('unconfirmed');}
        async listTools(){const f=globalThis.__morphFixture; f.calls.push({operation:'list'}); if(f.fail==='call') throw Error('unconfirmed'); return f.response;}
        async callTool(params){const f=globalThis.__morphFixture; f.calls.push({operation:'call',params}); if(f.fail==='call') throw Error('unconfirmed'); return f.response;}
        async close(){globalThis.__morphFixture.closes++; this.onclose?.();}
      }`
    }))
  } }]
})
await writeFile(bundle, built.outputFiles[0].contents)
const { register, strictPiMorphRawSchema, strictPiMorphMessageSchema, strictPiMorphCallParamsSchema, strictPiMorphListParamsSchema, strictPiMorphResultSchema, strictPiProjectRawSchema } = createRequire(bundle)(bundle)
const nativeId = '0199dc51-df41-7000-8000-000000000001'
const origin = { native_session_id: nativeId, assistant_entry_id: 'entry-a', tool_call_id: 'call-a' }

function harness() {
  const fixture = { connects: 0, closes: 0, calls: [], response: { content: [{ type: 'text', text: 'bound result' }], isError: false },
    config: { descriptor: { python: '/approved/python', cwd: '/approved/morph', host_config: '/approved/worker.json' }, source: { path: '/approved/bridge.json', version: 'one' }, hostSource: { path: '/approved/worker.json', version: 'two' } } }
  globalThis.__morphFixture = fixture
  const keys = { ORCA_AGENT_SESSION_ID: 'morph-worker', ORCA_AGENT_SESSION_SPAWN_TOKEN: 'proof', SWA_MORPH_CONFIG: '/approved/bridge.json', SWA_MORPH_CONFIG_VERSION: 'one', SWA_MORPH_HOST_CONFIG_VERSION: 'two' }
  const previous = Object.fromEntries(Object.keys(keys).map(key => [key, process.env[key]]))
  Object.assign(process.env, keys)
  const tools = new Map(), hooks = new Map()
  const pi = { getActiveTools: () => [...tools.keys()], registerTool: tool => tools.set(tool.name, tool), on: (name, callback) => hooks.set(name, callback) }
  register(pi)
  const invoke = (name, args, id = 'call-a', entries) => tools.get(name).execute(id, args, undefined, undefined, {
    sessionManager: { getSessionId: () => nativeId, getEntries: () => entries ?? [{ type: 'message', id: 'entry-' + id, message: { role: 'assistant', content: [{ type: 'toolCall', id, name, arguments: args }] } }] }
  })
  return { fixture, tools, hooks, invoke, async cleanup() {
    await hooks.get('session_shutdown')()
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value
    delete globalThis.__morphFixture
  } }
}

test('Morph frames accept only the two fixed tools and bounded JSON arguments', () => {
  const frame = { type: 'tool_execution_start', toolCallId: 'call-a', toolName: 'morph_call_tool', args: { name: 'discover_tasks', arguments: { limit: 5 } } }
  assert.deepEqual(strictPiMorphRawSchema.parse(frame), frame)
  assert.throws(() => strictPiProjectRawSchema.parse(frame))
  assert.throws(() => strictPiMorphRawSchema.parse({ ...frame, toolName: 'bash' }))
  assert.throws(() => strictPiMorphListParamsSchema.parse({ worker_id: 'other' }))
  for (const key of ['python', 'cwd', 'host_config', 'worker_id']) assert.throws(() => strictPiMorphCallParamsSchema.parse({ ...frame.args, [key]: 'other' }))
  assert.throws(() => strictPiMorphCallParamsSchema.parse({ name: 'write', arguments: { body: 'x'.repeat(256 * 1024) } }))
})

test('MCP error and unknown results survive native event and persisted message schemas', () => {
  const details = strictPiMorphResultSchema.parse({ schema: 'swa.native-morph.v1', operation: 'morph_call_tool', origin, state: 'completed', mcp_result: { content: [{ type: 'text', text: 'denied' }], isError: true } })
  const result = { content: [{ type: 'text', text: JSON.stringify(details) }], details, isError: true }
  assert.deepEqual(strictPiMorphRawSchema.parse({ type: 'tool_execution_end', toolCallId: 'call-a', toolName: 'morph_call_tool', result, isError: true }).result, result)
  const { isError, ...persistent } = result
  assert.equal(strictPiMorphMessageSchema.parse({ role: 'toolResult', toolCallId: 'call-a', toolName: 'morph_call_tool', ...persistent, isError, timestamp: 1 }).details.mcp_result.isError, true)
})

test('one fixed MCP connection forwards calls once and retains MCP isError', async () => {
  const h = harness()
  try {
    h.hooks.get('before_agent_start')()
    await h.invoke('morph_list_tools', {})
    h.fixture.response = { content: [{ type: 'text', text: 'denied' }], isError: true }
    const result = await h.invoke('morph_call_tool', { name: 'lease_task', arguments: { action: 'claim', task_id: 'one' } }, 'call-b')
    assert.equal(result.isError, true)
    assert.equal(result.details.mcp_result.isError, true)
    assert.equal(h.fixture.connects, 1)
    assert.equal(h.fixture.calls.length, 2)
    assert.deepEqual(h.fixture.transport.args, ['-m', 'swarm.research', '--config', '/approved/worker.json'])
    assert.equal(h.fixture.transport.command, '/approved/python')
    assert.equal(h.fixture.transport.cwd, '/approved/morph')
    assert.equal(h.fixture.transport.env.SWA_PROJECT_TOKEN, undefined)
    assert.equal(h.fixture.transport.env.APPROVED_BACKEND_KEY, 'fixture-value')
    const duplicate = await h.invoke('morph_call_tool', { name: 'lease_task', arguments: { action: 'claim', task_id: 'one' } }, 'call-b')
    assert.equal(duplicate.details.state, 'unknown')
    assert.equal(h.fixture.calls.length, 2)
  } finally { await h.cleanup() }
})

test('unknown delivery closes once and never reconnects or replays another tool call', async () => {
  const h = harness()
  try {
    h.fixture.fail = 'call'
    const first = await h.invoke('morph_call_tool', { name: 'lease_task', arguments: { action: 'claim', task_id: 'one' } })
    assert.equal(first.details.state, 'unknown')
    assert.equal(first.isError, true)
    h.fixture.fail = undefined
    const second = await h.invoke('morph_list_tools', {}, 'call-b')
    assert.equal(second.details.state, 'unknown')
    assert.equal(h.fixture.connects, 1)
    assert.equal(h.fixture.calls.length, 1)
    assert.ok(h.fixture.closes >= 1)
  } finally { await h.cleanup() }
})

test('changed arguments, duplicate native entries and changed configuration cannot reach MCP', async () => {
  const h = harness()
  try {
    const entry = { type: 'message', id: 'entry-a', message: { role: 'assistant', content: [{ type: 'toolCall', id: 'call-a', name: 'morph_list_tools', arguments: { unexpected: true } }] } }
    await assert.rejects(h.invoke('morph_list_tools', {}, 'call-a', [entry]), /arguments changed/)
    entry.message.content[0].arguments = {}
    await assert.rejects(h.invoke('morph_list_tools', {}, 'call-a', [entry, entry]), /not unique/)
    h.fixture.changed = true
    await assert.rejects(h.invoke('morph_list_tools', {}), /changed/)
    assert.equal(h.fixture.connects, 0)
    assert.equal(h.fixture.calls.length, 0)
  } finally { await h.cleanup() }
})
