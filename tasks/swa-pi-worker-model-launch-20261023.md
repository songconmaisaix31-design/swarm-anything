# Pi Worker 显式模型启动合同

基线为已接受的 `3f110ee4` 当前工作树参数修复。Root 要求继续检查相同真实调用链，并在下一次完整构建前处理有明确源码证据的启动阻塞。本任务不修改上一任务的两处冻结参数修复。

## 已定位的直接阻塞

`prepareLocalWorkerStart` 的工作树校验之后执行 `resolveWorkerLaunchPreferences`，后者调用 `shared/agent-launch-model-preferences.ts:checkAgentLaunchModelPreferences`。该函数要求模型启动目录具有 `supportsWorkerLaunchPreferences` 和 `modelApply.launchArgs`。`agent-session-option-launch.ts:getAgentSessionOptionLaunchCatalog` 只对 OpenCode 提供专用启动目录，其余取普通会话目录；`agent-session-option-catalog.ts` 的实际 CATALOGS 没有 Pi。因此带显式模型的 Pi Worker 在启动前必被拒绝为 `Agent pi does not support launch-time model selection`。这是当前源码发现，尚未执行新的 Worker 或模型，不改写旧 N4 的实际错误。

Pi 1.0.1 官方安装包 `dist/cli/args.js` 帮助与解析器支持 `--provider <name>` 及 `--model <provider/id>`；`dist/core/model-resolver.js:resolveCliModel` 支持完整 provider/model 引用。SWA 的结构化 ToolsOff 路径已有独立、严格模型绑定：Worker options 保存完整选择；`agent-launch-admission.ts:originalSelection` 核对 record.options.model；`rpc-launch-resolution.ts` 的 ToolsOff 分支不携带普通 extraArgs；`rpc-launch.ts:buildPiRpcLaunch` 使用准入的 provider 与 modelId 产生 `--provider`、`--model`；`pi-session-policy.ts:assertSpawn` 核对逐个实参，`get_state` 和真实消息继续核对 provider/model。不可删除显式模型或退到默认模型。

## 建议写入范围

- `third_party/orca-v1.4.230/src/shared/agent-session-option-launch.ts`：在现有启动目录解析模块内增加 Pi 的仅启动目录，空模型列表、`supportsWorkerLaunchPreferences:true`、`modelApply.launchArgs` 产生原 `--model` 完整选择，并复用 `removeAgentArgOption('pi', tokens, ['--model', '--provider'])` 处理已有参数覆盖。显式完整模型必须同时清除旧 provider 限定；原 `--` 后正文保留。官方 1.0.1 参数解析只认可这两个长选项，不声明 `-m`。普通会话 CATALOGS 不增加 Pi，不新增模型/账号发现、会话切换或 effort 支持。
- `third_party/orca-v1.4.230/src/shared/agent-session-option-agent-args.ts`：现有 `tui-agent-launch-command.ts` 会消费同一启动目录的参数覆盖，故在原 `VALUE_OPTIONS` 机制中加入 Pi 1.0.1 官方解析器实际接受以 `-` 开头值的必需参数名单，防止 `--system-prompt` 等参数的正文值 `--model` 被误认作模型选项。只补原解析器所需的选项元数据，不添加设置能力或新解析器；与官方 `parseArgs` 做直接值语义对照。
- `third_party/orca-v1.4.230/src/shared/command-option-occurrence.ts`：独立审查指出目标参数自身的必需值还需要消费；Root/06 批准在原 scanner 增加默认关闭的 `consumeRequiredTargetValues`，只由 Pi remover 启用且仍核 `VALUE_OPTIONS`。非 Pi 默认行为、特别是既有 Claude `--model --yolo` 保留后一个选项的合同不变。
- `tests/swa-cli-headless/pi-worker-launch.test.mjs` 及必要同目录源码导出入口：直接消费真实原纯函数、Pi 1.0.1 官方参数解析器与模型运行时。不得使用假 Runtime、假 provider 或假模型目录。
- 本任务记录与 `.verification/pi-worker-model-launch-20261023/` 原件。

如果实际 CLI 或下游核查发现该方案不能逐字保存当前模型，停止并交 Root/06 裁定；不得通过扩大允许目录或弱化原模型校验使测试通过。

## 无网络最小复现与局部验证

1. 先保留未修复源，使用显式 Pi 1.0.1 官方安装包与本次独占空 HOME/PI_CODING_AGENT_DIR/cwd，清理继承凭据和代理变量。原 CLI 以 `--offline --no-tools --no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files --help` 返回实际帮助；真实 `ModelRuntime.create` 只使用新空 authPath、`modelsPath:null`、`allowModelNetwork:false`、`refreshOnCreate:false`，从官方静态目录得到实际模型，不探测账号可用性。模型目录只说明本机官方内置来源，不冒充已验证账号可用目录。
2. 用该目录中实际完整 provider/model 选择、当前已获准的 `stepfun/step-3.5-flash` 字符串分别调用原 `checkAgentLaunchModelPreferences` / `resolveWorkerLaunchPreferences`，记录原拒绝。对实际目录模型使用官方 `parseArgs`、`resolveCliModel` 核对 `--model provider/id` 和 `--provider provider --model id` 两种已有合同；不伪造不存在的目录行。若官方空账号目录没有 StepFun，只记录缺失，实际受控 StepFun 目录由后继单 Worker 原生产 consumer 验证。
3. 06 独立审核具体方案后才改产品。修复后验证原纯函数返回完整 model、Worker seed 保留完整字符串、普通会话 Pi catalog 仍为 null、effort 仍拒绝、已有非 Pi 启动行为保持，真实原参数覆盖规则不留下重复 `--model` 或旧 `--provider`；required-value 中的 `--model`、`--provider`、`--` 与实际终止符之后正文保持。继续消费同官方真实目录和参数解析器，不启动模型。
4. 执行原 runtime scoped strict TypeScript。开发真实单 Worker 使用修复后的准确 host/helper 两入口，原 Pi/StepFun、ToolsOff、原回执/真实输入输出/stop/release/正常 EOF 由 release_audit 的独立 runner 执行；准确 runner 计划和源码另交06审核。此处无网络检查不能替代该实际模型验收，也不代表 Windows 动态通过。

