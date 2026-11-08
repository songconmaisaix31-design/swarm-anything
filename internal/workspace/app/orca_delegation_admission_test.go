package app_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/projectfiles"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

func bindNativeDelegationAdmission(t *testing.T, input *deliveryAdmissionInput) {
	t.Helper()
	origin, err := uuid.NewV7()
	if err != nil {
		t.Fatal(err)
	}
	parent := *input.invocation.Selection
	parent.NativeLaunch.Tools = workspace.OrcaNativeLaunchTools{Mode: "collaboration", NativeContract: "pi-cli-1.0.1", Allowed: []string{"swa_delegate"}, Extension: &workspace.OrcaNativeConfigurationSource{Path: filepath.Join(filepath.Dir(input.project.Root), "uninvoked-install", "runtime", "pi-collaboration-extension.mjs"), Version: "unobserved-rule-input"}}
	source := &workspace.OrcaNativeDelegation{Schema: "swa.native-delegation.v1", StartRequestID: uuid.NewString(), RequestID: uuid.NewString(), WorkerRequestID: uuid.NewString(), SessionID: "parent-session-rule-input", DispatchID: "parent-dispatch-rule-input", ParentTaskID: "parent-task-rule-input", ParentSelection: parent, Origin: workspace.OrcaQuestionOrigin{NativeSessionID: origin.String(), AssistantEntryID: "assistant-entry-rule-input", ToolCallID: "tool-call-rule-input"}, Params: workspace.OrcaDelegationParams{RoleID: "child-role-rule-input", Revision: 1, Input: "检查公开代码的边界条件。\n", CompletionCriteria: []string{"返回可审阅的检查结果"}, Mode: "work"}}
	input.invocation.NativeDelegation = source
	input.invocation.Command = workspace.OrcaCommand{Action: "worker.start", Controller: input.invocation.Scope.Controller, TaskID: input.invocation.Scope.RootTaskID, RequestID: source.WorkerRequestID, ParentTaskID: source.ParentTaskID, Name: "Delegated " + source.Params.RoleID, Agent: input.invocation.Selection.AgentID, Model: input.invocation.Selection.Model, RoleID: source.Params.RoleID, Revision: source.Params.Revision, HandoffMode: source.Params.Mode, ReplyMode: "resume", QuestionMode: "disabled", DelegationMode: "disabled", CompletionCriteria: source.Params.CompletionCriteria, InputFile: "native-delegation:" + source.RequestID}
	input.invocation.Input = &domain.ContextFile{Path: input.invocation.Command.InputFile, Version: source.RequestID, Text: source.Params.Input}
}

