// Package agentcli connects installed Agent CLIs without accessing private state.
package agentcli

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sync"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

var VersionPattern = regexp.MustCompile(`\bv?([0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?)\b`)

// Inventory retains only public readiness observations. Lookups are PATH-only;
// missing entries do not imply a tool is absent elsewhere on the machine.
type Inventory struct {
	mu      sync.RWMutex
	refresh sync.Mutex
	items   []domain.LocalAgent
	entries []Entry
	lookup  func(string) (string, error)
	probe   func(context.Context, string, string) (string, error)
}

// NewInventory does not launch a CLI. RefreshCLI is an explicit startup probe.
func NewInventory(entries []Entry) *Inventory {
	return NewInventoryWith(entries, Resolve, Probe)
}

func NewInventoryWith(entries []Entry, lookup func(string) (string, error), probe func(context.Context, string, string) (string, error)) *Inventory {
	i := &Inventory{entries: entries, lookup: lookup, probe: probe}
	i.items = i.discover()
	return i
}

func (i *Inventory) discover() []domain.LocalAgent {
	items := make([]domain.LocalAgent, 0, len(i.entries))
	now := time.Now().UTC()
	for _, def := range i.entries {
		item := domain.LocalAgent{
			ID: def.ID, DisplayName: def.DisplayName,
			Installed:    domain.Observation{Status: "unavailable", Reason: "not_found_on_path", CheckedAt: &now},
			Configured:   domain.Observation{Status: "unknown", Reason: "private_configuration_not_inspected"},
			Startable:    domain.Observation{Status: "unknown", Reason: "native_start_not_authorized_or_tested"},
			Capabilities: domain.UnknownNativeCapabilities(),
		}
		if filepath.IsAbs(def.Command) {
			item.Installed.Reason = "registered_cli_not_found"
		}
		if _, err := i.lookup(def.Command); err == nil {
			item.Installed.Status, item.Installed.Reason = "available", "cli_entry_found_on_path"
			if filepath.IsAbs(def.Command) {
				item.Installed.Reason = "registered_cli_entry_found"
			}
		} else if !errors.Is(err, exec.ErrNotFound) && !errors.Is(err, os.ErrNotExist) {
			item.Installed.Status, item.Installed.Reason = "unknown", "cli_lookup_failed"
		}
		items = append(items, item)
	}
	return items
}

// RefreshCLI runs only version/help, once per CLI per refresh. It never runs
// doctor, login, sessions, exports, app-server, model commands or config readers.
// Failures remain observations; startup must not label them model-ready.
func (i *Inventory) RefreshCLI(ctx context.Context) error {
	i.refresh.Lock()
	defer i.refresh.Unlock()
	items := i.discover()
	for n := range items {
		if items[n].Installed.Status == "available" {
			items[n].Installed.Reason = "cli_entry_found_probe_not_run"
		}
	}
	// 先取得全部已安装 CLI 的版本，再补齐 help：同一预算下版本覆盖更完整。
	for n, def := range i.entries {
		if ctx.Err() != nil {
			break
		}
		path, err := i.lookup(def.Command)
		if err != nil {
			continue
		}
		items[n].Installed.Reason = "cli_entry_found_probe_incomplete"
		probeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		output, err := i.probe(probeCtx, path, "--version")
		cancel()
		if err != nil {
			items[n].Installed.Reason = "cli_entry_found_probe_failed"
			continue
		}
		if match := VersionPattern.FindStringSubmatch(output); len(match) > 1 {
			version := match[1]
			items[n].Version = &version
		} else {
			items[n].Installed.Reason = "cli_entry_found_version_unrecognized"
		}
		checked := time.Now().UTC()
		items[n].Installed.CheckedAt = &checked
	}
	for n, def := range i.entries {
		if ctx.Err() != nil {
			break
		}
		if items[n].Version == nil {
			continue
		}
		path, err := i.lookup(def.Command)
		if err != nil {
			continue
		}
		probeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		_, err = i.probe(probeCtx, path, "--help")
		cancel()
		if err != nil {
			items[n].Installed.Reason = "cli_entry_found_probe_failed"
			continue
		}
		items[n].Installed.Reason = "cli_entry_found_version_help_passed"
		checked := time.Now().UTC()
		items[n].Installed.CheckedAt = &checked
	}
	i.mu.Lock()
	i.items = items
	i.mu.Unlock()
	return ctx.Err()
}

// Snapshot never executes a command or reads a project/session. Return copies
// so transport callers cannot write capability or readiness facts into cache.
func (i *Inventory) Snapshot(ctx context.Context) ([]domain.LocalAgent, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	i.mu.RLock()
	defer i.mu.RUnlock()
	result := make([]domain.LocalAgent, len(i.items))
	for n, item := range i.items {
		result[n] = item
		if item.Version != nil {
			v := *item.Version
			result[n].Version = &v
		}
		result[n].Installed = copyObservation(item.Installed)
		result[n].Configured = copyObservation(item.Configured)
		result[n].Startable = copyObservation(item.Startable)
		result[n].Capabilities = make(map[string]domain.CapabilityObservation, len(item.Capabilities))
		for key, value := range item.Capabilities {
			if value.CheckedAt != nil {
				t := *value.CheckedAt
				value.CheckedAt = &t
			}
			result[n].Capabilities[key] = value
		}
	}
	return result, nil
}

func copyObservation(v domain.Observation) domain.Observation {
	if v.CheckedAt != nil {
		t := *v.CheckedAt
		v.CheckedAt = &t
	}
	return v
}

func validateProbe(path, flag string) error {
	if flag != "--version" && flag != "--help" {
		return errors.New("only nonsecret version/help probes allowed")
	}
	if !filepath.IsAbs(path) || unsafePath(path) {
		return errors.New("unsafe CLI probe path")
	}
	return nil
}

func Probe(ctx context.Context, path, flag string) (string, error) {
	if err := validateProbe(path, flag); err != nil {
		return "", err
	}
	cmd, err := ownedCommand(ctx, path, []string{flag})
	if err != nil {
		return "", err
	}
	output := &BoundedOutput{}
	cmd.Stdout, cmd.Stderr = output, output
	cleanup, err := startOwned(cmd)
	if err != nil {
		return "", err
	}
	defer cleanup()
	err = cmd.Wait()
	return string(output.Bytes), err
}

// Retain a bounded prefix; drain the rest so the child cannot block on output.
type BoundedOutput struct{ Bytes []byte }

func (b *BoundedOutput) Write(p []byte) (int, error) {
	n := len(p)
	if remaining := 64*1024 - len(b.Bytes); remaining > 0 {
		if len(p) > remaining {
			p = p[:remaining]
		}
		b.Bytes = append(b.Bytes, p...)
	}
	return n, nil
}
