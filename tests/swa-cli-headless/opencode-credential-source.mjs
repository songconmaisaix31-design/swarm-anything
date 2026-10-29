import assert from 'node:assert/strict'
import { copyFile, mkdir, readFile, realpath, rename, stat, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join } from 'node:path'
import { DatabaseSync, backup } from 'node:sqlite'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { candidate: { type: 'string' }, source: { type: 'string' }, output: { type: 'string' } }, allowPositionals: false })
for (const name of ['candidate', 'source', 'output']) assert.ok(values[name] && isAbsolute(values[name]), `Actual absolute ${name} required`)
const candidate = await realpath(values.candidate), source = await realpath(values.source), output = values.output
const require = createRequire(import.meta.url)
const { readOpenCodeCredential, readOpenCodeDatabaseIdentity, assertOpenCodeCredentialCurrent } = require(join(candidate, 'runtime/native-opencode-policy.cjs'))
const owned = join(dirname(output), 'credential-source-copies')
await mkdir(owned)
const observations = []
const input = new DatabaseSync(source, { readOnly: true })
try {
  input.exec('PRAGMA query_only=ON')
  assert.ok(input.prepare('SELECT COUNT(*) AS n FROM session_v2').get().n > 0, 'Require an actual native session database')
  const actual = readOpenCodeCredential(source)
  const original = input.prepare('SELECT id,time_updated,value FROM credential WHERE id=?').get(actual.id)
  assert.ok(original)
  const create = async name => {
    const path = join(owned, name + '.db')
    await backup(input, path)
    const identity = readOpenCodeDatabaseIdentity(path), credential = readOpenCodeCredential(path)
    assert.equal(credential.id, actual.id)
    assert.equal(credential.key, actual.key)
    return { path, identity, credential }
  }
  const check = row => assertOpenCodeCredentialCurrent(row.identity, row.credential.id, row.credential.updatedAt, row.credential.key)

  const stable = await create('unrelated-wal')
  const writer = new DatabaseSync(stable.path)
  try {
    writer.exec('PRAGMA journal_mode=WAL')
    const before = await stat(stable.path + '-wal', { bigint: true })
    const version = writer.prepare('PRAGMA user_version').get().user_version
    writer.exec(`PRAGMA user_version=${Number(version) + 1}`)
    const after = await stat(stable.path + '-wal', { bigint: true })
    assert.ok(before.size !== after.size || before.mtimeNs !== after.mtimeNs, 'The real WAL must change')
    check(stable)
    writer.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    check(stable)
    observations.push({ name: 'actual_unrelated_wal_and_checkpoint', outcome: 'passed' })
    const bytesBefore = await Promise.all([stable.path, stable.path + '-wal', stable.path + '-shm'].map(path => readFile(path)))
    check(stable)
    const bytesAfter = await Promise.all([stable.path, stable.path + '-wal', stable.path + '-shm'].map(path => readFile(path)))
    for (let index = 0; index < bytesBefore.length; index++) assert.ok(bytesBefore[index].equals(bytesAfter[index]), 'Read-only credential check changed SQLite data or sidecars')
    observations.push({ name: 'readonly_database_and_sidecars_unchanged', outcome: 'passed' })
  } finally { writer.close() }

  for (const kind of ['value', 'timestamp', 'removed']) {
    const row = await create('credential-' + kind)
    const writer = new DatabaseSync(row.path)
    try {
      writer.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0')
      const databaseBefore = await readFile(row.path)
      if (kind === 'value') {
        const value = JSON.parse(original.value)
        value.key = value.key.slice(0, -1)
        writer.prepare('UPDATE credential SET value=? WHERE id=?').run(JSON.stringify(value), actual.id)
      } else if (kind === 'timestamp') writer.prepare('UPDATE credential SET time_updated=time_updated+1 WHERE id=?').run(actual.id)
      else writer.prepare('DELETE FROM credential WHERE id=?').run(actual.id)
      assert.ok(databaseBefore.equals(await readFile(row.path)), 'Credential mutation must remain in the real WAL')
      assert.throws(() => check(row), /native_opencode_credential_(selection_changed|missing)/)
      observations.push({ name: 'actual_owned_credential_' + kind, outcome: 'rejected' })
    } finally { writer.close() }
  }

  const replaced = await create('replaced')
  await rename(replaced.path, replaced.path + '.preserved')
  await copyFile(replaced.path + '.preserved', replaced.path)
  assert.throws(() => check(replaced), /native_opencode_database_identity_changed/)
  observations.push({ name: 'same_bytes_replaced_database', outcome: 'rejected' })

  const linked = await create('linked'), link = join(owned, 'stable-link.db')
  await symlink(linked.path, link, 'file')
  const linkIdentity = readOpenCodeDatabaseIdentity(link)
  assert.equal(linkIdentity.version, linked.identity.version)
  assert.equal(linkIdentity.path, link)
  const linkedSelection = { ...linked, identity: linkIdentity }
  check(linkedSelection)
  const redirected = await create('redirected-target')
  await rename(link, link + '.preserved')
  await symlink(redirected.path, link, 'file')
  assert.throws(() => check(linkedSelection), /native_opencode_database_identity_changed/)
  observations.push({ name: 'configured_symlink_retarget', outcome: 'rejected' })
  await rename(linked.path, linked.path + '.preserved')
  await symlink(redirected.path, linked.path, 'file')
  assert.throws(() => check(linked), /native_opencode_database_identity_changed/)
  observations.push({ name: 'stable_link_then_target_redirect', outcome: 'stable_passed_redirect_rejected' })

  assert.deepEqual(input.prepare('SELECT id,time_updated,value FROM credential WHERE id=?').get(actual.id), original)
  const result = { candidate, source, source_revision: (await readFile(join(candidate, 'VERSION'), 'utf8')).trim(), actual_native_session_database: true, original_credential_unchanged: true, credentials_printed: false, observations }
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ output, cases: observations.length, credentials_printed: false }))
} finally { input.close() }
