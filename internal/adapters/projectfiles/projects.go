package projectfiles

import (
	"context"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

func scopeError(message string) error {
	return &apierrors.ServiceError{Code: apierrors.ScopeDenied, Message: message, RequiredAction: "select_explicit_project_scope"}
}

// CanonicalRoot requires a chosen absolute directory, never defaults to cwd.
func CanonicalRoot(root string) (string, error) {
	if !filepath.IsAbs(root) || strings.TrimSpace(root) == "" {
		return "", scopeError("an absolute project root is required")
	}
	clean := filepath.Clean(root)
	resolved, err := filepath.EvalSymlinks(clean)
	if err != nil {
		return "", scopeError("project root is unavailable")
	}
	info, err := os.Stat(resolved)
	if err != nil || !info.IsDir() {
		return "", scopeError("project root must be a directory")
	}
	if filepath.Dir(resolved) == resolved {
		return "", scopeError("drive roots cannot be registered")
	}
	return resolved, nil
}

func inside(root, path string) bool {
	rel, err := filepath.Rel(pathSpelling(root), pathSpelling(path))
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

// Windows junctions may be ModeIrregular rather than ModeSymlink and a final
// junction may be left unchanged by EvalSymlinks. Check attributes as well,
// including every ancestor, before treating native metadata as unredirected.
func hasRedirectedAncestor(path string) bool {
	for current := filepath.Clean(path); ; current = filepath.Dir(current) {
		if pathIsRedirect(current) {
			return true
		}
		if filepath.Dir(current) == current {
			return false
		}
	}
}

func secretComponent(name string) bool {
	n := strings.ToLower(name)
	return n == ".git" || n == ".ssh" || n == ".aws" || n == ".codex" || n == ".claude" || n == ".pi" || n == "node_modules" || n == ".env" || strings.HasPrefix(n, ".env.") || n == "auth.json" || n == "credentials.json" || n == "credentials" || n == "id_rsa" || n == "id_ed25519"
}

// ValidateProjectPath rejects each symlink component, not only final escapes.
// This is a cooperative filesystem check, not an OS sandbox or an atomic fence
// against another local process replacing a path after verification.
func ValidateProjectPath(root, relative string) (string, error) {
	if relative == "" || filepath.IsAbs(relative) || strings.Contains(relative, ":") {
		return "", scopeError("only relative project paths are accepted")
	}
	clean := filepath.Clean(relative)
	joined := filepath.Join(root, clean)
	if !inside(root, joined) {
		return "", scopeError("path leaves the approved project")
	}
	// Check expanded component names too: a short alias for .codex or
	// credentials.json must not bypass the existing secret exclusions.
	joined = pathSpelling(joined)
	clean, err := filepath.Rel(pathSpelling(root), joined)
	if err != nil {
		return "", scopeError("path leaves the approved project")
	}
	current := pathSpelling(root)
	for _, part := range strings.Split(clean, string(filepath.Separator)) {
		if part == "." {
			continue
		}
		if secretComponent(part) {
			return "", scopeError("private native state and credential paths are excluded")
		}
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if err != nil || info.Mode()&os.ModeSymlink != 0 || pathIsRedirect(current) {
			return "", scopeError("path is unavailable or contains a symlink")
		}
	}
	resolved, err := filepath.EvalSymlinks(joined)
	if err != nil || !inside(root, resolved) {
		return "", scopeError("resolved path leaves approved scope")
	}
	return resolved, nil
}

func ReadProjectFiles(ctx context.Context, p domain.LocalProject, paths []string) ([]domain.ContextFile, error) {
	result := []domain.ContextFile{}
	if len(paths) == 0 {
		return result, nil
	}
	if !p.Settings.AllowDirectory || len(p.Settings.AllowedSubdirs) == 0 {
		return nil, scopeError("directory scope B is disabled")
	}
	if len(paths) > 32 {
		return nil, scopeError("at most 32 explicit files may be read")
	}
	remaining := 128 * 1024
	for _, rel := range paths {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		path, err := ValidateProjectPath(p.Root, rel)
		if err != nil {
			return nil, err
		}
		allowed := false
		for _, sub := range p.Settings.AllowedSubdirs {
			dir, err := ValidateProjectPath(p.Root, sub)
			if err != nil {
				return nil, err
			}
			if inside(dir, path) {
				allowed = true
			}
		}
		if !allowed {
			return nil, scopeError("file is outside allowed subdirectories")
		}
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() {
			return nil, scopeError("only regular files are readable")
		}
		if info.Size() > int64(remaining) {
			return nil, scopeError("context file output exceeds 128 KiB")
		}
		f, err := os.Open(path)
		if err != nil {
			return nil, scopeError("file read denied")
		}
		data, err := io.ReadAll(io.LimitReader(f, int64(remaining)+1))
		_ = f.Close()
		if err != nil || len(data) > remaining {
			return nil, scopeError("context file output exceeds bound")
		}
		remaining -= len(data)
		result = append(result, domain.ContextFile{Path: filepath.ToSlash(rel), Text: string(data), Version: fmt.Sprintf("mtime:%d;size:%d", info.ModTime().UnixNano(), info.Size())})
	}
	return result, nil
}

func DiscoverProjects(ctx context.Context, chosenRoot string) ([]domain.ProjectCandidate, error) {
	root, err := CanonicalRoot(chosenRoot)
	if err != nil {
		return nil, err
	}
	result := []domain.ProjectCandidate{}
	visited := 0
	err = filepath.WalkDir(root, func(path string, e fs.DirEntry, walkErr error) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if walkErr != nil {
			return scopeError("candidate directory is inaccessible")
		}
		visited++
		if visited > 2000 {
			return scopeError("candidate discovery exceeds 2000 entries; choose a smaller root")
		}
		if e.Type()&os.ModeSymlink != 0 {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		if e.IsDir() {
			if path != root && (secretComponent(e.Name()) || strings.HasPrefix(e.Name(), ".") || e.Name() == "dist" || e.Name() == "build" || e.Name() == "vendor" || strings.Count(rel, string(filepath.Separator)) >= 3) {
				return filepath.SkipDir
			}
			for _, marker := range []string{".git", "go.mod", "package.json", "pyproject.toml", "Cargo.toml"} {
				if info, err := os.Lstat(filepath.Join(path, marker)); err == nil && info.Mode()&os.ModeSymlink == 0 {
					result = append(result, domain.ProjectCandidate{Root: path, Name: filepath.Base(path)})
					break
				}
			}
			if len(result) > 100 {
				return scopeError("candidate discovery exceeds 100 projects")
			}
		}
		return nil
	})
	return result, err
}

type Files struct{}

func (Files) CanonicalRoot(root string) (string, error) { return CanonicalRoot(root) }
func (Files) ValidateProjectPath(root, relative string) (string, error) {
	return ValidateProjectPath(root, relative)
}
func (Files) ReadProjectFiles(ctx context.Context, project domain.LocalProject, paths []string) ([]domain.ContextFile, error) {
	return ReadProjectFiles(ctx, project, paths)
}
func (Files) DiscoverProjects(ctx context.Context, root string) ([]domain.ProjectCandidate, error) {
	return DiscoverProjects(ctx, root)
}

// 旧原生适配器显式使用同一权限与平台路径实现，不保留第二套检查。
func ScopeError(message string) error        { return scopeError(message) }
func Inside(root, path string) bool          { return inside(root, path) }
func HasRedirectedAncestor(path string) bool { return hasRedirectedAncestor(path) }
func SecretComponent(name string) bool       { return secretComponent(name) }
func PathSpelling(path string) string        { return pathSpelling(path) }
func PathIsRedirect(path string) bool        { return pathIsRedirect(path) }
