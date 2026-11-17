import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readdir, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { promisify, parseArgs } from 'node:util'
import { publicFiles, publicRevision, publicSource } from '../swa-product-acceptance/public-case-definition.mjs'

const exec = promisify(execFile)
const acpAgents = ['qoder', 'qoder-cn', 'trae', 'codebuddy']
const quotaAgents = { qoder: 'qoder', 'qoder-cn': 'qoder-cn', trae: 'trae-cn', workbuddy: 'workbuddy' }
const agents = [...acpAgents, 'workbuddy', 'tabbit']
const smokeAnswer = 'SWA_FREE_AGENT_SMOKE_OK'
const help = `真实客户端验收
node tests/swa-free-agents/live.mjs --swarm ABS --project ABS [--agent all|qoder|qoder-cn|trae|codebuddy|workbuddy|tabbit] [--magpie-port PORT] [--report-dir ABS_NEW]
默认只做安装清单、ACP initialize、Tabbit 官方诊断和显式启用的 Magpie 本机缓存读取；不发送模型请求。
可选：--scratch ABS（在仓库外新建空白 ACP 会话）[--reload]，--tabbit-fixture（在 Tabbit 打开官方无账号测试页），--workbuddy-status（读取授权桌面在线状态）。
在已批准的固定公开 Git 项目内跑一次模型：
追加 --allow-model --agent ONE_ACP_ID --swa ABS --project-id ID --endpoint LOOPBACK --model ID --public-fixture ABS --report-dir ABS_NEW
此时 --project 和 --public-fixture 必须是同一目录，SWA_PROJECT_TOKEN 只通过进程环境提供。模型可能产生费用，额度缓存不构成免费承诺。
0 已请求的步骤通过；1 明确失败；2 参数无效；3 前置不足、证据不全或提交效果未知。
`

function reason(condition, code) {
  if (!condition) throw new Error(code)
}

function absolute(path) {
  return typeof path === 'string' && isAbsolute(path)
}

function shortID(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/\s|[\x00-\x1F]/u.test(value)
}

function safeCode(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : null
}

function samePath(left, right) {
  return process.platform === 'win32' ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : left === right
}

function options(argv) {
  const strings = ['swarm', 'project', 'agent', 'magpie-port', 'scratch', 'swa', 'project-id', 'endpoint', 'model', 'public-fixture', 'report-dir']
  const { values } = parseArgs({
    args: argv, allowPositionals: false, options: {
      ...Object.fromEntries(strings.map(key => [key, { type: 'string' }])),
      ...Object.fromEntries(['allow-model', 'reload', 'tabbit-fixture', 'workbuddy-status'].map(key => [key, { type: 'boolean' }]))
    }
  })
  values.agent ??= 'all'
  reason(absolute(values.swarm) && absolute(values.project) && (values.agent === 'all' || agents.includes(values.agent)), 'invalid_invocation')
  if (values['report-dir'] !== undefined) reason(absolute(values['report-dir']), 'invalid_report_directory')
  if (values.scratch !== undefined) reason(absolute(values.scratch) && (values.agent === 'all' || acpAgents.includes(values.agent)), 'invalid_scratch_for_acp')
  if (values.reload) reason(values.scratch !== undefined, 'reload_requires_scratch')
  if (values['tabbit-fixture']) reason(['all', 'tabbit'].includes(values.agent), 'browser_fixture_requires_tabbit')
  if (values['workbuddy-status']) reason(['all', 'workbuddy'].includes(values.agent), 'desktop_status_requires_workbuddy')
  if (values['magpie-port'] !== undefined) {
    reason(/^[0-9]{1,5}$/.test(values['magpie-port']) && +values['magpie-port'] > 0 && +values['magpie-port'] <= 65535, 'invalid_magpie_port')
    reason(values.agent === 'all' || Object.hasOwn(quotaAgents, values.agent), 'magpie_agent_not_supported')
  }
  const modelOnly = ['swa', 'project-id', 'endpoint', 'model', 'public-fixture']
  if (!values['allow-model']) {
    reason(modelOnly.every(key => values[key] === undefined), 'model_flags_require_opt_in')
    return values
  }
  reason(acpAgents.includes(values.agent) && absolute(values.swa) && absolute(values['public-fixture']) && absolute(values['report-dir']), 'missing_model_paths')
  reason(shortID(values.model) && shortID(values['project-id']) && !/[\\/?#]/u.test(values['project-id']), 'invalid_model_or_project_id')
  let endpoint
  try { endpoint = new URL(values.endpoint) } catch { throw new Error('invalid_loopback_endpoint') }
  reason(endpoint.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(endpoint.hostname) && endpoint.port && endpoint.pathname === '/' && !endpoint.search && !endpoint.hash && !endpoint.username && !endpoint.password, 'invalid_loopback_endpoint')
  values.endpoint = endpoint.origin
  return values
}

async function ordinary(path, directory) {
  const clean = resolve(path)
  const info = await lstat(clean)
  reason(!info.isSymbolicLink() && (directory ? info.isDirectory() : info.isFile()) && samePath(clean, await realpath(clean)), 'unsafe_local_path')
  return clean
}

async function writeNew(path, text) {
  const file = await open(path, 'wx', 0o600)
  try { await file.writeFile(text); await file.sync() }
  finally { await file.close() }
}

// CLI 子进程只接收需要的系统环境；项目令牌仅发给明确指定的 swa HTTP 客户端。
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(?:path|pathext|home|userprofile|username|systemroot|windir|systemdrive|comspec|appdata|localappdata|programdata|programfiles(?:\(x86\))?|commonprogramfiles|temp|tmp|tmpdir|os|lang|lc_.+|xdg_.+|ssl_cert_(?:file|dir)|swa_agent_registry|tabbit_playwright_instance)$/i.test(key)))
const parseJSON = input => { try { return JSON.parse(input) } catch { return null } }

