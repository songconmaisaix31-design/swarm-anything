import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

export type { components, operations, paths } from './schema';
export type ApiErrorBody = components['schemas']['ErrorV1'];

/** 受保护读取建立同源会话；写命令由调用方明确提供 CSRF 与稳定身份。 */
export const createApiClient = (baseUrl = '/api/v1', fetchImpl?: typeof fetch) => {
  const client = createClient<paths>({ baseUrl, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  let bootstrap: Promise<void> | undefined;
  const establishSession = async (request: Request) => {
    const url = new URL(request.url);
    url.pathname = `${url.pathname.slice(0, url.pathname.indexOf('/api/v1') + 7)}/auth/session`;
    url.search = '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await (fetchImpl ?? fetch)(new Request(url, { credentials: 'same-origin', signal: controller.signal }));
      await response.arrayBuffer();
      if (!response.ok) throw new Error(`建立本地会话失败（HTTP ${response.status}）`);
    } finally { clearTimeout(timeout); }
  };
  client.use({ async onRequest({ request }) {
    const path = new URL(request.url).pathname;
    if (request.method !== 'GET' || request.signal.aborted || request.headers.has('Authorization') ||
      ['/auth/session', '/health', '/foundation'].some(suffix => path === `/api/v1${suffix}`)) return request;
    bootstrap ??= establishSession(request).catch(error => { bootstrap = undefined; throw error; });
    await bootstrap;
    return request;
  }, async onResponse({ request, response }) {
    if (request.method !== 'GET' || request.headers.has('Authorization') || response.status !== 403 || request.url.endsWith('/auth/session')) return response;
    const error = await response.clone().json() as ApiErrorBody;
    if (!['local session required', 'local session expired'].includes(error?.error?.message ?? '')) return response;
    // 服务重启后只重试一次读取，写命令不进入此分支。
    bootstrap = establishSession(request).catch(error => { bootstrap = undefined; throw error; });
    await bootstrap;
    return (fetchImpl ?? fetch)(request);
  } });
  return client;
};
export const api = createApiClient();

export class ApiError extends Error {
  constructor(readonly status: number, readonly detail: ApiErrorBody) {
    super(detail.error.message);
    this.name = 'ApiError';
  }
  get code() { return this.detail.error.code; }
  get requestId() { return this.detail.error.request_id; }
}
