import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/pi-input-turn'), { recursive: true, mode: 0o700 })
const directory = await mkdtemp(join(root, '.verification/pi-input-turn/run-'))
const dependencies = await realpath(join(root, 'runtime/swa-orca/node_modules'))
await symlink(dependencies, join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
assert.equal(await realpath(join(directory, 'node_modules')), dependencies)
const output = join(directory, 'input-turn.cjs')
buildSync({
  stdin: { contents: "export { readPiJournalInputTurn } from './runtime/swa-orca/src/pi-session-result'; export { agentJournalItemKey } from './third_party/orca-v1.4.230/src/shared/agent-session-journal-item-key';", resolveDir: root, loader: 'ts' },
  outfile: output, bundle: true, platform: 'node', format: 'cjs', target: 'node24', logLevel: 'silent',
  tsconfig: join(root, 'runtime/swa-orca/tsconfig.json'), nodePaths: [join(root, 'runtime/swa-orca/node_modules'), join(root, 'node_modules')],
  conditions: ['orca-source'], alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') },
  external: ['electron', 'node-pty', '*.node', '@orca/windows-security', '@orca/windows-registry', '@vscode/windows-process-tree']
})
const { readPiJournalInputTurn, agentJournalItemKey } = createRequire(output)(output)
const actual = JSON.parse(await readFile(new URL('fixtures/pi-6190-user-turn.json', import.meta.url), 'utf8'))
const journal = (turn = actual.turn) => ({ items: new Map([[turn.itemId, turn]]), aliases: new Map(), itemFences: new Map([[turn.itemId, actual.fence]]) })

// 真fixture仅为原fold的关联元数据；字段反例只检查纯函数，不构造原生协议或模型证据。
test('actual thread-scoped accepted user resolves its declared failure turn without changing either scope or outcome', () => {
  const before = JSON.stringify(actual), state = journal()
  const turn = readPiJournalInputTurn(state, actual.user, actual.sessionId, actual.fence)
  assert.equal(turn, actual.turn)
  assert.equal(turn.body.outcome, 'failure')
  assert.equal(actual.user.turnScope.kind, 'thread')
  assert.equal(JSON.stringify(actual), before)
})

test('explicit turn scope still names its real turn without claiming it opened another turn', () => {
  const scoped = { ...actual.user, turnScope: { kind: 'turn', turnItemId: actual.turn.itemId } }
  const turn = { ...actual.turn, body: { ...actual.turn.body, userItemId: agentJournalItemKey({ provider: 'orca', clientMessageId: 'different-opener-rule' }) } }
  assert.equal(readPiJournalInputTurn(journal(turn), scoped, actual.sessionId, actual.fence), turn)
  assert.throws(() => readPiJournalInputTurn(journal(turn), actual.user, actual.sessionId, actual.fence), /accepted_user_turn_missing/)
})

test('thread association refuses missing, ambiguous or unbound turn metadata', () => {
  const empty = journal(); empty.items.clear()
  assert.throws(() => readPiJournalInputTurn(empty, actual.user, actual.sessionId, actual.fence), /accepted_user_turn_missing/)
  const duplicate = journal(), turnId = `${actual.turn.body.turnId}:duplicate-rule`
  const extra = { ...actual.turn, itemId: agentJournalItemKey({ provider: 'legacy', agent: 'pi', sessionId: actual.sessionId, recordId: `turn-lifecycle:${turnId}` }), body: { ...actual.turn.body, turnId } }
  duplicate.items.set(extra.itemId, extra); duplicate.itemFences.set(extra.itemId, actual.fence)
  assert.throws(() => readPiJournalInputTurn(duplicate, actual.user, actual.sessionId, actual.fence), /accepted_user_turn_missing/)
  assert.throws(() => readPiJournalInputTurn(journal(), { itemId: actual.user.itemId }, actual.sessionId, actual.fence), /accepted_user_turn_missing/)
})

test('association preserves exact root producer, session and fence', () => {
  assert.throws(() => readPiJournalInputTurn(journal({ ...actual.turn, agentId: '' }), actual.user, actual.sessionId, actual.fence), /accepted_user_turn_changed/)
  assert.throws(() => readPiJournalInputTurn(journal(), actual.user, '', actual.fence), /accepted_user_turn_changed/)
  assert.throws(() => readPiJournalInputTurn(journal(), actual.user, actual.sessionId, actual.fence + 1), /accepted_user_turn_changed/)
})
