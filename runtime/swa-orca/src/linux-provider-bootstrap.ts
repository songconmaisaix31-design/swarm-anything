import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { extname, isAbsolute } from 'node:path'
import { performance } from 'node:perf_hooks'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { spawnProcess } from '@orca/process-host'
import type { PipedChildProcess } from '@orca/process-host/process-spec'
import { parseProcessTable } from '../../../third_party/orca-v1.4.230/src/main/pty-process-table-parser'
import { isSwaLinuxProcessAbsent, readSwaLinuxProcessIncarnation, requireSwaLinuxIncarnation } from '../../../third_party/orca-v1.4.230/src/main/daemon/swa-linux-process-identity'
import { loadSwaLinuxIsolationAPI, swaLinuxChildExitSchema, swaLinuxCustodySchema, swaLinuxParentMessageSchema, type SwaLinuxNativeState } from '../../../third_party/orca-v1.4.230/src/main/provider-process/swa-linux-provider-process-tree'

export async function runLinuxNativeCLI(): Promise<void> {
  if (process.platform !== 'linux' || process.argv.length !== 3 || !process.connected || !process.send || !process.disconnect) throw new Error('SWA Linux native bootstrap requires its real parent IPC')
  const send = process.send.bind(process), disconnect = process.disconnect.bind(process)
  const native = loadSwaLinuxIsolationAPI()
  if (native.enableSwaChildSubreaper() !== true) throw new Error('SWA Linux subreaper readback was not confirmed')
  const root = readSwaLinuxProcessIncarnation(process.pid), owner = readSwaLinuxProcessIncarnation(process.ppid)
  const launch = z.strictObject({ command: z.string().min(1), args: z.array(z.string()) }).parse(JSON.parse(process.argv[2]!))
  if (!isAbsolute(launch.command) || await realpath(launch.command) !== launch.command) throw new Error('SWA Linux native executable source changed')
  const script = ['.js', '.mjs', '.cjs'].includes(extname(launch.command))
  const program = script ? { kind: 'node-script' as const, program: await realpath(process.execPath), entry: launch.command } : { kind: 'executable' as const, program: launch.command }
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined && !/^(?:NODE_|SWA_)/i.test(key)) env[key] = value
  if (process.env.NODE_USE_SYSTEM_CA === '1') env.NODE_USE_SYSTEM_CA = '1'
  let binding: z.infer<typeof swaLinuxCustodySchema> | undefined
  let child: PipedChildProcess | undefined, nativeState: SwaLinuxNativeState | undefined
  let nativeClosed = false, stopping = false, forced = false, ownerLost = false, acknowledged = false
  let stopId: string | undefined, cleanup: Promise<void> | undefined, proofSent = false
  let invalidCustody = false
  let failureReported = false
  let resolveAdmission!: () => void, rejectAdmission!: (error: Error) => void
  const admitted = new Promise<void>((resolve, reject) => { resolveAdmission = resolve; rejectAdmission = reject })
  let resolveAcknowledgement!: () => void
  const acknowledgement = new Promise<void>(resolve => { resolveAcknowledgement = resolve })
  const fail = (error: unknown) => {
    process.stderr.write(JSON.stringify({ code: 'swa_linux_custody_unknown', message: error instanceof Error ? error.message : 'SWA Linux custody was not verified' }) + '\n')
    process.exitCode = 1
  }
  const transmit = (value: object) => new Promise<void>((resolve, reject) => {
    if (!process.connected || ownerLost) { reject(new Error('SWA Linux custody owner IPC was lost')); return }
    send(value, error => error ? reject(error) : resolve())
  })
  const checkSelf = () => { requireSwaLinuxIncarnation(root) }
  const scoped = () => {
    if (!binding || invalidCustody) throw new Error('SWA Linux custody has not been admitted or became invalid')
    checkSelf()
    return binding
  }
  const closeInput = () => { if (child && !child.stdin.destroyed) child.stdin.end() }
  const sleep = () => new Promise(resolve => setTimeout(resolve, 50))

  async function withDirectChild(pid: number, operation: (handle: object) => void) {
    const before = readSwaLinuxProcessIncarnation(pid)
    const handle = native.openSwaPidfd(pid)
    try { requireSwaLinuxIncarnation(before); operation(handle) }
    finally { native.closeSwaPidfd(handle) }
  }

  async function signalDirectChildren(signal: 'SIGTERM' | 'SIGKILL') {
    checkSelf()
    const output = execFileSync('/bin/ps', ['-eo', 'pid=,ppid=,pgid=,lstart='], { encoding: 'utf8', timeout: 5000, maxBuffer: 32 * 1024 * 1024, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' } })
    for (const row of parseProcessTable(output).filter(row => row.ppid === process.pid)) {
      if (isSwaLinuxProcessAbsent(row.pid)) continue
      try { await withDirectChild(row.pid, handle => { native.signalSwaPidfd(handle, signal); forced = true }) }
      catch (error) { if (!isSwaLinuxProcessAbsent(row.pid)) throw error }
    }
  }

  async function finishTree() {
    closeInput()
    const started = performance.now()
    let first: { state: 'no-children'; monotonic_ms: number } | undefined
    while (performance.now() - started < 7_000) {
      checkSelf()
      const observation = swaLinuxChildExitSchema.parse(native.observeSwaChildExit())
      if (observation.state === 'no-children' && nativeClosed && nativeState) {
        const current = { state: 'no-children' as const, monotonic_ms: performance.now() }
        if (first && current.monotonic_ms > first.monotonic_ms) {
          if (invalidCustody) throw new Error('SWA Linux custody became invalid before its full-tree proof')
          if (ownerLost || !process.connected) { clearInterval(ownerObserver); return }
          if (stopId) {
            requireSwaLinuxIncarnation(owner)
            proofSent = true
            await transmit({ type: 'swa_linux_fulltreeclosed', ...scoped(), stop_id: stopId, native_cli: nativeState, observations: [first, current], forced })
            await acknowledgement
            if (invalidCustody) throw new Error('SWA Linux custody became invalid while awaiting acknowledgement')
            if (ownerLost) { clearInterval(ownerObserver); return }
            if (!acknowledged) throw new Error('SWA Linux full-tree acknowledgement was not verified')
            clearInterval(ownerObserver)
            process.stdin.pause()
            if (process.connected) disconnect()
            return
          }
        }
        first = current
      } else {
        first = undefined
        if (observation.state === 'exited-child' && nativeClosed) {
          // libuv 已真实 close 唯一 native child，之后只精确回收收养 child。
          await withDirectChild(observation.pid, handle => { native.reapSwaAdoptedChild(handle) })
        }
        const elapsed = performance.now() - started
        if (elapsed >= 1_000) await signalDirectChildren(elapsed >= 4_000 ? 'SIGKILL' : 'SIGTERM')
      }
      await sleep()
    }
    throw new Error('SWA Linux descendant exit proof remains unknown')
  }

  const beginClose = (reason: 'native-exit' | 'native-close' | 'stdin-end') => {
    stopping = true
    closeInput()
    if (!binding) return
    try {
      if (!invalidCustody && !ownerLost && process.connected) void transmit({ type: 'swa_linux_stop_required', ...scoped(), reason, ...(nativeState ? { native_cli: nativeState } : {}) }).catch(fail)
    } catch (error) { fail(error); return }
    if (!cleanup) { cleanup = finishTree(); void cleanup.catch(fail) }
  }

  // 失联只触发本进程的归属收尾，不能替原调用者合成完成回执。
  const ownerObserver = setInterval(() => {
    try { requireSwaLinuxIncarnation(owner) }
    catch { ownerLost = true; if (!binding) rejectAdmission(new Error('SWA Linux owner exited before admission')); else beginClose('stdin-end') }
  }, 250)
  process.once('disconnect', () => { ownerLost = true; if (!binding) rejectAdmission(new Error('SWA Linux owner IPC closed before admission')); else beginClose('stdin-end'); resolveAcknowledgement() })
  process.stdin.once('end', () => beginClose('stdin-end'))
  process.stdin.resume()
  process.on('message', value => {
    try {
      if (invalidCustody) throw new Error('SWA Linux refuses messages after its custody became invalid')
      const received = swaLinuxParentMessageSchema.parse(value)
      if (!isDeepStrictEqual(received.owner, owner) || !isDeepStrictEqual(received.root, root)) throw new Error('SWA Linux parent admission incarnation changed')
      checkSelf()
      requireSwaLinuxIncarnation(owner)
      if (received.type === 'swa_linux_admit') {
        if (binding || process.ppid !== owner.pid) throw new Error('SWA Linux refuses repeated or foreign admission')
        binding = swaLinuxCustodySchema.parse({ custody_id: received.custody_id, owner: received.owner, root: received.root })
        void transmit({ type: 'swa_linux_admitted', ...binding, providerLinuxIsolationVersion: 1 }).then(resolveAdmission, rejectAdmission)
      } else {
        if (!binding || received.custody_id !== binding.custody_id) throw new Error('SWA Linux custody scope changed')
        if (received.type === 'swa_linux_stop') {
          if (stopId && stopId !== received.stop_id) throw new Error('SWA Linux stop identity changed')
          stopId = received.stop_id
          beginClose('stdin-end')
        } else {
          if (invalidCustody || !stopId || received.stop_id !== stopId || acknowledged || !proofSent) throw new Error('SWA Linux full-tree acknowledgement is stale')
          acknowledged = true
          resolveAcknowledgement()
        }
      }
    } catch (error) {
      invalidCustody = true
      if (child) { process.stdin.unpipe(child.stdin); process.stdin.pause(); closeInput() }
      rejectAdmission(error instanceof Error ? error : new Error('SWA Linux admission is invalid'))
      fail(error)
      if (binding && !failureReported && !ownerLost && process.connected) {
        failureReported = true
        void transmit({ type: 'swa_linux_custody_failed', ...binding, code: 'custody-invalid' }).catch(fail)
      }
      if (binding) beginClose('stdin-end')
    }
  })
  try {
    await admitted
    checkSelf()
    requireSwaLinuxIncarnation(owner)
    if (stopping) {
      nativeState = { state: 'not-created', reason: 'stopped-before-spawn', launch: program }
      nativeClosed = true
      beginClose('native-close')
    } else {
      process.stdin.pause()
      let spawnObserved = false, spawnFailure: Error & { code?: string } | undefined
      // 仅此专属 bootstrap 设置私有创建默认值，原生子进程继承；失败仍沿未知收尾。
      process.umask(0o077)
      if (process.umask() !== 0o077) throw new Error('SWA Linux native private creation mask was not confirmed')
      child = spawnProcess({ program: program.program, args: [...(program.kind === 'node-script' ? [program.entry] : []), ...launch.args], env, stdio: ['pipe', 'pipe', 'pipe'] })
      child.once('error', error => { spawnFailure = error; if (child?.pid !== undefined) fail(error) })
      child.once('spawn', () => {
        try {
          if (!child?.pid || spawnObserved) throw new Error('SWA Linux native spawn identity is ambiguous')
          spawnObserved = true
          nativeState = { state: 'created', identity: readSwaLinuxProcessIncarnation(child.pid), launch: program }
          void transmit({ type: 'swa_linux_native_started', ...scoped(), native_cli: nativeState }).catch(fail)
        } catch (error) { fail(error); beginClose('stdin-end') }
      })
      child.once('exit', () => beginClose('native-exit'))
      process.stdin.pipe(child.stdin)
      child.stdout.pipe(process.stdout, { end: false })
      child.stderr.pipe(process.stderr, { end: false })
      for (const stream of [child.stdin, child.stdout, child.stderr]) stream.once('error', error => { fail(error); beginClose('stdin-end') })
      child.once('close', (code, signal) => {
        process.stdin.unpipe(child!.stdin)
        process.stdin.pause()
        nativeClosed = true
        if (!spawnObserved && child!.pid === undefined && spawnFailure?.code) nativeState = { state: 'not-created', reason: 'spawn-error', spawn_error_code: spawnFailure.code, launch: program }
        if (!nativeState) { fail(new Error('SWA Linux native spawn settlement is unverified')); return }
        if (signal !== null || code === null) process.exitCode = 1
        else process.exitCode = code
        beginClose('native-close')
      })
    }
  } catch (error) { fail(error); if (binding) beginClose('stdin-end'); else clearInterval(ownerObserver) }
}
