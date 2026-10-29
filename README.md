# SWA（Swarm Anything）

SWA 提供可由现有 Agent 或终端调用的 Swarm CLI，目标是发现并调用本机真实注册的 Agent，控制多个 Worker 并获取成果。产品使用独立后台、安装目录和私有运行环境；本机 Orca 的安装、账号、配置及运行进程保持原归属。

当前正在实现[首版 CLI](tasks/swa-cli-v1-20261020.md)，尚无通过验证的安装候选。最终验收须使用安装后的同一候选，运行至少两个真实 Worker，验证并发、指定停止及成果获取。实际检查和剩余限制见 [STATUS](STATUS.md)。用户要求参考 REA 的仓库格式，[来源与目录对应](docs/standards/swa-repository-format-20261021.md)记录已核内容及待确认范围。

本仓库从已接受的 Astrocyte 产品历史接续。已有网页、HTTP、认知 MCP 与 SQLite 数据路径继续使用原程序标识。[META_PLAN](docs/META_PLAN.md) 保留原 v2.1 规划，M2—M6 为后续规划；MCP、网页重构、完整旧 S3 和全部历史分支清理按后续任务处理，旧 S3 保留独立验收记录。最新目标及适用关系见 [QUESTIONS](docs/QUESTIONS.md)。仓库规范名称为 `songconmaisaix31-design/swarm-anything`，默认分支为 `main`；M0 已合入 main。

现有页面连接资料、项目、批准、作品与认知接口。蜂群页显示真实 WorkItem 依赖、来源、授权和停止历史；DAG 按需加载，分块加载失败时显示错误并允许人工重新加载。OpenViking 为可选配置。安装与检查见 [CONTRIBUTING](CONTRIBUTING.md)，接管先读 [HANDOFF](HANDOFF.md)、[AGENTS](AGENTS.md) 和[文档目录](docs/README.md)；已验来源、实际运行观察及失败记录统一见 STATUS 和[交付报告](docs/standards/delivery-candidate-20261020.md)。

## Attention Engine 与作品册

认知内核在现有 Go/SQLite 内提供 Event/Signal、注意力演化、每日 Sleep、知识两层存储、失败经验和 MCP 五操作。知识确认/降级/分享/项目引用、经验批准/降级/分享与冲突裁决通过 [OpenAPI](contracts/openapi.yaml) 的人类会话/CSRF 接口执行；S1 作业执行与认知记忆审批分别使用各自接口。知识和经验按项目隔离，跨项目访问须人工显式分享。

Workspace 的作品册读取真实持久化缓存，提供平台/分组/时间视图、态度、人工交接手册、隐藏、扫描和 JSON 投递。扫描只接受已登记批准根，读取目录名/stat/count/mtime，有界遍历；未知平台、未核实文件和不完整发现保持可见。机器同步和缺少认知 topic 的作品活动保存原始 pending observation，不生成关注 Signal。JSON 投递的路径只是线索，不自动获得扫描权限。

`pnpm build` 生成 `dist/astrocyte`、`dist/astrocyte-mcp`、`dist/astrocyte-sleep`（Windows 带 `.exe`）及 `web/dist`。MCP 为 stdio 服务，五个工具为 `astrocyte.get_attention_state`、`astrocyte.explain_focus`、`astrocyte.get_experiences`、`astrocyte.report_event`、`astrocyte.veto`；项目/会话/身份在启动时绑定。启动参数：

| 参数 | 要求 |
|---|---|
| `--data-dir` | 显式指定与 API 相同的 SQLite 数据目录；省略时用系统配置目录下 astrocyte，CLI 不读取 `ASTROCYTE_DATA_DIR` |
| `--project --session --principal-id --principal-kind` | 明确可信启动身份；kind 为 agent 或 human，工具参数不改变授权 |
| `--signal-strength` | 必须提供已确认的非负数值，无产品默认 |
| `--decay --initial-confidence` | 动力学配置；decay 单位为每天，缺失时对应写入可能保留 dynamics_pending |
| `--success-confidence-delta --confidence-drop-threshold` | 可选显式策略，无产品默认 |
| `--human-veto` | 仅人类启动通道可启用；未解析的 task veto 保存 pending，不表示任务已停止 |

