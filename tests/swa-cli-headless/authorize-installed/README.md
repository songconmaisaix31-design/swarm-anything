# 安装物授权工具

这是外部验收工具。`prepare`和`verify`只做本地安装、源码、公开输入和服务身份原件核对；二者不会发HTTP、创建来源或取得human会话。`execute-authorized`会执行已委托的人工授权写入和验收驱动，执行范围须有明确用户授权。2026-10-23 用户开始测试N>3已覆盖同公开项目、StepFun、ToolsOff的N4/N6及原测试所需授权、收尾；新包只作技术来源/身份核查，不逐SHA重复索取同意。命令名或包内bool本身不产生授权，其他范围按原规则处理。

`stepfun-pi-questions`沿用户完整Run、StepFun、人类独立追加输入的既有授权，单独验证原生问答。它采用`questions-only`模式，只提供固定`swa_ask`，原生文件与命令工具继续关闭；原N3/N4/N6保持ToolsOff。源码、包和驱动接受不表示真实模型问答通过，实际执行由Root统筹。

在仓库根目录构建，把实际二进制和同版本的纯公开消费者一起放在新的独占工具目录中：

```sh
go build -mod=readonly -o "$TOOL_ROOT/authorize-installed" ./tests/swa-cli-headless/authorize-installed
cp tests/swa-cli-headless/authorize-installed/public-case-preflight.mjs "$TOOL_ROOT/public-case-preflight.mjs"
"$TOOL_ROOT/authorize-installed" -h
"$TOOL_ROOT/authorize-installed" -mode prepare -package "$PRIVATE_PACKAGE"
```

本工具只支持Linux x64、Go 1.27.2。工具目录使用本次新建的0700普通目录，包和证据为0600普通文件；临时目录放在仓库的ignored `.verification`中。consumer从真实二进制旁查找，并将实际SHA写入准备包；不能依赖原ignored开发目录中的副本。包中安装VERSION、源码commit、driver各依赖、consumer、二进制及装内Node/swa均需准确固定。`prepare`另写`.prepared.json`，不能覆盖已有包或证据。

`profile`仅支持以下固定范围：

| 包字段 | 默认Codex：不填profile | StepFun Pi：profile为stepfun-pi-n3 |
| --- | --- | --- |
| caller | swa-codex-n3-20261022 | swa-stepfun-pi-n3-20261023 |
| agent / model | codex / gpt-5.5 | pi / stepfun/step-3.5-flash |
| workers | 3 | 3 |
| 来源目录字段 | codex_api_key_home | pi_source_home |
| 项目名 | SWA Codex N3 public stats | SWA StepFun Pi N3 public stats |
| 空间名 | SWA Codex N3 public stats 20261022 | SWA StepFun Pi N3 public stats 20261023 |

Pi新增profile `stepfun-pi-n4`和`stepfun-pi-n6`，workers分别只能4、6；caller分别为`swa-stepfun-pi-n4-20261023`、`swa-stepfun-pi-n6-20261023`，项目/空间标题的N同步变为N4/N6。各自公开项目固定为`/workspace/swa-public-case-20261023-n4/public-project`、`/workspace/swa-public-case-20261023-n6/public-project`。Agent、model、来源字段和ToolsOff仍沿Pi表，不允许用其他N替换profile。N6在N4实际完整结算之后执行，不能同时抢用同一driver输入或owner。

OpenCode采用三个独立profile，固定`agent=opencode`、版本`2.0.31`、`provider=stepfun`、`model=stepfun/step-3.5-flash`、`account_source=opencode-native-stepfun-api-key`，唯一来源字段为`opencode_api_key_home`。原生ToolsOff为disabled，提问能力必须为unavailable；不接受其他非空Agent来源字段或问答专用字段。

| profile | workers | caller | 项目路径 |
| --- | --- | --- | --- |
| stepfun-opencode-single | 1 | swa-stepfun-opencode-single-20261023 | /workspace/swa-public-opencode-single-20261023/public-project |
| stepfun-opencode-n4 | 4 | swa-stepfun-opencode-n4-20261023 | /workspace/swa-public-case-20261023-n4/public-project |
| stepfun-opencode-n6 | 6 | swa-stepfun-opencode-n6-20261023 | /workspace/swa-public-case-20261023-n6/public-project |

