package app_test

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/agents"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/relayworktree"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/sqlite"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

func TestRelayControlledCLIProcess(t *testing.T) {
	if os.Getenv("ASTROCYTE_RELAY_CONTROLLED_CLI") != "1" {
		return
	}
	if os.Getenv("ASTROCYTE_RELAY_CONTROLLED_EOF") == "1" {
		input, e := io.ReadAll(os.Stdin)
		if e != nil {
			os.Exit(2)
		}
		if e = os.WriteFile("public-eof-input.txt", input, 0600); e != nil {
			os.Exit(3)
		}
		_, _ = fmt.Fprintln(os.Stdout, "public input received after EOF")
		for {
			time.Sleep(time.Second)
		}
	}
	_, _ = fmt.Fprintln(os.Stdout, "public cli active")
	// This scenario asserts a currently active process. Keep producing real
	// public activity while it handles input; a separate process test covers
	// silence, so slow Git observations cannot turn this fixture into silence.
	go func() {
		ticker := time.NewTicker(20 * time.Millisecond)
		defer ticker.Stop()
		for range ticker.C {
			_, _ = fmt.Fprintln(os.Stdout, "public cli active")
		}
	}()
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		if scanner.Text() == "__edit__" {
			_ = os.WriteFile("public.txt", []byte("actual controlled CLI change\n"), 0600)
		}
	}
	os.Exit(0)
}

