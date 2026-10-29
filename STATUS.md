# SWA 当前状态

本页统一维护当前版本、已验范围和实际限制。资源参数只在 [RESOURCES](docs/RESOURCES.md) 维护，授权和待答项只在 [QUESTIONS](docs/QUESTIONS.md) 维护，接管操作见 [HANDOFF](HANDOFF.md)。

2026-10-29 独立分支 `codex/swa-windows-dispatch-20261029` 从 `893fb885` 修复已有工作树参数、Structured 模型预检、私有 host 路由和受限权限模式；安装源码 `c8bc7a67ed75f7c2012bc9fa2a29abb5254d6b75` 通过 Go、strict TypeScript、完整 Windows 构建/安装、同会话恢复、活跃第二服务拒绝和确定未启动 Worker 的回收检查。同一安装双 Worker 短任务的停止、释放、3,298,102 字节完整结果、任务完成及控制端关闭全部成功。全局服务关闭仍有历史空资源判定缺陷；新增计划因 Swarm 原生版本探测超时和来源变化未取得审核，新补丁未实施。此前来源变化与 12 MiB 上限导出失败保留。最后本轮所属进程均退出、64626 无监听，原生 unknown/未释放记录保持；C 盘约剩 260 MiB。准确验证、Commit 和剩余范围见 [Windows 派发任务](tasks/windows-dispatch-20261029.md)。

## 当前主线与 M0

