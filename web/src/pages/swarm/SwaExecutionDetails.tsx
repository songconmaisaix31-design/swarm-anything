import type { SwaEnvelope } from '../../api/swa';
import { readSwaExecution } from './swaObservation';
import styles from './SwaWorkspace.module.css';

const status = { available: '已有证据', unavailable: '不可用', unknown: '尚未验证' };
const basis = { declaration: '适配器声明', configuration: '配置来源', probe: '实际探测', session: '原生会话', result: '完整原生成果' };
const delivery = { sent: '已送达原生 Agent', not_sent: '原生来源明确未送达', unknown: '送达情况未知；不能自动重发' };
const phase = { journaled: '已记入日志', queued: '已排队', accepted: '原生已接受', rejected: '原生已拒绝', unknown: '阶段未知' };
const resume = { not_requested: '原会话由本次创建，未观察到恢复', resumed: '恢复原会话', rebuilt: '已重建会话，上下文发生替换', failed: '原会话恢复已明确失败', unknown: '恢复结果未知' };
const catalogOrigin = { 'live-session': '当前原生会话', probe: '原生探测', configured: '配置记录', unknown: '来源未知' };
const accountSource: Record<string, string> = {
  'pi-native-api-key': 'Pi 独立 API 密钥来源', 'pi-native-api-key-per-session': 'Pi 按会话隔离的 API 密钥来源',
  'codex-native-api-key': 'Codex 独立 API 密钥来源', 'claude-native-api-key': 'Claude 独立 API 密钥来源', 'opencode-native-api-key': 'OpenCode 独立 API 密钥来源',
  'opencode-native-stepfun-api-key': 'OpenCode 阶跃星辰独立 API 密钥来源',
};

export function SwaExecutionDetails({ reply, projectID, controller, runID, dispatchID }: { reply: SwaEnvelope; projectID: string; controller: string; runID: string; dispatchID: string }) {
  let observed: ReturnType<typeof readSwaExecution>;
  try { observed = readSwaExecution(reply, projectID, controller, runID, dispatchID); }
  catch { return <p role="alert">当前 Worker 的执行来源无法完整核对，实际执行状态保持未知。可查看原件详情。</p>; }
  if (!observed) return <p role="status">服务尚未提供此 Worker 的可核对执行来源；实际 Agent、账号认证、输入送达和恢复状态保持未知。</p>;
  const stages = [['实际启动', observed.launch], ['原生输入控制', observed.control], ['模型执行成果', observed.result], ['登录与模型访问证据', observed.authenticated]] as const;
  return <section aria-label="实际 Agent 执行观察">
    <h4>实际执行选择</h4>
    <dl>
      <dt>Agent / 版本</dt><dd>{observed.selection.agent} / {observed.selection.version}</dd>
      <dt>供应商 / 模型</dt><dd>{observed.selection.provider} / {observed.selection.model}</dd>
      <dt>账号来源类型</dt><dd>{accountSource[observed.selection.accountSource] ?? '尚未识别的来源类型，详见原件'}</dd>
    </dl>
    <p className={styles.note}>账号来源类型说明本次使用哪类配置；登录和模型访问是否成功，依下方完整原生成果证据判定。</p>
    <dl>{stages.map(([label, observation]) => <div key={label}><dt>{label}</dt><dd>{status[observation.status]} · {observation.basis ? basis[observation.basis] : '依据未提供'}</dd></div>)}</dl>
    {observed.authenticated.status === 'unknown' && <p className={styles.note}>当前观察未提供完整成功结果；安装、配置和启动不能证明账号已登录或模型已执行成功。</p>}
    <h4>本次输入与会话</h4>
    <dl>
      <dt>输入送达</dt><dd>{delivery[observed.delivery.state]} · {phase[observed.delivery.phase]}</dd>
      <dt>会话恢复</dt><dd>{resume[observed.resume.state]}</dd>
    </dl>
    <h4>模型目录来源</h4>
    <p>{catalogOrigin[observed.catalog.origin]} · {observed.catalog.availability === 'verified' ? '目录来源已观察' : '目录尚未验证'}{observed.catalog.observedAt ? ` · ${observed.catalog.observedAt}` : ''}</p>
    <p className={styles.note}>目录中出现模型不代表当前账号已执行该模型。此 Worker 保持原先批准的模型选择。</p>
    {observed.catalog.models.length > 0 && <ul>{observed.catalog.models.map(model => <li key={model.id}>{model.label} · {model.id}</li>)}</ul>}
    <details><summary>执行依据与原件标识</summary><dl>
      <dt>原生适配器 / 账号来源类型</dt><dd>{observed.selection.adapter} / {observed.selection.accountSource}</dd>
      {stages.map(([label, observation]) => <div key={label}><dt>{label}</dt><dd>{observation.reason}<br />来源：<code>{observation.source}</code></dd></div>)}
      <dt>原请求 / 原生操作</dt><dd>{observed.delivery.requestID ?? '未观察'} / {observed.delivery.operationID ?? '未观察'}</dd>
      <dt>送达来源</dt><dd><code>{observed.delivery.source}</code></dd>
      <dt>原生会话</dt><dd>{observed.resume.sessionID ?? '未观察'}</dd>
      <dt>恢复来源</dt><dd><code>{observed.resume.source}</code></dd>
    </dl></details>
  </section>;
}
