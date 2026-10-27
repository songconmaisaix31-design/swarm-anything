# SWA 无界面 CLI

OpenCode 的受控接入固定为 CLI2.0.31，支持的官方 StepFun 选择是 `--agent opencode --model stepfun/step-3.5-flash --question-mode disabled`。启动服务前设置独立来源目录的非秘密路径 `SWA_OPENCODE_API_KEY_HOME`；服务不回退原 HOME 或 Orca 账号。Linux来源目录须0700、文件0600，Windows须当前用户私有ACL，且不得与项目、安装、运行数据或其他 Agent 账号互相包含。该目录须已经由受控来源初始化完成，包含同一真实原生 credential 的配置、SQLite及legacy投影；不要把密钥放进命令行或环境变量。

发现中的已安装、已配置、支持控制、认证和真实模型成功是不同状态。OpenCode问答能力仍不可用；遇到输入未知，只查询原请求和同一 Run，不换 ID 重发。实际可用范围以同一正式安装候选的真实验收记录为准；源码支持和来源准备不代表模型验收已经通过。

发行目标包括Windows x64和Linux x64 glibc。Windows入口为`swa.exe`、`server.exe`、`node/node.exe`；Linux入口为`swa`、`server`、`node/node`。两种形态包含固定Node24.21.0、私有Orca运行文件、安装入口与许可。`VERSION`和CLI的`--version`给出同一准确源码提交。当前首版尚未通过同一安装候选的完整真实验收，实际验证范围以随交付的记录为准。

`--help`、子命令的`--help`/`-h`及`--version`输出本地文本，无需项目授权或运行服务。普通业务命令的`--json`在stdout只发布一个JSON结果，诊断在stderr；帮助和版本属于文本元数据，不使用业务结果协议。

## 提交、跟踪与导出完整任务

已有当前项目授权后，`run` 使用一份固定任务文件和明确的主 Agent 输入提交工作，默认等待同一 Run 的主任务及全部递归子任务。`--request-id` 是调用者在首次发送前保存的稳定 UUID；断线后保留该 UUID 与返回的 Run、根 Task、controller，使用 `wait` 观察。任务文件继续使用下文的 `goal/source_repo/source_revision/success_criteria/max_workers/context` 规范，Agent 与模型必须处于当前批准范围。

```sh
swa run --project "$project_id" --workdir "$project_root" --spec-file task.json --input-file brief.md --agent pi --model stepfun/step-3.5-flash --request-id "$request_id" --strict --timeout 30m --export "$output_directory" --json
swa wait --project "$project_id" --controller "$controller" --task "$root_task_id" --run "$run_id" --strict --timeout 30m --json
swa export --project "$project_id" --controller "$controller" --task "$root_task_id" --run "$run_id" --output-dir "$output_directory" --json
```

示例变量均需使用实际值；`--export` 和 `--output-dir` 要求尚不存在的绝对目录及已存在、获准的父目录。目标路径经过符号链接或重解析点时拒绝。`run --export` 在提交之前核对本地目标，最终导出时再次独占创建，已有目录不会覆盖。

复用当前项目角色时，为 `run` 同时提供 `--role "$role_id" --role-revision "$role_revision"`，可用 `--conversation "$conversation_id"` 关联已有讨论。省略 `--agent` 和 `--model` 时使用角色的默认值；也可以同时指定两者覆盖默认值。服务核查角色版本、归档状态、项目身份以及所选 Agent 的项目授权。任务文件中也可以指定角色及版本。

也可以为 `worker start` 指定角色和已有父任务，使用已有 Run 的实际标识和获准输入：

```sh
swa worker start --project "$project_id" --controller "$controller" --task "$root_task_id" \
  --name reviewer --agent "$agent" --model "$model" --input-file "$input_file" \
  --role "$role_id" --role-revision "$role_revision" --parent-task "$parent_task_id" \
  --handoff-mode consult --reply-mode resume \
  --completion-criterion '审查指定变更' --completion-criterion '报告发现的问题' \
  --request-id "$request_id" --json
```

角色与版本须一起提供；省略 Agent 和模型时使用角色默认值，也可同时指定两者覆盖。父任务须属于同一 Run，指定 `--parent-task` 时至少提供一个 `--completion-criterion`，选项可重复。`--handoff-mode` 可选 `work` 或 `consult`，`--reply-mode` 可选 `poll` 或 `resume`；`resume` 需要符合服务要求的活跃父 Worker。命令由调用方发起；它本身不会让 Worker 自主委派。