## 实际记录

Root 已独立完整审查计划与首版 MRE，06 随后接受计划并指出官方 CLI 入口默认启用 Node 编译缓存。首轮 `mre-zVMMsD` 实际退出0、重现原拒绝，但环境遗漏 `NODE_DISABLE_COMPILE_CACHE`，不声称该轮缓存写域已限定；原件保持不变。固定 `NODE_DISABLE_COMPILE_CACHE:'1'` 后，继任 `mre-AP2ODo` 的官方帮助、官方静态目录和原规则复现均退出0；最终诊断程序 SHA 为 `e60f87fae56704519b91e831472b5bba9e2556cbe5b382523c17c144b48fb891`。06 已独立读取并接受该原拒绝复现范围。

实际空账号内置目录共1536项，没有 StepFun。实际样本为 `amazon-bedrock/amazon.nova-2-lite-v1:0`，完整 provider/model 与分离 `--provider` / `--model` 两种官方解析均成功；原生产 Worker 校验对这个实际样本及已配置的 `stepfun/step-3.5-flash` 字符串都返回同一 `invalid_argument`。StepFun 字符串的规则验证不作为其目录行、账号可用性或模型调用证据。

首轮两处产品修改只增加 Pi 启动目录和官方 required-value 参数元数据。`node --test tests/swa-cli-headless/pi-worker-launch.test.mjs` 实际4项通过、0失败、退出0；原件为 `.verification/pi-worker-model-launch-20261023/rules.log`、`rules.exit` 和 `rules-uJ9JB0/`。覆盖原 Worker launch→structured seed 保留完整模型、普通会话目录仍无 Pi 且 effort 仍拒绝、原命令生成→原 tokenize→官方 parseArgs 保留正文/终止符并去除旧 provider/model，以及现有 Codex/OpenCode 启动合同。三个 shell 的检查是纯参数规则，没有执行 Windows 原生程序。

首轮产品 SHA：`agent-session-option-launch.ts` 为 `619adb526c7ca1408ef974c80acb02f37c077ff65f2a15d92a54e9ff9138362d`；`agent-session-option-agent-args.ts` 为 `7ad149409e6e8237ed508e83d1df126efa30112a66b35c42b87792d587747ca9`。首轮测试 SHA 为 `31a893995a8ade4378320b2accdf1a678ec74d49710411ec751989d03245e72a`。`node runtime/swa-orca/node_modules/typescript/bin/tsc -p runtime/swa-orca/tsconfig.json --pretty false` 实际退出0、诊断为空，原件为同目录 `strict.log` / `strict.exit`；`git diff --check` 退出0。这是下述必要返修前的历史检查，不能覆盖后来发现的参数边界。

06 独立代码审查发现原 scanner 命中待删目标时仍只消费不以 `-` 开头的下一值。最小复现为 Pi 原参数 `['--provider', '--', '--system-prompt', '原正文']`：官方解析器将 `--` 当 provider 的必需值并保留 systemPrompt，原覆盖函数却留下 `--` 终止符，覆盖后官方解析的 systemPrompt 变成 undefined。新增真实 consumer→官方 parseArgs 的目标边界检查在修复前实际失败1项，原件 `target-before.log` / `target-before.exit` 保留。Root/06 据此接受第三处必要 scanner 修改：默认关闭 required-target 消费，仅 Pi remover 显式启用且仍要求匹配原 VALUE_OPTIONS；非 Pi 默认行为、特别是 Claude `--model --yolo` 保留后一个选项的原合同不变。

返修后同一直接测试实际5项通过、0失败、退出0，原件 `rules-r2.log` / `rules-r2.exit`、`rules-wS3R9l/`。新增检查覆盖 provider/model 两个目标的 dash-leading 必需值，并核原 Claude 保留选项的断言。受影响 runtime strict 再次实际退出0、诊断为空，原件 `strict-r2.log` / `strict-r2.exit`。最终产品 SHA：launch 为 `619adb526c7ca1408ef974c80acb02f37c077ff65f2a15d92a54e9ff9138362d`；args 为 `6c1a0580969b672fac81da86dd0d87991e5d8149fb22b2c93c4bb01e0571d4d8`；scanner 为 `ab217e4a1e2824c9570e108dd6a31d2b4475eceda07a0c0a17a11dbe575f08d5`；测试为 `211d0e93b9e4f66478a4455bd4fa790ca503e0a3a62e6682a25409a4848e87ad`。06 已独立读取准确源码和实际原件，接受本轮源码与局部验证范围。

另外使用真实 Vitest 5.0.5 执行原字节 `agent-session-option-catalog-removers.test.ts`：首轮相对配置路径被 --root 解析到不存在位置，第二轮缺少精简依赖树中的 Electron TypeScript 配置，均在进入测试之前退出1、执行0项；`removers.log` / `removers.exit` 和 `removers-r2.log` / `removers-r2.exit` 保留。仅在 ignored 配置中使用绝对路径及已过 strict 的原 runtime tsconfig 后，第三轮实际11项通过、退出0，原件 `removers-r3.log` / `removers-r3.exit`；未改原测试或断言，未安装或构建 Electron。真实单 Worker、模型输入输出、停止释放、新完整安装和 Windows 动态验证仍未运行，由后继独立 runner 消费冻结产品源。
