import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/agent-observations'), { recursive: true })
const directory = await mkdtemp(join(root, '.verification/agent-observations/run-'))
function compile(name, entry) {
  const output = join(directory, `${name}.cjs`)
  buildSync({ entryPoints: [join(root, entry)], outfile: output, tsconfig: join(root, 'runtime/swa-orca/tsconfig.json'), bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['*.node'], alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') }, nodePaths: [join(root, 'runtime/swa-orca/node_modules'), join(root, 'node_modules')], logLevel: 'silent' })
  return createRequire(output)(output)
}
const { describeAgentFeatures, modelCatalogObservation, executionObservation } = compile('observations', 'runtime/swa-orca/src/execution-observation.ts')
const { observationSchema, agentCapabilitiesSchema } = compile('contracts', 'runtime/swa-orca/src/contracts.ts')
const { PI_RPC_AGENT } = compile('pi-definition', 'third_party/orca-v1.4.230/src/main/pi/rpc-agent-definition.ts')
const { CODEX_STRUCTURED_AGENT } = compile('codex-definition', 'third_party/orca-v1.4.230/src/main/codex/codex-structured-agent-definition.ts')
const { CLAUDE_STRUCTURED_AGENT } = compile('claude-definition', 'third_party/orca-v1.4.230/src/main/claude/claude-structured-agent-definition.ts')
const { acpStructuredAgentDefinition } = compile('acp-definition', 'third_party/orca-v1.4.230/src/main/acp/acp-structured-agent-definitions.ts')
const { ACP_LAUNCH_SPECS } = compile('acp-specs', 'third_party/orca-v1.4.230/src/main/acp/acp-launch-specs.ts')
const { agentJournalItemKey } = compile('journal-key', 'third_party/orca-v1.4.230/src/shared/agent-session-journal-item-key.ts')

// 真实生产定义与纯投影规则参数；不启动 CLI、替代协议或模型，也不记录原生验收通过。
test('actual registered declarations never enable absent product operations', () => {
  for (const definition of [PI_RPC_AGENT, CODEX_STRUCTURED_AGENT, CLAUDE_STRUCTURED_AGENT]) {
    const features = describeAgentFeatures(definition)
    assert.equal(features.declared_features.images, definition.capabilities.imagePrompts)
    assert.equal(features.declared_features.model_switch, definition.restingOptions.acceptsKey('model'))
    assert.equal(features.declared_features.steering, definition.capabilities.steering)
    assert.equal(features.images.status, 'unavailable')
    assert.equal(features.model_switch.status, 'unavailable')
    assert.equal(features.images.basis, 'declaration')
  }
  assert.equal(describeAgentFeatures(PI_RPC_AGENT).declared_features.images, false)
  assert.equal(describeAgentFeatures(CODEX_STRUCTURED_AGENT).declared_features.images, true)
  for (const spec of ACP_LAUNCH_SPECS) {
    const features = describeAgentFeatures(acpStructuredAgentDefinition(spec))
    assert.equal(features.declared_features.steering, 'queue')
    assert.equal(features.declared_features.images, spec.imagePrompts === true)
    assert.equal(features.images.status, 'unavailable')
  }
})

test('configured choices remain unverified and old capability observations stay readable', () => {
  assert.deepEqual(modelCatalogObservation({}), { origin: 'unknown', availability: 'unverified', models: [] })
  const configured = modelCatalogObservation({ model: 'stepfun/step-3.5-flash', provider: 'stepfun' })
  assert.equal(configured.origin, 'configured')
  assert.equal(configured.availability, 'unverified')
  assert.equal(configured.observed_at, undefined)
  const old = { status: 'unknown', reason: 'No native session was observed', source: 'native-session' }
  assert.deepEqual(observationSchema.parse(old), old)
  const agent = agentCapabilitiesSchema.shape.agents.element
  assert.equal(agent.shape.authenticated.isOptional(), true)
  assert.equal(agent.shape.declared_features.isOptional(), true)
  assert.equal(agent.shape.model_catalog.isOptional(), true)
  assert.equal(agent.shape.control.shape.images.isOptional(), true)
})

function ruleSource() {
  return {
    native_session_id: 'rule-session', fence: 3,
    selection: {
      agent_id: 'codex', adapter: 'CodexStructuredSessionAdapter', execution_mode: 'structured', executable: '/not-invoked/codex', version: '0.163.0', model: 'gpt-5.5', provider: 'openai', external_target: 'codex', settings_source: { kind: 'native' }, settings_revision: 1, configuration_version: 'rule-parameter',
      native_launch: { schema: 'swa.native-launch.v1', account: { kind: 'codex-native-api-key', provider: 'openai', source_home: '/not-read/source', auth_source: { path: '/not-read/source/auth.json', version: 'rule-parameter' }, catalog_source: { path: '/not-read/models.json', version: 'rule-parameter' }, private_root: '/not-read/private', model_target: { model_id: 'gpt-5.5', api: 'openai-responses', base_url: 'https://api.openai.com/v1' } }, tools: { mode: 'disabled', native_contract: 'codex-cli-0.163.0' } }
    },
    provider_link: { linkId: 'rule-link', handle: { agent: 'codex', transport: 'codex-app-server', nativeId: 'rule-native-thread' }, origin: 'created', mintedAtFence: 3, observedAt: 0 }
  }
}

function ruleInput(state) {
  return {
    request_id: 'rule-request', native_request_id: 'rule-request/native', dispatch_id: 'rule-dispatch', agent: 'codex', session_id: 'rule-session', operation_id: 'rule-operation', state,
    binding: { parent_request: 'rule-request', child_request: 'rule-request/native', dispatch_id: 'rule-dispatch', agent: 'codex', execution_mode: 'structured', session_id: 'rule-session', operation_id: 'rule-operation', runtime_fence: 3, consumer_generation: 1, body: {} },
    submission: { clientMessageId: 'rule-operation', fence: 3, dispatchState: ['journaled', 'queued'].includes(state) ? 'pending' : state, providerItemId: state === 'accepted' ? agentJournalItemKey({ provider: 'codex', threadId: 'rule-native-thread', turnId: 'rule-turn', ordinal: 0 }) : null }
  }
}

test('pure delivery mapping requires original settlement and provider identity', () => {
  for (const state of ['journaled', 'queued', 'unknown']) {
    const result = executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: ruleInput(state) })
    assert.equal(result.delivery.state, 'unknown')
    assert.equal(result.delivery.phase, state)
    assert.equal(result.result.status, 'unknown')
    assert.equal(result.authenticated.status, 'unknown')
  }
  assert.equal(executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: ruleInput('accepted') }).delivery.state, 'sent')
  assert.equal(executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: ruleInput('rejected') }).delivery.state, 'not_sent')
  const wrongProvider = ruleInput('accepted')
  wrongProvider.submission.providerItemId = agentJournalItemKey({ provider: 'codex', threadId: 'another-thread', turnId: 'rule-turn', ordinal: 0 })
  assert.throws(() => executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: wrongProvider }), /provider identity/)
  assert.throws(() => executionObservation(ruleSource(), { dispatchId: 'another-dispatch', currentInput: ruleInput('accepted') }), /original request/)
  const wrongFence = ruleInput('accepted')
  wrongFence.submission.fence = 4
  assert.throws(() => executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: wrongFence }), /original request/)
  const phaseMismatch = ruleInput('queued')
  phaseMismatch.state = 'accepted'
  assert.throws(() => executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: phaseMismatch }), /phase differs/)
})

