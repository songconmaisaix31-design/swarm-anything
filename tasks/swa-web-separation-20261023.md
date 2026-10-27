# SWA 独立前端入口

负责人 run_cli。用户已要求 Astrocyte 与 Attention Mirror 分拆为独立仓，Root 于 2026-10-23 指定本负责人处理 SWA 前端入口与构建资产。分支 `integration/swa-task-cards`；原前端仍在共享仓，separation 负责人确认尚未保全旧 web，因此保全确认前不删除旧源码。

## 目标与合同

SWA 默认页面及 `/swarm` 只呈现现有 SwaWorkspace：同一 Run、递归任务、Worker、长期角色与讨论。`/workspace` 保留项目登记、准确项目目录、模型和动作许可、Agent Grant/token；原 project-spaces ID 暂沿最小登记合同。未知页面明确返回不存在的页面提示，不加载资料/认知页面。旧资料、认知、作品、提案和另一套 Mission 页面由独立产品保全后移除 SWA 主动源。

API/服务使用 capabilities 负责的独立 SWA HTTP/SQLite composition，当前字段与权限保持；新前端不新建鉴权、模型调用或任务后端。底层 HTTP transport、读取状态、表单与命令状态抽为现有共享模块；旧产品兼容导出保留至独立仓保全。不得把完整旧 client 的资料请求对象重新静态引入 SWA。

准确写入范围：新增 `web/src/SwaApp.tsx`、`web/src/styles/swa.css`、`web/src/pages/workspace/SwaProjectsPage.tsx`、`web/src/components/FormControls.tsx`、`web/src/components/FormControls.module.css`、`web/src/api/transport.ts`、`web/src/api/workspace.ts`、`web/src/hooks/useReadState.ts`；修改 `web/src/main.tsx`、`web/index.html`、`web/vite.config.ts`、`web/package.json`、`web/src/api/client.ts`、`swa.ts`、`s1.ts`、`web/src/hooks/useReadApi.ts`、`usePersistentCommand.ts`、`web/src/utils/commandError.ts`、`web/src/pages/workspace/ProjectSettingsForm.tsx`、`ProjectAgentAccess.tsx` 及本负责人既有 Swarm 四个组件/观察模块的 import；新增独立 `web/public-swa/favicon.svg`。必要 `web/e2e/swa-workspace.spec.ts`/config 接线。根 package/build/dev/start 脚本与 capabilities 分段串行，未冻结前不改其 Go 入口。

Vite 构建只从 SwaApp 的入口和独立 public-swa 目录产出资产；生成模块清单并在构建时拒绝资料/认知/旧作品源码进入依赖闭包。抽取原模块后旧入口仍使用兼容导出，防止保全期间破坏源文件。separation 报告保全 commit/hash 与准确文件集合后再另记删除范围。

## 验证计划

1. 类型、lint 与现有相关纯规则检查，验证共享 transport 的 ApiError 身份、CSRF、幂等 header、读取取消和过期状态语义保持。
2. 一次真实 Vite production build（非完整发行候选），检查入口、模块清单、manifest 和 public 资产：不包含资料/认知页面、导入队列、works、旧 Mission/Proposal UI，不包含旧品牌资料图标。所有资产属于当前构建。
3. 真实 HTTP/SQLite/Vite/Chromium DOM：默认入口与 `/swarm` 显示 SWA；只有任务和项目权限导航；`/attention`、`/cognition` 明确不存在且不发相应 API；项目登记/权限与当前 Run 不可用场景沿现有真实用例核查，权限撤销和过期版本保持拒绝。无截图、mock 路由或伪造模型。
4. 独立 server 就绪后使用同一 DOM 用例复核生产组合；root/combined 发行资产验收由总验收继续，不以旧 cmd/server 的结果代替新 composition。
5. 保全后清理旧源时，以实际构建闭包和明确保全清单交叉检查；不删除用户数据、历史、验证原件或独立仓。任何失败先给最小复现、根因证据和局部复验，再开始后继完整构建。

