// 只关联本轮真实问题原件；安装严格协议、文件和当前数据库来源由调用者先行核验。
import assert from 'node:assert/strict'
import { basename, join } from 'node:path'
import { validateLinuxFinalCustody } from './codex-event-view.mjs'
import { piStarts, piEnds, isPiDelta } from './pi-event-view.mjs'

export { readPiPrivateJson, validatePiLaunchRecord } from './pi-event-view.mjs'
const object = value => { assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'pi_question_object_missing'); return value }
const keys = (value, names) => assert.deepEqual(Object.keys(object(value)).sort(), [...names].sort(), 'pi_question_unknown_fields')
const fields = (value, required, optional = []) => {
  object(value)
  assert.ok(required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key)), 'pi_question_unknown_fields')
}
const uuid = value => assert.match(value, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, 'pi_question_uuid_missing')
const source = value => { keys(value, ['path', 'version']); assert.ok(typeof value.path === 'string' && typeof value.version === 'string' && value.version.length > 0) }
const model = value => {
  assert.equal(value.provider, 'stepfun'); assert.equal(value.id, 'step-3.5-flash')
  assert.equal(value.api, 'openai-completions'); assert.equal(value.baseUrl, 'https://api.stepfun.com/v1')
}
const frameOf = row => row.event === 'native_record' ? row.detail.frame : undefined
const incarnation = value => {
  assert.equal(value.platform, 'linux'); assert.ok(Number.isSafeInteger(value.pid) && value.pid > 0)
  uuid(value.boot_id); assert.match(value.start_ticks, /^[1-9][0-9]*$/); assert.match(value.owner_uid, /^(?:0|[1-9][0-9]*)$/)
  return { platform: value.platform, pid: value.pid, boot_id: value.boot_id, start_ticks: value.start_ticks, owner_uid: value.owner_uid }
}

export function validatePiQuestionSelection(selection, expected) {
  assert.equal(selection.agent_id, 'pi'); assert.equal(selection.execution_mode, 'structured'); assert.equal(selection.version, '1.0.1')
  assert.equal(selection.model, 'stepfun/step-3.5-flash'); assert.equal(selection.provider, 'stepfun'); assert.equal(selection.executable, expected.executable)
  const launch = object(selection.native_launch), account = object(launch.account)
  assert.equal(launch.schema, 'swa.native-launch.v1'); assert.equal(launch.tools?.mode, 'questions-only'); source(expected.extension)
  assert.deepEqual(launch.tools, { mode: 'questions-only', native_contract: 'pi-cli-1.0.1', extension: expected.extension, allowed: ['swa_ask'] })
  assert.equal(account.kind, 'pi-native-api-key-per-session'); assert.equal(account.provider, 'stepfun')
  assert.equal(account.source_home, expected.sourceHome); assert.equal(account.private_root, expected.privateRoot)
  assert.deepEqual(account.model_target, { model_id: 'step-3.5-flash', api: 'openai-completions', base_url: 'https://api.stepfun.com/v1' })
  for (const [name, value] of [['auth.json', account.auth_source], ['models.json', account.models_source]]) { source(value); assert.equal(value.path, join(expected.sourceHome, name)) }
  return account
}

