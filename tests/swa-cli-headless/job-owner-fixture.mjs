import { once } from 'node:events'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { inspectFixtureJob } from './job-membership.mjs'

const [candidate] = process.argv.slice(2)
const requireRuntime = createRequire(join(candidate, 'runtime', 'package.json'))
const { SwaProviderProcessTree } = requireRuntime('./swa-provider-process-tree.cjs')
const { spawnManagedProviderProcess } = requireRuntime('./managed-provider-process.cjs')
const tree = new SwaProviderProcessTree()
const managed = spawnManagedProviderProcess({ command: process.execPath, args: [join(dirname(import.meta.filename), 'job-fixture.mjs'), 'root', 'forced', join(candidate, 'runtime', 'provider-job-bootstrap.mjs')], swaJobIPC: true }, { site: 'swa-parent-loss-process-fixture', acceptClose: result => result.root === 'exited' && result.tree === 'exited' })
tree.bind(managed.child, () => ({ observed: managed.rootExitObserved, processless: managed.processless }))
const fixtures = []
const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Actual parent-loss descendants did not become ready')), 10_000)
  createInterface({ input: managed.child.stdout, crlfDelay: Infinity }).on('line', line => {
    const record = JSON.parse(line)
    if (record.type !== 'owned_process_fixture_ready') return reject(new Error('Unexpected ordinary fixture output'))
    fixtures.push(record)
    if (fixtures.length === 3) { clearTimeout(timer); resolve() }
  })
})
await tree.ready()
await ready
const actualJob = tree.readObservation()
const processes = await inspectFixtureJob(requireRuntime, actualJob, fixtures)
process.stdout.write(JSON.stringify({ type: 'owned_job_parent_ready', pid: process.pid, job: actualJob, fixtures, processes }) + '\n')
process.stdin.resume()
await once(process.stdin, 'end')
// 实际宿主异常退出，使其唯一 Job 句柄由 Windows 关闭。
process.exit(77)
