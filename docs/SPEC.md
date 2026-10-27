# SWA 产品规格
## DDD 开发规格

**工作区 · 角色 · 任务 · Agent 执行**

版本：开发中　　日期：2026-10-23　　语言：Go + TypeScript

**任务流程：用户目标与既有项目 → 提案及批准 → 蜂群执行 → 检查与成果 → 用户采用与经验回流。**

用户围绕已有项目提交目标，由同一 Run 保存任务、递归交接和成果。Astrocyte 与 Attention Mirror 分别抽为独立项目；认知、资料与执行的最新归属以及 run/wait/export 合同见 §21.5。历史资料流程和旧 S3 章节保留对应产品语义，其存在不代表 SWA 必须编译或启动另两个产品。当前实现与实际验证范围见 [STATUS](../STATUS.md)，用户决定见 [QUESTIONS](QUESTIONS.md)。

本规格定义新平台的业务规则、接口和开发任务。`docs/SPEC.md` 是开发规格正文；Word 是同版阅读件。修改规格时先改 Markdown，再生成阅读件。

### 开发入口

新会话先读根目录 `AGENTS.md`、`HANDOFF.md` 和 `STATUS.md`，再读当前任务引用的章节。任务格式固定为“目标｜可改路径｜依赖｜验收｜停止点”。当前用户决定及 `AGENTS.md` 约束执行方式；本规格和任务文件提供业务事实。与当前规则冲突的历史执行方式不继续采用。

### 章节导航

| 章节 | 内容 | 主要使用者 |
|---|---|---|
| 01—03 | 产品边界、领域划分、代码依赖 | 所有实现者 |
| 04—06 | 资料沉淀、品味、工作区模型 | 资料与工作区开发 |
| 07—11 | 批准、接续、代码上下文、蜂群、判断 | 后端与适配器开发 |
| 12—15 | Service 契约、API、存储、组件接入 | 集成与基础设施开发 |
| 16—17 | 三页交互、运行与权限 | 前端、后端、复核 |
| 18—21 | 开发习惯、切片任务、验收、迁移 | 主实现 Agent 与复核者 |
| 附录 A—B | 消息示例、接入依据 | 按需读取 |

### 实施方式

当前 SWA 由 `swa-server` 维护 Workspace/Swarm 业务状态，TypeScript 前端提供项目、角色、Run 与 Worker 界面；`swa` CLI 和原生 Node 执行后台共用 Workspace App 准入。Astrocyte、Attention Mirror 各有独立进程、数据库和前端，当前边界见 §21.5，旧混合模块与研究设计按 [LEGACY](LEGACY.md) 保留。实际安装、运行及功能验收由当前任务登记。

已确认的产品约束见第 01 节；工程默认值可以通过短 ADR 调整。涉及自动执行权、资料外发、目标或产品范围的变化，先提交用户决定。

<!-- PAGEBREAK -->

# 01　产品契约与首版边界

### 1.1 已确认的产品约束

| 编号 | 约束 | 实现含义 |
|---|---|---|
| P01 | 资料导入先沉淀；资料整理是可选任务来源 | 导入不会创建执行任务；已有项目目标可以直接筹划，仍经提案与批准 |
| P02 | 先由用户判断品味，再逐步委托 | 按判断职责配置委托；使用时长不自动扩大权限 |
| P03 | 系统可以主动形成提案 | 未关联现有项目的提案也可保存；不得自行创建执行工作树 |
| P04 | 开始工作需要用户批准 | 模型评分、资料准入和任务批准不可互相替代 |
| P05 | 忠于目标完成，兼顾兴趣、改进价值、原创潜力 | 排序保留各维度；研究任务允许以最小验证为完成目标 |
| P06 | 原会话接续和显式上下文交接都要有 | 两条入口分别显示能力、来源和结果，不互相冒充 |
| P07 | 三个模块能独立演进 | Domain/Application 不依赖数据库、HTTP 或模型 SDK |
| P08 | Jev/Laya 可逐步参与蜂群判断 | 共用判断端口，按题型路由，不固定串联两个模型 |
| P09 | 底座保持 Go/TypeScript/SQLite | summarize 等工具可使用所需 Python 依赖；Morphogenesis Python 研究环境独立保留，授权来源见 QUESTIONS |
| P10 | 沿用现有视频总结工具 | 首先适配用户实际导出结果；不另建下载与转录系统 |

### 1.2 首版工程默认值

单用户、单台机器、单一执行环境；Go 核心，React + TypeScript + Vite 前端，SQLite 业务存储；本地网页先行，桌面壳后置。至少接入两个真实 Agent 适配器，优先 Codex、Claude Code；不限制后续新增适配器。

开发环境采用 Windows/PowerShell 主路径，Linux/WSL 单独验证。一个注册项目固定所属环境；不通过路径字符串替换合并 Windows 与 WSL 项目。

### 1.3 首版不做

不采集全天屏幕、麦克风或浏览器历史；不重建 IDE、视频下载器、模型训练框架、通用向量数据库或分布式共识系统；不自动合并主分支、推送、发布或重写全局 Agent 配置。不同电脑之间的协作保留接口，不进入首版交付。

### 1.4 首个使用闭环

资料路径中，用户导入一篇论文和一段已总结的视频，完成整理和跨资料关联，提出现有项目改进，用户准入并批准。直接任务路径中，用户围绕已有项目提交目标，进入既有提案与批准流程。两条路径均由 Agent A 实现，Agent B 接续或复核，结果经过检查并由用户采用或退回。既定 S3 的真实项目、权限、资料和验收依照当前任务与 QUESTIONS，入口整合不代答这些决定。

<!-- PAGEBREAK -->

# 02　统一语言与限界上下文

### 2.1 统一语言

| 名称 | 含义 | 不等同于 |
|---|---|---|
| Material / 资料 | 一个来源及其内容版本 | 用户认可的观点 |
| Distillation / 沉淀 | 对指定版本资料完成的一次整理或关联 | 重复生成相同摘要 |
| Opportunity / 机会 | 有依据、可进一步评估的方向 | 已批准任务 |
| Admission / 准入 | 允许候选进入工作区筹划 | 允许执行 |
| Proposal / 提案 | 目标、范围、成果和资源约束的版本化草案 | 模型的自由文本建议 |
| ApprovalGrant / 批准凭据 | 用户对指定提案版本的执行授权 | 模型判断结果 |
| Project / 项目 | 一个注册仓库或明确工作目录 | 单个 Agent 会话 |
| SessionBinding / 会话绑定 | Agent、原生会话、项目和执行位置的关系 | 全盘发现结果 |
| ContextPacket / 上下文包 | 带来源、版本和权限的交接快照 | 原始聊天拼接 |
| Mission / 目标任务 | 一个批准范围内的执行单元 | 任意新增研究方向 |
| WorkItem / 工作项 | 可以认领、提交和复核的具体工作 | 一个固定 Agent 角色 |
| Experience / 经验 | 有结果和适用条件的可继承记录 | 自动写回系统提示词的指令 |

### 2.2 三个业务上下文

| 上下文 | 拥有的业务数据 | 向外提供 |
|---|---|---|
| Attention | Material、Distillation、Opportunity、TasteProfile、Feedback、Admission | 可检索资料、候选快照、品味策略 |
| Workspace | Project、Goal、Proposal、ApprovalGrant、SessionBinding、ContextPacket、ToolProfile | 项目访问、批准校验、上下文交付、会话管理 |
| Swarm | Mission、WorkItem、Lease、Attempt、Artifact、Experience | 执行进度、认领与提交、结果与经验 |

Judgment 是共享应用能力，不是第四个业务状态中心。它保存判断记录和缓存，不拥有批准、任务终态或品味授权。

### 2.3 上下文之间如何交互

Attention 发布不可变的候选快照，Workspace 将其翻译为自己的 Proposal；Swarm 通过 Workspace 暴露的批准检查端口接受执行请求。Swarm 发布结果，Attention 用结果记录改善后续推荐。

跨上下文只传 ID、版本化 DTO 和事件，不传聚合对象，不写对方数据表。外部工具的字段先由适配器翻译，不把供应商 SDK 类型传进业务层。


<!-- PAGEBREAK -->

# 03　代码分层与依赖规则

### 3.1 保持现有业务结构

```text
cmd/server/                  组装依赖、启动、关闭
internal/
  attention/
    domain/                  对象、状态转换、纯规则
    app/                     用例、消费方端口、事务组织
  workspace/
    domain/
    app/
  swarm/
    domain/
    app/
  judgment/                  判断契约、路由、缓存策略
  adapters/
    httpapi/  mcp/  sqlite/   传输与持久化
    agent/  indexing/        原生工具和仓库知识
    importers/  judgment/    资料导入与模型后端
web/                         React + TypeScript
contracts/                   OpenAPI、版本化消息 Schema
```

Go 按包隔离依赖，现有 `domain` 和 `app` 使用两个包。新增抽象必须对应当前用例，不建立只有转发作用的目录或层次。Go 的 `internal` 目录用于限制包的外部导入。[R01]

### 3.2 允许与禁止的依赖

`domain` 只依赖标准库和极少量纯值类型；不得导入 `database/sql`、HTTP、文件操作、模型 SDK 或其他上下文。时间与随机结果由调用方传入，领域测试不等待真实时钟。

`app` 依赖本上下文的 Domain 及消费方定义的接口；负责鉴权、加载聚合、调用规则、保存、记录事件。它不实例化数据库或模型客户端。

`adapters` 实现 App 所需端口；Composition 在程序入口创建并注入具体实现。CLI/MCP/HTTP 解析、校验 DTO 和映射错误，复用同一 App 业务服务。现有 `cmd/server` 继续组装后台，认知 MCP 沿现有 `cmd/mcp`；后续公共任务入口的组装在对应工作包内实现。

跨上下文的调用通过消费方端口，由组装层注入桥接实现；不允许 app 包互相循环导入。不创建收容所有实体的 `common/models`。

### 3.3 应用服务与领域服务

应用服务完成一个用例，例如 `ApproveProposal`。需要跨多个对象计算的纯规则可成为领域服务，例如 `EvaluateAdmissionPolicy`。CRUD 包装不命名为领域服务；有规则的状态变更必须经过聚合方法。

只有进程外边界需要序列化 Schema。进程内端口使用 Go 类型，不为每次函数调用套通用消息总线。新增接口必须对应一个当前用例或已经确认的适配需求。

### 3.4 依赖检查

`scripts/check-architecture.mjs` 检查 import graph：Domain 无外部 I/O 依赖、上下文无循环、传输层不访问 SQL。新增模块在对应任务补充必要规则并验证，动态注册与业务行为另做相关检查；未执行的检查不宣称通过。公共 DTO、OpenAPI、依赖锁文件和程序入口由明确负责人维护。

<!-- PAGEBREAK -->

# 04　Attention：资料与沉淀模型

### 4.1 聚合与值对象

| 聚合根 | 核心字段 | 必须保持的规则 |
|---|---|---|
| Material | id、source_locator、kind、current_revision、lifecycle | 来源不能仅剩摘要；新版本不覆盖旧版本 |
| Distillation | id、input_refs、stage、output_ref、status、next_question | 输入版本固定；重复输入和相同处理配置复用结果 |
| Opportunity | id、evidence_refs、goal_refs、dimensions、revision、state | 进入准入前必须有依据、用途及明确下一步 |
| TasteProfile | id、version、rubrics、examples、delegations | 更新产生新版本；授权不由模型自行修改 |

MaterialRevision、SourceSpan、ContentDigest、DimensionScore 是值对象。原文和较大输出放对象存储，聚合保存引用。一个来源可归属多个主题，不创建重复原文副本。

### 4.2 状态分开，避免一个 status 包办全部

Material 生命周期为 `active / archived / withdrawn`。导入、解析、嵌入和沉淀分别使用作业状态 `queued / running / succeeded / failed / cancelled`；解析失败不代表资料不存在。

Opportunity 状态为 `incubating → ready_for_review → admitted`，或进入 `deferred / rejected / withdrawn`。`deferred` 允许以后重评，不能当负面品味样本；`rejected` 保存拒绝维度和理由。修改依据或下一步后生成新 revision，旧准入不自动覆盖新版本。

### 4.3 沉淀完成条件

内容整理：保留原始来源、文本范围、摘要及用户收藏理由；缺少理由时标为未提供，不补写成用户观点。

主题关联：连接至少一条相关资料、既有观点、冲突或问题；资料不足时保留待查问题。首版示例必须经过这一层，不从单条摘要直接执行。

项目关联：指出目标、现有资产、预期改进、最小成果和缺失依据。轮数不固定；同一输入没有变化且没有新增问题时，不再次付费调用。

### 4.4 导入契约

`ImportMaterial` 接收来源元数据、现有工具输出或本地文件引用。以 source key 与 content digest 去重；同来源内容变化生成 revision。视频来源保留时间区间，论文保留页码或章节定位。

首版适配用户实际使用的总结工具导出，不从口述名称推断仓库或命令。没有字幕的旧摘要可以入库，但不可伪造时间戳或原文引用。

<!-- PAGEBREAK -->

# 05　关注排序、品味与委托

### 5.1 三个量分别保存

**关注活跃度**反映近期的人类行为；**资料长期价值**反映固定、采用和复用等记录；**任务优先级**反映已批准目标及其约束。任务不会因相关视频很久没打开就自动失效。

活跃度采用可配置的事件衰减起点：

```text
A(material, now) = Σ weight(event) × 2^(-age / half_life)
```

事件区分 `human` 与 `agent`。人工标注、主动重读、采用形成关注信号；Agent 检索与系统自动刷新只记录机器使用，不增加人的兴趣。人工固定项不因衰减从候选中消失。

### 5.2 检索与机会排序

先按访问范围和内容状态过滤，再做关键词与向量召回，合并、去重并重排。输出匹配原因、来源和当前排序策略版本。时间因素作用于排序元数据，不重新生成全部 embedding。

机会保留四个独立维度：`goal_progress`、`current_interest`、`project_improvement`、`originality`。目标推进具有首要排序地位，其余三个维度不得被实现为无效零权重。具体权重存为用户可调 profile；初次未配置时展示四维与人工顺序，配置完整后才启用自动综合排序。

信息不全用 `unknown`，不填 0。只有维度齐全或有明确缺失处理规则时才计算综合分。候选卡显示分项与下一步，不只显示一个总分。

### 5.3 委托策略

| 模式 | 模型可以做 | 人继续决定 |
|---|---|---|
| human_led | 整理、建议、记录与用户的差异 | 排序采用、资料准入、任务批准 |
| assisted | 按规则排序、建议准入 | 准入确认、任务批准 |
| delegated | 在指定题型和范围内执行资料准入 | 委托范围变化、任务批准 |

DelegationRule 指定题型、资料范围、可调用后端、适用语言、策略版本及复核条件。用户逐项开启，不设置“使用满若干天自动放权”。暂停委托立即阻止新的自动准入；已启动任务由独立批准记录控制。

### 5.4 反馈回流

反馈类型为 `adopt / later / reject / revise / already_solved`，分别记录作用对象和版本。成果被采用、返工或放弃，回写到关联机会的结果记录。首版用规则、例子和反馈检索改善判断，不引入在线权重训练。

准入记录包含 actor、策略版本、机会版本与理由来源。资料被撤回后停止新的上下文分发；已执行任务保留受限结果记录，不静默改写历史。

<!-- PAGEBREAK -->

# 06　Workspace：项目、会话与上下文

### 6.1 聚合边界

| 聚合根 | 核心内容 | 约束 |
|---|---|---|
| Project | 仓库/目录、环境、允许根、默认工具配置 | 一个项目身份不由路径字符串单独决定 |
| Goal | 目标、成功条件、优先级、状态 | 活跃目标变化不追改历史批准 |
| Proposal | 候选引用、目标、范围、成果、预算、revision | 提交审阅后修改产生新 revision |
| ApprovalGrant | 提案版本、范围、资源限制、epoch、有效期、状态 | 仅人类控制面签发、修改或撤销 |
| SessionBinding | 适配器、原生会话、项目、worktree、能力、绑定状态 | 观察到会话不等于可控制 |
| ContextPacket | 输入来源版本、项目快照、目标、决定、结果、缺口 | 不可变；更新生成 successor |
| ToolProfile | 工具引用、配置覆盖、secret_ref、版本 | 不保存明文密钥，不混合 Agent 私有状态 |

### 6.2 项目与环境身份

RepoRef 保存注册 ID、Git common-dir 身份与已知 remote；WorktreeRef 保存独立工作树 ID、路径与分支信息。非 Git 项目使用注册目录 ID 和内容清单。

ProjectSnapshot 至少包含 environment_id、repo_id、worktree_id、HEAD、index digest、工作目录内容清单 digest。未跟踪但在授权范围内的相关文件也进入清单；忽略密钥和无关构建目录。

同一仓库的两个 worktree 可以共享按内容哈希组织的缓存，但查询始终绑定各自快照。外部索引器不支持多工作树时，创建隔离索引实例。

### 6.3 上下文包内容

目标与完成条件；批准引用；相关资料及具体位置；项目快照；当前成果、测试与失败；关键决定及其来源；未解决问题；下一步；允许工具和数据外发规则。

ContextPacket 不包含原始思考过程、无关聊天、认证文件或全量环境变量。只从可访问的会话记录、代码、结果及用户笔记提取。超出长度预算时生成分层索引，保留必要约束，不静默截掉批准范围。

### 6.4 共享环境的范围

共享工具服务、只读模型文件和按哈希组织的依赖下载缓存；不共享可写的 worktree、node_modules、构建输出或 Agent 会话目录。配置使用用户层、项目层、任务层覆盖，页面显示每个值的来源。

初次发现默认只读；安装 Hook、添加 MCP 配置或修改已有配置时显示差分，只修改本平台拥有的配置段，并保留可恢复副本。

<!-- PAGEBREAK -->

# 07　两道门：资料准入与任务批准

### 7.1 资料准入

`AdmitOpportunity` 只接受 `ready_for_review` 的固定版本。调用方是用户，或具备该题型委托的判断流程。保存 Admission 和 outbox 事件在一个事务中完成。

Workspace 消费准入事件，幂等创建草稿 Proposal；相同机会版本不重复创建。提案生成可由模板或已授权模型完成，但不创建执行目录、不拉起工作 Agent。

