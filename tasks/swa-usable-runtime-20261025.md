# 启动与页面故障修复

基线 `34d5071b`，分支 `fix/swa-usable-runtime-20261025`。本轮继续修复启动、页面恢复和使用说明中的问题。

- Linux 构建解压不恢复归档的用户身份，支持无法映射归档 UID 的容器。
- 服务在创建锁之前识别外层 `/proc` 挂载，提示所需运行条件；不使用错误的 PID 管理进程。
- 浏览器请求存储损坏或不可读时保留页面、显示对应操作错误，并允许重新读取记录。
- 删除默认页面和开发说明中重复的核验、原件与置信度表述，保留操作结果、权限和错误处理信息。

本地 Node 24.16.0 崩溃来自不完整的解压文件。原压缩包完整，重新解压后可以使用项目固定版本；路径为 `.verification/toolchains/node-24.16-recovered/bin/node`。

## 检查结果

开发检查使用 Go 1.27.2、Node 24.16.0。安装包内 Node 为既有固定版本 24.21.0。

- `go test ./cmd/swa -run 'TestLinuxServiceRejectsOuterProc|TestRun|TestQuestion' -count=1` 通过。`TestLinuxServiceRealProcessTree` 仍失败，错误明确指向外层 proc 挂载；没有改成跳过。
- 固定 Node 运行 Vitest 的 `swaObservation.test.ts`、`swaRoles.test.ts`、`swaQuestionAnswer.test.ts`、`modelCLIPermission.test.ts`，32 项通过；清理错误返修后重跑受影响的角色与问答文件，15 项通过。覆盖存储读取、写入、删除失败及保留原请求；相关文件 ESLint 通过。
- 实际 Go HTTP 的 `src/api/swa.test.ts` 6 项通过；`tsc -b web` 通过。
- `node scripts/build-swa.mjs --edition combined --output "$PWD/dist/swa-usable-final-20261025"` 通过。使用 `SWA_PNPM_CLI=/opt/codex/tools/pnpm/bin/pnpm.cjs`、`SWA_BUILD_PYTHON=/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python` 和本地 `ASTROCYTE_GO`。构建包括 runtime 类型检查、原生 PTY 编译、Go、Web 与包检查；源码版本为 `8c9e866138b2c404c6b455e8b834f653ecb71842`。
- `node scripts/install-swa.mjs --package "$PWD/dist/swa-usable-final-20261025" --destination /workspace/scratch/60bb5e16d068/.verification/swa-install-8c9e866 --protected-root /root` 通过。包内和安装后的 PTY 输入输出、文件监听、子进程回收检查通过。
- 安装后的 `swa --help` 通过；用安装的 server/Web 以无原生执行器模式启动，健康接口、页面和 JavaScript 资源返回 200，随后正常关闭。检查脚本为本地 `.verification/multi-agent-build-smoke.mjs`。
- 安装后的 `swa serve` 在当前容器返回退出码 4 和 `/proc 不属于当前 PID namespace`，未启动服务子进程。
- `git diff --check` 与构建脚本语法检查通过。独立审查接受源码及存储清理返修。

日志位于 `.verification/usable-runtime-*.log`。

## 剩余问题

当前进程在内层 PID namespace，`/proc` 来自外层；重新挂载所需操作被环境以 EPERM 拒绝。完整服务进程树需在正常挂载环境继续检查。模型凭据未提供，混合 CLI 任务、N4 停止和父任务继续尚未完成模型验收。

Chromium 下载返回 `Site Unavailable`，浏览器端到端测试未执行。Windows 本轮未测。改动作为草稿 PR 提交，未发布安装包。
