# 全 Go 检查失败范围

主控在集成基线 `6195f4cfb6b32aedd43845443c029ecc11d5578d` 建立后运行 `go test -mod=readonly -json ./...`，退出1。检查开始时已有第05卡脚本改动，运行期间共享工作树继续修改，因此本次结果不代表最终准确提交的完整测试结论。原日志在本机忽略目录 `.verification/cloud-setup/go-full-tests.jsonl`，分类来自 `go-failures.json`，未复制凭据或完整业务日志。

统计为1142个通过事件、154个失败事件、61个跳过事件，包含子测试及其父测试。失败事件分类如下，不能把它们与另一平台、另一提交的历史68项直接比较。

| 直接观察到的原因 | 失败事件数 | 范围 |
| --- | --- | --- |
| 缺少 `ASTROCYTE_TEST_OUTPUT_ROOT` | 82 | 直接运行 Go 未经标准 `scripts/check.mjs` 创建专有输出根 |
| 缺少其他显式授权原件或输出路径 | 43 | 实际 DOM、publication、视频原件、论文快照、SQLite/receipt 等 |
| 外部公开来源不可达 | 13 | arXiv、Crossref、Bilibili 或 summarize 提取失败 |
| 缺少所选原生 CLI | 5 | OpenCode 等实际入口不在 PATH |
| 实际原生进程提前退出 | 3 | 未取得原生回复，保留 delivery_unknown |
| SQLite 旧测试未装配当前消息依赖 | 2 | 直接 unsupported_capability，或被旧断言误报为重放 |
| Relay 测试权限设置与期望冲突 | 1 | 未批准 reconcile 却期望200 |
| 只有子测试失败传播的父测试事件 | 5 | 不另作独立业务缺陷 |

上述分类区分设置不足、外部前置和测试配置问题，没有证明最终产品无回归，也没有替代真实原生发送、Windows Job 或 N Worker 验收。没有为通过检查填充假材料、放宽权限或改动非本卡业务与测试。

## SQLite“自动重放”断言

现有 `TestLocalProjectPermissionsTokensAndNativeReceiptsSurviveSQLiteRestart` 在 `internal/adapters/sqlite/local_agents_test.go:201` 报 `unknown request automatically replayed`。本卡隔离复跑：

```sh
go test -mod=readonly -count=1 -run '^TestLocalProjectPermissionsTokensAndNativeReceiptsSurviveSQLiteRestart$' -v ./internal/adapters/sqlite
```

实际退出1，同一断言失败，日志位于 `.verification/swa-product-acceptance/sqlite-receipt-recheck.log`。本次没有模型调用；原测试使用已有 `localNative` 离线实现，本结果不能代表真实原生能力。

测试通过默认 `NewLocalProjectService` 创建服务，没有装配当前消息发送要求的对象存储、原控制器读取器和发送 authorizer。`projects.go` 的 `SendNativeMessage` 调用 `sendPreparedNativeMessage`，后者首先调用 `native_messages.go` 的 `nativeMessageServices`；缺少这三个依赖即返回 `unsupported_capability`，尚未调用 `adapter.Send`。

测试第一次只检查错误非空，将前置拒绝也视为“未知投递已保留”；第二次又要求 `native.sends == 1`，实际仍为0，所以触发该错误文字。这是测试装配与当前发送契约不一致，不能据其文字断言生产重复发送。生产另有 prepared/send_attempted 及原操作回执约束；真实发送幂等是否通过仍需实际合法原生会话与请求证据。另一个 `TestConcurrentObservationCannotEraseAcceptedDeliveryReceipt` 明确报相同消息依赖缺失。

## Relay reconcile 权限断言

`cmd/server/relay_runtime_http_test.go` 的 `TestRelayPersistentRealHTTPReceiptsMutexAndRestart` 将项目动作配置为 start/send/observe/stop/resume，随后在297行期望 `/events/reconcile` 返回200。实际返回403、`approval_required`。

生产 `relay_lifecycle.go` 的 `ReconcileEvents` 明确使用 `permission(..., "reconcile")`，`relay.go` 对未包含该动作的当前项目设置拒绝。测试配置和期望不一致，不能将其归为网络失败或据此放宽生产授权。该非SWA路径未在本轮修复；相应失败保持记录。
