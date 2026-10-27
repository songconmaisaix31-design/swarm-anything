import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, chmod, copyFile, cp, lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { root, findGo } from './process.mjs'
import { packageOptions, buildPython, checkWebAssets, copyWebLicenses, copyGoLicenses } from './swa-package-config.mjs'
import { buildSWARuntime } from './build-swa-runtime.mjs'
import { NODE_RUNTIME_ASSETS, NODE_RUNTIME_PIN, nodeRuntimeReleaseUrl } from '../third_party/orca-v1.4.230/src/shared/node-runtime-pin.ts'
import { findPostBaselineNodeApiNames, prebuildCompileGypi, SLOT_NAPI_VERSION, slotSourceFiles } from '../third_party/orca-v1.4.230/config/scripts/orcad-prebuild-slot-contents.mjs'
import { currentTarget } from '../third_party/orca-v1.4.230/config/scripts/server-build-target.mjs'
import linuxFloor from '../third_party/orca-v1.4.230/config/scripts/verify-linux-glibc-floor.cjs'

const values = packageOptions(), target = currentTarget()
if (target !== 'linux-x64-glibc') throw new Error('Linux SWA packaging currently requires native Linux x64 glibc')
if (values['msvs-version'] !== undefined) throw new Error('The Windows --msvs-version option does not apply to Linux')
if (values['native-source'] || values['node-inputs']) throw new Error('Linux uses hash-verified pinned cache inputs and a fresh native build; Windows reuse options are not applicable')
const output = resolve(values.output), inside = relative(join(root, 'dist'), output)
if (!inside || inside === '..' || inside.startsWith('../') || isAbsolute(inside)) throw new Error('Choose a new candidate directory inside dist')
const pnpm = process.env.SWA_PNPM_CLI
if (!pnpm || !isAbsolute(pnpm)) throw new Error('SWA_PNPM_CLI must identify the installed pinned pnpm JavaScript entry')
await access(pnpm)
const python = await buildPython(values.python)
const task = join(root, '.verification', 'swa-linux'), cache = join(task, 'cache')
await mkdir(cache, { recursive: true, mode: 0o700 })
const work = await mkdtemp(join(task, 'build-')), temporary = join(work, 'tmp')
await mkdir(temporary, { mode: 0o700 })
const environment = { ...process.env, TEMP: temporary, TMP: temporary, TMPDIR: temporary, NODE_GYP_FORCE_PYTHON: python.executable }
const run = (program, args, cwd = root) => execFileSync(program, args, { cwd, env: environment, stdio: 'inherit', timeout: 20 * 60_000 })
const capture = (program, args) => execFileSync(program, args, { cwd: root, env: environment, encoding: 'utf8', timeout: 60_000 }).trim()
const revision = capture('git', ['rev-parse', 'HEAD'])
if (!/^[a-f0-9]{40}$/.test(revision) || capture('git', ['status', '--porcelain', '--untracked-files=normal'])) throw new Error('Commit and freeze the exact candidate source before building')
if (capture(process.execPath, [pnpm, '--version']) !== '11.27.0') throw new Error('The build requires pnpm 11.27.0')
console.log(JSON.stringify({ stage: 'linux-toolchain', target, source_revision: revision, python, gcc: capture('gcc', ['--version']).split('\n')[0], gxx: capture('g++', ['--version']).split('\n')[0], work }))
run(process.execPath, [pnpm, 'typecheck:swa'])
await mkdir(join(root, 'dist'), { recursive: true })
if ((await lstat(join(root, 'dist'))).isSymbolicLink() || await realpath(dirname(output)) !== dirname(output)) throw new Error('The output directory is redirected')
await mkdir(output, { mode: 0o700 })
const runtime = join(output, 'runtime')
run(process.execPath, [pnpm, '--config.node-linker=hoisted', '--config.prefer-symlinked-executables=false', '--config.extend-node-path=false', '--filter', '@swa/orca-runtime', '--prod', 'deploy', '--ignore-scripts', '--verify-store-integrity', runtime, '--store-dir', join(task, 'store')])
await buildSWARuntime(runtime)

