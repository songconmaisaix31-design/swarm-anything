// A chat's saved options as the Claude child's launch options. The child starts already running
// them, so its first message can be written at once instead of waiting for initialize to answer and
// a control request to apply each one.

import type { EffortLevel } from '@anthropic-ai/claude-agent-sdk'
import { decodeStructuredAgentSessionOptionValue } from '../../shared/structured-agent-session-option-codec'
import type {
  ClaudeStructuredLaunch,
  ClaudeStructuredSdkOptions
} from './claude-structured-launch-resolution'
import type { ClaudeSession } from './claude-structured-session-state'

/** 固定官方版本的公开构造，不读取账号或启动 SDK。 */
export function nativeClaudeSdkOptions(input: { nativeId: string; resume: boolean }): ClaudeStructuredSdkOptions {
  if (typeof input.resume !== 'boolean' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.nativeId)) {
    throw new Error('native_claude_session_identity_invalid')
  }
  return {
    model: 'claude-opus-5', tools: [], mcpServers: {}, strictMcpConfig: true,
    agents: {}, plugins: [], skills: [], hooks: {}, additionalDirectories: [],
    settingSources: [], supportedDialogKinds: [], permissionMode: 'dontAsk',
    permissionPrompts: 'none', allowDangerouslySkipPermissions: false,
    includePartialMessages: true, persistSession: true, enableFileCheckpointing: false,
    systemPrompt: { type: 'preset', preset: 'claude_code' },
    settings: { disableAllHooks: true, disableSkillShellExecution: true, disableBundledSkills: true, disableClaudeAiConnectors: true, autoMemoryEnabled: false },
    extraArgs: { bare: null, 'disable-slash-commands': null, 'replay-user-messages': null, 'no-chrome': null },
    ...(input.resume ? { resume: input.nativeId } : { sessionId: input.nativeId })
  }
}

const EFFORT_LEVELS: ReadonlySet<string> = new Set<EffortLevel>([
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
])
/** The saved value stands in for the agent Arguments' own flag for it: the chat's pick wins, and
 *  the CLI is never handed the flag twice. */
function withoutConfiguredFlag(
  options: ClaudeStructuredSdkOptions,
  flag: string
): ClaudeStructuredSdkOptions {
  if (!options.extraArgs || !Object.hasOwn(options.extraArgs, flag)) {
    return options
  }
  const { [flag]: _configured, ...extraArgs } = options.extraArgs
  return { ...options, extraArgs }
}

function isEffortLevel(value: string): value is EffortLevel {
  return EFFORT_LEVELS.has(value)
}

export type ClaudeStructuredSpawnOptions = {
  sdkOptions: ClaudeStructuredSdkOptions
  /** The chat's options as the session holds them: what was launched, and a Fast the start applies. */
  options: Map<string, string>
  /** Saved options left out: the provider's own value wins and is re-persisted. */
  skipped: readonly string[]
  /** A saved Fast the launch does not carry, which the start applies. */
  fastModeAtStart: boolean
}

/**
 * Every saved value is passed as the user chose it; the CLI's own answer (a turn's error, the
 * settings readback) says what it ran. Only a value no Claude version can parse is left out, by
 * the SDK's types, not the installed binary's: one that binary rejects fails its start.
 */
export function claudeStructuredSpawnOptions(input: {
  launch: Pick<ClaudeStructuredLaunch, 'options' | 'resumesTranscript' | 'swaClaudePolicy'>
  saved: Readonly<Record<string, string>> | undefined
}): ClaudeStructuredSpawnOptions {
  if (input.launch.swaClaudePolicy) {
    if (Object.entries(input.saved ?? {}).some(([key, value]) => key !== 'model' || value !== 'claude-opus-5')) {
      throw new Error('native_claude_saved_option_rejected')
    }
    return { sdkOptions: { ...input.launch.options }, options: new Map([['model', 'claude-opus-5']]), skipped: [], fastModeAtStart: false }
  }
  const saved = new Map(['model', 'effort', 'fastMode'].flatMap(key => {
    const value = input.saved?.[key]
    return value ? [[key, value] as const] : []
  }))
  const options = new Map<string, string>()
  const skipped: string[] = []
  let sdkOptions: ClaudeStructuredSdkOptions = { ...input.launch.options }
  let fastModeAtStart = false
  const model = saved.get('model')
  if (model !== undefined) {
    options.set('model', model)
    sdkOptions = { ...withoutConfiguredFlag(sdkOptions, 'model'), model }
  }
  const effort = saved.get('effort')
  if (effort !== undefined) {
    if (isEffortLevel(effort)) {
      options.set('effort', effort)
      sdkOptions = { ...withoutConfiguredFlag(sdkOptions, 'effort'), effort }
    } else {
      skipped.push('effort')
    }
  }
  const fastMode = saved.get('fastMode')
  if (fastMode !== undefined) {
    const decoded = decodeStructuredAgentSessionOptionValue('fastMode', fastMode)
    if (typeof decoded !== 'boolean') {
      skipped.push('fastMode')
    } else {
      options.set('fastMode', fastMode)
      // A new CLI session may opt in to Fast per session, which only its settings say, and the
      // agent Arguments' own `--settings` would be replaced by one carrying Fast: either way the
      // start applies the saved Fast once it has read them (`applyClaudeStartFastMode`).
      if (
        (!decoded || input.launch.resumesTranscript) &&
        !Object.hasOwn(sdkOptions.extraArgs ?? {}, 'settings')
      ) {
        sdkOptions.settings = { fastMode: decoded }
      } else {
        fastModeAtStart = true
      }
    }
  }
  return { sdkOptions, options, skipped, fastModeAtStart }
}

/** The published session takes on what its child was launched with. */
export function adoptClaudeStructuredSpawnOptions(
  session: Pick<
    ClaudeSession,
    'restoreSkippedOptions' | 'translator' | 'launchedModel' | 'fastModeAtStart'
  >,
  spawn: Pick<ClaudeStructuredSpawnOptions, 'options' | 'skipped' | 'fastModeAtStart'>
): void {
  session.launchedModel = spawn.options.get('model') ?? null
  session.fastModeAtStart = spawn.fastModeAtStart
  for (const key of spawn.skipped) {
    session.restoreSkippedOptions.add(key)
  }
  const model = spawn.options.get('model')
  if (model !== undefined) {
    session.translator?.modelWritten(model)
  }
}
