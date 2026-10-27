import { lstatSync, statSync, realpathSync } from 'node:fs'
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { isDeepStrictEqual } from 'node:util'
import { parse, type ParseError } from 'jsonc-parser'
import { z } from 'zod'
import { nativeConfigurationSource, readNativePiFile } from './native-pi-policy'
import { requireNativeCodexPrivatePath } from './native-codex-policy'
import { nativeOpenCodeLaunchPolicySchema } from './contracts'

const sourceSchema = z.strictObject({ path: z.string().min(1), version: z.string().min(1) })
export const nativeOpenCodePolicySchema = nativeOpenCodeLaunchPolicySchema
export type NativeOpenCodePolicy = z.infer<typeof nativeOpenCodePolicySchema>
type SourceHomeInput = { sourceHome: string; protectedRoots: readonly string[]; env: NodeJS.ProcessEnv }
export type NativeOpenCodeSnapshot = { policy: NativeOpenCodePolicy; key: string; sources: z.infer<typeof sourceSchema>[]; absentSources: string[]; sourceInput: SourceHomeInput }
const literalKey = z.string().min(1).max(16384).refine(value => value.trim() === value && !/[\x00-\x20\x7f]/.test(value))
const nativeKey = z.strictObject({ type: z.literal('key'), key: literalKey })
const legacyKey = z.strictObject({ type: z.literal('api'), key: literalKey })
const object = z.record(z.string(), z.unknown())
export const openCodeTargets = {
  deepseek: { kind: 'opencode-native-api-key', model: 'deepseek/deepseek-v4-pro', model_id: 'deepseek-v4-pro', api: 'opencode-native-deepseek', base_url: 'https://api.deepseek.com', initial_url: 'https://api.deepseek.com/chat/completions' },
  stepfun: { kind: 'opencode-native-stepfun-api-key', model: 'stepfun/step-3.5-flash', model_id: 'step-3.5-flash', api: 'openai-completions', base_url: 'https://api.stepfun.com/v1', initial_url: 'https://api.stepfun.com/v1/chat/completions' }
} as const
export type OpenCodeProvider = keyof typeof openCodeTargets
const samePath = (left: string, right: string) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
const beneath = (parent: string, child: string) => { const part = relative(process.platform === 'win32' ? parent.toLowerCase() : parent, process.platform === 'win32' ? child.toLowerCase() : child); return !part || !isAbsolute(part) && part !== '..' && !part.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) }

export const openCodePolicyPluginId = 'swa.opencode.policy'
export const openCodeBuiltinPlugins = ['opencode.provider.opencode', 'opencode.config.policy', 'opencode.agent', 'opencode.models.dev', 'opencode.config.agent', 'opencode.config.compaction'] as const
export const openCodePlugins = (provider: OpenCodeProvider, project = false): readonly string[] => [...openCodeBuiltinPlugins, ...(provider === 'stepfun' ? ['opencode.config.provider'] : []), ...(project ? ['opencode.tool.shell'] : [])]
export const openCodePermissions = (project = false) => [{ action: '*', resource: '*', effect: 'deny' }, ...(project ? [{ action: 'shell', resource: '*', effect: 'allow' }] : [])]
export const openCodeStepFunConfiguration = { package: '@opencode/ai/providers/openai-compatible', settings: { baseURL: 'https://api.stepfun.com/v1' }, models: { 'step-3.5-flash': {} } }

async function readSource(file: string, jsonc = false, privateFile = true) {
  const { source, bytes } = readNativePiFile(file, 64 * 1024, privateFile)
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes), errors: ParseError[] = []
    const value: unknown = jsonc ? parse(text, errors, { allowTrailingComma: true }) : JSON.parse(text)
    if (errors.length || !isDeepStrictEqual(source, await nativeConfigurationSource(file))) throw new Error('native_opencode_source_changed_or_invalid')
    return { source, value: object.parse(value) }
  } finally { bytes.fill(0) }
}

