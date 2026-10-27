import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { finished } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/pi-record-reader'), { recursive: true, mode: 0o700 })
const directory = await mkdtemp(join(root, '.verification/pi-record-reader/run-'))
const output = join(directory, 'reader.cjs')
buildSync({ entryPoints: [join(root, 'third_party/orca-v1.4.230/src/main/provider-process/provider-record-reader.ts')], outfile: output, bundle: true, platform: 'node', format: 'cjs', target: 'node24', logLevel: 'silent' })
const { createProviderRecordReader } = createRequire(output)(output)

// 仅成熟 reader 的普通 JSON/真实字节流组件检查，不构造 Agent/RPC/账号/模型来源。
function observe(stream) {
  const records = [], rejected = [], fatal = [], ends = []
  createProviderRecordReader({
    stdout: stream,
    requireTerminated: true,
    maxLineBytes: 8 * 1024 * 1024,
    onRecord: (value, line) => records.push({ value, line }),
    onRejected: value => rejected.push(value),
    onFatal: error => fatal.push(error),
    onEnd: () => ends.push({ readableEnded: stream.readableEnded })
  })
  return { records, rejected, fatal, ends }
}

async function publicBytes(name, bytes) {
  const path = join(directory, name)
  await writeFile(path, bytes, { flag: 'wx', mode: 0o600 })
  return readFile(path)
}

async function endStream(stream) {
  const ended = once(stream, 'end')
  const complete = finished(stream)
  stream.end()
  await Promise.all([ended, complete])
  assert.equal(stream.readableEnded, true)
}

test('strict reader preserves a real cross-chunk UTF-8 public line and legal replacement character until actual end', { timeout: 10_000 }, async () => {
  const value = { public_text: '公开正文含合法字符�', count: 1 }
  const line = `  ${JSON.stringify(value)}  `
  const bytes = await publicBytes('complete-public.jsonl', Buffer.from(`${line}\n`, 'utf8'))
  const stream = new PassThrough(), observed = observe(stream)
  for (let index = 0; index < bytes.length; index += 1) stream.write(bytes.subarray(index, index + 1))
  assert.deepEqual(observed.records, [{ value, line }])
  assert.deepEqual(observed.ends, [])
  await endStream(stream)
  assert.deepEqual(observed.rejected, [])
  assert.deepEqual(observed.fatal, [])
  assert.deepEqual(observed.ends, [{ readableEnded: true }])
})

test('strict reader rejects an actual unterminated public JSON file at EOF', { timeout: 10_000 }, async () => {
  const bytes = await publicBytes('unterminated-public.json', Buffer.from(JSON.stringify({ public_text: 'no LF' })))
  const stream = new PassThrough(), observed = observe(stream)
  stream.write(bytes)
  await endStream(stream)
  assert.deepEqual(observed.records, [])
  assert.deepEqual(observed.rejected, [])
  assert.equal(observed.fatal.length, 1)
  assert.match(observed.fatal[0].message, /without a complete record boundary/)
  assert.deepEqual(observed.ends, [])
})

test('strict reader rejects actual invalid UTF-8 bytes without replacement decoding', { timeout: 10_000 }, async () => {
  const bytes = await publicBytes('invalid-utf8-public.bytes', Buffer.from([0xc3, 0x28, 0x0a]))
  const stream = new PassThrough(), observed = observe(stream)
  stream.write(bytes)
  await endStream(stream)
  assert.deepEqual(observed.records, [])
  assert.deepEqual(observed.rejected, [])
  assert.equal(observed.fatal.length, 1)
  assert.match(observed.fatal[0].message, /not valid UTF-8/)
  assert.deepEqual(observed.ends, [])
})

test('strict reader rejects actual EOF within a multibyte UTF-8 character', { timeout: 10_000 }, async () => {
  const bytes = await publicBytes('partial-utf8-public.bytes', Buffer.from([0xe2, 0x82]))
  const stream = new PassThrough(), observed = observe(stream)
  stream.write(bytes)
  assert.deepEqual(observed.fatal, [])
  await endStream(stream)
  assert.deepEqual(observed.records, [])
  assert.deepEqual(observed.rejected, [])
  assert.equal(observed.fatal.length, 1)
  assert.match(observed.fatal[0].message, /ended within UTF-8 bytes/)
  assert.deepEqual(observed.ends, [])
})

test('strict reader treats a real stream close without end as incomplete even after a full public line', { timeout: 10_000 }, async () => {
  const value = { public_text: 'closed before end' }, line = JSON.stringify(value)
  const bytes = await publicBytes('closed-public.jsonl', Buffer.from(`${line}\n`))
  const stream = new PassThrough(), observed = observe(stream)
  stream.write(bytes)
  const closed = once(stream, 'close')
  stream.destroy()
  await closed
  assert.equal(stream.readableEnded, false)
  assert.deepEqual(observed.records, [{ value, line }])
  assert.deepEqual(observed.rejected, [])
  assert.equal(observed.fatal.length, 1)
  assert.match(observed.fatal[0].message, /closed before its complete end/)
  assert.deepEqual(observed.ends, [])
})

test('strict reader never restores successful end after a real rejected JSON line and later complete public input', { timeout: 10_000 }, async () => {
  const invalid = await publicBytes('rejected-public.jsonl', Buffer.from('{"public_text":]}\n'))
  const value = { public_text: 'later ordinary value' }, line = JSON.stringify(value)
  const valid = await publicBytes('later-complete-public.jsonl', Buffer.from(`${line}\n`))
  const stream = new PassThrough(), observed = observe(stream)
  stream.write(invalid)
  assert.equal(observed.rejected.length, 1)
  assert.equal(observed.rejected[0].kind, 'invalid-json')
  stream.write(valid)
  await endStream(stream)
  assert.deepEqual(observed.records, [{ value, line }])
  assert.equal(observed.rejected.length, 1)
  assert.deepEqual(observed.fatal, [])
  assert.deepEqual(observed.ends, [])
})
