# SWA 一次提交与完整任务 CLI

## 范围、基线与来源

初始 CLI 负责人 `run_cli`，共享工作树 `/workspace/swarm-anything`，分支 `integration/swa-task-cards`，起点 `11619d72f08c163f159a4f4befe270806b1b67ea`。本任务落实用户 2026-10-23 的第一项要求。后继同 Run 问答及明确继续由 `remaining_delivery_audit` 统一负责，准确当前状态见 [STATUS](../STATUS.md)。各批按已审跨模块合同和测试计划实施，下文保留初始验证及失败记录。

已完整读取 [OpenMausBot 固定版本 headless CLI 文档](https://github.com/milind-soni/OpenMausBot/blob/30b62aaf18adc22099c24a7181abf5e9ddead980/docs/headless-cli.md)。原文保存在 ignored `.verification/swa-run-cli-20261023/openmausbot-headless-cli.md`，仅作为设计参考。采用一次提交、重连、递归等待、严格失败、独立等待退出状态、稳定请求 ID 和完整导出；权限继续使用 SWA 当前项目 Grant，不能采用原文中回环服务自动成为 owner 的规则。

复用的生产路径：`cmd/swa/main.go` → `POST /api/v1/local-projects/{id}/orca/commands` → `OrcaExecutionService.ExecuteOrca` → runtime `client.ts`/`native-methods.ts` → 原生 Orca Run/Task/Dispatch。已有规范 UUID、原请求查询、实际选择及身份、一次 stdout JSON 和独占目录 `task.result` 导出。原生 `task.create` 通过稳定子请求 ID 创建 Run 与根 Task。

初始基线的缺口是 CLI 只有单次低层命令、根任务需要显式 `task.complete`、`task.result` 只接受根的直接子任务且完整库存上限100。完整任务入口现复用后端的递归状态、交接关系和成果来源；controller helper 仍不充当执行主 Agent，Worker 启动成功、任务静止或 HTTP 成功均不解释为任务交付。

## 已确认合同

```text
swa run --project P --workdir W --spec-file F --input-file I
        --agent A --model M [--name lead] --request-id UUID
        [--question-mode disabled|native]
        [--role ROLE --role-revision REV] [--conversation CONVERSATION]
        [--timeout 30m] [--on-input exit|wait]
        [--strict] [--export ABS] [--json]
swa wait --controller C --task ROOT --run R
         [--timeout 30m] [--on-input exit|wait]
         [--strict] [--export ABS] [--json]
swa export --controller C --task ROOT --run R --output-dir ABS [--json]
swa question answer --project P --controller C --run R --task ROOT
                    --dispatch D --question Q --input-file F --request-id UUID --json
swa question resume --project P --controller C --run R --task ROOT
                    --dispatch D --question Q --request-id UUID --json
```

`run` 默认等待整个递归任务。每次输出保留原 Run、根 Task、controller 和原 request ID，重连不查找“最新任务”。等待期间 timeout 与 Ctrl-C 仅取消当前 CLI 的等待，原任务继续运行；不会隐式 stop/release。需要用户输入默认返回单独退出码；`--on-input wait` 继续等待同一任务。

HTTP 动作为 `run.submit`、`run.show`、`run.export`，沿当前 OrcaCommand/OrcaEnvelope；OrcaCommand 增加 `run_id`。后端共享快照位于 `result.native.run_view`，schema 为 `swa.run-view.v1`，包含 `controller/run_id/root_task_id/status/root/tasks/dispatches/questions/blockers/failures/deliverables/complete/observed_at`；status 为 `active/waiting_input/blocked/completed/failed/unknown`。GUI 与 CLI 使用同一快照，CLI 不通过任务数量计算完成。提交可先返回准确原身份，CLI 随即读取 Run。导出位于 `result.native={run_view,result}`，其中 result 是既有完整 task.result 原件。

问题回答使用 `question.answer`，公开命令固定 controller/run_id/root task_id/dispatch_id/question_id/request_id 和 input_file 或 text 二选一；CLI使用 `swa question answer` 及文件，GUI使用同 Run 表单。`answered_questions` 由原问题和答案消息完整派生，pending questions 含义保留。原文最多32000 UTF-8字节，原 request 未确认时只能查询；准确 completed parent/child 均明确 rejected/effects_applied:false 后才允许用户显式修正并新建请求。人类按当前项目独立send授权，Agent仍绑定原Grant。原 reply/ask 与 db.answerQuestion 是唯一答复语义；回答本身不追加模型输入，仍活跃的原工具等待自动收到唯一答案。

回答增补按已审计划 `dacf0594235054725dd6215b8ecd107d56bbe2b99bf854ea9a2f0b66a872e4b3` 完成源码与限定局部检查，原证据和失败修复保存在 `.verification/cloud-setup/run-question-answer-implementation.md`。后继原生提问与明确继续按已审计划 `fa62e2ee310e11e92d63acc77612285bed8ed6e393ff5e119928ddece5d10917` 实施：固定 Pi 扩展沿原本地 RuntimeClient→经当前 Worker 来源准入的 orchestration.ask 生产原问题；provider 自身 question journal 仍属于另一来源。源码接线不代替真实模型实际调用、原 ask 返回和 CLI/GUI 完整链的验收。

`question_mode: disabled|native` 只用于新 Run、worker.start 和 Role 默认值。旧记录为 disabled；明确 Role 选择按原准确版本继承，编辑、归档、复用不丢失模式。native 只接受 Pi 1.0.1 per-session 账号合同及固定 `swa_ask`，原生文件与命令工具仍关闭。禁用工具 preamble 要求最终助手成果并由 runtime 收集；questions-only preamble 只说明已提供的问答工具和最终成果，原任务规格完整保留。当前 ToolsOff N4/N6 合同保持。

原工具等待已结束且原答案已存时，`question.resume` 在真实同 session/fence/consumer、实际 idle 和没有未知输入的条件下重新核当前独立 send/外发权限，复用原 helper→swa.workerSend→sendAgentTurn 发送固定“读取原问题并继续”指令，不接受用户自定义正文或文件。输入接受仅证明投递，真实新工具调用读回唯一答案及后继模型轮次才支持正常交付。无需 Conversation。原请求未知只查询同 R，不能自动重发；读取未确认的问题阻止自动收尾，明确 stop 仍须真实停止及退出证据才回收。

已答记录的 read_state 为 answer_saved/read_unconfirmed/read_observed/continuation_required/interrupted；仅 continuation_required 同时给出 true 布尔并开放同 Run 继续按钮。CLI 保留退出9，按真实状态给准确 question answer、question resume 或原 wait/request 查询命令。角色默认模式、当前 Agent 能力、实际启动选择和真实工具结果分层显示，能力声明不算实际提问成功。

`run.submit` 由后端复用当前 controller/task/worker 的实际生产调用和原生请求账本。一个外部 UUID 派生固定阶段请求 ID，重复或重连不随机重造提交身份；同 ID 改变内容须沿原幂等规则拒绝。任何阶段已送出但结果未知时停止写入并查询原请求；客户端不自动重发提交。读请求可在暂时断线后继续重连同 Run；明确权限拒绝立即结束。

`run.show` 返回当前快照，不增加 `wait_ms`；现 Run 观察入口同时触发同 scope 的既有结算，原问题库存与真实工具结果约束收尾。CLI 在自身 timeout/context 内按有界间隔重读同一身份，不读取或确认 Agent 信箱，不建立后台轮询任务、调度器或另一套完成状态存储。

保留低层命令现有退出语义，完整任务命令使用：0 成功；2 参数/文件错误；3 权限/批准不足；4 能力不可用；5 资源拒绝；6 效果未知；7 任务失败、严格子失败或导出失败；8 等待超时；9 需要回答或继续原问题；130 当前等待取消。`--strict` 使当前 Run 完整递归任务集合中的任一子任务失败返回 7；实际创建 Task 的 `consult` 同样计入。单向 `notify` 没有 Task，不持有任务完成条件。

`--json` stdout 始终只有一个最终 JSON，stderr 输出进度 JSON 与可直接重连的原身份命令。进度不包含 token、API key 或原生秘密配置。JSON 的 `ok` 仍表示当前命令结果；任务业务状态单独来自后端快照，不能把提交成功当成交付成功。

`--export` 在任何提交之前检查目标为绝对且独占的新目录，现有目录拒绝；本轮不提供覆盖文件的 `--force`。`export` 复用后端完整原生结果读取及当前项目文件权限，保存任务记录、实际结果与可准入的产物。任意 Markdown 链接不能直接成为文件读取授权；拒绝越界、符号链接、任意目录递归和不完整成果。后端返回固定导出合同后，CLI 只负责安全写入。

## 写入归属与依赖

初始 CLI 批次独占：`cmd/swa/main.go`、`cmd/swa/output.go`、`cmd/swa/run_flow.go` 及对应 `cmd/swa/*test.go`；`runtime/swa-orca/USAGE.md` 的完整任务 CLI 章节；本任务文件。保留 serve 和原低层命令语义。后继同 Run 问答批次由 `remaining_delivery_audit` 按 Root 释放的准确写域统一维护 Go、公共契约、原生直接消费者、GUI、生成物与规格；Root 独占提交、STATUS/HANDOFF、完整构建及真实模型/平台验收，不能从原 CLI 归属推导其它源的并发编辑许可。

`collaboration_model` 负责 Run 提交、递归快照、交接与成果的后端语义；Root 负责 Go/schema 公共合同与 GUI；独立 Reviewer 负责计划和源码/结果审查。准确DTO冻结前不写依赖该DTO的产品代码。

## 验证计划

1. 本地真实 CLI 参数与文件路径：run/wait/export help 不访问服务；未知参数、缺失 UUID、非法时限、非绝对/已存在导出目录、非法等待组合在传输前失败；已有 controller/task/worker/request 命令准入保持。
2. 正常真实服务链：同一安装与当前项目 Grant 下通过 run 提交、取得原生 Run/root/主 Dispatch；CLI 与 GUI 读取同一递归集合，等待至真实交付并导出完整结果。实际 N=4、N=6 与递归孙任务由总验收驱动覆盖，不以 N=3 或仅顺序完成代替。
3. 幂等与断线：同一稳定请求 ID 重复提交只产生一份原生工作；内容变化拒绝。客户端断开后用打印出的准确身份 wait，运行期间或已结束时均返回原任务；暂时服务断线只重读；未知送达后不产生第二次写请求。根据真实请求账本和 Dispatch 库核对数量。
4. 独立退出：实际需要用户回答、实际等待超时、实际失败和 Ctrl-C 分别产生 9、8、7、130，stdout 为一个完整 JSON，原任务继续存活；权限撤销/过期为 3 且停止查询。失败路径必须通过真实生产服务操作或已存在原始失败记录验证，不能伪造 HTTP、CLI、Agent 或数据库执行事件。
5. 递归严格语义：主任务成功且一个真实子任务失败时，普通结果保留失败事实，strict 返回 7，包含实际创建 Task 的 consult；孙任务未完成必须继续等待；notify 不持有完成。动态创建的孙任务与主任务收尾须通过后端一致快照/事务门判断，不能以暂时空集合判为完成。跨项目、跨 Run、不同 controller/root 或未验证递归集合失败关闭。
6. 导出：真实完整结果与后端原件匹配，结果文件只出现一次；缺失/增长中的原生结果、非法/已存在输出、实际越界/符号链接和写入失败均保留错误，不能返回截断的成功成果。输出错误时只写 stderr 和已知原身份，不尝试第二个 stdout JSON。
7. 局部检查：使用已配置 Go 工具链运行 `go test -mod=readonly ./cmd/swa` 适用测试及 `gofmt` 检查；真实安装检查归入统一验收，不自行启动完整 build 或 Windows CI。跨合同静态检查由主控安排一次整合运行。

测试前将 TMPDIR 指向 ignored 工作目录，避免使用 `/tmp`。保持真实最小复现、原日志和精确原因；任何失败在修复并局部验证后先交代结果，随后才可启动下一完整构建。没有真实模型或平台证据的场景继续写为未运行。

## 当前结果

以下记录初始 CLI 批次的实际结果。固定来源、RunView、动作、Go RunID 字段、有界轮询及写域已按独审计划实施；strict 覆盖所有实际递归子任务，动态孙任务由后端一致快照判断。后继问答批次及当前真实验收边界另见文末与 STATUS。

首轮局部命令 `go test -mod=readonly ./cmd/swa -run 'Test(RunCLI|RunExport|OrcaCLIRejects|OrcaCLIMissing|OrcaCLIHelp)' -count=1` 在共享 Go 接线仍处编辑中时执行，退出 1，未运行 CLI 用例。原日志 `.verification/swa-run-cli-20261023/local-cli-test-01.log` 的全部诊断是 `OrcaRunSubmission` 与 `submitOrcaRun` 尚未定义，对应主控正在原子补充的 `orca_run.go`。停止复跑，等待主控声明该接线就绪后再做同一局部验证；未启动完整构建。

主控补齐 Go 接线并完成其局部编译后，同命令第二轮实际退出 0，`cmd/swa` 用时 0.011s，原日志 `.verification/swa-run-cli-20261023/local-cli-test-02.log`。此轮覆盖新旧本地帮助、参数拒绝、缺少当前 Grant，以及真实文件系统的新/已有/相对/缺父目录和符号链接导出前置。`git diff --check` 通过。没有用假 HTTP、原生协议或 Agent 事件测试成功路径；同安装真实 Run、超时/问题/严格失败、完整导出与 N>3 仍待整合验收。

该初始 CLI 批次提供单次 `run.submit`、准确身份的 `run.show` 等待和终态后的 `run.export`，stdout 沿原类只发布一次最终封套，stderr 发布进度及重连命令。导出写入独占 `run.json`、`result.json`、真实 Task 结果文本和对应 Task ID 索引；不读取结果中的任意文件链接。

## GUI 同一 Run 接线

主控后续授权本负责人追加 `web/src/pages/swarm/SwaRunWorkspace.tsx`、`swaRunView.ts`、`SwaWorkspace.tsx` 的必要接线及 `swaObservation.ts` 消费者扩展、共享样式中的复选框尺寸、`web/e2e/swa-workspace.spec.ts` 对应真实 DOM 检查。一次提交表单复用当前 `swaApi`、项目能力准入和稳定请求保存；未知时仅查询同一原请求及其已记录阶段，不自动重发。准确 controller/root/Run 重连通过 `useReadApi` 读取同一 `run_view`，展示完整任务集合、阻塞/问题、严格失败事实与成果入口；原 Worker 操作仍连接同一个根任务。长期角色面板由 capabilities 负责人独占实现，本模块负责接入回调与准确角色版本、讨论会话 ID 透传。

GUI 验证包含 TypeScript 与 ESLint、原观察/准入规则测试，以及真实服务上的无截图 DOM 操作：缺权限/未知请求阻止重复提交、项目切换和过期快照禁用操作、实际 Run 与 CLI 相同、重连只读、成果入口只接受后端完整结果。浏览器不采用 mock 路由、伪造 Agent 或截图。后端尚未启用时只验证实际不可用/拒绝状态，不能把它记作 Run 成功验收。

既有真实服务不可用 DOM 用例增加完整任务提交与重连的禁用断言。允许 observe 授权后的 role.list/conversation.list 真实只读查询，保留准确项目路径和无写动作断言，原项目控制许可往返、撤销及版本冲突用例继续运行。

局部 Web 类型检查第二轮实际退出 2：仅 `SwaRoles.tsx` 的四处 `role.skills/role.knowledge` 可为 null，却直接调用 join。最小复现 `pnpm --dir web exec tsc -b --pretty false`，完整日志 `.verification/swa-run-cli-20261023/web-typecheck-02.log`。capabilities 负责人依共享合同把明确 null 归一为空引用数组，修复四处消费者后同命令第三轮退出 0（`web-typecheck-03.log`）；未启动完整候选构建。

最终 CLI 局部第四轮 `go test -mod=readonly ./cmd/swa -run 'Test(RunCLI|RunExport|OrcaCLIRejects|OrcaCLIMissing|OrcaCLIHelp)' -count=1` 退出 0（`local-cli-test-04.log`）。指定 GUI 源及 DOM spec 的 ESLint 第二轮退出 0（`web-lint-02.log`）。`pnpm --dir web exec vitest run src/pages/swarm/swaObservation.test.ts` 实际 9 项全部通过（`web-observation-test-01.log`）。这些结果只覆盖局部类型、静态规则、参数、文件边界及既有观察纯规则；不代替同一实际安装 Run 的模型成功证据。

DOM 第一轮退出 1，业务用例尚未执行：Chromium 报 `Socket path too long`，准确失败路径为本次长 TMPDIR 中的 `org.chromium.Chromium.*/SingletonSocket`（`web-dom-01.log`）。改用仓库 ignored `.verification/run-tmp` 后，单独实际 Chromium launch/close 检查退出 0（`browser-start-local-01.log`），随后同一 DOM 命令第二轮实际退出 0，2 项通过，用时 14.0s（`web-dom-02.log`）。命令为 `ASTROCYTE_TEST_BROWSER_EXECUTABLE=/usr/bin/chromium pnpm --dir web exec playwright test --config e2e/swa-workspace.config.ts --project chromium-1280 --reporter list`，TMPDIR 与输出根均显式使用本仓 ignored 目录；实际 Go HTTP、SQLite、Vite、浏览器产生的原日志保存在 `dom-r2/`。没有使用截图、mock 路由或虚假原生数据。

同一 DOM 检查确认完整任务提交/重连在运行时不可用时禁用，角色/讨论读取失败时新建入口禁用且编辑/归档/追加入口不存在；撤销 observe 后这些入口全部消失，发出的命令仅 status/role.list/conversation.list 且项目路径准确。原权限保存、撤销与陈旧版本冲突同样通过。该环境未启用 native，无法触发真实 Run 或未知写入，相关成功/未知场景仍待最终集成。

等待期间完成后的 export 读取若恰逢 deadline，也保持 8 超时与 130 用户取消的区分。此修正后的 CLI 局部第五轮实际通过（`local-cli-test-05.log`，0.010s）；`run_flow.go` SHA256 为 `7fe0928d7f456f08c581827a79afef7b7d97410eada5417b9527ab9deecae0bd`。最终指定 8 个 GUI/DOM 文件 ESLint 第三轮退出 0（`web-lint-03.log`），包含 capabilities 负责人最终角色三个 TypeScript 文件。

最终 Web `pnpm --dir web exec tsc -b --pretty false` 第四轮退出 0（exec session 89841 完成记录，`web-typecheck-04.log`）；指定 CLI/GUI/DOM/USAGE/任务文件 `git diff --check` 退出 0。未创建 Commit 或发起完整候选构建，准确分支仍为 `integration/swa-task-cards`；同一安装完整 Run/N4/N6/Windows 与其失败分支由总验收继续。

后继 Root 冻结 `run_view.acceptance: unreviewed` 与 `handoffs` 实际原生消息数组。GUI 区分执行完成与成果未审，展示真实 from/to/text/read 和原 record；观察不确认消息已读，恢复排队不表示父已处理。CLI 进度保留 acceptance 与交接数量，要求同版本完整集合，成功退出不宣称人工已经验收。新增字段消费后的 run_flow SHA256 为 `62631bccf05d93d57ca6a16aaf35c3372be8c84750fff814a646262588b2645d`，替代此前摘要；该字段消费后的局部 CLI R6、Web tsc/lint R3 与实际 Vite 构建均通过，准确日志见 [独立前端验证](swa-web-separation-20261023.md)。后继独立服务的真实不可用 DOM 两例也通过；真实交接消费与 N4/N6 模型结果由总验收继续。

## 原生问答与明确继续的局部结果

本批产品基线为 `392cb0c9459f0b88440f14b366be2435f48816c5`，接续 HEAD `aba8cbd007d30342a665eddac8edeef846be63f7` 的推进来自已审 N4 驱动与记录，不改变问答文件的审查基线。原生提问、同 Run 回答/继续、模式与生命周期直接消费者由 `remaining_delivery_audit` 按已审 fa62e2ee 方案统筹；当前为源码实施及限定局部检查，尚未以本批完成同源安装或真实问答验收。Go 消费者已获分段静态审查，整批准确源码、适用集成检查及独审仍由主负责人汇总。

Web 的 Run/Worker 显式模式选择、角色原模式保存与复用、已答读取状态和“继续此问题”按钮已接入同公开命令。answer/resume 在同 Run 共用原请求锁；pending、未知或一般权限错误不会改用新 R，准确无效果拒绝才允许用户明确修正后重新提交。继续操作只显示输入已投递，原工具读取仍由后端实际记录确认。`pnpm --dir web exec vitest run src/pages/swarm/swaQuestionAnswer.test.ts src/pages/swarm/swaRoles.test.ts` 实际2文件11项通过，其中表单/问题规则5项、角色规则6项；证据 `.verification/cloud-setup/question-web-consumers-tests.log`。7个直接 Web 文件的 ESLint 与 `git diff --check` 退出0，日志为 `question-web-consumers-lint.log`。

首次 `pnpm --dir web typecheck` 退出2，最小错误为 `swaObservation.test.ts:72` 的 TS2741：旧能力规则参数没有新增的 `questions` 返回字段。根因是生产 `readSwaAgents` 已明确投影 questions 或 null，旧规则输入仍沿原形状；当次没有其它类型诊断，原日志 `question-web-consumers-types.log` 保留。经 Root 授权补上 `questions:null`，保持旧未声明能力的语义后，同一 Web 类型检查退出0，日志 `.verification/cloud-setup/question-web-types-fixed.log`；没有因此启动完整构建。

原生问答局部 `tests/swa-cli-headless/question-ask.test.mjs` 的3项实际通过，证据 `.verification/cloud-setup/question-native-local.log`：没有真实 Worker 时在创建前拒绝且原 executor 查询仍 absent；真实 SQLite 答案不能单独证明工具读取或解除继续/交付约束；公共模式和输入规则保留原文并拒绝任意继续正文。这些结果只证明实际生产接口的拒绝、原数据库和纯规则边界，没有伪造 Worker、原生成功帧或模型工具调用。

后继六文件 Node 回归首次退出1，原日志 `question-native-regressions.log` 保留22项通过及两个文件导入失败。最小错误为 `Cannot find module './impl/format'`；新增契约复用真实 Pi schema 后，`agent-observations` 与 `collaboration-records` 的旧单独打包入口走到 jsonc-parser 的 UMD 动态 require。两入口按已有生产测试的同一 ESM 解析位置修正后，单独复跑这两个文件实际13项通过、退出0，日志 `question-native-regressions-fixed.log`；没有更换库、伪造依赖或重复未受影响的22项。另 `node --test --test-name-pattern='^closed owner' tests/swa-cli-headless/question-answer.test.mjs` 实际只选择并通过1项：原 SQLite/executor 拒绝回执经真实查询恢复原表单，日志 `question-native-answer-recovery.log`。该命令没有执行同文件的 Go 测试入口。

完整 `pnpm typecheck:swa` 首次退出2，原日志 `question-native-strict.log` 保存当前源码的可选路径解析器、receipt 缩窄、preamble mode 联合类型诊断，以及官方 Pi 声明使用的 `path.PlatformPath` 与 Node 25 类型不匹配。前三项在直接消费者修正。运行时实际固定为 Node24，因此经 Root 授权将 runtime 开发依赖和 lock importer 的 `@types/node` 精确改为已有锁定的24.19.2；首次离线安装因默认 pnpm 数据目录 ENOENT 退出254，第二次指定原 store 后因缺 registry metadata 退出1，证据 `question-types-offline-install*.log`。随后经授权保持 frozen-lockfile/ignore-scripts、原 store、runtime 过滤并使用项目 ignored metadata cache 的正常公开 registry 校验安装退出0，证据 `question-types-install-r3.log`；未修改正式安装或供应链规则。

第二次完整 strict 仅剩 `speech-model-download-transport.ts:167` 的 TS2345：Node24 的流 data 回调声明可接收 string 或 Buffer，原回调只声明 Buffer，但内部 `hash.update` 原本支持两者。经 Root 授权仅将参数扩为 `string | Buffer` 后，第三次同一完整 strict 退出0，证据 `question-native-strict-r3.log/.exit`（exec session36623，最终 chunk fe2c63）；保持原严格检查且没有修改 skipLibCheck。Go 新检查因当前容量窗口尚未执行，不将静态审查当成编译通过。

四份实际 N4 原任务规格的纯 preamble 回归退出0，`question-preamble-local.log` 与 `question-preamble-local/result.json` 记录 disabled 和未提供 SWA mode 的上游输出均与此前已审 builder 逐字节相同，questions-only 保留原任务正文；真实 Worker 准入回调仍为 NOT_RUN。`pnpm check:contracts` 退出0，新增分支的8条属性声明告警按既有同层写法消除后再检查仍退出0，原29条既有告警保留；264个实例校验与生成物一致性通过，证据 `question-native-contracts-r2.log`。这些检查均未启动完整候选构建。

整批独审指出三处源缺口后，按已审返修计划 `d94c40e03ded87a221c2fc6b020f634a39a6fdef72552e933bd8572301ba9034` 修正：Task结算只检查自身及原报告结算会关闭的同Task active Dispatch，原Run根交付仍检查全Run；已知待答沿原executor无效果取消后正常等待，不产生unknown escalation。原ask在首个工作区异步解析前，先同步复核实际producer、原JSONL工具身份及R/W关系并保存原scope checkpoint；后继工作区、JSONL和Go当前授权全部重核。历史观察复用从task-result提取的同步完整trace判据，原head minted fence与释放后的新fence、null owner、精确exit-observed ownerFence及实际custody_closed共同确认原来源，live ask/resume仍要求当前live fence。

返修局部首次5项中4项通过，失败是用例把根Task误当Worker子任务，原 `isTaskDescendant` 正确拒绝；改为原SQLite创建两个子Task后，第二次仍4项通过，余项在同Task第二次创建Dispatch处被原 `task_not_startable` 正确拒绝。未手改DB制造状态；保留该拒绝断言，以当前Task自身Q和另一子Task的pending/answered问题验证准确等待范围，第三次实际5项全部通过（`question-native-review-r2-local*.log/.exit`）。原合法创建、重试和停止合同不产生两个同Task同时active Dispatch；上游legacy siblings测试使用直接SQL准备历史状态，本批不采用该做法。同Task active sibling仍保留与原关闭集合相同的源保护，其正向运行明确NOT_RUN。

返修后的完整 `pnpm typecheck:swa` 单次退出0（`question-native-review-r2-strict.log/.exit`，session95982/chunk12bf15）；原Pi输入与最终块纯规则回归8项通过（`question-native-review-r2-pi-regressions.log/.exit`）。只读S392实际4个已释放Pi的非秘密lease/head字段、原start binding与完整provider trace，共用同步来源校验全部通过；四份原fence均为1、释放后为2，每份对错误ownerFence、缺失deathEvidence、错误binding fence和真实旧未关闭前缀的4项反例均拒绝，共16项，证据 `question-native-review-r2-history-result.json` 与对应log/exit。未读取账号或spawnToken值，也没有生成原生工具成功帧；此结果只验证真实历史来源及纯规则，释放前后同Q的read_observed与实际根交付仍未运行。

本批真实 Pi 模型首次提问、原 ask 等待返回、超时后显式继续、原工具读回唯一答案和后继成果仍为 NOT_RUN；GUI点击/HTTP恢复成功链、Windows x64问答链及本批同源安装也未运行。既有 disabled/ToolsOff N4/N6 使用各自准确结果，不以本批局部通过改判。来源证明、实际私有运输、进程退出和跨主体当前授权的成功路径仍须由真实会话证据验证；源码合同和静态审查不构成运行验收。
