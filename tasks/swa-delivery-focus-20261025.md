# SWA 成果交付与开发流程精简

用户于 2026-10-25 授权按代码审阅修正过度工程化。基线为 `378f8d75f590df7bdd4bc931f971423e43c2c4c1`，工作分支为 `fix/swa-delivery-focus-20261025`。

## 本轮结果

- Worker 启动不再等待没有调度作用的 CPU 采样；实际 Worker 额度、权限和生命周期保持有效。
- 普通 `run.export` 交付原 Run 已记录的任务成果，保留未完成项、原运行状态和未验收状态。`--audit` 使用完整原生来源检查。普通导出不读取完整日志，不把缺失成果补成成功。
- 导出继续核查项目、Run、Task、原 Worker 关联和已知凭据；身份冲突、权限拒绝或密钥过滤失败仍拒绝。账号来源变化不在本轮解除。
- Pi 边界测试使用当前协议源码；历史安装检查由明确输入启用。
- Linux 日常 `pnpm check` 纳入可移植 Pi 边界与普通导出安全规则测试。
- 普通修复按影响范围实施和验证，权限、终止进程、迁移和发布保留独立审核。当前状态与历史记录分别维护。

## 验证

覆盖混合完成与未完成任务的成果导出、完整审计选择、原 Run 关联、凭据过滤和 CLI 文件写出。执行受影响 Go/TypeScript 检查、公开契约检查及可移植 Pi 边界测试；不为文档整理重跑模型。已有 N4 停止失败及 N6 未验状态继续保留。

独立 Reviewer 审查了 CPU 采样移除、普通导出与审计分工、测试可移植性和流程精简。审查发现普通导出需要核对最初记录的 Dispatch/session 绑定，已修正并加入同 provider/model 会话换绑拒绝用例。

实际执行结果：

| 检查 | 结果 |
| --- | --- |
| `go test ./cmd/swa ./internal/workspace/app -run TestRunExport -count=1` | 两包通过；包括命令模式校验、实际部分成果落盘与未结算审计拒绝 |
| `node --test tests/swa-product-acceptance/pi-driver-boundaries.test.mjs tests/swa-cli-headless/run-view.test.mjs` | 16 通过，1 跳过；跳过项须显式提供历史安装候选 |
| `node --test tests/swa-cli-headless/recorded-export-security.test.mjs` | 2 通过；真实过滤函数配合构造读取端口，覆盖四 Provider 凭据、OpenCode 输入签名密钥、来源改变与错绑；不代表真实账号验收 |
| `tsc --project runtime/swa-orca/tsconfig.json --pretty false`；`tsc -b web` | 均无诊断，通过 |
| Web `swaObservation`、`swaQuestionAnswer`、`api/swa` 定向测试 | 24 通过；API 测试使用真实 Go HTTP 服务 |
| `pnpm check:contracts` | 264 个实例和生成类型一致检查通过；OpenAPI lint 保留 29 个警告 |
| `node scripts/check-architecture.mjs --swa`；`node scripts/check-dependencies.mjs` | 均通过 |
| 两个调整为 `--audit` 的验收脚本 `node --check`；`git diff --check` | 均通过 |

本地使用 Node 24.22.1、pnpm 11.27.0、Go 1.27.2。仓库固定的 Node 24.16.0 在本环境启动发生 segmentation fault；依赖按冻结锁文件安装，本地仅关闭 engine-strict 版本拦截，仓库版本与锁文件未改。完整固定工具链安装验收尚未执行。首次检查还发现未指定 Go 路径、测试构造缺少实际 Dispatch/Pi 私有子目录，修正环境与构造输入后对应检查通过。

本轮没有模型调用、新安装、Windows 运行或 GUI 浏览器端到端验收。普通导出不补取尚未写入任务记录的模型输出；缺少原会话绑定、账号来源失效或历史 Pi 共享账号形式仍会拒绝普通导出。N4 活动停止、完整树退出、N6 和父任务继续仍按 STATUS 保留待验状态。