新 Run 和 `worker start` 可用 `--question-mode disabled|native` 选择问题模式。省略时继承所选角色的准确默认值，没有角色或旧角色没有该字段时为 disabled；显式 disabled 保持模型工具全部关闭。native 仅支持固定 Pi 1.0.1 的 per-session 账号模式，通过随安装固定的 `swa_ask` 扩展提问与读取原答案，原生文件和命令工具仍关闭。其它 Agent 或不相容账号合同返回能力不可用；不能在已有 Worker 中切换模式。GUI 只在当前 Agent 已声明该能力时开放选项，声明支持不表示真实提问已经验收。

CLI 与 GUI 读取同一后端 Run 视图。stderr 的进度包含当前状态、阻塞原因、问题及失败数量；stdout 只发布一个最终 JSON。`--strict` 在完整递归任务集合的任一子任务失败时返回 7，实际创建 Task 的咨询同样计入；单向通知不创建 Task。普通成功仍保留子任务失败事实，不能将主 Agent 的结束当作全部任务完成。

Run 的 `completed` 表示执行已结束；成果的 `acceptance: unreviewed` 单独保留，等待成功和导出均不表示人工已经验收。`handoffs` 保留真实交接消息、来源合同和实际读取状态，观察不会确认消息已读；恢复请求进入队列也不能视为父 Agent 已继续处理。

需要用户回答或继续原问题时默认返回 9，可用 `--on-input wait` 持续观察。等待上限默认 `30m`，支持 Go 时长格式如 `90s`、`5m`、`2h`；超时返回 8，Ctrl-C 返回 130，均只结束当前 CLI 等待，原任务继续运行。重连命令会包含准确 Run 身份。暂时读连接中断时只重读同一个 Run；提交结果未知时返回 6 并保留原请求，不能换 UUID 重发工作。权限不足返回 3，能力不可用返回 4，资源拒绝返回 5，任务或导出失败返回 7，参数错误返回 2。

需要 Worker 能在任务中提问时，在首次提交明确选择 native，使用当前实际批准的 Agent、模型和新请求 ID：

```sh
swa run --project "$project_id" --workdir "$project_root" --spec-file task.json --input-file brief.md --agent pi --model stepfun/step-3.5-flash --question-mode native --request-id "$question_run_request_id" --strict --json
```

实际 `swa_ask` 调用创建同一 Run 的原生问题；模型输出普通问句或字面工具调用不算提问成功。禁用工具模式要求 Worker 直接给出最终助手成果，运行系统收集；问答模式只额外允许 `swa_ask`，两种模式均保留任务的原验收条件。

Run 中存在原生待答问题时，退出9会给出该问题的准确选择器。将回答保存为当前项目获准读取的 UTF-8 文件，首次发送前保存一个新的规范 UUID，再执行：

```sh
swa question answer --project "$project_id" --controller "$controller" --run "$run_id" --task "$root_task_id" --dispatch "$dispatch_id" --question "$question_id" --input-file "$answer_file" --request-id "$answer_request_id" --json
swa wait --project "$project_id" --controller "$controller" --task "$root_task_id" --run "$run_id" --strict --json
```

回答保留完整原文，必须非空白且不超过32000 UTF-8字节。GUI在同 Run 的具体问题上提供回答表单，HTTP使用同一 `question.answer` 动作，接收 `input_file` 或内联 `text` 二选一。服务重新核当前项目 send、原上下文、原 Agent 选择和外发批准；合法人类可按独立当前权限回答 Agent 创建的任务，原创建者关联仍保留。

退出0只证明原答案已保存或同内容已确认，不证明模型已读；已答问题与唯一答案进入同 Run 历史和导出。同一 request ID 改内容会拒绝，已答问题不能替换为不同答案。结果未知时仅查询该回答的原请求，不换 ID 重发；GUI只有取得准确父子回执中明确的无效果拒绝，才恢复编辑并允许用户显式修正后提交新请求。原 Worker 已释放时可以确认已有同内容答案，但实际 Controller consumer 和当前项目授权仍须有效。

原工具仍在等待时，保存答案后由原 ask 将答案交回同一 Pi 工具调用，模型可以继续当前轮次。原等待已超时或取消时，答案仍保存；只有实际记录确认当前原 Worker 已空闲且可以继续，CLI 才给出 `question resume`，GUI 才显示“继续此问题”。该入口无需先建立讨论会话。

```sh
swa question resume --project "$project_id" --controller "$controller" --run "$run_id" --task "$root_task_id" --dispatch "$dispatch_id" --question "$question_id" --request-id "$resume_request_id" --json
swa request show --project "$project_id" --controller "$controller" --request-id "$resume_request_id" --json
swa wait --project "$project_id" --controller "$controller" --task "$root_task_id" --run "$run_id" --strict --json
```

