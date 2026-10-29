import { readFile, realpath } from 'node:fs/promises'
import { lstatSync, mkdirSync, opendirSync, realpathSync, rmdirSync, statSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { delimiter, dirname, extname, isAbsolute, join, normalize, resolve, toNamespacedPath } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { OrcaRuntimeService } from '../../../third_party/orca-v1.4.230/src/main/runtime/orca-runtime'
import { getStructuredAgentSessionHost } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-wire/structured-agent-session-registry'
import { resolveStructuredAgentCommand } from '../../../third_party/orca-v1.4.230/src/main/native-chat/structured-agent-command-resolution'
import { readAgentCliVersion } from '../../../third_party/orca-v1.4.230/src/main/agent-cli-version-probe'
import { ACP_LAUNCH_SPECS } from '../../../third_party/orca-v1.4.230/src/main/acp/acp-launch-specs'
import { isTuiAgent } from '../../../third_party/orca-v1.4.230/src/shared/tui-agent-config'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import { readAgentSettings, type AgentSettingsSnapshot } from './agent-settings'
import { parsePiModelOptionId } from '../../../third_party/orca-v1.4.230/src/main/pi/rpc-options'
import { agentCapabilitiesSchema, agentSelectionSchema, registeredAgentSchema, type AgentSelection, type CapabilityRequirements } from './contracts'
import { assertNativePiSourcesCurrent, inspectNativePiPolicy, inspectNativePiSources, nativeConfigurationSource, readNativePiFile, requireNativePiSourceHome } from './native-pi-policy'
import { inspectProjectToolSupport } from './project-tools'
import { runProcess } from '@orca/process-host'
import { parseCliVersion } from '../../../third_party/orca-v1.4.230/src/shared/app-version'
import { parseStrictPiJson } from '../../../third_party/orca-v1.4.230/src/main/pi/rpc-protocol'
import { inspectNativeOpenCodeAccountSource, inspectNativeOpenCodeExecutable, inspectNativeOpenCodePolicy, openCodeTargets } from './native-opencode-policy'
import { preparePrivateOpenCodeVersionEnvironment } from './private-opencode-account'
import { inspectNativeCodexAccountSource, inspectNativeCodexPolicy } from './native-codex-policy'
import { inspectNativeClaudeAccountSource, inspectNativeClaudePolicy } from './native-claude-policy'
import { createPrivateDirectory as createWindowsPrivateDirectory } from '@orca/windows-security'
import { createPrivateClaudeDirectory, requireNativeClaudePath } from './claude-file-security'
import { preparePrivatePiEnvironment, privatePiEnvironment } from './private-pi-account'
import { assertPiStartupSources } from './pi-session-policy'
import { agentObservation, describeAgentFeatures, modelCatalogObservation, type AgentObservation } from './execution-observation'

type Observation = AgentObservation
const observation = agentObservation
const unknown = (reason: string, source: string, basis: NonNullable<Observation['basis']>) => observation('unknown', reason, source, basis)
const available = (reason: string, source: string, basis: NonNullable<Observation['basis']>) => observation('available', reason, source, basis)
const object = z.record(z.string(), z.unknown())
const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value : undefined

/** 只允许发现清单保留单项观察失败；实际选择继续抛出原异常。 */
export async function observeAgentStage<T>(mode: 'discovery' | 'selection', stage: 'installation' | 'configuration', inspect: () => Promise<T>): Promise<{ value: T; failure?: never } | { value?: never; failure: Observation }> {
  try { return { value: await inspect() } }
  catch (error) {
    if (mode === 'selection') throw error
    const code = error instanceof Error && 'code' in error ? error.code : undefined
    const basis = stage === 'installation' ? 'probe' : 'configuration'
    if (code === 'ENOENT') return { failure: observation('unavailable', '所选原生来源不存在', `native-${stage}-missing`, basis) }
    if (code === 'EACCES' || code === 'EPERM') return { failure: observation('unavailable', '所选原生来源不可读取', `native-${stage}-unreadable`, basis) }
    if (stage === 'configuration' && (error instanceof SyntaxError || error instanceof z.ZodError)) return { failure: observation('unavailable', '所选原生配置格式无法解析', 'native-configuration-invalid', basis) }
    return { failure: unknown('该 Agent 的原生来源观察未完成，保持未知', `native-${stage}-unverified`, basis) }
  }
}

function optionalPiConfiguration(file: string) {
  try {
    const info = lstatSync(file)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('native_pi_configuration_leaf_invalid')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw new Error('native_pi_configuration_leaf_unverifiable')
  }
  const { source, bytes } = readNativePiFile(file, 64 * 1024, true)
  return { value: object.parse(parseStrictPiJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes))), version: source.version }
}

