import { execFileSync } from 'node:child_process'
import { copyFile, cp, lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { root } from './process.mjs'
import { slotSourceFiles } from '../third_party/orca-v1.4.230/config/scripts/orcad-prebuild-slot-contents.mjs'

export const nativePackages = ['node-pty', '@vscode/windows-process-tree', '@orca/windows-security', '@orca/windows-registry']

async function plainPath(path, directory) {
  const actual = await realpath(path), info = await lstat(path)
  if (actual.toLowerCase() !== resolve(path).toLowerCase() || info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) throw new Error('Native reuse requires an unredirected actual path: ' + path)
  return actual
}

async function equalFile(left, right) {
  await plainPath(left, false)
  await plainPath(right, false)
  return (await readFile(left)).equals(await readFile(right))
}

async function equalTree(left, right, ignored = new Set(), prefix = '') {
  await plainPath(left, true)
  await plainPath(right, true)
  const entries = async path => (await readdir(path)).filter(name => !ignored.has(prefix + name)).sort()
  const a = await entries(left), b = await entries(right)
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.log(JSON.stringify({ stage: 'native-input-files-differ', left, right, left_files: a, right_files: b }))
    return false
  }
  for (const name of a) {
    const source = join(left, name), target = join(right, name)
    const sourceInfo = await lstat(source), targetInfo = await lstat(target)
    if (sourceInfo.isSymbolicLink() || targetInfo.isSymbolicLink()) throw new Error('Native build input is redirected')
    if (sourceInfo.isDirectory() !== targetInfo.isDirectory()) return false
    if (sourceInfo.isDirectory() ? !await equalTree(source, target, ignored, prefix + name + '/') : !await equalFile(source, target)) {
      console.log(JSON.stringify({ stage: 'native-input-content-differs', source, target }))
      return false
    }
  }
  return true
}

