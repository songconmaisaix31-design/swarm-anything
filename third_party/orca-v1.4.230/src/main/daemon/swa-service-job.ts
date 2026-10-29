import { readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { currentUserSid, readServiceJobMember } from '@orca/windows-security'
import { z } from 'zod'
import type { DaemonEndpointIdentity } from './daemon-hello-protocol'
import type { ParsedDaemonPid } from './daemon-pid-file-parse'

const roots = {
  name: z.string().regex(/^Local\\SWAService[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  serve_pid: z.number().int().positive(), serve_created_at_ms: z.number().int().positive(),
  windows_session_id: z.number().int().positive().optional(),
  data_root: z.string().refine(isAbsolute), install_root: z.string().refine(isAbsolute), source_revision: z.string().regex(/^[0-9a-f]{40}$/)
}
const serviceOwnerSchema = z.strictObject(roots)
export const swaDaemonServiceJobSchema = z.strictObject({ ...roots, daemon_pid: z.number().int().positive(), daemon_created_at_ms: z.number().int().positive(), daemon_session: z.uuid() })
export type SwaDaemonServiceJob = z.infer<typeof swaDaemonServiceJobSchema>
const samePath = (left: string, right: string) => left.toLowerCase() === right.toLowerCase()

function environmentOwner() {
  if (process.platform !== 'win32') throw new Error('SWA service Job requires Windows')
  const owner = serviceOwnerSchema.parse(JSON.parse(z.string().min(1).parse(process.env.SWA_SERVICE_JOB)))
  if (!samePath(realpathSync.native(owner.data_root), owner.data_root) || !samePath(realpathSync.native(owner.install_root), owner.install_root) || !samePath(z.string().parse(process.env.ORCA_USER_DATA_PATH), owner.data_root) || !samePath(z.string().parse(process.env.SWA_INSTALL_ROOT), owner.install_root) || !samePath(realpathSync.native(process.execPath), join(owner.install_root, 'node', 'node.exe')) || readFileSync(join(owner.install_root, 'VERSION'), 'utf8').trim() !== owner.source_revision) throw new Error('SWA service Job source or private roots changed')
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
  member(owner.name, owner.serve_pid, owner.serve_created_at_ms)
  const daemon = member(owner.name, process.pid)
  return swaDaemonServiceJobSchema.parse({ ...owner, daemon_pid: daemon.pid, daemon_created_at_ms: daemon.creationTimeMs, daemon_session: launchNonce })
}

export function observeRuntimeSwaServiceJob(identity: DaemonEndpointIdentity | null, record: ParsedDaemonPid | null) {
  const owner = environmentOwner(), actual = swaDaemonServiceJobSchema.parse(identity?.swa_service_job)
  if (!identity || !record || !isDeepStrictEqual(record.swa_service_job, actual) || identity.pid !== actual.daemon_pid || identity.launchNonce !== actual.daemon_session || record.pid !== identity.pid || record.startedAtMs !== identity.startedAtMs || record.launchNonce !== identity.launchNonce || actual.name !== owner.name || actual.source_revision !== owner.source_revision || !samePath(actual.data_root, owner.data_root) || !samePath(actual.install_root, owner.install_root) || !samePath(identity.entryPath ?? '', join(owner.install_root, 'runtime', 'daemon-entry.js')) || !samePath(identity.spawnerExecPath ?? '', join(owner.install_root, 'node', 'node.exe'))) throw new Error('The authenticated daemon and its original PID record disagree about SWA Job ownership')
  member(owner.name, owner.serve_pid, owner.serve_created_at_ms)
  member(owner.name, actual.daemon_pid, actual.daemon_created_at_ms)
  return actual
}