`resume_request_id` 是用户明确继续时首次保存的新 UUID；请求未知后只执行原 `request show`，不要重新发送或换 ID。继续命令不接受正文或文件，服务重新核当前独立 send 权限，向原 Worker 投递固定的“读取此原问题并继续”指令。退出0只确认该输入已接受；随后必须观察到真实 `swa_ask resume` 读回唯一答案和后继成果，才能确认问题已解决。原等待尚活跃、模型仍运行、输入未知或会话改变时不能继续，应按返回指引查询原请求或等待同一 Run。

已答记录区分 `answer_saved`、`read_unconfirmed`、`read_observed`、`continuation_required` 和 `interrupted`；仅 `continuation_required` 提供明确继续入口。等待仍返回9并保留原 Run 身份；未知读取不能被当作交付完成。用户明确停止 Worker 后，原停止与退出证据确认才允许回收，已存答案仍进入历史。当前问答实现的局部类型、表单和记录检查不替代安装后的真实提问、回答、超时继续及成果验收；真实模型、GUI点击和 Windows 问答链的已验范围以交付记录为准。既定 ToolsOff N4/N6 测试继续使用原模式。

普通导出包含 `run.json` 的任务视图、`result.json` 的已记录任务结果快照，以及 `results/` 内已有结果文本；`results/index.json` 关联 Task ID 与文本文件。任务仍在执行或状态未知时可以导出已有结果，缺失结果逐项标记 `missing`，保留原 Run 状态和 `acceptance: unreviewed`。这不会从会话日志补取尚未写入任务记录的内容，也不表示任务已经完成或验收通过。

需要完整原生会话、日志和进程证据时使用 `swa export ... --audit`，沿用完整结算与来源核验要求。`run/wait --export` 使用普通结果快照。两种模式都验证当前项目授权、原会话归属与账号来源，并过滤全部相关 Worker 的凭据；启动中尚无可核实绑定的 Worker 或凭据来源失效会拒绝导出。普通导出不读取原生日志，日志缺失或继续增长不阻断已有结果的交付。

普通导出支持当前每会话独立账号的 Pi、Codex、Claude 和 OpenCode 接入；历史 `pi-native-api-key` 共享账号形式仍使用原审计路径。

CLI 不跟随回复中的任意链接读取文件，不复制账号配置或私有目录。导出写入失败时不会报告成功；部分写入的独占目录保留供检查，下一次导出选择另一个新目录。

## Windows安装

使用PowerShell7.2以上，明确选择实际发行ZIP、尚不存在的解压目录与安装目录，以及本机Orca及账户保护目录。安装目标父目录必须存在。下列变量由使用者设置为实际绝对路径，端口由使用者明确选择；在同一个PowerShell7会话中依次运行以下命令。

```powershell
if (Test-Path -LiteralPath $packageRoot) { throw '解压目标必须不存在' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::ExtractToDirectory($packageArchive, $packageRoot, $false)
& (Join-Path $packageRoot 'install-swa.ps1') -PackageRoot $packageRoot -InstallRoot $installRoot -ProtectedRoots $protectedRoots
$swa = Join-Path $installRoot 'swa.exe'
& $swa --version
& $swa --help
```

`$packageArchive`是实际发行ZIP的绝对文件路径，`$packageRoot`是本次普通解压所得的候选目录。`$protectedRoots`是字符串数组，包含本机Orca安装目录、用户数据/profile目录及实际账户配置目录。安装目录与候选目录均须和保护目录互不包含；途经reparse point的路径会被拒绝。安装仅创建明确目标并设置当前用户私有ACL，已有目标不会覆盖，不修改PATH或注册后台服务。

## Linux安装与启动

Linux候选要求x64 glibc系统，以及内核可查询的`/proc`、pidfd和当前进程的subreaper能力。安装使用已核发行包中的固定Node，不需要安装PowerShell或GUI。下列变量由使用者设置为实际绝对路径；`protected_root`须是已存在的原Orca或账户配置保护目录，多项保护目录在安装命令中重复传入`--protected-root`。

```sh
"$package_root/node/node" "$package_root/install-swa.mjs" --package "$package_root" --destination "$install_root" --protected-root "$protected_root"
"$install_root/swa" --version
"$install_root/swa" --help
"$install_root/swa" serve --data-dir "$data_root" --port "$port" --protected-roots "$protected_root" --json
```