独立 Reviewer 已限定接受本计划，Root 已授权 `package.json`、`scripts/build.mjs`、`scripts/dev.mjs`、`scripts/start.mjs` 的默认 SWA 接线；capabilities 负责两个发行构建脚本的 `cmd/swa-server` 行，本负责人不同时修改。新服务保留 health 的旧 `service: astrocyte` 机器字段，以兼容既有 installed 消费者，产品界面显示 SWA。

真实 DOM 增量需要复用现有服务生命周期：追加写域 `tests/s1/server.mjs`、`tests/s1/server.d.mts` 的显式 `product: 'swa'` 选项。默认 legacy 调用保持，SWA 调用准确编译 `cmd/swa-server`、独立缓存 key，显式 SWA_DATA_DIR/SWA_ALLOWED_ORIGIN；不以缺省旧入口代验。旧原生 session API 与 native history 设置不进入 SWA 界面；保留现有字段值，项目权限只显示实际 Orca 入口使用的 start/send/stop/observe。此 helper 增量单独交 Reviewer 复核。

Reviewer 已接受 helper 增量。SWA 专用 `web/src/api/swa.test.ts` 也显式使用新 composition，旧 client 的实际 HTTP 测试保留原入口，只证明抽取的共同传输语义。新 DOM 场景在同一真实服务中核默认首页、两个导航、三个旧产品路径明确不存在且不请求对应资料/认知/作品/Mission/Proposal API。

Root 进一步授权 README 的当前 SWA 默认入口说明，以及 `.github/workflows/check.yml` 直接消费者：两条 workspace install filter 改为实际 `swarm-anything`/`@swa/web` 名称，Windows Playwright 明确使用与 Linux 相同的 SWA 专用配置。旧全产品 e2e 按独立产品保全，不继续以新默认页面代跑旧页面测试；没有触发远端 CI。

默认 dev 的直接生命周期消费者 `tests/s1/development-lifecycle.test.mjs` 同步新 SWA 入口：真实临时目录前缀与 `data/workspace/state.sqlite`，真实 project-spaces/local-projects 空库、旧资料/作品/认知 API 的 404。保留原有端口冲突失败日志、原服务继续可用、IPC 停机、进程消失与数据库留存核查。测试环境排除继承的 SWA 配置并显式随机 API/Vite 端口，不使用用户 installed 运行时或真实资料。

## 保全后删除旧产品页面

Attention Mirror 已保全 `web/src/pages/attention/**` 及共享闭包，独立仓 commit `dcec2cf217b1382358030d3d4b18596b53fb1f23`。原混合 `web/src/components/displayContract.test.tsx` 另按原字节保存在该独立仓 `source-tests/`（commit `b0782ab524f861d956cf3c1af7b61d7ee30ffeee`），仅作为来源。Astrocyte 的认知闭包由 Root 保全并固定为 `4b2a35940529378c299cf668847e60bd26f5d1fc`；Root 确认真实 MCP→snapshot→HTTP→DOM 验证后授权本阶段继续。实际删除前用两仓该固定提交的 git ls-tree 逐路径确认 59 份资料源码与 7 份认知页面/样式存在；三个认知目录测试随 SWA Relay 移动而未删除。

删除范围限定 `web/src/pages/attention/**`、`web/src/pages/cognition/{AgentsView,CognitionPage,EvidenceView,FocusView,TodayView,shared}.tsx`、`web/src/styles/cognition.css` 与旧混合 `web/src/App.tsx`。认知目录中的 Relay 会话显示、来源覆盖测试及格式函数属于 SWA 可选代码，移动到 `web/src/pages/workspace/{relaySessionEvents.tsx,relaySessionPresentation.ts,relaySessionCoverage.test.tsx,relaySessionPresentation.test.ts,relayEventFormat.ts,relayEventFormat.test.ts}`，保留原语义。新 `relayEventTable.tsx` 从原 shared 提取已有 EventTable，保留六字段、上海时间和未知 Token 语义，原 RelayTaskPanel 消费此表；相关 table/field/pagination/muted 规则移动到既有 `web/src/styles/relaySession.css`，避免可选 Relay 继续依赖认知 CSS。不增加主动入口或跨产品 API。旧跳转认知页的按钮改成明确独立 Astrocyte 查看提示，不虚构安装 URL。

