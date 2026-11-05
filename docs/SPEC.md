# SWA 产品规格
## DDD 开发规格

**Attention Mirror · 共同工作区 · Morphogenesis**

版本：v0.1　　日期：2026-10-09　　语言：Go + TypeScript

**任务流程：用户目标与既有项目 → 提案及批准 → 蜂群执行 → 检查与成果 → 用户采用与经验回流。**

资料沉淀作为可选入口：收藏 → 沉淀 → 品味筛选 → 工作区候选。Attention、Workspace、Swarm 保持各自业务归属，用户可围绕已有项目筹划任务。原整合方向见 [META_PLAN](META_PLAN.md)，当前实现与验证范围见根 [STATUS](../STATUS.md)。用户最新首版为抽取 Orca CLI 执行能力并交付可控 Swarm CLI，已审方案与接口边界见 §21.1；原 M2/M3 通用 CLI/MCP 及 M2—M6 保留后续规划，其 MCP 与完整 S3 不自动成为首版前置，适用关系见 [QUESTIONS](QUESTIONS.md)。

本规格定义新平台的业务规则、接口和开发任务。`docs/SPEC.md` 是开发规格正文；Word 是同版阅读件。修改规格时先改 Markdown，再生成阅读件。

### 开发入口

本地底座的 CLI、桌面和进程外适配边界见 [SWA 本地底座](SWA_LOCAL_FOUNDATION.md)。

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

已有产品由一个 Go 主程序维护业务状态，一个 TypeScript 前端提供三模块界面。判断、Agent 和索引组件通过端口接入，保持现有模块化单体结构。首版 CLI 按 §21.1 新增独立 `swa` 入口和抽取的 Node 执行后台，复用 Workspace App 准入；实际安装、运行及功能验收由首版任务登记。

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

