import { randomUUID } from 'node:crypto'
import type { CliStatusResult, RuntimeStatus } from '../../shared/runtime-types'
import { runtimeHostConnectionState } from '../../shared/runtime-host-connection-state'
import type { RuntimeOrchestrationEnvelope } from '../../shared/runtime-rpc-envelope'
import {
  isDurableMutation,
  isOrchestrationMutation,
  isTerminalPromptMutation,
  orchestrationMigrationData
} from '../../shared/orchestration-rpc-contract'
import type { PairedRuntimeConnection } from '../../shared/paired-runtime-connection'
import { launchOrcaApp } from './launch'
import { getDefaultUserDataPath, readMetadata } from './metadata'
import { getCliStatus, projectRemoteAppStatus } from './status'
import { sendRequest } from './transport'
import { RuntimeClientError, RuntimeRpcFailureError, type RuntimeRpcSuccess } from './types'
import {
  attachDurableMutationRecovery,
  attachLegacyTerminalPromptRecovery,
  attachUnverifiedTerminalPromptRecovery,
  didAnotherRuntimeHandleTerminalPrompt
} from './terminal-prompt-mutation-recovery'
import { markEnvironmentUsed } from './environments'
import { createRuntimeSourceFence, type RuntimeSourceFence } from './runtime-source-fence'
import { readRuntimeSourceStamp, type RuntimeSourceStamp } from '../../shared/runtime-source-env'
import { isSameUserDataPath } from '../../shared/serve-user-data-path'
import { resolveRemoteConnection } from './runtime-remote-pairing'
import {
  ORCHESTRATION_CONTRACT_RUNTIME_CAPABILITY,
  ORCHESTRATION_CONTRACT_VERSION
} from '../../shared/protocol-version'
import { RemoteRuntimeCompatGate } from './remote-runtime-compat-gate'
import { createOrchestrationCompatibilityEnvelope } from './orchestration-compatibility-envelope'
import { getTimeoutMsParam, isWaitingCheck } from './runtime-request-timeout'
import {
  isWorkerStartTimeoutWithinTimerLimit,
  resolveWorkerStartClientTimeoutMs,
  resolveWorkerStartReadinessTimeoutMs
} from '../../shared/orchestration-timing-budgets'
import { MAX_TIMER_DELAY_MS } from '../../shared/timer-delay'
import {
  buildOrchestrationRecoveryCommand,
  resolveOrchestrationCliExecutable
} from './orchestration-recovery-command'

const LONG_POLL_CLIENT_GRACE_MS = 10_000

const loadWebSocketTransport = async () => await import('./websocket-transport.js')

export class RuntimeClient {
  readonly userDataPath: string
  private readonly requestTimeoutMs: number
  private readonly remote: PairedRuntimeConnection | null
  readonly environmentSelector: string | null
  private readonly cliExecutable: string
  private readonly originalArgs: readonly string[] | undefined
  private readonly remoteCompat: RemoteRuntimeCompatGate
  private orchestrationContractCheck: Promise<void> | null = null
  private readonly orchestrationCompatibility = createOrchestrationCompatibilityEnvelope(
    process.env
  )
  private readonly runtimeSourceFence: RuntimeSourceFence
  private readonly swaOwnerCapability = process.env.SWA_OWNER_CAPABILITY || undefined
  private readonly swaQuestionProducerProof: string | undefined
  private readonly swaQuestionSource: RuntimeSourceStamp | null

