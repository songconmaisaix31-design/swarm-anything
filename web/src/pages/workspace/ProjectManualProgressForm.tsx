import { useEffect, useState } from 'react';
import { usePersistentCommand } from '../../hooks/usePersistentCommand';
import { CommandState } from '../../components/CommandState';
import { TextField } from '../../components/FormControls';
import { setProjectProgress } from './progressClient';
import type { ProjectProgress, ProjectProgressResult } from './progressPresentation';
import styles from '../../components/FormControls.module.css';

export function ProjectManualProgressForm({ progress, disabled, onSaved, onBlockedChange }: { progress: ProjectProgress; disabled: boolean; onSaved: () => void; onBlockedChange: (blocked: boolean) => void }) {
  const [status, setStatus] = useState(progress.source === 'human' ? progress.status : '');
  const [summary, setSummary] = useState(progress.source === 'human' ? progress.summary ?? '' : '');
  const [percent, setPercent] = useState(progress.source === 'human' && progress.percent != null ? String(progress.percent) : '');
  const [revision, setRevision] = useState(progress.revision);
  const [validation, setValidation] = useState('');
  const command = usePersistentCommand<ProjectProgressResult>(`project:${progress.project_id}:manual-progress`, result => {
    if (result.progress.project_id !== progress.project_id || result.progress.source !== 'human') throw new Error('人工进度返回的项目或来源与请求不一致');
    return { status: 'succeeded', message: '已保存人工进度' };
  });
  useEffect(() => { onBlockedChange(command.pending || command.uncertain); }, [command.pending, command.uncertain, onBlockedChange]);
  const changed = progress.revision !== revision;
  const blocked = disabled || changed || command.pending || command.uncertain;
  return <form className={styles.form} aria-label="人工项目进度" onSubmit={event => {
    event.preventDefault();
    if (blocked) return;
    const value = percent.trim() ? Number(percent) : null;
    if (!status.trim() || value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 100)) {
      setValidation('请填写人工状态；完成度可留空，填写时须为 0 至 100 的整数。'); return;
    }
    setValidation('');
    void command.run(key => setProjectProgress(progress.project_id, { schema_version: 1, request_id: key, expected_version: 1,
      status: status.trim(), summary: summary.trim(), percent: value }, key), result => { setRevision(result.progress.revision); onSaved(); });
  }}>
    <h5>记录人工进度</h5><p className={styles.note}>保存你当前确认的状态与说明；完成度留空时保留未知。模型推断需要单独许可和操作。</p>
    {changed && <p role="status">进度已有新版本，当前输入保留。<button className="ac-button secondary compact" type="button" disabled={disabled || command.pending || command.uncertain} onClick={() => {
      setStatus(progress.source === 'human' ? progress.status : ''); setSummary(progress.source === 'human' ? progress.summary ?? '' : '');
      setPercent(progress.source === 'human' && progress.percent != null ? String(progress.percent) : ''); setRevision(progress.revision);
    }}>载入当前人工记录</button></p>}
    <fieldset disabled={blocked}><legend>本次人工记录</legend>
      <TextField label="人工项目状态" value={status} onChange={setStatus} required />
      <TextField label="人工进度说明" value={summary} onChange={setSummary} multiline />
      <TextField label="人工完成度（0–100，未知留空）" value={percent} onChange={setPercent} type="number" numberRange={{ min: 0, max: 100, step: '1' }} />
      <button className="ac-button secondary" type="submit">保存人工进度</button>
    </fieldset>
    {validation && <p role="alert">{validation}</p>}<CommandState {...command} />
    {command.uncertain && <p role="alert">人工进度请求 {command.operationID} 的结果未知，关闭或刷新后保持锁定；请只读取原保存结果核查。</p>}
  </form>;
}
