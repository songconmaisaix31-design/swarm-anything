import { lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { basename, dirname, isAbsolute, join, relative, resolve, toNamespacedPath } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { createFileWithDacl, createPrivateDirectory, currentUserSid, getDaclAces } from '@orca/windows-security'
import { z } from 'zod'
import { assertNativeOpenCodeCurrent, openCodePermissions, openCodePlugins, openCodeStepFunConfiguration, openCodeTargets, type NativeOpenCodeSnapshot } from './native-opencode-policy'
import { nativeConfigurationSource, readNativePiFile } from './native-pi-policy'
import { privateStructuredOpenCodeEnvironment } from '../../../third_party/orca-v1.4.230/src/main/opencode/opencode-structured-account-home'
import { createPosixPrivateFile, requirePosixPrivatePath } from './private-posix-security'

const systemSid = 'S-1-5-18'
const samePath = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
const deny = { action: '*', resource: '*', effect: 'deny' }
const privateDirectories = ['home', 'data', 'data/opencode', 'cache', 'config', 'config/opencode', 'state', 'programdata', 'appdata', 'localappdata', 'temp']
const initializations = new Map<string, 'prepared' | 'importing'>()

async function actualDirectory(path: string) {
  if (!isAbsolute(path) || !samePath(await realpath(path), resolve(path))) throw new Error('private_opencode_directory_redirected')
  for (let ancestor = resolve(path); ; ancestor = dirname(ancestor)) {
    const info = await lstat(ancestor)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('private_opencode_directory_redirected')
    if (dirname(ancestor) === ancestor) break
  }
}

function security(path: string, directory: boolean) {
  if (process.platform === 'linux') return requirePosixPrivatePath(path, directory)
  const user = currentUserSid(), acl = getDaclAces(toNamespacedPath(path)), trustees = new Set([user, systemSid])
  if (!acl?.protected || acl.ownerSid !== user || acl.aces.length !== trustees.size) throw new Error('private_opencode_security_changed')
  for (const ace of acl.aces) {
    if (ace.sid === null || !trustees.delete(ace.sid) || ace.type !== 0 || ace.flags !== (directory ? 3 : 0) || ace.mask !== 0x1f01ff) throw new Error('private_opencode_security_changed')
  }
  if (trustees.size) throw new Error('private_opencode_security_changed')
}

async function directory(path: string) {
  let created = false
  if (process.platform === 'win32') {
    await actualDirectory(dirname(path))
    created = createPrivateDirectory(toNamespacedPath(path))
  } else {
    try { await mkdir(path, { mode: 0o700 }); created = true }
    catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error }
  }
  await actualDirectory(path)
  if (created) {
    if ((await readdir(path)).length) throw new Error('private_opencode_directory_not_empty')
  }
  security(path, true)
  return created
}

function writePrivateJSON(file: string, value: unknown) {
  const body = Buffer.from(JSON.stringify(value) + '\n')
  try {
    if (process.platform === 'linux') createPosixPrivateFile(file, body)
    else {
      const user = currentUserSid()
      createFileWithDacl(toNamespacedPath(file), `O:${user}D:P${[...new Set([user, systemSid])].map(sid => `(A;;FA;;;${sid})`).join('')}`, body)
    }
    security(file, false)
  } finally { body.fill(0) }
}

async function absent(file: string) {
  try { await lstat(file) }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return; throw error }
  throw new Error('private_opencode_initialization_destination_exists')
}

export function claimPrivateOpenCodeInitialization(root: string) {
  if (initializations.get(root) !== 'prepared') throw new Error('private_opencode_initialization_unavailable')
  initializations.set(root, 'importing')
}
export function abandonPrivateOpenCodeInitialization(root: string) { initializations.delete(root) }
export async function completePrivateOpenCodeInitialization(snapshot: NativeOpenCodeSnapshot, root: string, plugin: string, correlation: string) {
  if (initializations.get(root) !== 'importing') throw new Error('private_opencode_initialization_unavailable')
  try {
    await verifyPrivateOpenCodeAccount(snapshot, root, plugin, correlation, true)
    writePrivateJSON(join(root, 'data/opencode/auth.json'), { [snapshot.policy.account.provider]: { type: 'api', key: snapshot.key } })
  } finally { initializations.delete(root) }
  await verifyPrivateOpenCodeAccount(snapshot, root, plugin, correlation)
}

