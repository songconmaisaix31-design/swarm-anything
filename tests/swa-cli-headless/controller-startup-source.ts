import { join } from 'node:path'
import { setAppEnvironment } from '../../third_party/orca-v1.4.230/src/shared/app-environment'

// 验证入口只注入真实独占目录；所有终端、PTY、参数和 helper 均来自生产模块。
export async function loadProduction(directory: string, executable: string) {
  setAppEnvironment({
    getPath: name => name === 'exe' ? process.execPath : name === 'home' ? join(directory, 'home') : directory,
    getAppPath: () => directory, getVersion: () => 'controller-startup-local-verification', isPackaged: () => false,
    getCliLauncherPath: () => executable, onWillQuit: () => {}, exit: code => process.exit(code), getAppMetrics: () => []
  })
  const [controller, support, host, subprocess, shell, identity, handle, windows, contracts, framing, windowsProcesses, writer] = await Promise.all([
    import('../../runtime/swa-orca/src/native-methods'),
    import('../../third_party/orca-v1.4.230/src/main/runtime/terminal-shell-override-host-support'),
    import('../../third_party/orca-v1.4.230/src/main/daemon/terminal-host'),
    import('../../third_party/orca-v1.4.230/src/main/daemon/pty-subprocess'),
    import('../../third_party/orca-v1.4.230/src/main/daemon/shell-ready'),
    import('../../third_party/orca-v1.4.230/src/main/daemon/swa-linux-process-identity'),
    import('../../third_party/orca-v1.4.230/src/main/runtime/remote-runtime-terminal-create-identity'),
    import('../../third_party/orca-v1.4.230/src/main/providers/windows-shell-args'),
    import('../../runtime/swa-orca/src/contracts'),
    import('../../third_party/orca-v1.4.230/src/shared/main-process-ndjson-framer'),
    import('../../third_party/orca-v1.4.230/src/main/windows/windows-process-table'),
    import('../../third_party/orca-v1.4.230/src/main/runtime/runtime-terminal-writer')
  ])
  return { ...controller, ...support, ...host, ...subprocess, ...shell, ...identity, ...handle, ...windows, ...framing, RuntimeTerminalWriter: writer.RuntimeTerminalWriter, readWindowsProcessTableFresh: windowsProcesses.readWindowsProcessTableFresh, helperInput: contracts.helperInput, helperReply: contracts.helperReply }
}
