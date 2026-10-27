import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { chmod, link, lstat, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { isLinuxPiTarget, readPiPrivateJson, validatePiEventView, validatePiLaunchRecord } from './pi-event-view.mjs'
import { validateLinuxServiceReady } from './codex-event-view.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const protocolPath = process.env.SWA_PI_DRIVER_PROTOCOL_MODULE
const protocolSha = process.env.SWA_PI_DRIVER_PROTOCOL_SHA256
const reviewedProtocolPath = join(root, '.verification/cloud-setup/pi-shared-bundle-r1/run-um80b1/2-rpc-protocol.ts.cjs')
const reviewedProtocolSha = '563dc4d56af7bb8713c5e9812fb010ade298c1f5b21515e49fd33869328c181e'
const support = '/workspace/swa-linux-installs/swa-linux-combined-8752ec99-common-dir-01'

// 仅为 development 纯 module 组件；不能称装内同 S 或原生链路通过。
assert.equal(process.platform, 'linux', 'pi_driver_boundaries_require_linux')
assert.ok(protocolPath && protocolSha, 'pi_driver_boundaries_require_SWA_PI_DRIVER_PROTOCOL_MODULE_and_SWA_PI_DRIVER_PROTOCOL_SHA256')
assert.ok(isAbsolute(protocolPath), 'pi_driver_boundaries_require_absolute_protocol_module')
assert.equal(protocolPath, reviewedProtocolPath, 'pi_driver_boundaries_require_reviewed_development_protocol')
assert.equal(protocolSha, reviewedProtocolSha, 'pi_driver_boundaries_require_reviewed_protocol_sha256')

function actualStrictParser() {
  assert.equal(realpathSync(protocolPath), protocolPath)
  const before = lstatSync(protocolPath, { bigint: true })
  assert.ok(before.isFile() && !before.isSymbolicLink())
  assert.equal(createHash('sha256').update(readFileSync(protocolPath)).digest('hex'), protocolSha)
  // 后继 runner 显式准入这个真实纯产物；不编译或回退仓库 parser。
  const api = createRequire(import.meta.url)(protocolPath)
  assert.equal(typeof api.parseStrictPiJson, 'function')
  const identity = info => [info.dev, info.ino, info.birthtimeNs, info.mtimeNs, info.ctimeNs, info.size, info.mode, info.uid, info.nlink]
  assert.deepEqual(identity(lstatSync(protocolPath, { bigint: true })), identity(before))
  assert.equal(createHash('sha256').update(readFileSync(protocolPath)).digest('hex'), protocolSha)
  return api.parseStrictPiJson
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

test('real private public files use the driver FD reader and reviewed strict parser', async () => {
  const parse = actualStrictParser()
  const directory = await publicDirectory()
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

test('the actual 875 installation refuses the Pi observer before any product CLI or build', async () => {
  assert.equal((await readFile(join(support, 'VERSION'), 'utf8')).trim(), '8752ec991668071d59ff5fca4cf99690568ff90c')
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
