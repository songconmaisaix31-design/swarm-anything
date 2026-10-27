import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/pi-final-block'), { recursive: true, mode: 0o700 })
const directory = await mkdtemp(join(root, '.verification/pi-final-block/run-'))
const dependencies = await realpath(join(root, 'runtime/swa-orca/node_modules'))
await symlink(dependencies, join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
assert.equal(await realpath(join(directory, 'node_modules')), dependencies)
const output = join(directory, 'final-block.cjs')
buildSync({
  stdin: { contents: "export { readPiFinalBlock } from './runtime/swa-orca/src/pi-session-result';", resolveDir: root, loader: 'ts' },
  outfile: output, bundle: true, platform: 'node', format: 'cjs', target: 'node24', logLevel: 'silent',
  tsconfig: join(root, 'runtime/swa-orca/tsconfig.json'), nodePaths: [join(root, 'runtime/swa-orca/node_modules'), join(root, 'node_modules')],
  conditions: ['orca-source'], alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') },
  external: ['electron', 'node-pty', '*.node', '@orca/windows-security', '@orca/windows-registry', '@vscode/windows-process-tree']
})
const { readPiFinalBlock } = createRequire(output)(output)
const actual = JSON.parse(await readFile(new URL('fixtures/pi-aba-final-close.json', import.meta.url), 'utf8'))

// 真实fixture仅保原block type/index与journal role；字段反例是纯规则，不构造原生事件。
test('all recorded final closes retain their exact native block index and journal role', () => {
  const before = JSON.stringify(actual)
  for (const worker of actual.workers) for (const close of worker.closes) {
    assert.deepEqual(readPiFinalBlock(worker.content, close.provider_item), { index: close.index, role: close.role })
  }
  assert.equal(JSON.stringify(actual), before)
})

test('thinking and text cannot exchange their declared channels', () => {
  for (const worker of actual.workers.filter(value => value.closes.length)) {
    const reversed = [...worker.content].reverse()
    for (const close of worker.closes) assert.throws(() => readPiFinalBlock(reversed, close.provider_item), /final_journal_text_changed/)
  }
})

test('missing native content indices cannot be supplied by another block', () => {
  for (const worker of actual.workers.filter(value => value.closes.length)) {
    assert.throws(() => readPiFinalBlock(worker.content.slice(0, 1), worker.closes[1].provider_item), /final_journal_text_changed/)
  }
})

test('unsupported types and the recorded empty error content do not supply a final text block', () => {
  const original = actual.workers[0]
  assert.throws(() => readPiFinalBlock([{ type: 'toolCall' }, original.content[1]], original.closes[0].provider_item), /final_journal_text_changed/)
  const error = actual.workers.find(value => value.stop_reason === 'error')
  assert.equal(error.closes.length, 0)
  for (const close of original.closes) assert.throws(() => readPiFinalBlock(error.content, close.provider_item), /final_journal_text_changed/)
})

console.log(JSON.stringify({ evidence: directory, coverage: 'recorded block type/index/role metadata and explicit pure field counterexamples', whole_reader_export: 'NOT_RUN' }))