async function readFixedPiVersion(executable: string, env: Record<string, string>) {
  const sources = await inspectNativePiSources(executable, '1.0.1', env)
  if (!sources.interpreter) throw new Error('native_pi_interpreter_unverifiable')
  const data = realpathSync(z.string().min(1).parse(process.env.SWA_DATA_DIR))
  requireNativeClaudePath(data, { directory: true, private: false })
  const parent = lstatSync(data, { bigint: true }), root = join(data, `.pi-version-${randomBytes(16).toString('hex')}`)
  if (process.platform === 'win32') {
    if (!createWindowsPrivateDirectory(toNamespacedPath(root))) throw new Error('native_pi_version_directory_exists')
  } else mkdirSync(root, { mode: 0o700 })
  requireNativeClaudePath(data, { directory: true, private: false })
  const currentParent = lstatSync(data, { bigint: true })
  if (currentParent.dev !== parent.dev || currentParent.ino !== parent.ino || currentParent.birthtimeNs !== parent.birthtimeNs) throw new Error('native_pi_version_parent_changed')
  requireNativeClaudePath(root, { directory: true, private: true })
  const home = join(root, 'home'), cwd = join(root, 'cwd')
  createPrivateClaudeDirectory(home); createPrivateClaudeDirectory(cwd)
  await preparePrivatePiEnvironment(home)
  // 官方 wrapper 在 --version 前调用 enableCompileCache；此固定控制值关闭 Node 磁盘缓存。
  const childEnv: Record<string, string> = { ...privatePiEnvironment(home, env), NODE_DISABLE_COMPILE_CACHE: '1' }
  const directories = [...new Set([root, home, cwd, ...['APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_DIRS', 'XDG_DATA_DIRS'].map(key => childEnv[key]).filter((path): path is string => !!path)])].sort()
  const allowed = new Set(directories)
  const inventory = () => directories.map(path => {
    requireNativeClaudePath(path, { directory: true, private: true })
    const info = lstatSync(path, { bigint: true }), directory = opendirSync(path)
    try {
      for (let entry = directory.readSync(); entry; entry = directory.readSync()) {
        if (!allowed.has(join(path, entry.name)) || !entry.isDirectory() || entry.isSymbolicLink()) throw new Error('native_pi_version_directory_changed')
      }
    } finally { directory.closeSync() }
    return { path, dev: info.dev, ino: info.ino, birthtimeNs: info.birthtimeNs, mtimeNs: info.mtimeNs, size: info.size }
  })
  // 缺席 global settings 使固定 SettingsManager 读取回调返回 undefined；projectTrusted:false 不读项目设置。
  assertPiStartupSources(home, cwd, sources.entry.path)
  const before = inventory()
  assertNativePiSourcesCurrent(sources)
  let terminated = false
  const result = await runProcess({ program: sources.interpreter.path, args: [sources.entry.path, '--version'], cwd, env: childEnv, timeoutMs: 5_000, maxOutputBytes: 4_096, killOnOutputLimit: true, onChildTerminated: () => { terminated = true } })
  // timeout/输出未知时保留该实际目录，不在仍可能存活的子进程下清理或宣称无写入。
  if (!terminated || result.timedOut || result.outputTruncated || result.code !== 0 || result.stderr !== '') return undefined
  assertPiStartupSources(home, cwd, sources.entry.path)
  if (!isDeepStrictEqual(inventory(), before)) throw new Error('native_pi_version_directory_changed')
  assertNativePiSourcesCurrent(sources)
  const version = parseCliVersion(result.stdout)
  // 仅对已完整 close 且库存未变化的本次独占空目录做 rmdir，绝不递归删除。
  const created = new Map(before.map(info => [info.path, info]))
  for (const path of [...directories].sort((a, b) => b.length - a.length)) {
    requireNativeClaudePath(path, { directory: true, private: true })
    const expected = created.get(path), current = lstatSync(path, { bigint: true })
    if (!expected || current.dev !== expected.dev || current.ino !== expected.ino || current.birthtimeNs !== expected.birthtimeNs) throw new Error('native_pi_version_directory_changed')
    rmdirSync(path)
  }
  return version === '1.0.1' ? version : undefined
}

