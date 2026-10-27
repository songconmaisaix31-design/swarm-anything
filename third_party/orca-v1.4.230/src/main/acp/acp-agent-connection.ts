import type { PipedProcessSpawner } from '@orca/process-host/process-spec'
import { spawnProcess } from '@orca/process-host'
import {
  spawnManagedProviderProcess,
  type ManagedProviderProcess,
  type ProviderProcessExit
} from '../provider-process/managed-provider-process'
import type { ProviderProcessLaunch, SwaOpenCodeToolsPolicy } from '../provider-process/provider-process-launch'
import { SwaProviderProcessTree } from '../provider-process/swa-provider-process-tree'
import { AcpAgentError, AcpAuthRequiredError, AcpConnectionClosedError, AcpFrameTooLargeError, AcpInputAdmissionError, AcpInvalidResponseError, AcpRequestTimeoutError, AcpRpcError } from './acp-errors'
import { resolveAcpPeerOptions, type AcpPeerOptions } from './acp-peer-limits'
import { AcpSessionRuntime, type AcpSessionRuntimeOptions } from './acp-session-runtime'
import { readAcpSessionEvent } from './acp-session-events'

/** How an agent that signs in through a browser says so on its output. */
export type AcpSignInWatch = {
  /** A sign-in line's valid link (the connection ends signed out), null for a malformed one,
   *  undefined for any other line. */
  read(line: string, source: 'stdout' | 'stderr'): string | null | undefined
  /** The agent's answer on its sign-in: a session started, or it asked to sign in. */
  answered?(signedIn: boolean): void
  /** Receives each valid link instead, and the connection stays open for the sign-in to finish. */
  link?(link: string): void
}

// A full sign-in link with its framing; the stderr tail kept for diagnostics stays smaller.
const SIGN_IN_LINE_MAX_CHARS = 32_768

function restrictedError(error: unknown, sessionId?: string): Error {
  const data = error instanceof AcpRpcError && error.data !== null && typeof error.data === 'object'
    ? error.data as Record<string, unknown> : undefined
  const status = data?.status ?? data?.statusCode
  const safe = { ...(sessionId ? { sessionId } : {}), ...(typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}) }
  const message = `Restricted OpenCode request failed${error instanceof AcpRpcError ? ` (code ${error.code})` : ''}${'status' in safe ? ` (HTTP ${safe.status})` : ''}${sessionId ? ` (session ${sessionId})` : ''}`
  if (error instanceof AcpAuthRequiredError) return new AcpAuthRequiredError(message, safe)
  if (error instanceof AcpAgentError) return new AcpAgentError(error.code, message, safe)
  if (error instanceof AcpInvalidResponseError) return new AcpInvalidResponseError(message, undefined)
  if (error instanceof AcpRpcError) return new AcpRpcError(error.code, message, safe)
  if (error instanceof AcpConnectionClosedError) return new AcpConnectionClosedError(message)
  if (error instanceof AcpRequestTimeoutError) return new AcpRequestTimeoutError('restricted native request')
  if (error instanceof AcpFrameTooLargeError) return new AcpFrameTooLargeError(null, error.observedBytes, error.maxBytes)
  if (error instanceof AcpInputAdmissionError) return new AcpInputAdmissionError('Restricted OpenCode input was rejected before native delivery')
  return new Error(message)
}

export type AcpAgentConnectionOptions = Omit<AcpSessionRuntimeOptions, 'peer'> & {
  peer?: Omit<AcpPeerOptions, 'closeOnInputEnd'>
  /** Process exit evidence, including expected closes and processless spawn failures. */
  onExit?: (error: Error, context: { expected: boolean; exit: ProviderProcessExit }) => void
  /** Any stdout or stderr chunk from the child. */
  onOutput?: () => void
  /** 独立初始化观察可截留 stderr；产品受控策略保持优先。 */
  onStderrLine?: (line: string, cut: boolean) => boolean
  stderrLineMaxChars?: number
  signIn?: AcpSignInWatch
}

/** The execution host owns the child and protocol lifetime; the adapter owns turns and Stop. */
export function createAcpAgentConnection(
  launch: ProviderProcessLaunch,
  options: AcpAgentConnectionOptions = {},
  spawnImpl: PipedProcessSpawner = spawnProcess
): AcpAgentConnection {
  return new AcpAgentConnection(launch, options, spawnImpl)
}

