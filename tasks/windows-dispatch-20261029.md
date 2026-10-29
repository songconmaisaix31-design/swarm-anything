# Windows Swarm CLI 派发修复

- 用户于 2026-10-29 明确要求使用 Swarm CLI，并批准在独立分支修复阻塞该调度的缺陷。
- 基线：已安装版本 `893fb8852e15109ca9a99f1bd51d83ea249a37b8`。
- 分支：`codex/swa-windows-dispatch-20261029`；工作目录：`C:/Users/DW/Documents/ChatGPT/swa-windows-fix`。
- 复现：真实 Windows 服务中 `controller open`、`task create` 成功；`worker start` 请求 `1c286be8-773c-46ca-ba3d-f669c0742d06` 返回 HTTP 409 / `operation_unknown`，原生校验报告创建选项只适用于新工作树。实际 Worker 列表为空，原请求仍 pending，未重发。
- 原因：`controller-helper.ts` 使用 `worktree: 'current'`，却把 Worker 名称同时写入仅供新建工作树使用的 `name` 字段。上游 `prepareLocalWorkerStart` 明确拒绝这个组合。
- 修复：Worker 名称只传入已有 `taskTitle`；同步严格准入比较，保持原任务、Agent、模型、输入和作用域校验。
- 写入范围：`runtime/swa-orca/src/controller-helper.ts`、`runtime/swa-orca/src/controller-admission.ts` 和本任务记录。主 Agent 单轨完成修复、测试及提交；不修改其他工作树。
- 验证：完整 strict TypeScript、架构检查、完整 Windows 候选构建和真实独立安装；通过真实 Swarm CLI 创建控制端、任务、分析 Worker，取得实际输出并停止、释放、获取成果和关闭。验证中发现的新错误保留原结果并继续定位。
- 运行范围：固定公开 `swarm-anything` main 源码，真实 OpenCode 2.0.31 / `deepseek/deepseek-v4-pro`，原生工具关闭；没有模型结果前不记为调用成功。
- 旧失败请求和私有数据保留；不自动重放未知请求，不修改已安装的旧候选或其数据库。

## Structured 模型选择

- 安装后的 `89a726a` 已通过工作树参数校验；真实派发请求 `ddb8c091-8a71-46a4-8300-e29c50611668` 随后被仅支持旧 TUI 版本的模型探测拒绝，Worker 列表为空。
- `local-worker-start.ts` 在已确定的 Structured 模式下使用 ACP 会话自己的模型应用与核验；只有终端模式执行 TUI 启动探测。先向实际 host 查询指定工作树的 Structured 支持，保持原生适配器版本、模型、账号和工具权限检查。
- 写入范围增加 `third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/worker/local-worker-start.ts`。执行完整 strict TypeScript 和 Windows 包构建，并以新独立安装真实运行模型验证，不将通过静态检查当作模型启动成功。
- 独立后台在自己的设置库中启用 Structured Pi/OpenCode 路由，并在派发预留之前检查实际工作树支持；不支持时立即拒绝。`host-entry.ts` 和 `native-methods.ts` 纳入写入范围。真实 `fe2de7ea` 安装验证确认：仅修改模型预检仍被默认终端路由阻塞。
- 独立后台的 `nativeChatPermissionMode` 固定为 `ask`，保留禁用工具策略。`1e72dd4e` 产生真实 Structured Dispatch `ctx_611df4a14e0b`，实际启动因默认 `full-access` 与受限策略冲突被拒绝；该错误不能通过移除受限检查解决。

## 安装与实际结果

四项修复分别提交为 `89a726a095caf4572ccdd8694128058d60a9d2e4`、`fe2de7eaf92031badcabc40a7a6e2a0592c65182`、`1e72dd4eceec4feede8d10d439f1207ad09117ec`、`9ba9530073f5ec28443d808bb8e2aa8360a18de3`。当前已运行安装位于 `C:/Users/DW/AppData/Local/SwarmCli/candidates/9ba95300-windows-20261029`，版本为 `9ba95300`；后继文档提交不改变此安装来源。没有修改 PATH、原安装、其他工作树、原服务或用户账号。

