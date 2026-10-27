# 独立 journal 容量预算

实现与验证由 Root 统筹，委派与成果模块负责人实施，integration_review 独立审核。当前安装来源为 `31be1c06`，本任务支撑[角色、异构委派与项目开发验收](swa-role-delegation-20261027.md)。[20261023 容量任务](swa-result-capacity-20261023.md)保留当时的决定和检查结果。

## 实际失败与根因

数据根 `/workspace/swa-n4-acceptance-31be-01`、runtime `4da1898c-b205-4664-9e33-cd5139fde844` 的实际 Pi N4 已观察到四个 Worker 共同输出时间区间。指定停止的 Worker 已按取消结算为 Task `failed` 并释放资源，原停止结算修复通过该实际路径。其余两个正常完成 Worker 的 journal 分别为 15,034,969 和 16,108,476 字节，对应原 provider 来源为 9,209,983 和 8,429,963 字节。journal 超过旧 12 MiB 读取界，原 provider 来源仍在界内。

最小复现是对上述现存 journal 按原消费者的 UTF-8 字节统计和 12 MiB 判定读取；即使原生成果已完成，也会在完整读取前拒绝并阻止 Task 结算。runtime journal 保存累计状态记录，其容量不能与 provider/native 单份原始来源共用同一预算。需要统一成果读取、journal 重放与结算读取的消费者，保留原解析、完整行和来源核验。

本轮整体仍为失败。原 Run 请求 `6484c4b4-9ed6-47cd-83c8-1e8a4ff90cb9` 保持 `unknown`，CLI 与服务均退出 6。四个原生 Worker 已有完整退出记录；遗留 Controller 经准确所属核验后人工终止，daemon 自行退出。原请求、任务账、失败记录和来源保留，人工收尾不计为自动资源清理通过。

## 容量合同与实现范围

Root 根据本轮真实来源批准独立 journal 预算。这是现有验收范围内的实现调整，未将该数值记为用户直接指定。

| 对象 | 独立上限 |
| --- | --- |
| provider/native 原始来源 `source_bytes` | 12 MiB |
| 每个 runtime journal 的实际 UTF-8 字节 `journal_bytes` | 32 MiB（33,554,432 字节） |
| 每个 journal 的行数 `journal_rows` | 100000 |
| 完整结果 JSON `result_bytes` | 96 MiB |
| task.result/run.export 实际响应 `response_bytes` | 128 MiB |
| 其他动作响应 | 16 MiB |

运行时 journal 的相关消费者和验收 driver 统一使用独立 journal 预算。完整 journal 行、epoch/sequence、snapshot、实际原生成果、身份、读取前后来源一致性与秘密检查继续保留。provider/native 读写界、单行界、任务清单、请求输入和其他传输界沿原合同；不压缩、迁移、修补、截断或更换原来源。

结果 JSON 与实际响应仍分别计量。Go 默认转义、run_view 和 envelope 计入实际响应；任何单项或汇总超限均完整拒绝，不以扩大 journal 为由绕过其余限制，不自动重发未知请求。

## 已测组成与未验部分

只读计量已取得导出的 journal rows 为 41,910,450 字节、provider 的 JSON 字符串为 28,507,945 字节、native JSONL 的 JSON 字符串为 321,254 字节；随后使用成熟完整重放与 renderer 测得四份 snapshot 合计 268,490 字节。已测组成合计 71,008,139 字节，距 96 MiB 结果界尚有 29,655,157 字节。该数值尚不含 decoded native 结果投影、summary、来源元数据、外层 envelope 和 Go 再编码，不能作为完整 export 成功依据。

准确 snapshot 计量已由 Root 执行并退出 0。前置原 12 条规则通过，生成 `.verification/cloud-setup/question-ask/case-0P9JO5/question-ask.cjs` 中的成熟 fold/renderer 入口；只读脚本为 `.verification/role-delegation-20261027/measure-journal-capacity.mjs`，实际报告为 `.verification/role-delegation-20261027/journal-components-31be-01.json`。原 journal 全行、sequence 与 schema 检查通过，数据库保持不变。完整 JSON 序列化、RPC/HTTP 编解码和 CLI 输出会保留多份数据；本次组件测量的进程内存不是完整运行时峰值。

## 局部验证与下一步

Root 设置 `SWA_JOURNAL_CAPACITY_DB` 指向原 N4 只读数据库，执行 `node --test tests/swa-cli-headless/question-ask.test.mjs`，14/14 通过、无跳过。包含 SQLite 实际 UTF-8 字节正好 32 MiB/超过一字节、100000 行/超过一行的边界；四份原 journal 均完整重放，两个超过旧限制的来源分别保留 5323/4870 行，snapshot 与前置计量一致。来源、结果和响应预算继续分别验证。日志为 `.verification/role-delegation-20261027/journal-capacity-r1.log`，退出 0。

`pnpm typecheck:swa` 退出 0，日志为 `.verification/role-delegation-20261027/journal-capacity-typecheck-r1.log`；两个验收 driver 的 Node 语法检查及 `git diff --check` 通过。独立 Reviewer 接受三个生产消费者、两个验收入口、边界检查及规格。此次局部验证没有模型或服务调用，没有修改原失败任务账。

下一步由 Root 冻结提交并完整构建，在新安装上执行真实 N4/N6、完整成果及导出，观察实际响应与内存使用。严格模式继续如实报告取消子任务失败；其余任务完成及资源自动释放分别核验。完整导出与新安装验收尚未通过。
