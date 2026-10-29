// Package agents adapts installed native CLIs without accessing private state.
package agents

import (
	"context"
	"errors"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

var versionPattern = regexp.MustCompile(`\bv?([0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-zA-Z0-9.-]+)?)\b`)

type cliDefinition struct{ id, name, command string }

var definitions = []cliDefinition{
	{"codex", "Codex", "codex"}, {"claude", "Claude Code", "claude"},
	{"opencode", "OpenCode", "opencode"}, {"pi", "Pi", "pi"},
	{"grok", "Grok", "grok"}, {"kimi", "Kimi Code", "kimi"},
	{"qwen", "Qwen Code", "qwen"}, {"cursor", "Cursor", "cursor"},
	{"gemini", "Gemini CLI", "gemini"}, {"cursor-agent", "Cursor Agent", "cursor-agent"},
}

// Inventory retains only public readiness observations. Lookups are PATH-only;
// missing entries do not imply a tool is absent elsewhere on the machine.
type Inventory struct {
	mu      sync.RWMutex
	refresh sync.Mutex
	items   []domain.LocalAgent
	lookup  func(string) (string, error)
	probe   func(context.Context, string, string) (string, error)
}

// NewInventory does not launch a CLI. RefreshCLI is an explicit startup probe.
func NewInventory() *Inventory {
	return newInventory(exec.LookPath, runCLIProbe)
}

func newInventory(lookup func(string) (string, error), probe func(context.Context, string, string) (string, error)) *Inventory {
	i := &Inventory{lookup: lookup, probe: probe}
	i.items = i.discover()
	return i
}

func (i *Inventory) discover() []domain.LocalAgent {
	items := make([]domain.LocalAgent, 0, len(definitions))
	now := time.Now().UTC()
	for _, def := range definitions {
		item := domain.LocalAgent{
			ID: def.id, DisplayName: def.name,
			Installed:    domain.Observation{Status: "unavailable", Reason: "not_found_on_path", CheckedAt: &now},
			Configured:   domain.Observation{Status: "unknown", Reason: "private_configuration_not_inspected"},
			Startable:    domain.Observation{Status: "unknown", Reason: "native_start_not_authorized_or_tested"},
			Capabilities: domain.UnknownNativeCapabilities(),
		}
		if _, err := i.lookup(def.command); err == nil {
			item.Installed.Status, item.Installed.Reason = "available", "cli_entry_found_on_path"
		} else if !errors.Is(err, exec.ErrNotFound) {
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
	for n, def := range definitions {
		if ctx.Err() != nil {
			break
		}
		path, err := i.lookup(def.command)
		if err != nil {
			continue
		}
		items[n].Installed.Reason = "cli_entry_found_probe_incomplete"
		passed := true
		for _, flag := range []string{"--version", "--help"} {
			if ctx.Err() != nil {
				passed = false
				break
			}
			probeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			output, err := i.probe(probeCtx, path, flag)
			cancel()
			if err != nil {
				passed = false
				items[n].Installed.Reason = "cli_entry_found_probe_failed"
				continue
			}
			if flag == "--version" {
				if match := versionPattern.FindStringSubmatch(output); len(match) > 1 {
					version := match[1]
					items[n].Version = &version
				} else {
					passed = false
					items[n].Installed.Reason = "cli_entry_found_version_unrecognized"
				}
			}
		}
		if passed {
			items[n].Installed.Reason = "cli_entry_found_version_help_passed"
		}
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
	if path == "" || strings.ContainsAny(path, "\x00\r\n\"%&|^<>!") {
		return errors.New("unsafe CLI probe path")
	}
	return nil
}

// Retain a bounded prefix; drain the rest so the child cannot block on output.
type boundedOutput struct{ bytes []byte }

func (b *boundedOutput) Write(p []byte) (int, error) {
	n := len(p)
	if remaining := 64*1024 - len(b.bytes); remaining > 0 {
		if len(p) > remaining {
			p = p[:remaining]
		}
		b.bytes = append(b.bytes, p...)
	}
	return n, nil
}
