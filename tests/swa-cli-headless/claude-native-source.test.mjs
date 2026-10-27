import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { appendFile, lstat, mkdir, mkdtemp, rename, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
const { buildSync } = requireRuntime('esbuild')
await mkdir(join(root, '.verification/claude-native-source'), { recursive: true })
const directory = await mkdtemp(join(root, '.verification/claude-native-source/run-'))
const output = join(directory, 'task-result.cjs')
buildSync({ entryPoints: [join(root, 'runtime/swa-orca/src/task-result.ts')], outfile: output, tsconfig: join(root, 'runtime/swa-orca/tsconfig.json'), bundle: true, platform: 'node', format: 'cjs', target: 'node24', nodePaths: [join(root, 'runtime/swa-orca/node_modules'), join(root, 'node_modules')], external: ['*.node'], alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib', 'esm', 'main.js') }, logLevel: 'silent' })
const { findNativeClaudeSessionPath } = createRequire(output)(output)
const readerOutput = join(directory, 'claude-session-result.cjs')
buildSync({ entryPoints: [join(root, 'runtime/swa-orca/src/claude-session-result.ts')], outfile: readerOutput, tsconfig: join(root, 'runtime/swa-orca/tsconfig.json'), bundle: true, platform: 'node', format: 'cjs', target: 'node24', nodePaths: [join(root, 'runtime/swa-orca/node_modules'), join(root, 'node_modules')], external: ['*.node'], alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib', 'esm', 'main.js') }, logLevel: 'silent' })
const { findPrivateClaudeTranscript, readNativeClaudeSessionSource } = createRequire(readerOutput)(readerOutput)
const linux = process.platform === 'linux'

async function privateRoot() {
  const path = await mkdtemp(join(directory, 'private-'))
  await mkdir(join(path, 'projects'), { mode: 0o700 })
  return path
}

test('Claude final text reaches the common Run result contract without including thinking blocks', { skip: !linux }, async () => {
  const path = await privateRoot(), nativeId = randomUUID(), inputUuid = randomUUID(), leaf = randomUUID()
  const project = join(path, 'projects', 'public-project')
  await mkdir(project, { mode: 0o700 })
  const file = join(project, `${nativeId}.jsonl`), content = [{ type: 'text', text: '已经完成第一部分。\n' }, { type: 'thinking', thinking: '构造的非交付推理块' }, { type: 'text', text: '第二部分也已完成。' }]
  const common = { sessionId: nativeId, cwd: directory, version: '2.1.284', timestamp: '2026-10-25T00:00:00.000Z', isSidechain: false }
  // 公开构造的协议输入只验证生产文件读取和成果投影，不冒充模型调用。
  const rows = [{ ...common, type: 'user', uuid: inputUuid, parentUuid: null, message: { role: 'user', content: '核对公开要求。' } },
    { ...common, type: 'assistant', uuid: leaf, parentUuid: inputUuid, message: { role: 'assistant', id: 'constructed-message', model: 'claude-opus-5', content, stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 2 } } }]
  await writeFile(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n', { mode: 0o600 })
  const info = await lstat(file, { bigint: true })
  const result = await readNativeClaudeSessionSource({ path: file, privateRoot: path, nativeId, cwd: directory, model: 'claude-opus-5', provider: 'anthropic', stopped: false, nativeVersion: '2.1.284', sdkVersion: '0.3.284', source: { path: file, version: `${info.dev}:${info.ino}:${info.birthtimeNs}:${info.mtimeNs}:${info.size}` }, expectedLeafUuid: leaf, inputUuid, validateExport: () => {} })
  assert.equal(result.value.availability, 'complete')
  assert.equal(result.value.final.text, '已经完成第一部分。\n第二部分也已完成。')
  assert.deepEqual(result.value.final.content, content)
  await result.verify()
})

// 只验证普通文件名库存和真实目录边界；文件正文不是原生JSONL，不用于账号或成功会话证明。
test('the actual empty private Claude inventory has no native session source', { skip: !linux }, async () => {
  await assert.rejects(findNativeClaudeSessionPath(await privateRoot(), randomUUID()), /session source is missing/)
})

test('the actual duplicate filename inventory refuses an ambiguous native selector', { skip: !linux }, async () => {
  const path = await privateRoot(), id = randomUUID()
  for (const name of ['public-a', 'public-b']) {
    const project = join(path, 'projects', name)
    await mkdir(project, { mode: 0o700 })
    await writeFile(join(project, id + '.jsonl'), '公开文件名库存检查输入\n', { flag: 'wx', mode: 0o600 })
  }
  await assert.rejects(findNativeClaudeSessionPath(path, id), /session source is ambiguous/)
})

test('the actual private Claude inventory refuses a redirected directory', { skip: !linux }, async () => {
  const path = await privateRoot(), target = await privateRoot()
  await symlink(target, join(path, 'projects', 'redirected'), 'dir')
  await assert.rejects(findNativeClaudeSessionPath(path, randomUUID()), /inventory was redirected/)
})

test('the actual private Claude inventory stops at its total entry bound', { skip: !linux }, async () => {
  const path = await privateRoot(), projects = join(path, 'projects')
  for (let index = 0; index < 4097; index++) {
    await writeFile(join(projects, `public-${index}.txt`), '公开库存边界\n', { flag: 'wx', mode: 0o600 })
  }
  await assert.rejects(findNativeClaudeSessionPath(path, randomUUID()), /inventory exceeds its bound/)
})

// 下列 helper 只查询实际目录和文件身份；公开正文不是原生 JSONL，不送入会话解析器。
test('the private transcript helper verifies actual absence before and after directory additions', { skip: !linux }, async t => {
  await t.test('an absent projects directory cannot appear after the observation', async () => {
    const path = await mkdtemp(join(directory, 'absent-projects-'))
    const observed = await findPrivateClaudeTranscript(path, randomUUID())
    assert.equal(observed.path, null)
    observed.verify()
    await mkdir(join(path, 'projects'), { mode: 0o700 })
    assert.throws(observed.verify, /source_changed/)
  })
  await t.test('an observed empty projects directory cannot gain a project after the observation', async () => {
    const path = await privateRoot()
    const observed = await findPrivateClaudeTranscript(path, randomUUID())
    assert.equal(observed.path, null)
    observed.verify()
    await mkdir(join(path, 'projects', 'public-project'), { mode: 0o700 })
    assert.throws(observed.verify, /source_changed/)
  })
})

test('the private transcript helper binds the actual selected public file through modification and replacement', { skip: !linux }, async () => {
  const path = await privateRoot(), id = randomUUID(), project = join(path, 'projects', 'public-project')
  await mkdir(project, { mode: 0o700 })
  const selected = join(project, id + '.jsonl')
  await writeFile(selected, '公开元数据检查输入\n', { flag: 'wx', mode: 0o600 })
  const original = await findPrivateClaudeTranscript(path, id)
  assert.equal(original.path, selected)
  original.verify()
  await appendFile(selected, '公开追加元数据\n')
  assert.throws(original.verify, /source_changed/)
  const modified = await findPrivateClaudeTranscript(path, id)
  assert.equal(modified.path, selected)
  modified.verify()
  const replacement = join(project, 'public-replacement.txt')
  await writeFile(replacement, '公开替换元数据\n', { flag: 'wx', mode: 0o600 })
  await rename(replacement, selected)
  assert.throws(modified.verify, /source_changed/)
})

test('the private transcript helper refuses duplicate actual filenames for one selector', { skip: !linux }, async () => {
  const path = await privateRoot(), id = randomUUID()
  for (const name of ['public-a', 'public-b']) {
    const project = join(path, 'projects', name)
    await mkdir(project, { mode: 0o700 })
    await writeFile(join(project, id + '.jsonl'), '公开重复名称元数据\n', { flag: 'wx', mode: 0o600 })
  }
  await assert.rejects(findPrivateClaudeTranscript(path, id), /source_ambiguous/)
})

test('the private transcript helper refuses actual redirection and an exceeded inventory', { skip: !linux }, async t => {
  await t.test('a project symlink is rejected', async () => {
    const path = await privateRoot(), target = await privateRoot()
    await symlink(target, join(path, 'projects', 'redirected'), 'dir')
    await assert.rejects(findPrivateClaudeTranscript(path, randomUUID()), /source_redirected/)
  })
  await t.test('the global 4096 entry budget is enforced before expansion', async () => {
    const path = await privateRoot(), projects = join(path, 'projects')
    for (let index = 0; index < 4097; index++) {
      await writeFile(join(projects, `public-${index}.txt`), '公开库存边界\n', { flag: 'wx', mode: 0o600 })
    }
    await assert.rejects(findPrivateClaudeTranscript(path, randomUUID()), /source_inventory_exceeds_bound/)
  })
})
