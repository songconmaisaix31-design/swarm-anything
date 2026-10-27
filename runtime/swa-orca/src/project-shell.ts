import { spawn } from 'node:child_process'
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, realpathSync } from 'node:fs'
import { constants as osConstants } from 'node:os'
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { z } from 'zod'

const pathSchema = z.string().min(1).max(4096)
export const projectShellPolicySchema = z.strictObject({
  schema: z.literal('swa.project-shell.v1'),
  project_root: pathSchema,
  writable_roots: z.array(pathSchema).min(1).max(32),
  protected_roots: z.array(pathSchema).min(1).max(64),
  toolchain_roots: z.array(pathSchema).max(16)
})
export type ProjectShellPolicy = z.infer<typeof projectShellPolicySchema>
export const projectShellPolicyEnvironment = 'SWA_PROJECT_SHELL_POLICY'
const inputSchema = z.strictObject({ command: z.string().min(1).max(128 * 1024), cwd: pathSchema })
const contains = (root: string, value: string) => { const part = relative(root, value); return part === '' || part !== '..' && !part.startsWith('../') && !isAbsolute(part) }
const overlaps = (a: string, b: string) => contains(a, b) || contains(b, a)

function unavailable(message: string): never {
  throw Object.assign(new Error(message), { code: 'capability_unavailable' })
}
function denied(message: string): never {
  throw Object.assign(new Error(message), { code: 'scope_denied' })
}
function canonical(path: string) {
  if (!isAbsolute(path) || resolve(path) !== path || realpathSync.native(path) !== path) denied('The project shell path must be absolute and canonical')
  return path
}
function canonicalProtected(path: string): string {
  if (!isAbsolute(path) || resolve(path) !== path || path === '/') denied('The protected project shell path is invalid')
  try { return canonical(path) }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
    return join(canonicalProtected(dirname(path)), path.slice(dirname(path).length + 1))
  }
}

function inspectWritableDirectory(fd: number) {
  const root = `/proc/self/fd/${fd}`
  for (const name of readdirSync(root)) {
    const path = join(root, name), info = lstatSync(path)
    if (info.isSymbolicLink()) continue
    if (info.isFile()) {
      if (info.nlink !== 1) denied('The writable project contains shared hard links; select source directories without shared files')
      continue
    }
    if (!info.isDirectory()) denied('The writable project contains a socket, device or other special file')
    const child = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    try {
      const current = fstatSync(child)
      if (info.dev !== current.dev || info.ino !== current.ino) denied('The writable project directory changed during admission')
      inspectWritableDirectory(child)
    } finally { closeSync(child) }
  }
}

