import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, realpath, rmdir, symlink, unlink, chmod } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 使用工作树真实源模块；空目录只验证元数据拒绝，不创建凭据或模型回执。
const repository = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(repository, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
const parent = join(repository, '.verification/cloud-setup/opencode-stepfun-compatibility')
await mkdir(parent, { recursive: true, mode: 0o700 })
const directory = await mkdtemp(join(parent, 'policy-check-')), output = join(directory, 'policy.cjs')
buildSync({ stdin: { contents: `export * from './native-opencode-policy'; export { requireNativePiSourceHome } from './native-pi-policy'; export { inspectNativeCodexAccountSource } from './native-codex-policy'; export { inspectNativeClaudeAccountSource } from './native-claude-policy';`, loader: 'ts', resolveDir: join(repository, 'runtime/swa-orca/src') }, outfile: output, bundle: true, platform: 'node', format: 'cjs', target: 'node24', tsconfig: join(repository, 'runtime/swa-orca/tsconfig.json'), nodePaths: [join(repository, 'runtime/swa-orca/node_modules'), join(repository, 'node_modules')], external: ['*.node'], alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') }, logLevel: 'silent' })
const { requireNativeOpenCodeSourceHome, nativeOpenCodePolicySchema, requireNativePiSourceHome, inspectNativeCodexAccountSource, inspectNativeClaudeAccountSource } = createRequire(output)(output)
const privateDirectory = async path => {
  if (process.platform === 'linux') await mkdir(path, { mode: 0o700 })
  else if (!requireRuntime('@orca/windows-security').createPrivateDirectory(path)) throw new Error('The private test directory already exists')
}

test('OpenCode 来源与 Pi/Codex/Claude 的双向保护发生于正文读取之前', async () => {
  const root = join(await realpath(directory), 'opencode-source-boundary-' + randomUUID())
  await privateDirectory(root)
  const source = join(root, 'source'), child = join(source, 'child'), sibling = join(root, 'sibling'), project = join(root, 'project')
  const paths = [source, child, sibling, project]
  for (const path of paths) await privateDirectory(path)
  const env = { SWA_OPENCODE_API_KEY_HOME: source }
  try {
    assert.equal(requireNativeOpenCodeSourceHome({ sourceHome: source, protectedRoots: [project], env }), source)
    for (const protectedRoot of [source, child, root]) assert.throws(() => requireNativeOpenCodeSourceHome({ sourceHome: source, protectedRoots: [protectedRoot], env }), /directory_overlap/)
    for (const other of [source, child, root]) {
      await assert.rejects(requireNativePiSourceHome({ sourceHome: other, protectedRoots: [project], env }), /directory_overlap/)
      await assert.rejects(inspectNativeCodexAccountSource({ sourceHome: other, protectedRoots: [project], env: { ...env, SWA_CODEX_API_KEY_HOME: other } }), /directory_overlap/)
      await assert.rejects(inspectNativeClaudeAccountSource({ sourceHome: other, protectedRoots: [project], env: { ...env, SWA_CLAUDE_API_KEY_HOME: other } }), /directory_overlap/)
    }
    assert.equal(await requireNativePiSourceHome({ sourceHome: sibling, protectedRoots: [project], env }), sibling)
    for (const [inspect, variable] of [[inspectNativeCodexAccountSource, 'SWA_CODEX_API_KEY_HOME'], [inspectNativeClaudeAccountSource, 'SWA_CLAUDE_API_KEY_HOME']]) {
      await assert.rejects(inspect({ sourceHome: sibling, protectedRoots: [project], env: { ...env, [variable]: sibling } }), error => error?.code === 'ENOENT' && error.path === join(sibling, variable === 'SWA_CODEX_API_KEY_HOME' ? 'auth.json' : 'settings.json'))
    }
    if (process.platform === 'linux') {
      await chmod(source, 0o755)
      assert.throws(() => requireNativeOpenCodeSourceHome({ sourceHome: source, protectedRoots: [project], env }))
      await chmod(source, 0o700)
      const linked = join(root, 'linked')
      await symlink(source, linked)
      try { assert.throws(() => requireNativeOpenCodeSourceHome({ sourceHome: linked, protectedRoots: [project], env: { SWA_OPENCODE_API_KEY_HOME: linked } })) }
      finally { await unlink(linked) }
    }
  } finally { for (const path of paths.reverse()) await rmdir(path); await rmdir(root) }
})

test('固定 StepFun 与旧 DeepSeek 合同不接受目标混用或 questions-only', () => {
  const source = { path: '/shape-only/reference', version: 'shape-only' }
  const common = { source_home: '/shape-only', config_source: source, auth_source: source, database_source: source, credential_id: 'shape-only', credential_updated_at: 0, private_root: '/shape-only/private' }
  const stepfun = { schema: 'swa.native-launch.v1', account: { ...common, kind: 'opencode-native-stepfun-api-key', provider: 'stepfun', model_target: { model_id: 'step-3.5-flash', api: 'openai-completions', base_url: 'https://api.stepfun.com/v1' } }, tools: { mode: 'disabled', native_contract: 'opencode-cli-2.0.31' } }
  assert.ok(nativeOpenCodePolicySchema.safeParse(stepfun).success)
  for (const account of [{ ...stepfun.account, kind: 'opencode-native-api-key' }, { ...stepfun.account, provider: 'deepseek' }, { ...stepfun.account, model_target: { ...stepfun.account.model_target, base_url: 'https://example.invalid/v1' } }]) assert.equal(nativeOpenCodePolicySchema.safeParse({ ...stepfun, account }).success, false)
  assert.equal(nativeOpenCodePolicySchema.safeParse({ ...stepfun, tools: { ...stepfun.tools, mode: 'questions-only' } }).success, false)
  const deepseek = { ...stepfun, account: { ...common, kind: 'opencode-native-api-key', provider: 'deepseek', model_target: { model_id: 'deepseek-v4-pro', api: 'opencode-native-deepseek', base_url: 'https://api.deepseek.com' } } }
  assert.ok(nativeOpenCodePolicySchema.safeParse(deepseek).success)
})
