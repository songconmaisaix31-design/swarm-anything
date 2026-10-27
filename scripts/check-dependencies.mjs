import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseAllDocuments } from 'yaml';
import { execFileSync } from 'node:child_process';
import { root, web, findGo } from './process.mjs';

const json = async path => JSON.parse(await readFile(path, 'utf8'));
const inventory = await json(join(root, 'dependencies.lock.json'));
const lockDocuments = parseAllDocuments(await readFile(join(root, 'pnpm-lock.yaml'), 'utf8'));
for (const document of lockDocuments) if (document.errors.length) throw document.errors[0];
const lock = Object.assign({}, ...lockDocuments.map(document => document.toJS()));
for (const [name, base, importer] of [['root', root, '.'], ['web', web, 'web'], ['swa_runtime', join(root, 'runtime', 'swa-orca'), 'runtime/swa-orca']]) {
  const pkg = await json(join(base, 'package.json'));
  const expected = inventory.direct_dependencies[name];
  const actual = { ...pkg.dependencies, ...pkg.devDependencies };
  if (JSON.stringify(Object.entries(actual).sort()) !== JSON.stringify(Object.entries(expected).sort())) {
    throw new Error(`${name} dependency inventory drift; update dependencies.lock.json`);
  }
  for (const [dependency, version] of Object.entries(actual)) {
    const workspace = name === 'swa_runtime' && version === 'workspace:*';
    if (!workspace && !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)) throw new Error(`${dependency} must use an exact version or the explicitly recorded local workspace`);
    const installed = await json(join(base, 'node_modules', dependency, 'package.json'));
    const entry = lock.importers[importer].dependencies?.[dependency] ?? lock.importers[importer].devDependencies?.[dependency];
    if ((!workspace && installed.version !== version) || entry?.specifier !== version) throw new Error(`${dependency} installed/lock version differs from ${version}; run pnpm install --frozen-lockfile`);
  }
}
const go = await findGo();
const goMod = JSON.parse(execFileSync(go, ['mod', 'edit', '-json'], { cwd: root, encoding: 'utf8', windowsHide: true }));
const direct = Object.fromEntries((goMod.Require ?? []).filter(module => !module.Indirect).map(module => [module.Path, module.Version]));
if (JSON.stringify(Object.entries(direct).sort()) !== JSON.stringify(Object.entries(inventory.direct_dependencies.go).sort())) {
  throw new Error('Go direct dependency inventory differs from parsed go.mod requirements');
}
for (const [name, version] of Object.entries(inventory.direct_dependencies.go)) {
  const module = JSON.parse(execFileSync(go, ['list', '-mod=readonly', '-m', '-json', name], { cwd: root, encoding: 'utf8', windowsHide: true }));
  if (module.Version !== version || module.Indirect || module.Replace) throw new Error(`${name} dependency inventory differs from Go module metadata`);
}
if (goMod.Go !== inventory.toolchain.go) throw new Error('Go toolchain inventory differs from parsed go.mod');
console.log('Exact dependency pins, installed versions and lock inventory agree');
