import type { PipedChildProcess, PipedProcessSpawner } from '@orca/process-host/process-spec'
import type { SpawnOptions as ClaudeAgentSdkSpawnOptions } from '@anthropic-ai/claude-agent-sdk'
import { spawnProcess } from '@orca/process-host'
import {
  spawnManagedProviderProcess,
  type ManagedProviderProcess
} from '../provider-process/managed-provider-process'
import { claudeChildClosePolicy, claudeChildCloseProven } from './claude-child-exit-proof-ladder'
import { SwaProviderProcessTree } from '../provider-process/swa-provider-process-tree'
import type { SwaClaudeToolsPolicy, SwaInitializationProcess } from '../provider-process/provider-process-launch'
import type { ClaudeChildExitVerdict } from './claude-stream-json-connection'

export type ClaudeSwaInitializationProcess = SwaInitializationProcess & {
  readonly swaFullTreeCloseRequired: true
  readonly exitVerdict: ClaudeChildExitVerdict
}

export type ClaudeCodeProcessSpawn = {
  /** Pass as the SDK's `spawnClaudeCodeProcess`; the SDK never learns the pid because it never owns it. */
  spawn: (options: ClaudeAgentSdkSpawnOptions) => PipedChildProcess
  /** The retained child, so Orca keeps its own tree-kill and exit-proof ladder. Null until the SDK spawns. */
  readonly child: PipedChildProcess | null
  readonly managed: ManagedProviderProcess | null
  /**
   * Ownership proof: the durable lease adjudicates on this pid plus start time plus the spawn
   * token. On POSIX it is the provider supervisor's, which outlives Claude by construction.
   */
  readonly pid: number | undefined
  /** The spawn spec's verdict, so the close ladder never re-decides it. False until the SDK spawns. */
  readonly supervised: boolean
  readonly swaTree: SwaProviderProcessTree | null
  readonly initializingProcess: ClaudeSwaInitializationProcess | null
  bindSwaClose(close: () => Promise<boolean>): void
  closeSwaProcess(): Promise<boolean>
  completeSwaClose(): void
}

function definedEnv(env: Record<string, string | undefined>): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      next[key] = value
    }
  }
  return next
}

/**
 * Orca supplies the Claude Code child rather than letting the SDK spawn it.
 *
 * Two independent reasons: the SDK's `SpawnedProcess` has no pid, and Orca's
 * spawner is the only path that encodes `.cmd` arguments safely on Windows.
 *
 * On POSIX Claude runs under the provider supervisor, so an Orca that dies stops
 * it instead of leaving it to finish its turn, tools and edits included, with
 * nobody watching. Windows has no supervisor and spawns Claude directly.
 */
