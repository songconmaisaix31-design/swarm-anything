# Astrocyte 与 Attention Mirror 独立化

日期：2026-10-23（北京时间）。负责人：`/root/separation`。工作区：`/workspace/swarm-anything`；分支：`integration/swa-task-cards`。调查基线：`11619d72f08c163f159a4f4befe270806b1b67ea`。首批空间与服务组装已实施并完成局部验证；两个产品的独立仓库尚待源码抽取验收。

## 目标与当前决定

用户要求清理仓库，把 astrocyte 和 attention mirror 独立出来，同时继续 SWA 任务交付、Agent 能力、交接和角色模型。独立后的每个产品须有自己的启动、构建、测试和说明入口，SWA 的直接项目任务路径不得要求安装或启动资料与认知产品。原源码历史、许可证、现有数据和真实验证原件保留。

用户已确认拆为两个独立项目/仓库，SWA 只保留必要集成。Root 已接受下述产品职责划分；先在本机准备两个独立仓库及准确来源，不自动公开或发布远端。现有 `META_PLAN` 的“唯一产品主仓”和保留全部 Attention 的旧方向，由本次新用户要求覆盖；其历史记录保留原范围。

## 已核实边界

| 当前来源 | 实际职责与耦合 | 拆分要求 |
|---|---|---|
| 根 `go.mod`、`package.json`，`web/package.json` | Go module 为 `.../Astrocyte`，根包为 `astrocyte`、网页包为 `@astrocyte/web`；名称覆盖整个现有产品 | 不按名称批量替换标识。模块路径、协议、存储目录与产品名称分别处理 |
| `internal/attention/{app,domain}` | 同包同时包含资料导入、沉淀、品味、机会与认知事件、注意力动力学、知识、经验、睡眠整理 | 两个产品不能只按整个目录搬走；先划定类型与服务所属，再切开源码依赖 |
| `cmd/mcp`、`cmd/sleep`、`cmd/internal/attentionruntime`、`cmd/attentionruntime`；`internal/adapters/{mcp,events}` | 认知 MCP 五工具、事件摄取、睡眠和认知引擎组装 | 建议归 Astrocyte；保留工具名、显式参数、项目身份和权限约束 |
| `internal/adapters/{importers,distillers,openviking}`，`web/src/pages/attention` | 资料获取、沉淀、品味、机会、可选 OpenViking | 建议归 Attention Mirror；外发、用户选择与准入仍逐原权限处理 |
| `internal/workspace`、`internal/swarm`、`internal/adapters/orca`、`runtime/swa-orca`、`cmd/swa` | 项目、授权、会话、任务与实际 Agent 执行 | 归 SWA；现有后台维持唯一任务状态权威 |
| `cmd/server/main.go`、`cmd/server/orca_runtime.go` | 同一个 Go server 通过 `SWA_INSTALL_ROOT` 分支启动；SWA 分支仍实例化 `AttentionService`、对象存储和资料 reader | SWA 独立 composition 不再默认实例化资料/认知服务；可选集成须显式注入 |
| `cmd/server/project_bridges.go`、`internal/adapters/admissionbridge` | 资料引用、项目模型授权、资料准入跨上下文桥接；真实同库事务已有测试 | 成为明确的可选集成边界；拆服务时不能假设原同库事务仍原子 |
| `internal/adapters/httpapi`、`internal/adapters/sqlite` | 单个包直接导入 Attention、Workspace、Swarm；HTTP Services 混合所有产品；SQLite DB 接收者实现所有存储 | 必须分包并明确通用连接/HTTP 基础设施归属；仅新增命令或构建开关不能证明源码依赖独立 |
| `migrations/001`—`028` 与 `migrations/embed.go` | 全部迁移统一嵌入、统一运行；`attention_project_spaces` 也服务 SWA 开发空间，`orca_execution_links` 外键指向 `local_agent_projects` | 开发空间应由 Workspace 拥有。先确定迁移/兼容读写方案，再分迁移集；不得删除或重写已应用迁移 |
| `web/src/App.tsx`、`web/src/main.tsx`、`web/vite.config.ts` | 一个 App 静态导入资料、认知、工作区和协作页，SWA combined 也打包整个网页 | 每个产品有实际独立入口和资产依赖；SWA 默认导航聚焦角色、会话、任务、Worker |
| `scripts/build.mjs`、`scripts/build-swa-{linux,package}.mjs`、`scripts/swa-package-config.mjs` | 原构建出 Astrocyte server/MCP/sleep，SWA 构建仍编译 `cmd/server`，combined 引入原完整网页 | 分别构建并检查真实生产闭包；安装物与开发入口保持一致 |

`Attention Mirror` 在当前仓库正文仅作为 `docs/SPEC.md` 的产品题头出现，没有现成同名命令或包。推荐职责解释：Astrocyte 管认知事件、注意力动力学、知识与经验；Attention Mirror 管资料导入、沉淀、品味与机会；SWA 管执行。共享判断及项目授权按真实消费者保留清晰 API，不能复制出两个批准权威。

已实际执行 `go list -mod=readonly -f '{{.ImportPath}}|{{join .Imports ","}}'`，覆盖四个命令、三业务上下文及 HTTP/SQLite/MCP 包，退出 0。结果确认业务 app/domain 无跨上下文 import，耦合主要位于 composition、传输与存储包。该结果是源码依赖事实，不代表拆分或构建验收。

