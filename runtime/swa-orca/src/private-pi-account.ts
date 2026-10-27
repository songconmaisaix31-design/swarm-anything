import { lstat, mkdir, readdir, realpath } from 'node:fs/promises'
import * as fs from 'node:fs'
import { lockSync } from 'proper-lockfile'
import { dirname, isAbsolute, join, resolve, toNamespacedPath } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { createPrivateDirectory as createWindowsPrivateDirectory, createFileWithDacl, currentUserSid, getDaclAces } from '@orca/windows-security'
import { z } from 'zod'
import { nativeConfigurationSource, nativePiSettings, readNativePiFile, type NativePiLegacyPolicySnapshot, type NativePiPerSessionSnapshot } from './native-pi-policy'
import { createPosixPrivateFile, requirePosixPrivatePath } from './private-posix-security'
import { parseStrictPiJson } from '../../../third_party/orca-v1.4.230/src/main/pi/rpc-protocol'

const fullControl = 0x1f01ff
const systemSid = 'S-1-5-18'
const samePath = (left: string, right: string) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
const environmentDirectories = process.platform === 'linux'
  ? ['appdata', 'localappdata', 'temp', 'xdg-config', 'xdg-data', 'xdg-cache', 'xdg-state', 'xdg-runtime', 'xdg-config-dirs', 'xdg-data-dirs']
  : ['appdata', 'localappdata', 'temp']

async function actualDirectory(path: string) {
  if (!isAbsolute(path) || !samePath(await realpath(path), resolve(path))) throw new Error('private_pi_directory_redirected')
  for (let ancestor = resolve(path); ; ancestor = dirname(ancestor)) {
    const info = await lstat(ancestor)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('private_pi_directory_redirected')
    if (dirname(ancestor) === ancestor) break
  }
}

function security(path: string, directory: boolean) {
  if (process.platform === 'linux') return requirePosixPrivatePath(path, directory)
  if (process.platform !== 'win32') throw new Error('private_pi_security_unavailable')
  const user = currentUserSid()
  const acl = getDaclAces(toNamespacedPath(path))
  const trustees = new Set([user, systemSid])
  if (!acl?.protected || acl.ownerSid !== user || acl.aces.length !== trustees.size) throw new Error('private_pi_security_changed')
  for (const ace of acl.aces) {
    if (ace.sid === null || !trustees.delete(ace.sid) || ace.type !== 0 || ace.flags !== (directory ? 3 : 0) || ace.mask !== fullControl) throw new Error('private_pi_security_changed')
  }
  if (trustees.size) throw new Error('private_pi_security_changed')
}

async function createPrivateDirectory(path: string) {
  let created = false
  if (process.platform === 'win32') {
    await actualDirectory(dirname(path))
    created = createWindowsPrivateDirectory(toNamespacedPath(path))
  } else {
    try { await mkdir(path, { mode: 0o700 }); created = true }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
    }
  }
  await actualDirectory(path)
  if (created) {
    if ((await readdir(path)).length) throw new Error('private_pi_directory_not_empty')
  }
  security(path, true)
}

export async function preparePrivatePiEnvironment(home: string) {
  await actualDirectory(home)
  security(home, true)
  for (const name of environmentDirectories) await createPrivateDirectory(join(home, name))
}

export async function initializePrivatePiRoot() {
  const root = await realpath(z.string().min(1).parse(process.env.SWA_DATA_DIR))
  await actualDirectory(root)
  await createPrivateDirectory(join(root, 'pi'))
  return root
}

// controller.open只创建空目录，账号材料由原Worker启动准入读取后独占写入。
export async function createPrivatePiHome(projectId: string) {
  if (!z.uuid().safeParse(projectId).success || projectId !== projectId.toLowerCase()) throw new Error('private_pi_project_identity_invalid')
  const root = await initializePrivatePiRoot()
  const home = join(root, 'pi', projectId)
  await createPrivateDirectory(home)
  return home
}

