import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import type { Invocation } from './contracts'
import { workerSelectionMatches } from './role-selection'

const resultSchema = z.strictObject({ schema: z.literal('swa.delivery-admission.v1'), project_id: z.string().min(1), request_id: z.string().min(1), settings_revision: z.number().int().positive(), grant_expires_at: z.string().optional() })
const errorSchema = z.object({ error: z.object({ code: z.string().min(1), message: z.string().min(1) }) })

export function deliveryAdmissionInvocation(invocation: Invocation): Pick<Invocation, 'command' | 'caller' | 'project' | 'scope' | 'input' | 'selection' | 'handoff' | 'submission' | 'question_ask' | 'native_delegation'> {
  const { caller, project, scope, input, selection, handoff, submission, question_ask, native_delegation } = invocation
  let command = invocation.command
  if (command.action === 'worker.start') {
    if (!selection || !workerSelectionMatches(invocation)) throw new OrchestrationError('request_mismatch', 'The Worker selection differs from its assigned role', { effectsApplied: false })
    if (!command.agent && !command.model) command = { ...command, agent: selection.agent_id, model: selection.model }
  }
  // 原生 spec 留在原账本；完整 scope 与 submission 保留 Go 当前准入和交接冲突判断。
  return { command, caller, project, scope, input, selection, handoff, submission, question_ask, native_delegation }
}

export function assertDeliveryGrantCurrent(invocation: Invocation) {
  const expiresAt = invocation.caller.grant_expires_at
  if (expiresAt === undefined) return
  const deadline = Date.parse(expiresAt)
  if (!Number.isFinite(deadline)) throw new OrchestrationError('approval_unverified', 'The original Grant expiry is invalid')
  if (Date.now() >= deadline) throw new OrchestrationError('approval_revoked', 'The original Grant expired before the native effect', { effectsApplied: false })
}

export function createDeliveryAdmission(owner: Buffer, ownerAlive: () => boolean) {
  const port = Number(process.env.ASTROCYTE_PORT)
  if (owner.length !== 32 || !Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('private_delivery_admission_owner_unavailable')
  const capability = Buffer.from(owner)
  return async (invocation: Invocation) => {
    if (!ownerAlive() || !timingSafeEqual(owner, capability)) throw new OrchestrationError('operation_unknown', 'The owning product service is unavailable')
    const response = await fetch(`http://127.0.0.1:${port}/api/internal/swa/delivery-admission`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SWA-Owner-Capability': capability.toString('hex') },
      body: JSON.stringify(deliveryAdmissionInvocation(invocation)), redirect: 'error', signal: AbortSignal.timeout(10_000)
    })
    const body: unknown = await response.json()
    if (!response.ok) {
      const failure = errorSchema.safeParse(body)
      throw new OrchestrationError(failure.success ? failure.data.error.code : 'approval_unverified', failure.success ? failure.data.error.message : 'Current delivery approval could not be verified')
    }
    const result = resultSchema.parse(body)
    if (!ownerAlive() || result.project_id !== invocation.project.id || result.request_id !== invocation.command.request_id || result.settings_revision !== invocation.caller.settings_revision || result.grant_expires_at !== invocation.caller.grant_expires_at) throw new OrchestrationError('context_stale', 'Current delivery approval differs from the original invocation')
    assertDeliveryGrantCurrent(invocation)
    return result
  }
}
