import type { Writable } from 'node:stream'

export type ProviderWriteCleanup = () => void
export type ProviderWriteFinalAdmission = () => void | ProviderWriteCleanup
export type ProviderWriteAdmission = () => Promise<void | ProviderWriteFinalAdmission>
export type ProviderWriteSettlement = {
  outcome: 'resolved' | 'rejected'
  writeAttempted: boolean
  cleanupCompleted: boolean
}

type Write = {
  line: string
  bytes: number
  resolve: () => void
  reject: (error: Error) => void
  detachAbort?: () => void
  detachDrain?: () => void
  beforeWrite?: ProviderWriteAdmission
  finalAdmission?: ProviderWriteFinalAdmission
  onSettled?: (fact: ProviderWriteSettlement) => void
  writeAttempted: boolean
  cleanupCompleted: boolean
  admissionPending: boolean
  inWriteCritical: boolean
  terminal: boolean
  completed: boolean
  drained: boolean
  returned: boolean
  pendingError?: Error
}

export class ProviderWriteAdmissionError extends Error {
  constructor(cause: unknown) { super('Native input was refused before its stream write', { cause }) }
}

export class ProviderStdioWriteQueue {
  private readonly queue: Write[] = []
  private bytes = 0
  private active?: Write
  private closingError?: Error
  private terminalError?: Error
  private failureNotified = false
  private settling = 0
  private settlementBarrier?: { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void }

  constructor(
    private readonly output: Writable,
    private readonly maxBytes: number,
    private readonly onFailure: (error: Error) => void,
    private readonly errors: { capacity: () => Error; closed: () => Error }
  ) {}

  write(
    line: string,
    signal?: AbortSignal,
    beforeWrite?: ProviderWriteAdmission,
    onSettled?: (fact: ProviderWriteSettlement) => void
  ): Promise<void> {
    if (this.terminalError || this.closingError) {
      return Promise.reject(this.terminalError ?? this.closingError)
    }
    if (signal?.aborted) {
      return Promise.reject(signal.reason)
    }
    const bytes = Buffer.byteLength(line)
    if (this.bytes + bytes > this.maxBytes) {
      return Promise.reject(this.errors.capacity())
    }
    this.bytes += bytes
    return new Promise((resolve, reject) => {
      const write: Write = {
        line, bytes, resolve, reject,
        ...(beforeWrite ? { beforeWrite } : {}),
        ...(onSettled ? { onSettled } : {}),
        writeAttempted: false, cleanupCompleted: true, admissionPending: false, inWriteCritical: false,
        terminal: false, completed: false, drained: false, returned: false
      }
      const abort = (): void => {
        // 已交给 stream 的输入不能撤回；active 取消必须停止后续效果。
        if (this.active === write) {
          this.fail(
            signal?.reason instanceof Error ? signal.reason : new Error('Agent write aborted')
          )
          return
        }
        const index = this.queue.indexOf(write)
        if (index === -1) {
          return
        }
        this.settle(write, 'rejected', signal?.reason instanceof Error ? signal.reason : new Error('Agent write aborted'))
      }
      signal?.addEventListener('abort', abort, { once: true })
      write.detachAbort = () => signal?.removeEventListener('abort', abort)
      this.queue.push(write)
      this.flush()
    })
  }

  beginClose(error: Error): void {
    this.closingError ??= error
    for (const write of [...this.queue]) this.settle(write, 'rejected', this.closingError)
    const active = this.active
    if (active && !active.writeAttempted) {
      active.pendingError ??= this.closingError
      if (!active.inWriteCritical && !active.admissionPending) this.settle(active, 'rejected', active.pendingError)
    }
  }

  settled(): Promise<void> {
    if (this.terminalError) return Promise.reject(new Error('Native stream writes did not settle safely'))
    if (!this.active && this.queue.length === 0 && this.settling === 0) return Promise.resolve()
    if (!this.settlementBarrier) {
      let resolve!: () => void, reject!: (error: Error) => void
      const promise = new Promise<void>((done, failed) => { resolve = done; reject = failed })
      this.settlementBarrier = { promise, resolve, reject }
    }
    return this.settlementBarrier.promise
  }

  close(error: Error): void {
    if (this.terminalError) {
      return
    }
    this.terminalError = error
    this.closingError ??= error
    const active = this.active
    if (active) {
      if (!active.pendingError || active.pendingError === this.closingError) active.pendingError = error
      // 同步 stream callback 可重入 close；当前 finally 的真实清理必须先结算。
      if (!active.inWriteCritical) this.settle(active, 'rejected', active.pendingError)
    }
    for (const write of [...this.queue]) this.settle(write, 'rejected', error)
    this.notifySettled()
  }