export async function createNativeWorkerDirectory(sessionId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) throw new Error('native_worker_session_identity_invalid')
  const root = await realpath(z.string().min(1).parse(process.env.SWA_DATA_DIR))
  await actualDirectory(root)
  await createPrivateDirectory(join(root, 'workers'))
  const directory = join(root, 'workers', sessionId)
  await createPrivateDirectory(directory)
  return directory
}

async function readPrivateJSON(file: string) {
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || !samePath(await realpath(file), resolve(file))) throw new Error('private_pi_file_redirected')
  security(file, false)
  const { source, bytes } = readNativePiFile(file, 64 * 1024)
  let value: unknown
  try { value = parseStrictPiJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  catch { throw new Error('private_pi_file_invalid_json') }
  security(file, false)
  if (!isDeepStrictEqual(source, await nativeConfigurationSource(file))) throw new Error('private_pi_file_changed_during_read')
  return value
}

async function requireAbsent(file: string) {
  try { await lstat(file) }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
    throw error
  }
  throw new Error('private_pi_models_configuration_appeared')
}

export async function verifyPrivatePiAccount(snapshot: NativePiLegacyPolicySnapshot) {
  const home = snapshot.policy.account.private_home
  await actualDirectory(home)
  security(home, true)
  for (const name of environmentDirectories) {
    await actualDirectory(join(home, name))
    security(join(home, name), true)
  }
  for (const [name, expected] of [['auth.json', snapshot.auth], ['models.json', snapshot.models], ['settings.json', nativePiSettings]] as const) {
    if (expected === null) await requireAbsent(join(home, name))
    else if (!isDeepStrictEqual(await readPrivateJSON(join(home, name)), expected)) throw new Error('private_pi_account_configuration_changed')
  }
}

export async function materializePrivatePiAccount(snapshot: NativePiLegacyPolicySnapshot) {
  const home = snapshot.policy.account.private_home
  await actualDirectory(home)
  security(home, true)
  const entries = await readdir(home)
  if (entries.length) {
    await verifyPrivatePiAccount(snapshot)
    return
  }
  const trustees = process.platform === 'win32' ? [...new Set([currentUserSid(), systemSid])] : []
  const acl = process.platform === 'win32' ? `O:${currentUserSid()}D:P${trustees.map(sid => `(A;;FA;;;${sid})`).join('')}` : ''
  for (const [name, value] of [['auth.json', snapshot.auth], ['models.json', snapshot.models], ['settings.json', nativePiSettings]] as const) {
    security(home, true)
    if (value === null) { await requireAbsent(join(home, name)); continue }
    const bytes = Buffer.from(JSON.stringify(value) + '\n', 'utf8')
    if (process.platform === 'linux') createPosixPrivateFile(join(home, name), bytes)
    else createFileWithDacl(toNamespacedPath(join(home, name)), acl, bytes)
  }
  await preparePrivatePiEnvironment(home)
  await verifyPrivatePiAccount(snapshot)
}

export async function initializePrivatePiWorkerRoot() {
  const data = await realpath(z.string().min(1).parse(process.env.SWA_DATA_DIR))
  await actualDirectory(data)
  const root = join(data, 'pi-workers')
  await createPrivateDirectory(root)
  return root
}

export async function createPrivatePiProjectRoot(projectId: string) {
  if (!z.uuid().safeParse(projectId).success || projectId !== projectId.toLowerCase()) throw new Error('private_pi_project_identity_invalid')
  const root = join(await initializePrivatePiWorkerRoot(), projectId)
  await createPrivateDirectory(root)
  return root
}

