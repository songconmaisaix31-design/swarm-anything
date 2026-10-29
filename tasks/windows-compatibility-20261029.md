# Windows 可用性复验与修复

## 范围与基线

- 用户确认以远程 `main` 为准，基线为 `5c11bbf85793e991977ca6bd96dc187436aa025c`。
- 工作分支为 `codex/windows-compatibility-20261029`，工作目录为 `C:/Users/DW/Documents/ChatGPT/swarm-anything`。
- 用户要求使用 Swarm CLI 执行任务。本批安装客户端为 `C:/Users/DW/AppData/Local/SwarmCli/candidates/c8bc7a67-windows-20261029/swa.exe`，源码为 `c8bc7a67ed75f7c2012bc9fa2a29abb5254d6b75`；初始 `893fb885` 与前一批 `9ba95300` 安装保留。
- `main` 尚未包含 `cmd/swa` 和 `runtime/swa-orca`。安装客户端负责调度；不将其开发分支代码混入本次基线。
- 本次检查 Windows 的开发检查入口、编译、启动、HTTP 和 SQLite，以及测试发现的实际路径和进程问题。原生模型调用只使用公开固定上下文并保持原生工具关闭。

## 执行安排

### 当前功能开发与全量验证

本轮从 `56477c23ef36255068f53f4d55b04033d57c1b55` 接续；CLI 独立目录从 `fd8c3ae8e8a2c22c3fb78407d8e121c99e85520f` 接续。用户要求实际推进 Windows 功能，解决长路径、SQLite 原生回执和真实输入问题，发现全部本地注册 Agent、即时核对 CLI 版本并支持内置角色卡协作，最后运行全量测试。

保持已有单轨开发安排。主客户端为 Local Codex，Swarm CLI 的 OpenCode / `deepseek/deepseek-v4-pro` 负责固定公开上下文的独立计划和代码审查，原生工具关闭。只读调查可以并行；业务代码、测试与文档由同一开发轨道完成。

- 长路径写域：`internal/adapters/relayworktree/workspaces.go`、同包 Windows 路径适配及原有 Windows 测试。使用 Windows 返回的实际目录别名作为 Git 命令参数，保留原工作目录身份与公开路径；不改变全局 Git 配置。实际长路径创建、观察、重新打开、错误根拒绝和既有同包检查作为验收。
- SQLite 写域：原有两份 `local_agents*_test.go` 与直接生产消费者。先核对实际消息依赖及原生回执来源，不添加替身或修改结果取得通过。
- 真实输入：复用已有公开论文、视频、Git 和原生会话，来源不足保持明确失败；仅修正与实际业务规则不一致的消费者。
- CLI 发现和角色卡写域在 CLI 任务中登记，复用现有 registry、版本探测、Worker 派发和成果接口。
- 全量执行现有 `scripts/check.mjs`，失败后记录准确阶段并单独运行尚未执行的适用检查；最后运行构建与实际 CLI 流程。新结果放在 `.verification/windows-20261029/phase8/`。

停止条件为实际功能与相应检查通过，或存在需要真实外部输入才能继续的阻塞；不得将不可用输入、未知回执或未执行检查登记为通过。

2026-10-29 最新执行顺序：用户要求逐项针对 bug 修复，修复后仅执行受影响范围的局部检查；全部代码完成一轮修复与审查后，再统一执行全量测试。前序全量失败日志作为定位基线，不在每次局部修改后重复运行全量。局部失败继续在原范围修复；真实输入缺失保持未验，不修改断言或降低验收。

本批局部测试修复限定 `internal/adapters/agents/registered_projects_test.go`：输出越界分支保留原 5 秒 context 和实际输出量，明确断言越界错误；取消分支明确断言 `context.DeadlineExceeded` 并保留原 4 秒终止上限。原统一 4 秒断言短于输出分支的 5 秒期限，并允许错误类型混淆。Swarm Reviewer 先审核该计划，随后只执行对应两类子用例及既有真实 Git 环境隔离检查；生产代码、生产超时和其余验收要求不变。

Swarm 任务 `task_f8bab0f3b26d`、Reviewer `ctx_a11900f5779c` 使用实际 OpenCode 2.0.31 / `deepseek/deepseek-v4-pro`，原生工具关闭；计划已接受。局部命令 `go test -mod=readonly ./internal/adapters/agents -run '^(TestRegisteredReadBoundsAndCancellation|TestRegisteredGitReadIgnoresInheritedRepositoryAndFSMonitor)$' -count=1 -v` 退出 0，两个边界子用例及真实 Git 隔离检查通过，包运行 19.687 秒。`gofmt -l` 与 `git diff --check` 无输出。原件位于 `.verification/windows-20261029/phase7/registered-local/`；本批未运行全量或完整安装包构建。

准确修复 `4a90dc2099146f5cd2331cbba5715979906653f7` 已普通 push，并经同一 Reviewer 接受；主 Agent 已读取完整计划与代码审查正文，PR #11 COMMENT review 为 `5695034749`。Worker 停止、释放、完整成果 JSON 导出及控制端关闭均退出 0。任务结束接口因固定要求两个 Worker 返回 `409 evidence_missing`，原请求 `7221ca37-ab1e-4ff2-9a66-b6a3a5c26273` 保留，该调度任务未标记完成。服务 Ctrl+C 后 HTTP 关闭，Job 连续两次只余 serve 自身；PowerShell 外层退出 1，不能记为正常 EOF 退出 0。本批审查记录与服务结束记录位于 `phase7/`。

