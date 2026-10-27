import assert from 'node:assert/strict'
import { appendFile, chmod, lstat, mkdir, mkdtemp, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/live-trace-observation'), { recursive: true, mode: 0o700 })
const directory = await mkdtemp(join(root, '.verification/live-trace-observation/run-'))
const output = join(directory, 'observation.cjs')
buildSync({ entryPoints: [join(root, 'runtime/swa-orca/src/provider-trace-observation.ts')], outfile: output,
  bundle: true, platform: 'node', format: 'cjs', target: 'node24', logLevel: 'silent' })
const { readProviderTraceObservation } = createRequire(output)(output)
const native = await readFile(new URL('fixtures/pi-stepfun-502-native-entry.json', import.meta.url))
const metadata = Buffer.from(JSON.stringify(JSON.parse(await readFile(new URL('fixtures/pi-6190-user-turn.json', import.meta.url), 'utf8'))) + '\n')
const repositoryText = (await readFile(join(root, 'AGENTS.md'), 'utf8')).split('\n')[0]
const unicode = Buffer.from(JSON.stringify(repositoryText) + '\n')
let ordinal = 0

async function source(bytes = native) {
  const path = join(directory, `source-${++ordinal}.ndjson`)
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 })
  return path
}
async function privatePath(path) {
  assert.equal(await realpath(path), path)
  const value = await lstat(path)
  assert.ok(value.isFile() && !value.isSymbolicLink())
  assert.equal(value.nlink, 1)
  if (process.platform === 'linux') {
    assert.equal(value.mode & 0o7777, 0o600)
    assert.equal(value.uid, process.getuid())
  }
}
const observe = (path, requirePrivatePath = privatePath, maximum = 12 * 1024 * 1024) => readProviderTraceObservation({ path, requirePrivatePath, maximum })
function duringRead(operation) {
  let checks = 0
  return async path => {
    if (++checks === 2) await operation(path)
    await privatePath(path)
  }
}

// 只验证真实文件与成熟framer；原失败记录/实际元数据不作为新的provider执行证据。
test('bounded observation keeps the original complete bytes while the same file receives another actual record', async () => {
  const path = await source()
  const first = await observe(path, duringRead(path => appendFile(path, metadata)))
  assert.deepEqual(first.bytes, native)
  assert.equal(first.rows[0].message.stopReason, 'error')
  assert.equal(first.observation.kind, 'prefix')
  assert.equal(first.observation.byte_length, native.length)
  assert.equal(first.observation.incomplete_tail_bytes, 0)
  assert.equal(first.observation.record_count, 1)
  const next = await observe(path)
  assert.deepEqual(next.bytes, Buffer.concat([native, metadata]))
  assert.equal(next.observation.record_count, 2)
  assert.deepEqual(next.bytes.subarray(0, first.bytes.length), first.bytes)
})

test('an incomplete UTF-8 code point stays in the explicit tail without changing a complete original record', async () => {
  const start = unicode.findIndex(value => value >= 0x80)
  assert.ok(start >= 0)
  const partial = unicode.subarray(0, start + 1)
  const path = await source(Buffer.concat([native, partial]))
  const first = await observe(path)
  assert.deepEqual(first.bytes, native)
  assert.equal(first.observation.incomplete_tail_bytes, partial.length)
  await appendFile(path, unicode.subarray(partial.length))
  const next = await observe(path)
  assert.equal(next.rows[1], repositoryText)
  assert.deepEqual(next.bytes, Buffer.concat([native, unicode]))
  assert.equal(next.observation.incomplete_tail_bytes, 0)
})

test('changed prefixes, truncated originals, replaced paths and private-file changes fail', async () => {
  const changed = Buffer.from(native)
  changed[1] ^= 1
  await assert.rejects(observe(await source(), duringRead(path => writeFile(path, changed))), /prefix_changed/)
  await assert.rejects(observe(await source(), duringRead(path => writeFile(path, native.subarray(0, native.length - 1)))), /truncated/)
  const replacement = await source()
  await assert.rejects(observe(await source(), duringRead(path => rename(replacement, path))), /identity_changed/)
  if (process.platform === 'linux') await assert.rejects(observe(await source(), duringRead(path => chmod(path, 0o644))), /AssertionError/)
})

test('complete invalid UTF-8, damaged JSON, a BOM and an exceeded byte limit are rejected', async () => {
  const invalid = Buffer.from(native)
  invalid[2] = 0xff
  await assert.rejects(observe(await source(invalid)), /encoded data|encoding/i)
  const damaged = Buffer.from(native)
  damaged[0] = 0x5d
  await assert.rejects(observe(await source(damaged)), /invalid_record/)
  await assert.rejects(observe(await source(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), native]))), /invalid_record/)
  await assert.rejects(observe(await source(), privatePath, native.length - 1), /exceeds_bound/)
})
