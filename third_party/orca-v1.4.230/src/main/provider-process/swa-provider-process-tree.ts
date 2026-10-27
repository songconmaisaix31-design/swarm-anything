import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import type { PipedChildProcess } from '@orca/process-host/process-spec'
import { z } from 'zod'
import type { DescendantTreeVerdict } from '../pty-descendant-exit-verification'
import type { ProviderProcessTree } from './provider-process-close'
import { isWindowsProcessStartTimeAvailable, readWindowsProcessCreationTime, readWindowsProcessIdentityTableFresh } from '../windows/windows-process-table'
import { SwaLinuxProviderProcessTree } from './swa-linux-provider-process-tree'

const identitySchema = z.object({ pid: z.number().int().positive(), creationTimeMs: z.number().positive() })
const observationSchema = z.object({ ownerPid: z.number().int().positive(), rootPid: z.number().int().nonnegative(), rootCreationTimeMs: z.number().nonnegative(), assigned: z.boolean(), rootExited: z.boolean(), limitFlags: z.number().int(), members: z.array(identitySchema) })
const nativeProgramSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('node-script'), program: z.string().min(1), entry: z.string().min(1) }),
  z.strictObject({ kind: z.literal('executable'), program: z.string().min(1) })
])
type NativeCLIIdentity = z.infer<typeof identitySchema> & z.infer<typeof nativeProgramSchema>
type Observation = z.infer<typeof observationSchema> & { platform?: never; nativeCLI?: NativeCLIIdentity }
type Identity = z.infer<typeof identitySchema>
type IdentityObservation = { elapsedMs: number; identities: { expected: Identity; observed: unknown }[] }
export type SwaWindowsProviderFinalObservation = {
  platform: 'win32'
  root: Identity
  nativeCLI?: NativeCLIIdentity
  observations: { elapsedMs: number; observation: Observation }[]
  independentIdentityObservations: IdentityObservation[]
  forced: boolean
}
type JobAPI = {
  providerJobIsolationVersion: 1
  createProviderJob(): object
  assignProviderJob(job: object, pid: number, creationTimeMs: number): true
  queryProviderJob(job: object): unknown
  terminateProviderJob(job: object): true
  closeProviderJob(job: object): true
}
const nativeFunction = z.custom<(...args: unknown[]) => unknown>(value => typeof value === 'function')
const requireHere = createRequire(__filename)

class SwaWindowsProviderProcessTree implements ProviderProcessTree {
  private readonly native: JobAPI
  private readonly job: object
  private child?: PipedChildProcess
  private root?: Identity
  private assignmentWitness = false
  private exitState?: () => { observed: boolean; processless: boolean }
  private admission?: Promise<void>
  private closed = false
  private verdict: DescendantTreeVerdict = 'unverifiable'
  private readonly identities = new Map<string, Identity>()
  private readonly observations: { elapsedMs: number; observation: Observation }[] = []
  private forced = false
  private nativeCLI?: NativeCLIIdentity
  private requiresNativeCLI = false
  private nativeCLIReady?: Promise<void>
  private resolveNativeCLI?: () => void
  private rejectNativeCLI?: (error: Error) => void
  private finalObservation?: SwaWindowsProviderFinalObservation

  constructor() {
    if (process.platform !== 'win32' || !isWindowsProcessStartTimeAvailable()) throw new Error('SWA requires the compiled Windows process identity capability')
    const utils = z.object({ loadNativeModule: nativeFunction }).parse(requireHere('node-pty/lib/utils'))
    const loaded = (utils.loadNativeModule as (name: string) => { module: unknown })('conpty').module
    this.native = z.object({ providerJobIsolationVersion: z.literal(1), createProviderJob: nativeFunction, assignProviderJob: nativeFunction, queryProviderJob: nativeFunction, terminateProviderJob: nativeFunction, closeProviderJob: nativeFunction }).parse(loaded) as unknown as JobAPI
    this.job = this.native.createProviderJob()
    const initial = this.observe()
    if (initial.assigned || initial.rootPid !== 0 || initial.members.length) throw new Error('SWA Job was not freshly created for this Worker')
  }

  get treeVerdict(): DescendantTreeVerdict { return this.verdict }
  get forcedReapAttempted(): boolean { return this.forced }

