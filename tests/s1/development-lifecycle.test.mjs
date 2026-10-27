import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { launchLogged, root, stop, verificationOutputRoot } from '../../scripts/process.mjs';
import { humanAPI } from './api.mjs';

test('actual development command keeps build, Vite, SQLite, failure logs and shutdown within its explicit output root', { timeout: 120_000 }, async () => {
  const output = verificationOutputRoot();
  await mkdir(output, { recursive: true });
  const directory = await mkdtemp(join(output, 'swa-dev-lifecycle-'));
  const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('ASTROCYTE_') && !name.toUpperCase().startsWith('SWA_')));
  const env = { ...baseEnv, TEMP: join(directory, 'tool-temp'), TMP: join(directory, 'tool-temp'), GOTMPDIR: join(directory, 'tool-temp'),
    GOCACHE: process.env.GOCACHE ?? join(directory, 'go-cache'), ASTROCYTE_TEST_OUTPUT_ROOT: join(directory, 'success'), SWA_PORT: '0', SWA_WEB_PORT: '0' };
  for (const path of [env.TEMP, env.GOCACHE]) await mkdir(path, { recursive: true });
  const owned = await launchLogged(process.execPath, [join(root, 'scripts/dev.mjs'), '--ephemeral'], { cwd: root, env, ipc: true, detached: process.platform !== 'win32' }, directory, 'development');
  let actual;
  try {
    actual = await new Promise((resolve, reject) => {
      const onExit = () => { clearTimeout(timer); reject(new Error(`Actual development command exited; stderr=${owned.log.stderr}`)); };
      const timer = setTimeout(() => reject(new Error('Actual development command readiness timed out')), 60_000);
      owned.child.once('exit', onExit);
      owned.child.once('message', record => {
        clearTimeout(timer);
        owned.child.removeListener('exit', onExit);
        try {
          assert.equal(record.type, 'development_ready');
          for (const value of [record.web_url, record.api_url]) {
            const url = new URL(value);
            assert.equal(url.origin, value);
            assert.equal(url.hostname, '127.0.0.1');
            assert.ok(Number(url.port) > 0);
          }
          resolve(record);
        } catch (error) { reject(error); }
      });
    });
    assert.ok(relative(await realpath(env.ASTROCYTE_TEST_OUTPUT_ROOT), await realpath(actual.temporary)).startsWith('swa-dev-'));
    await access(join(actual.temporary, process.platform === 'win32' ? 'server.exe' : 'server'));
    const database = new DatabaseSync(join(actual.temporary, 'data/workspace/state.sqlite'), { readOnly: true });
    try { assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); }
    finally { database.close(); }
    const page = await fetch(actual.web_url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /SWA · 任务与交付/);
    const api = await humanAPI(actual.web_url);
    assert.deepEqual((await api.get('/project-spaces')).items, []);
    assert.deepEqual((await api.get('/local-projects')).items, []);
    for (const path of ['/materials', '/works', '/cognition/today']) {
      assert.equal((await fetch(`${actual.web_url}/api/v1${path}`, { headers: { Cookie: api.cookie } })).status, 404);
    }

    const failedRoot = join(directory, 'failure');
    const failed = await launchLogged(process.execPath, [join(root, 'scripts/dev.mjs'), '--ephemeral'], {
      cwd: root, env: { ...env, ASTROCYTE_TEST_OUTPUT_ROOT: failedRoot, SWA_WEB_PORT: new URL(actual.web_url).port }, detached: process.platform !== 'win32',
    }, directory, 'development-conflict');
    try {
      const exit = await failed.drain();
      assert.equal(exit.code, 1);
      const stores = await readdir(failedRoot);
      assert.equal(stores.length, 1);
      const store = join(failedRoot, stores[0]);
      const failure = JSON.parse(await readFile(join(store, 'startup-failure.json'), 'utf8'));
      assert.equal(failure.message, 'Actual Vite listener announcement became unavailable');
      assert.deepEqual(failure.logs.map(log => log.name), ['build', 'vite']);
      assert.match(await readFile(join(store, 'vite.stderr.log'), 'utf8'), /EADDRINUSE|EACCES/);
      assert.throws(() => process.kill(failure.logs[1].pid, 0), { code: 'ESRCH' });
      assert.equal((await fetch(actual.web_url)).status, 200);
    } finally { await stop(failed.child, { env }); }

    owned.child.send({ type: 'development_stop' });
    const exit = await owned.drain();
    assert.equal(exit.code, 0);
    for (const log of actual.logs) {
      await access(log.stdout);
      await access(log.stderr);
      if (log.name !== 'build') assert.throws(() => process.kill(log.pid, 0), { code: 'ESRCH' });
    }
    for (const url of [actual.web_url, actual.api_url]) await assert.rejects(fetch(url, { signal: AbortSignal.timeout(1000) }));
    await access(join(actual.temporary, 'data/workspace/state.sqlite'));
  } finally { await stop(owned.child, { env }); }
});
