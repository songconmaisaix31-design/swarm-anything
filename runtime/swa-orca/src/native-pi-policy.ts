import { realpath, stat } from 'node:fs/promises'
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, statSync, type BigIntStats } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { findPackageJSON } from 'node:module'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { resolveWindowsCmdShim } from '@orca/process-host/windows-cmd-shim-resolution'
import { z } from 'zod'
import { nativePiLaunchPolicySchema, nativePiPerSessionLaunchPolicySchema, type NativeLaunchPolicy } from './contracts'
import { requireNativeCodexPrivatePath } from './native-codex-policy'
import officialSources from './pi-official-sources.json'
import { parseStrictPiJson, strictPiModelSchema, type StrictPiModel } from '../../../third_party/orca-v1.4.230/src/main/pi/rpc-protocol'

const objectSchema = z.record(z.string(), z.unknown())
const cliPackageSchema = z.object({ name: z.literal('@earendil-works/pi-coding-agent'), version: z.literal('1.0.1'), type: z.literal('module'), bin: z.object({ pi: z.literal('dist/bundle/cli.js') }) })
const aiPackageSchema = z.object({ name: z.literal('@earendil-works/pi-ai'), version: z.literal('1.0.1') })
const credentialSchema = z.strictObject({ type: z.literal('api_key'), key: z.string().min(1).max(16384).refine(value => value.trim() === value && !/[\r\n\0]/.test(value)), env: z.record(z.string(), z.string()).optional() })
const targetSchema = nativePiLaunchPolicySchema.shape.account.shape.model_target
const versionOf = (info: BigIntStats) => `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}`
const samePath = (left: string, right: string) => process.platform === 'win32' ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right)
const beneath = (root: string, path: string) => { const part = relative(process.platform === 'win32' ? root.toLowerCase() : root, process.platform === 'win32' ? path.toLowerCase() : path); return !part || part !== '..' && !part.startsWith('../') && !part.startsWith('..\\') && !isAbsolute(part) }
const providerFields = new Set(['name', 'baseUrl', 'api', 'headers', 'compat', 'authHeader', 'models', 'modelOverrides'])
const modelFields = new Set(['id', 'name', 'api', 'baseUrl', 'reasoning', 'thinkingLevelMap', 'input', 'inputLimits', 'cost', 'promptCache', 'contextWindow', 'maxTokens', 'samplingParams', 'headers', 'compat'])
const overrideFields = new Set([...modelFields].filter(key => !['id', 'api', 'baseUrl'].includes(key)))
const compatFields = new Set(['supportsStore', 'supportsDeveloperRole', 'supportsReasoningEffort', 'supportsUsageInStreaming', 'supportsFinishReason', 'maxTokensField', 'requiresToolResultName', 'requiresAssistantAfterToolResult', 'requiresThinkingAsText', 'requiresReasoningContentOnAssistantMessages', 'thinkingFormat', 'chatTemplateKwargs', 'chatTemplateArgs', 'cacheControlFormat', 'supportsOpenAIGrammarTools', 'supportsStrictMode', 'sendSessionAffinityHeaders', 'sessionAffinityFormat', 'supportsLongCacheRetention', 'vllmPriority', 'supportsMaxOutputTokens'])
const authenticationHeaders = new Set(['authorization', 'proxy-authorization', 'x-api-key', 'api-key', 'cookie', 'set-cookie'])
const routingFields = new Set(['allowedFallbackModels', 'openRouterRouting', 'vercelGatewayRouting'])
type NativePiValues = {
  isCommandConfigValue(value: string): boolean
  getConfigValueEnvVarNames(value: string): string[]
  resolveConfigValue(value: string): string | undefined
}

function object(value: unknown): Record<string, unknown> {
  const parsed = objectSchema.safeParse(value)
  if (!parsed.success) throw new Error('native_configuration_unverifiable')
  return parsed.data
}

export async function nativeConfigurationSource(file: string) {
  if (!isAbsolute(file)) throw new Error('native_configuration_path_unverifiable')
  const path = await realpath(file)
  const info = await stat(path, { bigint: true })
  if (!info.isFile()) throw new Error('native_configuration_source_unverifiable')
  return { path, version: `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}` }
}