test('Pi correlated input uses its exact accepted operation identity without promoting a placeholder', () => {
  // 原 Pi correlatedPrompts 合同的纯规则参数；不执行原生协议、CLI 或账号读取。
  const source = ruleSource()
  Object.assign(source.selection, { agent_id: 'pi', adapter: 'PiRpcSessionAdapter', version: '1.0.1', provider: 'stepfun', model: 'stepfun/step-3.5-flash', external_target: 'pi' })
  source.selection.native_launch = {
    schema: 'swa.native-launch.v1',
    account: { kind: 'pi-native-api-key-per-session', provider: 'stepfun', source_home: '/not-read/pi-source', auth_source: { path: '/not-read/pi-source/auth.json', version: 'rule-parameter' }, models_source: null, private_root: '/not-read/pi-private', model_target: { model_id: 'step-3.5-flash', api: 'openai-completions', base_url: 'https://api.stepfun.com/v1' } },
    tools: { mode: 'disabled', native_contract: 'pi-cli-1.0.1' }
  }
  source.provider_link.handle = { agent: 'pi', transport: 'jsonl-rpc', nativeId: '/not-read/pi-private/session.jsonl' }
  const input = ruleInput('accepted')
  input.agent = input.binding.agent = 'pi'
  input.submission.providerItemId = agentJournalItemKey({ provider: 'orca', clientMessageId: input.operation_id })
  const observed = executionObservation(source, { dispatchId: 'rule-dispatch', currentInput: input })
  assert.equal(observed.delivery.state, 'sent')
  assert.equal(observed.delivery.phase, 'accepted')
  assert.equal(observed.control.status, 'available')
  assert.equal(observed.result.status, 'unknown')
  assert.equal(observed.authenticated.status, 'unknown')

  const wrongOperation = structuredClone(input)
  wrongOperation.submission.providerItemId = agentJournalItemKey({ provider: 'orca', clientMessageId: 'different-operation' })
  assert.throws(() => executionObservation(source, { dispatchId: 'rule-dispatch', currentInput: wrongOperation }), /provider identity/)
  const wrongContract = structuredClone(source)
  const { private_root, ...account } = wrongContract.selection.native_launch.account
  wrongContract.selection.native_launch.account = { ...account, kind: 'pi-native-api-key', private_home: private_root }
  assert.throws(() => executionObservation(wrongContract, { dispatchId: 'rule-dispatch', currentInput: input }), /provider identity/)
  const otherAgent = ruleInput('accepted')
  otherAgent.submission.providerItemId = input.submission.providerItemId
  assert.throws(() => executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: otherAgent }), /provider identity/)
  for (const state of ['journaled', 'queued', 'unknown', 'accepted']) {
    const pending = structuredClone(input)
    pending.state = state
    pending.submission.dispatchState = ['journaled', 'queued'].includes(state) ? 'pending' : state
    pending.submission.providerItemId = null
    const result = executionObservation(source, { dispatchId: 'rule-dispatch', currentInput: pending })
    assert.equal(result.delivery.state, 'unknown')
    assert.equal(result.control.status, 'unknown')
  }
})

