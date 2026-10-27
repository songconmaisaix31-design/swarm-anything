# 子任务交接的实际结果状态

本任务支撑[角色启动、异构委派与项目开发](swa-role-delegation-20261027.md)。Root 统筹安装、真实模型和提交；委派模块负责人实现，integration_review 独立复核。实施基线为 `1b017749`，当前实际安装 I6b 与本次源码修改分开验证。写域为 `runtime/swa-orca/src/run-settlement.ts`、相关 question 规则、本规格及本任务；不改权限、进程退出证明或原任务账。

## 最小复现与根因

在明确标注的构造 SQLite 规则输入中，调用生产 `handoffResumeInvocation` 和 `validateHandoffInput`。当子 Task 已失败、邮件 outcome 为 cancellation 且原结果为空时，构造器首先在 `input.text` 的非空校验失败；独立传入空正文规则对象，来源校验也因空邮件正文拒绝。原结果为部分文本时，两道校验通过，但送给父 Agent 的正文只有部分文本，没有取消状态。正常成功结果按旧行为通过。

探针已实际退出 0；脚本 `.verification/role-delegation-20261027/handoff-cancellation-probe.mjs`，原件 `.verification/role-delegation-20261027/handoff-cancellation/case-yAJFID/report.json`。该报告保留修改前结果。没有调用服务或模型，没有修改真实任务数据，也没有把构造对象记为原生会话、停止或完成证据。

根因是完成邮件把 outcome 放在 payload，而输入构造器仅传递 body；空结果同时被非空输入门与交接来源门拒绝。要求子 Agent 先输出占位文本不能修复状态丢失，也不能代替空结果支持。

## 实现合同

同一结算模块内生成确定的系统正文：固定运行系统标题、一行 JSON 元数据 `source_task_id/source_dispatch_id/outcome/acceptance`，以及明确标注的子结果原文区域。原文可以为空；Task.result、邮件 body 和 execution result 不变。构造器和投递校验使用同一个格式函数，不新增公共 DTO、任务状态或证明账本。

邮件和原 execution 的 acceptance 必须同为 unreviewed；execution 的 turn task/dispatch 必须绑定该子任务及 Dispatch。仅允许缺省 continuation 或明确的 parent_interrupted；邮件 outcome 精确对应这个 continuation，或原 turn.outcome。原 Run、父子 Task/Dispatch、原 Worker selection、mail、请求和结果文本的核对继续保留。最终输入仍经过现有权限和大小检查，不截断子结果。

旧 resume 回执分支保持原样，仍先于新的正文生成：pending/unknown 保留原 R，completed 只观察原输入绑定，不能重新格式化旧 body 或自动重发。该保持行为由差分与调用链源审确认；本轮不为测试增加可注入生产入口，也不将已有通用 executor 幂等规则称为真实委派传输重试。

## 局部与真实验证

新增 SQLite 规则覆盖空取消、部分取消、失败、成功和 parent_interrupted；调用生产构造及来源校验，核实际正文 metadata 与原文本，篡改邮件 outcome/acceptance、execution acceptance/turn IDs/outcome/continuation 或最终输入时拒绝。验证本身不创建 resume 回执、不改变原结果。原父会话输入投影规则同步新的正文合同。

Node 24.16.0 实际执行 `node --test --test-name-pattern='parent continuation|handoff delivers' tests/swa-cli-headless/question-ask.test.mjs`，2/2 通过、无跳过，退出 0，日志 `.verification/role-delegation-20261027/handoff-outcomes-r1.log`。Root 随后设置原 N4 只读数据库，执行完整 question-ask 规则，15/15 通过、无跳过，日志 `handoff-full-r1.log`；统一 `pnpm typecheck:swa` 退出 0，日志 `permission-handoff-typecheck-r1.log`。相关 driver 语法与独审通过。安装和真实取消交接尚未运行。

ignored `delegation-cancel-case.mjs` 使用同 owner 的独立 `delegation-cancel` 场景，成功 `delegation-case.mjs` 保持原工作流程，仅收紧新的完整正文与来源核验。Pi 必须真实选择 OpenCode 角色并调用一次原生委派；owner 在原 OpenCode session/model/工作区中只读确认一个 running shell 和项目内命令标记，然后正式停止其 Worker。重复 Go 检查有 90 秒上限；标记仅证明命令已开始，停止结果仍需正式原回执、实际退出来源和产品 cancellation 结算共同确认。不能用 owner worker.send 替代自动交接，不能要求先行模型占位文字以避开空结果。

独立场景预期父 Task 正常汇总、子 Task failed、严格 wait 退出 7/run_failed；原停止请求确认完整后才同 R 重放，并比较原回执及唯一 Task/Dispatch/session 库存。自动交接必须在原父原生会话出现且随后有实际续轮，导出保留取消子结果及完整退出来源，空或部分原文按实际观察分类。未知停止保留原 R，清理不能换新停止请求掩盖未知。

该场景尚未运行。原生委派 producer 的传输失败及其恢复分支、独立启动失败或拒绝仍为 NOT_RUN；已完成 stop 的同 R 重放不等同于未知委派工具重试。Windows 本轮保留未验。

N2 成功、N2 取消和 `run-installed.mjs` 的 N6 自动续轮消费者均从同 authority 的原 execution 回执核定 metadata，分别精确校验完整新正文、原 binding 和实际父原生输入；mail/body 的原文投影保持。N4 手动追加分支不改；question driver 使用独立的 `question.resume` 正文合同，不受此格式影响。三个修改后的 driver 均通过 Node 语法检查，实际模型验收尚未运行。Root 决定待 OpenCode 权限初始值与本修复统一新安装后再验证；I6b 的 N4 未启动，原 I31be N4 的失败记录保持。
