package agents

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func registeredFixture(t *testing.T, roots []map[string]any, trees []map[string]any) *RegisteredProjects {
	t.Helper()
	repos, _ := json.Marshal(map[string]any{"ok": true, "result": map[string]any{"repos": roots}})
	worktrees, _ := json.Marshal(map[string]any{"ok": true, "result": map[string]any{"worktrees": trees, "truncated": false}})
	return &RegisteredProjects{read: func(ctx context.Context, kind, root string) ([]byte, error) {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		switch kind {
		case "orca_repos":
			return repos, nil
		case "orca_worktrees":
			return worktrees, nil
		}
		return nil, errors.New("no native git fixture")
	}}
}

func TestRegisteredDiscoveryScopesDedupAndMetadata(t *testing.T) {
	root := t.TempDir()
	child := filepath.Join(root, "child")
	worktree := t.TempDir()
	unrelated := t.TempDir()
	for _, path := range []string{child, filepath.Join(root, ".codex", "excluded"), filepath.Join(root, "node_modules", "excluded"), filepath.Join(root, ".venv", "excluded")} {
		if err := os.MkdirAll(path, 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(path, "package.json"), []byte("{}"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	now := time.Now().Add(-time.Minute).UTC().Truncate(time.Millisecond)
	s := registeredFixture(t, []map[string]any{{"id": "repo1", "path": root, "displayName": "Real folder"}, {"id": "repo1", "path": root, "displayName": "duplicate"}}, []map[string]any{
		{"repoId": "repo1", "hostId": "local", "path": root, "lastActivityAt": now.UnixMilli(), "createdWithAgent": "codex"},
		{"repoId": "repo1", "hostId": "local", "path": worktree, "createdWithAgent": "claude"},
		{"repoId": "unknown", "hostId": "local", "path": unrelated},
		{"repoId": "repo1", "hostId": "remote", "path": unrelated},
	})
	result, err := s.DiscoverRegistered(context.Background())
	if err != nil || result.Status != "complete" || len(result.Projects) != 3 || result.ObservedAt == nil {
		t.Fatalf("result=%+v err=%v", result, err)
	}
	for _, p := range result.Projects {
		if rootKey(p.Root) == rootKey(root) {
			if p.Source != "orca_registered" || p.Activity.Status != "known" || p.Activity.CreatedWithCLI == nil || *p.Activity.CreatedWithCLI != "codex" || !p.Activity.LastActivityAt.Equal(now) {
				t.Fatalf("bad metadata %+v", p)
			}
		} else if rootKey(p.Root) == rootKey(worktree) {
			if p.Source != "git_worktree" || rootKey(p.ParentRoot) != rootKey(root) || p.Activity.LastActivityAt != nil {
				t.Fatalf("bad worktree %+v", p)
			}
		} else if rootKey(p.Root) == rootKey(child) {
			if p.Source != "subproject" || rootKey(p.ParentRoot) != rootKey(root) || p.Activity.Status != "unknown" {
				t.Fatalf("bad child %+v", p)
			}
		} else {
			t.Fatalf("unauthorized root %s", p.Root)
		}
		if p.Git.Status != "unavailable" || p.Git.Dirty != nil || len(p.Limitations) == 0 {
			t.Fatalf("invented git state %+v", p)
		}
	}
}

func TestRegisteredDiscoveryFailureIsExplicitAndNoFallback(t *testing.T) {
	root := t.TempDir()
	s := registeredFixture(t, []map[string]any{{"id": "repo1", "path": root}, {"id": "repo2", "path": filepath.Join(root, "missing")}, {"id": "evil;exec", "path": root}}, []map[string]any{})
	result, err := s.DiscoverRegistered(context.Background())
	if err != nil || result.Status != "partial" || len(result.Projects) != 1 || len(result.Failures) != 2 {
		t.Fatalf("result=%+v err=%v", result, err)
	}
	s.read = func(context.Context, string, string) ([]byte, error) {
		return nil, errors.New("private failure detail")
	}
	result, err = s.DiscoverRegistered(context.Background())
	if err == nil || result.Status != "unknown" || result.ObservedAt != nil || len(result.Projects) != 0 || strings.Contains(err.Error(), "private") {
		t.Fatalf("false observation %+v %v", result, err)
	}
	if _, err := registeredReadCommand(context.Background(), "git_clone", root); err == nil {
		t.Fatal("unapproved executable action accepted")
	}
}

func TestRegisteredMissingMainStillAllowsExplicitLocalWorktree(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "removed-checkout")
	worktree := t.TempDir()
	s := registeredFixture(t, []map[string]any{{"id": "repo1", "path": missing}}, []map[string]any{{"repoId": "repo1", "hostId": "local", "path": worktree}})
	result, err := s.DiscoverRegistered(context.Background())
	if err != nil || result.Status != "partial" || len(result.Failures) != 1 || len(result.Projects) != 1 || rootKey(result.Projects[0].Root) != rootKey(worktree) || rootKey(result.Projects[0].ParentRoot) != rootKey(missing) || result.Projects[0].Source != "git_worktree" {
		t.Fatalf("registered worktree lost %+v %v", result, err)
	}
}

func TestRegisteredDiscoveryGitFailureRetainsUnknowns(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, ".git"), 0700); err != nil {
		t.Fatal(err)
	}
	s := registeredFixture(t, []map[string]any{{"id": "repo1", "path": root}}, []map[string]any{})
	base := s.read
	s.read = func(ctx context.Context, kind, root string) ([]byte, error) {
		switch kind {
		case "git_head":
			return []byte(strings.Repeat("a", 40)), nil
		case "git_branch":
			return nil, errors.New("detached or unavailable")
		case "git_time":
			return []byte("2026-10-10T01:00:00Z"), nil
		case "git_status":
			return nil, errors.New("unknown dirty status")
		}
		return base(ctx, kind, root)
	}
	result, err := s.DiscoverRegistered(context.Background())
	if err != nil || result.Status != "partial" || len(result.Failures) != 1 || result.Projects[0].Git.Status != "unknown" || result.Projects[0].Git.Dirty != nil || result.Projects[0].Git.Branch != nil {
		t.Fatalf("invented state %+v %v", result, err)
	}
}

