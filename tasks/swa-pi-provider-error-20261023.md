# Pi 原生服务错误记录

基线 `80e298c0`。collaboration_model 负责合法 Pi 失败 DTO 的直接消费者，acceptance_audit 独立审查；Root 固定源码，release_audit 处理旧资源和后继新请求。原 pi08 请求不重放，不修改原数据库，不调用模型或启动完整构建。

## 实际失败和原态复现

pi08 `/workspace/swa-worker-pi-08-GeT3c2` 已有真实 accepted 输入，驱动未观察到 delta，尚未发 stop/release。原 trace63行 SHA256 `7c844b8842adcfac6c041517a3137f35f4984cbf125af355a15f741c7cb0f789`，原消费者在63行生产 failure `{stage:protocol, code:protocol_unverifiable}` 拒绝；截至62的合法前缀通过，不能放宽验收 consumer。原 source 校验日志先多次62行，最后63行，与该顺序一致。

原 native session 文件有实际 assistant `stopReason=error`、StepFun/step-3.5-flash/openai-completions、空 content、`errorMessage="502 status code (no body)"`。文件 SHA256 `8e0d5e68f31f7880267342aa6a0a89ecf204fb7106b49f9a67c6e510b4d36720`。真实服务返回502，不能在本地改成成功；未观察delta也不代表未调用服务。

`.verification/worker-pi08-observation-20261023/native-error-report.json` 实际原态解析复现：同原生 message和entry交原正式 `pi-protocol.cjs`，分别在 stopReason/errorMessage拒绝。bundle SHA `563dc4d56af7bb8713c5e9812fb010ade298c1f5b21515e49fd33869328c181e`，其 protocol源码当前与原I4c基底逐字相同，SHA `5ed7fe857dd2f3e80001c41ad9a5be790c6eb452b4242dfb274d67721fd24e91`。不构造未保存的 message_start/end wire envelope，不声称已确定历史被拒帧的完整字节。

官方已装 Pi1.0.1 的 `@earendil-works/pi-ai/dist/types.d.ts` 明确 StopReason包含error、AssistantMessage.errorMessage为可选string；`pi-agent-core/dist/agent-loop.js:310–319` 对实际 error结果照常产生 message_start/end，原 rpc-mode订阅直接输出。现严格 schema缺少这个合法分支。

## 最小写域与既有失败映射

唯一产品源码 `third_party/orca-v1.4.230/src/main/pi/rpc-protocol.ts`：strictAssistant加入error，errorMessage改为可选string，但精确分支约束为：error允许原string或缺失；aborted仍只准原两种 abort文字并要求存在；其余成功/pending/length仍拒errorMessage。严格object、工具禁用、原provider/model/account/raw/source绑定和已有DTO字段不变，不放开toolUse/deferred或其它未知协议。

直接消费者已经有失败语义，无需重构：rpc-turns在真实 assistant error时保存错误，finish按failure发状态项和turn.end outcome=failure；原piRpcFailureFact映射providerRejected。pi-session-result只有stop且完整原件/journal success才允许complete，error不成为成功成果；run-settlement对非success先真实停止，收集原件后将Task写failed，root按真正lead的Task状态写failed。缺失错误文字仍由原lastStopReason=error分支决定failure，不伪造成功。上述来源/结束/回收门保持，未观察到的完整动态失败生命周期不冒称已验。

必要测试写域：`tests/swa-cli-headless/pi-provider-error.test.mjs` 和 `tests/swa-cli-headless/fixtures/pi-stepfun-502-native-entry.json`。fixture只保全此次真实末message行（无用户正文、密钥、账号目录或源码路径），保原id/timestamp/模型/usage/error字节并在测试核准确SHA；不编造提供者样本。测试用当前成熟严格schema解析该实际message/entry，用既有piRpcFailureFact核providerRejected；不构造RPC回放/假policy/会话或模型成功。以此原件的明确字段差分作纯schema负规则，核abort文字约束、成功分支无errorMessage、未知字段和工具继续拒绝，不将差分对象当作真实Agent证据。