其余直接消费者只切换共用 FormControls 与样式 import：`web/src/pages/swarm/DevelopmentSpacePanel.tsx`；`swarm/missions/{MissionStopActions,WorkItemEditor,MissionDetailWorkspace,ArtifactReviewActions,WorkItemFields}.tsx`；`workspace/{ManagedProjectsPanel,ProjectProgressPanel,ProjectHumanForm,GitHubRepositoriesPanel,NativeProjectPanel,ProjectManualProgressForm}.tsx`；`workspace/repositorycontext/{RepositoryContextPanel,RepositoryQueryFields}.tsx`；`workspace/proposals/{ApprovalPanel,ContextPacketWorkspace,ProposalEditor,GoalEditor,ProposalContentFields}.tsx`。NativeProjectPanel 的现有 lines 三操作直接留为本地函数，不保留资料领域依赖。共用 FormControls.module.css 补原 actions/timeline/pre/h4 样式。`relayFacts.tsx` 只将格式函数 import 指向移动后的 `relayEventFormat.ts`；`displayContract.test.tsx` 只去掉已保全的资料五项与其两个 imports/一个输入定义，其余 Mission/项目等原断言保留。

删除后验证全 web tsc、上述改动文件 ESLint、原有 Relay 显示/格式与覆盖测试、剩余 displayContract 测试；实际 Vite 模块清单继续拒绝跨产品主动模块。已有新 composition 的真实 HTTP/DOM 与 dev 生命周期结果继续有效，因为删除的是未进入主动构建的旧产品源；主动共享 CSS 补充后执行一次最终 production build。旧混合 api/client、e2e 和可选 SWA 页面继续保留，不宣称其已迁移或在新服务可执行。

## 局部检查记录

### 默认检查与 CI 归属

Root 追加授权默认 `scripts/check.mjs`、`scripts/check-dependencies.mjs`、`scripts/process.mjs` 的相关格式检查参数、`package.json`、`dependencies.lock.json`、`pnpm-lock.yaml`、`web/vitest.config.ts` 与 `.github/workflows/check.yml`。默认检查只执行 SWA 当前实际入口、当前权限/Run/Worker 与共用合同；历史独立产品或安装后模型场景保留自己的入口，不以 skipped 当成功。

capabilities 按现存生产边界给出 Go 集合：完整 `cmd/swa`、`cmd/swa-server`、`internal/apierrors`、`internal/foundation`、`internal/adapters/{projectfiles,sqlitebase,swahttp,swastore}`。Orca adapter 默认明确运行 `^Test(Runtime|InstalledWebDirectory)`；Workspace app 默认明确运行 `^Test(OrcaDelivery|OrcaCapabilitiesRejectBeforeNativeSQLite|OrcaHandoff|OrcaTaskSpec|RunCommandScopeAndRoleValidation|RunSubmissionRequestIdentity|RunRolePreservesFixedSpecification|RoleAndDiscussionDoNotAcceptExecutionAuthority|RunSubmissionDetectsSameSizeSameTimeInputChanges|CodexNativeLaunchContract|ClaudeNativeLaunchContract|PiPerSessionNative|ProjectAction)`。实际 installed runtime 私有作用域与 HTTP authority 测试继续属于发行验收；原 HTTP authority case 由 capabilities 迁到新 composition，保持真正授权验证。默认 vet 与格式检查使用上述 SWA 包目录。新增 `pnpm check:race` 使用相同包与测试选择，CI 不再全仓执行独立产品测试。

核心包中的 `TestOrcaCLIRealInstalledController` 与新迁入的 `TestOrcaCLIRealHTTPAuthorityBoundary` 精确交由原 installed 验收执行，默认 Go `-skip '^TestOrcaCLIReal(InstalledController|HTTPAuthorityBoundary)$'` 不进入其依赖外部真实窗口的函数；不按测试结果排除其它用例。CI foundation 对前一条同样显式选择非安装场景，不能把原函数内 t.Skip 当成验证成功。

