# SWA（Swarm Anything）

SWA 是管理本机 Agent 的工作台。把一个目录登记为项目，批准它能用的 Agent 和操作，启动一项任务，再查看 Worker、任务关系、交接和已有成果。任务和权限留在本机服务中；关闭网页不会停止后台任务。

| 入口 | 用途 |
| --- | --- |
| **Web 工作台** | 在项目侧栏切换项目，管理授权、角色和提示词，在同一个 Run 查看任务图、Worker 与交付。 |
| **`swa`** | 通过已授权的项目提交、等待、查询或导出 Run。它与 Web 共用执行状态和项目权限。 |
| **`swarm` / 桌面端** | 发现本机 Agent，核对版本或显式发起 ACP 握手。发现、连接与正式执行分别验证。 |

## Windows 和 Linux：先打开工作台

在源码目录使用 Node **24.16.0**、pnpm **11.27.0**、Go **1.27.2**。Windows 用 PowerShell，Linux 用本机终端。第一次安装项目依赖需要联网；以下工作台启动和清单验证无需 Agent 账号或模型密钥。

```sh
go mod download
pnpm --filter swarm-anything --filter @swa/web --filter @swa/orca-runtime --filter @orca/process-host install --frozen-lockfile
pnpm build
pnpm start
```

打开 [http://127.0.0.1:8787/swarm](http://127.0.0.1:8787/swarm)，用「项目与权限」登记一个本机目录，再回到工作台选择它。没有配置原生执行服务时，仍可打开界面、管理项目和授权；此时任务启动不可用。按 Ctrl+C 关闭本次服务。

- `pnpm build` 生成 `dist/swa-server`、`dist/swa`、`dist/swarm` 和 `web/dist`；Windows 的三个二进制都带 `.exe`。
- `pnpm start` 默认使用 `.verification/swa-local-data`。用 `SWA_DATA_DIR` 指定独立的绝对数据路径，用 `SWA_PORT` 修改端口。Windows 与 WSL 各自登记目录、保留独立数据。
- 核对本机客户端清单：Linux 运行 `./dist/swarm agents list --json`；Windows 运行 `./dist/swarm.exe agents list --json`。不带 `--probe` 时只做发现，不启动供应商 CLI。桌面程序的构建和用法见[桌面端说明](desktop/README.md)。

## 不用真实账号验收

```sh
pnpm build
pnpm test:product
```

该检查启动刚构建的服务和工作台，验证 HTTP、项目和权限、本机 Agent 清单、无原生执行服务时的拒绝行为，以及临时数据目录中的重启持久性。不会调用模型、登录供应商或签到。Windows 和 Linux 独立运行这些用例及真实浏览器检查，见[产品验收工作流](.github/workflows/product-smoke.yml)；底层规则见[基础检查](.github/workflows/check.yml)。

真正的原生发行包使用 `pnpm build:swa`，与上面的源码预览分开。安装包、私有数据目录、Windows ACL、Linux 进程要求和启动命令见 [CLI 安装与运行说明](runtime/swa-orca/USAGE.md)。

## 启动正式任务

1. 按 [CLI 安装与运行说明](runtime/swa-orca/USAGE.md) 配置私有原生服务，以及当前版本支持的 Agent、账号来源和模型。
2. 在工作台登记目录，明确批准可访问的文件、动作和模型；提交任务或用原回执连接已启动的 Run。
3. 用同一个 Run 查看任务图、Worker 和交付。CLI 对应 `swa run`、`swa wait`、`swa export`。等待中断后用原请求或 Run 查询；结果未知时不要用新请求 ID 重新启动。

Pi、Codex、Claude 与 OpenCode 的受控运行受版本、账号来源和权限限制。[本机适配清单](tasks/adapter-catalog-t3-workbench-20261117.md)里的其他客户端可能只支持发现、ACP 握手或浏览器诊断。模型续接、额度余额和执行完成均需各自的证据；Run 完成不等于用户已经验收交付。

## 维护入口

- [当前验证与缺口](STATUS.md) · [贡献方式](CONTRIBUTING.md) · [开发规格](docs/SPEC.md)
- [HTTP 契约](contracts/openapi.yaml) · [CLI 契约](contracts/swa-cli.schema.json) · [独立插件边界](docs/PLUGIN_CONTRACTS.md)