test('resume and safe selection projection preserve the original identity and omit source paths', () => {
  const source = ruleSource()
  const original = executionObservation(source, { dispatchId: 'rule-dispatch' })
  assert.equal(original.resume.state, 'not_requested')
  assert.equal(original.resume.session_id, 'rule-session')
  assert.equal(original.selection.model, 'gpt-5.5')
  assert.equal(original.selection.account_source, 'codex-native-api-key')
  assert.doesNotMatch(JSON.stringify(original), /not-read|auth\.json|not-invoked|rule-native-thread/)
  source.provider_link.origin = 'resumed'
  assert.equal(executionObservation(source, { dispatchId: 'rule-dispatch' }).resume.state, 'resumed')
  source.provider_link.mintedAtFence = 4
  assert.throws(() => executionObservation(source, { dispatchId: 'rule-dispatch' }), /original provider identity/)
})

test('resume failure requires the whole original rejected restart fact and exact input identity', () => {
  // 原生 typed fact 的纯规则输入；没有运行原生恢复或复用 vendor 的 mock。
  const fact = { kind: 'restartFailed', detail: { text: 'private diagnostic must not appear', audience: 'person' }, refusal: { code: 'agent_session_operation_invalid', details: { ownerVerdict: 'exited' } } }
  const input = ruleInput('rejected')
  input.submission.rejection = fact
  const result = executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: input })
  assert.equal(result.delivery.state, 'not_sent')
  assert.equal(result.resume.state, 'failed')
  assert.equal(result.resume.source, 'native_journal_restart_refused')
  assert.doesNotMatch(JSON.stringify(result), /private diagnostic/)
  for (const rejection of [
    { kind: 'restartFailed' },
    { ...fact, refusal: { code: 'execution_owner_reconciling' } },
    { ...fact, refusal: { code: 'agent_session_operation_invalid', details: { ownerVerdict: 'unverifiable' } } },
    { ...fact, refusal: { code: 'agent_session_operation_invalid', details: { ownerVerdict: 'exited', reason: 'turnActive' } } },
    { ...fact, refusal: { code: 'agent_session_operation_invalid', details: { ownerVerdict: 'exited', futureField: true } } },
    { ...fact, futureField: true },
  ]) {
    const changed = structuredClone(input)
    changed.submission.rejection = rejection
    assert.equal(executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: changed }).resume.state, 'unknown')
  }
  for (const kind of ['startFailed', 'providerRejected', 'notSignedIn']) {
    const changed = structuredClone(input)
    changed.submission.rejection = { kind }
    assert.equal(executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: changed }).resume.state, 'not_requested')
  }
  for (const change of [
    { request_id: 'another-request' }, { native_request_id: 'another-request/native' },
    { operation_id: 'another-operation' }, { dispatch_id: 'another-dispatch' },
    { agent: 'claude' }, { session_id: 'another-session' },
  ]) assert.throws(() => executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: { ...input, ...change } }), /original request/)
  const changedFence = structuredClone(input)
  changedFence.binding.runtime_fence++
  assert.throws(() => executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: changedFence }), /original request/)
  const changedProvider = ruleSource()
  changedProvider.provider_link.handle.agent = 'claude'
  assert.throws(() => executionObservation(changedProvider, { dispatchId: 'rule-dispatch', currentInput: input }), /original provider identity/)
  const unsettled = ruleInput('queued')
  unsettled.submission.rejection = fact
  assert.equal(executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: unsettled }).resume.state, 'not_requested')
})

