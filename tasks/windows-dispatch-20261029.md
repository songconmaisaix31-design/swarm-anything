# Windows Swarm CLI 派发修复

## 当前 Agent 发现与角色卡功能

本轮从 `fd8c3ae8e8a2c22c3fb78407d8e121c99e85520f` 接续。用户要求发现本地全部注册 Agent、即时取得实际 CLI 版本，并通过内置角色卡进行多 Agent 协作。保持单轨开发；主客户端 Local Codex，独立 Swarm Reviewer 使用 OpenCode 2.0.31 / `deepseek/deepseek-v4-pro`，固定公开输入与关闭工具。

写域为 `cmd/swa/main.go`、`internal/workspace/app/orca_execution.go`、`runtime/swa-orca/src/{agent-discovery,contracts,controller-helper,controller-admission,worker-roles}.ts`、`contracts/swa-cli.schema.json`、生成类型、`runtime/swa-orca/USAGE.md`、`docs/SPEC.md` 及本任务。复用两张既有 Agent 注册表、Windows PATH 读取和原版本探测；角色通过已有 command、Task spec 和原生消息持久化。

独立静态核查确认唯一注册并集为45项。能力发现使用TUI注册命令/别名及命令覆盖，执行选择保持ACP规则；该补充计划由同一Swarm Reviewer接受。本机没有Antigravity实际安装时，`agy`正向探测保持未验。构建产物后继放在D盘专用交付目录，C盘的原数据库与验证记录继续保留。

测试计划由 Swarm Reviewer `ctx_463eaa6bfc0d` 接受。验收包括实际注册表并集和版本、Windows 不支持状态、未知角色在写入前拒绝、缺省角色保持原输入、同库两个真实不同角色 Worker 的完整输入/结果及停止释放关闭。运行 Go CLI、完整 strict TypeScript、契约、架构、完整 Windows 构建和独立安装。SQLite schema 不变，已有任务读取与新任务并发在同一真实库核查；其他平台未运行时明确保留。验证记录位于主线 `.verification/windows-20261029/phase8/` 及本目录 `.verification/windows-dispatch-20261029/`。

- 用户于 2026-10-29 明确要求使用 Swarm CLI，并批准在独立分支修复阻塞该调度的缺陷。
- 基线：已安装版本 `893fb8852e15109ca9a99f1bd51d83ea249a37b8`。
- 分支：`codex/swa-windows-dispatch-20261029`；工作目录：`C:/Users/DW/Documents/ChatGPT/swa-windows-fix`。
- 复现：真实 Windows 服务中 `controller open`、`task create` 成功；`worker start` 请求 `1c286be8-773c-46ca-ba3d-f669c0742d06` 返回 HTTP 409 / `operation_unknown`，原生校验报告创建选项只适用于新工作树。实际 Worker 列表为空，原请求仍 pending，未重发。
- 原因：`controller-helper.ts` 使用 `worktree: 'current'`，却把 Worker 名称同时写入仅供新建工作树使用的 `name` 字段。上游 `prepareLocalWorkerStart` 明确拒绝这个组合。
- 修复：Worker 名称只传入已有 `taskTitle`；同步严格准入比较，保持原任务、Agent、模型、输入和作用域校验。
- 写入范围：`runtime/swa-orca/src/controller-helper.ts`、`runtime/swa-orca/src/controller-admission.ts` 和本任务记录。主 Agent 单轨完成修复、测试及提交；不修改其他工作树。
- 验证：完整 strict TypeScript、架构检查、完整 Windows 候选构建和真实独立安装；通过真实 Swarm CLI 创建控制端、任务、分析 Worker，取得实际输出并停止、释放、获取成果和关闭。验证中发现的新错误保留原结果并继续定位。

## 实际能力发现

源码 `b5b2a8aa4e677c008a148c15607fd103d40ba039` 把发现与执行分开：无项目选择时使用 TUI 注册命令、别名与命令覆盖，执行选择继续使用 ACP 命令及其 `ignoreAgentCommandSetting` 规则。完整 strict TypeScript、`go test -mod=readonly ./cmd/swa`、47 包架构检查通过。

候选 `dist/windows-discovery-20261029` 完整构建成功，固定 Node 24.21.0、四项复用原生模块和 28251 路径闭包。候选直接从自身目录运行，安装根由可执行文件目录取得，未修改 PATH。

在 `127.0.0.1:64811` 的真实 `swa serve` 上，用只读 `observe` 授权取得项目凭据后执行 `swa capabilities --json`（`service-discovery` 私有数据根）：

