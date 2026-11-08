import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'

export async function verifyInstalledProductSource(candidate, sourceDirectory, output) {
  const git = args => execFileSync('git', ['-C', sourceDirectory, ...args], { encoding: 'utf8', windowsHide: true }).trim()
  const candidateRevision = (await readFile(join(candidate, 'VERSION'), 'utf8')).trim()
  const testRevision = git(['rev-parse', 'HEAD'])
  assert.match(candidateRevision, /^[a-f0-9]{40}$/)
  assert.match(testRevision, /^[a-f0-9]{40}$/)
  assert.equal(git(['status', '--porcelain']), '')
  const nonProduct = ['docs/**', 'tasks/**', 'THIRD_PARTY_SWA.md', 'pnpm-workspace.yaml', 'internal/adapters/sqlite/taste_profile_test.go', 'tests/swa-cli-headless/OrcaPreservation.psm1', 'tests/swa-cli-headless/controller-recovery.mjs', 'tests/swa-cli-headless/runtime-restart.mjs', 'tests/swa-cli-headless/cli-failure.mjs', 'tests/swa-cli-headless/native-idempotency.mjs', 'tests/swa-cli-headless/installed-product-source.mjs', 'tests/swa-cli-headless/linux-provider-tree.test.mjs', 'tests/swa-cli-headless/linux-provider-stdin-observer.mjs']
  git(['diff', '--exit-code', candidateRevision, testRevision, '--', '.', ...nonProduct.map(path => `:(exclude,glob)${path}`)])
  const candidateWorkspace = parse(git(['show', `${candidateRevision}:pnpm-workspace.yaml`]))
  const testWorkspace = parse(await readFile(join(sourceDirectory, 'pnpm-workspace.yaml'), 'utf8'))
  const policyOnly = ['@parcel/watcher@2.5.6', '@vscode/windows-process-tree@0.8.0', 'agent-browser@0.27.0', 'cpu-features@0.0.10', 'node-pty@1.1.0', 'ssh2@1.17.0']
  for (const key of policyOnly) {
    assert.ok(candidateWorkspace.allowBuilds[key] === undefined || candidateWorkspace.allowBuilds[key] === false)
    assert.equal(testWorkspace.allowBuilds[key], false)
    delete candidateWorkspace.allowBuilds[key]
    delete testWorkspace.allowBuilds[key]
  }
  assert.deepEqual(testWorkspace, candidateWorkspace)
  const excludedTests = nonProduct.filter(path => path.startsWith('tests/'))
  for (const name of (await readdir(join(candidate, 'runtime'))).filter(name => name.endsWith('.metafile.json'))) {
    const metadata = JSON.parse(await readFile(join(candidate, 'runtime', name), 'utf8'))
    assert.ok(excludedTests.every(path => metadata.inputs[path] === undefined), 'An excluded test is an actual installed product input')
  }
  const result = { candidate_source_revision: candidateRevision, test_source_revision: testRevision, unchanged_product_sources: true, non_product_paths: nonProduct, install_only_script_policies: policyOnly }
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  return result
}
