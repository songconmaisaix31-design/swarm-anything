# macOS arm64 移植

## 第二轮：Worker 生命周期与模型目录

依据完整读取的 [MACOS-PORT-BRIEF-2](../MACOS-PORT-BRIEF-2.md)，在同一分支从 `f290e2602fca2ccfcad66c01fc8086c2042f5dfb` 继续，只做本地主题提交。现有 `127.0.0.1:8787` 服务及 `~/Documents/SWA-macOS-validation/fl-data-parent/d` 保持原状；验证使用新的安装、短数据根和 8788。

修改范围为 Go Darwin 直接子进程监督器、Node 消费者、原生 Controller 身份、官方 CLI 模型发现、相关测试与说明。Go 和配置观察分别由原 Codex 子代理负责；独立 Reviewer 只读审查进程信号、管道失联与退出证据，主负责人处理消费者和实际安装验收。未使用外部 Agent 服务。

`swa darwin-worker-supervise ABS_PROGRAM ...` 是内部直接子进程入口，使用独立进程组、fd3 事件与 fd4 控制通道。停止请求绑定完整 v1 身份及规范 UUID，由同一 Go 事件循环核验、发送信号和回收直接 child；kqueue 观察 EXIT/FORK，后代仅观察，不按裸 PID 或进程组终止。`reaped`、子进程退出码/信号与 `tree:unknown` 分别记录，监督器返回 6。Node 不把未回收或缺失最终事件当作完成，管道异常采用有界收尾。

Pi 1.5.0 的模型观察仅调用实际官方 `--list-models`，不读取账号秘密文件；本次授权模型为 `omlx/CyberTiel-MLX-MTP`。`configured` 与模型目录按实际观察返回，认证保持 unknown。Codex 继续要求显式 `SWA_CODEX_API_KEY_HOME`，未设置时未配置。现有 Pi 会话来源合同固定为 1.0.1，1.5.0 会话合同和整树释放尚未证明，因此产品 `control.start/send/stop` 仍 unknown；选择阶段明确拒绝，不进入读取原生 Pi 账号的旧策略。Linux bubblewrap 能力保持 unavailable。

验收入口分别为 `tests/swa-cli-headless/darwin-worker-installed.mjs`（真实 8788 服务、人工授权、capabilities、正式 run）和 `tests/swa-cli-headless/darwin-pi-lifecycle.mjs`（同安装监督器下官方 Pi 只读调用与身份停止）。两者证据分开，直接 CLI 输出不作为 SWA Run 或导出成功证明。本轮实际结果与限制在完成执行后补充，日志目录为 `.verification/macos-port2/`。

## 第一轮记录

任务依据：完整读取的 [MACOS-PORT-BRIEF](../MACOS-PORT-BRIEF.md)。基线为 `d9d979303b074a021a8f7e13038b3e2e45615b9f`，工作分支 `codex/macos-arm64-port`。用户授权无人值守完成实现与本机验证；按任务要求分主题本地提交，不推送。

主负责人修改 Go 平台实现、测试和说明；Node Worker 修改 runtime 与 daemon 身份消费者；打包 Worker 修改 Darwin 构建、安装及检查脚本。进程与权限方案经过独立审查；审查中发现的 ACL 与注册前 fork 窗口修正由主负责人复核并纳入统一测试。使用当前 Codex 原生子代理及继承模型，无外部 Orca/模型账号调用。

跨语言契约为 `swa.darwin-process-identity.v1`：规范十进制 PID、UID、微秒启动时间，`darwin-boottime:sec:usec` 启动标识，present/absent 状态和实际 proc_pidpath。未知查询返回 6。原 service owner 字段保留，平台显式为 darwin；持久字段 `linuxStartTicks` 在此平台承载微秒字符串。

独立方案审查确认只读内核查询方向；全树释放仍有无法证明的边界。注册前 fork 无法追溯，即使未收到 NOTE_FORK 也保持整树未知。不将已观察后代退出当作全部任意 fork 后代退出，不自动接管同次系统启动中带旧 daemon 记录的数据根。

本次日志保存在 `.verification/macos-port/`。历史固定授权工具在 macOS 明确拒绝历史执行包，避免借平台移植扩大旧项目授权。