### 7.2 提案与批准状态

Proposal 使用 `draft / in_review / approved / declined / superseded`。被批准的内容不可原地修改；范围调整形成新版本，并要求新批准。仅改变标题等非执行元数据也留下版本历史，但不私自改变批准内容。

ApprovalGrant 使用 `active / revoked / expired / completed`。批准保存目标版本、允许项目与根目录、允许动作、调用/预算上限、停止条件、批准者和过期时间。钱款预算需要币种；只有 token 或调用次数时按原单位显示。

### 7.3 启动流程

用户在批准页看到不可变提案及其差分，提交指定 revision。Service 验证当前版本和人类凭据，事务内保存 Grant 与启动事件。Swarm 消费事件后再次验证 Grant，再按 grant_id 幂等建立 Mission。

事件重复投递不得重复启动。批准以后但启动以前被撤销，消费者必须拒绝启动。Mission 的每次新受保护动作再次检查当前授权，不只相信收到事件时的状态。

### 7.4 权限边界

Agent MCP 凭据不可调用批准、扩大范围或提高预算接口。用户控制面会话与 Agent 工具凭据分离。模型可以提出增加预算、换路线或扩大范围的建议，结果进入待批状态。

批准一个目标允许其范围内的资料检索和任务细化；新的任务仍必须符合允许根、动作和预算。新建其他项目、扩大外发范围、推送和发布不继承原批准。

### 7.5 采用成果不等于自动合并

`AcceptArtifact` 记录用户采用结果并生成经验；Git commit、merge、push、发布是分别受控的动作。首版默认只产出隔离工作树、diff 与检查结果，不自动合并主分支。

撤销资料准入不等于撤销执行批准。页面提供两项独立操作，并显示分别影响的对象；用户可选择同时停止关联任务。

<!-- PAGEBREAK -->

# 08　Agent 发现、接续与交接

### 8.1 适配器能力清单

每个 Agent adapter 声明 `discover / read_context / start / resume / send / stop / observe / reconcile` 的支持状态，并保存版本。能力值为 `supported / unsupported / unknown`，未知能力不当成支持。

首选原生接口、CLI 与正式事件；文件观察只提供资料和状态线索。统一的 Agent 列表分别展示安装对象、发现会话、已绑定会话、正在参与的任务。

### 8.2 两种接续方式

**原会话接续：** 验证原生 session ID、所属项目、当前占用和版本；通过支持的原生方法继续工作。原会话仍被用户或其他客户端写入时，先完成占用交接，不并行注入两个操作者的输入。

**上下文交接：** 生成不可变 ContextPacket，明确已完成和未完成内容；目标 Agent 确认工作快照与工具范围后开始新 Attempt。结果页面保留来源会话、目标会话和上下文包链路。

接续不支持或原生状态丢失时，可以提供交接操作，但必须显示模式已改变；不得返回伪造的原会话恢复成功。

### 8.3 工作交接顺序

原执行者保存成果和上下文 → 停止新的工具动作 → 确认结束或隔离原执行路径 → 释放租约 → 新执行者认领新 fencing token → 验证上下文与授权 → 开始。

原进程无法确认停止时，任务进入 `blocked`；新执行者不能继续写同一目录。可在独立工作树开展后续工作，但旧产物必须隔离并在合并前核对。

### 8.4 共享工具服务

平台统一提供资料检索、上下文、代码查询、经验和任务工具；保留 Agent 自己的私有会话。支持 HTTP 的客户端连接一个本地 MCP 服务；仅支持 stdio 的客户端使用薄桥接，不各启动一份索引数据库。MCP 接入采用官方 Go SDK。[R02]

工具配置按 ToolProfile 编译成对应客户端格式。只给当前任务挂载需要的工具，不向所有 Agent 广播全部工具定义和资料。

### 8.5 交付验收

至少一次真实原生接续和一次跨会话交接，分别展示模式、项目、原生会话标识、上下文版本、执行结果与失败操作入口。只读取日志或展示 Agent 卡片不算完成接续功能。

<!-- PAGEBREAK -->

# 09　仓库上下文与改动影响

### 9.1 三个端口分别提供能力

| 端口 | 回答的问题 | 首选接入方向 |
|---|---|---|
| RepositoryMap | 模块职责、设计约束、重要关系 | AOCI 的版本化仓库知识地图 |
| CodeSearch | 自然语言或符号描述对应哪些实现 | 关键词 + 可替换的向量语义索引 |
| ImpactQuery | 调用、依赖、接口与测试关联到哪里 | CodeGraph 代码关系查询 |

AOCI 是 Git 版本化的仓库知识地图，不是向量数据库；CodeGraph 提供代码索引和关系查询。[R03][R04] 三个端口可以由同一组件实现，但接口不假设它们永远来自同一后端。

### 9.2 查询流程

确定授权项目快照 → 查全局结构 → 搜索候选符号 → 有界展开关系 → 读取当前源码 → 组装上下文包。调用者提供用途和结果预算；返回检索过的范围、版本以及未覆盖部分。

索引记录 backend/version、repo/worktree、snapshot digest、generation 和构建状态。源码已变化而索引未追上时返回 `index_stale`，允许读取当前文件或等待增量更新，不把旧结果标为当前完整关系。

### 9.3 关系证据

关系类型包括 calls、imports、implements、schema_usage、route_binding、test_covers、runtime_observed。每条关系保存 evidence_kind、source_span、snapshot 和提取器版本。推测关系单独标记，不能与编译器解析结果混为一谈。

跨 TypeScript/Python 项目、HTTP、MCP、数据库字段的联系使用项目提供的 Schema、配置和检查补充。产品底座保持 Go/TypeScript/SQLite，外部依赖与独立研究环境遵守 P09；迁入资产记录原仓、提交、路径、消费者和对应验证。

### 9.4 修改前与修改后

修改前保存候选写域、直接与间接影响、待核对接口和建议测试；它用于安排检查，不自动扩大批准写域。

修改后核对实际 diff 与声明写域，更新相关索引，执行关联检查并保存新的快照。未索引动态调用或缺失测试用例时，输出缺口，不生成“没有影响”的肯定结论。

### 9.5 重建与删除

业务真相是仓库和 Domain 记录；向量与图均为可重建投影。更换 embedding 模型建立新索引 generation，完成后切换；不混合不同向量空间。来源撤回或访问撤销时，从可检索结果移除并异步清理对应索引。

<!-- PAGEBREAK -->

# 10　Swarm：去中心化任务协作

### 10.1 聚合与状态

Mission 拥有批准引用、目标、资源预留、停止条件和执行状态；WorkItem 拥有输入版本、依赖、写域、租约、Attempt 引用与当前结果。Artifact 和 Experience 独立存放，避免 Mission 随日志无限增长。

Mission 状态为 `ready / running / paused / blocked / completed / cancelled`。WorkItem 状态为 `open / leased / running / submitted / accepted / revision_needed / blocked / cancelled`。提交结果不等于验收通过；失败 Attempt 保留原因，不覆盖前一次记录。

### 10.2 局部决策流程

可用 Agent 读取它有权参与的 open 工作项，按能力、已有上下文、依赖和资源过滤；规则足够时直接选择，仍有取舍时调用 Judgment。认领成功后执行，提交成果与证据，其他成员按需复核或接续。

服务维护账本、授权和原子认领，不扮演逐条派单的中央 LLM。新工作项可以由参与者提出，但必须属于原 Mission 范围；不能创建权限更大的后继任务。

### 10.3 协作信号

初始使用能力匹配、依赖就绪、已有上下文和经过验收的结果信号。信息素或路径权重作为可插拔 LocalPolicy；只影响已授权候选中的选择，不更改任务状态与权限。

每次执行固定策略版本，保存更新前后值与产生信号的结果。失败路线降低后续优先级，但历史错误、负面反馈与有效旧成果不删除。第一轮可使用简单规则，不为动态拓扑先建设通用仿真框架。

### 10.4 并发与停止

一个 WorkItem 同时最多有一个有效租约持有者。不同工作项并行时使用独立 worktree；写域重叠则通过串行安排或人工调整解决，不依靠模型口头协商。

产品默认最多两个活跃执行者，可配置上限；这是首版资源设置，不是蜂群架构上限。限制每个 Mission 的工作项总数、尝试次数、调用量、截止时间和连续无有效产出的轮数。

预算耗尽、目标完成、用户停止、无可执行工作或长期无进展均产生明确状态和原因。订阅制 Agent 无法提供精确费用时记录调用量和已知用量，费用保持 unknown，不按 0 计算。

### 10.5 经验继承

Experience 保存适用条件、来源快照、做法、结果、失败条件、验证记录与继任版本。后续任务按适用条件检索，不将经验文本直接提升为权限或系统指令。

<!-- PAGEBREAK -->

# 11　Jev/Laya 判断契约

### 11.1 一个接口，多个后端

JudgmentRequest 包含 question_id/type、有限候选或评分规则、证据包引用、goal/taste/policy 版本、允许后端、数据外发范围与预算。question_type 使用平台自己的 `choice / score / truth`，由适配器映射到供应商协议。

JudgmentResult 保存 selected/value、distribution、provider_confidence（可空）、model_revision、input_digest、truncated、usage、decision 与 evidence_refs。decision 为 `recommend / abstain / need_evidence`。不要求模型生成长解释；理由显示规则、维度和输入依据。

Jev 提供 Choice、Score、Noul；Noul 不带与 Choice/Score 相同的 confidence 字段。不要为了统一 JSON 把缺失 confidence 填 1。[R05][R06]

### 11.2 路由顺序

规则可以确定 → 不调用模型。证据不足 → 补检索。证据充分但有限候选难以取舍 → 调用适配的 Jev 或 Laya。仍需复杂生成或推理 → 交给已获授权的执行 Agent，或保留待用户判断。

默认不串行调用两个判断模型。允许各题型分别选择后端；外发未授权时不从本地 Laya 静默切到 Jev。网络失败、模型缺失或低置信结果保留 abstain，不转成随机选择。

### 11.3 长度与缓存

证据包只保留当前判断必需的片段。适配器报告截断后，不执行自动准入或自动路线选择，先重新组包。Laya 的 TypeScript 实现提供截断信息，可用于这一检查。[R07]

缓存键包含问题 schema、候选顺序、全部证据 digest、目标/品味/委托版本、模型版本和访问策略 epoch。命中缓存仍重新核验权限；不重用来自旧项目快照的判断。

### 11.4 逐步启用

先接入记录和人工模式，再以实际接受/拒绝案例检验资料分类与排序，之后由用户为具体题型开启 delegated。记录误判、人工覆盖、端到端调用量与延迟；不使用模型自报 confidence 作为单次正确率。[R06]

判断记录用于改进规则和检索样例，首版不训练新模型、不引入在线权重更新。供应商的结构化答案没有附带来源解释时，不编造模型给过理由。

### 11.5 Laya 的接入边界

现有接入使用 `laya-ts` 的本地 ONNX 推理，模型包须有可加载的 ONNX、tokenizer、配置、revision 与 digest。[R07] Python 依赖按 P09 与具体任务范围处理，该决定不改变 Laya 已选运行方式、模型来源、语言和适用验收。

<!-- PAGEBREAK -->

# 12　Application Service 契约

### 12.1 用例目录

| 上下文 | Command / Query | 主要输入与输出 |
|---|---|---|
| Attention | ImportMaterial / RecordDistillation | 来源与输出 → 资料版本/沉淀记录 |
| Attention | ReviewOpportunity / AdmitOpportunity | 机会版本与判断 → 反馈/准入 |
| Attention | UpdateTasteProfile / SearchMaterials | profile 版本/查询范围 → 新策略/资料片段 |
| Workspace | RegisterProject / BindSession | 项目与原生引用 → 注册/绑定 |
| Workspace | SubmitProposal / ApproveProposal | 固定提案版本 → 待审/批准凭据 |
| Workspace | RevokeApproval / BuildContextPacket | grant/来源版本 → 撤销/上下文包 |
| Workspace | ResumeSession / HandoffSession | 会话及上下文 → 交接操作 |
| Swarm | CreateMission / ClaimWorkItem | 有效批准/任务版本 → Mission/租约 |
| Swarm | SubmitArtifact / AcceptArtifact | 租约与结果/采用决定 → 提交/经验 |
| Swarm | PauseMission / CancelMission | 目标版本与原因 → 新状态 |

领域方法不接受 transport request。认证 Principal 从受信任入口注入，不从请求正文中的 `actor_type` 获取。CommandMeta 至少有 request_id、idempotency_key、expected_version；读取查询不强制幂等键。

### 12.2 端口设计

Repository 按聚合定义最小 Load/Save/CAS 操作，不建任意类型通用 CRUD 仓库。外部端口按用途拆分，如 SourceReader、RepoKnowledge、AgentRuntime、GrantAuthorizer、Judger、ObjectStore；仅在真实需要第二实现或隔离副作用时抽象。

应用层依赖事务执行接口，使聚合写入、幂等记录和 outbox 同时提交。领域对象不持有 sql.Tx。跨上下文桥接只调用被发布的 Service 或传递版本化事件。

### 12.3 统一错误

| 错误码 | 调用方动作 |
|---|---|
| validation_failed / unsupported_capability | 修正输入或选择支持的适配器 |
| version_conflict / context_stale / index_stale | 读取当前版本，重新组包或确认 |
| scope_denied / approval_required / approval_revoked | 停止该动作，返回批准入口 |
| lease_lost / budget_exhausted | 停止新副作用，保存当前结果 |
| provider_unavailable / evidence_missing | 退回人工或补充输入，不静默换外发目标 |
| delivery_unknown | 对账原 operation，不盲目重发 |


<!-- PAGEBREAK -->

# 12　事件与事务边界（续）

### 12.4 领域事件目录

| 事件 | 发布方与最小内容 | 消费行为 |
|---|---|---|
| opportunity_admitted | Attention；opportunity_id/revision、admission_id、actor、policy_version | Workspace 幂等形成待筹划提案，不执行 |
| proposal_approved | Workspace；proposal_id/revision、grant_id、epoch | Swarm 重查有效批准后创建 Mission |
| approval_revoked | Workspace；grant_id、new_epoch、reason | 阻止新动作，停止或核对受影响执行 |
| context_packet_built | Workspace；packet_id、snapshot_digest、predecessor_id | 刷新可交接视图；不自动认领任务 |
| work_item_claimed | Swarm；work_item_id、attempt_id、holder_id、fence | 更新界面和观察器，不再触发第二次认领 |
| artifact_submitted | Swarm；artifact_id、attempt_id、snapshot、checks_ref | 进入复核视图，不能直接标为 accepted |
| artifact_accepted | Swarm；artifact_id、acceptance_id、actor、experience_id | Attention 记录实际采用，索引更新经验 |

事件的完整类型加所属上下文前缀，schema_version 单独保存。自包含字段只传识别与校验所需内容，大文本通过有权限校验的对象引用读取。人类批准事件的 actor 来自已认证的调用者，不来自模型生成内容。

### 12.5 每个用例的提交点

**ApproveProposal：** 读取提案并核对 expected_version → 验证用户身份与批准范围 → 同一事务保存 Grant、幂等回执及事件 → 返回批准结果。只有后续消费者负责启动，HTTP 层不顺手启动进程。

**BuildContextPacket：** 校验来源访问 → 读取固定快照 → 组装并保存不可变对象 → 事务保存引用与事件。保存前发现相关文件变化，则重建或返回 context_stale，不把新旧版本拼在一包。

**ClaimWorkItem：** 验证成员绑定、依赖、授权和资源 → 事务内 CAS 工作项、分配单调 fence、预留预算 → 返回租约。失败不留下可用租约或半份预算预留。

**SubmitArtifact：** 核对当前租约、Attempt、写域、快照及对象 digest → 保存提交记录和事件。检查失败进入 revision_needed 或 blocked；只有验收命令能转入 accepted。

### 12.6 幂等键与重放

业务命令按调用者、用例、Idempotency-Key 去重，并保存请求 digest。相同键和不同输入返回冲突，不能复用旧成功结果。消费者按 consumer_id + event_id 去重；Mission 对 grant_id 建唯一约束。

事件使用至少一次投递；不要求全局事件顺序。消费者按 aggregate_version 判断旧事件，发现版本缺口时重取该对象快照。用户授权必须查询当前状态，不能等待异步撤销事件来维持正确性。


<!-- PAGEBREAK -->

# 13　HTTP、MCP 与事件接口

### 13.1 HTTP v1

前端通过 `/api/v1` 调用应用用例。下表是待实现的接口契约，不是现有服务地址；完整请求/响应由 S0 在 `contracts/openapi.yaml` 固定，再生成 TypeScript 客户端。

| 方法与路径 | 用途 | 调用身份 |
|---|---|---|
| POST /materials/imports | 导入任务，返回 job_id | 用户或受限导入器 |
| GET /materials、/opportunities | 资料、候选查询 | 已授权读取者 |
| POST /opportunities/{id}/reviews | 用户反馈 | 用户 |
| POST /opportunities/{id}/admissions | 资料准入 | 用户/被委托流程 |
| POST /projects | 注册项目 | 用户 |
| POST /sessions/{id}/resume、/handoff | 原生接续/显式交接 | 用户或范围内执行者 |
| POST /proposals/{id}/submit | 形成待审版本 | 用户/授权筹划流程 |
| POST /proposals/{id}/approvals | 批准固定版本 | 仅用户 |
| POST /approvals/{id}/revoke | 撤销执行授权 | 仅用户 |
| GET /missions、/missions/{id} | 任务与事件视图 | 范围内读取者 |
| POST /missions/{id}/pause、/cancel | 暂停/终止 | 用户或受限停止控制 |
| POST /work-items/{id}/claims | 原子认领 | 已绑定执行者 |
| POST /work-items/{id}/artifacts | 提交结果 | 有效租约持有者 |
| POST /artifacts/{id}/acceptance | 采用成果 | 用户 |
| GET /events | SSE 事件投影 | 范围内读取者 |

修改命令携带 expected_version；资源创建与外部动作携带 Idempotency-Key。长耗时请求返回 202 和 operation/job_id，不占用 HTTP 连接等待模型完成。

### 13.2 MCP 工具

