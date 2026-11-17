# 免费额度 Agent 本机验收

本脚本使用你指定的现有 `swarm` / `swa` 安装。以 JSON 记录每一步的 `PASS`、`BLOCKED` 或 `FAIL`，不安装客户端、不登录、不读取账户文件、不签到。未检验的步骤不计为通过。

## 无模型验证

```sh
node tests/swa-free-agents/live.mjs --swarm /absolute/path/to/swarm \
  --project /absolute/path/to/your/test-directory
```

默认探测 Qoder 国际版、Qoder 中国版、TRAE CN、CodeBuddy 的 ACP v1 握手，以及 Tabbit 官方诊断；WorkBuddy 桌面若没有额外配置会显示前置不足。Windows 请选择对应的 `swarm.exe`，项目目录、报告路径改为 Windows 绝对路径。

按需添加以下参数。每步分别记录，不从握手推断执行能力：

- `--agent qoder --scratch ABS --reload`：在 **Git 仓库外**的现有父目录下创建一个空白 ACP 会话，尝试用新进程加载该会话；不发送提示词。若客户端留有文件，原目录保留。用户账户的客户端可能保存这条测试会话。
- `--agent tabbit --tabbit-fixture`：通过已运行的 Tabbit 打开官方无账号测试页，查看同一请求回执，最后只清理本测试所属资源。先按官方方式打开你要测试的 Tabbit 实例。
- `--agent workbuddy --workbuddy-status`：使用当前进程中已设置的 `SWA_WORKBUDDY_ACCESS_TOKEN` 请求官方桌面在线状态。只用于这一步，使用已获授权的 `user.localassistant.readable` OAuth 访问令牌，不发送桌面消息。
- `--magpie-port PORT`：读取你已启动的本机 Magpie 缓存，只记录是否观察到缓存窗和窗数；不查询供应商、不判定某次运行免费。
- `--report-dir ABS_NEW`：保存 `report.json`，目录必须不存在。默认仅写标准输出。

退出码：0 表示所选验证均通过；1 表示验证失败；2 表示参数无效；3 表示某一步前置不足、缺少证据或原请求效果未知。只想验证某一个已安装客户端时，务必指定 `--agent`。

## 登录后验证官方 CLI 的真实单轮

从官方客户端自行登录。首批测试锁定 Qoder 国际版或中国版 `1.1.90`、CodeBuddy Code `2.184.0`；这些版本的受限启动参数已核实可以解析。选择一个，并指定仓库外已有的空白测试父目录。这一步会请求模型一次，可能消耗额度；默认测试和 CI 不会运行它。

```sh
SWA_LIVE_ALLOW_MODEL=1 SWA_LIVE_AGENT=qoder SWA_LIVE_SCRATCH=/absolute/existing/scratch \
  go test -tags live_acp ./internal/adapters/agentcli -run '^TestOfficialACPModelLive$' -count=1 -v
```

Windows PowerShell 中先以 `$env:SWA_LIVE_ALLOW_MODEL = '1'`、`$env:SWA_LIVE_AGENT = 'qoder'`、`$env:SWA_LIVE_SCRATCH = 'C:\path\to\existing-scratch'` 设置三个进程环境变量，再执行同一条 Go 命令。测试之后可从该终端移除变量。

它验证一个已登录的官方进程在本次创建的会话中回复固定无敏感文本，核对 `end_turn` 以及会话身份，并拒绝发现工具调用或权限请求。超时及证据不足时停止，不重发，也不把这项结果算作 SWA 正式 Run、同会话续跑或免费额度验收。

## 授权后的单次正式执行

1. 在独立目录检出公开的 [astrocyte-s3-public-stats](https://github.com/songconmaisaix31-design/astrocyte-s3-public-stats) 的固定提交 `da3bdddb085808863090a05f60cc1c64415039cf`。须保留官方 HTTPS origin（末尾 `.git`）和四份原始文件；检出时禁用自动换行。
2. 在当前 SWA 服务中登记这一个公开项目，按既有流程批准目录、`.swa-free-agent-tests` 子目录、目标 Agent 与启动范围。启动本机正式候选，选定这个 Agent 已核实的确切模型，让仓库里无关文件与凭据远离项目目录。不要将令牌贴到命令、对话或报告里。
3. 让当前终端已有 `SWA_PROJECT_TOKEN`，并选择一个 Agent。在确认该模型可能消耗额度后，运行：

```sh
node tests/swa-free-agents/live.mjs --swarm /actual/install/swarm \
  --project /absolute/path/to/public-fixture --agent qoder --allow-model \
  --swa /actual/install/swa --project-id REGISTERED_PROJECT_ID \
  --endpoint http://127.0.0.1:8787 --model ACTUAL_CONFIGURED_MODEL \
  --public-fixture /absolute/path/to/public-fixture --report-dir /absolute/new/report
```

如果当前运行时还没有批准该 Agent 的正式启动合同，记录为 `BLOCKED`，不调用模型。脚本要求服务和 CLI 是同一源码提交，不创建授权。发送前写入 `request.json`，只发一个正式 Run，禁用问答、委派和开发工具。后续只在原 Run 上重新读取回执，不以新 UUID 重试。最终确认相同 Run / Task / Dispatch、运行时的接收会话和结果摘要。接收会话 ID 是 SWA 运行记录；供应商原会话及续跑需另取原始证据。报告不推定免费额度或产品级审批。
