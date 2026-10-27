# 原生启动读回选项后的批准快照

基线产品 `5170d9bcb36ae29527dc7c943350641d48c5a9ce`，当前分支 `integration/swa-task-cards`。collaboration_model 负责原生启动链，acceptance_audit 独立审查，Root 串行提交；release_audit 负责后继全新请求的真实 Worker。不得重放旧请求、修改旧安装/数据库、运行新模型或完整构建。

## 实际失败和证据边界

pi04 原件 `/workspace/swa-worker-pi-04-zo0osP/evidence`。请求 `6a91ab20-58ad-4f57-9ea2-80e2aa95f9f0` 的实际模式为 structured/preferred structured；原生结果为 outcome_unknown/dispatch_input，错误正文为 `The dispatch preamble was submitted but not acknowledged (unknown): The native launch identity changed during current approval.`。原父/子请求已完成，业务和完整树未通过。release_audit 单独处理准确资源的正常收尾，不改原业务结果。

只读投影 `.verification/worker-approval-options-20261023/actual.json` 来自原回执、SQLite 和 provider trace；`observe.exit=0`。原 trace 为331696字节、49项，真实 Pi 状态响应始终报告固定 StepFun 模型及 `thinkingLevel:off`，含 custody、policy_ready、原生控制响应，最后为 approval_changed；该 trace 中没有 prompt write_intent，不据此把全部模型效果写成零。当前 record.options 为 `{model:'stepfun/step-3.5-flash',effort:'off'}`；原启动命令没有 effort。Worker 当前 runtime_epoch 与原 CLI runtime_id 一致，失败后的 state=start_unknown 不能倒推检查当时的状态。

准确调用链：`worker-topology` 用 `narrowStructuredLaunchSeedOptions` 保存显式模型意图；Pi 正式 `readPiRpcSessionOptions` 从原生 thinkingLevel 得到 effort，`nativeSessionOptionsFromReport` 合并读回；`acquireOwner` 在 adapter.acquire 之后读实际 options，再由原 `store.proveOwner(options)` 持久化。Pi policy 在这之前取得 `approved()` 闭包，它比较完整旧 record.options。首次 dispatch 的 `policy.assertCurrent()` 及 verifyCurrent 刷新前的检查仍使用该闭包，因此正常读回默认值也能触发相同拒绝。现场没有保存这个闭包的瞬时 before/after 快照，本次不得把此可达源码顺序和事后记录声称为完整历史快照；先执行下面的真实来源规则复现。

## 最小修复与准确写域

复用原 `onAttached` 生命周期位置：`acquireOwner` 已提交 proveOwner(options)，`onAttached` 尚未 bindAndDrain 或提交第一条输入。仅 acquired/ready 分支调用现有 launch-admission composition 的可选内部 attached 准入；无 SWA 准入时原上游行为不变，不增加公共 RPC 或调度状态。

1. `third_party/orca-v1.4.230/src/main/runtime/structured-agent-launch-composition.ts`：可选内部回调接收当前真实 record 与 acquisitionGeneration，并由原 singleton 转交；不接受调用者自报的模型成功。
2. `third_party/orca-v1.4.230/src/main/native-chat/agent-session-wire/structured-agent-session-attach-orchestration.ts`：在原 onAttached 的 acquired/ready 分支、bindAndDrain 之前读取原 store 当前记录并调用该准入。原异常/退出清理路径继续处理拒绝，不捕获后继续交付。
3. `runtime/swa-orca/src/agent-launch-admission.ts`：只索引本安装函数实际创建的 Pi policy，精确 session/fence/原 structured identity 绑定；attached 回调交给该原 policy。领取准确 policy 后在 await 前删除索引，成功和失败都只消费一次；尚未领取的索引在 admission dispose 时清空。真实 adapter 继续持有原 policy，不保存另一套任务或生命周期状态；其它 Agent 不增加尚未需要的行为。原 approved() 的 owner/identity/fence/account/options/run/Worker epoch 和当前 Go 权限检查全部保留。
4. `runtime/swa-orca/src/pi-session-policy.ts`：提供只在本次真实 acquisition 边界使用的内部方法。核当前 record、同 fence、真实已保存 owner/provider link、原 acquisitionGeneration 与 policy 的实际 native session，以及最后经原严格 schema 验证的 get_state。使用原 `nativeSessionOptionsFromReport` 对本次原启动 options 与真实 native model/thinkingLevel 形成预期读回值；必须与已持久化 options 精确相等。先核上述来源，再通过原 approveInitialization 重新核当前 Go/Grant/选择/账号，末次同 record/来源检查后更新 policy 自己的批准闭包。后续同步完整 options 等检查原样继续；重复边界调用、未知来源、变化或批准失败均拒绝。没有固定 effort 默认值，没有任意重新接受后来漂移的选项。

新增必要纯规则测试可放 `tests/swa-cli-headless/worker-acquired-options.test.mjs`，正式消费上述生产规则；Root 最后串行接默认检查列表。任务记录和 `.verification/worker-approval-options-20261023/` 是其余写域。若实际代码需要其它直接消费者，先向 Root 报准确必要边界，不扩大工作流。

## 局部验证与停止条件

