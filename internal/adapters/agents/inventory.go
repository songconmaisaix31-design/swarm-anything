package agents

import (
	"context"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/agentcli"
)

type Inventory = agentcli.Inventory
type boundedOutput = agentcli.BoundedOutput

var versionPattern = agentcli.VersionPattern
var runCLIProbe = agentcli.Probe
var definitions = agentcli.LegacyEntries()

func NewInventory() *Inventory {
	return agentcli.NewInventory(definitions)
}

func newInventory(lookup func(string) (string, error), probe func(context.Context, string, string) (string, error)) *Inventory {
	return agentcli.NewInventoryWith(definitions, lookup, probe)
}
