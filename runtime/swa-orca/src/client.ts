import { stdin, stdout } from 'node:process'
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import { RuntimeClient } from '../../../third_party/orca-v1.4.230/src/cli/runtime/client'
import { RuntimeClientError, RuntimeRpcFailureError } from '../../../third_party/orca-v1.4.230/src/cli/runtime/types'
import { commandSchema, invocationSchema, capabilityRequirementsSchema, agentSelectionSchema, registeredAgentSchema, nativeObject, nativeError, type Invocation } from './contracts'

const requestSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('registered_agent'), agent_id: z.string().min(1) }),
  z.object({ operation: z.literal('scope'), project_id: z.string().min(1), command: commandSchema }),
  z.strictObject({ operation: z.literal('capabilities'), project_id: z.string().min(1), project_root: z.string().min(1).refine(isAbsolute), requirements: capabilityRequirementsSchema }),
  z.object({ operation: z.literal('selection'), project_id: z.string().min(1), command: commandSchema }),
  z.object({ operation: z.literal('execute'), invocation: invocationSchema })
])

async function input() {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of stdin) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += value.length
    if (length > 2 * 1024 * 1024) throw new Error('SWA command exceeds the declared input bound')
    chunks.push(value)
  }
  return requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
}

async function main() {
  const request = await input()
  const data = process.env.SWA_DATA_DIR, executable = process.env.SWA_EXECUTABLE
  if (!data || !executable) throw new Error('Explicit product runtime paths are required')
  const client = new RuntimeClient(data, 130_000, null, null, executable)
  if (request.operation === 'registered_agent') {
    const response = await client.call('swa.registeredAgent', { agent_id: request.agent_id })
    const result = registeredAgentSchema.parse(response.result)
    stdout.write(JSON.stringify({ envelope: { ok: true, runtime_id: response._meta.runtimeId, authority_domain: result.runtime.authority_domain, result } }) + '\n')
    return
  }
  if (request.operation === 'scope') {
    const response = await client.call('swa.scope', { project_id: request.project_id, controller: request.command.controller })
    stdout.write(JSON.stringify({ scope: response.result }) + '\n')
    return
  }
  if (request.operation === 'selection') {
    const response = await client.call('swa.resolveSelection', { project_id: request.project_id, command: request.command })
    stdout.write(JSON.stringify({ selection: agentSelectionSchema.parse(response.result) }) + '\n')
    return
  }
  if (request.operation === 'capabilities') {
    const status = await client.call('swa.status')
    const response = await client.call('swa.capabilities', { project_id: request.project_id, project_root: request.project_root, requirements: request.requirements })
    stdout.write(JSON.stringify({ envelope: { ok: true, runtime_id: response._meta.runtimeId, authority_domain: z.string().min(1).parse(nativeObject(status.result).authority_domain), result: response.result } }) + '\n')
    return
  }
  const invocation = request.invocation, command = invocation.command
  const status = await client.call('swa.status')
  const authority = z.string().min(1).parse(nativeObject(status.result).authority_domain)
  const envelope: Record<string, unknown> = {
    ok: true, request_id: command.request_id, runtime_id: status._meta.runtimeId,
    authority_domain: authority, controller: command.controller,
    run_id: invocation.scope.run_id || undefined, task_id: command.task_id || undefined, dispatch_id: command.dispatch_id, question_id: command.question_id
  }
  const mutationOptions = { orchestrationRequestId: command.request_id, timeoutMs: 130_000 }
  try {
    let result: unknown
    switch (command.action) {
      case 'status':
        result = status.result; break
      case 'role.list':
      case 'role.show':
      case 'conversation.list':
      case 'conversation.show': result = (await client.call('swa.collaborationRead', { invocation })).result; break
      case 'role.create':
      case 'role.update':
      case 'role.archive':
      case 'conversation.create':
      case 'conversation.append':
      case 'handoff.notify': result = (await client.call('swa.collaborationWrite', { invocation }, mutationOptions)).result; break
      case 'controller.open': result = (await client.call('swa.controllerOpen', { invocation }, mutationOptions)).result; break
      case 'controller.recover': result = (await client.call('swa.controllerRecover', { invocation }, mutationOptions)).result; break
      case 'controller.show': result = (await client.call('swa.controllerShow', { project_id: invocation.project.id, controller: command.controller })).result; break
      case 'controller.close': result = (await client.call('swa.controllerClose', { invocation }, mutationOptions)).result; break
      case 'task.create': result = (await client.call('swa.taskCreate', { invocation }, mutationOptions)).result; break
      case 'run.show':
      case 'run.export': result = (await client.call('swa.runObserve', { invocation })).result; break
      case 'task.complete':
      case 'worker.start':
      case 'worker.send':
      case 'question.answer':
      case 'question.resume':
      case 'worker.stop':
      case 'worker.release': result = (await client.call('swa.controllerDeliver', { invocation }, mutationOptions)).result; break
      case 'request.show': result = await requestShow(client, invocation); break
      default: result = (await client.call('swa.observe', { invocation })).result
    }
    const observed = nativeObject(result)
    if (typeof observed.controller === 'string') envelope.controller = observed.controller
    if (typeof observed.run_id === 'string') envelope.run_id = observed.run_id
    if (typeof observed.root_task_id === 'string') envelope.task_id = observed.root_task_id
    const native = observed.native ? nativeObject(observed.native) : undefined
    if (typeof native?.runId === 'string') envelope.run_id = native.runId
    if (typeof native?.taskId === 'string') envelope.task_id = native.taskId
    if (typeof native?.dispatchId === 'string') envelope.dispatch_id = native.dispatchId
    if (native?.dispatch) {
      const dispatch = nativeObject(native.dispatch)
      if (typeof dispatch.id === 'string') envelope.dispatch_id = dispatch.id
    }
    envelope.result = result
    const error = nativeOutcomeError(command.action, native)
    if (error) {
      envelope.ok = false
      envelope.error = error
      stdout.write(JSON.stringify({ envelope, error }) + '\n')
      process.exitCode = 1
      return
    }
    stdout.write(JSON.stringify({ envelope }) + '\n')
  } catch (error) {
    envelope.ok = false
    envelope.error = nativeError(error)
    if (error instanceof RuntimeRpcFailureError && error.response._meta) envelope.runtime_id = error.response._meta.runtimeId
    stdout.write(JSON.stringify({ envelope, error: envelope.error }) + '\n')
    process.exitCode = 1
  }
}

