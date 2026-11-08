# SWA 随包来源

SWA 产品代码沿仓库根 LICENSE。Orca 来源为 `stablyai/orca v1.4.230`，准确 Commit `b2879bd5aaac5d27c101ccf4171faa25d9f0bb1e`，MIT 许可完整保留于 `third_party/orca-v1.4.230/LICENSE`，安装候选另附 `ORCA_LICENSE`。来源子树为该 Git archive 的导出视图及产品适配，包含上游 export-ignore 省略和 Windows 文件执行位变化；具体边界及产品适配见任务报告。

原始 `Copyright (c) 2026 Lovecast` 保留在来源 LICENSE 中。已安装元数据确认 Pi1.0.1、jose6.2.3、node-pty1.1.0及windows-process-tree0.8.0均为MIT；原始MIT许可全文和各包notices继续按实际包内容随候选保留。各运行依赖的必要消费者沿实际源码和构建metafile核查，依赖声明或包名不能代替完整闭包验证。

Windows x64 的 flags4 身份快照使用 `psutil 7.2.2` 的完整 Windows NT 声明头，官方来源 Commit 为 `9eea97dd6f1d16ea33f5144c8925f1ce7a0688e1`。[原始 ntextapi.h](https://raw.githubusercontent.com/giampaolo/psutil/9eea97dd6f1d16ea33f5144c8925f1ce7a0688e1/psutil/arch/windows/ntextapi.h) 为19483字节，SHA256 `f706626568c9a152e98a4631182745ec47ecf4de6261f332703ce7d56fb5968e`；[同 Commit 的 LICENSE](https://raw.githubusercontent.com/giampaolo/psutil/9eea97dd6f1d16ea33f5144c8925f1ce7a0688e1/LICENSE) 为1548字节，SHA256 `b89c063b3786e28e0c0a38f1931db61fed35e69dd2a2966fbecffee0f46c8d10`。两个原件通过现有 `@vscode/windows-process-tree@0.8.0` patch 分别进入包内 `src/psutil-ntextapi.h` 与 `psutil-LICENSE`。BSD 3-Clause 的版权、三项条款及免责声明完整保留；正式 Windows 构建核对部署包原件，并将完整许可复制到候选 `third-party-licenses/psutil@7.2.2/LICENSE`，候选、解压与安装检查均核对该许可 SHA。NT 私有声明仅用于已选 Windows x64 实现，未声明 ARM64/x86 已验或私有 ABI 永久稳定。

产品复用 Orca 原生 runtime、持久 SQLite、Run/Task/Dispatch、请求 receipt、会话 transcript/journal、PTY/daemon 和已有进程控制。产品自己的组装入口、原生CLI账号/启动政策与授权适配位于 `runtime/swa-orca`，Go CLI/App/HTTP 与关联存储沿现有目录。安装候选的 VERSION 和 `swa --version` 指向实际构建源码 Commit；版本标识不代替功能验收。

随包 Node 为上游固定的官方 `24.21.0`，Windows x64 与 Linux x64 glibc 各使用上游原有平台输入。发行归档、headers及真实可执行文件均核上游固定 SHA256，完整 Node LICENSE 位于安装包 `node/LICENSE`。Windows native 使用该版本 headers/node.lib；Linux从同一冻结补丁源码使用固定 headers 与上游 N-API 8 配置编译 POSIX PTY，没有使用本机 Orca 的 Node、native 二进制或可写状态。

Linux 进程身份读取使用 `github.com/prometheus/procfs v0.22.0`（Apache-2.0），原始 LICENSE 与 NOTICE 按实际 Go 二进制的模块构建信息复制到 `third-party-licenses/go/`。其他实际编入 CLI/server 的 Go 模块也从固定模块源码复制原许可与 notices；声明清单、`go.mod`、`go.sum` 随候选 metadata 保留。许可证复制和当前机器的 PTY 检查不代替完整 Agent 验收。

Codex 模型目录使用官方 `openai/codex rust-v0.163.0` 的完整原件，准确 Commit `83086188ae0614bd882818ff1aa23f3194962012`，上游路径为 `codex-rs/models-manager/models.json`。源码原件位于 `assets/codex-0.163.0/models.json`，构建原样复制到安装的 `runtime/codex-policy/models.json`；Git blob 与完整 SHA-256 记录在 `dependencies.lock.json`。同 Commit 的原始 Apache-2.0 LICENSE 与 NOTICE 全文复制到 `third-party-licenses/codex@0.163.0/`，NOTICE 中的 Ratatui MIT 来源保留。此资产不包含 Codex CLI、账号或模型授权，也不单独证明工具关闭或模型可用。

产品使用实际安装的 `@earendil-works/pi-coding-agent 1.0.1` 或 `@opencode/cli 2.0.31` 原生CLI及其真实provider实现，Agent及provider/model必须明确选择。Pi政策限定既有原生API-key来源及三类已核API；OpenCode限定原DeepSeek/deepseek-v4-pro、官方Plugin hook及同版正式auth import。原auth/models/config及原生凭据库只读，所选有效材料在私有DataRoot中按受保护ACL独占创建；原账号和OpenCode原生exe不进入安装包。产品policy是随包ESM目录，保持原CLI默认HTTP行为；原生RPC/ACP、关闭工具、实际插件状态、来源及当前批准在效果前核查。完整产品认证、工具关闭和模型验收继续按当前测试计划执行。

运行依赖和构建工具的准确输入记录在 `runtime/swa-orca/package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml` 及 `dependencies.lock.json`。pnpm deploy 按锁导出包含 workspace 的独立依赖闭包，安装复制实际内容；每个第三方包的许可和 notices 随其原始 package 内容保留。node-pty、windows-process-tree 及Windows安全模块的相关补丁属于获准来源适配，Worker及服务Job保护须使用该候选实际编译的native能力。node-gyp12.3.0和TypeScript6.0.3为构建/检查工具；Electron43.7.8与新增@types包为开发类型输入，安装使用ignore-scripts且prod deploy保持原规则。真实声明、锁与安装已经同步。

普通pnpm安装明确不执行六个准确版本的依赖脚本：watcher2.5.6使用锁内平台预构建包；node-pty1.1.0和windows-process-tree0.8.0的产品native沿固定Node、原补丁及明确构建步骤生成并实际装载；agent-browser0.27.0不执行额外下载或全局shim修改；ssh2 1.17.0和cpu-features0.0.10保留原JavaScript消费者，不构建可选native加速。未知依赖脚本继续按pnpm严格策略拒绝，原esbuild构建规则保持。

构建从实际 esbuild 内联输入所属包复制原始许可全文至安装根目录 `third-party-licenses/<包名>@<版本>/`，作用域包名中的 `/` 使用 `__`。该目录保留 zod4.6.5、yaml2.9.1、diff8.0.4、smol-toml1.9.1、jsonc-parser3.3.1、@streamparser/json0.0.26、tweetnacl1.0.3与0.14.5、proper-lockfile4.1.2 的完整 LICENSE/LICENCE/COPYING/NOTICE；文件名及原版权按实际包内容保留。八项直接依赖作为构建输入安装，间接生产依赖由 pnpm 的实际生产图保留。

开发类型输入另含真实@types/express5.0.6，运行资源补充上游同版emojibase-data17.0.0；准确声明及锁同步保留。TypeScript6.0.3严格完整检查已通过，四个native模块已在固定Node24.21.0下真实编译及装载；完整候选仍须核相同源码及安装闭包。

安装使用明确的新目录及私有当前用户 ACL，不修改 PATH、注册表、全局 Agent 配置或本机 Orca 安装。后台和会话数据由启动时明确的独立 data-dir 拥有；认证来源、受保护目录和真实当前项目授权分别核查。

准确1209完整构建已完成native、Go及VERSION，候选内闭包和装载通过；独立安装后的依赖解析失败原件保留。后继采用成熟pnpm hoisted部署生成普通目录及文件，安装复制前拒绝全部reparse point；实际局部搬迁和动态装载已通过。完整安装、原生CLI认证及功能验收继续按任务计划执行，当前没有完整安装验收或功能通过结论。

后继来源适配将实际服务Job归属从daemon入口经startDaemon完整传递给DaemonServer，并在原SQLite适配器打开/备份边界使用Node成熟toNamespacedPath。原生身份、PID record及内核成员的严格核验继续保留；这些修复的实际限定结果见任务报告§31。
