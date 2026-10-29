// Package relayworktree prepares Agent-neutral Git worktrees. It never selects
// or launches an Agent, changes the source working tree, or discards relay edits.
package relayworktree

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

type Options struct {
	// Explicit assembly policy, no implicit resolution of the user's pending
	// dirty/untracked/non-Git scope decision. Clean committed Git is a subset.
	AllowCommittedGit bool
}
type Workspaces struct {
	root    string
	options Options
}

var _ app.RelayWorkspaces = (*Workspaces)(nil)

func New(root string, options Options) *Workspaces { return &Workspaces{root: root, options: options} }

func failure(code apierrors.Code, message string) error {
	return &apierrors.ServiceError{Code: code, Message: message, RequiredAction: "review_neutral_workspace_scope"}
}

func (s *Workspaces) path(id string) (string, error) {
	if _, err := uuid.Parse(id); err != nil || !filepath.IsAbs(s.root) {
		return "", failure(apierrors.ValidationFailed, "trusted workspace ID and absolute state root required")
	}
	return filepath.Join(s.root, id), nil
}

func (s *Workspaces) Prepare(ctx context.Context, work domain.Work, w domain.RelayWorkspace) (domain.RelayWorkspace, error) {
	path, err := s.path(w.ID)
	if err != nil {
		return w, err
	}
	if w.Prepared {
		if !sameExistingDirectory(w.Root, path) {
			return w, failure(apierrors.ScopeDenied, "saved workspace is outside owned state")
		}
		info, err := os.Lstat(path)
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return w, failure(apierrors.EvidenceMissing, "saved neutral workspace is unavailable")
		}
		// Observe only; never reset/recreate the worktree on a handoff.
		return w, nil
	}
	if !s.options.AllowCommittedGit {
		return w, failure(apierrors.UnsupportedCapability, "neutral workspace source policy is not configured")
	}
	if work.Kind != domain.WorkKindFolder || !filepath.IsAbs(work.Root) {
		return w, failure(apierrors.UnsupportedCapability, "non-Git and single-file workspace scope is undecided")
	}
	root, err := git(ctx, work.Root, "rev-parse", "--show-toplevel")
	if err != nil {
		return w, failure(apierrors.UnsupportedCapability, "neutral workspace requires an approved Git repository")
	}
	if !sameExistingDirectory(strings.TrimSpace(root), work.Root) {
		return w, failure(apierrors.ScopeDenied, "work must match the repository root")
	}
	status, err := git(ctx, work.Root, "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=all")
	if err != nil {
		return w, err
	}
	if status != "" {
		return w, failure(apierrors.UnsupportedCapability, "dirty and untracked source scope is undecided; no source state was discarded")
	}
	if _, err = os.Lstat(path); !errors.Is(err, os.ErrNotExist) {
		return w, failure(apierrors.DeliveryUnknown, "workspace path already exists without a prepared receipt; do not recreate")
	}
	if err = os.MkdirAll(s.root, 0700); err != nil {
		return w, err
	}
	branch := "relay/" + w.ID
	target := path
	if runtime.GOOS == "windows" {
		sourceRoot, resolveErr := gitDirectory(work.Root)
		if resolveErr != nil {
			return w, resolveErr
		}
		stateRoot, resolveErr := gitDirectory(s.root)
		if resolveErr != nil {
			return w, resolveErr
		}
		target = filepath.Join(stateRoot, w.ID)
		if strings.EqualFold(filepath.VolumeName(sourceRoot), filepath.VolumeName(target)) {
			// Git 的内部 GIT_DIR 有长度限制；相对参数由既有 -C 源目录解析。
			target, err = filepath.Rel(sourceRoot, target)
			if err != nil || target == "." {
				return w, failure(apierrors.ScopeDenied, "neutral workspace relative destination is invalid")
			}
		}
	}
	if _, err = git(ctx, work.Root, "worktree", "add", "-b", branch, target, "HEAD"); err != nil {
		return w, failure(apierrors.DeliveryUnknown, "Git worktree creation could not be verified; inspect without retrying")
	}
	w.Root = path
	w.SourceRoot = work.Root
	w.Branch = branch
	w.Prepared = true
	w.GitObservation, err = s.Observe(ctx, w)
	if err != nil {
		return w, failure(apierrors.DeliveryUnknown, "created workspace observation could not be verified")
	}
	return w, nil
}