工具名按 `attention_search`、`workspace_context`、`code_search`、`code_impact`、`swarm_list_work`、`swarm_claim`、`swarm_submit`、`experience_search` 组织，统一调用相同 Service。

批准、提权、增加预算与修改委托不暴露为 Agent 工具。MCP resource 返回范围内快照，不能通过猜测 ID 获取其他项目数据。

### 13.3 版本与事件

HTTP v1 允许向后兼容的可选字段新增；删除字段、改变语义、修改必填字段走新版本。内部 DTO 与传输 DTO 分开映射；禁止前后端各手写一套相同协议类型。

事件包含 event_id、type、schema_version、aggregate_id/version、occurred_at、correlation_id、causation_id、payload。SSE 使用可续读游标；断线后先补事件或重取快照，前端不得靠累计消息猜任务终态。

<!-- PAGEBREAK -->

# 14　存储、事务与恢复

### 14.1 数据布局

```text
<app-data>/
  state.sqlite              业务记录、outbox、作业与幂等键
  objects/<digest>          原文、上下文包、较大结果
  indexes/<backend>/<id>/    可重建索引
  models/<revision>/        已验证只读模型包
  logs/                     脱敏运行日志
  backups/                  迁移前一致性备份
```

路径通过系统数据目录或配置解析，不硬编码个人用户名与绝对路径。业务数据库不放进项目 worktree，不在 Windows/WSL 之间共享同一 SQLite 文件。

SQLite 通过 `database/sql` 和适配层使用，默认评估无 CGO 的 modernc 驱动。[R08] 业务表按上下文分前缀；模块不得读取对方表来绕过 Service。查询投影可以跨上下文汇总，但只读且可重建。

### 14.2 原子边界

聚合状态、版本号、幂等回执和 outbox 事件在同一事务中提交。不同进程消费者按 event_id 去重。发送成功但确认丢失会再次投递，因此消费者也必须幂等。

任务认领使用数据库 CAS 或条件更新，且工作项、租约 token 与资源预留在同一事务内完成。多个 Agent 同时认领只允许一个成功；失败者读取新状态，不覆盖已有持有者。

外部模型、进程或网络动作不持有长 SQL 事务。先持久化 stable operation_id 和预算预留，再发送；返回后对账并更新。取消时只有确认未发生的预留可直接释放。

### 14.3 文件与数据库一致性

先将对象写入临时文件并校验 digest，再原子发布，再保存业务引用。未被引用的对象延迟清理；数据库不得引用尚未发布的文件。已有同 digest 对象复用，不覆盖。

备份使用数据库支持的一致性方式，或停写并完成检查点后复制；不能在线只拷贝主数据库而遗漏必要状态。迁移前保存 schema 版本和备份，迁移失败停止启动，不边运行边使用半升级表。

### 14.4 重启恢复

启动后加载未完成作业、租约和 operation。失联外部动作标为 delivery_unknown，先对账；不能因重启再生成同一动作的新身份。过期租约递增 fencing token，旧持有者提交被拒绝。

关闭过程停止新认领、请求终止子进程、保存检查点并关闭存储。窗口关闭只断开界面，明确的“停止服务”才执行服务关闭。

<!-- PAGEBREAK -->

# 15　组件接入与扩展

### 15.1 技术选择

Go 维护全部业务状态与用例；TypeScript 负责界面、生成客户端和必要推理适配。Rust 组件可以复用，但不再建立一套自研 Rust 业务后端。首版运行不依赖 Docker。

| 组件 | 接入边界 | 接入任务完成条件 |
|---|---|---|
| 现有视频总结工具 | 导出文件/既有结果适配 | 用用户真实样本锁定格式、来源和时间戳 |
| AOCI | RepositoryMap 适配器 | 固定版本、能关联项目快照、确认分发方式 |
| CodeGraph | CodeSearch/ImpactQuery 适配器 | 固定版本，验证工作树隔离和增量更新 |
| 向量检索后端 | SemanticIndex 端口 | 依赖显式声明；向量模型与索引版本可追溯 |
| Jev | Go HTTP 适配器 | 用量、超时、鉴权和结构化错误可记录 |
| Laya | 常驻 TS/ONNX 判断 worker | 可直接加载模型包，断网推理与重启可用 |
| Agent | 原生接口/CLI 适配器 | 两种交接能力分别验收，配置不覆盖 |

### 15.2 插件清单

每个适配器的 manifest 保存 id、version、protocol_version、capabilities、supported_environments、config_schema、启动方式、健康检查与数据外发范围。manifest 只描述能力，实际授权由平台策略决定。

首版通过静态注册和受管理子进程扩展，不做任意 Go 动态插件加载、插件商店或远程安装器。适配器故障只影响对应能力，页面给出 unavailable 与恢复操作。

### 15.3 Laya 准备工作

官方 TypeScript 路线使用 ONNX，并提供 Node 推理；官方文档中的权重导出另有 Python 步骤。[R07] 因此接入时取得已经导出的匹配模型包，核对模型、tokenizer、配置、运行时版本与 digest。

模型包缺失时保持 Laya disabled；其他已实现模块可继续开发，Laya 接入任务保持 BLOCKED。安装依赖显式声明并沿具体任务处理，不以随机或固定回答替代模型验收。

### 15.4 版本与许可清单

S0 在 `dependencies.lock.json` 固定 Go、Node、pnpm、关键 SDK、适配器和模型版本；依赖更新单独提交，不使用 main/latest 作为发布输入。许可文件和第三方来源随版本记录。

AOCI 当前使用 FSL-1.1-MIT；将其作为独立候选接入，并在决定分发前核对所选版本许可，不把仓库可读当作可任意嵌入分发。[R03]

<!-- PAGEBREAK -->

# 16　三模块界面与前端规范

### 16.1 资料沉淀页

显示导入队列、时间轴、主题集合和候选机会。资料详情并列显示原文/字幕位置、各轮沉淀、关联目标和用户反馈。候选卡显示为什么值得做、四维评分、最小下一步与缺失依据。

操作为继续沉淀、以后再看、拒绝、准入；未获准入的资料不会混进工作区任务列表。机器使用次数与人的关注行为分别显示。

### 16.2 共同工作区页

以目标和项目为主，不以模型品牌为主。显示待批提案、已批准工作、Agent 与项目绑定、工具配置来源、会话状态和上下文包。批准面板集中展示范围、成本/调用限制、产出与停止条件。

会话详情同时提供原生接续与交接入口：能力不支持时禁用并说明下一步。上下文包能展开检查来源与版本，过期提示提供重建按钮。

### 16.3 蜂群执行页

默认显示任务时间线、当前工作、阻塞与成果；拓扑作为切换视图。节点对应真实执行者或工作项，边对应认领、交接或复核事件；不绘制无事件支撑的装饰协作。

工作项显示有效持有者、尝试记录、工具事件、上下文版本和提交结果。暂停、取消、查看 diff、采用和退回有明确入口；错误状态显示恢复动作。

### 16.4 前端实现约束

React + TypeScript，页面按业务 feature 组织。服务端状态通过统一查询层管理；浏览器不自行决定批准、租约或任务完成。客户端从 OpenAPI 生成，组件消费视图 DTO。

复用一个组件体系；颜色、间距、字体和状态标记集中为设计变量。所有异步组件覆盖 loading、empty、error、stale、disabled；可点击控件有键盘焦点，状态不只依靠颜色表达。

优先完整信息流与细节页，再做视觉强化。沉淀/工作区/蜂群共享导航、筛选和详情抽屉，不先加终端模拟器、全功能编辑器或独立图形引擎。

### 16.5 UI 验收

每个切片使用真实 API、实际存储和获准来源完成交互与验收。禁止在实现或测试中使用 mock 或虚假数据。检查 1920×1080、1280×720 与键盘路径；长中文、长路径、空资料、审批失败、服务重连、未知费用、过期索引均有页面状态。失败场景通过实际权限、输入校验和服务生命周期验证；不替换接口响应或伪造来源事实。

Playwright 检查从导入到采用的路径，并保存关键页面截图。截图检验显示与交互，服务日志和实际结果检验功能；两类记录放在同一次验收目录。

<!-- PAGEBREAK -->

# 17　运行、权限与失败处理

### 17.1 本地访问与数据外发

HTTP 仅监听本地地址，校验会话凭据与 Host/Origin；写操作有 CSRF 防护。用户批准使用独立人类会话，Agent token 只拥有任务范围内能力，浏览器不能把请求正文伪装成人类批准。

默认允许的资料根、项目根和模型提供方显式登记。检索、判断、上下文交付都再次检查访问范围；密钥只使用 secret_ref，日志与导出均脱敏。原文中的命令视为资料，不作为授权执行。

错误正文含 code、message、retryable、request_id、required_action；用户页面显示可采取的动作，不直接暴露认证输出或原始敏感 payload。

### 17.2 执行路径分类

`observed` 只读观察，不允许派发。`cooperative` 使用受信任的原生 Agent，通过其现有工具能力执行，页面列出可控制和不可控制的范围。`mediated` 的受保护动作经过平台授权与预算入口。

Git worktree 只隔离工作文件，不隔离任意系统访问。任务要求的控制能力超过适配器提供的能力时，不启动该任务。需要强隔离的实验通过后续沙箱适配器接入，不把目录约定当操作系统隔离。

### 17.3 失败恢复表

| 情况 | 自动处理 | 用户或开发者操作 |
|---|---|---|
| 重复导入/事件重投 | 复用版本或去重回执 | 查看原记录 |
| 资料解析/embedding 失败 | 保留原资料和失败作业 | 重试或更换适配器 |
| Jev 网络失败/Laya 未就绪 | abstain，保留人工判断 | 配置、重试或人工处理 |
| 索引过期 | 返回过期状态，允许当前文件查询 | 更新索引或重建上下文 |
| 任务租约丢失 | 停止新动作，拒绝旧 token 提交 | 隔离旧产物后接续 |
| 外部动作结果未知 | 按原 operation 对账 | 无查询能力时人工确认 |
| 授权撤销或资源耗尽 | 禁止新受保护动作，停止/检查在途动作 | 查看已发生效果，决定后续 |
| 子进程未退出 | 记录停止失败，隔离目录 | 确认旧执行结束后恢复 |

### 17.4 作业与服务生命周期

沉淀和索引使用持久化作业队列、并发上限、去重键与可取消状态；失败重试有次数和总时限，不以无限轮询维持“正在工作”。首版复用数据库作业与 Go worker，不引入消息集群。

服务由用户显式启动；开机自启是独立设置。退出网页不终止已批准任务，但页面应明确提示服务仍在运行。停止服务必须保存可接续状态，重启恢复见第 14 节。

<!-- PAGEBREAK -->

# 18　沿用的开发方式

### 18.1 常读文件与文档归属

AGENTS 管长期规则，HANDOFF 管接管上下文，STATUS 管当前版本、已验范围与阻塞；SPEC 管产品行为与依赖，META_PLAN 管整合方向，TASKS 管排序和任务链接。具体 tasks 文件记录范围、实施与验证，QUESTIONS 管决定及待答，RESOURCES 管参数，CODING 管代码习惯。README 面向用户，CONTRIBUTING 面向贡献者，分别链接当前事实。

新 Agent 读入口与状态，再按任务读局部规格和源码。历史方案放 Archive，不作为每次启动必读。沿用已有独立 worktree、写域和复核方式。[H1，开发方式]

### 18.2 一轮执行

主 Agent 提出方案 → Worker 按变更边界编写测试计划 → Reviewer 或用户独立审核覆盖 → Worker 实现、自测和提交 PR → 独立 Reviewer 核准确提交、真实结果及回归，给出接受、退回或证据不足 → 执行 hook 唤起主 Agent → 原 Worker 返修 → 更新 STATUS。计划通过后实施，遗漏场景补充并重新审核；普通文档执行来源、链接与一致性检查，相关功能按其变化选择必要验证。

执行规则以 AGENTS 为准，决定来源保存于 QUESTIONS。每项任务固定 worktree、分支和写域，模块责任长期保留，任务分支完成集成后结束。Worker 负责实现、测试、文档、普通 push 及返修；Reviewer 独立核相同来源与条件，不修改业务代码。Orca 子 Agent 按任务授权、互斥写域与资源限制安排，禁止 Aliyun Agent。主 Agent 管理范围、优先级、窗口和最终集成，不替 Reviewer 宣布效果；hook 实际读取并回复才确认唤起。接受优化、普通合入、部署与发布分别依照对应授权，产品内的任务策略按业务服务维护。

### 18.3 worktree 与文件所有权

一项任务一条分支/一个 worktree。公共入口、OpenAPI、Go/TS 公共类型、依赖与锁文件、迁移序列由集成负责人修改。其他任务通过需求说明申请变更，不直接争抢同一文件。

共享只读下载缓存，不共享可写依赖与构建目录。发现用户未提交改动先登记并避开；不使用 Git 回滚或清空改动，不执行 `git add .`，不覆盖他人贡献或移动旧项目。只提交获准路径，按现有授权普通 push；规则文档按用户要求维护，发布沿对应任务的授权与验收。

### 18.4 任务契约

任务记录目标、可改路径、依赖、验收、停止条件、基线、预期效果、实际客户端和模型；交付记录准确源码、产物、命令、结果与真实限制。普通命名和已批准范围内的实现细节由负责人处理；影响当前目标、验收、权限、预算、外发或不可逆结果的真实未决项引用 QUESTIONS，等待决定期间继续独立工作。

### 18.5 完成与接手

状态使用 PASS / FAIL / NOT_RUN / BLOCKED。PASS 只对应已经执行的具体验收；未安装真实适配器时保留 NOT_RUN/BLOCKED，不用 mock 结果顶替。失败写下一条可执行处理动作，不扩写长篇自我说明。

SWA 从现有产品历史原地演进，保持程序和数据连续性；Morphogenesis 的研究运行时、机制实验与论文证据独立保留。机制迁入记录来源、边界和对应验证，同一执行任务由选定的单一业务后端拥有认领、预算和租约。

<!-- PAGEBREAK -->

# 19　开发切片与并行边界

先用一个完整场景串起三个模块，再增强判断与拓扑。每个切片交付界面、Service、存储和对应检查，不按“全部后端完成后再接前端”安排。

| 切片 | 交付 | 验收出口 |
|---|---|---|
| S0 基座与契约 | 独立项目、Go/TS、两层包、三页真实接口交互、OpenAPI、SQLite 迁移、检查入口 | 可启动、可构建、接口类型生成与依赖检查通过 |
| S1 资料到候选 | 真实导出导入、来源定位、沉淀记录、主题关联、人工反馈 | 收藏不会启动任务；重复导入与继续沉淀可操作 |
| S2 候选到批准 | 项目注册、准入、提案版本、批准/撤销、上下文包 | 模型无批准入口；版本冲突与撤销被正确处理 |
| S3 两 Agent 工作闭环 | 真实绑定、原生接续、上下文交接、认领、提交、用户采用 | 一个真实改进完成，结果与来源可回查 |
| S4 仓库上下文 | AOCI/CodeGraph 与可替换语义索引、增量和快照校验 | 两个 worktree 不串结果，过期索引可恢复 |
| S5 判断委托 | Jev、Laya、规则路由、反馈样例、按题型委托 | 本地模型断网可用；拒答/截断不自动准入 |
| S6 局部协作与继承 | 局部候选选择、并行工作项、无进展停止、经验复用、拓扑视图 | 第二次任务实际引用第一次成果且记录适用性 |

S3 建立基础任务账本与认领，S6 扩展局部协作；不等 S6 才首次实现 Swarm 模块。S4/S5 的适配准备可提前进行，但不得绕过 S2 的批准边界。

### 19.1 可并行的安排

任务围绕完整结果确定业务负责人和当前所需共享契约，按实际写域、生成物、依赖与资源安排最少 Worker。每项任务持续负责实现、测试、文档和返修，Reviewer 独立审核；共享契约变化由主 Agent 裁决并通知直接消费者。同一时刻按依赖顺序合入一个分支，资源窗口按 RESOURCES。

### 19.2 首个真实样例

使用一篇用户收藏论文、一份现有视频总结、一个明确可改的项目和一个小型改进。成功条件包括可使用的产物、相关检查、来源链、一次交接、一次采用反馈。人工判断先跑通，不等待模型权重准备。

### 19.3 后续而非首版前置

桌面打包、多机发现、多用户共享、在线模型训练、自动新项目执行、复杂群体策略搜索、插件市场和分布式数据库，分别建立后续提案，不进入当前切片的可改范围。

<!-- PAGEBREAK -->

# 20　验收场景与开发命令

### 20.1 关键场景

| ID | 场景 | 必须结果 |
|---|---|---|
| AT01 | 导入论文/视频并多轮沉淀 | 有来源版本；不会直接产生 Mission |
| AT02 | 同源重复导入、摘要重试 | 去重或新 revision；无重复工作 |
| AT03 | Agent 多次读取旧资料 | 不增加人类关注热度 |
| AT04 | 用户选择以后再做 | 不当作拒绝样本，不丢失资料 |
| AT05 | 模型尝试批准任务 | 被拒绝，未启动任何执行者 |
| AT06 | 批准旧提案版本 | 返回 version_conflict |
| AT07 | 启动事件重复/批准已撤销 | 同 grant 最多一个 Mission；撤销后不启动 |
| AT08 | 两 Agent 同时认领 | 一个获得有效租约；旧 token 无法提交 |
| AT09 | 原会话恢复与跨会话交接 | 分别保留原生身份或 successor 链 |
| AT10 | 两 worktree、未提交代码变化 | 索引/上下文分离；过期不伪装新版本 |
| AT11 | 模型拒答、截断、外发未授权 | 不自动准入，不静默换云端 |
| AT12 | 模型/目标/profile 改变 | 旧判断缓存失效 |
| AT13 | 在途外部调用后崩溃 | 原 operation 对账，不盲目重复动作 |
| AT14 | 构建、安装和工具依赖可复现 | Go/TypeScript 底座可构建启动；summarize 等所需 Python 及媒体依赖显式安装并验证，缺依赖立即失败 |
| AT15 | 迁移、重启、撤销与恢复 | 记录一致，旧权限不能执行新动作 |
| AT16 | 完成成果并再次使用 | 经验有来源与适用条件，第二任务实际引用 |

### 20.2 S0 需要建立的命令入口

