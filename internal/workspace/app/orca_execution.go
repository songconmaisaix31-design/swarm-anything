package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

// OrcaCommand 只包含产品允许的动作；身份和原生调用参数由宿主补充。
type OrcaCommand struct {
	Action     string `json:"action"`
	ProjectID  string `json:"project_id,omitempty"`
	Controller string `json:"controller,omitempty"`
	TaskID     string `json:"task_id,omitempty"`
	DispatchID string `json:"dispatch_id,omitempty"`
	RequestID  string `json:"request_id,omitempty"`
	Workdir    string `json:"workdir,omitempty"`
	SpecFile   string `json:"spec_file,omitempty"`
	InputFile  string `json:"input_file,omitempty"`
	ResultFile string `json:"result_file,omitempty"`
	OutputDir  string `json:"output_dir,omitempty"`
	Name       string `json:"name,omitempty"`
	Agent      string `json:"agent,omitempty"`
	Model      string `json:"model,omitempty"`
	Role       string `json:"role,omitempty"`
	Source     string `json:"source,omitempty"`
	Cursor     string `json:"cursor,omitempty"`
	Limit      int    `json:"limit,omitempty"`
}

type OrcaTaskSpec struct {
	Goal            string                `json:"goal"`
	SourceRepo      string                `json:"source_repo"`
	SourceRevision  string                `json:"source_revision"`
	SuccessCriteria []string              `json:"success_criteria"`
	MaxWorkers      int                   `json:"max_workers"`
	Context         domain.ContextRequest `json:"context"`
}

// OrcaScope 来自实际原生记录；调用者不能从 HTTP 正文提供这些证明。
type OrcaScope struct {
	ProjectID       string               `json:"project_id"`
	Controller      string               `json:"controller"`
	RunID           string               `json:"run_id"`
	RootTaskID      string               `json:"root_task_id"`
	AuthorityDomain string               `json:"authority_domain"`
	Context         domain.ContextPacket `json:"context"`
}

type OrcaInvocation struct {
	Command   OrcaCommand           `json:"command"`
	Caller    OrcaExecutionCaller   `json:"caller"`
	Project   domain.LocalProject   `json:"project"`
	Scope     OrcaScope             `json:"scope"`
	Spec      *OrcaTaskSpec         `json:"spec,omitempty"`
	Context   *domain.ContextPacket `json:"context,omitempty"`
	Input     *domain.ContextFile   `json:"input,omitempty"`
	Selection *OrcaAgentSelection   `json:"selection,omitempty"`
}

type OrcaCapabilityRequirements struct {
	SettingsRevision  int      `json:"settings_revision"`
	AllowDirectory    bool     `json:"allow_directory"`
	AllowedSubdirs    []string `json:"allowed_subdirs"`
	GrantActions      []string `json:"grant_actions"`
	AllowedActions    []string `json:"allowed_actions"`
	AllowedTools      []string `json:"allowed_tools"`
	ExternalModelCLI  string   `json:"external_model_cli"`
	AllowAgentControl bool     `json:"allow_agent_control"`
}

type OrcaAgentSettingsSource struct {
	Kind     string `json:"kind"`
	Path     string `json:"path,omitempty"`
	Revision *int64 `json:"revision,omitempty"`
}

type OrcaAgentSelection struct {
	AgentID              string                  `json:"agent_id"`
	Adapter              string                  `json:"adapter"`
	ExecutionMode        string                  `json:"execution_mode"`
	Executable           string                  `json:"executable"`
	Version              string                  `json:"version"`
	Model                string                  `json:"model"`
	Provider             string                  `json:"provider"`
	ExternalTarget       string                  `json:"external_target"`
	SettingsSource       OrcaAgentSettingsSource `json:"settings_source"`
	SettingsRevision     int64                   `json:"settings_revision"`
	ConfigurationVersion string                  `json:"configuration_version"`
	NativeLaunch         OrcaNativeLaunchPolicy  `json:"native_launch"`
}

type OrcaNativeConfigurationSource struct {
	Path    string `json:"path"`
	Version string `json:"version"`
}

type OrcaNativeModelTarget struct {
	ModelID string `json:"model_id"`
	API     string `json:"api"`
	BaseURL string `json:"base_url"`
}

