import { realpath } from 'node:fs/promises'
import { lstatSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type { AgentSelection } from './contracts'
import { assertNativeOpenCodeCurrent, inspectNativeOpenCodePolicy, openCodeTargets, readOpenCodeCredential } from './native-opencode-policy'
import { readPrivateOpenCodeBinding, readPrivateOpenCodeInputKey } from './private-opencode-account'
import { codexProtectedRoots } from './agent-discovery'
import { readAgentSettings } from './agent-settings'
import { verifyOpenCodeInputReceipt } from './opencode-policy-plugin'
import { requireNativeCodexPrivatePath } from './native-codex-policy'

const maximum = 12 * 1024 * 1024

export function validateOpenCodeExport(apiKey: string, inputKey: string, text: string) {
  for (const secret of [apiKey, inputKey]) {
    if (!secret || text.includes(secret) || text.includes(JSON.stringify(secret).slice(1, -1))) throw new Error('native_opencode_result_contains_credential')
  }
}
const samePath = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
const time = z.looseObject({ created: z.number().int().nonnegative(), completed: z.number().int().nonnegative().optional() })
const rowSchema = z.object({ id: z.string().startsWith('msg_'), session_id: z.string(), type: z.enum(['agent-switched', 'model-switched', 'location-switched', 'user', 'synthetic', 'system', 'skill', 'shell', 'assistant', 'compaction', 'idle']), data: z.string(), seq: z.number().int().positive(), time_created: z.number().int().nonnegative() })

function sourceVersion(file: string) {
  requireNativeCodexPrivatePath(file, false)
  const info = lstatSync(file, { bigint: true })
  if (!info.isFile() || info.isSymbolicLink() || !samePath(realpathSync.native(file), file)) throw new Error('native_opencode_result_source_redirected')
  return { path: file, version: `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}` }
}

function versions(path: string) {
  const result = []
  for (const file of [path, path + '-wal']) {
    try {
      result.push(sourceVersion(file))
    } catch (error) { if (file !== path && error instanceof Error && 'code' in error && error.code === 'ENOENT') result.push({ path: file, version: null }); else throw error }
  }
  return result
}

export async function readNativeOpenCodeSessionSource(input: { selection: AgentSelection; sessionId: string; nativeId: string; cwd: string; stopped: boolean; projectId: string }) {
  const { selection } = input, account = selection.native_launch.account
  if (selection.agent_id !== 'opencode' || account.kind !== 'opencode-native-api-key' && account.kind !== 'opencode-native-stepfun-api-key' || selection.model !== openCodeTargets[account.provider].model) throw new Error('native_opencode_result_selection_changed')
  const model = z.looseObject({ id: z.literal(account.model_target.model_id), providerID: z.literal(account.provider), variant: z.literal('default').optional() })
  const snapshot = await inspectNativeOpenCodePolicy({ executable: selection.executable, version: selection.version, sourceHome: account.source_home, projectId: input.projectId, privateRoot: account.private_root, env: process.env, protectedRoots: codexProtectedRoots(await readAgentSettings(), input.cwd) })
  if (!isDeepStrictEqual(snapshot.policy, selection.native_launch)) throw new Error('native_opencode_result_policy_changed')
  const root = join(account.private_root, input.sessionId)
  await readPrivateOpenCodeBinding(snapshot, root, await realpath(join(process.env.SWA_INSTALL_ROOT!, 'runtime/opencode-policy')))
  const inputKey = await readPrivateOpenCodeInputKey(root)
  const privateSources = [sourceVersion(join(root, 'config/opencode/opencode.json')), sourceVersion(join(root, 'data/opencode/auth.json')), inputKey.source]
  const path = join(root, 'data/opencode/opencode.db'), before = versions(path)
  const credential = readOpenCodeCredential(path, account.provider)
  if (credential.count !== 1 || credential.id !== account.credential_id || credential.key !== snapshot.key) throw new Error('native_opencode_result_account_changed')
  const database = new DatabaseSync(path, { readOnly: true, allowExtension: false })
  let session: Record<string, unknown>, messages
  const inputReceipts: Array<{ message_id: string; sequence: number; receipt: ReturnType<typeof verifyOpenCodeInputReceipt> }> = []
  try {
    database.exec('PRAGMA query_only=ON; BEGIN')
    if (database.prepare('SELECT count(*) AS count FROM credential').get()?.count !== 1 || database.prepare('SELECT active FROM credential WHERE id=?').get(credential.id)?.active !== 1) throw new Error('native_opencode_result_account_changed')
    session = z.record(z.string(), z.unknown()).parse(database.prepare('SELECT * FROM session_v2 WHERE id=?').get(input.nativeId))
    const bound = z.object({ count: z.number().int(), bytes: z.number().int().nullable() }).parse(database.prepare('SELECT count(*) AS count, sum(length(CAST(data AS BLOB))) AS bytes FROM session_message WHERE session_id=?').get(input.nativeId))
    if (bound.count > 100_000 || (bound.bytes ?? 0) > maximum) throw new Error('native_opencode_result_exceeds_bound')
    const rows = z.array(rowSchema.extend({ data_bytes: z.instanceof(Uint8Array) })).parse(database.prepare('SELECT id,session_id,type,data,CAST(data AS BLOB) AS data_bytes,seq,time_created FROM session_message WHERE session_id=? ORDER BY seq').all(input.nativeId))
    if (rows.length !== bound.count) throw new Error('native_opencode_result_inventory_changed')
    const seen = new Set<string>(); let previous = 0
    messages = rows.map(row => {
      if (row.session_id !== input.nativeId || seen.has(row.id) || row.seq <= previous) throw new Error('native_opencode_result_message_identity_changed')
      seen.add(row.id); previous = row.seq
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(row.data_bytes)
      if (decoded !== row.data) throw new Error('native_opencode_result_encoding_changed')
      const data = z.record(z.string(), z.unknown()).parse(JSON.parse(decoded)), actualTime = time.parse(data.time)
      if (actualTime.created !== row.time_created) throw new Error('native_opencode_result_message_time_changed')
      if (row.type === 'assistant') {
        const assistant = z.looseObject({ agent: z.literal('build'), model, content: z.array(z.looseObject({ type: z.enum(['text', 'reasoning']), text: z.string() })), time }).parse(data)
        if (assistant.time.completed !== undefined && assistant.time.completed < assistant.time.created) throw new Error('native_opencode_result_completion_time_invalid')
      } else if (row.type === 'agent-switched' && data.agent !== 'build' || row.type === 'model-switched' && !model.safeParse(data.model).success || ['shell', 'skill', 'compaction', 'location-switched'].includes(row.type)) throw new Error('native_opencode_result_disabled_capability_used')
      else if (row.type === 'user') {
        const user = z.object({ text: z.string(), files: z.array(z.never()).optional(), agents: z.array(z.never()).optional(), skills: z.array(z.never()).optional(), metadata: z.object({ swa_input: z.unknown() }) }).parse(data)
        const receipt = verifyOpenCodeInputReceipt(user.metadata.swa_input, inputKey.key)
        if (receipt.message_id !== row.id || receipt.payload.native_session_id !== input.nativeId || receipt.payload.binding.session_id !== input.sessionId || user.text !== receipt.payload.blocks.map(block => block.text).join('\n')) throw new Error('native_opencode_result_input_binding_changed')
        inputReceipts.push({ message_id: row.id, sequence: row.seq, receipt })
      }
      const { data_bytes: _bytes, ...columns } = row
      return { ...columns, raw_data: decoded, data }
    })
    database.exec('COMMIT')
  } finally { database.close() }
  const identity = z.object({ id: z.literal(input.nativeId), directory: z.string(), agent: z.literal('build'), model: z.string(), idle_outcome: z.string().nullable() }).parse(session)
  model.parse(JSON.parse(identity.model))
  if (!samePath(await realpath(identity.directory), input.cwd)) throw new Error('native_opencode_result_directory_changed')
  const lastAssistant = messages.findLast(row => row.type === 'assistant')
  const lastUser = inputReceipts.at(-1)
  const finalText = lastAssistant ? z.array(z.looseObject({ type: z.enum(['text', 'reasoning']), text: z.string() })).parse(lastAssistant.data.content).filter(part => part.type === 'text').map(part => part.text).join('') : null
  const complete = identity.idle_outcome === 'succeeded' && messages.at(-1)?.type === 'idle' && messages.at(-1)!.data.outcome === 'succeeded' && lastAssistant !== undefined && lastUser !== undefined && lastAssistant.seq > lastUser.sequence && !messages.some(row => row.seq > lastUser.sequence && row.seq < lastAssistant.seq && row.type === 'idle') && time.parse(lastAssistant.data.time).completed !== undefined && !!finalText?.trim()
  if (!complete && !input.stopped) throw new Error('native_opencode_result_final_output_incomplete')
  const usage = messages.filter(row => row.type === 'assistant').map(row => ({ message_id: row.id, tokens: row.data.tokens ?? null, cost: row.data.cost ?? null }))
  const value = { format: 'opencode-sqlite-v2' as const, availability: complete ? 'complete' : 'incomplete', reason: complete ? null : 'no_complete_final_assistant_message', persistence: 'observed', path, native_id: input.nativeId, session, messages, input_receipts: inputReceipts, final: complete ? { input_message_id: lastUser!.message_id, assistant_message_id: lastAssistant!.id, assistant_sequence: lastAssistant!.seq, idle_message_id: messages.at(-1)!.id, text: finalText! } : null, usage: { known: usage.some(row => row.tokens !== null), value: usage, source: 'actual_native_message_usage', billed_cost: { known: false, value: null, reason: 'native_cost_fields_do_not_prove_billed_amount' } } }
  const serialized = JSON.stringify(value)
  if (Buffer.byteLength(serialized) > maximum || serialized.includes(snapshot.key) || serialized.includes(inputKey.key)) throw new Error('native_opencode_result_bound_or_credential_violation')
  const validateExport = (text: string) => validateOpenCodeExport(snapshot.key, inputKey.key, text)
  const verifySync = () => {
    assertNativeOpenCodeCurrent(snapshot)
    if (!isDeepStrictEqual(before, versions(path)) || privateSources.some(source => !isDeepStrictEqual(source, sourceVersion(source.path)))) throw new Error('native_opencode_result_changed_during_collection')
  }
  const verify = async () => {
    if (!isDeepStrictEqual(inputKey, await readPrivateOpenCodeInputKey(root))) throw new Error('native_opencode_result_changed_during_collection')
    verifySync()
  }
  await verify()
  return { value, verify, verifySync, validateExport }
}
