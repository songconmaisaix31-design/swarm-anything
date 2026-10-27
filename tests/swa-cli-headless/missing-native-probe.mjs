import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const [runtime, node, entry] = process.argv.slice(2)
const requireRuntime = createRequire(join(runtime, 'package.json'))
const { JsonlRpcAgentConnection } = requireRuntime('./agent-connection.cjs')
assert.throws(() => new JsonlRpcAgentConnection({ command: node, args: [entry], swaJobIPC: true }), error => {
  if (!(error instanceof Error) || !error.message.startsWith('Failed to load native module: conpty.node')) return false
  process.stdout.write(JSON.stringify({ type: 'actual_missing_native_rejection', message: error.message }) + '\n')
  return true
})
