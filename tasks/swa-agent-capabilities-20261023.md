# SWA Agent 能力与执行效果

## 范围与基线

用户要求按能力接入 Agent，分别呈现安装、启动、控制和真实执行效果，并把中途输入、恢复、图片、工具、模型和账号状态贯穿发现、启动、运行、成果。当前分支为 `integration/swa-task-cards`，调查基线为 `11619d72f08c163f159a4f4befe270806b1b67ea`。本文件先提交接口与测试计划，经过 Root 裁决和独立 Reviewer 接受后实现。

本负责人当前只写本任务文件；本次调查未读取账号或密钥正文、未运行 Agent/模型、未启动服务或完整构建。执行客户端为本会话 Codex；未额外选择模型。

已完整读取固定 OpenMausBot `30b62aaf18adc22099c24a7181abf5e9ddead980` 的 [ProviderAdapter 合同](https://github.com/milind-soni/OpenMausBot/blob/30b62aaf18adc22099c24a7181abf5e9ddead980/server/contracts.ts)。用户给出的官网 providers URL 返回 HTTP 403；同一固定提交的 [官方文档源码](https://github.com/milind-soni/OpenMausBot/blob/30b62aaf18adc22099c24a7181abf5e9ddead980/apps/docs/content/docs/providers/index.mdx) 已完整读取。原件位于 ignored `.verification/openmausbot-capabilities-20261023/`。外部资料只作为参考，不构成本仓授权或工具策略。

参考中可复用的语义是：steer 的 `steered/refused/indeterminate` 明确区分效果；indeterminate 不允许自动重发；strictResume 要求原会话继续、明确重建或失败；模型目录区分真实 CLI 列表与未验证离线列表；账号仅展示非秘密身份和认证方式。

## 现有实现与缺口

| 范围 | 现有来源 | 结论 |
| --- | --- | --- |
| 发现 | `runtime/swa-orca/src/agent-discovery.ts`、`contracts.ts` | 已分开 registered/enabled/installed/configured/launchable。start/send/stop 只声明 adapter 有相应方法；launchable/read/resume/tools 在无实际会话时为 unknown。需要明确声明与实测来源。 |
| 原生能力 | Orca `StructuredAgentRegistry`、`AgentSessionCapabilities`、各 Agent definition | 已有 imagePrompts、steering 和 options 能力。直接投影已有声明，不维护第二份 Agent 名称列表。 |
| 中途输入 | `worker-input.ts`、`readNativeInputStatus`、原 mutation receipts 与 journal | 原 request/child request/operation/fence 已持久关联；未知效果禁止重发。pre-input rejected 且 effects_applied=false 可以证明未送达；journaled/queued 只证明本地记录或排队。 |
| 会话来源 | Orca `providerHandleChain` | 已区分 created/adopted/resumed/forked，created.replaces 记录上下文替换。controller.recover 是 Run consumer 恢复，不等于模型会话恢复。 |
| 模型目录 | Orca `AgentModelCatalogService.read({savedOnly:true})` | 已有 live-session/probe/unknown、时间和账号键。必须复用正确账号/会话来源，不能启动额外目录探测或把 configured selection 当成账号可用目录。 |
| 成果 | `task-result.ts` | 已核对原 selection、当前 session/model/provider、原输入库存、原生结果和完整来源。适合增加安全摘要投影；不需要新的执行账本。 |
| GUI | `web/src/pages/swarm/swaObservation.ts` | 已有能力状态和项目权限版本检查，但尚未显示完整能力、目录来源、恢复与送达效果。 |

当前原生声明：Pi imagePrompts=false、steering=inject；Codex/Claude imagePrompts=true、steering=inject；ACP 的图片能力来自各 launch spec、steering=queue。上述均为源码声明，不能写成此环境实测通过。现有公开 SWA Worker 入口只提交文字且固定 selection，不提供图片或会话内模型切换命令；这些操作必须明确 unavailable。底层声明单独呈现，GUI 不据此开放产品尚未接线的动作。

Pi 当前目标仍为 StepFun `step-3.5-flash`；Codex/Claude 的现有固定策略分别为 OpenAI `gpt-5.5`、Anthropic `claude-opus-5`。OpenCode 的原生执行边界仍有前期未解决项，不能从已安装或 adapter 注册推断可执行。当前真实 N 和模型验收结果以本轮独立结果为准。

## 已确认公共合同

保留现有 `swa.capabilities.v1` 和 observation 三态，添加字段，不改已有状态意义：

1. `observation.basis?: declaration | configuration | probe | session | result`。新生产者填写来源层级，旧记录缺失时保持旧 source 原文与未知层级。available 只适用于该 observation 指明的对象；declaration 不显示为实测。
2. 每个 Agent 增加可选 `declared_features: {images:boolean, model_switch:boolean, steering:inject|queue}`，分别读取真实 registration 的 imagePrompts、restingOptions.acceptsKey('model')、steering。该字段是 adapter 声明。字段只为读取旧能力记录而 optional；新生产者始终输出完整对象，不输出 null。
3. `control` 增加可选 `images`、`model_switch`，类型沿用 observation；optional 同样只为旧记录兼容，新生产者始终输出。当前公开 SWA 输入合同下二者为 unavailable，并说明文字输入/固定 selection 限制；不能把声明当成当前操作准入。已有 control.start/send/stop 的 basis 为 declaration；read/resume/tools 的未知状态保持。
4. 增加可选 `model_catalog: {origin:live-session|probe|configured|unknown, availability:verified|unverified, models:Array<{id:string,label:string,provider?:string}>, observed_at?:string}`，新生产者始终输出，其他字段不接受 null。只有同账号、同会话来源的原 saved catalog 可以标记 live-session/probe 和 verified；这表示列表来源已观察，不表示模型调用成功或当前账号一定有配额。只有本地 configured model 时 origin=configured、availability=unverified；完全缺失时 origin=unknown、models=[]。不发远端目录请求，不新建会话。发现没有绑定 Worker 时先只呈现现有 configured 项；运行查询可通过已核 sessionId 调用原 `host.deps.modelCatalog.read({agent,sessionId,inSessionWorkspace:true,savedOnly:true})`，由该服务按原 session 账号选择 saved entry，不把发现默认账号的目录当作 Worker 目录。
5. `worker.show` 与 `task.result` 的每 Worker 增加只读 `execution` 摘要：`selection:{agent,adapter,version,execution_mode,provider,model,account_source}`、`launch` observation、`control` observation、`result` observation，以及下述 delivery/resume。摘要只使用既有已验证来源；不带 auth 路径、配置原文、token、key、邮箱或无证据的账号身份。account_source 是原策略 account.kind。
6. `delivery:{state:sent|not_sent|unknown, phase:journaled|queued|accepted|rejected|unknown, request_id?:string, operation_id?:string, source:string}`。sent 必须由原请求对应的 `readNativeInputStatus` 输出支持：原 parent/child binding 通过，submission 的 clientMessageId/operation/fence 与 binding 相同、dispatchState 为 accepted、providerItemId 非空，并通过原 `parseAgentJournalItemKey` 核对 Codex threadId / Claude native sessionId / Pi legacy Orca sessionId 与已验证当前 provider link 和 source；只有 state 字符串不构成证明。仅 local journal/queue 或 admitted transport 不升为 sent。not_sent 只用于原请求已持久保存的 pre-input rejection，或原生明确拒绝且证明没有效果。任何异常、断连、未结算或证据不完整均 unknown；查询沿原 request_id，禁止自动换 ID 重发。request_id/operation_id 无来源时省略，不写 null 或生成替代值。
7. `resume:{state:not_requested|resumed|rebuilt|failed|unknown, source:string, session_id?:string}`。session_id 仅使用不含路径的原 Orca session ID，不复制 Pi native handle 中的绝对路径。resumed 必须来自原 provider link 的 resumed 与原 native identity；forked 不视为 resumed。created.replaces 只能标记 rebuilt，界面说明原上下文被替换；没有原生恢复事实保持 unknown。没有恢复请求且首次 created 为 not_requested。明确恢复失败才 failed。controller.recover 不改变该结论。
8. Agent 增加可选 `authenticated: observation`，新发现输出 unknown。configured 只表示配置来源齐备，不代表认证、配额或推理成功；明确原生认证报告或实际模型成功才能作为认证成功来源。Root 已接受这个区分。

这些是派生的读模型；不新增持久数据库、调度器、重试器或模型切换写入口。统一 Run/Task/Handoff 合同由其他负责人处理。是否把 execution 直接置于 native.source 下或顶层由 Root 与接线负责人统一，禁止并行产生两种格式。

## 写域与消费者

本负责人提议独占：

- `runtime/swa-orca/src/agent-discovery.ts`。
- 新 `runtime/swa-orca/src/execution-observation.ts`，承载无 I/O 的声明与安全效果投影，避免 API/GUI 各自推断。
- `runtime/swa-orca/src/contracts.ts` 仅 observation 与 agentCapabilitiesSchema 及其直接使用的能力 Schema；Root 独占 command/newRun Schema。
- 新 `tests/swa-cli-headless/agent-observations.test.mjs` 和既有 `project-capabilities.test.mjs` 的必要检查。
- 本任务文档。

Root 已确认上述写域与字段方向。Root 负责 `contracts/swa-cli.schema.json`、Go 公共合同、OpenAPI/生成的客户端和 GUI；`native-methods.ts`、`task-result.ts`、Run/Task/Handoff 接线由 collaboration_model 负责。本负责人只提交投影函数及调用合同，不直接改两个接线文件。Reviewer 审核通过后在上述独占范围实施。若拆仓迁移改变路径，先交接 write_paths 再继续。

## 测试计划

| 检查 | 需求及失败路径 | 证据边界 |
| --- | --- | --- |
| 真实 registry definitions 的声明投影 | Pi 图片禁用、Codex/Claude 图片声明、ACP 按 spec；不存在的方法或产品未接线能力不能开放。model_switch 不因接受 model 选项便成为公开可用写操作。 | 直接读取生产定义与纯规则；不伪造 Agent 或协议。 |
| 能力三态与来源 | installed/configured/declared 不自动升级 launch/control/result；unknown 和 unavailable 在 GUI 中保留原因；旧 observation 缺 basis 仍可读。 | 纯展示/规则输入，不标记原生实测。 |
| 目录只读与账号隔离 | savedOnly 不启动 probe；同账号目录优先，缺失目录显示 configured/unverified 或 unknown，不能借另一个账号目录；过时目录保留时间。 | 原现有服务的真实持久目录和读入口；无网络与登录。若实际账号来源不具备，明确未验正向原生来源。 |
| 输入送达 | 原真实 SQLite requests/journal 匹配同 request/operation/fence；pre-input rejected 为 not_sent；本地 queued/journaled、断线、pending 为 unknown；accepted 必须有原 native identity；unknown 恢复查询不再次调用发送。 | 复用既有准入及请求恢复检查，新增纯映射检查不能充当原生送达证明。 |
| 恢复来源 | 原 persisted provider chain 的 created/resumed/forked/replaces 分别展示；controller.recover 不冒称 native resume；缺来源不能判定。 | 生产 chain 读取与投影规则；真实 resume/rebuild 只在实际发生后计通过。 |
| 效果归属与成果 | 已验证 session 的 agent/model/provider/account kind 与原 selection 一致，拒绝 session/fence/model 变化；完整成功结果才标记 result available；失败/未结算保留。摘要不输出秘密和 auth 路径。 | 复用原 task.result 强验证与原样成果，保持其 bounds 和全库存末次核对。 |
| 合同与消费者 | JSON Schema、Zod、Go JSON、OpenAPI 生成类型、CLI/GUI 字段一致；旧合同记录可读；未支持图片/切模不能从 GUI 发出写请求。 | Root 统一合同验证、严格 TypeScript、适用 Go/GUI 检查。 |
| 实际 N>3 | 固定公开输入、ToolsOff、当前 StepFun 策略下，每 Worker 的实际身份、选择、输入、输出及结束归属可复核；只计实际同时在运行的 Worker。 | 本轮 N 验收负责人统一执行，本任务不自行开启额外模型调用。Windows 与 Linux 分别报告。 |

先运行受影响纯模块与合同局部检查，再由 Root 安排共享 strict 和必要产品构建。失败先记录最小复现、原证据和局部修复验证结果，再进行下一次完整构建。无原生来源的正向模型/恢复分支保持未验，不用 mock 或复制旧结果代替。

## 当前实施与验证

Root 已批准上述字段与写域；独立 Reviewer 06 已限定接受本计划。已实现 `agent-discovery.ts`、新 `execution-observation.ts` 和 `contracts.ts` 的能力 Schema 部分。新发现输出区分配置来源、认证、声明、实测和有效产品操作；图片、切换模型沿现有文字输入与固定 selection 明确 unavailable。新的只读执行投影接收原 `source` 和准确 `dispatchId`，核对同请求、session、fence 与 provider item 身份；原 native journal 明确 rejected 且没有 provider item 时映射 not_sent。

供接线负责人的调用为 `executionObservation(sourceValue, {dispatchId, currentInput?, nativeResult?, modelCatalog?})`。`sourceValue` 必须是原 `observeWorkerSource` 或 `completeTaskResult` 已核对的 source；`currentInput` 使用原 `readNativeInputStatus` 或已持久结算的 pre-input rejection；`nativeResult` 只能在原 latest input、原生完整来源和最后库存检查路径中使用。source 不可用且缺 selection 时保留原 unavailable 原因，不伪造摘要参数。未发生原生启动、恢复、模型成功的分支不得由纯规则测试升级。

实际局部检查：

- R1：`node --test tests/swa-cli-headless/agent-observations.test.mjs tests/swa-cli-headless/project-capabilities.test.mjs` 中新增纯投影四项通过；既有 project-capabilities 在 esbuild 装载阶段失败，错误为 `appimage-registration-lock.ts:3 Could not resolve proper-lockfile`。该测试尚未运行到测试正文。
- 根因证据：`proper-lockfile@4.1.2` 已安装在真实 runtime 依赖目录，vendor 无对应链接。生产 `scripts/build-swa-runtime.mjs` 指定 runtime/root 的 nodePaths，原测试 compile 缺失该解析路径。仅给测试补相同 nodePaths；没有 external 排除或替代依赖。06 已接受此 consumer 修复范围。
- R2：仅重跑 `node --test tests/swa-cli-headless/project-capabilities.test.mjs`，真实目录身份与设置变更两项通过，0 failed、0 skipped、退出 0。
- R3：为原计划覆盖 ACP 真实 definitions、pre-input rejection 的 Dispatch/child 身份、目录重复/时间与认证不升级，补齐纯规则检查后，仅运行 `node --test tests/swa-cli-headless/agent-observations.test.mjs`，六项通过，0 failed、0 skipped、退出 0。

以上使用 `.verification/cloud-setup/activate.sh` 的 Node 24.16.0。未运行完整构建、真实 Agent、模型或恢复；并发 N 与 Windows 验收由本轮专门执行负责人统一报告。公共 JSON Schema/Go/GUI 和 `task-result.ts`/`native-methods.ts` 的实际消费者接线尚需合并验证，当前不宣称整合完成。

若目录 API 无法在同账号来源下只读调用、原结果没有足够成功判据、或分拆改变共享写域，则先报告准确缺口，不改成隐式探测、猜测成功或另建账本。最终源码审查必须覆盖接线后的同账号、同 fence 和当前输入消费者。

## 后续独占：角色与讨论界面

Root 已分配本负责人实现 `web/src/pages/swarm/SwaRoles.tsx`，以及必要本地 `swaRoles.ts`、测试和独占 CSS；run_cli 负责人在 `SwaWorkspace` 接入，不互改文件。组件接受当前 project 和 disabled；可经回调把已选角色准确版本与讨论 ID 交给 Run 提交表单。

界面通过同一个 `swaApi.command` 显示项目角色列表、职责、默认 Agent/model、技能和长期知识引用，提供创建、按 revision 更新、归档；归档保留历史。引用由用户显式输入，页面不扫描或上传文件。讨论列表、标题、所选角色、按序文字要求单独显示；追加只写当前 Conversation，明确显示“已保存到讨论；此操作未向 Worker 发送”。这一步不暗中调用 worker.send；历史条目仅显示已保存，不推断后续任务是否引用过这些要求。

权限沿 Root Go 合同：list/show 使用 observe；role create/update/archive 与 conversation.create 使用 start；conversation.append 使用 send。disabled、当前项目权限版本、读取过期、pending 或未结算的原 UUID 都阻止新写；onSubmit 再检查。服务继续是最终权限边界。

持久请求复用现有 `usePersistentCommand`，只在 sessionStorage 保存公开原 UUID；未知结果只调用原 `request.show`，经动作、项目、target、原 request 与已完成 receipt 核对后解锁。backend 负责人须先提供准确 DTO 和 receipt 方法名，不猜测 shape。角色更新冲突保持原编辑值并要求刷新，不自动以新 revision 重放。

必要检查为真实 JSON 合同解码/纯权限规则（无假 HTTP/CLI）、Vitest 局部用例、Web TypeScript 与 lint；Root 最终实际服务交互复核角色持久化、CAS 冲突、项目切换隔离和未知请求恢复。界面正文使用角色/讨论表单与记录，不以原始 JSON 作为主界面。无真实服务可用时明确标记交互未验，不用 mock 宣称产品通过。

### 界面实施与局部结果

已实现上述四个界面源文件及 `swaRoles.test.ts`。列表/详情按项目及权限版本读取；读取加载、失败、过期状态阻止新写。命令使用原 `usePersistentCommand` 保存 UUID，恢复仅查询 `request.show`，核对 `swa.collaborationWrite`、原项目、动作、目标和已完成 receipt。创建返回的实际 ID 必须对应原 request；追加成功必须包含该 request 的实际 entry。卸载时终止查询，旧页面的结果不更新新项目。

后端明确无效果拒绝通过原 `SwaCommandError` 返回 `data.effectsApplied:false`；仅在外层 request_id 与提交 UUID 相同时解释为 rejected。普通错误、断线、absent 和 pending 都保持未知，不能通过换新 UUID 重发。CAS 版本冲突保留表单编辑，通过刷新角色并明确“载入最新保存版本”后再提交；界面不自动用新版本覆盖编辑。

R4：在 Node 24.16.0 下执行 `cd web && ./node_modules/.bin/vitest run src/pages/swarm/swaRoles.test.ts`，五项纯规则检查通过，0 failed、退出 0。涵盖项目/身份/版本、原创建/追加身份、未知请求恢复边界、明确无效果拒绝与当前权限/显式引用。完整进程原始日志为 `.verification/openmausbot-capabilities-20261023/roles-vitest-r1.log`。

R5：指定三个 TS/TSX 源执行 ESLint，退出 0，完整进程日志为 `.verification/openmausbot-capabilities-20261023/roles-eslint-r1.log`。后续载入按钮仅补 disabled/归档 pending 条件；最终统一 Web TypeScript、lint 和浏览器 DOM 检查由 run_cli 负责人执行，避免重复整合检查。

R6：run_cli 的 Web TypeScript R2 在四处角色引用数组读取报告 TS18047。最小复现 `pnpm --dir web exec tsc -b --pretty false`；根因是共享 `contracts.ts:14` 及生成 Web 合同已允许 Go nil slice 的 `skills/knowledge:null`，界面类型还直接沿用可空字段。原始完整诊断 `.verification/swa-run-cli-20261023/web-typecheck-02.log`。修复在界面解码边界按合同把 null 解释为无引用，并将已解码 RoleDefinition 的两个字段明确为数组；提交始终发送显式数组。补现有测试项的 null 分支后，R7 局部 Vitest 五项通过、退出 0，完整日志 `.verification/openmausbot-capabilities-20261023/roles-vitest-r2.log`。run_cli 负责随后重跑同一 Web TypeScript 检查；该失败后未启动完整构建。

实际能力消费者读源另发现 savedOnly 的同账号条件：原 model-catalog service 若 session 不受当前 `agentDrivesSession` 支持，会读取当前默认账号目录；savedOnly 只禁止 probe。已交 backend 负责人在读取前复用生产 `agentDrivesSession` 对原 record 核验，不能证明时保持配置目录未验证。最终消费者审查必须涵盖这一条件。

R8：06 沿真实 hook 发现普通 ApiError 4xx 被 `usePersistentCommand.commandDeliveryUnknown` 判作可解锁，原 GUI wrapper 只处理 SwaCommandError，缺少对无明确同请求原回执的保护。局部修复新增 `collaborationFailure`，同 UUID 的 SwaCommandError 交原 outcome 判断；其他异常转为保留 cause 的 Error，使通用 hook 保留原请求锁。没有修改全局 hook 或其他消费者。原测试项增加实际 ApiError/SwaCommandError 类型与真实 `commandDeliveryUnknown` 的组合检查。`roles-vitest-r3.log` 五项通过/退出 0；`roles-eslint-r2.log` 退出 0（session 30660）；`roles-typecheck-r1.log` 全 Web TypeScript 退出 0（session 44429）。日志在本任务原 `.verification/openmausbot-capabilities-20261023/` 目录。

run_cli 的真实无 runtime 浏览器 DOM R2 两项通过、退出 0（session 29138），日志 `.verification/swa-run-cli-20261023/web-dom-02.log`；覆盖角色读取失败禁写、observe 撤销无写入口、全程无写命令。无法在未配置 runtime 的环境实际触发未知写，保持该场景未运行。父 `SwaWorkspace` 已有清除本次角色/讨论按钮，分别设置 null/空串，使 Run 提交解除原关联；归档后可主动清除。此结果没有覆盖真实角色 CRUD/CAS 或角色关联 Run 执行成功。

上述纯规则与静态检查没有启动服务、数据库、Agent 或模型。真实角色持久化/CAS/未知请求恢复和同 Run 复用仍按 Root 集成验证；能力与角色GUI源已获独立 Reviewer 06 限定接受，实际 execution 消费者另由backend负责人提交最终审查，不能将这些结果写成完整产品验收。

R9：06在实际worker.show消费者发现原输入请求pending时复用了完整成果的严格读取，导致无法显示当前Worker及delivery未知状态。backend在仅观察入口允许原请求pending，完整task.result仍要求当前原输入结算；本负责人为执行投影添加 `native_input_request_pending` 分支，只接受原 request_id、R/native、Dispatch与Agent一致的元数据。delivery保unknown/phase unknown，无operation/binding推测，即使传入较早complete结果也保result/authenticated未知。纯规则新增错Agent/Dispatch/子请求拒绝及不升级旧结果，`.verification/openmausbot-capabilities-20261023/observations-r4.log` 7PASS/exit0。execution-observation SHA `2e58f0432502ea5b0c1e63da75f3e27993f9b7b81f3f2d2a1e533766269a56b4`，测试SHA `b6164a55b85789cb73ca8063df20a252ca594a345c87779b3d39dc0a51ba070c`；backend负责真实原inventory/receipt身份与当前fence消费者，06正在合审。

## 能力与实际执行展示补充计划（2026-10-23，基线 2c0fa0f0）

当前 CLI 的 run/wait/strict/退出码/export、GUI 同 Run 查询、原请求去重、递归 work/consult/notify 与角色/讨论持久化已有实现。原 N4 已观察四个 Pi Worker、真实孙任务及自动释放，但整轮验收失败；正式并发、计划停止隔离、父任务继续汇总、GUI 同 Run 与 N6 仍按 STATUS 保留未验范围。角色 SQLite/CAS 和界面规则检查已通过，角色关联真实 Run 的浏览器操作未完成。图片和运行中模型切换当前明确 unavailable；讨论追加只存记录，不自动发送给 Worker。CLI wait 重连同一 Run 不等于原生 Agent 会话恢复。

当前缺少的产品行为为：原生恢复明确失败未投影为已有 failed 状态；Worker 详情只有原始 JSON；一个 Agent 的配置/探测异常会中止整个发现列表。这三项须补代码，不能由 N4/N6 通过代替。注册、安装探测、配置、启动/控制和真实成功分别报告；配置存在不代表已登录，账号来源只显示已保存的安全类型，不显示账号配置路径、密钥或人员身份。

适配范围依据 [45 模板与 7 结构化引擎矩阵](../docs/integration/openmausbot/02-agent-matrix.md)：45 个 TUI 模板为上游发现/启动描述；SWA 枚举 7 个结构化注册。Pi、Codex、Claude、OpenCode 已有 SWA 受控账号/版本/ToolsOff/成果政策，其中本轮当前 Linux 真模型成功证据为 Pi/StepFun；Codex、Claude 无本轮匹配账号实测，OpenCode 旧原生实测不能升级为当前产品整轮成功。Grok、OMP 尚缺 SWA 的账号隔离、ToolsOff 和完整成果政策；Antigravity 另有当前 Windows ACP 无 pin、transcriptImport 缺失等原生限制。其余 38 模板没有本轮 SWA 结构化执行入口。“大部分”的分母仍待用户回答，不能用 4/7 作为目标已兑现的判据。

### 最小实现与准确写域

1. `runtime/swa-orca/src/execution-observation.ts`：复用原 `currentInput.submission.rejection` 和原生 `readWholeAgentSessionFailureFact`。只有既有同 request/child request、operation、Dispatch、agent、session、fence、provider chain 核验全部成立，原 journal 明确 rejected/null provider item，且完整 typed fact 明确为原会话 restartFailed + 原生 operation_invalid、details 仅 ownerVerdict exited 的既有恢复拒绝形状时，投影 resume.failed；保留安全固定 source。宽泛错误正文、普通执行失败、首次 startFailed、所有权未知/reconciling、未识别或不完整 refusal 均不能据此升级；不确定的 restartFailed 保持 unknown，原来源无法观察仍沿原拒绝/unknown，不放宽消费者的 fence 检查。
2. `runtime/swa-orca/src/agent-discovery.ts`：只在列表发现时逐 Agent 隔离安装探测和配置读取的局部失败，按固定类别显示缺失、不可读取、配置不可解析或观察未知；不返回原异常正文、配置内容或私有路径。项目/设置/注册快照末核继续整体失败。`selectAgent` 的原错误立即抛出，启动准入不使用容错结果或其他来源。没有 SWA 受控合同的注册明确显示产品启动/控制不可用，原适配器声明单独保留。
3. `web/src/pages/swarm/swaObservation.ts`、`swaObservation.test.ts`、新增 `SwaExecutionDetails.tsx`、`SwaWorkspace.tsx`：读取已有 `worker.show.result.native.execution`，核对 scope 的项目/controller/run 与 native.dispatch.id/runId、当前 Dispatch 后以中文显示实际 Agent/model/provider、账号来源与认证证据、送达/请求身份、恢复/session、启动/控制/结果与模型目录来源。缺少字段和 unknown 清楚显示未验证，保留原件详情。使用现有观察权限及请求生命周期；不新增写命令、不重发未知输入、不开放图片/工具/切模。`worker.show` 未给完整成功结果时，认证和成果仍为 unknown，不能从业务 completed 推断成功。
4. 直接测试文件为 `tests/swa-cli-headless/agent-observations.test.mjs`、`project-capabilities.test.mjs`；记录仅写本任务。Root 协调 `SwaWorkspace.tsx` 独占写域。公共合同、vendor、task-result/native-methods、共享 STATUS/HANDOFF/SPEC、当前 driver 和模型配置均不在写域；若发现必须更改合同或消费者，先提交准确增量范围。

### 局部验证与停止条件

- 原生 typed fact 与纯投影测试核明确拒绝、普通执行失败、首次启动、未知/额外拒绝字段、同 R/operation/fence/session/provider 不匹配；使用真实类型解析器，纯规则输入不称为实际恢复。当前无真实恢复失败原件时，该原生动态分支保持未验。
- 发现局部检查用真实临时目录及文件读取验证配置损坏、缺失与固定安全原因；测试同一实际局部错误在发现模式转为 observation、在选择模式原样抛出。原项目目录/设置快照检查继续执行，不用假 Agent/CLI/API 或替代凭据。
- Web 现有纯 DTO 解码用例增加同项目/Controller/Dispatch 和未知状态保护；实际 React 组件静态渲染检查中文事实和未知标签，明确只是组件呈现，不冒充真实 HTTP/模型。跑受影响 Node 测试、现有 Vitest 文件、指定 ESLint、Web tsc 与 runtime strict 一次；未修改程序不重复验证。
- 本批不启动服务或模型、不运行 N4/N6、不执行完整构建。发生失败先报告最小复现、原诊断与局部修复验证。Root 后续以新准确产品来源安排必要真实集成；不能复用旧候选模型成功宣称本批新源已验。

### 本补充批实施与局部结果

Root 已确认上述九路径独占，06 已独立接受计划。现已完成三项改动：原 journal 的完整拒绝事实按唯一明确恢复拒绝形状投影 failed；发现中的局部安装/配置异常返回固定安全类别，选择路径直接抛出原异常；Worker 页面按同项目/Controller/Run/Dispatch 与原选择来源显示实际选择、认证/结果证据、送达、恢复和模型目录。没有 SWA 受控合同的 Grok/OMP/Antigravity 明确显示产品操作不可用，保留原注册与适配器特性声明。原始详情继续可读，原请求恢复/锁和实际启动的权限门均保留。

在 `.verification/cloud-setup/activate.sh` 的实际 Node 24.16.0 下，本批首轮局部检查全部退出 0；日志目录 `.verification/agent-observation-followup-20261023/`：

- `node --test tests/swa-cli-headless/agent-observations.test.mjs tests/swa-cli-headless/project-capabilities.test.mjs`：12 PASS、0 skipped；`node-r1.log`，实际 session 17898 完成 chunk c38848。范围为真实生产定义/typed fact 规则九项与实际目录/文件读取三项，无 registry、CLI 或模型替身。
- `pnpm --dir web exec vitest run src/pages/swarm/swaObservation.test.ts`：13 PASS；`web-vitest-r1.log`，session 61435 完成 chunk 023060。新增同范围/选择/会话/送达来源拒绝和实际 React 静态文字呈现；明确没有真实 HTTP 或浏览器执行。
- `pnpm --dir web exec tsc -b --pretty false`：`web-tsc-r1.log`，session 67729 完成 chunk 39726b；`pnpm run typecheck:swa`：`runtime-strict-r1.log`，session 40466 完成 chunk 01711d；二者实际退出 0。
- 四个改动 Web 文件的指定 ESLint：`web-eslint-r1.log`，session 95442 完成 chunk 749a8c，实际退出 0；本批路径 `git diff --check` 退出 0。

本批没有失败重跑、服务/模型启动或完整构建。真实原生恢复拒绝、登录/模型访问、全部 Agent 发现整合、浏览器同 Run 交互与新的产品候选验收仍未由本局部结果证明；原 N4/N6 和 Windows 结果继续按 STATUS。需要回答的 Run 会显示问题和独立退出码，当前公共入口没有直接回答原生问题的写动作，Root 已明确本批不新增该合同。

Root 界面审读要求把内部标识移入详情，已落实：主区域使用可读中文账号来源与阶段/依据，adapter class、原账号 kind、原请求/operation/session、原 reason 和 native source 放在折叠详情，完整原件入口保留。原 React 用例增加主区域不包含这些内部标识的检查。仅对本次呈现变化执行 `web-vitest-r2.log`（13 PASS）、两个变更 Web 文件的 `web-eslint-r2.log` 与 Web `web-tsc-r2.log`；串行 session 45400 完成 chunk 35b2eb，三步全部退出 0。运行时未再改动，复用 R1 已通过结果。

06 末审发现 UI 原选择比较缺少 execution_mode。最小复现为 selected.execution_mode=structured、source.selection.execution_mode 缺失或 terminal，其他字段相同；旧 parser 仅验证 selected 为 structured，原纯 DTO 参数也缺原 source 的该字段。现同选择判断补双方 mode 相等，原参数补实际字段，原选择拒绝用例补两种情况。仅复验现有 Web Vitest（`web-vitest-r3.log`，13 PASS）、受影响 parser/test 的 ESLint 与 Web tsc（`web-eslint-r3.log`、`web-tsc-r3.log`）；串行 session 21832 完成 chunk 1656ea，三步实际退出 0。backend 与原 strict 结果保持，未进行完整构建或模型调用。
