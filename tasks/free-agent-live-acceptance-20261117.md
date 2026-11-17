# 免费额度 Agent 的本机真实验收

基线：候选 [#19](https://github.com/songconmaisaix31-design/swarm-anything/pull/19) 的 `5da2a04322993776410536b02076d7ff556f85c2`。本轮只扩展官方连接验收及可重复的证据收集；正式 Run、项目授权、过程回执及执行仍由 `swa` 持有。

## 验收层级

| 层级 | 软件入口 | 通过依据 |
| --- | --- | --- |
| 安装及协议 | `swarm agents list` / `connect` | 真实 CLI 返回支持的 ACP 版本；不会从配置推断账号或运行状态。 |
| 空白会话 | `swarm agents verify qoder --scratch ABS_OUTSIDE_GIT --reload --json` | `session/new` 返回新会话，`--reload` 可在另一个进程对该 ID 发送 `session/load`，两步单独记结果。只接触本次新建会话，不发提示词。 |
| 供应商真实单轮 | `tests/swa-free-agents/README.md` 中的显式模型测试 | 登录后在空白工作目录发固定无敏感文本，只验证原生会话上同一轮的短响应。不会证明 SWA 已准许该 Agent 成为 Worker。 |
| SWA 正式任务 | `node tests/swa-free-agents/live.mjs` 的 `--allow-model` | 只有同版本网关实际提供项目许可和精确模型的 start 能力，才在固定公开提交运行；按原请求、同一 Run/Task/Dispatch 和运行时接收会话核对最终结果，不把它当作供应商续接凭证。 |
| Tabbit 浏览器 | `swarm agents verify tabbit --json` | 官方 launcher 在一个全新的任务中访问官方公开演练页，验证点击前后的 DOM、查询原请求回执并只清理本任务新开的标签页。诊断退出和真实浏览任务分别记录。 |
| WorkBuddy 桌面 | `swarm agents verify workbuddy --json` | 从环境读取已获授权的 `SWA_WORKBUDDY_ACCESS_TOKEN`，仅向 [官方状态接口](https://open.workbuddy.cn/docs/openapi) 发一次只读 GET；无令牌不发送请求，不发助理消息。桌面登录态不能替代第三方 OAuth 令牌。 |
| 额度 | `swarm agents quota … --magpie-port PORT --json` | 官方 Magpie 已缓存接口可达、缓存有实际账号额度分别报告；缓存不绑定某次 Run，不触发签到。 |

安装、OAuth 和账户操作都由本机用户完成。诊断进程不会接收 SWA 的其他凭据。空白会话允许供应商客户端在其自己的账户目录保留测试记录；项目临时目录仅尝试移除本次创建的空文件夹。ACP 权限请求保持拒绝；客户端协议声明不等于沙箱或工具禁用的真实证明。

[TRAE CLI 2.0 官方说明](https://docs.trae.cn/cli_about-trae-code-cli-2)限定企业旗舰版才可使用。免费 IDE 额度无法当作 TRAE CLI 的通行证，不会替换为另一套同名 BYOK 工具。

## 实际执行

- Linux：官方 `@qoder-ai/qodercli@1.1.90`、`@qodercn-ai/qoderclicn@1.1.90`、`@tencent-ai/codebuddy-code@2.184.0` 三个实际客户端在空账户下都返回 ACP v1；本次 `session/new` 都收到 `-32000`（要求登录）；`session/load` 未尝试，测试目录为空并已清理。没有做账号登录或发送提示词。
- 官方 Magpie Linux CLI `0.1.4349`（发行文件 SHA-256 `9e87b9f504a5e393d3d3e024f1e7a587a094e6f4315ddb464099e536733807dc`）用空配置启动回环服务，真实缓存返回空列表。SWA 显示 `unknown`。没有刷新厂商额度或执行签到。
- 官方 Tabbit 演练页实际 HTTP 响应中核到了页面及来源 ID `DEMO-F08`。没有安装运行浏览器；仅在 Go 协议替身上验了固定请求、相关回执及清理拒绝。WorkBuddy GET 的路径、权限和失败路径在传输替身中验证，没有提交真实令牌。

详见[本机命令和报告格式](../tests/swa-free-agents/README.md)。下一阶段把一个经真实登录、单轮、工具拒绝及进程停止验证的 Agent 接入现有 Native launch 准入。先做 Qoder，保留其实际过程和结果收据；TRAE、CodeBuddy 和 WorkBuddy 各自以精确产品、授权、可用动作验证结果为准。没有原生结果来源及进程归属的 Adapter 不提高启动能力状态。
