import { readFile, realpath, stat } from 'node:fs/promises'
import { lstatSync, realpathSync, statSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { resolveWindowsCmdShim } from '@orca/process-host/windows-cmd-shim-resolution'
import { z } from 'zod'
import { nativePiLaunchPolicySchema, type NativeLaunchPolicy } from './contracts'

const objectSchema = z.record(z.string(), z.unknown())
const cliPackageSchema = z.object({ name: z.literal('@earendil-works/pi-coding-agent'), version: z.literal('1.0.1'), type: z.literal('module'), bin: z.object({ pi: z.literal('dist/bundle/cli.js') }) })
const aiPackageSchema = z.object({ name: z.literal('@earendil-works/pi-ai'), version: z.literal('1.0.1') })
const credentialSchema = z.strictObject({ type: z.literal('api_key'), key: z.string().min(1), env: z.record(z.string(), z.string()).optional() })
const targetSchema = nativePiLaunchPolicySchema.shape.account.shape.model_target
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

async function readJSON(file: string) {
  const source = await nativeConfigurationSource(file)
  let value: unknown
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(source.path))) }
  catch { throw new Error('native_configuration_invalid_json') }
  if (!isDeepStrictEqual(source, await nativeConfigurationSource(file))) throw new Error('native_configuration_changed_during_read')
  return { source, value: object(value) }
}

