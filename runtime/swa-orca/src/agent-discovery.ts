import { readFile, realpath, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { delimiter, dirname, extname, isAbsolute, join } from 'node:path'
import { parse as parseTOML } from 'smol-toml'
import { z } from 'zod'
import type { OrcaRuntimeService } from '../../../third_party/orca-v1.4.230/src/main/runtime/orca-runtime'
import { getStructuredAgentSessionHost } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-wire/structured-agent-session-registry'
import { resolveStructuredAgentCommand } from '../../../third_party/orca-v1.4.230/src/main/native-chat/structured-agent-command-resolution'
import { readAgentCliVersion } from '../../../third_party/orca-v1.4.230/src/main/agent-cli-version-probe'
import { ACP_LAUNCH_SPECS } from '../../../third_party/orca-v1.4.230/src/main/acp/acp-launch-specs'
import { isTuiAgent, TUI_AGENT_CONFIG, getTuiAgentDetectCommands } from '../../../third_party/orca-v1.4.230/src/shared/tui-agent-config'
import { resolveCliCommand } from '../../../third_party/orca-v1.4.230/src/shared/node-cli-command-resolution'
import { mergePersistedWindowsPathAsync } from '../../../third_party/orca-v1.4.230/src/main/pty/windows-environment-path'
import { builtinWorkerRoles } from './worker-roles'
import { normalizeCodexRuntimeSelection } from '../../../third_party/orca-v1.4.230/src/main/codex-accounts/runtime-selection'
import { normalizeClaudeRuntimeSelection } from '../../../third_party/orca-v1.4.230/src/main/claude-accounts/runtime-selection'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import { readAgentSettings, type AgentSettingsSnapshot } from './agent-settings'
import { parsePiModelOptionId } from '../../../third_party/orca-v1.4.230/src/main/pi/rpc-options'
import { agentCapabilitiesSchema, agentSelectionSchema, registeredAgentSchema, type AgentSelection, type CapabilityRequirements } from './contracts'
import { inspectNativePiPolicy } from './native-pi-policy'
import { inspectNativeOpenCodePolicy, readOpenCodeCredential, readOpenCodeDatabaseIdentity } from './native-opencode-policy'
import { parse as parseJSONC, type ParseError } from 'jsonc-parser'

type Observation = { status: 'available' | 'unavailable' | 'unknown'; reason: string; source: string; checked_at?: string }
const observation = (status: Observation['status'], reason: string, source: string): Observation => ({ status, reason, source })
const unknown = (reason: string, source: string) => observation('unknown', reason, source)
const available = (reason: string, source: string) => observation('available', reason, source)
const object = z.record(z.string(), z.unknown())
const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value : undefined

async function optionalConfiguration(file: string, format: 'json' | 'toml' | 'jsonc' = 'json') {
  let contents: string
  let sourceVersion: string
  try {
    const before = await stat(file, { bigint: true })
    sourceVersion = `${before.dev}:${before.ino}:${before.mtimeNs}:${before.size}`
    contents = await readFile(file, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
  const info = await stat(file, { bigint: true })
  if (sourceVersion !== `${info.dev}:${info.ino}:${info.mtimeNs}:${info.size}`) throw new Error('The selected native Agent configuration changed during reading')
  const errors: ParseError[] = []
  const value: unknown = format === 'toml' ? parseTOML(contents) : format === 'jsonc' ? parseJSONC(contents, errors, { allowTrailingComma: true }) : JSON.parse(contents)
  if (errors.length) throw new Error('The selected native configuration is not valid JSONC')
  return { value: object.parse(value), version: `${info.dev}:${info.ino}:${info.mtimeNs}:${info.size}` }
}

// 认证内容只用于判断来源类型；返回值只包含非秘密配置事实。
async function configuration(agent: string, snapshot: AgentSettingsSnapshot, requestedModel?: string) {
  const home = snapshot.home
  if (agent === 'codex') {
    const accountID = normalizeCodexRuntimeSelection(snapshot.settings).host
    const account = accountID ? snapshot.settings.codexManagedAccounts?.find(item => item.id === accountID) : undefined
    if (accountID && (!account || account.managedHomeRuntime === 'wsl')) throw new Error('The explicit native Codex account selection has no local read-only source')
    const accountHome = account?.managedHomePath ?? snapshot.settings.agentDefaultEnv?.codex?.CODEX_HOME ?? (process.env.SWA_DISCOVERY_CODEX_HOME || join(home, '.codex'))
    if (!isAbsolute(accountHome)) throw new Error('The selected Codex account home must be absolute')
    const config = await optionalConfiguration(join(accountHome, 'config.toml'), 'toml')
    const auth = await optionalConfiguration(join(accountHome, 'auth.json'))
    const tokens = auth?.value.tokens
    const oauth = typeof tokens === 'object' && tokens !== null && text(object.parse(tokens).access_token)
    const key = text(auth?.value.OPENAI_API_KEY)
    const provider = text(config?.value.model_provider) ?? (oauth || key ? 'openai' : undefined)
    const accountSource = provider === 'openai' ? oauth ? 'codex-oauth-file' : key ? 'codex-api-key-file' : undefined : undefined
    return { model: requestedModel ?? text(config?.value.model), provider, account: accountSource, version: `${config?.version ?? 'absent'};${auth?.version ?? 'absent'}` }
  }
  if (agent === 'claude') {
    const accountID = normalizeClaudeRuntimeSelection(snapshot.settings).host
    const account = accountID ? snapshot.settings.claudeManagedAccounts?.find(item => item.id === accountID) : undefined
    if (accountID && (!account || account.managedAuthRuntime === 'wsl')) throw new Error('The explicit native Claude account selection has no local read-only source')
    const configHome = snapshot.settings.agentDefaultEnv?.claude?.CLAUDE_CONFIG_DIR ?? (process.env.SWA_DISCOVERY_CLAUDE_HOME || join(home, '.claude'))
    if (!isAbsolute(configHome)) throw new Error('The selected Claude configuration home must be absolute')
    const config = await optionalConfiguration(join(configHome, 'settings.json'))
    const credentials = await optionalConfiguration(account?.managedAuthPath ?? join(configHome, '.credentials.json'))
    const env = config?.value.env ? object.parse(config.value.env) : {}
    const oauth = credentials?.value.claudeAiOauth
    const token = typeof oauth === 'object' && oauth !== null && text(object.parse(oauth).accessToken)
    const key = text(env.ANTHROPIC_AUTH_TOKEN) ?? text(env.ANTHROPIC_API_KEY)
    return { model: requestedModel ?? text(config?.value.model) ?? text(env.ANTHROPIC_MODEL), provider: token || key ? 'anthropic' : undefined, account: token ? 'claude-oauth-file' : key ? 'claude-settings-key' : undefined, version: `${config?.version ?? 'absent'};${credentials?.version ?? 'absent'}` }
  }
  if (agent === 'pi') {
    const accountHome = snapshot.settings.agentDefaultEnv?.pi?.PI_CODING_AGENT_DIR ?? (process.env.SWA_DISCOVERY_PI_HOME || join(home, '.pi', 'agent'))
    if (!isAbsolute(accountHome)) throw new Error('The selected Pi account home must be absolute')
    const config = await optionalConfiguration(join(accountHome, 'settings.json'))
    const auth = await optionalConfiguration(join(accountHome, 'auth.json'))
    const explicit = requestedModel === undefined ? undefined : parsePiModelOptionId(requestedModel)
    const provider = explicit?.provider ?? text(config?.value.defaultProvider)
    const entry = provider && auth?.value[provider] ? object.parse(auth.value[provider]) : undefined
    const oauth = entry?.type === 'oauth' && text(entry.access) && text(entry.refresh) && typeof entry.expires === 'number' && Number.isFinite(entry.expires)
    const account = oauth ? 'pi-oauth-file' : entry?.type === 'api_key' && text(entry.key) ? 'pi-api-key-file' : undefined
    const defaultModel = text(config?.value.defaultModel)
    return { model: requestedModel ?? (provider && defaultModel ? `${provider}/${defaultModel}` : undefined), provider, account, sourceHome: accountHome, version: `${config?.version ?? 'absent'};${auth?.version ?? 'absent'}` }
  }
  if (agent === 'opencode') {
    const sourceHome = process.env.SWA_DISCOVERY_OPENCODE_HOME || home
    if (!isAbsolute(sourceHome)) throw new Error('The selected OpenCode source home must be absolute')
    const config = await optionalConfiguration(join(sourceHome, '.config/opencode/opencode.jsonc'), 'jsonc')
    const auth = await optionalConfiguration(join(sourceHome, '.local/share/opencode/auth.json'))
    const entry = auth?.value.deepseek === undefined ? undefined : object.parse(auth.value.deepseek)
    const model = requestedModel ?? text(config?.value.model)
    const file = join(sourceHome, '.local/share/opencode/opencode.db')
    let databaseVersion = 'absent', databaseKeyMatches = false
    try {
      databaseVersion = readOpenCodeDatabaseIdentity(file).version
      const credential = readOpenCodeCredential(file)
      databaseKeyMatches = credential.key === entry?.key
      databaseVersion += `;${credential.id};${credential.updatedAt}`
    } catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error }
    return { model, provider: model === 'deepseek/deepseek-v4-pro' ? 'deepseek' : undefined, account: entry?.type === 'api' && text(entry.key) && databaseKeyMatches ? 'opencode-native-key-database' : undefined, sourceHome, version: `${config?.version ?? 'absent'};${auth?.version ?? 'absent'};${databaseVersion}` }
  }
  return { model: undefined, provider: undefined, account: undefined, version: 'native-configuration-unobserved' }
}

async function discoveryEnvironment(): Promise<Record<string, string>> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && /^(?:PATH|PATHEXT|COMSPEC|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_ALL|LC_CTYPE)$/i.test(key)) env[key] = value
  }
  // 原 home 只参与命令解析；version 子进程继续使用私有 HOME。
  await mergePersistedWindowsPathAsync(env, { forceRefresh: true, startedAfter: Date.now() })
  return env
}

