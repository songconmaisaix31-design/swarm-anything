<div align="center">

# SWA · Swarm Anything

A local Swarm CLI for heterogeneous CLI agents, built on top of the Astrocyte app already in this tree.

面向本机异构 CLI Agent 的 Swarm CLI，底座是这棵树里已经在运行的 Astrocyte 应用。

[![CI](https://github.com/songconmaisaix31-design/swarm-anything/actions/workflows/check.yml/badge.svg)](https://github.com/songconmaisaix31-design/swarm-anything/actions/workflows/check.yml)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/go-1.27.2-00ADD8.svg)](go.mod)
[![Node](https://img.shields.io/badge/node-24.16.0-5FA04E.svg)](package.json)

</div>

> **How to read this page / 怎么读这页**
> English first, then the same content in Chinese — not a summary, not a separate half. Tables keep both languages in one cell.
> 每段英文在前、同一内容的中文紧跟在后；不是摘要，也没有单独的"中文版"。表格把两种语言放进同一格。

---

## At a glance · 一眼看懂

| | |
|---|---|
| **Problem<br/>问题** | You have several agents installed locally (Codex, OpenCode, Pi…). Each keeps its own session, and nothing records which one ran what, under whose grant.<br/>本机装了多个 Agent（Codex、OpenCode、Pi……）。各管各的会话，谁在谁的授权下做了什么，没有一处记录。 |
| **Fix<br/>做法** | One Go service owns the work items, grants, sessions and Attention state; a web UI and an MCP server read and write through that same service.<br/>一个 Go 服务统一持有工作项、授权、会话与注意力状态；网页与 MCP 服务都通过它读写。 |
| **Cost<br/>代价** | Go 1.27.2, Node 24.16.0, pnpm 11.27.0, a SQLite file outside the repo, and a browser for the UI.<br/>Go 1.27.2、Node 24.16.0、pnpm 11.27.0，一份放在仓库外的 SQLite 文件，以及看网页用的浏览器。 |
| **Not<br/>不是** | Not a hosted service, not an OS-level sandbox, not a finished Swarm CLI.<br/>不是托管服务，不是操作系统级沙箱，也不是已完成的 Swarm CLI。 |

## What already runs · 现在真能跑的部分

The tree holds a working Go + React application: HTTP API, web pages, MCP stdio server, a daily Sleep job, and SQLite persistence. It is the Astrocyte product continued under a new repository name — the module is still `github.com/songconmaisaix31-design/Astrocyte` and the package is still `astrocyte`.

这棵树里有一个可运行的 Go + React 应用：HTTP API、网页、MCP stdio 服务、每日 Sleep 作业与 SQLite 持久化。它是 Astrocyte 产品在新仓库名下的延续——模块名仍是 `github.com/songconmaisaix31-design/Astrocyte`，包名仍是 `astrocyte`。

The SWA CLI itself is the part still under construction. There is no validated install candidate yet, and the final acceptance requires one installed candidate running two real Workers. Until that passes, treat the CLI as unproven.

SWA CLI 本身仍在建设。目前没有通过验证的安装候选，最终验收要求用同一个已安装候选运行至少两个真实 Worker。在通过之前，CLI 一律按未验证对待。

## The problem · 问题在哪

A single local machine is now a multi-agent machine. The drift shows up as duplicated facts:

- the agent's own session log says a task is running
- the UI says it finished
- the SQLite row says accepted
- the grant that allowed it was issued in a different project

Four sources, no join key. This tree answers that by making the service the only writer, and by keeping `unknown` visible instead of filling it with zero.

一台本机现在就是一台多 Agent 机器。漂移表现为同一件事有多个版本：

- Agent 自己的会话日志说任务在跑
- 界面说已经完成
- SQLite 记录说已接纳
- 允许它的授权是在另一个项目里签发的

四个来源，没有关联键。这棵树的做法是：让服务成为唯一写入方，并且把 `unknown` 保留为未知，而不是填成 0。

## The idea · 思路

| Noun · 名词 | Path · 路径 | Rule · 规则 |
|---|---|---|
| **Work Item** | `internal/swarm/{domain,app}` | Dependencies, source, grant and stop history are shown as stored, not inferred from activity.<br/>依赖、来源、授权与停止历史按存量展示，不从活跃度推断。 |
| **Attention** | `internal/attention/{domain,app}` | Events become Signals, Signals decay; a human veto is recorded, not silently applied.<br/>事件变成 Signal，Signal 会衰减；人工否决被记录，而不是被静默执行。 |
| **Grant** | `internal/adapters/admissionbridge` | A project token is issued by a human and checked per operation; revoking it rejects the next operation.<br/>项目凭据由人签发、每次操作都查；撤销后下一次操作即被拒。 |
| **Project** | `internal/workspace/{domain,app}` | Knowledge and experience are isolated per project; crossing projects needs an explicit human share.<br/>知识与经验按项目隔离；跨项目访问必须由人显式分享。 |
| **Contract** | `contracts/openapi.yaml` | The single HTTP source. Types in `web/src/api/schema.d.ts` are generated from it.<br/>唯一的 HTTP 来源；`web/src/api/schema.d.ts` 由它生成。 |

## Capabilities · 能力清单

| Surface · 入口 | What it does · 做什么 | How to check · 怎么验证 |
|---|---|---|
| Web UI<br/>网页 | Project board, swarm page with real DAG, works catalog, attention views.<br/>项目总览、带真实 DAG 的蜂群页、作品册、注意力视图。 | `pnpm dev` → `http://127.0.0.1:5173` |
| HTTP API<br/>HTTP 接口 | Human session + CSRF for writes, idempotency keys, per-operation grant checks.<br/>写入需人类会话与 CSRF，带幂等键，逐操作校验授权。 | `pnpm check:contracts`; server on `127.0.0.1:8787` |
| MCP (stdio)<br/>MCP 服务 | Five tools: `astrocyte.get_attention_state`, `astrocyte.explain_focus`, `astrocyte.get_experiences`, `astrocyte.report_event`, `astrocyte.veto`. | `pnpm build` → `dist/astrocyte-mcp` |
| Sleep job<br/>Sleep 作业 | One explicit day per run, no scheduler and no model call.<br/>每次只处理一个指定日期，无调度器、不调用模型。 | `dist/astrocyte-sleep` with `--day --timezone --decay --initial-confidence --fact-projection` |
| SQLite store<br/>数据 | `state.sqlite` in `ASTROCYTE_DATA_DIR`; migrations snapshot via `VACUUM INTO` into `backups/`.<br/>数据在 `ASTROCYTE_DATA_DIR` 下的 `state.sqlite`；迁移前用 `VACUUM INTO` 快照到 `backups/`。 | Start with a pending migration and look for the backup file. |

The MCP server binds project, session, identity and signal strength at startup; tool arguments cannot widen them. `--human-veto` only works on a human launch channel.

MCP 服务在启动时绑定项目、会话、身份与 signal 强度，工具参数无法扩大这些范围。`--human-veto` 只在人类启动通道生效。

## Quickstart · 快速开始

### Requirements · 环境要求

Go **1.27.2**, Node **24.16.0**, pnpm **11.27.0**. Windows/PowerShell is the primary local path; Linux/WSL uses its own paths.

Go **1.27.2**、Node **24.16.0**、pnpm **11.27.0**。本地主路径是 Windows/PowerShell；Linux/WSL 用各自的路径。

### 1. Install · 安装

```powershell
$env:ASTROCYTE_GO = Join-Path $env:LOCALAPPDATA 'Programs/go/bin/go.exe'
& $env:ASTROCYTE_GO mod download
pnpm install --frozen-lockfile
$env:ASTROCYTE_DATA_DIR = Join-Path $env:LOCALAPPDATA 'Astrocyte/data'   # outside the repo · 不要放在仓库里
```

### 2. Run · 运行

```powershell
pnpm dev
```

The UI is at `http://127.0.0.1:5173`, the API listens on `127.0.0.1:8787` and Vite proxies `/api`. Only closing the browser does not stop the service — stop it with Ctrl+C.

网页在 `http://127.0.0.1:5173`，API 监听 `127.0.0.1:8787`，Vite 代理 `/api`。只关浏览器不会停止服务——要用 Ctrl+C 停。

### 3. Verify · 验证

```powershell
pnpm generate          # regenerate types from the OpenAPI source · 从唯一来源重新生成类型
pnpm check:contracts   # spec, examples, generated drift · 规格、示例与生成漂移
pnpm check             # gofmt, vet, Go tests, import boundaries, TS, ESLint, Vitest
pnpm build             # dist/astrocyte, astrocyte-mcp, astrocyte-sleep, web/dist
```

`pnpm test:e2e` runs Playwright in an isolated temp data directory on ports `18787` / `15173` at two viewport sizes. The same steps run in CI on `ubuntu-24.04` and `windows-2025`, with `go test -race ./...` on Linux only.

`pnpm test:e2e` 在隔离临时数据目录里跑 Playwright，使用 `18787` / `15173` 端口与两种视口尺寸。同一套步骤在 CI 的 `ubuntu-24.04` 与 `windows-2025` 上跑，`go test -race ./...` 只在 Linux 上跑。

Every command above was copied from this repository's own docs; none of them were re-run for this page.

以上命令均抄自本仓库自己的文档；写这页时没有重跑任何一条。

## Documentation · 文档

| Doc · 文档 | Read it when · 什么场景读它 |
|---|---|
| [docs/README.md](docs/README.md) | You need the document map before picking anything else.<br/>先要一张文档地图再挑具体文件。 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | You are about to change code: scope, checks, commit rules.<br/>准备改代码：范围、检查、提交规则。 |
| [STATUS.md](STATUS.md) | You need the current facts: what passed, what is blocked.<br/>需要当前事实：通过了什么、卡在哪。 |
| [HANDOFF.md](HANDOFF.md) | You are taking over the repository.<br/>你要接手这个仓库。 |
| [docs/SPEC.md](docs/SPEC.md) | You need the domain model and interface contracts.<br/>需要领域模型与接口契约。 |
| [docs/QUESTIONS.md](docs/QUESTIONS.md) | You are unsure whether a decision is still current.<br/>不确定某个决定是否仍然有效。 |
| [docs/META_PLAN.md](docs/META_PLAN.md) | You want the original v2.1 plan; M2–M6 are still planned.<br/>想看原始 v2.1 规划；M2–M6 仍是规划。 |

## Repository layout · 仓库结构

```text
swarm-anything/
├── cmd/                 # server, mcp, sleep, attentionruntime, workbench-snapshot, validation
├── internal/
│   ├── attention/       # Attention Engine: domain + app
│   ├── swarm/           # work items, dispatch, grants
│   ├── workspace/       # projects, materials, works catalog
│   ├── workbench/       # workbench surfaces
│   ├── foundation/      # shared primitives (sqlite, jobs, config)
│   └── adapters/        # httpapi, mcp, sqlite, agents, importers, agents' native bridges
├── contracts/           # openapi.yaml — the single HTTP source
├── web/                 # React + Vite UI and its own Playwright e2e
├── tests/               # attention-engine, s1–s5, validation, release-cognition
├── scripts/             # dev / check / build / generate entry points
└── docs/                # README index, SPEC, STATUS, QUESTIONS, standards, tasks
```

## Status · 状态

Package version `0.1.0`. The web app, HTTP surface, MCP tools and Sleep job are implemented and running; the SWA CLI v1 is not accepted yet: no validated install candidate exists, and no acceptance has run two real Workers from one installed candidate.

包版本 `0.1.0`。网页、HTTP 接口、MCP 工具与 Sleep 作业已实现并运行；SWA CLI v1 尚未接纳：没有通过验证的安装候选，也没有任何一次验收用同一个已安装候选跑起两个真实 Worker。

Known limits, stated rather than hidden:

- Automatic agent dispatch is still disabled; several native capabilities report `unknown` until a human probes a real session.
- The grant boundary is an authorization boundary, not OS process isolation on the same machine.
- Media extraction needs external tools (yt-dlp, ffmpeg, whisper.cpp) installed and verified separately; `pnpm install` does not make video processing work.
- `unknown` values stay `unknown` in the UI — including costs and provider quota.

边界写出来而不是藏起来：

- 自动 Agent 派发仍未启用；多项原生能力在人类探测真实会话之前始终为 `unknown`。
- 授权边界是授权边界，不是同机操作系统进程隔离。
- 媒体提取需要另行安装并验证外部工具（yt-dlp、ffmpeg、whisper.cpp）；`pnpm install` 不会让视频处理变得可用。
- 界面里的 `unknown` 保持未知，包括费用与厂商额度。

## License · 许可

AGPL-3.0 — see [LICENSE](LICENSE).

AGPL-3.0 —— 见 [LICENSE](LICENSE)。