安装目录必须不存在，其父目录必须已存在；安装后目录仅当前用户可访问，不修改系统PATH。数据根与安装及账户保护目录互不包含，属于当前用户且权限不得向组或其他用户开放。Linux启动的多项保护目录用冒号分隔。组合候选显式增加`--web-dir "$install_root/web"`，由同一HTTP服务提供工作台。项目、Grant、token和命令协议与下述HTTP授权及CLI步骤相同，平台路径使用实际Linux路径。

Linux服务在本次`serve`进程启用内核subreaper，按照真实boot ID、进程启动ticks、UID和pidfd核对后代，包括脱离会话后重新挂载的进程。正常关闭所属stdin或发送Ctrl-C后，先等待所属Node/HTTP退出，再回收已收养且身份确定的后代，并通过独立的完整进程观察确认退出。只观察到父进程退出不能代表整树释放。强制杀死`serve`或无法查询进程表时不能保证整树回收，仍须保留未知状态并核对原资源。旧Linux服务或daemon仍存活时不自动接管，也不删除其证据。

## 启动私有服务

`$dataRoot`为产品独占绝对目录，须与安装目录、原Orca及所有保护目录互不包含。默认发现本机原生命令和配置。需要采用既有Orca的Agent设置时，显式提供`--agent-profile $agentProfile`，其中`$agentProfile`是已经存在的原profile绝对目录；该来源只读，缺失或损坏时明确失败。

```powershell
& $swa serve --data-dir $dataRoot --port $port --protected-roots ($protectedRoots -join ';') --json
```

CLI形态不需要网页或浏览器。组合形态的`EDITION`必须为`combined`，网页资产位于本次安装的`web`目录；显式增加`--web-dir`即可由同一HTTP服务提供现有工作台和API，不启动另一个原生后台：

```powershell
& $swa serve --data-dir $dataRoot --port $port --protected-roots ($protectedRoots -join ';') --web-dir (Join-Path $installRoot 'web') --json
```

网页目录必须属于同一次安装，包含真实`index.html`和Vite资产清单；目录或资产经过重解析点、符号链接、文件缺失或edition不符时启动拒绝。省略`--web-dir`只提供API，继承环境中的`ASTROCYTE_WEB_DIR`不自动启用网页。附着于该服务的浏览器页面关闭后，CLI服务继续由原所属stdin管理。

`SWA_CODEX_API_KEY_HOME`和`SWA_CLAUDE_API_KEY_HOME`只在启动进程中分别选择显式、独立的Codex和Claude API-key来源目录。省略或设为空时保持未配置，不回退到普通`CODEX_HOME`、`CLAUDE_CONFIG_DIR`、发现目录、默认账户目录或原OAuth登录。非空值必须为实际普通目录的绝对路径，路径不得经过符号链接或重解析点，并须彼此及与安装、产品数据、原profile/账户保护根、普通或默认Codex/Claude目录互不包含。Go入口只核目录路径元数据，不读取`auth.json`、`settings.json`或`.credentials`；Node仍须在使用前核来源根的owner-only权限、原生配置和账号来源身份、项目及私有Worker目录边界。路径传递成功不表示凭据有效、原生Agent可启动、ToolsOff或模型调用已通过，也不发行human会话或项目Grant。Claude后继只接受显式来源`settings.json`中的literal `env.ANTHROPIC_API_KEY`，不使用OAuth、AUTH_TOKEN或helper。不要把key值放入这两个目录变量、命令参数或日志。

该命令在前台持有所属stdin，输出实际Node/HTTP readiness后持续运行。关闭该stdin或Ctrl+C请求关闭本次所属服务；不要把stdin预先重定向为空。服务监听显式`127.0.0.1`端口，冲突返回退出码5。依赖或所属证据不足会明确拒绝；不会另选端口或启动本机Orca。进程、SQLite、profile、IPC、会话、缓存和临时目录均归本次私有根。

## 项目授权与调用身份

命令端需要该私有HTTP服务中已经登记的真实项目ID和当前human批准的项目Agent token。原Orca的token、终端`--from`、进程PID及本机开发Agent身份均不能代替项目批准。新数据根没有预置Grant，服务启动不会发行token。

以下步骤由用户本人在另一个普通PowerShell窗口逐段执行，服务窗口保持运行。只使用本次安装服务的实际端口；请求没有`Authorization`头。`GET /api/v1/auth/session`在没有网页资产时仍可用，真实cookie只保存在本窗口的`$swaHumanSession`中，CSRF来自实际响应。Agent不得代执行这些步骤或自动取得human会话。

