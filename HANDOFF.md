# SWA 开发接续

当前按用户提供的《SWA-改造总方案与任务清单》开发，功能规格见 [SWA_REDESIGN](docs/SWA_REDESIGN.md)，任务和实际检查见 [本轮任务](tasks/swa-redesign-20261104.md)。用户要求功能与性能优先，删除自我证明文字，使用 Swarm CLI 调用本地 Agent，参考 orca-cli、orchestration 的协作能力。

## 工作目录与版本

- 产品目录：`C:/Users/DW/Documents/ChatGPT/swarm-anything`。
- 开发分支：`codex/conversational-swarm-20261104`。
- 角色卡与 CLI 提交：`33323d4582c5701193d1675d886df87a996e96c6`，已 push。
- 共享角色 API、SQLite 和远程 CLI 正在同一分支继续实现。
- 既有执行 CLI 源码：`C:/Users/DW/Documents/ChatGPT/swa-windows-fix`，提交 `9ca7c9e0c545f5f60999acb970d1866f8d66135b`，本轮当前只读使用。

## 已有功能

`cmd/swarm` 提供角色 list/show/new/edit/validate、交接格式校验。六张默认角色位于 `roles/builtin`，Schema 位于 `contracts`。Domain 提供工具列表语义、角色预算与交接字段选择；`internal/adapters/rolecards` 使用 JSON Schema 和 YAML 库解析。

共享角色管理按 SPEC §22.1 接续：Swarm App 负责用例，SQLite 复用 Swarm 事务与既有幂等表，HTTP 与远程 CLI 使用同一服务。相关真实 SQLite、HTTP 和 CLI 检查已通过，准确命令由任务文件维护。

## 接续动作

1. 完成共享角色管理的准确源码审查、检查与提交。
2. 接入现有 Swarm 执行能力，完成单角色会话、任务和成果持久化。
3. 完成 SSE、恢复、指定停止与角色交接，再实现聊天网页及安装引导。

当前 Swarm 服务由本聊天工具会话持有，监听 `127.0.0.1:64914`，数据根为 `C:/Users/DW/AppData/Local/SwarmCli/validation-data/conversational-20261104`。操作入口和实际回执位于已忽略的 `.verification/swarm-redesign-20261104/`。当前审查控制端为 `term_5b4ddfa0c025ab4efdebfacbcc35ca85`；角色审查 Worker 为 `ctx_95d4e0c52fd3`，会话设计 Worker 为 `ctx_7c21803f3e35`。结束时按 Swarm CLI 停止、释放和关闭。

原生验证使用公开固定项目和已允许的工具范围。资源参数见 [RESOURCES](docs/RESOURCES.md)。旧产品和 Windows 结果见 [Windows 任务](tasks/windows-compatibility-20261029.md)，研究与正式实验沿各自任务处理。