export function createClaudeCodeProcessSpawn(
  spawnImpl: PipedProcessSpawner = spawnProcess,
  platform: NodeJS.Platform = process.platform,
  onOutput?: () => void,
  restricted?: { policy: SwaClaudeToolsPolicy; onSpawnedProcess?: (resource: ClaudeSwaInitializationProcess) => void }
): ClaudeCodeProcessSpawn {
  let managed: ManagedProviderProcess | null = null
  let swaTree: SwaProviderProcessTree | null = null
  let initializingProcess: ClaudeSwaInitializationProcess | null = null
  let boundClose: (() => Promise<boolean>) | undefined
  let closeSwaProcess: (() => Promise<boolean>) | undefined
  let publishSwaClose: (() => void) | undefined
  return {
    spawn: (options) => {
      if (restricted) {
        if (managed || swaTree) throw new Error('native_claude_second_spawn_rejected')
        restricted.policy.assertSpawn(options)
        const tree = new SwaProviderProcessTree()
        swaTree = tree
        try { restricted.policy.attach(tree) }
        catch (error) { tree.closeBeforeSpawnFailure(); throw error }
        let attempted = false, closeRequested = false, released = false, rawClosed = false
        let cleanup: Promise<boolean> | undefined
        const listeners = new Set<() => void>()
        const publish = () => {
          released = true
          for (const listener of listeners) listener()
          listeners.clear()
        }
        publishSwaClose = publish
        const close = (): Promise<boolean> => {
          closeRequested = true
          cleanup ??= (async () => {
            if (!managed) {
              if (attempted) return false
              tree.closeBeforeSpawnFailure()
            } else {
              const result = await managed.close(tree)
              if (result.root !== 'exited' || !managed.processless && (result.tree !== 'exited' || tree.readFinalObservation() === null)) return false
            }
            rawClosed = true
            if (!boundClose) publish()
            return true
          })().finally(() => { if (!rawClosed) cleanup = undefined })
          return cleanup
        }
        closeSwaProcess = close
        const resource: ClaudeSwaInitializationProcess = {
          swaFullTreeCloseRequired: true,
          async close() { const proven = await (boundClose ?? close)(); if (proven) publish(); return proven },
          onExit(listener) { if (released) listener(); else listeners.add(listener) },
          get exited() { return released },
          stderrTail() { return '' },
          get exitVerdict() { return { root: managed?.rootVerdict ?? 'unverifiable', tree: tree.treeVerdict, ...(managed?.processless ? { processless: true } : {}) } }
        }
        initializingProcess = resource
        // 在任何可能创建主进程的调用之前登记同一真实隔离资源，取消和同步异常都保留它。
        restricted.onSpawnedProcess?.(resource)
        if (closeRequested) throw new Error('native_claude_spawn_cancelled')
        const env = definedEnv(options.env)
        restricted.policy.assertSpawn(options)
        attempted = true
        managed = spawnManagedProviderProcess({
          command: restricted.policy.launcher.node,
          args: [restricted.policy.launcher.entry, JSON.stringify({ command: options.command, args: [...options.args] })],
          ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
          env, envToDelete: Object.keys(process.env).filter(name => !(name in env)),
          swaJobIPC: true, swaEventDirectory: restricted.policy.launcher.eventDirectory
        }, {
          spawnImpl, platform, inheritedEnv: {}, site: 'native-claude-structured-session',
          policy: supervised => ({ ...claudeChildClosePolicy(supervised, platform), selfExitIsClose: false }),
          acceptClose: result => result.root === 'exited' && (managed?.processless === true || result.tree === 'exited'),
          stderrLineMaxChars: 1024, onStderrLine: () => true,
          ...(onOutput ? { onOutput } : {})
        })
        const actual = managed
        tree.bind(actual.child, () => ({ observed: actual.rootExitObserved, processless: actual.processless }), true)
        const requestClose = () => { void resource.close().catch(() => undefined) }
        options.signal?.addEventListener('abort', requestClose, { once: true })
        if (options.signal?.aborted) requestClose()
        return new Proxy(actual.child, {
          get(target, key) {
            if (key === 'kill') return () => { requestClose(); return true }
            const value = Reflect.get(target, key, target)
            return typeof value === 'function' ? value.bind(target) : value
          }
        })
      }
      // SDK abort would kill the child outside Orca's ladder, losing observed exit proof.
      managed = spawnManagedProviderProcess(
        {
          command: options.command,
          args: [...options.args],
          ...(options.cwd === undefined ? {} : { cwd: options.cwd })
        },
        {
          spawnImpl,
          platform,
          inheritedEnv: definedEnv(options.env),
          site: 'claude-stream-json-teardown',
          policy: (supervised) => claudeChildClosePolicy(supervised, platform),
          acceptClose: claudeChildCloseProven,
          ...(onOutput ? { onOutput } : {})
        }
      )
      // The SDK drains stderr only for its own local spawn; the managed process drains it here.
      return managed.child
    },
    get child() {
      return managed?.child ?? null
    },
    get managed() {
      return managed
    },
    get pid() {
      return managed?.child.pid
    },
    get supervised() {
      return managed?.supervised ?? false
    },
    get swaTree() { return swaTree },
    get initializingProcess() { return initializingProcess },
    bindSwaClose(close) { boundClose = close },
    closeSwaProcess() { return closeSwaProcess?.() ?? Promise.resolve(false) },
    completeSwaClose() { publishSwaClose?.() }
  }
}
