import process from 'node:process'

export async function runWithParentJob(start: () => Promise<void>): Promise<void> {
  // 首条真实父 IPC 准入到达前只加载 Node 内置生命周期功能。
  const send = process.send?.bind(process), disconnect = process.disconnect?.bind(process)
  if (!process.connected || !send || !disconnect) throw new Error('SWA provider bootstrap requires its actual parent IPC channel')
  const beforeAdmissionEnd = () => process.exit(1)
  process.stdin.once('end', beforeAdmissionEnd)
  process.stdin.resume()
  const ownerLost = () => process.exit(1)
  process.once('disconnect', ownerLost)
  let admitted = false
  await new Promise<void>(resolve => process.on('message', message => {
    if (admitted) throw new Error('SWA provider bootstrap refuses repeated admission')
    if (!message || typeof message !== 'object' || !('type' in message) || message.type !== 'swa_job_admitted' || !('pid' in message) || message.pid !== process.pid || !('parentPid' in message) || message.parentPid !== process.ppid || !('creationTimeMs' in message) || typeof message.creationTimeMs !== 'number' || message.creationTimeMs <= 0) throw new Error('SWA provider bootstrap admission identity mismatch')
    admitted = true
    process.stdin.removeListener('end', beforeAdmissionEnd)
    process.stdin.pause()
    send({ type: 'swa_job_bootstrap_admitted', pid: process.pid, parentPid: process.ppid, creationTimeMs: message.creationTimeMs })
    resolve()
  }))
  try {
    await start()
    process.removeListener('disconnect', ownerLost)
    if (process.connected) disconnect()
  } catch (error) {
    process.stderr.write(JSON.stringify({ code: 'swa_job_child_failed', message: error instanceof Error ? error.message : 'SWA provider child failed' }) + '\n')
    process.exitCode = 1
    if (process.connected) disconnect()
    throw error
  }
}
