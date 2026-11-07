# macOS arm64 移植

任务依据：完整读取的 [MACOS-PORT-BRIEF](../MACOS-PORT-BRIEF.md)。基线为 `d9d979303b074a021a8f7e13038b3e2e45615b9f`，工作分支 `codex/macos-arm64-port`。用户授权无人值守完成实现与本机验证；按任务要求分主题本地提交，不推送。

主负责人修改 Go 平台实现、测试和说明；Node Worker 修改 runtime 与 daemon 身份消费者；打包 Worker 修改 Darwin 构建、安装及检查脚本。独立 Reviewer 只读审查进程与权限方案。使用当前 Codex 原生子代理及继承模型，无外部 Orca/模型账号调用。

跨语言契约为 `swa.darwin-process-identity.v1`：规范十进制 PID、UID、微秒启动时间，`darwin-boottime:sec:usec` 启动标识，present/absent 状态和实际 proc_pidpath。未知查询返回 6。原 service owner 字段保留，平台显式为 darwin；持久字段 `linuxStartTicks` 在此平台承载微秒字符串。

独立方案审查确认只读内核查询方向；全树释放仍有无法证明的边界。实现用 NOTE_FORK 保守保留未知，不将已观察后代退出当作全部任意 fork 后代退出。不自动接管同次系统启动中带旧 daemon 记录的数据根。

本次日志保存在 `.verification/macos-port/`。已完成依赖安装；Go build/vet、专项检查及完整安装验收结果将在运行后记录。历史固定授权工具在 macOS 明确拒绝历史执行包，避免借平台移植扩大旧项目授权。