  private flush(): void {
    if (this.active || this.settling > 0 || this.terminalError || this.closingError) {
      return
    }
    const write = this.queue.shift()
    if (!write) {
      return
    }
    this.active = write
    if (write.beforeWrite) {
      write.admissionPending = true
      void Promise.resolve().then(() => {
        if (write.terminal || this.closingError || this.terminalError) return
        return write.beforeWrite!()
      }).then(finalAdmission => {
        write.admissionPending = false
        if (write.terminal || this.active !== write) return
        if (finalAdmission) write.finalAdmission = finalAdmission
        if (this.closingError) this.settle(write, 'rejected', this.closingError)
        else if (!this.terminalError) this.writeActive(write)
      }, error => {
        write.admissionPending = false
        if (!write.terminal && this.active === write) this.fail(new ProviderWriteAdmissionError(error))
      })
      return
    }
    this.writeActive(write)
  }

  private writeActive(write: Write): void {
    if (write.terminal || this.active !== write) return
    if (this.output.destroyed || !this.output.writable) {
      this.fail(this.errors.closed())
      return
    }
    const onDrain = (): void => {
      write.drained = true
      this.finish(write)
    }
    this.output.once('drain', onDrain)
    write.detachDrain = () => this.output.removeListener('drain', onDrain)
    let cleanup: void | ProviderWriteCleanup = undefined
    let admissionReturned = false
    write.inWriteCritical = true
    write.cleanupCompleted = false
    try {
      try {
        cleanup = write.finalAdmission?.()
        admissionReturned = true
      } catch (error) { this.fail(new ProviderWriteAdmissionError(error)); return }
      if (this.terminalError || this.closingError || write.pendingError) return
      write.writeAttempted = true
      const accepted = this.output.write(write.line, (error) => {
        if (write.terminal) return
        if (error) {
          this.fail(error)
          return
        }
        write.completed = true
        this.finish(write)
      })
      write.drained ||= accepted
      write.returned = true
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error('Native stream write failed'))
    } finally {
      try {
        if (admissionReturned) {
          cleanup?.()
          write.cleanupCompleted = true
        }
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error('Native write cleanup could not be confirmed'))
      } finally {
        write.inWriteCritical = false
        this.finish(write)
      }
    }
  }

  private finish(write: Write): void {
    if (write.terminal || write.inWriteCritical || this.active !== write) return
    const error = write.pendingError ?? this.terminalError
    if (error) { this.settle(write, 'rejected', error); return }
    if (write.returned && write.completed && write.drained && write.cleanupCompleted) this.settle(write, 'resolved')
  }

  private settle(write: Write, outcome: ProviderWriteSettlement['outcome'], error?: Error): void {
    if (write.terminal || write.inWriteCritical) return
    this.settling += 1
    write.terminal = true
    write.detachAbort?.()
    write.detachDrain?.()
    if (this.active === write) this.active = undefined
    const index = this.queue.indexOf(write)
    if (index !== -1) this.queue.splice(index, 1)
    this.bytes -= write.bytes
    try {
      try {
        write.onSettled?.({ outcome, writeAttempted: write.writeAttempted, cleanupCompleted: write.cleanupCompleted })
      } catch {
        error = new Error('Native input settlement could not be confirmed')
        this.fail(error)
      }
      if (outcome === 'rejected' || error || this.terminalError) write.reject(error ?? this.terminalError ?? this.errors.closed())
      else write.resolve()
    } finally {
      this.settling -= 1
      this.notifySettled()
    }
    this.flush()
  }

  private notifySettled(): void {
    const barrier = this.settlementBarrier
    if (!barrier) return
    if (this.terminalError) {
      this.settlementBarrier = undefined
      barrier.reject(new Error('Native stream writes did not settle safely'))
    } else if (!this.active && this.queue.length === 0 && this.settling === 0) {
      this.settlementBarrier = undefined
      barrier.resolve()
    }
  }

  private fail(error: Error): void {
    const notify = !this.failureNotified
    this.failureNotified = true
    this.close(error)
    if (notify) {
      try { this.onFailure(error) }
      catch { /* 队列已永久关闭，观察方异常不能跳过剩余清理。 */ }
    }
  }
}
