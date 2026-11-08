import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { parseLinuxStartTicks } from '../agent-hooks/managed-hook-owner-identity'
import { parseProcessTable } from '../pty-process-table-parser'

export const swaLinuxProcessIncarnationSchema = z.strictObject({
  platform: z.literal('linux'), pid: z.number().int().positive(), boot_id: z.uuid(),
  start_ticks: z.string().regex(/^[1-9][0-9]*$/), owner_uid: z.string().regex(/^(?:0|[1-9][0-9]*)$/)
})
export const swaLinuxProcessIdentitySchema = swaLinuxProcessIncarnationSchema.extend({ name: z.string().min(1) })
export type SwaLinuxProcessIncarnation = z.infer<typeof swaLinuxProcessIncarnationSchema>
export type SwaLinuxProcessIdentity = z.infer<typeof swaLinuxProcessIdentitySchema>

export function isSwaLinuxProcessAbsent(pid: number) {
  if (process.platform !== 'linux' || !Number.isSafeInteger(pid) || pid <= 0 || !statSync('/proc/self').isDirectory()) throw new Error('SWA Linux process inventory is unavailable')
  try { lstatSync(`/proc/${pid}`); return false }
  catch (error) {
    if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ESRCH')) return true
    throw error
  }
}

export function readSwaLinuxProcessIncarnation(pid: number): SwaLinuxProcessIncarnation {
  if (process.platform !== 'linux' || !Number.isSafeInteger(pid) || pid <= 0 || !process.getuid) throw new Error('SWA Linux process identity is unavailable')
  const path = `/proc/${pid}`
  const before = parseLinuxStartTicks(readFileSync(`${path}/stat`, 'utf8'))
  const owner = statSync(path).uid
  const boot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()
  const after = parseLinuxStartTicks(readFileSync(`${path}/stat`, 'utf8'))
  if (before !== after || owner !== process.getuid() || owner !== statSync(path).uid) throw new Error('SWA Linux process identity or owner changed')
  return swaLinuxProcessIncarnationSchema.parse({ platform: 'linux', pid, boot_id: boot, start_ticks: before, owner_uid: String(owner) })
}

export function requireSwaLinuxIncarnation(expected: SwaLinuxProcessIncarnation) {
  if (!isDeepStrictEqual(readSwaLinuxProcessIncarnation(expected.pid), expected)) throw new Error('SWA Linux process incarnation changed')
}

export function readSwaLinuxProcess(pid: number): SwaLinuxProcessIdentity {
  const before = readSwaLinuxProcessIncarnation(pid)
  const executable = realpathSync(`/proc/${pid}/exe`)
  requireSwaLinuxIncarnation(before)
  if (executable !== realpathSync(`/proc/${pid}/exe`)) throw new Error('SWA Linux executable identity changed')
  return swaLinuxProcessIdentitySchema.parse({ ...before, name: basename(executable) })
}

export function requireSwaLinuxProcess(expected: SwaLinuxProcessIdentity) {
  const actual = readSwaLinuxProcess(expected.pid)
  if (!isDeepStrictEqual(actual, expected)) throw new Error('SWA Linux process incarnation changed')
  return actual
}

export function requireSwaLinuxAncestor(child: SwaLinuxProcessIdentity, ancestor: SwaLinuxProcessIdentity) {
  requireSwaLinuxProcess(child)
  requireSwaLinuxProcess(ancestor)
  const output = execFileSync('/bin/ps', ['-eo', 'pid=,ppid=,pgid=,lstart='], { encoding: 'utf8', timeout: 5000, maxBuffer: 32 * 1024 * 1024, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' } })
  const rows = new Map(parseProcessTable(output).map(row => [row.pid, row]))
  const visited = new Set<number>()
  const chain = []
  for (let pid = child.pid; pid > 0 && !visited.has(pid);) {
    visited.add(pid)
    chain.push(pid)
    if (pid === ancestor.pid) {
      const observations = chain.map(readSwaLinuxProcess)
      for (const observation of observations) requireSwaLinuxProcess(observation)
      requireSwaLinuxProcess(ancestor)
      return
    }
    const row = rows.get(pid)
    if (!row) throw new Error('SWA Linux ancestor inventory is incomplete')
    pid = row.ppid
  }
  throw new Error('SWA Linux process is not owned by its exact service ancestor')
}
