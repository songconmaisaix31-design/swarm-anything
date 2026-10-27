# 产品拆分与完整任务交付审查计划

日期：2026-10-23。Reviewer：`/root/acceptance_audit`。基线：`11619d72f08c163f159a4f4befe270806b1b67ea`，分支 `integration/swa-task-cards`。本文件仅记录独立验收条件及计划审查，不编写业务实现，不代表新功能已经通过。

## 依据与本轮授权

已读取根 `AGENTS.md`、`docs/CODING.md`、`docs/RESOURCES.md`、当前 STATUS/HANDOFF/QUESTIONS，以及 [本轮完整任务](swa-evolution-20261023.md)。新用户要求拆分产品，覆盖旧文档的默认不拆分规则；用户已确认两个独立项目/仓库，SWA 只保留必要集成。Root 已确定 Astrocyte 负责认知、知识经验、MCP 与 sleep，Attention Mirror 负责资料沉淀、品味与机会，SWA 负责执行。独立 composition、空间归属及共享合同先实施，实际抽取仓库随后按明确写域完成。

用户已明确开始清理并测试 N>3，既有 StepFun、费用不设上限、四份固定公开输入和 ToolsOff 范围延续。负责人可以在此范围内准备当前真实安装、创建本次测试项目与必要授权、运行 N=4/N=6 并正常清理本次所属资源；不要求用户逐个 SHA 再次批准。实际服务仍须验证当前项目权限、Grant、来源、实际安装及存活身份。新请求不复活已过期的 055b/4244 包、旧 token、旧运行身份或未知请求，不从咨询参考文档取得权限。

精确执行包、当前 live owner 与独立 SOURCE 核验继续承担真实消费者的技术校验；需要更新包时更新其实际来源与数量，不把旧 helper 的固定 N3 合同当作本轮业务限制。只有执行超出已授权资料、工具、供应商或不可逆外部动作时才提出具体缺失决定。清理首先处理产品源码和入口；原用户数据、原账号、安装物与失败原件不能因目录名称相近而批量删除。

当前历史事实继续保留：Windows CLI `1d3006fe` 完整标准 driver 通过，Linux 安装为不同来源 `aefe6c4b`；这些结果不能证明拆分后的候选或真实 N>3 通过。旧 held 基线已由负责人报告正常 EOF 与最终双空结算；旧截止记录和包仍不能证明新时点服务存活或取得新测试结果。

## 共享合同必须满足的条件

| 边界 | 独立验收条件 |
| --- | --- |
| Run 与递归任务 | 现有 Run/Task/Dispatch 继续拥有执行状态。提交目标后真实启动主执行者，controller helper 的存在不能代替主 Agent。递归关系来自实际父任务关联；同项目不同 Run、孤立 Dispatch 及循环关系不得混入。动态子任务创建与主任务收尾使用同一后端一致性规则，不能因一次快照暂时没有子任务就宣布完成。 |
| 稳定提交与重连 | 同一请求 ID、相同输入只产生一次工作；内容变化拒绝。阶段身份复用现有请求记录。送达未知后查询原请求，不能新建 ID 再提交。wait 只重连准确 Run/root/controller；服务暂时断开不切到最新任务。 |
| 终态与退出 | 提交成功、主 turn 结束、递归工作完成、成果可读取及资源释放分别按实际事实表示。需要用户回答、等待超时、任务失败和 CLI 等待取消使用不同退出状态；Ctrl-C/timeout 只结束等待，显式 stop 才改变执行。跨状态同时发生时的选择顺序由后端合同一次规定，CLI 与 GUI 共用。 |
| 严格失败与进度 | strict 对本 Run 完整递归 Task 集合的任一失败生效，不新增“必需子任务”筛选。consult 若有 Task 也按其真实状态计入；没有 Task 的 notify 不计入任务完成。进度显示实际已完成数、总数及阻塞原因；动态总数可以变化，不能预写假百分比或将未知计为成功。 |
| CLI、GUI 与导出 | CLI 与 GUI 消费同一后端快照和成果合同，不能各自推断终态。导出包含完整递归集合、结果和实际产物引用；分页、库存上限、深度与截断必须有明确结果，不得静默漏孙任务。导出只读取获准来源，独占创建目标，失败保留 partial，秘密不进入导出。 |
| work/consult/notify | work 委派实际工作；consult 只在获准咨询上下文内回答，不启动受委派的文件、命令或其它外部副作用；notify 只通知，不触发隐藏执行或产生等待中的子任务。模式由生产准入和真实工具能力约束，不能只依靠 prompt。来源、父任务、接收者、完成条件与返回方式均可由原记录定位。 |
| 父任务继续 | 子任务提交、审查接受及最终完成分别记录。真实终态通知复用原持久邮件与唤醒；入队回执不等于父任务已经读取和汇总。重复通知和重连不会重复执行工作；父任务正在运行、暂离线及已关闭时均有明确处理。 |
| Role/Session/Task/Worker | Role 保存可复用职责、默认 Agent、技能和长期知识；Session 保存讨论与追加要求；Task 保存目标、依赖、验收和成果；Worker 保存实际进程及原生会话身份。角色复用不复用旧进程或 Grant；长期知识不提升为权限，私有上下文不能自动跨项目继承。 |
| 能力与实际选择 | installed、launchable、control 与 executed 分别保存观察来源和原因，unknown 不补成支持。图片、工具、模型切换和恢复分别声明。恢复原会话、重新创建和失败保留不同身份语义。真实 Agent、provider/model、非秘密账号状态和 native session 在启动、运行和结果中保持一致；不得保存密钥正文。 |
| 授权与效果末核 | 发现不授权启动；旧能力快照不能替代效果前的当前 Grant、设置、来源和身份核验。咨询模式或工具限制变化必须影响真正调用。追加输入区分已送达、明确未送达、未知；无新的真实 accepted 事实不能把写回调或 ACK 当作接收成功。 |