async function inspectAgents(runtime: OrcaRuntimeService, requirements?: CapabilityRequirements, onlyAgent?: string, requestedModel?: string, projectId?: string) {
  const snapshot = await readAgentSettings()
  await runtime.ensureStructuredAgentSessionHost({ prewarmModelCatalog: false })
  const host = getStructuredAgentSessionHost()
  if (!host) throw new Error('The actual product structured Agent registry is unavailable')
  const disabled = new Set<string>(snapshot.launch.disabledTuiAgents)
  const env = await discoveryEnvironment()
  const agents = []
  const details = new Map<string, { selection: AgentSelection | undefined; configuration: Awaited<ReturnType<typeof configuration>> }>()
  const registrations = new Map(host.deps.agents.registrations().map(({ definition, adapter }) => [definition.agent as string, adapter.constructor.name]))
  const ids = new Set([...registrations.keys(), ...Object.keys(TUI_AGENT_CONFIG)])
  type Prepared = {
    id: string
    structured: boolean
    adapterName: string
    mode: 'structured' | 'terminal'
    registered: Observation
    enabled: Observation
    installed: Observation & { executable?: string; version?: string }
    executable?: string
  }
  const prepared: Prepared[] = []
  const probes: Array<{ id: string; executable: string }> = []
  for (const id of ids) {
    if (onlyAgent !== undefined && id !== onlyAgent) continue
    const structured = registrations.has(id)
    const adapterName = registrations.get(id) ?? 'TuiAgentLauncher'
    const mode = structured ? 'structured' as const : 'terminal' as const
    const registered = structured
      ? available('The real native adapter passed StructuredAgentRegistry validation', `StructuredAgentRegistry:${adapterName}`)
      : available('The native terminal Agent definition is registered', 'TUI_AGENT_CONFIG')
    const enabled = observation(disabled.has(id) ? 'unavailable' : 'available', disabled.has(id) ? 'Disabled in the selected native settings' : 'Enabled in the selected native settings', 'native-settings')
    let installed: Observation & { executable?: string; version?: string } = unknown('No absolute native command has been resolved', 'native-command-resolution')
    let executable: string | undefined
    if (isTuiAgent(id)) {
      const spec = ACP_LAUNCH_SPECS.find(item => item.agent === id)
      const terminal = TUI_AGENT_CONFIG[id]
      const sourceEnv: Record<string, string> = { ...env, HOME: snapshot.home, USERPROFILE: snapshot.home }
      if (process.env.SWA_DISCOVERY_APPDATA) sourceEnv.APPDATA = process.env.SWA_DISCOVERY_APPDATA
      if (process.env.SWA_DISCOVERY_LOCALAPPDATA) sourceEnv.LOCALAPPDATA = process.env.SWA_DISCOVERY_LOCALAPPDATA
      const overlay = snapshot.settings.agentDefaultEnv?.[id]
      const pathEnv = [overlay?.PATH ?? overlay?.Path ?? env.PATH ?? env.Path, ...(spec?.installDirectories({ env: sourceEnv, homePath: snapshot.home }) ?? [])].filter(Boolean).join(delimiter)
      const options = { pathEnv, homePath: snapshot.home }
      const executionSpec = projectId ? spec : undefined
      const commands = executionSpec ? [executionSpec.command] : getTuiAgentDetectCommands(terminal)
      const command = resolveStructuredAgentCommand(id, executionSpec?.ignoreAgentCommandSetting ? {} : { agentCmdOverrides: snapshot.launch.agentCmdOverrides }, options, { command: commands.find(value => isAbsolute(resolveCliCommand(value, options))) ?? commands[0] })
      const unsupported = terminal.detectUnsupportedRuntimes?.includes(process.platform)
      const missingRequired = terminal.detectRequiredCommands?.some(value => !isAbsolute(resolveCliCommand(value, options)))
      if (unsupported) {
        installed = observation('unavailable', 'The native Agent definition does not support this platform', 'TUI_AGENT_CONFIG')
      } else if (missingRequired) {
        installed = observation('unavailable', 'A required native command is not installed', 'TUI_AGENT_CONFIG')
      } else if (isAbsolute(command)) {
        executable = await realpath(command)
        if (id === 'opencode' && extname(executable).toLowerCase() === '.cmd') executable = await realpath(join(dirname(executable), 'node_modules/@opencode/cli/bin/opencode.exe'))
        probes.push({ id, executable })
      } else installed = observation('unavailable', 'Native command resolution found no installed executable', 'native-command-resolution')
    }
    prepared.push({ id, structured, adapterName, mode, registered, enabled, installed, executable })
  }
  const versions = await probeAgentVersions(probes, env)
  for (const item of prepared) {
    const { id, structured, adapterName, mode, registered, enabled } = item
    let { installed, executable } = item
    let version: string | undefined
    if (executable) {
      version = versions.get(id)
      installed = version ? { ...available('The selected native executable returned its real CLI version', 'native-version-probe'), checked_at: new Date().toISOString(), executable, version } : unknown('The selected native executable did not prove its CLI version', 'native-version-probe')
    }
    const config = await configuration(id, snapshot, requestedModel)
    const proven = !!(config.model && config.provider && config.account)
    const configured = { ...(proven ? available('Native configuration and the explicit selection supply model, provider and an account source', 'native-configuration') : unknown('The observed native defaults do not supply every model, provider and account field', 'native-configuration')), model: config.model, provider: config.provider, account_source: config.account }
    const declared = structured
      ? available('The real adapter implements this structured operation; no live handshake is claimed', `adapter-declaration:${adapterName}`)
      : observation('unavailable', 'This terminal Agent has no approved native execution policy', 'native-policy')
    const control = { start: declared, send: declared, read: unknown('No live session or complete transcript was observed', 'native-session'), stop: declared, resume: unknown('No native recovery handshake was observed', 'native-session'), tools: unknown('The selected Agent tool policy requires its own verified native contract', 'native-policy') }
    agents.push({ id, adapter: adapterName, execution_mode: mode, registered, enabled, installed, configured, launchable: unknown('No actual Agent handshake was performed', 'native-session'), control, ...(requirements ? { requirements } : {}) })
    let selection: AgentSelection | undefined
    if (projectId && enabled.status === 'available' && executable && version && proven) {
      if ((id !== 'pi' && id !== 'opencode') || !('sourceHome' in config) || !config.sourceHome || !config.model) throw new OrchestrationError('unsupported_capability', 'The selected native Agent account and disabled-tool policy have no reviewed contract')
      if (snapshot.settings.agentDefaultArgs?.[id]?.trim()) throw new OrchestrationError('unsupported_capability', 'The selected native Agent extra arguments have not been approved')
      const native = id === 'pi'
        ? await inspectNativePiPolicy({ executable, version, sourceHome: config.sourceHome, projectId, ...parsePiModelOptionId(config.model), env })
        : await inspectNativeOpenCodePolicy({ executable, version, sourceHome: config.sourceHome, projectId, privateRoot: join(await realpath(process.env.SWA_DATA_DIR!), 'opencode', projectId) })
      selection = agentSelectionSchema.parse({ agent_id: id, adapter: adapterName, execution_mode: 'structured', executable, version, model: config.model, provider: native.policy.account.provider, external_target: id, settings_source: snapshot.source, settings_revision: snapshot.revision, configuration_version: `${snapshot.version};${config.version};${JSON.stringify(native.sources)}`, native_launch: native.policy })
    }
    details.set(id, { selection, configuration: config })
  }
  return { agents, snapshot, details }
}

