# Morphogenesis 工具桥

用户要求补齐工具桥并验证可用，用于 OSChina「Morphogenesis 零中心调度开源科研 Agent 蜂群」交件。开发只增加直接支撑调用、运行、结果取得和排错的功能。

分支 `codex/morph-tool-bridge-20261029`，基线 `733ee08fb694fe8d8719693ca6b6e05432e005b2`。接口见 SPEC §21.6。实现 Worker 负责 CLI、Go 调用、Pi 固定扩展、原生消息解析、安装产物及必要测试；独立 Reviewer 检查绑定配置、调用与退出。环境 Worker 准备指定工具链和安装构建。主控维护本页、SPEC、STATUS、HANDOFF。

Morphogenesis 配套准备脚本复用已有 NIST 案例和 HostConfig，生成三角色桥配置；不新增调度器、预算账本或通用 MCP 插件平台。其源码位于独立 Morphogenesis 仓库。

验收按真实结果记录：参数与原生协议检查、真实 MCP 跨进程调用、完整构建和安装入口。原生 Pi 模型会话需可用独立账号与实际项目授权。当前环境尚无这两项，不复用开发工具的内部登录凭据。

## 实现与检查

CLI 的 `--morph-config` 经 Go 准入传至 Pi 固定扩展，原生消息及结果导出保留工具调用。项目设置提供两工具的联动许可，run/start 与原生准入复用现有 Grant、目录范围、设置版本及外部 CLI 校验。已启动会话的工具停止通过停止对应 Worker 完成。

| 检查 | 结果 |
| --- | --- |
| `pnpm typecheck:swa` 等价完整 tsc 命令 | PASS |
| `node --test tests/swa-cli-headless/morph-config-contract.test.mjs tests/swa-cli-headless/pi-morph-bridge.test.mjs` | 8 passed |
| delegation-contract、pi-final-block、pi-input-turn 原回归 | 12 passed |
| `go test ./internal/workspace/app -count=1` | PASS，包含实际 SQLite 权限变更检查 |
| `go test ./cmd/swa ./internal/workspace/app -run Morph -count=1` | PASS |
| 完整 CLI 检查 | `TestLinuxServiceRealProcessTree` 因当前 PID namespace 与 `/proc` 不一致失败；其余检查通过 |
| `node scripts/validate-examples.mjs` | 264 个示例通过；生成的 Web API 类型已同步 |
| ProjectSettingsForm 原有相关检查、Web tsc | 3 passed；类型通过 |
| 固定扩展 → 官方 MCP SDK → Morph Python 子进程 | 23 工具、任务发现、author 认领/释放、MCP 错误保留、所属进程退出及关闭后不重连均通过 |

真实 stdio 检查使用受控 Pi 会话入口，未替换 MCP Client 或 transport；原始结果为本机 `swa-toolchain/bridge-check-20261029-v2/source-mutation-result.json`。此检查没有调用模型。独立审查发现的跨项目配置、项目工具许可和 Linux ESM 加载问题均已修复并复验。

完整候选构建、安装与服务检查将在本次源码提交后执行，尚无通过结论。真实 Pi 模型会话及 OpenSandbox 三角色科研流程未运行。
