# SWA N=4 与 N=6 真实验收

## 目标、来源与执行状态

对应[本轮用户要求](swa-evolution-20261023.md)，在同一批可追溯安装上分别执行 N=4、N=6，验证真实并发、独立身份、追加输入、主动停止、完整成果和所属资源释放。Run、能力、交接、角色的最终字段由各负责人冻结后接入；本计划不替业务模块新增合同。

2026-10-23 只读调查基线为 `integration/swa-task-cards`、`11619d72f08c163f159a4f4befe270806b1b67ea`。首批验收源码与纯离线检查已接受，Root提交 `5d939d0d`；后继正在接入同Run/Role/真实父继续。没有启动本轮服务、授权CLI、模型或完整构建，没有读取 auth 或密钥正文。已审生成物清理结果另列下文。旧 Linux 安装 aefe 与 Windows CLI 1d3006 的已验范围保留；新功能必须使用最终源码的新安装，不能手补旧安装。

用户本轮“测试 N 大于三”已授权同一公开资料范围、StepFun、ToolsOff 的实际测试，预算无上限；新包的来源、活体服务、当前 Grant 和技术核查仍必需，不能以旧包或过期身份代替。准备新包不形成另一次逐 SHA 用户批准流程。不能扩大到工具执行、私有项目、其他供应商或原个人账号。

## 旧服务已结束

原件根为 `/workspace/swa-pi-owned-aefe6c4b-20261023-02/evidence/`：

- `owner-result.json` 为 `STOPPED`，原因 `owner_input_eof`；serve 与 observer 均为 code=0、signal=null，producer 的授权和模型调用为 NOT_RUN/0。
- `process-proof.stdout.raw` 原 root PID=223474、boot/ticks 身份的两次最终观察均为 `live_known_tree=0`，时间为 `2026-10-22T21:51:54.824437433Z` 与 `21:51:54.879130074Z`，后次 `complete=true`，间隔约 54.69ms。owner 的 shutdown 为 `ORIGINAL_SERVICE_AND_OBSERVED_TREE_EXIT_CONFIRMED`。
- 两份原件均为当前 UID=1000 的普通文件、0600。没有本轮继续运行旧服务的依据；原 `055b9721…` 包已永久失效，不执行、不改写，也不把其待答委托转移到新服务。

新测试由新 owner 保存真实 launch/ready/proof，技术包绑定其完整 S、runtime、原生创建身份和截止时间。完成或失败后仍由该 owner 正常 EOF，并取得实际外部结算。

## 已查到的具体限制

| 边界 | 当前实际行为 | 必需变更 |
| --- | --- | --- |
| 产品 `task-budget.ts` | `max_workers` 已为安全正整数；created/pending 共用原事务额度 | 保持规则，不能将数值范围当已验容量 |
| `prepare-public-case.mjs`、主 driver 参数 | 允许 3..100，公共 case 的 max_workers 跟随 N | 沿用，不将观察上界100改成产品配额 |
| `pi-event-view.mjs:isLinuxPiTarget` | 只允许 Linux/Pi/StepFun、workers===3 | 同固定目标精确开放3、4、6，其他未验数量仍拒绝 |
| `authorize-installed/main.go` | fixedProfile 拒 workers!=3；driverArgs 硬传字符串3；旧公开项目路径固定 | 保留原 Codex/N3 范围，增加固定 Pi N4/N6 profile、独立公开 case 与各自准确 N；传包中已校验 N |
| `public-case-definition.mjs` | 三种提示循环分配，N4/N6会重复职责 | 准备六项有区别的公开审阅职责；N4使用前四项，N6使用六项 |
| 主 driver 的并发判断 | Promise.allSettled 发起；全部有原生 start、未结束、至少两条真实 delta，公共区间 from<to | 保留所有判断；不能用进程数、排队、两两重叠代替全 N 重叠 |
| 完整结果/观察 | 完整页及原 Task/Dispatch/资源数量保持；单源12MiB、完整多Worker结果96MiB、导出响应128MiB | 原四份trace已超过旧总界，按[容量任务](swa-result-capacity-20261023.md)区分单源与汇总；超界明确拒绝，不过滤记录或改称完整；N6峰值仍待实际验证 |

