import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, cp, lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'

if (process.platform !== 'linux' || process.arch !== 'x64' || !process.report.getReport().header.glibcVersionRuntime) throw new Error('This installer requires native Linux x64 glibc')
const { values } = parseArgs({ options: { package: { type: 'string' }, destination: { type: 'string' }, 'protected-root': { type: 'string', multiple: true } }, allowPositionals: false })
for (const path of [values.package, values.destination, ...(values['protected-root'] ?? [])]) if (!path || !isAbsolute(path)) throw new Error('Provide absolute package, destination and protected-root paths')
if (!values.package || !values.destination || !values['protected-root']?.length) throw new Error('Package, new destination and explicit protected roots are required')
const uid = process.getuid(), source = resolve(values.package), destination = resolve(values.destination)
async function ancestors(path) {
  for (let current = path; ; current = dirname(current)) {
    const info = await lstat(current)
    if (info.isSymbolicLink()) throw new Error('An installation path traverses a symbolic link: ' + current)
    if (dirname(current) === current) break
  }
}
async function plainDirectory(path) {
  await ancestors(path)
  if (!(await lstat(path)).isDirectory() || await realpath(path) !== path) throw new Error('An actual plain directory is required: ' + path)
}
function contains(parent, child) {
  const within = relative(parent, child)
  return !within || within !== '..' && !within.startsWith('../') && !isAbsolute(within)
}
await plainDirectory(source)
await plainDirectory(dirname(destination))
for (let current = dirname(destination); ; current = dirname(current)) {
  const marker = join(current, '.git')
  let metadata
  try { metadata = await lstat(marker) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  if (metadata) {
    if (metadata.isSymbolicLink() || !metadata.isDirectory() || (await readdir(marker)).length) throw new Error('The installation must be outside a Git checkout')
    const after = await lstat(marker)
    if (after.isSymbolicLink() || !after.isDirectory() || after.dev !== metadata.dev || after.ino !== metadata.ino) throw new Error('The Git metadata path changed during validation')
  }
  if (dirname(current) === current) break
}
try { await lstat(destination); throw new Error('The install destination already exists') }
catch (error) { if (error.code !== 'ENOENT') throw error }
for (const protectedPath of values['protected-root'].map(path => resolve(path))) {
  await plainDirectory(protectedPath)
  for (const path of [source, destination]) if (contains(protectedPath, path) || contains(path, protectedPath)) throw new Error('Package or install destination overlaps a protected root')
}
if (contains(source, destination) || contains(destination, source)) throw new Error('The package and installation must not overlap')
async function tree(path, tighten = false) {
  const info = await lstat(path)
  if (info.isSymbolicLink() || !info.isFile() && !info.isDirectory() || info.uid !== uid) throw new Error('An install payload is redirected, unsupported, or owned by another user: ' + path)
  if (tighten) await chmod(path, info.isDirectory() ? 0o700 : info.mode & 0o111 ? 0o700 : 0o600)
  if (info.isDirectory()) for (const name of await readdir(path)) await tree(join(path, name), tighten)
}
await tree(source)
assert.equal((await readFile(join(source, 'PLATFORM'), 'utf8')).trim(), 'linux-x64-glibc')
const node = join(source, 'node', 'node')
// 与固定上游 Node 24.21.0 linux-x64-glibc 的可执行文件摘要相同。
assert.equal(createHash('sha256').update(await readFile(node)).digest('hex'), '7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c')
const revision = (await readFile(join(source, 'VERSION'), 'utf8')).trim()
assert.match(revision, /^[a-f0-9]{40}$/)
const check = root => {
  const bundledNode = join(root, 'node', 'node')
  const actual = execFileSync(join(root, 'swa'), ['--version'], { encoding: 'utf8', timeout: 60_000 }).trim()
  assert.equal(actual, revision)
  execFileSync(bundledNode, [join(root, 'scripts', 'check-swa-runtime.mjs'), '--candidate', root], { stdio: 'inherit', timeout: 60_000 })
}
check(source)
process.umask(0o077)
await mkdir(destination, { mode: 0o700 })
for (const name of await readdir(source)) await cp(join(source, name), join(destination, name), { recursive: true, dereference: false, force: false, errorOnExist: true })
await tree(destination, true)
assert.equal((await lstat(destination)).mode & 0o777, 0o700)
check(destination)
console.log(JSON.stringify({ ok: true, install_root: destination, source_revision: revision, platform: 'linux-x64-glibc', owner_uid: uid, private_mode: '0700', service_started: false, path_modified: false }))
