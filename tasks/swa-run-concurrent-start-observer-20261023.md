# 按原提交阶段提前启动同 Run Worker

基线 `26f5db17020ab8af0b3a48a2ccd3b78aeb9c6489`。Root授权collaboration_model只修改本任务及 `tests/swa-product-acceptance/run-installed.mjs`；acceptance_audit独立审查。05继续原ignored无模型RPC/TTY runner，写域无交叉。原计划 `4dd470c8` 已独立限定接受；以下记录该范围实现和局部验证。不启动模型、服务或完整构建，不改固定公开输入、Pi事件消费者和产品。

## 实际问题与来源

原driver的 `submitRun` 等CLI `run_submitted`，随后串行查outer、task和lead三份完整回执，才开始N−1个Worker。Go `submitOrcaRun` 只有lead `worker.start`完成才返回该CLI事件。正式S74aa原lead实际 `agent_start` 为12:21:02.750，`agent_settled`为12:21:10.461；三个追加父请求却在12:21:07才创建。原lead真实首轮约7.7秒，不能假定等待其它Worker启动后仍在输出。原helper串行与Run pending误判已另案修复，不改写这次正式失败。

现有公开只读接口已暴露更早的真实阶段：`request.show --project P --request-id outerR`返回原 `swa.controllerOpen` 回执，`receipt.submission`保存task/worker UUID，`children`是原两阶段回执。task阶段completed提供Controller/Run/root。查询lead UUID父请求可取得其 `children` 中准确 `${workerR}/native` 的 `orchestration.workerStart` pending回执；`receipt.accepted.taskId/dispatchId`与真实Task、Dispatch、Worker starting在原 `createStartingWorkerDispatch` 同事务产生。不得直接将带 `/native` 的ID作为公共UUID请求或推算任务ID。

`native-methods.ts`的委派准入要求父Task同Run且非terminal，父Dispatch唯一并处于pending/dispatched；没有要求父Worker ready。故lead实际接受后即可作为slot4 consult父任务。自动结算仍受原initial_workers、pending及真实后代门约束，不增加保活、不暂停自动释放。

Pi官方1.0.1的运行中prompt经steer排队；真实下一轮user echo才接受该输入，同一个agent_start可包含多个turn_start/turn_end。现 `pi-event-view` 用最新pendingPrompt限制原assistant delta，写入steer后原assistant仍输出时会误拒；stop的cid也不能继续假定等于首个prompt。这是独立的验收消费者限制，目前没有真实active-steer原件来证明完整动态结果。本次优先修复已证启动错峰，不增加模型轮或改这条消费者，也不声称active-steer已经验收。

## 唯一最小修改

1. CLI `run`仍只启动一次、默认wait保留。并行进行有界的原请求只读观察；absent及尚无checkpoint的pending阶段只继续观察，不重发任何mutation。不以本地算出的UUID代替原submission，不提前读取账号或伪造scope。
2. 校验outer原R、project、submission原command/role/conversation、spec及lead正文；从task completed原回执核C/Run/root。lead父回执须为同project/C/Run/root的worker.start，原invocation command/input与submission选型和输入一致；准确native子请求须为原child_request，方法为workerStart，只有真实accepted或completed/ready可提供Task/Dispatch。由现只读SQLite核该Task父为root、Dispatch同Run/Task、Worker当前runtime epoch，绝不将starting标成ready。completed失败或身份改变立即保留原请求并失败。
3. 取得上述真实lead身份后并行提交原固定N−1条worker.start，slot4只使用已接受的leadTask。请求、角色、consult/resume、模型、正文、数量、权限及预算不变。原lead完成与N−1请求共同allSettled，任何失败都先收集本次已启动请求结果，防止尚有请求执行就提前进入清理。
4. lead最终仍必须收到同outerR的 `run_submitted`，并重新完整核outer/task/worker三回执、原输入binding、真实ready与先前C/Run/root/leadT/D全等。旧检查移动到后继阶段，不删减；默认wait仍观察完整Run。全N真实delta重叠、指定stop隔离、后继同会话输入、自动交付/释放、strict失败与完整树关闭原门全部保留。若没有实际重叠，结果继续FAIL，不靠进程存在或排队代替。

## 验证、来源与停止条件