OpenCode项目名分别为`SWA StepFun OpenCode SINGLE/N4/N6 public stats`，空间名在对应项目名后加` 20261023`。API固定为`openai-completions`，初始请求目标为`https://api.stepfun.com/v1/chat/completions`。helper只检查来源目录元数据；原生账号内容仅由受控产品consumer读取，不进入包、环境、输出或散列。固定目标和静态available不证明登录、真实推理或原生ToolsOff已通过。

单Worker公开准备使用`prepare-public-case.mjs --case opencode-single --root /workspace/swa-public-opencode-single-20261023`，不传`--workers`。它核固定revision恰有四原文件，独立`openCodeSingleCase(originals)`产生一个`worker-1.txt`、`max_workers=1`的规格及`followup.txt`，没有`initial_workers`或自动结算策略。正文仅含四原文和固定审阅要求；相同正文的R2/R3直接复用首输入，R4使用固定复核正文。consumer在发送前逐字复核全部输入。single经`controller open → task create → worker start`建立原会话，每次追加前核原Worker仍live/ready且尚未请求释放；完整成果、取消、未知和活动停止分开保存。该场景的并发、配额、其他Worker存活及Run自动交付均为NOT_RUN。

OpenCode实际顺序由Root安排为同S无模型初始化、single、N4、N6，并遵守既定Pi真实基线先行条件；每阶段独立审查。N4/N6继续使用原`publicCase`及对应固定输入，经`run`入口验证自动结算与释放，不复用single的手动结算结论。当前helper实际窗口限定Linux x64；Windows需单独实际验证。

问答profile固定`caller=swa-stepfun-pi-questions-20261023`、`agent=pi`、`model=stepfun/step-3.5-flash`、`workers=2`、Pi版本1.0.1和`pi_source_home`。项目路径为`/workspace/swa-public-question-case-20261023/public-project`，项目名`SWA StepFun Pi questions public stats`，空间名`SWA StepFun Pi questions public stats 20261023`，安装必须为combined。`workers=2`是阶段B最大并行数，三个固定阶段的初始Worker数分别为1、2、1；B的第二个Worker由驱动在lead真实提问后创建。公开准备使用`prepare-public-case.mjs --case native-questions --root /workspace/swa-public-question-case-20261023`，不传`--workers`。消费者核对四原文、`swa-question-input/case.json`、各阶段task/inputs、独立的`answer.txt`和source，保留答案首尾空白与换行，答案不进入启动输入。

旧Codex/Pi N3包仍只接受既有公开项目`/workspace/swa-public-case-20261022/public-project`。各N profile核同公开revision四原文及固定task/input/followup；N4/N6使用六种区别明确的公开审阅职责中的前四/全部六项，显式initial_workers=N，经默认等待run创建lead后补同Run N−1；槽位4为lead的真实孙任务。两批均主动停非lead槽位2；N4只在lead首轮idle且孙任务仍运行时追加lead，N6用子成果原mail/callback产生lead第二轮，不另加手工模型轮。四个实际项目Role和Conversation、完整递归wait/export与自动release沿原回执/原生来源核对；提示职责不代替持久Role，stored通知不当provider送达。未知profile、错caller/agent/model/N/项目或另一profile的非空来源字段在HTTP之前拒绝。来源必须为显式、独立、当前用户0700普通目录；工具只检查其路径元数据，不读取auth、key、models或settings正文，不创建或修复来源。缺少来源、真实启动记录或服务身份时包保持INCOMPLETE，不能执行。Pi的API为openai-completions，endpoint为https://api.stepfun.com/v1，ToolsOff合同为pi-cli-1.0.1，新账户kind为pi-native-api-key-per-session；这项固定目标不表示账号、推理、原生ToolsOff或N已通过。

