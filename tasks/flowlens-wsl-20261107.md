# FlowLens WSL 实际链路

本任务使用公开项目 `songconmaisaix31-design/astrocyte-s3-public-stats@da3bdddb085808863090a05f60cc1c64415039cf`，通过实际 IrisView Linux 模拟器、FlowLens、Codex 0.164.0 路由、SWA HTTP 服务与 OpenCode 2.0.31 / DeepSeek `deepseek-v4-pro` 执行。路由配置关闭原生 shell、MCP、apps 和插件，实际工具调用为 0；OpenCode 原生工具数量为 0。生产修改由主 Agent 单轨完成，两个 Explorer 仅进行只读检查。

真实 SQLite 已定位两处问题：

- 输入 journal 的原生 `providerItemId=orca:<operation_id>` 来自 OpenCode ACP，但执行观察只接受 Pi 的该形式。执行观察现按既有 OpenCode account kind、ACP transport 和同一 operation 识别输入。
- OpenCode context hook 收到官方 `Message` 类实例，`z.record` 和 `structuredClone` 无法保留该类型。插件现通过原消息所属构造器的官方 `make()` 复制需要移除桥接 metadata 的消息，保留原生消息类型及完整字段；原历史不修改。

原失败保留在私有运行目录 `live-1794033133580`。两个问题分别发生在执行状态读取和模型请求前，原任务未完成。

## 实际验证

修复源码 `a5899493b987d22b5d80bfba3f639b45e8c07719` 完整 Linux CLI 构建和新目录安装通过，包含 runtime TypeScript、原生 PTY、watcher 与进程观察检查。构建使用 Node 24.16.0、pnpm 11.27.0、Go 1.27.2，安装内固定 Node 24.21.0。

最终实际运行目录：`/var/lib/flowlens-wsl-20261107/work/live-1794034074548`。11 项检查全部通过：实际授权与发现、电脑桥连接、HTTP 设备配对、原生 HUD 呈现、模型完成、完成 revision 呈现、正式成果导出、HTTP 重复/冲突与接续、完整启动入口重启恢复、运行中指定停止、正式释放与 Controller 关闭。SWA serve 与两个启动入口均退出 0；单独 HUD 收到预期 SIGINT 后退出 130。全部所属进程已退出。

| 操作 | Run | Root Task | Worker Task | Dispatch | FlowLens 终态 |
|---|---|---|---|---|---|
| 首次任务 | `run_a336050c5f45` | `task_be6cf0fe5a20` | `task_dc34522992f3` | `ctx_355034f4d11b` | completed |
| 同会话接续 | `run_dd65fd264da3` | `task_8e5f3a28117c` | `task_4b74b22b7ce0` | `ctx_de37a82fbe08` | completed |
| 指定停止 | `run_13da5fe02fbe` | `task_85e1ffa33c93` | `task_65c2eed8993e` | `ctx_dcee2113d840` | interrupted |

成果导出到批准项目内 `.flowlens-swarm/live-1794034074548-export`。接续由同一 FlowLens 会话保存实际消息后创建独立 Run。重启保留既有 Run、Dispatch、turn 数量与设备授权，重复指令未重新排队。第一轮完成对应实际 `FLOWLENS_PRESENTED` revision 72。

三个原生会话均记录官方 DeepSeek HTTP 请求、HTTP 200、`tools_count=0` 与明确 idle outcome。实际消息 ID 已逐项定位到各原生 SQLite 的 `session_message` 表。`event` 表均为空，输出没有 `event_id` 字段。Codex 三次路由均为 `gpt-6-luna` / low、选择 `opencode`、实际工具调用 0；会话另保留宿主工具声明，不能据此声明注册工具总数为 0。FlowLens 对路由 RPC 执行请求统一拒绝。

本轮仅验证 OpenCode 原生工具关闭的固定公开任务；原生项目工具、其他 Agent、实际眼镜与麦克风语音、macOS、跨设备局域网和原生等待输入仍未验证。Codex 路由通过 WSL 调用已有 Windows 登录，Linux 原生 Codex 账号未配置。

官方消息接口依据：OpenCode `v2.0.31`，commit `22728d67461260d56bb9796b9b8f36e1de47202e` 的 `packages/ai/src/schema/messages.ts`、`packages/plugin/src/promise/session.ts` 与 `packages/core/src/session/model-request.ts`。
