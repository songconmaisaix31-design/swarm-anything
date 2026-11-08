import { TextField } from '../../../components/FormControls';
import styles from './MissionWorkspace.module.css';

export interface WorkItemDraft {
  title: string;
  inputs: { id: string; revision: string }[];
  dependencies: string;
  writePaths: string;
}

export function WorkItemFields({ draft, onChange, disabled }: { draft: WorkItemDraft; onChange: (draft: WorkItemDraft) => void; disabled: boolean }) {
  return <fieldset className={styles.fields} disabled={disabled}>
    <legend>工作项内容</legend>
    <TextField label="工作项标题" value={draft.title} onChange={title => onChange({ ...draft, title })} required />
    <fieldset className={styles.fields}><legend>固定输入版本</legend>
      {draft.inputs.map((input, index) => <div key={index} className={styles.inputRow}>
        <TextField label={`输入 ${index + 1} ID`} value={input.id} onChange={id => onChange({ ...draft, inputs: draft.inputs.map((value, position) => position === index ? { ...value, id } : value) })} required />
        <TextField label={`输入 ${index + 1} 版本`} value={input.revision} onChange={revision => onChange({ ...draft, inputs: draft.inputs.map((value, position) => position === index ? { ...value, revision } : value) })} required />
        <button type="button" className="ac-button secondary compact" onClick={() => onChange({ ...draft, inputs: draft.inputs.filter((_, position) => position !== index) })}>移除输入 {index + 1}</button>
      </div>)}
      <button type="button" className="ac-button secondary compact" onClick={() => onChange({ ...draft, inputs: [...draft.inputs, { id: '', revision: '' }] })}>添加固定输入版本</button>
      <small>使用任务范围内的真实来源或上下文版本。</small>
    </fieldset>
    <TextField label="依赖工作项" value={draft.dependencies} onChange={dependencies => onChange({ ...draft, dependencies })} multiline hint="每行一个已有工作项 ID。" />
    <TextField label="工作项允许修改的路径" value={draft.writePaths} onChange={writePaths => onChange({ ...draft, writePaths })} multiline required hint="每行一个批准范围内的相对文件或目录。" />
  </fieldset>;
}

export interface ArtifactDraft {
  commit: string;
  objectRef: string;
  checksRef: string;
  changedPaths: string;
  calls: string;
  tokens: string;
  money: string;
  currency: string;
}

export function ArtifactFields({ draft, onChange, disabled }: { draft: ArtifactDraft; onChange: (draft: ArtifactDraft) => void; disabled: boolean }) {
  const update = (field: keyof ArtifactDraft) => (value: string) => onChange({ ...draft, [field]: value });
  const integerRange = { min: 0, max: Number.MAX_SAFE_INTEGER, step: '1' };
  return <fieldset className={styles.fields} disabled={disabled}>
    <legend>提交真实产物与检查引用</legend>
    <TextField label="产物 Commit SHA" value={draft.commit} onChange={update('commit')} required />
    <TextField label="产物对象引用" value={draft.objectRef} onChange={update('objectRef')} required />
    <TextField label="检查结果引用" value={draft.checksRef} onChange={update('checksRef')} required />
    <TextField label="实际修改路径" value={draft.changedPaths} onChange={update('changedPaths')} multiline required hint="每行一个实际修改的相对路径；服务核对真实 Git 差分及批准范围。" />
    <TextField label="实际调用量" value={draft.calls} onChange={update('calls')} type="number" numberRange={integerRange} hint="未知用量保持空白；已知零用量填写 0。" />
    <TextField label="实际 Token 用量" value={draft.tokens} onChange={update('tokens')} type="number" numberRange={integerRange} hint="未知用量保持空白；限额所需用量证据由服务核查。" />
    <TextField label="实际费用（最小货币单位）" value={draft.money} onChange={update('money')} type="number" numberRange={integerRange} hint="未知费用保持空白。" />
    <TextField label="实际费用币种" value={draft.currency} onChange={update('currency')} />
    <p>提交后进入待验收状态。人工采用后才记录验收通过。</p>
  </fieldset>;
}
