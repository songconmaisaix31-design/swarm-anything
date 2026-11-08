import { realpathSync } from 'node:fs'

export const nonWindowsNativeExternals = process.platform === 'win32' ? [] : ['@orca/windows-security', '@orca/windows-registry']

// Windows 测试产物从锁定 runtime 的真实入口加载自身二进制；其他平台保留原打包方式。
export function nativeTestExternals(requireRuntime) {
  return {
    name: 'locked-native-test-externals',
    setup(builder) {
      if (process.platform !== 'win32') return
      builder.onResolve({ filter: /^@orca\/windows-(security|registry)$/ }, args => ({
        path: realpathSync(requireRuntime.resolve(args.path)),
        external: true
      }))
    }
  }
}
