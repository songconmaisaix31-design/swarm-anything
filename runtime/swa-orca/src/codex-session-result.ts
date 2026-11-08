import { constants, type BigIntStats } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { basename, isAbsolute, join, normalize, parse, relative, sep } from 'node:path'
import { Readable } from 'node:stream'
import parser from 'stream-json/jsonl/parser.js'
import { z } from 'zod'
import { nativeConfigurationSource } from './native-pi-policy'

const maximum = 12 * 1024 * 1024
const object = z.record(z.string(), z.unknown())
const identifier = z.string().min(1)
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const usageSchema = z.looseObject({ input_tokens: integer, cached_input_tokens: integer, cache_write_input_tokens: integer.optional(), output_tokens: integer, reasoning_output_tokens: integer, total_tokens: integer })
const rowSchema = z.looseObject({ timestamp: z.iso.datetime(), ordinal: integer.optional(), type: identifier, payload: object })
const phaseSchema = z.enum(['commentary', 'final_answer']).nullish()

type Input = {
  path: string
  privateRoot: string
  nativeId: string
  cwd: string
  model: string
  provider: string
  stopped: boolean
  nativeVersion: '0.163.0'
  source: Awaited<ReturnType<typeof nativeConfigurationSource>>
  validateExport: (serialized: string) => void
}
type Turn = { id: string; context: boolean; terminal: boolean; succeeded: boolean; text: string | null; phase: 'commentary' | 'final_answer' | null; finalText: string | null }

function fail(reason: string): never { throw new Error(`native_codex_result_${reason}`) }
function checked<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value)
  if (!result.success) fail('invalid_native_record')
  return result.data
}
function samePath(left: string, right: string) {
  return process.platform === 'win32' ? normalize(left).toLowerCase() === normalize(right).toLowerCase() : normalize(left) === normalize(right)
}
function version(info: BigIntStats) { return `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}` }
function absent(value: unknown) { return value === undefined || value === null }
function empty(value: unknown) { return absent(value) || Array.isArray(value) && value.length === 0 }

async function exactPath(path: string, file: boolean) {
  if (!isAbsolute(path) || !samePath(path, normalize(path))) fail('source_path_invalid')
  let current = parse(path).root
  const parts = relative(current, path).split(sep).filter(Boolean)
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]!)
    const info = await lstat(current, { bigint: true })
    if (info.isSymbolicLink() || (index === parts.length - 1 && file ? !info.isFile() : !info.isDirectory())) fail('source_redirected')
  }
  if (!samePath(await realpath(path), path)) fail('source_redirected')
}

async function readSnapshot(input: Input) {
  const root = join(input.privateRoot, 'sessions')
  if (!isAbsolute(input.privateRoot) || !isAbsolute(input.path) || !isAbsolute(input.cwd)) fail('source_path_invalid')
  const within = relative(root, input.path)
  if (!within || within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) fail('source_outside_private_root')
  await exactPath(input.privateRoot, false)
  await exactPath(input.path, true)
  if (!samePath(input.path, input.source.path)) fail('source_changed')
  const source = await nativeConfigurationSource(input.path)
  if (source.version !== input.source.version || !samePath(source.path, input.source.path)) fail('source_changed')
  const handle = await open(input.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const before = await handle.stat({ bigint: true })
    if (!before.isFile() || version(before) !== source.version) fail('source_changed')
    if (before.size < 1n || before.size > BigInt(maximum)) fail('exceeds_bound')
    const buffer = Buffer.alloc(Number(before.size) + 1)
    let length = 0
    while (length < buffer.length) {
      const read = await handle.read(buffer, length, buffer.length - length, length)
      if (read.bytesRead === 0) break
      length += read.bytesRead
    }
    if (length !== Number(before.size) || version(await handle.stat({ bigint: true })) !== source.version) fail('source_changed')
    await exactPath(input.path, true)
    if (version(await lstat(input.path, { bigint: true })) !== source.version) fail('source_changed')
    return buffer.subarray(0, length)
  } finally { await handle.close() }
}

