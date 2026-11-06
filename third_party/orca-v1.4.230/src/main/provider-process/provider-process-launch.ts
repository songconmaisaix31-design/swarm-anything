import type { SwaProviderProcessTree } from './swa-provider-process-tree'

export type SwaInitializationProcess = {
  close(): Promise<boolean>
  onExit(listener: () => void): void
  readonly exited: boolean
  stderrTail(): string
}

export type SwaOpenCodeToolsPolicy = {
  nativeContract: 'opencode-cli-2.0.31'
  model: 'deepseek/deepseek-v4-pro'
  initialize(track: (resource: SwaInitializationProcess) => void, cwd: string): Promise<void>
  attach(tree: SwaProviderProcessTree): void
  stderr(line: string, cut: boolean): boolean
  ready(): Promise<void>
  verifySession(sessionId: string): Promise<void>
  trace(event: string, detail: unknown): void
}

export type ProviderProcessLaunch = {
  command: string
  args: string[]
  /** Workspace directory used by the provider process itself. */
  cwd?: string
  /** Overlay on the inherited environment. */
  env?: Record<string, string>
  /** Keys stripped after the overlay. */
  envToDelete?: readonly string[]
  /** SWA子进程在真实父Job分配后通过Node IPC获得启动许可。 */
  swaJobIPC?: true
  swaEventDirectory?: string
  swaOpenCodePolicy?: SwaOpenCodeToolsPolicy
}

export type SwaProviderJobLauncher = { node: string; entry: string; eventDirectory: string }

/** The one env rule for provider children: inherit, overlay, then strip (so a delete beats an overlay). */
export function resolveProviderChildEnv(
  launch: Pick<ProviderProcessLaunch, 'env' | 'envToDelete'>,
  baseEnv: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = { ...baseEnv, ...launch.env }
  for (const key of launch.envToDelete ?? []) {
    delete childEnv[key]
  }
  return childEnv
}
