import { spawnSync } from 'node:child_process';
import { findGo, root } from './process.mjs';

const arguments_ = process.argv.slice(2);
if (arguments_.length > 1 || arguments_.some(value => !['--swa', '--all'].includes(value))) throw new Error('Usage: node scripts/check-architecture.mjs [--swa|--all]');
const swaOnly = arguments_[0] === '--swa';
const go = await findGo();
const moduleResult = spawnSync(go, ['list', '-mod=readonly', '-m', '-json'], { cwd: root, encoding: 'utf8', windowsHide: true });
if (moduleResult.error) throw moduleResult.error;
if (moduleResult.status !== 0) throw new Error(moduleResult.stderr);
const moduleName = JSON.parse(moduleResult.stdout).Path;
if (typeof moduleName !== 'string' || !moduleName) throw new Error('Go module identity is unavailable');
const targets = swaOnly ? ['-deps', './cmd/swa', './cmd/swa-server'] : ['./...'];
const result = spawnSync(go, ['list', '-mod=readonly', '-f', '{{.ImportPath}}|{{join .Imports ","}}', ...targets], { cwd: root, encoding: 'utf8', windowsHide: true });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(result.stderr);
const graph = new Map(result.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
  const [name, imports] = line.split('|');
  return [name, imports ? imports.split(',') : []];
}));
if (!graph.size) throw new Error('No Go packages; backend owner work is pending');

// net/url 只解析值对象，其余网络 I/O 不得进入 Domain/app。
const io = /^(database(?:\/|$)|net(?:\/(?!url$)|$)|os(?:\/|$)|io(?:\/|$)|bufio$|syscall$|log(?:\/|$)|modernc\.org\/|golang\.org\/x\/sys)/;
const issues = [];
const checkedLayers = [];
const checkedJudgment = [];
for (const [name, imports] of graph) {
  const relative = name.startsWith(moduleName + '/') ? name.slice(moduleName.length + 1) : name;
  const layer = relative.match(/^internal\/(attention|workspace|swarm|workbench)\/(domain|app)(?:\/|$)/);
  const judgment = /^internal\/judgment(?:\/|$)/.test(relative);
  if (layer) checkedLayers.push(relative);
  if (judgment) checkedJudgment.push(relative);
  for (const dependency of imports) {
    const internal = dependency.startsWith(moduleName + '/') ? dependency.slice(moduleName.length + 1) : '';
    if (layer) {
      const [, context, level] = layer;
      const other = internal.match(/^internal\/(attention|workspace|swarm|workbench)\//);
      if (other && other[1] !== context) issues.push(`${relative} imports another context: ${dependency}`);
      if (io.test(dependency)) issues.push(`${relative} imports I/O: ${dependency}`);
      if (internal.startsWith('internal/adapters/')) issues.push(`${relative} imports an adapter: ${dependency}`);
      if (level === 'domain') {
        if (internal && !internal.startsWith(`internal/${context}/domain`)) issues.push(`${relative} imports outside its Domain: ${dependency}`);
        if (!internal && dependency.includes('.')) issues.push(`${relative} imports an unapproved external dependency: ${dependency}`);
      }
    }
    if (judgment) {
      if (io.test(dependency)) issues.push(`${relative} imports I/O: ${dependency}`);
      // 共享判断契约复用现有 Workspace 值类型和错误类型，禁止依赖应用服务或 adapter。
      if (internal && internal !== 'internal/apierrors' && internal !== 'internal/workspace/domain' && !/^internal\/judgment(?:\/|$)/.test(internal)) {
        issues.push(`${relative} imports outside the shared judgment contract: ${dependency}`);
      }
    }
    if (/^internal\/adapters\/(httpapi|swahttp|mcp)(?:\/|$)/.test(relative) &&
        (dependency === 'database/sql' || dependency.startsWith('modernc.org/') || /^internal\/adapters\/(sqlite|sqlitebase|swastore)(?:\/|$)/.test(internal))) {
      issues.push(`${relative} transport imports persistence: ${dependency}`);
    }
  }
}
// SWA 主动服务闭包不得重新依赖旧混合产品组装。
const swa = spawnSync(go, ['list', '-mod=readonly', '-deps', '-f', '{{.ImportPath}}', './cmd/swa', './cmd/swa-server'], { cwd: root, encoding: 'utf8', windowsHide: true });
if (swa.error) throw swa.error;
if (swa.status !== 0) throw new Error(swa.stderr);
const allowed = /^(?:cmd\/swa(?:-server)?|internal\/(?:apierrors|foundation|workspace\/(?:app|domain)|adapters\/(?:orca|projectfiles|sqlitebase|swahttp|swastore))|migrations\/swa)$/;
for (const dependency of swa.stdout.trim().split(/\r?\n/)) {
  if (!dependency.startsWith(moduleName + '/')) continue;
  const relative = dependency.slice(moduleName.length + 1);
  if (!allowed.test(relative)) issues.push(`SWA service depends on a package outside its product: ${relative}`);
}
if (issues.length) throw new Error(`Architecture violations:\n${issues.join('\n')}`);
console.log(`Go import graph (${swaOnly ? 'SWA entry dependencies' : 'all packages'}): ${graph.size} packages satisfy Domain/app/context/transport boundaries`);
console.log(`Checked Domain/app packages: ${checkedLayers.join(', ')}`);
console.log(`Checked shared judgment packages: ${checkedJudgment.join(', ')}`);
