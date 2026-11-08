# 效果前准入的原请求投影

基线 `063adec6e802e733f47f407df80069b14fdedaf3`，分支 `integration/swa-task-cards`。collaboration_model 负责本任务，acceptance_audit 独立审查，Root 串行整合；release_audit 负责后继全新请求的实际单 Worker。原公开四文件、Pi/StepFun、ToolsOff 和现有预算授权继续适用，不重放旧请求，不改原安装或原数据库，不运行完整构建。

## 实际失败与最小复现

pi03 原件在 `/workspace/swa-worker-pi-03-YYQ8lz/evidence`。Worker 请求 `ebc8f902-e405-49f6-95fe-537c3e746db1` 返回 `operation_unknown`，正文为 `invalid original delivery invocation`，原父回执仍 pending/helper-input，原 `/native` 行不存在。错误字面唯一来自 `internal/adapters/swahttp/commands.go` 的严格 JSON 解码分支，尚未进入 `AdmitOrcaDelivery`。本轮没有模型输出证据，原业务 FAIL/完整树 UNKNOWN 保留；release_audit 的准确资源补充收尾单列，不修改原回执。

离线实际最小复现在 `.verification/worker-delivery-invocation-20261023/`：`diagnose.mjs` 仅读原父回执的 invocation，以真实 `invocationSchema.parse` 解析；原对象与解析后的对象深相等，序列化均为284632字节，低于原2 MiB门。`decode.go` 使用当前正式 `workspace.OrcaInvocation` 与原 `json.Decoder.DisallowUnknownFields`/单文档规则，两个输入均真实返回 `json: unknown field "handoff"`。原件为 `decode-WagzZj/`、`projection.log`/`projection.exit=0`、`decode.log`/`decode.exit=0`；完整公开上下文及非秘密来源 metadata 只保存在0600原件，不打印正文，不读取 auth/models，不发送 HTTP 或模型输入。

源码根因：`native-methods.ts` 的 Worker reservation 准备阶段把本地交接、角色快照放入 `invocation.spec`；`delivery-admission.ts` 随后发送整个 invocation。Go `OrcaTaskSpec` 未声明这些原生元数据，严格解码因此拒绝。Go handler 与类型自原 S4c 安装基底没有差分，不能归因于开发副本基底过旧。原 `AdmitOrcaDelivery` 消费 Command/Caller/Project/Scope/Input/Selection/顶层 Handoff，且其调用的 `validateOrcaHandoffResume` 明确要求 Handoff 与 Submission 不能并存；固定上下文来自完整 `Scope.Context`。

## 已裁定合同与写域

Root 接受仅在 `runtime/swa-orca/src/delivery-admission.ts` 内构造明确效果前准入投影，保持原 `command`、`caller`、`project`、`scope`、`input`、`selection`、可选顶层 `handoff` 和 `submission` 八个字段的值，不改任何嵌套字段；`scope.context` 完整保留。独立审查发现原七字段提议遗漏了上述 Submission 负条件，Root 已修正合同为八字段，继续由原 Go 规则拒绝冲突组合，不在 TypeScript 复制该判断。实际 HTTP fetch 消费这一投影。必要纯函数与类型留在同一个文件，不新增公共协议或文件层。

完整 invocation，包括 native `spec.handoff`、`role_snapshot` 与 `submission`，继续保留在原生账本、原请求绑定和 `workerTaskSpec`，不为满足解码而删改这些原件。Go 严格 Decoder、公开 TaskSpec、所有当前权限/Grant/原 Run 关联/实际输入文件/固定上下文与顶层 handoff 判断保持。私有准入的投影不替代原请求或原生派发证据。

其余写域仅本任务记录和 `.verification/worker-delivery-invocation-20261023/` 的必要实际原件诊断消费者；不修改 release_audit 的 runner、Windows checker、Go 产品、公共 schema。产品修改前先独立审核本计划；计划范围内实施和局部验证不另增加逐文件执行审批。

## 验证与停止条件