```powershell
$ErrorActionPreference = 'Stop'
$port = [int](Read-Host '本次 swa serve 的实际端口')
$base = "http://127.0.0.1:$port/api/v1"
$human = Invoke-RestMethod -Method Get -Uri "$base/auth/session" -SessionVariable swaHumanSession -MaximumRedirection 0 -TimeoutSec 30
if ($human.actor_kind -ne 'human' -or $human.actor_id -ne 'local-human' -or -not $human.csrf_token) { throw '没有取得本次服务的真实人工会话' }
$humanHeaders = @{ 'X-CSRF-Token' = $human.csrf_token }
$installRoot = (Resolve-Path -LiteralPath (Read-Host '本次实际安装目录')).Path
$swa = Join-Path $installRoot 'swa.exe'
$projectRoot = (Resolve-Path -LiteralPath (Read-Host '已存在的公开项目绝对目录')).Path
$projectName = Read-Host '项目名称'
$spaceName = Read-Host '新项目空间名称'
$callerAgentId = Read-Host '被授权调用端标识，长度不超过100，不含空格、点或斜线'
```

新私有根先创建真实项目空间，再使用其返回ID登记真实目录。每段的request变量在发送前保存；网络失败时保留原请求和响应，先查询现有空间/项目，避免重复创建。

```powershell
$spaceRequest = [Guid]::NewGuid().ToString()
$spaceBody = @{ schema_version=1; request_id=$spaceRequest; expected_version=1; title=$spaceName } | ConvertTo-Json
$humanHeaders['Idempotency-Key'] = $spaceRequest
$spaceResult = Invoke-RestMethod -Method Post -Uri "$base/project-spaces" -WebSession $swaHumanSession -Headers $humanHeaders -ContentType 'application/json' -Body $spaceBody -MaximumRedirection 0 -TimeoutSec 30
$spaceId = $spaceResult.space.id
if (-not $spaceId) { throw '实际项目空间ID缺失' }
```

```powershell
$projectRequest = [Guid]::NewGuid().ToString()
$projectBody = @{ schema_version=1; request_id=$projectRequest; expected_version=1; name=$projectName; root=$projectRoot; space_id=$spaceId } | ConvertTo-Json
$humanHeaders['Idempotency-Key'] = $projectRequest
$projectResult = Invoke-RestMethod -Method Post -Uri "$base/local-projects" -WebSession $swaHumanSession -Headers $humanHeaders -ContentType 'application/json' -Body $projectBody -MaximumRedirection 0 -TimeoutSec 30
$project = $projectResult.project
$projectId = $project.id
if (-not $projectId -or $project.settings.revision -lt 1) { throw '实际项目ID或设置版本缺失' }
```

先只批准观察，以便查看本机真实注册及能力。以下完整settings来自刚才的真实项目，保持目录、工具、Agent控制和外发未开放；`expected_revision`来自实际响应。普通命令包的`expected_version=1`与项目设置的CAS revision分别传入。

```powershell
$settings = $project.settings
$settings.allowed_actions = @('observe')
$settingsRequest = [Guid]::NewGuid().ToString()
$settingsBody = @{ schema_version=1; request_id=$settingsRequest; expected_version=1; expected_revision=$project.settings.revision; settings=$settings } | ConvertTo-Json -Depth 12
$humanHeaders['Idempotency-Key'] = $settingsRequest
$settingsResult = Invoke-RestMethod -Method Put -Uri "$base/local-projects/$projectId/settings" -WebSession $swaHumanSession -Headers $humanHeaders -ContentType 'application/json' -Body $settingsBody -MaximumRedirection 0 -TimeoutSec 30
$project = $settingsResult.project
if ($project.settings.revision -le 1) { throw '实际设置更新未确认' }
```

```powershell
$grantRequest = [Guid]::NewGuid().ToString()
$grantBody = @{ schema_version=1; request_id=$grantRequest; expected_version=1; agent_id=$callerAgentId; actions=@('observe') } | ConvertTo-Json
$humanHeaders['Idempotency-Key'] = $grantRequest
$grantResult = Invoke-RestMethod -Method Post -Uri "$base/local-projects/$projectId/grants" -WebSession $swaHumanSession -Headers $humanHeaders -ContentType 'application/json' -Body $grantBody -MaximumRedirection 0 -TimeoutSec 30
if ($grantResult.grant.project_id -ne $projectId -or $grantResult.grant.agent_id -ne $callerAgentId) { throw '实际Grant归属不符' }
```