export async function prepareNativeReuse({ candidate, work, evidence, node, python, gyp, msvsVersion }) {
  if (!['2022', '2026'].includes(msvsVersion)) throw new Error('The requested native reuse compiler year is unavailable')
  for (const path of [candidate, work, evidence]) if (!isAbsolute(path)) throw new Error('Native reuse sources must be explicit absolute paths')
  candidate = await plainPath(candidate, true)
  work = await plainPath(work, true)
  evidence = await plainPath(evidence, true)
  for (const path of [candidate, work, evidence]) {
    if (!isAbsolute(path)) throw new Error('Native reuse sources must be explicit absolute paths')
    await plainPath(path, true)
    const within = relative(await realpath(root), await realpath(path))
    if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('Native reuse sources must belong to this repository')
  }
  for (const path of [join(candidate, 'VERSION'), join(evidence, 'SOURCE'), join(evidence, 'build-exit.txt'), join(evidence, 'build.log')]) await plainPath(path, false)
  const revision = (await readFile(join(candidate, 'VERSION'), 'utf8')).trim()
  if (!/^[0-9a-f]{40}$/.test(revision) || (await readFile(join(evidence, 'SOURCE'), 'utf8')).trim() !== revision || (await readFile(join(evidence, 'build-exit.txt'), 'utf8')).trim() !== '0') throw new Error('Native reuse requires the exact successful source build')
  const log = await readFile(join(evidence, 'build.log'), 'utf8')
  const nodeVersion = execFileSync(node, ['--version'], { encoding: 'utf8', windowsHide: true }).trim().slice(1)
  const completed = { source_revision: revision, candidate, node: nodeVersion, native_modules_built: nativePackages }
  if (!log.includes(JSON.stringify(completed)) && !log.includes(JSON.stringify({ ...completed, native_modules_copied: [] }))) throw new Error('The successful build log does not prove this candidate was fully compiled')
  const git = path => execFileSync('git', ['show', `${revision}:${path}`], { cwd: root, encoding: 'utf8', windowsHide: true })
  const requireBuild = createRequire(join(root, 'runtime', 'swa-orca', 'package.json'))
  const ts = requireBuild('typescript')
  const sourceFunction = text => {
    const file = ts.createSourceFile('native.mjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const methods = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'buildNativePackage')
    if (methods.length !== 1) throw new Error('The actual native compiler function is unavailable')
    return methods[0].getText(file)
  }
  const compilerSettings = text => {
    const file = ts.createSourceFile('package.mjs', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const selected = []
    let literalMsvsVersion = null
    const visit = node => {
      if (ts.isBinaryExpression(node) && ts.isPropertyAccessExpression(node.left) && node.left.expression.getText(file) === 'environment' && ['CL', 'PATH', 'npm_config_msvs_version', 'npm_config_devdir'].includes(node.left.name.text)) {
        selected.push(node.getText(file))
        if (node.left.name.text === 'npm_config_msvs_version' && ts.isStringLiteral(node.right)) literalMsvsVersion = node.right.text
      }
      ts.forEachChild(node, visit)
    }
    visit(file)
    if (selected.length !== 4) throw new Error('The actual native compiler settings are unavailable')
    return { assignments: selected, literalMsvsVersion }
  }
  const pythonInfo = JSON.parse(execFileSync(python, ['-c', 'import json,sys; print(json.dumps({"executable":sys.executable,"version":list(sys.version_info[:3])}))'], { encoding: 'utf8', windowsHide: true }))
  const gypPackage = JSON.parse(await readFile(join(dirname(dirname(gyp)), 'package.json'), 'utf8'))
  const { parse } = requireBuild('yaml')
  const priorLock = parse(git('pnpm-lock.yaml')), currentLock = parse(await readFile(join(root, 'pnpm-lock.yaml'), 'utf8'))
  const { isDeepStrictEqual } = await import('node:util')
  const priorPackage = JSON.parse(git('runtime/swa-orca/package.json'))
  const priorGyp = priorPackage.devDependencies['node-gyp']
  if (!log.includes(`gyp info using node-gyp@${priorGyp}`) || !log.includes(JSON.stringify({ stage: 'native-python-preflight', executable: await realpath(python), version: pythonInfo.version.join('.') }))) throw new Error('The original native compiler provenance is unconfirmed')
  const priorSettings = compilerSettings(git('scripts/build-swa-package.mjs'))
  const declaredYears = ['2022', '2026'].filter(year => log.includes(JSON.stringify({ stage: 'native-msvc-options', CL: '/utf-8', msvs_version: year })))
  const actualYears = ['2022', '2026'].filter(year => log.includes('gyp info find VS using VS' + year + ' ('))
  const priorYear = declaredYears.length === 1 ? declaredYears[0] : declaredYears.length === 0 && priorSettings.literalMsvsVersion === '2022' && log.includes(JSON.stringify({ stage: 'native-msvc-options', CL: '/utf-8' })) ? '2022' : null
  if (!priorYear || actualYears.length !== 1 || actualYears[0] !== priorYear || priorSettings.literalMsvsVersion !== null && priorSettings.literalMsvsVersion !== priorYear) throw new Error('The original requested and actual Visual Studio provenance is unavailable or inconsistent')
  const gypInputs = (lock, version) => {
    const inputs = {}, pending = [`node-gyp@${version}`]
    while (pending.length) {
      const key = pending.pop()
      if (Object.hasOwn(inputs, key)) continue
      const snapshot = lock.snapshots[key]
      if (!snapshot) throw new Error('Native build dependency source is unavailable: ' + key)
      inputs[key] = { snapshot, package: lock.packages[key] }
      for (const [name, version] of Object.entries({ ...snapshot.dependencies, ...snapshot.optionalDependencies })) pending.push(`${name}@${version}`)
    }
    return inputs
  }
  const commonUnchanged = priorYear === msvsVersion && sourceFunction(git('scripts/build-swa-native.mjs')) === sourceFunction(await readFile(join(root, 'scripts/build-swa-native.mjs'), 'utf8')) && isDeepStrictEqual(priorSettings, compilerSettings(await readFile(join(root, 'scripts/build-swa-package.mjs'), 'utf8'))) && git('third_party/orca-v1.4.230/config/scripts/orcad-prebuild-slot-contents.mjs') === await readFile(join(root, 'third_party/orca-v1.4.230/config/scripts/orcad-prebuild-slot-contents.mjs'), 'utf8') && git('third_party/orca-v1.4.230/src/shared/node-runtime-pin.ts') === await readFile(join(root, 'third_party/orca-v1.4.230/src/shared/node-runtime-pin.ts'), 'utf8') && isDeepStrictEqual(gypInputs(priorLock, priorGyp), gypInputs(currentLock, gypPackage.version))
  if (!await equalFile(node, join(candidate, 'node', 'node.exe'))) throw new Error('Native reuse Node differs from the successful candidate')
  return { candidate, runtime: join(candidate, 'runtime'), work, evidence, revision, commonUnchanged, log }
}

export async function reuseNativePackage({ name, index, runtime, reuse }) {
  if (nativePackages[index] !== name) throw new Error('Unknown native package reuse')
  const installed = createRequire(join(runtime, 'package.json')), prior = createRequire(join(reuse.runtime, 'package.json'))
  const packageDir = await realpath(dirname(installed.resolve(name + '/package.json'))), priorDir = await realpath(dirname(prior.resolve(name + '/package.json')))
  const source = join(reuse.work, 'n' + index)
  const priorAddon = join(source, name === '@vscode/windows-process-tree' ? 'deps/node-addon-api' : 'node_modules/node-addon-api')
  const originalAddon = await realpath(dirname(createRequire(join(priorDir, 'package.json')).resolve('node-addon-api/package.json')))
  const currentAddon = await realpath(dirname(createRequire(join(packageDir, 'package.json')).resolve('node-addon-api/package.json')))
  for (const [owner, path] of [[runtime, packageDir], [reuse.runtime, priorDir], [runtime, currentAddon], [reuse.runtime, originalAddon], [reuse.work, priorAddon]]) {
    const within = relative(await realpath(owner), await realpath(path))
    if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('Native reuse input escaped its explicit owner')
  }
  const omitted = new Set(['build', 'node_modules', ...(name === '@vscode/windows-process-tree' ? ['deps'] : []), ...(name === 'node-pty' ? ['src/win/swa_provider_job.h'] : [])])
  const addonGenerated = new Set(['Release', 'node_addon_api.sln', ...['node_addon_api', 'node_addon_api_except', 'node_addon_api_maybe'].flatMap(name => [name + '.vcxproj', name + '.vcxproj.filters'])])
  if (!await equalTree(priorDir, source, omitted) || !await equalTree(originalAddon, priorAddon, addonGenerated)) throw new Error('The original native build sources differ from their successful package')
  const binary = ['conpty.node', 'windows_process_tree.node', 'orca_windows_security.node', 'orca_windows_registry.node'][index]
  const oldRelease = join(priorDir, 'build', 'Release'), original = join(source, 'build', 'Release', binary)
  if (!reuse.log.includes(JSON.stringify({ stage: 'native-module', name, source, analysisDirectory: join(reuse.work, 'a' + index), CL: '/utf-8', _CL_: '/analyze:log "' + join(reuse.work, 'a' + index) + '\\\\"' }))) throw new Error('The successful native build log does not associate this source directory')
  if (!await equalFile(original, join(oldRelease, binary))) throw new Error('The source candidate native binary differs from its original build')
  const assets = name === 'node-pty' ? slotSourceFiles({ platform: 'win32', arch: 'x64', buildDir: oldRelease, nodePtyDir: priorDir }) : [[binary, original]]
  for (const [file, asset] of assets) if (!await equalFile(join(oldRelease, file), asset)) throw new Error('The source native support asset differs from its original package')
  // 已知输入变化在复制之前选择原编译路径；缺件、来源不明或复制失配直接失败。
  const unchanged = reuse.commonUnchanged && await equalTree(packageDir, priorDir, new Set(['build', 'node_modules'])) && await equalTree(currentAddon, originalAddon)
  let headerUnchanged = true
  if (name === 'node-pty') {
    const originalHeader = await readFile(join(source, 'src/win/swa_provider_job.h'))
    if (!originalHeader.equals(execFileSync('git', ['show', `${reuse.revision}:third_party/orca-v1.4.230/native/swa-provider-job.h`], { cwd: root, windowsHide: true }))) throw new Error('The original Provider Job source differs from its recorded revision')
    headerUnchanged = await equalFile(join(root, 'third_party/orca-v1.4.230/native/swa-provider-job.h'), join(source, 'src/win/swa_provider_job.h'))
  }
  if (!unchanged || !headerUnchanged) {
    console.log(JSON.stringify({ stage: 'native-input-changed', name, source_revision: reuse.revision }))
    return false
  }
  const destination = join(packageDir, 'build', 'Release')
  await mkdir(destination, { recursive: true })
  for (const [file, asset] of assets) {
    const oldFile = join(oldRelease, file), target = join(destination, file)
    if (!await equalFile(oldFile, asset)) throw new Error('The source native support asset differs from its original package')
    await mkdir(dirname(target), { recursive: true })
    await copyFile(oldFile, target)
    if (!await equalFile(oldFile, target)) throw new Error('The copied native asset differs')
  }
  console.log(JSON.stringify({ stage: 'native-module-copied', name, source_revision: reuse.revision, source_candidate: reuse.candidate, original_work: source, original_build_evidence: reuse.evidence, binary: join(destination, binary) }))
  return true
}

export async function buildNativePackage({ name, index, runtime, work, node, nodeDir, python, gyp, environment }) {
  if (nativePackages[index] !== name) throw new Error('Unknown native package build')
  const installed = createRequire(join(runtime, 'package.json'))
  const packageDir = await realpath(dirname(installed.resolve(name + '/package.json')))
  const packageRelative = relative(await realpath(runtime), packageDir)
  if (!packageRelative || packageRelative.startsWith('..') || isAbsolute(packageRelative)) throw new Error('Native source escaped the controlled runtime')
  const source = join(work, 'n' + index), analysisDirectory = join(work, 'a' + index)
  await mkdir(source)
  await mkdir(analysisDirectory)
  for (const directory of [source, analysisDirectory]) {
    if ((await lstat(directory)).isSymbolicLink() || (await realpath(directory)).toLowerCase() !== resolve(directory).toLowerCase()) throw new Error('The native build directory is redirected')
  }
  // 原生编译完整保留默认跟踪与分析功能；源码、依赖和中间文件使用本次独占的短目录。
  await cp(packageDir, source, { recursive: true, dereference: true, filter: path => !['build', 'node_modules'].includes(relative(packageDir, path).split(/[\\/]/)[0]) })
  const addon = await realpath(dirname(createRequire(join(packageDir, 'package.json')).resolve('node-addon-api/package.json')))
  const addonDestination = name === '@vscode/windows-process-tree' ? join(source, 'deps', 'node-addon-api') : join(source, 'node_modules', 'node-addon-api')
  await mkdir(dirname(addonDestination), { recursive: true })
  await cp(addon, addonDestination, { recursive: true, dereference: true, errorOnExist: true, force: false })
  if (name === 'node-pty') await copyFile(join(root, 'third_party', 'orca-v1.4.230', 'native', 'swa-provider-job.h'), join(source, 'src', 'win', 'swa_provider_job.h'))
  const childEnvironment = { ...environment, CL: '/utf-8', _CL_: '/analyze:log "' + analysisDirectory + '\\\\"' }
  if (childEnvironment._CL_.length > 1024) throw new Error('The native compiler environment exceeds the MSVC limit')
  console.log(JSON.stringify({ stage: 'native-module', name, source, analysisDirectory, CL: childEnvironment.CL, _CL_: childEnvironment._CL_ }))
  execFileSync(node, [gyp, 'rebuild', '--python=' + python, '--arch=x64', '--jobs=4', '--nodedir=' + nodeDir], { cwd: source, env: childEnvironment, stdio: 'inherit', windowsHide: true, timeout: 20 * 60_000 })
  const buildDir = join(source, 'build', 'Release')
  const binary = ['conpty.node', 'windows_process_tree.node', 'orca_windows_security.node', 'orca_windows_registry.node'][index]
  if (!(await lstat(join(buildDir, binary))).isFile()) throw new Error('The actual native binary is missing')
  if (name === 'node-pty' && !(await lstat(join(analysisDirectory, 'conpty.nativecodeanalysis.xml'))).size) throw new Error('The actual ConPTY analysis log is missing')
  const pending = [join(source, 'build')]
  let maximumPathLength = 0, trackedFiles = 0
  while (pending.length) {
    for (const entry of await readdir(pending.pop(), { withFileTypes: true })) {
      const path = join(entry.parentPath, entry.name)
      maximumPathLength = Math.max(maximumPathLength, path.length)
      if (path.length >= 260) throw new Error('A native intermediate path exceeds MAX_PATH: ' + path)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.name.endsWith('.tlog')) trackedFiles++
    }
  }
  if (!trackedFiles) throw new Error('The actual native tracking logs are missing')
  const destination = join(packageDir, 'build', 'Release')
  await mkdir(destination, { recursive: true })
  await copyFile(join(buildDir, binary), join(destination, binary))
  if (name === 'node-pty') {
    for (const [file, fileSource] of slotSourceFiles({ platform: 'win32', arch: 'x64', buildDir: destination, nodePtyDir: packageDir })) {
      const target = join(destination, file)
      if (resolve(fileSource) === resolve(target)) continue
      await mkdir(dirname(target), { recursive: true })
      await copyFile(fileSource, target)
    }
  }
  console.log(JSON.stringify({ stage: 'native-module-built', name, binary: join(destination, binary), maximumPathLength, trackedFiles }))
}
