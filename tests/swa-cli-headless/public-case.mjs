import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { root: { type: 'string' } }, allowPositionals: false })
if (!values.root || !isAbsolute(values.root)) throw new Error('An explicit absolute case root is required')
const source = 'https://github.com/songconmaisaix31-design/astrocyte-s3-public-stats.git'
const revision = 'da3bdddb085808863090a05f60cc1c64415039cf'
const target = join(await realpath(values.root), 'public-project')
const environment = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_GLOBAL: 'NUL', GIT_CONFIG_SYSTEM: 'NUL' }
const git = args => execFileSync('git', ['-c', 'credential.helper=', '-c', 'core.askPass=', '-c', 'http.sslBackend=schannel', ...args], { encoding: 'utf8', env: environment, windowsHide: true, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 })
git(['clone', '--no-checkout', source, target])
git(['-C', target, 'checkout', '--detach', revision])
assert.equal(git(['-C', target, 'rev-parse', 'HEAD']).trim(), revision)
assert.equal(git(['-C', target, 'remote', 'get-url', 'origin']).trim(), source)
const files = ['README.md', 'go.mod', 'stats.go', 'stats_test.go']
const originals = []
for (const path of files) {
  const text = git(['-C', target, 'show', `${revision}:${path}`])
  assert.equal(await readFile(join(target, path), 'utf8'), text)
  originals.push({ path, source_revision: revision, text })
}
const directory = join(target, '.verification', 'swa-cli-input')
await mkdir(directory, { recursive: true })
const goal = '基于固定公开stats项目交付Median设计及验证说明，包含实际并发分析、计划停止A、B在同一会话继续取得A部分输出并交付最终说明；不修改程序。'
const criteria = [
  'A与B真实模型执行存在重叠；A执行中被指定停止，保留其真实状态及部分输出，A不要求完成。',
  'A完整专有Job确认退出且B原PID/创建时间/session/fence继续，B接受一次实际A部分输出和固定原来源的后续输入。',
  'B最终完整说明覆盖奇数/偶数长度、负数/重复、空值及NaN/±Inf、有限大中间值溢出、输入顺序保持和原Mean不变，并引用准确公开文件位置。',
  '完整取得B实际成果，全部相关资源确认退出、归档、释放，本机Orca保持真实可用。'
]
const spec = { goal, source_repo: source, source_revision: revision, success_criteria: criteria, max_workers: 2, context: { references: [], files } }
await writeFile(join(directory, 'task.json'), JSON.stringify(spec, null, 2) + '\n', { flag: 'wx' })
const context = JSON.stringify({ source, revision, originals })
await writeFile(join(directory, 'a.txt'), '请分析Median实现设计及输入保持、有限值溢出和边界验证。依据给定公开原文逐项展开推理并引用文件行位置；本任务计划在执行中停止你的会话，停止前输出仍会交给B。禁止调用工具，不修改文件，不自行声称通过测试。\n' + context + '\n', { flag: 'wx' })
await writeFile(join(directory, 'b.txt'), '请独立审查公开项目Mean现状和Median设计，详细说明奇偶长度、负数/重复、空值/NaN/正负Infinity、有限大值求均值溢出、输入顺序保持、原Mean不变及逐项验证方法，引用实际文件行位置。收到后续输入后须在同一会话结合A部分输出交付完整最终说明。禁止调用工具，不修改文件，不自行声称通过测试。\n' + context + '\n', { flag: 'wx' })
await writeFile(join(directory, 'source.json'), JSON.stringify({ project_root: target, source, revision, files: originals }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ project_root: target, source, revision, input_directory: directory, files, anonymous_source: true, human_grant: 'REQUIRED', model_calls: 0 }))
