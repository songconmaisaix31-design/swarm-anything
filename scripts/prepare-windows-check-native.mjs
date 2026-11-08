import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32' || process.arch !== 'x64' || process.version !== 'v24.16.0') {
  throw new Error('Windows native checks require win32/x64 and Node 24.16.0');
}

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const runtimePackage = join(root, 'runtime', 'swa-orca', 'package.json');
const runtimeRequire = createRequire(runtimePackage);
const pythonInput = process.env.SWA_CHECK_PYTHON;
if (!pythonInput || !isAbsolute(pythonInput)) {
  throw new Error('SWA_CHECK_PYTHON must explicitly select the setup-python absolute executable');
}
const python = realpathSync(pythonInput);
if (!lstatSync(python).isFile()) throw new Error('Python executable is not a regular file');
const pythonVersion = spawnSync(python, ['--version'], { encoding: 'utf8', windowsHide: true });
if (pythonVersion.error) throw pythonVersion.error;
if (pythonVersion.status !== 0 || !/^Python 3\.13\.\d+\s*$/.test(pythonVersion.stdout)) {
  throw new Error('The selected Python must report version 3.13');
}

const gypPackage = runtimeRequire.resolve('node-gyp/package.json');
const gypMetadata = JSON.parse(readFileSync(gypPackage, 'utf8'));
if (gypMetadata.version !== '12.3.0') throw new Error('Locked node-gyp 12.3.0 is required');
const gyp = realpathSync(runtimeRequire.resolve('node-gyp/bin/node-gyp.js'));
const expectedGyp = join(realpathSync(join(gypPackage, '..')), 'bin', 'node-gyp.js');
if (gyp !== expectedGyp) throw new Error('node-gyp executable does not belong to its resolved package');
const gypLibrary = realpathSync(runtimeRequire.resolve('node-gyp/lib/node-gyp.js'));
if (gypLibrary !== join(realpathSync(join(gypPackage, '..')), 'lib', 'node-gyp.js')) {
  throw new Error('node-gyp option parser does not belong to its resolved package');
}

const verification = join(root, '.verification');
mkdirSync(verification, { recursive: true });
if (!lstatSync(verification).isDirectory() || lstatSync(verification).isSymbolicLink() || realpathSync(verification) !== verification) {
  throw new Error('Native check output root must be a plain repository directory');
}
const work = join(verification, `windows-check-native-${randomUUID()}`);
mkdirSync(work);
const temporary = join(work, 'temp');
mkdirSync(temporary);
const buildEnv = { ...process.env };
for (const key of Object.keys(buildEnv)) {
  if (/^(?:CL|_CL_|NODE_GYP_FORCE_PYTHON)$/i.test(key) || /^npm_config_/i.test(key) || /^npm_package_config_node_gyp_/i.test(key)) delete buildEnv[key];
}
buildEnv.CL = '/utf-8';
buildEnv.NODE_GYP_FORCE_PYTHON = python;
buildEnv.TEMP = temporary;
buildEnv.TMP = temporary;
buildEnv.TMPDIR = temporary;

for (const [name, binaryName] of [
  ['windows-security', 'orca_windows_security.node'],
  ['windows-registry', 'orca_windows_registry.node'],
]) {
  const source = join(root, 'third_party', 'orca-v1.4.230', 'native', name);
  if (!lstatSync(source).isDirectory() || lstatSync(source).isSymbolicLink() || realpathSync(source) !== source) {
    throw new Error(`Native source directory is not the exact repository package: ${name}`);
  }
  const packageName = `@orca/${name}`;
  const packageFile = realpathSync(runtimeRequire.resolve(`${packageName}/package.json`));
  const indexFile = realpathSync(runtimeRequire.resolve(packageName));
  if (packageFile !== join(source, 'package.json') || indexFile !== join(source, 'index.js')) {
    throw new Error(`Runtime resolves ${packageName} outside the repository source`);
  }
  const metadata = JSON.parse(readFileSync(packageFile, 'utf8'));
  if (metadata.name !== packageName || metadata.version !== '1.0.0') {
    throw new Error(`Unexpected native workspace package identity: ${name}`);
  }
  const packageRequire = createRequire(packageFile);
  const addonFile = packageRequire.resolve('node-addon-api/package.json');
  const addon = JSON.parse(readFileSync(addonFile, 'utf8'));
  if (addon.version !== '8.9.2') throw new Error(`Locked node-addon-api 8.9.2 is required for ${name}`);
  console.log(JSON.stringify({ check: 'windows-native-build', package: packageName, node: process.version, python: pythonVersion.stdout.trim(), node_gyp: gypMetadata.version, node_addon_api: addon.version, source }));
  const devdir = join(work, name);
  mkdirSync(devdir);
  const buildArgs = [gyp, 'rebuild', '--target=24.16.0', '--arch=x64', '--msvs-version=2026', `--python=${python}`, `--devdir=${devdir}`];
  const probe = spawnSync(process.execPath, ['-e', 'const [library,...args]=process.argv.slice(1);const gyp=require(library)();gyp.parseArgv([process.execPath,...args]);console.log(JSON.stringify({target:gyp.opts.target,arch:gyp.opts.arch,msvs_version:gyp.opts["msvs-version"],python:gyp.opts.python,devdir:gyp.opts.devdir,nodedir:gyp.opts.nodedir??null,dist_url:gyp.opts["dist-url"]??null}))', gypLibrary, ...buildArgs], {
    cwd: source,
    env: buildEnv,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30_000,
  });
  if (probe.error) throw probe.error;
  if (probe.status !== 0) throw new Error(`${packageName} effective node-gyp option probe failed`);
  const effectiveGyp = JSON.parse(probe.stdout);
  if (effectiveGyp.target !== '24.16.0' || effectiveGyp.arch !== 'x64' || effectiveGyp.msvs_version !== '2026' || effectiveGyp.python !== python || effectiveGyp.devdir !== devdir || effectiveGyp.nodedir !== null || effectiveGyp.dist_url !== null) {
    throw new Error(`${packageName} effective node-gyp options differ from the fixed build inputs`);
  }
  console.log(JSON.stringify({ check: 'windows-native-effective-options', package: packageName, ...effectiveGyp }));
  const build = spawnSync(process.execPath, buildArgs, {
    cwd: source,
    env: buildEnv,
    stdio: 'inherit',
    windowsHide: true,
    timeout: 10 * 60_000,
  });
  if (build.error) throw build.error;
  if (build.status !== 0) throw new Error(`${packageName} native compilation failed (${build.status ?? build.signal})`);
  const binary = join(source, 'build', 'Release', binaryName);
  const info = lstatSync(binary);
  if (!info.isFile() || info.isSymbolicLink() || realpathSync(binary) !== binary) {
    throw new Error(`${packageName} binary must be a plain file in its own source package`);
  }
  if (realpathSync(runtimeRequire.resolve(`${packageName}/package.json`)) !== packageFile || realpathSync(runtimeRequire.resolve(packageName)) !== indexFile || realpathSync(packageRequire.resolve('node-addon-api/package.json')) !== realpathSync(addonFile)) {
    throw new Error(`${packageName} runtime resolver changed during compilation`);
  }
  const digest = createHash('sha256').update(readFileSync(binary)).digest('hex');
  console.log(JSON.stringify({ check: 'windows-native-built', package: packageName, binary, sha256: digest, bytes: info.size }));
}
