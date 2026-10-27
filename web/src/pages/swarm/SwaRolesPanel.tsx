import { useEffect, useRef, useState } from 'react';
import type { components } from '../../api/schema';
import { swaApi, type SwaCommand, type SwaEnvelope } from '../../api/swa';
import { QueryState } from '../../components/QueryState';
import { usePersistentCommand } from '../../hooks/usePersistentCommand';
import { formatError, useReadApi } from '../../hooks/useReadState';
import { collaborationFailure, collaborationOutcome, collaborationPermission, explicitReferences, readSwaConversation, readSwaConversations, readSwaRole, readSwaRoles, recoverCollaborationReply, type CollaborationRequest, type RoleDefinition, type SwaRole } from './swaRoles';
import styles from './SwaRoles.module.css';

type Project = components['schemas']['LocalProjectV1'];
export type SelectedSwaRole = Pick<SwaRole, 'id' | 'revision' | 'default_agent' | 'default_model' | 'question_mode'>;
interface Props { project: Project; disabled: boolean; onRoleSelected?: (role: SelectedSwaRole) => void; onConversationSelected?: (id: string) => void }

export function SwaRoles({ project, disabled, onRoleSelected, onConversationSelected }: Props) {
  const canObserve = collaborationPermission(project.settings, 'observe', disabled);
  const roles = useReadApi(async signal => readSwaRoles(await swaApi.command(project.id, { action: 'role.list' }, signal), project.id), { enabled: canObserve, key: `${project.id}:${project.settings.revision}` });
  const [selectedID, setSelectedID] = useState('');
  const selected = roles.data?.find(item => item.id === selectedID);
  const fresh = !!roles.data && !roles.loading && !roles.stale && !roles.error;
  const canEdit = collaborationPermission(project.settings, 'start', disabled || !fresh);
  function choose(role: SwaRole) { setSelectedID(role.id); if (!role.archived) onRoleSelected?.(role); }
  return <details className={styles.workspace}><summary>可复用角色与讨论</summary>
    <p className={styles.note}>角色保存职责、默认 Agent 与知识引用；讨论保存你的要求。Worker 在任务执行时单独启动，退出后仍可复用角色和讨论。</p>
    {!canObserve ? <p role="status">当前项目未允许观察角色与讨论，请刷新项目权限或在项目设置中调整。</p> : <>
      <div className={styles.actions}><button className="ac-button secondary compact" type="button" disabled={roles.loading} onClick={roles.retry}>刷新角色</button><button className="ac-button compact" type="button" disabled={!canEdit} onClick={() => setSelectedID('')}>新建角色</button></div>
      <QueryState state={roles}>{items => <div className={styles.columns}>
        <ul className={styles.list} aria-label="项目角色">{items.map(item => <li key={item.id}><button className={styles.choice} type="button" aria-pressed={selectedID === item.id} disabled={!fresh} onClick={() => choose(item)}><strong>{item.name}</strong><span className={styles.meta}>{item.default_agent} · {item.default_model} · {item.question_mode === 'native' ? '原生问答' : '禁用工具'}</span><span className={styles.meta}>版本 {item.revision}{item.archived ? ' · 已归档' : ''}</span></button></li>)}</ul>
        {!selectedID || selected ? <RoleEditor key={selectedID || 'new'} project={project} role={selected} disabled={!canEdit} onSaved={role => { choose(role); roles.retry(); }} /> : <p role="status">所选角色不在当前列表中，请刷新角色。</p>}
      </div>}</QueryState>
      <ConversationWorkspace project={project} disabled={disabled} roles={fresh ? roles.data ?? [] : []} selectedRoleID={selected?.archived ? '' : selected?.id ?? ''} onSelected={onConversationSelected} />
    </>}
  </details>;
}

