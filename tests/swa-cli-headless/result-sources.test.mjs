import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { parseArgs } from 'node:util'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pathToFileURL } from 'node:url'
import { readJSONL } from './read-jsonl.mjs'
import { checkOpenCodeResultSources } from './opencode-result-sources.mjs'

const { values } = parseArgs({ options: { candidate: { type: 'string' }, 'flow-evidence': { type: 'string' }, output: { type: 'string' }, case: { type: 'string' } }, allowPositionals: false })
for (const name of ['candidate', 'flow-evidence', 'output']) if (!values[name] || !isAbsolute(values[name])) throw new Error(`Actual absolute ${name} is required`)
const candidate = await realpath(values.candidate), node = join(candidate, 'node', 'node.exe')
assert.equal((await realpath(process.execPath)).toLowerCase(), node.toLowerCase())
const flow = JSON.parse(await readFile(values['flow-evidence'], 'utf8'))
assert.equal((await realpath(flow.candidate)).toLowerCase(), candidate.toLowerCase())
assert.equal(flow.source_revision, (await readFile(join(candidate, 'VERSION'), 'utf8')).trim())
const actual = JSON.parse(await readFile(flow.resultFile, 'utf8'))
assert.equal(actual.runtime_id, flow.runtime_id)
assert.equal(actual.run_id, flow.run_id)
assert.equal(actual.task_id, flow.root_task_id)
assert.ok(actual.ok && actual.runtime_id && actual.run_id && actual.task_id)
const workers = actual.result.native.workers
const complete = workers.filter(worker => worker.native_session.availability === 'complete')
assert.ok(complete.length >= 1)
const worker = complete.at(-1), sessionId = worker.source.native_session_id
if (worker.source.selection.agent_id === 'opencode') {
  assert.equal(values.case, undefined)
  await checkOpenCodeResultSources({ candidate, flow, worker, output: values.output })
  process.exit(0)
}
const originalFile = worker.native_session.path, originalBytes = await readFile(originalFile)
assert.ok(originalBytes.length > 1200)
const cases = ['complete', 'round_trip_valid', 'missing', 'truncated', 'invalid_utf8', 'damaged_json', 'over_limit', 'wrong_filename', 'outside_root', 'replaced_after_read', 'prefix_changed_after_read', 'unknown_content_block', 'non_string_text', 'assistant_string_content', 'missing_message_timestamp', 'missing_usage_tokens', 'unknown_entry_type', 'missing_model_change_field', 'empty_final_content']

