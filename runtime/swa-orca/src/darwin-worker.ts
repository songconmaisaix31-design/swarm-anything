import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { PassThrough, type Readable, type Writable } from 'node:stream'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { createIncrementalNdjsonFramer } from '../../../third_party/orca-v1.4.230/src/shared/main-process-ndjson-framer'
import { readSwaDarwinProcess, swaDarwinProcessIdentitySchema } from '../../../third_party/orca-v1.4.230/src/main/daemon/swa-darwin-process-identity'

const identity = swaDarwinProcessIdentitySchema.options[0]
const event = z.object({ schema: z.literal('swa.darwin-worker.v1'), type: z.string() }).passthrough()
const startedSchema = event.extend({ type: z.literal('started'), identity, supervisor: identity })
const receiptSchema = event.extend({ type: z.literal('stop_result'), request_id: z.string(), accepted: z.boolean(), reason: z.string() })
const exitedSchema = event.extend({ type: z.literal('exited'), identity, tree: z.literal('unknown'), reaped: z.boolean(), code: z.number().int().nonnegative().nullable(), signal: z.string().regex(/^SIG[A-Z0-9]+$/).nullable() })
  .refine(value => !value.reaped || (value.code === null) !== (value.signal === null), 'Reaped child requires exactly one exit code or signal')

