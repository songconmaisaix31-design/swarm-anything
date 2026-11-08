# macOS arm64 移植

## 第二轮：Worker 生命周期与模型目录

按第二轮任务要求，在同一分支从 `f290e2602fca2ccfcad66c01fc8086c2042f5dfb` 继续，只做本地主题提交。现有 `127.0.0.1:8787` 服务及 `~/Documents/SWA-macOS-validation/fl-data-parent/d` 保持原状；验证使用新的安装、短数据根和 8788。

修改范围为 Go Darwin 直接子进程监督器、Node 消费者、原生 Controller 身份、官方 CLI 模型发现、相关测试与说明。Go 和配置观察分别由原 Codex 子代理负责；独立 Reviewer 只读审查进程信号、管道失联与退出证据，主负责人处理消费者和实际安装验收。未使用外部 Agent 服务。

`swa darwin-worker-supervise ABS_PROGRAM ...` 是内部直接子进程入口，使用独立进程组、fd3 事件与 fd4 控制通道。停止请求绑定完整 v1 身份及规范 UUID，由同一 Go 事件循环核验、发送信号和回收直接 child；kqueue 观察 EXIT/FORK，后代仅观察，不按裸 PID 或进程组终止。`reaped`、子进程退出码/信号与 `tree:unknown` 分别记录，监督器返回 6。Node 不把未回收或缺失最终事件当作完成，管道异常采用有界收尾。

Pi 1.5.0 的模型观察仅调用实际官方 `--list-models`，不读取账号秘密文件；本次授权模型为 `omlx/CyberTiel-MLX-MTP`。`configured` 与模型目录按实际观察返回，认证保持 unknown。Codex 继续要求显式 `SWA_CODEX_API_KEY_HOME`，未设置时未配置。现有 Pi 会话来源合同固定为 1.0.1，1.5.0 会话合同和整树释放尚未证明，因此产品 `control.start/send/stop` 仍 unknown；选择阶段明确拒绝，不进入读取原生 Pi 账号的旧策略。Linux bubblewrap 能力保持 unavailable。

验收入口分别为 `tests/swa-cli-headless/darwin-worker-installed.mjs`（真实 8788 服务、人工授权、capabilities、正式 run）和 `tests/swa-cli-headless/darwin-pi-lifecycle.mjs`（同安装监督器下官方 Pi 只读调用与身份停止）。两者证据分开，直接 CLI 输出不作为 SWA Run 或导出成功证明。日志目录为 `.verification/macos-port2/`。

### 第二轮实际检查

| 命令 | 实际结果 | 本轮日志 |
| --- | --- | --- |
| `go build ./...` | 退出 0 | `go-build.log` |
| `go vet ./cmd/swa` | 退出 0 | `go-worker-vet.log` |
| `go test ./cmd/swa/... ./internal/...` | 退出 0，所有目标包通过 | `go-all.log` |
| `go test ./cmd/swa/... -run Darwin -count=1 -v` | 18 个顶层测试通过，包含测试辅助入口、第一轮 5 项与新增 Worker 场景 | `go-darwin-final.log` |
| `node --max-old-space-size=8192 runtime/swa-orca/node_modules/typescript/bin/tsc --project runtime/swa-orca/tsconfig.json --pretty false` | 退出 0 | `typecheck-final.log` |
| `node --test runtime/swa-orca/src/darwin-boundaries.test.mjs runtime/swa-orca/src/darwin-model-configuration.test.mjs` | 17/17 通过，含实际官方版本/模型观察 | `node-darwin.log` |
| `node --test tests/swa-cli-headless/pi-source-boundaries.test.mjs` | 明确选择候选 Pi 1.0.1 和 Node，8/8 通过 | `pi-regression.log` |
| `node --test tests/swa-cli-headless/controller-startup.test.mjs` | 2/2 通过；真实 PTY/helper 两次 identify、Darwin 父链、EOF 退出 0 和 absent 复核 | `controller-startup-tests-02.log` |
| `node --test tests/swa-cli-headless/darwin-worker-consumer.mjs` | 新安装实际 Go/Node，5/5 通过；中文输入/EOF、伪造身份、TERM、KILL、通道失联、后代持有输出导致有界 unknown | `worker-consumer.log` |
| `node scripts/check-swa-darwin-package.mjs` | 10 项拒绝检查通过 | `package-regression.log` |
| `node scripts/check-architecture.mjs --swa` | 261 个包通过 | `architecture.log` |
| `pnpm --dir web build --manifest` | 退出 0 | `web-build.log` |

