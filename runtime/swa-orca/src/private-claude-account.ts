import { lstatSync, realpathSync } from 'node:fs'
import { basename, delimiter, isAbsolute, join, normalize } from 'node:path'
import { z } from 'zod'
import { createPrivateClaudeDirectory, requireNativeClaudePath } from './claude-file-security'
import { assertNativeClaudeCurrent, type NativeClaudeSnapshot } from './native-claude-policy'

const environmentDirectories = ['home', 'config', 'appdata', 'localappdata', 'temp', 'xdg-config', 'xdg-data', 'xdg-cache', 'xdg-state', 'xdg-runtime', 'xdg-config-dirs', 'xdg-data-dirs'] as const
const forbiddenEntries = ['settings.json', 'settings.local.json', '.credentials.json', '.mcp.json', 'plugins', 'skills', 'agents', 'commands'] as const
const allowedEnvironment = new Set(['SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'COMSPEC', 'PATHEXT', 'PATH', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'OS', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'COLORTERM'])
const samePath = (left: string, right: string) => process.platform === 'win32' ? normalize(left).toLowerCase() === normalize(right).toLowerCase() : normalize(left) === normalize(right)

function fail(code: string): never { throw new Error(`private_claude_${code}`) }

function absent(path: string) {
  try { lstatSync(path) }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
  fail('unexpected_configuration')
}

function layout(snapshot: NativeClaudeSnapshot, sessionId: string) {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(sessionId)) fail('session_identity_invalid')
  assertNativeClaudeCurrent(snapshot)
  const configuredData = process.env.SWA_DATA_DIR
  if (!configuredData || !isAbsolute(configuredData)) fail('data_root_unavailable')
  requireNativeClaudePath(configuredData, { directory: true, private: true })
  const data = realpathSync.native(configuredData), agentRoot = join(data, 'claude')
  const projectId = basename(snapshot.policy.account.private_root)
  if (!z.uuid().safeParse(projectId).success || projectId !== projectId.toLowerCase()) fail('project_identity_invalid')
  const privateRoot = join(agentRoot, projectId)
  if (!samePath(privateRoot, snapshot.policy.account.private_root)) fail('private_root_changed')
  const sessionRoot = join(privateRoot, sessionId)
  return { data, agentRoot, privateRoot, sessionRoot, configRoot: join(sessionRoot, 'config'), home: join(sessionRoot, 'home') }
}

function verifyLayout(snapshot: NativeClaudeSnapshot, sessionId: string) {
  const paths = layout(snapshot, sessionId)
  for (const path of [paths.data, paths.agentRoot, paths.privateRoot, paths.sessionRoot, ...environmentDirectories.map(name => join(paths.sessionRoot, name))]) {
    requireNativeClaudePath(path, { directory: true, private: true })
  }
  // 这里只检查固定配置入口；完整启动来源证明仍由 NativeLaunch 的事前政策门负责。
  for (const root of [paths.configRoot, paths.home]) for (const name of forbiddenEntries) absent(join(root, name))
  absent(join(paths.home, '.claude'))
  assertNativeClaudeCurrent(snapshot)
  return paths
}

export async function materializePrivateClaudeAccount(snapshot: NativeClaudeSnapshot, sessionId: string): Promise<string> {
  const paths = layout(snapshot, sessionId)
  // 仅沿已批准的 data/claude/project/session 层创建，不读取或复制原账号配置。
  for (const path of [paths.agentRoot, paths.privateRoot, paths.sessionRoot, ...environmentDirectories.map(name => join(paths.sessionRoot, name))]) createPrivateClaudeDirectory(path)
  return verifyLayout(snapshot, sessionId).configRoot
}

export async function verifyPrivateClaudeAccount(snapshot: NativeClaudeSnapshot, sessionId: string): Promise<void> {
  verifyLayout(snapshot, sessionId)
}

export function privateClaudeEnvironment(snapshot: NativeClaudeSnapshot, sessionId: string): Record<string, string> {
  const paths = verifyLayout(snapshot, sessionId), env: Record<string, string> = {}
  for (const [name, value] of Object.entries(snapshot.env)) {
    const key = process.platform === 'win32' ? name.toUpperCase() : name
    if (!allowedEnvironment.has(key) || !value || /[\0\r\n]/.test(value)) fail('environment_unapproved')
    if (env[key] !== undefined && env[key] !== value) fail('environment_case_collision')
    if (key === 'PATH' && value.split(delimiter).some(path => !isAbsolute(path))) fail('environment_path_invalid')
    env[key] = value
  }
  if (!snapshot.key || snapshot.key.length > 16384 || snapshot.key.trim() !== snapshot.key || /[\0\r\n]/.test(snapshot.key)) fail('literal_api_key_required')
  if (snapshot.policy.account.model_target.base_url !== 'https://api.anthropic.com') fail('model_route_changed')
  Object.assign(env, {
    HOME: paths.home, USERPROFILE: paths.home, CLAUDE_CONFIG_DIR: paths.configRoot,
    APPDATA: join(paths.sessionRoot, 'appdata'), LOCALAPPDATA: join(paths.sessionRoot, 'localappdata'),
    TEMP: join(paths.sessionRoot, 'temp'), TMP: join(paths.sessionRoot, 'temp'), TMPDIR: join(paths.sessionRoot, 'temp'),
    XDG_CONFIG_HOME: join(paths.sessionRoot, 'xdg-config'), XDG_DATA_HOME: join(paths.sessionRoot, 'xdg-data'),
    XDG_CACHE_HOME: join(paths.sessionRoot, 'xdg-cache'), XDG_STATE_HOME: join(paths.sessionRoot, 'xdg-state'),
    XDG_RUNTIME_DIR: join(paths.sessionRoot, 'xdg-runtime'), XDG_CONFIG_DIRS: join(paths.sessionRoot, 'xdg-config-dirs'), XDG_DATA_DIRS: join(paths.sessionRoot, 'xdg-data-dirs'),
    ANTHROPIC_API_KEY: snapshot.key, ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
    DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1', DISABLE_ERROR_REPORTING: '1', CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1'
  })
  return env
}