async function readFixedOpenCodeVersion(executable: string, inherited: Record<string, string>) {
  const before = await inspectNativeOpenCodeExecutable(executable)
  const data = realpathSync(z.string().min(1).parse(process.env.SWA_DATA_DIR))
  const root = join(data, `.opencode-version-${randomBytes(16).toString('hex')}`)
  const env = await preparePrivateOpenCodeVersionEnvironment(root, inherited)
  let terminated = false
  const result = await runProcess({ program: before.executable.path, args: ['--version'], cwd: env.HOME, env, timeoutMs: 5_000, maxOutputBytes: 4096, killOnOutputLimit: true, onChildTerminated: () => { terminated = true } })
  if (!terminated || result.timedOut || result.outputTruncated || result.code !== 0 || result.stderr !== '') return undefined
  if (!isDeepStrictEqual(before, await inspectNativeOpenCodeExecutable(executable))) throw new Error('native_opencode_version_source_changed')
  const version = parseCliVersion(result.stdout)
  return version === '2.0.31' ? version : undefined
}

// 认证内容只用于判断来源类型；返回值只包含非秘密配置事实。
export function codexProtectedRoots(snapshot: AgentSettingsSnapshot, projectRoot: string) {
  return [projectRoot, process.env.SWA_AGENT_PROFILE, snapshot.settings.agentDefaultEnv?.codex?.CODEX_HOME, snapshot.settings.agentDefaultEnv?.claude?.CLAUDE_CONFIG_DIR,
    ...snapshot.settings.codexManagedAccounts?.map(account => account.managedHomePath) ?? [],
    ...snapshot.settings.claudeManagedAccounts?.map(account => dirname(account.managedAuthPath)) ?? []].filter((path): path is string => !!path && isAbsolute(path))
}