async function readJSON(file: string, maximum = 1024 * 1024, privateFile = false) {
  const { source, bytes } = readNativePiFile(file, maximum, privateFile)
  let value: unknown
  try { value = parseStrictPiJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  catch { throw new Error('native_configuration_invalid_json') }
  if (!isDeepStrictEqual(source, await nativeConfigurationSource(file))) throw new Error('native_configuration_changed_during_read')
  return { source, value: object(value) }
}

// 同一FD读取时限量，路径及FD版本均须保持；不能只在readFile前检查大小。
export function readNativePiFile(file: string, maximum: number, privateFile = false) {
  if (!isAbsolute(file)) throw new Error('native_pi_source_path_invalid')
  const path = realpathSync.native(file)
  if (!samePath(path, file)) throw new Error('native_pi_source_redirected')
  if (privateFile) requireNativeCodexPrivatePath(path, false)
  const before = lstatSync(path, { bigint: true })
  if (!before.isFile() || before.isSymbolicLink() || before.size > BigInt(maximum)) throw new Error('native_pi_source_exceeds_bound')
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    if (versionOf(fstatSync(fd, { bigint: true })) !== versionOf(before)) throw new Error('native_pi_source_changed')
    const bytes = Buffer.alloc(Number(before.size) + 1)
    let count = 0
    while (count < bytes.length) { const size = readSync(fd, bytes, count, bytes.length - count, count); if (!size) break; count += size }
    if (count !== Number(before.size) || versionOf(fstatSync(fd, { bigint: true })) !== versionOf(before) || versionOf(lstatSync(path, { bigint: true })) !== versionOf(before) || !samePath(realpathSync.native(path), path)) throw new Error('native_pi_source_changed')
    if (privateFile) requireNativeCodexPrivatePath(path, false)
    return { source: { path, version: versionOf(before) }, bytes: bytes.subarray(0, count) }
  } finally { closeSync(fd) }
}

function canonicalPossible(path: string): string {
  if (!isAbsolute(path)) throw new Error('native_pi_protected_root_invalid')
  let current = resolve(path)
  const suffix: string[] = []
  for (;;) {
    try { return join(realpathSync.native(current), ...suffix) }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT' || dirname(current) === current) throw error
      suffix.unshift(basename(current)); current = dirname(current)
    }
  }
}

export type NativePiSourceHomeInput = { sourceHome: string; protectedRoots: readonly string[]; env: NodeJS.ProcessEnv }
function assertNativePiSourceHome(input: NativePiSourceHomeInput) {
  if (!isAbsolute(input.sourceHome) || !input.protectedRoots.length) throw new Error('native_pi_source_boundary_required')
  const roots = [...input.protectedRoots, join(homedir(), '.codex'), join(homedir(), '.claude'), input.env.SWA_INSTALL_ROOT, input.env.SWA_DATA_DIR,
    input.env.CODEX_HOME, input.env.SWA_DISCOVERY_CODEX_HOME, input.env.CLAUDE_CONFIG_DIR, input.env.SWA_DISCOVERY_CLAUDE_HOME,
    input.env.SWA_CODEX_API_KEY_HOME, input.env.SWA_CLAUDE_API_KEY_HOME, input.env.SWA_OPENCODE_API_KEY_HOME,
    ...(input.env.SWA_PROTECTED_ROOTS?.split(process.platform === 'win32' ? ';' : ':') ?? []),
    ...(input.env.SWA_DISCOVERY_HOME ? [join(input.env.SWA_DISCOVERY_HOME, '.codex'), join(input.env.SWA_DISCOVERY_HOME, '.claude')] : [])].filter((path): path is string => !!path)
  const candidate = canonicalPossible(input.sourceHome)
  for (const root of roots) { const protectedRoot = canonicalPossible(root); if (beneath(candidate, protectedRoot) || beneath(protectedRoot, candidate)) throw new Error('native_pi_account_directory_overlap') }
  requireNativeCodexPrivatePath(input.sourceHome, true)
  for (const name of ['auth.json', 'models.json', 'settings.json']) {
    const path = join(input.sourceHome, name)
    try { lstatSync(path) }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue; throw error }
    requireNativeCodexPrivatePath(path, false)
  }
  return realpathSync.native(input.sourceHome)
}
// 发现与完整policy共同消费，任何auth/settings正文读取都在这个metadata门之后。
export async function requireNativePiSourceHome(input: NativePiSourceHomeInput): Promise<string> { return assertNativePiSourceHome(input) }