已提交事件的 `capture_pending` 与 `dynamics_pending` 分别说明经验捕获或图更新待处理；`delivery_unknown` 保留不确定效果。读取原回执和状态后再处理，不能用新 OriginKey 盲重放。

Sleep 命令每次执行一个明确日期，无任务调度器或模型调用。必须提供 `--day YYYY-MM-DD`、`--timezone`、`--decay`、`--initial-confidence` 和 `--fact-projection none|facts-map-v1`；另可提供 `--data-dir` 及成功/冲突策略参数。`none` 保持关键事实召回不可计算；`facts-map-v1` 只解析明确已知格式的字面 `raw.facts` 字符串。当天回执、图、fluid、候选与指标一起提交；相同日周期返回原结果。字节缩减指标计量工作表示，原始事件保留，不表示 SQLite 文件缩小。迟到且早于已有图时间的新 Signal 显式拒绝，不能通过修改时间静默回放。

工程参数、原生会话读取范围及具体资料权限按[当前决定](docs/QUESTIONS.md)处理。检索使用 topic/keyword 与已观察关联的相关度；工程检查、真实原生回放和正式用户对照分别验收。产品、研究与正式实验的当前限制由 [STATUS](STATUS.md) 统一索引，早期独立原件见[历史验收记录](docs/acceptance/AttentionEngine-baseline.md)。

## 环境

- Node **24.16.0**、pnpm **11.27.0**、Go **1.27.2**。直接依赖使用精确版本，完整锁定见 `pnpm-lock.yaml`、`go.mod`、`go.sum`；清单见 [dependencies.lock.json](dependencies.lock.json)。
- Windows/PowerShell 是本地开发主路径；Linux/WSL 使用独立环境与项目路径。Go/前端构建无需 Python 或 Docker；视频音轨回退复用 summarize 的 yt-dlp/本地转写依赖，用户已允许 Python。外部媒体工具与模型需独立安装和验证，npm 安装不代表视频可处理。
- Node 脚本依次检查 `ASTROCYTE_GO`、当前 `PATH`、Windows `%LOCALAPPDATA%/Programs/go/bin/go.exe`。设置了无效 override 时明确失败，避免静默切换工具链。

PowerShell：

```powershell
node --version
pnpm --version
$env:ASTROCYTE_GO = Join-Path $env:LOCALAPPDATA 'Programs/go/bin/go.exe'
& $env:ASTROCYTE_GO version
& $env:ASTROCYTE_GO mod download
pnpm install --frozen-lockfile
# 显式指定本地数据目录；不要放在仓库或 worktree 中。
$env:ASTROCYTE_DATA_DIR = Join-Path $env:LOCALAPPDATA 'Astrocyte/data'
pnpm dev
```

Linux / WSL：

```sh
node --version
pnpm --version
go version
go mod download
pnpm install --frozen-lockfile
export ASTROCYTE_DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/astrocyte"
pnpm dev
```

打开 `http://127.0.0.1:5173`；API 监听 `127.0.0.1:8787`，Vite 代理 `/api`。`ASTROCYTE_PORT` 与 `ASTROCYTE_WEB_PORT` 可覆盖端口。按 Ctrl+C 停止本次启动的 API 和 Vite；只关闭浏览器不会停止服务。开发脚本构建临时后端可执行文件；临时目录只在子进程确认退出后清理。业务 SQLite 保留在数据目录中。

## 检查与构建

```sh
pnpm generate          # 从唯一 OpenAPI 源重新生成类型
pnpm check:contracts   # 校验规格、示例与生成漂移
pnpm check             # gofmt、vet、Go 测试、导入边界、TS、ESLint、Vitest
# 浏览器安装命令与共享开发机的保护设置见下文。
pnpm test:e2e          # 1920×1080 与 1280×720，独立数据与端口
pnpm build             # dist/astrocyte、astrocyte-mcp、astrocyte-sleep[.exe] 与 web/dist
pnpm start             # 构建后启动本地服务，ASTROCYTE_WEB_DIR 指向 web/dist
```

