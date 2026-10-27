# 角色启动、异构委派与项目开发工具

用户要求先验证 PR #10 的角色启动，再完成真实异构委派、项目内开发工具、CLI 发现与浏览器重连，最后处理 PR #6–#10 的依赖链。基线为 `ecec4d72efecb900a77e92ffccb8a4cc091754fe`，工作分支 `codex/heterogeneous-agent-20261027`。

## 修改范围与验收

- CLI 角色定义与启动：复用角色 DTO 和现有命令服务。角色默认 CLI/模型、显式覆盖、版本失效、跨项目、未许可 Agent、同请求重试及父任务交接，均需实际服务验证；参数与规则测试单独记录。
- Pi 自主委派：固定原生 `swa_delegate` 工具只提交角色/版本、正文、完成条件和 work/consult。服务从真实调用者推导项目、Run、父任务，核当前项目和 Grant。调用者不能选择别人的项目或父任务。稳定请求记录在子 Worker 创建后完成；子任务成果经现有交接恢复父任务，父任务忙时暂缓，未知请求只查询。默认关闭，consult 不得继续委派。
- 项目开发工具：只在用户明确批准的测试项目与操作范围内启用。采用对应 CLI 原生工具与可验证的系统隔离，验证实际读代码、修改、执行检查、交付差异以及越界拒绝；不以原生配置开关代替权限边界。
- 角色与能力界面：复用实际能力发现和项目许可；区分安装、配置、认证、工具支持和实际执行。保留失效选择及拒绝原因，不自动换模型。刷新后恢复同项目与 Run 并重新检查权限。
- 整合：依次修复 #6→#7→#8→#9→#10，普通 merge/push，不覆盖历史。完成验证后再决定 PR 合并和发布。本轮没有合并或发布授权。

实现按 CLI、委派与准入、项目工具隔离、界面分配互斥文件；独立 Reviewer 审查权限方案和最终行为。当前没有 Orca Run/Task/Dispatch 的审查上下文，不生成虚构标识或 hook 回执。

## 已执行

2026-10-27，北京时间；使用现有干净 checkout 拉取并切换准确 PR #10，执行前无本地改动。

- Node 24.16.0、pnpm 11.27.0、Go 1.27.2 版本核对通过；esbuild 0.28.2 可加载。
- 用户指定 frozen install 首次因 pnpm 默认 store 创建失败而退出 254；显式 `--store-dir .verification/cloud-setup/cache/pnpm-store` 后退出 0，锁文件未改。环境变量形式未改变实际 store，保留该失败。
- `go test ./internal/workspace/app ./cmd/swa`：两个包通过。
- `node --test tests/swa-cli-headless/collaboration-records.test.mjs`：5 通过，0 失败、0 跳过。
- `pnpm typecheck:swa`：退出 0。
- 当前实际进程 PID 与 `/proc/self` 一致，旧环境的外层 proc 问题未复现；完整服务退出仍需实际检查。
- 用户批准的新增四副本已由既有工具重新完整核对并删除，实际退出 0；可用空间 773013504→4203753472 字节。当前 I5c25、归档、数据、凭据、备份与失败证据保留。原件见 `.verification/cloud-setup/space-next-5c25-20261024-15/operation-01/`。
- 宿主最小 bubblewrap namespace 探针退出 0。嵌套执行环境中的 uid-map 只读失败与宿主探针缺少 `/lib64` 的失败分别保留；补充 ELF 解释器挂载后的局部检查通过。尚不能据此声称项目工具隔离已经验收。

首批实现检查：CLI Go 包通过；Go App 的新无工具许可用例因测试把规范化空数组误写为 nil 而失败，改正测试输入后整组 SQLite 委派准入用例通过。生产权限规则未放宽。runtime 类型检查的四处联合 tuple 参数类型错误修正后通过；Web 类型检查通过。角色记录 5/5、委派规则 3/3、问答与交接 8/8、界面规则/SSR 38/38；OpenAPI 检查与 264 例通过，保留 29 项既有警告。新委派规则测试最初因 jsonc-parser UMD 动态 require 打包失败，改用同一安装的 ESM 入口后通过。最终补充的父 stop/release 保留请求门，定向真实 SQLite 用例 1/1；独立审查接受首批源码。Go 依赖边界检查 239 包通过。

现有 Chromium 浏览器验收 4/4 通过，覆盖两种视口下未配置原生执行器的真实服务错误、项目权限撤销/过期版本及刷新后项目恢复。该结果不替代有真实 Worker 的角色选择和同 Run 重连，后者等待新安装模型流程。

