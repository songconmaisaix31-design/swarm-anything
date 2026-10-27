import { findGo, checkGofmt, createCheckOutputDirectory, run, runTool, root } from './process.mjs';

const arguments_ = process.argv.slice(2);
if (arguments_.some(argument => argument !== '--race') || arguments_.length > 1) throw new Error('Only --race is supported');
const race = arguments_[0] === '--race';
const packages = ['./cmd/swa', './cmd/swa-server', './internal/apierrors', './internal/foundation', './internal/adapters/projectfiles', './internal/adapters/sqlitebase', './internal/adapters/swahttp', './internal/adapters/swastore'];
const workspaceTests = '^Test(OrcaDelivery|OrcaQuestionAnswer|OrcaCapabilitiesRejectBeforeNativeSQLite|OrcaHandoff|OrcaTaskSpec|RunCommandScopeAndRoleValidation|RunSubmissionRequestIdentity|RunRolePreservesFixedSpecification|RoleAndDiscussionDoNotAcceptExecutionAuthority|RunSubmissionDetectsSameSizeSameTimeInputChanges|CodexNativeLaunchContract|ClaudeNativeLaunchContract|PiPerSessionNative|OpenCodeStepFunAccountWireIsStrict|ProjectAction)';
const orcaTests = '^Test(Runtime|InstalledWebDirectory)';
const installedTests = '^TestOrcaCLIReal(InstalledController|HTTPAuthorityBoundary)$';
const directories = [...packages, './internal/workspace/app', './internal/workspace/domain', './internal/adapters/orca'];
process.env.ASTROCYTE_TEST_OUTPUT_ROOT = await createCheckOutputDirectory();
console.log(`Verification output: ${process.env.ASTROCYTE_TEST_OUTPUT_ROOT}`);

const go = await findGo();
if (!race) {
  await checkGofmt(go, directories);
  await run(go, ['vet', '-mod=readonly', ...directories]);
}
await runTool('vite', ['build']);
const testArguments = ['test', '-mod=readonly', '-count=1', ...(race ? ['-race'] : [])];
await run(go, [...testArguments, '-skip', installedTests, ...packages]);
await run(go, [...testArguments, './internal/adapters/orca', '-run', orcaTests]);
await run(go, [...testArguments, './internal/workspace/app', '-run', workspaceTests]);
if (!race) {
  await run(go, ['mod', 'verify']);
  await run(process.execPath, ['scripts/check-dependencies.mjs']);
  await run(process.execPath, ['scripts/check-architecture.mjs', '--swa']);
  await run(process.execPath, ['--test', 'scripts/stop-process.test.mjs', 'tests/s1/development-lifecycle.test.mjs']);
  await run(process.execPath, ['--test', 'tests/swa-product-acceptance/driver-failure.test.mjs']);
  await run(process.execPath, ['--test', 'tests/swa-cli-headless/task-budget.test.mjs', 'tests/swa-cli-headless/project-capabilities.test.mjs', 'tests/swa-cli-headless/agent-observations.test.mjs', 'tests/swa-cli-headless/run-view.test.mjs', 'tests/swa-cli-headless/question-answer.test.mjs', 'tests/swa-cli-headless/question-ask.test.mjs', 'tests/swa-cli-headless/collaboration-records.test.mjs', 'tests/swa-cli-headless/pi-worker-launch.test.mjs', 'tests/swa-cli-headless/worker-start-mode.test.mjs', 'tests/swa-cli-headless/worker-acquired-options.test.mjs', 'tests/swa-cli-headless/pi-stdio-write.test.mjs', 'tests/swa-cli-headless/pi-provider-error.test.mjs', 'tests/swa-cli-headless/pi-input-turn.test.mjs', 'tests/swa-cli-headless/pi-final-block.test.mjs', 'tests/swa-cli-headless/live-trace-observation.test.mjs', 'tests/swa-cli-headless/opencode-stepfun-policy.test.mjs']);
  await runTool('redocly', ['lint', 'contracts/openapi.yaml', '--config', 'contracts/redocly.yaml'], { cwd: root });
  await run(process.execPath, ['scripts/validate-examples.mjs']);
  await run(process.execPath, ['scripts/generate-client.mjs', '--check']);
  await runTool('tsc', ['-b']);
  await runTool('eslint', ['.']);
  await runTool('vitest', ['run']);
  await run('git', ['diff', '--check']);
}
