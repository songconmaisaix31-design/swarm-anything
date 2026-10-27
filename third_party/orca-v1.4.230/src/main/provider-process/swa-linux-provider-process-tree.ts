import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { PipedChildProcess } from '@orca/process-host/process-spec'
import type { DescendantTreeVerdict } from '../pty-descendant-exit-verification'
import type { ProviderProcessTree } from './provider-process-close'
import { isSwaLinuxProcessAbsent, readSwaLinuxProcess, readSwaLinuxProcessIncarnation, requireSwaLinuxAncestor, requireSwaLinuxIncarnation, swaLinuxProcessIncarnationSchema, type SwaLinuxProcessIncarnation } from '../daemon/swa-linux-process-identity'

export const swaLinuxProgramSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('node-script'), program: z.string().min(1), entry: z.string().min(1) }),
  z.strictObject({ kind: z.literal('executable'), program: z.string().min(1) })
])
export const swaLinuxNativeStateSchema = z.union([
  z.strictObject({ state: z.literal('created'), identity: swaLinuxProcessIncarnationSchema, launch: swaLinuxProgramSchema }),
  z.strictObject({ state: z.literal('not-created'), reason: z.literal('spawn-error'), spawn_error_code: z.string().min(1), launch: swaLinuxProgramSchema }),
  z.strictObject({ state: z.literal('not-created'), reason: z.literal('stopped-before-spawn'), launch: swaLinuxProgramSchema })
])
export type SwaLinuxNativeState = z.infer<typeof swaLinuxNativeStateSchema>
export const swaLinuxCustodySchema = z.strictObject({ custody_id: z.uuid(), owner: swaLinuxProcessIncarnationSchema, root: swaLinuxProcessIncarnationSchema })
const custody = swaLinuxCustodySchema.shape
const stopped = { ...custody, stop_id: z.uuid() }
export const swaLinuxParentMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('swa_linux_admit'), ...custody }),
  z.strictObject({ type: z.literal('swa_linux_stop'), ...stopped }),
  z.strictObject({ type: z.literal('swa_linux_fulltree_ack'), ...stopped })
])
export const swaLinuxChildMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('swa_linux_admitted'), ...custody, providerLinuxIsolationVersion: z.literal(1) }),
  z.strictObject({ type: z.literal('swa_linux_native_started'), ...custody, native_cli: swaLinuxNativeStateSchema.options[0] }),
  z.strictObject({ type: z.literal('swa_linux_stop_required'), ...custody, reason: z.enum(['native-exit', 'native-close', 'stdin-end']), native_cli: swaLinuxNativeStateSchema.optional() }),
  z.strictObject({ type: z.literal('swa_linux_fulltreeclosed'), ...stopped, native_cli: swaLinuxNativeStateSchema, observations: z.tuple([z.strictObject({ state: z.literal('no-children'), monotonic_ms: z.number().nonnegative() }), z.strictObject({ state: z.literal('no-children'), monotonic_ms: z.number().nonnegative() })]), forced: z.boolean() }),
  z.strictObject({ type: z.literal('swa_linux_custody_failed'), ...custody, code: z.literal('custody-invalid') })
])
export const swaLinuxChildExitSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('no-children') }),
  z.strictObject({ state: z.literal('children-remain') }),
  z.strictObject({ state: z.literal('exited-child'), pid: z.number().int().positive(), code: z.number().int(), status: z.number().int() })
])
export type SwaLinuxIsolationAPI = {
  providerLinuxIsolationVersion: 1
  enableSwaChildSubreaper(): true
  observeSwaChildExit(): unknown
  openSwaPidfd(pid: number): object
  signalSwaPidfd(handle: object, signal: 'SIGTERM' | 'SIGKILL'): true
  reapSwaAdoptedChild(handle: object): true
  closeSwaPidfd(handle: object): true
}
const nativeFunction = z.custom<(...args: unknown[]) => unknown>(value => typeof value === 'function')
export function loadSwaLinuxIsolationAPI(): SwaLinuxIsolationAPI {
  if (process.platform !== 'linux') throw new Error('SWA Linux isolation is unavailable on this platform')
  const requireHere = createRequire(__filename)
  const utils = z.object({ loadNativeModule: nativeFunction }).parse(requireHere('node-pty/lib/utils'))
  const loaded = (utils.loadNativeModule as (name: string) => { module: unknown })('pty').module
  return z.object({ providerLinuxIsolationVersion: z.literal(1), enableSwaChildSubreaper: nativeFunction, observeSwaChildExit: nativeFunction, openSwaPidfd: nativeFunction, signalSwaPidfd: nativeFunction, reapSwaAdoptedChild: nativeFunction, closeSwaPidfd: nativeFunction }).parse(loaded) as unknown as SwaLinuxIsolationAPI
}