项目 shell 局部真实检查最初 1 通过、2 失败：bubblewrap 的私有根视图可新建非项目文件，但宿主外部标记未变化；当前内核不提供 `/proc/PID/task/PID/children`，进程 PID 与 `/proc/self` 一致。根视图改为只读，进程枚举复用既有 ps 参数与解析器；补充硬链接、socket 与保护目录拒绝后，5 项实际检查全部通过，包含授权目录读改测、越界与网络拒绝、取消后已观察 namespace 子进程退出。此结果只验证固定执行器，尚未接通两种 CLI 的开发工具。

日志位于 `.verification/role-delegation-20261027/`。安装、真实模型和浏览器验收尚待运行。Linux 既有阶跃星辰独立来源可供受控产品消费者使用；禁止把秘密写入日志。用户已明确“Windows验证先空缺”，本轮先做 Linux，Windows 保留未运行。历史 N4 停止失败及 N6 未运行状态保持。

首批源码以 `6428a888` 提交；#10 在 `a7bff4c1` 普通合并更新后的 #9，文件树不变，已推送。#6–#10 仍为草稿，未合并 PR 或发布。云环境配置草稿已保存本轮测试项目工具授权与 Windows 暂缺说明，尚未发布应用。

第二批接入 `development_mode: disabled | project`、Pi bash 与 OpenCode shell，以及每次原生调用的当前项目授权。界面局部规则/SSR 40 项及 ESLint 通过，独立源审接受相应消费者；公共类型、服务和真实模型尚待统一验证。源审发现并要求修正：开发后原上下文变化会阻塞真实委派/问答；工具链配置会被服务环境过滤；只读工具链也必须避开所有保护目录。这些修正应保留普通启动/追加的上下文新鲜度及既有权限拒绝。

Pi 官方 CLI 离线 `--list-models stepfun` 实际退出 0，当前独立来源只列 `step-3.5-flash`，标准错误为空。该结果是已配置目录观察，不证明模型认证或执行成功。默认与显式覆盖不同模型的实际检查仍待安全配置及运行，不把同模型的 CLI 切换称为不同模型验收。

第二批统一检查：Go App、CLI、Orca 适配层三个包通过；Web 类型检查通过；角色、委派与问答共 18 项通过；264 个接口示例和生成一致性通过，239 包依赖边界检查通过；修改后的隔离执行器再次 5/5 通过。runtime 类型检查退出 2，唯一错误在 `pi-session-result.ts:225`：已使用 project parser 的记录数组仍声明为仅接受问答/委派的类型，导致 bash toolCall 不兼容；待修正后复验，未启动完整构建。

该类型修正后 runtime 类型检查退出 0；新增原拒绝请求观察分支后，Go App 再次通过，委派/问答规则 14/14、原生记录与账号策略回归 17/17 通过。已保存 outer 拒绝但没有 inner 的请求沿原 UUID 只读观察，角色更新不重新选择或启动子 Worker。随后官方源码复核又发现两处需在构建前处理的差异：Pi bash 返回实际字段为 structuredContent；已有会话的 provider 再核验不应重新以原首次启动快照检查合法文件修改。真实 SDK 和该续轮边界的局部验证尚待运行。

不同模型配置已由经审查的 helper 创建在新的独立来源目录，旧来源保留；复制凭据只经过只读 FD 与内核文件复制，没有读取、输出或散列其正文。官方 Pi CLI 再次退出 0，实际列出 `step-3.5-flash` 与 `step-3.5-flash-2603`。新目录配置的 32768/4096 为测试客户端限制，容量与费用未经验证；真实模型调用尚未运行。

最终局部验证：官方 Pi 1.0.1 SDK 直接调用固定隔离器的 exit 0/7 均通过（含父测试 3/3），实际结果证明 structuredContent 字段；初次探针因 jsonc-parser UMD 动态 require 在加载时失败，采用已验证的 ESM 入口后通过，没有模型调用。更新后的 Pi 记录回归 15/15，runtime 类型检查 R3 通过。Go 会话观察新增用例首次因内部 request.show 同时带 controller/project_id 违反现有二选一规则而失败；仅改内部构造与校验，项目绑定仍在 invocation/caller/scope，定向 SQLite 复验通过。CLI 和 Orca 适配层包保持通过。

