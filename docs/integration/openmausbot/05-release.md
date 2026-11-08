# SWA-05 安装交付与 CI

## 双平台交付范围

产品构建入口支持 Windows x64 与 Linux x64 glibc，CLI 与组合形态共享服务和协议。当前云机器为 Linux x64 glibc，使用 Python 3.12、GCC/G++ 14.2.0 和 make。Windows 原生候选由独立 GitHub Windows 2025 runner 验证，Linux 交叉编译结果只证明编译。

Linux 构建复用已固定的 Node 24.21.0 官方归档、可执行文件和 headers 摘要、上游 N-API 8 配置与 Linux node-pty 产物定义。构建使用私有平铺依赖、冻结补丁、固定 node-gyp、明确 Python 及真实本机编译器；pnpm 采用官方普通可迁移 cmd-shim 配置，不注入开发机 NODE_PATH。下载保留 TLS 和原 SHA 校验。

Linux布局为 `node/node`、`swa`、`server`、`runtime`；Windows 保持原 `.exe`。组合形态仍使用同源 `web` 与同一服务。05维护构建、平台化闭包检查、Linux仓库外私有安装器和许可。02/03维护运行时、客户端路径及真实进程归属。Linux安装器只接受新建绝对目标，拒绝符号链接、目录重叠、保护根、覆盖，保持当前用户私有权限。候选用 `PLATFORM` 说明本机目标，不能把 glibc x64 产物声明成 musl、arm64 或所有发行版通用。

验证包括冻结安装、完整 strict、实际 Node 和 patched PTY 编译与加载、真实 PTY 输入输出及退出、文件观察事件、Go CLI/server、普通归档解包、仓库外私有安装、实际服务与所属退出。模型、多 Worker 与组合形态跨入口验收由06使用准确安装物执行，分别记录结果。

新候选的 `PLATFORM` 仅接受 `win32-x64` 与 `linux-x64-glibc`；缺文件只兼容旧 Windows 候选。Linux 安装器在写入前拒绝目标祖先中的真实 Git 元数据，包括 `.git` 文件、符号链接、非空目录和不可读取标记；只允许平台放置的普通空 `.git` 目录，并复核目录身份。显式保护根独立生效。新目标独占创建后逐顶层条目复制，拒绝覆盖，目录权限为0700、普通文件为0600、必要可执行文件为0700。

Go 许可清单读取实际二进制的 `go version -m -json`，再核只读模块版本与来源。CLI04 实际复制16个模块的 LICENSE/NOTICE，包含精确固定的 `github.com/prometheus/procfs v0.22.0`；Go sumdb、`go mod verify` 和仓库依赖清单检查均已通过。

源码由主控统一提交。标准构建在开始、结束时核查准确 SHA 与干净源码；开发库和未提交工作树不能替代正式候选。

## Linux CLI04 实际安装

准确源码为 `e14800c1b207a8c063531fedf014aa0cd2374558`。构建、普通 tar.gz 归档与 SHA-256 校验、仓库外普通解包、严格安装和安装后版本/闭包检查均退出0。实际 Node 24.21.0 装载私有编译的 x64 PTY，输入回显及退出、watcher create 事件通过，闭包为28253条路径。安装根 owner 为当前 uid1000，目录0700。

- 原候选：`dist/swa-linux-cli-e14800c1-04`。
- 普通解包：`/workspace/swa-linux-packages/swa-linux-cli-e14800c1-04`。
- 安装根：`/workspace/swa-linux-installs/swa-linux-cli-e14800c1-04`。
- 构建/安装证据：`.verification/swa-linux/evidence/e14800c1b207a8c063531fedf014aa0cd2374558-cli-04/`，含原始日志、SOURCE、两个退出码和安装版本。

03使用同一原样安装在18793运行生产 `swa serve`：真实 runtime、daemon、server readiness 与 HTTP health200通过；正常关闭 stdin 后 serve 退出0，生产归属检查与独立 pidfd 观察确认全部所属进程退出。证据为 `.verification/cloud-setup/linux-service-smoke-cli04.log` 与 `/workspace/swa-cli-smoke-e14800c1-1792661325429/smoke-evidence/`。项目 status 与 controller 需要当前项目 Grant，正向检查仍为 NOT_RUN。此结果不代表 Agent、模型、多 Worker 或组合 GUI 验收。