Pi 实际目标保持 `pi@1.0.1`、`stepfun/step-3.5-flash`、`openai-completions`、`https://api.stepfun.com/v1`；原 policy 的源码 pin、真实 handler、私有 per-session HOME、同安装 protocol/observer、原始 RPC 与完整 journal 检查不变。此前目录 GET200、无认证 TLS 对照和无模型 RPC只证明各自范围，生成、N4、N6仍未执行。Linux 固定系统 CA1 及原 bootstrap 精确转发保留，不能关闭证书验证。

## 固定公开任务、角色与顺序

继续使用既有公开 stats 项目与完整四原文：`https://github.com/songconmaisaix31-design/astrocyte-s3-public-stats.git`、revision `da3bdddb085808863090a05f60cc1c64415039cf`。只读审阅，不运行项目程序、不修改项目。新 N4/N6 使用各自新普通目录与独立 Root Task，不覆盖旧 case、包或结果。拟准确路径为 `/workspace/swa-public-case-20261023-n4/public-project` 和 `…-n6/public-project`，实现时由固定 profile 同步核验。

| 槽位 | 本次明确职责 | N4 | N6 |
| --- | --- | --- | --- |
| 1 | lead核对模块、现有Mean API、四原文出处，并在原会话继续核对追加输入或真实子成果 | 是 | 是 |
| 2 | 审阅Median设计、奇偶长度、输入顺序保持与现有API兼容；计划主动停止此非lead项，保留真实部分结果 | 是 | 是 |
| 3 | 审阅空输入、NaN/Infinity、有限大值与中间值溢出边界 | 是 | 是 |
| 4 | lead的真实孙任务，独立核对现有测试能证明什么、还缺什么；N6原成果通过resume回到lead | 是 | 是 |
| 5 | 核对复杂度、是否修改输入、实现选择的条件与尚未运行证据 | 否 | 是 |
| 6 | 独立核对任务成功标准和交付可审性，区分事实、建议与未知 | 否 | 是 |

每项模型只收到同四份固定原文及已批准提示。模型自称“Reviewer”不能证明产品持久角色已建立；业务角色入口完成后，实际 role ID、Task、Dispatch、原生 session、Agent/model/账号状态分别记录。N4与N6是不同注册项目，角色按项目隔离；N6在同项目用四个持久角色映射六项职责，槽位1/5共享来源分析角色、槽位4/6共享独立审阅角色，各自仍有不同Worker/原生session。全部释放后角色仍可查询，不跨项目借用角色。未接入业务角色时，该项保持未验，不能以提示词角色代验。

两个批次串行：先完成N4的业务审查、资源释放和原owner结算，再开始N6。每批 `max_workers=N`、`initial_workers=N`；通过默认等待run真实创建lead，再补同Run的N−1，不做隐藏排队或缩减。槽位4的parent是真实lead child Task，形成root→lead→grandchild。N+1拒绝在全N重叠之后、主动停止之前核准确resource_limit和完整库存不增；不能以scope_denied当额度拒绝。

## 必需实际判据