Playwright 在隔离临时数据目录运行，默认 API `18787`、网页 `15173`；可用 `ASTROCYTE_E2E_API_PORT`、`ASTROCYTE_E2E_WEB_PORT` 覆盖。它不会复用其他工作树已启动的服务。报告与失败 trace 在 `web/playwright-report`、`web/test-results`。Linux CI 另运行 race 检查；Windows 本地不以缺少 C 工具链阻止纯 Go SQLite 验证。

在共享开发机安装 Chromium 前设置 `PLAYWRIGHT_SKIP_BROWSER_GC=1`，保留其他项目可能使用的浏览器版本；该设置只影响安装时的旧版本清理，不跳过下载或测试。PowerShell：

```powershell
$env:PLAYWRIGHT_SKIP_BROWSER_GC = '1'
pnpm --dir web exec playwright install chromium
```

Linux / WSL：

```sh
PLAYWRIGHT_SKIP_BROWSER_GC=1 pnpm --dir web exec playwright install chromium
```

`pnpm start` 在 API 端口同时提供构建后的网页，默认打开 `http://127.0.0.1:8787/attention`；修改 `ASTROCYTE_PORT` 时使用对应端口。`ASTROCYTE_WEB_DIR` 可覆盖静态资源目录，`/api` 路径始终交给 API。

构建与检查在缺少所需入口或依赖时立即失败；当前实际命令、结果和剩余限制见[交付报告](docs/standards/delivery-candidate-20261020.md)。

## HTTP v1 与权限

项目总览使用 `/local-projects/registered` 的持久化观察缓存，汇总同项目目录和有来源的客户端关联；历史活动、贡献者和Git提交不表示当前运行、进度或完成。人类通过 `/local-projects/registered/{project_id}/metadata` 保存备注、复盘、分组、意图与归档，刷新不覆盖人工字段。修改必须带人类会话、CSRF及当前人工 `revision`（初始0）；并发修改冲突后先重新读取。发现、备注和归档均不改变项目空间、模型许可或Agent授权。进度推断、论文搜索和插件读取按docs/QUESTIONS.md中的当前决定逐项核查具体主体、资料版本和自动化权限。

所选资料处理的完整模型输入上限是512KiB UTF-8字节，包含指令、版本引用和输出结构要求；超限拒绝，正文不静默截断。输出与原生历史保持原有独立上限。扩容不扩大资料根、项目根、模型许可或外发范围。

实际项目总览检查使用独立临时SQLite及随机loopback端口，需要本机已有登记项目；不读取个人Chrome，不调用模型/媒体。保留SQLite原件和首失败，不把空发现或默认跳过当通过：

```powershell
$env:ASTROCYTE_TEST_PROJECT_BOARD = '1'
node --test tests/s1/project-board.test.mjs
Remove-Item Env:ASTROCYTE_TEST_PROJECT_BOARD
```

S1 的本地浏览器读取先通过 `GET /api/v1/auth/session` 建立 HttpOnly/SameSiteStrict 会话；写入同时携带返回的 `csrf_token`（`X-CSRF-Token`）和稳定的 `Idempotency-Key`。正文不能设置 actor 或权限。服务重启后重新建立会话，调用者 ID 保持稳定，原幂等回执继续可用。`createAttentionApi` 与 [S1 类型助手](web/src/api/s1.ts) 保留原命令身份，不自动重发失败或未知命令。旧 `ASTROCYTE_AGENT_TOKEN` 不授予资料权限；人类通过项目 grant 和 `POST /local-projects/{id}/agent-token` 签发短期项目凭据，返回值只提供一次，不进入日志或浏览器持久存储。凭据只进入对应项目的上下文/原生操作，不能建立人类会话、改变设置、授权或签发令牌；每次操作查当前授权，撤销后立即拒绝新操作。此边界不提供同机操作系统进程隔离。

