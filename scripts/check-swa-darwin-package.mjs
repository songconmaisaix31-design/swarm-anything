import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, symlink, writeFile, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { root } from './process.mjs'

assert.equal(process.platform, 'darwin')
assert.equal(process.arch, 'arm64')
const parent = join(root, '.verification', 'swa-darwin')
await mkdir(parent, { recursive: true, mode: 0o700 })
const work = await mkdtemp(join(parent, 'package-check-'))
const source = join(work, 'source'), protectedRoot = join(work, 'protected'), destination = join(work, 'install')
await mkdir(source)
await mkdir(protectedRoot)
const installer = join(root, 'scripts', 'install-swa.mjs')
const checks = []
function rejects(name, script, args, expected) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', timeout: 15_000 })
  assert.ifError(result.error)
  assert.equal(result.status, 1, name + ': must refuse')
  assert.match(result.stderr, expected, name)
  checks.push(name)
}
rejects('explicit protected roots required', installer, ['--package', source, '--destination', destination], /explicit protected roots are required/)
rejects('relative path rejected', installer, ['--package', 'relative', '--destination', destination, '--protected-root', protectedRoot], /Provide absolute/)
const link = join(work, 'source-link')
await symlink(source, link)
rejects('source symlink rejected', installer, ['--package', link, '--destination', destination, '--protected-root', protectedRoot], /traverses a symbolic link/)
rejects('destination ancestor symlink rejected', installer, ['--package', source, '--destination', join(link, 'install'), '--protected-root', protectedRoot], /traverses a symbolic link/)
rejects('Git checkout destination rejected', installer, ['--package', source, '--destination', destination, '--protected-root', protectedRoot], /outside a Git checkout/)
await assert.rejects(lstat(destination), { code: 'ENOENT' })
const candidate = join(work, 'wrong-platform')
await mkdir(candidate)
await writeFile(join(candidate, 'PLATFORM'), 'linux-x64-glibc\n')
rejects('foreign candidate rejected', join(root, 'scripts', 'check-swa-runtime.mjs'), ['--candidate', candidate], /must be checked on its native platform/)
console.log(JSON.stringify({ ok: true, checks, artifacts: work, actual_installation: 'NOT_RUN', native_pty: 'NOT_RUN' }))
