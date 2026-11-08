import { useState } from 'react';
import { ApiError } from '../../../api/client';
import { localProjectsApi } from '../../../api/s1';
import { repositoryContextApi, type RepositoryIndexEnvelope, type RepositoryQueryRequest, type RepositorySearchRequest, type RepositoryImpactRequest, type RepositoryResult } from '../../../api/repositoryContext';
import { useReadApi } from '../../../hooks/useReadApi';
import { usePersistentCommand } from '../../../hooks/usePersistentCommand';
import { QueryState } from '../../../components/QueryState';
import { CommandState } from '../../../components/CommandState';
import { Field } from '../../../components/DetailPanel';
import { commandError } from '../../../utils/commandError';
import { SelectField } from '../../../components/FormControls';
import { RepositoryQueryFields } from './RepositoryQueryFields';
import { RepositoryIndexView, RepositoryQueryResultView } from './RepositoryResults';
import { boundedQuery, newRepositoryDraft, repositoryRequest } from './repositoryDraft';
import styles from './RepositoryContext.module.css';

type Mode = 'map' | 'search' | 'impact';
type SubmittedQuery = { mode: 'map'; body: RepositoryQueryRequest } | { mode: 'search'; body: RepositorySearchRequest } | { mode: 'impact'; body: RepositoryImpactRequest };
type Submission = SubmittedQuery & { sequence: number };

export function RepositoryContextPanel() {
  const projects = useReadApi(signal => localProjectsApi.listProjects({ signal }), { key: 'repository-projects' });
  const [projectID, setProjectID] = useState('');
  const project = projects.data?.items.find(item => item.id === projectID);
  return <section aria-label="仓库上下文" className={styles.panel}>
    <h3>仓库上下文</h3><p>明确选择项目、读取范围与预算，检查实际工作树快照、索引和来源。</p>
    <QueryState state={projects} empty={data => data.items.length === 0} emptyTitle="请先登记一个项目">{data => <div className={styles.form}>
      <SelectField label="仓库上下文项目" value={projectID} disabled={projects.loading || projects.stale} onChange={setProjectID} options={[{ value: '', label: '请选择已登记项目' }, ...data.items.map(item => ({ value: item.id, label: item.name }))]} />
    </div>}</QueryState>
    <button className="ac-button secondary compact" type="button" disabled={projects.loading} onClick={projects.retry}>刷新项目与读取权限</button>
    {project && <><Field label="当前项目根目录"><code>{project.root}</code></Field><Field label="已许可的项目相对路径">{project.settings.allowed_subdirs.join('；') || '无'}</Field><RepositoryWorkspace key={project.id} projectID={project.id} disabled={projects.loading || projects.stale} /></>}
  </section>;
}