type OrcaNativeLaunchAccount struct {
	Kind                string                         `json:"kind"`
	Provider            string                         `json:"provider"`
	SourceHome          string                         `json:"source_home"`
	AuthSource          OrcaNativeConfigurationSource  `json:"auth_source"`
	ModelsSource        *OrcaNativeConfigurationSource `json:"models_source"`
	PrivateHome         string                         `json:"private_home"`
	ModelTarget         OrcaNativeModelTarget          `json:"model_target"`
	ConfigSource        OrcaNativeConfigurationSource  `json:"config_source"`
	DatabaseSource      OrcaNativeConfigurationSource  `json:"database_source"`
	CredentialID        string                         `json:"credential_id"`
	CredentialUpdatedAt int64                          `json:"credential_updated_at"`
	PrivateRoot         string                         `json:"private_root"`
}

func nativeAccountFields(kind string) ([]string, error) {
	common := []string{"kind", "provider", "source_home", "auth_source", "model_target"}
	switch kind {
	case "pi-native-api-key":
		return append(common, "models_source", "private_home"), nil
	case "opencode-native-api-key":
		return append(common, "config_source", "database_source", "credential_id", "credential_updated_at", "private_root"), nil
	default:
		return nil, fmt.Errorf("unsupported native account kind %q", kind)
	}
}

func (account OrcaNativeLaunchAccount) MarshalJSON() ([]byte, error) {
	type wire OrcaNativeLaunchAccount
	fields, err := nativeAccountFields(account.Kind)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(wire(account))
	if err != nil {
		return nil, err
	}
	var all map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &all); err != nil {
		return nil, err
	}
	selected := make(map[string]json.RawMessage, len(fields))
	for _, field := range fields {
		selected[field] = all[field]
	}
	return json.Marshal(selected)
}

