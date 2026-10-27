import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SwaEnvelope } from '../../api/swa';
import type { components } from '../../api/schema';
import { readSwaFleet, readSwaAgents, readSwaExecution, readPendingSwaRequest, recoverSwaRequest, canRequestSwaStart, swaDelegationBlock, swaStartRequestBlock, type PendingSwaRequest } from './swaObservation';
import { SwaExecutionDetails } from './SwaExecutionDetails';

// 以下为解析器的明确参数输入，不表示存在原生执行、模型返回或安装验收结果。
const projectID = 'parser-project-input', controller = 'parser-controller-input', taskID = 'parser-task-input';
const requestID = '0ff0ec12-d039-4c27-b41a-f61b46cf7be7';

function commandReceipt(action: string, native: unknown, state = 'completed', childState = 'completed'): SwaEnvelope {
  return { ok: true, result: {
    requestId: requestID, state, method: 'swa.controllerDeliver',
    receipt: { project_id: projectID, controller, root_task_id: taskID, action, child_request: `${requestID}/native`, invocation: { command: { action, request_id: requestID, controller, task_id: taskID, dispatch_id: 'parser-dispatch-input' } }, native },
    children: [{ requestId: `${requestID}/native`, state: childState }],
  } };
}

describe('SWA 原生 DTO 解析边界，实际模型链未验', () => {
  it('损坏或不可读取的 pending 保留原记录并返回局部错误，恢复后读取原身份', () => {
    const key = 'swa-pending:rule-project:worker.start:rule-task';
    const original: PendingSwaRequest = { requestID, action: 'worker.start', controller, taskID };
    let stored = JSON.stringify(original), unavailable = false;
    const storage = { getItem(actual: string) { expect(actual).toBe(key); if (unavailable) throw new Error('storage denied'); return stored; } };
    expect(readPendingSwaRequest(key, storage)).toEqual({ pending: original, error: null });
    for (const malformed of ['{invalid', '{}', 'null', '[]', JSON.stringify({ ...original, taskID: 42 }), JSON.stringify({ ...original, requestID: '' })]) {
      stored = malformed;
      expect(readPendingSwaRequest(key, storage)).toMatchObject({ pending: null, error: expect.stringContaining('已暂停') });
      expect(stored).toBe(malformed);
    }
    stored = JSON.stringify(original); unavailable = true;
    expect(readPendingSwaRequest(key, storage)).toMatchObject({ pending: null, error: expect.stringContaining('无法读取') });
    expect(stored).toBe(JSON.stringify(original));
    unavailable = false;
    expect(readPendingSwaRequest(key, storage)).toEqual({ pending: original, error: null });
  });
  it('资源状态为合法 null 时保留 Worker 和未观察值', () => {
    const input: SwaEnvelope = { ok: true, result: { scope: { project_id: projectID, controller, root_task_id: taskID, run_id: 'parser-run-input' }, native: { workers: [{ dispatchId: 'parser-dispatch-input', taskId: 'parser-child-task-input', runId: 'parser-run-input', workerState: 'starting', dispatchStatus: 'running', terminalState: null }], page: { hasMore: true, total: 3 } } } };
    const fleet = readSwaFleet(input, projectID, controller, taskID);
    expect(fleet.workers).toHaveLength(1);
    expect(fleet.workers[0].terminalState).toBeNull();
    expect(fleet).toMatchObject({ hasMore: true, total: 3 });
    expect(() => readSwaFleet(input, 'other-project-input', controller, taskID)).toThrow('范围');
  });

  it('absent、pending 及子回执 pending 都保持未确认', () => {
    const pending: PendingSwaRequest = { requestID, action: 'worker.start', controller, taskID };
    for (const state of ['absent', 'pending']) expect(recoverSwaRequest({ ok: true, result: { requestId: requestID, state } }, projectID, pending)).toBeNull();
    expect(recoverSwaRequest(commandReceipt(pending.action, { state: 'ready', dispatchId: 'parser-dispatch-input' }, 'completed', 'pending'), projectID, pending)).toBeNull();
  });

  it('完成回执只恢复原 controller/task/dispatch，不构造新请求', () => {
    const pending: PendingSwaRequest = { requestID, action: 'worker.start', controller, taskID };
    const input = commandReceipt(pending.action, { state: 'ready', dispatchId: 'parser-dispatch-input' });
    expect(recoverSwaRequest(input, projectID, pending)).toMatchObject({ request_id: requestID, controller, task_id: taskID, dispatch_id: 'parser-dispatch-input' });
    expect(recoverSwaRequest(commandReceipt(pending.action, { state: 'unknown' }), projectID, pending)).toBeNull();
    expect(() => recoverSwaRequest(input, 'other-project-input', pending)).toThrow('项目');
    expect(() => recoverSwaRequest(input, projectID, { ...pending, requestID: 'other-request-input' })).toThrow('请求身份');
    expect(() => recoverSwaRequest(input, projectID, { ...pending, taskID: 'other-task-input' })).toThrow('选择');
  });

  it('输入恢复核查当前 journal 结算身份，unknown 不解锁', () => {
    const pending: PendingSwaRequest = { requestID, action: 'worker.send', controller, dispatchID: 'parser-dispatch-input' };
    const input = commandReceipt(pending.action, { state: 'accepted' });
    const result = input.result as Record<string, unknown>;
    result.current_input = { request_id: requestID, dispatch_id: pending.dispatchID, state: 'unknown' };
    expect(recoverSwaRequest(input, projectID, pending)).toBeNull();
    result.current_input = { request_id: requestID, dispatch_id: pending.dispatchID, state: 'accepted' };
    expect(recoverSwaRequest(input, projectID, pending)?.request_id).toBe(requestID);
    result.current_input = { request_id: requestID, dispatch_id: 'other-dispatch-input', state: 'accepted' };
    expect(() => recoverSwaRequest(input, projectID, pending)).toThrow('结算身份');
  });

  it('Controller 创建恢复须从同项目完成回执取得真实选择字段', () => {
    const pending: PendingSwaRequest = { requestID, action: 'controller.open' };
    const input: SwaEnvelope = { ok: true, result: { requestId: requestID, state: 'completed', method: 'swa.controllerOpen', receipt: { project_id: projectID, controller }, children: [] } };
    expect(recoverSwaRequest(input, projectID, pending)?.controller).toBe(controller);
    expect(() => recoverSwaRequest({ ...input, result: { requestId: requestID, state: 'completed', method: 'swa.taskCreate', receipt: { project_id: projectID, controller }, children: [] } }, projectID, pending)).toThrow('动作');
  });
});

