// 只读消费经审查的 Codex 原生产者字段；不生成或重放原生样本。
import assert from 'node:assert/strict'

const object = value => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'codex_source_object_missing')
  return value
}
const uuid = value => assert.match(value, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, 'codex_source_uuid_missing')
const incarnation = value => {
  object(value)
  assert.equal(value.platform, 'linux')
  assert.ok(Number.isSafeInteger(value.pid) && value.pid > 0)
  uuid(value.boot_id)
  assert.match(value.start_ticks, /^[1-9][0-9]*$/)
  assert.match(value.owner_uid, /^(?:0|[1-9][0-9]*)$/)
  return { platform: value.platform, pid: value.pid, boot_id: value.boot_id, start_ticks: value.start_ticks, owner_uid: value.owner_uid }
}
const frame = row => {
  const detail = object(row.detail)
  assert.equal(typeof detail.raw_line, 'string')
  assert.deepEqual(JSON.parse(detail.raw_line), detail.frame, 'codex_native_frame_differs_from_original_line')
  return object(detail.frame)
}
const deltaMethods = new Set(['item/agentMessage/delta', 'item/reasoning/textDelta', 'item/reasoning/summaryTextDelta'])
export const isCodexDelta = row => row.protocol === 'codex-app-server' && row.event === 'notification' && deltaMethods.has(row.detail?.method) && typeof row.detail.frame?.params?.delta === 'string' && row.detail.frame.params.delta.length > 0
export const codexStarts = rows => rows.filter(row => row.event === 'notification' && row.detail?.method === 'turn/started')
export const codexEnds = rows => rows.filter(row => row.event === 'notification' && row.detail?.method === 'turn/completed')

export function validateLinuxServiceReady(value, expected) {
  const ready = object(value)
  const required = ['ok', 'http', 'data_root', 'install_root', 'runtime_pid', 'server_pid', 'readiness']
  assert.ok(required.every(key => Object.hasOwn(ready, key)) && Object.keys(ready).every(key => required.includes(key) || key === 'resource_samples'), 'linux_service_ready_fields')
  assert.equal(ready.ok, true)
  assert.equal(ready.http, expected.endpoint, 'linux_service_endpoint_changed')
  assert.equal(ready.data_root, expected.data_root, 'linux_service_data_root_changed')
  assert.equal(ready.install_root, expected.installation, 'linux_service_installation_changed')
  assert.deepEqual(ready.readiness, { runtimeId: expected.runtime_id, dataRoot: expected.data_root, node: expected.node }, 'linux_service_readiness_changed')
  for (const pid of [ready.runtime_pid, ready.server_pid]) assert.ok(Number.isSafeInteger(pid) && pid > 0, 'linux_service_pid_invalid')
  assert.notEqual(ready.runtime_pid, ready.server_pid, 'linux_service_process_roles_overlap')
  if (ready.resource_samples !== undefined) {
    const samples = object(ready.resource_samples)
    assert.deepEqual(Object.keys(samples).sort(), ['available_bytes', 'logical_cpus', 'platform', 'sampled_at'])
    assert.equal(samples.platform, 'linux')
    assert.ok(Number.isSafeInteger(samples.available_bytes) && samples.available_bytes >= 0)
    assert.ok(Number.isSafeInteger(samples.logical_cpus) && samples.logical_cpus > 0)
    assert.ok(typeof samples.sampled_at === 'string' && Number.isFinite(Date.parse(samples.sampled_at)))
  }
  return ready
}