保留的前三次尝试分别为：`1961dfba` CLI01 构建在符号链接闭包检查失败；`559c621b` CLI02 构建成功、安装因空平台 Git 标记误判失败；`f71eec93` CLI03 构建成功、安装因复制到已独占创建的根失败。每次在新提交后重新完整构建，旧日志、候选及失败 partial 均保留；CLI04 使用 `e14800c1` 的正式修正源码。

## Linux Provider 原生扩展开发检查

D阶段扩展原 node-pty Unix addon，公开 `providerLinuxIsolationVersion:1` 及已审核的 subreaper、waitid、pidfd、精确回收接口。05负责补丁、官方 pnpm 生成的 patch hash、builder 复制和 probe；02负责产品头与生命周期。新 checker 在独立 Node 子进程中使用真实普通父子进程，验证错误父属拒绝、运行中禁止回收、实际 TERM 退出、WNOWAIT不消费、精确回收、已关闭句柄拒绝和两次独立 ECHILD。没有模拟 Agent 或模型协议。

开发 R1/R2 的内核功能检查通过，但真实 ELF 检查发现 C++ 运行库符号超过上游兼容范围，保留失败原件。R1 使用 `unordered_set` 引入较新 GLIBCXX 符号；改用 `set` 后，R2 仍经 node-addon-api 的 `NAPI_NOEXCEPT` finalizer 模板引入 `CXXABI_1.3.15`。最小复现是对保留的原库运行上游符号检查，实际符号和调用位置记录在 `linux-provider-addon-01-abi-symbols.log`、`linux-provider-addon-02-finalizer-callsite.log` 和 `linux-provider-addon-02-floor.log`。

02使用官方 `napi_create_external` 与独立 C finalizer 修正后，R3 编译、原 N-API 8 检查、实际内核 probe 与上游 `SERVER_SLOT_GLIBC_FLOOR` 检查均退出0，最高需要 GLIBC2.28、GLIBCXX3.4.22、CXXABI1.3.9。日志为 `.verification/cloud-setup/linux-provider-addon-03.log`。R3只证明该开发库；标准 Linux builder 已纳入同一上游兼容性门禁，后继正式安装证据见 combined01。

符号兼容性门槛与内核能力分别核查。运行还要求实际支持 subreaper、pidfd_open、pidfd_send_signal 和 waitid(P_PIDFD)；能力缺失立即拒绝，不切换为裸 PID 信号。上游符号门禁的发行版标签不代表已在这些发行版的全部内核上运行。

## Linux combined01 实际安装

准确源码 `6890522e43d7b81e99b09ca94acc27b9d3a5c7dd` 已执行标准 combined 构建、tar.gz/SHA-256、仓库外普通解包、严格安装与同安装版本/闭包检查，全部退出0。证据目录为 `.verification/swa-linux/evidence/6890522e43d7b81e99b09ca94acc27b9d3a5c7dd-combined-01/`，保留 SOURCE、build/install 原始日志及两个退出码。原候选为 `dist/swa-linux-combined-6890522e-01`，解包位于 `/workspace/swa-linux-packages/swa-linux-combined-6890522e-01`，安装位于 `/workspace/swa-linux-installs/swa-linux-combined-6890522e-01`，没有修改旧 CLI04。

实际 bundled Node 24.21.0 完成 PTY 回显/退出、watcher create、Linux provider isolation v1 的真实收养、精确回收和两次 ECHILD 检查。闭包为28307条路径，真实 Vite manifest 有2个条目、4份资源引用；安装根0700、owner为uid1000。02同安装检查14 PASS、0 SKIP、退出0，其中11项直接使用装内原 Tree、managed provider、entry 与 node-pty，3项是同 SHA 源码的身份/私有文件诊断。日志 `.verification/cloud-setup/linux-provider-tree-installed-6890522e-01.log`，不将外部诊断编译称为装内业务模块。

03使用同一原安装执行 `swa serve --web-dir <install>/web`：health200、首页及4份 manifest 资产的 HTTP200、实际字节与 MIME 通过；`/index.html` 的标准301指向同源 `./`。正常关闭 stdin 后 serve 退出0，生产双次空树与独立四身份 pidfd、两次完整空扫描确认所属进程退出。证据为 `.verification/cloud-setup/linux-combined-service-smoke-6890522e-02.log` 和 `/workspace/swa-cli-smoke-6890522e-combined-1792664829113/smoke-evidence/`。首次检查脚本误拒标准301的失败保留，局部修正检查后复验，没有重建或修改安装。以上不包含项目 Grant、controller、Agent模型、N=3 或浏览器交互验收。

