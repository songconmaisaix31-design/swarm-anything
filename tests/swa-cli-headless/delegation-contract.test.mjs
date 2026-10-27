import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url)), requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/delegation-contract'), { recursive: true })
const directory = await mkdtemp(join(root, '.verification/delegation-contract/case-')), bundle = join(directory, 'contracts.cjs')
const built = buildSync({ stdin: { contents: "export * from './runtime/swa-orca/src/contracts'; export { strictPiQuestionRawSchema, strictPiCollaborationRawSchema } from './third_party/orca-v1.4.230/src/main/pi/rpc-protocol'", resolveDir: root }, platform: 'node', format: 'cjs', bundle: true, write: false, alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') }, nodePaths: [join(root, 'runtime/swa-orca/node_modules')] })
await writeFile(bundle, built.outputFiles[0].contents)
const { delegationRequestID, delegationWorkerRequestID, delegationToolParamsSchema, commandSchema, nativePiToolsSchema, nativeToolModes, strictPiQuestionRawSchema, strictPiCollaborationRawSchema } = createRequire(bundle)(bundle)

// 构造输入仅验证公开规则；真实工具调用和并发启动由服务验收覆盖。
const origin = { nativeSessionId: '0199dc51-df41-7000-8000-000000000001', assistantEntryId: 'entry-a', toolCallId: 'call-a' }
const params = { role_id: 'reviewer', revision: 2, input: 'Review the assigned public file.', completion_criteria: ['Return the verified issue.'], mode: 'consult' }

test('native delegation identity is stable for one call and separate from its Worker mutation', () => {
  const first = delegationRequestID('session-a', origin)
  assert.equal(delegationRequestID('session-a', { ...origin }), first)
  assert.notEqual(delegationWorkerRequestID(first), first)
  assert.notEqual(delegationRequestID('session-b', origin), first)
  assert.notEqual(delegationRequestID('session-a', { ...origin, toolCallId: 'call-b' }), first)
})

test('model delegation parameters cannot choose a project, parent or caller', () => {
  assert.deepEqual(delegationToolParamsSchema.parse(params), params)
  for (const field of ['project_id', 'parent_task_id', 'controller', 'caller', 'agent', 'model']) assert.throws(() => delegationToolParamsSchema.parse({ ...params, [field]: 'other' }))
  for (const change of [{ revision: 0 }, { completion_criteria: [] }, { input: ' ' }, { mode: 'notify' }]) assert.throws(() => delegationToolParamsSchema.parse({ ...params, ...change }))
})

test('delegation and questions remain independently selected and file tools unavailable', () => {
  assert.deepEqual(nativeToolModes({ mode: 'questions-only', allowed: ['swa_ask'] }), { questionMode: 'native', delegationMode: 'disabled' })
  assert.deepEqual(nativeToolModes({ mode: 'collaboration', allowed: ['swa_delegate'] }), { questionMode: 'disabled', delegationMode: 'native' })
  assert.throws(() => commandSchema.parse({ action: 'worker.send', delegation_mode: 'native' }))
  const tools = { mode: 'collaboration', native_contract: 'pi-cli-1.0.1', extension: { path: '/installed/runtime/pi-collaboration-extension.mjs', version: 'source' }, allowed: ['swa_delegate'] }
  assert.deepEqual(nativePiToolsSchema.parse(tools), tools)
  assert.throws(() => nativePiToolsSchema.parse({ ...tools, allowed: ['swa_delegate', 'bash'] }))
  const frame = { type: 'tool_execution_start', toolCallId: 'call-a', toolName: 'swa_delegate', args: params }
  assert.deepEqual(strictPiCollaborationRawSchema.parse(frame), frame)
  assert.throws(() => strictPiQuestionRawSchema.parse(frame))
})
