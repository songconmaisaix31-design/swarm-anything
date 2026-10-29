import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url)), requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/morph-config'), { recursive: true })
const directory = await mkdtemp(join(root, '.verification/morph-config/case-')), output = join(directory, 'contract.cjs')
await symlink(await realpath(join(root, 'runtime/swa-orca/node_modules')), join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
buildSync({ stdin: { contents: "export * from './runtime/swa-orca/src/morph-config'; export { nativePiToolsSchema, nativeToolModes, commandSchema } from './runtime/swa-orca/src/contracts'", resolveDir: root },
  outfile: output, platform: 'node', format: 'cjs', bundle: true, target: 'node24', tsconfig: join(root, 'runtime/swa-orca/tsconfig.json'),
  nodePaths: [join(root, 'runtime/swa-orca/node_modules')], conditions: ['orca-source'],
  alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') },
  external: ['electron', 'node-pty', '*.node', '@orca/windows-security', '@orca/windows-registry', '@vscode/windows-process-tree'] })
const { readMorphDescriptor, inspectMorphConfig, morphBackendEnvironment, morphEnvironment, nativePiToolsSchema, nativeToolModes, commandSchema } = createRequire(output)(output)

async function fixture(extra = {}) {
  const path = await mkdtemp(join(directory, 'host-')), workspace = join(path, 'science'), cwd = join(path, 'source'), config = join(path, 'host.json'), descriptor = join(path, 'bridge.json')
  await mkdir(workspace); await mkdir(cwd)
  const host = { workspace, worker_id: 'researcher-a', experiment_backend: {}, generated_experiments: {}, ...extra }
  await writeFile(config, JSON.stringify(host))
  await writeFile(descriptor, JSON.stringify({ python: process.execPath, cwd, host_config: config }))
  return { path, workspace, cwd, config, descriptor, host }
}

test('descriptor and host config are pinned outside both writable workspaces', async () => {
  const f = await fixture(), selected = inspectMorphConfig(f.descriptor, f.workspace)
  assert.equal(selected.descriptor.cwd, f.cwd)
  assert.deepEqual(readMorphDescriptor(f.descriptor, { configVersion: selected.source.version, hostConfigVersion: selected.hostSource.version }), selected)
  assert.throws(() => inspectMorphConfig(f.descriptor, f.path), /project_workspace_mismatch/)
  const another = await fixture()
  assert.throws(() => inspectMorphConfig(f.descriptor, another.workspace), /project_workspace_mismatch/)
  await writeFile(f.config, JSON.stringify({ ...f.host, worker_id: 'other-worker' }))
  assert.throws(() => readMorphDescriptor(f.descriptor, { configVersion: selected.source.version, hostConfigVersion: selected.hostSource.version }), /configuration_changed/)
  await writeFile(f.config, JSON.stringify({ ...f.host, workspace: f.path }))
  assert.throws(() => readMorphDescriptor(f.descriptor), /in_writable_workspace/)
})

test('only host-selected experiment credentials enter the MCP environment', async () => {
  const empty = await fixture({ experiment_backend: { api_key_env: null }, generated_experiments: { api_key_env: null } })
  assert.deepEqual(morphBackendEnvironment(empty.descriptor, {}), {})
  const f = await fixture({ experiment_backend: { api_key_env: 'MORPH_BACKEND_KEY' } })
  const inherited = { MORPH_BACKEND_KEY: 'approved-value', SWA_PROJECT_TOKEN: 'must-not-forward', OPENAI_API_KEY: 'must-not-forward' }
  assert.deepEqual(morphBackendEnvironment(f.descriptor, inherited), { MORPH_BACKEND_KEY: 'approved-value' })
  assert.throws(() => morphBackendEnvironment(f.descriptor, {}), /credential_environment_missing/)
  await writeFile(f.config, JSON.stringify({ ...f.host, experiment_backend: { api_key_env: 'PYTHONPATH' } }))
  assert.throws(() => morphBackendEnvironment(f.descriptor, { PYTHONPATH: '/other' }), /name_invalid/)
})

test('Morph mode survives selection reconstruction and rejects other capabilities', async () => {
  const f = await fixture(), selected = inspectMorphConfig(f.descriptor, f.workspace)
  const tools = { mode: 'morph', native_contract: 'pi-cli-1.0.1', extension: { path: '/installed/runtime/pi-morph-extension.mjs', version: 'fixture' }, morph_config: selected.source, morph_host_config: selected.hostSource, allowed: ['morph_list_tools', 'morph_call_tool'] }
  assert.deepEqual(nativePiToolsSchema.parse(tools), tools)
  assert.equal(nativeToolModes(tools).morphConfig, f.descriptor)
  assert.equal(morphEnvironment(tools, {}).SWA_MORPH_HOST_CONFIG_VERSION, selected.hostSource.version)
  const command = { action: 'worker.start', agent: 'pi', morph_config: f.descriptor }
  assert.equal(commandSchema.parse(command).morph_config, f.descriptor)
  for (const change of [{ agent: 'codex' }, { question_mode: 'native' }, { delegation_mode: 'native' }, { development_mode: 'project' }, { handoff_mode: 'work' }, { role_id: 'role' }, { action: 'worker.send' }]) assert.throws(() => commandSchema.parse({ ...command, ...change }))
  assert.throws(() => nativePiToolsSchema.parse({ ...tools, allowed: [...tools.allowed, 'bash'] }))
})