function possible(path: string) {
  if (!isAbsolute(path)) throw new Error('native_opencode_protected_root_invalid')
  let current = resolve(path)
  const parts: string[] = []
  for (;;) {
    try { return join(realpathSync.native(current), ...parts) }
    catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT' || dirname(current) === current) throw error; parts.unshift(basename(current)); current = dirname(current) }
  }
}
export function requireNativeOpenCodeSourceHome(input: SourceHomeInput) {
  if (!input.env.SWA_OPENCODE_API_KEY_HOME || !isAbsolute(input.sourceHome) || !samePath(resolve(input.sourceHome), resolve(input.env.SWA_OPENCODE_API_KEY_HOME)) || !input.protectedRoots.length) throw new Error('native_opencode_explicit_api_key_home_required')
  const roots = [...input.protectedRoots, input.env.SWA_INSTALL_ROOT, input.env.SWA_DATA_DIR, input.env.SWA_AGENT_PROFILE,
    input.env.SWA_CODEX_API_KEY_HOME, input.env.SWA_CLAUDE_API_KEY_HOME, input.env.CODEX_HOME, input.env.SWA_DISCOVERY_CODEX_HOME, input.env.CLAUDE_CONFIG_DIR, input.env.SWA_DISCOVERY_CLAUDE_HOME,
    join(homedir(), '.codex'), join(homedir(), '.claude'), ...(input.env.SWA_PROTECTED_ROOTS?.split(delimiter) ?? []),
    ...(input.env.SWA_DISCOVERY_HOME ? [join(input.env.SWA_DISCOVERY_HOME, '.codex'), join(input.env.SWA_DISCOVERY_HOME, '.claude')] : [])].filter((path): path is string => !!path)
  const source = possible(input.sourceHome)
  for (const root of roots) { const protectedRoot = possible(root); if (beneath(source, protectedRoot) || beneath(protectedRoot, source)) throw new Error('native_opencode_account_directory_overlap') }
  requireNativeCodexPrivatePath(input.sourceHome, true)
  return realpathSync.native(input.sourceHome)
}

export function readOpenCodeCredential(database: string, provider: OpenCodeProvider = 'deepseek') {
  requireNativeCodexPrivatePath(database, false)
  const db = new DatabaseSync(database, { readOnly: true, allowExtension: false })
  try {
    db.exec('PRAGMA query_only=ON; BEGIN')
    const bound = z.object({ count: z.number().int().nonnegative(), bytes: z.number().int().nonnegative().nullable() }).parse(db.prepare('SELECT count(*) AS count,sum(length(CAST(value AS BLOB))+length(CAST(id AS BLOB))+length(CAST(label AS BLOB))) AS bytes FROM credential WHERE integration_id=?').get(provider))
    const count = bound.count
    if (count > 1024 || (bound.bytes ?? 0) > 1024 * 1024) throw new Error('native_opencode_credential_inventory_exceeds_bound')
    const rows = z.array(z.object({ id: z.string().min(1), label: z.string(), active: z.union([z.literal(0), z.literal(1)]), time_updated: z.number().int().nonnegative(), value: z.string().max(64 * 1024), connector_id: z.null(), method_id: z.null() })).parse(db.prepare('SELECT id,label,active,time_updated,value,connector_id,method_id FROM credential WHERE integration_id=? ORDER BY active DESC,time_created DESC,id DESC').all(provider))
    if (!rows.length) throw new Error('native_opencode_credential_missing')
    const selected = rows[0]!
    if (selected.active !== 1 || rows.length !== count) throw new Error('native_opencode_credential_inactive_or_changed')
    const credential = nativeKey.parse(JSON.parse(selected.value))
    if (credential.key.trim() !== credential.key || !credential.key.trim() || /[\r\n]/.test(credential.key)) throw new Error('native_opencode_literal_key_required')
    db.exec('COMMIT')
    return { id: selected.id, label: selected.label, updatedAt: selected.time_updated, key: credential.key, count: rows.length }
  } finally { db.close() }
}

export async function inspectNativeOpenCodeAccountSource(input: SourceHomeInput) {
  const sourceHome = requireNativeOpenCodeSourceHome(input)
  const config = await readSource(join(sourceHome, '.config/opencode/opencode.jsonc'), true)
  const provider: OpenCodeProvider = config.value.model === openCodeTargets.stepfun.model ? 'stepfun' : 'deepseek'
  if (config.value.model !== openCodeTargets[provider].model) throw new Error('native_opencode_default_model_unreviewed')
  if (provider === 'stepfun') {
    if (config.value.provider !== undefined || !isDeepStrictEqual(config.value.providers, { stepfun: openCodeStepFunConfiguration })) throw new Error('native_opencode_provider_override_unreviewed')
  } else {
    const providers = config.value.providers ?? config.value.provider
    if (providers !== undefined && object.parse(providers).deepseek !== undefined) throw new Error('native_opencode_provider_override_unreviewed')
  }
  const auth = await readSource(join(sourceHome, '.local/share/opencode/auth.json'))
  const selected = legacyKey.parse(auth.value[provider])
  const database = await nativeConfigurationSource(join(sourceHome, '.local/share/opencode/opencode.db'))
  const credential = readOpenCodeCredential(database.path, provider)
  if (credential.key !== selected.key || credential.count !== 1) throw new Error('native_opencode_credential_selection_changed')
  let wal: z.infer<typeof sourceSchema> | null = null
  try { requireNativeCodexPrivatePath(database.path + '-wal', false); wal = await nativeConfigurationSource(database.path + '-wal') }
  catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error }
  return { sourceHome, provider, config, auth, database, credential, wal, key: selected.key }
}

