# CLI 与 GUI 的共享执行合同

本合同以[准确基线](00-context.md)及现有 `OrcaCommand`、`OrcaEnvelope`、原生记录为输入。后续源码以各卡准确提交为准；表中的接口位置不表示动态验收通过。

OpenCode 增加严格 `opencode-native-stepfun-api-key`，显式来源为 `SWA_OPENCODE_API_KEY_HOME`，固定 CLI2.0.31、`stepfun/step-3.5-flash`、`openai-completions` 和官方 `https://api.stepfun.com/v1/chat/completions`。旧 DeepSeek 目标保持。Windows私有Job和Linux原custody分别提供实际进程归属；真实模型与正式安装验收另记，不把字段支持当执行成功。

全新 Worker 先执行唯一官方导入并确认正常完整退出，再写 legacy 投影，避免启动迁移增加凭据。追加输入复用原 R/binding、实际 ACP numeric ID 与串行队列，HMAC prompt桥接关联真实 InboxDelivered user/messageID；原接受事件在 turn.end 前进入队列，实际发布和原 submission 的轮次关联确认后才结算接受。写前拒绝、已送达和未知分别结算，未知不重发。成果将完整输入库存、原生 assistant/idle、实际 ACP回复和 journal 对应轮次连起来，Task及父邮件的 final.text 来自同一已验最终 assistant；新输入未知不能使用旧成果完成。问题能力仍仅 Pi；OpenCode 的工具关闭与问题不可用贯穿发现、启动和成果。详细合同见 SPEC §21.1.6。

## 单一服务与授权

公共入口为 `POST /api/v1/local-projects/{id}/orca/commands`，定义于 [OpenAPI](../../../contracts/openapi.yaml)，动作和返回外形定义于 [JSON Schema](../../../contracts/swa-cli.schema.json)。HTTP 适配器调用 Workspace App `ExecuteOrca`；CLI、GUI 不直接读写原生 SQLite。执行权威仍为产品私有 Orca Run/Task/Dispatch，Workspace 仅保存项目/Grant 与原生关联，不增加 Mission/Claim 或第二任务状态。

CLI 使用明确回环 `SWA_ENDPOINT`、`SWA_PROJECT_ID` 和当前 `SWA_PROJECT_TOKEN`。浏览器复用现有人类 session/CSRF；服务将 path project 与真实调用者绑定，再核当前项目动作、目录、模型和控制权限。启动服务不创建授权。注册、安装、配置、可启动和 start/send/read/stop/resume/tools 控制能力分别使用真实 observation，`available` 不表示当前提供商已经实测。

人类向CLI Agent创建的任务追加`worker.send`时，独立核验当前人类会话/CSRF、同项目当前settings、send动作、输入目录/固定上下文、所选原生CLI/模型与外发批准。人类不冒领原Agent Grant，也不以创建者Grant仍有效作为其自身权限来源；原link中的创建者、Run/root Task和原request继续保留实际来源。该例外只适用于`worker.send`，不开放跨创建者`worker.start`。人类自己创建的controller/task/start沿原当前项目权限；Agent请求继续严格核创建者Grant/主体及原有效期。观察与人类自有安全停止分别沿原动作核权。

新增权限规则不改变原Dispatch/session、精确AgentSelection、模型、当前settings revision、固定输入/上下文版本、controller consumer generation、runtime fence或原请求幂等。投递前再次核权；人类当前权限撤销/过期、跨项目、来源变化或原生身份变化均不得产生新输入。用户已确认此跨入口追加输入范围；后端实际实现及正反向测试按02/04/06的准确源码和结果登记，不从文案或按钮显示推导已经可执行。

| 动作组 | App 权限 | 范围与副作用 |
| --- | --- | --- |
| status、capabilities、controller.show、task.show/list/result、worker.show/list/read、request.show | observe | 读当前项目关联；task.result 还核导出目录 |
| controller.open/recover、task.create、worker.start | start | 固定项目、目录、上下文与原生身份 |
| worker.send、task.complete | send | 原 Dispatch 的追加输入或根任务完成 |
| controller.close、worker.stop/release | stop | 指定原生所属；人类自有安全停止沿现规则 |

## 能力发现与首次启动

