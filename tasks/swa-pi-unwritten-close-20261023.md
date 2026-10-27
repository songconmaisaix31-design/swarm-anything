# Pi 主动关闭前尚未写入的请求

基线产品 `1aa20e3f`，分支 `integration/swa-task-cards`。collaboration_model 负责本次停止链诊断和必要修复，acceptance_audit 独立审查；Root 固定源码，release_audit 负责旧资源收尾和后继真实 Worker。原请求不重放，原数据库、安装和业务 UNKNOWN 不修改，不运行新模型或完整构建。

## 实际失败与根因边界

pi06 `/workspace/swa-worker-pi-06-ab5FNq` 已实际 worker.start/worker.show/input status exit0，原实际 input binding proof 已保存；stop 请求 `a0e6a3cf-8ede-4a24-abe1-964e6b2c8f80` exit6、stop_unknown，外层错误为 `agent session eviction failed at step "stop-provider-child" for f29e506a-2914-41b4-9d4d-fb2ebe46e243`。原 start 请求 `675ae356-696f-400d-964d-56a0b09a317d`、Dispatch `ctx_48680ba9dc1f`。

实际 service.stderr 的更内层栈是 `ProviderStdioWriteQueue.beginClose → settle → fail → JsonlRpcPeer.close → PiRpcSession.fail`，最终报告 native_pi_session_unverifiable。trace 末有真实 stop/abort 和用户输入后的 native events，最后为 protocol_unverifiable。现场没有保存未写队列每个 entry 的 command/准入阶段，因此不能把某个后台 get_state 或其它未记录命令认作完整历史原因，也不能由包装错误推断进程仍存活。

可达源码链已由主审/子审独立确认：`agent-connection.settleStrictExit` 调用 `peer.beginClose`；原 queue 拒绝 queued 或尚未 write 的 active；settlement 回调却总调用 Pi policy.writeSettled。policy.unsettled 只在实际 beforeWrite 中登记，因此尚未进入该阶段的请求会触发 write_settlement_unbound，继而永久失败。即使回调避开误判，peer.send 和 request 的 catch 也无条件 rejectStrictWrite，必须同批修复；取消的 pending request/timer 必须移除，已经写出的请求仍须等真实回复/完整 EOF。

另有同一路径的真实异步边界：原 beginClose 在 beforeWrite Promise 尚未完成时立即结算 active，后来的 Promise 成功/失败均因 entry.terminal 被忽略，settled 屏障提前完成。ProviderWriteAdmission 的返回值是后续同步 finalAdmission，它执行后才可能产生 cleanup；正常取消不得为获得 cleanup 而调用新的 finalAdmission。若同步 finalAdmission 已进入，原 inWriteCritical/finally 清理和失败语义必须保持。

## 最小产品写域

1. `third_party/orca-v1.4.230/src/main/provider-process/provider-stdio-write-queue.ts`：只让正常 beginClose 等待已进入的异步 admission Promise 真正完成。记录其进行状态，closing 后成功返回时拒绝该未写 entry、不开 finalAdmission；真实 admission 拒绝保持原 ProviderWriteAdmissionError 和永久失败。已经实际 write 的 callback/drain/cleanup 屏障不改，非正常 close/failure 保持原失败路径。
2. `third_party/orca-v1.4.230/src/main/jsonl-rpc/peer.ts`：在每个真实 send entry 内记录是否进入同步 policy/final 准入；只将主动 writesClosing、无既有 terminal error、真实 settlement=rejected/writeAttempted=false/cleanupCompleted=true、且从未进入同步 policy/final 准入的原关闭错误认作预期取消。该 entry 不调用要求已有 write intent 的 policy.writeSettled，send 不转永久失败，request 精确清理该原 pending/timer并向调用者返回关闭拒绝。其它错误、进入过同步准入、已经写入、cleanup 不完整或缺少结算依据均保留 rejectStrictWrite/原 UNKNOWN。首次源/准入失败不得因随后 closing 变成正常取消。

Pi policy、JSON parser、stdio/完整树退出、owner/lease/Grant/Run 和持久 journal 不放宽；不增加公共协议、后台状态框架或忽略任意关闭异常。

## 真实局部验证

