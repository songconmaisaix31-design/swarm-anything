# SWA 当前状态

本页统一维护当前版本、已验范围和实际限制。资源参数只在 [RESOURCES](docs/RESOURCES.md) 维护，授权和待答项只在 [QUESTIONS](docs/QUESTIONS.md) 维护，接管操作见 [HANDOFF](HANDOFF.md)。

2026-10-29 Windows 复验以 main `5c11bbf8` 为基线，分支 `codex/windows-compatibility-20261029` 修复实际 Git 测试的仓库来源地址。专项 Git/SQLite 共 19 个结果、9 项 Windows 生命周期、构建、契约、前端 lint 和架构检查通过；完整 Go 检查仍有 9 包失败、前端 3 个套件失败、依赖版本探测超时。Swarm CLI 同一安装的两名真实 OpenCode Worker 已完成只读审查、停止、释放、成果导出和控制端关闭，验证服务已退出；失败释放与中断后恢复仍未通过。具体问题、证据和独立 CLI 修复分支见 [Windows 任务](tasks/windows-compatibility-20261029.md)，不据此宣布全量 Windows 可用。

当前源码893fb8852e15109ca9a99f1bd51d83ea249a37b8已普通push，参数窄修/84严格检查获5eab3922限定接受。build19、完整ZIP/普通解包88及安装复制/native/28251闭包/保护拒绝通过，汇总6保留功能未验。新89服务在64508/runtime6aec5c49真实就绪，90两次来源一致、authority为空、业务/模型0，准备91及实际helper/最终同安装双Worker继续。旧67的87e指定session/三句柄/六已观察身份退出获2197a441限定接受，原EOF6/Job不可查询/83父R pending保持。原Worker持有89 TTY32198和Job观察21806，原Orca/95ef/5187保持。

draft PR #5未合并，d829/3fadb/5c750修订及72/73实际检查获限定接受。最新893实际合并源fce64fb1的Ubuntu119658661466和Windows119658661639均普通frozen成功、Go整体1；失败名称68/79与真实main50c2各平台相同，无增删。前5c Windows额外迁移失败此次未复现，原因未知保留，未开始的额外两来源复验已取消；完整CI失败。原64/69/75/83/85/86/87前置失败和恢复原件分别保留。

最近已验安装来源f2ab4fd9155f4f4bb85c74845f3f3ef5eb607caa，产品记录01b23b452a7949f0468859044ff622c0be327398已push。新增Pi原生StepFun custom准入，strict/architecture/真实空auth拒绝、build16及完整ZIP解包29实际0。仓库外install29复制/native/28233路径与保护拒绝通过，完整安装汇总6；同安装四项生命周期130/130/0/6、C08严格7及所属退出获32f254c5限定接受。该安装的产品Worker模型、完整安装及同候选双Worker仍未通过。

当前产品接入源e9fa97e3已普通push，51 strict/三个CLI传输前Go用例、52完整合同264样例及生成一致性、build17实际0。49广包Go整体1：Relay启动和Workbench实际输入检查失败，未作同条件基线比较。独立f5393fb4退回e9fa的ACP完整Job退出缓存及根退出提前删除会话两项，原Worker返修并继续准确最终安装真实验收，产品尚未接受。

e9fa完整ZIP/普通解包53实际0，仓库外install53复制/native/28243闭包和保护拒绝通过；T02实际6保留真实消费者未验。同安装真实Pi1.0.1的无推理RPC/node-script与完整Job回归56获01386648限定接受，55入口manifest错误退出1保留。来源后继64DD沿384D仅共用生产settings bundle，获同报告技术接受；e9fa ACP返修及最终准确安装验收继续。

088f0fee对e9fa追加三项静态退回：受限权限请求、合并完整成果实际key检查、原生错误和diagnostic安全分类，与原ACP两项集中返修。用户新增参考OpenMausBot，主控已固定dbb73a73并读取相关CLI/registry/构建源码；采用边界见首版任务。真实Grant、产品Worker模型和同安装双Worker继续未验。

