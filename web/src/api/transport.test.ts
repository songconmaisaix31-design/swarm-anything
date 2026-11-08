/// <reference types="node" />
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startS1Server, type S1Server } from '../../../tests/s1/server.mjs';
import { recordedClient } from './realHttpTest';

describe('独立 SWA 服务的真实 HTTP 传输', () => {
  let server: S1Server;
  beforeAll(async () => { server = await startS1Server({ product: 'swa' }); }, 120_000);
  afterAll(async () => { if (server) await server.close({ preserveData: true }); });

  it('受保护读取建立实际会话并保留真实 SQLite 空集合', async () => {
    const recorded = recordedClient(server);
    const result = await recorded.client.GET('/project-spaces');
    expect(result.response.status).toBe(200);
    expect(result.data?.items).toEqual([]);
    expect(result.data).toEqual(await recorded.responses.at(-1)!.json());
    expect(recorded.requests.map(request => new URL(request.url).pathname)).toEqual(['/api/v1/auth/session', '/api/v1/project-spaces']);
    expect(server.query('SELECT COUNT(*) AS count FROM attention_project_spaces')[0].count).toBe(0);
  });

  it('服务重启后的受保护读取只重建一次会话', async () => {
    const recorded = recordedClient(server);
    await recorded.client.GET('/local-projects');
    await server.restart();
    const offset = recorded.requests.length;
    const result = await recorded.client.GET('/local-projects');
    expect(result.response.status).toBe(200);
    expect(result.data?.items).toEqual([]);
    expect(recorded.requests.slice(offset).map(request => new URL(request.url).pathname)).toEqual(['/api/v1/local-projects', '/api/v1/auth/session', '/api/v1/local-projects']);
  }, 60_000);

  it('实际取消请求失败且不返回替代集合', async () => {
    const recorded = recordedClient(server), controller = new AbortController();
    controller.abort();
    await expect(recorded.client.GET('/local-projects', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(recorded.requests).toHaveLength(1);
    expect(recorded.requests[0].signal.aborted).toBe(true);
  });

  it('无效 Agent 身份被拒绝且不转换成人类会话', async () => {
    const recorded = recordedClient(server);
    const result = await recorded.client.GET('/local-projects', { headers: { Authorization: 'Bearer invalid' } });
    expect(result.response.status).toBe(403);
    expect(result.error?.error.code).toBe('scope_denied');
    expect(recorded.requests).toHaveLength(1);
    expect(recorded.requests[0].headers.get('Authorization')).toBe('Bearer invalid');
  });

  it('校验拒绝保留原 CSRF 和稳定 ID，写入只提交一次', async () => {
    const recorded = recordedClient(server), key = crypto.randomUUID();
    const session = await recorded.client.GET('/auth/session');
    expect(session.data?.csrf_token).toBeTruthy();
    const offset = recorded.requests.length;
    const result = await recorded.client.POST('/project-spaces', {
      body: { schema_version: 1, request_id: key, expected_version: 1, title: '' },
      params: { header: { 'Idempotency-Key': key, 'X-CSRF-Token': session.data!.csrf_token } },
    });
    expect(result.response.status).toBe(400);
    expect(recorded.requests.length - offset).toBe(1);
    expect(recorded.requests.at(-1)!.headers.get('Idempotency-Key')).toBe(key);
    expect(recorded.requests.at(-1)!.headers.get('X-CSRF-Token')).toBe(session.data!.csrf_token);
    expect(server.query('SELECT COUNT(*) AS count FROM attention_project_spaces')[0].count).toBe(0);
  });

  it('实际连接关闭后传播错误，不创建替代请求', async () => {
    const recorded = recordedClient(server);
    await recorded.client.GET('/local-projects');
    await server.close({ preserveData: true });
    const offset = recorded.requests.length;
    await expect(recorded.client.GET('/local-projects')).rejects.toThrow();
    expect(recorded.requests.length - offset).toBe(1);
  });
});
