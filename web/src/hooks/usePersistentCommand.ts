import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/transport';
import { SwaCommandNotSubmittedError } from '../api/swa';
import { formatError } from './useReadState';

export interface CommandOutcome {
  requestID?: string;
  status: 'succeeded' | 'rejected' | 'unknown';
  message?: string;
}

export function commandDeliveryUnknown(cause: unknown) {
  if (cause instanceof SwaCommandNotSubmittedError) return false;
  return !(cause instanceof ApiError) || cause.status >= 500 && cause.status !== 501 || ['delivery_unknown', 'internal_error'].includes(cause.code);
}

/** 固定作用域仅保存公开请求身份；更换作用域须通过组件 key 重新挂载。 */
export function usePersistentCommand<T>(scope: string, describe: (result: T) => CommandOutcome, options?: {
  namespace?: string;
  failureMessage?: (cause: unknown) => string;
}) {
  if (!scope.trim()) throw new Error('命令需要固定作用域');
  const storageKey = `${options?.namespace ?? 'astrocyte:command:pending'}:${scope}`;
  const [initialScope] = useState(storageKey);
  if (initialScope !== storageKey) throw new Error('命令作用域变化时必须重新挂载组件');
  const [operationID, setOperationID] = useState(() => typeof window === 'undefined' ? '' : window.sessionStorage.getItem(storageKey) ?? '');
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(!!operationID);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const busy = useRef(false), blocked = useRef(!!operationID), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const apply = (key: string, response: T, requireIdentity = false) => {
    const outcome = describe(response);
    if (requireIdentity && outcome.requestID !== key || outcome.requestID !== undefined && outcome.requestID !== key) throw new Error('返回命令身份与原请求不一致');
    if (!['succeeded', 'rejected', 'unknown'].includes(outcome.status)) throw new Error('返回命令结果状态无法确认');
    const unknown = outcome.status === 'unknown';
    if (!unknown) window.sessionStorage.removeItem(storageKey);
    blocked.current = unknown;
    if (mounted.current) {
      setResult(response); setUncertain(unknown); setFailure(null);
      setError(outcome.status === 'succeeded' ? null : outcome.message ?? (unknown ? '命令结果未知，请只读取原收据核查。' : '命令已拒绝，请核查当前许可和输入。'));
      setNotice(outcome.status === 'succeeded' ? outcome.message ?? '命令结果已确认' : null);
    }
    return outcome;
  };
  const run = async (action: (key: string) => Promise<T>, received?: (response: T, outcome: CommandOutcome) => void, preparedID?: string) => {
    if (busy.current || blocked.current) return;
    if (preparedID !== undefined && !preparedID.trim()) throw new Error('已准备命令需要明确的原请求身份');
    const key = preparedID ?? crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, key);
    busy.current = true;
    setPending(true); setError(null); setNotice(null); setFailure(null); setResult(null); setOperationID(key);
    let completion: { response: T; outcome: CommandOutcome } | undefined;
    try {
      const response = await action(key);
      const outcome = apply(key, response);
      completion = { response, outcome };
    } catch (cause) {
      const unknown = commandDeliveryUnknown(cause);
      if (!unknown) window.sessionStorage.removeItem(storageKey);
      blocked.current = unknown;
      if (mounted.current) {
        setUncertain(unknown); setFailure(cause instanceof ApiError ? cause : null);
        setError(options?.failureMessage ? options.failureMessage(cause) : cause instanceof ApiError ? formatError(cause) : '命令结果未知，请只读取原收据核查。');
      }
    } finally { busy.current = false; if (mounted.current) setPending(false); }
    if (completion && mounted.current) received?.(completion.response, completion.outcome);
  };
  // 仅供实际只读收据查询确认同一请求；未知结果继续保留锁。
  const reconcile = (key: string, response: T) => {
    if (busy.current || key !== operationID || !key) throw new Error('只能核查当前原请求身份');
    return apply(key, response, true);
  };
  return { pending, uncertain, error, notice, failure, result, operationID, run, reconcile };
}
