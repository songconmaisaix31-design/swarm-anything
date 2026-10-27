# Pi 最终内容块与 journal 角色

## 基线与最小复现

基线 `aba208d2e57a5921ffd6c10ea73d48822700d723`，工作树 `/workspace/swarm-anything`、分支 `integration/swa-task-cards`。本任务修复原 final-close 消费者的准确角色映射。活动文件读取由 live_evidence_fix 负责，Root 串行处理共享 task-result 导出、driver 和默认检查列表；各自的原失败分开保留。

Saba 正式 N4 的 Run `run_f679c6ae20d5` 最终报告 `native_pi_result_final_journal_identity_changed`。前三 Worker 的真实 final message 同时含 thinking 和 text，原生产者 `pi/rpc-messages.ts` 按索引及类型发布两个 text.close；`provider-timeline-text-streams.ts` 分别保存 journal role `reasoning` 和 `assistant`。旧 reader 对两项均要求 assistant，导致 reasoning 项误拒。slot4 原 403/turn failure 没有 close，是独立提供者失败。

只读最小复现原件在 `.verification/n4-final-journal-aba208d2-20261023/`。`inspect-01.json` SHA `19dd1a0e50f0dd2d536c031d622ccfe858e3171ecec907b18b677b72830c99ad`，运行退出 0。它消费同安装成熟 journal fold、原输入 turn 关联以及原 reader AST 精确选择/身份判断语句。三项 reasoning 的存在、root、message、fence、turn scope、latest turn 全部通过，唯一 assistant 角色谓词失败；三项 assistant 全部通过。该首个诊断曾手写换行拆分 trace/native，原报告保留此局限；后继回归已改用成熟 JSONL parser，不覆盖旧报告或原执行结果。

计划 `plan.md` SHA `b2fba3c096ebc52a6e9fb6bb656ac87d66933903906821d1784c5b67448aeba2` 已经独立审查接受，Root 开放准确四路径实施。

## 改动

- `runtime/swa-orca/src/pi-session-result.ts` 提取并实际调用 `readPiFinalBlock`，仅按原 content type、唯一 index 与 providerItem 的已有命名合同返回 `{index,role}`。thinking 精确要求 reasoning，text 精确要求 assistant；其它类型、不存在索引或 channel 不符均拒绝。
- 原读取器据此检查每个已按准确 provider/session/item 选中的 journal 项，保留 root、fence、最新输入同 turn、完整正文及成功终态门。对外 final 文本仍只来自原 text；error、aborted、非成功 turn 不会变为 complete。
- Root 在既有 `task-result.cjs` 导出该函数，driver 按同一个映射逐项检查真实 item，保留原 source/请求/输入/全文/fullD 门，不筛除冲突项。Root 在 `scripts/check.mjs` 原 Node 规则列表只增加 `pi-final-block.test.mjs`。
- 新 fixture `pi-aba-final-close.json` 仅保存本次实际 content type/index、providerItem 和 journal role；输入、思考与回答正文均不进入 fixture。纯规则的 type 交换、缺失索引、未知类型是明确的元数据反例，不构造 provider 协议或回执。

## 局部结果

`node --test tests/swa-cli-headless/pi-final-block.test.mjs` 实际 **4 PASS、0 FAIL、exit 0**，482.7ms，原件 `rules-r1/output.log`。独占输出目录仅链接显式原 runtime node_modules 并核 realpath，未安装或修改依赖。

`node .verification/n4-final-journal-aba208d2-20261023/regression.mjs` 实际 **exit 0**。报告 `regression-01.json` SHA `dd67ef5f9c0e3426f0740e793c59244e5da81be5b19f320cbe1c10064ef052f5`；工具 SHA `60366d7d6163228dbac63c7cf19d1f07df6486b4f31a695ae219f17f645806e1`。该回归用原成熟 stream-json/jsonl parser 读取实际 native/trace，原 SQLite fold、当前纯函数和原源码 AST 的整个 final-close 分支逐项验证：前三成功 Worker 全部 6 个 close 的角色、完整正文与所有原身份/turn/fence 门通过；slot4 原 error403/failure、无 close，仍非成功；历史 pi09 原 aborted 的一个 reasoning close 也准确对应，仍非成功。fixture 每个保存字段与原件投影相等；native、trace、journal 首末保持。报告 `complete_allowed` 仅表达该局部的 native stop 加 turn success 必要条件，不代表完整 reader export 或整个任务完成。

准确 SHA：reader `82050a2dce265b3e25def398be1f07400b45d61132f12110916bddab14d584ad`；新规则 `cd08d3c39d7a4c8f1ec94b85e9414c9e2b10122a55afd3a368696570c552c433`；fixture `e6072c43622efbba529044370fd9ca3a19b445a6f8fe4d40527ceb368d00c86c`。产品差分检查退出 0。共享消费者与 live 读取修改由 Root 统一后执行一次 runtime strict，本任务不重复并发检查。

## 剩余范围

完整 reader export 当前 **NOT_RUN**：生产 collectPi 需要真实 `inspectNativePiPolicy`、`verifyPrivatePiSessionAccount` 和 `validatePiExport` 的原 `snapshot.auth`；安全存档没有该 secret snapshot，也没有合法无 secret 回调入口。在不读取 auth 的当前边界下不构造空 snapshot 或 no-op callback。

本轮没有新模型、服务、完整构建或旧请求重放，没有修改原 DB、安装、trace 或 native。原 Saba FAIL、slot4 403、活动观察错误、lease/resource 和全树 UNKNOWN 均保留。完整 reader、自动结算、同来源安装及新的 N4/N6 输出重叠/停止隔离/完整资源释放仍须后继实际验收。

本任务四路径准确源码、最终共享消费者及上述局部结果已获独立审查限定接受。统一strict首次仅活动观察类型收窄报错，原日志保留；同谓词窄修后strict-r2实际退出0、无诊断。Go三包与239包架构检查通过，全批源码/局部已独审接受；未重复已通过规则或原件回归。完整reader及业务验收仍待新正式安装验证。