type FormAgent = ReturnType<typeof readSwaAgents>[number];
type Observation = components['schemas']['observation'];
const formSettings: components['schemas']['LocalProjectSettingsV1'] = { revision: 3, allow_directory: true, allowed_subdirs: [], expand_references: false, allowed_actions: ['start'], allowed_tools: [], external_model_cli: 'form-agent-input', allow_agent_control: true, history_roots: {} };
const observationInput = (status: Observation['status']): Observation => ({ status, reason: 'explicit-form-parameter', source: 'parser-parameter' });
function formAgentInput(): FormAgent {
  return {
    id: 'form-agent-input', model: 'form-model-input', settingsRevision: formSettings.revision,
    registered: observationInput('available'), enabled: observationInput('available'), installed: observationInput('available'), configured: observationInput('available'), start: observationInput('available'),
    launchable: observationInput('unknown'), read: observationInput('unknown'), tools: observationInput('unknown'), questions: null, delegation: null,
  };
}
const startInput = (agent: FormAgent | undefined = formAgentInput()) => ({ agent, settings: formSettings, disabled: false, pending: false, unresolved: false, name: 'explicit-worker-name-input', inputFile: '/explicit/server-input-path' });

describe('SWA 启动表单的明确参数规则，不表示原生发现或启动通过', () => {
  it('同项目的非默认 Agent 必须在显式许可列表，原能力与版本门继续生效', () => {
    const agent = { ...formAgentInput(), id: 'pi' };
    const settings = { ...formSettings, external_model_clis: [formSettings.external_model_cli, 'pi'] };
    expect(canRequestSwaStart({ ...startInput(agent), settings })).toBe(true);
    expect(canRequestSwaStart(startInput(agent))).toBe(false);
    expect(canRequestSwaStart({ ...startInput(agent), settings: { ...settings, revision: settings.revision + 1 } })).toBe(false);
    expect(canRequestSwaStart({ ...startInput({ ...agent, configured: observationInput('unknown') }), settings })).toBe(false);
  });
  it('静态条件允许提交时，未握手观察仍是 unknown', () => {
    const agent = formAgentInput();
    expect(canRequestSwaStart(startInput(agent))).toBe(true);
    expect(swaStartRequestBlock(agent, formSettings)).toBeNull();
    expect([agent.launchable.status, agent.read.status, agent.tools.status]).toEqual(['unknown', 'unknown', 'unknown']);
  });

  it('自主委派同时核查实际能力、项目工具与当前启动发送许可', () => {
    const agent = { ...formAgentInput(), delegation: observationInput('available') };
    const settings = { ...formSettings, allowed_tools: ['swa_delegate'], allowed_actions: ['start', 'send'] };
    expect(swaDelegationBlock(agent, settings)).toBeNull();
    expect(swaDelegationBlock(agent, { ...settings, allowed_tools: [] })).toContain('未允许自主委派');
    expect(swaDelegationBlock(agent, { ...settings, allowed_actions: ['start'] })).toContain('发送许可');
    expect(swaDelegationBlock(agent, { ...settings, revision: settings.revision + 1 })).toContain('已过期');
    for (const delegation of [null, observationInput('unknown'), observationInput('unavailable')]) expect(swaDelegationBlock({ ...agent, delegation }, settings)).not.toBeNull();
    expect(swaDelegationBlock(undefined, settings)).not.toBeNull();
  });

  it('任何静态条件未核实、模型缺失或明确不可用的未握手能力都禁止提交', () => {
    for (const key of ['registered', 'enabled', 'installed', 'configured', 'start'] as const) {
      for (const status of ['unknown', 'unavailable'] as const) {
        const agent = { ...formAgentInput(), [key]: observationInput(status) };
        expect(canRequestSwaStart(startInput(agent))).toBe(false);
      }
    }
    for (const key of ['launchable', 'read', 'tools'] as const) expect(canRequestSwaStart(startInput({ ...formAgentInput(), [key]: observationInput('unavailable') }))).toBe(false);
    for (const model of ['', '   ']) expect(canRequestSwaStart(startInput({ ...formAgentInput(), model }))).toBe(false);
  });

  it('当前项目、权限版本、刷新禁用和原请求未结使用同一个提交门', () => {
    const input = startInput();
    for (const settings of [
      { ...formSettings, external_model_cli: 'other-project-agent-input' },
      { ...formSettings, allow_agent_control: false },
      { ...formSettings, allowed_actions: [] },
      { ...formSettings, revision: formSettings.revision + 1 },
    ]) expect(canRequestSwaStart({ ...input, settings })).toBe(false);
    // 父组件把项目/状态/能力的loading或stale统一传入disabled，按钮和onSubmit共用本门。
    for (const key of ['disabled', 'pending', 'unresolved'] as const) expect(canRequestSwaStart({ ...input, [key]: true })).toBe(false);
    expect(canRequestSwaStart({ ...input, agent: undefined })).toBe(false);
    expect(canRequestSwaStart({ ...input, name: ' ' })).toBe(false);
    expect(canRequestSwaStart({ ...input, inputFile: ' ' })).toBe(false);
  });

  it('解析明确 DTO 参数时保留观察，重复身份和不明格式拒绝', () => {
    const agent = formAgentInput();
    const parameter = {
      id: agent.id, execution_mode: 'structured', registered: agent.registered, enabled: agent.enabled, installed: agent.installed,
      configured: { ...agent.configured, model: agent.model }, launchable: agent.launchable,
      control: { start: agent.start, read: agent.read, tools: agent.tools }, requirements: { settings_revision: formSettings.revision },
    };
    const parse = (agents: unknown[]) => readSwaAgents({ ok: true, result: { schema: 'swa.capabilities.v1', agents } });
    expect(parse([parameter])[0]).toEqual(agent);
    expect(() => parse([parameter, parameter])).toThrow('重复');
    for (const status of ['ready', ['available'], null]) expect(() => parse([{ ...parameter, registered: { ...agent.registered, status } }])).toThrow('观察状态');
    expect(() => parse([{ ...parameter, requirements: { settings_revision: '3' } }])).toThrow('权限版本');
    expect(() => parse([{ ...parameter, control: { start: agent.start, read: agent.read } }])).toThrow('原生对象');
  });
});

