import { useState } from 'react';
import { useReadApi } from '../../hooks/useReadApi';
import { useCommand } from '../../hooks/useCommand';
import { CommandState } from '../../components/CommandState';
import { TextField } from '../../components/FormControls';
import { getProjectProgress, inferProjectProgress } from './progressClient';
import { hasProgress, parseProgressFiles, PROGRESS_FILES_LIMIT, progressKindLabel, progressPercentLabel, progressSourceLabel, progressSourceSummary, progressStatusLabel } from './progressPresentation';
import { formatDateTime } from '../../utils/format';
import { ProjectManualProgressForm } from './ProjectManualProgressForm';
import type { components } from '../../api/schema';
import styles from '../../components/FormControls.module.css';

type Project = components['schemas']['LocalProjectV1'];

export function ProjectProgressPanel({ project, disabled }: { project: Project; disabled: boolean }) {
  const state = useReadApi(signal => getProjectProgress(project.id, signal), { key: project.id });
  const unavailable = disabled || state.loading || state.stale || !state.data;
  const [manualBlocked, setManualBlocked] = useState(false);
  const command = useCommand(unavailable || manualBlocked);
  const consented = !!project.settings.external_model_cli;
  const progress = state.data?.progress;
  const [filesText, setFilesText] = useState('STATUS.md');
  const parsed = parseProgressFiles(filesText);
  const overLimit = parsed.length > PROGRESS_FILES_LIMIT;
  const files = overLimit ? [] : parsed;

  const infer = () => {
    // 完整输入确定 Idempotency-Key，人工重试保留同一操作身份。
    const request = command.prepare({ expected_version: 1, files });
    void command.run(
      () => inferProjectProgress(project.id, request.key, files),
      state.retry,
      '已发起进度推断；结果按你选择的文件返回',
    );
  };

  return <section aria-label="项目进度推断" className={styles.record}>
    <h4>项目进度（人工记录 / Agent 推断）</h4>
    <p className={styles.note}>从项目内的状态、任务文件推断进度，附来源与版本；尚未记录时如实显示未知。</p>
    {state.stale && <p role="alert">进度读取失败，保留上次已保存记录；重新读取成功后再提交操作。<span>{state.error}</span></p>}
    {state.loading && !state.data ? <p role="status">进度加载中…</p> : state.error && !state.data ? <p role="status">进度未获取：{state.error}</p> : progress && <>
      <p className={styles.note}>状态 · {progressStatusLabel(progress.status)}{progress.source ? ` · ${progressSourceLabel(progress.source)}` : ''}</p>
      {progress.percent != null && <p className={styles.note}>完成度 · {progress.percent}%（{progressPercentLabel(progress.source)}）</p>}
      {progress.summary && <p aria-label="项目进度摘要">{progress.summary}</p>}
      <p className={styles.note}>依据来源 · {progressSourceSummary(progress.evidence)}</p>
      {progress.evidence.length > 0 && <ul className={styles.timeline}>{progress.evidence.map((item, index) => <li key={index}><h5>{item.source_path}</h5><p className={styles.note}>{progressKindLabel(item.kind)} · 版本 {item.version || '未知'}</p>{item.excerpt && <pre>{item.excerpt}</pre>}</li>)}</ul>}
      <p className={styles.note}>{progress.observed_at ? `观察时间 · ${formatDateTime(progress.observed_at)}` : '观察时间未知'}{progress.native_id ? ` · 原生会话 ${progress.native_id}` : ''}{progress.model ? ` · 模型 ${progress.model}` : ''}{progress.revision ? ` · 版本 r${progress.revision}` : ''}</p>
      {progress.warning && <p role="status">{progress.warning}</p>}
    </>}
    {!hasProgress(progress ?? { project_id: project.id, status: 'unknown', evidence: [], revision: 0 }) && !state.loading && !state.error && <p role="status">尚无进度记录；可保存人工记录，模型推断需要单独许可。</p>}
    {progress && <ProjectManualProgressForm key={project.id} progress={progress} disabled={unavailable || command.pending} onSaved={state.retry} onBlockedChange={setManualBlocked} />}
    <TextField label="推断文件（相对路径，每行一个）" value={filesText} onChange={setFilesText} multiline hint="每个项目内相对路径一行（如 STATUS.md），最多 8 个；由后端按已批准目录校验。" disabled={unavailable || !consented || command.pending} />
    {overLimit && <p role="status">推断文件超过 {PROGRESS_FILES_LIMIT} 个，请精简到 {PROGRESS_FILES_LIMIT} 个以内再发起。</p>}
    <div className={styles.actions}>
      <button className="ac-button secondary compact" type="button" disabled={state.loading} onClick={state.retry}>重载进度</button>
      <button className="ac-button" type="button" disabled={unavailable || manualBlocked || command.pending || !consented || !files.length} onClick={infer}>{consented ? '发起进度推断' : '需先许可项目模型客户端'}</button>
    </div>
    {!consented && <p className={styles.note}>此项目尚未许可模型客户端，不能发起进度推断；请在项目接入设置中许可后再试。</p>}
    <CommandState {...command} />
  </section>;
}