function validateTrace(rows, expected, protocol) {
  assert.ok(Array.isArray(rows) && rows.length > 0 && rows.length <= 100_000, 'pi_question_trace_bound')
  assert.equal(rows[0].event, 'custody')
  const custody = object(rows[0].detail), nativeCLI = object(custody.nativeCLI)
  assert.equal(custody.platform, 'linux'); assert.equal(custody.custodyAdmitted, true); uuid(custody.custody_id)
  assert.deepEqual(incarnation(custody.root), incarnation(expected.process))
  assert.deepEqual({ ...custody.root, runtime_id: expected.process.runtime_id }, expected.process)
  assert.deepEqual(custody.owner, expected.runtimeCustodian)
  assert.equal(custody.nativeState?.state, 'created')
  assert.deepEqual(nativeCLI, { ...custody.nativeState.identity, ...custody.nativeState.launch })
  assert.deepEqual(incarnation(nativeCLI), incarnation(custody.nativeState.identity)); assert.notEqual(nativeCLI.pid, expected.process.pid)
  assert.equal(nativeCLI.kind, 'node-script'); assert.equal(nativeCLI.entry, expected.executable); assert.equal(nativeCLI.program, expected.nodeExecutable)
  const writes = new Map(), prompts = [], cycles = [], messages = [], tools = new Map(), projections = []
  let ready, previousTime = -1, pendingPrompt, active, finalRow, stopIntent, stopObservation, actualModel, catalog, thinking
  for (const [index, row] of rows.entries()) {
    keys(row, ['protocol', 'projection', 'session_id', 'runtime_fence', 'runtime_epoch', 'sequence', 'observed_at', 'monotonic_ms', 'process', 'native_cli', 'event', 'detail'])
    assert.equal(row.protocol, 'pi-jsonl-rpc'); assert.equal(row.projection, 'actual_native_rpc_frames')
    assert.equal(row.session_id, expected.session); assert.equal(row.runtime_fence, expected.fence); assert.equal(row.runtime_epoch, expected.runtimeEpoch)
    assert.equal(row.sequence, index + 1); assert.ok(Number.isFinite(Date.parse(row.observed_at)))
    assert.ok(Number.isFinite(row.monotonic_ms) && row.monotonic_ms >= previousTime); previousTime = row.monotonic_ms
    assert.deepEqual(row.process, expected.process); assert.deepEqual(row.native_cli, nativeCLI)
    const detail = object(row.detail)
    if (row.event === 'custody') assert.equal(index, 0)
    else if (row.event === 'policy_ready') {
      keys(detail, ['native_contract', 'session_id', 'session_file', 'acquisition_generation', 'provider', 'model', 'tools', 'sources', 'settings'])
      assert.equal(ready, undefined); assert.equal(detail.native_contract, 'pi-cli-1.0.1'); uuid(detail.session_id); uuid(detail.acquisition_generation)
      assert.equal(detail.session_file, expected.sessionFile); assert.equal(detail.provider, 'stepfun'); assert.equal(detail.tools, 'questions-only')
      assert.deepEqual(detail.model, { model_id: 'step-3.5-flash', api: 'openai-completions', base_url: 'https://api.stepfun.com/v1' })
      assert.ok(Array.isArray(detail.sources) && detail.sources.length >= 1130)
      for (const item of [...detail.sources, detail.settings]) source(item)
      assert.equal(new Set(detail.sources.map(item => item.path)).size, detail.sources.length)
      assert.equal(detail.settings.path, join(expected.home, 'settings.json'))
      for (const name of ['auth.json', 'models.json']) assert.equal(detail.sources.filter(item => item.path === join(expected.home, name)).length, 1)
      assert.deepEqual(detail.sources.filter(item => item.path === expected.extension.path), [expected.extension])
      ready = detail
    } else if (row.event === 'write_intent') {
      fields(detail, ['command', 'id', 'frame', 'settings'], ['cid', 'binding', 'native_baseline'])
      protocol.strictPiOutboundSchema.parse(detail.frame); source(detail.settings)
      assert.equal(detail.settings.path, join(expected.home, 'settings.json')); assert.equal(detail.id, detail.frame.id); assert.equal(detail.command, detail.frame.type)
      assert.ok(typeof detail.id === 'string' && !writes.has(detail.id))
      const write = { row, detail, settled: false, reply: null }; writes.set(detail.id, write)
      if (detail.command === 'prompt') {
        assert.ok(ready && !stopIntent && (!pendingPrompt || pendingPrompt.echo), 'pi_question_prompt_outside_ready')
        assert.equal(detail.cid, detail.id); assert.equal(detail.binding?.operation_id, detail.id)
        assert.equal(detail.binding.session_id, expected.session); assert.equal(detail.binding.runtime_fence, expected.fence); assert.equal(detail.binding.agent, 'pi')
        assert.equal(detail.binding.dispatch_id, expected.dispatchId)
        assert.ok(detail.native_baseline)
        if (Object.hasOwn(detail.native_baseline, 'absent')) { keys(detail.native_baseline, ['absent']); assert.equal(detail.native_baseline.absent, true) }
        else {
          keys(detail.native_baseline, ['source', 'bytes', 'sha256']); source(detail.native_baseline.source)
          assert.equal(detail.native_baseline.source.path, expected.sessionFile)
          assert.ok(Number.isSafeInteger(detail.native_baseline.bytes) && detail.native_baseline.bytes >= 0); assert.match(detail.native_baseline.sha256, /^[a-f0-9]{64}$/)
        }
        pendingPrompt = { write, cid: detail.id, echo: null }; prompts.push(pendingPrompt)
      } else {
        assert.ok(!Object.hasOwn(detail, 'cid') && !Object.hasOwn(detail, 'binding') && !Object.hasOwn(detail, 'native_baseline'))
        if (stopIntent) assert.ok(['abort', 'get_state'].includes(detail.command))
      }
    } else if (row.event === 'write_settled') {
      fields(detail, ['command', 'id', 'outcome', 'writeAttempted', 'cleanupCompleted'], ['cid'])
      const write = writes.get(detail.id)
      assert.ok(write && !write.settled && write.detail.command === detail.command && write.detail.cid === detail.cid)
      assert.equal(detail.outcome, 'resolved'); assert.equal(detail.writeAttempted, true); assert.equal(detail.cleanupCompleted, true)
      write.settled = true; write.settlement = row
    } else if (row.event === 'native_record') {
      fields(detail, ['frame', 'raw_line'], ['response', 'cid'])
      const frame = protocol.strictPiQuestionRawSchema.parse(detail.frame)
      assert.deepEqual(protocol.parseStrictPiJson(detail.raw_line), frame)
      if (frame.type !== 'response') assert.ok(!Object.hasOwn(detail, 'response'))
      if (!(frame.type === 'message_end' && frame.message.role === 'user')) assert.ok(!Object.hasOwn(detail, 'cid'))
      if (frame.type === 'response') {
        keys(detail.response, ['id', 'command'])
        const write = writes.get(frame.id)
        assert.ok(write && !write.reply && write.detail.command === frame.command && write.row.sequence < row.sequence)
        assert.deepEqual(detail.response, { id: frame.id, command: frame.command }); write.reply = row
        if (frame.command === 'get_state') {
          assert.equal(frame.data.sessionFile, expected.sessionFile); if (ready) assert.equal(frame.data.sessionId, ready.session_id)
          model(frame.data.model); assert.equal(frame.data.autoCompactionEnabled, false)
          if (actualModel) assert.deepEqual(frame.data.model, actualModel); if (catalog) assert.deepEqual(frame.data.model, catalog[0]); actualModel ??= frame.data.model
          if (thinking !== undefined) assert.equal(frame.data.thinkingLevel, thinking); thinking ??= frame.data.thinkingLevel
          if (active?.settled && !frame.data.isStreaming && !frame.data.isCompacting && frame.data.pendingMessageCount === 0) { active.idle = row; active = undefined }
        } else if (frame.command === 'set_thinking_level') thinking = write.detail.frame.level
        else if (frame.command === 'set_model') { model(frame.data); if (actualModel) assert.deepEqual(frame.data, actualModel); if (catalog) assert.deepEqual(frame.data, catalog[0]); actualModel ??= frame.data }
        else if (frame.command === 'get_available_models') {
          assert.equal(frame.data.models.length, 1); model(frame.data.models[0]); if (actualModel) assert.deepEqual(frame.data.models[0], actualModel); if (catalog) assert.deepEqual(frame.data.models, catalog); catalog ??= frame.data.models
        }
      } else if (frame.type === 'agent_start') {
        assert.ok(ready && !active && pendingPrompt && !pendingPrompt.echo)
        active = { start: row, cid: pendingPrompt.cid, completedMessages: [], toolResults: [], deltas: [] }; cycles.push(active)
      } else if (frame.type === 'message_start' && frame.message.role === 'assistant') {
        assert.ok(active && !active.end && pendingPrompt?.echo && !active.message)
        active.message = { row, initial: frame.message, blocks: new Map() }
      } else if (frame.type === 'message_update') {
        assert.ok(active && !active.end && !active.settled && active.message && pendingPrompt?.echo)
        const delta = frame.assistantMessageEvent, current = active.message, kind = delta.type.startsWith('toolcall_') ? 'toolCall' : delta.type.startsWith('text_') ? 'text' : 'thinking'
        if (delta.type.endsWith('_start')) {
          assert.ok(!current.blocks.has(delta.contentIndex)); const initial = current.initial.content[delta.contentIndex]
          if (initial) assert.equal(initial.type, kind)
          current.blocks.set(delta.contentIndex, { kind, text: kind === 'toolCall' ? '' : initial?.[kind] ?? '', start: row, end: null, id: delta.id, name: delta.toolName })
        } else {
          const block = current.blocks.get(delta.contentIndex); assert.ok(block && block.kind === kind && !block.end)
          if (delta.type.endsWith('_delta')) { block.text += delta.delta; active.deltas.push(row) }
          else { if (kind === 'toolCall') { if (block.id) assert.equal(delta.toolCall.id, block.id); if (block.name) assert.equal(delta.toolCall.name, block.name); block.call = delta.toolCall } else assert.equal(delta.content, block.text); block.end = row }
        }
      } else if (frame.type === 'message_end') {
        messages.push({ row, message: frame.message })
        if (frame.message.role === 'user') {
          assert.ok(active && pendingPrompt && !pendingPrompt.echo); assert.equal(detail.cid, pendingPrompt.cid)
          assert.deepEqual(frame.message.content, [{ type: 'text', text: pendingPrompt.write.detail.frame.message }]); pendingPrompt.echo = row
        } else if (frame.message.role === 'assistant') {
          assert.ok(active && !active.end && active.message && pendingPrompt?.echo)
          const current = active.message
          assert.equal(frame.message.timestamp, current.initial.timestamp)
          for (const name of ['provider', 'model', 'api']) assert.equal(frame.message[name], current.initial[name])
          assert.equal(frame.message.provider, 'stepfun'); assert.equal(frame.message.model, 'step-3.5-flash'); assert.equal(frame.message.api, 'openai-completions')
          for (const [offset, content] of frame.message.content.entries()) {
            const block = current.blocks.get(offset), text = content.type === 'text' ? content.text : content.type === 'thinking' ? content.thinking : undefined
            if (!block && text === '') continue
            assert.ok(block && block.kind === content.type && (block.end || frame.message.stopReason === 'aborted' && stopIntent?.sequence < row.sequence))
            if (content.type === 'toolCall') { assert.deepEqual(block.call, content); assert.ok(!tools.has(content.id)); tools.set(content.id, { call: content, assistant: row, cycle: active }) }
            else assert.equal(block.text, text)
          }
          for (const offset of current.blocks.keys()) assert.ok(offset < frame.message.content.length)
          if (frame.message.stopReason === 'aborted') assert.ok(stopIntent?.sequence < row.sequence)
          active.completedMessages.push({ ...current, final: row }); active.finalMessage = row; active.message = undefined
        } else if (frame.message.role === 'toolResult') {
          const tool = tools.get(frame.message.toolCallId)
          assert.ok(active && tool?.cycle === active && tool.end && !tool.result && tool.end.sequence < row.sequence)
          assert.deepEqual(frame.message.content, tool.end.detail.frame.result.content); assert.deepEqual(frame.message.details, tool.end.detail.frame.result.details)
          assert.equal(frame.message.isError, tool.end.detail.frame.isError); tool.result = row; active.toolResults.push(row)
        }
      } else if (frame.type === 'tool_execution_start') {
        const tool = tools.get(frame.toolCallId)
        assert.ok(active && tool?.cycle === active && !tool.start && tool.assistant.sequence < row.sequence)
        assert.deepEqual(frame.args, tool.call.arguments); tool.start = row
      } else if (frame.type === 'tool_execution_end') {
        const tool = tools.get(frame.toolCallId)
        assert.ok(active && tool?.cycle === active && tool.start && !tool.end && tool.start.sequence < row.sequence); tool.end = row
      } else if (frame.type === 'turn_end') {
        assert.ok(active && !active.end && active.finalMessage && !active.message)
        assert.deepEqual(frame.message, active.finalMessage.detail.frame.message)
        const called = active.finalMessage.detail.frame.message.content.filter(item => item.type === 'toolCall')
        assert.deepEqual(frame.toolResults, called.map(call => { const tool = tools.get(call.id); assert.ok(tool?.result); return tool.result.detail.frame.message }))
        active.turnEnd = row
      } else if (frame.type === 'agent_end') {
        assert.ok(active && !active.end && (active.turnEnd || stopIntent?.sequence < row.sequence) && !active.message && active.finalMessage)
        assert.ok(frame.messages.some(message => JSON.stringify(message) === JSON.stringify(active.finalMessage.detail.frame.message))); active.end = row
      } else if (frame.type === 'agent_settled') { assert.ok(active?.end && !active.settled); active.settled = row }
    } else if (row.event === 'projection_published') {
      fields(detail, ['sourceSequence', 'eventType', 'acquisitionGeneration', 'report'], ['clientMessageId', 'providerItem'])
      assert.ok(['input.accepted', 'turn.open', 'turn.end', 'item.open', 'item.update', 'item.close', 'text.delta', 'text.close', 'request.open', 'request.withdrawn', 'context.usage', 'activity', 'provider.frame', 'session.ended'].includes(detail.eventType))
      assert.ok(ready && detail.acquisitionGeneration === ready.acquisition_generation && Number.isSafeInteger(detail.sourceSequence) && detail.sourceSequence > 0 && detail.sourceSequence < row.sequence)
      assert.equal(rows[detail.sourceSequence - 1].event, 'native_record'); keys(detail.report, ['journalEpoch', 'published', 'steps']); assert.equal(detail.report.journalEpoch, expected.journalEpoch)
      assert.ok(Array.isArray(detail.report.steps)); assert.equal(typeof detail.report.published, 'boolean')
      for (const step of detail.report.steps) {
        assert.equal(typeof step.written, 'boolean')
        if (step.kind === 'item') { keys(step, ['kind', 'written', 'itemId']); assert.ok(step.written ? typeof step.itemId === 'string' && step.itemId.length > 0 : step.itemId === null) }
        else { keys(step, ['kind', 'written', 'settlementId']); assert.equal(step.kind, 'settlement'); assert.equal(typeof step.settlementId, 'string') }
      }
      if (detail.report.published || detail.eventType === 'input.accepted') assert.equal(detail.report.published, detail.report.steps.some(step => step.written))
      projections.push(row)
    } else if (row.event === 'stop_intent') { keys(detail, ['turn_id', 'cid']); assert.equal(stopIntent, undefined); stopIntent = row }
    else if (row.event === 'custody_closed') {
      assert.equal(index, rows.length - 1); assert.ok(ready && (!pendingPrompt || pendingPrompt.echo))
      for (const write of writes.values()) assert.ok(write.settled && write.reply)
      const final = validateLinuxFinalCustody(detail, { custody, nativeCLI }); assert.equal(final.observation.fullTreeProof.forced, false)
      if (expected.stop) {
        const stopped = object(expected.stop), aborts = [...writes.values()].filter(write => write.detail.command === 'abort' && write.row.sequence > stopIntent?.sequence)
        assert.equal(stopped.method, 'orchestration.workerStop'); assert.equal(stopped.state, 'completed')
        assert.equal(stopped.receipt.dispatchId, expected.dispatchId); assert.equal(stopped.receipt.state, 'stopped')
        assert.equal(stopped.receipt.mutation?.requestId, stopped.request_id); assert.equal(expected.source.worker_state, 'stopped')
        assert.ok(stopIntent && cycles.some(cycle => cycle.start.sequence < stopIntent.sequence && (!cycle.idle || cycle.idle.sequence > stopIntent.sequence)))
        assert.equal(aborts.length, 1); assert.ok(aborts[0].reply.sequence > aborts[0].row.sequence && aborts[0].reply.sequence < row.sequence)
        stopObservation = { request_id: stopped.request_id, stop_sequence: stopIntent.sequence, abort_write_sequence: aborts[0].row.sequence,
          abort_reply_sequence: aborts[0].reply.sequence, custody_closed_sequence: row.sequence }
      }
      if (active) {
        assert.ok(stopIntent && active.cid === stopIntent.detail.cid && active.start.sequence < stopIntent.sequence && !active.message)
        const aborts = [...writes.values()].filter(write => write.detail.command === 'abort' && write.row.sequence > stopIntent.sequence)
        assert.equal(aborts.length, 1); assert.ok(aborts[0].reply.sequence > aborts[0].row.sequence && aborts[0].reply.sequence < row.sequence)
        if (expected.stop) {
          if (active.end) assert.ok(active.end.sequence > stopIntent.sequence)
          if (active.settled) assert.ok(active.end && active.settled.sequence > active.end.sequence && aborts[0].reply.sequence > active.settled.sequence)
          active.interrupted = true
        } else {
          assert.ok(active.end?.sequence > stopIntent.sequence && active.settled?.sequence > active.end.sequence)
          assert.equal(active.finalMessage?.detail.frame.message.stopReason, 'aborted')
          assert.ok(aborts[0].reply.sequence > active.settled.sequence)
        }
        active.closed = row; active = undefined
      }
      finalRow = row
    } else assert.fail('pi_question_event_failed_or_unreviewed')
  }
  assert.ok(ready && actualModel && catalog, 'pi_question_initialization_missing')
  if (expected.stop) assert.ok(stopObservation, 'pi_question_stop_has_no_complete_source')
  assert.deepEqual(prompts[0]?.write.detail.binding, expected.startBinding, 'pi_question_original_start_changed')
  assert.equal(piStarts(rows).length, cycles.length); assert.equal(piEnds(rows).length, cycles.filter(cycle => cycle.settled).length)
  return { custody, nativeCLI, ready, writes, prompts, cycles, messages, tools, projections, stopIntent, stopObservation, finalRow, active, text_deltas: rows.filter(isPiDelta).length }
}

