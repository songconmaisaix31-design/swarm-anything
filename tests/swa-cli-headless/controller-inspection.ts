import assert from 'node:assert/strict'
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import Database from '../../third_party/orca-v1.4.230/src/main/sqlite/sync-database'
import { DaemonClient } from '../../third_party/orca-v1.4.230/src/main/daemon/client'
import { getDaemonPidPath, getDaemonSocketPath, getDaemonTokenPath } from '../../third_party/orca-v1.4.230/src/main/daemon/daemon-spawner'
import type { ListSessionsResult } from '../../third_party/orca-v1.4.230/src/main/daemon/types'
import { controllerOwnerSchema } from '../../runtime/swa-orca/src/controller-scope'
import { swaDaemonServiceJobSchema } from '../../third_party/orca-v1.4.230/src/main/daemon/swa-service-job'
import { ORCHESTRATION_LEGACY_RUN_ID } from '../../third_party/orca-v1.4.230/src/shared/orchestration-rpc-contract'

async function main() {
  const { values } = parseArgs({ options: {
    candidate: { type: 'string' }, 'data-root': { type: 'string' }, 'owner-file': { type: 'string' },
    'request-show-file': { type: 'string' }, database: { type: 'string' }, output: { type: 'string' },
    'inventory-only': { type: 'boolean', default: false }, 'idle-only': { type: 'boolean', default: false },
    'historical-owner': { type: 'boolean', default: false }
  }, allowPositionals: false })
  const required = (key: keyof typeof values) => z.string().refine(isAbsolute).parse(values[key])
  assert.equal([!!values['owner-file'], !!values['request-show-file'], !!values['inventory-only'], !!values['idle-only']].filter(Boolean).length, 1, 'Choose exactly one actual inspection input')
  assert.ok(!values['historical-owner'] || !!values['owner-file'], 'Historical inspection requires the actual owner file')
  const candidate = await realpath(required('candidate')), data = await realpath(required('data-root'))
  assert.equal((await realpath(process.execPath)).toLowerCase(), join(candidate, 'node', 'node.exe').toLowerCase())
  const responseFile = values['inventory-only'] || values['idle-only'] ? null : values['owner-file'] ? required('owner-file') : required('request-show-file')
  const envelope = responseFile ? z.object({ ok: z.literal(true), request_id: z.uuid(), authority_domain: z.string().min(1), result: z.unknown() }).parse(JSON.parse(await readFile(responseFile, 'utf8'))) : null
  const owner = envelope ? values['owner-file'] ? controllerOwnerSchema.parse(envelope.result) : z.object({ method: z.literal('swa.controllerRecover'), state: z.literal('completed'), receipt: controllerOwnerSchema }).parse(envelope.result).receipt : null
  const databasePath = await realpath(required('database')), rel = relative(data, databasePath)
  assert.ok(rel && rel !== '..' && !rel.startsWith('..\\') && !isAbsolute(rel))
  const expectedDatabase = join(data, 'orchestration.db')
  for (const path of [required('database'), expectedDatabase]) {
    const stat = await lstat(path)
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'The actual orchestration database must be an ordinary file')
  }
  assert.equal(databasePath.toLowerCase(), (await realpath(expectedDatabase)).toLowerCase(), 'The actual orchestration database cannot be replaced by another SQLite file')
  const db = new Database(databasePath, { readonly: true, fileMustExist: true })
  let idle: { counts: Record<string, number>; run: Record<string, unknown> } | null = null
  try {
    if (envelope && owner) {
      const row = z.object({ method: z.enum(['swa.controllerOpen', 'swa.controllerRecover']), state: z.literal('completed'), receipt: z.string() }).parse(db.prepare('SELECT method, state, receipt FROM mutation_receipts WHERE caller_fingerprint=? AND request_id=?').get(envelope.authority_domain, envelope.request_id))
      if (values['request-show-file']) assert.equal(row.method, 'swa.controllerRecover')
      assert.deepEqual(controllerOwnerSchema.parse(JSON.parse(row.receipt)), owner)
    }
    if (values['idle-only']) {
      const counts: Record<string, number> = {}
      for (const table of ['coordinator_runs', 'tasks', 'dispatch_contexts', 'worker_dispatches', 'worker_terminal_resources', 'mutation_receipts']) {
        const actual = z.object({ count: z.literal(0) }).parse(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get())
        counts[table] = actual.count
      }
      const rows = z.array(z.looseObject({
        id: z.literal(ORCHESTRATION_LEGACY_RUN_ID), objective: z.literal('Legacy orchestration state (inspect only)'),
        home_database: z.literal('this_database'), consumer_generation: z.literal(0), legacy: z.literal(1),
        coordinator_handle: z.null(), coordinator_pane_key: z.null(), coordinator_orca_session_id: z.null(),
        coordinator_orca_session_id_generation: z.null()
      })).length(1).parse(db.prepare('SELECT * FROM runs').all())
      idle = { counts, run: rows[0]! }
    }
  } finally { db.close() }
  const directory = join(data, 'daemon'), pidPath = getDaemonPidPath(directory)
  assert.equal((await realpath(pidPath)).toLowerCase(), pidPath.toLowerCase())
  const record = z.object({ pid: z.number().int().positive(), launchNonce: z.uuid(), swa_service_job: swaDaemonServiceJobSchema }).parse(JSON.parse(await readFile(pidPath, 'utf8')))
  const client = new DaemonClient({ socketPath: getDaemonSocketPath(directory), tokenPath: getDaemonTokenPath(directory) })
  try {
    await client.ensureConnectedWithin(5000)
    const daemon = client.getDaemonIdentity()
    assert.ok(daemon && daemon.pid === record.pid && daemon.launchNonce === record.launchNonce)
    assert.deepEqual(daemon.swa_service_job, record.swa_service_job)
    const ownership = record.swa_service_job
    assert.equal(ownership.install_root.toLowerCase(), candidate.toLowerCase())
    assert.equal(ownership.data_root.toLowerCase(), data.toLowerCase())
    assert.equal(ownership.source_revision, (await readFile(join(candidate, 'VERSION'), 'utf8')).trim())
    const inventory = await client.request<ListSessionsResult>('listSessions', undefined, 5000)
    const sessions = z.array(z.looseObject({ sessionId: z.string(), incarnationId: z.string().optional(), terminalHandle: z.string().optional(), pid: z.number().nullable(), isAlive: z.boolean(), wslDistro: z.string().nullable().optional() })).parse(inventory.sessions)
    const matches = owner ? sessions.filter(session => session.sessionId === owner.binding.ptyId || session.terminalHandle === owner.controller) : []
    let ownerState = values['idle-only'] ? 'idle' : 'inventory'
    if (owner) {
      if (values['historical-owner']) assert.ok(matches.length <= 1)
      else assert.equal(matches.length, 1)
      const session = matches[0]
      if (session) {
        assert.equal(session.sessionId, owner.binding.ptyId)
        assert.equal(session.incarnationId, owner.binding.processIncarnation)
        assert.equal(session.terminalHandle, owner.controller)
        assert.equal(session.pid, owner.process.pid)
        assert.equal(session.isAlive, !values['historical-owner'])
        assert.ok(session.wslDistro == null)
      }
      ownerState = values['historical-owner'] ? session ? 'historical' : 'absent' : 'live'
    }
    if (values['idle-only']) assert.equal(sessions.length, 0, 'Idle inspection requires an empty actual PTY inventory')
    await writeFile(required('output'), JSON.stringify({ observed_at: new Date().toISOString(), source_revision: ownership.source_revision, owner_state: ownerState, idle, actual_native_owner: owner, actual_response_file: responseFile, daemon, service_job: ownership, session: matches[0] ?? null, inventory: sessions, database: databasePath }, null, 2) + '\n', { flag: 'wx' })
  } finally { client.disconnect() }
}
main().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1 })
