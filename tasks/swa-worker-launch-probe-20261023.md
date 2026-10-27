# Worker 已批准命令的实际安装探测

本任务基于 `381c9159` 的实际 pi02 开发检查，分支为 `integration/swa-task-cards`。负责人 collaboration_model；独立审查 acceptance_audit；真实开发单 Worker 由 release_audit 执行。用户原公开四文件、Pi/StepFun、ToolsOff 授权继续适用。本任务不重放旧请求，不运行完整构建，不修改原安装或原业务数据库。

## 实际失败与根因

pi02 原件位于 `/workspace/swa-worker-pi-02-ZP6Rmz/evidence`。请求 `20360144-5b05-4c37-b98d-7323b063d0e5` 返回 `operation_unknown`，正文为 `The approved Worker requires its native structured execution mode; terminal execution is not authorized`；原父回执仍为 pending/helper-input，原 `/native` 子回执不存在。SQLite 当前为一个根任务、零 Dispatch/Worker/resource，这些行数不代表整个原生执行树无副作用。原正常收尾和后继准确资源关闭由 release_audit 分别记录，原 UNKNOWN 不改。

只读私有 profile 实际 settings revision=1，`experimentalNativeChat=true`、`nativeChatProviders={}`、`agentCmdOverrides.pi` 缺席。实际 stderr 第20行是 `pi --version: did not start (Error: spawn pi ENOENT)`，第21行是 `structured-create-support ... installed-agent check refused (reason agent)`。已有模式检查在原子创建 Dispatch 前拒绝 terminal，符合源码。

`structuredAgentSupportsLaunch` 从私有 runtime settings 和 `resolveHostStructuredAgentLaunchEnvironment` 取得命令来源；后者使用真实 login-shell PATH，基线 PATH 即使关闭全量 shell 继承也会覆盖进程 PATH。已有发现流程用实际传入 PATH 解析并批准绝对 `selection.executable`，但 `launchAdmission.commandSettings(sessionId,agent)` 只在会话启动组合处使用。初始 Worker mode 探测以及 `resolveStructuredAgentSessionIntent` 的再次 create-support 探测均没有消费该选择。

## 最小实现与写域

复用现有可选 launch admission 和真实 support/version 消费者，不设置每个 Worker 的全局配置，不增加公开 RPC 字段。

1. `runtime/swa-orca/src/agent-launch-admission.ts`：抽取原 fresh Worker mutation/父回执、payload hash、controller/Run/workspace、选择和有效期检查。初始 probe hook 沿同一检查及当前 Go 准入取得该原请求的命令设置 `{agentCmdOverrides:{[agent]: quoted selection.executable}}`；实际模式的检查及末次同步检查仍位于原 atomic 创建之前。session create probe hook 用真实 `structuredWorkerIdentities` 和现有 `originalSelection(sessionId,agent,false)`，允许尚无 session record，但不得缺少真实 Dispatch/原回执绑定。实际 launch 的 commandSettings 检查保留。
2. `third_party/orca-v1.4.230/src/main/runtime/structured-agent-launch-composition.ts`：在原可选 admission 增加上述 Worker probe 与 session create probe 命令设置入口；无 admission 时返回 undefined，原桌面行为保持。
3. `.../runtime/rpc/methods/orchestration/worker/local-worker-start.ts`：在原 host mode 探测前取得初始 Worker 命令设置；传递实际原 mutation、controller、Run、workspace、agent。原 host mode、后续 guard、atomic/去重不改变。
4. `.../runtime/rpc/methods/orchestration-worker-start-mode.ts` 与 `.../main/agent-launch/agent-launch-mode.ts`：仅逐层传递可选内部 `StructuredAgentCommandSettings` 到原 support 方法；保留真实位置支持、异常与降级规则。
5. `.../runtime/session-tabs/structured-session-create-support.ts`：原 support 方法增加可选内部命令设置；创建 intent 以已有 `input.envelope.sessionId` 取得原 session probe 设置，再调用同一个 support 方法。
6. `.../runtime/structured-agent-launch-support.ts`：原 `structuredAgentSupportsLaunch` 使用显式命令设置，未提供时继续读原 private settings；原 agent metadata、真实 host environment、`resolvePiRpcCommand`、版本解析和真实 `--version` 执行都保留。命令覆盖不产生成功判断。
7. 本任务记录；`.verification/worker-launch-probe-20261023/` 的独占无模型诊断入口、局部 bundle 和原件。不修改 Windows checker 或 release_audit 的真实 Worker runner。若发现真实 probe 的另一个直接启动参数问题，先报告实际证据与必要增量。

## 验证顺序与停止条件

先运行无网络最小复现，再实施产品：只读 pi02 profile 的必要 settings 字段和原 Worker 回执的 agent/executable/version，不读取、散列或输出 auth/models 正文。用本次独占 HOME/account/cwd/temp/XDG 目录，重现 Go/runtime 的私有环境键与相同明确 PATH 来源；实际调用原 `resolveHostStructuredAgentLaunchEnvironment`，保留 login-shell 捕获行为，报告实际 capture、PATH 是否仍含明确 Pi bin，以及原 command resolver 的结果。原实际 settings 值保持，只有本次写域相关路径指向新私有目录。为官方 wrapper 在 version 前执行的 Node cache 初始化固定 `NODE_DISABLE_COMPILE_CACHE=1`；记录这一写域限制，不冒称原现场完整环境抓取。

对同一实际 host environment，调用原 metadata 的 command resolver 与 `supportsVersion`：原空 override 应为裸 pi/真实 ENOENT/false；用原已批准绝对 executable 后必须由真实官方 CLI `--version` 返回支持的实际版本。若后一段仍失败，保原件并定位后再修改产品，不能以 source metadata 或自造输出替代。所有 probe 用原5秒/4096字节界限，外层总25秒/1MiB；不启动 runtime/daemon/服务、真实会话、模型、工具或读取私有账号。本次临时入口只导出真实生产函数，esbuild 沿已有正式 common 配置，使用明确已有依赖，不安装或复制原生组件。