  // Why: browser commands trigger first-time session init (agent-browser connect +
  // CDP proxy setup) which can take 15-30s. 60s accommodates cold start without
  // being so large that genuine hangs go unnoticed.
  constructor(
    userDataPath = getDefaultUserDataPath(),
    requestTimeoutMs = 60_000,
    remotePairingCode = process.env.ORCA_PAIRING_CODE ?? process.env.ORCA_REMOTE_PAIRING ?? null,
    environmentSelector = process.env.ORCA_ENVIRONMENT ?? null,
    cliExecutable = resolveOrchestrationCliExecutable(),
    originalArgs?: readonly string[],
    questionProducer?: { proof: string }
  ) {
    this.userDataPath = userDataPath
    this.requestTimeoutMs = requestTimeoutMs
    this.environmentSelector = environmentSelector
    this.cliExecutable = cliExecutable
    this.originalArgs = originalArgs ? [...originalArgs] : undefined
    this.swaQuestionProducerProof = questionProducer?.proof
    this.swaQuestionSource = questionProducer ? readRuntimeSourceStamp(process.env) : null
    if (questionProducer && (remotePairingCode || environmentSelector || this.swaOwnerCapability || !questionProducer.proof)) throw new RuntimeClientError('scope_denied', 'The question producer requires its isolated local runtime.')
    if (questionProducer && (!this.swaQuestionSource?.profilePath || !isSameUserDataPath(userDataPath, this.swaQuestionSource.profilePath))) throw new RuntimeClientError('runtime_source_unverifiable', 'The question producer requires its exact launching runtime profile.')
    this.remote = resolveRemoteConnection(userDataPath, remotePairingCode, environmentSelector)
    this.remoteCompat = new RemoteRuntimeCompatGate(userDataPath, environmentSelector)
    this.runtimeSourceFence = createRuntimeSourceFence(process.env, userDataPath, requestTimeoutMs)
  }

  get isRemote(): boolean {
    return this.remote !== null
  }

