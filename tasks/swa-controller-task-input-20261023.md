# Controller 完整任务输入

原 S4c 安装保持只读。N4 原请求 `fd652447-4a93-48aa-8628-78d0f1ee2602` 的 `swa.controllerOpen` 已完成，子请求 `654666e4-58a1-599c-825a-8746ac4ba8cf` 的 `swa.taskCreate` 在 `helper-input` 保持 pending；原 helper 于 05:17:46.955 自然退出 1，没有 Worker 或模型成果。原 owner 正常 EOF 后服务退出 6、observer 退出 0，两次完整所属进程清单为空。原请求不重放，不将 UNKNOWN 改写为成功或明确未执行。

原现场 `terminal.read` 未注册，原 DaemonClient 核实际 pid/nonce/boot/ticks/startedAt 后取得 `snapshot:null`；磁盘仅有退出 meta，旧现场错误正文缺失。上述读取没有发送业务 mutation；前置临时 bundle 装配错误保留为验证工具失败。原件与局部计划位于 `.verification/controller-taskcreate-diagnosis-20261023/`。

最小复现使用真实生产 `TerminalHost`、`createPtySubprocess`、原 helper、S4c Node 24.21/ABI137 和已编 node-pty，独占 HOME/data/cwd。全新 `identify` 请求附原已授权公开 invocation，不调用任何 RPC 或模型。`long-j7i3TJ` 中短请求成功，322408 字节长请求使 helper 自然退出 1；原转录末的 JSON 错误为 `Unterminated string in JSON at position 3351 (line 1 column 3352)`。离线重建同 packet 的 SHA 与记录相同，其前 4095 UTF8 字节给出逐字相同的 JSON 错误（工具 chunk `333453`）。`pipe-0K7Htf` 对照使用同一原 helper bundle 和公开长 invocation，经实际 stdin pipe 获得两次 ready、真实 EOF 退出 0并确认进程消失。该对照隔离了 TTY 长行输入问题，不冒充旧现场完整因果或任务创建验收。

Root 与独立 Reviewer 已接受最窄产品修复和直接消费者计划。产品写域只有 `runtime/swa-orca/src/controller-helper.ts`：`createInterface` 使用 `terminal:process.stdin.isTTY` 和 `output:process.stdout`。Node 自带 readline 在实际 TTY 启用 raw 输入、提交时正常输出换行，close 还原模式，空行 Ctrl-D 关闭；pipe 保持非终端行为。原 JSON/Zod、RPC、错误与 finally 不变，不添加解析器、分帧或 EOF 协议。

本次直接验证：准确 helper SHA256 为 `429e0467380594e6f0a9bf5b64f012c183ea9e0bf99903c5cbeffe941b88b0c3`。`long-WNtUBF` 的真实 TTY 短→322408 字节长→再次短请求全部 ready，原 PID/incarnation 一致，Ctrl-D 自然退出 0、进程确认消失，`forced_dispose=false`；`pipe-uY69to` 用同一修后 bundle 两次 ready，真实 stdin EOF 退出 0，进程消失。原件见对应目录 report/transcript/stdout；`verify-fixed-tty.log`、`verify-fixed-pipe.log` 与各自 exit 文件均为 0。`node runtime/swa-orca/node_modules/typescript/bin/tsc -p runtime/swa-orca/tsconfig.json --pretty false` 退出 0，`strict.log` 保持原完整输出，未降低编译选项。上述实际步骤没有重试完整构建、修改原安装、发送旧请求或调用模型。

真实任务创建开发集成由 release_audit 独占执行，计划 `.verification/cloud-setup/controller-taskcreate-rpc-integration-plan.md`：使用只读 S4c Node/Go/原 runtime 输入的开发副本，仅局部编译修后 helper；全新私有 data、真实原 Go 授权与 RPC、SQLite 实际根 Task/完整 spec/context、原新 R 查询、后续原 helper observe、正常 close/服务 EOF/全树消失。r3实际结果见本记录末尾。它是开发集成验证，不是完整新候选安装证明。Windows 外层 producer 与原生 CI 接线由 windows_combined_plan 负责；本机没有 Windows 原生传输结果，不以 Linux 或 TypeScript 代验。

独立 Reviewer 已接受永久直接消费者计划，写域为 `tests/swa-cli-headless/controller-input-check.mjs`、既有 `controller-startup-source.ts` 和本任务记录。唯一接口为 `--install-root ABS --invocation-file ABS --output-dir ABS`。外层完成真实 `task.create` 后，以 0600 文件导出原已完成回执的 `invocation` 对象，并保存其 R、Task、来源与授权核验；本入口不生成 caller/context、不调用 RPC 或模型。输入文件经过原 helper schema，长 packet 必须大于4095字节且不超过1MiB。

入口必须由指定安装 Node 执行，只读使用该安装的原 `runtime/controller-helper.cjs`。它在全新独占目录局部 bundle 原 TerminalHost/PTY/options/schema/framer/进程身份模块，并建立仅供该 bundle 解析的 `node_modules` 链接（Windows junction）到明确安装依赖，实际 realpath 必须相同。原 Windows reader 的动态加载逻辑与所有已编 native 依赖保留，不注入替身。真实 TTY 和 pipe 分别执行短→实际长→短消息，要求同一 helper 身份、正常 Ctrl-D/EOF 退出0及实际所观察进程消失；未取得正常退出证明时保留 FAIL，dispose 不代替 EOF。生命周期等候上界25秒、输出上界1MiB。Windows 只声明已观察身份退出，不由 ConPTY 关闭或空查询冒称 kernel Job 全树为空。

