import { isDeepStrictEqual } from 'node:util'
import { randomBytes } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { z } from 'zod'
import { isAbsolute, join } from 'node:path'
import type { OrcaRuntimeService } from '../../../third_party/orca-v1.4.230/src/main/runtime/orca-runtime'
import { installStructuredAgentLaunchAdmission } from '../../../third_party/orca-v1.4.230/src/main/runtime/structured-agent-launch-composition'
import { structuredWorkerIdentities } from '../../../third_party/orca-v1.4.230/src/main/runtime/structured-worker-identity'
import { getPendingWorkerStartRecovery, hashCanonical, replayStableCallerParams } from '../../../third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-receipt'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import { agentSelectionSchema, invocationSchema, nativeObject, structuredInputBindingSchema as inputBindingSchema } from './contracts'
import { codexProtectedRoots, selectAgent } from './agent-discovery'
import { readAgentSettings } from './agent-settings'
import { assertNativePiSnapshotCurrent, inspectNativePiPolicy, sameNativeLaunchPolicy } from './native-pi-policy'
import { createNativeWorkerDirectory, materializePrivatePiSessionAccount, privatePiEnvironment, verifyPrivatePiSessionAccount } from './private-pi-account'
import { getAppEnvironment } from '../../../third_party/orca-v1.4.230/src/shared/app-environment'
import { getRuntimeSourceStamp } from '../../../third_party/orca-v1.4.230/src/main/runtime/host-descriptor'
import { stampRuntimeSourceEnv } from '../../../third_party/orca-v1.4.230/src/shared/runtime-source-env'
import { assertDeliveryGrantCurrent, createDeliveryAdmission } from './delivery-admission'
import type { StructuredAgentInputAdmission, StructuredWorkerLaunchAdmission, StructuredWorkerStartAdmission } from '../../../third_party/orca-v1.4.230/src/main/runtime/structured-agent-launch-composition'
import { installWorkerInputApproval } from './worker-input'
import { assertNativeOpenCodeCurrent, inspectNativeOpenCodePolicy } from './native-opencode-policy'
import { materializePrivateOpenCodeAccount, privateOpenCodeEnvironment, readPrivateOpenCodeBinding } from './private-opencode-account'
import { createOpenCodeSessionPolicy } from './opencode-session-policy'
import { assertNativeCodexCurrent, inspectNativeCodexPolicy } from './native-codex-policy'
import { materializePrivateCodexAccount, privateCodexEnvironment, verifyPrivateCodexAccount, verifyUninitializedPrivateCodexAccount } from './private-codex-account'
import { createCodexSessionPolicy } from './codex-session-policy'
import { assertNativeClaudeCurrent, inspectNativeClaudePolicy } from './native-claude-policy'
import { materializePrivateClaudeAccount, privateClaudeEnvironment, verifyPrivateClaudeAccount } from './private-claude-account'
import { createClaudeSessionPolicy } from './claude-session-policy'
import { createPiSessionPolicy } from './pi-session-policy'
import { isTaskDescendant } from './run-view'
import { runCleanupApproval, validateHandoffInput } from './run-settlement'
import { controllerScope } from './controller-scope'
import { workerTaskSpec, assertCurrentCollaborationAssignment } from './collaboration-records'
import { workerSelectionMatches } from './role-selection'
import { assertDelegationParentCurrent } from './delegation'

const mutationRowSchema = z.object({ caller_fingerprint: z.string(), request_id: z.string(), method: z.string(), payload_hash: z.string(), state: z.enum(['pending', 'completed']), receipt: z.string().nullable() })

export function requireStructuredWorkerMode(mode: StructuredWorkerStartAdmission['mode']) {
  if (mode !== 'structured') throw new OrchestrationError('unsupported_capability', 'The approved Worker requires its native structured execution mode; terminal execution is not authorized', { effectsApplied: false })
}