export function validateCodexEventView(rows, expected) {
  assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length <= 100_000, 'codex_trace_inventory_bound')
  const first = object(rows[0])
  assert.equal(first.event, 'custody')
  const custody = object(first.detail)
  assert.equal(custody.platform, 'linux')
  assert.equal(custody.custodyAdmitted, true)
  uuid(custody.custody_id)
  assert.deepEqual(incarnation(custody.root), incarnation(expected.process))
  assert.deepEqual({ ...custody.root, runtime_id: expected.process.runtime_id }, expected.process)
  assert.equal(custody.nativeState?.state, 'created', 'codex_native_process_not_created')
  const nativeCLI = object(custody.nativeCLI)
  assert.deepEqual(incarnation(nativeCLI), incarnation(custody.nativeState.identity))
  assert.deepEqual(nativeCLI, { ...custody.nativeState.identity, ...custody.nativeState.launch })
  assert.notEqual(nativeCLI.pid, expected.process.pid)
  if (nativeCLI.kind === 'executable') assert.equal(nativeCLI.program, expected.executable)
  else {
    assert.equal(nativeCLI.kind, 'node-script')
    assert.equal(nativeCLI.entry, expected.executable)
    assert.equal(nativeCLI.program, expected.nodeExecutable)
  }
  const active = new Set(), turns = new Set()
  let previousMonotonic = -1, thread, policyReady = false, opened = false
  for (const [index, row] of rows.entries()) {
    object(row)
    assert.equal(row.protocol, 'codex-app-server')
    assert.equal(row.projection, 'actual_native_app_server_frames')
    assert.equal(row.session_id, expected.session)
    assert.equal(row.runtime_fence, expected.fence)
    assert.equal(row.runtime_epoch, expected.runtimeEpoch)
    assert.equal(row.sequence, index + 1)
    assert.ok(Number.isFinite(row.monotonic_ms) && row.monotonic_ms >= previousMonotonic)
    assert.ok(Number.isFinite(Date.parse(row.observed_at)))
    assert.deepEqual(row.process, expected.process)
    assert.deepEqual(row.native_cli, nativeCLI)
    previousMonotonic = row.monotonic_ms
    if (row.event === 'custody') assert.equal(index, 0)
    else if (row.event === 'policy_ready') {
      assert.equal(policyReady, false)
      assert.equal(opened, false)
      assert.equal(row.detail.native_contract, 'codex-cli-0.163.0')
      assert.equal(row.detail.model, expected.model)
      assert.equal(row.detail.provider, 'openai')
      assert.equal(row.detail.remote_control_status, 'disabled')
      policyReady = true
    } else if (row.event === 'thread_opened') {
      assert.equal(policyReady, true)
      assert.equal(opened, false)
      const actual = object(frame(row).result)
      thread = object(actual.thread).id
      uuid(thread)
      assert.equal(thread, expected.nativeId)
      assert.equal(actual.model, expected.model)
      assert.equal(actual.modelProvider, 'openai')
      opened = true
    } else if (row.event === 'notification') {
      assert.equal(policyReady, true)
      const actual = frame(row), params = object(actual.params)
      assert.equal(actual.method, row.detail.method)
      assert.ok(Number.isSafeInteger(actual.emittedAtMs) && actual.emittedAtMs >= 0)
      if (actual.method === 'thread/started') {
        assert.equal(object(params.thread).id, expected.nativeId)
      } else {
        assert.equal(params.threadId, expected.nativeId)
        if (actual.method === 'turn/started') {
          const id = object(params.turn).id
          assert.ok(typeof id === 'string' && id.length > 0 && !turns.has(id))
          turns.add(id); active.add(id)
        } else if (actual.method === 'turn/completed') {
          const actualTurn = object(params.turn)
          assert.equal(active.delete(actualTurn.id), true, 'codex_turn_completion_has_no_actual_start')
          assert.ok(['completed', 'interrupted'].includes(actualTurn.status))
          assert.equal(actualTurn.error ?? null, null)
        } else if (params.turnId !== undefined) assert.ok(active.has(params.turnId))
        if (deltaMethods.has(actual.method)) {
          assert.ok(typeof params.turnId === 'string' && typeof params.itemId === 'string' && params.itemId.length > 0 && typeof params.delta === 'string')
        }
      }
    } else if (row.event === 'custody_closed') assert.equal(index, rows.length - 1)
    else assert.fail('codex_event_unreviewed')
  }
  assert.equal(policyReady, true, 'actual_native_policy_ready_not_observed')
  assert.equal(opened, true, 'actual_native_thread_reply_not_observed')
  return { custody, nativeCLI, thread, activeTurnIds: [...active], turnIds: [...turns] }
}

export function originalLinuxTreeProof(rows, view, checkpoint) {
  const row = object(rows.at(-1))
  assert.equal(row.event, 'custody_closed')
  assert.ok(row.sequence > checkpoint.sequence, 'codex_closed_proof_precedes_original_stop')
  const final = validateLinuxFinalCustody(row.detail, view)
  return { row, final, original_stop_request: checkpoint.request_id, observed_after_sequence: checkpoint.sequence }
}

export function validateLinuxFinalCustody(value, view) {
  const final = object(value)
  assert.equal(final.platform, 'linux')
  assert.equal(final.acknowledgement_delivered, true)
  assert.equal(final.root_exit_observed, true)
  assert.equal(final.root_absent, true)
  const observed = object(final.observation), proof = object(observed.fullTreeProof)
  assert.equal(observed.custody_id, view.custody.custody_id)
  assert.equal(observed.custodyAdmitted, true)
  assert.deepEqual(observed.root, view.custody.root)
  assert.deepEqual(observed.owner, view.custody.owner)
  assert.deepEqual(observed.nativeCLI, view.nativeCLI)
  assert.equal(proof.type, 'swa_linux_fulltreeclosed')
  assert.equal(proof.custody_id, view.custody.custody_id)
  uuid(proof.stop_id) // 原 Tree 的内部 UUID，与公开 stop 请求 R 分别绑定。
  assert.deepEqual(proof.root, view.custody.root)
  assert.deepEqual(proof.owner, view.custody.owner)
  assert.deepEqual(proof.native_cli, view.custody.nativeState)
  assert.equal(proof.observations.length, 2)
  for (const item of proof.observations) {
    assert.equal(item.state, 'no-children')
    assert.ok(Number.isFinite(item.monotonic_ms) && item.monotonic_ms >= 0)
  }
  assert.ok(proof.observations[1].monotonic_ms > proof.observations[0].monotonic_ms)
  assert.equal(typeof proof.forced, 'boolean')
  return final
}
