# Agent 来源、双平台目标与实际能力

本次用户要求适配大部分Agent，产品目标为Windows x64和Linux。当前依据是本地集成树`b7447f4a`中的Orca 1.4.230源码。模板、结构化引擎、安装、登录、可启动、工具政策、完整成果和所属退出是不同层次；本表不按名称数量宣称已适配多数，也不把需求改写成某个供应商数量或凭据数量。

## 实际来源

来源根`U = third_party/orca-v1.4.230/src`。以下路径均实际读取或由原TypeScript编译器解析，身份与命令取源文件内容：

- `U/shared/tui-agent-display-names.ts`导出的`ALL_TUI_AGENTS`含45个ID；`U/shared/tui-agent-config.ts`的`TUI_AGENT_CONFIG_SOURCE`也有45项。
- `U/main/runtime/structured-agent-runtime-metadata.ts`和`structured-agent-runtime-registrations.ts`注册7个结构化引擎：Pi、Codex、Claude，以及`U/main/acp/acp-launch-specs.ts`中的Grok、OpenCode、OMP、Antigravity。
- SWA基线`runtime/swa-orca/src/agent-discovery.ts`只枚举这7个结构化注册；配置观察分支为Codex/Claude/Pi/OpenCode，获审NativeLaunch联合及关闭工具准入当时仅Pi/OpenCode。TUI模板名称不因此自动成为SWA可执行引擎。

本轮先行复用上述7个实际原生适配器，并逐项评估其他TUI模板的可复用启动、输入、取消、会话和成果入口。缺少结构化接口的Agent继续按其真实终端能力评估，不为凑支持数量另造任务权威或把终端预览当完整成果。

“大部分Agent”的验收分母已询问为7个结构化引擎、45个TUI模板或两组分别多数，当前待答。先行实现顺序不代替该用户决定，也不将名称数量作为已通过比例。

## 45个TUI模板清单

表中命令是上游检测标识，保持aliases与ID分开；不是本轮直接执行的命令建议。`未声明禁用`仅指该模板没有`detectUnsupportedRuntimes`，不表示Windows/Linux已运行或上游二进制兼容性已验证。`结构化`列表示Orca已有相应注册，其余为当前TUI来源候选。

