# 当前工作树 Worker 启动参数修复

基线为 `7ff3a7d7d7e029c2fc9e2ae1fb6b81da8e0d4f8f`，分支 `integration/swa-task-cards`。本任务只修复 SWA 向原生 Worker 启动方法传递的工作树参数；完整构建、旧安装及旧 UNKNOWN 请求保持原状。

## 实际失败与根因

S7ff 安装的 N4 原 Run 请求 `18752a1a-e72f-4f43-97c3-bfdff1d07cf7` 已完成 Controller 创建；Task 请求 `6fb4e04d-e4a7-53c1-a7d4-0639b1db5b7e` 和两个原生子操作均 completed。Worker 请求 `c853b7e2-b789-5652-a375-2d13783c083d` 保留 pending/helper-input，原错误为 `Creation and setup options apply only to new-child or new-top-level worktrees`，原生请求 ID 后缀为 `/native`。只读快照保存在 `.verification/controller-taskcreate-diagnosis-20261023/n4-7ff3a7d7-failure-01/snapshot.json`；原驱动结果在 `/workspace/swa-pi-n4-packet-7ff3a7d7-20261023-01/evidence/driver-report`。只有 ready 根 Task，Dispatch、Worker、resource 数量均为零；这不构成原生端完全没有副作用的证明，旧请求不重放。

最小触发组合是生产 `controller-helper.ts` 发送 `worktree:'current'` 和 `name:c.name`。上游 `worker/worker-start-validation.ts:prepareLocalWorkerStart` 把 `name` 与 `repo/baseBranch/setup` 归为新工作树创建参数，在 `createsWorktree=false` 时明确拒绝该组合。`local-worker-start.ts` 在此校验之后才执行工作树解析及 `db.createStartingWorkerDispatch`。原生 `name` 表示新 Git 工作树名称；SWA 的 Worker 标签已有 `taskTitle`。`controller-admission.ts:admitOrdinaryMutation` 精确核对相同参数，因此必须同步修复生产发送端和准入端。

## 写入范围与实现

- `runtime/swa-orca/src/controller-helper.ts`：只从 `orchestration.workerStart` 参数移除 `name`；保留 `worktree:'current'`、`taskTitle:c.name`、父任务、实际选型、固定 spec、超时及原请求 ID。
- `runtime/swa-orca/src/controller-admission.ts`：从同一实际 Worker 启动的精确期望对象移除 `name`。其余身份、原父回执、当前 Run、后代范围及逐字段核对保持不变；额外创建参数仍因精确匹配被拒绝。
- 本任务文件：记录计划、实际检查、独立审查与剩余限制。
- `.verification/` 下的实际开发集成计划、驱动和原件由 release_audit 负责，须独立审核准确 runner；不修改正式安装、旧 data 或旧请求。

不修改第三方校验、不创建新 Git 工作树、不改变 Controller 传输或 Worker Task 内容。`taskTitle` 和 `workerTaskSpec(invocation)` 继续保存名称与输入相关的既有语义。

## 验证与停止条件

1. 以本次实际失败作为未修复的原调用路径最小复现，核对 helper 参数、实际原生错误及原回执；不再次执行旧 UNKNOWN。独立审查上述两处精确差分及全部直接消费者，确认创建选项没有被放行。
2. 执行原 `runtime/swa-orca/tsconfig.json` 的 strict TypeScript 检查。传输、角色和其他未改动模块复用已取得的实际检查，不为同一语义重复全套测试。
3. 经 Root 当前授权，在独立 data、独立请求和当前公开四文件项目中执行一个真实 Pi/StepFun Worker，沿原 Go 权限、Controller helper、原 RPC、SQLite 和真实 provider 路径。ToolsOff、现有获准账号来源和最小固定任务保持；密钥只由原生消费者读取，不输出或散列。允许复用已退出的 r3 development 根，但须保留原 helper 备份、只局部编译受影响 runtime entry，并记录实际基底与修复源 SHA；本结果明确为开发集成，不作为同源正式安装通过。
4. 实际确认 `worktree:'current'`、`taskTitle`、同 Run/父 Task、原生启动回执、Dispatch/Worker/resource 身份、原输入和实际模型输出。随后原 `worker.stop` / `worker.release`、Controller close、Grant 撤销及服务正常 EOF；使用原进程观察器记录完整所属资源关闭结果。若原生命周期已释放，先观察原回执，不伪造重复成功。
5. release_audit 提交该单 Worker runner 的准确计划与来源，06 审核后才执行服务或真实模型。任何失败保留原请求状态和原件，先报告最小复现、根因证据、局部结果；不连续尝试完整构建。未完成的模型、资源或 Windows 结果保留 UNKNOWN / NOT_RUN，不修改验收条件。

06 已独立审核计划并限定接受两处参数修复；当前两处 `name` 已移除。执行 `node runtime/swa-orca/node_modules/typescript/bin/tsc -p runtime/swa-orca/tsconfig.json --pretty false` 退出0，诊断为空，原件为 `.verification/worker-current-worktree-20261023/strict.log` 和 `strict.exit`。源码 SHA：helper `6a19ff671d97536b16ff8d031d447deab303a0a9f35102a39532fc84e5b6f046`，admission `f7e8f03ed0615195e2fb9e8c29615095246da30eeea955e4348bae1b0b2e84cd`。

新 Worker 尚未运行；单 Worker runner 的准确来源和实际执行另行审核。开发集成必须局部编译 `host.cjs` 和 `controller-helper.cjs` 两个直接消费者，保留各自原件和实际 metafile。旧 S7ff 服务正常 EOF 后因为原 mutation 仍 pending 而退出6，观察器退出1；其确切残留 Controller/daemon 由原 owner 负责正常收尾，业务 UNKNOWN 保留。本修复不改变该既有失败处理或生命周期协议。
