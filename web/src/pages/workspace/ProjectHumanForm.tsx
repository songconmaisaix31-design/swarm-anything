import { useId, useState } from 'react';
import { TextField } from '../../components/FormControls';
import formStyles from '../../components/FormControls.module.css';

export interface ProjectHumanFields { notes: string; review: string; group: string; intent: string; archived: boolean; revision: number }
export function ProjectHumanForm({ human, disabled, onSave }: { human: ProjectHumanFields; disabled: boolean; onSave: (fields: ProjectHumanFields, acceptSaved: (saved: ProjectHumanFields) => void) => void }) {
  const [draft, setDraft] = useState(human);
  const suggestionsID = useId();
  const changed = draft.revision < human.revision;
  return <form className={formStyles.form} onSubmit={event => { event.preventDefault(); onSave(draft, setDraft); }}>
    <p className={formStyles.note}>记录你希望继续的方向；实际活动与完成度单独显示。归档可恢复，不删除目录、资料或会话。</p>
    {changed && <div role="status">记录已有更新，当前输入保留。<button className="ac-button secondary compact" type="button" onClick={() => setDraft(human)}>载入最新人工记录</button></div>}
    <fieldset disabled={disabled || changed}><legend>下一步与人工记录</legend>
      <TextField label="备注 / 下一步" value={draft.notes} onChange={notes => setDraft({ ...draft, notes })} multiline hint="写下下一次打开项目时要做的事。" />
      <TextField label="复盘" value={draft.review} onChange={review => setDraft({ ...draft, review })} multiline />
      <TextField label="项目分组名称" value={draft.group} onChange={group => setDraft({ ...draft, group })} />
      <label>我对项目的继续意愿<input aria-label="我对项目的继续意愿" aria-describedby={`${suggestionsID}-hint`} list={suggestionsID} value={draft.intent} onChange={event => setDraft({ ...draft, intent: event.target.value })} placeholder="用自己的话描述，或选择建议" /><datalist id={suggestionsID}><option value="想继续做" /><option value="暂时搁置" /><option value="已经收尾" /></datalist><small id={`${suggestionsID}-hint`}>这是你的意愿记录，不会转换为完成度或启动 Agent。</small></label>
      <label><input type="checkbox" style={{ width: 'auto' }} checked={draft.archived} onChange={event => setDraft({ ...draft, archived: event.target.checked })} /> 归档此项目（可取消并保存恢复）</label>
    </fieldset>
    <button className="ac-button" type="submit" disabled={disabled || changed}>保存项目记录</button>
  </form>;
}
