import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const packageRoot = await realpath(join(root, 'runtime/swa-orca/node_modules/@earendil-works/pi-coding-agent'))
const pkg = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
assert.equal(pkg.version, '1.0.1')

if (process.argv[2] === '--official-catalog') {
  const { ModelRuntime } = await import(pathToFileURL(join(packageRoot, 'dist/core/model-runtime.js')).href)
  const { parseArgs } = await import(pathToFileURL(join(packageRoot, 'dist/cli/args.js')).href)
  const { resolveCliModel } = await import(pathToFileURL(join(packageRoot, 'dist/core/model-resolver.js')).href)
  const runtime = await ModelRuntime.create({ authPath: join(process.env.PI_CODING_AGENT_DIR, 'auth.json'), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false })
  const models = [...runtime.getModels()]
  assert.ok(models.length > 0)
  const sample = models.find(model => model.provider === 'stepfun' && model.id === 'step-3.5-flash') ?? models[0]
  const selector = `${sample.provider}/${sample.id}`
  for (const form of [['--model', selector], ['--provider', sample.provider, '--model', sample.id]]) {
    const args = parseArgs(form)
    assert.deepEqual(args.diagnostics, [])
    const actual = resolveCliModel({ cliProvider: args.provider, cliModel: args.model, modelRuntime: runtime })
    assert.equal(actual.error, undefined)
    assert.equal(actual.model?.provider, sample.provider)
    assert.equal(actual.model?.id, sample.id)
  }
  process.stdout.write(JSON.stringify({ version: pkg.version, count: models.length, selected: { provider: sample.provider, id: sample.id }, stepfun: models.filter(model => model.provider === 'stepfun').map(model => model.id) }) + '\n')
} else {
  const outputRoot = join(root, '.verification/pi-worker-model-launch-20261023')
  await mkdir(outputRoot, { recursive: true })
  const directory = await mkdtemp(join(outputRoot, 'rules-'))
  const home = join(directory, 'home'), account = join(directory, 'account'), cwd = join(directory, 'cwd')
  for (const path of [home, account, cwd]) await mkdir(path, { mode: 0o700 })
  const result = spawnSync(process.execPath, [process.argv[1], '--official-catalog'], {
    cwd, env: { HOME: home, USERPROFILE: home, PI_CODING_AGENT_DIR: account, PI_OFFLINE: '1', NODE_DISABLE_COMPILE_CACHE: '1', PATH: dirname(process.execPath), NO_COLOR: '1', TERM: 'dumb' },
    encoding: 'utf8', timeout: 25_000, maxBuffer: 1024 * 1024
  })
  await writeFile(join(directory, 'official-catalog.stdout'), result.stdout ?? '', { flag: 'wx', mode: 0o600 })
  await writeFile(join(directory, 'official-catalog.stderr'), result.stderr ?? '', { flag: 'wx', mode: 0o600 })
  await writeFile(join(directory, 'official-catalog.exit.json'), JSON.stringify({ status: result.status, signal: result.signal, error: result.error?.message ?? null }) + '\n', { flag: 'wx', mode: 0o600 })
  assert.equal(result.status, 0, 'Official offline model directory failed')
  const metadata = JSON.parse(result.stdout), selector = `${metadata.selected.provider}/${metadata.selected.id}`
  const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
  const { build, stop } = requireRuntime('esbuild')
  const bundle = join(directory, 'production-rules.cjs')
  try {
    await build({
      stdin: { contents: [
        "export { checkAgentLaunchModelPreferences } from './third_party/orca-v1.4.230/src/shared/agent-launch-model-preferences';",
        "export { resolveWorkerLaunchPreferences } from './third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/worker/worker-launch-preferences';",
        "export { getAgentSessionOptionCatalog } from './third_party/orca-v1.4.230/src/shared/agent-session-option-catalog';",
        "export { getAgentSessionOptionLaunchCatalog, resolveAgentSessionOptionLaunch } from './third_party/orca-v1.4.230/src/shared/agent-session-option-launch';",
        "export { narrowStructuredLaunchSeedOptions } from './third_party/orca-v1.4.230/src/shared/native-chat-session-option-defaults';",
        "export { resolveAgentLaunchCommand } from './third_party/orca-v1.4.230/src/shared/tui-agent-launch-command';",
        "export { tokenizeStartupCommand, quoteStartupArg } from './third_party/orca-v1.4.230/src/shared/tui-agent-startup-shell';"
      ].join('\n'), resolveDir: root },
      bundle: true, platform: 'node', target: 'node24', format: 'cjs', outfile: bundle,
      nodePaths: [join(root, 'runtime/swa-orca/node_modules')], logLevel: 'error'
    })
  } finally { stop() }
  const rules = createRequire(import.meta.url)(bundle)
  const { parseArgs } = await import(pathToFileURL(join(packageRoot, 'dist/cli/args.js')).href)

  await test('Pi retains the explicit model through native Worker launch and structured seed', () => {
    for (const model of new Set([selector, 'stepfun/step-3.5-flash'])) {
      assert.deepEqual(rules.checkAgentLaunchModelPreferences({ agent: 'pi', model, createsWorktree: false }), { preferences: { model } })
      const launch = rules.resolveWorkerLaunchPreferences({ agent: 'pi', model, createsWorktree: false })
      assert.deepEqual(launch.receipt, { requested: { agent: 'pi', model, effort: null }, effective: { agent: 'pi', model, effort: null } })
      assert.deepEqual(rules.narrowStructuredLaunchSeedOptions(launch.preferences), { model })
      const args = rules.resolveAgentSessionOptionLaunch('pi', launch.preferences, [], false)
      assert.deepEqual(args, { args: ['--model', model], appliedValues: { model } })
      assert.equal(parseArgs(args.args).model, model)
    }
  })

  await test('Pi launch mapping leaves ordinary session options and effort unsupported', () => {
    assert.equal(rules.getAgentSessionOptionCatalog('pi'), null)
    const catalog = rules.getAgentSessionOptionLaunchCatalog('pi')
    assert.deepEqual(catalog.models, [])
    assert.equal(catalog.listModels, undefined)
    assert.equal(catalog.modelApply.midSession, undefined)
    assert.equal(rules.checkAgentLaunchModelPreferences({ agent: 'pi', model: selector, effort: 'high' }).refusal?.code, 'invalid_argument')
    assert.equal(parseArgs(['-m', selector]).diagnostics[0]?.type, 'error')
  })

  await test('Original command consumer preserves Pi required values and replaces provider/model before the terminator', () => {
    const priorArgs = ['--system-prompt', '--model', '--append-system-prompt', '--provider', '--name', '--', '--provider', metadata.selected.provider, '--model', metadata.selected.id, '--', '--model', '公开正文']
    for (const shell of ['posix', 'powershell', 'cmd']) {
      const launch = rules.resolveAgentLaunchCommand({ agent: 'pi', platform: shell === 'posix' ? 'linux' : 'win32', shell,
        cmdOverrides: { pi: rules.quoteStartupArg(join(packageRoot, pkg.bin.pi), shell) },
        agentArgs: priorArgs.map(value => rules.quoteStartupArg(value, shell)).join(' '),
        sessionOptions: { model: selector }, sessionOptionsOverrideAgentArgs: true })
      assert.equal(launch.ok, true)
      assert.deepEqual(launch.appliedSessionOptions, { model: selector })
      const tokens = rules.tokenizeStartupCommand(launch.command, shell)
      assert.equal(tokens.ok, true)
      const actual = parseArgs(tokens.tokens.slice(1))
      assert.deepEqual(actual.diagnostics, [])
      assert.equal(actual.model, selector)
      assert.equal(actual.provider, undefined)
      assert.equal(actual.systemPrompt, '--model')
      assert.deepEqual(actual.appendSystemPrompt, ['--provider'])
      assert.equal(actual.name, '--')
      assert.deepEqual(actual.messages, ['--model', '公开正文'])
    }
  })

  await test('Existing Codex and OpenCode model launch contracts remain applicable', () => {
    const model = rules.getAgentSessionOptionCatalog('codex').models[0].id
    assert.deepEqual(rules.checkAgentLaunchModelPreferences({ agent: 'codex', model }), { preferences: { model } })
    assert.equal(rules.checkAgentLaunchModelPreferences({ agent: 'opencode', model: selector }).refusal?.code, 'capability_unsupported')
    assert.deepEqual(rules.checkAgentLaunchModelPreferences({ agent: 'opencode', model: selector, openCodeModelLaunchSupported: true }), { preferences: { model: selector } })
    assert.deepEqual(rules.getAgentSessionOptionCatalog('claude').modelApply.removeAgentArgs(['--model', '--yolo']), ['--yolo'])
  })

  await test('Pi target model and provider options consume their required dash-leading values', () => {
    for (const target of ['--provider', '--model']) {
      const priorArgs = [target, '--', '--system-prompt', '原正文']
      const prior = parseArgs(priorArgs)
      assert.equal(prior.systemPrompt, '原正文')
      const launch = rules.resolveAgentLaunchCommand({ agent: 'pi', platform: 'linux', shell: 'posix',
        cmdOverrides: { pi: rules.quoteStartupArg(join(packageRoot, pkg.bin.pi), 'posix') },
        agentArgs: priorArgs.map(value => rules.quoteStartupArg(value, 'posix')).join(' '),
        sessionOptions: { model: selector }, sessionOptionsOverrideAgentArgs: true })
      assert.equal(launch.ok, true)
      const tokens = rules.tokenizeStartupCommand(launch.command, 'posix')
      assert.equal(tokens.ok, true)
      const actual = parseArgs(tokens.tokens.slice(1))
      assert.deepEqual(actual.diagnostics, [])
      assert.equal(actual.model, selector)
      assert.equal(actual.provider, undefined)
      assert.equal(actual.systemPrompt, prior.systemPrompt)
      assert.deepEqual(actual.messages, [])
    }
  })
  process.stdout.write(JSON.stringify({ evidence: directory, metadata, model_execution: 'NOT_RUN', network_refresh: 'DISABLED', windows_native: 'NOT_RUN' }) + '\n')
}
