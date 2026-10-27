import { createRequire } from 'node:module'
import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { root } from './process.mjs'
import { copyCodexCatalog } from './swa-package-config.mjs'

const runtime = join(root, 'runtime', 'swa-orca')
const requireRuntime = createRequire(join(runtime, 'package.json'))
const { build } = requireRuntime('esbuild')
const upstream = join(root, 'third_party', 'orca-v1.4.230')

function containsPath(parent, path) {
  const pathRelative = relative(parent, path)
  return pathRelative !== '..' && !pathRelative.startsWith('../') && !pathRelative.startsWith('..\\') && !isAbsolute(pathRelative)
}

async function packageSource(entry, expectedName, expectedVersion) {
  for (let directory = dirname(await realpath(entry)); ; directory = dirname(directory)) {
    if ((await readdir(directory)).includes('package.json')) {
      const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      if (pkg.name === expectedName) {
        if (pkg.version !== expectedVersion) throw new Error(`License source ${expectedName} version ${pkg.version} differs from ${expectedVersion}`)
        return directory
      }
    }
    if (dirname(directory) === directory) throw new Error(`License package source missing for ${expectedName}@${expectedVersion}`)
  }
}

async function copyInlinedLicenses(output, inputs) {
  const pkg = JSON.parse(await readFile(join(runtime, 'package.json'), 'utf8'))
  const sources = []
  for (const name of ['zod', 'yaml', 'diff', 'smol-toml', 'jsonc-parser', '@streamparser/json', 'tweetnacl', 'proper-lockfile']) {
    const version = pkg.devDependencies[name]
    if (typeof version !== 'string' || pkg.dependencies[name] !== undefined) throw new Error(`Expected build-only direct dependency ${name}`)
    sources.push({ name, version, directory: await packageSource(requireRuntime.resolve(name), name, version) })
  }
  const requireSSH = createRequire(requireRuntime.resolve('ssh2'))
  const requireBcrypt = createRequire(requireSSH.resolve('bcrypt-pbkdf'))
  sources.push({ name: 'tweetnacl', version: '0.14.5', directory: await packageSource(requireBcrypt.resolve('tweetnacl'), 'tweetnacl', '0.14.5') })
  const licenseRoot = join(dirname(output), 'third-party-licenses')
  await mkdir(licenseRoot)
  for (const { name, version, directory } of sources) {
    if (![...inputs].some(input => containsPath(directory, resolve(root, input)))) throw new Error(`Expected actual inline input for ${name}@${version}`)
    const files = (await readdir(directory)).filter(filename => /^(?:licen[cs]e|copying|notice)(?:[.-].*)?$/i.test(filename))
    if (!files.some(filename => /^(?:licen[cs]e|copying)(?:[.-].*)?$/i.test(filename))) throw new Error(`Full license missing for ${name}@${version}`)
    const target = join(licenseRoot, name.replaceAll('/', '__') + '@' + version)
    await mkdir(target)
    for (const filename of files) {
      const source = join(directory, filename)
      const stat = await lstat(source)
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`License source must be an ordinary file: ${source}`)
      const destination = join(target, filename)
      await copyFile(source, destination)
      if (!(await readFile(source)).equals(await readFile(destination))) throw new Error(`License copy changed bytes: ${source}`)
    }
    console.log(JSON.stringify({ inlined_license: name, version, files }))
  }
}

