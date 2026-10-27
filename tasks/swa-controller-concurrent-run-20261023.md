# 同 Controller 并发提交与进行中 Run 观察

基线 `74aa5aa84bb64cccade786973a8d0c7b402b67fc`。collaboration_model 负责原 helper/Run 观察直接消费者，acceptance_audit 独立审查，Root 固定写域与源码；n46_execution 保全原件和旧资源。获准产品与数据库规则已实现并完成局部检查；真实并发 RPC/TTY 和后继多 Worker 尚未验证，没有启动完整构建或新模型调用。

## 两条实际失败链

正式 N4 原 Run `run_e111d292c918` / 根 Task `task_c4d7d4fefde0` 的前三 Worker 已 ready。slot4 请求 `8e770d0d-4864-4bab-ada0-47c3bfbd07bc` 是同 Run 的 consult 孙任务。其父请求最终仍为 pending/helper-input；最初 cli8 读到 native 子请求 pending/已接受 Dispatch，后继原库在 12:23:33 才记录子请求 completed/failed。不得重放旧请求或把父 pending 改写成成功。

原库时间与正式源码对应：三个追加 Worker 父请求均在 12:21:07 创建；slot3 native 在 12:21:13 开始、12:21:58 完成，slot2 紧接 12:21:58 开始、12:22:46 完成，slot4 紧接 12:22:46 才接受。`controller-helper.ts` 的 readline 循环逐行 `await execute`，实际启动被同 helper 串行等待；`native-methods.ts:helperCall` 却在每个并发发送前各自开始120秒计时。slot4 报错正是该外层计时器的 `The controller action may have reached its exact PTY`，监听结束后原 native RPC 仍继续。slot4 trace 12:23:10 已 policy_ready，后续仍为实际控制读取；12:23:32 驱动撤 Grant 后，12:23:33 当前批准接口403，才出现 native failure/hostFault。该尾部失败不能作为最初外层超时的原因。

另一条独立链发生得更早：默认 run wait 于12:21:11从 active 变为 unknown 并退出6，blocker为上述三个仍执行的 pending 请求。`run-view.ts` 当前将全部 pending 一律映射 unknown，CLI依现合同退出；原 native executor 内已有真实 inFlight Map，观察端没有使用。原态安全投影保存在 `.verification/n4-start-74aa-20261023/snapshot.json`，原完整事实以 packet/owner目录为准。

## 建议的最小直接修改

1. helper保留成熟readline、原schema、原RuntimeClient、每R固定子ID与原账本，逐个解析完整输入后启动原异步执行，使独立请求可同时等待原 RPC。单条执行仍保内部 task.create 的 runCreate→taskCreate依赖。输出保原完整NDJSON回执和相同R，不新建协议或调度器。EOF停止接收新行后等待已接收的实际执行全部结算，再走原readline/stdin收尾；解析失败、stdio写失败或单条任务错误也必须等待已接受请求结算，原RPC错误仍按每R返回，fatal路径保持失败且不留下未处理Promise或提前宣自然退出。既有120秒预算不因排队放大，同R去重仍由原native executor负责。
2. 原 `OrchestrationMutationExecutor` 增加只读准确identity查询，直接检查现有Map的callerFingerprint/R/method/payloadHash；不给调用方写入Map的入口。Run观察读取原SQLite pending行后，只有匹配当前真实执行的行才是进行中；当前无执行、重启遗留、原effect未知继续 unknown，禁止据pending自动重发。原 Run完成条件仍要求全部请求、Task/Dispatch、问题及资源结算。
3. 生产Run观察通过现 `getOrchestrationMutationExecutor(runtime)` 单例取得只读查询。内部handoff和Run结算当前另建executor，必要时改为同一原单例，使实际在途来源一致，不新建状态表/注册表。正常starting尚未创建resource时，只能在原native pending workerStart接受回执绑定该Dispatch、同当前executor确在执行时保留进行中blocker；原child receipt只有accepted Task/Dispatch，通过本Run原父回执child_request、同caller、原child method/hash精确关联，并复用原getPendingWorkerStartRecovery；没有该强绑定、start_unknown/stop_unknown、生命周期未知和其余资源缺失仍 unknown。需要读取完整receipt时，先用原SQL COUNT/SUM字节前界拒超界，再读取原件，不加截断。
4. CLI现有unknown退出语义不改；后端准确区分进行中与无法确认后，CLI/GUI继续读取同Run。若实际消费发现需要公共字段变更，交Root与原CLI负责人处理，不擅自扩Go路径。

