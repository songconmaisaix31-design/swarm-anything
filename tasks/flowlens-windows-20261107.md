# FlowLens Windows 探测与运行

2026-11-07，用户明确要求将探针和运行移到本地 Windows，调用 Windows 注册的 Agent。WSL 继续运行官方 IrisView 模拟器。此要求接续此前 Windows 未运行的状态，验收继续使用自建公开 Git 项目，关闭模型原生工具，不使用真实用户作品或 Aliyun/百炼 Agent。

主 Agent 负责两个现有分支的代码、运行、文档和提交；两名 Explorer 只读核对构建、原生合同与路径，不进行并行开发。开发客户端为当前 Codex 桌面会话，Explorer 继承模型配置。真实路由使用 Windows npm Codex 0.164.0 / gpt-6-luna，执行使用 Windows OpenCode 2.0.31 / deepseek-v4-pro；模型调用结果在实际完成后记录。

Windows Native 构建基线为 `ee4d7e5d075b81e19ebabfb60d4ae439bd8862a3`。本机没有 MSVC/Windows SDK，采用仓库已有 Windows 原生构建入口；[CI 42357634617](https://github.com/songconmaisaix31-design/swarm-anything/actions/runs/42357634617) 完整构建、归档、安装及原生检查通过。实际 Windows ZIP 已下载核对并经官方 install-swa.ps1 安装到私有目录，随包 Node 为 24.21.0。

独立 OpenCode 来源通过本机官方 `auth import --standalone` 初始化，凭据经标准输入传入，原生 SQLite 与 legacy 投影保持一致。来源目录仅当前用户及 SYSTEM 可访问，原用户账户保持原样。服务使用独立数据、端口和只读 Orca profile；Windows 服务和电脑桥的实际发现已返回 win32，OpenCode 可选择。WSL 到 Windows 的设备 HTTP 通道已实际返回未认证 401。

## Windows Pi 发现修复

Windows Node 24.21 的 findPackageJSON 对真实 Pi CLI 返回带 `\\?\` 命名空间的路径；同一文件的 realpath 使用普通驱动器路径，原严格检查误报 native_pi_source_redirected，导致已安装的 Pi 显示未知。

仅对 Node 模块 API 返回的两个 manifest 路径使用内置 fileURLToPath/pathToFileURL 往返转换。该转换不解析文件系统链接，readNativePiFile 的全部重定向、权限和来源检查继续执行。实际 Windows 元数据验证确认：真实 CLI manifest 转换后通过，Pi AI 普通路径不变，既有 Junction 路径仍被原检查拒绝；1128 个固定官方源文件匹配。此修复尚待后继完整 Windows 包与本机实际 capabilities 验证。

Pi 默认账户为空且目录为 Junction；npm Codex 0.164.0 使用 ChatGPT 登录，Claude Code 2.1.238 使用 AUTH_TOKEN，与现有受控执行合同不符。本轮保留这些配置，分别显示安装和可调用状态，不自动给其他 Agent 新增账号。原生模型、完整 Windows 退出和最终 WSL HUD 呈现继续验证。