const runID = 'parser-run-input', dispatchID = 'parser-dispatch-input';
function executionParameter() {
  const selection = { agent: 'codex', adapter: 'CodexStructuredSessionAdapter', version: '0.163.0', execution_mode: 'structured', provider: 'openai', model: 'gpt-5.5', account_source: 'codex-native-api-key' };
  return { ok: true, result: {
    scope: { project_id: projectID, controller, run_id: runID },
    native: {
      dispatch: { id: dispatchID, runId: runID, status: 'completed' },
      source: { availability: 'observed', native_session_id: 'parser-native-session', selection: { agent_id: selection.agent, adapter: selection.adapter, version: selection.version, execution_mode: selection.execution_mode, provider: selection.provider, model: selection.model, native_launch: { account: { kind: selection.account_source } } } },
      execution: {
        selection, launch: observationInput('available'), control: observationInput('unknown'), result: observationInput('unknown'), authenticated: observationInput('unknown'),
        delivery: { state: 'unknown', phase: 'unknown', source: 'native_input_request_pending', request_id: requestID },
        resume: { state: 'not_requested', source: 'native_provider_handle_chain', session_id: 'parser-native-session' },
        model_catalog: { origin: 'configured', availability: 'unverified', models: [{ id: selection.model, label: selection.model }] },
      },
    },
  } } satisfies SwaEnvelope;
}
const readExecution = (reply: SwaEnvelope) => readSwaExecution(reply, projectID, controller, runID, dispatchID);
const renderExecution = (reply: SwaEnvelope) => renderToStaticMarkup(createElement(SwaExecutionDetails, { reply, projectID, controller, runID, dispatchID }));

