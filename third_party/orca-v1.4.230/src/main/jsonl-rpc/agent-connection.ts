import type { PipedProcessSpawner } from '@orca/process-host/process-spec'
import { spawnProcess } from '@orca/process-host'
import {
  spawnManagedProviderProcess,
  type ManagedProviderProcess,
  type ProviderProcessExit
} from '../provider-process/managed-provider-process'
import type { PiPolicyRequestOptions, ProviderProcessLaunch, SwaPiSessionPolicy } from '../provider-process/provider-process-launch'
import type { ProviderProcessCloseResult } from '../provider-process/provider-process-close'
import type { ProviderAcquisitionConnection } from '../provider-process/provider-acquisition-starts'
import type { ProviderWriteAdmission } from '../provider-process/provider-stdio-write-queue'
import {
  JsonlRpcPeer,
  JsonlRpcStreamClosedError,
  type JsonlRpcPeerHandlers,
  type JsonlRpcRecord
} from './peer'
import { resolveJsonlRpcPeerOptions, type JsonlRpcPeerOptions } from './peer-limits'
import { SwaProviderProcessTree } from '../provider-process/swa-provider-process-tree'
import { appendFileSync, realpathSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { z } from 'zod'

export type JsonlRpcAgentConnectionOptions = JsonlRpcPeerHandlers & {
  allowedCommands?: ReadonlySet<string>
  peer?: JsonlRpcPeerOptions
  onExit?: (error: Error, context: { expected: boolean; exit: ProviderProcessExit }) => void | Promise<void>
  /** 原生投影先落盘；此处不得生成依赖退出发布的生命周期尾部。 */
  beforeExitPublication?: () => Promise<void>
  /** 同一真实资源在任何进程效果前登记，已取消的构造不得继续 spawn。 */
  onSpawnedProcess?: (resource: ProviderAcquisitionConnection) => void
  /** Any stdout or stderr chunk from the child. */
  onOutput?: () => void
}

/** The owning runtime keeps process exit evidence separate from transport closure. */
export class JsonlRpcAgentConnection {
  private managed!: ManagedProviderProcess
  private peer!: JsonlRpcPeer
  private readonly ownedTree?: SwaProviderProcessTree
  private readonly providerEventFile?: string
  private providerEventIdentity?: { pid: number; creationTimeMs: number }
  private verifiedExit = false
  private readonly verifiedExitListeners = new Set<() => void>()
  private closing = false
  private finishObservedExit?: () => void
  private streamExitTimer?: ReturnType<typeof setTimeout>
  private readonly strictPolicy?: SwaPiSessionPolicy
  private strictFailure?: Error
  private strictCloseResult: ProviderProcessCloseResult | null = null
  private strictCloseCompletion?: Promise<ProviderProcessCloseResult>
  private spawnAttempted = false
  private noSpawnConfirmed = false
  private observedExit?: ProviderProcessExit
  private resolveConstruction!: () => void
  private readonly construction = new Promise<void>(resolve => { this.resolveConstruction = resolve })

  constructor(
    launch: ProviderProcessLaunch,
    private readonly options: JsonlRpcAgentConnectionOptions = {},
    spawnImpl: PipedProcessSpawner = spawnProcess
  ) {
    const peerOptions = resolveJsonlRpcPeerOptions(options.peer)
    this.strictPolicy = launch.swaPiPolicy
    if ((launch.swaEventDirectory || launch.env?.SWA_WORKER_ROOT) && !launch.swaJobIPC) throw new Error('SWA refuses a native launch without parent Job admission')
    if (launch.swaJobIPC) this.ownedTree = new SwaProviderProcessTree()
    if (this.strictPolicy) {
      this.constructStrict(launch, peerOptions, spawnImpl)
      return
    }
    try {
      const eventDirectory = launch.swaEventDirectory ?? launch.env?.SWA_WORKER_ROOT
      if (eventDirectory) {
        if (!isAbsolute(eventDirectory)) throw new Error('SWA provider event directory must be absolute')
        const root = realpathSync.native(eventDirectory)
        if (root.toLowerCase() !== eventDirectory.toLowerCase()) throw new Error('SWA provider event directory changed its real identity')
        this.providerEventFile = join(root, 'provider-events.ndjson')
        writeFileSync(this.providerEventFile, '', { flag: 'wx', mode: 0o600 })
      }
      this.managed = spawnManagedProviderProcess(launch, {
        spawnImpl,
        site: 'jsonl-rpc-agent-teardown',
        ...(this.ownedTree ? { acceptClose: result => result.root === 'exited' && (result.tree === 'exited' || this.managed.processless) } : {}),
        ...(options.onOutput ? { onOutput: options.onOutput } : {})
      })
    } catch (error) {
      this.ownedTree?.closeBeforeSpawnFailure()
      throw error
    }
    const managed = this.managed
    this.ownedTree?.bind(managed.child, () => ({ observed: managed.rootExitObserved, processless: managed.processless }), launch.swaEventDirectory !== undefined)
    this.peer = new JsonlRpcPeer(
      managed.child.stdout,
      managed.child.stdin,
      {
        ...options,
        onRecord: record => {
          this.observeProviderRecord(record)
          options.onRecord?.(record)
        },
        onClose: (error) => {
          const fail = (): void => {
            if (this.closing || managed.rootVerdict === 'exited') {
              return
            }
            void managed.close(this.ownedTree).then(
              (result) => {
                if (result.root !== 'exited' || this.ownedTree && result.tree !== 'exited') {
                  this.diagnose('Agent exit was not proven after RPC failure')
                }
              },
              () => this.diagnose('Agent cleanup failed after RPC failure')
            )
            options.onClose?.(error)
          }
          if (
            error instanceof JsonlRpcStreamClosedError &&
            !this.closing &&
            managed.rootVerdict !== 'exited'
          ) {
            // EOF often precedes the exit carrying an import/startup failure's code.
            this.streamExitTimer = setTimeout(fail, 250)
            this.streamExitTimer.unref()
          } else {
            fail()
          }
        }
      },
      peerOptions
    )
    managed.child.on('error', this.onError)
    managed.child.stderr.on('error', this.onError)
    managed.onExit((exit) => {
      clearTimeout(this.streamExitTimer)
      const error = new Error(
        exit.processless
          ? 'Agent process could not start'
          : `Agent process exited (code ${exit.code ?? 'none'}, signal ${exit.signal ?? 'none'})`
      )
      this.peer.finishOnInputEnd(error)
      const stdout = managed.child.stdout
      let finished = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const finish = (): void => {
        if (finished) {
          return
        }
        finished = true
        clearTimeout(timer)
        stdout.removeListener('end', finish)
        stdout.removeListener('close', finish)
        this.finishObservedExit = undefined
        this.peer.close(error)
        managed.child.removeListener('error', this.onError)
        const publish = (): void => {
          this.verifiedExit = true
          for (const listener of this.verifiedExitListeners) listener()
          this.verifiedExitListeners.clear()
          try { options.onExit?.(error, { expected: this.closing, exit }) }
          catch { this.diagnose('Agent exit observer failed') }
        }
        if (!this.ownedTree) publish()
        else void managed.close(this.ownedTree).then(result => {
          if (result.root === 'exited' && (result.tree === 'exited' || managed.processless)) publish()
          else this.diagnose('SWA SDK root exited while complete Job exit remains unknown')
        }, () => this.diagnose('SWA SDK Job exit query failed; retain its session and resources'))
      }
      this.finishObservedExit = finish
      if (
        this.closing ||
        exit.processless ||
        this.peer.closed ||
        stdout.destroyed ||
        stdout.readableEnded
      ) {
        finish()
      } else {
        stdout.once('end', finish)
        stdout.once('close', finish)
        // A descendant can inherit stdout after the provider root exits.
        timer = setTimeout(finish, 1_000)
        timer.unref()
      }
    })
  }

  get pid(): number | undefined {
    return this.managed?.child.pid
  }
  get closed(): boolean {
    return this.peer.closed
  }
  get rootVerdict(): ManagedProviderProcess['rootVerdict'] {
    if (this.strictPolicy) return this.verifiedExit ? 'exited' : this.managed?.rootVerdict === 'live' ? 'live' : 'unverifiable'
    if (this.ownedTree && this.managed.rootVerdict === 'exited' && !this.managed.processless && this.ownedTree.treeVerdict !== 'exited') return 'unverifiable'
    return this.managed.rootVerdict
  }
  get processless(): boolean {
    return this.noSpawnConfirmed || this.managed?.processless === true
  }
  get lastCloseResult(): ManagedProviderProcess['lastCloseResult'] {
    if (this.strictPolicy) return this.strictCloseResult
    return this.managed.lastCloseResult
  }

  onExit(listener: () => void): void {
    if (!this.ownedTree) this.managed.onExit(listener)
    else if (this.verifiedExit) listener()
    else this.verifiedExitListeners.add(listener)
  }

  async request(
    command: string,
    params: Record<string, unknown> = {},
    options: PiPolicyRequestOptions = {}
  ): Promise<unknown> {
    if (this.options.allowedCommands && !this.options.allowedCommands.has(command)) {
      return Promise.reject(new Error(this.strictPolicy ? 'native_pi_command_unapproved' : `SWA refuses Pi RPC command: ${command}`))
    }
    await this.ownedTree?.ready()
    return this.peer.request(command, params, options)
  }

  async send(record: JsonlRpcRecord, beforeWrite?: ProviderWriteAdmission): Promise<void> {
    if (this.options.allowedCommands && !this.options.allowedCommands.has(record.type)) {
      return Promise.reject(new Error(this.strictPolicy ? 'native_pi_command_unapproved' : `SWA refuses Pi RPC command: ${record.type}`))
    }
    await this.ownedTree?.ready()
    return this.peer.send(record, undefined, beforeWrite)
  }

  observeOwnedJob() { return this.ownedTree?.readObservation() }

  pauseReading(): void {
    this.peer.pauseReading()
  }

  resumeReading(): void {
    this.peer.resumeReading()
  }

  /** Stop sends the dialect's abort first, then closes this connection through the supervisor. */
  close(error?: Error): Promise<ProviderProcessCloseResult> {
    this.closing = true
    if (this.strictPolicy) return this.finishStrictExit()
    clearTimeout(this.streamExitTimer)
    this.finishObservedExit?.()
    this.peer.close(error)
    return this.managed.close(this.ownedTree)
  }

  private readonly onError = (error: Error): void => {
    if (this.strictPolicy) {
      this.failStrict('stdout')
      this.peer?.close(new Error('native_pi_stream_unverifiable'))
      void this.finishStrictExit()
    } else this.peer.close(error)
  }

  private constructStrict(launch: ProviderProcessLaunch, peerOptions: JsonlRpcPeerOptions, spawnImpl: PipedProcessSpawner): void {
    const policy = this.strictPolicy!
    try {
      if (!this.ownedTree || !this.options.onSpawnedProcess || this.options.swaPiPolicy && this.options.swaPiPolicy !== policy) throw new Error('native_pi_custody_missing')
      const resource: ProviderAcquisitionConnection = {
        close: async () => {
          const result = await this.close()
          return this.noSpawnConfirmed ? true : result
        },
        onExit: listener => this.onExit(listener)
      }
      this.options.onSpawnedProcess(resource)
      if (this.closing) throw new Error('native_pi_cancelled_before_spawn')
      // 最终 sealed 参数与真实 spawn 相邻，中间没有 await 或其它可改来源的效果。
      policy.assertSpawn(launch)
      this.spawnAttempted = true
      this.managed = spawnManagedProviderProcess(launch, {
        spawnImpl,
        site: 'swa-pi-agent-teardown',
        inheritedEnv: {},
        acceptClose: result => result.root === 'exited' && (result.tree === 'exited' || this.managed.processless),
        onStderrLine: () => true,
        ...(this.options.onOutput ? { onOutput: this.options.onOutput } : {})
      })
      const managed = this.managed
      this.ownedTree.bind(managed.child, () => ({ observed: managed.rootExitObserved, processless: managed.processless }), true)
      policy.attach(this.ownedTree)
      this.peer = new JsonlRpcPeer(managed.child.stdout, managed.child.stdin, {
        ...this.options,
        swaPiPolicy: policy,
        onRecord: (record, context) => this.options.onRecord?.(record, context),
        onClose: () => {
          this.failStrict('stdout')
          try { this.options.onClose?.(new Error('native_pi_transport_unverifiable')) } catch { this.failStrict('persistence') }
          void this.finishStrictExit()
        }
      }, { ...peerOptions, maxLineBytes: 8 * 1024 * 1024 })
      managed.child.on('error', this.onError)
      managed.child.stderr.on('error', this.onError)
      managed.onExit(exit => {
        this.observedExit = exit
        void this.finishStrictExit()
      })
    } catch {
      this.failStrict('custody')
      if (!this.spawnAttempted) {
        try { this.ownedTree?.closeBeforeSpawnFailure(); this.noSpawnConfirmed = true } catch { /* 空资源关闭未获确认仍保持未知。 */ }
      }
      throw new Error('native_pi_construction_unverifiable')
    } finally {
      this.resolveConstruction()
    }
  }

  private failStrict(stage: 'stdout' | 'custody' | 'persistence'): void {
    this.strictFailure ??= new Error('native_pi_close_unverifiable')
    // 策略先锁存永久失败后可能抛出；清理仍必须继续消费同一实际资源。
    try { this.strictPolicy?.failure({ stage, code: stage === 'stdout' ? 'stdout_incomplete' : stage === 'custody' ? 'custody_unverifiable' : 'trace_unavailable' }) } catch { /* 原失败不被后续清理覆盖。 */ }
  }

  private finishStrictExit(): Promise<ProviderProcessCloseResult> {
    if (this.strictCloseCompletion) return this.strictCloseCompletion
    this.strictCloseCompletion = this.settleStrictExit().catch(() => {
      this.failStrict('custody')
      this.strictCloseResult = { root: 'unverifiable', tree: 'unverifiable' }
      return this.strictCloseResult
    })
    return this.strictCloseCompletion
  }

  private async settleStrictExit(): Promise<ProviderProcessCloseResult> {
    await this.construction
    if (!this.managed) {
      if (this.spawnAttempted) throw new Error('native_pi_spawn_outcome_unknown')
      if (!this.noSpawnConfirmed) {
        this.ownedTree?.closeBeforeSpawnFailure()
        this.noSpawnConfirmed = true
      }
      this.strictCloseResult = { root: 'exited', tree: null }
      this.publishStrictExit()
      return this.strictCloseResult
    }
    const managed = this.managed
    this.peer?.beginClose()
    // 先完成已经实际调用 write 的同 entry 回调/cleanup，才能关闭 stdin。
    if (this.peer) {
      try { await this.strictDeadline(this.peer.waitForWrites()) } catch { this.failStrict('persistence'); this.peer.close(new Error('native_pi_write_unsettled')) }
    }
    const result = await managed.close(this.ownedTree)
    if (result.root !== 'exited' || !managed.processless && result.tree !== 'exited') throw new Error('native_pi_tree_unverifiable')
    const owned = this.strictPolicy!.hasRecordedOwner()
    if (!owned) {
      // owner 尚未落盘的失败只消费真实 D 证据，不伪造模型来源或 custody_closed。
      this.strictCloseResult = result
      this.publishStrictExit()
      return result
    }
    if (this.strictFailure || !this.peer || managed.processless) throw new Error('native_pi_owned_source_unverifiable')
    await this.strictDeadline(this.peer.waitForInputEnd())
    if (this.strictFailure || !this.peer.completeInput || !this.options.beforeExitPublication) throw new Error('native_pi_stdout_incomplete')
    await this.strictDeadline(this.options.beforeExitPublication())
    if (this.strictFailure || !this.strictPolicy!.hasRecordedOwner()) throw new Error('native_pi_projection_unverifiable')
    this.strictPolicy!.closed()
    const exit = this.observedExit
    if (!exit || !managed.rootExitObserved) throw new Error('native_pi_root_exit_unobserved')
    await this.strictDeadline(Promise.resolve(this.options.onExit?.(new Error('native_pi_process_exited'), { expected: this.closing, exit })))
    if (this.strictFailure) throw new Error('native_pi_exit_publication_unverifiable')
    managed.child.removeListener('error', this.onError)
    managed.child.stderr.removeListener('error', this.onError)
    this.strictCloseResult = result
    this.publishStrictExit()
    return result
  }

  private publishStrictExit(): void {
    this.verifiedExit = true
    for (const listener of this.verifiedExitListeners) {
      try { listener() } catch { this.diagnose('native_pi_exit_observer_failed') }
    }
    this.verifiedExitListeners.clear()
  }

  private async strictDeadline<T>(work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([work, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('native_pi_close_deadline')), 30_000)
        timer.unref()
      })])
    } finally { clearTimeout(timer) }
  }
  private observeProviderRecord(record: JsonlRpcRecord): void {
    if (!this.providerEventFile || !['agent_start', 'agent_end', 'message_start', 'message_update', 'message_end'].includes(record.type)) return
    if (!this.ownedTree) throw new Error('SWA provider event has no owned Job')
    if (!this.providerEventIdentity) {
      const observed = this.ownedTree.readObservation()
      if (observed.platform === 'linux') throw new Error('The native JSONL event source has no reviewed Linux contract')
      if (!observed.assigned || observed.rootPid !== this.managed.child.pid || !observed.members.some(row => row.pid === observed.rootPid && row.creationTimeMs === observed.rootCreationTimeMs)) throw new Error('SWA provider event has no actual assigned root identity')
      this.providerEventIdentity = { pid: observed.rootPid, creationTimeMs: observed.rootCreationTimeMs }
    }
    const event = record.assistantMessageEvent === undefined ? undefined : z.object({ type: z.string(), delta: z.string().optional(), contentIndex: z.number().optional() }).parse(record.assistantMessageEvent)
    const message = record.message === undefined ? undefined : z.object({ role: z.string(), stopReason: z.string().optional() }).parse(record.message)
    appendFileSync(this.providerEventFile, JSON.stringify({ observed_at: new Date().toISOString(), monotonic_ms: performance.now(), process: this.providerEventIdentity, native_cli: this.ownedTree.readObservation().nativeCLI, record: { type: record.type, assistantMessageEvent: event, message }, projection: 'actual_native_cli_lifecycle_and_delta_fields' }) + '\n', { encoding: 'utf8', flag: 'a' })
  }
  private diagnose(message: string): void {
    try {
      this.options.onDiagnostic?.(message)
    } catch {
      /* Diagnostics cannot break cleanup. */
    }
  }
}