// 使用构造的原生来源参数和真实 SQLite 项目权限；不声称此测试启动了 Worker。
func TestOrcaNativeDelegationCurrentAdmissionSQLite(t *testing.T) {
	for _, name := range []string{"human", "agent", "consult", "no-tool-permission", "no-start", "no-send", "revoked-agent", "cross-creator", "wrong-parent", "wrong-root", "wrong-request", "wrong-origin", "wrong-role", "changed-input", "changed-criteria", "wrong-reply", "inherit-tools", "parent-disabled", "parent-extra-tool", "parent-other-cli", "handoff", "question", "submission"} {
		t.Run(name, func(t *testing.T) {
			creator := "delivery-current-human"
			if name == "agent" || name == "revoked-agent" || name == "cross-creator" {
				creator = "original-agent"
			}
			input := newDeliveryAdmissionInput(t, creator, func(settings *domain.ProjectSettings) {
				settings.AllowedTools = []string{"swa_delegate"}
				if name == "no-tool-permission" {
					settings.AllowedTools = []string{}
				}
				if name == "no-start" {
					settings.AllowedActions = []string{"observe", "read_context", "send"}
				}
				if name == "no-send" {
					settings.AllowedActions = []string{"observe", "read_context", "start"}
				}
			})
			bindNativeDelegationAdmission(t, input)
			invocation, source := &input.invocation, input.invocation.NativeDelegation
			if name == "agent" || name == "revoked-agent" {
				grant := input.grant(t, creator)
				invocation.Caller.ID, invocation.Caller.Kind, invocation.Caller.GrantExpiresAt = grant.AgentID, "agent", grant.ExpiresAt
				if name == "revoked-agent" {
					if _, err := input.projects.RevokeProjectAgent(context.Background(), input.human, input.project.ID, creator); err != nil {
						t.Fatal(err)
					}
				}
			}
			switch name {
			case "consult":
				source.Params.Mode, invocation.Command.HandoffMode = "consult", "consult"
			case "wrong-parent":
				invocation.Command.ParentTaskID = "different-parent"
			case "wrong-root":
				invocation.Command.TaskID = "different-root"
			case "wrong-request":
				invocation.Command.RequestID = uuid.NewString()
			case "wrong-origin":
				source.Origin.NativeSessionID = uuid.NewString()
			case "wrong-role":
				invocation.Command.Revision++
			case "changed-input":
				invocation.Input.Text += "额外未绑定输入"
			case "changed-criteria":
				invocation.Command.CompletionCriteria = []string{"不同条件"}
			case "wrong-reply":
				invocation.Command.ReplyMode = "poll"
			case "inherit-tools":
				invocation.Command.DelegationMode = "native"
			case "parent-disabled":
				source.ParentSelection.NativeLaunch.Tools.Mode = "disabled"
			case "parent-extra-tool":
				source.ParentSelection.NativeLaunch.Tools.Allowed = []string{"swa_delegate", "bash"}
			case "parent-other-cli":
				source.ParentSelection.AgentID = "opencode"
			case "handoff":
				invocation.Handoff = &workspace.OrcaHandoffResume{}
			case "question":
				invocation.QuestionAsk = &workspace.OrcaQuestionAsk{}
			case "submission":
				invocation.Submission = &workspace.OrcaRunSubmission{}
			}
			input.check(t, name == "human" || name == "agent" || name == "consult")
		})
	}
}

func TestProjectToolPermissionRequiresNamedCapabilities(t *testing.T) {
	input := newDeliveryAdmissionInput(t, "delivery-current-human")
	projects := workspace.NewLocalProjectService(input.db, nil, projectfiles.Files{}, nil)
	if err := projects.ConfigureExternalCLIRegistry(&modelCLIRegistrationRule{}); err != nil {
		t.Fatal(err)
	}
	project := input.project
	for _, tools := range [][]string{{"swa_delegate"}, {"project_shell"}, {"project_shell", "swa_delegate"}} {
		settings := project.Settings
		settings.AllowedTools = tools
		var err error
		project, err = projects.SetProjectSettings(context.Background(), input.human, project.ID, domain.SettingsCommand{ExpectedRevision: settings.Revision, Settings: settings})
		if err != nil {
			t.Fatal("明确项目工具许可被拒绝", tools, err)
		}
	}
	for _, tools := range [][]string{{"bash"}, {"read"}, {"swa_delegate", "bash"}, {"swa_delegate", "swa_delegate"}, {"project_shell", "project_shell"}} {
		settings := project.Settings
		settings.AllowedTools = tools
		if _, err := projects.SetProjectSettings(context.Background(), input.human, project.ID, domain.SettingsCommand{ExpectedRevision: settings.Revision, Settings: settings}); err == nil {
			t.Fatal("项目接受了未知或重复的工具许可", tools)
		}
	}
}

