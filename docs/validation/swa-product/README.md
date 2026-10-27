# SWA 产品验收

本目录由第06卡负责。开发基线为 `6195f4cfb6b32aedd43845443c029ecc11d5578d`，具体计划见[本轮计划](plan-20261022.md)。历史安装和两 Worker 结果保留其原范围。

`tests/swa-product-acceptance/preflight.mjs` 只读观察当前平台、明确选择的安装根、目录、Agent 文件及变量存在状态。支持观察 Windows x64 和 Linux x64 glibc；新候选的 `PLATFORM` 为 `win32-x64` 或 `linux-x64-glibc`，缺失时仅兼容原 Windows 候选，不能将其当成 Linux 安装。它不申请 Grant，不读取凭据文件，不调用模型，不执行 Worker，也不确认产品验收通过。`SWA_PROJECT_TOKEN` 已设置仅证明变量存在。

在仓库根目录运行：

```sh
node tests/swa-product-acceptance/preflight.mjs --workers 3
```

当前平台具有实际候选和合法当前授权后，可以指定全部路径。`--agent` 是明确选择的原生可执行文件绝对路径，`--model` 是对应已批准模型名称。私有数据根、安装根和公开测试项目必须分离；Linux 数据根还要求当前 uid 所有、0700。凭据通过受保护运行环境注入，不放入命令参数、报告或 Git。

```powershell
node tests/swa-product-acceptance/preflight.mjs --candidate $InstallRoot --data-root $DataRoot --project $PublicProject --agent $AgentExecutable --model $ApprovedModel --workers 3
```

退出码 `2` 表示参数无效；`1` 表示明确选定的实际输入检查失败；`3` 表示验收尚未运行或前置未完整验证。该脚本始终保留真实产品场景为 `NOT_RUN`，不运行其他平台的候选。主机平台已观察不代表已有对应候选。最小文件及版本观察不能代替 `check:swa` 闭包、权限、实际完整所属树和模型验证。

## 固定公开输入准备

用户已确认本轮真实模型测试费用不设上限。ToolsOff、固定公开输入、当前项目/模型/外发批准、原请求去重及资源退出要求继续适用；预算决定不会创建账号或项目 token，也不扩大私有资料范围。跨创建者的新许可仅为人类独立当前权限下的 `worker.send`，不包括 `worker.start`。

准备器通过现有 HTTPS Git 代理读取固定公开 stats 项目的准确提交，核对实际四文件，不执行 hook、子模块或项目脚本。选择仓库外尚不存在的专用目录：

```sh
node tests/swa-product-acceptance/prepare-public-case.mjs --root /workspace/swa-public-case-20261022 --workers 3
```

实际生成任务规格、N份不同职责的公开输入、同会话后续输入及来源记录；这些均是验收输入，不是原生身份、事件、状态或模型结果。目录已存在时拒绝覆盖。此准备器按当前完整成果100项观察边界接受 N=3..100；这不是产品 `max_workers` 的硬上限。更大的完整验收需要先解决已有分页/完整库存限制。

当前实际公开案例为 `/workspace/swa-public-case-20261022/public-project`，提交 `da3bdddb085808863090a05f60cc1c64415039cf`。2026-10-22实际准备退出0，已有目录拒绝退出1，N=2/3.5/101拒绝退出2，未调用模型。Linux后继前置观察退出3，主机平台匹配但没有据此声明安装候选或里程碑通过。日志在 `.verification/swa-product-acceptance/`。

2026-10-22后续实际CLI04候选的源码为 `e14800c1b207a8c063531fedf014aa0cd2374558`，仓库外安装位于 `/workspace/swa-linux-installs/swa-linux-cli-e14800c1-04`。构建、归档校验和私有安装退出0，固定Node24.21.0的真实PTY输入/回显/退出、watcher创建事件及28253项闭包检查通过；安装根0700，属于当前uid。真实服务在18793完成同Node/daemon/HTTP readiness、health200及正常stdin关闭退出0，内部完整所属观察与外部实际进程身份均确认退出。证据分别位于 `.verification/swa-linux/evidence/e14800c1b207a8c063531fedf014aa0cd2374558-cli-04/` 和 `/workspace/swa-cli-smoke-e14800c1-1792661325429/smoke-evidence/`。

