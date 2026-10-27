# 运行中的原生事件观察

基线 `aba208d2e57a5921ffd6c10ea73d48822700d723`，工作树 `/workspace/swarm-anything`、分支 `integration/swa-task-cards`。实现由 live_evidence_fix 负责，acceptance_audit 独立审查。计划 `.verification/n4-live-evidence-aba208d2-20261023/plan.md`，SHA `ec2336782f6624376f60bd2abb62876fb05752376778e4373031dd816f611b23` 已获限定接受；Root 随后开放精确文件和共用读取 helper。Pi 最终块关联由 collaboration_model 独立负责，Root 串行整合其 re-export/driver 片段，本任务保留这些改动。

## 原失败、最小复现和边界

本轮 N4 原件 `/workspace/swa-pi-n4-packet-aba208d2-20261023-01` 保持 FAIL。首个 CLI14 的 `worker show` 在 14:52:03.205–04.868 读取 lead `ctx_261e7b7653f1` 时返回 `evidence_missing`，准确对应旧 `task-result.ts:153` 的 count/version/LF 联合门；CLI16 对应全版本复核，CLI17 对应 session/inventory/Worker/resource 联合门。没有失败瞬间各分项快照，153 和 555 的具体历史分项保持 UNKNOWN。

Reviewer 只读最小复现位于 `.verification/n4-live-source-aba208d2-20261023/`，报告 SHA `33da90d76dc059e0d4358264a1722c22be0eeb161fa63bfc0e6d88a257c5a689`。同 dev/ino/birth 的原成功观察由 1770795 字节增长到 2679957 字节，当前稳定 trace 为 4249157 字节；原失败窗内存在 170 条 native/projection 记录。AST 精确取原 version/guard，旧 metadata 对当前完整 LF 文件触发原拒绝，当前 metadata 对同文件通过。该结果证明整文件版本门会拒绝增长来源，不能补称历史所有前缀逐字不变，也不能代替完整运行验收。

slot4 原提供者 `403 No approved upstream IPv4 address`、Pi 最终块错误、原服务收尾 UNKNOWN 各自保存，本任务不改判或重发原请求。

## 实现

`provider-trace-observation.ts` 仅负责活动文件观察，复用原成熟 NDJSON framer。单个 nofollow FD 固定初始读取范围，核 canonical path、原 FD/路径身份及调用方原私有文件检查。标准 fatal UTF-8 streaming decoder 保留半个尾部码点，`ignoreBOM:true` 防止字节偏移被静默改变；framer 只交付完整 LF 记录，余下原字节明确计入 `incomplete_tail_bytes`。同 FD 再读已消费前缀并逐字比较，截断、替换、权限变化、完整坏行和原前缀改写拒绝。返回值保存观察时间、完整字节数、记录数和未完成尾部，无自研 parser 或新 Manifest/Hash 协议。

`task-result.ts` 的活动观察调用此 helper，仍复用原 schema、sequence、session、fence、native frame、custody 和 lease 校验。`provider_events_observation.kind=prefix` 表明来源范围。仅 Codex、Claude 和每会话 Pi 的既有投影检查发现只读快照失效时，最多重新采集三次；原 scope/Dispatch/session/head/selection/账号/resource incarnation 固定，真实来源错误直接抛出，原来源消失不能当作重新可用。旧 Pi/OpenCode 路径在来源变化时仍立即拒绝。所有读取都不发送 mutation 或模型输入。

完整结果继续走原全文 count/version/LF 检查及最终 verify。原三个 `requireClosed = resource.release_state === 'released'` 条件保持。活动观察一旦包含 `custody_closed`，非空尾部立即拒绝并恢复原全版本 verify；关闭证明不能覆盖后续半帧或增长。