原生验证来源fe822783的46实际0：OpenCode2.0.31 ACP、单次DeepSeek/pro请求HTTP200/tools0、原session成功/完整消息及两个Job退出；43—46已验范围获42d70d4e限定接受。执行Grant客户端按64DD已接受来源补充准备，真实签发、产品Worker模型、最终同安装双Worker仍未验。F18C/F803合同按SPEC §21.1.5—§21.1.6；原95ef/5187保持。

用户已明确批准Observe，禁止使用Aliyun key，允许阶跃星辰和其他Agent测试。原Worker ctx_fb2c13c28d40完成delegated-observe26实际0：真实仅observe Grant、CurrentUser DPAPI及原23消费、status/capabilities、五项真实403、持久范围和原Orca保全通过。原95ef安装及64509服务保持。真实发现五个已安装Agent；Pi账号源无可用key，Codex OAuth存在，Codex等其他Agent的完整关闭工具及原生调用合同仍有缺口。原生OpenCode已验范围见上一段；StepFun配置路径已询问，产品Worker模型、真实双Worker、T11/T12仍未通过。

保留的95efcc288e32ad8d72d4ef902f32ec130f97fea3安装已完成Observe。compile20/build15/真实ZIP及普通解包20实际0；同安装C08精确7、生命周期四模式130/130/0/6、C09诊断及所属退出获限定接受。原installer复制/native/28233路径和保护范围通过，T02聚合6保留真实消费者未验。Observe凭据位于human22/human-approval/observe-credential.dpapi，到期时间见QUESTIONS；原23消费0，24/25真实失败原件保留。

780安装阶段记录：780a35e9ec996494f4188f44229d2568bf38b9a2完整ZIP普通解包后，原installer安装至仓库外780a35e9-install13，实际闭包/native/空Job及端口、保护根和四junction拒绝通过；T02聚合6保留当时真实消费者未验。独立数据目录的服务、HTTP、五份SQLite和正常关闭均0，三个服务进程为Medium。同安装四项EOF/输出中断及所属回收检查实际0，退出130/130/0/6；原Orca保全通过。八项依赖分类及21份成品/九版本许可已核，源码f46及后继返修保留。当时尚无本人Observe执行回执，后续真实批准与26结果见本页当前记录。

系统实际于UTC2026-10-21T14:41:49.500重启，原两Agent于UTC14:38:40退出1073807364，Task恢复ready。原Run已绑定generation3；新Worker ctx_a8f0c302cc3c及Reviewer ctx_40bf84d10b8c沿原Task/树/分支继续，启动均观察到turn_started。本机Orca app6228/runtime a2765d35-0b66-41e6-a8ca-e76d25294927 ready；原S、原库和配置保留，操作前重新核实际进程身份。

## 当前主线与 M0

