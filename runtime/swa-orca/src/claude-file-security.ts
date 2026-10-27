import { execFileSync } from 'node:child_process'
import { lstatSync, mkdirSync, readdirSync, realpathSync, type BigIntStats } from 'node:fs'
import { dirname, isAbsolute, normalize, resolve, toNamespacedPath } from 'node:path'
import { createPrivateDirectory as createWindowsPrivateDirectory, createFileWithDacl, currentUserSid, getDaclAces } from '@orca/windows-security'
import { getWindowsPowerShellExecutablePath } from '../../../third_party/orca-v1.4.230/src/main/agent-hooks/windows-powershell-hook-launcher'
import { createPosixPrivateFile, requirePosixPrivatePath } from './private-posix-security'

type PathRequirement = { directory: boolean; private: boolean }
const systemSid = 'S-1-5-18'
const fullControl = 0x1f01ff
const samePath = (left: string, right: string) => process.platform === 'win32' ? normalize(left).toLowerCase() === normalize(right).toLowerCase() : normalize(left) === normalize(right)
const identity = (info: BigIntStats) => `${info.dev}:${info.ino}:${info.birthtimeNs}`
const reparseCheck = Buffer.from("$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; try { $p=[IO.Path]::GetFullPath($env:SWA_CLAUDE_CHECK_PATH); while ($true) { $a=[IO.File]::GetAttributes($p); if (($a -band [IO.FileAttributes]::ReparsePoint) -ne 0) { exit 1 }; $parent=[IO.Path]::GetDirectoryName($p); if ([String]::IsNullOrEmpty($parent)) { break }; $p=$parent }; [Console]::Out.Write('ok') } catch { exit 1 }", 'utf16le').toString('base64')

function fail(code: string): never { throw new Error(`native_claude_${code}`) }

function rejectWindowsReparse(path: string) {
  if (process.platform !== 'win32') return
  const systemRoot = process.env.SystemRoot
  if (!systemRoot || !isAbsolute(systemRoot)) fail('windows_system_root_unavailable')
  const executable = getWindowsPowerShellExecutablePath()
  try {
    if (!samePath(realpathSync.native(executable), resolve(executable))) fail('windows_attribute_reader_redirected')
    const output = execFileSync(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', reparseCheck], {
      env: { SystemRoot: systemRoot, WINDIR: systemRoot, SWA_CLAUDE_CHECK_PATH: path },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, timeout: 5000, maxBuffer: 1024, encoding: 'utf8'
    })
    if (output !== 'ok') fail('windows_attributes_unverified')
  } catch { fail('windows_attributes_unverified') }
}

export function requireNativeClaudePath(path: string, requirement: PathRequirement): void {
  if (process.platform !== 'linux' && process.platform !== 'win32') fail('path_security_unavailable')
  if (!isAbsolute(path) || !samePath(realpathSync.native(path), resolve(path))) fail('path_redirected')
  const target = resolve(path)
  for (let current = target; ; current = dirname(current)) {
    const info = lstatSync(current)
    if (info.isSymbolicLink() || (current === target && !requirement.directory ? !info.isFile() : !info.isDirectory())) fail('path_redirected')
    if (dirname(current) === current) break
  }
  // Node 的链接属性不能覆盖所有 Windows reparse tag，系统属性检查必须覆盖完整祖先链。
  rejectWindowsReparse(path)
  if (!requirement.private) return
  if (process.platform === 'linux') { requirePosixPrivatePath(path, requirement.directory); return }
  const user = currentUserSid(), acl = getDaclAces(toNamespacedPath(path)), trustees = new Set([user, systemSid])
  // 原生文件可继承已验证私有父目录的 ACL；目录本身必须阻断继承。
  if (!acl || acl.ownerSid !== user || requirement.directory && !acl.protected || acl.aces.length !== trustees.size) fail('private_security_changed')
  for (const ace of acl.aces) {
    if (!ace.sid || !trustees.delete(ace.sid) || ace.type !== 0 || ace.mask !== fullControl || (requirement.directory ? ace.flags !== 3 : ace.flags !== 0 && ace.flags !== 16)) fail('private_security_changed')
  }
  if (trustees.size) fail('private_security_changed')
  if (!requirement.directory) requireNativeClaudePath(dirname(path), { directory: true, private: true })
}

function parentIdentity(path: string) {
  const parent = dirname(path)
  requireNativeClaudePath(parent, { directory: true, private: true })
  return { parent, version: identity(lstatSync(parent, { bigint: true })) }
}

function verifyParent(parent: string, version: string) {
  requireNativeClaudePath(parent, { directory: true, private: true })
  if (identity(lstatSync(parent, { bigint: true })) !== version) fail('private_parent_changed')
}

export function createPrivateClaudeDirectory(path: string): void {
  if (!isAbsolute(path)) fail('path_redirected')
  const { parent, version } = parentIdentity(path)
  let created = false
  if (process.platform === 'win32') created = createWindowsPrivateDirectory(toNamespacedPath(path))
  else {
    try { mkdirSync(path, { mode: 0o700 }); created = true }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
    }
  }
  verifyParent(parent, version)
  requireNativeClaudePath(path, { directory: true, private: true })
  if (created && readdirSync(path).length !== 0) fail('private_directory_not_empty')
}

export function createPrivateClaudeFile(path: string, bytes: Uint8Array): void {
  if (!isAbsolute(path)) fail('path_redirected')
  const { parent, version } = parentIdentity(path)
  if (process.platform === 'linux') createPosixPrivateFile(path, bytes)
  else if (process.platform === 'win32') {
    const user = currentUserSid(), trustees = [...new Set([user, systemSid])]
    const acl = `O:${user}D:P${trustees.map(sid => `(A;;FA;;;${sid})`).join('')}`
    createFileWithDacl(toNamespacedPath(path), acl, bytes)
  } else fail('path_security_unavailable')
  verifyParent(parent, version)
  requireNativeClaudePath(path, { directory: false, private: true })
}