func TestRelayControlledCLIFullStateAndGitObservation(t *testing.T) {
	f := newRelayFixture(t)
	t.Setenv("ASTROCYTE_RELAY_CONTROLLED_CLI", "1")
	source := t.TempDir()
	git := func(args ...string) {
		t.Helper()
		c := exec.Command("git", append([]string{"-C", source}, args...)...)
		if e := c.Run(); e != nil {
			t.Fatalf("controlled Git setup failed: %v", e)
		}
	}
	git("init", "-q")
	if e := os.WriteFile(filepath.Join(source, "public.txt"), []byte("public baseline\n"), 0600); e != nil {
		t.Fatal(e)
	}
	git("add", "public.txt")
	git("-c", "user.name=Public Test", "-c", "user.email=public-test@example.invalid", "commit", "-qm", "baseline")
	f.works.work.Root = source
	f.projects.project.Root = source
	f.projects.project.Settings.ExternalModelCLI = "public-controlled-cli"
	executable, e := os.Executable()
	if e != nil {
		t.Fatal(e)
	}
	f.options.Agents = []domain.AgentSpec{{Name: "public-controlled-cli", DriveMode: "terminal", LaunchCmd: []string{executable, "-test.run=^TestRelayControlledCLIProcess$"}}}
	f.options.Clock = time.Now
	workspaces := relayworktree.New(filepath.Join(f.root, "worktrees"), relayworktree.Options{AllowCommittedGit: true})
	terminal := agents.NewRelayTerminalDriver(agents.RelayTerminalOptions{LaunchPolicy: func(_ context.Context, r app.RelayLaunch) error {
		if r.Spec.Name != "public-controlled-cli" || r.Spec.LaunchCmd[0] != executable {
			return fmt.Errorf("test permits only its public controlled executable")
		}
		return nil
	}})
	f.service = app.NewRelayService(f.store, f.works, f.projects, workspaces, nil, terminal, f.sink, f.options)
	lifecycle := f.service.(app.RelayLifecycle)
	t.Cleanup(func() {
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = lifecycle.Shutdown(shutdown)
	})
	id := f.intent()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	result, e := f.service.ConfirmIntent(ctx, caller(), id, confirm())
	if e != nil {
		t.Fatalf("confirm actual CLI: %v; context=%v", e, ctx.Err())
	}
	// Windows 上受控进程启动与首次就绪在并发包运行时超过 5 秒；保留有界等待。
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		if e = lifecycle.ObserveOwned(ctx); e != nil {
			v, _ := f.service.GetTask(context.Background(), caller(), id)
			t.Fatalf("observer failed: %v; context=%v, state=%s, sequence=%d", e, ctx.Err(), v.Task.State, v.Terminal.LastSequence)
		}
		result.View, e = f.service.GetTask(ctx, caller(), id)
		if e != nil {
			t.Fatal(e)
		}
		if result.View.Task.State == "working" && result.View.Terminal.Liveness == "live" {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if result.View.Task.State != "working" || result.View.Terminal.Liveness != "live" {
		t.Fatal("actual CLI activity not visible in persisted task")
	}
	_, e = f.service.Send(ctx, caller(), id, app.RelaySendCommand{Input: "__edit__"})
	if e != nil {
		t.Fatal(e)
	}
	sawGit := false
	for time.Now().Before(deadline) {
		if e = lifecycle.ObserveOwned(ctx); e != nil {
			t.Fatal(e)
		}
		events, e := f.service.ListEvents(ctx, caller(), id)
		if e != nil {
			t.Fatal(e)
		}
		for _, event := range events {
			if event.Kind == "git_activity" {
				sawGit = true
			}
		}
		if sawGit {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !sawGit {
		t.Fatal("actual CLI Git change did not reach the derived sink")
	}
	v, e := f.service.GetTask(ctx, caller(), id)
	if e != nil || v.Task.State != "working" || v.EventPublication.Status != "published" {
		t.Fatal("Git completion inferred or event publication missing")
	}
	data, e := os.ReadFile(filepath.Join(v.Workspace.Root, "public.txt"))
	if e != nil || string(data) != "actual controlled CLI change\n" {
		t.Fatal("CLI did not change its neutral workspace")
	}
	data, e = os.ReadFile(filepath.Join(source, "public.txt"))
	if e != nil || string(data) != "public baseline\n" {
		t.Fatal("CLI changed original source tree")
	}
	if e = lifecycle.Shutdown(ctx); e != nil {
		t.Fatal(e)
	}
	v, e = f.service.GetTask(ctx, caller(), id)
	if e != nil || v.Terminal.Liveness != "exited" || v.Task.Condition != "terminal_exited" || v.Task.State != "working" {
		t.Fatal("actual process exit silently completed the task")
	}
}

func TestRelayControlledEOFFirstInputUnsupportedReceiptAndExplicitExit(t *testing.T) {
	f := newRelayFixture(t)
	t.Setenv("ASTROCYTE_RELAY_CONTROLLED_CLI", "1")
	t.Setenv("ASTROCYTE_RELAY_CONTROLLED_EOF", "1")
	executable, e := os.Executable()
	if e != nil {
		t.Fatal(e)
	}
	f.options.Agents = []domain.AgentSpec{{Name: "alpha", DriveMode: "terminal", InputMode: "stdin_eof", LaunchCmd: []string{executable, "-test.run=^TestRelayControlledCLIProcess$"}}}
	f.options.Clock = time.Now
	terminal := agents.NewRelayTerminalDriver(agents.RelayTerminalOptions{LaunchPolicy: func(_ context.Context, r app.RelayLaunch) error {
		if r.Spec.LaunchCmd[0] != executable {
			return fmt.Errorf("only public test executable is allowed")
		}
		return nil
	}})
	f.service = f.assemble(f.store, nil, terminal)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	first := f.intent()
	r, e := f.service.ConfirmIntent(ctx, caller(), first, confirm())
	if e != nil || r.Receipt.Status != "accepted" {
		t.Fatalf("EOF dispatch failed: %v", e)
	}
	lifecycle := f.service.(app.RelayLifecycle)
	t.Cleanup(func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = lifecycle.Shutdown(cleanup)
	})
	want := "HANDOFF_MANUAL:\ncomplete manual\nsecond line\n\nTASK:\nexplicit task"
	file := filepath.Join(r.View.Workspace.Root, "public-eof-input.txt")
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		data, e := os.ReadFile(file)
		if e == nil && string(data) == want {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	data, e := os.ReadFile(file)
	if e != nil || string(data) != want {
		t.Fatal("EOF helper did not consume full manual/task before executing")
	}
	if _, e = f.service.Read(ctx, caller(), first); e != nil {
		t.Fatal(e)
	}
	counted := &relayCountingStore{RelayStore: f.store}
	f.service = f.assemble(counted, nil, terminal)
	for i := 0; i < 8; i++ {
		if e = f.service.(app.RelayLifecycle).ObserveOwned(ctx); e != nil {
			t.Fatal(e)
		}
	}
	if counted.updates.Load() != 0 {
		t.Fatal("real unchanged EOF process rewrote state on background ticks")
	}
	owned := findOwned(t, ownedReader(t, f.service), first)
	if owned.SourceStatus != "gap" || owned.ArchivePath != "" || owned.ArchiveRoot != "" || owned.ArchiveFinalized != "unknown" {
		t.Fatal("terminal stdout incorrectly became a complete native session source")
	}
	op := caller()
	input := app.RelaySendCommand{Input: "must not resend"}
	sent, e := f.service.Send(ctx, op, first, input)
	checkCode(t, e, apierrors.UnsupportedCapability)
	if sent.Receipt.Status != "rejected" || sent.View.Task.Condition == "delivery_unknown" {
		t.Fatal("known one-shot limitation incorrectly made delivery unknown")
	}
	if e = f.store.Close(); e != nil {
		t.Fatal(e)
	}
	f.store, e = sqlite.OpenRelayStore(f.root)
	if e != nil {
		t.Fatal(e)
	}
	f.service = f.assemble(f.store, nil, terminal)
	repeat, e := f.service.Send(ctx, op, first, input)
	checkCode(t, e, apierrors.UnsupportedCapability)
	if repeat.Receipt.ID != sent.Receipt.ID || repeat.Receipt.Status != "rejected" {
		t.Fatal("reloaded first RED was not preserved")
	}
	current, e := os.ReadFile(file)
	if e != nil || string(current) != want {
		t.Fatal("rejected EOF Send mutated delivered input")
	}
	r, e = f.service.Stop(ctx, caller(), first)
	if e != nil || r.Receipt.Status != "accepted" || r.View.Terminal.Liveness != "exited" || r.View.Task.State == "done" || r.View.Workspace.ActiveTaskID != first {
		t.Fatal("EOF stop silently completed/released/reassigned task")
	}
}
