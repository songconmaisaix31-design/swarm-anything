import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';

const execute = promisify(execFile);
const page = new URL('./index.html', import.meta.url);
const preload = fileURLToPath(new URL('./preload.cjs', import.meta.url));
const executable = process.platform === 'win32' ? 'swarm.exe' : 'swarm';
const builtCLI = fileURLToPath(new URL(`../dist/${executable}`, import.meta.url));

let window;
let projectPath;

async function callSwarm(args, timeout = 30000) {
  const cli = app.isPackaged ? join(process.resourcesPath, executable) : process.env.SWA_CLI_PATH || builtCLI;
  if (!isAbsolute(cli)) throw new Error('SWA_CLI_PATH 必须指向绝对路径。');
  try {
    await access(cli);
  } catch {
    throw new Error(`找不到 Swarm CLI。请先构建引擎：${cli}`);
  }
  let stdout;
  try {
    ({ stdout } = await execute(cli, args, { shell: false, windowsHide: true, timeout, maxBuffer: 512 * 1024 }));
  } catch (error) {
    let detail;
    try {
      detail = JSON.parse(error.stderr).error;
    } catch {
      detail = undefined;
    }
    if (detail?.message) throw new Error([detail.message, detail.required_action].filter(Boolean).join(' '));
    if (error.killed) throw new Error('Swarm CLI 请求超时。');
    throw new Error('Swarm CLI 执行失败。请在终端运行同一命令查看诊断。');
  }
  const result = JSON.parse(stdout);
  if (result?.schema_version !== 1) throw new Error('桌面端与 Swarm CLI 的协议版本不匹配。');
  return result;
}

function handle(channel, action) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== window?.webContents || event.senderFrame?.url !== page.href ||
        event.senderFrame !== event.sender.mainFrame) {
      throw new Error('此窗口无权调用 Swarm CLI。');
    }
    try {
      return { ok: true, result: await action(...args) };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  });
}

function createWindow() {
  projectPath = undefined;
  window = new BrowserWindow({
    title: 'Swarm Anything',
    width: 1040,
    height: 760,
    minWidth: 680,
    minHeight: 540,
    backgroundColor: '#101513',
    autoHideMenuBar: true,
    webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-frame-navigate', (event) => event.preventDefault());
  window.on('closed', () => {
    window = undefined;
    projectPath = undefined;
  });
  window.loadURL(page.href);
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));

  handle('swarm:list', (probe) => {
    if (typeof probe !== 'boolean') throw new Error('无效的扫描选项。');
    return callSwarm(['agents', 'list', ...(probe ? ['--probe'] : []), '--json']);
  });
  handle('swarm:choose-project', async () => {
    const owner = window;
    const result = await dialog.showOpenDialog(owner, { properties: ['openDirectory'] });
    if (result.canceled || window !== owner) return null;
    const chosen = result.filePaths[0];
    if (!chosen || !isAbsolute(chosen)) throw new Error('请选择有效的项目目录。');
    projectPath = chosen;
    return projectPath;
  });
  handle('swarm:connect', (id) => {
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) throw new Error('无效的 Agent ID。');
    if (!projectPath) throw new Error('请先选择项目目录。');
    return callSwarm(['agents', 'connect', id, '--project', projectPath, '--json']);
  });
  handle('swarm:diagnose-tabbit', () => callSwarm(['agents', 'diagnose', 'tabbit', '--json']));
  handle('swarm:verify', async (id) => {
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(id) || id === 'workbuddy') throw new Error('此 Agent 不支持桌面验收。');
    const owner = window;
    if (id === 'tabbit') {
      const decision = await dialog.showMessageBox(owner, {
        type: 'question', title: 'Tabbit 浏览器验收', message: '在 Tabbit 中打开官方公开演练页？',
        detail: '验收会新建一个标签页，检查网页结果和原请求回执，结束后清理本次标签页。',
        buttons: ['取消', '开始验收'], defaultId: 0, cancelId: 0,
      });
      return window === owner && decision.response === 1 ? callSwarm(['agents', 'verify', 'tabbit', '--json'], 100000) : null;
    }
    const result = await dialog.showOpenDialog(owner, { title: '选择仓库外的空白会话测试父目录', properties: ['openDirectory'] });
    const scratch = result.filePaths[0];
    if (result.canceled || window !== owner || !scratch || !isAbsolute(scratch)) return null;
    return callSwarm(['agents', 'verify', id, '--scratch', scratch, '--reload', '--json'], 40000);
  });

  createWindow();
  app.on('activate', () => {
    if (!window) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
