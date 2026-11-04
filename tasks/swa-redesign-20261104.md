# SWA 对话式协作开发

## 目标与基线

按用户提供的《SWA-改造总方案与任务清单》开发对话 CLI、角色卡、交接、流式通道、聊天前端与安装引导。产品功能和性能优先；删除只用于自我证明的表述，保留业务错误定位、功能验证和下一步开发需要的信息。

产品基线为 `ad3259e25fdba28cb3698fe577ebc28706ed0658`；分支为 `codex/conversational-swarm-20261104`。现有 CLI 源码在 `C:/Users/DW/Documents/ChatGPT/swa-windows-fix`，提交 `9ca7c9e0c545f5f60999acb970d1866f8d66135b`。原目录只读复用。

使用 Swarm CLI 安排 Agent，参考 orca-cli、orchestration 的任务派发、消息、等待、指定停止、资源释放和成果获取。开发客户端为 Local Codex；实际 Swarm Worker 客户端和模型在启动后登记。工具权限沿当前公开项目范围执行。

## 开发顺序与写入范围

采用一条产品实现轨道，Swarm Worker 提供具体实现分析与独立审核。文件写入、测试、返修由同一负责人持续处理。

| 顺序 | 功能 | 写入范围 | 验收 |
| --- | --- | --- | --- |
| 1 | 角色卡、交接卡及共享契约 | `contracts/`、`roles/`、Swarm Domain、生成类型 | YAML/JSON 使用第三方解析和 Schema 校验；真实资产通过检查，错误字段在入口返回 |
| 2 | 对话会话、任务与 CLI | Swarm App、SQLite、迁移、CLI、必要的执行适配器 | 单角色真实任务、持久化、恢复、并发指定停止、成果导出 |
| 3 | 事件流与交接 | Swarm App、HTTP、SQLite、CLI | SSE 增量输出、游标续传、停止、字段选择、三角色接力、预算 |
| 4 | 聊天前端 | `web/src/` 与现有路由 | 会话、消息、角色、交接、成果、任务状态、长列表、键盘操作、构建分包 |
| 5 | 安装与开始使用 | 安装脚本、CLI setup/doctor、README、贡献指南、CI | 实际安装与诊断、默认六角色和三示例、相关检查与构建 |

共享契约在消费者实现前定稿；复用现有任务和执行端口，避免引入第二套调度系统。现有 Go、TypeScript、SQLite 结构保持。

## 检查安排

Swarm Reviewer 依据产品需求审核测试计划，再实施对应功能。使用真实 SQLite、HTTP 和已安装 Agent；原生验收保持公开固定上下文和原工具范围。日常运行受影响检查，集成后执行契约、架构、构建及完整适用检查。中间文件位于已忽略的 `.verification/swarm-redesign-20261104/`，运行数据位于仓库外本次独立目录。

## 当前结果

角色卡与交接卡 Schema、Go 校验器、六张默认角色、两张角色示例、一份交接示例已实现。`swarm roles list/show/new/edit/validate` 与 `swarm handoff validate` 可运行；角色工具三态、字段选择、来源保留和预算边界已有检查。

Swarm CLI 使用安装 `f25c4c361424bb372437adec898d436c1b1467c1`，实际 Worker 为 OpenCode 2.0.31 / `deepseek/deepseek-v4-pro`。角色格式与 CLI 测试计划由 `ctx_78ea12dc4efd` 接受。首轮连接拒绝及工具标记输出保留在本轮忽略目录，后续实际正文已取得。

| 命令 | 结果 |
| --- | --- |
| `go test -mod=readonly ./cmd/swarm ./internal/adapters/rolecards ./internal/swarm/domain` | 通过 |
| `node scripts/validate-cards.mjs` | 九份真实角色和交接资产通过 |
| `node scripts/check-architecture.mjs` | 46 个包通过 |
| `go build -mod=readonly -trimpath -o .verification/swarm-redesign-20261104/swarm.exe ./cmd/swarm` | 通过 |
| 实际 `swarm.exe handoff validate roles/examples/handoff.yaml --json` | 通过 |

下一项为 SQLite 与 HTTP 的共享角色管理，其后继续会话执行和流式输出。单角色模型端到端、三角色接力、聊天前端和跨平台安装保持待开发。

## 共享角色管理

Swarm App、SQLite 迁移028和四个角色 HTTP 操作已实现。内置角色的修改以完整覆盖值存储，版本从1递增；新建、CAS、幂等及重开使用实际 SQLite。CLI 指定 `--endpoint` 后访问相同角色服务；`--expected-version` 和 `--request-id` 可以保留原编辑命令的版本及身份。

- `go test -mod=readonly ./cmd/swarm ./internal/adapters/rolecards ./internal/swarm/domain ./internal/swarm/app`：通过，含实际 HTTP 和远程 CLI。
- `go test -mod=readonly ./internal/adapters/sqlite -run '^TestRoleCards' -count=1`：通过。
- `pnpm check:contracts`：退出0，264个 OpenAPI 样例、9份角色资产及生成一致性通过；13项既有警告。
- `node scripts/check-dependencies.mjs`、`node scripts/check-architecture.mjs`：通过。
- `node scripts/build.mjs`：Go 服务、MCP、Sleep、Swarm CLI 和 Web 构建通过；Web 首包 gzip 为199.50KB。

契约检查使用项目 Node 直接启动真实工具。CLI 实际二进制为11611136字节；五次测量中 `--version` 首次110.56ms、中位11.16ms，`roles list` 首次15.73ms、中位13.79ms。数据位于本轮忽略目录的 `cli-performance.json`。

当前源码审查使用 Swarm `ctx_95d4e0c52fd3`，会话设计分析使用 `ctx_7c21803f3e35`。原 README 固定上下文任务已停止、释放并关闭控制端；新任务固定 LICENSE 作为来源，源码按准确提交随输入提供。