Pi 停止路径原先把当前项目设置与旧启动记录全对象比较，会阻断撤工具许可后的已授权停止。现在仅允许设置变化，继续固定项目 ID/root、完整 Run scope、原 stop 父子回执和所属进程身份；11 项问答/委派/停止规则通过。独立 Reviewer 接受本批最终源码及实际服务 owner。完整构建、新安装、真实模型、实际同服务浏览器与 N>3 均尚未执行。

每次失败先报告最小复现、根因证据和局部结果，再启动下一次完整构建；完整构建使用已提交、干净且冻结的源码。

`6406c4b9cda0f91f2268c12989ca07725f06ed2a` 已提交推送；combined 完整构建、归档、外部解包和新安装均退出 0。安装内 Node 24.21.0、依赖闭包、原生 PTY、文件观察及提供方隔离通过；D12 12/12，通过同安装 HTTP、Web 静态资源和服务进程正常退出检查。原件在 `.verification/swa-linux/evidence/6406c4b9cda0f91f2268c12989ca07725f06ed2a-combined-role-dev-01/`。

真实角色验收 `/workspace/swa-role-acceptance-6406-01` 在首条只读 capabilities 的 OpenCode installed 断言失败；configured/enabled 均 available，installed 为 unknown。尚未调用 role.create、worker.start 或模型。两个 Controller 关闭、Grant 撤销与服务退出均成功。最小复现 `/workspace/swa-opencode-version-probe-6406-01/result.json` 使用官方 Linux CLI 和安装物版本专用环境：175 毫秒内正常 close/code 0，stdout 为 `opencode v2.0.31`，stderr 为 INFO cli starting。根因为版本环境继承了产品固定 `OPENCODE_PRINT_LOGS=1`，而版本探针要求 stderr 为空。

修复仅在版本专用环境删除该日志变量，Worker 日志及严格安装状态断言保留。固定官方源码确认仅值 `1` 开启 stderr 日志；安装物原 helper 加相同单键删除的局部真实复验 153 毫秒内 close/code 0，stdout 版本准确、stderr 空，原 Worker 环境仍为 `1`。该结果尚未经过新产品构建。独立源审、`pnpm typecheck:swa` 和 `git diff --check` 均通过；原件为上述目录的 `result-without-stderr-logging.json` 及 `.verification/role-delegation-20261027/opencode-version-typecheck.log`。

该修复以 `f52094d57c2fdda49abc6c72d06d20e3c57fcdae` 提交推送。用户随后批准新增四目录删除，操作前重新完整核对归档、实际引用及保留安装；固定操作退出 0，准确四根已删除，原件为 `.verification/cloud-setup/space-role-6406-20261027-16/operation-01/`。清理后实际可用 4152741888 字节，高于当前完整交付起点 4030836736 字节；I6406/I5c25、归档、任务、凭据与失败记录保留。

在空间准备期间独立执行 I6406 的纯 Pi N4，原件 `/workspace/swa-n4-acceptance-6406-01`，Run `run_7c6861b64114`。严格 driver 的九个源文件与安装提交逐字一致，观察器使用准确 Git archive；该结果只属于 `6406c4b9`。四个 Pi 均实际输出，目标停止回执为 stopped/closed_agent_terminal，原生 abort 成功且四个 custody 记录确认退出，其余三个 Worker 完成，其中主 Worker 完成追加输入后的第二轮。

最小失败链为：目标 `ctx_675412221627` 停止成功后，Worker 为 stopped/process_stopped，Dispatch failed/last_failure=stopped；其 Task 仍 blocked，资源 owned/not_requested，根 Task 仍 ready。真实 journal 末态为 interrupted、缺少 outcome，`nativeTurn` 因缺 outcome 返回 null，跳过任务结算与释放。其余三个 Task completed 且资源 released。该 N4 整项失败，不把进程输出或成功停止代替完整交付。

根因确认后，仅对经 executable、原请求、父进程及启动时刻核实的本次 CLI 观察者发送 SIGTERM，CLI 退出 130/run_wait_cancelled；原 driver 保存 FAIL 和原请求 `520b307b-d180-4c8c-b07b-2060f4c2aa18` 的未知状态，不重放或补记完成。Grant 已撤销。随后 serve EOF 返回 6/delivery_unknown：原 Worker 资源未释放、Controller 未关闭，私有 daemon retirement 为 busy，两个所属后代未自动退出。完整服务退出与自动清理均不通过，原失败记录保持。修复方案在 SWA 结算边界只识别准确原 stop 回执及真实退出，保留原生 outcome 缺失，将确认取消记为任务失败并沿已有 release；局部边界及新安装复验仍待执行。

