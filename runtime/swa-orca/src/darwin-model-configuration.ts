import { spawnSync } from 'node:child_process'
import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { createHash } from 'node:crypto'
import { prepareDarwinDiscoveryEnvironment } from './darwin-discovery'

export const darwinPiModel = 'omlx/CyberTiel-MLX-MTP'

// 官方 1.5.0 list-models.js 输出六列文本；模糊搜索结果仍须按完整 ID 核对。
export function parseDarwinPiModels(output: string) {
  const lines = output.trim().split(/\r?\n/)
  if (lines[0]?.trim().split(/\s+/).join(' ') !== 'provider model context max-out thinking images') throw new Error('darwin_pi_model_catalog_unverified')
  const seen = new Set<string>()
  const models = []
  for (const line of lines.slice(1)) {
    const fields = line.trim().split(/\s+/)
    if (fields.length !== 6) throw new Error('darwin_pi_model_catalog_invalid')
    const [provider, model, context, maxOut, thinking, images] = fields as [string, string, string, string, string, string]
    if (!/^[\w.-]+$/.test(provider) || !/^[\w./-]+$/.test(model) || !/^[1-9]\d*(?:\.\d+)?[KM]?$/.test(context) || !/^[1-9]\d*(?:\.\d+)?[KM]?$/.test(maxOut) || !['yes', 'no'].includes(thinking) || !['yes', 'no'].includes(images)) throw new Error('darwin_pi_model_catalog_invalid')
    const id = `${provider}/${model}`
    if (seen.has(id)) throw new Error('darwin_pi_model_catalog_duplicate')
    seen.add(id)
    if (id === darwinPiModel) models.push({ id, label: id, provider })
  }
  if (models.length !== 1) throw new Error('darwin_pi_approved_model_unobserved')
  return models
}

export function observeDarwinPiConfiguration(input: { executable: string; version: string; home: string; sourceHome: string; requestedModel?: string }) {
  if (process.platform !== 'darwin' || input.version !== '1.5.0') throw new Error('darwin_pi_cli_contract_unverified')
  if (input.requestedModel !== undefined && input.requestedModel !== darwinPiModel) throw new Error('darwin_pi_model_unapproved')
  if (!isAbsolute(input.home) || !isAbsolute(input.sourceHome)) throw new Error('darwin_pi_source_invalid')
  const launcher = join(input.home, '.local', 'bin', 'pi')
  const executable = realpathSync(launcher)
  if (executable !== realpathSync(input.executable) || executable !== realpathSync(join(input.home, '.pi', 'agent', 'bin', 'pi'))) throw new Error('darwin_pi_launcher_unverified')
  const sourceHome = realpathSync(input.sourceHome)
  if (!statSync(sourceHome).isDirectory()) throw new Error('darwin_pi_source_invalid')
  const env = { ...prepareDarwinDiscoveryEnvironment(), PI_CODING_AGENT_DIR: sourceHome, PI_TELEMETRY: '0', NO_COLOR: '1', TERM: 'dumb' }
  // 只调用官方元数据入口；不读取或复制账号文件，不继承凭据及 Node 注入变量。
  const result = spawnSync(launcher, ['--list-models', darwinPiModel, '--offline', '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', '--no-tools', '--no-session', '--no-approve'], {
    shell: false, cwd: env.HOME, env, encoding: 'utf8', timeout: 20_000, maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'pipe']
  })
  // CLI 诊断可能包含原配置内容；失败只向发现层返回固定原因。
  if (result.error || result.signal || result.status !== 0 || result.stderr !== '') throw new Error('darwin_pi_model_probe_failed')
  const models = parseDarwinPiModels(result.stdout)
  return {
    model: darwinPiModel, provider: 'omlx', account: undefined, sourceHome,
    version: `pi-cli-1.5.0:list-models:${createHash('sha256').update(result.stdout).digest('hex')}`,
    catalog: { origin: 'probe' as const, availability: 'verified' as const, models, observed_at: new Date().toISOString() }
  }
}