```powershell
$tokenRequest = [Guid]::NewGuid().ToString()
$tokenBody = @{ schema_version=1; request_id=$tokenRequest; expected_version=1; agent_id=$callerAgentId } | ConvertTo-Json
$humanHeaders['Idempotency-Key'] = $tokenRequest
$tokenResult = Invoke-RestMethod -Method Post -Uri "$base/local-projects/$projectId/agent-token" -WebSession $swaHumanSession -Headers $humanHeaders -ContentType 'application/json' -Body $tokenBody -MaximumRedirection 0 -TimeoutSec 30
if ($tokenResult.credential.project_id -ne $projectId -or $tokenResult.credential.agent_id -ne $callerAgentId -or -not $tokenResult.credential.token) { throw '实际项目凭据归属不符' }
$projectToken = $tokenResult.credential.token
$tokenExpiresAt = $tokenResult.credential.expires_at
```

token有效期由实际`expires_at`给出，当前签发时长为一小时；重新签发会替换旧token。不要输出cookie、CSRF或token，也不要把它们写入项目文件或日志。关闭服务会使原human会话失效。会话过期时由用户重新取得会话，项目设置版本冲突时用人工会话`GET /api/v1/local-projects`读取真实项目后重新审阅，不能改写旧revision冒充成功。

```powershell
$env:SWA_ENDPOINT = "http://127.0.0.1:$port"
$env:SWA_PROJECT_ID = $projectId
$env:SWA_PROJECT_TOKEN = $projectToken
& $swa status --json
& $swa capabilities --json
```

批准范围须覆盖当前固定公开项目、允许读取的文件/子目录，以及`read_context/observe/start/send/stop`中实际需要的动作。`allow_agent_control`、`allow_directory`、`allowed_subdirs`、`allowed_actions`和`allowed_tools`由当前批准确定。`external_model_cli`指定默认客户端；可选`external_model_clis`明确列出本项目获准使用的多个CLI，例如`["pi","codex","claude","opencode"]`，必须包含默认且每项已注册。旧设置省略列表或列表为空时，只允许原默认客户端；撤销全部模型处理许可时同时清空默认与列表。

同一Run的Worker可分别选择许可集合中的CLI及其已配置模型；模型能力、账号和工具范围仍逐次核查。`capabilities`分别显示注册、启用、安装、配置和各项控制能力及来源。更改设置会改变revision，已有Run不会自动继承新的权限；按当前批准重新取得上下文和新Run。缺少人工批准时保留退出码3及required_action。

前述token仅允许`status/capabilities`。只有已选Agent的工具和账号隔离满足当前任务并完成真实验证后，用户才可批准执行。先从实际capabilities选择`$agent/$model`，逐项审阅以下权限正文；`$allowedSubdirs`必须是该公开项目内已审阅的相对目录列表。当前设置接口对非空`allowed_tools`返回501，不能把这一拒绝解释为原生Agent已经关闭工具。单CLI批准通过同一私有Native实际注册端口校验；注册批准不代表账号、工具或实际可启动已通过，缺少实际绑定的执行模式明确拒绝。

```powershell
$agent = Read-Host '已验证并拟批准的实际CLI标识'
$model = Read-Host '拟使用的真实模型标识'
$allowedSubdirs = (Read-Host '已审阅的相对目录，逗号分隔；项目根使用 .').Split(',').ForEach({ $_.Trim() })
$executionActions = @('read_context','observe','start','send','stop')
$settings = $project.settings
$settings.allow_directory = $true
$settings.allowed_subdirs = $allowedSubdirs
$settings.allowed_actions = $executionActions
$settings.allowed_tools = @()
$settings.external_model_cli = $agent
$settings.allow_agent_control = $true
```

```powershell
$executeSettingsRequest = [Guid]::NewGuid().ToString()
$executeSettingsBody = @{ schema_version=1; request_id=$executeSettingsRequest; expected_version=1; expected_revision=$project.settings.revision; settings=$settings } | ConvertTo-Json -Depth 12
$humanHeaders['Idempotency-Key'] = $executeSettingsRequest
$executeSettingsResult = Invoke-RestMethod -Method Put -Uri "$base/local-projects/$projectId/settings" -WebSession $swaHumanSession -Headers $humanHeaders -ContentType 'application/json' -Body $executeSettingsBody -MaximumRedirection 0 -TimeoutSec 30
$project = $executeSettingsResult.project
$executeGrantRequest = [Guid]::NewGuid().ToString()
$executeGrantBody = @{ schema_version=1; request_id=$executeGrantRequest; expected_version=1; agent_id=$callerAgentId; actions=$executionActions } | ConvertTo-Json
$humanHeaders['Idempotency-Key'] = $executeGrantRequest
$executeGrantResult = Invoke-RestMethod -Method Post -Uri "$base/local-projects/$projectId/grants" -WebSession $swaHumanSession -Headers $humanHeaders -ContentType 'application/json' -Body $executeGrantBody -MaximumRedirection 0 -TimeoutSec 30
```