func (account *OrcaNativeLaunchAccount) UnmarshalJSON(data []byte) error {
	type wire OrcaNativeLaunchAccount
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	var kind string
	if err := json.Unmarshal(fields["kind"], &kind); err != nil {
		return err
	}
	allowed, err := nativeAccountFields(kind)
	if err != nil {
		return err
	}
	if len(fields) != len(allowed) {
		return errors.New("native account fields do not match their kind")
	}
	for _, field := range allowed {
		value, exists := fields[field]
		if !exists || field != "models_source" && bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return fmt.Errorf("native account field %s is missing", field)
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var decoded wire
	if err := decoder.Decode(&decoded); err != nil {
		return err
	}
	*account = OrcaNativeLaunchAccount(decoded)
	return nil
}

type OrcaNativeLaunchTools struct {
	Mode           string `json:"mode"`
	NativeContract string `json:"native_contract"`
}

type OrcaNativeLaunchPolicy struct {
	Schema  string                  `json:"schema"`
	Account OrcaNativeLaunchAccount `json:"account"`
	Tools   OrcaNativeLaunchTools   `json:"tools"`
}

type OrcaExecutionCaller struct {
	ID               string     `json:"id"`
	Kind             string     `json:"kind"`
	ProjectID        string     `json:"project_id"`
	SettingsRevision int        `json:"settings_revision"`
	GrantExpiresAt   *time.Time `json:"grant_expires_at,omitempty"`
}

type OrcaNativeError struct {
	Code           string `json:"code"`
	Message        string `json:"message"`
	Retryable      bool   `json:"retryable"`
	RequiredAction string `json:"required_action"`
	Data           any    `json:"data,omitempty"`
}

func (e *OrcaNativeError) Error() string { return e.Code + ": " + e.Message }

// Result 保留原生结果，不从进程存在或传输成功生成执行成功状态。
type OrcaEnvelope struct {
	OK              bool             `json:"ok"`
	RequestID       string           `json:"request_id,omitempty"`
	RuntimeID       string           `json:"runtime_id,omitempty"`
	AuthorityDomain string           `json:"authority_domain,omitempty"`
	Controller      string           `json:"controller,omitempty"`
	RunID           string           `json:"run_id,omitempty"`
	TaskID          string           `json:"task_id,omitempty"`
	DispatchID      string           `json:"dispatch_id,omitempty"`
	Result          any              `json:"result,omitempty"`
	Error           *OrcaNativeError `json:"error,omitempty"`
}

type OrcaExecutionRuntime interface {
	Capabilities(context.Context, string, OrcaCapabilityRequirements) (OrcaEnvelope, error)
	ResolveSelection(context.Context, string, OrcaCommand) (OrcaAgentSelection, error)
	ResolveScope(context.Context, string, OrcaCommand) (OrcaScope, error)
	Execute(context.Context, OrcaInvocation) (OrcaEnvelope, error)
}

// 关联只有来源和项目授权引用，执行状态继续由原生记录拥有。
type OrcaExecutionLink struct {
	ProjectID        string    `json:"project_id"`
	GrantAgentID     string    `json:"grant_agent_id"`
	SettingsRevision int       `json:"settings_revision"`
	AuthorityDomain  string    `json:"authority_domain"`
	RunID            string    `json:"run_id"`
	RootTaskID       string    `json:"root_task_id"`
	CreatedAt        time.Time `json:"created_at"`
}

type OrcaExecutionLinks interface {
	SaveOrcaExecutionLink(context.Context, OrcaExecutionLink) error
	LoadOrcaExecutionLink(context.Context, string, string) (OrcaExecutionLink, error)
}

type OrcaExecution interface {
	ExecuteOrca(context.Context, domain.Caller, OrcaCommand) (OrcaEnvelope, error)
	AdmitOrcaDelivery(context.Context, OrcaInvocation) (OrcaDeliveryAdmissionResult, error)
}

type OrcaDeliveryAdmissionResult struct {
	Schema           string     `json:"schema"`
	ProjectID        string     `json:"project_id"`
	RequestID        string     `json:"request_id"`
	SettingsRevision int        `json:"settings_revision"`
	GrantExpiresAt   *time.Time `json:"grant_expires_at,omitempty"`
}

type OrcaExecutionService struct {
	projects LocalProjectRepository
	files    ProjectFiles
	contexts LocalProjects
	runtime  OrcaExecutionRuntime
	links    OrcaExecutionLinks
}

func NewOrcaExecutionService(projects LocalProjectRepository, files ProjectFiles, contexts LocalProjects, runtime OrcaExecutionRuntime, links OrcaExecutionLinks) (*OrcaExecutionService, error) {
	if projects == nil || files == nil || contexts == nil || runtime == nil || links == nil {
		return nil, errors.New("Orca execution requires project, file, context, native runtime and association ports")
	}
	return &OrcaExecutionService{projects: projects, files: files, contexts: contexts, runtime: runtime, links: links}, nil
}

func orcaAction(action string) (permission string, mutation bool, ok bool) {
	switch action {
	case "status", "capabilities", "controller.show", "task.show", "task.list", "task.result", "worker.show", "worker.list", "worker.read", "request.show":
		return "observe", false, true
	case "controller.open", "controller.recover", "task.create", "worker.start":
		return "start", true, true
	case "worker.send", "task.complete":
		return "send", true, true
	case "controller.close", "worker.stop", "worker.release":
		return "stop", true, true
	default:
		return "", false, false
	}
}

// CLI 与 HTTP 共享字段及动作准入，调用者身份继续由实际服务核验。
func ValidateOrcaCommand(c OrcaCommand) error {
	_, mutation, known := orcaAction(c.Action)
	if !known {
		return projectError(apierrors.ValidationFailed, "unknown Swarm CLI action")
	}
	fields := map[string]string{
		"status": "", "capabilities": "",
		"controller.open": "workdir request_id", "controller.show": "controller", "controller.close": "controller request_id", "controller.recover": "controller request_id",
		"task.create": "controller spec_file request_id", "task.show": "controller task_id", "task.list": "controller",
		"task.complete": "controller task_id result_file request_id", "task.result": "controller task_id output_dir",
		"worker.start": "controller task_id name agent model role input_file request_id", "worker.list": "controller task_id",
		"worker.show": "controller dispatch_id", "worker.read": "controller dispatch_id source cursor limit",
		"worker.send": "controller dispatch_id input_file request_id", "worker.stop": "controller dispatch_id request_id",
		"worker.release": "controller dispatch_id request_id", "request.show": "controller request_id",
	}
	allowed := map[string]bool{"action": true, "project_id": true}
	for _, name := range strings.Fields(fields[c.Action]) {
		allowed[name] = true
	}
	body, err := json.Marshal(c)
	if err != nil {
		return err
	}
	var actual map[string]json.RawMessage
	if err := json.Unmarshal(body, &actual); err != nil {
		return err
	}
	for name := range actual {
		if !allowed[name] {
			return projectError(apierrors.ValidationFailed, "the action does not accept "+name)
		}
	}
	if mutation || c.Action == "request.show" {
		id, err := uuid.Parse(c.RequestID)
		if err != nil || id.String() != c.RequestID {
			return projectError(apierrors.ValidationFailed, "a canonical UUID request_id is required for mutations")
		}
	}
	if c.Action == "controller.open" {
		if c.ProjectID == "" || !filepath.IsAbs(c.Workdir) || c.Controller != "" {
			return projectError(apierrors.ValidationFailed, "controller open requires a project and absolute workdir")
		}
		return nil
	}
	if c.Action == "request.show" {
		if c.RequestID == "" || (c.Controller == "" && c.ProjectID == "") || (c.Controller != "" && c.ProjectID != "") {
			return projectError(apierrors.ValidationFailed, "request show requires request_id and exactly one of controller/project")
		}
		return nil
	}
	if c.Action == "status" || c.Action == "capabilities" {
		return nil
	}
	if c.Controller == "" {
		return projectError(apierrors.ValidationFailed, "controller is required")
	}
	if strings.HasPrefix(c.Action, "worker.") && c.Action != "worker.start" && c.Action != "worker.list" && c.DispatchID == "" {
		return projectError(apierrors.ValidationFailed, "dispatch_id is required")
	}
	if (strings.HasPrefix(c.Action, "task.") && c.Action != "task.create" && c.Action != "task.list") || c.Action == "worker.start" || c.Action == "worker.list" {
		if c.TaskID == "" {
			return projectError(apierrors.ValidationFailed, "task_id is required")
		}
	}
	if c.Action == "worker.start" && (strings.TrimSpace(c.Agent) == "" || strings.TrimSpace(c.Model) == "" || c.Name == "" || c.InputFile == "") {
		return projectError(apierrors.ValidationFailed, "worker start requires an explicit Agent, model, name and input file")
	}
	if c.Role != "" && !slices.Contains([]string{"developer", "reviewer", "coordinator"}, c.Role) {
		return projectError(apierrors.ValidationFailed, "unknown built-in Worker role")
	}
	if c.Action == "worker.send" && c.InputFile == "" {
		return projectError(apierrors.ValidationFailed, "input_file is required")
	}
	if c.Action == "worker.read" && (c.Source != "transcript" || c.Limit < 1 || c.Limit > 1000) {
		return projectError(apierrors.ValidationFailed, "read requires transcript source and limit between 1 and 1000")
	}
	if c.Action == "task.create" && c.SpecFile == "" || c.Action == "task.complete" && c.ResultFile == "" || c.Action == "task.result" && !filepath.IsAbs(c.OutputDir) {
		return projectError(apierrors.ValidationFailed, "the action requires its explicit file or absolute output directory")
	}
	return nil
}

func (s *OrcaExecutionService) authorize(ctx context.Context, caller domain.Caller, projectID, permission string, roots []string, externalTarget string) (domain.LocalProject, error) {
	p, err := s.projects.LoadProject(ctx, projectID)
	if err != nil {
		return p, err
	}
	var grant *domain.ProjectGrant
	if caller.Kind == "agent" {
		g, err := s.projects.LoadGrant(ctx, projectID, caller.ID)
		if err != nil {
			return p, err
		}
		grant = &g
	}
	if err := AuthorizeProjectActionCaller(p, caller, grant, permission, time.Now().UTC()); err != nil {
		return p, err
	}
	if caller.Kind == "human" && permission == "stop" {
		return p, nil
	}
	scope := ProjectActionScope{ProjectID: p.ID, SettingsRevision: p.Settings.Revision, Action: permission, Roots: roots}
	if externalTarget != "" {
		scope.ExternalTargets = []string{externalTarget}
	}
	return p, ValidateProjectActionScope(p, scope)
}

func (s *OrcaExecutionService) readInput(ctx context.Context, p domain.LocalProject, path string) (domain.ContextFile, error) {
	var result domain.ContextFile
	if filepath.IsAbs(path) {
		rel, err := filepath.Rel(p.Root, path)
		if err != nil {
			return result, err
		}
		path = rel
	}
	files, err := s.files.ReadProjectFiles(ctx, p, []string{path})
	if err != nil {
		return result, err
	}
	if len(files) != 1 || files[0].Version == "" || !utf8.ValidString(files[0].Text) || strings.TrimSpace(files[0].Text) == "" {
		return result, projectError(apierrors.ValidationFailed, "the explicit UTF-8 input file is empty or unavailable")
	}
	return files[0], nil
}

func (s *OrcaExecutionService) ExecuteOrca(ctx context.Context, caller domain.Caller, command OrcaCommand) (OrcaEnvelope, error) {
	var reply OrcaEnvelope
	if err := ValidateOrcaCommand(command); err != nil {
		return reply, err
	}
	permission, _, _ := orcaAction(command.Action)
	safeHumanStop := caller.Kind == "human" && permission == "stop"
	projectID := command.ProjectID
	if projectID == "" {
		projectID = caller.ProjectID
	}
	if projectID == "" {
		return reply, projectError(apierrors.ScopeDenied, "a current project-scoped caller is required")
	}
	model := command.Action == "worker.start" || command.Action == "worker.send"
	initialPermission := permission
	if model {
		initialPermission = "observe"
	}
	p, err := s.authorize(ctx, caller, projectID, initialPermission, nil, "")
	if err != nil {
		return reply, err
	}
	invocation := OrcaInvocation{Command: command, Project: p, Caller: OrcaExecutionCaller{ID: caller.ID, Kind: caller.Kind, ProjectID: projectID, SettingsRevision: p.Settings.Revision}}
	if model && caller.Kind == "agent" {
		grant, err := s.projects.LoadGrant(ctx, projectID, caller.ID)
		if err != nil {
			return reply, err
		}
		invocation.Caller.GrantExpiresAt = grant.ExpiresAt
		if err := s.checkOriginalOrcaGrant(ctx, invocation.Caller); err != nil {
			return reply, err
		}
	}
	if command.Action == "capabilities" {
		requirements := OrcaCapabilityRequirements{SettingsRevision: p.Settings.Revision, AllowDirectory: p.Settings.AllowDirectory, AllowedSubdirs: p.Settings.AllowedSubdirs, AllowedActions: p.Settings.AllowedActions, AllowedTools: p.Settings.AllowedTools, ExternalModelCLI: p.Settings.ExternalModelCLI, AllowAgentControl: p.Settings.AllowAgentControl}
		if caller.Kind == "agent" {
			grant, err := s.projects.LoadGrant(ctx, projectID, caller.ID)
			if err != nil {
				return reply, err
			}
			requirements.GrantActions = grant.Actions
		}
		reply, err := s.runtime.Capabilities(ctx, projectID, requirements)
		if err != nil {
			return reply, err
		}
		current, err := s.authorize(ctx, caller, projectID, permission, nil, "")
		if err != nil {
			return reply, err
		}
		if current.Settings.Revision != p.Settings.Revision {
			return reply, projectError(apierrors.ContextStale, "project settings changed during native discovery")
		}
		if caller.Kind == "agent" {
			grant, err := s.projects.LoadGrant(ctx, projectID, caller.ID)
			if err != nil {
				return reply, err
			}
			if !slices.Equal(requirements.GrantActions, grant.Actions) {
				return reply, projectError(apierrors.ContextStale, "project grant changed during native discovery")
			}
		}
		if !reply.OK || reply.RuntimeID == "" || reply.AuthorityDomain == "" || reply.Error != nil {
			return reply, projectError(apierrors.EvidenceMissing, "native discovery omitted its runtime provenance")
		}
		return reply, nil
	}
	var externalTarget string
	if model {
		selection, err := s.runtime.ResolveSelection(ctx, projectID, command)
		if err != nil {
			return reply, err
		}
		if selection.AgentID == "" || selection.ExternalTarget != selection.AgentID || selection.Executable == "" || selection.Version == "" || selection.Model == "" || selection.Provider == "" || selection.ConfigurationVersion == "" || command.Action == "worker.start" && (selection.AgentID != command.Agent || selection.Model != command.Model) {
			return reply, projectError(apierrors.EvidenceMissing, "native selection does not prove the requested Agent and model")
		}
		if err := validateOrcaNativeLaunch(selection, projectID); err != nil {
			return reply, err
		}
		externalTarget = selection.ExternalTarget
		current, err := s.authorize(ctx, caller, projectID, permission, nil, externalTarget)
		if err != nil {
			return reply, err
		}
		if current.Settings.Revision != p.Settings.Revision {
			return reply, projectError(apierrors.ContextStale, "project settings changed during native selection")
		}
		invocation.Selection = &selection
	}
	if command.Action == "controller.open" {
		root, err := s.files.CanonicalRoot(command.Workdir)
		if err != nil {
			return reply, err
		}
		p, err = s.authorize(ctx, caller, projectID, permission, []string{root}, "")
		if err != nil {
			return reply, err
		}
		invocation.Command.Workdir = root
		invocation.Project = p
	} else if command.Controller != "" && command.Action != "request.show" {
		scope, err := s.runtime.ResolveScope(ctx, projectID, command)
		if err != nil {
			return reply, err
		}
		if scope.ProjectID != projectID || scope.Controller != command.Controller || scope.AuthorityDomain == "" {
			return reply, projectError(apierrors.ScopeDenied, "native controller scope does not match the current project")
		}
		invocation.Scope = scope
		if scope.Context.ProjectID != "" && (scope.Context.ProjectID != projectID || !safeHumanStop && scope.Context.SettingsRevision != p.Settings.Revision) {
			return reply, projectError(apierrors.ContextStale, "the fixed task context no longer matches current project permissions")
		}
	}
	if command.Action == "task.create" {
		file, err := s.readInput(ctx, p, command.SpecFile)
		if err != nil {
			return reply, err
		}
		var spec OrcaTaskSpec
		if !json.Valid([]byte(file.Text)) {
			return reply, projectError(apierrors.ValidationFailed, "task specification must contain exactly one JSON object")
		}
		decoder := json.NewDecoder(bytes.NewBufferString(file.Text))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&spec); err != nil {
			return reply, fmt.Errorf("decode task specification: %w", err)
		}
		if strings.TrimSpace(spec.Goal) == "" || spec.SourceRepo == "" || spec.SourceRevision == "" || len(spec.SuccessCriteria) == 0 || spec.MaxWorkers != 2 {
			return reply, projectError(apierrors.ValidationFailed, "task specification requires goal, source revision, success criteria and max_workers=2")
		}
		packet, err := s.contexts.ReadProjectContext(ctx, caller, projectID, spec.Context)
		if err != nil {
			return reply, err
		}
		invocation.Spec, invocation.Context = &spec, &packet
	}
	var outputRoot string
	if command.Action == "task.result" {
		parent, err := s.files.CanonicalRoot(filepath.Dir(command.OutputDir))
		if err != nil {
			return reply, err
		}
		if filepath.Base(command.OutputDir) == "." || filepath.Base(command.OutputDir) == ".." || filepath.Clean(command.OutputDir) == filepath.Dir(filepath.Clean(command.OutputDir)) {
			return reply, projectError(apierrors.ValidationFailed, "result export requires a new named directory")
		}
		if _, err := s.authorize(ctx, caller, projectID, permission, []string{parent}, ""); err != nil {
			return reply, err
		}
		outputRoot = parent
		invocation.Command.OutputDir = filepath.Join(parent, filepath.Base(command.OutputDir))
	}
	inputPath := command.InputFile
	if command.Action == "task.complete" {
		inputPath = command.ResultFile
	}
	if inputPath != "" {
		file, err := s.readInput(ctx, p, inputPath)
		if err != nil {
			return reply, err
		}
		invocation.Input = &file
	}
	// 文件读取和原生观察之后再次核准，撤销不能沿旧预检继续输入。
	var finalRoots []string
	if outputRoot != "" {
		finalRoots = []string{outputRoot}
	}
	current, err := s.authorize(ctx, caller, projectID, permission, finalRoots, externalTarget)
	if err != nil {
		return reply, err
	}
	if !safeHumanStop && current.Settings.Revision != p.Settings.Revision {
		return reply, projectError(apierrors.ContextStale, "project settings changed while preparing the original command")
	}
	if model {
		if err := s.checkOriginalOrcaGrant(ctx, invocation.Caller); err != nil {
			return reply, err
		}
	}
	reply, err = s.runtime.Execute(ctx, invocation)
	if err != nil {
		return reply, err
	}
	if reply.Error != nil {
		return reply, reply.Error
	}
	if !reply.OK || reply.RuntimeID == "" || reply.AuthorityDomain == "" {
		return reply, projectError(apierrors.DeliveryUnknown, "native response lacks a verifiable runtime result")
	}
	if command.Action == "task.create" {
		if reply.RunID == "" || reply.TaskID == "" {
			return reply, projectError(apierrors.DeliveryUnknown, "native task creation lacks its exact Run/root Task identity")
		}
		link := OrcaExecutionLink{ProjectID: projectID, GrantAgentID: caller.ID, SettingsRevision: p.Settings.Revision, AuthorityDomain: reply.AuthorityDomain, RunID: reply.RunID, RootTaskID: reply.TaskID, CreatedAt: time.Now().UTC()}
		if err := s.links.SaveOrcaExecutionLink(ctx, link); err != nil {
			return reply, &apierrors.ServiceError{Code: apierrors.DeliveryUnknown, Message: "native task exists; saving the project association failed: " + err.Error(), RequestID: command.RequestID, RequiredAction: "inspect_original_request_and_native_run"}
		}
	}
	return reply, nil
}