实现后运行 scoped strict TypeScript，以及受影响的 `worker-start-mode.test.mjs` 原4项规则；原态 MRE 与修后命令 probe 结果分开保留。逐读两处 support 的实际参数消费链与 session record 尚未创建的原身份检查；不伪造 runtime/原生 API/CLI，不以 mock 完成效果链测试。

准确源码与局部检查通过独立审查后，release_audit 更新现有混合 development 的 host/helper 两 entry，来源明确为原 S4c 基底加准确新源码；使用全新项目/Grant/R 运行一次真实 Pi/StepFun Worker，核原 success receipt 的 structured mode、实际所选 executable/model、真实输入与输出、stop/release、controller.close 和正常服务/观察器退出。该真实检查是支持链和效果链的必要验收，不能由无网络 MRE 或编译结果代替。Windows 动态和同提交完整安装、N4/N6 仍单列未验。

## 实施与实际局部结果

七个生产路径已按上述合同修改，未更改公开 RPC、私有 profile 默认值、实际位置支持和官方版本判断。初始命令设置来自原 fresh mutation 的真实父回执；当前 Go 准入之后再次同步核对同一原件，尚未产生实际模式。原 host 决策完成后仍由原 `beforeWorkerStart` 核对实际 mode 并在原子创建前执行末次检查。session intent 使用已注册的真实 Worker/session/Dispatch 关联取得选择，允许 session record 尚未创建。

第一次无网络复现工具在任何 bundle、shell 或 CLI probe 前退出1：工具错误地假定整个 `agentDefaultEnv` 为空，实际私有配置保留上游 `goose.GOOSE_MODE=auto` 默认值。最小修正仅核对本次 `agentDefaultEnv.pi` 缺席，并保留实际完整 settings。原失败在 `.verification/worker-launch-probe-20261023/mre.log` 与 `mre.exit`，没有作为产品启动失败或模型调用计数。

修正后的真实无网络复现退出0，原件在 `.verification/worker-launch-probe-20261023/mre-Cf3bVB/`，外层为 `mre-r2.log`/`mre-r2.exit`。原 login-shell 捕获状态为 `captured`；明确进程 PATH 含 Pi bin，实际 host environment PATH 不含该目录。原空 override 解析为裸 `pi`，官方 probe 实际记录 `spawn pi ENOENT` 并返回 false；同一实际 environment 加原请求批准的绝对 executable 后，官方 `--version` 输出 `1.0.1 is supported` 并返回 true。子进程自然退出0、signal=null、forced=false；实际 Node、Pi 入口和局部 bundle 首末 SHA 相同。该复现未启动服务、原生会话、模型或工具，不读取 auth/models，不重放旧请求。为限制官方 wrapper 的初始化写入，临时环境固定 `NODE_DISABLE_COMPILE_CACHE=1`、`PI_OFFLINE=1`，HOME/account/cwd/temp/XDG 均为新独占目录；这不冒称旧现场的完整环境抓取。

诊断入口最终 SHA 为 `96edcf2d0a175648a3eede54428ba4aed7a890f99247f3b3b4a358b59480468a`。该入口经 `node --check` 验证语法，随后必要的配置断言修正由实际执行验证。

修后 `node --test tests/swa-cli-headless/worker-start-mode.test.mjs` 实际4项通过、退出0，原件为 `.verification/worker-launch-probe-20261023/rules.log`/`rules.exit`，规则输出目录为 `.verification/worker-structured-mode-20261023/rules-jxzIjJ/`。`node runtime/swa-orca/node_modules/typescript/bin/tsc -p runtime/swa-orca/tsconfig.json --pretty false` 实际退出0、日志为空，原件为同目录 `strict.log`/`strict.exit`。`git diff --check` 退出0。未重复完整构建或既有无关测试。

本次提交给独立审查的准确生产 SHA：

- `runtime/swa-orca/src/agent-launch-admission.ts`：`432b63eccef69f53449f33e2b88e8b23e8633ba61cdd5ce7135918ed9090f2c4`。
- `third_party/orca-v1.4.230/src/main/agent-launch/agent-launch-mode.ts`：`5e290add301ecb76ee512a996b2d246bd5d49657179bcd10630227dd9f8ac04c`。
- `third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration-worker-start-mode.ts`：`43b964f702cfa7204ca23c5d5570ca4c8009e464162b7258dd1e8a3f4dc4a794`。
- `third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/worker/local-worker-start.ts`：`42843ef473e500013bae45eba109d45f31b2ae107835a2b54f106dd54e993251`。
- `third_party/orca-v1.4.230/src/main/runtime/session-tabs/structured-session-create-support.ts`：`fd1215a040f9e548a9cb77d5fc92d4fe74cd6738fe4f131846cec12e6ceee8e2`。
- `third_party/orca-v1.4.230/src/main/runtime/structured-agent-launch-composition.ts`：`a6c75c2f199ce16340e70f223e5f83df3216613ff7296d074a29893c571aad66`。
- `third_party/orca-v1.4.230/src/main/runtime/structured-agent-launch-support.ts`：`e35807987301e6f5cb5cc28928b21929cb957dd16f40efe3c4ccae6f8c922182`。

acceptance_audit 已独立读取上述七个准确生产源、两处实际消费者与局部原件，限定接受本批源码和无模型局部结果。真实修后单 Worker、Windows 动态、同提交安装和 N4/N6 仍未运行，交由原责任人按准确来源继续。
