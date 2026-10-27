import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync, statSync, writeSync } from 'node:fs'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'

const pluginId = 'swa.opencode.policy'
const targets = { deepseek: { model: 'deepseek-v4-pro', base: 'https://api.deepseek.com', url: 'https://api.deepseek.com/chat/completions' }, stepfun: { model: 'step-3.5-flash', base: 'https://api.stepfun.com/v1', url: 'https://api.stepfun.com/v1/chat/completions' } } as const
const optionsSchema = z.strictObject({ root: z.string().min(1), correlation: z.string().regex(/^[a-f0-9]{64}$/), provider: z.enum(['deepseek', 'stepfun']), source: z.string().min(1), sources: z.array(z.strictObject({ path: z.string(), version: z.string() })).min(1), absent_sources: z.array(z.string()) })
const inventorySchema = z.array(z.object({ id: z.string(), state: z.object({ status: z.literal('active') }) }))
type Context = {
  options: unknown
  location: { directory: string }
  plugin: { list(): Promise<unknown> }
  tool: { list(): Promise<readonly unknown[]> }
  agent: { list(): Promise<unknown> }
  session: { get(input: { sessionID: string }): Promise<unknown>; hook(name: string, callback: (event: unknown) => Promise<void> | void): Promise<unknown> }
  integration: { connection: { active(id: string): Promise<unknown>; resolve(connection: unknown): Promise<unknown> } }
  event: { subscribe(options: { signal: AbortSignal }): AsyncIterable<unknown> }
}
const permissionSchema = z.array(z.object({ action: z.string(), resource: z.string(), effect: z.enum(['allow', 'deny', 'ask']) }))
const equalPath = (a: string, b: string) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
const inputPrefix = 'SWA_OPENCODE_INPUT_V1\n'
const textBlocks = z.array(z.strictObject({ type: z.literal('text'), text: z.string() })).min(1)
const bridgeBinding = z.strictObject({ parent_request: z.string().min(1), child_request: z.string().min(1), dispatch_id: z.string().min(1), agent: z.literal('opencode'), execution_mode: z.literal('structured'), session_id: z.string().min(1), operation_id: z.string().min(1), runtime_fence: z.number().int().nonnegative(), consumer_generation: z.number().int().nonnegative(), body: z.unknown() })
export const openCodeInputPayloadSchema = z.strictObject({ version: z.literal(1), native_session_id: z.string().min(1), request_id: z.number().int().positive(), binding: bridgeBinding, blocks: textBlocks })
export const openCodeInputReceiptSchema = z.strictObject({ payload: openCodeInputPayloadSchema, message_id: z.string().startsWith('msg_'), mac: z.string().regex(/^[a-f0-9]{64}$/) })
export type OpenCodeInputPayload = z.infer<typeof openCodeInputPayloadSchema>
const sign = (key: string, body: string) => createHmac('sha256', Buffer.from(key, 'hex')).update(body).digest('hex')
function verifiedMac(key: string, body: string, actual: string) {
  return /^[a-f0-9]{64}$/.test(actual) && timingSafeEqual(Buffer.from(sign(key, body), 'hex'), Buffer.from(actual, 'hex'))
}
export function encodeOpenCodeInput(payload: OpenCodeInputPayload, key: string) {
  const value = openCodeInputPayloadSchema.parse(payload), body = JSON.stringify(value)
  if (Buffer.byteLength(body) > 512 * 1024) throw new Error('swa_opencode_input_exceeds_bound')
  return inputPrefix + JSON.stringify({ payload: body, mac: sign(key, body) })
}
export function verifyOpenCodeInputReceipt(value: unknown, key: string) {
  const receipt = openCodeInputReceiptSchema.parse(value)
  if (!verifiedMac(key, JSON.stringify({ payload: receipt.payload, message_id: receipt.message_id }), receipt.mac)) throw new Error('swa_opencode_input_receipt_invalid')
  return receipt
}
function boundedFile(path: string, maximum: number) {
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  let bytes: Buffer | undefined
  try {
    const before = fstatSync(fd, { bigint: true })
    if (!before.isFile() || before.size < 0n || before.size > BigInt(maximum) || !equalPath(realpathSync(path), path)) throw new Error('swa_opencode_file_invalid')
    bytes = Buffer.alloc(Number(before.size) + 1)
    let count = 0
    while (count < bytes.length) { const read = readSync(fd, bytes, count, bytes.length - count, count); if (!read) break; count += read }
    const after = fstatSync(fd, { bigint: true }), current = lstatSync(path, { bigint: true })
    const stamp = (info: typeof before) => `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`
    if (count !== Number(before.size) || current.isSymbolicLink() || stamp(before) !== stamp(after) || stamp(before) !== stamp(current)) throw new Error('swa_opencode_file_changed')
    return bytes.subarray(0, count)
  } catch (error) { bytes?.fill(0); throw error }
  finally { closeSync(fd) }
}