function RepositoryWorkspace({ projectID, disabled }: { projectID: string; disabled: boolean }) {
  const [draft, setDraft] = useState(newRepositoryDraft);
  const [mode, setMode] = useState<Mode>('map');
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [validation, setValidation] = useState('');
  const [readFailure, setReadFailure] = useState<{ sequence: number; code: string | null } | null>(null);
  const command = usePersistentCommand<RepositoryIndexEnvelope>(`repository:${projectID}:maintain`, () => ({ status: 'succeeded', message: '实际索引结果已保存，请核查快照与生成版本' }), {
    failureMessage: cause => cause instanceof ApiError && cause.code === 'evidence_missing'
      ? '当前项目缺少可核查的仓库上下文，请检查实际源码、索引与治理说明。'
      : commandError(cause).message,
  });
  const query = useReadApi<RepositoryResult>(async signal => {
    if (!submission) throw new Error('仓库查询缺少明确提交的参数');
    const { body } = submission;
    try {
      let result: RepositoryResult;
      if (submission.mode === 'map') {
        const response = await repositoryContextApi.map(projectID, { purpose: body.purpose, root: body.roots, ...body.budget }, signal);
        result = response.repository_context;
      } else if (submission.mode === 'search') {
        const response = await repositoryContextApi.search(projectID, submission.body, signal);
        result = response.repository_context;
      } else {
        const response = await repositoryContextApi.impact(projectID, submission.body, signal);
        result = response.repository_context;
      }
      if (!signal?.aborted) setReadFailure(null);
      return result;
    } catch (cause) {
      if (!signal?.aborted) setReadFailure({ sequence: submission.sequence, code: cause instanceof ApiError ? cause.code : null });
      throw cause;
    }
  }, { enabled: submission !== null, key: `${projectID}:${submission?.sequence ?? 0}` });
  const failureCode = readFailure?.sequence === submission?.sequence ? readFailure?.code : undefined;
  const missingIndex = failureCode === 'not_found';
  const staleIndex = failureCode === 'index_stale' || failureCode === 'context_stale';
  const mayMaintain = query.data !== null && !query.stale || missingIndex || staleIndex;
  const busy = disabled || query.loading || command.pending;
  const prepare = (): SubmittedQuery => {
    const body = repositoryRequest(draft);
    if (mode === 'search') return { mode, body: { ...body, query: boundedQuery(draft.query, '代码搜索内容', 1024) } };
    if (mode === 'impact') return { mode, body: { ...body, symbol_id: boundedQuery(draft.symbolId, '符号 ID', 512) } };
    return { mode, body };
  };
  const maintain = (action: 'index' | 'sync' | 'rebuild' | 'map') => {
    if (busy || !mayMaintain || command.uncertain) return;
    let body: RepositoryQueryRequest;
    try { body = repositoryRequest(draft); } catch (cause) { setValidation(cause instanceof Error ? cause.message : '请核对查询范围和预算'); return; }
    setValidation('');
    void command.run(() => action === 'map' ? repositoryContextApi.refreshMap(projectID, body) : repositoryContextApi.index(projectID, { ...body, action }), (_, outcome) => { if (outcome.status === 'succeeded') query.retry(); });
  };
  return <>
    <div className={styles.actions} role="group" aria-label="仓库上下文查询方式">{([['map', '仓库说明'], ['search', '代码搜索'], ['impact', '改动影响']] as const).map(([value, label]) => <button className="ac-button secondary compact" key={value} type="button" aria-pressed={mode === value} disabled={disabled || command.pending} onClick={() => setMode(value)}>{label}</button>)}</div>
    <form className={styles.form} onSubmit={event => {
      event.preventDefault(); if (busy) return;
      let prepared: SubmittedQuery;
      try { prepared = prepare(); } catch (cause) { setValidation(cause instanceof Error ? cause.message : '请核对查询参数'); return; }
      setValidation(''); setSubmission(previous => ({ ...prepared, sequence: (previous?.sequence ?? 0) + 1 }));
    }}><RepositoryQueryFields draft={draft} onChange={setDraft} mode={mode} disabled={disabled || command.pending} />
      {validation && <p role="alert">{validation} 输入已保留。</p>}<button className="ac-button" type="submit" disabled={busy}>读取仓库上下文</button>
    </form>
    {submission && <section aria-label="实际仓库上下文结果"><h4>已提交的查询结果</h4><Field label="本次查询用途">{submission.body.purpose}</Field><Field label="本次查询范围">{submission.body.roots.join('；')}</Field>
      <Field label="本次查询预算">{submission.body.budget.max_files} 个文件 · {submission.body.budget.max_bytes} 字节 · {submission.body.budget.max_results} 个结果 · {submission.body.budget.max_depth} 层关系</Field>
      <QueryState state={query}>{result => <RepositoryQueryResultView mode={submission.mode} result={result} disabled={disabled || query.loading || query.stale || command.pending} onSelectSymbol={symbolId => { setDraft({ ...draft, symbolId }); setMode('impact'); }} />}</QueryState>
      {missingIndex && <p role="status">当前查询未找到已保存索引或对应记录。请核查所选项目；尚未建立索引时，可明确选择下方建立动作。</p>}
      {staleIndex && <p role="alert">当前索引与查询范围、项目权限或工作树快照不一致。请核对后同步或重建索引，再重新读取。</p>}
      <button className="ac-button secondary compact" type="button" disabled={query.loading} onClick={query.retry}>重新读取已提交查询</button></section>}
    <fieldset className={styles.fields} disabled={busy || !mayMaintain || command.uncertain}><legend>明确维护当前项目索引</legend><p>维护使用上方当前填写的用途、路径和预算。请先读取并核查当前权限及索引状态，再选择维护动作。</p>
      <div className={styles.actions}><button className="ac-button secondary" type="button" onClick={() => maintain('index')}>建立代码索引</button><button className="ac-button secondary" type="button" onClick={() => maintain('sync')}>同步代码索引</button><button className="ac-button secondary" type="button" onClick={() => maintain('rebuild')}>重建代码索引</button><button className="ac-button secondary" type="button" onClick={() => maintain('map')}>刷新仓库说明</button></div>
    </fieldset>
    <CommandState {...command} />{command.uncertain && <p role="alert">维护结果未知，本页已保留操作锁。关闭、重新打开或刷新后仍禁止再次维护；请人工核查原服务与保存结果。读取查询继续独立进行。</p>}
    {command.result && <section aria-label="已保存的索引结果"><h4>已保存的索引结果</h4><RepositoryIndexView index={command.result.repository_context} /></section>}
  </>;
}
