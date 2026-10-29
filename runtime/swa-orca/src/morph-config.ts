import { isAbsolute, relative, resolve } from 'node:path'
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, type BigIntStats } from 'node:fs'
import { z } from 'zod'
import { parseStrictPiJson } from '../../../third_party/orca-v1.4.230/src/main/pi/rpc-protocol'

const absolutePath = z.string().min(1).refine(isAbsolute)
export const morphDescriptorSchema = z.strictObject({ python: absolutePath, cwd: absolutePath, host_config: absolutePath })
const inside = (root: string, path: string) => {
  const part = relative(root, path)
  return part === '' || part !== '..' && !part.startsWith('../') && !part.startsWith('..\\') && !isAbsolute(part)
}
const versionOf = (info: BigIntStats) => `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}`

// 扩展使用纯Node读取；不能静态引入只在宿主可用的Windows原生安全模块。
function readMorphFile(file: string, maximum: number) {
  if (!isAbsolute(file)) throw new Error('morph_configuration_path_invalid')
  const path = realpathSync.native(file)
  if (relative(path, resolve(file)) !== '') throw new Error('morph_configuration_path_redirected')
  const before = lstatSync(path, { bigint: true })
  if (!before.isFile() || before.isSymbolicLink() || before.size > BigInt(maximum)) throw new Error('morph_configuration_size_invalid')
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    if (versionOf(fstatSync(fd, { bigint: true })) !== versionOf(before)) throw new Error('morph_configuration_changed')
    const bytes = Buffer.alloc(Number(before.size) + 1)
    let count = 0
    while (count < bytes.length) { const size = readSync(fd, bytes, count, bytes.length - count, count); if (!size) break; count += size }
    if (count !== Number(before.size) || versionOf(fstatSync(fd, { bigint: true })) !== versionOf(before) || versionOf(lstatSync(path, { bigint: true })) !== versionOf(before) || relative(realpathSync.native(path), path) !== '') throw new Error('morph_configuration_changed')
    return { source: { path, version: versionOf(before) }, bytes: bytes.subarray(0, count) }
  } finally { closeSync(fd) }
}

/** 路径只由宿主选择；工具参数和提示词不能改变配置。 */
export function readMorphDescriptor(path: string, expected?: { configVersion: string; hostConfigVersion: string }) {
  const config = readMorphFile(path, 64 * 1024)
  const descriptor = morphDescriptorSchema.parse(parseStrictPiJson(new TextDecoder('utf-8', { fatal: true }).decode(config.bytes)))
  const host = readMorphFile(descriptor.host_config, 1024 * 1024)
  if (expected && (config.source.version !== expected.configVersion || host.source.version !== expected.hostConfigVersion)) throw new Error('morph_host_configuration_changed')
  for (const [name, directory] of [['python', false], ['cwd', true]] as const) {
    const actual = realpathSync.native(descriptor[name]), info = lstatSync(actual)
    if (directory ? !info.isDirectory() : !info.isFile()) throw new Error('morph_host_path_unavailable')
  }
  const hostConfig = z.object({ workspace: absolutePath, worker_id: z.string().min(1) }).parse(parseStrictPiJson(new TextDecoder('utf-8', { fatal: true }).decode(host.bytes)))
  const workspace = realpathSync.native(hostConfig.workspace)
  for (const protectedPath of [config.source.path, host.source.path, realpathSync.native(descriptor.python), realpathSync.native(descriptor.cwd)]) {
    if (inside(workspace, protectedPath)) throw new Error('morph_host_configuration_in_writable_workspace')
  }
  // 保留venv启动路径，同时固定它实际解析到的解释器来源。
  const pythonPath = realpathSync.native(descriptor.python), python = lstatSync(pythonPath, { bigint: true })
  return { descriptor, source: config.source, hostSource: host.source,
    pythonSource: { path: pythonPath, version: `${python.dev}:${python.ino}:${python.birthtimeNs}:${python.mtimeNs}:${python.size}` }, cwd: realpathSync.native(descriptor.cwd), workspace }
}

export function inspectMorphConfig(path: string, projectRoot: string) {
  const result = readMorphDescriptor(path), root = realpathSync.native(projectRoot)
  if (relative(root, result.workspace) !== '') throw new Error('morph_project_workspace_mismatch')
  for (const protectedPath of [result.source.path, result.hostSource.path, realpathSync.native(result.descriptor.python), realpathSync.native(result.descriptor.cwd)]) {
    if (inside(root, protectedPath)) throw new Error('morph_host_configuration_in_swa_workspace')
  }
  return result
}

/** 只转发固定宿主配置明确点名的实验凭据。 */
export function morphBackendEnvironment(path: string, inherited: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const { descriptor } = readMorphDescriptor(path)
  const host = z.object({ experiment_backend: z.object({ api_key_env: z.string().nullable().optional() }).optional(), generated_experiments: z.object({ api_key_env: z.string().nullable().optional() }).optional() }).parse(parseStrictPiJson(new TextDecoder('utf-8', { fatal: true }).decode(readMorphFile(descriptor.host_config, 1024 * 1024).bytes)))
  const env: Record<string, string> = {}
  for (const name of [host.experiment_backend?.api_key_env, host.generated_experiments?.api_key_env]) {
    if (!name) continue
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || /^(?:PATH|HOME|USERPROFILE|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|PYTHON.*|NODE.*|LD_.*|DYLD_.*|SWA_.*|ORCA_.*|PI_.*)$/i.test(name)) throw new Error('morph_credential_environment_name_invalid')
    const value = inherited[name]
    if (!value || value.length > 16384 || /[\0\r\n]/.test(value)) throw new Error('morph_backend_credential_environment_missing')
    env[name] = value
  }
  return env
}

export function morphEnvironment(tools: { mode: string; morph_config?: { path: string; version: string }; morph_host_config?: { path: string; version: string } }, inherited: Readonly<Record<string, string | undefined>> = process.env): Record<string, string> {
  if (tools.mode !== 'morph') return {}
  if (!tools.morph_config || !tools.morph_host_config) throw new Error('morph_host_configuration_missing')
  return { SWA_MORPH_CONFIG: tools.morph_config.path, SWA_MORPH_CONFIG_VERSION: tools.morph_config.version, SWA_MORPH_HOST_CONFIG_VERSION: tools.morph_host_config.version, ...morphBackendEnvironment(tools.morph_config.path, inherited) }
}