export async function readPrivateOpenCodeInputKey(root: string) {
  const path = join(root, 'swa-input-key.json')
  security(root, true); security(path, false)
  const source = await nativeConfigurationSource(path)
  const { bytes } = readNativePiFile(path, 256, true)
  try {
    if (bytes.length > 256) throw new Error('private_opencode_input_key_invalid')
    const parsed = z.strictObject({ key: z.string().regex(/^[a-f0-9]{64}$/) }).parse(JSON.parse(bytes.toString('utf8')))
    if (!isDeepStrictEqual(source, await nativeConfigurationSource(path))) throw new Error('private_opencode_input_key_changed')
    return { key: parsed.key, source }
  } finally { bytes.fill(0) }
}

export async function preparePrivateOpenCodeVersionEnvironment(root: string, inherited: Readonly<Record<string, string>>) {
  if (!await directory(root)) throw new Error('private_opencode_version_directory_exists')
  for (const name of privateDirectories) await directory(join(root, name))
  writePrivateJSON(join(root, 'config/opencode/opencode.json'), {
    update: 'disable', share: 'disabled', warming: false, snapshots: false, compaction: { auto: false }, permissions: [deny], plugins: ['-*']
  })
  const env: Record<string, string> = privateOpenCodeEnvironment(root, inherited)
  // 官方 --version 也记录 cli starting；版本探测只读标准输出，Worker 仍保留原生日志。
  delete env.OPENCODE_PRINT_LOGS
  return env
}

export async function createPrivateOpenCodeRoot(projectId: string) {
  z.uuid().parse(projectId)
  const data = await realpath(z.string().min(1).parse(process.env.SWA_DATA_DIR))
  await actualDirectory(data)
  await directory(join(data, 'opencode'))
  const root = join(data, 'opencode', projectId)
  await directory(root)
  return root
}

export function privateOpenCodeConfig(root: string, plugin: string, correlation: string, snapshot: NativeOpenCodeSnapshot) {
  const provider = snapshot.policy.account.provider, project = snapshot.policy.tools.mode === 'project'
  return {
    model: openCodeTargets[provider].model, default_agent: 'build', update: 'disable', share: 'disabled',
    warming: false, compaction: { auto: false }, snapshots: false, permissions: openCodePermissions(project),
    agents: { build: { permissions: openCodePermissions(project) }, ...Object.fromEntries(['general', 'explore', 'title', 'summary', 'compaction'].map(id => [id, { disabled: true }])) },
    ...(provider === 'stepfun' ? { providers: { stepfun: openCodeStepFunConfiguration } } : {}),
    plugins: ['-*', ...openCodePlugins(provider, project).filter(id => !['opencode.provider.opencode', 'opencode.config.policy'].includes(id)), { package: plugin, options: { root, correlation, provider, source: join(plugin, 'server.js'), sources: snapshot.sources, absent_sources: snapshot.absentSources, ...(project ? { project_shell: snapshot.policy.tools } : {}) } }]
  }
}

async function pluginSources(snapshot: NativeOpenCodeSnapshot, plugin: string) {
  await actualDirectory(plugin)
  for (const name of ['package.json', 'server.js']) {
    const source = await nativeConfigurationSource(join(plugin, name))
    if (!samePath(source.path, join(plugin, name)) || (await lstat(source.path)).isSymbolicLink()) throw new Error('private_opencode_plugin_redirected')
    if (!snapshot.sources.some(item => isDeepStrictEqual(item, source))) snapshot.sources.push(source)
  }
}

export async function readPrivateOpenCodeBinding(snapshot: NativeOpenCodeSnapshot, root: string, plugin: string, initializing = false) {
  await actualDirectory(root)
  security(root, true)
  const file = join(root, 'config/opencode/opencode.json')
  await actualDirectory(dirname(file))
  const info = await lstat(file)
  if (!info.isFile() || info.isSymbolicLink() || !samePath(await realpath(file), file)) throw new Error('private_opencode_file_redirected')
  security(file, false)
  const config = z.object({ plugins: z.array(z.union([z.string(), z.strictObject({ package: z.string(), options: z.object({ correlation: z.string().regex(/^[a-f0-9]{64}$/) }) })])) }).parse(JSON.parse(await readFile(file, 'utf8')))
  const entries = config.plugins.filter((entry): entry is Exclude<typeof entry, string> => typeof entry !== 'string' && samePath(entry.package, plugin))
  if (entries.length !== 1) throw new Error('private_opencode_policy_binding_missing')
  await pluginSources(snapshot, plugin)
  const correlation = entries[0]!.options.correlation
  await verifyPrivateOpenCodeAccount(snapshot, root, plugin, correlation, initializing)
  return { root, plugin, correlation }
}