async function configuration(agent: string, snapshot: AgentSettingsSnapshot, requestedModel?: string, projectRoot?: string) {
  const home = snapshot.home
  if (agent === 'codex') {
    const sourceHome = process.env.SWA_CODEX_API_KEY_HOME
    if (requestedModel !== undefined && requestedModel !== 'gpt-5.5') throw new Error('native_codex_model_unreviewed')
    if (!sourceHome || !projectRoot) return { model: undefined, provider: undefined, account: undefined, sourceHome, version: 'explicit-api-key-source-unverified' }
    const account = await inspectNativeCodexAccountSource({ sourceHome, protectedRoots: codexProtectedRoots(snapshot, projectRoot), env: process.env })
    return { model: 'gpt-5.5', provider: 'openai', account: 'codex-native-api-key', sourceHome: account.sourceHome, version: account.authSource.version }
  }
  if (agent === 'claude') {
    const sourceHome = process.env.SWA_CLAUDE_API_KEY_HOME
    if (requestedModel !== undefined && requestedModel !== 'claude-opus-5') throw new Error('native_claude_model_unreviewed')
    if (!sourceHome || !projectRoot) return { model: undefined, provider: undefined, account: undefined, sourceHome, version: 'explicit-api-key-source-unverified' }
    const account = await inspectNativeClaudeAccountSource({ sourceHome, protectedRoots: codexProtectedRoots(snapshot, projectRoot), env: process.env })
    return { model: 'claude-opus-5', provider: 'anthropic', account: 'claude-native-api-key', sourceHome: account.sourceHome, version: account.authSource.version }
  }
  if (agent === 'pi') {
    if (!projectRoot) return { model: undefined, provider: undefined, account: undefined, sourceHome: undefined, version: 'project-source-unverified' }
    const accountHome = snapshot.settings.agentDefaultEnv?.pi?.PI_CODING_AGENT_DIR ?? (process.env.SWA_DISCOVERY_PI_HOME || join(home, '.pi', 'agent'))
    if (!isAbsolute(accountHome)) throw new Error('The selected Pi account home must be absolute')
    const sourceHome = await requireNativePiSourceHome({ sourceHome: accountHome, protectedRoots: codexProtectedRoots(snapshot, projectRoot), env: process.env })
    const config = optionalPiConfiguration(join(sourceHome, 'settings.json'))
    const auth = optionalPiConfiguration(join(sourceHome, 'auth.json'))
    const explicit = requestedModel === undefined ? undefined : parsePiModelOptionId(requestedModel)
    const provider = explicit?.provider ?? text(config?.value.defaultProvider)
    const entry = provider && auth?.value[provider] ? object.parse(auth.value[provider]) : undefined
    const oauth = entry?.type === 'oauth' && text(entry.access) && text(entry.refresh) && typeof entry.expires === 'number' && Number.isFinite(entry.expires)
    const account = oauth ? 'pi-oauth-file' : entry?.type === 'api_key' && text(entry.key) ? 'pi-api-key-file' : undefined
    const defaultModel = text(config?.value.defaultModel)
    return { model: requestedModel ?? (provider && defaultModel ? `${provider}/${defaultModel}` : undefined), provider, account, sourceHome, version: `${config?.version ?? 'absent'};${auth?.version ?? 'absent'}` }
  }
  if (agent === 'opencode') {
    const sourceHome = process.env.SWA_OPENCODE_API_KEY_HOME
    if (!sourceHome || !projectRoot) return { model: undefined, provider: undefined, account: undefined, sourceHome, version: 'explicit-api-key-source-unverified' }
    const account = await inspectNativeOpenCodeAccountSource({ sourceHome, protectedRoots: codexProtectedRoots(snapshot, projectRoot), env: process.env })
    const target = openCodeTargets[account.provider]
    if (requestedModel !== undefined && requestedModel !== target.model) throw new Error('native_opencode_model_unreviewed')
    return { model: target.model, provider: account.provider, account: target.kind, sourceHome: account.sourceHome, version: `${account.config.source.version};${account.auth.source.version};${account.database.version};${account.wal?.version ?? 'absent'};${account.credential.id};${account.credential.updatedAt}` }
  }
  return { model: undefined, provider: undefined, account: undefined, version: 'native-configuration-unobserved' }
}

function discoveryEnvironment(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && /^(?:PATH|PATHEXT|COMSPEC|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_ALL|LC_CTYPE)$/i.test(key)) env[key] = value
  }
  // 原 home 只参与命令解析；version 子进程继续使用私有 HOME。
  return env
}

