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

普通开发默认网页为 `http://127.0.0.1:5173`，API 为 `http://127.0.0.1:8787`。根据实际端口、数据目录和资源冲突安排独立服务，资源规则以 RESOURCES 当前决定为准。仓库名称变化不自动迁移 Go module、应用标识、配置、数据或已安装客户端。

## 修改与检查

在任务或 PR 中说明目标、修改范围、预期行为和必要验证。普通局部修复直接实施并定向检查；权限、进程终止、数据迁移与发布变更先独立审核方案。失败后定位原因并复验受影响部分，新增风险才扩大检查。纯文档修改核对来源、规则、导航与本地链接，复用有效程序验证。缺少环境或依赖时可提交注明阻塞的草稿 PR，不宣称未运行的检查通过。

| 修改范围 | 仓库现有命令与用途 |
| --- | --- |
| HTTP 契约 | `pnpm generate` 生成类型；`pnpm check:contracts` 检查契约、示例和漂移 |
| 程序 | `pnpm check` 检查格式、Go、架构、TypeScript、ESLint 与 Vitest |
| 模块依赖 | `pnpm check:architecture`、`pnpm check:dependencies` |
| 浏览器行为 | `pnpm test:e2e`；必须符合浏览器及服务权限和资源要求 |
| 交付产物 | `pnpm build`；构建后 `pnpm start` |
| 文档与提交 | 成熟 Markdown 解析器检查所改文档；`git diff --check` |

本表说明命令用途，当前执行和通过范围以 STATUS 为准，历史结果保留在对应任务。纯规则测试可使用明确标注的构造输入或替身；真实模型、原生执行、安装和生命周期结论必须来自实际链路。业务部分结果与证据缺失分别报告，禁止跳过错误改变验收含义。

Domain 保持纯逻辑；App 声明消费方端口并编排领域逻辑；Adapters 实现端口；Composition 完成注入。CLI、MCP、HTTP 作为协议边界复用应用服务。保持已有模块结构，在规则拥有的边界修改并更新直接消费者。

## 协作与提交

按互斥写入范围安排必要 Worker，同一功能的实现、测试、文档和返修由同一 Worker 负责。模块可以保持长期负责人，每个任务使用明确的 Worktree、Branch 和 write_paths。跨模块接口先在规格中确认，出现真实目标、权限、预算或验收问题时交主控决定。

普通提交并 push，PR 写明实际基线、行为、验证命令与结果、剩余限制。Reviewer 在独立会话核对准确 Commit，结论为接受、退回或证据不足；原 Worker 负责返修。接受、普通合并、部署与发布各按对应授权执行。主控按依赖每次集成一个分支，任务交付后结束该任务分支的开发；不 force push，不覆盖公共历史或删除无法解释的成果。