export async function readNativeCodexSessionSource(input: Input) {
  input = { ...input, source: { ...input.source } }
  if (input.nativeVersion !== '0.163.0' || !z.uuid().safeParse(input.nativeId).success || !input.model || !input.provider || typeof input.validateExport !== 'function') fail('binding_invalid')
  const name = basename(input.path)
  if (!/^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/.test(name) || name !== `${name.slice(0, 28)}${input.nativeId}.jsonl`) fail('filename_identity_changed')
  const bytes = await readSnapshot(input)
  if (bytes.at(-1) !== 10) fail('incomplete_jsonl')
  let content: string
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { fail('invalid_utf8') }
  const rows: z.output<typeof rowSchema>[] = []
  try {
    for await (const item of Readable.from([bytes]).pipe(parser.asStream())) {
      if (rows.length >= 100_000) fail('exceeds_bound')
      rows.push(checked(rowSchema, item.value))
    }
  } catch { fail('invalid_jsonl') }
  const first = rows[0]
  if (first?.type !== 'session_meta') fail('session_metadata_missing')
  const meta = checked(z.looseObject({ id: z.literal(input.nativeId), session_id: z.literal(input.nativeId), cli_version: z.literal(input.nativeVersion), cwd: identifier, model_provider: z.literal(input.provider), history_mode: z.enum(['legacy', 'paginated']), source: z.literal('vscode'), thread_source: z.literal('user').nullish() }), first.payload)
  if (!samePath(await realpath(meta.cwd), input.cwd) || !samePath(await realpath(input.cwd), input.cwd)) fail('directory_changed')
  for (const key of ['forked_from_id', 'forked_from_ordinal_exclusive', 'parent_thread_id', 'history_base', 'subagent_history_start_ordinal', 'agent_path', 'agent_role', 'multi_agent_version']) if (!absent(meta[key])) fail('unsupported_lineage')
  if (!empty(meta.dynamic_tools) || !empty(meta.selected_capability_roots)) fail('disabled_capability_used')
  const turns = new Map<string, Turn>()
  let active: Turn | undefined
  const responses: Array<Record<string, unknown>> = []
  const snapshots: Array<{ record: number; info: z.output<typeof usageInfoSchema> | null }> = []
  const responseIds = new Set<string>()
  const requireTurn = (id?: unknown) => {
    if (!active || active.terminal || id !== undefined && id !== active.id) fail('turn_identity_changed')
    return active
  }
  const acceptText = (text: string, phase: unknown) => {
    const turn = requireTurn()
    turn.text = text
    turn.phase = checked(phaseSchema, phase) ?? null
  }
  const bindCwd = async (cwd: unknown) => { if (typeof cwd !== 'string' || !samePath(await realpath(cwd), input.cwd)) fail('directory_changed') }
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!, payload = row.payload
    if (meta.history_mode === 'paginated' ? row.ordinal !== index : row.ordinal !== undefined) fail('ordinal_changed')
    if (row.type === 'session_meta') { if (index !== 0) fail('session_identity_changed'); continue }
    if (row.type === 'turn_context') {
      // 0.163 regular.rs 先等待 task_started，再由 run_turn 持久化本轮 context。
      const context = checked(z.looseObject({ turn_id: identifier, model: z.literal(input.model), cwd: identifier, approval_policy: z.literal('never') }), payload)
      const turn = requireTurn(context.turn_id)
      await bindCwd(context.cwd)
      if (!absent(context.root_turn_id) && context.root_turn_id !== turn.id || !absent(context.multi_agent_version) || context.realtime_active === true) fail('disabled_capability_used')
      turn.context = true
    } else if (row.type === 'response_item') {
      if (payload.type === 'message') {
        const message = checked(z.looseObject({ role: z.enum(['system', 'developer', 'user', 'assistant']), content: z.array(z.looseObject({ type: z.enum(['input_text', 'output_text']), text: z.string() })), phase: phaseSchema }), payload)
        if (message.role === 'user') requireTurn()
        else if (active?.terminal) fail('content_after_terminal')
        if (message.role === 'assistant') {
          if (!absent(message.status) && message.status !== 'completed') fail('assistant_incomplete')
          acceptText(message.content.map(part => part.text).join(''), message.phase)
        }
      } else if (payload.type === 'reasoning') {
        requireTurn()
        checked(z.looseObject({ summary: z.array(z.looseObject({ type: z.literal('summary_text'), text: z.string() })) }), payload)
      }
      else fail('disabled_or_unknown_response')
    } else if (row.type === 'event_msg') {
      if (payload.type === 'task_started') {
        const event = checked(z.looseObject({ turn_id: identifier }), payload)
        if (active && !active.terminal || turns.has(event.turn_id) || !absent(event.root_turn_id) && event.root_turn_id !== event.turn_id) fail('turn_identity_changed')
        active = { id: event.turn_id, context: false, terminal: false, succeeded: false, text: null, phase: null, finalText: null }
        turns.set(active.id, active)
      } else if (payload.type === 'task_complete' || payload.type === 'turn_aborted') {
        const event = checked(z.looseObject({ turn_id: identifier }), payload), turn = requireTurn(event.turn_id)
        if (!absent(event.root_turn_id) && event.root_turn_id !== turn.id) fail('turn_identity_changed')
        turn.terminal = true
        if (payload.type === 'task_complete') {
          const finalText = checked(z.string().nullable(), payload.last_agent_message)
          turn.succeeded = absent(payload.error) && turn.context && !!finalText?.trim() && finalText === turn.text && turn.phase !== 'commentary'
          turn.finalText = finalText
        }
      } else if (payload.type === 'thread_settings_applied') {
        const event = checked(z.looseObject({ thread_id: z.literal(input.nativeId), thread_settings: z.looseObject({ model: z.literal(input.model), model_provider_id: z.literal(input.provider), cwd: identifier, approval_policy: z.literal('never') }) }), payload)
        await bindCwd(event.thread_settings.cwd)
      } else if (payload.type === 'token_count') {
        const info = checked(usageInfoSchema.nullable(), payload.info)
        snapshots.push({ record: index, info })
      } else if (payload.type === 'agent_message') {
        if (!absent(payload.delivery) || !empty(payload.questions)) fail('disabled_capability_used')
        acceptText(checked(z.string(), payload.message), payload.phase)
      } else if (payload.type === 'user_message') {
        requireTurn()
        checked(z.string(), payload.message)
        for (const key of ['images', 'file_ids', 'local_images', 'audio', 'local_audio']) if (!empty(payload[key])) fail('disabled_capability_used')
      } else if (payload.type === 'agent_reasoning' || payload.type === 'agent_reasoning_raw_content') {
        requireTurn()
        checked(z.string(), payload.text)
      }
      else if (payload.type === 'item_completed') {
        const event = checked(z.looseObject({ thread_id: z.literal(input.nativeId), turn_id: identifier, item: object }), payload)
        requireTurn(event.turn_id)
        if (event.item.type === 'AgentMessage') {
          const item = checked(z.looseObject({ content: z.array(z.looseObject({ type: z.literal('Text'), text: z.string() })), phase: phaseSchema }), event.item)
          if (!absent(item.delivery) || !empty(item.questions)) fail('disabled_capability_used')
          acceptText(item.content.map(part => part.text).join(''), item.phase)
        } else if (event.item.type === 'UserMessage') {
          checked(z.array(z.looseObject({ type: z.literal('text'), text: z.string() })), event.item.content)
        } else if (event.item.type === 'Reasoning') {
          checked(z.looseObject({ summary_text: z.array(z.string()), raw_content: z.array(z.string()).optional() }), event.item)
        } else fail('disabled_or_unknown_item')
      } else fail('disabled_or_unknown_event')
    } else if (row.type === 'token_usage_record') {
      const record = checked(z.looseObject({ thread_id: z.literal(input.nativeId), session_id: z.literal(input.nativeId), turn_id: identifier, root_turn_id: identifier, response_id: identifier, usage: usageSchema, turn_token_usage: usageSchema, thread_token_usage: usageSchema }), payload)
      if (!turns.has(record.turn_id) || record.root_turn_id !== record.turn_id || responseIds.has(record.response_id)) fail('usage_identity_changed')
      responseIds.add(record.response_id)
      responses.push({ ...record, record: index })
    } else if (row.type === 'world_state') {
      requireTurn()
      checked(z.looseObject({ full: z.boolean(), state: object }), payload)
    }
    else fail('disabled_or_unknown_record')
  }
  const complete = active?.terminal === true && active.succeeded
  if (!complete && !input.stopped) fail('final_output_incomplete')
  // TokenCount 可含估算与累计值；原生记录不证明实际账单，不重复相加。
  const value = {
    format: 'codex-rollout-jsonl' as const, availability: complete ? 'complete' : 'incomplete', reason: complete ? null : 'no_complete_final_assistant_message', persistence: 'observed',
    path: input.path, native_id: input.nativeId, source_version: input.source.version, content, record_count: rows.length,
    final: complete ? { turn_id: active!.id, text: active!.finalText! } : null,
    usage: { known: responses.length > 0 || snapshots.some(row => row.info !== null), value: { response_records: responses, token_count_snapshots: snapshots }, source: 'actual_native_rollout_usage', token_count_semantics: 'possibly_estimated_cumulative_snapshots_not_summed', billed_cost: { known: false, value: null, reason: 'native_token_usage_does_not_prove_billed_amount' } },
  }
  const validateExport = (text: string) => { input.validateExport(text) }
  const serialized = JSON.stringify(value)
  if (Buffer.byteLength(serialized) > maximum) fail('exceeds_bound')
  validateExport(serialized)
  const verify = async () => { if (!(await readSnapshot(input)).equals(bytes)) fail('changed_during_collection') }
  await verify()
  return { value, verify, validateExport }
}

const usageInfoSchema = z.looseObject({ total_token_usage: usageSchema, last_token_usage: usageSchema, model_context_window: integer.nullable() })
