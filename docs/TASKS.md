# 开发任务

当前按 [SWA 对话式蜂群](SWA_REDESIGN.md) 开发，实施与验收见 [本轮任务](../tasks/swa-redesign-20261104.md)，当前结果见 [STATUS](../STATUS.md)。协作使用 Swarm CLI，本地资源按 [RESOURCES](RESOURCES.md) 安排。

| 顺序 | 交付功能 | 依赖 |
| --- | --- | --- |
| 1 | Role/Handoff Card Schema、校验、默认角色与共享角色管理 | 现有 Go、TypeScript、SQLite |
| 2 | chat/run/stop/sessions，单角色成果入库与两个真实 Worker 并发 | 角色和现有 Swarm 执行能力 |
| 3 | SSE 增量、游标续传、停止与背压 | 持久会话和事件 |
| 4 | handoff、来源、自动接续、预算与三角色接力 | 会话与角色 |
| 5 | 聊天网页、角色切换、交接卡、工作项、长列表和分包 | CLI 与共享 API |
| 6 | setup、doctor、安装、示例、使用说明与贡献流程 | 已验核心功能 |

各阶段对应附件 A–F 任务，性能、权限、备份和依赖随功能检查。逐项结果写入同一任务文件。

## 既有任务

- [Windows 可用性](../tasks/windows-compatibility-20261029.md)：已有路径、进程、SQLite 和 Agent 检查；外部来源及 L1 输入限制见原任务。
- [既有 Swarm CLI](../tasks/swa-cli-v1-20261020.md)：原生执行、控制端和安装来源，供当前产品复用。
- [整合规划](META_PLAN.md)：产品历史、Workspace/Attention/Swarm 分工与旧工作包。
- [科研预印本](../tasks/research-preprint-20261019.md)、[科研续行](../tasks/restart-product-research-20261019.md)：沿各自资料、论文和授权范围执行。
- [正式 V4 运行](../tasks/M6-V4-daily-operation.md)：按原实验条件处理。
- [v0.2](../tasks/v0.2-discovery-split.md)、[v0.3](../tasks/v0.3-capability-board.md) 和 [L1–L4](../tasks/cognitive-stack-L1-L4.md)：保留独有需求及其冻结、实验和输入条件。
