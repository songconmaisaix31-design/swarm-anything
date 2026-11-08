# SWA 独立服务与存储闭包

日期：2026-10-23（UTC）。负责人：`/root/capabilities`。工作区 `/workspace/swarm-anything`，分支 `integration/swa-task-cards`。Root 已分配本负责人处理 SWA 服务入口及混合 HTTP/SQLite 包依赖；separation 独占两个新产品仓库，run_cli 独占 SWA 前端入口。计划与第9项直接 ProjectFiles 依赖已由 Root 和06接受；独立源码已实现，以下记录当前局部结果，最终候选/实测由 Root 汇总。

## 问题与目标

当前 `cmd/server/orca_runtime.go` 虽已不实例化 Attention 服务，仍导入混合 `httpapi`、`sqlite` 包，构建必须读取资料、认知及旧组合源码。Linux/Windows 的 SWA 构建脚本仍编译 `./cmd/server`。旧 `migrations.FS` 会在新 SWA 数据库建立全部产品表；`foundation.NewAttentionService` 还报告资料导入已启用，与实际 SWA 组装不符。

目标为独立 `cmd/swa-server` 的生产依赖只包含 Workspace、实际 Orca adapter、SWA HTTP/存储、必要通用基础设施。现有 CLI/GUI 命令、项目权限、原 Task/Run/Worker、安装进程所有权、原数据库 ID 和回执保持同一权威。此批不移动真实用户数据库，不把旧表名改名，不重复写入授权或任务状态。

Astrocyte 新仓已由 separation 报告独立构建与本地提交；Attention Mirror 尚在抽取。旧资料/认知源码在对应新仓保全验证及 Root 确认迁出范围之前保留，其不进入新 SWA 服务主动构建闭包。本文不授权删除另一负责人的未交接源码。

## 实现与接口

1. 原 SQLite 连接、备份和迁移实现移入无业务 import 的 `internal/adapters/sqlitebase`。API 保留 `Open/Close/Conn/RunMigrations/SchemaVersion/CreateBackup`。旧混合 `sqlite.DB` 组合该基础连接并保留原私有 `conn` 供尚未迁出的仓储；新 `swastore` 组合相同基础设施。不得在一次服务组装中为同一仓储另开第二数据库或双写。
2. `swastore.Repository` 接管原 `local_agents.go` 的项目/Grant/session 存储与 `orca_execution.go` 的原 Run 关联，以及 `workspace_spaces.go` 的唯一空间/receipt/outbox实现。公开消费方仍为既有 `LocalProjectRepository`、`OrcaExecutionLinks`、`ProjectSpaceRepository`。独立 Store 使用同一连接的 `BEGIN IMMEDIATE` 事务；旧 `sqlite` 通过显式事务回调把原 `WorkspaceTransaction` 的 context、connection 和数据库身份交给该实现。旧 Attention 空间桥接仍在原同库事务直接使用同一空间 transaction adapter；不替换为跨库调用。
3. 移出后旧混合包只保留必要兼容接线：已有 `NewProjectSpaceRepository` 等构造参数不变，原项目和 Run 关联方法由组合的单一 Repository 提供；`localProjectConnection` 与旧 native session 纯存储投影按显式 adapter API 复用。现有 Attention/Workspace 原子性与跨库拒绝用例必须继续通过。兼容函数不创建新授权记录、输入账本或任务调度器。
4. 新 `swahttp` 只装配健康/foundation、同源 auth session/CSRF、project-spaces、local-projects 与 `orca/commands`、private owner admission。沿现有严格 JSON、大小限制、Idempotency-Key 与 request_id 一致、loopback Host/Origin、scoped Agent token 和当前项目授权逻辑。其请求 meta 使用 Workspace 合同，不能导入 Attention 仅为 CommandMeta/Principal。业务验证继续调用原 Workspace/Orca app。
5. `GET /local-agents` 保留明确的未组装反馈；当前项目 Agent 能力来自原 `capabilities`。旧资料、认知、Works、Relay 和旧 local-projects native-session 变更入口不在新服务挂载。Root 已确认独立 SWA 仅通过实际 Orca Worker 执行；旧组装保全原接口。必要项目元数据、目录、设置与 Grant 仍可操作，新的 Run/Worker 功能及独立人工追加授权保持。
6. 新服务入口保留 `SWA_INSTALL_ROOT/SWA_DATA_DIR`、原 owner capability、lifecycle stdin、loopback listener 公布、关闭超时与真实 installed Web 目录核验。有 installed root 时严格沿原 owner 管道模式；无 installed root 的开发模式只提供真实 SQLite 元数据与当前人工会话，Orca 返回 503，不启动 host 或模型。新 `SWA_PORT/SWA_WEB_DIR/SWA_ALLOWED_ORIGIN` 控制独立入口，现 owner 使用的 `ASTROCYTE_PORT/ASTROCYTE_WEB_DIR` 作为明确兼容参数保留，新旧值冲突拒绝。Root 已确认 `health.service` 保持历史机器标识 `astrocyte`，供现 installed helper/lifecycle 的精确字段消费者兼容；产品名为 SWA，Foundation 不再报告已组装资料导入。服务仍由原 SWA lifecycle 启停，不额外建设守护进程。
7. 新 `migrations/swa` 以原字节保留 `001_initial`、`002_idempotency_fix`、`007_local_agent_projects`、`028_orca_execution_links`；新增 `029_swa_workspace` 仅补当前 SWA 拥有的原空间、receipt、outbox 表及必要 schema context。实施前逐一核实际消费者的 SQL 及后续 ALTER，不能只按编号截取遗漏列/约束。保留旧 `attention_project_spaces/attention_receipts/attention_outbox` 名称与已有完整数据，不执行 DROP、重命名或清空。旧 `_migrations` 已应用记录不改写，新库不建立资料/认知实体表。新旧数据库分别以真实目录检查，其他仓库的 029 编号不共享此数据库，不形成一次迁移的不同内容。
8. Linux/Windows 构建脚本中的 Go server target 切换 `./cmd/swa-server`；Web 构建入口片段由 run_cli 负责，修改同文件前按具体片段协调。扩展原 architecture 检查实际 `go list -deps` 的禁止依赖，不通过 build tags 或本地 replace 隐藏错误。
9. 依赖复核发现 `adapters/agents` 同包的 completion_experience 文件导入 Attention，`ProjectFiles` 只是 `native.go` 中对 `projects.go` 的包装。Root 已批准将 `CanonicalRoot/ValidateProjectPath/ReadProjectFiles/DiscoverProjects` 完整实现及 Windows 路径检查依赖移至独立 `projectfiles`，旧 agents 通过显式函数委派，保单一文件权限实现。`LocalProjectService` 的可选 Registry 未配置时，实际需要历史/旧 native adapter 的操作准确返回 unsupported，不能 panic；外部 CLI 设置仍必须由已绑定的真实 Orca 注册验证，无 runtime 开发模式不能伪造可用 Agent。

