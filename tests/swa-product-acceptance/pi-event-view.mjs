// 只消费本轮实际 Pi 原件；完整 DTO/重复键由同安装纯 protocol 入口先行核验。
import assert from 'node:assert/strict'
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, toNamespacedPath } from 'node:path'
import { validateLinuxFinalCustody } from './codex-event-view.mjs'

const object = value => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'pi_source_object_missing')
  return value
}
const keys = (value, names) => assert.deepEqual(Object.keys(object(value)).sort(), [...names].sort(), 'pi_source_unknown_fields')
const fields = (value, required, optional = []) => {
  object(value)
  assert.ok(required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key)), 'pi_source_unknown_fields')
}
const source = value => { keys(value, ['path', 'version']); assert.ok(typeof value.path === 'string' && typeof value.version === 'string' && value.version.length > 0) }
const targetModel = value => {
  assert.equal(value.provider, 'stepfun'); assert.equal(value.id, 'step-3.5-flash')
  assert.equal(value.api, 'openai-completions'); assert.equal(value.baseUrl, 'https://api.stepfun.com/v1')
}
const uuid = value => assert.match(value, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, 'pi_source_uuid_missing')
const incarnation = value => {
  object(value)
  assert.equal(value.platform, 'linux')
  assert.ok(Number.isSafeInteger(value.pid) && value.pid > 0)
  uuid(value.boot_id)
  assert.match(value.start_ticks, /^[1-9][0-9]*$/)
  assert.match(value.owner_uid, /^(?:0|[1-9][0-9]*)$/)
  return { platform: value.platform, pid: value.pid, boot_id: value.boot_id, start_ticks: value.start_ticks, owner_uid: value.owner_uid }
}
const frameOf = row => row.event === 'native_record' ? row.detail?.frame : undefined
export const isPiDelta = row => row.protocol === 'pi-jsonl-rpc' && row.event === 'native_record' && frameOf(row)?.type === 'message_update' && ['text_delta', 'thinking_delta'].includes(frameOf(row).assistantMessageEvent?.type) && typeof frameOf(row).assistantMessageEvent.delta === 'string' && frameOf(row).assistantMessageEvent.delta.length > 0
export const piStarts = rows => rows.filter(row => frameOf(row)?.type === 'agent_start')
export const piEnds = rows => rows.filter(row => frameOf(row)?.type === 'agent_settled')
export const isLinuxPiTarget = (platform, agent, model, workers) => platform === 'linux' && agent === 'pi' && model === 'stepfun/step-3.5-flash' && [3, 4, 6].includes(workers)
export const isControlledPiTarget = (platform, agent, model, workers) => isLinuxPiTarget(platform, agent, model, workers) || platform === 'win32' && agent === 'pi' && model === 'stepfun/step-3.5-flash' && [4, 6].includes(workers)

export function requireWindowsPrivatePath(path, directory, security) {
  assert.equal(process.platform, 'win32')
  const user = security.currentUserSid(), acl = object(security.getDaclAces(toNamespacedPath(path)))
  const trustees = new Set([user, 'S-1-5-18'])
  assert.equal(acl.ownerSid, user); assert.equal(acl.protected, true)
  assert.equal(acl.aces.length, trustees.size)
  for (const ace of acl.aces) {
    assert.equal(ace.type, 0); assert.equal(ace.flags, directory ? 3 : 0); assert.equal(ace.mask, 0x1f01ff)
    assert.equal(trustees.delete(ace.sid), true)
  }
  assert.equal(trustees.size, 0)
}

