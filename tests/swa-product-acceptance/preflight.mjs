import { execFileSync } from 'node:child_process'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { parseArgs } from 'node:util'

const options = Object.fromEntries(['candidate', 'data-root', 'project', 'agent', 'model', 'workers'].map(name => [name, { type: 'string' }]))
let values
try {
  values = parseArgs({ options, allowPositionals: false }).values
  values.workers ??= '3'
  if (!/^[1-9]\d*$/.test(values.workers) || !Number.isSafeInteger(Number(values.workers)) || Number(values.workers) < 3) throw new Error('--workers must be an integer of at least 3 for this acceptance plan')
  for (const name of ['candidate', 'data-root', 'project', 'agent']) {
    if (values[name] !== undefined && !isAbsolute(values[name])) throw new Error(`--${name} requires an explicit absolute path`)
  }
  for (const [name, value] of Object.entries(values)) if (!value.trim()) throw new Error(`--${name} cannot be empty`)
} catch (error) {
  // 参数可能包含用户误传的秘密，只公开参数名和固定诊断。
  process.stderr.write(JSON.stringify({ status: 'INVALID_ARGUMENTS', message: error.code ? 'Unsupported or incomplete arguments; use only candidate, data-root, project, agent, model and workers' : error.message, acceptance: 'NOT_RUN' }) + '\n')
  process.exit(2)
}

const checks = []
const record = (name, status, detail) => checks.push({ name, status, detail })
const windows = process.platform === 'win32' && process.arch === 'x64'
const linux = process.platform === 'linux' && process.arch === 'x64' && !!process.report?.getReport().header.glibcVersionRuntime
const hostPlatform = windows ? 'win32-x64' : linux ? 'linux-x64-glibc' : null
record('platform', hostPlatform ? 'PASS' : 'NOT_RUN', hostPlatform ? `${hostPlatform} host observed; an actual matching candidate is still required` : 'No supported product candidate platform was observed')
for (const name of ['candidate', 'data-root', 'project', 'agent', 'model']) {
  record(`input.${name}`, values[name] ? 'PASS' : 'NOT_RUN', values[name] ? 'Explicit input supplied; operation remains unverified' : `Supply --${name} for the selected actual installation and approved run`)
}
record('authorization.binding', process.env.SWA_PROJECT_TOKEN ? 'PASS' : 'NOT_RUN', process.env.SWA_PROJECT_TOKEN ? 'SWA_PROJECT_TOKEN is set; validity, scope and expiry are not verified' : 'SWA_PROJECT_TOKEN is unset; supply values through the protected runtime, never command arguments')

async function ordinary(path, directory) {
  const info = await lstat(path)
  const actual = await realpath(path)
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) throw new Error('An explicitly selected input is not an ordinary file or directory')
  return actual
}

const overlaps = (left, right) => {
  const within = relative(left, right)
  return !within || within !== '..' && !within.startsWith('..\\') && !within.startsWith('../') && !isAbsolute(within)
}

// 只观察当前平台的明确候选，不运行其他平台的二进制。
if (hostPlatform && values.candidate) {
  try {
    const candidate = await ordinary(values.candidate, true)
    let platform
    try {
      await ordinary(join(candidate, 'PLATFORM'), false)
      platform = (await readFile(join(candidate, 'PLATFORM'), 'utf8')).trim()
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      platform = 'win32-x64'
    }
    if (!['win32-x64', 'linux-x64-glibc'].includes(platform) || platform !== hostPlatform) throw new Error('The candidate platform does not match this host')
    const cli = platform === 'win32-x64' ? 'swa.exe' : 'swa'
    const required = ['VERSION', cli, platform === 'win32-x64' ? 'server.exe' : 'server', platform === 'win32-x64' ? 'node/node.exe' : 'node/node', 'runtime/package.json', 'runtime/host.cjs', 'runtime/client.cjs']
    for (const file of required) {
      const actual = await ordinary(join(candidate, file), false)
      if (!overlaps(candidate, actual)) throw new Error('A candidate input escapes the selected installation')
    }
    const revision = (await readFile(join(candidate, 'VERSION'), 'utf8')).trim()
    if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('Candidate VERSION must contain the exact source commit emitted by the product builder')
    const actual = execFileSync(join(candidate, cli), ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 64 * 1024 }).trim()
    if (actual !== revision) throw new Error('The selected installed CLI does not report the candidate VERSION')
    record('candidate.version', 'PASS', revision)
    record('candidate.closure', 'NOT_RUN', 'Run the existing check:swa against this exact installation; minimum file presence does not prove the dependency closure')
    if (values['data-root'] && values.project) {
      const data = await ordinary(values['data-root'], true)
      const project = await ordinary(values.project, true)
      if (linux) {
        const info = await lstat(data)
        if (info.uid !== process.getuid() || (info.mode & 0o777) !== 0o700) throw new Error('The Linux private data root must be owned by the current uid and have mode 0700')
      }
      if ([[candidate, data], [candidate, project], [data, project]].some(([left, right]) => overlaps(left, right) || overlaps(right, left))) throw new Error('Candidate, private data root and public test project must be separate directories')
      record('paths.isolation', 'PASS', 'The selected real directory roots do not overlap; ACL and actual write destinations still require the real acceptance checks')
    }
  } catch {
    record('candidate.observation', 'FAIL', 'The explicitly selected candidate or directory inputs could not be verified; inspect them locally without exposing credentials')
  }
}
if (hostPlatform && values.agent) {
  try {
    await ordinary(values.agent, false)
    record('agent.file', 'PASS', 'The explicitly selected executable file exists; installation, login, NativeLaunch policy and model access remain unverified')
  } catch {
    record('agent.file', 'FAIL', 'The explicitly selected Agent executable is not an accessible ordinary file')
  }
}
for (const name of ['authorization.current_scope', 'agent.native_launch_and_tools_off', 'milestone_a.actual_multiworker', 'milestone_b.cli_gui_consistency']) {
  record(name, 'NOT_RUN', 'Requires the actual authorized product run and its native evidence; this preflight does not perform it')
}
const status = checks.some(check => check.status === 'FAIL') ? 'FAIL' : 'NOT_RUN'
process.stdout.write(JSON.stringify({ status, checked_at: new Date().toISOString(), platform: process.platform, arch: process.arch, workers: Number(values.workers), checks, model_calls: 0, acceptance: { milestone_a: 'NOT_RUN', milestone_b: 'NOT_RUN' } }, null, 2) + '\n')
process.exitCode = status === 'FAIL' ? 1 : 3
