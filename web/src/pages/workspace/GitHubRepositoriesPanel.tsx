import { useState } from 'react';
import { githubRepositoriesApi } from '../../api/s1';
import { useReadApi } from '../../hooks/useReadApi';
import { useProjectSpaces } from '../../hooks/useAttention';
import { useCommand } from '../../hooks/useCommand';
import { SectionCard } from '../../components/SectionCard';
import { QueryState } from '../../components/QueryState';
import { CommandState } from '../../components/CommandState';
import { BrandIcon } from '../../components/BrandIcon';
import { navigate } from '../../router';
import { TextField, SelectField } from '../../components/FormControls';
import { matchesQuery } from '../../utils/search';
import { formatDateTime } from '../../utils/format';
import type { components } from '../../api/schema';
import styles from './LocalProjectsPanel.module.css';
import formStyles from '../../components/FormControls.module.css';

type Repository = components['schemas']['GitHubRepositoryV1'];
const cloneLabels: Record<string, string> = { not_placed: '仅保存仓库信息', cloning: '正在克隆', ready: '代码已克隆', failed: '克隆失败', interrupted: '克隆中断，等待人工核对', unknown: '克隆结果未知' };

export function GitHubRepositoriesPanel({ query, placement = false, onChanged }: { query: string; placement?: boolean; onChanged?: () => void }) {
  const repositories = useReadApi(signal => githubRepositoriesApi.list({ signal }));
  const spaces = useProjectSpaces(placement);
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState('');
  const command = useCommand(repositories.loading || repositories.stale || !repositories.data);
  const rows = (repositories.data?.items ?? []).filter(repo => matchesQuery(query, [repo.metadata.full_name, repo.metadata.description, repo.metadata.language]));
  return <SectionCard title={placement ? 'GitHub 仓库纳入开发空间' : 'GitHub 仓库信息'} tabs={['overview']} padded>
    <div className="ac-connect-card"><BrandIcon name="github" size={36} /><div><h3>{placement ? '由你决定何时获取代码' : '先收集仓库信息'}</h3><p>{placement ? '选择一个项目顶层空间，明确纳入后才由固定程序克隆。' : '输入公开账号或仓库；同步信息不会下载代码。'}</p></div></div>
    <>
      {!placement && <form className={formStyles.form} onSubmit={event => { event.preventDefault(); const request = command.prepare({ expected_version: 1, input: input.trim() }); void command.run(() => githubRepositoriesApi.sync(request.body, request.key), () => { repositories.retry(); onChanged?.(); }, '已同步公开仓库信息；代码尚未克隆'); }}>
        <TextField label="公开 GitHub 账号或仓库" value={input} onChange={setInput} required hint="填写账号、owner/repository 或 GitHub 公开链接。私有范围尚未决定，不读取凭据。" disabled={command.pending} />
        <div className={formStyles.actions}><button className="ac-button" type="submit" disabled={command.pending || repositories.loading || repositories.stale || !repositories.data || !input.trim()}>同步仓库信息</button><button className="ac-button secondary" type="button" onClick={() => navigate('/swarm')}>去蜂群空间纳入代码</button></div>
      </form>}
      <CommandState {...command} />
      <button className="ac-button secondary compact" type="button" disabled={repositories.loading || command.pending} onClick={() => { repositories.retry(); if (placement) spaces.retry(); }}>重载仓库记录</button>
      <QueryState state={repositories} empty={() => !rows.length} emptyTitle={repositories.data?.items.length ? '没有匹配的仓库' : '暂无已同步仓库'}>{data => <>
        <p className={styles.note}>当前已加载 {data.items.length} 个仓库。{data.next_cursor ? '还有未加载仓库，当前清单不覆盖全部。' : '账号同步按一次最多100个公开仓库读取，不代表账号全量。'}</p>
        <ul className={styles.cards}>{rows.map(repo => <li key={repo.id} className={styles.card}>
          <h3 className="ac-brand-heading"><BrandIcon name="github" size={22} />{repo.metadata.full_name}</h3><p>{repo.metadata.unknown_fields?.includes('description') ? '来源简介未知' : repo.metadata.description || '来源未提供简介'}</p>
          <div className={styles.tags}><span>{repo.metadata.unknown_fields?.includes('language') ? '语言未知' : repo.metadata.language || '语言未提供'}</span><span>★ {repo.metadata.unknown_fields?.includes('stars') ? '未知' : repo.metadata.stars}</span><span>{cloneLabels[repo.clone_status] ?? `状态未知（${repo.clone_status || '未提供'}）`}</span>{!repo.metadata.unknown_fields?.includes('archived') && repo.metadata.archived && <span>已归档</span>}{repo.metadata.fork && <span>Fork</span>}</div>
          <p>同步时间 · {repo.synced_at ? formatDateTime(repo.synced_at) : '未提供'}</p>
          <button className="ac-button secondary compact" type="button" onClick={() => setSelected(selected === repo.id ? '' : repo.id)}>{selected === repo.id ? '收起仓库详情' : placement ? '选择空间并纳入' : '查看仓库详情'}</button>
          {selected === repo.id && <><RepositoryFacts repository={repo} />{placement && <PlacementForm key={`${repo.id}:${repo.revision}`} repository={repo} spaces={spaces} disabled={repositories.loading || repositories.stale || command.pending} onPlaced={() => { repositories.retry(); onChanged?.(); }} />}</>}
        </li>)}</ul>
      </>}</QueryState>
    </>
  </SectionCard>;
}

