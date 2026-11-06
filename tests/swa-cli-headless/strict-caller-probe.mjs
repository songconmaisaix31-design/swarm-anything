import assert from 'node:assert/strict'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { sendRequest } from '../../third_party/orca-v1.4.230/src/cli/runtime/transport'
import { getRuntimeMetadataPath } from '../../third_party/orca-v1.4.230/src/shared/runtime-bootstrap'
import { ORCHESTRATION_CONTRACT_VERSION } from '../../third_party/orca-v1.4.230/src/shared/protocol-version'

async function main() {
  const { values } = parseArgs({ options: { state: { type: 'string' }, output: { type: 'string' } }, allowPositionals: false })
  const state = JSON.parse(await readFile(values.state, 'utf8'))
  const data = await realpath(state.data_root)
  const metadata = JSON.parse(await readFile(getRuntimeMetadataPath(data), 'utf8'))
  assert.equal(metadata.runtimeId, state.runtime_id)
  assert.equal((await readFile(join(state.candidate, 'VERSION'), 'utf8')).trim(), state.source_revision)
  const response = await sendRequest(metadata, 'orchestration.runCreate', { from: state.controller, objective: state.objective }, 30_000, { orchestrationRequestId: `${state.task_request}/run-create`, orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION })
  await writeFile(values.output, JSON.stringify({ actual_runtime_id: response._meta.runtimeId, actual_native_request: `${state.task_request}/run-create`, actual_method: 'orchestration.runCreate', caller_evidence: 'absent', native_response: response, model_calls: 0 }, null, 2) + '\n', { flag: 'wx' })
  assert.equal(response.ok, false)
  assert.equal(response.error.code, 'scope_denied')
  assert.equal(response._meta.runtimeId, state.runtime_id)
}
main().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1 })
