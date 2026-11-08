import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RelaySessionCoverage } from '../../api/relaySession';
import { RelaySessionCoverageCard } from './relaySessionEvents';

// 明确参数只验证覆盖声明的显示边界，不表示实际会话采集完成。
const input: RelaySessionCoverage = { source: 'archive', task_id: 'input-task', project_id: 'input-project', terminal_id: 'input-terminal', worktree_id: 'input-worktree', status: 'partial', snapshot_complete: true, session_complete: false, gap: 'prefix_unverified', lines: 3, projected: 2, duplicates: 0, unknown: 1, errors: 0, unknown_tokens: 1, remaining_bytes: 0, tail_bytes: 0 };

it('归档输入将当前字节快照与协议生命周期分开，部分覆盖与unknown保持可见', () => {
  const html = renderToStaticMarkup(<RelaySessionCoverageCard item={input} />);
  expect(html).toContain('获准原生归档文件');
  expect(html).toContain('当前文件快照：已读完当前冻结字节范围');
  expect(html).toContain('所选来源协议生命周期：尚未核实');
  expect(html).toContain('部分覆盖');
  expect(html).toContain('不能据此宣称会话完整');
  expect(html).toContain('未知格式');
  expect(html).toContain('Token 未知');
});

it('公开通知输入使用通知单位，零字节不表示归档完整', () => {
  const html = renderToStaticMarkup(<RelaySessionCoverageCard item={{ ...input, source: 'native_notifications' }} />);
  expect(html).toContain('来源协议：原生公开通知');
  expect(html).toContain('当前公开通知范围：已处理当前已接收通知');
  expect(html).toContain('零字节不证明原生归档完整');
  expect(html).toContain('协议未公开的内部事件仍在此覆盖范围之外');
  expect(html).not.toContain('当前文件快照');
});

it('缺口或来源未知时完整主张保持未核实，公开输入中的未知原因不原样显示', () => {
  for (const source of [undefined, 'unknown', 'archive'] as const) {
    const html = renderToStaticMarkup(<RelaySessionCoverageCard item={{ ...input, source, status: 'complete', session_complete: true, gap: 'input-private-marker' }} />);
    expect(html).toContain('完整主张尚未核实');
    expect(html).not.toContain('input-private-marker');
  }
});
