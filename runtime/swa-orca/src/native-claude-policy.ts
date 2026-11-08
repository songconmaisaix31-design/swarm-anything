import { createHash } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, type BigIntStats } from 'node:fs'
import { findPackageJSON } from 'node:module'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseTree, getNodeValue, type Node, type ParseError } from 'jsonc-parser'
import { z } from 'zod'
import { nativeClaudeLaunchPolicySchema } from './contracts'
import { requireNativeClaudePath } from './claude-file-security'

export { nativeClaudeSdkOptions } from '../../../third_party/orca-v1.4.230/src/main/claude/claude-structured-spawn-options'

type Source = { path: string; version: string }
type AccountInput = { sourceHome: string; protectedRoots: readonly string[]; env: NodeJS.ProcessEnv }
type Account = { sourceHome: string; authSource: Source; protectedRoots: readonly string[] }
const keySchema = z.strictObject({ env: z.strictObject({ ANTHROPIC_API_KEY: z.string().min(1).max(16384) }) })
const allowedEnvironment = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'COMSPEC', 'PATHEXT', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'OS', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'COLORTERM'])
const sdkHashes: Readonly<Record<string, string>> = {
  'sdk.mjs': '32d062c37b03e10870fbf839f54694545ee01bc0ec719e47078fbed76e30ef71',
  'sdk.d.ts': '048ae2e6c796cc2aa3c423afaad59a08972cb48c271ffcc9847d910ff65f61b2',
  'package.json': '5045b4b1e147978878f3c5cbc7fb241e697ad9ea384468e0dbdb7d02f6bea272',
  'manifest.json': '89d15995a702c15a37cbc986a33cba415aa93e9671114971e137592aad7b2bd1'
}
const linuxCliHash = '5cd90aabd83f8a15136c35aa37bb1d92b348993573316643dc3fe4e04afbf88f'
function fail(code: string): never { throw new Error(`native_claude_${code}`) }
const samePath = (a: string, b: string) => process.platform === 'win32' ? normalize(a).toLowerCase() === normalize(b).toLowerCase() : normalize(a) === normalize(b)
const version = (s: BigIntStats) => `${s.dev}:${s.ino}:${s.birthtimeNs}:${s.mtimeNs}:${s.size}`
const beneath = (a: string, b: string) => { const p = relative(a, b); return !p || p !== '..' && !p.startsWith('../') && !p.startsWith('..\\') && !isAbsolute(p) }

function readBounded(path: string, maximum: number, privateFile: boolean) {
  requireNativeClaudePath(path, { directory: false, private: privateFile })
  if (privateFile) requireNativeClaudePath(dirname(path), { directory: true, private: true })
  const before = lstatSync(path, { bigint: true })
  if (before.size < 1n || before.size > BigInt(maximum)) fail('source_exceeds_bound')
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    if (version(fstatSync(fd, { bigint: true })) !== version(before)) fail('source_changed')
    const bytes = Buffer.alloc(Number(before.size) + 1)
    let count = 0
    while (count < bytes.length) { const n = readSync(fd, bytes, count, bytes.length - count, count); if (!n) break; count += n }
    requireNativeClaudePath(path, { directory: false, private: privateFile })
    if (privateFile) requireNativeClaudePath(dirname(path), { directory: true, private: true })
    if (count !== Number(before.size) || version(fstatSync(fd, { bigint: true })) !== version(before) || version(lstatSync(path, { bigint: true })) !== version(before)) fail('source_changed')
    return { source: { path: realpathSync.native(path), version: version(before) }, bytes: bytes.subarray(0, count) }
  } finally { closeSync(fd) }
}

function strictJson(bytes: Uint8Array): unknown {
  const errors: ParseError[] = []
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { fail('source_invalid_json') }
  const tree = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false })
  if (!tree || errors.length) fail('source_invalid_json')
  function unique(node: Node) {
    if (node.type === 'object') {
      const keys = new Set<string>()
      for (const property of node.children ?? []) {
        const key = property.children?.[0]?.value
        if (typeof key !== 'string' || keys.has(key)) fail('source_duplicate_key')
        keys.add(key)
      }
    }
    for (const child of node.children ?? []) unique(child)
  }
  unique(tree)
  return getNodeValue(tree)
}

