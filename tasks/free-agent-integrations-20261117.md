# 本机有免费额度的 Agent 接入

基线：工作台草稿 PR [#18](https://github.com/songconmaisaix31-design/swarm-anything/pull/18) 的 `a790ba51cf501332fe90952e467602f09433c252`。范围为 `internal/adapters/agentcli`、`cmd/swarm`、现有桌面清单及本文；运行仍由 `cmd/swa` 负责。

后继：[本机真实验收](free-agent-live-acceptance-20261117.md)新增空白会话、Tabbit 公共页和 WorkBuddy 官方在线测试，并记录官方 TRAE CLI 的账号要求。

## 当前入口

| 本机接入 | 命令 | 额度边界 |
| --- | --- | --- |
| Qoder 国际版 `qoder` / 中国版 `qoder-cn` | `swarm agents connect qoder --project <绝对路径> --json`，中国版改用 `qoder-cn`。分开查找 `qodercli` / `qoder` 与 `qoderclicn` / `qodercn`，均使用 `--acp`。 | [国际版活动](https://docs.qoder.com/zh/events/100credits)的桌面领取与 [CLI /usage](https://docs.qoder.com/cli/usage)分开；活动适用范围不推及中国版，也不推定余额抵扣某次 Run。 |
| TRAE CN `trae` | `swarm agents connect trae --project <绝对路径> --json`，用 [CLI 2 官方 ACP](https://docs.trae.cn/cli_agent-client-protocol)的 `traecli acp serve`。 | [客户端计费文档](https://docs.trae.cn/ide_plans-and-billing)说明头像菜单签到；IDE 权益与 CLI 登录须分别核实。 |
| WorkBuddy 桌面 / CodeBuddy Code | 桌面单列为待验证。正式安装的 CodeBuddy Code 可用 `swarm agents connect codebuddy --project <绝对路径> --json` 发起 [官方 ACP](https://www.codebuddy.cn/docs/cli/acp)。 | [官方国内定价](https://www.workbuddy.cn/docs/workbuddy/Pricing)说明同一账号共享积分；仍需各自完成登录。WorkBuddy [开放平台](https://open.workbuddy.cn/docs/third-party-app)的应用审核、OAuth 和本地助理消息另行接入。 |
| Tabbit `tabbit` | `swarm agents diagnose tabbit --json`，或在桌面点击「诊断浏览器工具」。复用[官方 launcher](https://go.tabbit.com/blog/tabbit-cli-complete-guide)，只调用 `diagnose`，不记录原始输出。 | 浏览器工具与内置浏览器 AI 是不同入口。诊断成功只说明该命令正常退出，不证明网页任务、登录或第三方模型额度可用。 |

`swarm agents list --json` 只检查本机路径；`--probe` 只检查适用的版本与帮助。ACP 检查只发 `initialize`，不创建会话，客户端发起权限请求时取消。桌面、CLI 或缓存额度都不会扩大项目启动许可。

`swarm agents quota <qoder|qoder-cn|trae|workbuddy> --magpie-port <端口> --json` 可选读取已运行的 [Magpie 本机缓存](https://github.com/yetone/magpie/blob/main/docs/reference.md)。不刷新供应商、不要求凭据，不通过同一机器上的其他账号反推当前 Job。缺失、不可识别或过时的额度均不能作为免费执行凭证；不存在可核实的适配时保留官方入口。

## 借鉴与停止点

- [Multica #4724](https://github.com/multica-ai/multica/pull/4724) 合并了 TRAE 的共同 ACP 传输，[#4912](https://github.com/multica-ai/multica/pull/4912) 修复 Qoder CN 误用另一个 Provider 的启动参数。这里共用现有传输，保持地区与可执行文件分开，沿用权限请求取消。
- [T3 #23552](https://github.com/pingdotgg/t3code/issues/23552) 报告 TRAE ACP 续接时权限回调使会话卡住；[#23586](https://github.com/pingdotgg/t3code/pull/23586) 仍待合并，记录晚到的恢复响应。真实续接要等原会话的实际响应，不根据握手或界面状态标可用。
- [Codex Host #533](https://github.com/BytePioneer-AI/codex-host/pull/533) 的合并修复说明 WorkBuddy 内置 CLI 与独立账号的登录路径有差异；[#7934](https://github.com/multica-ai/multica/pull/7934) 是仍待合并的另一条接入路径。本次不接触桌面私有凭据。
- [Tabbit 上游 #30](https://github.com/Tabbit-Browser/dsh-tabbit/pull/30) 修复 Windows 本地化安装检测。这里直接定位官方稳定用户目录，避免依赖安装显示名。之后网页任务的退出条件是同一原请求的收据；任务标签隔开，浏览器 Profile 登录态仍共享。

后续进入 `swa run` 的条件：从实际已登录安装发出授权公开项目的一次固定任务，通过正式 Run 得到输出、停止及原请求查询证据；随后验证精确的原会话续接或明确交接。项目工具权限未获证据时保持关闭。对 Tabbit，则用官方无账号练习页验证一次有名字的浏览器任务、原收据和任务资源清理。自动领取额度也需单独核实官方接口、账号授权和原收据。

## 本次验证

- Linux 独立目录内安装并运行官方 npm 版 `@qoder-ai/qodercli@1.1.90` 和 `@tencent-ai/codebuddy-code@2.184.0`；包安装禁用生命周期脚本。用空用户目录和空项目执行 `swarm agents connect … --json`，两者均返回 ACP v1 的 `initialize` 响应。没有登录、调用模型、发起会话或领取额度。
- `go test ./internal/adapters/agentcli ./cmd/swarm ./internal/adapters/swahttp -count=1` 通过；额外回归验证额度上限不能单独推导出 100% 余量。额度测试使用本机回环替身；Tabbit 测试使用进程替身，检查只执行诊断、原始输出没有进入返回。
- Windows amd64 CLI 交叉编译、Go 架构检查、桌面 JS 语法检查通过。未运行实际 Windows 桌面。TRAE 官方安装文件在本环境返回 403，未核实真机握手；Qoder 中国版、WorkBuddy 桌面、Tabbit Browser 和 Magpie 官方进程及账户未运行。
