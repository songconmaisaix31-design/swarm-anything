import { api, ApiError, type ApiErrorBody, type components } from './transport';

type Options = { signal?: AbortSignal };
async function unwrap<T>(result: Promise<{ data?: T; error?: ApiErrorBody; response: Response }>): Promise<T> {
  const { data, error, response } = await result;
  if (error) throw new ApiError(response.status, error);
  if (!data) throw new Error('API 未返回完整 JSON');
  return data;
}
async function headers(key: string) {
  if (!key.trim()) throw new Error('需要稳定请求身份');
  const session = await unwrap(api.GET('/auth/session'));
  return { 'Idempotency-Key': key, 'X-CSRF-Token': session.csrf_token };
}

export const workspaceApi = {
  listSpaces: (options?: Options) => unwrap(api.GET('/project-spaces', options)),
  createSpace: async (body: components['schemas']['ProjectSpaceRequestV1'], key: string, options?: Options) => unwrap(api.POST('/project-spaces', { body, params: { header: await headers(key) }, ...options })),
  listProjects: (options?: Options) => unwrap(api.GET('/local-projects', options)),
  registerProject: async (body: components['schemas']['RegisterLocalProjectRequestV1'], key: string, options?: Options) => unwrap(api.POST('/local-projects', { body, params: { header: await headers(key) }, ...options })),
  discoverProjects: async (body: components['schemas']['DiscoverLocalProjectsRequestV1'], key: string, options?: Options) => unwrap(api.POST('/local-projects/discover', { body, params: { header: await headers(key) }, ...options })),
  setSettings: async (id: string, body: components['schemas']['LocalProjectSettingsRequestV1'], key: string, options?: Options) => unwrap(api.PUT('/local-projects/{id}/settings', { body, params: { path: { id }, header: await headers(key) }, ...options })),
  grantAgent: async (id: string, body: components['schemas']['GrantLocalProjectAgentRequestV1'], key: string, options?: Options) => unwrap(api.POST('/local-projects/{id}/grants', { body, params: { path: { id }, header: await headers(key) }, ...options })),
  revokeAgent: async (id: string, body: components['schemas']['RevokeLocalProjectAgentRequestV1'], key: string, options?: Options) => unwrap(api.POST('/local-projects/{id}/grants/revoke', { body, params: { path: { id }, header: await headers(key) }, ...options })),
  issueAgentToken: async (id: string, body: components['schemas']['IssueProjectAgentTokenRequestV1'], key: string, options?: Options) => unwrap(api.POST('/local-projects/{id}/agent-token', { body, params: { path: { id }, header: await headers(key) }, ...options })),
};
