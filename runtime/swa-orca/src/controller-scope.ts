import { z } from 'zod'
import { isDeepStrictEqual } from 'node:util'
import type { OrcaRuntimeService } from '../../../third_party/orca-v1.4.230/src/main/runtime/orca-runtime'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import { getLocalPtyProvider } from '../../../third_party/orca-v1.4.230/src/main/ipc/pty/provider/registry'
import { readWindowsProcessIdentityTableFresh } from '../../../third_party/orca-v1.4.230/src/main/windows/windows-process-table'
import { contextSchema, nativeObject, scopeSchema, type Scope } from './contracts'
import { isSwaLinuxProcessAbsent, readSwaLinuxProcess, requireSwaLinuxProcess, swaLinuxProcessIdentitySchema } from '../../../third_party/orca-v1.4.230/src/main/daemon/swa-linux-process-identity'

const controllerProcessSchema = z.union([
  z.object({ pid: z.number().int().positive(), creationTimeMs: z.number().positive(), name: z.string() }),
  swaLinuxProcessIdentitySchema
])

export const controllerOwnerSchema = z.object({
  project_id: z.string(), controller: z.string(), worktree_id: z.string(),
  binding: z.object({ ptyId: z.string(), processIncarnation: z.string(), generation: z.number() }),
  process: controllerProcessSchema,
  helper: controllerProcessSchema,
  caller_authority: z.object({ terminalHandle: z.string().min(1), paneKey: z.string().min(1), processIncarnation: z.string().min(1), launchTokenHash: z.string().min(1), hostScope: z.looseObject({ kind: z.literal('local') }) })
})
export type Controller = z.infer<typeof controllerOwnerSchema>
const fail = (code: string, message: string): never => { throw new OrchestrationError(code, message) }
export const authority = (runtime: OrcaRuntimeService) => runtime.getOrchestrationDb().getOrCreateLocalMutationCallerFingerprint()

export function recorded(runtime: OrcaRuntimeService, method: string, controller: string) {
  const db = runtime.getOrchestrationDb()
  const row = db.db.prepare(`SELECT receipt, state FROM mutation_receipts
    WHERE caller_fingerprint=? AND method=? AND json_valid(receipt)=1 AND json_extract(receipt, '$.controller')=?
    ORDER BY created_at DESC LIMIT 1`).get(authority(runtime), method, controller)
  const parsed = z.object({ receipt: z.string(), state: z.string() }).optional().parse(row)
  return parsed ? { state: parsed.state, receipt: nativeObject(JSON.parse(parsed.receipt)) } : undefined
}

export function controllerScope(runtime: OrcaRuntimeService, project: string, controller: string, options?: { history: boolean }): { owner: Controller; scope: Scope } {
  const open = recorded(runtime, 'swa.controllerOpen', controller) ?? recorded(runtime, 'swa.controllerRecover', controller)
  if (!open || open.state !== 'completed') return fail('operation_unknown', 'The exact controller open receipt is unavailable')
  const owner = controllerOwnerSchema.parse(open.receipt)
  if (owner.project_id !== project) return fail('scope_denied', 'The native controller belongs to another project')
  const created = open.receipt.scope ? { state: 'completed', receipt: scopeSchema.parse(open.receipt.scope) } : recorded(runtime, 'swa.taskCreate', controller)
  const scope: Scope = { project_id: project, controller, run_id: '', root_task_id: '', authority_domain: authority(runtime), context: {} }
  if (created) {
    if (created.state !== 'completed') return fail('operation_unknown', 'The original task creation remains pending')
    const ids = z.object({ run_id: z.string(), root_task_id: z.string() }).parse(created.receipt)
    const task = runtime.getOrchestrationDb().getTask(ids.root_task_id)
    const run = runtime.getOrchestrationDb().getRun(ids.run_id)
    if (!task || !run || task.run_id !== run.id || task.parent_id !== null) return fail('scope_denied', 'The native Run/root task association changed')
    const fixed = z.object({ project_id: z.string(), context: contextSchema }).parse(JSON.parse(task.spec))
    if (fixed.project_id !== project) return fail('scope_denied', 'The fixed task belongs to another project')
    Object.assign(scope, ids, { context: fixed.context })
    if (open.receipt.scope && !isDeepStrictEqual(scope.context, nativeObject(open.receipt.scope).context)) return fail('scope_denied', 'The recovered fixed context changed')
    if (!options?.history) {
      if (run.coordinator_handle !== controller || run.coordinator_pane_key !== owner.caller_authority.paneKey) return fail('scope_denied', 'The exact controller is no longer the native Run consumer')
      const pending = z.object({ count: z.number().int() }).parse(runtime.getOrchestrationDb().db.prepare(`SELECT COUNT(*) AS count FROM mutation_receipts
        WHERE caller_fingerprint=? AND method='swa.controllerRecover' AND state='pending' AND json_valid(receipt)=1
        AND json_extract(receipt, '$.scope.run_id')=?`).get(authority(runtime), run.id))
      if (pending.count) throw new OrchestrationError('operation_in_progress', 'The exact controller recovery still owns its reservation', { effectsApplied: false })
    }
  }
  return { owner, scope }
}

