import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { lstatSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, toNamespacedPath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const failedRevision = '11717767f82a8a4070351ff74674aa0d268f79b2'
const originalFiles = {
  account: {
    path: 'runtime/swa-orca/src/private-pi-account.ts',
    sha256: 'db8d82e8a72accf17b67d7dd5cfb288efed79a2165f052907e511039b612b083',
    git_blob: 'eafb3f3f0c6bbb4a36d42af84adb38a6c6200484'
  },
  posix: {
    path: 'runtime/swa-orca/src/private-posix-security.ts',
    sha256: '3dc4a6c4f4d78d1bda4af37617cb02c11f09b037e5f9d7e6fce9c59c5f0ec9dc',
    git_blob: '0a2a8bea55b968a5b8e784407b0b91ba9b9398c4'
  },
  windows: {
    path: 'third_party/orca-v1.4.230/native/windows-security/index.js',
    sha256: '9140efddddfbd53db91f22f3a67d0373155c20c3c953d00669e49259d736a317',
    git_blob: 'd3b70ff3bba9dc88707c0262a7a453be743f2970'
  }
}
const expectedStages = ['after_original_mkdir_before_dacl', 'after_original_set_dacl', 'after_original_security_guard']
const fullControl = 0x1f01ff
const systemSid = 'S-1-5-18'
const administratorsSid = 'S-1-5-32-544'
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
const samePath = (left, right) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right

class PreconditionError extends Error {}
function requireFact(condition, code) {
  if (!condition) throw new PreconditionError(code)
}

function contained(root, candidate) {
  const child = relative(root, candidate)
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`))
}

async function plainDirectory(path) {
  requireFact(isAbsolute(path), 'diagnostic_path_not_absolute')
  const canonical = await realpath(path)
  requireFact(samePath(canonical, resolve(path)), 'diagnostic_path_redirected')
  for (let ancestor = resolve(path); ; ancestor = dirname(ancestor)) {
    const info = await lstat(ancestor)
    requireFact(info.isDirectory() && !info.isSymbolicLink(), 'diagnostic_path_not_plain_directory')
    requireFact(samePath(await realpath(ancestor), ancestor), 'diagnostic_ancestor_redirected')
    if (dirname(ancestor) === ancestor) return canonical
  }
}

async function regularFile(path) {
  const info = await lstat(path)
  requireFact(info.isFile() && !info.isSymbolicLink(), 'diagnostic_file_not_plain')
  const canonical = await realpath(path)
  requireFact(samePath(canonical, resolve(path)), 'diagnostic_file_redirected')
  return canonical
}

async function fixedSource(sourceRoot, descriptor) {
  const path = join(sourceRoot, descriptor.path)
  await regularFile(path)
  const bytes = await readFile(path)
  requireFact(sha256(bytes) === descriptor.sha256 && gitBlob(bytes) === descriptor.git_blob, 'diagnostic_original_source_changed')
  return bytes.toString('utf8')
}

// 原生产调用也消费此提取结果；Linux只读检查可复用它核原文，不执行Windows函数。
export function extractOriginalModule(ts, text) {
  requireFact(sha256(Buffer.from(text)) === originalFiles.account.sha256, 'diagnostic_original_source_changed')
  const source = ts.createSourceFile(originalFiles.account.path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  requireFact(source.parseDiagnostics.length === 0, 'diagnostic_original_source_parse_failed')
  const imports = new Set(['node:fs/promises', 'node:path', '@orca/windows-security', 'zod', './private-posix-security'])
  const constants = new Set(['fullControl', 'systemSid', 'samePath'])
  const functions = new Set(['actualDirectory', 'security', 'createPrivateDirectory', 'initializePrivatePiRoot'])
  const segments = []
  for (const statement of source.statements) {
    let name
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && imports.has(statement.moduleSpecifier.text)) {
      name = `import:${statement.moduleSpecifier.text}`
      imports.delete(statement.moduleSpecifier.text)
    } else if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
      const declaration = statement.declarationList.declarations[0]
      if (ts.isIdentifier(declaration.name) && constants.has(declaration.name.text)) {
        name = `constant:${declaration.name.text}`
        constants.delete(declaration.name.text)
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name && functions.has(statement.name.text)) {
      name = `function:${statement.name.text}`
      functions.delete(statement.name.text)
    }
    if (name) {
      const raw = statement.getFullText(source)
      segments.push({ name, start: statement.getFullStart(), end: statement.end, sha256: sha256(raw), raw })
    }
  }
  requireFact(imports.size === 0 && constants.size === 0 && functions.size === 0 && segments.length === 12, 'diagnostic_original_ast_shape_changed')
  return {
    text: segments.map(segment => segment.raw).join('\n') + '\nexport { installMetadataObserver, observerFailureCount } from "@orca/windows-security"\n',
    segments: segments.map(({ raw, ...identity }) => identity)
  }
}

function facadeSource(runtimePackage) {
  return `import { createRequire } from 'node:module'
const real = createRequire(${JSON.stringify(runtimePackage)})('@orca/windows-security')
let observer = null
let failures = 0
export function installMetadataObserver(value) { observer = value }
export function observerFailureCount() { return failures }
function observe(stage, path) {
  try { observer(stage, path) } catch { failures++ }
}
export const currentUserSid = (...args) => real.currentUserSid(...args)
export const getDaclAces = (...args) => real.getDaclAces(...args)
export const createFileWithDacl = (...args) => real.createFileWithDacl(...args)
export function setDaclSddl(...args) {
  observe('after_original_mkdir_before_dacl', args[0])
  const value = real.setDaclSddl(...args)
  observe('after_original_set_dacl', args[0])
  return value
}
`
}

export async function buildDiagnosticModule(esbuild, options) {
  const { extracted, sourceRoot, toolRuntimeRoot, runtimeRoot, outputDir } = options
  const facade = facadeSource(join(runtimeRoot, 'package.json'))
  const outfile = join(outputDir, 'original-pi-diagnostic.cjs')
  await writeFile(join(outputDir, 'original-pi-extracted.ts'), extracted.text, { flag: 'wx' })
  await writeFile(join(outputDir, 'windows-security-observer.mjs'), facade, { flag: 'wx' })
  try {
    await esbuild.build({
      stdin: { contents: extracted.text, loader: 'ts', sourcefile: 'original-pi-extracted.ts', resolveDir: join(sourceRoot, 'runtime/swa-orca/src') },
      outfile, bundle: true, platform: 'node', format: 'cjs', target: 'node24.21', logLevel: 'silent',
      absWorkingDir: toolRuntimeRoot, nodePaths: [join(toolRuntimeRoot, 'node_modules')],
      plugins: [{
        name: 'real-windows-security-metadata-observer',
        setup(build) {
          build.onResolve({ filter: /^@orca\/windows-security$/ }, () => ({ path: 'real-addon-observer', namespace: 'diagnostic-observer' }))
          build.onLoad({ filter: /.*/, namespace: 'diagnostic-observer' }, () => ({ contents: facade, loader: 'js' }))
        }
      }], metafile: true
    }).then(async result => {
      await writeFile(join(outputDir, 'compiler-inputs.json'), JSON.stringify(result.metafile, null, 2) + '\n', { flag: 'wx' })
    })
  } finally {
    // 官方API请求停止真实编译器；此调用不作为整个进程树退出证明。
    await esbuild.stop()
  }
  return { outfile, sha256: sha256(await readFile(outfile)), stop_requested: true }
}

function safeError(error) {
  const message = error instanceof Error ? error.message : ''
  if (error instanceof PreconditionError && /^diagnostic_[a-z_]+$/.test(message)) return { kind: 'precondition', code: message }
  if (/^private_pi_(directory_redirected|security_unavailable|security_changed|directory_not_empty)$/.test(message)) return { kind: 'original_guard', code: message }
  const native = /^(ConvertStringSecurityDescriptorToSecurityDescriptorW|GetSecurityDescriptorControl|GetSecurityDescriptorDacl|SetNamedSecurityInfoW|GetNamedSecurityInfoW|GetTokenInformation|OpenProcessToken) failed with Win32 error ([0-9]+)$/.exec(message)
  if (native) return { kind: 'win32', syscall: native[1], win32_code: Number(native[2]) }
  const code = error instanceof Error && 'code' in error && typeof error.code === 'string' && /^E[A-Z0-9_]+$/.test(error.code) ? error.code : undefined
  return { kind: 'unknown', ...(code ? { code } : {}) }
}

function metadataObserver(realSecurity, expectedPath, userSid, observations) {
  const anonymous = new Map()
  const trusteeKind = sid => {
    if (sid === userSid) return 'current-user'
    if (sid === systemSid) return 'system'
    if (sid === administratorsSid) return 'administrators'
    if (sid === null) return 'null'
    if (!anonymous.has(sid)) anonymous.set(sid, `other-${anonymous.size + 1}`)
    return anonymous.get(sid)
  }
  return (stage, path) => {
    const observation = { stage, status: 'UNKNOWN', sample_not_atomic: true }
    observations.push(observation)
    try {
      requireFact(samePath(toNamespacedPath(resolve(path)), toNamespacedPath(expectedPath)), 'diagnostic_observed_path_changed')
      const info = lstatSync(path)
      const plain = info.isDirectory() && !info.isSymbolicLink() && samePath(toNamespacedPath(realpathSync(path)), toNamespacedPath(expectedPath))
      observation.exists = true
      observation.plain_directory = plain
      requireFact(plain, 'diagnostic_observed_directory_not_plain')
      const acl = realSecurity.getDaclAces(toNamespacedPath(path))
      requireFact(acl && typeof acl.ownerSid === 'string' && typeof acl.protected === 'boolean' && Array.isArray(acl.aces), 'diagnostic_acl_metadata_incomplete')
      requireFact(acl.aces.every(ace => (ace.sid === null || typeof ace.sid === 'string') && [ace.type, ace.flags, ace.mask].every(Number.isSafeInteger)), 'diagnostic_ace_metadata_incomplete')
      const expectedTrustees = new Set([userSid, systemSid])
      let trusteesMatch = true
      for (const ace of acl.aces) if (ace.sid === null || !expectedTrustees.delete(ace.sid)) trusteesMatch = false
      trusteesMatch = trusteesMatch && expectedTrustees.size === 0
      Object.assign(observation, {
        status: 'OBSERVED', owner_kind: trusteeKind(acl.ownerSid), owner_matches_current_user: acl.ownerSid === userSid,
        protected: acl.protected, ace_count: acl.aces.length,
        aces: acl.aces.map(ace => ({ trustee_kind: trusteeKind(ace.sid), type: ace.type, flags: ace.flags, mask: ace.mask })),
        original_guard_predicates: {
          owner: acl.ownerSid === userSid, protected: acl.protected,
          count: acl.aces.length === new Set([userSid, systemSid]).size, trustees: trusteesMatch,
          type: acl.aces.every(ace => ace.type === 0), flags: acl.aces.every(ace => ace.flags === 3),
          mask: acl.aces.every(ace => ace.mask === fullControl)
        }
      })
    } catch (error) {
      observation.error = safeError(error)
    }
  }
}

async function toolIdentity(toolRequire, name, version, sourceRoot) {
  const packageFile = toolRequire.resolve(`${name}/package.json`)
  const canonical = await realpath(packageFile)
  requireFact(contained(sourceRoot, canonical), 'diagnostic_tool_outside_original_source')
  const bytes = await readFile(canonical)
  requireFact(JSON.parse(bytes).version === version, 'diagnostic_tool_version_changed')
  const entry = await realpath(toolRequire.resolve(name))
  requireFact(contained(sourceRoot, entry), 'diagnostic_tool_outside_original_source')
  return { version, package_sha256: sha256(bytes), entry_sha256: sha256(await readFile(entry)) }
}

async function main() {
  const result = {
    diagnostic_only: true, failed_source_revision: failedRevision,
    candidate_built: false, install_started: false, service_started: false, account_session_started: false, model_calls: 0,
    diagnostic_complete: false, original_function_result: 'NOT_RUN', probe_exit: 2, observations: [],
    limitations: ['original_117_owner_and_aces_not_recorded', 'new_local_directory_metadata_only', 'no_service_or_account_or_model_validation', 'compiler_stop_is_not_kernel_tree_exit_proof']
  }
  let outputDir
  try {
    const { values } = parseArgs({ options: Object.fromEntries(['source-root', 'runtime-root', 'tool-runtime-root', 'data-root', 'output-dir'].map(name => [name, { type: 'string' }])), strict: true, allowPositionals: false })
    requireFact(Object.keys(values).length === 5 && Object.values(values).every(value => typeof value === 'string' && isAbsolute(value)), 'diagnostic_arguments_invalid')
    requireFact(process.platform === 'win32' && process.arch === 'x64' && process.versions.node === '24.21.0', 'diagnostic_platform_or_node_version_changed')
    const sourceRoot = await plainDirectory(values['source-root'])
    const runtimeRoot = await plainDirectory(values['runtime-root'])
    const toolRuntimeRoot = await plainDirectory(values['tool-runtime-root'])
    const dataRoot = await plainDirectory(values['data-root'])
    requireFact(contained(sourceRoot, toolRuntimeRoot), 'diagnostic_tool_root_outside_source')
    requireFact((await readdir(dataRoot)).length === 0, 'diagnostic_data_root_not_empty')
    for (const root of [sourceRoot, runtimeRoot, toolRuntimeRoot]) requireFact(!contained(root, dataRoot) && !contained(dataRoot, root), 'diagnostic_data_root_overlaps_inputs')
    const proposedOutput = resolve(values['output-dir'])
    await plainDirectory(dirname(proposedOutput))
    for (const root of [sourceRoot, runtimeRoot, toolRuntimeRoot, dataRoot]) requireFact(!contained(root, proposedOutput) && !contained(proposedOutput, root), 'diagnostic_output_overlaps_inputs')
    await mkdir(proposedOutput)
    outputDir = proposedOutput
    result.observation_revision = { helper_sha256: sha256(await readFile(fileURLToPath(import.meta.url))) }
    result.node = { version: process.versions.node, arch: process.arch, executable_sha256: sha256(await readFile(await regularFile(process.execPath))) }
    const accountText = await fixedSource(sourceRoot, originalFiles.account)
    await fixedSource(sourceRoot, originalFiles.posix)
    await fixedSource(sourceRoot, originalFiles.windows)
    result.original_sources = originalFiles
    const runtimePackage = await regularFile(join(runtimeRoot, 'package.json'))
    const toolPackage = await regularFile(join(toolRuntimeRoot, 'package.json'))
    const runtimeRequire = createRequire(runtimePackage)
    const toolRequire = createRequire(toolPackage)
    result.tools = {
      typescript: await toolIdentity(toolRequire, 'typescript', '6.0.3', sourceRoot),
      esbuild: await toolIdentity(toolRequire, 'esbuild', '0.28.2', sourceRoot),
      zod: await toolIdentity(toolRequire, 'zod', '4.6.5', sourceRoot)
    }
    const index = await regularFile(runtimeRequire.resolve('@orca/windows-security'))
    requireFact(contained(runtimeRoot, index) && sha256(await readFile(index)) === originalFiles.windows.sha256, 'diagnostic_real_native_index_changed')
    const addon = await regularFile(join(dirname(index), 'build/Release/orca_windows_security.node'))
    requireFact(contained(runtimeRoot, addon), 'diagnostic_native_outside_runtime')
    result.native = { package_index_sha256: sha256(await readFile(index)), addon_sha256: sha256(await readFile(addon)), rebuilt_from_fixed_source: true }
    const extracted = extractOriginalModule(toolRequire('typescript'), accountText)
    result.original_segments = extracted.segments
    const compiled = await buildDiagnosticModule(toolRequire('esbuild'), { extracted, sourceRoot, toolRuntimeRoot, runtimeRoot, outputDir })
    result.compiler = { module_sha256: compiled.sha256, stop_requested: compiled.stop_requested }
    const realSecurity = runtimeRequire('@orca/windows-security')
    const userSid = realSecurity.currentUserSid()
    requireFact(typeof userSid === 'string' && userSid.length > 0, 'diagnostic_current_user_identity_unavailable')
    const piPath = join(dataRoot, 'pi')
    const observe = metadataObserver(realSecurity, piPath, userSid, result.observations)
    const diagnosticModule = createRequire(import.meta.url)(compiled.outfile)
    diagnosticModule.installMetadataObserver(observe)
    process.env.SWA_DATA_DIR = dataRoot
    let returned
    try {
      returned = await diagnosticModule.initializePrivatePiRoot()
      result.original_function_result = 'PASS'
    } catch (error) {
      result.original_function_result = 'FAIL'
      result.original_error = safeError(error)
    }
    observe('after_original_security_guard', piPath)
    result.observer_callback_failures = diagnosticModule.observerFailureCount()
    result.original_result_classified = result.original_function_result === 'PASS' ? samePath(returned, dataRoot) : ['original_guard', 'win32'].includes(result.original_error.kind)
    result.diagnostic_complete = result.original_result_classified && result.observer_callback_failures === 0 && result.observations.length === 3 && result.observations.every((observation, index) => observation.stage === expectedStages[index] && observation.status === 'OBSERVED')
    result.probe_exit = result.original_function_result === 'FAIL' ? 1 : result.diagnostic_complete ? 0 : 3
  } catch (error) {
    result.error = safeError(error)
    result.probe_exit = 2
  }
  if (outputDir) {
    try {
      await writeFile(join(outputDir, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
    } catch (error) {
      result.diagnostic_complete = false
      result.probe_exit = 2
      result.error = { kind: 'evidence_write_failed', cause: safeError(error) }
    }
  }
  process.stdout.write(JSON.stringify({ diagnostic_only: true, original_function_result: result.original_function_result, diagnostic_complete: result.diagnostic_complete, probe_exit: result.probe_exit, ...(result.error ? { error: result.error } : {}) }) + '\n')
  process.exitCode = result.probe_exit
}

if (process.argv[1] && samePath(resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  await main()
}