共享 JSON/Go/TS、HTTP、runtime 及 GUI 的直接消费者由 Root 与后端负责人一次冻结。公开字段、错误码、状态及兼容行为完整后即可并行实现，不为普通内部命名重复设置批准步骤。

## 产品拆分的验收

1. 每个产品具有独立开发、构建、安装、启动和必要测试入口。实际生产依赖闭包能说明归属；入口改名和条件开关不等于拆分完成。SWA 不隐式组装或启动 Attention 的资料、认知 worker，也不依赖另一产品的 checkout、私有目录或运行中服务。
2. 项目空间属于 Workspace。现有 `attention_project_spaces` 名称、项目引用、成员权限及同库事务按真实业务处理，不能据表名前缀直接移动或删除。首批可以沿原物理表提供 Workspace 服务，真实数据库拆分另有完整迁移和提交语义。
3. `cmd/server/orca_runtime.go`、HTTP 服务组装、SQLite 存储和项目引用桥必须同步消费正确服务。可选资料引用在未配置时明确不可用，直接项目任务仍可用；不能造空成功结果掩盖集成缺席。
4. 新迁移使用真实独占 SQLite 验证旧数据的 ID、版本、外键、授权和幂等回执；已应用迁移不改写。跨产品事务若离开同库，必须先定义并验证失败时状态，不能假定原原子性仍存在。此要求不授权自动迁移真实用户数据库。
5. CLI/HTTP 的现有服务标识和安装路径是直接消费者合同。当前授权 helper 仍精确检查 health 的 `service: astrocyte`；需要改变时必须同时更新真正消费者，不能全仓替换名称后依靠旧安装结果验收。
6. SWA 前端只默认加载本产品入口，另外两产品有真实独立资产和导航。共用包只保留必要能力，不复制第二份任务、授权或完成状态。许可证、源历史及原失败记录保持可追溯。

## N>3 的必要真实场景

当前源码中 `authorize-installed/main.go` 的 `fixedProfile` 要求 `Workers == 3`，`runDriver` 写死 `--workers 3`；`tests/swa-product-acceptance/run-installed.mjs` 的 Linux Pi target 也限定三者。必须连同真实公开输入定义、任务席位和全部消费者修改，不能只修改报告标题或传参。

- 使用新候选的真实安装完成 N=4 与 N=6；每场明确所选 Agent、模型、工具合同和当前可用账号。测试主执行者、Reviewer 等占用席位是否计入 N 必须在合同中明确，不能一面声称六 Worker，一面只启动六条命令或把预约席位当活跃执行者。
- 每个 Worker 有独立真实 Task/Dispatch/native session/HOME/进程身份及原输入绑定。实际流的共同时间区间证明全 N 重叠；只统计 active 标签、PID 或错开的两两重叠不成立。
- 真实输出期间指定停止一个 Worker，验证该原生 incarnation 正常收尾，其余 N-1 全部继续产生真实输出；追加输入沿一个原生会话完成，不能另建会话冒充恢复。活动停止使用当前 stop 权限，不要求失效的模型输入批准代替清理权限。
- 每个成果与原请求、accepted 输入、最新追加输入、真实原生原件和 journal 对应；停止者如实标记 incomplete，不能用最终一段 assistant 文本代替完整结果。递归任务与 Run CLI 的等待和导出也须在实际场景中覆盖。
- 真实权限撤销、容量拒绝、需要回答、断线或执行失败按变更选择必要场景；错误结果不能由伪造 Agent/API/协议帧构造。发生未知时保留原请求并停止新写入，完成真实资源清理。
- 最后核全部所属 Worker、controller、runtime 和本次服务正常退出及原生树证明。Windows 与 Linux 分别报告；缺少平台或账号的部分保持未运行，不影响已授权且可完成的另一条路线。

## 验证顺序和复用

先审 Worker 的明确接口及实际 write_paths，再做对应实现与定向验证；依赖边界变更运行现有 architecture 检查，共享契约变更运行真实生成器与适用验证器。纯参数、真实普通文件和 SQLite 规则可以局部验证；真实原生执行、模型、递归状态和正常退出必须由相应生产链提供。不得使用 mock 或伪原生成功事件。

同源且未受影响的合同、源码和组件结果可以复用。现有 Windows 完整候选、Linux D12、纯协议实际 DTO 和 N3 驱动局部结果仅保留各自范围；不因新文档再次运行旧程序，也不据此跳过拆分后安装、N4/N6 或新递归流程。先完成必要局部检查，再做整合构建；失败先报告最小复现、根因证据与局部验证，之后再启动下一完整构建。