function receiptValue(row, protocol, identities) {
  fields(row, ['request_id', 'method', 'state', 'receipt'])
  uuid(row.request_id); assert.equal(row.method, 'orchestration.ask'); assert.ok(['pending', 'completed'].includes(row.state))
  const original = object(row.receipt)
  if (row.state === 'pending') {
    const { stage, ...value } = original
    assert.ok(['resolving_workspace', 'waiting_for_start', 'question-ask'].includes(stage))
    assert.equal(Object.hasOwn(value, 'mutation'), false)
    return protocol.strictPiQuestionResultSchema.parse(value)
  }
  return protocol.strictPiQuestionResultSchema.parse(identities.readQuestionMutationResult(original, row.request_id))
}

function recordBinding(record, expected, view) {
  const observed = object(expected.source), binding = object(expected.startBinding)
  assert.equal(observed.availability, 'observed'); assert.equal(observed.provider, 'pi')
  assert.deepEqual(observed.selection, object(expected.selection), 'pi_question_original_selection_changed')
  assert.equal(observed.selection.executable, expected.executable)
  assert.deepEqual(observed.selection.native_launch.tools, { mode: 'questions-only', native_contract: 'pi-cli-1.0.1', extension: expected.extension, allowed: ['swa_ask'] })
  assert.equal(observed.native_session_id, expected.session); assert.equal(observed.fence, expected.fence); assert.equal(observed.runtime_epoch, expected.runtimeEpoch)
  assert.equal(binding.parent_request, expected.startRequestId); assert.equal(binding.child_request, `${expected.startRequestId}/native`)
  assert.equal(binding.session_id, expected.session); assert.equal(binding.dispatch_id, expected.dispatchId); assert.equal(binding.runtime_fence, expected.fence)
  assert.equal(binding.agent, 'pi'); assert.equal(binding.execution_mode, 'structured'); assert.deepEqual(observed.process, expected.process)
  assert.equal(record.session_id, expected.session); assert.equal(record.provider, 'pi'); assert.equal(record.model, 'stepfun/step-3.5-flash')
  assert.equal(record.account_home.variable, 'PI_CODING_AGENT_DIR'); assert.equal(record.account_home.path, expected.home)
  assert.deepEqual(record.head, observed.provider_link)
  assert.equal(record.head.mintedAtFence, expected.fence); assert.equal(record.head.origin, 'created'); assert.ok(!record.head.forkedFromKey)
  assert.equal(record.head.handle.agent, 'pi'); assert.equal(record.head.handle.transport, 'jsonl-rpc'); assert.equal(record.head.handle.nativeId, expected.sessionFile)
  const lease = object(record.lease)
  assert.equal(lease.sessionId, expected.session); assert.equal(lease.runtimeKind, 'native'); assert.equal(lease.handoffStage, null); assert.ok(!lease.unreconciled)
  assert.equal(observed.claim_status, lease.claimStatus)
  if (lease.claimStatus === 'live') {
    assert.equal(lease.runtimeFence, expected.fence); assert.equal(lease.provenHandleLinkId, record.head.linkId)
    assert.equal(lease.ownerProcess?.pid, expected.process.pid); assert.equal(lease.ownerProcess?.runtime, expected.process.runtime_id)
    assert.equal(view.finalRow, undefined, 'pi_question_live_record_requires_fresh_closed_observation')
    assert.deepEqual(observed.custody, view.custody)
  } else {
    assert.equal(lease.claimStatus, 'released'); assert.equal(lease.ownerProcess, null)
    assert.ok(lease.runtimeFence > expected.fence); assert.equal(lease.deathEvidence?.kind, 'exit-observed'); assert.equal(lease.deathEvidence?.ownerFence, expected.fence)
    assert.ok(view.finalRow); assert.deepEqual(observed.custody, view.finalRow.detail)
    assert.equal(observed.release_state, 'released')
    const final = validateLinuxFinalCustody(view.finalRow.detail, view)
    assert.equal(final.observation.fullTreeProof.forced, false); assert.deepEqual(final.observation.root, incarnation(expected.process))
    const release = object(expected.release)
    assert.equal(release.method, 'orchestration.workerRelease'); assert.equal(release.state, 'completed')
    assert.equal(release.receipt.dispatchId, expected.dispatchId); assert.ok(['released', 'already_released'].includes(release.receipt.state))
    assert.equal(release.receipt.mutation?.requestId, release.request_id)
    assert.equal(release.resource.owner_dispatch_id, expected.dispatchId); assert.equal(release.resource.origin_dispatch_id, expected.dispatchId)
    assert.equal(release.resource.release_state, 'released'); assert.equal(release.resource.ownership_state, 'released')
  }
}

