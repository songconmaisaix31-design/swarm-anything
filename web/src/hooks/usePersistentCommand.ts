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

export function readPersistentRequestID(storageKey: string, storage?: Pick<Storage, 'getItem'>): { operationID: string; error: string | null } {
  try {
    const saved = storage ? storage.getItem(storageKey) : typeof window === 'undefined' ? null : window.sessionStorage.getItem(storageKey);
    if (saved !== null && !saved.trim()) return { operationID: '', error: '保存的请求标识无效，当前命令已暂停。请保留并修复原记录后重新读取。' };
    return { operationID: saved ?? '', error: null };
  } catch { return { operationID: '', error: '无法读取保存的请求记录，当前命令已暂停。请恢复浏览器存储访问后重新读取。' }; }
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
  const [saved] = useState(() => readPersistentRequestID(storageKey));
  const [operationID, setOperationID] = useState(saved.operationID);
  const [storageError, setStorageError] = useState(saved.error);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(!!operationID);
  const [error, setError] = useState<string | null>(saved.error);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const busy = useRef(false), blocked = useRef(!!operationID || !!saved.error), mounted = useRef(false);
  const settled = useRef<{ key: string; error: string | null } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const clearSavedRequest = () => {
    try { window.sessionStorage.removeItem(storageKey); return null; }
    catch { return '请求已结束，但浏览器未能清除请求记录。后续提交已暂停，请重新读取请求记录。'; }
  };
  const reloadPending = () => {
    if (busy.current || !storageError) return;
    const current = readPersistentRequestID(storageKey);
    if (current.error) {
      blocked.current = true;
      setStorageError(current.error); setError([settled.current?.error, current.error].filter(Boolean).join(' '));
      return;
    }
    if (settled.current && (!current.operationID || current.operationID === settled.current.key)) {
      const cleanupError = current.operationID ? clearSavedRequest() : null;
      blocked.current = !!cleanupError;
      setStorageError(cleanupError); setError([settled.current.error, cleanupError].filter(Boolean).join(' ') || null); setUncertain(false);
      if (!cleanupError) setOperationID('');
      return;
    }
    blocked.current = !!current.operationID || !!current.error;
    setOperationID(current.operationID); setStorageError(current.error); setError(current.error); setUncertain(!!current.operationID);
  };
  const apply = (key: string, response: T, requireIdentity = false) => {
    const outcome = describe(response);
    if (requireIdentity && outcome.requestID !== key || outcome.requestID !== undefined && outcome.requestID !== key) throw new Error('返回命令身份与原请求不一致');
    if (!['succeeded', 'rejected', 'unknown'].includes(outcome.status)) throw new Error('返回命令结果状态无法确认');
    const unknown = outcome.status === 'unknown';
    const message = outcome.status === 'succeeded' ? null : outcome.message ?? (unknown ? '命令结果未知，请只读取原收据核查。' : '命令已拒绝，请核查当前许可和输入。');
    const cleanupError = unknown ? null : clearSavedRequest();
    settled.current = unknown ? null : { key, error: message };
    blocked.current = unknown || !!cleanupError;
    if (mounted.current) {
      setResult(response); setUncertain(unknown); setFailure(null); setStorageError(cleanupError);
      setError([message, cleanupError].filter(Boolean).join(' ') || null);
      setNotice(outcome.status === 'succeeded' ? outcome.message ?? '命令结果已确认' : null);
    }
    return outcome;
  };
  const run = async (action: (key: string) => Promise<T>, received?: (response: T, outcome: CommandOutcome) => void, preparedID?: string) => {
    if (busy.current || blocked.current) return;
    if (preparedID !== undefined && !preparedID.trim()) throw new Error('已准备命令需要明确的原请求身份');
    const key = preparedID ?? crypto.randomUUID();
    try { window.sessionStorage.setItem(storageKey, key); }
    catch {
      const message = '无法保存请求记录，命令尚未发送。请恢复浏览器存储写入后重新读取。';
      blocked.current = true;
      setStorageError(message); setError(message);
      return;
    }
    busy.current = true;
    settled.current = null;
    setPending(true); setError(null); setNotice(null); setFailure(null); setResult(null); setOperationID(key);
    let completion: { response: T; outcome: CommandOutcome } | undefined;
    try {
      const response = await action(key);
      const outcome = apply(key, response);
      completion = { response, outcome };
    } catch (cause) {
      const unknown = commandDeliveryUnknown(cause);
      const message = options?.failureMessage ? options.failureMessage(cause) : cause instanceof ApiError ? formatError(cause) : cause instanceof SwaCommandNotSubmittedError ? `命令尚未提交：${cause.message}` : '命令结果未知，请只读取原收据核查。';
      const cleanupError = unknown ? null : clearSavedRequest();
      settled.current = unknown ? null : { key, error: message };
      blocked.current = unknown || !!cleanupError;
      if (mounted.current) {
        setUncertain(unknown); setFailure(cause instanceof ApiError ? cause : null); setStorageError(cleanupError);
        setError([message, cleanupError].filter(Boolean).join(' '));
      }
    } finally { busy.current = false; if (mounted.current) setPending(false); }
    if (completion && mounted.current) received?.(completion.response, completion.outcome);
  };
  // 仅供实际只读收据查询确认同一请求；未知结果继续保留锁。
  const reconcile = (key: string, response: T) => {
    if (busy.current || key !== operationID || !key) throw new Error('只能核查当前原请求身份');
    return apply(key, response, true);
  };
  return { pending, uncertain: uncertain || !!storageError, error, notice, failure, result, operationID, storageError, reloadPending, run, reconcile };
}