func validateOrcaNativeLaunch(selection OrcaAgentSelection, projectID string) error {
	policy := selection.NativeLaunch
	account := policy.Account
	target := account.ModelTarget
	if account.Kind == "opencode-native-api-key" {
		if policy.Schema != "swa.native-launch.v1" || policy.Tools.Mode != "disabled" || policy.Tools.NativeContract != "opencode-cli-2.0.31" || selection.AgentID != "opencode" || selection.Version != "2.0.31" || selection.ExecutionMode != "structured" || account.Provider != "deepseek" || selection.Provider != "deepseek" || selection.Model != "deepseek/deepseek-v4-pro" || target.ModelID != "deepseek-v4-pro" || target.API != "opencode-native-deepseek" || target.BaseURL != "https://api.deepseek.com" || account.CredentialID == "" || account.CredentialUpdatedAt < 0 || account.PrivateHome != "" || account.ModelsSource != nil {
			return projectError(apierrors.EvidenceMissing, "the selected native OpenCode account and disabled-tool policy are unverified")
		}
		if !filepath.IsAbs(account.SourceHome) || !filepath.IsAbs(account.PrivateRoot) || filepath.Base(account.PrivateRoot) != projectID || filepath.Base(filepath.Dir(account.PrivateRoot)) != "opencode" || account.AuthSource.Path != filepath.Join(account.SourceHome, ".local", "share", "opencode", "auth.json") || account.ConfigSource.Path != filepath.Join(account.SourceHome, ".config", "opencode", "opencode.jsonc") || account.DatabaseSource.Path != filepath.Join(account.SourceHome, ".local", "share", "opencode", "opencode.db") || account.AuthSource.Version == "" || account.ConfigSource.Version == "" || account.DatabaseSource.Version == "" {
			return projectError(apierrors.EvidenceMissing, "the selected native OpenCode sources and project root are incomplete")
		}
		return nil
	}
	endpoint, err := url.Parse(target.BaseURL)
	if policy.Schema != "swa.native-launch.v1" || policy.Tools.Mode != "disabled" || policy.Tools.NativeContract != "pi-cli-1.0.1" || selection.AgentID != "pi" || selection.Version != "1.0.1" || selection.ExecutionMode != "structured" || account.Kind != "pi-native-api-key" || account.Provider != selection.Provider || target.ModelID == "" || selection.Model != account.Provider+"/"+target.ModelID || !slices.Contains([]string{"openai-responses", "openai-completions", "azure-openai-responses"}, target.API) || err != nil || endpoint.Host == "" || (endpoint.Scheme != "https" && endpoint.Scheme != "http") || endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" {
		return projectError(apierrors.EvidenceMissing, "the selected native account and disabled-tool policy are unverified")
	}
	if !filepath.IsAbs(account.SourceHome) || !filepath.IsAbs(account.PrivateHome) || filepath.Base(account.PrivateHome) != projectID || filepath.Base(filepath.Dir(account.PrivateHome)) != "pi" || account.AuthSource.Version == "" || account.AuthSource.Path != filepath.Join(account.SourceHome, "auth.json") || account.ModelsSource != nil && (account.ModelsSource.Version == "" || account.ModelsSource.Path != filepath.Join(account.SourceHome, "models.json")) {
		return projectError(apierrors.EvidenceMissing, "the selected native account source and project home are incomplete")
	}
	return nil
}