export class AcpAgentConnection extends AcpSessionRuntime {
  private readonly managed: ManagedProviderProcess
  private readonly lifecycle: { closing: boolean; error?: Error }
  private readonly diagnoseLifecycle: (message: string) => void
  private readonly tree?: SwaProviderProcessTree
  private readonly swaPolicy?: SwaOpenCodeToolsPolicy
  private readonly nativeInputObservers = new Set<() => void>()
  private swaSessionId?: string
  private verifiedExit = false
  private readonly verifiedExitListeners = new Set<(exit: ProviderProcessExit) => void>()
  private observedExit?: { error: Error; exit: ProviderProcessExit }
  private finishObservedExit?: () => void
  private publishExit?: () => void
  private readonly outputEnded: Promise<void>
  readonly spawned: Promise<void>

  constructor(
    launch: ProviderProcessLaunch,
    options: AcpAgentConnectionOptions = {},
    spawnImpl: PipedProcessSpawner = spawnProcess
  ) {
    // Validate before spawning so invalid limits cannot leave an unowned child.
    const peer = resolveAcpPeerOptions({ ...options.peer, closeOnInputEnd: false })
    const { signIn } = options
    const tree = launch.swaJobIPC ? new SwaProviderProcessTree() : undefined
    if (launch.swaOpenCodePolicy && !tree) throw new Error('The restricted OpenCode process has no Job')
    if (tree) launch.swaOpenCodePolicy?.attach(tree)
    let signedOut = (): void => {}
    let unreadable = (): void => {}
    // A sign-in line is never kept or logged; only a whole, valid one is an answer.
    const signInLine = (line: string, source: 'stdout' | 'stderr', cut = false): boolean => {
      const link = signIn?.read(line, source)
      if (link === undefined) {
        return false
      }
      if (link !== null && !cut) {
        if (signIn?.link) {
          signIn.link(link)
        } else {
          signedOut()
        }
      } else if (source === 'stdout') {
        unreadable()
      }
      return true
    }
    let managed: ManagedProviderProcess
    try { managed = spawnManagedProviderProcess(launch, {
      spawnImpl,
      site: 'acp-agent-teardown',
      ...(tree ? { acceptClose: result => result.root === 'exited' && (result.tree === 'exited' || managed.processless) } : {}),
      ...(options.onOutput ? { onOutput: options.onOutput } : {}),
      ...(launch.swaOpenCodePolicy
        ? { onStderrLine: (line: string, cut: boolean) => launch.swaOpenCodePolicy!.stderr(line, cut), stderrLineMaxChars: SIGN_IN_LINE_MAX_CHARS }
        : options.onStderrLine
        ? { onStderrLine: options.onStderrLine, stderrLineMaxChars: options.stderrLineMaxChars }
        : signIn
        ? {
            onStderrLine: (line: string, cut: boolean) => signInLine(line, 'stderr', cut),
            stderrLineMaxChars: SIGN_IN_LINE_MAX_CHARS
          }
        : {})
    }) } catch (error) { tree?.closeBeforeSpawnFailure(); throw error }
    tree?.bind(managed.child, () => ({ observed: managed.rootExitObserved, processless: managed.processless }), true)
    const lifecycle: { closing: boolean; error?: Error } = { closing: false }
    const diagnose = (message: string): void => {
      try {
        options.onDiagnostic?.(launch.swaOpenCodePolicy ? 'restricted_native_diagnostic_withheld' : message)
      } catch {
        /* Diagnostics cannot interrupt cleanup. */
      }
    }
    super(managed.child.stdout, managed.child.stdin, {
      ...options,
      peer,
      strictFrames: !!launch.swaOpenCodePolicy,
      onRecord: launch.swaOpenCodePolicy ? (frame, line) => launch.swaOpenCodePolicy!.record(frame, line) : options.onRecord,
      onProtocolFailure: launch.swaOpenCodePolicy ? () => launch.swaOpenCodePolicy!.protocolFailed() : options.onProtocolFailure,
      onInputEnd: launch.swaOpenCodePolicy ? () => launch.swaOpenCodePolicy!.stdoutEnded() : options.onInputEnd,
      onDiagnostic: diagnose,
      onOtherLine: (line, cut) => signInLine(line, 'stdout', cut),
      onAuthAnswered: (signedIn) => signIn?.answered?.(signedIn),
      onClose: (error) => {
        if (launch.swaOpenCodePolicy) error = restrictedError(error, this.swaSessionId)
        lifecycle.error ??= error
        if (lifecycle.closing || !tree && managed.rootVerdict === 'exited') {
          return
        }
        void managed.close(tree).then(
          (result) => {
            if (result.root !== 'exited' || tree && result.tree !== 'exited') {
              diagnose('ACP agent exit was not proven after transport failure')
            }
          },
          (failure: unknown) => diagnose(`ACP agent cleanup failed: ${String(failure)}`)
        )
        options.onClose?.(error)
      }
    })
    this.managed = managed
    this.tree = tree
    this.swaPolicy = launch.swaOpenCodePolicy
    this.lifecycle = lifecycle
    this.diagnoseLifecycle = diagnose
    const { child } = managed
    this.outputEnded = new Promise<void>((resolve, reject) => {
      child.stdout.once('end', resolve)
      child.stdout.once('close', () => child.stdout.readableEnded ? resolve() : reject(new AcpConnectionClosedError('ACP stdout closed before EOF')))
    })
    void this.outputEnded.catch(() => undefined)
    this.spawned = new Promise<void>((resolve) => {
      if (child.pid !== undefined) {
        resolve()
        return
      }
      const done = (): void => {
        child.removeListener('spawn', done)
        child.removeListener('error', done)
        resolve()
      }
      child.once('spawn', done)
      child.once('error', done)
    }).then(() => tree?.ready())
    void this.spawned.catch(() => undefined)
    child.on('error', (error) => super.close(error))
    signedOut = () => {
      signIn?.answered?.(false)
      super.close(new AcpAuthRequiredError('The agent asked to sign in in a browser'))
    }
    // A broken sign-in line on the protocol stream is a broken agent, not a sign-in answer.
    unreadable = () =>
      super.close(new AcpConnectionClosedError('The agent printed a sign-in link Orca cannot read'))
    child.stderr.on('error', (error) => super.close(error))
    managed.onExit((exit) => {
      const error =
        lifecycle.error ??
        new AcpConnectionClosedError(launch.swaOpenCodePolicy ? 'The restricted OpenCode process exited' : managed.stderrTail().trim() || `${launch.command} exited`)
      this.observedExit = { error, exit }
      this.publishExit = () => {
        if (this.verifiedExit) return
        try { this.swaPolicy?.closed() }
        catch { diagnose('Restricted OpenCode final evidence remains unknown'); return }
        this.verifiedExit = true
        for (const listener of this.verifiedExitListeners) {
          try { listener(exit) } catch { diagnose('ACP exit listener failed') }
        }
        this.verifiedExitListeners.clear()
        try { options.onExit?.(error, { expected: lifecycle.closing, exit }) }
        catch { diagnose('ACP exit listener failed') }
      }
      let finished = false, timer: ReturnType<typeof setTimeout> | undefined
      const finish = () => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        child.stdout.removeListener('end', finish)
        child.stdout.removeListener('close', finish)
        this.finishObservedExit = undefined
        this.drainNotifications(error)
        super.close(error)
        if (!tree) this.publishExit?.()
        else void managed.close(tree).then(result => {
          if (result.root === 'exited' && (result.tree === 'exited' || managed.processless)) this.publishExit?.()
          else diagnose('ACP root exited while complete Job exit remains unknown')
        }, () => diagnose('ACP Job exit remains unproven; retain the original connection'))
      }
      this.finishObservedExit = finish
      if (!tree || !launch.swaOpenCodePolicy && (lifecycle.closing || this.closed) || exit.processless || child.stdout.destroyed || child.stdout.readableEnded) finish()
      else {
        child.stdout.once('end', finish)
        child.stdout.once('close', finish)
        timer = setTimeout(finish, 1_000)
        timer.unref()
      }
    })
  }

  get pid(): number | undefined {
    return this.managed.child.pid
  }

  observeOwnedJob() { return this.tree?.readObservation() }

  get exited(): boolean {
    return this.rootVerdict === 'exited'
  }

  get rootVerdict(): ManagedProviderProcess['rootVerdict'] {
    if (this.tree && this.managed.rootVerdict === 'exited' && !this.managed.processless && this.tree.treeVerdict !== 'exited') return 'unverifiable'
    return this.managed.rootVerdict
  }

  /** Retained evidence from the last close attempt; a null tree means no observation. */
  get lastCloseResult(): Readonly<ManagedProviderProcess['lastCloseResult']> {
    return this.managed.lastCloseResult
  }

  /** Reports retained cleanup uncertainty; false does not prove descendant exit. */
  get processTreeUnproven(): boolean {
    const result = this.lastCloseResult
    return this.managed.rootVerdict === 'exited' && !this.managed.processless && (this.tree ? this.tree.treeVerdict !== 'exited' : result?.tree === 'unverifiable' || result?.tree === 'live')
  }

  stderrTail(): string {
    return this.swaPolicy ? 'Restricted OpenCode native process' : this.managed.stderrTail().trim()
  }

  protected override normalizeError(error: unknown): unknown {
    return this.swaPolicy ? restrictedError(error, this.swaSessionId) : error
  }

  protected override admitNotification(method: string, params: unknown): boolean {
    if (!this.swaPolicy) return true
    try {
      this.swaPolicy.trace(method, method === 'session/update' ? readAcpSessionEvent(params) ?? params : params)
      for (const observe of this.nativeInputObservers) observe()
      return true
    }
    catch {
      void this.close(new AcpConnectionClosedError('The restricted OpenCode notification could not be retained'))
      return false
    }
  }

  async verifySwaSession(sessionId: string): Promise<void> {
    if (!this.swaPolicy) return
    await this.swaPolicy.ready()
    await this.swaPolicy.verifySession(sessionId)
    this.swaSessionId = sessionId
  }

  nativeInputDisposition(clientMessageId: string) { return this.swaPolicy?.inputDisposition(clientMessageId) }

  onNativeInputObservation(listener: () => void): () => void {
    this.nativeInputObservers.add(listener)
    return () => { this.nativeInputObservers.delete(listener) }
  }

  override async prompt(prompt: Parameters<AcpSessionRuntime['prompt']>[0], meta?: Parameters<AcpSessionRuntime['prompt']>[1], beforeSend?: () => void, clientMessageId?: string): ReturnType<AcpSessionRuntime['prompt']> {
    let write: import('./acp-response-settlement').AcpRequestWriteOptions | undefined
    if (this.swaPolicy) {
      try {
        if (!this.swaSessionId || !clientMessageId || meta !== undefined || prompt.some(item => item.type !== 'text') || prompt.some(item => item.type === 'text' && /^\s*\//u.test(item.text))) throw new Error('Restricted OpenCode input changed')
        await this.verifySwaSession(this.swaSessionId)
        write = await this.swaPolicy.preparePrompt(clientMessageId, prompt, beforeSend)
      } catch { throw new AcpInputAdmissionError('Restricted OpenCode input was rejected before native delivery') }
    } else beforeSend?.()
    const response = await this.promptWithWrite(prompt, meta, write)
    this.swaPolicy?.trace('session/prompt/response', { sessionId: this.swaSessionId, response })
    return response
  }

  onExit(listener: (exit: ProviderProcessExit) => void): void {
    if (this.tree) {
      if (this.verifiedExit && this.observedExit) listener(this.observedExit.exit)
      else this.verifiedExitListeners.add(listener)
      return
    }
    this.managed.onExit((exit) => {
      try {
        listener(exit)
      } catch (failure) {
        this.diagnoseLifecycle(`ACP exit listener failed: ${String(failure)}`)
      }
    })
  }

  pauseReading(): void {
    this.managed.child.stdout.pause()
  }

  resumeReading(): void {
    this.managed.child.stdout.resume()
  }

  override close(error?: Error): Promise<boolean> {
    this.lifecycle.closing ||= this.managed.rootVerdict !== 'exited'
    if (!this.swaPolicy) this.finishObservedExit?.()
    this.drainNotifications(error)
    return this.managed
      .close(this.tree)
      .then(async (result) => {
        const proven = result.root === 'exited' && (!this.tree || result.tree === 'exited' || this.managed.processless)
        if (proven) {
          if (this.swaPolicy) {
            let timer: ReturnType<typeof setTimeout> | undefined
            try {
              await Promise.race([this.outputEnded, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new AcpConnectionClosedError('Restricted OpenCode stdout EOF remains unknown')), 1_000) })])
              this.swaPolicy.closed()
            } catch { this.diagnoseLifecycle('Restricted OpenCode final evidence remains unknown'); return false }
            finally { clearTimeout(timer) }
          }
          this.publishExit?.()
        }
        return proven
      })
      .finally(() => super.close(error))
  }
}
