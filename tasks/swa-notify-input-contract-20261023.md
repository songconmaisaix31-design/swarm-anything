# 通知使用已批准的文件输入

基线 `6190b77320fcef5535eff4e076fd9e28bbbd7d62`，分支 `integration/swa-task-cards`。Root 负责实现，acceptance_audit 独立审查；计划位于 `.verification/n4-notify-6190-20261023/plan.md`，已接受最小消费者修复与局部验证范围。

实际 N4 中，验收驱动为 `handoff.notify` 发送 `text`，公开 Go 验参返回 `validation_failed: the action does not accept text`，原请求查询为 `absent`。Go 已规定 `input_file` 并将读取结果放入 `invocation.input`，原生通知消费者却读取 `command.text`。这与 Pi journal 关联失败、原生网络 403 分别记录，原失败请求不重放。

通知现在使用已批准的文件路径，原生消费者保存 Go 读取的完整原文，包括末尾换行。公开字段限制、当前项目权限、调用者与 Controller/根任务/后代范围、稳定请求去重及同事务回执保持。邮件仍为 `audit_only`，不创建 Task/Worker，也不自动向模型输入。

局部验证已执行 `node --test tests/swa-cli-headless/collaboration-records.test.mjs`，4 通过、0 失败；测试实际读取仓库 README，检查原文保存、同请求去重、缺失 input 或注入 text 被拒且无孤立邮件。`go test ./internal/workspace/app -run 'Test(HandoffNotifyRequiresApprovedInputFile|RoleAndDiscussionDoNotAcceptExecutionAuthority)$' -count=1` 退出 0，driver 的 `node --check` 与 `git diff --check` 均退出 0。原日志和退出码位于 `.verification/n4-notify-6190-20261023/`。CM 统一执行合并后的 runtime 严格 TypeScript，退出0、日志为空，原件在 `.verification/n4-journal-6190-20261023/strict-r1/`。六域源码与Go/SQLite局部已获独立限定接受，合并driver最终SHA `c3737074ac9152f90407a9273fd9cde2046d89f13446a518f293120f28041551`。完整公开 HTTP→native 通知与 N4/N6 尚未验收。