test('pure pre-input rejection requires the original Dispatch and native child request', () => {
  const rejection = { request_id: 'rule-request', native_request_id: 'rule-request/native', dispatch_id: 'rule-dispatch', agent: 'codex', state: 'rejected', effects_applied: false, source: { kind: 'native_pre_input_admission', child_request: 'rule-request/native' } }
  assert.equal(executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: rejection }).delivery.state, 'not_sent')
  assert.throws(() => executionObservation(ruleSource(), { dispatchId: 'other-dispatch', currentInput: rejection }), /original native request/)
  rejection.source.child_request = 'other-child'
  assert.throws(() => executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: rejection }), /original native request/)
})

test('unsettled original request remains unknown without an invented native binding', () => {
  const pending = { request_id: 'rule-request', native_request_id: 'rule-request/native', dispatch_id: 'rule-dispatch', agent: 'codex', state: 'unknown', source: { kind: 'native_input_request_pending' } }
  const observed = executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: pending, nativeResult: { availability: 'complete', persistence: 'observed', final: { text: 'Earlier rule result' } } })
  assert.deepEqual(observed.delivery, { state: 'unknown', phase: 'unknown', request_id: 'rule-request', source: 'native_input_request_pending' })
  assert.equal(observed.result.status, 'unknown')
  assert.equal(observed.authenticated.status, 'unknown')
  assert.equal(observed.control.status, 'unknown')
  for (const changed of [{ dispatch_id: 'another-dispatch' }, { agent: 'pi' }, { native_request_id: 'another-child' }]) {
    assert.throws(() => executionObservation(ruleSource(), { dispatchId: 'rule-dispatch', currentInput: { ...pending, ...changed } }), /original native request/)
  }
})

test('catalog and result rule parameters cannot promote configuration into authentication', () => {
  const source = ruleSource()
  const catalog = { origin: 'probe', fetchedAt: 1, models: [{ id: 'gpt-5.5', label: 'GPT-5.5', isDefault: true, efforts: [] }] }
  const listed = executionObservation(source, { dispatchId: 'rule-dispatch', modelCatalog: catalog })
  assert.equal(listed.model_catalog.availability, 'verified')
  assert.equal(listed.model_catalog.observed_at, '1970-01-01T00:00:00.001Z')
  assert.equal(listed.authenticated.status, 'unknown')
  assert.equal(listed.result.status, 'unknown')
  assert.throws(() => modelCatalogObservation({}, { ...catalog, models: [catalog.models[0], catalog.models[0]] }), /duplicate/)
  assert.throws(() => modelCatalogObservation({}, { ...catalog, fetchedAt: NaN }), /observation time/)
  for (const nativeResult of [undefined, { availability: 'incomplete' }, { availability: 'complete', persistence: 'observed', final: null }]) {
    const observed = executionObservation(source, { dispatchId: 'rule-dispatch', nativeResult })
    assert.equal(observed.result.status, 'unknown')
    assert.equal(observed.authenticated.status, 'unknown')
  }
})