if (!values.case) {
  const observations = []
  const directory = join(dirname(values.output), 'actual-native-source-faults')
  await mkdir(directory)
  for (const name of cases) {
    const caseDirectory = join(directory, name)
    await mkdir(caseDirectory)
    const file = join(caseDirectory, 'result.json')
    const stdout = execFileSync(node, ['--max-old-space-size=512', import.meta.filename, '--candidate', candidate, '--flow-evidence', values['flow-evidence'], '--output', file, '--case', name], { encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024, env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=512' } })
    observations.push(JSON.parse(stdout))
    assert.deepEqual(await readFile(originalFile), originalBytes)
  }
  await writeFile(values.output, JSON.stringify({ candidate, source_revision: (await readFile(join(candidate, 'VERSION'), 'utf8')).trim(), real_runtime_id: actual.runtime_id, real_run_id: actual.run_id, real_dispatch_id: worker.worker.dispatchId, real_native_session_id: sessionId, actual_source: originalFile, original_source_bytes_unchanged: true, cases: observations, model_calls: 0, native_record_ownership_scope: 'covered_by_actual_installed_flow' }, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ output: values.output, actual_native_file_cases: observations.length, model_calls: 0 }))
} else {
  assert.ok(cases.includes(values.case))
  const requireRuntime = createRequire(join(candidate, 'runtime', 'package.json'))
  const { readNativePiSessionSource } = requireRuntime('./task-result.cjs')
  const root = join(dirname(values.output), 'sessions')
  await mkdir(root)
  const copy = join(root, basename(originalFile)), cwd = await realpath(worker.native_session.header.cwd)
  const read = path => readNativePiSessionSource(path, root, cwd, sessionId, false, worker.source.selection)
  if (values.case === 'missing') await assert.rejects(read(copy), /required native session source is missing/)
  else if (values.case === 'outside_root') await assert.rejects(read(originalFile), /escaped its exact private session directory/)
  else if (values.case === 'over_limit') {
    const repeated = Buffer.concat(Array(Math.ceil((12 * 1024 * 1024 + 1) / originalBytes.length)).fill(originalBytes))
    await writeFile(copy, repeated, { flag: 'wx' })
    await assert.rejects(read(copy), /exceeds the declared result bound/)
  } else if (values.case === 'wrong_filename') {
    const renamed = join(root, 'actual-session-renamed.jsonl')
    await writeFile(renamed, originalBytes, { flag: 'wx' })
    await assert.rejects(read(renamed), /header identity or cwd/)
  } else {
    await writeFile(copy, originalBytes, { flag: 'wx' })
    if (values.case === 'complete') {
      const source = await read(copy)
      assert.equal(source.availability, 'complete')
      assert.deepEqual(source.entries, worker.native_session.entries)
      assert.deepEqual(source.header, worker.native_session.header)
    } else if (values.case === 'truncated') {
      await writeFile(copy, originalBytes.subarray(0, originalBytes.length - 1))
      await assert.rejects(read(copy), /truncated or changed/)
    } else if (values.case === 'invalid_utf8') {
      const bytes = Buffer.from(originalBytes)
      bytes[0] = 255
      await writeFile(copy, bytes)
      await assert.rejects(read(copy), /encoded data|encoding|UTF-8/i)
    } else if (values.case === 'damaged_json') {
      const bytes = Buffer.from(originalBytes)
      bytes[0] = 33
      await writeFile(copy, bytes)
      await assert.rejects(read(copy), SyntaxError)
    } else if (['round_trip_valid', 'unknown_content_block', 'non_string_text', 'assistant_string_content', 'missing_message_timestamp', 'missing_usage_tokens', 'unknown_entry_type', 'missing_model_change_field', 'empty_final_content'].includes(values.case)) {
      const rows = await readJSONL(candidate, copy)
      const entry = rows.filter(row => row.type === 'message' && row.message.role === 'assistant').at(-1)
      assert.ok(entry)
      const text = entry.message.content.find(block => block.type === 'text')
      assert.ok(text)
      if (values.case === 'unknown_content_block') text.type = 'unsupported-content-block'
      if (values.case === 'non_string_text') text.text = 17
      if (values.case === 'assistant_string_content') entry.message.content = text.text
      if (values.case === 'missing_message_timestamp') delete entry.message.timestamp
      if (values.case === 'missing_usage_tokens') delete entry.message.usage.totalTokens
      if (values.case === 'unknown_entry_type') entry.type = 'unsupported-entry'
      if (values.case === 'missing_model_change_field') {
        const modelChange = rows.find(row => row.type === 'model_change')
        assert.ok(modelChange, 'The actual source did not contain the required model-change case')
        delete modelChange.modelId
      }
      if (values.case === 'empty_final_content') entry.message.content = []
      const { default: stringer } = await import(pathToFileURL(requireRuntime.resolve('stream-json/jsonl/stringer.js')).href)
      await pipeline(Readable.from(rows), stringer.asStream({ suffix: '\n' }), createWriteStream(copy, { flags: 'w' }))
      assert.equal((await readFile(copy)).at(-1), 10)
      assert.deepEqual(await readJSONL(candidate, copy), rows)
      if (values.case === 'round_trip_valid') {
        const source = await read(copy)
        assert.equal(source.availability, 'complete')
        assert.deepEqual(source.entries, worker.native_session.entries)
      } else if (values.case === 'empty_final_content') await assert.rejects(read(copy), /required final Worker native output is not complete/)
      else await assert.rejects(read(copy), error => {
        if (error.name !== 'ZodError' || !Array.isArray(error.issues)) return false
        const paths = error.issues.map(issue => issue.path)
        if (values.case === 'unknown_entry_type') return paths.some(path => path[0] === 'type')
        if (values.case === 'missing_model_change_field') return paths.some(path => path[0] === 'modelId')
        if (values.case === 'missing_message_timestamp') return paths.some(path => path[0] === 'message' && path.at(-1) === 'timestamp')
        if (values.case === 'missing_usage_tokens') return paths.some(path => path[0] === 'message' && path.includes('usage') && path.at(-1) === 'totalTokens')
        return paths.some(path => path[0] === 'message' && path.includes('content') && (values.case !== 'non_string_text' || path.at(-1) === 'text'))
      })
    } else {
      await read(copy)
      if (values.case === 'replaced_after_read') {
        await rename(copy, join(root, 'previous-actual-copy.jsonl'))
        await writeFile(copy, originalBytes, { flag: 'wx' })
        await assert.rejects(read(copy), /previously observed native source was replaced/)
      } else {
        await writeFile(copy, originalBytes.subarray(0, Math.floor(originalBytes.length / 2)))
        await assert.rejects(read(copy), /previously read native source prefix changed/)
      }
    }
  }
  assert.deepEqual(await readFile(originalFile), originalBytes)
  const result = { actual_case: values.case, real_dispatch_id: worker.worker.dispatchId, real_native_session_id: sessionId, owned_copy_only: true, original_source_bytes_unchanged: true, outcome: 'passed' }
  await writeFile(values.output, JSON.stringify(result) + '\n', { flag: 'wx' })
  console.log(JSON.stringify(result))
}