## 准确拟写域

- 新 `cmd/swa-server/main.go`、`runtime.go`、`http_listener.go` 及定向真实测试。来源为原 `cmd/server` 的 SWA 专用组装和 listener；不改 Root 正在维护的业务 app。
- 新 `internal/adapters/sqlitebase/adapter.go` 及原基础设施适用测试；旧 `internal/adapters/sqlite/adapter.go` 调整组合。
- 新 `internal/adapters/swastore/{store,local_projects,orca_execution,spaces,transaction}.go` 及定向真实 SQLite 测试。
- 旧 `internal/adapters/sqlite/{local_agents,orca_execution,workspace_spaces,spaces}.go` 仅原实现迁出及显式兼容接线；若原 `workspace_proposals.go` 无法沿公开 WorkspaceTransaction 注入则先交 Root 确认，不能擅改事务语义。
- 新 `internal/adapters/swahttp/{server,session,middleware,commands,local_projects,spaces,response}.go` 及真实 httptest/server 测试。旧混合 HTTP 源只读，迁出清理由 Root 后续统一安排。
- 新 `migrations/swa/{embed.go,001_initial.sql,002_idempotency_fix.sql,007_local_agent_projects.sql,028_orca_execution_links.sql,029_swa_workspace.sql}`。
- `internal/foundation/service.go` 的独立 SWA 构造及对应测试，或在独立入口提供相同公开 Service；最终取没有无关功能改动的方案。
- 新 `internal/adapters/projectfiles/{projects,path_spelling_other,path_spelling_windows}.go` 及实际文件测试；旧 `internal/adapters/agents/{projects,native,path_spelling_other,path_spelling_windows}.go` 仅按实际路径实现归属迁出/兼容委派；`internal/workspace/app/projects.go` 内统一 nil Registry 拒绝及直接真实消费者检查。新服务不导入整个 agents 包。
- `scripts/build-swa-linux.mjs`、`scripts/build-swa-package.mjs` 仅 Go server target 段；`scripts/check-architecture.mjs` 新服务生产依赖规则；本任务文件。根 package/App/Web 构建由 run_cli 排他负责。

## 测试计划

| 检查 | 需要证明的结果与失败条件 |
|---|---|
| 独立 Go 依赖 | 新服务 `go list -deps` 不含混合 sqlite/httpapi、Attention、资料 adapters；只用仓库锁定模块编译，不引用新产品 checkout 或已编译物。 |
| 新库与旧库兼容 | 独立临时目录内创建新 SWA SQLite，核空间/Grant/Run关联原件；另以旧全迁移建真实库，写入原 ID、refs、receipt和授权，应用新迁移后逐项保持；重跑幂等、外键正确，资料/认知表不会出现在新库。旧库表不删除。 |
| 唯一事务与权限 | 原 `local_project_transaction_test`、`attention_workspace_transaction_test` 与空间真实测试通过。新实现的同连接 nested transaction、CAS、不同数据库 context 拒绝、实际 SQL 约束失败回滚；保存回执与空间变化原子提交。 |
| HTTP 实际链 | 真实 Workspace 服务+SQLite+httptest/listener，核同源session、CSRF、Host/Origin、错误JSON、项目注册/设置/Grant/撤销/token、空间创建/读取；unauthorized Agent/跨项目、未批准动作拒绝，未知 request 不重发。无需假原生 CLI 或模型。 |
| 执行服务未配置 | 原真实 HTTP 返回明确不可用，不声称能力可用；角色/Run等写无配置不能绕过既有 app/owner 准入。原固定模型与 tools-off 范围不扩大。 |
| 文件权限与 Registry 缺失 | 真实目录、普通文件、被禁止的秘密路径名、符号链接/路径逃逸和 Windows 现有约束沿单一 ProjectFiles 实现；没有 Registry 时历史设置/旧 native 调用明确 unavailable，真实 Orca external registry 注入的原规则不变。未读取用户私有文件。 |
| 生命周期与资产 | 新server接到真实拥有者stdin/退出后结束；静态实际HTML/assets/API分派、缺资产404、旧未挂载路由拒绝；与 run_cli 的新Web入口合测，禁止截图/视觉验收。 |
| 候选与平台 | 上述局部通过后才由 Root 安排新 Linux 安装候选、N4/N6及同Run；Windows x64交叉编译只计编译，原生运行缺失继续未验。 |

失败先报告最小复现、根因证据和局部修复验证，再执行下一次完整构建。只读依赖遗漏可补列实际直接文件并交 Root 排序；发现丢数据、共享事务被拆为未定义的跨服务提交、原授权状态出现第二写入权威时停止相关变更并提出具体修复。

## 实际实现与局部验证

新 `cmd/swa-server`、`swahttp`、`swastore`、`sqlitebase`、`projectfiles` 与独立迁移已实现。旧混合 SQLite 组合同一个 SWA 仓储，并将原 Workspace 的数据库身份、事务 context 和 SQL connection 注入；旧 Attention 引用操作使用同一空间 transaction。旧 agents 路径算法全部委派 ProjectFiles。Linux/Windows 正式发行构建的 server entry 已切到新命令，根开发/构建与前端由 run_cli 同步处理。

`health.service=astrocyte` 是历史机器消费者兼容字段；Foundation 的 stage 为 SWA，imports=false，execution 只随实际 Orca adapter 是否组装报告。项目 capabilities 继续细分发现、启动、控制与执行证据。无安装 runtime 时仅提供真实元数据，native 命令明确503；旧 native session 变更和资料路由不挂载。开发模式支持实际绝对 SWA_WEB_DIR，同源 SPA 与 API 路由隔离。

所有下列命令先 `source .verification/cloud-setup/activate.sh`；其 GOTMPDIR/TMPDIR 都指向仓库忽略目录。结果日志位于 `.verification/swa-server-separation-20261023/`。未运行完整发行构建或模型请求。

