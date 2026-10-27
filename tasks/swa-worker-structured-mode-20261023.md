# SWA Worker 实际执行模式准入

基线 `0bf2c3e5`。本批先只读诊断和方案审查；原请求、数据库、安装及模型进程不重放、不修改。原资源收尾由 release_audit 负责。

## 实际失败与源码根因

独占单 Worker 开发验证原件为 `/workspace/swa-worker-pi-01-Vg8TlX/evidence/cli-05.stdout`。原请求 `cb57657e-89a6-4e67-88f9-c5eff888951e` 及 `/native` 都 completed；业务回执 `native.state=failed`、`stage=dispatch_input`、`lastError=agent_not_in_foreground`。准入 selection 为 `execution_mode=structured`、Pi、`stepfun/step-3.5-flash`、ToolsOff；实际 mode 却为 terminal，preferred terminal，reason user_default。回执明确新建 child Task、Dispatch 及后台 Agent terminal，不能从没有成功输入记录推断无进程或无副作用。

`WorkerStartParams` 不支持 executionMode；在 helper 添加未知字段不能选择原生模式。`workers.ts` 调用 `decideWorkerStartMode`，从原 runtime store 读取设置。`host-entry.ts` 的私有设置初始化未覆盖 `experimentalNativeChat`，原 `default-global-settings.ts` 为 false。`decideAgentLaunchMode` 因而直接返回 terminal；ToolsOff 和会话账号/input 准入只存在于 structured 分支，未参与这次实际 terminal 启动。这是实际回执与真实源码一致的直接断点。

`local-worker-start.ts` 在 host 支持核对之后可能得到降级 mode，随后创建 Dispatch。SWA 已由精确参数准入限制为 current workspace，executor 对已有 workspace 使用已决定的 mode。现 worker 专属 structured factory 的明确拒绝抛 `OrchestrationError`，不会触发 executor 仅捕获的 `AgentLaunchStructuredSessionRefusedError`；该可达路径在前置实际 mode 拒绝之后没有第二次降级选择。Root 据此要求只修改当前必要边界，不增加未来用途的 factory 重复检查。

## 拟实现与写域

1. `runtime/swa-orca/src/host-entry.ts`：SWA 私有 host 在开放 RPC 前，用原设置机制启用 `experimentalNativeChat` 并清除私有 provider 的 terminal 默认覆盖。外部只读 Agent profile 的命令、账号和模型选择继续保持来源；不更改外部 profile。
2. `third_party/orca-v1.4.230/src/main/runtime/structured-agent-launch-composition.ts`：在现有可选宿主准入中增加 `beforeWorkerStart(input): Promise<void | (() => void)>` 检查及调用函数，沿现 `beforeInput` 的异步当前授权与同步末次检查模式。只传实际 native mutation ID/原 caller fingerprint、controller、Run、workspace、agent 与已决定的 `structured|terminal`，不在该函数选择模式。不安装 SWA admission 的原桌面行为保持。
3. `third_party/orca-v1.4.230/src/main/runtime/rpc/methods/orchestration/worker/local-worker-start.ts`：实际 host mode 和 workspace 已解析后、`createStartingWorkerDispatch` 之前等待上述准入。传实际 mode，不能引用 preferred 冒充实际模式；返回的同步末次检查到原 Dispatch 事务之间不增加 await。
4. `runtime/swa-orca/src/agent-launch-admission.ts`：安装检查，从真实原 parent reservation 与 native child mutation 核原请求、项目、controller/Run/root、选择、实际 agent/workspace，复用 `admitCurrentApproval` 的实际 Go 当前权限校验；返回同步末次 owner/ledger/Grant expiry 检查。现 `assertDeliveryGrantCurrent` 仅校验 expiry，不能单独当作当前 Go 授权。要求原选择和实际 mode 都为 structured。未知模式、不可用支持或降级在创建副作用前以现有明确错误拒绝；不得生成伪会话、伪绑定或成功回执。原外层 helper 已开始投递后的 UNKNOWN 规则保持，不因本次内部拒绝改写旧回执。
5. 必要直接纯规则测试 `tests/swa-cli-headless/worker-start-mode.test.mjs`、本任务与 ignored 验证目录。若检查需要公共纯断言，使用本准入实际消费的小函数，不造 Runtime、adapter、provider 或协议回执。冻结前再给具体源码独立审查。

## 验证顺序与边界

