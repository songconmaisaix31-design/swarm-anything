import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/codex-native-rules'), { recursive: true })
const directory = await mkdtemp(join(root, '.verification/codex-native-rules/run-'))
function compile(name, entry) {
  const output = join(directory, name + '.cjs')
  buildSync({ entryPoints: [join(root, entry)], outfile: output, tsconfig: join(root, 'runtime/swa-orca/tsconfig.json'), bundle: true, platform: 'node', format: 'cjs', target: 'node24', nodePaths: [join(root, 'runtime/swa-orca/node_modules'), join(root, 'node_modules')], external: ['*.node'], alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib', 'esm', 'main.js') }, logLevel: 'silent' })
  return createRequire(output)(output)
}
const { createProviderRecordReader } = compile('record-reader', 'third_party/orca-v1.4.230/src/main/provider-process/provider-record-reader.ts')
const { nativeCodexAppServerArgs } = compile('configuration', 'runtime/swa-orca/src/native-codex-policy.ts')
const { createCodexAppServerRecordDispatcher } = compile('dispatcher', 'third_party/orca-v1.4.230/src/main/codex/codex-app-server-record-dispatch.ts')
const { isCodexSteerNotSubmitted, isApiOnlyCodexRequirements, isDisabledCodexRemoteControl } = compile('session-policy', 'runtime/swa-orca/src/codex-session-policy.ts')
const { readStructuredInputInventory, readRootResultInventory } = compile('task-result', 'runtime/swa-orca/src/task-result.ts')
const { OrchestrationDb } = compile('orchestration-db', 'third_party/orca-v1.4.230/src/main/runtime/orchestration/db/orchestration-db.ts')

// 这些文件仅保存真实文件元数据，验证普通 NDJSON/UTF-8 边界，不仿造原生 Agent 帧。
const observedPath = join(directory, '真实-�-metadata.json')
await writeFile(observedPath, '', { flag: 'wx', mode: 0o600 })
const observed = await lstat(observedPath, { bigint: true })
const metadata = { path: observedPath, pid: process.pid, inode: observed.ino.toString(), size: observed.size.toString() }
const bytes = Buffer.from(JSON.stringify(metadata) + '\n')
async function read(path, maximum = 1024 * 1024) {
  const stream = createReadStream(path, { highWaterMark: 1 })
  const result = { rows: [], failures: [], rejected: [], ended: false }
  createProviderRecordReader({ stdout: stream, maxLineBytes: maximum, requireTerminated: true, onRecord: value => result.rows.push(value), onRejected: value => result.rejected.push(value.kind), onFatal: error => result.failures.push(error.message), onEnd: () => { result.ended = true } })
  await new Promise(resolve => stream.once('close', resolve))
  return result
}

test('public Codex startup parameters fix API routing and keep authentication out of argv', () => {
  const args = nativeCodexAppServerArgs({ privateHome: directory, catalogPath: join(root, 'assets/codex-0.163.0/models.json') })
  assert.deepEqual(args.slice(-3), ['app-server', '--strict-config', '--stdio'])
  const config = new Map()
  for (let index = 0; index < args.length - 3; index += 2) {
    assert.equal(args[index], '-c')
    const separator = args[index + 1].indexOf('=')
    config.set(args[index + 1].slice(0, separator), JSON.parse(args[index + 1].slice(separator + 1)))
  }
  assert.equal(config.get('forced_login_method'), 'api')
  assert.equal(config.get('openai_base_url'), 'https://api.openai.com/v1')
  assert.equal(config.get('model'), 'gpt-5.5')
  assert.equal(config.get('model_provider'), 'openai')
  assert.equal(config.get('approval_policy'), 'never')
  assert.equal(config.get('features.plugins'), false)
  assert.equal(config.get('features.apps'), false)
  assert.deepEqual(config.get('notify'), [])
  assert.equal([...config.keys()].some(key => /api.key|access.token|apiKeyHelper|mcp_servers/.test(key)), false)
  assert.throws(() => nativeCodexAppServerArgs({ privateHome: 'relative', catalogPath: join(root, 'assets/codex-0.163.0/models.json') }), /configuration_paths_invalid/)
})

test('request admission reads the same waiter lifecycle that deletion, timeout and failure settle', async () => {
  // 这里只检查等待表的纯规则，没有发送或仿造任何原生响应。
  const dispatcher = createCodexAppServerRecordDispatcher({ handlers: {}, writeResponse() { assert.fail('unexpected response') }, onProtocolFailure() { assert.fail('unexpected protocol failure') } })
  const rejected = []
  const timers = []
  function add(id, timer) {
    timers.push(timer)
    dispatcher.addPending(id, { method: 'config/read', resolve() { assert.fail('unexpected reply') }, reject: error => rejected.push(error.message), timer })
    assert.equal(dispatcher.pendingMethod(id), 'config/read')
  }
  try {
    add(1, setTimeout(() => assert.fail('deleted waiter timer was not cleared'), 60_000))
    dispatcher.deletePending(1)
    clearTimeout(timers[0])
    assert.equal(dispatcher.pendingMethod(1), undefined)
    await new Promise(resolve => { add(2, setTimeout(() => { dispatcher.timeOutPending(2); resolve() }, 1)) })
    assert.equal(dispatcher.pendingMethod(2), undefined)
    add(3, setTimeout(() => assert.fail('failed waiter timer was not cleared'), 60_000))
    dispatcher.failPending(new Error('transport terminated'))
    assert.equal(dispatcher.pendingMethod(3), undefined)
    assert.deepEqual(rejected, ['transport terminated'])
  } finally { for (const timer of timers) clearTimeout(timer) }
})

test('uninvoked error classification contract accepts only the pinned no-active-steer rejection', () => {
  // 这些是纯分类输入合同，不是原生响应样本，也不验证真实 steer 竞态。
  const contract = { id: 1, error: { code: -32600, message: 'no active turn to steer' } }
  assert.equal(isCodexSteerNotSubmitted(contract, 'turn/steer'), true)
  assert.equal(isCodexSteerNotSubmitted({ ...contract, error: { ...contract.error, data: null } }, 'turn/steer'), true)
  assert.equal(isCodexSteerNotSubmitted(contract, 'turn/start'), false)
  assert.equal(isCodexSteerNotSubmitted(contract, undefined), false)
  for (const invalid of [
    { ...contract, method: 'turn/steer' }, { ...contract, result: null }, { ...contract, extra: true }, { ...contract, id: '1' },
    { ...contract, error: { ...contract.error, code: -32603 } }, { ...contract, error: { ...contract.error, data: {} } },
    { ...contract, error: { ...contract.error, message: contract.error.message + '\nprivate detail' } },
    { ...contract, error: { ...contract.error, extra: true } },
    { ...contract, error: { ...contract.error, message: 'cannot steer a compact turn' } }
  ]) assert.equal(isCodexSteerNotSubmitted(invalid, 'turn/steer'), false)
})

test('uninvoked control metadata contracts require API-only requirements and disabled remote control', () => {
  assert.equal(isApiOnlyCodexRequirements({ allowedLoginMethods: ['api'] }), true)
  assert.equal(isApiOnlyCodexRequirements({ allowedLoginMethods: ['api'], network: null }), true)
  for (const value of [null, {}, { allowedLoginMethods: ['api', 'chatgpt'] }, { allowedLoginMethods: [] }, { allowedLoginMethods: ['api'], network: {} }, { allowedLoginMethods: ['api'], unknown: null }]) assert.equal(isApiOnlyCodexRequirements(value), false)
  const contract = { method: 'remoteControl/status/changed', emittedAtMs: Date.now(), params: { status: 'disabled', serverName: 'uninvoked-contract', installationId: 'uninvoked-contract' } }
  assert.equal(isDisabledCodexRemoteControl(contract), true)
  assert.equal(isDisabledCodexRemoteControl({ ...contract, params: { ...contract.params, environmentId: null } }), true)
  for (const value of [{ ...contract, emittedAtMs: undefined }, { ...contract, emittedAtMs: -1 }, { ...contract, emittedAtMs: Number.MAX_SAFE_INTEGER + 1 }, { ...contract, id: 1 }, { ...contract, result: null }, { ...contract, params: { ...contract.params, status: 'connected' } }, { ...contract, params: { ...contract.params, environmentId: 'uninvoked-contract' } }, { ...contract, params: { ...contract.params, unknown: null } }]) assert.equal(isDisabledCodexRemoteControl(value), false)
})

test('real SQLite input inventory refuses a scoped product reservation before any child or journal binding', () => {
  // 只有真实 SQLite 中的准入输入合同；没有 Run、会话、原生帧或账号正向样本。
  const db = new OrchestrationDb(join(directory, 'input-inventory.db'))
  try {
    const scope = { project_id: randomUUID(), controller: 'uninvoked-contract', run_id: randomUUID(), root_task_id: randomUUID(), authority_domain: 'uninvoked-contract', context: null }
    const dispatchId = randomUUID(), requestId = randomUUID()
    assert.throws(() => readStructuredInputInventory(db, scope, dispatchId), /inventory is missing/)
    const receipt = JSON.stringify({ project_id: scope.project_id, run_id: scope.run_id, root_task_id: scope.root_task_id, action: 'worker.send', child_request: requestId + '/native', invocation: { command: { dispatch_id: dispatchId } } })
    const identity = { callerFingerprint: db.getOrCreateLocalMutationCallerFingerprint(), requestId, method: 'swa.controllerDeliver', payloadHash: createHash('sha256').update(receipt).digest('hex') }
    db.beginMutationReceipt(identity)
    db.checkpointPendingMutationReceipt({ ...identity, receipt })
    assert.throws(() => readStructuredInputInventory(db, scope, dispatchId), /input request is still pending or unknown/)
    const row = db.getMutationReceipt(identity.callerFingerprint, requestId)
    assert.equal(row.state, 'pending')
    assert.equal(JSON.parse(row.receipt).swa_input_binding, undefined)
    assert.equal(db.db.prepare("SELECT COUNT(*) AS count FROM mutation_receipts WHERE request_id=?").get(requestId + '/native').count, 0)
  } finally { db.close() }
})

test('real SQLite root inventory excludes unaccepted null receipts and rejects an accepted start without a child', () => {
  const db = new OrchestrationDb(join(directory, 'root-inventory.db'))
  try {
    // 这里只建立真实业务数据库元数据；没有 controller、Worker 或原生会话正向。
    const projectId = randomUUID(), run = db.createRun({ objective: 'uninvoked-contract', coordinatorHandle: null, coordinatorPaneKey: null })
    const rootTask = db.createTask({ runId: run.id, spec: JSON.stringify({ project_id: projectId, spec: { max_workers: 3 } }) })
    const scope = { project_id: projectId, controller: 'uninvoked-contract', run_id: run.id, root_task_id: rootTask.id, authority_domain: 'uninvoked-contract', context: null }
    const before = readRootResultInventory(db, scope, [])
    const requestId = randomUUID(), receipt = JSON.stringify({ project_id: projectId, run_id: run.id, root_task_id: rootTask.id, action: 'worker.start', child_request: requestId + '/native', invocation: { command: { request_id: requestId } } })
    const identity = { callerFingerprint: db.getOrCreateLocalMutationCallerFingerprint(), requestId, method: 'swa.controllerDeliver', payloadHash: createHash('sha256').update(receipt).digest('hex') }
    db.beginMutationReceipt(identity)
    assert.equal(readRootResultInventory(db, scope, []).signature, before.signature)
    db.checkpointPendingMutationReceipt({ ...identity, receipt })
    assert.throws(() => readRootResultInventory(db, scope, []), /accepted root Worker start.*pending reservation/)
    assert.equal(db.listTasksWithDispatch({ runId: run.id }).filter(task => task.parent_id === rootTask.id).length, 0)
  } finally { db.close() }
})

test('actual UTF-8 metadata bytes preserve legitimate replacement characters across byte boundaries', async () => {
  const path = join(directory, 'complete.ndjson')
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 })
  const actual = await read(path)
  assert.equal(actual.ended, true)
  assert.deepEqual(actual.rows, [metadata])
  assert.deepEqual(actual.failures, [])
  assert.deepEqual(actual.rejected, [])
})

test('real files with incomplete JSONL, invalid UTF-8 or an exceeded line bound never recover a complete EOF', async () => {
  const invalid = Buffer.from(bytes)
  invalid[invalid.indexOf(Buffer.from('真实'))] = 0xff
  for (const [name, body, cap] of [['missing-lf', bytes.subarray(0, -1), 1024 * 1024], ['invalid-utf8', invalid, 1024 * 1024], ['partial-utf8', Buffer.concat([bytes, Buffer.from([0xe4, 0xb8])]), 1024 * 1024], ['bom', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]), 1024 * 1024], ['bounded', bytes, 8]]) {
    const path = join(directory, name + '.ndjson')
    await writeFile(path, body, { flag: 'wx', mode: 0o600 })
    const actual = await read(path, cap)
    assert.equal(actual.ended, false, name)
    assert.ok(actual.failures.length || actual.rejected.length, name)
  }
  const absent = await read(join(directory, 'actually-absent.ndjson'))
  assert.equal(absent.ended, false)
  assert.ok(absent.failures.length)
})