原serve owner须在真实spawn时保存非秘密启动记录并提供原ready/proof与准确SHA/runtime。Codex记录严格为installation、source_revision、data_root、endpoint、serve_pid、codex_api_key_home六键；Pi记录最后一键为pi_source_home。工具不生成或补造记录。Linux Codex/Pi驱动均接收已核原ready的`--service-ready-record`和`--service-ready-sha256`；驱动绑定实际status/runtimeId、装内Node与原daemon→runtime→serve身份链，使用独立runtime托管者核Worker custody。daemon原身份与认证检查保留。Pi另接收已核记录的`--pi-launch-record`和`--pi-launch-sha256`，从中独立核对SOURCE。真实serve捕获来源的入口是PI_CODING_AGENT_DIR，由原owner负责；工具不启动serve或调整PATH。

OpenCode记录固定名为`opencode-launch-record.json`，严格六键为`installation、source_revision、data_root、endpoint、serve_pid、opencode_api_key_home`，拒绝Pi/Codex启动键。helper向同一driver传入`--opencode-launch-record`、`--opencode-launch-sha256`及原`--service-ready-record/--service-ready-sha256`。原owner通过显式`SWA_OPENCODE_API_KEY_HOME`提供来源，并绑定官方`@opencode/cli-linux-x64@2.0.31`的实际bin；helper不创建来源或启动官方CLI。

三个OpenCode profile的`prepare`复用原owner已创建的私有普通证据目录：`DataRoot`必须是同一runRoot下的`data`，`EvidenceRoot`必须是其同级`evidence`，三原件必须恰为该证据根中的`ready.json`、`live-proof.json`和`opencode-launch-record.json`。全部必要字段、原SHA和当前服务身份通过后，才独占新增helper记录；缺失或变化时拒绝，不创建另一目录，不复制或改写原件。`verify`和`execute-authorized`同样重新核对该布局与原服务身份。OpenCode不接受问答专用owner字段；原Codex/Pi非问答profile仍要求新建证据根。

Codex/Pi共同固定driver-failure.mjs、codex-event-view.mjs、prepare-source-observer.mjs、source-observer-entry.ts、extract-observer-source.py和pi-event-view.mjs六个执行依赖；Pi再增加pi-source-observer-entry.ts。pi-event-view的私有FD读取器也被Codex用于ready文件，Codex仍使用已有JSON解析，不引入Pi protocol运行依赖。全部依赖逐安装VERSION的Git blob和实际SHA核对。缺少依赖的历史安装不能作为执行候选。源码测试、编译与help只能证明离线范围。

OpenCode保留上述共同执行依赖，并固定`opencode-event-view.mjs`与`opencode-source-observer-entry.ts`；observer的公开profile为`stepfun-opencode`，single/N4/N6共用该只读入口。独立无模型初始化使用`opencode-initialize-only`准备分支及其独立entry，不作为模型driver的运行入口。所有实际ACP帧、用户消息关联、native SQLite成果和完整关闭均由各自真实消费者核验，不以Pi/Codex协议投影替代。

问答profile使用`run-question-installed.mjs`与`question-case-definition.mjs`，另将定义直接引用的`public-case-definition.mjs`及`pi-question-event-view.mjs`加入上述依赖，按安装VERSION固定。包必须提供`owner_handoff_file`、`owner_handoff_sha256`、`question_gui_file`、`question_gui_sha256`；其他profile拒绝这些字段的非空值。GUI文件路径固定为`SourceRepository/.verification/cloud-setup/question-gui-installed.mjs`，SHA由Root审定后明确填写，工具不自动采纳该SHA，也不把ignored脚本当安装Git blob。

问答包还必须明确`question_scenario=full`或`answer-conflict`。full执行A/B/C、完整审阅与回收，最后只测试撤销send后的原问题回答；它禁止`question_baseline_file`和`question_baseline_sha256`。answer-conflict必须显式提供这两个字段，引用主场景实际输出的`driver-report/question-baseline.json`；文件不超过1MiB、0600，父目录0700、路径普通且独立于本次输入/数据/来源/证据根。helper只核路径与准确SHA，不自动填基线SHA、不读原生正文或凭据；driver进一步核固定报告schema、同安装S、eligible及完整A/B/C事实。其他profile拒绝三个场景字段的非空值。

