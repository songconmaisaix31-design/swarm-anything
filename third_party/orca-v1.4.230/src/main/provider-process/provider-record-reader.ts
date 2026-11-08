import type { Readable } from 'node:stream'
import {
  createIncrementalNdjsonFramer,
  type NdjsonRejectedRecord
} from '../../shared/main-process-ndjson-framer'

type RecordReaderStream = Pick<Readable, 'on' | 'pause' | 'resume' | 'setEncoding'>

export type ProviderRecordReader = {
  pause: () => void
  resume: () => void
}

export function createProviderRecordReader(input: {
  stdout: RecordReaderStream
  onRecord: (record: unknown, line: string) => void
  onRejected: (rejected: NdjsonRejectedRecord) => void
  onFatal: (error: Error) => void
  maxLineBytes?: number
  requireTerminated?: boolean
  onEnd?: () => void
}): ProviderRecordReader {
  let paused = false
  let strictFailed = false
  const fatal = (error: Error) => { strictFailed = true; input.onFatal(error) }
  const framer = createIncrementalNdjsonFramer(input.onRecord, rejected => { if (input.requireTerminated) strictFailed = true; input.onRejected(rejected) }, {
    // The provider owns this local stdio stream, so valid agent payloads keep full fidelity.
    maxLineBytes: input.maxLineBytes ?? Number.POSITIVE_INFINITY,
    shouldPause: () => paused
  })

  const feed = (chunk: string) => {
    try { framer.feed(chunk) }
    catch (error) { fatal(error instanceof Error ? error : new Error(String(error))) }
  }
  if (input.requireTerminated) {
    let ended = false
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
    input.stdout.on('data', (chunk: unknown) => {
      try {
        if (!(chunk instanceof Uint8Array)) throw new Error('Provider stdout bytes are unavailable')
        feed(decoder.decode(chunk, { stream: true }))
      } catch { fatal(new Error('Provider stdout is not valid UTF-8')) }
    })
    input.stdout.on('end', () => {
      ended = true
      try { feed(decoder.decode()) } catch { fatal(new Error('Provider stdout ended within UTF-8 bytes')); return }
      if (strictFailed) return
      if (paused || framer.takeTail().length) { fatal(new Error('Provider stdout ended without a complete record boundary')); return }
      input.onEnd?.()
    })
    input.stdout.on('error', () => { if (!ended) fatal(new Error('Provider stdout failed before its complete end')) })
    input.stdout.on('close', () => { if (!ended) fatal(new Error('Provider stdout closed before its complete end')) })
  } else input.stdout.setEncoding('utf8').on('data', feed)

  return {
    pause: () => {
      paused = true
      input.stdout.pause()
    },
    resume: () => {
      if (!paused) {
        return
      }
      paused = false
      framer.resume()
      if (!paused) {
        input.stdout.resume()
      }
    }
  }
}
