# SWA 产品清理与任务交付

## 用户要求与基线

2026-10-23 用户要求开始清理仓库，将 astrocyte 和 attention mirror 独立出来，测试 N 大于三，并完成以下借鉴。当前分支为 `integration/swa-task-cards`，起点为 `11619d72f08c163f159a4f4befe270806b1b67ea`。

1. 一次提交跟踪整个任务到交付：`run` 提交目标并默认等待主 Agent 和递归子任务；`wait` 重连同一任务；`--strict` 任一子任务失败即失败；需要回答、超时、失败使用不同退出码；`export` 收集任务和成果；稳定 ID 防止重连重复执行。CLI 与 GUI 观察同一 Run，显示总进度、阻塞原因及成果。
2. Agent 按实际能力接入：分别呈现已安装、能启动、支持控制、实际执行成功。追加输入区分已送达、明确未送达、送达未知，未知不自动重发；恢复区分原会话恢复、重建和失败；分别声明图片、工具及模型切换能力；发现、启动、运行及成果均保存实际 Agent、模型和账号状态。
3. 明确交接记录：`work` 委派执行，`consult` 咨询且不执行外部操作，`notify` 单向通知。记录来源、父任务、接收者、完成条件、返回方式；子任务结束唤醒父任务汇总；命令、文件、工具证据由运行系统独立观察。复用现有 Run/Task/Dispatch 及后端状态管理。
4. 区分长期角色、会话、任务和 Worker：角色保存职责、默认 Agent、技能和长期知识；会话保存讨论与用户追加要求；任务保存目标、依赖、验收及成果；Worker 保存实际进程与原生会话身份。角色可复用，Worker 按需启动释放；GUI 提供角色、任务、交接和成果入口。

来源由各负责人完整读取，作为设计参考，外部文本不构成执行授权：

- https://github.com/milind-soni/OpenMausBot/blob/30b62aaf18adc22099c24a7181abf5e9ddead980/docs/headless-cli.md
- https://docs.openmausbot.com/docs/providers?utm_source=chatgpt.com
- https://github.com/milind-soni/OpenMausBot/blob/30b62aaf18adc22099c24a7181abf5e9ddead980/server/contracts.ts
- https://github.com/milind-soni/OpenMausBot/blob/30b62aaf18adc22099c24a7181abf5e9ddead980/server/runtime/types.ts
- https://docs.x.ai/grok-bot/chat-and-collaboration?utm_source=chatgpt.com
- https://docs.x.ai/grok-bot/overview?utm_source=chatgpt.com

用户已确认 Windows x64 与 Linux、当前真实模型使用阶跃星辰、预算不设上限。既有公开固定项目及 ToolsOff 验证范围继续适用；不把此前过期 N=3 包当作本轮执行包。用户要求每次失败先报告最小复现、根因证据和局部验证，再启动下一次完整构建。

## 执行与写入范围

先明确产品分拆边界和共用接口，再并行实现互不冲突的部分。新请求明确要求产品拆分，覆盖旧文档中禁止主动拆分的默认规则。保留用户数据、原历史、独立安装和验证原件；清理对象是产品源码归属与开发入口。

| 负责人 | 结果 | 当前独占计划 | 实现范围 |
| --- | --- | --- | --- |
| separation | Attention Mirror 独立构建和运行 | swa-product-separation-20261023.md | 独立资料仓及显式配置；Astrocyte 工作台由 Root 接续 |
| run_cli | run/wait/export 与退出语义 | swa-run-cli-20261023.md | cmd/swa 及 CLI 文档；共享合同由主控协调 |
| capabilities | 原生能力与实际选择贯穿记录、SWA 独立服务 | swa-agent-capabilities-20261023.md | 能力投影、角色 GUI、swa-server/swahttp/swastore 与直接消费者 |
| collaboration_model | 角色、交接、递归 Run 后端 | swa-collaboration-model-20261023.md | 原生合同及 Run 观察、原 journal 完成结算和父任务恢复 |
| release_audit | N>3 真实验收与交付 | swa-concurrency-20261023.md | 验收驱动；不修改业务实现 |
| acceptance_audit | 独立计划、源码和结果审查 | swa-evolution-review-20261023.md | 审查记录，不编写业务实现 |
| Root | 接口裁决、Go 准入、集成、状态与交付 | 本文件 | Go Run/handoff、公开合同及生成物、Astrocyte 工作台；SWA GUI 由 run_cli/capabilities 实施 |