本卡对该实际安装物运行preflight退出3，版本和互不包含目录观察通过；当前项目Grant、Agent NativeLaunch/ToolsOff、真实多Worker和CLI/GUI里程碑仍为 `NOT_RUN`，没有模型调用。没有自动取得human会话、签发Grant或申请token。service级完整退出证据不等同每Worker完整资源证明。

现有历史入口为 `tests/swa-cli-headless/installed-flow.mjs`、`public-case.mjs` 和 `scripts/verify-swa-cli-headless.ps1`，保留其 Windows 路径与两 Worker 结果。下述 N 驱动独立消费准确原件，不把历史脚本结果改记为 N=3。

## N Worker 安装验收驱动

`tests/swa-product-acceptance/run-installed.mjs` 实现同一Run/root Task下N项启动、全体真实delta公共交集、活动停止、其余原session继续、同会话后续输入、额度拒绝、原request幂等、完整原件和journal核对，以及真实Agent控制端业务审阅后的完成。它只附着明确服务，不自动启动第二runtime、取得human会话或签发Grant。

先用同安装物的固定Node查看 `--help`。完整调用中所有变量必须来自本次准确安装、当前合法项目授权及固定公开案例；`serviceLog`必须是本次私有dataRoot内实际serve日志，`newEvidence`为尚不存在的目录：

```powershell
& $installedNode tests/swa-product-acceptance/run-installed.mjs --candidate $installRoot --data-root $dataRoot --project $publicProject --project-id $projectId --endpoint $endpoint --agent $agent --model $model --output $newEvidence --service-log $serviceLog --workers 3
```

驱动支持 Windows Pi/OpenCode 与 Linux x64 glibc 的 Codex0.163.0/gpt-5.5 来源。Linux另需显式本地源码仓库，必须包含安装物VERSION的完整commit；不会用当前HEAD替代或自动联网补源码。Linux例子：

```sh
"$installedNode" tests/swa-product-acceptance/run-installed.mjs --candidate "$installRoot" --data-root "$dataRoot" --project "$publicProject" --project-id "$projectId" --endpoint "$endpoint" --agent codex --model gpt-5.5 --output "$newEvidence" --source-repository "$sourceRepository" --workers 3
```

`prepare-source-observer.mjs` 用成熟Git archive/ZIP读取器导出固定公开源子树，核commit注释、普通条目及每个原Git blob；不创建worktree或执行项目脚本。观察器只调用同VERSION的成熟stored-record decoder和指定PID只读观察函数，依赖只从该安装物解析。源码、metafile、依赖与bundle的SourceVersion和摘要进入本次私有证据；原件变化或装内journal-open缺失时不启动Worker。Python3只用于成熟ZIP解析，不读取账号。观察器不替换产品模块，不把整条Session record、账号目录或配置原文导出。

前置只接受服务真实返回的注册、启用、安装和配置四项available，以及start/send/stop的声明支持和准确model。没有项目化配置时在start前保持NOT_RUN；不能为运行117旧安装而填入缺失模型。未握手的launchable/read/tools诚实保留unknown，任一明确unavailable仍拒绝；声明或可提交不代表已经执行。实际启动仍经原产品的当前项目/Grant/account/ToolsOff/fence门，每turn再核。ToolsOff绑定真实原selection.native_launch.tools与固定native contract，不能只凭policy_ready的remote_control_status=disabled推断全部工具关闭。

准备器和驱动共用固定公开定义；模型输入前逐字核对四份真实Git原文、完整任务规格（含空references）、各职责正文和后续正文。每条命令在启动前以0600独占保存原参数和request并同步磁盘；未知stop/release只查询该Dispatch已有的原request，不换键重新停止。已完成请求的回放同时核原回执、input operation和真实原生执行次数；继续输出的证据须晚于实际原生停止标记。报告记录安装物实际EDITION；缺少装内正式checker时保持NOT_RUN，不使用开发树脚本替换。