## Codex 官方目录资产

后继构建加入完整官方 Codex 0.163.0 模型目录。`assets/codex-0.163.0/` 保留同 Commit `83086188ae0614bd882818ff1aa23f3194962012` 的原 models.json、LICENSE 和 NOTICE，原目录 Git blob 为 `72a78e0eacf94103f4babda2a5245aba4ce848c1`，完整 SHA-256 为 `943ca7fe1d19ed019054158303f0dbbd80b3bef43b3aa425a71aa7cb3fb52c2b`。现有 `dependencies.lock.json` 保存来源、tag、Commit、原路径、blob、三文件摘要和安装路径，不修改任何模型字段。

两个平台的既有 runtime builder 统一核源文件与固定摘要，独占复制目录到 `runtime/codex-policy/models.json`，许可全文进入 `third-party-licenses/codex@0.163.0/`。现有装内 checker 强制核 metadata 中的新 pin 与三份原件；旧安装使用其原 checker，保持原物。运行时固定 SHA、SourceVersion 和原生 config 门由原业务负责人实现。

局部验证已核官方 tree 的三个 blob、SHA、复制后的完整字节、源路径不可用时的独立资产检查，并实际拒绝重复复制、逐一缺失文件和无 pin 的旧真实 inventory。日志为 `.verification/cloud-setup/codex-catalog-assets-check.log`，依赖清单和三脚本语法检查退出0。后继 Windows `c7ab4a74` 的标准构建、解包和装内 checker 已退出0，完整安装验收在 ACL 阶段失败，范围见下文。认证、模型与工具关闭未由资产闭包证明。

## 开发依赖与检查

工具使用 Node 24.16.0、pnpm 11.27.0 和 Go 1.27.2。只安装产品使用的六个工作区中可跨平台开发的四个目标：

```sh
pnpm --filter astrocyte --filter @astrocyte/web --filter @swa/orca-runtime --filter @orca/process-host install --frozen-lockfile
pnpm check:contracts
pnpm typecheck:swa
go test -count=1 -mod=readonly -v ./cmd/swa
```

根 `pnpm-workspace.yaml` 保留原有 `allowBuilds` 与补丁，未关闭未知安装脚本检查。Windows 原生工作区保留依赖链接，原生构建由候选构建脚本按随包 Node 的 ABI 显式执行。直接安装全部工作区会触发两个 Windows 专属工作区的隐式 node-gyp 安装，不是 Linux 开发依赖的必要步骤。

`pnpm typecheck:swa` 使用 8192MiB heap，继续保留原 TypeScript 的 `strict`、`noEmit` 和完整诊断。候选构建也调用该入口。CI 的独立 `swa-foundation` 工作在 Ubuntu 与 Windows 上执行冻结安装、Go 模块校验、契约检查、完整 strict、CLI 边界测试，以及按准确 Git SHA 编译 CLI 并核对 `--version`。这些检查不调用模型。原有应用检查工作保留全部检查，不掩盖历史失败。

## Windows x64 候选

首批提交 `faea9d4a` 的 [GitHub Actions run 39747808189](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/39747808189) 已有公开页面记录：`swa-foundation` 的 Ubuntu 与 Windows 两个 job 实际成功；原 `check` 两个平台退出1，整体 run 为 Failure。这仅覆盖该提交的基础检查，不能证明后续 Linux 安装代码、Windows native 候选或模型通过。页面证据保存在本机 `.verification/cloud-setup/github-run.html`。

独立工作流 `.github/workflows/swa-windows-native.yml` 用于在 Windows 2025 上执行真实 CLI 候选、完整 native 装载、.NET ZIP/SHA-256、普通仓库外解包、原安装器、安装后完整 checker/版本/精确 ACL，以及无 Grant 的服务 readiness、health 和正常关闭。进程环境只保留所需系统工具，发现目录与数据在 RUNNER_TEMP 独占新建，不注入账户或模型凭据。产物上传仅包括明确白名单日志及成功候选 ZIP/摘要，排除 data/home/环境。工作流与03生命周期测试在 `139a777a4341b22df0de6e5db1c9b259586cf8df` 提交；[首轮实际 run 39757398493](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/39757398493) 的六步工具准备成功，driver约1秒后退出1。公开日志要求登录，API当前拒绝访问，该轮具体原因尚未取得，不能推断已进入原生编译。该轮没有 Windows native/安装/Job 通过结论。

