import { realpathSync, statSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { resolve } from 'node:path'
import { z } from 'zod'

const nativeKey = z.strictObject({ type: z.literal('key'), key: z.string().min(1) })

export function readOpenCodeDatabaseIdentity(file: string) {
  const path = realpathSync(file), info = statSync(path, { bigint: true })
  if (!info.isFile() || info.ino <= 0n || info.birthtimeNs <= 0n) throw new Error('native_opencode_database_identity_unavailable')
  // 保留配置入口，版本同时绑定其规范目标，后续重定向必须被发现。
  return { path: resolve(file), version: JSON.stringify([path, String(info.dev), String(info.ino), String(info.birthtimeNs)]) }
}

export function readOpenCodeCredential(database: string) {
  const before = readOpenCodeDatabaseIdentity(database)
  const db = new DatabaseSync(before.path, { readOnly: true })
  try {
    db.exec('PRAGMA query_only=ON; BEGIN')
    const rows = z.array(z.object({ id: z.string().min(1), label: z.string(), time_updated: z.number().int().nonnegative(), value: z.string() })).parse(db.prepare("SELECT id,label,time_updated,value FROM credential WHERE integration_id='deepseek' ORDER BY active DESC,time_created DESC,id DESC").all())
    if (!rows.length) throw new Error('native_opencode_credential_missing')
    const selected = rows[0]!, credential = nativeKey.parse(JSON.parse(selected.value))
    if (credential.key.trim() !== credential.key || !credential.key.trim() || /[\r\n]/.test(credential.key)) throw new Error('native_opencode_literal_key_required')
    db.exec('COMMIT')
    const after = readOpenCodeDatabaseIdentity(database)
    if (before.path !== after.path || before.version !== after.version) throw new Error('native_opencode_database_identity_changed')
    return { id: selected.id, label: selected.label, updatedAt: selected.time_updated, key: credential.key, count: rows.length }
  } finally { db.close() }
}

export function assertOpenCodeCredentialCurrent(source: { path: string; version: string }, id: string, updatedAt: number, key: string) {
  const before = readOpenCodeDatabaseIdentity(source.path)
  if (before.path !== source.path || before.version !== source.version) throw new Error('native_opencode_database_identity_changed')
  const current = readOpenCodeCredential(source.path)
  const after = readOpenCodeDatabaseIdentity(source.path)
  if (after.path !== source.path || after.version !== source.version) throw new Error('native_opencode_database_identity_changed')
  if (current.id !== id || current.updatedAt !== updatedAt || current.key !== key) throw new Error('native_opencode_credential_selection_changed')
}
