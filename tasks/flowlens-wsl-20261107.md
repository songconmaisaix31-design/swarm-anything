# FlowLens WSL 实际链路

本任务使用公开项目 `songconmaisaix31-design/astrocyte-s3-public-stats@da3bdddb085808863090a05f60cc1c64415039cf`，通过实际 IrisView Linux 模拟器、FlowLens、Codex 0.164.0 路由、SWA HTTP 服务与 OpenCode 2.0.31 / DeepSeek `deepseek-v4-pro` 执行。Codex 路由与 OpenCode 原生工具均关闭。生产修改由主 Agent 单轨完成，两个 Explorer 仅进行只读检查。

真实 SQLite 已定位两处问题：

- 输入 journal 的原生 `providerItemId=orca:<operation_id>` 来自 OpenCode ACP，但执行观察只接受 Pi 的该形式。执行观察现按既有 OpenCode account kind、ACP transport 和同一 operation 识别输入。
- OpenCode context hook 收到官方 `Message` 类实例，`z.record` 和 `structuredClone` 无法保留该类型。插件现通过原消息所属构造器的官方 `make()` 复制需要移除桥接 metadata 的消息，保留原生消息类型及完整字段；原历史不修改。

原失败保留在私有运行目录 `live-1794033133580`。两个问题分别发生在执行状态读取和模型请求前，原任务未完成。修复后的完整构建、重新安装与真实链路结果待记录。

官方消息接口依据：OpenCode `v2.0.31`，commit `22728d67461260d56bb9796b9b8f36e1de47202e` 的 `packages/ai/src/schema/messages.ts`、`packages/plugin/src/promise/session.ts` 与 `packages/core/src/session/model-request.ts`。