```sh
go mod download
pnpm install --frozen-lockfile
pnpm dev
pnpm check
pnpm test:e2e
pnpm build
```

`pnpm dev` 启动 Go API 与 Vite，并处理退出时的子进程关闭；`pnpm check` 统一调用格式、类型、领域/Service 测试、契约与依赖检查。使用一个跨平台 Node 脚本编排现成命令，不搭额外开发框架。

Go 检查包含 gofmt、`go vet ./...`、`go test ./...`；支持的 CI 工具链再运行 race 检查。前端执行 typecheck、lint、Vitest，UI 路径执行 Playwright。文档改动执行链接/路径与 `git diff --check`，不要求全量模型测试。

### 20.3 记录方式

Windows 与 Linux CI 分开记录环境、SOURCE_SHA、实际命令和结果。真实适配器与模型测试按授权范围显式启用；实现和测试均禁止使用 mock 或虚假数据。协议、权限和失败路径通过实际接口验证。尚未执行的真实适配器、模型及完整样例验收分别记录 NOT_RUN 或 BLOCKED，不能用其他检查结果代替。

<!-- PAGEBREAK -->

# 21　迁移、决策记录与实施前置

### 21.1 既有产品的旧方向与首版 CLI 边界

本轮[六卡整合任务](../tasks/swa-task-cards-20261022.md)沿用本节执行权威与授权，以CLI候选优先、共享React工作台的组合候选随后推进；准确基线、来源与文件归属见[整合入口](integration/openmausbot/00-context.md)。共享身份、状态、请求恢复、退出码与数量合同见[01合同](integration/openmausbot/01-contract.md)。本轮最终验收默认N=3且可配置，N是测试参数，不构成产品固定上限；旧两Worker记录保留其原范围。`max_workers`为任务批准的安全正整数额度，pending/unknown start保持占用，超限不得静默缩减。`max_workers=2`时第三席拒绝继续作为原准入用例。完整成果遇到当前原生分页容量不足必须明确失败。任务文件的公开形状见`swa-cli.schema.json`的`taskSpec`，HTTP命令仍传`spec_file`，不新增inline spec。

本轮目标包括Windows x64与Linux，实际原生Agent来源及逐引擎平台限制见[适配矩阵](integration/openmausbot/02-agent-matrix.md)。本次已确认的人类跨创建者例外仅为`worker.send`：同项目当前settings、动作、目录/固定上下文、原生CLI/模型和外发批准独立准入，不继承创建者Agent Grant，不以其有效为人类权限来源，原创建者关联保留来源。跨创建者`worker.start`仍拒绝，Agent仍严格绑定原Grant与主体，人类自己的start沿原规则。投递前再次核当前批准、原Dispatch/session/selection/代次及原request；当前权限或来源失效不得产生输入。实际实现和真实HTTP/SQLite及原生消费者验证分别记录。真实模型测试预算不设费用上限；固定公开输入、ToolsOff、私有资料/账户保全、超时和资源/并发准入保持。未连接Windows环境不表示平台验收完成。

Linux服务身份使用实际boot_id、原始start_ticks和UID，不填Windows创建时间；服务级归属与每Worker完整退出分别核验。D内部合同已经实现，要求独占subreaper引导器、精确pidfd和收养child回收、两次内核ECHILD、父确认及原引导器真实退出。准确`6890522e43d7b81e99b09ca94acc27b9d3a5c7dd`的Linux组合安装已完成14项普通进程检查，其中11项使用装内原件、3项为同SHA诊断；该结果不包括Agent账号、模型或N=3。准确字段与未知边界见[共享合同](integration/openmausbot/01-contract.md)。Codex 0.163无模型metadata仅证明其实际目录/配置/feature来源，不证明原账号路由、有效工具全集、ToolsOff或推理；独立rollout读取器已有，NativeLaunch及产品来源/模型接线继续按后继验收。“大部分Agent”的验收分母见QUESTIONS当前待答项，不擅自用注册数量判通过。

产品底座使用 Go/TypeScript/SQLite，旧 Python 执行内核保持独立研究来源。[H2，第 1 节] summarize 等工具可使用所需 Python 依赖；机制按完整业务意义、来源和验证迁入，保持单一任务执行权威。现行语言决定见 QUESTIONS，早期绝对禁令不再作为当前接入条件。

既有 Go/TypeScript/SQLite 产品保持现有模块与数据。最新[首版可控 Swarm CLI 任务](../tasks/swa-cli-v1-20261020.md)集成抽取出的 Orca 无界面执行后台，采用独立 `swa` 命令、安装根、profile、数据库、端点及所属进程；本机 Orca 保持原安装、配置、账户及会话。用户决定与隔离验收见 [QUESTIONS](QUESTIONS.md) 和首版任务。

首版须发现本机注册的 Agent，并通过 Swarm CLI 调用发现的真实 Agent。注册来源、安装、配置、可启动和实际原生控制能力分别返回真实观察及原因。使用 REA 分析准确 Orca 交付物，核对注册发现、启动、输入、状态、输出、停止与释放路径，提取执行需要的依赖和许可，验证独立安装闭包。注册读取与产品私有状态保持各自归属，不修改本机 Orca 或 Agent 配置。发现/稳定选择、原生输入/模式及控制端恢复分别按§21.1.1—§21.1.3定稿，未答权限保持未决定。

独立产品后台的发现、选择和调用不得以原 Orca 桌面或后台正在运行为必要条件。真实注册来源、命令检测和必要配置读取的具体接口先核实并审核；原 Orca 运行时只读查询可以用于核对来源，不能成为产品运行前置。首版通用 Agent 的工具范围与既有受限 Codex 验证的适用关系已询问用户，未答前保持原限制，不影响独立发现及依赖技术设计。

首版 CLI 的唯一执行状态由产品私有 Orca 原生 Run/Task/Dispatch、会话及进程记录维护。Workspace 复用项目、适用授权和固定上下文，通过 App 的消费方端口访问执行适配器；同一 CLI 任务不另外建立 Mission/Claim/Relay 记录。旧 S3 保持自己的规格和验收记录，其他用例仍按原章节执行。

CLI/HTTP 复用 App 的项目主体、批准及动作准入；具体原生源码、控制端身份、请求去重、工具关闭和安装接口依独立审核后的方案实施。原生调用的真实身份及退出证据不能由外部传入的 handle、actor 或模型自述替代。模型接入不修改本机 Agent 配置和认证，权限与资料范围按适用任务核实。

准确396e的[执行方案与测试计划](standards/swa-cli-headless-20261020.md)及后继已审补充的来源和验证记录保留。当前执行契约按本节及§21.1.1—§21.1.3，真实注册Agent路径由同一Worker实现并验证：

| 模块与显式接口 | 状态与权限边界 |
| --- | --- |
| `cmd/swa`、HTTP → Workspace App 的 Orca execution 用例 | `serve/status/capabilities`、`controller open/show/close/recover`、`task create/show/list/result/complete`、`worker start/show/list/read/send/stop/release`、`request show`；参数、JSON envelope、退出码和未知效果按方案 §6及本节已审补充；传输层不访问业务数据库 |
| Workspace App → Orca execution adapter | App 声明消费方端口及 DTO，每次核项目主体、适用 Grant 与动作；原生关联仅保存 project/grant/Run/root Task，迁移使用028。adapter 以随包 Node 入口调用真实 RuntimeClient；执行状态保留在原生存储 |
| 产品 Node composition → 原生 runtime/controller/Worker | 仅注册获准方法；真实 PTY helper 的 launch/current consumer 执行 Run 与 Worker 操作。公开请求映射到原生 mutation receipts、确定 PTY 创建身份及固定子请求；副作用未知保留 pending，只读查询，不重发输入 |
| Worker → 实际注册Agent的原生adapter/CLI | 使用稳定AgentSelection选择实际executable、模型、provider及配置来源；保持明确execution_mode、原session/PTY/operation归属。私有写入目录和实际账号来源分别核实，工具、目录及外发按当前批准，不以SDK替换所选Agent |