诊断提交 `0209d004dd170cb049394f2a0ae67d154cb03f5a` 的 [run 39758336431](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/39758336431) 明确在 `preflight-toolchain` 失败：PowerShell `Get-Command` 返回的两个实际 Node 路径被作为单个命令执行。修正按 PATH 顺序取首个实际 Application，Node、Go、Git 共三处，固定版本断言保持启用。原两次失败保留，后续结果以新准确提交的实际 run 为准。

`3f4a4ea278d2cdf58711c8c6dee22797241b3780` 的 [run 39758793164](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/39758793164) 在 build 阶段失败。只读诊断 [run 39760430188](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/39760430188) 实际成功读取原 artifact，发现固定 node-gyp12.3.0 的 VS 探测报 `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`。这不能证明 VS 未安装；完整构建保持关闭，后续仅使用固定 Node24.21、未修改 finder、官方 vswhere 与 Developer Shell 做局部观察，不扩大原 maxBuffer、不升级依赖。

局部探测来源 `369680ec88d24a33e00d535b6c3eda0041809d1d` 的 [run 39763935502](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/39763935502) 退出1，未产生 baseline 摘要，实际首个失败阶段未知。静态核查另发现下载 work 路径不符合原 helper 的限定目录。后继局部检查已实际复现旧非法参数在 HTTP 前拒绝，exit1、stage=validate、ArgumentException且目标不存在；合法独占 work 的下载、SHA 和真实 Node 通过。原下载守卫、TLS、SHA保持启用。

来源 `2c02388612759f4665d3b0ae515d4cfd466ec8de` 的 [run 39765889558](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/39765889558) 完整记录局部三阶段后任务仍退出1。真实数据分开证明：原配置2022拒绝已安装的VS2026；VSSetup JSON 为1451733字节，原 default execFile 在1048576字节报 MAXBUFFER，而C#枚举78312字节成功；仅选择2026后 finder 成功，官方同安装 Developer Shell 下再次成功且不触发 MAXBUFFER。其 `cl /Bv` 无输入退出2只作为版本观察。Linux真实 PowerShell7.5.5 的六项普通进程最小复现进一步证明：原 runner 追加退出逻辑将已记录的非零观察传播为整体1；显式分类收尾为0，未知native退出与真实异常仍失败，日志 `.verification/cloud-setup/powershell-local/exit-classification-r1.log`。此项仅证明 shell 语义。

尾部分类修正来源 `1d27fd3c` 的 [run 39767392238](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/39767392238) 已实际成功，完整候选明确跳过。实际固定Node24.21/node-gyp12.3：原2022仍拒绝，selection2026与官方DevShell2026均成功，DevShell下为v145、SDK10.0.26100.0与实际cl19.51.36260.0。原 `cl /Bv` 退出2完整保留且不称编译；VSSetup完整输出1446335字节，C#为77972字节。未编译native、未安装候选、未启动服务或模型。原失败均保留，不以此局部成功宣布Windows发行通过。

MSVC选择修复来源 `82e1b09503486c14a9dececb5e3673827894c120` 的完整 [run 39769388709](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/39769388709) 仍失败，原日志和partial保留。只读诊断成功读取该次原artifact，实际错误为 `spawnSync git ENOENT`；补充栈明确为 `build-swa-package.mjs:45` 的 capture 调到148行最终源码检查，尚未写 VERSION。该结果不能作为完整候选或安装通过。

来源 `bfb28a829eb44a377e90e7654343575e3a9f3b0d` 的 [局部 run 39772717647](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/39772717647) 已实际成功：固定Node24.21与失败82源码的唯一PATH赋值，在官方Developer Shell之前、之后都复现同一问题。真实继承环境只有 `Path`，Git正常；对象展开后的普通字典执行原大写PATH赋值会同时留下 `PATH` 与 `Path`，新值含undefined，bare Git随即ENOENT。保留真实旧值并仅用一个PATH键的局部对照，两阶段都Git退出0且HEAD与当前probe一致。公开数据仅有键名、计数、状态和版本匹配，没有PATH值或原stderr。证据在 `.verification/cloud-setup/windows-path-job-119803972890.html`。Node24.21官方child_process文档的Windows环境键规则与此实际结果一致。

