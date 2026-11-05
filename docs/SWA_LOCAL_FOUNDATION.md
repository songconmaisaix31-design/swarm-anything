# SWA 本地底座

任务基线为 `codex/conversational-swarm-20261104@5a9321b0`。`swarm` 提供本机发现、协议握手与角色交换，桌面使用同一个二进制。核心运行依赖为 Go 二进制及用户选用的 Agent，桌面额外使用 Electron。

## 仓库分工

| 归属 | 复用入口 | 扩展职责 |
| --- | --- | --- |
| `swarm-anything` | `cmd/swarm`、`internal/adapters/agentcli`、`desktop`、现有角色和交接 Schema | 本机 Agent、版本化 CLI JSON、角色交换 |
| `Morphogenesis` | `swarm/research/server.py`、`swarm/research/service.py`、`morphogenesis-swarm` | 可选科研 MCP，保有科研工单、租约、实验验证与成果继承。科研状态由 Morphogenesis 管理 |
| `Astrocyte` | 旧 GitHub 地址跳转到 SWA。现有 `cmd/mcp`、`internal/adapters/mcp/astrocyte.go`、`internal/attention` | 可选注意力与记忆 MCP，使用自身 SQLite 和项目绑定。独立构建 `go build -o dist/astrocyte-mcp ./cmd/mcp`，启动参数见根 README |
| `mcpet` | `src/agent_mcp.py`、`src/agentbridge` | 可选桌面陪伴与入口。保持独立发布 |
| `finance-agent-lab`、`blockchain-anything` | 对账结果 Schema、链上只读 MCP 工具 | 行业连接器和验收规则。行业包保有数据映射、角色指令和结果校验 |

Morphogenesis 参考[研究 MCP 入口](https://github.com/songconmaisaix31-design/Morphogenesis/blob/ddd2849afe330bf221d405dc2b91948c2416bd47/swarm/research/server.py)。现有研究工具桥的联调记录在 [SWA PR #14](https://github.com/songconmaisaix31-design/swarm-anything/pull/14)。启用插件时，在使用者的 MCP 客户端按项目登记并分别授予权限。独立 `swarm` 和桌面启动不加载这些服务。

## 登记第三方 ACP Agent

`swarm agents list` 查 PATH 及显式登记的路径。`--probe` 额外调用受限的 `--version` 和 `--help`。`installed`、`configured`、`startable` 是独立观察。`adapter: acp` 表示已经登记启动方式，模型就绪状态保持未知。

默认登记文件为操作系统用户配置目录下的 `swarm/agents.json`。也可设置 `SWA_AGENT_REGISTRY` 为文件绝对路径。下列条目登记一个已安装的本地 ACP 程序。

```json
{
  "schema_version": 1,
  "agents": [
    {
      "id": "my-local-agent",
      "display_name": "My local agent",
      "command": "/absolute/path/to/agent",
      "acp_args": ["acp"]
    }
  ]
}
```

目录由用户在 CLI 指定或通过桌面的原生目录选择器选定。`agents connect` 在该目录启动已登记程序，协商 ACP v1，返回 `agent_info` 和提供方声明的 `agent_capabilities`。Agent 启动可能加载其原生配置。SWA 只发握手请求，工具访问与文件权限不从注册文件或角色卡推断。参考 [ACP 初始化](https://agentclientprotocol.com/protocol/v1/initialization) 和 [DeepSeek Harness ACP](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/acp/acp/README.md)。

## 角色交换

| CLI 格式 | 交换范围 |
| --- | --- |
| `dossier` | 社区 `personal-agent-dossier/1.0` 的名称、职责和文本边界，核对源指纹。适用于 Muse 与 Grok Bot 的文件级迁移 |
| `skill` | Agent Skills 的 `SKILL.md`。用 `name`、`description` 和 Markdown 指令在支持该格式的客户端中复用 |
| `grok-build` | Grok Build `.grok/agents/*.md` 的静态角色指令与元数据 |
| `text` | 适合复制到托管 Bot 配置的指令文本 |

```sh
./dist/swarm roles import muse-dossier.yaml --from dossier > role.yaml
./dist/swarm roles validate role.yaml
./dist/swarm roles export role.yaml --to grok-build > grok-profile.md
```

导入后的工具列表为空。Dossier 只迁移角色相关内容，目标平台的会话、记忆、定时任务、账号配置和密钥由各自管理。格式来源为[社区 Dossier 样本](https://proskills.md/skills/other/aidashika-personal-agent-dossier)、[Agent Skills](https://agentskills.io/specification)和 [Grok Build Agent Profiles](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-agent/README.md)。

## 商业边界与研究依据

- 本地发现、角色交换、桌面和第三方适配开放。用户沿用 Agent 自己的账号、订阅或本地模型。Dagger 以本地 Engine 加可选托管执行运营，Dagu 以自托管加付费团队能力运营，OpenCode 提供可选计量模型服务。SWA 后续可验证常开 Worker、团队管理和行业集成服务的付费需求。[Dagger](https://dagger.io/changelog/cloud-engines/) · [Dagu](https://dagu.sh/pricing) · [OpenCode](https://opencode.ai/v2/docs/console/models/)
- DeepSeek 将授权事件、任务和原生会话分开。Anthropic 将 session、harness 和执行环境分开。对应到 SWA，先独立记录发现和握手结果，原生会话、任务状态和插件数据分开验收。后续由项目授权的单 Worker 交付和恢复验证执行，再以同一基座接科研或行业场景。[DeepSeek SuperAgent](https://github.com/deepseek-ai/dsh-superagent-prototype) · [Anthropic](https://www.anthropic.com/research/managed-agents)
- Google 的实验显示多 Agent 收益受任务结构影响。`Trial by Trace` 分开评估任务完成与 Harness 可靠性。验证时分别记录发现、握手、任务和恢复，协作收益使用真实任务比较。[Google Research](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/) · [Trial by Trace](https://arxiv.org/abs/2610.32285)

## 验收

- Linux 上用 DeepSeek Harness `0.2.1-rc.5` 和 OpenCode `1.19.5` 验证 PATH 发现、版本探测和 ACP v1 握手。额外验证绝对路径注册、无效目录拒绝和超时进程回收。
- `go test -mod=readonly ./cmd/swarm ./internal/adapters/rolecards`、相关清单和项目发现检查、Go 依赖检查、Windows amd64 CLI 交叉编译通过。
- 公开 Muse Kubo 的 Dossier 样本通过 CLI 导入和卡片校验。四种格式验证角色指令往返，导入工具许可为空。
- 模型任务执行、恢复、行业包运行和插件联调沿各自项目的权限与验收流程推进。