export type SwaLinuxProviderObservation = {
  platform: 'linux'
  owner: SwaLinuxProcessIncarnation
  root?: SwaLinuxProcessIncarnation
  custody_id: string
  custodyAdmitted: boolean
  nativeCLI?: SwaLinuxProcessIncarnation & z.infer<typeof swaLinuxProgramSchema>
  nativeState?: SwaLinuxNativeState
  fullTreeProof?: z.infer<typeof swaLinuxChildMessageSchema.options[3]>
}
export type SwaLinuxProviderFinalObservation = {
  platform: 'linux'
  observation: SwaLinuxProviderObservation
  acknowledgement_delivered: true
  root_exit_observed: true
  root_absent: true
}

export class SwaLinuxProviderProcessTree implements ProviderProcessTree {
  private readonly owner = readSwaLinuxProcessIncarnation(process.pid)
  private readonly custodyId = randomUUID()
  private child?: PipedChildProcess
  private root?: SwaLinuxProcessIncarnation
  private exitState?: () => { observed: boolean; processless: boolean }
  private admission?: Promise<void>
  private resolveReady?: () => void
  private rejectReady?: (error: Error) => void
  private admitted = false
  private nativeState?: SwaLinuxNativeState
  private proof?: z.infer<typeof swaLinuxChildMessageSchema.options[3]>
  private stopId?: string
  private closed = false
  private forced = false
  private verdict: DescendantTreeVerdict = 'unverifiable'
  private failure?: Error
  private ackDelivered = false
  private finalObservation?: SwaLinuxProviderFinalObservation

  constructor() { loadSwaLinuxIsolationAPI() }
  get treeVerdict(): DescendantTreeVerdict { return this.failure ? 'unverifiable' : this.verdict }
  get forcedReapAttempted(): boolean { return this.forced }

  bind(child: PipedChildProcess, exitState: () => { observed: boolean; processless: boolean }, requireNativeCLI = false) {
    if (this.child || !requireNativeCLI) throw new Error('SWA Linux custody requires one actual native CLI bootstrap')
    this.child = child
    this.exitState = exitState
    this.admission = new Promise<void>((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject })
    void this.admission.catch(() => undefined)
    child.on('message', this.receive)
    child.once('disconnect', () => { if (!this.ackDelivered) this.recordFailure(new Error('SWA Linux custody IPC closed before its confirmed acknowledgement')) })
    child.once('exit', () => { if (!this.nativeState || this.nativeState.state !== 'created') this.rejectReady?.(new Error('SWA native CLI did not start')) })
    try {
      if (!child.pid || !child.send || !child.connected || exitState().observed) throw new Error('SWA Linux bootstrap has no live parent IPC')
      this.root = readSwaLinuxProcessIncarnation(child.pid)
      const actual = readSwaLinuxProcess(child.pid)
      if (realpathSync(`/proc/${actual.pid}/exe`) !== realpathSync(process.execPath)) throw new Error('SWA bootstrap uses a different Node executable')
      requireSwaLinuxAncestor(actual, readSwaLinuxProcess(process.pid))
      this.send({ type: 'swa_linux_admit', ...this.binding() })
    } catch (error) { this.recordFailure(error) }
  }

