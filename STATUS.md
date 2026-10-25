# 当前状态

更新：2026-10-25。当前目标是让用户提交任务、观察协作、取得成果，并能处理实际失败。[本轮功能适配](tasks/swa-multi-agent-adaptation-20261025.md)基于 `b351b9ea` 的[交付导出修改](tasks/swa-delivery-focus-20261025.md)；均在草稿分支，未合并 main 或发布。

| 用户能力 | 已知状态 | 尚需完成 |
| --- | --- | --- |
| 同一项目组合多个 CLI | 增加显式许可列表与默认 CLI；设置、启动、追加输入和界面选择已接通，SQLite 与规则检查通过 | 四 CLI 混合任务的真实模型验收 |
| 提交、观察同一 Run，查看任务、问题与交接 | CLI、GUI 和后端入口已实现；刷新保存原连接，认证前未提交失败可重新操作，相关回归通过 | 当前版本的浏览器完整流程验证 |
| 取得已有任务结果 | 普通快照导出与 `--audit` 已验证；补齐 Claude 最终文本、父任务继续和结算回滚后的继续处理 | 本版本真实原生链路验证 |
| Windows 安装与无模型运行 | `d0c7dfee` 的 combined 构建、独立安装、ControllerInputCheck 通过；[CI 运行](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/40084306476) | 新变更的安装验证；真实模型、N4/N6 和 GUI 未由此验证 |
| Linux 四 Worker 真实协作 | 最新 Pi N4 `run_802c1fd00495` 为失败；四路实际输出有重叠，活动停止返回 `stop_unknown` | 验证 `5207f439` 停止守卫修复是否解决真实问题；完整树退出仍未知 |
| 六 Worker、父任务继续、完整问答流程 | 尚未完成真实端到端验收 | 先完成 N4 的实际停止与交付，再推进这些流程 |
| Astrocyte / Attention Mirror 独立产品 | 历史拆分记录确认已有独立本地入口 | 具体来源与未完成项见[拆分任务](tasks/swa-product-separation-20261023.md) |

下一步按用户可观察结果安排：

1. 在固定工具链可运行的环境完成安装，并定位本容器 `TestLinuxServiceRealProcessTree` 的归属核验失败；保留现有进程安全检查。
2. 在模型配置齐备的环境运行当前版本：同一项目选择多个已许可 CLI、提交真实任务、取得结果、执行停止、确认最终状态。
3. N4 成功后继续 N6、父任务恢复与 GUI 完整流程；每次失败先修具体故障，再决定需要重跑的范围。

本轮默认 CLI/server/Web 构建、实际服务 HTTP 启动与关闭、runtime 类型、权限/结算/界面定向回归和契约检查通过。完整 Go 命令因原有进程归属测试失败而未通过；全部命令与限制见本轮任务。固定 Node 24.16.0 在当前环境崩溃，实际开发验证使用 Node 24.22.1，未更改固定版本。

当前工作环境未提供真实模型凭据或旧 `.verification` 原件。旧环境的剩余磁盘、安装绝对路径和一次性清理决定不作为本环境的资源限制。Windows 历史模型验收还缺受控 Secret 与交互环境；本轮未改变这一状态。

完整历史状态、原提交、安装包摘要、CI 标识和证据路径保存在[本轮基线的 STATUS](https://github.com/songconmaisaix31-design/swarm-anything/blob/378f8d75f590df7bdd4bc931f971423e43c2c4c1/STATUS.md)。历史 Pi N4 失败与完整树 UNKNOWN 保持原结论。该链接保存文档记录，不代表旧 ignored 原件已进入 Git。