| 原日志 | 命令/实际结果 |
|---|---|
| `storage-r2.log` | 旧 sqlite 精确选择的基础迁移、LocalProject 同连接提交/FK回滚及跨库拒绝、Attention同连接提交/FK回滚及跨库拒绝、Workspace空间重放均PASS；总命令exit1源于下述误纳入的旧 Codex fixture，不能把整批称为通过。 |
| `files-r1.log` | `go test ./internal/adapters/agents ./internal/adapters/projectfiles -run '^TestProject(ScopeDefaultDenyAndDirectoryGranularity\|SymlinkEscapeAndOutputBound)$' -count=1 -v`，2项实际文件权限PASS，进程exit0。 |
| `compile-r1.log` | `go test -mod=readonly ./cmd/swa-server ./internal/adapters/swahttp ./internal/adapters/swastore ./internal/foundation`，exit0；该时新服务/存储尚未加后续定向用例，只计编译和原Foundation测试。 |
| `independent-storage-r1.log` | 新swastore三项真实SQLite测试PASS/exit0：新库表与外键、空间receipt、实际项目目录/设置CAS/Grant签发与撤销、nil Registry明确unsupported；nested事务同一Conn、跨库拒绝、真实FK失败整事务回滚；旧完整迁移生成的空间/receipt/outbox/项目/Grant原行逐字保留。 |
| `legacy-reference-r1.log` | 新外部兼容测试PASS/exit0：旧完整数据库中保存实际仓库README原文对象及资料版本，原ReferenceMaterial服务生成真实空间引用/receipt；关闭后由独立Store打开并迁移，原空间JSON字节、版本、资料ID、locator保持，旧服务再打开重放原回执不新增。该测试不调用导入网络或模型。 |
| `architecture-r1.log` | `node scripts/check-architecture.mjs`，exit0。原53包边界通过，新 `go list -deps ./cmd/swa-server` 只允许本服务所需Workspace/app/domain、Orca、ProjectFiles、SWAHTTP/Store、SQLiteBase、foundation/apierrors和swa迁移，不含旧混合包及资料/认知。 |
| `architecture-r2.log` | 两入口实际依赖复核发现 `cmd/swa/serve.go` 仍通过agents引用CanonicalRoot，引入旧Attention/Swarm；这是源码闭包遗漏，非测试失败。run_cli将唯一import与4个调用改为同一projectfiles实现，报告全部CLI测试通过。本负责人将架构规则扩为同时核 `./cmd/swa ./cmd/swa-server`，R2 exit0，两个主动入口均无旧产品依赖。 |
| `http-r1.log` / `http-r2.log` | 真实HTTP实际Web资产/页面、缺资产uncached404、API隔离PASS；权限例R1因下述测试授权遗漏FAIL，修正后仅重跑该失败例R2 PASS/exit0，覆盖session、CSRF、Host/Origin、空间重放、真实项目设置CAS、Token当前项目/撤销/禁止自提权、实际文件读与默认拒绝、未配置native503、旧变更路由404、private owner拒绝。 |
| `runtime-r1.log` | 实际runProduct组合+真实动态loopback listener、公告、健康、取消关闭、原监听不可连接、SQLite原生会话为零；端口新旧环境冲突拒绝，2PASS/exit0。 |
| `windows-compile-r1.log` | `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -mod=readonly -o .verification/swa-server-separation-20261023/swa-server-windows-x64.exe ./cmd/swa-server`，exit0，仅Windows x64交叉编译，无原生执行。 |

run_cli另报告 `.verification/swa-web-separation-20261023/http-tests-r1.log`：新服务真实 `swa.test`6项及共享transport旧client8项共14PASS/exit0。该证据由run_cli持有，不能当作模型或安装验收。

### 失败、证据与修正

1. 初次编辑把同一路径 Move 与 Add 放进单次apply_patch，工具拒绝，未应用修改。改为两次顺序原子编辑，不涉及构建。
2. 初次运行在activate之前调用gofmt，shell返回127 `gofmt: command not found`，未进入编译。所有后继命令先activate，gofmt已成功。
3. `storage-r1.log` 编译失败：原 `local_agents_progress_test.go:61` 实际只读来源构造 `&DB{conn:conn,dbPath:publication}`，组合后的提升私有字段不能用于结构体字面量。旧wrapper保留原conn/dbPath及直接Close/Conn；写仓储仍是同连接单一委派。R2编译通过，原数据库与事务指定断言均通过。
4. R2误纳入 `TestNativeSessionUsesActualWorkspaceTransactionWithoutModel`：按名称判断不会调用CLI，没有先追完整fixture。其 `local_project_transaction_test.go:188` 调用实际 `ProbeNativeCLI`，日志 `owned native process exited cli=codex exit_code=1`、`delivery_unknown: native process exited before reply`；失败发生在SaveSession事务断言之前。fixture自动清理目录，没有保留可进一步归因的原stderr，因此未知具体退出原因，不能声称是认证或迁移问题。Root收到原失败并明确不重试该原请求；后继新测试仅创建真实SQLite/HTTP/文件，不运行任何原生CLI。旧存储复验精确选择现已通过的事务/空间/迁移用例并排除此fixture；正式模型验证只由已授权StepFun N driver负责。
5. `http-r1.log` 最小复现为保存allowed_subdirs后请求context读取实际public.txt。响应403 `scope_denied: directory scope B is disabled`；原ProjectFiles还要求allow_directory=true，测试遗漏显式总开关。修正保留默认403断言，按当前revision提交allow_directory=true，再实际读取；`http-r2.log`该例PASS/exit0。产品权限未放宽，已过静态资产测试未重复。

剩余验收：新发行候选、安装owner stdin生命周期与实际原生任务/Run交付由Root和release_audit接手；当前局部runProduct只验证开发模式取消关闭，不冒充installed owner链。没有Windows原生机器，Windows实测仍未运行。旧仓清理搬迁须等两个独立产品保全/审查，当前旧源码保持可追溯。

源码冻结清单 `.verification/swa-server-separation-20261023/source-manifest-r1.sha256` 含39个现存源/测试/脚本，随后仅架构规则以 `source-manifest-r2-delta.sha256` 更新（SHA `ecbfe56f5688b9704966ad83cc0f20e6dffff575da5370c2fd5bc4f463c7f28e`）。另删除旧agents两个平台路径实现和旧sqlite/orca_execution.go，其完整算法迁入对应新包。旧 `cmd/server`/`httpapi` 的首批空间改动属于separation与Root，不由本清单覆盖；两个build-swa脚本本负责人仅切server target。`cmd/swa/serve.go`小修改与新前端由run_cli给最终哈希及测试。

