import { join } from 'node:path';
import { root, requireFile, start, stop } from './process.mjs';

const filename = process.platform === 'win32' ? 'dist/swa-server.exe' : 'dist/swa-server';
await requireFile(filename);
const env = { ...process.env, SWA_DATA_DIR: process.env.SWA_DATA_DIR ?? join(root, '.verification', 'swa-local-data'), SWA_WEB_DIR: process.env.SWA_WEB_DIR ?? join(root, 'web', 'dist') };
for (const name of ['ASTROCYTE_DATA_DIR', 'ASTROCYTE_WEB_DIR']) delete env[name];
const child = start(join(root, filename), [], {
  detached: process.platform !== 'win32',
  env,
});
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (stopping) return;
  stopping = true;
  try { await stop(child); } catch (error) { console.error(error); process.exitCode = 1; }
});
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { if (!stopping) process.exitCode = code ?? 1; });
