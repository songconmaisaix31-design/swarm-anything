import { expect, it } from 'vitest';
import { formatDate, formatNumber } from './relayEventFormat';

it('明确输入的零值保留，缺失数值与日期保持暂无', () => {
  expect(formatNumber(0)).toBe('0');
  expect(formatNumber(null)).toBe('暂无');
  expect(formatNumber(undefined)).toBe('暂无');
  expect(formatDate(null)).toBe('暂无');
  expect(formatDate(undefined)).toBe('暂无');
});

it('非法输入立即失败，不显示伪造数值或无效日期', () => {
  for (const input of [Infinity, -Infinity, NaN]) expect(() => formatNumber(input)).toThrow('事件数值必须为有限数字');
  expect(() => formatDate('invalid')).toThrow('事件时间无效');
});
