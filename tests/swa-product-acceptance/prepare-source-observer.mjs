// 验收观察入口准备；只核公开源，不修改产品或读取 Session。
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { builtinModules, createRequire, isBuiltin } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, toNamespacedPath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const values = parseArgs({ options: Object.fromEntries(['candidate', 'source-repository', 'output', 'profile'].map(key => [key, { type: 'string' }])), allowPositionals: false }).values
for (const key of ['candidate', 'source-repository', 'output']) assert.ok(values[key] && isAbsolute(values[key]), 'observer_absolute_paths_required')
assert.ok(values.profile === undefined || ['stepfun-pi-n3', 'stepfun-pi-questions', 'stepfun-opencode', 'opencode-initialize-only'].includes(values.profile), 'observer_profile_unreviewed')
const pi = ['stepfun-pi-n3', 'stepfun-pi-questions'].includes(values.profile)
const questions = values.profile === 'stepfun-pi-questions'
const openCode = values.profile === 'stepfun-opencode'
const initializeOpenCode = values.profile === 'opencode-initialize-only'
const pureProtocol = pi || initializeOpenCode
const windows = process.platform === 'win32'
const samePath = (left, right) => windows ? left.toLowerCase() === right.toLowerCase() : left === right
if (initializeOpenCode) assert.ok(['linux', 'win32'].includes(process.platform) && process.arch === 'x64', 'initializer_platform_unreviewed')
process.umask(0o077)
const prototype = dirname(fileURLToPath(import.meta.url))
const snapshotPaths = [
  'third_party/orca-v1.4.230/src/shared',
  'third_party/orca-v1.4.230/src/main/daemon/swa-linux-process-identity.ts',
  'third_party/orca-v1.4.230/src/main/agent-hooks/managed-hook-owner-identity.ts',
  'third_party/orca-v1.4.230/src/main/pty-process-table-parser.ts',
  'third_party/orca-v1.4.230/package.json',
  'third_party/orca-v1.4.230/tsconfig.json',
  'third_party/orca-v1.4.230/config/tsconfig.node.json',
]
if (pi) snapshotPaths.push('third_party/orca-v1.4.230/src/main/pi/rpc-protocol.ts', 'scripts/build-swa-runtime.mjs',
  'third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-receipt.ts',
  'third_party/orca-v1.4.230/src/main/native-chat/agent-session-timeline/provider-timeline-identity.ts',
  'third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-payload-bounds.ts')
if (openCode) snapshotPaths.push(
  'third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-receipt.ts',
  'third_party/orca-v1.4.230/src/main/native-chat/agent-session-timeline/provider-timeline-identity.ts',
  'third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-payload-bounds.ts',
  'third_party/orca-v1.4.230/src/main/acp/acp-rpc-envelope.ts',
  'third_party/orca-v1.4.230/src/main/acp/acp-errors.ts',
  'third_party/orca-v1.4.230/src/main/acp/generated/acp-protocol.generated.ts')
if (initializeOpenCode) snapshotPaths.push(
  'scripts/build-swa-runtime.mjs', 'runtime/swa-orca/package.json',
  ...['native-opencode-policy.ts', 'private-opencode-account.ts', 'native-opencode-import.ts', 'native-pi-policy.ts',
    'native-codex-policy.ts', 'private-posix-security.ts', 'contracts.ts', 'task-budget.ts', 'pi-official-sources.json']
    .map(name => `runtime/swa-orca/src/${name}`),
  'third_party/orca-v1.4.230/src/packages/process-host/package.json',
  'third_party/orca-v1.4.230/src/packages/process-host/src',
  ...[
    'acp/acp-session-runtime.ts', 'acp/acp-errors.ts', 'acp/acp-response-settlement.ts', 'acp/acp-json-rpc-peer.ts',
    'acp/acp-permission-requests.ts', 'acp/acp-session-events.ts', 'acp/acp-session-setup.ts', 'acp/acp-incoming-requests.ts',
    'acp/acp-peer-limits.ts', 'acp/acp-oversized-lines.ts', 'acp/acp-write-queue.ts', 'acp/acp-stdio-error-boundary.ts',
    'acp/acp-rpc-envelope.ts', 'acp/generated/acp-protocol.generated.ts', 'zod-schema-compilation.ts',
    'provider-process/managed-provider-process.ts', 'provider-process/swa-provider-process-tree.ts',
    'provider-process/swa-linux-provider-process-tree.ts', 'provider-process/provider-process-close.ts',
    'provider-process/provider-process-supervisor.ts', 'provider-process/provider-process-teardown.ts',
    'provider-process/provider-executable-missing.ts', 'provider-process/provider-spawn-failure-report.ts',
    'provider-process/provider-process-exit-deadline.ts', 'provider-process/provider-process-launch.ts',
    'provider-process/provider-stdio-write-queue.ts', 'provider-process/provider-stdio-error-boundary.ts',
    'windows/windows-process-table.ts', 'windows/windows-process-table-timeout-error.ts',
    'windows/windows-process-table-cim-scan.ts', 'windows/windows-command-line-recovery-health.ts',
    'windows-process-tree-kill.ts', 'windows-pty-root-identity.ts', 'pty-descendant-exit-verification.ts',
    'pty-descendant-termination.ts', 'own-chromium-tree-kill-guard.ts', 'orca-chromium-process-pids.ts',
    'providers/windows-foreground-process-rows.ts', 'crash-reporting/self-initiated-tree-kill-log.ts',
    'crash-reporting/durable-crash-breadcrumb.ts', 'crash-reporting/main-process-lifecycle-identity.ts',
    'crash-reporting/crash-breadcrumb-store.ts', 'observability/tracer.ts', 'observability/redactor.ts',
    'agent-hooks/windows-powershell-hook-launcher.ts', 'pi/rpc-protocol.ts', 'runtime/orchestration/orchestration-error.ts',
    'opencode/opencode-structured-account-home.ts', 'managed-data-accounts/service.ts',
    'managed-data-accounts/credential-capture.ts', 'managed-data-accounts/profile-removal.ts',
    'host-tree-removal.ts', 'asar-transparent-fs.ts', 'opencode-usage/schema-helpers.ts',
    'sqlite/sync-database.ts', 'sqlite/node-sqlite-reader-api.ts', 'sqlite/node-sqlite-statement.ts', 'sqlite/sqlite-integer-reader.ts'
  ].map(name => `third_party/orca-v1.4.230/src/main/${name}`))
