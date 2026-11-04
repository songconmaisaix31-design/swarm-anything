# 参与开发

先读 [AGENTS](AGENTS.md)、[HANDOFF](HANDOFF.md)、[STATUS](STATUS.md)，再读 [META_PLAN](docs/META_PLAN.md)、当前 [TASKS](docs/TASKS.md) 和具体任务。业务规格在 [SPEC](docs/SPEC.md)，代码约定在 [CODING](docs/CODING.md)，已确认决定与未答问题在 [QUESTIONS](docs/QUESTIONS.md)，资源参数只在 [RESOURCES](docs/RESOURCES.md) 维护。

首版实施以[可控 Swarm CLI 任务](tasks/swa-cli-v1-20261020.md)为准；原 M2—M6 沿后续规划分别处理，未答执行边界不在普通文档或局部实现中定稿。

## 环境与启动

现有程序使用 Go、React/TypeScript、Vite 和 SQLite。锁定版本为 Node 24.16.0、pnpm 11.27.0、Go 1.27.2；以仓库清单和锁文件为准。Python 可用于明确需要它的工具链，媒体依赖需另外安装核实。Morphogenesis 研究运行时独立管理。启动、媒体安装、数据目录、权限和备份要求见 [README](README.md)，不要将业务 SQLite 放入工作树。

```powershell
$env:ASTROCYTE_GO = Join-Path $env:LOCALAPPDATA 'Programs/go/bin/go.exe'
& $env:ASTROCYTE_GO mod download
pnpm install --frozen-lockfile
$env:ASTROCYTE_DATA_DIR = Join-Path $env:LOCALAPPDATA 'Astrocyte/data'
pnpm dev
```

普通开发默认网页为 `http://127.0.0.1:5173`，API 为 `http://127.0.0.1:8787`。服务使用独立数据目录，启动前检查所选端口。

## 修改与检查

先在任务中记录目标、基线、write_paths、预期效果、验收、停止条件和测试计划，由独立 Reviewer 或用户审核后实施。按变更影响选择必要检查；既有适用检查继续执行。纯文档修改核对来源、规则、导航与本地链接，复用有效程序验证。资源不足、缺少依赖或权限未决定时保留真实未验状态。

| 修改范围 | 仓库现有命令与用途 |
| --- | --- |
| HTTP 契约 | `pnpm generate` 生成类型；`pnpm check:contracts` 检查契约、示例和漂移 |
| 角色资产 | `pnpm check:cards`；Go 校验器与 `swarm roles validate FILE` 使用相同 Schema |
| 程序 | `pnpm check` 检查格式、Go、架构、TypeScript、ESLint 与 Vitest |
| 模块依赖 | `pnpm check:architecture`、`pnpm check:dependencies` |
| 浏览器行为 | `pnpm test:e2e`；必须符合浏览器及服务权限和资源要求 |
| 交付产物 | `pnpm build`；构建后 `pnpm start` |
| 文档与提交 | 成熟 Markdown 解析器检查所改文档；`git diff --check` |

具体命令结果见当前任务和 STATUS。

Domain 保持纯逻辑；App 声明消费方端口并编排领域逻辑；Adapters 实现端口；Composition 完成注入。CLI、MCP、HTTP 作为协议边界复用应用服务。保持已有模块结构，在规则拥有的边界修改并更新直接消费者。

## 协作与提交

按互斥写入范围安排必要 Worker，同一功能的实现、测试、文档和返修由同一 Worker 负责。模块可以保持长期负责人，每个任务使用明确的 Worktree、Branch 和 write_paths。跨模块接口先在规格中确认，出现真实目标、权限、预算或验收问题时交主控决定。

普通提交并 push，PR 写明实际基线、行为、验证命令与结果、剩余限制。Reviewer 在独立会话核对准确 Commit，结论为接受、退回或证据不足；原 Worker 负责返修。接受、普通合并、部署与发布各按对应授权执行。主控按依赖每次集成一个分支，任务交付后结束该任务分支的开发；不 force push，不覆盖公共历史或删除无法解释的成果。