准确安装 Node/helper/Go/VERSION、实际加载 addon 与编译所用源码在传输前后核 SHA；完整报告与转录保存在私有输出目录。`report.json.summary` 和标准输出末行仅包含平台、PASS/FAIL、两个入口的响应数量/长消息字节数/自然退出与强制清理标志、退出码及未执行 RPC/模型声明，不含路径、环境或 invocation。Windows 外层只消费该有限汇总；其完整安装资格由外层原 checker 证明。新入口的语法与差分检查通过后，正式消费r3真实完成回执；没有复用旧 pending 请求作为完成原件，也未重复运行已准备的旧输入组件检查。

真实 RPC 开发集成 r1 原件位于 `/workspace/swa-tcrpc-r1-N9ptBE/evidence`，controller 请求 `93b72058-4ee3-46e5-9538-88f82b22bb39` 返回 HTTP409/CLI6、原账本保持 `pty-spawn` pending。尚未调用 task.create。实际 daemon 日志记录启动 delivery 已写，PTY PID342412；该 session 的673字节 `output.log` 记录了真实 identify 输入 JSON 和 `ready:true` reply JSON，二者直接相邻、中间没有换行。helper 已响应，原 `helperCall` 的成熟 NDJSON framer 无法将同行两个 JSON 解析为单个回执。原服务正常 stdin 结束后退出6，observer1，daemon retirement busy，完整所属进程退出保持 UNKNOWN；05另负责按准确归属清理，不改原请求。

这次直接消费者遗漏是正式 `RuntimeTerminalWriter` 先以16KiB chunks写文本，再等待原submit delay并独立写CR；先前局部入口将文本和LF一起写入。Root与独立Reviewer接受追加隔离真实原 writer→TerminalHost 的短输入最小复现和标准 readline `output:process.stdout` 的局部修复。只在原 JSON/schema/framer 下真正解析匹配R才算响应，不能从字串查ready。必要验证继续使用实际约322KB公开invocation、短→长→短、真实EOF和pipe，限制25秒/1MiB，保留原ANSI转录与回显体积。永久checker也改为直接消费原 `RuntimeTerminalWriter`，不制造远程 write settlement。

增量最小复现 `writer-27bsPU` 使用原429e helper，在104字节短输入中重现同行回显与reply，原framer记录为零并报告invalid-json，等待超时，脚本退出1、强制dispose=true；不计正常EOF。增加标准output选项后的准确helper SHA为 `7f24f8e75567c3023ad71fbaa3baf6107afe9b17049df7feb45f0e96f69f452b`。`writer-N4J60x` 由原writer发送短→322408字节长→短，原framer匹配三次ready、同PID344764/incarnation、Ctrl-D自然退出0，dispose前实际进程消失，forced=false；完整原ANSI输出323608字节，小于1MiB。`pipe-RTTy6Q` 消费同新helper，短/长均ready、stdin EOF退出0、实际进程消失，forced=false。对应 `writer-before.log` 保留exit1，`writer-after.log` 与 `writer-fixed-pipe.log` 保留exit0。新的受影响strict检查另记 `writer-strict.log` 与exit文件。上述运输检查仍不代替下一次真实RPC或Windows原生验收。

上述四源经过独立审查接受并提交为 `36fb24a9`。r3复用经过单独清理与准确核验的开发目录 `/workspace/swa-tcrpc-r1-N9ptBE/development`，在新数据目录 `/workspace/swa-tcrpc-r3-ZM9XQg/data` 完成真实 Go/HTTP/RPC/SQLite 全链。新 task.create R为 `c8eff090-40a1-4179-8fdc-06d4b985d870`，原父子回执均完成，重读原R不创建第二个Task；原helper后续observe、task.show、controller.close均退出0。授权撤销完成，serve与observer均退出0，原完整所属进程观察两次为空。原件 `evidence/result.json` SHA为 `236cfa5a0c03f109e09d86de718eef9e1921f3419af731d68c69a25fd40558a4`；开发helper实际bundle为 `9ef4fa616f95d8426dd66316ad25835c986e9e9963aef1e7709027027e23dbd9`，其余输入仍为S4c。没有Worker或模型调用，原安装未改，旧请求未重放。

永久检查入口随后直接消费r3真实已完成回执导出的 `evidence/task-create-invocation.json`（SHA `6a4903573ddcef8da036b512070346d4ecddd5f6452b019be2c5186911768e0c`），命令使用上述development根、该原件绝对路径及独占输出 `.verification/controller-taskcreate-diagnosis-20261023/formal-r3-01`。实际脚本退出0，TTY与pipe各三次ready，长identify报文6102字节（原task.create报文6105字节），均超过4095边界。TTY原输出7239字节，PID348934同incarnation，Ctrl-D自然退出0；pipe PID348951真实stdin EOF退出0。二者均实际确认进程消失，forced_cleanup=false、cleanup_unknown=false；1465项源码、4项安装输入、实际node-pty addon首末核验通过。报告SHA为 `9c99600e0713a438190dfba4f7bf1e38764b1f087ef68eabbfd11be39c84a595`，原日志及exit文件完整保留。

当前已取得Linux开发集成和永久入口实际结果，仍需后继同提交完整构建、正式安装、Windows原生验证及真实N4/N6；没有将本次结果称为Worker执行或模型交付通过。
