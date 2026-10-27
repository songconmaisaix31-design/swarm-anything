# Pi 已接受输入与真实 Turn 关联

## 基线、范围和最小复现

基线 `6190b77320fcef5535eff4e076fd9e28bbbd7d62`，工作树 `/workspace/swarm-anything`、分支 `integration/swa-task-cards`。Root 统筹同批通知修复、共享验收 driver 和默认检查接线。本任务仅负责 Pi 结果读取器、现有 task-result 导出与必要纯规则；未重放请求、修改原数据库或安装，也未启动服务、模型或完整构建。

S6190 正式 N4 的 slot3，原 R `97372aeb-fee5-4bb9-a224-5a077b6b511a`、Dispatch `ctx_7d085eac0d3d`、Task `task_eb7f1f21d522`、session `392a0f05-8eec-4aae-b428-baa0558d422f` 已真实 ready/input_accepted。原 journal 经同安装成熟 fold 读取后，用户项存在、原 accepted 回执存在、正文完整相等、root 身份与 fence 1 一致；它的实际 scope 为 `thread`。原读取器却要求 `turn`，因此误报 `native_pi_result_accepted_user_journal_missing`。

原 journal 的 submission 在真实 turn 打开前已 handover，用户项保留 thread scope；后续 turn 的 `body.userItemId` 唯一指回该输入。原 producer 的 submission fold、item revision 和 opener 决策均支持这个状态。原实际 turn 为 completed/failure。slot3 原 native assistant 的 timestamp 为 `14:00:55.862`，记录 `stopReason=error` 和 `403 No approved upstream IPv4 address`，其余三 Worker 有真实输出；本修复保留该失败结果。该 message timestamp 不代表写入或 turn 结束时刻。产品随后自动停止 slot3，再因读取器误拒使 Task blocked、Run unknown。通知的 text 验参拒绝由 Root 独立修复，不与此原因混同。

最小复现位于 `.verification/n4-journal-6190-20261023/`。`inspect-04.json` SHA `36f3d7f94bdbd666da0c887223e382eaaaef674e3672a5870d619084d537e829` 记录对真实 fold 执行原源码 AST 精确选出的用户查找/拒绝语句，复现同一错误。它没有调用完整账户/export reader。诊断前两轮分别误读不存在的 `tasks.updated_at`、误认为 system content 必为数组，均 exit 1 原件保留；修正后 inspect03/04 退出 0。原 guard MRE 和最小计划已由独立 Reviewer 接受。

## 实现和直接消费者

- `runtime/swa-orca/src/pi-session-result.ts` 增加并实际调用 `readPiJournalInputTurn`。明确 turn scope 按原 turnItemId 关联；thread scope 仅允许唯一 `turn.body.userItemId` 指向原用户项。原 alias、root producer、legacy/pi、session 和 fence 全部核对；缺失、重复或冲突拒绝。不会改写用户 scope，不按位置或最新项猜测。
- 原 accepted/input/hash/cid/native echo/全文和 source 检查保持。每个输入保存其准确关联 turn，最终 assistant 必须属于最新输入的同一 turn；原 stop/success 完成门保持，错误结果不会变为成功。
- `runtime/swa-orca/src/task-result.ts` 仅一行 re-export，供既有 `task-result.cjs` 使用，无新 runtime entry 或 key parser。Root 串行把 `run-installed.mjs` 的 `verifyPiJournalInputs` 接到同一函数，保留独立原 R、body、fence、native 全文和 fullD 门。
- 新 fixture `tests/swa-cli-headless/fixtures/pi-6190-user-turn.json` 只保存真实 fold 的关联元数据，不含账号或输入正文。新 `pi-input-turn.test.mjs` 的字段删改、错误 session/fence、重复引用和显式 turn scope 都明确属于纯规则反例或分支输入，不是提供者执行证据。
- Root 在 `scripts/check.mjs` 现有 Node 非模型测试列表加入该规则，未修改 package.json 或其它命令。附加导出和共享消费者范围已经独立计划审查接受。

## 实际局部结果

1. 首次规则装配在新独占目录加载实际外部依赖时找不到 `@orca/windows-security`，0 项规则进入、exit 1；原件 `rules-r1/output.log`。沿已有规则测试方式，在本次 output 下链接显式 runtime node_modules 并核 realpath 后，`node --test tests/swa-cli-headless/pi-input-turn.test.mjs` 为 **4 PASS、0 FAIL、exit 0**，原件 `rules-r2/`。独立审查随后要求反例的 Map 键与 itemId 一致，以及显式 scope 分支保留另一个合法 opener；仅用原 key formatter 改进这两个纯规则输入后，`rules-r3/` 再次 **4 PASS、0 FAIL、exit 0**。未安装替代依赖或修改产品来绕过装配错误；产品未变，不重复 strict 或同原件回归。
2. `node .verification/n4-journal-6190-20261023/regression.mjs` 退出 **0**，报告 `regression-01.json` SHA `7e72e176763ba83ea0a70ef887c307c7684f12f27b24048144bc052997fd9831`。同原 slot3 完整 journal 指向原唯一 failure turn，fixture 所有保存字段与原 fold 精确相等，原 403、trace/native 与 journal 首末字节保持。另读历史 pi09 原 journal，同样实际为 thread scope，关联通过；没有取得真实 turn-scope/steer 样本，该分支只记录纯规则覆盖。
3. 一次合并 runtime strict：`node --max-old-space-size=8192 runtime/swa-orca/node_modules/typescript/bin/tsc --project runtime/swa-orca/tsconfig.json --pretty false`，**exit 0、日志为空**；原件 `strict-r1/`。覆盖本 reader/re-export 和 Root 当前通知修复，不重复已过的通知 SQLite/Go 检查。
4. Root 已执行共享 driver 与 scripts/check 的 Node 语法检查及 diff 检查，均退出 0。本任务没有声称完整默认检查、构建或正式安装已经重验。

准确源码 SHA：reader `2a833eb07b8dba0539de11fcf25a3738f1a074f65223c2526eee39926d686a5b`；task-result `edbccdfe6ad6968f24434ab0224814cf8a916092b30a2842b18d96c1e615519f`；新规则 `58859cf1e0fed4ce4e4928a6f0a6eb8d4cf5908e484308b3f2165f83f3e9bbf7`；fixture `c9ff208a583a1d2072110341cb6a14f28d28ad48000625583b3ca4fdccdc213b`。Root 共享 driver `c3737074ac9152f90407a9273fd9cde2046d89f13446a518f293120f28041551`；默认检查 `fc1918165d600029cb3b36881db4f6832299c6aba5fedca07d4fb29faeb5c8ce`。

## 保留边界

原 S6190 FAIL、slot3 原提供者错误、Task blocked、owner serve6/observer1 和全树 UNKNOWN 不改；补充准确资源正常收尾不替代原业务或 lease/resource 结算。关联回归未调用完整 reader export、账户校验、自动失败 Task 结算，也未执行新 Worker、模型、Windows 或 N4/N6。正式新来源、同安装 driver、完整结果及生命周期仍须后继全新授权验收。

当前准确源码、共享直接消费者和上述局部原件已由独立 Reviewer 限定接受；真实 whole reader export、新请求与完整生命周期未验范围保持。由 Root 串行提交，不在本任务单独提交共享文件。
