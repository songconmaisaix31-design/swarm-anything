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

// 完整成果需要承载多Worker原件，其余动作保留较小的响应界。
func OrcaResponseByteLimit(action string) int64 {
	if action == "task.result" || action == "run.export" {
		return 128 * 1024 * 1024
	}
	return 16 * 1024 * 1024
}

// OrcaCommand 只包含产品允许的动作；身份和原生调用参数由宿主补充。
type OrcaCommand struct {
	Action             string                      `json:"action"`
	ProjectID          string                      `json:"project_id,omitempty"`
	Controller         string                      `json:"controller,omitempty"`
	RunID              string                      `json:"run_id,omitempty"`
	TaskID             string                      `json:"task_id,omitempty"`
	DispatchID         string                      `json:"dispatch_id,omitempty"`
	QuestionID         string                      `json:"question_id,omitempty"`
	QuestionMode       string                      `json:"question_mode,omitempty"`
	DelegationMode     string                      `json:"delegation_mode,omitempty"`
	DevelopmentMode    string                      `json:"development_mode,omitempty"`
	MorphConfig        string                      `json:"morph_config,omitempty"`
	RequestID          string                      `json:"request_id,omitempty"`
	Workdir            string                      `json:"workdir,omitempty"`
	SpecFile           string                      `json:"spec_file,omitempty"`
	InputFile          string                      `json:"input_file,omitempty"`
	ResultFile         string                      `json:"result_file,omitempty"`
	OutputDir          string                      `json:"output_dir,omitempty"`
	ExportMode         string                      `json:"export_mode,omitempty"`
	Name               string                      `json:"name,omitempty"`
	Agent              string                      `json:"agent,omitempty"`
	Model              string                      `json:"model,omitempty"`
	Source             string                      `json:"source,omitempty"`
	Cursor             string                      `json:"cursor,omitempty"`
	Limit              int                         `json:"limit,omitempty"`
	ParentTaskID       string                      `json:"parent_task_id,omitempty"`
	HandoffMode        string                      `json:"handoff_mode,omitempty"`
	ReplyMode          string                      `json:"reply_mode,omitempty"`
	CompletionCriteria []string                    `json:"completion_criteria,omitempty"`
	RoleID             string                      `json:"role_id,omitempty"`
	ConversationID     string                      `json:"conversation_id,omitempty"`
	Revision           int64                       `json:"revision,omitempty"`
	Role               *OrcaRoleDefinition         `json:"role,omitempty"`
	Conversation       *OrcaConversationDefinition `json:"conversation,omitempty"`
	Text               string                      `json:"text,omitempty"`
}

type OrcaRoleDefinition struct {
	Name             string   `json:"name"`
	Responsibilities string   `json:"responsibilities"`
	DefaultAgent     string   `json:"default_agent"`
	DefaultModel     string   `json:"default_model"`
	QuestionMode     string   `json:"question_mode,omitempty"`
	DelegationMode   string   `json:"delegation_mode,omitempty"`
	DevelopmentMode  string   `json:"development_mode,omitempty"`
	Skills           []string `json:"skills"`
	Knowledge        []string `json:"knowledge"`
}

type OrcaConversationDefinition struct {
	Title  string `json:"title"`
	RoleID string `json:"role_id,omitempty"`
}