async function call(command, args, { token, workbuddyToken, timeout = 20_000 } = {}) {
  const env = { ...baseEnv, ...(token ? { SWA_PROJECT_TOKEN: token } : {}), ...(workbuddyToken ? { SWA_WORKBUDDY_ACCESS_TOKEN: workbuddyToken } : {}) }
  try {
    const { stdout, stderr } = await exec(command, args, { env, windowsHide: true, timeout, maxBuffer: 16 * 1024 * 1024 })
    return { code: 0, value: parseJSON(stdout), lines: stderr.split(/\r?\n/u).map(parseJSON).filter(Boolean) }
  } catch (error) {
    return { code: Number.isInteger(error.code) ? error.code : null, value: parseJSON(error.stdout), lines: (error.stderr ?? '').split(/\r?\n/u).map(parseJSON).filter(Boolean) }
  }
}

async function fixedInputs(project) {
  const allowed = new Set(['.git', '.swa-free-agent-tests', ...publicFiles])
  reason((await readdir(project)).every(name => allowed.has(name)), 'public_fixture_contains_additional_content')
  await ordinary(join(project, '.git'), true)
  const git = async args => (await exec('git', ['-c', 'core.fsmonitor=false', '-c', 'submodule.recurse=false', '-C', project, ...args], {
    env: { ...baseEnv, GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0' },
    windowsHide: true, timeout: 10_000, maxBuffer: 128 * 1024
  })).stdout
  reason((await git(['rev-parse', 'HEAD'])).trim() === publicRevision && (await git(['remote', 'get-url', 'origin'])).trim() === publicSource, 'public_fixture_identity_mismatch')
  reason(samePath((await git(['rev-parse', '--show-toplevel'])).trim(), project), 'public_fixture_requires_repository_root')
  reason((await git(['ls-tree', '-r', '--name-only', publicRevision])).trimEnd().split(/\r?\n/u).join('\n') === publicFiles.join('\n'), 'public_fixture_tree_mismatch')
  const rows = []
  for (const name of publicFiles) {
    const path = await ordinary(join(project, name), false)
    const handle = await open(path, 'r')
    try {
      const info = await handle.stat()
      reason(info.isFile() && info.size > 0 && info.size <= 64 * 1024, 'public_fixture_file_size_invalid')
      const bytes = Buffer.alloc(info.size + 1)
      let read = 0
      while (read < bytes.length) {
        const next = await handle.read(bytes, read, bytes.length - read, read)
        if (next.bytesRead === 0) break
        read += next.bytesRead
      }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, read))
      reason(read === info.size && text === await git(['show', `${publicRevision}:${name}`]), 'public_fixture_file_changed')
      rows.push({ name, text })
    } finally { await handle.close() }
  }
  return rows
}

function runIdentity(receipt, request) {
  if (receipt?.event !== 'run_submitted' || receipt.request_id !== request) return null
  const identity = Object.fromEntries(['controller', 'run_id', 'task_id', 'dispatch_id'].map(key => [key, receipt[key]]))
  return Object.values(identity).every(shortID) ? identity : null
}

