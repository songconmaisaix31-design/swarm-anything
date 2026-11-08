/// <reference types="node" />
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startS1Server, type S1Server } from '../../../tests/s1/server.mjs';
import { humanAPI } from '../../../tests/s1/api.mjs';
import { recordedClient } from './realHttpTest';
import { createSwaApi } from './swa';
import { ApiError } from './transport';

describe('SWA 工作台使用同一生产 Go HTTP 边界', () => {
  let server: S1Server, projectID: string;
  beforeAll(async () => {
    server = await startS1Server({ product: 'swa' });
    const human = await humanAPI(server.apiURL);
    const space = await human.write('/project-spaces', { title: 'SWA 公开仓库接口核查' }, { status: 201 });
    const registered = await human.write('/local-projects', { root: fileURLToPath(new URL('../../../', import.meta.url)), name: 'swa-browser-boundary', space_id: space.space.id });
    projectID = registered.project.id;
  }, 120_000);
  afterAll(async () => { if (server) await server.close(); });

  it('未配置原生运行时时保留真实 503，读取 POST 不重发或产生执行关联', async () => {
    const recorded = recordedClient(server), client = createSwaApi(recorded.client);
    const observed = client.command(projectID, { action: 'status' });
    await expect(observed).rejects.toMatchObject({ name: 'SwaRuntimeUnavailableError', status: 503, code: 'provider_unavailable' });
    await expect(observed).rejects.toBeInstanceOf(ApiError);
    expect(recorded.requests.map(request => request.method)).toEqual(['GET', 'POST']);
    expect(new URL(recorded.requests[1].url).pathname).toBe(`/api/v1/local-projects/${projectID}/orca/commands`);
    expect(recorded.requests[1].headers.has('X-CSRF-Token')).toBe(true);
    expect(recorded.requests[1].headers.has('Authorization')).toBe(false);
    expect(recorded.requests[1].headers.has('Idempotency-Key')).toBe(false);
    expect(await recorded.requests[1].clone().json()).toEqual({ action: 'status' });
    expect(server.query('SELECT COUNT(*) AS count FROM orca_execution_links')[0].count).toBe(0);
  });

  it('指定停止沿原 request 与具体 Dispatch 提交一次，503 不冒充已停止', async () => {
    const recorded = recordedClient(server), client = createSwaApi(recorded.client);
    const requestID = crypto.randomUUID();
    const body = { action: 'worker.stop' as const, controller: 'not-started-controller', dispatch_id: 'not-started-dispatch', request_id: requestID };
    await expect(client.command(projectID, body)).rejects.toMatchObject({ status: 503, code: 'provider_unavailable' });
    expect(recorded.requests.map(request => request.method)).toEqual(['GET', 'POST']);
    expect(recorded.requests[1].headers.get('Idempotency-Key')).toBe(requestID);
    expect(await recorded.requests[1].clone().json()).toEqual(body);
    expect(server.query('SELECT COUNT(*) AS count FROM orca_execution_links')[0].count).toBe(0);
  });

  it('发起路径沿现有明确文件合同提交，原生缺失时拒绝且不创建运行身份', async () => {
    const recorded = recordedClient(server), client = createSwaApi(recorded.client);
    for (const command of [
      { action: 'controller.open' as const, project_id: projectID, workdir: fileURLToPath(new URL('../../../', import.meta.url)) },
      { action: 'task.create' as const, controller: 'not-started-controller', spec_file: 'not-created-spec.json' },
      { action: 'worker.start' as const, controller: 'not-started-controller', task_id: 'not-started-task', name: 'unavailable-worker', agent: 'not-approved-agent', model: 'not-approved-model', input_file: 'not-created-input.txt' },
    ]) {
      const offset = recorded.requests.length, requestID = crypto.randomUUID();
      const body = { ...command, request_id: requestID };
      await expect(client.command(projectID, body)).rejects.toMatchObject({ status: 503, code: 'provider_unavailable' });
      expect(recorded.requests.slice(offset).map(request => request.method)).toEqual(['GET', 'POST']);
      expect(recorded.requests.at(-1)!.headers.get('Idempotency-Key')).toBe(requestID);
      expect(await recorded.requests.at(-1)!.clone().json()).toEqual(body);
    }
    expect(server.query('SELECT COUNT(*) AS count FROM orca_execution_links')[0].count).toBe(0);
  });

  it('缺失 CSRF 的真实人工 POST 被拒绝，不进入运行时', async () => {
    const recorded = recordedClient(server);
    await recorded.client.GET('/auth/session');
    for (const body of [{ action: 'status' as const }, { action: 'worker.send' as const, controller: 'not-started-controller', dispatch_id: 'not-started-dispatch', input_file: 'not-created-input.txt', request_id: crypto.randomUUID() }]) {
      const result = await recorded.client.POST('/local-projects/{id}/orca/commands', { params: { path: { id: projectID } }, body });
      expect(result.response.status).toBe(403);
      expect(result.error).toHaveProperty('error.code', 'scope_denied');
      expect(recorded.requests.at(-1)!.headers.has('X-CSRF-Token')).toBe(false);
    }
    expect(recorded.responses).toHaveLength(3);
    expect(server.query('SELECT COUNT(*) AS count FROM orca_execution_links')[0].count).toBe(0);
  });

  it('事先取消的实际调用不提交人工会话或原生命令', async () => {
    const recorded = recordedClient(server), controller = new AbortController();
    controller.abort();
    await expect(createSwaApi(recorded.client).command(projectID, { action: 'status' }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(recorded.requests).toHaveLength(0);
    expect(server.query('SELECT COUNT(*) AS count FROM orca_execution_links')[0].count).toBe(0);
  });

  it('实际服务关闭后保留连接失败，不创建替代请求或返回成功', async () => {
    const recorded = recordedClient(server), client = createSwaApi(recorded.client);
    await server.close();
    await expect(client.command(projectID, { action: 'status' })).rejects.toThrow();
    expect(recorded.requests.map(request => request.method)).toEqual(['GET']);
    expect(recorded.responses).toHaveLength(0);
  });
});