Go 沿用第一轮隔离的 GOPATH/GOMODCACHE/GOCACHE/TMPDIR；Node 使用第一轮专用工具链，安装检查使用新安装内 Node。Controller 补齐明确安装路径后真实测试通过。背压测试针对实际输出管道函数；观察失败测试使用真实 child 与失效 kqueue。伪造 PID/旧启动时间拒绝验证身份不匹配，不宣称实际诱发内核 PID 循环复用。

### 第二轮新构建和正式服务

冻结构建源码为 `fb41699e8f78456533a3db39d1487d786ac62e4a`，独立审查通过。构建命令：

```sh
node scripts/build-swa.mjs --output "$PWD/dist/swa-macos-arm64-r2-01" --python /Library/Developer/CommandLineTools/usr/bin/python3
```

实际 `build-01.log`：`platform:darwin-arm64`、`node:24.21.0`、`native_modules_built:["node-pty"]`；真实 PTY `exitCode:0`、输出包含 `SWA_PTY_INPUT:swa-native-check`，文件监听 `create_observed`。新安装 `~/Documents/SWA-macOS-validation/install-r2-fb41699e` 的 `install-01.log` 返回 `ok:true`、`private_mode:0700`、`path_modified:false`。构建后的测试脚本修正仅改变测试启动与输入路径，未修改安装载荷。

正常 HTTP 人工会话在新项目批准 `read_context/observe/start/send/stop` 与 `external_model_cli:pi`，临时 Cookie/CSRF/token 仅在内存中传递。最终服务使用 `~/Documents/SWA-macOS-validation/r2b/d` 与 `127.0.0.1:8788`，readiness 返回 `ok:true`，runtime PID 51582、server PID 51655。实际能力字段：

```json
{"configured":{"status":"available","model":"omlx/CyberTiel-MLX-MTP"},"model_catalog":{"origin":"probe","availability":"verified","models":[{"id":"omlx/CyberTiel-MLX-MTP","provider":"omlx"}]},"control":{"start":{"status":"unknown"},"send":{"status":"unknown"},"stop":{"status":"unknown"},"development":{"status":"unavailable"}}}
```

以上仅摘录实际字段；完整结果见 `r2b/capabilities.json`。正式命令实际运行：

```sh
swa run --agent pi --model omlx/CyberTiel-MLX-MTP --project bb3d600e-ca79-428f-96e6-4b409d164abf --workdir ~/Documents/SWA-macOS-validation/r2b/project --spec-file ~/Documents/SWA-macOS-validation/r2b/project/task.json --input-file ~/Documents/SWA-macOS-validation/r2b/project/input.txt --request-id c0ce105e-93a7-451e-b2f0-9ccb4ecc963d --timeout 60s --strict --export ~/Documents/SWA-macOS-validation/r2b/project/export --json
```

退出码 **4**，真实输出：

```json
{"ok":false,"request_id":"c0ce105e-93a7-451e-b2f0-9ccb4ecc963d","error":{"code":"unsupported_capability","message":"Pi 1.5.0 原生会话合同未验证，完整进程树释放 unknown；Darwin Pi 暂不允许执行","retryable":false,"required_action":"inspect_original_request"}}
```

因此没有可报告的 Run 终态、正式成果导出或已创建 Worker 身份，未伪造身份调用 `worker stop`。首个 `r2a` 检查因输入/导出路径在授权项目外返回 `scope_denied`；测试将路径放入其新项目后，`r2b` 到达上述原生能力拒绝，两个原始结果均保留。

8788 关闭的真实输出：

```json
{"all_observed_exited":true,"fork_inventory_complete":false,"fork_observed":true,"observed_count":44,"owned_count":0,"type":"darwin_service_descendants"}
```

退出 6；独立查询 serve 51581、runtime 51582、server 51655、daemon 51599 均 `state:absent`。完整记录在 `r2b/report.json` 和 `installed-02.log`。旧 8787 未参与这些授权、运行或关闭操作。

### 第二轮官方 Pi 调用与停止

实际命令：

```sh
~/Documents/SWA-macOS-validation/install-r2-fb41699e/node/node tests/swa-cli-headless/darwin-pi-lifecycle.mjs ~/Documents/SWA-macOS-validation/install-r2-fb41699e ~/Documents/SWA-macOS-validation/r2pi2
```