- `swa.capabilities.v1`，源码 `b5b2a8aa`，平台 win32，注册并集 45 项且唯一 45 项，与静态核对一致。
- `roles` 返回 `developer`、`reviewer`、`coordinator` 三张角色卡及职责。
- 10 项实际安装并返回真实版本：pi 1.0.1、codex 0.164.0、claude 2.1.238、grok 1.0.34、opencode 2.0.31、opencode2 2.0.31、qoder 1.1.64、kimi 2.1.1、qwen-code 0.24.6、openclaw 2026.6.11。
- 直接执行 `codex --version`、`claude --version`、`opencode --version` 得到 `codex-cli 0.164.0`、`2.1.238 (Claude Code)`、`opencode v2.0.31`，与发现结果一致；先前记录的 codex 0.162.0 已被当前版本替换，说明每次读取的是当前 CLI 实际版本。
- 本机已安装 Antigravity 桌面程序，但 `agy` 不在 PATH，`agy` 保持 unavailable；没有伪造该正向结果。

原件为 `.verification/windows-dispatch-20261029/capabilities-b5b2a8aa.json` 与 `capabilities-summary.json`。该步骤只执行发现与版本探测，没有模型调用或原生工具授权；项目凭据仅存在于该 PowerShell 进程内，未写入文件或日志。

## 实际角色卡协作

同一候选 `b5b2a8aa` 与同一私有服务上，为本机公开项目 `C:\Users\DW\Documents\ChatGPT\swa-windows-fix` 建立 `read_context/observe/start/send/stop` 授权，控制端 `term_710ac36d272253389e791d958d1044bc`，根任务 `task_09c57e19f4c3`，Run `run_f1e01e4e6bb7`。

两名 Worker 使用 OpenCode 2.0.31 / `deepseek/deepseek-v4-pro`，输入为固定文本，工具未开放：

- `ctx_661688b2da0d`，角色 `developer`，原生会话 `ses_e784703abffeGjYD2hfyiaxMPv`，`idle_outcome=succeeded`，输入 8496 / 输出 114 token，回复以 `[REVIEW_COMPLETE]` 结尾。
- `ctx_f8d47ebb20cc`，角色 `reviewer`，原生会话 `ses_e78460bdfffe0XSNUMJczA7wNm`，`idle_outcome=succeeded`，输入 8460 / 输出 82 token，回复以 `[REVIEW_COMPLETE]` 结尾。

`request show` 的持久记录包含 `command.role` 分别为 `developer`、`reviewer`，Worker spec 正文分别带有 `内置角色 developer（开发者）：` 与 `内置角色 reviewer（审查者）：` 及对应职责说明，说明角色卡随原命令与原生输入保存，未增加工具、目录或账号权限。两次 `worker stop`、两次 `worker release` 与 `controller close` 均返回 `ok:true`，控制端实际结束。

真实限制：`task result` 与 `task complete` 首次调用缺少 `--task` 与 `--result-file` 参数而被拒绝，随后控制端已关闭，未取得完整成果导出；两名 Worker 的最终正文与 token 用量由各自原生 OpenCode SQLite 只读读取，原件位于 `roles-run/worker-A-request.json`、`worker-B-request.json` 与 `service-discovery/opencode/`。本次授权由本机操作者会话建立，凭据未落盘。

本轮 `swa serve` 已结束，端口 64811 不再监听，无残留 `swa`/`server` 进程。
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

## 前序关闭失败与审核记录

正常短任务后 Ctrl+C 退出 1，`host-entry.ts` 全局检查报告 Worker 资源未释放。实际 SQLite 只有 `ctx_b0f62ae22695` 为空 resource；failed/terminal_create、原 epoch、无终端句柄、无残留，父子完成回执明确 `nativeCreation=not_started`，原控制端关闭成功，全局 pending 为 0。全局关闭拒绝任何空 resource，与 `native-methods.ts` 控制端关闭严格验证未创建证明的行为不一致。四个服务进程已全部退出，未修改数据库。

新增单轨计划：写域为 `runtime/swa-orca/src/native-methods.ts`、`host-entry.ts` 和本任务；拟复用现有严格证明，核对准确父子回执、Run/root/dispatch 归属、effects、空残留、原生身份缺席及无 pending。重启产生新 runtime ID，历史 epoch 还须准确控制端关闭回执、两次实际原进程退出观察；现有控制端当前 epoch 检查保持。计划要求 strict TypeScript、实际源码运行文件构建、真实同库恢复和关闭，以及空间允许时完整安装包；不采用模拟数据、增大超时或删除历史失败记录。

