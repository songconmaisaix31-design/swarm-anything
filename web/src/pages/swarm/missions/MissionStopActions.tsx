import { useState } from 'react';
import { TextField } from '../../../components/FormControls';
import styles from './MissionWorkspace.module.css';

export function MissionStopActions({ state, disabled, pending, onPause, onCancel }: { state: string; disabled: boolean; pending: boolean; onPause: (reason: string) => void; onCancel: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const terminal = state === 'completed' || state === 'cancelled';
  return <section aria-label="暂停或取消任务">
    <fieldset className={styles.fields} disabled={disabled || pending || terminal}>
      <legend>任务停止操作</legend>
      <TextField label="暂停或取消原因" value={reason} onChange={setReason} required multiline />
      <div className={styles.actions}><button className="ac-button secondary" type="button" disabled={!reason.trim() || state === 'paused'} onClick={() => onPause(reason.trim())}>暂停任务</button><button className="ac-button secondary" type="button" disabled={!reason.trim()} onClick={() => onCancel(reason.trim())}>取消任务</button></div>
      <p>服务保存停止状态并核查现有执行者。停止结果未知时保留原操作身份，先读取当前任务核对。</p>
    </fieldset>
  </section>;
}
