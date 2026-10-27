import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { runInNewContext } from 'node:vm'
import { NODE_RUNTIME_ASSETS } from '../third_party/orca-v1.4.230/src/shared/node-runtime-pin.ts'

const { values } = parseArgs({ options: { git: { type: 'string' }, phase: { type: 'string' }, output: { type: 'string' } }, allowPositionals: false })
assert.equal(process.platform, 'win32')
assert.equal(process.arch, 'x64')
assert.equal(process.version, 'v24.21.0')
assert.ok(values.git && isAbsolute(values.git) && values.output && isAbsolute(values.output))
assert.ok(['before-devshell', 'after-devshell'].includes(values.phase))
assert.match(process.env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/)
assert.equal(createHash('sha256').update(await readFile(process.execPath)).digest('hex'), NODE_RUNTIME_ASSETS['win32-x64'].executableSha256)
const checkout = resolve(process.env.GITHUB_WORKSPACE)
assert.equal(resolve(process.cwd()).toLowerCase(), checkout.toLowerCase())
const failedSource = '82e1b09503486c14a9dececb5e3673827894c120'
const original = execFileSync(values.git, ['show', failedSource + ':scripts/build-swa-package.mjs'], { cwd: checkout, encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024, windowsHide: true })
const load = createRequire(join(checkout, 'runtime/swa-orca/package.json')), ts = load('typescript')
const file = ts.createSourceFile('build-swa-package.mjs', original, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const assignments = []
const visit = node => {
  if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression) && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken && node.expression.left.getText(file) === 'environment.PATH') assignments.push(node.expression.getText(file))
  ts.forEachChild(node, visit)
}
visit(file)
assert.equal(assignments.length, 1)
assert.equal(assignments[0], "environment.PATH = nodeDirectory + ';' + environment.PATH")
const nodeDirectory = dirname(process.execPath)
const pathKeys = environment => Object.keys(environment).filter(key => key.toLowerCase() === 'path').sort()
const observe = environment => {
  const actual = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, env: environment, encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024, windowsHide: true })
  const keys = pathKeys(environment)
  assert.ok(!actual.error || actual.error.code === 'ENOENT', 'The Git observation has an unknown process failure')
  assert.equal(actual.signal, null)
  if (!actual.error) assert.equal(actual.status, 0, 'The actual Git command failed after starting')
  return { path_keys: keys, path_key_count: keys.length, exact_uppercase_path_present: Object.hasOwn(environment, 'PATH'), path_contains_undefined_entry: keys.some(key => environment[key].split(delimiter).includes('undefined')), git_spawn_error_code: actual.error?.code ?? null, git_exit: actual.status, git_source_matches_checkout: actual.status === 0 && actual.stdout.trim() === process.env.GITHUB_SHA }
}
const inherited = { ...process.env }, assigned = { ...process.env }, normalized = { ...process.env }
const keys = pathKeys(inherited)
assert.equal(keys.length, 1)
assert.equal(typeof inherited[keys[0]], 'string')
runInNewContext(assignments[0], { environment: assigned, nodeDirectory })
const actualPath = inherited[keys[0]]
for (const key of keys) delete normalized[key]
normalized.PATH = nodeDirectory + delimiter + actualPath
const observations = { inherited: observe(inherited), failed_source_assignment: observe(assigned), single_key_control: observe(normalized) }
const result = { diagnostic_only: true, failed_source_revision: failedSource, actual_probe_revision: process.env.GITHUB_SHA, actual_node: process.version, phase: values.phase, original_path_assignment_count: assignments.length, observations, original_stderr_exported: false, path_values_exported: false, product_modified: false, native_compilation: 'NOT_RUN', model_calls: 0 }
await writeFile(values.output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
if (values.phase === 'before-devshell') assert.equal(observations.inherited.git_source_matches_checkout, true)
assert.equal(observations.single_key_control.git_source_matches_checkout, true, 'The single PATH key control did not restore the actual Git lookup')