`capabilities`的项目目录只取[App](../../../internal/workspace/app/orca_execution.go)已授权项目的`p.Root`，经内部`Capabilities(ctx, projectID, projectRoot, requirements)`、bridge/client及私有RPC传给[discovery](../../../runtime/swa-orca/src/agent-discovery.ts)。HTTP正文不能提供`project_root`。Go在调用前后核canonical root及当前项目权限、settings revision与适用Agent Grant；Node在异步发现前后核实际目录身份和Agent settings快照，变化拒绝结果。发现只把root传给静态配置检查，不为全部Agent生成启动选择，也不缓存可复用的准入。

| 观察 | 本轮来源与含义 | 首次启动请求的约束 |
| --- | --- | --- |
| registered、enabled、installed、configured | 实际注册、设置、CLI版本与配置来源；configured只返回有证据的model/provider及非秘密账号来源类型 | 四项均须available，模型必须由服务真实返回；配置来源存在不证明密钥有效、网络或模型访问成功 |
| control.start/send/stop | 真实adapter的方法声明 | start声明须available；声明不证明操作已经执行 |
| launchable、control.read/resume/tools | 未建立真实会话或核实该项时保持unknown | GUI与N驱动不得把unknown改成available，或把未握手当作已失败；首次请求所需launchable/read/tools若明确unavailable仍拒绝 |

[GUI消费者](../../../web/src/pages/swarm/swaObservation.ts)仅派生“可提交请求”，不改原observation：四项静态事实、start声明与真实model齐备，并匹配当前项目CLI、权限版本及start许可后，才可向原`worker.start`提交。loading/stale/error、原请求pending/unknown及缺字段继续阻止提交，按钮与onSubmit共用判定；界面提示“服务将在启动时检查账号、工具限制和权限”。任务创建者约束仍由后端核验，不能从可提交推导跨创建者start已获准。验收驱动须遵守相同阶段语义，其平台来源消费者另按准确源码验收。

实际启动继续从原controller/worktree解析目录并稳定选型，核当前Grant、账号来源、ToolsOff、输入与fence；Codex只有真实ready校验后才产生`policy_ready`，每turn继续重新核验。该事件的`remote_control_status:'disabled'`只说明远程控制状态，工具关闭还须绑定原`selection.native_launch.tools`及固定native contract的实际验证。静态发现不能替代这些门，也不自动建立Worker验证能力。本轮后端局部FS/SQLite早拒、类型/架构检查及GUI规则、真实错误/权限浏览器路径已验；合法API-key配置、首次真实启动、模型、N及改后安装仍未验，旧`11717767`安装证据不移用于这些新消费者。

## 身份与来源

| 对象/真实字段 | 来源与绑定 | 客户端约束 |
| --- | --- | --- |
| project / project_id | Workspace 注册项目与当前批准 | body/path/caller 必须一致；不能切换项目复用 token |
| controller | 原生 PTY helper selector 与不可伪造调用者身份 | 不是展示角色或用户输入的进程号 |
| runtime_id、authority_domain | 实际运行时与本地 mutation authority | 重启/代次变化后重新核对；不凭旧 PID 接管 |
| run_id、root task / task_id | controller 的持久 task.create 回执和原生 Run/root Task | child Task 的 parent_id 必须指向同 root |
| dispatch_id | 原生 Worker Dispatch | start 回执和后续查询指向同 Task/Run，停止仅作用于该 Dispatch |
| session_id、operation_id、runtime_fence、consumer_generation | structured 原生会话及输入绑定 | 只能由实际宿主记录证明；不是浏览器生成的 Worker 身份 |
| request_id | 调用者提供的规范 UUID，绑定原动作、body 和回执 | 变更操作及 request.show 必需；Idempotency-Key 与 body 一致；效果未知查询原键 |
| settings_revision / context | 当前项目配置与固定版本上下文 | 输入前重新准入；变化或撤销依原服务拒绝 |

展示名称和职责来自已有注册/配置。持久角色、执行引擎、原生会话与一次 Dispatch 是不同对象；未有角色后端时不增加可执行身份。CLI 与 GUI 都保留服务返回的真实字段，`result` 是原生对象，按动作校验后展示，不能把所有返回改造成未经服务支持的统一终态。

## 状态、回执与恢复

