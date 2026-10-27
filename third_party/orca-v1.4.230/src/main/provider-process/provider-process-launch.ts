import type { SwaProviderProcessTree } from './swa-provider-process-tree'
import type { SpawnOptions as ClaudeSdkSpawnOptions } from '@anthropic-ai/claude-agent-sdk'
import type { PiRpcState } from '../pi/rpc-protocol'
import type { JsonlRpcRecord } from '../jsonl-rpc/peer'
import type { ProviderWriteAdmission } from './provider-stdio-write-queue'
import type { ProviderTimelineEvent } from '../native-chat/agent-session-timeline/provider-timeline-event'
import type { ProviderTimelinePublishedReport } from '../native-chat/agent-session-wire/structured-agent-session-transition'

export type SwaInitializationProcess = {
  close(): Promise<boolean>
  onExit(listener: () => void): void
  readonly exited: boolean
  stderrTail(): string
}

export type SwaOpenCodeToolsPolicy = {
  nativeContract: 'opencode-cli-2.0.31'
  model: 'deepseek/deepseek-v4-pro' | 'stepfun/step-3.5-flash'
  initialize(track: (resource: SwaInitializationProcess) => void, cwd: string): Promise<void>
  attach(tree: SwaProviderProcessTree): void
  stderr(line: string, cut: boolean): boolean
  ready(): Promise<void>
  verifySession(sessionId: string): Promise<void>
  preparePrompt(clientMessageId: string, prompt: unknown, beforeSend?: () => void): Promise<import('../acp/acp-response-settlement').AcpRequestWriteOptions>
  inputDisposition(clientMessageId: string): { state: 'accepted'; providerIdentity: import('../../shared/agent-session-journal-types').AgentJournalItemIdentity } | { state: 'unknown' | 'rejected' }
  record(frame: unknown, line: string): void
  protocolFailed(): void
  stdoutEnded(): void
  closed(): void
  trace(event: string, detail: unknown): void
}
export type CodexPolicyConnection = {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>
}
export type SwaCodexToolsPolicy = {
  nativeContract: 'codex-cli-0.163.0'
  model: 'gpt-5.5'
  appServerArgs: readonly string[]
  initialize(track: (resource: SwaInitializationProcess) => void, cwd: string): Promise<void>
  attach(tree: SwaProviderProcessTree): void
  ready(connection: CodexPolicyConnection): Promise<void>
  verifyCurrent(connection: CodexPolicyConnection): Promise<void>
  assertCurrent(): void
  record(parsed: Record<string, unknown>, line: string, responseMethod?: string): 'steer-not-submitted' | 'remote-control-disabled' | void
  closed(): void
}
export type ClaudePolicyConnection = {
  initializationResult(): Promise<unknown>
  getSettings(): Promise<unknown>
  getHooksListing(): Promise<unknown>
  mcpServerStatus(): Promise<unknown>
}
export type ClaudeDispatchObservation =
  | { phase: 'handoff'; clientMessageId: string; sentUuid: string; providerSessionId: string }
  | { phase: 'user-replay'; clientMessageId: string; sentUuid: string; providerSessionId: string; providerInputUuid: string }
export type SwaClaudeToolsPolicy = {
  nativeContract: 'claude-cli-2.1.284-sdk-0.3.284'
  model: 'claude-opus-5'
  launcher: SwaProviderJobLauncher
  initialize(cwd: string): Promise<() => void>
  resolveTranscript(nativeId: string): Promise<string | null>
  assertSpawn(options: ClaudeSdkSpawnOptions): void
  attach(tree: SwaProviderProcessTree): void
  ready(connection: ClaudePolicyConnection): Promise<void>
  verifyCurrent(connection: ClaudePolicyConnection): Promise<void>
  assertCurrent(): void
  record(message: Record<string, unknown>): void
  reject(reason: 'tool_request' | 'user_dialog' | 'elicitation' | 'resume_persistence_failed' | 'non_object_sdk_message' | 'control_request'): never
  recordDispatch(observed: ClaudeDispatchObservation): void
  closed(): void
}

export type PiRawContext = { sequence: number }
export type PiWriteContext = { frame: JsonlRpcRecord; line: string; clientMessageId?: string }
export type PiLocalFailure = {
  stage: 'source' | 'approval' | 'settings' | 'write' | 'protocol' | 'stdout' | 'custody' | 'persistence'
  code: 'source_changed' | 'approval_changed' | 'settings_unverifiable' | 'write_unsettled' | 'protocol_unverifiable' | 'stdout_incomplete' | 'custody_unverifiable' | 'trace_unavailable'
  writeAttempted?: boolean
}
export type PiPolicyRequestOptions = {
  timeoutMs?: number | null
  id?: string
  beforeWrite?: ProviderWriteAdmission
  onReply?: (frame: JsonlRpcRecord, context: PiRawContext) => void
}
export type PiPolicyConnection = {
  request(command: string, params?: Record<string, unknown>, options?: PiPolicyRequestOptions): Promise<unknown>
}
export type PiObservedProjection = {
  sourceSequence: number
  eventType: ProviderTimelineEvent['type']
  clientMessageId?: string
  acquisitionGeneration: string
  providerItem?: string
  report: ProviderTimelinePublishedReport
}
export type SwaPiSessionPolicy = {
  nativeContract: 'pi-cli-1.0.1'
  attach(tree: SwaProviderProcessTree): void
  assertSpawn(launch: ProviderProcessLaunch): void
  hasRecordedOwner(): boolean
  ready(connection: PiPolicyConnection, context: { acquisitionGeneration: string }): Promise<PiRpcState>
  verifyCurrent(connection: PiPolicyConnection): Promise<PiRpcState>
  assertCurrent(): void
  prepareInput(clientMessageId: string, frame: JsonlRpcRecord): Promise<() => void>
  beforeWrite(context: PiWriteContext): () => void
  rawRecord(frame: unknown, line: string, response?: { id: string; command: string }): PiRawContext
  writeSettled(context: PiWriteContext, outcome: 'resolved' | 'rejected', phase: { writeAttempted: boolean; cleanupCompleted: boolean }): void
  beginStop(input: { turnId: string | null }): void
  projectionPublished(observed: PiObservedProjection): void
  failure(reason: PiLocalFailure): void
  closed(): void
}

export type ProviderProcessLaunch = {
  command: string
  args: string[]
  /** Workspace directory used by the provider process itself. */
  cwd?: string
  /** Overlay on the inherited environment. */
  env?: Record<string, string>
  /** Keys stripped after the overlay. */
  envToDelete?: readonly string[]
  /** SWA子进程在真实父Job分配后通过Node IPC获得启动许可。 */
  swaJobIPC?: true
  swaEventDirectory?: string
  swaOpenCodePolicy?: SwaOpenCodeToolsPolicy
  swaCodexPolicy?: SwaCodexToolsPolicy
  swaPiPolicy?: SwaPiSessionPolicy
}

export type SwaProviderJobLauncher = { node: string; entry: string; eventDirectory: string }

/** The one env rule for provider children: inherit, overlay, then strip (so a delete beats an overlay). */
export function resolveProviderChildEnv(
  launch: Pick<ProviderProcessLaunch, 'env' | 'envToDelete'>,
  baseEnv: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = { ...baseEnv, ...launch.env }
  for (const key of launch.envToDelete ?? []) {
    delete childEnv[key]
  }
  return childEnv
}
