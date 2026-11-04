import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { findGo, root, run, runTool, requireFile } from './process.mjs';

await requireFile('cmd/server/main.go');
await requireFile('cmd/mcp/main.go');
await requireFile('cmd/sleep/main.go');
await requireFile('web/index.html');
await mkdir(join(root, 'dist'), { recursive: true });
await run(await findGo(), ['build', '-mod=readonly', '-trimpath', '-o', join(root, 'dist', process.platform === 'win32' ? 'astrocyte.exe' : 'astrocyte'), './cmd/server']);
await run(await findGo(), ['build', '-mod=readonly', '-trimpath', '-o', join(root, 'dist', process.platform === 'win32' ? 'astrocyte-mcp.exe' : 'astrocyte-mcp'), './cmd/mcp']);
await run(await findGo(), ['build', '-mod=readonly', '-trimpath', '-o', join(root, 'dist', process.platform === 'win32' ? 'astrocyte-sleep.exe' : 'astrocyte-sleep'), './cmd/sleep']);
await run(await findGo(), ['build', '-mod=readonly', '-trimpath', '-o', join(root, 'dist', process.platform === 'win32' ? 'swarm.exe' : 'swarm'), './cmd/swarm']);
await runTool('tsc', ['-b']);
await runTool('vite', ['build']);