function useCollaborationCommand(projectID: string, expected: CollaborationRequest, canInspect: boolean) {
  const scope = `${projectID}:${expected.action}:${expected.roleID ?? expected.conversationID ?? 'new'}`;
  const command = usePersistentCommand<SwaEnvelope>(scope, response => collaborationOutcome(response, projectID, expected), { namespace: 'swa:collaboration:pending', failureMessage: formatError });
  const [querying, setQuerying] = useState(false), [queryError, setQueryError] = useState<string | null>(null);
  const active = useRef(false), queryBusy = useRef(false), queryAbort = useRef<AbortController | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; queryAbort.current?.abort(); }; }, []);
  function run(action: (requestID: string) => Promise<SwaEnvelope>, received: (reply: SwaEnvelope) => void) {
    return command.run(async requestID => {
      try { return await action(requestID); }
      catch (error) { return collaborationFailure(error, requestID); }
    }, (reply, outcome) => { if (outcome.status === 'succeeded') received(reply); });
  }
  async function inspect(onRecovered?: (reply: SwaEnvelope) => void) {
    if (!canInspect || !command.operationID || command.pending || queryBusy.current) return;
    queryBusy.current = true;
    setQuerying(true); setQueryError(null);
    const abort = new AbortController(); queryAbort.current = abort;
    try {
      const reply = await swaApi.command(projectID, { action: 'request.show', project_id: projectID, request_id: command.operationID }, abort.signal);
      if (!active.current || abort.signal.aborted) return;
      const restored = recoverCollaborationReply(reply, projectID, command.operationID, expected);
      if (restored) { command.reconcile(command.operationID, restored); onRecovered?.(restored); }
      else setQueryError('原请求仍未结算；保留原请求标识，稍后继续查询。');
    } catch (error) { if (active.current && !abort.signal.aborted) setQueryError(formatError(error)); }
    finally { queryBusy.current = false; if (active.current) setQuerying(false); }
  }
  return { ...command, querying, queryError, inspect, canInspect, run };
}

function CommandState({ command, recovered }: { command: ReturnType<typeof useCollaborationCommand>; recovered: (reply: SwaEnvelope) => void }) {
  return <div aria-live="polite">{command.pending && <p role="status">正在保存…</p>}{command.error && <p role="alert">{command.error}</p>}{command.notice && <p role="status">{command.notice}</p>}{command.queryError && <p role="alert">{command.queryError}</p>}{command.uncertain && <div><p className={styles.note}>原请求 {command.operationID} 的结果尚未确认。继续查询此请求后再提交新操作。</p><button className="ac-button secondary compact" type="button" disabled={!command.canInspect || command.pending || command.querying} onClick={() => { void command.inspect(recovered); }}>查询原请求</button></div>}</div>;
}