export function installAgentLaunchAdmission(runtime: OrcaRuntimeService, owner: { ownerCapability: Buffer; ownerAlive(): boolean }) {
  const admitCurrentApproval = createDeliveryAdmission(owner.ownerCapability, owner.ownerAlive)
  const releaseInputApproval = installWorkerInputApproval(admitCurrentApproval)
  const piPolicies = new Map<string, Awaited<ReturnType<typeof createPiSessionPolicy>>>()
  function inspectWorkerLaunch(input: StructuredWorkerLaunchAdmission) {
    const mutation = input.mutation
    if (!owner.ownerAlive() || !mutation || mutation.method !== 'orchestration.workerStart' || !mutation.requestId.endsWith('/native')) throw new OrchestrationError('scope_denied', 'The original owned Worker start identity is unavailable', { effectsApplied: false })
    const requestId = z.uuid().parse(mutation.requestId.slice(0, -'/native'.length))
    const db = runtime.getOrchestrationDb(), fingerprint = db.getOrCreateLocalMutationCallerFingerprint()
    const row = db.getMutationReceipt(fingerprint, requestId)
    if (mutation.callerFingerprint !== fingerprint || row?.method !== 'swa.controllerDeliver' || row.state !== 'pending' || !row.receipt || db.getMutationReceipt(fingerprint, mutation.requestId)) throw new OrchestrationError('request_mismatch', 'The original fresh Worker start reservation changed', { effectsApplied: false })
    const receipt = nativeObject(JSON.parse(row.receipt)), invocation = invocationSchema.parse(receipt.invocation), selection = agentSelectionSchema.parse(receipt.selection)
    const command = invocation.command, { scope, owner: controller } = controllerScope(runtime, invocation.project.id, input.controller)
    const expected = { from: input.controller, run: scope.run_id, parent: command.parent_task_id ?? scope.root_task_id, worktree: 'current', taskTitle: command.name, agent: selection.agent_id, model: selection.model, timeoutMs: 90_000, spec: workerTaskSpec(invocation) }
    if (command.action !== 'worker.start' || command.request_id !== requestId || command.controller !== input.controller || !workerSelectionMatches(invocation) || receipt.action !== command.action || receipt.child_request !== mutation.requestId || receipt.project_id !== invocation.project.id || receipt.controller !== input.controller || receipt.run_id !== scope.run_id || receipt.root_task_id !== scope.root_task_id || !isDeepStrictEqual(invocation.scope, scope) || !isDeepStrictEqual(invocation.selection, selection) || input.agent !== selection.agent_id || input.runId !== scope.run_id || input.worktreeId !== controller.worktree_id || mutation.payloadHash !== hashCanonical({ method: mutation.method, params: replayStableCallerParams(runtime, expected, undefined, mutation.method) })) throw new OrchestrationError('request_mismatch', 'The actual Worker source or request differs from its approved selection', { effectsApplied: false })
    assertCurrentCollaborationAssignment(db, invocation)
    assertDelegationParentCurrent(runtime, invocation)
    assertDeliveryGrantCurrent(invocation)
    return { invocation, selection, receipt: row.receipt, scope, controller }
  }
  async function workerCommandSettings(input: StructuredWorkerLaunchAdmission) {
    const original = inspectWorkerLaunch(input)
    await admitCurrentApproval(original.invocation)
    if (!isDeepStrictEqual(inspectWorkerLaunch(input), original)) throw new OrchestrationError('request_mismatch', 'The Worker reservation changed before its installed CLI probe', { effectsApplied: false })
    return { agentCmdOverrides: { [original.selection.agent_id]: `"${original.selection.executable}"` } }
  }
  async function beforeWorkerStart(input: StructuredWorkerStartAdmission) {
    const inspect = () => {
      requireStructuredWorkerMode(input.mode)
      const current = inspectWorkerLaunch(input)
      if (current.selection.execution_mode !== input.mode) throw new OrchestrationError('request_mismatch', 'The actual Worker mode differs from its approved selection', { effectsApplied: false })
      return current
    }
    const original = inspect()
    await admitCurrentApproval(original.invocation)
    return () => {
      const current = inspect()
      if (!isDeepStrictEqual(current, original)) throw new OrchestrationError('request_mismatch', 'The Worker reservation changed before its atomic acceptance', { effectsApplied: false })
    }
  }
  async function originalSelection(sessionId: string, agent: string, requireRecord = true) {
    if (!owner.ownerAlive()) throw new Error('The owning product service is unavailable')
    const identity = structuredWorkerIdentities.getBySessionId(sessionId)
    if (!identity?.dispatchId || identity.agent !== agent) throw new Error('The native Worker launch has no exact Dispatch association')
    const db = runtime.getOrchestrationDb()
    const parents = z.array(mutationRowSchema).parse(db.db.prepare(`SELECT * FROM mutation_receipts
      WHERE caller_fingerprint=? AND method='swa.controllerDeliver' AND state IN ('pending','completed') AND json_valid(receipt)=1
      AND json_extract(receipt, '$.action')='worker.start'`).all(db.getOrCreateLocalMutationCallerFingerprint()))
    const matches = []
    for (const row of parents) {
      if (row.receipt === null) continue
      const parent = nativeObject(JSON.parse(row.receipt))
      const request = z.string().min(1).parse(parent.child_request)
      const children = z.array(mutationRowSchema).parse(db.db.prepare(`SELECT * FROM mutation_receipts
        WHERE method='orchestration.workerStart' AND request_id=?`).all(request))
      if (children.length !== 1 || children[0]!.receipt === null) continue
      const child = children[0]!
      const dispatchId = child.state === 'pending' ? getPendingWorkerStartRecovery('orchestration.workerStart', child.receipt)?.dispatchId : nativeObject(JSON.parse(child.receipt!)).dispatchId
      if (dispatchId === identity.dispatchId) {
        const invocation = invocationSchema.parse(parent.invocation)
        const selection = agentSelectionSchema.parse(parent.selection)
        if (!isDeepStrictEqual(invocation.selection, selection) || invocation.project.id !== parent.project_id || invocation.scope.run_id !== parent.run_id || invocation.scope.root_task_id !== parent.root_task_id || invocation.scope.controller !== parent.controller || invocation.command.request_id + '/native' !== request) throw new Error('The original native Worker invocation changed')
        const dispatch = db.getDispatchContextById(identity.dispatchId)
        const task = dispatch && db.getTask(dispatch.task_id)
        if (!dispatch || dispatch.run_id !== invocation.scope.run_id || !task || !isTaskDescendant(db, invocation.scope.run_id, invocation.scope.root_task_id, task.id)) throw new Error('The native Worker Dispatch left its original Run and root task')
        matches.push({ selection, invocation, parentRow: row, childRow: child })
      }
    }
    if (matches.length !== 1 || matches[0]!.selection.agent_id !== agent) throw new Error('The original native Worker selection is unavailable or ambiguous')
    const { selection: original, invocation, parentRow, childRow } = matches[0]!
    const record = runtime.openedAgentSessionRecordStore()?.getRecord(sessionId)
    if (requireRecord || record) {
      if (!record || record.provider !== agent || record.options?.model !== original.model) throw new Error('The native session Agent, account or model changed before launch')
      const account = original.native_launch.account
      if (account.kind === 'pi-native-api-key-per-session') {
        if (!('variable' in record.accountHome) || record.accountHome.variable !== 'PI_CODING_AGENT_DIR' || record.accountHome.path !== join(account.private_root, sessionId)) throw new Error('The native Pi account changed before launch')
      } else if (account.kind === 'pi-native-api-key') {
        throw new Error('The legacy shared Pi account cannot admit new input')
      } else if (account.kind === 'codex-native-api-key') {
        if (!('variable' in record.accountHome) || record.accountHome.variable !== 'CODEX_HOME' || record.accountHome.path !== join(account.private_root, sessionId)) throw new Error('The native Codex account changed before launch')
      } else if (account.kind === 'claude-native-api-key') {
        if (!('variable' in record.accountHome) || record.accountHome.variable !== 'CLAUDE_CONFIG_DIR' || record.accountHome.path !== join(account.private_root, sessionId, 'config')) throw new Error('The native Claude account changed before launch')
      } else if (!('kind' in record.accountHome) || record.accountHome.kind !== 'opencode' || record.accountHome.locator.kind !== 'private' || record.accountHome.locator.root !== join(account.private_root, sessionId)) throw new Error('The native OpenCode account changed before launch')
    }
    const tools = original.native_launch.tools
    const current = await selectAgent(runtime, invocation.project.id, original.agent_id, original.model, invocation.project.root, tools.mode !== 'disabled' && tools.allowed.some(name => name === 'swa_ask') ? 'native' : 'disabled', tools.mode === 'collaboration' ? 'native' : 'disabled')
    if (!isDeepStrictEqual(original, current)) throw new Error('The selected native Agent configuration changed before launch')
    return { original, invocation, parentRow, childRow }
  }
  async function policySnapshot(sessionId: string, agent: string, requireRecord = true) {
    const selected = await originalSelection(sessionId, agent, requireRecord)
    const { original } = selected
    const account = original.native_launch.account
    if (agent === 'pi' && account.kind === 'pi-native-api-key-per-session' && original.version === '1.0.1') {
      const settings = await readAgentSettings()
      const tools = original.native_launch.tools
      const snapshot = await inspectNativePiPolicy({ executable: original.executable, version: original.version, sourceHome: account.source_home, projectId: selected.invocation.project.id, questionMode: tools.mode !== 'disabled' && tools.allowed.some(name => name === 'swa_ask') ? 'native' : 'disabled', delegationMode: tools.mode === 'collaboration' ? 'native' : 'disabled', provider: account.provider, modelId: account.model_target.model_id, env: process.env, protectedRoots: codexProtectedRoots(settings, selected.invocation.project.root) })
      if (!sameNativeLaunchPolicy(original.native_launch, snapshot.policy)) throw new Error('The original native account policy changed')
      return { ...selected, snapshot, kind: 'pi' as const }
    }
    if (agent === 'opencode' && ['opencode-native-api-key', 'opencode-native-stepfun-api-key'].includes(account.kind) && original.version === '2.0.31' && 'database_source' in account) {
      const settings = await readAgentSettings()
      const snapshot = await inspectNativeOpenCodePolicy({ executable: original.executable, version: original.version, sourceHome: account.source_home, projectId: selected.invocation.project.id, privateRoot: account.private_root, env: process.env, protectedRoots: codexProtectedRoots(settings, selected.invocation.project.root) })
      if (!sameNativeLaunchPolicy(original.native_launch, snapshot.policy)) throw new Error('The original native account policy changed')
      return { ...selected, snapshot, kind: 'opencode' as const }
    }
    if (agent === 'codex' && account.kind === 'codex-native-api-key' && original.version === '0.163.0') {
      const settings = await readAgentSettings()
      const snapshot = await inspectNativeCodexPolicy({ executable: original.executable, version: original.version, sourceHome: account.source_home, projectId: selected.invocation.project.id, privateRoot: account.private_root, catalogPath: account.catalog_source.path, env: process.env, protectedRoots: codexProtectedRoots(settings, selected.invocation.project.root) })
      if (!sameNativeLaunchPolicy(original.native_launch, snapshot.policy)) throw new Error('The original native account policy changed')
      return { ...selected, snapshot, kind: 'codex' as const }
    }
    if (agent === 'claude' && account.kind === 'claude-native-api-key' && original.version === '2.1.284') {
      const settings = await readAgentSettings()
      const snapshot = await inspectNativeClaudePolicy({ executable: original.executable, version: original.version, sourceHome: account.source_home, projectId: selected.invocation.project.id, privateRoot: account.private_root, env: process.env, protectedRoots: codexProtectedRoots(settings, selected.invocation.project.root) })
      if (!sameNativeLaunchPolicy(original.native_launch, snapshot.policy)) throw new Error('The original native account policy changed')
      return { ...selected, snapshot, kind: 'claude' as const }
    }
    throw new Error('The selected native Agent has no reviewed disabled-tool policy')
  }
  type Selected = Awaited<ReturnType<typeof policySnapshot>>
  function assertCurrent(selected: Selected) { if (selected.kind === 'pi') assertNativePiSnapshotCurrent(selected.snapshot); else if (selected.kind === 'opencode') assertNativeOpenCodeCurrent(selected.snapshot); else if (selected.kind === 'claude') assertNativeClaudeCurrent(selected.snapshot); else assertNativeCodexCurrent(selected.snapshot) }
  async function binding(selected: Extract<Selected, { kind: 'opencode' }>, sessionId: string, initializing = false) {
    return readPrivateOpenCodeBinding(selected.snapshot, join(selected.snapshot.policy.account.private_root, sessionId), await realpath(join(process.env.SWA_INSTALL_ROOT!, 'runtime/opencode-policy')), initializing)
  }
  async function verifyAccount(selected: Selected, sessionId: string, initializing = false) {
    if (selected.kind === 'pi') await verifyPrivatePiSessionAccount(selected.snapshot, sessionId)
    else if (selected.kind === 'opencode') await binding(selected, sessionId, initializing)
    else if (selected.kind === 'claude') await verifyPrivateClaudeAccount(selected.snapshot, sessionId)
    else if (initializing) verifyUninitializedPrivateCodexAccount(selected.snapshot, sessionId)
    else await verifyPrivateCodexAccount(selected.snapshot, sessionId)
    assertCurrent(selected)
  }
  async function approved(sessionId: string, agent: string, initializing = false) {
    const first = await policySnapshot(sessionId, agent)
    const db = runtime.getOrchestrationDb(), identity = structuredWorkerIdentities.getBySessionId(sessionId), record = runtime.openedAgentSessionRecordStore()?.getRecord(sessionId)
    const run = db.getRun(first.invocation.scope.run_id)
    if (!identity?.dispatchId || !record || !run || run.coordinator_handle !== first.invocation.scope.controller) throw new Error('The native launch Run or session is unavailable')
    await admitCurrentApproval(first.invocation)
    const fresh = await policySnapshot(sessionId, agent)
    await verifyAccount(fresh, sessionId, initializing)
    return () => {
      const current = runtime.openedAgentSessionRecordStore()?.getRecord(sessionId), worker = db.getWorkerDispatch(identity.dispatchId!)
      if (!owner.ownerAlive() || !isDeepStrictEqual(structuredWorkerIdentities.getBySessionId(sessionId), identity) || !current || current.lease.runtimeFence !== record.lease.runtimeFence || !isDeepStrictEqual(current.accountHome, record.accountHome) || !isDeepStrictEqual(current.options, record.options) || db.getRun(run.id)?.consumer_generation !== run.consumer_generation || !worker || !['starting', 'ready'].includes(worker.state) || worker.runtime_epoch !== runtime.getRuntimeId()) throw new Error('The native launch identity changed during current approval')
      assertCurrent(fresh); assertDeliveryGrantCurrent(fresh.invocation)
      assertDelegationParentCurrent(runtime, fresh.invocation)
    }
  }
  // 停止只沿已经准入的原 stop receipt 收尾，不借用已撤销的新输入 Grant。
  function approvePiStop(selected: Extract<Selected, { kind: 'pi' }>, sessionId: string) {
    const cleanup = runCleanupApproval(runtime, sessionId)
    if (cleanup) { cleanup(); return cleanup }
    const db = runtime.getOrchestrationDb(), identity = structuredWorkerIdentities.getBySessionId(sessionId)
    const record = runtime.openedAgentSessionRecordStore()?.getRecord(sessionId)
    const scope = selected.invocation.scope
    const run = db.getRun(scope.run_id)
    if (!identity?.dispatchId || identity.agent !== 'pi' || !record?.lease.ownerProcess || record.lease.claimStatus !== 'live' || record.lease.unreconciled || !run || run.coordinator_handle !== scope.controller) throw new Error('The native Pi stop owner is unavailable')
    const dispatchId = identity.dispatchId
    const parents = z.array(mutationRowSchema).parse(db.db.prepare(`SELECT * FROM mutation_receipts
      WHERE caller_fingerprint=? AND method='swa.controllerDeliver' AND state='pending' AND json_valid(receipt)=1
      AND json_extract(receipt,'$.action')='worker.stop' AND json_extract(receipt,'$.project_id')=?
      AND json_extract(receipt,'$.run_id')=? AND json_extract(receipt,'$.root_task_id')=?
      AND json_extract(receipt,'$.invocation.command.dispatch_id')=? LIMIT 2`).all(db.getOrCreateLocalMutationCallerFingerprint(), selected.invocation.project.id, scope.run_id, scope.root_task_id, dispatchId))
    if (parents.length !== 1 || !parents[0]!.receipt) throw new Error('The native Pi stop has no unique pending request')
    const parent = parents[0]!, receipt = nativeObject(JSON.parse(parent.receipt!)), invocation = invocationSchema.parse(receipt.invocation)
    const childRequest = `${parent.request_id}/native`
    const children = z.array(mutationRowSchema).parse(db.db.prepare(`SELECT * FROM mutation_receipts
      WHERE request_id=? AND method='orchestration.workerStop' LIMIT 2`).all(childRequest))
    if (receipt.controller !== scope.controller || receipt.child_request !== childRequest || invocation.command.action !== 'worker.stop' || invocation.command.request_id !== parent.request_id || invocation.command.controller !== scope.controller || invocation.command.dispatch_id !== dispatchId || !isDeepStrictEqual(invocation.project, selected.invocation.project) || !isDeepStrictEqual(invocation.scope, scope) || children.length !== 1 || children[0]!.state !== 'pending') throw new Error('The native Pi stop request left its original scope')
    const child = children[0]!, resource = db.getWorkerTerminalResourceByOwner(dispatchId)
    if (!resource || resource.terminal_handle !== identity.handle || resource.process_incarnation !== identity.processIncarnation || resource.ownership_state !== 'owned' || resource.release_state === 'released') throw new Error('The native Pi stop resource is unavailable')
    const check = () => {
      const current = runtime.openedAgentSessionRecordStore()?.getRecord(sessionId), worker = db.getWorkerDispatch(dispatchId)
      const dispatch = db.getDispatchContextById(dispatchId), task = dispatch && db.getTask(dispatch.task_id)
      const currentResource = db.getWorkerTerminalResourceByOwner(dispatchId)
      if (!owner.ownerAlive() || !isDeepStrictEqual(structuredWorkerIdentities.getBySessionId(sessionId), identity) || !current || current.provider !== 'pi' || current.lease.claimStatus !== 'live' || current.lease.unreconciled || current.lease.runtimeFence !== record.lease.runtimeFence || !isDeepStrictEqual(current.lease.ownerProcess, record.lease.ownerProcess) || !isDeepStrictEqual(current.accountHome, record.accountHome) || !isDeepStrictEqual(current.options, record.options) || !worker || worker.state !== 'stopping' || worker.runtime_epoch !== runtime.getRuntimeId() || !dispatch || dispatch.run_id !== scope.run_id || dispatch.assignee_orca_session_id !== sessionId || !dispatch.capability_revoked_at || !task || !isTaskDescendant(db, scope.run_id, scope.root_task_id, task.id) || db.getRun(run.id)?.consumer_generation !== run.consumer_generation || db.getRun(run.id)?.coordinator_handle !== scope.controller || !currentResource || currentResource.id !== resource.id || currentResource.owner_dispatch_id !== dispatchId || currentResource.terminal_handle !== resource.terminal_handle || currentResource.process_incarnation !== resource.process_incarnation || currentResource.ownership_state !== 'owned' || currentResource.release_state === 'released') throw new Error('The native Pi stop identity changed')
      for (const original of [parent, child]) {
        const row = db.getMutationReceipt(original.caller_fingerprint, original.request_id)
        if (!row || row.method !== original.method || row.payload_hash !== original.payload_hash || !['pending', 'completed'].includes(row.state)) throw new Error('The original native Pi stop receipt changed')
      }
      assertNativePiSnapshotCurrent(selected.snapshot)
    }
    check()
    return check
  }
  async function jobLauncher(sessionId: string, agent: string) {
    const selected = await policySnapshot(sessionId, agent)
    await admitCurrentApproval(selected.invocation)
    const fresh = await policySnapshot(sessionId, agent)
    await verifyAccount(fresh, sessionId, fresh.kind === 'codex' || fresh.kind === 'opencode')
    const node = z.string().min(1).parse(process.env.SWA_NODE_EXECUTABLE), install = z.string().min(1).parse(process.env.SWA_INSTALL_ROOT)
    if (!isAbsolute(node) || !isAbsolute(install) || await realpath(node) !== join(await realpath(install), 'node', process.platform === 'win32' ? 'node.exe' : 'node')) throw new Error('The installed native Job Node source is unavailable')
    const entry = await realpath(join(install, 'runtime', 'native-cli-entry.cjs')), eventDirectory = await createNativeWorkerDirectory(sessionId)
    assertCurrent(fresh); assertDeliveryGrantCurrent(fresh.invocation)
    return { node, entry, eventDirectory }
  }
  function saveBinding(row: z.infer<typeof mutationRowSchema>, binding: z.infer<typeof inputBindingSchema>) {
    const db = runtime.getOrchestrationDb()
    const current = db.getMutationReceipt(row.caller_fingerprint, row.request_id)
    if (!current || current.state !== 'pending' || current.payload_hash !== row.payload_hash || current.method !== row.method || !current.receipt) throw new Error('The original native input reservation is unavailable')
    const receipt = nativeObject(JSON.parse(current.receipt))
    if (receipt.swa_input_binding !== undefined && !isDeepStrictEqual(receipt.swa_input_binding, binding)) throw new Error('The original native input operation cannot be replaced')
    db.checkpointPendingMutationReceipt({ callerFingerprint: row.caller_fingerprint, requestId: row.request_id, method: row.method, payloadHash: row.payload_hash, receipt: JSON.stringify({ ...receipt, swa_input_binding: binding }) })
  }
  function inputBinding(sessionId: string, agent: string, clientMessageId: string) {
    const db = runtime.getOrchestrationDb()
    const rows = z.array(mutationRowSchema).parse(db.db.prepare(`SELECT * FROM mutation_receipts
      WHERE caller_fingerprint=? AND method='swa.controllerDeliver' AND json_valid(receipt)=1
      AND json_extract(receipt,'$.swa_input_binding.operation_id')=? LIMIT 2`).all(db.getOrCreateLocalMutationCallerFingerprint(), clientMessageId))
    if (rows.length !== 1 || !rows[0]!.receipt) throw new Error('The native input has no unique original request')
    const parent = nativeObject(JSON.parse(rows[0]!.receipt))
    const binding = inputBindingSchema.parse(parent.swa_input_binding)
    const invocation = invocationSchema.parse(parent.invocation)
    const children = z.array(mutationRowSchema).parse(db.db.prepare('SELECT * FROM mutation_receipts WHERE request_id=? LIMIT 2').all(binding.child_request))
    const identity = structuredWorkerIdentities.getBySessionId(sessionId)
    const record = runtime.openedAgentSessionRecordStore()?.getRecord(sessionId)
    const dispatch = db.getDispatchContextById(binding.dispatch_id)
    const run = db.getRun(invocation.scope.run_id)
    if (!owner.ownerAlive() || !identity || identity.dispatchId !== binding.dispatch_id || binding.agent !== agent || binding.session_id !== sessionId || binding.operation_id !== clientMessageId || binding.parent_request !== rows[0]!.request_id || binding.child_request !== `${binding.parent_request}/native` || parent.child_request !== binding.child_request || !['worker.start', 'worker.send', 'question.resume'].includes(String(parent.action)) || invocation.command.request_id !== binding.parent_request || invocation.command.action !== parent.action || invocation.project.id !== parent.project_id || invocation.scope.run_id !== parent.run_id || invocation.scope.root_task_id !== parent.root_task_id || !isDeepStrictEqual(invocation.selection, parent.selection) || !record || record.provider !== agent || record.lease.runtimeFence !== binding.runtime_fence || !dispatch || dispatch.run_id !== invocation.scope.run_id || !run || run.consumer_generation !== binding.consumer_generation || run.coordinator_handle !== invocation.scope.controller || children.length !== 1 || children[0]!.method !== (parent.action === 'worker.start' ? 'orchestration.workerStart' : 'swa.workerSend') || !children[0]!.receipt || !isDeepStrictEqual(nativeObject(JSON.parse(children[0]!.receipt)).swa_input_binding, binding)) throw new Error('The native input original receipt or session binding changed')
    return binding
  }
  async function beforeInput(input: StructuredAgentInputAdmission) {
    const { original } = await policySnapshot(input.sessionId, input.agent)
    const db = runtime.getOrchestrationDb()
    const rows = z.array(mutationRowSchema).parse(db.db.prepare(`SELECT * FROM mutation_receipts WHERE caller_fingerprint=? AND method='swa.controllerDeliver' AND json_valid(receipt)=1 AND json_extract(receipt, '$.swa_input_binding.operation_id')=?`).all(db.getOrCreateLocalMutationCallerFingerprint(), input.clientMessageId))
    if (rows.length !== 1 || !rows[0]!.receipt) throw new Error('The original native input has no unique parent request')
    const receipt = nativeObject(JSON.parse(rows[0]!.receipt))
    const invocation = invocationSchema.parse(receipt.invocation)
    validateHandoffInput(runtime, invocation)
    const binding = inputBindingSchema.parse(receipt.swa_input_binding)
    const childRows = z.array(mutationRowSchema).parse(db.db.prepare('SELECT * FROM mutation_receipts WHERE request_id=?').all(binding.child_request))
    if (childRows.length !== 1 || !childRows[0]!.receipt || !isDeepStrictEqual(nativeObject(JSON.parse(childRows[0]!.receipt)).swa_input_binding, binding)) throw new Error('The original native child input checkpoint is unavailable')
    const identity = structuredWorkerIdentities.getBySessionId(input.sessionId)
    const record = runtime.openedAgentSessionRecordStore()?.getRecord(input.sessionId)
    const dispatch = db.getDispatchContextById(binding.dispatch_id)
    const worker = db.getWorkerDispatch(binding.dispatch_id)
    const run = db.getRun(invocation.scope.run_id)
    if (!identity || identity.dispatchId !== binding.dispatch_id || binding.agent !== input.agent || binding.session_id !== input.sessionId || binding.operation_id !== input.clientMessageId || binding.runtime_fence !== input.fence || !isDeepStrictEqual(binding.body, input.body) || !isDeepStrictEqual(invocation.selection, original) || !record || record.lease.runtimeFence !== input.fence || record.lease.unreconciled || !record.lease.ownerProcess || record.lease.claimStatus !== 'live' || !dispatch || dispatch.run_id !== invocation.scope.run_id || !worker || !['starting', 'ready'].includes(worker.state) || worker.runtime_epoch !== runtime.getRuntimeId() || !run || run.consumer_generation !== binding.consumer_generation || run.coordinator_handle !== invocation.scope.controller) throw new Error('The native input Worker, consumer or session identity changed')
    await admitCurrentApproval(invocation)
    const fresh = await policySnapshot(input.sessionId, input.agent)
    await verifyAccount(fresh, input.sessionId)
    const finalAdmission = () => {
      assertCurrent(fresh)
      const current = runtime.openedAgentSessionRecordStore()?.getRecord(input.sessionId)
      if (!owner.ownerAlive() || !isDeepStrictEqual(structuredWorkerIdentities.getBySessionId(input.sessionId), identity) || current?.lease.runtimeFence !== input.fence || current.lease.claimStatus !== 'live' || !isDeepStrictEqual(current.lease.ownerProcess, record.lease.ownerProcess) || db.getRun(run.id)?.consumer_generation !== binding.consumer_generation || !['starting', 'ready'].includes(db.getWorkerDispatch(binding.dispatch_id)?.state ?? '')) throw new Error('The native input identity changed during current approval')
      if (!isDeepStrictEqual(current.accountHome, record.accountHome) || !isDeepStrictEqual(current.options, record.options) || !isDeepStrictEqual(current.providerHandleChain, record.providerHandleChain)) throw new Error('The native input account, options or provider link changed during current approval')
      assertDeliveryGrantCurrent(invocation)
      validateHandoffInput(runtime, invocation)
    }
    finalAdmission()
    return finalAdmission
  }
  const releaseLaunchAdmission = installStructuredAgentLaunchAdmission({
    afterAttach: async input => {
      if (input.record.provider !== 'pi') return
      const identity = structuredWorkerIdentities.getBySessionId(input.record.sessionId)
      const key = `${input.record.sessionId}/${input.record.lease.runtimeFence}`
      const policy = piPolicies.get(key)
      if (!owner.ownerAlive() || !identity?.dispatchId || identity.agent !== 'pi' || !policy) throw new Error('The original native Pi acquisition policy is unavailable')
      piPolicies.delete(key)
      await policy.adoptAcquiredRecord(input)
    },
    beforeWorkerStart,
    workerCommandSettings,
    workerPreambleMode: async input => {
      const { original } = await originalSelection(input.sessionId, input.agent)
      const identity = structuredWorkerIdentities.getBySessionId(input.sessionId)
      const record = runtime.openedAgentSessionRecordStore()?.getRecord(input.sessionId)
      const worker = runtime.getOrchestrationDb().getWorkerDispatch(input.dispatchId)
      if (!owner.ownerAlive() || identity?.dispatchId !== input.dispatchId || identity.agent !== input.agent || !record?.lease.ownerProcess || record.lease.claimStatus !== 'live' || record.lease.unreconciled || !worker || !['starting', 'ready'].includes(worker.state) || worker.runtime_epoch !== runtime.getRuntimeId()) throw new Error('The native Worker preamble has no current launch identity')
      if (!['disabled', 'questions-only', 'collaboration'].includes(original.native_launch.tools.mode)) throw new Error('The native Worker preamble tool mode is unavailable')
      return original.native_launch.tools.mode
    },
    createCommandSettings: async (sessionId, agent) => {
      const { original } = await originalSelection(sessionId, agent, false)
      return { agentCmdOverrides: { [agent]: `"${original.executable}"` } }
    },
    commandSettings: async (sessionId, agent) => {
      const { original } = await originalSelection(sessionId, agent)
      return { agentCmdOverrides: { [agent]: `"${original.executable}"` } }
    },
    validate: async (sessionId, agent, command) => {
      const { original } = await originalSelection(sessionId, agent)
      const actual = await realpath(command)
      const same = process.platform === 'win32' ? actual.toLowerCase() === original.executable.toLowerCase() : actual === original.executable
      if (!same) throw new Error('The native adapter resolved a different executable from the approved Agent selection')
    },
    accountHome: async (sessionId, agent) => {
      const { invocation } = await policySnapshot(sessionId, agent, false)
      await admitCurrentApproval(invocation)
      const selected = await policySnapshot(sessionId, agent, false)
      assertDeliveryGrantCurrent(invocation)
      if (selected.kind === 'opencode') {
        const plugin = await realpath(join(process.env.SWA_INSTALL_ROOT!, 'runtime/opencode-policy'))
        const root = await materializePrivateOpenCodeAccount(selected.snapshot, sessionId, plugin, randomBytes(32).toString('hex'), !!runtime.openedAgentSessionRecordStore()?.getRecord(sessionId))
        assertCurrent(selected); assertDeliveryGrantCurrent(invocation)
        return { kind: 'opencode', locator: { kind: 'private', root } }
      }
      if (selected.kind === 'codex') {
        const existing = runtime.openedAgentSessionRecordStore()?.getRecord(sessionId)
        const path = existing ? join(selected.snapshot.policy.account.private_root, sessionId) : await materializePrivateCodexAccount(selected.snapshot, sessionId)
        assertCurrent(selected); assertDeliveryGrantCurrent(invocation)
        return { variable: 'CODEX_HOME', path }
      }
      if (selected.kind === 'claude') {
        const existing = runtime.openedAgentSessionRecordStore()?.getRecord(sessionId)
        const path = join(selected.snapshot.policy.account.private_root, sessionId, 'config')
        if (existing) await verifyPrivateClaudeAccount(selected.snapshot, sessionId)
        else if (await materializePrivateClaudeAccount(selected.snapshot, sessionId) !== path) throw new Error('The private native Claude account path changed')
        assertCurrent(selected); assertDeliveryGrantCurrent(invocation)
        return { variable: 'CLAUDE_CONFIG_DIR', path }
      }
      const existing = runtime.openedAgentSessionRecordStore()?.getRecord(sessionId)
      const path = join(selected.snapshot.policy.account.private_root, sessionId)
      if (existing) await verifyPrivatePiSessionAccount(selected.snapshot, sessionId)
      else if (await materializePrivatePiSessionAccount(selected.snapshot, sessionId) !== path) throw new Error('The private native Pi account path changed')
      assertCurrent(selected)
      assertDeliveryGrantCurrent(invocation)
      return { variable: 'PI_CODING_AGENT_DIR', path }
    },
    environment: async (sessionId, agent, inherited) => {
      const { invocation } = await policySnapshot(sessionId, agent)
      await admitCurrentApproval(invocation)
      const selected = await policySnapshot(sessionId, agent)
      await verifyAccount(selected, sessionId, selected.kind === 'codex' || selected.kind === 'opencode')
      assertDeliveryGrantCurrent(invocation)
      if (selected.kind === 'pi') {
        const environment = privatePiEnvironment(join(selected.snapshot.policy.account.private_root, sessionId), inherited)
        if (selected.snapshot.policy.tools.mode !== 'disabled') {
          const stamp = getRuntimeSourceStamp(runtime, getAppEnvironment().getPath('userData'))
          if (!stamp?.profilePath) throw new Error('The native question runtime source is unavailable')
          stampRuntimeSourceEnv(environment, stamp)
        }
        return environment
      }
      return selected.kind === 'opencode' ? privateOpenCodeEnvironment((await binding(selected, sessionId, true)).root, inherited) : selected.kind === 'claude' ? privateClaudeEnvironment(selected.snapshot, sessionId) : privateCodexEnvironment(selected.snapshot, sessionId)
    },
    disabledPiTools: async (sessionId, agent, cwd, environment) => {
      const final = await approved(sessionId, agent)
      const selected = await policySnapshot(sessionId, agent)
      if (selected.kind !== 'pi') throw new Error('The Pi tools policy cannot admit OpenCode')
      await verifyAccount(selected, sessionId)
      const launcher = await jobLauncher(sessionId, agent)
      const record = runtime.openedAgentSessionRecordStore()?.getRecord(sessionId)
      if (!record) throw new Error('The native Pi session record is unavailable')
      const sessionPolicy = await createPiSessionPolicy({ snapshot: selected.snapshot, sessionId, fence: record.lease.runtimeFence, runtimeEpoch: runtime.getRuntimeId(), launcher, cwd, expectedEnvironment: environment, record: () => runtime.openedAgentSessionRecordStore()?.getRecord(sessionId) ?? undefined, approveInitialization: () => approved(sessionId, agent), approveStop: () => approvePiStop(selected, sessionId), inputBinding: clientMessageId => inputBinding(sessionId, agent, clientMessageId) })
      final()
      const policyKey = `${sessionId}/${record.lease.runtimeFence}`
      if (piPolicies.has(policyKey)) throw new Error('The native Pi acquisition policy is already registered')
      piPolicies.set(policyKey, sessionPolicy)
      const account = selected.snapshot.policy.account
      if (!selected.snapshot.sources.interpreter) throw new Error('The approved native Pi interpreter is unavailable')
      return { nativeContract: 'pi-cli-1.0.1', provider: account.provider, modelId: account.model_target.model_id, api: account.model_target.api, baseUrl: account.model_target.base_url, sessionPolicy, ...(selected.snapshot.policy.tools.mode !== 'disabled' ? { questionExtension: selected.snapshot.policy.tools.extension.path, allowedTools: selected.snapshot.policy.tools.allowed } : {}) }
    },
    disabledOpenCodeTools: async (sessionId, agent) => {
      const final = await approved(sessionId, agent, true)
      const selected = await policySnapshot(sessionId, agent)
      if (selected.kind !== 'opencode') throw new Error('The OpenCode tools policy cannot admit Pi')
      const privateAccount = await binding(selected, sessionId, true), launcher = await jobLauncher(sessionId, agent)
      final()
      const record = runtime.openedAgentSessionRecordStore()?.getRecord(sessionId)
      if (!record) throw new Error('The native OpenCode session record is unavailable')
      return createOpenCodeSessionPolicy({ snapshot: selected.snapshot, ...privateAccount, executable: selected.original.executable, launcher, sessionId, fence: record.lease.runtimeFence, runtimeEpoch: runtime.getRuntimeId(), record: () => runtime.openedAgentSessionRecordStore()?.getRecord(sessionId) ?? undefined, approve: () => approved(sessionId, agent), approveInitialization: () => approved(sessionId, agent, true), inputBinding: clientMessageId => inputBinding(sessionId, agent, clientMessageId) })
    },
    disabledCodexTools: async (sessionId, agent) => {
      const final = await approved(sessionId, agent, true)
      const selected = await policySnapshot(sessionId, agent)
      if (selected.kind !== 'codex') throw new Error('The Codex tools policy cannot admit another Agent')
      const launcher = await jobLauncher(sessionId, agent)
      final()
      const record = runtime.openedAgentSessionRecordStore()?.getRecord(sessionId)
      if (!record) throw new Error('The native Codex session record is unavailable')
      return createCodexSessionPolicy({ snapshot: selected.snapshot, launcher, sessionId, fence: record.lease.runtimeFence, runtimeEpoch: runtime.getRuntimeId(), record: () => runtime.openedAgentSessionRecordStore()?.getRecord(sessionId) ?? undefined, approveInitialization: () => approved(sessionId, agent, true) })
    },
    disabledClaudeTools: async (sessionId, agent) => {
      const final = await approved(sessionId, agent)
      const selected = await policySnapshot(sessionId, agent)
      if (selected.kind !== 'claude') throw new Error('The Claude tools policy cannot admit another Agent')
      const launcher = await jobLauncher(sessionId, agent)
      final()
      const record = runtime.openedAgentSessionRecordStore()?.getRecord(sessionId)
      if (!record) throw new Error('The native Claude session record is unavailable')
      return createClaudeSessionPolicy({ snapshot: selected.snapshot, launcher, sessionId, fence: record.lease.runtimeFence, runtimeEpoch: runtime.getRuntimeId(), record: () => runtime.openedAgentSessionRecordStore()?.getRecord(sessionId) ?? undefined, approve: () => approved(sessionId, agent) })
    },
    providerJobLauncher: jobLauncher,
    reserveInput: async input => {
      const { invocation, parentRow, childRow } = await policySnapshot(input.sessionId, input.agent)
      await admitCurrentApproval(invocation)
      const selected = await policySnapshot(input.sessionId, input.agent)
      const record = runtime.openedAgentSessionRecordStore()?.getRecord(input.sessionId)
      await verifyAccount(selected, input.sessionId, selected.kind === 'codex' && !!record && !record.lease.ownerProcess && record.providerHandleChain.length === 0)
      assertDeliveryGrantCurrent(invocation)
      const identity = structuredWorkerIdentities.getBySessionId(input.sessionId)
      const db = runtime.getOrchestrationDb()
      const run = db.getRun(invocation.scope.run_id)
      if (!identity?.dispatchId || !run || run.coordinator_handle !== invocation.scope.controller) throw new Error('The original native input Run association is unavailable')
      const binding = inputBindingSchema.parse({ parent_request: parentRow.request_id, child_request: childRow.request_id, dispatch_id: identity.dispatchId, agent: input.agent, execution_mode: 'structured', session_id: input.sessionId, operation_id: input.clientMessageId, runtime_fence: input.fence, consumer_generation: run.consumer_generation, body: input.body })
      db.db.exec('BEGIN IMMEDIATE')
      try { saveBinding(parentRow, binding); saveBinding(childRow, binding); db.db.exec('COMMIT') }
      catch (error) { db.db.exec('ROLLBACK'); throw error }
    },
    beforeInput
  })
  return () => { releaseLaunchAdmission(); releaseInputApproval(); piPolicies.clear() }
}
