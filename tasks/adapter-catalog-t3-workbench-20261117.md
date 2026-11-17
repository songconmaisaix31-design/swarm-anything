# 本机适配清单与 T3 式工作台

基线：[本机真实验收 #20](https://github.com/songconmaisaix31-design/swarm-anything/pull/20) 的 `11880cf62e48d52b49eefde240161ae06e744bf2`。本轮修改本机发现、验收入口和现有界面；Run 仍走 `swa` 的项目授权、执行、停止和原请求检查。

## 参考与取舍

- [T3 Code 的 ACP 接入](https://github.com/pingdotgg/t3code/blob/f79ab79721e3dc49cf738b7dc840e79282c3eca9/docs/user/providers-acp.md)区分本机可执行文件、注册目录、账号与模型。SWA 延用直接启动本机命令与固定参数，无自动下载或交叉借用账号。T3 支持 ACP v2 预览与 v1；本候选的共同握手仍是 ACP v1。
- [ACP Registry 固定修订](https://github.com/agentclientprotocol/registry/tree/ccec929fcd0d85036cc98e1d5471ae6ed0d0f573)提供已核对的发行入口和参数；[Multica](https://github.com/multica-ai/multica/tree/a86a6c7b24f2bf2dfca637f99127f7a53fa06d9b)已有多个供应商走一个传输的实践。使用各厂商原生 CLI，不随入口增加传输实现或采集厂商凭据。Kimi 与 MiniMax / Antigravity 以各自[官方 Kimi 文档](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-acp)、[MiniMax Code 文档](https://github.com/MiniMax-AI/minimax-code/blob/main/docs/tui-capabilities.md)和 [Antigravity 更新记录](https://github.com/google-antigravity/antigravity-cli/blob/main/CHANGELOG.md)为准。
- 参考 T3 Code 同一 [项目侧栏布局](https://github.com/pingdotgg/t3code/blob/f79ab79721e3dc49cf738b7dc840e79282c3eca9/apps/web/src/components/AppSidebarLayout.tsx) 与 [工作区头部](https://github.com/pingdotgg/t3code/blob/f79ab79721e3dc49cf738b7dc840e79282c3eca9/apps/web/src/components/WorkspacePageHeader.tsx)。SWA 用现有 React、API 和路由实现同类结构，没有搬运上游组件源代码、线程存储或账号服务。

## 本机能力

| CLI | 固定入口 | 当前范围 |
| --- | --- | --- |
| Qwen、Gemini | `qwen --acp`、`gemini --acp` | 官方实际客户端的 ACP v1 握手已通过 |
| Kimi、Cursor Agent、Muse | `kimi acp`、`cursor-agent acp`、`muse acp` | 已核对官方入口并接到握手；账号与运行待验。Cursor 编辑器仍单独发现 |
| Kiro、Goose、Copilot、Cline | `kiro-cli acp --agent-engine=v3`、`goose acp`、`copilot --acp`、`cline --acp` | 已登记固定本机命令；真实客户端待验 |
| Mistral Vibe、Autohand、Junie、MiniMax Code、Antigravity | `vibe-acp`、`autohand --acp`、`junie --acp=true`、`mcode acp`、`agy acp` | 已登记固定本机命令；真实客户端待验 |

使用 `swarm agents list --json` 或桌面清单搜索名称与 ID，选择已安装项并验证连接；CLI 也可显式运行 `swarm agents connect ID --project ABS --json`。本机 Agent 清单不会把条目设为项目可启动。桌面为 Qoder 国际版、中国版、TRAE CN、CodeBuddy 提供已有空白 ACP 会话验收；必须选择仓库外的父目录，创建失败或未尝试重载分别显示。Tabbit 公开网页验收须确认后调用固定样例。WorkBuddy 的账号专用只读状态继续使用原有 CLI，不在桌面接收令牌。已有自定义目录若使用相同 ID，需要把自定义 ID 改成唯一值。

## 界面与验证

- 主工作台使用项目侧栏和紧凑的项目头部；窄屏由同一 URL 参数上的下拉框选择。任务与运行、角色与讨论、Agent 状态分栏，切换保留已输入的表单和原 Run，不新增网关查询、执行或线程存储。桌面本机清单增加搜索、已发现筛选、适配器类型与显式验收。
- 用空用户目录和空项目运行官方 `@qwen-code/qwen-code@0.27.4`、`@google/gemini-cli@0.68.0` 的真实 `swarm agents connect`，均返回带厂商身份的 ACP v1 响应。未登录、创建模型会话或调用模型。
- Go 定向测试覆盖固定 argv、ID 冲突、清单阶段区分与既有授权；Windows CLI 交叉编译和 Web 构建检查通过。浏览器回归新增项目侧栏、键盘切页、未提交输入保留与窄屏选择器检查；本环境阻止 Chromium 启动所需的 socket，浏览器验收未完成。

后续正式执行的通过依据仍是：已授权的精确供应商与模型，在现有 SWA Run 中产生真实结果并核验停止与原请求收据；另取供应商原会话续接证据。账户额度和签到仍由既有官方适配单独验证。
