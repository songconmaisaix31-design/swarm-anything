# SWA Run、交接与长期角色

状态：2026-10-23 新任务的合同与测试计划，待主 Agent 定稿和独立 Reviewer 审核；尚未宣称实现或运行通过。当前 worktree `/workspace/swarm-anything`，branch `integration/swa-task-cards`，基线 `11619d72f08c163f159a4f4befe270806b1b67ea`。

## 需求与来源

用户要求一次提交跟踪整个任务、递归子任务、可重新连接的等待、严格失败、成果导出；交接区分 `work` / `consult` / `notify`，记录原始来源、父任务、接收者、完成条件和返回方式；长期角色与讨论会话、任务和实际 Worker 分开。现有项目批准、精确原请求、未知不重放和实际执行证据仍适用。

已完整读取固定 [OpenMausBot runtime/types.ts](https://github.com/milind-soni/OpenMausBot/blob/30b62aaf18adc22099c24a7181abf5e9ddead980/server/runtime/types.ts)，本地原文为 `.verification/collaboration-model-20261023/openmaus-types.ts`。该来源提供 `Assignment`、`Origin`、`Requester`、`Assignee`、`Mode`、`Reply`、`TurnEvidence` 等具体类型；只采用明确语义，不引入其调度器、状态数据库或审批等级。

用户给出的 [Grok 协作](https://docs.x.ai/grok-bot/chat-and-collaboration?utm_source=chatgpt.com) 与 [Grok 概览](https://docs.x.ai/grok-bot/overview?utm_source=chatgpt.com) 在本机被网络代理 HTTP 403 / CONNECT 403 拒绝；官方 `.md` 和去跟踪参数入口同样无法取得正文。本计划以用户明确提出的产品要求为依据，不宣称已核验这两页的正文。

## 复用位置与真实缺口

原生 Orca 的 `RunRow`、`TaskRow`、`DispatchContextRow`、`QuestionRow`、`MessageRow` 位于 `third_party/orca-v1.4.230/src/main/runtime/orchestration/types.ts`。Task 已保存 `parent_id`、依赖、spec、状态和结果；Dispatch 已保存创建者/接收者原生会话、创建者 Dispatch、深度和 consumer generation。`send-point-to-point.ts` 的 `worker_done` 把邮件、结算和重放 receipt 同事务提交后才唤醒原收件者。`attempt-observation-types.ts` 已把过程、产物、Worker 报告与协调者确认分开。

SWA 当前 `controller-helper.ts` 将所有新 Worker 的 parent 固定为 root；`native-methods.ts`、`worker-input.ts`、`task-result.ts` 和预算/释放准入多处只接受 root 的直接子任务。读取 Worker 还有固定 100 条单页界限。长期产品角色和用户讨论会话尚无独立持久对象；已有 `SessionBinding` 是原生会话关联，不能改名充当用户讨论。

当前 controller 是实际持有 Run 的 helper 进程，不能把它的存活说成主 Agent 执行成功。ToolsOff 原生模型不能调用 CLI 自行委派或发 `worker_done`；完成状态必须来源于原生任务结算和明确验收，不能通过“已输出文本”推断业务完成。自动委派入口必须使用当前已准入的宿主接口；缺少真实控制能力的 Agent 明确返回不可用。

## 共享合同提案

### Run

公开动作 `run.submit`、`run.show`、`run.export` 沿用现有 `OrcaCommand` 和 `OrcaEnvelope`。提交接受项目、workdir、固定 spec/input、Agent/model、名称及稳定 UUID；主控组织现有 `controller.open`、`task.create`、`worker.start`，每阶段由提交 UUID 派生稳定子 UUID，沿现有原生 receipt 恢复。每一后续阶段只在原前序明确完成后开始；未知阶段只查询原请求，不生成新身份重发。

读取要求准确 `controller`、`run_id`、`task_id`（root），服务端核项目和既有执行关联。`OrcaEnvelope.result.native.run_view` 为同一来源的公开聚合视图：

```ts
type RunView = {
  schema: 'swa.run-view.v1'
  controller: string; run_id: string; root_task_id: string
  status: 'active' | 'waiting_input' | 'blocked' | 'completed' | 'failed' | 'unknown'
  root: { id: string; status: string; result: string | null }
  tasks: Array<{ id: string; parent_id: string | null; status: string; title: string | null; dependencies: string[]; result: string | null }>
  dispatches: Array<{ id: string; task_id: string; status: string; worker_state: string | null; release_state: string | null; creator_dispatch_id: string | null; recipient_session_id: string | null }>
  questions: Array<{ id: string; task_id: string; dispatch_id: string; question: string }>
  handoffs: Array<{ id: string; from: string; to: string; text: string; read: boolean; record: Record<string, unknown> }>
  blockers: Array<{ kind: string; task_id: string | null; dispatch_id: string | null; reason: string }>
  failures: Array<{ task_id: string; dispatch_id?: string; reason: string }>
  deliverables: Array<{ task_id: string; dispatch_id?: string; kind: 'result'; available: boolean }>
  complete: boolean
  acceptance: 'unreviewed'
  observed_at: string
}
```

此视图从原生 Run 的全量 Task/Dispatch/Question 和当前 Worker/resource 记录在同一 SQLite 读取事务派生，不保存第二份执行状态。递归遍历必须验证唯一根、同 Run、每条 parent/dependency 边、循环、孤儿和完整库存；不悄悄截掉第 101 个 Worker。`complete` 要求 root 的真实 terminal 状态、完整递归任务集合全部结算、无待解问题/未知效果；`failures` 保留所有 Task 的原生失败，包含 consult，供 CLI `--strict` 判断，不按“必需”子集过滤。仅有主任务结束仍有后代运行时保持 `active`。root 收尾和子任务准入沿原生同事务门，防止读到暂时空列表后遗漏稍后准入的孙任务。优先保留未知原因，不能将未知归类成失败或成功。`run.export` 导出原视图、完整既有 task.result 原件和明确产物引用，导出结果携带其完成性；不因仍进行中而伪造最终成果。

### 交接

Task 的原生状态、父子关系与 Dispatch 仍为唯一执行事实。新创建任务的 `spec` 使用 `swa.task-spec.v2` 包络，保留原任务 spec/context，并携带以下由后端派生或验证的 `handoff`：

```ts
type Handoff = {
  mode: 'work' | 'consult' | 'notify'
  reply: 'resume' | 'poll' | 'none'
  origin: { kind: 'human' | 'agent'; caller_id: string; project_id: string; request_id: string; conversation_id?: string }
  parent_task_id: string
  requester_dispatch_id?: string
  recipient_role_id?: string
  recipient_role_revision?: number
  completion_criteria: string[]
}
```

`origin` 从根提交的真实认证 caller 和稳定请求继承，子任务不能覆写。parent、requester Dispatch、原生接收者身份与实际 Run 交叉核对。角色是默认选择和职责快照，不能授予权限。历史 v1 任务继续按原规范解释，不补写不存在的 origin 或角色。

`work` 沿现有 Worker 启动/控制准入，仅使用当前批准的能力。`consult` 必须在所选 Agent 的实际 launch policy 中确认全部工具关闭，并禁用委派、命令、文件写入与外部动作；同模型推理属于咨询本身。只有提示词约束的 Agent 不能宣称支持 consult。`work` / `consult` 的 reply 允许 `resume` / `poll`；`notify` 只允许 `none`。

`notify` 使用已有原生 `MessageRow` 的 `handoff` 类型与结构化 payload，目标为同项目现有 Run/Dispatch；以原 `audit_only` 契约持久保存，返回 delivery=stored，不创建可等待 Task、Worker 或模型轮次。原生 idle 邮箱自动投递只读取 current_delivery，因此不会旁路触发隐藏输入。RunView 显示此原记录，保存不等于 Agent 接收。没有现存可投递地址的角色不能静默启动 Worker，调用不等待业务回复。

`resume` 沿现有原生父 Dispatch/Run 邮件和已批准输入唤醒；子任务结算后，正确父地址保存包含原 Task/Dispatch 与结果引用的 audit_only 邮件，显式 worker.send 是唯一模型恢复入口，避开原 idle 自动投递。消息保存、原生输入接受、read 和恢复轮次分别记录，不能以排队回执称父 Agent 已继续汇总。`poll` 保留原邮件供查询，不主动触发模型轮次。任何原生送达未知保留同一请求与原消息，不自动重投。

### Role 与 Conversation

`Role` 持久保存项目内名称、职责、默认 Agent/model、显式技能引用、显式长期知识引用和整数版本。知识引用仍经项目范围/内容读取批准，角色不自动扫描或外发目录；role 也不保存原生账号、cookie、token、PID 或 Worker 会话。更新采用版本 CAS；已创建任务保留 role 的准确版本与快照，后续角色编辑不改写在途任务。

`Conversation` 是项目内用户讨论线程，保存标题、角色引用和有序用户追加要求及其真实作者；Run 关联 Conversation，Worker 继续保存实际原生会话身份。Conversation 追加以稳定 request 保存，状态明确为 stored，不暗送模型。向 Worker 发送仍使用现有 worker.send 的准确 Run/Dispatch、单独输入准入和实际送达观察。关联、讨论和角色延续不要求 Worker 常驻。

拟在现有原生 SQLite 添加 `swa_roles`、`swa_conversations` 和 `swa_conversation_entries`；Run 的 Conversation 关联与准确 role 快照放在根 Task.spec 的版本化元信息，不存储第二份 Run/Task 状态。初始化仅添加有命名空间的产品表，不修改上游原生迁移版本。旧 Run 的新字段为 unknown/空，不推导虚假数据。角色/会话复用现有项目访问检查及原生 durable mutation receipt，不新增 authority 系统。

## 写域与交付顺序

Root 与 Reviewer 06 已批准实施本计划的 Run 原生后端、递归聚合、交接与 Role/Conversation 行为；Root 拥有公共 Go DTO、OpenAPI、生成客户端和 GUI 接线，CLI 负责人拥有 `cmd/swa`。能力负责人独占 Agent 能力投影。

独占新增 `runtime/swa-orca/src/run-view.ts`、`collaboration-records.ts`、`run-settlement.ts` 和相应真实 SQLite 测试；必要接线为 `native-methods.ts`、`controller-helper.ts`、`controller-admission.ts`、`agent-launch-admission.ts`、`worker-input.ts`、`task-result.ts`、`client.ts`，以及 `host-entry.ts` 的命名空间表初始化和真实完成事件订阅。后端提交组合复用 Go 现有 `ExecuteOrca` 由 Root 接线，避免重复原生鉴权和新账本。原生 Role/Conversation 表和查询只写 `collaboration-records.ts`；公共 `contracts.ts`、Go DTO、OpenAPI 由 Root 统一修改，能力负责人仅拥有 `contracts.ts` 的能力观察段。

先定稿 RunView/动作/角色与交接字段；独立 Reviewer 审核下列测试计划后实施。先完成原生递归观察与严格结果，再接提交/等待/导出，随后角色/会话和真实交接入口，最终整合 GUI 与 N>3 验收。每项程序变化均经实际检查；不以文档计划替代实现。

## 测试计划

1. 真实临时 SQLite 与原生 OrchestrationDb 建立一个根、两层后代及真实依赖，核完整递归视图、严格失败列表、原生 task 状态与 Worker 状态分开；再核多个根、跨 Run parent、循环/孤儿拒绝。数据必须通过真实数据库接口创建，不替换原生方法或伪造模型消息。
2. 主任务完成而后代未结束、待用户问题、父任务等待子任务、已结算子任务待父确认、未知 Worker / 资源关闭分别有确定聚合状态与阻塞原因。未知不会被空列表或超时提升为完成。完整读取超过 100 个记录的真实 SQLite 库验证无截断；重启数据库后同一 Run 可继续只读观察。
3. 同提交稳定 UUID 相同正文只建立一个 controller/Run/root/lead Dispatch；同 UUID 不同正文拒绝；未知 child 只查询原 child，不创建另一 Worker。真实原生进程/收据验证和实际断连场景单独记录，不用假 CLI/HTTP/伪造事件证明。
4. Role CRUD 使用真实应用 SQLite，项目隔离、CAS 冲突、历史快照、停用后历史引用保留；Conversation 用户追加要求按 request 幂等、项目内目标准确且状态 stored，与 worker.send 的真实送达明确分开。角色和讨论独立于 Worker 正常退出继续存在。
5. `work` / `consult` / `notify` 参数组合、parent/requester/recipient 精确绑定、root origin 不可覆写、跨项目拒绝；consult 实际 ToolsOff 才准入；notify 实际写一封原邮箱且无 Task/Worker/模型启动，重复请求保持同原消息。
6. 真实原生 journal 完成事件经完整成果读器核验，复用原生 Task/Dispatch/Worker 原子结算函数；宿主执行观察不伪造 Agent `worker_done` 或验收通过。父邮箱持久邮件和实际恢复分别核查，重复事件仅原稳定 receipt；`poll` 不触发父模型轮次。`resume` 使用原父作者和当前项目发送批准，原 mail 精确绑定 callback request；原生输入未知不重投。真正主 Agent 收到并完成对应输入后才记录 mail read。
7. 执行证据读取既有原生 journal/session/attempt facts；模型文字自称修改文件不能产生 `files_changed` 证据。导出完整性、源变化、超限、私有秘密拒绝与输出目录不覆盖沿现有 exporter 检查。
8. 与 CLI、GUI 同一个 Run 视图及新增 exit 语义联调；N=4 及 N=6 的真实 StepFun ToolsOff 并发由验收负责人用新准确安装/授权包执行。平台、Agent、model、真实并发重叠、每个实际 session 和资源正常释放分别报告；本地 SQLite 或模拟输入不算真实模型并发。

局部检查包括 Go 目标包、TypeScript strict、架构检查和相应契约生成一致性；完整构建只在局部通过后启动。失败先报告最小复现、原错误证据、修复点与局部实际结果，再开始下一次完整构建。N=4/N=6 继续用户已明确授权的公开固定任务、StepFun 与不设预算上限范围；精确执行包与安装来源是本轮技术核验，不重复索要逐 SHA 授权，也不借用过期 Pi N=3 包。

2026-10-23 接口补充：`TaskSpec.initial_workers`（缺省 1，范围 1..max_workers）是已批准初始创建数量条件；原生创建不足时明确 blocker。`swa.runSettle` 只由实际宿主订阅 journal 完成事件后经原 mutation executor 调用，不注册公共 RPC。完整成果核验后的任务结算和原 workerRelease 归档释放分别完成，最后同 SQLite 写事务封闭 root；所有自动完成保持 acceptance=unreviewed。Role/Conversation namespace 表位于同一原生数据库，成功写入与既有 mutation receipt 同事务，项目隔离和 revision CAS 测试用真实 SQLite。

局部验证记录：真实 SQLite 观察/角色/会话/通知 13 项通过；追加成功结算状态机窄测 1 项通过（验证原 `settleWorkerReportInTransaction` 原子回滚/提交及 succeeded 状态，明确没有 Session/进程/资源证明）。strict TypeScript 已通过，后续接线改动继续目标检查。源审修复：主 Agent 从原 submission.worker_request_id 精确追溯；成功结算避免 `completeDispatch` 导致 abandoned 后资源不可释放；poll 父先于子遍历时由实际状态变化重查。真实父恢复和资源关闭仍由 N=4/N=6 原生集成验证。