## 剩余旧 Go 源码清理调查（2026-10-23，只读）

Root 授权本节调查实际路径、直接消费者及保全边界；本节没有实施删除，也没有执行测试、CLI、模型或完整构建。两个 SWA 生产入口已经独立，仓库清理仍未完成：`scripts/check.mjs` 的 `go vet ./...`、`go test ./...` 和 S1，CI 的 `go test -race ./...` 与 Linux 全部旧 E2E 继续选择混合产品。Root 已把默认检查与 CI 的 SWA 化交给 run_cli，迁出源码与修改检查必须配套，不能继续把旧 live fixture 当作 SWA 常规检查。

### 原始清单与边界

- `.verification/swa-server-separation-20261023/remaining-go-consumers.txt`：实际 `go list -e -mod=readonly -f '{{.ImportPath}}|{{join .Imports ","}}|{{join .TestImports ","}}|{{join .XTestImports ","}}' ./...` 结果；四列分别保留生产与两类测试的直接 import。未执行包内测试。
- `remaining-file-map.json`：逐个路径列出当前源码、同路径新仓候选、候选仓准确 HEAD、提交 blob、与旧源逐字比较、候选当前文件是否仍等于已提交内容、生产和测试消费者。文件覆盖 `cmd/internal/migrations/scripts/tests` 内 Go、SQL、MJS、PowerShell、Python 与 Shell；明确排除 `.verification`、`.git`、`node_modules`。其分类为调查建议，不能直接用作删除脚本。`counterparts` 为空也可能存在经审查的改名/拆分实现，须查各新仓 SOURCE；有同路径文件而 `committed_exact_bytes=false` 不能称原件保全。
- `remaining-group-map.jsonl`：上述逐文件清单的目录汇总，含逐个 `exactCommitted`、`counterpartChanged`、`missingTests` 和实际消费者；`remaining-active-test-imports.txt` 列出当前 SWA 包仍导入旧产品的测试位置；`remaining-direct-consumers.txt` 保存脚本/CI 的引用位置。
- 清单读取时 Astrocyte HEAD 为 `f402020b839b0e540021d4270e2bdc28cd5d2a01`；Attention Mirror HEAD 为 `54727f7bf366244c7c097211fb891ce7982cf91e`，其第四批配置/资产修复尚有未提交内容。保全判断按清单内每项的准确提交与 blob，不按目录名称或后续可变 HEAD 推断。两个仓 SOURCE.md 给出改名/抽取语义，独立构建结果由各负责人记录。
- 初次调查清单只覆盖部分脚本扩展名，且递归读到了旧测试目录内 `.verification` 的生成源码。已修正为上述排除目录和扩展名后再生成，只影响调查清单；原研究、数据和证据从未列入实际删除操作。

### 清理分组与直接消费者

| 分组 | 准确路径和保全情况 | 清理条件及消费者 |
| --- | --- | --- |
| 当前 SWA 必须保留 | `cmd/swa/`、`cmd/swa-server/`、`internal/adapters/{orca,projectfiles,sqlitebase,swahttp,swastore}/`、`internal/{apierrors,foundation,workspace}/`、`migrations/swa/`、`runtime/swa-orca/`、`tests/swa-cli-headless/`、`tests/swa-product-acceptance/`。Workspace 内原项目、权限、外部 CLI 注册、Run/Worker/role/conversation/handoff 合同保持单一权威。 | 两入口的实际依赖已经核过；不能因暂未挂载旧用例而批量删除整个 Workspace。旧 Relay/Works/提案的共享 DTO 与新服务位于同一 Go package，进一步拆除需按符号依赖单独处理。 |
| 纯认知生产源码 | `cmd/{mcp,sleep,attentionruntime}/`、`cmd/internal/attentionruntime/`、`internal/adapters/mcp/`；`internal/attention/app/{engine_*,event_service,experience_*,knowledge_*,mcp_*,sleep_*}.go` 及对应纯 domain；SQLite 的 `engine_common.go`、`engine_store.go`、`event_store.go`、`experience_store.go`、`knowledge_store.go`、`sleep_store.go`、`sleep_store_repository.go`、`vec.go`。已在 Astrocyte 中逐文件对应；命令 main 适配独立配置，不能称改动文件原字节相同。 | `cmd/mcp/main_test.go`、`cmd/sleep/main_test.go`、MCP adapter 测试及纯 domain 测试原件已在新仓提交。旧 `internal/attention/app/*_test.go` 多数为混合真实 fixture，尚未迁配，须保全原件并按新产品独立夹具迁入。旧 `cmd/server`、events、agents、sqlite/httpapi、validation 和 attention-engine 测试仍直接消费这些包，须同时迁配/归档其闭包。 |
| 认知工作台 | `internal/workbench/app/contracts.go`、SQLite `workbench.go`、`workbench_path_{other,windows}.go`、HTTP `workbench.go`，`cmd/workbench-snapshot/{main,files_unix,files_windows}.go` 已在 Astrocyte 原字节提交。 | `cmd/workbench-snapshot/main_test.go`、`verify/`、旧 `sqlite/workbench_test.go` 与 `httpapi/workbench_test.go` 尚未同路径保全。`verify/` 同时消费 events、认知、旧 SQLite，属于待保全的验证闭包。旧 server 工作台配置含 Relay 集成，不能用新认知 server 同名文件代替保全。 |
| 纯资料生产源码 | `internal/adapters/{importers,objects,openviking}/` 原生产 Go 与内嵌脚本在 Attention Mirror；`internal/adapters/distillers/codex.go` 已保全，后继配置修改由 separation 审查。`internal/attention/app` 中资料/导入/沉淀/来源/排行/Taste/项目引用文件及相应 domain 已进入 Attention Mirror；完整逐文件归属见 map。 | `importers/*_test.go`、`objects/store_test.go`、旧 distillers 测试未在新仓保全。直接生产入口只有旧 `cmd/server`，混合 HTTP/SQLite/app 以及 S1/S2/S5 测试仍导入。`distillers/selected_text.go` 是 SWA 原 native factory 的集成，不能随 codex.go 归为纯资料删除；先保全旧 factory 与原测试闭包。 |
| 混合 Attention app/domain | `internal/attention/` 生产文件绝大多数已逐字进入各自产品，部分 `doc.go` 或共同错误/命令元数据已在新仓提取。 | 必须按 map 逐文件/两个 SOURCE 识别去向，不能整目录以一个新仓覆盖。全部旧 app 真实测试尚需保全；`project_distiller/project_references/admissions` 是旧跨产品组合来源，新产品里未配置时明确不可用，不能当成已经实现跨进程原子性。 |
| 混合旧 HTTP/SQLite/组装 | `cmd/server/`、`internal/adapters/httpapi/`、`internal/adapters/sqlite/`。它们还含旧 native session、Relay、Swarm、Works、Judgment、proposal、repository context、accepted experience 等。仅资料/认知部分在新仓，SWA 项目/空间/Run 存储已迁到 swastore。 | 整体尚未由两个新产品保全。需先保存 Root 将提交的完整准确源码与原测试为明确 legacy 来源，再把旧独立产品片段迁给对应产品；剩余 SWA 功能保留来源，不把删除旧组合宣称功能迁移完成。当前 SWA 测试的直接 imports 必须先改，见下一节。 |
| 未迁出的旧集成 | `internal/adapters/events/`、`agents/`、`{admissionbridge,projectspacebridge,judgment,relayworktree,repositorycontext,worksscan}/`、`internal/swarm/`、`internal/judgment/`。events 的完整 native/Relay/语义解析未进入新 Astrocyte，只有 `cmd/internal/attentionruntime/events.go` 已迁；agents 路径算法已经统一委派 projectfiles，其旧原生执行/完成经验仍在旧包。 | 这些内容属于旧 SWA 或跨产品集成，不能声称纯资料/认知。Root 应为其保存准确 legacy 源码和测试闭包，并决定保留的公开集成端口；新 SWA 生产入口无需旧具体 adapters。不能保留整个混合服务作为所谓“必要集成”。 |
| 研究与历史验证 | `cmd/validation/`、`tests/validation/`、`tests/attention-engine/`、`scripts/{validation,experiment,evidence}/`、原研究文档/数据/证据及 `.verification`。 | 全部保留；其对旧认知/events/SQLite 的依赖需在明确研究或 legacy 来源中保持可重现。保留原结果不代表在本轮重跑了实验。S1–S5 混合用例及 fixtures 同样先保全，脱离当前 SWA 默认检查后不将其记作通过。 |

