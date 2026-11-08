# 统一候选与插件拆分

2026-11-08 用户接受周报三项建议：执行内核使用 `cmd/swa`；Astrocyte、Attention Mirror 使用独立插件仓和版本化 MCP/事件契约；统一候选按同一源码验收。

## 主线与归属

开发集成线为 `integration/unified-candidate-20261108`，从 FlowLens `62f9deac7b9e6083311722e9eacfbebcb5531c96` 创建。`main` 在统一候选验收前保留原版本。后续产品修改进入此集成线，不继续发展另一套执行器。

| 能力 | 唯一所有者 |
| --- | --- |
| Run、Task、Worker、项目授权、停止、恢复、导出 | SWA `cmd/swa`、`cmd/swa-server`、`runtime/swa-orca` |
| 本机扫描、ACP 握手、可移植角色/交接资产 | `cmd/swarm`；桌面调用同一二进制，不创建执行状态库 |
| Event/Signal、注意力、经验、人工经验批准、Sleep | `songconmaisaix31-design/astrocyte-plugin` |
| 资料正文、人工沉淀、Taste、委托判断、机会与准入 | `songconmaisaix31-design/attention-mirror-plugin` |
| 科研任务、租约、实验、验证、成果继承 | 既有 `Morphogenesis` 独立插件 |

角色卡是可移植资产。其工具、模型、交接策略不能增加项目权限；正式运行角色仍由当前项目、明确 Agent/模型及运行时 revision 绑定。当前桌面仅提供扫描/握手，角色资产 CLI 不提供第二套 chat/run。

SWA 只保存插件连接配置引用、当前项目绑定、对象 ID/revision 和事件回执；材料、经验正文、认知权重及人工批准事实留在插件数据库。插件不共享 SQLite transaction context，不在跨进程调用中假设同库原子性。Attention Mirror 准入保留源事件，SWA 建立草稿的消费者尚未实现；记录 v1 引用不创建草稿。启动 Run 继续核当前人类授权。

本决定取代旧主仓混合构建和独立本地 bundle 的产品归属说明；历史文档继续用于解释原验收，不自动成为当前入口。

## 证据复用范围

| 来源 | 可复用结论 | 不覆盖 |
| --- | --- | --- |
| Windows `43b959c2` / Actions 42369006864 | 原候选构建、安装、原生服务与任务记录 | 新统一源码的 Windows 检查 |
| WSL `7cde18b1` / FlowLens 任务记录 | 固定公开任务、OpenCode/DeepSeek、停止、重启、导出 | 其他 Agent、工具开放、原 provider session resume |
| 角色资产 `bd03e46` | 原格式、扫描与桌面代码来源 | 合并后同一候选的真实 ACP/GUI |
| Morph 工具桥 `777e538` / `1bd79d5` | 无模型跨进程工具调用历史 | Pi 模型科研完整流程 |

原件仍位于原记录中的目录，本次不修改其内容、日期或结果。应用层会话接续形成新 provider session 时按显式上下文交接报告。

## 统一候选验收

完成源码检查后记录准确 commit，再从该 commit 构建安装候选。修改代码后候选 SHA 随之变化，受影响检查必须绑定新 SHA。

1. Ubuntu 和 Windows 同源码检查通过，保留未执行项。
2. 安装后扫描真实 Agent，安装/配置/握手/执行能力分别报告。
3. 一个已授权 Windows 或 WSL Agent 完成真实公开任务，成果可导出。
4. 指定 Worker 停止、释放及服务重启恢复原 Task/回执。
5. 原 provider session resume，或读取带来源、固定对象 revision 的显式交接后完成后继任务；两类结果分别记录。
6. 插件独立建库/启动、固定引用、同事件 ID 重试与冲突、权限撤销；插件草稿不取得执行权。

只有以上适用流程通过，才把候选称为可发布版本。macOS 正式执行与 Morph 真实科研链分别验收，不因组件构建成功标记通过。

## 当前环境与检查

本次为独立 Linux 工作区，无用户原生 Agent、账号、历史 SQLite 或 Windows/macOS 主机。可执行源码、协议、独立数据库及 Linux 构建检查；真实模型、原生会话和 Windows 运行通过远端 CI 或用户本机执行。具体新结果在交付前追加。

