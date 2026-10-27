import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, type BigIntStats } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, toNamespacedPath } from 'node:path'
import { currentUserSid, getDaclAces } from '@orca/windows-security'
import { z } from 'zod'
import { getWindowsPowerShellExecutablePath } from '../../../third_party/orca-v1.4.230/src/main/agent-hooks/windows-powershell-hook-launcher'
import { nativeCodexLaunchPolicySchema } from './contracts'
import type { nativeConfigurationSource } from './native-pi-policy'
import { requirePosixPrivatePath } from './private-posix-security'

type Source = Awaited<ReturnType<typeof nativeConfigurationSource>>
type AccountInput = { sourceHome: string; protectedRoots: readonly string[]; env: NodeJS.ProcessEnv }
const catalogHash = '943ca7fe1d19ed019054158303f0dbbd80b3bef43b3aa425a71aa7cb3fb52c2b'
const emptyAuth = z.null().optional()
const authSchema = z.strictObject({ auth_mode: z.literal('apikey'), OPENAI_API_KEY: z.string().min(1).max(16384), tokens: emptyAuth, last_refresh: emptyAuth, agent_identity: emptyAuth, personal_access_token: emptyAuth, bedrock_api_key: emptyAuth, bedrock_access_keys: emptyAuth })
const allowedEnvironment = new Set(['SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'COMSPEC', 'PATHEXT', 'PATH', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'OS', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'COLORTERM', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'])

function fail(code: string): never { throw new Error(`native_codex_${code}`) }
const samePath = (left: string, right: string) => process.platform === 'win32' ? normalize(left).toLowerCase() === normalize(right).toLowerCase() : normalize(left) === normalize(right)
const sourceVersion = (info: BigIntStats) => `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}`
const beneath = (root: string, path: string) => { const part = relative(root, path); return !part || part !== '..' && !part.startsWith('../') && !part.startsWith('..\\') && !isAbsolute(part) }
const reparseCheck = Buffer.from("$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; try { $p=[IO.Path]::GetFullPath($env:SWA_CODEX_CHECK_PATH); while ($true) { $a=[IO.File]::GetAttributes($p); if (($a -band [IO.FileAttributes]::ReparsePoint) -ne 0) { exit 1 }; $parent=[IO.Path]::GetDirectoryName($p); if ([String]::IsNullOrEmpty($parent)) { break }; $p=$parent }; [Console]::Out.Write('ok') } catch { exit 1 }", 'utf16le').toString('base64')

function rejectWindowsReparse(path: string) {
  if (process.platform !== 'win32') return
  const systemRoot = process.env.SystemRoot
  if (!systemRoot || !isAbsolute(systemRoot)) fail('windows_system_root_unavailable')
  const executable = getWindowsPowerShellExecutablePath()
  try {
    if (!samePath(realpathSync.native(executable), resolve(executable))) fail('windows_attribute_reader_redirected')
    const result = execFileSync(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', reparseCheck], { env: { SystemRoot: systemRoot, WINDIR: systemRoot, SWA_CODEX_CHECK_PATH: path }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 5000, maxBuffer: 1024, encoding: 'utf8' })
    if (result !== 'ok') fail('windows_attributes_unverified')
  } catch { fail('windows_attributes_unverified') }
}

function actualPath(path: string, directory: boolean) {
  if (!isAbsolute(path) || !samePath(realpathSync.native(path), resolve(path))) fail('path_redirected')
  for (let current = resolve(path); ; current = dirname(current)) {
    const info = lstatSync(current)
    if (info.isSymbolicLink() || (current === resolve(path) && !directory ? !info.isFile() : !info.isDirectory())) fail('path_redirected')
    if (dirname(current) === current) break
  }
  // Node的符号链接判定不能覆盖所有reparse tag，使用系统属性检查完整祖先链。
  rejectWindowsReparse(path)
}

export function requireNativeCodexPrivatePath(path: string, directory: boolean) {
  actualPath(path, directory)
  if (process.platform === 'linux') { requirePosixPrivatePath(path, directory); return }
  if (process.platform !== 'win32') fail('private_security_unavailable')
  const user = currentUserSid(), acl = getDaclAces(toNamespacedPath(path)), trustees = new Set([user, 'S-1-5-18'])
  // 原生登录文件可继承受保护父目录的私有ACL；不接受其它主体或继承专用ACE。
  if (!acl || acl.ownerSid !== user || directory && !acl.protected || acl.aces.length !== trustees.size) fail('private_security_changed')
  for (const ace of acl.aces) {
    if (!ace.sid || !trustees.delete(ace.sid) || ace.type !== 0 || ace.mask !== 0x1f01ff || (directory ? ace.flags !== 3 : ace.flags !== 0 && ace.flags !== 16)) fail('private_security_changed')
  }
  if (trustees.size) fail('private_security_changed')
}

function readBounded(path: string, maximum: number, privateFile: boolean) {
  actualPath(path, false)
  if (privateFile) { requireNativeCodexPrivatePath(dirname(path), true); requireNativeCodexPrivatePath(path, false) }
  const before = lstatSync(path, { bigint: true })
  if (before.size < 1n || before.size > BigInt(maximum)) fail('source_exceeds_bound')
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    if (sourceVersion(fstatSync(fd, { bigint: true })) !== sourceVersion(before)) fail('source_changed')
    const bytes = Buffer.alloc(Number(before.size) + 1)
    let count = 0
    while (count < bytes.length) {
      const read = readSync(fd, bytes, count, bytes.length - count, count)
      if (!read) break
      count += read
    }
    actualPath(path, false)
    if (count !== Number(before.size) || sourceVersion(fstatSync(fd, { bigint: true })) !== sourceVersion(before) || sourceVersion(lstatSync(path, { bigint: true })) !== sourceVersion(before)) fail('source_changed')
    if (privateFile) { requireNativeCodexPrivatePath(dirname(path), true); requireNativeCodexPrivatePath(path, false) }
    return { source: { path: realpathSync.native(path), version: sourceVersion(before) }, bytes: bytes.subarray(0, count) }
  } finally { closeSync(fd) }
}

