# SWA（Swarm Anything）

SWA 通过现有 Agent CLI 执行任务，复用同一个 Run、Task 与 Dispatch 后端。一次提交后，CLI 与 GUI 可以观察递归任务、阻塞问题、实际交接和成果；长期角色与讨论独立于 Worker 进程保存。

当前工作包括独立产品拆分、完整 Run 入口和 N=4/N=6 真实验收。代码、局部检查与实际模型验收分别记录，最新结果见 [STATUS](STATUS.md) 和[本轮任务](tasks/swa-evolution-20261023.md)。Windows x64 与 Linux x64 的安装、真实执行及正常退出需要各自证据。

## 产品范围

本仓默认开发、构建与启动 SWA。网页仅提供“任务与交付”和“项目与权限”，使用同一项目授权与原生运行记录。独立服务入口为 `cmd/swa-server`，命令入口为 `cmd/swa`；开发服务未配置已安装原生运行时时，任务命令明确报告不可用。

Astrocyte 的认知事件、知识、经验、MCP 与 Sleep，以及 Attention Mirror 的资料、沉淀、品味与机会，分别保全到独立本地仓库。目前路径为 `/workspace/astrocyte`、`/workspace/attention-mirror`，尚未提供远端仓库地址。拆分进展、来源与保全范围见[产品拆分记录](tasks/swa-product-separation-20261023.md)。旧产品源码只在完成保全后清理，原数据与验证记录继续保留。

接管先读 [HANDOFF](HANDOFF.md)、[AGENTS](AGENTS.md) 和[文档目录](docs/README.md)。仓库为 `songconmaisaix31-design/swarm-anything`，默认分支 `main`；当前实现与剩余限制以任务记录为准。

## 完整任务 CLI

安装、私有服务、当前项目 Grant 和具体文件格式见 [CLI 使用说明](runtime/swa-orca/USAGE.md)。以下变量必须来自当前项目与真实回执：

```sh
swa run --project "$project_id" --workdir "$project_root" \
  --spec-file "$task_file" --input-file "$input_file" \
  --agent "$agent" --model "$model" --request-id "$request_id" --strict --json
swa wait --project "$project_id" --controller "$controller" \
  --task "$root_task_id" --run "$run_id" --strict --json
swa export --project "$project_id" --controller "$controller" \
  --task "$root_task_id" --run "$run_id" --output-dir "$new_output_directory" --json
```

首次发送前保存稳定 UUID；未知结果保留原请求并查询，不能换 UUID 重复执行。`wait` 只观察准确的原 Run；超时或取消当前等待后，后台任务继续运行。`--strict` 将任一实际递归子任务失败计入失败。执行完成保留 `acceptance: unreviewed`，等待成功与下载不表示人工已经验收。

普通 `export` 和 GUI 下载交付当前已记录的任务结果，运行中也可以取得已有成果，缺失结果明确标记。需要完整原生会话与日志核验时使用 `export --audit`；两种模式都保留权限、来源归属和凭据保护。

GUI 可选择角色、保存讨论，再向 Worker 发送补充要求。发送时检查当前项目许可。

项目设置可明确许可多个 CLI，并选择一个默认客户端。同一 Run 的 Worker 可分别使用获准的 Pi、Codex、Claude 或 OpenCode；旧项目仍只允许原默认客户端。浏览器按项目保存 Run 连接，刷新后继续观察，忘记连接不会停止后台任务。

## 开发环境

使用 Node **24.16.0**、pnpm **11.27.0**、Go **1.27.2**。依赖使用精确版本，见 `pnpm-lock.yaml`、`go.mod`、`go.sum` 和 [依赖清单](dependencies.lock.json)。脚本通过既有 `ASTROCYTE_GO` 工具链覆盖或 PATH 查找 Go；该工具链变量不选择产品数据。