报告沿现有任务、请求回执、原生 journal、实际安装记录和普通命令日志，包含准确源码、实际命令及结果即可。不新增调度器、通用 Attempt、Manifest、Hash 账本或完成证明服务，不要求为每次普通内部调用独立建设一层证据系统。

## ToolsOff 主执行者的真实闭环

Run 的完整后端视图可以先独立实施，但它不能补上尚不存在的执行路径。ToolsOff 原生模型无法通过文件或命令工具自行调用委派 CLI、发送 `worker_done` 或批准成果。controller helper 存活、主 Agent 输出计划或文字“完成”都不构成这些动作的真实结果。

本轮固定公开任务可以由当前获准宿主消费已批准的任务图，通过原生 Task/Dispatch、输入和结算入口真实执行；候选计划和模型成果仍经过当前范围、角色、父任务及真实 Reviewer 验证，正常结算后才唤醒父任务。该路径复用原请求和状态，不新增状态权威。咨询和通知保持各自权限。

通用 goal 到自主递归委派还需要实际可消费的受限宿主动作入口及最终汇总路径。后端负责人和 Root 必须明确该 producer、准入点与消费者；固定图并发成功不能代替这一能力。若所选 Agent 缺少可兑现控制能力，该分支明确 unavailable，继续完成不依赖它的共享视图、角色、CLI 和 N>3 工作。新增宿主接口不能绕过 ToolsOff 偷开原生命令或文件工具，也不能把自由文本直接当作执行批准。

## 当前计划审查与实施准入

| 任务 | 本轮结论 |
| --- | --- |
| product separation | 接受 [拆分计划](swa-product-separation-20261023.md) 首批明确 13 个产品文件及直接真实 fixture：Workspace 唯一空间 SQL、原表/refs/回执/event 保留，Attention 显式端口委派，HTTP 三入口统一，SWA 移除 Attention/objects/reader 组装，同连接事务与真实权限验证。可以立即实施；该批不代表两个仓库已独立。 |
| run_cli | 参数、稳定请求、只读重连、独立退出、导出和真实测试方向接受。原 Worker 已修正 strict 覆盖全部递归失败及动态孙任务一致快照要求。冻结后端 DTO 后即可按原计划 CLI 独占域实施。 |
| capabilities | 接受 [能力计划](swa-agent-capabilities-20261023.md) 的独占 schema/发现/纯投影/对应测试域。same-account savedOnly、实际 accepted 加 provider 身份、原恢复 chain、旧记录兼容及新生产者必填均已规定；authenticated 初始 unknown，不由目录或配置推断认证成功。可以实施，真实正向仍须相应来源。 |
| collaboration model | 接受 [协作计划](swa-collaboration-model-20261023.md) 及首批 `run-view.ts` 与真实 OrchestrationDb 测试：同事务完整递归、未知/问题/资源门、无截断。Role/Conversation 不保存第二份执行状态。端到端主动委派及父汇总按上节补真实宿主路径，不由只读聚合宣称完成。 |
| N>3/release | 接受 [N4/N6 计划](swa-concurrency-20261023.md) 的原七个验收源码路径，并补入直接消费者 `authorize-installed/public-case-preflight.mjs`。该消费者原来固定 `publicCase(3)`，现须让已核 profile 的 N 贯通并核回报数量；缺省三者的旧调用保留。保旧 Codex/N3，固定 Pi N4/N6、槽位四同会话追加、完整来源和关闭门。新授权成立；旧过期包不复用，同候选 Run/角色的最终实际联调仍必要。 |
| Root Go/合同/GUI | 接受总计划中的三阶段 Run 组合及独占域。首副作用前完成 spec/input、选择及权限准入，首原生 receipt 绑定原提交内容与文件版本；后阶段使用同一快照或变化拒绝，方法/项目/调用者不混用同 UUID。每阶段当前权限、unknown 不重放、原完成回执返回同身份必须由实际源码和生产链验证。 |

源码审查针对准确提交和直接消费者，退回问题由原 Worker 修复。Reviewer 不编写业务代码；后续局部结论逐项记录如下，整体实现、构建、真实模型及 N>3 结果均未验。

## 后续局部审查记录