export function readNativeCodexApiKeyFile(path: string) {
  if (basename(path) !== 'auth.json') fail('auth_path_invalid')
  const { source, bytes } = readBounded(path, 64 * 1024, true)
  try {
    let value: unknown
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { fail('auth_invalid_json') }
    const parsed = authSchema.safeParse(value)
    if (!parsed.success) fail('api_key_only_required')
    const key = parsed.data.OPENAI_API_KEY
    if (key.trim() !== key || /[\r\n\0]/.test(key)) fail('api_key_literal_required')
    return { source, key }
  } finally { bytes.fill(0) }
}

function canonicalPossible(path: string): string {
  if (!isAbsolute(path)) fail('protected_root_invalid')
  let current = resolve(path), suffix: string[] = []
  for (;;) {
    try { return join(realpathSync.native(current), ...suffix) }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT' || dirname(current) === current) throw error
      suffix.unshift(basename(current)); current = dirname(current)
    }
  }
}

function inspectSource(input: AccountInput) {
  if (!input.env.SWA_CODEX_API_KEY_HOME || !isAbsolute(input.sourceHome) || !samePath(input.sourceHome, input.env.SWA_CODEX_API_KEY_HOME)) fail('explicit_api_key_home_required')
  const roots = [...input.protectedRoots, join(homedir(), '.codex'), join(homedir(), '.claude'), input.env.SWA_DISCOVERY_HOME ? join(input.env.SWA_DISCOVERY_HOME, '.codex') : undefined, input.env.SWA_DISCOVERY_HOME ? join(input.env.SWA_DISCOVERY_HOME, '.claude') : undefined, input.env.CODEX_HOME, input.env.SWA_DISCOVERY_CODEX_HOME, input.env.SWA_CLAUDE_API_KEY_HOME, input.env.SWA_OPENCODE_API_KEY_HOME, input.env.CLAUDE_CONFIG_DIR, input.env.SWA_DISCOVERY_CLAUDE_HOME, input.env.SWA_INSTALL_ROOT, input.env.SWA_DATA_DIR].filter((path): path is string => !!path)
  const protectedRoots = [...new Set(roots)]
  const candidate = canonicalPossible(input.sourceHome)
  for (const path of protectedRoots) {
    const protectedRoot = canonicalPossible(path)
    if (beneath(candidate, protectedRoot) || beneath(protectedRoot, candidate)) fail('account_directory_overlap')
  }
  requireNativeCodexPrivatePath(input.sourceHome, true)
  const sourceHome = realpathSync.native(input.sourceHome), auth = readNativeCodexApiKeyFile(join(sourceHome, 'auth.json'))
  return { sourceHome, authSource: auth.source, key: auth.key, protectedRoots }
}

export async function inspectNativeCodexAccountSource(input: AccountInput) { return inspectSource(input) }
export type NativeCodexAccountSource = Awaited<ReturnType<typeof inspectNativeCodexAccountSource>>
export type NativeCodexSnapshot = {
  policy: z.infer<typeof nativeCodexLaunchPolicySchema>
  sources: Source[]
  account: NativeCodexAccountSource
  key: string
  executable: string
  env: Record<string, string>
}

