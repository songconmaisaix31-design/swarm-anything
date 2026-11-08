export interface S1Server {
  apiURL: string;
  webURL: string;
  dataDir: string;
  temporary: string;
  localAppData?: string;
  relayRoot?: string;
  logsDirectory: string;
  processLogs: { name: string; pid: number | null; stdout: string; stderr: string }[];
  /** 传入将重新抛出的首个错误；清理失败保留在 stderr 与 cleanupError。 */
  close(options?: { preserveData?: boolean; primaryError?: unknown }): Promise<void>;
  restart(): Promise<void>;
  stopAPI(): Promise<void>;
  startAPI(): Promise<void>;
  query(sql: string, ...parameters: (string | number)[]): Record<string, string | number | null>[];
}
export function startS1Server(options?: {
  /** 明确选择独立 SWA composition；默认保留原产品测试。 */
  product?: 'legacy' | 'swa';
  browser?: boolean;
  /** 显式隔离 Relay 的 LOCALAPPDATA 和 v0.2-access，默认注册表为空。 */
  relay?: boolean;
  /** 独立验收端口，拒绝个人 5173/8787。 */
  apiPort?: number;
  webPort?: number;
  /** 明确的绝对产物根；也可由 ASTROCYTE_TEST_OUTPUT_ROOT 配置。 */
  outputRoot?: string;
  /** 原 helper 精确目录与主控批准的根；重用后继续保留资料。 */
  reuseOwnedTemporary?: { path: string; ownedRoot: string };
  env?: Record<string, string> | ((paths: { dataDir: string; temporary: string }) => Record<string, string> | Promise<Record<string, string>>);
}): Promise<S1Server>;
