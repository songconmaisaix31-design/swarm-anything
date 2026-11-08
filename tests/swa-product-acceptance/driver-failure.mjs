import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import ErrorStackParser from 'error-stack-parser'

export function driverFailure(error, executionUrl) {
  const failure = { type: 'unknown', code: null, label: null, location_status: 'unavailable', locations: [] }
  try {
    if (!(error instanceof Error)) return failure
    if (typeof error.name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name)) failure.type = error.name
    if (typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)) failure.code = error.code
    if (typeof error.message === 'string' && /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(error.message) && error.message.length <= 160) failure.label = error.message
    const expected = fileURLToPath(executionUrl)
    const allowed = new Set([expected, ...['codex-event-view.mjs', 'pi-event-view.mjs'].map(name => fileURLToPath(new URL(name, executionUrl)))])
    const frames = ErrorStackParser.parse(error)
    const locations = []
    for (const frame of frames) {
      const source = frame.fileName
      if (typeof source !== 'string') continue
      const path = source.startsWith('file:') ? fileURLToPath(source) : source
      if (!allowed.has(path)) continue
      const line = frame.lineNumber, column = frame.columnNumber
      if (!Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(column) || column < 1) continue
      locations.push({ file: basename(path), line, column })
      if (locations.length === 8) break
    }
    if (locations.length) {
      failure.locations = locations
      failure.location_status = 'observed'
    }
  } catch {
    // 诊断缺失不替代原失败，也不阻止原清理路径。
  }
  return failure
}