function verifyRun(value, identity) {
  const view = value?.result?.native?.run_view
  const dispatch = view?.dispatches?.find?.(row => row?.id === identity.dispatch_id)
  const output = dispatch && view?.tasks?.find?.(row => row?.id === dispatch.task_id)?.result
  reason(value?.ok === true && ['controller', 'run_id', 'task_id'].every(key => value[key] === identity[key]) &&
    view?.schema === 'swa.run-view.v1' && view.controller === identity.controller && view.run_id === identity.run_id && view.root_task_id === identity.task_id &&
    view.complete === true && view.status === 'completed' && shortID(value.runtime_id) && shortID(value.authority_domain) &&
    Array.isArray(view.dispatches) && view.dispatches.length === 1 && Array.isArray(view.failures) && view.failures.length === 0 && typeof output === 'string' && output.trim() === smokeAnswer &&
    shortID(dispatch.recipient_session_id), 'run_completion_evidence_incomplete')
  return { runtime_id: value.runtime_id, authority_domain: value.authority_domain, recipient_session_id: dispatch.recipient_session_id,
    result_sha256: createHash('sha256').update(output).digest('hex') }
}

async function observeAgent(config, swarm, project, item, id, record) {
  if (id === 'workbuddy') {
    const workbuddyToken = config['workbuddy-status'] ? process.env.SWA_WORKBUDDY_ACCESS_TOKEN : undefined
    if (!workbuddyToken) {
      record(id, 'desktop', 'BLOCKED', 'official_oauth_application_and_consent_required')
      return
    }
    const result = await call(swarm, ['agents', 'verify', id, '--json'], { workbuddyToken })
    const reply = result.value
    const online = result.code === 0 && reply?.schema_version === 1 && reply.agent_id === id && reply.state === 'online'
    record(id, 'desktop', online ? 'PASS' : 'BLOCKED', online ? 'authorized_official_desktop_online' :
      reply?.state === 'offline' ? 'authorized_official_desktop_offline' : 'official_desktop_status_unverified')
    return
  }
  const key = id === 'tabbit' ? (config['tabbit-fixture'] ? 'browser_fixture' : 'browser_diagnose') : 'acp_initialize'
  if (item?.installed?.status !== 'available') {
    record(id, key, 'BLOCKED', item?.installed?.status === 'unavailable' ? 'official_cli_not_found' : 'installation_not_verified')
    return
  }
  if (id === 'tabbit' && config['tabbit-fixture']) {
    const result = await call(swarm, ['agents', 'verify', id, '--json'], { timeout: 120_000 })
    const reply = result.value
    const observed = result.code === 0 && reply?.schema_version === 1 && reply.agent_id === id && reply.state === 'browser_task_verified' &&
      reply.fixture === 'official_cli_practice' && shortID(reply.request_id) && reply.cleanup_verified === true
    record(id, key, observed ? 'PASS' : result.code === 4 ? 'BLOCKED' : 'FAIL',
      observed ? 'original_browser_receipt_and_cleanup_observed' : 'official_browser_fixture_unverified',
      observed ? { request_id: reply.request_id } : undefined)
    return
  }
  if (acpAgents.includes(id) && config.scratch) {
    const result = await call(swarm, ['agents', 'verify', id, '--scratch', config.scratch, ...(config.reload ? ['--reload'] : []), '--json'], { timeout: 45_000 })
    const reply = result.value
    const initialized = result.code === 0 && reply?.schema_version === 1 && reply.agent_id === id && reply.protocol_version === 1
    record(id, key, initialized ? 'PASS' : result.code === 4 ? 'BLOCKED' : 'FAIL',
      initialized ? 'official_cli_returned_acp_v1' : 'communication_not_verified')
    if (!initialized) return
    for (const name of config.reload ? ['session_new', 'session_load'] : ['session_new']) {
      const state = reply[name]?.state
      const known = ['passed', 'rejected', 'unsupported', 'unknown', 'authentication_required', 'not_attempted'].includes(state)
      record(id, name, state === 'passed' ? 'PASS' : known && state !== 'rejected' ? 'BLOCKED' : 'FAIL',
        known ? state : 'invalid_session_check_reply', reply.workspace_retained === true ? { workspace_retained: true } : undefined)
    }
    return
  }
  const result = await call(swarm, id === 'tabbit' ? ['agents', 'diagnose', id, '--json'] : ['agents', 'connect', id, '--project', project, '--json'])
  const response = result.value
  const observed = result.code === 0 && response?.schema_version === 1 && response.agent_id === id &&
    (id === 'tabbit' ? response.state === 'diagnose_exit_ok' : response.protocol_version === 1)
  record(id, key, observed ? 'PASS' : result.code === 4 ? 'BLOCKED' : 'FAIL',
    observed ? (id === 'tabbit' ? 'diagnose_exited_successfully' : 'official_cli_returned_acp_v1') : 'communication_not_verified',
    observed && /^v?[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]{1,64})?$/u.test(response?.agent_info?.version ?? '') ? { cli_version: response.agent_info.version } : undefined)
}