当前必要的产品间集成形态是 Workspace 自己的空间/项目/权限端口、固定来源引用 DTO、原资料 ID/locator/refs/receipt 保留，以及认知产品明确的外部完成证据消费方端口。`admissionbridge`、`projectspacebridge` 和旧同连接 Attention SQL 是旧单库组合的具体实现；本轮仅在原兼容验证中使用。新独立产品没有配置跨产品服务时返回明确 unavailable/unsupported，不复制任务或权限数据库，不宣称跨库事务成立。

### 当前 SWA 测试必须先解除的旧包依赖

| 直接消费者 | 应保留的真实断言和处理 |
| --- | --- |
| `internal/adapters/orca/installed_web_test.go` | 实际 installed Web 根、缺文件、link/目录逃逸、HTTP 路由保持；HTTP 组装由旧 httpapi 改为 swahttp，不减弱同源/404断言。 |
| `internal/workspace/app/orca_delivery_admission_test.go` | 独立人类 send、原创建者、当前 Grant/撤销、项目范围、Pi legacy input 拒绝保持；原 SQLite 与空间夹具改 swastore + Workspace ProjectSpaces，ProjectFiles 改唯一 projectfiles。此 fixture 被其他 capability/handoff 测试复用，修改后须同批验证。 |
| `internal/workspace/app/orca_run_input_test.go` | 同大小/同时间输入文件变更拒绝；只将 agents.ProjectFiles 依赖改 projectfiles，保真实文件。 |
| `internal/workspace/app/project_spaces_test.go` | 编译端口断言改 swastore，继续保唯一空间存储责任。 |
| `internal/adapters/swastore/store_test.go` | 旧全迁移生成的真实行保留验证仍必要；原 `migrations.FS` 迁为准确 legacy SQL 测试原件，不能手写一个更弱的旧库 schema。 |
| `internal/adapters/swastore/legacy_refs_test.go` | 原资料 Service 生成真实 refs/receipt 后新 Store 重开不变的兼容证明仍必要。旧 Attention/objects/sqlite 整闭包需先保全，再将此跨产品兼容测试放到明确 legacy/integration 测试模块；不能用伪造资料行代替原服务证据。 |
| `internal/adapters/httpapi/orca_cli_test.go` 与 `tests/swa-cli-headless/compile-go-tests.ps1` | 已装产品 `TestOrcaCLIRealHTTPAuthorityBoundary` 是当前实际授权门。迁入 swahttp，保持真实安装/同候选/身份边界，然后更新编译包与二进制名消费者；不要让默认检查主动启动此装内专用验证。 |

其余仍引入旧包的当前 Workspace 测试为 `native_operations_sqlite_test.go`、`registered_projects_test.go`、`progress{,_preflight}_actual_test.go`、`progress_sqlite_failure_test.go`、`relay{,_facts,_intent,_owned_live,_owned,_process,_registration,_transition_permissions}_test.go`、`works_test.go`；准确路径见 `remaining-active-test-imports.txt`。这些历史功能尚未迁入新的 Orca 流程，不可通过机械换 import 声称新流程已验。

### 默认检查与脚本归属

run_cli 已收到明确建议：当前默认 Go 包为 `cmd/swa`、`cmd/swa-server`、`apierrors`、`foundation`、`projectfiles`、`sqlitebase`、`swahttp`、`swastore`；Orca 只选择实际配置/installed Web 的本地检查；Workspace 选择 `OrcaDelivery`、`OrcaCapabilitiesRejectBeforeNativeSQLite`、`OrcaHandoff`、`OrcaTaskSpec`、Run/role 合同、同文件内容变化、实际 Agent launch 合同与 ProjectAction 权限。上述选择保留真实 SQLite/HTTP/文件，不调用旧 native session/Relay live fixture。`TestOrcaCLIRealPrivateRuntimeScope`、`TestOrcaCLIRealCurrentProjectAuthorization`、`TestExternalCLIRegistryRealHumanApproval` 等需要已装候选的用例保留独立执行入口及未验标记，不能以默认 SKIP 充当验收。