function nativeOutcomeError(action: string, native: Record<string, unknown> | undefined) {
  if (['worker.send', 'question.answer', 'question.resume'].includes(action) && native?.state === 'rejected') {
    const failure = z.object({ code: z.string(), message: z.string(), retryable: z.boolean(), required_action: z.string(), data: z.unknown().optional() }).optional().parse(native.error)
    return failure ?? { code: 'provider_unavailable', message: 'The actual native Worker rejected this input', retryable: false, required_action: 'inspect_original_request', data: native }
  }
  const expected = action === 'worker.start' ? ['ready'] : ['worker.send', 'question.resume'].includes(action) ? ['journaled', 'queued', 'accepted', 'handed-to-terminal'] : action === 'question.answer' ? ['answered'] : action === 'worker.stop' ? ['stopped'] : action === 'worker.release' ? ['released', 'already_released'] : undefined
  if (!expected) return undefined
  if (typeof native?.state === 'string' && expected.includes(native.state)) return undefined
  const failed = action === 'worker.start' && native?.state === 'failed'
  return { code: failed ? 'provider_unavailable' : 'operation_unknown', message: `The actual native ${action} result did not confirm ${expected.join('/')}`, retryable: false, required_action: 'inspect_original_request', data: native }
}

async function requestShow(client: RuntimeClient, invocation: Invocation) {
  const requestId = invocation.command.request_id
  if (!requestId) throw new Error('The original request ID is required')
  const response = await client.call('orchestration.requestShow', { request: requestId })
  const request = nativeObject(response.result)
  if (request.state === 'absent') return request
  const receipt = nativeObject(request.receipt)
  if (receipt.project_id !== invocation.project.id || invocation.command.controller && receipt.controller !== invocation.command.controller && !(request.method === 'swa.controllerRecover' && receipt.prior_controller === invocation.command.controller)) throw new RuntimeClientError('scope_denied', 'Native request belongs to another project or controller')
  const childIds = z.array(z.string()).parse(receipt.children ?? (receipt.child_request ? [receipt.child_request] : []))
  const children = []
  for (const child of childIds) children.push((await client.call('orchestration.requestShow', { request: child })).result)
  const input = receipt.swa_input_binding === undefined ? undefined : (await client.call('swa.inputStatus', { project_id: invocation.project.id, request_id: requestId })).result
  return { ...request, children, ...(input === undefined ? {} : { current_input: input }) }
}

main().catch(error => {
  stdout.write(JSON.stringify({ error: nativeError(error) }) + '\n')
  process.exitCode = 1
})
