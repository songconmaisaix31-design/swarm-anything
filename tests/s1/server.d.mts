export interface S1Server {
  apiURL: string;
  webURL: string;
  dataDir: string;
  temporary: string;
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
  browser?: boolean;
  /** 独立验收端口，拒绝个人 5173/8787。 */
  apiPort?: number;
  webPort?: number;
  /** 明确的绝对产物根；也可由 ASTROCYTE_TEST_OUTPUT_ROOT 配置。 */
  outputRoot?: string;
  env?: Record<string, string> | ((paths: { dataDir: string; temporary: string }) => Record<string, string> | Promise<Record<string, string>>);
}): Promise<S1Server>;
