# SWA CLI 与共享工作台整合

本轮执行用户上传的六张任务卡，CLI 优先交付，React Web 工作台沿用相同执行服务。当前开发计划见[任务入口](../../../tasks/swa-task-cards-20261022.md)，共享接口见[合同](01-contract.md)，逐引擎双平台目标见[适配矩阵](02-agent-matrix.md)，来源见[复用映射](source-reuse.md)，修改归属见[负责人表](ownership.md)。

## 准确基线

云机接管的 `main` 是 `6445149358f5799fc5a786eb59ff494cddbec72e`，其中尚无 `runtime/swa-orca`。读取远端得到 PR #5 head `6778a66faf6d1ca7b50658f23966db3e406f38c6`，包含原 CLI、运行时与整帧输入序列化实现。本地集成提交为 `6195f4cfb6b32aedd43845443c029ecc11d5578d`，合并上述两份源码与交接文档；没有合并远端 PR 或发布产品。

附件记录的 `893fb885` 安装验证属于历史 Windows 候选，不能替代 `6778a66f` 或当前树的检查。旧机 PID、会话、Grant和账号不能据附件自述迁入当前云机。本轮用户另已明确：允许人类按同项目当前权限独立授权后追加输入、Windows x64与Linux双平台、适配大部分Agent、真实模型测试预算不设上限。固定公开输入、ToolsOff及原请求/未知效果等边界保持；预算决定不产生缺少的账号或Windows主机。

## 交付与当前能力

| 阶段 | 需要的可观察结果 | 当前边界 |
| --- | --- | --- |
| CLI 候选 | 发现、稳定选择、合法批准、任务、Worker 输入/查询/停止、完整成果和所属退出 | Linux `e14800c1` 安装及服务基础已验；Agent、每Worker完整退出、N=3及Windows安装分别待验 |
| 组合候选 | 同源码 CLI 与 Web 资产，同一服务、项目、Run 与 Dispatch | 不新增 Electron；Web 连接不创建第二执行库 |
| 默认 N=3 验收 | 同任务三个不同原生会话真实重叠，停止一个后其余两个继续，同会话追加输入 | N 是本轮可配置测试参数；不形成产品固定槽位 |

跨入口`worker.send`按人类自身的同项目当前权限独立准入，原Agent创建者关联仅保留来源，不将其Grant作为人类权限来源；跨创建者`worker.start`仍不开放。观察和安全停止分别核权。此项用户授权已明确，实际执行通过范围仍须由后端和真实服务测试证明，不能由组合资产构建或界面接入推导通过。

基线代码确有固定两席限制：Go 任务验证、TypeScript invocation、原生预留/完成和成果清单均需由02改为读取批准的 `max_workers`。仅更新 A/B 示例不能完成该项。`max_workers=2` 的第三席拒绝继续作为准入用例保留。

产品目标为Windows x64与Linux。Linux x64 glibc候选`e14800c1b207a8c063531fedf014aa0cd2374558`已完成标准构建、归档校验、仓库外解包及私有安装；同安装实际PTY输入/退出、watcher和28253路径闭包通过。实际service/daemon就绪、HTTP health和服务级所属退出通过，stdin正常关闭退出0。证据入口为本轮任务及05交付记录；项目status/controller因没有当前合法Grant为NOT_RUN。每Worker独立完整退出D正在实现，Agent模型、N=3和组合候选仍未验。Win32 Job、CurrentUser DPAPI和Windows安装保护需要实际Windows环境，当前未连接该机器。

Codex 0.163.0的无模型metadata04已确认固定官方完整模型目录、配置来源和运行时feature门；使用独占空CODEX_HOME，thread/model请求均为0。原账号路由、有效工具全集、ToolsOff和推理没有因此通过，准确来源及边界见[Agent矩阵](02-agent-matrix.md)。用户所指“大部分Agent”的验收分母已询问为7个结构化引擎、45个TUI模板或两组分别多数，当前待答；共同基础工作继续，不将名称发现计为适配完成。

## 开发与产品的隔离

本轮使用现有隔离云 checkout `/workspace/swarm-anything`，分支 `integration/swa-task-cards`，按互斥文件归属推进，主控串行提交。不声称调用了当前机器未安装的 Orca 派发工具。开发 checkout 的组织不作为产品 Worker 目录隔离证据。

产品当前 `controller.open` 将经准入的工作目录登记为 folder，`controller-helper.ts` 的 `worker.start` 使用 `worktree: 'current'`。因此已有原生 session/私有账号根和所属资源隔离不等同于每 Worker 新建 Git worktree。原生文件/命令工具保持关闭；允许代码写入及隔离目录分配须另有实际接口与验收。

## 本轮验证约定

每项检查记录命令、退出码与源码范围。PASS、FAIL、NOT_RUN、未知效果分别保存。合同和类型检查通过只证明接口定义或编译，安装候选和真实多 Worker 不据此通过。正式验收还需实际模型执行区间、原请求回执、原生 journal/transcript、SQLite 关联与完整所属树退出。

OpenMausBot 固定参考为 `dbb73a73ae2cba48fdf608e9e22d1d5d91608532`。其源码仅在逐文件核查后参考；`enterprise/`、商标/吉祥物和第三方组件各按实际许可处理。Grok Bot 静态报告仅为参考材料，不作为闭源代码来源或运行证据。

## 01 实际验证

本卡在当前开发树执行 `pnpm generate`、`pnpm check:contracts`，退出均为0；后者校验264个OpenAPI示例及生成一致性，保留20条现有/未使用组件等警告。任务文件Schema通过17项输入边界检查，覆盖2/3及安全整数边界、非法类型/缺失/额外字段；这是输入验证，不是N个Worker执行测试。4份本卡Markdown经已安装的marked解析，11个本地链接均可解析；`git diff --check`通过。

准确产物为本目录4份文档、SPEC/QUESTIONS/TASKS入口、`contracts/swa-cli.schema.json`的taskSpec、OpenAPI的SwaTaskSpecV1和通过原流程生成的`web/src/api/schema.d.ts`。本卡没有运行Windows安装、模型或最终CLI/GUI多Worker场景；相应结果由实际负责人按准确源码补充。
