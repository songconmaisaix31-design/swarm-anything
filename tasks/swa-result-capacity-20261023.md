# 多 Worker 完整成果容量

实现与计划负责人 Root；独立审核 acceptance_audit。基线 aba208d2e57a5921ffd6c10ea73d48822700d723，完整任务与验收范围保持原 N4/N6 授权。

本轮已保存的四份原 trace 合计 14352694 字节，大于旧完整结果 12MiB；加入 trace/native 的 JSON 字符串和原 journal 行后，已知组成合计 34730434 字节，尚不含 snapshot、summary 和 envelope。原执行尚未运行到容量门，不能将此推导写成当时实际错误。两份只读测量原件在 `.verification/n4-result-capacity-aba208d2-20261023/`。实际 Go 编码的 opaque trace/native 数据为 16521002 字节，默认 HTML 转义增加 5255 字节；未模拟完整 Run 导出，未调用模型或读取 auth，原件首末一致。

采用单源 12MiB、完整结果 JSON 96MiB 的独立预算。每个 journal 使用实际 UTF-8 字节计量，保持 12MiB 和 100000 行；原 task/root inventory 自身仍为 12MiB。完整 source、原生帧、journal、snapshot、正文、身份和最终同步验证均保留。结果总界或单源界超限时完整拒绝，不能返回裁剪结果。

仅 task.result/run.export 的实际响应界为 128MiB。Go App 的动作选择函数由 Runtime adapter 与两个 CLI 入口复用；adapter 只在 execute 的 invocation action 上选择大界，scope/selection/普通查询不扩大。验收 driver 同时覆盖直接 export、task result 及 run/wait --export。其余动作仍为 16MiB，输入、helper、远程传输和 Node 1024MiB heap 配置保持。

96MiB 结果与 128MiB wire 响应是两个独立硬界。Go 默认 HTML 转义及真实 run_view/envelope 会增加字节数，不能承诺所有界内结果均满足响应界。当前测量只说明现存材料的大小，不证明完整导出、N6 第二轮或整体 RSS 峰值。

源码和适用局部检查已获独立限定接受。`go test ./cmd/swa ./internal/adapters/orca ./internal/workspace/app` 三包通过；实际缓冲区验证普通响应拒绝20MiB且不部分写入，完整响应接受20MiB、精确128MiB边界及再加1字节拒绝。`node scripts/check-architecture.mjs --swa` 检查239包实际依赖图退出0。

统一 `pnpm typecheck:swa` 首次退出2，唯一TS2322为活动观察布尔别名没有收窄record.provider；沿原谓词取得明确traceAgent后，strict-r2退出0、无诊断。原失败、局部修正及两个日志均保留于本证据目录；没有重复Go或已通过的两组规则。最终task-result SHA `157a7713fa9524849a636e52f3229f21b2a3f59f471558cb5da0789672b1a28a`。真实新安装 N4/N6 完整导出及 CLI/GUI 一致性仍待验证，局部接受不代表业务验收通过。
