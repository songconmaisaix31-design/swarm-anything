import { constants, lstatSync, realpathSync, type BigIntStats, type Dirent } from 'node:fs'
import { lstat, open, opendir, realpath } from 'node:fs/promises'
import { basename, isAbsolute, join, normalize, parse, relative, sep } from 'node:path'
import { Readable } from 'node:stream'
import parser from 'stream-json/jsonl/parser.js'
import { z } from 'zod'
import { forEachSessionFile } from '../../../third_party/orca-v1.4.230/src/main/ai-vault/session-scanner-discovery'
import { SESSION_FILE_ID_LAYOUTS } from '../../../third_party/orca-v1.4.230/src/main/native-chat/session-file-id-layouts'
import { proveClaudeTranscriptBranchFromJsonl, replayClaudeTranscriptBranchAncestryFromJsonl } from '../../../third_party/orca-v1.4.230/src/main/claude/claude-transcript-branch-proof'
import { nativeConfigurationSource } from './native-pi-policy'
import { requireNativeClaudePath } from './claude-file-security'

const maximum = 12 * 1024 * 1024
const identifier = z.string().min(1).max(512).refine(value => value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value))
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const contentBlock = z.discriminatedUnion('type', [
  z.looseObject({ type: z.literal('text'), text: z.string() }),
  z.looseObject({ type: z.literal('thinking'), thinking: z.string(), signature: z.string().optional() }),
  z.looseObject({ type: z.literal('redacted_thinking'), data: z.string() })
])
const usageSchema = z.looseObject({
  input_tokens: integer.optional(), output_tokens: integer.optional(), cache_read_input_tokens: integer.optional(), cache_creation_input_tokens: integer.optional(),
  cache_creation: z.looseObject({ ephemeral_5m_input_tokens: integer.optional(), ephemeral_1h_input_tokens: integer.optional() }).nullish(),
  server_tool_use: z.strictObject({ web_search_requests: z.literal(0), web_fetch_requests: z.literal(0) }).nullish()
})
const assistantSchema = z.looseObject({ role: z.literal('assistant'), id: identifier, model: identifier, content: z.array(contentBlock), stop_reason: z.string().nullish(), usage: usageSchema.nullish() })
const metadataTypes = new Set(['custom-title', 'ai-title', 'tag', 'agent-name', 'agent-color', 'queue-operation', 'cost-state', 'api-request-shape', 'api-request-blob', 'api-request'])
const failureFields = ['isApiErrorMessage', 'is_api_error_message', 'apiError', 'api_error', 'apiErrorParams', 'api_error_params', 'apiErrorCode', 'api_error_code', 'error', 'errorDetails', 'error_details', 'truncatedAfterOutput', 'truncated_after_output', 'isAbortedMidStream', 'is_aborted_mid_stream', 'aborted', 'isVirtual', 'is_virtual', 'local_command_source', 'local_command_run', 'local_command_outcome']
const lineageFields = ['agentId', 'parent_agent_id', 'teamName', 'sourceToolAssistantUUID', 'logicalParentUuid', 'compactMetadata', 'forkedFromSessionId', 'parentSessionId']

export type NativeClaudeSessionSourceInput = {
  path: string
  privateRoot: string
  nativeId: string
  cwd: string
  model: string
  provider: 'anthropic'
  stopped: boolean
  nativeVersion: '2.1.284'
  sdkVersion: '0.3.284'
  source: Awaited<ReturnType<typeof nativeConfigurationSource>>
  expectedLeafUuid: string | null
  inputUuid: string | null
  validateExport: (serialized: string) => void
}
type NativeRow = Record<string, unknown> & { type: string }
type ConversationRow = NativeRow & { uuid: string; parentUuid: string | null; sessionId: string; cwd: string; version: string }

function fail(reason: string): never { throw new Error(`native_claude_result_${reason}`) }
function checked<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value)
  if (!result.success) fail('invalid_native_record')
  return result.data
}
function absent(value: unknown) { return value === undefined || value === null }
function hasFailure(value: Record<string, unknown>) { return failureFields.some(key => !absent(value[key]) && value[key] !== false) }
function samePath(left: string, right: string) { return process.platform === 'win32' ? normalize(left).toLowerCase() === normalize(right).toLowerCase() : normalize(left) === normalize(right) }
function version(info: BigIntStats) { return `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}` }

async function exactPath(path: string, file: boolean) {
  if (process.platform === 'win32') requireNativeClaudePath(path, { directory: !file, private: true })
  if (!isAbsolute(path) || path !== normalize(path)) fail('source_path_invalid')
  let current = parse(path).root
  const parts = relative(current, path).split(sep).filter(Boolean)
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]!)
    const info = await lstat(current, { bigint: true })
    if (info.isSymbolicLink() || (index === parts.length - 1 && file ? !info.isFile() : !info.isDirectory())) fail('source_redirected')
  }
  if (!samePath(await realpath(path), path)) fail('source_redirected')
}