Root授权产品写域：`runtime/swa-orca/src/controller-helper.ts`、`runtime/swa-orca/src/run-view.ts`、`runtime/swa-orca/src/native-methods.ts`、`runtime/swa-orca/src/run-settlement.ts`、`third_party/orca-v1.4.230/src/main/runtime/rpc/orchestration-mutation-executor.ts`，以及原测试 `tests/swa-cli-headless/run-view.test.mjs` 和本任务。06已独立限定接受计划及其 `aadbd6ef` 继任稿，Root据此放行实施。真实本地RPC验证由release_audit统一原runner的必要适配，不重复复制安装；任务与ignored诊断记录归本责任人。

## 局部验证与停止条件

- 先保留原 N4 时间线与两个原失败消费者的只读复现，原库不变。不得假造旧时刻inFlight或声称离线快照能证明当时的内存状态。
- scoped strict、受影响真实SQLite规则保留：遗留pending、错误identity、start/stop未知、缺资源、全递归库存与完成门继续拒绝。进行中正路径由实际原executor调用覆盖，不能用任意返回true的替身表示原生执行。
- 复用已有隔离development本地RPC流程，明确与正式安装分开：原Go权限/Controller/task.create、并发只读Controller观察与相同新R重复查询，检查真正原RPC/SQLite唯一根任务和原回执；原helper的真实TTY/pipe并发输入保完整framer、短长消息、每R回复及EOF drain。真实task.create/observe仍在途时identify先回复，才能证明helper未等待前一RPC；收到identify且前一RPC仍在途时送成熟EOF，随后核原请求completed/唯一SQLite效果。TTY必须在一条原RPC在途时继续经原writer发送长输入，核乱序reply与readline回显交错后仍按原R完整解析，不能仅一次写完后再等待。不同正文复用同R仍由原账本拒绝，不添加测试专用RPC或假provider。不修改正式安装/旧服务/原请求。具体本地runner由Root安排原05/本责任人单一写域，准入前冻结真实接口与输入。
- 后继全新实际多Worker验证仍需证明native启动重叠、正常pending时默认wait持续、真实输出、原生stop/release/完整树关闭与同R结果。局部无模型调用不能代替这项。Root在源码/局部接受后安排；本计划不启动下一次full或模型。
- 如果并发TTY回显破坏原NDJSON、EOF未完整排空、相同R出现额外副作用、准确inFlight无法取得，保失败停止定位，不增超时、不弱化unknown或身份门。

## 已实现与局部结果

helper分别启动已完整解析的原请求，原RPC错误仍返回该R的原错误；回执写入完成后才移除进行中Promise。EOF或解析/stdio错误会停止接收，并等待已接受请求及其回执写入全部结算。现有readline、原schema、RuntimeClient、每条执行依赖和120秒边界均保留。真实TTY在途回显与回复交错仍待原runner验证。

原executor只读 `isExecuting` 核当前Map中的caller/R/method/hash，不创建新的执行记录；Run观察、内部handoff与结算统一使用原runtime单例。Run仍保留每个在途请求blocker，只有当前真实执行的原行才不因pending单独升级unknown。缺resource的starting例外还要求同caller父child_request、原native workerStart接受回执Task/Dispatch、同Run根树、父子两项实际执行和当前runtime epoch全部成立；仅父执行、子项已退出但原行pending、重启/错identity和其余未知状态继续unknown。完整请求读取先核字节与数量上界。

使用正式S74aa安装的Node执行 `node --test tests/swa-cli-headless/run-view.test.mjs`，11项通过、退出0；原件 `.verification/n4-start-74aa-20261023/rules-r1.log` 与 `.exit`。新增规则直接调用原OrcaRuntimeService、原executor和真实SQLite，仅执行存储领域操作，不创建原生会话、进程、RPC服务或模型。原executor真实同时同R调用只执行一次，结束后保留pending的行仍unknown，重试原R及改变正文分别保持原operation_unknown/request_mismatch。父子执行状态、错误identity/epoch、子执行已退出、原递归库存/问题/资源/完成门均由实际规则覆盖。

同Node、`NODE_OPTIONS=--max-old-space-size=8192` 执行原TypeScript `tsc -p runtime/swa-orca/tsconfig.json --pretty false`，退出0、日志为空；原件 `.verification/n4-start-74aa-20261023/strict-r1.log` 与 `.exit`。源码差分检查通过。06已独立限定接受准确五产品、现测试及11项规则/strict的实际局部范围。这些结果不代表真实并发RPC、TTY EOF排空或正式N4/N6通过，旧正式N4的FAIL/pending/清理UNKNOWN不变；真实无模型RPC runner由05继续。
