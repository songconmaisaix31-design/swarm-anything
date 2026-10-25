package app_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	orcaadapter "github.com/songconmaisaix31-design/Astrocyte/internal/adapters/orca"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/projectfiles"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/swastore"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
	migrations "github.com/songconmaisaix31-design/Astrocyte/migrations/swa"
)

type deliveryAdmissionInput struct {
	db         *swastore.DB
	projects   workspace.LocalProjects
	service    *workspace.OrcaExecutionService
	human      domain.Caller
	project    domain.LocalProject
	invocation workspace.OrcaInvocation
	link       workspace.OrcaExecutionLink
}

func newDeliveryAdmissionInput(t *testing.T, creator string, configure ...func(*domain.ProjectSettings)) *deliveryAdmissionInput {
	t.Helper()
	ctx := context.Background()
	directory := t.TempDir()
	db, err := swastore.Open(filepath.Join(directory, "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.RunMigrations(ctx, migrations.FS); err != nil {
		t.Fatal(err)
	}
	human := domain.Caller{Kind: "human", ID: "delivery-current-human"}
	spaces := workspace.NewProjectSpaceService(swastore.NewProjectSpaceRepository(db), workspace.ProjectSpaceOptions{})
	space, err := spaces.CreateProjectSpace(ctx, human, workspace.ProjectSpaceCommand{WorkspaceCommandMeta: workspace.WorkspaceCommandMeta{SchemaVersion: 1, RequestID: uuid.NewString(), IdempotencyKey: uuid.NewString(), ExpectedVersion: 1}, Title: "公开准入规则验证"})
	if err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(directory, "public-inputs")
	if err := os.MkdirAll(root, 0o700); err != nil {
		t.Fatal(err)
	}
	for path, text := range map[string]string{"input.txt": "请继续核对公开接口，不调用工具。\n", "context.txt": "公开准入检查的明确上下文。\n"} {
		if err := os.WriteFile(filepath.Join(root, path), []byte(text), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	projects := workspace.NewLocalProjectService(db, nil, projectfiles.Files{}, nil)
	project, err := projects.RegisterProject(ctx, human, domain.RegisterProjectCommand{Name: "公开输入准入", Root: root, SpaceID: space.Space.ID})
	if err != nil {
		t.Fatal(err)
	}
	settings := project.Settings
	settings.AllowDirectory, settings.AllowAgentControl = true, true
	settings.AllowedSubdirs = []string{"."}
	settings.AllowedActions = []string{"observe", "read_context", "start", "send", "stop"}
	settings.ExternalModelCLI = "pi"
	for _, apply := range configure {
		apply(&settings)
	}
	project = saveAdmissionSettings(t, db, project, settings)
	human.ProjectID = project.ID
	packet, err := projects.ReadProjectContext(ctx, human, project.ID, domain.ContextRequest{Files: []string{"context.txt"}})
	if err != nil {
		t.Fatal(err)
	}
	inputs, err := (projectfiles.Files{}).ReadProjectFiles(ctx, project, []string{"input.txt"})
	if err != nil || len(inputs) != 1 {
		t.Fatal("实际输入文件读取失败", err)
	}
	// 此处只验证持久化与效果前授权；选择与 Run 标识是规则输入，不声称原生来源已观察。
	sourceHome := filepath.Join(directory, "account-rule-input")
	selection := workspace.OrcaAgentSelection{AgentID: "pi", Adapter: "pi", ExecutionMode: "structured", Executable: filepath.Join(directory, "uninvoked-native-entry"), Version: "1.0.1", Model: "openai/gpt-rule-input", Provider: "openai", ExternalTarget: "pi", ConfigurationVersion: "unobserved-admission-input", NativeLaunch: workspace.OrcaNativeLaunchPolicy{Schema: "swa.native-launch.v1", Account: workspace.OrcaNativeLaunchAccount{Kind: "pi-native-api-key-per-session", Provider: "openai", SourceHome: sourceHome, AuthSource: workspace.OrcaNativeConfigurationSource{Path: filepath.Join(sourceHome, "auth.json"), Version: "unobserved-admission-input"}, PrivateRoot: filepath.Join(directory, "pi-workers", project.ID), ModelTarget: workspace.OrcaNativeModelTarget{ModelID: "gpt-rule-input", API: "openai-responses", BaseURL: "https://api.openai.com"}}, Tools: workspace.OrcaNativeLaunchTools{Mode: "disabled", NativeContract: "pi-cli-1.0.1"}}}
	invocation := workspace.OrcaInvocation{Command: workspace.OrcaCommand{Action: "worker.send", Controller: "approval-input-controller", DispatchID: "approval-input-dispatch", RequestID: uuid.NewString(), InputFile: "input.txt"}, Caller: workspace.OrcaExecutionCaller{ID: human.ID, Kind: human.Kind, ProjectID: project.ID, SettingsRevision: project.Settings.Revision}, Project: project, Scope: workspace.OrcaScope{ProjectID: project.ID, Controller: "approval-input-controller", RunID: "approval-input-run", RootTaskID: "approval-input-root", AuthorityDomain: "approval-input-authority", Context: packet}, Input: &inputs[0], Selection: &selection}
	link := workspace.OrcaExecutionLink{ProjectID: project.ID, GrantAgentID: creator, SettingsRevision: project.Settings.Revision, AuthorityDomain: invocation.Scope.AuthorityDomain, RunID: invocation.Scope.RunID, RootTaskID: invocation.Scope.RootTaskID, CreatedAt: time.Now().UTC()}
	if err := db.SaveOrcaExecutionLink(ctx, link); err != nil {
		t.Fatal(err)
	}
	// 使用未调用的实际适配器满足构造契约；一旦错误进入原生路径就应失败，不提供替身返回。
	service, err := workspace.NewOrcaExecutionService(db, projectfiles.Files{}, projects, &orcaadapter.Runtime{}, db)
	if err != nil {
		t.Fatal(err)
	}
	return &deliveryAdmissionInput{db: db, projects: projects, service: service, human: human, project: project, invocation: invocation, link: link}
}

// 设置是效果前规则参数；实际 CAS 存储不代表已观察原生注册或账号。
func saveAdmissionSettings(t *testing.T, db *swastore.DB, project domain.LocalProject, settings domain.ProjectSettings) domain.LocalProject {
	t.Helper()
	expected := project.Settings.Revision
	settings.Revision = expected + 1
	project.Settings = settings
	if err := db.SaveProject(context.Background(), project, expected); err != nil {
		t.Fatal(err)
	}
	stored, err := db.LoadProject(context.Background(), project.ID)
	if err != nil || !reflect.DeepEqual(stored.Settings, settings) {
		t.Fatal("实际准入规则参数没有按原 revision 保存", err)
	}
	return stored
}

func (input *deliveryAdmissionInput) grant(t *testing.T, id string) domain.ProjectGrant {
	t.Helper()
	ctx := context.Background()
	if _, err := input.projects.GrantProjectAgent(ctx, input.human, input.project.ID, domain.ProjectGrant{AgentID: id, Actions: []string{"observe", "read_context", "start", "send"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := input.projects.IssueProjectAgentToken(ctx, input.human, input.project.ID, id); err != nil {
		t.Fatal(err)
	}
	grant, err := input.db.LoadGrant(ctx, input.project.ID, id)
	if err != nil {
		t.Fatal(err)
	}
	return grant
}

func (input *deliveryAdmissionInput) check(t *testing.T, allowed bool) {
	t.Helper()
	result, err := input.service.AdmitOrcaDelivery(context.Background(), input.invocation)
	if allowed && (err != nil || result.Schema != "swa.delivery-admission.v1" || result.RequestID != input.invocation.Command.RequestID || result.ProjectID != input.project.ID || input.invocation.Caller.Kind == "human" && result.GrantExpiresAt != nil) {
		t.Fatalf("实际当前准入不符: result=%+v error=%v", result, err)
	}
	if !allowed && err == nil {
		t.Fatal("越界的效果前准入被接受")
	}
	link, loadErr := input.db.LoadOrcaExecutionLink(context.Background(), input.link.AuthorityDomain, input.link.RunID)
	if loadErr != nil || !reflect.DeepEqual(link, input.link) {
		t.Fatal("准入改写了原创建者或原生关联", loadErr)
	}
	var count int
	if err := input.db.Conn().QueryRow("SELECT COUNT(*) FROM local_agent_sessions").Scan(&count); err != nil || count != 0 {
		t.Fatal("效果前准入产生了会话副作用", count, err)
	}
}

func TestOrcaDeliveryHumanIndependentSendSQLite(t *testing.T) {
	for _, creatorState := range []string{"absent", "current", "revoked", "expired"} {
		t.Run(creatorState, func(t *testing.T) {
			input := newDeliveryAdmissionInput(t, "original-agent")
			if creatorState != "absent" {
				grant := input.grant(t, "original-agent")
				if creatorState == "revoked" {
					if _, err := input.projects.RevokeProjectAgent(context.Background(), input.human, input.project.ID, grant.AgentID); err != nil {
						t.Fatal(err)
					}
				} else if creatorState == "expired" {
					past := time.Now().UTC().Add(-time.Minute)
					grant.ExpiresAt = &past
					if err := input.db.SaveGrant(context.Background(), grant); err != nil {
						t.Fatal(err)
					}
				}
			}
			input.check(t, true)
		})
	}
}

func TestOrcaDeliveryCurrentAuthorizationBoundariesSQLite(t *testing.T) {
	cases := []string{"cross-creator-start", "agent-wrong-creator-send", "agent-wrong-creator-start", "human-carries-grant", "empty-human", "unknown-kind", "wrong-project", "wrong-root", "wrong-run", "wrong-authority", "wrong-revision", "changed-input", "changed-context", "enabled-tools", "wrong-model", "disabled-control", "missing-send", "denied-directory", "wrong-external-target"}
	for _, name := range cases {
		t.Run(name, func(t *testing.T) {
			input := newDeliveryAdmissionInput(t, "original-agent")
			invocation := &input.invocation
			if name == "cross-creator-start" || name == "agent-wrong-creator-start" {
				invocation.Command.Action, invocation.Command.DispatchID = "worker.start", ""
				invocation.Command.TaskID, invocation.Command.Name, invocation.Command.Agent, invocation.Command.Model = invocation.Scope.RootTaskID, "explicit-review", "pi", invocation.Selection.Model
			}
			switch name {
			case "agent-wrong-creator-send", "agent-wrong-creator-start":
				grant := input.grant(t, "different-agent")
				invocation.Caller.ID, invocation.Caller.Kind, invocation.Caller.GrantExpiresAt = grant.AgentID, "agent", grant.ExpiresAt
			case "human-carries-grant":
				future := time.Now().UTC().Add(time.Hour)
				invocation.Caller.GrantExpiresAt = &future
			case "empty-human":
				invocation.Caller.ID = ""
			case "unknown-kind":
				invocation.Caller.Kind = "browser-claimed-human"
			case "wrong-project":
				invocation.Scope.ProjectID = uuid.NewString()
			case "wrong-root":
				invocation.Scope.RootTaskID = "different-root"
			case "wrong-run":
				invocation.Scope.RunID = "different-run"
			case "wrong-authority":
				invocation.Scope.AuthorityDomain = "different-authority"
			case "wrong-revision":
				invocation.Caller.SettingsRevision++
			case "changed-input", "changed-context":
				file := "input.txt"
				if name == "changed-context" {
					file = "context.txt"
				}
				if err := os.WriteFile(filepath.Join(input.project.Root, file), []byte("公开文件已变更\n"), 0o600); err != nil {
					t.Fatal(err)
				}
			case "enabled-tools":
				invocation.Selection.NativeLaunch.Tools.Mode = "enabled"
			case "wrong-model":
				invocation.Selection.Model = "openai/different-model"
			case "disabled-control", "missing-send", "denied-directory", "wrong-external-target":
				settings := input.project.Settings
				switch name {
				case "disabled-control":
					settings.AllowAgentControl = false
				case "missing-send":
					settings.AllowedActions = []string{"observe", "read_context", "start"}
				case "denied-directory":
					settings.AllowDirectory = false
				case "wrong-external-target":
					settings.ExternalModelCLI = "codex"
				}
				saveAdmissionSettings(t, input.db, input.project, settings)
			}
			input.check(t, false)
		})
	}
}

func TestOrcaDeliveryOriginalCreatorStillAuthorizedSQLite(t *testing.T) {
	for _, kind := range []string{"human", "agent"} {
		t.Run(kind, func(t *testing.T) {
			creator := "delivery-current-human"
			if kind == "agent" {
				creator = "original-agent"
			}
			input := newDeliveryAdmissionInput(t, creator)
			if kind == "agent" {
				grant := input.grant(t, creator)
				input.invocation.Caller.ID, input.invocation.Caller.Kind, input.invocation.Caller.GrantExpiresAt = creator, kind, grant.ExpiresAt
			}
			input.check(t, true)
			input.invocation.Command.Action, input.invocation.Command.DispatchID = "worker.start", ""
			input.invocation.Command.TaskID, input.invocation.Command.Name, input.invocation.Command.Agent, input.invocation.Command.Model = input.invocation.Scope.RootTaskID, "explicit-review", "pi", input.invocation.Selection.Model
			input.check(t, true)
			if kind == "agent" {
				if _, err := input.projects.RevokeProjectAgent(context.Background(), input.human, input.project.ID, creator); err != nil {
					t.Fatal(err)
				}
				input.check(t, false)
			}
		})
	}
}

func TestOrcaDeliveryLegacyPiInputRejectedSQLite(t *testing.T) {
	for _, action := range []string{"worker.start", "worker.send"} {
		t.Run(action, func(t *testing.T) {
			input := newDeliveryAdmissionInput(t, "delivery-current-human")
			account := &input.invocation.Selection.NativeLaunch.Account
			account.Kind = "pi-native-api-key"
			account.PrivateHome = filepath.Join(filepath.Dir(filepath.Dir(account.PrivateRoot)), "pi", input.project.ID)
			account.PrivateRoot = ""
			if action == "worker.start" {
				input.invocation.Command.Action, input.invocation.Command.DispatchID = action, ""
				input.invocation.Command.TaskID, input.invocation.Command.Name, input.invocation.Command.Agent, input.invocation.Command.Model = input.invocation.Scope.RootTaskID, "explicit-review", "pi", input.invocation.Selection.Model
			}
			input.check(t, false)
		})
	}
}

func bindNativeQuestionPolicy(input *deliveryAdmissionInput) {
	input.invocation.Selection.NativeLaunch.Tools.Mode = "questions-only"
	input.invocation.Selection.NativeLaunch.Tools.Extension = &workspace.OrcaNativeConfigurationSource{Path: filepath.Join(filepath.Dir(input.project.Root), "uninvoked-install", "runtime", "pi-question-extension.mjs"), Version: "unobserved-admission-rule-source"}
	input.invocation.Selection.NativeLaunch.Tools.Allowed = []string{"swa_ask"}
}

func bindNativeQuestionAdmission(t *testing.T, input *deliveryAdmissionInput, resume bool) {
	t.Helper()
	bindNativeQuestionPolicy(input)
	nativeSessionID, err := uuid.NewV7()
	if err != nil {
		t.Fatal(err)
	}
	question := "  原生问题\n<&> 与多字节正文。\u2028 \n"
	params := workspace.OrcaQuestionParams{Question: &question}
	questionID := ""
	if resume {
		questionID = "original-question-rule-input"
		params = workspace.OrcaQuestionParams{Resume: &questionID}
	}
	requestID := input.invocation.Command.RequestID
	input.invocation.QuestionAsk = &workspace.OrcaQuestionAsk{StartRequestID: uuid.NewString(), RequestID: requestID, QuestionID: questionID, SessionID: "original-session-rule-input", DispatchID: input.invocation.Command.DispatchID, Origin: workspace.OrcaQuestionOrigin{NativeSessionID: nativeSessionID.String(), AssistantEntryID: "original-entry-rule-input", ToolCallID: "original-tool-rule-input"}, Params: params}
	body, err := json.Marshal(params)
	if err != nil {
		t.Fatal(err)
	}
	input.invocation.Command.InputFile = "native-question:" + requestID
	input.invocation.Input = &domain.ContextFile{Path: input.invocation.Command.InputFile, Version: requestID, Text: string(body)}
}

func TestOrcaNativeQuestionPrivateAdmissionSQLite(t *testing.T) {
	for _, name := range []string{"question", "resume", "wrong-creator", "wrong-request", "wrong-start", "wrong-session", "wrong-dispatch", "wrong-input", "wrong-version", "changed-text", "extra-param", "both-params", "missing-question", "oversized", "disabled", "wrong-tool", "handoff", "submission", "missing-send", "changed-context", "revoked-agent"} {
		t.Run(name, func(t *testing.T) {
			creator := "delivery-current-human"
			if name == "wrong-creator" || name == "revoked-agent" {
				creator = "original-agent"
			}
			input := newDeliveryAdmissionInput(t, creator)
			bindNativeQuestionAdmission(t, input, name == "resume" || name == "missing-question")
			invocation, ask := &input.invocation, input.invocation.QuestionAsk
			switch name {
			case "wrong-request":
				ask.RequestID = uuid.NewString()
			case "wrong-start":
				ask.StartRequestID = "not-a-request"
			case "wrong-session":
				ask.Origin.NativeSessionID = uuid.NewString()
			case "wrong-dispatch":
				ask.DispatchID = "different-dispatch"
			case "wrong-input":
				invocation.Input.Path = "native-question:" + uuid.NewString()
			case "wrong-version":
				invocation.Input.Version = uuid.NewString()
			case "changed-text":
				invocation.Input.Text = `{"question":"不同正文"}`
			case "extra-param":
				invocation.Input.Text = `{"question":"原文","from":"another-worker"}`
			case "both-params":
				questionID := "another-question"
				ask.Params.Resume = &questionID
			case "missing-question":
				ask.QuestionID = ""
			case "oversized":
				question := strings.Repeat("界", 10667)
				ask.Params.Question = &question
			case "disabled":
				invocation.Selection.NativeLaunch.Tools = workspace.OrcaNativeLaunchTools{Mode: "disabled", NativeContract: "pi-cli-1.0.1"}
			case "wrong-tool":
				invocation.Selection.NativeLaunch.Tools.Allowed = []string{"swa_ask", "bash"}
			case "handoff":
				invocation.Handoff = &workspace.OrcaHandoffResume{}
			case "submission":
				invocation.Submission = &workspace.OrcaRunSubmission{}
			case "missing-send":
				settings := input.project.Settings
				settings.AllowedActions = []string{"observe", "read_context", "start"}
				saveAdmissionSettings(t, input.db, input.project, settings)
			case "changed-context":
				if err := os.WriteFile(filepath.Join(input.project.Root, "context.txt"), []byte("原上下文已变化。"), 0o600); err != nil {
					t.Fatal(err)
				}
			case "revoked-agent":
				grant := input.grant(t, "original-agent")
				invocation.Caller.ID, invocation.Caller.Kind, invocation.Caller.GrantExpiresAt = grant.AgentID, "agent", grant.ExpiresAt
				if _, err := input.projects.RevokeProjectAgent(context.Background(), input.human, input.project.ID, grant.AgentID); err != nil {
					t.Fatal(err)
				}
			}
			// 此处使用真实项目存储核授权，不声称已观察 Worker、原生工具调用或模型。
			input.check(t, name == "question" || name == "resume")
		})
	}
}

func TestOrcaQuestionResumeCurrentApprovalSQLite(t *testing.T) {
	for _, name := range []string{"human", "agent", "different-agent", "changed-body", "changed-version", "changed-path", "disabled", "custom-input", "wrong-root", "private-ask", "missing-send", "wrong-external"} {
		t.Run(name, func(t *testing.T) {
			input := newDeliveryAdmissionInput(t, "original-agent")
			bindNativeQuestionPolicy(input)
			invocation := &input.invocation
			command := &invocation.Command
			command.Action, command.InputFile = "question.resume", ""
			command.RunID, command.TaskID, command.QuestionID = invocation.Scope.RunID, invocation.Scope.RootTaskID, "original-question-rule-input"
			invocation.Input = &domain.ContextFile{Path: "native-question-resume:" + command.QuestionID, Version: command.RequestID, Text: "使用 swa_ask 的 resume 参数读取原问题 " + command.QuestionID + " 的答案，并继续当前任务。"}
			switch name {
			case "agent", "different-agent":
				id := "original-agent"
				if name == "different-agent" {
					id = "different-agent"
				}
				grant := input.grant(t, id)
				invocation.Caller.ID, invocation.Caller.Kind, invocation.Caller.GrantExpiresAt = id, "agent", grant.ExpiresAt
			case "changed-body":
				invocation.Input.Text += " 再执行额外指令。"
			case "changed-version":
				invocation.Input.Version = uuid.NewString()
			case "changed-path":
				invocation.Input.Path = "input.txt"
			case "disabled":
				invocation.Selection.NativeLaunch.Tools = workspace.OrcaNativeLaunchTools{Mode: "disabled", NativeContract: "pi-cli-1.0.1"}
			case "custom-input":
				command.InputFile = "input.txt"
			case "wrong-root":
				command.TaskID = "another-root"
			case "private-ask":
				invocation.QuestionAsk = &workspace.OrcaQuestionAsk{}
			case "missing-send":
				settings := input.project.Settings
				settings.AllowedActions = []string{"observe", "read_context", "start"}
				saveAdmissionSettings(t, input.db, input.project, settings)
			case "wrong-external":
				invocation.Selection.ExternalTarget = "codex"
			}
			input.check(t, name == "human" || name == "agent")
		})
	}
}
