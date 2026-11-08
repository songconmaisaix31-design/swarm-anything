import { useState } from 'react';
import { swarmApi, type SwarmMission } from '../../../api/swarm';
import type { components } from '../../../api/schema';
import { usePersistentCommand } from '../../../hooks/usePersistentCommand';
import { CommandState } from '../../../components/CommandState';
import { TextField } from '../../../components/FormControls';
import { commandError } from '../../../utils/commandError';
import { WorkItemFields, type WorkItemDraft } from './WorkItemFields';
import styles from './MissionWorkspace.module.css';

function lines(value: string) { return value.split('\n').map(line => line.trim()).filter(Boolean); }

export function WorkItemEditor({ mission, disabled, onChanged }: { mission: SwarmMission; disabled: boolean; onChanged: () => void }) {
  const [draft, setDraft] = useState<WorkItemDraft>({ title: '', inputs: [], dependencies: '', writePaths: '' });
  const [capabilities, setCapabilities] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const [checkedVersion, setCheckedVersion] = useState(mission.version);
  const command = usePersistentCommand<components['schemas']['SwarmWorkItemEnvelopeV1']>(`swarm:${mission.id}:add-work-item`, () => ({ status: 'succeeded', message: '工作项已保存' }), { failureMessage: cause => commandError(cause).message });
  const blocked = disabled || command.pending || command.uncertain;
  const changed = checkedVersion !== mission.version;
  return <section aria-label="添加任务工作项"><h4>添加工作项</h4>
    <p>任务当前版本 v{mission.version}，填写内容按 v{checkedVersion} 保存。固定输入必须属于批准快照。</p>
    <details><summary>查看批准的固定输入与允许路径</summary><ul>{mission.grant.inputs?.map(input => <li key={`${input.id}@${input.revision}`}><code>{input.id}</code> · {input.revision}</li>)}</ul><p>{mission.grant.write_paths?.join('；') || '无允许修改路径'}</p></details>
    {changed && <p role="alert">任务版本已变化，当前输入已保留。<button type="button" className="ac-button secondary compact" disabled={blocked} onClick={() => setCheckedVersion(mission.version)}>已核对当前任务 v{mission.version}</button></p>}
    <form onSubmit={event => {
      event.preventDefault();
      if (blocked || changed) return;
      const inputs = draft.inputs.map(input => ({ id: input.id.trim(), revision: input.revision.trim() }));
      if (!draft.title.trim() || !inputs.length || inputs.some(input => !input.id || !input.revision) || !lines(draft.writePaths).length) { setValidation('请填写标题、至少一个固定输入版本及允许修改路径。'); return; }
      setValidation(null);
      void command.run(key => swarmApi.addWorkItem(mission.id, { schema_version: 1, request_id: key, expected_version: checkedVersion, title: draft.title.trim(), inputs, dependencies: lines(draft.dependencies), write_paths: lines(draft.writePaths), required_capabilities: lines(capabilities), artifact_inputs: [] }, key), (_, outcome) => { if (outcome.status === 'succeeded') { setDraft({ title: '', inputs: [], dependencies: '', writePaths: '' }); setCapabilities(''); onChanged(); } });
    }}>
      <WorkItemFields draft={draft} onChange={setDraft} disabled={blocked} />
      <fieldset className={styles.fields} disabled={blocked}><legend>执行能力</legend><TextField label="工作项所需能力" value={capabilities} onChange={setCapabilities} multiline hint="每行一个实际能力名称；认领时由服务核对。" /><button className="ac-button" type="submit" disabled={changed}>保存工作项</button></fieldset>
    </form>
    {validation && <p role="alert">{validation}</p>}<CommandState {...command} />
    {command.uncertain && <p role="alert">工作项请求 {command.operationID} 的结果未知，当前作用域保持锁定；读取任务详情不会自动重发。</p>}
  </section>;
}