async function optionalSource(file: string) {
  try { return await nativeConfigurationSource(file) }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

async function nativePiSources(executable: string, version: string, env: NodeJS.ProcessEnv) {
  if (version !== '1.0.1') throw new Error('native_cli_contract_unavailable')
  const launch = await nativeConfigurationSource(executable)
  let entry = launch
  let interpreter: Awaited<ReturnType<typeof nativeConfigurationSource>> | null = null
  if (process.platform === 'win32' && extname(launch.path).toLowerCase() === '.cmd') {
    const command = resolveWindowsCmdShim(launch.path, env)
    if (!command || command.prefixArgs.length !== 1 || command.env?.NODE_PATH !== env.NODE_PATH) throw new Error('native_cli_source_unverifiable')
    entry = await nativeConfigurationSource(command.prefixArgs[0]!)
    interpreter = await nativeConfigurationSource(command.program)
  }
  const manifestPath = findPackageJSON(pathToFileURL(entry.path))
  if (!manifestPath) throw new Error('native_cli_source_unverifiable')
  const manifest = await readJSON(manifestPath)
  const parsed = cliPackageSchema.safeParse(manifest.value)
  if (!parsed.success || (await realpath(resolve(dirname(manifest.source.path), parsed.data.bin.pi))).toLowerCase() !== entry.path.toLowerCase()) throw new Error('native_cli_source_unverifiable')
  const aiPath = findPackageJSON('@earendil-works/pi-ai', pathToFileURL(entry.path))
  if (!aiPath) throw new Error('native_cli_source_unverifiable')
  const ai = await readJSON(aiPath)
  if (!aiPackageSchema.safeParse(ai.value).success) throw new Error('native_cli_contract_unavailable')
  const files = await Promise.all(['core/model-config.js', 'core/provider-composer.js', 'core/resolve-config-value.js', 'core/auth-storage.js'].map(file => nativeConfigurationSource(join(dirname(manifest.source.path), 'dist', file))))
  const catalog = await nativeConfigurationSource(join(dirname(ai.source.path), 'dist/providers/all.js'))
  const apiSources = await Promise.all(['compat.js', 'api/openai-completions.lazy.js', 'api/openai-completions.js'].map(file => nativeConfigurationSource(join(dirname(ai.source.path), 'dist', file))))
  return { launch, entry, interpreter, manifest: manifest.source, aiManifest: ai.source, files, catalog, apiSources }
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
export async function inspectNativePiPolicy(input: { executable: string; version: string; sourceHome: string; projectId: string; provider: string; modelId: string; env: NodeJS.ProcessEnv }) {
  if (!z.uuid().safeParse(input.projectId).success || input.projectId !== input.projectId.toLowerCase()) throw new Error('native_project_identity_unverifiable')
  const sourceHome = await realpath(input.sourceHome)
  const dataRoot = await realpath(z.string().min(1).parse(process.env.SWA_DATA_DIR))
  const privateHome = join(dataRoot, 'pi', input.projectId)
  const beneath = (base: string, target: string) => { const part = relative(base, target); return !part || part !== '..' && !part.startsWith('..\\') && !part.startsWith('../') && !isAbsolute(part) }
  if (beneath(sourceHome, privateHome) || beneath(privateHome, sourceHome)) throw new Error('native_account_directory_overlap')
  const sources = await nativePiSources(input.executable, input.version, input.env)
  const [configModule, composer, values, authModule, catalog, apiRegistry] = await Promise.all([...sources.files.map(file => import(pathToFileURL(file.path).href)), import(pathToFileURL(sources.catalog.path).href), import(pathToFileURL(sources.apiSources[0]!.path).href)])
  if (typeof configModule.ModelConfig?.load !== 'function' || typeof composer.composeModelProvider !== 'function' || typeof values.isCommandConfigValue !== 'function' || typeof values.getConfigValueEnvVarNames !== 'function' || typeof values.resolveConfigValue !== 'function' || typeof authModule.ReadOnlyAuthStorage !== 'function' || typeof catalog.builtinProviders !== 'function' || typeof apiRegistry.getApiProvider !== 'function') throw new Error('native_cli_contract_unavailable')
  const authPath = join(sourceHome, 'auth.json'), modelsPath = join(sourceHome, 'models.json')
  const auth = await readJSON(authPath)
  const credential = credentialSchema.safeParse(auth.value[input.provider])
  if (!credential.success || Object.keys(credential.data.env ?? {}).length) throw new Error('native_api_key_source_unreviewed')
  literal(credential.data.key, values)
  let actualCredential: unknown
  try { actualCredential = await new authModule.ReadOnlyAuthStorage(auth.source.path).read(input.provider) }
  catch { throw new Error('native_auth_configuration_unverifiable') }
  if (!isDeepStrictEqual(actualCredential, { ...credential.data, key: values.resolveConfigValue(credential.data.key) })) throw new Error('native_auth_configuration_changed')
  const modelsSource = await optionalSource(modelsPath)
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
  const endpoint = new URL(target.data.base_url)
  if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('native_model_endpoint_unreviewed')
  if (!base) {
    if (target.data.api !== 'openai-completions' || endpoint.protocol !== 'https:' || !['api.stepfun.com', 'api.stepfun.ai'].includes(endpoint.hostname) || endpoint.port || !['/v1', '/v1/'].includes(endpoint.pathname)) throw new Error('native_custom_model_target_unreviewed')
    const handler = apiRegistry.getApiProvider(target.data.api)
    if (handler?.api !== target.data.api || typeof handler.stream !== 'function' || typeof handler.streamSimple !== 'function') throw new Error('native_model_api_unreviewed')
  }
  const policy = nativePiLaunchPolicySchema.parse({ schema: 'swa.native-launch.v1', account: { kind: 'pi-native-api-key', provider: input.provider, source_home: sourceHome, auth_source: auth.source, models_source: modelsSource, private_home: privateHome, model_target: target.data }, tools: { mode: 'disabled', native_contract: 'pi-cli-1.0.1' } })
  if (!isDeepStrictEqual(auth.source, await nativeConfigurationSource(authPath)) || !isDeepStrictEqual(modelsSource, await optionalSource(modelsPath))) throw new Error('native_configuration_changed_during_read')
  for (const source of [sources.launch, sources.entry, sources.interpreter, sources.manifest, sources.aiManifest, ...sources.files, sources.catalog, ...sources.apiSources]) {
    if (source && !isDeepStrictEqual(source, await nativeConfigurationSource(source.path))) throw new Error('native_cli_source_changed_during_read')
  }
  return { policy, sources, auth: { [input.provider]: { type: credential.data.type, key: credential.data.key } }, models: modelsSource === null ? null : { providers: projection ? { [input.provider]: projection } : {} } }
}

export const nativePiSettings = Object.freeze({ compaction: { enabled: false }, retry: { enabled: false, provider: { maxRetries: 0 } }, cacheWarming: 'off' })
export type NativePiPolicySnapshot = Awaited<ReturnType<typeof inspectNativePiPolicy>>
export function sameNativeLaunchPolicy(left: NativeLaunchPolicy, right: NativeLaunchPolicy) { return isDeepStrictEqual(left, right) }

export function assertNativePiSnapshotCurrent(snapshot: NativePiPolicySnapshot) {
  const sources = snapshot.sources, account = snapshot.policy.account
  for (const source of [account.auth_source, account.models_source, sources.launch, sources.entry, sources.interpreter, sources.manifest, sources.aiManifest, ...sources.files, sources.catalog, ...sources.apiSources]) {
    if (!source) continue
    const path = realpathSync.native(source.path), info = statSync(path, { bigint: true })
    const version = `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}`
    if (!info.isFile() || path !== source.path || version !== source.version) throw new Error('native_configuration_changed_before_effect')
  }
  if (account.models_source === null) {
    try { lstatSync(join(account.source_home, 'models.json')) }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
      throw error
    }
    throw new Error('native_models_configuration_appeared_before_effect')
  }
}
