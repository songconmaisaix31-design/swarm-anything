import { describe, expect, it } from 'vitest';
import { readRunConnection, saveRunConnection } from './swaRunConnection';

// 明确构造浏览器存储输入；只验证身份持久化，不执行 Run、请求或模型。
function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const selection = { controller: 'rule-controller', runID: 'rule-run', taskID: 'rule-task' };
describe('已成功连接的 Run 身份', () => {
  it('按项目恢复三项原身份，显式忘记只清除该项目', () => {
    const storage = memoryStorage();
    expect(saveRunConnection('project-a', selection, storage)).toBeNull();
    expect(readRunConnection('project-a', storage)).toEqual({ selection, warning: null });
    expect(readRunConnection('project-b', storage).selection).toBeNull();
    saveRunConnection('project-b', { ...selection, runID: 'other-run' }, storage);
    expect(saveRunConnection('project-a', null, storage)).toBeNull();
    expect(readRunConnection('project-a', storage).selection).toBeNull();
    expect(readRunConnection('project-b', storage).selection?.runID).toBe('other-run');
  });

  it('无效、跨项目或不可用存储不抛错，不产生虚构连接', () => {
    const storage = memoryStorage();
    for (const value of ['{broken', JSON.stringify({ version: 1, projectID: 'other-project', ...selection }), JSON.stringify({ version: 1, projectID: 'project-a', ...selection, taskID: '' })]) {
      storage.setItem('swa-run-connection:project-a', value);
      expect(readRunConnection('project-a', storage)).toMatchObject({ selection: null, warning: expect.any(String) });
      expect(storage.getItem('swa-run-connection:project-a')).toBeNull();
    }
    const unavailable = { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('disabled'); }, removeItem() { throw new Error('disabled'); } };
    expect(readRunConnection('project-a', unavailable).selection).toBeNull();
    expect(saveRunConnection('project-a', selection, unavailable)).toContain('本次已连接');
    expect(saveRunConnection('project-a', null, unavailable)).toContain('当前页面已断开');
  });
});
