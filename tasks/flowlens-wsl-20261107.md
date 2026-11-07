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

## HUD 与上游同步时的启动观察

`live-1794035798373` 已有真实签名 user 行与 DeepSeek HTTP 200，首个 ACP 输出迟于原启动观察期限。原输入观察器只由 ACP notification 唤醒，导致 `turn_start_unobserved`。原失败和清理记录保留。

输入策略在已有身份、correlation、sequence、session、模型与工具检查通过的 `http_request` 后唤醒现有观察器；`accept()` 继续使用原有 SQLite 唯一行、签名回执和原始输入核对。HTTP 本身不产生 accepted。启动期限和接受条件保持原有合同。

源码 `7cde18b131577c3742e7d1d983a2c279521c5051` 完整 Linux 构建通过，安装到全新私有目录 `install-opencode-readiness-final`。最终实际运行 `live-1794039302390` 在 2026-11-07 08:15:02–08:16:58 UTC 完成 15 项检查，涵盖真实能力发现、官方图标映射、配对、HUD 原生呈现、两轮真实模型完成、成果导出、HTTP 重复与冲突处理、完整启动入口恢复、原 Worker 核对与指定停止、处理中存档查询原停止回执、透明任务列表呈现、正式释放关闭。完成结果呈现 revision 62；服务与两个启动入口退出 0，单独 HUD 预期 SIGINT 退出 130。

| 操作 | Run | Root Task | Worker Task | Dispatch | 原生 session | 终态 |
|---|---|---|---|---|---|---|
| 首次任务 | `run_241e8e55ef54` | `task_c5d23342ebf4` | `task_3308c6f78bbe` | `ctx_d71c31878c4f` | `ses_e4aec3de7ffePOdQjSxOUpQlC1` | succeeded |
| 同会话接续 | `run_bbaa0df67d76` | `task_f3a8c189b6ed` | `task_b6d71d70326f` | `ctx_8a0f1deddb12` | `ses_e4aebdc2affe7p0ocaLkT9lK3M` | succeeded |
| 指定停止 | `run_d7b9113dbcc6` | `task_9d8479073fd6` | `task_29bc6059c465` | `ctx_988e1d862f06` | `ses_e4aeb297fffey6pV2sC2d3Zs9L` | interrupted |

三轮原生 HTTP 请求均返回 200，模型为 `deepseek-v4-pro`、`tools_count=0`，ACP 工具事件均为 0。第三轮停止前 FlowLens 为 unknown，真实查询确认原 Worker 为 ready/live/exactWorker/addressable，停止后原 turn 的 stopRequested 为 true。三项资源均 released，无释放错误，前两轮成果归档已捕获。

FlowLens 源码 `f9e000d2733d0cc82e9fcb06d8bf8526c6556c06` 在原生停止回执确认时同步保存 stopRequested；request.show 按 controller/project 二选一传参，项目路由和授权继续由 SWA_PROJECT_ID / SWA_PROJECT_TOKEN 提供。驱动捕获生产操作实际 pending 存档原文，独立生产 SwarmRPC 从该原样存档查询原请求 `387b57ef-9776-46cf-a058-79c4fd243262`；真实 SQLite 为 completed/native.stopped，恢复存档操作为 confirmed，原 Dispatch 保持 `ctx_988e1d862f06`，终态为 interrupted。没有重放输入、再次提交停止或创建替代 Worker。

| 原生 session | user seq6 | assistant seq7 | idle |
|---|---|---|---|
| `ses_e4aec3de7ffePOdQjSxOUpQlC1` | `msg_1b513c87a001IrIJCKbpfKY101` | `msg_1b513c89c0015KB7nedbJF8hFY` | seq14 `msg_1b513ed2e0011RH8D0tK4SXAmW` |
| `ses_e4aebdc2affe7p0ocaLkT9lK3M` | `msg_1b5142a81001uKPdOFyZ2wwtZ1` | `msg_1b5142aa40013KM32rCqQKxUBP` | seq14 `msg_1b5148348001DqWV3rJSVUqR4F` |
| `ses_e4aeb297fffey6pV2sC2d3Zs9L` | `msg_1b514dcae0013yEIjqijM6N4fp` | `msg_1b514dcd2001FbK8ICXc67BLu2` | seq12 `msg_1b514ebcc001t44ldyLaCPTUHO` |

各消息 ID 已逐项定位到对应原生 SQLite 的 session_message 表。三个 event 表均为空，输出 event_id 字段计数为 0。Codex 精确会话 `01a1b513-6af2-7711-886a-41f2cafc736a` 共三轮 `gpt-6-luna` / low，三次选择 opencode，实际工具调用 0。SDK 图片、资源与纹理拒绝计数为 0。

native oxlint 1.88.0 对两个修改过的 vendor 文件仍有 31 条诊断：3 条 consistent-type-imports、27 条 curly、1 条 max-lines。前 30 条对应的源码行与基线 `365fe3d9` 完全相同；当前有效行数 330，新增 5 行，基线推算 325，同样超过 300。没有单独重跑基线 lint，未修改规则或隐藏诊断。运行类型检查、构建和实际链路通过，完整 native lint 尚未通过。
