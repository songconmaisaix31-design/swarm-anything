import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, toNamespacedPath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual, parseArgs } from 'node:util'
import { buildDiagnosticModule, extractOriginalModule } from './windows-pi-private-root-mre.mjs'

const failedRevision = '11717767f82a8a4070351ff74674aa0d268f79b2'
const accountFile = 'runtime/swa-orca/src/private-pi-account.ts'
const nativeFiles = ['index.js', 'index.d.ts', 'src/addon.cc']
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
class ControlError extends Error {}
function fact(value, code) { if (!value) throw new ControlError(code) }
function within(parent, path) {
  const child = relative(parent, path)
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith('..\\') && !child.startsWith('../'))
}
async function plainDirectory(path) {
  fact(isAbsolute(path) && samePath(await realpath(path), resolve(path)), 'control_directory_redirected')
  for (let current = resolve(path); ; current = dirname(current)) {
    const info = await lstat(current)
    fact(info.isDirectory() && !info.isSymbolicLink() && samePath(await realpath(current), current), 'control_directory_redirected')
    if (dirname(current) === current) return resolve(path)
  }
}
async function snapshot(path, security) {
  const info = await lstat(path, { bigint: true })
  return {
    stat: Object.fromEntries(['dev', 'ino', 'birthtimeNs', 'mtimeNs', 'size'].map(key => [key, String(info[key])])),
    acl: security.getDaclAces(toNamespacedPath(path)),
    entries: info.isDirectory() ? (await readdir(path)).sort() : null,
    bytes: info.isFile() ? sha256(await readFile(path)) : null
  }
}
function safeError(error) {
  const message = error instanceof Error ? error.message : ''
  if (error instanceof ControlError && /^control_[a-z_]+$/.test(message)) return { kind: 'control', code: message }
  if (/^private_pi_(directory_redirected|security_changed|directory_not_empty|security_unavailable)$/.test(message)) return { kind: 'original_guard', code: message }
  const native = /^([A-Za-z][A-Za-z0-9]+) failed with Win32 error ([0-9]+)$/.exec(message)
  if (native && new Set(['CreateDirectoryW', 'GetFullPathNameW', 'CompareStringOrdinal', 'OpenProcessToken', 'GetTokenInformation', 'CreateWellKnownSid', 'SetEntriesInAclW', 'InitializeSecurityDescriptor', 'SetSecurityDescriptorOwner', 'SetSecurityDescriptorDacl', 'SetSecurityDescriptorControl', 'GetNamedSecurityInfoW']).has(native[1])) return { kind: 'win32', syscall: native[1], win32_code: Number(native[2]) }
  if (error instanceof TypeError) return { kind: 'type_error' }
  const code = error instanceof Error && 'code' in error && typeof error.code === 'string' && /^E[A-Z0-9_]+$/.test(error.code) ? error.code : undefined
  return { kind: 'unknown', ...(code ? { code } : {}) }
}
function aclObservation(security, path) {
  const user = security.currentUserSid(), system = 'S-1-5-18', administrators = 'S-1-5-32-544'
  const acl = security.getDaclAces(toNamespacedPath(path))
  fact(acl && typeof acl.ownerSid === 'string' && typeof acl.protected === 'boolean' && Array.isArray(acl.aces), 'control_acl_incomplete')
  fact(acl.aces.every(ace => [ace.type, ace.flags, ace.mask].every(Number.isSafeInteger) && (ace.sid === null || typeof ace.sid === 'string')), 'control_ace_incomplete')
  const trustees = new Set([user, system]), remaining = new Set(trustees), anonymous = new Map()
  const kind = sid => {
    if (sid === user) return 'current-user'
    if (sid === system) return 'system'
    if (sid === administrators) return 'administrators'
    if (sid === null) return 'null'
    if (!anonymous.has(sid)) anonymous.set(sid, `other-${anonymous.size + 1}`)
    return anonymous.get(sid)
  }
  let matching = true
  for (const ace of acl.aces) if (ace.sid === null || !remaining.delete(ace.sid)) matching = false
  return {
    sample_not_atomic: true, owner_kind: kind(acl.ownerSid), owner_matches_current_user: acl.ownerSid === user,
    protected: acl.protected, ace_count: acl.aces.length,
    aces: acl.aces.map(ace => ({ trustee_kind: kind(ace.sid), type: ace.type, flags: ace.flags, mask: ace.mask })),
    original_guard_predicates: {
      owner: acl.ownerSid === user, protected: acl.protected, count: acl.aces.length === trustees.size,
      trustees: matching && remaining.size === 0, type: acl.aces.every(ace => ace.type === 0),
      flags: acl.aces.every(ace => ace.flags === 3), mask: acl.aces.every(ace => ace.mask === 0x1f01ff)
    }
  }
}
export function extractCurrentModule(ts, text, original) {
  const source = ts.createSourceFile(accountFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  fact(source.parseDiagnostics.length === 0, 'control_current_source_parse')
  const imports = new Set(['node:fs/promises', 'node:path', '@orca/windows-security', 'zod', './private-posix-security'])
  const constants = new Set(['fullControl', 'systemSid', 'samePath'])
  const functions = new Set(['actualDirectory', 'security', 'createPrivateDirectory', 'initializePrivatePiRoot'])
  const selected = []
  for (const statement of source.statements) {
    let name
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && imports.delete(statement.moduleSpecifier.text)) name = `import:${statement.moduleSpecifier.text}`
    else if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
      const item = statement.declarationList.declarations[0]
      if (ts.isIdentifier(item.name) && constants.delete(item.name.text)) name = `constant:${item.name.text}`
    } else if (ts.isFunctionDeclaration(statement) && statement.name && functions.delete(statement.name.text)) name = `function:${statement.name.text}`
    if (name) selected.push({ name, raw: statement.getFullText(source) })
  }
  fact(imports.size === 0 && constants.size === 0 && functions.size === 0 && selected.length === 12, 'control_current_ast_shape')
  for (const name of ['constant:fullControl', 'constant:systemSid', 'constant:samePath', 'function:actualDirectory', 'function:security']) {
    fact(sha256(selected.find(item => item.name === name).raw) === original.segments.find(item => item.name === name).sha256, 'control_original_guard_changed')
  }
  const created = selected.find(item => item.name === 'function:createPrivateDirectory').raw
  const parsed = ts.createSourceFile('creation.ts', created, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let actualCalls = 0
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'createWindowsPrivateDirectory') actualCalls++
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  fact(actualCalls === 1, 'control_current_native_call_unavailable')
  return { text: selected.map(item => item.raw).join('\n') + '\nexport { security, actualDirectory }\n', segments: selected.map(item => ({ name: item.name, sha256: sha256(item.raw) })) }
}
export async function compileCurrent(esbuild, extracted, sourceRoot, runtimeRoot, tools, output) {
  const facade = `import{createRequire}from'node:module';const real=createRequire(${JSON.stringify(join(runtimeRoot, 'package.json'))})('@orca/windows-security');export const currentUserSid=real.currentUserSid,getDaclAces=real.getDaclAces,createPrivateDirectory=real.createPrivateDirectory,createFileWithDacl=real.createFileWithDacl;`
  const outfile = join(output, 'current-directory-consumer.cjs')
  await writeFile(join(output, 'current-directory-extracted.ts'), extracted.text, { flag: 'wx' })
  try {
    const built = await esbuild.build({
      stdin: { contents: extracted.text, loader: 'ts', sourcefile: 'current-directory-extracted.ts', resolveDir: join(sourceRoot, 'runtime/swa-orca/src') },
      outfile, bundle: true, platform: 'node', format: 'cjs', target: 'node24.21', logLevel: 'silent', absWorkingDir: tools,
      nodePaths: [join(tools, 'node_modules')], metafile: true,
      plugins: [{ name: 'actual-private-directory-native', setup(build) {
        build.onResolve({ filter: /^@orca\/windows-security$/ }, () => ({ path: 'real-native', namespace: 'control-native' }))
        build.onLoad({ filter: /.*/, namespace: 'control-native' }, () => ({ contents: facade, loader: 'js' }))
      } }]
    })
    await writeFile(join(output, 'current-compiler-inputs.json'), JSON.stringify(built.metafile) + '\n', { flag: 'wx' })
  } finally { await esbuild.stop() }
  return { outfile, sha256: sha256(await readFile(outfile)), stop_requested: true }
}
async function missing(path) {
  try { await lstat(path); return false } catch (error) { if (error?.code === 'ENOENT') return true; throw error }
}
async function main() {
  const result = {
    diagnostic_only: true, failed_source_revision: failedRevision, control_complete: false, probe_exit: 2,
    candidate_built: false, install_started: false, service_started: false, account_session_started: false, model_calls: 0,
    cases: [], historical_117_owner_and_aces: 'UNKNOWN', kernel_tree_exit_proven: false,
    path_coverage: 'canonical-realpath-and-lstat-symbolic-link-only'
  }
  let output
  try {
    const names = ['source-root', 'baseline-root', 'runtime-root', 'tool-runtime-root', 'data-root', 'output-dir', 'source-revision']
    const { values } = parseArgs({ options: Object.fromEntries(names.map(name => [name, { type: 'string' }])), strict: true, allowPositionals: false })
    fact(names.every(name => typeof values[name] === 'string') && Object.keys(values).length === names.length, 'control_arguments_invalid')
    fact(process.platform === 'win32' && process.arch === 'x64' && process.versions.node === '24.21.0', 'control_platform_changed')
    fact(/^[0-9a-f]{40}$/.test(values['source-revision']), 'control_revision_invalid')
    result.source_revision = values['source-revision']
    result.helper_sha256 = sha256(await readFile(fileURLToPath(import.meta.url)))
    const [sourceRoot, baselineRoot, runtimeRoot, tools, data] = await Promise.all(['source-root', 'baseline-root', 'runtime-root', 'tool-runtime-root', 'data-root'].map(name => plainDirectory(values[name])))
    fact(within(sourceRoot, tools), 'control_tools_outside_source')
    fact((await readdir(data)).length === 0, 'control_data_not_empty')
    for (const root of [sourceRoot, baselineRoot, runtimeRoot, tools]) fact(!within(root, data) && !within(data, root), 'control_data_overlap')
    output = resolve(values['output-dir'])
    fact(isAbsolute(values['output-dir']), 'control_output_not_absolute')
    await plainDirectory(dirname(output))
    for (const root of [sourceRoot, baselineRoot, runtimeRoot, tools, data]) fact(!within(root, output) && !within(output, root), 'control_output_overlap')
    await mkdir(output)
    const toolRequire = createRequire(join(tools, 'package.json'))
    const toolIdentity = {}
    for (const [name, version] of [['typescript', '6.0.3'], ['esbuild', '0.28.2'], ['zod', '4.6.5']]) {
      const file = await realpath(toolRequire.resolve(`${name}/package.json`))
      fact(within(sourceRoot, file), 'control_tool_outside_source')
      const bytes = await readFile(file)
      fact(JSON.parse(bytes).version === version, 'control_tool_version_changed')
      toolIdentity[name] = { version, package_sha256: sha256(bytes) }
    }
    const ts = toolRequire('typescript'), esbuild = toolRequire('esbuild')
    const original = extractOriginalModule(ts, await readFile(join(baselineRoot, accountFile), 'utf8'))
    original.text += '\nexport { security, actualDirectory }\n'
    const current = extractCurrentModule(ts, await readFile(join(sourceRoot, accountFile), 'utf8'), original)
    const runtimeRequire = createRequire(join(runtimeRoot, 'package.json')), native = runtimeRequire('@orca/windows-security')
    const index = await realpath(runtimeRequire.resolve('@orca/windows-security'))
    fact(within(runtimeRoot, index) && typeof native.createPrivateDirectory === 'function', 'control_native_unavailable')
    const nativeRoot = dirname(index), binary = await realpath(join(nativeRoot, 'build/Release/orca_windows_security.node'))
    fact(within(runtimeRoot, binary) && (await lstat(binary)).isFile(), 'control_binary_outside_runtime')
    const identities = {}
    for (const name of nativeFiles) {
      const sourceBytes = await readFile(join(sourceRoot, 'third_party/orca-v1.4.230/native/windows-security', name))
      const installedBytes = await readFile(join(nativeRoot, name))
      fact(sourceBytes.equals(installedBytes), 'control_native_source_changed')
      identities[name] = sha256(sourceBytes)
    }
    result.source_identity = { native: identities, binary_relative_path: relative(runtimeRoot, binary), binary_sha256: sha256(await readFile(binary)), tools: toolIdentity, original_segments: original.segments, current_segments: current.segments }
    const baselineOutput = join(output, 'baseline-compiler'), currentOutput = join(output, 'current-compiler')
    await mkdir(baselineOutput); await mkdir(currentOutput)
    const originalBuilt = await buildDiagnosticModule(esbuild, { extracted: original, sourceRoot: baselineRoot, toolRuntimeRoot: tools, runtimeRoot, outputDir: baselineOutput })
    const currentBuilt = await compileCurrent(esbuild, current, sourceRoot, runtimeRoot, tools, currentOutput)
    result.compiler = { baseline_stop_requested: originalBuilt.stop_requested, current_stop_requested: currentBuilt.stop_requested }
    const require = createRequire(import.meta.url), baseline = require(originalBuilt.outfile), consumer = require(currentBuilt.outfile)
    const fresh = join(data, 'fresh-directory')
    fact(native.createPrivateDirectory(toNamespacedPath(fresh)) === true, 'control_fresh_not_created')
    const observed = aclObservation(native, fresh)
    fact(Object.values(observed.original_guard_predicates).every(value => value === true), 'control_fresh_guard_predicates_failed')
    await baseline.actualDirectory(fresh); baseline.security(fresh, true)
    result.cases.push({ name: 'fresh_directory', returned: true, guard: 'PASS', observation: observed })
    const before = await snapshot(fresh, native)
    fact(native.createPrivateDirectory(toNamespacedPath(fresh)) === false, 'control_existing_directory_not_false')
    fact(isDeepStrictEqual(before, await snapshot(fresh, native)), 'control_existing_directory_modified')
    await baseline.actualDirectory(fresh); baseline.security(fresh, true)
    result.cases.push({ name: 'existing_private_directory', returned: false, unchanged: true, guard: 'PASS' })
    const existing = join(data, 'existing-ordinary-directory')
    await mkdir(existing)
    const existingBefore = await snapshot(existing, native)
    fact(native.createPrivateDirectory(toNamespacedPath(existing)) === false, 'control_existing_ordinary_not_false')
    fact(isDeepStrictEqual(existingBefore, await snapshot(existing, native)), 'control_existing_ordinary_modified')
    let existingGuard = 'PASS', existingError
    try { baseline.security(existing, true) } catch (error) { existingGuard = 'FAIL'; existingError = safeError(error); fact(existingError.kind === 'original_guard', 'control_existing_guard_unknown') }
    result.cases.push({ name: 'existing_ordinary_directory', returned: false, unchanged: true, guard: existingGuard, ...(existingError ? { error: existingError } : {}), observation: aclObservation(native, existing) })
    result.cases.at(-1).invalid_existing_directory_rejection = existingGuard === 'FAIL' ? 'PASS' : 'NOT_RUN'
    const file = join(data, 'public-license.txt')
    await writeFile(file, await readFile(join(sourceRoot, 'LICENSE')), { flag: 'wx' })
    const fileBefore = await snapshot(file, native)
    let fileReturned, fileError
    try { fileReturned = native.createPrivateDirectory(toNamespacedPath(file)); fact(fileReturned === false, 'control_existing_file_created') } catch (error) { fileError = safeError(error); fact(fileError.kind === 'win32', 'control_existing_file_error_unknown') }
    fact(isDeepStrictEqual(fileBefore, await snapshot(file, native)), 'control_existing_file_modified')
    let rejected = false
    try { await baseline.actualDirectory(file) } catch (error) { rejected = safeError(error).kind === 'original_guard' }
    fact(rejected, 'control_existing_file_type_accepted')
    result.cases.push({ name: 'existing_public_file', ...(fileError ? { error: fileError } : { returned: fileReturned }), unchanged: true, directory_type_rejected: true })
    const missingParent = join(data, 'missing-parent'), absent = join(missingParent, 'child')
    let missingError
    try { native.createPrivateDirectory(toNamespacedPath(absent)); fact(false, 'control_missing_parent_accepted') } catch (error) { missingError = safeError(error) }
    fact(missingError.kind === 'win32' && missingError.syscall === 'CreateDirectoryW' && missingError.win32_code === 3 && await missing(missingParent) && await missing(absent), 'control_missing_parent_not_rejected')
    result.cases.push({ name: 'missing_parent', error: missingError, no_directories_created: true })
    for (const [name, value] of [['empty', ''], ['nul', toNamespacedPath(join(data, 'invalid')) + '\0suffix'], ['relative', 'relative-private-directory']]) {
      let errorKind
      try { native.createPrivateDirectory(value) } catch (error) { errorKind = safeError(error).kind }
      fact(errorKind === 'type_error', 'control_invalid_path_not_rejected')
      result.cases.push({ name: `invalid_${name}`, error: { kind: errorKind } })
    }
    fact(await missing(join(process.cwd(), 'relative-private-directory')) && await missing(join(data, 'invalid')), 'control_invalid_path_created_target')
    const link = join(data, 'directory-junction')
    let linkAvailable = false, linkUnavailable
    try { await symlink(existing, link, 'junction'); linkAvailable = true } catch (error) { linkUnavailable = safeError(error); fact(['EPERM', 'EACCES', 'ENOTSUP'].includes(linkUnavailable.code), 'control_junction_preparation_unknown') }
    if (linkAvailable) {
      const targetBefore = await snapshot(existing, native)
      let linkReturned, linkError
      try { linkReturned = native.createPrivateDirectory(toNamespacedPath(link)); fact(linkReturned === false, 'control_existing_junction_created') }
      catch (error) { linkError = safeError(error); fact(linkError.kind === 'win32', 'control_existing_junction_error_unknown') }
      const linkedChild = join(link, 'must-not-create')
      let parentRejected = false
      try { await baseline.actualDirectory(dirname(linkedChild)) } catch (error) { parentRejected = safeError(error).kind === 'original_guard' }
      fact(parentRejected && await missing(join(existing, 'must-not-create')) && isDeepStrictEqual(targetBefore, await snapshot(existing, native)), 'control_junction_target_modified')
      result.cases.push({ name: 'actual_junction', ...(linkError ? { error: linkError } : { returned: linkReturned }), parent_guard_rejected: true, target_unchanged: true })
    } else result.cases.push({ name: 'actual_junction', status: 'NOT_RUN', reason: linkUnavailable })
    const consumerData = join(data, 'current-consumer-data')
    await mkdir(consumerData)
    process.env.SWA_DATA_DIR = consumerData
    fact(samePath(await consumer.initializePrivatePiRoot(), await realpath(consumerData)), 'control_current_consumer_return_changed')
    await consumer.actualDirectory(join(consumerData, 'pi')); consumer.security(join(consumerData, 'pi'), true)
    result.cases.push({ name: 'current_pi_consumer', guard: 'PASS', observation: aclObservation(native, join(consumerData, 'pi')) })
    result.control_complete = true
    result.probe_exit = 0
  } catch (error) { result.error = safeError(error) }
  if (output) {
    try { await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }) }
    catch (error) { result.control_complete = false; result.probe_exit = 2; result.error = { kind: 'evidence_write_failed', cause: safeError(error) } }
  }
  process.stdout.write(JSON.stringify({ diagnostic_only: true, control_complete: result.control_complete, probe_exit: result.probe_exit, ...(result.error ? { error: result.error } : {}) }) + '\n')
  process.exitCode = result.probe_exit
}
if (process.argv[1] && samePath(resolve(process.argv[1]), fileURLToPath(import.meta.url))) await main()