  bind(child: PipedChildProcess, exitState: () => { observed: boolean; processless: boolean }, requireNativeCLI = false): void {
    if (this.child) throw new Error('SWA Job refuses a second child')
    this.child = child
    this.exitState = exitState
    this.requiresNativeCLI = requireNativeCLI
    if (requireNativeCLI) {
      this.nativeCLIReady = new Promise<void>((resolve, reject) => { this.resolveNativeCLI = resolve; this.rejectNativeCLI = reject })
      void this.nativeCLIReady.catch(() => undefined)
      child.on('message', this.observeNativeCLI)
    }
    this.admission = this.admit(child)
    void this.admission.catch(error => {
      process.stderr.write(JSON.stringify({ type: 'swa_provider_job_admission_failed', pid: child.pid, message: error instanceof Error ? error.message : 'SWA admission failed' }) + '\n')
      if (child.pid !== undefined && !child.stdin.destroyed) child.stdin.end()
    })
  }

  async ready(): Promise<void> {
    if (!this.admission) throw new Error('SWA Job has no actual child binding')
    await this.admission
  }

  closeBeforeSpawnFailure(): void {
    if (this.child) throw new Error('SWA cannot discard a bound Job')
    this.native.closeProviderJob(this.job)
    this.closed = true
  }

  private async admit(child: PipedChildProcess): Promise<void> {
    if (!child.pid || !child.send || !child.connected) throw new Error('SWA provider child has no actual Node IPC channel')
    if (child.exitCode !== null || child.signalCode !== null || this.exitState?.().observed) throw new Error('SWA actual provider root exited before its Job binding')
    const creationTimeMs = readWindowsProcessCreationTime(child.pid)
    if (!creationTimeMs) throw new Error('SWA provider root creation identity unavailable')
    this.root = { pid: child.pid, creationTimeMs }
    this.identities.set(`${child.pid}:${creationTimeMs}`, this.root)
    this.native.assignProviderJob(this.job, child.pid, creationTimeMs)
    const observed = this.observe()
    if (!observed.assigned || observed.rootPid !== child.pid || observed.rootCreationTimeMs !== creationTimeMs || !observed.members.some(row => row.pid === child.pid && row.creationTimeMs === creationTimeMs)) throw new Error('SWA actual Job root membership unconfirmed before native CLI load')
    this.assignmentWitness = true
    const pid = child.pid
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('SWA provider bootstrap admission was not observed')), 10_000)
      const onExit = () => finish(new Error('SWA provider bootstrap exited before admission'))
      const onError = (error: Error) => finish(error)
      const onMessage = (value: unknown) => {
        const received = z.object({ type: z.literal('swa_job_bootstrap_admitted'), pid: z.literal(pid), parentPid: z.literal(process.pid), creationTimeMs: z.literal(creationTimeMs) }).safeParse(value)
        if (!received.success) return finish(new Error('SWA bootstrap returned a different actual identity'))
        finish()
      }
      const finish = (error?: Error) => {
        clearTimeout(timer)
        child.removeListener('message', onMessage)
        child.removeListener('exit', onExit)
        child.removeListener('error', onError)
        if (error) reject(error); else resolve()
      }
      child.once('message', onMessage)
      child.once('exit', onExit)
      child.once('error', onError)
      child.send!({ type: 'swa_job_admitted', pid, parentPid: process.pid, creationTimeMs }, error => { if (error) finish(error) })
    })
    process.stderr.write(JSON.stringify({ type: 'swa_provider_job_admission', root: this.root, observation: observed }) + '\n')
    if (this.nativeCLIReady) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([this.nativeCLIReady, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('The actual native CLI did not prove its Job membership')), 10_000) })])
      } finally { clearTimeout(timer) }
    }
  }

  private readonly observeNativeCLI = (value: unknown): void => {
    if (!value || typeof value !== 'object' || !('type' in value) || value.type !== 'swa_native_cli_started') return
    try {
      if (!this.requiresNativeCLI || this.nativeCLI || !this.child?.pid || !this.root) throw new Error('The actual native CLI launch association is ambiguous')
      const received = z.intersection(z.object({ type: z.literal('swa_native_cli_started'), rootPid: z.literal(this.child.pid), pid: z.number().int().positive() }), z.union([
        nativeProgramSchema.options[0].extend({ type: z.literal('swa_native_cli_started'), rootPid: z.literal(this.child.pid), pid: z.number().int().positive() }),
        nativeProgramSchema.options[1].extend({ type: z.literal('swa_native_cli_started'), rootPid: z.literal(this.child.pid), pid: z.number().int().positive() })
      ])).parse(value)
      const creationTimeMs = readWindowsProcessCreationTime(received.pid)
      if (!creationTimeMs || received.pid === this.root.pid) throw new Error('The actual native CLI creation identity is unavailable')
      const observation = this.observe()
      if (!observation.assigned || !observation.members.some(member => member.pid === received.pid && member.creationTimeMs === creationTimeMs)) throw new Error('The actual native CLI is outside its owning Job')
      this.nativeCLI = { pid: received.pid, creationTimeMs, ...nativeProgramSchema.parse('entry' in received ? { kind: received.kind, program: received.program, entry: received.entry } : { kind: received.kind, program: received.program }) }
      process.stderr.write(JSON.stringify({ type: 'swa_native_cli_job_member', managedRoot: this.root, nativeCLI: this.nativeCLI }) + '\n')
      this.resolveNativeCLI?.()
    } catch (error) { this.rejectNativeCLI?.(error instanceof Error ? error : new Error('Native CLI Job membership is unverified')) }
  }

  private observe(): Observation {
    if (this.closed) throw new Error('SWA refuses a closed Job handle')
    const value: Observation = observationSchema.parse(this.native.queryProviderJob(this.job))
    if (this.nativeCLI) value.nativeCLI = this.nativeCLI
    if (value.ownerPid !== process.pid || this.root && value.rootPid !== 0 && (value.rootPid !== this.root.pid || value.rootCreationTimeMs !== this.root.creationTimeMs)) throw new Error('SWA Job binding changed')
    for (const member of value.members) this.identities.set(`${member.pid}:${member.creationTimeMs}`, member)
    this.observations.push({ elapsedMs: performance.now(), observation: value })
    if (this.observations.length > 32) this.observations.shift()
    return value
  }

  async capture(): Promise<void> {
    if (this.closed && this.verdict === 'exited') return
    this.observe()
  }

  refresh(): Promise<void> { return this.capture() }

  readObservation(): Observation { return this.observe() }

  requireOwnedExecutable(candidatePid: number, expectedProgram: string): Identity & { platform: 'win32' } {
    const root = this.root, native = this.nativeCLI, exit = this.exitState?.()
    if (this.closed || !this.assignmentWitness || !root || !exit || exit.observed || exit.processless || native?.kind !== 'executable') throw new Error('SWA executable requires a live native Job')
    if (candidatePid === root.pid || native.program.toLowerCase() !== expectedProgram.toLowerCase()) throw new Error('SWA executable differs from its admitted source')
    const creationTimeMs = readWindowsProcessCreationTime(candidatePid)
    if (!creationTimeMs) throw new Error('SWA executable creation identity is unavailable')
    const candidate = { pid: candidatePid, creationTimeMs }
    const requireMembers = (observation: Observation) => {
      if (!observation.assigned || observation.rootExited || ![root, native, candidate].every(expected => observation.members.some(member => member.pid === expected.pid && member.creationTimeMs === expected.creationTimeMs))) throw new Error('SWA executable is outside its live owning Job')
      if (![root, native, candidate].every(expected => readWindowsProcessCreationTime(expected.pid) === expected.creationTimeMs)) throw new Error('SWA executable creation identity changed')
    }
    requireMembers(this.observe())
    // Windows 沿用 Job 成员与 birth 证据；不把它表述为候选进程程序路径查询。
    requireMembers(this.observe())
    return { platform: 'win32', ...candidate }
  }

  readFinalObservation(): SwaWindowsProviderFinalObservation | null {
    return this.closed && this.verdict === 'exited' && this.finalObservation ? structuredClone(this.finalObservation) : null
  }

  releaseProcessless(): void {
    if (!this.child || !this.exitState?.().processless || this.child.pid !== undefined || this.root || this.identities.size) throw new Error('SWA processless cleanup requires actual evidence that no process was created')
    if (this.closed) return
    const observed = this.observe()
    if (observed.assigned || observed.rootPid !== 0 || observed.members.length) throw new Error('SWA refuses processless cleanup of a bound Job')
    this.native.closeProviderJob(this.job)
    this.closed = true
    process.stderr.write(JSON.stringify({ type: 'swa_processless_spawn_failure', observation: observed, treeProof: null }) + '\n')
  }

  async reap(): Promise<DescendantTreeVerdict> {
    if (this.closed) return this.verdict
    if (!this.child || !this.exitState) throw new Error('SWA Job root observation unavailable')
    if (this.exitState().processless) {
      this.releaseProcessless()
      return 'unverifiable'
    }
    if (!this.assignmentWitness) {
      process.stderr.write(JSON.stringify({ type: 'swa_provider_job_exit_unknown', root: this.root, reason: 'successful_assignment_and_root_membership_not_observed' }) + '\n')
      return 'unverifiable'
    }
    const first = this.observe()
    if (first.members.length) {
      if (!first.assigned) throw new Error('SWA refuses termination without its actual Job assignment')
      this.forced = true
      this.native.terminateProviderJob(this.job)
    }
    const deadline = performance.now() + 2_000
    let consecutive = 0
    const independent: IdentityObservation[] = []
    while (performance.now() < deadline) {
      const current = this.observe()
      const state = this.exitState()
      const rootGone = state.observed && current.assigned && current.rootExited && this.root !== undefined && this.assignmentWitness
      const rows = await readWindowsProcessIdentityTableFresh()
      const identitiesGone = [...this.identities.values()].every(old => {
        const row = rows.find(item => item.pid === old.pid)
        return row === undefined || row.creationTimeMs !== undefined && row.creationTimeMs !== old.creationTimeMs
      })
      consecutive = rootGone && current.members.length === 0 && identitiesGone ? consecutive + 1 : 0
      if (consecutive) independent.push({ elapsedMs: performance.now(), identities: [...this.identities.values()].map(old => ({ expected: old, observed: rows.find(row => row.pid === old.pid) ?? null })) })
      else independent.length = 0
      if (consecutive >= 2) {
        if (!this.root) throw new Error('SWA completed Job has no original root identity')
        this.native.closeProviderJob(this.job)
        this.closed = true
        this.verdict = 'exited'
        this.finalObservation = structuredClone({ platform: 'win32', root: this.root, ...(this.nativeCLI ? { nativeCLI: this.nativeCLI } : {}), observations: this.observations.slice(-2), independentIdentityObservations: independent.slice(-2), forced: this.forced })
        process.stderr.write(JSON.stringify({ type: 'swa_provider_job_tree_exited', root: this.root, processless: state.processless, observations: this.observations.slice(-2), independentIdentityObservations: independent.slice(-2), forced: this.forced }) + '\n')
        return this.verdict
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    this.verdict = 'unverifiable'
    process.stderr.write(JSON.stringify({ type: 'swa_provider_job_exit_unknown', root: this.root, observations: this.observations.slice(-2) }) + '\n')
    return this.verdict
  }
}

export class SwaProviderProcessTree implements ProviderProcessTree {
  private readonly implementation = process.platform === 'linux' ? new SwaLinuxProviderProcessTree() : new SwaWindowsProviderProcessTree()
  get treeVerdict() { return this.implementation.treeVerdict }
  get forcedReapAttempted() { return this.implementation.forcedReapAttempted }
  bind(child: PipedChildProcess, exitState: () => { observed: boolean; processless: boolean }, requireNativeCLI = false) { this.implementation.bind(child, exitState, requireNativeCLI) }
  ready() { return this.implementation.ready() }
  closeBeforeSpawnFailure() { this.implementation.closeBeforeSpawnFailure() }
  capture() { return this.implementation.capture() }
  refresh() { return this.implementation.refresh() }
  readObservation() { return this.implementation.readObservation() }
  requireOwnedExecutable(candidatePid: number, expectedProgram: string) { return this.implementation.requireOwnedExecutable(candidatePid, expectedProgram) }
  readFinalObservation() { return this.implementation.readFinalObservation() }
  releaseProcessless() { this.implementation.releaseProcessless() }
  reap() { return this.implementation.reap() }
}