Grant更新使原token失效，须以新的`$tokenRequest`按前述token步骤再次签发，并在命令端更新`$projectToken`。人工会话、Grant调用端标识与被管理Worker的原生Agent标识分别保留，不将调用端名称当作原生Agent注册或人类身份。

普通终端与现有Agent原生命令工具均调用同一安装后的绝对路径；只在调用进程内提供环境，不把token写入输入文件、命令正文或验证日志。

```powershell
$env:SWA_ENDPOINT = "http://127.0.0.1:$port"
$env:SWA_PROJECT_ID = $projectId
$env:SWA_PROJECT_TOKEN = $projectToken
& $swa status --json
& $swa capabilities --json
$openRequest = [Guid]::NewGuid().ToString()
$openedText = & $swa controller open --project $projectId --workdir $projectRoot --request-id $openRequest --json
if ($LASTEXITCODE -ne 0) { throw '保留openRequest，使用request show --project查询原效果' }
$opened = $openedText | ConvertFrom-Json
$controller = $opened.controller
if (-not $controller -or -not $opened.runtime_id) { throw '真实控制端回执缺少身份' }
```

后继controller、Run、根Task及Dispatch全部使用真实回执。固定`task.json`包含`goal/source_repo/source_revision/success_criteria/max_workers/context`；context引用批准的实际公开文件。`max_workers`是根任务批准创建或预留的Worker总席位，已完成或释放的child Task仍计数，不自动归还席位。本轮验收默认`N=3`，其他数量须符合当前机器和批准范围。N不是产品固定上限。准备N份实际公开输入和已审阅的独立Worker名称，输入及后继文件均位于该项目的允许目录。历史两Worker检查保留其当时范围；配置额度为2的任务仍应拒绝第三席。

```powershell
$n = 3
if ($n -lt 3) { throw '本多Worker验收示例要求N至少为3；这不是产品数量下限' }
$inputDirectory = (Resolve-Path -LiteralPath (Read-Host '已有且已批准的公开输入目录')).Path
$workerInputs = @(1..$n | ForEach-Object {
  $inputPath = Join-Path $inputDirectory ("worker-{0}.txt" -f $_)
  if (-not (Test-Path -LiteralPath $inputPath -PathType Leaf)) { throw '实际公开输入文件缺失' }
  [pscustomobject]@{ name="worker-$_"; input_file=$inputPath }
})
$spec = Get-Content -LiteralPath $specFile -Raw | ConvertFrom-Json
if ($spec.max_workers -ne $n -or $workerInputs.Count -ne $n) { throw '任务额度及已审阅输入数量须与N一致' }
$createRequest = [Guid]::NewGuid().ToString()
$createdText = & $swa task create --controller $controller --spec-file $specFile --request-id $createRequest --json
if ($LASTEXITCODE -ne 0) { throw '保留createRequest，先查询原请求，不继续启动Worker' }
$created = $createdText | ConvertFrom-Json
$rootTask = $created.task_id
if (-not $rootTask -or -not $created.run_id) { throw '真实任务回执缺少身份' }
$workerCalls = @($workerInputs | ForEach-Object {
  [pscustomobject]@{ name=$_.name; input_file=$_.input_file; request_id=[Guid]::NewGuid().ToString(); dispatch_id=$null }
})
if (@($workerCalls.name | Select-Object -Unique).Count -ne $n) { throw 'Worker名称必须唯一' }
foreach ($call in $workerCalls) {
  $startedText = & $swa worker start --controller $controller --task $rootTask --name $call.name --agent $agent --model $model --input-file $call.input_file --request-id $call.request_id --json
  if ($LASTEXITCODE -ne 0) { throw '保留当前call.request_id并查询；已启动Worker继续占有原身份' }
  $started = $startedText | ConvertFrom-Json
  if (-not $started.dispatch_id -or $started.run_id -ne $created.run_id) { throw '真实Worker回执身份不符' }
  $call.dispatch_id = $started.dispatch_id
}
if (@($workerCalls.dispatch_id | Select-Object -Unique).Count -ne $n) { throw '每个Worker须有独立Dispatch' }
& $swa worker list --controller $controller --task $rootTask --json
foreach ($call in $workerCalls) {
  & $swa worker show --controller $controller --dispatch $call.dispatch_id --json
}
$stopTarget = $workerCalls[0].dispatch_id
$continueTarget = $workerCalls[1].dispatch_id
$stopRequest = [Guid]::NewGuid().ToString()
& $swa worker stop --controller $controller --dispatch $stopTarget --request-id $stopRequest --json
if ($LASTEXITCODE -ne 0) { throw '先按stopRequest核查原停止效果，不能直接宣布已停止' }
$sendRequest = [Guid]::NewGuid().ToString()
& $swa worker send --controller $controller --dispatch $continueTarget --input-file $followupFile --request-id $sendRequest --json
if ($LASTEXITCODE -ne 0) { throw '保留sendRequest核查原输入，不换键重发' }
& $swa worker read --controller $controller --dispatch $continueTarget --source transcript --limit 100 --json
& $swa task result --controller $controller --task $rootTask --output-dir $newOutputDirectory --json
```

