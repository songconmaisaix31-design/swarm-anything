import type { RelaySessionCoverage, RelaySessionQuery } from '../../api/relaySession';

const gapLabels: Record<string, string> = {
  prefix_unverified: '会话前缀尚未核实', source_unavailable: '原生来源尚不可用',
  source_unbound: '来源尚未绑定', binding_unverifiable: '身份绑定无法核实',
  capture_not_started: '尚无采集结果', source_unavailable_or_redirected: '获准来源不可读取',
  selection_denied: '来源选择被拒绝', source_open_failed: '来源读取失败',
  source_read_failed: '来源读取失败', source_replaced: '来源已替换', source_truncated: '来源已截断',
  session_or_cwd_changed: '会话身份或工作区已变化', duplicate_event_conflict: '重复事件发生冲突',
  closed_incomplete_tail: '会话结束时仍有未完成行', capture_blocked_requires_reconciliation: '采集已阻断，需要核对',
  unknown_format: '存在未知格式', first_capture_failed: '首次采集失败', admission_failed: '独立应用事件接入失败',
  capture_pending: '采集尚未完成', unknown_records: '存在未识别记录', malformed_json: '存在无法解析的记录',
  archive_not_selected: '尚未选定获准原生归档', binding_not_recorded: '尚无会话绑定记录', permission_denied: '当前权限被拒绝',
  checkpoint_unavailable: '采集游标不可用', checkpoint_save_unknown: '游标保存结果未知', admission_unknown: '事件接入结果未知',
  append_only_unverified: '追加写入条件尚未核实', source_not_finalized: '原生来源尚未封存', exit_unverified: '退出证据尚未核实',
};
export function relaySessionGap(gap: string) {
  return gap ? gapLabels[gap] || '存在未识别的覆盖缺口，保持未知' : '未报告缺口；仍须分别核对文件快照和会话生命周期';
}
export function relaySessionHasGap(coverage: RelaySessionCoverage) {
  return !!coverage.gap || coverage.unknown > 0 || coverage.errors > 0 || coverage.tail_bytes > 0 || coverage.remaining_bytes > 0;
}
export function relaySessionQueryError(query: RelaySessionQuery) {
  if (query.task_id && (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(query.task_id) || query.task_id === '00000000-0000-0000-0000-000000000000')) return '任务 ID 需要规范且非空的 UUID。';
  for (const value of [query.start, query.end]) {
    if (value && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))) return '时间需要带时区的 RFC3339 格式。';
  }
  return query.start && query.end && Date.parse(query.start) > Date.parse(query.end) ? '开始时间不能晚于结束时间。' : '';
}
