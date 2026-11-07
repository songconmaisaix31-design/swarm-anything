import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseCliVersion } from '../../../third_party/orca-v1.4.230/src/shared/app-version'
import { requirePosixPrivatePath } from './private-posix-security'

export function darwinDiscoveryDirectories(agent: string, home: string) {
  return [join(home, '.local', 'bin'), '/opt/homebrew/bin', ...(agent === 'codex' ? ['/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin'] : [])]
}

export function readDarwinDiscoveryVersion(executable: string): string | undefined {
  if (process.platform !== 'darwin') throw new Error('Darwin version discovery is unavailable')
  const env = prepareDarwinDiscoveryEnvironment()
  try {
    const output = execFileSync(executable, ['--version'], { shell: false, cwd: env.HOME, env, encoding: 'utf8', timeout: 5000, maxBuffer: 4096, stdio: ['ignore', 'pipe', 'pipe'] })
    return parseCliVersion(output) ?? undefined
  } catch { return undefined }
}

export function prepareDarwinDiscoveryEnvironment() {
  if (process.platform !== 'darwin') throw new Error('Darwin discovery is unavailable')
  const data = process.env.SWA_DATA_DIR, node = process.env.SWA_NODE_EXECUTABLE
  if (!data || !node) throw new Error('Darwin version discovery requires private roots')
  requirePosixPrivatePath(data, true)
  const home = mkdtempSync(join(data, '.darwin-version-'))
  requirePosixPrivatePath(home, true)
  const temp = join(home, 'temp')
  mkdirSync(temp, { mode: 0o700 })
  // 不继承账户、代理、插件或 Node 注入变量。版本探测的全部账户目录都是新私有目录。
  return {
    PATH: `${dirname(realpathSync(node))}:/usr/bin:/bin`, HOME: home, USERPROFILE: home,
    APPDATA: home, LOCALAPPDATA: home, TMPDIR: temp, TMP: temp, TEMP: temp,
    XDG_CONFIG_HOME: home, XDG_DATA_HOME: home, XDG_CACHE_HOME: temp, XDG_STATE_HOME: home,
    XDG_RUNTIME_DIR: temp, XDG_CONFIG_DIRS: home, XDG_DATA_DIRS: home,
    PI_CODING_AGENT_DIR: home, CODEX_HOME: home, CLAUDE_CONFIG_DIR: home,
    PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', NODE_DISABLE_COMPILE_CACHE: '1', LC_ALL: 'C'
  }
}
