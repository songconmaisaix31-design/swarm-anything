# Windows Swarm CLI 派发修复

- 用户于 2026-10-29 明确要求使用 Swarm CLI，并批准在独立分支修复阻塞该调度的缺陷。
- 基线：已安装版本 `893fb8852e15109ca9a99f1bd51d83ea249a37b8`。
- 分支：`codex/swa-windows-dispatch-20261029`；工作目录：`C:/Users/DW/Documents/ChatGPT/swa-windows-fix`。
- 复现：真实 Windows 服务中 `controller open`、`task create` 成功；`worker start` 请求 `1c286be8-773c-46ca-ba3d-f669c0742d06` 返回 HTTP 409 / `operation_unknown`，原生校验报告创建选项只适用于新工作树。实际 Worker 列表为空，原请求仍 pending，未重发。
- 原因：`controller-helper.ts` 使用 `worktree: 'current'`，却把 Worker 名称同时写入仅供新建工作树使用的 `name` 字段。上游 `prepareLocalWorkerStart` 明确拒绝这个组合。
- 修复：Worker 名称只传入已有 `taskTitle`；同步严格准入比较，保持原任务、Agent、模型、输入和作用域校验。
- 写入范围：`runtime/swa-orca/src/controller-helper.ts`、`runtime/swa-orca/src/controller-admission.ts` 和本任务记录。主 Agent 单轨完成修复、测试及提交；不修改其他工作树。
- 验证：完整 strict TypeScript、架构检查、完整 Windows 候选构建和真实独立安装；通过真实 Swarm CLI 创建控制端、任务、分析 Worker，取得实际输出并停止、释放、获取成果和关闭。验证中发现的新错误保留原结果并继续定位。
- 运行范围：固定公开 `swarm-anything` main 源码，真实 OpenCode 2.0.31 / `deepseek/deepseek-v4-pro`，原生工具关闭；没有模型结果前不记为调用成功。
- 旧失败请求和私有数据保留；不自动重放未知请求，不修改已安装的旧候选或其数据库。

## Structured 模型选择

- 安装后的 `89a726a` 已通过工作树参数校验；真实派发请求 `ddb8c091-8a71-46a4-8300-e29c50611668` 随后被仅支持旧 TUI 版本的模型探测拒绝，Worker 列表为空。
- `local-worker-start.ts` 在已确定的 Structured 模式下使用 ACP 会话自己的模型应用与核验；只有终端模式执行 TUI 启动探测。先向实际 host 查询指定工作树的 Structured 支持，保持原生适配器版本、模型、账号和工具权限检查。
- 写入范围增加 `third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/worker/local-worker-start.ts`。执行完整 strict TypeScript 和 Windows 包构建，并以新独立安装真实运行模型验证，不将通过静态检查当作模型启动成功。
- 独立后台在自己的设置库中启用 Structured Pi/OpenCode 路由，并在派发预留之前检查实际工作树支持；不支持时立即拒绝。`host-entry.ts` 和 `native-methods.ts` 纳入写入范围。真实 `fe2de7ea` 安装验证确认：仅修改模型预检仍被默认终端路由阻塞。
- 独立后台的 `nativeChatPermissionMode` 固定为 `ask`，保留禁用工具策略。`1e72dd4e` 产生真实 Structured Dispatch `ctx_611df4a14e0b`，实际启动因默认 `full-access` 与受限策略冲突被拒绝；该错误不能通过移除受限检查解决。