// 仅提供直接 child 的安全控制。此对象不产生 ProviderProcessTree 的完整释放证明。
export async function startDarwinWorker(input: { install: string; program: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv }) {
  if (process.platform !== 'darwin' || !isAbsolute(input.install) || realpathSync(input.install) !== input.install || !isAbsolute(input.program) || realpathSync(input.program) !== input.program || !isAbsolute(input.cwd)) throw new Error('Darwin Worker requires canonical explicit paths')
  const swa = join(input.install, 'swa')
  if (process.env.SWA_EXECUTABLE !== swa || process.env.SWA_INSTALL_ROOT !== input.install) throw new Error('Darwin Worker identity helper differs from the selected installation')
  const child = spawn(swa, ['darwin-worker-supervise', input.program, ...input.args], { cwd: input.cwd, env: input.env, stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'] })
  const events = child.stdio[3] as Readable, commands = child.stdio[4] as Writable
  const stdout = new PassThrough(), stderr = new PassThrough()
  child.stdout!.pipe(stdout); child.stderr!.pipe(stderr)
  let started: z.infer<typeof startedSchema> | undefined, final: z.infer<typeof exitedSchema> | undefined, failure: Error | undefined
  let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined, eventEnded = false, settled = false, stdoutEnded = false, stderrEnded = false
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined
  let resolveFinished!: (value: { supervisorExit: number | null; signal: NodeJS.Signals | null; final: z.infer<typeof exitedSchema> }) => void
  let rejectFinished!: (error: Error) => void
  const finished = new Promise<{ supervisorExit: number | null; signal: NodeJS.Signals | null; final: z.infer<typeof exitedSchema> }>((resolve, reject) => { resolveFinished = resolve; rejectFinished = reject })
  void finished.catch(() => undefined)
  let resolveReady!: (value: z.infer<typeof startedSchema>) => void, rejectReady!: (error: Error) => void
  const ready = new Promise<z.infer<typeof startedSchema>>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  const pending = new Map<string, { resolve: (value: z.infer<typeof receiptSchema>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  const usedRequests = new Set<string>()
  const settle = (error?: Error) => {
    if (settled) return
    settled = true
    clearTimeout(cleanupTimer)
    for (const waiting of pending.values()) { clearTimeout(waiting.timer); waiting.reject(error ?? new Error('Darwin Worker exited before its stop receipt')) }
    pending.clear()
    child.stdin!.destroy(); commands.destroy(); events.destroy()
    child.stdout!.destroy(); child.stderr!.destroy(); stdout.end(); stderr.end()
    child.unref()
    if (error) { error.cause = { identity: started?.identity, supervisor: started?.supervisor, supervisorExited: !!exit, final }; rejectReady(error); rejectFinished(error) }
    else resolveFinished({ supervisorExit: exit!.code, signal: exit!.signal, final: final! })
  }
  const finishIfObserved = () => {
    if (exit && eventEnded && (failure || stdoutEnded && stderrEnded)) settle(failure ?? (!final?.reaped ? new Error('Darwin Worker direct child release is unknown') : undefined))
  }
  const boundCleanup = () => { cleanupTimer ??= setTimeout(() => settle(failure ?? new Error('Darwin Worker cleanup is unknown after its observation deadline')), 5000) }
  const fail = (error: unknown) => {
    if (settled) return
    failure ??= error instanceof Error ? error : new Error('Darwin Worker observation failed')
    rejectReady(failure)
    for (const waiting of pending.values()) { clearTimeout(waiting.timer); waiting.reject(failure) }
    pending.clear()
    // 控制通道关闭通知原 supervisor 收尾，不向未知 PID 发信号。
    commands.end()
    child.stdin!.destroy()
    stdout.resume(); stderr.resume()
    boundCleanup()
    finishIfObserved()
  }
  const framer = createIncrementalNdjsonFramer(value => {
    try {
      const observed = event.parse(value)
      if (observed.type === 'started') {
        if (started) throw new Error('Repeated Darwin Worker startup')
        started = startedSchema.parse(observed)
        if (started.supervisor.pid !== child.pid || started.identity.ppid !== child.pid || started.supervisor.ppid !== process.pid) throw new Error('Darwin Worker parent binding changed')
        if (!isDeepStrictEqual(readSwaDarwinProcess(started.identity.pid), started.identity) || !isDeepStrictEqual(readSwaDarwinProcess(started.supervisor.pid), started.supervisor)) throw new Error('Darwin Worker kernel identity changed')
        resolveReady(started)
      } else if (observed.type === 'stop_result') {
        const receipt = receiptSchema.parse(observed), waiting = pending.get(receipt.request_id)
        if (!waiting) throw new Error('Darwin Worker stop receipt has no request')
        clearTimeout(waiting.timer); pending.delete(receipt.request_id); waiting.resolve(receipt)
      } else if (observed.type === 'exited') {
        if (final) throw new Error('Repeated Darwin Worker final event')
        final = exitedSchema.parse(observed)
        if (!started || !isDeepStrictEqual(final.identity, started.identity)) throw new Error('Darwin Worker final identity changed')
        if (!final.reaped) throw new Error('Darwin Worker direct child release is unknown')
        boundCleanup()
      } else if (observed.type === 'error') throw new Error('Darwin Worker supervisor reported unknown startup or observation')
      else throw new Error('Unknown Darwin Worker event')
    } catch (error) { fail(error) }
  }, () => fail(new Error('Darwin Worker control output is invalid')), { maxLineBytes: 256 * 1024 })
  events.setEncoding('utf8').on('data', chunk => framer.feed(String(chunk)))
  events.on('error', fail); commands.on('error', fail); child.on('error', fail)
  child.stdin!.on('error', fail); child.stdout!.on('error', fail); child.stderr!.on('error', fail)
  child.stdout!.once('end', () => { stdoutEnded = true; finishIfObserved() })
  child.stderr!.once('end', () => { stderrEnded = true; finishIfObserved() })
  events.once('end', () => {
    eventEnded = true
    if (framer.takeTail() || !final) fail(new Error('Darwin Worker final evidence is incomplete'))
    boundCleanup(); finishIfObserved()
  })
  child.once('exit', (code, signal) => { exit = { code, signal }; boundCleanup(); finishIfObserved() })
  const timer = setTimeout(() => fail(new Error('Darwin Worker startup timed out')), 10_000)
  try { await ready } catch (error) { await finished.catch(() => undefined); throw error } finally { clearTimeout(timer) }
  return {
    identity: started!.identity, supervisor: started!.supervisor, stdout, stderr, finished,
    write(bytes: string | Buffer) { if (failure || final) throw new Error('Darwin Worker is no longer writable'); return child.stdin!.write(bytes) },
    end() { child.stdin!.end() },
    disconnect() { commands.end(); child.stdin!.destroy(); stdout.resume(); stderr.resume(); boundCleanup() },
    stop(signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM', requestId = randomUUID(), expected = started!.identity) {
      if (settled || failure || final || usedRequests.has(requestId) || usedRequests.size >= 1024) return Promise.reject(new Error('Darwin Worker stop is unavailable'))
      usedRequests.add(requestId)
      return new Promise<z.infer<typeof receiptSchema>>((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Darwin Worker stop receipt unknown')) }, 5000)
        pending.set(requestId, { resolve, reject, timer })
        commands.write(JSON.stringify({ type: 'stop', request_id: requestId, expected, signal }) + '\n', error => { if (error) fail(error) })
      })
    }
  }
}
