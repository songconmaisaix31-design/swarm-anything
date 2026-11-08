import { expect, it } from 'vitest';
import { ApiError } from '../../api/transport';
import { commandError } from '../commandError';

it('makes unknown delivery a human reconciliation step and keeps diagnostics separate', () => {
  const result = commandError(new ApiError(503, { schema_version: 1, error: { code: 'delivery_unknown', message: 'native process missing receipt', required_action: 'inspect_external_result', retryable: true, request_id: 'r1' } }));
  expect(result.message).toContain('不要重复创建作业');
  expect(result.message).not.toContain('native process');
  expect(result.detail).toContain('r1');
});

it('retains actionable Chinese guidance from the actual backend and treats lost response conservatively', () => {
  expect(commandError(new ApiError(403, { schema_version: 1, error: { code: 'scope_denied', message: 'scope check denied', required_action: '请先批准该项目的目录范围', retryable: false, request_id: 'r2' } })).message).toBe('请先批准该项目的目录范围');
  expect(commandError(new TypeError('Failed to fetch')).message).toContain('不会自动重发');
});