只读源审确认原 driver 在未知请求或资源未释放时有意保留 Controller；该私有终端使 daemon 拒绝退休。宿主核对 executable、boot ID、PID 启动时刻、父子关系和本次数据目录后，分别向确证 Controller 与私有 daemon 发送 SIGTERM；前者已消失，后者进入已退出的 Z 状态。手工收尾记录为 `manual-process-cleanup.json`，不会把原自动清理失败改为通过。

停止结算小修仅识别原 interrupted/null outcome、准确完成的 stop 父子回执、停止状态及 released lease，并复用既有 collect 的完整原生退出校验；事务复核后将任务结算为 failed/cancellation，沿原 release 清理，同时支持用户已先完成 release 的顺序。原 journal 和模型文本保持。独立源审、12 项问答/委派/停止 SQLite 规则、runtime 类型检查及 diff 检查通过；日志为 `.verification/role-delegation-20261027/confirmed-stop-r1.log` 与 `confirmed-stop-typecheck-r1.log`。新安装真实 N4、strict 失败反馈、导出和服务退出仍待复验，N6 暂不启动。

另以最新规则 bundle 对原 N4 两个只读数据库核验候选，准确停止 Worker 返回 `confirmed_worker_stop`，原 scope、启动/停止父子回执、Dispatch/resource 与释放后的 lease/fence 相符。未实例化运行服务、迁移数据库或写入原 journal。该局部检查只确认真实失败输入可进入新候选，不代表 collect、事务、后续释放或完整 Run 已通过。

停止结算修复以 `31be1c06de231cd0828e60e3cb9e180c84f3cf76` 提交推送，完整 combined 构建、归档、解包、新安装、D12 12/12 及无模型 HTTP/Web/服务正常退出全部通过。证据为 `.verification/swa-linux/evidence/31be1c06de231cd0828e60e3cb9e180c84f3cf76-combined-role-dev-02/`。仅清理准确 Go 编译缓存后继续模型验收。

角色场景 `/workspace/swa-role-acceptance-31be-01` 的实际 capabilities 已确认 Pi 1.0.1 与 OpenCode 2.0.31 installed/configured 均 available，版本日志修复通过实际服务复验。默认角色 Pi 启动请求退出 0/native ready，随后验收脚本错误地为 `request show --controller` 追加 `--project`，CLI 以 validation_failed/2 拒绝；同错误影响 owner 收集启动记录，故整项失败。最小复现为同时传两个 scope，修复只让该查询保留 controller 并继续由环境提供项目和令牌；产品代码未改，无需完整重建。

两处脚本的语法与独立源审通过，实际 I31be 的八个无令牌参数用例均越过 XOR 验证并在认证前以 scope_denied/3 停止，未发送 HTTP 或模型请求；原双 scope 仍拒绝。探针首轮错误要求认证失败响应包含 project_id，移除该探针断言后通过，原件为 `.verification/role-delegation-20261027/request-scope-local-check.json`。旧角色场景两 Grant 已撤销，原 service 退出 6 保留。Pi 进程已不在，但原 trace 未保存完整 custody_closed，不能据此声称原生退出验收通过；确认身份后人工终止 primary Controller，私有 daemon 随后自行退出。原 Worker、任务和未知收尾记录保持，下一次使用新独立场景，不重放旧请求。

验收脚本修复以 `d0d7a822` 提交推送，产品代码未变，复用 I31be。第二次角色场景 `/workspace/swa-role-acceptance-31be-02` 已实际确认 Pi 1.0.1/OpenCode 2.0.31 installed/configured available；仅指定角色/版本时，Pi 按默认 `stepfun/step-3.5-flash-2603` 启动，同请求 `8a68001c-6c6b-4113-ae69-f50afd04bd63` 复用同 Worker。显式覆盖 OpenCode/`stepfun/step-3.5-flash` 时，旧 TUI 模型校验在创建原生 Worker 前拒绝，CLI 退出 6，原请求 `22bcc71b-fdc4-4382-acb6-0d6766f78588` pending；没有 OpenCode 会话或模型调用。其余角色拒绝路径、完整结果和导出尚未完成。