`GET /api/v1/local-agents` 通过同一人类会话读取缓存的 CLI 清单。服务启动时仅查 PATH，并在总计 10 秒、单条命令 5 秒内运行固定 version/help；探测在后台执行，HTTP 就绪不等待探测完成，未完成的探测保持未知，刷新网页不执行 CLI。安装、配置、可启动及八项原生能力 `discover/read_context/start/resume/send/stop/observe/reconcile` 分别报告；版本/help 成功不表示模型可用。`native_adapter_registered` 仅表示后端实现了该客户端的接入协议，人类可以在已许可项目中显式 `POST /local-projects/{id}/sessions/probe` 验证空会话和停止，实际观测才更新能力。GET 和网页重载不探测、不调用模型、不推导授权；未组装能力返回 501。

`/tracking-sources` 绑定多个发布账号或明确收藏夹。`GET /source-collections` 只读持久化目录缓存；人类显式 `POST /source-collections/discover`（会话/CSRF/命令键）才调用公开接口或已交接的指定浏览器收藏夹，失败保留旧缓存。先同步标题/简介，再给 Agent 建议，最后由人选择固定元数据 revision、排队 summarize 正文导入。启动服务时沿持久化队列同步一次，默认最多观察100条，没有定时器或全量自动入库。普通导入复用既有提取；只有明确 `refresh: true` 才重新获取，同来源旧 A 回执不把新 B 当前版本回退。B站挑战/限流保留失败及旧清单，不能当空同步成功；抖音 `browser_selected` 仅使用主控交接的 OpenCLI 会话、稳定账号 ID 和指定收藏夹 ID，不读取无关页面、Cookie 原文或凭据，也不从 self 链接猜身份。桥未连接返回可操作错误，其他平台保持待接入。

登录抖音桥仅由主控交接后显式配置：没有环境覆盖时，程序只读取已解析应用数据目录中那一个 `selected-browser.json`，普通重启保留已批准选择，不查找其他文件；缺失保持未连接、格式错误则明确终止启动。`ASTROCYTE_DOUYIN_CONFIG` 指定一个绝对 JSON 文件，字段为 `node_path`、`cli_main`、`profile`、`session`、`owner_id` 和 `folder_ids`（字符串数组），不允许 Cookie、凭据或任意执行表达式。也可完整设置 `ASTROCYTE_DOUYIN_OPENCLI_NODE/MAIN/PROFILE/SESSION` 与 `ASTROCYTE_DOUYIN_OWNER_ID/FOLDER_IDS`；文件和环境配置不能混用，未配置默认关闭，不搜索个人浏览器。页面使用正常的读取→选择流程，`self` 只映射到这份配置的已批准身份；实际账号/收藏夹 ID 保留在高级信息。桥只能读取当前已完整挂载的选中列表；未加载完整的长收藏夹返回缺证据提示，不能假称分页同步成功。这是当前挂载页面的 DOM 快照，桥不独立刷新平台页面，新收藏尚未挂载时不能保证被观察到；后续刷新方式仍待用户决定，不因此新开标签或扩大浏览器权限。`pnpm dev --ephemeral` 清除浏览器桥配置；普通浏览器验收不会继承个人 Chrome，真实选定收藏夹验收必须单独显式传入配置。

`GET /github-repositories` 只读缓存；人类明确输入公开账号/仓库并调用 `/github-repositories/sync` 才同步元数据，单账号最多100条观察，不表示全账号完整。初次不生成代码目录。人类在 `/github-repositories/{id}/placement` 选择既有顶层蜂群开发空间后，固定程序才浅克隆到应用数据目录的 `repositories` 子目录，保存实际根与 HEAD，并登记默认 A 的项目。重复纳入复用，不启动 Agent、不赋予 BC/control/model/actions、不创建 Mission。失败或中断保留状态和所属阶段目录，只允许人类有界重试；缓存 GET 与网页重载不克隆。匿名 REST 限额后，仅明确公开仓库可采用主控已批准的官方公开 HTML 元数据后备；`metadata_source` 与 `unknown_fields` 标识来源和未观察字段，不能将其默认零值显示为事实。首批账号/私有范围仍待用户，不读取凭据或自动发现私有仓库。

