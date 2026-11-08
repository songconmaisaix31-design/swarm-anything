import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, open, readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join, relative, resolve, toNamespacedPath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const [definition, project, requestedWorkers = '3', selectedCase] = process.argv.slice(2)
assert.ok(process.argv.length >= 4 && process.argv.length <= 6)
assert.ok(selectedCase === undefined || ['native-questions', 'opencode-single'].includes(selectedCase))
assert.ok(selectedCase === 'native-questions' ? requestedWorkers === '2' : selectedCase === 'opencode-single' ? requestedWorkers === '1' : ['3', '4', '6'].includes(requestedWorkers))
const workers = Number(requestedWorkers)
const windows = process.platform === 'win32'
const samePath = (left, right) => windows ? left.toLowerCase() === right.toLowerCase() : left === right
assert.ok(isAbsolute(definition) && isAbsolute(project))
async function ordinary(path, directory = false) {
  assert.ok(samePath(await realpath(path), resolve(path)))
  for (let current = path; ; current = dirname(current)) {
    const info = await lstat(current)
    assert.equal(info.isSymbolicLink(), false)
    assert.equal(current === path && !directory ? info.isFile() : info.isDirectory(), true)
    if (dirname(current) === current) return path
  }
}
async function boundedBytes(path, maximum) {
  await ordinary(path)
  const file = await open(path, 'r')
  try {
    const before = await file.stat({ bigint: true })
    assert.ok(before.isFile() && before.size > 0n && before.size <= BigInt(maximum))
    const bytes = Buffer.alloc(Number(before.size) + 1)
    let used = 0
    while (used < bytes.length) { const { bytesRead } = await file.read(bytes, used, bytes.length - used, null); if (!bytesRead) break; used += bytesRead }
    const identity = value => [value.dev, value.ino, value.birthtimeNs, value.mtimeNs, value.ctimeNs, value.size]
    assert.equal(used, Number(before.size))
    assert.deepEqual(identity(await file.stat({ bigint: true })), identity(before))
    assert.deepEqual(identity(await lstat(path, { bigint: true })), identity(before))
    await ordinary(path)
    return bytes.subarray(0, used)
  } finally { await file.close() }
}
let windowsProject
if (windows) {
  assert.equal(process.arch, 'x64')
  assert.ok(selectedCase === 'opencode-single' || selectedCase === undefined && [4, 6].includes(workers))
  const node = await realpath(process.execPath), installation = dirname(dirname(node))
  assert.equal(basename(node).toLowerCase(), 'node.exe')
  assert.equal(basename(dirname(node)).toLowerCase(), 'node')
  await ordinary(installation, true); await ordinary(node)
  const installedRevision = (await boundedBytes(join(installation, 'VERSION'), 4096)).toString('ascii').trim()
  assert.match(installedRevision, /^[a-f0-9]{40}$/)
  const cli = await ordinary(join(installation, 'swa.exe'))
  assert.equal(execFileSync(cli, ['--version'], { encoding: 'utf8', timeout: 5000, maxBuffer: 4096, windowsHide: true }).trim(), installedRevision)
  const repository = await realpath(join(dirname(definition), '../..'))
  await ordinary(repository, true)
  assert.ok(samePath(definition, join(repository, 'tests/swa-product-acceptance/public-case-definition.mjs')))
  const sourceGit = args => execFileSync('git', ['-C', repository, ...args], { timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat' } })
  assert.equal(sourceGit(['rev-parse', '--verify', `${installedRevision}^{commit}`]).toString('ascii').trim(), installedRevision)
  for (const [name, path] of [['tests/swa-product-acceptance/public-case-definition.mjs', definition], ['tests/swa-cli-headless/authorize-installed/public-case-preflight.mjs', fileURLToPath(import.meta.url)]]) {
    assert.ok((await boundedBytes(path, 1024 * 1024)).equals(sourceGit(['show', `${installedRevision}:${name}`])))
  }
  assert.ok(isAbsolute(process.env.RUNNER_TEMP ?? ''))
  const temporary = await realpath(process.env.RUNNER_TEMP)
  await ordinary(temporary, true)
  const root = join(temporary, 'swa-n46-' + installedRevision)
  await ordinary(root, true)
  const requireInstalled = createRequire(join(installation, 'runtime/package.json'))
  const securityRoot = await realpath(join(installation, 'runtime/node_modules/@orca/windows-security'))
  await ordinary(securityRoot, true)
  const securityEntry = await realpath(requireInstalled.resolve('@orca/windows-security')), securityPart = relative(securityRoot, securityEntry)
  assert.ok(securityPart && securityPart !== '..' && !securityPart.startsWith('..\\') && !isAbsolute(securityPart))
  await ordinary(securityEntry)
  const security = requireInstalled(securityEntry), user = security.currentUserSid()
  const acl = security.getDaclAces(toNamespacedPath(root)), trustees = new Set([user, 'S-1-5-18'])
  assert.ok(acl?.protected && acl.ownerSid === user && acl.aces.length === trustees.size)
  for (const ace of acl.aces) assert.ok(ace.type === 0 && ace.flags === 3 && ace.mask === 0x1f01ff && trustees.delete(ace.sid))
  assert.equal(trustees.size, 0)
  windowsProject = join(root, 'public', selectedCase === 'opencode-single' ? 'opencode-single' : 'n' + workers, 'public-project')
  assert.ok(samePath(project, windowsProject), 'fixed_windows_public_project_changed')
}
await ordinary(project, true)
await ordinary(definition)
const { openCodeSingleCase, publicCase, questionCase, publicFiles, publicRevision, publicSource } = await import(pathToFileURL(definition).href)
assert.equal(publicSource, 'https://github.com/songconmaisaix31-design/astrocyte-s3-public-stats.git')
assert.equal(publicRevision, 'da3bdddb085808863090a05f60cc1c64415039cf')
assert.deepEqual(publicFiles, ['README.md', 'go.mod', 'stats.go', 'stats_test.go'])
const git = args => execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${join(dirname(project), 'empty-hooks')}`, '-C', project, ...args], { encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024 })
assert.equal(git(['rev-parse', 'HEAD']).trim(), publicRevision)
assert.equal(git(['remote', 'get-url', 'origin']).trim(), publicSource)
if (selectedCase === 'opencode-single') {
  assert.ok(samePath(project, windows ? windowsProject : '/workspace/swa-public-opencode-single-20261023/public-project'))
  assert.deepEqual(git(['ls-tree', '-r', '--name-only', publicRevision]).trimEnd().split('\n'), publicFiles)
}
const originals = []
const hashes = {}
const read = async path => {
  const bytes = await readFile(await ordinary(path))
  hashes[path.slice(project.length + 1)] = createHash('sha256').update(bytes).digest('hex')
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}
for (const path of publicFiles) {
  const text = await read(join(project, path))
  assert.equal(text, git(['show', `${publicRevision}:${path}`]))
  originals.push({ path, source_revision: publicRevision, text })
}
if (selectedCase === 'native-questions') {
  assert.equal(project, '/workspace/swa-public-question-case-20261023/public-project')
  const directory = join(project, '.verification/swa-question-input')
  const prepared = questionCase(originals)
  assert.deepEqual(prepared.stages.map(({ name, spec }) => ({ name, max_workers: spec.max_workers, initial_workers: spec.initial_workers })), [
    { name: 'a', max_workers: 1, initial_workers: 1 },
    { name: 'b', max_workers: 2, initial_workers: 2 },
    { name: 'c', max_workers: 1, initial_workers: 1 },
  ])
  assert.deepEqual(JSON.parse(await read(join(directory, 'case.json'))), { stages: prepared.stages.map(({ name }) => ({ name, spec_file: join(directory, name, 'task.json'), inputs_file: join(directory, name, 'inputs.json') })) })
  assert.deepEqual(JSON.parse(await read(join(directory, 'source.json'))), { project_root: project, source: publicSource, revision: publicRevision, originals })
  for (const stage of prepared.stages) {
    const stageDirectory = join(directory, stage.name)
    assert.deepEqual(JSON.parse(await read(join(stageDirectory, 'task.json'))), stage.spec)
    assert.deepEqual(JSON.parse(await read(join(stageDirectory, 'inputs.json'))), stage.inputs.map(({ name, file }) => ({ name, input_file: join(stageDirectory, file) })))
    for (const input of stage.inputs) assert.equal(await read(join(stageDirectory, input.file)), input.body)
  }
  assert.equal(prepared.answer.file, 'answer.txt')
  assert.equal(await read(join(directory, prepared.answer.file)), prepared.answer.body)
} else {
  const directory = join(project, '.verification/swa-product-input')
  const prepared = selectedCase === 'opencode-single' ? openCodeSingleCase(originals) : publicCase(workers, originals)
  assert.deepEqual(JSON.parse(await read(join(directory, 'task.json'))), prepared.spec)
  assert.deepEqual(JSON.parse(await read(join(directory, 'source.json'))), { project_root: project, source: publicSource, revision: publicRevision, originals })
  assert.deepEqual(JSON.parse(await read(join(directory, 'inputs.json'))), prepared.inputs.map(({ name, file }) => ({ name, input_file: join(directory, file) })))
  for (const input of prepared.inputs) assert.equal(await read(join(directory, input.file)), input.body)
  assert.equal(await read(join(directory, 'followup.txt')), prepared.followup)
}
process.stdout.write(JSON.stringify({ status: 'VERIFIED_FIXED_PUBLIC_INPUT', source: publicSource, revision: publicRevision, workers, files: hashes, http_calls: 0, model_calls: 0, project_registration: 'NOT_RUN' }) + '\n')
