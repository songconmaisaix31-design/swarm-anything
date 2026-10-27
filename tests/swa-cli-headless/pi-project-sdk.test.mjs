import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))

test('official Pi 1.0.1 SDK preserves actual project-shell exit results', { timeout: 30_000 }, async t => {
  assert.equal(process.platform, 'linux', 'This actual SDK probe requires Linux bubblewrap')
  const configuredPackage = process.env.SWA_PI_SOURCE_PACKAGE_PATH
  assert.ok(configuredPackage && isAbsolute(configuredPackage), 'Set SWA_PI_SOURCE_PACKAGE_PATH to the installed official Pi package root')
  const sdkRoot = await realpath(configuredPackage)
  const manifest = JSON.parse(await readFile(join(sdkRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.name, '@earendil-works/pi-coding-agent')
  assert.equal(manifest.version, '1.0.1')
  assert.equal(manifest.type, 'module')
  const entry = join(sdkRoot, 'dist/core/tools/bash.js')
  assert.equal(await realpath(entry), entry)

  await mkdir(join(root, '.verification/pi-project-sdk'), { recursive: true })
  const directory = await mkdtemp(join(root, '.verification/pi-project-sdk/case-'))
  const project = join(directory, 'project'), privateTemporary = join(directory, 'sdk-temp'), bundle = join(directory, 'probe.cjs')
  await mkdir(project)
  await mkdir(privateTemporary)
  const { buildSync } = requireRuntime('esbuild')
  const built = buildSync({
    stdin: { contents: "export { runProjectShell } from './runtime/swa-orca/src/project-shell'; export { strictPiBashResultSchema } from './third_party/orca-v1.4.230/src/main/pi/rpc-protocol'", resolveDir: root },
    platform: 'node', format: 'cjs', bundle: true, write: false,
    alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') },
    nodePaths: [join(root, 'runtime/swa-orca/node_modules')]
  })
  await writeFile(bundle, built.outputFiles[0].contents)
  const { runProjectShell, strictPiBashResultSchema } = createRequire(bundle)(bundle)
  const policy = { schema: 'swa.project-shell.v1', project_root: project, writable_roots: [project], protected_roots: [sdkRoot, bundle, privateTemporary], toolchain_roots: [] }
  const previousTemporary = process.env.TMPDIR
  process.env.TMPDIR = privateTemporary
  try {
    // 直接调用真实 SDK 工具定义；不创建 Agent 会话、模型响应或原生日志。
    const { createBashToolDefinition } = await import(pathToFileURL(entry).href)
    assert.equal(typeof createBashToolDefinition, 'function')
    for (const exitCode of [0, 7]) {
      await t.test(`actual shell exit ${exitCode}`, { timeout: 12_000 }, async () => {
        const command = `printf 'pi-sdk-exit-${exitCode}\\n'; exit ${exitCode}`
        const expectedOutput = `pi-sdk-exit-${exitCode}\n`
        const observed = []
        const definition = createBashToolDefinition(project, {
          exposeSessionEnvironment: false,
          operations: {
            async exec(actualCommand, cwd, options) {
              assert.equal(actualCommand, command)
              assert.equal(cwd, project)
              const result = await runProjectShell(policy, { command: actualCommand, cwd }, {
                signal: options.signal, timeoutMs: options.timeout * 1000, onData: options.onData
              })
              observed.push(result)
              return result
            }
          }
        })
        const controller = new AbortController()
        let result
        try { result = await definition.execute(`sdk-exit-${exitCode}`, { command, timeout: 5 }, controller.signal) }
        finally { controller.abort() }
        await writeFile(join(directory, `exit-${exitCode}-sdk-result.json`), JSON.stringify(result, null, 2) + '\n')
        assert.deepEqual(observed, [{ exitCode, signal: null }])
        const parsed = strictPiBashResultSchema.parse(result)
        assert.equal(Object.hasOwn(result, 'programmaticResult'), false)
        assert.equal(parsed.structuredContent?.exit_code, exitCode)
        assert.equal(parsed.structuredContent.output, expectedOutput)
        assert.equal(parsed.structuredContent.truncated, false)
        assert.equal(parsed.structuredContent.full_output_path, undefined)
        assert.ok(Number.isFinite(parsed.structuredContent.wall_time_seconds) && parsed.structuredContent.wall_time_seconds >= 0)
        assert.equal(parsed.isError === true, exitCode !== 0)
        assert.deepEqual(parsed.content, [{ type: 'text', text: exitCode === 0 ? expectedOutput : `${expectedOutput}\n\nCommand exited with code ${exitCode}` }])
      })
    }
    t.diagnostic(`Actual SDK source: ${entry}; public result records: ${directory}`)
  } finally {
    if (previousTemporary === undefined) delete process.env.TMPDIR
    else process.env.TMPDIR = previousTemporary
  }
})
