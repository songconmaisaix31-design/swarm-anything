import { root, run, runTool } from './process.mjs';

await runTool('redocly', ['lint', 'contracts/openapi.yaml', '--config', 'contracts/redocly.yaml'], { cwd: root });
await run(process.execPath, ['scripts/validate-examples.mjs']);
await run(process.execPath, ['scripts/validate-cards.mjs']);
await run(process.execPath, ['scripts/generate-client.mjs', '--check']);
