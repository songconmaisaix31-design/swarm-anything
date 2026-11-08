import { useState } from 'react';
import { TextField } from '../../../components/FormControls';
import styles from './MissionWorkspace.module.css';

export function ArtifactReviewActions({ state, disabled, pending, onAccept, onReject }: { state: string; disabled: boolean; pending: boolean; onAccept: () => void; onReject: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return <section aria-label="人工验收产物">
    <fieldset className={styles.fields} disabled={disabled || pending || state !== 'submitted'}>
      <legend>人工采用与退回</legend>
      <p>核对实际差分、检查记录、来源版本及批准范围后决定是否采用。</p>
      <button className="ac-button" type="button" onClick={onAccept}>采用产物</button>
      <TextField label="退回原因" value={reason} onChange={setReason} multiline />
      <button className="ac-button secondary" type="button" disabled={!reason.trim()} onClick={() => onReject(reason.trim())}>退回产物</button>
    </fieldset>
  </section>;
}

export function ArtifactDiff({ diff, commit, baseCommit }: { diff: string; commit: string; baseCommit: string }) {
  return <section aria-label="产物 Git 差分" className={styles.record}>
    <h4>实际 Git 差分</h4>
    <p>基准 Commit：<code>{baseCommit}</code></p>
    <p>产物 Commit：<code>{commit}</code></p>
    {diff ? <pre className={styles.diff}>{diff}</pre> : <p>该产物与基准之间没有文件差异。</p>}
  </section>;
}
