# CLI Agent 组合与任务继续

用户要求沿 SWA 主线继续开发功能适配。基线 `b351b9ea`，分支 `feat/swa-multi-agent-projects-20261025`，依赖前一批已有成果导出。目标是同一项目可以显式许可多个 CLI，并打通已实现接入之间的成果、交接和重连。

## 功能范围

- `external_model_cli` 保留默认客户端；可选 `external_model_clis` 为人工明确许可的集合，非空时必须包含默认。缺失或空列表沿用旧单客户端许可；默认为空不能保留非空许可列表。逐项验证真实注册，项目 revision、Grant、目录和 ToolsOff 继续生效。当前项目 JSON 存储直接保存字段，不需要数据库迁移。
- 项目设置、Run、Worker 与原生会话操作使用同一许可集合；已配置角色可以选择不同获准 CLI。改变许可不会自动重新授权现有 Run。
- Claude 完成结果补充统一 `final.text`，保留原文本分块、排除推理块的交付投影，使 Task.result、交接与能力观察可消费。
- 子任务返回时只复制父 Worker 的调用者、账号、项目与固定上下文；首次 `submission` 和原问题字段不进入新的继续请求。
- 结算写入前遇到状态变化时，事务完整回滚后等待下次观察；不留下阻塞后续完成的未知回执。真正效果未知继续保留原请求，不重发。
- 认证检查尚未发出命令时失败，释放本地待定记录；已发命令结果未知仍保留原 ID。浏览器保存每个项目的 Run/Controller/根 Task，刷新后只读重连，提供忘记连接入口。

## 验证范围

独立 Reviewer 已审核多 CLI 权限扩展、结算竞争与父任务继续的方案。必要验证覆盖旧设置兼容、人工设置保存、未注册/无效列表拒绝、当前许可与撤销、原 Grant/目录/工具规则，真实 SQLite 事务与回执，以及 Claude 文件读取、前端许可/请求状态/重连。实际模型、安装及平台验收分别记录，不把规则输入作为真实 Agent 成功。

## 实际执行结果

2026-10-25，Worker 完成实现与定向检查，独立 Reviewer 接受最终业务差分：多 CLI 权限保持旧配置范围，前置等待只在事务回滚后解除，父任务继续保留原权限，重连不绕过服务授权，已提交未知命令不自动重发。

本地 Go 使用 `.verification/toolchains/go/bin/go` 1.27.2；`ASTROCYTE_GO` 指向该路径，`GOCACHE`、`GOTMPDIR`、`TMPDIR` 位于 `.verification/portable-tests/`。Node 实际使用 24.22.1。固定 Node 24.16.0 在本环境执行 `--version` 即崩溃，未改项目固定版本或锁文件。

| 实际命令 | 结果与范围 |
| --- | --- |
| `go test ./internal/workspace/app ./internal/workspace/domain ./internal/adapters/swastore -run 'TestMultiAgent\|TestProjectAction\|TestOrcaDelivery\|TestOrcaHandoff' -count=1` | app 通过；另外两包在此过滤条件下没有匹配测试 |
| `go test ./internal/workspace/... ./internal/adapters/swastore ./cmd/swa` | workspace/app、domain、swastore 全包通过；cmd/swa 的 `TestLinuxServiceRealProcessTree` 失败，整条命令退出 1 |
| `go test ./cmd/swa ./cmd/swa-server -run 'TestRun\|TestQuestion\|TestSWA' -count=1` | CLI 任务/问答与实际服务启动、监听、关闭检查通过 |
| `node --test tests/swa-cli-headless/question-ask.test.mjs` | 7 项通过，包括真实 SQLite 回滚后同请求继续、未知效果保留、父任务继续字段 |
| `node --test tests/swa-cli-headless/claude-native-source.test.mjs` | 13 项通过；构造 JSONL 经生产读取器得到最终文本，真实文件边界检查通过，不代表调用 Claude 成功 |
| `node web/node_modules/vitest/vitest.mjs run --root web --config vitest.config.ts src/api/swaSubmission.test.ts src/pages/workspace/modelCLIPermission.test.ts src/pages/workspace/nativePermission.test.ts src/pages/swarm/swaObservation.test.ts src/pages/swarm/swaRunConnection.test.ts src/pages/swarm/swaQuestionAnswer.test.ts src/pages/swarm/swaRoles.test.ts` | 分两次执行这些文件，共 38 项通过；对应前端规则、构造 HTTP 传输和保存连接，不代表浏览器实测 |
| `node web/node_modules/vitest/vitest.mjs run --root web --config vitest.config.ts src/api/swa.test.ts` | 实际 Go HTTP 服务接口 6 项通过 |
| `node --max-old-space-size=8192 runtime/swa-orca/node_modules/typescript/bin/tsc --project runtime/swa-orca/tsconfig.json --pretty false` | runtime 类型检查通过 |
| `node web/node_modules/typescript/bin/tsc -b web` | 最后请求分类补丁后的 Web 类型检查通过 |
| `node scripts/build.mjs` | Go CLI、Go server、Web TypeScript、Vite 构建通过 |
| `node .verification/multi-agent-build-smoke.mjs` | 实际启动此次构建的 server；健康接口、Web 页面、编译资源返回 200，随后正常关闭 |
| `node /opt/codex/tools/pnpm/bin/pnpm.cjs --config.engine-strict=false check:contracts` | OpenAPI 有效，264 示例和生成客户端一致性通过；29 条既有警告保留 |
| `node scripts/check-architecture.mjs --swa`、相关前端 ESLint、`git diff --check`、`node --check scripts/check.mjs` | 通过；常规检查已纳入多 CLI 权限与 Claude 来源测试 |

日志保存在 `.verification/multi-agent-*.log`，属于本地运行记录，未提交 Git。构建启动检查脚本也是本地临时验证，不增加产品机制。

## 真实剩余限制

- `TestLinuxServiceRealProcessTree` 报告“私有后台 Job 归属无法核验”。进程相关源码本轮未修改；本容器独立观测到 `os.getpid()` 为 5，而 `/proc/self/status` 的 Tgid 为 20643，身份视图不一致。这是环境观测，尚未证明为测试失败的唯一原因；未削弱归属检查。完整默认检查未通过，不能进入发布验收。
- 本环境没有真实模型凭据；尚未完成本版本四 CLI 混合任务、父任务继续和问答的真实模型端到端验收。历史 Pi N4 活动停止失败、完整进程树 UNKNOWN、N6 未验保持原结论。
- 固定 Node 安装验证、Windows 安装和浏览器交互未在本轮完成；默认构建与本地 HTTP 启动不替代这些验收。
- 本轮提交独立功能分支及草稿 PR，依赖前一批交付导出修改，不合并 main、不发布。接续在配置齐备环境用现有流程验证实际混合任务、停止与继续；遇到失败修具体断点。