服务UUID与进程owner incarnation分别验证：CLI回执及实际Worker的`runtimeEpoch`必须属于开始时的服务；`source.process.runtime_id`则绑定本Session真实journal数据库记录中的`lease.ownerProcess.runtime`。首次保存身份先核原start R的实际input binding、当前项目revision及provider head原fence；每次事件读取前后重核同一journal文件的必要record/head/lease。Codex typed handle由同VERSION成熟decoder转换，不手写存储格式；bootstrap和原生CLI分别核真实Linux boot/ticks/uid，不填Windows时间。

Linux Codex只消费原provider-events.ndjson中的raw_line/frame、实际thread/turn/item与delta，不拆最终文本充当流事件。停止取同源custody_closed、ACK、wrapper退出/缺席及两次ECHILD，并独立观察原进程身份退出；内部stop_id不是公开stop R，用真实Dispatch/session/custody及原日志位置关联，不要求两个UUID相等。释放后继续核原ownerFence/deathEvidence与这份原完整证明；未知stop只查原键。完整rollout文本逐字对实际有界FD原件，原R/operation、真实journal user item/turn与native final分别核对，仍受12MiB及完整分页门限制。

实际成果齐备后，驱动输出原结果路径，等待真实Reviewer/Agent阅读后输入一行JSON，字段为 `reviewed_result` 和 `checked_result`；只把真实审阅记录写入完成正文，不自动生成通过，也不取得human身份。未知请求只查询原request；缺少实际分块观察、未命中的效果丢失分支、过期/跨项目权限与GUI行为分别保留未验。

原Windows驱动的语法/help/非法参数及公开准备器等值检查保持各自已验范围，见 `.verification/swa-product-acceptance/review-driver-checks.json`。新Linux/Codex观察原型已对真实117版本的3480个原Git blob核对，并验证实际父PID/已退出子PID及两个非Session公开文件拒绝；没有构造Session、原生帧、模型或凭据样本。

正式观察器准备也已对同117版本的3480原blob和119编译输入核对。正式bundle与原型的SHA比较曾退出1；独立逐字节审查确认190处差异仅为输出深度产生的95条来源注释和95个CommonJS工厂键，原失败记录保留。随后仅对现成正式bundle `d77b6a2d3240c7e30b3c941c97459e054dd3fe79cca7b2c5bfc33eee9fc78543` 运行原五项有界观察，实际5/5通过：活父PID、已回收子PID缺席、公开package非Session拒绝、AGENTS非JSON拒绝及PID0拒绝。证据为 `.verification/swa-product-acceptance/linux-codex-observer-final-r1/component-checks-formal.json`；未重新导出或编译，typed Session与模型继续未验。

当前117 Linux组合安装的构建、安装、D11装内+3同SHA诊断和同服务静态HTTP/正常退出已独立接受；该安装没有后继项目化capabilities修复，不能据此宣称其Codex静态配置或N可用。新驱动原生动态、完整typed Session、delta/stop/send/replay、真实账号与模型仍NOT_RUN，相关控制分支仅源码审查，不用参数或组件成功升级为N=3。退出0仅表示当次已执行断言及成果交接完成，最终里程碑由独立审查决定。

## Linux StepFun Pi N3 扩展

新增驱动路径限定 Linux x64 glibc、官方 Pi1.0.1、`stepfun/step-3.5-flash`、`openai-completions`、`https://api.stepfun.com/v1` 和 `workers=3`。账户种类为 `pi-native-api-key-per-session`，工具合同为 `pi-cli-1.0.1` 的 disabled。原 Windows Pi/OpenCode、Linux Codex选择及其历史结果保留原范围；Pi扩展没有改变旧分支的N=3..100规则。

Linux Pi必须额外提供 `--pi-launch-record ABS` 与 `--pi-launch-sha256 64hex`。它们取自本次真实owned serve产生的六键记录：installation、source_revision、data_root、endpoint、serve_pid、pi_source_home。driver在start前核文件、摘要、同安装S、实际服务owner与独立批准的SOURCE；不从首个Worker的selection反推批准来源，也不读取来源key。

