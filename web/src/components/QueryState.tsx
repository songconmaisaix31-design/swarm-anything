import type { ReactNode } from 'react';
import type { ReadApiState } from '../hooks/useReadState';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';

/** 读取失败保留非空快照与过期提示，过期空集合显示读取错误。 */
export function QueryState<T>({ state, children, empty, emptyTitle = '暂无记录' }: { state: ReadApiState<T>; children: (data: T) => ReactNode; empty?: (data: T) => boolean; emptyTitle?: string }) {
  if (!state.data) {
    if (state.loading) return <p role="status">加载中…</p>;
    if (state.error) return <ErrorState message={state.error} onRetry={state.retry} />;
    return <EmptyState title={emptyTitle} />;
  }
  const isEmpty = empty?.(state.data);
  if (state.stale && isEmpty) {
    if (state.loading) return <p role="status">正在刷新…</p>;
    if (state.error === null) throw new Error('过期空集合缺少读取错误');
    return <ErrorState message={state.error} onRetry={state.retry} />;
  }
  return <>
    {state.loading && <p role="status">正在刷新…</p>}
    {state.stale && <div role="alert">数据可能已过期：暂未取得新记录，保留上次已加载内容。<button className="ac-button secondary compact" type="button" onClick={state.retry}>重试加载</button><details><summary>加载详情</summary>{state.error}</details></div>}
    {isEmpty ? <EmptyState title={emptyTitle} /> : children(state.data)}
  </>;
}