const windowsIdentity = value => {
  object(value)
  assert.ok(Number.isSafeInteger(value.pid) && value.pid > 0 && Number.isSafeInteger(value.creationTimeMs) && value.creationTimeMs > 0, 'windows_process_identity_missing')
  return { pid: value.pid, creationTimeMs: value.creationTimeMs }
}
const identityKey = value => `${value.pid}:${value.creationTimeMs}`
export function validateWindowsInitialCustody(custody, processIdentity, nativeCLI, owner) {
  keys(processIdentity, ['pid', 'creation_time_ms', 'runtime_id'])
  assert.ok(typeof processIdentity.runtime_id === 'string' && processIdentity.runtime_id)
  const root = windowsIdentity({ pid: processIdentity.pid, creationTimeMs: processIdentity.creation_time_ms })
  keys(custody, ['ownerPid', 'rootPid', 'rootCreationTimeMs', 'assigned', 'rootExited', 'limitFlags', 'members', 'nativeCLI'])
  assert.equal(custody.ownerPid, windowsIdentity(owner).pid)
  assert.equal(custody.rootPid, root.pid); assert.equal(custody.rootCreationTimeMs, root.creationTimeMs)
  assert.equal(custody.assigned, true); assert.equal(custody.rootExited, false)
  assert.ok(Number.isSafeInteger(custody.limitFlags) && custody.limitFlags >= 0)
  assert.deepEqual(custody.nativeCLI, nativeCLI)
  assert.ok(Array.isArray(custody.members) && custody.members.length > 0 && custody.members.length <= 100_000)
  const members = custody.members.map(value => { keys(value, ['pid', 'creationTimeMs']); return windowsIdentity(value) })
  assert.equal(new Set(members.map(value => value.pid)).size, members.length, 'windows_initial_member_duplicate')
  for (const expected of [root, windowsIdentity(nativeCLI)]) assert.ok(members.some(value => identityKey(value) === identityKey(expected)), 'windows_initial_member_missing')
  return custody
}

export function validateWindowsFinalCustody(value, { custody, nativeCLI, knownIdentities = [] }) {
  keys(value, ['platform', 'root', 'nativeCLI', 'observations', 'independentIdentityObservations', 'forced'])
  assert.equal(value.platform, 'win32'); assert.equal(typeof value.forced, 'boolean')
  keys(value.root, ['pid', 'creationTimeMs'])
  assert.deepEqual(windowsIdentity(value.root), { pid: custody.rootPid, creationTimeMs: custody.rootCreationTimeMs })
  assert.deepEqual(value.nativeCLI, nativeCLI)
  assert.equal(value.observations.length, 2); assert.equal(value.independentIdentityObservations.length, 2)
  let previous = -1
  for (const sample of value.observations) {
    keys(sample, ['elapsedMs', 'observation'])
    assert.ok(Number.isFinite(sample.elapsedMs) && sample.elapsedMs > previous); previous = sample.elapsedMs
    const row = object(sample.observation)
    keys(row, ['ownerPid', 'rootPid', 'rootCreationTimeMs', 'assigned', 'rootExited', 'limitFlags', 'members', 'nativeCLI'])
    for (const field of ['ownerPid', 'rootPid', 'rootCreationTimeMs', 'limitFlags']) assert.equal(row[field], custody[field])
    assert.equal(row.assigned, true); assert.equal(row.rootExited, true); assert.deepEqual(row.members, [])
    assert.deepEqual(row.nativeCLI, nativeCLI)
  }
  const known = [...custody.members, value.root, nativeCLI, ...knownIdentities].map(value => identityKey(windowsIdentity(value)))
  let expectedKeys
  previous = -1
  for (const sample of value.independentIdentityObservations) {
    keys(sample, ['elapsedMs', 'identities'])
    assert.ok(Number.isFinite(sample.elapsedMs) && sample.elapsedMs > previous); previous = sample.elapsedMs
    assert.ok(Array.isArray(sample.identities) && sample.identities.length > 0 && sample.identities.length <= 100_000)
    const currentKeys = sample.identities.map(item => {
      keys(item, ['expected', 'observed']); keys(item.expected, ['pid', 'creationTimeMs'])
      const expected = windowsIdentity(item.expected)
      if (item.observed !== null) {
        const observed = windowsIdentity(item.observed)
        assert.equal(observed.pid, expected.pid); assert.notEqual(observed.creationTimeMs, expected.creationTimeMs, 'windows_original_process_still_alive')
      }
      return identityKey(expected)
    }).sort()
    assert.equal(new Set(currentKeys).size, currentKeys.length, 'windows_final_identity_duplicate')
    for (const key of known) assert.ok(currentKeys.includes(key), 'windows_final_known_identity_missing')
    if (expectedKeys) assert.deepEqual(currentKeys, expectedKeys, 'windows_final_identity_inventory_changed')
    else expectedKeys = currentKeys
  }
  return value
}