export async function createPrivatePiSessionHome(privateRoot: string, sessionId: string) {
  if (!z.uuid().safeParse(sessionId).success || sessionId !== sessionId.toLowerCase()) throw new Error('private_pi_session_identity_invalid')
  await actualDirectory(privateRoot)
  security(privateRoot, true)
  const data = await realpath(z.string().min(1).parse(process.env.SWA_DATA_DIR))
  if (!samePath(dirname(privateRoot), join(data, 'pi-workers')) || !z.uuid().safeParse(privateRoot.slice(dirname(privateRoot).length + 1)).success) throw new Error('private_pi_worker_root_invalid')
  const home = join(privateRoot, sessionId)
  if (process.platform === 'win32') {
    if (!createWindowsPrivateDirectory(toNamespacedPath(home))) throw new Error('private_pi_session_home_exists')
  } else await mkdir(home, { mode: 0o700 })
  await actualDirectory(home)
  security(home, true)
  if ((await readdir(home)).length) throw new Error('private_pi_directory_not_empty')
  return home
}

export async function materializePrivatePiSessionAccount(snapshot: NativePiPerSessionSnapshot, sessionId: string) {
  const home = await createPrivatePiSessionHome(snapshot.policy.account.private_root, sessionId)
  const trustees = process.platform === 'win32' ? [...new Set([currentUserSid(), systemSid])] : []
  const acl = process.platform === 'win32' ? `O:${currentUserSid()}D:P${trustees.map(sid => `(A;;FA;;;${sid})`).join('')}` : ''
  for (const [name, value] of [['auth.json', snapshot.auth], ['models.json', snapshot.models], ['settings.json', nativePiSettings]] as const) {
    security(home, true)
    if (value === null) { await requireAbsent(join(home, name)); continue }
    const bytes = Buffer.from(JSON.stringify(value) + '\n')
    if (bytes.length > 64 * 1024) throw new Error('private_pi_projection_exceeds_bound')
    if (process.platform === 'linux') createPosixPrivateFile(join(home, name), bytes)
    else createFileWithDacl(toNamespacedPath(join(home, name)), acl, bytes)
  }
  await preparePrivatePiEnvironment(home)
  await verifyPrivatePiSessionAccount(snapshot, sessionId)
  return home
}

export async function verifyPrivatePiSessionAccount(snapshot: NativePiPerSessionSnapshot, sessionId: string) {
  if (!z.uuid().safeParse(sessionId).success) throw new Error('private_pi_session_identity_invalid')
  const home = join(snapshot.policy.account.private_root, sessionId)
  await actualDirectory(home)
  security(home, true)
  for (const name of environmentDirectories) { await actualDirectory(join(home, name)); security(join(home, name), true) }
  for (const [name, expected] of [['auth.json', snapshot.auth], ['models.json', snapshot.models]] as const) {
    if (expected === null) await requireAbsent(join(home, name))
    else if (!isDeepStrictEqual(await readPrivateJSON(join(home, name)), expected)) throw new Error('private_pi_account_configuration_changed')
  }
  const guard = acquirePrivatePiSettingsGuardSync(join(home, 'settings.json'))
  try { guard.assertCurrent() } finally { guard.release() }
}

const activeSettingsGuards = new Set<string>()
const lockIdentity = (info: fs.BigIntStats) => `${info.dev}:${info.ino}:${info.birthtimeNs}`