本机 `~/.local/bin/pi` 指向官方管理安装的 shell launcher；读取公开的 `install/current-version` 得到 1.5.0。监督器直接启动新安装 Node 与该官方版本的 `dist/bundle/cli.js`，避免绑定之后的 shell→Node exec 映像替换。调用明确关闭工具、扩展、MCP、技能、上下文文件和会话保存，仅使用已批准模型。首次 `r2pi` 的 print 模式因测试未关闭 stdin 等待 90 秒，之后所属 child 已按身份 TERM 并回收；补齐 EOF 后在新目录 `r2pi2` 复验，原始失败记录保留。

实际只读请求没有产生解释文本。官方 Pi 以 0 退出，但其真实 `message_end` 内容为错误，不能按 CLI 退出码判定模型成功：

```json
{"role":"assistant","content":[],"provider":"omlx","model":"CyberTiel-MLX-MTP","stopReason":"error","errorMessage":"507: {\"message\":\"Model 'CyberTiel-MLX-MTP' (20.77GB) does not fit under the dynamic memory ceiling (13.12GB). Close other apps to free RAM (macOS and other apps leave oMLX 13.12GB of the 29.00GB static cap, and oMLX itself uses 197.31MB of that), raise memory_guard_tier (safe → balanced → aggressive), or use a smaller model.\",\"type\":\"server_error\",\"param\":null,\"code\":null}"}
```

以上摘录第一次实际错误的字段；官方 CLI 自带的后续重试同样返回 507，动态上限在 13.10–13.17 GB 之间。未换模型、账号、调整 oMLX 内存策略或关闭其他应用。原始输出为 `r2pi2/read-only-model.stdout.jsonl`，监督器记录 `reaped:true, code:0, tree:unknown`，退出 6；PID 51886 独立查询 absent。

第二个实际 Pi RPC 进程接收 prompt 后返回 `response.success:true, disposition:started` 和 `{"type":"agent_start"}`。停止证据摘录：

```json
{"refused":{"request_id":"cb8aa521-ee7b-42e4-aca4-d86297c86f02","accepted":false,"reason":"identity_mismatch"},"receipt":{"request_id":"8f89cb05-7d03-497c-83e7-f9ece9d6dd56","accepted":true,"reason":"signal_sent"},"final":{"reaped":true,"code":143,"signal":null,"tree":"unknown"},"supervisorExit":6}
```

伪造启动时间被拒绝时原进程仍 present；正确完整身份停止后 PID 51952 独立查询 absent。完整 v1 身份、请求 UUID 和原生输出保存在 `r2pi2/stop-evidence.json`、`running-stop.json`、`running-stop.stdout.jsonl`。这验证直接官方 Pi 进程正在处理请求时的停止，不证明后端模型已经开始生成，也不代替产品 `swa worker stop`。

只读结果复核接受上述范围。历史证据文件的 `running_model_verified:true` 仅表示观察到 `agent_start`，最终测试脚本将该字段准确命名为 `request_processing_observed`；原始事件不变、不重写历史证据。最终内核复核的 8 个本次 Pi/监督器 PID 全部 absent，输出在 `pi-final-identities.jsonl`；旧 8787 listener 仍为 44967，输出在 `protected-8787-final.log`。

### 第二轮剩余限制与交付

- **第二轮全部完成标准仍未满足**：正式 SWA Run、成果导出和产品 Worker 停止尚未通过；不能据此让 FlowLens 选择该执行者。
- 直接子进程监督器已实际验证，尚未接入完整 ProviderProcessTree 释放合同；瞬间脱组后代完整性、全部后代释放和身份读取到信号间的 exec 映像窗口没有完整证明，继续 unknown/退出 6。
- Pi 1.5.0 原生会话、禁用工具、私有账号来源与恢复合同仍需完整适配；现有 1.0.1 回归通过不证明 1.5.0 等价。Codex 未提供显式 API-key 来源，本轮未调用其模型。
- 本地唯一批准模型实际受 oMLX 动态内存上限拒绝；没有成功答案。没有更改资源策略、其他进程或原 8787 服务。
- 新 8788 检查服务和本次已观察的直接 Pi 进程均已结束；旧 8787 的 listener 保持 PID 44967。真实执行平台仍为 macOS 27.2 arm64，macOS 26 未验证。
- 已复核 AGENTS 长期规则，无需修改；保留本地主题提交，不推送、不发布。原始测试日志在忽略的 `.verification/macos-port2/`，新安装与独立服务/模型证据在 `~/Documents/SWA-macOS-validation/`。

## 第一轮记录

任务依据：macOS arm64 移植任务说明（未随本分支提交）。基线为 `d9d979303b074a021a8f7e13038b3e2e45615b9f`，工作分支 `codex/macos-arm64-port`。用户授权无人值守完成实现与本机验证；按任务要求分主题本地提交，不推送。

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
