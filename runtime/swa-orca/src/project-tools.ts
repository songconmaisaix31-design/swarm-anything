import { timingSafeEqual } from 'node:crypto'
import { lstatSync, realpathSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { delimiter, dirname, isAbsolute, join } from 'node:path'
import { homedir } from 'node:os'
import { isDeepStrictEqual } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { runProcess } from '@orca/process-host'
import { defineMethod, type RpcContext, type RpcRequest } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/core'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import { getStructuredAgentSessionHost } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-wire/structured-agent-session-registry'
import { authority } from './controller-scope'
import { nativeWorkerToolSource } from './question-ask'
import { assertDelegationParentStopOpen } from './delegation'
import { readPiQuestionEntries } from './pi-session-result'
import { readNativeOpenCodeProjectToolSource } from './opencode-session-result'
import { readAgentSettings } from './agent-settings'
import { projectShellPolicySchema, prepareProjectShell } from './project-shell'
import { invocationSchema, nativeObject, piProjectInputSchema, openCodeProjectInputSchema, projectToolOriginSchema, projectToolParamsSchema, projectToolAuthorizationSchema, projectToolRequestID, structuredInputBindingSchema, type Invocation, type ProjectToolOrigin, type ProjectToolParams } from './contracts'

function deny(message: string): never { throw new OrchestrationError('scope_denied', message, { effectsApplied: false }) }

export async function inspectProjectToolSupport(): Promise<{ available: boolean; reason: string }> {
  if (process.platform !== 'linux') return { available: false, reason: 'Project shell currently requires Linux bubblewrap isolation' }
  try {
    const info = lstatSync('/usr/bin/bwrap')
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || (info.mode & 0o022) !== 0) return { available: false, reason: '/usr/bin/bwrap must be a root-owned, non-writable executable' }
    const install = z.string().min(1).parse(process.env.SWA_INSTALL_ROOT)
    for (const path of [join(install, 'runtime/project-shell'), join(install, 'runtime/project-shell-entry.cjs'), join(install, 'runtime/pi-project-extension.mjs'), join(install, 'node/node')]) {
      const file = lstatSync(path)
      if (!file.isFile() || file.isSymbolicLink() || realpathSync.native(path) !== path) return { available: false, reason: 'The installed project tool wrapper, extension or Node source is unavailable' }
    }
    let closed = false
    const result = await runProcess({ program: '/usr/bin/bwrap', args: ['--unshare-user', '--unshare-pid', '--unshare-net', '--die-with-parent', '--new-session', '--cap-drop', 'ALL', '--clearenv', '--ro-bind', '/usr', '/usr', '--ro-bind', '/bin', '/bin', '--ro-bind', '/lib', '/lib', '--ro-bind', '/lib64', '/lib64', '--proc', '/proc', '--dev', '/dev', '/usr/bin/true'], cwd: '/', env: {}, timeoutMs: 5_000, maxOutputBytes: 4096, killOnOutputLimit: true, onChildTerminated: () => { closed = true } })
    return closed && result.code === 0 && !result.timedOut && !result.outputTruncated && result.stderr === '' ? { available: true, reason: 'Installed project tools are present and Linux bubblewrap executed its namespace probe; project permission and native model execution are checked separately' } : { available: false, reason: `Linux bubblewrap namespace probe failed (${result.code ?? 'no exit'}): ${result.stderr.trim().slice(0, 512) || 'process closure was not confirmed'}` }
  } catch (error) { return { available: false, reason: `Project tool installation or isolation probe is unavailable: ${error instanceof Error ? error.message : 'unknown error'}` } }
}

function source(context: RpcContext, agent: 'pi' | 'opencode') {
  const session = context.orchestrationCaller?.sessionId ?? context.orchestrationCompatibilityEvidence?.agentSessionId
  if (context.caller?.kind !== 'local-cli' || typeof session !== 'string' || typeof context.swaQuestionProducerProof !== 'string') deny('The original local project tool Worker proof is required')
  const producer = nativeWorkerToolSource(context.runtime, session, agent, agent === 'pi' ? 'bash' : 'shell')
  if (producer.selection.native_launch.tools.mode !== 'project') deny('The original Worker has no project development permission')
  const supplied = Buffer.from(context.swaQuestionProducerProof), expected = Buffer.from(producer.record.lease.ownerProcess!.spawnToken)
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) deny('The project tool Worker proof changed')
  assertDelegationParentStopOpen(context.runtime, producer.scope.run_id, producer.dispatch.id)
  const task = context.runtime.getOrchestrationDb().getTask(producer.dispatch.task_id)
  if (!task || ['completed', 'failed'].includes(task.status)) deny('A terminal Worker cannot execute another project tool')
  return producer
}