```sh
node --version
pnpm --version
go version
go mod download
pnpm --filter swarm-anything --filter @swa/web --filter @swa/orca-runtime --filter @orca/process-host install --frozen-lockfile
pnpm dev
```

默认开发页面为 `http://127.0.0.1:5173/swarm`，API 为 `http://127.0.0.1:8787`。用 `SWA_PORT`、`SWA_WEB_PORT` 修改端口。`pnpm dev --ephemeral` 使用独立数据目录；普通开发使用 `.verification/swa-dev-data`，可通过绝对路径 `SWA_DATA_DIR` 指定目录。

PowerShell 配置示例：

```powershell
$env:SWA_DATA_DIR = Join-Path $env:LOCALAPPDATA 'SWA/development'
$env:SWA_PORT = '8787'
$env:SWA_WEB_PORT = '5173'
pnpm dev
```

按 Ctrl+C 关闭本次 API 与 Vite；关闭浏览器不停止后台任务。启动 Worker 前，按 [CLI 使用说明](runtime/swa-orca/USAGE.md)安装运行时、配置模型并设置项目许可。

## 检查与构建

```sh
pnpm generate
pnpm check:contracts
pnpm check:architecture
pnpm check
pnpm check:race
pnpm --dir web typecheck
pnpm --dir web lint
pnpm test:e2e
pnpm build
pnpm start
```

`pnpm build` 生成 `dist/swa`、`dist/swa-server`（Windows 带 `.exe`）及 `web/dist`。`pnpm start` 在 API 端口提供网页，默认任务入口为 `http://127.0.0.1:8787/swarm`；数据默认位于 `.verification/swa-local-data`，可用 `SWA_DATA_DIR` 修改，静态目录可用 `SWA_WEB_DIR` 指定。

`pnpm build:swa` 构建含 Node 和 Orca 原生依赖的安装包，参数见 [CLI 使用说明](runtime/swa-orca/USAGE.md)。Linux 服务要求 `/proc` 挂载在当前 PID namespace 中；容器应使用自己的 proc 挂载。

`pnpm check` 检查项目权限、Run/Worker、HTTP、角色与 SQLite 行为；`pnpm check:race` 运行 Go 竞争检测。原生运行时与模型检查使用 CLI 文档中的独立入口。

旧工作台与资料提取脚本见[历史脚本与当前入口](scripts/LEGACY.md)。

浏览器验收使用独立 SWA 服务、SQLite 与端口，默认配置为 `web/e2e/swa-workspace.config.ts`。无截图；失败 trace 与报告保留在 `web/test-results`、`web/playwright-report`。安装浏览器时保留其他项目版本：

```sh
PLAYWRIGHT_SKIP_BROWSER_GC=1 pnpm --dir web exec playwright install chromium
```

PowerShell 使用 `$env:PLAYWRIGHT_SKIP_BROWSER_GC = '1'` 后执行相同安装命令。已有 Chromium 可通过绝对路径 `ASTROCYTE_TEST_BROWSER_EXECUTABLE` 显式选择。

## 数据与权限

项目登记、许可、Grant、短期 token 与 Run 关联使用 SWA 私有数据根下的 `workspace/state.sqlite`；原生运行记录继续由私有 Orca 管理。不同产品的数据目录独立，不把旧数据库自动迁入新产品或授予新权限。

浏览器通过同源人类会话访问 API，写命令携带 CSRF 与稳定请求 ID；服务每次核查当前项目、主体、目录、动作和模型。Agent token 只用于对应项目，不能修改人类许可或签发新授权。凭据不写入日志、成果或浏览器持久存储。

[OpenAPI](contracts/openapi.yaml) 与 [SWA 契约](contracts/swa-cli.schema.json) 定义公开边界。前端使用生成类型和中立 [HTTP 传输](web/src/api/transport.ts)，任务状态沿原生 Run/Task/Dispatch，不另建调度器或完成状态库。未知发送、缺失成果和未完成资源释放继续显示实际状态。
