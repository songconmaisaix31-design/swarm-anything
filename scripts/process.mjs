import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, open, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, isAbsolute, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const web = join(root, 'web');

export function verificationOutputRoot(choice = process.env.ASTROCYTE_TEST_OUTPUT_ROOT ?? join(root, '.verification')) {
  if (typeof choice !== 'string' || !isAbsolute(choice)) throw new Error('Verification outputRoot must be an explicit absolute directory');
  return choice;
}

export async function createCheckOutputDirectory(choice) {
  const parent = verificationOutputRoot(choice);
  await mkdir(parent, { recursive: true });
  return await mkdtemp(join(parent, 'check-'));
}

// 保留本次自有进程的完整双通道输出，退出后等待文件写入完成。
export async function launchLogged(command, args, options, directory, name) {
  const stdout = join(directory, `${name}.stdout.log`);
  const stderr = join(directory, `${name}.stderr.log`);
  const stdoutFile = await open(stdout, 'wx', 0o600);
  let stderrFile;
  try { stderrFile = await open(stderr, 'wx', 0o600); }
  catch (error) { await stdoutFile.close(); throw error; }
  const { ipc, ...spawnOptions } = options;
  const child = start(command, args, { ...spawnOptions, stdio: ['ignore', 'pipe', 'pipe', ...(ipc ? ['ipc'] : [])] });
  let spawnError;
  child.once('error', error => { spawnError = error; });
  const exited = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  const output = Promise.allSettled([
    pipeline(child.stdout, stdoutFile.createWriteStream()),
    pipeline(child.stderr, stderrFile.createWriteStream()),
  ]);
  return {
    child, log: { name, pid: child.pid ?? null, stdout, stderr },
    async drain() {
      const exit = await exited;
      const failures = (await output).filter(result => result.status === 'rejected').map(result => result.reason);
      if (spawnError) failures.unshift(spawnError);
      if (failures.length) throw new AggregateError(failures, `Owned ${name} output failed; retained ${directory}`);
      return exit;
    },
  };
}

// 原生 Go 使用 stdout 公告；自有 Vite 进程使用 IPC，均只接收实际监听地址。
export async function actualListeningURL(child, { type, field, label, expectedPort, ipc = false }) {
  return await new Promise((resolve, reject) => {
    const lines = ipc ? null : createInterface({ input: child.stdout, crlfDelay: Infinity });
    let settled = false;
    const timer = setTimeout(() => finish(new Error(`${label} listener announcement timed out`)), 30_000);
    const unavailable = reason => finish(new Error(`${label} listener announcement became unavailable`, { cause: new Error(reason) }));
    const onExit = () => unavailable('owned server exited before publishing its address');
    const onError = error => finish(error);
    const onClose = () => unavailable('owned stdout closed before listener announcement');
    const onMessage = record => {
      try {
        const url = new URL(record[field]);
        if (record.type !== type || Object.keys(record).length !== 2 || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || record[field] !== url.origin || !Number.isInteger(Number(url.port)) || Number(url.port) < 1 || Number(url.port) > 65535 || (expectedPort && Number(url.port) !== expectedPort)) throw new Error(`${label} listener announcement has an invalid or mismatched loopback address`);
        finish(undefined, url.origin);
      } catch (error) { finish(error); }
    };
    const onLine = line => {
      try { onMessage(JSON.parse(line)); }
      catch (error) { finish(error); }
    };
    const finish = (error, url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
      child.removeListener('message', onMessage);
      if (lines) {
        lines.removeListener('close', onClose);
        lines.close();
        child.stdout.resume();
      }
      if (error) reject(error); else resolve(url);
    };
    child.once('exit', onExit);
    child.once('error', onError);
    if (ipc) child.once('message', onMessage);
    else { lines.once('close', onClose); lines.on('line', onLine); }
    if (child.exitCode !== null || child.signalCode !== null) onExit();
  });
}

export async function findGo() {
  const windows = process.platform === 'win32';
  const fromPath = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
    .map(dir => join(dir.replace(/^"|"$/g, ''), windows ? 'go.exe' : 'go'));
  const installed = windows && process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Programs', 'go', 'bin', 'go.exe') : undefined;
  const candidates = process.env.ASTROCYTE_GO ? [process.env.ASTROCYTE_GO] : [...fromPath, installed].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate, windows ? constants.F_OK : constants.X_OK);
      return candidate;
    } catch (error) {
      if (process.env.ASTROCYTE_GO || error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Go not found. Install Go 1.27.2 or set ASTROCYTE_GO to its executable.');
}

export function start(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  return spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
}

export function wait(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Command failed (${code ?? signal})`)));
  });
}

export async function run(command, args, options) { await wait(start(command, args, options)); }
export async function runTool(name, args, options = {}) {
  const locations = {
    tsc: [web, 'typescript/bin/tsc'],
    eslint: [web, 'eslint/bin/eslint.js'],
    vitest: [web, 'vitest/vitest.mjs'],
    vite: [web, 'vite/bin/vite.js'],
    redocly: [root, '@redocly/cli/bin/cli.js'],
  };
  const [base, relative] = locations[name];
  await run(process.execPath, [join(base, 'node_modules', relative), ...args], { cwd: base, ...options });
}

export async function goFiles(dir = root) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['.git', '.verification', 'node_modules', 'dist'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await goFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.go')) files.push(path);
  }
  return files;
}

export async function checkGofmt(go, directories = [root]) {
  const files = [...new Set((await Promise.all(directories.map(directory => goFiles(isAbsolute(directory) ? directory : join(root, directory))))).flat())];
  if (!files.length) throw new Error('No Go files; W1 backend is pending');
  const executable = join(go, '..', process.platform === 'win32' ? 'gofmt.exe' : 'gofmt');
  // 分批检查全部 Go 文件，保持命令长度在 Windows 限制以内。
  for (let offset = 0; offset < files.length; offset += 40) {
    const batch = files.slice(offset, offset + 40).map(file => relative(root, file));
    const result = spawnSync(executable, ['-l', ...batch], { cwd: root, encoding: 'utf8', windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0 || result.stdout.trim()) throw new Error(`gofmt check failed:\n${result.stdout}${result.stderr}`);
  }
  console.log('gofmt: all Go files formatted');
}

// 只终止本次调用启动的子进程及其工具进程。
export async function stop(child, { env = process.env } = {}) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  // 先处理已排队的退出事件，再使用本次调用持有的子进程 PID。
  await new Promise(resolve => setImmediate(resolve));
  if (child.exitCode !== null || child.signalCode !== null) return;
  let onExit;
  const exited = new Promise(resolve => { onExit = resolve; child.once('exit', onExit); });
  let shutdownError;
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { encoding: 'utf8', windowsHide: true, env });
    if (result.status !== 0) shutdownError = new Error(`Child shutdown failed: ${result.stderr || result.stdout || result.error}`);
  } else {
    // POSIX 的长期子进程以进程组启动。
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  let timer;
  try {
    // 只有本次子进程退出事件能够确认终止，未确认退出仍返回失败。
    await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(shutdownError ?? new Error(`Child ${child.pid} did not exit`)), 5000); })]);
  } finally { clearTimeout(timer); child.removeListener('exit', onExit); }
}

export async function requireFile(relative) {
  await readFile(join(root, relative));
}