| ID | 检测命令 / aliases | 额外启动或检测条件 | 原生输入模式 | 结构化 | Windows / Linux模板声明 |
| --- | --- | --- | --- | --- | --- |
| claude | claude | 原CLI与账户隔离另核 | argv | 有 | 未声明禁用 / 未声明禁用 |
| claude-agent-teams | orca / orca-dev、orca-ide | 还需claude；launch为orca claude-teams，平台命令名由源码处理 | stdin-after-start | 无 | 明确禁用win32及WSL / 未声明禁用 |
| codebuddy | codebuddy / cbc | 原CLI | argv | 无 | 未声明禁用 / 未声明禁用 |
| openclaude | openclaude | 原CLI，草稿prefill | argv | 无 | 未声明禁用 / 未声明禁用 |
| codex | codex | 原CLI与账户隔离另核 | argv | 有 | 未声明禁用 / 未声明禁用 |
| autohand | autohand | 原CLI | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| ante | ante | bare TUI；--prompt是一次性模式 | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| trae | traecli | 使用TRAE CN标识，prompt前有-- | argv | 无 | 未声明禁用 / 未声明禁用 |
| opencode | opencode | 输入就绪信号与ACP分别核查 | flag-prompt | 有 | 未声明禁用 / 未声明禁用 |
| opencode2 | opencode2 | launch追加--standalone；不能冒充opencode注册 | flag-prompt | 无 | 未声明禁用 / 未声明禁用 |
| mimo-code | mimo | 输入信号沿上游模板，未独立验证 | flag-prompt | 无 | 未声明禁用 / 未声明禁用 |
| pi | pi | ORCA_PI_PREFILL草稿入口 | argv | 有 | 未声明禁用 / 未声明禁用 |
| omp | omp | ORCA_OMP_PREFILL草稿入口 | argv | 有 | 未声明禁用 / 未声明禁用 |
| prime-agent | prime-agent | prompt前有-- | argv | 无 | 未声明禁用 / 未声明禁用 |
| qoder | qodercli / qoder | 原CLI与trust另核 | flag-prompt-interactive | 无 | 未声明禁用 / 未声明禁用 |
| qoder-cn | qoderclicn / qodercn | 原CLI与trust另核 | flag-prompt-interactive | 无 | 未声明禁用 / 未声明禁用 |
| gemini | gemini | 原CLI | flag-prompt-interactive | 无 | 未声明禁用 / 未声明禁用 |
| antigravity | agy | 此为TUI，不是下表ACP服务器 | flag-prompt-interactive | 有，使用不同ACP命令 | 未声明禁用 / 未声明禁用 |
| aider | aider | 原CLI | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| goose | goose | 原CLI | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| amp | amp | 原CLI | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| kilo | kilo | 原CLI | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| kiro | kiro-cli | launch为kiro-cli chat --tui | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| crush | crush | 显示名Charm | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| aug | auggie | ID aug与命令auggie不同 | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| cline | cline | 原CLI | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| freebuff | freebuff | 原CLI | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| codebuff | codebuff | 原CLI | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| command-code | command-code | launch追加--trust；不能与cmd.exe检测混淆 | argv | 无 | 未声明禁用 / 未声明禁用 |
| continue | cn | continue是shell关键字，检测使用cn | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| cursor | cursor-agent | 原CLI与trust另核 | argv | 无 | 未声明禁用 / 未声明禁用 |
| droid | droid | 原CLI | argv | 无 | 未声明禁用 / 未声明禁用 |
| kimi | kimi / kimi-code | 原CLI | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| mistral-vibe | vibe / mistral-vibe | 原CLI | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| qwen-code | qwen | Windows paste后Enter有原生重试延迟 | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| rovo | acli | launch为acli rovodev run | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| hermes | hermes | launch追加--tui | hermes-query | 无 | 未声明禁用 / 未声明禁用 |
| openclaw | openclaw | 原CLI | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| copilot | copilot | 互动模式与一次性prompt不同 | flag-interactive | 无 | 未声明禁用 / 未声明禁用 |
| grok | grok | prompt前有--；ACP使用agent stdio | argv | 有 | 未声明禁用 / 未声明禁用 |
| muse | muse | launch追加--trust-workspace | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| dsh | dsh-tui / dst | 还需dsh；launch为dsh-tui . | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| zcode | zcode | expectedProcess为zcode-cli | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| devin | devin | bare REPL；argv prompt会直接提交 | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |
| jcode | jcode | 原CLI | stdin-after-start | 无 | 未声明禁用 / 未声明禁用 |

## 七个结构化引擎的实际复用入口

下列路径以`U/main/`为前缀。`startSession/send/cancelTurn/closeSession`等是源码适配器入口，不是SWA已对所有引擎开放的公共动作。各引擎都要分别获得当前项目批准、真实账号、关闭工具政策、同session输入/取消及完整成果验证。