function RoleEditor({ project, role, disabled, onSaved }: { project: Project; role?: SwaRole; disabled: boolean; onSaved: (role: SwaRole) => void }) {
  const [fields, setFields] = useState<RoleDefinition>(() => role ? { name: role.name, responsibilities: role.responsibilities, default_agent: role.default_agent, default_model: role.default_model, question_mode: role.question_mode ?? 'disabled', skills: role.skills, knowledge: role.knowledge } : { name: '', responsibilities: '', default_agent: project.settings.external_model_cli, default_model: '', question_mode: 'disabled', skills: [], knowledge: [] });
  const [skills, setSkills] = useState(role?.skills.join('\n') ?? ''), [knowledge, setKnowledge] = useState(role?.knowledge.join('\n') ?? '');
  const [revision, setRevision] = useState(role?.revision ?? 0);
  const save = useCollaborationCommand(project.id, { action: role ? 'role.update' : 'role.create', ...(role ? { roleID: role.id } : {}) }, collaborationPermission(project.settings, 'observe', false));
  const archive = useCollaborationCommand(project.id, { action: 'role.archive', roleID: role?.id ?? 'new' }, collaborationPermission(project.settings, 'observe', false));
  const changed = !!role && role.revision !== revision;
  const blocked = disabled || !!role?.archived || changed || save.pending || save.uncertain || archive.pending || archive.uncertain;
  const nativeUnavailable = fields.question_mode === 'native' && fields.default_agent.trim() !== 'pi';
  const valid = !!fields.name.trim() && !!fields.responsibilities.trim() && !!fields.default_agent.trim() && !!fields.default_model.trim() && !nativeUnavailable;
  function saved(reply: SwaEnvelope) { const current = readSwaRole(reply, project.id); setRevision(current.revision); onSaved(current); }
  return <section className={styles.workspace} aria-label={role ? '角色详情与编辑' : '新角色'}><h3>{role ? role.name : '新建可复用角色'}</h3>
    {role && <p className={styles.meta}>角色 {role.id} · 版本 {role.revision}{role.archived ? ' · 已归档，历史任务保留原角色版本' : ''}</p>}
    {changed && <div><p role="alert">角色已有新版本。你的编辑保留在表单中，请核对最新记录后重新载入。</p><button className="ac-button secondary compact" type="button" disabled={disabled || save.pending || save.uncertain || archive.pending || archive.uncertain} onClick={() => { if (role) { setFields(role); setSkills(role.skills.join('\n')); setKnowledge(role.knowledge.join('\n')); setRevision(role.revision); } }}>载入最新保存版本</button></div>}
    <form className={styles.form} onSubmit={event => {
      event.preventDefault(); if (blocked || !valid) return;
      const definition: RoleDefinition = { name: fields.name.trim(), responsibilities: fields.responsibilities.trim(), default_agent: fields.default_agent.trim(), default_model: fields.default_model.trim(), question_mode: fields.question_mode ?? 'disabled', skills: explicitReferences(skills), knowledge: explicitReferences(knowledge) };
      const body: SwaCommand = role ? { action: 'role.update', role_id: role.id, revision, role: definition } : { action: 'role.create', role: definition };
      void save.run(requestID => swaApi.command(project.id, { ...body, request_id: requestID }), saved);
    }}>
      <label>角色名称<input required value={fields.name} disabled={blocked} onChange={event => setFields({ ...fields, name: event.target.value })} placeholder="代码审查员" /></label>
      <label>职责<textarea required value={fields.responsibilities} disabled={blocked} onChange={event => setFields({ ...fields, responsibilities: event.target.value })} placeholder="检查变更风险、核对验收条件并提出具体意见" /></label>
      <div className={styles.columns}><label>默认 Agent<input required value={fields.default_agent} disabled={blocked} onChange={event => setFields({ ...fields, default_agent: event.target.value })} /></label><label>默认模型<input required value={fields.default_model} disabled={blocked} onChange={event => setFields({ ...fields, default_model: event.target.value })} /></label></div>
      <label>默认问题模式<select value={fields.question_mode ?? 'disabled'} disabled={blocked} onChange={event => setFields({ ...fields, question_mode: event.target.value as 'disabled' | 'native' })}><option value="disabled">禁用工具</option><option value="native" disabled={fields.default_agent.trim() !== 'pi'}>原生问答 · 仅 Pi</option></select></label>
      {nativeUnavailable ? <p role="alert">此角色保留的原生问答模式不适用于当前 Agent。请明确选择 Pi 或改为禁用工具。</p> : <p className={styles.note}>原生问答只允许提问与读取原答案；任务启动时核查当前 Agent 的实际能力。已保存的角色模式会随本次角色版本复用。</p>}
      <label>技能引用（每行一个）<textarea value={skills} disabled={blocked} onChange={event => setSkills(event.target.value)} /></label>
      <label>长期知识引用（每行一个）<textarea value={knowledge} disabled={blocked} onChange={event => setKnowledge(event.target.value)} /></label>
      <p className={styles.note}>引用在这里保存。任务读取引用内容时仍按项目当前权限核查。</p>
      <div className={styles.actions}><button className="ac-button compact" type="submit" disabled={blocked || !valid}>{role ? '保存角色新版本' : '创建角色'}</button>{role && !role.archived && <button className="ac-button secondary compact" type="button" disabled={blocked} onClick={() => { if (!blocked) void archive.run(requestID => swaApi.command(project.id, { action: 'role.archive', role_id: role.id, revision, request_id: requestID }), saved); }}>归档角色</button>}</div>
    </form><CommandState command={save} recovered={saved} />{role && <CommandState command={archive} recovered={saved} />}
  </section>;
}