export default {
  id: pluginId,
  async setup(ctx: Context) {
    const options = optionsSchema.parse(ctx.options), root = realpathSync(options.root)
    const target = targets[options.provider], modelSchema = z.object({ id: z.literal(target.model), providerID: z.literal(options.provider) })
    const expectedIds = ['opencode.provider.opencode', 'opencode.config.policy', 'opencode.agent', 'opencode.models.dev', 'opencode.config.agent', 'opencode.config.compaction', ...(options.provider === 'stepfun' ? ['opencode.config.provider'] : []), pluginId].sort()
    if (!equalPath(root, options.root)) throw new Error('swa_opencode_private_root_changed')
    const authPath = join(root, 'data/opencode/auth.json'), configPath = join(root, 'config/opencode/opencode.json')
    const keyPath = join(root, 'swa-input-key.json')
    const authBytes = boundedFile(authPath, 64 * 1024), configBytes = boundedFile(configPath, 128 * 1024), pluginBytes = boundedFile(options.source, 4 * 1024 * 1024), inputKeyBytes = boundedFile(keyPath, 256)
    const key = z.strictObject({ type: z.literal('api'), key: z.string().min(1) }).parse(z.record(z.string(), z.unknown()).parse(JSON.parse(authBytes.toString('utf8')))[options.provider]).key
    const inputKey = z.strictObject({ key: z.string().regex(/^[a-f0-9]{64}$/) }).parse(JSON.parse(inputKeyBytes.toString('utf8'))).key
    const delivered = new Map<string, { message: string; text: string }>()
    const contextUsers = new Map<string, string[]>()
    let sequence = 0, active = false, failure = false, checking = 'setup'
    const controller = new AbortController()
    const emit = (state: string, detail: Record<string, unknown> = {}) => writeSync(2, 'SWA_OPENCODE_POLICY ' + JSON.stringify({ type: 'swa_opencode_policy', correlation: options.correlation, pid: process.pid, root, sequence: ++sequence, state, ...detail }) + '\n')
    const filesCurrent = () => {
      if (failure || controller.signal.aborted) throw new Error('swa_opencode_policy_unavailable')
      for (const [path, original, maximum] of [[authPath, authBytes, 64 * 1024], [configPath, configBytes, 128 * 1024], [options.source, pluginBytes, 4 * 1024 * 1024], [keyPath, inputKeyBytes, 256]] as const) {
        const current = boundedFile(path, maximum)
        try { if (!original.equals(current)) throw new Error('swa_opencode_policy_unavailable') } finally { current.fill(0) }
      }
      for (const source of options.sources) {
        const path = realpathSync(source.path), info = statSync(path, { bigint: true })
        if (path !== source.path || !info.isFile() || `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}` !== source.version) throw new Error('swa_opencode_source_changed')
      }
      for (const path of options.absent_sources) {
        try { lstatSync(path) }
        catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue; throw error }
        throw new Error('swa_opencode_source_appeared')
      }
    }
    async function inventory() {
      filesCurrent()
      checking = 'plugin_list'
      const raw = await ctx.plugin.list()
      checking = 'plugin_response_decode'
      const response = z.object({ location: z.object({ directory: z.string().min(1) }), data: inventorySchema }).parse(raw)
      checking = 'plugin_location'
      if (!equalPath(realpathSync(response.location.directory), realpathSync(ctx.location.directory))) throw new Error('swa_opencode_plugin_location_changed')
      const plugins = response.data
      checking = 'plugin_ids'
      if (JSON.stringify(plugins.map(row => row.id).sort()) !== JSON.stringify(expectedIds)) throw new Error('swa_opencode_plugin_inventory_changed')
      checking = 'tool_list'
      if ((await ctx.tool.list()).length) throw new Error('swa_opencode_tools_available')
      checking = 'agent_permissions'
      const agents = z.object({ location: z.object({ directory: z.string() }), data: z.array(z.object({ id: z.string(), permissions: permissionSchema })) }).parse(await ctx.agent.list())
      if (!equalPath(realpathSync(agents.location.directory), realpathSync(ctx.location.directory)) || agents.data.length !== 1 || agents.data[0]!.id !== 'build') throw new Error('swa_opencode_agent_selection_changed')
      const last = agents.data[0]!.permissions.at(-1)
      if (last?.action !== '*' || last.resource !== '*' || last.effect !== 'deny') throw new Error('swa_opencode_agent_permissions_changed')
      checking = 'connection_active'
      const connection = await ctx.integration.connection.active(options.provider)
      if (connection === undefined) throw new Error('swa_opencode_native_credential_missing')
      z.object({ type: z.literal('credential'), id: z.string().min(1), method: z.literal('key') }).parse(connection)
      checking = 'connection_resolve'
      const credential = z.strictObject({ type: z.literal('key'), key: z.string().min(1) }).parse(await ctx.integration.connection.resolve(connection))
      if (credential.key !== key) throw new Error('swa_opencode_native_credential_changed')
      filesCurrent()
      return plugins.map(row => ({ id: row.id, state: row.state.status }))
    }
    async function guardSession(value: unknown) {
      if (!active) throw new Error('swa_opencode_policy_not_active')
      const scope = z.object({ sessionID: z.string().min(1) }).parse(value)
      const plugins = await inventory()
      const parsed = z.object({ id: z.literal(scope.sessionID), location: z.object({ directory: z.string() }), agent: z.literal('build'), model: modelSchema, permissions: permissionSchema.optional() }).safeParse(await ctx.session.get({ sessionID: scope.sessionID }))
      if (!parsed.success) { emit('rejected', { session_id: scope.sessionID, code: 'native_session_selection_changed' }); throw new Error('swa_opencode_session_selection_changed') }
      const session = parsed.data
      if (!equalPath(realpathSync(session.location.directory), realpathSync(ctx.location.directory))) throw new Error('swa_opencode_session_directory_changed')
      if (session.permissions?.some(rule => rule.effect !== 'deny')) throw new Error('swa_opencode_session_permission_changed')
      return { scope, plugins }
    }
    await ctx.session.hook('prompt', async event => {
      const { scope } = await guardSession(event)
      const value = z.object({ messageID: z.string().startsWith('msg_'), prompt: z.object({ text: z.string(), files: z.array(z.never()).optional(), agents: z.array(z.never()).optional(), skills: z.array(z.never()).optional() }), metadata: z.record(z.string(), z.unknown()).optional() }).parse(event)
      if (!value.prompt.text.startsWith(inputPrefix) || Buffer.byteLength(value.prompt.text) > 1024 * 1024 || value.metadata && Object.keys(value.metadata).length) throw new Error('swa_opencode_input_bridge_missing')
      const envelope = z.strictObject({ payload: z.string(), mac: z.string() }).parse(JSON.parse(value.prompt.text.slice(inputPrefix.length)))
      if (!verifiedMac(inputKey, envelope.payload, envelope.mac)) throw new Error('swa_opencode_input_bridge_invalid')
      const payload = openCodeInputPayloadSchema.parse(JSON.parse(envelope.payload))
      if (payload.native_session_id !== scope.sessionID || payload.blocks.some(block => /^\s*\//u.test(block.text)) || delivered.has(payload.binding.operation_id)) throw new Error('swa_opencode_input_bridge_replayed')
      const text = payload.blocks.map(block => block.text).join('\n')
      const receipt = { payload, message_id: value.messageID }
      // 仅修改官方可写 prompt 事件，之后原生逻辑生成 UserPayload。
      Object.assign(event as object, { prompt: { text }, metadata: { swa_input: { ...receipt, mac: sign(inputKey, JSON.stringify(receipt)) } } })
      delivered.set(payload.binding.operation_id, { message: value.messageID, text })
    })
    await ctx.session.hook('context', async event => {
      const { scope } = await guardSession(event)
      const context = z.object({ model: modelSchema, agent: z.literal('build'), tools: z.record(z.string(), z.unknown()) }).parse(event)
      if (Object.keys(context.tools).length) throw new Error('swa_opencode_request_tools_available')
      // context.messages 可能与原生历史共享对象；先复制模型输入，再移除桥接元数据。
      const messages = structuredClone(z.object({ messages: z.array(z.record(z.string(), z.unknown())) }).parse(event).messages)
      for (const message of messages) {
        if (message.metadata && typeof message.metadata === 'object') delete (message.metadata as Record<string, unknown>).swa_input
      }
      if (JSON.stringify(messages).includes(inputPrefix) || JSON.stringify(messages).includes('"swa_input"')) throw new Error('swa_opencode_model_input_bridge_leaked')
      Object.assign(event as object, { messages })
      const users = messages.filter(message => message.role === 'user').map(message => typeof message.content === 'string' ? message.content : z.array(z.object({ type: z.literal('text'), text: z.string() })).parse(message.content).map(part => part.text).join(''))
      if (!users.length || users.at(-1) !== [...delivered.values()].at(-1)?.text) throw new Error('swa_opencode_model_input_changed')
      contextUsers.set(scope.sessionID, users)
    })
    await ctx.session.hook('model.request', async event => {
      await guardSession(event)
      z.object({ agent: z.literal('build'), model: modelSchema, kind: z.literal('primary'), baseURL: z.literal(target.base) }).parse(event)
    })
    for (const name of ['compaction', 'generate', 'title', 'experimental.ws.handshake', 'experimental.ws.send', 'experimental.ws.receive']) {
      await ctx.session.hook(name, () => { throw new Error('swa_opencode_auxiliary_request_denied') })
    }
    await ctx.session.hook('http.request', async event => {
      const { scope } = await guardSession(event)
      const payload = z.object({ model: modelSchema, kind: z.literal('primary'), request: z.instanceof(Request) }).parse(event)
      const request = payload.request, url = new URL(request.url)
      if (request.method !== 'POST' || url.href !== target.url || request.headers.get('authorization') !== `Bearer ${key}`) throw new Error('swa_opencode_native_target_changed')
      const rawBody: unknown = await request.clone().json()
      const body = z.object({ model: z.literal(target.model), tools: z.array(z.unknown()).optional(), messages: z.array(z.object({ role: z.string(), content: z.unknown() })) }).parse(rawBody)
      if (body.tools?.length) throw new Error('swa_opencode_http_tools_available')
      const serialized = JSON.stringify(rawBody)
      if (serialized.includes(inputPrefix) || serialized.includes('"swa_input"') || serialized.includes(inputKey)) throw new Error('swa_opencode_http_input_bridge_leaked')
      const actualUsers = body.messages.filter(message => message.role === 'user').map(message => typeof message.content === 'string' ? message.content : z.array(z.object({ type: z.literal('text'), text: z.string() })).parse(message.content).map(part => part.text).join(''))
      const expectedUsers = contextUsers.get(scope.sessionID)
      if (JSON.stringify(actualUsers) !== JSON.stringify(expectedUsers)) throw new Error('swa_opencode_http_input_changed')
      filesCurrent()
      emit('http_request', { session_id: scope.sessionID, model: body.model, tools_count: 0, initial_url: url.href, monotonic_ms: performance.now() })
    })
    await ctx.session.hook('http.response', async event => {
      const payload = z.object({ sessionID: z.string(), response: z.instanceof(Response) }).parse(event)
      emit('http_response', { session_id: payload.sessionID, status: payload.response.status, monotonic_ms: performance.now() })
    })
    await ctx.session.hook('retry', async event => {
      const payload = z.object({ sessionID: z.string(), attempt: z.number().int() }).parse(event)
      if (!event || typeof event !== 'object') throw new Error('swa_opencode_retry_invalid')
      Object.assign(event, { decision: { retry: false } })
      emit('retry_disabled', { session_id: payload.sessionID, attempt: payload.attempt })
    })
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (z.object({ type: z.string() }).parse(event).type !== 'plugin.updated') continue
        const plugins = await inventory()
        active = true
        emit('active', { plugins, tools_count: 0, directory: ctx.location.directory, roots: { home: process.env.HOME, data: process.env.XDG_DATA_HOME, cache: process.env.XDG_CACHE_HOME, config: process.env.XDG_CONFIG_HOME, state: process.env.XDG_STATE_HOME, programdata: process.env.ProgramData, temp: process.env.TEMP, database: process.env.OPENCODE_DB } })
      }
      if (!controller.signal.aborted) throw new Error('swa_opencode_policy_event_stream_ended')
    })().catch(error => {
      if (!controller.signal.aborted) {
        failure = true; active = false
        emit('failed', { code: error instanceof Error && /^swa_opencode_[a-z_]+$/.test(error.message) ? error.message : 'native_policy_validation_failed', checking, error_type: error instanceof Error ? error.name.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) : typeof error, issue_paths: error instanceof z.ZodError ? error.issues.map(issue => issue.path.join('.')) : [] })
      }
    })
    return () => { active = false; controller.abort(); emit('inactive'); authBytes.fill(0); inputKeyBytes.fill(0) }
  }
}
