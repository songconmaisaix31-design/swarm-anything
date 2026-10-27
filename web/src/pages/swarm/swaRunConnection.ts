import type { SwaRunSelection } from './swaRunView';

type ConnectionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (projectID: string) => `swa-run-connection:${projectID}`;
const browserStorage = () => typeof window === 'undefined' ? undefined : window.localStorage;

/** 仅保存重连身份；每次读取运行仍经当前项目服务授权。 */
export function readRunConnection(projectID: string, storage?: ConnectionStorage): { selection: SwaRunSelection | null; warning: string | null } {
  try {
    const saved = (storage ?? browserStorage())?.getItem(key(projectID));
    if (!saved) return { selection: null, warning: null };
    const value: unknown = JSON.parse(saved);
    if (!value || typeof value !== 'object') throw new Error();
    const record = value as Record<string, unknown>;
    if (record.version !== 1 || record.projectID !== projectID || ['controller', 'runID', 'taskID'].some(field => typeof record[field] !== 'string' || !(record[field] as string).trim())) throw new Error();
    return { selection: { controller: record.controller as string, runID: record.runID as string, taskID: record.taskID as string }, warning: null };
  } catch {
    try { (storage ?? browserStorage())?.removeItem(key(projectID)); }
    catch { return { selection: null, warning: '浏览器无法读取或清除保存的连接，请填写原 Run 身份重新连接。' }; }
    return { selection: null, warning: '已清除无法识别的连接记录，请填写原 Run 身份重新连接。' };
  }
}

export function saveRunConnection(projectID: string, selection: SwaRunSelection | null, storage?: ConnectionStorage): string | null {
  try {
    const target = storage ?? browserStorage();
    if (selection) target?.setItem(key(projectID), JSON.stringify({ version: 1, projectID, ...selection }));
    else target?.removeItem(key(projectID));
    return null;
  } catch { return selection ? '本次已连接，但浏览器无法保存连接；请保留当前 Run、Controller 和根 Task 身份。' : '当前页面已断开；浏览器未能清除保存的连接。'; }
}
