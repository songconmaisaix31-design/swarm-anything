import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { findGo, root, run, runTool, requireFile } from './process.mjs';

await requireFile('cmd/swa-server/main.go');
await requireFile('cmd/swa/main.go');
await requireFile('web/index.html');
await mkdir(join(root, 'dist'), { recursive: true });
await run(await findGo(), ['build', '-mod=readonly', '-trimpath', '-o', join(root, 'dist', process.platform === 'win32' ? 'swa-server.exe' : 'swa-server'), './cmd/swa-server']);
await run(await findGo(), ['build', '-mod=readonly', '-trimpath', '-o', join(root, 'dist', process.platform === 'win32' ? 'swa.exe' : 'swa'), './cmd/swa']);
await runTool('tsc', ['-b']);
await runTool('vite', ['build', '--manifest']);
