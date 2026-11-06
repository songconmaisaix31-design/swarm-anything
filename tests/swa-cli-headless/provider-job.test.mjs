import assert from 'node:assert/strict'
// 普通进程 fixture 使用安装候选的真实 Job 和关闭适配，不调用模型。
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { performance } from 'node:perf_hooks'
import { copyFile, cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'
import { inspectFixtureJob } from './job-membership.mjs'

const { values } = parseArgs({ options: { candidate: { type: 'string' }, output: { type: 'string' } }, allowPositionals: false })
if (!values.candidate || !values.output || !isAbsolute(values.candidate) || !isAbsolute(values.output)) throw new Error('Explicit installed candidate and new evidence file are required')
const candidate = await realpath(values.candidate)
const node = join(candidate, 'node', 'node.exe')
if ((await realpath(process.execPath)).toLowerCase() !== node.toLowerCase()) throw new Error('This fixture must run with the installed candidate Node')
const requireRuntime = createRequire(join(candidate, 'runtime', 'package.json'))
const { SwaProviderProcessTree } = requireRuntime('./swa-provider-process-tree.cjs')
const { spawnManagedProviderProcess } = requireRuntime('./managed-provider-process.cjs')
const fixture = join(dirname(import.meta.filename), 'job-fixture.mjs')
const records = []
const missingExecutableTree = new SwaProviderProcessTree()
const missingExecutable = spawnManagedProviderProcess({ command: join(candidate, 'explicitly-absent-sdk-node.exe'), args: [], swaJobIPC: true }, { site: 'swa-actual-processless-fixture', acceptClose: value => value.root === 'exited' && missingExecutable.processless })
missingExecutableTree.bind(missingExecutable.child, () => ({ observed: missingExecutable.rootExitObserved, processless: missingExecutable.processless }))
await assert.rejects(missingExecutableTree.ready())
await missingExecutable.exitPromise
assert.equal(missingExecutable.child.pid, undefined)
assert.equal(missingExecutable.processless, true)
assert.equal(missingExecutable.rootExitObserved, false)
const processlessClose = await missingExecutable.close(missingExecutableTree)
assert.deepEqual(processlessClose, { root: 'exited', tree: null })
const noMembershipTree = new SwaProviderProcessTree()
const noMembership = spawnManagedProviderProcess({ command: node, args: ['-e', 'process.exit(0)'], swaJobIPC: true }, { site: 'swa-actual-missing-membership-fixture', acceptClose: value => value.root === 'exited' && value.tree === 'exited' })
await noMembership.exitPromise
assert.ok(noMembership.child.pid > 0)
assert.equal(noMembership.rootExitObserved, true)
assert.equal(noMembership.processless, false)
noMembershipTree.bind(noMembership.child, () => ({ observed: noMembership.rootExitObserved, processless: noMembership.processless }))
await assert.rejects(noMembershipTree.ready())
const noMembershipClose = await noMembership.close(noMembershipTree)
assert.deepEqual(noMembershipClose, { root: 'exited', tree: 'unverifiable' })
const unboundRetainedJob = noMembershipTree.readObservation()
assert.equal(unboundRetainedJob.assigned, false)
assert.deepEqual(unboundRetainedJob.members, [])
assert.equal(noMembershipTree.treeVerdict, 'unverifiable')
const unrelatedTree = new SwaProviderProcessTree()
const unrelated = spawnManagedProviderProcess({ command: node, args: [fixture, 'root', 'forced', join(candidate, 'runtime', 'provider-job-bootstrap.mjs')], swaJobIPC: true }, { site: 'swa-unrelated-owned-process-fixture', acceptClose: value => value.root === 'exited' && value.tree === 'exited' })
unrelated.child.stdout.resume()
unrelatedTree.bind(unrelated.child, () => ({ observed: unrelated.rootExitObserved, processless: unrelated.processless }))
await unrelatedTree.ready()
const unrelatedBefore = unrelatedTree.readObservation()
const native = requireRuntime('node-pty/lib/utils').loadNativeModule('conpty').module
const negativeJob = native.createProviderJob()
assert.throws(() => native.assignProviderJob(negativeJob, unrelatedBefore.rootPid, unrelatedBefore.rootCreationTimeMs + 1), /creation identity changed/)
assert.throws(() => native.assignProviderJob(negativeJob, unrelatedBefore.rootPid, unrelatedBefore.rootCreationTimeMs), /another owned Provider Job/)
assert.equal(native.queryProviderJob(negativeJob).assigned, false)
assert.deepEqual(native.queryProviderJob(negativeJob).members, [])
assert.equal(native.closeProviderJob(negativeJob), true)
assert.throws(() => native.queryProviderJob(negativeJob), /ownership unavailable/)
for (const mode of ['normal', 'forced', 'crash', 'late-child']) {
  const tree = new SwaProviderProcessTree()
  const managed = spawnManagedProviderProcess({ command: node, args: [fixture, 'root', mode, join(candidate, 'runtime', 'provider-job-bootstrap.mjs')], swaJobIPC: true }, { site: 'swa-owned-process-fixture', acceptClose: value => value.root === 'exited' && value.tree === 'exited' })
  tree.bind(managed.child, () => ({ observed: managed.rootExitObserved, processless: managed.processless }))
  const seen = []
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Actual fixture descendants did not become ready')), 10_000)
    const lines = createInterface({ input: managed.child.stdout, crlfDelay: Infinity })
    lines.on('line', line => {
      try {
        const row = JSON.parse(line)
        if (row.type !== 'owned_process_fixture_ready') throw new Error('Unexpected process fixture output')
        seen.push(row)
        if (seen.length === 3) { clearTimeout(timer); resolve() }
      } catch (error) { clearTimeout(timer); reject(error) }
    })
    managed.onExit(() => { if (seen.length < 3) { clearTimeout(timer); reject(new Error('Actual fixture root exited before descendants were observed')) } })
  })
  await tree.ready()
  await ready
  const before = tree.readObservation()
  const actualProcesses = await inspectFixtureJob(requireRuntime, before, seen)
  const closed = await managed.close(tree)
  assert.deepEqual(closed, { root: 'exited', tree: 'exited' })
  assert.equal(managed.rootExitObserved, true)
  assert.equal(tree.treeVerdict, 'exited')
  const unrelatedAfter = unrelatedTree.readObservation()
  assert.equal(unrelated.rootExitObserved, false)
  assert.equal(unrelatedAfter.rootPid, unrelatedBefore.rootPid)
  assert.equal(unrelatedAfter.rootCreationTimeMs, unrelatedBefore.rootCreationTimeMs)
  assert.ok(unrelatedAfter.members.some(member => member.pid === unrelatedBefore.rootPid && member.creationTimeMs === unrelatedBefore.rootCreationTimeMs))
  records.push({ mode, fixtures: seen, actualProcesses, admittedJob: before, close: closed, unrelatedAfter })
}
const owner = spawn(node, [join(dirname(import.meta.filename), 'job-owner-fixture.mjs'), candidate], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
owner.stderr.pipe(process.stderr, { end: false })
const ownerExit = once(owner, 'exit')
const actualParentJob = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Actual owner fixture did not report its Job')), 15_000)
  createInterface({ input: owner.stdout, crlfDelay: Infinity }).once('line', line => {
    try {
      const record = JSON.parse(line)
      assert.equal(record.type, 'owned_job_parent_ready')
      assert.equal(record.pid, owner.pid)
      assert.equal(record.fixtures.length, 3)
      assert.ok(record.job.members.length >= record.fixtures.length)
      clearTimeout(timer)
      resolve(record.job)
    } catch (error) { clearTimeout(timer); reject(error) }
  })
})
const processAPI = requireRuntime('@vscode/windows-process-tree')
const ownerCreationTimeMs = processAPI.getProcessCreationTime(owner.pid)
assert.ok(ownerCreationTimeMs > 0)
owner.stdin.end()
assert.equal((await ownerExit)[0], 77)
assert.throws(() => native.queryProviderJob(actualParentJob), /actual native Job object/)
const priorIdentities = [...actualParentJob.members, { pid: owner.pid, creationTimeMs: ownerCreationTimeMs }]
const independentExit = []
const deadline = performance.now() + 3_000
while (independentExit.length < 2 && performance.now() < deadline) {
  const rows = await new Promise((resolve, reject) => processAPI.getAllProcesses(rows => rows ? resolve(rows) : reject(new Error('Fresh native process snapshot unavailable')), 4))
  const targets = priorIdentities.map(expected => ({ expected, observed: rows.find(row => row.pid === expected.pid) ?? null }))
  if (targets.every(row => row.observed === null || row.observed.creationTimeMs !== undefined && row.observed.creationTimeMs !== row.expected.creationTimeMs)) independentExit.push({ elapsedMs: performance.now(), targets })
  else independentExit.length = 0
  await new Promise(resolve => setTimeout(resolve, 50))
}
assert.equal(independentExit.length, 2)
const unrelatedAfterParentLoss = unrelatedTree.readObservation()
assert.equal(unrelatedAfterParentLoss.rootPid, unrelatedBefore.rootPid)
assert.equal(unrelatedAfterParentLoss.rootCreationTimeMs, unrelatedBefore.rootCreationTimeMs)
assert.equal(unrelated.rootExitObserved, false)
assert.deepEqual(await unrelated.close(unrelatedTree), { root: 'exited', tree: 'exited' })
const missing = await mkdtemp(join(dirname(values.output), 'missing-native-'))
await mkdir(join(missing, 'node_modules', '@vscode'), { recursive: true })
for (const file of ['package.json', 'agent-connection.cjs']) await copyFile(join(candidate, 'runtime', file), join(missing, file))
const originalPty = await realpath(dirname(requireRuntime.resolve('node-pty/package.json')))
const originalReader = await realpath(dirname(requireRuntime.resolve('@vscode/windows-process-tree/package.json')))
await cp(originalPty, join(missing, 'node_modules', 'node-pty'), { recursive: true, dereference: true, filter: source => basename(source) !== 'conpty.node' })
await cp(originalReader, join(missing, 'node_modules', '@vscode', 'windows-process-tree'), { recursive: true, dereference: true })
const missingRejection = JSON.parse(execFileSync(node, [join(dirname(import.meta.filename), 'missing-native-probe.mjs'), missing, node, join(candidate, 'runtime', 'native-cli-entry.cjs')], { encoding: 'utf8', windowsHide: true, timeout: 15_000 }))
assert.equal(missingRejection.type, 'actual_missing_native_rejection')
await writeFile(values.output, JSON.stringify({ candidate, source_revision: (await readFile(join(candidate, 'VERSION'), 'utf8')).trim(), cases: records, model_calls: 0, scope: 'ordinary_owned_process_fixture', unrelatedBefore, processless: { actualPID: missingExecutable.child.pid ?? null, processless: missingExecutable.processless, rootExitObserved: missingExecutable.rootExitObserved, close: processlessClose }, missingMembership: { actualPID: noMembership.child.pid, rootExitObserved: noMembership.rootExitObserved, close: noMembershipClose, unboundRetainedJob }, negativeCases: ['actual_closed_job_rejected', 'wrong_creation_identity_rejected', 'different_owned_job_reassignment_rejected'], parentLoss: { actualParentJob, owner: { pid: owner.pid, creationTimeMs: ownerCreationTimeMs }, independentExit, oldJobTreeVerdict: 'unknown', unrelatedAfterParentLoss }, missingRejection, remainingCases: ['actual_native_abort_then_close'] }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ process_fixture_cases: records.length, output: values.output, real_agent_acceptance: 'NOT_RUN' }))