// 原生 outer receipt 由 TS 宿主核验；这里以构造来源验证真实 SQLite 当前授权与私有观察字段。
func TestNativeDelegationObservationKeepsOriginalRequestAndAuthority(t *testing.T) {
	for _, name := range []string{"human", "agent", "project", "edited-context", "deleted-input", "no-observe", "no-start", "no-send", "no-tool", "project-without-permission", "revoked-agent", "agent-no-read", "cross-creator", "wrong-request", "wrong-root", "wrong-dispatch", "wrong-controller", "extra-project", "wrong-selection", "extra-input", "mutating-action", "ordinary-request", "observation-disabled"} {
		t.Run(name, func(t *testing.T) {
			creator := "delivery-current-human"
			if name == "agent" || name == "revoked-agent" || name == "agent-no-read" || name == "cross-creator" {
				creator = "original-observation-agent"
			}
			input := newDeliveryAdmissionInput(t, creator, func(settings *domain.ProjectSettings) {
				settings.AllowedTools = []string{"swa_delegate", "project_shell"}
				switch name {
				case "no-observe":
					settings.AllowedActions = []string{"read_context", "start", "send"}
				case "no-start":
					settings.AllowedActions = []string{"observe", "read_context", "send"}
				case "no-send":
					settings.AllowedActions = []string{"observe", "read_context", "start"}
				case "no-tool":
					settings.AllowedTools = []string{}
				case "project-without-permission":
					settings.AllowedTools = []string{"swa_delegate"}
				}
			})
			bindNativeDelegationAdmission(t, input)
			source := input.invocation.NativeDelegation
			source.ObservationOnly = true
			if name == "project" || name == "project-without-permission" {
				bindProjectDevelopmentPolicy(input, "pi")
				source.ParentSelection = *input.invocation.Selection
				source.ParentSelection.NativeLaunch.Tools.Allowed = []string{"bash", "swa_delegate"}
			}
			parent := source.ParentSelection
			input.invocation.Selection, input.invocation.Input = &parent, nil
			input.invocation.Command = workspace.OrcaCommand{Action: "request.show", Controller: input.invocation.Scope.Controller, TaskID: input.invocation.Scope.RootTaskID, DispatchID: source.DispatchID, RequestID: source.RequestID}
			if workspace.ValidateOrcaCommand(input.invocation.Command) == nil {
				t.Fatal("公开 request.show 接受了仅私有观察可用的父 Worker 字段")
			}
			if name == "agent" || name == "revoked-agent" || name == "agent-no-read" {
				grant := input.grant(t, creator)
				input.invocation.Caller.ID, input.invocation.Caller.Kind, input.invocation.Caller.GrantExpiresAt = creator, "agent", grant.ExpiresAt
				if name == "revoked-agent" {
					if _, err := input.projects.RevokeProjectAgent(context.Background(), input.human, input.project.ID, creator); err != nil {
						t.Fatal(err)
					}
				}
				if name == "agent-no-read" {
					grant.Actions = []string{"observe", "start", "send"}
					if err := input.db.SaveGrant(context.Background(), grant); err != nil {
						t.Fatal(err)
					}
				}
			}
			switch name {
			case "edited-context":
				if err := os.WriteFile(filepath.Join(input.project.Root, "context.txt"), []byte("代码已变动，原 outer receipt 仍可查询。"), 0o600); err != nil {
					t.Fatal(err)
				}
			case "deleted-input":
				if err := os.Remove(filepath.Join(input.project.Root, "input.txt")); err != nil {
					t.Fatal(err)
				}
			case "wrong-request":
				input.invocation.Command.RequestID = source.WorkerRequestID
			case "wrong-root":
				input.invocation.Command.TaskID = "different-root"
			case "wrong-dispatch":
				input.invocation.Command.DispatchID = "different-parent"
			case "wrong-controller":
				input.invocation.Command.Controller = "different-controller"
			case "extra-project":
				input.invocation.Command.ProjectID = input.project.ID
			case "wrong-selection":
				input.invocation.Selection.ConfigurationVersion = "different-parent-source"
			case "extra-input":
				input.invocation.Input = &domain.ContextFile{Path: "input.txt", Text: source.Params.Input, Version: source.RequestID}
			case "mutating-action":
				input.invocation.Command.Action = "worker.start"
			case "ordinary-request":
				input.invocation.NativeDelegation = nil
				input.invocation.Command.TaskID, input.invocation.Command.DispatchID = "", ""
			case "observation-disabled":
				source.ObservationOnly = false
			}
			allowed := name == "human" || name == "agent" || name == "project" || name == "edited-context" || name == "deleted-input"
			input.check(t, allowed)
			if allowed {
				result, err := input.service.AdmitOrcaDelivery(context.Background(), input.invocation)
				if err != nil || result.RequestID != source.RequestID || len(result.WritableRoots) != 0 {
					t.Fatal("只读委派观察改变了原请求或授予了命令目录", result, err)
				}
			}
		})
	}
}