describe('实际执行 DTO 与 React 静态呈现，不表示真实 HTTP 或模型验收', () => {
  it('同项目、Controller、Run 与 Dispatch 一起核对，缺执行来源保留未知', () => {
    const parameter = executionParameter();
    expect(readExecution(parameter)?.selection.model).toBe('gpt-5.5');
    for (const changed of [{ project_id: 'other-project' }, { controller: 'other-controller' }, { run_id: 'other-run' }]) {
      expect(() => readExecution({ ...parameter, result: { ...parameter.result, scope: { ...parameter.result.scope, ...changed } } })).toThrow('当前项目');
    }
    for (const changed of [{ id: 'other-dispatch' }, { runId: 'other-run' }]) {
      expect(() => readExecution({ ...parameter, result: { ...parameter.result, native: { ...parameter.result.native, dispatch: { ...parameter.result.native.dispatch, ...changed } } } })).toThrow('当前项目');
    }
    const missing = { ...parameter, result: { ...parameter.result, native: { ...parameter.result.native, execution: undefined } } };
    expect(readExecution(missing)).toBeNull();
    expect(renderExecution(missing)).toContain('状态未知');
  });

  it('原生选择、会话和送达依据缺失时不会显示成功', () => {
    const different = executionParameter();
    different.result.native.source.selection.model = 'other-model';
    expect(() => readExecution(different)).toThrow('实际选择');
    expect(renderExecution(different)).toContain('状态未知');
    for (const execution_mode of ['terminal', undefined]) {
      const parameter = executionParameter(), native = parameter.result.native;
      const changed = { ...parameter, result: { ...parameter.result, native: { ...native, source: { ...native.source, selection: { ...native.source.selection, execution_mode } } } } };
      expect(() => readExecution(changed)).toThrow('实际选择');
      expect(renderExecution(changed)).toContain('状态未知');
    }
    const session = executionParameter();
    session.result.native.execution.resume.session_id = 'other-session';
    expect(() => readExecution(session)).toThrow('会话身份');
    const input = executionParameter();
    input.result.native.execution.delivery.state = 'sent';
    expect(() => readExecution(input)).toThrow('原请求依据');
    input.result.native.execution.delivery.state = 'future-state';
    expect(() => readExecution(input)).toThrow('delivery.state');
  });

  it('业务 completed 与配置目录都不能在呈现时升级登录、结果或未知输入', () => {
    const parameter = executionParameter();
    const observed = readExecution(parameter);
    expect(observed?.authenticated.status).toBe('unknown');
    expect(observed?.result.status).toBe('unknown');
    expect(observed?.catalog.availability).toBe('unverified');
    const html = renderExecution(parameter);
    for (const expected of ['执行配置', 'gpt-5.5', 'codex-native-api-key', '账号与模型访问', '未知', '送达情况未知；不能自动重发', '目录未核实', requestID]) expect(html).toContain(expected);
    const main = html.slice(0, html.indexOf('<details'));
    expect(main).toContain('Codex 独立 API 密钥');
    for (const internal of ['codex-native-api-key', 'CodexStructuredSessionAdapter', 'native_input_request_pending', requestID]) expect(main).not.toContain(internal);
    expect(html).not.toContain('已送达 Agent');
    expect(html).not.toContain('<button');
  });

  it('五种恢复语义分别显示，并保留原生来源标签', () => {
    for (const [state, label] of Object.entries({ not_requested: '未请求恢复', resumed: '恢复原会话', rebuilt: '上下文已替换', failed: '恢复失败', unknown: '恢复结果未知' })) {
      const parameter = executionParameter();
      parameter.result.native.execution.resume.state = state;
      const html = renderExecution(parameter);
      expect(html).toContain(label);
      expect(html).toContain('native_provider_handle_chain');
    }
  });
});