- 原态规则 MRE：消费 pi04 真实启动选择及真实 get_state 原件，调用正式 seed/options 投影，再通过实际 AgentSessionRecordStore/SQLite 的选项更新方法展示 `{model}` 到 `{model,effort:'off'}` 的变化与原完整 options 比较拒绝。独占本轮数据库；派生的本地初始行明确标记为规则输入，不能称现场早期快照、真实运行中 owner 或新模型成功。若 store 的实际准入不允许直接回放该元数据，用其原纯转换函数与已存在 SQLite 规则分别报告，不伪造 lease/进程成功。
- 修后必要规则：同一真实来源读回可以被一次明确 acquisition 边界采用；错 generation/fence/session/provider link、模型或 effort 与实际读回不一致、额外 options、随后 options 漂移及重复边界调用必须拒绝。原 source/Go current approval 仍是正式消费者；不模拟 HTTP、CLI 或 provider。
- scoped strict TypeScript 和受影响原 Pi/准入纯规则，按实际修改选择，不启动模型、不完整构建。所有装配失败保留原件并说明，不用测试替身绕过。
- 准确源码及实际局部结果交独立审查；接受后 Root 固定新提交，release_audit 按已准开发单 Worker 路径用新数据/Grant/R 验证真实输入、输出、stop/release、正常关闭。旧 pi04 UNKNOWN/业务失败保留。

## 实施与实际局部结果

Root 与 acceptance_audit 已接受准确计划 `c651083bbe15f32cb16c7297566263241dd1cd5e3f950e7986953fcd13085fa0`。实际实现保留四个产品路径；policy 的一次采用方法只用于 acquired/ready 的原回调，不扩展公共提供者协议。Go await 前后比较 session/fence、已证明的 provider link、原 native session/generation、accountHome、完整 options 和 ownerProcess；另外复用真实 custody 读取。`updatedAt`、普通进度及 lease 续期时间不参加整体 record 相等检查。当前 Go 准入返回的完整同步 guard 继续检查 owner、structured identity、Run consumer generation、Worker 状态和 runtime epoch，原 sources/Grant 检查也保留。

原态 MRE 已执行：`.verification/worker-approval-options-20261023/mre-fOeVRP/result.json`、`mre.log`、`mre.exit=0`。读取原 trace 第47项 get_state，正式 seed/options 投影产生 `{model}` 和 `{model,effort:'off'}`；实际独占 SQLite/AgentSessionRecordStore 的同一生产选项更新函数保存读回后，原完整 options 相等谓词为 false，其余记录字段相等，store 打开后的 unreconciled 标志仍保留。此处派生初始行只验证规则转换，未执行 owner claim、provider、HTTP 或模型，也未重放旧请求。

新增纯规则入口 `tests/swa-cli-headless/worker-acquired-options.test.mjs` 消费生产 `assertPiAcquiredRecord`。其输入是 pi04 非秘密元数据的明确投影；不构造完整原生协议、回执或存活进程。覆盖真实读回值与显式模型一致、14项 acquisition/source 身份拒绝、6项完整 options/显式选择拒绝。单次采用与 Go await 前后真实 callback 路径由准确源码审查及后继真实 Worker 验证，本纯规则结果不宣称已经运行该生命周期。

首轮 `rules.log`/`rules.exit=1` 为2项通过、1项失败：测试的 initial/current 浅复制共用了嵌套 lease/account 对象，负例改变当前 fence 时连初始 fence 一起改变，导致该负例没有抛出。仅将测试 initial 改成独立 `structuredClone(record)`；产品未因该测试失败改变。后继 `rules-r2.log`/`rules-r2.exit=0` 为3项通过、0项失败。两轮原件均保留。

实际检查：

- 固定开发 Node 执行 `--test tests/swa-cli-headless/worker-acquired-options.test.mjs`：修正后的3项规则通过；本轮目录 `rules-uziElJ`。
- 同 Node 执行 `--test tests/swa-cli-headless/worker-start-mode.test.mjs`：原4项模式规则通过，`mode-regression.log`/`mode-regression.exit=0`。
- `NODE_OPTIONS=--max-old-space-size=8192` 与原 `typescript/bin/tsc -p runtime/swa-orca/tsconfig.json --pretty false`：`strict.log` 为空、`strict.exit=0`。索引领取后删除的末次差分另存 `strict-final.log`（空）/`strict-final.exit=0`，差分空白检查为0。
- Root 串行把新增测试路径加入原 `scripts/check.mjs`，仅一行；Root 报固定 Node 语法检查与差分空白检查均为0。未运行完整默认检查。

准确产品/测试 SHA-256：

| 路径 | SHA-256 |
| --- | --- |
| `runtime/swa-orca/src/agent-launch-admission.ts` | `78dce41c76ee00819cc3b3a9403c8aa9d9d23b630605d4293469486cb1889171` |
| `runtime/swa-orca/src/pi-session-policy.ts` | `6fb3ea02e71a5f1abe58f72e1b7d3a7716318a0c8222c19c8acff148cc794011` |
| `third_party/orca-v1.4.230/src/main/runtime/structured-agent-launch-composition.ts` | `22b821fd60e27e6cd6cc116ab099196a24475636db83d6946dc2f5106fc31e21` |
| `third_party/orca-v1.4.230/src/main/native-chat/agent-session-wire/structured-agent-session-attach-orchestration.ts` | `cd0bab157a4a64963c95d52cbf052ac12ad618faf6f05be1fd71634c9388e2f6` |
| `tests/swa-cli-headless/worker-acquired-options.test.mjs` | `6ad3ab52920f2abc137142651f1190cdfcfdda334290c140413f3a59d4ed8435` |
| `scripts/check.mjs`（Root） | `ca1cf6581735843a66ed26297d8f13d733babbd7208819953e6c81e2b4b6e977` |

修后真实 Worker 输入/输出、停止/释放和服务正常关闭尚未执行；Windows 原生和 N4/N6 本批未运行。原 pi04 业务失败与 UNKNOWN 保留，05 已完成准确残余资源的正常收尾而未修改原记录。acceptance_audit 已独立接受上述准确四产品、测试、默认检查入口及局部结果；真实 callback 和 Worker 的动态结果保持未验，由 Root 固定提交、05 执行全新请求的真实验证。