function possible(path: string): string {
  if (!isAbsolute(path)) fail('protected_root_invalid')
  let current = resolve(path)
  const parts: string[] = []
  for (;;) {
    try { requireNativeClaudePath(current, { directory: true, private: false }); return join(realpathSync.native(current), ...parts) }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT' || dirname(current) === current) throw error
      parts.unshift(basename(current)); current = dirname(current)
    }
  }
}

function inspectAccount(input: AccountInput): Account & { key: string } {
  if (!input.env.SWA_CLAUDE_API_KEY_HOME || !isAbsolute(input.sourceHome) || !samePath(resolve(input.sourceHome), resolve(input.env.SWA_CLAUDE_API_KEY_HOME))) fail('explicit_api_key_home_required')
  const roots = [...input.protectedRoots, join(homedir(), '.claude'), join(homedir(), '.codex'),
    input.env.SWA_DISCOVERY_HOME && join(input.env.SWA_DISCOVERY_HOME, '.claude'), input.env.SWA_DISCOVERY_HOME && join(input.env.SWA_DISCOVERY_HOME, '.codex'),
    input.env.CLAUDE_CONFIG_DIR, input.env.SWA_DISCOVERY_CLAUDE_HOME, input.env.CODEX_HOME, input.env.SWA_DISCOVERY_CODEX_HOME, input.env.SWA_CODEX_API_KEY_HOME, input.env.SWA_OPENCODE_API_KEY_HOME,
    input.env.SWA_INSTALL_ROOT, input.env.SWA_DATA_DIR,
    process.platform === 'win32' ? 'C:\\Program Files\\ClaudeCode' : '/etc/claude-code'
  ].filter((path): path is string => !!path)
  const candidate = possible(input.sourceHome)
  for (const root of roots) { const p = possible(root); if (beneath(candidate, p) || beneath(p, candidate)) fail('account_directory_overlap') }
  requireNativeClaudePath(input.sourceHome, { directory: true, private: true })
  const { source, bytes } = readBounded(join(input.sourceHome, 'settings.json'), 64 * 1024, true)
  try {
    const parsed = keySchema.safeParse(strictJson(bytes))
    if (!parsed.success) fail('api_key_only_required')
    const key = parsed.data.env.ANTHROPIC_API_KEY
    if (key.trim() !== key || /[\x00-\x1f\x7f]/.test(key)) fail('api_key_literal_required')
    return { sourceHome: realpathSync.native(input.sourceHome), authSource: source, key, protectedRoots: [...new Set(roots)] }
  } finally { bytes.fill(0) }
}

/** 发现阶段只返回实际来源元数据，秘密不越过本模块。 */
export async function inspectNativeClaudeAccountSource(input: AccountInput): Promise<Account> {
  const { key: _key, ...account } = inspectAccount(input)
  return account
}

export type NativeClaudeSnapshot = {
  policy: z.infer<typeof nativeClaudeLaunchPolicySchema>
  sources: Source[]
  account: Account
  key: string
  executable: string
  env: Record<string, string>
  roots: { install: string; data: string }
}

function checkAbsentManagedRoot() {
  const path = process.platform === 'win32' ? 'C:\\Program Files\\ClaudeCode' : '/etc/claude-code'
  requireNativeClaudePath(dirname(path), { directory: true, private: false })
  try { lstatSync(path) }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return; throw error }
  fail('managed_startup_source_unreviewed')
}

/** 固定版本的 bare 仍注册 builtin 并加载 plugin hooks；过滤前模块闭包尚未获审。 */
function requireReviewedStartupSources(): void {
  checkAbsentManagedRoot()
  fail('startup_builtin_module_unreviewed')
}