export function isProjectToolRequest(request: RpcRequest, context: RpcContext) {
  if (request.method === 'swa.projectToolAuthorize' || request.swaProjectToolOrigin !== undefined) return true
  const session = context.orchestrationCaller?.sessionId ?? request.orchestrationCompatibilityEvidence?.agentSessionId
  return request.method === 'status.get' && typeof session === 'string' && context.runtime.openedAgentSessionRecordStore()?.getRecord(session)?.provider === 'opencode'
}

export function admitProjectToolProducer(request: RpcRequest, params: unknown, context: RpcContext) {
  if (request.swaOwnerCapability !== undefined || request.swaQuestionOrigin !== undefined || !['status.get', 'swa.projectToolAuthorize'].includes(request.method)) deny('A project tool producer may only inspect its current command permission')
  if (request.method === 'status.get') {
    if (Object.keys(nativeObject(params)).length || request.swaProjectToolOrigin !== undefined) deny('The project tool status query cannot carry an operation')
    source(context, 'opencode')
    return
  }
  source(context, projectToolOriginSchema.parse(request.swaProjectToolOrigin).agent)
  projectToolParamsSchema.parse(params)
}

async function inspectCall(context: RpcContext, origin: ProjectToolOrigin, params: ProjectToolParams) {
  const current = source(context, origin.agent), host = getStructuredAgentSessionHost()
  if (!host?.deps.resolveWorkspacePath) deny('The actual project Worker directory is unavailable')
  const workspace = await realpath(await host.deps.resolveWorkspacePath(current.record.location.workspaceId))
  if (origin.agent === 'pi') {
    const account = current.account
    if (account.kind !== 'pi-native-api-key-per-session') deny('The native Pi project tool account changed')
    const input = piProjectInputSchema.parse(params.input)
    const native = readPiQuestionEntries({ path: current.head.handle.nativeId, privateRoot: join(account.private_root, current.sessionId), cwd: workspace, provider: account.provider, modelId: account.model_target.model_id, api: account.model_target.api, project: true })
    const index = native.entries.findIndex(entry => entry.id === origin.assistant_entry_id), entry = native.entries[index]
    if (native.header.id !== origin.native_session_id || !entry || entry.type !== 'message' || entry.message.role !== 'assistant' || params.cwd !== workspace || realpathSync.native(params.cwd) !== params.cwd) deny('The actual Pi command origin or working directory changed')
    const calls = entry.message.content.filter(item => item.type === 'toolCall' && item.id === origin.tool_call_id)
    if (calls.length !== 1 || calls[0]!.type !== 'toolCall' || calls[0]!.name !== 'bash' || !isDeepStrictEqual(calls[0]!.arguments, input) || !isDeepStrictEqual(input, params.input)) deny('The Pi command differs from its actual native tool call')
    if (native.entries.slice(index + 1).some(item => item.type === 'message' && (item.message.role === 'user' || item.message.role === 'toolResult' && item.message.toolCallId === origin.tool_call_id))) deny('The Pi tool call already completed or its input was superseded')
  } else {
    const input = openCodeProjectInputSchema.parse(params.input)
    const native = await readNativeOpenCodeProjectToolSource({ selection: current.selection, sessionId: current.sessionId, nativeId: current.head.handle.nativeId, cwd: workspace, projectId: current.invocation.project.id, origin, input })
    const binding = structuredInputBindingSchema.parse(native.binding), db = context.runtime.getOrchestrationDb()
    const row = db.getMutationReceipt(authority(context.runtime), binding.parent_request), receipt = row?.receipt && nativeObject(JSON.parse(row.receipt))
    if (native.cwd !== params.cwd || !isDeepStrictEqual(native.nativeInput, params.input) || !receipt || row?.method !== 'swa.controllerDeliver' || receipt.run_id !== current.scope.run_id || receipt.project_id !== current.invocation.project.id || !isDeepStrictEqual(receipt.swa_input_binding, binding) || binding.session_id !== current.sessionId || binding.dispatch_id !== current.dispatch.id || binding.runtime_fence !== current.record.lease.runtimeFence || binding.consumer_generation !== db.getRun(current.scope.run_id)?.consumer_generation) deny('The OpenCode command differs from its original current Worker input')
  }
  const fresh = source(context, origin.agent)
  if (!isDeepStrictEqual(current.record.lease, fresh.record.lease) || !isDeepStrictEqual(current.selection, fresh.selection)) deny('The project tool Worker changed during its native source check')
  return fresh
}

