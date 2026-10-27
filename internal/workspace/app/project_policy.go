package app

import (
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

type ProjectActionScope struct {
	ProjectID        string
	SettingsRevision int
	Action           string
	Roots            []string
	Tools            []string
	ExternalTargets  []string
}

func projectActionKnown(action string) bool {
	return has([]string{
		"discover", "read_context", "start", "resume", "send", "stop", "observe", "reconcile",
		"create_mission", "manage_work_items", "claim_work_item", "submit_artifact", "accept_artifact", "reject_artifact",
		"read_swarm", "pause_mission", "cancel_mission", "recover_mission",
	}, action)
}

func projectPathContains(root, path string) bool {
	if !filepath.IsAbs(root) || !filepath.IsAbs(path) {
		return false
	}
	if runtime.GOOS == "windows" {
		root, path = strings.ToLower(root), strings.ToLower(path)
	}
	rel, err := filepath.Rel(root, path)
	return err == nil && !filepath.IsAbs(rel) && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// 只检查事务已加载的当前设置；实际文件身份与访问仍由 ProjectFiles 核查。
func ValidateProjectActionScope(project domain.LocalProject, scope ProjectActionScope) error {
	if project.ID == "" || scope.ProjectID != project.ID || !projectActionKnown(scope.Action) {
		return projectError(apierrors.ScopeDenied, "protected action is outside the current project")
	}
	if scope.SettingsRevision < 1 || scope.SettingsRevision != project.Settings.Revision {
		return projectError(apierrors.ContextStale, "project settings revision changed or is unknown")
	}
	if !has(project.Settings.AllowedActions, scope.Action) {
		return projectError(apierrors.ApprovalRequired, "protected action is not approved in current project settings")
	}
	if has([]string{"start", "resume", "send", "stop", "claim_work_item"}, scope.Action) && !project.Settings.AllowAgentControl {
		return projectError(apierrors.ScopeDenied, "project Agent control is disabled")
	}
	for _, tool := range scope.Tools {
		if !has(project.Settings.AllowedTools, tool) {
			return projectError(apierrors.ScopeDenied, "protected tool is not approved in current project settings")
		}
	}
	for _, target := range scope.ExternalTargets {
		if !project.Settings.AllowsExternalModelCLI(target) {
			return projectError(apierrors.ScopeDenied, "external target is not the approved native model CLI")
		}
	}
	for _, root := range scope.Roots {
		if !project.Settings.AllowDirectory || !projectPathContains(project.Root, root) {
			return projectError(apierrors.ScopeDenied, "protected root exceeds current project directory permission")
		}
		allowed := false
		for _, subdir := range project.Settings.AllowedSubdirs {
			if filepath.IsAbs(subdir) {
				return projectError(apierrors.ScopeDenied, "approved project subdirectory must be relative")
			}
			base := filepath.Join(project.Root, subdir)
			if !projectPathContains(project.Root, base) {
				return projectError(apierrors.ScopeDenied, "approved subdirectory leaves the project")
			}
			if projectPathContains(base, root) {
				allowed = true
			}
		}
		if !allowed {
			return projectError(apierrors.ScopeDenied, "protected root is outside current approved subdirectories")
		}
	}
	return nil
}

// 调用方传入同一事务加载的 ProjectGrant；本函数不读取数据库或调用原生控制器。
// 人类安全停止先经过此身份检查，再由原 owned 控制器停止，不依赖执行批准。
func AuthorizeProjectActionCaller(project domain.LocalProject, caller domain.Caller, grant *domain.ProjectGrant, action string, now time.Time) error {
	if project.ID == "" || !projectActionKnown(action) {
		return projectError(apierrors.ScopeDenied, "caller action is outside the current project")
	}
	if caller.Kind == "human" && caller.ID != "" {
		return nil
	}
	if caller.Kind != "agent" || caller.ID == "" || caller.ProjectID != project.ID {
		return projectError(apierrors.ScopeDenied, "Agent identity is outside the current project")
	}
	if has([]string{"create_mission", "accept_artifact", "reject_artifact", "pause_mission", "cancel_mission", "recover_mission"}, action) {
		return projectError(apierrors.ScopeDenied, "protected action requires an authenticated human")
	}
	if grant == nil || grant.ProjectID != project.ID || grant.AgentID != caller.ID || now.IsZero() || grant.RevokedAt != nil || (grant.ExpiresAt != nil && !grant.ExpiresAt.After(now)) {
		return projectError(apierrors.ApprovalRevoked, "current project Agent grant is absent, expired or revoked")
	}
	if !has(grant.Actions, action) {
		return projectError(apierrors.ScopeDenied, "current project Agent grant does not allow this action")
	}
	return nil
}
