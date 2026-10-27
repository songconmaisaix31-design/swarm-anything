import { mkdirSync, realpathSync, lstatSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { format, isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { requirePosixPrivatePath } from './private-posix-security'
import { setAppEnvironment, type AppPathName } from '../../../third_party/orca-v1.4.230/src/shared/app-environment'
import { setSecretStore } from '../../../third_party/orca-v1.4.230/src/shared/secret-store'

for (const method of ['log', 'info', 'debug'] as const) console[method] = (...args: unknown[]) => { process.stderr.write(format(...args) + '\n') }
if (process.env.SWA_LIFECYCLE_STDIN !== '1') throw new Error('SWA requires its real owning lifecycle pipe')
const ownerCapability = Buffer.from(z.string().regex(/^[a-f0-9]{64}$/).parse(process.env.SWA_OWNER_CAPABILITY), 'hex')
delete process.env.SWA_OWNER_CAPABILITY
let ownerDisconnected = false
process.stdin.once('end', () => { ownerDisconnected = true })
process.stdin.resume()

const absolute = (key: string) => {
  const input = process.env[key]
  if (!input || !isAbsolute(input)) throw new Error(`SWA requires an absolute ${key}`)
  return realpathSync.native(input)
}
const data = absolute('SWA_DATA_DIR')
const install = absolute('SWA_INSTALL_ROOT')
if (process.platform !== 'win32' && process.platform !== 'linux') throw new Error('This SWA package requires Windows or Linux')
if (process.platform === 'linux') requirePosixPrivatePath(data, true)
if (absolute('ORCA_USER_DATA') !== data || absolute('ORCA_USER_DATA_PATH') !== data) throw new Error('SWA native profile root mismatch')
const privatePath = (name: string) => {
  const target = join(data, name)
  try { if (lstatSync(target).isSymbolicLink()) throw new Error('SWA private path redirected') }
  catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error }
  mkdirSync(target, { recursive: true, mode: 0o700 })
  const actual = realpathSync.native(target)
  const rel = relative(data, actual)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('SWA private path escaped')
  return actual
}
const home = privatePath('home'), temp = privatePath('temp'), logs = privatePath('logs'), downloads = privatePath('downloads')
for (const key of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) if (absolute(key) !== home) throw new Error(`SWA private ${key} mismatch`)
for (const key of ['TEMP', 'TMP']) if (absolute(key) !== temp) throw new Error(`SWA private ${key} mismatch`)
const callbacks: (() => void)[] = []
const paths: Record<AppPathName, string> = { userData: data, home, appData: home, temp, downloads, logs, exe: absolute('SWA_NODE_EXECUTABLE') }
setAppEnvironment({
  getPath: name => paths[name], getAppPath: () => join(install, 'runtime'), getVersion: () => '1.4.230-swa',
  isPackaged: () => true, getCliLauncherPath: () => absolute('SWA_EXECUTABLE'),
  onWillQuit: callback => callbacks.push(callback), exit: code => process.exit(code), getAppMetrics: () => []
})

async function main() {
  const { createOrcadSecretStore } = await import('../../../third_party/orca-v1.4.230/src/main/orcad/orcad-secret-store')
  const secret = createOrcadSecretStore()
  setSecretStore(secret)
  if (!(await secret.prepare({ keyDir: privatePath('keys'), userDataPath: data }))) throw new Error('SWA private secret protection unavailable')
  const { startOrcadWithHost, installOrcadShutdownSignals, flushOrcadProfileStoreForShutdown } = await import('../../../third_party/orca-v1.4.230/src/main/orcad/orcad-lifecycle')
  const running = await startOrcadWithHost(data, async registerCleanup => {
    const { createOrcadProfileStateStartup } = await import('../../../third_party/orca-v1.4.230/src/main/orcad/orcad-profile-state-startup')
    const { store, authority } = await createOrcadProfileStateStartup(data)
    registerCleanup(() => flushOrcadProfileStoreForShutdown(store))
    const { initializePrivatePiRoot, initializePrivatePiWorkerRoot } = await import('./private-pi-account')
    await initializePrivatePiRoot()
    await initializePrivatePiWorkerRoot()
    store.updateSettings({ agentStatusHooksEnabled: false, workspaceDir: privatePath('workspaces'), browserClientHostedRemoteEnabled: false, browserSshWorkspaceRoutingEnabled: false, experimentalNativeChat: true, nativeChatProviders: {} })
    const { initDaemonPtyProvider } = await import('../../../third_party/orca-v1.4.230/src/main/daemon/daemon-provider-init')
    const { daemonOwnsFreshPersistentPtys, disconnectDaemon, requestIdleDaemonRetirement, listLiveDaemonPtyIds, getDaemonProvider, readDaemonPidRecord } = await import('../../../third_party/orca-v1.4.230/src/main/daemon/daemon-provider-state')
    await initDaemonPtyProvider(undefined, { macosLoginSessionWatch: false, startupTimeoutMs: 30_000, automaticRespawn: false })
    let daemonOwnershipConfirmed = false
    registerCleanup(async () => {
      if (daemonOwnershipConfirmed) {
        const retirement = await requestIdleDaemonRetirement()
        if (retirement.state !== 'retiring') throw new Error(`SWA private daemon retirement unconfirmed: ${retirement.state}`)
      }
      await disconnectDaemon()
    })
    if (!daemonOwnsFreshPersistentPtys()) throw new Error('SWA requires its actual persistent daemon')
    const { getCurrentDaemonAdapter } = await import('../../../third_party/orca-v1.4.230/src/main/daemon/daemon-provider-routing')
    const { observeRuntimeSwaServiceJob } = await import('../../../third_party/orca-v1.4.230/src/main/daemon/swa-service-job')
    const provider = getDaemonProvider()
    if (!provider) throw new Error('SWA persistent daemon provider is unavailable')
    const ownership = observeRuntimeSwaServiceJob(getCurrentDaemonAdapter(provider).getDaemonIdentity(), readDaemonPidRecord())
    daemonOwnershipConfirmed = true
    const { getLocalPtyProvider } = await import('../../../third_party/orca-v1.4.230/src/main/ipc/pty/provider/registry')
    const { agentHookServer } = await import('../../../third_party/orca-v1.4.230/src/main/agent-hooks/server')
    await agentHookServer.start({ env: 'production', userDataPath: data, statusHooksEnabled: false })
    registerCleanup(() => agentHookServer.stop())
    const { agentHookRuntimeDeps } = await import('../../../third_party/orca-v1.4.230/src/main/agent-hooks/agent-hook-runtime-deps')
    const { AgentStatusObservedPaneIdentities, AgentStatusObservedPaneIdentityCapture } = await import('../../../third_party/orca-v1.4.230/src/main/runtime/agent-status-observed-pane-identity')
    const observed = new AgentStatusObservedPaneIdentities()
    const capture = new AgentStatusObservedPaneIdentityCapture(observed)
    registerCleanup(agentHookServer.subscribeEnrichedStatus(status => capture.observe(status)))
    const { OrcaRuntimeService } = await import('../../../third_party/orca-v1.4.230/src/main/runtime/orca-runtime')
    const { loadAgentSessionClaimSigner } = await import('../../../third_party/orca-v1.4.230/src/main/runtime/agent-session-claim-identity')
    const runtime = new OrcaRuntimeService(store, undefined, {
      agentSessionClaimSigner: loadAgentSessionClaimSigner(data, data),
      ...agentHookRuntimeDeps(agentHookServer, observed, () => store.getSettings()),
      getLocalProvider: () => getLocalPtyProvider(), canRecoverPersistentLocalPtys: () => daemonOwnsFreshPersistentPtys(),
      getDesktopWindowStatus: () => 'blocked'
    })
    const { initializeCollaborationRecords } = await import('./collaboration-records')
    initializeCollaborationRecords(runtime.getOrchestrationDb())
    const { installAgentLaunchAdmission } = await import('./agent-launch-admission')
    registerCleanup(installAgentLaunchAdmission(runtime, { ownerCapability, ownerAlive: () => !ownerDisconnected }))
    await runtime.ensureStructuredAgentSessionHost({ prewarmModelCatalog: false })
    const { registerHeadlessPtyRuntime } = await import('../../../third_party/orca-v1.4.230/src/main/ipc/pty/register-headless-runtime')
    await registerHeadlessPtyRuntime(runtime, undefined, () => store.getSettings(), undefined, store)
    await runtime.refreshRestoredOrchestrationAuthority()
    await runtime.reconcileLegacyWorkerTerminals()
    capture.attach(runtime)
    const { publishHeadlessRuntimeGraph } = await import('../../../third_party/orca-v1.4.230/src/main/runtime/headless-runtime-graph')
    publishHeadlessRuntimeGraph(runtime)
    registerCleanup(() => runtime.stopLegacyWorkerTerminalRecovery())
    registerCleanup(() => runtime.closeNotificationDismissals())
    const { disposeWatcherProcessAndWait } = await import('../../../third_party/orca-v1.4.230/src/main/ipc/parcel-watcher-process')
    registerCleanup(() => disposeWatcherProcessAndWait())
    const { RuntimeRpcShutdown } = await import('../../../third_party/orca-v1.4.230/src/main/runtime/runtime-rpc/runtime-rpc-shutdown')
    const { STATUS_METHODS } = await import('../../../third_party/orca-v1.4.230/src/main/runtime/rpc/methods/status')
    const { ORCHESTRATION_RUN_METHODS } = await import('../../../third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/runs/runs')
    const { ORCHESTRATION_WORKER_METHODS } = await import('../../../third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/worker/worker-methods')
    const { ORCHESTRATION_MUTATION_REQUEST_METHODS } = await import('../../../third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/runs/mutation-request-show')
    const { ORCHESTRATION_MESSAGE_METHODS } = await import('../../../third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/messaging/message-methods')
    const { ORCHESTRATION_CALLER_METHODS } = await import('../../../third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/caller-show')
    const { SWA_METHODS, collectRunResult, deliverRunHandoff } = await import('./native-methods')
    const { installRunSettlement } = await import('./run-settlement')
    registerCleanup(installRunSettlement(runtime, (scope, workspaceId, dispatchId) => collectRunResult(runtime, scope, workspaceId, dispatchId), invocation => deliverRunHandoff(runtime, invocation), () => !ownerDisconnected))
    const { admitControllerRPC } = await import('./controller-admission')
    const allowed = new Set(['status.get', 'orchestration.callerShow', 'orchestration.runCurrent', 'orchestration.runCreate', 'orchestration.runUse', 'orchestration.runShow', 'orchestration.taskCreate', 'orchestration.taskList', 'orchestration.taskUpdate', 'orchestration.workerStart', 'orchestration.workerShow', 'orchestration.workerList', 'orchestration.workerRead', 'orchestration.workerStop', 'orchestration.workerRelease', 'orchestration.requestShow', 'orchestration.reply', 'orchestration.ask'])
    const { questionReplyMethod } = await import('./question-answer')
    const { createDeliveryAdmission } = await import('./delivery-admission')
    const { questionAskMethod } = await import('./question-ask')
    const { delegationMethod } = await import('./delegation')
    const admitQuestion = createDeliveryAdmission(ownerCapability, () => !ownerDisconnected)
    const questionReply = questionReplyMethod(admitQuestion), questionAsk = questionAskMethod(admitQuestion)
    const nativeMethods = [...STATUS_METHODS, ...ORCHESTRATION_RUN_METHODS, ...ORCHESTRATION_WORKER_METHODS, ...ORCHESTRATION_MUTATION_REQUEST_METHODS, ...ORCHESTRATION_MESSAGE_METHODS, ...ORCHESTRATION_CALLER_METHODS, questionAsk].filter(method => allowed.has(method.name)).map(method => method.name === 'orchestration.reply' ? questionReply : method)
    const methodNames: string[] = nativeMethods.map(method => method.name)
    if (nativeMethods.length !== allowed.size || new Set(methodNames).size !== allowed.size) throw new Error('The required native product RPC methods are incomplete: ' + JSON.stringify({ registered: methodNames, missing: [...allowed].filter(name => !methodNames.includes(name)), duplicated: methodNames.filter((name, index) => methodNames.indexOf(name) !== index) }))
    const rpc = new RuntimeRpcShutdown({ runtime, userDataPath: data, enableWebSocket: false, methods: [...nativeMethods, ...SWA_METHODS, delegationMethod(admitQuestion)], executionAdmission: (request, params, context) => admitControllerRPC(request, params, context, ownerCapability, admitQuestion) })
    registerCleanup(async () => {
      if (rpc.readClientActivity().requestsInFlight !== 0) throw new Error('SWA native requests remain in flight')
      const db = runtime.getOrchestrationDb()
      const count = z.object({ count: z.number().int().nonnegative() }).parse(db.db.prepare("SELECT COUNT(*) AS count FROM mutation_receipts WHERE state='pending'").get())
      if (count.count !== 0) throw new Error('SWA native mutation outcomes remain pending')
      if (db.listWorkerTerminalResources().some(row => !row.resource || row.resource.release_state !== 'released')) throw new Error('SWA native Worker resources remain unreleased')
      const { controllerOwnerSchema, observeControllerExited } = await import('./controller-scope')
      const opens = z.array(z.object({ caller_fingerprint: z.string(), receipt: z.string() })).parse(db.db.prepare("SELECT caller_fingerprint, receipt FROM mutation_receipts WHERE method IN ('swa.controllerOpen','swa.controllerRecover') AND state='completed'").all())
      for (const open of opens) {
        const owner = z.object({ controller: z.string().min(1) }).parse(JSON.parse(open.receipt))
        const closed = z.object({ count: z.number().int().nonnegative() }).parse(db.db.prepare(`SELECT COUNT(*) AS count FROM mutation_receipts
          WHERE caller_fingerprint=? AND method='swa.controllerClose' AND state='completed'
          AND json_valid(receipt)=1 AND json_extract(receipt, '$.controller')=?`).get(open.caller_fingerprint, owner.controller))
        if (closed.count === 1) continue
        const recovered = z.array(z.object({ receipt: z.string() })).parse(db.db.prepare(`SELECT receipt FROM mutation_receipts
          WHERE caller_fingerprint=? AND method='swa.controllerRecover' AND state='completed' AND json_valid(receipt)=1
          AND json_extract(receipt, '$.prior_controller')=?`).all(open.caller_fingerprint, owner.controller))
        if (closed.count !== 0 || recovered.length !== 1) throw new Error('SWA native controller close or completed recovery remains unconfirmed')
        const actual = controllerOwnerSchema.parse(JSON.parse(open.receipt))
        const prior = controllerOwnerSchema.parse(JSON.parse(recovered[0]!.receipt).prior_owner)
        if (!isDeepStrictEqual(actual, prior)) throw new Error('SWA retired controller recovery identity differs')
        await observeControllerExited(runtime, actual)
      }
      const ptys = await listLiveDaemonPtyIds()
      if (ptys === null || ptys.length !== 0) throw new Error('SWA private daemon idle inventory remains unconfirmed')
    })
    registerCleanup(() => rpc.stop())
    await rpc.start()
    return { runtimeId: runtime.getRuntimeId(), dataRoot: data, node: process.execPath, ownership }
  }, () => { for (const callback of callbacks.splice(0)) callback() }, { browserProvider: false })
  const shutdown = installOrcadShutdownSignals(async () => {
    await running.stop()
    // 只有原生空闲检查、daemon退休及全部cleanup成功后确认所属关闭。
    await new Promise<void>((resolve, reject) => {
      process.stdout.write(JSON.stringify({ type: 'swa_runtime_stopped', runtime_id: running.runtimeId, data_root: data }) + '\n', error => error ? reject(error) : resolve())
    })
  })
  process.stdin.once('end', () => shutdown('SWA owning pipe ended'))
  if (ownerDisconnected) {
    shutdown('SWA owning pipe ended during startup')
    return
  }
  process.stdout.write(JSON.stringify({ ok: true, readiness: { runtimeId: running.runtimeId, dataRoot: running.dataRoot, node: running.node }, ownership: running.ownership }) + '\n')
}
main().catch(error => { process.stderr.write(JSON.stringify({ code: 'swa_runtime_start_failed', message: error instanceof Error ? error.message : 'SWA startup failed', stack: error instanceof Error ? error.stack : undefined }) + '\n'); process.exitCode = 1 })