async function pinned(file, expected) {
  const destination = join(cache, file), partial = destination + '.partial-' + process.pid
  try {
    await access(destination)
    if (createHash('sha256').update(await readFile(destination)).digest('hex') !== expected) throw new Error('A cached pinned input differs: ' + file)
    return destination
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  run('curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '600', '--output', partial, nodeRuntimeReleaseUrl('official', file)])
  if (createHash('sha256').update(await readFile(partial)).digest('hex') !== expected) throw new Error('A downloaded pinned input differs: ' + file)
  await copyFile(partial, destination)
  return destination
}
const asset = NODE_RUNTIME_ASSETS[target], archive = await pinned(asset.archive, asset.archiveSha256)
const extracted = join(work, 'node-extract')
await mkdir(extracted)
const nodeRoot = `node-v${NODE_RUNTIME_PIN.version}-linux-x64`
run('tar', ['-xzf', archive, '-C', extracted, `${nodeRoot}/bin/node`, `${nodeRoot}/LICENSE`])
const extractedNode = join(extracted, nodeRoot, 'bin', 'node'), body = await readFile(extractedNode)
if (body.length !== asset.executableSize || createHash('sha256').update(body).digest('hex') !== asset.executableSha256) throw new Error('The extracted Node differs from its original pin')
const nodeDir = join(output, 'node'), node = join(nodeDir, 'node')
await mkdir(nodeDir, { mode: 0o700 })
await copyFile(extractedNode, node)
await chmod(node, 0o755)
await copyFile(join(extracted, nodeRoot, 'LICENSE'), join(nodeDir, 'LICENSE'))
if (capture(node, ['--version']) !== 'v' + NODE_RUNTIME_PIN.version) throw new Error('The installed Node version differs from its pin')
const identity = JSON.parse(capture(node, ['-p', 'JSON.stringify({platform:process.platform,arch:process.arch,glibc:process.report.getReport().header.glibcVersionRuntime,napi:process.versions.napi})']))
if (identity.platform !== 'linux' || identity.arch !== 'x64' || !identity.glibc || Number(identity.napi) < SLOT_NAPI_VERSION) throw new Error('The actual bundled Node is incompatible with the Linux target')
environment.PATH = nodeDir + delimiter + environment.PATH
const headerArchive = await pinned(NODE_RUNTIME_PIN.headers.file, NODE_RUNTIME_PIN.headers.sha256), headers = join(work, 'headers')
await mkdir(headers)
run('tar', ['-xzf', headerArchive, '-C', headers])
const installed = createRequire(join(runtime, 'package.json')), development = createRequire(join(root, 'runtime', 'swa-orca', 'package.json'))
const packageDir = await realpath(dirname(installed.resolve('node-pty/package.json'))), source = join(work, 'pty-source')
const contained = relative(await realpath(runtime), packageDir)
if (!contained || contained.startsWith('..') || isAbsolute(contained)) throw new Error('The deployed PTY source escaped its private runtime')
await cp(packageDir, source, { recursive: true, dereference: true, filter: path => !['build', 'node_modules'].includes(relative(packageDir, path).split('/')[0]) })
const binding = await readFile(join(source, 'binding.gyp'), 'utf8'), ptySource = await readFile(join(source, 'src', 'unix', 'pty.cc'), 'utf8')
if (!binding.includes('--no-as-needed,-l:libutil.so.1') || !ptySource.includes('.symver openpty,openpty@') || !ptySource.includes('RegisterSwaProviderProcessLinux(env, exports)')) throw new Error('The frozen Orca/SWA node-pty Linux patch is not applied')
await copyFile(join(root, 'third_party', 'orca-v1.4.230', 'native', 'swa-provider-process-linux.h'), join(source, 'src', 'unix', 'swa-provider-process-linux.h'))
const addon = dirname(createRequire(join(packageDir, 'package.json')).resolve('node-addon-api/package.json'))
await cp(addon, join(source, 'node_modules', 'node-addon-api'), { recursive: true, dereference: true })
const compile = join(work, 'prebuild-compile.gypi')
await writeFile(compile, prebuildCompileGypi())
run(node, [development.resolve('node-gyp/bin/node-gyp.js'), 'rebuild', '--python=' + python.executable, '--arch=x64', '--jobs=4', '--nodedir=' + join(headers, 'node-v' + NODE_RUNTIME_PIN.version), '--', '-I', compile], source)
const release = join(packageDir, 'build', 'Release')
await mkdir(release, { recursive: true })
for (const [name, path] of slotSourceFiles({ platform: 'linux', arch: 'x64', buildDir: join(source, 'build', 'Release'), nodePtyDir: source })) await copyFile(path, join(release, name))
const binary = join(release, 'pty.node')
if (findPostBaselineNodeApiNames(await readFile(binary)).length) throw new Error('The compiled Linux PTY imports an API beyond the original N-API 8 baseline')
linuxFloor.verifyLinuxGlibcFloor(release, { targetArch: 'x64', glibcFloor: linuxFloor.SERVER_SLOT_GLIBC_FLOOR })
console.log(JSON.stringify({ stage: 'linux-native-built', package: 'node-pty', source, binary, napi: SLOT_NAPI_VERSION, sha256: createHash('sha256').update(await readFile(binary)).digest('hex') }))
run('readelf', ['-h', binary])
run('readelf', ['--version-info', binary])
const metadata = join(output, 'metadata')
await mkdir(metadata)
for (const [from, to] of [['package.json', 'package.json'], ['web/package.json', 'web-package.json'], ['dependencies.lock.json', 'dependencies.lock.json'], ['pnpm-lock.yaml', 'pnpm-lock.yaml'], ['go.mod', 'go.mod'], ['go.sum', 'go.sum']]) await copyFile(join(root, from), join(metadata, to))
if (values.edition === 'combined') {
  run(process.execPath, [pnpm, '--dir', 'web', 'build', '--manifest'])
  await checkWebAssets(join(root, 'web', 'dist'))
  await cp(join(root, 'web', 'dist'), join(output, 'web'), { recursive: true, errorOnExist: true, force: false })
  await copyWebLicenses(join(root, 'web'), output, pnpm)
}
const go = await findGo()
for (const [name, entry] of [['swa', './cmd/swa'], ['server', './cmd/swa-server']]) run(go, ['build', '-mod=readonly', '-p=4', '-trimpath', ...(name === 'swa' ? ['-ldflags=-X main.version=' + revision] : []), '-o', join(output, name), entry])
console.log(JSON.stringify({ stage: 'go-licenses', ...await copyGoLicenses(go, [join(output, 'swa'), join(output, 'server')], output) }))
for (const [from, to] of [['LICENSE', 'LICENSE'], ['THIRD_PARTY_SWA.md', 'THIRD_PARTY_SWA.md'], ['third_party/orca-v1.4.230/LICENSE', 'ORCA_LICENSE'], ['scripts/install-swa.mjs', 'install-swa.mjs'], ['runtime/swa-orca/USAGE.md', 'USAGE.md']]) await copyFile(join(root, from), join(output, to))
await mkdir(join(output, 'scripts'))
for (const file of ['check-swa-runtime.mjs', 'check-swa-linux-native.mjs', 'check-swa-linux-provider.mjs', 'swa-package-config.mjs']) await copyFile(join(root, 'scripts', file), join(output, 'scripts', file))
const pinDirectory = join(output, 'third_party', 'orca-v1.4.230', 'src', 'shared')
await mkdir(pinDirectory, { recursive: true })
await copyFile(join(root, 'third_party', 'orca-v1.4.230', 'src', 'shared', 'node-runtime-pin.ts'), join(pinDirectory, 'node-runtime-pin.ts'))
if (capture('git', ['rev-parse', 'HEAD']) !== revision || capture('git', ['status', '--porcelain', '--untracked-files=normal'])) throw new Error('The source changed while building; retain this incomplete candidate')
await writeFile(join(output, 'VERSION'), revision + '\n', { flag: 'wx' })
await writeFile(join(output, 'EDITION'), values.edition + '\n', { flag: 'wx' })
await writeFile(join(output, 'PLATFORM'), target + '\n', { flag: 'wx' })
run(node, [join(root, 'scripts', 'check-swa-runtime.mjs'), '--candidate', output])
console.log(JSON.stringify({ source_revision: revision, candidate: output, platform: target, edition: values.edition, node: NODE_RUNTIME_PIN.version, native_modules_built: ['node-pty'], compiler_work: work }))
