import { useState } from 'react';
import type { components } from '../../api/schema';
import { workspaceApi as localProjectsApi } from '../../api/workspace';
import { useCommand } from '../../hooks/useCommand';
import { CommandState } from '../../components/CommandState';
import { TextField } from '../../components/FormControls';
import styles from '../../components/FormControls.module.css';

const actions = { discover: '发现项目会话', read_context: '读取已纳入上下文', observe: '观察状态', start: '启动', resume: '原生接续', send: '发送输入', stop: '停止' };
export function ProjectAgentAccess({ project, disabled, swaOnly = false }: { project: components['schemas']['LocalProjectV1']; disabled: boolean; swaOnly?: boolean }) {
  const [agentID, setAgentID] = useState('');
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [grantedID, setGrantedID] = useState('');
  const [credential, setCredential] = useState<components['schemas']['ProjectAgentTokenV1'] | null>(null);
  const command = useCommand(disabled);
  return <details><summary>由你授权的项目 Agent 身份</summary><div className={styles.form}><p className={styles.note}>此身份只能访问你批准的项目和动作。启动与输入仍由服务核查当前项目权限和实际 Agent 能力。</p>
    <fieldset disabled={disabled || command.pending}><legend>项目内独立授权</legend><TextField label="被授权 Agent 身份" value={agentID} onChange={value => { setAgentID(value); setCredential(null); }} required />{Object.entries(actions).filter(([action]) => !swaOnly || ['start', 'send', 'stop', 'observe'].includes(action)).map(([action, label]) => <label key={action}><input type="checkbox" style={{ width: 'auto' }} checked={selectedActions.includes(action)} onChange={event => setSelectedActions(event.target.checked ? [...selectedActions, action] : selectedActions.filter(value => value !== action))} /> {label}</label>)}
      <button className="ac-button secondary compact" type="button" disabled={!agentID.trim() || !selectedActions.length} onClick={() => { const request = command.prepare({ expected_version: project.settings.revision, agent_id: agentID.trim(), actions: selectedActions }); void command.run(() => localProjectsApi.grantAgent(project.id, request.body, request.key), result => { setGrantedID(result.grant.agent_id); setCredential(null); }, '已保存你指定的项目动作授权；不会自动启动 Agent'); }}>保存此身份的动作授权</button>
      <button className="ac-button secondary compact" type="button" disabled={!agentID.trim()} onClick={() => { const request = command.prepare({ expected_version: project.settings.revision, agent_id: agentID.trim() }); void command.run(() => localProjectsApi.revokeAgent(project.id, request.body, request.key), () => { setGrantedID(''); setCredential(null); }, '已撤销此项目身份许可；后续受保护请求会被拒绝'); }}>撤销此项目身份许可</button>
      <button className="ac-button secondary compact" type="button" disabled={!grantedID || grantedID !== agentID.trim()} onClick={() => { const request = command.prepare({ expected_version: project.settings.revision, agent_id: grantedID }); void command.run(() => localProjectsApi.issueAgentToken(project.id, request.body, request.key), result => setCredential(result.credential), '已生成此项目身份的临时凭据；请妥善交付给对应客户端'); }}>生成此身份的临时凭据</button>
    </fieldset>{credential && <div><p>临时凭据仅在当前页面显示，关闭后不保留。请勿放入项目文件、日志或截图。</p><label>此项目临时凭据<input aria-label="此项目临时凭据" type="password" readOnly value={credential.token} autoComplete="off" /></label><p>有效期至 {credential.expires_at}</p><button className="ac-button secondary compact" type="button" onClick={() => setCredential(null)}>隐藏并清除页面凭据</button></div>}<CommandState {...command} /></div></details>;
}