| 引擎 / 原生传输 | 启动与输入/取消入口 | 账号与ToolsOff现状 | 会话与完整成果入口 | 平台源证据 |
| --- | --- | --- | --- | --- |
| Pi / jsonl-rpc | `pi/rpc-runtime-registration.ts`、`rpc-launch-resolution.ts`、`rpc-session-adapter.ts`；cancelTurn发abort，stop结束session | `PI_CODING_AGENT_DIR`；SWA已有固定1.0.1的`native-pi-policy.ts`/`private-pi-account.ts`，需真实账号/API/模型匹配 | `pi/pi-transcript-import.ts`、`pi-session-history.ts`及SWA `task-result.ts`的自产JSONL/journal检查 | `supportsSupervisedProviderChildLocation`允许原生local非WSL；Windows另需进程创建时间proof；SWA完整custody平台实现/实测仍各自核 |
| Codex / app-server | `codex/codex-structured-launch-resolution.ts`、`codex-structured-session-adapter.ts`及`codex-structured-session-teardown.ts` | `CODEX_HOME`；原workspace-write/approval并非ToolsOff；0.163无模型目录/配置检查见下节，产品NativeLaunch政策与原账号路由仍待接入 | `codex/codex-cli-conversations.ts`、原生thread/journal；后继真实rollout读取器只接最小内部输入，完整成果消费者未验 | `supportsCodexStructuredLocation`允许原生local非WSL；实际Windows/Linux账号和每Worker完整退出分别检查 |
| Claude / Claude原CLI的structured SDK桥 | `claude/claude-structured-launch-resolution.ts`、`claude-structured-session-adapter.ts`；cancel/close由原adapter调用真实CLI | `CLAUDE_CONFIG_DIR`；权限模式/canUseTool回调不自动证明模型请求无工具；SWA基线政策与账号私有化待接入 | `claude/claude-cli-conversations.ts`、原journal与SWA成果消费者待接入；不能拿预览冒充完整 | `supportsClaudeStructuredLocation`允许原生local非WSL；不以当前机器无CLI推断平台不支持 |
| Grok / ACP | `acp/acp-launch-specs.ts`使用grok agent stdio；`acp/acp-structured-session-adapter.ts`的输入/interruptAcpTurn/closeSession | `GROK_HOME`；native spec可选择API key或cached_token；SWA基线配置、私有账号、ToolsOff政策未完成 | `acp/acp-dialects/grok-dialect.ts`、`grok/grok-transcript-import.ts`、`grok/grok-session-history.ts`；实际SWA结果政策待接 | ACP local非WSL且Windows创建时间proof；原spec未作Windows/Linux排除，安装/启动仍待实测 |
| OpenCode / ACP | `acp/acp-launch-specs.ts`使用opencode acp；原线1.x>=1.18.31或2.x>=2.0.14；输入/取消共用ACP adapter | SWA已有固定2.0.31/DeepSeek-pro的native-opencode-policy/private-opencode-account/opencode-policy-plugin；不能推广为任意版本/提供商已验 | `acp/acp-dialects/opencode-dialect.ts`、原生私有SQLite/journal与SWA `native-opencode-import.ts`/`task-result.ts` | ACP local非WSL，Windows创建时间proof；SWA基线launcher仍Windows专用，Linux后继需独立custody与实际结果 |
| OMP / ACP | `acp/acp-launch-specs.ts`使用omp acp；版本>=17.0.5；输入/取消共用ACP adapter | `PI_CODING_AGENT_DIR`默认.omp/agent；模型仅session内发现；SWA配置、隔离和ToolsOff政策待完成 | `acp/acp-dialects/omp-dialect.ts`、`omp/omp-transcript-import.ts`、`omp/omp-session-history.ts`；SWA完整成果待接 | ACP local非WSL，Windows创建时间proof；未声明平台禁止不等于本次通过 |
| Antigravity / ACP | `acp/acp-launch-specs.ts`使用独立agy_acp_server.par；Linux传--uid=；不是agy TUI | `antigravity/antigravity-chat-account.ts`的专用OAuth目录，与agy登录不同；ToolsOff、模型发现和SWA政策待核 | spec的transcriptImport为null；sessionHistory不从agy参数恢复；完整成果/重启恢复不能据原有CLI路径推定 | `antigravity/antigravity-acp-runtime.ts`固定1.3.0校验pin有Linux x64/arm64及macOS，明确没有Windows pin，当前Windows ACP不支持 |

ACP共同定义`acp-structured-agent-definitions.ts`的`approvalEnforcement='orca'`表示处理权限请求；不是禁用所有工具。Grok的`--always-approve`仅与fullAccess有关，OMP/OpenCode也有权限请求处理，均不能拿“自动拒绝/批准”替代ToolsOff原生证明。Antigravity的yolo/default模式同样不证明无工具。

`provider-process/supervised-provider-child-location.ts`要求local、非WSL，Windows还核真实进程创建时间。Codex/Claude通过`shared/execution-host.ts`的原生local判定。SWA产品层还必须接入对应平台的真实完整所属树控制，不能把上游adapter的supportsLocation当作产品安装或停止验收。

## 每个引擎的实际覆盖记录

清单和模板平台声明来自源码核查。当前云机为Linux x86_64，`e14800c1`的Linux安装、PTY/watcher、服务/daemon及服务级正常退出已验。后继`6890522e43d7b81e99b09ca94acc27b9d3a5c7dd`组合安装和D普通进程检查14项通过，其中11项使用装内原件、3项为同SHA诊断；尚未执行Agent账号、模型或N=3。主控已核Codex 0.163.0及login reported，API_KEY未设置不能据此称缺登录；专题metadata04结果如下。其他六个引擎本卡没有进行登录或模型调用，不能把它们填为已安装/已认证/已启动。

