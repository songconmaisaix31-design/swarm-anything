import { defineConfig, devices } from '@playwright/test';
import { isAbsolute } from 'node:path';

const executablePath = process.env.ASTROCYTE_TEST_BROWSER_EXECUTABLE;
if (executablePath && !isAbsolute(executablePath)) throw new Error('显式浏览器路径必须是绝对路径');
// 每个用例通过真实服务夹具管理独立服务、端口与数据库。
export default defineConfig({
  testDir: '.',
  testMatch: 'swa-workspace.spec.ts',
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: true },
    screenshot: 'off',
    video: 'off',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    { name: 'chromium-1920', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    { name: 'chromium-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
  ],
});
