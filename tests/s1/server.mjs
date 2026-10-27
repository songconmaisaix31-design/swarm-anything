import { copyFile, lstat, mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { actualListeningURL, findGo, launchLogged, root, stop, verificationOutputRoot, web } from '../../scripts/process.mjs';

const compiledServers = new Map();

// 同一验证进程使用同一次真实构建，所有服务仍有独立可执行文件与数据目录。
async function buildServer(verification, env, product) {
  const key = `${verification}:${product}`;
  if (!compiledServers.has(key)) compiledServers.set(key, (async () => {
    const directory = await mkdtemp(join(verification, 'astrocyte-s1-build-'));
    const executable = join(directory, process.platform === 'win32' ? 'server.exe' : 'server');
    const entry = product === 'swa' ? './cmd/swa-server' : './cmd/server';
    const build = await launchLogged(await findGo(), ['build', '-mod=readonly', '-o', executable, entry], { cwd: root, env }, directory, 'build');
    const { code, signal } = await build.drain();
    if (code !== 0) throw new Error(`Actual Go build failed (${code ?? signal}); stdout=${build.log.stdout}; stderr=${build.log.stderr}`);
    return executable;
  })());
  return await compiledServers.get(key);
}

function validatePort(requested, allowZero = false) {
  if (allowZero && requested === 0) return;
  if (requested !== undefined && (!Number.isInteger(requested) || requested < 1 || requested > 65535 || [5173, 8787].includes(requested))) {
    throw new Error('Acceptance port must be an integer from 1 to 65535, separate from personal 5173/8787');
  }
}

async function ready(url, child) {
  const started = Date.now();
  let requestStarted;
  let phase = 'before_request';
  let status;
  const failure = (message, cause) => {
    const readiness = { url, pid: child.pid ?? null, exit_code: child.exitCode, signal_code: child.signalCode,
      phase, http_status: status ?? null, started_at: new Date(started).toISOString(), elapsed_ms: Date.now() - started,
      request_started_at: requestStarted === undefined ? null : new Date(requestStarted).toISOString(), request_elapsed_ms: requestStarted === undefined ? null : Date.now() - requestStarted };
    const error = new Error(`${message}: ${url}; readiness=${JSON.stringify(readiness)}`, { cause });
    error.readiness = readiness;
    return error;
  };
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw failure('Owned server exited before readiness');
    let response;
    try {
      requestStarted = Date.now();
      phase = 'response_headers';
      status = undefined;
      response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      phase = 'response_body';
      status = response.status;
      // 完整消费本次就绪响应，归还实际 HTTP 连接。
      await response.arrayBuffer();
      phase = 'response_complete';
    } catch (error) {
      if (error.cause?.code !== 'ECONNREFUSED') throw failure('Actual readiness GET failed', error);
    }
    if (response) {
      if (!response.ok) throw failure(`Actual readiness GET returned ${response.status}`);
      if (child.exitCode !== null || child.signalCode !== null) throw failure('Owned server exited during readiness');
      return;
    }
    await delay(100);
  }
  throw failure('Actual readiness GET timed out');
}

function inside(path, directory) {
  const rel = relative(directory, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

async function existingOwnedTemporary(choice, relay, verification) {
  // 调用者必须明确原 helper 目录及协调者授权的根目录。
  if (!choice || typeof choice.path !== 'string' || typeof choice.ownedRoot !== 'string' || !isAbsolute(choice.path) || !isAbsolute(choice.ownedRoot)) throw new Error('Reuse requires explicit absolute original path and approved ownedRoot');
  const approved = await realpath(choice.ownedRoot);
  const chosen = await realpath(choice.path);
  if (!inside(approved, verification) || approved === verification || !inside(chosen, approved)) throw new Error('Original helper directory must stay within the explicit verification directory and its approved root');
  const data = relay ? join(chosen, 'local-appdata', 'astrocyte-workbench', 'v0.2-access', 'app-state') : join(chosen, 'data');
  for (const [path, directory] of [[chosen, true], [data, true], [join(data, 'state.sqlite'), false], [join(data, 'objects'), true], [join(chosen, process.platform === 'win32' ? 'server.exe' : 'server'), false]]) {
    const info = await lstat(path);
    if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()) || !inside(await realpath(path), approved)) throw new Error('Original helper store must be an existing ordinary SQLite/objects directory within its approved root');
  }
  return { temporary: chosen, ownedRoot: approved };
}

