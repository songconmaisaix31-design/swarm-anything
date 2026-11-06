import { lstat, open, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import { Readable } from 'node:stream'
import { isDeepStrictEqual } from 'node:util'
import parser from 'stream-json/jsonl/parser.js'
import { z } from 'zod'
import type { OrcaRuntimeService } from '../../../third_party/orca-v1.4.230/src/main/runtime/orca-runtime'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'
import { sessionIdFromStructuredWorkerIncarnation } from '../../../third_party/orca-v1.4.230/src/main/runtime/structured-worker-identity'
import { getStructuredAgentSessionHost } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-wire/structured-agent-session-registry'
import { agentSessionProviderHandleChainHead, agentSessionProviderHandleKey } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-provider-handle'
import type { AgentSessionRecord } from '../../../third_party/orca-v1.4.230/src/shared/agent-session-record'
import Database from '../../../third_party/orca-v1.4.230/src/main/sqlite/sync-database'
import { replayJournal } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-open'
import { renderJournalState } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-reducer'
import { iterateJournalEpochRows, readJournalSessionEpoch } from '../../../third_party/orca-v1.4.230/src/main/native-chat/agent-session-journal/journal-row-table'
import { agentSelectionSchema, nativeObject, structuredInputBindingSchema, type AgentSelection, type Scope } from './contracts'
import { readNativeOpenCodeSessionSource } from './opencode-session-result'

const maximum = 12 * 1024 * 1024
const sourceWitnesses = new Map<string, { path: string; identity: string; nativeSession: string; bytes: Buffer }>()
const headerSchema = z.looseObject({ type: z.literal('session'), version: z.literal(3), id: z.uuid(), timestamp: z.iso.datetime(), cwd: z.string().min(1), parentSession: z.string().optional() })
const textContent = z.looseObject({ type: z.literal('text'), text: z.string(), textSignature: z.string().optional() })
const thinkingContent = z.looseObject({ type: z.literal('thinking'), thinking: z.string(), thinkingSignature: z.string().optional(), redacted: z.boolean().optional() })
const toolCallContent = z.looseObject({ type: z.literal('toolCall'), id: z.string().min(1), name: z.string().min(1), arguments: z.record(z.string(), z.json()), thoughtSignature: z.string().optional(), namespace: z.string().optional() })
const nativeUsage = z.looseObject({
  input: z.number().nonnegative(), output: z.number().nonnegative(), cacheRead: z.number().nonnegative(), cacheWrite: z.number().nonnegative(),
  cacheWrite1h: z.number().nonnegative().optional(), reasoning: z.number().nonnegative().optional(), totalTokens: z.number().nonnegative(),
  cost: z.looseObject({ input: z.number().nonnegative(), output: z.number().nonnegative(), cacheRead: z.number().nonnegative(), cacheWrite: z.number().nonnegative(), total: z.number().nonnegative() })
})
const timestamp = z.number().nonnegative()
const diagnostic = z.looseObject({ type: z.string(), timestamp, error: z.looseObject({ name: z.string().optional(), message: z.string(), stack: z.string().optional(), code: z.union([z.string(), z.number()]).optional() }).optional(), details: z.record(z.string(), z.json()).optional() })
const deferred = z.looseObject({ provider: z.string(), modelId: z.string(), api: z.string(), id: z.string(), expiresAt: z.number().optional(), pollAfterMs: z.number().optional(), data: z.json().optional() })
const messageSchema = z.discriminatedUnion('role', [
  z.looseObject({ role: z.literal('user'), content: z.union([z.string(), z.array(textContent)]), timestamp }),
  z.looseObject({ role: z.literal('system'), content: z.union([z.string(), z.array(textContent)]), sections: z.record(z.string(), z.string().nullable()).optional(), toolsAdded: z.array(z.never()).optional(), toolsRemoved: z.array(z.never()).optional(), timestamp }),
  z.looseObject({ role: z.literal('assistant'), content: z.array(z.discriminatedUnion('type', [textContent, thinkingContent, toolCallContent])), api: z.string().min(1),
    provider: z.string().min(1), model: z.string().min(1), responseModel: z.string().optional(), responseId: z.string().optional(),
    providerThinkingLevel: z.string().optional(), thinkingLevel: z.string().optional(), usage: nativeUsage,
    stopReason: z.enum(['pending', 'stop', 'length', 'toolUse', 'error', 'aborted', 'deferred']), deferred: deferred.optional(), diagnostics: z.array(diagnostic).optional(), errorMessage: z.string().optional(), rawStopReason: z.string().optional(), endTurn: z.boolean().optional(), timestamp })
])
const entryBase = {
  id: z.string().min(1), parentId: z.string().min(1).nullable(), timestamp: z.iso.datetime()
}
const entrySchema = z.discriminatedUnion('type', [
  z.looseObject({ ...entryBase, type: z.literal('message'), message: messageSchema }),
  z.looseObject({ ...entryBase, type: z.literal('thinking_level_change'), thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']) }),
  z.looseObject({ ...entryBase, type: z.literal('model_change'), provider: z.string().min(1), modelId: z.string().min(1) }),
  z.looseObject({ ...entryBase, type: z.literal('usage'), kind: z.string().min(1), provider: z.string().min(1), model: z.string().min(1), usage: nativeUsage, note: z.string().optional() }),
  z.looseObject({ ...entryBase, type: z.literal('session_info'), name: z.string().optional() }),
  z.looseObject({ ...entryBase, type: z.literal('label'), targetId: z.string().min(1), label: z.string().optional() })
])
const fail = (message: string): never => { throw new OrchestrationError('evidence_missing', message) }
const equalPath = (left: string, right: string) => left.toLowerCase() === right.toLowerCase()
const sourceSignature = (record: AgentSessionRecord) =>
  JSON.stringify({ session: record.sessionId, location: record.location, account: record.accountHome, options: record.options, fence: record.lease.runtimeFence, head: agentSessionProviderHandleChainHead(record.providerHandleChain) })

function originalWorkerSelection(runtime: OrcaRuntimeService, scope: Scope, dispatchId: string, record: AgentSessionRecord) {
  const db = runtime.getOrchestrationDb()
  const rows = z.array(z.object({ receipt: z.string() })).parse(db.db.prepare(`SELECT receipt FROM mutation_receipts
    WHERE caller_fingerprint=? AND method='swa.controllerDeliver' AND state IN ('pending','completed') AND json_valid(receipt)=1
    AND json_extract(receipt, '$.action')='worker.start' AND json_extract(receipt, '$.project_id')=?
    AND json_extract(receipt, '$.run_id')=? AND json_extract(receipt, '$.root_task_id')=?
    AND (json_extract(receipt, '$.native.dispatchId')=? OR json_extract(receipt, '$.swa_input_binding.dispatch_id')=?)`).all(db.getOrCreateLocalMutationCallerFingerprint(), scope.project_id, scope.run_id, scope.root_task_id, dispatchId, dispatchId))
  if (rows.length !== 1) return fail('The original native Worker selection is unavailable or ambiguous')
  const selection = agentSelectionSchema.parse(nativeObject(JSON.parse(rows[0]!.receipt)).selection)
  if (record.provider !== selection.agent_id || record.options?.model !== selection.model) return fail('The native output Agent or model differs from its original selection')
  const account = selection.native_launch.account
  if (account.kind === 'pi-native-api-key') {
    if (!('variable' in record.accountHome) || record.accountHome.variable !== 'PI_CODING_AGENT_DIR' || record.accountHome.path !== account.private_home) return fail('The native output Pi account changed')
  } else if (!('kind' in record.accountHome) || record.accountHome.kind !== 'opencode' || record.accountHome.locator.kind !== 'private' || record.accountHome.locator.root !== join(account.private_root, record.sessionId)) return fail('The native output OpenCode account changed')
  return selection
}

async function exactPrivatePath(root: string, path: string, missingLeaf = false) {
  if (!isAbsolute(path)) return fail('The native source path is not absolute')
  const rel = relative(root, path)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return fail('The native source escaped its exact private session directory')
  for (let item = path; !equalPath(item, root); item = dirname(item)) {
    if (dirname(item) === item) return fail('The private source path has no owned ancestor')
    try { if ((await lstat(item)).isSymbolicLink()) return fail('The private source path contains a reparse point') }
    catch (error) {
      if (!missingLeaf || !equalPath(item, path) || !(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
    }
  }
  if (!equalPath(await realpath(dirname(path)), dirname(path))) return fail('The native source parent changed its real path')
}

async function readPrivateJournal<T>(data: string, directory: string, read: (database: Database.Database) => T): Promise<T> {
  const path = await realpath(join(directory, 'agent-session-journal.db'))
  await exactPrivatePath(data, path)
  const database = new Database(path, { readonly: true, fileMustExist: true })
  try { return read(database) } finally { database.close() }
}

export async function readNativeInputStatus(runtime: OrcaRuntimeService, projectId: string, requestId: string) {
  const db = runtime.getOrchestrationDb()
  const row = db.getMutationReceipt(db.getOrCreateLocalMutationCallerFingerprint(), requestId)
  if (!row?.receipt || row.method !== 'swa.controllerDeliver') return fail('The original native input receipt is unavailable')
  const receipt = nativeObject(JSON.parse(row.receipt))
  if (receipt.project_id !== projectId) throw new OrchestrationError('scope_denied', 'The original input belongs to another project')
  const binding = structuredInputBindingSchema.parse(receipt.swa_input_binding)
  const children = z.array(z.object({ receipt: z.string().nullable() })).parse(db.db.prepare('SELECT receipt FROM mutation_receipts WHERE request_id=?').all(binding.child_request))
  if (children.length !== 1 || !children[0]!.receipt || !isDeepStrictEqual(nativeObject(JSON.parse(children[0]!.receipt)).swa_input_binding, receipt.swa_input_binding)) return fail('The original native child input binding is unavailable')
  const host = getStructuredAgentSessionHost()
  const data = process.env.SWA_DATA_DIR
  if (!host || !data || !isAbsolute(data)) return fail('The native input journal source is unavailable')
  return readPrivateJournal(await realpath(data), host.deps.journalDatabase.stateDirectory, journalDB => {
    const replay = replayJournal(journalDB, binding.session_id)
    if (!replay || replay.damage || replay.newer) return fail('The original input journal is missing or damaged')
    const submission = replay.state.submissions.get(binding.operation_id)
    if (submission && (submission.fence !== binding.runtime_fence || submission.clientMessageId !== binding.operation_id)) return fail('The original native input journal operation changed its identity')
    const state = !submission ? 'unknown' : submission.dispatchState === 'pending' ? submission.handoverRecorded && submission.handedOverAt === undefined ? 'queued' : 'journaled' : submission.dispatchState
    return { request_id: binding.parent_request, native_request_id: binding.child_request, dispatch_id: binding.dispatch_id, agent: binding.agent, execution_mode: binding.execution_mode, session_id: binding.session_id, operation_id: binding.operation_id, client_message_id: submission?.clientMessageId, binding: receipt.swa_input_binding, state, reason: submission ? null : 'original_operation_not_observed_in_journal', submission: submission ?? null, source: { session_id: binding.session_id, epoch: replay.state.epoch, sequence: replay.state.lastSequence } }
  })
}

export async function readNativePiSessionSource(path: string, sessionRoot: string, cwd: string, sessionId: string, stopped: boolean, selected: AgentSelection) {
  const selection = agentSelectionSchema.parse(selected)
  const target = selection.native_launch.account.model_target
  if (selection.agent_id !== 'pi' || selection.native_launch.account.provider !== selection.provider || selection.model !== `${selection.provider}/${target.model_id}`) return fail('The original native Pi selection is unavailable')
  const witnessed = sourceWitnesses.get(sessionId)
  if (witnessed && !equalPath(witnessed.path, path)) return fail('A previously observed native source changed its path')
  await exactPrivatePath(sessionRoot, path, true)
  let file
  try { file = await open(path, 'r') } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
    if (witnessed || !stopped) return fail('The required native session source is missing')
    return { availability: 'unavailable', reason: 'ENOENT', persistence: 'unknown', path, entries: null, usage: { known: false, value: null, reason: 'native_source_unavailable' } }
  }
  try {
    const before = await file.stat({ bigint: true })
    if (!before.isFile() || before.size <= 0n || before.size > BigInt(maximum)) return fail('Native session file is empty, unsupported or exceeds the declared result bound')
    const identity = `${before.dev}:${before.ino}:${before.birthtimeNs}`
    if (witnessed && witnessed.identity !== identity) return fail('A previously observed native source was replaced')
    const bytes = await file.readFile()
    if (witnessed && (bytes.length < witnessed.bytes.length || !bytes.subarray(0, witnessed.bytes.length).equals(witnessed.bytes))) return fail('A previously read native source prefix changed')
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (bytes.length !== Number(before.size) || bytes.at(-1) !== 10) return fail('Native JSONL source is truncated or changed during its read')
    const stream = Readable.from([bytes]).pipe(parser.asStream())
    const rows: unknown[] = []
    for await (const item of stream) rows.push(item.value)
    const header = headerSchema.parse(rows[0])
    if (!basename(path).endsWith(`_${header.id}.jsonl`) || witnessed && witnessed.nativeSession !== header.id || !equalPath(await realpath(header.cwd), cwd)) return fail('Native header identity or cwd does not match the verified native source')
    const seen = new Set<string>()
    const entries = rows.slice(1).map(value => {
      const entry = entrySchema.parse(value)
      if (seen.has(entry.id) || entry.parentId !== null && !seen.has(entry.parentId)) return fail('Native entry identity is duplicated or its real parent is missing')
      seen.add(entry.id)
      if (entry.type === 'message') {
        const message = messageSchema.parse(entry.message)
        if (message.role === 'assistant') {
          if (message.provider !== selection.provider || message.model !== target.model_id || message.api !== target.api || message.content.some(item => item.type === 'toolCall')) return fail('The actual native response violates its approved model or disabled-tool policy')
        }
      }
      if (entry.type === 'model_change' && (entry.provider !== selection.provider || entry.modelId !== target.model_id) || entry.type === 'usage' && (entry.provider !== selection.provider || entry.model !== target.model_id)) return fail('The actual native session changed its approved provider or model')
      return entry
    })
    const after = await file.stat({ bigint: true })
    const actualPath = await realpath(path)
    const currentPath = await stat(path, { bigint: true })
    if (!equalPath(actualPath, path) || `${after.dev}:${after.ino}:${after.birthtimeNs}` !== identity || `${currentPath.dev}:${currentPath.ino}:${currentPath.birthtimeNs}` !== identity || before.size !== after.size || before.mtimeNs !== after.mtimeNs) return fail('Native source changed during its consistent read')
    const messages = entries.filter(entry => entry.type === 'message').map(entry => ({ entry_id: entry.id, message: messageSchema.parse(entry.message) }))
    const last = messages.at(-1)?.message
    const complete = last?.role === 'assistant' && last.stopReason === 'stop' && !last.errorMessage && last.content.some(item => item.type === 'text' && item.text.trim().length > 0)
    if (!complete && !stopped) return fail('The required final Worker native output is not complete')
    sourceWitnesses.set(sessionId, { path, identity, nativeSession: header.id, bytes })
    const usage = messages.flatMap(row => row.message.role === 'assistant' ? [{ entry_id: row.entry_id, value: row.message.usage }] : [])
    return { availability: complete ? 'complete' : 'incomplete', reason: complete ? null : 'no_complete_final_assistant_entry', persistence: 'observed', path, file_identity: identity, size: Number(after.size), mtime_ns: after.mtimeNs.toString(), header, entries, usage: { known: usage.length > 0, value: usage.length ? usage : null, reason: usage.length ? null : 'usage_not_present_in_actual_native_entries', source: 'actual_native_message_usage', billed_cost: { known: false, value: null, reason: 'native_cost_fields_do_not_prove_billed_amount' } } }
  } finally { await file.close() }
}

export async function observeWorkerSource(runtime: OrcaRuntimeService, scope: Scope, workspaceId: string, dispatchId: string) {
  const db = runtime.getOrchestrationDb(), dispatch = db.getDispatchContextById(dispatchId)
  const task = dispatch && db.getTask(dispatch.task_id), resource = db.getWorkerTerminalResourceByOwner(dispatchId)
  const nativeWorker = db.getWorkerDispatch(dispatchId)
  if (!dispatch || dispatch.run_id !== scope.run_id || task?.parent_id !== scope.root_task_id) return fail('The observed source does not belong to the exact native root task')
  if (!resource || !nativeWorker) return { availability: 'unavailable', reason: 'native_resource_not_observed', worker_state: nativeWorker?.state ?? null }
  const sessionId = sessionIdFromStructuredWorkerIncarnation(resource.process_incarnation)
  const host = getStructuredAgentSessionHost(), record = sessionId && host?.deps.store.getRecord(sessionId)
  if (!sessionId || !host || !record) return { availability: 'unavailable', reason: 'native_session_record_not_observed', worker_state: nativeWorker.state }
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId) || dispatch.process_incarnation !== resource.process_incarnation || record.sessionId !== sessionId || !['pi', 'opencode'].includes(record.provider) || record.location.workspaceId !== workspaceId || record.location.wslDistro !== null) return fail('The actual native Worker source identity is unavailable')
  const head = agentSessionProviderHandleChainHead(record.providerHandleChain)
  if (!head) return { availability: 'unavailable', reason: 'native_provider_link_not_observed', worker_state: nativeWorker.state }
  if (head.handle.agent !== record.provider || head.handle.transport !== (record.provider === 'pi' ? 'jsonl-rpc' : 'acp')) return fail('The actual native source link has a different provider')
  const data = process.env.SWA_DATA_DIR
  if (!data || !isAbsolute(data) || !host) return fail('The actual private source root is unavailable')
  const root = await realpath(data), workerRoot = join(root, 'workers', sessionId)
  const journal = await realpath(join(host.deps.journalDatabase.stateDirectory, 'agent-session-journal.db'))
  await exactPrivatePath(root, journal)
  await exactPrivatePath(root, workerRoot)
  const ownerProcess = record.lease.ownerProcess
  const selection = originalWorkerSelection(runtime, scope, dispatchId, record)
  return { availability: 'observed', native_session_id: sessionId, provider: record.provider, fence: record.lease.runtimeFence, claim_status: record.lease.claimStatus,
    selection,
    process: ownerProcess ? { pid: ownerProcess.pid, creation_time_ms: ownerProcess.processStartTimeMs, runtime_id: ownerProcess.runtime ?? null } : null,
    provider_link: head, journal_database: journal, provider_events: join(workerRoot, 'provider-events.ndjson'), worker_state: nativeWorker.state, release_state: resource.release_state }
}

export async function completeTaskResult(runtime: OrcaRuntimeService, scope: Scope, workspaceId: string, metadata: unknown) {
  const summary = nativeObject(metadata)
  const workers = z.array(z.looseObject({ worker: z.looseObject({ dispatchId: z.string(), taskId: z.string(), runId: z.string() }), observation: z.unknown() })).parse(summary.workers)
  if (workers.length > 2) return fail('The exact fixed task Worker inventory exceeds its approved bound')
  const db = runtime.getOrchestrationDb()
  const children = db.listTasksWithDispatch({ runId: scope.run_id }).filter(task => task.parent_id === scope.root_task_id)
  if (children.length !== workers.length || new Set(workers.map(row => row.worker.dispatchId)).size !== workers.length) return fail('Native Worker output inventory is incomplete or duplicated')
  const host = getStructuredAgentSessionHost()
  if (!host) return fail('The actual structured session host is unavailable')
  const privateData = process.env.SWA_DATA_DIR
  if (!privateData || !isAbsolute(privateData)) return fail('The explicit private source root is missing')
  const data = await realpath(privateData)
  const outputs = []
  const checks: { sessionId: string; signature: string; epoch: string; sequence: number; path: string; identity: string | null; size: number | null; mtime: string | null }[] = []
  const nativeChecks: (() => Promise<void>)[] = []
  const exportChecks: ((text: string) => void)[] = []
  let used = Buffer.byteLength(JSON.stringify(summary))
  for (const row of workers) {
    const worker = row.worker, dispatch = db.getDispatchContextById(worker.dispatchId)
    const nativeWorker = db.getWorkerDispatch(worker.dispatchId), resource = db.getWorkerTerminalResourceByOwner(worker.dispatchId)
    if (worker.runId !== scope.run_id || !dispatch || dispatch.run_id !== scope.run_id || dispatch.task_id !== worker.taskId || !children.some(task => task.id === worker.taskId) || !nativeWorker || !resource) return fail('The exact Worker output does not belong to this native Run/root Task')
    const sessionId = sessionIdFromStructuredWorkerIncarnation(resource.process_incarnation)
    if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId) || dispatch.process_incarnation !== resource.process_incarnation) return fail('The native Worker session incarnation is missing or changed')
    const record = host.deps.store.getRecord(sessionId)
    if (!record || record.sessionId !== sessionId || !['pi', 'opencode'].includes(record.provider) || record.location.workspaceId !== workspaceId || record.location.wslDistro !== null) return fail('The provider record has a different native identity or workspace')
    const head = agentSessionProviderHandleChainHead(record.providerHandleChain)
    if (!head || head.handle.agent !== record.provider || head.handle.transport !== (record.provider === 'pi' ? 'jsonl-rpc' : 'acp') || record.provider === 'pi' && !isAbsolute(head.handle.nativeId)) return fail('The verified native provider link is unavailable')
    const signature = sourceSignature(record)
    const selection = originalWorkerSelection(runtime, scope, worker.dispatchId, record)
    if (!host.deps.resolveWorkspacePath) return fail('The actual native workspace resolution port is unavailable')
    const cwd = await realpath(await host.deps.resolveWorkspacePath(workspaceId))
    const account = selection.native_launch.account
    let nativeSession
    if (account.kind === 'opencode-native-api-key') {
      const native = await readNativeOpenCodeSessionSource({ selection, sessionId, nativeId: head.handle.nativeId, cwd, stopped: nativeWorker.state === 'stopped', projectId: scope.project_id })
      nativeSession = native.value
      nativeChecks.push(native.verify)
      exportChecks.push(native.validateExport)
    } else {
      const sessionRoot = join(account.private_home, 'sessions')
      await exactPrivatePath(data, sessionRoot)
      if (!equalPath(await realpath(sessionRoot), sessionRoot)) return fail('The private native session directory changed its real identity')
      nativeSession = await readNativePiSessionSource(head.handle.nativeId, sessionRoot, cwd, sessionId, nativeWorker.state === 'stopped', selection)
    }
    if ('header' in nativeSession && nativeSession.header) {
      const parent = head.forkedFromKey ? record.providerHandleChain.find(link => agentSessionProviderHandleKey(link.handle) === head.forkedFromKey) : undefined
      if (nativeSession.header.parentSession !== undefined && (!parent || parent.handle.nativeId !== nativeSession.header.parentSession) || head.origin === 'forked' && nativeSession.header.parentSession === undefined) return fail('The actual native session fork source differs from its provider handle chain')
    }
    const { journal, rows, snapshot } = await readPrivateJournal(data, host.deps.journalDatabase.stateDirectory, journalDB => {
      const bound = z.object({ count: z.number(), bytes: z.number().nullable(), max_seq: z.number().nullable() }).parse(journalDB.prepare('SELECT COUNT(*) AS count, SUM(LENGTH(row_json)) AS bytes, MAX(seq) AS max_seq FROM journal_rows WHERE session_id=? AND epoch=?').get(sessionId, readJournalSessionEpoch(journalDB, sessionId)))
      used += Buffer.byteLength(JSON.stringify(nativeSession)) + (bound.bytes ?? 0)
      if (used > maximum || bound.count <= 0 || bound.count > 100_000) return fail('The required journal is missing or exceeds the declared result bound')
      const journal = replayJournal(journalDB, sessionId)
      if (!journal || journal.damage || journal.newer || journal.state.lastSequence !== bound.max_seq) return fail('The actual native journal is damaged, incomplete or has a newer schema')
      const rows = [...iterateJournalEpochRows(journalDB, sessionId, journal.state.epoch)]
      if (rows.length !== bound.count || readJournalSessionEpoch(journalDB, sessionId) !== journal.state.epoch) return fail('Native journal rows changed during their consistent read')
      return { journal, rows, snapshot: renderJournalState(journal.state) }
    })
    const current = host.deps.store.getRecord(sessionId)
    if (!current || sourceSignature(current) !== signature) return fail('The native provider identity changed during result collection')
    checks.push({ sessionId, signature, epoch: journal.state.epoch, sequence: journal.state.lastSequence, path: nativeSession.path, identity: 'file_identity' in nativeSession ? nativeSession.file_identity ?? null : null, size: 'size' in nativeSession ? nativeSession.size ?? null : null, mtime: 'mtime_ns' in nativeSession ? nativeSession.mtime_ns ?? null : null })
    outputs.push({ ...row, source: { native_session_id: sessionId, selection, location: record.location, fence: record.lease.runtimeFence, provider_link: head, owner_process: record.lease.ownerProcess ? { pid: record.lease.ownerProcess.pid, creation_time_ms: record.lease.ownerProcess.processStartTimeMs, runtime_id: record.lease.ownerProcess.runtime ?? null } : null }, native_session: nativeSession, journal: { session_id: sessionId, epoch: journal.state.epoch, rows: rows.map(item => ({ epoch: item.epoch, seq: item.seq, ts: item.ts, row: JSON.parse(item.rowJson) })), snapshot }, usage: nativeSession.usage })
  }
  for (const check of checks) {
    if (nativeChecks.length && check.identity === null && check.path.endsWith('opencode.db')) continue
    try {
      const latest = await stat(check.path, { bigint: true })
      if (check.identity === null || !equalPath(await realpath(check.path), check.path) || `${latest.dev}:${latest.ino}:${latest.birthtimeNs}` !== check.identity || latest.size !== BigInt(check.size!) || latest.mtimeNs.toString() !== check.mtime) return fail('Native source changed before the complete task result was returned')
    } catch (error) {
      if (check.identity !== null || !(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
    }
  }
  for (const verify of nativeChecks) await verify()
  for (const check of checks) {
    const unchanged = await readPrivateJournal(data, host.deps.journalDatabase.stateDirectory, journalDB => {
      const sequence = z.object({ seq: z.number().nullable() }).parse(journalDB.prepare('SELECT MAX(seq) AS seq FROM journal_rows WHERE session_id=? AND epoch=?').get(check.sessionId, check.epoch)).seq
      return readJournalSessionEpoch(journalDB, check.sessionId) === check.epoch && sequence === check.sequence
    })
    const current = host.deps.store.getRecord(check.sessionId)
    if (!current || sourceSignature(current) !== check.signature || !unchanged) return fail('Native result sources changed before the complete result was returned')
  }
  const result = { ...summary, workers: outputs, source: 'native_journal_and_native_cli_session', collected_at: new Date().toISOString() }
  const serialized = JSON.stringify(result)
  if (Buffer.byteLength(serialized) > maximum) return fail('The full result exceeds the declared 12 MiB export bound; no partial export is returned')
  for (const validate of exportChecks) validate(serialized)
  return result
}