主owner完整正常收尾后，冲突场景使用新owner、data、runtime、project ID和新Run，仅执行A的真实完整成功链、审阅及幂等核验，再以不同答案请求作为唯一终端负例。本次B/C、600秒等待及撤send明确NOT_RUN并引用同S主基线；不能把引用写成本次执行。终端未知保持原R，不再追加问题输入或更换场景，仅查询原请求、有限只读及已明确授权的关闭。

问答包的EvidenceRoot必须等于真实owner交接中的evidence_root，交接文件为该根原有的`service-handoff.json`。工具核其准确SHA、runtime、安装、源码、data、endpoint、来源、serve PID、protected_roots与有效`hold_until`，并逐项对应原`ready.json`、`pi-launch-record.json`、`live-proof.json`路径及SHA，再沿原procfs身份链验证当前进程。问答`prepare`仅复用这个已经核实且权限0700的owner目录；缺少交接或来源时返回INCOMPLETE，不创建或接管其他已有目录。helper只独占新增自身证据文件，driver输出位于该根`driver-report`；全部原件保留，不能复制或改写为另一条身份链。旧profile的prepare仍要求新建证据根。

问答驱动额外接收`--owner-handoff`、`--gui-driver`、`--gui-sha256`、`--question-scenario`；仅冲突场景接收`--question-baseline-file`、`--question-baseline-sha256`，启动前重新核基线原件。沿既有受保护子进程环境取得SWA_PROJECT_TOKEN。helper的驱动截止取token到期与owner截止中较早者，并保留30秒收尾；驱动另遵循45分钟业务截止，原owner的55分钟持有窗口不延长。GUI和业务阶段须按同一活动Run核对；等待超时、未知送达和未实际发生的分支保持原状态，不能补造工具事件或把固定输入核对当模型验收。

委托效果包括本次human会话、实际项目/空间登记、observe及execute两阶段settings CAS/Grant/token、原驱动业务请求和明确清理。cookie/CSRF/token只保存在内存，token只通过子进程环境传递；key不进入本工具。human写结果未知时停写且不重放，不能用CLI请求账本宣称human写已结算。业务未知只查原R。撤销与human未知后的撤销分别由包中明确委托控制；服务由原serve owner正常EOF并取得全树关闭证据。过期055b及其旧owned服务不得复用为新执行包。

driver的外部审阅快照和私有证据保存在EvidenceRoot。公开项目下另有固定公开正文副本及私有result/checked-result导出；只有批准的四原文正文可进入模型，私有结果不作为后继输入或上传。来源默认设置与每Worker三项设置分开。原生metadata中的cost=0仅为客户端默认值，不表示远端账单为零。

退出码：0表示相应工具步骤结束，真实业务仍需独立审阅；2表示参数或本地前置拒绝；3表示缺少必要前置；执行期间真实失败保留原UNKNOWN和安全错误分类。当前实际HTTP、人工授权、原生启动、模型及N验收结果以各自独立报告为准。

空间回执的 `id` 是不透明字符串，不能套用项目 ID 的 UUID 校验。拆分前的空间服务与当前 Workspace 服务都由 `crypto/rand.Text` 产生空间 ID；工具核对 schema、非空且无首尾空白的 ID、版本 1、原提交标题、非 null 的空资料引用和有效创建时间。项目 ID 仍须是 UUID，且继续核对实际目录、原空间和默认关闭的权限。

2026-10-23 首个 S50 N4 包在空间 POST 201 后被工具的旧 UUID 校验误拒为 `actual_space_receipt_missing`；原请求、原 UNKNOWN 和正常关闭的服务证据保留，修复不重放该请求，也不改产品安装。`TestActualSpaceReceiptAndProjectRegistration` 使用新的临时 SQLite 与真实 SWA HTTP listener、human 会话和 CSRF，只创建一次新空间、只读核对原 HTTP/SQLite 回执并登记实际公开测试目录；不执行 Grant、原生运行时或模型。错误字段和 UUID 兼容仅作为真实回执的纯解析变体验证。该局部测试不代替重新固定来源与服务身份的新验收包或真实 N4/N6。
