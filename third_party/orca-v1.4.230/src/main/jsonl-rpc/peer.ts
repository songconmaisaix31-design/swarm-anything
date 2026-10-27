import type { Readable, Writable } from 'node:stream'
import { z } from 'zod'
import {
  createIncrementalNdjsonFramer,
  encodeNdjson
} from '../../shared/main-process-ndjson-framer'
import { detachProviderStreamErrorHandler } from '../provider-process/provider-stdio-error-boundary'
import { ProviderStdioWriteQueue, ProviderWriteAdmissionError, type ProviderWriteAdmission } from '../provider-process/provider-stdio-write-queue'
import { createProviderRecordReader, type ProviderRecordReader } from '../provider-process/provider-record-reader'
import type { PiPolicyRequestOptions, PiRawContext, PiWriteContext, SwaPiSessionPolicy } from '../provider-process/provider-process-launch'
import {
  jsonlRpcRequestTimeout,
  resolveJsonlRpcPeerOptions,
  type JsonlRpcPeerOptions
} from './peer-limits'

const recordSchema = z.looseObject({ type: z.string() })
const responseSchema = z.looseObject({
  type: z.literal('response'),
  id: z.string().optional(),
  command: z.string(),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional()
})

export type JsonlRpcRecord = z.infer<typeof recordSchema>
export class JsonlRpcStreamClosedError extends Error {
  constructor() {
    super('Agent JSON-lines RPC stream closed')
    this.name = 'JsonlRpcStreamClosedError'
  }
}
// 仅正常关闭时无 entry，或该 entry 的实际结算证明未进入同步准入、未写入。
class JsonlRpcUnwrittenCloseError extends JsonlRpcStreamClosedError {}
export class JsonlRpcResponseError extends Error {
  constructor(
    readonly command: string,
    message: string
  ) {
    super(message)
    this.name = 'JsonlRpcResponseError'
  }
}
export type JsonlRpcPeerHandlers = {
  /** Includes deferred prompt acknowledgements without an id. */
  /** A dialect failure is fatal: continuing would discard session or tool lifecycle evidence. */
  onRecord?: (record: JsonlRpcRecord, context?: PiRawContext) => void
  onClose?: (error: Error) => void
  onDiagnostic?: (message: string) => void
  onEnd?: () => void
  onWritesClosing?: () => void
  swaPiPolicy?: SwaPiSessionPolicy
}
type PendingRequest = {
  command: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer?: ReturnType<typeof setTimeout>
  onReply?: PiPolicyRequestOptions['onReply']
}