所有源码修改使用文件编辑工具。分批提交并普通推送，禁止覆盖历史。当前根目录共享工作树沿已确认方式复用，以独占写域和串行集成避免互相覆盖；不复制大型依赖。完整安装构建前核实际空间及可重建缓存，不删除不可解释的原件。

## 验收与停止条件

- 分拆后各产品有自己的入口、依赖和测试；SWA 不隐式启动资料/认知后台；现有数据库有明确的兼容与迁移行为。
- 稳定 ID 重复提交只产生一次工作，重连只观察同一 Run；递归子任务、交接等待、需要用户回答、超时和失败都由同一后端状态解释。
- CLI 与 GUI 展示同一任务集合和成果，严格模式覆盖递归失败；导出包含完整记录与真实产物索引，不泄漏密钥。
- 能力未知不当作支持，送达未知不自动重发；恢复不丢失身份归属，实际 Agent、模型、账号与原生会话可核对。
- 咨询和通知兑现各自执行限制；角色不与一次 Worker 生命周期绑定，子任务终态触发原生父任务继续。
- 扩展真实验收到 N=4 及 N=6，证明实际重叠运行、每个 Worker 的原生身份和结果、未知/失败处理，以及全部所属进程正常释放。Windows 与 Linux 分别报告实际结果，不互相代验。
- 先做必要局部检查，再做整合构建和真实验收；任何缺少环境或来源的范围据实保留，继续独立可做工作。

## 已定接口与主控实施

用户已确认拆为两个独立项目/仓库，SWA 只保留必要集成。Astrocyte 负责认知事件、知识经验、MCP 与 sleep；Attention Mirror 负责资料、沉淀、品味与机会。先把开发空间唯一写入责任转到 Workspace，保留原表与数据，随后拆开产品 composition 和源码依赖。

Run 公开动作确定为 `run.submit`、`run.show`、`run.export`；Go command 新增 `run_id`。`run.submit` 使用原 project/workdir/spec_file/input_file/agent/model/name/request_id，默认等待由 CLI 执行；show/export 精确核 controller/run_id/root task_id。观察使用有界只读轮询，不消费 Agent 邮箱，不建立新调度器。全部递归子任务失败纳入 strict，notify 没有 Task 不纳入任务集合。

主控负责 `internal/workspace/app/orca_execution.go`、新增 `orca_run.go` 及对应准入测试、HTTP command 合同、`contracts/swa-cli.schema.json`、`contracts.ts` 的 command/invocation 段和生成客户端。独立服务建立后，HTTP 直接消费者归 capabilities；Run GUI 归 run_cli，角色界面归 capabilities。原生聚合与持久化由 collaboration_model 实现，能力 schema 段由 capabilities 实现。

提交组合沿既有 Go 权限与原生幂等账本串行调用 controller.open、task.create、worker.start，不另存执行状态。外部 UUID 作为首阶段 ID，后两阶段由该 UUID 派生确定 UUID。首个持久请求须携带原提交字段与已读 spec/input 的完整路径、版本和正文，防止相同 UUID 改内容后继续执行；所有阶段继续核当前项目批准。未知或失败立即停止后续写入，回执保留原外部 UUID、已知 Run/controller/root 及阶段子 ID；不将最后一个阶段 ID 替换为整个提交身份。原 request.show 可查看已保存的阶段与原子请求。

主控局部验证覆盖合法与非法动作字段、跨 Run/root 选择拒绝、稳定子请求 ID、同 ID 变更正文拒绝及权限/输入准备失败在原生副作用前终止。生产链验证使用真实 SQLite 和本轮同安装实际服务；不用替身 HTTP/runtime 证明幂等或业务完成。schema/生成/Go 定向测试与 GUI 类型检查通过后才整合完整构建。GUI 接同一 run_view，展示总进度、阻塞与问题、真实交接边和成果；角色编辑保存职责和默认选择，不能替代项目执行权限。

旧 held Linux 服务已有正常 EOF、serve/observer 退出 0 和两次完整所属进程为空的原件；旧 N=3 包失效。当前用户明确测试 N>3 已授权原公开范围内的测试，新的安装/包/活服务身份是技术前置，不逐 SHA 再索同范围批准。