// 效果前准入只读取当前批准、原Run关联和原上下文，不调用Native端口。
func (s *OrcaExecutionService) AdmitOrcaDelivery(ctx context.Context, invocation OrcaInvocation) (OrcaDeliveryAdmissionResult, error) {
	var result OrcaDeliveryAdmissionResult
	command := invocation.Command
	if err := ValidateOrcaCommand(command); err != nil {
		return result, err
	}
	if command.Action != "worker.start" && command.Action != "worker.send" {
		return result, projectError(apierrors.ScopeDenied, "delivery admission requires an original Worker input")
	}
	actor, scope := invocation.Caller, invocation.Scope
	if actor.ID == "" || actor.ProjectID == "" || actor.ProjectID != invocation.Project.ID || actor.ProjectID != scope.ProjectID || actor.SettingsRevision < 1 || scope.Controller == "" || scope.Controller != command.Controller || scope.RunID == "" || scope.RootTaskID == "" || scope.AuthorityDomain == "" || (actor.Kind != "agent" && actor.Kind != "human") {
		return result, projectError(apierrors.ScopeDenied, "the original Worker delivery association is incomplete")
	}
	selection := invocation.Selection
	if selection == nil || selection.ExternalTarget != selection.AgentID || selection.Executable == "" || selection.ConfigurationVersion == "" || command.Action == "worker.start" && (command.Agent != selection.AgentID || command.Model != selection.Model) {
		return result, projectError(apierrors.EvidenceMissing, "the original native selection is incomplete")
	}
	if err := validateOrcaNativeLaunch(*selection, actor.ProjectID); err != nil {
		return result, err
	}
	caller := domain.Caller{ID: actor.ID, Kind: actor.Kind, ProjectID: actor.ProjectID}
	permission, _, _ := orcaAction(command.Action)
	project, err := s.authorize(ctx, caller, actor.ProjectID, permission, nil, selection.ExternalTarget)
	if err != nil {
		return result, err
	}
	if project.Settings.Revision != actor.SettingsRevision || project.Root != invocation.Project.Root || scope.Context.ProjectID != project.ID || scope.Context.SettingsRevision != project.Settings.Revision {
		return result, projectError(apierrors.ContextStale, "the original delivery project or context changed")
	}
	link, err := s.links.LoadOrcaExecutionLink(ctx, scope.AuthorityDomain, scope.RunID)
	if err != nil {
		return result, err
	}
	if link.ProjectID != project.ID || link.GrantAgentID != actor.ID || link.SettingsRevision != project.Settings.Revision || link.AuthorityDomain != scope.AuthorityDomain || link.RunID != scope.RunID || link.RootTaskID != scope.RootTaskID {
		return result, projectError(apierrors.ScopeDenied, "the saved native Run association changed")
	}
	if err := s.checkOriginalOrcaGrant(ctx, actor); err != nil {
		return result, err
	}
	if invocation.Input == nil || invocation.Input.Version == "" {
		return result, projectError(apierrors.EvidenceMissing, "the original Worker input is unavailable")
	}
	input, err := s.readInput(ctx, project, invocation.Input.Path)
	if err != nil {
		return result, err
	}
	if input != *invocation.Input {
		return result, projectError(apierrors.ContextStale, "the original Worker input file changed")
	}
	request := domain.ContextRequest{}
	for _, material := range scope.Context.Materials {
		if !material.Expanded {
			request.References = append(request.References, material.Reference)
		}
	}
	for _, file := range scope.Context.Files {
		request.Files = append(request.Files, file.Path)
	}
	currentContext, err := s.contexts.ReadProjectContext(ctx, caller, project.ID, request)
	if err != nil {
		return result, err
	}
	if currentContext.ProjectID != scope.Context.ProjectID || currentContext.SettingsRevision != scope.Context.SettingsRevision || !reflect.DeepEqual(currentContext.Files, scope.Context.Files) || !reflect.DeepEqual(currentContext.Materials, scope.Context.Materials) {
		return result, projectError(apierrors.ContextStale, "the original fixed delivery context changed")
	}
	current, err := s.authorize(ctx, caller, project.ID, permission, nil, selection.ExternalTarget)
	if err != nil {
		return result, err
	}
	if current.Settings.Revision != actor.SettingsRevision || current.Root != project.Root {
		return result, projectError(apierrors.ContextStale, "delivery approval changed while reading its sources")
	}
	if err := s.checkOriginalOrcaGrant(ctx, actor); err != nil {
		return result, err
	}
	return OrcaDeliveryAdmissionResult{Schema: "swa.delivery-admission.v1", ProjectID: project.ID, RequestID: command.RequestID, SettingsRevision: current.Settings.Revision, GrantExpiresAt: actor.GrantExpiresAt}, nil
}

func (s *OrcaExecutionService) checkOriginalOrcaGrant(ctx context.Context, caller OrcaExecutionCaller) error {
	if caller.Kind == "human" {
		if caller.GrantExpiresAt != nil {
			return projectError(apierrors.ScopeDenied, "a human delivery cannot carry an Agent grant identity")
		}
		return nil
	}
	grant, err := s.projects.LoadGrant(ctx, caller.ProjectID, caller.ID)
	if err != nil {
		return err
	}
	if caller.GrantExpiresAt == nil || grant.ExpiresAt == nil || !grant.ExpiresAt.Equal(*caller.GrantExpiresAt) || !grant.ExpiresAt.After(time.Now().UTC()) || grant.RevokedAt != nil || grant.TokenDigest == "" {
		return projectError(apierrors.ApprovalRevoked, "the original delivery credential expired or its grant changed")
	}
	return nil
}
