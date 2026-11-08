import { isPersistedAgentSessionRecord } from './source/third_party/orca-v1.4.230/src/shared/agent-session-record'
import { decodePersistedAgentSessionRecord } from './source/third_party/orca-v1.4.230/src/shared/agent-session-record-stored-form'
import { agentSessionProviderHandleChainHead } from './source/third_party/orca-v1.4.230/src/shared/agent-session-provider-handle'
import { realpathSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { isSwaLinuxProcessAbsent, readSwaLinuxProcess, readSwaLinuxProcessIncarnation, requireSwaLinuxAncestor, requireSwaLinuxIncarnation, swaLinuxProcessIncarnationSchema } from './source/third_party/orca-v1.4.230/src/main/daemon/swa-linux-process-identity'

const need: (value: unknown) => asserts value = value => { if (!value) throw new Error('source_observer_unavailable') }
export function observeRuntimeCustodian(parsed: unknown) {
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

// 观察入口只调用安装版本的成熟 decoder 和明确 PID 的只读内核观察。
async function main() {
  const [mode, pidText] = process.argv.slice(2)
  if (mode === 'incarnation') {
    if (!/^[1-9][0-9]*$/.test(pidText ?? '')) throw new Error('observer_invalid_pid')
    const pid = Number(pidText)
    if (!Number.isSafeInteger(pid)) throw new Error('observer_invalid_pid')
    const value = isSwaLinuxProcessAbsent(pid) ? { absent: true, pid } : { absent: false, incarnation: readSwaLinuxProcessIncarnation(pid) }
    process.stdout.write(JSON.stringify(value) + '\n')
    return
  }
  if (!['decode-record', 'runtime-custodian'].includes(mode ?? '') || pidText !== undefined) throw new Error('observer_invalid_mode')
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    if (!(chunk instanceof Uint8Array)) throw new Error('observer_input_not_bytes')
    size += chunk.length
    if (size > 1024 * 1024) throw new Error('observer_input_exceeds_bound')
    chunks.push(Buffer.from(chunk))
  }
  const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
  if (mode === 'runtime-custodian') {
    process.stdout.write(JSON.stringify(observeRuntimeCustodian(parsed)) + '\n')
    return
  }
  if (!isPersistedAgentSessionRecord(parsed)) throw new Error('observer_record_unreadable')
  const record = decodePersistedAgentSessionRecord(parsed).record
  const head = agentSessionProviderHandleChainHead(record.providerHandleChain)
  const owner = record.lease.ownerProcess
  const death = record.lease.deathEvidence
  const projection = {
    schema_version: record.schemaVersion,
    session_id: record.sessionId,
    provider: record.provider,
    model: record.options?.model ?? null,
    head,
    lease: {
      sessionId: record.lease.sessionId,
      runtimeKind: record.lease.runtimeKind,
      claimStatus: record.lease.claimStatus,
      runtimeFence: record.lease.runtimeFence,
      handoffStage: record.lease.handoffStage,
      provenHandleLinkId: record.lease.provenHandleLinkId,
      unreconciled: record.lease.unreconciled,
      ownerProcess: owner ? { pid: owner.pid, processStartTimeMs: owner.processStartTimeMs, runtime: owner.runtime ?? null } : null,
      deathEvidence: death ? { kind: death.kind, observedAt: death.observedAt, ownerFence: death.ownerFence ?? null } : null,
    },
  }
  process.stdout.write(JSON.stringify(projection) + '\n')
}

if (require.main === module) void main().catch(() => {
  // 原始 record、账户目录和原生错误不进入观察日志。
  process.stderr.write('source_observer_unavailable\n')
  process.exitCode = 1
})
