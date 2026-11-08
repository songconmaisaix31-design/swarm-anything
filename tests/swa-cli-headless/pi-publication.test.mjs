import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/pi-publication'), { recursive: true, mode: 0o700 })
const directory = await mkdtemp(join(root, '.verification/pi-publication/run-'))
const output = join(directory, 'publication.cjs')
const built = buildSync({
  stdin: {
    contents: `
      export { JournalHostDatabase, journalDatabasePath } from './third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-host-database';
      export { openAgentSessionJournal } from './third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-store-factory';
      export { createDeferredStructuredAgentSessionEventSink } from './third_party/orca-v1.4.230/src/main/native-chat/agent-session-wire/structured-agent-session-event-sink';
      export { agentJournalItemKey } from './third_party/orca-v1.4.230/src/shared/agent-session-journal-item-key';
      export { AGENT_JOURNAL_THREAD_SCOPE } from './third_party/orca-v1.4.230/src/shared/agent-session-journal-types';
      export { parseJournalRow } from './third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-row-schema';
    `,
    resolveDir: root,
    loader: 'ts'
  },
  absWorkingDir: root,
  outfile: output,
  tsconfig: join(root, 'runtime/swa-orca/tsconfig.json'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  nodePaths: [join(root, 'runtime/swa-orca/node_modules'), join(root, 'node_modules')],
  alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') },
  external: ['*.node'],
  metafile: true,
  logLevel: 'silent'
})
await writeFile(join(directory, 'metafile.json'), JSON.stringify(built.metafile, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
const inputs = Object.keys(built.metafile.inputs).map(path => resolve(root, path))
for (const source of [
  'agent-session-wire/structured-agent-session-transition.ts',
  'agent-session-wire/structured-agent-session-event-sink-queue.ts',
  'agent-session-journal/journal-store.ts',
  'agent-session-journal/journal-step-writer.ts',
  'agent-session-journal/journal-write-queue.ts',
  '../sqlite/sync-database.ts'
]) assert.ok(inputs.includes(resolve(root, 'third_party/orca-v1.4.230/src/main/native-chat', source)), `Actual production source missing: ${source}`)
assert.equal(inputs.some(path => /(?:sdk\.mjs|pi-coding-agent|src\/main\/(?:pi|jsonl-rpc)\/)/.test(path)), false)
const api = createRequire(output)(output)

// 仅普通状态文本的本地持久化组件；不构造 Agent/RPC/模型协议或模拟 journal/queue。
async function fixture(name, run) {
  const stateDirectory = await mkdtemp(join(directory, name + '-'))
  const sessionId = 'local-publication-' + name
  const database = api.JournalHostDatabase.open(stateDirectory)
  let journal, reader, deferred
  try {
    journal = await api.openAgentSessionJournal({
      database,
      identity: { sessionId, workspaceId: 'local-component-workspace', hostId: 'local', agent: 'pi', providerHandle: null }
    })
    reader = new DatabaseSync(api.journalDatabasePath(stateDirectory), { readOnly: true })
    const diagnostics = [], order = []
    const rows = () => reader.prepare('SELECT row_json FROM journal_rows WHERE session_id = ? AND epoch = ? ORDER BY seq ASC')
      .all(sessionId, journal.epoch).map(row => {
        const parsed = api.parseJournalRow(row.row_json)
        assert.equal(parsed.ok, true)
        return parsed.row
      })
    journal.observeCommits(() => order.push('commit'))
    let onPublish = () => {}
    deferred = api.createDeferredStructuredAgentSessionEventSink({
      sessionId,
      logger: { warn: (...event) => diagnostics.push(event), error: (...event) => diagnostics.push(event) }
    })
    deferred.bind({ journal, fence: 1, publish: () => { order.push('publish'); onPublish() } })
    const context = {
      journal, sink: deferred.sink, rows, order,
      setPublishObserver: observer => { onPublish = observer },
      submit: transition => assert.deepEqual(deferred.sink.tryAppendTransition(transition), { accepted: true }),
      written: async () => {
        assert.deepEqual(await deferred.sink.written(), { ok: true })
        order.push('written')
      }
    }
    await run(context)
    assert.deepEqual(await deferred.drained(), { ok: true })
    assert.deepEqual(diagnostics, [])
    await writeFile(join(stateDirectory, 'observed-order.json'), JSON.stringify(order) + '\n', { flag: 'wx', mode: 0o600 })
  } finally {
    deferred?.close()
    await journal?.close()
    reader?.close()
    database.close()
  }
}

const identity = name => ({ provider: 'orca', clientMessageId: 'local-publication-' + name })
const status = text => ({ kind: 'status', text })
const item = resolveItem => ({ kind: 'item', reservedBytes: 4096, resolve: resolveItem, options: { turnScope: api.AGENT_JOURNAL_THREAD_SCOPE } })

test('actual item writes report their resolved durable keys after publication and before written', { timeout: 10_000 }, async () => {
  await fixture('items', async ({ journal, rows, order, setPublishObserver, submit, written }) => {
    const first = identity('first'), firstKey = api.agentJournalItemKey(first)
    let actualSecond = null, report = null
    const durableItems = () => rows().filter(row => row.kind === 'item')
    setPublishObserver(() => {
      assert.equal(durableItems().length, 2)
      assert.equal(report, null)
    })
    submit({
      lifecycle: false, publish: true,
      steps: [
        item(() => ({ identity: first, body: status('public local marker') })),
        item(view => {
          assert.equal(view.itemBody(firstKey)?.text, 'public local marker')
          actualSecond = identity('after-' + view.itemBody(firstKey).text)
          return { identity: actualSecond, body: status('public local derived marker') }
        })
      ],
      onPublished: observed => {
        order.push('observer')
        assert.notEqual(actualSecond, null)
        const keys = [firstKey, api.agentJournalItemKey(actualSecond)]
        assert.deepEqual(durableItems().map(row => row.itemId), keys)
        assert.deepEqual(observed, { journalEpoch: journal.epoch, published: true, steps: keys.map(itemId => ({ kind: 'item', written: true, itemId })) })
        report = observed
      }
    })
    await written()
    assert.notEqual(report, null)
    assert.deepEqual(order, ['commit', 'commit', 'publish', 'observer', 'written'])
  })
})

test('actual null and empty steps call the observer without claiming a write or publication', { timeout: 10_000 }, async () => {
  await fixture('no-op', async ({ journal, rows, order, submit, written }) => {
    const before = rows(), cursor = journal.cursor()
    let report = null
    submit({
      lifecycle: true, publish: true,
      steps: [item(() => null), { kind: 'settlement', settlementId: 'local-empty-settlement', reservedBytes: 1, resolve: () => [] }],
      onPublished: observed => { order.push('observer'); report = observed }
    })
    await written()
    assert.deepEqual(report, {
      journalEpoch: cursor.epoch, published: false,
      steps: [{ kind: 'item', written: false, itemId: null }, { kind: 'settlement', written: false, settlementId: 'local-empty-settlement' }]
    })
    assert.deepEqual(journal.cursor(), cursor)
    assert.deepEqual(rows(), before)
    assert.deepEqual(order, ['observer', 'written'])
  })
})

test('actual settlement reports its durable id once and rejects duplicate-write claims', { timeout: 10_000 }, async () => {
  await fixture('settlement', async ({ journal, rows, order, submit, written }) => {
    const local = identity('settlement-target'), key = api.agentJournalItemKey(local)
    submit({ lifecycle: false, publish: false, steps: [item(() => ({ identity: local, body: status('public seed marker') }))] })
    await written()
    order.length = 0
    const reports = [], settlementId = 'local-repeatable-settlement'
    const settle = text => ({
      lifecycle: true, publish: true,
      steps: [{ kind: 'settlement', settlementId, reservedBytes: 4096, resolve: () => [{ kind: 'item', identity: local, body: status(text), turnScope: api.AGENT_JOURNAL_THREAD_SCOPE }] }],
      onPublished: report => { order.push('observer'); reports.push(report) }
    })
    submit(settle('public first settlement marker'))
    await written()
    const firstRows = rows(), firstCursor = journal.cursor()
    const batches = firstRows.filter(row => row.kind === 'lifecycle-batch')
    assert.equal(batches.length, 1)
    assert.equal(batches[0].settlementId, settlementId)
    assert.equal(batches[0].mutations[0].itemId, key)
    submit(settle('public duplicate must remain unwritten'))
    await written()
    assert.deepEqual(rows(), firstRows)
    assert.deepEqual(journal.cursor(), firstCursor)
    assert.deepEqual(journal.itemBody(key), status('public first settlement marker'))
    assert.deepEqual(reports, [
      { journalEpoch: journal.epoch, published: true, steps: [{ kind: 'settlement', written: true, settlementId }] },
      { journalEpoch: journal.epoch, published: false, steps: [{ kind: 'settlement', written: false, settlementId }] }
    ])
    assert.deepEqual(order, ['commit', 'publish', 'observer', 'written', 'observer', 'written'])
  })
})
