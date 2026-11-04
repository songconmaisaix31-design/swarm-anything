import { findGo, checkGofmt, createCheckOutputDirectory, run, runTool, root } from './process.mjs';

process.env.ASTROCYTE_TEST_OUTPUT_ROOT = await createCheckOutputDirectory();
console.log(`Verification output: ${process.env.ASTROCYTE_TEST_OUTPUT_ROOT}`);

const go = await findGo();
await checkGofmt(go);
await run(go, ['vet', '-mod=readonly', './...']);
await run(go, ['test', '-mod=readonly', './...']);
await run(go, ['mod', 'verify']);
await run(process.execPath, ['scripts/check-dependencies.mjs']);
await run(process.execPath, ['scripts/check-architecture.mjs']);
await run(process.execPath, ['--test', 'scripts/stop-process.test.mjs']);
await runTool('redocly', ['lint', 'contracts/openapi.yaml', '--config', 'contracts/redocly.yaml'], { cwd: root });
await run(process.execPath, ['scripts/validate-examples.mjs']);
await run(process.execPath, ['scripts/validate-cards.mjs']);
await run(process.execPath, ['scripts/generate-client.mjs', '--check']);
await run(process.execPath, ['--test', 'tests/s1/acceptance.test.mjs']);
await runTool('tsc', ['-b']);
await runTool('eslint', ['.']);
await runTool('vitest', ['run']);
await run('git', ['diff', '--check']);