| 层次 | 已有来源或词语 | 解释 |
| --- | --- | --- |
| HTTP / envelope | HTTP status、ok、error | 传输及当前动作结果；HTTP 200 不证明任务完成 |
| 变更回执 | 原 mutation_receipts 的 pending/completed 与子请求 | pending/unknown 保留占用；不能换 request 重发输入 |
| start / send | 原生 ready；journaled/queued/accepted/handed-to-terminal | 启动或投递阶段，不推导模型完成 |
| task / worker | 原生 task status、worker state、原生消息与 operation | 按实际字段展示运行、等待、失败、停止；不存在的审批状态保持未知 |
| 退出 / 释放 | 对应平台的Job或Linux所属证明、PTY、原生资源release_state与新鲜进程观察 | 服务级退出和每Worker完整退出分别核验；root退出不足以确认整树退出，无法确认保持未知 |
| 成果 | 原生 journal 与所选 Agent 自产 transcript/SQLite 输出 | complete/incomplete/unavailable/unknown 分开，坏源或来源变化失败 |

`worker.read --source transcript` 是有界预览，具有原来源 cursor 和 limit（1..1000）。`worker.list` 当前请求原生 page（limit=100），客户端必须尊重 `hasMore`。`task.result` 需要完整 inventory；发现更多页必须明确失败，不把一页当全集。完整成果保持既有总量 12MiB、来源身份、读取一致性及秘密检查，不能截断后标成功。

现有 API 没有承诺与 OpenMausBot 等价的 job 长轮询或统一 SSE。GUI 刷新读取同一 Run/Task/Dispatch 的真实快照；预览续读只能用该来源 cursor。展示时使用原生事件/entry ID 和原有顺序/代次，重复可去重；跨来源无序、缺口或过期游标应重新读快照并保留缺失提示。授权失效后停止受保护读取与变更，不自动换账号或再授权；人类安全停止继续由后端原有规则裁定。

## 平台进程身份与关闭

服务内部`SWA_SERVICE_JOB`与daemon身份沿真实平台联合传递。Windows保持`Local\SWAService<UUID>`、`serve_created_at_ms/daemon_created_at_ms`及原Job核验，原wire不增加Linux字段。Linux使用`platform:'linux'`、`SWAService<UUID>`、`serve_start_ticks/daemon_start_ticks`、`boot_id/owner_uid`和原`serve_pid/daemon_pid/daemon_session/data_root/install_root/source_revision`；ticks和UID为十进制字符串。它们来自实际内核proc身份，不换算为Windows创建时间。Linux分支的Node和Go还核同安装程序、VERSION、原daemon记录及实际祖先归属，旧活daemon不自动接管；Windows保留原私有Job与daemon身份核验后的恢复语义。

`serve`的`resource_samples`在Linux为一次实际`{platform:'linux',logical_cpus,available_bytes,sampled_at}`观察，未提供CPU百分比；Windows保留原实际阻塞CPU采样数组。该区别不改变Worker自己的资源准入，也不把瞬时内存或CPU数量称为容量承诺。Linux `e14800c1`同安装的服务/daemon正常启动、health和stdin关闭后的服务树退出已验；强杀serve的完整回收仍未知，不能推广为每Worker退出通过。

每Worker Linux完整回收D已经实现，并在准确`6890522e43d7b81e99b09ca94acc27b9d3a5c7dd`的Linux组合安装上完成14项普通进程检查：11项使用装内原件，3项为同SHA身份/私有路径诊断，0skip。证据为`.verification/cloud-setup/linux-provider-tree-installed-6890522e-01.log`；该结果不包括原生Agent、账号、模型或N=3。最小进程身份为`{platform:'linux',pid,boot_id,start_ticks,owner_uid}`，live身份另核实际程序`name`；`readObservation()`按平台联合返回，Linux不补`creationTimeMs/rootCreationTimeMs`。每Worker独占Node引导器在Agent加载前以真实`PR_SET/PR_GET_CHILD_SUBREAPER`确认，内部IPC绑定随机`custody_id`、原owner/root/native CLI身份及本次`stop_id`；native API版本为`providerLinuxIsolationVersion:1`。