export function validateStructuredFinalCustody(value, view) {
  return value?.platform === 'win32'
    ? validateWindowsFinalCustody(value, { ...view, knownIdentities: view.server ? [view.server] : [] })
    : validateLinuxFinalCustody(value, view)
}

// 真实 owned-launch consumer；先有界读取并核同 FD/路径，再交同安装的成熟严格 JSON parser。
export function readPiPrivateJson(path, maxBytes, parse, security) {
  assert.ok(isAbsolute(path) && Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 1024 * 1024, 'pi_private_json_arguments')
  assert.equal(typeof parse, 'function')
  const actual = realpathSync(path), expected = resolve(path)
  assert.equal(process.platform === 'win32' ? actual.toLowerCase() : actual, process.platform === 'win32' ? expected.toLowerCase() : expected, 'pi_private_json_redirected')
  for (let current = dirname(path); ; current = dirname(current)) {
    const info = lstatSync(current, { bigint: true })
    assert.ok(info.isDirectory() && !info.isSymbolicLink(), 'pi_private_json_ancestor')
    if (dirname(current) === current) break
  }
  const source = info => ({ path, version: `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}`, identity: `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.uid}:${info.mode}:${info.nlink}` })
  const check = info => {
    assert.ok(info.isFile() && !info.isSymbolicLink() && info.nlink === 1n, 'pi_private_json_metadata')
    if (process.platform === 'win32') requireWindowsPrivatePath(path, false, security)
    else assert.ok(info.uid === BigInt(process.getuid()) && (info.mode & 0o7777n) === 0o600n, 'pi_private_json_metadata')
    assert.ok(info.size > 0n && info.size <= BigInt(maxBytes), 'pi_private_json_bound')
    return source(info)
  }
  const before = check(lstatSync(path, { bigint: true }))
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    assert.deepEqual(check(fstatSync(fd, { bigint: true })), before, 'pi_private_json_fd_changed')
    const bytes = Buffer.alloc(maxBytes + 1)
    let size = 0
    while (size < bytes.length) {
      const count = readSync(fd, bytes, size, bytes.length - size, null)
      if (!count) break
      size += count
    }
    assert.ok(size <= maxBytes && size === Number(fstatSync(fd, { bigint: true }).size), 'pi_private_json_bound')
    assert.deepEqual(check(fstatSync(fd, { bigint: true })), before, 'pi_private_json_changed_during_read')
    assert.deepEqual(check(lstatSync(path, { bigint: true })), before, 'pi_private_json_path_changed')
    const content = bytes.subarray(0, size)
    return { value: parse(new TextDecoder('utf-8', { fatal: true }).decode(content)), bytes: content, source: before }
  } finally { closeSync(fd) }
}

export function validatePiLaunchRecord(value, expected) {
  keys(value, ['installation', 'source_revision', 'data_root', 'endpoint', 'serve_pid', 'pi_source_home'])
  for (const name of ['installation', 'source_revision', 'data_root', 'endpoint']) assert.equal(value[name], expected[name], 'pi_owned_launch_binding_changed')
  assert.ok(Number.isSafeInteger(value.serve_pid) && value.serve_pid > 0)
  assert.ok(isAbsolute(value.pi_source_home))
  return value
}

