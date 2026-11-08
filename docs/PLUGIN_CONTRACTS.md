# 插件契约 v1

独立 Astrocyte 管 Event/Signal、注意力、知识、经验、人工经验批准与 Sleep；Attention Mirror 管资料、沉淀、Taste、机会及准入；Morphogenesis 管科研任务、租约、实验和成果继承。SWA 管项目权限、Run/Task/Worker 和固定来源引用。

SWA 数据库只增加 `swa_plugin_connections`、`swa_plugin_references` 与 `swa_plugin_events`。不把资料正文、经验正文、认知权重或插件审批状态复制进这三张表。旧数据不会自动搬迁、删除或改写；历史来源引用保留原版本。

## 固定结构

`contracts/plugins/v1` 是进程外 JSON Schema 来源。版本不兼容时新增目录和版本，不能修改 v1 字段含义。

| 结构 | 必需信息 | 语义 |
| --- | --- | --- |
| Connection | 项目、插件、传输、`configuration_ref`、契约版本、scopes、递增版本 | `configuration_ref` 是尚未解析的配置标识，当前仅校验格式，不能含命令或密钥；保存连接不会启动程序、核实连接或获得账号 |
| Reference | 项目、插件、对象种类、ID、正版本 | 正文仍由插件依当前权限读取。固定引用不表示内容已验证或成果已接受 |
| Event | source/event_id、项目、实际时间、correlation/causation、固定对象引用 | 只关联来源，无自由 payload；事件项目必须等于引用项目 |

当前连接 scopes 只有 `references.read` 与 `events.record`。空 scopes 撤销这两项插件操作。它们不包含批准、执行、模型调用、文件权限或对外发布。

## 当前实现

`internal/plugins/app.Service` 声明存储与当前授权端口，`swastore.DB` 实现同库事务、连接 CAS、固定引用和事件身份去重。每个操作重查当前项目；服务层为未来 Agent 传输保留未过期、未撤销的项目 Grant 检查，且必须持有相应的 `read_context` 或 `observe` 动作。当前已组装的 HTTP 插件路由仅供已认证人类使用，没有开放 Agent token 路由。只有传输层已认证的人类可以改变连接及 scopes。调用正文中的 actor/principal 字段被严格拒绝。

`Record` 在一个事务内校验当前许可、保存固定引用与 `(source,event_id)`。同 ID、相同内容返回原记录；同 ID、不同内容返回 `version_conflict`。`Event` 查询原回执。`recorded` 只说明 SWA 保存了引用，不是源端签名、内容可信、插件消费、批准或任务执行证明。下游六步经验消费者必须再核源方原始完成收据和当前权限，不能直接用这张表判定经验有效。

本模块没有事件总线、自动重试、自动执行或通用进程启动器。网络断线或插件返回 `delivery_unknown` 时保持原请求身份，先查原插件回执；不能生成新 event_id 重发。SWA 已记录的入站引用不能代替源插件对外部副作用的确认。

## MCP 兼容

独立 Astrocyte 保持原五个工具名和 wire shape，见 `mcp-profile.json`。项目、会话和 principal 继续来自可信启动配置；工具参数不扩大授权。旧 `astrocyte.report_event` 使用随机 OriginKey，不能作为可盲重试的 v1 ingress。人工经验批准继续走独立的人类通道。

v1 引用事件不会自动调用旧工具。独立插件的 v1 ingress、outbox 消费和完成收据验证只有在各仓库实际实现并通过检查后才能写为接通；当前 SWA `recorded` 回执不包含这些结论。MCP 协议版本由连接双方协商，业务契约版本单独固定为字符串 `1`。

## 六步事实源

1. SWA 保存原任务完成收据和验收通道，提供固定 completion 引用。
2. Astrocyte 验证源方成败、轨迹及产物引用；不能跨进程传 SQLite 事务。
3. Interpreter 只起草 quarantine 候选，未知模型操作保留原 ID。
4. 人类在 Astrocyte 批准明确经验 revision。
5. SWA 在获准项目内检索 approved 经验，仅持久记录使用的经验 ID/revision；交接内容按原执行权限提供。
6. SWA 把后续完成引用送回 Astrocyte。Astrocyte 记录采用关系和实际结果，不由任务 completed 推断经验有益。

Attention Mirror 的准入事件只允许 SWA 幂等建立草稿；启动 Run 仍需当前人类批准的提案 revision 和项目执行权限。此跨插件消费者尚未由本模块实现。