  async ready() {
    if (!this.admission) throw new Error('SWA Linux custody has no child binding')
    let timer: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([this.admission, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('SWA native CLI custody readiness timed out')), 10_000) })]) }
    finally { clearTimeout(timer) }
  }

  closeBeforeSpawnFailure() {
    if (this.child) throw new Error('SWA cannot discard bound Linux custody')
    this.closed = true
  }

  private error(value: unknown) { return value instanceof Error ? value : new Error('SWA Linux custody is unverified') }
  private recordFailure(value: unknown) {
    this.failure ??= this.error(value)
    this.rejectReady?.(this.failure)
    if (this.child && !this.child.stdin.destroyed) this.child.stdin.end()
  }
  private binding() {
    if (!this.root) throw new Error('SWA Linux bootstrap identity is unavailable')
    return { custody_id: this.custodyId, owner: this.owner, root: this.root }
  }
  private send(value: z.infer<typeof swaLinuxParentMessageSchema>) {
    if (!this.child?.connected || !this.child.send) throw new Error('SWA Linux custody IPC is unavailable')
    this.child.send(value, error => {
      if (error) this.recordFailure(error)
      else if (value.type === 'swa_linux_fulltree_ack') this.ackDelivered = true
    })
  }
  private requestStop() {
    if (this.stopId) return
    requireSwaLinuxIncarnation(this.owner)
    requireSwaLinuxIncarnation(this.binding().root)
    this.stopId = randomUUID()
    this.send({ type: 'swa_linux_stop', ...this.binding(), stop_id: this.stopId })
  }
  private readonly receive = (value: unknown) => {
    try {
      if (this.failure) throw this.failure
      const received = swaLinuxChildMessageSchema.parse(value)
      const binding = this.binding()
      if (!isDeepStrictEqual({ custody_id: received.custody_id, owner: received.owner, root: received.root }, binding)) throw new Error('SWA Linux custody message changed its owner or incarnation')
      requireSwaLinuxIncarnation(this.owner)
      requireSwaLinuxIncarnation(binding.root)
      if (received.type === 'swa_linux_admitted') {
        if (this.admitted) throw new Error('SWA Linux custody was admitted twice')
        this.admitted = true
      } else if (received.type === 'swa_linux_native_started') {
        if (!this.admitted || this.nativeState) throw new Error('SWA Linux native CLI association is ambiguous')
        const actual = readSwaLinuxProcess(received.native_cli.identity.pid)
        requireSwaLinuxIncarnation(received.native_cli.identity)
        requireSwaLinuxAncestor(actual, readSwaLinuxProcess(binding.root.pid))
        if (realpathSync(`/proc/${actual.pid}/exe`) !== received.native_cli.launch.program) throw new Error('SWA native CLI executable differs from its admitted source')
        this.nativeState = received.native_cli
        this.resolveReady?.()
      } else if (received.type === 'swa_linux_stop_required') {
        if (!this.admitted) throw new Error('SWA Linux close arrived before admission')
        if (received.native_cli) {
          if (this.nativeState && !isDeepStrictEqual(this.nativeState, received.native_cli)) throw new Error('SWA native CLI identity changed at close')
          this.nativeState = received.native_cli
          if (this.nativeState.state === 'not-created') this.rejectReady?.(new Error('SWA native CLI spawn did not create a process'))
        }
        this.requestStop()
      } else if (received.type === 'swa_linux_fulltreeclosed') {
        if (!this.admitted || this.proof || received.stop_id !== this.stopId || !this.nativeState || !isDeepStrictEqual(received.native_cli, this.nativeState) || received.observations[1].monotonic_ms <= received.observations[0].monotonic_ms) throw new Error('SWA Linux full-tree proof is stale or incomplete')
        this.proof = received
        this.forced = received.forced
        this.send({ type: 'swa_linux_fulltree_ack', ...binding, stop_id: received.stop_id })
      } else this.recordFailure(new Error('The native bootstrap rejected its Linux custody'))
    } catch (error) { this.recordFailure(error) }
  }

  readObservation(): SwaLinuxProviderObservation {
    if (this.failure) throw this.failure
    if (this.closed && this.verdict !== 'exited') throw new Error('SWA Linux custody is closed without a tree proof')
    requireSwaLinuxIncarnation(this.owner)
    if (this.root && !this.exitState?.().observed) requireSwaLinuxIncarnation(this.root)
    return { platform: 'linux', owner: this.owner, root: this.root, custody_id: this.custodyId, custodyAdmitted: this.admitted, nativeState: this.nativeState, nativeCLI: this.nativeState?.state === 'created' ? { ...this.nativeState.identity, ...this.nativeState.launch } : undefined, fullTreeProof: this.proof }
  }
  requireOwnedExecutable(candidatePid: number, expectedProgram: string): SwaLinuxProcessIncarnation {
    if (this.failure) throw this.failure
    const root = this.root, native = this.nativeState, exit = this.exitState?.()
    if (this.closed || this.stopId || this.proof || !this.admitted || !root || !exit || exit.observed || exit.processless || native?.state !== 'created' || native.launch.kind !== 'executable') throw new Error('SWA Linux executable requires live native custody')
    if (candidatePid === root.pid || expectedProgram !== realpathSync(expectedProgram) || native.launch.program !== expectedProgram) throw new Error('SWA Linux executable differs from its admitted source')
    requireSwaLinuxIncarnation(this.owner)
    requireSwaLinuxIncarnation(root)
    requireSwaLinuxIncarnation(native.identity)
    const candidate = readSwaLinuxProcessIncarnation(candidatePid)
    const rootProcess = readSwaLinuxProcess(root.pid), nativeProcess = readSwaLinuxProcess(native.identity.pid), candidateProcess = readSwaLinuxProcess(candidatePid)
    if (realpathSync(`/proc/${root.pid}/exe`) !== realpathSync(process.execPath) || realpathSync(`/proc/${native.identity.pid}/exe`) !== expectedProgram || realpathSync(`/proc/${candidatePid}/exe`) !== expectedProgram) throw new Error('SWA Linux executable identity changed')
    requireSwaLinuxAncestor(nativeProcess, rootProcess)
    requireSwaLinuxAncestor(candidateProcess, nativeProcess)
    // 父链读取后再次核对原代际与程序；这些有界观察不构成原子快照。
    requireSwaLinuxIncarnation(this.owner)
    requireSwaLinuxIncarnation(root)
    requireSwaLinuxIncarnation(native.identity)
    requireSwaLinuxIncarnation(candidate)
    if (realpathSync(`/proc/${root.pid}/exe`) !== realpathSync(process.execPath) || realpathSync(`/proc/${native.identity.pid}/exe`) !== expectedProgram || realpathSync(`/proc/${candidatePid}/exe`) !== expectedProgram) throw new Error('SWA Linux executable identity changed')
    requireSwaLinuxIncarnation(this.owner)
    requireSwaLinuxIncarnation(root)
    requireSwaLinuxIncarnation(native.identity)
    requireSwaLinuxIncarnation(candidate)
    return candidate
  }
  readFinalObservation(): SwaLinuxProviderFinalObservation | null {
    return !this.failure && this.closed && this.ackDelivered && this.verdict === 'exited' && this.finalObservation ? structuredClone(this.finalObservation) : null
  }
  async capture() { if (this.failure) throw this.failure; if (!this.closed) this.readObservation() }
  refresh() { return this.capture() }
  releaseProcessless() {
    if (!this.child || !this.exitState?.().processless || this.child.pid !== undefined || this.root || this.admitted || this.nativeState) throw new Error('SWA processless cleanup requires a bootstrap that was never created')
    this.closed = true
  }
  async reap(): Promise<DescendantTreeVerdict> {
    if (this.closed) return this.treeVerdict
    if (!this.child || !this.exitState) throw new Error('SWA Linux custody has no actual child')
    if (this.exitState().processless) { this.releaseProcessless(); return 'unverifiable' }
    try {
      if (this.failure) throw this.failure
      if (!this.proof) this.requestStop()
      const deadline = performance.now() + 8_000
      while (performance.now() < deadline) {
        if (this.failure) throw this.failure
        requireSwaLinuxIncarnation(this.owner)
        if (!this.failure && this.ackDelivered && this.proof && this.root && this.exitState().observed && isSwaLinuxProcessAbsent(this.root.pid)) {
          if (this.failure || !this.ackDelivered) throw new Error('SWA Linux acknowledgement became unknown before release')
          this.verdict = 'exited'
          this.closed = true
          this.finalObservation = { platform: 'linux', observation: structuredClone(this.readObservation()), acknowledgement_delivered: true, root_exit_observed: true, root_absent: true }
          this.child.removeListener('message', this.receive)
          return this.verdict
        }
        if (this.root && !this.exitState().observed) requireSwaLinuxIncarnation(this.root)
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    } catch (error) { this.recordFailure(error) }
    return 'unverifiable'
  }
}
