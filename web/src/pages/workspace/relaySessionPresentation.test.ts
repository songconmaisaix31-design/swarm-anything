import { expect, it, beforeAll } from 'vitest';
import { request } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { RelaySessionEvents } from '../../api/relaySession';
import { relaySessionGap, relaySessionHasGap, relaySessionQueryError } from './relaySessionPresentation';

let data: RelaySessionEvents, taskID: string, canaries: string[];
beforeAll(async () => {
  const origin = process.env.ASTROCYTE_TEST_RELAY_PUBLIC_URL || '';
  expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  const file = process.env.ASTROCYTE_TEST_RELAY_L1_GETEVENT_PUBLIC_FILE;
  expect(file, '需要实际 GetEvent 公开事实').toBeTruthy();
  const facts = JSON.parse(await readFile(file!, 'utf8')) as { task_id: string; forbidden_canaries: string[] };
  taskID = facts.task_id; canaries = facts.forbidden_canaries;
  const context = await request.newContext({ baseURL: origin });
  try {
    expect((await context.get('/api/v1/auth/session')).status()).toBe(200);
    const response = await context.get(`/api/v1/relay/session-events?task_id=${taskID}&page_size=100`);
    expect(response.status()).toBe(200);
    data = await response.json() as RelaySessionEvents;
  } finally { await context.dispose(); }
});

it('retains actual native coverage gaps and anonymizes actual public raw markers', () => {
  expect(data.coverage).toHaveLength(1);
  expect(data.coverage[0].gap).not.toBe('');
  expect(relaySessionHasGap(data.coverage[0])).toBe(true);
  expect(relaySessionGap(data.coverage[0].gap)).not.toBe('');
  expect(data.coverage[0].session_complete).toBe(false);
  expect(canaries.length).toBeGreaterThan(0);
  for (const marker of canaries) expect(relaySessionGap(marker)).toBe('存在未识别的覆盖缺口，保持未知');
});

it('accepts the actual canonical task and source timestamps and rejects invalid user query input', () => {
  expect(data.events.length).toBeGreaterThan(0);
  expect(relaySessionQueryError({ task_id: taskID, start: data.events.at(-1)!.ts, end: data.events[0].ts })).toBe('');
  expect(relaySessionQueryError({ task_id: 'invalid/task/id' })).not.toBe('');
  expect(relaySessionQueryError({ task_id: '00000000-0000-0000-0000-000000000000' })).not.toBe('');
  expect(relaySessionQueryError({ start: data.events[0].ts.slice(0, 10) })).not.toBe('');
});
