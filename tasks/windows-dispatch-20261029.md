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

前一批四项修复分别提交为 `89a726a095caf4572ccdd8694128058d60a9d2e4`、`fe2de7eaf92031badcabc40a7a6e2a0592c65182`、`1e72dd4eceec4feede8d10d439f1207ad09117ec`、`9ba9530073f5ec28443d808bb8e2aa8360a18de3`。本批源码为 `c8bc7a67ed75f7c2012bc9fa2a29abb5254d6b75`，已安装至 `C:/Users/DW/AppData/Local/SwarmCli/candidates/c8bc7a67-windows-20261029`。原 `9ba95300-windows-20261029` 安装和记录保留，没有修改 PATH、原安装、其他工作树、原服务或用户账号。

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

2026-10-29 后续授权：用户要求继续修复剩余 bug，保持当前分支。下一批写域为 `runtime/swa-orca/src/native-methods.ts`、必要的同模块回执/生命周期消费者、`cmd/swa` 的服务 Job 所属逻辑、对应真实验证脚本和本任务记录。先由 Swarm CLI Reviewer 核对测试计划；只允许依据持久原生状态证明启动前失败或实际进程退出，不以空 resource、过期 PID 或缺少 Job 句柄单独认定安全。正常、失败、活跃拒绝、未知保留及实际服务重启均须验证。

- 无资源失败 Worker 的关闭检查要求原生创建入口给出明确 `not_started`，并核对同 runtime、失败阶段、空所属资源、复用 worktree、原生与外层持久回执和在途请求。实际 `ctx_b0f62ae22695` 在配置改变后、原生创建前被拒绝，父子持久回执均保留标记，控制端关闭请求 `e5efaca9-1d1c-4d15-bcb8-8f695cfc5aa3` 返回成功。旧记录缺失此证明时继续拒绝。
- 前置校验与磁盘满过程中留下的 pending 请求保留，没有重发、删除或改写回执。原有失败数据目录保持不动。
- Windows 服务记录保存实际 OS Session。只有原 serve/daemon 身份均确认退出、同一 Session 的原 Job 返回 `ERROR_FILE_NOT_FOUND`，才允许建立新 Job。同一安装已通过正常退出重启、活跃第二 serve 拒绝，以及真实 daemon 被终止、原 serve 退出后同目录恢复。PID 复用、跨 Session、访问拒绝与旧记录缺失 Session 的拒绝保持静态检查范围。
- main 的 Go OpenCode 1.18.35 适配器与本 CLI 的 ACP 是不同路径；本机新版入口不兼容及完整 main 检查失败范围见另一个 Windows 任务。
- 尚未验证 Pi 模型正向调用、全部异常资源回收、存活 Worker 的后续输入及全部安装验收。未合并到 main，未创建 Release。

本批独立审查先使用 Swarm CLI `run_380c0f90b555 / ctx_cb496d4b4ae3`，后由同一 `c8bc7a67` 安装的 `ctx_d771ca31e0d3` 审核准确源码和实际结果；客户端均为 OpenCode 2.0.31 / `deepseek/deepseek-v4-pro`，原生工具关闭。最终审查接受上述两项修复，保留未真实触发的失败分支。

`go test -mod=readonly ./cmd/swa`、完整 strict TypeScript、完整 Windows 包构建和仓库外安装均退出 0；安装闭包为 28251 项。本批记录位于 CLI 工作树 `.verification/windows-dispatch-20261029/`，实际服务与审查证据位于 main 工作树 `.verification/windows-20261029/phase2-cli/`、`final2-cli/`、`final3-cli/`。

`9ba95300` 长审查任务两名 Worker 均已停止和释放；其两个后续发送请求因原生安装/配置准入未证明而保持 unknown，未重放。完整成果导出超过既定 12 MiB 上限而失败；两个实际 journal 分别为 11,605,953 和 14,122,026 字节，原始 SQLite 与已有审查正文保留，不能宣称该长任务完成了完整导出。

