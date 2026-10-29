import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { root } from '../../scripts/process.mjs';
import { startS1Server } from './server.mjs';
import { humanAPI } from './api.mjs';

const outputRoot = process.env.ASTROCYTE_TEST_OUTPUT_ROOT ?? join(root, '.verification');

for (const relay of [false, true]) test(`production server keeps owned SQLite after close and reopens it without private discovery (relay layout=${relay})`, { timeout: 120_000 }, async () => {
  let server = await startS1Server({ relay });
  const original = server.temporary;
  try {
    assert.ok(relative(await realpath(outputRoot), await realpath(original)).startsWith('astrocyte-s1-'));
    if (relay) {
      assert.equal(server.localAppData, join(original, 'local-appdata'));
      assert.equal(server.relayRoot, join(server.localAppData, 'astrocyte-workbench', 'v0.2-access'));
      assert.equal(server.dataDir, join(server.relayRoot, 'app-state'));
      await assert.rejects(access(join(original, 'profile', 'go', 'pkg', 'mod')), { code: 'ENOENT' });
    }
    let api = await humanAPI(server.apiURL);
    assert.deepEqual((await api.get('/materials')).items, []);
    assert.deepEqual((await api.get('/local-projects')).items, []);
    assert.equal(server.query('PRAGMA integrity_check')[0].integrity_check, 'ok');
    const { snapshot: discovery } = await api.write('/local-projects/registered/refresh', {});
    assert.equal(discovery.projects.length, 1);
    assert.equal(discovery.projects[0].source, 'explicit_directory');
    assert.equal(await realpath(discovery.projects[0].root), await realpath(root));
    const refreshed = await api.write('/works/refresh', { roots: [root] });
    assert.equal(refreshed.snapshot.works.length, 1);
    assert.equal(await realpath(refreshed.snapshot.works[0].root), await realpath(root));
    assert.equal(refreshed.snapshot.works[0].files.verified, true);
    await assert.rejects(api.write('/works/refresh', { request_id: 'explicitly-mismatched-request', roots: [root] }), /400/);
    await assert.rejects(server.startAPI(), /still running/);
    await server.stopAPI();
    await assert.rejects(fetch(`${server.apiURL}/api/v1/health`, { signal: AbortSignal.timeout(1000) }));
    await server.startAPI();
    const oldURL = server.apiURL;
    await server.close();
    await access(join(server.dataDir, 'state.sqlite'));
    await assert.rejects(fetch(`${oldURL}/api/v1/health`, { signal: AbortSignal.timeout(1000) }));
    server = await startS1Server({ relay, reuseOwnedTemporary: { path: original, ownedRoot: original } });
    assert.equal(server.temporary, original);
    api = await humanAPI(server.apiURL);
    assert.deepEqual((await api.get('/materials')).items, []);
    assert.equal(server.query('PRAGMA integrity_check')[0].integrity_check, 'ok');
    await server.restart();
    api = await humanAPI(server.apiURL);
    assert.deepEqual((await api.get('/materials')).items, []);
  } finally { await server.close(); }
});

test('actual Go port zero stays bound and Vite uses its observed address through restart', { timeout: 90_000 }, async () => {
  const server = await startS1Server({ browser: true });
  const closedURLs = [server.apiURL, server.webURL];
  try {
    const actualURL = server.apiURL;
    assert.notEqual(server.webURL, actualURL);
    assert.equal((await fetch(`${server.webURL}/`)).status, 200);
    let api = await humanAPI(server.webURL);
    assert.deepEqual((await api.get('/materials')).items, []);
    let apiFailure;
    await assert.rejects(startS1Server({ apiPort: Number(new URL(actualURL).port) }), error => {
      apiFailure = error;
      assert.equal(error.message, 'Actual Go listener announcement became unavailable');
      return true;
    });
    const failedAPI = JSON.parse(await readFile(join(apiFailure.logsDirectory, 'startup-failure.json'), 'utf8'));
    assert.equal(failedAPI.logs.length, 1);
    assert.match(await readFile(failedAPI.logs[0].stderr, 'utf8'), /bind|listen/i);
    assert.throws(() => process.kill(failedAPI.logs[0].pid, 0), { code: 'ESRCH' });
    let webFailure;
    await assert.rejects(startS1Server({ browser: true, webPort: Number(new URL(server.webURL).port) }), error => {
      webFailure = error;
      assert.equal(error.message, 'Actual Vite listener announcement became unavailable');
      return true;
    });
    const failedWeb = JSON.parse(await readFile(join(webFailure.logsDirectory, 'startup-failure.json'), 'utf8'));
    assert.equal(failedWeb.logs.length, 1, 'Vite bind failure must occur before starting another API');
    assert.match(await readFile(failedWeb.logs[0].stderr, 'utf8'), /already in use|EACCES|EADDRINUSE/);
    for (const log of failedWeb.logs) assert.throws(() => process.kill(log.pid, 0), { code: 'ESRCH' });
    assert.equal((await fetch(`${server.webURL}/`)).status, 200, 'failed second startup must retain the original Vite listener');
    await server.restart();
    assert.equal(server.apiURL, actualURL, 'explicit restart must retain the actual assigned port');
    api = await humanAPI(server.webURL);
    const result = await api.write('/works/refresh', { roots: [root] });
    assert.equal(result.snapshot.works.length, 1);
    assert.equal(await realpath(result.snapshot.works[0].root), await realpath(root));
    assert.equal(server.query('PRAGMA integrity_check')[0].integrity_check, 'ok');
  } finally { await server.close(); }
  assert.equal(server.processLogs.length, 3);
  for (const log of server.processLogs) {
    assert.throws(() => process.kill(log.pid, 0), { code: 'ESRCH' });
    assert.ok(relative(server.temporary, log.stdout).startsWith('process-logs-'));
    assert.match(await readFile(log.stdout, 'utf8'), log.name === 'vite' ? /vite_listening/ : /http_listening/);
    await access(log.stderr);
  }
  for (const url of closedURLs) await assert.rejects(fetch(url, { signal: AbortSignal.timeout(1000) }));
});

test('relative output root fails before any process starts', async () => {
  await assert.rejects(startS1Server({ outputRoot: 'relative-output' }), { message: 'Verification outputRoot must be an explicit absolute directory' });
});
