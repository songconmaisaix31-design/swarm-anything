import { useId, useState } from 'react';
import styles from './SwaWorkspace.module.css';

type Prompt = { id: string; title: string; text: string };
const maxPrompts = 50, maxTitle = 120, maxBytes = 32000;
const byteCount = (text: string) => new TextEncoder().encode(text).length;
const storageKey = (projectID: string) => `swa:prompt-library:v1:${projectID}`;

function isPrompt(value: unknown): value is Prompt {
  if (!value || typeof value !== 'object') return false;
  const { id, title, text } = value as Partial<Prompt>;
  return typeof id === 'string' && !!id && typeof title === 'string' && !!title.trim() && title.length <= maxTitle && typeof text === 'string' && !!text.trim() && byteCount(text) <= maxBytes;
}

function readPrompts(projectID: string): Prompt[] {
  const raw = localStorage.getItem(storageKey(projectID));
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || data.length > maxPrompts || !data.every(isPrompt) || new Set(data.map(item => item.id)).size !== data.length) throw new Error('Invalid prompt library');
  return data;
}

export function SwaPromptLibrary({ projectID, onDownload }: { projectID: string; onDownload: (name: string, text: string, type: string) => void }) {
  const formID = useId();
  const [prompts, setPrompts] = useState(() => { try { return readPrompts(projectID); } catch { return null; } });
  const [templateID, setTemplateID] = useState('');
  const [title, setTitle] = useState(''), [text, setText] = useState('');
  const [output, setOutput] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const selected = prompts?.find(item => item.id === templateID);
  const validText = (value: string) => !!value.trim() && byteCount(value) <= maxBytes;

  function select(id: string) {
    const prompt = prompts?.find(item => item.id === id);
    setTemplateID(prompt?.id ?? ''); setTitle(prompt?.title ?? ''); setText(prompt?.text ?? ''); setConfirmDelete(false); setStatus(null);
  }
  function update(operation: 'save' | 'delete') {
    if (!prompts || operation === 'delete' && !selected || operation === 'save' && (!title.trim() || title.length > maxTitle || !validText(text))) return;
    try {
      const latest = readPrompts(projectID);
      if (JSON.stringify(latest) !== JSON.stringify(prompts)) {
        setStatus({ error: true, text: '模板已在另一个页面更改。请重新读取模板后再保存；当前草稿仍保留。' });
        return;
      }
      const id = selected?.id ?? crypto.randomUUID();
      const next = latest.filter(item => item.id !== id);
      if (operation === 'save') next.unshift({ id, title: title.trim(), text });
      if (next.length > maxPrompts) { setStatus({ error: true, text: `同一项目最多保存 ${maxPrompts} 个模板。` }); return; }
      localStorage.setItem(storageKey(projectID), JSON.stringify(next));
      setPrompts(next);
      if (operation === 'delete') select(''); else setTemplateID(id);
      setStatus({ error: false, text: operation === 'save' ? '提示词模板已保存。' : '提示词模板已删除。' });
    } catch { setStatus({ error: true, text: '未能写入浏览器存储。草稿仍保留，可以下载本次输入。' }); }
  }

  return <details className={styles.promptLibrary}>
    <summary>可复用提示词</summary>
    <div className={styles.workspace}>
      <p className={styles.note}>模板仅保存在此设备的浏览器中，按项目隔开。套用后可单独修改本次输入。</p>
      {prompts === null && <p role="alert">未能读取本项目的模板。可继续编辑并下载本次输入。</p>}
      <div className={styles.form}>
        <label><span id={`${formID}-saved`}>已保存的提示词</span><select aria-labelledby={`${formID}-saved`} value={selected?.id ?? ''} onChange={event => select(event.target.value)}><option value="">新建模板</option>{prompts?.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label>模板名称<input value={title} maxLength={maxTitle} onChange={event => setTitle(event.target.value)} /></label>
        <button type="button" className="ac-button secondary compact" onClick={() => {
          try { setPrompts(readPrompts(projectID)); setConfirmDelete(false); setStatus({ error: false, text: '已重新读取模板。' }); }
          catch { setStatus({ error: true, text: '未能读取模板，当前草稿仍保留。' }); }
        }}>重新读取模板</button>
      </div>
      <label className={styles.promptText}><span id={`${formID}-body`}>提示词正文</span><textarea aria-labelledby={`${formID}-body`} rows={6} value={text} onChange={event => setText(event.target.value)} /></label>
      <div className={styles.form}>
        <button type="button" className="ac-button secondary compact" disabled={!prompts || !title.trim() || !validText(text)} onClick={() => update('save')}>{selected ? '保存模板修改' : '保存为提示词模板'}</button>
        <button type="button" className="ac-button compact" disabled={!validText(text)} onClick={() => setOutput(text)}>套用到本次输入</button>
        {selected && !confirmDelete && <button type="button" className="ac-button secondary compact" onClick={() => setConfirmDelete(true)}>删除模板…</button>}
        {confirmDelete && selected && <><button type="button" className="ac-button secondary compact" onClick={() => update('delete')}>确认删除 {selected.title}</button><button type="button" className="ac-button secondary compact" onClick={() => setConfirmDelete(false)}>取消</button></>}
      </div>
      {status && <p role={status.error ? 'alert' : 'status'}>{status.text}</p>}
      {output !== null && <div className={styles.workspace}>
        <label className={styles.promptText}><span id={`${formID}-preview`}>本次输入预览</span><textarea aria-labelledby={`${formID}-preview`} rows={6} value={output} onChange={event => setOutput(event.target.value)} /></label>
        <p className={styles.note}>{byteCount(output)}/{maxBytes} UTF-8 字节。下载后把文件放到执行服务机器上的项目许可目录，在下方选择其路径并提交。套用和下载都不会启动任务。</p>
        <div><button type="button" className="ac-button secondary compact" disabled={!validText(output)} onClick={() => onDownload('swa-prompt.md', output, 'text/plain')}>下载本次输入</button></div>
      </div>}
    </div>
  </details>;
}
