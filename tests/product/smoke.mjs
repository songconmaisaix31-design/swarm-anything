import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { actualListeningURL, launchLogged, root, stop } from '../../scripts/process.mjs';

const windows = process.platform === 'win32';
const executable = name => join(root, 'dist', name + (windows ? '.exe' : ''));

async function json(origin, path, status, options = {}) {
  const response = await fetch(`${origin}/api/v1${path}`, { ...options, signal: AbortSignal.timeout(5000), redirect: 'error' });
  assert.equal(response.status, status, `${options.method ?? 'GET'} ${path}`);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/);
  return { body: await response.json(), response };
}

async function human(origin) {
  const { body, response } = await json(origin, '/auth/session', 200);
  assert.equal(body.actor_kind, 'human');
  const cookie = response.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ');
  assert.ok(cookie && body.csrf_token, 'fresh loopback session');
  return {
    get: (path, status = 200) => json(origin, path, status, { headers: { Cookie: cookie } }),
    write(path, value, status = 200, { command = true, csrf = true } = {}) {
      const id = randomUUID();
      return json(origin, path, status, {
        method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', 'Idempotency-Key': id, ...(csrf ? { 'X-CSRF-Token': body.csrf_token } : {}) },
        body: JSON.stringify(command ? { schema_version: 1, expected_version: 1, request_id: id, ...value } : value),
      });
    },
  };
}

test('built product serves the workbench and keeps account-free project state across restart', { timeout: 90_000 }, async t => {
  const parent = join(await realpath(root), '.verification');
  await mkdir(parent, { recursive: true, mode: 0o700 });
  assert.equal(await realpath(parent), parent);
  const directory = await mkdtemp(join(parent, 'product-smoke-'));
  t.diagnostic(`Own process logs: ${directory}`);
  const data = join(directory, 'state'), projectRoot = join(directory, 'project'), home = join(directory, 'home'), emptyPath = join(directory, 'empty-path');
  await Promise.all([data, projectRoot, home, emptyPath].map(path => mkdir(path, { mode: 0o700 })));
  const web = await realpath(join(root, 'web', 'dist'));
  const expectedHTML = await readFile(join(web, 'index.html'), 'utf8');
  assert.match(expectedHTML, /<title>SWA · 任务与交付<\/title>/);
  const script = expectedHTML.match(/<script\b[^>]+src="(\/assets\/[A-Za-z0-9._-]+\.js)"/)?.[1];
  assert.ok(script, 'production Web entry references a built JavaScript asset');
  const hostEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(PATH|PATHEXT|SystemRoot|WINDIR|COMSPEC|SYSTEMDRIVE|TEMP|TMP|TMPDIR|LANG|LC_ALL)$/i.test(name)));
  const env = { ...hostEnv, HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home, XDG_CONFIG_HOME: home };
  const cliEnv = Object.fromEntries(Object.entries(env).filter(([name]) => name.toUpperCase() !== 'PATH'));
  cliEnv.PATH = emptyPath; // 不从开发机发现已安装的供应商或读取账号；不使用 --probe。
  const catalog = JSON.parse(execFileSync(executable('swarm'), ['agents', 'list', '--json'], { env: cliEnv, encoding: 'utf8', timeout: 10000 }));
  assert.equal(catalog.schema_version, 1);
  assert.ok(catalog.items.some(item => item.id === 'qoder' && item.adapter === 'acp' && item.installed.status === 'unavailable'));
  assert.ok(catalog.items.some(item => item.id === 'tabbit' && item.adapter === 'browser-cli' && item.startable.status === 'unknown'));
  assert.notEqual(execFileSync(executable('swa'), ['--version'], { env: cliEnv, encoding: 'utf8', timeout: 10000 }).trim(), '');

  let active;
  async function startServer(name) {
    active = await launchLogged(executable('swa-server'), [], { env: { ...env, SWA_DATA_DIR: data, SWA_WEB_DIR: web, SWA_PORT: '0' }, detached: !windows }, directory, name);
    return actualListeningURL(active.child, { type: 'http_listening', field: 'api_url', label: 'Built SWA' });
  }
  async function stopServer() {
    if (!active) return;
    await stop(active.child, { env: hostEnv });
    const exit = await active.drain();
    if (!windows) assert.deepEqual(exit, { code: 0, signal: null });
    active = undefined;
  }
  try {
    const origin = await startServer('server-first');
    assert.equal((await json(origin, '/health', 200)).body.service, 'astrocyte');
    for (const path of ['/swarm', '/workspace']) {
      const page = await fetch(origin + path, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      assert.equal(page.status, 200);
      assert.equal(await page.text(), expectedHTML);
    }
    const asset = await fetch(origin + script, { signal: AbortSignal.timeout(5000), redirect: 'error' });
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type') ?? '', /javascript/);
    assert.ok((await asset.arrayBuffer()).byteLength > 0);
    await json(origin, '/local-projects', 403);
    const first = await human(origin);
    assert.deepEqual((await first.get('/local-projects')).body.items, []);
    await first.get('/materials', 404);
    await first.write('/project-spaces', { title: 'Product smoke' }, 403, { csrf: false });
    const { space } = (await first.write('/project-spaces', { title: 'Product smoke' }, 201)).body;
    const { project } = (await first.write('/local-projects', { root: projectRoot, name: 'Owned local fixture', space_id: space.id })).body;
    const path = `/local-projects/${encodeURIComponent(project.id)}`;
    const missingRuntime = await first.write(`${path}/orca/commands`, { action: 'status' }, 503, { command: false });
    assert.equal(missingRuntime.body.error.code, 'provider_unavailable');
    await first.write(`${path}/grants`, { agent_id: 'product-smoke', actions: ['observe'] });
    const { credential } = (await first.write(`${path}/agent-token`, { agent_id: 'product-smoke' })).body;
    assert.ok(credential.token);
    const result = spawnSync(executable('swa'), ['status', '--project', project.id, '--endpoint', origin, '--json'], {
      env: { ...cliEnv, SWA_PROJECT_TOKEN: credential.token }, encoding: 'utf8', timeout: 10000,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 4);
    assert.equal(JSON.parse(result.stdout).error.code, 'provider_unavailable');
    await first.write(`${path}/grants/revoke`, { agent_id: 'product-smoke' });
    await json(origin, `${path}/orca/commands`, 403, {
      method: 'POST', headers: { Authorization: `Bearer ${credential.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status' }),
    });
    await stopServer();
    await assert.rejects(fetch(`${origin}/api/v1/health`, { signal: AbortSignal.timeout(1500) }));

    const restarted = await human(await startServer('server-restart'));
    const items = (await restarted.get('/local-projects')).body.items;
    assert.deepEqual(items.map(item => item.id), [project.id]);
    const [persisted] = items;
    assert.equal(persisted.name, project.name);
    assert.equal(persisted.root, project.root);
    const store = new DatabaseSync(join(data, 'workspace', 'state.sqlite'), { readOnly: true });
    try {
      assert.equal(store.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      for (const table of ['local_agent_sessions', 'orca_execution_links']) assert.equal(store.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0);
    } finally { store.close(); }
  } finally { await stopServer(); }
});
