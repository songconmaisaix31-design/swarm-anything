import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/task-budget'), { recursive: true })
const directory = await mkdtemp(join(root, '.verification/task-budget/run-'))
const output = join(directory, 'task-budget.cjs')
const compiled = buildSync({ entryPoints: [join(root, 'runtime/swa-orca/src/task-budget.ts')], platform: 'node', format: 'cjs', bundle: true, write: false, nodePaths: [join(root, 'runtime/swa-orca/node_modules')] })
await writeFile(output, compiled.outputFiles[0].contents)
const { workerLimitSchema, approvedWorkerLimit, assertWorkerCapacity, assertCompletionInventory, assertWorkerStartOpen } = createRequire(output)(output)

const scope = { project_id: 'public-project', run_id: 'public-run', root_task_id: 'public-root' }
const task = limit => ({ id: scope.root_task_id, run_id: scope.run_id, parent_id: null, spec: JSON.stringify({ project_id: scope.project_id, spec: { max_workers: limit } }) })

test('fixed task reads its own approved positive safe-integer Worker limit', () => {
  for (const limit of [1, 2, 3, 5, Number.MAX_SAFE_INTEGER]) assert.equal(approvedWorkerLimit(task(limit), scope), limit)
  for (const limit of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, '3', null]) assert.equal(workerLimitSchema.safeParse(limit).success, false)
  for (const changes of [{ id: 'different-root' }, { run_id: 'different-run' }, { parent_id: 'child' }, { spec: JSON.stringify({ project_id: 'different-project', spec: { max_workers: 3 } }) }]) assert.throws(() => approvedWorkerLimit({ ...task(3), ...changes }, scope))
  assert.throws(() => approvedWorkerLimit({ ...task(3), spec: '{}' }, scope))
})

test('created Workers and unknown pending starts reserve the same approved capacity', () => {
  for (const limit of [1, 2, 3, 5]) {
    assert.doesNotThrow(() => assertWorkerCapacity(limit, limit - 1, 0))
    assert.throws(() => assertWorkerCapacity(limit, limit, 0), { code: 'resource_limit' })
    assert.throws(() => assertWorkerCapacity(limit, limit - 1, 1), { code: 'resource_limit' })
    assert.throws(() => assertWorkerCapacity(limit, 0, limit), { code: 'resource_limit' })
  }
  assert.doesNotThrow(() => assertWorkerCapacity(5, 2, 2))
  assert.throws(() => assertWorkerCapacity(3, -1, 0))
  assert.throws(() => assertWorkerCapacity(3, 0, 0.5))
})

test('completion requires observed Workers without demanding every allowed slot be used', () => {
  assert.doesNotThrow(() => assertCompletionInventory(3, 1, 0))
  assert.doesNotThrow(() => assertCompletionInventory(3, 3, 0))
  for (const [created, pending] of [[0, 0], [4, 0], [3, 1], [1, 1]]) assert.throws(() => assertCompletionInventory(3, created, pending), { code: 'evidence_missing' })
})

test('a terminal root or unknown completion reservation refuses a new Worker', () => {
  for (const status of ['pending', 'ready', 'dispatched', 'blocked']) {
    assert.doesNotThrow(() => assertWorkerStartOpen(status, 0))
    assert.throws(() => assertWorkerStartOpen(status, 1), { code: 'operation_in_progress' })
  }
  for (const status of ['completed', 'failed']) assert.throws(() => assertWorkerStartOpen(status, 0), { code: 'scope_denied' })
  assert.throws(() => assertWorkerStartOpen('unknown', 0))
})
