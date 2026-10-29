package agents

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestInventoryReadsCannotLaunchOrPromoteNativeReadiness(t *testing.T) {
	calls := 0
	i := newInventory(func(name string) (string, error) {
		if name == "codex" {
			return "/nonsecret/native/codex", nil
		}
		return "", exec.ErrNotFound
	}, func(ctx context.Context, path, flag string) (string, error) {
		calls++
		if flag != "--version" && flag != "--help" {
			t.Fatalf("unexpected native action: %s", flag)
		}
		return "codex-cli 0.162.0", nil
	})
	items, err := i.Snapshot(context.Background())
	if err != nil || calls != 0 {
		t.Fatalf("snapshot launched CLI or failed: %d %v", calls, err)
	}
	if err := i.RefreshCLI(context.Background()); err != nil {
		t.Fatal(err)
	}
	items, _ = i.Snapshot(context.Background())
	if calls != 2 || items[0].Version == nil || *items[0].Version != "0.162.0" {
		t.Fatalf("wrong version probe: %+v calls=%d", items[0], calls)
	}
	for _, item := range items {
		if item.Configured.Status != "unknown" || item.Startable.Status != "unknown" {
			t.Fatalf("installation promoted to runtime readiness: %+v", item)
		}
		if len(item.Capabilities) != 8 {
			t.Fatal("missing native capabilities")
		}
		for _, capability := range item.Capabilities {
			if capability.Status != "unknown" || capability.CheckedAt != nil {
				t.Fatalf("help promoted to native success: %+v", capability)
			}
		}
	}
	data, _ := json.Marshal(items)
	if strings.Contains(string(data), "/nonsecret/native") {
		t.Fatal("public inventory leaked executable paths")
	}
	items[0].Capabilities["resume"] = items[0].Capabilities["start"]
	*items[0].Version = "forged"
	*items[0].Installed.CheckedAt = time.Time{}
	fresh, _ := i.Snapshot(context.Background())
	if *fresh[0].Version != "0.162.0" || fresh[0].Installed.CheckedAt.IsZero() {
		t.Fatal("caller mutated cached observation")
	}
}

func TestProbeFailureAndMissingPathRemainSeparate(t *testing.T) {
	i := newInventory(func(name string) (string, error) {
		if name == "codex" {
			return "/installed-but-broken", nil
		}
		return "", exec.ErrNotFound
	}, func(context.Context, string, string) (string, error) {
		return "private diagnostic must not appear in inventory", errors.New("probe failed")
	})
	if err := i.RefreshCLI(context.Background()); err != nil {
		t.Fatal(err)
	}
	items, _ := i.Snapshot(context.Background())
	if items[0].Installed.Status != "available" || items[0].Version != nil || items[0].Installed.Reason != "cli_entry_found_probe_failed" {
		t.Fatalf("wrong broken entry: %+v", items[0])
	}
	if items[1].Installed.Status != "unavailable" || items[1].Installed.Reason != "not_found_on_path" {
		t.Fatal("missing PATH entry claimed installed")
	}
	data, _ := json.Marshal(items)
	if strings.Contains(string(data), "private diagnostic") {
		t.Fatal("private error leaked")
	}
}

func TestStartupDeadlinePublishesOnlyCompletedChecks(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	calls := 0
	i := newInventory(func(name string) (string, error) { return "/native/" + name, nil }, func(context.Context, string, string) (string, error) {
		calls++
		cancel()
		return "native 1.2.3", nil
	})
	if err := i.RefreshCLI(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("lost startup cancellation: %v", err)
	}
	items, _ := i.Snapshot(context.Background())
	if calls != 1 || items[0].Version == nil || items[0].Installed.Reason != "cli_entry_found_probe_incomplete" {
		t.Fatalf("partial probe mislabeled: %+v calls=%d", items[0], calls)
	}
	for _, item := range items[1:] {
		if item.Version != nil || item.Installed.Reason != "cli_entry_found_probe_not_run" {
			t.Fatalf("unexecuted probe mislabeled: %+v", item)
		}
	}
}

func TestInventoryRecognizesVPrefixedVersion(t *testing.T) {
	i := newInventory(func(name string) (string, error) {
		if name == "opencode" {
			return "/native/opencode", nil
		}
		return "", exec.ErrNotFound
	}, func(context.Context, string, string) (string, error) {
		return "opencode v2.0.31", nil
	})
	if err := i.RefreshCLI(context.Background()); err != nil {
		t.Fatal(err)
	}
	items, _ := i.Snapshot(context.Background())
	for _, item := range items {
		if item.ID != "opencode" {
			continue
		}
		if item.Version == nil || *item.Version != "2.0.31" || item.Installed.Reason != "cli_entry_found_version_help_passed" {
			t.Fatalf("v-prefixed version was not recognized: %+v", item)
		}
		return
	}
	t.Fatal("opencode definition missing")
}