export async function inspectNativeClaudePolicy(input: AccountInput & { executable: string; version: string; projectId: string; privateRoot: string }): Promise<NativeClaudeSnapshot> {
  if (input.version !== '2.1.284' || !z.uuid().safeParse(input.projectId).success || input.projectId !== input.projectId.toLowerCase()) fail('identity_unverifiable')
  if (!input.env.SWA_INSTALL_ROOT || !input.env.SWA_DATA_DIR) fail('runtime_roots_missing')
  const install = possible(input.env.SWA_INSTALL_ROOT), data = possible(input.env.SWA_DATA_DIR)
  requireNativeClaudePath(install, { directory: true, private: false }); requireNativeClaudePath(data, { directory: true, private: true })
  const hostLauncher = join(install, process.platform === 'win32' ? 'swa.exe' : 'swa')
  if (!input.env.SWA_EXECUTABLE || !samePath(resolve(input.env.SWA_EXECUTABLE), hostLauncher)) fail('host_launcher_changed')
  requireNativeClaudePath(hostLauncher, { directory: false, private: false })
  const privateRoot = join(data, 'claude', input.projectId)
  if (!samePath(input.privateRoot, privateRoot)) fail('installed_paths_changed')
  const account = inspectAccount({ ...input, protectedRoots: [...input.protectedRoots, install, data, privateRoot] })
  const cli = readBounded(input.executable, 300 * 1024 * 1024, false)
  if (process.platform !== 'linux' || createHash('sha256').update(cli.bytes).digest('hex') !== linuxCliHash) fail('cli_source_unreviewed')
  const manifestPath = findPackageJSON('@anthropic-ai/claude-agent-sdk', pathToFileURL(join(install, 'runtime', 'package.json')))
  if (!manifestPath) fail('sdk_source_missing')
  const sources = [cli.source, account.authSource, { path: hostLauncher, version: version(lstatSync(hostLauncher, { bigint: true })) }]
  for (const [name, hash] of Object.entries(sdkHashes)) {
    const file = readBounded(join(dirname(manifestPath), name), 16 * 1024 * 1024, false)
    if (createHash('sha256').update(file.bytes).digest('hex') !== hash) fail('sdk_source_changed')
    sources.push(file.source)
  }
  // 完整来源门先于返回任何可启动快照，也先于 SDK 装载或 Query 构造。
  requireReviewedStartupSources()
  const { key, ...sourceAccount } = account
  const snapshot: NativeClaudeSnapshot = {
    policy: nativeClaudeLaunchPolicySchema.parse({ schema: 'swa.native-launch.v1', account: { kind: 'claude-native-api-key', provider: 'anthropic', source_home: account.sourceHome, auth_source: account.authSource, private_root: privateRoot, model_target: { model_id: 'claude-opus-5', api: 'anthropic-messages', base_url: 'https://api.anthropic.com' } }, tools: { mode: 'disabled', native_contract: 'claude-cli-2.1.284-sdk-0.3.284' } }),
    sources, account: sourceAccount, key, executable: cli.source.path,
    env: nativeClaudeEnvironment(input.env), roots: { install, data }
  }
  assertNativeClaudeCurrent(snapshot)
  return snapshot
}

export function assertNativeClaudeCurrent(snapshot: NativeClaudeSnapshot): void {
  const account = inspectAccount({ sourceHome: snapshot.account.sourceHome, protectedRoots: snapshot.account.protectedRoots, env: process.env })
  if (account.authSource.path !== snapshot.account.authSource.path || account.authSource.version !== snapshot.account.authSource.version || account.key !== snapshot.key) fail('account_source_changed')
  for (const source of snapshot.sources) {
    requireNativeClaudePath(source.path, { directory: false, private: source.path === snapshot.account.authSource.path })
    if (version(lstatSync(source.path, { bigint: true })) !== source.version) fail('source_changed_before_effect')
  }
  if (!process.env.SWA_INSTALL_ROOT || !process.env.SWA_DATA_DIR || !samePath(possible(process.env.SWA_INSTALL_ROOT), snapshot.roots.install) || !samePath(possible(process.env.SWA_DATA_DIR), snapshot.roots.data)) fail('runtime_roots_changed')
  if (!process.env.SWA_EXECUTABLE || !samePath(resolve(process.env.SWA_EXECUTABLE), join(snapshot.roots.install, process.platform === 'win32' ? 'swa.exe' : 'swa'))) fail('host_launcher_changed')
  requireReviewedStartupSources()
}

/** 允许键集合与私有环境构造使用同一来源。 */
export function nativeClaudeEnvironment(input: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(input)) {
    if (value === undefined || !allowedEnvironment.has(name.toUpperCase())) continue
    const key = process.platform === 'win32' ? name.toUpperCase() : name
    if (env[key] !== undefined && env[key] !== value) fail('environment_case_collision')
    env[key] = value
  }
  return env
}
