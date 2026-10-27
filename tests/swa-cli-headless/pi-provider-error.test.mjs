import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/pi-provider-error'), { recursive: true, mode: 0o700 })
const directory = await mkdtemp(join(root, '.verification/pi-provider-error/run-'))
const modules = {}
for (const name of ['rpc-protocol', 'rpc-prompt-delivery']) {
  const output = join(directory, `${name}.cjs`)
  buildSync({ entryPoints: [join(root, 'third_party/orca-v1.4.230/src/main/pi', `${name}.ts`)], outfile: output, bundle: true, platform: 'node', format: 'cjs', target: 'node24', logLevel: 'silent', nodePaths: [join(root, 'runtime/swa-orca/node_modules')], tsconfig: join(root, 'runtime/swa-orca/tsconfig.json'), alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') } })
  modules[name] = createRequire(output)(output)
}
const { parseStrictPiJson, strictPiMessageSchema, strictPiNativeEntrySchema } = modules['rpc-protocol']
const { piRpcFailureFact } = modules['rpc-prompt-delivery']
const bytes = await readFile(new URL('fixtures/pi-stepfun-502-native-entry.json', import.meta.url))
assert.equal(createHash('sha256').update(bytes).digest('hex'), '93cb7e9db494fa00ef4c39623443c108b43b3ffd16feb550679d9a652ddb196d')
const original = parseStrictPiJson(bytes.toString('utf8'))
const { errorMessage, ...withoutError } = original.message

// 原件是实际 native entry；下列字段差分仅验证 schema 分支，不作为原生执行证据。
test('the actual StepFun 502 entry retains its provider failure and diagnostic', () => {
  const entry = strictPiNativeEntrySchema.parse(original)
  assert.deepEqual(entry, original)
  assert.deepEqual(strictPiMessageSchema.parse(original.message), original.message)
  assert.equal(entry.message.stopReason, 'error')
  assert.equal(entry.message.errorMessage, '502 status code (no body)')
  assert.deepEqual(entry.message.content, [])
  const failure = piRpcFailureFact(entry.message.errorMessage)
  assert.equal(failure.kind, 'providerRejected')
  assert.deepEqual(failure.detail, { text: errorMessage, audience: 'person' })
})

test('the official optional error diagnostic does not change its error stop reason', () => {
  const parsed = strictPiMessageSchema.parse(withoutError)
  assert.equal(parsed.stopReason, 'error')
  assert.equal(parsed.errorMessage, undefined)
  assert.equal(strictPiMessageSchema.safeParse({ ...withoutError, errorMessage: null }).success, false)
  assert.equal(strictPiMessageSchema.safeParse({ ...withoutError, errorMessage: 502 }).success, false)
})

test('aborted still requires one of the two reviewed abort diagnostics', () => {
  for (const text of ['Request aborted', 'Request was aborted']) {
    assert.equal(strictPiMessageSchema.parse({ ...withoutError, stopReason: 'aborted', errorMessage: text }).errorMessage, text)
  }
  assert.equal(strictPiMessageSchema.safeParse({ ...withoutError, stopReason: 'aborted' }).success, false)
  assert.equal(strictPiMessageSchema.safeParse({ ...original.message, stopReason: 'aborted' }).success, false)
})

test('pending and successful stop reasons still refuse an error diagnostic', () => {
  for (const stopReason of ['pending', 'stop', 'length']) {
    assert.equal(strictPiMessageSchema.parse({ ...withoutError, stopReason }).stopReason, stopReason)
    assert.equal(strictPiMessageSchema.safeParse({ ...original.message, stopReason }).success, false)
  }
})

test('the error branch retains the reviewed stop reasons and strict field set', () => {
  for (const stopReason of ['toolUse', 'deferred']) {
    assert.equal(strictPiMessageSchema.safeParse({ ...original.message, stopReason }).success, false)
  }
  assert.equal(strictPiMessageSchema.safeParse({ ...original.message, unreviewed: true }).success, false)
  assert.equal(strictPiNativeEntrySchema.safeParse({ ...original, unreviewed: true }).success, false)
})