type OrcaTaskSpec struct {
	Goal            string                `json:"goal"`
	SourceRepo      string                `json:"source_repo"`
	SourceRevision  string                `json:"source_revision"`
	SuccessCriteria []string              `json:"success_criteria"`
	MaxWorkers      int64                 `json:"max_workers"`
	InitialWorkers  *int64                `json:"initial_workers,omitempty"`
	Context         domain.ContextRequest `json:"context"`
	ConversationID  string                `json:"conversation_id,omitempty"`
	RoleID          string                `json:"role_id,omitempty"`
	RoleRevision    int64                 `json:"role_revision,omitempty"`
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

func validateOrcaTaskSpec(spec OrcaTaskSpec) error {
	if strings.TrimSpace(spec.Goal) == "" || spec.SourceRepo == "" || spec.SourceRevision == "" || len(spec.SuccessCriteria) == 0 || spec.MaxWorkers < 1 || spec.MaxWorkers > 9007199254740991 {
		return projectError(apierrors.ValidationFailed, "task specification requires goal, source revision, success criteria and a positive safe-integer max_workers")
	}
	if spec.InitialWorkers != nil && (*spec.InitialWorkers < 1 || *spec.InitialWorkers > spec.MaxWorkers) {
		return projectError(apierrors.ValidationFailed, "initial_workers must be within the approved Worker capacity")
	}
	if spec.RoleID == "" && spec.RoleRevision != 0 || spec.RoleID != "" && (spec.RoleRevision < 1 || spec.RoleRevision > 9007199254740991) {
		return projectError(apierrors.ValidationFailed, "a task role requires its exact positive revision")
	}
	return nil
}

type OrcaInvocation struct {
	Command                  OrcaCommand                   `json:"command"`
	Caller                   OrcaExecutionCaller           `json:"caller"`
	Project                  domain.LocalProject           `json:"project"`
	Scope                    OrcaScope                     `json:"scope"`
	Spec                     *OrcaTaskSpec                 `json:"spec,omitempty"`
	Context                  *domain.ContextPacket         `json:"context,omitempty"`
	Input                    *domain.ContextFile           `json:"input,omitempty"`
	Selection                *OrcaAgentSelection           `json:"selection,omitempty"`
	Submission               *OrcaRunSubmission            `json:"submission,omitempty"`
	Handoff                  *OrcaHandoffResume            `json:"handoff,omitempty"`
	QuestionAsk              *OrcaQuestionAsk              `json:"question_ask,omitempty"`
	NativeDelegation         *OrcaNativeDelegation         `json:"native_delegation,omitempty"`
	NativeProjectTool        *OrcaNativeProjectTool        `json:"native_project_tool,omitempty"`
	NativeSessionObservation *OrcaNativeSessionObservation `json:"native_session_observation,omitempty"`
}

type OrcaNativeSessionObservation struct {
	Schema         string `json:"schema"`
	StartRequestID string `json:"start_request_id"`
	SessionID      string `json:"session_id"`
	DispatchID     string `json:"dispatch_id"`
	TaskID         string `json:"task_id"`
}

// 原生宿主私有准入只传递已核来源；公开 command 不接受这些字段。
type OrcaQuestionOrigin struct {
	NativeSessionID  string `json:"nativeSessionId"`
	AssistantEntryID string `json:"assistantEntryId"`
	ToolCallID       string `json:"toolCallId"`
}

type OrcaQuestionParams struct {
	Question *string `json:"question,omitempty"`
	Resume   *string `json:"resume,omitempty"`
}

type OrcaQuestionAsk struct {
	StartRequestID string             `json:"start_request_id"`
	RequestID      string             `json:"request_id"`
	QuestionID     string             `json:"question_id,omitempty"`
	SessionID      string             `json:"session_id"`
	DispatchID     string             `json:"dispatch_id"`
	Origin         OrcaQuestionOrigin `json:"origin"`
	Params         OrcaQuestionParams `json:"params"`
}

type OrcaDelegationParams struct {
	RoleID             string   `json:"role_id"`
	Revision           int64    `json:"revision"`
	Input              string   `json:"input"`
	CompletionCriteria []string `json:"completion_criteria"`
	Mode               string   `json:"mode"`
}

type OrcaNativeDelegation struct {
	Schema          string               `json:"schema"`
	ObservationOnly bool                 `json:"observation_only,omitempty"`
	StartRequestID  string               `json:"start_request_id"`
	RequestID       string               `json:"request_id"`
	WorkerRequestID string               `json:"worker_request_id"`
	SessionID       string               `json:"session_id"`
	DispatchID      string               `json:"dispatch_id"`
	ParentTaskID    string               `json:"parent_task_id"`
	ParentSelection OrcaAgentSelection   `json:"parent_selection"`
	Origin          OrcaQuestionOrigin   `json:"origin"`
	Params          OrcaDelegationParams `json:"params"`
}

type OrcaCapabilityRequirements struct {
	SettingsRevision  int      `json:"settings_revision"`
	AllowDirectory    bool     `json:"allow_directory"`
	AllowedSubdirs    []string `json:"allowed_subdirs"`
	GrantActions      []string `json:"grant_actions"`
	AllowedActions    []string `json:"allowed_actions"`
	AllowedTools      []string `json:"allowed_tools"`
	ExternalModelCLI  string   `json:"external_model_cli"`
	ExternalModelCLIs []string `json:"external_model_clis,omitempty"`
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
	CatalogSource       OrcaNativeConfigurationSource  `json:"catalog_source"`
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
	case "pi-native-api-key-per-session":
		return append(common, "models_source", "private_root"), nil
	case "opencode-native-api-key", "opencode-native-stepfun-api-key":
		return append(common, "config_source", "database_source", "credential_id", "credential_updated_at", "private_root"), nil
	case "codex-native-api-key":
		return append(common, "catalog_source", "private_root"), nil
	case "claude-native-api-key":
		return append(common, "private_root"), nil
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
	Mode            string                         `json:"mode"`
	NativeContract  string                         `json:"native_contract"`
	Extension       *OrcaNativeConfigurationSource `json:"extension,omitempty"`
	Shell           *OrcaNativeConfigurationSource `json:"shell,omitempty"`
	MorphConfig     *OrcaNativeConfigurationSource `json:"morph_config,omitempty"`
	MorphHostConfig *OrcaNativeConfigurationSource `json:"morph_host_config,omitempty"`
	Allowed         []string                       `json:"allowed,omitempty"`
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
	QuestionID      string           `json:"question_id,omitempty"`
	Result          any              `json:"result,omitempty"`
	Error           *OrcaNativeError `json:"error,omitempty"`
}

type OrcaExecutionRuntime interface {
	Capabilities(context.Context, string, string, OrcaCapabilityRequirements) (OrcaEnvelope, error)
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
	WritableRoots    []string   `json:"writable_roots,omitempty"`
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
	case "role.list", "role.show", "conversation.list", "conversation.show":
		return "observe", false, true
	case "role.create", "role.update", "role.archive", "conversation.create":
		return "start", true, true
	case "conversation.append", "handoff.notify":
		return "send", true, true
	case "status", "capabilities", "controller.show", "task.show", "task.list", "task.result", "worker.show", "worker.list", "worker.read", "request.show", "run.show", "run.export":
		return "observe", false, true
	case "controller.open", "controller.recover", "task.create", "worker.start", "run.submit":
		return "start", true, true
	case "worker.send", "task.complete", "question.answer", "question.resume":
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
		"role.list": "", "role.show": "role_id", "role.create": "role request_id", "role.update": "role_id revision role request_id", "role.archive": "role_id revision request_id",
		"conversation.list": "", "conversation.show": "conversation_id", "conversation.create": "conversation request_id", "conversation.append": "conversation_id text request_id",
		"handoff.notify":  "controller task_id dispatch_id input_file request_id",
		"question.answer": "controller run_id task_id dispatch_id question_id input_file text request_id",
		"question.resume": "controller run_id task_id dispatch_id question_id request_id",
		"run.submit":      "workdir spec_file input_file agent model name question_mode delegation_mode development_mode morph_config request_id role_id revision conversation_id", "run.show": "controller run_id task_id", "run.export": "controller run_id task_id output_dir export_mode",
		"controller.open": "workdir request_id", "controller.show": "controller", "controller.close": "controller request_id", "controller.recover": "controller request_id",
		"task.create": "controller spec_file request_id", "task.show": "controller task_id", "task.list": "controller",
		"task.complete": "controller task_id result_file request_id", "task.result": "controller task_id output_dir",
		"worker.start": "controller task_id name agent model input_file question_mode delegation_mode development_mode morph_config request_id parent_task_id handoff_mode reply_mode completion_criteria role_id revision", "worker.list": "controller task_id",
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
	if c.ExportMode != "" && c.ExportMode != "results" && c.ExportMode != "audit" {
		return projectError(apierrors.ValidationFailed, "export_mode must be results or audit")
	}
	if c.QuestionMode != "" && c.QuestionMode != "disabled" && c.QuestionMode != "native" {
		return projectError(apierrors.ValidationFailed, "question_mode must be disabled or native")
	}
	if c.QuestionMode == "native" && ((c.Agent != "" && c.Agent != "pi") || c.HandoffMode == "consult") {
		return projectError(apierrors.UnsupportedCapability, "native questions require Pi work; consult keeps its disabled-tool policy")
	}
	if c.DelegationMode != "" && c.DelegationMode != "disabled" && c.DelegationMode != "native" {
		return projectError(apierrors.ValidationFailed, "delegation_mode must be disabled or native")
	}
	if c.DelegationMode == "native" && ((c.Agent != "" && c.Agent != "pi") || c.HandoffMode == "consult") {
		return projectError(apierrors.UnsupportedCapability, "native delegation requires Pi work; consult keeps its disabled-tool policy")
	}
	if c.DevelopmentMode != "" && c.DevelopmentMode != "disabled" && c.DevelopmentMode != "project" {
		return projectError(apierrors.ValidationFailed, "development_mode must be disabled or project")
	}
	if c.DevelopmentMode == "project" && (c.Agent != "" && c.Agent != "pi" && c.Agent != "opencode" || c.HandoffMode == "consult") {
		return projectError(apierrors.UnsupportedCapability, "project development requires Pi or OpenCode work; consult keeps its disabled-tool policy")
	}
	if c.MorphConfig != "" {
		if !filepath.IsAbs(c.MorphConfig) || filepath.Clean(c.MorphConfig) != c.MorphConfig || strings.ContainsAny(c.MorphConfig, "\x00\r\n") {
			return projectError(apierrors.ValidationFailed, "morph_config requires a canonical absolute descriptor path")
		}
		if c.Agent != "pi" || c.RoleID != "" || c.HandoffMode != "" || c.QuestionMode == "native" || c.DelegationMode == "native" || c.DevelopmentMode == "project" {
			return projectError(apierrors.UnsupportedCapability, "Morph tools require explicit Pi selection without roles, consult or other native tools")
		}
	}
	if mutation || c.Action == "request.show" {
		id, err := uuid.Parse(c.RequestID)
		if err != nil || id.String() != c.RequestID {
			return projectError(apierrors.ValidationFailed, "a canonical UUID request_id is required for mutations")
		}
	}
	if strings.HasPrefix(c.Action, "role.") || strings.HasPrefix(c.Action, "conversation.") {
		return validateOrcaCollaborationCommand(c)
	}
	if c.Action == "controller.open" || c.Action == "run.submit" {
		if c.ProjectID == "" || !filepath.IsAbs(c.Workdir) || c.Controller != "" {
			return projectError(apierrors.ValidationFailed, "controller open requires a project and absolute workdir")
		}
		if c.Action == "run.submit" && (c.SpecFile == "" || c.InputFile == "" || strings.TrimSpace(c.Name) == "" || !validOrcaAgentPair(c.Agent, c.Model)) {
			return projectError(apierrors.ValidationFailed, "run submit requires a task specification, input, lead name and either both Agent and model or neither")
		}
		if c.Action == "run.submit" && (c.RoleID == "" && c.Revision != 0 || c.RoleID != "" && (c.Revision < 1 || c.Revision > 9007199254740991)) {
			return projectError(apierrors.ValidationFailed, "a selected role requires its exact revision")
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
	if c.Action == "question.answer" {
		if c.RunID == "" || c.TaskID == "" || c.DispatchID == "" || c.QuestionID == "" || (c.InputFile == "") == (c.Text == "") {
			return projectError(apierrors.ValidationFailed, "question answer requires the exact Run, root Task, Dispatch, question and exactly one of input_file/text")
		}
		if c.Text != "" {
			return validateOrcaAnswer(c.Text)
		}
	}
	if c.Action == "question.resume" && (c.RunID == "" || c.TaskID == "" || c.DispatchID == "" || c.QuestionID == "") {
		return projectError(apierrors.ValidationFailed, "question resume requires the exact Run, root Task, Dispatch and question")
	}
	if (c.Action == "run.show" || c.Action == "run.export") && (c.RunID == "" || c.TaskID == "") {
		return projectError(apierrors.ValidationFailed, "run observation requires the exact Run and root Task identities")
	}
	if strings.HasPrefix(c.Action, "worker.") && c.Action != "worker.start" && c.Action != "worker.list" && c.DispatchID == "" {
		return projectError(apierrors.ValidationFailed, "dispatch_id is required")
	}
	if (strings.HasPrefix(c.Action, "task.") && c.Action != "task.create" && c.Action != "task.list") || c.Action == "worker.start" || c.Action == "worker.list" {
		if c.TaskID == "" {
			return projectError(apierrors.ValidationFailed, "task_id is required")
		}
	}
	if c.Action == "worker.start" && (c.Name == "" || c.InputFile == "" || !validOrcaAgentPair(c.Agent, c.Model) || c.Agent == "" && c.RoleID == "") {
		return projectError(apierrors.ValidationFailed, "worker start requires a name, input file and either an Agent and model or a role")
	}
	if c.Action == "worker.start" {
		if c.HandoffMode != "" && c.HandoffMode != "work" && c.HandoffMode != "consult" || c.ReplyMode != "" && c.ReplyMode != "resume" && c.ReplyMode != "poll" {
			return projectError(apierrors.ValidationFailed, "worker handoff accepts work/consult and resume/poll")
		}
		if c.ParentTaskID != "" && len(c.CompletionCriteria) == 0 || c.RoleID == "" && c.Revision != 0 || c.RoleID != "" && (c.Revision < 1 || c.Revision > 9007199254740991) {
			return projectError(apierrors.ValidationFailed, "a handoff requires completion criteria and an exact selected role revision")
		}
		for _, criterion := range c.CompletionCriteria {
			if strings.TrimSpace(criterion) == "" {
				return projectError(apierrors.ValidationFailed, "completion criteria cannot be blank")
			}
		}
	}
	if c.Action == "handoff.notify" && (c.TaskID == "" || c.DispatchID == "" || c.InputFile == "") {
		return projectError(apierrors.ValidationFailed, "notification requires its parent task, recipient Dispatch and approved input file")
	}
	if c.Action == "worker.send" && c.InputFile == "" {
		return projectError(apierrors.ValidationFailed, "input_file is required")
	}
	if c.Action == "worker.read" && (c.Source != "transcript" || c.Limit < 1 || c.Limit > 1000) {
		return projectError(apierrors.ValidationFailed, "read requires transcript source and limit between 1 and 1000")
	}
	if c.Action == "task.create" && c.SpecFile == "" || c.Action == "task.complete" && c.ResultFile == "" || (c.Action == "task.result" || c.Action == "run.export") && !filepath.IsAbs(c.OutputDir) {
		return projectError(apierrors.ValidationFailed, "the action requires its explicit file or absolute output directory")
	}
	return nil
}

func validOrcaAgentPair(agent, model string) bool {
	if agent != strings.TrimSpace(agent) || model != strings.TrimSpace(model) {
		return false
	}
	return (agent == "") == (model == "")
}

func validateOrcaAnswer(text string) error {
	if !utf8.ValidString(text) || strings.TrimSpace(text) == "" || len(text) > 32000 {
		return projectError(apierrors.ValidationFailed, "the answer must be nonblank UTF-8 text within 32000 bytes")
	}
	return nil
}

func orcaQuestionResumeBody(questionID string) string {
	return "使用 swa_ask 的 resume 参数读取原问题 " + questionID + " 的答案，并继续当前任务。"
}

func validateOrcaQuestionSelection(command OrcaCommand, selection OrcaAgentSelection) error {
	mode := selection.NativeLaunch.Tools.Mode
	questionEnabled := mode == "questions-only" || (mode == "collaboration" || mode == "project") && slices.Contains(selection.NativeLaunch.Tools.Allowed, "swa_ask")
	delegationEnabled := mode == "collaboration" || mode == "project" && slices.Contains(selection.NativeLaunch.Tools.Allowed, "swa_delegate")
	if command.Action == "question.resume" && !questionEnabled {
		return projectError(apierrors.UnsupportedCapability, "question continuation requires the original native question tool mode")
	}
	if command.Action != "worker.start" && command.Action != "run.submit" {
		return nil
	}
	if command.HandoffMode == "consult" && mode != "disabled" {
		return projectError(apierrors.UnsupportedCapability, "consult retains its disabled-tool policy")
	}
	if mode != "disabled" && mode != "questions-only" && mode != "collaboration" && mode != "project" && mode != "morph" {
		return projectError(apierrors.EvidenceMissing, "native selection has an unsupported tool mode")
	}
	if (mode == "morph") != (command.MorphConfig != "") || mode == "morph" && (selection.NativeLaunch.Tools.MorphConfig == nil || selection.NativeLaunch.Tools.MorphConfig.Path != command.MorphConfig) {
		return projectError(apierrors.EvidenceMissing, "native selection changed the requested Morph configuration")
	}
	// 角色默认由原生端核验；每个显式模式独立核对，不能因另一项缺省而跳过。
	if (command.QuestionMode != "" || command.RoleID == "") && questionEnabled != (command.QuestionMode == "native") {
		return projectError(apierrors.EvidenceMissing, "native selection changed the requested question mode")
	}
	if (command.DelegationMode != "" || command.RoleID == "") && delegationEnabled != (command.DelegationMode == "native") {
		return projectError(apierrors.EvidenceMissing, "native selection changed the requested delegation mode")
	}
	if (command.DevelopmentMode != "" || command.RoleID == "") && (mode == "project") != (command.DevelopmentMode == "project") {
		return projectError(apierrors.EvidenceMissing, "native selection changed the requested development mode")
	}
	return nil
}

func validateOrcaQuestionAsk(invocation OrcaInvocation) error {
	command, ask := invocation.Command, invocation.QuestionAsk
	if ask == nil || command.Action != "worker.send" || invocation.Handoff != nil || invocation.Submission != nil || invocation.NativeDelegation != nil || invocation.NativeProjectTool != nil || invocation.NativeSessionObservation != nil || invocation.Input == nil || invocation.Selection == nil || (invocation.Selection.NativeLaunch.Tools.Mode != "questions-only" && (!slices.Contains([]string{"collaboration", "project"}, invocation.Selection.NativeLaunch.Tools.Mode) || !slices.Contains(invocation.Selection.NativeLaunch.Tools.Allowed, "swa_ask"))) {
		return projectError(apierrors.ScopeDenied, "native question admission requires its original exclusive question input binding")
	}
	for _, value := range []string{ask.StartRequestID, ask.RequestID} {
		id, err := uuid.Parse(value)
		if err != nil || id.String() != value {
			return projectError(apierrors.ScopeDenied, "native question admission requires canonical original request identities")
		}
	}
	origin := ask.Origin
	nativeID, err := uuid.Parse(origin.NativeSessionID)
	if err != nil || nativeID.String() != origin.NativeSessionID || nativeID.Version() != 7 || strings.TrimSpace(ask.SessionID) == "" || origin.AssistantEntryID == "" || utf8.RuneCountInString(origin.AssistantEntryID) > 64 || origin.ToolCallID == "" || utf8.RuneCountInString(origin.ToolCallID) > 512 || !utf8.ValidString(origin.AssistantEntryID) || !utf8.ValidString(origin.ToolCallID) {
		return projectError(apierrors.ScopeDenied, "native question admission lacks its exact native session and tool entry")
	}
	if command.RequestID != ask.RequestID || ask.DispatchID == "" || command.DispatchID != ask.DispatchID || command.InputFile != "native-question:"+ask.RequestID || invocation.Input.Path != command.InputFile || invocation.Input.Version != ask.RequestID {
		return projectError(apierrors.ScopeDenied, "native question admission changed its original request or input binding")
	}
	if (ask.Params.Question == nil) == (ask.Params.Resume == nil) {
		return projectError(apierrors.ValidationFailed, "native question accepts exactly one question or resume parameter")
	}
	if ask.Params.Question != nil {
		if ask.QuestionID != "" {
			return projectError(apierrors.ScopeDenied, "a new native question cannot select an existing question")
		}
		if err := validateOrcaAnswer(*ask.Params.Question); err != nil {
			return err
		}
	} else if *ask.Params.Resume == "" || !utf8.ValidString(*ask.Params.Resume) || utf8.RuneCountInString(*ask.Params.Resume) > 512 || ask.QuestionID != *ask.Params.Resume {
		return projectError(apierrors.ScopeDenied, "native question resume must retain its original question")
	}
	var params OrcaQuestionParams
	if !json.Valid([]byte(invocation.Input.Text)) {
		return projectError(apierrors.ScopeDenied, "native question input must contain its exact JSON parameters")
	}
	decoder := json.NewDecoder(strings.NewReader(invocation.Input.Text))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&params); err != nil || !reflect.DeepEqual(params, ask.Params) {
		return projectError(apierrors.ScopeDenied, "native question input differs from its original parameters")
	}
	return nil
}

func validateOrcaNativeDelegation(invocation OrcaInvocation) error {
	command, source := invocation.Command, invocation.NativeDelegation
	if source == nil || source.Schema != "swa.native-delegation.v1" || invocation.Selection == nil || invocation.QuestionAsk != nil || invocation.NativeProjectTool != nil || invocation.NativeSessionObservation != nil || invocation.Handoff != nil || invocation.Submission != nil {
		return projectError(apierrors.ScopeDenied, "native delegation requires its exclusive original source binding")
	}
	if source.ObservationOnly {
		if command.Action != "request.show" || command.ProjectID != "" || command.RequestID != source.RequestID || command.Controller != invocation.Scope.Controller || command.TaskID != invocation.Scope.RootTaskID || command.DispatchID != source.DispatchID || invocation.Input != nil || !reflect.DeepEqual(*invocation.Selection, source.ParentSelection) {
			return projectError(apierrors.ScopeDenied, "native delegation observation must retain its exact original request and parent Worker")
		}
	} else if command.Action != "worker.start" || invocation.Input == nil {
		return projectError(apierrors.ScopeDenied, "native delegation delivery requires its original Worker start input")
	}
	for _, value := range []string{source.StartRequestID, source.RequestID, source.WorkerRequestID} {
		id, err := uuid.Parse(value)
		if err != nil || id.String() != value {
			return projectError(apierrors.ScopeDenied, "native delegation requires canonical original request identities")
		}
	}
	if source.StartRequestID == source.RequestID || source.StartRequestID == source.WorkerRequestID || source.RequestID == source.WorkerRequestID {
		return projectError(apierrors.ScopeDenied, "native delegation cannot reuse its parent or outer mutation identity")
	}
	origin := source.Origin
	nativeID, err := uuid.Parse(origin.NativeSessionID)
	if err != nil || nativeID.String() != origin.NativeSessionID || nativeID.Version() != 7 || strings.TrimSpace(source.SessionID) == "" || source.DispatchID == "" || source.ParentTaskID == "" || origin.AssistantEntryID == "" || utf8.RuneCountInString(origin.AssistantEntryID) > 64 || origin.ToolCallID == "" || utf8.RuneCountInString(origin.ToolCallID) > 512 || !utf8.ValidString(origin.AssistantEntryID) || !utf8.ValidString(origin.ToolCallID) {
		return projectError(apierrors.ScopeDenied, "native delegation lacks its exact parent session and tool entry")
	}
	params := source.Params
	if strings.TrimSpace(params.RoleID) == "" || params.Revision < 1 || params.Revision > 9007199254740991 || params.Mode != "work" && params.Mode != "consult" || len(params.CompletionCriteria) < 1 || len(params.CompletionCriteria) > 32 {
		return projectError(apierrors.ValidationFailed, "native delegation requires an exact role, work/consult mode and completion criteria")
	}
	if err := validateOrcaAnswer(params.Input); err != nil {
		return err
	}
	for _, criterion := range params.CompletionCriteria {
		if strings.TrimSpace(criterion) == "" || !utf8.ValidString(criterion) || len(criterion) > 32000 {
			return projectError(apierrors.ValidationFailed, "native delegation completion criteria must be bounded nonblank UTF-8 text")
		}
	}
	if !source.ObservationOnly {
		if command.RequestID != source.WorkerRequestID || command.TaskID != invocation.Scope.RootTaskID || command.ParentTaskID != source.ParentTaskID || command.RoleID != params.RoleID || command.Revision != params.Revision || command.HandoffMode != params.Mode || command.ReplyMode != "resume" || command.QuestionMode != "disabled" || command.DelegationMode != "disabled" || command.Name != "Delegated "+params.RoleID || !slices.Equal(command.CompletionCriteria, params.CompletionCriteria) {
			return projectError(apierrors.ScopeDenied, "native delegation changed its original parent, role or handoff parameters")
		}
		if command.InputFile != "native-delegation:"+source.RequestID || invocation.Input.Path != command.InputFile || invocation.Input.Version != source.RequestID || invocation.Input.Text != params.Input {
			return projectError(apierrors.ScopeDenied, "native delegation input differs from its actual tool call")
		}
	}
	if source.ParentSelection.AgentID != "pi" || !slices.Contains([]string{"collaboration", "project"}, source.ParentSelection.NativeLaunch.Tools.Mode) || !slices.Contains(source.ParentSelection.NativeLaunch.Tools.Allowed, "swa_delegate") || source.ParentSelection.Executable == "" || source.ParentSelection.ConfigurationVersion == "" {
		return projectError(apierrors.ScopeDenied, "native delegation requires its original Pi collaboration policy")
	}
	return validateOrcaNativeLaunch(source.ParentSelection, invocation.Project.ID)
}

func validateOrcaNativeSessionObservation(invocation OrcaInvocation) error {
	command, source := invocation.Command, invocation.NativeSessionObservation
	if source == nil || source.Schema != "swa.native-session-observation.v1" || command.Action != "request.show" || invocation.Input != nil || invocation.Selection == nil || invocation.NativeDelegation != nil || invocation.NativeProjectTool != nil || invocation.QuestionAsk != nil || invocation.Handoff != nil || invocation.Submission != nil {
		return projectError(apierrors.ScopeDenied, "native session observation requires its exclusive original Worker source")
	}
	id, err := uuid.Parse(source.StartRequestID)
	if err != nil || id.String() != source.StartRequestID || command.RequestID != source.StartRequestID || command.ProjectID != "" || command.Controller != invocation.Scope.Controller || command.TaskID != invocation.Scope.RootTaskID || command.DispatchID != source.DispatchID || source.TaskID == invocation.Scope.RootTaskID {
		return projectError(apierrors.ScopeDenied, "native session observation changed its original start or Worker scope")
	}
	for _, value := range []string{source.SessionID, source.DispatchID, source.TaskID} {
		if strings.TrimSpace(value) == "" || !utf8.ValidString(value) || utf8.RuneCountInString(value) > 512 {
			return projectError(apierrors.ScopeDenied, "native session observation identity is incomplete")
		}
	}
	return nil
}

func (s *OrcaExecutionService) authorizeOrcaSessionObservation(ctx context.Context, caller domain.Caller, project domain.LocalProject, target string) error {
	for _, action := range []string{"read_context", "start", "send"} {
		current, err := s.authorize(ctx, caller, project.ID, action, nil, target)
		if err != nil {
			return err
		}
		if current.Settings.Revision != project.Settings.Revision || current.Root != project.Root {
			return projectError(apierrors.ContextStale, "native session observation approval changed")
		}
	}
	return nil
}

func (s *OrcaExecutionService) authorizeOrcaDelegation(ctx context.Context, caller domain.Caller, project domain.LocalProject, targets ...string) error {
	for _, action := range []string{"start", "send"} {
		current, err := s.authorize(ctx, caller, project.ID, action, nil, "")
		if err != nil {
			return err
		}
		if current.Settings.Revision != project.Settings.Revision || current.Root != project.Root {
			return projectError(apierrors.ContextStale, "native delegation project approval changed")
		}
		if err := ValidateProjectActionScope(current, ProjectActionScope{ProjectID: project.ID, SettingsRevision: project.Settings.Revision, Action: action, Tools: []string{"swa_delegate"}, ExternalTargets: targets}); err != nil {
			return err
		}
	}
	return nil
}

func (s *OrcaExecutionService) authorizeOrcaMorphTools(ctx context.Context, caller domain.Caller, project domain.LocalProject, targets ...string) error {
	for _, action := range []string{"start", "send"} {
		current, err := s.authorize(ctx, caller, project.ID, action, nil, "")
		if err != nil {
			return err
		}
		if current.Settings.Revision != project.Settings.Revision || current.Root != project.Root {
			return projectError(apierrors.ContextStale, "Morph tool project approval changed")
		}
		if err := ValidateProjectActionScope(current, ProjectActionScope{ProjectID: project.ID, SettingsRevision: project.Settings.Revision, Action: action, Roots: []string{project.Root}, Tools: []string{"morph_list_tools", "morph_call_tool"}, ExternalTargets: targets}); err != nil {
			return err
		}
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
	if strings.HasPrefix(path, "native-handoff:") || strings.HasPrefix(path, "native-question:") || strings.HasPrefix(path, "native-question-resume:") || strings.HasPrefix(path, "native-delegation:") || strings.HasPrefix(path, "native-project-tool:") {
		return result, projectError(apierrors.ScopeDenied, "native internal input must originate from its exact owning command")
	}
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
	if command.Action == "run.submit" {
		return s.submitOrcaRun(ctx, caller, command)
	}
	return s.executeOrcaCommand(ctx, caller, command, nil)
}

func (s *OrcaExecutionService) executeOrcaCommand(ctx context.Context, caller domain.Caller, command OrcaCommand, submission *OrcaRunSubmission) (OrcaEnvelope, error) {
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
	model := command.Action == "worker.start" || command.Action == "worker.send" || command.Action == "question.answer" || command.Action == "question.resume"
	initialPermission := permission
	if model {
		initialPermission = "observe"
	}
	p, err := s.authorize(ctx, caller, projectID, initialPermission, nil, "")
	if err != nil {
		return reply, err
	}
	invocation := OrcaInvocation{Command: command, Project: p, Caller: OrcaExecutionCaller{ID: caller.ID, Kind: caller.Kind, ProjectID: projectID, SettingsRevision: p.Settings.Revision}, Submission: submission}
	if submission != nil && (submission.Caller.ID != caller.ID || submission.Caller.Kind != caller.Kind || submission.Caller.ProjectID != p.ID || submission.Caller.SettingsRevision != p.Settings.Revision) {
		return reply, projectError(apierrors.ContextStale, "run submission caller or project approval changed")
	}
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
		root, err := s.files.CanonicalRoot(p.Root)
		if err != nil || root != p.Root {
			return reply, projectError(apierrors.ContextStale, "registered project root changed before native discovery")
		}
		requirements := OrcaCapabilityRequirements{SettingsRevision: p.Settings.Revision, AllowDirectory: p.Settings.AllowDirectory, AllowedSubdirs: p.Settings.AllowedSubdirs, AllowedActions: p.Settings.AllowedActions, AllowedTools: p.Settings.AllowedTools, ExternalModelCLI: p.Settings.ExternalModelCLI, ExternalModelCLIs: p.Settings.ExternalModelCLIs, AllowAgentControl: p.Settings.AllowAgentControl}
		if caller.Kind == "agent" {
			grant, err := s.projects.LoadGrant(ctx, projectID, caller.ID)
			if err != nil {
				return reply, err
			}
			requirements.GrantActions = grant.Actions
		}
		reply, err := s.runtime.Capabilities(ctx, projectID, root, requirements)
		if err != nil {
			return reply, err
		}
		current, err := s.authorize(ctx, caller, projectID, permission, nil, "")
		if err != nil {
			return OrcaEnvelope{}, err
		}
		currentRoot, rootErr := s.files.CanonicalRoot(current.Root)
		if current.Settings.Revision != p.Settings.Revision || current.Root != root || rootErr != nil || currentRoot != root {
			return OrcaEnvelope{}, projectError(apierrors.ContextStale, "project root or settings changed during native discovery")
		}
		if caller.Kind == "agent" {
			grant, err := s.projects.LoadGrant(ctx, projectID, caller.ID)
			if err != nil {
				return OrcaEnvelope{}, err
			}
			if !slices.Equal(requirements.GrantActions, grant.Actions) {
				return OrcaEnvelope{}, projectError(apierrors.ContextStale, "project grant changed during native discovery")
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
		if selection.AgentID == "" || selection.ExternalTarget != selection.AgentID || selection.Executable == "" || selection.Version == "" || selection.Model == "" || selection.Provider == "" || selection.ConfigurationVersion == "" || command.Action == "worker.start" && command.Agent != "" && (selection.AgentID != command.Agent || selection.Model != command.Model) {
			return reply, projectError(apierrors.EvidenceMissing, "native selection does not prove the requested Agent and model")
		}
		if err := validateOrcaNativeLaunch(selection, projectID); err != nil {
			return reply, err
		}
		if err := validateOrcaQuestionSelection(command, selection); err != nil {
			return reply, err
		}
		if submission != nil && !reflect.DeepEqual(submission.Selection, selection) {
			return reply, projectError(apierrors.ContextStale, "run submission Agent selection changed before delivery")
		}
		externalTarget = selection.ExternalTarget
		current, err := s.authorize(ctx, caller, projectID, permission, nil, externalTarget)
		if err != nil {
			return reply, err
		}
		if current.Settings.Revision != p.Settings.Revision {
			return reply, projectError(apierrors.ContextStale, "project settings changed during native selection")
		}
		if slices.Contains(selection.NativeLaunch.Tools.Allowed, "swa_delegate") {
			if err := s.authorizeOrcaDelegation(ctx, caller, current, selection.ExternalTarget); err != nil {
				return reply, err
			}
		}
		if selection.NativeLaunch.Tools.Mode == "morph" {
			if err := s.authorizeOrcaMorphTools(ctx, caller, current, selection.ExternalTarget); err != nil {
				return reply, err
			}
		}
		if selection.NativeLaunch.Tools.Mode == "project" {
			if _, err := s.authorizeOrcaProjectTools(ctx, caller, current, selection.ExternalTarget); err != nil {
				return reply, err
			}
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
		if command.Action == "run.show" || command.Action == "run.export" || command.Action == "question.answer" || command.Action == "question.resume" {
			if scope.RunID != command.RunID || scope.RootTaskID != command.TaskID {
				return reply, projectError(apierrors.ScopeDenied, "Run and root Task do not match the current controller")
			}
		}
		if scope.Context.ProjectID != "" && (scope.Context.ProjectID != projectID || !safeHumanStop && scope.Context.SettingsRevision != p.Settings.Revision) {
			return reply, projectError(apierrors.ContextStale, "the fixed task context no longer matches current project permissions")
		}
	}
	if command.Action == "task.create" {
		file, err := s.readInput(ctx, p, command.SpecFile)
		if err != nil {
			return reply, err
		}
		if submission != nil {
			if err := submission.ValidateInput(file, true); err != nil {
				return reply, err
			}
		}
		spec, err := decodeOrcaTaskSpec(file)
		if err != nil {
			return reply, err
		}
		if submission != nil {
			if err := applyOrcaRunRole(&spec, submission.Command); err != nil {
				return reply, err
			}
		}
		if err := validateOrcaTaskSpec(spec); err != nil {
			return reply, err
		}
		packet, err := s.contexts.ReadProjectContext(ctx, caller, projectID, spec.Context)
		if err != nil {
			return reply, err
		}
		if submission != nil && !reflect.DeepEqual(submission.Context, orcaContextContent(packet)) {
			return reply, projectError(apierrors.ContextStale, "run submission context changed")
		}
		invocation.Spec, invocation.Context = &spec, &packet
	}
	var outputRoot string
	if command.Action == "task.result" || command.Action == "run.export" {
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
		if submission != nil {
			if err := submission.ValidateInput(file, false); err != nil {
				return reply, err
			}
		}
		invocation.Input = &file
		if command.Action == "question.answer" {
			if err := validateOrcaAnswer(file.Text); err != nil {
				return reply, err
			}
		}
	}
	if command.Action == "question.resume" {
		invocation.Input = &domain.ContextFile{Path: "native-question-resume:" + command.QuestionID, Version: command.RequestID, Text: orcaQuestionResumeBody(command.QuestionID)}
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
	if policy.Tools.Mode != "morph" && (policy.Tools.MorphConfig != nil || policy.Tools.MorphHostConfig != nil) {
		return projectError(apierrors.EvidenceMissing, "only Morph tools can carry their fixed host configuration")
	}
	if policy.Tools.Mode == "disabled" && (policy.Tools.Extension != nil || policy.Tools.Shell != nil || len(policy.Tools.Allowed) != 0) {
		return projectError(apierrors.EvidenceMissing, "disabled native tools cannot carry an extension or allowed tools")
	}
	if account.Kind == "claude-native-api-key" {
		if policy.Schema != "swa.native-launch.v1" || policy.Tools.Mode != "disabled" || policy.Tools.NativeContract != "claude-cli-2.1.284-sdk-0.3.284" || selection.AgentID != "claude" || selection.ExternalTarget != "claude" || selection.Version != "2.1.284" || selection.ExecutionMode != "structured" || account.Provider != "anthropic" || selection.Provider != "anthropic" || selection.Model != "claude-opus-5" || target.ModelID != "claude-opus-5" || target.API != "anthropic-messages" || target.BaseURL != "https://api.anthropic.com" || account.PrivateHome != "" || account.ModelsSource != nil || account.CredentialID != "" {
			return projectError(apierrors.EvidenceMissing, "the selected native Claude API account and disabled-tool policy are unverified")
		}
		if !filepath.IsAbs(account.SourceHome) || !filepath.IsAbs(account.PrivateRoot) || filepath.Base(account.PrivateRoot) != projectID || filepath.Base(filepath.Dir(account.PrivateRoot)) != "claude" || account.AuthSource.Path != filepath.Join(account.SourceHome, "settings.json") || account.AuthSource.Version == "" {
			return projectError(apierrors.EvidenceMissing, "the selected native Claude source and project root are incomplete")
		}
		return nil
	}
	if account.Kind == "codex-native-api-key" {
		if policy.Schema != "swa.native-launch.v1" || policy.Tools.Mode != "disabled" || policy.Tools.NativeContract != "codex-cli-0.163.0" || selection.AgentID != "codex" || selection.Version != "0.163.0" || selection.ExecutionMode != "structured" || account.Provider != "openai" || selection.Provider != "openai" || selection.Model != "gpt-5.5" || target.ModelID != "gpt-5.5" || target.API != "openai-responses" || target.BaseURL != "https://api.openai.com/v1" || account.PrivateHome != "" || account.ModelsSource != nil || account.CredentialID != "" {
			return projectError(apierrors.EvidenceMissing, "the selected native Codex API account and disabled-tool policy are unverified")
		}
		if !filepath.IsAbs(account.SourceHome) || !filepath.IsAbs(account.PrivateRoot) || filepath.Base(account.PrivateRoot) != projectID || filepath.Base(filepath.Dir(account.PrivateRoot)) != "codex" || account.AuthSource.Path != filepath.Join(account.SourceHome, "auth.json") || account.AuthSource.Version == "" || !filepath.IsAbs(account.CatalogSource.Path) || filepath.Base(account.CatalogSource.Path) != "models.json" || filepath.Base(filepath.Dir(account.CatalogSource.Path)) != "codex-policy" || filepath.Base(filepath.Dir(filepath.Dir(account.CatalogSource.Path))) != "runtime" || account.CatalogSource.Version == "" {
			return projectError(apierrors.EvidenceMissing, "the selected native Codex sources and project root are incomplete")
		}
		return nil
	}
	if account.Kind == "opencode-native-api-key" || account.Kind == "opencode-native-stepfun-api-key" {
		provider, model, api, baseURL := "deepseek", "deepseek-v4-pro", "opencode-native-deepseek", "https://api.deepseek.com"
		if account.Kind == "opencode-native-stepfun-api-key" {
			provider, model, api, baseURL = "stepfun", "step-3.5-flash", "openai-completions", "https://api.stepfun.com/v1"
		}
		if policy.Schema != "swa.native-launch.v1" || !slices.Contains([]string{"disabled", "project"}, policy.Tools.Mode) || policy.Tools.NativeContract != "opencode-cli-2.0.31" || selection.AgentID != "opencode" || selection.Version != "2.0.31" || selection.ExecutionMode != "structured" || account.Provider != provider || selection.Provider != provider || selection.Model != provider+"/"+model || target.ModelID != model || target.API != api || target.BaseURL != baseURL || account.CredentialID == "" || account.CredentialUpdatedAt < 0 || account.PrivateHome != "" || account.ModelsSource != nil {
			return projectError(apierrors.EvidenceMissing, "the selected native OpenCode account and tool policy are unverified")
		}
		if !filepath.IsAbs(account.SourceHome) || !filepath.IsAbs(account.PrivateRoot) || filepath.Base(account.PrivateRoot) != projectID || filepath.Base(filepath.Dir(account.PrivateRoot)) != "opencode" || account.AuthSource.Path != filepath.Join(account.SourceHome, ".local", "share", "opencode", "auth.json") || account.ConfigSource.Path != filepath.Join(account.SourceHome, ".config", "opencode", "opencode.jsonc") || account.DatabaseSource.Path != filepath.Join(account.SourceHome, ".local", "share", "opencode", "opencode.db") || account.AuthSource.Version == "" || account.ConfigSource.Version == "" || account.DatabaseSource.Version == "" {
			return projectError(apierrors.EvidenceMissing, "the selected native OpenCode sources and project root are incomplete")
		}
		if policy.Tools.Mode == "project" && (!fixedOrcaToolSource(policy.Tools.Shell, "project-shell") || policy.Tools.Extension != nil || !slices.Equal(policy.Tools.Allowed, []string{"shell"})) {
			return projectError(apierrors.EvidenceMissing, "OpenCode project tools require the fixed shell launcher and exact shell capability")
		}
		return nil
	}
	endpoint, err := url.Parse(target.BaseURL)
	if policy.Schema != "swa.native-launch.v1" || !slices.Contains([]string{"disabled", "questions-only", "collaboration", "project", "morph"}, policy.Tools.Mode) || policy.Tools.Shell != nil || policy.Tools.NativeContract != "pi-cli-1.0.1" || selection.AgentID != "pi" || selection.ExternalTarget != "pi" || selection.Version != "1.0.1" || selection.ExecutionMode != "structured" || account.Kind != "pi-native-api-key-per-session" || account.Provider == "" || account.Provider != selection.Provider || target.ModelID == "" || selection.Model != account.Provider+"/"+target.ModelID || !slices.Contains([]string{"openai-responses", "openai-completions", "azure-openai-responses"}, target.API) || err != nil || endpoint.Host == "" || (endpoint.Scheme != "https" && endpoint.Scheme != "http") || endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" {
		return projectError(apierrors.EvidenceMissing, "the selected native account and tool policy are unverified")
	}
	if policy.Tools.Mode == "morph" {
		if !fixedOrcaToolSource(policy.Tools.Extension, "pi-morph-extension.mjs") || !slices.Equal(policy.Tools.Allowed, []string{"morph_list_tools", "morph_call_tool"}) {
			return projectError(apierrors.EvidenceMissing, "Morph tools require the fixed extension and exact tool set")
		}
		for _, source := range []*OrcaNativeConfigurationSource{policy.Tools.MorphConfig, policy.Tools.MorphHostConfig} {
			if source == nil || !filepath.IsAbs(source.Path) || filepath.Clean(source.Path) != source.Path || strings.ContainsAny(source.Path, "\x00\r\n") || source.Version == "" {
				return projectError(apierrors.EvidenceMissing, "Morph tools require both fixed configuration sources")
			}
		}
	}
	if policy.Tools.Mode == "questions-only" {
		extension := policy.Tools.Extension
		if extension == nil || !filepath.IsAbs(extension.Path) || filepath.Clean(extension.Path) != extension.Path || filepath.Base(extension.Path) != "pi-question-extension.mjs" || filepath.Base(filepath.Dir(extension.Path)) != "runtime" || extension.Version == "" || !slices.Equal(policy.Tools.Allowed, []string{"swa_ask"}) {
			return projectError(apierrors.EvidenceMissing, "native questions require their fixed installed extension source and exact allowed tool")
		}
	}
	if policy.Tools.Mode == "collaboration" {
		extension := policy.Tools.Extension
		if extension == nil || !filepath.IsAbs(extension.Path) || filepath.Clean(extension.Path) != extension.Path || filepath.Base(extension.Path) != "pi-collaboration-extension.mjs" || filepath.Base(filepath.Dir(extension.Path)) != "runtime" || extension.Version == "" || !slices.Equal(policy.Tools.Allowed, []string{"swa_delegate"}) && !slices.Equal(policy.Tools.Allowed, []string{"swa_ask", "swa_delegate"}) {
			return projectError(apierrors.EvidenceMissing, "native delegation requires its fixed installed extension and exact allowed tools")
		}
	}
	if policy.Tools.Mode == "project" {
		allowed := []string{"bash"}
		for _, tool := range []string{"swa_ask", "swa_delegate"} {
			if slices.Contains(policy.Tools.Allowed, tool) {
				allowed = append(allowed, tool)
			}
		}
		if !fixedOrcaToolSource(policy.Tools.Extension, "pi-project-extension.mjs") || !slices.Equal(policy.Tools.Allowed, allowed) {
			return projectError(apierrors.EvidenceMissing, "Pi project tools require the fixed extension and exact selected tools")
		}
	}
	if !filepath.IsAbs(account.SourceHome) || filepath.Clean(account.SourceHome) != account.SourceHome || !filepath.IsAbs(account.PrivateRoot) || filepath.Clean(account.PrivateRoot) != account.PrivateRoot || filepath.Base(account.PrivateRoot) != projectID || filepath.Base(filepath.Dir(account.PrivateRoot)) != "pi-workers" || account.PrivateHome != "" || account.AuthSource.Version == "" || account.AuthSource.Path != filepath.Join(account.SourceHome, "auth.json") || account.ModelsSource != nil && (account.ModelsSource.Version == "" || account.ModelsSource.Path != filepath.Join(account.SourceHome, "models.json")) {
		return projectError(apierrors.EvidenceMissing, "the selected native account source and per-session project root are incomplete")
	}
	return nil
}

// 效果前准入只读取当前批准、原Run关联和原上下文，不调用Native端口。
func (s *OrcaExecutionService) AdmitOrcaDelivery(ctx context.Context, invocation OrcaInvocation) (OrcaDeliveryAdmissionResult, error) {
	var result OrcaDeliveryAdmissionResult
	command := invocation.Command
	delegationObservation := invocation.NativeDelegation != nil && invocation.NativeDelegation.ObservationOnly
	sessionObservation := invocation.NativeSessionObservation != nil
	privateObservation := delegationObservation || sessionObservation
	validationCommand := command
	if delegationObservation {
		if err := validateOrcaNativeDelegation(invocation); err != nil {
			return result, err
		}
	}
	if sessionObservation {
		if err := validateOrcaNativeSessionObservation(invocation); err != nil {
			return result, err
		}
	}
	if privateObservation {
		// 私有观察保留已核对的 Worker 来源；公开 request.show 仍不接受 Task/Dispatch 选择。
		validationCommand.TaskID, validationCommand.DispatchID = "", ""
	}
	if err := ValidateOrcaCommand(validationCommand); err != nil {
		return result, err
	}
	if !privateObservation && command.Action != "worker.start" && command.Action != "worker.send" && command.Action != "question.answer" && command.Action != "question.resume" {
		return result, projectError(apierrors.ScopeDenied, "delivery admission requires an original Worker input")
	}
	actor, scope := invocation.Caller, invocation.Scope
	if (command.Action == "question.answer" || command.Action == "question.resume") && (invocation.Handoff != nil || invocation.Submission != nil || invocation.QuestionAsk != nil || invocation.NativeDelegation != nil || invocation.NativeProjectTool != nil || command.RunID != scope.RunID || command.TaskID != scope.RootTaskID) {
		return result, projectError(apierrors.ScopeDenied, "question input must retain its original Run and root without another internal source")
	}
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
	if err := validateOrcaQuestionSelection(command, *selection); err != nil {
		return result, err
	}
	if invocation.QuestionAsk != nil {
		if err := validateOrcaQuestionAsk(invocation); err != nil {
			return result, err
		}
	}
	if invocation.NativeDelegation != nil && !delegationObservation {
		if err := validateOrcaNativeDelegation(invocation); err != nil {
			return result, err
		}
	}
	if invocation.NativeProjectTool != nil {
		if err := validateOrcaProjectTool(invocation); err != nil {
			return result, err
		}
	}
	if invocation.Handoff != nil {
		if err := validateOrcaHandoffResume(invocation); err != nil {
			return result, err
		}
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
	if sessionObservation {
		if err := s.authorizeOrcaSessionObservation(ctx, caller, project, selection.ExternalTarget); err != nil {
			return result, err
		}
	}
	if selection.NativeLaunch.Tools.Mode == "morph" {
		if err := s.authorizeOrcaMorphTools(ctx, caller, project, selection.ExternalTarget); err != nil {
			return result, err
		}
	}
	delegationTargets := []string{}
	if slices.Contains(selection.NativeLaunch.Tools.Allowed, "swa_delegate") || invocation.NativeDelegation != nil {
		delegationTargets = append(delegationTargets, selection.ExternalTarget)
		if invocation.NativeDelegation != nil {
			delegationTargets = append(delegationTargets, invocation.NativeDelegation.ParentSelection.ExternalTarget)
		}
		if err := s.authorizeOrcaDelegation(ctx, caller, project, delegationTargets...); err != nil {
			return result, err
		}
	}
	projectToolTargets := []string{}
	if selection.NativeLaunch.Tools.Mode == "project" {
		projectToolTargets = append(projectToolTargets, selection.ExternalTarget)
	}
	if invocation.NativeDelegation != nil && invocation.NativeDelegation.ParentSelection.NativeLaunch.Tools.Mode == "project" {
		projectToolTargets = append(projectToolTargets, invocation.NativeDelegation.ParentSelection.ExternalTarget)
	}
	if invocation.Handoff != nil && invocation.Handoff.SourceSelection != nil {
		projectToolTargets = append(projectToolTargets, invocation.Handoff.SourceSelection.ExternalTarget)
	}
	if len(projectToolTargets) > 0 {
		if _, err := s.authorizeOrcaProjectTools(ctx, caller, project, projectToolTargets...); err != nil {
			return result, err
		}
	}
	if invocation.NativeProjectTool != nil {
		if err := s.validateOrcaProjectToolCwd(project, *invocation.NativeProjectTool); err != nil {
			return result, err
		}
	}
	link, err := s.links.LoadOrcaExecutionLink(ctx, scope.AuthorityDomain, scope.RunID)
	if err != nil {
		return result, err
	}
	// 人类追加输入重新核准当前项目权限，保留创建者来源及 Agent 原批准绑定。
	independentHumanInput := actor.Kind == "human" && (command.Action == "worker.send" || command.Action == "question.answer" || command.Action == "question.resume") && invocation.Handoff == nil && invocation.QuestionAsk == nil && invocation.NativeDelegation == nil && invocation.NativeProjectTool == nil && invocation.NativeSessionObservation == nil
	if link.ProjectID != project.ID || !independentHumanInput && link.GrantAgentID != actor.ID || link.SettingsRevision != project.Settings.Revision || link.AuthorityDomain != scope.AuthorityDomain || link.RunID != scope.RunID || link.RootTaskID != scope.RootTaskID {
		return result, projectError(apierrors.ScopeDenied, "the saved native Run association changed")
	}
	if err := s.checkOriginalOrcaGrant(ctx, actor); err != nil {
		return result, err
	}
	inlineAnswer := command.Action == "question.answer" && command.Text != ""
	if inlineAnswer && invocation.Input != nil {
		return result, projectError(apierrors.ScopeDenied, "an inline answer cannot carry a file input")
	}
	if !inlineAnswer && !privateObservation && (invocation.Input == nil || invocation.Input.Version == "") {
		return result, projectError(apierrors.EvidenceMissing, "the original Worker input is unavailable")
	}
	if command.Action == "question.resume" {
		if invocation.Input.Path != "native-question-resume:"+command.QuestionID || invocation.Input.Version != command.RequestID || invocation.Input.Text != orcaQuestionResumeBody(command.QuestionID) {
			return result, projectError(apierrors.ScopeDenied, "question continuation changed its exact generated input")
		}
	} else if !inlineAnswer && !privateObservation && invocation.QuestionAsk == nil && invocation.NativeDelegation == nil && invocation.NativeProjectTool == nil && invocation.Handoff == nil {
		input, err := s.readInput(ctx, project, invocation.Input.Path)
		if err != nil {
			return result, err
		}
		if input != *invocation.Input {
			return result, projectError(apierrors.ContextStale, "the original Worker input file changed")
		}
		if command.Action == "question.answer" {
			selected, err := s.readInput(ctx, project, command.InputFile)
			if err != nil {
				return result, err
			}
			if selected != input {
				return result, projectError(apierrors.ContextStale, "the answer file differs from its original command")
			}
			if err := validateOrcaAnswer(input.Text); err != nil {
				return result, err
			}
		}
	}
	request := domain.ContextRequest{}
	for _, material := range scope.Context.Materials {
		if !material.Expanded {
			request.References = append(request.References, material.Reference)
		}
	}
	historicalFiles := privateObservation || invocation.NativeProjectTool != nil ||
		invocation.Handoff != nil && invocation.Handoff.SourceSelection != nil ||
		invocation.NativeDelegation != nil && invocation.NativeDelegation.ParentSelection.NativeLaunch.Tools.Mode == "project" ||
		invocation.QuestionAsk != nil && selection.NativeLaunch.Tools.Mode == "project"
	if historicalFiles {
		if err := validateOrcaHistoricalFiles(project, scope.Context); err != nil {
			return result, err
		}
	} else {
		for _, file := range scope.Context.Files {
			request.Files = append(request.Files, file.Path)
		}
	}
	currentContext, err := s.contexts.ReadProjectContext(ctx, caller, project.ID, request)
	if err != nil {
		return result, err
	}
	if currentContext.ProjectID != scope.Context.ProjectID || currentContext.SettingsRevision != scope.Context.SettingsRevision || !historicalFiles && !reflect.DeepEqual(currentContext.Files, scope.Context.Files) || !reflect.DeepEqual(currentContext.Materials, scope.Context.Materials) {
		return result, projectError(apierrors.ContextStale, "the original fixed delivery context changed")
	}
	current, err := s.authorize(ctx, caller, project.ID, permission, nil, selection.ExternalTarget)
	if err != nil {
		return result, err
	}
	if current.Settings.Revision != actor.SettingsRevision || current.Root != project.Root {
		return result, projectError(apierrors.ContextStale, "delivery approval changed while reading its sources")
	}
	if sessionObservation {
		if err := s.authorizeOrcaSessionObservation(ctx, caller, current, selection.ExternalTarget); err != nil {
			return result, err
		}
	}
	if selection.NativeLaunch.Tools.Mode == "morph" {
		if err := s.authorizeOrcaMorphTools(ctx, caller, current, selection.ExternalTarget); err != nil {
			return result, err
		}
	}
	if len(delegationTargets) > 0 {
		if err := s.authorizeOrcaDelegation(ctx, caller, current, delegationTargets...); err != nil {
			return result, err
		}
	}
	var writableRoots []string
	if len(projectToolTargets) > 0 {
		roots, err := s.authorizeOrcaProjectTools(ctx, caller, current, projectToolTargets...)
		if err != nil {
			return result, err
		}
		if invocation.NativeProjectTool != nil {
			if err := s.validateOrcaProjectToolCwd(current, *invocation.NativeProjectTool); err != nil {
				return result, err
			}
			writableRoots = roots
		}
	}
	if err := s.checkOriginalOrcaGrant(ctx, actor); err != nil {
		return result, err
	}
	return OrcaDeliveryAdmissionResult{Schema: "swa.delivery-admission.v1", ProjectID: project.ID, RequestID: command.RequestID, SettingsRevision: current.Settings.Revision, GrantExpiresAt: actor.GrantExpiresAt, WritableRoots: writableRoots}, nil
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