正式修正仅规范Windows builder的PATH：原键必须唯一且为string，保存原值、删除旧键，再以单一PATH加入随包Node目录。原nativeSettings仍有四个受核赋值，PATH赋值源码改变会使旧原生复用输入比较不等，按原路径重新编译；没有放宽既有来源、校验和或生命周期检查。局部生产环境规则和语法检查通过，后继完整候选的实际范围如下。

准确源码 `c7ab4a7479182f29f990cd649accac193514d169` 的 [run 39773729265](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/39773729265) 在 `installed-acl` 失败。保留 artifact 实际记录 frozen install、Go download/verify、标准 build、解包 checker、installer 和 installed checker 七项退出0；主流程已完成 ZIP/SHA-256、普通解包和准确版本检查。失败来自所有者与继承保护的原复合断言，原 artifact 没有记录这两个实际值，均保持 UNKNOWN；完整安装验收仍为 FAIL，未执行服务检查，成功候选上传跳过。

来源 `b4357653` 的 [局部 run 39775587011](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/39775587011) 使用固定 Node24.21、失败源码的成熟 PowerShell AST 和普通公开 LICENSE 目录，直接执行原创建、icacls 和复制操作。实际创建后所有者为 Administrators；icacls 关闭继承后，所有者仍未成为当前用户，并保留额外显式 Administrators ACE；原 Node 复制后结果不变。此复现明确原操作的权限缺口，不倒填原 c7 未记录的两项值。

安装器现使用新的 .NET DirectorySecurity，明确当前用户为所有者、保护继承，并仅授予当前用户和 SYSTEM 两条显式 Allow FullControl，均为 OI/CI 与 PropagationNone。来源 `5f450e59f0256fc15aea07cae2b0369276a05bb1` 的 [局部 run 39776733004](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/39776733004) 已实际成功：直接从生产源码 AST 提取同一函数，在新普通目录设置后与原复制后，均通过失败源码中的完整八条精确 ACL 检查，规则恰好两条、所有者与继承保护准确、LICENSE 字节相同。原 baseline 失败现象同时保留。该结果只接受权限组件修复；含修正的完整候选、安装和服务仍待独立执行。证据为 `.verification/cloud-setup/windows-acl-control-run-39776733004.html` 与 `.verification/cloud-setup/windows-acl-control-job-119817468620.html`。

后继 driver 在读取 ACL 前即记录 `installed-acl` 阶段，在断言前保存 `logs/installed-acl.json` 的实际 owner 匹配与继承保护两个布尔值，并分别拒绝失败条件。该文件明确列入 artifact 白名单，不输出 SID 或 SDDL；原精确 ACE 检查保持启用。

源码 `11717767f82a8a4070351ff74674aa0d268f79b2` 的 Windows 完整候选在服务检查失败。原 artifact 实际记录前七项退出0，安装根 owner 匹配与继承保护均为真；服务没有确认 readiness，真实 helper 退出1、serve 退出6。原始错误定位到 `private_pi_security_changed`，该次私有 Pi 目录具体 owner/ACE 未记录，保持 UNKNOWN。

来源 `abef1ec374e10ed2281980b8666043778ef3914a` 的 [组件 run 39786376454](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/39786376454) 已实际完成诊断。固定117的原四函数与真实同源 Windows native 组件在新普通目录复现原守卫退出1：mkdir 后 owner 为 Administrators；原 DACL-only setter 后及原守卫后，owner 仍未成为当前用户，protected 为真，恰 User/SYSTEM 两条 Allow、type0/flags3/mask2032127。七项守卫谓词仅 owner 为假。该结果是新目录非原子采样，未倒填原117历史目录值，也未运行服务、账户或模型。