func TestRegisteredReadBoundsAndCancellation(t *testing.T) {
	for _, test := range []struct {
		name, mode string
		limit      int
		deadline   time.Duration
	}{
		{"output", "output", 64, 5 * time.Second}, {"deadline", "wait", 1024, 50 * time.Millisecond},
	} {
		t.Run(test.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), test.deadline)
			defer cancel()
			cmd := exec.Command(os.Args[0], "-test.run=^TestRegisteredReadHelper$")
			cmd.Env = append(os.Environ(), "ASTROCYTE_REGISTERED_HELPER="+test.mode)
			start := time.Now()
			data, err := runRegisteredRead(ctx, cmd, test.limit)
			if err == nil || data != nil {
				t.Fatalf("bound not enforced bytes=%d err=%v", len(data), err)
			}
			switch test.mode {
			case "output":
				if err.Error() != "read command output exceeds bound" {
					t.Fatalf("output overflow returned another failure: %v", err)
				}
			case "wait":
				if !errors.Is(err, context.DeadlineExceeded) || time.Since(start) > 4*time.Second {
					t.Fatalf("deadline cancellation was not enforced: %v", err)
				}
			}
		})
	}
}

func TestRegisteredReadHelper(t *testing.T) {
	switch os.Getenv("ASTROCYTE_REGISTERED_HELPER") {
	case "output":
		_, _ = os.Stdout.WriteString(strings.Repeat("public marker", 10000))
		os.Exit(0)
	case "wait":
		time.Sleep(10 * time.Second)
		os.Exit(0)
	}
}