| 检查 | 实际结果 |
| --- | --- |
| `node runtime/swa-orca/node_modules/typescript/bin/tsc -p runtime/swa-orca/tsconfig.json` | 四次对应源码均通过；保持完整 strict，Node heap 8192 MiB |
| `node scripts/check-architecture.mjs` | 通过，47 个包 |
| `node scripts/build-swa-package.mjs --output <候选目录>` | 首次完整 Windows 构建通过：node-pty、windows-process-tree、windows-security、windows-registry 四项原生编译，固定 Node 24.21.0、Go 程序和 28251 条运行闭包检查通过 |
| 后继 `build-swa-package.mjs --node-inputs ... --native-source ... --native-work ... --native-evidence ...` | 原构建入口重新核验下载输入、来源及原生二进制后复用；当前 `dist/windows-permission-20261029` 构建退出 0，源码 `9ba95300` |
| `scripts/install-swa.ps1` | 独立目录安装成功，源码和保护目录检查通过，PATH 未修改 |
| 实际 `swa controller open` / `task create` / 两次 `worker start` | 新私有目录 `windows-main-final-20261029`，runtime `fc624b95-c244-4695-b3c9-aae3b6e23380`；两次真实 OpenCode 2.0.31 / `deepseek/deepseek-v4-pro` 模型完成，未调用原生工具 |
| 两次 `swa worker stop`、两次 `worker release` | 全部退出 0，原生状态分别 `stopped`、`released`；每个原生 Job 的成员退出被观察到 |
| `swa task result`、`task complete`、`controller close` | 全部退出 0；完整原生 SQLite 来源、journal、实际用量导出，根任务完成、控制端关闭 |

实际 Run `run_b25627644463`、根任务 `task_495beaccb536`、Dispatch `ctx_2a3e12835918` / `ctx_e660c4abd71a`；最终消息 `msg_1851c7f78001F2t1BP5kLIXeCR` / `msg_1851e227f001CTk37OTs0a3r8z` 完成且原生 `idle_outcome=succeeded`。另一组较早 Run `run_a0bbb93e961d` 的两个模型输出也已从实际 SQLite 读取，但其释放遇到服务退出，不能算闭环通过。

使用 Swarm CLI 安排只读 main/CLI Reviewer。四项修复与原因匹配，独立审查仅接受其限定方向和正常流程；主 Agent 执行实际检查，模型未声称执行测试。没有使用 Orca CLI。审查生成的命令文本未执行。最终已关闭此次验证服务：HTTP 正常关闭、Job 子进程退出、四个已观察服务 PID 不再存在；Ctrl+C 后外层终端退出 1，未将它记录为退出 0。

构建原件在本目录 `.verification/windows-dispatch-20261029/`；实际服务命令、DPAPI 凭据和结果在 `C:/Users/DW/Documents/ChatGPT/swarm-anything/.verification/windows-20261029/final-cli/`，不提交凭据、私有数据库或 11 MB 原生结果。`exported-result/result.json` 是实际 `swa task result` 输出。模型费用及资源使用沿用户既有许可，资源解除决定以当前 main 的 `docs/RESOURCES.md` 为准。

## 未通过范围

- `runtime/swa-orca/src/native-methods.ts` 的 `requireReleased` 要求每条 Worker 记录具有 released resource；原生失败 Worker 从未取得 resource 时，`worker.release` 返回 `no_owned_resource`，正常关闭仍被拒绝。尚未修复，不能直接将无资源记录当作已释放。
- 前置校验与磁盘满过程中留下的 pending 请求保留，没有重发、删除或改写回执。原有失败数据目录保持不动。
- 原验证服务退出后，原后台 Job 归属无法核验，同目录重启返回 `operation_unknown`；此次没有绕过归属检查。正常新目录结果不证明中断恢复通过。
- main 的 Go OpenCode 1.18.35 适配器与本 CLI 的 ACP 是不同路径；本机新版入口不兼容及完整 main 检查失败范围见另一个 Windows 任务。
- 尚未验证 Pi 模型正向调用、全部异常资源回收、存活 Worker 的后续输入及全部安装验收。未合并到 main，未创建 Release。