共同 native 现新增 `createPrivateDirectory(path): boolean`：`CreateDirectoryW` 创建时携带实际 TokenUser owner 与仅 User/SYSTEM 的 protected FullControl OI/CI DACL。成功创建返回 true；仅 `ERROR_ALREADY_EXISTS` 返回 false，既有路径不接受任何 owner/DACL 修改，其它错误按实际 Win32 code 失败。Pi、OpenCode、Codex 各消费者保留原父路径和目标强检查，Codex 独占创建遇 false 仍拒绝；Linux 保持原 mkdir/0700。返回布尔不证明 HANDLE、目录身份或 SourceVersion。Pi/OpenCode 的原 realpath/lstat 检查不能声明覆盖所有 non-symbolic reparse；Codex 仍沿原 .NET ReparsePoint 门。

准确来源 `0ab2956dd5e808006f7fa8c4611362a9c8dbadbe` 的 [Windows 组件控制 run 39791764329](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/39791764329) 已实际成功，完整候选与 VS probe 明确跳过。真实新建返回 true、重复调用返回 false，既有目录的 stat/ACL/entries 不变；fresh 目录与当前 Pi 消费者均通过未改的原守卫七项。非法现存目录仍保持 Administrators owner 与原守卫拒绝，公开文件保持字节/元数据且目录类型被拒，缺失父目录报告真实 `CreateDirectoryW` code3且未递归创建，空/NUL/相对路径均 TypeError，实际 junction 被原父目录门拒且目标未变。Windows 原生组件只编译 index2；未重编旧 baseline，未执行安装、服务、账户或模型，也未证明 OpenCode/Codex Windows 路径已动态通过。公开十份 case 元数据与实际成功步骤保存在 `.verification/cloud-setup/windows-directory-control-run-39791764329.html` 和 `windows-directory-control-job-119869368842.html`；完整 result 在 CI artifact，本机没有下载，不声称已读取其额外字段。

诊断或 VS probe 标记优先，明确跳过完整候选和常规全量检查；普通 push/PR 保留原检查。下一次完整构建须先报告失败的最小复现、根因证据与局部验证结果，再由主控明确放行。

构建需要已有 Python、MSVC、PowerShell 7、固定 pnpm JavaScript 入口，以及干净的准确源码提交。Python 必须显式提供绝对路径，优先级为 `--python`、`SWA_BUILD_PYTHON`；显式无效值立即失败，不切换解释器。脚本核查实际解释器文件、`sys.executable` 与版本。固定 node-gyp 12.3.0 的 `lib/find-python.js` 支持范围为 `>=3.6.0`；本入口明确接受 Python 3.6 及以上的 Python 3，不承诺未来主版本。

Windows builder 的 `--msvs-version` 只接受2022或2026，缺省保留2022。随包Node实际执行未修改的 node-gyp.parseArgv，配置优先级造成有效选项与明确选择不符时立即失败。Linux显式收到此Windows参数会在构建前拒绝。CI driver 明确选择2026，先使用真实 vswhere 与同安装官方 Developer Shell，核VS18、真实MSBuild/SDK和Hostx64/x64编译器路径；driver也可明确选择2022，此时所有门一致使用VS17。`expected_gyp_toolset` 是原node-gyp源码的year映射，实际原生构建输出和真实产物仍须单独核验。没有修改全局 PATH、默认缓冲区或工具依赖。

原native复用记录现需核明确选择year与原成功node-gyp日志实际year一致，跨year按原路径重新编译，来源不明确直接拒绝。旧2022记录仅在成功日志、原Git源码AST中的literal2022和实际VS2022日志同时成立时识别，不凭缺字段推断。原Node、headers、Python、锁依赖、源码、补丁、原二进制及完整成功构建来源检查保持启用。局部参数检查、真实gyp配置优先级/冲突拒绝、Linux提前拒绝与实际PowerShell语法检查通过；Windows `c7ab4a74` 的标准构建和闭包检查退出0，安装整体失败。正向复用及修正后的完整安装、服务仍 NOT_RUN。

```powershell
$env:SWA_PNPM_CLI = '已安装 pnpm 11.27.0 的绝对 JavaScript 入口'
$python = '已安装 Python 3 的绝对可执行文件路径'
pnpm build:swa --output '本仓库 dist 下尚不存在的绝对候选目录' --python $python --edition cli
# 先进入所选VS2026安装的官方Developer PowerShell，再明确选择2026。
pnpm build:swa --output '本仓库 dist 下另一个尚不存在的绝对候选目录' --python $python --edition cli --msvs-version 2026
```

