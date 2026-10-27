import { isAbsolute } from 'node:path'
import type { Readable, Writable } from 'node:stream'
import { AcpRpcError } from './source/third_party/orca-v1.4.230/src/main/acp/acp-errors'
import { AcpSessionRuntime, type AcpSessionRuntimeOptions } from './source/third_party/orca-v1.4.230/src/main/acp/acp-session-runtime'

// 这些原函数必须在同一 bundle 内共享初始化状态。
export { inspectNativeOpenCodePolicy, assertNativeOpenCodeCurrent, openCodeTargets, openCodePlugins, openCodePolicyPluginId, readOpenCodeCredential } from './source/runtime/swa-orca/src/native-opencode-policy'
export { materializePrivateOpenCodeAccount, privateOpenCodeEnvironment, verifyPrivateOpenCodeAccount } from './source/runtime/swa-orca/src/private-opencode-account'
export { importPrivateOpenCodeCredential } from './source/runtime/swa-orca/src/native-opencode-import'
export { spawnManagedProviderProcess } from './source/third_party/orca-v1.4.230/src/main/provider-process/managed-provider-process'
export { SwaProviderProcessTree } from './source/third_party/orca-v1.4.230/src/main/provider-process/swa-provider-process-tree'

type InitializationCallbacks = {
  onRecord: NonNullable<AcpSessionRuntimeOptions['onRecord']>
  onProtocolFailure: () => void
  onInputEnd: () => void
  onClose: () => void
  onDiagnostic: () => void
}

class InitializationRuntime extends AcpSessionRuntime {
  beginClose(): void { this.drainNotifications() }
}

export function createOpenCodeInitializationClient(input: Readable, output: Writable, callbacks: InitializationCallbacks) {
  const runtime = new InitializationRuntime(input, output, {
    strictFrames: true,
    onRecord: callbacks.onRecord,
    onProtocolFailure: callbacks.onProtocolFailure,
    onInputEnd: callbacks.onInputEnd,
    onClose: () => callbacks.onClose(),
    onDiagnostic: () => callbacks.onDiagnostic(),
    onPermission: () => ({ outcome: { outcome: 'cancelled' } }),
    onRequest: () => { throw new AcpRpcError(-32601, 'opencode_initialization_request_rejected') }
  })
  let invoked = false
  let closing = false
  return Object.freeze({
    async initializeAndStart(cwd: string) {
      if (invoked || closing || typeof cwd !== 'string' || !isAbsolute(cwd)) throw new Error('opencode_initialization_client_unavailable')
      invoked = true
      const initialized = await runtime.initialize()
      const started = await runtime.start({ cwd, mcpServers: [] })
      const mode = await runtime.setMode('build')
      const model = await runtime.setConfigOption('model', 'stepfun/step-3.5-flash')
      return { initialized, started, mode, model }
    },
    beginClose() { closing = true; runtime.beginClose() },
    close() { closing = true; runtime.close() }
  })
}