准确 `c8bc7a67` 的 Run `run_fc462cd9ae90` 两名实际 Reviewer 完成后均已停止、释放，控制端关闭成功。`task result` 返回 `native_opencode_result_policy_changed`：只读核对确认 config/auth 文件版本、credential ID/time_updated 及选中与私有凭据值相同，而全局 OpenCode SQLite/WAL 文件版本已变化。检查只输出比较结果，没有输出凭据。现有完整来源版本比较保持，导出失败及原数据库保留，没有将该任务的完整成果标记为通过。原件为 main 的 `final3-cli/policy-change-evidence.json`、`task-result-corrected.json` 和 `controller-close.json`。

准确源码的独立结论已发布为 [PR #12 COMMENT review](https://github.com/songconmaisaix31-design/swarm-anything/pull/12#pullrequestreview-5692203718)，限定接受同会话恢复和确定拒绝回收，不代表合并或完整 Windows 验收。

同一 `c8bc7a67` 安装后续 Run `run_4b49a894985d` 的两名 Worker 均完成实际审查；main Worker 多次后继输入保持同一原生会话，实际返回完成消息。两次 stop、两次 release、controller close 全部成功；完整 `task result` 返回 `evidence_missing`。只读权威 journal 核对 main 22,076,306 字节、CLI 2,998,138 字节，超过既定总上限 12 MiB。完整数据及未知请求保留，没有提高上限或将任务标记完成。来源为 main 的 `final5-cli/journal-bounds.json`、`task-result-final.json` 与 `controller-close.json`。

独立短任务 `task_76cfd48ec271 / run_ac524afaae94` 两名实际 Worker `ctx_87e5a7dda318`、`ctx_ee6145ac4244` 均完成，工具调用为 0。使用同一 `c8bc7a67` 安装和 OpenCode 2.0.31 / `deepseek/deepseek-v4-pro`；两次 stop、两次 release、task result、task complete、controller close 全部退出 0。完整原生正文、journal、usage 导出为 3,298,102 字节，证据位于 main 的 `final6-cli/exported-result/result.json`。长对话上限与原来源变化失败保持独立记录，完整 Windows 验收仍未通过。

## 服务关闭剩余缺陷与审核阻塞

正常短任务后 Ctrl+C 退出 1，`host-entry.ts` 全局检查报告 Worker 资源未释放。实际 SQLite 只有 `ctx_b0f62ae22695` 为空 resource；failed/terminal_create、原 epoch、无终端句柄、无残留，父子完成回执明确 `nativeCreation=not_started`，原控制端关闭成功，全局 pending 为 0。全局关闭拒绝任何空 resource，与 `native-methods.ts` 控制端关闭严格验证未创建证明的行为不一致。四个服务进程已全部退出，未修改数据库。

新增单轨计划：写域为 `runtime/swa-orca/src/native-methods.ts`、`host-entry.ts` 和本任务；拟复用现有严格证明，核对准确父子回执、Run/root/dispatch 归属、effects、空残留、原生身份缺席及无 pending。重启产生新 runtime ID，历史 epoch 还须准确控制端关闭回执、两次实际原进程退出观察；现有控制端当前 epoch 检查保持。计划要求 strict TypeScript、实际源码运行文件构建、真实同库恢复和关闭，以及空间允许时完整安装包；不采用模拟数据、增大超时或删除历史失败记录。

计划通过 Swarm `run_a82f9c777cd3` 提交独立审核，但两个 Worker 均在 terminal_create 失败：`ctx_78051cab76c1` 实际原生版本探测超时；`ctx_cc918f6333ab` 返回 `native_opencode_source_changed`。没有审核结论，计划未实施。首次服务重启 daemon 超时，后继启动成功；来源及运行超时仍是真实限制。

两个失败 Worker 的 stop 返回 alreadySettled/failed 和 processAction=none，公开结果为 operation_unknown；controller close 返回 worker_release_unconfirmed。服务退出时报告资源未释放及 daemon busy。按本次回执核对 PID/创建时间/名称后，清理本次 helper 和 shell，daemon、OpenConsole 随之退出。原请求、SQLite、会话和原生未释放状态保留；进程退出不能代替释放确认。实际证据位于 main 的 `final7-cli/`。

C 盘约剩 260 MiB；自动审批拒绝删除本次旧构建副本，目录保持。新增修复计划未审、新源码与新安装包均未产生。当前已安装源码仍为 `c8bc7a67`；本批实际正常链通过、历史异常和关闭问题未通过。
