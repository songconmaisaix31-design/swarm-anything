import { api, ApiError, type ApiErrorBody, type components } from './transport';

export type SwaCommand = components['schemas']['command'];
export type SwaEnvelope = components['schemas']['envelope'];

export class SwaCommandError extends Error {
  constructor(readonly status: number, readonly reply: SwaEnvelope) {
    super(reply.error?.message || '执行服务未确认本次命令');
    this.name = 'SwaCommandError';
  }
}

export class SwaRuntimeUnavailableError extends ApiError {
  constructor(detail: ApiErrorBody) {
    super(503, detail);
    this.name = 'SwaRuntimeUnavailableError';
  }
}

/** 浏览器沿人工会话访问同一产品命令；任何 POST 均不自动重发。 */
export function createSwaApi(client = api) {
  return {
    async command(projectID: string, body: SwaCommand, signal?: AbortSignal): Promise<SwaEnvelope> {
      signal?.throwIfAborted();
      const session = await client.GET('/auth/session', { signal });
      if (session.error) throw new ApiError(session.response.status, session.error);
      if (!session.data) throw new Error('执行操作需要当前人工会话');
      signal?.throwIfAborted();
      const result = await client.POST('/local-projects/{id}/orca/commands', {
        params: { path: { id: projectID }, header: { 'X-CSRF-Token': session.data.csrf_token, ...(body.request_id ? { 'Idempotency-Key': body.request_id } : {}) } },
        body, signal,
      });
      if (result.error) {
        if ('ok' in result.error) throw new SwaCommandError(result.response.status, result.error);
        if (result.response.status === 503 && result.error.error.code === 'provider_unavailable' && result.error.error.required_action === 'start_installed_swa_service') throw new SwaRuntimeUnavailableError(result.error);
        throw new ApiError(result.response.status, result.error as ApiErrorBody);
      }
      if (!result.data) throw new Error('执行服务未返回命令回执');
      if (!result.data.ok) throw new SwaCommandError(result.response.status, result.data);
      return result.data;
    },
  };
}

export const swaApi = createSwaApi();
