# 历史脚本与当前入口

当前 SWA 的开发、检查、构建和启动分别使用根 `package.json` 中的 `dev`、`check`、`build`、`start`。原生发行及真实 Worker 验收使用其中的 `build:swa`、`check:swa`、`test:swa-runtime` 和 [CLI 使用说明](../runtime/swa-orca/USAGE.md)。当前有效结果见 [STATUS](../STATUS.md)。

以下文件保留历史来源，未接入当前 SWA 的默认命令。它们依赖原混合服务、独立产品工具或旧数据合同；在当前工作树直接执行不能视为 SWA 验收。

| 文件 | 原用途及当前归属 |
| --- | --- |
| `check-local-agents.mjs` | 原混合服务的 CLI 发现、原生会话与 Attention 空库边界检查。当前 SWA 的能力和项目权限由默认检查及原生发行验收覆盖。 |
| `check-s1-project-api.mjs` | 原资料、项目、引用和授权的联合 HTTP 验证。独立资料流程由 Attention Mirror 管理，跨产品联合流程需要另行配置。 |
| `summarize.mjs`、`verify-import-inputs.mjs`、`install-media.ps1` | 原资料提取和媒体工具安装；当前实现与依赖在 Attention Mirror 仓库。SWA 默认依赖中没有 summarize。 |
| `paper-snapshot-capture.mjs` | 原公开论文浏览器提取与扩展采集流程；来源随原混合版本保留，当前不作为 SWA 浏览器验收入口。 |
| `workbench/*` | 原混合工作台的安装、刷新、监控、快照和 HTTP 检查；依赖原运行目录与合同，不操作当前 SWA 数据。 |

需要复现这些历史流程时，在新的独占目录恢复完整提交 `644bbe8701ae1b1c30b54f18621c28e03dbf6082`，并按该版本任务文件安装准确依赖、提供真实来源和授权。完整归档位置、校验值和数据隔离要求见 [旧组合来源与验证](../docs/LEGACY.md)。不要只拷贝单个脚本到当前目录后运行。

Astrocyte 的当前认知、MCP 与 Sleep 入口位于 `/workspace/astrocyte`；Attention Mirror 的当前资料、导入和处理器入口位于 `/workspace/attention-mirror`。分别按各自 README 与 package 命令运行；尚无远端仓库地址，也不把旧脚本自动转换为跨产品集成。

`experiment/*`、`validation/*`、`evidence/*` 与原研究文档、数据继续保留。其运行条件、公开来源和模型授权由对应实验计划决定；本轮产品清理没有重跑正式科研实验，默认 SWA 检查通过不能充当其结果。涉及原混合模块的研究入口同样须从上述完整保存点复现。
