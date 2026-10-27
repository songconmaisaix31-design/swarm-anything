import assert from 'node:assert/strict'
import { createRequire, findPackageJSON } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: Object.fromEntries(['candidate', 'executable', 'output'].map(key => [key, { type: 'string' }])), allowPositionals: false })
for (const key of ['candidate', 'executable', 'output']) assert.ok(values[key] && isAbsolute(values[key]))
const candidate = await realpath(values.candidate), executable = await realpath(values.executable)
assert.equal((await realpath(process.execPath)).toLowerCase(), join(candidate, 'node/node.exe').toLowerCase())
const requireRuntime = createRequire(join(candidate, 'runtime/package.json'))
const { JsonlRpcAgentConnection } = requireRuntime('./agent-connection.cjs')
const root = join(dirname(values.output), 'native-pi-private')
await mkdir(root)
await mkdir(join(root, 'events'))
await mkdir(join(root, 'home'))
await mkdir(join(root, 'agent'))
const env = {}
for (const [key, value] of Object.entries(process.env)) if (/^(SYSTEMROOT|WINDIR|SYSTEMDRIVE|COMSPEC|PATHEXT|PATH|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|OS|LANG|LC_ALL)$/i.test(key) && value !== undefined) env[key] = value
Object.assign(env, { HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), PI_CODING_AGENT_DIR: join(root, 'agent') })
const records = []
const connection = new JsonlRpcAgentConnection({ command: process.execPath, args: [join(candidate, 'runtime/native-cli-entry.cjs'), JSON.stringify({ command: executable, args: ['--mode', 'rpc', '--offline', '--no-approve', '--no-tools', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files'] })], cwd: root, env, envToDelete: Object.keys(process.env).filter(key => !(key in env)), swaJobIPC: true, swaEventDirectory: join(root, 'events') }, { allowedCommands: new Set(['get_state']), onRecord: record => records.push(record) })
let state, job, closed, manifest
try {
  state = await connection.request('get_state', {}, { timeoutMs: 20_000 })
  job = connection.observeOwnedJob()
  assert.equal(job.nativeCLI.kind, 'node-script')
  assert.ok(job.nativeCLI.entry && job.nativeCLI.program && job.nativeCLI.pid !== job.rootPid)
  assert.ok(job.members.some(row => row.pid === job.nativeCLI.pid && row.creationTimeMs === job.nativeCLI.creationTimeMs))
  const manifestPath = findPackageJSON(pathToFileURL(job.nativeCLI.entry))
  assert.ok(manifestPath)
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.equal(manifest.version, '1.0.1')
  assert.ok(state && !records.some(row => ['agent_start', 'message_start', 'message_update', 'message_end', 'agent_end'].includes(row.type)))
} finally { closed = await connection.close(); assert.deepEqual(closed, { root: 'exited', tree: 'exited' }) }
await writeFile(values.output, JSON.stringify({ candidate, source_revision: (await readFile(join(candidate, 'VERSION'), 'utf8')).trim(), actual_executable: executable, native_package: { name: manifest.name, version: manifest.version }, actual_state: state, job, closed, model_calls: 0, original_credentials_copied: false, scope: 'actual_native_Pi_RPC_and_node_script_Job_IPC' }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ output: values.output, native_package: manifest.name, version: manifest.version, model_calls: 0, closed }))