// 版本探测各占一个独立子进程，串行执行时占发现耗时的大部分；保留有界并发。
async function probeAgentVersions(items: Array<{ id: string; executable: string }>, env: Record<string, string>) {
  const versions = new Map<string, string | undefined>()
  let next = 0
  const limit = Math.min(4, items.length)
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const item = items[next++]
      if (!item) return
      const result = await readAgentCliVersion({ program: item.executable, cwd: process.env.SWA_DATA_DIR!, env })
      versions.set(item.id, result.version ?? undefined)
    }
  }))
  return versions
}

async function installedRegistrySource() {
  const sourceRevision = (await readFile(join(process.env.SWA_INSTALL_ROOT!, 'VERSION'), 'utf8')).trim()
  if (!/^[a-f0-9]{40}$/.test(sourceRevision)) throw new Error('The actual installed product source revision is invalid')
  const artifactSHA = createHash('sha256').update(await readFile(join(process.env.SWA_INSTALL_ROOT!, 'runtime', 'host.cjs'))).digest('hex')
  return { source_revision: sourceRevision, registry: { orca_version: '1.4.230' as const, artifact_sha256: artifactSHA } }
}

export async function registeredAgent(runtime: OrcaRuntimeService, agent: string) {
  const host = getStructuredAgentSessionHost()
  const registration = host?.deps.agents.registration(agent)
  if (!registration) throw new OrchestrationError('unsupported_capability', 'The requested Agent has no actual structured registration or bound terminal launcher')
  return registeredAgentSchema.parse({
    schema: 'swa.registered-agent.v1', id: registration.definition.agent, adapter: registration.adapter.constructor.name,
    execution_mode: 'structured', registered: true, source: { kind: 'structured-registry' },
    ...await installedRegistrySource(), runtime: {
      runtime_id: runtime.getRuntimeId(), authority_domain: runtime.getOrchestrationDb().getOrCreateLocalMutationCallerFingerprint(),
      data_root: await realpath(process.env.SWA_DATA_DIR!), install_root: await realpath(process.env.SWA_INSTALL_ROOT!)
    }
  })
}

export async function discoverAgents(runtime: OrcaRuntimeService, requirements: CapabilityRequirements) {
  const { agents, snapshot } = await inspectAgents(runtime, requirements)
  const result = agentCapabilitiesSchema.parse({ schema: 'swa.capabilities.v1', ...await installedRegistrySource(), discovery: { host: 'local', platform: process.platform, observed_at: new Date().toISOString(), settings_source: snapshot.source }, agents, roles: builtinWorkerRoles.map(({ id, name, description }) => ({ id, name, description })) })
  return result
}

export async function selectAgent(runtime: OrcaRuntimeService, projectId: string, agent: string, model: string) {
  const { details } = await inspectAgents(runtime, undefined, agent, model, projectId)
  const item = details.get(agent)
  if (!item?.selection) throw new OrchestrationError('agent_unconfigured', 'The selected native Agent lacks proven installation or configuration')
  return agentSelectionSchema.parse({ ...item.selection, model })
}
