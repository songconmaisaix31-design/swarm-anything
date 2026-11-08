/** 读取请求保留加载、错误与过期状态；已卸载或被取代的请求不再更新页面。 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { ApiError } from '../api/transport';

export interface ReadApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  retry: () => void;
}

export function formatError(err: unknown): string {
  if (err instanceof ApiError) return `API ${err.status} [${err.code}]: ${err.message} · ${err.detail.error.required_action || '请检查服务后重试'}（请求 ${err.requestId}）`;
  if (err instanceof Error) return err.message;
  return '未知错误';
}

export function useReadApi<T>(
  fetcher: (signal?: AbortSignal) => Promise<T>,
  options: { enabled?: boolean; key?: string; refreshMs?: number; retainDataOnError?: (error: unknown) => boolean } = {},
): ReadApiState<T> {
  const { enabled = true, key = '', refreshMs } = options;
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: string | null;
    stale: boolean;
    key: string;
  }>({ data: null, loading: true, error: null, stale: false, key });

  // 保存最新 fetcher，避免函数引用变化触发重复请求。
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; });
  const retainDataOnErrorRef = useRef(options.retainDataOnError);
  useEffect(() => { retainDataOnErrorRef.current = options.retainDataOnError; });

  const fetchIdRef = useRef(0);
  const mountedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);

  // 状态更新在 await 后执行，避免在 effect 内同步更新。
  const execute = useCallback(async () => {
    const id = ++fetchIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    pendingRef.current = true;
    // 后续代码进入微任务队列。
    await Promise.resolve();
    if (!mountedRef.current || !enabled || id !== fetchIdRef.current) return;

    setState(prev => ({ data: prev.key === key ? prev.data : null, loading: true, error: null, stale: prev.key === key && prev.stale, key }));
    try {
      const result = await fetcherRef.current(controller.signal);
      if (mountedRef.current && id === fetchIdRef.current) {
        setState({ data: result, loading: false, error: null, stale: false, key });
      }
    } catch (err: unknown) {
      if (mountedRef.current && id === fetchIdRef.current) {
        setState(prev => {
          const data = retainDataOnErrorRef.current?.(err) === false ? null : prev.data;
          return { ...prev, data, loading: false, error: formatError(err), stale: !!data };
        });
      }
    } finally {
      if (id === fetchIdRef.current) pendingRef.current = false;
    }
  }, [enabled, key]);

  // 挂载时读取当前资源。
  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      // 切换资源时先清除先前详情。
      void Promise.resolve().then(() => {
        if (!mountedRef.current) return;
        setState({ data: null, loading: true, error: null, stale: false, key });
        void execute();
      });
    }
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- 使未完成请求失效
      ++fetchIdRef.current;
    };
  }, [execute, enabled, key]);

  useEffect(() => {
    if (!enabled || !refreshMs) return;
    const timer = window.setInterval(() => { if (!pendingRef.current) void execute(); }, refreshMs);
    return () => window.clearInterval(timer);
  }, [enabled, refreshMs, execute]);

  const retry = useCallback(() => {
    if (!mountedRef.current || !enabled) return;
    setState(prev => ({ ...prev, loading: true, error: null }));
    void execute();
  }, [execute, enabled]);

  return { data: enabled && state.key === key ? state.data : null, error: enabled && state.key === key ? state.error : null, stale: enabled && state.key === key && state.stale, loading: enabled && (state.key !== key || state.loading), retry };
}