// 复用4.1.2公开fs扩展点；只删除本次真实创建且仍同身份的锁目录。
export function acquirePrivatePiSettingsGuardSync(settingsPath: string) {
  security(dirname(settingsPath), true)
  security(settingsPath, false)
  if (!samePath(fs.realpathSync.native(settingsPath), settingsPath)) throw new Error('private_pi_settings_redirected')
  const path = fs.realpathSync.native(settingsPath)
  const key = process.platform === 'win32' ? path.toLowerCase() : path
  if (activeSettingsGuards.has(key)) throw new Error('private_pi_settings_guard_active')
  activeSettingsGuards.add(key)
  const lockPath = path + '.lock'
  let owned: string | undefined, created = false, failed: Error | undefined, released = false
  const fail = () => { failed ??= Object.assign(new Error('private_pi_lock_identity_unverifiable'), { code: 'EPI_LOCK_IDENTITY' }); return failed }
  function currentLock() {
    if (failed || !owned) throw fail()
    try { const info = fs.lstatSync(lockPath, { bigint: true }); if (!info.isDirectory() || info.isSymbolicLink() || lockIdentity(info) !== owned || !samePath(fs.realpathSync.native(lockPath), lockPath)) throw fail() }
    catch { throw fail() }
  }
  const facade = { ...fs,
    mkdirSync: ((target: fs.PathLike) => {
      if (String(target) !== lockPath || created) throw fail()
      fs.mkdirSync(target)
      created = true
      const info = fs.lstatSync(lockPath, { bigint: true })
      if (!info.isDirectory() || info.isSymbolicLink() || !samePath(fs.realpathSync.native(lockPath), lockPath)) throw fail()
      owned = lockIdentity(info)
    }) as typeof fs.mkdirSync,
    rmdirSync: ((target: fs.PathLike) => {
      if (String(target) !== lockPath) throw fail()
      currentLock()
      try { fs.rmdirSync(target) } catch { throw fail() }
    }) as typeof fs.rmdirSync
  }
  let release: (() => void) | undefined
  try { release = lockSync(path, { realpath: false, fs: facade, retries: 0, onCompromised: () => { fail() } }) }
  catch { if (!created) activeSettingsGuards.delete(key); throw fail() }
  function assertCurrent() {
    if (released) throw new Error('private_pi_settings_guard_released')
    currentLock()
    security(path, false)
    const { source, bytes } = readNativePiFile(path, 64 * 1024)
    let value: unknown
    try { value = parseStrictPiJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
    catch { throw new Error('private_pi_settings_invalid') }
    if (!isDeepStrictEqual(value, nativePiSettings)) throw new Error('private_pi_settings_changed')
    currentLock()
    return source
  }
  return {
    assertCurrent,
    release() {
      if (released) { if (failed) throw failed; return }
      released = true
      // 原release先停自己的timer/entry，再经facade验证实际rmdir对象。
      try { release!() } catch { throw fail() }
      if (failed) throw failed
      activeSettingsGuards.delete(key)
    }
  }
}

export function privatePiEnvironment(home: string, inherited: Readonly<Record<string, string>>) {
  const allowed = new Set(['SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'COMSPEC', 'PATHEXT', 'PATH', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'OS', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'COLORTERM', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'])
  const env: Record<string, string> = {}
  if (process.platform === 'linux') {
    requirePosixPrivatePath(home, true)
    for (const name of environmentDirectories) requirePosixPrivatePath(join(home, name), true)
    for (const [key, value] of Object.entries(inherited)) if (allowed.has(key) || ['http_proxy', 'https_proxy', 'all_proxy', 'no_proxy'].includes(key)) env[key] = value
    Object.assign(env, {
      NODE_USE_SYSTEM_CA: '1',
      TMPDIR: join(home, 'temp'), XDG_CONFIG_HOME: join(home, 'xdg-config'), XDG_DATA_HOME: join(home, 'xdg-data'),
      XDG_CACHE_HOME: join(home, 'xdg-cache'), XDG_STATE_HOME: join(home, 'xdg-state'), XDG_RUNTIME_DIR: join(home, 'xdg-runtime'),
      XDG_CONFIG_DIRS: join(home, 'xdg-config-dirs'), XDG_DATA_DIRS: join(home, 'xdg-data-dirs')
    })
  } else {
    for (const [key, value] of Object.entries(inherited)) {
      const normalized = key.toUpperCase()
      if (allowed.has(normalized)) {
        if (env[normalized] !== undefined && env[normalized] !== value) throw new Error('native_environment_case_collision')
        env[normalized] = value
      }
    }
  }
  Object.assign(env, { HOME: home, USERPROFILE: home, APPDATA: join(home, 'appdata'), LOCALAPPDATA: join(home, 'localappdata'), TEMP: join(home, 'temp'), TMP: join(home, 'temp'), PI_CODING_AGENT_DIR: home, PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1' })
  return env
}
