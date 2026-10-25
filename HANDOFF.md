# 接管说明

先读 [STATUS](STATUS.md) 和[本轮任务](tasks/swa-usable-runtime-20261025.md)。当前分支 `fix/swa-usable-runtime-20261025`，基线 `34d5071b`；依赖[多 Agent 适配 PR #8](https://github.com/songconmaisaix31-design/swarm-anything/pull/8)与[交付导出 PR #7](https://github.com/songconmaisaix31-design/swarm-anything/pull/7)。

用户要求继续修功能问题，删除只为提升置信度而存在的内容。本轮处理 Linux 解压、proc 挂载提示、浏览器请求存储恢复，以及工作台和开发说明中的重复文字。

Linux combined 包已完成构建和独立安装，安装后的 CLI、无原生执行器模式的 Web HTTP 入口可用。接续启动完整服务，运行混合 CLI 任务，检查成果、停止、问答和父任务继续。当前容器使用外层 `/proc` 且不允许重新挂载，进程树检查需换到挂载正确的环境。模型凭据仍缺少，历史 N4 停止失败待解决。

Windows 无模型安装的历史通过版本为 `d0c7dfee`；旧接续记录见[历史 HANDOFF](https://github.com/songconmaisaix31-design/swarm-anything/blob/378f8d75f590df7bdd4bc931f971423e43c2c4c1/HANDOFF.md)。