完整成果沿准确d7已审[方案§5.5](https://github.com/songconmaisaix31-design/swarm-anything/blob/d7f21242259739cfb49a4f68a19a1a8f28bcec32/docs/standards/swa-cli-headless-20261020.md)、§21.1.2及T07/T13实施。`worker read`保留原生有界预览与游标；`task result`从已核所属的实际原生journal及对应Agent自产transcript取得内容，采用成熟严格解析，检查身份、格式、读取一致性及12MiB上限，不迁移、修补或换源。terminal只有有界输出时明确标注，不能作为完整成果通过。计划停止A时分别返回真实状态、已有部分和incomplete/unavailable/unknown；坏源或来源变化明确失败。B的完整成果、固定业务判据和全部相关资源退出/归档/释放仍为根Task完成条件，不追加A完成条件。实际项目执行目标来自稳定AgentSelection并核现有批准；新数据根不预置Grant，服务启动不签发token。候选携带真实首次人工授权步骤及必要使用说明，真实结果按同一安装候选核验。

CLI输出和所属生命周期依准确b3f0e229已审方案§7.5及C01—C09实施。`--json`在stdout只发布一个完整结果，stderr保存诊断；已成功解析并校验的原请求ID及实际selector须在失败或取消时保留，未知身份省略。真实HTTP ErrorV1转换为既有CLI envelope，完整HTTP原件保存在既有`error.data`，HTTP trace与命令原请求ID各保留其来源；原生结果及错误数据保持。真实网络效果未知时只查询原请求，不重发；取消当前CLI等待返回130，不据此停止Worker。stdout实际不可写时将已知关联和实际影响保留到stderr并非零退出，不再次发布结果。

`serve`须处理自身所属stdin的EOF：readiness之前取消启动按130及一次未就绪失败结果收尾，退出无法确认时保留6；readiness之后只保留原一次readiness，后续诊断和实际关闭结果写stderr。真实Worker/helper已退出、归档/释放及关闭的空闲条件下，全部自有node/server及已观察后代明确退出才允许EOF正常返回0，已知子进程失败保留7、未知或残留保留6及占用。Windows取消验证使用本项独立隐藏console宿主及其中另行创建的新组CLI，核实际成员和创建身份后才定向发送控制事件；不能将组合创建标志当成新组证明，不广播到组0或附着原Orca控制台。缺少隔离、真实批准或资源窗口时保持未运行。

新代码遵守 §3 的 App 端口、adapter 和入口组装关系；来源副本与产品 composition 位于各自独立目录。需要改变上述动作、权限、状态拥有者、公开错误或模型范围时先修订本节及方案并重新审核相关测试。实际构建、安装及 T00—T15 的结果由任务和报告登记，计划接受不表示功能通过。

#### 21.1.1 本机 Agent 的独立发现与稳定选择契约

准确`740ccdf9a9dfa33901274fd8dccd37c4beacf1fd`的[方案§4.5.2—§4.5.5及§7.8](https://github.com/songconmaisaix31-design/swarm-anything/blob/740ccdf9a9dfa33901274fd8dccd37c4beacf1fd/docs/standards/swa-cli-headless-20261020.md)已由独立c3fca056局部接受。本节定稿其中的只读发现、设置源、capabilities DTO、稳定AgentSelection及现有批准的技术契约；程序实施仍须准确CR及实际运行。输入与模式路由见§21.1.2，控制端恢复见§21.1.3；用户工具范围仍按QUESTIONS中的实际决定执行。

`swa capabilities --json`沿既有项目token及POST `/api/v1/local-projects/{id}/orca/commands`的`{action:"capabilities"}`进入App observe准入。App的现有执行端口增加`Capabilities(ctx, projectID, requirements)`，由orca adapter调用私有只读`swa.capabilities`。requirements来自当前App项目设置及适用批准，HTTP正文不能提供身份或工具授权。发现只访问产品实际注册、必要本机配置及命令解析，无controller helper、模型请求或原Orca运行前提。

注册事实来自产品内抽取的definition与真实adapter构造的StructuredAgentRegistry，保留原生重复ID及能力方法校验。已注册、启用、已安装、已配置、可启动及start/send/read/stop/resume/tools分别给出实际来源和available/unavailable/unknown；静态名单、文件存在、声明能力及本次真实调用各有自己的来源，不能互相替代。发现不自动运行模型或建立Worker来刷新。

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
}
```

上述联合按account.kind及对应tools.native_contract严格验证，不允许交叉组合。本节后续Pi来源、参数和RPC细则适用于pi-native-api-key；OpenCode原生合同见§21.1.6。credential_updated_at为原生credential.time_updated的实际Unix毫秒，不能用观察时间替代。

路径为实际canonical来源，version沿原配置snapshot的实际文件身份/版本；models_source=null要求实际不存在，后继出现视为变化。政策与原settings source/revision/configuration_version、原R/checkpoint共同固定原生选择，不保存凭据或另建账号账本。model_target绑定实际合成modelId/API/baseUrl，成熟URL解析拒绝账号信息、秘密查询、动态模板和未批准目标。API只允许已核最终请求消费者的openai-responses、openai-completions、azure-openai-responses，其他API保持政策unknown，不换模型或来源。

原账号目录只读。原auth只接受该provider实际支持的原生api_key条目及literal key；非空credential.env、OAuth/refresh、models apiKey/oauth、命令或环境引用拒绝。auth和models使用成熟JSON及原ModelConfig的JSONC/schema，准确方案§13.3逐类表作为本节固定字段和投影清单：只保留所选provider/model/override及原composer顺序；未知有效字段、无法唯一合成的目标、虚拟模型、候选/网关路由拒绝。key及三层headers用同版本isCommandConfigValue/getConfigValueEnvVarNames只读分类，保留原生literal与转义语义；Headers成熟解析，大小写不敏感拒绝Authorization、Proxy-Authorization、X-Api-Key、Api-Key、Cookie、Set-Cookie。不能原块复制、删除不允许字段后继续、改凭据类型或复制refresh来宣称原账号保全。

用户允许阶跃星辰测试后，采用独立17e440ea限定接受的`native-pi-custom28-plan.md`准确4E698ACC及实际API源码补充msg_48f93338842d：Pi1.0.1的custom provider复用原ModelConfig和composeModelProvider，以空base、无extension合成实际配置的唯一所选模型，并核原生stored api_key handler。新增custom目标只允许`https://api.stepfun.com/v1`或`https://api.stepfun.ai/v1`及末尾斜线，API仅openai-completions；拒绝非默认端口、userinfo/query/fragment、其他host/path/API、缺失/重复模型及只依赖override的目标。builtin分支保持原唯一base规则；原字段、literal key、空env、无OAuth/routing/非空sampling/认证Header覆盖和私有账号规则继续适用。真实compat、openai-completions.lazy及openai-completions实现纳入读取前后及每次效果前的来源身份复核，使用原getApiProvider实际handler；NativeLaunchPolicy/AgentSelection字段、原CLI、工具关闭、Job、输入和完整成果合同保持。独立来源可由已有SWA_DISCOVERY_PI_HOME选择；真实key来源尚未取得时，只记录实际静态和拒绝检查，正向模型及双Worker保持未验。

原model、所选override、内置及合成model的samplingParams只允许缺省或空对象，任何自有字段使整源拒绝。产品不开放每请求options/samplingParams/provider/onPayload/headers变换或任意RPC透传，逐命令strict DTO只提供原prompt/steer/follow_up、abort、状态、准确模型/thinking及固定关闭设置；当前固定输入仅text，prompt只含message、原生streamingBehavior和原请求标识。真实RPC→session.prompt→Agent loop→sdk/ModelRuntime的生产者、空扩展/资源及私有设置共同封闭请求覆盖；不能仅以get_state或no-tools证明最终请求安全，不替换原生provider或事后重写请求。

private_home固定DataRoot/pi/<实际项目UUID>，不同项目不共享。已批准controller.open只创建空目录，发现不复制账号；秘密写入前用成熟Windows API设置并读回当前用户/SYSTEM保护DACL，拒绝重定向、未知owner、其他写入主体及与原Orca/账号/安装根重叠。当前Grant/CLI/model/tools批准后才将同一已验证来源投影到独占新auth/models文件；只读源、私有原生锁与运行写入分开。已有同项目Worker仅在来源/版本/provider/政策完全相同时复用，未知副本或不同来源且原资源未释放时拒绝，不能覆盖换账号。

内部`StructuredAgentLaunchAdmission.accountHome(sessionId,agent,currentHome):Promise<AgentSessionAccountHome>`从create前已登记的真实Worker identity/Dispatch及原父子R解析原选择。在prepareStructuredAgentSessionCreateForWorktree的resolve intent后、attach fingerprint前，原agentSessionAccountHome生成`{variable:'PI_CODING_AGENT_DIR',path:private_home}`并进入原record；非产品宿主沿原生产者，产品缺少R关联即拒绝。实际launch part完成后复核command/accountHome/env/argv，仍用原CLI、provider-process和seal。

受限builder只在精确contract/实际版本及toolsOff政策成立时允许fullAccess=false；不得强设full-access。固定argv为--mode rpc、--offline、--no-approve、明确--provider/--model、--no-tools、--no-extensions、--no-skills、--no-prompt-templates、--no-themes、--no-context-files；原记录需要的绝对--session/--fork互斥，全部extraArgs拒绝。环境仅保留SYSTEMROOT、WINDIR、SYSTEMDRIVE、COMSPEC、PATHEXT、PATH、NUMBER_OF_PROCESSORS、PROCESSOR_ARCHITECTURE、PROCESSOR_IDENTIFIER、OS、LANG、LC_ALL、LC_CTYPE、TERM、COLORTERM及既有HTTP_PROXY/HTTPS_PROXY/ALL_PROXY/NO_PROXY，再明确写产品私有HOME/USERPROFILE/APPDATA/LOCALAPPDATA/TEMP/TMP、项目账号根、PI_OFFLINE=1、PI_SKIP_VERSION_CHECK=1和原seal身份。其他账号/key、NODE_OPTIONS/NODE_EXTRA_CA_CERTS、owner capability及原Orca身份不继承，网络配置值不输出或改动。

私有settings固定compaction.enabled=false、retry.enabled=false、retry.provider.maxRetries=0、cacheWarming='off'；用真实set_auto_compaction/set_auto_retry成功回执再次关闭，并核get_state.autoCompactionEnabled=false，retry结合原回执/同版本源码/实际私有设置，不造状态字段。offline仅关闭原生启动刷新；模型仍须完成真实provider请求。no-approve使原项目设置为空，不能从公开项目重开资源、重试或请求变换。

首次和每次后续输入在serialized handOver等待后、adapter.dispatch前重读来源身份/版本/存在状态、逐类重解析/投影，并逐项比较实际私有auth/models/settings。Pi真实get_available_models/get_state证明provider/model/API/baseUrl、samplingParams及sessionId/sessionFile；原fence/归属由原R/Dispatch/session、expectedRuntimeFence及current consumer分别证明。继续核当前Go批准、原selection/model_target、停止/释放和完整所属Job；秘密只在内存比较，任一失配或未知拒绝。仅已审disabled政策映射为空required tools，空ProjectActionScope.Tools本身不证明Native关闭工具。

原生API key没有TTL字段时有效期为unknown，其余条件满足可以真实请求，账号远程有效性仍由实际结果证明。有实际明确期限的来源每次要求`expires_at - 当前时间 > 本次已批准最长执行时间 + 30秒`，期限或执行上限缺证、余量不足或到期拒绝；此未知拒绝不适用于原格式没有TTL的key。可能输入后继续按§21.1.2保全原R/operation/Job，不重选或重放。

准确方案§13.6全部真实检查进入同一Worker计划：真实账号/明确模型、用户单CLI和空工具批准、原生子树/argv/env/私有文件及自产JSONL、实际工具效果、逐类来源/路由/请求覆盖和TTL边界、首次及后续输入、同安装候选双Worker/停止A/B同会话成果。仅用获准真实来源，未命中记INCONCLUSIVE、不伪造协议或时钟；工具/T11待答及旧Codex/S3各自限制保持。

#### 21.1.6 OpenCode原生执行及完整成果

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
| D01 | Go 模块化单体 + TS 前端 | 拆服务前先出现真实部署需求 |
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

### 22.1 对话协作与角色卡

当前产品方向按 [SWA 对话式蜂群](SWA_REDESIGN.md) 执行，开发顺序见 [本轮任务](../tasks/swa-redesign-20261104.md)。Swarm Domain 拥有 RoleCard、RoleBudget、HandoffContent 和 SourceTrace；格式由两份 Card JSON Schema 定义，YAML/JSON 经同一校验器加载。预算缺省为16000 tokens 和20步；显式空工具列表关闭工具，缺省工具列表继承默认。

共享角色管理由 Swarm App 的 RoleCardService 负责。消费方端口为 CardCatalog（内置角色与格式校验）、RoleCardStore（角色查询和事务）及 RoleCardTransaction（角色写入和既有幂等回执）。SQLite 实现端口，Composition 注入，HTTP 与 CLI 使用同一应用语义。

角色 API 为 `GET /roles`、`GET /roles/{id}`、`POST /roles`、`PUT /roles/{id}`。响应资源包含 `role` 与 `version`；列表按 ID 返回资源。写入命令包含现有 `schema_version/request_id/expected_version` 和完整 `role`，使用 Idempotency-Key。POST 要求 expected_version=1，创建版本1；PUT 整卡替换，expected_version 为当前版本，成功后递增。内置角色的初始版本为1，修改结果作为完整覆盖值保存于 SQLite，原内置资产保持原值。相同幂等键及正文返回原结果，变更正文返回 version_conflict。写入只接受 human 会话；读取沿现有 HTTP 身份规则。角色写入不更改项目许可。

角色 CLI 的本地文件命令管理 YAML/JSON，配置 `--endpoint` 后读取和写入共享 API；远程修改先取得当前版本。交接格式校验独立于角色目录；实际会话交接须验证来源和目标角色存在。交接只向目标角色发送所选业务字段及其 source_trace。

### 22.2 角色工具与项目许可

新会话只接受已由人类登记并启用目录访问的项目。会话保存角色卡版本和有效工具列表，后续每个工具动作重新读取当前项目许可；角色变更使旧角色调用失效。工具为 `read`（文件和目录）、`write`（文件）、`diff`、`test`、`command`，缺省继承角色默认值，空数组关闭。审查者没有 `write`，命令审批不扩大角色权限。

文件路径使用 Go `os.Root` 解析，拒绝根外路径、外部符号链接和 Windows 设备/替代数据流。越界产生 `swarm.tool.tripwire` 事件，暂停会话并保留执行上下文。人类显式恢复时重新载入当前角色和项目权限；原越界动作不重放。

命令参数为 argv 数组。已知读取、查询和测试命令直接执行，其余命令进入 `awaiting_approval`，包括写入、破坏、外发与 shell。审批对象保存完整 argv、角色版本和项目许可版本；人类决定只适用于该对象，重放不重复执行，参数不可在审批期间替换。停止取消当前执行和待审批；停止后批准不执行。

Codex 会话关闭原生 shell，使用平台作用域 dynamicTools；原生文件编辑请求不获批准。命令复用实际 Codex `command/exec` 权限配置，默认无网络和只读，获批后按当前角色授予项目写入和单命令网络权限。Windows 原生沙箱需要系统根读取，文件工具的目录限制由 `os.Root` 执行。

操作开始事件持久化后才能产生文件或命令效果，结束事件记录真实结果。事件存于既有 `foundation_outbox`，包含项目、会话、角色、工具和操作 ID。开始后无结束的动作保持结果未知，恢复时查询原执行及产物，不自动重放。事件写入失败立即返回错误并暂停；已产生的效果保留实际状态。
