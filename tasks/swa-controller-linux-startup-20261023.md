# Linux Controller 启动参数修复

基线 `214ab146c33680504c39216d7ad41863c834177c`，原 S50 N4 请求 `52573151-edbc-409c-9210-21efdad053f0` 及安装、账本、证据保持原状。无 Worker/模型已启动；原请求与运行退出继续是 UNKNOWN/pending，不重发、不改写为已拒绝完成。产品写域仅 `runtime/swa-orca/src/native-methods.ts`，验证写域 `tests/swa-cli-headless/controller-startup.test.mjs`、必要真实生产模块验证入口及本记录；临时 bundle/回执只在 `.verification/controller-linux-startup/`。

最小复现与根因：`createController` 向 Linux `runtime.createTerminal` 传 `shellOverride:'/bin/bash'`；原 `terminal-shell-override-host-support.ts` 的 `terminalShellOverrideRefusal` 对任意非 Windows 非空 override 同步返回 `No terminal was created; omit --shell.`。与原 CLI-3 的 `operation_unknown` message 一致。已有 effect/checkpoint 导致上层原账本保留 pending，服务关闭报 pending；本修复不弱化这一规则。

正式启动合同：Linux 省略 per-terminal shell override，由原 daemon `resolvePtyShellPath` / `resolveUnixShellPath` 决定实际本地 shell；`createPtyShellLaunchPlan` 与 `terminal-host-session-create` 使用原 shell-ready barrier 和一次启动命令输入。`startupCommandDeliveredInShellArgs` 是 Windows 启动链的分支判断，不能拿它要求 Linux argv 已投递。Windows 保留 `pwsh.exe`、原 PowerShell quoting 和已有 argv delivery 校验。SSH/非 Linux-Windows 仍拒绝，不引入自定义 shell fallback。

实施：把现有创建 options 同文件提为纯 `controllerTerminalOptions`，由实际 `createController` 唯一调用，便于局部真实生产参数验证；原 command/env/launchConfig/title/后台/handle 均沿用，仅 Linux options 不含 shellOverride，Windows 保留。原 checkpoint、create 去重、helper identify/observe、PTY incarnation/ancestry/authority 检查不变。

测试计划（06 先审）：①用实际生产拒绝函数复现旧 Linux override 错误，实际 options 的 Linux 无 override/Windows pwsh 通过对应本地 host 规则，保 SSH 拒绝和 Windows 原 argv 可交付检查；不 mock process.platform 或伪造宿主成功。②局部 esbuild 编译此 options 消费入口、原 `TerminalHost`+`createPtySubprocess` 和真实 `controller-helper.ts`（不构建整个候选）；独占空目录、真实 node-pty、原 shell-ready启动路径执行实际 helper，发送真实 identify 请求，核实际 helper PID/原回显 handle/ready 及 Linux 进程身份；再发送第二个不同 identify 请求确认同一 helper/PID，正常 EOF 关闭并等待完整进程消失，原 host dispose/listSessions 为空。此例明确只证明本地 production PTY/helper 启动链，完整 RPC controller.open/Run/Worker/模型仍留给下一候选验收，不伪称覆盖。测试不会创建 Agent 会话、读取账号或调用模型。③scoped strict TypeScript、diff 检查；失败先说明最小复现、证据及局部修正结果，不启动 full build。现有安装、旧服务和旧 R 不作为测试写入目标。局部输出预计数十 MiB 内，无 node_modules 复制。

停止条件：真实 helper 未识别、第二请求 PID 不同、关闭后仍有所属进程、启动遇其他真实错误，都保留失败及原件并交 Root/06，不通过替换真实 provider、关闭 barrier 或缩短库存核验获得通过。

## 实际局部结果

Root 与 06 已接受上述窄计划。生产修改仅 options 抽取和 Linux 省略 override；严格 TypeScript 命令 `node runtime/swa-orca/node_modules/typescript/bin/tsc -p runtime/swa-orca/tsconfig.json --pretty false` 返回 0（工具 chunk `b1f0df`，之后生产文件未再修改）。`git diff --check` 返回 0。

保留的局部失败与修正：`run-xusHYC` 在加载验证 bundle 时找不到外置 `@orca/windows-security`，未 spawn；修为通过当前真实 runtime package 解析绝对入口。`run-0RT3z4` 参数规则通过，但源码工作区 node-pty 缺已编 `pty.node`，仍未 spawn；明确改为只读 S50 安装的真实 node-pty 1.1.0，不编译替身、不改安装。`run-2ytdCf` 已真实 spawn，原启动 barrier 投递成功；测试 identify 漏 `type`，原 helper Zod 拒绝并退出 1；修为用原 `helperInput.parse` 生成完整协议。`run-9Lt10c` 的真实原始转录已有 ready 回复，测试自写行读取漏行首 CR，超时后 dispose；报告保持 FAIL/natural_eof=false；改为复用正式 helperCall 的 `createIncrementalNdjsonFramer`。所有失败在重试前向 Root/06 与用户说明；没有任何 full build 或旧请求重发。

参数规则在原实际生产 `terminalShellOverrideRefusal` 与 `resolveWindowsShellLaunchArgs` 上通过：旧 Linux override 复现明确拒绝、新 Linux 无 override、本地 Windows pwsh/argv 可交付、SSH 仍拒绝（chunk `b8556f`、`43e178` 中该单项均 PASS）。之后只重跑受测试读取修正影响的真实 PTY 项，未重复无关检查。

最终命令：`SWA_CONTROLLER_TEST_EXECUTABLE=/workspace/swa-linux-installs/swa-linux-combined-50d099dd-n46-01/swa /workspace/swa-linux-installs/swa-linux-combined-50d099dd-n46-01/node/node --test --test-name-pattern='actual native PTY' tests/swa-cli-headless/controller-startup.test.mjs` 返回 0，1/1 PASS（chunk `356292`）。实际证据 `.verification/controller-linux-startup/run-s9sBVa/actual-controller-report.json` 与同目录原始转录：真实 Node v24.21.0/ABI137、node-pty 1.1.0；addon SHA256 `5539284a93b319e7923a5a0510e4f5645d9714173f04b37ba9b41d81585c4e40`。两次原 identify 的 helper/root PID 同为 `330427`，相同 boot/start_ticks/uid；启动 `written=true`、`queuedByShellReadyBarrier=true`、`viaShellArgs=false`；EOF 正常 `exitCode=0`，dispose 前已确认所属进程消失和 listSessions 空。报告 `natural_eof=true`，未把 dispose 代替正常关闭证明。

覆盖范围只限本次生产参数、真实本地 TerminalHost/PTY/helper 与 Linux 生命周期；Windows 此处仅真实生产参数规则，不是 Windows 原生运行。完整 RPC controller.open、Run、Worker、模型均未运行，原 S50 pending/UNKNOWN 原件保持。后续完整候选须由 Root 在整合已审修复后单独执行。
