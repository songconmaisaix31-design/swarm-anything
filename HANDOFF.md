# 接管说明

先读 [STATUS](STATUS.md)、[本轮任务](tasks/swa-multi-agent-adaptation-20261025.md)、[AGENTS](AGENTS.md)。当前开发分支为 `feat/swa-multi-agent-projects-20261025`，基于 `fix/swa-delivery-focus-20261025` 的 `b351b9ea`。前一批修改见[草稿 PR #7](https://github.com/songconmaisaix31-design/swarm-anything/pull/7)，未合并 main 或发布。

用户要求继续实际开发功能适配。本轮已实现并经独立源码审查接受：

- 项目显式多 CLI 许可与默认选择，兼容旧单客户端设置；Run/Worker/原生操作使用同一许可规则。
- Claude 成果补齐统一文本字段；父任务继续不携带首次提交字段；写入前竞争完整回滚后允许再次观察，真正未知效果仍保留原请求。
- 认证前尚未提交的失败解除本地待定状态；已提交未知操作不重发。刷新后从浏览器保存身份只读重连原 Run。

前一批已完成普通成果导出、启动冗余采样删除和可移植 Pi 测试，见[交付任务](tasks/swa-delivery-focus-20261025.md)。验证命令和真实限制维护在各自任务中；STATUS 只登记已验能力。接续处理固定工具链及进程归属测试环境，在模型配置齐备后完成真实混合任务、N4 停止与父任务继续。生产进程终止实现未在本轮修改，不削弱归属核验来消除失败。

历史 Linux 最新通过安装为 `5c25b1ce/n46-10`；Pi N4 失败，`5207f439` 停止守卫修复尚需新安装实测。Windows `d0c7dfee` 无模型安装检查成功；真实模型、N4/N6 和 GUI 仍需各自验证。不要复用历史请求或据后继局部成功改写原失败。

之前的全部接续记录在[本轮基线的 HANDOFF](https://github.com/songconmaisaix31-design/swarm-anything/blob/378f8d75f590df7bdd4bc931f971423e43c2c4c1/HANDOFF.md)。旧环境路径、磁盘余额和一次性清理授权仅适用于原记录；需要旧原件时先确认其实际存在。