// Observe reports exact private Git state only to the Service. Public events
// contain git_activity, without paths/diff/content, and never mean task done.
func (s *Workspaces) Observe(ctx context.Context, w domain.RelayWorkspace) (string, error) {
	path, err := s.path(w.ID)
	if err != nil {
		return "", err
	}
	if !sameExistingDirectory(path, w.Root) {
		return "", failure(apierrors.ScopeDenied, "Git observation is outside the neutral workspace")
	}
	head, err := git(ctx, w.Root, "rev-parse", "--verify", "HEAD")
	if err != nil {
		return "", err
	}
	status, err := git(ctx, w.Root, "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=all")
	if err != nil {
		return "", err
	}
	// Diff bytes detect continued edits to an already-dirty file. No hash or
	// manifest is built, and these bounded bytes stay in the local access DB.
	diff, err := git(ctx, w.Root, "diff", "--no-ext-diff", "--no-textconv", "--binary", "HEAD", "--")
	if err != nil {
		return "", err
	}
	return head + "\x00" + status + "\x00" + diff, nil
}

// Git reports canonical Windows spelling while registered/temporary roots may
// contain real 8.3 aliases. Compare the existing directory's filesystem identity,
// never a string prefix or a guessed alternative path. Different roots still fail.
func sameExistingDirectory(a, b string) bool {
	aInfo, aErr := os.Stat(a)
	bInfo, bErr := os.Stat(b)
	return aErr == nil && bErr == nil && aInfo.IsDir() && bInfo.IsDir() && os.SameFile(aInfo, bInfo)
}

type bounded struct {
	bytes.Buffer
	overflow bool
}

func (b *bounded) Write(p []byte) (int, error) {
	if len(p) > 2*1024*1024-b.Len() {
		b.overflow = true
		return len(p), nil
	}
	_, _ = b.Buffer.Write(p)
	return len(p), nil
}

func git(ctx context.Context, root string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	directory, err := gitDirectory(root)
	if err != nil {
		return "", err
	}
	location := []string{"-C", directory}
	cwd := directory
	if runtime.GOOS == "windows" {
		canonical, err := filepath.EvalSymlinks(root)
		if err != nil {
			return "", err
		}
		if len(canonical) >= 248 {
			// 显式指定 Git 目录，避免 Git 在长目录中调用 getcwd。
			location = []string{"--git-dir=" + filepath.Join(directory, ".git"), "--work-tree=" + directory}
			cwd = filepath.VolumeName(directory) + string(filepath.Separator)
		}
	}
	options := []string{"--no-optional-locks", "--no-pager", "-c", "core.hooksPath=", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "-c", "core.longpaths=true"}
	options = append(options, location...)
	command := exec.CommandContext(ctx, "git", append(options, args...)...)
	command.Dir = cwd
	command.Env = []string{}
	for _, v := range os.Environ() {
		key, _, _ := strings.Cut(v, "=")
		if !strings.HasPrefix(strings.ToUpper(key), "GIT_") {
			command.Env = append(command.Env, v)
		}
	}
	command.Env = append(command.Env, "GIT_TERMINAL_PROMPT=0", "GIT_OPTIONAL_LOCKS=0", "GIT_PAGER=cat")
	output := &bounded{}
	command.Stdout = output
	command.Stderr = io.Discard
	command.WaitDelay = time.Second
	if err := command.Run(); err != nil {
		return "", failure(apierrors.EvidenceMissing, "fixed Git operation did not succeed")
	}
	if output.overflow {
		return "", failure(apierrors.EvidenceMissing, "Git observation exceeded its bounded limit")
	}
	return output.String(), nil
}