/** 传入同 FD 有界原件与原 DB 精确投影；此函数不读取文件、数据库或进程。 */
export function validatePiQuestionSources({ protocol, identities, trace, native, record, expected, receipts, question = null, answer = null }) {
  for (const name of ['strictPiQuestionRawSchema', 'strictPiQuestionNativeEntrySchema', 'strictPiQuestionResultSchema', 'strictPiNativeHeaderSchema', 'strictPiOutboundSchema']) assert.equal(typeof protocol?.[name]?.parse, 'function', 'pi_question_installed_protocol_missing')
  assert.equal(typeof protocol.parseStrictPiJson, 'function')
  for (const name of ['questionRequestID', 'questionWaitID', 'readQuestionMutationResult', 'questionResumeBody']) assert.equal(typeof identities?.[name], 'function', 'pi_question_original_contract_missing')
  assert.ok(Array.isArray(native.entries) && native.entries.length < 100_000 && Array.isArray(receipts) && receipts.length <= 100_000)
  const header = protocol.strictPiNativeHeaderSchema.parse(native.header)
  assert.equal(header.cwd, expected.cwd); assert.ok(basename(expected.sessionFile).endsWith(`_${header.id}.jsonl`))
  const entries = native.entries.map(entry => protocol.strictPiQuestionNativeEntrySchema.parse(entry)), byId = new Map()
  let parent = null
  for (const entry of entries) {
    assert.ok(!byId.has(entry.id)); assert.equal(entry.parentId, parent); parent = entry.id; byId.set(entry.id, entry)
    if (entry.type === 'model_change') { assert.equal(entry.provider, 'stepfun'); assert.equal(entry.modelId, 'step-3.5-flash') }
    if (entry.type === 'message' && entry.message.role === 'assistant') {
      assert.equal(entry.message.provider, 'stepfun'); assert.equal(entry.message.model, 'step-3.5-flash'); assert.equal(entry.message.api, 'openai-completions'); assert.notEqual(entry.message.stopReason, 'pending')
    }
  }
  const view = validateTrace(trace, expected, protocol)
  assert.equal(view.ready.session_id, header.id)
  recordBinding(record, expected, view)
  const nativeMessages = entries.filter(entry => entry.type === 'message')
  assert.deepEqual(nativeMessages.map(entry => entry.message), view.messages.map(item => item.message), 'pi_question_native_trace_message_join')
  for (const row of trace) {
    const frame = frameOf(row)
    if (frame?.type === 'entry_appended') assert.deepEqual(byId.get(frame.entry.id), frame.entry, 'pi_question_appended_entry_changed')
  }
  const entryFor = row => nativeMessages[view.messages.findIndex(item => item.row === row)]
  const bound = new Map(), tools = [], reads = [], waiting = [], followup = [], unconfirmed = []
  for (const row of receipts) {
    assert.ok(!bound.has(row.request_id), 'pi_question_receipt_duplicate')
    const value = receiptValue(row, protocol, identities)
    assert.equal(value.request_id, row.request_id); assert.equal(value.schema, 'swa.native-question.v1')
    for (const key of ['project_id', 'controller', 'run_id', 'root_task_id']) assert.equal(value[key], expected.scope[key], 'pi_question_receipt_scope_changed')
    assert.equal(value.session_id, expected.session); assert.equal(value.dispatch_id, expected.dispatchId); assert.equal(value.start_request_id, expected.startRequestId)
    const origin = object(value.origin), entry = byId.get(origin.assistantEntryId)
    assert.equal(origin.nativeSessionId, header.id); assert.ok(entry?.type === 'message' && entry.message.role === 'assistant')
    const call = view.tools.get(origin.toolCallId)
    assert.ok(call && entryFor(call.assistant) === entry, 'pi_question_receipt_actual_call_missing')
    const baseId = identities.questionRequestID(expected.session, origin), waitId = identities.questionWaitID(baseId)
    assert.ok(row.request_id === baseId || row.request_id === waitId, 'pi_question_request_origin_changed')
    uuid(value.create_request_id)
    if (value.params?.question !== undefined) {
      assert.equal(value.request_id, baseId); assert.equal(value.request_id, value.create_request_id); assert.deepEqual(value.params, call.call.arguments)
    } else {
      assert.equal(typeof value.params?.resume, 'string')
      if (call.call.arguments.resume !== undefined) assert.deepEqual(value.params, call.call.arguments)
      else assert.equal(typeof call.call.arguments.question, 'string')
    }
    bound.set(row.request_id, { row, value, call, entry })
  }
  for (const item of bound.values()) {
    const { value, call } = item, created = bound.get(value.create_request_id)
    assert.ok(created && created.value.params?.question !== undefined && created.value.request_id === created.value.create_request_id, 'pi_question_original_creation_missing')
    const baseId = identities.questionRequestID(expected.session, value.origin)
    if (value.request_id === identities.questionWaitID(baseId)) {
      const base = bound.get(baseId)
      assert.ok(base && base.row.state === 'completed' && base.call === call, 'pi_question_wait_original_tool_request_missing')
      assert.equal(base.row.method, 'orchestration.ask'); assert.deepEqual(base.value.origin, value.origin)
      assert.deepEqual(base.value.params, call.call.arguments)
      assert.equal(base.value.messageId, value.messageId); assert.equal(base.value.create_request_id, value.create_request_id)
      assert.equal(base.value.request_id, baseId)
    }
    if (value.params.resume !== undefined) {
      assert.equal(created.row.state, 'completed'); assert.equal(value.params.resume, created.value.messageId)
      if (call.call.arguments.question !== undefined) {
        assert.deepEqual(value.origin, created.value.origin, 'pi_question_reconnect_origin_changed')
        assert.equal(value.request_id, identities.questionWaitID(created.value.request_id))
      }
    }
  }
  if (question) {
    assert.equal(question.run_id, expected.scope.run_id); assert.equal(question.dispatch_id, expected.dispatchId)
    const message = object(question.message)
    assert.equal(message.id, question.message_id); assert.equal(message.thread_id, question.message_id); assert.equal(message.run_id, question.run_id)
    assert.equal(message.type, 'question'); assert.equal(message.from_handle, `dispatch:${expected.dispatchId}`); assert.equal(message.to_handle, `run:${expected.scope.run_id}`)
    const creations = [...bound.values()].filter(item => item.value.messageId === question.message_id && item.value.params.question !== undefined && item.value.request_id === item.value.create_request_id)
    assert.equal(creations.length, 1, 'pi_question_unique_creation_missing'); assert.equal(creations[0].value.params.question, message.body)
    if (question.status === 'answered') {
      assert.ok(answer); assert.equal(answer.id, question.answer_message_id); assert.equal(answer.body, question.answer_body)
      assert.equal(answer.run_id, question.run_id); assert.equal(answer.thread_id, question.message_id); assert.equal(answer.type, 'status')
      assert.equal(answer.from_handle, `run:${question.run_id}`); assert.equal(answer.to_handle, `dispatch:${expected.dispatchId}`)
    } else { assert.ok(['pending', 'closed'].includes(question.status)); assert.equal(answer, null); assert.equal(question.answer_message_id, null); assert.equal(question.answer_body, null) }
  } else { assert.equal(answer, null); assert.equal(bound.size, 0); assert.equal(view.tools.size, 0) }
  for (const [id, tool] of view.tools) {
    const entry = entryFor(tool.assistant)
    const linked = [...bound.values()].filter(item => item.call === tool)
    const summary = { tool_call_id: id, assistant_entry_id: entry.id, assistant_sequence: tool.assistant.sequence,
      started_sequence: tool.start?.sequence ?? null, request_ids: linked.map(item => item.row.request_id), result_entry_id: tool.result ? entryFor(tool.result).id : null,
      result_sequence: tool.result?.sequence ?? null, cycle_start_sequence: tool.cycle.start.sequence, cycle_idle_sequence: tool.cycle.idle?.sequence ?? null }
    tools.push(summary)
    if (!tool.result) {
      if (tool.cycle.interrupted) unconfirmed.push({ ...summary, reason: 'stopped_before_native_tool_result' })
      continue
    }
    const actual = tool.result.detail.frame.message
    if (actual.isError) { unconfirmed.push({ ...summary, reason: 'native_tool_error' }); continue }
    const details = protocol.strictPiQuestionResultSchema.parse(actual.details), stored = bound.get(details.request_id)
    if (details.state === 'unknown') { unconfirmed.push({ ...summary, request_id: details.request_id, reason: 'native_tool_outcome_unknown' }); continue }
    assert.ok(stored && stored.call === tool && stored.row.state === 'completed', 'pi_question_completed_tool_receipt_missing')
    assert.deepEqual(details, stored.value, 'pi_question_tool_receipt_changed')
    const textResult = protocol.parseStrictPiJson(actual.content.map(item => item.text).join(''))
    assert.deepEqual(textResult, details, 'pi_question_model_result_changed')
    if (details.state === 'rejected') { assert.equal(details.effects_applied, false); unconfirmed.push({ ...summary, request_id: details.request_id, reason: 'native_question_rejected' }); continue }
    assert.ok(question); assert.equal(details.question_id, question.message_id); assert.equal(details.messageId, question.message_id); assert.equal(details.threadId, question.message_id)
    const result = { ...summary, request_id: details.request_id, create_request_id: details.create_request_id, question_id: question.message_id,
      timed_out: details.timedOut === true, cancelled: details.cancelled === true, connection_lost: details.connectionLost === true, timeout_ms: details.timeoutMs }
    if (details.state === 'answered') {
      assert.equal(question.status, 'answered'); assert.equal(details.answerMessageId, answer.id); assert.equal(details.answer, answer.body)
      assert.equal(result.timed_out || result.cancelled || result.connection_lost, false)
      const read = { ...result, answer_message_id: answer.id }; reads.push(read)
      const cycle = tool.cycle, final = cycle.finalMessage
      if (final && final.sequence > tool.result.sequence && final.detail.frame.message.stopReason === 'stop' && final.detail.frame.message.content.every(block => block.type !== 'toolCall') && cycle.turnEnd?.sequence > final.sequence && cycle.end?.sequence > cycle.turnEnd.sequence && cycle.settled?.sequence > cycle.end.sequence && cycle.idle?.sequence > cycle.settled.sequence) {
        followup.push({ request_id: details.request_id, question_id: question.message_id, tool_call_id: id, answer_message_id: answer.id,
          assistant_entry_id: entryFor(final).id, assistant_sequence: final.sequence, turn_end_sequence: cycle.turnEnd.sequence, agent_end_sequence: cycle.end.sequence,
          settled_sequence: cycle.settled.sequence, idle_sequence: cycle.idle.sequence, complete: true })
      }
    } else if (result.timed_out || result.cancelled || result.connection_lost) { assert.equal(details.answer, null); waiting.push(result) }
    else unconfirmed.push({ ...summary, request_id: details.request_id, reason: 'native_wait_has_no_terminal_answer' })
  }
  return { view, header, tools, reads, waiting, followup, unconfirmed, record_state: record.lease.claimStatus }
}
