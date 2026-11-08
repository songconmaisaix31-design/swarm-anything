import type { Readable, Writable } from 'node:stream'
import { z } from 'zod'
import { readAcpResponse } from './acp-response-settlement'
import type { AcpResponse, AcpRequestOptions, AcpPendingResponse, AcpRequestWriteOptions } from './acp-response-settlement'
import {
  createIncrementalNdjsonFramer,
  encodeNdjson
} from '../../shared/main-process-ndjson-framer'
import { AcpConnectionClosedError, AcpRequestTimeoutError } from './acp-errors'
import { AcpIncomingRequests } from './acp-incoming-requests'
import { requestTimeout, resolveAcpPeerOptions, type AcpPeerOptions } from './acp-peer-limits'
export type { AcpPeerOptions } from './acp-peer-limits'
import { settleOversizedAcpLine } from './acp-oversized-lines'
import { AcpWriteQueue } from './acp-write-queue'
import { detachAcpStreamErrorHandler } from './acp-stdio-error-boundary'
import {
  acpRpcEnvelopeSchema,
  invalidAcpResponseEnvelope,
  settleAcpResponse,
  type AcpJsonRpcMessage
} from './acp-rpc-envelope'
export type { AcpJsonRpcMessage } from './acp-rpc-envelope'
export type AcpRequestContext = { id: string | number | null; signal: AbortSignal }
export type AcpPeerHandlers = {
  /** 受控原生通道要求完整 UTF-8 JSON 帧，包括 EOF。 */
  strictFrames?: boolean
  onRecord?: (record: unknown, line: string) => void
  onProtocolFailure?: () => void
  onInputEnd?: () => void
  // Void means handled; unsupported methods must throw AcpRpcError(-32601). The handler owns its
  // request: once the signal aborts it still answers, or throws (-32800); unanswered ends at close().
  onRequest?: (method: string, params: unknown, context: AcpRequestContext) => unknown
  onNotification?: (method: string, params: unknown) => void
  onDiagnostic?: (message: string) => void
  onClose?: (error: Error) => void
  /** A line on the input that is not a protocol message, including an unterminated last one. */
  onOtherLine?: (line: string, cut?: boolean) => void
}
export class AcpJsonRpcPeer {
  private readonly pending = new Map<number, AcpPendingResponse>()
  private readonly incoming: AcpIncomingRequests
  private readonly writer: AcpWriteQueue
  private readonly framer: ReturnType<typeof createIncrementalNdjsonFramer>
  private nextId = 1
  private terminalError?: Error
  private drainingNotifications = false
  private readonly limits: Required<AcpPeerOptions>
  private readonly decoder?: TextDecoder
  private inputEnded = false

  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
    private readonly handlers: AcpPeerHandlers = {},
    options: AcpPeerOptions = {}
  ) {
    const limits = resolveAcpPeerOptions(options)
    this.limits = limits
    if (handlers.strictFrames) this.decoder = new TextDecoder('utf-8', { fatal: true })
    this.writer = new AcpWriteQueue(output, limits.maxQueuedWriteBytes, (error) =>
      this.close(error)
    )
    this.incoming = new AcpIncomingRequests(
      handlers.onRequest,
      (message) => this.send(message),
      (error) => this.close(error),
      this.limits.maxIncomingRequests,
      (message) => this.diagnose(message)
    )
    this.framer = createIncrementalNdjsonFramer(
      (record, line) => this.dispatch(record, line),
      (rejected) => {
        if (handlers.strictFrames) { this.handlers.onProtocolFailure?.(); this.close(new AcpConnectionClosedError('Restricted ACP frame invalid or oversized')); return }
        if (rejected.kind === 'line-too-long') {
          this.handlers.onOtherLine?.(rejected.prefix, true)
          settleOversizedAcpLine(rejected, {
            rejectPending: (id, error) => this.rejectPending(id, error),
            refuse: (id, error) => this.incoming.refuse(id, error),
            close: (error) => this.close(error),
            diagnose: (message) => this.diagnose(message)
          })
        } else {
          this.otherLine(rejected.line)
        }
      },
      { maxLineBytes: this.limits.maxLineBytes }
    )
    if (!handlers.strictFrames) input.setEncoding('utf8')
    input.on('data', this.onData)
    input.on('end', this.onInputEnd)
    input.on('close', this.onInputEnd)
    input.on('error', this.onError)
    output.on('close', this.onEnd)
    output.on('finish', this.onEnd)
    output.on('error', this.onError)
    if (
      (this.limits.closeOnInputEnd && (input.destroyed || input.readableEnded)) ||
      output.destroyed ||
      !output.writable
    ) {
      this.onEnd()
    }
  }

  get closed(): boolean {
    return this.terminalError !== undefined
  }

  request<T>(method: string, params: unknown, options: AcpRequestOptions<T>): Promise<T>
  request(
    method: string,
    params: unknown,
    options?: { timeoutMs?: number | null }
  ): Promise<unknown>
  request(
    method: string,
    params: unknown,
    options: Partial<AcpRequestOptions> = {}
  ): Promise<unknown> {
    if (this.terminalError) {
      return this.rejectUnwritten(this.terminalError, options)
    }
    if (this.pending.size >= this.limits.maxPendingRequests) {
      return this.rejectUnwritten(new Error('ACP pending request capacity exceeded'), options)
    }
    let timeoutMs: number | null
    try {
      timeoutMs = requestTimeout(
        options.timeoutMs === undefined ? this.limits.requestTimeoutMs : options.timeoutMs
      )
    } catch (error) {
      return this.rejectUnwritten(error, options)
    }
    const id = this.nextId++
    const controller = new AbortController()
    return new Promise((resolve, reject) => {
      const settle = (response: AcpResponse): void => {
        try {
          resolve(readAcpResponse(response, options.settle))
        } catch (error) {
          reject(error)
        }
      }
      const timer =
        timeoutMs === null
          ? undefined
          : setTimeout(() => {
              this.pending.delete(id)
              const error = new AcpRequestTimeoutError(method)
              controller.abort(error)
              reject(error)
            }, timeoutMs)
      this.pending.set(id, {
        method,
        resolve: (value) => settle({ value }),
        reject: (error) => settle({ error }),
        timer
      })
      let prepared: unknown
      try { prepared = options.prepareParams ? options.prepareParams(id, params) : params }
      catch (error) { this.pending.delete(id); clearTimeout(timer); void this.rejectUnwritten(error, options).catch(reject); return }
      void this.send({ jsonrpc: '2.0', id, method, params: prepared }, controller.signal, options).catch((error) => {
        const pending = this.pending.get(id)
        if (!pending) {
          return
        }
        this.pending.delete(id)
        clearTimeout(timer)
        pending.reject(error instanceof Error ? error : new Error(String(error)))
      })
    })
  }

  notify(method: string, params: unknown): Promise<void> {
    return this.send({ jsonrpc: '2.0', method, params })
  }

  /** Aborts every open agent request's signal; each handler still sends its own answer. */
  cancelIncomingRequests(): void {
    this.incoming.cancel()
  }

  close(error: Error = new AcpConnectionClosedError()): void {
    this.shutdown(error, false)
  }

  /** Reject calls immediately; the process owner bounds how long final notifications can arrive. */
  drainNotifications(error: Error = new AcpConnectionClosedError()): void {
    this.shutdown(error, true)
  }

  private shutdown(error: Error, drainNotifications: boolean): void {
    if (this.terminalError && (!this.drainingNotifications || drainNotifications)) {
      return
    }
    this.drainingNotifications = drainNotifications
    if (!drainNotifications) {
      this.input.removeListener('data', this.onData)
      this.input.removeListener('end', this.onInputEnd)
      this.input.removeListener('close', this.onInputEnd)
      detachAcpStreamErrorHandler(this.input, this.onError)
      this.framer.reset()
    }
    if (this.terminalError) {
      return
    }
    this.output.removeListener('close', this.onEnd)
    this.output.removeListener('finish', this.onEnd)
    detachAcpStreamErrorHandler(this.output, this.onError)
    this.terminalError = error
    this.writer.close(error)
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
    this.incoming.close(error)
    try {
      this.handlers.onClose?.(error)
    } catch (failure) {
      this.diagnose(String(failure))
    }
  }

  private readonly onData = (chunk: string | Buffer): void => {
    try {
      if (this.decoder && typeof chunk === 'string') throw new Error('Restricted ACP stream encoding changed')
      this.framer.feed(this.decoder ? this.decoder.decode(chunk as Buffer, { stream: true }) : String(chunk))
    } catch (error) {
      if (this.handlers.strictFrames) this.handlers.onProtocolFailure?.()
      this.close(error instanceof Error ? error : new Error(String(error)))
    }
  }
  private readonly onEnd = (): void => this.close()
  private readonly onInputEnd = (): void => {
    if (this.inputEnded) return
    this.inputEnded = true
    if (this.decoder) {
      try {
        if (!this.input.readableEnded) throw new Error('Restricted ACP stdout closed before EOF')
        this.framer.feed(this.decoder.decode())
        if (this.framer.takeTail().length) throw new Error('Restricted ACP stdout ended with an incomplete frame')
        this.handlers.onInputEnd?.()
      } catch { this.handlers.onProtocolFailure?.(); this.close(new AcpConnectionClosedError('Restricted ACP stdout is incomplete')); return }
    }
    const tail = this.framer.takeTail()
    if (tail.trim()) {
      this.otherLine(tail)
    }
    if (this.limits.closeOnInputEnd) {
      this.close()
    }
  }
  private readonly onError = (error: Error): void => this.close(error)
  private otherLine(line: string): void {
    this.handlers.onOtherLine?.(line)
    this.diagnose('Ignored ACP line: invalid-json')
  }
  private diagnose(message: string): void {
    try {
      this.handlers.onDiagnostic?.(message)
    } catch {
      /* Diagnostics cannot break the transport. */
    }
  }

  private send(message: AcpJsonRpcMessage, signal?: AbortSignal, options?: AcpRequestWriteOptions): Promise<void> {
    if (this.terminalError) {
      return this.rejectUnwritten(this.terminalError, options)
    }
    let settled = false
    try {
      return this.writer.write(encodeNdjson(message, this.limits.maxLineBytes), signal, options?.beforeWrite, fact => { settled = true; options?.onSettled?.(fact) }).catch(error => {
        if (!settled) options?.onSettled?.({ outcome: 'rejected', writeAttempted: false, cleanupCompleted: true })
        throw error
      })
    } catch (error) {
      return settled ? Promise.reject(error) : this.rejectUnwritten(error, options)
    }
  }

  private rejectUnwritten(error: unknown, options?: AcpRequestWriteOptions): Promise<never> {
    try { options?.onSettled?.({ outcome: 'rejected', writeAttempted: false, cleanupCompleted: true }) }
    catch (failure) { return Promise.reject(failure) }
    return Promise.reject(error)
  }

  private rejectPending(id: number, error: (method: string) => Error): void {
    const pending = this.pending.get(id)
    if (pending) {
      this.pending.delete(id)
      clearTimeout(pending.timer)
      pending.reject(error(pending.method))
    }
  }

  private dispatch(record: unknown, line: string): void {
    if (this.closed && !this.drainingNotifications) {
      return
    }
    const parsed = acpRpcEnvelopeSchema.safeParse(record)
    if (!parsed.success) {
      if (this.handlers.strictFrames) throw new Error('Restricted ACP envelope invalid')
      this.diagnose('Ignored invalid ACP JSON-RPC envelope')
      const response = z
        .object({ id: z.number(), method: z.undefined().optional() })
        .safeParse(record)
      if (response.success) {
        this.rejectPending(response.data.id, invalidAcpResponseEnvelope(record))
      }
      return
    }
    const frame = parsed.data
    this.handlers.onRecord?.(record, line)
    if (this.drainingNotifications && (frame.id !== undefined || frame.method === undefined)) {
      return
    }
    if (frame.method !== undefined) {
      if ('result' in frame || 'error' in frame) {
        if (this.handlers.strictFrames) throw new Error('Restricted ACP request invalid')
        this.diagnose('Ignored invalid ACP request')
        return
      }
      if (frame.id !== undefined) {
        this.incoming.handle(frame.id, frame.method, frame.params)
        return
      }
      try {
        this.handlers.onNotification?.(frame.method, frame.params)
      } catch (error) {
        if (this.handlers.strictFrames) throw error
        this.diagnose(`ACP notification handler failed: ${String(error)}`)
      }
      return
    }
    if ('result' in frame === 'error' in frame) {
      if (this.handlers.strictFrames) throw new Error('Restricted ACP response invalid')
      this.diagnose('Ignored invalid ACP response')
      if (typeof frame.id === 'number') {
        this.rejectPending(frame.id, invalidAcpResponseEnvelope(record))
      }
      return
    }
    if (typeof frame.id !== 'number') {
      return
    }
    const pending = this.pending.get(frame.id)
    if (!pending) {
      return
    }
    this.pending.delete(frame.id)
    clearTimeout(pending.timer)
    settleAcpResponse(frame, pending, (message) => this.diagnose(message))
  }
}
