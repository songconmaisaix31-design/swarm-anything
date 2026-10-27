# 接管说明

先读 [STATUS](STATUS.md) 和[本轮任务](tasks/swa-role-delegation-20261027.md)。当前分支 `codex/heterogeneous-agent-20261027`，基线 `ecec4d72`；交付入口为[角色与异构 Agent PR #10](https://github.com/songconmaisaix31-design/swarm-anything/pull/10)，上游为 #6→#7→#8→#9。

用户要求角色默认实际启动、Agent 自主委派、明确项目权限下的真实开发、能力发现与浏览器重连，以及依赖链整合。Windows 验证已明确暂留空。Linux 阶跃星辰与不限预算沿既有授权；项目开发工具的新授权以 QUESTIONS 和本轮任务为准，未授权用户作品不开放。

Node 24.16.0、pnpm 11.27.0、Go 1.27.2 均在现有 `.verification/cloud-setup/activate.sh` 中；frozen install 使用显式 `--store-dir .verification/cloud-setup/cache/pnpm-store`。基线检查通过，首批角色/委派/界面与隔离执行器局部结果见任务；原件在 `.verification/role-delegation-20261027/`。当前 PID namespace 一致，宿主执行通道可用 bubblewrap；嵌套执行环境会拒绝 uid-map，不能把该结果误报为宿主能力。

当前安装 I6b 的来源为 `6b9acc891472cb2757788809088c50f0d6abce61`，完整构建、归档、解包、新安装和无模型 HTTP/Web/正常退出均通过。首次 D12 11/12 的固定等待未证明 EOF 前置条件；同安装双顺序诊断后仅修测试，测试后继 `1b017749` 的完整 D12 12/12，并核产品源码一致。原失败与未知事件顺序保持。实际角色 `/workspace/swa-role-acceptance-6b9a-01` 再次确认 Pi 默认模型和同请求复用；OpenCode 已越过旧 TUI 检查，但新会话继承 full-access，被受限 ACP 在 spawn 前拒绝。原请求 `ec7fae4c-6cdc-4338-b4f4-bf64918047cc` 不重放；两 Grant 已撤销，Pi 完整退出，Controller 人工终止后 daemon 自行退出，原 serve 6 保留。

后继 [OpenCode 权限初始值](tasks/swa-opencode-worker-permissions-20261027.md) 与 [取消交接正文](tasks/swa-handoff-outcomes-20261027.md) 修复及独审已通过：受控 OpenCode 新 Worker 保存 ask，原拒绝门不变；父续轮收到绑定实际回执的状态及原文，空原文可交接。8 项启动规则、15 项问答/交接/日志规则、239 包架构检查及统一 runtime 类型检查通过，尚未构建安装。N2 成功/取消与 N6 消费者均已同步。

旧 I31be N4 `run_f52d63acb2e7` 已实际确认取消结算和释放，因两份 journal 超过旧 12 MiB 失败；32 MiB 修复已在 I6b，但 I6b 的 N4 从未启动。原请求 `6484c4b4-9ed6-47cd-83c8-1e8a4ff90cb9` unknown、CLI/serve 6及人工收尾记录保持。下一步在包含两项新修复的同一安装验证角色、Pi → OpenCode → Pi 开发、取消交接、同服务浏览器及 N4/N6；实际 owner 支持 roles/delegation/delegation-cancel/n4/n6，N4/N6 成果审阅需可写 stdin。

用户批准的17批四副本已删除，清理后约4.29GB；完成 I6b 安装和检查后约1.0GB可用。18批仅两个 I6b candidate/package 中间副本已完成归档逐文件核对及 check-only，新增删除问题已提交用户，尚未获准或执行；见 `.verification/cloud-setup/space-role-6b9-20261027-18/`。I6b/I31be、全部归档、任务、凭据与失败原件保留。两根清理只提供阶段模型空间，不能据此启动下一次完整构建；额外旧成功编译中间目录与旧 I31be 正在只读调查，尚无新增删除授权。

角色默认不同模型的测试使用新独立 Pi 来源 `/workspace/swa-stepfun-role-models-20261027-01`，默认 `stepfun/step-3.5-flash-2603`，显式覆盖为 OpenCode `stepfun/step-3.5-flash`。官方 CLI 已读到两个配置模型，容量为保守客户端限制；默认 Pi 已实际启动，OpenCode 覆盖与完整模型结果尚待通过。凭据不得读取或输出到对话。开发测试仍可用旧独立 Pi 来源。公开只读 Go SDK 位于 `/workspace/swa-public-toolchains/go-1.27.2`，服务工具链由 `SWA_PROJECT_TOOLCHAIN_ROOTS` 显式选择，不能挂载主仓库的私有 setup 目录。浏览器使用同一 owner 服务及现有 Cookie，入口 `tests/swa-product-acceptance/browser-observe.mjs`。

#6 的 main 冲突已解，四个上游分支已普通 merge/push：#6 `489b099e`、#7 `d4dcb720`、#8 `d724b40e`、#9 `8e753114`。它们的最终文件与各自合并前一致，只有祖先关系更新；#10 首批实现 `6428a888` 后以 `a7bff4c1` 吸收 #9，已推送。没有合并或发布 PR。

Windows 无模型安装的历史通过版本为 `d0c7dfee`；旧接续记录见[历史 HANDOFF](https://github.com/songconmaisaix31-design/swarm-anything/blob/378f8d75f590df7bdd4bc931f971423e43c2c4c1/HANDOFF.md)。
