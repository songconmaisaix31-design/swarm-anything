package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/agentcli"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

type agentListItem struct {
	domain.LocalAgent
	Adapter string `json:"adapter,omitempty"`
}

func executeAgents(args []string, stdout io.Writer) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	flags := flag.NewFlagSet("agents "+args[0], flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	asJSON := flags.Bool("json", false, "输出 JSON")
	encode := json.NewEncoder(stdout).Encode
	switch args[0] {
	case "verify":
		scratch := flags.String("scratch", "", "Git 仓库外现有测试父目录的绝对路径")
		reload := flags.Bool("reload", false, "用新进程加载本次创建的空白会话")
		if len(args) < 2 {
			return fmt.Errorf("agents verify 需要 Agent ID")
		}
		if err := flags.Parse(args[2:]); err != nil {
			return err
		}
		if flags.NArg() != 0 {
			return fmt.Errorf("agents verify 不接收多余参数")
		}
		id := args[1]
		if id == "tabbit" || id == "workbuddy" {
			if *scratch != "" || *reload {
				return fmt.Errorf("此检查不接收 --scratch 或 --reload")
			}
		} else if *scratch == "" {
			return fmt.Errorf("ACP 会话检查需要 --scratch DIR")
		}
		entries, err := agentcli.LoadRegistry()
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if entry.ID != id {
				continue
			}
			var result any
			var summary string
			switch id {
			case "tabbit":
				check, err := agentcli.VerifyTabbit(ctx, entry)
				if err != nil {
					return agentVerificationError(err)
				}
				result, summary = check, "已核验 Tabbit 公共测试页和原浏览器请求回执。"
			case "workbuddy":
				check, err := agentcli.CheckWorkBuddy(ctx, os.Getenv("SWA_WORKBUDDY_ACCESS_TOKEN"))
				if err != nil {
					return agentVerificationError(err)
				}
				result, summary = check, "WorkBuddy 桌面状态："+check.State
			default:
				check, err := agentcli.VerifyACPSession(ctx, entry, *scratch, *reload)
				if err != nil {
					return agentVerificationError(err)
				}
				result, summary = check, fmt.Sprintf("%s：空白会话 %s；重新加载 %s。", id, check.SessionNew.State, check.SessionLoad.State)
			}
			if *asJSON {
				return encode(result)
			}
			_, err = fmt.Fprintln(stdout, summary)
			return err
		}
		return fmt.Errorf("未登记 Agent %q", id)
	case "list":
		probe := flags.Bool("probe", false, "运行已登记 CLI 的版本和帮助探测")
		if err := flags.Parse(args[1:]); err != nil {
			return err
		}
		if flags.NArg() != 0 {
			return fmt.Errorf("agents list 不接收位置参数")
		}
		entries, err := agentcli.LoadRegistry()
		if err != nil {
			return err
		}
		inventory := agentcli.NewInventory(entries)
		if *probe {
			probeContext, cancel := context.WithTimeout(ctx, 10*time.Second)
			_ = inventory.RefreshCLI(probeContext)
			cancel()
		}
		observations, err := inventory.Snapshot(ctx)
		if err != nil {
			return err
		}
		items := make([]agentListItem, 0, len(observations))
		for i, observed := range observations {
			item := agentListItem{LocalAgent: observed}
			if entries[i].ACPArgs != nil {
				item.Adapter = "acp"
				item.NativeAdapterRegistered = true
			} else if entries[i].ID == "tabbit" {
				item.Adapter = "browser-cli"
			}
			items = append(items, item)
		}
		if *asJSON {
			return encode(struct {
				SchemaVersion int             `json:"schema_version"`
				Items         []agentListItem `json:"items"`
			}{SchemaVersion: 1, Items: items})
		}
		for _, item := range items {
			version := "-"
			if item.Version != nil {
				version = *item.Version
			}
			if _, err := fmt.Fprintf(stdout, "%s\t%s\t%s\t%s\t%s\n", item.ID, item.Installed.Status, version, item.Configured.Status, item.Startable.Status); err != nil {
				return err
			}
		}
		return nil
	case "connect":
		project := flags.String("project", "", "显式选择的项目绝对路径")
		if len(args) < 2 {
			return fmt.Errorf("agents connect 需要 Agent ID")
		}
		if err := flags.Parse(args[2:]); err != nil {
			return err
		}
		if flags.NArg() != 0 || *project == "" {
			return fmt.Errorf("agents connect 需要 Agent ID 和 --project DIR")
		}
		entries, err := agentcli.LoadRegistry()
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if entry.ID != args[1] {
				continue
			}
			handshake, err := agentcli.Connect(ctx, entry, *project)
			if err != nil {
				return &apierrors.ServiceError{Code: apierrors.ProviderUnavailable, Message: err.Error(), RequiredAction: "检查 CLI 安装、ACP 支持和所选项目目录"}
			}
			if *asJSON {
				return encode(handshake)
			}
			_, err = fmt.Fprintf(stdout, "%s\tACP v%d\n", handshake.AgentID, handshake.ProtocolVersion)
			return err
		}
		return fmt.Errorf("未登记 Agent %q", args[1])
	case "diagnose":
		if len(args) < 2 || args[1] != "tabbit" {
			return fmt.Errorf("agents diagnose 仅支持 tabbit")
		}
		if err := flags.Parse(args[2:]); err != nil {
			return err
		}
		if flags.NArg() != 0 {
			return fmt.Errorf("agents diagnose tabbit 不接收多余参数")
		}
		entries, err := agentcli.LoadRegistry()
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if entry.ID != "tabbit" {
				continue
			}
			if err := agentcli.DiagnoseTabbit(ctx, entry); err != nil {
				return &apierrors.ServiceError{Code: apierrors.ProviderUnavailable, Message: err.Error(), RequiredAction: "检查 Tabbit 官方本机启动器"}
			}
			if *asJSON {
				return encode(struct {
					SchemaVersion int    `json:"schema_version"`
					AgentID       string `json:"agent_id"`
					State         string `json:"state"`
				}{SchemaVersion: 1, AgentID: entry.ID, State: "diagnose_exit_ok"})
			}
			_, err = fmt.Fprintln(stdout, "Tabbit CLI 诊断成功退出。尚未验证网页任务。")
			return err
		}
		return fmt.Errorf("未登记 Tabbit")
	case "quota":
		port := flags.Int("magpie-port", 0, "已运行的本机 Magpie 端口")
		if len(args) < 2 {
			return fmt.Errorf("agents quota 需要 Agent ID")
		}
		if err := flags.Parse(args[2:]); err != nil {
			return err
		}
		if flags.NArg() != 0 || *port < 1 || *port > 65535 {
			return fmt.Errorf("agents quota 需要 --magpie-port（1–65535）")
		}
		quota, err := agentcli.ReadMagpieQuota(ctx, args[1], *port)
		if err != nil {
			return &apierrors.ServiceError{Code: apierrors.ProviderUnavailable, Message: err.Error(), RequiredAction: "检查已运行的本机 Magpie 及对应账号的缓存"}
		}
		if quota.Provider == "" {
			return fmt.Errorf("该 Agent 没有已登记的 Magpie 额度来源")
		}
		if *asJSON {
			return encode(struct {
				SchemaVersion int `json:"schema_version"`
				agentcli.MagpieQuota
			}{SchemaVersion: 1, MagpieQuota: quota})
		}
		if quota.State == "unknown" {
			_, err = fmt.Fprintln(stdout, "没有可核实的 Magpie 缓存额度。")
		} else {
			_, err = fmt.Fprintf(stdout, "已读取 %s 的 Magpie 缓存。使用 --json 查看额度、单位和观察时间。\n", quota.Provider)
		}
		return err
	default:
		return fmt.Errorf("未知 agents 命令，请运行 swarm --help")
	}
}

func agentVerificationError(err error) error {
	return &apierrors.ServiceError{Code: apierrors.ProviderUnavailable, Message: err.Error(), RequiredAction: "检查官方客户端、测试环境及所选授权"}
}