// 所有挂载来源由上层当前授权生成；模型只提供 command 与获准 cwd。
export function prepareProjectShell(policyValue: unknown, inputValue: unknown) {
  if (process.platform !== 'linux') unavailable('Project shell requires Linux bubblewrap isolation')
  const policy = projectShellPolicySchema.parse(policyValue), input = inputSchema.parse(inputValue)
  const root = canonical(policy.project_root), writable = policy.writable_roots.map(canonical)
  const protectedRoots = policy.protected_roots.map(canonicalProtected)
  const toolchains = policy.toolchain_roots.map(canonical)
  if (root === '/' || new Set(writable).size !== writable.length || new Set(toolchains).size !== toolchains.length) denied('The project shell mount scope is invalid')
  const executableRoots = [realpathSync.native(process.execPath), ...(process.argv[1] ? [realpathSync.native(process.argv[1])] : [])]
  if (writable.some(path => !contains(root, path) || [...protectedRoots, ...executableRoots].some(protectedRoot => overlaps(path, protectedRoot)))) denied('The writable project scope intersects a protected or external path')
  if (toolchains.some(path => path === '/' || [...writable, ...protectedRoots].some(protectedRoot => overlaps(path, protectedRoot)))) denied('A toolchain cannot expose a writable project or protected private directory')
  const cwd = canonical(input.cwd)
  if (!writable.some(path => contains(path, cwd))) denied('The shell working directory is outside the current project permission')
  const system = ['/usr', '/bin', '/lib', '/lib64'].map(target => ({ source: realpathSync.native(target), target }))
  if (writable.some(path => system.some(mount => overlaps(path, mount.source)))) denied('The project permission cannot include system executables')
  if (protectedRoots.some(path => system.some(mount => overlaps(path, mount.source)))) denied('The system toolchain would expose a protected private directory')
  const file = '/usr/bin/bwrap'
  const executable = lstatSync(file)
  if (!executable.isFile() || executable.isSymbolicLink() || executable.uid !== 0 || (executable.mode & 0o022) !== 0 || (executable.mode & 0o111) === 0) unavailable('A root-owned, non-writable bubblewrap executable is required at /usr/bin/bwrap')
  const fds: number[] = []
  const args = ['--unshare-user', '--unshare-pid', '--unshare-net', '--unshare-ipc', '--unshare-uts', '--die-with-parent', '--new-session', '--cap-drop', 'ALL', '--clearenv']
  const close = () => { for (const fd of fds.splice(0)) closeSync(fd) }
  const mount = (source: string, target: string, readOnly: boolean) => {
    const before = lstatSync(source, { bigint: true })
    if (!before.isDirectory() || before.isSymbolicLink()) denied('A project shell mount must be a real directory')
    const fd = openSync(source, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    fds.push(fd)
    const current = fstatSync(fd, { bigint: true })
    if (before.dev !== current.dev || before.ino !== current.ino || realpathSync.native(source) !== source) denied('The project shell mount source changed')
    if (!readOnly) inspectWritableDirectory(fd)
    args.push(readOnly ? '--ro-bind-fd' : '--bind-fd', String(2 + fds.length), target)
  }
  try {
    for (const item of system) mount(item.source, item.target, true)
    for (const path of toolchains) mount(path, path, true)
    args.push('--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--tmpfs', '/home', '--dir', '/home/swa')
    for (const path of writable) mount(path, path, false)
    // 自动生成的挂载父目录也只读；只有明确绑定的项目目录和私有临时区可写。
    args.push('--remount-ro', '/')
    const searchPath = [...toolchains.map(path => join(path, 'bin')), '/usr/bin', '/bin'].join(delimiter)
    args.push('--setenv', 'PATH', searchPath, '--setenv', 'HOME', '/home/swa', '--setenv', 'TMPDIR', '/tmp', '--setenv', 'LANG', 'C.UTF-8', '--setenv', 'LC_ALL', 'C.UTF-8', '--setenv', 'GOCACHE', '/tmp/go-build', '--setenv', 'GOPATH', '/tmp/go', '--setenv', 'GOTOOLCHAIN', 'local', '--setenv', 'GOPROXY', 'off', '--chdir', cwd, '--', '/bin/bash', '--noprofile', '--norc', '-c', input.command)
    return { file, args, cwd, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, fds, close }
  } catch (error) { close(); throw error }
}

export async function runProjectShell(policy: unknown, input: unknown, options: {
  signal?: AbortSignal
  timeoutMs?: number
  onData(data: Buffer): void
  onSpawn?(pid: number): void
}) {
  if (options.signal?.aborted) throw new Error('Project shell was cancelled before launch')
  if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0)) throw new Error('Project shell timeout must be a positive integer')
  const prepared = prepareProjectShell(policy, input)
  try {
    return await new Promise<{ exitCode: number; signal: NodeJS.Signals | null }>((resolveResult, reject) => {
      const child = spawn(prepared.file, prepared.args, { cwd: prepared.cwd, env: prepared.env, stdio: ['ignore', 'pipe', 'pipe', ...prepared.fds], signal: options.signal, timeout: options.timeoutMs, killSignal: 'SIGTERM' })
      // spawn 已复制额外 FD；父进程不保留可供后续工具复用的目录句柄。
      prepared.close()
      child.once('spawn', () => { if (child.pid !== undefined) options.onSpawn?.(child.pid) })
      child.stdout!.on('data', options.onData)
      child.stderr!.on('data', options.onData)
      let launchError: Error | undefined
      child.on('error', error => { launchError = error })
      child.on('close', (code, signal) => {
        if (launchError) { reject(launchError); return }
        if (code === null && signal === null) { reject(new Error('Project shell exited without an observable result')); return }
        resolveResult({ exitCode: code ?? 128 + osConstants.signals[signal!], signal })
      })
    })
  } finally { prepared.close() }
}