| 项目 | 当前事实 |
| --- | --- |
| 用户首版目标 | 使用 REA 逆向分析 Orca 交付物，抽取 CLI 执行能力，发现并调用本机注册的 Agent，减少运行依赖并隔离环境；交付从原有 Agent 或终端调用的可控 Swarm CLI。[首版任务](tasks/swa-cli-v1-20261020.md)记录具体范围与验收，尚未通过验收 |
| 首版执行与验收 | 已确认 Orca 无界面执行及控制端身份；固定抽取范围后定义 CLI 规则，完成多 Worker、失败/资源及安装包。最终使用安装后的同一候选完成一次至少两个真实 Worker 的任务，验证并发、指定停止及成果获取；产品采用独立后台，须验证不妨碍本机Orca CLI及其原配置/状态/进程 |
| 规范仓库 / 默认分支 | GitHub 仓库 ID `1410836101`，`songconmaisaix31-design/swarm-anything` / `main` |
| main 的产品与治理集成来源 | `6eb7c7f640a9cf1b05ea365b3afdf6883cd01765`；已从初始 main 普通快进并 push，完整包含产品32ab历史与接受后的M0文档；后继当前事实记录沿 main 维护 |
| 产品基线 | `songconmaisaix31-design/works-relay-integration@32ab1eec808a5848aabad40f11133735a1214e55`；原 PR #2 已普通合入 |
| M0 任务分支 | `swa-m0-20261020@6eb7c7f640a9cf1b05ea365b3afdf6883cd01765`；独立 [COMMENT review 5581860208](https://github.com/songconmaisaix31-design/swarm-anything/pull/4#pullrequestreview-5581860208) 接受，原hook已由主控读取并回复；[PR #4](https://github.com/songconmaisaix31-design/swarm-anything/pull/4) 已实际合入产品分支，同源快进 main |
| 主控内容来源 | `validation/v1-20261012@cf22f118193d5dcc3f2d2ec436bd4f06e9a22c9b`；独有决定、归档、任务、实验入口与研究文档按[整合清单](docs/integration-audit-20261020.md)纳入 |
| 已审调查记录集成 | `fac75c7f963d16c7f112e8e90ad30e36510d4738` 已独立接受并普通快进/push main；只新增准确30b来源调查、b112契约记录和34cfe独立报告共八份文档，各自接受范围保持，程序/依赖未变 |
| 后继工作 | 新23入口已提供本人执行。Task9f的ctx_4c001fda773c按人工阻塞结算failed并retained，原终端/5187供当前模块接续；实际批准后沿同一Task/树/终端创建新Dispatch。执行Grant、T11/T12及同安装双Worker成果未验；八项依赖分类、闭包和九版本许可已核 |
| 当前独立审查归属 | 同一Reviewer Task `task_1cd8014750f9`的Dispatch `ctx_40bf84d10b8c`、terminal `term_6b1b14a1-e6e8-4f57-b394-8bcd79ec1e3e`，保持原树、分支及两报告写域。beadc233接受准确23两文件及FD5、真实日期/v2/旧260收尾范围，95ef程序/包及实际C08/C09接受保持，原22撤销和未验条件保留 |
| 成果路径 F16 | ebf55已将原生runShow参数改为真实schema要求的id，准确da2e报告局部静态接受，主控已完整读取并回复。T07/T13真实成果取得和导出仍未执行，参数修正不等于完整成果验收 |
| 后续输入 F17 | ebf55原参数修正局部接受保留；当前真实正文方案按准确d441获73946fd2技术接受，SPEC §21.1.2已定稿，交同一Worker实施。固定child R/native、原host队列或实际PTY普通输入、当前异步授权、同session/fence及效果后unknown保全均须真实验证，完整正文和后续成果仍未通过 |
| REA 来源核查 | 当前Orca1.4.230/app.asar为6a9，两次限定JS分析的partial/truncated限制保持。按用户“将orca cli逆向后参考”，补当前orca.exe准确612b的PE/Rust静态证据及实际命令目录144e的20JS分析，三个入口均EXIT0；CLI图partial/222文件未选，原生函数未反编译，完整运行依赖仍未知，见[CLI参考](docs/standards/swa-orca-cli-reference-20261021.md)。doctor原EXIT1/config_drift保持，无MCP/本机Orca配置修改 |
| 独立 Go 检查结果 | 9c/16ad原结果保留。新增Go批准入口与消费者在独立detached准确3590bf11043a2e95cb00b319d4a44a44c2e5c784树执行未改的已审入口，exec2414实际EXIT0：四包test-c完成，三个CLI传输前函数逐PASS/零SKIP，SOURCE和结束干净HEAD均3590；runtime/live函数NOT_RUN、model_calls=0。原件根swa-go-3590-01的go-source-01及control/go-3590-execution-01.log；主控检查不代Worker自测、源码CR、原生模块或安装验收 |
| 注册 Agent 后继方案 | 按SPEC §21.1.1—§21.1.5实施；e549的N10/生成静态接受保持。9e修后N08/N13限定技术获f5dc接受，native_launch及逐类投影/请求/私有账号与工具消费者已在§21.1.5定稿，同Worker实施；默认Pi0只限定该来源，全部实际账号/工具/调用仍未通过。五条RPC导入边局部静态接受，实际收窄未验；Windows/.NET下载及D01—D05技术接受，窄helper可实施，网络/构建另授 |
| 契约生成 | 原Worker在准确33c5干净前置下仅一次执行generate-02，实际exec38224 EXIT0，资源/生成退出均0，Node512及私有TEMP；只有web/src/api/schema.d.ts生成变化，已纳入e549，未手改生成文件。源码生成不代Node/native构建、安装或模型验证 |
| 首装授权流程 | 当前本人命令为human-authorize-installed23.ps1 -Stage Observe，使用同一95ef安装的human22/64509；新23及FD5已准确复核，旧22两路径直接throw。本人执行请求已发送，目前无人类目录、Grant/token或实际消费 |

当前 main 工作树为 `C:/Users/DW/orca/workspaces/Astrocyte/main-20261020`；原根目录的 `validation/v1-20261012` 与正式实验材料保留。Orca 的新工作树默认基准已实际改为 `origin/main`。M0 的接受仅覆盖文档整合，首版 CLI 程序实现中，尚未通过验收。

## 已有产品验证与最近运行观察

程序和 Web 的已验源码 S 为 `ed543c12106c2dbb3e181cb9bc1647b626455179`。最近原件位于根忽略目录`.verification/swa-cli-v1-control/prepare-18/`、`stop-18/`、`restore-18/`及失败的`prepare-19/`；此前恢复失败、诊断与各次结果均保留，详细结果见首版任务。恢复使用同一S、原库及原环境/配置，未以备份覆盖原库。原件包含真实环境及一致备份，不进入Git或安装包。此前各窗口及M1原件保留原位置，已有产品范围见[产品交付报告](docs/standards/delivery-candidate-20261020.md)及[交付任务](tasks/delivery-candidate-20261020.md)。

| 范围 | 记录的结果 |
| --- | --- |
| 当前服务与资源 | UTC14:41:49.500系统boot及原生process_exited记录确认原Agent退出；当前Orca app6228/runtime a276 ready。原S65980早于两次boot，旧running.json的health仅代表restore18。资源已解除，按RESOURCES连续实施修复；已运行检查保留参数及结果。原静态ctxdc及本次ctx0cf/ctx066的release_unknown保持原错误，未关闭其他终端，新Worker资源独立 |
| candidate09安装与后代测试 | b624/candidate09已复制为installed09，VERSION一致，Node/空Job及28659路径闭包通过；候选实际CJS装载来源全部在自身目录，含watcher/picomatch。T02直接重叠拒绝及端口占用用例已执行，junction用例实际storage_failed，预期写前scope_denied/3；本次serve独立退出数字未保存，install09外层也没有最终退出文件，均不推断。provider-job实际exit1，断言成员5与预期3不符；原日志及安装保留 |
| 当前实际安装与关闭检查 | 780/build13完整包0；410042444字节ZIP普通解包0，原installer安装至仓库外780a35e9-install13。实际28233路径闭包、原生装载和安装负向检查通过，T02聚合6保留T03/T13。仓库外数据服务runtime64c1ceae的HTTP、五库及正常关闭0，三个服务进程Medium；lifecycle14四模式130/130/0/6及所属回收聚合0，C09未知关联格式交原Worker返修。原Orca前中后保全通过，真实模型/双Worker未验 |
| 260候选与首次实际后台 | 260/build12实际0，candidate11/VERSION一致，built=[]、copied四native；实际28659路径闭包、四native装载及空Job通过。service11-diagnostic的runtime5720a822、host30160/server37504就绪，HTTP200；journal/orchestration/profile/自产备份/workspace五库integrity为ok、fk为空，所属EOF及外层0，两次完整Job观察仅余serve自身。installed11已搬迁至C:/Users/DW/AppData/Local/SwarmCli/candidates/26036164；外部原闭包0，runtime52551ae0、host44232/server39960实际就绪，HTTP64506和数据库检查、四项reparse拒绝通过。原Orca6228/32280保持 |
| 507目录、Job与SQLite修复 | 507/build11实际EXIT0，四native和全部Go程序完成，candidate10/VERSION相同。junction02使用与程序独立的路径，四项逐一命中实际reparse边界、scope_denied/3、目标保持，EXIT0；Job12实际四模式全树退出及无关Job保全，parent-loss旧Job仍unknown。b624服务诊断host1/serve6，实际缺Job字段及SQLite长路径问题已窄修复；真实适配器302字符目标备份及integrity通过，strict08实际0，新服务及安装继续复验 |
| 1209首个完整构建与闭包 | 准确1209的build09实际EXIT0，复用三项按原SHA重新核验的固定Node输入，四native、swa/server及故障程序构建完成，candidate08/VERSION=1209。模块实际中间路径最长229字符，原分析/跟踪保持；生产包只复制真实.node与原slotSourceFiles支持资源。check-swa-runtime实际0，34010路径均在候选内，Node24.21.0/Job API1及空Job创建查询关闭通过。job_descendant_test、native_authentication与functional_acceptance仍NOT_RUN，安装及真实双Worker不据此通过 |
| 新开发依赖实际安装 | 准确7c仅一次dependencies04，pnpm11.27.0真实lock-only/frozen ignore-scripts分别7.9秒/2.1秒，外层及四子退出均0；七项已审声明、真实锁与安装一致，原peer/deprecated记录保持。两资源门禁CPU11.3/8.0及14.6/23.2%、内存均超过4GiB、间隔2.501201/2.501621秒。两次CIM所属为空，锁与报告为准确3ba76a85；没有运行Program、native或模型 |
| 已有Python与首次C++编译实际结果 | 准确b75仅一次build-06，实际exec65865及内外退出均1；Python预检/实际node-gyp选择为C:/Python313/python.exe 3.13.13、VS2022 17.14.37710.0。324项部署、21bundle与三官方Node输入/原校验完成，VoidTaskResult不再输出；首node-pty/conpty在swa_provider_job.h:17报C2059/C2143及C4819/936，具体编译原因由同Worker核查。其余native/Go/VERSION未完成，candidate05保留不可安装；全部真实功能仍未验 |
| 固定Node与导入收窄实际结果 | 准确2c仅一次build-05，三项HTTP200及原archive/header/lib SHA、exe大小/SHA/v24.21.0通过。21metafile中host完整RPC index已不存在，正输入5650/实际20957928字节；只确认这次静态变化，其他依赖/native/dynamic/assets仍未验。首node-pty/node-gyp配置未发现Python而失败，内外退出均1，未完成native/Go/VERSION。已有C:/Python313来源及唯一force选择由同Worker静态修复，不装新Python或改PATH；candidate04保留不可安装 |
| 实际bundle与依赖记录 | 准确449仅一次build-04，exec86069同步EXIT1及内外退出文件均1；324项prod deploy和363项供应链核查完成，21份bundle/metafile已得，host为22483367字节。首Node下载TLS前ECONNRESET，空node及部分candidate03保留；无native/Go/VERSION/swa.exe。host图6136扫描inputs、6120个正bytesInOutput输入，完整方法表实际有五条直接导入，包含SSH legacy-relay路径；完整闭包和实际运行仍未通过 |
| 必要依赖实际安装 | 准确8ebe只交一次dependency-03，lock-only 36.4秒/frozen-install 4.8秒及两次资源gate退出均0；原peer/弃用警告保持，仅pnpm生成锁15行变化。主控已读实际退出文件/日志及Worker UTC18:18:16/19两次所属为空；外层exec27025的final因上下文截断未取回，后继poll为Unknown process id，不能声明取得外层EXIT0。授权收回/解除冻结后原S已恢复，没有新bundle/编译/安装候选或模型 |
| 首次实际bundle | 准确e54d45489f54819cccb2d408474e6f885aac6970仅一次build-03，exec76466实际EXIT1；资源0、323项prod deploy完成，首host bundle因真实Unicode11与diff导入缺失失败。无host/metafile、Node下载/native/Go/VERSION；部分candidate02保留，授权已消费并收回。主控及Worker两次所属退出观察保留，恢复同一S后同Worker只继续静态返修 |
| 最近恢复失败与诊断 | 首次restore-11中S43188在监听前退出，fatal仅原CodeGraph导出检查exit status1，原因未知。诊断01因环境名称大小写在目标启动前KeyError；修脚本的新02实际导出检查0/8.470091秒，Node512/45秒诊断上限，原服务15秒及原依赖/配置未改。核失败/诊断进程退出后才作一次新输出恢复并通过；全部失败保留，不把诊断成功写为旧失败根因 |
| 同源产物 | 程序和 Web 同一 S；`D:/Astrocyte-agent-assets/20261015/relay/H/shared-product-ad8413/versions/ed543c12/` |
| 原库与配置 | 原运行根 `D:/Astrocyte-agent-assets/20261015/relay/H/shared-product-ad8413/` 下 `local/astrocyte-workbench/v0.2-access/app-state/state.sqlite`；prepare18一致备份及restore18原库完整性/外键通过，停止期整库比较不可用，恢复使用该原库和原配置 |
| Windows 普通交付 | `dist/delivery-candidate-20261020/`，三个 Go 程序、Web 与启动入口；完整新便携模型包未验 |
| 已通过的限定检查 | 构建、DAG9函数、OpenViking4函数、前端53项、DAG双视口4项、页面8项、架构/依赖、264项契约示例及生成一致性 |
| 独立运行核验 | 准确 S 的49项 GET（含5项403）、真实资料/项目 ID 与原 SQLite 对应、33件 Web 字节、原业务和 Q 保全 |
| 原始失败与未执行 | 完整默认 CI：NOT_RUN；原 `pnpm check:contracts` 与 Redocly 直调：进程崩溃 FAIL；lint/vet 的实际串行偏差和退出保留在原报告 |
| 本次 M1 原入口 | 准确 `987811f417e92cd6f15961e60c279f616e3b21a8`，原依赖冻结安装与未补丁的 `pnpm check:contracts` 均 EXIT0；13项警告、264项示例及类型一致均实际完成。Node24.16.0、pnpm11.27.0、CLI2.60.0；历史崩溃未复现，未应用补丁，T02—T08未执行，完整修复因果证据不足 |
| 首版CLI依赖准备 | pnpm11.27.0的`install --lockfile-only --ignore-scripts`及`install --frozen-lockfile --ignore-scripts`均EXIT0，私有store/TEMP/TMP/cache，两次新资源门限通过。实际入口签名拒绝、peer警告及镜像超时/原命令内建重试记录保留；尚未构建或调用模型，不能计为安装包和CLI功能通过 |
| 第二次窗口准备 | 根忽略目录`prepare-02/backup-resources.json`记录UTC11:00:16、CPU7.2%、可用内存3.529GiB；低于4GiB门槛，prepare命令EXIT1，未备份完成、未停止原S、未交窗口。原件保留于`.verification/swa-cli-v1-control/prepare-02/`；后续依赖/生成结果见本次窗口，候选构建未执行 |
| 第三次窗口准备 | UTC13:22:33/36的prepare-03两次真实阻塞采样为CPU19.0%/5.2%、可用15.719/15.746GiB，单调间隔3.005秒、BelowNormal；命令EXIT0，准确S12800及实际环境/配置核实、原库一致备份完整性/外键和prepared标记通过；随后精确停止并交付两Stage，本机Orca保持原运行 |
| 本次依赖/生成窗口 | stop-03实际EXIT0，S12800于UTC13:29:19退出15；停止后双样本CPU43.2%/16.6%、可用12.918/12.808GiB、间隔3.003秒/BelowNormal。原Worker串行执行`next-window.ps1 -Stage dependencies -EvidenceName dependency-02`和`-Stage generate -EvidenceName generate-01`，锁同步/冻结安装/真实类型生成及各自资源检查均EXIT0；pnpm原命令内建镜像超时重试及peer警告保留。仅锁/生成类型提交f08，实际原件在Worker自有忽略目录。没有构建、功能测试、安装或模型调用 |
| 本次同源恢复 | restore-03实际EXIT0，启动前双样本CPU18.7%/6.8%、可用10.369/10.485GiB、间隔3.002秒/BelowNormal；原库integrity为ok、外键为空、stopped_interval_comparison为equal，恢复使用同一原库。实际S43068及原Orca核查通过。控制脚本两项实际进程身份更新SHA256为`8e06639aa6c0bf635b037fb82a8b745540ed0dd3a754b15e8220d098652b606d`，已获准确报告ebd7880d独立接受，主控完整读取并实际回复hook；没有据此授予产品功能通过 |
| prepare-04 与首次构建 | prepare-04实际EXIT0：UTC14:09:55/58 CPU16.4%/49.2%、可用10.706/10.627GiB、间隔3.004秒/BelowNormal；准确环境/配置及原库一致备份通过。stop-04 EXIT0，S43068于UTC14:10:08退出15，停止后双样本及备份/window-ready通过。干净c0仅执行一次`next-window.ps1 -Stage build -EvidenceName build-01`；资源EXIT0，构建EXIT1/ENOENT。mkdir候选目录时缺dist父目录，未执行部署/Node下载/native/TS/Go编译，无VERSION；Node48860实际退出1、同步版本命令已返回及两次定向进程核查完成后交回窗口。原失败与MODULE_TYPELESS警告保留，未自动重试 |
| restore-04 原服务恢复 | restore-04 EXIT0，UTC14:14:43/46 CPU4.8%/9.8%、可用10.709/10.650GiB、间隔3.002秒/BelowNormal；实际同源S45948和原库/环境/配置/health/Web及本机Orca核查通过。控制脚本两身份字段SHA256为`6d7bed3576ade7b9522738ba741a55eade309f9c8b9de93a869b3150562d6870`，独立97a04f01已接受，主控完整读报告并实际回复；Reviewer创建时间显示精度检查两次失败及实际epoch数值通过原件保留，没有修改控制脚本/原件 |
| prepare-05 与第二次构建 | prepare-05 EXIT0：UTC14:26:20/23 CPU14.8%/10.1%、可用10.887/10.931GiB、间隔3.003秒/BelowNormal，真实环境/配置/一致备份通过。stop-05 EXIT0，停止后UTC14:26:48/51 CPU17.5%/18.0%、可用10.930/10.979GiB、间隔3.004秒。仅一次`next-window.ps1 -Stage build -EvidenceName build-02`交原Worker，准确897531干净、build-02及candidate01不存在已核，tracked/Git冻结；原build-01及部分输出保留，没有重试或删除候选 |
| 第二次构建实际结果 | build-02资源EXIT0，UTC14:29:15/18 CPU32.9%/5.0%、可用11693080576/11724275712字节、间隔2.501212秒。受控目录与PNPM deploy实际通过，323项依赖复制及慢镜像/原MODULE_TYPELESS警告保留；首个固定Node归档下载在原10分钟AbortSignal处TimeoutError，命令实际EXIT1。无归档、headers、native/TS/Go编译或VERSION；Node18536/9272及后代两次新鲜CIM为空，实际exec82066退出后交回。candidate01的runtime与空node完整保留，不能安装或作为可用候选 |
| restore-05 原服务恢复 | restore-05 EXIT0，UTC14:49:51/54 CPU15.3%/11.4%、可用10.364/10.406GiB、间隔3.002秒/BelowNormal。原库integrity ok/fk空/equal，同一原S18944及实际环境/配置/health/Web、原Orca公开status核查通过。控制脚本两身份字段SHA256为`03c64ef6922af3e4ce00763159377c26a03d8d065eb36e0b32e20b65ba577ceb`，独立a5ff2245已接受，主控完整读取并实际回复；下次仍须新鲜身份/环境/备份与资源准入。当前只有静态返修及只读调查，无新重操作窗口 |
| 限定REA窗口及restore-06 | prepare-06/stop-06均EXIT0，准确原S18944退出15，实际资源门限和一致备份通过。当前交付物inventory及限定REA分析均EXIT0；doctor EXIT1及首次摘要处理EXIT1保留，成熟stream-json修正后的摘要提取EXIT0，无重复应用分析。restore-06 EXIT0，CPU6.2%/5.7%、可用11.967/11.985GiB、间隔3.002秒/BelowNormal，原库/环境/配置/health/Web及原Orca保持。控制脚本仅两身份字段更新为实际57400/epoch1792510400.7486773，SHA256为1dc4cb5e5d35555a474792540535fcb081021cfe562b77427c07f870413290ab，待独立准确复核后才允许下次prepare |
| 注册链REA及restore-08 | prepare/stop-08均EXIT0，原S21300明确退出15，一致备份和资源通过。第二限定REA分析及其成熟流式摘要EXIT0，目标6a9/Evidence ev_4e...62b7f9，10JS解析失败0及覆盖限制保留；无目标程序或模型执行。默认Node24.16 fetch对固定Node24.21官方归档单次30秒HEAD200/841.8795ms/EXIT0，无body、重试或代理配置改变，不证明完整下载。restore-08资源CPU6.0%/10.1%、可用11.679/11.662GiB、单调3.001391秒/BelowNormal，同一原库及原S41264恢复通过；准确092b两常量获5b118326独立接受 |
| 后继只读资源观察 | UTC11:12:58的系统只读查询显示可用2.49GiB；UTC11:15:17的进程查询显示StartMenuExperienceHost/PID15952工作集11.62GiB。这两项为单次观察，未代替双样本准入，也未再次执行prepare或操作该非所属进程；原服务及本机Orca保持运行 |

完整默认浏览器、真实原生/S3、带 Worker 停止退出、未知用量对账和释放、两 Agent 闭环、成果采用、OpenViking 真实远端正向均未通过完整验收。正式 Release 未创建。原生控制器工具关闭、真实事件逐项定位、预算与权限证据门禁保持。

## 科研与正式实验

| 范围 | 已有结果及限制 |
| --- | --- |
| 科研预印本 | 独立分支 `songconmaisaix31-design/research-preprint-20261019@fcb1e0a70541e15de1f52507a43edadb9801e368`；方法稿已有接受范围，完整 TeX 安装/构建/验证、新引擎产物及独立重建未完成；正式实验结果、作者/机构/许可未确认，原 [PR #3](https://github.com/songconmaisaix31-design/swarm-anything/pull/3) 的证据不足范围保持 |
| 研究与产品边界 | [研究反馈](docs/research/research-product-decisions.md)与[科研 Skill](.agents/skills/astrocyte-research/SKILL.md)已保留；研究运行时、正式实验代码和论文原件仍在原位置，不作为产品执行权威 |
| 正式 V4 | 上次接管核查中 `C:/Users/DW/AppData/Local/astrocyte-validation/` 的原证据根、外部权威锁和正式 SQLite 不存在，无法核实锁/day0/路由/授权；本轮没有重新核查或补采。实际人评与终局未完成，按[日运行任务](tasks/M6-V4-daily-operation.md)和[实验入口](docs/experiment/README.md)接续 |

完整历史状态见[20261020归档](docs/archive/20261020/README.md)，本轮状态入口迁移的产品原文见[M0归档](docs/archive/swa-m0-20261020/README.md)。历史任务中的旧进程、派发和额度按原核查时间阅读。