计划通过 Swarm `run_a82f9c777cd3` 提交独立审核，但两个 Worker 均在 terminal_create 失败：`ctx_78051cab76c1` 实际原生版本探测超时；`ctx_cc918f6333ab` 返回 `native_opencode_source_changed`。没有审核结论，计划未实施。首次服务重启 daemon 超时，后继启动成功；来源及运行超时仍是真实限制。

两个失败 Worker 的 stop 返回 alreadySettled/failed 和 processAction=none，公开结果为 operation_unknown；controller close 返回 worker_release_unconfirmed。服务退出时报告资源未释放及 daemon busy。按本次回执核对 PID/创建时间/名称后，清理本次 helper 和 shell，daemon、OpenConsole 随之退出。原请求、SQLite、会话和原生未释放状态保留；进程退出不能代替释放确认。实际证据位于 main 的 `final7-cli/`。

此前空间不足及审批拒绝记录保留在 `final7-cli`。后继用户明确授权清理本轮可重建副本，当前修复和结果见下节及最终记录。

## 后继修复计划

2026-10-29 最新执行顺序：逐项修复并执行局部检查，全部代码完成一轮修复与 Swarm 审查后，再统一执行全量测试。单项修复期间只运行受影响的 Go/TypeScript/实际生命周期检查，避免重复完整安装包与无关测试；最终安装及全量验收仍保留。

后继协作继续使用已验 `8fc61d62` 安装；本批没有 CLI 产品代码修改或重新构建。按用户已批准范围，清理本轮已被替代的 `dist/windows-closure-20261029` 和 `candidates/b918d063-windows-20261029`，逐项核对准确源码、目录范围、重解析点、数据库/验证文件与在用进程；源码 Commit、实际数据库和全部验证记录保留。原件位于 main 工作树 `.verification/windows-20261029/phase7/cleanup-before.jsonl` 和 `cleanup-result.jsonl`，C 盘可用空间从约 0.73 GB 增至 2.07 GB。

2026-10-29 用户明确允许清理本轮可重新构建的旧副本，保留数据库与验证记录，并要求继续通过 Swarm CLI 完成服务关闭及剩余问题修复。主 Agent 延续单一实现轨道，分支和工作树保持；独立 Reviewer 使用 Swarm CLI、OpenCode 2.0.31 / `deepseek/deepseek-v4-pro`，工具关闭。

基线为本分支 `d904d902` 与安装 `c8bc7a67`。写域：`runtime/swa-orca/src/native-methods.ts`、`host-entry.ts`、同模块 OpenCode 来源/成果消费者、对应真实验证入口和任务记录。第一项复用严格的确定未创建证明统一服务关闭检查；历史记录必须核对准确控制端关闭及原进程退出，不以空资源放行。第二项核实 SQLite/WAL 普通写入是否被误判为认证来源改变，只有证据证明与选中凭据无关时才提出修复；认证、配置、执行文件与权限变化继续拒绝。

验收为 strict TypeScript、Go CLI、完整构建与独立安装；真实正常双 Worker 完整结果和退出、真实确定未启动失败关闭、同目录重启、历史未知记录拒绝。所有数据库和失败请求保留。先由 Reviewer 审核具体计划，再实施源码；每项实际失败返回原轨道修复。现有权限边界、工具禁用、完整结果上限及准确身份要求保持。

Swarm 新目录 `windows-phase3-20261029` 中，`ctx_161d7e74946b` 接受关闭计划，`ctx_f9e6714592bf` 接受来源计划并要求凭据值单独变化、替换/重解析和实际运行时检查。模型最终正文均来自真实原生 SQLite。关闭实现复用准确关闭回执和两次进程观察，资源清单无分页限制并在完成后再次比较；RPC 停止后执行，前后检查全局 pending。

来源实现保留真实 SQLite `readOnly`、`query_only` 和事务读取，选中凭据逐次比较，数据库使用 canonical path、dev、ino、birthtime 标识。调用端配置版本及插件检查同步使用该身份，数据库/WAL 普通写入不作为认证变化。数据库版本字段没有迁移或备份消费者；旧政策记录保持原内容。配置、auth、EXE、package 和插件仍使用完整文件版本；私有 session 内容一致性和 12 MiB 上限保持。实际 `node:sqlite` 插件加载必须通过原生 OpenCode 2.0.31 检查，未通过时直接失败。

