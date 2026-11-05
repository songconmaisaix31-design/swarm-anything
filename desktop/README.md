# Swarm 桌面端

桌面端直接调用同版本的 `swarm`。主窗口可查看本地 Agent 清单、主动探测版本和帮助、选择项目目录及验证 ACP 握手。已发现的 CLI、账号配置和启动结果分别显示。握手结果仅代表通信协议可用。

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
