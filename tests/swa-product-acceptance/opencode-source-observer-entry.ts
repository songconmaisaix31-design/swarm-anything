import { realpathSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { isPersistedAgentSessionRecord } from './source/third_party/orca-v1.4.230/src/shared/agent-session-record'
import { decodePersistedAgentSessionRecord } from './source/third_party/orca-v1.4.230/src/shared/agent-session-record-stored-form'
import { agentSessionProviderHandleChainHead } from './source/third_party/orca-v1.4.230/src/shared/agent-session-provider-handle'
import { createIncrementalNdjsonFramer } from './source/third_party/orca-v1.4.230/src/shared/main-process-ndjson-framer'
import { parseAgentJournalItemKey } from './source/third_party/orca-v1.4.230/src/shared/agent-session-journal-item-key'
import { providerTimelineKeyPart, spelledProviderTimelineItemKey } from './source/third_party/orca-v1.4.230/src/main/native-chat/agent-session-timeline/provider-timeline-identity'
import { agentSessionSendBodyFingerprint } from './source/third_party/orca-v1.4.230/src/shared/structured-agent-session-send-mutation'
import { SendBodyStructure } from './source/third_party/orca-v1.4.230/src/shared/rpc-contract/structured-agent-session-message-params'
import { isSwaLinuxProcessAbsent, readSwaLinuxProcess, readSwaLinuxProcessIncarnation, requireSwaLinuxAncestor, requireSwaLinuxIncarnation, swaLinuxProcessIncarnationSchema } from './source/third_party/orca-v1.4.230/src/main/daemon/swa-linux-process-identity'
import { acpRpcEnvelopeSchema } from './source/third_party/orca-v1.4.230/src/main/acp/acp-rpc-envelope'
import { SessionNotificationSchema } from './source/third_party/orca-v1.4.230/src/main/acp/generated/acp-protocol.generated'
export { getPendingWorkerStartRecovery } from './source/third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-receipt'

const need: (value: unknown) => asserts value = value => { if (!value) throw new Error('opencode_observer_unavailable') }
async function readInput(maximum: number) {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    need(chunk instanceof Uint8Array)
    size += chunk.byteLength
    need(size <= maximum)
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

// 只投影原 decoder 的非秘密身份；不读取账号文件或数据库。
export function decodeOpenCodeRecord(parsed: unknown) {
  need(isPersistedAgentSessionRecord(parsed))
  const record = decodePersistedAgentSessionRecord(parsed).record
  const head = agentSessionProviderHandleChainHead(record.providerHandleChain)
  need(record.provider === 'opencode' && head?.handle.agent === 'opencode' && head.handle.transport === 'acp')
  need('kind' in record.accountHome && record.accountHome.kind === 'opencode' && record.accountHome.locator.kind === 'private')
  const owner = record.lease.ownerProcess, death = record.lease.deathEvidence
  return {
    schema_version: record.schemaVersion, session_id: record.sessionId, provider: record.provider,
    model: record.options?.model ?? null, head,
    account_home: { kind: 'opencode', locator: { kind: 'private', root: record.accountHome.locator.root } },
    lease: {
      sessionId: record.lease.sessionId, runtimeKind: record.lease.runtimeKind, claimStatus: record.lease.claimStatus,
      runtimeFence: record.lease.runtimeFence, handoffStage: record.lease.handoffStage, provenHandleLinkId: record.lease.provenHandleLinkId,
      unreconciled: record.lease.unreconciled,
      ownerProcess: owner ? { pid: owner.pid, processStartTimeMs: owner.processStartTimeMs, runtime: owner.runtime ?? null } : null,
      deathEvidence: death ? { kind: death.kind, observedAt: death.observedAt, ownerFence: death.ownerFence ?? null } : null,
    },
  }
}
export function observeIncarnation(pid: number) {
  need(process.platform === 'linux')
  need(Number.isSafeInteger(pid) && pid > 0)
  return isSwaLinuxProcessAbsent(pid) ? { absent: true, pid } : { absent: false, incarnation: readSwaLinuxProcessIncarnation(pid) }
}
export function observeRuntimeCustodian(parsed: unknown) {
  need(process.platform === 'linux')
  need(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed))
  const value = parsed as Record<string, unknown>
  need(isDeepStrictEqual(Object.keys(value).sort(), ['daemon', 'node_executable', 'runtime_pid', 'serve', 'serve_executable']))
  need(typeof value.runtime_pid === 'number' && Number.isSafeInteger(value.runtime_pid) && value.runtime_pid > 0)
  need(typeof value.node_executable === 'string' && typeof value.serve_executable === 'string')
  const expectedServe = swaLinuxProcessIncarnationSchema.parse(value.serve), expectedDaemon = swaLinuxProcessIncarnationSchema.parse(value.daemon)
  need(new Set([value.runtime_pid, expectedServe.pid, expectedDaemon.pid]).size === 3)
  requireSwaLinuxIncarnation(expectedServe); requireSwaLinuxIncarnation(expectedDaemon)
  const runtime = readSwaLinuxProcess(value.runtime_pid), serve = readSwaLinuxProcess(expectedServe.pid), daemon = readSwaLinuxProcess(expectedDaemon.pid)
  const executables = () => {
    need(realpathSync(`/proc/${runtime.pid}/exe`) === value.node_executable)
    need(realpathSync(`/proc/${daemon.pid}/exe`) === value.node_executable)
    need(realpathSync(`/proc/${serve.pid}/exe`) === value.serve_executable)
  }
  executables()
  requireSwaLinuxAncestor(daemon, runtime); requireSwaLinuxAncestor(runtime, serve)
  const { name: _name, ...incarnation } = runtime
  requireSwaLinuxIncarnation(expectedServe); requireSwaLinuxIncarnation(expectedDaemon); requireSwaLinuxIncarnation(incarnation)
  executables()
  return incarnation
}
export function matchesOpenCodeJournalItem(itemId: string, sessionId: string, providerItem: string) {
  const actual = parseAgentJournalItemKey(itemId)
  return actual?.provider === 'legacy' && actual.agent === 'opencode' && actual.sessionId === sessionId && spelledProviderTimelineItemKey(actual.recordId) === providerTimelineKeyPart(providerItem)
}
export function fingerprintOpenCodeBody(sessionId: string, value: unknown) {
  need(value && typeof value === 'object' && !Array.isArray(value))
  const { from: _sender, ...payload } = value as Record<string, unknown>
  return agentSessionSendBodyFingerprint(sessionId, SendBodyStructure.parse(payload))
}
export function validateOpenCodeTrace(bytes: Buffer) {
  need(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 12 * 1024 * 1024 && bytes.at(-1) === 10)
  let count = 0
  const framer = createIncrementalNdjsonFramer((record, line) => {
    need(++count <= 100_000)
    const parsed: unknown = JSON.parse(line)
    need(isDeepStrictEqual(parsed, record) && parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed))
    const row = parsed as Record<string, unknown>
    need(row.protocol === 'acp' && row.projection === 'actual_native_acp_frames_and_input_bindings')
    need(row.detail !== null && typeof row.detail === 'object' && !Array.isArray(row.detail))
    if (row.event !== 'native_record') return
    const detail = row.detail as Record<string, unknown>
    need(typeof detail.raw_line === 'string')
    const raw: unknown = JSON.parse(detail.raw_line)
    need(isDeepStrictEqual(raw, detail.frame))
    const frame = acpRpcEnvelopeSchema.parse(raw)
    if (frame.method === 'session/update') SessionNotificationSchema.parse(frame.params)
  }, () => { throw new Error('opencode_observer_invalid_jsonl') }, { maxLineBytes: 8 * 1024 * 1024 })
  framer.feed(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  need(!framer.takeTail() && count > 0)
  return { record_count: count }
}
async function main() {
  const [mode, pidText, extra] = process.argv.slice(2)
  need(extra === undefined)
  if (mode === 'incarnation') {
    need(/^[1-9][0-9]*$/.test(pidText ?? ''))
    const pid = Number(pidText)
    need(Number.isSafeInteger(pid))
    process.stdout.write(JSON.stringify(observeIncarnation(pid)) + '\n')
    return
  }
  need(pidText === undefined)
  if (mode === 'runtime-custodian' || mode === 'decode-opencode-record') {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readInput(mode === 'runtime-custodian' ? 16 * 1024 : 1024 * 1024)))
    process.stdout.write(JSON.stringify(mode === 'runtime-custodian' ? observeRuntimeCustodian(parsed) : decodeOpenCodeRecord(parsed)) + '\n')
    return
  }
  need(mode === 'validate-opencode-trace')
  process.stdout.write(JSON.stringify(validateOpenCodeTrace(await readInput(12 * 1024 * 1024))))
  process.stdout.write('\n')
}

if (require.main === module) void main().catch(() => {
  // 不输出原文、账号目录、schema issues 或原始异常。
  process.stderr.write('opencode_source_observer_unavailable\n')
  process.exitCode = 1
})