新增真实验证入口 `tests/swa-cli-headless/opencode-credential-source.mjs` 使用本轮实际公开任务的原生 SQLite 在线备份，仅在自有副本中执行 WAL/checkpoint、选中凭据破坏、删除、文件替换和符号链接重定向；原凭据保持，输出不含密钥。单独比较真实数据库及 WAL/SHM 在只读检查前后的字节，验证读取没有改写来源。不使用人工构造的协议或会话记录。

## 最终源码及实际验证

关闭及稳定凭据修复为 `b918d063b50962fca462bb012e8ae8eacf78ba9b`；配置入口重定向修复为 `8fc61d623e9d057f6b4824ebfefb79bc0c704276`。后者保留配置路径，在 version 中绑定规范目标、dev、ino 和 birthtime。最终安装位于 `C:/Users/DW/AppData/Local/SwarmCli/candidates/8fc61d62-windows-20261029`，PATH 未修改。

Swarm Reviewer `ctx_161d7e74946b` 静态接受关闭实现，`ctx_f9e6714592bf` 指出配置符号链接入口丢失后接受准确修正；两者原生工具均关闭。代码审查不代表模型亲自执行检查。计划和审查正文位于 main 的 `phase3/`。两名 Reviewer 均停止、释放，控制端关闭；长审查完整 journal 超过 12 MiB，task result 退出 6，根任务没有标记完成，原件保留。

| 命令 / 实际流程 | 结果及原件 |
| --- | --- |
| `go test -mod=readonly ./cmd/swa` | 退出 0；`phase3-go.log` |
| `node runtime/swa-orca/node_modules/typescript/bin/tsc -p runtime/swa-orca/tsconfig.json` | 完整 strict 退出 0；`credential-final-strict.log` |
| `node scripts/check-architecture.mjs` | 47 包通过 |
| `node scripts/build-swa-package.mjs --output ... --node-inputs ... --native-source ... --native-work ... --native-evidence ...` | b918d063、8fc61d62 两次完整构建退出 0，固定 Node 24.21.0、四项已核对原生输入及 28251 路径闭包；`build-closure.log`、`build-credential.log` |
| `scripts/install-swa.ps1 -PackageRoot ... -InstallRoot ... -ProtectedRoots ...` | 两次独立安装成功；`install-closure.log`、`install-credential.log` |
| `node tests/swa-cli-headless/opencode-credential-source.mjs --candidate ... --source <本轮真实原生库> --output ...` | 最终八项通过；`credential-final.log`。主数据库字节不变的 WAL 凭据值/时间/删除均被识别，普通 WAL/checkpoint 允许，配置链接改向与同字节文件替换拒绝，原来源凭据未变 |
| 最终安装的真实双 Worker | `task_99c3878d8d79`，`ctx_29d61d562e6a`、`ctx_ee23ab16f08f`，OpenCode 2.0.31 / deepseek-v4-pro，两条原生消息均完成、工具调用 0；两次 stop、两次 release、task result、task complete、controller close 全部退出 0；main `phase6/exported-result/result.json` 为 1,872,478 字节 |
| 同目录正常关闭及重启 | b918d063 与最终 8fc61d62 的 EOF 均退出 0，每次观察到的 11 个所属进程均两次缺席；`phase4/restart-eof/result.json`、`phase6/restart-eof/result.json`。Ctrl+C 的外层 PowerShell 返回 1，单独记录，不写为退出 0 |
| 旧库未知记录拒绝 | 最终 8fc61d62 载入 `windows-recovery-20261029` 后拒绝缺少原控制端关闭的记录，实际退出 6，11 个所属进程退出；`phase3/old-recovery-eof-3/result.json`。前两次观察脚本未完成，原件保留 |

本次 `phase5` 首次输入阶段的原生 `--version` 探测实际超过 5 秒，未证明安装而拒绝；`ctx_0bd2bdfdd568` 保留 failed/dispatch_input。stop 返回 alreadySettled/failed，随后 release 实际成功，控制端关闭成功。没有扩大超时、重放原请求或删除失败状态。新独立固定输入任务的通过结果如表。

清理范围仅为本轮可重建的旧 dist 和候选安装，均核对准确源码、绝对目标、无重解析路径、无数据库/日志及无运行进程。原 SQLite、WAL、会话和验证记录保留；main `phase3/cleanup-*`、`old-installs-*`、`superseded-*` 保存清单。保留原始原生构建输入与当前候选。

真实剩余限制：历史 `ctx_b0f62ae22695` 的严格未创建证明已纳入关闭代码，但同库还含后续未知记录，未获得只含该实际记录的全局正向关闭结果；不裁剪或伪造数据库。全部异常身份、Pi 正向与完整 Windows 验收保持未通过。未合并 PR，未发布 Release。
