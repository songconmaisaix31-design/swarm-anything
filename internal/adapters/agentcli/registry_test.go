package agentcli

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"testing"
)

func builtinEntry(t *testing.T, id string) Entry {
	t.Helper()
	for _, entry := range builtinEntries() {
		if entry.ID == id {
			return entry
		}
	}
	t.Fatalf("missing builtin Agent %q", id)
	return Entry{}
}

func TestResolveEntryKeepsQoderRegionsSeparate(t *testing.T) {
	t.Run("uses same region alias after missing primary", func(t *testing.T) {
		for _, tc := range []struct{ id, primary, alias string }{
			{"qoder", "qodercli", "qoder"},
			{"qoder-cn", "qoderclicn", "qodercn"},
		} {
			var calls []string
			expected := filepath.Join(t.TempDir(), tc.alias)
			result, err := resolveEntry(builtinEntry(t, tc.id), func(command string) (string, error) {
				calls = append(calls, command)
				if command == tc.alias {
					return expected, nil
				}
				return "", exec.ErrNotFound
			})
			if err != nil || result != expected || !slices.Equal(calls, []string{tc.primary, tc.alias}) {
				t.Fatalf("%s: unexpected same-region CLI lookup %q %v %v", tc.id, result, err, calls)
			}
		}
	})
	t.Run("does not hide an untrusted primary candidate", func(t *testing.T) {
		if _, err := resolveEntry(builtinEntry(t, "qoder"), func(command string) (string, error) {
			if command != "qodercli" {
				t.Fatalf("also resolved %q after finding a relative launcher", command)
			}
			return "", exec.ErrDot
		}); !errors.Is(err, exec.ErrDot) {
			t.Fatalf("relative launcher was not rejected: %v", err)
		}
	})
}

func TestTabbitDefaultPathAndWorkBuddyStayObservationOnly(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("LOCALAPPDATA", home)
	fallback := filepath.Join(home, ".local", "bin", "tabbit-cli")
	if runtime.GOOS == "windows" {
		fallback = filepath.Join(home, "Tabbit", "LocalAgent", "bin", "tabbit-cli.exe")
	}
	tabbit := builtinEntry(t, "tabbit")
	workbuddy := builtinEntry(t, "workbuddy")
	var calls []string
	inventory := NewInventoryWith([]Entry{tabbit, workbuddy}, func(command string) (string, error) {
		calls = append(calls, command)
		if command == fallback {
			return fallback, nil
		}
		return "", exec.ErrNotFound
	}, func(context.Context, string, string) (string, error) {
		t.Fatal("passive inventory must not execute Tabbit or WorkBuddy")
		return "", nil
	})
	if err := inventory.RefreshCLI(context.Background()); err != nil {
		t.Fatal(err)
	}
	observed, err := inventory.Snapshot(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"tabbit-cli", fallback, "tabbit-cli", fallback}; !slices.Equal(calls, want) {
		t.Fatalf("unexpected CLI lookup(s): %v", calls)
	}
	if observed[0].Version != nil || observed[0].Installed.Status != "available" || observed[0].Configured.Status != "unknown" || observed[0].Startable.Status != "unknown" {
		t.Fatalf("Tabbit path discovery overstated its readiness: %+v", observed[0])
	}
	if observed[1].Installed.Status != "unknown" || observed[1].Installed.Reason != "official_cli_unverified" || observed[1].Startable.Status != "unknown" {
		t.Fatalf("WorkBuddy lacks a verified CLI: %+v", observed[1])
	}
}

func TestRegistryRejectsUserDefinedAliases(t *testing.T) {
	file := filepath.Join(t.TempDir(), "agents.json")
	t.Setenv("SWA_AGENT_REGISTRY", file)
	if err := os.WriteFile(file, []byte(`{"schema_version":1,"agents":[{"id":"vendor-local","display_name":"Vendor","command":"/safe/bin/tool","acp_args":[],"aliases":["tool2"]}]}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadRegistry(); err == nil {
		t.Fatal("registry allowed an alias to bypass the explicit absolute executable binding")
	}
}