| 项目 | 当前事实 |
| --- | --- |
| 用户首版目标 | 抽取 Orca CLI 对应执行能力，交付用户从原有 Agent 或终端调用的可控 Swarm CLI；[首版任务](tasks/swa-cli-v1-20261020.md)记录具体范围与验收，程序实现中，尚未通过验收 |
| 首版执行与验收 | 已确认 Orca 无界面执行及控制端身份；固定抽取范围后定义 CLI 规则，完成多 Worker、失败/资源及安装包。最终使用安装后的同一候选完成一次至少两个真实 Worker 的任务，验证并发、指定停止及成果获取；产品采用独立后台，须验证不妨碍本机Orca CLI及其原配置/状态/进程 |
| 规范仓库 / 默认分支 | GitHub 仓库 ID `1410836101`，`songconmaisaix31-design/swarm-anything` / `main` |
| main 的产品与治理集成来源 | `6eb7c7f640a9cf1b05ea365b3afdf6883cd01765`；已从初始 main 普通快进并 push，完整包含产品32ab历史与接受后的M0文档；后继当前事实记录沿 main 维护 |
| 产品基线 | `songconmaisaix31-design/works-relay-integration@32ab1eec808a5848aabad40f11133735a1214e55`；原 PR #2 已普通合入 |
| M0 任务分支 | `swa-m0-20261020@6eb7c7f640a9cf1b05ea365b3afdf6883cd01765`；独立 [COMMENT review 5581860208](https://github.com/songconmaisaix31-design/swarm-anything/pull/4#pullrequestreview-5581860208) 接受，原hook已由主控读取并回复；[PR #4](https://github.com/songconmaisaix31-design/swarm-anything/pull/4) 已实际合入产品分支，同源快进 main |
| 主控内容来源 | `validation/v1-20261012@cf22f118193d5dcc3f2d2ec436bd4f06e9a22c9b`；独有决定、归档、任务、实验入口与研究文档按[整合清单](docs/integration-audit-20261020.md)纳入 |
| 已审调查记录集成 | `fac75c7f963d16c7f112e8e90ad30e36510d4738` 已独立接受并普通快进/push main；只新增准确30b来源调查、b112契约记录和34cfe独立报告共八份文档，各自接受范围保持，程序/依赖未变 |
| 后继工作 | 同一无界面Worker以Task9f/ctx0d接续，准确`d7f21242259739cfb49a4f68a19a1a8f28bcec32`已普通push；原Reviewer接受§5.5完整成果及T07/T13补充计划，并接受父提交76e9的授权pi标识、包内安装入口/说明及空闲SDK检查源码。f8及F04—F09静态接受保持；完整成果读取与其余实际验收脚本继续由原Worker实施。原S12800继续运行，无新动态窗口，构建/模型/安装包/双Worker及隔离验收均未通过 |

当前 main 工作树为 `C:/Users/DW/orca/workspaces/Astrocyte/main-20261020`；原根目录的 `validation/v1-20261012` 与正式实验材料保留。Orca 的新工作树默认基准已实际改为 `origin/main`。M0 的接受仅覆盖文档整合，首版 CLI 程序实现中，尚未通过验收。

## 已有产品验证与最近运行观察

程序和 Web 的已验源码 S 为 `ed543c12106c2dbb3e181cb9bc1647b626455179`。本次CLI依赖窗口已完成原S保全、停止和同源恢复。原件位于根忽略目录`.verification/swa-cli-v1-control/prepare-01/`、`stop-01/`及`restore-01/`，含实际环境、Q/媒体/CodeGraph配置、原库一致备份及停止区间内容相同结果；备份包含真实数据，不进入Git或安装包。M1原件保留原位置，其已验范围见[产品交付报告](docs/standards/delivery-candidate-20261020.md)及[交付任务](tasks/delivery-candidate-20261020.md)。

| 范围 | 记录的结果 |
| --- | --- |
| 当前服务与窗口 | 原S已恢复PID12800，创建UTC `2026-10-20T09:43:52.279923Z`，BelowNormal，唯一127.0.0.1:64505监听，实际完整环境/配置、health和原Web字节通过；停止区间原库iterdump相同、完整性/外键通过。依赖窗口已收回归原S运行，本机Orca公开CLI仍ready且runtime归属保持 |
| 同源产物 | 程序和 Web 同一 S；`D:/Astrocyte-agent-assets/20261015/relay/H/shared-product-ad8413/versions/ed543c12/` |
| 原库与配置 | 原运行根 `D:/Astrocyte-agent-assets/20261015/relay/H/shared-product-ad8413/` 下 `local/astrocyte-workbench/v0.2-access/app-state/state.sqlite`；当前备份完整性/外键及停止期间内容一致性通过，恢复使用该原库和原配置 |
| Windows 普通交付 | `dist/delivery-candidate-20261020/`，三个 Go 程序、Web 与启动入口；完整新便携模型包未验 |
| 已通过的限定检查 | 构建、DAG9函数、OpenViking4函数、前端53项、DAG双视口4项、页面8项、架构/依赖、264项契约示例及生成一致性 |
| 独立运行核验 | 准确 S 的49项 GET（含5项403）、真实资料/项目 ID 与原 SQLite 对应、33件 Web 字节、原业务和 Q 保全 |
| 原始失败与未执行 | 完整默认 CI：NOT_RUN；原 `pnpm check:contracts` 与 Redocly 直调：进程崩溃 FAIL；lint/vet 的实际串行偏差和退出保留在原报告 |
| 本次 M1 原入口 | 准确 `987811f417e92cd6f15961e60c279f616e3b21a8`，原依赖冻结安装与未补丁的 `pnpm check:contracts` 均 EXIT0；13项警告、264项示例及类型一致均实际完成。Node24.16.0、pnpm11.27.0、CLI2.60.0；历史崩溃未复现，未应用补丁，T02—T08未执行，完整修复因果证据不足 |
| 首版CLI依赖准备 | pnpm11.27.0的`install --lockfile-only --ignore-scripts`及`install --frozen-lockfile --ignore-scripts`均EXIT0，私有store/TEMP/TMP/cache，两次新资源门限通过。实际入口签名拒绝、peer警告及镜像超时/原命令内建重试记录保留；尚未构建或调用模型，不能计为安装包和CLI功能通过 |
| 第二次窗口准备 | 根忽略目录`prepare-02/backup-resources.json`记录UTC11:00:16、CPU7.2%、可用内存3.529GiB；低于4GiB门槛，prepare命令EXIT1，未备份完成、未停止原S、未交窗口。原件保留于`.verification/swa-cli-v1-control/prepare-02/`；依赖更新、实际类型生成和候选构建继续等待新资源准入 |
| 后继只读资源观察 | UTC11:12:58的系统只读查询显示可用2.49GiB；UTC11:15:17的进程查询显示StartMenuExperienceHost/PID15952工作集11.62GiB。这两项为单次观察，未代替双样本准入，也未再次执行prepare或操作该非所属进程；原服务及本机Orca保持运行 |

完整默认浏览器、真实原生/S3、带 Worker 停止退出、未知用量对账和释放、两 Agent 闭环、成果采用、OpenViking 真实远端正向均未通过完整验收。正式 Release 未创建。原生控制器工具关闭、真实事件逐项定位、预算与权限证据门禁保持。

## 科研与正式实验

| 范围 | 已有结果及限制 |
| --- | --- |
| 科研预印本 | 独立分支 `songconmaisaix31-design/research-preprint-20261019@fcb1e0a70541e15de1f52507a43edadb9801e368`；方法稿已有接受范围，完整 TeX 安装/构建/验证、新引擎产物及独立重建未完成；正式实验结果、作者/机构/许可未确认，原 [PR #3](https://github.com/songconmaisaix31-design/swarm-anything/pull/3) 的证据不足范围保持 |
| 研究与产品边界 | [研究反馈](docs/research/research-product-decisions.md)与[科研 Skill](.agents/skills/astrocyte-research/SKILL.md)已保留；研究运行时、正式实验代码和论文原件仍在原位置，不作为产品执行权威 |
| 正式 V4 | 上次接管核查中 `C:/Users/DW/AppData/Local/astrocyte-validation/` 的原证据根、外部权威锁和正式 SQLite 不存在，无法核实锁/day0/路由/授权；本轮没有重新核查或补采。实际人评与终局未完成，按[日运行任务](tasks/M6-V4-daily-operation.md)和[实验入口](docs/experiment/README.md)接续 |

完整历史状态见[20261020归档](docs/archive/20261020/README.md)，本轮状态入口迁移的产品原文见[M0归档](docs/archive/swa-m0-20261020/README.md)。历史任务中的旧进程、派发和额度按原核查时间阅读。
