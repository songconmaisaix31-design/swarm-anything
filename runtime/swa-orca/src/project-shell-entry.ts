import { projectShellPolicyEnvironment, projectShellPolicySchema, runProjectShell } from './project-shell'

async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '-c') throw new Error('The project shell entry accepts exactly one native -c command')
  const encoded = process.env[projectShellPolicyEnvironment]
  if (!encoded || Buffer.byteLength(encoded) > 32 * 1024) throw new Error('The current project shell policy is unavailable')
  const policy = projectShellPolicySchema.parse(JSON.parse(encoded))
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGTERM', cancel)
  process.once('SIGINT', cancel)
  try {
    const result = await runProjectShell(policy, { command: process.argv[3]!, cwd: process.cwd() }, { signal: controller.signal, onData: data => process.stdout.write(data) })
    process.exitCode = result.exitCode
  } finally {
    process.removeListener('SIGTERM', cancel)
    process.removeListener('SIGINT', cancel)
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Project shell failed'}\n`)
  process.exitCode = 1
})