D需要运行内核实际支持subreaper、`pidfd_open/pidfd_send_signal`及`waitid(P_PIDFD)`。glibc/GLIBCXX/CXXABI符号基线或发行版标签不能证明这些内核能力；缺失时拒绝或保持unknown，不降级为裸PID发信号。

D要求原生直接child先由libuv完成close/回收，再仅精确回收已确认收养的直接child。需要两次独立内核`ECHILD`、递增单调时刻、原身份匹配的完整退出proof、父核对后ACK，以及原引导器实际退出，才能判定该Worker完整退出。`WNOHANG=0`、根退出、IPC中断、进程组消失或普通进程表为空均不足。native未创建与引导器从未创建分别记录；已有引导器时仍需完整证明，不能冒充processless。身份、内核查询或父IPC失效保持unknown与占用，不先杀引导器再声称释放。

这些是现有provider内部生命周期接口，不新增HTTP/CLI命令或公共Task字段。普通系统进程的内核测试、实际安装服务、Agent NativeLaunch/ToolsOff、原生模型与成果及N=3场景分别验收；各Agent的Linux来源和成果政策尚未接入时，模型输入前保持不支持。

## 原生Agent后继准入

Pi新增strict分支`pi-native-api-key-per-session`，以`private_root`表示canonical `SWA_DATA_DIR/pi-workers/<实际projectId>`空项目容器；其余provider、source_home、auth_source、required且可null的models_source、三键model_target保持原Pi来源/目标规则。旧`pi-native-api-key/private_home`严格解析及项目HOME原义保留，两分支均配`tools:{mode:'disabled',native_contract:'pi-cli-1.0.1'}`；不能靠工具合同名字区分布局，新旧目录字段也不能混收。新主动start/send须用新kind及完整已审policy、当前source/Grant和原输入批准；Schema通过不替代实际准入，不表示账号、受管输入或模型已验。

实际每Worker HOME只能由新private_root和真实Orca sessionId派生。选型早于session UUID生成，不能回填原selection/hash；真实流程先mint/register Worker identity，再accountHome exclusive投影，随后持久record。已有record必须同原R/Dispatch/session/HOME，EEXIST不作为本次fresh，也不覆盖重导入。Pi原生UUID/sessionFile另沿真实get_state和provider handle核验；不能混用两种session ID。每Worker隔离不能代替同Worker settings锁内有界读取、cwd/.pi/settings.json首次spawn和每效果前absence、完整raw及原R/journal/成果接线。B内部接口按下文冻结合同约束，受管Host/Grant、真实输入及模型另行验收。

迁移要求新start/send拒绝旧kind；历史记录与原private_home不改写，旧记录查询及原资源安全stop/release沿其原record、lease/owner和完整Job/Linux D证明，不因新选型失败而失去停止路径。旧完整成果若来源不足明确不可用，未知请求保原R、HOME和资源，不换键重投。该兼容规则不授予新的账号、模型、human或Grant权限。

