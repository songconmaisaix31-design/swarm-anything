import type {
  AgentSessionOptionsResult,
  AgentSessionSlashCommand
} from '../../shared/agent-session-wire'
import type {
  StructuredAgentSessionAcquireInput,
  StructuredAgentSessionLifecycleEvent,
  AgentSessionDispatchOutcome
} from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import type { StructuredAgentSessionLogger } from '../native-chat/agent-session-wire/structured-agent-session-logger'
import { providerTimelineSink } from '../native-chat/agent-session-timeline/provider-timeline-plan'
import { JsonlRpcTimelineLane } from '../jsonl-rpc/timeline-lane'
import {
  JsonlRpcAgentConnection,
  type JsonlRpcAgentConnectionOptions
} from '../jsonl-rpc/agent-connection'
import type { ProviderProcessLaunch } from '../provider-process/provider-process-launch'
import { PiRpcTurns } from './rpc-turns'
import { PiRpcDialogCallbacks } from './rpc-dialog-callbacks'
import { piRpcModelSchema, piRpcStateSchema, type PiRpcModel } from './rpc-protocol'
import {
  withLiveCatalogListing,
  type AgentModelCatalogLiveListing
} from '../native-chat/agent-model-catalog/agent-model-catalog-entry'
import { z } from 'zod'
import type { PiDisabledToolsPolicy } from './rpc-launch'
import { applyPiRpcSessionOption, readPiRpcSessionOptions } from './rpc-options'
import type { JsonlRpcRecord } from '../jsonl-rpc/peer'
import type { AgentSessionProviderHandleLink } from '../../shared/agent-session-provider-handle'
import { isAbsolute } from 'node:path'

