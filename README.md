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

GUI 的角色选择保存准确版本，讨论追加只保存要求；向实际 Worker 追加模型输入使用独立发送操作，并按当前项目的人类权限重新授权。声明支持、已安装、配置、认证、能启动和真实执行结果分别显示，未知状态不会解释为成功。

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

默认开发页面为 `http://127.0.0.1:5173/swarm`，API 为 `http://127.0.0.1:8787`。用 `SWA_PORT`、`SWA_WEB_PORT` 明确修改端口；开发脚本把实际 Vite 地址传给服务的同源校验。`pnpm dev --ephemeral` 使用本次独立数据目录，停止后保留原件；普通开发使用 `.verification/swa-dev-data`，可通过绝对路径 `SWA_DATA_DIR` 指定专用目录。

PowerShell 配置示例：

```powershell
$env:SWA_DATA_DIR = Join-Path $env:LOCALAPPDATA 'SWA/development'
$env:SWA_PORT = '8787'
$env:SWA_WEB_PORT = '5173'
pnpm dev
```

按 Ctrl+C 请求关闭本次 API 与 Vite；关闭浏览器不停止后台。开发入口不自动配置模型、签发项目 Agent Grant 或调用原生模型。真实 Worker 验收使用按 CLI 文档安装和授权的服务。

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

`pnpm build` 生成 `dist/swa`、`dist/swa-server`（Windows 带 `.exe`）及 `web/dist`。前端从独立 SWA 入口与 public 目录构建，`.vite/swa-modules.json` 记录实际模块；资料、认知与旧作品页面进入构建时直接失败。`pnpm start` 在同一 API 端口提供网页，默认任务入口为 `http://127.0.0.1:8787/swarm`；数据默认位于 `.verification/swa-local-data`，可用 `SWA_DATA_DIR` 修改，静态目录可用 `SWA_WEB_DIR` 明确指定。

上述本地开发构建不替代发行安装包。固定 Node、私有 Orca 原生依赖和两种发行形态由 `pnpm build:swa` 及相应平台脚本构建，所需明确输入、安装边界和实际剩余限制见 [CLI 使用说明](runtime/swa-orca/USAGE.md)。

`pnpm check` 运行 SWA 当前入口、项目权限、Run/Worker、同源传输、角色和实际 SQLite 规则；`pnpm check:race` 在同一 Go 检查范围运行竞争检测。默认 Web 测试同样只选择 SWA 的真实接口与状态规则。需要已安装运行时、真实模型、历史 Relay 事件来源的检查保留独立验收入口，不因默认检查通过而视为已经运行。资料提取工具随 Attention Mirror 管理，SWA 默认安装不依赖 summarize。

保留的旧工作台、资料提取与混合服务检查脚本见[历史脚本与当前入口](scripts/LEGACY.md)。复现时使用完整保存点与独立目录；本轮产品检查不代表正式科研实验已经重新运行。

浏览器验收使用独立 SWA 服务、SQLite 与端口，默认配置为 `web/e2e/swa-workspace.config.ts`。无截图；失败 trace 与报告保留在 `web/test-results`、`web/playwright-report`。安装浏览器时保留其他项目版本：

```sh
PLAYWRIGHT_SKIP_BROWSER_GC=1 pnpm --dir web exec playwright install chromium
```

PowerShell 使用 `$env:PLAYWRIGHT_SKIP_BROWSER_GC = '1'` 后执行相同安装命令。已有 Chromium 可通过绝对路径 `ASTROCYTE_TEST_BROWSER_EXECUTABLE` 显式选择。

## 数据与权限

项目登记、许可、Grant、短期 token 与 Run 关联使用 SWA 私有数据根下的 `workspace/state.sqlite`；原生运行记录继续由私有 Orca 管理。不同产品的数据目录独立，不把旧数据库自动迁入新产品或授予新权限。

浏览器通过同源人类会话访问 API，写命令携带 CSRF 与稳定请求 ID；服务每次核查当前项目、主体、目录、动作和模型。Agent token 只用于对应项目，不能修改人类许可或签发新授权。凭据不写入日志、成果或浏览器持久存储。

[OpenAPI](contracts/openapi.yaml) 与 [SWA 契约](contracts/swa-cli.schema.json) 定义公开边界。前端使用生成类型和中立 [HTTP 传输](web/src/api/transport.ts)，任务状态沿原生 Run/Task/Dispatch，不另建调度器或完成状态库。未知发送、缺失成果和未完成资源释放继续显示实际状态。
