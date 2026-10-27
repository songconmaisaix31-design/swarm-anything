import process from 'node:process'
import { runWithParentJob } from './provider-job-bootstrap'

const runWindowsNativeCLI = () => runWithParentJob(async () => {
  const [{ z }, { spawnProcess }, { resolveWindowsCmdShim }, { extname, isAbsolute }, { realpath }] = await Promise.all([
    import('zod'), import('@orca/process-host'), import('@orca/process-host/windows-cmd-shim-resolution'), import('node:path'), import('node:fs/promises')
  ])
  if (process.argv.length !== 3 || process.platform !== 'win32') throw new Error('Native CLI Job launch arguments are invalid')
  const launch = z.strictObject({ command: z.string().min(1), args: z.array(z.string()) }).parse(JSON.parse(process.argv[2]!))
  if (!isAbsolute(launch.command) || await realpath(launch.command) !== launch.command) throw new Error('Native CLI executable identity changed')
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined && !/^(?:NODE_|SWA_)/i.test(key)) env[key] = value
  const shim = extname(launch.command).toLowerCase() === '.cmd' ? resolveWindowsCmdShim(launch.command, env) : null
  if (shim && (shim.prefixArgs.length !== 1 || shim.env?.NODE_PATH !== env.NODE_PATH)) throw new Error('Native CLI requires its verified installed Node entry')
  if (!shim && extname(launch.command).toLowerCase() !== '.exe') throw new Error('Native CLI executable format is unsupported')
  const program = await realpath(shim ? shim.program : launch.command)
  const identity = shim ? { kind: 'node-script' as const, entry: await realpath(shim.prefixArgs[0]!) } : { kind: 'executable' as const }
  const child = spawnProcess({ program, args: [...(identity.kind === 'node-script' ? [identity.entry] : []), ...launch.args], env, stdio: ['pipe', 'pipe', 'pipe'] })
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('spawn', () => {
      if (!child.pid || !process.connected || !process.send) { reject(new Error('Native CLI launch identity is unavailable')); return }
      process.send({ type: 'swa_native_cli_started', rootPid: process.pid, pid: child.pid, program, ...identity }, error => { if (error) reject(error) })
    })
    process.stdin.pipe(child.stdin)
    child.stdout.pipe(process.stdout, { end: false })
    child.stderr.pipe(process.stderr, { end: false })
    for (const stream of [child.stdin, child.stdout, child.stderr]) stream.once('error', reject)
    child.once('close', (code, signal) => {
      process.stdin.unpipe(child.stdin)
      process.stdin.pause()
      if (signal !== null || code === null) { reject(new Error('Native CLI exit status is unknown')); return }
      process.exitCode = code
      resolve()
    })
  })
})

const running = process.platform === 'linux'
  ? import('./linux-provider-bootstrap').then(module => module.runLinuxNativeCLI())
  : runWindowsNativeCLI()
running.catch(error => {
  process.stderr.write(JSON.stringify({ code: 'native_cli_job_failed', message: error instanceof Error ? error.message : 'Native CLI Job failed' }) + '\n')
  process.exitCode = 1
})