`scripts/check-dependencies.mjs` 顶部 summarize import 与末尾实际 `--version` 调用属于资料产品；SWA 生产闭包无此依赖。删除根 `@steipete/summarize` 默认依赖时，`package.json`、`dependencies.lock.json` 和 `pnpm-lock.yaml` 须同批由一个负责人更新。旧 `scripts/{summarize,verify-import-inputs,paper-snapshot-capture}.mjs`、`install-media.ps1` 和 `scripts/workbench/{start,resume}.ps1` 仍有具体消费者，先按资料/认知或 legacy 来源保全再移出；不直接丢弃媒体安装版本记录。`scripts/check-s1-project-api.mjs`、`check-local-agents.mjs`、`tests/s1/acceptance.test.mjs` 选择旧混合服务，脱离默认 SWA 检查，原件随其历史夹具保留。`tests/s1/server.mjs` 的新 `product:'swa'` 生命周期仍被现 SWA HTTP/DOM 使用，不能整个 tests/s1 删除。

### 可实施顺序与下一批写域

1. Root 先提交已经接受的 Go/native/空间变更，形成可准确恢复的保存点；记录两个新仓的接受提交。保存点保全历史，不自动等于每项功能已经迁入新产品。
2. run_cli 在其已获写域收口默认 `check.mjs/check-dependencies.mjs`、package/锁文件/CI 与适用测试入口，禁止默认重跑旧产品 live fixture。当前 Go 类型检查可继续针对明确 SWA 包，不把旧测试全部执行作为清理前置。
3. 本负责人可在 Root 授权后专门修改上一表的 SWA 测试与旧 SQL fixture 归属，并把旧授权 HTTP 测试迁到 swahttp；测试计划只验证受影响真实权限/文件/旧库兼容门。当前此批尚未实施。
4. 产品负责人按准确原件把缺失的原测试/嵌入脚本保全到对应新仓 `source-tests`/来源归档，或保存完整 legacy 集成模块。认知/资料生产纯文件按已接受新仓提交归属移出；混合旧组装、旧 adapters 与研究依赖保持明确的 legacy 来源，不能把含当前用户数据的目录一起移动。
5. Root 最后裁定旧 `cmd/server`、混合 `httpapi/sqlite` 和未配置具体 bridges 移出 SWA 主源码目录的准确路径；保持必要 Workspace 端口和同一授权/任务状态。核查 `go list` 的生产及 test imports、当前测试入口、构建脚本与资产来源；缺失消费者时先修其真实依赖，不通过 build tags、伪数据或禁用权限检查消除错误。

完成标准是 SWA 主源码及默认检查均以当前产品为范围，两个独立产品保存所属源码/测试/许可证并独立验证，研究/历史证据有准确可恢复来源；“生产依赖已独立”只完成该标准的一部分。本节所有删除、归档模块创建与后继测试迁配均保持未执行。

## 当前 SWA 测试闭包迁配增量计划

Root 已将接受源码保存为 `644bbe8701ae1b1c30b54f18621c28e03dbf6082`，并建立完整源码归档 `/workspace/swa-legacy-source-644bbe87.tar.gz`（SHA256 `f15ed5f24ab202194755a3c215b27555cc1aee5a1c1529f47ce10e49b2a6eaf7`）。归档保存 tracked 源码，不含用户运行数据库/账号。此批先迁当前 SWA 的直接测试；旧源码删除由 Root 按上一节清单统筹，Astrocyte events 由 collaboration_model 保全，本负责人暂不删除 events 或研究文件。

### 准确写域与语义

1. `internal/workspace/app/orca_delivery_admission_test.go` 改真实 swastore、独立迁移、Workspace 空间和唯一 projectfiles，`orca_run_input_test.go` 改同一文件实现。原准入测试中的 selection/Run/authority 是明确效果前规则输入，测试不声称观察到原生成功或真实账号。本次去掉仅为了支持字符串 `pi` 而创建的旧 Native Registry；以实际 Repository 的 CAS 保存明确的 project settings 规则参数，再由实际准入消费者重新读取。权限负向用例同样保存明确参数，不伪造 ExternalCLIRegistry 成功。生产 SetProjectSettings 的注册核验保持不变，其未配置拒绝由真实 HTTP/Store 测试覆盖；已装真实注册批准仍由原 `external_cli_registry_real_test.go` 验证。原创建者、人类独立授权、Grant/撤销、完整原关联不改、无会话副作用的断言全部保留。
2. `internal/adapters/orca/installed_web_test.go` 改 `package orca_test` 并显式调用实际 Orca 公开函数，以允许使用 `swahttp` 而避免同包测试的导入环；原安装根/manifest/链接/路径/404 原则保持，页面入口改当前 `/swarm`。`internal/adapters/httpapi/orca_cli_test.go` 原装内 HTTP 权限测试迁到 `internal/adapters/swahttp/orca_cli_test.go`，只改 package；同步 `tests/swa-cli-headless/compile-go-tests.ps1` 对应包和二进制名。该装内测试本轮只编译，不带实际安装环境运行或计成功。
3. `internal/adapters/projectfiles/projects_test.go` 从原 `agents/projects_test.go` 抽取前两项纯真实文件用例，保默认拒绝、子目录、秘密文件名、撤销、空根、真实 symlink 和输出上限；原 history/原生 handshake 仍归 legacy。Windows 真实 8.3/redirect 路径的文件权限部分保留原测试来源，当前新测试的 Windows 交编不计原生执行。
4. `internal/adapters/swastore/{store_test,legacy_refs_test}.go` 和新 `testdata/legacy/`：使用 Root 提议的真实旧版本兼容数据库。新生成器只在保存点的原真实 AttentionService、objects、全迁移与空间服务上操作公开 LICENSE，产生资料版本、实际 ReferenceMaterial、空间、refs 和原 receipt，关闭/重开/原请求重放成功后保存 SQLite 原件及来源元数据；没有模型、伪造 API/native 或用户数据库。生成源码放 testdata 并记录原命令/保存点/公开内容来源，后继可在恢复的 644 源码中执行，默认 go list 忽略 testdata。当前 Store 测试每次复制该原件，检查原表/refs/locator/receipt 字节与资料内容摘要，应用新迁移后逐项不变并使用新实际空间服务读取。旧全迁移输入和完整同库事务原用例均在准确归档保全；不手写一个更弱的旧库 schema。这样默认 SWA 测试无需保留旧 Attention/objects/sqlite 生产包。
5. `scripts/check-architecture.mjs` 增加显式 `--swa` 与 `--all` 参数。`--swa` 对实际 `cmd/swa`、`cmd/swa-server` 的依赖图执行现有 Domain/app/transport 分层规则和禁止旧产品依赖；`--all` 保留整仓规则，未知参数拒绝。不用 build tags 或假 import 图。run_cli 负责默认 check 调用 `--swa`，不并写本脚本。
6. 本任务及必要 `testdata/legacy/README.md` 记录原件生成、实际失败和结果。`project_spaces_test.go` 当前实为旧 mixed fixtures 的 Attention helper，它与 `native_operations_sqlite/progress*` 等旧测试一起归 Root 清单，不能机械改为 swastore 后仍声称兼容旧参数；本轮新准入测试不再调用它。