最小复现使用官方 OpenCode 2.0.31 的 `acp --help` 与现有模型准备规则：ACP 无 `--model` 参数，通过私有配置和原生会话设置选择模型；旧 TUI 探针仅识别旧版本，错误用于受控 ACP。原件为 `.verification/role-delegation-20261027/opencode-model-preflight/case-8l8uwf/`。修复增加结构化模型准入钩子，复用原请求、项目/Run、完整选择、当前 Go 许可及前后 reservation 检查，仅接受固定 OpenCode 2.0.31 原生合同；普通 TUI 探针及最终启动准入继续生效。6 项实际 startLocalWorker/SQLite 构造规则、`pnpm typecheck:swa`、diff 检查与独立审查通过；规则没有启动 Worker 或模型，不替代新安装验证。类型日志为 `.verification/role-delegation-20261027/acp-model-typecheck-r1.log`。

角色第二次失败的 Pi stop/release、完整 custody_closed 与 Grant 撤销均确认；primary Controller 因原 pending 请求未关闭，原 service 退出 6 保留。按准确进程身份人工终止 Controller 后 daemon 自动退出，独立记录为该输出目录的 `manual-process-cleanup.json`。不改变原验收失败或请求状态。

I31be 的 N4 复验 `/workspace/swa-n4-acceptance-31be-01`，Run `run_f52d63acb2e7`，四个 Pi 原生输出共同区间约 41.32 毫秒。活动中的 Worker2 停止后，Task 已正确结算为 failed/cancellation，native_outcome 保留 null，termination 来源为 confirmed_worker_stop，资源释放；原取消结算修复通过实际路径。另两个正常完成 Worker 的 journal 分别为 15034969/16108476 字节，超过原 12 MiB，结算被拒绝，Task 仍 blocked。CLI 自行退出 6/operation_unknown，driver 保存原请求 `6484c4b4-9ed6-47cd-83c8-1e8a4ff90cb9` unknown，未到导出或成果审阅。容量根因、完整原 journal 只读复现及局部修复见[本轮 journal 容量任务](swa-journal-capacity-20261027.md)。

该 N4 四个原生 Worker 均有完整 custody_closed、真实退出及 released lease；Grant 撤销确认。尚未结算的资源使原 service 返回 6，自动退出仍失败。宿主复核 boot、UID、executable、cwd、启动时刻、准确 argv 和子树后，仅向遗留 Controller 1000706 发送 SIGTERM，观察其消失，daemon 1000315 随后自行退出。独立人工记录为该输出目录 `manual-process-cleanup.json`；原 Run、任务、CLI 和服务失败保持。N6 尚未运行。

用户明确确认删除新四副本：31be candidate/package、I6406 和 I5c25。执行前重新逐文件核对全部归档成员、内容、当前进程引用与保留文件，准确四根删除成功，退出 0；可用空间 809992192→4293480448 字节，当前 I31be、全部归档、数据、凭据及失败原件保留。原件为 `.verification/cloud-setup/space-role-31be-20261027-17/operation-01/`；原授权仅覆盖这四根。

OpenCode 模型准入与独立 journal 容量修复以 `6b9acc891472cb2757788809088c50f0d6abce61` 提交推送。combined 完整构建、归档、解包、新安装均退出 0，原件为 `.verification/swa-linux/evidence/6b9acc891472cb2757788809088c50f0d6abce61-combined-role-dev-03/`。首次 D12 为 11/12：`real stdin stop before admission` 在关闭 stdin、等待 250ms、发送准入后，`tree.ready()` 实际成功，违反该测试的未启动预期。原完整检查、服务与模型阶段不记为通过。

源码显示 stdin EOF 和准入 IPC 为独立通道；250ms 不能证明子进程已处理 EOF，准入前也没有可等待的产品 EOF 回执。原失败未保存事件顺序，不能回填其根因时序。最小真实观察在同 I6b 使用只监听事件的 Node preload：明确观察 EOF 回调完成后再准入，实际得到 not-created/stopped-before-spawn；先等待真实 native 就绪及准确 ROOT 输出，再关闭 stdin，得到 created。两场景均有原完整退出证明、ACK、root exit/absent，forced=false。原件为 `.verification/role-delegation-20261027/d12-stdin-order/case-51b41A/`，实际退出 0；原失败目录当前前后均无匹配进程，不能据此补记历史退出证明。

正式修复只修改 D12 测试、专用事件观察器和既有同源检查 helper：以真实 EOF 事件替代固定等待，保留原退出判定及失败 finally 收尾。helper 仅新增两个明确测试路径的非产品排除，继续核 clean checkout、所有产品/身份观察器依赖及锁配置一致，并检查测试不属于安装输入。语法检查和独立源审通过。产品代码未变，提交测试后继后复用同 I6b 重新运行完整 D12；原 11/12 失败文件保持。
