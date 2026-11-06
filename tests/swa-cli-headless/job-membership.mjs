import assert from 'node:assert/strict'

export async function inspectFixtureJob(requireRuntime, job, fixtures) {
  assert.deepEqual(fixtures.map(row => row.role).sort(), ['child', 'grandchild', 'root'])
  assert.equal(new Set(fixtures.map(row => row.pid)).size, 3)
  const nativeProcesses = requireRuntime('@vscode/windows-process-tree')
  const processes = await new Promise((resolve, reject) => nativeProcesses.getAllProcesses(rows => rows ? resolve(rows.filter(row => job.members.some(member => member.pid === row.pid))) : reject(new Error('Actual fixture process identities unavailable')), 4))
  console.error(JSON.stringify({ type: 'actual_fixture_job_membership', job, fixtures, processes }))
  assert.equal(processes.length, job.members.length)
  assert.equal(new Set(job.members.map(row => row.pid)).size, job.members.length)
  for (const member of job.members) {
    const actual = processes.find(row => row.pid === member.pid)
    assert.equal(actual.creationTimeMs, member.creationTimeMs)
    const fixture = fixtures.find(row => row.pid === member.pid)
    if (fixture) {
      assert.equal(actual.name.toLowerCase(), 'node.exe')
      assert.equal(actual.ppid, fixture.parentPid)
    } else {
      // Windows 为这些实际 Node 后代创建的 console 进程也必须留在所属 Job 中。
      assert.equal(actual.name.toLowerCase(), 'conhost.exe')
      const parent = job.members.find(row => fixtures.some(fixture => fixture.pid === row.pid) && row.pid === actual.ppid)
      assert.ok(parent)
      assert.ok(actual.creationTimeMs >= parent.creationTimeMs)
    }
  }
  for (const fixture of fixtures) assert.ok(job.members.some(row => row.pid === fixture.pid && row.creationTimeMs > 0))
  return processes
}