export function validatePiSelection(selection, expected) {
  object(selection)
  assert.equal(selection.agent_id, 'pi')
  assert.equal(selection.version, '1.0.1')
  assert.equal(selection.model, 'stepfun/step-3.5-flash')
  assert.equal(selection.provider, 'stepfun')
  assert.equal(selection.executable, expected.executable)
  const launch = object(selection.native_launch), account = object(launch.account)
  assert.equal(launch.schema, 'swa.native-launch.v1')
  assert.deepEqual(launch.tools, { mode: 'disabled', native_contract: 'pi-cli-1.0.1' })
  assert.equal(account.kind, 'pi-native-api-key-per-session')
  assert.equal(account.provider, 'stepfun')
  assert.equal(account.source_home, expected.sourceHome, 'pi_source_must_equal_independent_owned_launch')
  assert.equal(account.private_root, expected.privateRoot)
  assert.deepEqual(account.model_target, { model_id: 'step-3.5-flash', api: 'openai-completions', base_url: 'https://api.stepfun.com/v1' })
  assert.equal(account.auth_source.path, join(expected.sourceHome, 'auth.json'))
  assert.equal(account.models_source?.path, join(expected.sourceHome, 'models.json'))
  for (const source of [account.auth_source, account.models_source]) {
    keys(source, ['path', 'version'])
    assert.equal(typeof source.version, 'string')
    assert.ok(source.version.length > 0)
  }
  return account
}

