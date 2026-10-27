import type { components } from './schema';
import { api, ApiError } from './transport';
export { api, ApiError, createApiClient } from './transport';

export type { components, operations, paths } from './schema';
export type Health = components['schemas']['HealthV1'];
export type Foundation = components['schemas']['FoundationV1'];
export type Material = components['schemas']['MaterialV1'];
export type Opportunity = components['schemas']['OpportunityV1'];
export type Project = components['schemas']['ProjectV1'];
export type Proposal = components['schemas']['ProposalV1'];
export type Session = components['schemas']['SessionV1'];
export type Mission = components['schemas']['MissionV1'];
export type ApiErrorBody = components['schemas']['ErrorV1'];
export type MaterialDetail = components['schemas']['MaterialDetailV1'];
export type OpportunityDetail = components['schemas']['OpportunityDetailV1'];
export type Distillation = components['schemas']['DistillationV1'];
export type Job = components['schemas']['JobV1'];
export type MaterialDomain = components['schemas']['MaterialDomainV1'];
export type ProjectSpace = components['schemas']['ProjectSpaceV1'];
export type RankingProfileDetail = components['schemas']['RankingProfileDetailV1'];
export type DistillerStatus = components['schemas']['DistillerStatusV1'];
export type LocalAgent = components['schemas']['LocalAgentV1'];
export type AgentObservation = components['schemas']['AgentObservationV1'];
export type NativeCapabilityObservation = components['schemas']['NativeCapabilityObservationV1'];

type ReadOptions = { signal?: AbortSignal };
export function createReadApi(client = api) {
  async function unwrap<T>(result: Promise<{ data?: T; error?: ApiErrorBody; response: Response }>): Promise<T> {
    const { data, error, response } = await result;
    if (error) throw new ApiError(response.status, error);
    if (!data) throw new Error('API returned no JSON data');
    return data;
  }
  return {
    getHealth: (options?: ReadOptions) => unwrap(client.GET('/health', options)),
    getFoundation: (options?: ReadOptions) => unwrap(client.GET('/foundation', options)),
    listMaterials: (options?: ReadOptions) => unwrap(client.GET('/materials', options)),
    listOpportunities: (options?: ReadOptions) => unwrap(client.GET('/opportunities', options)),
    listProjects: (options?: ReadOptions) => unwrap(client.GET('/projects', options)),
    listLocalAgents: (options?: ReadOptions) => unwrap(client.GET('/local-agents', options)),
    listProposals: (options?: ReadOptions) => unwrap(client.GET('/proposals', options)),
    listSessions: (options?: ReadOptions) => unwrap(client.GET('/sessions', options)),
    listMissions: (options?: ReadOptions) => unwrap(client.GET('/missions', options)),
  };
}
export const { getHealth, getFoundation, listMaterials, listOpportunities, listProjects, listLocalAgents, listProposals, listSessions, listMissions } = createReadApi();

