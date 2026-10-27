import type { PipedProcessSpawner } from '@orca/process-host/process-spec'
import { ProviderWriteAdmissionError } from '../provider-process/provider-stdio-write-queue'
import { spawnProcess } from '@orca/process-host'
import { spawnManagedProviderProcess } from '../provider-process/managed-provider-process'
import type { ProviderProcessLaunch } from '../provider-process/provider-process-launch'
import { SwaProviderProcessTree } from '../provider-process/swa-provider-process-tree'
import { buildCodexAppServerExitError } from './codex-app-server-exit-error'
import { withMissingProviderExecutable } from '../provider-process/provider-executable-missing'
import { initializeCodexAppServerConnection } from './codex-app-server-handshake'
import { CodexAppServerHandshakeExitUnprovenError } from './codex-app-server-handshake-exit-proof'
import {
  CodexAppServerTimeoutError,
  CodexAppServerUnsupportedError
} from './codex-app-server-session'
import { createCodexAppServerRecordDispatcher } from './codex-app-server-record-dispatch'
import { createProviderRecordReader } from '../provider-process/provider-record-reader'
import type {
  CodexAppServerConnection,
  CodexAppServerConnectionHandlers
} from './codex-app-server-connection-types'

export type {
  CodexAppServerConnection,
  CodexAppServerConnectionHandlers,
  CodexAppServerServerRequest
} from './codex-app-server-connection-types'
export {
  CodexAppServerRequestError,
  isCodexAppServerRequestError
} from './codex-app-server-request-error'
export { CodexAppServerFrameSizeError } from './codex-app-server-frame-size-error'
export { ROOT_ONLY_GRACEFUL_EXIT_MS as GRACEFUL_EXIT_MS } from '../provider-process/provider-process-close'

// Structured chat needs a persistent bidirectional child and per-request deadlines;
// the request-scoped app-server runner cannot carry approvals or streamed turns.

export type CodexAppServerLaunch = ProviderProcessLaunch

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const SWA_METHODS = new Set(['initialize', 'config/read', 'configRequirements/read', 'experimentalFeature/list', 'model/list', 'account/read', 'thread/start', 'turn/start', 'turn/steer', 'turn/interrupt'])

/**
 * Spawns `codex app-server`, completes the initialize handshake, and returns a
 * connection that stays open until `close()`. Rejects — after reaping the child
 * — when the handshake cannot complete.
 */
