import { readFile, realpath } from 'node:fs/promises'
import { lstatSync, statSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { parse, type ParseError } from 'jsonc-parser'
import { z } from 'zod'
import { nativeConfigurationSource } from './native-pi-policy'
import { nativeOpenCodeLaunchPolicySchema } from './contracts'
import { assertOpenCodeCredentialCurrent, readOpenCodeCredential, readOpenCodeDatabaseIdentity } from './native-opencode-credential'
export { assertOpenCodeCredentialCurrent, readOpenCodeCredential, readOpenCodeDatabaseIdentity } from './native-opencode-credential'

const sourceSchema = z.strictObject({ path: z.string().min(1), version: z.string().min(1) })
export const nativeOpenCodePolicySchema = nativeOpenCodeLaunchPolicySchema
export type NativeOpenCodePolicy = z.infer<typeof nativeOpenCodePolicySchema>
export type NativeOpenCodeSnapshot = { policy: NativeOpenCodePolicy; key: string; sources: z.infer<typeof sourceSchema>[]; absentSources: string[] }
const legacyKey = z.strictObject({ type: z.literal('api'), key: z.string().min(1) })
const object = z.record(z.string(), z.unknown())

export const openCodePolicyPluginId = 'swa.opencode.policy'
export const openCodeBuiltinPlugins = ['opencode.provider.opencode', 'opencode.config.policy', 'opencode.agent', 'opencode.models.dev', 'opencode.config.agent', 'opencode.config.compaction'] as const

async function readSource(file: string, jsonc = false) {
  const source = await nativeConfigurationSource(file)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(source.path))
  const errors: ParseError[] = []
  const value: unknown = jsonc ? parse(text, errors, { allowTrailingComma: true }) : JSON.parse(text)
  if (errors.length || !isDeepStrictEqual(source, await nativeConfigurationSource(file))) throw new Error('native_opencode_source_changed_or_invalid')
  return { source, value: object.parse(value) }
}

export async function inspectNativeOpenCodePolicy(input: { executable: string; version: string; sourceHome: string; projectId: string; privateRoot: string }) {
  if (input.version !== '2.0.31' || !z.uuid().safeParse(input.projectId).success) throw new Error('native_opencode_contract_unavailable')
  const executable = await nativeConfigurationSource(input.executable)
  if (!executable.path.toLowerCase().endsWith('/bin/opencode.exe') && !executable.path.toLowerCase().endsWith('\\bin\\opencode.exe')) throw new Error('native_opencode_executable_unreviewed')
  const manifest = await readSource(join(dirname(dirname(executable.path)), 'package.json'))
  z.object({ name: z.literal('@opencode/cli'), version: z.literal('2.0.31') }).parse(manifest.value)
  const sourceHome = await realpath(input.sourceHome)
  const config = await readSource(join(sourceHome, '.config/opencode/opencode.jsonc'), true)
  if (config.value.model !== 'deepseek/deepseek-v4-pro') throw new Error('native_opencode_default_model_unreviewed')
  const providers = config.value.providers ?? config.value.provider
  if (providers !== undefined && object.parse(providers).deepseek !== undefined) throw new Error('native_opencode_provider_override_unreviewed')
  const auth = await readSource(join(sourceHome, '.local/share/opencode/auth.json'))
  const selected = legacyKey.parse(auth.value.deepseek)
  const database = readOpenCodeDatabaseIdentity(join(sourceHome, '.local/share/opencode/opencode.db'))
  const credential = readOpenCodeCredential(database.path)
  if (credential.key !== selected.key) throw new Error('native_opencode_credential_selection_changed')
  const policy = nativeOpenCodePolicySchema.parse({ schema: 'swa.native-launch.v1', account: {
    kind: 'opencode-native-api-key', provider: 'deepseek', source_home: sourceHome,
    config_source: config.source, auth_source: auth.source, database_source: database,
    credential_id: credential.id, credential_updated_at: credential.updatedAt, private_root: input.privateRoot,
    model_target: { model_id: 'deepseek-v4-pro', api: 'opencode-native-deepseek', base_url: 'https://api.deepseek.com' }
  }, tools: { mode: 'disabled', native_contract: 'opencode-cli-2.0.31' } })
  const snapshot: NativeOpenCodeSnapshot = { policy, key: selected.key, sources: [executable, manifest.source, config.source, auth.source], absentSources: [] }
  assertNativeOpenCodeCurrent(snapshot)
  return snapshot
}

export function assertNativeOpenCodeCurrent(snapshot: NativeOpenCodeSnapshot) {
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
  const account = snapshot.policy.account
  assertOpenCodeCredentialCurrent(account.database_source, account.credential_id, account.credential_updated_at, snapshot.key)
}
