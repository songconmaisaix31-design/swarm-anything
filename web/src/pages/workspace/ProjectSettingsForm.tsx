import { useState } from 'react';
import type { components } from '../../api/schema';
import { workspaceApi as localProjectsApi } from '../../api/workspace';
import { useCommand } from '../../hooks/useCommand';
import type { ReadApiState } from '../../hooks/useReadState';
import { CommandState } from '../../components/CommandState';
import { SelectField, TextField } from '../../components/FormControls';
import { allowedModelCLIs, selectDefaultModelCLI } from './modelCLIPermission';
import styles from '../../components/FormControls.module.css';

const lines = (text: string) => text.split('\n').map(line => line.trim()).filter(Boolean);

const actions = { discover: '发现会话', read_context: '读取上下文', start: '启动', resume: '原生接续', send: '发送输入', stop: '停止', observe: '观察与日志', reconcile: '核对结果' };
export function ProjectSettingsForm({ project, agents, disabled, onChanged, swaOnly = false, knownAgents = [] }: { project: components['schemas']['LocalProjectV1']; agents?: ReadApiState<components['schemas']['LocalAgentListV1']>; disabled: boolean; onChanged: () => void; swaOnly?: boolean; knownAgents?: string[] }) {
  const [settings, setSettings] = useState(project.settings);
  const [subdirs, setSubdirs] = useState(project.settings.allowed_subdirs.join('\n'));
  const [historyCLI, setHistoryCLI] = useState('');
  const [historyRoot, setHistoryRoot] = useState('');
  const [newCLI, setNewCLI] = useState('');
  const command = useCommand(disabled || settings.revision !== project.settings.revision);
  const changed = settings.revision !== project.settings.revision;
  const permitted = allowedModelCLIs(settings);
  const cliOptions = [...new Map([...(agents?.data?.items ?? []).map(agent => [agent.id, { value: agent.id, label: agent.display_name }] as const), ...[...knownAgents, ...permitted].map(id => [id, { value: id, label: id }] as const)]).values()];
  return <details><summary>项目小权限与模型处理许可</summary><form className={styles.form} onSubmit={event => {
    event.preventDefault(); const request = command.prepare({ expected_version: project.settings.revision, expected_revision: settings.revision, settings: { ...settings, allowed_subdirs: lines(subdirs) } });
    void command.run(() => localProjectsApi.setSettings(project.id, request.body, request.key), result => { setSettings(result.project.settings); setSubdirs(result.project.settings.allowed_subdirs.join('\n')); onChanged(); }, '已保存项目许可；既有会话继续输入前将重新核对权限');
  }}>
    <p className={styles.note}>{swaOnly ? '批准明确项目目录、Agent 与动作；保存设置后，每次任务提交仍按实际能力和当前权限核查。' : 'A 默认只读主动纳入的固定版本资料。B 和 C 独立选择；本机 CLI 不代表模型在本机，处理许可仅覆盖此项目与所选客户端。'}</p>
    {changed && <p role="status">权限已被更新，当前输入保留。<button type="button" className="ac-button secondary compact" onClick={() => { setSettings(project.settings); setSubdirs(project.settings.allowed_subdirs.join('\n')); }}>载入最新项目权限</button></p>}
    <fieldset disabled={disabled || command.pending || changed}><legend>由你批准的项目范围</legend>
      {!swaOnly && <label><input type="checkbox" style={{ width: 'auto' }} checked disabled /> A：主动纳入资料（固定版本）</label>}
      <label><input type="checkbox" style={{ width: 'auto' }} checked={settings.allow_directory} onChange={event => setSettings({ ...settings, allow_directory: event.target.checked })} /> B：允许读取明确目录 / 文件</label>
      {settings.allow_directory && <TextField label="允许的项目子目录 / 文件（每行一项）" value={subdirs} onChange={setSubdirs} multiline hint="填写项目内相对路径；目录许可不会自动读取全部文件。" />}
      {!swaOnly && <label><input type="checkbox" style={{ width: 'auto' }} checked={settings.expand_references} onChange={event => setSettings({ ...settings, expand_references: event.target.checked })} /> C：允许展开获准资料的引用</label>}
      <SelectField label="默认模型 CLI" value={settings.external_model_cli} onChange={value => setSettings(selectDefaultModelCLI(settings, value))} options={[{ value: '', label: '撤销全部模型处理许可' }, ...permitted.map(id => ({ value: id, label: id }))]} />
      <fieldset><legend>允许此项目使用的模型 CLI</legend>
        {cliOptions.map(option => <label key={option.value}><input type="checkbox" style={{ width: 'auto' }} checked={permitted.includes(option.value)} disabled={option.value === settings.external_model_cli} onChange={event => setSettings(event.target.checked ? settings.external_model_cli ? { ...settings, external_model_clis: [...permitted, option.value] } : selectDefaultModelCLI(settings, option.value) : { ...settings, external_model_clis: permitted.filter(id => id !== option.value) })} /> {option.label}{option.value === settings.external_model_cli && '（默认）'}</label>)}
        <TextField label="添加明确的 CLI 标识" value={newCLI} onChange={setNewCLI} hint="例如 codex、claude、pi 或 opencode。添加只表达许可；保存时服务仍核对注册与权限，运行时核查实际能力。" />
        <button type="button" className="ac-button secondary compact" disabled={!newCLI.trim() || permitted.includes(newCLI.trim())} onClick={() => { const cli = newCLI.trim(); setSettings(settings.external_model_cli ? { ...settings, external_model_clis: [...permitted, cli] } : selectDefaultModelCLI(settings, cli)); setNewCLI(''); }}>加入许可列表</button>
        <p className={styles.note}>首次添加的 CLI 作为默认。默认只能从已许可列表选择；要移除默认，请先选择另一个默认，或撤销全部许可。</p>
        {swaOnly && <p className={styles.note}>{knownAgents.length ? `本项目能力查询实际返回：${knownAgents.join('、')}` : '当前未取得能力清单；已保存的许可保留，也可填写明确 CLI。'}</p>}
      </fieldset>
      {!swaOnly && <fieldset><legend>明确允许读取的客户端历史</legend><SelectField label="历史客户端" value={historyCLI} onChange={setHistoryCLI} options={[{ value: '', label: '选择客户端…' }, ...cliOptions]} /><TextField label="允许读取的历史绝对目录" value={historyRoot} onChange={setHistoryRoot} hint="仅用于查找属于此项目的会话；不推导全局历史目录，不扫描磁盘。" /><button className="ac-button secondary compact" type="button" disabled={!historyCLI || !historyRoot.trim()} onClick={() => { setSettings({ ...settings, history_roots: { ...settings.history_roots, [historyCLI]: historyRoot.trim() } }); setHistoryRoot(''); }}>加入此项目的历史读取范围</button>{!settings.history_roots && <p>服务未提供历史读取范围，当前不允许发现历史。</p>}{Object.entries(settings.history_roots ?? {}).map(([historyClient, path]) => <p key={historyClient}>{historyClient} · {path}<button className="ac-button secondary compact" type="button" onClick={() => { const next = { ...settings.history_roots }; delete next[historyClient]; setSettings({ ...settings, history_roots: next }); }}>移除此历史范围</button></p>)}</fieldset>}
      <p className={styles.note}>保存此选择允许所选 CLI 按既有配置处理你选择的项目上下文，可能发送至其外部模型。安装、配置、可启动和原生能力仍须独立核实。</p>
      <fieldset><legend>允许的原生操作</legend>{Object.entries(actions).filter(([action]) => !swaOnly || ['start', 'send', 'stop', 'observe'].includes(action)).map(([action, label]) => <label key={action}><input type="checkbox" style={{ width: 'auto' }} checked={settings.allowed_actions.includes(action)} onChange={event => setSettings({ ...settings, allowed_actions: event.target.checked ? [...settings.allowed_actions, action] : settings.allowed_actions.filter(value => value !== action) })} /> {label}</label>)}</fieldset>
      <label><input type="checkbox" style={{ width: 'auto' }} checked={settings.allow_agent_control} onChange={event => setSettings({ ...settings, allow_agent_control: event.target.checked })} /> 允许此项目的 Agent 控制操作</label>
      <p className={styles.note}>此开关只允许服务按本项目的动作、目录和模型许可继续核查，不会签发 Agent Grant、启动 Worker 或调用模型。其他任务主体的授权不会被继承；客户端工具范围未获支持时不会开放命令或文件工具。</p>
    </fieldset><CommandState {...command} /><button className="ac-button" type="submit" disabled={disabled || command.pending || changed}>保存此项目许可</button>
  </form></details>;
}