export async function openCodexAppServerConnection(
  launch: CodexAppServerLaunch,
  handlers: CodexAppServerConnectionHandlers = {},
  spawnImpl: PipedProcessSpawner = spawnProcess
): Promise<CodexAppServerConnection> {
  if (launch.swaJobIPC && !launch.swaCodexPolicy || launch.swaCodexPolicy && !launch.swaJobIPC) throw new Error('native_codex_custody_policy_required')
  const tree = launch.swaJobIPC ? new SwaProviderProcessTree() : undefined
  let managed: ReturnType<typeof spawnManagedProviderProcess>
  try { managed = spawnManagedProviderProcess(launch, {
    spawnImpl,
    site: 'codex-app-server-teardown',
    ...(tree ? { acceptClose: result => result.root === 'exited' && (result.tree === 'exited' || managed.processless), onStderrLine: () => true } : {}),
    ...(handlers.onOutput ? { onOutput: handlers.onOutput } : {})
  }) } catch (error) { tree?.closeBeforeSpawnFailure(); throw tree ? new Error('native_codex_spawn_failed') : error }
  const { child } = managed
  const terminateProcessTree = () => tree ? closeInternal(false) : managed.terminateTree()

  let nextRequestId = 1
  let closing = false
  let exitReported = false
  /** First terminal cause, or null while the transport is still usable. Set once:
   *  a child that dies reaches us through several listeners, and the specific
   *  first cause is the one worth reporting. */
  let terminalError: Error | null = null
  let finalPersisted = false
  let finalPersistenceFailed = false
  let cleanup: Promise<boolean> | undefined
  let protocolFailed = false
  let outputEnded = false
  let resolveOutputEnd: () => void = () => undefined
  const outputEnd = new Promise<void>(resolve => { resolveOutputEnd = resolve })

  function buildExitError(cause?: Error): Error {
    if (tree) return new Error('native_codex_transport_unavailable')
    const error = buildCodexAppServerExitError(managed.stderrTail(), cause)
    return managed.executableMissing ? withMissingProviderExecutable(error) : error
  }

  const dispatcher = createCodexAppServerRecordDispatcher({
    handlers,
    writeResponse,
    onProtocolFailure: (error) => {
      handleUnexpectedEnd(error)
      void terminateProcessTree()
    }
  })

  /** A death nobody asked for kills every in-flight call AND tells the owner,
   *  which is the only signal the session has that its lease is now worthless.
   *  Once only: a fatal handler failure kills the child before `close` arrives,
   *  and a spawn failure arrives as both `error` and `close`. */
  function handleUnexpectedEnd(cause?: Error): void {
    if (!terminalError) {
      terminalError = buildExitError(cause)
      dispatcher.failPending(terminalError)
    }
    // Transport/protocol failures make the connection unusable immediately so
    // callers do not hang, but recovery must not treat that as a child exit
    // until the execution host has observed `exit`/`close`.
    if (managed.rootVerdict === 'exited' && (!tree || finalPersisted) && !exitReported) {
      exitReported = true
      handlers.onExit?.(terminalError, { expected: closing })
    }
  }

  child.on('error', (error) => {
    handleUnexpectedEnd(error)
  })
  managed.onExit(() => { handleUnexpectedEnd(); if (tree) void closeInternal(false) })
  child.stdin.on('error', (error) => {
    // A broken pipe is terminal, not one failed write: every later request can
    // only error or time out, so the session must learn its lease is worthless
    // instead of staying live in front of a child nobody can reach. During a
    // close the reap is already under way and `exited` must stay honest, or
    // `close` would skip the kill it still owes.
    if (closing) {
      dispatcher.failPending(error)
      return
    }
    handleUnexpectedEnd(error)
    void terminateProcessTree()
  })

  const recordReader = createProviderRecordReader({
    stdout: child.stdout,
    ...(tree ? { maxLineBytes: 12 * 1024 * 1024, requireTerminated: true, onEnd: () => { outputEnded = true; resolveOutputEnd() } } : {}),
    onRecord: (parsed, line) => {
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        if (tree) { protocolFailed = true; handleUnexpectedEnd(); void closeInternal(false); return }
        handlers.onUnhandledFrame?.('frame:invalid-json', line)
        return
      }
      let safeRecord = parsed as Record<string, unknown>
      if (launch.swaCodexPolicy) {
        const responseMethod = !('method' in parsed) && typeof (parsed as Record<string, unknown>).id === 'number' ? dispatcher.pendingMethod((parsed as Record<string, unknown>).id as number) : undefined
        if (!('method' in parsed) && !responseMethod) { protocolFailed = true; handleUnexpectedEnd(); void closeInternal(false); return }
        try {
          const disposition = launch.swaCodexPolicy.record(parsed as Record<string, unknown>, line, responseMethod)
          if (disposition === 'remote-control-disabled') return
          if (disposition === 'steer-not-submitted') safeRecord = { id: (parsed as Record<string, unknown>).id, error: { code: -32600, message: 'native_codex_steer_not_submitted' } }
        }
        catch { protocolFailed = true; handleUnexpectedEnd(); void closeInternal(false); return }
      }
      dispatcher.dispatch(safeRecord)
    },
    onRejected: (rejected) => {
      if (tree) { protocolFailed = true; handleUnexpectedEnd(); void closeInternal(false); return }
      if (rejected.kind === 'invalid-json') {
        handlers.onUnhandledFrame?.('frame:invalid-json', rejected.line)
      } else {
        dispatcher.rejectOversized(rejected)
      }
    },
    onFatal: (error) => {
      if (tree) protocolFailed = true
      handleUnexpectedEnd(error)
      void terminateProcessTree()
    }
  })

  function sendLine(payload: Record<string, unknown>): void {
    child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  function notify(method: string, params?: Record<string, unknown>): void {
    if (tree && method !== 'initialized') { protocolFailed = true; handleUnexpectedEnd(); void closeInternal(false); return }
    if (managed.rootVerdict === 'exited' || terminalError) {
      return
    }
    try {
      sendLine(params === undefined ? { method } : { method, params })
    } catch {
      // Fire-and-forget; the next request surfaces a dead child.
    }
  }

  function request(
    method: string,
    params?: Record<string, unknown>,
    options: { timeoutMs?: number; onReply?: () => void; beforeWrite?: () => void } = {}
  ): Promise<unknown> {
    if (tree && !SWA_METHODS.has(method)) { protocolFailed = true; handleUnexpectedEnd(); void closeInternal(false); return Promise.reject(new Error('native_codex_method_rejected')) }
    if (closing) {
      return Promise.reject(new Error(`codex app-server connection is closed (${method})`))
    }
    if (terminalError) {
      return Promise.reject(terminalError)
    }
    if (managed.rootVerdict === 'exited') {
      return Promise.reject(buildExitError())
    }
    const id = nextRequestId++
    const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
    return new Promise<unknown>((resolve, reject) => {
      // Why: per request, not per session — a chat session outlives every call,
      // so only the individual call can carry a deadline.
      const timer = setTimeout(() => {
        dispatcher.timeOutPending(id)
        reject(new CodexAppServerTimeoutError(`codex app-server ${method} exceeded ${timeoutMs}ms`))
      }, timeoutMs)
      dispatcher.addPending(id, { method, resolve, reject, timer, onReply: options.onReply })
      try {
        try { options.beforeWrite?.() }
        catch (error) { throw new ProviderWriteAdmissionError(error) }
        if (tree && method === 'thread/start') launch.swaCodexPolicy!.assertCurrent()
        sendLine(params === undefined ? { method, id } : { method, id, params })
      } catch (error) {
        dispatcher.deletePending(id)
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  function writeResponse(payload: Record<string, unknown>): void {
    if (
      managed.rootVerdict === 'exited' ||
      terminalError ||
      child.stdin.destroyed ||
      !child.stdin.writable
    ) {
      return
    }
    try {
      sendLine(payload)
    } catch {
      // The turn that asked is already gone with the child.
    }
  }

  function closeInternal(expected: boolean): Promise<boolean> {
    if (expected) closing ||= managed.rootVerdict !== 'exited'
    if (cleanup) return cleanup
    if (tree && finalPersistenceFailed) return Promise.resolve(false)
    cleanup = managed.close(tree).then(async (result) => {
      dispatcher.failPending(new Error('codex app-server connection closed'))
      if (!tree) return result.root === 'exited'
      if (result.root !== 'exited' || result.tree !== 'exited' && !managed.processless) return false
      if (!managed.processless && !outputEnded) {
        let timer: ReturnType<typeof setTimeout> | undefined
        try { await Promise.race([outputEnd, new Promise<void>(resolve => { timer = setTimeout(resolve, 2_000) })]) }
        finally { clearTimeout(timer) }
      }
      if (!managed.processless && (!outputEnded || protocolFailed)) { finalPersistenceFailed = true; return false }
      if (!finalPersisted) {
        if (!managed.processless) {
          try { launch.swaCodexPolicy!.closed() }
          catch { finalPersistenceFailed = true; return false }
        }
        finalPersisted = true
      }
      handleUnexpectedEnd()
      return true
    }, () => false).finally(() => { cleanup = undefined })
    return cleanup
  }
  function close(): Promise<boolean> { return closeInternal(true) }

  const connection: CodexAppServerConnection = {
    get pid() {
      return child.pid
    },
    get closed() {
      return closing || managed.rootVerdict === 'exited' || terminalError !== null
    },
    get processTreeUnproven() {
      if (tree && (finalPersistenceFailed || managed.rootVerdict === 'exited' && !finalPersisted)) return true
      const verdict = managed.lastCloseResult?.tree
      return (
        managed.lastCloseResult?.root === 'exited' && (verdict === 'unverifiable' || verdict === 'live')
      )
    },
    request,
    notify,
    respond: (id, result) => writeResponse({ id, result }),
    respondWithError: (id, code, message) => writeResponse({ id, error: { code, message } }),
    pauseReading: recordReader.pause,
    resumeReading: recordReader.resume,
    close
  }

  let handshaking = false
  try {
    if (tree) {
      tree.bind(child, () => ({ observed: managed.rootExitObserved, processless: managed.processless }), true)
      launch.swaCodexPolicy!.attach(tree)
    }
    // A spawn that failed has no pid; the handshake below reports why.
    if (child.pid !== undefined) {
      await handlers.onSpawned?.(child.pid)
    }
    if (tree) await tree.ready()
    handshaking = true
    await initializeCodexAppServerConnection(connection, !!tree)
    await launch.swaCodexPolicy?.ready(connection)
  } catch (error) {
    if ((await close()) !== true) {
      throw new CodexAppServerHandshakeExitUnprovenError(connection, error)
    }
    throw !handshaking ||
      error instanceof CodexAppServerUnsupportedError ||
      error instanceof CodexAppServerTimeoutError
      ? error
      : buildExitError(error instanceof Error ? error : new Error(String(error)))
  }
  return connection
}
