# Pi 已确认输入的观察身份

基线产品 `45ce26f0df82598bd1c6d454376efcfde9e41c3c`，分支 `integration/swa-task-cards`。Root 指定 collaboration_model 接管本次实际能力观察失败；acceptance_audit 独立审查，Root 串行提交，release_audit 处理旧资源收尾及后继新请求实测。不得重放旧请求、修改原安装/数据库、运行新服务/模型或完整构建。

## 实际失败、最小复现与来源

pi05 原件为 `/workspace/swa-worker-pi-05-obRHpk/evidence`，Worker 请求 `293f1f84-fd8c-4708-9259-f6ac4ec81a5c` 实际 CLI05 exit0/oktrue、native.state=ready、mode=structured。紧接 CLI06 worker.show exit7，错误 `The accepted input has no matching native provider identity`，唯一抛出位置为 `runtime/swa-orca/src/execution-observation.ts`。原 driver 失败、完整树 UNKNOWN 保留。

`.verification/worker-input-observation-20261023/observe.mjs` 仅读原父/子回执及 SQLite，使用生产 `replayJournal`、正式 key parser 和 `executionObservation`；`observe.exit=0` 表示实际复现了同一拒绝。原父/子 completed 且 binding 相等；journal replay 无 damage/newer，accepted submission 和原 receipt 的 providerItemId 都是 `orca:1792748477564-428c2faabb22f7671e2bb3298abb6039`。parser 得到 provider=orca、clientMessageId 等于本次原 operation_id。当前 projection 无 orca 分支，必然拒绝。准确安全投影保存在 `actual.json`，不保存或打印 auth、完整输入正文或 owner token。

原 provider trace 共62项，seq52 是该 cid 的 prompt write_intent，seq54 为原 prompt success response，seq61 为相同 cid 的用户 message_end，seq62 是其 input.accepted 投影。这里只说明已产生实际输入及确认记录，不能宣称模型最终结果、认证成功、任务完成或资源释放。

正式 producer 合同：`pi/rpc-session.ts` 只有携带原 policy 才设 correlatedPrompts；`rpc-prompt-delivery.consumeUserEcho` 必须通过原 strict user message schema、唯一等待输入和正文精确匹配；`rpc-turns` 由真实用户 message_end 消费回显后产生 input.accepted，`JsonlRpcTimelineLane` 成功消费事件才调用 onInputAccepted，原 Pi session 用 `{provider:'orca',clientMessageId}` 结算。原 journalDispatchRowBuilder/reducer 将该确切身份存入 accepted submission 与 receipt。SWA Pi policy 对原写入 binding、用户正文及 cid 另有原强检查。因此 orca key 在此处是原 Pi 的关联确认身份，不是其它 provider 的文件/session ID，也不是仅有 pending 占位行就能证明交付。

其它 provider 的现行语义保持：Codex/Claude 原 provider key 检查保留；legacy 原 agent/session 检查保留。上游 ACP 也可能使用 orca 确认，但本批没有其 SWA 原生确认与验收来源，不扩大 orca 分支到其它 Agent。Pi 非每会话 API-key 合同及未验证的模式同样不增加成功声明。

## 最小实现与写域

1. 唯一产品 `runtime/swa-orca/src/execution-observation.ts`：在已经核过原 selection/provider link、request/child、Dispatch/session/fence/operation 及 accepted settlement 的分支中，明确接受原 Pi `orca` 身份；要求 selected.agent_id=pi、原 per-session native account 合同、jsonl-rpc link，以及 key.clientMessageId 精确等于 binding.operation_id。缺 key、queued/journaled/pending 保持 unknown；错 operation/provider/contract 仍拒绝。其它既有 provider 分支不变，result/authenticated 仍只由独立完整 native result 判定。
2. 直接规则消费者 `tests/swa-cli-headless/agent-observations.test.mjs`：增加 Pi 原协议明确参数的纯规则，核 accepted 同 operation、错 operation、非 Pi、非 per-session 合同，以及 pending/null identity 不提升；原7项规则保留。参数注明纯规则，不构造原生执行回执或服务替身。
3. 本任务与 `.verification/worker-input-observation-20261023/`：保存准确失败、修前/修后同原件投影和检查原件。Root 管理其它状态文档；无需修改公共 schema、原 journal/provider producer、readNativeInputStatus 或账本。

## 验证与停止条件

- 同一 pi05 原父/子 binding、实际 replay submission/provider link/selection 输入，修前生产投影抛原错误；修后投影 delivery=sent、phase=accepted、control=available，result/authenticated 仍 unknown。原对象和输入不修改，旧服务/R 不重放。
- 新增纯规则与现有 agent-observations 原入口；严格 TypeScript 检查。必要失败先保存和定位，仅复验受影响入口，不完整构建。
- 准确源码和局部原件交06；接受后 Root 固定新提交，05 执行新数据/Grant/R 的真实 Worker，继续观察真正模型活动及 stop/release/正常关闭。原 pi05 的业务失败/完整树 UNKNOWN 不改写。

## 实施和实际局部结果

acceptance_audit 已独立接受准确计划 `7fe53ff1c2612d50c574994faf40f5d1ecf8adfaef4ab1ac91a8184c8d46e96d` 及原态 MRE。产品仅增加上述 Pi 限定分支，未改原输入 reader、账本、provider 或 schema；其它 provider 条件保持原字节。

准确源码 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| `runtime/swa-orca/src/execution-observation.ts` | `0342083f06352ab91631aad90ebea0d3ce92f5480e0a866f4dae5bf7a91a29b4` |
| `tests/swa-cli-headless/agent-observations.test.mjs` | `1a1d80fb26ed2f1b679439bdb47172a86e1c9acecb6ba1728dfccdfe5e9e7de8` |

固定开发 Node 执行 `--test tests/swa-cli-headless/agent-observations.test.mjs` 实际8项通过、0失败（原7项和新增1项），原件 `.verification/worker-input-observation-20261023/rules.log`、`rules.exit=0`。新增项明确核对 Pi 同 operation 的 accepted orca key，错误 operation、旧 account 合同、其它 Agent 保持拒绝；journaled/queued/unknown 及 accepted 但 providerItemId=null 均不升级为 sent，模型结果和认证不升级。

原件回归 `observe-after.exit=0` 与 `regression.exit=0`：用正式 reader 从原只读 SQLite 读取同一 source/input，对保留的修前 production bundle 和修后 production bundle 调用。修前仍准确抛出原错误；修后 delivery=sent/phase=accepted/control=available，result/authenticated=unknown；整个输入对象调用前后完全相等。原 trace 的唯一 prompt write、同 cid 用户 message_end 正文逐字相等，以及引用该原 sourceSequence 的 input.accepted 均实际核对。`actual.json`、`actual-after.json`、`regression.json` 分别保留原态、修后和同输入对照，不把离线投影提升为新原生会话或最终模型成果。

严格 TypeScript 使用原 `typescript/bin/tsc -p runtime/swa-orca/tsconfig.json --pretty false`、固定开发 Node 与 `NODE_OPTIONS=--max-old-space-size=8192`，原件为同目录 `strict.log`（空）/`strict.exit=0`。差分空白检查为0。本轮没有局部程序失败、没有完整构建，没有重发 pi05 原请求。

acceptance_audit 已独立接受上述准确产品、测试、任务及局部结果；修后真实 Worker 的观察、模型输出、stop/release 和正常关闭仍未运行，待 Root 固定新提交后由05使用全新请求验证。Windows/N4/N6 本批未运行，原 pi05 driver 失败及完整树 UNKNOWN 保留。