async function transcriptInventory(privateRoot: string, nativeId: string, privatePaths: boolean) {
  if (!isAbsolute(privateRoot) || !z.uuid().safeParse(nativeId).success) fail('binding_invalid')
  const projects = join(privateRoot, 'projects')
  let visited = 0
  const matches: string[] = []
  const directories = new Map<string, string>()
  let fileIdentity: string | undefined
  const inspect = async (path: string, file: boolean) => {
    if (privatePaths) requireNativeClaudePath(path, { directory: !file, private: true })
    await exactPath(path, file)
  }
  await inspect(privateRoot, false)
  directories.set(privateRoot, version(await lstat(privateRoot, { bigint: true })))
  const verify = () => {
    for (const [path, signature] of directories) {
      if (privatePaths || process.platform === 'win32') requireNativeClaudePath(path, { directory: true, private: true })
      const info = lstatSync(path, { bigint: true })
      if (!info.isDirectory() || info.isSymbolicLink() || !samePath(realpathSync.native(path), path) || version(info) !== signature) fail('source_changed')
    }
    if (matches.length === 0) {
      try { lstatSync(projects) }
      catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT' && !directories.has(projects)) return; throw error }
      if (!directories.has(projects)) fail('source_changed')
    }
    if (matches.length) {
      if (privatePaths || process.platform === 'win32') requireNativeClaudePath(matches[0]!, { directory: false, private: true })
      const info = lstatSync(matches[0]!, { bigint: true })
      if (!info.isFile() || info.isSymbolicLink() || !samePath(realpathSync.native(matches[0]!), matches[0]!) || version(info) !== fileIdentity) fail('source_changed')
    }
  }
  try { await inspect(projects, false) }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
    verify()
    return { path: null, verify }
  }
  // 原walker的端口保留；opendir在分配下一项前受总额度约束，不先readdir整个目录。
  const readDirectory = async (path: string): Promise<Dirent[]> => {
    await inspect(path, false)
    const before = version(await lstat(path, { bigint: true }))
    directories.set(path, before)
    const directory = await opendir(path, { bufferSize: 32 })
    const entries: Dirent[] = []
    try {
      for (;;) {
        const entry = await directory.read()
        if (entry === null) break
        if (++visited > 4096) fail('source_inventory_exceeds_bound')
        if (!entry.isFile() && !entry.isDirectory()) fail('source_redirected')
        entries.push(entry)
      }
    } finally { await directory.close() }
    await inspect(path, false)
    if (version(await lstat(path, { bigint: true })) !== before) fail('source_changed')
    return entries
  }
  await forEachSessionFile(projects, 'claude', [], {
    extensions: new Set(['.jsonl']), strictErrors: true, readDirectory,
    directoryPredicate: (_name, depth) => depth === 0,
    filePredicate: path => SESSION_FILE_ID_LAYOUTS.claude.fileMatchesId(path, nativeId)
  }, async path => {
    matches.push(path)
    if (matches.length > 1) fail('source_ambiguous')
    const within = relative(projects, path).split(sep)
    if (within.length !== 2 || basename(path) !== `${nativeId}.jsonl`) fail('source_identity_changed')
    await inspect(path, true)
    fileIdentity = version(await lstat(path, { bigint: true }))
  })
  verify()
  return { path: matches[0] ?? null, verify }
}

/** 仅查询实际私有目录元数据；原件格式与完整性仍由下方读取器证明。 */
export async function findPrivateClaudeTranscript(privateRoot: string, nativeId: string) {
  return transcriptInventory(privateRoot, nativeId, true)
}

async function uniqueSource(input: NativeClaudeSessionSourceInput) {
  const inventory = await transcriptInventory(input.privateRoot, input.nativeId, false)
  if (inventory.path === null || !samePath(inventory.path, input.path)) fail('source_identity_changed')
  inventory.verify()
}

async function readSnapshot(input: NativeClaudeSessionSourceInput) {
  if (![input.path, input.privateRoot, input.cwd].every(isAbsolute)) fail('source_path_invalid')
  const within = relative(join(input.privateRoot, 'projects'), input.path)
  const parts = within.split(sep)
  if (isAbsolute(within) || parts.length !== 2 || parts.some(part => !part || part === '.' || part === '..')) fail('source_outside_private_root')
  if (basename(input.path) !== `${input.nativeId}.jsonl`) fail('filename_identity_changed')
  await exactPath(input.privateRoot, false)
  await exactPath(input.path, true)
  if (!samePath(input.path, input.source.path)) fail('source_changed')
  await uniqueSource(input)
  const source = await nativeConfigurationSource(input.path)
  if (source.version !== input.source.version || !samePath(source.path, input.source.path)) fail('source_changed')
  const handle = await open(input.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const before = await handle.stat({ bigint: true })
    if (!before.isFile() || version(before) !== source.version) fail('source_changed')
    if (before.size < 1n || before.size > BigInt(maximum)) fail('exceeds_bound')
    const bytes = Buffer.alloc(Number(before.size) + 1)
    let length = 0
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, length)
      if (read.bytesRead === 0) break
      length += read.bytesRead
    }
    if (length !== Number(before.size) || version(await handle.stat({ bigint: true })) !== source.version) fail('source_changed')
    await exactPath(input.path, true)
    if (version(await lstat(input.path, { bigint: true })) !== source.version) fail('source_changed')
    return bytes.subarray(0, length)
  } finally { await handle.close() }
}