## 实施顺序与拟定写域

首批准确写域已由 Root 授予并获 Reviewer 接受。后续写域逐批声明；避免与任务入口及 GUI 负责人并写共享文件。

1. 先确定三产品职责及共享能力归属。`docs/SPEC.md`、`docs/META_PLAN.md`、`docs/QUESTIONS.md` 由 Root 单独维护；既有 Task/Dispatch/Worker 契约沿其负责人推进。
2. 处理直接阻塞独立的空间、存储和 HTTP 接缝。拟写域：`internal/attention/{app,domain}` 中空间及认知类型、`internal/workspace/{app,domain}` 中空间端口、`internal/adapters/sqlite`、`internal/adapters/httpapi`、`internal/adapters/admissionbridge`、`cmd/server`、新增迁移。具体文件清单和新包 API 必须在实施前定稿；该批共用表示串行实施。
3. 按已答仓库边界建立产品根。独立仓库方案需各自 Go/npm 定义和许可证，并通过正式公开包/版本契约使用确需共享能力；不使用指向 SWA 工作目录的 `replace` 或运行时路径逃逸假装独立。同仓方案需独立 package/module 和构建目标。不得复制维护第二份任务状态或授权逻辑。
4. 抽取产品 composition、前端入口及对应源码。拟写域：Astrocyte 的认知命令、认知 app/domain、认知 adapter、`web/src/pages/cognition`；Attention Mirror 的资料 app/domain、importers/distillers/openviking、`web/src/pages/attention`；SWA 的独立 server composition。GUI 公共样式、路由和组件由 GUI 负责人串行接入。
5. 切换根开发入口与构建/CI。拟写域：根 `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、三产品包定义、`scripts/build*.mjs`、`scripts/start.mjs`、`scripts/dev.mjs`、`scripts/check-architecture.mjs`、相关 CI、README。Go module 改名只有在具体模块边界已定且全部消费者纳入时执行，不作为清理前置。
6. 原件归属明确后再移出 SWA 活跃构建路径。Git 使用普通新提交保留来源，不重写公共历史；研究、验证证据和现有安装物不因目录清理而删除。数据库拆分仅使用专门新建测试数据库；真实用户数据库迁移不在本轮自动执行范围。

## 测试计划

| 验收 | 必须验证的真实结果 |
|---|---|
| 三产品独立构建 | 每个产品的干净源码输入及锁定依赖能单独安装/编译；不依赖另外两个产品的 checkout、已编译产物、运行中服务或私有目录；记录准确源与命令 |
| SWA 运行独立 | 最小已安装 SWA 正常启动、注册公开项目、使用开发空间、查询权限和能力、创建/观察 Run；CLI 与 GUI 同 Run。资料/认知产品未启动时直接任务路径可用 |
| 资料和认知保全 | Attention Mirror 实际公开资料导入/沉淀/品味与拒绝路径；Astrocyte 原生 MCP 五工具、事件提交/查询、知识与经验权限、显式 sleep 参数沿原适用测试通过 |
| 数据连续性 | 用旧迁移在独占目录建立真实 SQLite，再执行新迁移，逐项核原 ID、版本、项目/空间成员和授权、资料引用、认知原件、幂等回执及外键；迁移重复执行不重复写，失败真实回滚，原测试库快照保留 |
| 共享授权与事务 | 原 `attention_workspace_transaction_test.go`、`local_project_transaction_test.go` 代表的原子性得到等价真实验证；同库事务被拆开时先明确提交/补偿语义，不用 mock 或“最终成功”隐藏半完成状态 |
| 产品路由和资产 | 三个实际 production HTML/JS/manifest 服务正确；默认导航只出现本产品能力；跨产品入口需配置且标明不可用原因；断开的集成不造成无限重试或错误授权 |
| 依赖边界 | 扩充现有 architecture 检查验证三产品导入方向；检查实际 Go 列表和 Vite 生产依赖，防止仍因混合包把另两产品编译/打包进 SWA |
| Windows/Linux | Linux 本地独立构建及服务检查；Windows x64 原生 CI 构建、安装和退出检查。某平台未实际运行则保持未验；原 Windows 来源结果不代验新拆分源码 |

定向用例根据实际修改选择，现有 `tests/attention-engine`、`tests/release-cognition`、`tests/s1`、`tests/s2`、`tests/s3`、`tests/swa-cli-headless` 与 `web/e2e` 按产品归属保留。该计划不授权执行依赖真实账户或用户私有资料的历史 live 测试。N>3 与真实模型调用由验收负责人单独统筹，不用这份拆分计划扩大来源或工具授权。

失败后先报告可复现的最小步骤、根因证据和局部验证结果，之后才启动下一次完整构建。现有磁盘约 1.7 GiB 可用，构建前检查实际空间并复用既有依赖缓存，不删除无法解释的安装、归档或证据。

## 首批：Workspace 开发空间与 SWA composition

Root 已裁决保留 `attention_project_spaces` 表名、原 ID、版本和完整 `material_refs`，移动唯一存储责任，不新增导入表、双写或无必要迁移。首批只切开已确认的生产接缝；混合 HTTP/SQLite 包的剩余编译依赖继续列为后续抽取，不能据此宣称三产品独立完成。

公开端口与兼容行为：

- Workspace `ProjectSpaces` 提供 `ListProjectSpaces(ctx, Caller)`、`CreateProjectSpace(ctx, Caller, ProjectSpaceCommand)`、`GetProjectSpace(ctx, Caller, id)`；结构沿原 JSON 的 `schema_version`、`space`、`items`、`id/version/title/material_refs/created_at`。`ProjectSpaceCommand` 使用原等价命令元数据，创建仍要求版本 1、非空标题与 human 身份。
- Workspace `ProjectSpaceRepository.WithProjectSpaceTx` 与 `ProjectSpaceTx` 提供空间、幂等回执、事件的同连接事务。生产存储仅此实现直接读写旧空间表；Attention 的旧事务方法显式转换 DTO 后委派此实现，保证资料引用、资料热度与回执仍处于原同一事务。
- `CreateProjectSpace` 原 `attention_receipts` 的 caller/command/key、语义 digest（忽略 request_id）、完整结果和 `attention.project_space_created` 事件兼容保留。重放读原回执，不新建第二空间。新服务不读资料或调用 Agent。
- Attention App 新增消费方 `ProjectSpaces` 端口，由 `ServiceOptions.ProjectSpaces` 显式注入；旧 List/Create/Get 方法只转换/委派端口，未配置则 `unsupported_capability`，不继续旧创建逻辑。跨上下文 DTO 转换在 adapter 完成，app 不导入另一 app。
- HTTP 空间三入口统一使用显式 `Services.ProjectSpaces`。资料引用两入口仅在实际 Attention 配置时运行；SWA 未配置时返回 `unsupported_capability`。旧 refs 正文和版本保留，查询不把存量 refs 清空。
- 原主 server 注入 Workspace 服务及 Attention 桥接；SWA server 只注入 Workspace 服务，删除默认 AttentionService、资料 reader、objects 和 projectReferenceBridge 的实例化。项目的明确资料引用输入在缺少集成时返回 unavailable；固定公开文件任务继续可用。

准确首批拟写域（Root 排他授予，Reviewer 接受后实施）：

1. 新增 `internal/workspace/domain/project_spaces.go`、`internal/workspace/app/project_spaces.go`、`internal/adapters/sqlite/workspace_spaces.go`、`internal/adapters/projectspacebridge/bridge.go`、`internal/adapters/httpapi/workspace_spaces.go`。
2. 修改 `internal/attention/app/contracts.go`、`internal/attention/app/attention.go`、`internal/attention/app/spaces.go`，`internal/adapters/sqlite/spaces.go`，`internal/adapters/httpapi/server.go`、`internal/adapters/httpapi/classification.go`，`cmd/server/main.go`、`cmd/server/orca_runtime.go`。如需要对 `projects.go` 中显式 refs 的 nil 情况作 fail-fast，先通知 Root 加入准确写域。
3. 新增 `internal/adapters/sqlite/workspace_spaces_test.go`、`internal/adapters/httpapi/workspace_spaces_test.go`；修改受接口直接影响的真实测试组装：`internal/attention/app/production_fixture_test.go`、`internal/adapters/sqlite/attention_workspace_transaction_test.go`、`internal/adapters/sqlite/local_project_transaction_test.go`、`internal/adapters/sqlite/accepted_experience_test.go`，以及 `internal/adapters/httpapi/attention_test.go` 中实际服务 fixture。额外真实消费者若实际编译/检查暴露则逐文件提交 Root；不添加模拟存储。

首批定向验收：真实 SQLite 创建/读取/重放、变更输入拒绝、human/agent 拒绝、原完整 refs 保全、同库嵌套提交和实际约束回滚、跨库事务拒绝；原 Attention 引用追加/撤回及热度原子性；实际 HTTP 同源会话/CSRF、空间三入口以及未配资料引用明确拒绝；SWA 组装编译和架构检查。执行使用新建独占目录，不调用真实模型。完整安装候选按 Root 的后续集成窗口执行。

## 停止条件

共享契约或写域冲突交 Root 排序。发现拆分会丢失数据、破坏已有授权或把原子事务改成未定义的跨服务提交，暂停该部分并提交具体设计，继续不受影响的工作。缺失 Windows 或真实模型证据时保留未验，不将纯文档、入口改名或编译通过称为产品独立完成。

## 首批实施与验证结果

13 个产品文件按计划完成，额外将实际测试消费者的 Workspace 空间服务显式注入。旧 `project_distiller_test.go` 使用内存假存储和假 Distiller，按 Root 决定迁为 `cmd/server/workspace_spaces_test.go` 的真实 SQLite、实际 Registry 与生产 SelectedTextFactory 权限路径；该用例验证未选择模型、未授权资料、原生进程未探测和撤回权限的结果，没有调用模型，不声称模型沉淀成功。`internal/workspace/app/project_spaces_test.go` 仅为既有实际测试提供真实端口组装。

- `product-separation-spaces-r1.log`：SQLite 六项和 HTTP 一项通过；五项 Attention fixture 因未设置必需的 `ASTROCYTE_TEST_OUTPUT_ROOT` 在业务调用前停止。原件与最小复现保留。
- `product-separation-spaces-r2.log`：设置明确的独占目录后，五项实际引用、固定版本、回滚和当前目标检查通过。新增沉淀权限用例暴露测试组装缺失 Registry，栈定位 `projects.go:172`，已显式注入生产 Registry。
- `product-separation-spaces-r3.log`：新增沉淀权限用例通过，未创建原生会话或成功沉淀记录。
- `product-separation-compile-r1.log`：`go test -mod=readonly -run '^$' ./...` 退出 0，表示全部 Go 包编译通过，未执行全套测试。
- `product-separation-architecture-r1.log`：`node scripts/check-architecture.mjs` 退出 0，检查 47 个包。`git diff --check` 退出 0。

日志位于 `.verification/cloud-setup/`。上述检查针对当前共享工作树，含其他负责人的并行改动，未固定为最终集成 Commit。没有启动完整安装构建。

## 第二批：独立 Astrocyte 源码闭包

已核实 `/workspace/astrocyte` 和 `/workspace/attention-mirror` 均不存在。Root 授权本地独立仓库，不发布远端。本批先完成 Astrocyte 的独立认知闭包，再抽取 Attention Mirror；原 SWA 业务源码在独立构建和消费者交接前保留，最终由 SWA 源码闭包负责人移出主动构建路径。

准确写域为新仓 `/workspace/astrocyte/**` 和本任务文件；原仓仅只读。保留原 Go module `github.com/songconmaisaix31-design/Astrocyte`，无需更改认知源码 import；新仓没有本地 `replace`、`go.work` 或指向 SWA 的软链接。选定原件按目录关系转移至新仓，代码修改只使用文件编辑工具：

- `cmd/mcp`、`cmd/sleep`、`cmd/internal/attentionruntime/events.go`、`cmd/attentionruntime/sleep.go`。
- `internal/attention/app` 中 `engine_{conflicts,contract,dynamics,lifecycle,read,store_api}.go`、`event_service.go`、`experience_{accepted,completion_contract,ingest,service}.go`、`knowledge_{crystallized,fluid,retrieval,service,store}.go`、`mcp_{backend,binding,engine}.go`、`persistence_contract.go`、`sleep_{facts,knowledge,service,store_api}.go`。仅补齐这些文件真正消费的 `Principal`、`CommandMeta`、`Receipt` 和错误/摘要函数；不带入资料 Service 或 Workspace。
- `internal/attention/domain` 中 `engine_contract.go`、`dynamics.go`、`signal_normalize.go`、`topic.go`、`topic_association.go`、`antimatthew.go`、`lifecycle.go`、`conflict.go`、`knowledge.go`、`experience.go`、`sleep.go`、`sleep_metrics.go`、`retrieval.go`、`retrieval_relevance.go` 及其原有定向测试。必要共享规则先按真实符号依赖确认，不复制资料/任务聚合。
- `internal/adapters/sqlite` 中 `adapter.go`、`engine_common.go`、`engine_store.go`、`event_store.go`、`experience_store.go`、`knowledge_store.go`、`sleep_store.go`、`sleep_store_repository.go`、`vec.go`；按这些文件的真实引用补齐纯 SQLite JSON/CAS 工具函数，不复制 Workspace repository、授权表或任务状态。
- `internal/adapters/mcp`、`internal/adapters/events`、`internal/apierrors` 的认知实际生产文件与直接真实消费者测试；明确剔除依赖 SWA 的入口组合测试，原件仍保留在 SWA 历史。
- `migrations/001_initial.sql`、`014_attention_engine.sql`、`015_attention_engine_persistence.sql`、`017_attention_engine_references.sql`、`018_attention_engine_consolidation_time.sql`、`023_experience_completion_sources.sql` 与独立 embed；历史文件保持原内容与编号。专属新迁移补齐新仓的 schema context，不能改写旧迁移。
- 原许可证、独立 `go.mod`/`go.sum`、`package.json`（只编排 Go 构建/检查）、README、来源文件清单、`.gitignore`。无第三方应用或 SWA node_modules 复制。

测试计划：先编译认知包，随后既有纯 Domain 规则测试；以独立数据目录和真实 SQLite 执行现有 MCP 生命周期/权限/重复回执与 sleep 参数、事务用例。新增实际抽取检查验证新数据库仅有认知/基础设施表，不创建 `local_agent_*`、`swarm_*`、`attention_materials`；重复迁移保持认知原件 ID 和回执。最后仅以本仓源码在 `GOWORK=off` 下独立 `go build` 两个命令，`go list -deps` 不含 Workspace/Swarm/资料 adapters 或 SWA 文件路径。实际 MCP stdin/stdout 初始化、五工具列表与本次运行产生的真实事件收据作为运行入口验收。Windows x64 交叉编译只记编译证据，未原生运行则保留未验。

本批未移动真实用户数据库。独立数据库与旧整库不共用一个默认目录；已有数据的跨产品导出需要独立定义的显式操作，不能借迁移读取所有产品数据。

第二批结果：`/workspace/astrocyte` 的 `main` 分支准确 Commit 为 `ce16b291ef01ecf6d3f55a4cefd3e79ea30c6244`。`GOWORK=off go test -mod=readonly -count=1 ./...` 全部通过（`.verification/independent-tests-r2.log`）；`npm run build` 两个 Linux 命令通过；Windows amd64 两命令交叉编译通过，未实际原生运行。`go list -deps` 的 10 个本地包全部解析到新仓目录，未出现 Workspace/Swarm/资料包。新增真实 SQLite 检查验证纯认知表集合、实际公开 README 读取原件、幂等、重启、来源改变拒绝及未获授权 Agent 知识读取拒绝。首轮缺失原规则输入 `M3-golden.json`，补入原字节后 Domain 局部及全套通过；依赖输出模板对标准库 nil Module 的错误单独修正查询，未重复构建。

该 Commit 只交付认知命令子集。原生事件解析、HTTP 与 GUI 仍需抽取；当前 README 明确记录。旧 SWA 前端尚未删减，Root 已委派 `/root/run_cli` 负责其独立入口、`/root/capabilities` 负责其生产 Go 闭包，我只读旧仓并负责两个独立产品新仓。

## 第三批：独立 Attention Mirror 资料产品

准确写域：`/workspace/attention-mirror/**` 和本任务文件；旧 SWA 全部只读。新仓独立 Git、Go/npm 构建入口、原许可证、来源说明、独占数据目录 `attention-mirror`、默认 loopback 8788。按 Root 避免无必要 module 批量替换的裁决，Go module 保留历史 import 名称以便审查源文，实际依赖必须全部解析为本仓源码；不得通过本地 replace 或 SWA checkout 维持编译。

源码闭包：

- `internal/attention/app/{admissions_ports,admissions_service,attachments,attention,automatic,contracts,distillations,jobs,materials,openviking,openviking_contracts,opportunities,paper_search,profiles,project_distiller,project_references,recovery,service,source_catalogs,spaces,taste_profile,tracking,tracking_jobs}.go`。认知 app/domain 不复制。
- `internal/attention/domain/{admissions,job,listing,openviking,paper_search,profile,ranking,rules,source}.go` 及这些纯规则原有测试。真实符号闭包缺口按实际生产消费者补齐。
- `internal/adapters/{importers,objects,openviking}` 生产文件；`distillers/codex.go` 与 `contracts/embed.go`/`distillation-output.schema.json` 保留明确配置的处理器。仅提取 `selected_text.go` 的纯 512KiB prompt 预检；其 SWA 原生执行器消费方留作显式外部集成边界，不复制 Agent 执行/项目授权。
- SQLite `adapter.go`、`attention.go`、`ranking_profile.go`、`source_catalogs.go`、`tracking.go`、`taste_profile.go`、`openviking.go`，从 `spaces.go` 只抽取资料分类 SQL。AttentionTx 的空间方法在独立仓明确返回 `unsupported_capability`；默认 ProjectSpaces 端口不配置，不创建空间/授权/任务表。原 SWA 同库事务桥接继续保留原语义，独立进程不假装跨库原子提交。
- HTTP 复用 `attention.go`、`classification.go`、`middleware.go`、`tracking.go`、`paper.go`、`openviking.go`；独立 `server.go`/`handlers.go`/`session.go` 仅组装资料服务与原同源/CSRF保护。独立 session cookie，不识别 SWA token、不复制其 scoped grant。空间和机会转入 SWA 的入口未配置时明确 unavailable，不返回空成功。资料读取、原文与固定版本、人工沉淀、领域、排行/品味、机会和工作状态仍使用原服务。
- 原迁移 `001_initial`、`003_attention`、`005_attention_ranking_profile`、`006_attention_tracking`、`010_tracking_source_identity`、`011_source_catalogs`、`026_taste_profiles` 保留原文并嵌入。原 `004` 混合 Workspace 空间，`027_openviking` 的提交表以外键引用该空间；两份原文在 `source-migrations/` 保全、不应用于独立新库。新增专属迁移仅创建原 `attention_domains` 分类表和独立产品元数据。不执行真实旧库数据导入。默认 OpenViking 不组装服务/提交表，状态端口明确未配置；独立提交的外部空间引用和当前权限需后续显式集成契约，不静默移除旧外键或声称提交能力已迁完。
- 独立 `cmd/server` 提供数据目录、端口和显式本地文件读取目录参数，沿实际 Importer/ObjectStore/Attention.Run 工作生命周期。默认模型处理器未配置，状态准确显示不可用，不以伪处理器替代。真实来源读取仅在用户明确输入、批准目录后发生。
- 前端抽取旧 `web/src/pages/attention`、实际依赖的 API/types/components/hooks/router/styles，保留对应原件来源。新 App 仅挂资料产品；不复制 Workspace/Swarm 执行页面或角色/任务状态。需要 SWA 的空间选择、项目处理器和转入执行入口由明确集成状态控制，未配时显示原因；不能自动调用不存在的本地权限服务。专用 Vite/npm 入口独立 build/typecheck，锁定依赖，不软链 SWA node_modules。

测试计划：独立 Go 编译和实际 Go import 闭包；新 SQLite 表清单不得出现 `local_agent_*`、`swarm_*`、`attention_engine_*`、`attention_project_spaces`。实际公开本仓文件经 Reader 导入和工作队列完成，保持原字节、固定revision和重复请求回执；实际人工沉淀、更新/撤回权限、资料领域与机会读取，原事务失败回滚。HTTP 通过真实服务组装验证会话/CSRF/跨源与Agent拒绝、原文与jobs入口，未配置空间/模型处理器明确不可用。前端 strict typecheck与生产构建，核构建依赖不包含Workspace/Swarm页面，实际生产静态文件服务及失败资源404。只在局部失败闭环后启动下一次完整独立构建，保存每次失败和实际未验项。

第三批实际结果位于新仓 `.verification/`：

- `core-compile-r1.log` 暴露抽取缺少原 go:embed 脚本和纯输出长度常量；补入原资源后 Importer/Distiller 局部 `core-compile-r2.log` 通过，全 Go 编译 `http-compile-r1.log` 通过。
- `http-actual-r1.log` 的新测试 SQL 触发器事件名与真实 `attention.domain_created` 不符；前序真实导入、原文、人工沉淀和权限已通过。仅更正触发器匹配，`http-actual-r2.log` 实际回滚与撤回保留通过。
- `http-actual-r3.log` 新增 Taste 真写入/重放/版本与固定摘要拒绝、实际候选成功；人工反馈的测试错误预期 200，真实原路由返回 201 并保存 v2。更正契约断言后 `http-actual-r4.log` 全部通过。每次失败均先向 Root 提交最小复现、实际根因和局部结果，没有在失败未闭环时再次完整构建。
- `go-tests-r1.log` 所有本仓 Go 用例通过；命令包括安装后 node_modules 中 flatted 自带无测试 Go 包，后续公开 `test:server` 明确只选本仓四个源码目录。`go mod tidy` 去除非资料依赖，无本地 replace。
- `web-typecheck-r1.log`、`web-lint-r1.log` 退出 0；`web-tests-r1.log` 保留的九组纯规则 67 例通过，不计真实模型或浏览器点击证据。
- `build-r1.log` 首次独立完整构建退出 0，包含实际 Go server 与 Vite 资料入口，构建插件拒绝 Workspace/Swarm/Cognition 和未配置空间/准入/委派页面进入产物。
- `install-r1.log` 实际构建进程从新数据根运行，独立 cookie、HTTP 实际队列读取本仓公开 LICENSE、稳定请求同 job 重放、固定原文完全相同、生产静态资产与不存在资源 404、空间/处理器/OpenViking 未配置状态均通过。由脚本停止自己启动的进程。

独立 AM 的资料、人工沉淀、机会、Taste、领域、排序与作业 UI 已保全；项目依赖的入口明确隔离，无默认 SWA 轮询。自动模型、OpenViking、summarize/PDF/媒体提取、外部平台实际可用性未作为本次完成验收；现命令未组装对应可选服务，README 逐项准确说明。原有桥接和相关源文保留。Astrocyte 的 workbench HTTP/GUI 后继新增域现由 Root 接管，我不再修改该仓。

第三批提交：新仓 `main` HEAD `dcec2cf217b1382358030d3d4b18596b53fb1f23`，工作树干净，无远端发布。初始 `e350fb7da6627af5e9de30f739169b608b5eac1f` 完成源码抽取；后继仅删除未引用的其他产品 CSS/示例组件，`web-typecheck-r2.log` 通过，复用已验证的同一生产构建。提交前 `git diff --cached --check` 发现 SourceReview 末尾多余空行，仅格式修正后通过；未以格式变化重复完整构建。`windows-build-r1.log` 为 Windows amd64 交叉编译退出 0；`dependencies-r1.log` 证明生产入口十个本地包全部来自新仓，未依赖原 SWA 文件。准确 HEAD 和实际结果已交 Reviewer 独立审查，接受结论待其记录。

## 第四批：恢复独立可配置处理器

Root 明确要求继续恢复旧产品可直接工作的 URL/PDF/媒体与来源处理器配置入口，不能将拆分造成的缺失接线作为完成。准确写域仍只在 AM 新仓：`cmd/server/main.go`、新增 `cmd/server/config.go`/实际配置检查；`internal/adapters/distillers/codex.go` 的显式凭据隔离配置及真实拒绝路径检查；必要 `internal/adapters/importers` 的公开配置探测端口；root `package.json`/`package-lock.json`、README/SOURCE；`scripts/verify-install.mjs` 的可选真实 extractor 检查。原 SWA 只读，06 正在审查的 dcec 产品保持准确引用，后继单独提交。

复用原 `cmd/server/config.go:resolveSourceReader/resolveDistiller` 与已抽取的实际适配器。独立命令显式提供 summarize Node/CLI、uvx、yt-dlp、ffmpeg、Whisper binary/model、匿名代理和 timeout 参数；指定任一相关依赖时完整校验，缺配立即拒绝，不查找 SWA checkout。依赖使用本仓安装的固定 `@steipete/summarize@0.25.1`，无参默认不自动下载外部内容。组装 `reader.Arxiv.TextExtractor` 与 `reader.Summarize`，保持原 Reader 来源/固定版本/出站检查。现有 `--listing-python` 继续显式配置。

独立 Codex 入口继续原固定 0.162.0 文本处理策略、原生工具关闭、明确 model 与逐个 canonical source key allowlist；不复用 SWA 项目许可。增加显式 `--codex-api-key-env` 仅允许用户指定环境变量名，凭据值不进入日志或参数。子进程使用产品 processor-work 下独立 profile/CODEX_HOME，版本探测不携带密钥，实际执行才从明确指定变量读取 API key；不继承 HOME/CODEX_HOME/APPDATA/OAuth 目录。未提供完整配置则不组装，错误配置 fail-fast。旧原生 `.exe`/Windows版本约束仍保留，不借此宣称 Linux Codex 可用或实际模型成功。本轮不运行模型、不读取现有 OAuth 或用户资料库。

OpenViking 可复用现有 `OpenVikingGateway`（Status/Upload/Submit/Task/Find/Read）和原提交命令的空间版本、固定资料、目的地、账号、request_id 等身份字段；现 `scope` 使用 GetProjectSpace，`Submit`/`currentReference` 还使用本地 `AttentionTx.LoadProjectSpace` 逐次核查当前引用，027 外键要求同库空间。仅注入外部 GetProjectSpace 不足以保持原提交权限语义。需由 SWA 权威服务提供当前空间/版本/固定引用读取许可，并在外发前再次核查；AM 不能自行复制项目授权或宣称跨服务原子性。本批只记录该必要集成缺口，不静默移除外键。

后继定向计划：真实独立依赖安装、实际 summarize --version 与公开本仓 HTML/实际公开来源提取（仅使用公开内容，不调用模型）；通过已构建服务提交实际任务观察真实提取结果或具体上游失败原因，确认处理器已接线。配置缺少 Node/CLI、相对路径、版本不匹配、缺少独立 Codex API-key变量名、未配可选能力分别明确拒绝。继续复用之前实际SQLite/HTTP业务结果，仅改动入口和真实适配器配置做定向 Go 检查、必要server重建与生产入口检查；无前端变更不重复Vite构建。Windows x64只交编，不称原生。增加原attention e2e/client集成用例的源文保全目录，原字节/目录关系保留且标明旧混合环境尚未迁配，不计独立验收通过。

Root 接管独立 Reviewer 后，已对准确第三批 `b0782ab524f861d956cf3c1af7b61d7ee30ffeee`（产品 `dcec2cf`）核读源与原件，接受资料SQLite/原回执事务、禁止跨产品表、独立HTTP会话与未配置集成、生产UI边界、真实LICENSE导入/重放/原文字节/人工沉淀/Taste/撤回保全范围。原 Go/67 纯规则/79 模块/实际安装与Windows交编日志含义接受；新 HTTP 静态目录通过 `http.Dir` 可跟随外部 symlink，要求同负责人返修为 Go `os.OpenRoot` + FileServerFS，并补实际文件拒绝用例。第四批计划由 Root 独立接受，要求配置检查在数据库迁移和 worker 启动之前失败，密钥错误不包含值；不扩称模型、OpenViking、媒体或Windows原生完成。

第四批已按该边界实施：显式 summarize/媒体参数，独立 npm 0.25.1 安装，原 Reader 两个提取路径接入；Codex 固定原生策略和显式环境变量，版本探测与执行分别创建独立 profile，不继承现有 OAuth。版本探测环境不携带 key；未设或格式错误的变量明确拒绝。数据目录迁移前检查 listing、web-root、来源提取器与模型配置。静态文件读取通过每次打开的 Root.FS 限制于实际根内；不存在资产 404，指向根外真实 LICENSE 的 symlink 403。源码基于 Windows 需要 symlink 创建权限的事实，仅该文件创建子例在无法创建时单独跳过，其他资料权限路径仍执行。

- `.verification/extractor-install-r1.log`：本仓实际固定 npm 依赖安装退出0，未复制原 checkout node_modules。
- `config-http-r1.log`：相对路径/组合缺配/未设独立 key变量均立即拒绝且未创建 SQLite；真实空 profile 无现有凭据；全部资料HTTP及实际静态文件拒绝通过。`extractor-config-r1.log/r2.log` 实际0.25.1探测、原Reader双注入、已安装真实 Vite CLI 错误版本拒绝通过。
- `extractor-install-live-r1.log`：公开 ACL Anthology URL 真实生产作业 `VUMR3R5BIAM7D4FXPOWFEFJVDU` 失败，错误为 `provider_unavailable` / `paper page host could not be resolved: aclanthology.org`。此前配置检查和组件构建通过。最小复现 `npm run verify:install -- --extractor`；随后 `getent ahosts aclanthology.org` 与 `arxiv.org` 均没有地址。保留失败，不降低 DNS/SSRF 检查，不将其他来源当作该网络验收通过。
- `config-http-r2.log`：使用真实本仓安装和基线原 HTML，通过真实 summarize/Readability 解析标题、原 description 和 `abstract_only` 状态，未宣称读到论文全文；固定来源 `source-tests/web/index.html` 与 `git show 11619d72:web/index.html` cmp0。配置、隔离与HTTP定向均0。一次编辑工具因同文件重复 Update 块在校验阶段拒绝整patch，合并块后成功，无源码半写或构建重试。
- `static-http-r3.log`：最终平台化 symlink 子例与全部实际资料HTTP路径通过；`server-build-r3.log` Go server组件重建0，`install-r2.log` 最终构建独立实际启动/同job重放/原件/静态资产0，`windows-build-r2.log` Windows amd64交编0。没有重复Vite构建。

第三批之后的来源保全提交 `b0782ab` 保存原displayContract混合测试与paper DOM原第三方完整许可；两个原许可证尾部空行保持原字节（cmp0），仅自写变更执行whitespace检查。`54727f7bf366244c7c097211fb891ce7982cf91e` 继续保全原 `web/e2e/plugin-snapshot.spec.ts`（cmp0）。这些原混合集成测试未迁成独立执行环境，不计通过；其余原e2e/client仍留SWA。第四批真实外网论文/PDF/媒体、模型与Windows原生结果继续未验或按上述实际失败记录。

第四批准确提交为 `/workspace/attention-mirror` 的 `main` / `5a19745db61015d0fb61cd809bf456a49b693f2c`，工作树干净，无远端发布。Root 已独立逐读该准确源码及 `config-http-r2`、`static-http-r3`、`install-r2` 等实际结果，接受可配置入口与已验范围，关闭静态目录 symlink 返修。真实 ACL 网络 DNS 失败保留；Windows 原生、API-key 登录/模型、PDF/媒体及 OpenViking 未验。

## 第五批：资料适配器原测试归属与独立执行

根因是原 SWA 的 `importers/objects/distillers` 规则和实际文件测试仍在旧混合目录。清理主目录前，本批保全当前准确旧源原件，再恢复独立资料验证；不改生产功能、不访问用户资料库、不调用模型、不重跑完整构建。参考 `swa-server-separation-20261023.md` 的剩余源码调查。

准确写域为新仓 `internal/adapters/importers/*_test.go`、`paper-dom.test.mjs`、`testdata/summarize-arxiv-manual.json`，`internal/adapters/objects/store_test.go`，`internal/adapters/distillers/{codex,codex_event_rules}_test.go`，`source-tests/legacy-adapters/**`、`source-tests/README.md`、README/SOURCE、package.json 与本任务。先把三个原适配器的全部测试原字节保存为 `source-tests/legacy-adapters/<原路径>.txt`（保留原扩展名再加 `.txt`，避免被 Go 自动发现），记录原提交/文件摘要；五份已有 go:embed 原资源逐字核对，不重新复制业务实现。

独立测试按现有实际依赖迁配：objects 的并发发布/重开/损坏/取消原测试、Codex 的纯 JSONL/输出引用拒绝及真实子进程退出/取消分类测试恢复。Codex live 模型/旧 selected_text factory 与 capacity_sources 原件仅保存来源，防止导入 SWA 权限或默认调用模型。Importer 恢复纯身份/格式/IP/URL/JSON/DOM 规则，已保存真实 summarize export 的文件读取/摘要/目录拒绝，以及本仓真实安装的 summarize 配置隔离。旧 Douyin bridge fixture 与 discovery 假 Transport 只保存来源；活跃测试仅复用其纯 parser/拒绝规则，不恢复伪浏览器或伪 HTTP。

原 importer 混合文件里的公开网络、真实论文/PDF/媒体原件、平台列表检查保留断言和明确 opt-in。网络须 `ATTENTION_MIRROR_TEST_PUBLIC_NETWORK=1`；既有实际原件目录仍须对应显式绝对路径，未提供时标明 SKIP/未验，路径非法或原件改变仍失败。原 `video_production_test.go`、`video_cancellation_windows_test.go` 依赖旧混合 HTTP/SQLite，完整原件只保存来源；不得机械换 import 声称新独立服务已验。PDF live 不再猜测临时目录，须明确 PDF/uvx 路径。后继执行严格选择本批本地适配器检查、实际 Node DOM 规则与嵌入资源/原件比对，保存通过与跳过范围；不因原件未配置重复网络或整包发行构建。

Root 已接受第五批计划，明确通用测试子进程不能充当 Codex 原生证据，旧假 Transport/bridge 不进入活跃测试。实际保全提交 `5e6e69f403299c0d1b2ca367482689565d5ba40e` 包含原 `644bbe8701ae1b1c30b54f18621c28e03dbf6082` 的25份测试原文，逐字 cmp0，已通知 cap 清理负责人。五份原 go:embed 脚本逐字 cmp0；真实保存的 `summarize-arxiv-manual.json` 也与原件逐字相同。原来源头与目录关系记入新仓 SOURCE/README。

活跃测试提交为 `/workspace/attention-mirror` `main` / `58bb6e4454e03db135cabe6de2dec8dfc481aee6`，工作树干净，无远端发布。原件与活跃测试分开保存：纯规则从网络/媒体组合用例中分出，真实文件摘要和目录拒绝独立执行；媒体时间轴仍保持原数据断言并明确未验。未迁入旧 factory、video 混合 HTTP 或 Codex 模型测试。生产代码未改。

- `.verification/adapter-tests-r1.log`：`GOWORK=off go test -mod=readonly -count=1 -v ./internal/adapters/importers ./internal/adapters/objects ./internal/adapters/distillers` 退出0；原纯规则、真实公开导出文件/摘要/允许目录、对象并发发布/重开/损坏/取消、真实已安装 summarize 版本/隔离/匿名代理配置、通用测试进程退出分类通过。网络及原论文/PDF/媒体数据未提供，逐项 SKIP，不计通过。
- `.verification/adapter-entry-r2.log`：收紧原多站点观测目录为显式绝对路径后，通过正式 `GOWORK=off npm run test:importers` 入口验证本批三个 Go 包及原 Node DOM 九项规则，退出0。仅执行本批定向检查，没有完整构建、实际模型或公网访问。
- 迁配过程一次 apply_patch 因旧 Codex live 行的文本上下文不匹配整体拒绝；最小复现为该删除 patch，实际 rg 确认两文件原文均未改变。分开精确编辑为独立本地测试后，上述首个局部测试即通过。没有在失败未闭环时重启构建。

准确来源与实际日志已交 Root 独立 CR；原公开网络 DNS 失败与 Windows 原生/模型/PDF媒体/OpenViking 未验范围保持。未把恢复旧规则测试等同于相关外部能力通过。
