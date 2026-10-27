import { useState } from 'react';
import { useProjectSpaces } from '../../hooks/useAttention';
import { attentionApi } from '../../api/client';
import { useCommand } from '../../hooks/useCommand';
import { SectionCard } from '../../components/SectionCard';
import { QueryState } from '../../components/QueryState';
import { CommandState } from '../../components/CommandState';
import { TextField } from '../../components/FormControls';
import { GitHubRepositoriesPanel } from '../workspace/GitHubRepositoriesPanel';
import { matchesQuery } from '../../utils/search';
import styles from '../../components/FormControls.module.css';

export function DevelopmentSpacePanel({ query }: { query: string }) {
  const spaces = useProjectSpaces();
  const [spaceToken, setSpaceToken] = useState(0);
  const [title, setTitle] = useState('');
  const command = useCommand(spaces.loading || spaces.stale || !spaces.data);
  return <><SectionCard title="顶层开发空间" tabs={['overview']} padded>
    <div className="ac-space-intro"><span className="ac-overline">DEVELOPMENT SPACE</span><h2>给准备动手的项目一个位置。</h2><p>先创建或选择空间，再把已同步的 GitHub 仓库主动纳入。资料引用保留原分类，项目权限单独设置。</p></div>
    <>
      <QueryState state={spaces} empty={data => !data.items.length} emptyTitle="暂无开发空间">{data => <ul className="ac-space-list">{data.items.filter(space => matchesQuery(query, [space.title])).map(space => <li key={space.id}><h3>{space.title}</h3><p>主动纳入资料 · {space.material_refs.length}</p><small>空间 ID · {space.id}</small></li>)}</ul>}</QueryState>
      <details><summary>创建开发空间</summary><form className={styles.form} onSubmit={event => { event.preventDefault(); const request = command.prepare({ expected_version: 1, title: title.trim() }); void command.run(() => attentionApi.createProjectSpace(request.body, request.key), () => { spaces.retry(); setSpaceToken(value => value + 1); setTitle(''); }, '已创建顶层开发空间；未启动 Agent 或 Mission'); }}><TextField label="开发空间名称" value={title} onChange={setTitle} required disabled={command.pending} /><CommandState {...command} /><button className="ac-button" type="submit" disabled={command.pending || spaces.loading || spaces.stale || !spaces.data}>创建开发空间</button></form></details>
    </>
  </SectionCard><GitHubRepositoriesPanel key={spaceToken} query={query} placement onChanged={spaces.retry} /></>;
}
