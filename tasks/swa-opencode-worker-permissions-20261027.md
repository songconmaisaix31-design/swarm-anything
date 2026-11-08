# 受控 OpenCode Worker 的权限初始值

本任务沿用 [角色与委派任务](swa-role-delegation-20261027.md) 的项目、模型和工具授权。分支为 `codex/heterogeneous-agent-20261027`。只修复新建受控 OpenCode Worker 的权限初始值；不修改用户全局设置、已有会话或其他 Agent 的权限。

## 原失败与根因

安装 `6b9acc891472cb2757788809088c50f0d6abce61` 的实际角色验收原件位于 `/workspace/swa-role-acceptance-6b9a-01`。Pi 默认角色和相同请求复用通过；OpenCode 显式覆盖请求 `ec7fae4c-6cdc-4338-b4f4-bf64918047cc` 在 `terminal_create` 返回 `provider_unavailable`。原请求和失败数据保持，不重新发送。

`service.stderr:66–86` 记录会话 `12bedc29-5dab-4c31-9e17-7fd027bf9799` 的 `AgentSessionPreSpawnError: The restricted OpenCode launch contract changed`。只读 SQL 投影确认实际 profile 设置和该会话的 `permissionMode` 都是 `full-access`；原生版本日志为 `2.0.31 --version`。原会话没有 provider handle 或 journal，lease 已释放且记录 `reservation failed before spawn`，私有目录没有原生数据库或 auth 文件。此次失败发生在 ACP Worker 启动和模型输入之前；版本查询子进程确实运行过。

最小因果路径为：Orca 默认设置 `nativeChatPermissionMode=full-access` → `structuredLaunchSeedOptions` → 显式 model 创建仍保留 `seededPermissionMode` → 原会话记录 `permissionMode=full-access` → `structuredAgentSessionLaunchPermission` → 受控 ACP 启动拒绝全权限。原受控拒绝门符合预期，不能通过放宽该门或更改全局设置处理。

## 实现合同

复用现有 launch admission，在 `createStructuredWorkerSession` 注册实际 Worker 身份之后、调用原生 create 之前增加 `workerSessionOptions` 私有回调。输入只有 `sessionId`、`agent`、`dispatchId` 和既有 `options`；没有安装回调时保持原值。

SWA 回调仅处理 OpenCode：核原 registry/Dispatch、原 pending 父子请求、当前角色与项目许可、准确 `2.0.31` 原生合同、structured 模式和唯一显式 model；不允许 effort 或额外选项。当前 Go 批准前后重新检查原选择、回执和身份，然后把 `permissionMode:ask` 交给原 create/record 路径。已有 record 不迁移；后续原选择检查要求受控 OpenCode record 保持 `ask`。原 ACP `fullAccess` 拒绝和每次项目工具准入继续执行。

修改范围：SWA `agent-launch-admission.ts`、Orca `structured-agent-launch-composition.ts`、`orchestration-structured-worker-session.ts` 和现有 `worker-start-mode.test.mjs`。权限方案已由独立 Reviewer 审核，Root 授权实施。

## 验证边界

定向规则调用实际 prepare、record 字段分离、权限解析和 ACP 启动构造，验证默认 full-access 被拒绝、受控 ask 保持原 model。SQLite、registry 和准入代码真实执行；仅安装发现和当前 Go HTTP 使用明确构造替身，版本查询也使用固定输入，完全不启动 CLI、服务或模型，不创建原生会话记录。

已执行：

- `node --check tests/swa-cli-headless/worker-start-mode.test.mjs`：退出 0。
- 激活 `.verification/cloud-setup/activate.sh` 后确认 Node `24.16.0`、Go `1.27.2`；`node --test tests/swa-cli-headless/worker-start-mode.test.mjs`：8/8、skip 0、退出 0，证据目录 `.verification/worker-structured-mode-20261023/rules-QEYqxA`。
- 同工具链 `node scripts/check-architecture.mjs --swa`：退出 0，239 个包符合原分层检查。
- `git diff --check`：退出 0。

首轮局部规则 6/8 保留在 `rules-jMqKRo`：ACP 测试未初始化 `AppEnvironment`，因此在读取公开测试路径之前失败；错误 execution_mode 已由严格 schema 拒绝，测试却要求后续错误码。修正公开 scratch 路径初始化和准确的 schema 错误断言后通过。另一次未激活工具链的架构命令在错误 PATH 中的 `go` 返回 `Unknown option: list`，未进入架构检查；使用指定工具链复验通过。产品拒绝规则未为这些测试放宽。

Root 统一执行 `pnpm typecheck:swa`，退出 0，日志 `.verification/role-delegation-20261027/permission-handoff-typecheck-r1.log`；最终独审通过。新安装及真实 OpenCode 角色启动尚未运行本次修改。规则通过不能替代真实启动。Windows 本轮仍未运行。