## 本机实际结果

验证日期：2026-11-07，America/Los_Angeles。真实主机 `Darwin arm64`；`sw_vers` 返回 macOS **27.2（26B123）**，与任务说明的 macOS 26 不同。Go 1.27.3，构建 Node 24.16.0、pnpm 11.27.0，候选 Node 24.21.0，Apple clang 21.0.0，Python 3.9.6。工具缓存位于仓库 `.verification/macos-port/`。未修改系统 PATH、launchd，未推送。

已验证安装源码：`4178cb19c32634f61f4aa81bbf8ecba3dc35f88b`。

| 实际命令 | 结果 | 原始输出 |
| --- | --- | --- |
| `go build ./...` | 退出 0，无诊断 | `.verification/macos-port/go-build-final.log` |
| `go vet ./cmd/swa/...` | 退出 0，无诊断 | `.verification/macos-port/go-vet-final.log` |
| `go test ./cmd/swa/... ./internal/...` | 退出 0，所有目标包通过 | `.verification/macos-port/go-test-final.log` |
| `go test ./cmd/swa/... -run Darwin -v` | 5 项通过：真实身份、子进程及退出、ACL、脱组后代、私有目录 | `.verification/macos-port/go-darwin-final.log` |
| `node scripts/check-architecture.mjs --swa` | 退出 0，261 个包符合依赖边界 | `.verification/macos-port/architecture-scoped.log` |
| `pnpm --dir web build --manifest` | 退出 0，Vite 构建成功 | `.verification/macos-port/web-build.log` |
| `pnpm typecheck:swa` | 退出 0，无诊断；完整打包中再次通过 | `.verification/macos-port/node-typecheck.log` |
| `node --test runtime/swa-orca/src/darwin-boundaries.test.mjs` | 8/8 通过，包括实际 Pi/Codex 版本探测 | `.verification/macos-port/node-darwin-tests.log` |
| `node --test tests/swa-cli-headless/pi-source-boundaries.test.mjs` | 指定候选内审核过的 Pi 1.0.1 和 Node 后 8/8 通过 | `.verification/macos-port/node-pi-final.log` |
| `node scripts/check-swa-darwin-package.mjs` | 10 项拒绝检查通过 | `.verification/macos-port/package-tests.log` |

Go 命令使用 `/opt/homebrew/bin/go`，`GOPATH`、`GOMODCACHE`、`GOCACHE`、`TMPDIR` 分别指向 `.verification/macos-port/` 下的 `go`、`go-mod`、`go-cache`、`tmp`。初次完整测试因 Web 产物缺失失败；生成真实 Web 资产后原命令通过。首次 Pi 回归缺少明确安装参数，原失败日志保留于 `node-pi-boundaries.log`。

## 构建与安装输出

实际构建命令（子进程 PATH 使用仓库专用 Node，`SWA_PNPM_CLI` 指向同工具目录的 `pnpm/bin/pnpm.cjs`）：

```sh
node scripts/build-swa.mjs --output "$PWD/dist/swa-macos-arm64-01" --python /Library/Developer/CommandLineTools/usr/bin/python3
```

`build-candidate-03.log` 的实际结果：

```json
{"source_revision":"4178cb19c32634f61f4aa81bbf8ecba3dc35f88b","platform":"darwin-arm64","edition":"cli","node":"24.21.0","native_modules_built":["node-pty"]}
{"native_platform":"darwin","native_arch":"arm64","node":"v24.21.0","actual_pty":{"exitCode":0,"signal":0,"output":"swa-native-check\r\nSWA_PTY_INPUT:swa-native-check\r\n","pid":42488},"actual_watcher":"create_observed"}
```

以上是原始 JSON 的相关字段，完整输出保留在日志中。候选包含 `swa`、`server`、`node/node`、完整私有 runtime、`install-swa.mjs`、`VERSION` 及许可证。固定 Node 归档、二进制及 headers SHA-256 校验均通过，候选路径闭包检查通过。

实际安装：