后续逐次记录每个引擎的`installed/version`、`login/config`、`NativeLaunch/ToolsOff`、`start/send/read/stop/resume`、`完整result`和`process custody`的PASS/FAIL/NOT_RUN或unknown及来源；每项分别标Linux和Windows。用户确认Windows x64是目标体系架构，当前没有交互式Windows主机；Windows CI已有真实构建和局部probe失败，准确状态见[STATUS](../../../STATUS.md)，不把失败写成未运行。Windows实际安装和模型链路仍未验，不重复询问架构，也不声称已具备远程交互执行环境。

## Codex 0.163的准确来源与已验边界

官方`openai/codex`标签`rust-v0.163.0`固定到提交[`83086188ae0614bd882818ff1aa23f3194962012`](https://github.com/openai/codex/tree/83086188ae0614bd882818ff1aa23f3194962012)。完整原始[`models-manager/models.json`](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/models-manager/models.json)的Git blob为`72a78e0eacf94103f4babda2a5245aba4ce848c1`，SHA256为`943ca7fe1d19ed019054158303f0dbbd80b3bef43b3aa425a71aa7cb3fb52c2b`；没有改写模型字段或伪造provider。正式`model_catalog_json`在启动时选用该完整目录，[provider工厂](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/model-provider/src/provider.rs#L388)构造StaticModelsManager，实际静态目录不被后续远端刷新覆盖。该原目录的真实`gpt-5.5`条目没有code-mode强制值、clock或其他experimental工具声明；模型元数据仍不等同授权上界。

专题metadata04通过真实0.163 app-server检查：47项配置相等、2项工具配置的原始layer来源相等、31项实际feature值相等，`model/list`含真实`gpt-5.5`；原生和消费者退出均0，thread/model请求均为0。原件为`.verification/cloud-setup/codex-policy-review/metadata-run-04/summary.json`，sessionFlags来源版本为`sha256:93e8fa5c2031ffd1690143e4123a12b0e1a04a35c9bfa8b1b874d3c2353fcb74`。该次使用独占0700空CODEX_HOME，account不存在；不能据此否定原已报告登录，也没有证明原账号路由、推理权限或有效工具全集。此前失败原件保留，不用04覆盖其结果。

源码确认公开`environments:[]`可以关闭环境访问，但初始线程和每次turn都要保持空环境，不能接受`cwd/runtimeWorkspaceRoots`重新引入环境；线程`selectedCapabilityRoots`保持空。[工具注册表](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/core/src/tools/spec_plan.rs#L1209)还独立受stable environment、shell、code mode、MCP、模型clock声明、plan、用户输入、delegation、web/image、skills和memory/history等门控制。插件warmup在initialize前发生，需启动时关闭；`--strict-config`防配置错误回落默认值，hooks与legacy notify也分别关闭。完整门逐项核验后仍需实际线程/消费者验证，不能从几个flag或metadata检查声称ToolsOff。

普通app-server没有公开pre-turn有效工具全集查询，也没有公开JSON入口注入Rust `ToolPolicy.allowed_tools=Some([])`。后继必须以准确版本、真实模型、来源与完整组合政策逐项审查，遵守当前项目AllowedTools；未批准的MCP、clock、delegation和其他工具不能默许执行。Codex新增分支合同已冻结；其实际NativeLaunch准入、独立API账号绑定、真实工具集合、模型、同会话输入及完整成果均待02/06验收，原ChatGPT账号保持保全。

独立Codex成果读取器`runtime/swa-orca/src/codex-session-result.ts`已经实现并完成严格编译和真实文件负向审查；正向会话、续写、真实停止及产品接线仍为NOT_RUN。其内部最小输入为`path/privateRoot/nativeId/cwd/model/provider/stopped/nativeVersion:'0.163.0'/source`，另有必填内部`validateExport(serialized)`回调，由真实账号快照的调用方提供。`source`复用现有`nativeConfigurationSource`的`{path,version}`及`dev:ino:birthtimeNs:mtimeNs:size`实际版本；返回`{value,verify,validateExport}`沿已有成果消费结构。读取器核原生文件实际格式和来源，完整原文及最终序列化须经导出检查；调用方继续核原Run/Dispatch/session/fence、providerHandle与进程归属。缺少真实session/turn来源必须拒绝，不新建SourceVersion账本或公共Task协议；这些内部参数不提前冻结账号/NativeLaunch。

## Codex与Claude的API-key接入规划

Codex后继选定CLI0.163.0、内建openai与真实gpt-5.5、上述未修改官方完整catalog。固定源码的[`cli/src/login.rs`](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/cli/src/login.rs)与[`login/src/auth/manager.rs`](https://github.com/openai/codex/blob/83086188ae0614bd882818ff1aa23f3194962012/codex-rs/login/src/auth/manager.rs)支持官方`login --with-api-key`私有stdin和ApiKey文件存储，无OAuth refresh。来源为显式、独立且owner-only的`SWA_CODEX_API_KEY_HOME`，准确路径边界见[共享合同](01-contract.md)；不自动读取原ChatGPT auth，不将其token转换为key。各Worker私有HOME分别由官方CLI导入真实获准key，配置固定file store、API登录和`https://api.openai.com/v1`。推理可使用该域`/v1/responses`的HTTP或TLS WebSocket；原始key不进入argv、NativeLaunch、公开回执或事件日志。新增认证/base URL门未实测，47+2+31原证据保持其限定范围，登录写入成功也不证明远程key有效或模型权限。

Claude后继拟固定用户实际CLI2.1.284与现依赖SDK0.3.284，使用API key、`--bare`、`tools:[]`、`--disable-slash-commands`、空settings sources/MCP/agents/plugins/skills/hooks/附加目录，并拒绝未批准的覆盖参数。SDK声明的CLI版本不能代替实际可执行文件验证。官方固定[`CHANGELOG.md`](https://github.com/anthropics/claude-code/blob/8364969e9f5234ef3d9743cf7c790e9aab0ac3b1/CHANGELOG.md)说明bare跳过hooks/LSP/plugin sync/skills目录与auto-memory，并禁用OAuth/keychain；本轮不批准apiKeyHelper命令。04已核验官方Linux x64原生CLI的完整SSRI与SDK manifest二进制SHA256，独立空HOME的`--version/--help`均0；该真实help仍允许bare下显式`/skill-name`，因此须额外禁用slash commands。证据为`.verification/cloud-setup/claude-cli-2.1.284/report.md`，未执行完整startup、账号或模型。SDK `settingSources:[]`自身不隔离managed policy，`plugins:[]`自身不证明全部插件关闭，session hooks仍不得注册。真实system/init的工具/插件/skills/MCP数组须逐轮核验；它在首输入后到达，不能称为首输入前的工具全集证明。

Claude只接受显式`SWA_CLAUDE_API_KEY_HOME`下真实settings.json中的literal `env.ANTHROPIC_API_KEY`，不回退默认`~/.claude`或Orca环境，不读.credentials/OAuth/AUTH_TOKEN、不执行helper，不透传其它来源env/settings。source/home沿Codex同样的owner-only与双向路径隔离；空配置报告未配置。来源的准确允许格式与拒绝项仍须02/04共同审查，不能删除未知字段后继续启动。

Claude需要分别保存原journal投影、真实SDK事件序列和CLI自产会话JSONL；将SDK消息重新编码不能称为CLI原件。Codex字段已共同审查并冻结，直接消费者实施中；Claude最终NativeLaunch字段、会话/原始delta/完整成果及Windows Job或Linux D消费者仍须共同审查后实施。当前没有这两条路线所需的真实安全配置key，账号/模型正向均NOT_RUN；实现和无凭据负向可独立推进，不自动取得人类会话、执行Grant或更改工具/资料范围。

模型测试预算不设上限解除本轮费用额度限制；它不产生缺少的供应商账号、Windows机器、原生支持、工具权限、私有资料权限或外部发布许可。固定公开输入、ToolsOff、原request幂等、效果未知、超时/并发和机器资源准入继续有效。后续实现缺口交02，依赖/原生构建和平台候选交05，命令体验交03，真实验收交06；本轮不以任何比例宣称已经完成“大部分Agent适配”。