export function validatePiEventView(rows, expected) {
  assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length <= 100_000, 'pi_trace_inventory_bound')
  const first = object(rows[0])
  assert.equal(first.event, 'custody')
  const custody = object(first.detail), nativeCLI = object(custody.nativeCLI)
  if (expected.process.platform === 'linux') {
    assert.equal(custody.platform, 'linux')
    assert.equal(custody.custodyAdmitted, true)
    uuid(custody.custody_id)
    assert.deepEqual(incarnation(custody.root), incarnation(expected.process))
    assert.deepEqual({ ...custody.root, runtime_id: expected.process.runtime_id }, expected.process)
    assert.equal(custody.nativeState?.state, 'created')
    assert.deepEqual(nativeCLI, { ...custody.nativeState.identity, ...custody.nativeState.launch })
    assert.deepEqual(incarnation(nativeCLI), incarnation(custody.nativeState.identity))
  } else validateWindowsInitialCustody(custody, expected.process, nativeCLI, expected.owner)
  assert.notEqual(nativeCLI.pid, expected.process.pid)
  assert.equal(nativeCLI.kind, 'node-script')
  assert.equal(nativeCLI.entry, expected.executable)
  assert.equal(nativeCLI.program, expected.nodeExecutable)
  const writes = new Map(), prompts = [], projections = [], cycles = []
  let previousMonotonic = -1, ready, pendingPrompt, active, stopIntent, finalRow, observedModel, availableModels, observedThinkingLevel
  for (const [index, row] of rows.entries()) {
    keys(row, ['protocol', 'projection', 'session_id', 'runtime_fence', 'runtime_epoch', 'sequence', 'observed_at', 'monotonic_ms', 'process', 'native_cli', 'event', 'detail'])
    assert.equal(row.protocol, 'pi-jsonl-rpc')
    assert.equal(row.projection, 'actual_native_rpc_frames')
    assert.equal(row.session_id, expected.session)
    assert.equal(row.runtime_fence, expected.fence)
    assert.equal(row.runtime_epoch, expected.runtimeEpoch)
    assert.equal(row.sequence, index + 1)
    assert.ok(Number.isFinite(Date.parse(row.observed_at)))
    assert.ok(Number.isFinite(row.monotonic_ms) && row.monotonic_ms >= previousMonotonic)
    previousMonotonic = row.monotonic_ms
    assert.deepEqual(row.process, expected.process)
    assert.deepEqual(row.native_cli, nativeCLI)
    const detail = object(row.detail)
    if (row.event === 'custody') assert.equal(index, 0)
    else if (row.event === 'policy_ready') {
      keys(detail, ['native_contract', 'session_id', 'session_file', 'acquisition_generation', 'provider', 'model', 'tools', 'sources', 'settings'])
      assert.equal(ready, undefined)
      assert.equal(detail.native_contract, 'pi-cli-1.0.1')
      assert.match(detail.session_id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      assert.equal(detail.session_file, expected.sessionFile)
      assert.equal(detail.provider, 'stepfun')
      assert.deepEqual(detail.model, { model_id: 'step-3.5-flash', api: 'openai-completions', base_url: 'https://api.stepfun.com/v1' })
      assert.equal(detail.tools, 'disabled')
      uuid(detail.acquisition_generation)
      assert.ok(Array.isArray(detail.sources) && detail.sources.length >= 1129)
      for (const value of [...detail.sources, detail.settings]) source(value)
      assert.equal(new Set(detail.sources.map(value => value.path)).size, detail.sources.length)
      assert.equal(detail.settings.path, join(expected.home, 'settings.json'))
      for (const name of ['auth.json', 'models.json']) assert.equal(detail.sources.filter(source => source.path === join(expected.home, name)).length, 1)
      ready = detail
    } else if (row.event === 'write_intent') {
      fields(detail, ['command', 'id', 'frame', 'settings'], ['cid', 'binding', 'native_baseline'])
      source(detail.settings)
      assert.equal(detail.settings.path, join(expected.home, 'settings.json'))
      assert.equal(detail.id, detail.frame?.id)
      assert.equal(detail.command, detail.frame.type)
      assert.ok(typeof detail.id === 'string' && !writes.has(detail.id))
      const write = { row, detail, settled: false, reply: false }
      writes.set(detail.id, write)
      if (detail.command === 'prompt') {
        assert.ok(ready && (!pendingPrompt || pendingPrompt.echo), 'pi_prompt_before_ready_or_previous_echo')
        assert.equal(stopIntent, undefined, 'pi_prompt_after_stop')
        assert.equal(detail.cid, detail.id)
        assert.equal(detail.binding?.operation_id, detail.id)
        assert.equal(detail.binding?.session_id, expected.session)
        assert.equal(detail.binding?.runtime_fence, expected.fence)
        assert.equal(detail.binding?.agent, 'pi')
        assert.ok(detail.native_baseline && typeof detail.frame.message === 'string')
        if (Object.hasOwn(detail.native_baseline, 'absent')) { keys(detail.native_baseline, ['absent']); assert.equal(detail.native_baseline.absent, true) }
        else {
          keys(detail.native_baseline, ['source', 'bytes', 'sha256']); source(detail.native_baseline.source)
          assert.ok(Number.isSafeInteger(detail.native_baseline.bytes) && detail.native_baseline.bytes >= 0)
          assert.match(detail.native_baseline.sha256, /^[a-f0-9]{64}$/)
        }
        pendingPrompt = { write, cid: detail.id, echo: null }
        prompts.push(pendingPrompt)
      } else {
        assert.ok(!Object.hasOwn(detail, 'cid') && !Object.hasOwn(detail, 'binding') && !Object.hasOwn(detail, 'native_baseline'))
        if (stopIntent) assert.ok(['abort', 'get_state'].includes(detail.command), 'pi_new_effect_after_stop')
      }
    } else if (row.event === 'write_settled') {
      fields(detail, ['command', 'id', 'outcome', 'writeAttempted', 'cleanupCompleted'], ['cid'])
      const write = writes.get(detail.id)
      assert.ok(write && !write.settled && write.detail.command === detail.command && write.detail.cid === detail.cid)
      assert.equal(detail.outcome, 'resolved')
      assert.equal(detail.writeAttempted, true)
      assert.equal(detail.cleanupCompleted, true)
      write.settled = true
      write.settlement = row
    } else if (row.event === 'native_record') {
      fields(detail, ['frame', 'raw_line'], ['response', 'cid'])
      const frame = object(detail.frame)
      assert.equal(typeof detail.raw_line, 'string')
      assert.deepEqual(JSON.parse(detail.raw_line), frame)
      if (frame.type !== 'response') assert.ok(!Object.hasOwn(detail, 'response'))
      if (!(frame.type === 'message_end' && frame.message.role === 'user')) assert.ok(!Object.hasOwn(detail, 'cid'))
      if (frame.type === 'response') {
        assert.ok(!Object.hasOwn(detail, 'cid'))
        keys(detail.response, ['id', 'command'])
        const write = writes.get(frame.id)
        assert.ok(write && !write.reply && write.detail.command === frame.command && write.row.sequence < row.sequence)
        assert.deepEqual(detail.response, { id: frame.id, command: frame.command })
        assert.equal(frame.success, true)
        write.reply = row
        if (frame.command === 'get_state') {
          assert.equal(frame.data.sessionFile, expected.sessionFile)
          if (ready) assert.equal(frame.data.sessionId, ready.session_id)
          targetModel(frame.data.model)
          if (observedModel) assert.deepEqual(frame.data.model, observedModel)
          if (availableModels) assert.deepEqual(frame.data.model, availableModels[0])
          observedModel ??= frame.data.model
          assert.equal(frame.data.autoCompactionEnabled, false)
          assert.ok(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(frame.data.thinkingLevel))
          if (observedThinkingLevel !== undefined) assert.equal(frame.data.thinkingLevel, observedThinkingLevel, 'pi_thinking_level_changed_during_fixed_case')
          observedThinkingLevel ??= frame.data.thinkingLevel
          if (active && active.settled && !frame.data.isStreaming && !frame.data.isCompacting && frame.data.pendingMessageCount === 0) { active.idle = row; active = undefined }
        } else if (frame.command === 'set_thinking_level') observedThinkingLevel = write.detail.frame.level
        else if (frame.command === 'set_model') { targetModel(frame.data); if (observedModel) assert.deepEqual(frame.data, observedModel); if (availableModels) assert.deepEqual(frame.data, availableModels[0]); observedModel ??= frame.data }
        else if (frame.command === 'get_available_models') {
          assert.equal(frame.data.models.length, 1)
          targetModel(frame.data.models[0])
          if (observedModel) assert.deepEqual(frame.data.models[0], observedModel)
          if (availableModels) assert.deepEqual(frame.data.models, availableModels)
          availableModels ??= frame.data.models
        }
      } else if (frame.type === 'agent_start') {
        assert.ok(ready && !active && pendingPrompt && !pendingPrompt.echo)
        active = { start: row, cid: pendingPrompt.cid, message: undefined, completedMessages: [], deltas: [] }
        cycles.push(active)
      } else if (frame.type === 'message_start' && frame.message.role === 'assistant') {
        assert.ok(active && !active.end && pendingPrompt?.echo && !active.message, 'pi_assistant_start_outside_running_cycle')
        active.message = { row, initial: frame.message, blocks: new Map() }
      } else if (frame.type === 'message_end' && frame.message.role === 'user') {
        assert.ok(active && pendingPrompt && !pendingPrompt.echo)
        assert.equal(detail.cid, pendingPrompt.cid)
        assert.deepEqual(frame.message.content, [{ type: 'text', text: pendingPrompt.write.detail.frame.message }])
        pendingPrompt.echo = row
      } else if (frame.type === 'message_update') {
        assert.ok(active && !active.end && !active.settled && active.message && pendingPrompt?.echo, 'pi_delta_outside_running_message')
        const delta = frame.assistantMessageEvent, message = active.message
        const kind = delta.type.startsWith('text_') ? 'text' : 'thinking'
        const value = block => block.type === 'text' ? block.text : block.thinking
        if (delta.type.endsWith('_start')) {
          assert.ok(!message.blocks.has(delta.contentIndex), 'pi_delta_block_repeated')
          const initial = message.initial.content[delta.contentIndex]
          if (initial) assert.equal(initial.type, kind)
          message.blocks.set(delta.contentIndex, { kind, text: initial ? value(initial) : '', started: row, ended: null, deltas: [] })
        } else {
          const block = message.blocks.get(delta.contentIndex)
          assert.ok(block && block.kind === kind && !block.ended, 'pi_delta_missing_start_or_after_end')
          if (delta.type.endsWith('_delta')) { block.text += delta.delta; block.deltas.push(row); active.deltas.push(row) }
          else { assert.equal(delta.content, block.text, 'pi_delta_end_content_mismatch'); block.ended = row }
        }
      } else if (frame.type === 'turn_end') {
        assert.ok(active && !active.end && active.finalMessage)
        assert.deepEqual(frame.message, active.finalMessage.detail.frame.message)
        active.turnEnd = row
      } else if (frame.type === 'agent_end') {
        assert.ok(active && !active.end && active.turnEnd && !active.message && active.finalMessage)
        assert.ok(frame.messages.some(message => JSON.stringify(message) === JSON.stringify(active.finalMessage.detail.frame.message)))
        active.end = row
      } else if (frame.type === 'agent_settled') {
        assert.ok(active?.end && !active.settled)
        active.settled = row
      } else if (frame.type === 'message_end' && frame.message.role === 'assistant') {
        assert.ok(active && !active.end && active.message && pendingPrompt?.echo)
        const message = active.message
        assert.equal(frame.message.timestamp, message.initial.timestamp)
        for (const name of ['provider', 'model', 'api']) assert.equal(frame.message[name], message.initial[name])
        for (const [index, content] of frame.message.content.entries()) {
          const block = message.blocks.get(index), text = content.type === 'text' ? content.text : content.thinking
          if (!block && !text) continue
          assert.ok(block && block.kind === content.type && (block.ended || frame.message.stopReason === 'aborted' && stopIntent && stopIntent.sequence < row.sequence), 'pi_final_message_has_unobserved_chunk')
          assert.equal(block.text, text, 'pi_delta_final_message_mismatch')
        }
        for (const index of message.blocks.keys()) assert.ok(index < frame.message.content.length, 'pi_delta_unknown_content_index')
        active.completedMessages.push({ ...message, final: row })
        active.message = undefined
        assert.equal(frame.message.provider, 'stepfun'); assert.equal(frame.message.model, 'step-3.5-flash'); assert.equal(frame.message.api, 'openai-completions')
        if (frame.message.stopReason === 'aborted') assert.ok(stopIntent && stopIntent.sequence < row.sequence)
        active.finalMessage = row
      }
    } else if (row.event === 'stop_intent') {
      keys(detail, ['turn_id', 'cid'])
      for (const name of ['turn_id', 'cid']) assert.ok(detail[name] === null || typeof detail[name] === 'string')
      assert.equal(stopIntent, undefined)
      stopIntent = row
    } else if (row.event === 'projection_published') {
      fields(detail, ['sourceSequence', 'eventType', 'acquisitionGeneration', 'report'], ['clientMessageId', 'providerItem'])
      assert.ok(['input.accepted', 'turn.open', 'turn.end', 'item.open', 'item.update', 'item.close', 'text.delta', 'text.close', 'request.open', 'request.withdrawn', 'context.usage', 'activity', 'provider.frame', 'session.ended'].includes(detail.eventType))
      for (const name of ['clientMessageId', 'providerItem']) if (Object.hasOwn(detail, name)) assert.equal(typeof detail[name], 'string')
      assert.ok(ready && detail.acquisitionGeneration === ready.acquisition_generation)
      assert.ok(Number.isSafeInteger(detail.sourceSequence) && detail.sourceSequence > 0 && detail.sourceSequence < row.sequence)
      assert.equal(rows[detail.sourceSequence - 1].event, 'native_record')
      keys(detail.report, ['journalEpoch', 'published', 'steps'])
      assert.equal(detail.report.journalEpoch, expected.journalEpoch)
      assert.ok(Array.isArray(detail.report.steps))
      for (const step of detail.report.steps) {
        if (step.kind === 'item') { keys(step, ['kind', 'written', 'itemId']); assert.equal(step.written ? typeof step.itemId === 'string' && step.itemId.length > 0 : step.itemId === null, true) }
        else { keys(step, ['kind', 'written', 'settlementId']); assert.equal(step.kind, 'settlement'); assert.equal(typeof step.settlementId, 'string') }
        assert.equal(typeof step.written, 'boolean')
      }
      assert.equal(typeof detail.report.published, 'boolean')
      if (detail.report.published) assert.ok(detail.report.steps.some(step => step.written))
      if (detail.eventType === 'input.accepted') assert.equal(detail.report.published, detail.report.steps.some(step => step.written))
      projections.push(row)
    } else if (row.event === 'custody_closed') {
      assert.equal(index, rows.length - 1)
      assert.ok(ready && (!pendingPrompt || pendingPrompt.echo))
      for (const write of writes.values()) assert.ok(write.settled && write.reply)
      const final = validateStructuredFinalCustody(detail, { custody, nativeCLI })
      if (active) {
        assert.equal(final.platform === 'win32' ? final.forced : final.observation.fullTreeProof.forced, false, 'pi_normal_stop_was_forced')
        const abort = stoppedPiCycle(active, stopIntent, writes)
        assert.ok(abort.reply.sequence < row.sequence, 'pi_closed_before_abort_reply')
        // 这是实际进程树关闭观察，不能生成缺失的 get_state idle 记录。
        active.closed = row
        active = undefined
      }
      finalRow = row
    } else assert.fail('pi_event_failed_or_unreviewed')
  }
  assert.ok(ready && observedModel && availableModels, 'pi_actual_policy_ready_or_metadata_missing')
  return { custody, nativeCLI, ready, writes, prompts, cycles, projections, stopIntent, finalRow, active }
}

