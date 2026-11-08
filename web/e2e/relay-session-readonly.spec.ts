/// <reference types="node" />
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { RelaySessionEvents, RelaySessionCoverage } from '../src/api/relaySession';
import type { RelayEvent } from '../src/api/relay';
import { formatDate, formatNumber } from '../src/pages/workspace/relayEventFormat';

type Facts = { task_id: string; events: RelayEvent[]; native_session_event_ids: string[]; forbidden_canaries: string[]; coverage: RelaySessionCoverage[] };
test('原task真实18ID只读DOM、分页、原档覆盖与权限拒绝恢复', async ({ page }) => {
  const origin = process.env.ASTROCYTE_TEST_RELAY_PUBLIC_URL;
  const file = process.env.ASTROCYTE_TEST_RELAY_L1_GETEVENT_PUBLIC_FILE;
  expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(file, '需要H当前原task真实GetEvent公开事实').toBeTruthy();
  const facts = JSON.parse(await readFile(file!, 'utf8')) as Facts;
  expect(facts.native_session_event_ids.length).toBeGreaterThan(0);
  const writes: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/v1/')) writes.push(request.method()); });
  expect((await page.request.get(`${origin}/api/v1/auth/session`)).status()).toBe(200);
  await page.goto(`${origin}/cognition/today`);
  const region = page.getByRole('region', { name: '本机 Session 派生事件', exact: true });
  await region.getByLabel('会话任务 ID', { exact: true }).fill(facts.task_id);
  await region.getByLabel('会话每页条数', { exact: true }).selectOption('100');
  let result = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/relay/session-events') && new URL(response.url()).searchParams.get('task_id') === facts.task_id && new URL(response.url()).searchParams.get('page_size') === '100');
  await region.getByRole('button', { name: '读取所选事件', exact: true }).click();
  const response = await result;
  expect(response.status()).toBe(200);
  const full = await response.json() as RelaySessionEvents;
  expect(full.events).toEqual(facts.events);
  expect(full.total).toBe(facts.events.length);
  expect(full.coverage).toEqual(facts.coverage);
  await expect(region.locator('tbody tr')).toHaveCount(facts.events.length);
  await expect(region.locator('thead th')).toHaveText(['事件 ID', '类型', '主题', 'Token 数', '范围', '时间（上海）']);
  for (const [index, event] of facts.events.entries()) {
    expect(Object.keys(event).sort()).toEqual(['event_id', 'kind', 'scope', 'tokens', 'topic', 'ts']);
    await expect(region.locator('tbody tr').nth(index).locator('td')).toHaveText([event.event_id, event.kind, event.topic || '未标注', formatNumber(event.tokens), event.scope || '未标注', formatDate(event.ts)]);
  }
  for (const id of facts.native_session_event_ids) await expect(region.locator('tbody tr').filter({ hasText: id })).toHaveCount(1);
  const html = await region.evaluate(node => node.outerHTML);
  for (const canary of facts.forbidden_canaries) expect(html).not.toContain(canary);
  for (const coverage of facts.coverage) {
    const card = region.getByRole('article', { name: `会话覆盖 ${coverage.task_id}`, exact: true });
    await expect(card).toContainText(`· ${coverage.status}`);
    await expect(card).toContainText('当前文件快照：已读完当前冻结字节范围');
    await expect(card).toContainText('所选来源协议生命周期：尚未核实');
    await expect(card).toContainText('不能据此宣称会话完整');
    for (const [label, value] of [['完整行', coverage.lines], ['已派生', coverage.projected], ['未知格式', coverage.unknown], ['错误', coverage.errors], ['Token 未知', coverage.unknown_tokens]] as const) await expect(card.locator('dl div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd')).toHaveText(String(value));
  }
  await region.getByLabel('会话每页条数', { exact: true }).selectOption('1');
  result = page.waitForResponse(response => new URL(response.url()).searchParams.get('page_size') === '1' && new URL(response.url()).pathname.endsWith('/relay/session-events'));
  await region.getByRole('button', { name: '读取所选事件', exact: true }).click();
  expect((await (await result).json() as RelaySessionEvents).events).toEqual(facts.events.slice(0, 1));
  result = page.waitForResponse(response => new URL(response.url()).searchParams.get('page') === '2' && new URL(response.url()).pathname.endsWith('/relay/session-events'));
  await region.getByRole('button', { name: '会话下一页', exact: true }).click();
  expect((await (await result).json() as RelaySessionEvents).events).toEqual(facts.events.slice(1, 2));
  await page.setExtraHTTPHeaders({ Origin: 'http://127.0.0.1:1' });
  await region.getByRole('button', { name: '只读刷新会话事件', exact: true }).click();
  await expect(region).toContainText('当前会话覆盖未知');
  await expect(region.locator('tbody tr')).toHaveCount(0);
  await page.setExtraHTTPHeaders({});
  await region.getByRole('button', { name: '只读刷新会话事件', exact: true }).click();
  await expect(region.locator('tbody tr')).toHaveCount(1);
  expect(writes).toEqual([]);
});
