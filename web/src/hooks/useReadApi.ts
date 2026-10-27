import { createReadApi, api } from '../api/client';
import { useReadApi } from './useReadState';
export { useReadApi, formatError, type ReadApiState } from './useReadState';

const readApi = createReadApi(api);

// 各接口复用同一个生成客户端。

export function useHealth() {
  return useReadApi(() => readApi.getHealth());
}

export function useFoundation() {
  return useReadApi(() => readApi.getFoundation());
}

export function useMaterials(enabled = true) {
  return useReadApi(signal => readApi.listMaterials({ signal }), { enabled });
}

export function useOpportunities(enabled = true) {
  return useReadApi(signal => readApi.listOpportunities({ signal }), { enabled });
}

export function useProjects() {
  return useReadApi(() => readApi.listProjects());
}

export function useLocalAgents(enabled = true) {
  return useReadApi(signal => readApi.listLocalAgents({ signal }), { enabled });
}

export function useProposals() {
  return useReadApi(() => readApi.listProposals());
}

export function useSessions() {
  return useReadApi(() => readApi.listSessions());
}

export function useMissions() {
  return useReadApi(() => readApi.listMissions());
}