const disabledToolsCommandSchemas = new Map<string, z.ZodType>([
  ...['get_state', 'get_available_models', 'get_messages', 'get_session_stats', 'get_last_assistant_text', 'abort'].map(command => [command, z.strictObject({})] as const),
  ['set_auto_compaction', z.strictObject({ enabled: z.literal(false) })],
  ['set_auto_retry', z.strictObject({ enabled: z.literal(false) })],
  ['set_model', z.strictObject({ provider: z.string().min(1), modelId: z.string().min(1) })],
  ['set_thinking_level', z.strictObject({ level: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']) })]
])
const disabledToolsPromptSchema = z.strictObject({ type: z.literal('prompt'), message: z.string().min(1), images: z.tuple([]).optional(), streamingBehavior: z.enum(['steer', 'followUp']).optional(), id: z.union([z.string(), z.number()]).optional() })

export type PiRpcConnection = Pick<
  JsonlRpcAgentConnection,
  | 'request'
  | 'send'
  | 'close'
  | 'pauseReading'
  | 'resumeReading'
  | 'pid'
  | 'closed'
  | 'rootVerdict'
  | 'processless'
  | 'lastCloseResult'
  | 'onExit'
> & { observeOwnedJob?: JsonlRpcAgentConnection['observeOwnedJob'] }
export type PiRpcSessionDeps = {
  openConnection?: (
    launch: ProviderProcessLaunch,
    handlers: JsonlRpcAgentConnectionOptions
  ) => PiRpcConnection
  onLifecycle: (event: StructuredAgentSessionLifecycleEvent) => void
  onSettled: (input: {
    sessionId: string
    clientMessageId: string
    fence: number
    outcome: AgentSessionDispatchOutcome
  }) => void
  onIdle: (input: { sessionId: string }) => void
  logger: StructuredAgentSessionLogger
}

/** One child owns its transport, dialect, dialogs and timeline, including shutdown retries. */
export class PiRpcSession {
  readonly connection: PiRpcConnection
  readonly lane: JsonlRpcTimelineLane
  readonly turns: PiRpcTurns
  readonly dialogs: PiRpcDialogCallbacks
  readonly selected = new Map<string, string>()
  private startCatalogListing?: AgentModelCatalogLiveListing
  readonly skipped: string[] = []
  commands?: AgentSessionSlashCommand[]
  options?: AgentSessionOptionsResult
  requestedClose = false
  private publishedExit = false
  private failedCause?: Error
  private exitDelivery: Promise<void> = Promise.resolve()
  private releaseAfterExit?: () => void
  private nativeSessionIdentity?: Readonly<{ sessionId: string; sessionFile: string }>
  private providerSessionFile?: string

  constructor(
    readonly input: StructuredAgentSessionAcquireInput,
    readonly generation: string,
    launch: ProviderProcessLaunch,
    private readonly deps: PiRpcSessionDeps,
    /** A new Pi session starts on its config's model; a resumed or forked one keeps its own. */
    readonly resolvesConfig = false,
    readonly toolsOff?: PiDisabledToolsPolicy
  ) {
    const sink = input.events && providerTimelineSink(input.events)
    if (!sink) {
      throw new Error('Pi structured chat requires the shared timeline sink')
    }
    this.lane = new JsonlRpcTimelineLane({
      sink,
      sessionId: input.identity.sessionId,
      agent: 'pi',
      generation,
      namespace: input.identity.sessionId,
      pauseReading: () => this.connection?.pauseReading(),
      resumeReading: () => this.connection?.resumeReading(),
      onFailed: (reason) => this.fail(new Error(reason)),
      onInputAccepted: (clientMessageId) =>
        this.settle(clientMessageId, {
          state: 'accepted',
          providerIdentity: { provider: 'orca', clientMessageId }
        })
    })
    this.turns = new PiRpcTurns({
      lane: this.lane,
      generation,
      send: (frame, beforeWrite) => this.sendPrompt(frame, beforeWrite),
      request: (command, params, options) => this.request(command, params, options),
      ...(toolsOff ? { retrySignIn: false } : {}),
      settled: (id, outcome) => this.settle(id, outcome),
      idle: () => {
        this.dialogs.cancelAll()
        deps.onIdle({ sessionId: input.identity.sessionId })
      },
      failed: (error) => this.fail(error),
      diagnostic: (error) =>
        deps.logger.warn('Pi context usage could not be read', {
          scope: 'pi-context-usage',
          sessionId: input.identity.sessionId,
          error
        })
    })
    this.dialogs = new PiRpcDialogCallbacks(
      this.lane,
      (frame) => this.connection.send(frame),
      (error) => this.fail(error)
    )
    this.connection = (
      deps.openConnection ?? ((spec, handlers) => new JsonlRpcAgentConnection(spec, handlers))
    )(launch, {
      ...(toolsOff ? { allowedCommands: new Set([...disabledToolsCommandSchemas.keys(), 'prompt']) } : {}),
      ...(input.onOutput ? { onOutput: input.onOutput } : {}),
      onRecord: (frame) => {
        if (toolsOff && (frame.type === 'extension_ui_request' || frame.type.startsWith('tool_execution_'))) {
          this.fail(new Error('SWA received an unapproved Pi tool or extension request'))
          return
        }
        this.turns.receive(frame)
      },
      onClose: (error) => this.fail(error),
      onDiagnostic: (message) =>
        deps.logger.warn(message, { scope: 'pi-rpc', sessionId: input.identity.sessionId }),
      onExit: (error) => {
        this.exitDelivery = this.exit(error)
          .catch((cause: unknown) =>
            deps.logger.error('Pi exit publication failed', {
              scope: 'pi-exit',
              sessionId: input.identity.sessionId,
              error: cause
            })
          )
          .finally(() => this.releaseAfterExit?.())
      }
    })
  }

  async start(): Promise<string> {
    if (this.toolsOff) {
      await this.request('set_auto_compaction', { enabled: false })
      await this.request('set_auto_retry', { enabled: false })
    }
    const state = piRpcStateSchema.parse(await this.request('get_state'))
    this.checkPolicyState(state)
    this.assertOwnedJob()
    this.lane.apply(this.turns.context.setModel(state.model ?? undefined, Date.now()))
    this.options = await this.readActualOptions()
    for (const [key, value] of Object.entries(this.input.options ?? {})) {
      if (key === 'permissionMode') continue
      if (key !== 'model' && key !== 'effort') throw new Error('Native Pi option is unsupported')
      await this.applyOption(key, value)
    }
    if (!this.toolsOff) return state.sessionFile
    if (!this.nativeSessionIdentity) throw new Error('The actual native Pi session identity is unavailable')
    return this.nativeSessionIdentity.sessionFile
  }

  bindProviderLink(link: AgentSessionProviderHandleLink) {
    if (!this.toolsOff) return
    if (!this.nativeSessionIdentity || link.handle.agent !== 'pi' || link.handle.transport !== 'jsonl-rpc' || link.handle.nativeId !== this.nativeSessionIdentity.sessionFile || this.providerSessionFile !== undefined) throw new Error('The actual native Pi provider link differs from the first session identity')
    this.providerSessionFile = link.handle.nativeId
  }

  /** What this child listed at its start, with what its config resolved; the host saves it once. */
  get startListing(): AgentModelCatalogLiveListing | undefined {
    return this.startCatalogListing
  }

  /** What the child reports now; only the start says what its config resolved. */
  async readOptions() {
    await this.assertLivePolicy()
    return withLiveCatalogListing(await this.readActualOptions())
  }

  async applyOption(key: string, value: string) {
    if (this.toolsOff && (key === 'model' && value !== `${this.toolsOff.provider}/${this.toolsOff.modelId}` || key !== 'model' && key !== 'effort')) throw new Error('The original native Pi model policy cannot change')
    const actual = await this.readActualOptions()
    if (key === 'effort' && !actual.models.find(model => model.id === actual.current.model)?.efforts.some(effort => effort.value === value)) throw new Error('The actual native Pi model does not support the selected thinking level')
    await applyPiRpcSessionOption({ request: (command, params, options) => this.request(command, params, options) }, this.selected, key, value)
    await this.assertLivePolicy()
    this.options = await this.readActualOptions()
    return Object.fromEntries(this.selected)
  }

  async assertLivePolicy() {
    if (!this.toolsOff) return
    this.checkPolicyState(piRpcStateSchema.parse(await this.request('get_state')))
    this.assertOwnedJob()
  }

  private assertOwnedJob() {
    if (!this.toolsOff) return
    const job = this.connection.observeOwnedJob?.()
    if (!job?.assigned || job.rootExited || !job.nativeCLI || !job.members.some(member => member.pid === job.nativeCLI!.pid && member.creationTimeMs === job.nativeCLI!.creationTimeMs)) throw new Error('The actual native Pi Job membership is unavailable')
  }

  private async request(command: string, params?: Record<string, unknown>, options?: { timeoutMs?: number | null }) {
    if (this.toolsOff) {
      const schema = disabledToolsCommandSchemas.get(command)
      if (!schema?.safeParse(params ?? {}).success) throw new Error('Unapproved native Pi RPC command or parameters')
      if (command === 'set_model' && (params?.provider !== this.toolsOff.provider || params.modelId !== this.toolsOff.modelId)) throw new Error('The original native Pi model policy cannot change')
    }
    const result = await this.connection.request(command, params, options)
    if (this.toolsOff && command === 'get_state') this.checkPolicyState(piRpcStateSchema.parse(result))
    if (this.toolsOff && command === 'get_available_models') {
      const models = z.object({ models: z.array(piRpcModelSchema) }).parse(result).models
      const selected = models.filter(model => model.provider === this.toolsOff!.provider && model.id === this.toolsOff!.modelId)
      if (selected.length !== 1) throw new Error('The actual native Pi catalog has no unique approved model')
      this.checkPolicyModel(selected[0])
    }
    return result
  }

  private sendPrompt(frame: JsonlRpcRecord, beforeWrite?: () => Promise<void | (() => void)>) {
    if (this.toolsOff && !disabledToolsPromptSchema.safeParse(frame).success) throw new Error('Unapproved native Pi prompt parameters')
    return this.connection.send(frame, async () => {
      const finalAdmission = await beforeWrite?.()
      return () => {
        if (typeof finalAdmission === 'function') finalAdmission()
        this.assertOwnedJob()
        if (this.connection.closed) throw new Error('The native Pi connection closed before input')
      }
    })
  }

  private checkPolicyState(state: ReturnType<typeof piRpcStateSchema.parse>) {
    if (!this.toolsOff) return
    this.checkPolicyModel(state.model)
    if (state.autoCompactionEnabled !== false || !z.uuid().safeParse(state.sessionId).success || !isAbsolute(state.sessionFile)) throw new Error('The actual native Pi state differs from the approved compaction or session policy')
    const identity = { sessionId: state.sessionId!, sessionFile: state.sessionFile }
    if (this.nativeSessionIdentity && (identity.sessionId !== this.nativeSessionIdentity.sessionId || identity.sessionFile !== this.nativeSessionIdentity.sessionFile) || this.providerSessionFile !== undefined && identity.sessionFile !== this.providerSessionFile) throw new Error('The actual native Pi session identity or provider link changed')
    this.nativeSessionIdentity ??= Object.freeze(identity)
  }

  private checkPolicyModel(model: PiRpcModel | null | undefined) {
    if (!this.toolsOff) return
    const sampling = z.record(z.string(), z.unknown()).optional().safeParse(model?.samplingParams)
    if (!model || model.provider !== this.toolsOff.provider || model.id !== this.toolsOff.modelId || model.api !== this.toolsOff.api || model.baseUrl !== this.toolsOff.baseUrl || !sampling.success || Object.keys(sampling.data ?? {}).length) throw new Error('The actual native Pi model differs from the approved provider, API, base URL or sampling policy')
  }

  private async readActualOptions() {
    const result = await readPiRpcSessionOptions({ request: (command, params, options) => this.request(command, params, options) })
    if (!this.toolsOff) return result
    const id = `${this.toolsOff.provider}/${this.toolsOff.modelId}`
    const models = result.models.filter(model => model.id === id)
    if (models.length !== 1 || result.current.model !== id) throw new Error('The actual native Pi catalog differs from the approved model')
    return { ...result, models }
  }

  async close(requested = true): ReturnType<PiRpcConnection['close']> {
    this.requestedClose ||= requested
    this.dialogs.cancelAll()
    return this.connection.close()
  }

  fail(error: Error): void {
    this.failedCause ??= error
    this.deps.logger.error('Pi RPC session failed', {
      scope: 'pi-rpc',
      sessionId: this.input.identity.sessionId,
      error
    })
    void this.close(false)
      .then((result) => {
        if (result.root !== 'exited' || result.tree !== 'exited') {
          this.deps.logger.warn('Pi process exit is unverifiable', {
            scope: 'pi-stop',
            sessionId: this.input.identity.sessionId
          })
        }
      })
      .catch((cause: unknown) =>
        this.deps.logger.error('Pi process cleanup failed', {
          scope: 'pi-stop',
          sessionId: this.input.identity.sessionId,
          error: cause
        })
      )
  }

  drainObservedExit(): Promise<void> {
    return this.exitDelivery
  }

  retire(): Promise<void> {
    return new Promise((resolve) => {
      this.releaseAfterExit = () => {
        this.releaseAfterExit = undefined
        void this.lane.drained().then(() => {
          this.lane.dispose()
          resolve()
        })
      }
      if (this.publishedExit) {
        void this.exitDelivery.then(() => this.releaseAfterExit?.())
      }
    })
  }

  private async exit(error: Error): Promise<void> {
    if (this.publishedExit) {
      return
    }
    this.publishedExit = true
    this.dialogs.cancelAll()
    this.turns.end()
    this.lane.finalize()
    this.lane.apply([
      { type: 'session.ended', verdict: { state: 'interrupted', completedAt: Date.now() } }
    ])
    this.lane.flush()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.lane.drained(),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            this.deps.logger.warn('Pi final timeline did not drain before exit publication', {
              scope: 'pi-exit-drain',
              sessionId: this.input.identity.sessionId
            })
            resolve()
          }, 2_000)
          timer.unref()
        })
      ])
    } finally {
      clearTimeout(timer)
    }
    this.deps.onLifecycle({
      type: 'ended',
      sessionId: this.input.identity.sessionId,
      fence: this.input.fence,
      acquisitionGeneration: this.generation,
      observedAt: Date.now(),
      cause: this.requestedClose ? 'requested-close' : 'unexpected-exit',
      reason: (this.failedCause ?? error).message
    })
  }

  private settle(clientMessageId: string, outcome: AgentSessionDispatchOutcome): void {
    this.deps.onSettled({
      sessionId: this.input.identity.sessionId,
      clientMessageId,
      fence: this.input.fence,
      outcome
    })
  }
}