Root补充授权 `scripts/check.mjs`：同一现有Node测试列表仅加入新 `pi-provider-error.test.mjs` 与现有 `pi-stdio-write.test.mjs`。原关闭测试已有13项实际通过，但全仓默认入口未引用；此次补齐直接回归入口，不修改其它命令或门。仅核脚本语法和列表路径存在，复用原13项实际结果，不因列表接线重跑整套检查。

其余写域仅此任务与 `.verification/worker-pi08-observation-20261023/`。

## 验证与停止条件

先保存已完成原态拒绝结果；同实际native entry经修后schema应成功且保stopReason error/原错误，旧bundle仍拒。当前实际63行trace中的生产failure必须继续被原consumer拒绝，不能因新schema改写旧事实。原pi07真实320行闭合消费者回归保持，不生成或补齐pi08缺失的wire尾部。

执行新实际样本规则、scoped strict TypeScript、准确diff；原文件/trace首末不变。独立审查上述既有turn/Task/Run失败分支，完成源码/实际结果后交06。没有合法原件证据或发现同根因直接消费者不正确即停止定位，不通过删除检查收口。服务502本身和旧pi08 FAIL/资源未释放/wholeUNKNOWN保留；后继真实新Worker仍由Root固定来源后执行。

## 实际局部结果

使用只读开发基底 Node24.21.0 执行新 `--test tests/swa-cli-headless/pi-provider-error.test.mjs`，`rules-r1.exit=0`，5项通过；第1项消费真实native entry及既有failure映射，其余为明确的schema字段差分规则，不代表实际提供者回放。真实fixture为470字节，与原native末assistant行及换行逐字相同，SHA256 `93cb7e9db494fa00ef4c39623443c108b43b3ffd16feb550679d9a652ddb196d`。既有ProviderRejected映射保原502诊断。

`.verification/worker-pi08-observation-20261023/regression.mjs` 实际退出0，报告 `regression-r1/report.json` SHA256 `018a3c7b629340a3dc5f0dee2abe1b798f21595c5fdd76880a5b67506d7b6bfb`：同原entry/message在旧正式bundle仍拒，在当前schema解析后逐对象不变。pi08前62行仍通过、原failure63仍拒；pi07真实320行仍通过原完整D/关闭证据，idle仍缺席。两个原run结果仍FAIL，全部读取的原trace、native文件、CLI回执和result首末不变，没有补造历史wire。

`NODE_OPTIONS=--max-old-space-size=8192` 下使用同Node执行 `runtime/swa-orca/node_modules/typescript/bin/tsc -p runtime/swa-orca/tsconfig.json --pretty false`，`strict-r1.exit=0`，日志为空。新规则与strict日志保存在上述同一专属目录。原 `pi-stdio-write.test.mjs` 未改，复用其 `rules-r5` 13项通过及严格检查结果，来源见 [原关闭任务](swa-pi-unwritten-close-20261023.md)。

默认检查列表补域计划也已独立接受，`scripts/check.mjs` 同一Node列表精确新增两路径，SHA256 `af924277716d057d6e40a7793c39c7ecc8f2fc1523afeb7c89ccdf01ac3a0b94`。同Node `--check scripts/check.mjs`、`git diff --check` 退出0；用现TypeScript AST枚举原脚本全部12个test路径均存在，新增两项准确。该接线检查工具输出为 `2ea34f`/`51287f`，未执行整个默认检查。

当前产品SHA256 `16c2edd27fd229299032a12fb2ff19767280ce6ffa9783b1d40a5b6f99fd0551`；新测试SHA256 `dfe06d976ecbb8f00aa4e1b4288bde214c35eb44ddd165eb91c277bf369ef1fb`。计划和最终准确源码、真实fixture、默认入口及局部结果已获独立主审/子审限定接受。未运行完整构建、新服务、模型或旧请求重放，修后真实错误生命周期/停止释放和Windows仍未动态验证。