1. 原失败 MRE 已完成并保留；修后用同一原实际 invocation，通过真实 `invocationSchema.parse` 和本次正式投影函数产生准入 JSON。逐字段深比较原八个字段、完整 `scope.context`，并确认原对象未被修改；原 JSON 仍须由同一 Go Decoder 拒绝，投影 JSON 必须解码成功且恰一份文档。此检查不发 HTTP，不调用实际服务。
2. 对原已有真实顶层 handoff 来源（如果当前原件中存在）保留其完整字段；若当前 pi03 原件没有该字段，明确实际样本未覆盖父恢复，使用既有真实 SQLite 准入测试的 handoff 分支核其原规则，不能伪造已完成父恢复。
3. 运行 scoped strict TypeScript。运行 `go test ./internal/workspace/app -run 'TestOrcaDelivery|TestOrcaHandoff' -count=1` 的现有真实 SQLite/current authorization 规则，报告实际命中的测试数量与范围，特别是 Grant/固定上下文/顶层 handoff；不修改这些测试以迁就结果。
4. 将准确源码、MRE前后原件与局部结果交独立审查。任何新失败先保原件并解释最小复现和原因，不修改旧请求、放宽严格解码或跳过权限判断。源码接受后由 Root 固定新提交，release_audit 按原已准范围从 pi03 开发副本的实际四个输出保全并重编必要 entry，以全新数据/Grant/R 验证真实 Worker 启动、实际输入输出、stop/release 和正常关闭。开发检查不冒称同提交完整安装。

## 实现与局部实际结果

独立 Reviewer 已接受八字段计划 `90380bef079a34e559dcfe76d48fff70207a28b0f99f60b32a99228239000450`。唯一产品修改为同文件的 `deliveryAdmissionInvocation`，以原对象引用构造八字段投影，原 `fetch` 直接序列化其结果。产品 SHA 为 `6b7ec73f06e13b1a4ceb5d4dde58f5fd32bd9c9080fd5c27855380b560b4daa4`；没有改动 Go Decoder、权限规则、原账本或 native spec 的生产者。

修后回归消费者 `regression.mjs` 的 SHA 为 `e518b67b7da92d71c083c6a9285df86fc58eab5fd7c43c82f9f99acba2fe80d7`；沿原 Go 严格解码的 `decode.go` 继任 SHA 为 `5f95d0770b7b5259f044d1fb2b4446b42166dca671ce2cfefc309f7ddb585ec7`。原失败日志不覆盖。

- `regression.log` / `regression.exit=0`，实际输出目录 `projected-LDDked/`：同一 pi03 原对象经正式 schema 和正式投影，八字段与原对象逐字段相等，完整 `scope.context` 和原对象不变。投影 JSON 为282957字节，原对象仍为284632字节并保留 native spec。该实际原件的顶层 handoff/submission 均缺席，没有把该样本称为真实父任务恢复。
- `decode-projected.log` / `decode-projected.exit=0`：`go run .verification/worker-delivery-invocation-20261023/decode.go` 依次消费原件和修后投影；原件仍返回 `json: unknown field "handoff"`，投影通过同一正式类型、严格 Decoder 和单文档检查。没有 HTTP、服务或模型调用。
- `go test ./internal/workspace/app -run 'TestOrcaDelivery|TestOrcaHandoff' -count=1 -json` 退出0，原件 `go-rules.jsonl` / `go-rules.exit`。实际6组、50个子测试通过，包括 Grant 撤销/过期、固定上下文变化、当前权限、顶层 handoff 关联与 `TestOrcaHandoffBindingRejectedSQLite/submission` 的冲突拒绝；这些是原真实 SQLite 准入规则，未把规则输入当原生邮件或模型证据。
- 固定开发 Node 执行 `runtime/swa-orca/node_modules/typescript/bin/tsc -p runtime/swa-orca/tsconfig.json --pretty false`，使用8192 MiB heap，退出0且 `strict.log` 为空；`git diff --check` 退出0。

独立 Reviewer 已接受上述准确单产品源码及局部实际范围；Root 固定新提交后，由 release_audit 继续全新请求的实际 Worker 验证。修后真实 Worker、Windows 与 N4/N6 尚未验；旧 pi03 FAIL/pending 和完整树 UNKNOWN 保留。
