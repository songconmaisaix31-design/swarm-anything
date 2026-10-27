import { readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { currentUserSid, readServiceJobMember } from '@orca/windows-security'
import { z } from 'zod'
import type { DaemonEndpointIdentity } from './daemon-hello-protocol'
import type { ParsedDaemonPid } from './daemon-pid-file-parse'
import { readSwaLinuxProcess, requireSwaLinuxAncestor } from './swa-linux-process-identity'

const roots = {
  name: z.string().regex(/^Local\\SWAService[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  serve_pid: z.number().int().positive(), serve_created_at_ms: z.number().int().positive(),
  data_root: z.string().refine(isAbsolute), install_root: z.string().refine(isAbsolute), source_revision: z.string().regex(/^[0-9a-f]{40}$/)
}
const serviceOwnerSchema = z.strictObject(roots)
const linuxRoots = {
  platform: z.literal('linux'), name: z.string().regex(/^SWAService[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  serve_pid: z.number().int().positive(), serve_start_ticks: z.string().regex(/^[1-9][0-9]*$/),
  boot_id: z.uuid(), owner_uid: z.string().regex(/^(?:0|[1-9][0-9]*)$/),
  data_root: roots.data_root, install_root: roots.install_root, source_revision: roots.source_revision
}
const linuxServiceOwnerSchema = z.strictObject(linuxRoots)
export const swaDaemonServiceJobSchema = z.union([
  z.strictObject({ ...roots, daemon_pid: z.number().int().positive(), daemon_created_at_ms: z.number().int().positive(), daemon_session: z.uuid() }),
  z.strictObject({ ...linuxRoots, daemon_pid: z.number().int().positive(), daemon_start_ticks: z.string().regex(/^[1-9][0-9]*$/), daemon_session: z.uuid() })
])
export type SwaDaemonServiceJob = z.infer<typeof swaDaemonServiceJobSchema>
const samePath = (left: string, right: string) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right

function environmentOwner() {
  if (process.platform !== 'win32' && process.platform !== 'linux') throw new Error('SWA service ownership is unavailable on this platform')
  const value: unknown = JSON.parse(z.string().min(1).parse(process.env.SWA_SERVICE_JOB))
  const owner = process.platform === 'linux' ? linuxServiceOwnerSchema.parse(value) : serviceOwnerSchema.parse(value)
  if (!samePath(realpathSync.native(owner.data_root), owner.data_root) || !samePath(realpathSync.native(owner.install_root), owner.install_root) || !samePath(z.string().parse(process.env.ORCA_USER_DATA_PATH), owner.data_root) || !samePath(z.string().parse(process.env.SWA_INSTALL_ROOT), owner.install_root) || !samePath(realpathSync.native(process.execPath), join(owner.install_root, 'node', process.platform === 'win32' ? 'node.exe' : 'node')) || readFileSync(join(owner.install_root, 'VERSION'), 'utf8').trim() !== owner.source_revision) throw new Error('SWA service Job source or private roots changed')
  if ('platform' in owner) {
    const serve = readSwaLinuxProcess(owner.serve_pid)
    if (serve.boot_id !== owner.boot_id || serve.start_ticks !== owner.serve_start_ticks || serve.owner_uid !== owner.owner_uid || realpathSync(`/proc/${serve.pid}/exe`) !== join(owner.install_root, 'swa')) throw new Error('SWA Linux service owner changed')
    requireSwaLinuxAncestor(readSwaLinuxProcess(process.pid), serve)
  }
  return owner
}

function member(name: string, pid: number, created?: number) {
  const actual = readServiceJobMember(name, pid), user = currentUserSid(), trustees = new Set([user, 'S-1-5-18'])
  if (actual.name !== name || actual.pid !== pid || created !== undefined && actual.creationTimeMs !== created || !actual.protected || actual.ownerSid !== user || actual.aces.length !== trustees.size) throw new Error('SWA service Job kernel ownership changed')
  for (const ace of actual.aces) if (ace.flags !== 0 || ace.mask !== 0x1f003f || !trustees.delete(ace.sid)) throw new Error('SWA service Job permissions changed')
  if (trustees.size) throw new Error('SWA service Job permissions are incomplete')
  return actual
}

export function captureSwaDaemonServiceJob(launchNonce: string | undefined): SwaDaemonServiceJob | undefined {
  if (process.env.SWA_SERVICE_JOB === undefined) return undefined
  const owner = environmentOwner()
  if ('platform' in owner) {
    const daemon = readSwaLinuxProcess(process.pid)
    return swaDaemonServiceJobSchema.parse({ ...owner, daemon_pid: daemon.pid, daemon_start_ticks: daemon.start_ticks, daemon_session: launchNonce })
  }
  member(owner.name, owner.serve_pid, owner.serve_created_at_ms)
  const daemon = member(owner.name, process.pid)
  return swaDaemonServiceJobSchema.parse({ ...owner, daemon_pid: daemon.pid, daemon_created_at_ms: daemon.creationTimeMs, daemon_session: launchNonce })
}

export function observeRuntimeSwaServiceJob(identity: DaemonEndpointIdentity | null, record: ParsedDaemonPid | null) {
  const owner = environmentOwner(), actual = swaDaemonServiceJobSchema.parse(identity?.swa_service_job)
  if (!identity || !record || !isDeepStrictEqual(record.swa_service_job, actual) || identity.pid !== actual.daemon_pid || identity.launchNonce !== actual.daemon_session || record.pid !== identity.pid || record.startedAtMs !== identity.startedAtMs || record.launchNonce !== identity.launchNonce || actual.name !== owner.name || actual.source_revision !== owner.source_revision || !samePath(actual.data_root, owner.data_root) || !samePath(actual.install_root, owner.install_root) || !samePath(identity.entryPath ?? '', join(owner.install_root, 'runtime', 'daemon-entry.js')) || !samePath(identity.spawnerExecPath ?? '', join(owner.install_root, 'node', process.platform === 'win32' ? 'node.exe' : 'node'))) throw new Error('The authenticated daemon and its original PID record disagree about SWA Job ownership')
  if ('platform' in owner) {
    if (!('platform' in actual) || actual.boot_id !== owner.boot_id || actual.serve_start_ticks !== owner.serve_start_ticks || actual.owner_uid !== owner.owner_uid || record.linuxStartTicks !== actual.daemon_start_ticks || record.bootId !== owner.boot_id) throw new Error('The Linux daemon record has a different process incarnation')
    const daemon = readSwaLinuxProcess(actual.daemon_pid)
    if (daemon.start_ticks !== actual.daemon_start_ticks || daemon.boot_id !== owner.boot_id || daemon.owner_uid !== owner.owner_uid || realpathSync(`/proc/${daemon.pid}/exe`) !== join(owner.install_root, 'node', 'node')) throw new Error('The Linux daemon process identity changed')
    requireSwaLinuxAncestor(daemon, readSwaLinuxProcess(owner.serve_pid))
    return actual
  }
  if ('platform' in actual) throw new Error('The Windows daemon cannot use Linux ownership')
  member(owner.name, owner.serve_pid, owner.serve_created_at_ms)
  member(owner.name, actual.daemon_pid, actual.daemon_created_at_ms)
  return actual
}
