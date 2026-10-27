# 来源、采用方式与验证条件

SWA 输入为 `main@6445149358f5799fc5a786eb59ff494cddbec72e` 与 PR #5 `6778a66faf6d1ca7b50658f23966db3e406f38c6` 的本地集成 `6195f4cfb6b32aedd43845443c029ecc11d5578d`。下列 SWA 路径均在该基线实际存在；后续变更由[负责人表](ownership.md)指定负责人验证。

本轮新增人类跨创建者`worker.send`独立当前准入、Windows x64/Linux和更广Agent适配的来源与实现缺口见[Agent矩阵](02-agent-matrix.md)。该矩阵以真实45项TUI配置与7项结构化runtime catalog为输入，逐项区分模板/原生adapter/产品政策/实际执行；OpenMausBot交互参考不扩大SWA的Agent账号、工具或平台能力。

OpenMausBot 所有引用固定到 [`dbb73a73ae2cba48fdf608e9e22d1d5d91608532`](https://github.com/songconmaisaix31-design/OpenMausBot/tree/dbb73a73ae2cba48fdf608e9e22d1d5d91608532)。本轮通过 HTTPS Git 读取该准确对象，并核对引用路径。本轮采用方式为既有 SWA 代码直接复用或改造、OpenMausBot 结构/交互参考；本表不表示复制其实现。

| 现有 SWA 能力与路径 | 固定参考路径 | 采用方式与负责人 | 验证条件 |
| --- | --- | --- | --- |
| `cmd/swa/main.go`、`output.go`；`runtime/swa-orca/USAGE.md` | `docs/headless-cli.md`、`server/headless/client.ts`、`output.ts` | 直接复用 SWA 明确目标/单 JSON/退出码；参考无 GUI 使用体验，03负责 | 实际帮助、合法服务请求、JSON唯一输出、错误/130/6与原请求关联 |
| `runtime/swa-orca/src/agent-discovery.ts`、`agent-settings.ts`、`agent-launch-admission.ts` | `server/headless/engine.ts` 的所在位置仅作入口索引 | 改造 SWA 真实注册与稳定选择，02负责；不导入参考项目 engine/账号存储 | 分开核注册、安装、配置、可启动、控制能力和实际已选模型 |
| `internal/workspace/app/orca_execution.go`、`runtime/swa-orca/src/client.ts`、`controller-helper.ts`、`native-methods.ts` | `server/headless/run.ts`、`client.ts` | 直接复用 Run/Task/Dispatch 与 mutation receipts；参考整项任务的观察体验；02/03分工 | N 个不同真实身份、输入不串帧、同 request 不多执行、未知效果只查原件 |
| `internal/adapters/httpapi/orca_cli.go`、`contracts/openapi.yaml`、`contracts/swa-cli.schema.json` | `server/headless/client.ts` | 01维护已有 HTTP/App 合同；CLI/GUI共用实际服务；不导入参考项目“本机即owner”规则 | path/caller/项目/Grant一致，当前设置和CSRF校验，失效与越权拒绝 |
| `runtime/swa-orca/src/task-result.ts`、`cmd/swa/main.go` 的 exportResult | `server/headless/export.ts`、`output.ts` | 复用 SWA 真实 journal/transcript 完整导出；参考成果入口；02/03负责 | 原生成果身份、大小/一致性/秘密检查；预览截断不能作为完整成功 |
| `web/src/pages/swarm/SwarmPage.tsx` 及现有 typed API、DAG 组件 | `src/App.tsx` 的 `Sidebar`、`ChatView`、`ActivityPanel`、`FilesView`、`TeamMapPage` 组织 | 沿用 SWA React 工作台；参考侧栏、聊天与可展开观察面板，04负责 | 实际API/身份绑定、任意已核Worker数量、无证据不画协作边、断线恢复与部分失败 |
| 现有人类授权与 `web/src/api/client.ts` | `src/components/ApprovalCard.tsx` 的所在位置仅作入口索引 | 审批交互参考由04按实际源文件继续核；批准由原SWA后端裁定 | 浏览器不保存模型密钥，不签发执行Grant，不显示未支持审批按钮为可用 |
| `scripts/build-swa-package.mjs`、`build-swa-runtime.mjs`、`build-swa-native.mjs`、`install-swa.ps1` | `package.json`/Electron相关文件仅为产品形态背景 | 改造SWA CLI候选与组合候选，05负责；不引入Electron前置 | 准确源码、依赖/许可、ABI、仓库外安装、同服务资产、所属退出 |
| `tests/swa-cli-headless/installed-flow.mjs`、`public-case.mjs` 和既有生命周期检查 | `server/headless/run.ts` 中完整job观察方式 | 原历史两席证据保持；06另写可配置N的真实验收 | 同安装N=3真实重叠、指定停止、其余继续、同session输入、真实成果与跨入口一致性 |

上述参考中，已完整读取 `docs/headless-cli.md`、`server/headless/client.ts`、`run.ts`、`output.ts`、`export.ts`、`src/App.tsx` 与 `LICENSING.md`。索引列中的其他组件/engine文件仅核路径存在，由实际采用者读取其内容；不把路径存在等同于已审实现或已运行。

## 许可与排除范围

固定提交的 [LICENSING.md](https://github.com/songconmaisaix31-design/OpenMausBot/blob/dbb73a73ae2cba48fdf608e9e22d1d5d91608532/LICENSING.md) 说明：`enterprise/` 是另有许可的 source-available 范围，不属于 Apache-2.0；其他源码沿 [LICENSE](https://github.com/songconmaisaix31-design/OpenMausBot/blob/dbb73a73ae2cba48fdf608e9e22d1d5d91608532/LICENSE)。本轮不采用 enterprise 实现，不通过删除付费层绕过已配置的认证主体。

OpenMausBot/MausBot 名称和吉祥物为其权利人的商标；SWA 使用自身品牌。第三方软件保留各自许可，实际复制任何源码或资产前须继续核该文件及其 `NOTICE`/`third_party` 来源，由05收集必要许可与声明。当前只参考结构和交互，不把 Apache-2.0 概括成全仓、全部资产均可任意复制。

上传的 `Grok-Bot-0.75.0-REPORT.md` 为静态分析材料。附件给出的 SHA-256 为 `ca3f3b1366f5b9d1ad6215dc6c32f427f7e90d106252d7eb655c2f9aaf491377`；其内容不作为闭源发行包代码许可、动态测试通过或本次新权限授权。本轮不移植闭源代码、付费认证、云电脑、语音或连接器市场。

## Linux与Codex后继来源

以下是基线之后的实际源码或固定官方来源，与上表的`6195f4cf`来源范围分开。实现、接口计划和动态结果各按对应验证条件记录。

| 来源 | 采用方式与归属 | 已有证据及后继条件 |
| --- | --- | --- |
| `cmd/swa/process_linux.go`、`service_ownership.go`；Orca `daemon/swa-service-job.ts`、`swa-linux-process-identity.ts` | 02/03复用原daemon与真实Linux proc/pidfd/subreaper，保持平台身份联合 | `e14800c1`真实安装服务/daemon/health、正常stdin关闭0；原始ticks/UID/boot身份不能冒充Win32创建时间，每Worker D另验 |
| `runtime/swa-orca/src/linux-provider-bootstrap.ts`；Orca `provider-process/swa-linux-provider-process-tree.ts`、`native/swa-provider-process-linux.h`及node-pty补丁 | 02实现每Worker引导器/内核API，05负责固定补丁/产物与API probe；不增加调度器 | `6890522e`组合安装D普通进程14项通过，11项使用装内原件、3项同SHA诊断；真实subreaper、精确pidfd、两次ECHILD、父确认与wrapper退出不替代Agent账号/模型验收 |
| 官方Codex `rust-v0.163.0` / `83086188ae0614bd882818ff1aa23f3194962012` 的 `config/src/config_toml.rs`、`model-provider/src/provider.rs`、`models-manager/src/manager.rs`、`models-manager/models.json` | 只读核正式启动目录及实际模型来源；保持未修改完整catalog与真实provider，不复制账号或篡改模型字段 | 完整catalog blob/SHA256及metadata04实际源门已核，准确范围见[矩阵](02-agent-matrix.md)；目录源不等同ToolsOff授权上界 |
| 同提交 `app-server-protocol/src/protocol/v2/thread.rs`、`core/src/tools/spec_plan.rs`、`core/src/tools/mod.rs`、`ext/extension-api/src/tool_policy.rs`及实际扩展 | 01/02与专题逐源核环境、工具和公开协议；源文件均在`codex-rs/`下 | 空环境语义明确；模型声明、各扩展及启动前副作用仍独立核验，无公开JSON通用ToolPolicy注入或pre-turn有效工具全集；不以metadata替代线程/模型实测 |
| SWA `runtime/swa-orca/src/native-pi-policy.ts`的`nativeConfigurationSource`及`codex-session-result.ts` | Codex只读成果消费者复用已有文件身份/版本形状；完整原文与必填内部导出核验 | 独立reader严格编译与真实文件负向已审；原会话/模型/父层进程及真实正向成果仍待接线和验收，不创造公共字段 |
| 同一官方Codex提交的`codex-rs/cli/src/login.rs`、`login/src/auth/manager.rs`、`login/src/auth/storage.rs` | 02后继复用官方stdin API-key登录与各Worker私有HOME；只读来源参考，不复制原ChatGPT账号 | 显式独立API-key source和新增认证/base URL门仍待实际验证；登录存储不证明远程认证或模型权限 |
| 已安装`@anthropic-ai/claude-agent-sdk@0.3.284`的`sdk.d.ts/sdk.mjs`与官方Claude Code固定`8364969e9f5234ef3d9743cf7c790e9aab0ac3b1/CHANGELOG.md` | 04只读核准，02后继复用真实CLI/SDK桥的bare/API-key与空工具参数；用户CLI不从SDK声明推定 | 官方Linux x64 CLI2.1.284的完整SSRI/二进制SHA与真实version/help已核；full startup、账号、逐轮init、原始事件/完整会话及所属退出仍未验。准确规划见[矩阵](02-agent-matrix.md)，不新增HTTP认证动作 |

Codex源代码的读取与引用保持官方[Apache-2.0 LICENSE](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/LICENSE)和[NOTICE](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/NOTICE)边界；当前为源码参考及完整官方模型目录核验，不表示第三方依赖许可或品牌权利一并授予。实际随包复制的文件仍由05逐项记录来源及许可。