1. **安装与权限前置**：最终完整 S 的真实安装，装内 Node/CLI、原 checker、同 S 纯 observer、当前 endpoint/runtime、settings revision/Grant/token和固定公开项目均真实有效。当前静态未知能力允许按原首次握手规则处理；明确 unavailable 立即停止。账号材料只由既有受控产品路径消费，验收报告不输出 key、auth 正文或完整环境。
2. **全 N 并发**：恰好 N 个独立 child Task、Dispatch、Orca session、Pi原生 session/file、HOME、native CLI incarnation；全部真实 start 且尚未 settled，每项至少两条非空原生 delta。在同一 daemon 单调时间中 `max(first_delta)<min(last_delta)`。保存每项原始来源和实际重叠区间。任一先结束或被限流导致无法满足，记录实际失败/未知，不自动补 Worker、换任务或静默重发。
3. **停止隔离**：两批均对槽位2真实活动turn使用一个原请求主动停止，核原生abort/interrupted、journal stop mark、完整Linux D或真实Windows Job结算；其余N−1身份不变，并有完整停止观察之后的新真实delta。不能将idle close计为主动停止。
4. **同会话继续**：N4仅在lead首轮idle、原Worker活且真实孙任务槽位4仍未完成时送固定后续文本；独立request/operation ID、原session/fence不变，原生全文和第二次完整turn可追溯。实际没有窗口或提前释放则如实失败，不延缓产品结算。N6消费原生子Task完成mail及callback R，原body=子Task.result，真实provider输入、lead第二轮delta/完整成果、mail已读及run_view逐项相符；不另手工增加模型轮，queued不算继续。重放已完成原R不重复输入，修改同R正文明确拒绝，未知只查原R。
5. **完整成果与真实审查**：全量递归Task/Dispatch/resource库存、原模型、账号观察、原生输入/输出及journal逐项核查。停止项保留部分结果和状态，其余有完整成果。新后端先以完整原生结果自动结算Run；独立Reviewer读取实际成果并决定验收，不把其审查虚构成已发生自动结算的触发条件。源码引用、建议和未运行测试必须准确，不以模型自述代独立审查。
6. **本轮 Run/交接集成**：新合同完成后，使用同一真实 Run 的稳定ID，经 run/wait/export读取同 Task集合；重复提交/重连不额外启动 Worker或模型。work/consult/notify 使用实际后端字段：notify不创建额外 Worker；consult的外部操作禁止由系统原权限和证据核验。递归失败、严格模式、待回答、超时的具体退出码沿负责人冻结合同，先做真实非模型组件检查，再在以上两个批次消费实际记录。不能以计划中停止项擅自等同递归业务失败，严格失败用其已定义状态单独判定。
7. **最终释放**：主动停止保真实driver.stop同cycle；自动释放须核唯一原system release R/receipt、原resource身份/released状态、原record released/death ownerFence、完整D forced=false及原PID缺席，不对已经释放项另发停止来凑旧流程。controller close、Grant撤销等沿当前受托范围执行，未知不写成功。owner正常EOF、serve/observer真实退出、两次完整所属观察及非所属保全独立核查。每批报告实际CPU/内存/峰值Worker、原usage；不把默认cost=0当免费。

Windows与Linux分别报告。当前可直接安排的真实模型环境是Linux；Windows此前CI只证明CLI包/安装/无授权基底服务。没有Windows当前真实来源及模型执行证据时，N4/N6保持NOT_RUN，不以交编、GitHub runner或Linux结果代验。

## 实现写域与检查

本计划获独立接受后才实施验收改动；业务实现归原负责人，05不修改产品配额、角色或Run后端。拟必要写域：

- `tests/swa-product-acceptance/pi-event-view.mjs`：精确N选择；`run-installed.mjs`：同Run/角色/真实孙任务、lead第二轮及自动释放的直接验收接线，保持所有原来源/停止/未知门。
- `tests/swa-product-acceptance/public-case-definition.mjs`：六职责与当前公开成功标准；`pi-driver-boundaries.test.mjs`：改为实际选择规则，保留真实文件边界，不伪造帧或原生 rows。
- `tests/swa-cli-headless/authorize-installed/main.go`、`README.md`：固定Pi N4/N6合法profile、case路径和技术包，旧N3/Codex行为保留；`main_test.go`仅补真实纯profile/参数边界，禁止构造假账号、API或服务。
- `tests/swa-cli-headless/authorize-installed/public-case-preflight.mjs`：原直接消费者的公开case核查N3常量改为原profile传来的3/4/6，默认3兼容旧命令；Go核回报同N，原四原文/逐字输入/来源/hash门不变。该静态遗漏已报Root并获准补齐，不运行模型或新HTTP排错。
- 本任务文档。若新Run/交接接口要求其他直接测试消费者，先向Root/06提交准确增量；不提前冻结未知字段。

内部纯 observer profile `stepfun-pi-n3`当前只是既有纯 decoder 的选择符，内容没有N配额；此批复用其真实同S源码/装内协议，不为更名增改编译或解析机制。新的执行包profile为 `stepfun-pi-n4`、`stepfun-pi-n6`，两者的 workers分别只能4或6，caller/project/space与本次范围一致。实际包技术验证保持原pin/清理/未知门；旧055b绝不转成新profile。

必要局部检查为固定Node语法、原纯选择/profile检查、公开准备器在新目录产生真实公开输入并核原文、Go对应纯测试/编译、改动适用的架构检查。完整strict与整合build由Root统筹新功能批次一次安排；纯文档不重跑旧D12、旧TLS HEAD、旧Windows native组件。新安装上只运行受影响必要安装/协议/服务检查及本次真实N4/N6，保留全部失败，下一full前先报告最小复现、原因证据和局部验证结果。