Pi B的跨模块类型、完整签名和错误前置以[SPEC §21.1.5](../../SPEC.md#2115-原生账号关闭工具及实际请求政策)为准；均是冻结实施目标，不是安装或执行结论。`requireNativePiSourceHome({sourceHome,protectedRoots,env}):Promise<string>`仅metadata，必须先于discovery读取auth/settings；无授权projectRoot则unknown且不读。full inspect与首次dynamic import/probe前复核固定官方原件/执行闭包，版本probe用已pin装内Node+entry。private HOME和record真实存在后，`inspectPrivatePiModelMetadata(...)`才从实际models投影调用纯composer，返回PiApprovedModelMetadata；observedAvailableModels另取真实完整RPC回执及sourceSequence，二者不互相补造，不将默认配置当远端可用性或价格证明。factory/launch/session共用同policy；connection紧贴实际managed spawn、无await调用`assertSpawn(launch:ProviderProcessLaunch):void`，核最终sealed argv/env、当前Grant与来源。真实owner提交后ready才写首custody并发startup RPC，preowner DTO不缓存补证；01/03共享端口以最终实际类型为准。

共享queue的write保留原前三参数并增加同步onSettled(ProviderWriteSettlement)，settlement恰有outcome/writeAttempted/cleanupCompleted。真实queue entry的异步批准、无settings锁阶段调用`prepareInput(clientMessageId:string,frame:JsonlRpcRecord):Promise<()=>void>`，从原binding.body经成熟preparePiRpcPrompt核实际frame，并返回原binding/frame同步重核闭包供最后finalAdmission；不新增pending、不表示accepted。最终同步批准/输入重核→本次settings锁/有界读，再核prepared/binding/序列化frame并持久write_intent→真实write→finally清债→callback/drain→同步observer→resolve/成功flush；写后失败不报neverReachedAgent，observer失败须使queue terminal。peer request的id/beforeWrite/onReply复用唯一pending，actualcid取原Submission，raw检查和onReply先于删除/结算；30秒prompt ACK只是preflight，accepted只来自唯一完整user echo，timeout不复活、不换R。

ProviderTimelinePublishedReport保真实journalEpoch、published及每step的written/itemId|null或settlementId，原resolver/wrote/bound.publish分别产生事实；onPublished经transition/plan/assembler/lane传递，不能由入队或callback发生推已落盘。PiObservedProjection只带真实cause sequence、现有eventType、实际generation和该report，完整raw/文件/journal仍需回读核对，coalesced文本不宣称每delta独立fsync；不新建JournalStepWriter或请求账本。

关闭必须同一latched链：真实EOF+D final→await beforeExitPublication仅排空native projections并确认sink.written→policy.closed持久custody_closed→await原onExit/exitDelivery的生命周期tail写入→verifiedExit/listeners/close成功和releaseAfterExit。所有acquire/retained/rootVerdict/lastCloseResult旁路也受此链约束；超时、写入或tail失败保unknown与资源。取消可以有完整关闭来源而模型partial，物理退出不补协议完整，void onLifecycle不等于全部宿主异步lease已结算。

factory input `approveStop():()=>void`首次沿唯一pending的原parent/child stop R捕获cleanup闭包；idle cancel和直接requested close幂等进入beginStop，后续stopping仅允许abort/get_state。原row/hash/fence/owner/consumer及资源须同步末核，不重新借用新输入Grant；source/account与永久failure门保留。

同步inputBinding从原checkpoint取真实parent/child R/body/session/fence，与原Submission/cid核同；实际submit前native前缀基线之后才关联user echo/native entry。latest R、完整原件、journal和root Worker库存须在全部async verify后同步末核再无await导出。local错误只记录固定safe stage/code，未知raw/error拒绝，不清洗后伪称完整；原stop receipt与内部stop_id、Orca/native UUID、owner runtime/service epoch分别核来源。Linux新kind主动准入须保完整policy/source/current Grant，`assertOwnedJob()`的Linux分支必须同步调用`policy.assertCurrent()`；Windows原Job/members检查保留。strict JSONL constructor独立路径提前return，绕过旧`observeProviderRecord`，后者仍拒Linux且仅作旧Windows中性投影；OpenCode保护全保留。

真实无账号CLI的两项metadata、EOF/完整D及原两回复完整严格DTO离线消费已验；不升级为受管peer、Host/Grant、真实输入/停止/完整成果、ToolsOff实际交互、模型、N3、Windows或新同S安装通过。统一coherent检查/候选仍须完成。原403/33/264通过仅限A的形状/serde/示例。

`6890522e`安装实现的NativeLaunch分支仅为Pi与OpenCode，独立Codex rollout读取器已有。本轮Codex与Claude单分支合同已冻结，Schema及直接消费者同步实施；字段形状不表示实际账号、SDK启动、ToolsOff或模型通过，原始事件与完整成果接线均须另验。Claude沿SPEC固定CLI2.1.284/SDK0.3.284、anthropic/claude-opus-5、三键model_target及单auth_source，不新增HTTP认证合同。Codex来源仅接受显式非秘密路径`SWA_CODEX_API_KEY_HOME`，不回退普通CODEX_HOME、Orca账号选择或原ChatGPT登录。空配置允许服务启动并报告Codex未配置；路径非法早拒，合法目录缺少实际API-key来源仍为未配置，不把目录存在当认证通过。

该source与普通CODEX_HOME、SWA_DISCOVERY_CODEX_HOME、缺省`~/.codex`、安装/data/每Worker私有根、已知受保护账号根以及项目/公开输入目录均不得同路径或存在祖先/后代重叠。Go只做现有路径元数据核验与显式传递，不读取旧auth或解析Orca账号；Node继续核选中managed-home、真实来源和当前版本。拒绝链接或重解析路径，source实际根须owner-only，不要求`/workspace`等普通祖先均为0700。

Codex拟通过官方stdin登录将获准API key导入各Worker独立私有HOME，固定真实0.163.0、openai/gpt-5.5与官方完整目录；NativeLaunch只携带非秘密来源引用。Claude拟使用CLI2.1.284、SDK0.3.284、bare/API-key与空工具组合，仅从显式`SWA_CLAUDE_API_KEY_HOME/settings.json`的literal `env.ANTHROPIC_API_KEY`取得来源，采用同样的owner-only和双向路径隔离。空配置报告未配置，不回退`~/.claude`或Orca账号，不读.credentials/OAuth/AUTH_TOKEN、不执行helper，也不将其它来源env/settings带入child；OAuth/keychain不适用于该路线。两者仍须实际当前授权、封闭启动和每轮参数、原Run/Dispatch/session/fence及request绑定、真实delta和完整原件来源、对应平台完整退出；缺key期间可验证拒绝路径，账号/模型正向保持NOT_RUN。准确固定来源见[矩阵](02-agent-matrix.md)，不新增HTTP认证动作或自动签发Grant。

Codex的strict NativeLaunch沿`schema:'swa.native-launch.v1'`新增`account.kind:'codex-native-api-key'`，固定provider为openai、model_target为gpt-5.5/openai-responses/`https://api.openai.com/v1`，tools为disabled与`native_contract:'codex-cli-0.163.0'`。其余账号字段仅source_home、auth_source、catalog_source和private_root；文件源复用`{path,version}`，不含key、邮箱或虚构credential ID。auth_source固定source_home/auth.json，catalog_source固定实际安装根的runtime/codex-policy/models.json并核原件完整hash，私有根固定实际`SWA_DATA_DIR/codex/<projectId>`且每session有独立HOME。现selection的executable/version/model/provider/configuration_version继续绑定实际来源。登录子进程和app-server分别受管，登录结算未知时不重导入、不先启动app-server。

Codex新thread与每次turn保持空环境及受控纯文本；活跃turn追加沿原turn/steer和实际expectedTurnId，绑定本次send自己的原R/operation/clientUserMessageId，不复用start的operation。实际thread reply缺model/provider/history/path时不能以参数补造。原native通知按session/fence顺序写入provider-events，完整rollout/journal/trace共同计入12MiB且有界读取；来源或秘密检查失败整体拒绝完整成果。`source.process`及结果`source.owner_process`指bootstrap：Windows保留`{pid,creation_time_ms,runtime_id}`，Linux使用`{platform:'linux',pid,boot_id,start_ticks,owner_uid,runtime_id}`，native CLI另列真实custody身份。其关联核实际Tree观察、lease PID/runtime/session/fence及SourceVersion，不用Linux估算毫秒补proof。最终proof从原Tree的只读readFinalObservation取得；unknown/processless为null，真正完整退出事实持久化失败保持unknown。真实未创建bootstrap的processless继续走原独立受证分支。新增getter与Codex来源消费者属于本轮开发合同，`6890522e`的D14不证明这些新增接线已验。现HTTP native结果为opaque，合同由02 producer和06实际消费者共同核验，不新增公共认证接口或无人消费Schema。

## Worker 额度

任务文件沿用 `goal/source_repo/source_revision/success_criteria/max_workers/context`。`max_workers` 是本任务获准创建 Worker 的总额度，取安全正整数 1..9007199254740991；数值上界是跨 Go/JavaScript 的整数精度边界，不是已验证资源容量。模型、项目权限、机器能力与当前运行资源仍独立准入。

公共Schema描述现有任务文件，生成类型不将文件读取变为inline HTTP接口。`context`可省略或为null；引用与文件仍由原项目上下文读取器逐项核权。既有文本校验存在层次差异：Go拒绝全空白goal但仅检查成功判据数组非空，原TypeScript还要求每条判据字符串非空。当前合同补充不改变这些业务文本规则，不能把单个Schema通过等同于所有后端准入通过。

默认验收 N=3 时使用 `max_workers >= N` 的任务，三个独立 Dispatch/session 必须有真实模型执行区间重叠。N 不写成产品固定上限，也不把 `max_workers=2` 用例的第三席拒绝改为成功。pending/unknown start 继续占用额度，并发预留沿原持久事务核查。资源边界用例明确设置`max_workers=N`，占满后第N+1席应被拒绝；若`max_workers>N`，则第N+1席仍按真实剩余额度及其他准入规则处理。当前没有排队替代拒绝的公共合同，不能偷偷减少 N。

当前额度计数包含该root已创建的全部child Task及尚未落Task的pending预留；child完成或其资源释放不会自动归还创建名额。这是固定任务可创建/预留的Worker总席位上限，不能解释成无限顺序补位的并发池。改变回收语义须另行修订准入及测试。

`max_workers` 为上限，允许少于上限的任务；根任务完成仍要求预定 success_criteria 和所有相关 Worker/资源明确结算。被指定停止项保留 stopped/cancelled 及已有部分；其他 Worker 的完整成果和资源退出独立核查。分页或完整成果容量不足时报告明确限制。

## 命令兼容与退出

| 用户操作 | SWA 现有命令 | OpenMausBot 仅作参考 |
| --- | --- | --- |
| 发现和选择 | capabilities；worker start 的 agent/model 经稳定选择 | bots/models/engine；不导入其账号服务 |
| 提交与查询 | controller open；task create/show/list；worker start/show/list | run 的使用路径；不增加第二调度器 |
| 观察与追加 | worker read/send；request show | messages/send/events；不声称已有相同事件协议 |
| 选择性停止 | worker stop/release；controller close 另核全域空闲 | interrupt；不能默认 stop 所有任务 |
| 完整导出 | task result --output-dir；task complete | export；不采用预览截断为完整成果 |
| 等待 | 当前查询组合，新增 wait 必须先固定原生终态/分页语义 | wait 只参考，当前不新增未经支持的命令 |

SWA 退出码保留：0 当前动作成功；2 参数/请求不匹配；3 权限/批准/身份拒绝；4 不可用/不支持；5 资源拒绝；6 效果或退出未知；7 其他失败；130 当前 CLI 等待取消。OpenMausBot 的6用于 team diff，不能照用。CLI 等待的 Ctrl-C 不停止 Worker。`serve` 的 Ctrl-C/EOF 管理其所属进程，分别按 readiness、已知失败及完整退出证据保留0/130/7/6，不等同于普通查询取消。

业务 `--json` stdout 仅一个 envelope，进度/诊断写 stderr；帮助和版本是文本元数据。GUI 关闭页面只解除观察，不能关闭其附着的 CLI 服务。组合包可配置安装根内静态 Web 目录，沿同 HTTP 后台提供资产，缺资产明确失败，不自动创建第二运行时。

## 工作目录与未验范围

当前 `controller.open` 使用获准目录登记 folder，Worker 使用 `worktree: 'current'`。已见 session/账号私有根和完整所属资源机制；没有每 Worker 自动 Git worktree 隔离的现成产品证明。开发云 checkout 不构成产品写入隔离验收，工具关闭范围不扩展为代码写入能力。

产品目标并列Windows x64与Linux，Agent来源和逐引擎实际能力见[适配矩阵](02-agent-matrix.md)。45个TUI模板和7个结构化引擎是不同层次，先复用7个原生adapter并逐项评估其余来源；“大部分”的验收分母已询问、尚未决定，不能将模板探测或某个局部比例称为已完成。上游明确的平台限制单列，不用另一个终端程序冒充同一原生引擎。

本轮真实模型测试预算不设费用上限。模型账号与当前许可仍须实际存在；固定公开输入、ToolsOff、禁止Aliyun/百炼、超时、原始request/未知效果及机器资源/并发准入继续有效。Windows目标已明确为x64，当前仅Linux可访问；Windows主机、安装物及真实链路未取得证据时保持NOT_RUN。

正式动态检查由02/03/04/05/06按[负责人表](ownership.md)接续。合同与生成类型通过不代表 Windows安装、真实 Agent 调用、并发模型、GUI跨入口或最终 N=3 已通过。

执行失败后先记录最小复现、根因证据和局部验证结果，再开始下一次完整构建；原失败与未知原因保留。普通局部检查及不相关工作继续，不因等待完整构建而冻结。