### 局部验证及接受范围

- 原生成器以保存点真实服务产生新的公开库；核原 receipt 重放不新增、SQLite 完整性、关闭后来源记录。只读比较源码生成器使用的原函数与 644 保存点一致，记录可恢复命令。
- 定向执行当前准入/handoff/capability、同大小同时间变化、projectfiles 两项、installed Web、swastore 兼容、swahttp 当前真实测试。装内 HTTP authority 仅编译，明确排除 `SWA_REAL_ENABLED` 模型/服务链。
- `node scripts/check-architecture.mjs --swa` 实际图验证，未知参数拒绝；适用 Windows 包仅交叉编译。未改的产品/模型/全发行验证不重跑。
- 源码迁移完成后 Root 的整体清理应再次核当前包的 TestImports，无旧 Attention/agents/httpapi/sqlite；在旧包尚未移出时，不把全仓仍有 legacy imports 报告为失败或新产品成功。失败先最小复现/证据/局部修复，再安排完整构建。

### 迁配实际结果

本增量计划经 06 限定接受后实施。独占源已按上述边界完成；`orca_capabilities_admission_test.go` 的 observe_not_allowed 分支和 `orca_handoff_test.go` 的 missing-send 分支同批改用真实 CAS 规则参数，原目标错误码、权限和无会话副作用断言保持。装内权限测试只从旧 httpapi 迁到 swahttp，未执行装内服务验证。

| 日志（均在本任务 `.verification` 目录） | 实际结果 |
| --- | --- |
| `legacy-fixture-generate-r1.log` | 真实保存点服务生成公开 LICENSE 资料对象、空间引用与两个回执，关闭/重开/原请求重放通过，SQLite 完整性通过，关闭后原件 757760 字节。进程 exit0；原生产源与 644 的 `git diff --quiet` 为0。 |
| `current-tests-r1.log` | swastore 四项真实存储/兼容测试与 ProjectFiles 两项实际文件权限测试 PASS，exit0。兼容库只作原版本数据输入，当前 Store 未导入旧 Attention/objects/sqlite。 |
| `current-admission-r1.log` | 当前准入、capability、handoff、同文件变化八项中六项 PASS；另两项各一个分支因下述旧设置调用遗漏失败，整批 exit1，不能称该命令通过。 |
| `current-admission-r2.log` | 只重跑失败的 `TestOrcaCapabilitiesRejectBeforeNativeSQLite` 与 `TestOrcaHandoffCurrentApprovalSQLite`，全部分支 PASS，exit0。原四项 delivery、handoff binding、同文件变化的 R1 成功结果沿用。 |
| `current-installed-web-r1.log` | 测试编译失败：新 Server 没有 Handler，未执行。 |
| `current-installed-web-r2.log` | 实际监听/页面/assets已通过，原API未认证404假设失败；全部 installed root/manifest/path/symlink 拒绝用例 PASS。整批 exit1。 |
| `current-installed-web-r3.log` | 仅重跑资产/路由失败例，真实 listener、未认证403 JSON、实际本地 session、认证后404 JSON、正常 Shutdown 全部 PASS，exit0。R2的纯路径拒绝结果沿用。 |
| `current-http-r1.log` | 当前 swahttp 两项真实 SQLite/HTTP/权限/资产测试 PASS，exit0；装内 authority 用例不在选择范围。 |
| `current-architecture-r1.log`、`current-architecture-all-r1.log` | `--swa` 实际双入口依赖与分层规则、`--all` 原全仓模式分别 exit0。 |
| `current-architecture-negative-r1.log` | 未知参数按预期返回1且包含 Usage，验证脚本 exit0；拒绝发生在 Go 调用前。 |
| `current-windows-compile-r1.log` | `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go test -c -mod=readonly -o .../current-windows-r1/ ./internal/adapters/orca ./internal/adapters/swahttp ./internal/adapters/projectfiles` exit0。只证明三包测试二进制可编译，不计 Windows 原生或装内 authority 已运行。 |

局部失败的最小复现与根因已先报告 Root/06/用户：安装资产例仍调用旧 server.Handler；新服务真实公开接口是 Serve/Shutdown，改为实际 loopback listener 而不新增只为测试的产品 API。权限的两个直接消费分支继续通过 SetProjectSettings 选择 pi，nil Registry 正确返回 unsupported，失败在目标准入断言之前；改为同一已批准的 CAS 规则输入保存。安装资产后继例在没有 session 时请求未知 `/api/v1/` 路由，得到正确的403，旧测试预期404；保未认证403断言后，建立真实同源会话再验证404，未放宽产品权限。没有启动完整构建或模型测试。

兼容库、公开对象和 source.json 一并保全；原件受根 `*.sqlite` 忽略规则影响，提交时仅对此明确测试原件显式加入，不加入任何用户运行库。生成器在 testdata 下，不进入默认 Go 包发现；旧服务删除后按同目录 README 在准确保存点中重现。

### 最终交 Root 的源码移出边界

`.verification/swa-server-separation-20261023/proposed-source-removals.{txt,json}` 为准确684个 tracked Go/旧SQL路径，每项当前 blob 与保存点644一致。分组为旧命令94、旧具体 adapters363、Attention/workbench117、旧Workspace测试闭包16、旧根迁移29、旧混合/研究Go测试65。保留整个 Workspace/Swarm 生产和 domain、共享 judgment 纯合同及当前 SWA 闭包。研究 Go 实现/旧验证消费者按 `docs/LEGACY.md` 在原644恢复；研究样本、数据、原证据、Python实验来源与许可证不在移出清单。

初稿误把 `tests/s3/testdata/public-stats/{stats,stats_test}.go` 作为 Go 测试实现列入；Root在任何删除前发现，现明确排除所有 `/testdata/`、`/fixtures/`、`/.verification/`，两个原公开输入完整保留。只读清单生成器最初对整个 Git tree 使用默认输出缓冲，触发 ENOBUFS；限制读取到本任务 cmd/internal/migrations/tests 后成功，未改产品或原件。