func TestMain(m *testing.M) {
	if os.Getenv("ASTROCYTE_NATIVE_PROCESS_TEST_HELPER") != "" {
		nativeProcessTestHelper()
		os.Exit(0)
	}
	if os.Getenv("ASTROCYTE_CLI_PROBE_TEST_CHILD") == "1" {
		if len(os.Args) == 2 && os.Args[1] == "--version" {
			fmt.Println("native-test 1.2.3")
			os.Exit(0)
		}
		if len(os.Args) == 2 && os.Args[1] == "--help" {
			if marker := os.Getenv("ASTROCYTE_CLI_PROBE_TEST_MARKER"); marker != "" {
				time.Sleep(600 * time.Millisecond)
				_ = os.WriteFile(marker, []byte("orphan probe"), 0600)
			}
			time.Sleep(10 * time.Second)
			os.Exit(0)
		}
		os.Exit(79)
	}
	os.Exit(m.Run())
}

func TestCLIProbeDeniesOtherActionsAndBoundsOwnedProcess(t *testing.T) {
	t.Setenv("ASTROCYTE_CLI_PROBE_TEST_CHILD", "1")
	path, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	for _, flag := range []string{"exec", "resume", "sessions", "doctor", "--version & echo leak", ""} {
		if _, err := runCLIProbe(context.Background(), path, flag); err == nil {
			t.Fatalf("allowed forbidden probe: %q", flag)
		}
	}
	for _, bad := range []string{"native&other.exe", "native%SECRET%.exe", "native\".exe", "native\n.exe"} {
		if _, err := runCLIProbe(context.Background(), bad, "--version"); err == nil {
			t.Fatalf("allowed shell path: %q", bad)
		}
	}
	// This success probe starts the large Go test executable, not an installed
	// CLI. Windows cold image startup measured 7.8s before runtime initialization
	// (the warm helper takes <0.3s). Give that synthetic startup a bounded budget;
	// production's 5s probes and the 150ms cancellation/3s cleanup below stay fixed.
	startupBudget := 3 * time.Second
	if runtime.GOOS == "windows" {
		startupBudget = 10 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), startupBudget)
	defer cancel()
	output, err := runCLIProbe(ctx, path, "--version")
	if err != nil || !strings.Contains(output, "1.2.3") {
		t.Fatalf("allowed version failed: %q %v", output, err)
	}
	ctx, cancel = context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()
	start := time.Now()
	if _, err := runCLIProbe(ctx, path, "--help"); err == nil {
		t.Fatal("deadline did not terminate owned probe")
	}
	if time.Since(start) > 3*time.Second {
		t.Fatal("probe exceeded deadline cleanup bound")
	}
}

func TestInventoryLiveCLI(t *testing.T) {
	if os.Getenv("ASTROCYTE_TEST_LOCAL_AGENT_CLI") != "1" {
		t.Skip("opt-in nonsecret CLI version/help probe")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	i := NewInventory()
	if err := i.RefreshCLI(ctx); err != nil {
		t.Fatal(err)
	}
	items, err := i.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range items {
		version := "unknown"
		if item.Version != nil {
			version = *item.Version
		}
		t.Logf("%s installed=%s reason=%s version=%s configured=%s startable=%s", item.ID, item.Installed.Status, item.Installed.Reason, version, item.Configured.Status, item.Startable.Status)
		if item.Installed.Status == "available" && item.Version == nil {
			t.Errorf("installed CLI version unknown: %s", item.ID)
		}
	}
}

func TestWindowsShimSpacesAndDescendantCleanup(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows native shim boundary")
	}
	t.Setenv("ASTROCYTE_CLI_PROBE_TEST_CHILD", "1")
	path, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(t.TempDir(), "CLI directory with spaces")
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	shim := filepath.Join(dir, "native test.cmd")
	if err := os.WriteFile(shim, []byte("@echo off\r\n\""+path+"\" %*\r\n"), 0600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	output, err := runCLIProbe(ctx, shim, "--version")
	if err != nil || !strings.Contains(output, "1.2.3") {
		t.Fatalf("shim with spaces failed: %q %v", output, err)
	}
	marker := filepath.Join(dir, "orphan-marker")
	t.Setenv("ASTROCYTE_CLI_PROBE_TEST_MARKER", marker)
	ctx, cancel = context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()
	if _, err := runCLIProbe(ctx, shim, "--help"); err == nil {
		t.Fatal("shim ignored deadline")
	}
	time.Sleep(800 * time.Millisecond)
	if _, err := os.Stat(marker); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("shim descendant survived cancellation: %v", err)
	}
}
