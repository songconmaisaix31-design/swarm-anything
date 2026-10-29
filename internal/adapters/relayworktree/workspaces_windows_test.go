package relayworktree

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
	"golang.org/x/sys/windows"
)

func TestNeutralWindowsActualShortRoot(t *testing.T) {
	source := cleanRepo(t)
	ptr, e := windows.UTF16PtrFromString(source)
	if e != nil {
		t.Fatal(e)
	}
	buffer := make([]uint16, 32768)
	n, e := windows.GetShortPathName(ptr, &buffer[0], uint32(len(buffer)))
	if e != nil || n == 0 || n >= uint32(len(buffer)) {
		t.Skip("NOT_RUN: actual Windows short path unavailable")
	}
	short := windows.UTF16ToString(buffer[:n])
	long, e := filepath.EvalSymlinks(source)
	if e != nil {
		t.Fatal(e)
	}
	if strings.EqualFold(filepath.Clean(short), filepath.Clean(long)) {
		t.Skip("NOT_RUN: fixture has no distinct Windows 8.3 alias")
	}
	if !sameExistingDirectory(source, short) {
		t.Fatal("real short alias lost exact directory identity")
	}
	if sameExistingDirectory(source, t.TempDir()) {
		t.Fatal("unrelated directory accepted as source")
	}
	service := New(t.TempDir(), Options{AllowCommittedGit: true})
	w, e := service.Prepare(context.Background(), domain.Work{Root: short, Kind: domain.WorkKindFolder}, domain.RelayWorkspace{ID: uuid.NewString()})
	if e != nil {
		t.Fatal(e)
	}
	if !w.Prepared || w.SourceRoot != short {
		t.Fatal("approved source scope was replaced")
	}
	path := filepath.Join(w.Root, "public.txt")
	if data, e := os.ReadFile(path); e != nil || len(data) == 0 {
		t.Fatal("short root fixture did not produce a real worktree")
	}
	if _, e = service.Prepare(context.Background(), domain.Work{Root: short, Kind: domain.WorkKindFolder}, w); e != nil {
		t.Fatal(e)
	}
}

func TestNeutralWindowsActualLongRoot(t *testing.T) {
	ctx := context.Background()
	base := os.Getenv("ASTROCYTE_TEST_OUTPUT_ROOT")
	if !filepath.IsAbs(base) {
		t.Fatal("actual public Git verification requires an absolute output root")
	}
	root, err := os.MkdirTemp(base, "neutral-long-")
	if err != nil {
		t.Fatal(err)
	}
	repository, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}
	remote, err := git(ctx, repository, "remote", "get-url", "origin")
	if err != nil || strings.TrimSuffix(strings.TrimSpace(remote), ".git") != "https://github.com/songconmaisaix31-design/swarm-anything" {
		t.Fatal("explicit public source repository is required", err)
	}
	source := filepath.Join(root, "source")
	if _, err = git(ctx, repository, "clone", "--local", "--no-hardlinks", repository, source); err != nil {
		t.Fatal(err)
	}
	head, err := git(ctx, source, "rev-parse", "HEAD")
	if err != nil {
		t.Fatal(err)
	}
	state := filepath.Join(root, strings.Repeat("public-path-", 8))
	service := New(state, Options{AllowCommittedGit: true})
	work := domain.Work{Root: source, Kind: domain.WorkKindFolder}
	prepared, err := service.Prepare(ctx, work, domain.RelayWorkspace{ID: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	if len(prepared.Root) < 230 || !prepared.Prepared || !sameExistingDirectory(prepared.Root, filepath.Join(state, prepared.ID)) {
		t.Fatal("actual long worktree did not retain its owned destination")
	}
	actual, err := git(ctx, prepared.Root, "rev-parse", "HEAD")
	if err != nil || actual != head {
		t.Fatal("actual public commit changed", err)
	}
	if body, err := os.ReadFile(filepath.Join(prepared.Root, "README.md")); err != nil || len(body) == 0 {
		t.Fatal("actual public README unavailable", err)
	}
	if _, err = service.Observe(ctx, prepared); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Prepare(ctx, work, prepared); err != nil {
		t.Fatal(err)
	}
	wrong := prepared
	wrong.Root = source
	if _, err = service.Prepare(ctx, work, wrong); err == nil {
		t.Fatal("unrelated source accepted as the owned worktree")
	}
	t.Logf("actual public HEAD=%s target_length=%d; checkout, observe, reuse and wrong-root refusal passed; evidence=%s", strings.TrimSpace(head), len(prepared.Root), root)
}
