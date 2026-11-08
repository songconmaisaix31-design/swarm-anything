import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { lstat, mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join, relative, resolve, toNamespacedPath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { openCodeSingleCase, publicCase, publicFiles as files, publicRevision as revision, publicSource as source } from './public-case-definition.mjs'

const repository = await realpath(fileURLToPath(new URL('../../', import.meta.url)))
const windows = process.platform === 'win32'
const samePath = (left, right) => windows ? left.toLowerCase() === right.toLowerCase() : left === right
let values, workers
try {
  const parsed = parseArgs({ options: { root: { type: 'string' }, workers: { type: 'string', default: '3' }, case: { type: 'string' } }, allowPositionals: false, tokens: true })
  values = parsed.values
  if (!values.root || !isAbsolute(values.root)) throw new Error('Select an explicit absolute --root that does not exist')
  if (values.case !== undefined && !['native-questions', 'opencode-single'].includes(values.case)) throw new Error('Unknown public case')
  if (values.case === 'native-questions' && (process.platform !== 'linux' || values.root !== '/workspace/swa-public-question-case-20261023' || parsed.tokens.some(token => token.kind === 'option' && token.name === 'workers'))) throw new Error('The native question case has one fixed root and fixed stage worker counts')
  if (values.case === 'opencode-single' && (!windows && values.root !== '/workspace/swa-public-opencode-single-20261023' || parsed.tokens.some(token => token.kind === 'option' && token.name === 'workers'))) throw new Error('The OpenCode single case has one fixed root and one Worker')
  if (!/^[1-9]\d*$/.test(values.workers) || !Number.isSafeInteger(Number(values.workers)) || Number(values.workers) < 3 || Number(values.workers) > 100) throw new Error('--workers must be within the current complete-inventory observation bound')
  workers = values.case === 'opencode-single' ? 1 : Number(values.workers)
  if (windows && !(values.case === 'opencode-single' || values.case === undefined && [4, 6].includes(workers))) throw new Error('The Windows case must be the fixed single, N4 or N6 input')
} catch {
  process.stderr.write(values?.case === undefined
    ? 'Invalid arguments: use --root ABSOLUTE_NEW_DIRECTORY and optional --workers INTEGER_3_TO_100; this helper follows the current complete-inventory observation bound, not a product quota limit\n'
    : 'Invalid arguments: use --case native-questions --root /workspace/swa-public-question-case-20261023 or --case opencode-single --root /workspace/swa-public-opencode-single-20261023, without --workers\n')
  process.exit(2)
}

const contained = (root, path) => {
  const within = relative(root, path)
  return !within || within !== '..' && !within.startsWith('../') && !within.startsWith('..\\') && !isAbsolute(within)
}

async function ordinaryDirectory(path) {
  for (let current = path; ; current = dirname(current)) {
    const info = await lstat(current)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('The case parent must contain only actual directories')
    if (dirname(current) === current) break
  }
  const actual = await realpath(path)
  if (!samePath(actual, resolve(path))) throw new Error('The case parent has a redirected canonical location')
  return actual
}
async function boundedBytes(path, maximum) {
  await ordinaryDirectory(dirname(path))
  const before = await lstat(path, { bigint: true })
  assert.ok(before.isFile() && !before.isSymbolicLink() && before.size > 0n && before.size <= BigInt(maximum) && samePath(await realpath(path), resolve(path)))
  const identity = value => [value.dev, value.ino, value.birthtimeNs, value.mtimeNs, value.ctimeNs, value.size]
  const file = await open(path, 'r')
  try {
    assert.deepEqual(identity(await file.stat({ bigint: true })), identity(before))
    const bytes = Buffer.alloc(Number(before.size) + 1)
    let used = 0
    while (used < bytes.length) { const { bytesRead } = await file.read(bytes, used, bytes.length - used, null); if (!bytesRead) break; used += bytesRead }
    assert.equal(used, Number(before.size))
    assert.deepEqual(identity(await file.stat({ bigint: true })), identity(before))
    assert.deepEqual(identity(await lstat(path, { bigint: true })), identity(before))
    assert.ok(samePath(await realpath(path), resolve(path)))
    return bytes.subarray(0, used)
  } finally { await file.close() }
}
let security
function privateWindowsPath(path, directory) {
  const user = security.currentUserSid(), acl = security.getDaclAces(toNamespacedPath(path)), trustees = new Set([user, 'S-1-5-18'])
  assert.ok(acl?.protected && acl.ownerSid === user && acl.aces.length === trustees.size)
  for (const ace of acl.aces) assert.ok(ace.type === 0 && ace.flags === (directory ? 3 : 0) && ace.mask === 0x1f01ff && trustees.delete(ace.sid))
  assert.equal(trustees.size, 0)
}
async function privateDirectory(path) {
  if (!windows) return mkdir(path, { mode: 0o700 })
  await ordinaryDirectory(dirname(path))
  assert.equal(security.createPrivateDirectory(toNamespacedPath(path)), true, 'public_case_directory_already_exists')
  await ordinaryDirectory(path)
  privateWindowsPath(path, true)
}
async function privateFile(path, value) {
  if (!windows) return writeFile(path, value, { flag: 'wx', mode: 0o600 })
  await ordinaryDirectory(dirname(path))
  const user = security.currentUserSid()
  security.createFileWithDacl(toNamespacedPath(path), `O:${user}D:P${[...new Set([user, 'S-1-5-18'])].map(sid => `(A;;FA;;;${sid})`).join('')}`, Buffer.from(value))
  assert.ok((await lstat(path)).isFile() && samePath(await realpath(path), resolve(path)))
  privateWindowsPath(path, false)
}
async function windowsCaseRoot() {
  assert.equal(process.arch, 'x64')
  const node = await realpath(process.execPath), installation = dirname(dirname(node))
  assert.equal(basename(node).toLowerCase(), 'node.exe'); assert.equal(basename(dirname(node)).toLowerCase(), 'node')
  await ordinaryDirectory(installation)
  assert.ok((await lstat(node)).isFile() && !(await lstat(node)).isSymbolicLink())
  const installedRevision = (await boundedBytes(join(installation, 'VERSION'), 4096)).toString('ascii').trim()
  assert.match(installedRevision, /^[a-f0-9]{40}$/)
  const cli = join(installation, 'swa.exe')
  assert.ok((await lstat(cli)).isFile() && !(await lstat(cli)).isSymbolicLink() && samePath(await realpath(cli), cli))
  assert.equal(execFileSync(cli, ['--version'], { encoding: 'utf8', timeout: 5000, maxBuffer: 4096, windowsHide: true }).trim(), installedRevision)
  const sourceGit = args => execFileSync('git', ['-C', repository, ...args], { timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat' } })
  assert.equal(sourceGit(['rev-parse', '--verify', `${installedRevision}^{commit}`]).toString('ascii').trim(), installedRevision)
  for (const name of ['tests/swa-product-acceptance/prepare-public-case.mjs', 'tests/swa-product-acceptance/public-case-definition.mjs']) assert.ok((await boundedBytes(join(repository, name), 1024 * 1024)).equals(sourceGit(['show', `${installedRevision}:${name}`])))
  const requireInstalled = createRequire(join(installation, 'runtime/package.json'))
  const securityEntry = await realpath(requireInstalled.resolve('@orca/windows-security'))
  assert.ok(contained(await ordinaryDirectory(join(installation, 'runtime/node_modules/@orca/windows-security')), securityEntry))
  assert.ok((await lstat(securityEntry)).isFile() && !(await lstat(securityEntry)).isSymbolicLink())
  security = requireInstalled(securityEntry)
  assert.ok(isAbsolute(process.env.RUNNER_TEMP ?? ''))
  const temporary = await ordinaryDirectory(await realpath(process.env.RUNNER_TEMP))
  const root = join(temporary, 'swa-n46-' + installedRevision)
  await ordinaryDirectory(root); privateWindowsPath(root, true)
  return join(root, 'public', values.case === 'opencode-single' ? 'opencode-single' : 'n' + workers)
}

try {
  const root = resolve(values.root)
  if (windows) assert.ok(samePath(root, await windowsCaseRoot()), 'fixed_windows_public_root_changed')
  await ordinaryDirectory(dirname(root))
  if (contained(repository, root) || contained(root, repository)) throw new Error('The public case must stay separate from the development checkout')
  await privateDirectory(root)
  const hooks = join(root, 'empty-hooks')
  await privateDirectory(hooks)
  const project = join(root, 'public-project')
  // 保留平台 HTTPS Git 代理；仅关闭本项 checkout 的 hook、自动换行和子模块执行。
  const git = args => execFileSync('git', ['-c', `core.hooksPath=${hooks}`, '-c', 'core.autocrlf=false', '-c', 'core.fsmonitor=false', '-c', 'submodule.recurse=false', ...args], {
    encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
  })
  git(['clone', '--no-checkout', '--no-recurse-submodules', source, project])
  git(['-C', project, 'checkout', '--detach', revision])
  if (git(['-C', project, 'rev-parse', 'HEAD']).trim() !== revision || git(['-C', project, 'remote', 'get-url', 'origin']).trim() !== source) throw new Error('The actual public source identity differs from the fixed input')
  if (values.case === 'opencode-single' && git(['-C', project, 'ls-tree', '-r', '--name-only', revision]).trimEnd() !== files.join('\n')) throw new Error('The OpenCode single case requires exactly the four fixed source files')
  const originals = []
  for (const path of files) {
    const actual = join(project, path)
    const info = await lstat(actual)
    if (!info.isFile() || info.isSymbolicLink() || !contained(project, await realpath(actual))) throw new Error('The selected public original is not an ordinary source file')
    const text = git(['-C', project, 'show', `${revision}:${path}`])
    if (await readFile(actual, 'utf8') !== text) throw new Error('The checked-out original differs from its fixed Git revision')
    originals.push({ path, source_revision: revision, text })
  }
  if (values.case === 'native-questions') {
    const { questionCase } = await import('./question-case-definition.mjs')
    const verification = join(project, '.verification')
    await mkdir(verification, { mode: 0o700 })
    await ordinaryDirectory(verification)
    const inputDirectory = join(verification, 'swa-question-input')
    await mkdir(inputDirectory, { mode: 0o700 })
    const prepared = questionCase(originals), stages = []
    const write = (path, value) => writeFile(path, value, { flag: 'wx', mode: 0o600 })
    for (const stage of prepared.stages) {
      const directory = join(inputDirectory, stage.name)
      await mkdir(directory, { mode: 0o700 })
      const inputs = []
      for (const { name, file, body } of stage.inputs) {
        const input_file = join(directory, file)
        await write(input_file, body)
        inputs.push({ name, input_file })
      }
      const spec_file = join(directory, 'task.json'), inputs_file = join(directory, 'inputs.json')
      await write(spec_file, JSON.stringify(stage.spec, null, 2) + '\n')
      await write(inputs_file, JSON.stringify(inputs, null, 2) + '\n')
      stages.push({ name: stage.name, spec_file, inputs_file })
    }
    const case_file = join(inputDirectory, 'case.json'), answer_file = join(inputDirectory, prepared.answer.file)
    await write(case_file, JSON.stringify({ stages }, null, 2) + '\n')
    await write(answer_file, prepared.answer.body)
    await write(join(inputDirectory, 'source.json'), JSON.stringify({ project_root: project, source, revision, originals }, null, 2) + '\n')
    process.stdout.write(JSON.stringify({ project_root: project, source, revision, case: 'native-questions', input_directory: inputDirectory, case_file, answer_file, stages, source_files_verified: files, model_calls: 0, product_execution: 'NOT_RUN', current_authorization: 'REQUIRED' }, null, 2) + '\n')
  } else {
  const inputDirectory = join(project, '.verification', 'swa-product-input')
  if (windows) { await privateDirectory(dirname(inputDirectory)); await privateDirectory(inputDirectory) }
  else await mkdir(inputDirectory, { recursive: true, mode: 0o700 })
  const write = (name, value) => privateFile(join(inputDirectory, name), value)
  const prepared = values.case === 'opencode-single' ? openCodeSingleCase(originals) : publicCase(workers, originals)
  const inputs = []
  for (const { name, file, body } of prepared.inputs) {
    await write(file, body)
    inputs.push({ name, input_file: join(inputDirectory, file) })
  }
  await write('task.json', JSON.stringify(prepared.spec, null, 2) + '\n')
  await write('followup.txt', prepared.followup)
  await write('source.json', JSON.stringify({ project_root: project, source, revision, originals }, null, 2) + '\n')
  await write('inputs.json', JSON.stringify(inputs, null, 2) + '\n')
  process.stdout.write(JSON.stringify({ project_root: project, source, revision, workers, ...(values.case === 'opencode-single' ? { case: 'opencode-single' } : {}), input_directory: inputDirectory, spec_file: join(inputDirectory, 'task.json'), inputs_file: join(inputDirectory, 'inputs.json'), source_files_verified: files, model_calls: 0, product_execution: 'NOT_RUN', current_authorization: 'REQUIRED' }, null, 2) + '\n')
  }
} catch {
  process.stderr.write('Public case preparation failed; preserve the explicitly selected case directory and inspect Git access, source identity and actual paths. No project scripts or model calls were executed.\n')
  process.exitCode = 1
}