func TestRegisteredGitReadIgnoresInheritedRepositoryAndFSMonitor(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git unavailable")
	}
	root := t.TempDir()
	git := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", append([]string{"-C", root}, args...)...)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("temp git command failed %s %v", out, err)
		}
	}
	git("init", "--quiet")
	if err := os.WriteFile(filepath.Join(root, "marker.txt"), []byte("public temp marker"), 0600); err != nil {
		t.Fatal(err)
	}
	git("add", "marker.txt")
	git("-c", "user.name=Temporary test", "-c", "user.email=temp@example.invalid", "-c", "core.hooksPath=", "commit", "--quiet", "-m", "public marker")
	marker := filepath.Join(root, "fsmonitor-invoked")
	// The fake monitor runs this test binary; its sentinel remains entirely in
	// the test-owned temporary root, with no production hook or user ACL change.
	git("config", "core.fsmonitor", `"`+os.Args[0]+`" -test.run=^TestRegisteredGitFSMonitorHelper$`)
	// A repository's own config cannot redirect status reads outside its
	// explicitly registered root, even if that other directory is accessible.
	other := t.TempDir()
	if err := os.WriteFile(filepath.Join(other, "marker.txt"), []byte("outside changed marker"), 0600); err != nil {
		t.Fatal(err)
	}
	git("config", "core.worktree", other)
	t.Setenv("ASTROCYTE_FSMONITOR_SENTINEL", marker)
	t.Setenv("GIT_DIR", filepath.Join(root, "wrong-inherited-root"))
	g := NewRegisteredProjects().observeGit(context.Background(), root)
	if g.Status != "known" || g.Head == nil || g.Dirty == nil || *g.Dirty {
		t.Fatalf("safe git observation %+v", g)
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatal("repository fsmonitor executed")
	}
	if err := os.WriteFile(filepath.Join(root, "marker.txt"), []byte("changed public marker"), 0600); err != nil {
		t.Fatal(err)
	}
	g = NewRegisteredProjects().observeGit(context.Background(), root)
	if g.Status != "known" || g.Dirty == nil || !*g.Dirty {
		t.Fatalf("tracked change not observed %+v", g)
	}
	if runtime.GOOS != "windows" {
		outside := t.TempDir()
		if err := os.Symlink(outside, filepath.Join(root, "escaped")); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(outside, "go.mod"), []byte("module temp"), 0600); err != nil {
			t.Fatal(err)
		}
		candidates, err := DiscoverProjects(context.Background(), root)
		if err != nil || len(candidates) != 1 {
			t.Fatalf("symlink discovery escaped %+v %v", candidates, err)
		}
	}
}

func TestRegisteredGitFSMonitorHelper(t *testing.T) {
	if marker := os.Getenv("ASTROCYTE_FSMONITOR_SENTINEL"); marker != "" {
		_ = os.WriteFile(marker, []byte("invoked"), 0600)
		os.Exit(0)
	}
}

func TestRegisteredProjectsLiveReadOnly(t *testing.T) {
	if os.Getenv("ASTROCYTE_TEST_REGISTERED_PROJECTS") != "1" {
		t.Skip("explicit read-only registered-root observation opt-in")
	}
	result, err := NewRegisteredProjects().DiscoverRegistered(context.Background())
	if err != nil || result.ObservedAt == nil || len(result.Projects) == 0 {
		t.Fatalf("live registered source failed status=%s count=%d err=%v", result.Status, len(result.Projects), err)
	}
	bySource := map[string]int{}
	knownGit, knownActivity := 0, 0
	for _, p := range result.Projects {
		bySource[p.Source]++
		if p.Git.Status == "known" {
			knownGit++
		}
		if p.Activity.Status == "known" {
			knownActivity++
		}
	}
	t.Logf("actual registered-root snapshot status=%s total=%d sources=%v git_known=%d activity_known=%d observed_at=%s", result.Status, len(result.Projects), bySource, knownGit, knownActivity, result.ObservedAt.Format(time.RFC3339))
	for _, failure := range result.Failures {
		t.Logf("retained failure root=%s reason=%s", failure.Root, failure.Reason)
	}
}
