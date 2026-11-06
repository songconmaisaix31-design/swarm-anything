import { lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve, toNamespacedPath } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { createFileWithDacl, currentUserSid, getDaclAces, setDaclSddl } from '@orca/windows-security'
import { z } from 'zod'
import { nativeConfigurationSource, nativePiSettings, type NativePiPolicySnapshot } from './native-pi-policy'

const fullControl = 0x1f01ff
const systemSid = 'S-1-5-18'
const samePath = (left: string, right: string) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right

async function actualDirectory(path: string) {
  if (!isAbsolute(path) || !samePath(await realpath(path), resolve(path))) throw new Error('private_pi_directory_redirected')
  for (let ancestor = resolve(path); ; ancestor = dirname(ancestor)) {
    const info = await lstat(ancestor)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('private_pi_directory_redirected')
    if (dirname(ancestor) === ancestor) break
  }
}

function security(path: string, directory: boolean) {
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
  try { await mkdir(path); created = true }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
  }
  await actualDirectory(path)
  if (created) {
    if ((await readdir(path)).length) throw new Error('private_pi_directory_not_empty')
    const trustees = [...new Set([currentUserSid(), systemSid])]
    setDaclSddl(toNamespacedPath(path), `D:P${trustees.map(sid => `(A;OICI;FA;;;${sid})`).join('')}`)
  }
  security(path, true)
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
  const source = await nativeConfigurationSource(file)
  let value: unknown
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(file))) }
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

export async function verifyPrivatePiAccount(snapshot: NativePiPolicySnapshot) {
  const home = snapshot.policy.account.private_home
  await actualDirectory(home)
  security(home, true)
  for (const name of ['appdata', 'localappdata', 'temp']) {
    await actualDirectory(join(home, name))
    security(join(home, name), true)
  }
  for (const [name, expected] of [['auth.json', snapshot.auth], ['models.json', snapshot.models], ['settings.json', nativePiSettings]] as const) {
    if (expected === null) await requireAbsent(join(home, name))
    else if (!isDeepStrictEqual(await readPrivateJSON(join(home, name)), expected)) throw new Error('private_pi_account_configuration_changed')
  }
}

export async function materializePrivatePiAccount(snapshot: NativePiPolicySnapshot) {
  const home = snapshot.policy.account.private_home
  await actualDirectory(home)
  security(home, true)
  const entries = await readdir(home)
  if (entries.length) {
    await verifyPrivatePiAccount(snapshot)
    return
  }
  const trustees = [...new Set([currentUserSid(), systemSid])]
  const acl = `O:${currentUserSid()}D:P${trustees.map(sid => `(A;;FA;;;${sid})`).join('')}`
  for (const [name, value] of [['auth.json', snapshot.auth], ['models.json', snapshot.models], ['settings.json', nativePiSettings]] as const) {
    security(home, true)
    if (value === null) { await requireAbsent(join(home, name)); continue }
    createFileWithDacl(toNamespacedPath(join(home, name)), acl, Buffer.from(JSON.stringify(value) + '\n', 'utf8'))
  }
  for (const name of ['appdata', 'localappdata', 'temp']) await createPrivateDirectory(join(home, name))
  await verifyPrivatePiAccount(snapshot)
}

export function privatePiEnvironment(home: string, inherited: Readonly<Record<string, string>>) {
  const allowed = new Set(['SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'COMSPEC', 'PATHEXT', 'PATH', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER', 'OS', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'COLORTERM', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'])
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(inherited)) {
    const normalized = key.toUpperCase()
    if (allowed.has(normalized)) {
      if (env[normalized] !== undefined && env[normalized] !== value) throw new Error('native_environment_case_collision')
      env[normalized] = value
    }
  }
  Object.assign(env, { HOME: home, USERPROFILE: home, APPDATA: join(home, 'appdata'), LOCALAPPDATA: join(home, 'localappdata'), TEMP: join(home, 'temp'), TMP: join(home, 'temp'), PI_CODING_AGENT_DIR: home, PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1' })
  return env
}