/** 使用现有 Go 服务及可选 Vite，数据与完整日志保留在明确的验证目录。 */
export async function startS1Server({ browser = false, relay = false, product = 'legacy', env: extraEnv = {}, outputRoot = verificationOutputRoot(), reuseOwnedTemporary, apiPort: requestedAPIPort, webPort: requestedWebPort } = {}) {
  if (!['legacy', 'swa'].includes(product) || product === 'swa' && (relay || reuseOwnedTemporary)) throw new Error('SWA 验证使用明确产品与独立的新数据根');
  if (typeof relay !== 'boolean') throw new Error('relay must be an explicit boolean');
  if (!browser && requestedWebPort !== undefined) throw new Error('A web acceptance port requires browser:true');
  // API 由同一 Go listener 原子绑定；显式错误配置在创建数据之前失败。
  validatePort(requestedAPIPort, true);
  validatePort(requestedWebPort, true);
  if (browser && requestedAPIPort && requestedAPIPort === requestedWebPort) throw new Error('API and Vite acceptance ports must differ');
  verificationOutputRoot(outputRoot);
  await mkdir(outputRoot, { recursive: true });
  const verification = await realpath(outputRoot);
  const original = reuseOwnedTemporary ? await existingOwnedTemporary(reuseOwnedTemporary, relay, verification) : null;
  const temporary = original?.temporary ?? await mkdtemp(join(verification, 'astrocyte-s1-'));
  const logsDirectory = await mkdtemp(join(temporary, 'process-logs-'));
  const localAppData = relay ? join(temporary, 'local-appdata') : undefined;
  const relayRoot = relay ? join(localAppData, 'astrocyte-workbench', 'v0.2-access') : undefined;
  const privateRoot = join(temporary, 'data');
  const dataDir = product === 'swa' ? join(privateRoot, 'workspace') : relay ? join(relayRoot, 'app-state') : privateRoot;
  if (relay) await mkdir(relayRoot, { recursive: true });
  const toolTemporary = join(temporary, 'tool-temp');
  await mkdir(toolTemporary, { recursive: true });
  const executable = join(temporary, process.platform === 'win32' ? 'server.exe' : 'server');
  let apiURL;
  let browserURL;
  const suppliedEnv = typeof extraEnv === 'function' ? await extraEnv({ dataDir, temporary }) : extraEnv;
  // 仅接收本次明确传入的产品配置，防止继承私人源范围或模型授权。
  const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('ASTROCYTE_') && (product !== 'swa' || !name.toUpperCase().startsWith('SWA_'))));
  const env = { ...baseEnv, ASTROCYTE_ENABLE_CODEX_DISTILLATION: 'false', ASTROCYTE_ENABLE_SUMMARIZE: 'false', ASTROCYTE_SUMMARIZE_CLI: '', ASTROCYTE_PROJECT_DISCOVERY_ROOTS: JSON.stringify([root]), ...suppliedEnv,
    ...(relay ? { LOCALAPPDATA: localAppData, APPDATA: join(temporary, 'appdata'), HOME: join(temporary, 'profile'), USERPROFILE: join(temporary, 'profile'), ASTROCYTE_RELAY: '1', ASTROCYTE_RELAY_LIVE_SECONDS: '' } : {}),
    TEMP: toolTemporary, TMP: toolTemporary, GOTMPDIR: toolTemporary,
    GOCACHE: process.env.GOCACHE ?? join(verification, 'go-cache'),
    ASTROCYTE_TEST_OUTPUT_ROOT: verification, ASTROCYTE_TEST_VITE_CACHE: join(temporary, 'vite-cache'),
    ASTROCYTE_DATA_DIR: dataDir, ASTROCYTE_PORT: String(requestedAPIPort ?? 0), ASTROCYTE_WEB_PORT: String(requestedWebPort || 5173) };
  if (product === 'swa') { env.SWA_DATA_DIR = privateRoot; env.SWA_PORT = env.ASTROCYTE_PORT; }
  await mkdir(env.GOCACHE, { recursive: true });
  let apiChild;
  let webChild;
  const processes = [];
  let apiStarts = 0;
  let disposed = false;

  async function startAPI() {
    if (disposed) throw new Error('S1 server has been closed');
    if (apiChild && apiChild.exitCode === null && apiChild.signalCode === null) throw new Error('Owned API process is still running');
    const owned = await launchLogged(executable, [], { env, detached: process.platform !== 'win32' }, logsDirectory, `api-${++apiStarts}`);
    processes.push(owned);
    apiChild = owned.child;
    apiURL = await actualListeningURL(apiChild, { type: 'http_listening', field: 'api_url', label: 'Actual Go', expectedPort: Number(env.ASTROCYTE_PORT) });
    // 后续明确的重启继续绑定原实际端口，Vite 使用同一准确地址。
    env.ASTROCYTE_PORT = new URL(apiURL).port;
    if (product === 'swa') env.SWA_PORT = env.ASTROCYTE_PORT;
    await ready(`${apiURL}/api/v1/health`, apiChild);
  }
  async function close({ primaryError } = {}) {
    if (disposed) return;
    try {
      // 仅停止本次创建的子进程，已退出的进程由 stop 确认。
      const results = await Promise.allSettled([webChild, apiChild].filter(Boolean).map(child => stop(child, { env })));
      const failures = results.filter(result => result.status === 'rejected');
      if (failures.length) throw new AggregateError(failures.map(result => result.reason), `S1 server cleanup failed; retained ${temporary}`);
      const output = await Promise.allSettled(processes.map(owned => owned.drain()));
      const outputFailures = output.filter(result => result.status === 'rejected');
      if (outputFailures.length) throw new AggregateError(outputFailures.map(result => result.reason), `S1 process output failed; retained ${temporary}`);
      console.log(`S1 verification data retained: ${temporary}`);
      disposed = true;
    } catch (cleanupError) {
      if (primaryError === undefined) throw cleanupError;
      // 调用者将抛出首个错误；清理失败另行保留并报告。
      console.error('S1 cleanup failed; original error retained and data preserved:', cleanupError);
      if (primaryError !== null && (typeof primaryError === 'object' || typeof primaryError === 'function')) {
        if (Object.isExtensible(primaryError)) Object.defineProperty(primaryError, 'cleanupError', { value: cleanupError, configurable: true });
      }
    }
  }
  try {
    await copyFile(await buildServer(verification, env, product), executable);
    if (browser) {
      const owned = await launchLogged(process.execPath, [join(root, 'scripts/vite-server.mjs')], { cwd: web, env: { ...env, ASTROCYTE_WEB_PORT: String(requestedWebPort ?? 0) }, ipc: true, detached: process.platform !== 'win32' }, logsDirectory, 'vite');
      processes.push(owned);
      webChild = owned.child;
      browserURL = await actualListeningURL(webChild, { type: 'vite_listening', field: 'web_url', label: 'Actual Vite', expectedPort: requestedWebPort, ipc: true });
      env.ASTROCYTE_WEB_PORT = new URL(browserURL).port;
      if (product === 'swa') env.SWA_ALLOWED_ORIGIN = browserURL;
    }
    await startAPI();
    if (browser) {
      const initialized = actualListeningURL(webChild, { type: 'vite_ready', field: 'web_url', label: 'Actual Vite', expectedPort: Number(env.ASTROCYTE_WEB_PORT), ipc: true });
      webChild.send({ api_url: apiURL });
      await initialized;
      await ready(browserURL, webChild);
    }
  } catch (error) {
    let failure = error;
    try {
      const causes = [];
      for (let cause = error; cause; cause = cause.cause) causes.push({ name: cause.name, message: cause.message, stack: cause.stack, code: cause.code ?? null });
      await writeFile(join(logsDirectory, 'startup-failure.json'), JSON.stringify({ readiness: error.readiness ?? null, causes, logs: processes.map(owned => owned.log) }, null, 2), { flag: 'wx', mode: 0o600 });
    } catch (writeError) {
      failure = new AggregateError([error, writeError], `Startup failure could not be retained in ${temporary}`, { cause: error });
    }
    await close({ primaryError: failure });
    Object.defineProperties(failure, { verificationDirectory: { value: temporary }, logsDirectory: { value: logsDirectory } });
    throw failure;
  }
  return {
    get apiURL() { return apiURL; },
    get webURL() { return browserURL ?? apiURL; },
    dataDir, temporary, localAppData, relayRoot, close, logsDirectory,
    get processLogs() { return processes.map(owned => ({ ...owned.log })); },
    startAPI,
    async stopAPI() { await stop(apiChild, { env }); },
    // 通过本次实际服务进程的退出和新进程启动验证持久化恢复。
    async restart() { await stop(apiChild, { env }); await startAPI(); },
    query(sql, ...parameters) {
      const database = new DatabaseSync(join(dataDir, 'state.sqlite'), { readOnly: true });
      try { return database.prepare(sql).all(...parameters); }
      finally { database.close(); }
    },
  };
}