export async function inspectNativeOpenCodeExecutable(path: string) {
  const executable = await nativeConfigurationSource(path)
  const linux = process.platform === 'linux' && process.arch === 'x64', windows = process.platform === 'win32' && process.arch === 'x64'
  if (!linux && !windows || linux && !executable.path.endsWith('/bin/opencode') || windows && !/[\\/]bin[\\/]opencode\.exe$/i.test(executable.path)) throw new Error('native_opencode_executable_unreviewed')
  const manifest = await readSource(join(dirname(dirname(executable.path)), 'package.json'), false, false)
  z.object({ name: z.literal(linux ? '@opencode/cli-linux-x64' : '@opencode/cli'), version: z.literal('2.0.31') }).parse(manifest.value)
  return { executable, manifest: manifest.source }
}

export async function inspectNativeOpenCodePolicy(input: SourceHomeInput & { executable: string; version: string; projectId: string; privateRoot: string; tools?: NativeOpenCodePolicy['tools'] }) {
  if (input.version !== '2.0.31' || !z.uuid().safeParse(input.projectId).success) throw new Error('native_opencode_contract_unavailable')
  const { executable, manifest } = await inspectNativeOpenCodeExecutable(input.executable)
  const { sourceHome, provider, config, auth, database, credential, wal, key } = await inspectNativeOpenCodeAccountSource(input)
  const target = openCodeTargets[provider]
  const tools = input.tools ?? { mode: 'disabled', native_contract: 'opencode-cli-2.0.31' }
  const projectSources: z.infer<typeof sourceSchema>[] = []
  if (tools.mode === 'project') {
    if (process.platform !== 'linux' || !input.env.SWA_INSTALL_ROOT) throw Object.assign(new Error('Project shell requires Linux bubblewrap isolation'), { code: 'unsupported_capability' })
    const install = realpathSync.native(input.env.SWA_INSTALL_ROOT)
    for (const path of [join(install, 'runtime/project-shell'), join(install, 'runtime/project-shell-entry.cjs'), join(install, 'node/node')]) {
      const source = await nativeConfigurationSource(path)
      if (source.path !== path || lstatSync(path).isSymbolicLink()) throw new Error('native_opencode_project_shell_redirected')
      projectSources.push(source)
    }
    if (!isDeepStrictEqual(tools.shell, projectSources[0])) throw new Error('native_opencode_project_shell_changed')
  }
  const policy = nativeOpenCodePolicySchema.parse({ schema: 'swa.native-launch.v1', account: {
    kind: target.kind, provider, source_home: sourceHome,
    config_source: config.source, auth_source: auth.source, database_source: { ...database, version: JSON.stringify({ database: database.version, wal: wal?.version ?? null }) },
    credential_id: credential.id, credential_updated_at: credential.updatedAt, private_root: input.privateRoot,
    model_target: { model_id: target.model_id, api: target.api, base_url: target.base_url }
  }, tools })
  const sourceEnvironment = Object.fromEntries(Object.entries(input.env).filter(([name]) => ['SWA_OPENCODE_API_KEY_HOME', 'SWA_CODEX_API_KEY_HOME', 'SWA_CLAUDE_API_KEY_HOME', 'SWA_INSTALL_ROOT', 'SWA_DATA_DIR', 'SWA_AGENT_PROFILE', 'SWA_DISCOVERY_HOME', 'SWA_PROTECTED_ROOTS', 'CODEX_HOME', 'SWA_DISCOVERY_CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'SWA_DISCOVERY_CLAUDE_HOME'].includes(name)))
  const snapshot: NativeOpenCodeSnapshot = { policy, key, sources: [executable, manifest, config.source, auth.source, database, ...(wal ? [wal] : []), ...projectSources], absentSources: wal ? [] : [database.path + '-wal'], sourceInput: { sourceHome, protectedRoots: [...input.protectedRoots], env: sourceEnvironment } }
  assertNativeOpenCodeCurrent(snapshot)
  return snapshot
}

export function assertNativeOpenCodeCurrent(snapshot: NativeOpenCodeSnapshot) {
  requireNativeOpenCodeSourceHome(snapshot.sourceInput)
  assertSourceVersions(snapshot)
  const current = readOpenCodeCredential(snapshot.policy.account.database_source.path, snapshot.policy.account.provider)
  if (current.count !== 1 || current.id !== snapshot.policy.account.credential_id || current.updatedAt !== snapshot.policy.account.credential_updated_at || current.key !== snapshot.key) throw new Error('native_opencode_credential_selection_changed')
  assertSourceVersions(snapshot)
}

function assertSourceVersions(snapshot: NativeOpenCodeSnapshot) {
  for (const source of snapshot.sources) {
    const path = realpathSync(source.path), info = statSync(path, { bigint: true })
    const version = `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}`
    if (!info.isFile() || path !== source.path || version !== source.version) throw new Error('native_opencode_source_changed')
  }
  for (const path of snapshot.absentSources) {
    try { lstatSync(path) }
    catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue; throw error }
    throw new Error('native_opencode_source_appeared')
  }
}