```sh
"$installedNode" "$sourceRepository/tests/swa-product-acceptance/run-installed.mjs" \
  --candidate "$installRoot" --data-root "$dataRoot" --project "$publicProject" \
  --project-id "$projectId" --endpoint "$endpoint" \
  --agent pi --model stepfun/step-3.5-flash --workers 3 \
  --source-repository "$sourceRepository" --output "$newEvidence" \
  --pi-launch-record "$ownedPiLaunchRecord" --pi-launch-sha256 "$pinnedPiLaunchSha256"
```

封闭Pi授权包逐同S Git blob和SHA核对八个执行源：`run-installed.mjs`、`public-case-definition.mjs`、`codex-event-view.mjs`、`prepare-source-observer.mjs`、`source-observer-entry.ts`、`extract-observer-source.py`、`pi-event-view.mjs`、`pi-source-observer-entry.ts`，均位于 `tests/swa-product-acceptance/`。测试与本README不算执行依赖。最终安装VERSION的commit必须包含这些准确源码；不将后继HEAD驱动称为旧安装同S来源。

观察器使用 `prepare-source-observer.mjs --profile stepfun-pi-n3`。除同S源码归档及装内journal-open外，还必须消费实际装内纯 `runtime/pi-protocol.cjs` 和对应metafile，核同S builder的唯一entry映射、输入及首末SourceVersion；缺文件、strict导出或依赖就拒绝，不回退开发树的jsonc-parser或重新编一份协议实现。旧875安装仅可用于其真实缺件拒绝，不能充当Pi B或N3正向候选。

三个Worker必须分别绑定真实Orca session、`DATA/pi-workers/<projectId>/<sessionId>`的独占0700 HOME、native UUIDv7、sessionFile及bootstrap/native身份；三个HOME的实际dev/ino互异。每次事件读取重核同journal的record/head/lease/accountHome、原fence及两个runtime身份。输入、停止、回放和未知效果均沿原R、真实binding与journal查询；ACK不代替accepted，user echo仍须与原FD读取的完整native entry及前缀关联。

N3重叠、活动停止与其余Worker继续输出使用同一真实宿主incarnation及服务epoch的monotonic来源比较；不跨owner比较performance.now，也不以墙钟代替先后证明。正常停止仍需原D可信final、真实EOF、projection drain/written和durable custody_closed；未知保留原资源，不补Worker或换请求。完整成果及真实业务审阅仍按前述交接执行。

本次Pi驱动七源已完成实现并提交独立源码审查。本地四个JS语法、Python AST及help实际通过；专属测试实际5PASS/0FAIL/0skip，覆盖封闭参数、真实公开package拒绝为launch/trace、真实普通文件的权限/链接/字节界限/UTF-8/递归重复key，以及真实875在任何产品CLI或编译前因缺Pi纯模块早拒。文件读取调用真实driver consumer，严格JSON使用已审development纯protocol `563dc4d5…`，不回退另一parser；缺VERSION专属负向仍未验。首轮development观察器编译因helper把无扩展名路径直接返回而失败，原exit1保留；改用成熟esbuild扩展名解析后仅复验编译，实际0、123个实际输入及七源首末稳定，新观察器产物未执行。没有重跑五项或生成成功Session/native帧/候选/launch/凭据样本。

独立源码复审补齐了有界artifact读取、同cycle活动取消、原trace完整字节、逐message/contentIndex的六型增量及实际journal回执/写入来源；这些主链已获01/04分别限定接受。集中返修后的三个受影响JS语法及新观察器续编实际0、127个实际输入，七源首末一致；仍仅为development编译，产物未执行。thinkingLevel消费实际批准枚举、首次metadata及真实绑定成功写响应，没有把先前无账号实测窗口的off值外推为产品保证。该最末view差异的语法记录与此前源hash分别保存。

同S观察器准备和安装正向、真实账户、N3模型、input/abort/成果、HTTP/Grant/human及Windows Pi新路径仍为 `NOT_RUN`。上述普通文件与development编译不证明这些执行结果。实际模型窗口仍须准确封闭包、当前合法项目授权、B及安装前置通过后由root单独批准。