function RepositoryFacts({ repository: repo }: { repository: Repository }) {
  const link = repo.metadata.html_url.startsWith('https://github.com/') ? repo.metadata.html_url : null;
  return <><p>默认分支 · {repo.metadata.unknown_fields?.includes('default_branch') ? '未知' : repo.metadata.default_branch || '未提供'} · 信息版本 {repo.metadata_revision}</p>{link && <a href={link} target="_blank" rel="noreferrer">在 GitHub 查看公开来源 ↗</a>}
    <p>纳入空间 · {repo.space_id || '尚未纳入'}</p><p>项目 · {repo.project_id || '尚未创建'}</p><p>本地代码目录</p><code className={styles.path}>{repo.root || '尚未克隆'}</code><p>实际 HEAD</p><code className={styles.path}>{repo.head || '尚未取得'}</code>
    {repo.last_error && <p role="alert">{repo.last_error}</p>}
    <details><summary>同步与克隆记录</summary><p>信息来源 · {repo.metadata.metadata_source === 'github_public_html' ? 'GitHub 公开页面，部分信息未知' : repo.metadata.metadata_source === 'github_rest' ? 'GitHub 公开接口' : '来源未记录'}</p><p>同步状态 · {repo.sync_status || '未知'} · 记录版本 {repo.revision}</p><p>克隆尝试 · {repo.clone_attempts}</p><p>最近推送 · {repo.metadata.unknown_fields?.includes('pushed_at') ? '未知' : repo.metadata.pushed_at ? formatDateTime(repo.metadata.pushed_at) : '未提供'}</p></details>
  </>;
}

export function PlacementForm({ repository: repo, spaces, disabled, onPlaced }: { repository: Repository; spaces: ReturnType<typeof useProjectSpaces>; disabled: boolean; onPlaced: () => void }) {
  const [spaceID, setSpaceID] = useState(repo.space_id);
  const command = useCommand(disabled || spaces.loading || spaces.stale || !spaces.data);
  const supported = ['not_placed', 'failed', 'interrupted', 'cloning'].includes(repo.clone_status);
  return <form className={formStyles.form} onSubmit={event => { event.preventDefault(); if (!supported || !spaceID) return; const request = command.prepare({ expected_version: repo.revision, space_id: spaceID }); void command.run(() => githubRepositoriesApi.place(repo.id, request.body, request.key), onPlaced, '已保存纳入结果；请核对实际目录、HEAD 与克隆状态'); }}>
    <QueryState state={spaces}>{data => <SelectField label={`为 ${repo.metadata.full_name} 选择开发空间`} value={spaceID} onChange={setSpaceID} disabled={command.pending || !!repo.space_id} options={[{ value: '', label: '选择一个项目顶层空间…' }, ...data.items.map(space => ({ value: space.id, label: space.title }))]} />}</QueryState>
    <p className={styles.note}>纳入后才获取代码。项目保持 A 默认，B/C、模型和动作许可分别设置；不会启动 Agent 或任务。</p><CommandState {...command} />
    <button className="ac-button" type="submit" disabled={disabled || command.pending || !supported || !spaceID || spaces.loading || spaces.stale || !spaces.data}>{repo.clone_status === 'ready' ? '已纳入并克隆' : repo.clone_status === 'unknown' ? '结果未知，请先核对原操作' : repo.clone_status === 'cloning' ? '核对并恢复此空间克隆' : ['failed', 'interrupted'].includes(repo.clone_status) ? '人工重试此空间的克隆' : '纳入所选空间并克隆代码'}</button>
  </form>;
}