`/local-projects` 只登记人类明确选择的项目绝对路径和对应 Attention 空间；显式父根发现保留，历史读取另外登记 `history_roots` 的客户端目录并核对项目身份。默认 A 仅主动纳入的固定资料版本；B 允许明确项目子目录，C 允许当前纳入资料的一跳引用展开，均由人打开。查询不增加人类关注，作用域 Agent 读取只记机器使用。模型许可 `external_model_cli` 按项目配置、只用精确选择的 CLI 当前配置，不自行换提供方；本机 CLI 不表示模型在本机。原生接续保留原 session ID，新上下文交接明确显示 `context_handoff`，外部历史观察不获得进程控制权。调用和会话期限有界，未知动作不重放；退出服务先停止所属原生进程并保存确认状态，再关闭数据库。自动 Agent 派发仍不启用，未交接的浏览器范围和自动控制限度仍不推导，完整验收见 [本轮计划](tasks/S1-sync-local-agent-plan.md)。

用户授权的登记项目发现通过 `GET /local-projects/registered` 查询 SQLite 缓存，GET 不执行命令。服务每次启动由固定程序在后台采集一次 Orca 实际登记根、关联 worktree、有限子项目及 Git 元数据；人类可通过 `POST /local-projects/registered/refresh` 显式刷新。来源不可用时保留旧观测和时间、标为 `stale`，部分不可用标为 `partial`，未知 Git/活动字段保持可空；Orca 创建客户端和活动时间不表示 Agent 当前正在运行。发现不自动创建项目/Attention 空间、开放 B/C、授权模型或启动 Agent；人类选取候选后沿原登记入口关联空间。Git 读取禁用 fsmonitor、hooks、未跟踪文件遍历和子模块操作，不执行项目脚本或安装依赖。停止服务取消并等待所属采集，再关闭数据库。

S1 配置由入口显式读取：`ASTROCYTE_IMPORT_ROOTS` 使用平台路径分隔符（Windows 分号、Linux 冒号）列出可读资料目录，默认为空，拒绝本地文件读取。网页可直接上传/粘贴既有 summarize JSON/Markdown；导入器保留真实工具版本和来源，缺字幕或片段时不补造时间戳。arXiv 保存固定版本 PDF 和来源元数据，摘要不标为全文提取；资料版本的受控附件端点提供原始字节下载。`source_key` 和 `content_digest` 传空字符串表示由后端根据真实来源计算，非空值由适配器核验。

