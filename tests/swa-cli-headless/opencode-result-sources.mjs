import assert from 'node:assert/strict'
import { DatabaseSync, backup } from 'node:sqlite'
import { randomBytes, randomUUID } from 'node:crypto'
import { realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export async function checkOpenCodeResultSources({ candidate, flow, worker, output }) {
  const requireRuntime = createRequire(join(candidate, 'runtime/package.json'))
  const { inspectNativeOpenCodePolicy } = requireRuntime('./native-opencode-policy.cjs')
  const { materializePrivateOpenCodeAccount } = requireRuntime('./private-opencode-account.cjs')
  const { readNativeOpenCodeSessionSource } = requireRuntime('./opencode-session-result.cjs')
  const selection = worker.source.selection, account = selection.native_launch.account, actual = worker.native_session
  assert.ok(['opencode-native-api-key', 'opencode-native-stepfun-api-key'].includes(account.kind))
  assert.equal(actual.format, 'opencode-sqlite-v2')
  const dataRoot = await realpath(dirname(dirname(account.private_root)))
  process.env.SWA_DATA_DIR = dataRoot
  process.env.SWA_INSTALL_ROOT = candidate
  // 显式来源仍由真实验收入口提供，缺失不能记为内容校验。
  assert.equal(await realpath(process.env.SWA_OPENCODE_API_KEY_HOME), account.source_home)
  const cwd = await realpath(actual.session.directory), projectId = account.private_root.split(/[\\/]/).at(-1)
  const snapshot = await inspectNativeOpenCodePolicy({ executable: selection.executable, version: selection.version, sourceHome: account.source_home, projectId, privateRoot: account.private_root, env: process.env, protectedRoots: [cwd, candidate, dataRoot] })
  assert.deepEqual(snapshot.policy, selection.native_launch)
  const source = new DatabaseSync(actual.path, { readOnly: true, allowExtension: false })
  source.exec('PRAGMA query_only=ON')
  const sourceRows = () => {
    const bound = source.prepare('SELECT count(*) AS count,sum(length(CAST(data AS BLOB))) AS bytes FROM session_message WHERE session_id=?').get(actual.native_id)
    assert.ok(bound.count <= 100_000 && (bound.bytes ?? 0) <= 12 * 1024 * 1024)
    return source.prepare('SELECT id,session_id,type,data,seq,time_created FROM session_message WHERE session_id=? ORDER BY seq').all(actual.native_id).map(row => ({ ...row }))
  }
  const observations = []
  try {
    const originalRows = sourceRows(), users = originalRows.filter(row => row.type === 'user')
    const hasBindingRecords = users.length > 0 && users.every(row => JSON.parse(row.data).metadata?.swa_input !== undefined)
    const parameters = { selection, sessionId: worker.source.native_session_id, nativeId: actual.native_id, cwd, stopped: false, projectId }
    assert.equal(typeof parameters.sessionId, 'string')
    assert.equal(actual.path, join(account.private_root, parameters.sessionId, 'data/opencode/opencode.db'))
    if (hasBindingRecords) {
      const result = await readNativeOpenCodeSessionSource(parameters)
      assert.equal(result.value.availability, 'complete')
      assert.deepEqual(result.value.messages.map(({ raw_data: _raw, ...row }) => row), actual.messages.map(({ raw_data: _raw, ...row }) => row))
      await result.verify()
      result.verifySync()
      observations.push({ name: 'actual_original_complete', outcome: 'passed', source: 'actual_original_worker_with_verified_input_binding' })
    } else {
      await assert.rejects(readNativeOpenCodeSessionSource(parameters))
      observations.push({ name: 'actual_original_without_new_binding', outcome: 'rejected', scope: 'original_reader_rejection_only', hmac_validation: 'NOT_PROVEN', complete_positive: 'NOT_RUN' })
    }
    assert.deepEqual(sourceRows(), originalRows)
    const sessionId = 'source-boundary-' + randomUUID()
    const root = await materializePrivateOpenCodeAccount(snapshot, sessionId, await realpath(join(candidate, 'runtime/opencode-policy')), randomBytes(32).toString('hex'))
    await backup(source, join(root, 'data/opencode/opencode.db'))
    const expectedMissing = join(root, 'data/opencode/auth.json')
    await assert.rejects(readNativeOpenCodeSessionSource({ ...parameters, sessionId }), error => error?.code === 'ENOENT' && error.path === expectedMissing)
    assert.deepEqual(sourceRows(), originalRows)
    observations.push({ name: 'backup_before_native_import', outcome: 'passed', root, rejection_layer: 'private_account_legacy_projection_absent', missing_path: expectedMissing, hmac_validation: 'NOT_REACHED', content_validation: 'NOT_REACHED', source: 'SQLite_backup_of_actual_native_session', orca_dispatch_created: false })
    for (const name of ['missing', 'damaged_json', 'invalid_utf8', 'over_limit', 'wrong_session', 'wrong_model', 'wrong_directory', 'unknown_content_block', 'non_string_text', 'missing_message_timestamp', 'unknown_message_type', 'invalid_sequence', 'empty_final_content', 'credential_missing', 'changed_after_read', 'replaced_after_read']) {
      observations.push({ name, outcome: 'NOT_RUN', reason: 'a_new_private_root_has_no_original_native_input_binding' })
    }
  } finally { source.close() }
  const result = { candidate, source_revision: flow.source_revision, real_runtime_id: flow.runtime_id, real_run_id: flow.run_id, real_dispatch_id: worker.worker.dispatchId, actual_source: actual.path, original_source_rows_unchanged: true, cases: observations, model_calls: 0, scope: 'actual_original_reader_and_exact_pre_import_backup_boundary' }
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ output, passed: observations.filter(row => row.outcome === 'passed').length, not_run: observations.filter(row => row.outcome === 'NOT_RUN').length, model_calls: 0 }))
}
