import { ORCA_AGENT_SESSION_SPAWN_TOKEN_ENV } from '../../shared/agent-session-caller-env'
import { ORCA_AGENT_SESSION_CALLER_ENV_KEYS } from '../ipc/pty/host-env/spawn-env-keys'
import {
  LEGACY_NATIVE_CHAT_VISUALS_DIR_ENV,
  NATIVE_CHAT_SCRATCH_DIR_ENV
} from '../native-chat/native-chat-visuals-delivery'
import type { ProviderProcessLaunch } from '../provider-process/provider-process-launch'
import { STRUCTURED_CHILD_ENV_TO_DELETE } from '../runtime/structured-session-child-env'
import { isAbsolute } from 'node:path'
import type { SwaProviderJobLauncher, SwaPiSessionPolicy } from '../provider-process/provider-process-launch'

export type PiDisabledToolsPolicy = {
  nativeContract: 'pi-cli-1.0.1'
  provider: string
  modelId: string
  api: 'openai-responses' | 'openai-completions' | 'azure-openai-responses'
  baseUrl: string
  sessionPolicy?: SwaPiSessionPolicy
  questionExtension?: string
  allowedTools?: readonly ('swa_ask' | 'swa_delegate')[]
}

export type PiRpcLaunchOptions = {
  /** Binary and paths are resolved by the execution host before building the launch. */
  command: string
  sdkEntry?: string
  cwd: string
  fullAccess: boolean
  extraArgs?: readonly string[]
  env?: Record<string, string>
  envToDelete?: readonly string[]
  sessionFile?: string
  forkFile?: string
  toolsOff?: PiDisabledToolsPolicy
  swaJobLauncher?: SwaProviderJobLauncher
}

const CALLER_ENV_TO_DELETE = [
  ...ORCA_AGENT_SESSION_CALLER_ENV_KEYS,
  'ORCA_TERMINAL_HANDLE',
  ORCA_AGENT_SESSION_SPAWN_TOKEN_ENV
]

/** What a structured Pi session strips from its inheritance; the seal keeps a worker's handle.
 *  Pi gets no scratch folder, so an inherited one can only name another chat's. */
export const PI_RPC_SESSION_ENV_TO_DELETE: readonly string[] = [
  ...STRUCTURED_CHILD_ENV_TO_DELETE,
  'ORCA_TERMINAL_HANDLE',
  NATIVE_CHAT_SCRATCH_DIR_ENV,
  LEGACY_NATIVE_CHAT_VISUALS_DIR_ENV
]

/** `env` naming no caller: a structured session's seal names its own. */
export function withoutPiCallerEnv(env: Readonly<Record<string, string>>): Record<string, string> {
  const next = { ...env }
  for (const key of CALLER_ENV_TO_DELETE) {
    delete next[key]
  }
  return next
}

/** A Pi child that is no structured session (a catalog listing) names no caller at all. */
export function piRpcSessionlessEnvironment(env: Readonly<Record<string, string>>): {
  env: Record<string, string>
  envToDelete: readonly string[]
} {
  return {
    env: withoutPiCallerEnv(env),
    envToDelete: [...STRUCTURED_CHILD_ENV_TO_DELETE, ...CALLER_ENV_TO_DELETE]
  }
}

/** Pi stores its own sessions; an explicit session file is shared with terminal resumes. */
export function buildPiRpcLaunch(options: PiRpcLaunchOptions): ProviderProcessLaunch {
  if (options.sdkEntry !== undefined) throw new Error('A native Pi launch cannot select an SDK entry')
  if (options.toolsOff) {
    const policy = options.toolsOff
    if (policy.nativeContract !== 'pi-cli-1.0.1' || options.fullAccess || !policy.provider || !policy.modelId || !['openai-responses', 'openai-completions', 'azure-openai-responses'].includes(policy.api) || !policy.baseUrl || options.extraArgs?.length) throw new Error('Native Pi disabled-tool launch policy is invalid')
    if (!policy.sessionPolicy || options.sessionFile !== undefined || options.forkFile !== undefined) throw new Error('Native Pi requires its per-session policy and a new native session')
    policy.sessionPolicy.assertCurrent()
    const launcher = options.swaJobLauncher
    if (!launcher || ![launcher.node, launcher.entry, launcher.eventDirectory, options.command].every(isAbsolute)) throw new Error('Native Pi requires its owning Job launcher')
    if (policy.questionExtension !== undefined && !isAbsolute(policy.questionExtension)) throw new Error('Native Pi requires its fixed absolute question extension')
    const allowed = policy.allowedTools ?? ['swa_ask']
    if (policy.questionExtension && ![['swa_ask'], ['swa_delegate'], ['swa_ask', 'swa_delegate']].some(tools => JSON.stringify(tools) === JSON.stringify(allowed))) throw new Error('Native Pi tools differ from the fixed extension contract')
    const toolArgs = policy.questionExtension ? ['--no-builtin-tools', '--tools', allowed.join(','), '--no-extensions', '--extension', policy.questionExtension] : ['--no-tools', '--no-extensions']
    const args = ['--mode', 'rpc', '--offline', '--no-approve', '--provider', policy.provider, '--model', policy.modelId, ...toolArgs, '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', ...(options.sessionFile ? ['--session', options.sessionFile] : []), ...(options.forkFile ? ['--fork', options.forkFile] : [])]
    return {
      command: launcher.node, cwd: options.cwd,
      args: ['--max-old-space-size=1024', launcher.entry, JSON.stringify({ command: options.command, args })],
      env: { ...options.env }, envToDelete: [...(options.envToDelete ?? [])], swaJobIPC: true, swaEventDirectory: launcher.eventDirectory,
      swaPiPolicy: policy.sessionPolicy
    }
  }
  if (!options.fullAccess) {
    throw new Error('Pi structured chat supports full access only')
  }
  if (options.sessionFile !== undefined && !options.sessionFile.trim()) {
    throw new Error('Pi resume requires a session file')
  }
  if (
    options.forkFile !== undefined &&
    (!options.forkFile.trim() || options.sessionFile !== undefined)
  ) {
    throw new Error('Pi fork requires one source session file')
  }
  const args = [...(options.extraArgs ?? [])]
  let provider = false
  let model = false
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    const flag = arg.split('=')[0]
    if (flag === '--provider' || flag === '--model' || flag === '-m') {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[++index]
      if (!value || value.startsWith('-')) {
        throw new Error(`Pi ${flag} requires a value`)
      }
      if (flag === '--provider') {
        provider = true
      } else {
        model = true
      }
    } else if (
      [
        '--mode',
        '--print',
        '-p',
        '--no-session',
        '--session',
        '-r',
        '--resume',
        '-c',
        '--continue',
        '--fork'
      ].includes(flag)
    ) {
      throw new Error(`Pi ${flag} conflicts with the structured chat launch`)
    }
  }
  if (provider && !model) {
    throw new Error('Pi --provider requires --model')
  }
  return {
    command: options.command,
    cwd: options.cwd,
    args: [
      '--mode',
      'rpc',
      ...args,
      ...(options.sessionFile ? ['--session', options.sessionFile] : []),
      ...(options.forkFile ? ['--fork', options.forkFile] : [])
    ],
    env: { ...options.env },
    envToDelete: [...(options.envToDelete ?? [])]
  }
}