- 先在 ignored 独占目录，用原生产 queue、真实 Node 文件/PassThrough 和真实异步本地输入等待复现：beginClose 时结算事实为未写/cleanup 完整，旧屏障会早于原 admission 完成；晚到的真实 exclusive-file EEXIST 拒绝被旧代码吞掉。此为队列消费者复现，不构造假的 Pi policy/RPC 接收者或原生成功回执；原实际 stack/trace用于关联，不能将局部交错冒称现场完整队列快照。
- 受影响现入口 `tests/swa-cli-headless/pi-stdio-write.test.mjs`：修正原异步关闭测试为等待原 admission 结束；补真实 admission EEXIST 失败在 closing 中仍保留；既有实际文件写入、pipe backpressure、已写同步 close、真实 cleanup ENOENT、已准入拒绝继续通过。按必要 peer 消费边界可增加同文件纯规则断言，使用实际 queue 产生的 settlement 事实；不伪造 native policy、模型或提供者响应。
- peer 正常取消必须逐源码检查覆盖 settlement、send.catch、request.catch/定时器三处；严格模式真实 provider 生命周期由后继全新 Worker 验证。本地规则不能宣称完整 strict provider、D/lease 释放或模型成果通过。
- scoped strict TypeScript、准确 diff 与原件交06。局部失败按原件保留并先解释，再执行受影响修正检查；完整构建仍不运行。Root 接受准确源码后，05 使用新请求验证真实停止/释放和正常服务关闭，原 pi06 失败不改写。

其余写域仅本任务、上述既有测试及 `.verification/worker-stop-write-close-20261023/`。计划 `98ba3478` 已获独立接受，以下记录实际实施和验证。

## 两个直接消费者的实际结果

原态 MRE 保存在 `.verification/worker-stop-write-close-20261023/mre-FOmfIL/report.json`，执行 `mre.exit=0`。真实文件/PassThrough 的两个交错中，旧 `settled()` 均先于原异步准入完成；晚到的真实 exclusive-file EEXIST 未进入 terminal failure。该 MRE 只证明原队列的关闭交错，不构造 Pi 协议或提供者结果，也不补造现场缺失的 entry 快照。

queue 增加进行中的 admission 标记：同一 tick 关闭后不再开始排定的 admission，已经进入的 admission 必须实际完成；成功只取消未写 entry，不执行后续 final，真实拒绝仍使队列永久失败。peer 对每个原 entry 同时核正常 closing、无 terminal error、没有进入同步 final、原 settlement 的 rejected/未写/cleanup 完整以及相同关闭 error；只在这些条件成立时绕过要求已有 write intent 的 policy 回调，精确清理 request 的原 pending/timer。已进入 final、实际写入、cleanup 不完整及源失败继续保留严格失败。

第一次受影响规则 `rules.log` 为 9 PASS、1 FAIL：新增晚到 EEXIST 测试发现 `close()` 保留先前正常 closing error，调用者只收到 “Public normal close”。对应最小修复只允许真实失败替换该正常 closing error，原已有其它失败不覆盖。`rules-r2.log` 实际 10 PASS、0 FAIL，`rules-r2.exit=0`。原失败日志保留。

使用 development 中明确 Node 执行 `node --test tests/swa-cli-headless/pi-stdio-write.test.mjs`；scoped `tsc -p runtime/swa-orca/tsconfig.json --pretty false` 实际 `strict.exit=0`，`strict.log` 为空。全部原件位于同一 ignored 验证目录。

当前准确源码 SHA256：

- queue：`fd62f549dae2480713e3017ed0d4e496c47a947ff97ee9741654f5d5f69a6914`
- peer：`04cd8d42014fc873f0a44c0efdef6d8da01551256cff04449fc8cf4ebcd3feae`
- test：`b49daa8217e850157a008ce50eae531527a377e81b54820aabefadf2a1249f82`

准确源码和局部结果已交独立末审。继续只读核查关闭拒绝的直接调用者；尚未宣称 strict provider 动态关闭、lease/resource 释放、完整树退出、Windows 或后继真实 Worker 通过。原 pi06 FAIL/UNKNOWN 不变，05 对原 daemon/helper 的正常 EOF 补证与原业务结果分开记录。

## 关闭后的后台探测直接消费者

