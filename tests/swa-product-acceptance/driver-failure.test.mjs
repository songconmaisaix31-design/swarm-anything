import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getCallSites } from 'node:util'
import { driverFailure } from './driver-failure.mjs'
import { validateLinuxFinalCustody } from './codex-event-view.mjs'
import { validatePiEventView } from './pi-event-view.mjs'

function actualFailure(body) {
  try { body() } catch (error) { return error }
  throw new Error('expected_actual_failure')
}

test('真实断言保留受控标签及本文件位置，不保存差分', () => {
  const line = getCallSites(1)[0].lineNumber + 1
  const error = actualFailure(() => assert.fail('actual_source_changed'))
  const result = driverFailure(error, import.meta.url)
  assert.equal(result.type, 'AssertionError')
  assert.equal(result.code, 'ERR_ASSERTION')
  assert.equal(result.label, 'actual_source_changed')
  assert.equal(result.location_status, 'observed')
  assert.ok(result.locations.length > 0 && result.locations.length <= 8)
  assert.ok(result.locations.every(row => row.file === 'driver-failure.test.mjs' && row.line > 0 && row.column > 0))
  assert.equal(result.locations[0].line, line)
  const difference = actualFailure(() => assert.equal(import.meta.url, ''))
  const captured = driverFailure(difference, import.meta.url)
  assert.equal(captured.label, null)
  assert.equal(JSON.stringify(captured).includes(import.meta.url), false)
  assert.deepEqual(Object.keys(captured).sort(), ['code', 'label', 'location_status', 'locations', 'type'])
})

test('真实文件读取错误只保留有限错误码，不暴露路径或正文', () => {
  const file = new URL('./driver-failure.test.mjs/does-not-exist', import.meta.url)
  const error = actualFailure(() => readFileSync(file))
  const result = driverFailure(error, import.meta.url)
  assert.equal(result.type, 'Error')
  assert.equal(result.code, 'ENOTDIR')
  assert.equal(result.label, null)
  assert.equal(JSON.stringify(result).includes('does-not-exist'), false)
  assert.equal(result.location_status, 'observed')
})

test('原驱动的实际来源验证错误保留固定 helper 位置', () => {
  for (const [file, run] of [
    ['codex-event-view.mjs', () => validateLinuxFinalCustody(undefined, undefined)],
    ['pi-event-view.mjs', () => validatePiEventView([], undefined)],
  ]) {
    const error = actualFailure(run)
    const result = driverFailure(error, new URL('./run-installed.mjs', import.meta.url))
    assert.equal(result.type, 'AssertionError')
    assert.equal(result.code, 'ERR_ASSERTION')
    assert.equal(result.locations[0].file, file)
    assert.ok(result.locations.every(location => location.file === file))
    assert.equal(JSON.stringify(result).includes('file:'), false)
    assert.equal(driverFailure(error, new URL('../run-installed.mjs', import.meta.url)).location_status, 'unavailable')
  }
})

test('已格式化的真实断言仍可定位，外部 formatter 保持原样', () => {
  const before = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace')
  try {
    const line = getCallSites(1)[0].lineNumber + 1
    const formatted = actualFailure(() => assert.fail('already_formatted_error'))
    assert.equal(typeof formatted.stack, 'string')
    assert.equal(driverFailure(formatted, import.meta.url).locations[0].line, line)
    assert.deepEqual(Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace'), before)
    const original = { configurable: true, enumerable: true, writable: false, value: () => 'existing formatter' }
    Object.defineProperty(Error, 'prepareStackTrace', original)
    const error = actualFailure(() => assert.fail('original_reader_failed'))
    assert.equal(error.stack, 'existing formatter')
    assert.equal(driverFailure(error, import.meta.url).location_status, 'unavailable')
    assert.deepEqual(Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace'), original)
    delete Error.prepareStackTrace
    driverFailure(actualFailure(() => assert.fail('original_reader_failed')), import.meta.url)
    assert.equal(Object.hasOwn(Error, 'prepareStackTrace'), false)
  } finally {
    if (before) Object.defineProperty(Error, 'prepareStackTrace', before)
    else delete Error.prepareStackTrace
  }
})

test('非 Error 与不可捕获位置不产生替代错误', () => {
  const result = driverFailure(null, import.meta.url)
  assert.equal(result.type, 'unknown')
  assert.equal(result.location_status, 'unavailable')
  assert.deepEqual(result.locations, [])
  const error = actualFailure(() => assert.fail('actual_source_changed'))
  const invalid = driverFailure(error, new URL('https://example.invalid/'))
  assert.equal(invalid.location_status, 'unavailable')
  assert.equal(invalid.label, 'actual_source_changed')
  assert.equal(driverFailure(error, new URL('./run-installed.mjs', import.meta.url)).location_status, 'unavailable')
})
