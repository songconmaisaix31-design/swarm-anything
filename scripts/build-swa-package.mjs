import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, copyFile, cp, lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { root, findGo } from './process.mjs'
import { NODE_RUNTIME_PIN, NODE_RUNTIME_ASSETS, nodeRuntimeReleaseUrl } from '../third_party/orca-v1.4.230/src/shared/node-runtime-pin.ts'
import { buildSWARuntime } from './build-swa-runtime.mjs'
import { buildNativePackage, nativePackages, prepareNativeReuse, reuseNativePackage } from './build-swa-native.mjs'
import { packageOptions, buildPython, checkWebAssets, copyWebLicenses, copyGoLicenses } from './swa-package-config.mjs'

const values = packageOptions()
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('This candidate targets Windows x64')
const pythonInfo = await buildPython(values.python)
const python = pythonInfo.executable
console.log(JSON.stringify({ stage: 'native-python-preflight', ...pythonInfo }))
const output = resolve(values.output), beneath = relative(join(root, 'dist'), output)
if (!beneath || beneath === '..' || beneath.startsWith('..\\') || isAbsolute(beneath)) throw new Error('Choose a new candidate directory inside dist')
if (values['native-source']) {
  const source = await realpath(values['native-source']), parent = await realpath(dirname(output)), target = join(parent, basename(output))
  if (!isAbsolute(values['native-source']) || source.toLowerCase() !== resolve(values['native-source']).toLowerCase() || (await lstat(values['native-source'])).isSymbolicLink()) throw new Error('The native source candidate is redirected')
  for (const [a, b] of [[source, target], [target, source]]) {
    const within = relative(a, b)
    if (!within || !within.startsWith('..') && !isAbsolute(within)) throw new Error('The native source and new candidate must not overlap')
  }
}
const pnpm = process.env.SWA_PNPM_CLI
if (!pnpm || !isAbsolute(pnpm)) throw new Error('SWA_PNPM_CLI must identify the installed pinned pnpm JavaScript entry')
await access(pnpm)
const runtimeSource = join(root, 'runtime', 'swa-orca')
const sourceRequire = createRequire(join(runtimeSource, 'package.json'))
const { unzipSync } = sourceRequire('fflate')
const gyp = sourceRequire.resolve('node-gyp/bin/node-gyp.js')
const taskWork = join(root, '.verification', 'swa-cli-headless-20261020')
const store = join(taskWork, 'pnpm-store')
await mkdir(store, { recursive: true })
if ((await lstat(store)).isSymbolicLink() || (await realpath(store)).toLowerCase() !== join(await realpath(root), '.verification', 'swa-cli-headless-20261020', 'pnpm-store').toLowerCase()) throw new Error('The private pnpm store is redirected')
const temporaryRoot = join(taskWork, 'build')
await mkdir(temporaryRoot, { recursive: true })
const work = await mkdtemp(join(temporaryRoot, 'candidate-'))
const temp = join(work, 'temp')
await mkdir(temp)
const environment = { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp, NODE_GYP_FORCE_PYTHON: python }
const run = (program, args, cwd = root) => execFileSync(program, args, { cwd, env: environment, stdio: 'inherit', windowsHide: true, timeout: 20 * 60_000 })
const capture = (program, args) => execFileSync(program, args, { cwd: root, env: environment, encoding: 'utf8', windowsHide: true, timeout: 60_000 }).trim()
if (capture(process.execPath, [pnpm, '--version']) !== '11.27.0') throw new Error('The build requires pnpm 11.27.0')
const revision = capture('git', ['rev-parse', 'HEAD'])
if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('Exact source revision is unavailable')
if (capture('git', ['status', '--porcelain', '--untracked-files=normal'])) throw new Error('Commit the candidate source before building the installable package')
run(process.execPath, [pnpm, 'typecheck:swa'])
const distribution = join(root, 'dist')
await mkdir(distribution, { recursive: true })
const actualDistribution = await realpath(distribution)
if ((await lstat(distribution)).isSymbolicLink() || actualDistribution.toLowerCase() !== join(await realpath(root), 'dist').toLowerCase()) throw new Error('The distribution root must be the actual repository directory')
const parent = await realpath(dirname(output)), parentRelative = relative(actualDistribution, parent)
if (parentRelative === '..' || parentRelative.startsWith('..\\') || isAbsolute(parentRelative)) throw new Error('The candidate parent escaped the actual distribution root')
// 只创建受控父目录；候选目录仍独占创建，已有路径立即失败。
await mkdir(output)
const runtime = join(output, 'runtime')
run(process.execPath, [pnpm, '--config.node-linker=hoisted', '--filter', '@swa/orca-runtime', '--prod', 'deploy', '--ignore-scripts', '--verify-store-integrity', runtime, '--store-dir', store])
const deployedRequire = createRequire(join(runtime, 'package.json'))
const processTreeDirectory = dirname(deployedRequire.resolve('@vscode/windows-process-tree/package.json'))
for (const [file, size, sha256] of [
  ['src/psutil-ntextapi.h', 19483, 'f706626568c9a152e98a4631182745ec47ecf4de6261f332703ce7d56fb5968e'],
  ['psutil-LICENSE', 1548, 'b89c063b3786e28e0c0a38f1931db61fed35e69dd2a2966fbecffee0f46c8d10'],
]) {
  const body = await readFile(join(processTreeDirectory, file))
  if (body.length !== size || createHash('sha256').update(body).digest('hex') !== sha256) throw new Error('Deployed psutil source differs: ' + file)
}
await buildSWARuntime(runtime)
const psutilLicenseDirectory = join(output, 'third-party-licenses', 'psutil@7.2.2')
await mkdir(psutilLicenseDirectory)
await copyFile(join(processTreeDirectory, 'psutil-LICENSE'), join(psutilLicenseDirectory, 'LICENSE'))
if (values.edition === 'combined') {
  run(process.execPath, [pnpm, '--dir', 'web', 'build', '--manifest'])
  await checkWebAssets(join(root, 'web', 'dist'))
  await cp(join(root, 'web', 'dist'), join(output, 'web'), { recursive: true, errorOnExist: true, force: false })
  await checkWebAssets(join(output, 'web'))
  await copyWebLicenses(join(root, 'web'), output, pnpm)
}
const metadata = join(output, 'metadata')
await mkdir(metadata)
for (const [source, target] of [['package.json', 'package.json'], ['web/package.json', 'web-package.json'], ['dependencies.lock.json', 'dependencies.lock.json'], ['pnpm-lock.yaml', 'pnpm-lock.yaml'], ['go.mod', 'go.mod'], ['go.sum', 'go.sum']]) await copyFile(join(root, source), join(metadata, target))
const nodeDirectory = join(output, 'node')
await mkdir(nodeDirectory)
const nodeAsset = NODE_RUNTIME_ASSETS['win32-x64']
if (!process.env.ProgramFiles || !isAbsolute(process.env.ProgramFiles)) throw new Error('The installed PowerShell location is unavailable')
const powershell = await realpath(join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe'))
const downloader = join(root, 'scripts', 'download-swa-node.ps1')
await access(downloader)

async function fetchPinned(file, expected, target) {
  if (values['node-inputs']) {
    const inputRoot = await realpath(values['node-inputs'])
    const inputRelative = relative(await realpath(taskWork), inputRoot)
    if (!inputRelative || inputRelative.startsWith('..') || isAbsolute(inputRelative)) throw new Error('Reusable Node inputs must belong to this task')
    const source = file === NODE_RUNTIME_PIN.windowsImportLibs['win32-x64'].file ? join(inputRoot, 'headers', `node-v${NODE_RUNTIME_PIN.version}`, 'Release', 'node.lib') : join(inputRoot, file)
    if (createHash('sha256').update(await readFile(source)).digest('hex') !== expected) throw new Error('Reusable pinned Node input differs: ' + file)
    await copyFile(source, target)
  } else {
    execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-File', downloader, '-Uri', nodeRuntimeReleaseUrl('official', file), '-WorkDirectory', work, '-OutputFile', target], { cwd: root, env: environment, stdio: 'inherit', windowsHide: true, timeout: 10 * 60_000 })
  }
  const body = await readFile(target)
  if (createHash('sha256').update(body).digest('hex') !== expected) throw new Error(`Pinned Node input differs: ${file}`)
  return body
}

const archive = await fetchPinned(nodeAsset.archive, nodeAsset.archiveSha256, join(work, nodeAsset.archive))
const top = `node-v${NODE_RUNTIME_PIN.version}-win-x64`
const selected = unzipSync(archive, { filter: file => file.name === `${top}/node.exe` || file.name === `${top}/LICENSE` })
const executable = selected[`${top}/node.exe`]
if (!executable || executable.length !== nodeAsset.executableSize || createHash('sha256').update(executable).digest('hex') !== nodeAsset.executableSha256) throw new Error('Pinned Node executable differs')
if (!selected[`${top}/LICENSE`]) throw new Error('Pinned Node license is missing')
const node = join(nodeDirectory, 'node.exe')
await writeFile(node, executable, { flag: 'wx' })
await writeFile(join(nodeDirectory, 'LICENSE'), selected[`${top}/LICENSE`], { flag: 'wx' })
if (capture(node, ['--version']) !== 'v' + NODE_RUNTIME_PIN.version) throw new Error('Installed Node version differs from its pin')
const headers = join(work, NODE_RUNTIME_PIN.headers.file)
await fetchPinned(NODE_RUNTIME_PIN.headers.file, NODE_RUNTIME_PIN.headers.sha256, headers)
const headerRoot = join(work, 'headers')
await mkdir(headerRoot)
run(join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-xzf', headers, '-C', headerRoot])
const nodeDir = join(headerRoot, `node-v${NODE_RUNTIME_PIN.version}`)
await mkdir(join(nodeDir, 'Release'))
const library = NODE_RUNTIME_PIN.windowsImportLibs['win32-x64']
await fetchPinned(library.file, library.sha256, join(nodeDir, 'Release', 'node.lib'))
const pathKeys = Object.keys(environment).filter(key => key.toLowerCase() === 'path')
if (pathKeys.length !== 1 || typeof environment[pathKeys[0]] !== 'string') throw new Error('The native build requires one actual PATH environment key')
const previousPath = environment[pathKeys[0]]
delete environment[pathKeys[0]]
environment.PATH = nodeDirectory + ';' + previousPath
const msvsVersion = values['msvs-version'] ?? '2022'
environment.npm_config_msvs_version = msvsVersion
const effectiveGyp = JSON.parse(capture(node, ['-e', 'const gyp=require(process.argv[1])();gyp.parseArgv([process.execPath,process.argv[2],"rebuild"]);console.log(JSON.stringify({msvs_version:gyp.opts["msvs-version"]}))', sourceRequire.resolve('node-gyp/lib/node-gyp.js'), gyp]))
if (effectiveGyp.msvs_version !== msvsVersion) throw new Error('The effective node-gyp MSVC selection conflicts with the requested compiler year')
environment.npm_config_devdir = join(work, 'gyp-cache')
// 原生源码使用UTF-8；编译参数只作用于本候选的子进程。
for (const key of Object.keys(environment)) if (/^(?:CL|_CL_)$/i.test(key)) delete environment[key]
environment.CL = '/utf-8'
console.log(JSON.stringify({ stage: 'native-msvc-options', CL: environment.CL, msvs_version: msvsVersion }))
const reuse = values['native-source'] ? await prepareNativeReuse({ candidate: values['native-source'], work: values['native-work'], evidence: values['native-evidence'], node, python, gyp, msvsVersion }) : null
const built = [], copied = []
for (const [index, name] of nativePackages.entries()) {
  if (reuse && await reuseNativePackage({ name, index, runtime, reuse })) { copied.push(name); continue }
  await buildNativePackage({ name, index, runtime, work, node, nodeDir, python, gyp, environment })
  built.push(name)
}
delete environment._CL_
const go = await findGo()
for (const [name, entry] of [['swa.exe', './cmd/swa'], ['server.exe', './cmd/swa-server']]) {
  const args = ['build', '-mod=readonly', '-p=4', '-trimpath']
  if (name === 'swa.exe') args.push('-ldflags=-X main.version=' + revision)
  run(go, [...args, '-o', join(output, name), entry])
}
run(go, ['build', '-mod=readonly', '-p=4', '-trimpath', '-o', join(runtime, 'controller-fault.exe'), './tests/swa-cli-headless/controller-fault'])
run(go, ['build', '-mod=readonly', '-p=4', '-trimpath', '-o', join(runtime, 'cli-fault-control.exe'), './tests/swa-cli-headless/cli-fault-control'])
console.log(JSON.stringify({ stage: 'go-licenses', ...await copyGoLicenses(go, [join(output, 'swa.exe'), join(output, 'server.exe')], output) }))
for (const [source, target] of [['LICENSE', 'LICENSE'], ['THIRD_PARTY_SWA.md', 'THIRD_PARTY_SWA.md'], ['third_party/orca-v1.4.230/LICENSE', 'ORCA_LICENSE'], ['scripts/install-swa.ps1', 'install-swa.ps1'], ['runtime/swa-orca/USAGE.md', 'USAGE.md']]) await copyFile(join(root, source), join(output, target))
await mkdir(join(output, 'scripts'))
for (const file of ['check-swa-runtime.mjs', 'swa-package-config.mjs']) await copyFile(join(root, 'scripts', file), join(output, 'scripts', file))
const pinDirectory = join(output, 'third_party', 'orca-v1.4.230', 'src', 'shared')
await mkdir(pinDirectory, { recursive: true })
await copyFile(join(root, 'third_party', 'orca-v1.4.230', 'src', 'shared', 'node-runtime-pin.ts'), join(pinDirectory, 'node-runtime-pin.ts'))
if (capture('git', ['rev-parse', 'HEAD']) !== revision || capture('git', ['status', '--porcelain', '--untracked-files=normal'])) throw new Error('The candidate source changed while building; retain this incomplete output for inspection')
await writeFile(join(output, 'VERSION'), revision + '\n', { flag: 'wx' })
await writeFile(join(output, 'EDITION'), values.edition + '\n', { flag: 'wx' })
await writeFile(join(output, 'PLATFORM'), 'win32-x64\n', { flag: 'wx' })
run(node, [join(root, 'scripts', 'check-swa-runtime.mjs'), '--candidate', output])
console.log(JSON.stringify({ stage: 'candidate-edition', edition: values.edition }))
console.log(JSON.stringify({ source_revision: revision, candidate: output, node: NODE_RUNTIME_PIN.version, native_modules_built: built, native_modules_copied: copied }))
