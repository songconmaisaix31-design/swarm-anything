import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
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
      "export { setAppEnvironment } from './third_party/orca-v1.4.230/src/shared/app-environment';",
      "export { decideWorkerStartMode, downgradeWorkerStartModeForHost } from './third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration-worker-start-mode';",
      "export { requireStructuredWorkerMode, installAgentLaunchAdmission } from './runtime/swa-orca/src/agent-launch-admission';",
      "export { admitStructuredWorkerModelLaunch, admitStructuredWorkerSessionOptions, admitStructuredAgentCreateCommandSettings, installStructuredAgentLaunchAdmission } from './third_party/orca-v1.4.230/src/main/runtime/structured-agent-launch-composition';",
      "export { structuredWorkerIdentities } from './third_party/orca-v1.4.230/src/main/runtime/structured-worker-identity';",
      "export { structuredLaunchSeedOptions } from './third_party/orca-v1.4.230/src/shared/native-chat-session-option-defaults';",
      "export { prepareStructuredAgentSessionCreateForWorktree } from './third_party/orca-v1.4.230/src/main/runtime/rpc/methods/structured-agent-session-create';",
      "export { foundAgentSessionRecord } from './third_party/orca-v1.4.230/src/main/runtime/agent-session-record-founding';",
      "export { structuredAgentSessionLaunchPermission } from './third_party/orca-v1.4.230/src/main/native-chat/agent-session-wire/structured-agent-session-launch-permission';",
      "export { acpStructuredLaunchPart } from './third_party/orca-v1.4.230/src/main/acp/acp-structured-launch-resolution';",
      "export { acpLaunchSpecFor } from './third_party/orca-v1.4.230/src/main/acp/acp-launch-specs';",
      "export { startLocalWorker } from './third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/worker/local-worker-start';",
      "export { checkAgentLaunchModelPreferences } from './third_party/orca-v1.4.230/src/shared/agent-launch-model-preferences';",
      "export { OrchestrationDb } from './third_party/orca-v1.4.230/src/main/runtime/orchestration/db';",
      "export { hashCanonical, replayStableCallerParams } from './third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-receipt';",
      "export { workerTaskSpec } from './runtime/swa-orca/src/collaboration-records';"
    ].join('\n'), resolveDir: root },
    bundle: true, platform: 'node', target: 'node24', format: 'cjs', outfile: bundle, conditions: ['orca-source'],
    external: ['electron', 'node-pty', '@parcel/watcher', 'fsevents', '@orca/windows-security', '@orca/windows-registry', '@vscode/windows-process-tree', '@anthropic-ai/claude-agent-sdk'],
    banner: { js: 'var __swaModuleUrl = require("node:url").pathToFileURL(__filename).href;' }, define: { 'import.meta.url': '__swaModuleUrl', 'process.env.NODE_ENV': '"production"' }, logOverride: { 'empty-import-meta': 'error' },
    plugins: [{ name: 'original-native-externals', setup(builder) { builder.onResolve({ filter: /\.node$/ }, args => ({ path: args.path, external: true })) } },
      { name: 'original-jsonc-esm', setup(builder) { builder.onResolve({ filter: /^jsonc-parser$/ }, () => ({ path: join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') })) } },
      { name: 'constructed-permission-discovery', setup(builder) {
        builder.onResolve({ filter: /^\.\/agent-discovery$/ }, args => args.importer === join(root, 'runtime/swa-orca/src/agent-launch-admission.ts') ? { path: 'permission-discovery', namespace: 'constructed-rule' } : undefined)
        builder.onLoad({ filter: /.*/, namespace: 'constructed-rule' }, () => ({ contents: `export { codexProtectedRoots } from ${JSON.stringify(join(root, 'runtime/swa-orca/src/agent-discovery.ts'))}; export const selectAgent = (...args) => globalThis[Symbol.for('swa.constructed.permission.discovery')](...args);`, resolveDir: root }))
      } }],
    nodePaths: [join(root, 'runtime/swa-orca/node_modules'), join(root, 'node_modules')], logLevel: 'error'
  })
} finally { stop() }
const rules = createRequire(import.meta.url)(bundle)
rules.setAppEnvironment({ getPath: () => home, getAppPath: () => directory, getVersion: () => 'constructed-rule', isPackaged: () => false, onWillQuit() {}, exit() { throw new Error('The rule must not exit the process') }, getAppMetrics: () => [] })
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

// 构造 SQLite reservation 与 HTTP 批准替身仅检验准入规则，不代表真实 Controller 或模型执行。
function modelAdmissionCase() {
  const db = new rules.OrchestrationDb(join(directory, `model-${randomUUID()}.sqlite`))
  const project = randomUUID(), request = randomUUID(), controller = 'term-rule-controller', pane = 'rule-pane'
  const context = { id: randomUUID(), project_id: project, settings_revision: 1, files: null }
  const run = db.createRun({ objective: 'Constructed model admission rule', coordinatorHandle: controller, coordinatorPaneKey: pane })
  const rootTask = db.createTask({ runId: run.id, spec: JSON.stringify({ project_id: project, context }) })
  const fingerprint = db.getOrCreateLocalMutationCallerFingerprint()
  const scope = { project_id: project, controller, run_id: run.id, root_task_id: rootTask.id, authority_domain: fingerprint, context }
  const owner = { project_id: project, controller, worktree_id: 'rule-workspace', scope,
    binding: { ptyId: 'rule-pty', processIncarnation: 'rule-incarnation', generation: 1 },
    process: { pid: 1, creationTimeMs: 1, name: 'constructed' }, helper: { pid: 1, creationTimeMs: 1, name: 'constructed' },
    caller_authority: { terminalHandle: controller, paneKey: pane, processIncarnation: 'rule-incarnation', launchTokenHash: 'rule-launch', hostScope: { kind: 'local' } } }
  const open = { callerFingerprint: fingerprint, requestId: randomUUID(), method: 'swa.controllerOpen', payloadHash: 'constructed-controller-rule' }
  db.beginMutationReceipt(open)
  db.completeMutationReceipt({ ...open, receipt: JSON.stringify(owner) })
  const source = name => ({ path: join(directory, name), version: 'constructed-unread-source' })
  const selection = { agent_id: 'opencode', adapter: 'opencode-acp', execution_mode: 'structured', executable: join(directory, 'unexecuted-opencode'), version: '2.0.31',
    model: 'stepfun/step-3.5-flash', provider: 'stepfun', external_target: 'opencode', settings_source: { kind: 'native' }, settings_revision: 1, configuration_version: 'rule',
    native_launch: { schema: 'swa.native-launch.v1', account: { kind: 'opencode-native-stepfun-api-key', provider: 'stepfun', source_home: join(directory, 'unread-account'), config_source: source('unread-config'), auth_source: source('unread-auth'), database_source: source('unread-database'), credential_id: 'unread-credential', credential_updated_at: 1, private_root: join(directory, 'uncreated-private-account'), model_target: { model_id: 'step-3.5-flash', api: 'openai-completions', base_url: 'https://api.stepfun.com/v1' } }, tools: { mode: 'disabled', native_contract: 'opencode-cli-2.0.31' } } }
  const invocation = { command: { action: 'worker.start', request_id: request, controller, name: 'Rule Worker', agent: selection.agent_id, model: selection.model },
    caller: { id: 'rule-caller', kind: 'human', project_id: project, settings_revision: 1 }, project: { id: project, root: directory }, scope, selection,
    spec: { goal: 'Rule input', source_repo: 'public-rule', source_revision: 'rule', success_criteria: ['Inspect the rule'], max_workers: 2 }, input: { path: 'unread-input', version: 'rule', text: 'Constructed public rule input' } }
  const receipt = { action: 'worker.start', child_request: `${request}/native`, project_id: project, controller, run_id: run.id, root_task_id: rootTask.id, invocation, selection }
  const parent = { callerFingerprint: fingerprint, requestId: request, method: 'swa.controllerDeliver', payloadHash: rules.hashCanonical(invocation) }
  db.beginMutationReceipt(parent)
  const save = () => db.checkpointPendingMutationReceipt({ ...parent, receipt: JSON.stringify(receipt) })
  save()
  let probes = 0
  const stopBeforePlacement = new Error('constructed-rule-stop-before-placement')
  const runtime = { getOrchestrationDb: () => db, getTerminalPaneKey: () => pane, showTerminal: async () => ({ worktreeId: owner.worktree_id }),
    resolveOrchestrationAgentLauncher: agent => agent, validateOrchestrationAgentLauncher() {},
    probeOrchestrationOpenCodeModelLaunchSupport: async () => { probes++; return false },
    showManagedTerminalWorkspace: async () => { throw stopBeforePlacement } }
  const params = { from: controller, run: run.id, parent: rootTask.id, worktree: 'current', taskTitle: invocation.command.name, agent: selection.agent_id, model: selection.model, timeoutMs: 90_000, spec: rules.workerTaskSpec(invocation) }
  const mutation = { callerFingerprint: fingerprint, requestId: `${request}/native`, method: 'orchestration.workerStart', payloadHash: rules.hashCanonical({ method: 'orchestration.workerStart', params: rules.replayStableCallerParams(runtime, params, undefined, 'orchestration.workerStart') }) }
  const input = { mutation, controller, runId: run.id, worktreeId: owner.worktree_id, agent: selection.agent_id, mode: 'structured', model: selection.model }
  const launch = () => rules.startLocalWorker({ runtime, db, run, coordinator: null, params, orchestrationMutation: mutation, mode: rules.decideWorkerStartMode({ params, settings: structuredSettings }) })
  return { db, selection, receipt, invocation, parent, save, runtime, input, launch, stopBeforePlacement, rootTask, run, probes: () => probes }
}

test('OpenCode without the private model admission retains the original terminal probe refusal', async () => {
  const value = modelAdmissionCase()
  try {
    assert.equal(await rules.admitStructuredWorkerModelLaunch(value.input), undefined)
    await assert.rejects(value.launch(), /This OpenCode TUI cannot verify launch-time model selection/)
    assert.equal(value.probes(), 1)
    assert.equal(rules.checkAgentLaunchModelPreferences({ agent: 'opencode', model: value.input.model }).refusal.code, 'capability_unsupported')
    const release = rules.installStructuredAgentLaunchAdmission({ commandSettings: async () => ({}), validate: async () => {}, workerModelLaunchSupport: async () => false })
    try { await assert.rejects(value.launch(), /This OpenCode TUI cannot verify launch-time model selection/) }
    finally { release() }
    assert.equal(value.probes(), 2)
  } finally { value.db.close() }
})

test('OpenCode private model admission uses its original reservation and current approval before bypassing only the TUI probe', async t => {
  const value = modelAdmissionCase(), priorPort = process.env.ASTROCYTE_PORT
  process.env.ASTROCYTE_PORT = '1'
  let approve = async () => {}
  let approvals = 0
  const mocked = t.mock.method(globalThis, 'fetch', async (url, options) => {
    approvals++
    assert.equal(url, 'http://127.0.0.1:1/api/internal/swa/delivery-admission')
    const body = JSON.parse(options.body)
    assert.equal(body.selection.model, value.selection.model)
    const refused = await approve()
    if (refused) return refused
    return new Response(JSON.stringify({ schema: 'swa.delivery-admission.v1', project_id: body.project.id, request_id: body.command.request_id, settings_revision: body.caller.settings_revision }))
  })
  const release = rules.installAgentLaunchAdmission(value.runtime, { ownerCapability: Buffer.alloc(32), ownerAlive: () => true })
  try {
    assert.equal(await rules.admitStructuredWorkerModelLaunch(value.input), true)
    await assert.rejects(value.launch(), error => error === value.stopBeforePlacement)
    assert.equal(value.probes(), 0)
    assert.equal(approvals, 2)
    for (const change of [{ model: 'stepfun/other' }, { mode: 'terminal' }, { effort: 'high' }, { agent: 'pi' }, { controller: 'other' }, { worktreeId: 'other' }, { runId: 'other' }, { mutation: { ...value.input.mutation, payloadHash: 'different' } }]) {
      await assert.rejects(rules.admitStructuredWorkerModelLaunch({ ...value.input, ...change }))
      assert.equal(approvals, 2)
    }
    value.selection.version = '2.0.16'; value.save()
    await assert.rejects(rules.admitStructuredWorkerModelLaunch(value.input), { code: 'unsupported_capability' })
    value.selection.version = '2.0.31'; value.save()
    value.selection.native_launch.tools.native_contract = 'opencode-unreviewed'; value.save()
    await assert.rejects(rules.admitStructuredWorkerModelLaunch(value.input))
    value.selection.native_launch.tools.native_contract = 'opencode-cli-2.0.31'; value.save()
    value.selection.execution_mode = 'terminal'; value.save()
    await assert.rejects(rules.admitStructuredWorkerModelLaunch(value.input))
    value.selection.execution_mode = 'structured'; value.save()
    value.invocation.caller.grant_expires_at = '2000-01-01T00:00:00Z'; value.save()
    await assert.rejects(rules.admitStructuredWorkerModelLaunch(value.input), { code: 'approval_revoked' })
    delete value.invocation.caller.grant_expires_at; value.save()
    assert.equal(approvals, 2)
    approve = async () => new Response(JSON.stringify({ error: { code: 'approval_revoked', message: 'Constructed current approval refusal' } }), { status: 403 })
    await assert.rejects(rules.admitStructuredWorkerModelLaunch(value.input), { code: 'approval_revoked' })
    approve = async () => { value.receipt.annotation = 'changed while approving'; value.save() }
    await assert.rejects(rules.admitStructuredWorkerModelLaunch(value.input), { code: 'request_mismatch' })
    assert.equal(value.probes(), 0)
    assert.equal(value.db.db.prepare('SELECT COUNT(*) count FROM worker_dispatches').get().count, 0)
  } finally {
    release(); mocked.mock.restore(); value.db.close()
    if (priorPort === undefined) delete process.env.ASTROCYTE_PORT
    else process.env.ASTROCYTE_PORT = priorPort
  }
})

async function preparedOpenCodeRecord(options) {
  const sessionId = randomUUID()
  const prepared = await rules.prepareStructuredAgentSessionCreateForWorktree({
    runtime: { resolveStructuredAgentSessionCreateIntent: async () => ({ provider: 'opencode', agent: 'opencode', runtimeKind: 'native',
      location: { executionHostId: 'local', workspaceId: 'rule-workspace', wslDistro: null },
      accountHome: { kind: 'opencode', locator: { kind: 'private', root: join(directory, 'uncreated-private-account', sessionId) } },
      options: rules.structuredLaunchSeedOptions(defaults, 'opencode') }) },
    ensureHost: async () => ({}), envelope: { sessionId, clientOperationId: randomUUID(), expectedRuntimeFence: null, payloadFingerprint: '' },
    worktree: 'id:rule-workspace', agent: 'opencode', caller: { callerKey: 'constructed-prepare' }, options
  })
  return rules.foundAgentSessionRecord({ ...prepared.attachParams, sessionId }, { claimKeyId: 'constructed-never-acquired', now: Date.now() })
}

async function restrictedOpenCodeLaunch(record) {
  const part = rules.acpStructuredLaunchPart(rules.acpLaunchSpecFor('opencode'), {
    readJournal: () => null, dataDirectory: directory, homePath: home, inheritedEnv: {},
    resolveCommand: () => join(directory, 'unexecuted-opencode'),
    probeVersion: async (_launch, accept) => accept('2.0.31')
  })
  const permissionMode = await rules.structuredAgentSessionLaunchPermission({ agents: { definition: () => ({ agent: 'opencode' }) } }, record)
  return part({ record, permissionMode, launchDirectory: async () => directory, environment: async () => ({ HOME: home }),
    baseEnvironment: async () => ({ HOME: home }), launchEnv: () => ({}), commandSettings: () => ({}), visuals: async () => null,
    disabledOpenCodeTools: async () => ({ nativeContract: 'opencode-cli-2.0.31' }),
    providerJobLauncher: async () => ({ node: 'unexecuted-node', entry: 'unexecuted-job', eventDirectory: 'uncreated-events' })
  }, { sessionId: record.sessionId, fence: 1 })
}

test('Original full-access seed is refused by the actual restricted ACP launch rule', async () => {
  assert.equal(defaults.nativeChatPermissionMode, 'full-access')
  const input = { sessionId: randomUUID(), dispatchId: 'constructed-dispatch', agent: 'opencode', options: { model: 'stepfun/step-3.5-flash' } }
  const options = await rules.admitStructuredWorkerSessionOptions(input)
  assert.deepEqual(options, input.options)
  const record = await preparedOpenCodeRecord(options)
  assert.equal(record.permissionMode, 'full-access')
  assert.deepEqual(record.options, input.options)
  await assert.rejects(restrictedOpenCodeLaunch(record), /The restricted OpenCode launch contract changed/)
})

// 仅 discovery 与 Go HTTP 是明确构造替身；原 SQLite、identity、准入、prepare、record 和 ACP 规则实际执行。
test('Restricted OpenCode Worker seeds ask only for its current original reservation', async t => {
  const value = modelAdmissionCase(), priorPort = process.env.ASTROCYTE_PORT
  const childTask = value.db.createTask({ runId: value.run.id, parentId: value.rootTask.id, spec: 'Constructed permission task' })
  const dispatch = value.db.createDispatchContext({ taskId: childTask.id, assigneeHandle: 'constructed-worker', creator: { kind: 'system' }, maxDepth: 3 })
  const childMutation = { ...value.input.mutation }
  value.db.beginMutationReceipt(childMutation)
  value.db.checkpointPendingMutationReceipt({ ...childMutation, receipt: JSON.stringify({ accepted: { dispatchId: dispatch.id } }) })
  const sessionId = randomUUID()
  const identity = rules.structuredWorkerIdentities.register({ sessionId, dispatchId: dispatch.id, agent: 'opencode', handle: 'constructed-worker',
    paneKey: 'constructed-worker-pane', processIncarnation: 'constructed-never-spawned', worktreeId: value.input.worktreeId, hostScope: { kind: 'local', hostId: 'local' } })
  const input = { sessionId, dispatchId: dispatch.id, agent: 'opencode', options: { model: value.selection.model } }
  let record = null, approve = async () => {}, ownerAlive = true, approvals = 0
  value.runtime.openedAgentSessionRecordStore = () => ({ getRecord: () => record })
  const discoveryKey = Symbol.for('swa.constructed.permission.discovery')
  assert.equal(globalThis[discoveryKey], undefined)
  globalThis[discoveryKey] = async (_runtime, projectId, agent, model, projectRoot) => {
    assert.equal(projectId, value.invocation.project.id); assert.equal(agent, 'opencode'); assert.equal(model, value.selection.model); assert.equal(projectRoot, directory)
    return structuredClone(value.selection)
  }
  process.env.ASTROCYTE_PORT = '1'
  const mocked = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:1/api/internal/swa/delivery-admission')
    approvals++
    const body = JSON.parse(options.body), refused = await approve()
    return refused ?? new Response(JSON.stringify({ schema: 'swa.delivery-admission.v1', project_id: body.project.id, request_id: body.command.request_id, settings_revision: body.caller.settings_revision }))
  })
  const release = rules.installAgentLaunchAdmission(value.runtime, { ownerCapability: Buffer.alloc(32), ownerAlive: () => ownerAlive })
  let options
  try {
    options = await rules.admitStructuredWorkerSessionOptions(input)
    assert.deepEqual(options, { model: value.selection.model, permissionMode: 'ask' })
    assert.deepEqual(input.options, { model: value.selection.model })
    assert.equal(approvals, 1)
    assert.deepEqual(await rules.admitStructuredWorkerSessionOptions({ ...input, agent: 'pi' }), input.options)
    for (const change of [{ sessionId: randomUUID() }, { dispatchId: 'other' }, { options: { model: 'stepfun/other' } }, { options: { ...input.options, effort: 'high' } }, { options: { ...input.options, permissionMode: 'full-access' } }]) {
      await assert.rejects(rules.admitStructuredWorkerSessionOptions({ ...input, ...change }))
      assert.equal(approvals, 1)
    }
    for (const [key, changed] of [['version', '2.0.16'], ['execution_mode', 'terminal']]) {
      const prior = value.selection[key]; value.selection[key] = changed; value.save()
      await assert.rejects(rules.admitStructuredWorkerSessionOptions(input), key === 'execution_mode' ? { name: 'ZodError' } : { code: 'unsupported_capability' })
      value.selection[key] = prior; value.save()
    }
    value.invocation.caller.grant_expires_at = '2000-01-01T00:00:00Z'; value.save()
    await assert.rejects(rules.admitStructuredWorkerSessionOptions(input), { code: 'approval_revoked' })
    delete value.invocation.caller.grant_expires_at; value.save()
    ownerAlive = false
    await assert.rejects(rules.admitStructuredWorkerSessionOptions(input), /owning product service is unavailable/)
    ownerAlive = true
    approve = async () => new Response(JSON.stringify({ error: { code: 'approval_revoked', message: 'Constructed current approval refusal' } }), { status: 403 })
    await assert.rejects(rules.admitStructuredWorkerSessionOptions(input), { code: 'approval_revoked' })
    approve = async () => { value.receipt.annotation = 'changed while approving options'; value.save() }
    await assert.rejects(rules.admitStructuredWorkerSessionOptions(input), { code: 'request_mismatch' })
    approve = async () => { identity.worktreeId = 'changed-during-approval' }
    await assert.rejects(rules.admitStructuredWorkerSessionOptions(input), { code: 'scope_denied' })
    await assert.rejects(rules.admitStructuredWorkerSessionOptions(input), { code: 'scope_denied' })
    identity.worktreeId = value.input.worktreeId
    record = { provider: 'opencode', options: input.options, permissionMode: 'full-access' }
    await assert.rejects(rules.admitStructuredWorkerSessionOptions(input), { code: 'scope_denied' })
    await assert.rejects(rules.admitStructuredAgentCreateCommandSettings(sessionId, 'opencode'), /restricted OpenCode session permission mode changed/)
    assert.equal(record.permissionMode, 'full-access')
  } finally {
    release(); mocked.mock.restore(); delete globalThis[discoveryKey]; rules.structuredWorkerIdentities.forget(identity.handle); value.db.close()
    if (priorPort === undefined) delete process.env.ASTROCYTE_PORT
    else process.env.ASTROCYTE_PORT = priorPort
  }
  const prepared = await preparedOpenCodeRecord(options)
  assert.equal(prepared.permissionMode, 'ask')
  assert.deepEqual(prepared.options, input.options)
  const launched = await restrictedOpenCodeLaunch(prepared)
  assert.equal(launched.launch.fullAccess, false)
  assert.equal(JSON.parse(launched.launch.args[1]).args[0], 'acp')
})

process.stdout.write(JSON.stringify({ evidence: directory, coverage: 'original_mode_current_sqlite_model_and_permission_admission_rules', discovery: 'CONSTRUCTED_PERMISSION_TEST_ONLY', native_host_support: 'NOT_OBSERVED', worker_model: 'NOT_RUN', windows_native: 'NOT_RUN' }) + '\n')
