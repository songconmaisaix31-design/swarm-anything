# N4/N6 第二批驱动独立源码审查

日期：2026-10-23 UTC。Reviewer：`/root/capabilities`。Root明确分配独立审查，该四源由 `/root/release_audit` 实现，本Reviewer没有修改被审驱动、公开任务或授权工具。工作区 `/workspace/swarm-anything`，分支 `integration/swa-task-cards`。

结论：**限定接受本批源码及已报告局部检查范围**。没有发现需要阻断本批提交的确定缺口。这不是新安装、模型、N4/N6或Windows原生验收通过。

## 准确来源

实际逐文件校验 `.verification/cloud-setup/n46-run-integration-20261023-02/sources-r2.sha256`，首末均四项OK：

| 文件 | SHA256 |
|---|---|
| `tests/swa-product-acceptance/run-installed.mjs` | `da5d195bcd0a1a18919e24bb23ad941724fdd82b23ff5601d163b4ac0cdfe6ef` |
| `tests/swa-product-acceptance/public-case-definition.mjs` | `a85fb8a4bfe91a4fe6d844dd5724d6d5f0da696bf807b7ed2d052a4d051f8c8c` |
| `tests/swa-cli-headless/authorize-installed/README.md` | `8180b9ae54338f74e4540cdaaf5971c739584954bdf92e2edf2d4fcbdfe32170` |
| `tasks/swa-concurrency-20261023.md` | `4510aeb048a57865c27118a9f379f66d74d32ac883550e3a2887b095b1b88085` |

完整读取1874行driver、公开case、README、任务与已06接受的 `n46-run-integration-plan.md`；另读实际 `run-settlement.ts`、`run-view.ts`、`native-methods.ts`、Go Orca/Run与CLI提交事件的直接合同，以及原Linux完整custody验证函数。审查以上真实消费者，不依赖实现负责人自述宣布成功。

## 核验依据

- **同Run与递归身份**：仅固定Linux Pi N4/N6进入新路径。默认等待run的原R与正式提交事件双核；内部Task/Worker阶段R从原receipt取得，不手工伪造submission。initial_workers=N使lead仍计入N；补N−1，槽位4用lead的真实child Task作为parent。最终run_view、实际tasks/Dispatch/resource库存和完整export按同Run逐项相等，孙任务不能遗漏。
- **并发与额度**：全部N原生start尚未结束、每项至少两条实际delta，取同daemon单调时间公共区间。N+1在主动停止前要求准确resource_limit，随后全递归Task与Worker数量不变。无公共窗口时失败，不以进程数或排队通过。
- **停止隔离**：仅槽位2以唯一原请求主动停止，停止前原cycle仍运行。原stop-intent、实际abort、journal tombstone与原turn、完整D及原PID身份退出相互核对；其余N−1保持原session/fence/provider/process，并有完整停止观察之后的新真实delta。未知stop/release仅查其原R，不能创建替换请求。
- **继续与交接**：N4只在lead首轮idle且孙任务仍活的实际窗口追加；窗口不存在即失败。N6读原child完成mail，核Task.result、parent/child Dispatch、同Run、audit_only、原callback R及R/native binding；原provider全文、第二轮delta/完整turn和最终已读mail/run_view相互对应。queued或stored不会当作模型送达。notify不创建Task/Worker，导出原输入库存仍检查无隐藏额外prompt。
- **自动释放**：每个Worker核原 `${rootTask}/native-lifecycle/${dispatch}/release` receipt，resource ID/origin/owner/terminal/process原样且released；原session record claimStatus=released、ownerProcess=null、death ownerFence及递增fence一致。实际原custody完整D两次无子进程、forced=false及原bootstrap/nativeCLI身份缺席另核。新路径不再手工停止已自动释放项；CLI观察者退出明确不作为Worker退出证据。
- **去重和未知**：仅在原request.show已completed后重放原Run/Worker/send/stop，比较原receipt/current_input与原native完整entry IDs/hash/prompt写入/echo/turn计数，并再观察300ms。同R改正文须request_mismatch。错误路径保原R，仅查询；未知启动不以新增Worker补数。
- **角色、权限与成果**：四个真实项目Role和Conversation保原ID/revision/内容；N6在同项目复用角色，原task.spec.role_snapshot核对，全部Worker释放后角色仍可读。所有实际输入限固定公开四原文/批准后续或原child成果；ToolsOff沿原选择、来源与准入，不凭提示词宣称。Agent/model/account的安全投影与原selection一致，成功认证仅要求完整实际成果。独立业务审查在完整成果之后，driver不自动生成审查通过，也不再task.complete改写已自动结算的Run。
- **严格模式与未发生分支**：普通wait保持成功lead的根结果；strict按实际failures确定0/7，不先验把计划停止当业务失败。未发生的needs-input/timeout/跨人类输入/GUI等保留单独未验范围，未将此两个模型批次虚构成覆盖所有退出码或Agent。

## 实际检查与限制

读取原r2语法、diff和源码稳定检查exit文件均为0；公开consumer N4/N6与旧默认N3原exit均0，日志记录固定revision、四文件及对应workers。它们只证明源码可解析与公开输入逐字匹配，不能证明原生执行或N容量。Reviewer只做只读源码/证据核对，没有启动CLI效果、HTTP服务、授权、模型或完整构建，也没有读取账号正文。

新不可变安装、实际owner生命周期、N4/N6原模型输出与停止/自动释放证据、真实业务审阅仍未执行。Windows原生环境未提供。需在最终源码的新安装上串行完成N4再N6；实际窗口、限流、完整源上界或任一未知导致失败时，必须保留失败与原请求，先定位并局部复验，不能换ID或缩减N来覆盖。
