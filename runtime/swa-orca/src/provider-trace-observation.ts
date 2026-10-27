import { constants, type BigIntStats } from 'node:fs'
import { lstat, open, realpath, type FileHandle } from 'node:fs/promises'
import { createIncrementalNdjsonFramer } from '../../../third_party/orca-v1.4.230/src/shared/main-process-ndjson-framer'

const identity = (value: BigIntStats) => `${value.dev}:${value.ino}:${value.birthtimeNs}:${value.uid}:${value.mode}:${value.nlink}`
const version = (value: BigIntStats) => `${value.dev}:${value.ino}:${value.birthtimeNs}:${value.mtimeNs}:${value.size}`
const samePath = (left: string, right: string) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
const fail = (reason: string): never => { throw new Error(`provider_trace_observation_${reason}`) }

async function readBytes(file: FileHandle, length: number) {
  const bytes = Buffer.alloc(length)
  let count = 0
  while (count < length) {
    const value = await file.read(bytes, count, length - count, count)
    if (!value.bytesRead) fail('truncated')
    count += value.bytesRead
  }
  return bytes
}

/** 活动来源仅承诺本次完整前缀；未完成的末行和UTF-8码点保留为明确尾部。 */
export async function readProviderTraceObservation(input: { path: string; maximum: number; requirePrivatePath(path: string): void | Promise<void> }) {
  if (!Number.isSafeInteger(input.maximum) || input.maximum < 1) fail('invalid_bound')
  await input.requirePrivatePath(input.path)
  if (!samePath(await realpath(input.path), input.path)) fail('redirected')
  const file = await open(input.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const before = await file.stat({ bigint: true })
    if (!before.isFile() || before.size < 1n || before.size > BigInt(input.maximum)) fail('exceeds_bound')
    const initial = await lstat(input.path, { bigint: true })
    if (!initial.isFile() || initial.isSymbolicLink() || identity(initial) !== identity(before)) fail('identity_changed')
    const bytes = await readBytes(file, Number(before.size))
    const rows: unknown[] = []
    const framer = createIncrementalNdjsonFramer(value => {
      if (rows.length >= 100_000) fail('record_bound')
      rows.push(value)
    }, () => fail('invalid_record'), { maxLineBytes: input.maximum })
    const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes, { stream: true })
    framer.feed(content)
    const tail = framer.takeTail()
    const length = Buffer.byteLength(content.slice(0, content.length - tail.length))
    const prefix = bytes.subarray(0, length)
    await input.requirePrivatePath(input.path)
    if (!prefix.equals(await readBytes(file, length))) fail('prefix_changed')
    const after = await file.stat({ bigint: true }), current = await lstat(input.path, { bigint: true })
    if (!current.isFile() || current.isSymbolicLink() || identity(after) !== identity(before) || identity(current) !== identity(before) || !samePath(await realpath(input.path), input.path)) fail('identity_changed')
    if (after.size < before.size || current.size < before.size) fail('truncated')
    return {
      source: { path: input.path, version: version(before) }, bytes: prefix, rows,
      observation: { kind: 'prefix' as const, byte_length: length, record_count: rows.length, observed_at: new Date().toISOString(), incomplete_tail_bytes: bytes.length - length }
    }
  } finally { await file.close() }
}
