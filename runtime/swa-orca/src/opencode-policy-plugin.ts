import { lstatSync, readFileSync, realpathSync, statSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { assertOpenCodeCredentialCurrent } from './native-opencode-credential'

const pluginId = 'swa.opencode.policy'
const expectedIds = ['opencode.provider.opencode', 'opencode.config.policy', 'opencode.agent', 'opencode.models.dev', 'opencode.config.agent', 'opencode.config.compaction', pluginId].sort()
const modelSchema = z.object({ id: z.literal('deepseek-v4-pro'), providerID: z.literal('deepseek') })
const optionsSchema = z.strictObject({ root: z.string().min(1), correlation: z.string().regex(/^[a-f0-9]{64}$/), source: z.string().min(1), sources: z.array(z.strictObject({ path: z.string(), version: z.string() })).min(1), absent_sources: z.array(z.string()), credential_source: z.strictObject({ path: z.string().min(1), version: z.string().min(1), id: z.string().min(1), updated_at: z.number().int().nonnegative() }) })
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

export default {
  id: pluginId,
  async setup(ctx: Context) {
    const options = optionsSchema.parse(ctx.options), root = realpathSync(options.root)
    if (root.toLowerCase() !== options.root.toLowerCase()) throw new Error('swa_opencode_private_root_changed')
    const authPath = join(root, 'data/opencode/auth.json'), configPath = join(root, 'config/opencode/opencode.json')
    const authBytes = readFileSync(authPath), configBytes = readFileSync(configPath), pluginBytes = readFileSync(options.source)
    const key = z.object({ deepseek: z.strictObject({ type: z.literal('api'), key: z.string().min(1) }) }).parse(JSON.parse(authBytes.toString('utf8'))).deepseek.key
    let sequence = 0, active = false, failure = false, checking = 'setup'
    const controller = new AbortController()
    const emit = (state: string, detail: Record<string, unknown> = {}) => writeSync(2, 'SWA_OPENCODE_POLICY ' + JSON.stringify({ type: 'swa_opencode_policy', correlation: options.correlation, pid: process.pid, root, sequence: ++sequence, state, ...detail }) + '\n')
    const filesCurrent = () => {
      if (failure || controller.signal.aborted || !authBytes.equals(readFileSync(authPath)) || !configBytes.equals(readFileSync(configPath)) || !pluginBytes.equals(readFileSync(options.source))) throw new Error('swa_opencode_policy_unavailable')
      for (const source of options.sources) {
        const path = realpathSync(source.path), info = statSync(path, { bigint: true })
        if (path !== source.path || !info.isFile() || `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}` !== source.version) throw new Error('swa_opencode_source_changed')
      }
      for (const path of options.absent_sources) {
        try { lstatSync(path) }
        catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue; throw error }
        throw new Error('swa_opencode_source_appeared')
      }
      const credential = options.credential_source
      assertOpenCodeCredentialCurrent(credential, credential.id, credential.updated_at, key)
    }
    async function inventory() {
      filesCurrent()
      checking = 'plugin_list'
      const raw = await ctx.plugin.list()
      checking = 'plugin_response_decode'
      const response = z.object({ location: z.object({ directory: z.string().min(1) }), data: inventorySchema }).parse(raw)
      checking = 'plugin_location'
      if (realpathSync(response.location.directory).toLowerCase() !== realpathSync(ctx.location.directory).toLowerCase()) throw new Error('swa_opencode_plugin_location_changed')
      const plugins = response.data
      checking = 'plugin_ids'
      if (JSON.stringify(plugins.map(row => row.id).sort()) !== JSON.stringify(expectedIds)) throw new Error('swa_opencode_plugin_inventory_changed')
      checking = 'tool_list'
      if ((await ctx.tool.list()).length) throw new Error('swa_opencode_tools_available')
      checking = 'agent_permissions'
      const agents = z.object({ location: z.object({ directory: z.string() }), data: z.array(z.object({ id: z.string(), permissions: permissionSchema })) }).parse(await ctx.agent.list())
      if (realpathSync(agents.location.directory).toLowerCase() !== realpathSync(ctx.location.directory).toLowerCase() || agents.data.length !== 1 || agents.data[0]!.id !== 'build') throw new Error('swa_opencode_agent_selection_changed')
      const last = agents.data[0]!.permissions.at(-1)
      if (last?.action !== '*' || last.resource !== '*' || last.effect !== 'deny') throw new Error('swa_opencode_agent_permissions_changed')
      checking = 'connection_active'
      const connection = await ctx.integration.connection.active('deepseek')
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
      if (realpathSync(session.location.directory).toLowerCase() !== realpathSync(ctx.location.directory).toLowerCase()) throw new Error('swa_opencode_session_directory_changed')
      if (session.permissions?.some(rule => rule.effect !== 'deny')) throw new Error('swa_opencode_session_permission_changed')
      return { scope, plugins }
    }
    await ctx.session.hook('prompt', async event => { await guardSession(event) })
    await ctx.session.hook('context', async event => {
      await guardSession(event)
      const context = z.object({ model: modelSchema, agent: z.literal('build'), tools: z.record(z.string(), z.unknown()) }).parse(event)
      if (Object.keys(context.tools).length) throw new Error('swa_opencode_request_tools_available')
    })
    await ctx.session.hook('model.request', async event => {
      await guardSession(event)
      z.object({ agent: z.literal('build'), model: modelSchema, kind: z.literal('primary'), baseURL: z.literal('https://api.deepseek.com') }).parse(event)
    })
    for (const name of ['compaction', 'generate', 'title', 'experimental.ws.handshake', 'experimental.ws.send', 'experimental.ws.receive']) {
      await ctx.session.hook(name, () => { throw new Error('swa_opencode_auxiliary_request_denied') })
    }
    await ctx.session.hook('http.request', async event => {
      const { scope } = await guardSession(event)
      const payload = z.object({ model: modelSchema, kind: z.literal('primary'), request: z.instanceof(Request) }).parse(event)
      const request = payload.request, url = new URL(request.url)
      if (request.method !== 'POST' || url.href !== 'https://api.deepseek.com/chat/completions' || request.headers.get('authorization') !== `Bearer ${key}`) throw new Error('swa_opencode_native_target_changed')
      const body = z.object({ model: z.literal('deepseek-v4-pro'), tools: z.array(z.unknown()).optional() }).parse(await request.clone().json())
      if (body.tools?.length) throw new Error('swa_opencode_http_tools_available')
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
    return () => { active = false; controller.abort(); emit('inactive'); authBytes.fill(0) }
  }
}