async function testRun(config, project, reportDir, report, record) {
  const agent = config.agent
  const token = process.env.SWA_PROJECT_TOKEN
  if (!token) { record(agent, 'model', 'BLOCKED', 'current_project_grant_missing'); return }
  if (!report.checks.some(item => item.agent === agent && item.check === 'acp_initialize' && item.status === 'PASS')) {
    record(agent, 'model', 'BLOCKED', 'acp_initialize_not_observed')
    return
  }
  let swa, originals
  try {
    swa = await ordinary(config.swa, false)
    reason(samePath(project, await ordinary(config['public-fixture'], true)), 'public_fixture_is_not_selected_project')
    originals = await fixedInputs(project)
  } catch (error) {
    record(agent, 'model', 'BLOCKED', safeCode(error.message) ?? 'public_fixture_not_verified')
    return
  }
  const args = ['--project', config['project-id'], '--endpoint', config.endpoint, '--json']
  const version = (await exec(swa, ['--version'], { env: baseEnv, windowsHide: true, timeout: 5000, maxBuffer: 4096 }).catch(() => null))?.stdout?.trim()
  const capabilities = await call(swa, ['capabilities', ...args], { token, timeout: 45_000 })
  const target = capabilities.value?.result?.agents?.find?.(row => row?.id === agent)
  if (!/^[a-f0-9]{40}$/.test(version ?? '') || capabilities.code !== 0 || capabilities.value?.ok !== true ||
    capabilities.value?.result?.source_revision !== version ||
    target?.configured?.model !== config.model || ['registered', 'enabled', 'installed', 'configured'].some(key => target?.[key]?.status !== 'available') ||
    target?.control?.start?.status !== 'available' || target?.launchable?.status === 'unavailable' || target?.authenticated?.status === 'unavailable') {
    record(agent, 'model', 'BLOCKED', 'same_revision_model_and_native_start_not_verified')
    return
  }
  const request = randomUUID()
  const evidence = { schema_version: 1, agent, project_id: config['project-id'], model: config.model, request_id: request,
    source_revision: version, public_fixture_revision: publicRevision, endpoint: config.endpoint }
  await writeNew(join(reportDir, 'request.json'), JSON.stringify(evidence, null, 2) + '\n')
  report.request = evidence

  // 用一个 Worker，明确关闭问答、委派和开发工具；不改变项目授权。
  const inputRoot = join(project, '.swa-free-agent-tests')
  await mkdir(inputRoot, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error })
  await ordinary(inputRoot, true)
  const input = join(inputRoot, request)
  await mkdir(input, { mode: 0o700 })
  const spec = join(input, 'task.json'), prompt = join(input, 'input.txt')
  await writeNew(spec, JSON.stringify({ goal: '公开代码的单次模型连通性验证', source_repo: publicSource, source_revision: publicRevision,
    success_criteria: ['从固定公开源码回答校验字符串'], max_workers: 1, initial_workers: 1, context: { references: [], files: [] } }))
  await writeNew(prompt, '仅根据以下公开代码作答，不访问网络、文件或其他工具。如果存在包级函数 Mean，请仅返回 ' + smokeAnswer + '；否则仅返回 NOT_FOUND。\n' +
    originals.map(({ name, text }) => name + '\n' + text).join('\n'))

  const first = await call(swa, ['run', ...args, '--workdir', input, '--spec-file', spec, '--input-file', prompt, '--agent', agent, '--model', config.model,
    '--request-id', request, '--question-mode', 'disabled', '--delegation-mode', 'disabled', '--development-mode', 'disabled', '--timeout', '90s', '--on-input', 'exit', '--strict'],
  { token, timeout: 255_000 })
  report.model_request = 'SUBMITTED_TO_SWA_CLI'
  const identity = first.lines.map(line => runIdentity(line, request)).find(Boolean)
  if (!identity) {
    record(agent, 'model', first.code === 7 ? 'FAIL' : 'BLOCKED', safeCode(first.value?.error?.code) ?? 'inspect_original_request', { exit: first.code })
    return
  }
  report.request = { ...evidence, ...identity }
  if (first.code === 7) { record(agent, 'model', 'FAIL', safeCode(first.value?.error?.code) ?? 'original_run_failed'); return }

  // 等待中断时只重连原 Run，不用另一个 request id 重新发送任务。
  const reconnect = await call(swa, ['wait', ...args, '--controller', identity.controller, '--task', identity.task_id, '--run', identity.run_id,
    '--timeout', '30s', '--on-input', 'exit', '--strict'], { token, timeout: 45_000 })
  if (reconnect.code !== 0) {
    record(agent, 'model', reconnect.code === 7 ? 'FAIL' : 'BLOCKED', safeCode(reconnect.value?.error?.code) ?? 'inspect_original_run', { exit: reconnect.code })
    return
  }
  try {
    const terminal = verifyRun(reconnect.value, identity)
    record(agent, 'model', 'PASS', 'same_run_terminal_result_observed', terminal)
  } catch (error) { record(agent, 'model', 'FAIL', error.message) }
}

