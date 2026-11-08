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
	default:
		return fmt.Errorf("未知 agents 命令，请运行 swarm --help")
	}
}
