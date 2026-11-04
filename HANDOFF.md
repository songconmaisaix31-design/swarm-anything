# SWA 开发接续

当前按用户提供的《SWA-改造总方案与任务清单》开发，功能规格见 [SWA_REDESIGN](docs/SWA_REDESIGN.md)，任务和实际检查见 [本轮任务](tasks/swa-redesign-20261104.md)。用户要求功能与性能优先，删除自我证明文字，使用 Swarm CLI 调用本地 Agent，参考 orca-cli、orchestration 的协作能力。

## 工作目录与版本

- 产品目录：`C:/Users/DW/Documents/ChatGPT/swarm-anything`。
- 开发分支：`codex/conversational-swarm-20261104`。
- 当前提交：`29c715503640dc9648bf3bdde80a113ec3cafd58`，已 push。角色卡、共享角色 API、SQLite 与远程 CLI 已实现并通过专项检查及 Swarm 源码审查。
- 既有执行 CLI 源码：`C:/Users/DW/Documents/ChatGPT/swa-windows-fix`，提交 `9ca7c9e0c545f5f60999acb970d1866f8d66135b`，本轮当前只读使用。

## 已有功能

`cmd/swarm` 提供角色 list/show/new/edit/validate、交接格式校验。六张默认角色位于 `roles/builtin`，Schema 位于 `contracts`。Domain 提供工具列表语义、角色预算与交接字段选择；`internal/adapters/rolecards` 使用 JSON Schema 和 YAML 库解析。

共享角色管理按 SPEC §22.1 接续：Swarm App 负责用例，SQLite 复用 Swarm 事务与既有幂等表，HTTP 与远程 CLI 使用同一服务。相关真实 SQLite、HTTP 和 CLI 检查已通过，准确命令由任务文件维护。

## 接续动作

1. 完成用户要求的夸克网盘归档及本机资源清理，上传前保留本地文件。
2. 实现已确认的五条角色工具护栏，接入单角色会话、任务和成果持久化。
3. 完成 SSE、恢复、指定停止与角色交接，再实现聊天网页及安装引导。

本轮 Swarm Worker 均已通过 CLI 停止、释放，控制端已关闭；Swarm 服务与角色 HTTP 实测服务均已停止。运行数据保留于 `C:/Users/DW/AppData/Local/SwarmCli/validation-data/conversational-20261104`，调用入口和结果位于已忽略的 `.verification/swarm-redesign-20261104/`。下一次派发须启动 Swarm 服务和新控制端。

夸克 skill 安装于 `C:/Users/DW/.agents/skills/quarkclouddrive`，官方安装检查通过，版本1.0.25。用户已在浏览器完成授权，CLI 后继登录仍返回未完成；已请求用户提供跳转地址的 code，通过官方 `login --token` 完成连接，不反复自动登录。旧归档 `D:/C-drive-cleanup-20261029.7z` 的7-Zip完整性检查通过。223个历史验证程序文件共6138481720字节，已打包成1259509972字节的 `cleanup-archives/validation-binaries-20261104.7z`，完整性检查通过。文件清单、归档和资源检查在本轮忽略目录；上传成功后才清理对应本地副本。

新产品已获准在明确登记的项目中按角色使用原生文件与命令工具，须实现目录 tripwire、命令人类审批、角色权限、现有事件审计和随时停止。准确要求见 [QUESTIONS](docs/QUESTIONS.md)。资源参数见 [RESOURCES](docs/RESOURCES.md)。旧产品和 Windows 结果见 [Windows 任务](tasks/windows-compatibility-20261029.md)，研究与正式实验沿各自任务处理。
