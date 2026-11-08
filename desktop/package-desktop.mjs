import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';

const executable = process.platform === 'win32' ? 'swarm.exe' : 'swarm';
const cli = fileURLToPath(new URL(`../dist/${executable}`, import.meta.url));
try {
  await access(cli, constants.X_OK);
} catch {
  throw new Error(`请先构建本机的 Swarm CLI 到 ${cli}`);
}

const paths = await packager({
  dir: fileURLToPath(new URL('.', import.meta.url)),
  out: fileURLToPath(new URL('./dist', import.meta.url)),
  name: 'Swarm',
  overwrite: true,
  asar: true,
  ignore: [/^\/(?:dist|\.verification)(?:\/|$)/, /^\/package-desktop\.mjs$/],
  extraResource: [cli, fileURLToPath(new URL('../LICENSE', import.meta.url))],
});
console.log(paths.join('\n'));