## 资源、清理与停止条件

本次只读快照：`df -B1 /workspace`可用 **1,777,184,768B**；GOCACHE为 `/workspace/swarm-anything/.verification/cloud-setup/cache/go-build`，canonical普通目录、UID1000、0700，`du -s -B1`实际分配 **320,163,840B**（`du -sb`逻辑大小309,451,752B）。仅comm观察到的Go PID220586，后继用ps/psutil核实为Zs，已无活体执行资源；不能将它报告为仍在编译。容器cpu.max为400000/100000（4核额度），memory.max=34,359,738,368B；memory.current含可回收页缓存，不能直接当模型可用内存或已验N容量。

可重建的最窄清理仍是已审 `linux-clean-go-cache.sh`：激活后核精确GOCACHE/go env/canonical/UID/0700及没有Go/compile/link/asm/cgo活动，只执行官方 `go clean -cache`，前后空间、原exit保存新证据。当前不执行。预计最多约0.32GB，实得量以后续df为准；此清理也不足以容纳新完整候选/归档/外解包/安装约3.4–4.0GB的历史量级。正式构建前按实际新包估算和分段空间门决定，不能让构建成功后挤掉必需安装阶段。

pnpm store约1,041,043,456B、metadata约240,975,872B、Go GOPATH约407,138,304B、npm cache约23,085,056B。它们属于可下载/重建资料但被当前冻结安装/离线构建共享；本计划不批准删除、prune或清Go module下载。Root后继已明确允许清理可由保留归档重建的旧解包副本；准确四路径/3967389696B候选、完整归档内容对照和无当前UID活引用在ignored `release-cleanup-20261023-01/plan.md`，须06源审后才执行。旧dist候选、ZIP/tar、安装、账号来源、测试输出、所有失败轮与partial均保留，不能扩大删除范围。

06已接受上述限定清理，`release-cleanup-20261023-01/operation-01/result.json`实际COMPLETED/exit0：仅四个旧packages副本已移除，前后free为1628884992B→5596254208B，实得3967369216B。四tar前后SHA均0，dist/安装/所有日志、最新aefe、失败轮与partial全部保留；没有清缓存。执行前刷新当前UID活引用0/权限缺失0；初GNU tar mode差异与hardlink辅助断言失败保留，后继官方tarfile真实内容/entry比对r2为0，不称逐metadata完全相等。

真实平台/来源/Grant/活体owner缺失、磁盘不足、完整观察超界或效果未知，各自保留准确状态；不伪造通过，也不让旧包失效阻止不依赖它的新源码与局部检查。本文件交06独立审核，当前所有N4/N6实际结果均为NOT_RUN。

## 当前源码与必要局部结果

06已限定接受原七源码域及直接public-case-preflight第八域。首批已实施固定Pi N4/N6选择/profile/独立公开路径和六职责；旧Codex/Pi N3规则保留。`n46-driver-20261023-01/`原件记录：受影响五个Node源语法0；纯选择规则2PASS/0skip；Go定点profile与dependency两测试组及24个字段拒绝子项0；直接consumer加入同N传递后Go定点r2仍0。公开N4/N6分别真实clone固定revision四文件并准备输入0；原consumer对当时新4/6及旧默认3公开case逐字核对均0，无授权HTTP或模型。

06已接受同Run增量计划及最终真实consumer修正：默认等待run的正式JSON事件与原提交R/阶段receipt双核，补同Run N−1；4Role/Conversation/真实notify、required handoffs/acceptance与native.execution按实际合同消费；最终原自动结算后run退出，wait/export读取同完整递归库存。N4/N6均保lead、停槽2，N4中途追加lead、N6真实parent-resume。Conversation保存公开初始草稿与N4追加文本，存储本身不算送达；notify原mail和完成mail分别与原run_view核对。

本批只改driver/publicCase、工具README与本任务，原公开准备物已备份到 `n46-run-integration-20261023-02/public-n4-before`、`public-n6-before`；通过文件编辑更新尚未执行的公开输入，四份Git原文未动。该目录首轮受影响两Node语法/help/3个真实public-case-preflight（N4、N6、旧默认N3）/diff/源码首末一致均0，未运行CLI修改、服务、模型或完整构建。末版源码仍须06独立审查，实际新安装、模型N4/N6及独立业务接受均NOT_RUN。
