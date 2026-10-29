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
	state := filepath.Join(root, strings.Repeat("public-path-", 14))
	service := New(state, Options{AllowCommittedGit: true})
	work := domain.Work{Root: source, Kind: domain.WorkKindFolder}
	prepared, err := service.Prepare(ctx, work, domain.RelayWorkspace{ID: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	if len(prepared.Root) <= 260 || !prepared.Prepared || !sameExistingDirectory(prepared.Root, filepath.Join(state, prepared.ID)) {
		t.Fatal("actual long worktree did not retain its owned destination")
	}
	commandRoot, err := gitDirectory(prepared.Root)
	if err != nil || len(commandRoot) >= 260 || !sameExistingDirectory(commandRoot, prepared.Root) {
		t.Fatal("Git directory alias did not preserve the actual long directory", err)
	}
	if _, err = gitDirectory(filepath.Join(prepared.Root, "missing-directory")); err == nil {
		t.Fatal("missing Git directory was accepted")
	}
	actual, err := git(ctx, prepared.Root, "rev-parse", "HEAD")
	if err != nil || actual != head {
		t.Fatal("actual public commit changed", err)
	}
	if body, err := os.ReadFile(filepath.Join(prepared.Root, "README.md")); err != nil || len(body) == 0 {
		t.Fatal("actual public README unavailable", err)
	}
	before, err := service.Observe(ctx, prepared)
	if err != nil {
		t.Fatal(err)
	}
	readme := filepath.Join(prepared.Root, "README.md")
	file, err := os.OpenFile(readme, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	_, writeErr := file.WriteString("\nWindows 长目录实际观察检查。\n")
	closeErr := file.Close()
	if writeErr != nil || closeErr != nil {
		t.Fatal(writeErr, closeErr)
	}
	if err = os.WriteFile(filepath.Join(prepared.Root, "windows-observation.txt"), []byte("public Windows worktree observation\n"), 0600); err != nil {
		t.Fatal(err)
	}
	after, err := service.Observe(ctx, prepared)
	if err != nil || after == before || !strings.Contains(after, "windows-observation.txt") || !strings.Contains(after, "README.md") {
		t.Fatal("actual edits were not observed in the long worktree", err)
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