export async function inspectNativeCodexPolicy(input: AccountInput & { executable: string; version: string; projectId: string; privateRoot: string; catalogPath: string }) {
  if (input.version !== '0.163.0' || !z.uuid().safeParse(input.projectId).success || input.projectId !== input.projectId.toLowerCase()) fail('identity_unverifiable')
  const data = realpathSync.native(z.string().min(1).parse(input.env.SWA_DATA_DIR)), install = realpathSync.native(z.string().min(1).parse(input.env.SWA_INSTALL_ROOT))
  actualPath(data, true); actualPath(install, true)
  const privateRoot = join(data, 'codex', input.projectId), catalogPath = join(install, 'runtime/codex-policy/models.json')
  if (!samePath(input.privateRoot, privateRoot) || !samePath(input.catalogPath, catalogPath)) fail('installed_paths_changed')
  const account = inspectSource({ ...input, protectedRoots: [...input.protectedRoots, data, install, privateRoot] })
  actualPath(input.executable, false)
  const executable = realpathSync.native(input.executable), exeInfo = lstatSync(executable, { bigint: true })
  const catalog = readBounded(catalogPath, 8 * 1024 * 1024, false)
  if (createHash('sha256').update(catalog.bytes).digest('hex') !== catalogHash) fail('catalog_source_changed')
  const policy = nativeCodexLaunchPolicySchema.parse({ schema: 'swa.native-launch.v1', account: { kind: 'codex-native-api-key', provider: 'openai', source_home: account.sourceHome, auth_source: account.authSource, catalog_source: catalog.source, private_root: privateRoot, model_target: { model_id: 'gpt-5.5', api: 'openai-responses', base_url: 'https://api.openai.com/v1' } }, tools: { mode: 'disabled', native_contract: 'codex-cli-0.163.0' } })
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(input.env)) {
    if (value === undefined || !allowedEnvironment.has(name.toUpperCase())) continue
    const key = process.platform === 'win32' ? name.toUpperCase() : name
    if (env[key] !== undefined && env[key] !== value) fail('environment_case_collision')
    env[key] = value
  }
  const snapshot: NativeCodexSnapshot = { policy, account, key: account.key, executable, sources: [{ path: executable, version: sourceVersion(exeInfo) }, account.authSource, catalog.source], env }
  assertNativeCodexCurrent(snapshot)
  return snapshot
}

export function assertNativeCodexCurrent(snapshot: NativeCodexSnapshot) {
  const account = inspectSource({ sourceHome: snapshot.account.sourceHome, protectedRoots: snapshot.account.protectedRoots, env: process.env })
  if (account.authSource.version !== snapshot.account.authSource.version || account.key !== snapshot.key || !samePath(account.sourceHome, snapshot.policy.account.source_home)) fail('account_source_changed')
  for (const source of snapshot.sources) {
    actualPath(source.path, false)
    if (sourceVersion(lstatSync(source.path, { bigint: true })) !== source.version) fail('source_changed_before_effect')
  }
  if (!samePath(canonicalPossible(process.env.SWA_INSTALL_ROOT ?? ''), dirname(dirname(dirname(snapshot.policy.account.catalog_source.path)))) || !samePath(canonicalPossible(process.env.SWA_DATA_DIR ?? ''), dirname(dirname(snapshot.policy.account.private_root)))) fail('runtime_roots_changed')
}

export const codexDisabledFeatures = Object.freeze(['plugins', 'remote_plugin', 'apps', 'hooks', 'shell_tool', 'shell_snapshot', 'shell_snapshot_v2', 'stable_environment_tools', 'deferred_executor', 'code_mode', 'code_mode_only', 'code_mode_prewarm', 'code_mode_host', 'code_mode_host_grpc', 'tool_suggest', 'recommended_plugins', 'executor_capability_discovery', 'memories', 'multi_agent', 'multi_agent_v2', 'agent_message_board', 'image_generation', 'token_budget', 'current_time_reminder', 'sleep_tool', 'send_message_to_user_async', 'goals', 'guardian_approval', 'guardianv2', 'step_model_switching'] as const)

export function nativeCodexConfiguration(input: { privateHome: string; catalogPath: string }): Readonly<Record<string, unknown>> {
  if (!isAbsolute(input.privateHome) || !isAbsolute(input.catalogPath)) fail('configuration_paths_invalid')
  return Object.freeze({ model: 'gpt-5.5', model_provider: 'openai', model_catalog_json: input.catalogPath, cli_auth_credentials_store: 'file', forced_login_method: 'api', openai_base_url: 'https://api.openai.com/v1', approval_policy: 'never', sandbox_mode: 'read-only', web_search: 'disabled', 'agents.enabled': false, 'tools.update_plan.enabled': false, 'tools.experimental_request_user_input.enabled': false, 'cloud.skills.enabled': false, 'skills.include_instructions': false, 'skills.bundled.enabled': false, 'orchestrator.mcp.enabled': false, notify: [], 'analytics.enabled': false, sqlite_home: join(input.privateHome, 'sqlite'), log_dir: join(input.privateHome, 'logs'), ...Object.fromEntries(codexDisabledFeatures.map(name => [`features.${name}`, false])), 'features.skip_host_skill_discovery': true })
}

export function nativeCodexAppServerArgs(input: { privateHome: string; catalogPath: string }) {
  return [...Object.entries(nativeCodexConfiguration(input)).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]), 'app-server', '--strict-config', '--stdio']
}
