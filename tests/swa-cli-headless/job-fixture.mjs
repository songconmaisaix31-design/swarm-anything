import { pathToFileURL } from 'node:url'

const [role, mode, bootstrap] = process.argv.slice(2)
if (!['root', 'child', 'grandchild'].includes(role) || !['normal', 'forced', 'crash', 'late-child'].includes(mode)) throw new Error('Explicit owned process fixture role and mode are required')

async function runFixture() {
  const { spawn } = await import('node:child_process')
  const { once } = await import('node:events')
  const children = []
  const spawnChild = childRole => {
    const child = spawn(process.execPath, [import.meta.filename, childRole, mode, bootstrap], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    child.stdout.pipe(process.stdout, { end: false })
    child.stderr.pipe(process.stderr, { end: false })
    const exit = once(child, 'exit')
    children.push({ child, exit })
  }
  if (role === 'root') spawnChild('child')
  if (role === 'child') spawnChild('grandchild')
  process.stdout.write(JSON.stringify({ type: 'owned_process_fixture_ready', role, pid: process.pid, parentPid: process.ppid, mode }) + '\n')
  process.stdin.resume()
  if (mode === 'forced') {
    setInterval(() => {}, 1_000)
    await new Promise(() => {})
  }
  await once(process.stdin, 'end')
  if (mode === 'crash' && role === 'root') process.exit(23)
  if (mode === 'late-child' && role === 'root') {
    spawnChild('grandchild')
    await new Promise(resolve => setTimeout(resolve, 100))
    process.exit(24)
  }
  for (const { child } of children) child.stdin.end()
  await Promise.all(children.map(({ exit }) => exit))
}

if (role === 'root') {
  const { runWithParentJob } = await import(pathToFileURL(bootstrap).href)
  await runWithParentJob(runFixture)
} else await runFixture()
