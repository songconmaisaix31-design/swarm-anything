# Swarm 桌面端

桌面端直接调用同版本的 `swarm`。主窗口可查看本地 Agent 清单、主动探测版本和帮助、选择项目目录及验证 ACP 握手。已发现的 CLI、账号配置和启动结果分别显示。握手结果仅代表通信协议可用。

Qoder 国际版、中国版、TRAE CN 和 CodeBuddy Code 使用各自的官方 ACP 入口。选择 Tabbit 后可运行浏览器诊断，无需选择项目。WorkBuddy 桌面与可共享国内账号积分的 CodeBuddy Code 分开显示。详见[接入说明](../tasks/free-agent-integrations-20261117.md)。

可按名称或 ID 搜索，或者只看本机发现的条目。在已支持的客户端上，空白会话验收会先要求选择仓库外的父目录；Tabbit 的公开页验收则需确认打开浏览器。可用适配和验证范围见[本机适配清单](../tasks/adapter-catalog-t3-workbench-20261117.md)。

任务执行、项目授权和恢复继续由 `swa` 管理。当前桌面只提供发现和握手，不启动模型任务，也不根据角色卡授予工具权限。

发现范围取决于桌面进程的 `PATH`。如果图形系统从启动器传入的路径与终端不同，可以从配置好 `PATH` 的终端启动桌面端。

在仓库根目录构建 CLI 并启动桌面端。

```sh
mkdir -p dist
go build -o dist/swarm ./cmd/swarm
npm --prefix desktop ci
npm --prefix desktop start
```

Windows 下将 CLI 输出设为 `dist/swarm.exe`。开发环境也可将 `SWA_CLI_PATH` 指向其他绝对路径。

运行 `npm --prefix desktop run package` 生成当前操作系统和 CPU 架构的应用包，输出位于 `desktop/dist/`。打包使用 `dist/` 下同平台的 CLI，随包放入资源目录。打包结果可在具备 Electron 系统依赖的机器上运行。