`.verification/swa-server-separation-20261023/proposed-resource-removals.{txt,json}` 另列8个非Go具体资源：importers 的五份嵌入程序及 `paper-dom.test.mjs` 已在 Attention Mirror `5e6e69f403299c0d1b2ca367482689565d5ba40e` 原字节提交（测试在 source-tests/legacy-adapters 原路径加.txt）；`judgment/laya-worker.mjs` 与 `repositorycontext/codegraph.mjs` 属旧 SWA 集成，仅在644完整来源归档保全，不声称新产品实现。8件当前 blob 与644一致，六件新产品候选 blob 同样一致。未含数据/fixtures/许可证；删除由Root统一实施，本负责人未执行这些清单。

06 已限定接受修正后的684源码移出边界，当前测试源码与实际结果另以增量 manifest 收口。此批不把旧完整 integration 或未知原 R 当成已通过，不重跑旧 live fixture；本轮候选安装、真实 N4/N6 和 Windows 原生仍由 Root/release 继续。

## 清理后残余与 Go 依赖审计计划

Root 已开始按接受清单移出旧源码，并将最终只读审计交本负责人。必须等删除完成再读取完整 Go 图，避免把编辑中的临时缺包当作验证失败。当前明确保留的 SWA/Workspace/Swarm/共享合同源码及测试中，外部直接 imports 只有 `github.com/google/uuid`、`github.com/prometheus/procfs`、`golang.org/x/sys`、`modernc.org/sqlite`；其中 Windows 文件和测试也纳入文本核查。当前 go.mod 还直接列出旧解析、MCP、JSON-RPC、网页解析的六个模块，待实际最终图确认。

拟写域只有 `go.mod`、`go.sum` 和本任务；`dependencies.lock.json` 的 Go direct_dependencies 由持有该文件的 run_cli 按实际 tidy 输出同步，不并写。保持历史 module 字符串、Go 版本和所有仍需模块的已有版本，不主动升级依赖、不复制两个新仓模块、不改变原生执行合同。

顺序为：最终 `go list` 生产/test imports 和 Linux/Windows 两目标图确认没有已拆产品；`go mod tidy -diff` 只预览当前源码及测试实际依赖变化；审查差分只删不再使用模块及其校验和，再通过 Go 正式命令应用 tidy；`go mod tidy -diff` 应为空，`go mod verify` 成功。针对依赖清理无需重复已过业务测试，run_cli 的同一默认检查承担当前完整 SWA 局部编译/规则验证。只读图或 tidy 发现仍有旧消费者时先定位其源码归属，不通过临时 replace/版本升级解决。

根脚本本负责人只读，用户可见的旧 `check-local-agents.mjs`、`check-s1-project-api.mjs`、`summarize.mjs`、`verify-import-inputs.mjs`、`install-media.ps1`、`paper-snapshot-capture.mjs`、`workbench/` 仍由 run_cli 负责归档或明确标注历史入口；当前默认脚本已不调用它们。研究 `scripts/{experiment,validation,evidence}/` 保留原件，需要使用旧 Go 组合时明确指向 `docs/LEGACY.md` 和准确保存点，不能让当前根目录命令悄悄操作旧运行数据。历史任务/研究证据文档不作整体替换，当前可见入口发现误导时交对应 owner 窄修。

### 清理后实际结果

Root 确认692件预定源码/资源已全部按清单移出，两个公开 testdata 输入仍保留后，本负责人开始实际依赖审计。`post-cleanup-go-linux-r1.log` 与 `post-cleanup-go-windows-r1.log` 是完整 `go list -mod=readonly -deps -test` 图，二者进程均 exit0，涵盖当前全部 Go 包及各平台测试 imports；没有重新引入 Attention、workbench 或旧混合 adapters。`post-cleanup-architecture-r1.log` 的显式全仓架构模式检查17包、四个 Workspace/Swarm app/domain 与共享 judgment，exit0，双生产入口 allowlist 仍通过。

官方 `go mod tidy -diff` 预览保存在 `go-tidy-preview-r1.diff`，按参数语义在发现差分时返回1，没有修改模块文件；此状态不表示构建或测试失败。确认六个无消费者直接依赖可移除：goja、MCP go-sdk、ndjson、jsonrpc2、x/net、mvdan/sh。四个当前直接依赖及原版本保持为 uuid v1.6.0、procfs v0.22.0、x/sys v0.49.0、sqlite v1.60.1，历史 module 字符串与 Go 1.27.2 不变。

预览同时要求把 `golang.org/x/sync v0.24.0`、`golang.org/x/tools v0.51.0` 显式列为 indirect。已先核原 `go list -m` 就选择这两个版本，原 go.sum 已有相同校验值；`go-tidy-transitive-why-r1.log` 确认消费链为 sqlitebase → modernc/sqlite → modernc/libc → libc.test → tools/go/packages → sync/errgroup。该变化是移除旧产品依赖后保留 SQLite 的原测试依赖关系，没有新增版本或升级。证据已交 Root/06。

go.mod 按上述最小差分编辑，go.sum 由正式 `go mod tidy` 维护。`go-tidy-apply-r1.log`、`go-tidy-final-r1.diff`、`go-mod-verify-r1.log` 所属顺序命令 exit0；最终 tidy 差分为空（0字节），verify 报 `all modules verified`。`go-mod-final-r1.json` 保存正式工具解析的最终模块列表。没有 replace、工具链升级或新模型调用。Go direct inventory 的准确四项对象已交 run_cli 同步；默认检查等待本批稳定后由其运行一次，不重复本负责人已过局部用例。

根发行/安装/当前 SWA 验收脚本的只读引用检查没有找到旧 Go 产品入口。剩余 `installed-product-source.mjs` 的 `nonProduct` 数组有已移出 taste_profile_test 的历史排除字符串，它不启动旧服务，不扩大当前生产闭包。run_cli 新 `scripts/LEGACY.md` 已逐项说明旧媒体/工作台/混合验证脚本的用途、准确644恢复方式和研究范围；当前 README 已给该入口。已实读 `web/vitest.config.ts`：默认 `vitest run` 只发现五个当前 SWA 套件，旧 client/资料用例不会因 package script 未列文件而自动执行；`test:e2e` 也明确使用 SWA config。未改历史研究结果或原数据。