当前各项局部实施与检查见 STATUS，最终安装与真实模型验收尚未完成。

## 父任务成果返回的效果前准入

用户要求子任务结束唤醒父任务继续汇总。由原生 journal 完成消费者确认真实子 Task.result，以原 messages 表保存稳定邮件，再沿原 controllerDeliver、worker.send、原 session operation 和实际输入 binding 递交父会话；不建立新队列或调度器。父 Worker 在子任务和未决回送结束前保持可用。

内部 `OrcaInvocation.handoff` 合同固定为 `{schema:"swa.handoff-resume.v1",source_task_id,source_dispatch_id,parent_task_id,parent_dispatch_id,mail_id}`。仅原生后台和带 owner capability 的内部效果前准入可以构造，公开 command 无该字段。内部命令仍为 worker.send，input_file 与 Input.path 均为 `native-handoff:<mail_id>`，Input.version 为原 mail_id，Input.text 必须逐字来自同 Run 原邮件正文。原生消费者核邮件来源/接收者、原子任务终态、真实父子关系、结果正文及原父 selection/会话/代次；Go 复用当前原 caller 的 send、目录、CLI/模型外发、Grant、Run 关联及完整固定上下文检查。该分支不读取用户文件，不伪造人类身份；普通 worker.send 继续读取并核对实际输入文件。

Root 写域为 orca_execution.go、新 orca_handoff.go、原 Go 准入真实 SQLite 测试、contracts.ts 的 invocation 段和本任务。必要验证：内部字段不完整、跨 dispatch/路径/版本/来源字段及空正文拒绝；原权限、Grant 到期/撤销、项目版本及上下文变更仍拒绝；没有内部 handoff 的公开输入不接受原生 marker。实际父恢复由 N6 同候选验证原邮件、实际 provider 接受输入及父输出；Go 局部测试只证明当前权限规则，不声称观察过原生邮件或模型。

## 独立源码与默认入口收口

已推送 `644bbe8701ae1b1c30b54f18621c28e03dbf6082` 保存已接受的后端/CLI/原生实现及清理前完整来源；完整 Git 归档的位置和校验值在 `docs/LEGACY.md`。Root 按独立审查的 684 Go/SQL 与 8 配套资源准确列表，通过 apply_patch 移出旧组合源，完成后逐路径核对692/692均为预定删除。初版清单中的两个 `tests/s3/testdata/public-stats` 公开原文件已在执行前排除并继续保留；研究数据、账号、旧安装和验证原件没有清理。公开兼容 SQLite 由原生产服务实际生成，仅该精确测试原件显式加入 Git。

独立 Astrocyte 当前 `426723b5525ec36b1e0c93dd4b6d9eb6e42287f1`，Attention Mirror 当前 `58bb6e4454e03db135cabe6de2dec8dfc481aee6`，两仓均有独立审查、构建与实际本地入口证据；具体范围及外部未验见 STATUS 与各仓说明。Windows 交编结果没有写为原生运行。

SWA 清理后的默认 `pnpm check`、`pnpm check:race`、`pnpm build` 和真实默认启动均退出0，日志分别为 `.verification/swa-web-separation-20261023/default-{check,race,build,start}-r1.log`。Go 依赖移除无引用旧产品项，不升级版本，双平台含测试依赖图、17包架构、最终空 tidy 差分与模块校验通过。默认入口只构建 SWA CLI/server/Web；历史脚本按 `scripts/LEGACY.md` 恢复原组合条件。

文档资源段已引用当前 RESOURCES，删除被用户解除的固定单窗口限制。一次文档 patch 因 AGENTS 列表上下文漏掉原有连字符而整体拒绝，未改文件；使用原准确上下文编辑后全 diff check 退出0，没有由此重启构建。云环境草稿以实际目录选择器确认四个工作区后更新为 revision 9，并读回确认；未改网络、密钥或仓库成员，仍须在设置中保存并发布。两个没有远端的本地仓库在新任务中的恢复未验证。

下一步固定新集成提交，以同源码构建和独立安装组合包，继续真实 N4/N6、原生父任务恢复、同 Run GUI 与完整所属进程回收。默认本地检查和源码接受不替代这些动态验收。