const questionContractSources = questions ? ['runtime/swa-orca/src/contracts.ts', 'runtime/swa-orca/src/task-budget.ts',
  'third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error.ts'] : []
snapshotPaths.push(...questionContractSources)
const questionExports = questions ? "\nexport { questionRequestID, questionWaitID, readQuestionMutationResult, questionResumeBody } from './source/runtime/swa-orca/src/contracts'\n" : ''
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const inside = (root, path) => {
  const suffix = relative(root, path)
  return !suffix || suffix !== '..' && !suffix.startsWith('../') && !suffix.startsWith('..\\') && !isAbsolute(suffix)
}
async function ordinary(path, directory = false) {
  const canonical = await realpath(path)
  assert.ok(samePath(canonical, resolve(path)), 'observer_redirected_path')
  for (let current = canonical; ; current = dirname(current)) {
    const value = await lstat(current)
    assert.ok(!value.isSymbolicLink(), 'observer_link_path')
    assert.ok(current === canonical ? directory ? value.isDirectory() : value.isFile() : value.isDirectory(), 'observer_ordinary_path_required')
    if (dirname(current) === current) return canonical
  }
}
const serialize = value => `${value.dev}:${value.ino}:${value.birthtimeNs}:${value.mtimeNs}:${value.size}`
async function boundedArtifact(path) {
  await ordinary(path)
  const before = await stat(path, { bigint: true })
  assert.ok(before.size > 0n && before.size <= 4n * 1024n * 1024n, 'observer_protocol_artifact_bound')
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    assert.equal(serialize(await handle.stat({ bigint: true })), serialize(before), 'observer_protocol_fd_changed')
    const buffer = Buffer.alloc(Number(before.size) + 1)
    let count = 0
    while (count < buffer.length) {
      const value = await handle.read(buffer, count, buffer.length - count, null)
      if (!value.bytesRead) break
      count += value.bytesRead
    }
    assert.equal(count, Number(before.size), 'observer_protocol_changed_during_read')
    assert.equal(serialize(await handle.stat({ bigint: true })), serialize(before), 'observer_protocol_fd_changed')
    assert.equal(serialize(await stat(path, { bigint: true })), serialize(before), 'observer_protocol_path_changed')
    return { bytes: buffer.subarray(0, count), info: before }
  } finally { await handle.close() }
}
async function version(path, protocolArtifact = false) {
  if (protocolArtifact) {
    const { bytes, info } = await boundedArtifact(path)
    return { path, version: serialize(info), sha256: sha(bytes) }
  }
  await ordinary(path)
  const before = await stat(path, { bigint: true })
  const bytes = await readFile(path)
  const after = await stat(path, { bigint: true })
  assert.equal(serialize(after), serialize(before), 'observer_source_changed_during_read')
  return { path, version: serialize(before), sha256: sha(bytes) }
}
const candidate = await ordinary(values.candidate, true)
const repository = await ordinary(values['source-repository'], true)
await ordinary(dirname(values.output), true)
const output = resolve(values.output)
assert.ok(!inside(candidate, output) && !inside(output, candidate), 'observer_output_overlaps_installation')
const installedNode = join(candidate, windows ? 'node/node.exe' : 'node/node')
const installedCli = join(candidate, windows ? 'swa.exe' : 'swa')
assert.ok(samePath(await realpath(process.execPath), await ordinary(installedNode)), 'observer_requires_actual_installed_node')
const installedRevision = (await readFile(await ordinary(join(candidate, 'VERSION')), 'utf8')).trim()
assert.match(installedRevision, /^[0-9a-f]{40}$/)
const commandOptions = { cwd: repository, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat' }, timeout: 30_000, maxBuffer: 64 * 1024 * 1024 }
const sourceRevision = execFileSync('git', ['rev-parse', '--verify', `${installedRevision}^{commit}`], commandOptions).toString('ascii').trim()
assert.equal(sourceRevision, installedRevision, 'observer_installed_commit_missing')
if (!pi || windows) assert.equal(execFileSync(installedCli, ['--version'], { timeout: 5000, maxBuffer: 4096, encoding: 'utf8' }).trim(), installedRevision, 'observer_actual_cli_version_mismatch')
const requireInstalled = createRequire(join(candidate, 'runtime/package.json'))
const preparationDependencies = []
let security, extractionRuntime
if (windows) {
  assert.equal(process.arch, 'x64', 'observer_windows_architecture_unreviewed')
  const securityEntry = await ordinary(requireInstalled.resolve('@orca/windows-security'))
  const securityRoot = await ordinary(join(candidate, 'runtime/node_modules/@orca/windows-security'), true)
  assert.ok(inside(securityRoot, securityEntry), 'observer_security_outside_installation')
  const securityAddon = await ordinary(join(securityRoot, 'build/Release/orca_windows_security.node'))
  preparationDependencies.push(await version(securityEntry), await version(securityAddon))
  security = requireInstalled(securityEntry)
  const observed = JSON.parse(execFileSync('python', ['-I', '-c', 'import json, sys; print(json.dumps({"executable": sys.executable, "version": list(sys.version_info[:3])}))'], { timeout: 10_000, maxBuffer: 4096, encoding: 'utf8', windowsHide: true }))
  assert.deepEqual(Object.keys(observed).sort(), ['executable', 'version'])
  assert.ok(isAbsolute(observed.executable) && Array.isArray(observed.version) && observed.version.length === 3 && observed.version.every(Number.isSafeInteger))
  assert.deepEqual(observed.version.slice(0, 2), [3, 13], 'observer_windows_python_unreviewed')
  extractionRuntime = { executable: await ordinary(observed.executable), version: observed.version }
}
function privateWindowsPath(path, directory) {
  const user = security.currentUserSid(), acl = security.getDaclAces(toNamespacedPath(path)), trustees = new Set([user, 'S-1-5-18'])
  assert.ok(acl?.protected && acl.ownerSid === user && acl.aces.length === trustees.size, 'observer_private_acl_changed')
  for (const ace of acl.aces) assert.ok(ace.type === 0 && ace.flags === (directory ? 3 : 0) && ace.mask === 0x1f01ff && trustees.delete(ace.sid), 'observer_private_acl_changed')
  assert.equal(trustees.size, 0, 'observer_private_acl_changed')
}
async function outputDirectory(path, recursive = false) {
  if (!windows) return mkdir(path, { recursive, mode: 0o700 })
  assert.ok(inside(output, path), 'observer_output_directory_outside_root')
  if (recursive && !samePath(path, output)) await outputDirectory(dirname(path), true)
  await ordinary(dirname(path), true)
  const created = security.createPrivateDirectory(toNamespacedPath(path))
  assert.ok(recursive || created, 'observer_output_directory_already_exists')
  await ordinary(path, true)
  privateWindowsPath(path, true)
}
async function outputFile(path, value) {
  if (!windows) return writeFile(path, value, { flag: 'wx', mode: 0o600 })
  assert.ok(inside(output, path), 'observer_output_file_outside_root')
  await ordinary(dirname(path), true)
  const user = security.currentUserSid()
  security.createFileWithDacl(toNamespacedPath(path), `O:${user}D:P${[...new Set([user, 'S-1-5-18'])].map(sid => `(A;;FA;;;${sid})`).join('')}`, Buffer.isBuffer(value) ? value : Buffer.from(value))
  await ordinary(path)
  privateWindowsPath(path, false)
}
const bundlePath = join(output, 'observer.cjs')
const installedExternals = new Map()
const dynamicDependencies = []
let initializationEnvironment
if (initializeOpenCode) {
  const nodePath = await ordinary(join(candidate, 'runtime/node_modules'), true)
  assert.equal(process.env.NODE_PATH, nodePath, 'initializer_node_path_must_match_installation')
  assert.ok(!Object.keys(process.env).some(key => key.toUpperCase() === 'NODE_OPTIONS'), 'initializer_node_options_forbidden')
  const requireBundle = createRequire(bundlePath)
  for (const name of ['node-pty/lib/utils', '@orca/windows-security', ...(process.platform === 'win32' ? ['@vscode/windows-process-tree'] : [])]) {
    const path = await ordinary(requireBundle.resolve(name))
    const installed = await ordinary(requireInstalled.resolve(name))
    const packageName = name === 'node-pty/lib/utils' ? 'node-pty' : name
    assert.equal(path, installed, 'initializer_runtime_dependency_differs_from_installation')
    assert.ok(inside(join(nodePath, packageName), path), 'initializer_runtime_dependency_outside_package')
    dynamicDependencies.push({ name, ...await version(path) })
  }
  initializationEnvironment = { platform: process.platform, architecture: process.arch, node_path: nodePath, node_options_absent: true, bundle_path: bundlePath }
}
const journalModule = await version(await ordinary(requireInstalled.resolve('./journal-open.cjs')))
const protocolModule = pureProtocol ? await version(await ordinary(join(candidate, 'runtime/pi-protocol.cjs')), true) : undefined
const protocolMetafile = pureProtocol ? await version(await ordinary(join(candidate, 'runtime/pi-protocol.cjs.metafile.json')), true) : undefined
if (pi && !windows) assert.equal(execFileSync(installedCli, ['--version'], { timeout: 5000, maxBuffer: 4096, encoding: 'utf8' }).trim(), installedRevision, 'observer_actual_cli_version_mismatch')
await outputDirectory(output)
const archive = execFileSync('git', ['archive', '--format=zip', installedRevision, '--', ...snapshotPaths], commandOptions)
const archivePath = join(output, 'source.zip')
await outputFile(archivePath, archive)
const extraction = execFileSync(windows ? extractionRuntime.executable : 'python3', ['-I', join(prototype, 'extract-observer-source.py'), archivePath, repository, installedRevision, join(output, 'source'), ...(pi || openCode || initializeOpenCode ? ['--profile', values.profile] : [])], { timeout: 60_000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', windowsHide: true })
const archiveProof = JSON.parse(extraction)
assert.equal(archiveProof.revision, installedRevision)
const entryPath = join(output, 'entry.ts')
const entryName = initializeOpenCode ? 'opencode-initialization-entry.ts' : openCode ? 'opencode-source-observer-entry.ts' : pi ? 'pi-source-observer-entry.ts' : 'source-observer-entry.ts'
const prototypeEntry = await version(join(prototype, entryName))
const entryBytes = await readFile(prototypeEntry.path)
assert.equal(sha(entryBytes), prototypeEntry.sha256, 'observer_entry_source_changed')
if (openCode || initializeOpenCode || windows) assert.ok(execFileSync('git', ['show', `${installedRevision}:tests/swa-product-acceptance/${entryName}`], commandOptions).equals(entryBytes), 'observer_entry_differs_from_installed_revision')
await outputFile(entryPath, Buffer.concat([entryBytes, Buffer.from(questionExports, 'utf8')]))
// 编译器单独记录；初始化的 JSONC 构建输入另按固定声明核验并复制到公开快照。
const requireCompiler = createRequire(new URL('../../runtime/swa-orca/package.json', import.meta.url))
const esbuildPath = await ordinary(requireCompiler.resolve('esbuild'))
const esbuild = requireCompiler('esbuild')
assert.equal(esbuild.version, '0.28.2', 'observer_compiler_version_unreviewed')
let protocolMapping, typescriptModule, jsoncDependency, smolDependency, smolMetafile
const jsoncCopies = new Set()
const smolCopies = new Set()
if (pureProtocol) {
  const ts = requireCompiler('typescript')
  typescriptModule = await version(await ordinary(requireCompiler.resolve('typescript')))
  const builderPath = 'scripts/build-swa-runtime.mjs'
  const builder = ts.createSourceFile(builderPath, await readFile(join(output, 'source', builderPath), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const mappings = []
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'entries') {
      assert.ok(node.initializer && ts.isObjectLiteralExpression(node.initializer), 'observer_builder_entries_not_literal')
      for (const property of node.initializer.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name) || property.name.text !== 'pi-protocol.cjs') continue
        const call = property.initializer
        assert.ok(ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === 'join' && call.arguments.length === 2 && ts.isIdentifier(call.arguments[0]) && call.arguments[0].text === 'upstream' && ts.isStringLiteral(call.arguments[1]), 'observer_protocol_mapping_unreviewed')
        mappings.push(call.arguments[1].text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(builder)
  assert.deepEqual(mappings, ['src/main/pi/rpc-protocol.ts'], 'observer_protocol_mapping_changed')
  const protocolSource = 'third_party/orca-v1.4.230/' + mappings[0]
  protocolMapping = { builder: archiveProof.entries.find(row => row.path === builderPath), source: archiveProof.entries.find(row => row.path === protocolSource) }
  assert.ok(protocolMapping.builder && protocolMapping.source, 'observer_protocol_git_source_missing')
  const metaBytes = await boundedArtifact(protocolMetafile.path)
  assert.equal(sha(metaBytes.bytes), protocolMetafile.sha256, 'observer_protocol_metafile_changed')
  const meta = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(metaBytes.bytes))
  const outputs = Object.values(meta.outputs)
  assert.equal(outputs.length, 1, 'observer_protocol_output_inventory')
  assert.equal(outputs[0].entryPoint.replaceAll('\\', '/').replace(/^.*\/third_party\//, 'third_party/'), protocolSource, 'observer_protocol_actual_entrypoint_changed')
  // 问答参数只使用这个内建函数作结构比较；旧纯入口仍允许空 external。
  const pureProtocolImports = outputs[0].imports.length === 0 ? [] : [{ path: 'node:util', kind: 'require-call', external: true }]
  assert.deepEqual(outputs[0].imports, pureProtocolImports, 'observer_protocol_external_dependency_unreviewed')
  const inputs = Object.keys(meta.inputs).map(path => path.replaceAll('\\', '/'))
  assert.ok(inputs.some(path => path.endsWith(protocolSource)) && inputs.some(path => path.includes('/jsonc-parser/') && path.endsWith('/lib/esm/main.js')) && inputs.some(path => path.includes('/zod/')), 'observer_protocol_actual_inputs_missing')
  assert.ok(inputs.every(path => !/claude-agent-sdk|pi-coding-agent|pi-ai|native-pi-policy|pi-session-policy|process-host/.test(path)), 'observer_protocol_effectful_input_unreviewed')
  if (questions || initializeOpenCode) {
    const protocol = requireInstalled(protocolModule.path)
    for (const name of ['strictPiQuestionParamsSchema', 'strictPiQuestionResultSchema', ...(questions ? ['strictPiQuestionRawSchema', 'strictPiQuestionNativeEntrySchema'] : ['strictPiModelSchema'])]) assert.equal(typeof protocol[name]?.safeParse, 'function', 'observer_installed_question_schema_missing')
    if (initializeOpenCode) assert.equal(typeof protocol.parseStrictPiJson, 'function', 'initializer_installed_pi_parser_missing')
  }
  if (initializeOpenCode) {
    const jsoncMappings = []
    const accountMappings = []
    const jsoncVisit = node => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'entries') {
        assert.ok(node.initializer && ts.isObjectLiteralExpression(node.initializer), 'initializer_account_mapping_unreviewed')
        for (const property of node.initializer.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name) || property.name.text !== 'private-opencode-account.cjs') continue
          const call = property.initializer
          assert.ok(ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === 'join' && call.arguments.length === 3 && ts.isIdentifier(call.arguments[0]) && call.arguments[0].text === 'runtime' && call.arguments.slice(1).every(argument => ts.isStringLiteral(argument)), 'initializer_account_mapping_unreviewed')
          accountMappings.push(call.arguments.slice(1).map(argument => argument.text))
        }
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'onResolve' && node.arguments.length === 2) {
        const options = node.arguments[0], callback = node.arguments[1]
        const filter = ts.isObjectLiteralExpression(options) && options.properties.find(property => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === 'filter')
        if (filter && ts.isRegularExpressionLiteral(filter.initializer) && filter.initializer.text === '/^jsonc-parser$/') {
          assert.ok(ts.isArrowFunction(callback) && ts.isParenthesizedExpression(callback.body) && ts.isObjectLiteralExpression(callback.body.expression), 'initializer_jsonc_builder_mapping_unreviewed')
          const properties = callback.body.expression.properties
          assert.ok(properties.length === 1 && ts.isPropertyAssignment(properties[0]) && ts.isIdentifier(properties[0].name) && properties[0].name.text === 'path', 'initializer_jsonc_builder_mapping_unreviewed')
          const call = properties[0].initializer
          assert.ok(ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === 'join' && call.arguments.length === 4, 'initializer_jsonc_builder_mapping_unreviewed')
          const directory = call.arguments[0]
          assert.ok(ts.isCallExpression(directory) && ts.isIdentifier(directory.expression) && directory.expression.text === 'dirname' && directory.arguments.length === 1, 'initializer_jsonc_builder_mapping_unreviewed')
          const entry = directory.arguments[0]
          assert.ok(ts.isCallExpression(entry) && ts.isPropertyAccessExpression(entry.expression) && ts.isIdentifier(entry.expression.expression) && entry.expression.expression.text === 'requireRuntime' && entry.expression.name.text === 'resolve' && entry.arguments.length === 1 && ts.isStringLiteral(entry.arguments[0]), 'initializer_jsonc_builder_mapping_unreviewed')
          assert.ok(call.arguments.slice(1).every(argument => ts.isStringLiteral(argument)), 'initializer_jsonc_builder_mapping_unreviewed')
          jsoncMappings.push([entry.arguments[0].text, ...call.arguments.slice(1).map(argument => argument.text)])
        }
      }
      ts.forEachChild(node, jsoncVisit)
    }
    jsoncVisit(builder)
    assert.deepEqual(jsoncMappings, [['jsonc-parser/package.json', 'lib', 'esm', 'main.js']], 'initializer_jsonc_builder_mapping_changed')
    assert.deepEqual(accountMappings, [['src', 'private-opencode-account.ts']], 'initializer_account_mapping_changed')
    const declarationPath = 'runtime/swa-orca/package.json'
    const declaration = archiveProof.entries.find(row => row.path === declarationPath)
    assert.ok(declaration, 'initializer_jsonc_declaration_missing')
    const runtimePackage = JSON.parse(await readFile(join(output, 'source', declarationPath), 'utf8'))
    assert.equal(runtimePackage.devDependencies?.['jsonc-parser'], '3.3.1', 'initializer_jsonc_version_unreviewed')
    assert.equal(runtimePackage.dependencies?.['jsonc-parser'], undefined, 'initializer_jsonc_must_be_build_dependency')
    // 只供下面两个已声明的构建依赖复制准确公开文件，不作为通用包解析入口。
    const copyInlineFiles = async (pkg, packageRoot, packageSource, names, entry, copies) => {
      const destination = join(output, 'build-dependencies', pkg.name), files = []
      for (const name of names) {
        const original = await version(join(packageRoot, name)), bytes = await readFile(original.path)
        assert.equal(sha(bytes), original.sha256, 'initializer_inline_source_changed')
        assert.deepEqual(await version(original.path), original, 'initializer_inline_source_changed')
        const copyPath = join(destination, name)
        await outputDirectory(dirname(copyPath), true)
        await outputFile(copyPath, bytes)
        const copy = await version(copyPath)
        assert.equal(copy.sha256, original.sha256, 'initializer_inline_copy_changed')
        files.push({ name, original, copy })
        if (name.endsWith('.js')) copies.add(copyPath)
      }
      assert.deepEqual(files[0].original, packageSource, 'initializer_inline_package_changed')
      return { kind: 'explicit-build-time-inline-dependency', name: pkg.name, version: pkg.version, declaration, builder: protocolMapping.builder, source_root: packageRoot, entry: join(destination, entry), files }
    }
    const packagePath = await ordinary(await realpath(requireCompiler.resolve('jsonc-parser/package.json')))
    const packageRoot = await ordinary(join(repository, 'node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser'), true)
    assert.equal(packagePath, join(packageRoot, 'package.json'), 'initializer_jsonc_package_source_unreviewed')
    const packageSource = await version(packagePath)
    const packageBytes = await readFile(packagePath)
    assert.equal(sha(packageBytes), packageSource.sha256, 'initializer_jsonc_package_changed')
    const pkg = JSON.parse(packageBytes.toString('utf8'))
    assert.equal(pkg.name, 'jsonc-parser'); assert.equal(pkg.version, '3.3.1'); assert.equal(pkg.module, './lib/esm/main.js')
    jsoncDependency = await copyInlineFiles(pkg, packageRoot, packageSource, ['package.json', 'lib/esm/main.js', 'lib/esm/impl/edit.js', 'lib/esm/impl/format.js', 'lib/esm/impl/parser.js', 'lib/esm/impl/scanner.js', 'lib/esm/impl/string-intern.js'], 'lib/esm/main.js', jsoncCopies)
    assert.equal(runtimePackage.devDependencies?.['smol-toml'], '1.9.1', 'initializer_smol_version_unreviewed')
    assert.equal(runtimePackage.dependencies?.['smol-toml'], undefined, 'initializer_smol_must_be_build_dependency')
    smolMetafile = await version(await ordinary(join(candidate, 'runtime/private-opencode-account.cjs.metafile.json')), true)
    const smolMetaBytes = await boundedArtifact(smolMetafile.path)
    assert.equal(sha(smolMetaBytes.bytes), smolMetafile.sha256, 'initializer_smol_metafile_changed')
    const smolMeta = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(smolMetaBytes.bytes))
    const accountOutputs = Object.values(smolMeta.outputs)
    assert.equal(accountOutputs.length, 1, 'initializer_smol_output_inventory')
    assert.equal(accountOutputs[0].entryPoint.replaceAll('\\', '/'), 'runtime/swa-orca/src/private-opencode-account.ts', 'initializer_smol_actual_entrypoint_changed')
    const smolPrefix = 'node_modules/.pnpm/smol-toml@1.9.1/node_modules/smol-toml/'
    const smolNames = ['dist/date.js', 'dist/error.js', 'dist/extract.js', 'dist/index.js', 'dist/parse.js', 'dist/primitive.js', 'dist/stringify.js', 'dist/struct.js', 'dist/util.js']
    const smolInputs = new Map(Object.entries(smolMeta.inputs).map(([path, value]) => [path.replaceAll('\\', '/'), value]))
    const capturePath = 'third_party/orca-v1.4.230/src/main/managed-data-accounts/credential-capture.ts'
    const smolEdges = smolInputs.get(capturePath)?.imports.filter(row => row.original === 'smol-toml')
    assert.ok(smolEdges?.length === 1 && smolEdges[0].kind === 'import-statement' && !smolEdges[0].external && smolEdges[0].path.replaceAll('\\', '/') === smolPrefix + 'dist/index.js', 'initializer_smol_actual_mapping_changed')
    assert.deepEqual([...smolInputs.keys()].filter(path => path.startsWith(smolPrefix)).map(path => path.slice(smolPrefix.length)).sort(), smolNames, 'initializer_smol_actual_inputs_changed')
    const smolRoot = await ordinary(join(repository, 'node_modules/.pnpm/smol-toml@1.9.1/node_modules/smol-toml'), true)
    assert.equal(await ordinary(await realpath(requireCompiler.resolve('smol-toml'))), join(smolRoot, 'dist/index.cjs'), 'initializer_smol_package_source_unreviewed')
    const smolPackage = await version(join(smolRoot, 'package.json')), smolBytes = await readFile(smolPackage.path)
    assert.equal(sha(smolBytes), smolPackage.sha256, 'initializer_smol_package_changed')
    const smol = JSON.parse(smolBytes.toString('utf8'))
    assert.equal(smol.name, 'smol-toml'); assert.equal(smol.version, '1.9.1'); assert.equal(smol.exports?.import, './dist/index.js'); assert.equal(smol.exports?.require, './dist/index.cjs')
    smolDependency = await copyInlineFiles(smol, smolRoot, smolPackage, ['package.json', ...smolNames], 'dist/index.js', smolCopies)
    smolDependency.installed_selection = { metafile: smolMetafile, importer: capturePath, edge: smolEdges[0], inputs: smolNames }
  }
}
const builtins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]))
const seenInputs = new Map()
const processHostRoot = join(output, 'source/third_party/orca-v1.4.230/src/packages/process-host')
const processHostPackage = initializeOpenCode ? await version(join(processHostRoot, 'package.json')) : undefined
const processHostExports = initializeOpenCode ? JSON.parse(await readFile(processHostPackage.path, 'utf8')).exports : undefined
const protocolSpecifier = '../../../third_party/orca-v1.4.230/src/main/pi/rpc-protocol'
const protocolImporters = questions || initializeOpenCode ? ['contracts.ts', ...(initializeOpenCode ? ['native-pi-policy.ts'] : [])].map(name => join(output, 'source/runtime/swa-orca/src', name)) : []
const protocolBindings = new Set()
const jsoncImporter = join(output, 'source/runtime/swa-orca/src/native-opencode-policy.ts')
const smolImporter = join(output, 'source/third_party/orca-v1.4.230/src/main/managed-data-accounts/credential-capture.ts')
let jsoncBinding = false, smolBinding = false
let build
try { build = await esbuild.build({
  absWorkingDir: output, entryPoints: [entryPath], outfile: bundlePath, platform: 'node',
  target: 'node24', format: 'cjs', bundle: true, metafile: true, write: false,
  tsconfigRaw: { compilerOptions: { target: 'ES2022', module: 'CommonJS', esModuleInterop: true } },
  logLevel: 'silent',
  plugins: [{ name: 'installed-source-only', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, async args => {
      if (jsoncCopies.has(args.importer) || smolCopies.has(args.importer)) {
        const copies = jsoncCopies.has(args.importer) ? jsoncCopies : smolCopies
        assert.ok(args.namespace === 'file' && args.kind === 'import-statement' && args.path.startsWith('.'), 'initializer_inline_dependency_unreviewed')
        const path = resolve(args.resolveDir, args.path + (copies === jsoncCopies ? '.js' : ''))
        assert.ok(copies.has(path), 'initializer_inline_dependency_outside_snapshot')
        return { path: await ordinary(path) }
      }
      if ((questions || initializeOpenCode) && args.path === protocolSpecifier) {
        assert.ok(args.namespace === 'file' && args.kind === 'import-statement' && protocolImporters.includes(args.importer), 'observer_protocol_importer_unreviewed')
        await ordinary(args.importer)
        assert.equal(resolve(args.resolveDir, args.path + '.ts'), join(output, 'source', protocolMapping.source.path), 'observer_protocol_relative_target_changed')
        protocolBindings.add(args.importer)
        if (initializeOpenCode) installedExternals.set(protocolModule.path, protocolModule)
        return { path: protocolModule.path, external: true }
      }
      if (initializeOpenCode && args.path === 'jsonc-parser') {
        assert.ok(args.namespace === 'file' && args.kind === 'import-statement' && args.importer === jsoncImporter, 'initializer_jsonc_importer_unreviewed')
        await ordinary(args.importer)
        jsoncBinding = true
        return { path: jsoncDependency.entry }
      }
      if (initializeOpenCode && args.path === 'smol-toml') {
        assert.ok(args.namespace === 'file' && args.kind === 'import-statement' && args.importer === smolImporter, 'initializer_smol_importer_unreviewed')
        await ordinary(args.importer)
        smolBinding = true
        return { path: smolDependency.entry }
      }
      return undefined
    })
    plugin.onResolve({ filter: /^[^./]/ }, async args => {
      if (builtins.has(args.path) || initializeOpenCode && isBuiltin(args.path)) return { path: args.path, external: true }
      if ((initializeOpenCode || windows) && isAbsolute(args.path)) return undefined
      if (initializeOpenCode && (args.path === '@orca/process-host' || args.path.startsWith('@orca/process-host/'))) {
        const subpath = args.path === '@orca/process-host' ? '.' : '.' + args.path.slice('@orca/process-host'.length)
        const entry = processHostExports[subpath]?.['orca-source']
        assert.ok(typeof entry === 'string' && entry.startsWith('./src/'), 'initializer_process_host_export_unreviewed')
        const path = await ordinary(resolve(processHostRoot, entry))
        assert.ok(inside(join(processHostRoot, 'src'), path), 'initializer_process_host_export_outside_source')
        return { path }
      }
      const resolved = await ordinary(requireInstalled.resolve(args.path))
      assert.ok(inside(join(candidate, 'runtime/node_modules'), resolved), 'observer_dependency_outside_installation')
      if (initializeOpenCode && args.path === '@orca/windows-security') {
        const runtime = dynamicDependencies.find(entry => entry.name === args.path)
        assert.equal(resolved, runtime.path, 'initializer_external_runtime_mismatch')
        installedExternals.set(resolved, await version(resolved))
        return { path: resolved, external: true }
      }
      return { path: resolved }
    })
    plugin.onLoad({ filter: /.*/ }, async args => {
      const path = await ordinary(args.path)
      assert.ok(path === entryPath || inside(join(output, 'source'), path) || inside(join(candidate, 'runtime/node_modules'), path) || jsoncCopies.has(path) || smolCopies.has(path), 'observer_compiler_input_outside_snapshot')
      seenInputs.set(path, await version(path))
      return undefined
    })
  } }],
}) } finally { await esbuild.stop() }
assert.equal(build.outputFiles.length, 1, 'observer_unexpected_compiler_outputs')
for (const path of Object.keys(build.metafile.inputs)) assert.ok(seenInputs.has(resolve(output, path)), 'observer_untracked_metafile_input')
for (const [path, expected] of seenInputs) assert.deepEqual(await version(path), expected, 'observer_source_changed_during_build')
let protocolImports
if (questions || initializeOpenCode) {
  assert.deepEqual([...protocolBindings].sort(), [...protocolImporters].sort(), 'observer_protocol_bindings_incomplete')
  const metaInputs = new Map(Object.entries(build.metafile.inputs).map(([path, input]) => [resolve(output, path), input]))
  for (const importer of protocolImporters) {
    const edges = metaInputs.get(importer)?.imports.filter(row => resolve(output, row.path) === protocolModule.path)
    assert.ok(edges?.length === 1 && edges[0].kind === 'import-statement' && edges[0].external === true, 'observer_protocol_input_edge_changed')
  }
  const outputs = Object.values(build.metafile.outputs)
  assert.equal(outputs.length, 1, 'observer_output_inventory_changed')
  protocolImports = outputs[0].imports.filter(row => resolve(output, row.path) === protocolModule.path)
  assert.ok(protocolImports.length > 0 && protocolImports.every(row => row.kind === 'require-call' && row.external === true), 'observer_protocol_output_edge_changed')
  assert.ok(!metaInputs.has(join(output, 'source', protocolMapping.source.path)), 'observer_protocol_recompiled')
  if (questions) assert.ok([...metaInputs.keys()].every(path => !path.replaceAll('\\', '/').includes('/jsonc-parser/')), 'observer_question_jsonc_recompiled')
  if (initializeOpenCode) {
    assert.equal(jsoncBinding, true, 'initializer_jsonc_binding_missing')
    const edges = metaInputs.get(jsoncImporter)?.imports.filter(row => resolve(output, row.path) === jsoncDependency.entry)
    assert.ok(edges?.length === 1 && edges[0].kind === 'import-statement' && !edges[0].external, 'initializer_jsonc_input_edge_changed')
    for (const path of jsoncCopies) assert.ok(metaInputs.has(path), 'initializer_jsonc_input_missing')
    assert.ok(outputs[0].imports.every(row => row.path !== 'jsonc-parser' && !jsoncCopies.has(resolve(output, row.path))), 'initializer_jsonc_was_externalized')
    assert.equal(smolBinding, true, 'initializer_smol_binding_missing')
    const smolEdges = metaInputs.get(smolImporter)?.imports.filter(row => resolve(output, row.path) === smolDependency.entry)
    assert.ok(smolEdges?.length === 1 && smolEdges[0].kind === 'import-statement' && !smolEdges[0].external, 'initializer_smol_input_edge_changed')
    for (const path of smolCopies) assert.ok(metaInputs.has(path), 'initializer_smol_input_missing')
    assert.ok(outputs[0].imports.every(row => row.path !== 'smol-toml' && !smolCopies.has(resolve(output, row.path))), 'initializer_smol_was_externalized')
  }
}
if (initializeOpenCode) {
  assert.deepEqual(await version(processHostPackage.path), processHostPackage, 'initializer_process_host_package_changed')
  for (const expected of installedExternals.values()) assert.deepEqual(await version(expected.path), expected, 'initializer_external_changed')
  for (const { name: _name, ...expected } of dynamicDependencies) assert.deepEqual(await version(expected.path), expected, 'initializer_dynamic_dependency_changed')
  for (const dependency of [jsoncDependency, smolDependency]) for (const { original, copy } of dependency.files) {
    assert.deepEqual(await version(original.path), original, 'initializer_inline_source_changed')
    assert.deepEqual(await version(copy.path), copy, 'initializer_inline_copy_changed')
  }
  assert.deepEqual(await version(smolMetafile.path, true), smolMetafile, 'initializer_smol_metafile_changed')
}
assert.deepEqual(await version(journalModule.path), journalModule, 'observer_journal_module_changed')
if (pureProtocol) for (const source of [protocolModule, protocolMetafile]) assert.deepEqual(await version(source.path, true), source, 'observer_protocol_artifact_changed')
for (const expected of preparationDependencies) assert.deepEqual(await version(expected.path), expected, 'observer_preparation_dependency_changed')
await outputFile(bundlePath, build.outputFiles[0].contents)
const manifest = {
  scope: initializeOpenCode ? 'controlled-opencode-initialization-client-preparation' : 'read-only-source-observer-preparation', product_or_model_execution: 'NOT_RUN',
  installed_revision: installedRevision, archive_sha256: sha(archive), archive_proof: archiveProof,
  compiler: { version: esbuild.version, module: await version(esbuildPath) },
  journal_module: journalModule, inputs: [...seenInputs.values()], metafile: build.metafile,
  observer: await version(bundlePath),
  ...(windows ? { preparation_dependencies: preparationDependencies, extraction_runtime: extractionRuntime } : {}),
  ...(questions ? { entry_source: prototypeEntry, entry_exports: questionExports, question_contract_sources: questionContractSources.map(path => {
    const source = archiveProof.entries.find(entry => entry.path === path)
    assert.ok(source, 'observer_question_contract_git_source_missing')
    return source
  }) } : {}),
  ...(pureProtocol ? { profile: values.profile, protocol_module: protocolModule, protocol_metafile: protocolMetafile, protocol_mapping: protocolMapping, typescript_module: typescriptModule } : {}),
  ...(protocolImports ? { protocol_bindings: { importers: [...protocolBindings], specifier: protocolSpecifier, target: protocolModule.path, output_imports: protocolImports } } : {}),
  ...(openCode ? { profile: values.profile, entry_source: prototypeEntry } : {}),
  ...(initializeOpenCode ? { profile: values.profile, entry_source: prototypeEntry, process_host_package: processHostPackage,
    runtime_environment: initializationEnvironment, installed_external_entries: [...installedExternals.values()], dynamic_dependencies: dynamicDependencies, build_dependencies: [jsoncDependency, smolDependency] } : {}),
}
await outputFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
process.stdout.write(JSON.stringify({ status: 'PREPARED_ONLY', installed_revision: installedRevision, source_entries: archiveProof.files, bundled_inputs: seenInputs.size, observer_sha256: manifest.observer.sha256, model_execution: 'NOT_RUN' }) + '\n')
