import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, win32 } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { finder: { type: 'string' }, output: { type: 'string' }, mode: { type: 'string' }, 'finder-child': { type: 'boolean' } }, allowPositionals: false })
assert.equal(process.platform, 'win32')
assert.equal(process.arch, 'x64')
assert.equal(process.version, 'v24.21.0')
assert.ok(values.finder && isAbsolute(values.finder) && values.output && isAbsolute(values.output))
assert.ok(['baseline', 'experimental-probe-selection', 'devshell'].includes(values.mode))
const requireGyp = createRequire(values.finder), gypRoot = dirname(dirname(values.finder))
assert.equal(JSON.parse(await readFile(join(gypRoot, 'package.json'), 'utf8')).version, '12.3.0')
const identity = { node: process.version, node_arch: process.arch, node_gyp: '12.3.0', finder_sha256: createHash('sha256').update(await readFile(values.finder)).digest('hex'), mode: values.mode }
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })

if (values['finder-child']) {
  const Finder = requireGyp(values.finder)
  const gyp = requireGyp(join(gypRoot, 'lib', 'node-gyp.js'))()
  gyp.parseArgv([process.execPath, join(gypRoot, 'bin', 'node-gyp.js'), 'rebuild'])
  const option = gyp.opts['msvs-version']
  assert.equal(option, values.mode === 'baseline' ? '2022' : '2026')
  const finder = new Finder(requireGyp('semver').parse(process.version), option)
  const result = { ...identity, actual_msvs_option: option, actual_option_source: values.mode === 'baseline' ? 'original-builder-npm_config_msvs_version-through-unmodified-parseArgv' : 'experimental-probe-selection-npm_config_msvs_version-through-unmodified-parseArgv', higher_priority_option_present: Object.keys(process.env).some(key => /^npm_package_config_node_gyp_msvs_version$/i.test(key)), vc_install_dir_present: Boolean(process.env.VCINSTALLDIR) }
  try {
    const actual = await finder.findVisualStudio()
    result.accepted = true
    result.actual = Object.fromEntries(['path', 'version', 'versionYear', 'msBuild', 'sdk', 'toolset'].map(key => [key, actual[key]]))
  } catch (error) {
    result.accepted = false
    result.exception_name = error.name
    process.exitCode = 1
  }
  result.stdio_maxbuffer_reported = finder.errorLog.some(line => line.includes('ERR_CHILD_PROCESS_STDIO_MAXB'))
  result.configured_version_mismatch_reported = finder.errorLog.some(line => line.includes('msvs_version does not match this version'))
  result.observed_valid_version_years = [...new Set(finder.validVersions.filter(Number.isSafeInteger))]
  await save(values.output, result)
} else {
  // 所有原始输出留在子进程边界内；公开报告只保留真实计数及已声明字段。
  const observe = (program, args, captureJSON = null) => new Promise(resolve => {
    const child = spawn(program, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const result = { stdout_bytes: 0, stderr_bytes: 0, timed_out: false, byte_limit_exceeded: false }
    const chunks = []
    let settled = false, grace
    const finish = extra => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(grace)
      if (captureJSON && extra.exit === 0 && !result.timed_out && !result.byte_limit_exceeded) {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          const raw = captureJSON === 'vssetup' && !Array.isArray(parsed) ? [parsed] : parsed
          assert.ok(Array.isArray(raw))
          result.installations = raw.map(info => {
            if (captureJSON !== 'vssetup') return { path: info.path, version: info.version, packages_count: Array.isArray(info.packages) ? info.packages.length : null }
            const version = info.InstallationVersion
            const numbers = [version?.Major, version?.Minor, version?.Build, version?.Revision]
            return { path: info.InstallationPath, version: numbers.every(Number.isSafeInteger) ? numbers.join('.') : null, packages_count: Array.isArray(info.Packages) ? info.Packages.length : null }
          })
        } catch (error) { result.json_error_name = error.name }
      }
      resolve({ ...result, ...extra })
    }
    const stop = () => {
      result.owned_child_termination_requested = child.kill()
      grace ??= setTimeout(() => {
        child.stdout.destroy()
        child.stderr.destroy()
        child.unref()
        finish({ exit: null, signal: null, settlement_unknown: true })
      }, 5000)
    }
    const timer = setTimeout(() => { result.timed_out = true; stop() }, 60_000)
    child.stdout.on('data', chunk => {
      result.stdout_bytes += chunk.length
      if (result.stdout_bytes + result.stderr_bytes > 16 * 1024 * 1024) { result.byte_limit_exceeded = true; stop() }
      else if (captureJSON) chunks.push(chunk)
    })
    child.stderr.on('data', chunk => {
      result.stderr_bytes += chunk.length
      if (result.stdout_bytes + result.stderr_bytes > 16 * 1024 * 1024) { result.byte_limit_exceeded = true; stop() }
    })
    child.once('error', error => finish({ exit: null, signal: null, spawn_error_code: error.code }))
    child.once('close', (exit, signal) => finish({ exit, signal }))
  })
  const childResult = values.output + '.finder.json'
  const finderProcess = await observe(process.execPath, [import.meta.filename, '--finder', values.finder, '--output', childResult, '--mode', values.mode, '--finder-child'])
  const result = { ...identity, finder_process: finderProcess }
  if (!finderProcess.timed_out && !finderProcess.byte_limit_exceeded && !finderProcess.settlement_unknown && [0, 1].includes(finderProcess.exit)) result.finder = JSON.parse(await readFile(childResult, 'utf8'))
  const observeDefaultExecFile = (program, args) => new Promise(resolve => {
    let settled = false
    const child = execFile(program, args, { encoding: 'utf8', timeout: 60_000, windowsHide: true }, (error, stdout, stderr) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      resolve({ error_code: error?.code ?? null, exit_signal: error?.signal ?? null, killed: error?.killed ?? false, stdout_bytes: Buffer.byteLength(stdout), stderr_bytes: Buffer.byteLength(stderr) })
    })
    child.stdin.end()
    const deadline = setTimeout(() => {
      if (settled) return
      settled = true
      const requested = child.kill()
      child.stdout.destroy()
      child.stderr.destroy()
      child.unref()
      resolve({ settlement_unknown: true, timed_out: true, owned_child_termination_requested: requested })
    }, 65_000)
  })
  if (values.mode === 'baseline') {
    const powershell = win32.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const cs = win32.join(dirname(values.finder), 'Find-VisualStudio.cs').replaceAll("'", "''")
    const args = ['-ExecutionPolicy', 'Unrestricted', '-NoProfile', '-Command', "&{Add-Type -IgnoreWarnings -Path '" + cs + "';[VisualStudioConfiguration.Main]::PrintJson()}"]
    result.default_execfile = await observeDefaultExecFile(powershell, args)
    result.stream_observation = await observe(powershell, args, 'csharp')
    const moduleArgs = ['-NoProfile', '-Command', '&{@(Get-Module -ListAvailable -Name VSSetup).Version.ToString()}']
    const setupArgs = ['-NoProfile', '-Command', '&{Get-VSSetupInstance  | ConvertTo-Json -Depth 3}']
    result.vssetup_module = { default_execfile: await observeDefaultExecFile(powershell, moduleArgs), stream_observation: await observe(powershell, moduleArgs) }
    result.vssetup_instances = { default_execfile: await observeDefaultExecFile(powershell, setupArgs), stream_observation: await observe(powershell, setupArgs, 'vssetup') }
  }
  await save(values.output, result)
  const observations = [finderProcess, result.default_execfile, result.stream_observation, result.vssetup_module?.default_execfile, result.vssetup_module?.stream_observation, result.vssetup_instances?.default_execfile, result.vssetup_instances?.stream_observation].filter(Boolean)
  if (![0, 1].includes(finderProcess.exit) || observations.some(observation => observation.spawn_error_code || observation.timed_out || observation.byte_limit_exceeded || observation.settlement_unknown)) process.exitCode = 2
}