- 能力独占源码已限定接受：`agent-discovery.ts` 摘要 `6b3fc09a`、`execution-observation.ts` 摘要 `45fac782`，以及测试 `134972b5`、`7db0ba1e`；共享 `contracts.ts` 只审能力块。声明、配置、目录、认证、送达和恢复投影未发现新增阻断。R1 的依赖解析失败保留；R2 两项真实文件规则、R3 六项纯投影通过的工具返回副本已读取，明确没有冒称进程原写日志或原生正向验证。实际同账号 savedOnly、当前 fence、完整原生成果调用方接线仍待整合审查。
- Role/Conversation GUI 短计划接受：使用已冻结 observe/start/send 权限、当前项目版本、CAS、原 UUID 恢复和显式引用；append 只保存讨论草稿。共享 DTO 先给消费者，真实服务交互仍须验证。
- `run-view.ts` 首稿发现读取前界限顺序缺口：Dispatch 先 `all` 再检查数量，Question/pending 也在整体 JSON 大小检查前分配。已交原 Worker 用实际数量/字节前界或有界遍历修复，不能静默截断。原真实 SQLite 六项结果不代替该受影响分支；后继准确源码及必要局部检查另审。
- 自动 journal 订阅结算方案必须区分 `execution_completed` 与 `acceptance=unreviewed`，保留真实完整 reader、原请求和事务末次库存/序列/current Grant/fence 门。未审结果不能自动成为 accepted，订阅重复或回放不能重复副作用。
- 接受 Root 已授权的四个旧解包生成副本清理计划：e148/689/117/875 的精确 packages 目录，执行前刷新普通路径、UID/权限及当前活进程引用检查。保留 tar/SHA、dist、独立安装、日志、aefe 及所有失败/partial；归档内容一致与 45 项原权限差异分别记录。此为删除范围接受，实际清理结果由负责人随后报告。
- N4/N6 首批八个源码文件已按 `n46-driver-20261023-01/sources-final.sha256` 限定接受，原选择、来源、停止、未知和完整成果门未放宽。已读两个纯选择检查、Go 两组与 24 项字段拒绝、真实公开 N4/N6 准备及消费者逐字核对、新默认三者兼容结果；实际 Run/角色/交接消费及模型并发仍未验证。
- Root Go 三阶段提交两项返修已限定接受：`OrcaRunSubmission.SpecInput/LeadInput` 保存实际 path/version/text，后阶段整体比较；复用已完成 task.create 原回执时幂等补回同项目 Run 关联，沿原存储冲突门失败停止。真实 ProjectFiles 等长改字并恢复 mtime 的测试证明相同旧 Version 不能掩盖内容变化。spec 内角色与讨论先归一到预检命令，lead 带准确角色版本；真实原生阶段恢复和模型尚未运行。对应 `orca_run.go` 摘要 `38cfab11`、`orca_execution.go` 摘要 `9f5ce4f6`，新增实际文件测试 `27aff466`，其余 Go/HTTP 本批来源已交 Root。
- 接受独立 Astrocyte 第二批计划，仅新增 `/workspace/astrocyte/**` 与原 Worker 任务文件：认知 app/domain/SQLite/MCP/events 解析/sleep 闭包、原六迁移及最小 receipt/schema 补齐；不复制 SWA 状态与资料服务，不使用本地 replace/go.work/软链接。独立 Go 构建、真实 SQLite/MCP 五工具及实际依赖闭包须后继验证，本计划不宣称新仓已完成。
- 同 Run 的 N4/N6 驱动增量方向接受：原 lead 计入 N、正式提交事件与原 outer R/阶段回执双核，再补 N−1；独立等待上界、同身份 wait/export、项目内角色复用与能力摘要均消费真实合同。至少一个现有 peer 须绑定真实非 root 父 Task，实际形成孙任务。停止 lead 的场景不能证明父 Agent 收到子成果后继续；真实父 resume 仍须有可继续的父及实际消费者后联合验证，queued 不代替 continued。
- Astrocyte 独立仓 `ce16b291ef01ecf6d3f55a4cefd3e79ea30c6244` 的认知命令闭包限定接受。已逐一比较 tracked 原件与旧 `11619d72`：既有认知源码、适用测试与六迁移保持原字节，变更集中于独立默认目录、必要纯元数据/错误提取、新 `029` 和依赖/说明。已读取实际 SQLite 公开 README 原件、重放/重开/同来源变更拒绝和未授权知识读取测试，以及本仓测试、Linux 两命令构建和本地十包依赖日志。既有 MCP/sleep 输入仍按本地合同用例解释，不冒称真实 Agent 事件；HTTP、GUI、自动来源采集、外部完成桥接、Windows 原生和模型仍未验。
- 接受 Attention Mirror 第三批计划 `99268174` 的新仓资料、HTTP 与前端实施域。原 `027_openviking` 引用 Workspace 空间外键，保全原字节但不在独立新库应用，不装配提交服务；未配置显式集成不返回空成功，不静默移除旧外键。本批不迁移真实用户数据，原 SWA 只读。
- 接受 SWA 前端计划 `fca9a3e1` 与独立 server 计划的具体闭包实施域：共享 HTTP/读取状态抽取不改变身份、CSRF、幂等和未知语义；生产资产与 Go 实际依赖不能继续包含旧产品。旧源码保全前不删。新 server 如改变机器健康服务标识，须同步原安装 helper、owner 与 smoke 的真实直接消费者，或保留当前协议标识，不能单侧改名。
- 父恢复准入末节 `e0f995e4` 限定接受：内部六字段 handoff 不进入公开 command；固定完成 mail ID，marker/path/version/body 与原邮件一致。Go 当前 caller（包括 human）不借跨 creator 例外，原 send/external/Grant/scope/context 仍必核；native 从真实 DB 核父子、终态、Dispatch 与代次。Go 局部真实 SQLite 只证明准入，N6 的实际 provider 接受及父继续另证。
- Role GUI 首稿退回一处 hook 组合缺口：普通无原 UUID 回执的 HTTP 4xx 经通用 hook 会解锁，不能据纯 outcome 测试宣称保持 unknown。原 owner 已在本地 wrapper 把未证错误保持未知，并加入调用真实分类函数的规则测试；最终精确源清单后复验。父界面已有清除本次角色/讨论关联的实际入口，无需扩大公共 callback 合同。
- N6 后继场景接受停止非 lead 槽位二，保持真实父 lead；槽位四作为其实际子任务，原产品 `reply_mode=resume` 产生 lead 同会话第二轮，替代额外手工模型轮。N4 保留停止 lead 与槽位四手工追加。孙任务必须来自既有席位的真实父关联，不增 N；邮件 queued 不等于 lead 实际继续。
- 上条 N4 的后继实际消费者修正：Run 逐叶完成后会自动释放，故 N4 同样保留 lead、停止槽位二；在真实孙任务仍未终态且 lead 原 Worker 活着时手工追加 lead。N6 使用原生父恢复。自动释放读取本次唯一 system release 原 R/真实 receipt，继续核原资源、released ownerFence、完整 D 与 PID 缺席；不能伪装成 driver.stop 回执。活动 stop 仍逐原 driver 回复、同 cycle 取消及真实 incarnation 核验；实际未出现追加窗口时保持失败或未验。
- Roles 四源返修最终限定接受：`SwaRoles.tsx` 摘要 `e2d5917b`、`swaRoles.ts` 摘要 `9f3131de`、测试 `3f171431`、CSS `0f3a21b0`。未证错误 wrapper 保持 unknown，直接调用原 hook 分类的规则用例已读，R3 五项通过。读权限 DOM 的两项实际通过不代表角色写入、CAS 或真实原请求恢复已经完成。
- 父 handoff Go 源码 `orca_execution.go` 摘要 `f9795602`、新 `orca_handoff.go` 摘要 `3894fa9f`、测试 `8c276b3b` 及共享 invocation 块 `29291f3b` 限定接受；23 项准入规则与原 Go 回归日志实际退出 0，仅证明权限段。`initial_workers` 指针区分省略与零，后继统一 decoder 又拒绝显式 null；`execution a0239137`、`run ef814eb1`、测试 `bfa5bbbb` 的七个实际 decoder wire case 及局部 0 已核。
- Workspace 首批 13 生产接缝及直接真实 fixture 已限定接受：唯一空间 SQL、Attention 显式委派、原空间/refs/回执/event 及同库事务保持，独立 HTTP 缺集成拒绝、SWA 不实例化 Attention。R1 缺输出目录、R2 缺 Registry 的原失败保留；有效 SQLite/HTTP/真实权限测试、无执行的全 Go 编译与 47 包架构检查均按原范围接受。后继 sqlitebase/swastore 正在修改相同旧文件，首批接受不覆盖迁出后的新字节，最终集成另核。
- CLI 四源 `main50288066`、`output0888f2dd`、`run_flow7fe0928d`、测试 `0bda9574` 限定接受。单次提交与原 R、同一 Run 的只读等待、递归失败、8/9/130 等退出、独占导出和完整 native result 前置已核；Go R5 通过及真实文件负向不代模型路径。Run GUI 主体 `238a1684/7f1d2bb5/128f0fd9/abfdd91d` 未见新增业务阻断；独立 transport 的后继 import 与新 server DOM 另验。
- 新逐叶自动结算的 lead 选择错误已由原 Worker 关闭：沿首 controllerOpen 保存的 `submission.worker_request_id` 与原 worker.start receipt 精确定位 task/dispatch，不使用首行或 UUID 排序。完整结果核验后的成功结算改用原 `settleWorkerReportInTransaction`，真实 SQLite 窄测证明原 `completeDispatch` 会将 ready Worker 标为 abandoned，以及新路径的回滚和提交行为。
- Astrocyte 工作台补完计划 `f08c9519` 限定接受：新增独立认知 snapshot/Reader、七个只读端点及 session、最小 OpenAPI 依赖和认知 GUI。已核 TodayView 原有 SWA Relay 面板依赖，独立入口不导入该面板；快照缺失明确不可用，不回退 live DB。生产 MCP 本次事件到实际 snapshot/HTTP/DOM 的验证计划合理。各 loopback 产品不同端口不隔离 cookie，新产品必须使用独立 cookie 名称；该实现边界已交 Root，不增加新的批准流程。既有未修改 MCP/sleep 结果复用。
- 独立 SWA server 最终 39 路径及架构 R2 差分限定接受：`source-manifest-r1.sha256` 中 38 项匹配，架构项以 `source-manifest-r2-delta.sha256` 的 `ecbfe56f` 替代原摘要，不将旧清单报告为全部通过。`sqlitebase`、`projectfiles`、`swastore` 复用原实现，旧存储显式委派且保持同连接事务；新库只创建本产品所需表，旧数据库的资料表、原始引用和回执保持。新 HTTP 只装配项目空间、项目权限、Orca 与原会话防护；开发入口无原生运行时则明确不可用，installed 仍要求原 owner。实际 SQLite、引用迁移、HTTP、开发 listener 和两个主动入口的架构检查已按日志核验；Windows 只交叉编译。旧 storage R2 整条命令因误选实际 Codex Probe 用例退出 1，其余通过项不扩写为整条通过；未对该未知原 R 重试。
- Native Run/Role/handoff 最终源码限定接受：`run-settlement 9a91d20e`、`run-view 14e5a90d`、`collaboration-records 2e2491e3`、`native-methods 3a7381d4`、`task-result 273a2792` 及对应 controller、准入、输入、host/client 接线。逐叶结算继续核全 Run 库存、实际最新 accepted 输入、原始完整结果和原释放门；父恢复只消费原完成邮件、内部结算回执与当前 Go 准入后的原 worker.send。原邮箱会在 idle 时自动投递，因此通知和完成邮件均固定原 `audit_only`，通知回报 stored，不能据此声称父已经读取或继续。
- 角色当前版本在原 reserve 的 `BEGIN IMMEDIATE` 内、checkpoint 前重新解析原引用并与将保存的快照逐字比较，关闭异步准入期间更新或归档的缺口；接受后的历史快照保持。观察 Worker 的 pending 输入使用原 R/子 R/Dispatch 元数据返回 unknown，不伪造 binding；完整结果仍严格拒绝未结算输入。真实 SQLite 13 项、成功结算 1 项、audit-only 2 项、角色事务 1 项以及最后 strict 均按原工具输出记录，不冒称另有直写日志。能力 pending 七项纯规则检查不代表原生输入已接受。真实父继续、原生自动释放和 N4/N6 仍须后继生产链验收。
- N4/N6 第二批四源由独立 capabilities Reviewer 完整核验并限定接受，清单为 `n46-run-integration-20261023-02/sources-r2.sha256`：同 Run、真实孙任务、原 R 不重发、非 lead 活动停止、剩余 Worker 后续 delta、原自动释放与完整来源门、N6 原邮件到同会话第二轮、wait/export 全递归消费者未见确定阻断。其局部语法与公开输入校验保持各自范围，新安装和实际 N 尚未运行。
- Astrocyte 工作台 `4b2a3594` 加合同修正 `eee376be` 已由独立 release_audit Reviewer 限定接受。实际 cookie 名称与七 GET 的 OpenAPI 安全定义一致，旧 Agent/Attention 描述已移除；八个原 Reader/contracts/snapshot 文件保持原字节。R4 实际 MCP 事件到 snapshot、七 API 和 DOM 的一个事件、源数据库字节不变及服务正常 EOF 已核验，旧三次失败保留。该结果不扩大为 Windows 原生或真实 Agent 模型验证。
- SWA 前端保全后剪源计划限定接受：资料原件在 Attention Mirror `dcec2cf2/b0782ab`，认知原件在 Astrocyte `4b2a3594`；Relay 显示、格式和三个原测试移到 Workspace，旧 EventTable/CSS 与直接 imports 使用中立组件。仅删除明确保全且未进入 SWA 主动依赖闭包的旧产品页面，不删除用户数据或验证原件。最终准确源码与必要类型、规则和 production 闭包检查仍由独立 Reviewer 核验，既有真实新 composition HTTP/DOM/dev 生命周期结果不据剪源重复运行。
- CLI 最后差分 `run_flow 62631bcc` 与 `serve 5610b3cc` 限定接受：接受状态和真实 handoffs 必填且进入进度摘要，四处路径检查使用原 `projectfiles.CanonicalRoot` 的同一实现。全部 `cmd/swa` 原测试实际 `ok 1.283s`，依赖日志不包含旧 Attention/Swarm/agents/cognition/sleep/OpenViking。新独立服务 DOM 两项及共享 transport HTTP 检查保持各自实际范围，不代表 Run、角色写入或模型已经执行。
- 后继源码清理以 `644bbe8701ae1b1c30b54f18621c28e03dbf6082` 及完整 tracked 归档 `swa-legacy-source-644bbe87.tar.gz`（SHA256 `f15ed5f24ab202194755a3c215b27555cc1aee5a1c1529f47ce10e49b2a6eaf7`）为来源保存点。清理按路径与真实消费者实施，保存点不证明未迁功能已验收，也不包含用户运行数据库和账号。研究、失败记录和用户数据不随源码搬迁删除。
- 当前 SWA 测试闭包迁配计划限定接受：delivery/handoff/capability 的原权限与同文件变化断言保留，以真实 swastore、Workspace、ProjectFiles 替换旧组合夹具；规则输入用真实 Repository CAS 保存，不伪造 Registry 观察。旧保存点的真实资料服务以公开 LICENSE 生成兼容 SQLite 原件，关闭后由当前 Store 复制、重开、迁移并核原 refs/receipt/locator/摘要，解除默认测试对旧产品生产包的依赖。installed HTTP authority 保持原断言迁包及编译消费者，本批不宣称实际装内运行。架构显式 `--swa/--all`，未知参数拒绝；源码结果待原 owner 冻结后复验。
- Attention Mirror 最终 `5a19745db61015d0fb61cd809bf456a49b693f2c` 的独立源码与第四批由非作者 Root 审查接受，本 Reviewer 复用该独立结论，不重复声明自身逐源核验。显式 summarize 实际版本与 HTML 提取、生产安装资产和 OpenRoot 符号链接拒绝属于已验范围；原 URL 的 DNS 失败保留，Codex 独立 profile 未运行模型。Windows 原生、API key 登录、模型、PDF/媒体和 OpenViking 仍未验。
- 默认 check/CI 归属增量由独立 release_audit Reviewer 审查后限定接受计划。完整当前 SWA 包及明确 Orca/Workspace 测试选择覆盖实际 Delivery、Run、Role、Handoff、TaskSpec 和准入规则；真实装内权限例必须先迁到 swahttp，安装专用和模型验证保留发行入口。Web 保留当前规则并新增真实 SWA transport 会话、取消、Agent 身份、CSRF/单次幂等和连接失败检查，共用 ApiError 身份在原实际错误上核验。两平台 SWA Playwright、开发/停止及五个 headless 非模型入口保持；旧 Relay 缺环境项明确未运行。summarize 移出默认依赖及启动链时其余固定 pin、库存与 frozen lock 保持，旧工具原件保全；草稿不据此提前获得源码接受。
- Astrocyte 事件解析与显式导入计划 `8f961808` 限定接受，仅写新仓所列 parser、单文件 CLI、依赖和文档。复用原映射、原始字节/稳定 origin 与 EventService 的整批事务；明确根/项目、1 MiB/128 来源行与任一无效整批拒绝，不扫描历史或打开来源产品 SQLite。`repository_observation.go` 含固定 Git introspection，CLI 按计划只消费原 Replay/Map 入口，不误用会调用 Git 的 NativeSemanticMapper。原 parser 字面量只证明格式规则，真实本仓 Git 导入/SQLite 回执重放与冲突回滚另验；不宣称真实 Agent 执行、自动采集或 dynamics 已应用。
- 旧 Go/SQL 移出清单原 686 项包含两个公开研究 `testdata` 文件，原清单不接受。排除所有 `/testdata/` 后的 684 项限定准入：文本清单 SHA256 `0e67eed8f38e0f183a6c40e1eb997bb68ee499726eb782753ff380671eb112b8`，配套 JSON `ba505d535da28894977f5bc11d117b9494e9e72265e4c19b59ccf6dce96d8412`。独立用 Git 核当前 684 个唯一文件的 blob，全部与 `644bbe87` 各自原件一致。当前 SWA 两命令、新适配器、Workspace/Swarm 生产、judgment 端口、独立迁移和 headless/N 驱动均保留；16 个旧 Workspace fixture 随旧组合来源保全。Root 仅按此清单用文件补丁移出，公开输入、研究数据、安装、账号和失败证据不在删除域。迁配后当前测试的真实局部结果和最终依赖/编译仍须核验，本准入不将旧组合或科研功能算作新产品已迁入。
- 当前测试迁配最终 `current-tests-source-manifest-r1.sha256` 的 17 项源码和公开旧库原件全部实际摘要匹配，限定接受。已核 Store/FS 六项通过、准入 R1 六成功与两失败的原范围及只重跑失败项的 R2 全通过、installed Web 编译失败和未认证 403 的原失败，再核实际会话后 404 与正常 Shutdown 的 R3 通过；路径负向复用 R2。当前 swahttp 两项、架构两模式和未知参数拒绝均按原件接受。Windows 三测试包仅交编，装内 authority 未实跑。原 `*.sqlite` 忽略规则不能导致此精确公开兼容库漏提交，也不授权添加任何运行数据库。
- 配套八个非 Go 资源的移出边界限定接受，文本清单摘要 `e558ed576689ccb40033d572a69af2f8df615fc61e5eb68d31639131efd23e57`，JSON `e394418ddf01d4962fa101ab8d9f87560d30c9a0b5ee96c7c415b1f900f9d178`。八件当前 blob 均与 `644bbe87` 一致，六件资料嵌入程序/原测试在 Attention Mirror `5e6e69f4` 的固定提交中同 blob；旧 laya/codegraph 集成按保存点恢复，不算独立新产品实现。未包含数据、fixtures 或许可证。
- Astrocyte 事件导入最终 `426723b5525ec36b1e0c93dd4b6d9eb6e42287f1` 限定源码接受。独立比较固定 `644bbe87`：31 个 Go 原件不变，四个文件只作共享原映射循环和 S1 本地 DTO 适配；新增有界读取、CLI、测试及依赖已核。全部来源解析和显式强度预检在开目标库前，原事务保存回执和 Signals，原件/强度冲突整批回滚。全 Go 日志为 0，目标包复用先前有效局部结果；Linux 产物实际公开 Git 导入两次，SQLite 原字节、同回执 ID、一个事件/信号、零 dynamics 节点均核验。报告的 `source_commit=f402020b` 指被导入的公开 Git 来源，不是新候选代码版本。Windows 仅交编，私有来源、真实 Agent/模型及自动 dynamics 未验。
- 独立 release_audit Reviewer 对最终前端 66 文件限定源码接受，清单 `frontend-sources-r1.sha256` 的摘要为 `f7877d60a515f874aaae7f151813a2c7d98a6fe4bedce3b617ffb4885bff9446`，实际 66 项匹配。独立 App/入口、生产模块门、中立 transport、项目/Grant、Run/Role/Conversation、原 R 未知态恢复与 Relay 移动未见阻断；Vite R3 为 32 个本仓源、46 个总模块。原真实新服务 HTTP 六项、DOM 两项和开发生命周期按原范围接受，缺真实 Relay URL 的两项未运行且原整体退出 1 保留。本接受不含在途默认 check/CI 最终脚本，也不含真实配置后成功 Run、角色写入、模型 N 或新安装。
- 清理后 Go 依赖审计计划限定接受：删除结束后核 Linux/Windows 生产与测试图，再用官方 `tidy -diff` 和 tidy 只移出未使用模块，保留 module、Go 版本与仍需模块原版本；库存直接消费者同批同步。最终空 diff 与 verify 及默认当前 SWA 检查仍须实际完成，不以升级、replace 或排除当前权限测试处理失败。
- 文档收口计划接受。RESOURCES 已明确记载 2026-10-21 用户解除全局固定资源窗口，AGENTS 资源段只引用当前事实源，写域互斥和权限规则保持。CODING 使用当前 Workspace/Swarm 与 `cmd/swa-server`；SPEC 顶部区分旧研究设计和当前 §21.5。STATUS/HANDOFF 分别报告三个独立仓、实际局部结果及 N4/N6/Windows 模型未验，不将源码清理升级为动态验收。
- Attention Mirror 第五批 `58bb6e4454e03db135cabe6de2dec8dfc481aee6` 由非作者 Root 独立审查接受，原 25 测试保全来源为前序 `5e6e69f4`。本批无生产改动，原未知送达分类、规则、文件 scope、对象并发与实际 Node 九项结果按其真实边界接受；可选原件和网络未满足项逐项保留 SKIP，不当作 live 通过。
- Go 依赖最终批 `go.mod 7402d6c3`、`go.sum b090581e`、任务 `514fc26a` 限定接受，三项摘要全部匹配。四个直接依赖的版本、历史 module 与 Go 1.27.2 保持；sync/tools 是原已选版本的显式 indirect，原 why 链经 SQLite/libc 测试到 tools/sync 已核。按 checksum 行集合比较，go.sum 没有新增行，删除 45 行，重排不作为新版本。双平台含测试图、17 包架构、正式 tidy 后空差分和 `all modules verified` 均按实际原件接受。
- Windows combined 候选计划 `52850c30` 限定接受：默认 CLI 保留，edition 贯穿构建、安装、原 serve/web-dir 与实际同端口全部 manifest 资产；字节、MIME、受限 redirect 和读量有界。HTTP 失败仍结算原 child 的正常 EOF、Job、两次 native/CIM，不能以成功退出洗掉检查失败。HTTP 循环消费原 150 秒剩余期限，不能按每件五秒再叠加一个新窗口。必要 Linux 局部只消费真实既存安装的 manifest/文件与未知 edition 的效果前拒绝，不构造成功候选或开启另一服务。
- GUI 一致性计划继任 `39904193` 限定接受，仅 ignored 验收脚本消费同安装 live owner、原提交/阶段 receipt 与 CLI 最终全量视图，真实浏览器建立已授权验收会话，读取 GUI 与实际响应。不得称为用户点击、自动签 Grant 或修改 settings；S 从原 owner/安装资产核，不虚构 API 字段。最终快照只排除 observed_at 后比较，活动快照按同身份与实际状态变化分别判断。缺权限、owner 已过期或来源不符即停止，不新增模型轮或用旧包替代；实际结果仍待当前生产场景。
- 默认检查与构建入口最终 16 源限定接受，清单 `default-sources-r1.sha256` 摘要 `b3928d2df06fe505b6242cd5390c867bbcfaf90252fb2b83e7aaf7e14a3f2e4e`，实际全部匹配。当前 Go 正选测试范围与装内专用排除、两个工作区 filter、SWA Playwright、原 marker/CI-tag 条件及唯一依赖库存均核验；pnpm lock 仅删除 summarize 闭包并把原 undici 标为 optional，没有其它版本升级。实际默认 check、同范围 race、开发 build 和真实 start 均退出 0：生命周期/停止三项、headless 27 项和 Web 28 项，合同 264 示例/生成一致，原 29 警告保留。start 在随机本机端口读取同构建 JS/CSS、会话、空空间、旧 API 404 与完整 SQLite 并正常停止；这不代替发行安装、模型 N 或 Windows 原生运行。
- Root 最终七文档由独立 capabilities Reviewer 限定接受：AGENTS `59a8b52f`、HANDOFF `2076adfa`、STATUS `9066b1d2`、CODING `137d86ca`、SPEC `3e4c3636`、LEGACY `3d3658a2`、总任务 `659dcf0e`。STATUS 两处把已完成默认检查/应用构建仍列为待办的短句已修正。当前 source、三仓提交、公开兼容库和实际结果分别报告；未扩大新安装、N4/N6、Windows 原生、云发布或两个本地仓恢复的未验范围。本次暂存核对确认 Windows 在途三域未进入该清理批、公开研究输入无暂存删除。
- Windows combined 最终三源限定接受：verify `45027f82adec6f53b6ea5b2fd2b2a7fb34349ba919cd88ff204402a1057c1b9b`、lifecycle `d934a6ce8b5a7b0fbd5700af561afc1b03d875f1bf62f5b7a22d64e85879e346`、workflow `1f0628322d4bd2be2ccb10d2e8249a8e980d71249dcbf37cab8d215828c6fe0d`，实际清单三项匹配。默认 CLI 与原 job 谓词保持；combined 沿同安装/web 和原 serve 对全部实际 manifest 引用核 MIME/字节、严格 301 同源根与共享剩余期限，Web 失败后仍沿原 EOF/Job/native/CIM 门并分别保留 FAIL/UNKNOWN。局部实际只读取旧 aefe 安装资产元数据、验证未知 edition 效果前拒绝，以及语法/PSParser/YAML，均按原退出 0 范围接受；没有新 S 的 HTTP、服务、Windows 原生或模型执行。本条之后冻结该 tracked 审查记录，实际新候选结果另存 ignored，验收结束再统一更新事实文档。