export async function materializePrivateOpenCodeAccount(snapshot: NativeOpenCodeSnapshot, sessionId: string, plugin: string, correlation: string, reuse = false) {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId) || !/^[a-f0-9]{64}$/.test(correlation)) throw new Error('private_opencode_worker_identity_invalid')
  const data = await realpath(z.string().parse(process.env.SWA_DATA_DIR))
  if (!samePath(dirname(snapshot.policy.account.private_root), join(data, 'opencode'))) throw new Error('private_opencode_root_changed')
  const expected = await createPrivateOpenCodeRoot(basename(snapshot.policy.account.private_root))
  if (!samePath(expected, snapshot.policy.account.private_root)) throw new Error('private_opencode_root_changed')
  assertNativeOpenCodeCurrent(snapshot)
  const root = join(expected, sessionId)
  for (const protectedRoot of [snapshot.policy.account.source_home, process.env.SWA_INSTALL_ROOT]) {
    if (!protectedRoot) continue
    const actualProtected = await realpath(protectedRoot)
    for (const [parent, child] of [[actualProtected, root], [root, actualProtected]]) {
      const part = relative(parent, child)
      if (!part || !part.startsWith('..') && !isAbsolute(part)) throw new Error('private_opencode_root_overlap')
    }
  }
  if (reuse) {
    await readPrivateOpenCodeBinding(snapshot, root, await realpath(plugin))
    return root
  }
  if (!await directory(root)) throw new Error('private_opencode_existing_account_unreviewed')
  for (const name of privateDirectories) await directory(join(root, name))
  const actualPlugin = await realpath(plugin)
  await pluginSources(snapshot, actualPlugin)
  await absent(join(root, 'data/opencode/auth.json'))
  await absent(join(root, 'data/opencode/opencode.db'))
  writePrivateJSON(join(root, 'swa-input-key.json'), { key: randomBytes(32).toString('hex') })
  writePrivateJSON(join(root, 'config/opencode/opencode.json'), privateOpenCodeConfig(root, actualPlugin, correlation, snapshot))
  initializations.set(root, 'prepared')
  try { await verifyPrivateOpenCodeAccount(snapshot, root, actualPlugin, correlation, true) }
  catch (error) { initializations.delete(root); throw error }
  return root
}

export async function verifyPrivateOpenCodeAccount(snapshot: NativeOpenCodeSnapshot, root: string, plugin: string, correlation: string, initializing = false) {
  const within = relative(snapshot.policy.account.private_root, root)
  if (!within || within.startsWith('..') || isAbsolute(within) || within.includes('/') || within.includes('\\')) throw new Error('private_opencode_worker_root_invalid')
  await actualDirectory(root)
  security(root, true)
  for (const name of privateDirectories) { await actualDirectory(join(root, name)); security(join(root, name), true) }
  const pending = initializing && initializations.has(root)
  if (pending) await absent(join(root, 'data/opencode/auth.json'))
  const files: Array<readonly [string, unknown]> = [
    ['config/opencode/opencode.json', privateOpenCodeConfig(root, plugin, correlation, snapshot)],
    ...(pending ? [] : [['data/opencode/auth.json', { [snapshot.policy.account.provider]: { type: 'api', key: snapshot.key } }] as const])
  ]
  for (const [name, expected] of files) {
    const file = join(root, name), info = await lstat(file)
    if (!info.isFile() || info.isSymbolicLink() || !samePath(await realpath(file), file)) throw new Error('private_opencode_file_redirected')
    security(file, false)
    if (!isDeepStrictEqual(JSON.parse(await readFile(file, 'utf8')), expected)) throw new Error('private_opencode_configuration_changed')
  }
  await readPrivateOpenCodeInputKey(root)
  assertNativeOpenCodeCurrent(snapshot)
}

export function privateOpenCodeEnvironment(root: string, inherited: Readonly<Record<string, string>>) {
  return privateStructuredOpenCodeEnvironment(root, inherited)
}