if (process.argv.length === 3 && process.argv[2] === '--help') {
  process.stdout.write(help)
} else {
  const report = { schema_version: 1, checked_at: new Date().toISOString(), platform: process.platform, model_request: 'NOT_RUN', checks: [] }
  const record = (agent, check, status, reason, details) => report.checks.push({ agent, check, status, reason, ...(details ?? {}) })
  let config, reportDir
  try {
    config = options(process.argv.slice(2))
    const swarm = await ordinary(config.swarm, false), project = await ordinary(config.project, true)
    if (config.scratch) config.scratch = await ordinary(config.scratch, true)
    if (config['report-dir']) {
      await ordinary(dirname(config['report-dir']), true)
      await mkdir(config['report-dir'], { mode: 0o700 })
      reportDir = config['report-dir']
    }
    const list = await call(swarm, ['agents', 'list', '--json'])
    reason(list.code === 0 && list.value?.schema_version === 1 && Array.isArray(list.value.items), 'swarm_inventory_unverifiable')
    for (const id of config.agent === 'all' ? agents : [config.agent]) {
      const item = list.value.items.find(row => row?.id === id)
      await observeAgent(config, swarm, project, item, id, record)
      if (config['magpie-port'] && Object.hasOwn(quotaAgents, id)) {
        const quota = await call(swarm, ['agents', 'quota', id, '--magpie-port', config['magpie-port'], '--json'])
        const reply = quota.value
        const providerMatches = quota.code === 0 && reply?.schema_version === 1 && reply.provider === quotaAgents[id]
        const observed = providerMatches && reply.state === 'cached' && Array.isArray(reply.windows) && reply.windows.length > 0
        const readable = observed || providerMatches && reply.state === 'unknown' && (reply.windows === undefined || Array.isArray(reply.windows) && reply.windows.length === 0)
        record(id, 'magpie_cache_transport', readable ? 'PASS' : 'BLOCKED', readable ? 'local_cache_reply_verified' : 'local_cache_reply_unverified')
        record(id, 'account_quota', observed ? 'PASS' : 'BLOCKED', observed ? 'cached_windows_observed_not_a_run_budget' : 'no_account_quota_evidence',
          observed ? { windows: reply.windows.length } : undefined)
      }
    }
    if (config['allow-model']) await testRun(config, project, reportDir, report, record)
    report.status = report.checks.some(item => item.status === 'FAIL') ? 'FAIL' : report.checks.some(item => item.status === 'BLOCKED') ? 'BLOCKED' : 'PASS'
    process.exitCode = { PASS: 0, FAIL: 1, BLOCKED: 3 }[report.status]
  } catch (error) {
    report.status = config ? 'FAIL' : 'INVALID_ARGUMENTS'
    report.reason = safeCode(error.message) ?? (config ? 'local_test_execution_failed' : 'invalid_invocation')
    process.exitCode = config ? 1 : 2
  }
  if (reportDir) {
    try { await writeNew(join(reportDir, 'report.json'), JSON.stringify(report, null, 2) + '\n') }
    catch {
      report.status = 'FAIL'
      report.reason = 'test_report_could_not_be_written'
      process.exitCode = 1
    }
  }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}