async function inspectAgents(runtime: OrcaRuntimeService, requirements?: CapabilityRequirements, onlyAgent?: string, requestedModel?: string, projectId?: string, projectRoot?: string, questionMode: 'disabled' | 'native' = 'disabled', delegationMode: 'disabled' | 'native' = 'disabled', developmentMode: 'disabled' | 'project' = 'disabled', morphConfig?: string) {
  const snapshot = await readAgentSettings()
  await runtime.ensureStructuredAgentSessionHost({ prewarmModelCatalog: false })
  const host = getStructuredAgentSessionHost()
  if (!host) throw new Error('The actual product structured Agent registry is unavailable')
  const disabled = new Set<string>(snapshot.launch.disabledTuiAgents)
  const agents = []
  const details = new Map<string, { selection: AgentSelection | undefined; configuration: Awaited<ReturnType<typeof configuration>> | undefined }>()
  const projectTools = projectId === undefined || developmentMode === 'project' ? await inspectProjectToolSupport() : { available: false, reason: 'Project development was not selected' }
  for (const { definition, adapter } of host.deps.agents.registrations()) {
    const id = definition.agent
    if (onlyAgent !== undefined && id !== onlyAgent) continue
    const adapterName = adapter.constructor.name
    const registered = available('The real native adapter passed StructuredAgentRegistry validation', `StructuredAgentRegistry:${adapterName}`, 'declaration')
    const enabled = observation(disabled.has(id) ? 'unavailable' : 'available', disabled.has(id) ? 'Disabled in the selected native settings' : 'Enabled in the selected native settings', 'native-settings', 'configuration')
    const mode = projectId === undefined ? 'discovery' : 'selection'
    const installation = await observeAgentStage(mode, 'installation', async () => {
      let installed: Observation & { executable?: string; version?: string } = unknown('No absolute native command has been resolved', 'native-command-resolution', 'probe')
      let executable: string | undefined, version: string | undefined
      if (isTuiAgent(id)) {
        const spec = ACP_LAUNCH_SPECS.find(item => item.agent === id)
        const env = discoveryEnvironment()
        const sourceEnv: Record<string, string> = { ...env, HOME: snapshot.home, USERPROFILE: snapshot.home }
        if (process.env.SWA_DISCOVERY_APPDATA) sourceEnv.APPDATA = process.env.SWA_DISCOVERY_APPDATA
        if (process.env.SWA_DISCOVERY_LOCALAPPDATA) sourceEnv.LOCALAPPDATA = process.env.SWA_DISCOVERY_LOCALAPPDATA
        const overlay = snapshot.settings.agentDefaultEnv?.[id]
        const pathEnv = [overlay?.PATH ?? overlay?.Path ?? env.PATH ?? env.Path, ...(spec?.installDirectories({ env: sourceEnv, homePath: snapshot.home }) ?? [])].filter(Boolean).join(delimiter)
        const command = resolveStructuredAgentCommand(id, spec?.ignoreAgentCommandSetting ? {} : { agentCmdOverrides: snapshot.launch.agentCmdOverrides }, { pathEnv, homePath: snapshot.home }, { command: spec?.command ?? id })
        if (isAbsolute(command)) {
          executable = await realpath(command)
          if (id === 'opencode' && extname(executable).toLowerCase() === '.cmd') executable = await realpath(join(dirname(executable), 'node_modules/@opencode/cli/bin/opencode.exe'))
          if (id === 'pi') version = await readFixedPiVersion(executable, env)
          else if (id === 'opencode') version = await readFixedOpenCodeVersion(executable, env)
          else {
            const result = await readAgentCliVersion({ program: executable, cwd: process.env.SWA_DATA_DIR!, env })
            version = result.version ?? undefined
          }
          installed = version ? { ...available('The selected native executable returned its real CLI version', 'native-version-probe', 'probe'), executable, version } : unknown('The selected native executable did not prove its CLI version', 'native-version-probe', 'probe')
        } else installed = observation('unavailable', 'Native command resolution found no installed executable', 'native-command-resolution', 'probe')
      }
      return { installed, executable, version }
    })
    const installed = installation.failure ?? installation.value.installed
    const executable = installation.value?.executable, version = installation.value?.version
    const configurationResult = await observeAgentStage(mode, 'configuration', () => configuration(id, snapshot, requestedModel, projectRoot))
    const config = configurationResult.value
    const proven = !!(config?.model && config.provider && config.account)
    const configured = { ...(configurationResult.failure ?? (proven ? available('Native configuration and the explicit selection supply model, provider and an account source', 'native-configuration', 'configuration') : unknown('The observed native defaults do not supply every model, provider and account field', 'native-configuration', 'configuration'))), model: config?.model, provider: config?.provider, account_source: config?.account }
    const declared = available('The real adapter implements this structured operation; no live handshake is claimed', `adapter-declaration:${adapterName}`, 'declaration')
    const supported = id === 'pi' || id === 'opencode' || id === 'codex' || id === 'claude'
    const unsupported = observation('unavailable', '原生适配器已注册；SWA 尚无该 Agent 的受控账号、关闭工具及完整成果合同', 'swa-native-policy-unsupported', 'declaration')
    const operation = supported ? declared : unsupported
    const features = describeAgentFeatures(definition)
    const control = { start: operation, send: operation, read: unknown('No live session or complete transcript was observed', 'native-session', 'session'), stop: operation, resume: unknown('No native recovery handshake was observed', 'native-session', 'session'), tools: supported ? unknown('The selected Agent tool policy requires its own verified native contract', 'native-policy', 'session') : unsupported, questions: id === 'pi' ? available('The fixed Pi question extension is declared; actual model tool use requires its own Run evidence', 'swa-pi-question-extension', 'declaration') : observation('unavailable', 'This Agent has no native Run question contract', 'swa-native-question-policy', 'declaration'), images: features.images, model_switch: features.model_switch }
    const delegation = id === 'pi' ? available('The fixed Pi delegation extension is declared; current project permission and real execution are checked separately', 'swa-pi-delegation-extension', 'declaration') : observation('unavailable', 'This Agent has no native delegation tool contract', 'swa-native-delegation-policy', 'declaration')
    const development = ['pi', 'opencode'].includes(id) ? observation(projectTools.available ? 'available' : 'unavailable', projectTools.reason, 'swa-project-shell-probe', 'probe') : observation('unavailable', 'This Agent has no scoped project shell contract', 'swa-project-shell-policy', 'declaration')
    agents.push({ id, adapter: adapterName, execution_mode: 'structured' as const, registered, enabled, installed, configured, launchable: supported ? unknown('No actual Agent handshake was performed', 'native-session', 'session') : unsupported, authenticated: unknown('A configured account source does not prove authentication or model access', 'native-authentication-unobserved', 'session'), declared_features: features.declared_features, model_catalog: modelCatalogObservation({ model: config?.model, provider: config?.provider }), control: { ...control, delegation, development }, ...(requirements ? { requirements } : {}) })
    let selection: AgentSelection | undefined
    if (projectId && enabled.status === 'available' && executable && version && proven && config) {
      if (morphConfig && (id !== 'pi' || questionMode === 'native' || delegationMode === 'native' || developmentMode === 'project')) throw new OrchestrationError('unsupported_capability', 'Morph tools require only the fixed Pi bridge')
      if ((questionMode === 'native' || delegationMode === 'native') && id !== 'pi') throw new OrchestrationError('unsupported_capability', 'Native Run tools require the actual Pi extension contract')
      if (developmentMode === 'project' && (!['pi', 'opencode'].includes(id) || !projectTools.available)) throw new OrchestrationError('unsupported_capability', projectTools.reason)
      if (id !== 'pi' && id !== 'opencode' && id !== 'codex' && id !== 'claude' || !('sourceHome' in config) || !config.sourceHome || !config.model) throw new OrchestrationError('unsupported_capability', 'The selected native Agent account and disabled-tool policy have no reviewed contract')
      if (snapshot.settings.agentDefaultArgs?.[id]?.trim()) throw new OrchestrationError('unsupported_capability', 'The selected native Agent extra arguments have not been approved')
      const native = id === 'pi'
        ? await inspectNativePiPolicy({ executable, version, sourceHome: config.sourceHome, projectId, questionMode, delegationMode, developmentMode, morphConfig, projectRoot, ...parsePiModelOptionId(config.model), env: process.env, protectedRoots: codexProtectedRoots(snapshot, projectRoot!) })
        : id === 'opencode' ? await inspectNativeOpenCodePolicy({ executable, version, sourceHome: config.sourceHome, projectId, privateRoot: join(await realpath(process.env.SWA_DATA_DIR!), 'opencode', projectId), env: process.env, protectedRoots: codexProtectedRoots(snapshot, projectRoot!), ...(developmentMode === 'project' ? { tools: { mode: 'project', native_contract: 'opencode-cli-2.0.31', allowed: ['shell'], shell: await nativeConfigurationSource(join(z.string().min(1).parse(process.env.SWA_INSTALL_ROOT), 'runtime/project-shell')) } } : {}) })
          : id === 'codex' ? await inspectNativeCodexPolicy({ executable, version, sourceHome: config.sourceHome, projectId, privateRoot: join(await realpath(process.env.SWA_DATA_DIR!), 'codex', projectId), catalogPath: join(await realpath(process.env.SWA_INSTALL_ROOT!), 'runtime/codex-policy/models.json'), env: process.env, protectedRoots: codexProtectedRoots(snapshot, projectRoot!) })
            : await inspectNativeClaudePolicy({ executable, version, sourceHome: config.sourceHome, projectId, privateRoot: join(await realpath(process.env.SWA_DATA_DIR!), 'claude', projectId), env: process.env, protectedRoots: codexProtectedRoots(snapshot, projectRoot!) })
      selection = agentSelectionSchema.parse({ agent_id: id, adapter: adapterName, execution_mode: 'structured', executable, version, model: config.model, provider: native.policy.account.provider, external_target: id, settings_source: snapshot.source, settings_revision: snapshot.revision, configuration_version: `${snapshot.version};${config.version};${JSON.stringify(native.sources)}`, native_launch: native.policy })
    }
    details.set(id, { selection, configuration: config })
  }
  return { agents, snapshot, details }
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

export function readDiscoveryProjectRoot(root: string) {
  try {
    if (!isAbsolute(root)) throw new Error()
    const path = realpathSync.native(root)
    const spelling = (value: string) => process.platform === 'win32' ? normalize(value).toLowerCase() : normalize(value)
    if (spelling(path) !== spelling(resolve(root))) throw new Error()
    const info = statSync(path, { bigint: true })
    if (!info.isDirectory()) throw new Error()
    return { path, identity: `${info.dev}:${info.ino}:${info.birthtimeNs}` }
  } catch { throw new OrchestrationError('context_stale', 'The authorized project directory is unavailable or redirected') }
}

export function assertDiscoverySnapshot(root: ReturnType<typeof readDiscoveryProjectRoot>, before: AgentSettingsSnapshot, after: AgentSettingsSnapshot) {
  if (!isDeepStrictEqual(root, readDiscoveryProjectRoot(root.path)) || !isDeepStrictEqual(before, after)) throw new OrchestrationError('context_stale', 'The project directory or native Agent settings changed during discovery')
}

export async function discoverAgents(runtime: OrcaRuntimeService, requirements: CapabilityRequirements, projectRoot: string) {
  const root = readDiscoveryProjectRoot(projectRoot)
  // 能力查询只检查静态配置；不传 projectId，避免为全部 Agent 建立启动选择。
  const { agents, snapshot } = await inspectAgents(runtime, requirements, undefined, undefined, undefined, root.path)
  const source = await installedRegistrySource()
  const current = await readAgentSettings()
  assertDiscoverySnapshot(root, snapshot, current)
  const result = agentCapabilitiesSchema.parse({ schema: 'swa.capabilities.v1', ...source, discovery: { host: 'local', platform: process.platform, observed_at: new Date().toISOString(), settings_source: snapshot.source }, agents })
  return result
}

export async function selectAgent(runtime: OrcaRuntimeService, projectId: string, agent: string, model: string, projectRoot?: string, questionMode: 'disabled' | 'native' = 'disabled', delegationMode: 'disabled' | 'native' = 'disabled', developmentMode: 'disabled' | 'project' = 'disabled', morphConfig?: string) {
  const { details } = await inspectAgents(runtime, undefined, agent, model, projectId, projectRoot, questionMode, delegationMode, developmentMode, morphConfig)
  const item = details.get(agent)
  if (!item?.selection) throw new OrchestrationError('agent_unconfigured', 'The selected native Agent lacks proven installation or configuration')
  return agentSelectionSchema.parse({ ...item.selection, model })
}