- 无模型局部只消费原S74aa packet的已保存完整outer/task/lead回执、cli8真实pending/accepted子回执及只读原库，投影准确字段和实际身份关联；保全原件SHA。原pending例来自当时slot4，不能改字段冒充lead历史状态，最终lead已completed的原件也不能倒写为过去pending。
- Node语法检查、实际源码差分与所有直接调用者源审；不为顺序变更重编原provider observer或无关工具。原11项executor/Run读取检查按已通过范围复用，不冒称本driver的新真实并发检查。
- driver是验收稳定来源清单的一项；变更后的准确SHA须由原准入消费者重新核验并生成新packet，旧授权/packet不覆盖新driver。下一次全新正式N4仍需要实际证明提前接受时点、原请求唯一、全N真实delta共同区间、停止隔离和全部退出；本页不自行启动该执行。
- 若公开stage没有足够身份、lead未真正accepted、原scope改变、未知结果或完成回执不一致，保原请求并停止，不增加重试、模型轮或新的测试RPC；必要产品问题另交Root。计划接受后实施和局部自测，再提交准确源码/结果独立审查。

## 实现与实际局部结果

唯一driver SHA为 `de51498d7d0c392f918a0ae4982a43b9417e396e3db334b886f18c3aa8638c43`。原CLI run只发送一次；原SQLite只读轮询阶段的method/state/caller/accepted，不在无checkpoint时调用公开完整查询。获得原outer/task阶段后，查询原lead UUID的真实native child。当前事务核原父/子same caller、原完整submission、Task/Run/root/Dispatch及Worker starting或ready/current epoch；保存实际早期库存和公开回执，不把accepted改写为ready。随后N−1并行启动，lead完整确认作为同一allSettled集合的首项。最终run_submitted和原三阶段完整回执、ready、input binding与早期身份全等，后继原originalStartBinding及全部真实delta/stop/release门保持。

局部只运行Node24.19.0语法与原件只读规则。ignored `.verification/n4-early-stage-20261023/replay.mjs` 使用仓库现TypeScript AST取当前driver的实际 `runSubmission/runLeadIdentity/acceptedLeadInventory` 函数；输入完全来自S74aa原CLI3命令及CLI4/5/6/8回执、原库，不运行driver顶层或服务。实际slot4样本仍为consult孙任务、当时native pending/accepted；原库当前Worker已经failed，既未冒充lead，也未回写成当时starting。

- 首次工具装配检查因仓库没有可解析的acorn而exit1、未进入规则；原工具chunk `74c835`。改用仓库现TypeScript，不安装依赖。
- `replay-r1.log` exit1：实际Go保存的spec_input.path是项目相对路径，新断言误与绝对命令路径直接比较；修为按实际project解析后等于原spec_file/input_file，正文/版本不变。
- `replay-r2.log` exit1：实际worker caller比submission多当前Grant期限，task与worker的context也各有新ID/创建时间。修为原submission稳定caller字段逐值相同＋原DBcaller fingerprint相同，完整submission/input/selection逐值相同；context仅排除Go `orcaContextContent` 本来不绑定的id/created_at，余内容全等。当前授权仍完全由原产品执行。
- `replay-r3.log` exit0；追加实际root/Run联表后，最终 `replay-r4.log` exit0，报告 `dc0ae85600a19c573f5310af83d913dad15fe0039272d290652842aeaa1ffe39`。五份原文件前后字节相同，真实completed lead全检查通过、slot4不能冒充lead；没有lead历史pending原件，不伪造该分支动态通过。fixture最终SHA `e6c76350151addb0f63f276afa14487a029248826aede3da17ff4b3926dced1f`。
- 最终 `node --check tests/swa-product-acceptance/run-installed.mjs` exit0，空日志 `syntax-final.log`，工具chunk `019271`；`git diff --check` exit0。未运行完整check/build或模型。原11项executor/RunView通过仍仅对应原产品范围。

acceptance_audit已独立限定接受准确driver `de51498d`及上述实际局部范围。新的早期lead观察、真实全N输出重叠及完整生命周期仍须下一fresh正式N验证。新driver必须由原稳定来源准入生成新packet，旧S74aa业务FAIL、旧UNKNOWN请求和补充exact2收尾的原边界保持。
