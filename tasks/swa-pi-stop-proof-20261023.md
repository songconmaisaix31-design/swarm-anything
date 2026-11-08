# Pi 已关闭会话的验收观察

基线 `60f5e6e6`，分支 `integration/swa-task-cards`。collaboration_model 负责原 trace 与验收消费者，acceptance_audit 独立审查；release_audit 负责 pi07 原资源收尾。此次只修改验收消费者，产品、原数据库和旧请求保持不动，不运行模型、服务或完整构建。

## 原始事实与最小复现

pi07 `/workspace/swa-worker-pi-07-gcesGe` 实际 start/worker.show 成功，已观察真实 delta；活动检查点 sequence=81、cid=`1792751915266-42566c2035be6c45b5936187c11c0351`。stop 请求 `d3312e64-6cdb-43aa-b702-5a8d7be935f6` 返回 stopped，下一次 worker.show exit0。驱动在后续证据读取时失败，release 尚未调用，原整体结果 FAIL/UNKNOWN 保留。

唯一只读原消费者复现见 `.verification/worker-stop-proof-20261023/pi07-original-report.json`：读取原 worker.show source、只读 journal record/epoch和完整320行 trace，调用原 `validatePiEventView`，首错精确位于 `pi-event-view.mjs:313` 的 `ready && !active && (!pendingPrompt || pendingPrompt.echo)`；尚未进入 `originalPiTreeProof`。原 trace SHA256 `6a0d8a31f07a34a37f2b9871c7bc307031ed97b7fa63c5f95f281ba28c59c598`，未改正文、来源或顺序。

原记录顺序为 stop_intent284 → abort write285/settlement286 → assistant aborted312 → turn_end313 → agent_end314 → agent_settled315 → abort成功reply316 → custody_closed320，forced=false。最后 get_state 是51，停止后没有 idle 探测。当前 consumer 的 active 只在真实 get_state idle 响应后清除，因此把已完成原生 abort 并获得完整进程树关闭证据的 cycle 继续当作等待 idle 的活动会话；后续 `originalPiTreeProof` 也要求 cycle.idle，属于同一解释的两个直接消费点。

## 最小修复合同和写域

唯一源码写域 `tests/swa-product-acceptance/pi-event-view.mjs`。保留真实 idle 记录的原语义，另以原 custody_closed 为 closed 观察，绝不生成 idle、get_state 或虚构 turn completion。

- 在 custody_closed 分支首先复用原 `validateLinuxFinalCustody` 验证准确 native/root/owner/custody、两个 no-children、acknowledgement、root exit/absence。只有 forced=false、同 cid 的原 stopIntent、停止后的实际 aborted assistant、end/settled、唯一真实 abort写入/成功回复全部顺序成立，才能把仍等待 idle 的该 cycle 记录为 closed，并清除等待中的 active。
- 在同文件提取该停止原件顺序检查，供上述分支和 `originalPiTreeProof` 共用；检查内容沿原 activeStop 条件，不以仅有 custody_closed 或前缀判通过。原已观察 idle 分支仍检查其实际序号；新 closed 分支必须准确引用本次最终原 custody_closed 行、晚于唯一 abort reply。checkpoint.running、原cid、停止时序、先前delta、真正created native身份及forced=false仍由完整 proof 检查。
- 普通活动、自然完成但未观察 idle、缺失 tail、错误 cid、未获完整 D 及源失败继续拒绝闭合；不把新 closed 分支扩大为任意未完成任务通过。原模型成果验收/任务完成语义不改。

其余写域仅此任务和 `.verification/worker-stop-proof-20261023/` 原件回归工具。没有必要重建 checker 或增加模拟 native 样本；现驱动和安装验收自动消费同一原模块，不改其命令、权限、模型或 stop/release 顺序。

## 局部验证与停止条件

1. 保全原 consumer/codex-custody helper 的准确原字节，再用同一 pi07 原件及同一 expected 来源分别调用旧/新实际模块。旧模块仍精确失败，新模块须通过完整 validate+activeStop proof，closed 指向原320行，idle 保持缺失；原输入 SHA首末相同。
2. 使用实际 trace 的完整前缀至 abort reply 316，验证尚无 custody_closed 时仍保留 active、完整 proof 拒绝；不补造或编辑原生事件。另以实际 pi06 原 active checkpoint 和同一 pi07 原 trace 交叉配对，验证原cid/时序拒绝。这些属于本地消费者验证，不产生新的提供者事实。
3. 检查修改文件语法和准确 diff；同源原完整 D helper字节保持，原六项native身份/EOF/D生产门无源码变更。将准确源码与原件结果交06末审。

未取得原完整强证据即停止定位；不得删必要检查使结果通过。原 pi07 FAIL/release未运行/wholeUNKNOWN不改写。同原件的修后消费者通过单独记录，后继真实完整生命周期由Root批准的新请求验证。

## 实际实施和回归

计划 `13d45be4` 已获独立接受。唯一 consumer 实现为 `stoppedPiCycle` 共用原停止序列检查；validator 先验证原完整 custody，再在严格主动终止分支记录原 `closed` 行。完整 proof 继续检查相同原 checkpoint、停止身份、delta 和真实 native/fullD，接受原实际 idle 或上述准确 closed 观察。产品源、`codex-event-view.mjs` 的完整 custody validator、driver 命令和原数据库均未修改。

原 consumer SHA256 `671ea82fa79c225980be83a0302acb55cb9c8b26cf14e57e66178986f2633cf3` 与原 custody helper 的字节副本保存在 `.verification/worker-stop-proof-20261023/original/`。修后 consumer SHA256 `4c783f56ced14d4a1874e6adbcce7fdbaff3a28393eaa649a16efc5de83d3e1b`。

实际运行 `node --check tests/swa-product-acceptance/pi-event-view.mjs` 及 ignored `regression-pi07.mjs`，`regression.exit=0`；`git diff --check` 通过。报告 `pi07-regression-report.json` SHA256 `1aa18ba6e9866cbba4fac54249ab3d5b29088a7125953f31e36d8645c0d96f11`：

- 旧模块对相同320行原件仍在原 `!active` 断言拒绝。
- 新模块完整 validate/proof 通过；closed精确引用原320行，idle保持缺失，forced=false，原 stop R 不变。
- 原件截至真实 abort reply316 的完整前缀保留 active，没有 closed/idle，完整 proof 拒绝。
- 真实 pi06 活动检查点与 pi07 原件交叉配对被拒绝。
- 原 trace、worker.show 和旧 result 首末 SHA不变，完整 custody helper 当前字节与原副本相同。

局部只重新解释既有真实证据，没有发送命令、复用旧请求或运行模型。原 pi07 result 仍为 FAIL，release 未执行，整体树 UNKNOWN 不变。准确 consumer/任务/原件已获独立主审和子审限定接受，可供 Root 固定后继源码。