function inertDuration(row: NativeRow) {
  checked(z.looseObject({ type: z.literal('system'), subtype: z.literal('turn_duration'), durationMs: integer, pendingBackgroundAgentCount: z.literal(0).optional(), pendingWorkflowCount: z.literal(0).optional() }), row)
  for (const field of ['budgetTokens', 'budgetLimit', 'budgetNudges', 'messageCount']) if (!absent(row[field])) checked(integer, row[field])
  if (hasFailure(row)) fail('disabled_capability_used')
}

export async function readNativeClaudeSessionSource(input: NativeClaudeSessionSourceInput) {
  input = { ...input, source: { ...input.source } }
  if (input.nativeVersion !== '2.1.284' || input.sdkVersion !== '0.3.284' || input.provider !== 'anthropic' || !z.uuid().safeParse(input.nativeId).success || !identifier.safeParse(input.model).success || !z.object({ path: z.string().min(1), version: identifier }).safeParse(input.source).success || typeof input.stopped !== 'boolean' || typeof input.validateExport !== 'function') fail('binding_invalid')
  for (const selector of [input.expectedLeafUuid, input.inputUuid]) if (selector !== null && !identifier.safeParse(selector).success) fail('binding_invalid')
  const bytes = await readSnapshot(input)
  if (bytes.at(-1) !== 10) fail('incomplete_jsonl')
  let content: string
  try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) } catch { fail('invalid_utf8') }
  const rows: NativeRow[] = []
  try {
    for await (const item of Readable.from([bytes]).pipe(parser.asStream())) {
      if (rows.length >= 100_000) fail('exceeds_bound')
      rows.push(checked(z.looseObject({ type: identifier }), item.value))
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('native_claude_result_')) throw error
    fail('invalid_jsonl')
  }
  const nodes = new Map<string, ConversationRow>()
  const seenUuids = new Set<string>()
  const assistants = new Map<string, z.output<typeof assistantSchema>>()
  const usage: Array<{ record: number; uuid: string; message_id: string; request_id: unknown; value: z.output<typeof usageSchema> | null }> = []
  if (!samePath(await realpath(input.cwd), input.cwd)) fail('directory_changed')
  for (const [index, row] of rows.entries()) {
    if (row.sessionId !== input.nativeId) fail('session_identity_changed')
    if (!absent(row.uuid)) {
      const uuid = checked(identifier, row.uuid)
      if (seenUuids.has(uuid)) fail('duplicate_uuid')
      seenUuids.add(uuid)
    }
    if (lineageFields.some(key => !absent(row[key])) || row.isSidechain === true || !absent(row.parent_tool_use_id) || row.isCompactSummary === true || row.isSynthetic === true) fail('disabled_capability_used')
    if (row.type === 'user' || row.type === 'assistant' || row.type === 'system') {
      const record = checked(z.looseObject({ type: identifier, uuid: identifier, parentUuid: identifier.nullable(), sessionId: z.literal(input.nativeId), cwd: z.string().min(1), version: z.literal(input.nativeVersion), timestamp: z.iso.datetime(), isSidechain: z.literal(false).optional(), parent_tool_use_id: z.null().optional() }), row)
      if (!isAbsolute(record.cwd) || !samePath(await realpath(record.cwd), input.cwd)) fail('directory_changed')
      nodes.set(record.uuid, record)
      if (row.type === 'assistant') {
        const message = checked(assistantSchema, row.message)
        if (message.model !== input.model) fail('model_changed')
        assistants.set(record.uuid, message)
        usage.push({ record: index, uuid: record.uuid, message_id: message.id, request_id: row.requestId ?? null, value: message.usage ?? null })
      } else if (row.type === 'user') {
        if (row.isMeta === true) fail('disabled_capability_used')
        checked(z.looseObject({ role: z.literal('user'), content: z.union([z.string(), z.array(z.looseObject({ type: z.literal('text'), text: z.string() }))]) }), row.message)
        if (hasFailure(row)) fail('disabled_capability_used')
      } else inertDuration(row)
    } else if (row.type === 'last-prompt') {
      checked(identifier, row.leafUuid)
      if (row.rewound === true || hasFailure(row)) fail('unsupported_lineage')
    } else if (!metadataTypes.has(row.type)) fail('unsupported_native_record')
    else if (hasFailure(row)) fail('disabled_capability_used')
  }

  let branch: ReturnType<typeof proveClaudeTranscriptBranchFromJsonl> | null = null
  let complete = false
  const finalRow = input.expectedLeafUuid === null ? undefined : nodes.get(input.expectedLeafUuid)
  const finalMessage = input.expectedLeafUuid === null ? undefined : assistants.get(input.expectedLeafUuid)
  if (nodes.size) {
    const roots = [...nodes.values()].filter(row => row.parentUuid === null)
    if (roots.length !== 1 || roots[0]!.type !== 'user') fail('unsupported_lineage')
    const proofInput = { providerSessionId: input.nativeId, previousLeafUuid: input.expectedLeafUuid }
    try {
      branch = proveClaudeTranscriptBranchFromJsonl({ ...proofInput, contents: content, tip: 'file-tail' })
      const full = replayClaudeTranscriptBranchAncestryFromJsonl({ ...proofInput, contents: content, ancestryAnchorUuid: roots[0]!.uuid, onAncestorRecord: () => {} })
      const mainChain = new Set([roots[0]!.uuid, ...full.chain])
      if (mainChain.size !== nodes.size || [...nodes.keys()].some(uuid => !mainChain.has(uuid))) fail('unsupported_lineage')
      if (input.expectedLeafUuid !== null) {
        // result会持久化当时最后user或assistant；停止在user回放后仍可有合法user leaf。
        if (finalRow?.type !== 'assistant' && finalRow?.type !== 'user') fail('leaf_identity_changed')
        const suffix = replayClaudeTranscriptBranchAncestryFromJsonl({ ...proofInput, contents: content, ancestryAnchorUuid: input.expectedLeafUuid, onAncestorRecord: () => {} })
        for (const uuid of suffix.chain) inertDuration(nodes.get(uuid)!)
      }
      if (input.inputUuid !== null) {
        if (nodes.get(input.inputUuid)?.type !== 'user') fail('input_identity_changed')
        const fromInput = replayClaudeTranscriptBranchAncestryFromJsonl({ ...proofInput, contents: content, ancestryAnchorUuid: input.inputUuid, onAncestorRecord: () => {} })
        if (fromInput.chain.some(uuid => nodes.get(uuid)!.type === 'user')) fail('input_identity_changed')
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('native_claude_result_')) throw error
      fail('branch_unverifiable')
    }
    complete = input.inputUuid !== null && input.expectedLeafUuid !== null && finalRow !== undefined && finalMessage !== undefined && finalMessage.stop_reason === 'end_turn' && finalMessage.content.some(part => part.type === 'text' && part.text.trim().length > 0) && !hasFailure(finalRow) && !hasFailure(finalMessage)
  } else if (input.expectedLeafUuid !== null || input.inputUuid !== null) fail('source_not_settled')
  if (!complete && !input.stopped) fail('source_not_settled')
  // queue-operation无user UUID；caller仍须同journal快照核latest原R与后续pending，再在最终exportChecks重查。
  const value = {
    format: 'claude-session-jsonl' as const, availability: complete ? 'complete' : 'incomplete', reason: complete ? null : input.inputUuid === null || input.expectedLeafUuid === null ? 'native_selectors_unavailable' : 'no_complete_final_assistant_record', persistence: 'observed',
    path: input.path, native_id: input.nativeId, source_version: input.source.version, content, record_count: rows.length, branch,
    final: complete ? { uuid: input.expectedLeafUuid, message_id: finalMessage!.id, text: finalMessage!.content.filter(part => part.type === 'text').map(part => part.text).join(''), content: finalMessage!.content, stop_reason: finalMessage!.stop_reason, same_message_records: usage.filter(row => row.message_id === finalMessage!.id).map(row => row.record) } : null,
    usage: { known: usage.some(row => row.value !== null && ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'].some(key => row.value![key] !== undefined)), value: usage, source: 'actual_native_assistant_message_usage', token_count_semantics: 'partial_repeated_message_records_not_summed', billed_cost: { known: false, value: null, reason: 'native_token_usage_does_not_prove_billed_amount' } }
  }
  const validateExport = (serialized: string) => { if (input.validateExport(serialized) !== undefined) fail('export_validator_invalid') }
  const serialized = JSON.stringify(value)
  if (Buffer.byteLength(serialized) > maximum) fail('exceeds_bound')
  validateExport(serialized)
  const verify = async () => { if (!(await readSnapshot(input)).equals(bytes)) fail('changed_during_collection') }
  await verify()
  return { value, verify, validateExport }
}