/** 人工命令建立会话后携带 CSRF 和调用方提供的 Idempotency-Key，失败后保留命令身份。 */
export function createAttentionApi(client = api) {
  async function unwrap<T>(result: Promise<{ data?: T; error?: ApiErrorBody; response: Response }>): Promise<T> {
    const { data, error, response } = await result;
    if (error) throw new ApiError(response.status, error);
    if (!data) throw new Error('API returned no JSON data');
    return data;
  }
  const headers = async (key: string) => {
    if (!key.trim()) throw new Error('Idempotency key is required');
    const session = await unwrap(client.GET('/auth/session'));
    return { 'Idempotency-Key': key, 'X-CSRF-Token': session.csrf_token };
  };
  return {
    getMaterial: (id: string, options?: ReadOptions) => unwrap(client.GET('/materials/{id}', { params: { path: { id } }, ...options })),
    getMaterialContent: (id: string, revision: number, options?: ReadOptions) => unwrap(client.GET('/materials/{id}/revisions/{revision}/content', { params: { path: { id, revision } }, ...options })),
    getOpportunity: (id: string, options?: ReadOptions) => unwrap(client.GET('/opportunities/{id}', { params: { path: { id } }, ...options })),
    listDistillations: (options?: ReadOptions) => unwrap(client.GET('/distillations', options)),
    listJobs: (options?: ReadOptions) => unwrap(client.GET('/jobs', options)),
    getJob: (id: string, options?: ReadOptions) => unwrap(client.GET('/jobs/{id}', { params: { path: { id } }, ...options })),
    importMaterial: async (body: components['schemas']['ImportMaterialRequestV1'], key: string, options?: ReadOptions) => unwrap(client.POST('/materials/imports', { body, params: { header: await headers(key) }, ...options })),
    updateMaterial: async (id: string, body: components['schemas']['UpdateMaterialRequestV1'], key: string, options?: ReadOptions) => unwrap(client.PATCH('/materials/{id}', { body, params: { path: { id }, header: await headers(key) }, ...options })),
    recordDistillation: async (body: components['schemas']['RecordDistillationRequestV1'], key: string, options?: ReadOptions) => unwrap(client.POST('/distillations', { body, params: { header: await headers(key) }, ...options })),
    requestDistillation: async (body: components['schemas']['RequestDistillationRequestV1'], key: string, options?: ReadOptions) => unwrap(client.POST('/distillations/jobs', { body, params: { header: await headers(key) }, ...options })),
    getDistillerStatus: (options?: ReadOptions) => unwrap(client.GET('/distillations/processor', options)),
    getRankingProfile: (options?: ReadOptions) => unwrap(client.GET('/attention-ranking-profile', options)),
    updateRankingProfile: async (body: components['schemas']['UpdateRankingProfileRequestV1'], key: string, options?: ReadOptions) => unwrap(client.PUT('/attention-ranking-profile', { body, params: { header: await headers(key) }, ...options })),
    createOpportunity: async (body: components['schemas']['OpportunityRequestV1'], key: string, options?: ReadOptions) => unwrap(client.POST('/opportunities', { body, params: { header: await headers(key) }, ...options })),
    reviseOpportunity: async (id: string, body: components['schemas']['OpportunityRequestV1'], key: string, options?: ReadOptions) => unwrap(client.POST('/opportunities/{id}/revisions', { body, params: { path: { id }, header: await headers(key) }, ...options })),
    reviewOpportunity: async (id: string, body: components['schemas']['ReviewOpportunityRequestV1'], key: string, options?: ReadOptions) => unwrap(client.POST('/opportunities/{id}/reviews', { body, params: { path: { id }, header: await headers(key) }, ...options })),
    recordMaterialUse: async (id: string, body: components['schemas']['RecordUseRequestV1'], key: string, options?: ReadOptions) => unwrap(client.POST('/materials/{id}/uses', { body, params: { path: { id }, header: await headers(key) }, ...options })),
    retryJob: async (id: string, body: components['schemas']['JobCommandV1'], key: string, options?: ReadOptions) => unwrap(client.POST('/jobs/{id}/retry', { body, params: { path: { id }, header: await headers(key) }, ...options })),
    cancelJob: async (id: string, body: components['schemas']['JobCommandV1'], key: string, options?: ReadOptions) => unwrap(client.POST('/jobs/{id}/cancel', { body, params: { path: { id }, header: await headers(key) }, ...options })),
    listMaterialDomains: (options?: ReadOptions) => unwrap(client.GET('/material-domains', options)),
    createMaterialDomain: async (body: components['schemas']['MaterialDomainRequestV1'], key: string, options?: ReadOptions) => unwrap(client.POST('/material-domains', { body, params: { header: await headers(key) }, ...options })),
    reviseMaterialDomain: async (id: string, body: components['schemas']['MaterialDomainRequestV1'], key: string, options?: ReadOptions) => unwrap(client.PATCH('/material-domains/{id}', { body, params: { path: { id }, header: await headers(key) }, ...options })),
    setMaterialDomains: async (id: string, body: components['schemas']['SetMaterialDomainsRequestV1'], key: string, options?: ReadOptions) => unwrap(client.PUT('/materials/{id}/domains', { body, params: { path: { id }, header: await headers(key) }, ...options })),
    listProjectSpaces: (options?: ReadOptions) => unwrap(client.GET('/project-spaces', options)),
    createProjectSpace: async (body: components['schemas']['ProjectSpaceRequestV1'], key: string, options?: ReadOptions) => unwrap(client.POST('/project-spaces', { body, params: { header: await headers(key) }, ...options })),
    getProjectSpace: (id: string, options?: ReadOptions) => unwrap(client.GET('/project-spaces/{id}', { params: { path: { id } }, ...options })),
    referenceMaterial: async (id: string, body: components['schemas']['ReferenceMaterialRequestV1'], key: string, options?: ReadOptions) => unwrap(client.POST('/project-spaces/{id}/references', { body, params: { path: { id }, header: await headers(key) }, ...options })),
    removeMaterialReference: async (id: string, body: components['schemas']['RemoveMaterialReferenceRequestV1'], key: string, options?: ReadOptions) => unwrap(client.POST('/project-spaces/{id}/references/remove', { body, params: { path: { id }, header: await headers(key) }, ...options })),
  };
}
export const attentionApi = createAttentionApi();