function ConversationWorkspace({ project, disabled, roles, selectedRoleID, onSelected }: { project: Project; disabled: boolean; roles: SwaRole[]; selectedRoleID: string; onSelected?: (id: string) => void }) {
  const canObserve = collaborationPermission(project.settings, 'observe', disabled);
  const conversations = useReadApi(async signal => readSwaConversations(await swaApi.command(project.id, { action: 'conversation.list' }, signal), project.id), { enabled: canObserve, key: `${project.id}:${project.settings.revision}` });
  const [title, setTitle] = useState(''), [selectedID, setSelectedID] = useState('');
  const create = useCollaborationCommand(project.id, { action: 'conversation.create' }, canObserve);
  const fresh = !!conversations.data && !conversations.loading && !conversations.stale && !conversations.error;
  const canCreate = collaborationPermission(project.settings, 'start', disabled || !fresh) && !create.pending && !create.uncertain;
  const role = roles.find(item => item.id === selectedRoleID && !item.archived);
  function choose(id: string) { setSelectedID(id); onSelected?.(id); }
  function created(reply: SwaEnvelope) { const value = readSwaConversation(reply, project.id); choose(value.conversation.id); setTitle(''); conversations.retry(); }
  return <section className={styles.workspace} aria-label="项目讨论"><h3>讨论与追加要求</h3><p className={styles.note}>讨论保留要求和角色关联。保存文字后，可在任务入口选择此讨论；向运行中的 Worker 发送输入仍使用明确的发送操作。</p>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); if (!canCreate || !title.trim()) return; void create.run(requestID => swaApi.command(project.id, { action: 'conversation.create', conversation: { title: title.trim(), ...(role ? { role_id: role.id } : {}) }, request_id: requestID }), created); }}><label>新讨论标题<input required value={title} disabled={!canCreate} onChange={event => setTitle(event.target.value)} /></label><p className={styles.meta}>{role ? `关联角色：${role.name}` : '独立讨论；可先在角色列表选择需要关联的角色。'}</p><button className="ac-button secondary compact" type="submit" disabled={!canCreate || !title.trim()}>创建讨论</button></form><CommandState command={create} recovered={created} />
    <button className="ac-button secondary compact" type="button" disabled={conversations.loading} onClick={conversations.retry}>刷新讨论</button>
    <QueryState state={conversations}>{items => <div className={styles.columns}><ul className={styles.list} aria-label="讨论列表">{items.map(item => <li key={item.id}><button className={styles.choice} type="button" aria-pressed={selectedID === item.id} disabled={!fresh} onClick={() => choose(item.id)}><strong>{item.title}</strong><span className={styles.meta}>{item.role_id ? roles.find(role => role.id === item.role_id)?.name ?? '已关联角色' : '独立讨论'}</span></button></li>)}</ul>{selectedID ? <ConversationDetail key={selectedID} project={project} id={selectedID} disabled={disabled || !fresh} /> : <p className={styles.note}>选择讨论查看已保存的要求。</p>}</div>}</QueryState>
  </section>;
}

function ConversationDetail({ project, id, disabled }: { project: Project; id: string; disabled: boolean }) {
  const detail = useReadApi(async signal => readSwaConversation(await swaApi.command(project.id, { action: 'conversation.show', conversation_id: id }, signal), project.id, id), { enabled: !disabled, key: `${id}:${project.settings.revision}` });
  const [text, setText] = useState('');
  const append = useCollaborationCommand(project.id, { action: 'conversation.append', conversationID: id }, collaborationPermission(project.settings, 'observe', disabled));
  const canSend = collaborationPermission(project.settings, 'send', disabled || !detail.data || detail.loading || detail.stale || !!detail.error) && !append.pending && !append.uncertain;
  function appended() { setText(''); detail.retry(); }
  return <section className={styles.workspace}><QueryState state={detail}>{data => <><h4>{data.conversation.title}</h4><p className={styles.meta}>讨论 {data.conversation.id}</p>{data.entries.length ? data.entries.map(entry => <article className={styles.entry} key={entry.id}><p className={styles.meta}>{entry.author_id} · {entry.created_at} · 已保存到讨论</p><p className={styles.text}>{entry.text}</p></article>) : <p className={styles.note}>此讨论还没有追加要求。</p>}</>}</QueryState>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); if (!canSend || !text.trim()) return; void append.run(requestID => swaApi.command(project.id, { action: 'conversation.append', conversation_id: id, text: text.trim(), request_id: requestID }), appended); }}><label>追加讨论要求<textarea required value={text} disabled={!canSend} onChange={event => setText(event.target.value)} /></label><button className="ac-button compact" type="submit" disabled={!canSend || !text.trim()}>保存到讨论</button></form><CommandState command={append} recovered={appended} />
  </section>;
}