- 先运行无网络、无进程启动的原纯规则最小复现：真实 `getDefaultPersistedState` 和 `decideWorkerStartMode` 对 Pi 得到 terminal；同生产函数在 SWA 私有 structured 设置得到 structured。使用原 `downgradeWorkerStartModeForHost` 的规则输入证明 unknown/refused host 支持仍产生 terminal，再由实际准入断言拒绝。此处 support 值只为规则参数，不冒真实宿主探测结果。
- 修复后直接规则覆盖默认选择、provider terminal 覆盖、未知/不支持 host 降级、实际 terminal mode 拒绝、实际 structured mode 允许。独立源审确认 SWA current workspace 路径不会在该已决定 mode 后再降级。上游未装准入时保留原路线；不使用 fake host 测试生产 native 接入。
- 原 runtime scoped strict TypeScript；必要架构边界检查。准确差分由06独立审查，不执行全包构建。
- release_audit 在原资源收尾完成之后，用固定本批源重新编 development host/helper，两入口来源逐文件记录，新 data/project/Grant/R。真实唯一 Pi/StepFun Worker 必须留下 structured mode、原 session/input binding、实际 provider 输出，再原 stop/release/controller.close/Grant revoke/serve EOF 和完整资源退出证据。旧回执和失败业务状态保持不变。开发基底的混合来源如实注明，不冒同源正式安装；Windows 与 N4/N6 仍另行实际验证。

## 当前实际结果

Root/06 接受上述必要写域、当前可达分支和验证计划。额外核实原 native executor 使用 `atomicWorkerAcceptance`：新 Worker 的 child receipt 在 Dispatch 原子接受时才创建。新增检查因此使用原 invocation 的 mutation identity、父 pending receipt 与原 `child_request`，要求 child 在该边界前尚未存在；不会伪造 pending child，也不改变已完成请求由原 executor 直接返回原 receipt 的规则。payload hash 继续用原 `hashCanonical` / `replayStableCallerParams`，末次同步核验与原 Dispatch 接受之间没有 await。

原模式 MRE 的前两次入口装配均退出1，尚未执行规则：首次遗漏原 `orca-source` 和 native 外部模块规则，第二次遗漏正式构建使用的 jsonc-parser ESM 路由。原件 `.verification/worker-structured-mode-20261023/mre.log` / `mre.exit`、`mre-r2.log` / `mre-r2.exit` 保留。补齐原源码解析配置后 `mre-r3.log` / `mre-r3.exit` 实际退出0；原件 `mre-ULMqcJ/report.json` 显示真实默认决定 terminal/user_default，原 structured 设置决定 structured，原 host 支持规则对 unknown/refused 均决定 terminal。诊断程序 SHA 为 `81b1dce0a3e0c2ed108883d1728b045e9cdc074f6ef495ee76503c31e651369e`。此处只执行实际纯规则，不探测宿主支持、不启动 Agent 或模型。

直接测试首次编译后加载失败，临时目录不能解析已有 `@orca/windows-security`，尚未进入4项断言；用独占输出目录到当前显式 runtime node_modules 的实际解析链接并核 realpath 后进入规则。第二轮实际1项通过、3项失败，原因是测试误将原 `OrchestrationError.data.effectsApplied` 当作顶层字段；产品原拒绝 code 已正确。`rules.log` / `rules.exit` 和 `rules-r2.log` / `rules-r2.exit` 保留，仅修测试解析目录及断言路径，未修改原依赖、未安装 Windows addon。最终 `node --test tests/swa-cli-headless/worker-start-mode.test.mjs` 实际4项通过、0失败、退出0，原件 `rules-r3.log` / `rules-r3.exit`、`rules-rbRkml/`。

`node runtime/swa-orca/node_modules/typescript/bin/tsc -p runtime/swa-orca/tsconfig.json --pretty false` 实际退出0、诊断为空，原件 `strict.log` / `strict.exit`；`node scripts/check-architecture.mjs` 实际退出0，检查17个 Go 包的导入边界，原件 `architecture.log` / `architecture.exit`，不将其描述成 TypeScript 依赖全图证明。`git diff --check` 退出0。

06 已独立完整读取并接受准确四产品、直接测试和上述实际局部范围。产品 SHA：host-entry `166d266d1b0db12ae8c5a4e7416a90714a0f4e17d12353d2ef4015a0187c687b`；agent-launch-admission `2661e43a52dc0253c71b4f0b4a7908c236a94d91479cd4d659e9d7c6da56b398`；structured-agent-launch-composition `37854c48af35a4b37a7faf8b2c72843df2e866d17ed0516c7e8d3607ecc9f910`；local-worker-start `425419c1b7032002347d4fd875fa9c84f79af216a6efffca9fa0646d2f251581`。直接测试 SHA 为 `98cd0a5183f95b1457553050cc1407e7294ff1b11882e38d4173e91dc7ebd4a9`。新真实单 Worker、模型输入输出、停止释放、正式完整安装及 Windows 动态检查尚未执行，不由本轮纯规则替代。