Web 默认 Vitest 选择 `api/swa.test.ts`、`pages/swarm/{swaObservation,swaRoles}.test.ts`、`utils/__tests__/commandError.test.ts` 和新增 `api/transport.test.ts`。最后一份把原共享 client 的真实重启会话、取消、Agent 身份、CSRF/幂等单发与连接失败场景映射到新 SWA project-spaces/local-projects API，使用真实 SQLite/HTTP，无 mock。共用 `realHttpTest.ts`、角色与错误规则测试的 ApiError import 指向独立 transport，避免测试闭包重新引入旧资料 client。旧 client 与其它产品测试源保留，默认不执行。开发生命周期及进程停止原例继续作为 SWA 默认 Node 检查；容量/能力/Run/角色原生 SQLite 规则以既有 headless 非模型用例执行。

根 summarize 直接依赖与实际版本启动不属于 SWA，移出默认依赖/库存并由 pnpm 正规重生成锁文件，保持其余固定版本；旧工具源保留且不在 SWA 默认入口运行。架构检查的精确产品范围由原负责人 capabilities 处理，避免并写。验证先 node 语法、固定依赖合同、Web 类型/lint/默认真实测试与选定 Go 本地检查，再一次默认 build/start 或最终发行候选；没有通过的旧产品/模型测试不纳入默认 PASS。

Root 授权追加 `scripts/LEGACY.md` 与 README 链接：逐项标明原 check-local-agents、check-s1-project-api、summarize、verify-import-inputs、install-media、paper-snapshot-capture、workbench 的历史归属，完整 `644bbe87` 保存点的独占恢复方式，以及 experiment/validation/evidence 研究入口保留但本轮未运行。实际根及 Web package 命令中没有暴露这些旧产品入口；资料、认知的替代入口指向已存在的独立本地仓，不发明远端地址。此项仅文档来源检查，不执行历史脚本。Go 模块清理由 capabilities 独占执行后提供真实 direct 依赖，本负责人仅同步库存相应块，再运行默认检查。

首轮 tsc/eslint 均退出 1，未运行检查器：新 package 名称触发 pnpm 11 依赖状态同步，默认 `/home/agent/.local/share/pnpm` 不存在。准确最小命令与全部原件在 `.verification/swa-web-separation-20261023/{typecheck,eslint}-r1.log`。核实 `.modules.yaml` 的实际 store 后，使用明确旧 store 的 frozen/offline/ignore-scripts 同步；此轮退出 1，原因是供应链检查缺少 `claude-agent-sdk-darwin-arm64` 的离线注册表元数据，锁文件已确认 up to date，未执行版本解析。

保留固定锁与原 store，指定本仓 `cache/pnpm-metadata` 后允许获取公共注册表元数据，同步第二轮实际退出 0，resolution skipped（`dependencies-local-r2.log`）。随后相同 tsc/eslint 第二轮均实际退出 0（exec sessions 13553/22630；`typecheck-r2.log`、`eslint-r2.log`）。没有更新依赖版本或修改锁文件。

`pnpm --dir web exec vite build --manifest` 第一轮退出 0（session 55949；`vite-r1.log`）。实际 `.vite/swa-modules.json` 无资料/认知/旧 Mission/作品模块；产物只有当前 index、JS、CSS、两个构建清单与 SWA favicon，旧 public brands 未复制。Root 后继新增 Run `acceptance: unreviewed` 与真实 `handoffs` 消费，最终该小改及独立新 server DOM 仍待后续局部复核，首轮资产结果只覆盖此前准确源。

补齐 Run 验收未审/交接记录字段后，Web tsc R3（session 23702）、RunView ESLint R3（session 48041）、Vite R2 均明确退出 0。`go test -mod=readonly ./cmd/swa -run 'Test(RunCLI|RunExport|OrcaCLIRejects|OrcaCLIMissing|OrcaCLIHelp)' -count=1` R6 退出 0，记录在 `.verification/swa-run-cli-20261023/go-tests-r6.log`。