以上循环提交只说明如何操作N个Worker，不证明模型执行区间重叠；真实并发、指定停止期间其余Worker继续和原生会话接续须按安装验收核查。首次操作前保存`$workerCalls`、`$createRequest`及后续request变量于当前受保护会话，不把token或私有输出写入公开项目。`worker list/show/read`和`task show/list`返回原生快照；逐项检查所有Worker，不能把首个回复或HTTP成功当作整项任务完成。完整任务使用上文`run/wait/export`，低层成果查询仍可使用`task result`，不根据不完整列表推断终态。

每个写动作的request变量为首次调用前保存的不同规范UUID。查询结果包含真实原生状态，查询成功不代表任务成功。退出码6表示效果未知：保留原request，使用`request show --controller ... --request-id ... --json`查询；controller尚未取得时使用`--project`形式。未知输入不能换键重发。CLI的HTTP等待上限为150秒；超时未收到确定结果时返回6，不停止后台或自动重发。普通查询/控制等待中的Ctrl-C返回130，只取消当前CLI等待；原请求仍需核查。`serve`的Ctrl-C或所属stdin结束会关闭本次所属服务，行为与普通命令分别处理。

| 退出码 | 含义 |
| --- | --- |
| 0 | 当前命令成功；查询成功不等于任务完成 |
| 2 | 参数、字段或请求不一致 |
| 3 | 权限、批准或当前身份不足 |
| 4 | 服务或原生能力不可用 |
| 5 | 资源额度、端口或实例锁拒绝 |
| 6 | 原请求、停止或释放效果未知，先查询原回执 |
| 7 | 运行、响应处理或导出失败 |
| 8 | 完整任务等待超时，原 Run 继续运行 |
| 9 | Run 需要用户回答或继续原问题，按准确指引处理 |
| 130 | 当前等待已取消；`serve`按所属生命周期回收服务 |

指定停止仅处理该Worker的专有Job；root退出、tree退出和资源释放分别记录。全部相关Worker确认退出并按原生流程归档释放后，可显式提交固定成功条件的真实结果，再关闭controller：

```powershell
foreach ($call in $workerCalls) {
  # 首个目标已经有stopRequest；其余只在需要停止时提交各自独立原请求。
  if ($call.dispatch_id -ne $stopTarget) {
    $call | Add-Member -NotePropertyName stop_request -NotePropertyValue ([Guid]::NewGuid().ToString())
    & $swa worker stop --controller $controller --dispatch $call.dispatch_id --request-id $call.stop_request --json
    if ($LASTEXITCODE -ne 0) { throw '停止尚未确认；保留该Worker与原请求占用，不继续释放' }
  }
  $call | Add-Member -NotePropertyName release_request -NotePropertyValue ([Guid]::NewGuid().ToString())
  & $swa worker release --controller $controller --dispatch $call.dispatch_id --request-id $call.release_request --json
  if ($LASTEXITCODE -ne 0) { throw '归档释放尚未确认；保留原请求，不提交任务完成' }
}
$completeRequest = [Guid]::NewGuid().ToString()
& $swa task complete --controller $controller --task $rootTask --result-file $checkedResultFile --request-id $completeRequest --json
if ($LASTEXITCODE -ne 0) { throw '任务完成尚未确认；先查询completeRequest' }
$closeRequest = [Guid]::NewGuid().ToString()
& $swa controller close --controller $controller --request-id $closeRequest --json
```

`$agent`和`$model`必须是当前真实发现、明确选择并获准使用的本机Agent和模型。后续输入沿原Dispatch的启动选择，不能更换Agent或模型。任一退出/归档证据未知时保留占用并检查原请求；模型调用、原生工具和账号读取须满足当前任务的准确批准及已验证的隔离能力。