/** Transport only: a dialect owns turns, dialogs, and session handles. */
export class JsonlRpcPeer {
  private readonly limits: Required<JsonlRpcPeerOptions>
  private readonly pending = new Map<string, PendingRequest>()
  private readonly writer: ProviderStdioWriteQueue
  private readonly framer?: ReturnType<typeof createIncrementalNdjsonFramer>
  private readonly recordReader?: ProviderRecordReader
  private nextId = 0
  private terminalError?: Error
  private inputEndError?: Error
  private readingPaused = false
  private writesClosing = false
  private writeCloseError?: Error
  private inputEnded = false
  private resolveInputEnd!: () => void
  private rejectInputEnd!: (error: Error) => void
  private readonly inputEndCompletion = new Promise<void>((resolve, reject) => {
    this.resolveInputEnd = resolve
    this.rejectInputEnd = reject
  })

  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
    private readonly handlers: JsonlRpcPeerHandlers = {},
    options: JsonlRpcPeerOptions = {}
  ) {
    // 收尾等待可以稍后才安装；原始失败仍由同一Promise交真实关闭调用者。
    void this.inputEndCompletion.catch(() => {})
    this.limits = resolveJsonlRpcPeerOptions(options)
    this.writer = new ProviderStdioWriteQueue(
      output,
      this.limits.maxQueuedWriteBytes,
      (error) => {
        try { handlers.swaPiPolicy?.failure({ stage: 'write', code: 'write_unsettled' }) } catch { /* 永久失败已锁存。 */ }
        this.close(error)
      },
      {
        capacity: () => new Error('JSON-lines RPC write queue capacity exceeded'),
        closed: () => new Error('JSON-lines RPC output is not writable')
      }
    )
    if (handlers.swaPiPolicy) {
      this.recordReader = createProviderRecordReader({
        stdout: input,
        requireTerminated: true,
        maxLineBytes: Math.min(this.limits.maxLineBytes, 8 * 1024 * 1024),
        onRecord: (record, line) => this.dispatch(record, line),
        onRejected: () => this.failStrict('protocol'),
        onFatal: () => this.failStrict('stdout'),
        onEnd: () => {
          if (this.terminalError) return
          if (this.pending.size) { this.failStrict('protocol'); return }
          try { handlers.onEnd?.() } catch { this.failStrict('persistence'); return }
          this.beginClose()
          if (this.terminalError) return
          this.inputEnded = true
          this.resolveInputEnd()
        }
      })
      output.on('finish', this.onOutputEnd)
      output.on('close', this.onOutputEnd)
      output.on('error', this.onError)
      if (input.destroyed || input.readableEnded || output.destroyed || !output.writable) this.failStrict('stdout')
      return
    }
    this.framer = createIncrementalNdjsonFramer(
      (record) => this.dispatch(record),
      (rejected) => {
        if (rejected.kind === 'line-too-long') {
          this.close(new Error('JSON-lines RPC record exceeded the size limit'))
        } else {
          this.diagnose('Ignored non-JSON agent output')
        }
      },
      {
        maxLineBytes: this.limits.maxLineBytes,
        shouldPause: () => this.readingPaused || this.closed
      }
    )
    input.setEncoding('utf8')
    input.on('data', this.onData)
    input.on('end', this.onEnd)
    input.on('close', this.onEnd)
    input.on('error', this.onError)
    output.on('finish', this.onEnd)
    output.on('close', this.onEnd)
    output.on('error', this.onError)
    if (input.destroyed || input.readableEnded || output.destroyed || !output.writable) {
      this.onEnd()
    }
  }

  get closed(): boolean {
    return this.terminalError !== undefined || this.inputEnded
  }

  get completeInput(): boolean {
    return this.inputEnded && this.terminalError === undefined
  }

  waitForInputEnd(): Promise<void> {
    return this.inputEndCompletion
  }

  waitForWrites(): Promise<void> {
    return this.writer.settled()
  }

  beginClose(error = new JsonlRpcStreamClosedError()): void {
    if (this.writesClosing) return
    this.writesClosing = true
    this.writeCloseError = error
    try { this.handlers.onWritesClosing?.() }
    catch { this.failStrict('persistence'); return }
    this.writer.beginClose(error)
  }

  /** A process exit can precede the last bytes already written to stdout. */
  finishOnInputEnd(error: Error): void {
    this.inputEndError = error
  }

  pauseReading(): void {
    this.readingPaused = true
    if (this.recordReader) this.recordReader.pause()
    else this.input.pause()
  }

  resumeReading(): void {
    if (this.closed) {
      return
    }
    this.readingPaused = false
    try {
      if (this.recordReader) { this.recordReader.resume(); return }
      this.framer?.resume()
      if (!this.readingPaused && !this.closed) {
        this.input.resume()
      }
    } catch (error) {
      this.close(error instanceof Error ? error : new Error(String(error)))
    }
  }

  request(
    command: string,
    params: Record<string, unknown> = {},
    options: PiPolicyRequestOptions = {}
  ): Promise<unknown> {
    if (this.closed || this.writesClosing) {
      return Promise.reject(this.terminalError ?? new JsonlRpcStreamClosedError())
    }
    if (this.pending.size >= this.limits.maxPendingRequests) {
      return Promise.reject(new Error('JSON-lines RPC pending request capacity exceeded'))
    }
    let timeoutMs: number | null
    try {
      timeoutMs =
        options.timeoutMs === null
          ? null
          : jsonlRpcRequestTimeout(options.timeoutMs ?? this.limits.requestTimeoutMs)
      if (this.handlers.swaPiPolicy) {
        if (timeoutMs === null) throw new Error('SWA Pi RPC requires a finite reply deadline')
        timeoutMs = Math.min(timeoutMs, 30_000)
      }
    } catch (error) {
      return Promise.reject(error)
    }
    const id = options.id ?? `orca-${++this.nextId}`
    if (!id || this.pending.has(id)) return Promise.reject(new Error('Agent RPC request identity is already pending'))
    const controller = new AbortController()
    return new Promise((resolve, reject) => {
      const timer =
        timeoutMs === null
          ? undefined
          : setTimeout(() => {
              if (this.handlers.swaPiPolicy) {
                this.failStrict('protocol')
                controller.abort(new Error('SWA Pi RPC reply deadline elapsed'))
                return
              }
              this.pending.delete(id)
              const error = new Error(`Agent did not answer ${command} in time`)
              controller.abort(error)
              reject(error)
            }, timeoutMs)
      timer?.unref()
      this.pending.set(id, { command, resolve, reject, timer, ...(options.onReply ? { onReply: options.onReply } : {}) })
      void this.send({ ...params, type: command, id }, controller.signal, options.beforeWrite).catch(
        (error: unknown) => {
          if (this.handlers.swaPiPolicy && error instanceof JsonlRpcUnwrittenCloseError && this.writesClosing && !this.terminalError) this.rejectPending(id, error)
          else if (this.handlers.swaPiPolicy) this.rejectStrictWrite(error)
          else this.rejectPending(id, error instanceof Error ? error : new Error(String(error)))
        }
      )
    })
  }

  /** The dialect may track acknowledgements independently of transport correlation. */
  send(record: JsonlRpcRecord, signal?: AbortSignal, beforeWrite?: ProviderWriteAdmission): Promise<void> {
    if (this.closed || this.writesClosing) {
      return Promise.reject(this.terminalError ?? (this.handlers.swaPiPolicy && this.writesClosing ? new JsonlRpcUnwrittenCloseError() : new JsonlRpcStreamClosedError()))
    }
    try {
      const policy = this.handlers.swaPiPolicy
      const line = encodeNdjson(record, policy ? Math.min(this.limits.maxLineBytes, 8 * 1024 * 1024) : this.limits.maxLineBytes)
      if (!policy) return this.writer.write(line, signal, beforeWrite)
      const context: PiWriteContext = { frame: record, line, ...(record.type === 'prompt' && typeof record.id === 'string' ? { clientMessageId: record.id } : {}) }
      let finalAdmissionEntered = false, cancelledBeforeAdmission = false
      const admission: ProviderWriteAdmission = async () => {
        const finalAdmission = await beforeWrite?.()
        return () => {
          finalAdmissionEntered = true
          const cleanups: (() => void)[] = []
          const release = () => {
            let failed = false
            for (const cleanup of cleanups.reverse()) {
              try { cleanup() } catch { failed = true }
            }
            if (failed) {
              try { policy.failure({ stage: 'settings', code: 'settings_unverifiable' }) } catch { /* 同步锁存，不让策略异常跳过队列终结。 */ }
              throw new Error('SWA Pi input cleanup is unverifiable')
            }
          }
          try {
            const outerCleanup = finalAdmission?.()
            if (outerCleanup) cleanups.push(outerCleanup)
            policy.assertCurrent()
            cleanups.push(policy.beforeWrite(context))
          } catch {
            release()
            try { policy.failure({ stage: 'approval', code: 'approval_changed' }) } catch { /* 仅向队列交固定安全分类。 */ }
            throw new Error('SWA Pi input admission was refused')
          }
          return release
        }
      }
      return this.writer.write(line, signal, admission, fact => {
        if (this.writesClosing && !this.terminalError && !finalAdmissionEntered && fact.outcome === 'rejected' && !fact.writeAttempted && fact.cleanupCompleted) {
          cancelledBeforeAdmission = true
          return
        }
        policy.writeSettled(context, fact.outcome, fact)
      }).catch(error => {
        if (cancelledBeforeAdmission && this.writesClosing && !this.terminalError && error === this.writeCloseError) throw new JsonlRpcUnwrittenCloseError()
        this.rejectStrictWrite(error)
        throw this.terminalError ?? new Error('SWA Pi RPC write is unverifiable')
      })
    } catch (error) {
      if (!this.handlers.swaPiPolicy) return Promise.reject(error)
      this.rejectStrictWrite(error)
      return Promise.reject(this.terminalError ?? new Error('SWA Pi RPC write is unverifiable'))
    }
  }

  close(error: Error = new Error('Agent JSON-lines RPC stream closed')): void {
    if (this.terminalError) {
      return
    }
    if (this.handlers.swaPiPolicy) error = error instanceof ProviderWriteAdmissionError
      ? new ProviderWriteAdmissionError(new Error('SWA Pi input admission was refused'))
      : new Error('SWA Pi RPC evidence is unverifiable')
    this.terminalError = error
    this.writesClosing = true
    this.rejectInputEnd(error)
    this.input.removeListener('data', this.onData)
    this.input.removeListener('end', this.onEnd)
    this.input.removeListener('close', this.onEnd)
    detachProviderStreamErrorHandler(this.input, this.onError)
    this.output.removeListener('finish', this.onEnd)
    this.output.removeListener('close', this.onEnd)
    detachProviderStreamErrorHandler(this.output, this.onError)
    this.framer?.reset()
    this.recordReader?.pause()
    this.output.removeListener('finish', this.onOutputEnd)
    this.output.removeListener('close', this.onOutputEnd)
    this.writer.close(error)
    for (const id of this.pending.keys()) {
      this.rejectPending(id, error)
    }
    try {
      this.handlers.onClose?.(error)
    } catch {
      this.diagnose('Agent RPC close observer failed')
    }
  }

  private readonly onData = (chunk: string): void => {
    try {
      this.framer?.feed(chunk)
    } catch (error) {
      this.close(error instanceof Error ? error : new Error(String(error)))
    }
  }
  private readonly onEnd = (): void =>
    this.close(this.inputEndError ?? new JsonlRpcStreamClosedError())
  private readonly onOutputEnd = (): void => {
    if (!this.writesClosing && !this.inputEnded) this.failStrict('write')
  }
  private readonly onError = (error: Error): void => {
    if (this.handlers.swaPiPolicy) this.failStrict('stdout')
    else this.close(error)
  }

  private failStrict(stage: 'protocol' | 'stdout' | 'write' | 'persistence'): void {
    if (this.terminalError) return
    const code = stage === 'protocol' ? 'protocol_unverifiable' : stage === 'stdout' ? 'stdout_incomplete' : stage === 'write' ? 'write_unsettled' : 'trace_unavailable'
    try { this.handlers.swaPiPolicy?.failure({ stage, code }) } catch { /* 仍须终结同一 pending/reader 资源。 */ }
    this.close(new Error('SWA Pi RPC evidence is unverifiable'))
  }

  private rejectStrictWrite(error: unknown): void {
    if (this.terminalError) return
    try { this.handlers.swaPiPolicy?.failure({ stage: 'write', code: 'write_unsettled' }) } catch { /* 失败永久锁存，原始异常不进入公开 waiter。 */ }
    this.close(error instanceof ProviderWriteAdmissionError ? error : new Error('SWA Pi RPC write is unverifiable'))
  }

  private diagnose(message: string): void {
    try {
      this.handlers.onDiagnostic?.(message)
    } catch {
      /* Diagnostics cannot break cleanup. */
    }
  }

  private rejectPending(id: string, error: Error): void {
    const pending = this.pending.get(id)
    if (!pending) {
      return
    }
    this.pending.delete(id)
    clearTimeout(pending.timer)
    pending.reject(error)
  }

  private dispatch(value: unknown, line?: string): void {
    if (this.terminalError || this.inputEnded) {
      return
    }
    if (this.handlers.swaPiPolicy) {
      try {
        if (line === undefined) throw new Error('SWA Pi raw record source is missing')
        const record = recordSchema.parse(value)
        let pending: PendingRequest | undefined
        let responseContext: { id: string; command: string } | undefined
        if (record.type === 'response') {
          if (typeof record.id !== 'string') throw new Error('SWA Pi response has no request identity')
          pending = this.pending.get(record.id)
          if (!pending || record.command !== pending.command) throw new Error('SWA Pi response has no current request')
          responseContext = { id: record.id, command: pending.command }
        }
        const context = this.handlers.swaPiPolicy.rawRecord(value, line, responseContext)
        if (record.type === 'response') {
          const response = responseSchema.parse(record)
          if (!pending || !response.id || !response.success || response.error !== undefined) throw new Error('SWA Pi response was refused')
          pending.onReply?.(record, context)
          if (this.terminalError || this.pending.get(response.id) !== pending) throw new Error('SWA Pi request changed during observation')
          this.pending.delete(response.id)
          clearTimeout(pending.timer)
          pending.resolve(response.data)
        } else this.handlers.onRecord?.(record, context)
      } catch { this.failStrict('protocol') }
      return
    }
    const parsed = recordSchema.safeParse(value)
    if (!parsed.success) {
      const identified = z.object({ id: z.string() }).safeParse(value)
      if (identified.success) {
        this.rejectPending(identified.data.id, new Error('Invalid agent RPC response'))
      }
      this.diagnose('Ignored invalid agent RPC record')
      return
    }
    const record = parsed.data
    if (
      record.type !== 'response' &&
      record.type !== 'extension_ui_request' &&
      typeof record.id === 'string' &&
      this.pending.has(record.id) &&
      (Object.hasOwn(record, 'command') || Object.hasOwn(record, 'success'))
    ) {
      this.rejectPending(record.id, new Error('Invalid agent RPC response'))
      return
    }
    if (record.type === 'response' && typeof record.id === 'string') {
      const pending = this.pending.get(record.id)
      if (!pending) {
        return
      }
      const response = responseSchema.safeParse(record)
      if (!response.success || response.data.command !== pending.command) {
        this.rejectPending(record.id, new Error('Invalid agent RPC response'))
        return
      }
      this.pending.delete(record.id)
      clearTimeout(pending.timer)
      if (response.data.success) {
        pending.resolve(response.data.data)
      } else {
        pending.reject(
          new JsonlRpcResponseError(
            pending.command,
            response.data.error ?? `Agent rejected ${pending.command}`
          )
        )
      }
      return
    }
    this.handlers.onRecord?.(record)
  }
}