已执行：Go vet、服务/角色/存储相关 Go 测试、插件真实 HTTP/SQLite 测试、架构251包、精确依赖、9份角色资产、264个 OpenAPI 示例和生成一致性、runtime TypeScript、Go/Web 构建通过。独立两插件均通过自身 `go test ./...` 与构建，Attention Mirror 还通过 `go vet ./...`。插件已验提交树分别为 `e96ec81f0ef265506abfa9378be18f6377a3e4e8` 与 `d4f3502fef77d3a3c60f7cec81f8711ff537935e`；上传以提交树为准，排除工作目录中未跟踪的历史 SQL。

完整 `pnpm check` 真实失败：`TestLinuxServiceRealProcessTree` 报当前 PID namespace 与 `/proc` 不一致；未放宽或跳过此检查。角色、数据库与HTTP包在同次命令中均通过。其后独立运行契约、类型和构建以覆盖未执行环节，不能写为整套检查通过。

独立源码与验证入口：[Astrocyte PR #1](https://github.com/songconmaisaix31-design/astrocyte-plugin/pull/1)、[Attention Mirror PR #1](https://github.com/songconmaisaix31-design/attention-mirror-plugin/pull/1)，均已合并各自 `main`。Astrocyte 源提交 `dc19b955f3481bdc9117db35e195a3d972367a13` 的 [Actions 42489959097](https://github.com/songconmaisaix31-design/astrocyte-plugin/actions/runs/42489959097)，以及 Attention Mirror 源提交 `502f9414780af57b0d353132032934f34e0f768f` 的 [Actions 42490122431](https://github.com/songconmaisaix31-design/attention-mirror-plugin/actions/runs/42490122431)，在 Ubuntu 24.04、Windows 2025 上的 `go test ./...` 与 `go build ./cmd/...` 均成功。本地真实协议/SQLite 调用覆盖各自记录的流程；跨插件传输、旧数据导入、六步经验完整消费者和同候选原生执行未验收。配置标识暂未解析为实际进程连接。

统一候选与最新验证入口为 [SWA PR #17](https://github.com/songconmaisaix31-design/swarm-anything/pull/17)。源码 `0d2f45d545a50a6f3601038c403d06a11c1b03f0` 的 [Actions 42491600389](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/42491600389) 中，两平台 foundation、Ubuntu `pnpm check` / `check:race` / `build` 已通过。Windows 原 Orca 路径专项已通过；完整检查暴露未准备 Windows 原生安全模块、打开文件替换被操作系统以 `EPERM` 拒绝的测试差异。Ubuntu 浏览器首次冷 Go 构建约 28.8 秒耗尽测试主体 30 秒；实际页面导航内容正确。这些失败不能计作完整检查通过。

后续补丁把 owned server 启动与清理放入独立 120 秒 fixture，保留浏览器主体 30 秒与零重试；Windows 文件替换核查操作系统拒绝、原身份与字节不变，POSIX 仍要求 `identity_changed`。原生模块从当前 workspace 和锁定依赖真编译，保持生产安全模块与发布构建约束。新源码的实际结果以 PR 中绑定的准确 SHA / Actions 为准；原生安装工作流的 skipped 不计作安装验收。

`3c5dba63` 的 [Actions 42492641581](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/42492641581) 已证实 Windows 冻结安装和其原生编译完成；后续锁定 node-gyp 重建因脚本要求 VS2022、运行器只有 VS2026 18.11.12328.437 / v145 / SDK10.0.26100 而拒绝。已按实际工具链固定选择 VS2026；现有 node-gyp12.3.0 与发布规则均支持此版本，无自动回退。该修正仍须新提交 CI，不能用安装时的自动编译替代完整检查。

`2ff97706` 的 [Actions 42493185050](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/42493185050) 中，Ubuntu 完整检查（含浏览器）与双平台 foundation 成功，Windows 锁定工具链编译及产物核验成功。后续七项测试因临时 bundle 的原生包查找位置失败，未通过完整 Windows 检查。测试现于 Windows 直接引用同一 runtime 的真实包入口，保留原包相对 `.node` 语义；Linux 保留原打包方式。固定 Node24.16 的七文件定向复验 37 通过、1 原有跳过；Windows 实际加载与调用仍待新提交 CI。生产安全实现与业务断言未改变。