async function optionalSource(file: string) {
  try { return await nativeConfigurationSource(file) }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

function linuxPiInterpreter() {
  const configured = process.env.SWA_NODE_EXECUTABLE
  const install = process.env.SWA_INSTALL_ROOT
  if (!configured || !install || !isAbsolute(configured) || !isAbsolute(install)) throw new Error('native_pi_interpreter_unverifiable')
  const root = realpathSync.native(install)
  const expected = join(root, 'node', 'node')
  if (root !== resolve(install) || realpathSync.native(expected) !== expected || resolve(configured) !== expected || realpathSync.native(configured) !== expected || realpathSync.native(process.execPath) !== expected) throw new Error('native_pi_interpreter_unverifiable')
  const installed = statSync(expected, { bigint: true }), running = statSync('/proc/self/exe', { bigint: true })
  if (!installed.isFile() || !running.isFile() || installed.dev !== running.dev || installed.ino !== running.ino) throw new Error('native_pi_interpreter_unverifiable')
  return expected
}

export async function inspectNativePiSources(executable: string, version: string, env: NodeJS.ProcessEnv) {
  if (version !== '1.0.1') throw new Error('native_cli_contract_unavailable')
  const launch = await nativeConfigurationSource(executable)
  let entry = launch
  let interpreter: Awaited<ReturnType<typeof nativeConfigurationSource>> | null = null
  if (process.platform === 'linux') interpreter = await nativeConfigurationSource(linuxPiInterpreter())
  else if (process.platform === 'win32' && extname(launch.path).toLowerCase() === '.cmd') {
    const command = resolveWindowsCmdShim(launch.path, env)
    if (!command || command.prefixArgs.length !== 1 || command.env?.NODE_PATH !== env.NODE_PATH) throw new Error('native_cli_source_unverifiable')
    entry = await nativeConfigurationSource(command.prefixArgs[0]!)
    interpreter = await nativeConfigurationSource(command.program)
  }
  const manifestPath = findPackageJSON(pathToFileURL(entry.path))
  if (!manifestPath) throw new Error('native_cli_source_unverifiable')
  const manifest = await readJSON(manifestPath)
  const parsed = cliPackageSchema.safeParse(manifest.value)
  if (!parsed.success) throw new Error('native_cli_source_unverifiable')
  const declaredEntry = await realpath(resolve(dirname(manifest.source.path), parsed.data.bin.pi))
  if (process.platform === 'win32' ? declaredEntry.toLowerCase() !== entry.path.toLowerCase() : declaredEntry !== entry.path) throw new Error('native_cli_source_unverifiable')
  const aiPath = findPackageJSON('@earendil-works/pi-ai', pathToFileURL(entry.path))
  if (!aiPath) throw new Error('native_cli_source_unverifiable')
  const ai = await readJSON(aiPath)
  if (!aiPackageSchema.safeParse(ai.value).success) throw new Error('native_cli_contract_unavailable')
  const files = await Promise.all(['core/model-config.js', 'core/provider-composer.js', 'core/resolve-config-value.js', 'core/auth-storage.js'].map(file => nativeConfigurationSource(join(dirname(manifest.source.path), 'dist', file))))
  const catalog = await nativeConfigurationSource(join(dirname(ai.source.path), 'dist/providers/all.js'))
  const apiSources = await Promise.all(['compat.js', 'api/openai-completions.lazy.js', 'api/openai-completions.js'].map(file => nativeConfigurationSource(join(dirname(ai.source.path), 'dist', file))))
  const pinnedFiles: Awaited<ReturnType<typeof nativeConfigurationSource>>[] = []
  const seen = new Set<string>(), packages = new Map<string, string>()
  for (const pin of officialSources.files) {
    if (seen.has(pin.path) || !/^[a-f0-9]{64}$/.test(pin.sha256) || !Number.isSafeInteger(pin.bytes) || pin.bytes < 1 || pin.path.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('native_pi_official_source_table_invalid')
    seen.add(pin.path)
    const parts = pin.path.split('/'), length = parts[0]!.startsWith('@') ? 2 : 1, name = parts.slice(0, length).join('/')
    let root = packages.get(name)
    if (!root) {
      const packageFile = findPackageJSON(name, pathToFileURL(entry.path))
      if (!packageFile) throw new Error('native_pi_official_package_missing')
      root = dirname(realpathSync.native(packageFile)); packages.set(name, root)
    }
    const { source, bytes } = readNativePiFile(join(root, ...parts.slice(length)), pin.bytes)
    if (bytes.length !== pin.bytes || createHash('sha256').update(bytes).digest('hex') !== pin.sha256) throw new Error('native_pi_official_source_mismatch')
    pinnedFiles.push(source)
  }
  return { launch, entry, interpreter, manifest: manifest.source, aiManifest: ai.source, files, catalog, apiSources, pinnedFiles }
}
export type NativePiSources = Awaited<ReturnType<typeof inspectNativePiSources>>
export type NativePiModelTarget = z.infer<typeof targetSchema>

export function assertNativePiSourcesCurrent(sources: Awaited<ReturnType<typeof inspectNativePiSources>>) {
  if (process.platform === 'linux' && sources.interpreter?.path !== linuxPiInterpreter()) throw new Error('native_pi_interpreter_unverifiable')
  for (const source of [sources.launch, sources.entry, sources.interpreter, sources.manifest, sources.aiManifest, ...sources.files, sources.catalog, ...sources.apiSources, ...sources.pinnedFiles]) {
    if (!source) continue
    const path = realpathSync.native(source.path), info = statSync(path, { bigint: true })
    const version = `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}`
    if (!info.isFile() || path !== source.path || version !== source.version) throw new Error('native_configuration_changed_before_effect')
  }
}

function knownFields(value: Record<string, unknown>, allowed: ReadonlySet<string>) {
  if (Object.keys(value).some(key => !allowed.has(key))) throw new Error('native_configuration_field_unreviewed')
}

function emptySampling(value: Record<string, unknown>) {
  if (value.samplingParams !== undefined && Object.keys(object(value.samplingParams)).length) throw new Error('native_sampling_parameters_unreviewed')
}

function literal(value: unknown, modules: NativePiValues): string {
  if (typeof value !== 'string' || modules.isCommandConfigValue(value) || modules.getConfigValueEnvVarNames(value).length) throw new Error('native_configuration_literal_required')
  return value
}

function headers(value: unknown, modules: NativePiValues) {
  if (value === undefined) return
  const input = object(value)
  const validated = new Headers()
  for (const [name, expression] of Object.entries(input)) {
    if (authenticationHeaders.has(name.toLowerCase())) throw new Error('native_authentication_header_override')
    const original = literal(expression, modules)
    const decoded = modules.resolveConfigValue(original)
    if (typeof decoded !== 'string') throw new Error('native_configuration_literal_required')
    try { validated.append(name, decoded) }
    catch { throw new Error('native_header_invalid') }
  }
}

function compat(value: unknown) {
  if (value === undefined) return
  const configuration = object(value)
  knownFields(configuration, new Set([...compatFields, ...routingFields]))
  for (const key of routingFields) {
    const routing = configuration[key]
    if (routing !== undefined && (Array.isArray(routing) ? routing.length !== 0 : Object.keys(object(routing)).length !== 0)) throw new Error('native_model_routing_unreviewed')
  }
}

function reviewedModel(value: Record<string, unknown>, fields: ReadonlySet<string>, modules: NativePiValues) {
  knownFields(value, fields)
  emptySampling(value)
  headers(value.headers, modules)
  compat(value.compat)
}

// 只调用真实安装CLI的只读配置、原composer和catalog，不调用认证解析、刷新或模型请求。
export async function inspectNativePiPolicy(input: NativePiSourceHomeInput & { executable: string; version: string; projectId: string; provider: string; modelId: string; questionMode?: 'disabled' | 'native' }) {
  if (!z.uuid().safeParse(input.projectId).success || input.projectId !== input.projectId.toLowerCase()) throw new Error('native_project_identity_unverifiable')
  const sourceHome = await requireNativePiSourceHome(input)
  const dataRoot = await realpath(z.string().min(1).parse(process.env.SWA_DATA_DIR))
  const privateRoot = join(dataRoot, 'pi-workers', input.projectId)
  const beneath = (base: string, target: string) => { const part = relative(base, target); return !part || part !== '..' && !part.startsWith('..\\') && !part.startsWith('../') && !isAbsolute(part) }
  if (beneath(sourceHome, privateRoot) || beneath(privateRoot, sourceHome)) throw new Error('native_account_directory_overlap')
  const sources = await inspectNativePiSources(input.executable, input.version, input.env)
  assertNativePiSourcesCurrent(sources)
  const [configModule, composer, values, authModule, catalog, apiRegistry] = await Promise.all([...sources.files.map(file => import(pathToFileURL(file.path).href)), import(pathToFileURL(sources.catalog.path).href), import(pathToFileURL(sources.apiSources[0]!.path).href)])
  if (typeof configModule.ModelConfig?.load !== 'function' || typeof composer.composeModelProvider !== 'function' || typeof values.isCommandConfigValue !== 'function' || typeof values.getConfigValueEnvVarNames !== 'function' || typeof values.resolveConfigValue !== 'function' || typeof authModule.ReadOnlyAuthStorage !== 'function' || typeof catalog.builtinProviders !== 'function' || typeof apiRegistry.getApiProvider !== 'function') throw new Error('native_cli_contract_unavailable')
  const authPath = join(sourceHome, 'auth.json'), modelsPath = join(sourceHome, 'models.json')
  requireNativeCodexPrivatePath(authPath, false)
  const auth = await readJSON(authPath, 64 * 1024, true)
  const credential = credentialSchema.safeParse(auth.value[input.provider])
  if (!credential.success || Object.keys(credential.data.env ?? {}).length) throw new Error('native_api_key_source_unreviewed')
  literal(credential.data.key, values)
  let actualCredential: unknown
  try { actualCredential = await new authModule.ReadOnlyAuthStorage(auth.source.path).read(input.provider) }
  catch { throw new Error('native_auth_configuration_unverifiable') }
  if (!isDeepStrictEqual(actualCredential, { ...credential.data, key: values.resolveConfigValue(credential.data.key) })) throw new Error('native_auth_configuration_changed')
  const modelsSource = await optionalSource(modelsPath)
  if (modelsSource) readNativePiFile(modelsPath, 64 * 1024, true)
  const settingsSource = await optionalSource(join(sourceHome, 'settings.json'))
  const config = await configModule.ModelConfig.load(modelsSource?.path)
  if (config.getError()) throw new Error('native_models_configuration_unverifiable')
  const bases = catalog.builtinProviders().filter((provider: { id: string }) => provider.id === input.provider)
  if (bases.length > 1 || bases[0] && !bases[0].auth.apiKey) throw new Error('native_api_key_handler_unavailable')
  const base = bases[0], configured = config.getProvider(input.provider)
  if (!base && (!modelsSource || configured === undefined)) throw new Error('native_model_target_unverifiable')
  let projection: Record<string, unknown> | undefined
  if (configured !== undefined) {
    const provider = object(configured)
    knownFields(provider, providerFields)
    if (provider.authHeader !== undefined && provider.authHeader !== false) throw new Error('native_authentication_header_override')
    headers(provider.headers, values)
    compat(provider.compat)
    const models = provider.models === undefined ? [] : z.array(objectSchema).parse(provider.models).filter(item => item.id === input.modelId)
    if (models.length > 1) throw new Error('native_model_target_ambiguous')
    if (!base && models.length !== 1) throw new Error('native_model_target_unverifiable')
    for (const model of models) reviewedModel(model, modelFields, values)
    const overrides = provider.modelOverrides === undefined ? {} : object(provider.modelOverrides)
    const override = overrides[input.modelId] === undefined ? undefined : object(overrides[input.modelId])
    if (override) reviewedModel(override, overrideFields, values)
    projection = { ...provider, ...(provider.models === undefined ? {} : { models }), ...(provider.modelOverrides === undefined ? {} : { modelOverrides: override ? { [input.modelId]: override } : {} }) }
    if (!models.length && !override && !['baseUrl', 'headers', 'compat', 'authHeader'].some(key => provider[key] !== undefined)) projection = undefined
  }
  headers(base?.headers, values)
  for (const model of (base?.getModels() ?? []).filter((item: { id: string }) => item.id === input.modelId)) {
    emptySampling(object(model))
    headers(model.headers, values)
    compat(model.compat)
  }
  const effective = configured ? composer.composeModelProvider(input.provider, base, config, undefined) : base
  if (!effective?.auth.apiKey) throw new Error('native_api_key_handler_unavailable')
  const models = effective.getModels().filter((item: { id: string }) => item.id === input.modelId)
  if (models.length !== 1) throw new Error('native_model_target_unverifiable')
  const model = object(models[0])
  emptySampling(model)
  headers(model.headers, values)
  compat(model.compat)
  const target = targetSchema.safeParse({ model_id: input.modelId, api: model.api, base_url: model.baseUrl })
  if (!target.success || model.provider !== input.provider) throw new Error('native_model_api_unreviewed')
  if (target.data.api !== 'openai-completions') throw new Error('native_model_api_execution_unreviewed')
  const endpoint = new URL(target.data.base_url)
  if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('native_model_endpoint_unreviewed')
  if (!base) {
    if (target.data.api !== 'openai-completions' || endpoint.protocol !== 'https:' || !['api.stepfun.com', 'api.stepfun.ai'].includes(endpoint.hostname) || endpoint.port || !['/v1', '/v1/'].includes(endpoint.pathname)) throw new Error('native_custom_model_target_unreviewed')
    const handler = apiRegistry.getApiProvider(target.data.api)
    if (handler?.api !== target.data.api || typeof handler.stream !== 'function' || typeof handler.streamSimple !== 'function') throw new Error('native_model_api_unreviewed')
  }
  const tools = input.questionMode === 'native'
    ? { mode: 'questions-only', native_contract: 'pi-cli-1.0.1', allowed: ['swa_ask'], extension: await nativeConfigurationSource(join(z.string().min(1).parse(input.env.SWA_INSTALL_ROOT), 'runtime', 'pi-question-extension.mjs')) }
    : { mode: 'disabled', native_contract: 'pi-cli-1.0.1' }
  const policy = nativePiPerSessionLaunchPolicySchema.parse({ schema: 'swa.native-launch.v1', account: { kind: 'pi-native-api-key-per-session', provider: input.provider, source_home: sourceHome, auth_source: auth.source, models_source: modelsSource, private_root: privateRoot, model_target: target.data }, tools })
  if (!isDeepStrictEqual(auth.source, await nativeConfigurationSource(authPath)) || !isDeepStrictEqual(modelsSource, await optionalSource(modelsPath))) throw new Error('native_configuration_changed_during_read')
  for (const source of [sources.launch, sources.entry, sources.interpreter, sources.manifest, sources.aiManifest, ...sources.files, sources.catalog, ...sources.apiSources, ...sources.pinnedFiles]) {
    if (source && !isDeepStrictEqual(source, await nativeConfigurationSource(source.path))) throw new Error('native_cli_source_changed_during_read')
  }
  const sourceEnvironment = Object.fromEntries(Object.entries(input.env).filter(([key]) => ['SWA_INSTALL_ROOT', 'SWA_DATA_DIR', 'SWA_PROTECTED_ROOTS', 'SWA_DISCOVERY_HOME', 'CODEX_HOME', 'SWA_DISCOVERY_CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'SWA_DISCOVERY_CLAUDE_HOME', 'SWA_CODEX_API_KEY_HOME', 'SWA_CLAUDE_API_KEY_HOME', 'SWA_OPENCODE_API_KEY_HOME'].includes(key)))
  return { policy, sources, settingsSource, sourceInput: { sourceHome, protectedRoots: [...input.protectedRoots], env: sourceEnvironment }, auth: { [input.provider]: { type: credential.data.type, key: credential.data.key } }, models: modelsSource === null ? null : { providers: projection ? { [input.provider]: projection } : {} } }
}

export const nativePiSettings = Object.freeze({ compaction: { enabled: false }, retry: { enabled: false, provider: { maxRetries: 0 } }, cacheWarming: 'off' })
export type NativePiPolicySnapshot = Awaited<ReturnType<typeof inspectNativePiPolicy>>
export type NativePiPerSessionSnapshot = NativePiPolicySnapshot
export type NativePiLegacyPolicySnapshot = Omit<NativePiPolicySnapshot, 'policy'> & { policy: z.infer<typeof nativePiLaunchPolicySchema> }
export type PiApprovedModelMetadata = { provider: string; models: readonly StrictPiModel[]; modelsSource: Awaited<ReturnType<typeof nativeConfigurationSource>> | null }

export async function inspectPrivatePiModelMetadata(input: { sources: NativePiSources; privateHome: string; provider: string; target: NativePiModelTarget; expectedModels: NativePiPerSessionSnapshot['models'] }): Promise<PiApprovedModelMetadata> {
  requireNativeCodexPrivatePath(input.privateHome, true)
  assertNativePiSourcesCurrent(input.sources)
  const path = join(input.privateHome, 'models.json')
  const source = await optionalSource(path)
  if (input.expectedModels === null ? source !== null : source === null) throw new Error('native_pi_private_models_changed')
  if (source) {
    requireNativeCodexPrivatePath(path, false)
    const observed = await readJSON(path, 64 * 1024, true)
    if (!isDeepStrictEqual(observed.value, input.expectedModels)) throw new Error('native_pi_private_models_changed')
  }
  const [configModule, composer, values, catalog] = await Promise.all([input.sources.files[0]!, input.sources.files[1]!, input.sources.files[2]!, input.sources.catalog].map(file => import(pathToFileURL(file.path).href)))
  const config = await configModule.ModelConfig.load(source?.path)
  if (config.getError() || config.getProviderIds().some((id: string) => id !== input.provider)) throw new Error('native_pi_private_models_unreviewed')
  const bases = catalog.builtinProviders().filter((provider: { id: string }) => provider.id === input.provider)
  if (bases.length > 1) throw new Error('native_pi_private_models_unreviewed')
  const provider = config.getProvider(input.provider) ? composer.composeModelProvider(input.provider, bases[0], config, undefined) : bases[0]
  if (!provider) throw new Error('native_pi_model_metadata_missing')
  const models: StrictPiModel[] = []
  for (const actual of provider.getModels()) {
    const value = object(actual)
    emptySampling(value); headers(value.headers, values); compat(value.compat)
    const parsed = strictPiModelSchema.safeParse(JSON.parse(JSON.stringify(actual)))
    if (!parsed.success || parsed.data.provider !== input.provider) throw new Error('native_pi_model_metadata_unreviewed')
    models.push(parsed.data)
  }
  const selected = models.filter(model => model.id === input.target.model_id && model.api === input.target.api && model.baseUrl === input.target.base_url)
  if (selected.length !== 1 || new Set(models.map(model => model.id)).size !== models.length) throw new Error('native_pi_model_metadata_ambiguous')
  assertNativePiSourcesCurrent(input.sources)
  if (!isDeepStrictEqual(source, await optionalSource(path))) throw new Error('native_pi_private_models_changed')
  return Object.freeze({ provider: input.provider, models: Object.freeze(models), modelsSource: source })
}
export function sameNativeLaunchPolicy(left: NativeLaunchPolicy, right: NativeLaunchPolicy) { return isDeepStrictEqual(left, right) }

export function assertNativePiSnapshotCurrent(snapshot: NativePiPolicySnapshot) {
  const sources = snapshot.sources, account = snapshot.policy.account
  if (!samePath(assertNativePiSourceHome(snapshot.sourceInput), account.source_home)) throw new Error('native_pi_source_home_changed')
  assertNativePiSourcesCurrent(sources)
  for (const source of [account.auth_source, account.models_source, snapshot.settingsSource, ...(snapshot.policy.tools.mode === 'questions-only' ? [snapshot.policy.tools.extension] : [])]) {
    if (!source) continue
    const path = realpathSync.native(source.path), info = statSync(path, { bigint: true })
    const version = `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}`
    if (!info.isFile() || path !== source.path || version !== source.version) throw new Error('native_configuration_changed_before_effect')
  }
  if (snapshot.settingsSource === null) {
    try { lstatSync(join(account.source_home, 'settings.json')) }
    catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; return assertModelsAbsence() }
    throw new Error('native_settings_configuration_appeared_before_effect')
  }
  assertModelsAbsence()
  function assertModelsAbsence() {
  if (account.models_source === null) {
    try { lstatSync(join(account.source_home, 'models.json')) }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
      throw error
    }
    throw new Error('native_models_configuration_appeared_before_effect')
  }
  }
}
