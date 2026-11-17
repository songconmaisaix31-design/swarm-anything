# SWA · Swarm Anything

**本地 Agent MCP 服务台。** 在一个工作台里发现本机 Agent、按项目授予权限，并跟踪任务和交付。Web 和 CLI 共用同一个本地服务、项目权限和运行状态。

[快速开始](#快速开始) · [工作台](#工作台) · [MCP 与插件](#mcp-与插件) · [双平台验证](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/44051514486)

## 快速开始

当前为[源码预览](https://github.com/songconmaisaix31-design/swarm-anything/tree/codex/product-cleanup-20261117)。Windows 和 Linux 使用 Node **24.16.0**、pnpm **11.27.0**、Go **1.27.2**。从以下分支构建工作台：

```sh
git clone --branch codex/product-cleanup-20261117 --single-branch https://github.com/songconmaisaix31-design/swarm-anything.git
cd swarm-anything
pnpm --filter swarm-anything --filter @swa/web install --frozen-lockfile
pnpm build
pnpm start
```

打开 [http://127.0.0.1:8787/swarm](http://127.0.0.1:8787/swarm)，进入「项目与权限」登记一个本机目录，再回工作台选择它。启动和登记项目无需供应商账号。提交任务需要先[配置原生执行服务](https://github.com/songconmaisaix31-design/swarm-anything/blob/fc01a7b98add98524e1381e841301cd704a4f4e7/runtime/swa-orca/USAGE.md)，并明确批准该项目可用的 Agent、文件范围与操作。

## 工作台

| 区域 | 用途 |
| --- | --- |
| **项目侧栏** | 选择本机项目；窄屏改用项目下拉框。顶部显示当前项目，并提供权限入口。 |
| **任务与运行** | 复用提示词模板、提交任务或连接已有 Run。查看任务图、Worker 状态和交付。 |
| **角色与讨论** | 在当前项目中管理和复用角色，查看关联讨论。 |
| **Agent 状态** | 查看执行服务报告的安装、配置、会话与结果状态。 |

源码构建后，运行 `./dist/swarm agents list --json` 查看本机 Agent 清单（Windows 使用 `./dist/swarm.exe agents list --json`）。发现客户端、验证握手和实际执行是三个独立步骤。配置执行服务后，可用 `swa run`、`swa wait`、`swa export` 操作和查看同一个 Run。

项目侧栏与工作区头部参考 [T3 Code](https://github.com/pingdotgg/t3code)。

## MCP 与插件

MCP 是独立插件的接入方式。SWA 当前保存项目级插件连接配置、授权、引用 ID 和事件收据；插件保有自己的数据与工具。`pnpm start` 提供本地 HTTP 和 Web 工作台，通用 MCP 端点尚未开放。独立插件可调用的工具及授权边界见[插件契约](https://github.com/songconmaisaix31-design/swarm-anything/blob/fc01a7b98add98524e1381e841301cd704a4f4e7/docs/PLUGIN_CONTRACTS.md)。

## 验证与开发

构建后运行 `pnpm test:product`，可在不登录供应商的情况下核对服务启动、项目授权和重启恢复。参见[适配清单](https://github.com/songconmaisaix31-design/swarm-anything/blob/fc01a7b98add98524e1381e841301cd704a4f4e7/tasks/adapter-catalog-t3-workbench-20261117.md)与[贡献指南](CONTRIBUTING.md)。
