import { TextField } from '../../../components/FormControls';
import styles from './ProposalWorkspace.module.css';

// 表单保存可编辑字符串；API 内容由生成类型约束的调用组件组装。
export interface ProposalDraft {
  title: string;
  goalId: string;
  goalRevision: string;
  projectId: string;
  roots: string;
  writePaths: string;
  actions: string;
  tools: string;
  externalTargets: string;
  maxConcurrency: string;
  calls: string;
  tokens: string;
  moneyMinor: string;
  currency: string;
  deliverables: string;
  successCriteria: string;
  deadline: string;
  stopConditions: string;
  maxWorkItems: string;
  maxAttempts: string;
  noProgressSeconds: string;
  maxNoProgressRounds: string;
}

export function ProposalContentFields({ draft, onChange, disabled, projectLocked = false }: { draft: ProposalDraft; onChange: (draft: ProposalDraft) => void; disabled: boolean; projectLocked?: boolean }) {
  const update = (field: keyof ProposalDraft) => (value: string) => onChange({ ...draft, [field]: value });
  const integerRange = { min: 0, max: Number.MAX_SAFE_INTEGER, step: '1' };
  return <div className={styles.formFields}>
    <fieldset disabled={disabled}><legend>目标与项目</legend>
      <TextField label="提案标题" value={draft.title} onChange={update('title')} required />
      <TextField label="目标 ID" value={draft.goalId} onChange={update('goalId')} required hint="使用已保存目标的固定版本。" />
      <TextField label="目标版本" value={draft.goalRevision} onChange={update('goalRevision')} required type="number" numberRange={{ ...integerRange, min: 1 }} />
      <TextField label="项目 ID" value={draft.projectId} onChange={update('projectId')} required disabled={projectLocked} />
    </fieldset>
    <fieldset disabled={disabled}><legend>执行范围</legend>
      <TextField label="允许根目录" value={draft.roots} onChange={update('roots')} multiline hint="每行一个绝对目录；提交审阅前必须明确执行范围。" />
      <TextField label="允许修改的路径" value={draft.writePaths} onChange={update('writePaths')} multiline hint="每行一个根目录内的相对文件或目录。" />
      <TextField label="允许动作" value={draft.actions} onChange={update('actions')} multiline hint="每行一个项目已许可的动作。" />
      <TextField label="允许工具" value={draft.tools} onChange={update('tools')} multiline hint="每行一个明确许可的工具。" />
      <TextField label="允许外发目标" value={draft.externalTargets} onChange={update('externalTargets')} multiline hint="每行一个明确许可的外发目标；空白表示没有外发目标。" />
      <TextField label="最大并发数" value={draft.maxConcurrency} onChange={update('maxConcurrency')} type="number" numberRange={{ ...integerRange, min: 1 }} required />
    </fieldset>
    <fieldset disabled={disabled}><legend>资源上限</legend>
      <p>空白费用保持未知。提交审阅至少需要明确一项资源上限。</p>
      <TextField label="调用上限" value={draft.calls} onChange={update('calls')} type="number" numberRange={integerRange} />
      <TextField label="Token 上限" value={draft.tokens} onChange={update('tokens')} type="number" numberRange={integerRange} />
      <TextField label="费用上限（最小货币单位）" value={draft.moneyMinor} onChange={update('moneyMinor')} type="number" numberRange={integerRange} hint="按服务使用的最小货币单位填写整数；空白保持未知。" />
      <TextField label="币种" value={draft.currency} onChange={update('currency')} required={!!draft.moneyMinor.trim()} hint="填写费用时提供三个大写字母的币种代码。" />
    </fieldset>
    <fieldset disabled={disabled}><legend>产出与停止条件</legend>
      <TextField label="预期产出" value={draft.deliverables} onChange={update('deliverables')} multiline hint="每行一项交付内容。" />
      <TextField label="成功条件" value={draft.successCriteria} onChange={update('successCriteria')} multiline hint="每行一项可检查的成功条件。" />
      <label><span>截止时间</span><input aria-label="截止时间" type="datetime-local" step="any" value={draft.deadline} onChange={event => update('deadline')(event.target.value)} required /></label>
      <TextField label="停止条件" value={draft.stopConditions} onChange={update('stopConditions')} multiline hint="每行一项明确停止条件。" />
      <TextField label="最大工作项数" value={draft.maxWorkItems} onChange={update('maxWorkItems')} type="number" numberRange={{ ...integerRange, min: 1 }} required />
      <TextField label="最大尝试次数" value={draft.maxAttempts} onChange={update('maxAttempts')} type="number" numberRange={{ ...integerRange, min: 1 }} required />
      <TextField label="连续无进展轮数上限" value={draft.maxNoProgressRounds} onChange={update('maxNoProgressRounds')} type="number" numberRange={{ ...integerRange, min: 1 }} required />
      <TextField label="无进展时限（秒）" value={draft.noProgressSeconds} onChange={update('noProgressSeconds')} type="number" numberRange={integerRange} required hint="轮数与时间限制独立保存。" />
    </fieldset>
  </div>;
}