新 `cmd/swa-server` 真实 composition 已运行：`pnpm --dir web exec vitest run src/api/swa.test.ts src/api/client.test.ts --maxWorkers=1` 14 PASS/退出 0（session 9757；`http-tests-r1.log`）。其中 SWA 六例明确 product:swa；旧 client 八例只证明共用 transport 的原语义，不代替新 composition。真实 Chromium DOM 的两例也显式 product:swa，2 PASS/退出 0（session 18701；`dom-r1.log`）：默认 SWA 页、两个导航、旧页面隔离与不调用旧 API、原生未配置拒绝、角色读取失败禁写、项目权限撤销和版本过期拒绝均实际执行。日志与实际服务 SQLite 保存在 `.verification/swa-web-separation-20261023/`，没有截图或伪造响应。

默认开发命令的生命周期 R1 退出 1，最小复现 `node --test tests/s1/development-lifecycle.test.mjs`：第 51 行请求旧 API 的裸 fetch 未携带已经建立的真实会话 Cookie，实际 403 先于路由 404；`swahttp/server.go` 的 guard 包装顺序与实际响应吻合。修复仅让测试携带 `api.cookie`，不修改权限或放宽 404 断言。相同局部用例 R2 实际 1 PASS/退出 0（session 64681；`dev-lifecycle-r2.log`），覆盖真实 SWA 页面、项目空库、三个旧 API 404、端口冲突日志、原服务继续可用、IPC 退出、子进程清理和 SQLite 保留。用户已在下一次构建前收到最小复现、根因与局部复验结果。

capabilities 的实际 CLI 依赖检查发现 `cmd/swa/serve.go` 只为路径校验调用旧 agents 包的四处 CanonicalRoot，却引入了旧领域。新增该直接消费者写域，将四处调用改为独立 projectfiles 的同一函数；原 agents.ProjectFiles 已委派至它，未改变路径判断。随后全部 `go test -mod=readonly ./cmd/swa -count=1` 返回 `ok`（1.283s，`.verification/swa-run-cli-20261023/go-tests-r7.log`），`go list -deps ./cmd/swa` 已无 attention/swarm app、agents/cognition adapters、sleep/openviking（`cli-dependencies-r2.log`），整体命令完成退出 0。准确 serve.go SHA256 `5610b3cc627fc223d972cd1cdb197f442bfe978aa73630f881fd3eaa7feb9135`。

页面剪除后的 tsc R4 退出 2，六条真实诊断指向五个旧 e2e 文件：三个认知来源用例、plugin-snapshot 和仍属 SWA 的 relay-session-readonly；均引用已经移动的模块。后者改为 workspace/relayEventFormat；独立产品四份测试先分别向 Astrocyte/Attention Mirror 的 source-tests 保全，再从 SWA 移除，不用旧解析器副本重新引入其他产品。原型 lint 覆盖 Workspace/Swarm 全目录和 displayContract 实际退出 0（`prune-eslint-r1.log`）。

迁移后的规则检查 R1 有五个 suite、29 项通过；原 `relaySessionPresentation.test.ts` 的 beforeAll 需要真实 `ASTROCYTE_TEST_RELAY_PUBLIC_URL` 与实际 GetEvent 文件，本轮没有该已运行服务，因此整体退出 1，该 suite 两项未执行（`prune-rules-r1.log`）。此用例是既有原生接入集成，不能当作纯规则测试，也不能用伪造服务或数据满足。其导入迁移由类型检查验证，实际历史 Relay 集成覆盖明确保留未运行，不计入通过；其余 29 项不因该环境缺口重复运行。用户已收到最小复现、根因及实际局部结果，完整构建保持未启动。

三个认知旧 e2e 的逐字节原件已提交 Astrocyte `f402020b839b0e540021d4270e2bdc28cd5d2a01`；plugin-snapshot 原件已提交 Attention Mirror `54727f7bf366244c7c097211fb891ce7982cf91e`。本负责人复核固定 git tree 与 cmp 后删除 SWA 的这四个消费者；relay-session-readonly 转用移动后的同一格式函数。随后 tsc R5、最终大范围 ESLint 与 Vite R3 均实际退出 0；生产构建仍为 32 个 SWA/共用源码模块，无原资料/认知/旧任务模块。

