import { describe, expect, it } from 'vitest';
import { createSwaApi, SwaCommandError, SwaCommandNotSubmittedError } from './swa';
import { createApiClient } from './transport';

// 仅构造 HTTP 边界响应验证发送顺序，不声明服务、原生 Agent 或模型执行通过。
describe('命令提交前的人工会话检查', () => {
  it('认证拒绝与认证连接失败都明确标记未发 POST', async () => {
    for (const fail of ['rejected', 'disconnected']) {
      const methods: string[] = [];
      const client = createApiClient('http://rule.invalid/api/v1', async input => {
        methods.push(new Request(input).method);
        if (fail === 'disconnected') throw new Error('authentication connection failed');
        return Response.json({ schema_version: 1, error: { code: 'scope_denied', message: 'authentication required', retryable: false, request_id: 'rule-http-request', required_action: 'authenticate' } }, { status: 403 });
      });
      await expect(createSwaApi(client).command('rule-project', { action: 'run.submit' })).rejects.toBeInstanceOf(SwaCommandNotSubmittedError);
      expect(methods).toEqual(['GET']);
    }
  });

  it('发 POST 后断线继续保持未知，不标记为未提交或重发', async () => {
    const methods: string[] = [];
    const disconnected = new Error('command connection failed');
    const client = createApiClient('http://rule.invalid/api/v1', async input => {
      const request = new Request(input); methods.push(request.method);
      if (request.method === 'GET') return Response.json({ csrf_token: 'rule-token' });
      throw disconnected;
    });
    await expect(createSwaApi(client).command('rule-project', { action: 'worker.start', request_id: 'rule-request' })).rejects.toBe(disconnected);
    expect(methods).toEqual(['GET', 'POST']);
  });

  it('POST 返回 401/403 仍是服务拒绝，不套用认证前置未提交标记', async () => {
    for (const status of [401, 403]) {
      const methods: string[] = [];
      const client = createApiClient('http://rule.invalid/api/v1', async input => {
        const request = new Request(input); methods.push(request.method);
        return request.method === 'GET' ? Response.json({ csrf_token: 'rule-token' }) : Response.json({ ok: false, error: { code: 'scope_denied', message: 'command rejected', retryable: false, required_action: 'inspect_original_request' } }, { status });
      });
      await expect(createSwaApi(client).command('rule-project', { action: 'worker.start', request_id: 'rule-request' })).rejects.toBeInstanceOf(SwaCommandError);
      expect(methods).toEqual(['GET', 'POST']);
    }
  });
});