项目精确依赖 [`@steipete/summarize` **0.25.1**](https://github.com/steipete/summarize/blob/main/package.json)。运行 `pnpm install --frozen-lockfile` 后，`pnpm dev` / `pnpm start` 自动解析项目内 CLI 与当前 Node，不需设置全局 summarize 路径；不升级或回退全局 CLI。直接运行构建后的二进制时，从工作目录或二进制旁的已安装 checkout 查找项目依赖；将二进制单独复制到其他目录需要显式配置。`ASTROCYTE_SUMMARIZE_CLI`、`ASTROCYTE_NODE` 可覆盖为绝对路径；缺失/错误配置明确失败。入口会将 CLI 的 pnpm 链接解析为真实文件路径，使媒体桥能找到同一安装中的 summarize-core；显式覆盖 CLI 路径也执行此解析。`ASTROCYTE_ENABLE_SUMMARIZE=false` 显式关闭提取，保留 arXiv 元数据/PDF 与既有导出导入；普通临时浏览器服务也显式关闭提取。

公开视频链接使用现有 `POST /materials/imports`，`adapter=summarize_url`、`kind=video`，不传 `export_text` / `local_file_ref`，`source_key` / `content_digest` 传空字符串由后端核验。`summarize`、`summarize_json`、`summarize_markdown` 继续导入既有输出，`arxiv` 继续固定版本论文全文。提取保存真实原输出；字幕、转写与位置缺失不补造，网页文字不等于视频内容。提取成功不表示 Codex 首次整理成功；模型仍由独立显式授权入口控制。

本地音轨回退的启动配置使用绝对路径：`ASTROCYTE_YT_DLP_PATH` 为 yt-dlp 可执行文件；`ASTROCYTE_FFMPEG_PATH` 为 ffmpeg（同目录需要 ffprobe）；`ASTROCYTE_WHISPER_BINARY` 为 whisper.cpp CLI，`ASTROCYTE_WHISPER_MODEL` 为其本地模型。提取进程只传这些指定工具，隔离 HOME/配置目录，不继承提供商、cookie 或浏览器认证。缺工具时只使用实际上游能取得的公开字幕，失败明确返回缺证据/依赖错误，不自动调用云端转写。CPU 转写受现有 `ASTROCYTE_JOB_TIMEOUT_SECONDS` 限制；安装文件、版本命令成功和所选视频转写成功需分别核实。summarize 扩展/daemon 不在本轮接入；本轮登录浏览器许可仅用于 OpenCLI 指定抖音收藏夹元数据，不扩大正文外发或 summarize 来源权限。

公开发布清单的 `ASTROCYTE_LISTING_PYTHON` 指向已锁定 yt-dlp 环境中的 Python 绝对路径；`pnpm dev/start` 自动选择现有媒体环境的 `Scripts/python.exe`。不会回退全局 Python、自动安装依赖或扫描项目历史；缺环境的发布同步保留配置错误，公开收藏夹 HTTP 查询仍可使用。当前不做 summarize 浏览器扩展；OpenCLI 仅允许明确交接的登录抖音收藏夹元数据，仍禁止凭据原文读取。

Windows x64 可运行 `pwsh -NoProfile -File scripts/install-media.ps1`（需要已安装 Python >=3.10；`-PythonExecutable` 可指定其绝对路径）。脚本读取依赖清单中的固定 yt-dlp、ffmpeg/ffprobe、whisper.cpp release 和固定上游 revision 的多语言 base 模型，安装至 `%LOCALAPPDATA%/Astrocyte/media`；`pnpm dev/start` 自动发现其中实际存在的工具。`ASTROCYTE_MEDIA_DIR` 或安装参数 `-MediaRoot` 可改为专用绝对目录，单项路径覆盖优先。安装仅使用版本目录/venv，不更新全局 CLI 或 Python 包。Linux/macOS 目前需自行安装对应上游工具并配置单项路径，Windows安装脚本不适用。

summarize 0.25.1 保留上游网络保护：所选公开来源应解析为实际可访问的公开地址。若系统代理的 Fake-IP DNS 把 arXiv/Bilibili 返回为 `198.18.0.0/15`，上游会拒绝，安装媒体依赖不能修复这一网络错误。需由用户决定代理/DNS配置，允许时把选定来源域名加入 Fake-IP 排除并使用其正常 DNS；项目不自动改变宿主代理、绕过 guard 或降级上游。配置完成后仍须重新验证所选材料的真实提取。

队列配置为 `ASTROCYTE_JOB_CONCURRENCY`、`ASTROCYTE_JOB_MAX_ATTEMPTS`、`ASTROCYTE_JOB_TIMEOUT_SECONDS`；设置边界由服务入口校验。作业期限和视频提取器共享 `ASTROCYTE_JOB_TIMEOUT_SECONDS`，正式入口默认 **1800 秒**，可显式配置 1–86400 秒。所选视频的真实本地转写已超过原 300 秒默认值，因此调整这一既有共享默认；它同时影响导入和自动整理作业的期限，原有 Codex 执行配置默认同为下述 1800 秒。上游音轨下载另有自身时限，作业期限不覆盖上游限制；取消沿用现有机制。开发网页 Origin 默认来自 `ASTROCYTE_WEB_PORT`，额外本地 Origin 使用 `ASTROCYTE_ALLOWED_ORIGINS` 逗号分隔并列出完整 scheme/host/port。会话与 CSRF 不接受任意 loopback Origin。三层人工整理明确记录 manual 来源。本地 Codex 端口、适配、持久化队列和入口已组装；最新真实候选 schema 调用响应丢失、效果和费用未知，自动三层正路径尚未验收，不从人工记录推断自动成功。

原有自动处理配置使用 `ASTROCYTE_ENABLE_CODEX_DISTILLATION=true` 显式启用（默认关闭）、`ASTROCYTE_CODEX_EXECUTABLE` 原生 exe 绝对路径、`ASTROCYTE_CODEX_MODEL` 明确模型名称及 `ASTROCYTE_PROCESSING_SOURCE_KEYS` JSON 数组授权范围。`ASTROCYTE_CODEX_TIMEOUT_SECONDS` 默认1800秒。项目选择的CLI蒸馏和清单推荐通过同一原生文本处理端口执行，每次检查项目外部模型许可，期限取现有作业期限并最多30分钟。当前应用保持自动Codex沉淀关闭；受限Codex原生文件/命令工具关闭要求及S3预算/权限门禁保持，相关正向执行未验。模型输入和具体资料范围必须按当前任务批准，未知调用不重发；CLI沿既有登录，不复制或显示凭据，不修改全局CLI权限配置。

`GET /api/v1/distillations/processor` 只核实原生版本与当前配置，返回实际配置模型、schema 身份及授权来源；不会调用模型，available 不代表提供商当前可连接。自动请求使用固定原文版本、显式前轮记录、问题与真实处理配置复用，完成后保留适配器来源和可空候选建议。人工确认再创建或修订候选。响应丢失的 operation 不自动或人工盲重发；已收到输出但本地保存失败的重试复用原输出。域分类和项目空间 @ 引用保留原件且不授予 Agent 访问。人工重读、提及与项目复用形成关注信号，刷新和机器读取不冒充人工行为；候选排序须先设置完整的版本化四维权重，未知维度不填零。

[contracts/openapi.yaml](contracts/openapi.yaml) 是唯一 HTTP 源。全部规格 §13 路径、版本化请求/响应/错误及示例在此维护；[web/src/api/schema.d.ts](web/src/api/schema.d.ts) 自动生成，typed fetch 使用 `openapi-fetch` 的生成路径类型。业务组件调用 [client.ts](web/src/api/client.ts) 的 `createReadApi`、读取助手或 `createApiClient`。

页面使用生产API与真实SQLite；空集合、未知费用、权限拒绝和能力缺失按实际状态显示。资料导入、人工批准和任务依赖继续沿各自公开契约与当前权限处理，原生执行及成果采用分别验收。错误携带 `code/message/retryable/request_id/required_action`。客户端不会自动重发未知外部动作；当前完整验收范围见[交付报告](docs/standards/delivery-candidate-20261020.md)。

## 数据与升级备份

业务数据库为 `ASTROCYTE_DATA_DIR/state.sqlite`。未指定数据目录时，后端使用 Go `os.UserConfigDir()` 下的 `astrocyte` 目录；上述启动示例显式指定仓库外路径。

已有迁移记录的数据库遇到待执行迁移时，先通过 SQLite **`VACUUM INTO`** 创建一致快照，包括 WAL 中已提交的数据。备份位于同一数据目录的 `backups/backup_<UTC日期时间>_<微秒>_v<当前schema版本>.sqlite`；例如 `backups/backup_20261009_060000_123456_v1.sqlite`。新建数据库及没有待执行迁移的重启不创建备份。

备份失败时启动终止，待执行迁移不会应用；迁移逐个事务提交，失败时回滚该迁移并终止启动。程序保留备份，不自动清理或自动恢复。需要恢复时先停止所有访问该数据目录的服务，保留当前数据库与 WAL 文件，再用备份恢复到匹配的程序版本；人工恢复不属于 S0 自动操作。

## 分层

`internal/{attention,workspace,swarm}/{domain,app}` 保持两层；适配器在 `internal/adapters`，组装在 `cmd/server`。导入检查禁止领域 I/O、领域依赖应用/适配器、跨上下文直接引用与 HTTP/MCP 访问 SQL；应用使用消费方端口，组装层负责桥接。
