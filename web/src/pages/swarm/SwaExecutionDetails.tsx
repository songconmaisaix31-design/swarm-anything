import type { SwaEnvelope } from '../../api/swa';
import { readSwaExecution } from './swaObservation';

const status = { available: '可用', unavailable: '不可用', unknown: '未知' };
const basis = { declaration: '声明支持', configuration: '配置', probe: '探测', session: '会话', result: '结果' };
const delivery = { sent: '已送达 Agent', not_sent: '未送达', unknown: '送达情况未知；不能自动重发' };
const phase = { journaled: '已记入日志', queued: '已排队', accepted: '已接受', rejected: '已拒绝', unknown: '阶段未知' };
const resume = { not_requested: '未请求恢复', resumed: '恢复原会话', rebuilt: '已重建会话，上下文已替换', failed: '恢复失败', unknown: '恢复结果未知' };
const catalogOrigin = { 'live-session': '当前会话', probe: '探测', configured: '配置记录', unknown: '来源未知' };
const accountSource: Record<string, string> = {
  'pi-native-api-key': 'Pi 独立 API 密钥', 'pi-native-api-key-per-session': 'Pi 按会话隔离的 API 密钥',
  'codex-native-api-key': 'Codex 独立 API 密钥', 'claude-native-api-key': 'Claude 独立 API 密钥', 'opencode-native-api-key': 'OpenCode 独立 API 密钥',
  'opencode-native-stepfun-api-key': 'OpenCode 阶跃星辰独立 API 密钥',
};

export function SwaExecutionDetails({ reply, projectID, controller, runID, dispatchID }: { reply: SwaEnvelope; projectID: string; controller: string; runID: string; dispatchID: string }) {
  let observed: ReturnType<typeof readSwaExecution>;
  try { observed = readSwaExecution(reply, projectID, controller, runID, dispatchID); }
  catch { return <p role="alert">Worker 执行信息不一致，状态未知。请查看执行详情。</p>; }
  if (!observed) return <p role="status">尚无此 Worker 的执行信息，状态未知。</p>;
  const stages = [['启动', observed.launch], ['输入控制', observed.control], ['执行成果', observed.result], ['账号与模型访问', observed.authenticated]] as const;
  return <section aria-label="Agent 执行状态">
    <h4>执行配置</h4>
    <dl>
      <dt>Agent / 版本</dt><dd>{observed.selection.agent} / {observed.selection.version}</dd>
      <dt>供应商 / 模型</dt><dd>{observed.selection.provider} / {observed.selection.model}</dd>
      <dt>账号配置</dt><dd>{accountSource[observed.selection.accountSource] ?? '未知类型，详见执行详情'}</dd>
    </dl>
    <dl>{stages.map(([label, observation]) => <div key={label}><dt>{label}</dt><dd>{status[observation.status]} · {observation.basis ? basis[observation.basis] : '无状态来源'}</dd></div>)}</dl>
    <h4>本次输入与会话</h4>
    <dl>
      <dt>输入送达</dt><dd>{delivery[observed.delivery.state]} · {phase[observed.delivery.phase]}</dd>
      <dt>会话恢复</dt><dd>{resume[observed.resume.state]}</dd>
    </dl>
    <h4>模型目录</h4>
    <p>{catalogOrigin[observed.catalog.origin]} · {observed.catalog.availability === 'verified' ? '已获取' : '目录未核实'}{observed.catalog.observedAt ? ` · ${observed.catalog.observedAt}` : ''}</p>
    {observed.catalog.models.length > 0 && <ul>{observed.catalog.models.map(model => <li key={model.id}>{model.label} · {model.id}</li>)}</ul>}
    <details><summary>执行详情</summary><dl>
      <dt>原生适配器 / 账号来源类型</dt><dd>{observed.selection.adapter} / {observed.selection.accountSource}</dd>
      {stages.map(([label, observation]) => <div key={label}><dt>{label}</dt><dd>{observation.reason}<br />来源：<code>{observation.source}</code></dd></div>)}
      <dt>原请求 / 原生操作</dt><dd>{observed.delivery.requestID ?? '未观察'} / {observed.delivery.operationID ?? '未观察'}</dd>
      <dt>送达来源</dt><dd><code>{observed.delivery.source}</code></dd>
      <dt>原生会话</dt><dd>{observed.resume.sessionID ?? '未观察'}</dd>
      <dt>恢复来源</dt><dd><code>{observed.resume.source}</code></dd>
    </dl></details>
  </section>;
}