export async function buildSWARuntime(output) {
  if (!isAbsolute(output)) throw new Error('SWA build output must be absolute')
  const target = relative(join(root, 'dist'), output)
  if (target === '..' || target.startsWith('../') || target.startsWith('..\\') || isAbsolute(target)) throw new Error('SWA build output must stay inside dist')
  await mkdir(output, { recursive: true })
  const common = {
    absWorkingDir: root, bundle: true, platform: 'node', target: 'node24', format: 'cjs',
    conditions: ['orca-source'], nodePaths: [join(runtime, 'node_modules'), join(root, 'node_modules')],
    external: ['electron', 'node-pty', '@parcel/watcher', 'fsevents', '@orca/windows-security', '@orca/windows-registry', '@vscode/windows-process-tree', '@anthropic-ai/claude-agent-sdk'],
    banner: { js: 'var __swaModuleUrl = require("node:url").pathToFileURL(__filename).href;' },
    define: { 'import.meta.url': '__swaModuleUrl', 'process.env.NODE_ENV': '"production"' },
    logOverride: { 'empty-import-meta': 'error' }, metafile: true, sourcemap: false, minify: false,
    plugins: [{ name: 'swa-process-host-source', setup(builder) { builder.onResolve({ filter: /^@orca\/process-host(?:\/|$)/ }, async args => {
      const base = join(upstream, 'src', 'packages', 'process-host')
      const pkg = JSON.parse(await readFile(join(base, 'package.json'), 'utf8'))
      const key = args.path === '@orca/process-host' ? '.' : '.' + args.path.slice('@orca/process-host'.length)
      const entry = pkg.exports[key]?.['orca-source']
      if (typeof entry !== 'string') throw new Error(`Missing exact process-host source export ${key}`)
      return { path: resolve(base, entry) }
    }) } }, { name: 'swa-native-addons', setup(builder) { builder.onResolve({ filter: /\.node$/ }, args => ({ path: args.path, external: true })) } },
      { name: 'swa-jsonc-esm', setup(builder) { builder.onResolve({ filter: /^jsonc-parser$/ }, () => ({ path: join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib', 'esm', 'main.js') })) } }]
  }
  const entries = {
    'host.cjs': join(runtime, 'src', 'host-entry.ts'),
    'project-shell-entry.cjs': join(runtime, 'src', 'project-shell-entry.ts'),
    'client.cjs': join(runtime, 'src', 'client.ts'),
    'controller-helper.cjs': join(runtime, 'src', 'controller-helper.ts'),
    'native-cli-entry.cjs': join(runtime, 'src', 'native-cli-entry.ts'),
    'strict-caller-probe.cjs': join(root, 'tests', 'swa-cli-headless', 'strict-caller-probe.mjs'),
    'controller-inspection.cjs': join(root, 'tests', 'swa-cli-headless', 'controller-inspection.ts'),
    'swa-provider-process-tree.cjs': join(upstream, 'src/main/provider-process/swa-provider-process-tree.ts'),
    'managed-provider-process.cjs': join(upstream, 'src/main/provider-process/managed-provider-process.ts'),
    'agent-connection.cjs': join(upstream, 'src/main/jsonl-rpc/agent-connection.ts'),
    'pi-protocol.cjs': join(upstream, 'src/main/pi/rpc-protocol.ts'),
    'acp-agent-connection.cjs': join(upstream, 'src/main/acp/acp-agent-connection.ts'),
    'agent-settings.cjs': join(runtime, 'src', 'agent-settings.ts'),
    'agent-cli-version-probe.cjs': join(upstream, 'src', 'main/agent-cli-version-probe.ts'),
    'task-result.cjs': join(runtime, 'src', 'task-result.ts'),
    'opencode-session-result.cjs': join(runtime, 'src', 'opencode-session-result.ts'),
    'private-opencode-account.cjs': join(runtime, 'src', 'private-opencode-account.ts'),
    'native-opencode-policy.cjs': join(runtime, 'src', 'native-opencode-policy.ts'),
    'native-opencode-import.cjs': join(runtime, 'src', 'native-opencode-import.ts'),
    'journal-open.cjs': join(upstream, 'src/main/native-chat/agent-session-journal/journal-open.ts'),
    'parcel-watcher-process-entry.js': join(upstream, 'src/main/ipc/parcel-watcher-process-entry.ts'),
    'daemon-entry.js': join(upstream, 'src/main/daemon/daemon-entry.ts'),
    'profile-state-writer-worker-entry.js': join(upstream, 'src/main/persistence/profile-state/profile-state-writer-worker-entry.ts'),
    'profile-state-backup-worker-entry.js': join(upstream, 'src/main/persistence/profile-state/profile-state-backup-worker-entry.ts'),
    'foreign-sqlite-reader-entry.js': join(upstream, 'src/main/foreign-sqlite-readers/foreign-sqlite-reader-entry.ts'),
    'port-scan-command-worker-entry.js': join(upstream, 'src/main/ports/port-scan-command-worker-entry.ts'),
    'session-scanner-service-entry.js': join(upstream, 'src/main/ai-vault/session-scanner-service-entry.ts'),
    'worker-thread-child-process-entry.js': join(upstream, 'src/main/worker-thread-child-process/worker-thread-child-process-entry.ts'),
    'claude-profile-setup-worker-entry.js': join(upstream, 'src/main/claude-accounts/claude-profile-setup-worker-entry.ts')
  }
  const inputs = new Set()
  for (const [filename, entry] of Object.entries(entries)) {
    const result = await build({ ...common, entryPoints: [entry], outfile: join(output, filename) })
    for (const input of Object.keys(result.metafile.inputs)) inputs.add(input)
    await writeFile(join(output, filename + '.metafile.json'), JSON.stringify(result.metafile, null, 2) + '\n', { flag: 'wx' })
  }
  for (const name of ['provider-job-bootstrap']) {
    const result = await build({ ...common, entryPoints: [join(runtime, 'src', name + '.ts')], outfile: join(output, name + '.mjs'), format: 'esm', banner: {}, define: { 'process.env.NODE_ENV': '"production"' }, packages: 'external', external: common.external })
    for (const input of Object.keys(result.metafile.inputs)) inputs.add(input)
    await writeFile(join(output, name + '.mjs.metafile.json'), JSON.stringify(result.metafile, null, 2) + '\n', { flag: 'wx' })
  }
  for (const extensionName of ['pi-question-extension', 'pi-collaboration-extension', 'pi-project-extension']) {
  const questionExtension = await build({ ...common, entryPoints: [join(runtime, 'src', extensionName + '.ts')], outfile: join(output, extensionName + '.mjs'), format: 'esm',
    banner: { js: 'import { createRequire as swaCreateRequire } from "node:module"; const require = swaCreateRequire(import.meta.url);' },
    define: { 'process.env.NODE_ENV': '"production"' }, external: [...common.external, '@earendil-works/pi-ai', '@earendil-works/pi-coding-agent'] })
  for (const input of Object.keys(questionExtension.metafile.inputs)) inputs.add(input)
  await writeFile(join(output, extensionName + '.mjs.metafile.json'), JSON.stringify(questionExtension.metafile, null, 2) + '\n', { flag: 'wx' })
  }
  const policyDirectory = join(output, 'opencode-policy')
  await mkdir(policyDirectory)
  const policy = await build({ ...common, entryPoints: [join(runtime, 'src/opencode-policy-plugin.ts')], outfile: join(policyDirectory, 'server.js'), format: 'esm', banner: { js: 'import { createRequire as swaCreateRequire } from "node:module"; const require = swaCreateRequire(import.meta.url);' }, define: { 'process.env.NODE_ENV': '"production"' } })
  for (const input of Object.keys(policy.metafile.inputs)) inputs.add(input)
  await writeFile(join(policyDirectory, 'server.js.metafile.json'), JSON.stringify(policy.metafile, null, 2) + '\n', { flag: 'wx' })
  await writeFile(join(policyDirectory, 'package.json'), JSON.stringify({ name: 'swa-opencode-policy', version: '1.0.0', type: 'module', exports: './server.js' }) + '\n', { flag: 'wx' })
  await writeFile(join(output, 'project-shell'), '#!/bin/sh\nSWA_RUNTIME_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)" || exit 1\nexec "$SWA_RUNTIME_DIR/../node/node" "$SWA_RUNTIME_DIR/project-shell-entry.cjs" "$@"\n', { flag: 'wx', mode: 0o755 })
  const pkg = JSON.parse(await readFile(join(output, 'package.json'), 'utf8'))
  if (pkg.type !== 'commonjs') throw new Error('The deployed runtime must preserve CommonJS child entry semantics')
  await copyInlinedLicenses(output, inputs)
  console.log(JSON.stringify({ stage: 'codex-catalog-assets', ...await copyCodexCatalog(root, dirname(output)) }))
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  if (process.argv.length !== 3) throw new Error('Usage: build-swa-runtime.mjs ABSOLUTE_DIST_RUNTIME')
  await buildSWARuntime(resolve(process.argv[2]))
}