验收 driver 的 Linux Pi/Codex `events()` 通过现有 `task-result.cjs` re-export 消费同一个文件 helper，保留原跨观察字节 witness、session owner、binding 和 Pi/Codex view 的独立语义检查。服务观察与 driver 后来的观察分别保存范围；完整前缀不能回退。若本次真正读到关闭记录，拒绝尾部、核严格版本，并重新只读观察同 Dispatch 的原 custody，处理读期间合法关闭。原 Windows 旧 Pi/OpenCode 路径和完整 native/export 检查不变。

## 局部结果

- `node --test tests/swa-cli-headless/live-trace-observation.test.mjs`：4 PASS、0 FAIL、exit 0，247.546441ms。原件 `.verification/n4-live-evidence-aba208d2-20261023/rules-r1.log`。测试使用真实文件系统、现有原错误记录/实际 journal 元数据/仓库原文本，明确只是读取规则。覆盖追加、半 UTF-8、截断、同长度改写、替换路径、Linux 私有模式变化、非法 UTF-8/JSON、BOM 和字节上界；不伪造 provider 执行或 native 回执。Windows 权限条件尚未实测。
- `node .verification/n4-live-evidence-aba208d2-20261023/regression.mjs`：exit 0，完整读取本轮四份真实 trace，14352694 字节逐字等于原文件、原版本不变、尾部均零，原 slot4 错误保留；无 HTTP/模型/原请求。报告 `regression-01.json` SHA `93d52d69832bb37aa1ffbca85c7fa57143b4e508e6d913c830e26efe8049069a`，包含实际 bundle 两个源码输入的 SHA。此回归只证明文件读取，不声明原账户、完整业务 reader、运行中 Worker 或 export 已重验。
- driver Node syntax 和 `git diff --check` 均 exit 0。Pi 与本任务的 runtime strict 由 Root 合并执行一次，本任务未单独重复。新规则默认入口接线由 Root 串行维护。
- 独立 CR 发现最初三次重采也覆盖旧 Pi/OpenCode fallback，该路径没有结构化 trace 的原 owner/fence 复核，可能重新接纳同 session 的身份漂移。已在 Root 提供的独占窗口收窄为上述三个结构化路径；旧路径恢复原拒绝。这个分支返修不修改 helper 或四条文件规则，未重复编译；准确共享源码交独审，合并 strict 由 Root 执行。

独立 Reviewer 已接受 helper、共享 task-result 中本活动读取差分、driver、四条规则及真实四文件回归；容量由 Root 独立统筹。首次合并strict的唯一TS2322来自布尔别名未收窄record.provider；按相同谓词取得明确traceAgent后，strict-r2实际退出0、无诊断，准确窄修及全批局部结果已独立接受。原失败日志保留于 `.verification/n4-result-capacity-aba208d2-20261023/`。未声称新运行、完整 export 或 Windows 已通过。

当前 helper SHA `4ad13fad87e370bfcc71575a9823c7883712717535907b6bd4b023b6a7e35d0e`；规则 `f8de36b3d6e321edc16bab9534a38357a845614782afe0a1d5d7ec619ace0000`；共享 task-result `157a7713fa9524849a636e52f3229f21b2a3f59f471558cb5da0789672b1a28a`。共享driver同时包含Pi最终块及96MiB容量消费，以本批准确提交为准。

## 后继与保留限制

跨状态实际重采、完整账户/原生结果导出、运行中新 N4/N6 和 Windows 均未在本任务运行；完整构建和模型须待独立源码/局部结果审查及 Root 开启。

另有已发现的聚合界：原四份 trace 原字节和 14352694 大于基线 12MiB（12582912），基线 driver Linux witness 聚合和产品默认全 Worker `completeTaskResult` 的最终 JSON 都会触界。任务 `swa-concurrency-20261023.md:31` 和 SPEC 规定先调查真实触界，不过滤或改称完整。此次实际尚未运行到该门，它不替代首个 153 失败。容量合同及所有直接消费者由 Root 独立统筹，不计为本活动读取修复的变更；本任务未自行扩大或截断来源。
