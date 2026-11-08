import { defineConfig } from '@playwright/test';
import { isAbsolute } from 'node:path';
import base from '../playwright.config';

const executablePath = process.env.ASTROCYTE_TEST_BROWSER_EXECUTABLE;
if (executablePath && !isAbsolute(executablePath)) throw new Error('显式浏览器路径必须是绝对路径');
export default defineConfig({ ...base, testDir: '.', testMatch: 'swa-workspace.spec.ts', workers: 1, retries: 0, webServer: undefined, use: { ...base.use, ...(executablePath ? { launchOptions: { executablePath } } : {}) } });
