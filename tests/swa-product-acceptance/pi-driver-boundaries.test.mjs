import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmod, link, lstat, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { isLinuxPiTarget, readPiPrivateJson, validatePiEventView, validatePiLaunchRecord } from './pi-event-view.mjs'
import { validateLinuxServiceReady } from './codex-event-view.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const missingProtocolCandidate = process.env.SWA_PI_MISSING_PROTOCOL_CANDIDATE

function actualStrictParser(directory) {
  const requireRuntime = createRequire(join(root, 'runtime/swa-orca/package.json'))
  const { buildSync } = requireRuntime('esbuild')
  const output = join(directory, 'rpc-protocol.cjs')
  // 直接构建当前生产解析器，纯边界检查不依赖历史安装或验收产物。
  buildSync({
    stdin: { contents: "export { parseStrictPiJson } from './third_party/orca-v1.4.230/src/main/pi/rpc-protocol';", resolveDir: root, loader: 'ts' },
    outfile: output, bundle: true, platform: 'node', format: 'cjs', target: 'node24', logLevel: 'error',
    nodePaths: [join(root, 'runtime/swa-orca/node_modules'), join(root, 'node_modules')],
    alias: { 'jsonc-parser': join(dirname(requireRuntime.resolve('jsonc-parser/package.json')), 'lib/esm/main.js') },
  })
  return createRequire(output)(output).parseStrictPiJson
}

async function publicDirectory() {
  const parent = join(root, '.verification/swa-product-acceptance')
  await mkdir(parent, { recursive: true, mode: 0o700 })
  return mkdtemp(join(parent, 'pi-driver-boundaries-'))
}

test('Linux Pi driver accepts only the approved StepFun N3/N4/N6 tuples', () => {
  for (const workers of [3, 4, 6]) assert.equal(isLinuxPiTarget('linux', 'pi', 'stepfun/step-3.5-flash', workers), true)
})

test('Linux Pi driver rejects other platforms, selections and worker counts', () => {
  const tuples = [
    ['win32', 'pi', 'stepfun/step-3.5-flash', 3],
    ['darwin', 'pi', 'stepfun/step-3.5-flash', 3],
    ['linux', 'codex', 'stepfun/step-3.5-flash', 3],
    ['linux', 'opencode', 'stepfun/step-3.5-flash', 3],
    ['linux', 'pi', 'step-3.5-flash', 3],
    ['linux', 'pi', 'stepfun/other', 3],
    ...[2, 5, 7, 100, 3.5, '3', '4', '6', NaN, Infinity, null, undefined].map(workers => ['linux', 'pi', 'stepfun/step-3.5-flash', workers]),
  ]
  for (const tuple of tuples) assert.equal(isLinuxPiTarget(...tuple), false)
})

test('the actual public package JSON is neither an owned launch record nor a Pi trace', async () => {
  const actual = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
  assert.throws(() => validatePiLaunchRecord(actual, {}), /pi_source_unknown_fields/)
  assert.throws(() => validatePiEventView(actual, {}), /pi_trace_inventory_bound/)
  assert.throws(() => validateLinuxServiceReady(actual, {}), /linux_service_ready_fields/)
})

test('private files use the driver FD reader and current production parser', { skip: process.platform !== 'linux' && 'Linux file ownership and permission checks' }, async () => {
  const directory = await publicDirectory()
  const parse = actualStrictParser(directory)
  const bytes = await readFile(new URL('../../package.json', import.meta.url))
  const publicFile = join(directory, 'public-package.json')
  await writeFile(publicFile, bytes, { flag: 'wx', mode: 0o600 })
  const actual = readPiPrivateJson(publicFile, bytes.length, parse)
  assert.deepEqual(actual.bytes, bytes)
  assert.deepEqual(actual.value, JSON.parse(bytes.toString('utf8')))

  const wrongMode = join(directory, 'public-wrong-mode.json')
  await writeFile(wrongMode, bytes, { flag: 'wx', mode: 0o600 })
  await chmod(wrongMode, 0o644)
  assert.throws(() => readPiPrivateJson(wrongMode, bytes.length, parse), /pi_private_json_metadata/)

  const redirected = join(directory, 'public-symlink.json')
  await symlink(publicFile, redirected)
  assert.throws(() => readPiPrivateJson(redirected, bytes.length, parse), /pi_private_json_redirected/)

  const hardSource = join(directory, 'public-hard-source.json')
  await writeFile(hardSource, bytes, { flag: 'wx', mode: 0o600 })
  const hardLink = join(directory, 'public-hard-link.json')
  await link(hardSource, hardLink)
  assert.throws(() => readPiPrivateJson(hardLink, bytes.length, parse), /pi_private_json_metadata/)
  assert.throws(() => readPiPrivateJson(directory, 1024, parse), /pi_private_json_metadata/)

  const oversize = join(directory, 'public-oversize.json')
  await writeFile(oversize, Buffer.alloc(1024 * 1024 + 1, 0x20), { flag: 'wx', mode: 0o600 })
  assert.throws(() => readPiPrivateJson(oversize, 1024 * 1024, parse), /pi_private_json_bound/)

  const badUtf8 = join(directory, 'public-invalid-utf8.json')
  await writeFile(badUtf8, Buffer.from([0xc3, 0x28]), { flag: 'wx', mode: 0o600 })
  assert.throws(() => readPiPrivateJson(badUtf8, 1024, parse), { code: 'ERR_ENCODING_INVALID_ENCODED_DATA' })

  const duplicate = join(directory, 'public-duplicate-key.json')
  await writeFile(duplicate, '{"public":{"name":1,"name":2}}\n', { flag: 'wx', mode: 0o600 })
  assert.throws(() => readPiPrivateJson(duplicate, 1024, parse), /native_pi_duplicate_json_key/)
})

test('an explicitly selected installation without the Pi protocol refuses observer preparation', {
  skip: process.platform !== 'linux' ? 'Linux installation check' : !missingProtocolCandidate && 'Set SWA_PI_MISSING_PROTOCOL_CANDIDATE to an installation without runtime/pi-protocol.cjs',
}, async () => {
  const support = missingProtocolCandidate
  assert.ok(isAbsolute(support), 'SWA_PI_MISSING_PROTOCOL_CANDIDATE must be an absolute installation path')
  assert.match((await readFile(join(support, 'VERSION'), 'utf8')).trim(), /^[0-9a-f]{40}$/)
  await assert.rejects(lstat(join(support, 'runtime/pi-protocol.cjs')), { code: 'ENOENT' })
  const directory = await publicDirectory()
  const result = spawnSync(join(support, 'node/node'), [
    join(root, 'tests/swa-product-acceptance/prepare-source-observer.mjs'),
    '--candidate', support, '--source-repository', root,
    '--output', join(directory, 'uncreated-observer'), '--profile', 'stepfun-pi-n3',
  ], {
    cwd: root,
    env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', HOME: directory, TMPDIR: directory, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024,
  })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 1)
  assert.equal(result.signal, null)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /ENOENT/)
  assert.match(result.stderr, /pi-protocol\.cjs/)
  await assert.rejects(lstat(join(directory, 'uncreated-observer')), { code: 'ENOENT' })
})