默认检查归属计划由独立 Reviewer（05 受 06 委派）限定接受。依赖同步 `lockfile-prune-r1.log` 与 `dependencies-prune-r1.log` 均退出 0：正规 pnpm lockfile-only 后 frozen/ignore-scripts 安装保持其它版本，移除 summarize 独占的 62 个包，undici 只剩 optional 使用由 pnpm 自然标记。实际 `node scripts/check-dependencies.mjs` 退出 0，固定库存、安装版本与锁文件一致。

新默认五份 Web 测试 R1 实际 28 PASS/退出 0（`default-web-r1.log`），新传输原件来自独立 SWA SQLite/HTTP。tsc R6 另以退出 2 指出 `transport.test.ts:56` 把 CSRF 放在通用 headers，生成参数合同要求显式 header 参数；同次真实 HTTP 已确认携带实际值。修正参数表达后 tsc R7 退出 0（session 43352），未修改业务实现；局部 ESLint 退出 0。依 05 建议，现有首个真实 503 用同一 Promise 再核 `instanceof` 独立 transport 的 ApiError，原两请求断言保持，不追加 HTTP 调用；该新增断言待最终默认 check 实际运行。

Root 完成已保全旧 Go/SQL 剪除后，capabilities 固定最终 Go 模块集合，本负责人同步库存为 uuid `v1.6.0`、procfs `v0.22.0`、x/sys `v0.49.0`、sqlite `v1.60.1`，版本保持。随后完整 `pnpm check` R1 明确退出 0（session 73472；`default-check-r1.log`；实际输出目录 `.verification/check-56ioKb`）：选定 Go 格式/vet/测试、架构与精确依赖均通过；实际开发生命周期及进程关闭三项、原生 SQLite/Run/角色等 27 项均通过且无跳过；全部 Web 类型与 lint 通过，默认五套 28 项通过，包含同一真实 503 的 ApiError 身份断言。OpenAPI 校验通过并保留原 29 条 unused-component 警告，264 个示例及生成类型一致。最后 git diff --check 通过。该结果不包含 installed 模型或 Windows 实跑。

前端准确 66 项源码由 05 独立审查、06 归并限定接受；摘要清单 `.verification/swa-web-separation-20261023/frontend-sources-r1.sha256` 的 SHA-256 为 `f7877d60a515f874aaae7f151813a2c7d98a6fe4bedce3b617ffb4885bff9446`。主动业务源无阻断；默认 check/CI 脚本、库存及默认 build/start 的最终结果另行审查。

同范围 `pnpm check:race` R1 明确退出 0（session 38336；`default-race-r1.log`）；核心包、Orca adapter 与 Workspace app 均通过真实竞争检测。随后 `pnpm build` R1 退出 0（session 13379；`default-build-r1.log`），实际生成独立 `dist/swa-server`、`dist/swa` 和 Web；Vite 46 总模块、32 个 src 模块，JS/CSS 与已审查 R3 相同，没有引入资料或认知生产模块。

真实默认启动脚本 `.verification/swa-web-separation-20261023/start-smoke.mjs` 于同一构建后执行，明确退出 0（`default-start-r1.log`）。实际 `scripts/start.mjs` 启动本次构建的 `dist/swa-server`，独立数据保存在 `start-r1/data/workspace/state.sqlite`，真实监听为本机随机端口；HTTP `/swarm` 和当前 JS/CSS 均 200，资产逐字节等于当前 build；健康、会话及空项目空间读取成功，携带真实会话的旧认知 API 为 404，SQLite integrity_check 为 ok。只关闭本次自有进程，退出 0 后真实连接失败且 SQLite 保留；完整 stdout/stderr 在 `start-r1/`。本轮未调用模型，不能替代 Linux/Windows 已安装 Run N=4/N=6 验收。