CLI 是默认形态，不需要前端构建或浏览器。组合形态使用同一源码，通过 `--edition combined` 执行真实 `web` 构建并生成 Vite manifest，复制 `web/dist` 到候选的 `web`，同时保存前端依赖的原许可证。根与前端 package、依赖清单、锁文件保存在候选 `metadata`，不会覆盖私有 runtime 的 package。

两个形态都写入准确源码 `VERSION` 与 `EDITION`。`EDITION` 仅接受 `cli` 或 `combined`；旧候选没有该文件时仅按原 CLI 闭包核查，不声明 GUI 能力。组合候选缺少 index、manifest、实际资源文件、manifest 内部导入，或资源经符号链接逃逸时立即失败。manifest 检查只证明引用闭包；实际页面与 API 行为仍须独立 HTTP、浏览器与原生执行验收。

组合候选沿相同 `swa serve` 服务，通过显式 `--web-dir` 绑定本安装的 `web`。该参数与私有服务环境由 02/03 实现，05 生成资产；Linux combined01 的实际服务与 HTTP 范围见前文，Windows 组合服务仍须实际验证。

```powershell
pnpm build:swa --output '本仓库 dist 下另一个尚不存在的绝对候选目录' --python $python --edition combined
# 使用实际安装目录与已核实的数据、端口、受保护根；本命令保持所属 stdin。
& $swa serve --data-dir $dataRoot --port $port --protected-roots ($protectedRoots -join ';') --web-dir (Join-Path $installRoot 'web') --json
```

候选仍沿原安装脚本安装到仓库外不存在的新目录。安装、版本、私有 ACL、实际 native 装载、服务及所属资源退出必须在 Windows 中核实；Linux 上的编译不能代替这些检查。原始校验和、TLS、原生复用来源及许可证检查保持启用。CLI 候选先交06验收；组合候选形成后在该准确安装重新完成跨入口与可配置 N Worker 验收。此任务不创建公开 Release 或发布环境。

## 首轮开发检查记录

下表保留首轮对应开发源码的原始结果，不代替后继准确候选验收。日志保存在本机忽略目录 `.verification/cloud-setup/`，不包含凭据。

| 命令或行为 | 本次结果 | 日志 |
|---|---|---|
| 全六工作区 frozen install | FAIL，两个 Windows 工作区隐式 node-gyp 安装失败，原件保留 | `frozen-pr5.log` |
| 四目标 filtered frozen install，690 条供应链策略 | PASS，退出 0，锁文件未变 | `frozen-linux-pr5.log` |
| `pnpm typecheck:swa`，8192MiB，原 strict/noEmit | PASS，退出 0 | `swa-strict-8192.log` |
| `pnpm typecheck:swa`，02/03源码整合后 | PASS，退出 0，完整 strict 诊断为空 | `swa-strict-integrated.log` |
| `pnpm --dir web build --manifest` | PASS，退出 0；保留既有 chunk 体积警告 | `web-manifest-build.log` |
| 实际 Python 选择、缺失/相对/无效参数拒绝、真实 Vite manifest 与实际生产依赖许可复制 | PASS，退出 0；复制七个生产依赖许可证，四个直接依赖许可原字节一致 | `release-config-check-final.log` |
| `pnpm check:contracts` | PASS，退出 0；264 个示例和生成类型一致，保留20项警告 | `release-contracts.log` |
| `go test -mod=readonly -v ./cmd/swa` 首次 | FAIL，捕获02/03共享 helper 尚未写完的中间状态；等待文件完成后重试 | `cli-boundary-tests.log` |
| `go test -count=1 -mod=readonly -v ./cmd/swa`，02/03接口完成后 | PASS，退出 0；五个非付费顶层测试实际通过，一个真实安装测试显式跳过 | `cli-boundary-tests-uncached.log` |
| `node --test tests/swa-cli-headless/task-budget.test.mjs` | PASS，退出 0，三个测试通过、零跳过 | `task-budget-ci.log` |
| Windows 候选/native/安装/ACL、真实模型、多 Worker | NOT_RUN，当前机器没有 Windows 执行环境 | 无 |

独立配置检查使用真实已安装 Python、真实前端构建输出和已安装依赖许可证，不创建替身服务或假安装候选。最终提交、接口完成后的 CLI 测试与实际候选由主控记录准确来源。
