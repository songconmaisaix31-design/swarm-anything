import { appendFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'

// 仅为 EOF 前置条件记录真实事件，不消费 stdin、不发送或替换产品 IPC。
const file = process.env.SWA_TEST_STDIN_OBSERVATION
if (!file || !isAbsolute(file)) throw new Error('The stdin observation requires its absolute test path')
const record = event => appendFileSync(file, JSON.stringify({ event, pid: process.pid, monotonic_ns: process.hrtime.bigint().toString() }) + '\n')
process.on('message', message => {
  if (message && ['swa_linux_admit', 'swa_linux_stop', 'swa_linux_fulltree_ack'].includes(message.type)) record(message.type)
})
process.stdin.once('end', () => {
  queueMicrotask(() => record('stdin-end-listeners-completed'))
})