export async function observeControllerExited(runtime: OrcaRuntimeService, owner: Controller) {
  const observations = []
  for (let index = 0; index < 2; index++) {
    const inventory = await getLocalPtyProvider().listProcesses()
    const ptys = inventory.filter(row => row.id === owner.binding.ptyId || row.terminalHandle === owner.controller)
    let processCount = 0
    if (process.platform === 'linux') {
      for (const old of [owner.process, owner.helper]) {
        if (!('platform' in old)) return fail('operation_unknown', 'The controller belongs to another operating system')
        try {
          const actual = readSwaLinuxProcess(old.pid)
          if (!isDeepStrictEqual(actual, old)) return fail('operation_unknown', 'The prior controller process identity was replaced')
          processCount++
        } catch (error) {
          if (!isSwaLinuxProcessAbsent(old.pid)) throw error
        }
      }
    } else {
      const rows = await readWindowsProcessIdentityTableFresh()
      const processes = rows.filter(row => [owner.process, owner.helper].some(old => old.pid === row.pid))
      if (processes.some(row => ![owner.process, owner.helper].some(old => !('platform' in old) && old.pid === row.pid && old.creationTimeMs === row.creationTimeMs && old.name === row.name))) return fail('operation_unknown', 'The prior controller process identity was replaced')
      processCount = processes.length
    }
    observations.push({ observed_at: new Date().toISOString(), ptys: ptys.length, processes: processCount })
  }
  if (observations.every(row => row.ptys === 0 && row.processes === 0)) return observations
  if (observations.every(row => row.ptys > 0 || row.processes > 0)) throw new OrchestrationError('controller_unverifiable', 'The prior controller PTY or helper is still present', { effectsApplied: false, observations })
  return fail('operation_unknown', 'The prior controller exit changed between independent observations')
}

export async function exactController(runtime: OrcaRuntimeService, owner: Controller) {
  const inventory = await getLocalPtyProvider().listProcesses()
  const matches = inventory.filter(row => row.id === owner.binding.ptyId && row.terminalHandle === owner.controller && row.incarnationId === owner.binding.processIncarnation && row.rootProcessId === owner.process.pid)
  if (matches.length !== 1) return fail('worker_identity_changed', 'The exact controller PTY incarnation is not present')
  const binding = runtime.getTerminalPromptRequestBinding(owner.controller)
  if (binding.ptyId !== owner.binding.ptyId || binding.processIncarnation !== owner.binding.processIncarnation) return fail('worker_identity_changed', 'The controller binding changed')
  if (runtime.getTerminalProcessIncarnation(owner.controller) !== owner.caller_authority.processIncarnation) return fail('worker_identity_changed', 'The controller caller process incarnation changed')
  if (process.platform === 'linux') {
    for (const identity of [owner.process, owner.helper]) {
      if (!('platform' in identity)) return fail('worker_identity_changed', 'The controller belongs to another operating system')
      requireSwaLinuxProcess(identity)
    }
    return
  }
  const rows = await readWindowsProcessIdentityTableFresh()
  for (const identity of [owner.process, owner.helper]) {
    if ('platform' in identity) return fail('worker_identity_changed', 'The controller belongs to another operating system')
    const row = rows.find(item => item.pid === identity.pid)
    if (!row || row.creationTimeMs !== identity.creationTimeMs || row.name !== identity.name) return fail('worker_identity_changed', 'The controller process identity changed')
  }
}