  async call<TResult>(
    method: string,
    params?: unknown,
    options?: {
      timeoutMs?: number
      signal?: AbortSignal
      legacyTerminalPrompt?: true
      terminalPromptPreflight?: { runtimeId: string | null }
    } & RuntimeOrchestrationEnvelope
  ): Promise<RuntimeRpcSuccess<TResult>> {
    if (this.remote && this.swaOwnerCapability) throw new RuntimeClientError('scope_denied', 'The private product owner capability cannot be sent to a remote runtime')
    if (options?.signal?.aborted) throw new RuntimeClientError('operation_cancelled', 'The local runtime request was cancelled before sending.')
    if (options?.signal && this.remote) throw new RuntimeClientError('scope_denied', 'Cancellation is only supported by the local runtime transport.')
    if (this.swaQuestionProducerProof && !['status.get', 'orchestration.ask', 'orchestration.requestShow', 'swa.delegate', 'swa.projectToolAuthorize'].includes(method)) throw new RuntimeClientError('scope_denied', 'The native tool producer cannot call this runtime method.')
    const effectiveTimeoutMs = options?.timeoutMs ?? this.resolveMethodTimeoutMs(method, params)
    const orchestrationMutation = isOrchestrationMutation(method, params)
    const terminalPromptMutation = isTerminalPromptMutation(method, params)
    const legacyTerminalPrompt = options?.legacyTerminalPrompt === true && terminalPromptMutation
    const durableMutation = !legacyTerminalPrompt && isDurableMutation(method, params)
    const carriesCompatibility = method.startsWith('orchestration.') || method === 'swa.workerSend' || method === 'swa.delegate' || method === 'swa.projectToolAuthorize' || method === 'status.get' && (process.env.SWA_CONTROLLER_HELPER === '1' || !!this.swaQuestionProducerProof)
    if (orchestrationMutation || method === 'swa.workerSend' || method === 'swa.delegate' || method === 'swa.projectToolAuthorize') {
      await this.ensureOrchestrationContractCompatible(effectiveTimeoutMs, options?.signal)
    }
    const orchestrationRequestId = durableMutation
      ? (options?.orchestrationRequestId ?? randomUUID())
      : undefined
    const originalCommand = durableMutation
      ? buildOrchestrationRecoveryCommand(method, params, this.cliExecutable, this.originalArgs)
      : undefined
    const recover = (error: unknown, targetRuntimeId: string | null) => {
      if (legacyTerminalPrompt) {
        return attachLegacyTerminalPromptRecovery(error)
      }
      if (
        terminalPromptMutation &&
        options?.terminalPromptPreflight &&
        didAnotherRuntimeHandleTerminalPrompt(
          error,
          options.terminalPromptPreflight.runtimeId,
          targetRuntimeId
        )
      ) {
        return attachUnverifiedTerminalPromptRecovery(error)
      }
      return attachDurableMutationRecovery(error, orchestrationRequestId, originalCommand, method)
    }
    const compatibilityEnvelope = carriesCompatibility
      ? {
          ...this.orchestrationCompatibility,
          compatibilityInvocationId:
            orchestrationRequestId ?? this.orchestrationCompatibility.compatibilityInvocationId
        }
      : {}
    const envelope = {
      swaOwnerCapability: this.swaOwnerCapability,
      swaQuestionProducerProof: this.swaQuestionProducerProof,
      swaQuestionOrigin: this.swaQuestionProducerProof ? options?.swaQuestionOrigin : undefined,
      swaProjectToolOrigin: this.swaQuestionProducerProof ? options?.swaProjectToolOrigin : undefined,
      orchestrationCapability: options?.orchestrationCapability,
      orchestrationContractVersion: carriesCompatibility
        ? ORCHESTRATION_CONTRACT_VERSION
        : undefined,
      orchestrationRequestId,
      ...compatibilityEnvelope
    }
    if (this.remote) {
      const transport = await loadWebSocketTransport()
      let response
      try {
        response = await this.remoteCompat.send<TResult>({
          transport,
          connection: this.remote,
          method,
          params,
          timeoutMs: effectiveTimeoutMs,
          envelope
        })
      } catch (error) {
        throw recover(error, null)
      }
      if (response.ok === false) {
        throw recover(new RuntimeRpcFailureError(response), null)
      }
      if (this.environmentSelector) {
        markEnvironmentUsed(this.userDataPath, this.environmentSelector, {
          runtimeId: response._meta.runtimeId
        })
      }
      return response
    }
    const metadata = readMetadata(this.userDataPath)
    // Why outside recover(): a refusal here happens before anything is sent, so there is nothing to retry.
    if (this.swaQuestionProducerProof && (!this.swaQuestionSource || metadata.runtimeId !== this.swaQuestionSource.incarnation)) throw new RuntimeClientError('runtime_source_mismatch', 'The original question runtime incarnation changed. No private proof was sent.')
    const expectedRuntimeSource = this.swaQuestionSource
      ? { sourceId: this.swaQuestionSource.sourceId, runtimeId: this.swaQuestionSource.incarnation }
      : await this.runtimeSourceFence.check(metadata, method)
    let response
    try {
      response = await sendRequest<TResult>(
        metadata,
        method,
        params,
        effectiveTimeoutMs,
        envelope,
        expectedRuntimeSource,
        options?.signal
      )
    } catch (error) {
      throw recover(error, metadata.runtimeId ?? null)
    }
    if (response.ok === false) {
      throw recover(new RuntimeRpcFailureError(response), metadata.runtimeId ?? null)
    }
    return response
  }

  // Why: centralises the per-method timeout policy. Long-poll inner waiter
  // budgets live in `params.timeoutMs`; widen the client-side socket timeout
  // to `timeoutMs + grace` so it doesn't fire before the server has a chance
  // to resolve. Without this, a 5 min wait would still die at the 60 s default.
  // See design doc §3.1.
  private resolveMethodTimeoutMs(method: string, params?: unknown): number {
    if (method === 'orchestration.workerStart') {
      const requestedValue = getTimeoutMsParam(params)
      const requested = typeof requestedValue === 'number' ? requestedValue : Number(requestedValue)
      if (!isWorkerStartTimeoutWithinTimerLimit(requested)) {
        throw new RuntimeClientError(
          'invalid_argument',
          `--timeout-ms is too large for worker-start transport grace; the derived timeout must be <= ${MAX_TIMER_DELAY_MS}ms.`
        )
      }
      const readiness = resolveWorkerStartReadinessTimeoutMs(requested)
      return Math.max(resolveWorkerStartClientTimeoutMs(readiness), this.requestTimeoutMs)
    }
    if (
      (method === 'orchestration.check' && isWaitingCheck(params)) ||
      method === 'terminal.wait'
    ) {
      const inner = Number(getTimeoutMsParam(params))
      if (Number.isFinite(inner) && inner > 0) {
        return Math.max(inner + LONG_POLL_CLIENT_GRACE_MS, this.requestTimeoutMs)
      }
    }
    return this.requestTimeoutMs
  }

