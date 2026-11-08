import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'

export const swaDarwinBootIdSchema = z.string().regex(/^darwin-boottime:[1-9][0-9]*:(?:0|[1-9][0-9]{0,5})$/)
const base = { schema: z.literal('swa.darwin-process-identity.v1'), platform: z.literal('darwin'), pid: z.number().int().positive().max(0x7fffffff) }
const present = z.strictObject({
  ...base, state: z.literal('present'), ppid: z.number().int().nonnegative().max(0x7fffffff),
  owner_uid: z.string().regex(/^(?:0|[1-9][0-9]*)$/), start_ticks: z.string().regex(/^[1-9][0-9]*$/),
  boot_id: swaDarwinBootIdSchema, executable: z.strictObject({ state: z.literal('observed'), path: z.string().refine(isAbsolute) })
})
export const swaDarwinProcessIdentitySchema = z.union([present, z.strictObject({ ...base, state: z.literal('absent') })])
export type SwaDarwinProcessIdentity = z.infer<typeof present>

export function observeSwaDarwinProcess(pid: number, timeout = 5000) {
  if (process.platform !== 'darwin' || !process.getuid || !Number.isSafeInteger(pid) || pid <= 0 || pid > 0x7fffffff) throw new Error('SWA Darwin process identity is unavailable')
  const root = process.env.SWA_INSTALL_ROOT, executable = process.env.SWA_EXECUTABLE
  if (!root || !isAbsolute(root) || realpathSync(root) !== resolve(root)) throw new Error('SWA Darwin install root changed')
  const command = join(root, 'swa')
  if (executable !== command || realpathSync(command) !== command || !lstatSync(command).isFile()) throw new Error('SWA Darwin identity executable changed')
  const revision = readFileSync(join(root, 'VERSION'), 'utf8').trim()
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('SWA Darwin source revision is invalid')
  const options = { encoding: 'utf8' as const, shell: false as const, timeout: Math.max(1, Math.min(timeout, 5000)), maxBuffer: 16 * 1024, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' } }
  if (execFileSync(command, ['--version'], options).trim() !== revision) throw new Error('SWA Darwin identity helper version changed')
  // 非零退出（包括 6）、超时和不完整输出均抛出，不能转换成 absent。
  const result = swaDarwinProcessIdentitySchema.parse(JSON.parse(execFileSync(command, ['darwin-process-identity', String(pid)], options)))
  if (result.pid !== pid || result.state === 'present' && result.owner_uid !== String(process.getuid())) throw new Error('SWA Darwin process owner changed')
  return result
}

export function readSwaDarwinProcess(pid: number, timeout?: number): SwaDarwinProcessIdentity {
  const result = observeSwaDarwinProcess(pid, timeout)
  if (result.state !== 'present') throw new Error('SWA Darwin process is absent')
  return result
}

// 此父链仅证明当前启动归属，不能证明全部 fork 后代已退出。
export function requireSwaDarwinAncestor(child: SwaDarwinProcessIdentity, ancestor: SwaDarwinProcessIdentity) {
  const deadline = Date.now() + 10_000, chain: SwaDarwinProcessIdentity[] = [], visited = new Set<number>()
  const read = (pid: number) => {
    if (Date.now() >= deadline) throw new Error('SWA Darwin ancestor observation timed out')
    return readSwaDarwinProcess(pid, Math.min(1000, deadline - Date.now()))
  }
  let current = child
  for (let depth = 0; depth < 32 && !visited.has(current.pid); depth++) {
    visited.add(current.pid)
    if (current.boot_id !== ancestor.boot_id || current.owner_uid !== ancestor.owner_uid || BigInt(current.start_ticks) < BigInt(ancestor.start_ticks)) break
    chain.push(current)
    if (current.pid === ancestor.pid) {
      if (!isDeepStrictEqual(current, ancestor)) break
      for (const expected of chain) if (!isDeepStrictEqual(read(expected.pid), expected)) throw new Error('SWA Darwin ancestor identity changed')
      return
    }
    if (current.ppid <= 0) break
    current = read(current.ppid)
  }
  throw new Error('SWA Darwin process has no verified service ancestor')
}
