# Swarm CLI隔离后台、身份、控制规则与真实测试计划

对应[Worker任务](../../tasks/swa-cli-headless-20261020.md)，接管基线main `e149510762f89bed06e7c8c766917554a58294e4`，后续普通快进至4e6e及`f7c97d36af03309868269a7ee3d8fa791a570974`。准确396e方案与T00—T15已获原Reviewer独立接受，主控已接续§5.3及后继明确写域，当前继续实现。严格类型检查及四个native模块的真实编译和装载已通过，记录见§29；完整安装候选、认证、模型和功能验收继续实施。

## 1. 来源与唯一状态归属

`O:` 表示只读上游 `C:/Users/DW/orca/Astrocyte/.verification/orca-source-v1.4.230`，准确 `b2879bd5aaac5d27c101ccf4171faa25d9f0bb1e`、tag `v1.4.230`；本次HEAD和干净状态均已核。`P:` 表示已安装 `C:/Users/DW/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent`，package版本 `1.0.1`。`S:` 表示本产品。来源源码描述可支持静态判断；动态能力仍须按§7验证。

最新用户要求采用产品自带且隔离的后台，保全本机Orca。主控在本次 `ask` 回复批准本方案的状态边界：**私有Orca原生Run/Task/Dispatch拥有首版执行状态**；Workspace复用适用项目、授权与固定上下文；旧Mission/Claim/Relay保留原归属，同一首版任务不双写。主控已将独立接受的接口及停止保护边界写入SPEC §21.1，当前程序继续实现和独立复审。

| 对象 | 唯一拥有者与产品边界 |
| --- | --- |
| 一次用户任务 | 私有Orca中一个Run及一个根Task；根Task没有Worker Dispatch，A/B为该根的两个子Task，各自具有真实Dispatch。汇总视图读取原生记录，不生成第二Task |
| Worker生命周期、消息、请求回执、终端资源、输出归档 | 原生 `orchestration.db`；沿原表、事务和生命周期方法，不另建Attempt、调度器或任务完成账本 |
| 项目、权限、批准、固定上下文 | 既有Workspace服务及其主SQLite；首版只保存指向原生Run/根Task的关联，不复制执行状态 |
| provider会话与进程 | 私有runtime的真实session record/journal、Pi自产会话、实际ChildProcess/daemon；这些是执行观察来源 |
| 已有认知、网页、Mission/Claim/Relay | 保持既有产品及其独立任务路径。本首版任务不调用Claim、不创建同义Mission或RelayTask；相应旧准入继续生效 |

Go/TypeScript/SQLite继续保留。Go CLI及已有HTTP/App负责协议和Workspace准入；抽取的Node runtime负责原生执行。跨进程边界来自复用真实Node执行宿主的必要条件；没有拆分既有Go模块。

## 2. 已读取的真实调用链

### 2.1 CLI、Node组装与传输

已完整读取 `O:src/cli/index.ts`、`handlers/core.ts`、`specs/serve.ts`、`runtime/launch.ts`、`runtime/serve-orcad-launch.ts`、`runtime/client.ts`、`runtime/metadata.ts`、`runtime/transport.ts`。

1. `index.ts`先解析并验证参数，`handlers/core.ts:serve`调用`serveOrcaApp`。`runtime/launch.ts`选择实际宿主；`resolveLocalServeRuntime`失败时原实现可以选择Electron。产品固定使用自带Node入口，选择失败立即退出，不调用该兼容选择分支。
2. `serveWithOrcad`向子进程传入`ORCA_USER_DATA`和实际入口；`orcad-entry.ts:startOrcad`安装Node AppEnvironment，设置`ORCA_USER_DATA_PATH`并取得实例锁。CLI读取后者，Node宿主读取前者，两者必须由产品启动器显式指向同一私有根。
3. 已完整读取`orcad-entry.ts`、`orcad-host-adapters.ts`、`orcad-profile-state-startup.ts`、`orcad-app-paths.ts`、`orcad-daemon-supervision.ts`。真实Node组装仍包括Store/SQLite、agent hook server、daemon、账户服务、structured session host、恢复和RPC；不能用process-host包代替完整组装。
4. `createOrcadProfileStateStartup`经`initOrcaProfilePaths/ensureActiveOrcaProfile`打开`profiles/<profileId>/profile-state.db`及对应authority，真实Store必须传给`registerHeadlessPtyRuntime`。Orchestration另由`workspaces/persisted-surfaces/automation-operations.ts:orchestrationDbPath`定位`<userData>/orchestration.db`；两库分别拥有配置与执行记录，不声称跨库原子事务。
5. `RuntimeClient`读取私有`orca-runtime.json`、协商contract capability并发送RPC。`transport.ts`使用原生named pipe/Unix socket，校验响应ID及runtimeId；mutation request ID与传输response ID分别保留。远端配对/环境选择在本首版入口不启用。
6. 已完整读取`runtime-rpc-state.ts`、`runtime-rpc-request-admission.ts`、`runtime-rpc-socket-metadata.ts`。runtime每次生成24字节随机owner token；metadata记录runtimeId、PID、startedAt和endpoint；Windows endpoint含PID与runtime后缀。token是本地runtime凭据，不能输出给Worker、写进Git或混称human批准。产品RPC只注册本首版必要方法，`enableWebSocket=false`；现有Go HTTP固定loopback与显式端口，冲突即失败。

### 2.2 Run/Worker、输入、观察、停止及释放

本节表中`worker/`相对`O:src/main/runtime/rpc/methods/orchestration/`；`runs/`、`messaging/`同属该目录，`db/`相对`O:src/main/runtime/orchestration/`。

| 行为 | 准确来源与实际语义 |
| --- | --- |
| Run/Task | `rpc/methods/orchestration/runs/runs.ts`、`runs/run-scope.ts`、`messaging/message-methods.ts`；Run绑定真实pane或Orca session，Task变更要求当前consumer |
| Worker创建 | `worker/local-worker-start.ts`经`createStartingWorkerDispatch`持久化后执行placement、readiness、`prepareStartingWorkerAuthority`和首输入；子Task/Dispatch即为实际成员身份 |
| 实际放置 | `worker/worker-topology.ts`和`worker-start-agent-placement.ts`；structured路径为`orchestration-structured-worker-session.ts:createStructuredWorkerSession`，创建真实session record后才取得host/fence |
| 首提示 | `deliver-worker-dispatch-preamble.ts`、`worker-start-readiness-settlement.ts`；native `sendAgentTurn`区分accepted、pending、rejected及unknown，未观察到turn保持`start_unknown/outcome_unknown` |
| 身份观察 | `worker/worker-observation.ts`同时核Dispatch、pane/process incarnation、host和resource；PTY live、Agent fleet liveness、结构化session是否可寻址分别输出 |
| 输出 | `worker-control.ts:workerRead`及`worker-output.ts`读取前后重核身份；structured journal及原provider transcript是成果来源。`source=auto`的终端尾部退路不用于产品结果 |
| 停止 | `worker-stop.ts`先beginWorkerStop，再核exact identity和owned resource，执行structured close或精确terminal close；未知保持`stop_unknown`，context-only停止不能证明进程退出 |
| 释放 | `worker-release.ts`、`worker-release-completion.ts`先核身份、冻结输出、持久归档，重核release lease后关闭并结算；保留`retained/release_pending/release_unknown` |
| 完成 | `db/tasks/task-status-transition.ts`明确禁止活跃supervised Worker下把Task改completed。产品ToolsOff Worker不发送CLI worker_done：控制端取得真实settled输出后显式停止并证明退出，再以自己的当前consumer调用原生taskUpdate；记录完成来源为控制端确认及真实结果引用 |

`workerStop`、provider turn结束、根进程退出、全部后代退出、归档和释放是不同事实。产品公开输出保留这些字段；停止A后不能因根退出就释放仍有后代的资源。未确认退出的原Worker不启动替代者。原生释放代码中的重试/恢复也只能对同一已记录动作作观察；产品入口不自动重发未知输入。

### 2.3 capability创建、恢复和校验的准确区别

已完整读取`orchestration-session-caller.ts`、`orchestration-caller-identity.ts`、`terminal-authority/verify-orchestration-compatibility-caller.ts`、`agent-session-claim-identity.ts`、`db/worker-dispatch/worker-dispatch-authority.ts`、`rpc-caller-scope.ts`、`orchestration-mutation-executor.ts`和contract fence。

- owner token认证本地RPC持有者；本地owner scope并不证明操作者是human。产品不调用headerless bootstrap，不签发human cookie，不传入consumer自称或`--actor human`。
- Run consumer通过真实pane/Orca session和`consumer_generation`绑定。Worker准备在事务中保存真实assignee、pane、process incarnation、host、launch-token commitment并推进generation；停止、结算及接管使旧绑定失效。
- PTY的真实launch token由宿主产生并注入所属子进程。`verifyOrchestrationCompatibilityCaller`结合token、host、process incarnation和实际hook attestation；`currentRuntimeLaunchSufficient=true`只在精确当前runtime的真实launch上允许免hook核验。恢复路径要求原有恢复证明，不能把token字符串直接当恢复通过。
- structured session的HMAC claim使用私有根的`agent-session-authority.key`，绑定authority domain、machine/principal/container/providerRoot、原生session及worktree scope；原key不复制，损坏拒绝。它与普通`ORCA_AGENT_SESSION_ID`有别；源码明确后者是同用户下的定位信息，本身不构成凭据。
- 当前源码保留`orchestrationCapability`传输字段、`capability_hash/capability_revoked_at`兼容列；本次源码搜索没有找到当前Worker启动为该header签发并校验新capability的路径。实际链路使用上述launch/session/consumer证明。不能把遗留字段写成现有安全令牌系统。
- 上游`@orca/process-host/src/process-tree-kill-gate.ts`默认允许、gate抛出仍允许；产品在树终止调用前执行fail-fast所有权检查。单独注册会抛异常的gate无法承担准入保护。

## 3. 产品隔离与控制端身份方案

### 3.1 安装、状态和全局消费者

当前Windows安装契约与真实构建入口使用同一平铺布局：`<InstallRoot>/swa.exe`、`<InstallRoot>/server.exe`、`<InstallRoot>/node/node.exe`与`<InstallRoot>/runtime/`。runtime内包含`host.cjs`、`client.cjs`、`controller-helper.cjs`、`native-cli-entry.cjs`、`provider-job-bootstrap.mjs`、固定依赖的`node_modules`及按来源basename放置的native child JS入口；Node LICENSE、产品及Orca许可和VERSION分别随包保留。所有适配器按上述实际绝对路径解析，安装复制真实内容，可写数据显式使用`<DataRoot>`，不得位于本机Orca根、其父目录、账号根或现有项目根。安装器在复制前创建独占新目录、设置私有ACL，并用真实路径及reparse核查拒绝重合/嵌套共享，不以路径字符串不同推断隔离。

| 原生消费者 | 当前源码行为 | 产品composition处理 |
| --- | --- | --- |
| `orcad-app-paths.ts` | 未设置时回到home/.orca | 必须显式私有根，禁止默认home分支；CLI和宿主同根 |
| `profile-index-store.ts`及`profile-storage-paths.ts` | profile index、默认profile与legacy迁移均按userData | 只在新私有根初始化，不读入本机index或legacy数据 |
| `orcad-plaintext-credential-migration.ts` | `orcadCredentialRoot()`固定home/.orca，无视私有profile；各integration store还读取Linear/Jira/Bitbucket/speech等凭据 | 不组装该迁移及这些integration入口；secret store如需初始化，keyDir显式私有根 |
| `orcad-managed-agent-hooks.ts` | `startCodexHooks`、`adoptLoginShellAgentHomes`、startup hook reconcile、OpenCode plugin refresh可能接触全局Agent homes | 不启动全局reconcile。Worker采用structured Pi native events提供真实状态；控制端使用真实当前launch证明。必要hook服务只监听私有endpoint，禁止改写系统Agent配置 |
| `orcad-account-services.ts`及codex account homes | 准备/迁移运行home、账户选择、认证和session resume | 不启动账户管理/迁移。仅显式只读访问获准的现有Codex认证来源，使用§4只读CredentialStore；不把整个home复制成可写账户 |
| `orcad-cli-launcher.ts` | 在profile下生成orca launcher；进程可将该目录放到child PATH前 | 产品入口名固定swa，直接调用随包Node和bundle绝对路径；原生控制helper使用产品内RuntimeClient。无orca同名shim，不改进程外PATH |
| daemon与history | `daemon-launch-paths.ts`按AppEnvironment解析daemon/history；daemon detached、runtime关闭只disconnect | 所有路径归私有根；只接管经PID/创建时间、token、协议及安装根核实的本产品daemon，未知拒绝；不关闭本机Orca daemon |
| runtime metadata / instance lock / signer | userData下metadata、`orcad.lock`、HMAC key；Windows runtime pipe含PID | 保留真实锁与随机runtime身份，核创建时间；原Orca metadata不读作产品目标，不扫除其他根的锁/socket |
| automation/session search/push/state-rule更新 | 原orcad启动会主动安装这些服务，部分涉及网络和会话发现 | 不在首版composition启动。结构化journal、已有特定会话读写继续可用，无全局会话扫描 |
| SWA实际provider事件观察 | 原生JSONL连接已经接收真实SDK的agent/message事件 | 只在已验证的私有Worker根独占创建`provider-events.ndjson`，记录实际生命周期、delta和消息role/stopReason字段的投影、父runtime接收的单调时间及实际Job root PID/创建时间；用于T13核真实流式执行重叠，不作为Task状态或请求账本。写入错误立即失败，不生成或替换SDK事件 |
| browser/desktop/mobile/remote | 原runtime具备相关类型、注册和资源 | 产品方法表不注册相应入口，不安装visuals插件或浏览器资源；保留原上游源码的必要静态依赖，不把未注册能力写作产品功能 |

保全采用以下当前用户权限可执行的组合，实施脚本使用系统PowerShell/.NET和随包Node，不需要内核采集、提权、性能组或驱动：

| 对象与具体观察方法 | 准入、实际结果与判据 |
| --- | --- |
| 每个实际可写消费者 | 按上表及构建metafile核真实调用闭包；为profile/SQLite、metadata/lock/key、daemon/history、launcher、session/journal、Pi settings/cache逐项记录注入位置、允许根和实际文件。写端在打开/创建前核规范路径及所属，所有可写路径限定DataRoot或本项安装输出；禁止只审顶层环境变量。实际SQLite以`node:sqlite`的`PRAGMA database_list`核主文件位置，并查真实Run/Task/Dispatch/session记录 |
| 路径与端点 | 安装器及写端用Go/Node真实路径解析、Windows文件属性/reparse核验及既有windows-security读取ACL；拒绝本机Orca/账号根、祖先/后代重合和重定向到它们的junction。用本项自有junction指向受保护根作真实拒绝输入，不向目标试写。`Get-NetTCPConnection`核loopback端口及OwningProcess；真实RuntimeClient核私有metadata中的runtimeId/endpoint/PID/startedAt，私有锁冲突和占用端口均在使用前拒绝 |
| 进程与关闭目标 | `Get-CimInstance Win32_Process`定向读取已知runtime/daemon/helper/Worker的ProcessId、ParentProcessId、CreationDate、ExecutablePath；与原生host/incarnation及精确所属记录互核。只保留非秘密字段；创建时间或所属失配时在调用树终止前拒绝。原生退出观察与后代检查证明实际全树退出，不能用一次进程枚举的缺项推断退出 |
| 原Orca配置和认证 | T00按真实路径解析确定原Orca安装、profile/config、Agent配置及本次选定Codex认证文件清单；用`.NET FileStream(FileMode.Open,FileAccess.Read,FileShare.ReadWrite\|FileShare.Delete)`读入内存比较字节，用`Get-Acl`比较owner/SDDL，仅保存路径类别、相等布尔值和变化时间，不保存秘密字节。读取保持原客户端共享权限，及时关闭读取句柄。T02、并发期间、停止A后和T15重复；同时用原绝对CLI的`status --json`核原runtime/daemon/会话归属及查询可用 |
| 定向目录变更通知 | 在上述明确配置/认证父目录使用`.NET FileSystemWatcher`，按FileName/DirectoryName/LastWrite/Size/Security通知记录创建、修改、删除、重命名及Error；范围只含已审目录，不读取会话正文。先在本项自有目录实际验证通知，再观察受保护目录。该接口不提供writer PID，不能独自归因或证明没有写入；溢出/不可读或自然变更无法解释时保留相应范围证据不足，不把无事件当完整隔离证明 |

上述文件变更通知的能力和缓冲区溢出限制依据[Microsoft FileSystemWatcher文档](https://learn.microsoft.com/en-us/dotnet/api/system.io.filesystemwatcher?view=net-9.0)。实际隔离结论依赖写入消费者准入、精确运行事实和前后保全的共同结果。原客户端可正常写自身日志/状态或更新认证；发生变化时核原客户端实际记录及产品写端和SDK来源，无法解释的具体文件保留证据不足，不回写原值。不要求活跃Orca整棵目录逐字节不变，不宣称恶意同用户隔离或系统调用级全量追踪通过。

### 3.2 从普通终端或原有Agent取得真实控制身份

原生`runCreate`要求stable pane/session，普通外部终端不能凭空取得该身份。方案增加一个**实际运行的控制helper**，只承担已有命令的传输和身份绑定，无模型或自动调度循环：

1. `swa controller open`通过现有项目scoped token向Go App请求，重查项目、批准及允许动作。后台在私有runtime中创建真实后台PTY，启动准确`<InstallRoot>/node/node.exe <InstallRoot>/runtime/controller-helper.cjs`；保存原生terminal/pane/process incarnation及实际PID/创建时间。该内部创建传入真实`launchConfig`，其`agentCommand/agentArgs/agentEnv`仅描述随包helper命令，不传`startupAgent/launchAgent`。`O:src/main/agent-launch/agent-launch-token.ts:agentLaunchTokenFor`仅在launchConfig存在时mint token，`terminal/launch/terminal-create.ts`负责环境注入和PTY commitment；普通空壳terminal没有这项token，不能当控制身份。此helper不登记成模型Agent，不伪造hook状态。
2. helper从自己原生launch环境读取宿主产生的真实token/handle和产品metadata，经RuntimeClient发起请求。open只创建并核实helper，不创建Run；每个controller只服务一次用户任务，`task create`随后由它创建一个Run及根Task。用户命令不接受`--from`、pane、consumer、actor或launch token；控制helper只以自己的实际身份调用runCreate/runUse和原生任务/Worker方法。
3. 外部终端和已有Agent使用同一`controller`选择器及原有项目token。后台在每次写入核准主体、项目、批准、root Task、controller的完整活身份后，经原生terminal输入通道交付命令；helper只接收版本化JSON动作，由成熟JSON解析器解析，不执行调用者传入的shell字符串。命令结果使用原生request回执及私有终端输出返回；helper传输自身不另建持久队列或任务表。
4. 严格产品admission调用原生精确launch校验，不能因上游核验返回null就沿宽松declared-handle分支放行。helper的输入接受与请求执行分别记录；传输未知时按原request ID查询，不再次terminal.send。真实收到的correlation ID用于定位，不充当权限凭据。
5. 本机Orca内的原有Agent调用swa时，其ORCA环境属于另一个宿主。产品入口只用产品controller，不把该环境转换成产品Worker或human；产品子进程清除外部Orca身份、pairing、account及remote选择变量，再注入自己的真实环境。父进程环境不改动。
6. runtime重启后，能核实原生恢复证明的原helper才继续；证明不足返回`controller_unverifiable`，只读查询仍可用。确认原helper真实退出后才允许创建新helper并由它调用原生runUse推进consumer generation。未知时不重绑、不创建竞争控制端。

控制helper是需要实现并真实验证的适配部分，不能由当前开发终端的身份代替。本地owner token与同一Windows用户的权限边界仍属协作式控制；不宣称阻止恶意同用户读取其可读凭据。应用层项目/批准检查不因这项边界而省略。

### 3.3 controller请求、原生去重与恢复

准确上游`shared/orchestration-rpc-contract.ts:isDurableMutation`未包含`terminal.create/close`。`terminal-lifecycle-methods.ts`将create交给`dedupeTerminalCreate(clientIdentity,worktreeSelector,clientMutationId,reconcileExisting,run)`；`terminal-create-deduplication.ts`解析真实workspace，以原生`deriveRemoteRuntimeTerminalCreateHandle`从clientIdentity、workspace ID和clientMutationId得到确定handle，并传入`preAllocatedHandle`。`RemoteRuntimeTerminalCreateIdempotency`只合并in-flight，成功或失败均移除；`reconcileExisting`找不到时会执行新创建，不能承担未知操作的只读恢复。

产品需要在**同一原生mutation executor及orchestration.db的mutation_receipts**中登记准确方法名：`swa.controllerOpen`、`swa.controllerClose`、`swa.taskCreate`、`swa.controllerDeliver`。这些为待实施的产品composition方法，非声称上游已有；将它们加入现有durable方法分类并复用`OrchestrationMutationExecutor.run`、原生canonical payload比较、begin/checkpoint/complete receipt及`orchestration.requestShow`。没有新增表、执行状态或payload hash实现。Go App先核真实项目主体/批准，再由受保护私有RuntimeClient发起；入口不允许外部原始RPC，普通CLI输入不能选择caller fingerprint。

| 公开动作与请求R | 精确原生映射、保存位置及副作用顺序 |
| --- | --- |
| `controller open` | Go App规范化并核实际project、workdir、批准与主体，把这些非秘密字段全部放入`method=swa.controllerOpen`的原生payload，`orchestrationRequestId=R`，使用私有runtime真实local caller fingerprint。原生receipt在任何PTY副作用前pending；其checkpoint保存真实workspace ID、固定clientIdentity=`swa-controller-local`、clientMutationId=`R/controller-pty`、调用原生derive函数所得expected handle及stage。产品handler直接复用原生`runtime.dedupeTerminalCreate`，明确传上述clientIdentity、`worktree=id:<真实ID>`、clientMutationId、`reconcileExisting=false`；callback调用真实`runtime.createTerminal`，传原生preAllocatedHandle及§3.2真实launchConfig。这与原terminal.create handler使用相同的实际原生操作，不依赖RuntimeClient未提供的clientId参数。创建后保存实际pane/host/incarnation/PID/创建时间；真实helper ready和launch核验满足后才complete receipt，controller selector为该原生handle，runId此时为空 |
| `task create` | 在同一原生executor先登记`method=swa.taskCreate,R`及精确controller绑定，checkpoint记录子请求`R/run-create`、`R/root-task`。只向真实helper输入一次结构化命令；helper以自身真实身份执行`orchestration.runCreate`，header请求为`R/run-create`，随后以得到的实际runId执行`orchestration.taskCreate`、请求`R/root-task`。两项均有各自原生receipt；返回真实Run/根Task后完成外层receipt。失败保留已创建Run/根Task，禁止用第二个controller/Run替代；controller已有根Task时拒绝创建另一用户任务 |
| `controller close` | 原生`method=swa.controllerClose,R`的payload固定controller handle及当前open receipt中的精确incarnation/host/进程身份，先重核授权和所有所属Worker已退出/归档/释放。checkpoint在关闭前保存exact identity及stage，然后调用原生精确`terminal.close`和全树退出观察；没有Run状态删除动作。全树退出明确时complete，未知保持pending/EXIT6及占用，不能借close清除残留 |
| 其他经helper的写操作 | `swa.controllerDeliver`以公开R登记原生outer receipt，payload含真实主体/project/controller/动作及完整输入；在一次terminal输入前checkpoint保存固定子请求`R/native`、精确controller绑定及stage。helper仅一次执行对应原生方法，native请求为`R/native`；`workerStart(spec,parent=<根Task>)`在原生接受内创建子Task/Dispatch，无先行独立taskCreate。send定位真实input operation。外层unknown不再次terminal.send，native及外层receipt均可由公开R查询；只有原生动作明确完成才完成outer receipt |
| 无controller的查询 | 增加`swa request show --project P --request-id R --json`，用于open回执丢失而没有controller selector时；与`--controller C`互斥。Go App核原主体/project，再读取原生requestShow和相关native状态；不启动helper、不发送输入、不根据absent创建资源。返回open/close checkpoint、原始副作用身份和真实观察；项目不匹配在输出前拒绝 |

同一公开R的所有controller/task组合步骤仅使用上述固定子请求名称，映射在原生receipt中保存，不放在CLI缓存。native caller fingerprint为同一私有runtime的真实local身份，因此同R更改project、主体、workdir、controller或正文会由原生payload比较得到`request_mismatch`，不能换clientIdentity回避冲突。并发同R由原生executor合并，已完成同R只回原receipt；PTY的in-flight去重另外使用原生clientMutationId，不把transport response ID当去重键。

`swa.taskCreate`在既有`replayStableCallerParams`中按下表生成比较输入；既有`hashCanonical`、原生receipt和传给handler的实际invocation保持各自原有职责。其他原生方法的指纹输入不变。

| 比较字段 | 稳定等价绑定 |
| --- | --- |
| `invocation.context.id/created_at` | 两字段由App每次读取实际上下文重新采样，仅从比较副本剔除；第一次实际ID、时间及全部上下文仍原样写入原生根Task spec。后继读取不能重写该固定原件 |
| `invocation.scope.run_id/root_task_id/context` | 这些是查询同一controller后所得的派生状态，首次创建前为空，创建后来自该原生根Task；比较副本的scope保留`project_id/controller/authority_domain`。精确Run/root由原生完成receipt、controller单任务事务和真实Run/Task关联约束，不能由公开命令选择 |
| 上下文内容与版本 | 比较保留`invocation.context`中除上述两项采样字段外的全部内容，包括schema/project/settings revision/mode、完整materials及files的path/version/text；固定请求的`spec.context`亦保留。实际内容、版本、引用、路径或权限变化继续不等价 |
| 主体与作用域 | 完整command、caller、project及scope的project/controller/authority都进入原生比较。App仍先核当前批准和实际路径，实际scope仍经过原生controller/Run/Task关联检查；规范化不改变准入或handler输入 |

完成后的open receipt保留实际clientIdentity/clientMutationId；task.create保留两个实际子请求；其他写动作保留`R/native`；close保留实际binding及两项进程身份。`request show`从这些原生记录直接查子receipt，不另建请求账本。

`request show`经App当前project/caller/observe授权后直接查询原receipt，controller形式不先解析可能pending的Run/root/context。私有client在任何receipt输出前核其实际project及给定controller；错配使用既有`RuntimeClientError('scope_denied')`，CLI返回3。此处不调用helper、不创建或重发原请求，也不改变执行动作的当前context和准入检查。

open在PTY请求开始后抛出或失联时，产品handler将该已可能发生的效果返回`operation_unknown`，保留原生pending及checkpoint；不能让原executor的普通异常清理把它变成可重建。close及task create也在首次外部副作用前checkpoint，之后的异常保持相同unknown规则。此处错误转换保留具体cause/stage和已有身份，不捕获后继续执行。原executor对pending非release动作本就拒绝再次invoke，产品不增加自动恢复执行分支。

响应丢失或runtime重启后，查询按原checkpoint只读核精确handle、真实daemon `listProcesses`、持久PTY/session归属及原生Run coordinator/子请求receipt。已创建PTY而尚无Run的状态保留该helper；Run已创建而根Task未确认时返回原Run及pending子请求。原生reconcile可核exact handle的既有PTY，但产品查询不得调用会在无匹配时spawn的`dedupeTerminalCreate(...,reconcileExisting=true,...)`。未知、无inventory、缺handle或多重匹配均不创建、不重发、不释放；单独absent不证明无副作用。需要新controller时先获得原精确helper和后代已退出的正向证明，再由新的明确请求创建；绑定已有Run仍按§3.2真实runUse及generation规则。

### 3.4 T12控制端接续及严格调用者校验提案

本节及§7.6为待主控定稿、原Reviewer独立审核的完整提案，新增动作/内部契约尚未冻结或实施。程序来源为准确c0ab15e50d230a93a0aca17ea12e1f5c132ccb5c；后继bc217de88f4bb4b8af1ab63f3c281f4c2f649aea仅修正构建输出父目录及实际记录。依据已接受§3.2第6项、T03/T06/T12/T15及主控msg_d934de992f8b、msg_5df6a6277414；T11人工入口仍待用户决定，不阻塞本项。接续保留同一原生Run/根Task、固定context和现有Worker/Dispatch，不新增任务或执行账本。

已完整读取实际`runs.ts/run-scope.ts/run-receipt.ts`、`db/runs/run-binding.ts`、`rpc/core.ts/dispatcher.ts/orchestration-mutation-executor.ts/orchestration-mutation-receipt.ts/orchestration-legacy-compatibility.ts`、`terminal-authority/verify-orchestration-compatibility-caller.ts`及本项helper/client/contracts/native-methods和Go消费方。真实runUse经db.bindRun在原生事务改变coordinator、consumer_generation和mailbox delivery fence，不创建新Run。旧helper死亡属于产品准入。当前产品没有显式strict helper admission；上游run-scope在verify返回null时仍可使用声明handle，当前源码不能宣称§3.2第4项已经实现。completed R也可能先于handler返回，严格校验必须放在native executor之前。

唯一新增公开动作建议为`swa controller recover --controller C_old --request-id R --json`。复用既有command字段、项目/endpoint环境与当前token；不增加Run、generation、from、consumer、actor、pane、PID或launch-token参数。R须canonical UUID并与Idempotency-Key一致。创建真实新helper及改变控制权使用现有start授权、当前settings revision、目录与外发目标准入；人类安全stop的既有授权例外不授予recover。缺少完成的taskCreate、固定Run/root/context或原authority即拒绝。成功外层controller只填实际C_new，run_id/task_id仍为原Run/root，result保留真实owner和runUse receipt/generation；expected身份只留checkpoint，不填造外层。验证2、权限/旧consumer/身份失配3、依赖4、资源5、controller_unverifiable/operation_unknown等未知6、真实内部错误7，不自动重试或重发。

同项目授权下，request.show继续不依赖活helper。helper无法核验时，controller.show返回实际观察及6；task.show/list/result、worker.show/list/read通过明确原生Run/Dispatch的真实只读RPC观察，先核项目和原receipt关联，省略虚构caller。已核taskList显式run使用requireCurrentConsumer=false，可直接复用真实返回；其余观察复用既有原生方法及完整成果读取，来源缺失如实unavailable/incomplete。此路径不输入旧helper、不绑定Run、不执行prompt/stop/release/complete。历史controller可用于合法只读定位，新的写入必须使用当前C_new。

产品composition向原生RPC server注入显式admission callback，沿options交给dispatcher，在schema/transport准入之后、任何legacy route及native executor/重放之前执行；本产品注册方法均为unary。其他宿主未配置时保留上游行为，不修改本机Orca。所有helper发起的orchestration写入及带helper caller的查询，必须从实际请求compatibility evidence取得非空authority，比较真实handle/pane/process incarnation/host与原receipt及当前Run consumer。当前launch只在实际native dispatch authority确有当前launch commitment时使用currentRuntimeLaunchSufficient；restored分支使用原生restored receipt及真实attestation。本产品helper缺少真实hook证明时拒绝，不复制token、从旧文件重建authority或用launch选项代替恢复证明。已完成的Native R也先执行此校验。

无helper的私有bridge只读方法明确限定为既有requestShow/runShow/显式run的taskList/workerShow/list/read，项目scope继续由真实Go App和receipt核实。swa.*写入仍先经实际HTTP/App当前主体与批准检查；真正helper native写入再作前置强校验。公开同R返回既有完成open/close receipt只表示历史原件，不授予旧helper新写入权限或伪装活owner。runUse仅接受实际C_new和准确R/run-use：callback核pending swa.controllerRecover,R checkpoint、同一原Run/root、旧generation及真实新launch证据；其他Run、controller或子R拒绝。不启用legacy takeover，不由用户提供from。

复用现有orchestration.db/local caller fingerprint/native executor，增加私有durable方法swa.controllerRecover。payload保留原caller/project/settings、公开旧C/R、authority及原固定Run/root/context完整比较；新helper身份和generation只写实际checkpoint，不在重放时重新采样成payload，不新增hash规范化。

| 顺序 | 准入、副作用及原生回执 |
| --- | --- |
| 保留接续范围 | handler先同步取得原open/taskCreate或完成recover的owner及同一Run/root/context，在原生BEGIN IMMEDIATE内排除同一controller lineage的竞争接续，checkpoint原R的project/prior_controller/Run/root/旧owner/旧generation/stage并提交；发生在异步观察和新PTY之前。pending接续阻止不同R创建竞争helper |
| 原helper退出 | 两次独立新鲜Windows进程表与真实daemon PTY清单共同确认原root/helper精确PID+创建时间已退出、原PTY/incarnation不存在。任一仍活、查询失败、PID复用/身份变化、daemon来源不明均拒绝/6，不终止它们。能够提供全部原生恢复证明的旧helper可沿原身份工作，recover仍拒绝竞争创建 |
| 新helper创建 | 重核原Run仍为旧generation，先checkpoint真实worktree、固定clientIdentity、clientMutationId=R/controller-pty及原生derive所得expected handle。首次started分支仅一次调用现有dedupeTerminalCreate/reconcileExisting=false和真实createTerminal/launchConfig；取得C_new实际PTY/pane/host/incarnation/root/helper PID+创建时间和ready后checkpoint。不调用runCreate或taskCreate |
| 同一Run绑定 | 仅向C_new一次发送版本化内部helper动作，内部目标必须匹配自身真实环境；公开command仍保留C_old。helper仅执行orchestration.runUse({id: 原Run, from: 自身handle}, requestId=R/run-use)，强准入匹配parent checkpoint。保存真实子receipt后核同一Run/root/context、coordinator=C_new及generation严格增加，完成原outer R |
| 同R in-flight/完成 | 复用原executor同payload join与completed receipt；当前HTTP授权和Native caller前置校验保持，不同payload拒绝。request.show对本次recover receipt允许准确C_old或已证C_new，其他controller拒绝；其余历史R仍按原controller/project查询 |
| 同R pending | 仅对swa.controllerRecover扩展现有executor的pending观察分支，沿已有replayedMutationReceipt传原checkpoint。该分支禁止createTerminal/dedupe、terminal.send、runUse、taskCreate和prompt。只有R/run-use明确completed、实际Run/generation及C_new完整当前证明一致、旧owner已退出、root/context不变，才能确认同一个outer R完成；其他保持6/占用。checkpoint之前的unknown也不能用新R替代 |

controllerScope分别解析完成的新owner、历史只读owner和pending接续，不改写首次taskCreate/context。旧controller的新写入拒绝，真实Native consumer fence同时保留；新controller不能task.create第二项用户任务。接续只改变控制权，SDK父Job句柄丢失、资源unknown、输入pending、会话不完整继续保持，不启动替代Worker、重新prompt、释放资源或完成Task。最终close/serve idle检查认可准确completed recover证明的旧owner退出，每个最终新owner仍须completed close；pending recover不能当退休或合法新owner。人类安全stop仍核其原有授权和精确原生资源，无法证明身份的具体停止结果保持unknown。

重启后的daemon可能不属于新serve创建的匿名Job，必须恢复同一个可观察的Job。建议首次serve在spawn前创建Local命名空间的SWAService加随机UUID对象名，ACL限当前用户/SYSTEM，并绑定自身；不设kill-on-close、breakaway或全局限制。实际daemon的既有PID record增加swa_service_job对象，保存name、serve_pid/serve_created_at_ms、data_root/install_root/source_revision和实际session定位值；不新增文件/数据库表。daemon发布字段前用native API核自身成员；内部生命周期公告增加ownership供Go核实际daemon PID/创建身份及Job名，Go不转发ownership到公开stdout，公开readiness三个字段及外层结构保持。

新serve先从规范私有D的实际daemon PID record以标准JSON严格解码；验证旧PID/创建时间、私有来源/session、原serve已退出、同一DataRoot及kernel成员，再OpenJobObject打开原Job并把当前serve加入该同一个Job，随后以真实daemon token/协议握手交叉核authenticated daemon身份。名字只定位，不替代membership/来源/握手。原record精确文件名沿pin的daemon protocol version，Node与Go消费方须检查同一固定版本；不扫描后任选其他代际。记录缺损、对象缺失、权限/嵌套失败、旧serve仍活或身份失配即拒绝并保留原daemon，不改建新Job接管未知状态。只有实际进程和endpoint均新鲜证实私有D没有存活旧daemon/对象成员时，才允许明确的全新启动。node/server/daemon都以真实句柄核在该Job中；关闭沿§7.5原生释放、准确owner关闭、daemon退休/cleanup、直接子进程exit和整个Job两次只剩serve的共同条件，失败保持6/7。

已完整读取Microsoft [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)、[CreateJobObjectW](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-createjobobjectw)和[OpenJobObjectW](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-openjobobjectw)：对象直到最后handle关闭且关联进程全部终止后才销毁，命名对象可重新打开。此为静态API依据，本机实际复开/嵌套仍须§7.6真实测试；失败即真实限制，不提权、装驱动或操作原Orca对象。

#### 3.4.1 recover的CLI副作用与输出边界

recover创建helper并改变consumer，必须同时纳入Go App的orcaAction与ValidateOrcaCommand字段表、Go runtime写动作分类、CLI outputFailure、client/native command enum、durable方法、HTTP/OpenAPI和CLI schema的写动作消费者。只使用既有controller/request_id字段。未完成外部连接沿依赖错误4；输入可能进入实际handler后的断开、不完整响应、超时及实际stdout写失败沿未知6；真实Windows os.Interrupt取消等待沿130。全部路径保留已成功解析的原R及C_old，C_new/Run/root只取已收到的真实回执。stdout只尝试一份envelope；发布或部分写入后只使用stderr诊断和原请求查询。取消等待不自动关闭新helper、改变consumer、停止Worker或释放资源。

#### 3.4.2 方法与阶段的严格准入矩阵

以下矩阵补充前述callback的实际判据：schema/transport准入后，先执行本产品callback，再进入任何legacy route及native executor。默认拒绝。真实launch证明沿原生live PTY/secret commitment、host/pane/incarnation，restored必须另有真实restored receipt及实际attestation；不把秘密证明写入日志。

| 方法/真实阶段 | 前置证明及允许范围 |
| --- | --- |
| 产品swa.*端口 | 实际私有owner transport、真实Go App当前项目/主体/批准、严格invocation/schema和原receipt scope；open/recover可在尚无helper时进入自身outer executor，不能转发调用者选择的原生方法、from或actor。真正orchestration写入仍须下列helper证明 |
| status.get/swa.status及无helper只读bridge | 只读bridge精确限定requestShow/runShow/显式run的taskList/workerShow/list/read，先核当前项目及原receipt/Run-root-Dispatch所属；没有from/evidence不声明helper权限。任何orchestration写入、legacy takeover或隐式current-Run绑定均拒绝 |
| pending open的runCurrent/ready | 必须是该open checkpoint所指真实新PTY/handle/pane/host/incarnation、当前launch及实际helper PID/创建身份/父链。尚无Run时允许真实current=null，不要求已经是consumer，不准其他写入 |
| open完成但taskCreate尚未开始 | 同一完成open的真实当前launch可查询runCurrent；没有pending swa.taskCreate和准确子R，不允许runCreate/taskCreate |
| 首次runCreate | parent swa.taskCreate,R为pending，checkpoint唯一controller及子R/run-create，helper当前launch精确匹配，controller尚未创建另一用户任务。允许尚无Run，只使用helper自身from |
| 首次root taskCreate | R/run-create必须completed，实际Run已绑定该helper；parent的固定spec/context/project不变，子R必须R/root-task，只创建该Run的首根Task |
| pending recover的runCurrent/ready | 匹配原recover checkpoint已取得的C_new真实launch/PTY/PID，旧owner已证退出；允许尚未绑定的current=null，不准runCreate或普通Task/Worker写入 |
| pending recover的runUse | 准确R/run-use、C_new真实当前launch及parent checkpoint同一旧C/Run/root/固定context/旧generation和已证旧owner退出。只绑定该Run，拒绝takeoverLegacy和其他目标，绑定后读取实际新generation |
| 当前consumer普通写入 | 非空真实helper证明、实际当前Run/consumer与完成open/taskCreate或recover owner一致；native方法与R/native匹配真实pending swa.controllerDeliver的动作及Run/root/Dispatch。worker.stop/release虽无from参数，也从真实evidence核caller；缺parent或目标错配拒绝 |
| 原helper恢复 | restored分支必须有真实restored receipt及实际attestation，且原Run consumer仍为该完整身份；缺证拒绝/unknown，不使用当前launch豁免 |
| 任意completed Native R重放 | executor返回completed前仍执行该方法的真实helper及当前consumer检查；首次runCreate/taskCreate子R同时核completed receipt及parent指向的Run/root。旧generation拒绝。纯requestShow只读原件，不赋予写权限 |
| 公开已完成R历史回执 | 当前HTTP/App批准、项目和原receipt关系仍核验，只返回真实历史open/close/recover及replayed来源，不把已关闭helper声明为活owner，不调用helper或原生写入 |

#### 3.4.3 接续保留、首次外部效果与拒绝结算

原生receipt保留、checkpoint和expected handle属于内部结算；首次外部副作用从实际createTerminal开始，后续helper输入及runUse同样属于外部效果。不新增状态表，按下表复用原生executor。

| 阶段 | 实际边界与结算 |
| --- | --- |
| scope-reserved | 原生BEGIN IMMEDIATE保留project/prior_controller/Run-root/旧generation/旧owner，checkpoint stage=scope-reserved并提交，之后才异步新鲜观察；不调用PTY/send/runUse，也不markMutationEffectPossible |
| 明确无外部副作用拒绝 | 两次成功新鲜观察证明旧helper仍活，且尚未进入pty-spawn边界时，返回controller_unverifiable及effectsApplied=false。原生executor按自身effect-free错误规则discardPendingMutationReceipt；仅该结算实际成功才解除本次reservation。读取或结算失败、不确定均保留原件及pending/unknown屏障，不手工删除未知receipt |
| pty-spawn及以后 | 首次createTerminal之前先持久checkpoint expected handle/clientMutationId/stage=pty-spawn，再markMutationEffectPossible并进入既有效果包装。其后异常转换为operation_unknown保留pending，缺少可见PTY不能推断无效果；不同R竞争继续被阻止 |
| pending同R观察 | 不create/dedupe/send/runUse。stage为pty-spawn或后继且缺完成证明时保留6/屏障；只在原R/run-use completed、完整C_new/Run/context/旧owner退出证明一致时完成原outer。明确位于外部效果前且原生规则可结算的拒绝才解除，其余不删除或重发 |

原生executor对非prompt方法的普通异常可能清除pending，即使已经markMutationEffectPossible；因此pty-spawn之后必须使用现有operation_unknown效果包装，不能只标记后抛普通错误。R03/R04的连续序列只有在R_live明确无效果拒绝及原生结算均成功后，才允许在旧helper真实退出后由调用者显式提交新的R_recover；R_live或结算未知时只查询原R。

待准确接口定稿及独立计划接受后，在已有write_paths实施CLI、Go App/adapter及HTTP契约、runtime/swa-orca、pin的dispatcher/options/receipt/daemon PID写读消费方、OpenAPI/CLI schema、测试入口及tests/swa-cli-headless。API类型仍只由生成器在明确窗口更新；主控SSOT只交Handoff，不自行修改。

## 4. 当前Agent与非Aliyun受限正向方案

### 4.1 实际静态观察

| Agent | 本次观察 | 首版适用状态 |
| --- | --- | --- |
| Codex | 已安装0.162.0，当前开发确实运行gpt-6.1-sol。`~/.codex`及当前Orca account home的TOML/JSON白名单解析均为默认OpenAI、chatgpt OAuth、有tokens、无API key | 当前公开原生控制器不能可靠关闭全部原生文件工具；维持受限拒绝。开发会话不充当ToolsOff证据 |
| Claude | 已安装2.1.238；JSON白名单观察到qwen3.7-max与dashscope来源，且含hooks/statusLine | 主控明确禁止调用该配置；不修改全局设置、不自动选择其他模型 |
| Pi | 已安装1.0.1，系统settings只记录版本，系统auth文件为2字节。真实Pi包包含openai-codex provider、chatgpt.com/backend-api、gpt-6.1-sol和原生RPC/SDK | 系统Pi当前认证成功未知。产品私有Pi SDK路径具静态兼容依据，待真实验证 |

只读检查没有输出认证值、账号ID或私有对话。当前Orca终端`terminal show`仅证明实际开发客户端；没有把它作为产品执行或工具准入结果。

### 4.2 复用Pi原生provider和只读OAuth

准确接口来自`P:dist/index.js`导出的`ModelRuntime`、`DefaultResourceLoader`、`createAgentSession`、`createAgentSessionRuntime`、`SessionManager`、`SettingsManager`、`runRpcMode`，以及对应`.d.ts`、`docs/sdk.md`、`examples/sdk/13-session-runtime.ts`。采用产品`Pi SDK 1.0.1`入口，调用真正的`runRpcMode`；不仿造pi CLI、不手写Pi原生协议或模型HTTP。

`P:node_modules/@earendil-works/pi-ai/dist/providers/openai-codex.js`使用原生`openai-codex-responses` API及`https://chatgpt.com/backend-api`；其catalog文件`providers/data/openai-codex.json`包含`gpt-6.1-sol`。OAuth来源`auth/oauth/openai-codex.js`具有真实OAuth flow与toAuth，使用access bearer；产品不变更endpoint、provider、账号或模型，未通过就返回具体错误。

只读CredentialStore是该SDK明确允许注入的基础设施端口，执行以下规则：

1. 仅从明确选择的当前Codex account home读取原JSON，并使用成熟`jose 6.2.3`解析JWT有效期和必要标准声明，禁止手写split/base64 parser；该版本和integrity已在准确Orca的`pnpm-lock.yaml`找到，复用其pin并列为直接实施依赖。TOML使用`smol-toml`，JSON使用标准解析器。JWT解码只解释已获准原件中的过期字段，不替代提供方的签名/认证判断。
2. `read/list`仅向同一`openai-codex` provider返回真实OAuth字段及非秘密元数据。原access/refresh/account字段保持来源，expires来自真实标准声明；不伪造有效期，不把OAuth改称API key，不创建可写认证副本。
3. 每次read先核真实有效期足以覆盖本次最长请求和SDK五分钟刷新界限；不足或无法解释即在模型请求前拒绝。read按当前原件取快照，不刷新、不撤销、不写回本机登录。
4. `modify/delete`立即抛出明确只读错误，**不执行传入的callback**。原生`auth/resolve.js:resolveStoredOAuth`只在`credentials.modify`的callback中调用`oauth.refresh`；`models.js:resolveRefreshCredential`亦如此。两条路径都在网络刷新之前被拒绝；不能先refresh再阻止保存。
5. `ModelRuntime.create({credentials, modelsPath:null, allowModelNetwork:false, refreshOnCreate:false})`注册SDK自带的静态catalog对象，不执行初次catalog/auth refresh；这些随包元数据的注册仍涉及全部内置provider，不宣称已经移除它们。后续只调用真实`refresh({providers:['openai-codex'],allowNetwork:false})`：源码明确分支只更新该provider的catalog及`refreshProviderAvailability`，其getAvailable/checkAuth/credentials.read均限定该ID；不会进入全量queueAvailabilityRefresh/credentials.list。检查aborted、errors、getError，任何错误立即失败。再显式`getModel('openai-codex','gpt-6.1-sol')`及该模型getAuth，核实际OAuth来源和模型身份。产品不探测其他provider的环境/云账户，不调用全量get_available_models，也不把静态catalog注册说成实际认证通过。
6. 原凭据自然被原有Codex更新时，下次read校验同一来源与当前授权。产品不写原auth，不复制刷新权；解析错误保持失败。后续产品长期登录能力另行设计，本次可通过重新读取仍由原客户端正常管理的当前有效access继续获准固定任务。

### 4.3 工具、扩展、输入和实际完成

使用公开`createAgentSessionRuntime(factory,{cwd,agentDir,sessionManager})`。该函数真实调用factory并用返回的session/services构造原生AgentSessionRuntime。factory按以下顺序执行，所有路径均显式私有，不调用`createAgentSessionServices`：

1. 宿主先在SDK子进程的独立launch env中把`HOME/USERPROFILE`设为该Worker的`<DataRoot>/workers/<实际Dispatch>/home`，`PI_CODING_AGENT_DIR/PI_CODING_AGENT_SESSION_DIR`分别指向其私有agent/session目录，`PI_PACKAGE_DIR`固定随包SDK根；拒绝从调用者继承这些选择值。只修改传给真实子进程的env map，不给当前PowerShell的`$HOME`赋值，不修改父进程、用户或系统环境。原Codex认证通过已获准的唯一显式绝对路径只读访问，不依赖这些私有home去查认证。
2. 用上述显式选项创建真实ModelRuntime；`SettingsManager.inMemory`提供固定设置，packages和各资源路径为空、`defaultProjectTrust:'never'`且项目trusted=false。
3. 直接`new DefaultResourceLoader`并`await reload()`；`noExtensions/noSkills/noPromptTemplates/noContextFiles/noThemes`均为true，additional资源和extensionFactories为空。非空固定systemPrompt及`appendSystemPrompt:[]`在原生discovery之前阻止SYSTEM/APPEND发现；不用加载后的Override过滤器承担准入。核实际扩展和pending provider/native/virtual registrations为空，非空立即失败。
4. 仅执行§4.2的provider定向refresh并检查真实返回的errors/aborted/auth snapshot，取得并验证固定model及真实getAuth；没有选定OAuth或来源变化则在首次prompt前失败。原生`isUsingOAuth/hasConfiguredAuth`来自该次真实定向snapshot，不填假状态。
5. 构造符合公开`AgentSessionServices`接口的对象，字段为实际cwd/agentDir/modelRuntime/settingsManager/resourceLoader/真实diagnostics；调用`createAgentSession`并显式传全部真实对象及固定model/thinkingLevel、sessionManager、sessionStartEvent和空工具参数。`sdk.js`在已有modelRuntime/resourceLoader/model时不创建默认来源、不reload、不寻找默认model；modelFallbackMessage或诊断错误立即失败。factory返回真实session结果、同一services和diagnostics，由原生runtime接收后运行真正`runRpcMode`。

`P:dist/core/package-manager.js:resolve/addAutoDiscoveredResources`在resource-loader的noSkills等过滤前执行，其中用户`.agents/skills`来自`getHomeDir()=process.env.HOME||homedir()`；因此空settings和noSkills本身不表示没有发生目录发现。上述真实子进程env把该消费者也导向空的私有home；`config.js:getAgentDir/getPackageDir`同样使用明确的私有目录与随包资源。T04在首次prompt前核子进程这些非秘密解析路径、真实资源来源列表及对应source调用闭包，任一解析到本机用户资源根立即失败。

该组装没有改写依赖或替换refresh；定向refresh执行真实SDK逻辑，services包含真实已加载对象。后续允许的prompt继续走同一modelRuntime及只读store；会话替换等非白名单RPC不开放，factory本身仍保持相同限制。只读公开项目输入由Workspace固定提供，不继承项目本地配置。

`createAgentSession`传入`noTools:'all'`、`tools:[]`、`customTools:[]`。源码`dist/core/sdk.js`把此组合转换为空allowlist及空active tools；`DefaultResourceLoader`不加载扩展/MCP。启动与每次输入前检查原生`session.getActiveToolNames()`为空、注册工具集合及resource列表为空，并从实际请求前原生session状态核对。仅零工具调用次数不能通过该检查。

禁用agent retry、provider retry、autoCompaction、cacheWarming，transport固定`sse`，拒绝modelFallbackMessage及任何模型身份变化；这些来自已读取`docs/settings.md`的真实设置及对应SettingsManager。原Pi API的默认transport auto与retry设置不沿用。内部RPC只允许`get_state/get_messages/get_session_stats/get_last_assistant_text/prompt/abort`六项；不向外暴露`bash`、全provider枚举、任意工具启用、任意model切换或session目录选择。原Orca Pi options查询依§4.2改为仅当前真实state，不能冒充已进行全provider动态catalog核查。

`P:dist/modes/rpc/rpc-mode.js`的`bash`可直接执行命令，不经过模型tools。因此六项白名单必须在产品父进程持有的真实`JsonlRpcAgentConnection.request/send`写入边界校验；SDK原生stdin/stdout仅交给该owned父子管道，不绑定网络端口、不接受CLI原始RPC。外部输入只能进入严格参数schema的`prompt.message`，绝不把任务正文解释为RPC envelope。违规type/extra字段在向子进程写入前失败；不合成一个看似Pi返回的拒绝帧。

已读取原生`rpc-session.ts`和`rpc-session-adapter.ts`，必要消费者逐项适配为：

| 消费者 | 产品允许的原生调用与处理 |
| --- | --- |
| `PiRpcSession.start/readOptions`、`rpc-options.ts` | 保留get_state，核实际provider/model/sessionFile；移除全量get_available_models/get_commands及保存选项的set_model/set_thinking_level恢复，初始模型/effort由SDK显式固定。变化立即拒绝，不吞错写skipped |
| `rpc-turns.ts`、`rpc-context-usage.ts`、`rpc-idle-check.ts` | 保留prompt、get_state、get_session_stats的真实发送/事件对应和idle检查；结果读取可用get_messages/get_last_assistant_text，均经同一白名单 |
| `cancelTurn/awaitStoppedRequestEnd/closeSession` | 保留abort、get_state及真实ChildProcess root/tree close证明；不增加bash式停止命令 |
| `rpc-compaction.ts`、dialog callbacks、option写入口 | 首版明确不提供compact、工具/模型变更或extension UI回复能力；native capability中返回不支持，unexpected扩展事件立即失败。保留已有turn、journal与退出处理，不重写原生RPC |

SDK的`getActiveToolNames()`及工具allowlist为空，与传输动作白名单分别验证；其中任一缺失都不能记ToolsOff通过。

隐式模型请求采用原生真实设置显式关闭，memory settings包含：

```json
{
  "cacheWarming": "off",
  "compaction": { "enabled": false },
  "retry": { "enabled": false, "maxRetries": 0, "provider": { "maxRetries": 0 } },
  "transport": "sse"
}
```

已核实际调用顺序：`SettingsManager.getCacheWarmingMode`未设置默认streaming，`sdk.js:streamFn`每次调用CacheWarmer.start；`cache-warmer.js:start`在mode=off时于创建run/timer之前返回，因此不安排一token暖缓存重放。`agent-session.js:_willRetryAfterAgentEnd`在retry.enabled=false时返回false，`_checkCompaction`在compaction.enabled=false时于overflow恢复和agent.continue之前返回false。`sdk.js:buildRequestOptions`把provider.maxRetries=0传入`api/simple-options.js:buildBaseOptions`，再到`openai-codex-responses.js`的SSE循环，只有attempt=0一次HTTP调用；流异常保持真实error/unknown。transport=sse在进入WebSocket分支前即绕开其缺失continuation重发及WS/SSE切换，不依赖默认auto。所有新会话和原生接续均使用同一memory设置，不从session或用户文件恢复这些开关。

T04必须读回上述实际设置和`session.cacheWarmingStatus`的inactive/disabled状态；T06/T14核断开/失败后的真实请求及provider事件，没有auto_retry/compaction/warm再次请求。无法观察请求次数时相应证据保持不足，不能仅凭最终一条assistant消息声称没有重放。

Orca的原Pi launch仅允许fullAccess；产品Pi SDK composition以真实noTools状态替换该准入，明确标注适配差异，不能将fullAccess布尔值置true来通过原检查。保留原生Orca structured session/journal/fence及Pi session文件，双方记录provider session ID与原native事件。

工具关闭的Worker只输出任务结果，不执行Orca命令。产品preamble明确结果由宿主读取，不要求worker_done。`agent_settled`证明本轮原生执行结束；结构化结果及固定事实检查通过后，实际控制helper调用workerStop并核全树退出、原生归档/释放，再用自己的consumer执行taskUpdate。任意缺失不生成假worker_done、假hook、零费用或人类批准。

### 4.4 关闭工具时后续正文的完整投递提案

本节及§7.7按原Reviewer1b2954d9的七项独立条件、主控msg_0458b95cccf2提交审核，尚未定稿或实施。公开worker.send命令及原生send枚举保持；正文作为文本，沿同一原生MessageRow、structured mailbox、session operation和原Pi RPC进入同一Worker。其他原生宿主和本机Orca继续使用原pointer规则。

产品composition在RuntimeConstructionDependencies注入可选的structured mail策略，经runtime-service-state交给原structured投递及host。没有产品策略的宿主完全保持现有行为；本产品启用后不允许回到pointer或另开直接prompt路径。策略只处理真实Pi Worker的确切Run/root/Dispatch/session，不处理协调者邮箱、其他项目或其他provider。每次原生选择仅取一封邮件，沿原SQL顺序及waiter/reservedTypes规则；一次operation对应该真实message ID和一个原样body，不能格式化后把同批其他消息一并标记已投递。

| 边界 | 本产品策略与真实来源 |
| --- | --- |
| HTTP/App提交 | 当前原主体、Grant、settings revision、start批准、目录及外发目标按现有authorize复核。原swa.controllerDeliver checkpoint为worker.send补实际caller、准确Dispatch和input的path/version/完整text，保存在既有原R记录；不写令牌、不另建表。固定子R/native、真实controller consumer与项目/Run/root关系保持 |
| Native消息关联 | 原生send-point-to-point在nudge前已调用recordReceiptForPostCommitNudge完成原生子receipt。策略要求该completed R/native内message.id与所选MessageRow一致，parent原R为真实pending/completed worker.send；父子原件、真实from/to/run/type=status、批准text及实际Dispatch-assignee-session逐项相同。只凭subject/type或声明handle不放行，缺关联不读取其他邮件或替代Worker |
| 当前授权复核 | 原HTTP服务增加仅私有服务owner可调用的只读delivery-admission路由，复用Go App authorize及真实项目/Grant/当前settings和Native scope；不发起执行。serve以crypto/rand生成本次内存owner capability，只通过分别创建的Node/server env注入，普通helper/SDK env明确删除，不写文件、日志、receipt、命令参数或公开readiness。路由仅本次私有服务注册，固定loopback地址、不跟随重定向、恒定时间核capability，只返回授权结论。Node策略在排队前和原host beforeRun的实际消费边界分别调用；HTTP缺失/失败/撤销/过期或revision变化即不发送，原件及未知状态保留。该内部路由、App消费方及能力传递作为本提案共同审核，普通HTTP调用者不能声明caller取得该权限 |
| 实际目标和消费 | 每次授权复核后立即重新核原consumer generation、Dispatch资源仍由Agent持有且未停止/释放、原runtime epoch、同一原session及expectedRuntimeFence；beforeRun继续保留原hasActionablePrompt的held规则。任何目标/fence变化不换新值重发。当前runtime无法证明恢复的旧SDK仍保持unknown/占用 |
| SDK正文 | AgentJournalMessageItem仅一个text block，其text严格等于实际MessageRow.body，不添加提示、标签、trim或换行规范化；原生from保留真实message/Run/Dispatch来源。原preparePiRpcPrompt把该block送入真正SDK。固定model/provider、ToolsOff、资源关闭及六项RPC白名单继续在每次输入前核查 |
| 编码和边界 | 原App输入必须实际有效UTF-8、非空，保留完整path/version/text。既有client单次序列化输入2MiB及Pi成熟preparePiRpcPrompt的8MiB-1 wire限制保持；在Native消息创建前对真实最终文本/序列化帧使用成熟JSON与原Pi准备函数核边界，超限明确拒绝，无新消息或模型输入。实际MessageRow坏源、非完整Unicode或不等正文拒绝，不截断；JSON样式文本只作为字符串，由标准JSON编码 |

owner capability只用于同一私有HTTP服务的授权查询，不授予调用原生执行的权限；服务重启生成新的内存值。排队的原生turn在服务暂不可达时不能通过授权复核，不能为完成输入在其他地址、其他runtime或其他Worker重放。该复核调用不持Native数据库事务；Go App只读取得当前项目/Grant和明确Native scope，返回后Node再次核原fence及所属，避免等待期间目标改变。

持久去重必须同时覆盖公开R、原生消息和真正session operation。原pointer的decideStructuredPointerAttempt可因另一次turn、进程变化或过旧而mint新operation；这只证明原通知需要再提示，不能证明正文未输入。产品策略对同一message/session的既有operation禁止因此mint：accepted按原记录标记原消息；pending/unknown、旧runtime、缺operation的实际输入结算证据均保留原operation/占用并只读查询。明确rejected也只返回原失败，不自动产生新operation。只对从未保留operation的新消息首次使用原生mint及既有operation表；不存在新账本。context clear、同一ID正文变化或投影缺失不得换operation掩盖未知；真实host的原operation/payload匹配继续生效。

沿原structured host的sendAgentTurn、operationId、expectedRuntimeFence、beforeRun和queue接受规则提交；不直接调用SDK prompt。busy/held未写入SDK时保持消息未投递，原生queue已接受只表示排队；accepted来源明确后才表示SDK实际输入，turn started/settled由真实journal/SDK事件独立观察。原生投递标记继续只在原host已接受或队列持有后进行；输入后存储/通知失败不清除原operation或重新发送。worker.send结果保留原message receipt，并以原operation/journal来源区分message持久化、queued、accepted、unknown，不由envelope.ok推断模型已开始或完成。未知继续查询原R/原operation，无自动重试。

实施范围为现有runtime/swa-orca、pin的runtime construction/structured delivery/host/operation消费者、cmd/swa/serve、cmd/server、既有Go App/HTTP适配及实际测试；HTTP契约的内部路由及必要结果字段按同一后继明确更新，API类型仍只由原生成器在获准窗口产生。本节新增语义与内部接口接受前不编码；Go独立编译及其他已审真实驱动可以继续。

### 4.5 本机注册Agent发现与原生调用的调整提案

主控msg_b71b0529001c和当前main QUESTIONS的“本机注册Agent与依赖抽取”明确要求发现本机注册Agent，并由Swarm CLI调用这些真实Agent。当前程序仅注册Pi且强制SDK/model，尚未满足该要求。本节及§7.8是完整调整提案，依原Reviewer2593eb28的G01—G08先审后定稿；当前工具/资料/供应端点权限保持，相关新接口未实施。§4.2—4.4记录既有Pi实现和未定稿正文提案，不能作为新范围的替代验收；T12及正文接口须结合选定的真实原生Agent路径再核。

#### 4.5.1 准确来源及既有REA范围

已完整读取根`.verification/rea-orca/evidence-summary.json`及`startup-trace.json`。focused Evidence为`ev_c9cc8212af2b3b0ceb94199bac8fcec4775269e7f04272593e2e4d321d6ada8c`，root摘要6d2cbf63，选定12个JS含tui-agent-config，未选1963文件；ASAR Evidence为`ev_0159c976d48ea721c101a8d95acbb071c4b0ad25a39e2b09e755f06729e5c43e`，root摘要0c17a376，未选4280文件；startup trace为`ev_15961175dc22bbd52cec2f8d701c88f6c232b155b78282b0bdeac817167c9ba1`，只有一个renderer IPC seed、没有后继边。摘要不是43MiB/182MiB完整Evidence，不能据此证明当前注册、完整依赖或执行。

主控msg_8daabc14f03b已新鲜确认本机app.asar的SHA256为`6a9bd9614a884f6172aa22029227a95dde1f25cd86651dfbb7998f25a81d6077`，与旧两目标不同。主控msg_910570820bf0交付当前限定REA的实际EXIT0及Evidence `ev_7003a444cd2970c2d3ace2427c883c461f6a1ec67b9dfdbe9be6528e775726d3`；Worker已按标准JSON读取其summary必要字段和inventory identity：实际目标为`C:/Users/DW/AppData/Local/Programs/orca/resources/app.asar`、1.4.230、上述完整SHA，库存5861项。选定package.json及TUI配置/检测/default/启动设置、CLI launch request/handler共6个JS，5051相关文件未选，graph coverage为partial、非截断，静态解析不执行bootstrap。没有读取/打印97MB完整Evidence或semantic大量unknown_ids，不把本次局部证据当完整注册/调用/依赖验证。Worker不重复REA、doctor/setup或网络；原S按主控restore-06恢复57400，当前无动态窗口。

现有b2879bd5准确源码只作为已知静态来源，后继逐项核新交付物的CLI/RPC注册、Agent发现、原生启动/身份/输入/输出/停止和动态依赖，差异在原抽取写域返修，不以同版本号推断等价。当前库存中已核确实存在`out/main/chunks/structured-agent-runtime-registrations-2J5v5KAv.js`、`out/main/chunks/tui-agent-config-YahPkHxK.js`及shared的agent-session-registered-agents/capabilities/account-home、tui-agent-launch-command/override/defaults、agent-detection和rpc-contract/preflight-params/agent-launch-params。它们是后继限定核查注册→配置→实际启动/账号/协议的具体候选，不把文件名或存在性当已分析结论；具体再选由主控安排。

已核的源码边界：`agentSession.agents`从真实STRUCTURED_AGENT_RUNTIME_METADATA返回definition/adapter声明，不核安装或登录；原O与本次静态产品catalog包含Pi/Codex/Claude/ACP，尚未由新安装候选运行核实。`settings.getAgentLaunch`只读调用projectAgentLaunchSettings，返回default/disabled/command override/default args及environmentNames，明确不返回环境值。`preflight.detectAgents`沿真实平台、PATH/安装目录检测，不能证明配置或启动；其shell hydration可能改变被调用宿主的进程PATH，发现方案不在原Orca调用该刷新入口。现有workerStart→resolveWorkerConfiguredAgentParams→原生launcher负责所选Agent与命令别名，不用自写字符串parser。产品Go Registry.List的四个adapter同样只是程序注册，不等于本机四个Agent均可调用。

#### 4.5.2 发现事实源、输出及刷新

继续使用现有`swa capabilities --json`提供agents清单。structured注册来自产品进程中由抽取的原生definition及真实adapter实例构造的StructuredAgentRegistry；terminal注册仅在该真实TUI配置键及本产品已接入的原生PTY launcher/controller同时存在时列出，source分别标明structured-registry或tui-launcher，TUI常量本身不产生结构化注册。这证明本产品实际注册的控制实现，独立于原Orca是否运行。实际本机命令、原生配置与可选只读启动设置分别提供安装和选择事实。原Orca runtime只作可选对照，不成为发现、选择或执行前提。每行保留真实Agent ID、注册来源版本/宿主、可核命令定位和以下独立观察，使用available/unavailable/unknown及实际原因/时间，不合并成一个就绪布尔值。

| 观察 | 事实源与判据 |
| --- | --- |
| registered | structured取私有runtime真实StructuredAgentRegistry.registrations及definition/adapter，原构造器仍核重复ID和所需方法；terminal取实际TUI配置与已接入原生PTY launcher/controller的共同绑定。公开来源明确标本产品抽取版本/私有runtime及两种registry类型，原Orca可选对照另列。用户启用/禁用/override来自下述明确设置源，disabled不当可选，不从Go List或TUI常量补造adapter |
| installed | 在产品自己的探测进程复用准确TUI检测/命令解析，核真实Windows PATH/已知安装目录、命令别名和override的实际可执行路径及版本来源。不得修改系统或原Orca PATH，不启动WSL/SSH、安装程序或模型。文件存在仅证明安装 |
| configured | 该Agent实际必要的本机原生配置/账号来源和明确选择的启动设置；可选Orca profile按只读settings domain及真实revision取得，再用projectAgentLaunchSettings投影，不创建Store或调用update/migrate/authority-marker写入。environmentNames仅证明名称声明；缺值/模型/端点/账号正向证据继续unknown，认证有效性由真实原生握手或获准模型调用分别确认，秘密不进入清单 |
| launchable | 对明确选择且满足当前权限的该Agent，在私有profile/workdir中执行真实命令与原生协议握手后记录；不由版本/help或另一个SDK成功推导。尚未启动时unknown，ToolsOff/隔离无法满足时明确unavailable及原因 |
| native control | 分别记录start/send/read/stop/resume、原生session/turn/输入结算/树退出及工具关闭能力。声明、静态来源和本次真实验证分别标记；一种能力成功不补齐其他能力 |

设置源在serve时明确：未提供可选`--agent-profile <既有原Orca profile绝对路径>`时，使用抽取原生注册的标准命令/defaults及本机Agent自己的实际配置；提供时固定该既有profile，复用classifyProfileStateStorage、openProfileStateDatabaseReadOnly/readProfileStateDomains读取settings和revision，JSON-only仅用成熟JSON流选择settings，SQLite与legacy并存时核原acceptance。明确选择的源缺失/损坏/不匹配即失败，不迁移、不写入或改用另一源。保存的是源定位及非秘密投影，不复制整个profile或原会话；产品私有profile始终单独创建。

每次capabilities在产品进程重新读注册、明确设置源和必要原生配置并解析程序，不启动Agent或访问模型来刷新。每次worker.start在App选择后和实际spawn前分别读取并比较该请求的真实配置revision、命令路径/版本及所选模型；期间变化拒绝原R，不换目标。同R仍按原生receipt比较完整非秘密selection及正文；完成/pending原R查询保持可用。原Orca侧的可选对照只允许必要只读查询，不调用settings.mutate、launch/send、账户切换或hook安装；没有对照结果不影响独立发现。

#### 4.5.3 选择、原生调用及权限边界

现有worker start的agent/model字段改为明确选择清单中的真实Agent及其准确原生模型选项；Go App、HTTP/CLI schema、runtime invocation/helper、原生launcher及结果读取同步更新。调用必须匹配已发现的Agent ID、准确命令/版本、账户来源和当前配置；没有已证模型选择时拒绝，不自行选默认模型。发现信息不是权限：每次启动/后续输入/停止/恢复仍核当前项目/Grant/settings、目录、外发目标、真实controller consumer、Dispatch/session/fence及原R。

优先复用原Orca各Agent现有原生adapter与共同agent-launch-executor/workerStart控制链，按当前交付物核完整消费者；structured/TUI只取该Agent实际获准的一种方式，不在失败后换方式。已安装Pi必须使用该本机Pi真实CLI及原生RPC；随包Pi SDK的另一个模型会话不计该Agent调用。Codex沿真实app-server，Claude沿真实原生控制，ACP/TUI沿其实际注册adapter；缺必要协议或状态证据的Agent保留发现记录并明确拒绝相应动作，不伪造协议或用Pi替代。后续输入、取消和成果按各Agent自己的准确原生协议与自产原件核验，Pi六项RPC白名单不能套用于其他Agent。

权限要求由真实项目ProjectSettings.AllowedTools/AllowedActions、Grant及当前任务已批准范围进入既有ValidateProjectActionScope，产品接口保留各Agent的真实能力，不把ToolsOff写成所有通用调用永久拒绝。原固定验证任务的工具关闭条件及用户通用调用如何共存由主控核原决定，未答部分不推断授权。既有Codex0.162.0公开app-server没有已证关闭全部原生文件/命令工具的能力，read-only sandbox不等于ToolsOff；Claude当前qwen3.7-max/dashscope仍有既有调用禁令；Pi系统认证历史拒绝不能由私有SDK读取Codex OAuth替代；OpenCode1.18.35的managed/wellknown输入、扩展及当前模型/账号仍待复核。每项是具体任务/能力/权限的真实限制，不代表永久取消该Agent的原生调用接口；主控处理准确冲突，发现加拒绝不能作为完整调用交付。

每条允许执行的路径只创建本项私有home/profile/config/SQLite/session/cache/端口/IPC与所属Job。原生账号解析若会写原home、workspace trust、hook或刷新原认证，须在首次输入前拒绝，不能把原home设为可写运行目录。只读必要凭据/配置的允许方式由准确Agent方案及既有授权核定，不复制可写refresh权、不替换账号、认证或原会话。当前未证明满足这些条件的路径如实保持阻塞；不降低最终双Worker验收。此前SDK父持Job、真实进程身份/子树退出、未知占用及原Orca定向保全可复用，但要对实际所选Agent重新验证。

#### 4.5.4 依赖闭包及产品调整范围

依据准确REA/源码和实际esbuild metafile保留CLI/RPC、Agent注册/选定原生adapter、原生receipt/Run/Task/Dispatch、PTY/daemon、provider进程、真实journal/SQLite、secret保护及所属进程必需的文件/资源/许可。静态未连边不作为删除依据；动态import、worker/sidecar、native ABI及通过字符串定位的资源逐项由真实入口核实。当前runtime package声明包含桌面UI、浏览器、更新和多个供应方依赖，build-swa-runtime还列若干未证明执行所必需的worker入口；需要按实际闭包核消费者后在同一原写域去除不需要的入口/声明，并由独立安装发现遗漏。成熟JSON/JSONL/TOML/YAML/SQLite及必要native库保留，不手写解析器替代。

产品安装继续自带自己的必要Node/native与后台模块；本机Agent程序及已允许只读账号是明确外部依赖，按发现的准确路径使用，不重复打包另一份Agent来冒充本机调用。发现/调用不连接原Orca桌面RPC，不依赖其进程、安装资源或开发树；原profile只是调用者明确选择的可选只读设置源。安装独立性测试以明确PATH/env执行同一候选，省略原Orca metadata/IPC环境并检查实际模块/动态资源来源，不修改全局PATH或停止原Orca。

现有CLI envelope/错误退出、真实R/selector、HTTP/App权限、Native幂等/事务、定向保全、Job与Go检查可以继续复用；Pi-only验证、SDK账号来源和原生结果解析需要按本节调整。当前新增程序建议仍在已授cmd/swa、Go App/orca/HTTP适配、runtime/swa-orca、third_party、现有contracts/依赖/构建安装/真实测试及原两报告；若需要修改其他Agent模块，只向主控交Handoff申请准确路径，不越域。主控先定稿注册来源、实际Agent支持集合和冲突权限，独立审核通过后更新SPEC再实施，当前不提前编码新接口。

#### 4.5.5 端到端技术契约提案

`capabilities`沿现有POST `/api/v1/local-projects/{id}/orca/commands`、`{action:"capabilities"}`及真实项目token进入Go `OrcaExecutionService.ExecuteOrca`，仍为observe权限、无副作用R。App消费现有OrcaExecutionRuntime，新增只读`Capabilities(ctx, projectID, requirements)`端口由现有orca适配器调用私有`swa.capabilities`；它从已构造真实registry、只读设置源和本产品命令解析返回，不经过controller helper、原Orca RPC或模型。主控批准的任务要求由App取当前ProjectSettings/Grant提供，HTTP正文不能提供caller或工具授权。

结果仍在原OrcaEnvelope.result，DTO固定为`{schema:"swa.capabilities.v1", source_revision, registry:{orca_version,artifact_sha256}, discovery:{host:"local",platform:"win32",observed_at,settings_source:{kind:"native"|"orca-profile",path?,revision?}}, agents:[{id,adapter,execution_mode,registered,enabled,installed,configured,launchable,control,requirements}]}`。registered/enabled/installed/configured/launchable和control中的start/send/read/stop/resume/tools各使用`{status:"available"|"unavailable"|"unknown",reason,checked_at?,source}`；installed正向才带executable/version，configured仅带已证model/provider及非秘密account-source类型，不填造账号/认证。requirements保留当前批准工具/目录/外发要求及该Agent的缺口；声明capability与本次观察通过source区分。

现有Go runtime的Target()实际硬编码返回pi，App把该值传入ProjectActionScope.ExternalTargets，真实适配器检查也断言pi；这三个消费者必须一起改。新增只读`ResolveSelection(ctx, projectID, command)`返回非秘密`AgentSelection{agent_id,adapter,execution_mode,executable,version,model,provider,external_target,settings_source,settings_revision,configuration_version}`，来源仅为当前真实注册/必要配置及命令解析。`external_target`使用现有批准所针对的真实CLI ID，不能仍为pi或由HTTP正文填写；模型/提供方同时绑定实际选择，未证来源立即返回能力/配置不足，不启动Agent。

App先按observe核项目并解析selection，再按既有start/目录/工具和selection.external_target执行authorize/ValidateProjectActionScope，才把selection加入严格invocation交Native。ProjectSettings.ExternalModelCLI继续现有明确批准的单CLI语义，不扩成默认允许所有Agent；不同选择不匹配时拒绝，用户明确更改批准后再执行。worker.send从该实际Dispatch的原启动receipt/session取得原selection并复核当前来源，不能用新CLI参数换Agent/模型。selection进入既有R的比较/原checkpoint，只含稳定源revision及实际程序/模型信息，不包含observed_at、凭据或另建hash/快照账本；spawn前再核相同事实。CLI解析/HTTP strict schema、Go interface/authorize/adapter Target消费者、runtime invocation/helper/Native parent及真实检查的固定pi断言均按同一契约更新，停止/释放和人类安全停止仍沿其原权限语义。

| CLI/当前App动作 | 产品Native方法、真实caller及持久来源 |
| --- | --- |
| controller open / task create | 保持swa.controllerOpen,R及真实helper launch；task.create保持swa.taskCreate,R→helper自身runCreate R/run-create、root taskCreate R/root-task。同一Run/root/context和strict caller保持 |
| worker start | App核start/模型/目录/外发与选择，swa.controllerDeliver,R保存真实selection及原scope；helper以自身真实兼容证明调用orchestration.workerStart,R/native，仍为spec/from/run/parent/worktree/name/agent/model及该原生Agent已核选项。原native launcher根据实际adapter执行选定本机程序，首次输入前重新核selection和policy；不固定Pi或xhigh，不接受原始shell/RPC参数 |
| worker send | 复用parent swa.controllerDeliver,R及当前实际helper；helper以准确R/native调用私有durable swa.workerSend，schema只接受原invocation及准确Dispatch。准入在executor前核真实helper/current consumer、parent原R批准text和目标。handler按固定execution_mode分支：structured从Dispatch取实际私有session/fence及原生mint operation，terminal取实际handle/PTY/incarnation及R/native write关联；先在原receipt checkpoint持久保存实际模式/操作/正文来源，再各调用一次原native host queue或普通terminal writer。不经mailbox pointer、不直接SDK、不另建队列，无session的目标不进入StructuredHost |
| worker show/list/read / task result | 先核项目和Run/root/Dispatch真实所属，再用既有native worker观察及所选definition的sessionHistory/transcriptImport/native journal提供原件。完整成果按实际provider原schema读取，来源缺失/截断明确incomplete；不把Pi解析器套到其他协议，不回到terminal tail声称完整 |
| worker stop/release / task complete | 沿现有orchestration.workerStop/workerRelease/taskUpdate及R/native；依实际adapter/Job/树退出/ownership结算。当前helper原生证明、当前Grant、安全人类stop例外及释放条件保持 |
| request show | 现有原R只读查询，不调用helper写入。worker.send从原R/native checkpoint/完成receipt取得固定执行模式及操作关联；structured读取唯一session/operation与原journal，terminal读取原R/write receipt及实际终端关联。历史receipt原样保留，动态delivery观察另列，不将completed R当再次发送许可 |

当前RuntimeClient只对orchestration.*自动附兼容调用证明；因此本产品fork须将准确`swa.workerSend`加入同一envelope/contract-version路径及durable方法集合，沿constructor捕获的真实helper launch证据生成compatibilityInvocationId=R/native。没有新caller参数或信任布尔值。Native dispatcher的产品callback在任何executor/完成R重放前对该确切方法执行helper强核验，父R、当前consumer、真实launch/恢复证明及Dispatch目标全部匹配；不能把它按普通helperless swa.*端口放行。其他宿主未注册此方法时仍无该入口，本机Orca不修改。

swa.workerSend是非prompt原生mutation，现有executor对普通异常会discard pending，即使已经markMutationEffectPossible。因此本方法必须在child自身包住首次可能输入效果及后继结算，不只依赖parent的effect包装。先在原R/native的receipt持久保存精确execution_mode/目标/实际Native operation及正文来源，再checkpoint stage=input-submit，markMutationEffectPossible，才进入一次host.send或一次terminal writer；任何该边界之后的异常、失联、超时、journal/回执写失败均转换为operation_unknown，保留原child checkpoint/operation与parent占用，不重mint或重发。外层executor再次完成回执失败时，handler已通过现有recordMutationReceipt先持久完成实际结果，不能让普通异常删除唯一关联；持久失败本身亦沿operation_unknown退出。

效果之前的明确拒绝单独结算：已正向证明目标/权限/能力不符合且尚未进入input-submit时，使用既有recordMutationReceipt完成该原R/native的真实`state=rejected,effects_applied=false`拒绝结果，再立即返回该拒绝，parent保留同一拒绝原件并完成；CLI据实际code输出失败，不进入host/PTY、不释放Worker资源。该拒绝的存储失败保持unknown/pending，不自行清除。读取失败或缺少“尚未输入”的正向事实不能按effect-free拒绝结算。进入input-submit后即使原生返回明确refused，也保留原operation及真实拒绝结果，不删除关联或改发新请求。前executor的真实拒绝沿其原错误语义；不能借伪造effects_applied绕过caller或原生结算。

execution_mode固定为原生的structured或terminal，并进入selection及Native receipt。产品按实际create-support与声明模式解析；原agent-launch-mode的设置偏好可降为terminal，产品在输入前必须核最终实际mode仍等于selection，不能沿降级改变模式。具体控制路由如下。

| 模式 | 真实注册、输入/观察/停止及接续 |
| --- | --- |
| structured | 原StructuredAgentRegistry与真实definition/adapter；workerSend从Dispatch取准确session/fence，原生mint operation写R/native后经sendAgentTurn的structured-session arm及同一host队列。原session journal/provider原件读输出，stop/release核该实际provider与Job，resume只按原definition的真实支持/原session来源。实际serialized handOver异步授权后再adapter.dispatch |
| terminal | 原TUI配置与实际原生PTY launcher/controller共同绑定；workerSend取Dispatch准确terminal handle、PTY/incarnation/创建身份、原Agent识别/正向readiness，经原runtime.sendTerminalAgentPrompt的普通agent-prompt路径及原R/native固定write关联发送。sendAgentTurn的terminal arm只有dispatch-preamble purpose，后续正文不冒用该purpose。复用既有串行/bracketed-paste/提交观察，在真实写队列出队后与每次实际PTY写入前执行产品异步授权，等待后重新核原generation/Agent/ownership；原beforeWrite同步身份guard保持。不解析为shell，不用structured session ID替代PTY，不在未知Agent/阻塞交互中写入 |
| terminal的read/stop/resume | read只取实际同Agent原生transcript或显式terminal输出，后者标有界/不完整且source=terminal，缺transcript不自动替换。stop/release沿实际Native worker/PTy custody及精确后代退出，不能套SDK Job证明；无法证明树退出保持unknown/占用。resume仅该真实Agent已有会话协议/原件可证时提供，否则该项unknown/unavailable，不新建PTY冒充原session |

terminal在PTY接收正文但没有原生模型接受证明时只报告`handed-to-terminal`，不计structured accepted或turn started；input DTO的state因此包含原生该字面值。两种模式都只在真实已批准范围内执行，最终业务验收要求的完整成果/并发/指定停止仍须被实际所选模式满足。

worker.send结果明确为`{native_receipt, input:{request_id,native_request_id,dispatch_id,agent,execution_mode,session_id?,terminal_handle?,operation_id,client_message_id?,state,turn_id?,source}}`；structured只填实际session_id，terminal只填实际terminal_handle/原件来源，request.show保持原state/receipt并增加同结构只读delivery。state取`journaled|queued|accepted|handed-to-terminal|rejected|unknown`：前两者要求原journal接收/实际host队列的正向证据，accepted要求实际adapter/SDK输入接受，handed-to-terminal仅为实际PTY接受，rejected须有实际明确拒绝，缺失/断开/输入结算不足为unknown。source指明原receipt/journal/原生事件或terminal关联，不由envelope.ok推断开始或完成。关联固定保留在既有R/native receipt及实际模式原件，邮件指针删除、其他输入或宿主重启都不能改mint第二operation；同R重放只返回原件/观察，未知不重发。

真实输入的异步授权扩展在产品composition向原生delivery-loop注入可选`authorizeDispatch(input):Promise<verdict>`，由serialized handOver在等待provider/applyMessageOptions之后、handOverSubmission写交付事实及adapter.dispatch之前await；原同步beforeRun只保留held规则。该hook经同一Go HTTP服务的私有owner只读delivery-admission调用App当前authorize/ValidateProjectActionScope；owner能力仅本次内存传给Node/server并从所有helper/Agent env删除，普通token不能调用。复核以原R/native的真实caller/项目/selection/正文/Dispatch/session/operation为源，不能信任HTTP声明的human；Go反查Native原件使用只读非serialized查询，不持Native事务或等待同一delivery lane，避免循环等待。await返回后重新读取并核相同child generation/ready、consumer、session/fence、真实model/工具策略、未停止/释放或人工接管；变化明确拒绝或unknown，不能调adapter。未配置该hook的其他宿主保持原行为。

| 已有原生注册系列 | 调用与真实能力核查 |
| --- | --- |
| Codex | 明确本机codex执行文件，经原生app-server的initialize、thread/start/resume/read、turn/start/interrupt及真实事件控制；账户来源、工具配置和实际provider/model取原生来源。当前固定ToolsOff任务的缺口保留，通用接口不硬编码拒绝该Agent |
| Claude | 原有structured adapter/stream-json initialize/user/interrupt及session原件；若复用原SDK，必须明确选择本机原CLI executable，不能把SDK自带另一CLI当本机调用。当前供应端点及工具/扩展条件按实际配置和批准核验 |
| Pi | 明确本机pi，以其真实RPC get_state/prompt/abort及原sessionFile/事件读取，resume/close按原生真实能力；工具/资源及认证取该CLI本次实际状态，不替换成随包SDK |
| ACP：grok/opencode/omp/antigravity | 由真实ACP_LAUNCH_SPECS映射原命令、平台、版本及dialect，沿原adapter的initialize、session/new/load/prompt/cancel、session/update及权限回调；read/恢复取各自原sessionHistory。声明approvalEnforcement不等于工具关闭，原生不满足本次批准策略则保留该具体能力缺口 |
| 其余TUI注册 | 按原TUI配置/命令解析及原生PTY控制，逐项标明实际已证start/send/stop、read完整性和session/resume缺口；不虚构结构化协议或把终端尾部登记完整成果。最终任务选择必须满足其完整成果和停止要求，不能用未知状态通过 |

上述为本次唯一原生调用方向，替代§4.4未定稿的mailbox正文路径；B01真实handover及B02原operation查询要求在原session queue/receipt中落实。公开schema、Go端口、私有Native方法/准入、OpenAPI和生成类型作为同一契约交审，未新增程序或运行授权。当前用户未答工具/账号范围保持未决定，不冻结为所有Agent仅可发现拒绝的产品结果。

## 5. 固定抽取与完整安装输入

### 5.1 源码、入口及传递依赖

固定采用准确上游的源码作为构建输入，保留原路径和完整MIT/Lovecast许可。来源快照只作为构建输入；随包runtime由以下入口及其真实传递依赖打包，禁止只复制process-host或把RPC类型当执行实现：

| 部分 | 必须保留的真实源码/构建输入 | 产品适配 |
| --- | --- | --- |
| Node组装与生命周期 | `src/main/orcad/`中的host、profile startup、instance lock、process-start-time、lifecycle、stop request、runtime lifetime；`src/shared/app-environment.ts`及secret-store端口 | 新产品composition按§3显式组装；不直接调用有全局副作用的startOrcadRuntime |
| Store/SQLite | `src/main/persistence/`、`src/main/sqlite/`、`src/main/orca-profiles/`及shared profile storage/contracts | 保留真实迁移、authority、writer/backup；SQLite由Node24的builtin提供，不以JSON假存储替代 |
| 原生协作状态 | `src/main/runtime/orchestration/`、相关`runtime/rpc/methods/orchestration/`、runtime workspaces/terminal/session实现及shared契约 | Run/Task/Dispatch、messages、mutation receipts、worker resources/archives原样复用；按项目准入包装必要命令 |
| 会话host和Pi | `src/main/native-chat/agent-session-wire/`、runtime structured-session/worker实现、`src/main/pi/`、provider-process及native journal/record store | Pi launch改为明确SDK入口；保留原生RPC connection/translator/exit机制；移除fullAccess单一准入，改核真实noTools |
| 进程/PTY/Windows | `src/packages/process-host/`、`src/main/daemon/`、`src/main/ipc/pty/`、provider-process、`pty-descendant-exit-verification.ts`、`src/main/windows/`及`native/windows-process-tree`、`native/windows-security`、`native/windows-cli-launcher` | 真实控制helper需要PTY/daemon；核PID+创建时间与owned范围后才树终止；Windows安全原生扩展用于私有文件ACL |
| CLI与RPC | `src/cli/runtime/`的client/metadata/transport/source fence、必要parser/schema/output；runtime-rpc及必要shared rpc contracts | 公共入口为Go swa；helper调用真实RuntimeClient，不调安装中的orca、不暴露全量RPC |
| 打包 | `config/scripts/orcad-entry-build.mjs`、原生stage/prebuild/runtime-pin脚本及它们的实际imports，`src/shared/orcad-artifacts.ts`、`node-runtime-pin.ts`、package/workspace/lock/tsconfig及被引用资源 | 产品入口替代原完整build脚本；输出目录、缓存和所有TEMP/TMP仅在获准忽略目录，不直接执行上游含smoke/tmpdir的完整build |

runtime类跨多个继承模块并静态引用工作区、布局、账户及其他功能；这些Node可达支持文件与shared/types不能按目录名称随意删除。为保证上述构建输入完整，实施保留准确upstream源码快照及其lock作为本地来源，使用既有esbuild解析真实入口的传递import，生成普通构建metafile供审查；最终输出只包含实际入口可达代码和明确native资源。未注册/未启动的能力不成为产品入口。metafile不参与任务状态、请求幂等或验收权威。

静态调查已经固定来源、入口、必要native/children和原生依赖族；**当前没有运行构建，尚不能证明最终可达文件集合或可安装闭包已通过**。实施的T01必须核全部产物、动态import和fork子入口；发现表外依赖或全局副作用先补充来源与审核，不能以缺文件时调用系统Orca兜底。该限制如实保留，不将来源快照等同于功能完成。

### 5.2 必要npm、runtime及子进程文件

- 原生Node固定`24.21.0`，来自`O:src/shared/node-runtime-pin.ts`；其Windows x64/arm64实际asset pin及原生N-API要求沿原文件。本轮验收针对当前Windows x64；不宣布其他平台已验。host当前Node24.16.0的历史观察不能替代随包runtime。
- 上游root runtime依赖声明为：`@anthropic-ai/claude-agent-sdk 0.3.284`、`@electron-toolkit/utils ^4.0.0`、`@floating-ui/dom 1.8.0`、`@linear/sdk ^97.0.0`、`@orca/process-host workspace:*`、`@parcel/watcher ^2.5.6`、`@xterm/addon-serialize 0.15.0-beta.301`、`@xterm/headless 6.1.0-beta.303`、`agent-browser ~0.27.0`、`electron-updater ^6.8.10`、`fflate 0.8.3`、`i18next ^26.4.2`、`jsonc-parser ^3.3.1`、`node-pty ^1.1.0`、`posthog-node ^5.52.5`、`proper-lockfile 4.1.2`、`qrcode ^1.5.4`、`react-i18next 17.0.15`、`serve-sim 0.1.47`、`smol-toml 1.9.1`、`ssh2 ^1.17.0`、`stream-chain 4.2.6`、`stream-json 3.7.0`、`tldts 7.4.16`、`tweetnacl ^1.0.3`、`ws ^8.22.0`、`yaml ^2.9.1`、`zod ~4.6.5`。准确解析版本以该pin的`pnpm-lock.yaml`为准，禁止按这些范围升级取新版本。此列表说明原输入，不表示全部都应随最终bundle独立安装。
- 构建复用上游esbuild `^0.28.2`及锁定工具；product Pi SDK及`pi-ai`明确pin `1.0.1`，带其真实production依赖/资源/许可。SDK公开入口还会加载其TUI/theme、session及native图像支持模块，不能只放一份rpc-mode.js。实现期安装需锁定实际解析树，不依赖用户全局node_modules。新增直接依赖`jose 6.2.3`沿准确upstream lock中的版本/integrity固定，当前未安装；不会把仅源码锁中存在写成当前可import。
- Windows node-pty除JS loader外必须携带`conpty.node`、`conpty_console_list.node`、`conpty/conpty.dll`、`conpty/OpenConsole.exe`；JS文件列表完整沿`ORCAD_NODE_PTY_JS_ARTIFACTS`。watcher携带真实`node_modules/@parcel/watcher/index.js`及`watcher.node`；Windows tree/security/CLI launcher使用对应架构原件，不用PowerShell命令拼接替代多行argv。
- 原`ORCAD_CHILD_ENTRY_POINTS`九个入口为：`parcel-watcher-process-entry`、`daemon-entry`、`profile-state-writer-worker-entry`、`profile-state-backup-worker-entry`、`foreign-sqlite-reader-entry`、`port-scan-command-worker-entry`、`session-scanner-service-entry`、`worker-thread-child-process-entry`、`claude-profile-setup-worker-entry`。产品必须保留实际启动的daemon/writer/backup/watcher/worker child；未组装功能对应child不得仍被动态调用。若原runtime的实际可达调用仍需要其余child，就随包保留并核本任务专属路径，不用缺省空处理器满足加载。
- 原native资源定位以bundle所在目录为根，不能依赖shell cwd。保留需要的emoji、ripgrep及其第三方许可等实际引用资源；未启用的browser/mobile/visuals不进入安装功能。Electron静态import不得进入最终Node入口；Node内建SQLite的动态加载仍须真实通过。

### 5.3 实施写域建议及安装行为

以下准确实施写域已由主控f7的首版任务授予。新增模块以必要目录列出，既有文件逐文件列出，不据此扩大为整个Workspace、HTTP或其他产品目录：

| 路径 | 必要修改与复用位置 |
| --- | --- |
| 新增`cmd/swa/**` | 真实Go CLI、参数/退出/JSON处理、serve启动及相应真实检查；协议边界只消费App或已装Go HTTP，不复制执行状态 |
| `cmd/server/main.go`；新增`cmd/server/orca_runtime.go`、`cmd/server/orca_runtime_test.go` | 现有服务composition注入Orca执行端口、私有配置/生命周期和实际组装检查；已有业务实现保持各自归属 |
| 新增`internal/workspace/app/orca_execution.go`、`internal/workspace/app/orca_execution_test.go` | Workspace的Orca消费方端口、DTO及用例；复用`LocalProjectRepository/ProjectFiles`、项目Grant和`ValidateProjectActionScope/AuthorizeProjectActionCaller`，每次重查主体与适用动作；固定上下文仍走既有显式服务 |
| 新增`internal/adapters/orca/**` | App端口的真实适配、安装路径/metadata/进程所属检查、原生RuntimeClient调用及相应真实测试；传输使用随包Node入口导入准确原生RuntimeClient，Go侧仅以标准JSON与其自有stdin/stdout通信，避免重写Orca framing/协议或手写named-pipe parser |
| 新增`internal/adapters/sqlite/orca_execution.go`、`internal/adapters/sqlite/orca_execution_test.go`、`migrations/028_orca_execution_links.sql` | 只保存Workspace项目/批准到真实native Run/root Task的关联；不保存另一套Task/Worker状态。当前迁移最大027，序号须由主控与公共迁移归属核准后使用。现有`migrations/embed.go`已按`*.sql`嵌入，无需改动 |
| `internal/adapters/httpapi/server.go`、`internal/adapters/httpapi/session.go`；新增`internal/adapters/httpapi/orca_cli.go`、`internal/adapters/httpapi/orca_cli_test.go` | Services/路由注册、scopedAgentRoute精确放行与既有sessionGuard/项目token校验，新增HTTP处理只调用App，不直接读数据库，不调用human bootstrap代替批准 |
| 新增`third_party/orca-v1.4.230/**` | 准确b287来源及原MIT/Lovecast许可，保留原路径和锁；只在此产品来源副本实施已审适配，原O目录保持只读。源码目录不作为独立运行候选 |
| 新增`runtime/swa-orca/**` | 产品Nodecomposition、controller/helper、Go消费的真实RuntimeClient入口及Pi SDK入口；限定必要native methods/资源、来源适配和真实测试。构建产物进入既有忽略dist/verification，不把状态或凭据放入源码 |
| `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、`dependencies.lock.json` | 声明新runtime workspace、准确SDK/JOSE/构建依赖、实际锁及许可清单；原产品Node24.16.0工具链与随包Orca Node24.21.0分别记录。Go所需端口/JSON/Windows基础依赖已在go.mod内，本方案不申请Go依赖升级 |
| `contracts/openapi.yaml`、`web/src/api/schema.d.ts`；新增`contracts/swa-cli.schema.json` | 首版HTTP及CLI契约、真实状态/错误/unknown和生成类型；schema.d.ts沿既有generate-client生成，不手改。无网页功能重构 |
| `scripts/check-dependencies.mjs`；新增`scripts/build-swa-runtime.mjs`、`scripts/build-swa-package.mjs`、`scripts/check-swa-runtime.mjs`、`scripts/install-swa.ps1`、`scripts/verify-swa-cli-headless.ps1`及`tests/swa-cli-headless/**` | 精确runtime依赖检查、原生入口/资源闭包、候选打包/安装和T00—T15真实检查。Node架构/全局写端检查直接覆盖本新增runtime；既有Go架构检查已覆盖Workspace App及HTTP边界，无需为数量另加规则 |
| 新增`THIRD_PARTY_SWA.md`；本任务两份文档及自有`.verification/swa-cli-headless-20261020/**` | 上游Orca MIT/Lovecast、Pi/Node/native/实际传递依赖许可和来源说明；候选实际结果/限制/命令保留。原LICENSE不替换；HANDOFF/STATUS/SPEC/QUESTIONS继续由主控维护 |

现有`.gitignore`已经覆盖node_modules、dist及.verification；不申请其他公共文件。实施发现该清单以外的真实必要消费者时，先交主控具体路径及原因，不擅自写入。

构建使用`go build`现有产品及新增swa、锁定Node构建工具和真实native；安装只写明确InstallRoot/DataRoot，不替换系统orca或Agent，不注册自动启动、不改变用户/系统PATH，不下载私有profile。普通终端通过swa绝对路径调用；如用户另行安装PATH入口，仅新增swa且需专门授权，不影响orca解析。

现有Go HTTP及私有Node/daemon作为同一产品服务组被主控安排在唯一动态窗口内，固定所属关系。原S服务只能由主控保全、停止并在测试后恢复；本Worker本次未停止任何已有服务。构建和安装完成后才启动服务组，过程中不并行运行第二组构建或服务。

### 5.4 每个SDK Worker的原生Job及停止验证补充

本节及相应T03/T06/T08/T09/T12/T13补充已由原Reviewer准确6874db165d577bac2137ff07ffab677c7ac92103独立接受，主控msg_5ca526aeec7c授予按此继续实现；相应依赖、native构建和动态运行保持未执行。采用私有Node runtime持有每个Worker自己的Win32 Job，补充现有node-pty native适配和`ProviderProcessTree`消费方；不调整本机Orca或原daemon的Job，不增加执行账本。具体句柄适配属于产品源码修改，原node-pty通用PTY行为保持其来源范围。

已读取Microsoft [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)、[AssignProcessToJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject)、[QueryInformationJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-queryinformationjobobject)和[TerminateJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-terminatejobobject)完整正文，并核Node24.21.0的[stdio/IPC](https://nodejs.org/download/release/v24.21.0/docs/api/child_process.html#optionsstdio)及准确上游`process-host/src/process-spec.ts`。后者的真实`PipedProcessSpec`已经允许前三个pipe以外的stdio项，`PipedChildProcess`为原生`ChildProcessWithoutNullStreams`；以下仅把Node原生IPC用于启动准入，stdin/stdout继续承载真实Pi RPC。

| 顺序与边界 | 准确调用、所属和拒绝规则 |
| --- | --- |
| 创建及能力 | 随包node-pty native适配提供真实`createProviderJob/assignProviderJob/queryProviderJob/terminateProviderJob/closeProviderJob`及编译能力标志。runtime在spawn前调用CreateJobObjectW，取得本次专有、未命名、不可继承的句柄；SetInformationJobObject设置KILL_ON_JOB_CLOSE，明确不设置两种BREAKAWAY标志，并重新查询实际限制。缺导出、创建/限制设置/查询错误即失败，不创建模型会话 |
| SDK启动准入 | 用既有spawnProcess启动准确安装Node与产品SDK bootstrap，`stdio=['pipe','pipe','pipe','ipc']`、serialization=json、无shell、私有环境。bootstrap只加载Node内置生命周期代码并等待原生IPC，未准入不加载SDK、资源或认证，不生成后代和模型请求。父进程取得真正child.pid和创建时间；native用该自有child的进程句柄、GetProcessTimes及实际父进程身份再次核对，仅向这个空Job分配一次。分配成功且实际Job成员包含该root后，才通过此child.send发送一次准入；bootstrap核自身PID后加载既定SDK factory。Job分配或嵌套拒绝时关闭启动通道并保持预输入失败，缺证保留unknown |
| 句柄生命周期 | 每个NativeConnection以强引用持有一个不可从JSON构造的N-API外部对象，包含该Job句柄、该root的原生进程句柄及创建身份；不接受CLI提供的数值句柄，不查询NULL/current Job，不命名后重新打开、不复制到子进程。A/B由同一runtime分别创建独立Job；B、IDE、本机Orca及daemon均不会被加入A。父进程是唯一Job句柄持有者；SDK继承成员资格，接收的IPC不携带句柄。未知关闭保留该对象及原资源，占用不因JS观察失败而释放 |
| 正常关闭与强制停止 | 原abort仍只发送允许的abort RPC。关闭前通过实际Job句柄成功枚举成员并以真实进程表核PID/创建时间，保存实际观察；关闭RPC stdin后等待原root exit。父进程持续持有Job，root正常或异常退出均不会提前销毁见证句柄。若成员仍存在，只对这一Job调用TerminateJobObject；返回成功仅记录请求。不得按可复用PID执行taskkill或关闭其他Job |
| 全树退出及关闭句柄 | 原生root exit事件、两次成功的Job成员查询均为空且间隔至少50毫秒、对应两次新鲜进程身份观察均无全部已观察旧身份，三项共同满足才返回root/tree exited；持续保存成功查询的成员及真实退出观察。空句柄、查询失败、一次空结果或尚未绑定的空Job均不构成通过。确认后才CloseHandle，并由原生Worker stop/release及archive流程继续结算；请求成功及配置标志单项不能结算 |
| root故障及runtime重启 | root先退出时仍用父进程保留的确切Job查询/终止剩余成员并核全树。父runtime异常退出会关闭其唯一句柄，Windows按kill-on-close处理成员；新runtime没有旧外部对象，不能据此从root缺失推断树退出，保持原native请求、资源和未知状态，不复原数值句柄、不自动重发输入或启动替代者。旧控制端仍按实际PTY/consumer恢复规则处理 |

这是本任务已采用的Node CreateProcess启动路径和Win32 Job API组合，不声明覆盖通过WMI创建进程、恶意同用户程序或未使用的全部Windows启动方式。实际系统不支持必要嵌套或私有native装载时在该处拒绝；无需提权、驱动或WPR。安装包必须携带对应实际补丁二进制及冻结锁，不能用包内JS能力名称代替该二进制。

Pi原生`requested-close`生命周期及worker stop/release的消费方必须在实际全树结果可用后才结算；root异常退出可以记录已发生的root事实，同时树未知继续占用。不能让较早的root退出通知绕过原生关闭结果。实际Job/进程观察作为现有provider关闭结果及诊断保存，不新增任务状态、Manifest或完成证明系统。

### 5.5 完整成果读取的必要补充

本节准确d7计划已由原Reviewer99d084da5c17b207e5ed555f4cc44758c9dde341独立接受，主控msg_db8583a97ed2授予按原写域实施；当前形成静态源码，全部实际读取验证仍未运行。准确上游的`workerRead`是有界预览：每条消息至多六个block，每个block至多1200字符；分页不能恢复已经裁剪的内容。`worker read`继续复用其实际游标语义，`task result`统一从已验证的原生journal和Pi自产session原件读取完整内容，不从预览拼接成果。

读取在私有runtime内进行，先核controller、Run、根Task、子Task、Dispatch及实际structured process incarnation，再从实际StructuredAgentSessionHost store取得对应record。record的workspace必须属于controller；Pi providerHandleChainHead必须是`jsonl-rpc/pi`，原件绝对路径只取自该已验证record，并位于该session的私有`workers/<sessionId>/sessions`真实目录。文件header的session身份和cwd须与真实record及原生workspace解析端口相符，调用者不能指定原件路径。缺记录、缺端口、错误归属、其他provider或其他私有根均明确失败；SDK内容可用性按后文已计划停止A和最终成果B分别返回。

Pi的`SessionManager.open`和`loadEntriesFromFile`含迁移或补写行为，不用于读取。公开`parseSessionEntries`会忽略坏行，单独使用不能证明完整；采用已固定依赖`stream-json 3.7.0`的JSONL parser严格模式，先以Node标准`TextDecoder`的fatal UTF-8检查实际字节，再逐项验证Pi session/version/header及实际entry标识。缺换行截断、坏JSON、无效UTF-8、重复entry身份、缺父entry或未知格式明确失败。读取不启动SDK、不刷新认证、不发现用户资源、不修补原件。

原生journal使用既有`replayJournal/renderJournalState`读取完整消息，同时保留对应真实SQLite session/epoch/seq/ts及原生row内容；damage/newer schema/缺行不通过。SDK原件和journal分别保留，usage只引用实际字段，未知保持unknown。针对SDK文件读取前后核同一文件身份/长度/修改时间和实际record link/fence；针对journal核同一epoch及序列范围。运行中的一致读取若来源变化即失败，由调用者明确再次查询，不自动更换来源。导出总大小上限12MiB，达到上限明确失败，不裁剪；文件数量和大小在读取前检查。

固定成功条件允许A在真实执行中被计划停止。A的实际stopped/failed原因、整Job退出/资源状态、已存在的原生journal部分和SDK原件可用性分别返回；SDK没有完整assistant条目时标记`incomplete`，文件未存在时标记`unavailable`及实际ENOENT，原因未知时明确`unknown`，不声称从未持久化、不填空完整成果。该分支允许导出同任务B的完整最终成果，整体明确列A的限制；原生journal部分不替代SDK完整记录。A已存在原件的坏行/截断、错误归属、已观察来源改变及读取期间文件消失属于错误，不能解释成正常未持久化。B为成功条件要求的最终成果，其原件缺失、损坏、截断或不完整均使本次最终成果验收失败。根Task完成仍要求真实计划停止A、完整B成果、固定业务条件和全部相关资源已退出/归档/释放，不增加A完成或生成完整SDK输出的条件。

T07增加同一真实SDK会话输出超过1200字符的完整导出检查，逐项比对SDK原件和journal内容；仅在自有已归档原件副本执行真实缺失、损坏、截断、无效UTF-8、路径替换及超限输入，按上述规则返回明确错误且原候选原件字节不变。T07/T13必须覆盖A真实计划停止且SDK未持久化完整assistant内容，验证A限制如实返回且B完整成果仍可取得；并验证A已有坏源或来源变化不会被登记为正常未持久化。B最后结果必须完整可读取并通过固定业务判据。所有补充当前`NOT_RUN`，准确后继源码和真实结果继续独立审核。

## 6. 最少完整CLI规则

以下为已审精确命令契约，当前实现中，尚无运行通过结论。CLI/HTTP/App共用同一准入语义；所有写命令要求显式`--request-id <UUID>`，按§3.3映射原生outer/child mutation receipt，公开键及每一步真实身份均保留。上下文通过UTF-8文件传入；禁止在命令行正文中放凭据。

| 命令 | 输入与实际结果 / 复用 |
| --- | --- |
| `swa serve --data-dir D --port N --json` | 必须明确私有根和端口；打印真实readiness/版本/路径/身份的非秘密部分。缺依赖、锁冲突或端口占用失败，禁止改用其他runtime/端口 |
| `swa status --json`、`swa capabilities --json` | 原生runtimeId/startedAt、数据库authority、daemon/provider支持/当前证据与限制；读操作不调用模型、不隐式启动后台 |
| `swa controller open --project P --workdir W --request-id R --json` | 创建§3真实helper；验证当前项目/批准/写域，回controller selector及真实native身份，此时没有Run。输入的P必须是实际Workspace ID |
| `swa controller show --controller C --json`、`close ... --request-id R` | 精确观察/关闭自有helper；close需所属全部Worker已退出/释放，否则拒绝。不得用terminal全量关闭 |
| `swa task create --controller C --spec-file F --request-id R --json` | 依§3.3创建真实Run及根Task；每controller一次用户任务。F固定目标、公开来源版本、scope与成功条件，返回runId/root taskId及已有批准引用 |
| `swa task show --controller C --task T --json`、`list --controller C` | 原生根/子Task/Dispatch及只读汇总；原请求未决、启动/停止未知和资源占用分别展示 |
| `swa worker start --controller C --task T --name A --agent pi --model openai-codex/gpt-6.1-sol --input-file F --request-id R --json` | 新建T的子Task及原生Worker Dispatch，以真实Pi SDK执行固定公开输入；ready只在真实turn开始证明满足时返回，接受但未证明开始保持unknown |
| `swa worker show --controller C --dispatch X --json`、`list --controller C --task T` | 精确Dispatch、子Task、runtime/session/fence、PID/创建时间、Agent实际状态和root/tree exit；不只输出PTY是否live |
| `swa worker read --controller C --dispatch X --source transcript --limit 100 --json` | 读取native journal/provider自产会话的实际消息、真实cursor/source identity；无原件即缺证。后续分页必须使用原cursor，来源变化拒绝 |
| `swa worker send --controller C --dispatch X --input-file F --request-id R --json` | 验完整当前绑定及授权后向实际原session发送；保留input accepted、turn started与settled；不把写入stdin当开始 |
| `swa worker stop --controller C --dispatch X --request-id R --json` | 精确停止该owned Worker，返回stop request、实际root/tree exit及保留占用；PID/创建时间或ownership失配时不终止 |
| `swa worker release --controller C --dispatch X --request-id R --json` | 只对原生允许结算状态执行冻结输出与释放；未知、人工接管、缺归档或后代未退出时不释放。重复同键只回原receipt |
| `swa task result --controller C --task T --output-dir O --json` | 提取根及各Worker真实输出、来源、检查引用、版本和已知usage；输出路径须不存在或由本命令精确拥有，禁止覆盖其他文件 |
| `swa task complete --controller C --task T --result-file F --request-id R --json` | 当前控制端确认固定成功条件和真实结果，全部相关Worker退出/归档后调用原生taskUpdate；失败或unknown不能完成；完成不表示用户采用或Git发布 |
| `swa request show --controller C --request-id R --json`或`--project P` | 两种scope互斥；project形式支持open未回selector时查询。按§3.3查outer/child原生receipt、checkpoint及原run/task/dispatch/input operation，不生成新请求。无receipt仍不能单独证明未发生外部输入 |

CLI stdout在`--json`下只包含一个完整JSON envelope；诊断写stderr。envelope统一携带`ok/request_id/runtime_id/controller/run_id/task_id/dispatch_id/result/error`中本操作存在的字段，保留原生`code/message/retryable/required_action`和未知语义；不输出token或原账户路径。文字模式显示相同状态与明确下一动作；不通过匹配自然语言决定状态。

私有dispatcher仅对`swa.*`方法中的实际`OrchestrationError`保留原code/data，避免产品身份/资源拒绝在上游通用allowlist中变成`runtime_error`。其他原生方法和普通SQLite异常继续使用来源映射；`operation_in_progress/controller_closing`保留原请求并返回EXIT6。

| 退出码 | 语义 |
| --- | --- |
| 0 | 查询成功，或写动作取得满足该命令要求的明确结果；查询到failed任务仍可EXIT0，result保留failed |
| 2 | 命令/字段/编码/路径校验失败，尚未发送 |
| 3 | 身份、批准、ownership或scope拒绝，无授权扩大 |
| 4 | 当前Agent/依赖/能力不满足，尚未输入 |
| 5 | 启动前资源/实例锁/端口拒绝 |
| 6 | 请求可能已发生，输入/开始/停止/释放等效果未知；保留原ID，禁止自动重发 |
| 7 | 明确执行或存储失败，按原生记录返回已知影响 |
| 130 | 调用端等待被用户终止；后台任务状态不据此改为停止。若已获知请求身份，stderr给出原request查询命令 |

同键同正文使用原生receipt回放，同键不同正文`request_mismatch`；不自建另一份payload hash系统。未知请求不能换键重发、换Agent/模型/目录或降级为另一路径。指定source缺失不回到terminal tail；失联不视为退出；root exited而tree unverifiable继续保留占用。既有usage缺失显示unknown，subscription目录价格不充当实际费用。

## 7. 从最新目标独立推导的完整真实测试计划

### 7.1 样例、资源与命令约定

已核存在Agent创建的公开验证项目原件：`C:/Users/DW/orca/workspaces/Astrocyte/product-swarm-20261015/.verification/s3-public-stats`，本次HEAD为 `da3bdddb085808863090a05f60cc1c64415039cf`，origin为`https://github.com/songconmaisaix31-design/astrocyte-s3-public-stats.git`。本次完整读取该准确提交的README、go.mod、stats.go、stats_test.go四文件，来源记录见已有`docs/standards/swarm-s3.md`的公开建库记录；未读用户作品。动态T00仍需匿名核公开可读及同一准确提交，不把历史公开记录当当前网络可用保证。

固定业务目标为**基于这四份公开原文，交付Median设计及验证说明**，成果采用真实执行输出，无程序修改：A分析实现、溢出/输入保持等要求，B独立核查Mean与Median边界、生成最终检查说明。两者先各自分析相同固定原文，实际模型执行必须重叠；A被指定停止后B继续，并在同一真实session接受一次包含A已取得输出及原来源的明确后续输入。B说明必须覆盖奇偶长度、负数/重复、空值及NaN/±Inf、有限大中间值溢出、输入顺序保持及原Mean不变，引用准确文件位置。按原文人工或固定程序断言检查这些明确事实，不用模型自评作判据，不把它写成已经实现Median或旧S3通过。

根Task的固定成功条件明确允许按要求中断A，并要求B形成最终说明；A的子Task保留原生stopped/failed事实，不改写为成功。根Task只有在该预先声明的流程和真实成果均满足后才能由控制端显式确认completed，查询始终展示A的实际终止原因。

以下命令中`$swaBin/$installRoot/$dataRoot/$caseRoot/$controllerId/$rootTask/$dispatchA/$dispatchB/$projectId`均由真实安装/准入回执设置，不能填虚构值。`$caseRoot`限定本任务忽略目录；`task.json/a.txt/b.txt/b-followup.txt`由T00从上述准确公开Git内容及固定指令生成，文件不含凭据。`$projectId`来自现有Workspace的实际登记与现有human批准；没有有效批准时先保留拒绝，主控安排当前用户批准操作，产品CLI不自取human身份。

拟新增`pwsh -File scripts/verify-swa-cli-headless.ps1 -Case Txx -SwaPath $swaBin -InstallRoot $installRoot -DataRoot $dataRoot -CaseRoot $caseRoot`作为真实检查入口，`-Case`仅接受下表编号。脚本是后续实施内容，当前不存在、未运行；其职责是执行表内真实CLI/HTTP/进程/SQLite检查并保留实际失败，不模拟provider/原生协议或填入成功事件。测试脚本不增加产品调度状态。

每项独立运行在主控授予的窗口；构建、安装和服务不并行。真实服务组及双Worker是同一次任务窗口；使用RESOURCES的BelowNormal、Go `GOMAXPROCS=4/-p=4/GOMEMLIMIT=512MiB`、Node各进程heap≤1024MiB。每次重操作前实际CPU/可用内存双采样满足CPU<85%、可用≥4GiB，单调间隔2—5秒；Node heap非总RSS上限，同时记录两个Worker及服务组实际RSS和进程数。不修改全局限额或终止其他进程。

### 7.2 T00—T15及可判断结果

全部当前为`NOT_RUN`，下表为实现前审核对象。必要控制脚本或fixture缺失直接失败；不能以未发生的竞争窗口登记通过。

| 编号 | 命令与真实动作 | 通过条件及失败证据 |
| --- | --- | --- |
| T00 来源、基线与授权 | 原件执行`git rev-parse HEAD`、`git show <准确SHA>:<四文件>`；匿名GET公开repo及准确commit；`Get-Command orca -All`、`orca status --json`和只读进程/监听查询；核现有Workspace真实项目/Grant | 固定公开原件、允许输入和成功条件可定位；记录原Orca二进制解析、metadata/runtimeId、PID/创建时间/daemon、配置字节及ACL比较基线；不读取全体会话正文；缺批准保持明确拒绝 |
| T01 构建及闭包 | 获写域/窗口后执行冻结`pnpm install --frozen-lockfile --ignore-scripts`，产品`node scripts/build-swa-package.mjs --output <明确新候选>`串行导出闭包、编译native、调用build-swa-runtime及`go build -p=4`生成swa/server；运行`check-swa-runtime.mjs --candidate ...`，逐个加载实际随包entry/children及真实SQLite，检查构建metafile | bundle/Node/native架构匹配、Node24.21.0、无Electron执行依赖、所有实际fork/dynamic依赖在包内；所有TEMP/TMP归本任务忽略目录。不能运行上游mock测试当产品证据 |
| T02 安装与私有隔离 | 使用T01同一候选执行`pwsh -File scripts/install-swa.ps1 -PackageRoot ... -InstallRoot ... -ProtectedRoots ...`；绝对路径运行`$swaBin --version`和`serve --data-dir ... --port ... --json`；按§3.1逐一核实际可写消费者、`PRAGMA database_list`、metadata/pipe/锁、CIM PID/创建时间及监听；对已占用真实端口、原Orca根及本项junction指向原根提供真实拒绝输入 | 指定端口冲突EXIT5且无另选端口；路径在写入前拒绝，不能试写受保护根；私有profile-state.db/orchestration.db/pipe/daemon/key及所有实际session/cache根正确。§3.1定向配置/认证字节/ACL、目录通知和原绝对CLI status一起核保全；全局迁移/hooks/账号消费者源级关闭。当前权限执行，无内核采集前置；具体不可解释变化保持证据不足 |
| T03 控制身份及权限 | `controller open/show`及`task create`；使用真实过期/撤销或缺失项目token、另一个真实项目/Run/旧controller访问；尝试CLI `--from`/human参数；用已有真实人类认证在撤销Agent执行批准或更新settings后停止自有Worker | 仅真实helper及当前consumer可写；未知flag EXIT2，无效Agent主体EXIT3；不构造human cookie或伪consumer。实际人类仍能精确安全停止，不依赖Agent执行批准或旧context版本；Agent撤销门禁保持。Controller PID/创建时间和真实native pane可查；旧代请求拒绝 |
| T04 Pi认证及ToolsOff | `capabilities`；无prompt准备真实Pi SDK并按§4.3 factory顺序加载。首次prompt前检查真实定向refresh结果、auth snapshot及getAuth来源，CredentialStore在实际read/list/modify/delete入口记录非秘密provider ID和操作，未知ID立即拒绝；核真实子进程home/agent/session/package解析路径和过滤前的package-manager来源，从源码调用闭包核没有全量refresh、用户资源发现、默认来源或其他provider环境/云账户探测。核资源/工具及设置后发送固定公开输入。自有准备会话调用真实只读modify(callback)，callback仅尝试创建本项自有标记文件 | 实际凭据操作集合仅openai-codex、没有list及修改callback执行；refresh errors空/aborted=false且真实snapshot为OAuth，provider/model正确。静态内置catalog的存在与实际认证来源分别记录；其他provider操作一次即失败，不能填undefined掩盖。home/agent/session均在该真实Dispatch私有根、package为随包SDK，解析到本机用户资源根即失败；工具allowlist/active/扩展/MCP/skills/templates/context文件均空、固定system和cache/retry/compaction关闭可核。modify/delete在callback前拒绝且没有刷新HTTP；凭据保全按§3.1核。自然短期原件未命中保持该分支未覆盖，不造token/有效期。Codex受限路径真实拒绝 |
| T05 启动和首输入 | 用真实不存在/不可执行的本任务入口以及正确入口分别`worker start ... --request-id ...`；记录native启动、input、turn事件和session自产文件 | 预启动失败无模型输入，native失败stage/residual真实；成功记录accepted与真实started。真实观测只到accepted时EXIT6且保留Dispatch，不能填ready |
| T06 幂等与客户端断开 | 并发两个同R/同正文`controller open`，再同R改真实project/workdir；真实PTY创建后只断开本项CLI响应连接，用`request show --project P`查询；另在helper已创建、Run已创建及根Task未确认各实际边界终止本项等待/控制连接，检查§3.3原生checkpoint/子请求；runtime重启后重复只读查询。close同R并发、异controller正文及实际关闭后丢响应同样验证。对worker start/send再执行同R并发、异正文及真实提交后断开查询 | 每R仅一个真实helper及相应确定native handle；open不创建Run，task create至多一个Run/根Task，worker start仅一个子Task/Dispatch/输入。异正文`request_mismatch`；同R完成回原receipt，pending保持unknown及原占用，查询不创建/重发/关闭。真实命中副作用后响应丢失窗口才算该分支通过；未命中INCONCLUSIVE。核outer receipt及R/controller-pty、R/run-create、R/root-task或R/native映射实际存在；原生pending缺记录不证明无副作用 |
| T07 输出、游标及成果来源 | `worker read --source transcript --limit 1`后按cursor分页；交叉把A的真实cursor用于B；`task result --output-dir ...`；在自有已归档副本做真实文件替换/缺失检查 | 真实消息/source/session/Dispatch对应，跨来源拒绝；结果保留完整来源、限制及unknown usage；缺原件明确失败，无terminal退路；导出不覆盖已有文件、不写出允许目录 |
| T08 资源与存储拒绝 | 同一批准max-workers=2的真实任务已占两席时请求第三名；在本项自有DataRoot施加真实只读/占用SQLite条件；CPU/内存门限仅用实际双采样结果 | 第三名在模型输入前拒绝；失败写入不继续启动/发送。已外部执行但结果写失败保留原request和unknown。无自然低资源情况时不声称内存门限动态已覆盖；不替换采样器 |
| T09 进程所有权及后代 | 安装候选的Node/native与普通Node fixture实际创建root、子进程、孙进程和另一个无关进程，使用§5.4同一Job准入/关闭适配，保存非空Job成员及PID/创建时间；分别执行正常stdin结束、abort后关闭、root实际异常退出、强制停止和父宿主失联；检查真实已关闭/无效句柄、错误创建身份及对另一实际已绑定Job的重复分配拒绝。fixture不模拟Agent，缺native的真实候选副本只验预输入拒绝 | 必须先成功观察到root和实际后代属于目标Job，按§5.4取得Job两次成功空查询、原root exit和全部已观察旧身份的两次新鲜缺失，才登记tree exited。无关进程及B Job继续；失败查询、失配、关闭句柄或宿主重启丢失句柄保持unknown/占用，不按空枚举通过。所有生命周期分支逐项保留结果；嵌套拒绝、PID实际复用等自然条件未发生时不登记该分支通过 |
| T10 停止未知与恢复 | 对本项owned Worker发stop，在已证明stop开始后只断开本项控制连接/暂停自有控制helper，再`request show/worker show`观察；恢复真实连接后精确停止 | 中断窗口确实被命中；unknown保留占用、拒绝替代者，恢复后同一身份可核并停止。未命中窗口为INCONCLUSIVE，不注入假回执；不停止原Orca/原S服务 |
| T11 释放/接管/竞争 | 对同一owned执行重复stop/release；由本项实际终端输入使native ownership变user_owned；另在真实settled附近发stop/release | 只关闭原精确身份，人工接管保持retained；竞争不覆盖新owner；归档后实际全树退出才释放；unknown不清空资源，原工作树保留 |
| T12 重启与控制端接续 | 在本项Worker输入已接受后，仅停止重启本项runtime，保留真实库、daemon及session；用原request查询，再核原helper/Worker | 原始输入不重发；可证原owner时恢复同一身份，否则真实unknown。新控制端只在旧helper真实退出后合法runUse、generation变化；旧controller不能继续写。没有证明全部structured进程存活时不宣称重启不中断 |
| T13 安装后同一任务双Worker | 按§7.3完整执行一次任务，全部CLI来自T02同一安装候选；A/B输入不等前一结果即提交，分别观察并停止A、B继续 | 必须满足§7.3每项；无真实模型执行重叠即失败/证据不足，不能以两PID/两行列表代替。任务成果来自实际输出 |
| T14 失败及准入回归 | 使用真实缺失依赖文件的本项候选副本、失效批准、未知source、原生返回的真实认证拒绝/限流/网络失败；静态覆盖输入校验与退出映射 | 明确失败及unknown状态、退出码和required_action一致；不换provider/模型/目录，不重发；只保留实际触发的故障覆盖。正式验收候选不修改，副本失败不拼成正式成功 |
| T15 最终保全和清理 | T13期间、停止A后、T13后及本项服务退出后，按§3.1重复原绝对CLI公开status、`Get-Command orca -All`、定向CIM/监听/metadata和配置/认证内存字节/ACL比较，检查定向目录通知及所有实际写端路径；只关闭本项owned Worker/helper/daemon并核全树，再由主控恢复原S | 原Orca公开查询可用、解析不变、原进程及会话归属保持；源级全局副作用关闭和实际私有写端均核实，认证另按T04刷新前拒绝验证。自然变化按真实来源解释，无法解释的具体范围保留证据不足；通知溢出不能填无变更。全部本项owned进程实际退出或明确unknown残留；不修改全局审计/原配置或终止非所属进程，原S由主控实际核实 |

T06增加同一真实controller、不同R的两项task.create竞争：原生事务在首次Run副作用前检查并checkpoint该controller，第二项只能拒绝或观察原占用；重启后pending仍占用，真实Run/root只能有一组。T08增加同一root的三个不同R并发worker.start：在已有原生mutation_receipts内原子保留额度，已创建子Task与尚未物化的pending请求合并计数，已关联的同一原生Dispatch只计一次；两席已保留即在模型输入前拒绝第三名，unknown继续占用。两项均运行真实CLI、helper和SQLite，不通过模拟接收器制造竞争命中。

T06/T11补充不同R的controller.close与task.create/worker.start真实竞争：关闭与创建使用同一原生SQLite事务检查已有receipt，并在该事务内checkpoint关闭屏障。创建先保留且尚未物化时，关闭保持拒绝；关闭先保留时，之后所有创建和输入拒绝。关闭pending/unknown及完成后的receipt都继续阻止新创建，查询不撤除屏障。只有此前创建均结算且真实资源全部released时才允许关闭helper；重启后的未知创建继续保留占用。两种取得顺序均按真实receipt、Task/Dispatch和所属进程核对，未命中的交错保持INCONCLUSIVE。

T06真实非模型入口为`pwsh -File scripts/verify-swa-cli-headless.ps1 -Case T06`及相同候选/私有D/公开项目/既有人类批准参数；`native-idempotency.mjs`使用实际CLI、PTY、Run/Task及read-only SQLite。它检查open/close同R并发和完成重放、真实不同workdir/controller拒绝、task.create同R并发后完成重放、同路径规格正文及自有实际context文件变化拒绝、首次固定context原件保持、唯一Run/根Task及实际子receipt。并发请求若在App先遇到原生pending，必须明确unknown且之后只查询原请求；该分支不会据此宣称已合并等待。脚本保留未命中的断开/重启和不同R竞争，Case返回证据不足。T13另在实际A/B执行后重放原start/stop/send/release请求，确认原身份及B恰有两次真实输入；两席仍占用时实际第三名必须在输入前拒绝，且真实Worker列表和SDK事件没有第三项。这些源码均待真实窗口运行。

T08的`-Case T08`使用同一实际脚本的storage分支，对经过私有D校验的真实Orca SQLite执行`BEGIN IMMEDIATE`并持有真实写锁，再调用新R的实际controller.open；要求明确存储失败EXIT7、原生Run/Task及真实Tab/Leaf不增加、该R无receipt，释放自有锁后仅查询该R。准入之前失败的结论结合原生executor先begin receipt再invoke的实际顺序，单独absent不承担无副作用证明。该分支不调用模型；实际输入后写结果失败及自然低资源仍未覆盖，Case保持证据不足，不能登记完整T08通过。

T06的`-NativeCase disconnect`仅作一次实际连接断开尝试：先保存真实新R及本项CLI子进程PID/创建时间，从真实私有SQLite观察该open完成receipt，并逐一核其实存PTY root/helper。只有本项CLI仍为同一创建身份且尚未收到stdout时才通过自己的ChildProcess句柄终止该客户端；不终止控制helper、Worker、原Orca或原S。必须同时取得副作用先于断开、实际客户端被中断且最终stdout仍为空，才记录命中；正常响应已到、进程已经结束或未取得该窗口均INCONCLUSIVE且不重复尝试。随后只查原R和精确controller，并用新明确请求关闭已核实helper、观察实际退出；未知原请求保留原件及占用。该入口不改变原生产品方法，也没有故障回调、暂停模型或延迟provider。Run/root及Worker输入边界、重启及其他竞争仍保持未验。

T09依现有入口`pwsh -File scripts/verify-swa-cli-headless.ps1 -Case T09 -SwaPath $swaBin -InstallRoot $installRoot -DataRoot $dataRoot -CaseRoot $caseRoot`执行分支；Node原生测试采用同候选Node和native运行`tests/swa-cli-headless/provider-job.test.mjs`。当前两入口的相应实现和真实结果均未完成，缺失或未命中场景如实保留。T13指定停止A时另保存A专有Job的实际root绑定、成员查询/退出观察和B专有Job中的原成员/身份，原生stop/release只有在全树条件满足后才结算。T12宿主重启丢失旧Job句柄的路径保持unknown，不重发输入，也不把该分支记录为恢复了存活模型进程。

### 7.3 同一安装候选的一次双Worker任务

T13只在T00—T04必要准入通过且窗口可用时运行。实际PowerShell执行序列为：

```powershell
& $swaBin controller open --project $projectId --workdir $caseRoot --request-id $openRequest --json
& $swaBin task create --controller $controllerId --spec-file "$caseRoot/task.json" --request-id $taskRequest --json
& $swaBin worker start --controller $controllerId --task $rootTask --name A --agent pi --model openai-codex/gpt-6.1-sol --input-file "$caseRoot/a.txt" --request-id $startARequest --json
& $swaBin worker start --controller $controllerId --task $rootTask --name B --agent pi --model openai-codex/gpt-6.1-sol --input-file "$caseRoot/b.txt" --request-id $startBRequest --json
& $swaBin worker show --controller $controllerId --dispatch $dispatchA --json
& $swaBin worker show --controller $controllerId --dispatch $dispatchB --json
& $swaBin worker read --controller $controllerId --dispatch $dispatchA --source transcript --limit 100 --json
& $swaBin worker stop --controller $controllerId --dispatch $dispatchA --request-id $stopARequest --json
& $swaBin worker show --controller $controllerId --dispatch $dispatchA --json
& $swaBin worker show --controller $controllerId --dispatch $dispatchB --json
& $swaBin worker read --controller $controllerId --dispatch $dispatchB --source transcript --limit 100 --json
& $swaBin worker send --controller $controllerId --dispatch $dispatchB --input-file "$caseRoot/b-followup.txt" --request-id $followupRequest --json
& $swaBin task result --controller $controllerId --task $rootTask --output-dir "$caseRoot/result" --json
& $swaBin worker stop --controller $controllerId --dispatch $dispatchB --request-id $stopBRequest --json
& $swaBin worker release --controller $controllerId --dispatch $dispatchA --request-id $releaseARequest --json
& $swaBin worker release --controller $controllerId --dispatch $dispatchB --request-id $releaseBRequest --json
& $swaBin task complete --controller $controllerId --task $rootTask --result-file "$caseRoot/checked-result.json" --request-id $completeRequest --json
```

每个ID必须从前一个实际回执中解析取得；写操作EXIT6或缺少必要证明立即停止依赖步骤，改为同request查询。start只等待已接受/已开始，不等待整个模型任务结束。若A在B开始前已经settled，则本轮并发不通过，不自动重发A；需保留结果并由主控批准调整公开输入后的另一次明确任务。

必须保留以下实际证据：

1. 同一安装路径、准确源码和候选版本，载入的Node/native/SDK路径均在该安装根；固定一个Run/根Task，A/B各有不同真实子Task、Dispatch和session。
2. 两个实际provider请求的开始、stream/settled边界及各自原生输出。满足`max(startA,startB) < min(endA,endB)`，且至少在重叠区间分别观察到两者真实模型流事件；单独agent_start或两个进程live不能证明模型执行重叠。只拥有HTTP请求等待区间时标注缺少模型活动证据，不能登记通过。
3. 指定stop A时A仍在该次实际执行中；A root和全部后代退出证明，原生Dispatch状态及资源记录可定位；A后续不得继续生成输出。
4. B的原PID/创建时间、session、模型、input operation及fence保持。stop A后继续收到B自产输出，B完成原轮并在同一会话完成获准后续输入；不重建B、不改变provider。
5. 用普通终端及原有Agent的真实命令工具分别调用安装后的swa进行至少一次查询/控制；外部Agent只取得自身项目token及controller selector。其工具权限不被移交内部ToolsOff Worker。
6. 取得B真实输出、A停止前已有输出、固定事实核查与所有source引用；每个本轮event_id逐一在真实事件库/journal中定位所属session/Dispatch/时序。若事件源没有全局event_id，用其原生序号/持久entry ID准确定位，不造UUID冒充原生事件。
7. 原本机Orca在安装前、安装后、A/B并发、停止A后及最终清理后均可用公开CLI查询。原解析路径、runtime进程/daemon、账号配置及认证保全；产品退出后没有误终止原Orca或原S资源。

内部两个Worker的并发仅属于这次单一受管验证。没有其他动态服务/构建并行；本机Orca与测试产品同时存在是用户明确保全条件，窗口由主控安排。

### 7.4 必要程序检查

实施后执行以下真实命令，新增测试用例必须直接对应上表；不运行现有上游mock套件作为本产品证据：

- Go真实检查使用真实安装CLI、原生controller/RuntimeClient、当前项目批准、实际loopback HTTP及原生`PRAGMA database_list`，四个`TestOrcaCLIReal...`已形成源码，分别覆盖安装调用、消费方scope、实际App授权和HTTP身份字段拒绝；不构造provider、批准或human会话。独立Go源码入口调整已由准确48385383b657ad1d5fe7601c869e28e3b6b70320接受，主控msg_8daabc14f03b授权静态修改，当前源码待准确CR及实际窗口：在单独编译窗口运行`pwsh -File tests/swa-cli-headless/compile-go-tests.ps1 -OutputRoot $goTests`，不读取/创建候选或VERSION。入口核实际40位干净HEAD、本项忽略目录内全新私有输出；内部串行`go test -c -p=4`编译`./cmd/swa`、`./internal/adapters/orca`、`./internal/workspace/app`、`./internal/adapters/httpapi`，再实际执行CLI三个传输前函数，逐函数PASS、零匹配/SKIP拒绝。各重操作前新资源准入，BelowNormal、Go4/512MiB和私有temp/cache/module cache保持；任一失败立即退出，只有实际编译/三函数成功且结束时HEAD仍同一干净来源才写既有SOURCE/tests.json。编译期间不启动实际服务或模型，成功仅证明编译与三函数，不代表四个live函数已运行。
- 实际服务窗口执行`pwsh -File scripts/verify-swa-cli-headless.ps1 -Case T03 -GoTestDirectory $goTests`及其余实际安装/端口/认证/项目/原Orca保全参数；开始前必须核真实安装候选VERSION、编译SOURCE和准确源码SHA三者完全相同，不接受占位候选或伪造SOURCE，缺失/不等直接失败。脚本持有真实serve，创建本项真实controller，设置`SWA_REAL_ENABLED=1`后串行运行四个预编译二进制的`-test.run '^TestOrcaCLIReal'`，逐一要求真实PASS记录，空匹配或SKIP直接失败。无实际环境的普通Go检查会明确跳过live函数，不能算真实验收；此入口仅完成T03相应Go范围，人类撤销后安全停止、另一真实项目/Run及旧代条件仍单独保留未验，不能用四个函数代替全部T03。
- `pnpm test:swa-runtime -Case T09`及实际`SwaPath/InstallRoot/DataRoot/CaseRoot/ProjectRoot/FlowEvidence`参数转到同一PowerShell验证入口；T07/T13及其他编号沿相应Case执行。T13必须明确实际Agent与Model，T09的原生会话检查复用同候选T13实际原件。本产品Node适配使用真实SQLite、controller、process与已安装Pi CLI；生命周期fixture只代表普通进程，真实Agent路径在T04/T13覆盖。测试资源采样器为已纳入源码的`tests/swa-cli-headless/resource-gate.py`，使用当前C:/Python313及实际psutil7.2.2；产品安装/运行不依赖该测试用Python。
- `node scripts/check-architecture.mjs`、`pnpm check:contracts`及变更影响的生成一致性检查，均遵守实际资源窗口。若新增模块未被现有架构规则覆盖，在本任务报告实际覆盖，并由同一Worker补相应必要规则。
- T01的Go/Node构建及T00—T15真实验证入口。全默认CI仍按其独立范围记录，本任务不替其未验项目登记通过。

### 7.5 CLI错误输出、原请求关联与所属stdin的补充测试计划

本节准确b3f0e229计划已由原Reviewer d7fbcfb097275c27255a8ab4a77a3d517c25c81a独立接受，主控msg_d7ccfb662bde授予同一Worker在原CLI写域静态实施，main30cd759f已将条件纳入SPEC §21.1。计划的程序基线为准确8220d851dd998639a0ae3fbf4eff0212dd20ed7c，后继实施和真实结果记于§9；编译、信号和所有正文仍需动态窗口。此前各准确Commit的审查范围保持。

实际缺口：`cmd/swa/main.go:report`把本地失败写到stderr，未保留已解析的原R；CLI又直接输出既有HTTP ErrorV1，缺少统一的ok。`serve`没有读取自身stdin/EOF，只有ctx/node/server分支，正常所属EOF无法进入code0。`waitOwnedService`只等待直接子进程，不能单独证明后代已退出。这些影响§6输出规则、T06原请求恢复及T02/T15服务关闭，不涉及新产品命令、执行账本或权限。

冻结的输出及生命周期条件：

- `--json`的正常命令结果或失败只在stdout发布一个完整envelope；stderr保存实际诊断。serve成功readiness保留既有专用字段和结构，普通控制命令及serve失败沿既有CLI envelope。原有文字模式可继续使用缩进结构，须呈现同一code、message、required_action及已有真实关联。解析错误也需取得单一失败JSON；不能为取得输出模式而猜造尚未成功解析和校验的身份。
- 外层`request_id`只能来自当前已成功解析并校验的命令R或真实原生envelope；controller/task/dispatch只保留该命令明确选择或真实响应已给出的值。runtime/authority仅来自实际原生响应或已核私有readiness。未知项省略。输入错误、取消、输出失败和网络未知都不能换键或自动重发。
- 已知HTTP ErrorV1沿成熟JSON解码的明确协议分支转为既有CLI envelope：外层ok=false及既定code/message/required_action，CLI retryable按既定false；原完整ErrorV1原样保存在既有`error.data`，其中原`schema_version/error.request_id/retryable`保持HTTP来源。HTTP trace不填入命令R；不增加顶层字段。实际原生envelope及其result/error.data保持来源。无法识别、损坏或不完整的真实响应立即报告unknown，不猜测另一种结果或修复响应。
- 取消当前CLI等待使用退出码130及一个失败envelope，已有R及selector保持，stderr给出针对该R的真实查询方法；取消不生成Worker停止/释放或Task完成结果。stdout实际不可写时保留错误和已知关联到stderr，按真实影响返回6或7，不再尝试第二次发布结果。
- `serve`在readiness之前遇到所属EOF或真实中断，按取消启动130收尾，并只发布一次未就绪的失败envelope；其delivery_unknown描述尚未交付的启动结果，未知身份省略。实际所属进程退出无法确认时以6保留未知范围。readiness之后只保留已发布的那一次readiness；后续关闭/失败写stderr和实际退出码，不追加第二个结果。readiness已经发布不等于后继关闭成功。
- readiness之后，在所有相关Worker/helper已按原生流程明确停止、归档/释放及关闭的空闲条件下，所属EOF须关闭本次node/server stdin并核实际退出，全部所属及已观察后代退出才返回0。实际子进程失败不能被忽略；已知失败及unknown分别保留7和6。有未确认的Job、daemon、helper或其他旧身份继续保留实际占用及原记录，不按serve root退出清除资源；不会自动完成Task或重放输入。

拟在`tests/swa-cli-headless/cli-output.test.mjs`及必要Windows普通控制helper中实施，沿现有验证入口增加`-Case T14 -CLIScenario <pretransport|http|network|cancel|serve-owner|output-pipe>`。这些是待实施的验证参数；当前入口尚未提供，缺失不能计为通过。helper只控制本项真实进程、管道和console，不模拟HTTP、Agent、原生协议或业务结果。Go helper在服务启动前以相同源码SHA、现有Go额度串行编译；实际检查只使用预编译helper、安装后的同一候选及其Node，服务期间不编译。

| 用例与现有需求 | 实际条件、命令与独立判断 |
| --- | --- |
| C01 本地解析/校验，T03/T14 | 同候选实际运行未知flag/动作、无关字段、非法source、无效R和缺少当前Grant；缺Grant只删除本项子进程环境中的token。涵盖合法R已解析后失败、R尚未解析及R本身非法的参数次序。要求EXIT2/3、stdout成熟Decoder恰好一个失败envelope且第二次Decode为EOF、诊断只在stderr；未核身份缺省。结合真实产品服务日志、原生库和进程基线核没有连接/命令、helper或输入副作用 |
| C02 真实HTTP ErrorV1，T03/T14 | 使用真实当前批准和实际controller，传入本公开项目内确实不存在的spec/input路径，或复用人类实际撤销后的拒绝条件；由实际产品HTTP服务产生ErrorV1。比较其保留在error.data的真实schema/error/trace与服务实际日志/响应来源；外层保留原命令R，禁止把HTTP trace当R。已有真实controller/dispatch按当前命令保存；没有提供或取得的root Task不补造。按真实code执行既定退出映射 |
| C03 实际原生成功/拒绝，T06/T08/T13 | 复用同候选controller/task/worker的真实envelope及第三席拒绝、另一实际controller的scope拒绝；保留所有实际runtime/authority/R/controller/Task/Dispatch、native结果及error.data。对同一真实回执用成熟JSON结构比较来源，不另作模型调用或生成假结果；success/error分别只有一次stdout输出 |
| C04 真实连接失败及unknown，T06/T14 | 已核关闭的本项服务端点验证连接未建立EXIT4；连接已进入真实HTTP处理时，先保存本项server的实际句柄、创建身份、安装路径和所属父链，再仅终止该真实HTTP子进程，使仍存活的CLI收到真实断开。可以在真实私有SQLite写锁期间观察唯一实际RuntimeClient子进程，证明请求已进入处理；不使用空TCP服务、代理或响应注入。要求EXIT6、原R/selector及unknown保留、无重发；只查原R及真实SQLite/会话。命中副作用后断开的更细边界仍按T06实际证据判断，未命中INCONCLUSIVE |
| C05 真实取消130，T06/T14 | 对实际CLI等待发送受控CTRL_BREAK_EVENT，覆盖已有合法R/controller及实际Task/Dispatch选择器的等待；真实SQLite写锁可形成实际等待条件，释放只处理自有锁。要求实际os.Interrupt路径EXIT130、单一失败envelope及原R查询诊断；按真实receipt/SDK事件核输入未被自动重发、既有其他Worker未被改作停止或释放。没有真实模型事件时仅登记CLI取消范围，不登记模型保全通过 |
| C06 所属EOF在启动前/启动中，T02/T15 | 使用重定向且真实持有的serve stdin。分别在资源准入/子进程启动前，以及已观察实际node或server创建身份且尚无外层readiness时关闭该所属写端；保存事件顺序、stdout和实际进程。已启动阶段必须确实命中，未命中INCONCLUSIVE且不把另一个阶段当覆盖。要求取消130或真实关闭unknown6、没有成功readiness及第二次结果；全部已观察旧身份分别核退出/保留 |
| C07 所属EOF在readiness后，T02/T13/T15 | 复用真实完整流程已释放Worker并关闭controller后的空闲服务，保存所属node/server/daemon及已观察后代的实际PID、创建时间和路径，再关闭唯一所属stdin。正常0只在原生关闭及两次新鲜退出观察一致时成立；持续存在、查询失败、残留或缺少可核归属保持6，不终止其他进程。核本机Orca实际CLI、进程、端点、配置/认证和ACL保持 |
| C08 readiness前失败与readiness后失败，T02/T14 | 前者用明确已占用的本项端口或真实缺依赖候选副本，要求实际资源/依赖退出码和一次失败JSON；后者复用C04定向终止本项HTTP子进程，要求已有readiness仍为唯一stdout结果，失败诊断/7或6如实返回。收尾沿C07核实际后代；副本只作负向范围，不拼成正式候选成功 |
| C09 stdout实际关闭，T06/T14 | 只关闭本项CLI的真实stdout读管道，使用真实API和原native receipt观察已发生效果；不使用抛错Writer或伪响应。要求输出失败不能EXIT0、不能二次输出或重发，stderr保留已知R及查询路径；完整发布窗口未命中则保留INCONCLUSIVE。serve的readiness写失败同时核所属关闭及未知范围 |

Windows控制信号只允许在本项新建的隐藏console内执行：普通验证helper创建自己的隐藏console宿主，实际CLI作为该console中的新进程组启动；不attach、广播到组0或修改原Orca console。控制前保存创建句柄、PID/创建时间、成功的CREATE_NEW_PROCESS_GROUP来源，并用真实GetConsoleProcessList核console成员全部属于本项已核身份及父链，明确排除原Orca、原S和其他进程；目标group只使用该实际子进程PID。console/group隔离或身份缺证即不发送，记录失败/证据不足，不能替换为强制终止来登记130。实际130及未受影响进程还须独立观察。

已完整读取本机工具链目录`C:/Users/DW/AppData/Local/Programs/go/VERSION`（记录go1.27.2）、`src/os/signal/signal_windows_test.go`及`doc.go`的Windows节：官方测试使用新process group及GenerateConsoleCtrlEvent(CTRL_BREAK_EVENT,pid)，Windows Notify将其交为os.Interrupt。该测试没有创建独立console；本计划的隐藏console隔离是另外必须真实核查的条件。官方网页本次连接失败，未记为已读取或验证；没有执行Go官方测试、console信号、服务或其他本节正文。

所有C项均保存同候选VERSION、准确源码、实际args（不含token）、stdout/stderr原件、退出码/信号、已知原R及真实所属/来源；捕获内容持久化之前核当前token没有泄漏，不把认证字节写到文件。JSON使用标准成熟Decoder判断唯一对象及EOF，文本/退出映射与同一真实结果比较。启动/取消/EOF/unknown沿实际发生顺序记录，不以最终一条结果推断中间窗口；缺Grant保持真实授权阻塞。编译、服务、实际模型与原S窗口继续串行，CPU/内存/BelowNormal/Go/Node额度沿RESOURCES，无额外Agent、提权、驱动或内核采集。

### 7.6 T12接续与strict caller的独立覆盖提案

本节随§3.4待主控和原Reviewer接受，全部新增正文NOT_RUN。建议真实入口为verify-swa-cli-headless.ps1 -Case T12 -RecoveryScenario caller|live|handoff|restart|pending，参数尚未实施或冻结；普通Windows控制helper和真实RuntimeClient测试bundle在服务启动前按同一源码SHA串行构建，服务期间不编译。沿同一准确安装候选、当前真实Grant及固定公开项目，逐R保存实际native Run/Task/Dispatch、generation/receipt/checkpoint、进程句柄/创建时间、Job成员和实际SDK来源。不伪造hook/launch evidence/进程表，不改写Native业务库或加入暂停/延迟故障钩子。

| 条件 | 真实操作与判断 |
| --- | --- |
| R01 真实caller及bootstrap | 分别真实覆盖pending open的runCurrent、首次runCreate/root taskCreate、pending recover的ready/runUse及completed Native R，逐项核§3.4.2矩阵。合法尚未绑定helper正常返回current=null并完成原生启动；无launch的实际普通子进程及真实RuntimeClient调用已有Run/准确方法/真实R和重放completed R均在executor前拒绝。helperless桥接不得调用任何原生写入，restored缺attestation拒绝；未命中细pending窗口保留未验，不拼造wire evidence |
| R02 当前批准及范围 | 使用实际另一项目/controller、按既有人工入口实际撤销的批准/Grant和真实settings变化，核拒绝且无第二Run/helper或generation变化。不伪造human；未具备真实条件的分支保持未执行 |
| R03 旧helper仍活及结算 | 对真实活C_old提交R_live，须明确拒绝/6及effectsApplied=false，原helper/PTY、Run/root/context及generation不变，无新PTY/runUse。保存真实原生effect-free结算及reservation解除；查询或结算未知继续原R/占用，不能以新R替代，其他Worker不停止/释放 |
| R04 连续完整接续 | 延续同一lineage的R03，只有R_live明确无效果且原生结算成功后，才真正结束旧root/helper及PTY，两次新鲜退出核验后由调用者显式提交新R_recover一次。核C_new真实launch、同Run的R/run-use与generation增加，root/context/原Dispatch-session不变；新controller可执行批准动作，旧C_old新写入和第二用户任务拒绝。R_live/结算未知时仅查询原R |
| R05 重放及竞争 | 同R同payload返回同一C_new/原receipt，不多建PTY/runUse；不同payload拒绝。不同R并发分别观察scope-reserved事务和pty-spawn后的真实排他结果，最终唯一consumer；明确无效果拒绝结算后允许新的显式合法接续，未知屏障继续阻止竞争。不改后台或加入屏障 |
| R06 同库重启 | 至少一个真实Worker输入已接受后，只精确停止本项runtime/所属服务，保留私有daemon/session文件及实际原R/SDK事件/Job成员。重启同候选/同D，复开同Job并核原daemon同身份，原请求/任务/Worker观察可用。原helper须全部真实恢复证明；缺attestation拒绝。SDK父Job丢失保持unknown/占用，不重发或替代，不假称模型不中断 |
| R07 原handle关闭后复开 | 保存serve真实退出、原用户handle关闭及Job剩余实际成员，再由新serve真实Open同一个命名Job并加入，与kernel成员及daemon握手互核。对象缺失/权限/嵌套/来源失败必须拒绝，不用新Job空计数登记成功。自然PID复用未命中则不伪造该分支 |
| R08 checkpoint断开 | 一次真实recover中观察SQLite实际checkpoint/PTY/runUse receipt后，只精确终止本项CLI或runtime，分别保存实际命中的边界；查原R及同R只读恢复，不再create/send/runUse。只有completed子R及完整当前proof可完成原outer，其他保持6/占用。未命中细窗口记INCONCLUSIVE，不合成延迟或自动重试 |
| R09 只读及关闭 | 在helper无法核验/pending/已换consumer时，合法project/历史controller的原R和明确原生来源观察可用，跨项目/controller拒绝，成果缺失如实不完整。最终新owner close、Worker归档释放、daemon退休后，全Job两次仅剩serve及已观察旧身份两次退出，才允许EOF正常0；unknown资源仍在时不能0。重复原Orca CLI/进程/监听/配置/认证/ACL及通知观察 |
| R10 recover的真实CLI失败 | 复用C04/C05/C09的实际条件，对真正recover分别观察handler前的连接失败4、可能已进入处理后的真实断开6、隐藏独立console中准确group的CTRL_BREAK取消130及真实stdout读端关闭6。逐项保留原R/C_old/已知C_new、唯一原receipt/PTY/runUse、一次stdout及原请求查询，核无第二副作用。未命中窗口记INCONCLUSIVE，不添加假响应/Writer、延迟钩子或自动重试 |

R04/R06需要结束旧helper时，预编译普通控制helper只对本项已记录root/helper取得真实进程句柄，逐项核PID+创建时间、私有Job membership、Native PTY/安装及父链，再对同一句柄TerminateProcess并等待真实退出；不按PID重新寻找，不终止整个服务Job或其他进程，不把强制退出计为130。随后两次新鲜进程/PTY查询确认旧身份退出，任何缺项或实际PTY未消失即停止该分支并保留unknown。原生controller close满足全部既有资源条件时优先使用该动作。

R04正常接续与R06真实SDK重启未知分别报告，不把非模型Run绑定当作模型不中断。T13最终双Worker并发/指定停止/成果仍须同候选实际完成，不因本节条件降低。当前无新增运行授权；CPU/内存、BelowNormal、Go/Node、原服务及单窗口按RESOURCES，实际窗口由主控重新交付。原失败及INCONCLUSIVE保留，漏项重新交审。

### 7.7 后续正文真实验证补充提案

以下D项随§4.4先审后实施，全部NOT_RUN。沿最终同一安装候选、真实项目批准、同一私有D及已有T13任务，不增加用于代替B的Worker。普通源码编译、安装准入和Go服务条件保持原有范围。

| 条件 | 实际操作及验收 |
| --- | --- |
| D01 T13原样正文与成果 | B原轮结束后保存同一PID/创建身份/session/Dispatch/fence。用实际A部分结果和固定公开原文形成真实followup文件，覆盖自然中文、换行、引号及JSON文本；逐字比较App读取text、原R checkpoint批准text、R/native receipt和真实MessageRow.body、Native journal唯一user text及SDK自产session实际user输入，禁止只比较message ID或模型自述。核同一B第二轮的真实accepted/start/settled、业务结果和超过1200字符完整导出，A及其他Worker/原Orca保全 |
| D02 重复及原生队列 | T13沿同一R真实重放及并发请求，核唯一message/原operation、同一B恰好两次user输入与两轮，不多建Worker。保存真实held/queue边界及queued与实际SDK输入的区别；未实际命中忙碌窗口保持未验，不用替代事件。多封真实显式批准输入的排序/一封一operation只在所需独立分支验证，不混入T13的两轮计数 |
| D03 当前授权与归属拒绝 | 使用实际另一项目/controller/Dispatch、真实停止或释放的本项Worker、真实当前批准撤销/过期及settings变化，分别在提交和原queue消费边界核拒绝。owner私有路由用普通无capability真实HTTP调用须拒绝，不输出Grant/正文；不构造human或假hook。未命中排队后撤销窗口保持INCONCLUSIVE；原SDK没有被输入、其他session没有新user记录 |
| D04 断开和未知 | 复用真实C04及T12：在实际message/operation/SDK accepted边界观察后仅精确停止本项CLI或宿主，保存原R/Native SQLite/journal/SDK原件，再只查询原R/原operation。accepted只能标记同一原消息；pending/unknown/rejected或缺来源不能mint新ID或产生第二prompt。重启失去原SDK树证明保持unknown，原PID/session缺失不以替代Worker完成 |
| D05 编码、大小与坏源 | 使用实际公开输入文件的完整UTF-8正文及当前真实序列化边界，正常中文/换行/引号/JSON文本必须逐字进入同一SDK；超限实际文件在消息创建前拒绝。仅在自有已归档Native/SDK原件副本核坏编码、来源不等和超限读取，不能篡改正在执行的消息或伪造Native协议；原候选原件保全。未具备真实queue/数据库故障条件的输入后存储失败继续未验 |

所有D项保存实际源码SHA/候选VERSION、批准输入文件的非秘密版本、真实message ID/原R/operation/turn/事件来源与退出结果；SDK user输入从自产session成熟schema读取，事件逐项定位真实SQLite。输入前拒绝、队列持有、已接受、已开始、已结束和unknown分别报告。仅合法schema、pointer送达或普通SDK进程存在均不足以通过正文验收；T11待答与T12原门槛保持。

### 7.8 本机注册Agent的真实验收调整提案

以下G项依据用户新增范围、原Reviewer2593的八条件及既有T00—T15，全部先审后实施，当前NOT_RUN；受未决权限阻塞的Agent明确保留，不用另一Agent完成该行。新交付物限定REA由主控安排，原服务及资源窗口照旧。

| 条件 | 实际检查及结果边界 |
| --- | --- |
| G01 准确交付物/来源 | 核主控当前app.asar完整SHA/版本与限定REA原件，逐项核CLI→注册/发现→原生启动/输入/输出/停止及动态资源。保存选定模块/部分覆盖/未知，旧两REA不当新交付物，源码与包差异明确返修 |
| G02 独立发现和刷新 | 同候选capabilities只调用产品私有registry/本产品探测与明确只读设置源，剔除原Orca metadata/桌面RPC依赖的环境后仍完成真实命令/别名/override/版本/配置发现；原Orca保持运行只作可选对照。逐行比较五种状态及来源，标准native源和明确选定的原profile源分别核验，后者缺失/坏源不得自动改用另一源。实际自然变化在下一次发现及spawn前核，未命中保持未验，不更改用户注册/PATH制造成功 |
| G03 指定真实Agent调用 | 对每个声称可调用的Agent分别在真实当前Grant下明确选择，保存实际命令路径/创建身份/私有cwd-env来源/模型与账号来源，核原生handshake、Run/root/Dispatch/session、首输入及后续输入/输出/停止。真实未注册、缺程序、缺配置/能力各自拒绝；无该自然条件时不伪造注册或协议。SDK回显不能替代本机Agent调用 |
| G04 权限与原件 | 首输入及每次后续输入前核实际tool/resource/扩展/MCP、当前Grant和外发目标；原生无法ToolsOff或原账号会写入时必须拒绝并报告真实冲突。跨项目/旧consumer/fence/停止释放目标拒绝，真实撤销/过期范围按原入口验证，不构造human。每个实际event_id逐项定位实际SQLite，并核Agent自产完整会话原件 |
| G05 依赖及独立安装 | 完成原构建/native装载和闭包检查，在新独立安装目录运行同候选；实际依赖与资源来自包内或明确声明的本机Agent程序/只读账号，不来自开发树、原Orca资源或桌面运行通道。缺失动态资源在获准自有副本做真实负向，不能伪造成功模块或以静态metafile代替运行 |
| G06 原Orca保全 | 安装前、发现后、双Worker并发中、指定停止后及产品退出后，重复原绝对CLI公开status、解析、进程创建身份/监听、配置与认证内存字节/ACL、定向通知及实际产品写端检查。原Orca和原Agent会话不被迁移/接管，未解释变化及通知溢出仍证据不足 |
| G07 失败/异步/未知 | 对适用Agent保留真实启动部分失败、忙碌/queued、断开/超时/取消130、stdout失败、停止失败/树未知及资源占用；沿原R/native checkpoint和实际session operation不重发不换目标。在journal已接收但SDK尚未输入的真实窗口撤销/改变当前批准，serialized handOver在实际adapter.dispatch前await新授权，等待后重新核child/consumer/fence/工具策略；未命中保留INCONCLUSIVE。原R完成但仍queued、旧mailbox指针不存在或后续输入到达时，request.show仍从固定原receipt/journal返回同一原operation及真实state，不造Native事件或操作业务库 |
| G08 最终同安装候选 | 使用同一准确已安装候选及所选真实本机Agent，完成原固定公开任务的至少两个真实Worker，不等前一结果即提交；核真实模型活动重叠、分别查询身份/输出，只停止指定A并取得全树退出/B保全，B在同一原生session接受真实后续正文并取得符合业务判据的完整成果。是否要求不同Agent类型不自行增加；每个声称可调用的Agent仍须有G03证据，未通过的范围明确保留 |

G07还逐模式覆盖：明确效果前拒绝保留原child/parent真实rejected结果、无host/PTY写入；实际输入/排队后断开和原生结算失败必须保留R/native checkpoint/operation，不能只在parent保留unknown。原生存储失败仅在真实条件命中时登记，不注入假错误。structured核同session操作/journal；terminal核准确PTY/incarnation、原R/write receipt及handed-to-terminal与实际turn证据的区别，禁止把dispatch-preamble当后续输入。原生模式解析未命中降级/冲突时保持未验，不造TUI注册或SDK会话。

普通终端与原有Agent真实命令工具调用、当前项目批准、真实成果/事件来源及最终关闭继续原验收。注册发现、依赖缩减、源码编译或局部方案接受均不计整体完成；原生ToolsOff/账号冲突由主控处理，其他已授静态开发与独立Go准备继续。

## 8. 审核、实施和真实限制

原Reviewer准确01fd4bc1独立接受本报告396e方案及T00—T15，主控已将接口边界纳入SPEC §21.1并授予§5.3准确程序写域。未回答的新权限问题只阻塞依赖部分，普通命名和组织沿已审方案处理。当前代码正在实现，原本机Orca及来源O保持；构建/测试/服务/模型的动态窗口尚未交付。

准确396e的F01/F02公开factory/provider路径、原生receipt/PTY/Run映射及F03定向组合已经独立接受；实际实现及动态结果继续按H01—H18审核，不增加特权采集执行者条件。

实际尚未证明：最终构建闭包与native装载、严格controller helper及其恢复、Pi SDK只读认证的真实成功和ToolsOff、真实双Worker模型活动重叠、指定停止的全树退出/保全、安装及原Orca文件I/O隔离。发现SDK或原生接口不能提供必要证明时明确失败并提交主控，不能把unknown改成pass或采用当前Claude配置。`jose 6.2.3`及产品运行时依赖已按依赖窗口完成冻结安装；短期凭据与部分真实故障窗口可能无法在一次运行命中，对应分支保持未覆盖。

完整旧S3、MCP、网页重构、历史分支清理、正式实验、用户采用和正式发布均保留各自任务的决定及验收。本次准确返修先交原Reviewer；同一Worker在计划接受和明确授权后继续产品实现及全部真实验收，不以静态方案提交结束整体任务。

## 9. 本次实际检查记录

| 命令/操作 | 实际结果 |
| --- | --- |
| `git status --short --branch`、`git rev-parse HEAD`、两次`git merge --ff-only main` | 接管树干净；普通纳入e149及4e6e，无重置/历史改写 |
| `git -C <O> rev-parse HEAD`、`git -C <O> status --short` | 准确b2879bd5，来源干净；只读 |
| `Get-Content`、`rg`、`git show 30b...:<两份报告>` | 已核文中展开的入口、身份、profile、依赖、Worker及Pi原件；路径不存在的初次查找未当证据，后续按真实路径读取 |
| `orca skills get orchestration`、`orca skills get orca-cli`、`orca terminal show --terminal <本Worker> --json` | 真实CLI指南、当前Dispatch及开发客户端/模型观察；不作为产品能力验收 |
| `python .verification/swa-cli-headless-20261020/inspect-provider.py <明确两处Codex home>` | BelowNormal；标准TOML/JSON解析，仅输出provider/model/协议与认证字段存在性；两处默认OpenAI/gpt-6.1-sol/chatgpt OAuth，无凭据值输出 |
| `git -C <公开验证项目原件> rev-parse HEAD/remote -v/show <准确SHA>:<四文件>` | 准确da3bdddb、固定origin及四份公开原文已读；本轮未核互联网可读状态 |
| `wpr -profiles`、`wpr -help start`、`logman query providers Microsoft-Windows-Kernel-File`、WindowsPrincipal/当前权限只读查询 | FileIO profile和Kernel-File provider存在，查询EXIT0；当前token未提权、两个性能组均false、未见SystemProfile privilege。未开始采集，实际采集权限及范围尚未通过 |
| `node --max-old-space-size=512 .verification/swa-cli-headless-20261020/check-docs.mjs` | BelowNormal；已安装marked18.1.0解析两份文档，4个本地链接、24个Orca及11个Pi关键源码引用存在，EXIT0/PASS；不触发业务程序 |
| `git diff --cached --check` | BelowNormal；两份文档最终暂存检查EXIT0/PASS，无空白错误 |
| 准确方案/程序写域接续 | 原Reviewer01fd4bc1接受396e方案及T00—T15；主控msg_4359842084e5授予逐文件清单和028迁移；干净树普通快进main f7c97d36，重新读取SPEC/Task |
| 来源导入 | `git -C <O> archive --format=zip ... b287...`及`Expand-Archive`实际EXIT0，准确来源进入third_party/orca-v1.4.230，原MIT/Lovecast许可保留，原O不改；没有执行上游程序 |
| 依赖命令初次包装入口 | `powershell -NoProfile -File .../install-dependencies.ps1`被数字签名策略于正文前拒绝、EXIT1/UnauthorizedAccess；dependency-01不存在，两条PNPM均未执行 |
| 依赖窗口与实际命令 | 主控保全并停止原S后交两条命令窗口，在msg_8d5073a63f85明确允许仅本次进程ExecutionPolicy参数。`pnpm install --lockfile-only --ignore-scripts --store-dir .verification/swa-cli-headless-20261020/pnpm-store`及随后`pnpm install --frozen-lockfile --ignore-scripts`同store均EXIT0；pnpm11.27.0，未运行第三方postinstall，完整日志/退出/资源原件位于自有dependency-01 |
| 依赖实际额度及限制 | 锁前CPU7.9/15.4%、可用7306657792/7307067392字节、单调2.50128秒；安装前CPU9.4/14.8%、可用7118417920/7151431680字节、单调2.50120秒。均BelowNormal、Node heap1024MiB，temp/cache/store私有。安装日志保留一次npmmirror/json5超时及pnpm内建重试后成功；未另发PNPM安装命令。窗口以msg_9dca8338f570交回主控 |
| 产品build/model/service/install、产品CLI、T00—T15 | 全部NOT_RUN；仅依赖窗口已用并交回，程序正在实现，未修改全局Agent配置或本机Orca |
| 阶段Go格式与产品空白 | BelowNormal执行新增Go文件`gofmt -d`，修正显示的格式后复查无差异；产品路径`git diff --cached --check -- . ':(exclude)third_party/orca-v1.4.230/**'`实际EXIT0 |
| 完整来源空白检查 | 包含准确上游原有终端录制fixture等的`git diff --cached --check`实际EXIT1，报告原有尾部空白及终端控制字节；这些来源原件保持，不修改上游录制结果以通过格式检查。该失败不计为产品功能测试 |
| F04—F07及Job计划返修的静态检查 | BelowNormal、Node512MiB；`gofmt -d internal/workspace/app/orca_execution.go internal/adapters/httpapi/orca_cli.go`无差异/EXIT0，原`check-docs.mjs`检查两份Markdown、5个本地链接及24个Orca/11个Pi来源路径PASS/EXIT0；未运行程序构建或测试 |

阶段源码包含Workspace App准入、028关联迁移、真实RuntimeClient适配、项目范围HTTP、产品服务组装、私有Node host、原生controller receipt/PTY/helper及Pi SDK ToolsOff入口；四项新增durable方法接入原有mutation executor。主控msg_eaaf01e60d77允许供原Reviewer先静态CR，编译和真实运行结果均不据此推断。CLI/结果导出、构建安装脚本、定向保护和T00—T15实现仍在本Worker继续；当前源码尚未形成可安装候选。

准确阶段源码`847ec2687857b06430284aecdf81a6887f2f996f`已普通push、EXIT0。原Reviewer准确`80ed37f6af51f6c38df4f811d8e6c8f2376c089e`对F04—F07退回；当前返修将controller单任务与Worker额度准入/checkpoint合并到既有原生事务，按真实`row.resource.release_state`判定资源，并保留已认证human不依赖Agent执行批准和旧context版本的安全停止。它们仍须准确后继复审和真实测试。§5.4及T09/T13的Job与句柄设计属于本次待审核差异，相应依赖/构建和动态窗口未使用。

原Reviewer通过msg_08a9c85e2399只读确认6168的F04—F07静态修复成立，并提出F08关闭与已保留创建的竞争。当前同一Worker按上文补关闭屏障和T06/T11差异，待准确后继独立核查；该消息没有授予动态窗口或代表整项功能接受。CLI、成果导出、私有服务和构建安装仍在实施，全部实际功能验收保持NOT_RUN。

当前程序阶段已形成CLI/HTTP/App命令、成果原生分页及项目允许目录导出、独立私有HTTP服务组装与所属启动管道、Node父持Job及模型前真实IPC准入。补丁把独立Provider Job导出接入原node-pty编译；构建入口将获准`native/swa-provider-job.h`明确复制到候选node-pty源码再编译，原daemon通用Job逻辑保持来源行为。`native-cli-entry.ts`在父Job准入后解析已选实际命令并启动原生CLI；账号投影和启动参数由§13及§15约束。关闭结果和原生生命周期只在完整Job验证后发布，启动失败同样要求root/tree共同退出；当前缺句柄、查询失败及原runtime generation失配保留unknown与占用。

当前固定Worker流程复用原生founding fence1及首次输入的reservation fence2；Pi launch仅接受本runtime新登记、未持有旧provider handle的这一次实际reservation。后续输入复用现有活跃session/进程，SDK进程退出或runtime重启后不自动新建替代者。此处依据实际foundConversation/reserveOwner及structuredWorkerIdentities来源，仍须真实首个输入、同session后续输入及T12验证；没有用fence数值本身判进程退出。

构建入口为`node --max-old-space-size=1024 scripts/build-swa-package.mjs --output <本树dist内新候选绝对目录>`，明确使用已安装PNPM11.27.0入口、注入workspace闭包的pnpm deploy、固定官方Node24.21.0输入、候选内四个native模块编译、真实esbuild及`go build -p=4`。新增node-gyp12.3.0沿上游锁声明；workspace注入和补丁变更尚待lockfile-only及frozen ignore-scripts安装，当前锁和生成的HTTP类型尚未同步，不能构建验收。`check-swa-runtime.mjs --candidate ...`检查闭包及真实二进制装载，不替代SDK认证、普通后代fixture或T13模型验收。`install-swa.ps1`采用包内Node复制实际依赖内容至明确新目录并设置私有ACL，尚未执行。

本阶段实际轻量检查：修改的八个Go文件`gofmt -d`最终EXIT0；安装PowerShell的Language.Parser.ParseFile无语法错误、正文NOT_RUN；真实Git patch解析`git apply --numstat`接受node-pty补丁，产品差异`git diff --check`EXIT0。格式检查此前发现process_windows.go的字段空格并已通过文件编辑工具修正；检查不表示编译、安装或真实功能通过。

阶段源码10deb049及普通纳入main13974后的f0ba550352ea28b63b008c12542e83dc47adbdf3已普通push、实际EXIT0。后继继续同一Worker补验证：CLI在传输前复用App同一字段校验；普通进程fixture使用实际安装Node、共同bootstrap和原ManagedProviderProcess/Job关闭适配，现已编写正常、强制、root异常、最后派生及无关Job保全和真实负向句柄/创建身份用例，尚未运行。T09父宿主失联、实际SDK abort后关闭及缺native预输入等分支仍待补齐，验证入口对未完成分支返回证据不足，不能把局部fixture成功登记成T09通过。原生Job补充拒绝已归另一自有Job的同一root，两个Job的实际目标仍分别核验。

原Reviewer msg_331f32dfa9f5接受准确f0的F08静态修复，F09要求实际已创建的root必须先取得成功分配及真实成员见证，才允许全树结算。当前返修保存该必要见证；分配或成员缺证即保持unverifiable、保留Job外部对象和原会话，不以之后root消失和空Job结算。真实spawn未创建任何进程的processless另按实际无PID/原生error+close观察清理未绑定空Job，关闭结果tree=null，不输出已绑定全树退出证明。普通fixture已补实际Node先退出再绑定的缺成员见证，以及确实不存在程序的processless输入；两种结果分别断言unverifiable和无树证明，均未运行。另补真实父宿主失联、错误创建身份、已绑定另一自有Job、已关闭句柄和缺native副本，实际SDK abort分支仍待实施。

主控prepare-02在停服前被真实资源门限拒绝：其ask回复记录UTC11:00:16 CPU7.2%、可用3.529GiB不足4GiB，原S12800未终止，没有prepared/window-ready；本Worker全部新Stage仍NOT_RUN。失败原件由主控保留，后续只在明确新窗口交付后执行，不降低门限或自行终止其他进程。

第三方子树按Git archive导出视图导入，包含产品适配；原Reviewer使用准确Git对象核得导出视图省略docs/audits、其他文档/审查工具及部分tests/tools，另有Windows导入形成的执行位变化。LICENSE及根package/锁与准确b287来源相同。当前不把该子树描述为完整原树逐项相同；Windows实际构建闭包仍需逐入口验证，未执行上游录制fixture或为其原有空白修改原件。

本次仅通过当前Dispatch的Orca通道交付，普通commit/push方案与阶段源码；没有发布GitHub评论、PR、Slack消息或公开artifact。

准确0c6c701d及普通纳入main4b后的f2bcba97已push；HANDOFF/STATUS和SPEC21.1已重新读取。原Reviewer对F10—F12静态退回后，本Worker在原模块修正实际事件订阅、ownerProcess变量及SDK消息/entry结构校验；准确后继仍待复核。事件订阅沿完整读取的Microsoft [Register-ObjectEvent](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/register-objectevent?view=powershell-7.5)及[Get-EventSubscriber](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/get-eventsubscriber?view=powershell-7.5)契约，按实际subscriber保存及复核五项身份、读取Error并注销；不从注册命令的默认输出推断订阅。SDK schema依据准确Pi1.0.1的SessionManager及pi-ai消息、内容块、usage和diagnostics定义，用Zod验证受限分支，完整成果还要求最后实际assistant具有非空text与正常stop；SDK cost原字段保留来源，实际账单成本仍unknown。

同安装候选的T13驱动已编写：真实CLI并发提交A/B，核私有SDK实际delta区间、准确停止A/B保全及同session后续输入、完整B成果和逐行真实SQLite来源，期间重复本机Orca定向保全。业务语义和普通终端实际调用须由当前控制端基于真实产物核查后，才能显式完成根Task；脚本不自动生成人工批准。T07仅使用该真实运行产生的SDK原件副本，按成熟JSONL解析/序列化覆盖完整读取、缺失、截断、坏编码/JSON、超限、替换、未知内容块/entry和坏字段，原件逐次内存比较保全。所有新增脚本及故障用例正文均未运行，不作为验收通过。

构建静态核查发现node-pty的获准patch只编译conpty.node；当前沿准确上游`slotSourceFiles`补齐其实际ConPTY DLL/OpenConsole及console-list prebuild到候选build/Release，闭包检查逐件要求存在。实际native编译与PTY启动仍未运行。Pi factory另核实际thinkingLevel为xhigh后才允许输入，SDK准备检查相应保存真实值。新资源窗口未授予；最近主控只读观察可用1.85GiB，S12800与原Orca保持，全部依赖后继/生成/构建/SDK/安装/模型均NOT_RUN。

准确abdb07d3的F10—F12静态修复已获原Reviewer a211b66接受，F13/F14交回本Worker后已形成后继源码：T13复用实际evict Stop事件及其原生turnId，用准确上游journal fold读取停止标记前running和之后实际interrupted/真实SDK aborted取消结果，排除自然完成和空结束集合；不要求A产生完整SDK成果。B先完成原轮，再在同一PID/session/fence接受后续输入。T07成熟stringer显式suffix换行，加入有效往返对照，并对八类坏结构要求对应Zod错误路径或明确的不完整错误；共19项实际原件副本场景仍NOT_RUN。实时SDK事件观察读取实际append-only日志的有界完整前缀并比较历史前缀，完整SDK成果则继续严格要求读取前后文件身份/长度/时间一致；journal采用既有SQLite适配器的read-only/must-exist连接，不调用可能修复状态的host db getter。

后继Go检查与串行编译入口、T02真实端口/保护根/junction拒绝及已跟踪的资源采样器均为静态源码。安装Case在私有服务消费者尚未验证时返回证据不足；T03仅Go范围完成同样保留其他分支。gofmt -d、PowerShell ParseFile及git diff --check实际通过；没有编译、执行测试正文或运行服务。abdb普通push初两次TLS握手失败，主控观察网络变化后再一次普通push及ls-remote均EXIT0，远端准确abdb07d31954b9e72f12bdaafdfe56406deb9004已核；未force或更改证书/全局配置。最新主控只读可用内存0.376GiB，无新窗口。

准确39cc967df6a71b2c0c22e3daa520ca08331db17e已普通push并经主控再次核远端；F13/F14及四包Go检查源码待原Reviewer复核。T06核查发现App重新采样context和创建前后scope变化会使相同task.create请求指纹变化；当前按§3.3仅规范化比较副本，保留全部业务正文、版本、路径、权限及主体/作用域绑定，并补实际非模型CLI检查和T13重放/第三席拒绝。所有新JS/Go/SDK/模型、依赖同步/生成/构建/安装及测试正文仍NOT_RUN；主控最新只读可用0.247GiB，S12800和本机Orca保持，无动态窗口。

准确9741fccb8f705b057b913e617d9ae522536c1e88的普通push及本Worker ls-remote均EXIT0，主控独立ls-remote随后连接失败，后者保留失败且不计为已核远端。后继修正swa原生拒绝code边界和未知关闭/创建占用的退出码，补真实SQLite写锁拒绝源码；`gofmt -d cmd/swa/main.go`无差异、PowerShell ParseFile及git diff --check实际通过，所有程序正文、类型检查、编译、模型和安装仍NOT_RUN。

准确2c007de5ec54ce1cdb11a2f6052a116d1dc958c4已普通push，Worker ls-remote同SHA/EXIT0；后继补T06真实所属CLI断开源码与实际原R查询，不将正常回执或未命中窗口写成断开通过。PowerShell ParseFile和git diff --check实际通过；T06/T08及其余程序正文均未运行，原动态窗口和资源限制保持。

准确72c7b8961a5677c7291967448507d3fc64340a4b普通push和Worker ls-remote EXIT0；后继修正App在`request.show --controller`之前解析pending任务而阻断原请求观察的问题。当前查询仍核当前项目批准及原receipt的project/controller，错配明确scope_denied；真实非模型用例补project/controller查询等价及另一实际controller拒绝。gofmt -d和git diff --check通过，pending/重启分支及全部程序正文未运行；主控最近只读可用0.396GiB，窗口未交。

主控要求的§7.5已按准确8220基线补充CLI输出/原R、真实ErrorV1、网络unknown、取消130及serve自身EOF/后代关闭测试计划，待原Reviewer独立接受；当前只改两份文档。没有实施该补充的程序或验证正文，没有向任何console发送信号，动态窗口仍未交付。

准确b3f0e229的§7.5计划已获原Reviewer d7fbcfb097275c27255a8ab4a77a3d517c25c81a独立接受，主控msg_d7ccfb662bde授予原CLI写域静态实施；准确39cc的F13/F14和四包Go计划/源码已由2bd10d21接受。它们均不表示动态通过。原Reviewer提出F15后，T06用例将成功重放控制放在实际context文件变化之前；文件恢复原字节后仍核实际mtime已变、size/字节相等，并继续要求request_mismatch。实际ContextFile.Version包含mtime纳秒和size，首次原生固定context仍逐项不变；没有重写mtime、剔除version或创建替代任务。所有正文NOT_RUN，§7.5程序接续实施但尚未运行。

准确c35ec0d9的F15静态返修已由27f7326a830c8c2930c77457b693eded6045b54c接受；a9eb2745分别接受9741的规范化/receipt、2c错误映射、72断开源码及8220原请求查询的静态范围，实际功能仍未验。本Worker已完整读取准确main30cd759f的HANDOFF/STATUS及SPEC §21.1条件。

§7.5首段CLI源码采用单次发布状态、标准成熟JSON Decoder/UseNumber及明确的native/ErrorV1分支：本地错误发布到stdout，合法已解析原R和已校验selector保持；完整HTTP ErrorV1保存在原有error.data，原生结果/错误数据保持，HTTP header trace独立写诊断。取消及断开保留原R，stdout部分/失败写入不再二次发布，已知关联留stderr；三个传输前Go函数按单一envelope及真实参数解析顺序更新。gofmt -d和git diff --check实际通过；没有编译或运行这些函数。serve自身EOF、后代退出及C01—C09实际安装驱动仍在同一Worker实施，本阶段没有对应完成结论。

准确准备提交`f08b52111d4860b5ef162987cce2f43f4a4e6ce0`已普通push、EXIT0，仅同步`pnpm-lock.yaml`及生成器写入的`web/src/api/schema.d.ts`。主控msg_36cd7da9f442授予的依赖同步和类型生成已各执行一次，`dependency-02`的lock/install及两次资源退出文件、`generate-01`的生成及资源退出文件全部为0。lock/install原件保留PNPM内建镜像超时重试、peer及deprecated警告；没有重新执行Stage。生成采样为UTC13:39:28.207744/13:39:30.709170、CPU6.1/6.6%、可用11279286272/11206463488字节、单调间隔2.5014694秒。原件均在本树忽略目录`.verification/swa-cli-headless-20261020/`；准备成功不表示native构建、类型检查、安装或功能通过。主控msg_c1830bb219c7已收回窗口；其后msg_64e6ab2a20de确认restore-03 EXIT0、原S同源恢复PID43068及创建UTC13:41:49.053571、唯一64505监听，原库/环境/配置及本机Orca核查通过，Worker没有操作原S。

§7.5后继静态源码在`serve`读取自身所属stdin，以实际EOF取消启动或结束已就绪等待；启动前取消输出单一失败envelope，readiness后只写stderr诊断。所属子进程的完成状态可重复观察，先消费实际stdout至EOF再Wait；实际子进程失败保留7，关闭未确认保留6，不消费同一个Wait结果后再等待第二次。普通CLI及serve共同使用单次输出处理，原无消费者的report已移除。C01—C09真实安装驱动仍待实施，这些源码尚未编译或运行。

所属进程观察采用当前`serve`在创建子进程前自建并绑定自身的Win32 Job；只设置这个新Job，不设置kill-on-close、breakaway或全局限制，不修改原Orca或IDE所属Job。开始时核当前进程成员及ActiveProcesses=1；node/server启动后逐项以真实进程句柄核成员、创建时间及非空成员数。关闭直接子进程后，连续两次新鲜accounting查询必须都只剩serve自身，查询失败、缺失成员、仍有后代或句柄失败均保持6，不使用PID推断或广域终止。官方[嵌套Job](https://learn.microsoft.com/en-us/windows/win32/procthread/nested-jobs)、[基本accounting](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_accounting_information)及[AssignProcessToJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject)已完整读取：accounting包含子Job成员，创建前绑定保证普通子进程进入本Job链；实际嵌套及ConPTY兼容性保持NOT_RUN，不将静态API契约当成本机通过。

正常关闭还要求私有host在关闭RPC后从实际原生库确认无pending receipt、全部Worker资源released、每个真实controller有准确completed close，以及所有daemon代际的权威PTY清单为空；随后原有daemon退休、profile flush及全部cleanup必须实际成功。只有此时host在原私有stdout写入所属关闭确认，Go核其实际runtime/data与readiness一致并等到EOF；这条内部生命周期记录不增加公开CLI字段、RPC方法或执行账本。资源未释放、未知输入、未关闭helper和缺失确认均不能得到正常0，原记录保持；C06/C07/C08/C09还须按既定实际进程、原库和原Orca保全条件验证。当前仅gofmt -d及git diff --check通过，没有向console发送信号，没有运行服务、构建、安装或模型。

本次既有`node --max-old-space-size=512 scripts/check-architecture.mjs`首次实际EXIT1，唯一报错为App引用`io`。已在原`orca_execution.go`写域采用成熟`json.Valid`校验完整单JSON，再由原有`DisallowUnknownFields` Decoder读取任务规格，移除该I/O依赖，未更改架构检查规则。源码修正后同一命令实际EXIT0，45个Go package满足Domain/app/context/transport规则；两次原件及退出文件分别在`static-eof-01`与`static-eof-02`。两次均BelowNormal、Go单并发/256MiB、Node512MiB、私有TEMP，GOPROXY=off及本机工具链；按RESOURCES静态豁免执行，只进行Go list及边界判断。五份Go源码gofmt -d无差异，git diff --check EXIT0。此结果没有编译或执行Go函数、TS、SDK及服务。

准确c0ab15e50d230a93a0aca17ea12e1f5c132ccb5c已普通push。主控msg_06a708e7594c正式授予的一次`next-window.ps1 -Stage build -EvidenceName build-01`已实际运行，资源UTC14:13:01.942490/14:13:04.443455、CPU7.2/6.5%、可用11307388928/11310837760字节、单调间隔2.5009953秒通过，build-resources-exit=0。构建Node48860在`mkdir(output)`实际ENOENT、build-exit=1，本树缺少dist父目录；失败发生在PNPM deploy、Node下载及native/TS/Go编译之前。两次新鲜CIM定向查询该Node及直接子进程均无匹配，实际Node命令已退出；完整log/退出码和processes-after.json保留在build-01。没有自动重试、补目录后重发或候选VERSION；主控已收回窗口并确认restore-04 EXIT0、同源S45948及原库/配置/Orca保持。后继在原构建脚本写域创建受控dist父目录，以lstat/realpath核其为真实仓库目录及候选实际父路径未越界，候选仍使用非递归mkdir独占创建。git diff --check通过；修正尚未运行，不为MODULE_TYPELESS警告修改上游package。

准确897531d5d2978e3a51a043063a26e254b3d0f766的T12提案已由bad4d7c55249e310286a946e4a3eb603ef7060b3退回。当前§3.4.1—3.4.3和§7.6补齐P01—P03：recover的全部写动作/输出/取消消费者及真实R10，合法bootstrap与completed重放的前executor矩阵，scope-reserved/pty-spawn边界及明确无效果拒绝的原生结算；R03/R04连续同lineage和R05竞争保留。主控尚未定稿，原Reviewer尚未接受，不实施T12程序或执行新测试正文。

主控msg_c1bdd050117d授予准确897531的一次build-02，实际资源检查0、构建1。UTC14:29:15.977114/14:29:18.478317的CPU32.9/5.0%、可用11693080576/11724275712字节、单调2.5012121秒符合门限；实际PNPM deploy完成323项依赖，原慢镜像警告保留。固定Node24.21.0首归档fetch触发原10分钟AbortSignal，build-exit.txt最后写入UTC14:47:59，日志原始TimeoutError及实际Node v24.16.0保留。候选仅runtime及空node目录，私有work无归档，无headers/native/TS/Go或VERSION。session82066已实际退出1；UTC14:49:02.0811535及14:49:27.8535268两次新鲜CIM的原Node18536/子9272及其直接后代均为空。完整原件和部分candidate01保留，没有重试、删除、修改超时/来源或执行版本/安装检查。主控msg_e00d82c78306收回窗口并解除tracked/Git冻结，msg_a7130df1a33c确认restore-05 EXIT0、同源原S18944及原库/环境/配置/Orca保持；Worker未操作原S。

F16按准确原生RunShowParams及runs handler修正现有helper为runShow({id: run})；F17参数按真实MESSAGE_TYPES及原生send默认值修正为type=status，上游枚举不变。当前仅消除两处参数错配，真实完整成果和后续正文尚未通过。RuntimeClient.call直接发送params，并仅在第三参数的orchestrationRequestId形成原生durable R；各写动作固定子R保持。

| 现有helper调用 | 本次真实schema及直接消费者核查 |
| --- | --- |
| runCurrent/runCreate/runShow | from、objective/from、id/from分别对应真实runs参数；observe使用自身controller，task.create创建唯一Run，成果按真实id读取 |
| taskCreate/taskList/taskUpdate | 首根Task用spec/taskTitle/callerTerminalHandle/run；明确run的taskList可观察，taskUpdate使用id/status=completed/result/run/callerTerminalHandle。固定spec/context和原R/root-task、R/native保持 |
| workerStart | 真实spec/from/run/parent/worktree/name/taskTitle/agent/model/effort/timeoutMs，task与spec的原生互斥条件保持；使用pi、openai-codex/gpt-6.1-sol及xhigh，不改原生模型解释 |
| workerShow/workerRead/workerList | dispatch、source=transcript及limit/cursor对应schema；workerList显式run/paginate/limit100，真实ORCHESTRATION_FLEET_PAGE_MAX=100。成果遇page.hasMore继续拒绝不完整清单，workerShow真实投影assigneeHandle用于准确收件人 |
| workerStop/workerRelease | 真实WorkerDispatchParams的必填dispatch及准确R/native；没有from字段仍须后继§3.4真实caller强准入，不把schema可接收计作权限成立 |
| send | 真实from/to/subject/body/type=status/run及R/native；to来自该Dispatch实际assigneeHandle。参数修正不能改变structured投递仅包含check提示的既有语义 |

已完整读取structured-mailbox-pointer-delivery、structured-mail-source和Pi rpc-prompt链：当前实际AgentJournalMessageItem.blocks只有formatMessagePointer提示，source只有原生ID引用，Pi仅把text blocks连接为SDK输入，不回查MessageRow。ToolsOff Worker无法自行取正文；原Reviewer1b2954d9已提出七项独立条件，主控msg_0458b95cccf2同意完整方案先审后实现。正文语义未编码，不把合法枚举或消息回执登记为worker.send完成。T07/T13的实际task.result、完整成果及同session真实后续输入仍为必要验收。

原Reviewer准确7c6d39732d8779fdc8a49aa887aa0a9f04a2388b接受079bd的T12 P01—P03完整补充及R01—R10计划，准确da2e7268c66eb3c3f0d9c7de9c4935b4fd5519d1接受ebf的F16/F17参数局部静态返修，准确48385383接受c2独立Go源码检查顺序。主控尚未冻结T12或2f正文接口，相关程序保持未实施。按msg_8daabc14f03b仅静态修改原compile入口及现有T03消费者：移除候选前置，三函数前新增真实资源准入，拒绝SKIP，结束重核同一干净HEAD后才写原SOURCE；T03在任何服务启动前核真实VERSION=SOURCE=准确干净源码。仅PowerShell语法与差异检查，编译/函数/服务均未执行。

## 10. 独立发现与明确选择的静态实施

本节实施依据为独立c3fca056对准确740的局部接受，以及main `ff2a08615fedfeda0a11e46c0157796cdd84c979` SPEC §21.1.1和主控`msg_7e45c71a05be`的原写域静态程序授权。当前阶段没有重操作窗口，全部生成、编译、运行测试、服务、Agent和模型正文仍为NOT_RUN；原S由主控维护，旧build-01/build-02均已消费，原件和失败结果保留，不重复Stage。

- `serve`读取非秘密的本机home、AppData和Agent配置目录定位，传给本产品后台作只读发现；实际子进程继续使用私有HOME/TEMP。显式`--agent-profile`固定既有原目录，产品启动不再要求Pi SDK入口或Codex OAuth文件。配置定位不赋予账号写入、原生工具或模型调用权限。
- Go App增加`Capabilities`及`ResolveSelection`端口。发现沿当前observe、ProjectSettings和实际Grant；返回前重新核设置revision与Grant动作。模型动作先observe解析选择，再按真实CLI ID核现有`ExternalModelCLI`单CLI批准，选择进入严格invocation与原R。
- Native capabilities使用实际host的StructuredAgentRegistry和真实adapter。产品catalog及Pi factory恢复原生Pi/Codex/Claude/ACP调用定义；产品host显式关闭模型catalog预热。安装观察使用原生命令解析和实际`--version`，序列执行，不建立Agent会话或模型请求。configured只输出已证模型、提供方和非秘密账号来源类型；可启动、完整读取、恢复和工具策略缺证时保持unknown，声明能力有单独source。
- 只读profile入口复用原生存储分类、read-only数据库和同snapshot中的settings/revision。JSON-only由现有`@streamparser/json`只保留settings；并存时以原生acceptance marker核实际JSON字节和同数据库revision，不读其他数据库业务域，不迁移或写入原源。原生`projectAgentLaunchSettings`提供启用/命令投影。Codex/Claude/Pi的必要JSON/TOML配置由成熟解析器读取，原生托管账号选择及显式目录分别核；缺失配置保持未知，显式损坏立即失败。
- `swa.resolveSelection`只解析明确Agent/model或实际Dispatch原启动receipt/session，不接受新的后续选择参数。原生Worker identity保留已有Dispatch关联；产品安装的launch准入从原parent/child receipt取选择，实际原生command resolver采用该明确程序，并在返回launch前重新核配置、原session/model与实际解析程序。此处没有新执行账本或SDK替代调用。
- JSON Schema、OpenAPI组件、CLI帮助、随包USAGE及现有真实Go检查消费者同步。registry的artifact_sha256取本次实际安装`runtime/host.cjs`，source_revision取同安装VERSION；当前本机原Orca ASAR的6a9只保留为REA对照来源。生成的Web类型继续等待独立窗口，未手改生成文件。

实际静态检查使用BelowNormal：`gofmt -d`覆盖本次七份Go源码与真实检查文件，无差异；已安装TypeScript解析本次18份TS/JS文件，JSON Schema及OpenAPI YAML解析通过；PowerShell只执行Parser.ParseFile，未运行脚本正文；`git diff --check`通过。现有`check-architecture.mjs`仅走原go-list及导入边界检查，Go单并发/256MiB、Node512MiB和本项私有TEMP，实际EXIT0，45个package通过，原件在`.verification/swa-cli-headless-20261020/discovery-static-01/`。上述检查不代表类型检查、编译或实际原生调用通过。

真实剩余范围：ACP账号/模型来源尚未由此只读模块证明，通用原生账号读取、工具与私有运行隔离仍须按具体Agent和用户批准补齐；现有SDK事件/成果和Job驱动须按实际选定原生Agent继续调整并重新验收。61a提交不含N04/N05普通后续正文与TUI程序及T12恢复；后继main a6f387ff已定稿SPEC §21.1.2/21.1.3并授予同一Worker在原写域静态实施，重操作继续未授予。最终仍需新同源候选的依赖闭包、完整真实Go/Native检查及同安装双Worker并发、指定停止、后续输入和完整成果，不能以发现与拒绝代替调用交付。

主控`msg_76daae3c5a72`要求核首装人类批准入口：当前包未带Web资产、serve未提供SPA，新私有根也没有预置Grant；USAGE所列REST路径不能代替可完成的人类操作。Worker继续只读核现有会话/批准界面和打包路由，先提交准确既有资产、路径、完整操作与测试计划；未审前不创建新Web模块、伪造human会话或代用户批准。

## 11. 首装人工授权流程与Pi实际launch消费者返修

已完整读取现有`session.go`、`server.go`、`classification.go`、Attention的CommandMeta/CreateProjectSpace、LocalProjects的严格HTTP DTO和App设置/Grant/token实现。包无需增加Web资产即可保留现有用户REST入口：用户本人从同一安装服务`GET /api/v1/auth/session`取得真实cookie与CSRF，创建实际空间后使用space.id登记实际公开目录，按返回的settings.revision更新完整设置，再按实际project.id和调用端agent_id建立Grant并签发credential.token。所有写入仍要求既有schema_version、request_id、expected_version、Idempotency-Key和CSRF；项目设置另外使用expected_revision。HTTP正文没有actor字段，Agent bearer不能取得human session、修改设置或签发token。

`runtime/swa-orca/USAGE.md`现提供完整PowerShell正文、真实响应变量、初始仅observe批准、实际status/capabilities、执行权限的单CLI/目录审阅与重新Grant/签发、实际一小时expires_at及未知创建/版本冲突处理。用户在普通独立窗口逐段运行，Worker与Reviewer不执行human bootstrap或代用户批准。工具和账号条件保持；当前AllowedTools非空拒绝及旧四CLI批准消费者缺口明确说明，不以文件中的权限示例声明原生工具已关闭。

适用T02/T03检查：在新同源安装和新私有根，用户本人按随包USAGE取得真实会话，执行空间→项目→当前revision设置→Grant→token；Worker只接收用户签发的实际项目token，调用同一安装CLI的status/capabilities并逐项在实际SQLite定位space/project/settings/grant身份及版本，不输出秘密。必要负向为带Agent bearer的bootstrap、设置/Grant/token请求拒绝，缺CSRF/过期human会话拒绝，旧settings revision冲突，Grant替换/撤销和token重新签发使旧token失效；由合法当前身份和真实原件执行，不伪造会话。项目目录/CLI/tool请求保持已批准条件，失败即保留未验状态。程序/安装正文当前全部NOT_RUN；本轮仅核来源及解析文档内PowerShell语法。

原Reviewer对61a指出的Pi消费者缺口已沿实际链返修：`rpc-session-adapter.acquire`所调用的导出`buildPiRpcLaunch`现在直接构造原生`--mode rpc`命令，拒绝sdkEntry；不再有未消费的另一个native builder。`piRpcLaunchPart`以原生`isAgentChatPermissionMode`校验真实basis/record来源，仅实际持久枚举`full-access`形成fullAccess=true；缺失或未知记录值不授予。原生factory恢复不构成工具批准。实际Pi认证、模型、同session输入、Job与成果未运行，相关剩余范围保持。

独立准确be1b18b7退回61a的N06—N09已完整读取。上述返修处理实际Pi builder；N07真实配置/defaults与N08实际record.accountHome、launch账号来源及工具策略仍未通过，不能把程序路径/重读发现配置当成账号和工具已绑定。N09由下节完整窄端口提案处理。后继需要改变稳定选择字段或跨模块签名时，先提交完整契约审核和主控定稿；未知来源/工具保持首次输入前拒绝条件，不设置原home为可写运行目录，不开放用户未答权限。

本次实际静态检查为两份变动TypeScript源码解析、JSON/YAML和两份任务Markdown/来源检查及`git diff --check`，均EXIT0；USAGE经marked18.1.0提取的14个PowerShell片段逐一通过原生Parser.ParseInput，只解析语法，没有运行任何human、安装、服务或模型正文。主控70ca0723当前总契约和be1完整新增审核段均已实际读取。

## 12. 原生CLI外发批准消费者

本节接口按SPEC §21.1.4及独立b64技术接受实施。配置Orca时，`SetProjectSettings`通过同一真实adapter核实ExternalModelCLI的实际Native注册；产品StructuredAgentRegistry包含旧四CLI之外的ACP Agent。HistoryRoots和未配置Orca的产品继续使用旧NativeRegistry，两个注册来源各自保持原消费者。

唯一方案是在Workspace App声明`ExternalCLIRegistry`只读端口`ValidateExternalCLI(ctx, cliID) error`。LocalProjectService保留原构造器，以一次性的`ConfigureExternalCLIRegistry(port) error`在Composition中绑定，nil或重复绑定立即失败。`SetProjectSettings`仅对非空ExternalModelCLI使用已绑定端口；未配置Orca的原产品继续调用既有NativeRegistry.Adapter。HistoryRoots、旧S3原生会话、NativeAdapter及其原验收维持原消费方；端口失败不改用旧registry。

SWA Composition在HTTP开放前构造明确安装/私有profile的同一orca adapter，将其注册验证端口注入项目服务，并复用该实例构造OrcaExecution。adapter新增只读bridge operation `registered_agent`，私有Native方法`swa.registeredAgent`从本产品实际StructuredAgentRegistry返回所请求ID及真实adapter/执行模式/来源；后继terminal只在真实TUI配置和已绑定PTY launcher/controller共同存在时可用。该校验不读原Orca RPC，不运行版本探测、会话或模型；未知ID、实际registry缺失、传输/元数据不匹配立即失败。它只证明注册，不证明安装、账号或可启动，启动继续按明确selection和当前批准核验。

跨进程契约固定为以下非秘密结构，复用原OrcaEnvelope，不新增请求账本：

```typescript
type RegisteredAgentRequest = { operation: 'registered_agent'; agent_id: string }
type NativeRegisteredAgentParams = { agent_id: string } // swa.registeredAgent
type RegisteredAgent = {
  schema: 'swa.registered-agent.v1'
  id: string
  adapter: string
  execution_mode: 'structured' | 'terminal'
  registered: true
  source: { kind: 'structured-registry' | 'tui-launcher' }
  source_revision: string
  registry: { orca_version: '1.4.230'; artifact_sha256: string }
  runtime: { runtime_id: string; authority_domain: string; data_root: string; install_root: string }
}
type RegisteredAgentReply = { envelope: OrcaEnvelope /* result: RegisteredAgent */ }
```

bridge请求及Native params均strict、agent_id非空；没有project批准、Grant、调用者声明或可转发方法字段。Native从实际registry的registration(id)取definition及adapter；terminal从已接入的真实模式绑定取事实。未知或不完整注册返回原生明确错误，不返回registered=false成功对象。私有owner transport继续按SPEC21.1.3核验；新空DataRoot的人类设置校验不先要求ExternalModelCLI、Agent Grant或已批准的capabilities请求，因此没有首次授权循环。

Native读取本安装VERSION的完整40位source_revision和本安装runtime/host.cjs的SHA256，runtime字段取实际runtime ID、原SQLite authority及已核canonical私有data/install根。Node RuntimeClient保留真实响应_meta.runtimeId，将其填入既有envelope.runtime_id；authority_domain取同次Native结果，原RPC metadata/source fence保持。Go adapter严格解码并逐项要求：ok=true且无error；schema和registered精确匹配；id等于原请求CLI，adapter非空；execution_mode及source.kind成对；完整revision等于Config.InstallRoot下实际VERSION；artifact等于同根实际host.cjs；runtime.runtime_id等于真实RPC envelope的非空runtime_id，runtime.authority_domain等于非空外层authority_domain；canonical data_root/install_root分别等于本adapter的明确私有/安装根。任一字段缺失、未知、错误或不一致立即返回证据/依赖错误，只有全部通过才ValidateExternalCLI返回nil。它不执行全量发现或命令版本探测；文件摘要只核准确安装来源，不参与执行状态或另建Hash系统。

main准确`3d82bfedf08af471c974461bf6ac008b9e1e5324`按独立`b64c90d0647e8c5ddd7478999818fc00e582fdd3`接受将接口定稿于SPEC §21.1.4，授予`internal/workspace/app/contracts.go`、`internal/workspace/app/projects.go`及新增`internal/workspace/app/external_cli_registry_real_test.go`窄写域；现有Composition、orca adapter、runtime、契约与本任务两文档沿原写域同步。HistoryRoots和旧S3 NativeAdapter继续使用原注册者；AllowedTools非空仍拒绝。

必要检查为：实际安装Native registry中一个旧四CLI之外的已注册ID可通过注册端口且其来源对应同一候选；用户本人能以该实际ID更新单CLI批准并取得真实settings revision；旧批准CLI与另一真实选择不匹配时在模型前拒绝；真实未知ID/未绑定TUI/Native服务不可达拒绝且原设置未变；无Orca配置时原四CLI/未知ID行为及HistoryRoots/旧NativeAdapter消费者保持；非空AllowedTools、Agent bearer修改设置和旧revision继续拒绝。测试使用真实私有SQLite、实际HTTP/Native方法及公开项目，人工批准仍由用户本人完成；没有虚假adapter、协议或业务结果。

现有构造器保持，Composition只在明确配置Orca时将同一adapter一次注入项目服务。非空ExternalModelCLI经真实Native注册端口验证，传输或任何来源字段不匹配立即失败且不保存；Native方法不运行发现或命令版本探测。当前只有实际structured注册能通过；缺少真实terminal launcher绑定时明确拒绝。Go严格解码bridge和result，再核同安装VERSION、host.cjs、runtime/authority及canonical根。独立serve生成随机私有owner凭据，只经Go与Node的私有本地包络传递；Node host启动时将其从继承环境移除，SWA方法在进入既有receipt/replay之前核验。原生helper/current-consumer的完整T12准入仍在实施，本阶段没有授予真实执行能力。

`TestExternalCLIRegistryRealHumanApproval`使用同安装服务中由用户实际批准的独立观察项目：`SWA_REAL_ENABLED=1`，`SWA_ENDPOINT`、`SWA_REAL_RUNTIME_ID`、`SWA_REAL_DATA_ROOT`以及`SWA_REAL_REGISTRY_PROJECT_ID`、`SWA_REAL_REGISTRY_PROJECT_TOKEN`、`SWA_REAL_REGISTRY_AGENT`均取用户本人执行USAGE流程后的实际值。Agent ID必须在旧四CLI之外；以真实私有项目SQLite的mode=ro连接读取实际保存的revision、工具范围及拒绝后的项目保全，以合法项目内HTTP核同runtime实际registry和Agent bearer写入拒绝。获准窗口运行`go test ./internal/workspace/app -run '^TestExternalCLIRegistryRealHumanApproval$' -count=1 -v -p=4`，其余未知ID、无服务、旧产品和人工设置失败路径仍按前述计划运行。此测试不创建人类会话或替用户保存设置，当前正文NOT_RUN。

N07静态消费者允许明确模型参与选择，不以缺少默认模型等同缺少账号。Pi使用原生`parsePiModelOptionId`的provider/model结构与对应provider的原生认证条目，OAuth条目同时要求access/refresh/有限expires；配置文件没有默认模型时capabilities保留unknown。Codex默认openai分支遵循pin来源的OAuth mirror约束，自定义provider缺少对应账号证明保持unknown；Claude文件API key和OAuth均记录anthropic协议来源。原始账号有效性、私有账户实际绑定及工具策略仍未通过，ACP配置适配继续保留unknown，不据这些静态观察宣布可启动。

本次`.verification/swa-cli-headless-20261020/registry-static-01/`保留Go八文件gofmt-d、15份变动TS/JS语法及JSON/YAML解析的实际EXIT0；现有只读架构检查45包通过，两份Markdown、5条本地链接、24项Orca及11项Pi来源路径通过，差异空白检查通过。主控独立16ad的Go结果只属于其准确来源，不计本阶段Worker自测。N08、N04/N05、T12、真实原生Job/完整成果及运行依赖整理由同一Worker继续。

原Run正式`msg_14fe3a424d2f`交付一次generate-02，准确33c5干净前置及原资源门限通过；实际Stage返回EXIT0，只生成web/src/api/schema.d.ts，三份新SWA组件及明确Agent/model类型同步。资源UTC17:28:02.235392/04.744076、CPU49.6/55.0%、可用11254743040/11278381056字节、单调2.508680秒；日志/resources/exit及两次新鲜定向CIM无所属生成进程保存在自有generate-02。实际exec38224已结束，并以`msg_8a60d5bf2146`立即交回主控恢复原S；没有执行其他Stage。完整TypeScript检查、编译、测试正文、安装和模型继续NOT_RUN。

按独立`msg_b4d0f6632c93`，N09检查在真实私有SQLite的mode=ro连接读取项目，实际HTTP只用于合法的项目内capabilities和Agent写入拒绝；未开放全局管理接口或获取人工会话。§12当前接口及USAGE批准来源已同步。下一构建原入口仅将候选目录改为全新dist/swa-cli-install-20261020-02，拟EvidenceName build-03，必须另获一次窗口；build01/02及部分candidate01保持，固定Node来源与校验未改。

后继`generate-followup-static-01`保留两个Go检查文件的gofmt-d、实际生成TS及JSON/YAML解析、两份文档来源/5本地链接及构建入口PowerShell语法通过；正文均未执行。拒绝检查要求原Native owner scope_denied及明确消息，HTTP Agent拒绝要求实际scope_denied及当前操作权限原因，其他依赖错误不计权限通过。主控`msg_2d38445cb876`通报原S在restore11的CodeGraph导出检查失败并由主控独占诊断，Worker不处理原依赖或启动服务，尚无build授权。

按主控`msg_f70d7b47f419`，构建仅将同一`buildSWARuntime(runtime)`调用提前到prod deploy及准确干净源码核实之后、Node下载/native编译之前。该函数使用已装source esbuild与已部署package.json，以external处理native模块，静态源码没有依赖待下载Node或已编译ABI的前置；原入口、Node pin/URL/校验/超时、后续native/Go及最终VERSION写入条件保持。此顺序允许先保存真实bundle/metafile和导入错误，不能据此认为完整类型检查或依赖裁剪已通过。新候选及失败保留规则保持，build03须另授一次窗口；主控通知同源恢复原S22036成功，restore11失败与独立诊断原件保持。

原Run正式`msg_bf9fe8b9d2ee`仅一次build03已消费：准确e54d干净、runner77d及新candidate02前置通过，资源UTC17:54:01.542113/04.043874、CPU5.3/8.4%、可用10962219008/10999603200字节、单调2.501772秒。实际prod deploy323完成，原镜像慢下载及命令内建重试保留；首个host bundle因真实缺少@xterm/addon-unicode11和diff而EXIT1。没有host.cjs/metafile、Node目录/下载、native/Go编译或VERSION，部分candidate02/runtime保留，不可安装。实际exec76466同步结束，原运行快照含根30428、59088、20260、25984及conhost24240；UTC18:00:05.6984119/08.0245030两次新鲜定向CIM均空，原件在build-03，以`msg_c11e95aaf0c3`立即交回主控同次恢复原S，未重试。

主控`msg_04f529cb428c`收回全部重操作并解除tracked/Git冻结。两项必要依赖按实际pin package.json补声明：@xterm/addon-unicode11=0.10.0-beta.301用于真实daemon/headless-emulator，diff=8.0.4用于真实ACP tool timeline。runtime/package与dependencies.lock.json保持同一声明；原pnpm在下述dependency03窗口实际生成lock并安装，没有手写lock或external隐藏缺失。全RPC三处实际导入和旧SDK入口闭包继续返修，尚未取得metafile，其他依赖、native/dynamic/assets和安装均未证明。

按主控`msg_89ea6e20c990`，后继build使用同任务已有私有pnpm-store，核canonical路径且拒绝重定向；临时目录与新候选仍独占创建，完整prod deploy保持。真实已装pnpm11.27源码将verify-store-integrity声明为Boolean、默认true，构建显式传该选项；不复制node_modules、不修改全局store、不绕过pnpm完整性。该静态变化尚未运行。声明检查初次取错原package依赖分组而EXIT1，原件保留；改读实际devDependencies后的两项pin校验EXIT0，MJS语法/JSON/YAML及两文档来源/5本地链接通过，正文/安装/编译均NOT_RUN。主控通知restore12同源S56896恢复通过，原失败和当前窗口归属由主控维护。

原Run正式`msg_aede2b74b4f7`的一次dependency03已消费。准确8ebefec700781e9883a3bb3f905233e07f03e671干净前置、runner77d及新证据目录核实后，原命令于UTC18:14:40启动，exec27025、根60728/UTC18:14:40.1256339Z。lock-only原pnpm11.27于36.4秒完成，随后的frozen install于4.8秒完成；四份子阶段/资源门禁exit均0，真实lock仅增加两项必要importer及Unicode11 resolution/snapshot。两次门禁CPU分别62.0/46.9%和33.4/21.0%，可用内存均超过4GiB，单调间隔2.5065475/2.501296秒，均通过。原命令内记录的peer/deprecated提示保留，没有另跑依赖检查或重复Stage。

原执行结果在工具输出截断后未取回外层final，恢复poll仅返回Unknown process id 27025；不能写成已取得外层EXIT0。四份真实exit/日志与UTC18:18:16.6197410、18:18:19.0326939的两次新鲜CIM空结果保存在dependency-03，支持实际lock/install结束；以`msg_c9b567e69c05`立即交回。主控`msg_15e46e88379b`撤销已消费授权并解除tracked/Git冻结；`msg_68e6a449742c`确认restore13实际EXIT0，当前S56896/UTC18:17:05.651634为新创建身份，原Orca38652/runtime49da、原库/环境/health/Web由主控核实。下次prepare使用restore13/restored.json，不按PID数值复用旧身份。

下一build静态入口仅改为全新dist/swa-cli-install-20261020-03，拟EvidenceName build-04；实际执行过的77d runner先保存到build-03/next-window-executed.ps1且SHA一致。旧candidate01/02和失败原件保留，新candidate03及build-04仍不存在。构建须先独立审核准确后继及另获正式一次窗口，不重复已通过dependencies/generate，不执行模型。

原Run正式`msg_71d0802aa76b`仅一次build04已消费：准确449184b826ae64de99d73476147d64967ef31667干净、runner7755和新目录前置通过，exec86069/根8800于UTC18:28:30启动。门禁UTC18:28:32.431690/34.933581，CPU22.1/19.5%、可用9068683264/9124237312字节、单调2.5018908秒通过。实际prod deploy324项、363项供应链核查完成，21份bundle及metafile全部生成；随后首官方Node归档下载在nodejs.org:443的TLS建立前ECONNRESET，实际同步外层EXIT1，build-exit.txt与outer-exit.txt均1。candidate03/runtime和空node目录保留，没有native/Go编译、VERSION或swa.exe，不可安装。

实际运行快照含根8800、40088、61684、62384及conhost36768；UTC18:31:09.3250354和18:31:12.6708658两次新鲜所属树及已观察创建身份均空，原件在build-04，以`msg_cc1236c8d8b5`立即交回。主控`msg_1db1028ec2fd`撤销已消费授权并解除tracked/Git冻结，`msg_b775b97adf6f`确认restore14实际当前S55148/UTC18:33:26.874753/epoch1792521206.8747532及原库/环境/health/Web保全；原Orca38652/runtime49da保持，下次prepare使用restore14/restored.json。

21份实际metafile经标准JSON只读分析保存在build-04/metafile-analysis.json。host扫描6136个输入，正bytesInOutput的依赖确实进入产物；完整RPC index有五个实际直接importer：host、dispatcher、RPCState及经headless PTY kill进入的SSH legacy-relay-cli-server/call-limits。当前静态修正让产品host使用现有RuntimeRpcShutdown并显式提供同一16个原生方法，完整默认选择移到原公共OrcaRuntimeRpcServer；RpcDispatcher及RPCState要求显式methods，原桌面默认调用者改为显式ALL。SSH调度与完成回执共享同一五项原声明，保持scope、参数schema及原receipt规则。方法体、owner admission和原执行器保持；后继真实metafile/构建尚未执行，不能宣称完整闭包已经裁剪。旧SDK导出/检查、真实native Job和多provider完整成果消费者继续处理。

## 13. 原生账号与关闭工具的实施计划

本节为N08新增稳定契约及直接消费者的完整技术计划，等待原Reviewer独立技术接受和主控SPEC定稿；当前没有实施native_launch字段或执行新账号/工具方法。依据实际本机Pi CLI1.0.1的main、auth-storage、resource-loader、settings-manager、agent-session-services、sdk、model-runtime、virtual-models、rpc-mode、model-config、provider-composer、resolve-config-value及pi-ai/auth/resolve/provider源码，使用真实CLI和原生格式，沿原Native状态与R运行。

### 13.1 账号与当前来源

普通RPC使用可写FileAuthStorageBackend；只有auth check的noRefresh分支使用ReadOnlyAuthStorage。实际provider认证分支要求stored.type与其真实handler相符，openai-codex只声明OAuth。因此不能将OAuth访问token改成api_key、删除必需字段或复制refresh后宣称原账号保全。受限实施只向真实支持API key的provider交付其已配置实际literal key，完全不交OAuth/refresh或新登录能力。

共享OAuth的原生无refresh执行目前没有已证路径，配置观察与执行unknown分别保留。若实际来源仅有共享OAuth且没有符合当前权限的原生调用，主控处理必要授权决定；新账号、跨Agent凭据、私有副本refresh和自动新登录均未授。此限制只影响依赖该凭据的动作，不停止发现、构建、输入/恢复或其他已有安全原生来源。主控只读观察默认C:/Users/DW/.pi/agent/auth.json条目为0、相关父环境未设置，只限定默认源，不能推断所有本机Agent/profile无账号，也不能宣称当前已有可执行Pi账号。

### 13.2 非秘密稳定字段与生产者

在原AgentSelection增加以下strict字段，Go/Node/Zod/JSON Schema/OpenAPI及直接消费者同步；公开HTTP仍只接收既有命令，不能传任意launch policy、argv、账号、caller或批准。

```typescript
type NativeLaunchPolicy = {
  schema: 'swa.native-launch.v1'
  account: {
    kind: 'pi-native-api-key'
    provider: string
    source_home: string
    auth_source: { path: string; version: string }
    models_source: { path: string; version: string } | null
    private_home: string
    model_target: { model_id: string; api: string; base_url: string }
  }
  tools: { mode: 'disabled'; native_contract: 'pi-cli-1.0.1' }
}
```

路径均为实际canonical来源，version沿现有配置snapshot的实际文件身份/版本；models_source=null要求实际不存在，后续出现也视作变化。source_home、provider、原source/revision及configuration_version共同固定所选原生来源，不包含凭据。model_target固定实际合成的明确modelId、原生API和最终baseUrl；URL使用成熟URL解析，拒绝账号信息、秘密查询参数、动态模板及未经当前批准的目标。它属于同一selection及其版本，不能由公开HTTP传入或在启动时重新选择。实际native_contract规定下述完整argv、环境、原生设置和握手，版本字符串本身不证明能力。其他Agent的真实注册/发现继续，尚无已审原生政策的控制动作返回明确unknown/不支持，不能扩展Pi结果为全部Agent通过。

private_home固定为DataRoot/pi/<实际项目UUID>。已批准controller.open只创建空私有目录，发现不复制账号；不同项目不共用副本。Windows成熟安全API在秘密写入前设置并读取验证当前用户及SYSTEM的保护DACL，拒绝重定向、未知owner、其他写入主体和与原Orca/账号/安装根重叠；不提权、不改变原目录ACL。

现有StructuredAgentLaunchAdmission增加内部`accountHome(sessionId,agent,currentHome):Promise<AgentSessionAccountHome>`。createStructuredWorkerSession在create前已有含dispatchId的实际identity；产品从该identity与原父子R取准确项目/selection。prepareStructuredAgentSessionCreateForWorktree在resolve intent之后、attach fingerprint之前确定账号，原生agentSessionAccountHome helper产生{variable:'PI_CODING_AGENT_DIR',path:private_home}并由attach写入原record。非产品宿主沿原生产者；产品Worker缺少真实R关联即拒绝。实际launch part完成后复核command/accountHome/env/argv，仍用原CLI、provider-process和seal。

### 13.3 账号材料与并发

在当前项目Grant/CLI/model/tool批准成功后，使用成熟JSON读取auth，沿真实ModelConfig.load的JSONC/schema读取models；结构错误、原生error及未知有效字段立即拒绝，不把任意原models块交给子进程。仅投影明确provider及明确model所需声明，其余provider、model、设置和账号不写入私有根。逐类规则如下。

| 实际消费者 | 准入及私有投影 |
| --- | --- |
| auth所选provider条目 | 只允许原生`type: 'api_key'`与非空key；env缺省或空对象才准入，非空credential.env明确拒绝，不把它并入子进程或header环境。OAuth及其他类型拒绝。私有auth只含该provider的原生type/key，不能交未消费的额外字段 |
| 原生配置值 | 对key及每一层header value先用同版本原生isCommandConfigValue和getConfigValueEnvVarNames作只读分类；命令或任何环境引用均拒绝，不调用其执行/环境解析路径。只有两者均未命中时才沿原生literal语义解析，保留`$$`及`$!`的原生转义；私有原格式保存同一已验证表达式，不能把解码后的前导`!`重新当配置表达式写入。秘密不输出或进入错误文本 |
| models provider apiKey/oauth | 所选provider含apiKey或oauth即拒绝，即使另有stored key也不忽略；这两个字段可参与真实认证组合，不迁入私有文件。只有实际原生provider的API key handler与原auth条目匹配才继续，不能依赖composer生成新登录能力 |
| provider/model/modelOverrides headers | 三层逐项按上行检查literal，使用成熟Headers检查名称和值；认证或账号替换字段Authorization、Proxy-Authorization、X-Api-Key、Api-Key、Cookie、Set-Cookie按大小写不敏感拒绝。其他已存在的literal声明按原composer优先级保留，不能丢弃某层改变语义。私有投影只保留原已验证层次，不执行命令，不带credential.env |
| provider与明确model | 只保留原生schema已验证的name、baseUrl、api、headers、compat、authHeader及所选model的原生声明；provider authHeader仅允许缺省或false。model定义保留id/name/api/baseUrl、reasoning/thinkingLevelMap、input/inputLimits、cost/promptCache、contextWindow/maxTokens、headers/compat，samplingParams遵循下行的缺省或空对象条件。未选择model不投影，不以原生defaults替换无法唯一确定的目标 |
| modelOverrides与路由 | 只保留准确modelId对应、经原生ModelOverrideSchema验证的声明及上述header检查；其他model override不进入副本。provider/model/override的compat中allowedFallbackModels、openRouterRouting、vercelGatewayRouting只要具有实际候选或路由配置即拒绝，不删掉后继续。虚拟模型api为pi-virtual、扩展provider、动态router或无法确定最终物理目标时拒绝，不换model/provider |
| samplingParams及最终请求 | 原所选model定义、所选modelOverride、原内置model及合成后model的samplingParams仅允许缺省或空对象；具有任何自有字段即拒绝整个来源，不删除后继续，也不按字段名猜测安全性。实际openai-responses/openai-completions/azure-openai-responses在生成请求末尾Object.assign，可覆盖model、正文、tools及路由，因此本contract仅对这三类已核实际API提供准入，其他实际API保持政策unknown，逐项核其真实消费者后另审。真实RPC get_available_models/get_state返回完整model，首次及每次输入前均核合成samplingParams为空及准确model/API/baseUrl |
| 最终原生目标 | 依照同版本composer的实际顺序合成provider/model/override，结果必须与selection.model_target的modelId/API/baseUrl逐项一致，并重新经过当前Go批准。模型级baseUrl覆盖、provider级baseUrl覆盖、API或headers变化均使原selection失效；静态声明不代表远程账号有效 |

原生ModelRuntime继续验证私有原格式；所选provider支持、账号ready与真实请求有效性分别由原生检查及实际执行证明。源models不存在时私有models保持不存在，仍固定并复核实际内置provider/model/API/baseUrl；存在时必须按上述规则生成唯一投影，不在错误时退回内置配置。

首次写入前在原父R/native checkpoint保存政策与私有根，文件独占创建。已有同项目原生Worker只有来源、版本、provider和政策完全相同才可复用；不同来源或未知副本且原资源尚未释放时拒绝，不能覆盖文件换账号。实际record固定私有accountHome；源目录只读，文件锁与运行写入仅涉及私有根，子进程不持refresh token。两个同项目Worker使用原生文件锁和相同不可变来源，关联只用原R/Dispatch/session，不能另建账号或执行账本。

### 13.4 完整参数、环境和原生设置

产品路径要求用户及配置extraArgs为空。native builder固定构造--mode rpc、--offline、--no-approve、--provider及明确provider、--model及明确modelId、--no-tools、--no-extensions、--no-skills、--no-prompt-templates、--no-themes、--no-context-files；只有原记录需要时追加真实绝对--session或--fork，二者互斥。任何额外参数均拒绝，秘密不进入argv。PiRpcLaunchOptions新增由产品准入口给出的toolsOff政策，仅已审contract且实际版本匹配的受限路径允许fullAccess=false；不能强设full-access取得执行。

环境仅保留大小写规范化后的SYSTEMROOT、WINDIR、SYSTEMDRIVE、COMSPEC、PATHEXT、PATH、NUMBER_OF_PROCESSORS、PROCESSOR_ARCHITECTURE、PROCESSOR_IDENTIFIER、OS、LANG、LC_ALL、LC_CTYPE、TERM、COLORTERM及已有HTTP_PROXY/HTTPS_PROXY/ALL_PROXY/NO_PROXY。网络值不记录、不修改系统代理。明确追加产品私有HOME/USERPROFILE/APPDATA/LOCALAPPDATA/TEMP/TMP、当前项目PI_CODING_AGENT_DIR、PI_OFFLINE=1、PI_SKIP_VERSION_CHECK=1，再由原seal生产固定本Worker身份键；其他账号/provider key、NODE_OPTIONS/NODE_EXTRA_CA_CERTS、SWA_OWNER_CAPABILITY及原Orca身份不继承。限制只作用于产品子进程。

--offline关闭实际自动启动网络/目录刷新，model-runtime.stream/streamSimple仍准备真实provider请求；不能据该开关宣称模型已经运行。--no-approve令SettingsManager.loadFromStorage(project,false)返回空项目设置，固定公开工作目录保持，原文件不变。--no-tools在原生生成allowedToolNames与初始active空集合，资源禁用加空extraArgs封住显式资源路径与扩展provider注册；get_state没有tools/activeTools/ToolsOff，不能新增这些协议字段。

私有原生settings.json固定compaction.enabled=false、retry.enabled=false、retry.provider.maxRetries=0、cacheWarming='off'。原默认compaction/retry启用、agent retries最多3、provider retries独立、cache warming为streaming；sdk.js分别消费provider retry和cache warming，因此逐项关闭。启动后用真实set_auto_compaction/set_auto_retry成功回执再次关闭，在真实get_state核autoCompactionEnabled=false；retry没有同名state字段，结合原生回执、同版本源码及私有settings真实值核验。公开入口不暴露bash/compact/new_session/cycle_model或重开策略的原生通道。

每请求options不接收透传对象：产品Pi RPC消费者只发送既有明确的文本prompt/steer/follow_up、abort、状态读取、准确set_model、thinking设置及上述关闭设置命令，逐命令使用strict DTO；prompt只允许message、原生streamingBehavior及原请求标识，当前固定任务没有images。不开放samplingParams、request options、provider override、onPayload/headers变换或任意RPC执行。实际RPC prompt只将message/images/streamingBehavior交session.prompt；Agent.createLoopConfig显式生成loop配置，没有samplingParams，agent-loop把该配置交streamFunction，sdk.buildRequestOptions及ModelRuntime.prepareRequest保留原生规定参数。空扩展和资源、私有固定settings封闭before_provider_request/before_provider_headers等用户覆盖生产者；实际来源与源码契约无法证明这一条件时在首次效果前拒绝，不能仅凭no-tools宣称最终请求安全。产品不替换原生provider或拦截后重写请求。

### 13.5 首次及每次效果前条件

实际get_available_models/get_state证明准确provider/model/API/baseUrl与Pi sessionId/sessionFile，拒绝api='pi-virtual'路由模型、模糊或不唯一匹配；原fence及归属分别由原Native R/Dispatch/session记录、expectedRuntimeFence与current consumer证明，get_state不承担不存在的fence字段。在serialized handOver等待和选项变化之后、adapter.dispatch之前，首次和每次后续输入均重新核源文件身份/版本/存在状态，重新按§13.3解析所选条目和逐层投影，并读取私有auth/models/settings逐项比较当前原生表达式、结构与预期投影。私有新字段、不同key/env/headers/路由、缺失文件或权限/重定向变化立即拒绝；不得以源未改代替私有文件复核。秘密只作内存比较，不写日志或新增凭据账本。同时重核原selection及model_target、current consumer/session/fence、停止/释放、完整所属Job及Go当前批准。Go沿原selection消费政策，仅已审disabled模式映射为空required tools；空ProjectActionScope.Tools本身不证明Native关闭工具。

真实原生API key没有TTL字段时，其有效期记录为unknown；它可以在其他来源/政策/当前批准条件全部满足后进入真实请求，不因格式没有TTL字段自动拒绝，也不承诺该key远程有效或永不过期。auth check ready仅说明原生就绪，最终认证和实际模型权限由真实请求结果证明。有实际明确期限的来源则每次输入前重新读取并要求`expires_at - 当前实际时间 > 本次已批准最长执行时间 + 30秒`；缺少真实期限证明、缺少该输入执行上限、余量不足或已到期时拒绝。这里的未知拒绝仅适用于声称有期限而无法核实期限或时限的来源。共享OAuth不进入此政策。原输入一旦可能生效，超时、断开及来源变化继续保全原R/native operation/Job，不重选或重放，首次与后续正文均复用已审N04异步批准及T12身份条件。

### 13.6 真实验证与停止条件

1. 同安装候选发现真实Pi/版本、明确provider/model和既有API key来源，缺默认模型不等同无账号；原生provider支持、账号就绪和模型实际执行分别核。必要只读认证命令为实际pi auth check --provider <明确provider> --json --no-refresh，禁止--credentials及两个print命令；仅在已授窗口运行，记录真实ready/not_ready及原原因。它不能替代普通RPC政策。
2. 用户本人在同一候选批准固定公开项目、单CLI及空工具范围。实际Go/HTTP错误主体、Grant/revision/CLI或工具不符在模型前拒绝，检查明确权限原因及设置保全，不取得人工会话。
3. 核实际子树、canonical accountHome、完整env/argv/原生设置及自产session JSONL，完成真实provider请求。结合同版本源码、真实get_state/回执和所有实际事件证明受限行为，版本字符串、启动状态或无工具事件均不能单独证明工具关闭。
4. 用真实固定公开输入要求文件/命令操作，观察关闭工具后的真实回应及完整session/实际文件效果；不伪造工具、协议、事件或时钟。真实offline、retry/compaction/cache warming保持预期，虚拟模型及冲突配置不能改换模型或另起未批准输入。
5. 在获准私有来源副本或由用户本人变更的实际条件下验证来源变化、重定向、ACL/账号失配、模型/provider条件、停止和撤权；分别覆盖auth key命令/环境引用、非空credential.env、provider/model/override三层headers命令/环境及认证替换、models apiKey/oauth、目标API/baseUrl覆盖、modelOverrides和虚拟/候选路由。对原model、override、内置/合成model的非空samplingParams及每请求options透传分别核首次和后续输入效果前拒绝，缺省/空对象来源沿真实API执行并核实际产出/工具效果；不得删除配置后调用或以假provider构造请求来证明。实际原生API key无TTL时允许其余条件满足的真实请求，有明确期限时核足额、余量不足、期限未知和已到期。场景只用用户本人持有且获准的真实原生来源，不制造认证/协议/时钟或修改原本机Orca/账号配置。未命中的真实分支记INCONCLUSIVE，未执行记NOT_RUN，原未知效果保全。
6. 同一安装候选的一次固定公开任务至少两个真实Worker模型活动重叠，分别观察与获取完整输出；指定停止A并证明全树退出，B保全、同session/fence接受实际后续输入并完成成果、退出及释放。原Job/原R/资源及原Orca保全计划全部保留。

本节不授予新账号、refresh、通用工具或实际模型窗口，不以技术计划代替实际可用性。独立接受后由主控定稿SPEC，再由同一Worker在原写域实施、编译、运行全部适用检查和返修，直至目标满足或具体真实阻塞；当前原生认证/工具及同候选安装双Worker均未通过。

## 14. 官方Node构建输入的Windows下载计划

主控`msg_bcfec187f6c2`新增窄写域scripts/download-swa-node.ps1，要求先独立技术审核本节再实施。实际build02超时、build04 TLS前ECONNRESET分别保留，不能由现有代理元数据推断根因或宣布修好。只读已知source-pin与vendor根的out/node-runtime-cache均不存在，ORCA_NODE_RUNTIME_CACHE_DIR和父代理环境变量未设置；HKCU Internet Settings只记录ProxyEnable=true、ProxyServer存在、AutoConfigURL不存在，未输出其值或秘密，其他缓存来源仍未知。

唯一构建方向为同任务PowerShell 7子进程中的成熟.NET HttpClient，使用HttpClientHandler及现有HttpClient.DefaultProxy解析，不设置静态DefaultProxy、系统代理、账号或证书。官方[DefaultProxy文档](https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpclient.defaultproxy?view=net-10.0)说明Windows优先使用已有代理环境，未设时使用用户代理设置；当前实际来源符合后者。Firecrawl CLI实际不可用，已通过只读网页工具读取Microsoft官方文档，没有安装依赖或执行下载。

build-swa-package用execFileSync的独立参数数组调用已安装pwsh的绝对路径和-File脚本，传固定官方Uri、实际私有WorkDirectory、绝对新OutputFile，不拼接shell字符串。脚本先用成熟Uri验证HTTPS、nodejs.org、无账号/fragment/query及准确24.21.0三项release路径：win-x64归档、headers归档、win-x64/node.lib；版本、文件名和哈希仍由既有NODE_RUNTIME_PIN生产。仅接受仓库自有.verification/swa-cli-headless-20261020/build下已创建的实际私有candidate工作目录及其子路径，逐级拒绝ReparsePoint、路径重定向、外部路径和已有目标；目录须实际存在，FileStream使用CreateNew/Write/None独占创建。脚本不寻找其他来源、不复用失败候选、不下载非pin输入。

每个输入创建一个HttpClientHandler/HttpClient及HttpRequestMessage，UseProxy=true，保持默认TLS/证书验证，不添加账号、Cookie、认证Header或自定义证书回调。AllowAutoRedirect=false，非2xx立即失败；该开关的实际含义已读取官方[AllowAutoRedirect文档](https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpclienthandler.allowautoredirect?view=net-10.0)。一次SendAsync使用ResponseHeadersRead，随后ReadAsStreamAsync/CopyToAsync流式写入私有FileStream。一个600秒CancellationTokenSource从请求前覆盖SendAsync和全部正文读取；HttpClient自身不另设较短时限。官方[HttpCompletionOption文档](https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpcompletionoption?view=net-10.0)明确headers模式不会自行覆盖后续正文时限，因此每个异步操作都传同一token。

应用只调用一次SendAsync，不写重试循环、失败换代理、其他URL或第二下载器；网络层行为按真实.NET记录，不宣称验证过每个底层报文。失败、超时、非成功HTTP或写入异常立即终止构建，保留真实部分文件并关闭response/stream/file/client/handler/token；不捕获后继续，不输出代理、credentials或原始网络异常全文。安全错误记录阶段、HTTP状态或异常类型，保留正常非零退出及原Cause类别，未知效果不改写为成功。脚本退出后，原Node读取实际下载文件并核原archive/header/lib SHA，原fflate只解包原pin Node/License，再核exe大小/SHA/version；native/Go/VERSION顺序及条件保持。没有通过脚本退出即跳过原哈希的分支。

| 验证 | 实际来源与判定 |
| --- | --- |
| D01 参数和目录失败 | 用自有真实目录及真实已下载输入验证相对/越界路径、已有文件和实际重定向在网络前拒绝，文件及原设置保持；只用获准目录，不触及原Orca |
| D02 三项官方输入 | 新窗口内沿原build一次串行取得实际官方archive/headers/lib，三项原SHA及解出exe原大小/SHA/version全部通过，记录安全阶段/退出和真实资源；不重复旧Stage |
| D03 系统代理与TLS | 在既有Windows设置下执行实际官方请求，保持默认TLS验证、无代理配置写入和秘密输出；成功只证明本次来源，失败保留实际类别，不换网络路径 |
| D04 失败及600秒 | 真实HTTP失败、TLS断开、取消/超时或文件写入失败发生时核非零及保留部分文件、全部所属进程退出；未实际命中的分支为INCONCLUSIVE，不制造HTTP服务、假响应、证书或时钟 |
| D05 完整候选 | 实际全部bundle/metafile、四个native ABI及两Go程序、依赖/许可检查和最终VERSION条件都通过后才可继续安装；下载通过不能代表候选可安装 |

独立准确f5dc49f7c5003e896d5ee90cc81e0211ddb787e8技术接受本节后，同一Worker已实施scripts/download-swa-node.ps1及原build-swa-package.mjs消费者，准确2c391e2718ceef2f44721b727c7471918fecdb4e获d1ba静态接受。实际PowerShell来源固定在已安装ProgramFiles/PowerShell/7/pwsh.exe，以独立参数数组调用；三个官方URI、独占私有candidate工作目录与原文件名、逐级ReparsePoint拒绝、CreateNew流、同一600秒token、默认代理/TLS及安全异常类别均按上述计划实现。原Node读取实际文件并保持所有原pin校验，原网络错误及候选没有删除。

原Run正式`msg_51ec7b66228f`的一次build05已消费，准确2c391干净、runner b7b5及新candidate04/build05前置通过；exec63388、根37144/UTC18:56:09.2623720Z，资源UTC18:56:13.312041/15.815249、CPU37.5/29.3%、可用7926308864/7770779648字节、单调2.5032144秒通过。实际prod deploy324项及21份bundle/metafile完成，Windows下载器取得三项官方HTTP200：zip37618919、headers10291794、node.lib2988566字节；原Node三输入SHA、exe大小/SHA和实际v24.21.0检查均通过。此结果证明本次下载路径可用，旧TLS失败原因仍未知，D01及没有实际命中的失败分支保持未验。

首次node-pty的node-gyp12.3.0配置随即因未提供Python选择、原发现无法找到解释器而失败。实际同步exec63388 EXIT1，build-exit.txt/outer-exit.txt均1，未进入其余native/Go/VERSION；candidate04及私有work/candidate-B3Y5qw原件保留，不可安装。UTC18:59:04.9625541、18:59:07.4104430两次新鲜所属树及此前创建身份均空，以`msg_a1c06f42db08`立即交回。主控`msg_71607dd35701`消费收回并解除冻结，`msg_c0498a16a367`确认restore15实际EXIT0：当前S68128/UTC19:00:53.019423/epoch1792522853.0194235，原库/环境/配置/health/Web保全；下次prepare取restore15/restored.json，原c8不改。

同次真实metafile标准JSON比较保存在build-05/rpc-metafile-comparison.json：host扫描6136→5666、正bytesInOutput输入6120→5650、实际输出22483367→20957928字节，完整RPC index当前不存在，正RPC方法输入279→94。此结果证明已定位全RPC入口的静态收窄，剩余动态/native/assets、旧SDK和完整功能继续未验，不能按包名裁剪。原async方法实际返回的两项VoidTaskResult类型文本保留在本次日志，当前调用用[void]抑制该返回值，等待后继实际输出验证；没有为清理日志重跑下载。

原node-gyp12.3 configure/find-python消费者接受--python并在NODE_GYP_FORCE_PYTHON存在时只核该唯一来源。构建先realpath选择本机已有C:/Python313/python.exe，在部署/下载/编译前通过独立参数数组执行短标准库命令，取得实际sys.executable及三段版本；canonical身份不同或不满足原Python3.6以上要求即失败。只有同一构建子进程environment设置force，四项原gyp均显式传--python，不改系统PATH、全局配置或安装新Python。

原Run正式`msg_5b7d83fdfb5a`的一次build06已消费：准确b75cf8ffeedffd244934dfac078b4926e865eb15、runner bae62及新candidate05/build06前置通过，exec65865、根55820/UTC19:18:44.0288700Z。资源UTC19:18:46.515495/49.017364、CPU15.4/15.8%、可用7777550336/7801974784字节、单调2.5018756秒通过。真实Python预检为C:/Python313/python.exe 3.13.13；324项prod deploy、21份bundle/metafile、三项官方HTTP200及原pin/exe/version校验通过。node-gyp实际发现该Python及C:/BuildTools/VS2022的17.14.37710.0，随后首个conpty编译失败；日志先报swa_provider_job.h的C4819/代码页936，再在第17行报C2059/C2143及后续连锁错误。实际exec同步EXIT1，build-exit.txt/outer-exit.txt均1，未完成其他native/Go/VERSION，candidate05及candidate-IHFNTU原件保留，不可安装。UTC19:20:34.5682573/36.9947290两次新鲜所属及此前身份为空，以`msg_582d80531337`立即交回restore16；主控`msg_2f35028af91e`正式收回窗口并解除tracked/Git冻结。

实际头文件保留完整struct及中文注释，候选生成的conpty.vcxproj没有UTF-8编译选项。Microsoft官方[/utf-8文档](https://learn.microsoft.com/en-us/cpp/build/reference/utf-8-set-source-and-executable-character-sets-to-utf-8?view=msvc-170)说明无BOM源默认按用户代码页解释；[CL环境变量文档](https://learn.microsoft.com/en-us/cpp/build/reference/cl-environment-variables?view=msvc-170)说明CL参数前置、_CL_参数后置。当前修复仅在原四项native编译前清除本构建子进程继承的CL/_CL_，明确CL=/utf-8并输出该非秘密参数；系统代码页、原文件注释和用户环境不变。后继编译及完整候选仍未执行，不将该来源判断登记为已验证根因。build06实际runner已保存至build-06/next-window-executed.ps1，原失败候选不覆盖、不自动重试；其他已批准的账号、输入、恢复、Job和成果实现继续。

## 15. 原生Pi账号、CLI及结构化正文阶段源码

本阶段依据已接受的SPEC21.1.2、21.1.4、21.1.5及主控`msg_e98464a9e11e`提交完整静态消费者，供原Reviewer核对准确Commit。当前形成下列实现，真实执行结果保持未验：

- `native-pi-policy.ts`使用实际安装Pi1.0.1的ModelConfig、provider composer、只读认证和literal解析，生成必需的`native_launch`稳定字段。原auth/models、启动器与实际解释器、模块来源版本在选择和输入前重读；命令、环境凭据、认证header、未知有效配置和非空samplingParams立即拒绝。只投影所选既有provider/model/API/base URL，不生成账号或刷新来源。
- `private-pi-account.ts`在DataRoot/pi/实际项目UUID下创建私有账号目录与auth/models/settings；原生Windows安全模块读取owner SID及完整DACL。只有当前用户和SYSTEM的受保护完整权限通过后才独占写入秘密，既有弱化或变化材料直接失败。环境采用§13白名单、私有home/appdata/temp及固定offline设置，最终sealed身份之外的继承变量删除。
- 原structured会话创建在attach指纹前取得实际accountHome，原Pi launch以已选真实CLI命令和固定RPC、模型及关闭工具参数启动。`native-cli-entry.ts`先等待父持Job的真实IPC准入，再通过原Windows shim解析和spawnProcess启动实际CLI；父进程独立核实际CLI PID、创建时间与Job成员。构建、候选闭包和真实事件消费者同步使用该入口，不再构建原产品SDK会话入口。
- Pi session取得真实关闭自动compaction/retry回执，核get_state和get_available_models的实际目标、API、base URL、空samplingParams及真实会话身份；模型选项仅允许已批准目标及其实际thinking能力。原生RPC命令和prompt采用严格DTO，禁用产品自动重放，工具或扩展请求立即失败。每次实际stdio写入在原串行队列等待后执行异步批准与原session/fence/Job检查，队列关闭阻止后续写入。
- Go App的`AdmitOrcaDelivery`只读核当前项目Grant、原授权期限、已保存Run/context/settings和真实输入材料；私有loopback端口只接受启动时封存的owner capability，不取得human身份或递归调用runtime。原`worker.start`首个正文与`swa.workerSend`后续正文将同一不可变binding写入原父R及R/native receipt，保留原native operation。实际拒绝先保存子结果再完成父结果，可能生效的断开保留unknown、原R和operation。
- `worker.send`复用真实structured host、原生journal和当前活跃会话；正文是一条完整文本消息，投递状态取自原生实际结果。`request.show`附加原operation的只读journal状态。成果解析使用真实CLI自产session JSONL、实际selection及原生journal，返回`native_session`、完整内容、usage及来源，公开结果不再硬编码provider/model/effort。
- T13真实驱动要求明确Agent与Model，保留同候选真实双Worker模型重叠、停止A全树退出、B同session/fence后续输入及完整成果。T09的`native-session.test.mjs`复用T13实际原件核真实CLI成员和两份会话，不新增模型调用；T07故障副本读取相同原件及实际selection。普通后代Job fixture仍只验证普通进程。

本阶段实际静态命令为`pwsh -NoProfile -File .verification/swa-cli-headless-20261020/check-n08-static.ps1`，同步EXIT0，原件位于自有`n08-source-static-01/`：成熟TypeScript parser解析39份TS/MJS语法，JSON.parse及YAML parser读取契约，gofmt-d读取五个Go文件，PowerShell Parser读取verify、download及私有runner三份脚本，Markdown parser核两份文档、6条本地链接及24项原Orca、11项Pi来源路径，全部通过。各最终日志及退出码分别保留；这些检查不执行程序正文、类型检查或编译。新增NativeLaunchPolicy的HTTP生成类型尚待单独generate窗口，由生成器更新`web/src/api/schema.d.ts`。

T12十二阶段严格caller矩阵、`controller.recover`及实际后台接续Job尚未完成，通用TUI正文路径尚未实现；当前成功选择范围受Pi原生工具政策约束，其他已发现Agent不能据此登记可执行。CLI/Go/原生模块构建、实际HTTP批准、私有账号ACL、真实认证、实际模型、安装、本机Orca保全、§13.6负向场景和全部同候选验收均为`NOT_RUN`。没有可安装候选或整项功能接受结论；原S已恢复且持有唯一窗口，后续动态检查须由主控正式单次授权，同一Worker继续后续源码及返修。

### 15.1 N14、N15源码返修

准确3590已普通push并交原Reviewer；完整静态CR继续，`msg_76bf311f86cc`和主控`msg_f181936c1d90`提出N14、N15，由同一Worker返修。原models来源不存在时，snapshot.models为null，私有目录只创建auth/settings，models.json必须实际不存在；出现、消失或重定向导致来源或私有检查失败，不创建空models文件。原models存在时才写入已审有效投影，并要求其后始终与来源及私有原件一致。

账号materialize、environment、disabled tools、Job launcher和首次input reservation均在Go异步批准返回后重新取得完整policySnapshot。每次beforeInput同样重新核真实selection、auth/models和CLI来源，验证私有材料后，以同步canonical路径、创建身份和版本检查覆盖原生文件及模型来源不存在状态，再核当前session/fence/consumer；该路径由原stdio队列最终beforeWrite调用，不在同一队列递归发送RPC。来源失配沿原拒绝或unknown结算保留原R、native operation及原件，不重放输入。

本次只执行`node --max-old-space-size=512 .verification/swa-cli-headless-20261020/check-n14-n15-static.mjs`，三份返修TS的成熟parser语法检查EXIT0，及`git diff --check` EXIT0；原件在`n14-n15-static-01/`。原生文件、真实账号和Go等待期间变化的适用用例仍按§13.6执行，正文、类型检查、构建及模型为`NOT_RUN`。T12其他文件中的当前开发修改没有作为本次N14/N15接受范围。

主控`msg_e7739c90a5b0`、`msg_fd71b815cd86`报告其detached准确3590/干净树独立执行原`compile-go-tests.ps1`，exec2414实际最终EXIT0，四包test-c及三个传输前函数逐PASS、零SKIP、模型调用0；根原件为`swa-go-3590-01/go-source-01`及`control/go-3590-execution-01.log`。这是主控独立结果，本Worker没有执行或复跑；live/runtime函数、N14/N15后继编译及全部真实功能仍未验。restore17已恢复S36744/UTC20:17:53.696819，原库、环境、配置及本机Orca保全由主控实际核查，当前没有Worker重操作授权。

### 15.2 N16、N17、N18源码返修

原Reviewer`msg_6978c87325db`确认1b的N14/N15对应静态修复，并提出N16真实会话身份和N18实际Go Grant期限；N17由Worker与Reviewer各自从原生定义核实。当前返修固定首次真实get_state的UUID sessionId及绝对sessionFile，后续每次get_state完整比较；首次返回的同一文件用于实际Pi provider link，adapter将该原生link与固定身份绑定，首次和后续输入均保留该关系，账号/options/provider chain在异步等待后也核原件。

N18使用Go原回包中与原invocation一致的实际grant_expires_at。异步批准、完整来源重读和私有材料核查后，原结构化host逐层传递一个同步finalAdmission至原stdio写入队列；队列在实际output.write之前且没有异步等待的边界，再核来源身份/版本、当前session/fence/consumer、原生Job成员及Date.now下的Grant有效期。到期、身份或来源拒绝形成实际写入前拒绝，可能生效的未知仍保留原R及native operation；未伪造时钟或在同一队列递归请求get_state。该期限属于项目Grant，与原生API-key无TTL的政策分别处理。

N17在host现有精确白名单中显式加入唯一`ORCHESTRATION_WORKER_LIST_METHOD`，保留message-methods中的真实Task消费者和原数量/唯一性完整性检查。没有注册全表、制造列表或放宽缺失检查。此项只完成源码修复，原生后台启动尚未运行；T12严格caller与recover另行继续。

实际静态入口`node --max-old-space-size=512 .verification/swa-cli-headless-20261020/check-n16-n18-static.mjs`读取本次13份TS源码的成熟parser语法，日志与退出码保留在`n16-n18-static-01/`；另执行文档来源/本地链接及git diff --check。程序正文、类型检查、编译、真实Grant自然到期、真实Pi身份变化和全部安装/模型用例保持`NOT_RUN`，后继须准确CR及主控单次动态窗口。

### 15.3 T01真实TypeScript类型检查补充

按主控`msg_1b67c830af5a`补足T01的具体类型入口；原parser和esbuild结果只保留其语法/转译范围。本次准备`pnpm typecheck:swa`，准确展开为`node --max-old-space-size=1024 runtime/swa-orca/node_modules/typescript/bin/tsc --project runtime/swa-orca/tsconfig.json --pretty false`，使用已安装TypeScript6.0.3和实际Node25.9.5声明。当前只写入入口与计划，未运行tsc；须经原Reviewer核本补充及主控单次窗口后执行。

范围为全部`runtime/swa-orca/src/**/*.ts`及其真实传递imports，包含原RPC/structured adapter/Pi/stdio队列和其实际调用者；原build-constants.d.ts沿真实来源纳入。编译器使用strict、noEmit、无incremental、skipLibCheck=false和实际JSX/Node声明，检查所有实际类型诊断，非零即失败，不筛掉语义错误、伪造模块声明或将模块改为any。`@orca/process-host`沿原orca-source同一真实TS文件，Windows addons使用其实际index.d.ts；其他bare imports优先解析本产品已安装node_modules，未匹配时仍按TypeScript正常规则查找祖先依赖，实际解析来源与缺失须由真实检查及诊断确认。没有为本项加入原桌面入口、全量历史测试、科研或web工程的独立roots；真实imports带入的声明和消费者仍须处理。

静态读取准确上游package.json及多文档pnpm-lock.yaml，使用YAML2.9.1成熟parseAllDocuments选择实际产品importer，核得下列必要类型来源。原Reviewer准确a54f0efac37837e293c34ce67ab1f5f3cbddbf60技术接受该计划后，七项真实声明已按原锁精确版本显式加入runtime devDependencies与现有依赖清单；本次没有执行安装或修改pnpm锁，缺失来源保持真实缺失。取得主控必要dependency窗口后，以原lockfile-only/frozen ignore-scripts流程串行取得；Electron只使用原包内声明，ignore-scripts不运行其二进制下载/安装脚本，产品prod deploy不包含该开发依赖。

| 声明来源 | 原锁实际版本 | 当前产品安装状态 |
| --- | --- | --- |
| TypeScript | 6.0.3 | 已安装，未运行类型正文 |
| @types/node | 25.9.5 | 已安装 |
| electron | 43.7.8 | 未安装 |
| @types/proper-lockfile | 4.1.4 | 未安装 |
| @types/qrcode | 1.5.6 | 未安装 |
| @types/react | 19.2.18 | 未安装 |
| @types/react-dom | 19.2.7 | 未安装 |
| @types/ssh2 | 1.15.6 | 未安装 |
| @types/ws | 8.18.1 | 未安装 |

类型、生成、候选构建及真实服务仍分别占用主控交付的串行Stage，不能从本入口推导运行许可。真实诊断若定位其他缺失必要声明，记录实际模块和来源后按同一规则处理；若涉及未消费的原历史源码，先核其是否被真实产品链带入，再由原Worker修复范围或交主控，不放宽检查。生成`web/src/api/schema.d.ts`仍只由既有生成器完成；当前源码没有可安装、类型通过或全部功能接受结论，T12/后台Job继续。

本次实际执行`check-typecheck-plan.mjs`，仅用TypeScript6.0.3读取、解析配置和真实入口文件名，未创建Program，EXIT0；成熟YAML原锁读取、实际声明包存在性检查、文档与空白检查通过，原件在`typecheck-plan-static-01/`。原Reviewer新提N19为共享beforeDispatch的实际Claude直接消费者及ACP/Codex声明，本Worker按真实调用继续同步，不扩大为无关UI任务；该消费者修复及类型检查正文尚未登记通过。

### 15.4 N19实际共享回调消费者

原Reviewer正式`1db70be01e6422355cc2884d5a6a21df93b48509`局部确认3192的N16/N17/N18 Pi源码修复，并退回共享回调的直接消费者；本Worker沿实际调用修改九份Claude/ACP/Codex源码。Claude dispatch、connection及SDK输入队列使用同一回调返回契约，异步批准后的同步guard在SDK iterator交出消息前执行，拒绝保留实际unwritten。ACP将同步guard保存在原steer队列项，等待前一prompt/cancel后、启动实际prompt前执行；拒绝不创建新的输入。Codex在等待实际turn打开及原steer/start分支后，把同步guard传至原connection.request的实际sendLine前，写入前拒绝沿真实unwritten类型解除本次echo关联，其他超时/断开保持原unknown。

上述修改只同步实际共享契约及其真实消费，未使用cast、假声明或丢弃guard消除类型问题，不授予其他Agent原生ToolsOff、账号、模型或执行权限。类型入口§15.3包含这些真实传递imports；真实Claude/ACP/Codex及Pi执行结果均未据此登记通过。当前只执行`node --max-old-space-size=512 .verification/swa-cli-headless-20261020/check-n19-static.mjs`的九份成熟TS语法检查，文档来源/本地链接及空白检查；原件位于`n19-static-01/`，类型正文、构建及实际队列/模型检查保持`NOT_RUN`。T12当前阶段源码及真实剩余条件见§16，没有新重操作授权。

## 16. 控制端接续、严格调用者及具名服务Job阶段源码

本阶段沿主控SPEC21.1.3及已审§3.4、§7.6实施，使用本Task/Dispatch原身份持续处理。`controller.recover`进入Go命令字段表、当前批准动作、runtime写动作分类、CLI副作用输出、Node命令及私有durable方法；HTTP/OpenAPI继续引用同一CLI schema。命令只接受既有controller/request_id，Go/App仍从真实当前项目、固定context及原授权取得invocation。CLI保留controller_unverifiable的6和consumer_fenced的3，未知效果不自动重发；生成类型尚未执行。

`controller-admission.ts`在既有dispatcher进入legacy路由、native executor或completed子R重放之前核验。私有owner bridge仅允许固定产品端口及明确原生历史读取；实际helper须具备原生launch/restored attestation、原owner receipt、真实PTY/incarnation/root/helper创建身份。首次Run与根Task严格匹配pending父R、原子R和固定参数；recover只允许自身R/run-use与同一旧Run/root/context/generation。普通Task/Worker写入匹配当前consumer和原swa.controllerDeliver R/native，Worker.stop/release也核真实caller与Dispatch。所有参数按原动作完整比较，不接受调用者新增目标或第二用户任务。helper的实际status预检带原生launch证明，准备阶段允许尚无Run的真实观察。

recover先在原SQLite的BEGIN IMMEDIATE中保留同一Run、旧owner及generation，再取得两次新鲜真实PTY和Windows进程观察。明确旧helper仍在且尚无外部效果时，沿原executor的effect-free结算拒绝；查询或结算未知保留原reservation。首次创建前持久记录R/controller-pty、原生推导handle及pty-spawn，随后只在首次分支调用原dedupeTerminalCreate/reconcileExisting=false。取得新helper实际launch及创建身份后，仅执行原生R/run-use，核同Run/root/context、新consumer及严格增加generation。pending同R只读原checkpoint、子receipt、进程及Run，不create/dedupe/send/runUse；缺证明继续unknown。完成接续后的实际selection仍来自同Run/root/Dispatch的原Worker开始回执，原pending Worker.start继续占该Run的两席与关闭条件。

历史task/Worker/成果观察复用原方法注册表及真实DB/session来源，不依赖旧helper输入。controller.show无法确认活helper时返回实际owner/scope及controller_unverifiable。最终关闭须有每个最终owner的完成close，或唯一准确completed recover证明其旧owner已退出；pending recover、未释放Worker或非空daemon PTY均阻止正常退出。恢复本身不重新prompt、不新建替代Worker、不清除未知Job/输入或释放资源。

Go首次serve创建当前用户与SYSTEM受保护DACL的`Local\SWAService<UUID>`，不设置kill-on-close或breakaway；当前serve在启动子进程前加入该Job。既有daemon-v49.pid和真实authenticated hello携带同一个swa_service_job对象，包含源码/私有根、原serve及实际daemon PID/创建时间和session。Go严格读取固定v49记录，其他协议、重定向、缺损或重复记录拒绝；复开时核旧serve已退出、同候选/私有根、实际daemon成员、Job权限及其他serve，再把当前serve加入原Job。Node通过实际Windows addon核成员、创建时间及DACL，并交叉核真实hello与PID record；内部ownership只供Go核验，公开readiness保持原三个字段。native实现尚未编译，实际复开、嵌套与ABI能力未验。

`controller-recovery.mjs`已形成R01/R03/R04/R05/R09的核心真实入口：同一准确干净候选和公开项目、实际完成子R的无helper调用拒绝、活旧helper明确无效果结算、精确结束本项root/helper、同Run接续、完成R重放、旧C与第二任务拒绝、历史读取及关闭。strict-caller-probe使用原Runtime transport和真实已有R，不造launch证明；故障入口使用§19服务前构建的Go控制程序及原生DaemonClient观察，在所持实际目标句柄上核完整归属后，只结束本项root/helper。构建先生成实际probe bundle和控制程序，服务期间不编译。T12外围沿原服务/资源/Orca保全路径；输出remainingCases非空时返回6，不能登记完整T12通过。

真实剩余条件包括同库serve/runtime重启及同Job复开、recover各效果边界断开与pending/竞争屏障、真实restored证明及旧generation、另一真实项目/Run，以及同一活Worker会话与unknown资源保留。§7.6的全部条件和T13同候选双Worker验收保持；未命中细窗口记INCONCLUSIVE，未执行保持NOT_RUN。当前入口没有运行任何CLI、服务、原生故障或模型正文，完整T12其余入口继续由同一Worker完成，通用终端正文也继续实施。

本阶段静态检查入口为`.verification/swa-cli-headless-20261020/check-t12-source-static.ps1`，原件目录`t12-source-static-01/`。检查限定成熟TS/JS语法、CLI JSON与OpenAPI YAML解析、Go只读gofmt-d、两份PowerShell Parser、native JS的node --check、三份Markdown来源/本地链接和Git空白；未创建TypeScript Program，未编译Go/C++，未运行测试正文。必要类型声明的真实锁/安装、完整类型检查、生成、构建及所有动态验收仍须主控交付准确串行窗口。

该入口本次实际EXIT0：24份TS/MJS语法、JSON/YAML、8份Go格式、两份PowerShell Parser、native JS语法及Git空白检查通过；三份Markdown共7个本地链接、24处Orca及11处Pi来源路径检查通过。完整类型、生成、Go/C++构建、CLI、native Job、故障、服务与模型正文全部NOT_RUN，静态检查不构成T12或安装接受。

## 17. 正文子请求持久结算及实际来源关联

本阶段继续实现SPEC21.1.2已定稿的效果结算和结果字段，沿原R/native、原native executor及真实structured host。handler在首次host输入前完成真实controller/Dispatch/session及当前Go批准检查，明确在本次调用尚无输入时，将真实rejected/effects_applied=false先写原child完成receipt；缺少持久结算callback或保存失败返回unknown。原parent/child的完整operation、Agent、模式、session、fence及正文在同一既有SQLite事务中checkpoint，事务任一步骤无法确认均保留unknown。首次调用host以后，异常或无明确结算的host refusal保持operation_unknown，不把operation_unknown类拒绝解释为已知无输入。实际host返回的queued/journaled/accepted/rejected也先持久完成child，再交外层父请求。

首次及后续正文共用严格的structuredInputBinding schema，Agent与execution_mode写入原checkpoint，和实际host消费前的Agent/session逐项比较。实际结果提供request_id、native_request_id、dispatch_id、agent、execution_mode、session_id、operation_id及真实client_message_id/source；没有真实turn_id时不填造。request.show沿同一binding读取原journal，核原submission的operation与fence，按实际handoverRecorded/handedOverAt区分queued与journaled，不从当前其他输入替换原请求归属。

原T13同候选双Worker驱动增加真实验证：B后续输入及同R重放的binding相同、完整text block等于实际公开输入文件、真实SQLite的R/native已completed且保存同一binding、B实际第二轮完成后request.show仍指同session/operation且原journal已accepted。复用原双Worker和原模型轮次，不新增模型调用或伪造数据库内容。全部新增正文NOT_RUN；当前成功选择仍限定已审Pi结构化原生账号政策，terminal模式及其真实能力条件继续按SPEC实施，未新增其他Agent的执行许可。

本阶段只运行成熟TS/MJS及JSON/YAML语法、三份Markdown的来源/本地链接与Git空白检查，入口为`.verification/swa-cli-headless-20261020/check-input-settlement-static.ps1`，原件目录`input-settlement-static-01/`；完整类型、生成、编译、host队列、真实SQLite正文、模型和安装验收未运行。

该入口实际EXIT0，5份TS/MJS、JSON/YAML、三份Markdown/7个本地链接/24处Orca及11处Pi来源路径和空白检查通过。原Reviewer已对前序7e阶段发出N20/N21初步返修：pending缺失checkpoint保全及故障目标同句柄完整归属；由同一Worker后继处理，7e没有整体接受结论。

## 18. pending接续的原checkpoint保全

已完整读取原Reviewer准确`1aa3aa4bd5e646f942c073a51fc35950a5263ff5`和`2666699eeb7d0f1e0072aad0dc8db933dcffc432`两份正式报告的新增内容，efa structured正文阶段获得限定静态接受。N20消费者现将pending原JSON解码错误直接转为operation_unknown；null、缺失或无法完整解释的checkpoint在recover handler中同样保持原R及屏障。全部pending观察包含scope-reserved后继解析、真实Run读取及退出证明，统一位于unknown效果包装中。schema和实际invocation、同项目/旧controller/Run-root/context、旧owner、generation、准确children及R/run-use关联须完整一致，stage仅接受真实现有四种checkpoint。只有严格完整的scope-reserved记录、原consumer不变及两次正向新鲜退出/仍在证明，才返回明确effect-free结果，由包装外按原生规则结算；pty-spawn及以后继续只观察并以unknown包装缺证。当前请求与原mutation关联无法确认的pending也不进入删除路径。

N21同句柄故障归属由同一Worker继续：服务期间不编译，现有故障脚本在修复及实际验收前不运行。N20只运行两份TS成熟语法、JSON/YAML、文档来源/链接与空白检查，原件目录`n20-static-01/`；真实begin后/首checkpoint前中断、其他pending阶段及全部T12动态正文均NOT_RUN，原缺失checkpoint场景仍须自然命中和保存真实证据。

当前完整pending包装再检查原件为`n20-static-02/`，使用成熟TypeScript parser仅解析该变动handler，未创建Program；文档及空白同时检查。N21源码保持互斥开发，不将其未提交结果计入本次N20返修。

## 19. 故障目标同句柄的真实归属

N21沿已审§7.6的普通预编译Windows控制helper实施。`tests/swa-cli-headless/controller-fault/main_windows.go`使用既有Go及golang.org/x/sys/windows，在候选构建的既有Go串行阶段生成`runtime/controller-fault.exe`；实际DaemonClient只读检查源构建为`runtime/controller-inspection.cjs`。原T12驱动调用同一候选的控制程序，构建闭包检查要求两项存在；服务期间没有编译、动态生成代码或故障钩子。该TS入口也进入原strict/noEmit类型配置，仍未创建Program或运行语义检查。

控制程序先从实际open回执与固定v49 PID record取得目标及Job，再打开并持续持有root/helper和daemon的真实Windows句柄。目标句柄具备终止、同步和查询权限，daemon/其余父链只有同步与查询权限；核当前用户/SYSTEM受保护Job DACL、无breakaway/kill-on-close规则，逐一以同句柄核IsProcessInJob、GetProcessTimes及QueryFullProcessImageName。目标PID与原Orca保护列表或当前控制程序重合即拒绝，helper与daemon必须来自同一候选node.exe。

持有目标句柄之后，控制程序仅启动同候选Node只读检查，子环境只给必要系统变量。检查使用实际私有SQLite的完成open/recover原R校验owner，并用上游DaemonClient真实token握手与listSessions，不复制或打印token，不使用模拟协议或自动启动daemon。authenticated hello须与原PID record的Job/source/session一致；真实PTY的sessionId/handle/incarnation/root PID及存活状态须匹配原owner。该新鲜观察返回后，Go以实际Toolhelp32 snapshot建立helper→root、root→daemon父链，持有链内每个真实句柄，核创建顺序、同Job及同候选/系统shell程序来源；再次核所有所持句柄仍活、创建时间及成员不变。观察缺失、过期、父链不完整、身份或来源变化均在任何终止前拒绝。

完整证明后仅对原先持有的helper/root句柄调用TerminateProcess并等待同一句柄退出，不重新按PID打开、不结束daemon或整个Job。若第一个目标终止后第二个目标沿原链自然退出，使用该既有句柄的实际signaled状态确认。实际观察、持有父链、保护PID及退出结果保存原件；部分终止、等待或句柄关闭失败返回6并保存错误。Node只读检查最多15秒，超时仅结束本程序直接创建的检查子进程，原目标保持已有实际状态。

当前仅形成源码、打包消费者与真实入口。原N21故障脚本已由该同句柄消费者替换；该控制程序、daemon观察、故障终止、接续与所有T12动态正文全部NOT_RUN。当前没有重操作授权，构建及类型诊断、真实Job嵌套/父链是否满足、实际ABI和全过程仍由同Worker在准确窗口验证，失败立即保留原件与unknown，不降低§7.6或同候选双Worker验收。

本阶段静态入口为`.verification/swa-cli-headless-20261020/check-n21-static.ps1`，原件目录`n21-static-01/`，只执行变动TS/MJS与JSON/YAML成熟语法、该Go文件只读gofmt-d、类型配置解析/入口名、三份Markdown来源/本地链接及Git空白检查。

该入口本次实际EXIT0：5份TS/MJS、JSON/YAML、Go格式、TypeScript6.0.3配置解析与20个真实根文件名、三份Markdown/7链接/24Orca及11Pi来源路径及空白检查通过。TypeScript Program未创建，Go控制程序及Node probe未构建或执行，全部原动态验收仍NOT_RUN。

## 20. 原始PTY与完整调用者incarnation分别核验

已完整读取原生`orca-runtime-agent-prompt-request-correlation.ts`、`terminal-interactive-wait.ts`及`terminal-orchestration-authority.ts`的实际生产者。`getTerminalPromptRequestBinding`的processIncarnation沿原daemon incarnationId，与真实PTY inventory的incarnationId比较；`getOrchestrationDispatchAuthority`的processIncarnation则沿原`getTerminalProcessIncarnation(controller handle)`取得完整调用者身份。创建open/recover helper时分别核原始PTY绑定、同一ptyId、完整原生调用者身份及实际launch commitment，owner中分别保留binding和caller_authority的实际原值，不自行拼接、解析或转换它们。exactController继续核原始binding与真实kernel创建身份，并单独核当前原生完整process incarnation仍等于原owner。

N22返修限定上述两份产品TS消费者，原controller-inspection对raw session.incarnationId与binding的核验保持。当前只做成熟TS语法、文档来源/本地链接和空白检查，原件目录`n22-static-01/`；Program、正常实际helper启动、recover及全部动态正文仍NOT_RUN。c962的完整pending包装和3c4的同句柄故障消费者均已交原Reviewer，原T12范围与安装验收保持，互斥R05测试入口继续开发。

## 21. 私有后台失联后的原请求保全

继续核查真实清单消费者发现：上游DaemonPtySessionInventory.listProcesses调用withDaemonRetry，默认respawn callback可在daemon gone时通过原Spawner.ensureRunning创建替代daemon。产品私有组装现显式传`automaticRespawn:false`；该可选内部组装参数使实际DaemonPtyAdapter不取得respawn callback。withDaemonRetry在缺callback时抛出原读取错误；reconnectAfterWriteFailure的缺callback分支直接返回并跳过后台恢复，原写入失败沿其原调用链返回。原参数默认及其他宿主调用保持，未增加用户设置、环境全局开关或新的恢复服务。

pending接续继续使用当前真实daemon的authenticated inventory；读取失败由既有unknown包装保留原R、原checkpoint及资源，不为只读观察创建新daemon或重放helper/Worker。首次显式serve初始化及已审同库接续按原Job/source/实际记录条件执行，daemon失联不授予替代未知所属的权限。清单catch实际记录原audit后抛出错误，不把失败解释为空PTY证明。

已完整读取原Reviewer准确`b8c8e780c9848a75d7e8d690e583153e38fa595f`两报告：c962完整pending包装获得限定静态接受，3c4的N21源码修正确认，实际运行均未验；5110的N22另交复核。本阶段仅修改私有host组装、原daemon init及现有launch policy类型，必要真实验证是在本项已证所属daemon退出/端点不可达条件下，核pending原R保留、没有替代daemon和没有重发。该故障条件及全部T12正文仍NOT_RUN，没有新增运行授权。

本阶段原件目录`daemon-failure-policy-static-01/`，只解析三份变动TS、文档来源/本地链接及Git空白；未创建Program、运行服务、控制进程或执行任何模型。

## 22. R05自然pending竞争与真实PTY清单入口

T12核心真实入口继续沿同一公开任务、同一准确候选和原一次recover。驱动在实际R为pending且SQLite已出现scope-reserved或pty-spawn时，分别仅提交一次不同R的真实CLI请求，保存竞争前及返回后原receipt和实际返回。只有真实operation_in_progress、竞争前后原R均pending且仍为同一指定stage/原payload、竞争R已由原生无效果规则结算、没有竞争子R/run-use且原Run/Task数量未增，才登记该阶段屏障已观察。实际checkpoint已推进、完成、缺失或无法证明跨越准入时的指定阶段，均保留原前后原件并记INCONCLUSIVE；没有命中的阶段同样进入remainingCases。不延迟产品、不写业务库、不加暂停钩子或自动重试。驱动等待所有已启动的实际CLI结算后才处理失败。

完成原接续后，以同一R及不同真实controller payload验证request_mismatch且原完成receipt不变；原同payload重放和旧C新R拒绝保持。实际只读DaemonClient检查现保留完整原inventory，驱动比较故障前与接续后的真实存活PTY标识集合：仅移除旧PTY标识并加入实际C_new对应标识，其余存活PTY标识须相同。该集合检查用于核新增helper数量，其余进程身份与资源保全继续由原真实用例核验。只读源仍核原owner/SQLite、authenticated hello、准确安装与私有根，不构造原生响应。

剩余条件继续明确包含重启后的pending观察、各效果边界丢失、同库/同Job复开、restored/旧generation、跨项目/Run及同一活Worker/unknown资源，R10等既有全量条件也保持未验。当前R05新增正文及所有CLI、SQLite、PTY、故障和模型均NOT_RUN，没有新重操作授权；源码入口不代表命中两个自然窗口或T12通过。本阶段原件目录`t12-r05-static-01/`，只执行两份TS/MJS成熟语法、JSON/YAML、文档来源/本地链接及Git空白检查。

## 23. 后继串行窗口的准确入口

已准备独立`.verification/swa-cli-headless-20261020/next-window-04.ps1`，SHA256为`05b0bf24bca39ba075a683063ab26e19f50ac09d39974516b00705a06ff420a1`。它要求正式邮件给定ExpectedSource，先核本Worker准确目录/分支、干净HEAD及新EvidenceName，再仅执行所选单一Stage。dependencies/build额外核原私有CAS及其到本工作树的父目录均无重定向；dependencies按该CAS及显式verify-store-integrity串行执行lock-only和frozen ignore-scripts安装。typecheck按§15.3的真实TS6命令执行，generate仍用原生成器，build只选择新candidate06。每条重命令前重新执行原资源双采样，保留原BelowNormal、Node1024/生成512及Go4/512MiB额度，不自动串联后继Stage或恢复原S。

本次只做PowerShell Parser及路径/原件只读核查，Parser零错误；没有执行该runner或任何Stage。原next-window.ps1与build-06/next-window-executed.ps1的实际SHA256均保持`bae62ff4c1eee443f0efafabf87f814f4a47f6177b9e0812a0ed9622cd087522`，原build06已经消费且不再执行；旧candidate05及全部失败原件保留。新candidate06尚不存在，7份已审开发声明的锁/安装、Program、生成、全构建和全部动态验收仍未完成；正式窗口须由主控精确停止当前原S后交付，当前准备不构成授权。

本次N24及N23文档返修和后继入口的实际静态原件在`window04-n24-static-01/`：一份变动MJS、JSON/YAML、三Markdown/7链接/24Orca及11Pi来源路径和空白检查通过；runner最终Parser及准确三份摘要另存final原件，正文全部NOT_RUN。原Reviewer797e已限定静态接受26cf的N23代码，当前文档按实际void后台函数语义描述；N24前后checkpoint及PTY标识集合范围同步当前源码，仍需原Reviewer复核与真实阶段命中。

## 24. R10实际取消与输出断开验收入口

原R10计划已独立接受，本阶段将其中真实取消和stdout断开子范围接入原安装检查入口。`scripts/verify-swa-cli-headless.ps1 -Case T12`新增`-RecoveryCase core|cancel|stdout-close`，默认core沿原核心路径；其余两种在同一准确候选、固定公开项目及真实旧helper退出后，将实际源码、原open回复、Run/root、当前runtime/authority、私有DB和保护PID传给`tests/swa-cli-headless/cli-failure.mjs`。这些文件均为真实已有来源的测试参数，未构造CLI、Orca或模型回复。当前全部新正文NOT_RUN。

`tests/swa-cli-headless/cli-fault-control/main_windows.go`由原build脚本在服务启动前编译为候选`runtime/cli-fault-control.exe`，闭包检查要求此文件存在。普通控制程序先创建自身隐藏独立console，再以CREATE_NEW_PROCESS_GROUP启动真实候选swa recover。发送前持有真实CLI句柄，核完整程序路径、创建时间、保护PID及当前console只有本项两个进程；取消只对真实CLI group发送CTRL_BREAK_EVENT，stdout断开只关闭该真实子进程pipe读端。相同句柄确认退出，实际CLI退出码、Wait/pipe/control错误和超时均保存，控制程序成功不能替代130或6实际结果。未命中等待窗口保留INCONCLUSIVE，不自动重试或改变产品时序。

Windows选项和group语义已完整读取Microsoft官方[Process Creation Flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags)、[Console Process Groups](https://learn.microsoft.com/en-us/windows/console/console-process-groups)、[GetConsoleProcessList](https://learn.microsoft.com/en-us/windows/console/getconsoleprocesslist)、[GenerateConsoleCtrlEvent](https://learn.microsoft.com/en-us/windows/console/generateconsolectrlevent)及[Creation of a Console](https://learn.microsoft.com/en-us/windows/console/creation-of-a-console)。方案据此分两次创建；NEW_CONSOLE与NEW_PROCESS_GROUP不同时用于实际CLI，原Orca和原console不执行AttachConsole/FreeConsole。已核实际安装Go的HideWindow和SIGINT处理源码，真实本机console/group、130及输出6仍未运行。

独立原Reviewer的msg_d856cb2ad7c1及msg_02eb5a9aff89均已完整读取并ack，本阶段补其要求的真实完整PTY库存和原生runUse集合。`controller-inspection.ts`增加互斥的真实owner、真实request.show完成回复及inventory-only读取方式，继续原DaemonClient认证hello、原PID record/Job、准确候选和私有DB核验。驱动保存前后完整库存，原C须已退出，新增PTY最多一个并与原R checkpoint/final owner对应；完成时新增PTY和原R/run-use各恰为一个。相同authority的全部原runUse条目保持，新增只能是原R/run-use；原Run/root/spec和实际generation另行核验。

完成后实际调用同R recover，再核原receipt、runUse集合、完整PTY标识和存活集合不变，并逐项比较新旧全部PTY的sessionId、terminalHandle、incarnationId、pid、isAlive、wslDistro。其他PTY的消失或身份改变均失败；真实owner检查仍对最终新PTY核实际原绑定。此处库存和集合只描述实际快照覆盖，不能据此声称未观察到的瞬态分支。request.show只读原件，pending recover观察继续由原R08单独验证；pending、未命中、网络连接失败4及处理中断开6尚未覆盖时均保留remainingCases，驱动及外围退出6。

本阶段仅允许语法、格式、文档来源及差异检查；实际静态原件目录为`r10-source-static-01/`。没有依赖安装、TypeScript Program、Go/C++构建、生成、服务、故障或模型执行，尚无可用的新安装候选。原问题msg_991a51a62cc3连续三次等待600000ms超时仍待主控，静态实施继续；后继正式窗口须指定随后准确源码，不能沿用4ce作为新源码的ExpectedSource。原build06已消费、原S及本机Orca保持原资源归属；整体T12、通用terminal及同候选双Worker验收继续由同一Worker完成。

## 25. R10真实输出契约检查

已完整读取独立准确0df0f4a5两份正式报告及N25原邮件，继续原Worker返修。取消场景在真实130及控制条件满足后，要求原stdout无读取/保存错误，成熟UTF-8严格解码与JSON.parse消费完整字节流，结果必须为单一失败envelope，保留原request_id/controller、真实delivery_unknown错误和inspect_original_request，并实际包含带原项目、原R及--json的查询诊断。空输出、坏JSON、多份JSON、错误关联或缺诊断均不能作为有效取消结果。

stdout-close保留真实部分输出及解析错误原件，允许stdout不完整；只有实际6、控制条件、真实pipe读取错误、实际stderr的输出失败消息、已知R/控制端关联及原R查询诊断均具备，才登记OBSERVED。缺少这些事实时保留INCONCLUSIVE和remainingCases，不能由6单项推断输出失败。Go控制程序通过标准os.PathError的Op区分真实读取、保存文件写入与未分类复制错误；保存或未分类错误使控制程序失败，不能冒充预期pipe读端关闭。没有替换Writer、CLI回复或产品时序。

该返修仅执行成熟MJS语法、Go格式、文档与差异检查，原件目录`n25-static-01/`；全部真实输出、console/group、PTY、SQLite/HTTP、故障及模型正文继续NOT_RUN，仍无新窗口。原资源问题保持待答；R06/R08及通用terminal后续实施继续，不据局部源码或静态接受结束整个任务。

原Reviewer补充msg_bead5052222b的N26后，同一返修将`cmd/swa/output.go`输出失败的stderr加入真实已校验`selected.Controller`，字段为requested_controller；原controller/run_id/task_id继续来自已实际读取的回复。recover成功后stdout失败时，原C_old与已知C_new/Run/root均可保留，公开JSON不增加字段。真实驱动要求requested_controller准确等于原C_old；普通controller关联只接受原C_old或实际completed receipt中的C_new，实际诊断已经知道C_new时另核同一Run/root，不以pending checkpoint的expected身份充当新控制端证明。已完整读取准确02486602补充正式报告。此补充及N25后继原件为`n25-n26-static-01/`，只执行变动MJS语法、两份Go格式、文档和差异，最终诊断范围修改另存final语法/文档/差异原件；Go编译及全部正文继续未验。

## 26. 重启接续与真实开发依赖更新

本次沿原Task接续为`ctx_0cf6ac28fd13`，主控为`term_84161ef8-54be-49cd-b699-145ed804f645`，独立Reviewer沿原Task接续为`ctx_066b3ab5f10c`。已完整读取主控`swa-reuse-recovery-20261021.md`、新邮件及原Run定向后续。系统重启后的原S退出、本机Orca29972/runtime8362当前运行及资源归属以主控新鲜核查为准；本Worker没有恢复旧S或操作Orca。`msg_93d5b66aa6f8`接续原完整实施写域，并仅授一次dependencies04。

准确干净`7c812a1a972ed914bae3b9cd864702e5426b9492`、runner05b0及独占新目录核实后，实际执行`pwsh -NoProfile -File .verification/swa-cli-headless-20261020/next-window-04.ps1 -Stage dependencies -EvidenceName dependency-04 -ExpectedSource 7c812a1a972ed914bae3b9cd864702e5426b9492`。exec2798于UTC13:02:24启动，实际外层最终EXIT0。原pnpm11.27.0的lock-only和frozen ignore-scripts install分别7.9秒和2.1秒完成，两次资源与两命令退出均0；BelowNormal、Node1024及私有CAS/TEMP保持。资源两组CPU11.3/8.0%与14.6/23.2%，可用内存均超过4GiB，单调间隔2.5012007与2.5016213秒。peer及deprecated提示保留于完整日志。

`pnpm-lock.yaml`由原命令真实生成，增加已审七项开发声明及resolution/snapshot；pnpm同时将现有Electron和React类型peer选择收敛至显式43.7.8与19.2.18。没有手写锁、升级声明或执行安装脚本。原件在`dependency-04/`，含准确SOURCE、完整日志、四项退出、外层EXIT0及实际进程身份。UTC13:02:56.3636359和13:03:05.9543247两次新鲜CIM对已观察根27240、33024、7572及子进程均无匹配，已立即通过`msg_78745a825e55`交回窗口。当前没有消费typecheck、generate、build、服务或模型Stage；同Worker继续源码复用核查、必要实现和全部真实安装验收。

## 27. 真实严格类型检查与契约生成

准确`3ba76a85cc968224f283315b64a4be4c27f1fcce`的真实锁及安装已获原Reviewer准确af60598f限定接受。主控随后分别授予同runner05b0的typecheck01与generate03，两项独立执行并逐项交回，没有串联其他Stage。

`pwsh -NoProfile -File .verification/swa-cli-headless-20261020/next-window-04.ps1 -Stage typecheck -EvidenceName typecheck-01 -ExpectedSource 3ba76a85cc968224f283315b64a4be4c27f1fcce`实际exec40419外层EXIT1，TS子退出134，资源退出0。CPU5.5/5.0%、可用内存均约18.85GB、间隔2.5010102秒；BelowNormal、Node1024及私有TEMP保持。原TS6 strict/noEmit/skipLibCheck=false在约1022.7MB heap后抛出真实OOM，没有语义诊断，类型检查记FAIL。完整原件在`typecheck-01/`；UTC13:09:07.9578263和13:09:21.5806254两次新鲜CIM对已观察31832、35124、27584、27964及子进程均空，已立即交回。没有提额、关闭规则或重试；原上游分项目runner对node项目7GiB和CLI2GiB的预算仅作来源事实，当前新额度仍待用户决定，不影响其他静态实现和独立构建准备。

`pwsh -NoProfile -File .verification/swa-cli-headless-20261020/next-window-04.ps1 -Stage generate -EvidenceName generate-03 -ExpectedSource 3ba76a85cc968224f283315b64a4be4c27f1fcce`实际exec31513外层、原生成器及资源退出均0。CPU9.5/9.4%、可用18.59/18.62GB、间隔2.5010712秒；Node512、BelowNormal及私有TEMP保持。真实`web/src/api/schema.d.ts`由既有生成器增加controller.recover、SwaNativeLaunchPolicyV1、nativeConfigurationSource及selection.native_launch，与已审契约对应，未手改生成文件。原件在`generate-03/`；UTC13:12:28.7262117和13:12:41.1910594两次定向新鲜CIM对根15636、子进程及真实生成器node均空，已通过msg_570974b28663交回。下一完整build使用新candidate06/build07，当前没有执行native/Go构建、服务、模型或安装验收。

已完整读取主线CLI参考及原Reviewer源码对应报告。当前client/helper直接调用固定Orca RuntimeClient/transport；host直接组装原OrcaRuntimeService、RuntimeRpcShutdown、16项原生RPC及原PTY/daemon；structured正文直接调用sendAgentTurn、host.send和waitForSendSettlement，唯一receipt继续由原executor/SQLite维护。必要产品授权、隔离、helper真实身份及native Job保持。原Reviewer已独立核实helper六项历史只读分支及collectTaskResult没有当前产品调用者，允许后继精确删除；当前生成阶段没有应用该清理，不以来源核对或清理作为构建前置。

## 28. ConPTY分析日志位置的窄修复

原Run的msg_13aa2d8afcd3只授一次build07。准确干净`c42a695f756886c2afcc8f36f0af6339dae9ec29`、runner05b0和全新candidate06核实后，实际exec76158于UTC13:14:25启动；资源CPU6.5/5.0%、可用约18.71GB、间隔2.5010402秒通过。真实prod deploy324项及363项供应链核查完成，21份bundle/metafile生成。官方归档37618919字节、headers10291794字节及node.lib2988566字节均HTTP200，原SHA、node.exe大小/哈希与24.21.0版本核验通过；Python3.13.13和VS2022实际进入编译。

实际CL=/utf-8后，conpty.cc已越过原头文件17语法错误，保留151行C4267警告。新的c1xx C1258为无法保存`conpty.nativecodeanalysis.xml`，原MSVC及完整构建退出1；没有完成native/Go/VERSION。原件在`build-07/`，实际外层和build退出1、gate0。UTC13:18:42.8148453和13:19:13.0583412两次新鲜CIM对已观察根29244及相关子进程均空，已立即交回；主控msg_74dbd8448c6c正式收回窗口并解除冻结。candidate06及全部失败原件保持。

Worker与Reviewer分别以成熟.NET XML读取真实conpty.vcxproj，得到原IntDir、EnablePREfast=true及未指定PREfastLog；失败目标长269字符，父目录存在，文件不存在。路径长度与C1258的因果仍须实际后继编译确认。已完整读取主控提供的[Microsoft /analyze文档](https://learn.microsoft.com/en-us/cpp/build/reference/analyze-code-analysis?view=msvc-170)、[CL环境变量](https://learn.microsoft.com/en-us/cpp/build/reference/cl-environment-variables?view=msvc-170)及[C参数引号规则](https://learn.microsoft.com/en-us/cpp/c-language/parsing-c-command-line-arguments?view=msvc-170)。

原build脚本现仅在native循环为每包独占创建本次work下a0—a3目录，realpath及lstat拒绝重定向。CL保留/utf-8，使用官方后置变量_CL_增加/analyze:log和该目录，参数位于MSBuild命令行之后；引号前实际两个反斜线经MSVC参数规则表示目录末尾一个反斜线，_CL_长度按官方1024字符限制检查。各包目录独立，原gyp4并行及所有编译/分析选项保持。node-pty真实vcxproj包含conpty.cc、path_util.cc及gyp附加的win_delay_load_hook.cc；process-tree的binding列六个源文件，两个安全模块的binding各列addon.cc，各包附加hook的名称与自身源文件名不重复。按源文件及独立包目录保存分析日志。旧CL.command.1.tlog仅有BOM，没有取得完整实际编译命令；原XML未指定PREfastLog的观察不扩大为已证CL全参数。ConPTY编译完成后须在准确a0读取真实非空conpty.nativecodeanalysis.xml；缺失立即失败。日志目录与完整CL/_CL_写入原构建日志，Go前删除_CL_，CL保持原/utf-8。其他源码、依赖、原生补丁、ABI、输出目录与安装布局保持。

本修复沿原T01构建及闭包检查：先执行MJS成熟语法、runner PowerShell Parser、文档来源与差异检查；新准确候选07/build08在另授窗口中运行原完整构建，核真实ConPTY分析文件及native/Go/VERSION，失败保留并终止。完整构建通过后，原T01装载、T02独立安装及全部真实功能检查仍须执行；静态检查不证明编译修复或安装通过。当前没有运行后继正文或增加测试钩子。旧runner的准确05b0实际字节另存build-07/next-window-executed.ps1，后继runner只变更candidate07常量，摘要另报主控。

## 29. 严格类型与全部native模块前置验证

用户2026-10-21解除资源限制，主控在原Run接续完整写域，允许集中修复与实际复验；当前规则见主线docs/RESOURCES.md。原cpu/可用内存启动门限、固定优先级、Go/Node额度已从产品和后继验证入口解除，实际资源观察保留。原Orca、账户、权限、Job所有权及安装验收条件继续适用。

准确ada的build08实际退出1，候选07保留失败原件：ConPTY三个分析XML实际生成，新增FTK1011发生于长目录的FileTracker tlog。两个所属进程观察在UTC13:38:59.1407035及13:39:15.3641194均为空。此后编译使用每包独占短源码副本及原包实际node-addon-api，原node-gyp12.3、Python3.13.13、VS2022、Node24.21.0 ABI、MSBuild默认跟踪和分析保持。产品builder和模块检查共用scripts/build-swa-native.mjs，全部对象、PDB、tlog及分析原件保留在work；产品仅复制真实.node及node-pty原slotSourceFiles支持文件。

native-check-01实际退出0，nc01/r为全新pnpm deploy，未回写旧候选。三个原固定Node输入及真实exe重新按固定SHA256核验，四个native模块均真实gyp编译成功且用该Node实际require成功，包含readServiceJobMember等真实导出；各包实际tracking文件数与最大路径在原日志。执行helper快照为nc01/build-swa-native-executed.mjs。产品helper后继缩小复制范围，完整候选仍须以准确提交复验复制和装载。

typecheck02保留完整331行诊断，TS子退出2、外层1；后继strict03—05分别保留实际诊断及失败退出。typecheck06使用同一TypeScript6.0.3、8192MiB、strict/noEmit/skipLibCheck=false实际退出0。修复使用真实@types及stream-json/stream-chain声明路径，增加原posthog消费的@types/express5.0.6；原动态emoji JSON使用上游同版emojibase-data17.0.0。deny/fail函数保留原throw，IPC方法先核实际存在，缺失nativeError导入及readServiceJobMember包装已贯通，其余消费者使用实际类型、规范失败句子及既有身份验证。原无消费者的helper六个查询分支已按独立接受删除，查询仍经原native handlers。

go-prerequisites01实际退出0，覆盖cmd/swa、internal/swarm和两个故障控制程序的编译。后继go-prerequisites02扩大至既有workspace/httpapi全部测试时实际失败，原日志保留；失败项需要明确真实公开publication、SQL期待文件、独占输出目录或真实服务输入。适用的四个真实CLI验收用例仍按原计划在同安装候选与当前批准下执行，不以这次普通go test代替。architecture01实际退出0，47个包满足既有依赖检查。

## 30. 首个完整候选及独立安装修复

准确1209aee399a2c0b0677d7a4dbedc5f87880d14ab已普通push。build09以该提交构建全新candidate08，重验并复用三项原固定Node输入，实际退出0；四native的最大中间路径为229，Go swa/server及两个故障程序、许可与VERSION全部生成。candidate08闭包检查实际退出0，34010路径在候选内，固定Node实际native装载、Job创建/查询/关闭及watcher装载通过。strict07完整检查退出0；四包test-c完成，首次CLI执行因PowerShell未引用点号参数退出2，后继同二进制正确传参后三个传输前函数全部PASS，完整原件分别保留。

T02首次在调用安装脚本前因pwsh -File无法传入ProtectedRoots数组退出1，安装目标未创建；原入口改为直接调用候选真实PowerShell脚本。后继08-02完成真实独立installed08及版本校验，但安装后的闭包实际失败：@parcel/watcher无法解析picomatch。候选的pnpm Junction原指向包内.pnpm，安装dereference后变成根node_modules下普通目录，Node查找位置随之变化。candidate08及failed installed08均保留。两次finally的本机Orca公开身份、进程、定向文件字节/ACL保全均通过，无目录通知错误；没有模型调用。T00在同case08匿名克隆准确da3bdd公开项目并生成固定任务正文，实际退出0，human批准仍未取得。

安装部署改用pnpm11.27实际支持的子调用--config.node-linker=hoisted，保持开发工作区和全局配置。已完整读取[pnpm deploy](https://pnpm.io/cli/deploy)及[nodeLinker](https://pnpm.io/settings/node-modules)官方说明，核实际11.27实现后执行新hoisted01部署，实际退出0。全树扫描实际0个reparse point。后继使用固定Node及安装相同cpSync搬迁到新hoisted03，实际退出0，25810文件均无链接且realpath在新根内；watcher、ssh2、Linear、ws及emoji JSON均从新根加载成功。首次局部异步cp在预建目标上EEXIST的失败原件保留，后继采用产品原有同步复制行为。安装脚本在复制前拒绝候选内所有reparse point。完整后继候选仍须验证四native、实际安装、服务和功能。

dependencies.lock.json已同步真实emojibase-data17.0.0及@types/express5.0.6，原check-dependencies实际退出0，包含原summarize CLI0.25.1检查。Go资源观察明确标记primary_processor_group，范围依据[GetSystemTimes官方文档](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getsystemtimes)，不会将多processor-group的部分结果声称为全机值；它没有CPU/内存启动门限。

原R06草案已进入同controller-fault包的service_windows.go及service-request-file入口，使用实际readiness、metadata、daemon PID record、具名Job和同句柄核查，仅对本项serve/host/server实施定向故障，原daemon和保护PID保留。runtime-restart.mjs记录真实初次accepted journal及原Run/root/Dispatch/session/operation、同库重启后的不替换/不重发/占用保留，使用既有固定公开a/b正文。go-prerequisites04及MJS语法实际通过；服务故障、模型、接续清理和剩余边界正文尚未执行，脚本明确保留remainingCases及退出6。

## 31. 重启后真实安装边界与服务启动修复

本次Task沿原Run接续为ctx_a8f0c302cc3c，主控term_a5fbafe0-ce09-4492-97d1-4ba69e5aa5f6，Reviewer沿原Task接续ctx_40bf84d10b8c。已读取resume-20261021-1441及本次持久后续，累计程序写域和资源解除继续有效。准确b624已push且接管时干净；build10实际0，candidate09及installed09的VERSION为b624，完整原件保留。

install09实际独立复制、原生装载、空Job及端口冲突/直接保护根拒绝已经执行。真实最终junction被Go EvalSymlinks原样保留，随后创建home实际Access denied，原T02失败；没有install09-exit.txt，外层退出保持未知。产品现在在任何数据目录创建之前，用实际Win32 GetFileAttributes检查数据路径的全部现存组件及home/temp，拒绝reparse point；安装和保护根也检查同一条件。junction-local-02保持01的实际已编译源码，数据和保护目标与程序目录互不包含；真实最终junction、父目录junction且叶目录不存在、已有home及temp junction四项均明确命中对应reparse路径并返回scope_denied/3，保护目标只含原sentinel且内容保持。01的home/temp提前命中安装根重叠，不能证明这两个guard，原件保留。T02安装脚本同步覆盖这四项、保护目标字节/ACL及拒绝前没有新增同级目录；新候选仍须实际执行。

candidate09-provider-job原实际5!=3失败保留。provider-job10/11保留诊断复验失败；实际native进程表确认额外两项均为fixture child/grandchild派生的conhost.exe，PID、创建时间及父链与完整Job逐项一致。fixture检查现在要求三个真实Node角色/身份逐项在Job内，额外成员只能是这些Node实际派生且创建时间一致的conhost；产品完整Job成员查询与退出条件保持。provider-job12实际0，normal/forced/crash/late-child四项及parent-loss完整退出、无关Job保全、错误创建身份/重复归属/关闭句柄拒绝、processless与missing-membership及真实缺native拒绝均已执行。parent-loss前同样核全部真实Job成员；记录全部成员用于两次新鲜退出核验。此结果只覆盖普通自有进程fixture，真实原生Agent abort及双Worker保持未验。

按主控后续授权，现有installed09在全新service09-diagnostic/data、明确64506作运行诊断。当前原Orca6228/runtime a2765d35及实际daemon32280定向重新核实，前后公开CLI身份、进程及保护文件字节/ACL均通过。实际host没有取得readiness：SQLite备份报unable to open database file，随后Job归属Zod期望object却收到undefined，host实际1、serve实际6，原件service09-diagnostic。准确调用链显示daemon-entry已捕获真实归属，而daemon-main的startDaemon没有将该字段传递给DaemonServer；现补同一类型与透传，保持实际hello、PID record和内核成员的严格比较。

backup09-probe以本次实际profile-state.db只读作源，普通289字符目标实际失败，namespace路径实际备份及完整性通过。SyncDatabase现在在实际SQLite打开和backup边界使用Node成熟toNamespacedPath，其他平台保持其标准行为。backup09-source-check真实bundle原修改适配器后，对302字符目标实际backup、重新只读打开及PRAGMA integrity_check均通过；未修改原数据库。host启动失败诊断另保留真实stack，后继完整服务及关闭仍须运行验证。typecheck08以原TS6 strict/noEmit/skipLibCheck=false及8192MiB实际退出0，适用MJS语法、PowerShell Parser、文档来源和git diff --check通过。late-child只对实际Job查询捕获的成员逐项核旧身份退出，未捕获的瞬时子进程不声称单独核实；parent-loss旧Job仍unknown。没有创建human会话、Grant或token，没有模型调用；全部安装验收继续同一Worker。

## 32. 实际RPC目录与明确原生编译来源的复用

准确507的build11实际0，candidate10完整包含四个本次编译模块及Go程序，VERSION相同；28659路径、固定Node及实际原生装载/空Job闭包检查0。go-compile507的四份验收二进制和三个传输前函数实际0，实际安装服务用例仍未执行。service10-diagnostic真实host stack定位到RPC完整性拒绝，host1、serve6；本次备份及Job对象校验旧错误没有再出现，不能据此宣称整个服务通过。Job两次active=1表示仅余serve自身，原Orca公开身份及配置保全通过。

准确调用关系为worker-methods展开worker-release，后者自身含workerList；host额外单独加入同一方法，实际集合17项、16种、missing为空。现移除额外单项与直接导入，保持原16项白名单、原task集合及严格完整性拒绝；失败诊断记录真实registered/missing/duplicated。后继先对准确源码运行成熟TypeScript AST的完整跨文件注册目录检查，再运行实际host。

按主控采用的原Reviewer五项条件，构建脚本可显式接受native-source/native-work/native-evidence。原输入必须是绝对普通路径、在本仓且相互归属明确，源候选与新目标在任何目标创建前拒绝互相包含。当前明确来源为candidate10、原build11成功记录及candidate-ZZTfh4工作目录，不补造旧SOURCE。复用先核来源源码、原成功日志、真实原工作产物与候选字节、原node-addon-api和支持资产；未知或失配立即失败。仅随后依据当前具体输入变化选择原编译函数，函数、CL/gyp及跟踪/分析参数保持。原注入头文件单独核准确Git字节，只排除已观察的精确addon-api生成文件。原VS/Python/gyp及参数保留在原构建日志，复制不重复发现当前VS。新候选摘要分别记录native_modules_copied与native_modules_built，仍执行新根真实四模块装载及Job检查。

native-reuse07实际0：四包复制、全部四个实际.node在新根装载，Windows安全与registry通过原只读函数真正加载native，空Job创建/查询/关闭及错误来源/缺少原工作目录拒绝通过。native-reuse08实际0：自有registry源码副本增加注释形成真实输入变化，前三模块复制，只有registry沿原node-gyp12.3/固定Node24.21.0重新编译并实际装载；没有改正式native源码或旧候选。早期01/02的源码生成文件及夹具addon-api归属差异、03/04当前VS探测失败、06未触发lazy加载而2!=4的失败原件保留。typecheck09的完整strict检查实际0。程序继续由同一Worker构建、安装和实际验收，human批准及真实Agent仍未取得。

## 33. 独立安装服务与已审依赖分类调整

准确26036164的RPC AST检查实际16项、无缺失或重复，退出0；四包Go验收编译和三个传输前函数实际0。build12/candidate11实际0，四native从完整candidate10、原build11及原工作目录明确复用，全部28659路径和原装载检查0。service11-diagnostic实际HTTP200、五份真实SQLite完整性/外键检查0、所属退出及原Orca保全0，没有模型调用。

install11真实复制和版本核查通过，原安装后的native检查触发原30秒ETIMEDOUT/SIGTERM、退出1，后续T02负向分支未在该次运行；原因保持未知。主控随后明确批准把同一实际安装移动至仓库外独占目录`C:/Users/DW/AppData/Local/SwarmCli/candidates/26036164`。relocate-installed11核全路径、没有所属活动进程、真实VERSION及同用户ACL后使用Move-Item完成；旧安装位置消失，原失败记录保留。仓库外同一安装的原闭包检查退出0，直接阶段检查实际约796毫秒、五项实际.node来源均在安装内。installed11-scope四项真实junction拒绝及目标不变、installed11-refusals真实端口冲突和保护根拒绝、provider-job-installed11普通自有进程全部检查各退出0；这些结果没有覆盖真实Agent abort。

installed11-service保持同一仓库外安装、64506和独立data root运行，真实HTTP健康、五份SQLite完整性/外键及原Orca保全均0。本次本人批准入口仅允许Observe，实际session/CSRF、固定公开项目注册、最小observe Grant/token由用户本人执行；Agent没有执行人工入口。私有凭据仅CurrentUser DPAPI和同用户ACL文件交接，不输出明文。凭据发送前重新核实际serve创建身份、HTTP父链/监听和准确安装版本，消费仅核固定caller/project root及唯一observe动作后运行status/capabilities。dpapi-probe01使用真实公开stats.go字节验证加密往返和实际文件ACL，退出0，没有创建human session或项目token。

依据原Reviewer准确260的八项依赖条件及主控授权，runtime的zod4.6.5、yaml2.9.1、diff8.0.4、smol-toml1.9.1、jsonc-parser3.3.1、@streamparser/json0.0.26、tweetnacl1.0.3、proper-lockfile4.1.2移至devDependencies，保留精确版本和实际间接生产依赖。dependencies13的pnpm11.27 lock-only、frozen install及原check-dependencies各退出0；锁差异仅该importer八项分类，inventory及其他importer/overrides/patches保持。

原buildSWARuntime收集21份实际metafile输入，沿实际包元数据核八个构建包和ssh2→bcrypt-pbkdf→tweetnacl0.14.5的准确来源及内联输入，再逐字节复制完整LICENSE/LICENCE/COPYING/NOTICE至安装根`third-party-licenses`。包版本、内联来源或全文许可缺失立即失败，不增加external；后继完整候选及独立安装仍须实际核查全部九版本、生产闭包、服务和真实双Worker。T12、普通终端失败路径、最终同安装模型与成果验收继续，当前整体未完成。

## 34. 八项分类的真实成品及正常发行提取诊断

准确780a35e9已普通push。build13/candidate12真实退出0，四native明确复用原507完整编译输入；28233路径、同根实际装载及空Job检查0。inline13真实退出0：21份成品与260的candidate11逐字节相同，metafile的external集合相同，九个实际内联版本的许可文件均与原输入全文逐字节相同。原Reviewer累计核八项manifest/锁分类、其他字段、inventory和源码许可边界未发现新增问题，功能与最终安装保持未验。

install12使用原installer在仓库外780a35e9新根设置私有ACL后，随包Node的cpSync以EIO/Access denied失败，外层1，根为空；失败目录和日志保留，原Orca保全通过。copyprobe12在仓库内的真实LICENSE目录/私有ACL两模式各0，copyfull12同源完整复制实际0；外部copyprobe01的Node mkdir、单文件与目录复制各1，PowerShell对同根复制真实LICENSE成功。失败没有修改installer或放宽权限。

TokenFacts通过真实OpenProcessToken/GetTokenInformation核同一DW用户：PowerShell为Medium8192，候选Node及其PowerShell子进程为Low4096，两者均非restricted、非AppContainer；icacls实际显示候选exe继承工作区Low Mandatory Level，外部目标保持正常同用户DACL。主控用同一Node独立复核相同结果。normal-copyprobe12按授权使用普通Copy-Item创建新的外部Node，原与新文件均符合原固定SHA；新Node及子进程实际Medium8192，外部mkdir、真实单文件和原cpSync目录三个动作各0。没有修改原二进制、执行setintegritylevel或提升进程权限。后继使用成熟.NET ZipFile制作实际完整发行ZIP、普通解压后验证原安装入口；该归档仍在执行，未记作提取或安装成功。最终服务使用主控已授仓库外validation-data独占目录，当前260本人Observe服务继续保留。

repo独占副本的lifecycle13-diagnostic第一模式记录真实PID/创建身份、立即EOF、130及两次旧身份退出；第二模式因实际native进程行缺少creationTimeMs而失败，其他模式未运行。原执行脚本、失败及实际原Orca保全保留；后续两次定向CIM均未见该独占副本下活动进程。新驱动在身份断言之前保存spawn及最新原始进程/流观察，结果不计最终仓库外安装验收。

本次接续原C04/R10的controller-fault内部stop-http动作，沿原readiness、metadata、daemon record、具名Job、安装路径、父链、创建时间和真实DaemonClient观察，只为实际HTTP server同一句柄申请终止权限并定向操作，原observe/stop-service保持。stop-http在目标退出后记录原daemon同句柄的实际alive/exited，未知立即失败；具体场景分别检查空闲退出或必须保持存活的条件。T03复用原四份Go检查时，保留原SOURCE，核其及实际安装VERSION为真实Git提交，再比较编译来源至当前来源、编译来源至安装来源的cmd/internal/migrations/contracts/go.mod/go.sum及生成schema；差异或Git失败立即拒绝。证据分别保存三份实际源码版本，现有真实T03正文保持。两项当前仅格式、语法和差异检查，故障正文及真实Go服务检查尚未运行。USAGE改为正常ZIP解压后同一PowerShell7会话直接传保护目录数组，最终交付须包含该正确说明。

## 35. 正常发行安装与仓库外真实运行结果

extract-package13实际退出0：从完整780候选以成熟.NET ZipFile生成410042444字节真实ZIP，普通提取至仓库外780a35e9-package13，原Node pin及源码版本保持，实际Node及其子进程均Medium8192。随后未改installer完成780a35e9-install13独立复制/版本和28233路径闭包，native/空Job及端口冲突、保护根、四项junction拒绝和目标不变检查均通过；install13内外实际6，明确保留T03/T13真实消费者未验。失败install12与全部源产物未覆盖。

run-service13实际退出0：同一安装用真正仓库外validation-data/780a35e9-service13创建私有根，serve/host/server实际Token均Medium8192。真实HTTP200、五份SQLite完整性/外键、所属正常退出0及两次全Job仅余serve的观察通过，原Orca前/中/后公开身份、配置字节/ACL与定向通知保全通过。installed-inline13实际0，同安装21份成品、external及九版本全文许可均与已核来源一致，没有模型或人工会话调用。

lifecycle14以同一安装及仓库外780a35e9-lifecycle14数据执行四个实际模式，驱动退出0：立即EOF130、实际Node已创建且未发布readiness时EOF130、readiness后EOF0、真实stdout读端关闭6。每模式保存真实PID/创建时间、事件、流、退出及两次旧身份退出；有子进程的模式核两次全Job仅余serve，原Orca前后保全通过。该结果限定关闭、退出及资源范围。实际C09 stderr还输出未知身份空字段，主控据真实原件指出合同缺口；当前CLI已改为仅输出有值的实际关联与已验证requested selector，保留原R/runtime及查询提示，并给真实关闭管道检查增加精确字段断言。新诊断合同尚待后继准确二进制实际运行，不以旧驱动0登记完整C09通过。

provider-job-installed13实际0，覆盖同安装普通自有进程的四种模式、parent-loss、无关Job保全及原有负向检查；真实Agent abort仍未运行。准确f46的controller-fault单独Go1.27.2编译0，原260编译至f46的Go程序/依赖/契约实际比较相同。原四份测试和f46工具已普通复制到外部test-tools14且字节相同，末尾icacls多路径参数导致该复制脚本退出1；后继逐路径实际查询通过，没有Low标签。真实调用前仍须核实际Token。stop-http已按独立条件允许daemon正常空闲退出并记录同句柄状态，stop-service仍强制原daemon存活；当前返修的编译和故障正文待执行。

原C04/R10需要历史owner已退出，C08新空闲服务没有owner，分别已提交http-fault-variants14窄检查条件供独立审核；新检查开关尚未实现。原260本人Observe服务及准确两脚本继续保持，本人批准尚未执行。真实Grant、Agent/模型及ToolsOff实际条件、T03/T12剩余故障接续、同一最终安装的双Worker并发/指定停止/B继续及成果均保持未验，整体任务继续。

## 36. 已接受的历史与空闲观察实施

准确5e917bc4已普通push。compile5e917在干净同源下实际0，四份Go验收二进制、CLI及修复后故障工具完成编译，三个既有传输前函数实际通过；SOURCE真实5e917，原260编译原件未改。cli-local-pipe15对新CLI执行两个真实关闭stdout读端用例，实际0：先解析的真实R在stderr保留，无已知身份时不输出关联行，未知runtime/authority/selector省略。两个子进程均为传输前输出失败7，没有HTTP或模型，不能代替同安装serve C09。

原Reviewer msg_eebefb5fffa5准确接受33488A25完整计划，主控采用其六项边界后，同Worker在原测试写域实施。controller-inspection新增互斥idle-only及仅owner-file可用的historical-owner；默认live与纯inventory保持原用途。所有模式限定真实canonical普通DataRoot/orchestration.db，SQLite只读。历史模式逐项核真实envelope、owner与原receipt，匹配历史session时必须绑定/PID一致且isAlive=false，实际消失标记absent，仍活或混合绑定拒绝；这些观察不作为当前调用者或恢复授权。

idle-only要求六张实际工作表全0和真实PTY inventory为空；runs只接受原生ORCHESTRATION_LEGACY_RUN_ID唯一默认记录，核原objective/home/generation/legacy及全部四项空coordinator/session字段，记录实际计数和原记录。普通inventory不会追加空闲要求。Go服务故障工具显式inspection_mode选择，核Node输出owner_state与所选模式一致，原Job、安装、根创建身份、父链、同句柄与保护PID条件保持；stop-service继续要求原daemon存活，stop-http仅强制实际HTTP目标退出并记录daemon实际状态，unknown失败。

http-variants16完整strict/noEmit/skipLibCheck=false实际0，更新故障工具的Go单独编译实际0。C08真实driver已准备三项真实拒绝、有效idle、实际Medium Token、唯一HTTP同句柄故障、7/6对应原因及唯一readiness、两次全Job/旧身份退出和原Orca保全，PowerShell Parser通过。新模式、同安装C08和新serve C09正文尚未执行，下一步统一准确新候选并普通提取安装；没有混写780候选或把新工具计作旧随包能力。C04/R10及真实模型继续等待本人当前Grant，原260服务保持。

## 37. 空闲HTTP故障分类与完整退出观察

准确63eb7091的build14实际0，21份成品及28233路径闭包形成candidate13，四native沿已核原输入复用。主控允许中间候选以普通PowerShell Copy-Item准备仓库外PackageRoot；prepare-package17实际0，28232子路径、25485文件原字节相同，Node及实际子进程均同用户Medium8192，原installer的install17实际6。独立Reviewer核五项native/SDK/空Job及九许可实际0；21份成品仅已修改的controller-inspection变化，其他20份与原准确260相同。最终发行仍要求真实ZIP、普通解压和同一最终安装的完整验收。

http-idle17实际只定向终止所属HTTP，真实idle、三项拒绝、五份SQLite、原Orca保全、四个旧身份两次退出及两次全Job仅余serve均成立；服务实际6，全部退出已知时应为7，分类验收失败。当前serve修复仅在实际Wait完成、ProcessState同PID确认退出、等待结果确定时忽略标准os.ErrClosed重复关闭；其他关闭、等待和Job未知仍为6。此修复尚未运行新二进制，新的C08断言明确要求7和runtime_error，不接受已知退出登记delivery_unknown。

lifecycle17及独立C09-only18均因真实native行缺少creationTimeMs失败，原件、实际执行脚本、流及失败退出保持。17后续两次定向CIM均未见已记录PID，完整Job未取得，原案例保留未验；未把先前创建时间填入缺项行。Reviewer准确接受6E3F057A观察计划，主控采用后新增独立CIM观察器：每次全量查询成功、清单非空、全清单每行PID类型完整、目标身份字段完整；两次间隔至少50ms。保留所有未知原样本、时间和父链，未知PID只要仍在就为未知，不向该PID发送信号。保留原native两次已知身份及完整Job判断；CIM限时15秒，超时只处理实际创建的helper并记录未知，停止后续案例。结果明确所选、未选及所选未完成案例。

cim19以真实Process.Start句柄与匹配CIM创建时间运行四个分支：known存活6，stdin关闭并Wait确认退出后0；另一个实际进程只在unknown请求不带创建时间、真实CIM创建时间正常可用时，存活6、实际退出后0。四次均完成两次完整CIM观察，实际原输入、身份来源和Wait保留；未伪造OS清单或查询故障。不能实际触发的查询故障与超时路径仅有静态审查，未宣称运行通过。

lifecycle19以同一63eb仓库外安装、新数据根和端口64508运行四种真实模式，驱动实际0：立即EOF130、启动中EOF130、readiness后EOF0、stdout实际读端关闭6。所有实际旧身份经native两次及CIM两次确认；最后模式出现一个真实创建时间缺项，原样保留，两个完整CIM均确认该PID缺席。stdout模式精确核唯一非空runtime关联行，两次全Job仅余serve成立，原Orca前后保全通过。该结果对应63eb及当次保存的真实脚本，未计入尚未构建的Go分类修复。测试driver和CIM helper纳入tests/swa-cli-headless，后继准确安装复验继续；Human、真实Grant、Agent、T03/T12及同安装双Worker仍未运行。

## 38. 准确95ef真实ZIP安装及本人入口

准确95efcc288e32ad8d72d4ef902f32ec130f97fea3已普通push。compile20以干净准确源码完成四包Go test-c及三个既有传输前检查，实际0；原SOURCE不改。build15准确候选14实际0，四native原输入及原实际编译证据核验后复用。extract-package20以成熟.NET ZipFile生成410059449字节真实发行ZIP并普通解压，实际0，原Node pin保持、Node及实际子进程为同用户Medium。原installer20实际6，安装复制、28233路径闭包、native/空Job、端口及保护根/四junction真实拒绝通过；保留真实消费者未运行，不登记完整安装验收通过。

同一95efcc28-install20的http-idle20实际0：实际空闲及三项模式/真实同根其他库拒绝、五库完整性/外键、实际Token、唯一所属HTTP同句柄终止、旧身份两次退出、完整Job两次仅余serve和原Orca保全成立。serve实际退出7，唯一readiness无尾包，stderr精确runtime_error；原http-idle17的分类6失败保持。lifecycle20-outer同安装四项实际0，退出130/130/0/6、原native2+CIM2及完整Job条件成立，精确stdout关联诊断通过，selected_modes四项且remainingCases空；本轮没有缺项样本，原19真实缺项原件保持。

provider-job-installed20实际0，限定普通所属进程四模式、parent-loss旧身份退出、无关Job保全及原负向范围；late-child PID604未取得完整创建身份、parent-loss旧Job观察及真实Agent abort保持未验。原Reviewer ec22563245721da8f7a69d4409e667c935e5ea7d已独立按上述实际范围接受95ef代码、ZIP安装20、严格C08、lifecycle20、真实CIM分支及普通Job，不据此接受本人、Grant、模型或双Worker。

按主控msg_870a，在同一95ef最终安装准备仅Observe本人入口。human21验证脚本路径斜线比较失败1，实际服务readiness后正常关闭0/Job两次仅余serve，原件保持；规范化比较后新独占human22保持运行，endpoint64509、runtime cc80c07c-c8bf-47ff-965e-6177bd2a7c69、serve37764创建UTC2026-10-21T18:52:06.3683428Z、host44492、server48980。实际HTTP200、五库及三Token/原Orca前和运行中保全通过；工具会话5187保持stdin。旧260服务和原两个准确脚本未改变。

新human-authorize-installed22/use-installed22-credential仅支持Observe，共用assert-installed22-service核三个实际创建身份/路径、父链、runtime及startedAt、listener、版本和health；DPAPI、用户独占ACL、原caller/固定公开根/仅observe/时效条件保持。三文件准确路径、大小、SHA及用户命令在自有human22-review.md交原Reviewer；Parser及实际只读身份检查0，当前无凭据consumer真实拒绝1，人工正文没有执行。本人批准、当前Grant/模型、原生Agent调用、T03/T12/C04/R10与同一最终安装双Worker并发/指定停止/B继续及完整成果仍未运行，整体任务继续。

当前本人入口及日期补充按§39接续，原22路径已撤销。当前human22批准目录及凭据不存在，后续真实控制验收依赖本人批准。主控授原260条件收尾后，Worker核旧人类目录完全不存在、原serve准确创建身份及原owner33432/工具59063，仅向原Read-Host发送Enter。原句柄Wait/服务退出0、工具0、两次完整Job仅余serve、原Orca收尾保全通过；旧服务完整UTC及准确v2独立CIM见§39。原installed11-service/authorized-close*、service-stderr/service-exit/orca-after保持，旧数据和入口原件保留，新human22仍由5187保持且实际身份检查0。

## 39. Observe日期值转换与准确UTC补验

同一Task的新Dispatch ctx_4c001fda773c沿原终端接续。主控明确暂停原22命令，原E0CF0C3C/B9792BE3代码及首次CIM请求/结果完整保留。旧两个22路径现仅参数声明后立即throw，实际运行均拒绝1；没有HTTP、human、DPAPI或CLI副作用。原FD5FA88C实际身份guard、95ef产品/ZIP/安装、human22数据根及5187原owner保持。

原Reviewer msg_f995d676d2b6准确接受7DF6314A9686702CE01C5A9D4E8A9E35E6729322AA6567808A9800D252215BC0完整补充计划。新human-authorize-installed23/use-installed23-credential只支持Observe，人工签发响应与DPAPI消费两处expires_at均用显式DateTimeOffset值转换；保留JSON产生的DateTime(Utc)、DateTimeOffset及原字符串的真实时刻与精度。原CurrentUser DPAPI、本人独占ACL、caller/公开根/actions/时效及每次mutation/CLI前精确身份条件保持。准确文件、大小、SHA及用户命令在自有human23-review.md；原Reviewer msg_d1e7a303fcc4已完整核准确两文件和原件diff、独立类型/拒绝/guard及v2CIM，接受该准确23入口和旧服务收尾实际范围，由主控安排本人执行。Agent没有运行人工正文。

verify-date23实际0，原UTC为serve30160创建2026-10-21T16:32:44.1021696Z、owner33432创建2026-10-21T16:32:20.6106520Z，成熟转换保留全部ticks，准确Unix毫秒分别1792600364102和1792600340610。v2只读请求/结果在date-fix23/authorized-close-identities-v2*，实际0；两次完整CIM各410项、PID全部有效、目标字段完整、known退出及unknown PID缺席，间隔约469.64ms。当前使用该准确v2结果，首次原件保持，没有重新操作已关闭服务。

verify-types24实际0：原UTC两字段、实际同一次时钟的本机+08:00和UTC四来源，分别通过原字符串、JSON实际DateTime(Utc或Local)、DateTimeOffset三类型值转换，12项UTC ticks与Unix毫秒一致；原输入/类型/Kind/offset原件在date-fix23/types24。没有构造expiry、token或human。verify-entries23实际0：五文件成熟Parser通过，FD5字节不变，实际只读Assert前后0；旧22两入口实际拒绝1/1，新23 consumer缺真实凭据拒绝1，human-approval前后不存在。真实签发响应、DPAPI消费、Grant/模型及同候选双Worker/T03/T12/完整成果保持未验，当前用户是否执行过旧命令仍由主控等待实际答复。

当时本人命令为`pwsh -NoProfile -File C:/Users/DW/orca/workspaces/Astrocyte/swa-cli-headless-20261020/.verification/swa-cli-headless-20261020/human-authorize-installed23.ps1 -Stage Observe`，该人工入口仅由用户执行。后续真实用户批准及委托路径见§40；原22命令已经撤销，不会调用human API。

## 40. 真实会话委托Observe及独立消费接受

用户经主控msg_a536f02a7294明确APPROVE OBSERVE，并允许StepFun key及其他Agent测试、禁止Aliyun key。主控msg_7ac55c65dd32采用真实用户会话的明确委托：Agent沿既有真实session/cookie/CSRF及human API执行已限定的公开项目准备，服务实际返回local-human/human，执行者另行记录为Agent；没有伪造TTY、Read-Host、cookie、token或身份，也没有修改产品权限。原人工23、consumer23和FD5检查SHA保持。客户端cookie只在本次内存准备期间持有，随后Dispose并清空；服务签发session有效期12小时，不声称服务端session已撤销。

原Reviewermsg_700b286bdd14准确接受委托计划4B5279939675B4C8E062A8854F1E803DFF9A89F4957AA6EC47A437A2C92F43B9，msg_724ce658f6f2接受恢复补充328571126C4116B32572EA23DF2E30205451C9086D12FEC2389BEE609901B578。实际客户端delegated-observe24.ps1最终SHA655799C350501C6D0659B2BF343C4FDE0F3F30FF239A4E97F9F0267D31765697，只读node:sqlite观察器observe-state24.mjs为2E2492A8ECE7F9E2364E9B7F58DEF119E0CCCEB711CB236E910599B23ACB0738。每次真实执行源码副本、请求、非秘密HTTP结果、SQLite观察、流和退出分别保存在自有delegated-observe24/25/26；凭据、cookie及digest正文未输出。

delegated-observe24实际1，错误为只读观察器引用不存在的coordinator_tasks，发生在会话和准备写入前。修正为真实tasks后，25实际1发生在首个项目空间POST；原请求1182992b-8b77-4d47-adbe-05e53eb70676未重发，该次HTTP状态未被原客户端取得，保持未知。只读三库核对空间/项目/Grant均0、工作和journal未变化、批准目录为空且CurrentUser独占。随后真实GET诊断实际0：WebRequestSession保留负向Origin头，无显式Origin参数的下一GET仍403，清除其实际Headers后GET200。该诊断没有准备写入、Worker或模型。

26沿独立接受的已知零效果恢复继续，保留旧空目录、失败请求及原件，以新R执行。当前真实服务为95efcc288e32ad8d72d4ef902f32ec130f97fea3最终安装、端口64509、runtime cc80c07c-c8bf-47ff-965e-6177bd2a7c69，原5187所属stdin保持。项目46ceef7b-0be3-4a4b-8e74-575fd327b31c绑定原固定公开Git根；真实设置revision2，allowed_actions仅observe，目录、工具、外发CLI及Agent控制关闭。唯一真实Grant归caller swa-cli-acceptance，仅observe，真实expiry2026-10-21T20:51:16.4468291Z、未撤销且持久digest存在。Actual CurrentUser DPAPI文件存于仓库外human22/human-approval/observe-credential.dpapi，用户独占ACL及原23entropy保持。

delegated-observe26实际退出0，真实status/capabilities及原consumer23各0。缺cookie、缺CSRF、另一loopback Origin、Observe调用有效controller.open、Observe调用humanGrant五项均实际HTTP403/scope_denied。真实三库仅新增预期空间、项目及Grant；local_agent_sessions/orca_execution_links与全部实际工作表、journal计数保持，没有创建Worker或调用模型。原Orca实际前后保全通过。原Reviewermsg_7b85c8d32daa完整核准确源码和快照，独立运行原consumer23退出0及真实只读SQLite，限定接受此授权、持久和消费范围，正式报告随后接续。

实际capabilities列出pi1.0.1、codex0.162.0、claude2.1.238、grok1.0.34、opencode2.0.31已安装；实际launchable均unknown。Codex默认openai/gpt-6.1-sol的原生OAuth存在；Claude显示配置名称不能代替真实供应端点许可，当前默认不得调用。现有native_launch只接受Pi1.0.1 API key及已审工具关闭合同，其他Agent选择存在真实产品缺口。只读成熟解析核Pi默认auth为空、无StepFun目录项或环境名称匹配；主控补核实际OpenCode两个配置来源只有deepseek auth名，无StepFun匹配。这些结果只覆盖所读来源，主控已向用户询问StepFun所在Agent或路径，不请求密钥正文。

当前仅Observe通过。执行Grant、实际原生Agent及模型、T03/T12剩余故障接续、同一最终安装双Worker同时执行/指定停止/B继续和完整成果保持未验。继续真实原生合同分析与必要修复，不重复签发Observe，不将Pi SDK运行计为其他Agent原生调用。

## 41. Pi原生StepFun custom provider准入

主控msg_64e56044a7dd采用同版Pi原生custom provider窄修，原Reviewermsg_d0aa56dfb57a从真实ModelConfig/composer/ModelRegistry和现有消费者独立推导P01—P07后，接受准确计划4E698ACC7EF42E9D667CD2D31187F0BDED00F7A460D4F5CD95B84DF323E07514及msg_48f93338842d源码身份补充。计划在自有native-pi-custom28-plan.md，要求真实StepFun来源、stored literal key/空env、唯一所选model、直接HTTPS/v1和openai-completions，保持私有账户/工具关闭/Job/输入/成果合同；禁止假key、假源和假协议，缺真实来源的正向保持未验。

native-pi-policy现沿实际1.0.1 composeModelProvider(providerId, undefined, ModelConfig, undefined)支持这一原生custom分支，没有自有handler。无builtin时必须存在真实models.json和唯一所选model，modelOverrides不能补足缺失模型；有效原生auth.apiKey必需。目标仅允许api.stepfun.com或api.stepfun.ai的HTTPS默认端口、/v1或/v1/和openai-completions，原userinfo/query/fragment、字段/认证header/OAuth/extension/routing/非空sampling拒绝保持。provider和model ID保留真实配置值；原生API实现、仅所选账户和模型的私有投影、原API DTO及native CLI调用保持。

实际compat.js、openai-completions.lazy.js及openai-completions.js现加入原sources、读取前后和每次效果前重核；实际API registry中的handler及两个stream函数必需。read-native-api28实际0，仅证明同版真实handler存在与源码身份稳定，没有调用stream、认证resolver或模型。Grok真实只读元数据检查grok-source28实际0，唯一账号token的expiry为2026-10-21T18:52:47.570220800Z且无默认模型；最初将其复合账号键按URL解析失败的原件保留，后继用URL.canParse区分非URL键，未调用账号刷新或模型。Codex的生成schema和官方配置目前未建立完整ToolsOff合同；[官方配置](https://learn.chatgpt.com/docs/config-file/config-reference)仅明确shell_tool控制命令。其他Agent没有据此获得NativeLaunch或实际成功声明。

StepFun [官方全球页面](https://platform.stepfun.ai/)实际给出OpenAI chat.completions及api.stepfun.ai/v1；国内首页本次直接读取超时，主控另有实际api.stepfun.com/v1核对。端点、模型和认证最终以用户明确的真实来源为准，不自动更换。

check-custom28.ps1实际退出0，strict TypeScript6.0.3/noEmit/skipLibCheck=false及architecture各0，47个Go package边界通过；原件custom28-checks保存准确8cd402ed及实际程序diff。empty-native-account28实际1，检查发现真实默认models.json没有单独models定义，尚未进入policy；脚本和日志保持。empty-native-account29实际0，直接从真实1.0.1 catalog取得openai/gpt-4，仅作缺凭据负向输入，无模型调用或实际执行选择。当前真实默认auth为{}，实际修改后policy在native_api_key_source_unreviewed立即拒绝，原三文件stat保持，真实项目私有账户前后不存在，没有启动CLI或创建Worker。源码和实际证据分别在原29入口、日志及result.json。StepFun真实正向、故障副本、新准确候选和同安装完整验收继续；未取得真实来源前不登记模型或双Worker通过。

## 42. 准确f2ab发行安装与实际范围

准确程序f2ab4fd9155f4f4bb85c74845f3f3ef5eb607caa已普通push。原Reviewermsg_cfe3b755c511完整核准确程序/两文档、实际1.0.1来源、strict/architecture和真实空auth负向29，限定接受该范围；29在auth入口返回，没有执行新增custom正向。custom/builtin正向回归、StepFun真实认证/模型及故障副本保持未验。

build16.ps1实际0，从准确干净f2ab形成dist/swa-cli-install-20261020-15，21份成品与28233路径闭包通过。四native逐项核原源码/依赖/Node/编译条件和build11真实证据后，从原507候选普通复用，未重编不变native。extract-package29.ps1实际0，以成熟.NET ZipFile生成完整410059866字节swa-cli-f2ab4fd9.zip，普通解压至仓库外f2ab4fd9-package29；原Node24.21.0 pin保持，实际Node及其子进程同用户Medium8192。

install29.ps1内外实际6：仓库外f2ab4fd9-install29复制/版本、native和空Job、28233路径闭包、实际端口占用EXIT5、保护目录及四种junction EXIT3、目标字节/ACL不变和原Orca保全通过；T03/T13真实消费者未运行，未登记完整安装通过。原件位于case29/.verification/swa-cli-headless/t02-65bca04b-93d3-4f21-a217-01f70ee1b07c，原安装和失败记录保持。

check-installed29.ps1实际0，沿原已审run-lifecycle20.ps1及run-http-idle16.ps1，在同一f2ab安装和新独占数据根执行。lifecycle29四模式全部OBSERVED，实际退出130/130/0/6；原native两次/独立完整CIM两次、完整Job及唯一精确非空runtime C09诊断通过，remainingCases为空。readiness-eof保留37240与32444、stdout模式保留48696与33604，共四条真实native创建时间缺项，没有补写身份；每模式两次完整CIM各416行、PID字段完整、实际目标缺席，确认原known退出和unknown缺席。原件为lifecycle29-outer/cases，保存真实执行脚本。

http-idle29实际0：真实空闲、三项拒绝、五库完整性/外键、实际Medium Token、唯一所属HTTP同句柄终止、实际旧身份两次退出和完整Job两次仅余serve通过。服务实际7、唯一readiness无尾包，stderr精确runtime_error；没有创建human session或调用模型。两项各自原Orca前后保全通过，另外原FD5检查在本轮前/中/后确认95ef Observe服务及5187所属入口仍保持；没有关闭或替换原服务。新检查服务已正常结束，无本轮待处理服务或原生Worker。

原Reviewermsg_c88f4297a8b9已独立核准确f2ab的build16/ZIP29/安装限定范围、lifecycle29和C08及实际闭包/native/许可，限定接受实际结果。用户已允许Observe、StepFun及其他Agent测试；所核Pi默认auth为空、Pi/Codex/OpenCode来源未提供StepFun，主控补核Process/User/Machine对应环境名均无配置，实际Grok token已过期。主控已询问用户实际配置所在Agent或路径，尚未取得可用于原生custom正向的真实来源；不请求或输出密钥正文，不使用Aliyun，不伪造认证或协议，不修改默认账号。

执行Grant/当前所选Agent及model_target、真实custom/builtin正向和故障副本、模型、T03/T07/T09/T11/T12/T13剩余场景、同一最终安装双Worker实际执行重叠/指定停止A/B继续/完整成果仍未验。主控已采用现有OpenCode/DeepSeek原生路径接续，见§43；不以StepFun来源缺失结束整体任务。

## 43. 原生OpenCode账户、完整方案及实施接续

主控msg_a846a3adc56f、msg_09c1b31e9b13采用实际安装OpenCode2.0.31的原生ACP和官方policy hook。原CLI对应anomalyco/opencode@22728d67461260d56bb9796b9b8f36e1de47202e，npm wrapper直接运行bin/opencode.exe；原Node script entry准入不能覆盖该实际exe。实际配置默认deepseek/deepseek-v4-pro，原生credential SQLite唯一deepseek选定值为key类型且与legacy auth相同；opencode-account30和opencode-credential-db32只读实际0，原source不变，没有启动原账户CLI、迁移或模型。

原Reviewer独立接受准确35F8B8BD计划后，deepseek-models31.mjs准确B3F40C72仅执行一次GET https://api.deepseek.com/models，实际HTTP200、deepseek-v4-pro存在，redirect:error、无重试/推理/原生会话，原auth/config stat及bytes保持。原Reviewermsg_aaeaaec7ed04限定接受此读取结果，不据此证明原生模型或完整账户链路，也不重复GET。真实原生SQLite最终凭据选择和每Worker私有迁移仍须实际验证。

完整方案在自有native-opencode33-plan.md，准确SHA256 F18C0ED603668BE5A3FA1E49C8C9F2DF476D08C4824E17BBEC6C8BAD4AA63BD9，已交原Reviewer独立审查。方案覆盖D01—D08：严格OpenCode NativeLaunch联合和Go/TS生产消费者、每Worker单独HOME/XDG/ProgramData/TEMP/DB及actual migration、插件/指令发现和全部工具关闭、标题/warming/compaction、原exe及原生ACP私有serve/Job、每次输入原R/Grant/fence、实际ACP trace与完整12MiB SQLite成果。policy使用官方Promise hook；其拒绝经Effect.promise与PluginHooks逐项yield在native handler前中止，setup失败则原native记录failed后继续，故完整方案包含同进程actual active/failed状态生产和消费，不能只凭文件或setup日志声明保护生效。

实际Effect4.0.1的FetchHttpClient默认follow，http hook的Web Request经fromWeb只保留method/url/headers/body，原native平台仅提供timeout:false。主控msg_1c88d869c2b3及原Reviewermsg_a65333f7a3b9已核定保持原CLI行为，校验范围为初始URL和固定逻辑provider/model/source，不新增禁止redirect能力或验收条件，也不将其作为原生验证阻塞。没有全局fetch patch、新provider/代理、SDK替代或正文改写。

执行顺序按主控msg_6466215347f5：计划独立接受、主控核定新增接口并写SPEC后，先针对性构建policy/native entry并验证真实私有ACP、凭据实际选择、工具关闭及hook保护、首次真实正文和所属收尾，再完成直接消费者、准确最终ZIP和同一安装双Worker全部验收。该准确方案形成时未运行新增原生路径；实际后继见§44—45。原95ef服务/5187继续保留，Observe26已通过，后继不擅自续签或扩大为执行Grant。

## 44. 原生OpenCode定向实现与私有账户验证

原Reviewermsg_47ae44cc7e18独立接受准确F18C完整计划，主控msg_0f1237445d1a已写main SPEC21.1.5/6并授权连续实施。首批3bbfc138已普通push：native-cli-entry实际exe分支、原SwaProviderProcessTree严格node-script/executable联合、native-opencode-policy、每Worker私有账户和官方policy插件。此批为原生前置实现，完整Go/DTO/选择/ACP和成果消费者仍待接续，不登记产品完成。

build-opencode34实际0，七个针对性source成品形成；原probe34实际1，在jsonc-parser的CJS相对impl加载前失败，没有CLI/模型。沿正式构建已有ESM解析入口修正后build35实际0，probe35实际1，自加全局字段拒绝挡住原配置中的small_model/plugin/mcp，没有CLI/模型。产品只投影真实选定model/key并严格关闭原global插件/MCP/辅助请求；原global内容不复制或执行。私有根重叠检查按真实原账号config/data、Orca与安装根双向判断，不将整个HOME当账号目录；key比较只抛出固定安全错误，避免断言输出秘密。strict35实际2仅native args的可选entry类型，按kind分支修正后strict39实际0。

36—38均实际启动原opencode.exe、ACP和私有serve，原父Job/Native CLI身份及所属成立；这些原件分别保存在opencode36/37/38及各自build/metafile/source.diff。36的plugin.list回应未按原Location.response消费而拒绝；修正为location/data并核真实location后继续。38的原plugin.updated/list inventory active、实际tool.list为空已进入真实检查，connection.active缺席后resolve失败。policy只输出非秘密阶段、错误类型和字段路径，不输出原错误body、headers或key。全部没有prompt或模型，未登记NativeLaunch通过。

36—38 finally各自取得root/tree exited；原Job两次完整清单为空，已观察原native/private serve身份两次缺席，所有本轮所属进程已退出。原FD5身份guard多次实际0，本机Orca公开编排CLI仍可用；原95ef/5187继续保留。Observe26的原Grant已按实际expiry到期，不推导其可执行或擅自续签。

inspect-opencode38实际0，只读实际private SQLite得到credential表0条。准确22728d67 core/database/migration.ts的全新库分支直接schema.up并登记全部migration完成，不执行legacy import.up；私有legacy auth文件存在不能证明原生凭据已建立。补充native-opencode39-import-plan.md准确F803EF3DB6697F921C0692D29FCB2E6D012F9694585CA837ADD108AFDC37D78E采用同版正式auth import --standalone，经内存stdin原真实选定Entry进入原native credential.create；禁止直接SQL写credential/migration或构造记录。主控msg_0d900c5b088a及msg_efc10aa8ef55已采用并写入SPEC，原Reviewer独立审核后立即同Worker接续。原private空库、失败样本和原源保留，不重发未知效果。

该阶段尚无首次模型、执行Grant、完整产品消费者或同一最终安装双Worker通过；后继实际结果见§45，不以此定向阶段或文档提交结束整体任务。

## 45. 正式原生导入、工具权限与首次真实正文

原Reviewermsg_008aa6e7bf58独立接受准确F803导入补充，主控已写SPEC并授连续实施。native-opencode-import复用原managed provider process和实际SwaProviderProcessTree，将原真实选定deepseek Entry的id/integrationID/label/key类型和值从内存经stdin交正式auth import --standalone；argv、环境和日志无密钥，不直接写credential/migration/session SQL。导入与ACP分别具有完整所属Job，调用方在等待前持有真实resource，未知先查原私有结果、不自动重发。

39原生实际exit0且唯一原credential已持久，计数消费者因Windows CRLF未命中而实际1，原件和持久结果保持。现已处理原计数行的结尾CR，并等待真实stdio close及完整Job收尾后再核计数/exit；没有重发39。40/41分别因新增原生agent/model切换消息及路径分隔符断言实际1，采用native全部记录和成熟realpath比较，原件保留。42沿41的准确成品/source.diff复用实际0；正式导入、真实唯一private credential、独立新ACP/private serve、同server七插件active、实际tool.list0、实际build及最终DeepSeek选择和两个完整Job退出成立。原初次session/new回应选用原native默认免费模型，随后真实setMode/setConfigOption使实际DB固定deepseek/deepseek-v4-pro；输入前必须核最终实际值，不用初始回应代替。

原Reviewermsg_ee7604d98544独立运行review-opencode42.mjs退出0，真实只读核唯一原ID/active1/typekey与private auth等值、原session及两条原native切换记录、12目录私有DACL、七插件/工具及两个完整Job、两次全部已观察身份退出和FD5，限定接受无推理范围。准确source.diff为D4074E8C790B049124CDE45DC200C85D1661F5879523F506387EA6BC473663FC；没有重复native/GET/model。

43实际0，policy通过官方agent.list的location/data回应核实际仅build且最终wildcard deny，原tool.list为空。44实际0，采用原catalog真实存在的deepseek-flash后发送同一固定公开文本，原native session guard记录rejected/native_session_selection_changed，HTTP请求0；45实际0，在新的真实private key导入后移除该案例配置中的policy，实际ACP没有active，原private verifier明确configuration_changed，零prompt/HTTP。每个案例的导入/ACP及全部后代已按真实创建身份与两次完整Job确认退出。

46首次真实模型实际0，原a.txt完整固定公开文本经原OpenCode2.0.31 ACP发送。policy在每次hook/HTTP前复核原exe/manifest/config/auth/数据库及WAL存在状态和实际版本、私有配置/auth/plugin字节，官方active connection.resolve只在内存核真实key。原database_source.version使用标准JSON表示真实DB和WAL版本，无秘密或额外账本；SHM锁状态不作为凭据内容来源。最终实际Agent/session/模型、context工具和HTTP body工具为空，初始POST为https://api.deepseek.com/chat/completions、model=deepseek-v4-pro、HTTP200，唯一实际模型请求。原生底层follow按已核定范围保持，未声明禁止网络跳转。

实际原session为ses_e9faef009ffeNz0OBEXx0psmUh，ACP end_turn、478条真实更新，SQLite idle_outcome=succeeded，保留5条完整原生消息及30622个UTF-8字节的assistant数据；导出前检查实际秘密值未出现。导入Job与ACP Job分别两次完整清单为空，全部已观察native/private serve身份两次缺席，原source保持，FD5检查0。原件为opencode46/result.json、import-result.json、cleanup.json、opencode46.log/exit及46-build准确SOURCE/source.diff；只读observation记录真实会话状态，没有新增模型调用。47最新strict TypeScript和architecture各实际0，47个Go package边界通过。

该结果覆盖原生私有账户、真实协议/模型及所属收尾；未创建产品Worker Dispatch，没有代替SWA执行Grant、产品选择/输入/完整成果、最终ZIP或同安装双Worker。当前由同一Worker继续全部直接消费者与同一最终安装的实际并发、停止A、B保全/继续、完整成果和失败恢复，不重跑已验模型只为管理记录。

## 46. 产品消费者、完整SQLite结果与执行Grant准备

产品选择和Go/TypeScript/JSON Schema现为严格Pi/OpenCode联合，生成的API类型沿真实命令更新。每个OpenCode Worker在实际project/session路径持有独立私有账户、官方初始化及ACP两个真实Job；初始化在等待前交原ProviderAcquisitionStarts持有，停止与未知退出保持原资源。ACP使用实际exe身份、同server插件状态、真实NativeLaunch来源和每次输入的原R/Dispatch/session/fence及当前Grant；恢复失败不建立替代会话，输入只接受原固定文本，实际build和最终DeepSeek模型在输入前确认。

原生事件按真实ACP方法、通知和实际身份记录，使用实际主机单调时间；没有生成Pi生命周期事件。记录保留实际Orca session/fence、managed root/native exe/native server创建身份和原始ACP正文更新。完整成果使用真实只读SQLite事务读取session_v2和全部session_message，保留原生元数据、实际消息ID、严格递增但可有间隔的seq、原生时间、完整JSON及用量来源；UTF-8、账户/模型/工具、12MiB上限和读取期间DB/WAL变化均失败即终止。原SHM仅锁状态，不作内容版本。双Worker、原生来源、SQLite备份故障和runtime恢复消费者已按各自原生格式接续，实际运行保持待验。

48 strict/架构实际0，首次广包Go因错误包路径与缺实际输出目录失败。修正配置后的49 strict/47包架构实际0，四包Go整体实际1：app的Relay Git创建/controlled CLI交付检查失败，httpapi的Workbench缺明确真实publication/SQL输入；未作同条件基线比较，不将其归类为旧失败。51最新strict、Go格式、MJS语法和三项实际CLI传输前拒绝检查均0；四项同安装真实TestOrca尚未运行，不能把跳过计为通过。

51的Node24.16合并契约命令在Redocly报告有效后以libuv断言退出3221226505，原失败保留。实际Node24.21 lint0；完整示例检查发现原验证器没有向Ajv注册SWA外部Schema。主控msg_38239dd33f71授scripts/validate-examples.mjs窄写域，现使用原Ajv2020/JSON解析注册实际Schema并给匿名示例正确基URI，全部约束与样例保留。52沿安装同pin Node24.21运行完整check:contracts实际0：Redocly20项警告、264样例和生成一致性通过。

执行批准使用新的独立受托客户端，不扩大原95ef仅Observe范围。原Reviewer按G01—G09退回首个27FA计划后，准确返修为7DFE168251FD546960CAEA6AED4E6552B135E2AF565844101E377EA9A52AA125：五项observe/start/send/stop/read_context、原controller.recover实际映射start、现有client.cjs registered_agent及真实项目登记后的selection消费者、实际authority/完整来源绑定、CurrentUser DPAPI与未知写入先查不重发。计划及准确客户端/最终实际描述须独立接受，最终候选身份稳定后才签发；当前没有新执行Grant或产品模型。95ef/5187及本机Orca保留，2026-10-22 UTC03:35恢复后FD5实际通过；继续全部最终安装和同候选双Worker验收。

## 47. 准确e9fa安装、Pi真实启动与ACP完整退出返修

e9fa97e33e1235577cfef7342942398eb804f1f5已普通push，build17实际0，25项实际bundle及28243路径闭包、原固定Node和四native沿准确507输入复用通过。普通411419795字节ZIP和提取53实际0；仓库外安装53复制/闭包/装载/端口和保护根及四junction拒绝通过，汇总仍为实际6，T03/T13及完整功能未验。没有把安装复制或原生单会话等同于完整接受。

真实Pi55已完成RPC和所属Job收尾，manifest路径断言因实际dist/bundle布局退出1，原件保留；改用同生产findPackageJSON后，Pi56真实0，原安装Pi1.0.1的get_state、node-script IPC、实际Node/entry/PID出生关联、完整Job两次为空及全部已观察身份两次缺席成立，没有prompt或模型、未复制原账号。原Reviewermsg_75d7101ae0dd独立读取并运行review-pi56.mjs实际0，限定接受e9fa安装的真实无推理IPC范围；未验证Pi模型正向，不再为管理重复此调用。

原Reviewer准确e9fa CR指出ACP的managed close默认只接受root退出，以及options.onExit早于完整Job收尾。当前返修沿原JsonlRpcAgentConnection模式：acceptClose须root和完整Job退出，真实processless按未创建进程证据处理；root退出先排空原通知、保留原connection/tree，完整Job确认后统一一次发布options及订阅的已证明退出；未知保留且原close可以重试。exited/rootVerdict反映完整所属证据，初始化资源采用同一真实processless准则。restricted ACP权限请求直接返回原cancelled，其他客户端工具请求直接拒绝，不进入通用人工请求卡片；普通ACP语义保持。58严格TypeScript、真实入口和客户端Parser/Node语法检查实际0；后续权限入口补充纳入下一严格检查。新增真实原生ACP根退出及私有serve收尾检查入口，实际执行保持待验；真实工具为空时未触发的incoming权限分支只登记静态保障，不编造请求。

7DFE的无owner RPC读取方案经实施核查不可执行：controller-admission实际对所有swa.*读取要求私有owner。主控及原Reviewer采用384D188F来源补充、64DD11A6同生产bundle路径：前置helper只调用准确安装readAgentSettings/readAgentCliVersion/native inspector，实际authority只读原mutation_caller_identities现存值；真实project登记后补全原生来源，Grant/token前必须齐全。Token后只消费真实公开status/capabilities字段，首Worker完整selection通过原Go/native准入及真实parent/child R观察，不新增公开字段、算法或owner读取。原DPAPI不覆盖，当前客户端和真实最终描述仍待独立集中审核，没有执行新Grant或产品模型。

完整成果在最终合并的native session、journal原rows/snapshot及summary上再次执行同一实际key检查，发现后整体失败，原私有记录保持。受限OpenCode连接的RPC错误只保留实际错误类型、code、有效numeric HTTP status和已确认session，原message/data/body/headers/cause不进入通用ACP错误消费者；AuthRequired、Agent拒绝与传输错误分类保持。所有受限诊断使用固定文本，通知的原trace检查在任何journal订阅分发之前完成，检查失败关闭同一Job并阻止该条外送。59严格TypeScript、实际入口/客户端Parser及Node语法检查均实际0。该范围为静态保障；当前没有实际触发上游秘密错误或incoming权限请求，不登记相关动态通过。

## 48. 准确3bcf安装、真实根退出与最终执行来源

3bcf0c71ba86e607cd63aef3b423d7cc6f5788eb普通push，build18实际0，29份bundle/metafile与28251路径闭包通过；普通412666020字节ZIP和解包60均0，同用户Medium及原Node pin成立。仓库外install60复制、闭包/native、空Job及端口/保护根/四junction拒绝通过，汇总实际6保留T03/T13。root62沿同一安装执行真实官方import、ACP/build/pro及七active插件/tools0，再只终止核实出生身份的所属managed root；完整私有serve Job退出后统一一次通知、双次独立身份查询缺席与重复close成功，probe及外层均0。没有prompt或模型，unknown-to-known没有实际发生，保留NOT_RUN；普通ACP+owned Job范围不代restricted错误/权限动态验收。

65按干净3bcf编译四个真实Go消费者二进制实际0，四项实际检查尚未执行。服务61的普通管道stdin EOF触发正常关闭0，三个所属PID两次新鲜查询缺席；原件保留。服务67以同一安装、新独立DataRoot及TTY保留stdin，真实runtime9ea24e54-4f25-44d1-ae2c-72462e92e130，serve55300/host53008/http46428；实际普通权限、五SQLite、健康及原Orca/FD5保持通过。63/68使用同生产settings/version/native inspector取得两次完整一致的只读来源，实际仅有inspect-only原生bootstrap Run，其他业务状态0，尚无真实project/authority/selection。准确客户端、真实服务描述和bundle/metafile已交原Reviewer集中审核，没有签发新Grant或运行产品模型。

主控提供准确3bcf Linux CI实际ERR_PNPM_IGNORED_BUILDS日志，后继检查均未运行。原Reviewermsg_479dc758e59d接受准确45FE97A2的pnpm-ci64窄计划；现只给六个已核准确版本的安装脚本明确false，原严格未知拒绝、esbuild规则、依赖和四native明确构建保持。真实完整Git归档的Windows frozen install、依赖一致性和锁不变检查待执行，Linux只按原CI真实结果记录，不以本机替代；最终3bcf成品和全部真实产品验收继续。

## 49. 普通依赖安装和迁移直接消费者

准确d82958a0dd48ab87ea6e77a6d69d6305bf3d11b9只包含六版本脚本规则及相关文档，3bcf实际产品/Go/native输入保持。64完整Git归档及解包后写SOURCE遇Windows同名source目录而失败，尚未安装；69沿其未安装原件执行普通frozen install实际1，两个workspace native的MSBuild FileTracker因长tlog路径失败，原错误和已产生文件保留。72仅将新独占源码目录缩短至自有c72，使用同一实际117429167字节Git ZIP及私有store完整性检查，普通pnpm11.27 install --frozen-lockfile真实0，check-dependencies真实0，锁前后SHA256 F7A1BC8DAE51770233894041E0F3A415A3C68AEA57BF06A235159D5E3498D3EA相同；未传ignore-scripts或关闭严格未知脚本规则。原件ci64-real-install、ci69-real-install、ci72-real-install和各outer log保持。

主控msg_690c37304381/msg_872a5f8fee0a确认准确d829 Linux普通frozen install实际成功；其check内S1 probe400、Relay403、缺实际CLI/资料等在同条件main50c2aaff/job119638841884也实际失败，本次新增失败仅TestTasteProfileActualMigrationUpgrade。主控授internal/adapters/sqlite/taste_profile_test.go窄域，现仅将既有升级测试的当前迁移前提从27/027补至28/028，保留旧25项升级来源、两Taste表、一致备份、所有实际migration IDs、幂等及未创建human profile断言。73真实既有用例实际0，实际SQLite在本树.verification/taste-profile-actual-303335430，日志/源码差异/退出原件在migration73；没有改动S1/Relay接口或其他历史验收。

cmd/server相对main的组成入口存在main.go及orca_runtime.go差异；S1测试、原local_projects路由、workspace/app/local_agents及agents来源相同。候选实际SWA功能仍以3bcf安装及其来源记录验收，后继脚本政策/测试前提变化不重编未变native或重复46/62。67保持实际服务、68准确客户端仍在独立审核，实际执行Grant和同候选双Worker尚未运行，整体任务继续。

## 50. 已审执行准备的实际前置失败与恢复

原Reviewer4aa077c48b6ed8d86fd6549d96d8efb92f3a1a8a接受准确68四客户端/67实际身份，主控msg_710651027543采用后执行75。真实准备在New-OrcaPreservation的自有Created通知比较处退出1，尚未执行会话、space/project/settings/Grant/token业务请求；此前服务health读取已执行。原75日志及probe保留，已创建的delegated-execute和空version-home保持，没有凭据、业务R或模型。原异常同时覆盖无事件和字符串路径失配，75没有保存event，不能据其文本认定通知权限缺失。

77实际Created约5ms，78按相同forward目录输入实际观察到Created，其FullPath混合分隔符与Join-Path输出raw不等，GetFullPath后相同。保护模块只使用成熟GetFullPath统一自检目录和比较路径，分开无event及规范路径失配错误；不改原3秒、订阅和保护范围。79使用原模块及forward输入的实际通知、原Orca/95ef/67保全和恢复客户端Parser均0。80独立只读源完整等于68前置：实际三库仅inspect-only bootstrap、其他业务和receipt/session/Worker为0，authority/source_snapshot null；同67出生身份、原私有空目录DACL/无reparse/无DPAPI均已记录。

恢复客户端新增显式PreflightResumeEvidence，仅接受原75单probe原件、同一受保护空目录及首次源读取的原bootstrap/业务全0/null authority前提，随后沿原session/CSRF及五动作流程。原文件、目录和CreateNew凭据保持，未知业务写入仍停止。准确窄修、79新SHA及80实际前置已交原Reviewer集中复核，恢复准备尚未执行，任务继续。

同域三个既有故障消费者将准确测试源码版本与安装候选版本分别记录，继续用Git核所有产品源码不变；排除已确认文档、六版本安装脚本规则和明确未进入实际metafile的测试文件，pnpm工作区其他字段经成熟YAML比较保持。原固定公开Git、fence/真实R/完整Job及所有故障断言保留；新增来源检查的实际结果待准确提交后运行，未将静态修改记为恢复通过。

## 51. 实际执行准备、controller启动返修与原服务收尾

82沿已审恢复客户端在同67完成真实space/project/settings及observe/start/send/stop/read_context五动作Grant/token，CurrentUser DPAPI和真实status/capabilities消费均0；六项实际403、三库增量和原Orca保全通过。实际project=6d8cf620-f26c-4ee3-8554-1c9609075736，authority=e63abe4b00a394a833acc1e804e1a084775f62958a93a16015219c915fcf650c；旧凭据仅绑定3bcf/67，不用于修改后的来源。原Reviewer独立核真实SQLite、凭据摘要及实际原生来源后限定接受82，未将其计为产品模型通过。

83真实controller.open R=3bed9c88-9c99-4cdd-83cf-a523e5383374返回HTTP409/CLI6/operation_unknown。实际daemon创建PowerShell50820，原启动日志hasCommand=false，未产生helper Node；原receipt保持pending/pty-spawn，无Task、Worker或模型。原请求、PTY及数据保持，未重发或修改SQL。

当前native-methods修订经原createTerminal的command/env传入准确Node helper及SWA_CONTROLLER_HELPER=1，使用原PowerShell native引用和短EncodedCommand启动交付；远程scope或不能在shell参数交付时立即失败。原launchConfig继续作为实际launch token及metadata来源，原identify、PID出生/祖先、pane/incarnation及strict caller均保留。准确79A74计划由b159dba6接受，controller84-checks严格检查实际0；此处不登记真实握手通过，准确新成品、普通安装和完整产品验收继续。

主控msg_89c74681881f授权同67正常所属EOF。85a使用只读OpenJobObject/QueryInformationJobObject记录原命名Job完整六成员和出生身份，再从原TTY17950关闭所属管道；service-exit实际6，原空闲关闭因pending与非空PTY未确认。serve55300/host53008/http46428已退出，两次完整Job观察仍为daemon46744、OpenConsole55220及PowerShell50820。85a观察结束关闭只读句柄后，86按主控msg_b4b4eb459d68重新打开原命名Job实际ERROR_FILE_NOT_FOUND，未执行TerminateJobObject、未创建同名替代Job；已报告主控实际限制并提出沿原daemon身份与PTY核查的原生清理。原件service67-close85a、service67-close86及installed67-service保留；原83实际只读回执仍pending、Task/Worker为0。95ef/5187及本机Orca保持。

主控msg_a531采用准确私有daemon/nonce/service_job、唯一session/terminalHandle/incarnation、完整出生及源路径和两次一致库存作为本次清理依据；Windows inventory/getCwd实际null保持。87e对原session调用一次原kill取得确认，随后库存为空、shutdownIfIdle retiring=true；持有的daemon46744/OpenConsole55220/PowerShell50820句柄实际退出0/0/1，六个已观察身份两次新鲜CIM缺席，原Orca/FD5前后保持，实际清理0。Reviewer2197独立接受该有限退出证明，主控确认满足后继承接；旧67正常EOF6、原Job不可查询和83pending分别保留。87及87a出生前置、87b ESM加载、87c/d null cwd前置失败均保留且未执行kill。

## 52. 准确893安装、执行准备及真实helper调用链

准确893fb8852e15109ca9a99f1bd51d83ea249a37b8已普通push，build19实际0，29项bundle/28251路径闭包和未变四native/Node原输入复用通过。普通412666860字节ZIP及解压88实际0；仓库外893fb885-install88复制、native/闭包及既有端口、保护根和四junction拒绝通过，汇总实际6保留T03/T13。独立服务89的实际runtime=6aec5c49-4077-4376-8e4d-8dc5b83acc77，serve6224/host33976/http55368，Medium、五SQLite、健康和原Orca/FD5保持通过。原TTY32198保持stdin，另以TTY21806持有同实际Job只读句柄供后续完整退出观察。

90使用同生产函数的两次真实来源完全一致，业务全0/authority null/model0/final delegation home未建；原四客户端SHA及三bundle/metafile已独立核。Reviewer msg_3974接受准确89/90后，91首次全新委托准备实际0：project=5f596c58-e7ce-429c-b505-124821055cee、authority=6b276bc4777128a42992eb317e79a594403d1d1760f7b891b82d1ea6b0264b31、五动作及CurrentUser DPAPI只绑定新893/89，真实Observe消费0、六项403与原保全通过；Reviewer独立核凭据摘要和实际库后限定接受91。没有复用82旧凭据。

92实际controller.open R=febc0b31-069e-4b08-8972-2afb86597935及同R并发/重放均0，真实PowerShell53564/helper Node56260、出生/祖先、pane/incarnation及launch commitment成立，identify与observe成功。task R=c1504651-6a55-4fc8-8fb5-0bc48116cf19生成原Run run_66c11beca641和唯一root task_0613700f941d，两child receipt全部completed；实际spec/context变化拒绝2正确。驱动随后在217用coordinator_runs统计实际Run导致0与1断言失败，原92外层1保留，尚未执行关闭，无Worker或模型。独立只读SQLite确认runs中唯一legacy=0的实际Run、唯一root及全部原receipt completed。

四个相关MJS消费者现按实际runs读取原Run，保留coordinator_runs独立旧状态计数，补实际记录存在及原controller/pane/generation和唯一root约束；controller-inspection原有严格唯一legacy bootstrap校验保持。来源检查将未进入任何实际metafile的native-idempotency消费者列入已有测试排除域，所有实际产品输入继续逐项相同。五份MJS语法及差异检查0，实际后继复验待运行。93在准确干净893重新编译四真实Go消费者0，实际四项同安装检查仍待运行。原凭据消费者新增精确ControllerClose模式供92所属收尾，保留全部原来源/DPAPI/Grant检查、真实原open completed与当前绑定核对、新close R一次及退出确认；该窄入口已写入并通过Parser，当前尚未执行。

原94在输入响应继承DACL前置退出1，未创建close R；原件保持。94a将原真实响应逐字节复制到新CurrentUser保护输入，记录相同摘要，原92字节和ACL保持。单次新close R29d672ec-e3cf-4e71-a53a-5d35356c1c41实际0/completed，旧两进程两次缺席及来源前后保持，Reviewer独立接受有限退出范围。准确f35beaaedf4598ddce413c59da6792341e9eb0aa测试修订已push并独立接受，source95实际产品/29metafile检查0；95完整无模型幂等实际0，24条真实CLI、七completed回执、原Run/root/固定context及真实变化拒绝、两controller关闭退出全部通过，Reviewer独立0后限定接受。

## 53. 真实96并发输入失败与原队列返修

Flow96同一893安装执行两个不同worker.start，CLI5实际6，父R9c6159d2-c507-42e7-88fa-c53b0092543f及6bb88711-c5ea-4743-8d48-c92fb041ff84均pending/helper-input；原件保持，未重发或SQL补完成。实际库worker/dispatch/resource为0，未见对应native child；完整所属Job观察没有OpenCode进程，未观察到模型启动。原controller term_d420f723d67bd4a40e7ac17b83cabcab/root50264/helper49128仍被记录。

原DaemonClient真实snapshot在flow96-pty.json，helper实际JSON尾随错误位置12431。由真实已存invocation按原序列化计算两帧12431/12480字符、12719/12822字节，均小于16KiB；首帧字符长与错误位置相同。原RuntimeTerminalWriter分开写text/chunks、等待submit delay及Enter，sendTerminal未包原per-PTY/generation提交队列；该缺口允许交错，与真实错误相符，具体每字节调度轨迹未知。flow96-diagnostic.json明确区分存储输入长度与实际trace。

Reviewer独立C96-01至07接受44DDD0计划及41734C/752D具体补充，主控授连续实施与89精确所属处置。当前sendTerminal仅在driving+requireWriteSettlement路径复用原serializeAgentPromptSubmission覆盖完整writeAction，在队首及每chunk/suffix原beforeWrite前后核signal/handle/PTY/generation；其他输入路径保持。helperCall以局部AbortController接原120秒deadline，Promise.all同时持有写入及回复，finally释放订阅/timer并取消未写项；部分效果及旧R继续unknown。helper finally释放readline/stdin，原PowerShell命令在Node返回后exit原LASTEXITCODE，避免-NoExit交互提示接受旧排队字节。原launch/真实身份/Grant/原协议保持。

既有controller-fault工具的显式helper-only模式沿原实际owner/Job/父链/持有句柄检查，只终止helper并以只读root句柄等待原Shell自然退出；默认控制端及服务故障行为保持。Flow后续输入文件名使用该次真实send R，完整正文和原请求/业务断言保持，支持开发及最终安装各自原件。101严格TypeScript和47包架构检查实际0，Go故障工具构建、Go格式、Flow语法及差异检查0；真实取消/部分写/NoExit故障尚未命中，不作动态通过。

按主控最新顺序，后继先准确未压缩候选、原脚本component普通安装及独立来源授权，实际同controller并发show和真实跨16KiB公开context task.create/show，核完整SQLite/context/原R；再同开发候选运行真实双Worker/模型重叠、停止及完整后续输入诊断。通过并独立核后正式ZIP/正常提取/最终安装，仍重跑最终同安装T13。未变Node/native和真实Go输入可复用，不原地改893已装程序。89目前完整七成员、出生、路径和私有Job DACL在service89-before-close100，原只读Job句柄21806保持；原96/91及95ef/5187和本机Orca保持。
