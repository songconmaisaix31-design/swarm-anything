import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
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
export { getPendingWorkerStartRecovery } from './source/third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-receipt'

const need: (value: unknown) => asserts value = value => { if (!value) throw new Error('pi_observer_unavailable') }
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
function protocol(questions = false) {
  // 唯一消费者是本进程实际装内的纯入口；不编译另一份 parser，不解析未部署开发依赖。
  const path = join(dirname(process.execPath), '..', 'runtime', 'pi-protocol.cjs')
  const value: typeof import('./source/third_party/orca-v1.4.230/src/main/pi/rpc-protocol') = createRequire(process.execPath)(path)
  need(typeof value.parseStrictPiJson === 'function' && typeof value.strictPiRawSchema?.safeParse === 'function' && typeof value.strictPiOutboundSchema?.safeParse === 'function' && typeof value.strictPiNativeHeaderSchema?.safeParse === 'function' && typeof value.strictPiNativeEntrySchema?.safeParse === 'function')
  if (questions) need(typeof value.strictPiQuestionRawSchema?.safeParse === 'function' && typeof value.strictPiQuestionNativeEntrySchema?.safeParse === 'function' && typeof value.strictPiQuestionResultSchema?.safeParse === 'function')
  return value
}
// 同一成熟 decoder 的纯投影也供驱动最终无 await 段消费，不另写 stored-form 解码。
export function decodePiRecord(parsed: unknown) {
  need(isPersistedAgentSessionRecord(parsed))
  const record = decodePersistedAgentSessionRecord(parsed).record
  const head = agentSessionProviderHandleChainHead(record.providerHandleChain)
  need(record.provider === 'pi' && head?.handle.agent === 'pi' && head.handle.transport === 'jsonl-rpc')
  need('variable' in record.accountHome && record.accountHome.variable === 'PI_CODING_AGENT_DIR')
  const owner = record.lease.ownerProcess, death = record.lease.deathEvidence
  return {
    schema_version: record.schemaVersion, session_id: record.sessionId, provider: record.provider,
    model: record.options?.model ?? null, head,
    account_home: { variable: record.accountHome.variable, path: record.accountHome.path },
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
export function matchesPiJournalItem(itemId: string, sessionId: string, providerItem: string) {
  const actual = parseAgentJournalItemKey(itemId)
  return actual?.provider === 'legacy' && actual.agent === 'pi' && actual.sessionId === sessionId && spelledProviderTimelineItemKey(actual.recordId) === providerTimelineKeyPart(providerItem)
}
export function fingerprintPiBody(sessionId: string, value: unknown) {
  need(value && typeof value === 'object' && !Array.isArray(value))
  const { from: _sender, ...payload } = value as Record<string, unknown>
  return agentSessionSendBodyFingerprint(sessionId, SendBodyStructure.parse(payload))
}
export function validatePiSource(mode: 'validate-pi-trace' | 'validate-pi-native' | 'validate-pi-question-trace' | 'validate-pi-question-native', bytes: Buffer) {
  need(['validate-pi-trace', 'validate-pi-native', 'validate-pi-question-trace', 'validate-pi-question-native'].includes(mode))
  need(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 12 * 1024 * 1024 && bytes.at(-1) === 10)
  const questions = mode === 'validate-pi-question-trace' || mode === 'validate-pi-question-native'
  const native = mode === 'validate-pi-native' || mode === 'validate-pi-question-native'
  const api = protocol(questions)
  const rawSchema = questions ? api.strictPiQuestionRawSchema : api.strictPiRawSchema
  const entrySchema = questions ? api.strictPiQuestionNativeEntrySchema : api.strictPiNativeEntrySchema
  let count = 0
  let header: ReturnType<typeof api.strictPiNativeHeaderSchema.parse> | undefined
  const framer = createIncrementalNdjsonFramer((record, line) => {
    need(++count <= 100_000)
    const parsed: unknown = api.parseStrictPiJson(line)
    need(isDeepStrictEqual(parsed, record))
    if (native) {
      if (count === 1) header = api.strictPiNativeHeaderSchema.parse(parsed)
      else entrySchema.parse(parsed)
      return
    }
    need(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed))
    const row = parsed as Record<string, unknown>
    need(row.protocol === 'pi-jsonl-rpc' && row.projection === 'actual_native_rpc_frames')
    need(row.detail !== null && typeof row.detail === 'object' && !Array.isArray(row.detail))
    const detail = row.detail as Record<string, unknown>
    if (row.event === 'native_record') {
      need(typeof detail.raw_line === 'string')
      const actual = api.parseStrictPiJson(detail.raw_line)
      need(isDeepStrictEqual(actual, detail.frame))
      rawSchema.parse(actual)
    } else if (row.event === 'write_intent') api.strictPiOutboundSchema.parse(detail.frame)
  }, () => { throw new Error('pi_observer_invalid_jsonl') }, { maxLineBytes: 8 * 1024 * 1024 })
  framer.feed(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  need(!framer.takeTail() && count > 0)
  return { record_count: count, ...(header ? { header } : {}) }
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
  if (mode === 'runtime-custodian') {
    const parsed: unknown = protocol().parseStrictPiJson(new TextDecoder('utf-8', { fatal: true }).decode(await readInput(16 * 1024)))
    process.stdout.write(JSON.stringify(observeRuntimeCustodian(parsed)) + '\n')
    return
  }
  if (mode === 'decode-pi-record') {
    const parsed: unknown = protocol().parseStrictPiJson(new TextDecoder('utf-8', { fatal: true }).decode(await readInput(1024 * 1024)))
    process.stdout.write(JSON.stringify(decodePiRecord(parsed)) + '\n')
    return
  }
  need(mode === 'validate-pi-trace' || mode === 'validate-pi-native' || mode === 'validate-pi-question-trace' || mode === 'validate-pi-question-native')
  process.stdout.write(JSON.stringify(validatePiSource(mode, await readInput(12 * 1024 * 1024))) + '\n')
}

if (require.main === module) void main().catch(() => {
  // 不输出原文、账户路径、Zod issues 或原始异常。
  process.stderr.write('pi_source_observer_unavailable\n')
  process.exitCode = 1
})