export function projectToolMethod(admit: (invocation: Invocation) => Promise<unknown>) {
  return defineMethod({ name: 'swa.projectToolAuthorize', permission: 'workspace', params: projectToolParamsSchema, handler: async (params, context) => {
    const origin = projectToolOriginSchema.parse(context.swaProjectToolOrigin), deadline = Date.now() + 90_000
    let current = await inspectCall(context, origin, params)
    while (current.row.state !== 'completed' || current.worker.state !== 'ready') {
      if (context.signal?.aborted || Date.now() >= deadline) deny('The original Worker start did not settle before its project command')
      await delay(100, undefined, { signal: context.signal })
      current = await inspectCall(context, origin, params)
    }
    const request = projectToolRequestID(current.sessionId, origin), marker = `native-project-tool:${request}`
    const invocation = invocationSchema.parse({ caller: current.invocation.caller, project: current.invocation.project, scope: current.scope, selection: current.selection,
      command: { action: 'worker.send', project_id: current.invocation.project.id, controller: current.scope.controller, task_id: current.scope.root_task_id, dispatch_id: current.dispatch.id, request_id: request, input_file: marker },
      input: { path: marker, version: request, text: params.input.command },
      native_project_tool: { schema: 'swa.native-project-tool.v1', start_request_id: current.row.request_id, request_id: request, session_id: current.sessionId, dispatch_id: current.dispatch.id, task_id: current.dispatch.task_id, origin, input: params.input, cwd: params.cwd } })
    const approved = z.object({ writable_roots: z.array(z.string().min(1)).min(1).max(32) }).parse(await admit(invocation))
    const settings = await readAgentSettings(), account = current.account
    const roots = [process.env.SWA_DATA_DIR, process.env.SWA_AGENT_PROFILE, join(z.string().min(1).parse(process.env.SWA_INSTALL_ROOT), 'runtime'), account.source_home, 'private_root' in account ? account.private_root : account.private_home,
      ...(process.env.SWA_PROTECTED_ROOTS?.split(delimiter) ?? []),
      ...['SWA_CODEX_API_KEY_HOME', 'SWA_CLAUDE_API_KEY_HOME', 'SWA_OPENCODE_API_KEY_HOME', 'SWA_DISCOVERY_PI_HOME', 'SWA_DISCOVERY_CODEX_HOME', 'SWA_DISCOVERY_CLAUDE_HOME', 'CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'PI_CODING_AGENT_DIR', 'OPENCODE_CONFIG_DIR'].map(key => process.env[key]),
      ...[homedir(), process.env.SWA_DISCOVERY_HOME].filter((path): path is string => !!path).flatMap(path => [join(path, '.codex'), join(path, '.claude'), join(path, '.pi'), join(path, '.config/opencode'), join(path, '.local/share/opencode')]),
      ...Object.values(settings.settings.agentDefaultEnv ?? {}).flatMap(env => Object.entries(env ?? {}).filter(([name]) => ['CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'PI_CODING_AGENT_DIR', 'OPENCODE_CONFIG_DIR'].includes(name)).map(([, value]) => value)),
      ...settings.settings.codexManagedAccounts?.map(item => item.managedHomePath) ?? [], ...settings.settings.claudeManagedAccounts?.map(item => dirname(item.managedAuthPath)) ?? []]
    const toolchains = process.env.SWA_PROJECT_TOOLCHAIN_ROOTS ? z.array(z.string().min(1)).max(16).parse(JSON.parse(process.env.SWA_PROJECT_TOOLCHAIN_ROOTS)) : []
    const protectedRoots = roots.filter((path): path is string => typeof path === 'string' && path !== '')
    if (protectedRoots.some(path => !isAbsolute(path))) deny('A configured private project tool boundary is not absolute')
    const policy = projectShellPolicySchema.parse({ schema: 'swa.project-shell.v1', project_root: current.invocation.project.root, writable_roots: approved.writable_roots, protected_roots: [...new Set(protectedRoots)], toolchain_roots: toolchains })
    // 检查实际目录、只读工具链和固定隔离器后释放描述符；本地原生执行器在 spawn 前重新打开并核对。
    const prepared = prepareProjectShell(policy, { command: params.input.command, cwd: params.cwd }); prepared.close()
    current = await inspectCall(context, origin, params)
    if (context.signal?.aborted || current.row.state !== 'completed' || current.worker.state !== 'ready') deny('The Worker cancelled before its project command authorization completed')
    return projectToolAuthorizationSchema.parse({ schema: 'swa.project-tool-authorization.v1', agent_session_id: current.sessionId, origin, policy, grant_expires_at: current.invocation.caller.grant_expires_at })
  } })
}
