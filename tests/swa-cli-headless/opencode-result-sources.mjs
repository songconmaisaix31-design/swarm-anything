import assert from 'node:assert/strict'
import { DatabaseSync, backup } from 'node:sqlite'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export async function checkOpenCodeResultSources({ candidate, flow, worker, output }) {
  const requireRuntime = createRequire(join(candidate, 'runtime/package.json'))
  const { inspectNativeOpenCodePolicy } = requireRuntime('./native-opencode-policy.cjs')
  const { materializePrivateOpenCodeAccount } = requireRuntime('./private-opencode-account.cjs')
  const { readNativeOpenCodeSessionSource } = requireRuntime('./opencode-session-result.cjs')
  const selection = worker.source.selection, account = selection.native_launch.account, actual = worker.native_session
  assert.equal(account.kind, 'opencode-native-api-key')
  assert.equal(actual.format, 'opencode-sqlite-v2')
  const dataRoot = await realpath(dirname(dirname(account.private_root)))
  process.env.SWA_DATA_DIR = dataRoot
  process.env.SWA_INSTALL_ROOT = candidate
  const source = new DatabaseSync(actual.path, { readOnly: true })
  const sourceRows = () => source.prepare('SELECT id,session_id,type,data,seq,time_created FROM session_message WHERE session_id=? ORDER BY seq').all(actual.native_id).map(row => ({ ...row }))
  const originalRows = sourceRows(), observations = []
  const cases = ['complete', 'missing', 'damaged_json', 'invalid_utf8', 'over_limit', 'wrong_session', 'wrong_model', 'wrong_directory', 'unknown_content_block', 'non_string_text', 'missing_message_timestamp', 'unknown_message_type', 'invalid_sequence', 'empty_final_content', 'credential_missing', 'changed_after_read', 'replaced_after_read']
  try {
    for (const name of cases) {
      const sessionId = 'source-fault-' + randomUUID(), snapshot = await inspectNativeOpenCodePolicy({ executable: selection.executable, version: selection.version, sourceHome: account.source_home, projectId: flow.initialB.source.selection.native_launch.account.private_root.split(/[\\/]/).at(-1), privateRoot: account.private_root })
      assert.deepEqual(snapshot.policy, selection.native_launch)
      const root = await materializePrivateOpenCodeAccount(snapshot, sessionId, await realpath(join(candidate, 'runtime/opencode-policy')), randomBytes(32).toString('hex'))
      const path = join(root, 'data/opencode/opencode.db')
      await backup(source, path)
      const parameters = { selection, sessionId, nativeId: actual.native_id, cwd: await realpath(actual.session.directory), stopped: false, projectId: account.private_root.split(/[\\/]/).at(-1) }
      const read = () => readNativeOpenCodeSessionSource(parameters)
      if (name === 'missing') await rename(path, path + '.missing-copy')
      else if (name === 'wrong_session') parameters.nativeId = 'ses_missing_' + randomUUID()
      else if (!['complete', 'changed_after_read', 'replaced_after_read'].includes(name)) {
        const database = new DatabaseSync(path)
        try {
          const last = database.prepare("SELECT id,data FROM session_message WHERE session_id=? AND type='assistant' ORDER BY seq DESC LIMIT 1").get(actual.native_id)
          assert.ok(last)
          const message = JSON.parse(last.data)
          if (name === 'wrong_model') database.prepare('UPDATE session_v2 SET model=? WHERE id=?').run(JSON.stringify({ id: 'deepseek-flash', providerID: 'deepseek' }), actual.native_id)
          else if (name === 'wrong_directory') database.prepare('UPDATE session_v2 SET directory=? WHERE id=?').run(root, actual.native_id)
          else if (name === 'credential_missing') database.prepare('DELETE FROM credential').run()
          else if (name === 'invalid_sequence') database.prepare('UPDATE session_message SET seq=0 WHERE id=?').run(last.id)
          else if (name === 'unknown_message_type') database.prepare('UPDATE session_message SET type=? WHERE id=?').run('unsupported-message-type', last.id)
          else if (name === 'damaged_json') database.prepare('UPDATE session_message SET data=? WHERE id=?').run(last.data.slice(0, -1), last.id)
          else if (name === 'invalid_utf8') database.prepare('UPDATE session_message SET data=CAST(? AS TEXT) WHERE id=?').run(Buffer.from([255]), last.id)
          else {
            const text = message.content.find(part => part.type === 'text'); assert.ok(text)
            if (name === 'unknown_content_block') text.type = 'unsupported-content-block'
            if (name === 'non_string_text') text.text = 17
            if (name === 'missing_message_timestamp') delete message.time.created
            if (name === 'empty_final_content') message.content = []
            if (name === 'over_limit') text.text = text.text.repeat(Math.ceil((12 * 1024 * 1024 + 1) / Buffer.byteLength(text.text)))
            database.prepare('UPDATE session_message SET data=? WHERE id=?').run(JSON.stringify(message), last.id)
          }
        } finally { database.close() }
      }
      if (name === 'complete') {
        const result = await read()
        assert.equal(result.value.availability, 'complete')
        assert.deepEqual(result.value.messages, actual.messages)
      } else if (['changed_after_read', 'replaced_after_read'].includes(name)) {
        const result = await read()
        if (name === 'replaced_after_read') { await rename(path, path + '.previous-copy'); await backup(source, path) }
        else { const database = new DatabaseSync(path); try { database.prepare('UPDATE session_v2 SET title=title || ? WHERE id=?').run(' source-copy-fault', actual.native_id) } finally { database.close() } }
        await assert.rejects(result.verify(), /changed_during_collection/)
      } else await assert.rejects(read())
      assert.deepEqual(sourceRows(), originalRows)
      observations.push({ name, outcome: 'passed', root, source: 'SQLite_backup_of_actual_native_session', actual_native_id: actual.native_id, orca_dispatch_created: false })
    }
  } finally { source.close() }
  const result = { candidate, source_revision: flow.source_revision, real_runtime_id: flow.runtime_id, real_run_id: flow.run_id, real_dispatch_id: worker.worker.dispatchId, actual_source: actual.path, original_source_rows_unchanged: true, cases: observations, model_calls: 0, scope: 'actual_native_SQLite_and_owned_backup_faults' }
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ output, actual_native_SQLite_cases: observations.length, model_calls: 0 }))
}