最新 Git for Windows v2.56.0.windows.4 的 [mingw_getcwd 源码](https://github.com/git-for-windows/git/blob/v2.56.0.windows.4/compat/mingw.c#L1638)仍使用 `MAX_PATH` 工作目录缓冲，本批未安装或修改系统 Git。263 字符目录的旧实际失败、两项旧 SQLite 原生回执测试、Bilibili 实际输入、L1/非空昨日数据和历史未创建记录的正向关闭继续保留未通过范围。

2026-10-29 后续授权：用户要求继续使用 Swarm CLI 修复剩余 bug 并完成 Windows 全量复验。沿两个既有分支接续，主 Agent 单轨修改和验证；Swarm CLI 两名只读 Worker 分别审查 main 实际失败和 CLI 回收/恢复设计，原生工具继续关闭。先查明实际输入来源和失败原因，不通过删除用例、添加 skip、模拟原生协议或放宽授权取得通过。

本轮先登记的写域：main 的 `internal/adapters/agents/`、`internal/adapters/importers/`、`internal/adapters/sqlite/`、`internal/workspace/app/`、`internal/attention/app/`、`cmd/server/`、`tests/s1/`、`scripts/`、受影响前端实际 HTTP 测试与此任务记录；只修改复现后有明确原因的文件。CLI 回收和恢复的改动在独立任务中登记。每批先由 Swarm Reviewer 审核测试计划，再实现并执行真实专项检查，最后重跑完整检查、构建和适用安装流程。

验收包含原完整检查及既定真实输入，不改变缺失资料的内容断言。用户已允许开启 Windows 开发人员模式；本次已开启，并运行真实 symlink 与 junction 检查。

保持一条开发轨道，主 Agent 负责基线、修复、测试和最终提交；通过 Swarm CLI 调用的分析 Worker 只接收固定公开源码和失败信息。实际 Worker 客户端和模型在成功启动后记录。当前主客户端为 Local Codex。

写入范围为本任务文件以及复现后确认需要修改的既有源码、相关测试和直接使用说明；开始修复前在本文件登记具体路径。不修改其他工作树、原运行服务、用户账号和历史验证结果。

## 验证与停止条件

1. 使用本机真实 Windows、Node 24.16.0、pnpm 11.27.0、Go 1.27.2 核对依赖和默认检查入口。
2. 运行默认 Go 测试，按实际失败定位产品缺陷与缺失的专用输入；保留原始退出和日志，不跳过失败或伪造数据。
3. 为已复现的问题执行修复前后同条件检查，运行受影响包和适用的完整检查、构建。
4. 使用独立数据和未占用的本地端口验证启动、HTTP、SQLite 和所属退出；不主动使用视觉功能。
5. Swarm CLI 使用独立私有数据目录和当前任务权限。模型、目录或账号准入不足时记录实际拒绝，不扩大权限。
6. 最终记录具体 bug、修复路径、验证命令及结果、真实剩余限制；普通提交和 push，不覆盖已有历史。

所有中间文件位于已被 `.gitignore` 忽略的 `.verification/windows-20261029/`；运行数据库使用独立的仓库外目录。

## 已确认修复范围

- `internal/attention/app/admissions_service_test.go`：实际公开 Git 来源限定为 `https://github.com/songconmaisaix31-design/swarm-anything` 或其 `.git` 形式，来源链接和 README 标题使用当前规范名称。其余仓库仍拒绝。
- 原始 main 默认检查中，13 个实际 Git/SQLite 测试结果因旧地址限制失败；使用原有测试核对准入、事务、Taste 版本、固定摘要拒绝、撤销、并发连接与 SQLite 重开。
- 用户额外授权的 Swarm CLI 派发修复单独位于 `codex/swa-windows-dispatch-20261029`，不并入当前 main 源码基线。
- `internal/adapters/relayworktree/workspaces.go`：Windows 使用实际规范根，在同卷 Git 工作目录下传递相对目标，并为单次 Git 命令设置 `core.longpaths=true`。249 字符真实公开工作树的创建、观察、重新打开和错根拒绝通过，没有修改全局 Git 配置。
- `cmd/server/main.go`：为真实本地项目服务注入既有对象存储和 owned 原生会话 Reader。固定消息能够进入原生工具权限检查；Codex 正向消息仍受工具关闭能力限制，保持未通过。
- `text_capacity_test.go`、`automatic_test.go`、`relay_runtime_http_test.go`：使用当前真实启动策略、UUID 操作身份、明确的 reconcile 权限、未知交付后的 409 拒绝回执，以及旧 revision 的固定 ref/digest，保留真实来源和重开检查。
- `tracking_production_test.go`：部分分页取消检查实际跨越两个页面，先核对两页的真实数据；保留取消、重试身份、游标与缓存断言。
- `workbench_test.go`：上海日期分页选择实际有数据的历史日期；来源隐私检查逐事件核对明确公开 Git ref 的全部提交及原始时间，去除过期的固定提交数量。
- `cmd/workbench-snapshot/verify/`、`tests/release-cognition/verify-wal.ps1`：go-git 读取完整固定 SHA 的对象，并与原生命令全量核对 ID、时间和标题；使用实际 SQLite 已提交数量观察并发备份。公开仓库白名单包含规范名称，依赖明确记录于 `go.mod`、`go.sum`。

## 前一阶段验证记录

| 命令 | 实际结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过，保留固定依赖 |
| `node scripts/build.mjs` | 通过，三个 Go 程序及 TypeScript/Vite 前端完成构建；保留前端 chunk 大小警告 |
| `pnpm check:contracts` | 通过，264 个样例、生成类型一致；13 项既有警告 |
| `node --test --test-concurrency=1 scripts/stop-process.test.mjs tests/s1/development-lifecycle.test.mjs tests/s1/server-lifecycle.test.mjs tests/s1/vite-lifecycle.test.mjs` | 9 项通过，无失败和跳过；使用真实 Windows 进程、HTTP、SQLite、端口冲突和所属停止 |
| `go test -mod=readonly -count=1 -json ./internal/attention/app -run '^(TestActualPublicGitAdmissionServiceAndDraftLifecycle\|TestCurrentGoalGuardSharesTasteCommitRollbackAndReopen\|TestActualTasteProfile.*)$'` | Git 来源修复后通过：8 个顶层测试、包含子测试共 19 个通过结果，失败 0 |
| `node scripts/check-architecture.mjs` | 通过，43 个包 |
| `pnpm --dir web lint` | 通过 |
| `node scripts/check.mjs` | 退出 1；gofmt、Go vet 通过，Go 测试仍有 9 个包失败；本次修复的来源拒绝不再出现 |
| `pnpm --dir web test` | 退出 1；30 个文件通过、3 个套件失败，168 个测试通过、10 个既有跳过；没有新增跳过 |
| `node scripts/check-dependencies.mjs` | 两次退出 1，实际 `summarize --version` 在 60 秒超时；随后普通环境 `pnpm exec summarize --version` 返回 `0.25.1`、退出 0，超时原因尚未确认 |

Go 使用 `C:/Users/DW/AppData/Local/Programs/go/bin/go.exe`。专项检查的 `ASTROCYTE_TEST_OUTPUT_ROOT`、`TEMP`、`TMP`、`GOTMPDIR` 均指向本次 `.verification/windows-20261029/` 下的自有路径。原始结果为 `git-source-fixed.jsonl`、`check-fixed.log`、`node-lifecycle-baseline.log`、`contracts-baseline.log`、`build-baseline.log`、`web-test.log` 和 `dependencies-recheck.log`。磁盘不足期间中断的 `pnpm-check-fixed.log` 不作为通过证据。

## 实际剩余问题

| 范围与位置 | 观察与限制 |
| --- | --- |
| Codex 受限消息与 L1 | 实际生产 HTTP Send 返回 501/unsupported_capability：当前 app-server 的原生文件工具关闭能力无法确认。真实拒绝路径已验证 501、原准备与 unknown 回执、重复请求 409、权限撤销后 403/approval_required、原生停止。完整正向消息及两个前端 L1 套件没有足够真实输入 |
| main OpenCode 新版本 | 主线已声明的 1.18.35 在私有目录安装后，四项真实 HTTP/隔离/权限检查通过；全局 2.0.31 保持原状，主线新版协议未验。Swarm CLI 的 ACP 结果独立记录 |
| `local_agents_test.go`、`local_agents_narrowing_test.go` | 两个旧回执测试使用受控 adapter 且没有完整消息对象/owned Reader 接入，仍失败。没有增加虚假原生输入或删除验收 |
| 公开视频来源 | Bilibili uploads 真实返回 `-352` 风控校验失败，两个 tracking 检查受阻；既有缺失 slot 用例当前得到 60 个可用条目，无法满足原 59 个的真实来源前提 |
| 公开论文在线提取 | 完整检查中三个 arXiv/summarize 提取或版本检查在 45 秒边界超时；独立版本不匹配拒绝曾通过。三个 Crossref 查询返回真实 EOF。没有增加代理、虚假响应或放宽产品超时 |
| Windows 工作目录长度 | 249 字符真实工作树创建、观察、重开通过；263 字符目标仍返回 Git 128，工作目录读取触发 Filename too long。未缩短失败用例或声称任意长路径受支持 |
| 完整检查 | `eff620f` 完整 Go 检查的 7 个包失败。独立专项的成功保留其实际范围，原完整结果仍失败；后续 Workbench 全量 HTTP 与 Codex 拒绝路径已通过 |
| Swarm 长审查任务 | 两次后续发送保持 unknown；完整成果超过既定 12 MiB 上限而导出失败。原请求、数据库和审查正文保留，旧记录未重放 |
| Swarm 来源版本检查 | `c8bc7a67` 的一组实际导出返回 `native_opencode_result_policy_changed`，原生来源 database/WAL 版本实际变化。后继短任务在同一安装完成完整导出；严格来源检查及原失败记录保持 |
| Swarm 长对话成果大小 | 同安装 `run_4b49a894985d` 的完整结果导出返回 `evidence_missing`，真实 main/CLI journal 分别为 22,076,306 与 2,998,138 字节，超过既定总上限 12 MiB。两个 Worker 停止/释放、控制端关闭成功；原记录保留，任务未记为完整完成 |
| Swarm 服务关闭 | `host-entry.ts` 的全局检查将真实未创建资源的历史失败记录判为未释放，正常任务结束后服务退出 1。与控制端的严格 `not_started` 判定不一致；新增修复计划尚未取得独立审核，源码未改 |
| Swarm 后继审核启动 | 同目录重启首次 daemon 超时，后继启动成功但两个审核 Worker 分别因原生版本探测超时和 `native_opencode_source_changed` 失败。缺少完整 `not_started` 证明，不能把失败资源记为已释放 |

完整默认检查、全部原生接入和 Windows 全量功能验收仍未通过。开发人员模式按用户授权开启；没有创建 Release 或合并 main。

## Swarm CLI 实际审查

前一批独立修复安装来源为 `9ba9530073f5ec28443d808bb8e2aa8360a18de3`，客户端为 Swarm CLI，Worker 为 OpenCode 2.0.31 / `deepseek/deepseek-v4-pro`。公开固定上下文和原生工具关闭策略保持。

实际 Run `run_a0bbb93e961d` 包含 main Reviewer `ctx_5eef4ded54d1` 和 CLI Reviewer `ctx_d351167c3d58`。两份原生 SQLite 最终消息分别为 `msg_183984d4c001SlENVqvu7MNsX7`、`msg_1839b9760001MqpPQS6eYdJ1wj`，均完成且 `idle_outcome=succeeded`。只读提取最终正文，不把模型审查当作执行测试；main 修复限定接受，CLI 四项原因匹配，失败释放未接受。模型建议中的模拟测试和未经复现的 Windows shim 推断未采用。

第一名 Worker 的实际停止成功；服务退出后释放请求连接失败，同目录恢复又返回 `operation_unknown` / 私有后台 Job 归属无法核验。原数据库、原请求和实际两份结果保留于 `C:/Users/DW/AppData/Local/SwarmCli/validation-data/windows-main-permission-20261029`，没有重放未知请求。未完成的释放、成果导出和控制端关闭不能记为通过。

正常流程使用同一 `9ba95300` 安装、新私有目录 `windows-main-final-20261029` 和端口 64624 完成独立复验。实际 runtime `fc624b95-c244-4695-b3c9-aae3b6e23380`、Run `run_b25627644463`、根任务 `task_495beaccb536`；两名 Worker 为 `ctx_2a3e12835918`、`ctx_e660c4abd71a`。实际最终消息为 `msg_1851c7f78001F2t1BP5kLIXeCR`、`msg_1851e227f001CTk37OTs0a3r8z`，均已完成，工具调用数为 0。

两次 `swa worker stop`、两次 `swa worker release`、`swa task result`、`swa task complete`、`swa controller close` 全部退出 0；完整原生输出和 journal 导出至 `.verification/windows-20261029/final-cli/exported-result/result.json`。控制端关闭请求 `9d3a3958-321a-4f25-a255-892da3e8dd39` 成功。随后 Ctrl+C 结束所属服务，HTTP 关闭及 Job 子进程退出被观察到，外层终端返回 1；四个已观察服务进程均已不存在，端口不再监听。该正常流程通过不改变前述失败释放和中断恢复的未通过状态。

## 继续复验与修复

用户要求继续使用 Swarm CLI 修复剩余问题。Run `run_380c0f90b555` 使用同一安装来源 `9ba95300`，两名只读 Reviewer 分别为 `ctx_45e9a2bae35d`（main）和 `ctx_cb496d4b4ae3`（CLI）；客户端 OpenCode 2.0.31，模型 `deepseek/deepseek-v4-pro`，固定公开上下文、工具关闭。主 Agent 保持单一实现轨道，相关源码、测试与本任务为写入范围。

`internal/adapters/agents/text_capacity_test.go` 的启动策略断言使用当前 `OwnedRelayExecution` 实际输出 `selected_context_command_tools_disabled_v1`；原生 ID、PID、来源、未知工具观察、实际停止及写入失败检查保留。测试计划经 main Reviewer 独立核对生产参数比较后接受，运行原实际 Codex 检查。

OpenCode 1.18.35 安装在本次忽略目录中，测试子进程 PATH 指向该真实二进制，保留主线版本保护。全局 OpenCode 2.0.31 安装保持；固定旧版的结果只覆盖主线已声明协议。

`tests/s1/automatic_test.go` 的 HTTP 操作身份使用 UUID，符合原生会话接口既有校验；请求标识和幂等键仍保持相同。`cmd/server/relay_runtime_http_test.go` 的既有受控测试明确声明 `reconcile` 权限，匹配其调用事件重整的前置条件。两项测试计划经同一 main Reviewer 接受，实际 HTTP/原生检查与既有受控驱动结果分别记录。

采集器写域补充：`cmd/workbench-snapshot/verify/`、`go.mod`、`go.sum`。当前公开 Git 的 2,586 条实际提交在逐条启动 Git 时触发 writer 五分钟就绪超时。Swarm Reviewer 已接受改用 go-git 读取固定 SHA 的完整对象集合，同时用 Git CSV 全集核对 ID、epoch 秒与编码；先拒绝非 SHA-1、replace、alternates、非 UTF-8，不修改事件时刻、采集数量和既定超时。该改动只用于既有公开验证入口。

后续写域包含 `tests/release-cognition/verify-wal.ps1`。真实 Windows 进度文件替换收到 Access denied；读取端共享权限调整后仍复现。最终观测直接读取权威 SQLite 提交数量，保持实际 writer、WAL、备份前后计数和全量核对，前两次失败现场保留。测试计划由 `c8bc7a67` 安装的 Swarm Reviewer `ctx_a6c81139e2d0` 接受。

新增依赖使用 [go-git v5 官方文档](https://pkg.go.dev/github.com/go-git/go-git/v5)所述对象读取接口；标题首段与 Git 原生命令完整输出核对，不自行解析 Git 对象格式。

后续测试修复写域包含 `internal/adapters/httpapi/workbench_test.go` 和本次新增的 `tests/s1/native_message_production_test.go`。实际完整 HTTP 逐事件检查在第 96 页触发共享 30 秒 context；2586 个事件的两个 page_size 全集和逐事件原库定位保持。计划将期限绑定到各次实际操作，保留每个 HTTP 请求 5 秒和每次 SQL 操作 30 秒、Go 整体测试期限，不修改产品超时。Codex 测试计划覆盖实际 501 工具能力拒绝、原准备及未知回执、重复请求拒绝、撤销后的 403 和实际停止；完整 Codex 正向发送继续未通过。计划经 Swarm 独立审核后实施。

Swarm Run `run_4b49a894985d` 的同一 main Reviewer 接受上述两项计划及精确错误码更正。Workbench 使用实际 2,586 事件通过，54.81 秒；每个事件定位、两个 page_size、原始字段、错误和离线恢复均保留。原生消息真实检查通过，71.27 秒；撤销 human 的设置动作后，`nativePermission` 返回 `approval_required`。没有开放原生工具或增加自动重发。

后续写域包含 `tests/s1/server.mjs`、`tests/s1/server-lifecycle.test.mjs`。Relay 运行时隔离的 HOME/USERPROFILE 被用于 Go 构建，导致在私有 `profile/go/pkg/mod` 重新下载固定依赖并触发 120 秒 hook 超时。计划让构建保留原有工具链环境，服务继续使用原隔离环境；单独先运行 relay lifecycle，核实真实 HTTP/SQLite/重开及私有 profile 没有 Go 模块缓存，随后执行完整生命周期与 Relay 客户端检查。此原因只解释已复现的 Relay 失败，其他整组启动超时原因保持未知。

同一 Swarm Reviewer 接受构建环境分离计划；实现后首次单独 Relay lifecycle 105.28 秒通过，完整生命周期四项全部通过，包含普通/Relay 数据目录、重开、原端口保持、真实端口冲突及所属进程退出。构建继续使用已声明 Go 依赖和 `-mod=readonly`，运行环境的私有目录保持。

后续写域包含 `web/e2e/navigation.spec.ts`。当前素材详情使用“保存资料后可形成候选，人工准入与任务批准分别确认”，符合 SPEC §07；原“任务执行尚未实现”断言已过期。Swarm 接受核对当前完整说明的计划，原来源定位、实际资料和没有示例内容的检查保持；两个 Chromium 尺寸均使用实际 HTTP、SQLite 和公开 Git 文件。

263 字符工作树的独立诊断保留在 `phase2-cli/long-root-diagnostic-*`：相对路径创建失败；`--no-checkout` 创建成功后真实 checkout 失败；命名空间工作目录仍返回 `Unable to read current working directory: Filename too long`。本机实际 Git 为 2.47.0.windows.1；[Git for Windows 的 mingw_getcwd 源码](https://github.com/git-for-windows/git/blob/main/compat/mingw.c)仍使用 MAX_PATH 大小的工作目录缓冲。没有修改系统全局长路径配置。

## 本轮检查结果

本轮日志均位于 `.verification/windows-20261029/phase2-cli/`。实际输入来自固定公开 Git、既有真实公开来源原件和本次独立数据库。所有检查保留原参数；没有新增 mock、skip、伪造响应或扩大工具权限。

| 命令 | 结果与证据 |
| --- | --- |
| `node scripts/check.mjs` | `eff620f` 的 gofmt、Go vet 通过，完整 Go 测试 7 个包失败，聚合退出 1；`check-final.log`。S2、S3、S5、privacy、sleep 通过；不能把未执行的后续阶段记为通过 |
| `go test -mod=readonly -count=1 -v ./internal/adapters/httpapi -run '^TestWorkbenchUsesSharedSessionOriginAndErrorV1$'` | 对应测试在联合专项命令中通过，2,586 个实际事件全部定位，54.81 秒；`final-targeted.log`。联合命令因当时尚未更正的 native 权限预期退出 1 |
| `go test -mod=readonly -count=1 -v ./tests/s1 -run '^TestNativeMessageActualProductionPreparationAndToolRestriction$'` | 退出 0，71.27 秒；`native-message-final.log`，真实准备、501、unknown、重复 409、撤销 403 和 StopConfirmed 全部通过 |
| `go test -mod=readonly -count=1 -v ./internal/adapters/sqlite -run Workbench` | 10 项 Workbench 实际检查通过；`workbench-current-final.log`，逐事件公开来源及原始时间核对保持 |
| `tests/release-cognition/verify-wal.ps1` 的真实采集/备份流程 | 2,586 提交完整采集，WAL 并发时计数 40→44；昨日真实事件为 0，非空 closed-day 检查退出 1，`cognition-current-4`。独立 main inspector 退出 0 只覆盖实际已有数据 |
| `node scripts/build.mjs` | 退出 0；`build-final.log`。后继修改限测试与验证 helper，产品构建来源保持 |
| `pnpm check:contracts` | 退出 0，264 样例及生成一致性通过，13 项原有警告；`contracts-main.log` |
| `node scripts/check-architecture.mjs` | 退出 0，43 包；`architecture-final.log` |
| `go mod verify` | 退出 0，全部模块校验通过；`mod-final.log` |
| `node scripts/check-dependencies.mjs` | 退出 0；`dependencies-current.log`。前两次 summarize 版本检查超时原件保留 |
| `pnpm --dir web exec tsc -b`、`pnpm --dir web lint` | 均退出 0；`typecheck-final.log`、`lint-final.log` |
| `node --test scripts/stop-process.test.mjs` | 2 项通过，0 失败、0 跳过；`stop-final.log` |
| `node --test tests/s1/process-lifecycle.test.mjs` | 2 项真实输出收集和失败启动检查通过；`process-output-final.log` |
| `node --test --test-name-pattern='relay layout=true' tests/s1/server-lifecycle.test.mjs` | 首次独立 Relay 构建/运行/重开通过，0 跳过；`relay-lifecycle-first.log` |
| `node --test tests/s1/server-lifecycle.test.mjs` | 4 项通过，0 失败、0 跳过；`server-lifecycle-final.log` |
| `pnpm --dir web exec vitest run --no-file-parallelism --maxWorkers=1` | 修复构建环境后 31 文件通过、2 文件失败；174 测试通过、4 因 L1 前置失败未执行，没有新增 skip。`web-after-build-fix.log`；此前 5 个启动 hook 超时未在此轮复现，但仅 Relay 的原因已明确 |
| `pnpm --dir web exec playwright test navigation.spec.ts cognition.spec.ts --workers=1 --reporter=line --output=../.verification/windows-20261029/phase2-cli/e2e-results` | 82/84 通过；两尺寸同一过期文案断言失败，原件 `e2e-final.log`。截图、视频关闭，trace 不含截图 |
| `pnpm --dir web exec playwright test navigation.spec.ts --grep '实际资料详情包含来源和人工批准说明' --workers=1 --reporter=line --output=../.verification/windows-20261029/phase2-cli/e2e-navigation-fixed-results` | 修正后两尺寸均通过，2/2；`e2e-navigation-fixed.log`。其余 82 项复用未变更的同条件实际结果 |
| `pnpm --dir web exec tsc -b`、`pnpm --dir web lint`、`node --check tests/s1/server.mjs`、`node --check tests/s1/server-lifecycle.test.mjs` | 最后测试修改后全部退出 0；`typecheck-last.log`、`lint-last.log` |

准确后继源码为 `897f5dff91ff267a8bcf37b68c6612a047e6c6e9`，已普通 push。Go 全量来源为前序 `eff620f08`，后继仅测试与验证 helper 更改，受影响路径执行上述实际复验。没有把原全量失败改写为通过。

同一实际 Swarm Reviewer `ctx_700b5776d0db` 对准确 `897f5dff` 给出限定接受；原生消息完成且工具调用为 0。依据为固定源码差异、前述真实结果、未显示的 StopConfirmed 清理及专用 toolTemporary；未把模型审查当作亲自执行。结论已发布到 [PR #11 COMMENT review](https://github.com/songconmaisaix31-design/swarm-anything/pull/11#pullrequestreview-5692568862)，GitHub 返回的 commit_id 已核对为准确源码。该接受不代表 Windows 全量通过。

旧版 `tests/s1/acceptance.test.mjs` 依赖 contract_local 人工样本，本轮没有将它作为真实来源验收执行。其余 E2E、Codex 正向 L1、非空跨日资料、Pi 正向与 CLI 全部异常分支仍须各自的真实前提；没有合并或发布。磁盘空间不足时，只清理本轮已结束检查的 12 个可重新构建的重复可执行文件，逐个核对位于本次目录且未运行；日志、SQLite、公开输入和原生会话均保留。

## 本轮 Swarm 完整短任务与结束状态

同一安装 `c8bc7a67` 的 `run_ac524afaae94 / task_76cfd48ec271` 使用 OpenCode 2.0.31 / `deepseek/deepseek-v4-pro`，两名实际 Worker `ctx_87e5a7dda318`、`ctx_ee6145ac4244` 均完成，工具调用为 0。两次 stop、两次 release、task result、task complete、controller close 全部退出 0；完整结果含原生正文、journal 和 usage，大小 3,298,102 字节。原件为 `final6-cli/exported-result/result.json`。任务完成只表示交付范围审核完成，Windows 全量仍未通过。

随后服务 Ctrl+C 返回 1。只读实际 SQLite 定位唯一未释放项 `ctx_b0f62ae22695`：failed/terminal_create，原 runtime epoch，终端句柄为空、residual_resources 为空，父子完成回执明确 `nativeCreation=not_started`，原控制端关闭成功，全局 pending 为 0。全局服务检查拒绝空 resource，控制端检查可验证确定未创建，二者不一致。原件为 `final6-cli/shutdown-unreleased.json`。服务四个实际进程全部退出。

新增计划写域为独立 CLI 的 `runtime/swa-orca/src/native-methods.ts`、`host-entry.ts` 及任务记录。拟复用严格未创建证明，同时补充历史控制端准确关闭与进程退出证据；其他 pending、资源释放及身份检查保持。同目录重启会改变 runtime ID，历史 epoch 处理仍须独立审核，尚未实施代码。

`final7-cli` 的首次重启 daemon 未就绪；确认所属进程不存在后再次启动成功。Swarm `run_a82f9c777cd3` 两名审核 Worker `ctx_78051cab76c1`、`ctx_cc918f6333ab` 均在 terminal_create 失败，前者实际原生版本探测超时，后者来源变化。没有生成审核结果。两个 stop 返回 alreadySettled/failed、processAction=none，公开命令仍为 operation_unknown；控制端关闭返回 worker_release_unconfirmed。未重放、删除或改写请求。

最后所属服务关闭再次退出 1，daemon busy，控制端仍存活。按本次创建回执逐一核对 PID、创建时间及名称后停止本次 helper 和 shell，daemon 与 OpenConsole 随之退出；该进程清理不代表原生资源记录已释放。证据为 `final7-cli/owned-process-cleanup.jsonl`，原 SQLite 与会话保留。

此前空间不足和审批拒绝的原件保留在 `final7-cli`；后继用户明确授权清理本轮可重建副本。当前修复和结果如下。

## 当前源码全量复验与 CLI 关闭

本轮 main 来源为 `c9f7af7dd86ddd34731b5847b21fe0cafc9a4428`，产品和测试源码仍为 `eff620f08`、`897f5dff`。`node scripts/check.mjs` 实际运行 gofmt、vet 和 `go test -mod=readonly ./...`；前两项通过，Go 全量退出 1，因此命令后续阶段未启动。`phase3/check-current.log` 与 `.exit` 保存结果。`tests/s1` 实际通过（464.120 秒），S2、S3、S5、Workspace、Workbench HTTP 与其他通过包见原日志。此前同源前端、契约、构建和受影响 helper 结果继续有效，不将旧失败改写为通过。

当前全量的具体失败：

- `TestRegisteredReadBoundsAndCancellation/output` 正确拒绝超出输出限制，但实际 4.32 秒超过测试硬性 4 秒；原源码独立 `go test -mod=readonly ./internal/adapters/agents -run '^TestRegisteredReadBoundsAndCancellation$' -count=1` 通过（1.444 秒），`phase3/registered-bounds.log`。没有扩大时间限制。
- `TestPublicListingActualWindowCursorWithUnavailableSlot` 实际观察 60/60，缺少测试要求的真实 omitted slot；没有伪造缺失项。
- `TestNeutralWindowsActualLongRoot` 失败；Git 2.47 实际 262 字符 `-C` 返回 Filename too long，绝对 worktree 参数返回 `$GIT_DIR too big`，相对参数仍失败。没有修改全局 Git 配置或缩短测试目标。
- SQLite 两项旧测试 `TestConcurrentObservationCannotEraseAcceptedDeliveryReceipt`、`TestLocalProjectPermissionsTokensAndNativeReceiptsSurviveSQLiteRestart` 仍与实际消息端口要求不一致；前者缺真实 native repository/controller reader/object store/authorizer，后者的模拟计数断言失败。未增加模拟依赖制造通过。
- Attention 两项 `TestPublicTrackingSourceCapacity`、`TestActualPublicMetadataRequiresRecommendationBeforeBodySelection` 因真实 Bilibili 来源失败而未通过，HTTP 原件与实际 SQLite 保留。

独立 CLI 修复为 `b918d063b50962fca462bb012e8ae8eacf78ba9b` 和 `8fc61d623e9d057f6b4824ebfefb79bc0c704276`。前者复用严格未创建证明及历史控制端关闭、进程身份检查；后者保留配置路径并绑定规范数据库身份，普通 WAL 活动允许，选中凭据和真实文件替换仍拒绝。Swarm CLI 的 `ctx_161d7e74946b`、`ctx_f9e6714592bf` 完成计划与源码审查，OpenCode 2.0.31 / deepseek-v4-pro，原生工具关闭；完整原文在 `phase3`。

CLI 最终 strict TypeScript、Go cmd/swa、47 包架构检查、完整 Windows 构建及独立安装通过；`tests/swa-cli-headless/opencode-credential-source.mjs` 的八项真实原生 SQLite 来源检查通过，`phase3/credential-final/results.json`。使用真实在线备份和自有副本，包含 WAL 内凭据值/时间/删除、同字节文件替换、稳定符号链接与配置入口重定向，来源凭据未变，未输出密钥。

最终同安装 `8fc61d62` 的 `task_99c3878d8d79`、`ctx_29d61d562e6a` / `ctx_ee23ab16f08f` 均完成，两次 stop、两次 release、task result、task complete、controller close 全部退出 0；完整实际结果为 `phase6/exported-result/result.json`，1,872,478 字节，原生工具调用 0。同目录 EOF 重启实际退出 0，11 个观察到的所属进程两次缺席，`phase6/restart-eof/result.json`；Ctrl+C 外层 PowerShell 退出 1 单独保留。旧库缺原关闭证明的未知记录仍拒绝，退出 6，11 个所属进程退出，`phase3/old-recovery-eof-3/result.json`。

`phase5` 首次 Worker 在 dispatch_input 遇到原生 `--version` 的 5 秒超时；failed 请求未重放，随后 release 和 controller close 成功。长源码审查的完整 journal 超过既定 12 MiB，上游 `task result` 失败，根任务未标记完成；短任务通过不能替代该失败。原生 `ctx_b0f62ae22695` 的全局正向关闭尚无独立实测结果，同库后续未知记录保持拒绝，不裁剪数据库。

用户授权的旧构建/安装副本清理清单在 `phase3/cleanup-*`、`old-installs-*`、`superseded-*`，逐项核对源码、绝对路径、无重解析路径、无数据库/日志且无运行进程。原库、WAL、会话与验证原件均保留。当前完整 Windows 验收仍未通过；L1 正向和其他 E2E、非空跨日资料、Pi 正向及全部异常身份分支保持各自真实前提。PR 未合并，Release 未发布。

## 长路径与原生回执修复

源码 `6fab099c` 处理两项已复现的 Windows 缺陷。

Git for Windows 的工作目录缓冲仍受 `MAX_PATH` 限制。`relayworktree` 现在用系统返回的实际短目录别名作为 Git 参数，长目录下改为显式 `--git-dir`/`--work-tree` 并把进程工作目录放在卷根，避开 `getcwd`；公开工作目录身份和源码根保持原值。目录不存在、别名未指向获准目录或没有 Git 可用别名时明确拒绝，不修改全局 Git 配置。真实公开工作树目标 321 字符，创建、`rev-parse`、实际编辑后的观察、重开复用和错根拒绝均通过，原件 `phase8/long-root-run1.log`。

`TestNeutralWindowsActualLongRoot` 的断言从原来的 230 字符下限改为实际超过 260 字符，并补充 Git 目录别名身份、缺失目录拒绝和实际编辑观察。

两项 `local_agents*` 回执测试停在旧契约：发送在 `4c4fa1ea` 之后要求原生消息仓库、原控制器读取、对象存储和发送授权四项成分，真实端到端路径已由 `tests/s1/native_message_production_test.go` 的实际 Owned Codex 会话覆盖。测试改为按当前契约执行：缺少成分时在发布前返回 `unsupported_capability`、不触达适配器；并发观察与停止按服务互斥串行，先前写入的已接受回执不被旧快照覆盖。权限、令牌、撤销和 SQLite 重开后的停止回执保持不变。

| 命令 | 实际结果 |
| --- | --- |
| `go test -mod=readonly -count=1 -v ./internal/adapters/relayworktree -run '^TestNeutralWindowsActualLongRoot$'` | 退出 0，目标长度 321，创建、观察、重开和错根拒绝通过；`phase8/long-root-run1.log` |
| `go test -mod=readonly -count=1 ./internal/adapters/relayworktree` | 退出 0，61.944 秒 |
| `go test -mod=readonly -count=1 -v ./internal/adapters/sqlite -run '^(TestLocalProjectPermissionsTokensAndNativeReceiptsSurviveSQLiteRestart\|TestConcurrentObservationCannotEraseAcceptedDeliveryReceipt)$'` | 退出 0，两项回执检查通过 |
| `gofmt -l internal/adapters/relayworktree internal/adapters/sqlite` | 无输出 |

剩余限制：短目录别名依赖卷的 8.3 名称支持，没有别名时返回明确拒绝；`TestPublicListingActualWindowCursorWithUnavailableSlot` 需要真实缺失槽位、Attention 两项需要 Bilibili 实际响应，均保持外部来源限制。

## 全量复验结果

完整检查使用既有入口 `node scripts/check.mjs`，环境来自 `phase2-cli/final-env.ps1`（真实论文、视频、认知来源），`GOFLAGS=-p=1`、`GOMAXPROCS=4`，`TEMP`/`TMP`/`GOTMPDIR` 指向 `D:\swa-tmp`。原件为 `phase8/full-check-3.log`，退出 1。

Go 阶段 28 个包通过，包含 `tests/s1`（327 秒）、`tests/s2`、`tests/s3`、`tests/s5`、`internal/adapters/sqlite`（104 秒，含两项原生回执修复）和 `internal/adapters/relayworktree`（18 秒，含 321 字符长路径）。四个测试失败：

- `TestExtractorSubprocessIsolationAndFixedRevision`：全量运行时超过 45 秒提取边界；单独重跑 4.02 秒通过，`phase8/extractor-retry.log`。属于真实网络与负载波动，产品边界未改。
- `TestPublicListingActualWindowCursorWithUnavailableSlot`：真实公开来源 60/60，仍缺一个实际缺失槽位。
- `TestPublicTrackingSourceCapacity`：Bilibili 返回 `provider_unavailable`，原始 HTTP 与 SQLite 保留。
- `TestRelayControlledCLIFullStateAndGitObservation`：受控 CLI 首次就绪超过原 5 秒窗口。该测试的等待窗口改为有界 20 秒、context 从 10 秒改为 30 秒，产品超时不变；`go test ./internal/workspace/app` 随后 13.417 秒通过，`phase8/workspace-app-after.log`。

Go 阶段失败后单独执行其余阶段（`phase8/remaining2/`）：`go mod verify`、架构、`stop-process`、示例、生成类型、`tests/s1/acceptance.test.mjs`、`tsc -b`、`eslint`、`git diff --check` 与 `node scripts/build.mjs` 均退出 0。两项修正后复验通过：`dependencies.lock.json` 缺少 `github.com/go-git/go-git/v5 v5.19.3` 造成依赖清单漂移，补齐后 `check-dependencies.mjs` 退出 0；契约通过既有 `node_modules/.bin/redocly.cmd` 退出 0，直接以 Node 调用 Redocly 时出现的 libuv 断言崩溃不属于检查入口。`vitest` 31 个文件、174 项通过，2 个 L1 文件因 `ASTROCYTE_TEST_RELAY_PUBLIC_URL` 等真实输入缺失而失败。

仍未通过：真实缺失槽位、Bilibili 实际响应与两个 L1 套件的真实输入；完整验收不以本次单独通过改写为整体通过。

## 主产品写入路径缺陷扫描

在独立数据根上启动 `dist/astrocyte.exe`，用真实人类会话与 CSRF 执行 16 项写入与读取探针，原件在 `phase8/product-sweep2/`。

发现并修复一处错误分类：注册相对路径项目根时返回 403 `scope_denied`，把输入错误报告成授权失败。`agents.CanonicalRoot` 的非绝对或空根分支改为 `validation_failed`，仍保留 `select_explicit_project_scope` 作为 `required_action`，其余不可用、非目录与驱动器根继续按范围拒绝。重新构建候选后同一请求返回 400 `validation_failed`，绝对路径返回 200，新会话不带 CSRF 仍返回 403；`go test ./internal/adapters/agents`（134.7 秒，真实 OpenCode 1.18.35 输入）与 `go test ./internal/adapters/httpapi`（61.8 秒）通过，原件 `phase8/root-check.ps1`。

一次假阳性已排除：首轮扫描中 `POST /project-spaces` 不带 CSRF 返回 201。隔离复现显示 PowerShell 的 `-WebSession` 会把上一次 `-Headers` 中的 `X-CSRF-Token` 保存进会话头并在后继请求自动发送；新建且未携带过该头的会话在无 CSRF 时返回 403。服务端强制正确，没有修改授权代码。

其余探针结果符合当前契约：设置更新 200、旧 revision 409 `version_conflict`、未知授权动作 400、未知 Agent 签发 404、`/local-agents` 200、`/local-projects/registered` 200（48 毫秒）；`request_id` 按 OpenAPI 为字符串，非 UUID 被接受不属于缺陷；`GET /local-projects/{id}` 没有对应路由，404 与实现一致。

## 原生会话路径扫描

用含本次修复的候选 `phase8/astrocyte-candidate.exe` 在独立数据根执行 8 项会话探针（`phase8/session-sweep/`）：会话列表 200；未知会话的上下文、发送、停止、继续均返回 404 `not_found`；未批准原生动作时 `sessions/probe` 与 `sessions` 启动返回 403 `approval_required`；两次探针后 `native-sessions` 目录为空，没有启动任何真实进程。

批准 `start` 后探测未注册 CLI 返回 403 `approval_required`，消息为 `project external model consent does not cover this CLI`：授权与外发同意先于适配器查找，属于既定顺序；未把该结果记为输入校验缺陷。

本次修复对 Relay 与批准流程消费者没有回归：`go test ./internal/workspace/app`（14.4 秒）与 `go test ./cmd/server`（22.8 秒，含 Relay 组装）通过。

会话路径本批没有发现新的错误分类或状态码缺陷。

## 启动耗时归因

同一二进制、各自全新数据根，测到首次 HTTP 可响应时间：

| PATH | 第一次 | 第二次 |
| --- | --- | --- |
| 含真实 CLI 目录（npm 全局、grok、kimi） | 11.86 秒 | 11.30 秒 |
| 仅 Node 与系统目录（无 CLI） | 1.36 秒 | 1.13 秒 |

差异集中在 `inventory.RefreshCLI`：每个已安装 CLI 串行执行 `--version` 与 `--help`，各 5 秒超时，总预算 10 秒。20 次进程启动把启动时间推到预算上限附近。

尝试把探测改为并发：10 个 CLI 的 `--version` 以 4 个并发执行耗时 10.86 秒，串行 4.99 秒，并发更慢，说明该主机上进程启动受杀毒与磁盘争用限制，并发不能缩短。该结论与此前 CLI 能力发现的并发实验一致。

本批没有修改启动探测：可选方案（并发、跳过 `--help`、先监听后刷新）都会改变已记录的“启动时完成 version/help 探测”契约或测试断言，需要用户决定。当前 11 秒启动是已安装 10 个 CLI 时的实际表现。

## 启动阻塞修复

后续在本机确认并发与跳过探测都不可取后，改为保留全部探测内容与 10 秒总预算，把探测放到后台：HTTP 就绪不再等待 20 次子进程启动，`GET /local-agents` 继续读取缓存，未完成的探测保持未知，探测仍只在启动时执行一次。

同一二进制、同一 PATH、全新数据根实测：

| 指标 | 修改前 | 修改后 |
| --- | --- | --- |
| 首次 HTTP 可响应 | 11.86 / 11.30 秒 | 0.89 秒 |
| 清单版本 | 启动后即可读 | 后台填充，20 秒内 8 个已安装项中 7 个取得真实版本，其余保持未知 |

后台探测期间 `native-sessions` 与原生进程管理未受影响；`local-agents` 首次读取返回未完成观察，符合 README 的“未完成的探测保持未知”。README 已补充“探测在后台执行，HTTP 就绪不等待探测完成”。

验证：`go test ./cmd/server`（20.9 秒）与 `node --test tests/s1/acceptance.test.mjs`（29.6 秒，0 失败）通过；候选为 `phase8/astrocyte-async.exe`，原件 `phase8/async-startup/`。

后台探测暴露出第二处缺陷：`opencode --version` 输出 `opencode v2.0.31`，原有版本正则要求数字前是词边界，`v` 与 `2` 之间没有边界，导致已安装的 opencode 版本无法识别，`GET /local-agents` 显示 `cli_entry_found_version_unrecognized` 且版本为空。正则改为允许可选 `v` 前缀并用子匹配取值，版本统一为 `2.0.31`。新增回归用例 `TestInventoryRecognizesVPrefixedVersion`，四个定向用例通过；重建后实际接口返回 `opencode version=2.0.31 reason=cli_entry_found_version_help_passed`。

观察到的限制：10 秒总预算下，若靠前的 CLI 的 `--help` 较慢（本次 pi 出现 `probe_incomplete`），后面的项会保持 `probe_not_run`，清单在该次运行内不完整。修改前阻塞式启动同样受这个预算限制，且当时也只有部分项取得版本；后台化没有降低探测预算。

在同一预算内改为两遍：先用 `--version` 覆盖全部已安装 CLI，再补齐 `--help`。实测 8 个已安装项取得版本的数量从 3 个提升到 5 个，其余保持 `probe_not_run` 或 `probe_incomplete`。代价是 help 未轮到时的完成原因显示为 `probe_incomplete`，与版本已取得的状态分开表达；`probe_failed`、`version_unrecognized` 和 `version_help_passed` 语义不变。四个定向用例覆盖取消、失败、未运行与 v 前缀版本。
