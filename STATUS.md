# SWA 当前状态

当前开发分支为 `codex/conversational-swarm-20261104`，按 [对话式蜂群方案](docs/SWA_REDESIGN.md) 执行。具体任务、命令和检查结果见 [本轮任务](tasks/swa-redesign-20261104.md)。

| 功能 | 当前结果 |
| --- | --- |
| 角色卡与交接卡格式 | JSON Schema v0.1、Go 校验器、六默认角色及三份示例已实现 |
| 角色 CLI | 本地 list/show/new/edit/validate 和 handoff validate 可运行，提交 `33323d458` 已 push |
| 交接规则 | 字段选择、来源保留、原卡不变及预算边界检查通过 |
| 共享角色管理 | SQLite、版本控制、幂等、HTTP 与远程 CLI 已实现；真实专项检查和准确源码 Swarm 审查通过，提交 `29c715503` 已 push |
| 任务执行 | 已安装 `swa` 客户端提供 Worker 派发、读取、停止、释放及成果导出；当前产品的对话会话尚待接入 |
| 会话、SSE 与三角色接力 | 待开发 |
| 聊天网页、setup、doctor、跨平台安装 | 待开发 |

已运行的角色相关 Go 检查、九份资产校验、架构检查和完整构建通过。`pnpm check:contracts` 使用项目 Node 调用真实 Redocly、样例和生成检查，退出0，保留13项既有警告。网页首包 gzip 为199.50KB。

开发协作使用 Swarm CLI，实际 Worker 为 OpenCode 2.0.31 / `deepseek/deepseek-v4-pro`。本轮第一次审查中的连接拒绝、无效工具标记和固定上下文变化分别记录于本轮忽略目录；有效测试计划已取得接受结论。

用户已确认每项目、按角色启用原生工具的五条护栏，具体要求见 QUESTIONS。护栏测试计划由 Swarm Worker 接受；实现尚未接入。实际 Codex 0.164.0 `command/exec` 探测显示 Windows 沙箱需要系统根读取权限，只读配置下项目写入被拒绝；文件工具须经 `os.Root` 约束。

资源整理已完成5.03GiB汇总包，`7z t`通过；约21.1GiB重复文件已清理，完整本地备份保留。已重新发起夸克账号授权并提供官方链接，上传等待用户授权。清单、保留位置和后续动作见[资源归档](tasks/resource-archive-20261104.md)。

旧基线的完整检查仍有真实 Bilibili/arXiv 来源和 L1 输入限制，见 [Windows 复验](tasks/windows-compatibility-20261029.md)。完整产品验收和发布尚未完成。
