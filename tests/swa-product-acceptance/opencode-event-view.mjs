// 只投影实际受控 ACP 轨迹；原生输入的 MAC 仍由装内成果读取器核验。
import assert from 'node:assert/strict'
import { isAbsolute, join } from 'node:path'
import { validateStructuredFinalCustody, validateWindowsInitialCustody } from './pi-event-view.mjs'

const object = value => { assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'opencode_source_object_missing'); return value }
const keys = (value, names) => assert.deepEqual(Object.keys(object(value)).sort(), [...names].sort(), 'opencode_source_unknown_fields')
const frameOf = row => row.event === 'native_record' ? row.detail?.frame : undefined
const policyOf = row => row.event === 'native_policy' ? row.detail?.row : undefined
export const isOpenCodeDelta = row => {
  const frame = frameOf(row), update = frame?.params?.update
  return row.protocol === 'acp' && frame?.method === 'session/update' && ['agent_message_chunk', 'agent_thought_chunk'].includes(update?.sessionUpdate) && update.content?.type === 'text' && typeof update.content.text === 'string' && update.content.text.length > 0
}
export const openCodeStarts = rows => rows.filter(row => policyOf(row)?.state === 'http_request')
export const openCodeEnds = rows => {
  const ids = new Set(rows.filter(row => row.event === 'write_intent').map(row => row.detail.request_id))
  return rows.filter(row => { const frame = frameOf(row); return frame?.method === undefined && ids.has(frame?.id) && (Object.hasOwn(frame, 'result') || Object.hasOwn(frame, 'error')) })
}
export function validateOpenCodeLaunchRecord(value, expected) {
  keys(value, ['installation', 'source_revision', 'data_root', 'endpoint', 'serve_pid', 'opencode_api_key_home'])
  for (const name of ['installation', 'source_revision', 'data_root', 'endpoint']) assert.equal(value[name], expected[name], 'opencode_owned_launch_changed')
  assert.ok(Number.isSafeInteger(value.serve_pid) && value.serve_pid > 0)
  assert.ok(isAbsolute(value.opencode_api_key_home))
  return value
}
export function validateOpenCodeSelection(selection, expected) {
  assert.equal(selection.agent_id, 'opencode'); assert.equal(selection.version, '2.0.31')
  assert.equal(selection.model, 'stepfun/step-3.5-flash'); assert.equal(selection.provider, 'stepfun')
  assert.equal(selection.executable, expected.executable)
  const launch = object(selection.native_launch), account = object(launch.account)
  assert.equal(launch.schema, 'swa.native-launch.v1')
  assert.deepEqual(launch.tools, { mode: 'disabled', native_contract: 'opencode-cli-2.0.31' })
  assert.equal(account.kind, 'opencode-native-stepfun-api-key'); assert.equal(account.provider, 'stepfun')
  assert.equal(account.source_home, expected.sourceHome); assert.equal(account.private_root, expected.privateRoot)
  assert.deepEqual(account.model_target, { model_id: 'step-3.5-flash', api: 'openai-completions', base_url: 'https://api.stepfun.com/v1' })
  for (const [field, suffix] of [['config_source', '.config/opencode/opencode.jsonc'], ['auth_source', '.local/share/opencode/auth.json'], ['database_source', '.local/share/opencode/opencode.db']]) {
    keys(account[field], ['path', 'version'])
    assert.equal(account[field].path, join(expected.sourceHome, suffix))
    assert.ok(typeof account[field].version === 'string' && account[field].version)
  }
  assert.ok(typeof account.credential_id === 'string' && account.credential_id)
  assert.ok(Number.isSafeInteger(account.credential_updated_at) && account.credential_updated_at >= 0)
  return account
}
export function validateOpenCodeEventView(rows, expected) {
  assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length <= 100_000, 'opencode_trace_inventory_bound')
  assert.equal(rows[0].event, 'custody')
  const custody = object(rows[0].detail), nativeCLI = object(custody.nativeCLI)
  if (expected.process.platform === 'linux') {
    assert.equal(custody.platform, 'linux'); assert.equal(custody.custodyAdmitted, true)
    assert.deepEqual({ ...custody.root, runtime_id: expected.process.runtime_id }, expected.process)
    assert.equal(custody.nativeState?.state, 'created')
    assert.deepEqual(nativeCLI, { ...custody.nativeState.identity, ...custody.nativeState.launch })
  } else validateWindowsInitialCustody(custody, expected.process, nativeCLI, expected.owner)
  assert.equal(nativeCLI.kind, 'executable'); assert.equal(nativeCLI.program, expected.executable)
  assert.notEqual(nativeCLI.pid, expected.process.pid)
  const writes = new Map(), delivered = new Set(), requests = new Map(), cycles = [], projections = []
  let monotonic = -1, policySequence = 0, server, ready, active, finalRow, stdoutEnd, policyActive = false
  for (const [index, row] of rows.entries()) {
    keys(row, ['protocol', 'projection', 'session_id', 'runtime_fence', 'runtime_epoch', 'sequence', 'observed_at', 'monotonic_ms', 'event', 'process', 'native_cli', 'detail'])
    assert.equal(row.protocol, 'acp'); assert.equal(row.projection, 'actual_native_acp_frames_and_input_bindings')
    assert.equal(row.session_id, expected.session); assert.equal(row.runtime_fence, expected.fence); assert.equal(row.runtime_epoch, expected.runtimeEpoch)
    assert.equal(row.sequence, index + 1); assert.ok(Number.isFinite(Date.parse(row.observed_at)))
    assert.ok(Number.isFinite(row.monotonic_ms) && row.monotonic_ms >= monotonic); monotonic = row.monotonic_ms
    assert.deepEqual(row.process, expected.process); assert.deepEqual(row.native_cli, nativeCLI)
    assert.equal(finalRow, undefined, 'opencode_record_after_final_custody')
    const detail = object(row.detail)
    if (row.event === 'custody') assert.equal(index, 0)
    else if (row.event === 'native_policy') {
      const status = object(detail.row)
      assert.equal(status.type, 'swa_opencode_policy'); assert.equal(status.sequence, ++policySequence)
      assert.equal(status.root, expected.home); assert.equal(status.pid, detail.server.pid)
      if (expected.process.platform !== 'linux') {
        keys(detail.server, ['platform', 'pid', 'creationTimeMs'])
        assert.equal(detail.server.platform, 'win32')
        assert.ok(Number.isSafeInteger(detail.server.pid) && detail.server.pid > 0 && Number.isSafeInteger(detail.server.creationTimeMs) && detail.server.creationTimeMs > 0)
      }
      if (server) assert.deepEqual(detail.server, server); else server = detail.server
      assert.equal(detail.identity_basis, status.state === 'inactive' ? 'previously_verified_identity' : 'live_process_observation')
      assert.ok(!['failed', 'rejected', 'retry_disabled'].includes(status.state), 'opencode_policy_failed')
      if (status.state === 'active') {
        assert.equal(policyActive, false); assert.equal(status.tools_count, 0); policyActive = true
        assert.equal(status.directory, expected.cwd)
        for (const [name, suffix] of Object.entries({ home: 'home', data: 'data', cache: 'cache', config: 'config', state: 'state', programdata: 'programdata', temp: 'temp', database: 'data/opencode/opencode.db' })) assert.equal(status.roots[name], join(expected.home, suffix))
        assert.ok(Array.isArray(status.plugins) && status.plugins.every(plugin => plugin.state === 'active'))
      } else if (status.state === 'inactive') policyActive = false
      else if (status.state === 'http_request') {
        assert.ok(policyActive && active && active.written && !active.start, 'opencode_http_outside_written_input')
        assert.equal(status.session_id, expected.nativeId); assert.equal(status.model, 'step-3.5-flash')
        assert.equal(status.initial_url, 'https://api.stepfun.com/v1/chat/completions'); assert.equal(status.tools_count, 0)
        active.start = row
      } else if (status.state === 'http_response') {
        assert.equal(status.session_id, expected.nativeId)
        assert.ok(active?.start && !active.httpResponse, 'opencode_http_response_outside_input')
        assert.ok(Number.isInteger(status.status) && status.status >= 200 && status.status < 300, 'opencode_http_response_failed')
        active.httpResponse = row
      } else assert.fail('opencode_policy_state_unreviewed')
    } else if (row.event === 'policy_ready') {
      assert.equal(ready, undefined); assert.equal(policyActive, true)
      keys(detail, ['native_contract', 'provider', 'model', 'server'])
      assert.equal(detail.native_contract, 'opencode-cli-2.0.31'); assert.equal(detail.provider, 'stepfun'); assert.equal(detail.model, 'stepfun/step-3.5-flash')
      assert.deepEqual(detail.server, server); ready = detail
    } else if (row.event === 'write_intent') {
      keys(detail, ['binding', 'request_id', 'native_session_id'])
      assert.ok(ready && !active, 'opencode_input_overlaps_unsettled_request')
      const binding = object(detail.binding), id = detail.request_id
      assert.ok(Number.isSafeInteger(id) && id > 0 && !requests.has(id)); assert.equal(detail.native_session_id, expected.nativeId)
      assert.equal(binding.agent, 'opencode'); assert.equal(binding.session_id, expected.session); assert.equal(binding.runtime_fence, expected.fence)
      assert.equal(binding.body.kind, 'message'); assert.ok(Array.isArray(binding.body.blocks) && binding.body.blocks.length > 0 && binding.body.blocks.every(block => block.type === 'text' && typeof block.text === 'string'))
      assert.ok(typeof binding.operation_id === 'string' && binding.operation_id && !writes.has(binding.operation_id))
      active = { cid: binding.operation_id, requestId: id, binding, write: row, written: false, deltas: [] }
      writes.set(active.cid, active); requests.set(id, active); cycles.push(active)
    } else if (row.event === 'write_settled') {
      keys(detail, ['operation_id', 'request_id', 'outcome', 'writeAttempted', 'cleanupCompleted'])
      const cycle = writes.get(detail.operation_id)
      assert.ok(cycle && cycle === active && !cycle.settlement)
      assert.equal(detail.request_id, cycle.requestId); cycle.settlement = row
      assert.ok(['resolved', 'rejected'].includes(detail.outcome)); assert.equal(typeof detail.writeAttempted, 'boolean'); assert.equal(typeof detail.cleanupCompleted, 'boolean')
      cycle.written = detail.outcome === 'resolved' && detail.writeAttempted && detail.cleanupCompleted
      if (!cycle.written) { cycle.unknown = detail.writeAttempted; cycle.rejected = !detail.writeAttempted; active = undefined }
    } else if (row.event === 'input_delivered') {
      keys(detail, ['binding', 'request_id', 'native_session_id', 'message_id', 'seq'])
      const cycle = writes.get(detail.binding.operation_id)
      assert.ok(cycle?.written && !cycle.delivery && !delivered.has(detail.message_id))
      assert.deepEqual(detail.binding, cycle.binding); assert.equal(detail.request_id, cycle.requestId); assert.equal(detail.native_session_id, expected.nativeId)
      assert.ok(typeof detail.message_id === 'string' && detail.message_id.startsWith('msg_')); assert.ok(Number.isSafeInteger(detail.seq) && detail.seq > 0)
      cycle.delivery = row; delivered.add(detail.message_id)
    } else if (row.event === 'native_record') {
      keys(detail, ['frame', 'raw_line']); assert.equal(typeof detail.raw_line, 'string'); assert.deepEqual(JSON.parse(detail.raw_line), detail.frame)
      const frame = object(detail.frame)
      if (frame.method === 'session/update') assert.equal(frame.params.sessionId, expected.nativeId)
      if (isOpenCodeDelta(row)) {
        assert.ok(active?.written && active.start, 'opencode_delta_outside_original_request')
        active.deltas.push(row)
      }
      if (frame.method === undefined && requests.has(frame.id)) {
        const cycle = requests.get(frame.id)
        assert.ok(cycle === active && cycle.written && !cycle.end, 'opencode_reply_outside_original_request')
        cycle.end = row
        if (Object.hasOwn(frame, 'result')) {
          assert.ok(['end_turn', 'cancelled', 'max_tokens', 'max_turn_requests', 'refusal'].includes(frame.result?.stopReason), 'opencode_unknown_stop_reason')
          if (frame.result.stopReason === 'end_turn') { assert.ok(cycle.start && cycle.deltas.length > 0 && cycle.httpResponse, 'opencode_success_has_no_actual_output'); cycle.idle = row }
        } else assert.ok(Object.hasOwn(frame, 'error'), 'opencode_prompt_reply_missing')
        active = undefined
      }
    } else if (row.event === 'projection') projections.push(row)
    else if (row.event === 'stdout_end') { keys(detail, ['complete']); assert.equal(detail.complete, true); assert.equal(stdoutEnd, undefined); stdoutEnd = row }
    else if (row.event === 'custody_closed') { assert.ok(stdoutEnd); finalRow = row }
    else assert.fail('opencode_trace_event_unreviewed')
  }
  const view = { custody, nativeCLI, ready, server, cycles, active, projections, finalRow, stdoutEnd, writes }
  if (finalRow) validateStructuredFinalCustody(finalRow.detail, view)
  return view
}
export function originalOpenCodeTreeProof(rows, view, checkpoint, active) {
  const row = rows.at(-1)
  assert.equal(row.event, 'custody_closed'); assert.ok(row.sequence > checkpoint.sequence)
  const final = validateStructuredFinalCustody(row.detail, view)
  assert.equal(final.platform === 'win32' ? final.forced : final.observation.fullTreeProof.forced, false, 'opencode_normal_stop_was_forced')
  if (active) {
    const cycle = view.cycles.find(value => value.cid === checkpoint.cid)
    assert.ok(cycle?.start && cycle.deltas.some(delta => delta.sequence <= checkpoint.sequence), 'opencode_stop_without_actual_active_output')
    assert.ok(!cycle.end || cycle.end.sequence > checkpoint.sequence, 'opencode_turn_ended_before_stop_checkpoint')
  }
  // 这是调用停止前的原轨迹位置，不把观察时间写成原生 stop_intent。
  return { row, final, checkpoint, stop_checkpoint: { request_id: checkpoint.request_id, monotonic_ms: checkpoint.monotonic_ms }, source: final.platform === 'win32' ? 'original_provider_trace_and_full_windows_job_custody' : 'original_provider_trace_and_full_linux_custody' }
}