实际Worker须保留完整所属树的创建、输入前准入、停止及退出证据。Win32 Job控制沿准确6168的已审[方案§5.4](https://github.com/songconmaisaix31-design/swarm-anything/blob/6168b4ea19e3b5468403e71a77a279b4bc18adf3/docs/standards/swa-cli-headless-20261020.md)：不可继承的所属句柄、实际root身份、分配及完整成员查询均确认后才允许模型输入；root退出、两次间隔至少50毫秒的成功完整Job空查询及两次新鲜旧身份退出观察满足后才确认全树退出。structured原生CLI和terminal的实际Job/PTY custody消费者随§21.1.2接入并按T09/T13逐项验证。查询失败、身份不明、必要native缺失、嵌套拒绝或重启后无法证明旧Job时保持unknown及占用，不能只凭root退出宣布停止；原Orca及非目标进程保持原所属。

合法已认证人类的自有安全停止保留原规则：严格核项目和原生进程所属，执行批准撤销及旧上下文版本不阻断安全停止；Agent的执行与撤销准入保持。关闭控制端与创建任务/Worker的准入必须共同核原生持久占用：创建先保留时，关闭须拒绝或等待其明确结算；关闭先保留时，新建及输入拒绝，unknown保持原屏障。关闭helper不能代替停止所属独立Worker。

完整成果沿准确d7已审[方案§5.5](https://github.com/songconmaisaix31-design/swarm-anything/blob/d7f21242259739cfb49a4f68a19a1a8f28bcec32/docs/standards/swa-cli-headless-20261020.md)、§21.1.2及T07/T13实施。`worker read`保留原生有界预览与游标；`task result`从已核所属的实际原生journal及对应Agent自产transcript取得内容，采用成熟严格解析，检查身份、格式、读取一致性、单源12MiB及完整多Worker结果96MiB上限，不迁移、修补或换源。terminal只有有界输出时明确标注，不能作为完整成果通过。指定停止一项Worker时分别返回真实状态、已有部分和incomplete/unavailable/unknown；坏源或来源变化明确失败。其余Worker的完整成果、预定业务成功判据和全部相关资源退出/归档/释放仍为根Task完成条件；指定停止项保持停止状态，不追加其成功完成条件。旧A/B用例保留其原范围。本轮N=3须验证停止一项后其余至少两项保留原身份继续及一次同session追加输入，额度是上限，不强迫创建满额Worker。实际项目执行目标来自稳定AgentSelection并核现有批准；新数据根不预置Grant，服务启动不签发token。候选携带真实首次人工授权步骤及必要使用说明，真实结果按同一安装候选核验。

`run.export` 默认 `export_mode=results`，返回同一事务中已记录的任务结果快照：`schema=swa.recorded-results.v1`、`source=native_task_records`，逐任务标记 `available/missing`，保留 Run 的原状态、`complete`、`observed_at` 与 `acceptance=unreviewed`。`completeness` 仅描述任务结果是否全部存在；`audit=not_requested`。普通导出不读取原生日志，不等待整个 Run 结算；全部 Dispatch 必须有可核实的原会话绑定和凭据来源，最终完整响应经过所有相关账号的密钥过滤。读取日志期间整组记录不变的要求不适用于此快照。

`export_mode=audit`（CLI `swa export --audit`）保持完整原生成果及来源核验。`task.result` 保持原语义。多Worker完整结果按[容量任务](../tasks/swa-result-capacity-20261023.md)区分单源、汇总和实际传输：每个journal按UTF-8字节保持12MiB/100000行，结果JSON为96MiB，task.result/run.export响应为128MiB；其他动作响应保持16MiB。run/wait --export使用普通结果快照。Go默认转义和实际run_view/envelope也计入响应字节，两个总界分别拒绝，不截断或自动重发。当前容量选择基于原四份真实来源；完整N6及第二轮峰值仍须实际验证。

CLI输出和所属生命周期依准确b3f0e229已审方案§7.5及C01—C09实施。`--json`在stdout只发布一个完整结果，stderr保存诊断；已成功解析并校验的原请求ID及实际selector须在失败或取消时保留，未知身份省略。真实HTTP ErrorV1转换为既有CLI envelope，完整HTTP原件保存在既有`error.data`，HTTP trace与命令原请求ID各保留其来源；原生结果及错误数据保持。真实网络效果未知时只查询原请求，不重发；取消当前CLI等待返回130，不据此停止Worker。stdout实际不可写时将已知关联和实际影响保留到stderr并非零退出，不再次发布结果。

`serve`须处理自身所属stdin的EOF：readiness之前取消启动按130及一次未就绪失败结果收尾，退出无法确认时保留6；readiness之后只保留原一次readiness，后续诊断和实际关闭结果写stderr。真实Worker/helper已退出、归档/释放及关闭的空闲条件下，全部自有node/server及已观察后代明确退出才允许EOF正常返回0，已知子进程失败保留7、未知或残留保留6及占用。Windows取消验证使用本项独立隐藏console宿主及其中另行创建的新组CLI，核实际成员和创建身份后才定向发送控制事件；不能将组合创建标志当成新组证明，不广播到组0或附着原Orca控制台。缺少隔离、真实批准或资源窗口时保持未运行。

新代码遵守 §3 的 App 端口、adapter 和入口组装关系；来源副本与产品 composition 位于各自独立目录。需要改变上述动作、权限、状态拥有者、公开错误或模型范围时先修订本节及方案并重新审核相关测试。实际构建、安装及 T00—T15 的结果由任务和报告登记，计划接受不表示功能通过。

#### 21.1.1 本机 Agent 的独立发现与稳定选择契约

准确`740ccdf9a9dfa33901274fd8dccd37c4beacf1fd`的[方案§4.5.2—§4.5.5及§7.8](https://github.com/songconmaisaix31-design/swarm-anything/blob/740ccdf9a9dfa33901274fd8dccd37c4beacf1fd/docs/standards/swa-cli-headless-20261020.md)已由独立c3fca056局部接受。本节定稿其中的只读发现、设置源、capabilities DTO、稳定AgentSelection及现有批准的技术契约；程序实施仍须准确CR及实际运行。输入与模式路由见§21.1.2，控制端恢复见§21.1.3；用户工具范围仍按QUESTIONS中的实际决定执行。

`swa capabilities --json`沿既有项目token及POST `/api/v1/local-projects/{id}/orca/commands`的`{action:"capabilities"}`进入App observe准入。现有执行端口为`Capabilities(ctx, projectID, projectRoot, requirements)`，projectRoot仅取已授权项目的p.Root，经内部bridge/client及私有只读`swa.capabilities`传递。requirements来自当前App项目设置及适用批准，HTTP正文不能提供project_root、身份或工具授权。Go在调用前后核canonical root、当前项目root/settings revision及适用Grant；Node在异步发现前后核目录身份和实际Agent settings快照，变化拒绝结果。发现只给静态配置提供项目隔离上下文，不为全部Agent生成未消费的selection；无controller helper、模型请求或原Orca运行前提。

注册事实来自产品内抽取的definition与真实adapter构造的StructuredAgentRegistry，保留原生重复ID及能力方法校验。已注册、启用、已安装、已配置、可启动及start/send/read/stop/resume/tools分别给出实际来源和available/unavailable/unknown；静态名单、文件存在、声明能力及本次真实调用各有自己的来源，不能互相替代。发现不自动运行模型或建立Worker来刷新。

首次请求的静态门要求registered/enabled/installed/configured及control.start声明真实available，并使用服务返回的真实model；configured只证明已观察配置来源，不证明密钥有效、网络或模型访问成功。尚无握手的launchable/read/tools可保持unknown而不当作PASS，任一明确unavailable仍阻止相应请求。GUI与验收驱动不得要求这些未握手项全部available而永久阻止首次发起，也不得将unknown补成可用。GUI仅在当前项目CLI、settings revision/start许可和新鲜快照相符时派生可提交状态，按钮与onSubmit共门，原pending/unknown请求不重发。实际controller/worktree选型及当前Grant、账号、ToolsOff、输入、fence准入原样保留；真实Worker的ready/thread/turn、delta、停止及完整成果分别提供后验，静态发现不可复用为启动许可。Codex policy_ready中的remote_control_status='disabled'不单独证明全部工具关闭，仍须原native_launch.tools与固定native contract的真实验证。本轮局部静态/早拒及GUI错误权限路径通过不升级为合法配置、首次模型启动、N或改后安装通过；阶段细则见[共享执行合同](integration/openmausbot/01-contract.md)。

serve可显式接受`--agent-profile <既有原Orca profile绝对路径>`。省略时读取原生标准命令/defaults及本机Agent实际配置；指定时固定该只读源，复用classifyProfileStateStorage、openProfileStateDatabaseReadOnly/readProfileStateDomains取得同一snapshot中的settings/revision，legacy并存核原acceptance，JSON-only使用成熟JSON流筛选。明确源缺失、损坏或不匹配立即失败，不迁移、创建Store、写marker或更换来源。产品私有profile继续独立，秘密和原对话不进入清单、receipt或安装包。

结果在既有OrcaEnvelope.result中使用`schema:"swa.capabilities.v1"`，包含source_revision、registry的orca_version/artifact_sha256、discovery的local host/platform/observed_at及settings_source，以及agents清单。每项包含id、adapter、execution_mode、registered、enabled、installed、configured、launchable、control、requirements；状态对象使用`{status,reason,checked_at?,source}`。installed正向才返回真实executable/version，configured仅返回已证model/provider及非秘密账号来源类型。字段与生成契约按上述准确方案共同更新。

现有执行端口增加只读`ResolveSelection(ctx, projectID, command)`，返回稳定`AgentSelection{agent_id,adapter,execution_mode,executable,version,model,provider,external_target,settings_source,settings_revision,configuration_version,native_launch}`，原生政策按§21.1.5。App先核observe并取得实际选择，再按真实external_target、现有ProjectSettings.ExternalModelCLI单CLI批准、当前Grant、目录、工具和外发目标核动作；不继续硬编码pi，不接受HTTP声明的外发身份。实际选择进入既有原R的比较/原checkpoint，排除observed_at和凭据，不另建Hash或选择账本。spawn前再次核相同来源，变化拒绝，未知不换目标。后续输入只能从实际Dispatch的原receipt/session取得原选择，禁止用新参数更换Agent或模型。

当前接受范围包括上述端口、DTO及固定pi消费者的同步调整和对应G02/G03/G04/G05/G06必要检查；实际启动、输入和所选Agent支持能力仍遵守其准确方案及当前权限。首版最终同一安装候选、至少两个真实Worker、并发、指定停止和完整成果条件保持。

#### 21.1.2 实际 Agent 输入、模式与效果结算

准确`d441703a620f2e1bcca73edd50c7edc66dc92351`的[完整输入及模式方案](https://github.com/songconmaisaix31-design/swarm-anything/blob/d441703a620f2e1bcca73edd50c7edc66dc92351/docs/standards/swa-cli-headless-20261020.md)已由独立73946fd2接受N04/N05技术计划。本节定稿其接口和执行边界；同一Worker按原写域实施，实际调用与失败处理仍须验证。

后续正文使用私有durable方法`swa.workerSend`，固定为原`swa.controllerDeliver`请求R的原生子请求`R/native`。RuntimeClient版本包络及durable方法表同步登记。真正controller helper的兼容invocation ID必须来自实际启动证明；进入原executor和重放completed子请求之前，核当前parent R、项目、Run/root、Dispatch、consumer、launch证明及fence。无helper桥接只提供显式只读白名单，不能执行该写入。

structured模式使用真实StructuredAgentRegistry的definition/adapter及实际Dispatch/session/fence；将原生`mintAgentSessionOperationId`写入既有child checkpoint后，完整正文作为一个text block进入原`sendAgentTurn` structured分支和StructuredHost原队列。terminal模式须同时具备真实TUI配置和实际绑定的PTY launcher/controller，使用原`sendTerminalAgentPrompt`普通输入路径；核真实handle、PTY、incarnation、创建身份、正向Agent识别及readiness。选择中的execution_mode固定，实际模式不符立即拒绝，不切换模式或另建会话。

structured异步授权位于真实serialized handOver中、等待provider/options之后、handOverSubmission及adapter.dispatch之前；等待App当前批准后，再核同一child、consumer、session、fence、模型、工具及未停止/未释放。terminal在实际串行写队列出队后、每个chunk和submit前await beforeWrite，等待后重核实际身份和ownership，保留原同步身份guard。同步beforeRun只承担其原有规则。内部只读delivery-admission沿既有Go服务和App授权，内存capability仅在Go/Node间持有，不进入helper或Agent环境；普通token不能替代内部身份，反向查询不得形成Native事务或输入队列死锁。

child自身先持久记录实际模式、operation及正文关联，进入`input-submit`并markEffectPossible后才发生第一次host或PTY输入。此后异常、超时、失联、journal或receipt存储失败均返回`operation_unknown`，保留原child、parent、operation及占用，禁止重新生成或重发。效果前只有正向证明尚未输入，才能持久完成原child的真实`rejected/effects_applied=false`结果；结算失败继续unknown。handler先持久完成原receipt，再交外层完成，不能仅用mark或内存判断保全结果，不添加另一队列或账本。

结果关联使用`request_id,native_request_id,dispatch_id,agent,execution_mode,session_id?或terminal_handle?,operation_id,client_message_id?,state,turn_id?,source`。`journaled|queued|accepted|handed-to-terminal|rejected|unknown`必须分别来自真实原件；handed-to-terminal只表示PTY接受。request.show按原receipt及实际模式的journal/write关联只读查询，其他输入、指针变化或重启不改变原请求归属，不借查询重放正文。读取structured原生transcript；terminal来源有界或不完整时显式标明。stop/release核真实PTY custody及完整所属树退出；resume缺少原生证据时保持unknown/unavailable，不启动替代会话。

G07按原计划覆盖效果前拒绝、效果后child保全、真实存储失败、逐模式来源及模式冲突；没有实际命中的分支保持未验，不注入虚假异常。G08仍为安装后的同一候选、同一任务至少两个真实Worker、真实并发、指定停止、其他Worker保全和完整成果获取。技术契约不授予用户尚未确认的工具权限。

#### 21.1.3 控制端恢复与严格调用者校验

准确`079bd958260ac3edb9fda6c13bb9e28a0a08cd56`的[方案§3.4及§7.6](https://github.com/songconmaisaix31-design/swarm-anything/blob/079bd958260ac3edb9fda6c13bb9e28a0a08cd56/docs/standards/swa-cli-headless-20261020.md)已由独立7c6d3973接受P01—P03完整技术计划。本节定稿其全部12阶段准入矩阵、恢复边界及R01—R10覆盖，同一Worker继续实施。T11真实人类接管入口仍按独立待答项处理，不由恢复流程取得人类权限。

公开动作固定为`swa controller recover --controller C_old --request-id R --json`，复用现有项目token、endpoint和command字段，R使用canonical UUID并与Idempotency-Key一致；不接受调用者自报Run、generation、from、actor、PID或launch-token。只恢复同一实际原Run/root/context及现有Worker/Dispatch，使用当前start授权、设置版本、目录及外发批准；旧helper/root/PTY须有正向退出证明。以实际新helper执行固定`R/controller-pty`和`R/run-use`，新consumer_generation禁止旧身份继续写入。

私有durable方法`swa.controllerRecover`复用既有executor、receipts及checkpoints。原SQLite事务以BEGIN IMMEDIATE保留project/旧C/Run/root/旧owner及generation归属，然后才允许异步PTY效果；不新增数据库、Hash或请求账本。同R已完成仅返回原结果，pending只观察原checkpoint/子receipt，禁止再创建PTY、输入或执行runUse；不同R不能绕过未知占用。只有原run-use明确完成、实际新owner和Run/generation完整证明、旧owner退出及root/context不变，才能完成原outer R。

`scope-reserved`阶段明确无外部效果时，只有旧owner存活等正向证明及原生无效果拒绝结算成功才释放保留；结算未知继续保留。第一次可能createTerminal之前持久进入`pty-spawn`并markEffectPossible，此后异常统一operation_unknown并保留原R/占用，不能依赖原executor对普通异常的默认删除。严格身份检查位于legacy RPC、原executor及completed重放之前；pending open、首次run-create/root taskCreate、pending recover ready/run-use、普通写入、restored及completed请求逐项按上述准确12阶段矩阵校验，unknown caller无声明handle回退，无helper桥接不能写入或接管。

所属daemon使用原PID记录扩展的真实Job名称、PID/创建时间、root、安装来源和session关联。Windows使用当前用户/SYSTEM ACL的随机命名Local Job，daemon在派生前加入，不设置kill-on-close或breakaway；只有原serve已退出且实际内核成员及协议/token握手一致才重新打开同一Job，不新建Job冒充接续或接管无法证明的进程。空闲退出要求全部Worker释放、无pending、所有controller关闭或已证明恢复、daemon退休，并经两次完整Job查询确认只剩所属daemon。

recover全链路使用既有2/3/4/5/6/7/130退出语义：明确效果前依赖失败为4，可能已产生效果的网络或stdout失败为6，实际取消为130；只输出一个JSON，保留原R/C_old及实际已知C_new/Run/root。R01—R10在准确安装候选和真实条件下逐项执行；未命中的取消/失联阶段保持INCONCLUSIVE，不加入暂停、延迟或伪造hook，不重放未知输入。

#### 21.1.4 真实注册与项目单CLI批准

准确`16ad5ef6fdbef17b54d8ce04224f0dca3abfafc3`的[方案§12](https://github.com/songconmaisaix31-design/swarm-anything/blob/16ad5ef6fdbef17b54d8ce04224f0dca3abfafc3/docs/standards/swa-cli-headless-20261020.md)已获独立b64c90d0技术接受。本节定稿其接口，同一Worker补齐注册、人工单CLI批准及稳定选择的直接消费者；只证明注册，不据此判定安装、账号、工具或可启动。

Workspace App声明`ExternalCLIRegistry.ValidateExternalCLI(ctx context.Context, cliID string) error`，项目服务沿原构造器创建，通过`ConfigureExternalCLIRegistry(port ExternalCLIRegistry) error`在HTTP开放前一次绑定；nil或重复绑定立即失败。配置Orca时，仅非空ProjectSettings.ExternalModelCLI使用同一真实orca adapter的注册验证端口，端口失败不换来源、不保存设置；未配置Orca的原产品保持原NativeRegistry.Adapter校验。HistoryRoots、旧S3会话及NativeAdapter仍使用原注册者，AllowedTools限制保持，不填空adapter或静态ID放行。

新增只读bridge请求`{operation:'registered_agent',agent_id:string}`及私有Native方法`swa.registeredAgent({agent_id})`，字段均strict且ID非空。此方法进入私有owner只读白名单，不接受调用者、批准、Grant或可转发方法；新项目设置校验不以已有ExternalModelCLI或Agent Grant为前置。Native从实际registration(id)取得definition/adapter；terminal仅在真实TUI配置和已绑定PTY launcher/controller存在时登记。不调用原Orca RPC、不执行全量发现、命令version probe、会话或模型，未知注册明确失败。

原OrcaEnvelope.result内的`RegisteredAgent`固定为`{schema:'swa.registered-agent.v1',id,adapter,execution_mode:'structured'|'terminal',registered:true,source:{kind:'structured-registry'|'tui-launcher'},source_revision,registry:{orca_version:'1.4.230',artifact_sha256},runtime:{runtime_id,authority_domain,data_root,install_root}}`。bridge返回`{envelope:OrcaEnvelope}`；Native读取同安装VERSION和runtime/host.cjs来源，runtime及authority来自实际运行与原SQLite，根路径为实际canonical路径。原RPC metadata和source fence保持，外层runtime_id取真实响应_meta.runtimeId。

Go严格解码并逐项核ok且无error、schema/registered、Agent ID与原请求CLI一致、非空adapter、成对mode/source、同安装完整40位VERSION/host.cjs来源、内外实际runtime/authority及Config的canonical私有data/install根；任一字段缺失、不匹配或传输失败立即返回，全部通过才允许设置验证。来源摘要只核既有安装身份，不另建执行状态或Hash系统。适用真实检查包括旧四CLI之外注册ID的人工批准、未知ID/未绑定模式/不可达失败且设置不变、选择与批准不符时模型前拒绝，以及无Orca旧行为、HistoryRoots/S3、身份/工具/revision回归；全部动态结果按实际执行记录。

#### 21.1.5 原生账号、关闭工具及实际请求政策

准确`9e46579df4a073d1d67fc74c198274e0178e4147`的[完整方案§13](https://github.com/songconmaisaix31-design/swarm-anything/blob/9e46579df4a073d1d67fc74c198274e0178e4147/docs/standards/swa-cli-headless-20261020.md)已获独立f5dc49f7限定技术接受。本节定稿其稳定字段、逐类原生投影和直接消费者，同一Worker在原写域实施；技术接受不表示当前账号、工具、全部Agent或模型可用。发现/注册与实际控制分开，没有已审原生政策的相关动作在首次效果前明确unknown/不支持，不将全部发现加拒绝计为交付。

成功执行选择的`AgentSelection.native_launch`为strict非秘密对象，Go/Node/Zod/JSON Schema/OpenAPI及直接消费者同步，公开HTTP不能提交任意政策、账号、argv、caller或批准：

```typescript
type NativeLaunchPolicy = {
  schema: 'swa.native-launch.v1'
  account: {
    kind: 'pi-native-api-key'
    provider: string
    source_home: string
    auth_source: { path: string; version: string }
    models_source: { path: string; version: string } | null
    private_home: string
    model_target: { model_id: string; api: string; base_url: string }
  }
  tools: { mode: 'disabled'; native_contract: 'pi-cli-1.0.1' }
} | {
  schema: 'swa.native-launch.v1'
  account: {
    kind: 'opencode-native-api-key'
    provider: 'deepseek'
    source_home: string
    config_source: { path: string; version: string }
    auth_source: { path: string; version: string }
    database_source: { path: string; version: string }
    credential_id: string
    credential_updated_at: number
    private_root: string
    model_target: {
      model_id: 'deepseek-v4-pro'
      api: 'opencode-native-deepseek'
      base_url: 'https://api.deepseek.com'
    }
  }
  tools: { mode: 'disabled'; native_contract: 'opencode-cli-2.0.31' }
} | {
  schema: 'swa.native-launch.v1'
  account: {
    kind: 'codex-native-api-key'
    provider: 'openai'
    source_home: string
    auth_source: { path: string; version: string }
    catalog_source: { path: string; version: string }
    private_root: string
    model_target: {
      model_id: 'gpt-5.5'
      api: 'openai-responses'
      base_url: 'https://api.openai.com/v1'
    }
  }
  tools: { mode: 'disabled'; native_contract: 'codex-cli-0.163.0' }
} | {
  schema: 'swa.native-launch.v1'
  account: {
    kind: 'claude-native-api-key'
    provider: 'anthropic'
    source_home: string
    auth_source: { path: string; version: string }
    private_root: string
    model_target: {
      model_id: 'claude-opus-5'
      api: 'anthropic-messages'
      base_url: 'https://api.anthropic.com'
    }
  }
  tools: { mode: 'disabled'; native_contract: 'claude-cli-2.1.284-sdk-0.3.284' }
} | {
  schema: 'swa.native-launch.v1'
  account: {
    kind: 'pi-native-api-key-per-session'
    provider: string
    source_home: string
    auth_source: { path: string; version: string }
    models_source: { path: string; version: string } | null
    private_root: string
    model_target: {
      model_id: string
      api: 'openai-responses' | 'openai-completions' | 'azure-openai-responses'
      base_url: string
    }
  }
  tools: { mode: 'disabled'; native_contract: 'pi-cli-1.0.1' }
}
```

上述联合按account.kind及对应tools.native_contract严格验证；两个Pi分支共用`pi-cli-1.0.1`，其他Agent的工具合同不能错配。本节后续Pi来源、目标和原生参数规则同时约束两个Pi分支，目录布局和主动输入准入则按各自kind区分；OpenCode原生合同见§21.1.6。credential_updated_at为原生credential.time_updated的实际Unix毫秒，不能用观察时间替代。Codex新增分支已通过接口审查，直接消费者正在实施；字段定稿不表示真实账号、工具集合、Worker或模型已验。其auth_source固定为显式source_home下auth.json，catalog_source为实际安装根的`runtime/codex-policy/models.json`，内容须匹配固定官方完整原件。private_root为实际`SWA_DATA_DIR/codex/<projectId>`，每Worker的CODEX_HOME为其下`<sessionId>`，复用原LegacyAccountHome的CODEX_HOME变量/路径表示。selection继续绑定实际executable、version=0.163.0、model=gpt-5.5、provider=openai和configuration_version，不新增凭据ID、邮箱、账号值或独立配置账本。

Pi新增`pi-native-api-key-per-session`的strict合同，`private_root`精确指canonical `SWA_DATA_DIR/pi-workers/<实际projectId>`项目容器，不能带private_home或请求者提供的session字段；旧`pi-native-api-key/private_home`字段及解析语义保留。新主动start/send拒绝旧kind，须有完整已审policy、当前source、Grant与原输入批准；旧记录查询与原资源的安全stop/release继续沿原record、lease、provider handle和完整退出证明，不重新选择新分支。Schema解析或生成类型通过不替代这些实际准入门，也不表示账号、受管输入或模型已验。

Codex通过官方`login --with-api-key`的私有stdin向各Worker独立HOME导入获准API key；登录子进程和app-server分别沿真实Job或Linux D结算，登录未知时不能重导入或提前启动模型进程。来源仅为显式`SWA_CODEX_API_KEY_HOME`，空配置允许服务启动并报告Codex未配置，合法目录缺auth同样未配置，不回退普通CODEX_HOME或读取原ChatGPT凭据。来源路径、当前账号、工具政策、原始事件、完整成果及平台归属须分别核验；设置路径本身不代表账号可用。Go/TS/Schema和直接消费者同步实施，维持原HTTP action/envelope，不自动取得人类会话或Grant。

Claude单分支合同已冻结，直接消费者正在实施，字段通过不表示账号、SDK启动、ToolsOff或模型已验。固定实际CLI2.1.284与SDK0.3.284，selection的model/provider为claude-opus-5/anthropic；SDK的实际sdk.mjs、package和manifest同根来源进入configuration_version及当前来源检查。auth_source仅为显式`SWA_CLAUDE_API_KEY_HOME/settings.json`的真实版本，只接受严格`{env:{ANTHROPIC_API_KEY:<literal string>}}`，其它字段或来源整体拒绝；不回退原账号、读取OAuth/AUTH_TOKEN或执行helper。source实际根owner-only并与账号、安装/data、私有根和项目双向隔离，普通祖先不要求0700。private_root固定实际`SWA_DATA_DIR/claude/<projectId>`，各session的configRoot为其下`<sessionId>/config`，原accountHome保留`CLAUDE_CONFIG_DIR`变量/路径；key只在内部快照及受控child环境中，不复制来源settings或增加credential ID/config_source。bare禁用OAuth/keychain，不能把原OAuth登录作为该路线可用的证据。准确公开来源与未验范围见[适配矩阵](integration/openmausbot/02-agent-matrix.md)。

Claude的固定native contract要求bare、tools空、disable-slash、strict空MCP和无session hooks等完整组合，并核首次启动前的政策面与每轮实际输入，不能以literal或事后的system/init工具数组替代安全门。SDK Query构造会发起或排队initialize；owner持久化后ready核真实身份并等待该原promise与受限metadata，不重复请求或伪称延迟初始化。实际SDK对象JSONL标为actual_sdk_messages，与CLI原始JSONL全文、原journal分别保留；原R/body/session/fence及真实user replay UUID须关联到原件主链和最新输入，result UUID不冒充user UUID。完整树、durable来源/handle/journal和最终库存校验通过后才发布退出；原root退出不替代该证明。相关实现和平台验收仍另行记录。

Codex每个新thread固定真实model/provider、`environments:[]/selectedCapabilityRoots:[]/dynamicTools:[]`、禁止模型fallback且持久化；不得用`cwd/runtimeWorkspaceRoots`重新引入环境。原生reply须提供并核对实际thread/model/provider/history/path，缺失时拒绝或保留unknown，不以请求参数补造。每次turn/start固定原thread、本次输入的原clientUserMessageId、model和空environments，只允许批准的纯文本；活跃turn的同会话追加沿原turn/steer与实际expectedTurnId，绑定本次send自己的原R/operation/clientUserMessageId，不复用start的operation，也不增加目录、工具、模型或capability覆盖。启动的strict config、完整工具组合门、当前来源与项目权限在投递前再次核验；API-key或模型catalog不替代ToolsOff证据。

Codex真实通知在journal合并前写入原`provider-events.ndjson`，保留同session/fence的序号、host观察时刻、原生method/params与已审raw line；delta来自实际agentMessage/reasoning通知，不能拆分最终assistant全文。该来源和完整rollout/journal分别保持单源12MiB，并共同计入96MiB完整结果上限，保留FD有界读、前后SourceVersion及秘密检查。原opaque native响应的`source.process/source.owner_process`是bootstrap所属身份：Windows保持`{pid,creation_time_ms,runtime_id}`，Linux为`{platform:'linux',pid,boot_id,start_ticks,owner_uid,runtime_id}`，ticks/UID为十进制字符串；native CLI身份单独取真实custody观测，不代替lease PID。最终tree事实由受控Tree的只读`readFinalObservation()`取得，未知或processless不返回完整tree proof；原root退出、stderr JSON或interrupt回执不足以释放。只有实际最终事实成功持久化后才能向session host发布退出；真实未创建bootstrap的processless沿原独立受证分支处理。这些新增来源由实际消费者另验，不以689的D14替代，也不增加无人消费的JSON Schema定义。

路径为实际canonical来源，version沿原配置snapshot的实际文件身份/版本；models_source=null要求实际不存在，后继出现视为变化。政策与原settings source/revision/configuration_version、原R/checkpoint共同固定原生选择，不保存凭据或另建账号账本。model_target绑定实际合成modelId/API/baseUrl，成熟URL解析拒绝账号信息、秘密查询、动态模板和未批准目标。Pi分支API只允许已核最终请求消费者的openai-responses、openai-completions、azure-openai-responses；OpenCode、Codex及Claude按各自上述固定目标，不换模型或来源。

原账号目录只读。原auth只接受该provider实际支持的原生api_key条目及literal key；非空credential.env、OAuth/refresh、models apiKey/oauth、命令或环境引用拒绝。auth和models使用成熟JSON及原ModelConfig的JSONC/schema，准确方案§13.3逐类表作为本节固定字段和投影清单：只保留所选provider/model/override及原composer顺序；未知有效字段、无法唯一合成的目标、虚拟模型、候选/网关路由拒绝。key及三层headers用同版本isCommandConfigValue/getConfigValueEnvVarNames只读分类，保留原生literal与转义语义；Headers成熟解析，大小写不敏感拒绝Authorization、Proxy-Authorization、X-Api-Key、Api-Key、Cookie、Set-Cookie。不能原块复制、删除不允许字段后继续、改凭据类型或复制refresh来宣称原账号保全。

用户允许阶跃星辰测试后，采用独立17e440ea限定接受的`native-pi-custom28-plan.md`准确4E698ACC及实际API源码补充msg_48f93338842d：Pi1.0.1的custom provider复用原ModelConfig和composeModelProvider，以空base、无extension合成实际配置的唯一所选模型，并核原生stored api_key handler。新增custom目标只允许`https://api.stepfun.com/v1`或`https://api.stepfun.ai/v1`及末尾斜线，API仅openai-completions；拒绝非默认端口、userinfo/query/fragment、其他host/path/API、缺失/重复模型及只依赖override的目标。builtin分支保持原唯一base规则；原字段、literal key、空env、无OAuth/routing/非空sampling/认证Header覆盖和私有账号规则继续适用。真实compat、openai-completions.lazy及openai-completions实现纳入读取前后及每次效果前的来源身份复核，使用原getApiProvider实际handler；NativeLaunchPolicy/AgentSelection字段、原CLI、工具关闭、Job、输入和完整成果合同保持。独立来源可由已有SWA_DISCOVERY_PI_HOME选择；真实key来源尚未取得时，只记录实际静态和拒绝检查，正向模型及双Worker保持未验。

原model、所选override、内置及合成model的samplingParams只允许缺省或空对象，任何自有字段使整源拒绝。产品不开放每请求options/samplingParams/provider/onPayload/headers变换或任意RPC透传，逐命令strict DTO只提供原prompt/steer/follow_up、abort、状态、准确模型/thinking及固定关闭设置；当前固定输入仅text，prompt只含message、原生streamingBehavior和原请求标识。真实RPC→session.prompt→Agent loop→sdk/ModelRuntime的生产者、空扩展/资源及私有设置共同封闭请求覆盖；不能仅以get_state或no-tools证明最终请求安全，不替换原生provider或事后重写请求。

旧`pi-native-api-key`的private_home固定DataRoot/pi/<实际项目UUID>，保持历史项目共享HOME原义；它不能被悄改为容器或session路径。旧解析不授予新输入许可，已有记录不迁移、不覆盖账号或改写原selection/R。来源不足的旧完整成果明确不可用，安全stop/release独立保留原资源路径。

新分支要求controller.open只准备空项目容器，发现不复制账号；实际HOME为`join(private_root,真实Orca sessionId)`。create流程先生成UUID并登记StructuredWorkerIdentity，再由accountHome准备初次projection，随后持久化同一record/lease；首次无record不能补造身份。只有本次exclusive创建成功才写受控auth/models/settings，EEXIST不等于fresh，不覆盖或修复旧目录。已有record只核同原R/Dispatch/session及HOME，不重新导入；auth、settings、models-store、cache、sessions及临时/XDG目录均从本Worker HOME派生，不在项目容器共享。原来源保持只读，只在当前Grant/CLI/model/tools批准后投影明确已授权的API来源，不克隆旧profile。秘密写入前仍须建立并核验Windows当前用户/SYSTEM保护DACL，或Linux实际owner及HOME的0700权限，拒绝重定向、未知owner、其他写入主体和与原账号/Orca/安装根重叠；这些路径与来源门由实际消费者实现并验证。

内部`StructuredAgentLaunchAdmission.accountHome(sessionId,agent,currentHome):Promise<AgentSessionAccountHome>`从create前已登记的真实Worker identity/Dispatch及原父子R解析原选择。在prepareStructuredAgentSessionCreateForWorktree的resolve intent后、attach fingerprint前，新分支将`{variable:'PI_CODING_AGENT_DIR',path:join(private_root,sessionId)}`写入同一record；旧记录中的private_home原值不改。Pi原生get_state.sessionId与Orca sessionId分别核真实来源，不能要求相等；sessionFile须属于本Worker HOME/sessions。实际launch part完成后复核command/accountHome/env/argv，仍用原CLI、provider-process和seal；未知输入保原R和原HOME，不另建session或重投。

受限builder只在精确contract/实际版本及toolsOff政策成立时允许fullAccess=false；不得强设full-access。固定argv为--mode rpc、--offline、--no-approve、明确--provider/--model、--no-tools、--no-extensions、--no-skills、--no-prompt-templates、--no-themes、--no-context-files；原记录需要的绝对--session/--fork互斥，全部extraArgs拒绝。环境仅保留SYSTEMROOT、WINDIR、SYSTEMDRIVE、COMSPEC、PATHEXT、PATH、NUMBER_OF_PROCESSORS、PROCESSOR_ARCHITECTURE、PROCESSOR_IDENTIFIER、OS、LANG、LC_ALL、LC_CTYPE、TERM、COLORTERM及既有HTTP_PROXY/HTTPS_PROXY/ALL_PROXY/NO_PROXY，再明确写产品私有HOME/USERPROFILE/APPDATA/LOCALAPPDATA/TEMP/TMP、项目账号根、PI_OFFLINE=1、PI_SKIP_VERSION_CHECK=1和原seal身份。Linux固定NODE_USE_SYSTEM_CA=1使用系统信任库，TLS校验保持，任意外部NODE变量仍不继承。其他账号/key、NODE_OPTIONS/NODE_EXTRA_CA_CERTS、owner capability及原Orca身份不继承，网络配置值不输出或改动。

私有settings固定compaction.enabled=false、retry.enabled=false、retry.provider.maxRetries=0、cacheWarming='off'；用真实set_auto_compaction/set_auto_retry成功回执再次关闭，并核get_state.autoCompactionEnabled=false，retry结合原回执/同版本源码/实际私有设置，不造状态字段。原生setter回执不证明异步磁盘save完成；新分支要求以同官方proper-lockfile4.1.2、同settings路径和realpath:false进行锁内有界读，实际stdin.write前再取新同步锁窗并末核，不能以每Worker HOME或早期snapshot代替。具体内部端口按下列冻结目标实施，实际执行仍待验。offline仅关闭原生启动刷新；模型仍须完成真实provider请求。no-approve/no-context-files不证明关闭cwd/.pi/settings.json；新分支先要求固定cwd该文件在首spawn及每次效果前均不存在，出现即拒绝，不换cwd或删字段后继续。

**Pi内部B合同：冻结目标，实际执行待验。** 以下只扩展既有provider、queue、timeline、admission及成果消费者，不增加HTTP、NativeLaunch字段或JournalStepWriter/store协议。普通非SWA行为保持；A的形状/serde/示例结果不证明这些接线已经完成。

来源与私有metadata的明确入口为：

```typescript
declare function requireNativePiSourceHome(input: {
  sourceHome: string; protectedRoots: readonly string[]; env: NodeJS.ProcessEnv
}): Promise<string>
type PiApprovedModelMetadata = {
  provider: string; models: readonly PiModelDTO[]
  modelsSource: NativeConfigurationSource | null
}
declare function inspectPrivatePiModelMetadata(input: {
  sources: NativePiSources; privateHome: string; provider: string
  target: NativePiModelTarget
  expectedModels: NativePiPerSessionSnapshot['models']
}): Promise<PiApprovedModelMetadata>
```

requireNativePiSourceHome只核canonical普通私有目录和双向protectedRoots隔离，不读auth/settings或返回key。discovery无已授权projectRoot时报告unknown且不读；有项目时须在任何settings/auth读取前调用，full inspect新增required protectedRoots并在dynamic import/config/auth前再次调用。protectedRoots覆盖真实项目、原/managed账号及profile、安装/DATA、明确source和既有受保护根；不存在的保护根只核祖先与规范拼接，不伪造文件版本。固定官方1.0.1原件及已审启动/纯metadata模块清单先核字节hash和身份，再保存SourceVersion并在效果前重核，不能只凭manifest.version、首次stat或另一副本的hash。Pi discovery的版本效果也先过该来源门，再用已pin装内Node执行同entry的有界--version和固定安全诊断；受限launch不重复probe、不读取previous/sessionFile/forkFile，出现则拒绝，不借旧resume切换HOME。

私有目录入口为initializePrivatePiWorkerRoot():Promise<string>、createPrivatePiProjectRoot(projectId):Promise<string>、createPrivatePiSessionHome(privateRoot,sessionId):Promise<string>；后者由materializePrivatePiSessionAccount(snapshot,sessionId):Promise<string>直接消费，verifyPrivatePiSessionAccount(snapshot,sessionId):Promise<void>只校原HOME。host初始化worker根，controller.open只准备空项目容器；实际mint/register后才exclusive创建HOME。metadata函数必须在该HOME已materialized且record真实存在后，以实际私有models文件或已证absence调用固定官方纯ModelConfig/composer，前后核投影/版本，不接收key、不调用auth/refresh/ModelRuntime。policy保存该真实approvedModelMetadata；原get_available_models回执另保存observedAvailableModels={sourceSequence,models:实际完整数组}，逐项核批准metadata、重复pair/额外provider及selected tuple恰一次，不将纯metadata冒充available，不过滤原回执或伪造默认库存。配置默认context/token/cost不构成远端能力或实际账单证明。

disabledPiTools factory在当前批准/record/session/fence后创建唯一policy，launch与session复用同一实例。connection在实际managed spawn紧前同步调用assertSpawn(launch:ProviderProcessLaunch):void，消费最终sealed argv/env并核当前Grant、来源及受限启动配置，调用与spawn之间不插入await。attach(tree)只绑定原tree；真实onSpawned提交host owner后，ready(connection,{acquisitionGeneration:实际PiRpcSession.generation}):Promise<PiRpcState>才核tree.ready、owner/root/native并durable写首custody，再接管原set_auto_*和get_state。preowner unsolicited DTO直接失败，不缓存等后补owner。verifyCurrent只在入native队列前执行真实RPC；assertCurrent与末写守卫同步且不发RPC，避免在active queue等待自身。

同entry的共享写入类型为：

```typescript
type ProviderWriteCleanup = () => void
type ProviderWriteFinalAdmission = () => void | ProviderWriteCleanup
type ProviderWriteAdmission = () => Promise<void | ProviderWriteFinalAdmission>
type ProviderWriteSettlement = {
  outcome: 'resolved' | 'rejected'; writeAttempted: boolean; cleanupCompleted: boolean
}
type PiRawContext = { sequence: number }
type PiWriteContext = {
  frame: JsonlRpcRecord; line: string; clientMessageId?: string
}
type PiLocalFailure = {
  stage: 'source' | 'approval' | 'settings' | 'write' | 'protocol' | 'stdout' | 'custody' | 'persistence'
  code: 'source_changed' | 'approval_changed' | 'settings_unverifiable' | 'write_unsettled'
    | 'protocol_unverifiable' | 'stdout_incomplete' | 'custody_unverifiable' | 'trace_unavailable'
  writeAttempted?: boolean
}
```

queue的write(line,signal?,beforeWrite?,onSettled?:(fact:ProviderWriteSettlement)=>void):Promise<void>保留原前三参数；beginClose(error:Error):void只停止新条目和未写输入，不拆reader/已发pending。prompt在真实queue entry的异步批准、无settings锁阶段调用prepareInput(clientMessageId,frame):Promise<()=>void>：同步读取原binding.body，经成熟preparePiRpcPrompt异步准备并与实际frame比较，返回同步重核原binding/frame的闭包，组合进最后finalAdmission；prepare不表示accepted、不写stdin或新增pending表。顺序为await旧批准/early检查及prepareInput（无锁）→同步finalAdmission/输入重核/assertCurrent→policy.beforeWrite取得本次acquirePrivatePiSettingsGuardSync(settingsPath)并有界读，再核prepared input、当前binding和line序列化frame一致后，核真实native前缀基线/fsync write_intent→writeAttempted=true紧邻实际write→finally close FD/release→callback/drain齐备→同步onSettled→resolve/reject，成功才flush。guard只暴露assertCurrent/release，不跨RPC或模型等待；真实cleanup未结算不能先terminal，写后失败不得变neverReachedAgent。onSettled持久化失败须抛固定safe错误，使queue永久terminal，不靠不抛的failure通知假装阻住下一项。

peer/connection的request(command,params?,options?):Promise<unknown>新增options.id、beforeWrite和onReply(frame:JsonlRpcRecord,context:PiRawContext):void，保留timeoutMs。id只取真实Submission.id/operation，Map.set/写前查碰撞，不换id重试；使用唯一原pending表，30秒prompt ACK期限含批准与排队。strict raw在任何warn/return/delete前取得同pending上下文，递归strict DTO、重复键、秘密和来源检查/append后同步onReply，最后才删entry/清timer/resolve；unknown、重复、timeout后id与idless不当下一项ACK。原line保留，不由本地错误造native帧；8MiB行、真实末LF/fatal UTF8/EOF与单源12MiB/100000行门继续，多Worker完整结果另受96MiB汇总界。ACK只表preflight，不能触发accepted；新受限lane只从唯一完整user message_end回显关联原Submission，agent_start只开cycle。真实accepted早于ACK时不能被后回执倒写，peer永久失败不因late ACK复活。

timeline发布只报告原transition真实resolver、appendSteps的wrote及bound.publish事实：

```typescript
type ProviderTimelinePublishedReport = {
  journalEpoch: string; published: boolean
  steps: readonly (
    | { kind: 'item'; written: boolean; itemId: string | null }
    | { kind: 'settlement'; written: boolean; settlementId: string }
  )[]
}
type PiObservedProjection = {
  sourceSequence: number; eventType: ProviderTimelineEvent['type']
  clientMessageId?: string; acquisitionGeneration: string; providerItem?: string
  report: ProviderTimelinePublishedReport
}
type SwaPiSessionPolicy = {
  nativeContract: 'pi-cli-1.0.1'
  assertSpawn(launch: ProviderProcessLaunch): void
  attach(tree: SwaProviderProcessTree): void
  ready(connection: PiPolicyConnection, context: { acquisitionGeneration: string }): Promise<PiRpcState>
  verifyCurrent(connection: PiPolicyConnection): Promise<PiRpcState>
  assertCurrent(): void
  prepareInput(clientMessageId: string, frame: JsonlRpcRecord): Promise<() => void>
  beforeWrite(context: PiWriteContext): ProviderWriteCleanup
  rawRecord(frame: unknown, line: string, response?: { id: string; command: string }): PiRawContext
  writeSettled(context: PiWriteContext, outcome: 'resolved' | 'rejected',
    phase: { writeAttempted: boolean; cleanupCompleted: boolean }): void
  beginStop(input: { turnId: string | null }): void
  projectionPublished(observed: PiObservedProjection): void
  failure(reason: PiLocalFailure): void
  closed(): void
}
```

onPublished(report)沿transition→plan→assembler→lane传递；itemId来自实际resolver和原agentJournalItemKey，settlementId不推成全部mutation keys。只有wrote为true才称写过，published还须真实bound.publish返回；no-op报告false。held entry保同cause的sourceSequence/observer，text.delta进入coalescer不虚报落盘，text.close/flush才带真实report；报告含前序barrier不等于全由当前帧创建。projectionPublished(observed:PiObservedProjection):void只消费实际回调，仍须replay SQLite核epoch/row/结算，不能用callback发生或admission替代written。input.accepted可能仅改变opener，不补造user row，也不发不存在的user.message/assistant.message timeline事件；custody_closed后的本地生命周期tail不带伪造native sourceSequence或追加native投影。

关闭端口beforeExitPublication?:()=>Promise<void>和兼容void|Promise<void>的onExit只共享一个latched publication Promise，固定次序为：

1. beginClose停新写，保raw/pending及真实已写callback，等待真实EOF和D trusted完整final。
2. await beforeExitPublication，仅finalize/flush/retry现native projections→drained→sink.written恰ok；不close、不等待自身verifiedExit，不提前turns.end/session.ended/release。
3. 同policy.closed()核写入、source、EOF、D和上道barrier，durable custody_closed；已核取消允许完整关闭来源，模型仍是partial。
4. 调用并await原onExit返回的exitDelivery；此时才生成原生命周期tail，strict lane不使用旧2秒race，tail真实drained/written后才发原void onLifecycle ended。该事件不声称已await宿主全部lease写。
5. 最后置verifiedExit、通知listeners、允许close成功和releaseAfterExit。session/adapter close、acquire异常、retained connection及下次acquire都消费同一链，不能借raw lastCloseResult/root gone旁路。失败/超时保持unknown和原资源，不吞错误后release；preowner异常只做真实D独立cleanup，不造leaseowner或closed来源。

policy通过inputBinding(clientMessageId):StructuredInputBinding同步读取原reserveInput/beforeInput checkpoint，缺失/多条、body fingerprint、session/fence或字节变更即拒，不新建请求表。writer cid同时核host Submission；write_intent中的真实submit前native文件基线为已证ENOENT或同FD完整前缀/leaf，不借以前相同正文。user echo、原native文件条目和journal按全部字段/真实顺序逐一对应；native entry id只取文件，raw message_end早于append不表文件已持久。task-result沿真实parent/child R、latest submittedSequence与原journal核最新输入后的完整assistant/settled/idle；snapshot all与observed available分开，pending/queued/unknown、取消或length不能用旧complete通过。

结果沿现Witness/nativeChecks/finalNativeChecks，在全部异步读取后紧贴发布/导出同步重核raw/native FD/path/SourceVersion及前缀、journal epoch/last sequence、latest R库存、root children/Worker资源、原fence、独立owner runtime与service epoch及D final/实时owner，再无await导出。原生JSONL append无fsync只称observed；不能由物理D退出补raw/模型完整。failure(reason:PiLocalFailure):void永久保存首个固定失败并阻新效果，不抛二次异常妨碍收尾；writeSettled自身保存失败仍须向queue抛safe错误以阻flush。原错误/stack/credential不进trace或logger，未知字段/错误默认拒。合法stop只在真实beginStop与原host stop receipt下接纳完整取消DTO的精确Request aborted/Request was aborted，不用子串或aborted标签放行任意error，不把内部stop_id当原R。

factory input `approveStop():()=>void`首次沿唯一pending的原parent/child stop R捕获cleanup闭包；idle cancel和直接requested close也须幂等进入beginStop。后续stopping仅允许abort/get_state，闭包同步末核原row/hash/fence/owner/consumer及资源，不重新借用新输入Grant；source/account和永久failure门继续生效。

Linux新Pi分支沿完整已审policy/source/current Grant进入主动准入；`PiRpcSession.assertOwnedJob()`遇Linux observation必须存在该policy并同步调用`policy.assertCurrent()`，不套Windows成员结构。Windows仍核原Job assigned、root未退及真实native CLI的members/creationTimeMs。strict JSONL constructor以同policy走独立路径并提前return，不调用旧`observeProviderRecord`；该旧函数仍仅支持Windows中性投影，Linux拒绝保留，OpenCode的Linux保护也全部保留。两处主动阶段入口在上述前置下准入。

真实无账号CLI窗口已验证两项metadata请求、EOF及完整D；原两回复随后通过完整严格DTO离线消费。该证据不覆盖生产受管peer、Host/Grant、真实input/abort/原生JSONL/完整成果、ToolsOff实际交互、模型、N3、Windows或新同S安装。统一coherent strict/契约/架构及准确候选仍须完成；原403形状、33项Go serde和264示例仅复用其A范围，不升级为B或平台执行通过。

原生API key没有TTL字段时有效期为unknown，其余条件满足可以真实请求，账号远程有效性仍由实际结果证明。有实际明确期限的来源每次要求`expires_at - 当前时间 > 本次已批准最长执行时间 + 30秒`，期限或执行上限缺证、余量不足或到期拒绝；此未知拒绝不适用于原格式没有TTL的key。可能输入后继续按§21.1.2保全原R/operation/Job，不重选或重放。

准确方案§13.6全部真实检查进入同一Worker计划：真实账号/明确模型、用户单CLI和空工具批准、原生子树/argv/env/私有文件及自产JSONL、实际工具效果、逐类来源/路由/请求覆盖和TTL边界、首次及后续输入、同安装候选双Worker/停止A/B同会话成果。仅用获准真实来源，未命中记INCONCLUSIVE、不伪造协议或时钟；工具/T11待答及旧Codex/S3各自限制保持。

#### 21.1.6 OpenCode原生执行及完整成果

**StepFun 与 Linux 接入增量。** NativeLaunch.account 新增严格分支 `kind:'opencode-native-stepfun-api-key'`、`provider:'stepfun'`，复用 OpenCode 的 `source_home/config_source/auth_source/database_source/credential_id/credential_updated_at/private_root` 字段；`model_target` 固定 `{model_id:'step-3.5-flash',api:'openai-completions',base_url:'https://api.stepfun.com/v1'}`，tools仍为 `{mode:'disabled',native_contract:'opencode-cli-2.0.31'}`。selection.model 为 `stepfun/step-3.5-flash`，实际请求必须为 `/chat/completions`。旧 DeepSeek 分支保持原严格目标。固定 Linux x64 官方 `@opencode/cli-linux-x64/bin/opencode` 与 Windows x64 官方 CLI 2.0.31 共用原 ACP 接口。

两个 OpenCode 分支只接受显式 `SWA_OPENCODE_API_KEY_HOME`，不回退 HOME 或 Orca 默认账号；来源与项目、安装、运行数据及 Codex/Claude/Pi 保护根双向独立。Linux 当前 UID 的目录0700、文件0600；Windows保留私有DACL。StepFun 仅增加固定 `@opencode/ai/providers/openai-compatible` provider 与 `opencode.config.provider`，有效插件、空工具、credential、模型及 HTTP 目标逐项核对。发现声明、固定版本启动、认证和真实模型成果分别记录；本增量不宣称模型或双平台实测通过。

每 Worker 独占新根，在 legacy auth 和 SQLite 均缺席时只执行一次官方 `auth import --standalone`。实际原 id/key、唯一 active credential、双管道 EOF、正常退出与完整原树关闭均确认后，才独占创建 legacy auth 投影。未知不重发，已有未知库不重新初始化，原来源不写入。Linux live server 核原 custody、native CLI 父链、`/proc` 程序和 boot/start/UID，并前后复核；Windows沿原 Job成员/birth。活体观察不宣称原子快照或 socket/pidfd关联。

原 `swa_input_binding` 在真实 numeric ACP request ID 分配后由每 Worker 独立私有 HMAC key 封装。官方可写 `prompt` 事件核 MAC、session 与完整原文，恢复纯文本，把 actual messageID 和绑定写入原生 metadata；只有 `InboxDelivered` 投影的真实 user 行才可接受。提前 `input.accepted` 延后到该证据，并在相应 turn.end 前按原队列提交；接受结算还须等原 sink 写入完成、该事件实际发布以及真实 turn.userItemId 指向原 submission。零步骤或日志写入未确认均保持未知；写前拒绝和写后未知分别结算。模型 context 先复制再删除桥接字段，HTTP核原文、空工具及固定目标。attachments、resources、audience、slash 和问答工具仍拒绝。

成果核完整原请求库存（含 `question.resume`）、numeric write、MAC/user/id/seq、每条已接受输入的真实 journal opener、最新输入之后同执行段的 assistant/idle、ACP回复和对应 journal turn。`final.text` 只来自同一已验最终 assistant 的 text 内容，沿原长度、秘密检查与末尾版本重核供 Task 交付和父任务邮件使用。新输入 pending/unknown 不能借旧 assistant 完成；严格 UTF-8、raw frame、EOF、fence/runtime及完整 D 沿原 provider 文件记录。OpenCode questions仍不可用，Pi规则保持。以下历史 DeepSeek 设计中的导入顺序和平台限定由本增量替代，原目标和工具约束继续保留。

原Reviewer依据先行D01—D08接受`native-opencode33-plan.md`准确SHA256 `F18C0ED603668BE5A3FA1E49C8C9F2DF476D08C4824E17BBEC6C8BAD4AA63BD9`及O01—O10，主控据此核定本节接口。实际客户端固定@opencode/cli2.0.31及官方tag `22728d67461260d56bb9796b9b8f36e1de47202e`，复用Orca1.4.230原ACP适配器和原生exe；原默认deepseek/deepseek-v4-pro、built-in DeepSeek目标及原生key来源固定，禁止Aliyun。单次真实GET31的200仅证明该次认证读取及模型存在，原生执行和最终安装另行验收。

**私有账号。** §21.1.5新增opencode-native-api-key分支，三个source沿既有canonical path/version定义；原生credential按实际active/time_created/id规则选择，只读核其integration、key类型、非空literal及与legacy auth一致。拒绝OAuth、external、命令或环境key、自定义目标或请求覆盖。启动和每次效果前重读原源、实际所选credential及私有投影，秘密只在内存和私有原生账号文件中使用。

private_root固定为`<DataRoot>/opencode/<实际projectId>`，每Worker根为其下真实Orca sessionId。OpenCode持久accountHome locator新增`{kind:'private',root:<每Worker根>}`，与原managed/unmanaged平行；account-home schema、创建前绑定、环境恢复、相等比较和resume共同消费，禁止映射为Pi环境变量。目录必须canonical、当前用户/SYSTEM私有DACL、无reparse且不与原账号/Orca/安装根重叠；已有未知内容拒绝。每Worker独立HOME/USERPROFILE、XDG_DATA_HOME、XDG_CACHE_HOME、XDG_CONFIG_HOME、XDG_STATE_HOME、OPENCODE_CONFIG_DIR、OPENCODE_DB、ProgramData、APPDATA/LOCALAPPDATA及TEMP/TMP，实际原生消费者须核实这些路径。原账户及本机Orca不写入。

私有legacy auth只投影真实选定deepseek api key；全新私有SQLite通过同版正式`opencode.exe auth import --standalone`初始化。只读取得原实际选定Credential.Entry的id/integrationID/label/value，active沿原auth export对实际所选身份的含义；内存JSON仅经stdin传入，原生credential.list/create持久化。导入前核新独占根及库中credential为空，导入命令和ACP分别有完整所属Job，导入结束取得实际退出及两次完整收尾观察后，只读核唯一deepseek记录、原id、key类型/值及实际selection。失败或效果未知立即失败，先查询私有库，不自动重发或直接SQL写入。导入无prompt，随后新ACP仍须独立验证同server实际active/credential/空工具；不复用导入进程的就绪状态。秘密不进入argv、环境、日志或错误dump，产品不插入credential、migration或会话记录。启动后和每次效果前只读核私有库真实所选key及integration，不能以auth文件存在替代。环境只继承原已审必要OS/Path和网络变量，清除provider key、OPENCODE覆盖及其他Agent/Orca注入值，不输出秘密。

**原生权限与插件。** 实际私有配置固定build、准确model、更新/分享/warming/snapshot/自动compaction关闭，全局、agent和session最终权限全部拒绝，Tool.snapshot和execute定义均须为空。关闭项目、Claude兼容、指令、skills、MCP、reference、用户/项目插件和其他自动上下文发现；保留原生固定system和获准公开正文。plugins按原生有序移除及明确启用，仅保留guarded `opencode.provider.opencode`、`opencode.config.policy`及`opencode.agent`、`opencode.models.dev`、`opencode.config.agent`、`opencode.config.compaction`和产品policy插件，guarded provider无Console凭据。实际inventory必须准确且全部active，无failed/pending；真实路由若需其他插件先说明实际来源并审核，不放开通配。

policy使用官方Promise hook。context核最终工具数量0，model.request核实际session/build/primary和固定provider/model/baseURL，http.request在原handler前以成熟Request/JSON核POST、初始HTTPS目标、原model和空tools，不改原请求/正文/provider。拒绝辅助标题、warming、compaction及未经审核通道，session.retry返回retry:false；原生失败只记录安全状态，不把凭据、headers或原错误dump输出。HTTP底层保持原CLI默认redirect行为，合同检查初始URL及固定逻辑provider/model/source，不声明所有跳转受控。

原生setup失败会登记failed后继续，因此ready必须来自同一真实私有server的官方plugin.updated及plugin.list。产品沿现有stderr接收严格非秘密状态，含实际server PID、canonical私有根、单调序号及每Worker关联值，并与真实Job成员/PID/创建时间核对。缺记录、错误归属、库存不符或failed/inactive拒绝首笔和后续prompt；不能用文件或setup日志代替active。插件每次prompt/context/model/http继续复核状态和来源，注销或事件消费失败立即失效，不新增网络服务或状态账本。O03须先在无推理的实际生产者/消费者中验证此路径，缺插件负向必须无ready、无prompt。

**真实进程与输入。** native CLI IPC为严格联合`{kind:'node-script',program,entry}`或`{kind:'executable',program}`，exe分支直接spawn实际opencode.exe acp，不虚构entry。原生Standalone私有serve使用`--stdio --port 0`及原stdin所有权，全部进程进入既有provider Job；adapter client capabilities关闭fs/terminal/elicitation/compaction、MCP为空、权限请求拒绝。实际native PID、canonical程序、创建时间和Job归属核实后才允许ready。禁止连接原账号managed服务。

structured launch admission增加disabledOpenCodeTools，与disabledPiTools各自对应合同；原R、child R、Dispatch/session、input binding、当前Grant、runtime fence和consumer generation保持。首次及后续输入等待原串行队列后，效果前重新核全部选择、来源、私有账号、原生policy和授权；当前输入未知只查询原R，不重发、不换Agent/model/目录。当前许可只接受固定公开项目的text，attachment、资源读取、slash command及输入中模型切换在边界拒绝。

**事件、成果与停止。** 原providerEventDirectory增加protocol=acp的真实request/response/update trace，绑定actual ACP sessionId、native process incarnation、单调时间及原R/input operation；不得合成Pi事件，秘密不进入trace。task.result新增source=opencode-sqlite联合分支，Go/TS/HTTP schema及全部直接消费者同步；Pi结果原语义保持。读取前核同一R/Run/root/Dispatch/native lease和ACP session，只读事务一次读取真实私有session_v2/session_message全部指定会话记录，核seq/time/id唯一顺序、model/directory/project及实际input/output/stop。累计UTF-8超过12MiB明确失败；保留原生JSON和完整文本投影，未知schema或不完整结构立即失败。读取前后核DB/session和原journal epoch/sequence，跨库不声明原子；partial和确定完整成果分别表示。检测实际凭据泄露时整体拒绝导出，私有原件保持。

停止沿原cancel/close和Job消费者，只处理已核所属身份，保留其他Worker、主服务和本机Orca；两次完整Job查询核全部非保留成员退出，缺创建时间按已审独立完整CIM缺席方法处理，未知不标released。实施顺序为O02针对性构建、O03/O04真实私有无推理及拒绝、O05首次真实正文/O06所属故障，再O07全部产品消费者、O08准确最终安装、O09同安装双Worker及O10必要失败恢复。最终须真实执行重叠、停止活跃A全树、B原PID/session/fence继续并接收真实后续正文、完整成果及逐项真实事件库定位；本节技术接受不表示这些检查已经通过。

### 21.2 已采用的工程决策

| ADR | 决策 | 改动边界 |
|---|---|---|
| D01 | 各产品使用 Go 模块化后端 + TS 前端 | 用户已要求三产品独立，按 §21.5 拆源码与部署入口 |
| D02 | 三个业务上下文 + 共享判断端口 | 不再新增任务真相源或中央 LLM 控制面 |
| D03 | Domain/App/Adapters/Composition 依赖，保持现有包边界 | 新抽象对应当前用例，不为规则整理重构既有模块 |
| D04 | SQLite 业务状态，索引可重建 | 数据库实现变化不修改领域规则 |
| D05 | 资料准入与执行批准分离 | 模型委托不能获取任务批准权限 |
| D06 | 所有上下文绑定来源与代码快照 | 不允许跨 worktree 复用未知版本结果 |
| D07 | 底座 Go/TypeScript/SQLite，外部工具可使用所需 Python | 显式声明与验证依赖，Morphogenesis 研究环境独立保留 |
| D08 | 先完整使用链，后加复杂群体策略 | UI、Service、存储逐切片一起交付 |

### 21.3 S0/适配准备项

**现有总结工具：** 从用户已在用的实例取得一份获准导出样本，登记工具来源、版本及字段；无须再次选型。缺少真实样本时记录导入验收 NOT_RUN，不编造导出内容。

**目标仓库与环境：** 执行开发前登记实际路径、分支、HEAD 和 dirty 状态，确认是新项目目录还是授权新工作树；不从旧记录猜当前源码基线。

**Laya 模型：** 固定可直接使用的 ONNX 资产、语言与校验值；无资产时只阻塞该适配器。依赖沿 P09，具体语言仍由用户决定。

**工具版本：** 锁定 Agent、AOCI、CodeGraph、向量后端、Jev 协议及 SDK 版本；使用真实样例建立合同测试，未实现的能力留 unsupported/unknown。

### 21.4 短 ADR 模板

问题 → 选定做法 → 影响哪些契约 → 需要迁移的数据 → 回退方法。只有跨模块契约、持久化、权限或部署形态变化需要 ADR；普通函数实现不新增决策文档。

### 21.5 独立产品与完整任务交付

本节依据 2026-10-23 用户要求，覆盖历史章节中把三产品默认组合构建的安排。Astrocyte 拥有认知事件、注意力动力学、知识、经验、MCP 和 sleep；Attention Mirror 拥有资料导入、沉淀、品味、机会；SWA 拥有开发空间、项目权限、角色、会话及任务执行。每个产品具有独立源码、依赖、入口和数据目录，不依赖另一个 checkout 的本地 replace、软链接或运行中进程。必要集成显式配置，未配置时给出不可用原因。原用户数据库和历史迁移保全，不自动执行跨产品迁移。

Workspace 独占开发空间存储责任，沿用 `attention_project_spaces` 原表、ID、版本和完整资料引用。旧同库资料消费者通过显式 adapter 委派空间写入，原事务仍使用同连接；拆为独立产品后不能宣称跨数据库原子提交。

| 对象 | 保存的业务事实 |
| --- | --- |
| Role | 职责、默认 Agent/模型、问题/委派/开发模式、技能及长期知识引用；有项目范围、版本和归档状态 |
| Conversation | 当前讨论及追加要求；追加讨论不隐式调用模型 |
| Task | 目标、依赖、验收条件和结果；固定角色版本及来源 |
| Worker | 实际 Dispatch、进程与原生会话身份、输入和释放状态 |

`run.submit` 接原 project/workdir/spec_file/input_file/agent/model/name/request_id，可选 role_id+revision、conversation_id 和 question_mode。Go 在原权限下组合 controller.open、task.create、worker.start；外部稳定 UUID 为首阶段身份，后两阶段确定派生，持久化完整 spec/input/context/selection。恢复只读取并验证原请求回执，unknown 不自动重发或生成新身份。`initial_workers` 省略为 1，显式值须在 1 至 max_workers 以内；它防止已批准的初始并发尚未启动就收尾，实际动态后代仍全部纳入观察。

`question_mode: disabled | native` 只在新 Run、worker.start 或 Role 默认值中选择；旧记录没有该字段时使用 disabled。Run/Worker 未显式选择时沿准确角色版本继承其默认值，没有角色时为 disabled；当前 Worker 不支持中途切换。角色编辑、归档、复用和实际启动记录保留原模式。native 仅适用于固定 Pi 1.0.1 的 per-session 账号合同，对应 `native_launch.tools.mode: questions-only`、固定安装扩展来源和唯一允许工具 `swa_ask`；其它 Agent 或账号合同明确拒绝。GUI 依据当前 `control.questions` 声明及项目选择开放入口，未得到能力时保留已选模式并阻止启动。声明支持、来源配置、实际启动和真实提问成功分别记录。

**角色与自主委派。** Command 与 Role 的 `delegation_mode: disabled | native` 独立于问答模式，省略时继承准确角色版本，没有角色时关闭。当前 native 仅支持 Pi per-session 账号及当前项目 `allowed_tools` 中的 `swa_delegate`。工具集合采用固定 collaboration 扩展，包含委派及显式启用的问答；关闭问答不自动关闭委派。当前 Worker 不允许中途更换工具模式。

`swa.delegate` 只接收 `role_id/revision/input/completion_criteria/mode`，mode 为 work 或 consult。项目、Run、父 Task/Dispatch、原启动选择、session、lease 与 native toolCall 从实际调用者解析，模型不得提供。外层请求 ID 由实际 session/nativeSession/assistantEntry/toolCall 稳定派生，内层 worker.start 使用独立且确定的 ID；复用原 mutation_receipts，不增加调度或重试账本。Go 在每次调用和实际启动边界核当前项目、settings revision、start/send、父子 CLI、工具许可与原 Grant；consult 禁止继续委派。

委派回执在子 Worker 启动确认或失败后完成，不持有请求等待子任务成果；ready、failed、rejected 和 unknown 保留实际状态。未知请求只查询原 ID，不更换 ID 重发。子任务结束沿既有 mail/resume 将成果送回父会话；父任务忙时等待，父任务失败、取消或停止时保留未读成果并允许失败结算，不声称父 Agent 已读取。角色版本、默认值和显式覆盖均保存到原始启动记录，同请求重试不能切换执行目标。实现与真实验收状态见[本轮任务](../tasks/swa-role-delegation-20261027.md)。

**项目开发工具。** Command 与 Role 的 `development_mode: disabled | project` 独立于问题和委派模式，未指定时继承准确角色版本，无角色时关闭。project 需要当前项目显式批准 `allowed_tools: project_shell`、目录及非空子目录范围、Agent 控制、read_context/start/send 和对应 CLI；GUI 同时依据 `control.development` 的实际能力决定能否启动。consult 强制关闭开发及进一步委派。原启动模式与实际工具名进入 Worker 记录和成果，不能从之后的角色或项目配置补推旧状态。

Pi 使用原生 bash，OpenCode 使用原生 shell；读取、修改及检查命令都经过同一固定 Linux bubblewrap 执行器。模型只提供命令及原生支持的工作目录、超时；项目、工具链、保护目录、可写目录与原调用者由运行系统确定。执行器将获准目录读写挂载，系统和公开工具链只读挂载，使用独立 PID、用户和网络 namespace、私有临时目录及空环境，不向命令传入账号、代理或服务凭据；外部路径不可写，网络关闭。共享硬链接、特殊文件、重定向目录和与保护目录相交的挂载范围被拒绝。隔离能力不可用时明确拒绝，Windows 当前未提供该开发执行器。

每次原生命令调用通过只读 `swa.projectToolAuthorize` 验证真实 session、lease、原启动请求和原生工具调用来源；Go 重新核当前项目、Grant、目录及操作范围，返回当前可写目录。固定扩展检查返回身份、Grant 有效期和取消状态，在创建命令前完成授权。撤销许可阻止后续命令；已准入命令由 Worker stop 取消。Pi 依据真实 assistant entry/toolCall，OpenCode 依据真实消息/工具记录及原生 shell execute 的 AsyncLocalStorage 上下文绑定授权；上下文缺失时拒绝。

合法文件修改不改写已接受的历史输入。项目工具准入保留原 Context.Files 的正文和版本，同时重新核路径许可和当前 Materials。真实 project 母 Worker 的原生委派、问答也沿该历史文件输入检查当前许可。真实 project 模式子 Worker 的成果交接携带原 source_selection，并再次核当前 project_shell 许可，才可沿该历史文件上下文恢复父会话；首次启动及普通追加仍核现有文件新鲜度。该例外不扩大其他输入、项目或 Agent 的权限。

questions-only 只允许以原文 question 创建问题或以 resume 读取所属原问题的答案，不接受路径、命令、模型、账号或任意收件人；原生文件和命令工具保持关闭。disabled 的原工具集合与启动参数不变。Worker preamble 从实际原启动选择取得模式：disabled 要求直接交付最终助手正文，由运行系统收集；questions-only 只说明可用的 `swa_ask` 和最终成果。原任务规格与验收条件保留，不能要求模型使用实际不可用的协作命令。consult 继续要求 disabled，不能隐式升级工具范围；既定 ToolsOff N4/N6 验收与本问答模式分别记录。

CLI `run` 默认等待整个递归 Run；`wait` 用精确 controller/run_id/root task_id 重连，只观察现有工作。`--strict` 将任一递归子任务失败计为失败，非严格模式仍展示完整失败列表。退出码沿既有 2—7，新增 8 超时、9 需要回答或继续原问题、130 取消等待；取消等待不自动停止 Worker。`export` 默认读取已记录成果快照，`--audit` 收集完整原生记录，CLI 写入明确的新输出目录，GUI 下载实际数据。GUI 与 CLI 共用 `swa.run-view.v1`，显示后代、依赖、Dispatch、问题、阻塞、失败和成果。浏览器按项目保存三项 Run 身份，刷新仅恢复只读观察；忘记连接只清除浏览器记录。认证检查失败且命令未提交时清理本地待定请求，发出后的未知请求保持原 ID。

项目 `external_model_cli` 是默认客户端，可选 `external_model_clis` 是人工明确许可的集合。缺失或空列表保持原单客户端语义；非空列表必须包含非空默认，每项标识唯一、无空白并经既有注册端口验证。清空默认同时清空列表。所有执行前和输入前权限检查使用当前集合，保留 revision、Grant、目录和工具限制；不自动迁移或扩大已有许可。同一 Run 可以组合多个获准 CLI，默认选择只用于需要单一默认值的操作。

所有已接入 Provider 的完整最终成果提供 `final.text`；Claude 从已验证的文本块依序拼接，原 `content` 保留。父任务继续沿原调用者和账号构造新的 `worker.send`，不携带首次 submission 或问题操作字段。结算事务写入前的快照变化、在途操作和未释放后代属于可重新观察的等待；完整回滚后不保留未知回执，真正效果未知保持原语义。

原生问题生产沿固定 Pi 扩展、原本地 RuntimeClient 和经 Worker 来源准入的 `orchestration.ask`，复用原 question_threads 与等待机制。准入核当前实际 Worker/session/fence/Dispatch、原启动选择、当前 controller consumer、项目 send/固定上下文/外发批准，以及真实原生 assistant entry/toolCallId/参数；不从模型自报字段确定 Run。实际 lease 的私有进程来源证明只走本地运输，不进入模型参数、请求正文、回执或导出；它不构成同一 OS 用户之间的安全隔离。创建与等待请求由真实会话/entry/toolCallId 派生稳定 UUID，完成回放前同样核原来源，未知创建只查询原请求，不能用新请求绕过。一个 Dispatch 的待答问题或未确认创建阻止第二次创建；不同 Worker 的问题独立记录。首次工具调用早于启动结算时仅有界等待原启动完成，未完成前不创建问题。

`question.answer` 接收准确 controller/run_id/root task_id/dispatch_id/question_id 和稳定 request_id，正文为 input_file 或 text 二选一。CLI `swa question answer` 读取明确文件；GUI 在同 Run 的原问题上提交文字，复用同公开 command。正文保留原文，须非空白且在32000 UTF-8字节以内。人类回答按当前项目 send、目录/固定上下文、原 selection 与外发批准独立授权，保留原创建者来源；Agent 继续绑定原 Grant。效果前重新核准后复用原 `orchestration.reply`、`db.answerQuestion` 和原 ask 唤醒，答案保存不证明模型已读。回答动作不附加模型输入；原 ask 仍等待时，答案沿原工具结果返回同一 Pi 会话。

原 parent R 和 child R/native 持久记录准确答案与归属。同 R 改内容拒绝；未知只查询原 R，不自动重发；同问题另一回答 pending 时禁止换 R 绕过。已答同内容以原答案返回 duplicate，允许原 Worker 已释放，但当前项目授权和实际 controller consumer 仍须成立，不产生新输入；不同答案冲突、closed 拒绝。只有准确 parent/child 均完成且明确 rejected/effects_applied:false 才恢复 GUI 编辑，保留错误和当前页面正文，由用户显式修正后提交新 R。回答成功退出0，观察待答仍退出9并显示可执行回答及原 wait 命令。run_view 的 pending questions 与原记录派生的 answered_questions 分别展示，后者及完整答案进入同 Run 导出；完整集合和字节边界继续核验。

原工具等待已 timeout/cancelled/connectionLost 时，保存答案不会重新执行已返回的工具。`question.resume` 提供明确继续入口，接收准确 controller/run_id/root task_id/dispatch_id/question_id 和新的稳定 request_id，不接受 text、input_file 或自定义指令。只有实际工具结果证明原等待已结束、答案已保存、同一当前 session/fence 与 consumer 有效，且原生记录和输入 journal 证明 idle、没有未知或待投递输入时才允许。它重新核当前人类独立 send/外发批准，沿原 helper→swa.workerSend→sendAgentTurn 投递固定正文“使用 swa_ask 的 resume 参数读取原问题 Q 的答案，并继续当前任务。”，不会复制答案或伪造工具结果。模型随后实际调用 resume:Q，原 ask 返回唯一答案；真实工具结果及后继模型轮次共同决定正常完成。没有 Conversation 的 Run 使用相同入口。

`question.resume` 返回0只确认该次继续输入已接受；原请求未知时仅查询同 R，不能自动重发，已完成回放也不再次输入。新一轮确实结束但仍未读取答案时，重新呈现明确继续入口，由用户选择下一次请求。`answered_questions.read_state` 区分 answer_saved、read_unconfirmed、read_observed、continuation_required 和 interrupted；`continuation_required` 布尔仅在同名状态为 true。CLI 对尚需回答或继续的问题保持退出9：可以继续时给出 `swa question resume --project P --controller C --run R --task ROOT --dispatch D --question Q --request-id NEW_UUID --json`；证据不足时给原 wait/request 查询指引。GUI 同 Run 按相同库存显示继续按钮，并沿原 request.show 恢复，pending、未知或普通权限错误均不清除原请求锁。

work 委派执行，consult 必须由实际工具策略禁止外部操作，notify 仅保存单向邮件且不新建 Task/Worker。交接保存原始来源、父任务、接收者、完成条件和 reply。`handoff.notify` 接收原 Controller、根任务、接收 Dispatch 和 `input_file`；Go 按当前项目权限读取并版本化该文件，原生邮件逐字保存 `invocation.input.text`。该操作不接收内联 `text`。notify 的 `delivery:stored` 只表示记录已保存；通知和完成邮件使用原 `audit_only` 合同，不进入会自动向模型投递的邮箱。reply=poll 由调用者观察；reply=resume 由原生完成消费者把真实子成果通过原邮件和经过当前权限检查的 worker.send 输入路径递交父会话。内部 `handoff` 引用 source_task_id/source_dispatch_id/parent_task_id/parent_dispatch_id/mail_id；后台核原记录、当前项目权限和原会话，外部请求不能提供该证明。邮件已保存、实际接受输入、父 Agent 继续输出分别记录。

Run 自动收尾复用原 journal 完成通知、Task/Dispatch、完整成果 reader 和原 worker.stop/release，不新增调度器或第二任务状态库。Run 观察触发同 scope 的既有结算；问题库存同时核原问题、创建/等待回执及真实工具结果，覆盖报告、自动停止/释放、根任务交付与最终清理前复核。已保存但读取未确认的答案仍阻止自动交付；仅 Q=answered 或 Q=closed 不代表模型继续或停止完成。用户显式 stop 在原停止及退出证据确认后可沿原流程回收，保留 interrupted 与原答案，不宣称模型已读。所有实际后代、问题、未知输入和所属资源均须闭合；执行终态标记 `acceptance:unreviewed`，不代替验收条件审查。

Agent 能力分别标记 declaration/configuration/probe/session/result 证据层级；安装、配置、可启动、实际控制和执行成功分别展示。图片、工具和模型切换分别声明，界面按实际可用操作开放。追加输入仅有原生接受证据才为 sent，明确无效果拒绝才为 not_sent，其余为 unknown；unknown 不自动重发。恢复区别 resumed/rebuilt/failed/unknown，保留真实模型、provider、非秘密账号来源及原会话。模型目录优先使用当前真实会话支持的账号目录；静态配置标为 unverified，不能回退其他账号后声称同来源。

本轮验收使用 N=4、N=6 的真实公开任务，并分别报告平台、Agent/模型、原生输入与输出、停止隔离和最终资源释放。实现及局部测试不替代安装后实际验收；具体计划与剩余限制见[当前任务](../tasks/swa-evolution-20261023.md)。

<!-- PAGEBREAK -->

# 附录 A　版本化消息示例

下面字段是平台契约，不是第三方原始返回值。ID 和 digest 均为示例；实际文件中的字段约束见同包 JSON Schema。

### A.1 上下文包摘要

```json
{
  "schema_version": "1.0",
  "packet_id": "ctx_001",
  "project_id": "proj_001",
  "grant_id": "grant_001",
  "snapshot": {
    "environment_id": "windows-local",
    "repo_id": "repo_001",
    "worktree_id": "wt_001",
    "head_oid": "<actual-git-oid>",
    "content_digest": "<sha256>"
  },
  "goal": "完成已批准的上下文交接改进",
  "sources": [
    {"material_id": "mat_001", "revision": 2,
     "locator": "page:3", "digest": "<sha256>"}
  ],
  "decisions": ["保留原会话接续与显式交接"],
  "open_questions": ["确认目标适配器的 resume 能力"],
  "next_step": "检查已登记的原生会话协议",
  "predecessor_id": null
}
```

### A.2 判断结果

```json
{
  "schema_version": "1.0",
  "decision_id": "judge_001",
  "question_id": "next_action",
  "decision": "need_evidence",
  "question_type": "choice",
  "value": null,
  "provider_confidence": null,
  "truncated": false,
  "input_digest": "<sha256>",
  "policy_version": "taste-1",
  "provider": "rule",
  "model_revision": null,
  "reason_code": "missing_adapter_capability"
}
```

判断结果不携带批准凭据，也不允许把缺失的模型值解释为允许执行。Go 端和 TypeScript 端对同一实际接口结果验证字段与枚举；错误结果也必须符合契约。

<!-- PAGEBREAK -->

# 附录 B　接入依据与文档维护

### B.1 既有开发约定

**[H1] `AGENT_GRAPH.md`，v2，2026-09-21，开发方式。** 沿用独立 worktree、独立复核、五字段任务契约、AGENTS/STATUS 渐进读取和小步提交。原文中的 ORCA 产品基线不继承；原并发上限由 2026-10-09 用户确认替代，见 §18.2。

**[H2] `Morphogenesis_本地Agent协作实施规格_v0.1_2026-10-08.md`，第 1、12、13 节。** 沿用发现与控制分离、上下文版本、单一执行环境和权限边界；原先保留旧执行内核的方案按本轮语言要求替代。

### B.2 接入资料

以下资料用于实现对应适配器；版本在接入任务中固定。查阅日期：2026-10-09。

| 编号 | 官方资料 | 用途 |
|---|---|---|
| R01 | Go：Organizing a Go module | internal 与包布局 |
| R02 | modelcontextprotocol/go-sdk | Go MCP 服务端与客户端 |
| R03 | aoci-spec/aoci-code README 与 LICENSE | 仓库地图、接入方式与分发条件 |
| R04 | colbymchenry/codegraph README | 代码索引与关系能力 |
| R05 | TypeSafe：Introduction | Jev 的结构化题型 |
| R06 | TypeSafe：Confidence | 可空字段、置信含义与路由 |
| R07 | Laya：laya-ts README、TypeScript SDK 文档 | 无 Python 运行、模型文件与截断 |
| R08 | modernc.org/sqlite 文档 | SQLite Go 适配器 |

[R01] https://go.dev/doc/modules/layout

[R02] https://github.com/modelcontextprotocol/go-sdk

[R03] https://github.com/aoci-spec/aoci-code

[R04] https://github.com/colbymchenry/codegraph

[R05] https://docs.typesafe.ai/introduction

[R06] https://docs.typesafe.ai/confidence

[R07] https://github.com/NandhaKishorM/laya/blob/main/laya-ts/README.md

[R08] https://pkg.go.dev/modernc.org/sqlite

### B.3 文档更新规则

产品语义改动先更新 SPEC 对应条目与验收场景，再更新契约和实现。字段、错误码和事件版本只维护一个来源。完成任务后更新 STATUS 中的当前基线、命令结果与下一步，不重写完整历史。
