package projectfiles

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

// 原 agents/projects_test.go 的实际文件权限用例随唯一实现迁入。
func TestProjectScopeDefaultDenyAndDirectoryGranularity(t *testing.T) {
	root := t.TempDir()
	_ = os.Mkdir(filepath.Join(root, "allowed"), 0700)
	_ = os.Mkdir(filepath.Join(root, "other"), 0700)
	for _, path := range []string{"allowed/a.txt", "other/b.txt", "allowed/.env"} {
		if err := os.WriteFile(filepath.Join(root, filepath.FromSlash(path)), []byte("selected"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	p := domain.LocalProject{Root: root}
	ctx := context.Background()
	if _, err := ReadProjectFiles(ctx, p, []string{"allowed/a.txt"}); err == nil {
		t.Fatal("default A-only unexpectedly read directory")
	}
	p.Settings.AllowDirectory = true
	p.Settings.AllowedSubdirs = []string{"allowed"}
	files, err := ReadProjectFiles(ctx, p, []string{"allowed/a.txt"})
	if err != nil || len(files) != 1 || files[0].Version == "" {
		t.Fatalf("approved file read: %+v %v", files, err)
	}
	for _, path := range []string{"other/b.txt", "../escape.txt", "allowed/.env", root} {
		if _, err := ReadProjectFiles(ctx, p, []string{path}); err == nil {
			t.Fatalf("outside path read: %s", path)
		}
	}
	p.Settings.AllowDirectory = false
	if _, err := ReadProjectFiles(ctx, p, []string{"allowed/a.txt"}); err == nil {
		t.Fatal("revoked B still readable")
	}
	if _, err := CanonicalRoot(""); err == nil {
		t.Fatal("empty root silently registered cwd")
	}
}

func TestProjectSymlinkEscapeAndOutputBound(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "private.txt"), []byte("private"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "escape")); err == nil {
		if _, err := ValidateProjectPath(root, "escape/private.txt"); err == nil {
			t.Fatal("symlink escape allowed")
		}
	} else {
		t.Logf("symlink creation unavailable; separate bounded read check still runs: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "large.txt"), []byte(strings.Repeat("x", 128*1024+1)), 0600); err != nil {
		t.Fatal(err)
	}
	p := domain.LocalProject{Root: root, Settings: domain.ProjectSettings{AllowDirectory: true, AllowedSubdirs: []string{"."}}}
	if _, err := ReadProjectFiles(context.Background(), p, []string{"large.txt"}); err == nil {
		t.Fatal("large file escaped output bound")
	}
}
