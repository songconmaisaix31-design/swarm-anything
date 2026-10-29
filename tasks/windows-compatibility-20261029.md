# Windows 可用性复验与修复

## 范围与基线

- 用户确认以远程 `main` 为准，基线为 `5c11bbf85793e991977ca6bd96dc187436aa025c`。
- 工作分支为 `codex/windows-compatibility-20261029`，工作目录为 `C:/Users/DW/Documents/ChatGPT/swarm-anything`。
- 用户要求使用 Swarm CLI 执行任务。已安装客户端为 `C:/Users/DW/AppData/Local/SwarmCli/candidates/893fb885-install88/swa.exe`，实际版本为 `893fb8852e15109ca9a99f1bd51d83ea249a37b8`。
- `main` 尚未包含 `cmd/swa` 和 `runtime/swa-orca`。安装客户端负责调度；不将其开发分支代码混入本次基线。
- 本次检查 Windows 的开发检查入口、编译、启动、HTTP 和 SQLite，以及测试发现的实际路径和进程问题。原生模型调用只使用公开固定上下文并保持原生工具关闭。

## 执行安排

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

## 已执行验证

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
| `internal/adapters/agents/native_process.go`、`opencode.go` | main 的 Windows 入口只识别 `opencode-ai` 包目录，并固定已核验的 1.18.35 协议；本机为 `@opencode/cli` 2.0.31，4 个实际原生测试在入口检查失败。支持新版本仍需完整隔离与 HTTP 协议核验，未直接删除版本保护。Swarm CLI 使用独立 ACP 适配器，其成功不代表 main 此适配器通过 |
| `cmd/server/relay_workbench_links_test.go` | 创建实际目录 symlink 返回 Windows 1314；未修改系统权限或跳过检查 |
| `cmd/server/relay_runtime_http_test.go` | 实际 HTTP 返回 403/`approval_required`，用例期待 200；尚未证明是权限实现或测试前置条件错误 |
| `internal/adapters/agents/text_capacity_test.go`、`tests/s1/automatic_test.go` | 实际 Codex 来源身份/启动观察和 HTTP 探测不符合断言；未放宽来源或授权检查 |
| `internal/adapters/sqlite/local_agents_test.go`、`local_agents_narrowing_test.go` | 旧测试的回执重试断言失败，另有缺少实际消息仓库/原控制器 Reader 的拒绝；未用虚假原生数据补齐 |
| `internal/adapters/importers`、`internal/attention/app` | 真实公开列表获取失败及分页/中断断言失败；尚未确认上游响应变化或实现错误 |
| `internal/workspace/app/relay_process_test.go` | 真实 CLI 启动返回 `delivery_unknown`；未启动第二个写入者，原因仍需核查 |
| 资料与认知检查 | 缺少显式获准的公开 PDF、视频原件、DOM、认知发布物、原生回执等输入；对应 Go 及前端套件保持失败/未验 |
| `scripts/check-dependencies.mjs` | 固定 summarize CLI 的版本加载超时原因未确认；依赖检查未通过 |

完整默认检查、全部原生接入和 Windows 全量功能验收仍未通过；没有创建 Release、合并 main 或修改系统配置。

## Swarm CLI 实际审查

独立修复分支当前安装来源为 `9ba9530073f5ec28443d808bb8e2aa8360a18de3`，客户端为 Swarm CLI，Worker 为 OpenCode 2.0.31 / `deepseek/deepseek-v4-pro`。公开固定上下文和原生工具关闭策略保持。

实际 Run `run_a0bbb93e961d` 包含 main Reviewer `ctx_5eef4ded54d1` 和 CLI Reviewer `ctx_d351167c3d58`。两份原生 SQLite 最终消息分别为 `msg_183984d4c001SlENVqvu7MNsX7`、`msg_1839b9760001MqpPQS6eYdJ1wj`，均完成且 `idle_outcome=succeeded`。只读提取最终正文，不把模型审查当作执行测试；main 修复限定接受，CLI 四项原因匹配，失败释放未接受。模型建议中的模拟测试和未经复现的 Windows shim 推断未采用。

第一名 Worker 的实际停止成功；服务退出后释放请求连接失败，同目录恢复又返回 `operation_unknown` / 私有后台 Job 归属无法核验。原数据库、原请求和实际两份结果保留于 `C:/Users/DW/AppData/Local/SwarmCli/validation-data/windows-main-permission-20261029`，没有重放未知请求。未完成的释放、成果导出和控制端关闭不能记为通过。

正常流程使用同一 `9ba95300` 安装、新私有目录 `windows-main-final-20261029` 和端口 64624 完成独立复验。实际 runtime `fc624b95-c244-4695-b3c9-aae3b6e23380`、Run `run_b25627644463`、根任务 `task_495beaccb536`；两名 Worker 为 `ctx_2a3e12835918`、`ctx_e660c4abd71a`。实际最终消息为 `msg_1851c7f78001F2t1BP5kLIXeCR`、`msg_1851e227f001CTk37OTs0a3r8z`，均已完成，工具调用数为 0。

两次 `swa worker stop`、两次 `swa worker release`、`swa task result`、`swa task complete`、`swa controller close` 全部退出 0；完整原生输出和 journal 导出至 `.verification/windows-20261029/final-cli/exported-result/result.json`。控制端关闭请求 `9d3a3958-321a-4f25-a255-892da3e8dd39` 成功。随后 Ctrl+C 结束所属服务，HTTP 关闭及 Job 子进程退出被观察到，外层终端返回 1；四个已观察服务进程均已不存在，端口不再监听。该正常流程通过不改变前述失败释放和中断恢复的未通过状态。
