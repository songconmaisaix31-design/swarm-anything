package app

import (
	"context"
	"math"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

type OrcaProjectToolOrigin struct {
	Agent            string `json:"agent"`
	NativeSessionID  string `json:"native_session_id"`
	AssistantEntryID string `json:"assistant_entry_id,omitempty"`
	MessageID        string `json:"message_id,omitempty"`
	ToolCallID       string `json:"tool_call_id"`
}

type OrcaProjectToolInput struct {
	Command    string   `json:"command"`
	Timeout    *float64 `json:"timeout,omitempty"`
	Workdir    *string  `json:"workdir,omitempty"`
	Background *bool    `json:"background,omitempty"`
}

type OrcaNativeProjectTool struct {
	Schema         string                `json:"schema"`
	StartRequestID string                `json:"start_request_id"`
	RequestID      string                `json:"request_id"`
	SessionID      string                `json:"session_id"`
	DispatchID     string                `json:"dispatch_id"`
	TaskID         string                `json:"task_id"`
	Origin         OrcaProjectToolOrigin `json:"origin"`
	Input          OrcaProjectToolInput  `json:"input"`
	Cwd            string                `json:"cwd"`
}

func fixedOrcaToolSource(source *OrcaNativeConfigurationSource, name string) bool {
	return source != nil && filepath.IsAbs(source.Path) && filepath.Clean(source.Path) == source.Path && filepath.Base(source.Path) == name && filepath.Base(filepath.Dir(source.Path)) == "runtime" && source.Version != ""
}

func validateOrcaProjectTool(invocation OrcaInvocation) error {
	command, source := invocation.Command, invocation.NativeProjectTool
	if source == nil || source.Schema != "swa.native-project-tool.v1" || command.Action != "worker.send" || invocation.Input == nil || invocation.Selection == nil || invocation.Selection.NativeLaunch.Tools.Mode != "project" || invocation.QuestionAsk != nil || invocation.NativeDelegation != nil || invocation.NativeSessionObservation != nil || invocation.Handoff != nil || invocation.Submission != nil {
		return projectError(apierrors.ScopeDenied, "native project tools require their exclusive original Worker binding")
	}
	for _, value := range []string{source.StartRequestID, source.RequestID} {
		id, err := uuid.Parse(value)
		if err != nil || id.String() != value {
			return projectError(apierrors.ScopeDenied, "native project tools require canonical original request identities")
		}
	}
	if source.StartRequestID == source.RequestID || command.RequestID != source.RequestID || command.DispatchID != source.DispatchID || source.TaskID == invocation.Scope.RootTaskID {
		return projectError(apierrors.ScopeDenied, "native project tool request or Worker task binding changed")
	}
	for _, value := range []string{source.SessionID, source.DispatchID, source.TaskID, source.Origin.NativeSessionID, source.Origin.ToolCallID} {
		if strings.TrimSpace(value) == "" || !utf8.ValidString(value) || utf8.RuneCountInString(value) > 512 {
			return projectError(apierrors.ScopeDenied, "native project tool identity is incomplete")
		}
	}
	if source.Origin.Agent != invocation.Selection.AgentID || source.Origin.Agent != "pi" && source.Origin.Agent != "opencode" {
		return projectError(apierrors.ScopeDenied, "native project tool Agent differs from its original selection")
	}
	if strings.TrimSpace(source.Input.Command) == "" || !utf8.ValidString(source.Input.Command) || len(source.Input.Command) > 128*1024 || strings.ContainsRune(source.Input.Command, 0) {
		return projectError(apierrors.ValidationFailed, "native project command must be nonblank UTF-8 text within 128 KiB")
	}
	if command.InputFile != "native-project-tool:"+source.RequestID || invocation.Input.Path != command.InputFile || invocation.Input.Version != source.RequestID || invocation.Input.Text != source.Input.Command {
		return projectError(apierrors.ScopeDenied, "native project tool input differs from its actual command")
	}
	if !filepath.IsAbs(source.Cwd) || filepath.Clean(source.Cwd) != source.Cwd {
		return projectError(apierrors.ScopeDenied, "native project tool requires its canonical working directory")
	}
	if timeout := source.Input.Timeout; timeout != nil && (math.IsNaN(*timeout) || math.IsInf(*timeout, 0)) {
		return projectError(apierrors.ValidationFailed, "native project command timeout must be finite")
	}
	if source.Origin.Agent == "pi" {
		nativeID, err := uuid.Parse(source.Origin.NativeSessionID)
		if err != nil || nativeID.String() != source.Origin.NativeSessionID || nativeID.Version() != 7 || source.Origin.MessageID != "" || strings.TrimSpace(source.Origin.AssistantEntryID) == "" || !utf8.ValidString(source.Origin.AssistantEntryID) || utf8.RuneCountInString(source.Origin.AssistantEntryID) > 64 || source.Input.Workdir != nil || source.Input.Background != nil {
			return projectError(apierrors.ScopeDenied, "Pi project tool origin or parameters do not match its native contract")
		}
		if timeout := source.Input.Timeout; timeout != nil && (*timeout <= 0 || *timeout*1000 > 2147483647) {
			return projectError(apierrors.ValidationFailed, "Pi command timeout must be positive seconds within its timer bound")
		}
	} else {
		if source.Origin.AssistantEntryID != "" || strings.TrimSpace(source.Origin.MessageID) == "" || !utf8.ValidString(source.Origin.MessageID) || utf8.RuneCountInString(source.Origin.MessageID) > 512 || source.Input.Background != nil && *source.Input.Background {
			return projectError(apierrors.ScopeDenied, "OpenCode project tool origin or background setting is unsupported")
		}
		if timeout := source.Input.Timeout; timeout != nil && (*timeout < 0 || *timeout > 2147483647 || math.Trunc(*timeout) != *timeout) {
			return projectError(apierrors.ValidationFailed, "OpenCode command timeout must be integer milliseconds within its timer bound")
		}
		if workdir := source.Input.Workdir; workdir != nil && (strings.TrimSpace(*workdir) == "" || !utf8.ValidString(*workdir) || utf8.RuneCountInString(*workdir) > 4096) {
			return projectError(apierrors.ValidationFailed, "OpenCode command workdir must be a nonblank path within its bound")
		}
	}
	return nil
}

func (s *OrcaExecutionService) authorizeOrcaProjectTools(ctx context.Context, caller domain.Caller, project domain.LocalProject, targets ...string) ([]string, error) {
	for _, action := range []string{"read_context", "start", "send"} {
		current, err := s.authorize(ctx, caller, project.ID, action, nil, "")
		if err != nil {
			return nil, err
		}
		if current.Settings.Revision != project.Settings.Revision || current.Root != project.Root {
			return nil, projectError(apierrors.ContextStale, "native project tool approval changed")
		}
		if err := ValidateProjectActionScope(current, ProjectActionScope{ProjectID: project.ID, SettingsRevision: project.Settings.Revision, Action: action, Tools: []string{"project_shell"}, ExternalTargets: targets}); err != nil {
			return nil, err
		}
	}
	root, err := s.files.CanonicalRoot(project.Root)
	if err != nil || root != project.Root || !project.Settings.AllowDirectory || len(project.Settings.AllowedSubdirs) == 0 {
		return nil, projectError(apierrors.ScopeDenied, "native project tools require a current explicit project directory scope")
	}
	roots := []string{}
	for _, subdir := range project.Settings.AllowedSubdirs {
		path, err := s.files.ValidateProjectPath(root, subdir)
		if err != nil {
			return nil, err
		}
		directory, err := s.files.CanonicalRoot(path)
		if err != nil || directory != path {
			return nil, projectError(apierrors.ScopeDenied, "native project writable root is unavailable or redirected")
		}
		if err := ValidateProjectActionScope(project, ProjectActionScope{ProjectID: project.ID, SettingsRevision: project.Settings.Revision, Action: "start", Roots: []string{directory}, Tools: []string{"project_shell"}, ExternalTargets: targets}); err != nil {
			return nil, err
		}
		roots = append(roots, directory)
	}
	return roots, nil
}

func (s *OrcaExecutionService) validateOrcaProjectToolCwd(project domain.LocalProject, source OrcaNativeProjectTool) error {
	actual, err := s.files.CanonicalRoot(source.Cwd)
	if err != nil || actual != source.Cwd {
		return projectError(apierrors.ScopeDenied, "native project command directory differs from its approved source")
	}
	if workdir := source.Input.Workdir; workdir != nil && filepath.IsAbs(*workdir) {
		requested, err := s.files.CanonicalRoot(*workdir)
		if err != nil || requested != source.Cwd {
			return projectError(apierrors.ScopeDenied, "native project command directory differs from its absolute workdir")
		}
	}
	// 相对 workdir 的基准由原生 workspace 来源绑定；此处只核实际目录与当前许可。
	relative, err := filepath.Rel(project.Root, source.Cwd)
	if err != nil {
		return projectError(apierrors.ScopeDenied, "native project command directory leaves its project")
	}
	checked, err := s.files.ValidateProjectPath(project.Root, relative)
	if err != nil || checked != source.Cwd {
		return projectError(apierrors.ScopeDenied, "native project command directory is redirected or outside the project")
	}
	return ValidateProjectActionScope(project, ProjectActionScope{ProjectID: project.ID, SettingsRevision: project.Settings.Revision, Action: "start", Roots: []string{source.Cwd}, Tools: []string{"project_shell"}})
}

func validateOrcaHistoricalFiles(project domain.LocalProject, packet domain.ContextPacket) error {
	// 只核已接受快照的路径许可；合法编辑、删除与重命名不改变历史输入正文。
	for _, file := range packet.Files {
		if file.Path == "" || filepath.IsAbs(file.Path) || strings.Contains(file.Path, ":") {
			return projectError(apierrors.ScopeDenied, "historical project context contains an invalid source path")
		}
		if err := ValidateProjectActionScope(project, ProjectActionScope{ProjectID: project.ID, SettingsRevision: packet.SettingsRevision, Action: "read_context", Roots: []string{filepath.Join(project.Root, file.Path)}}); err != nil {
			return err
		}
	}
	return nil
}
