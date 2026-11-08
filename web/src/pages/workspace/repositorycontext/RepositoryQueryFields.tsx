import { TextField } from '../../../components/FormControls';
import styles from './RepositoryContext.module.css';

export interface RepositoryQueryDraft {
  purpose: string;
  roots: string;
  query: string;
  symbolId: string;
  maxFiles: string;
  maxBytes: string;
  maxResults: string;
  maxDepth: string;
}

export function RepositoryQueryFields({ draft, onChange, disabled, mode }: { draft: RepositoryQueryDraft; onChange: (draft: RepositoryQueryDraft) => void; disabled: boolean; mode: 'map' | 'search' | 'impact' }) {
  const update = (field: keyof RepositoryQueryDraft) => (value: string) => onChange({ ...draft, [field]: value });
  return <fieldset className={styles.fields} disabled={disabled}>
    <legend>本次仓库上下文查询</legend>
    <TextField label="查询用途" value={draft.purpose} onChange={update('purpose')} required multiline hint="说明本次读取用于哪个目标或问题，最多 512 UTF-8 字节。" />
    <TextField label="查询项目相对路径" value={draft.roots} onChange={update('roots')} required multiline hint="每行一项已许可的项目相对文件或目录；使用 /，路径保持在当前项目中。" />
    {mode === 'search' && <TextField label="代码搜索内容" value={draft.query} onChange={update('query')} required />}
    {mode === 'impact' && <TextField label="待查影响的符号 ID" value={draft.symbolId} onChange={update('symbolId')} required hint="从当前真实搜索结果中选择符号。" />}
    <div className={styles.budgets}>
      <TextField label="最多读取文件数" value={draft.maxFiles} onChange={update('maxFiles')} required type="number" numberRange={{ min: 1, max: 20000, step: '1' }} />
      <TextField label="最多读取字节数" value={draft.maxBytes} onChange={update('maxBytes')} required type="number" numberRange={{ min: 1, max: 134217728, step: '1' }} />
      <TextField label="最多返回结果数" value={draft.maxResults} onChange={update('maxResults')} required type="number" numberRange={{ min: 1, max: 200, step: '1' }} />
      <TextField label="关系展开深度" value={draft.maxDepth} onChange={update('maxDepth')} required type="number" numberRange={{ min: 1, max: 5, step: '1' }} />
    </div>
    <p>查询返回实际快照、覆盖范围和缺口。语义后端或动态关系未覆盖时，保留服务提供的明确状态。</p>
  </fieldset>;
}
