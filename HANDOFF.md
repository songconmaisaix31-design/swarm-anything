# 接管说明

先读 [STATUS](STATUS.md) 和[本轮任务](tasks/swa-role-delegation-20261027.md)。当前分支 `codex/heterogeneous-agent-20261027`，基线 `ecec4d72`；交付入口为[角色与异构 Agent PR #10](https://github.com/songconmaisaix31-design/swarm-anything/pull/10)，上游为 #6→#7→#8→#9。

用户要求角色默认实际启动、Agent 自主委派、明确项目权限下的真实开发、能力发现与浏览器重连，以及依赖链整合。Windows 验证已明确暂留空。Linux 阶跃星辰与不限预算沿既有授权；项目开发工具的新授权以 QUESTIONS 和本轮任务为准，未授权用户作品不开放。

Node 24.16.0、pnpm 11.27.0、Go 1.27.2 均在现有 `.verification/cloud-setup/activate.sh` 中；frozen install 使用显式 `--store-dir .verification/cloud-setup/cache/pnpm-store`。基线检查通过，首批角色/委派/界面与隔离执行器局部结果见任务；原件在 `.verification/role-delegation-20261027/`。当前 PID namespace 一致，宿主执行通道可用 bubblewrap；嵌套执行环境会拒绝 uid-map，不能把该结果误报为宿主能力。

两种 CLI 的原生 shell 已接通并完成必要局部验证；当前安装 `31be1c06` 的完整构建、安装、D12 12/12、无模型 HTTP/Web/正常退出均通过。实际角色验收已确认 Pi/OpenCode 版本发现、Pi 默认角色/模型启动及同请求复用；OpenCode 显式覆盖在创建 Worker 前被旧 TUI 模型规则拒绝。结构化启动专用准入的局部检查和独审通过，待统一构建。最新 N4 `run_f52d63acb2e7` 已实际确认停止 Task 的取消结算和释放，但两个正常完成 Worker 的 journal 超过原 12 MiB 读取限制，正在修复三个消费者的独立 journal 预算。原 Run 请求 `6484c4b4-9ed6-47cd-83c8-1e8a4ff90cb9` unknown、CLI/serve 退出 6及人工进程收尾记录保留，不重放或改账。

用户最新批准的固定四副本已重新逐文件核对并删除，可用约 4.29 GB，操作记录为 `.verification/cloud-setup/space-role-31be-20261027-17/operation-01/`。当前 I31be、全部归档、原数据、来源目录和失败证据保留。OpenCode 模型准入和 journal 容量两项修复的局部验证及独审均已通过；后者 14 项规则包含原失败来源完整重放，类型检查退出 0。下一步冻结重建，先验角色，再验 Pi → OpenCode → Pi 开发闭环及 N4/N6。实际服务 owner 为 `.verification/role-delegation-20261027/run-role-acceptance.mjs`，支持 roles/delegation/n4/n6；N4/N6 成果审阅需保留可写 stdin。

角色默认不同模型的测试使用新独立 Pi 来源 `/workspace/swa-stepfun-role-models-20261027-01`，默认 `stepfun/step-3.5-flash-2603`，显式覆盖为 OpenCode `stepfun/step-3.5-flash`。官方 CLI 已读到两个配置模型，容量为保守客户端限制；默认 Pi 已实际启动，OpenCode 覆盖与完整模型结果尚待通过。凭据不得读取或输出到对话。开发测试仍可用旧独立 Pi 来源。公开只读 Go SDK 位于 `/workspace/swa-public-toolchains/go-1.27.2`，服务工具链由 `SWA_PROJECT_TOOLCHAIN_ROOTS` 显式选择，不能挂载主仓库的私有 setup 目录。浏览器使用同一 owner 服务及现有 Cookie，入口 `tests/swa-product-acceptance/browser-observe.mjs`。

#6 的 main 冲突已解，四个上游分支已普通 merge/push：#6 `489b099e`、#7 `d4dcb720`、#8 `d724b40e`、#9 `8e753114`。它们的最终文件与各自合并前一致，只有祖先关系更新；#10 首批实现 `6428a888` 后以 `a7bff4c1` 吸收 #9，已推送。没有合并或发布 PR。

Windows 无模型安装的历史通过版本为 `d0c7dfee`；旧接续记录见[历史 HANDOFF](https://github.com/songconmaisaix31-design/swarm-anything/blob/378f8d75f590df7bdd4bc931f971423e43c2c4c1/HANDOFF.md)。
