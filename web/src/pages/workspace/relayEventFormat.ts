const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });
export function formatNumber(value: number | null | undefined) {
  if (value == null) return '暂无';
  if (!Number.isFinite(value)) throw new Error('事件数值必须为有限数字');
  return numberFormatter.format(value);
}
export function formatDate(value: string | null | undefined) {
  if (!value) return '暂无';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('事件时间无效');
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}
