# 接管说明

先读 [STATUS](STATUS.md)、[本轮任务](tasks/swa-delivery-focus-20261025.md)、[AGENTS](AGENTS.md)。当前开发分支为 `fix/swa-delivery-focus-20261025`，基于 `integration/swa-task-cards` 的 `378f8d75`；未合并 main 或发布。

本轮用户要求直接修改项目，减少只增加工程量和自我证明的机制。实施范围：

- 移除 Worker 启动时不参与准入决策的一秒 CPU 采样。
- 普通导出交付已记录任务结果，可保留部分成果与 active/unknown 状态；`--audit` 使用原完整原生来源路径。权限、会话归属和凭据过滤继续执行。
- Pi 边界测试直接使用当前源码，历史安装检查显式选择候选。
- 普通局部修复直接实施和定向验证；权限、进程终止、迁移与发布保持必要审查。

验证命令和真实限制只维护在本轮任务中；STATUS 只登记已验能力。接续先完成本轮检查与 review，然后推进真实 N4 停止与成果交付，不增加新的审批、散列清单或完成证明系统。生产进程终止实现未在本轮修改。

历史 Linux 最新通过安装为 `5c25b1ce/n46-10`；Pi N4 失败，`5207f439` 停止守卫修复尚需新安装实测。Windows `d0c7dfee` 无模型安装检查成功；真实模型、N4/N6 和 GUI 仍需各自验证。不要复用历史请求或据后继局部成功改写原失败。

之前的全部接续记录在[本轮基线的 HANDOFF](https://github.com/songconmaisaix31-design/swarm-anything/blob/378f8d75f590df7bdd4bc931f971423e43c2c4c1/HANDOFF.md)。旧环境路径、磁盘余额和一次性清理授权仅适用于原记录；需要旧原件时先确认其实际存在。
