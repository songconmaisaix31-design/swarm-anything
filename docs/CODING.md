# 代码组织规范

本文件落实 [AGENTS](../AGENTS.md) 的代码约定。业务规则与接口契约以 [SPEC](SPEC.md) 和当前任务为准；资源限制见 [RESOURCES](RESOURCES.md)。全部开发 Agent 使用本文件，模块新增约定经主 Agent 确认后统一维护。

## 目录与模块

保持现有 Go、React、TypeScript、SQLite 和目录。当前 SWA 业务上下文为 Workspace、Swarm，保留 Judgment 的纯业务规则和端口；当前入口与归属见 SPEC §21.5。认知和资料实现分别归独立 Astrocyte、Attention Mirror 仓库，跨产品调用须经过显式集成；旧组合来源见 [LEGACY](LEGACY.md)。新增模块先经主 Agent 确认并写入规格。

现有代码使用 `internal/<context>/domain`、`internal/<context>/app`、`internal/adapters` 与 `cmd/swa`、`cmd/swa-server`，前端位于 `web`，进程外契约位于 `contracts`。现有模块继续遵守 SPEC §3 的 Domain 无 I/O、app 定义消费方端口、adapter 实现端口和入口组装约束。

新增和修改代码统一采用 SPEC §3 的 Domain/App/Adapters/Composition 依赖关系。Domain 无 I/O；App 声明所需端口并调用 Domain；Adapters 实现端口；Composition 创建具体实现并注入依赖。CLI/MCP/HTTP 只负责协议边界，共用 App 的业务语义。保持现有包边界，不为分层整理重构已有模块；简单存取只保留必要层次，不建立只有转发作用的层次。

## 命名和接口

- Go 包名、文件名和目录沿用所在模块的现有形式；导出名称使用 PascalCase，内部名称使用 camelCase，标识符保持英文。
- TypeScript 类型和 React 组件使用 PascalCase，函数和变量使用 camelCase；文件命名沿用所在目录约定。
- 业务名称沿用 SPEC 的统一语言，避免同一概念出现多套名称。
- 同类型模块复用现有模块的目录和接口形式；不为尚未确认的需求预留抽象。
- 进程内接口使用明确的 Go 类型，需要取消或期限的外部操作使用 `context.Context`；进程外 API 以 OpenAPI 和版本化 Schema 为准。
- 端口只暴露当前用例所需操作；参数、返回值、错误码和权限条件写入对应规格与测试计划。
- 跨模块只调用对方的显式公开接口，传递 ID、版本化 DTO 或事件；禁止引用对方内部函数、内部数据结构或直接访问对方业务表。
- 并行前定稿跨模块接口；变更交主 Agent 裁决后再更新规格、实现和调用方。

## 错误与权限

错误发生时立即返回或抛出；保留原错误与必要上下文，不捕获后继续，不使用 fallback。必要依赖直接 import；成熟格式使用现有第三方库解析。

复用现有 `internal/apierrors`、`ServiceError` 和契约中的错误封装。API 的 `code`、`message`、`retryable`、`request_id`、`required_action` 按真实情况返回，不把未知交付写成失败或成功，不重发未知操作。新增错误码必须同步公开契约及调用方。

权限、批准、预算、租约和来源检查遵守用例的当前规则；界面状态和缓存不替代实际鉴权。错误路径与拒绝条件进入审核后的测试计划。

## 注释、格式与变更

- 新增和修改的说明性注释使用中文，术语及标识符保留英文；注释解释必要的规则和原因，避免重复代码含义。
- Python 文件开头不添加 docstring 或 shebang。底座保持 Go/TypeScript/SQLite；summarize 等外部工具可以使用所需 Python 依赖，Morphogenesis Python 研究环境独立保留，具体范围见 QUESTIONS。所需依赖直接 import，不使用条件 import。
- Go 使用 gofmt；TypeScript 使用现有 lint、类型检查和项目约定，不引入另一套格式规则。
- 通过文件编辑工具修改代码；长脚本先写文件，临时文件放入仓库已忽略的专用目录。
- 禁止 mock、虚假数据、伪造协议与仅为通过检查而增加的 workaround。已有冻结范围的限制按真实情况记录。

## 实现与检查顺序

Worker 先依据规格、验收、业务样例与变更边界编写测试计划，选择必要的相关检查，说明关键失败路径和受影响消费者。普通命名与已批准范围内的局部组织由负责人决定；影响目标、验收或授权的未决项按 QUESTIONS 处理。Reviewer 或用户审核通过后实现；遗漏场景补充并重新审核。Worker 实际运行选定检查，失败后修复并复验，PR 附命令、结果和真实限制。

涉及依赖边界的改动提交 PR 前执行现有 `scripts/check-architecture.mjs`；越界先返修。该脚本检查 Domain/app/context/transport 的导入边界，业务调用与动态注册还需对应验证。新增模块在其任务中补充必要规则，检查结果按实际覆盖报告。

构建、测试和 Go vet 遵守 RESOURCES 的当前资源安排。没有业务代码修改的管理文档清理执行文档核对和链接检查；不把文档检查结果写为功能验收通过。
