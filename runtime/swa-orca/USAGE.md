# SWA 无界面 CLI

Windows x64 包包含`swa.exe`、`server.exe`、固定Node24.21.0、私有Orca运行文件、安装入口与许可。`VERSION`和`swa.exe --version`给出同一准确源码提交。当前首版尚未通过同一安装候选的完整真实验收，实际验证范围以随交付的记录为准。

## 安装

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

## 启动私有服务

`$dataRoot`为产品独占绝对目录，须与安装目录、原Orca及所有保护目录互不包含。默认发现本机原生命令和配置。需要采用既有Orca的Agent设置时，显式提供`--agent-profile $agentProfile`，其中`$agentProfile`是已经存在的原profile绝对目录；该来源只读，缺失或损坏时明确失败。

```powershell
& $swa serve --data-dir $dataRoot --port $port --protected-roots ($protectedRoots -join ';') --json
```

该命令在前台持有所属stdin，输出实际Node/HTTP readiness后持续运行。关闭该stdin或Ctrl+C请求关闭本次所属服务；不要把stdin预先重定向为空。服务监听显式`127.0.0.1`端口，冲突返回退出码5。依赖或所属证据不足会明确拒绝；不会另选端口或启动本机Orca。进程、SQLite、profile、IPC、会话、缓存和临时目录均归本次私有根。

## 项目授权与调用身份

`swa capabilities --json` 每次合并 Structured 与 terminal 注册定义，刷新 Windows PATH 并探测当前 CLI 版本。结果分别报告注册、安装、配置和执行能力。`roles` 提供 `developer`（开发者）、`reviewer`（审查者）、`coordinator`（协调者）的职责。

使用 `swa worker start ... --role developer` 或 `--role reviewer` 为同一任务的 Worker 选择角色。角色正文随任务输入保存，不增加权限。省略 `--role` 保持原有输入；未知角色在创建 Worker 前拒绝。完整调用示例见下文。

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

批准范围须覆盖当前固定公开项目、允许读取的文件/子目录，以及`read_context/observe/start/send/stop`中实际需要的动作。`allow_agent_control`、`allow_directory`、`allowed_subdirs`、`allowed_actions`和`allowed_tools`由当前批准确定，`external_model_cli`继续只批准一个实际CLI标识。`capabilities`分别显示注册、启用、安装、配置和各项控制能力及来源；声明能力和实际启动结果分别记录。更改设置会改变revision，旧上下文须按当前批准重新取得。缺少人工批准时保留退出码3及required_action。

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
& $swa controller open --project $projectId --workdir $projectRoot --request-id ([Guid]::NewGuid().ToString()) --json
```

后继controller、Run、根Task及Dispatch全部使用真实回执。固定`task.json`包含`goal/source_repo/source_revision/success_criteria/max_workers:2/context`；context引用批准的实际公开文件。`a.txt/b.txt`和后继输入位于该项目的允许目录，文件内容作为真实模型输入。

```powershell
& $swa task create --controller $controller --spec-file $specFile --request-id $createRequest --json
& $swa worker start --controller $controller --task $rootTask --name A --agent $agent --model $model --input-file $inputA --request-id $startARequest --json
& $swa worker start --controller $controller --task $rootTask --name B --agent $agent --model $model --input-file $inputB --request-id $startBRequest --json
& $swa worker show --controller $controller --dispatch $dispatchA --json
& $swa worker read --controller $controller --dispatch $dispatchB --source transcript --limit 100 --json
& $swa worker stop --controller $controller --dispatch $dispatchA --request-id $stopARequest --json
& $swa worker send --controller $controller --dispatch $dispatchB --input-file $followupFile --request-id $sendBRequest --json
& $swa task result --controller $controller --task $rootTask --output-dir $newOutputDirectory --json
```

每个写动作的request变量为首次调用前保存的不同规范UUID。查询结果包含真实原生状态，查询成功不代表任务成功。退出码6表示效果未知：保留原request，使用`request show --controller ... --request-id ... --json`查询；controller尚未取得时使用`--project`形式。未知输入不能换键重发。

指定停止仅处理该Worker的专有Job；root退出、tree退出和资源释放分别记录。全部相关Worker确认退出并按原生流程归档释放后，可显式提交固定成功条件的真实结果，再关闭controller：

```powershell
& $swa worker stop --controller $controller --dispatch $dispatchB --request-id $stopBRequest --json
& $swa worker release --controller $controller --dispatch $dispatchA --request-id $releaseARequest --json
& $swa worker release --controller $controller --dispatch $dispatchB --request-id $releaseBRequest --json
& $swa task complete --controller $controller --task $rootTask --result-file $checkedResultFile --request-id $completeRequest --json
& $swa controller close --controller $controller --request-id $closeRequest --json
```

`$agent`和`$model`必须是当前真实发现、明确选择并获准使用的本机Agent和模型。后续输入沿原Dispatch的启动选择，不能更换Agent或模型。任一退出/归档证据未知时保留占用并检查原请求；模型调用、原生工具和账号读取须满足当前任务的准确批准及已验证的隔离能力。