  async getCliStatus(): Promise<RuntimeRpcSuccess<CliStatusResult>> {
    if (this.remote) {
      const response = await this.call<RuntimeStatus>('status.get')
      this.remoteCompat.noteVerifiedStatus(response.result)
      const graphState = response.result.graphStatus
      return {
        id: response.id,
        ok: true,
        result: {
          target: {
            kind: 'environment',
            environment: this.environmentSelector ?? 'pairing-code'
          },
          app: projectRemoteAppStatus(response.result),
          runtime: {
            state: graphState === 'ready' ? 'ready' : 'graph_not_ready',
            reachable: true,
            connectionState: runtimeHostConnectionState({
              hasStatusEntry: true,
              status: response.result
            }),
            runtimeId: response.result.runtimeId,
            ...(response.result.appVersion ? { appVersion: response.result.appVersion } : {}),
            ...(response.result.remoteUpdateSupport
              ? { remoteUpdateSupport: response.result.remoteUpdateSupport }
              : {}),
            ...(response.result.capabilities ? { capabilities: response.result.capabilities } : {}),
            ...(response.result.degradations ? { degradations: response.result.degradations } : {})
          },
          graph: {
            state: graphState
          }
        },
        _meta: response._meta
      }
    }
    return getCliStatus(this.userDataPath)
  }

  private async ensureOrchestrationContractCompatible(timeoutMs: number, signal?: AbortSignal): Promise<void> {
    if (!this.orchestrationContractCheck) {
      this.orchestrationContractCheck = this.checkOrchestrationContractCompatibility(
        timeoutMs, signal
      ).catch((error: unknown) => {
        // Why: a failed probe must not be cached, or a retry after a brief outage never reaches the app.
        this.orchestrationContractCheck = null
        throw error
      })
    }
    await this.orchestrationContractCheck
  }

  private async checkOrchestrationContractCompatibility(timeoutMs: number, signal?: AbortSignal): Promise<void> {
    const response = await this.call<RuntimeStatus>('status.get', undefined, { timeoutMs, signal })
    if (this.remote) {
      this.remoteCompat.noteVerifiedStatus(response.result)
    }
    if (!response.result.capabilities?.includes(ORCHESTRATION_CONTRACT_RUNTIME_CAPABILITY)) {
      throw new RuntimeClientError(
        'orchestration_migration_required',
        'The connected Orca runtime does not support the current orchestration contract. No effects were applied.',
        orchestrationMigrationData('runtime_capability_missing')
      )
    }
  }

  async openOrca(timeoutMs = 15_000): Promise<RuntimeRpcSuccess<CliStatusResult>> {
    const initial = await this.getCliStatus()
    if (this.remote) {
      return initial
    }

    // Why: a blocked runtime can't open a window, so spawning the app would
    // only hit the single-instance lock and exit — bail before launching.
    if (initial.result.app.desktopWindowStatus === 'blocked') {
      throwDesktopActivationBlocked()
    }
    launchOrcaApp()
    if (initial.result.app.desktopWindowStatus === 'available') {
      return initial
    }

    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
      const status = await this.getCliStatus()
      if (status.result.app.desktopWindowStatus === 'blocked') {
        throwDesktopActivationBlocked()
      }
      if (status.result.app.desktopWindowStatus === 'available') {
        return status
      }
      await delay(250)
    }

    throw new RuntimeClientError(
      'runtime_open_timeout',
      'Timed out waiting for an Orca desktop window. The runtime may still be running headlessly.'
    )
  }
}

function throwDesktopActivationBlocked(): never {
  throw new RuntimeClientError(
    'desktop_activation_blocked',
    'Orca is running headlessly, but it cannot open a desktop window safely because the persistent terminal provider is unavailable. Quit Orca normally and start the app again; do not use open -n.'
  )
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