Root 和独立主审、子审确认一个同批必要调用者：`PiRpcIdleCheck` 对已关闭 `get_state` 的拒绝仍重试两次，然后调用 session.fail；其 current 只核 ended/settling/revision，原 turns.stop 只设置 stopped。原 turns.end 位于严格 D/完整 stdout/投影之后，真实物理关闭超过约 200ms 即可让正常未写取消重新成为永久失败。`refreshUsage` 的失败仅诊断，但仍会在后续 turn_end 新发请求。此为源码可达问题；现场未记录被取消 entry 的 command，不将它当作该历史 entry 的证明。

增量写域只增加 `pi/rpc-session.ts` 与 `pi/rpc-turns.ts` 两个直接消费者；peer 仍在原域。采用 peer 原 beginClose 的同一真实关闭边界增加可选内部 `onWritesClosing` 回调，由 SWA Pi session 接到 turns.beginClose。该回调在拒绝原未写 entry 前同步调用且只调用一次；回调错误仍按原永久失败处理。原 `JsonlRpcAgentConnectionOptions` 继承 peer handlers 并在 strict 构造时原样传递，无需修改 connection 文件或公开 RPC。

此点覆盖 requested close、managed.onExit 直接 finishStrictExit 和原 stdout EOF 发起的 beginClose，避免只接 session.close 漏自然退出。turns.beginClose 只标记后台观察关闭、复用 idleCheck.dispose 停原定时器及排定探测，refreshUsage 不再新发后台请求。receive/raw tail、prompt delivery、真实 turn 状态、lane finalize、原 turns.end/EOF/D/lease/失败均保持；不提前 turns.end，不伪造 idle 或 turn completion，不泛吞 get_state 异常。已经实际写出的响应和失败继续由原严格 peer/policy 消费。

局部验证复用真实 peer/idleCheck 的既有边界与真实 Node stream/文件控制：不造 Pi policy或 provider 响应。核 beginClose 回调先于实际取消且只一次、回调失败仍使原队列失败；idleCheck 的 dispose 取消既有 timer 和后续 schedule，dispose 前真实本地读取失败仍按原重试转失败。原本地 callbacks 仅控制算法，不宣称 Agent/RPC 成功。随后执行受影响现测试和 scoped strict，准确源交06末审；严格 native tail/D 全链继续由后继 fresh Worker 验证。

该增量计划 `7a945824` 已获 Root 与独立主审接受。实际实现使用原 peer `beginClose` 的同步一次回调，严格 Pi session 才注册；回调异常保持原永久失败。`turns.beginClose` 只停止 idleCheck 和新 usage 请求，真实尾部 receive/prompt/lane/end 不变。

新增 consumer 测试首次 `rules-r3.exit=1` 在装配阶段停止，0 条规则进入：原 `jsonc-parser` UMD 入口保留 `require('./impl/format')`，孤立 bundle 加载报 MODULE_NOT_FOUND。修正测试装配为仓库现有正式 ESM alias 后，`rules-r4.exit=0`，13 PASS。Root 进一步指出固定 350ms 等待可能受事件循环延迟影响；测试改为等待真实 `failed` 回调的 Promise，9 秒只作为失败停止上界，不以响应时间判定通过。最终 `rules-r5.exit=0`、13 PASS，原 r3/r4 日志保留；`strict-r2.exit=0`，`strict-r2.log` 为空，`git diff --check` 通过。未重复原 MRE 或调用 native/model。

最终产品 SHA256：queue `fd62f549dae2480713e3017ed0d4e496c47a947ff97ee9741654f5d5f69a6914`；peer `16ee58b81949fd383bb3a354517828437c96e05dd194b2b0c7faffcfe0228e29`；rpc-session `34c0d8bbfda8faac336516a29a1c7ca50c99046254eeaa910d8efe6331dd50ae`；rpc-turns `208ef544c5e95556fd8df6128dccb390365ead8b3ebece369d1e9a28c07beebb`；现测试 `368e8659701d60de3b4242978a7b9f0c603c2f03845f981903fd929e0e3eb654`。原两产品 10 规则结果保留其前态范围；最终四产品、现测试及实际结果已获独立主审/子审限定接受。真实 Worker 停止/释放/完整树关闭仍待 Root 固定新源码后的全新请求验证，原 pi06 FAIL/UNKNOWN 保留。