function stoppedPiCycle(cycle, stopIntent, writes) {
  assert.ok(cycle && stopIntent && !cycle.message, 'pi_stopped_cycle_missing')
  assert.equal(cycle.cid, stopIntent.detail.cid, 'pi_stopped_cycle_identity_changed')
  assert.ok(cycle.start.sequence < stopIntent.sequence && cycle.end?.sequence > stopIntent.sequence && cycle.settled?.sequence > cycle.end.sequence)
  const cancelled = cycle.finalMessage
  assert.ok(cancelled && cancelled.sequence > stopIntent.sequence && cancelled.sequence < cycle.end.sequence)
  assert.equal(cancelled.detail.frame.message.stopReason, 'aborted')
  assert.ok(['Request aborted', 'Request was aborted'].includes(cancelled.detail.frame.message.errorMessage))
  const aborts = [...writes.values()].filter(write => write.detail.command === 'abort' && write.row.sequence > stopIntent.sequence)
  assert.equal(aborts.length, 1)
  assert.ok(aborts[0].settled && aborts[0].reply?.sequence > cycle.settled.sequence)
  if (cycle.idle) assert.ok(cycle.idle.sequence > aborts[0].reply.sequence)
  return aborts[0]
}

export function originalPiTreeProof(rows, view, checkpoint, activeStop) {
  const row = object(view.finalRow)
  assert.equal(row.event, 'custody_closed')
  assert.ok(row.sequence > checkpoint.sequence)
  assert.ok(view.stopIntent && view.stopIntent.sequence > checkpoint.sequence && view.stopIntent.sequence < row.sequence)
  const final = validateStructuredFinalCustody(row.detail, view)
  assert.equal(final.platform === 'win32' ? final.forced : final.observation.fullTreeProof.forced, false, 'pi_normal_stop_was_forced')
  // 本 N3 活动停止已经观察过真实 delta，不能由 not-created 分支替代实际 native 身份。
  if (activeStop) {
    assert.ok(checkpoint.running && typeof checkpoint.cid === 'string', 'pi_checkpoint_was_not_running')
    assert.equal(view.stopIntent.detail.cid, checkpoint.cid)
    const cycle = view.cycles.find(value => value.cid === checkpoint.cid)
    assert.ok(cycle && cycle.start.sequence <= checkpoint.sequence)
    const abort = stoppedPiCycle(cycle, view.stopIntent, view.writes)
    assert.ok(cycle.idle || cycle.closed === row && cycle.closed.sequence > abort.reply.sequence, 'pi_stop_has_no_idle_or_closed_observation')
    if (final.platform === 'win32') assert.deepEqual(final.nativeCLI, view.nativeCLI)
    else {
      assert.equal(final.observation.fullTreeProof.native_cli.state, 'created')
      assert.deepEqual(final.observation.fullTreeProof.native_cli.identity, view.custody.nativeState.identity)
    }
    assert.ok(rows.some(item => isPiDelta(item) && item.sequence <= checkpoint.sequence))
  }
  return { row, final, original_stop_request: checkpoint.request_id, observed_after_sequence: checkpoint.sequence, stop_intent: view.stopIntent }
}
