import { createInterface } from 'node:readline'
import { RuntimeClient } from '../../../third_party/orca-v1.4.230/src/cli/runtime/client'
import { helperInput, nativeObject, nativeError, type Invocation } from './contracts'
import { workerSpec } from './worker-roles'

const controller = process.env.ORCA_TERMINAL_HANDLE
const data = process.env.ORCA_USER_DATA
const executable = process.env.SWA_EXECUTABLE
if (!controller || !data || !executable || process.env.SWA_CONTROLLER_HELPER !== '1') throw new Error('native_controller_environment_missing')
const client = new RuntimeClient(data, 120_000, null, null, executable)
const call = async (method: string, params?: unknown, requestId?: string) =>
  (await client.call(method, params, requestId ? { orchestrationRequestId: requestId, timeoutMs: 120_000 } : undefined)).result

async function execute(action: string, requestId: string, invocation?: Invocation): Promise<unknown> {
  if (action === 'identify') return { ready: true }
  if (action === 'observe') return { current: await call('orchestration.runCurrent', { from: controller }) }
  if (action === 'recover.v1') {
    if (!invocation || invocation.command.action !== 'controller.recover' || invocation.command.request_id !== requestId || !invocation.command.controller || invocation.command.controller === controller || !invocation.scope.run_id || invocation.scope.controller !== invocation.command.controller) throw new Error('controller_recovery_scope_mismatch')
    return call('orchestration.runUse', { id: invocation.scope.run_id, from: controller }, `${requestId}/run-use`)
  }
  if (!invocation || invocation.command.controller !== controller) throw new Error('controller_scope_mismatch')
  const c = invocation.command
  const run = invocation.scope.run_id
  if (action === 'task.create') {
    if (!invocation.spec || !invocation.context) throw new Error('fixed_task_context_missing')
    const created = nativeObject(await call('orchestration.runCreate', { from: controller, objective: invocation.spec.goal }, `${requestId}/run-create`))
    const nativeRun = nativeObject(created.run)
    const root = nativeObject(await call('orchestration.taskCreate', {
      spec: JSON.stringify({ spec: invocation.spec, context: invocation.context, project_id: invocation.project.id, settings_revision: invocation.caller.settings_revision }),
      taskTitle: invocation.spec.goal, callerTerminalHandle: controller, run: nativeRun.id
    }, `${requestId}/root-task`))
    return { ...created, ...root }
  }
  if (!run) throw new Error('native_run_missing')
  switch (action) {
    case 'task.complete': return call('orchestration.taskUpdate', { id: c.task_id, status: 'completed', result: invocation.input?.text, run, callerTerminalHandle: controller }, `${requestId}/native`)
    case 'worker.start': {
      if (!invocation.input || !invocation.selection || invocation.selection.agent_id !== c.agent || invocation.selection.model !== c.model) throw new Error('selected_native_worker_input_required')
      return call('orchestration.workerStart', {
        from: controller, run, parent: invocation.scope.root_task_id, worktree: 'current',
        taskTitle: c.name, agent: invocation.selection.agent_id, model: invocation.selection.model, timeoutMs: 90_000,
        spec: workerSpec(invocation)
      }, `${requestId}/native`)
    }
    case 'worker.stop': return call('orchestration.workerStop', { dispatch: c.dispatch_id }, `${requestId}/native`)
    case 'worker.release': return call('orchestration.workerRelease', { dispatch: c.dispatch_id }, `${requestId}/native`)
    case 'worker.send': {
      return call('swa.workerSend', { controller, parent_request: requestId }, `${requestId}/native`)
    }
    default: throw new Error('unsupported_controller_action')
  }
}

async function main() {
  const lines = createInterface({ input: process.stdin, terminal: false, crlfDelay: Infinity })
  for await (const line of lines) {
    const command = helperInput.parse(JSON.parse(line))
    try {
      const result = await execute(command.action, command.request_id, command.invocation)
      process.stdout.write(JSON.stringify({ type: 'swa_controller_reply', request_id: command.request_id, controller, pid: process.pid, result }) + '\n')
    } catch (error) {
      process.stdout.write(JSON.stringify({ type: 'swa_controller_reply', request_id: command.request_id, controller, pid: process.pid, error: nativeError(error) }) + '\n')
    }
  }
}
main().catch(error => { process.stderr.write(JSON.stringify(nativeError(error)) + '\n'); process.exitCode = 1 })
