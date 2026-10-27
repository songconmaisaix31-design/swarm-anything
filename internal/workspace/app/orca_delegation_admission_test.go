package app_test

import (
	"context"
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

func TestDelegationProjectPermissionKeepsNativeToolsClosed(t *testing.T) {
	input := newDeliveryAdmissionInput(t, "delivery-current-human")
	projects := workspace.NewLocalProjectService(input.db, nil, projectfiles.Files{}, nil)
	if err := projects.ConfigureExternalCLIRegistry(&modelCLIRegistrationRule{}); err != nil {
		t.Fatal(err)
	}
	settings := input.project.Settings
	settings.AllowedTools = []string{"swa_delegate"}
	project, err := projects.SetProjectSettings(context.Background(), input.human, input.project.ID, domain.SettingsCommand{ExpectedRevision: settings.Revision, Settings: settings})
	if err != nil {
		t.Fatal("明确项目委派许可被拒绝", err)
	}
	for _, tools := range [][]string{{"bash"}, {"read"}, {"swa_delegate", "bash"}, {"swa_delegate", "swa_delegate"}} {
		settings = project.Settings
		settings.AllowedTools = tools
		if _, err := projects.SetProjectSettings(context.Background(), input.human, project.ID, domain.SettingsCommand{ExpectedRevision: settings.Revision, Settings: settings}); err == nil {
			t.Fatal("项目委派许可扩大为其他原生工具", tools)
		}
	}
}