```sh
dist/swa-macos-arm64-01/node/node dist/swa-macos-arm64-01/install-swa.mjs --package "$PWD/dist/swa-macos-arm64-01" --destination ~/Documents/SWA-macOS-validation/install-4178cb19 --protected-root ~/.codex --protected-root ~/.pi --protected-root ~/.claude --protected-root ~/.config/opencode
```

`install-01.log`：退出 0，`ok:true`、`platform:darwin-arm64`、`owner_uid:501`、`private_mode:0700`、`path_modified:false`。安装后原生 PTY/文件监听再次通过。`swa --version` 实际输出 `4178cb19c32634f61f4aa81bbf8ecba3dc35f88b`，`--help` 输出保存在 `~/Documents/SWA-macOS-validation/run01/help.txt`。

## 真实服务、观察授权和关闭

执行 `tests/swa-cli-headless/darwin-installed.mjs`，传入上述安装根、新目录 `~/Documents/SWA-macOS-validation/run01` 和四个真实账户保护根。该入口实际执行：

```sh
~/Documents/SWA-macOS-validation/install-4178cb19/swa serve --data-dir ~/Documents/SWA-macOS-validation/run01/data --port 8787 --protected-roots ~/.codex:~/.pi:~/.claude:~/.config/opencode --json
```

readiness 实际字段：`ok:true`、`http:http://127.0.0.1:8787`、`runtime_pid:42777`、`server_pid:42848`、runtime ID `3069328e-735f-4783-a371-b9f2a7cab15f`。保持运行后，在新建测试 Git 项目上通过正常 HTTP 接口创建仅含 `observe` 的 Grant 与短期 token，再执行 `swa capabilities --json`。所有临时凭据仅在内存中传递，未读取既有账户秘密，未将 cookie/CSRF/token 写入输出。未开放目录、Agent 控制、工具或模型调用。

实际发现结果：

| Agent | installed | 版本 | 规范化可执行路径 |
| --- | --- | --- | --- |
| Pi | available | 1.5.0 | `~/.pi/agent/bin/pi`，为 `~/.local/bin/pi` 的真实目标 |
| Codex | available | 0.167.0-alpha.3.2 | `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`，为要求的内置 Codex 入口真实目标 |

`configured`、`authenticated` 和 macOS 原生 Worker 进程控制保持 unknown。完整 capabilities/readiness 与关闭日志位于上述 run01 目录，汇总日志为 `.verification/macos-port/installed-02.log`。

SIGINT（Ctrl-C 对应信号）后实际输出：

```json
{"all_observed_exited":true,"fork_inventory_complete":false,"fork_observed":true,"observed_count":44,"owned_count":0,"type":"darwin_service_descendants"}
```

服务退出码 **6**。独立调用安装后的 `swa darwin-process-identity`，PID `42776`（serve）、`42794`（daemon）、`42777`（Node）、`42848`（HTTP）全部返回 `state:absent`。`shutdown.json` 明确保存 `complete_tree_release:unknown`。服务已停止，没有注册后台服务。

首次使用仓库内较长数据路径时 Unix socket `listen EINVAL`，该失败保留于 `installed-01.log` 和 `.verification/macos-port/installed-01/`；原进程已结束。使用短的新私有目录后通过启动与能力发现。

## 未满足项与实际限制

- **尚未达到任务全部完成标准**：无法证明捕获注册前及两次快照间的全部脱组后代，正常关闭保持退出码 6，不宣称 Linux 等价整树释放。已观察后代退出与任意后代完整性分别报告。
- Darwin 原生 Worker、模型执行、恢复、停止及正式成果导出未验证；Linux 专属 bubblewrap/provider 能力保持拒绝或 unknown，没有借 POSIX 分支放开。
- 可用内存量 unknown，报告真实 CPU 数量与物理内存总量。无 cgo 构建不能核对程序路径/ACL，安全边界保持拒绝。
- 此次为 CLI 候选；Web 产物用于 Go HTTP 资产测试，未构建 combined 候选，未使用视觉或浏览器验证。
- 实测平台为 macOS 27.2；macOS 26、Intel 和独立新机器均未验证。未签名、公证或发布。
- 本地分主题提交保留，不推送。后继应先解决可证明的完整进程生命周期，再开放相应能力；不能把本次启动成功作为完整移植验收。
