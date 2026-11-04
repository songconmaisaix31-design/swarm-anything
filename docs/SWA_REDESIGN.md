# SWA 对话式蜂群

SWA 把本机已经安装的 Agent CLI 连接到同一任务中，提供对话 CLI 和网页。Go 应用服务管理会话、角色、交接与任务，SQLite 保存状态和事件。网页和 CLI 调用同一套能力。

## 功能与执行来源

开发顺序为角色数据与共享契约、CLI 任务、流式输出、角色交接、聊天网页、安装引导。任务与实际结果见 [本轮任务](../tasks/swa-redesign-20261104.md)。本轮以用户附件为功能来源，采用用户最新要求：功能和性能优先，减少重复检查及自我证明文字，使用 Swarm CLI 调用本地 Agent。

现有任务执行、并发控制、停止、SQLite 存储、Agent 发现和工作项依赖继续复用。Adapter 负责发现、读取上下文、启动、恢复、发送、停止、观察和结果归并；保留底层 CLI 的输出来源和版本。未知执行结果先查询原请求。

## 角色卡 v0.1

角色卡使用 YAML 或 JSON，公开结构由 `contracts/role-card.schema.json` 定义。

| 字段 | 含义 |
| --- | --- |
| `schema_version` | 固定为字符串 `0.1` |
| `id`、`name`、`description`、`icon` | 稳定标识和展示信息 |
| `identity` | 该角色的提示词 |
| `tools` | 省略时继承默认工具，空数组关闭工具，非空数组限制到列出的工具 |
| `agents` | 省略或空数组允许任意已准入 Agent；非空数组限制可绑定的 Agent |
| `handoff_policy.accept_context` | 接收的交接字段，可选 `goal/done/decisions/artifacts/todos` |
| `handoff_policy.emit` | 该角色产出的内容名称 |
| `handoff_policy.auto_handoff` | 完成后接续的角色，空数组等待用户操作 |
| `budget.max_context_tokens` | 输入上下文上限 |
| `budget.max_steps` | 执行步骤上限 |

内置角色为规划者、实现者、审查者、研究员、写作者和运维者。角色数据放在 `roles/builtin/`，贡献角色放在 `roles/community/`，格式示例放在 `roles/examples/`。角色约束与项目已有许可共同决定实际能力。

## 交接卡 v0.1

交接卡由 `contracts/handoff-card.schema.json` 定义。顶层字段为 `schema_version/handoff_id/session_id/from_role/to_role/at/card`。`card` 包含目标、已完成内容、决定、产出物、待办事项及 `source_trace`。

`source_trace` 的每项包含交接字段名 `field`、来源角色 `role`、来源消息 `msg_id`。发送时按目标角色的 `accept_context` 选择字段，同时选择对应来源。原交接卡保存在 SQLite，CLI 和网页可以读取交接历史。

每个角色具有上下文和执行步骤上限，交接卡默认最多 8,000 tokens。超过上限时停止当前动作，返回超出项目及可执行的处理建议。需要摘要时明确提交摘要结果，保留原卡和来源。

## CLI 与 API

| CLI | 产品行为 |
| --- | --- |
| `swarm setup` | 探测 Agent、选择数据目录、查看默认角色、检查 SQLite 与真实最小任务 |
| `swarm chat` | 进入持续会话，增量输出当前角色执行内容 |
| `swarm run "任务" --role 角色` | 执行一次任务；`--json` 输出 JSON 行 |
| `swarm roles list/show/new/edit/validate` | 浏览、创建、编辑和校验角色 |
| `swarm agents list/probe` | 查看本地 Agent 与实际探测结果 |
| `swarm sessions list/show/resume` | 查询和继续会话 |
| `swarm handoff 角色` | 生成交接卡并继续目标角色 |
| `swarm stop 会话` | 停止指定会话的当前角色 |
| `swarm export 会话 --format md/json` | 导出消息、成果与交接链 |
| `swarm doctor` | 检查工具链、权限、数据目录、代理与 DNS |

对话中的命令为 `/role`、`/handoff`、`/stop`、`/status`、`/clear`、`/help`。Ctrl+C 请求停止当前执行。

HTTP 继续以 `contracts/openapi.yaml` 为来源。新增角色 CRUD、会话消息、`/sessions/{id}/handoff`、`/sessions/{id}/handoffs`、`/sessions/{id}/stop` 和 `/sessions/{id}/stream`。SSE 使用持久事件 ID 和 `Last-Event-ID` 续传；慢消费者通过有界队列和背压处理。错误沿用 `code/message/retryable/request_id/required_action`，写入沿用现有身份、CSRF 和幂等语义。

## 聊天网页

左侧提供会话新建、搜索、历史与继续；中间展示用户消息、Agent 增量消息、交接卡和工作项；右侧提供当前角色、任务状态、产出物和预算。停止按钮在执行期间始终可用。依赖图按需加载。

深色和浅色主题跟随系统；正文使用系统字体，代码使用等宽字体，正文行高 1.6。状态变化动效为 120–200ms，并尊重 `prefers-reduced-motion`。提供键盘导航、足够对比度和流式状态播报。窄屏折叠右侧面板。长会话使用虚拟列表，聊天、蜂群和依赖图分包。

## 性能与使用体验

| 项目 | 目标 |
| --- | --- |
| CLI 版本和首屏 | 500ms 内 |
| Agent 探测 | 后台异步缓存，总预算 10s |
| 模型首 token | 2s 内；本地模型单独记录 |
| 网页首屏 JavaScript | gzip 后不超过 250KB |
| 安装依赖、构建 | 各不超过 60s |
| 默认检查 | 不超过 90s |
| Go 二进制 | 静态构建，未压缩目标不超过 40MB |
| 首次任务 | 从安装开始 10 分钟内完成 |

SQLite 使用 WAL，并为会话和交接查询建立索引；现有迁移备份沿用 `VACUUM INTO`。依赖使用现有锁文件。实际计时按环境与命令记录。

安装提供 Windows、macOS、Linux 脚本与 Release 归档。默认提供六张角色卡和代码重构、文档润色、目录分析三项示例。README 中文为主并提供 English summary，QUICKSTART 说明开始步骤，TROUBLESHOOTING 说明具体错误与处理动作。贡献指南说明 adapter、角色卡、契约和相关测试；保留 AGPL-3.0。

## 验收顺序

| 阶段 | 对应附件任务 | 可观察结果 |
| --- | --- | --- |
| 0 | A1–A8 | Schema、示例、验证器和共享类型可用，单角色真实任务成果入库 |
| 1 | B1–B9 | chat/run/stop/sessions 可用，两个真实 Worker 并发、指定停止和成果获取 |
| 2 | C1–C5 | SSE 增量、断线续传、停止及背压通过实际检查 |
| 3 | D1–D6 | 角色管理、字段选择、预算、持久交接与规划→实现→审查接力 |
| 4 | E1–E11 | 聊天、角色、交接、工作项、长列表、主题、分包与首次使用流程 |
| 5 | F1–F10 | 安装、setup、doctor、示例、使用说明、贡献流程和发布检查 |
| 持续 | G1–G5 | 权限、性能、当前结果、备份及依赖随功能维护 |

后续按实际需求增加 adapter、角色市场、PWA、托管模式及科研场景。
