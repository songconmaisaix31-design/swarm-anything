package app_test

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/google/uuid"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

func bindProjectDevelopmentPolicy(input *deliveryAdmissionInput, agent string) {
	selection := input.invocation.Selection
	selection.NativeLaunch.Tools = workspace.OrcaNativeLaunchTools{Mode: "project", NativeContract: "pi-cli-1.0.1", Allowed: []string{"bash"}, Extension: &workspace.OrcaNativeConfigurationSource{Path: filepath.Join(filepath.Dir(input.project.Root), "uninvoked-install", "runtime", "pi-project-extension.mjs"), Version: "unobserved-rule-input"}}
	if agent == "opencode" {
		source := filepath.Join(filepath.Dir(input.project.Root), "opencode-account-rule-input")
		selection.AgentID, selection.ExternalTarget, selection.Version = "opencode", "opencode", "2.0.31"
		selection.Provider, selection.Model = "stepfun", "stepfun/step-3.5-flash"
		selection.NativeLaunch.Account = workspace.OrcaNativeLaunchAccount{Kind: "opencode-native-stepfun-api-key", Provider: "stepfun", SourceHome: source, PrivateRoot: filepath.Join(filepath.Dir(input.project.Root), "opencode", input.project.ID), CredentialID: "unobserved-credential-rule-input", AuthSource: workspace.OrcaNativeConfigurationSource{Path: filepath.Join(source, ".local", "share", "opencode", "auth.json"), Version: "unobserved-rule-input"}, ConfigSource: workspace.OrcaNativeConfigurationSource{Path: filepath.Join(source, ".config", "opencode", "opencode.jsonc"), Version: "unobserved-rule-input"}, DatabaseSource: workspace.OrcaNativeConfigurationSource{Path: filepath.Join(source, ".local", "share", "opencode", "opencode.db"), Version: "unobserved-rule-input"}, ModelTarget: workspace.OrcaNativeModelTarget{ModelID: "step-3.5-flash", API: "openai-completions", BaseURL: "https://api.stepfun.com/v1"}}
		selection.NativeLaunch.Tools = workspace.OrcaNativeLaunchTools{Mode: "project", NativeContract: "opencode-cli-2.0.31", Allowed: []string{"shell"}, Shell: &workspace.OrcaNativeConfigurationSource{Path: filepath.Join(filepath.Dir(input.project.Root), "uninvoked-install", "runtime", "project-shell"), Version: "unobserved-rule-input"}}
	}
}

func bindNativeProjectToolAdmission(t *testing.T, input *deliveryAdmissionInput, agent string) {
	t.Helper()
	bindProjectDevelopmentPolicy(input, agent)
	nativeID, err := uuid.NewV7()
	if err != nil {
		t.Fatal(err)
	}
	requestID := input.invocation.Command.RequestID
	source := &workspace.OrcaNativeProjectTool{Schema: "swa.native-project-tool.v1", StartRequestID: uuid.NewString(), RequestID: requestID, SessionID: "worker-session-rule-input", DispatchID: input.invocation.Command.DispatchID, TaskID: "worker-task-rule-input", Origin: workspace.OrcaProjectToolOrigin{Agent: agent, NativeSessionID: nativeID.String(), AssistantEntryID: "assistant-entry-rule-input", ToolCallID: "tool-call-rule-input"}, Input: workspace.OrcaProjectToolInput{Command: "printf '%s' reviewed"}, Cwd: input.project.Root}
	if agent == "opencode" {
		source.Origin.NativeSessionID, source.Origin.AssistantEntryID, source.Origin.MessageID = "native-session-rule-input", "", "message-rule-input"
	}
	input.invocation.NativeProjectTool = source
	input.invocation.Command.InputFile = "native-project-tool:" + requestID
	input.invocation.Input = &domain.ContextFile{Path: input.invocation.Command.InputFile, Version: requestID, Text: source.Input.Command}
}

// 来源是明确构造的规则输入；实际授权、路径和 SQLite 检查均执行生产代码，不执行命令。
func TestNativeProjectToolAdmissionUsesCurrentScopeSQLite(t *testing.T) {
	for _, agent := range []string{"pi", "opencode"} {
		for _, name := range []string{"allowed", "edited-context", "deleted-context", "no-permission", "no-start", "no-send", "revoked-agent", "wrong-request", "wrong-dispatch", "wrong-input", "wrong-origin", "outside-cwd", "background", "timeout", "mixed-source"} {
			t.Run(agent+"/"+name, func(t *testing.T) {
				creator := "delivery-current-human"
				if name == "revoked-agent" {
					creator = "project-tool-agent"
				}
				input := newDeliveryAdmissionInput(t, creator, func(settings *domain.ProjectSettings) {
					settings.ExternalModelCLIs = []string{"pi", "opencode"}
					settings.AllowedTools = []string{"project_shell"}
					if name == "no-permission" {
						settings.AllowedTools = []string{}
					}
					if name == "no-start" {
						settings.AllowedActions = []string{"observe", "read_context", "send"}
					}
					if name == "no-send" {
						settings.AllowedActions = []string{"observe", "read_context", "start"}
					}
				})
				bindNativeProjectToolAdmission(t, input, agent)
				source := input.invocation.NativeProjectTool
				switch name {
				case "edited-context":
					if err := os.WriteFile(filepath.Join(input.project.Root, "context.txt"), []byte("项目代码已经合法修改。"), 0o600); err != nil {
						t.Fatal(err)
					}
				case "deleted-context":
					if err := os.Remove(filepath.Join(input.project.Root, "context.txt")); err != nil {
						t.Fatal(err)
					}
				case "revoked-agent":
					grant := input.grant(t, creator)
					input.invocation.Caller.ID, input.invocation.Caller.Kind, input.invocation.Caller.GrantExpiresAt = creator, "agent", grant.ExpiresAt
					if _, err := input.projects.RevokeProjectAgent(context.Background(), input.human, input.project.ID, creator); err != nil {
						t.Fatal(err)
					}
				case "wrong-request":
					source.RequestID = uuid.NewString()
				case "wrong-dispatch":
					source.DispatchID = "another-worker"
				case "wrong-input":
					input.invocation.Input.Text = "different command"
				case "wrong-origin":
					if agent == "pi" {
						source.Origin.MessageID = "foreign-message"
					} else {
						source.Origin.AssistantEntryID = "foreign-entry"
					}
				case "outside-cwd":
					source.Cwd = filepath.Dir(input.project.Root)
				case "background":
					background := true
					source.Input.Background = &background
				case "timeout":
					timeout := -1.0
					source.Input.Timeout = &timeout
				case "mixed-source":
					input.invocation.QuestionAsk = &workspace.OrcaQuestionAsk{}
				}
				allowed := name == "allowed" || name == "edited-context" || name == "deleted-context"
				input.check(t, allowed)
				if allowed {
					result, err := input.service.AdmitOrcaDelivery(context.Background(), input.invocation)
					if err != nil || !reflect.DeepEqual(result.WritableRoots, []string{input.project.Root}) {
						t.Fatal("工具准入未返回当前许可目录", result.WritableRoots, err)
					}
				}
			})
		}
	}
}

func TestProjectHandoffUsesHistoricalFilesWithoutWeakeningNewInput(t *testing.T) {
	for _, name := range []string{"project-handoff", "unproven-handoff", "new-input", "first-start"} {
		t.Run(name, func(t *testing.T) {
			input := newDeliveryAdmissionInput(t, "delivery-current-human", func(settings *domain.ProjectSettings) { settings.AllowedTools = []string{"project_shell"} })
			bindProjectDevelopmentPolicy(input, "pi")
			if name == "project-handoff" || name == "unproven-handoff" {
				source := *input.invocation.Selection
				input.invocation.Selection.NativeLaunch.Tools = workspace.OrcaNativeLaunchTools{Mode: "disabled", NativeContract: "pi-cli-1.0.1"}
				handoff := &workspace.OrcaHandoffResume{Schema: "swa.handoff-resume.v1", SourceTaskID: "child-task", SourceDispatchID: "child-dispatch", ParentTaskID: "parent-task", ParentDispatchID: input.invocation.Command.DispatchID, MailID: "child-task/completed"}
				if name == "project-handoff" {
					handoff.SourceSelection = &source
				}
				input.invocation.Handoff = handoff
				input.invocation.Command.InputFile = "native-handoff:" + handoff.MailID
				input.invocation.Input = &domain.ContextFile{Path: input.invocation.Command.InputFile, Version: handoff.MailID, Text: "子 Worker 已交付可审阅的代码修改。"}
			} else if name == "first-start" {
				command := &input.invocation.Command
				command.Action, command.DispatchID, command.TaskID, command.Name = "worker.start", "", input.invocation.Scope.RootTaskID, "developer"
				command.Agent, command.Model, command.DevelopmentMode = "pi", input.invocation.Selection.Model, "project"
			}
			if err := os.WriteFile(filepath.Join(input.project.Root, "context.txt"), []byte("子任务已经修改此文件。"), 0o600); err != nil {
				t.Fatal(err)
			}
			input.check(t, name == "project-handoff")
		})
	}
}

func TestNativeProjectToolCwdFollowsApprovedSubdirectory(t *testing.T) {
	for _, name := range []string{"permitted-workspace", "unpermitted-project-root", "historical-file-outside"} {
		t.Run(name, func(t *testing.T) {
			input := newDeliveryAdmissionInput(t, "delivery-current-human", func(settings *domain.ProjectSettings) { settings.AllowedTools = []string{"project_shell"} })
			subdir := filepath.Join(input.project.Root, "approved")
			if err := os.Mkdir(subdir, 0o700); err != nil {
				t.Fatal(err)
			}
			settings := input.project.Settings
			settings.AllowedSubdirs = []string{"approved"}
			input.project = saveAdmissionSettings(t, input.db, input.project, settings)
			input.invocation.Project = input.project
			input.invocation.Caller.SettingsRevision = input.project.Settings.Revision
			input.invocation.Scope.Context.SettingsRevision = input.project.Settings.Revision
			input.invocation.Scope.RunID = "subdirectory-rule-run"
			// 历史来源为明确构造的已接受快照，不要求当前文件仍然存在。
			input.invocation.Scope.Context.Files[0].Path = "approved/context.txt"
			input.link.SettingsRevision = input.project.Settings.Revision
			input.link.RunID = input.invocation.Scope.RunID
			if err := input.db.SaveOrcaExecutionLink(context.Background(), input.link); err != nil {
				t.Fatal(err)
			}
			bindNativeProjectToolAdmission(t, input, "pi")
			input.invocation.NativeProjectTool.Cwd = subdir
			if name == "unpermitted-project-root" {
				input.invocation.NativeProjectTool.Cwd = input.project.Root
			}
			if name == "historical-file-outside" {
				input.invocation.Scope.Context.Files[0].Path = "context.txt"
			}
			input.check(t, name == "permitted-workspace")
			if name == "permitted-workspace" {
				result, err := input.service.AdmitOrcaDelivery(context.Background(), input.invocation)
				if err != nil || !reflect.DeepEqual(result.WritableRoots, []string{subdir}) {
					t.Fatal("工具目录许可未保留当前子目录范围", result.WritableRoots, err)
				}
			}
		})
	}
}

func TestProjectNativeCollaborationRetainsAcceptedCodeSnapshot(t *testing.T) {
	for _, name := range []string{"project-delegate", "project-question", "delegate-without-project-source", "question-without-project-source", "project-source-without-permission", "ordinary-input"} {
		t.Run(name, func(t *testing.T) {
			input := newDeliveryAdmissionInput(t, "delivery-current-human", func(settings *domain.ProjectSettings) {
				settings.AllowedTools = []string{"swa_delegate", "project_shell"}
				if name == "project-source-without-permission" {
					settings.AllowedTools = []string{"swa_delegate"}
				}
			})
			switch name {
			case "project-delegate", "delegate-without-project-source", "project-source-without-permission":
				bindNativeDelegationAdmission(t, input)
				if name != "delegate-without-project-source" {
					bindProjectDevelopmentPolicy(input, "pi")
					input.invocation.NativeDelegation.ParentSelection.NativeLaunch.Tools = input.invocation.Selection.NativeLaunch.Tools
					input.invocation.NativeDelegation.ParentSelection.NativeLaunch.Tools.Allowed = []string{"bash", "swa_delegate"}
					input.invocation.Selection.NativeLaunch.Tools = workspace.OrcaNativeLaunchTools{Mode: "disabled", NativeContract: "pi-cli-1.0.1"}
					input.invocation.Command.DevelopmentMode = "disabled"
				}
			case "project-question", "question-without-project-source":
				bindNativeQuestionAdmission(t, input, false)
				if name == "project-question" {
					bindProjectDevelopmentPolicy(input, "pi")
					input.invocation.Selection.NativeLaunch.Tools.Allowed = []string{"bash", "swa_ask"}
				}
			case "ordinary-input":
				bindProjectDevelopmentPolicy(input, "pi")
			}
			if err := os.WriteFile(filepath.Join(input.project.Root, "context.txt"), []byte("主 Worker 已修改这份代码，继续从原生工具委派或提问。"), 0o600); err != nil {
				t.Fatal(err)
			}
			input.check(t, name == "project-delegate" || name == "project-question")
		})
	}
}

// 会话、原 start 与 ready 状态由原生宿主核对；此处用构造来源验证当前 SQLite 权限。
func TestNativeSessionObservationKeepsAcceptedContextAndOwnWorkerScope(t *testing.T) {
	for _, agent := range []string{"pi", "opencode"} {
		for _, name := range []string{"human", "agent", "text-only", "deleted-input", "ordinary-input", "revoked-agent", "no-start", "no-send", "no-observe", "no-project-tools", "wrong-request", "wrong-dispatch", "wrong-root", "wrong-project", "root-worker-task", "empty-session", "mixed-delegation", "mixed-question", "mixed-project-tool", "mixed-handoff", "mixed-submission", "mutating-start", "mutating-send", "outside-history"} {
			t.Run(agent+"/"+name, func(t *testing.T) {
				creator := "delivery-current-human"
				if name == "agent" || name == "revoked-agent" {
					creator = "session-observer-agent"
				}
				input := newDeliveryAdmissionInput(t, creator, func(settings *domain.ProjectSettings) {
					settings.ExternalModelCLIs = []string{"pi", "opencode"}
					settings.AllowedTools = []string{"project_shell"}
					switch name {
					case "text-only", "no-project-tools":
						settings.AllowedTools = []string{}
					case "no-start":
						settings.AllowedActions = []string{"observe", "read_context", "send"}
					case "no-send":
						settings.AllowedActions = []string{"observe", "read_context", "start"}
					case "no-observe":
						settings.AllowedActions = []string{"read_context", "start", "send"}
					}
				})
				bindProjectDevelopmentPolicy(input, agent)
				if name == "text-only" {
					contract := input.invocation.Selection.NativeLaunch.Tools.NativeContract
					input.invocation.Selection.NativeLaunch.Tools = workspace.OrcaNativeLaunchTools{Mode: "disabled", NativeContract: contract}
				}
				originalInput := input.invocation.Input
				source := &workspace.OrcaNativeSessionObservation{Schema: "swa.native-session-observation.v1", StartRequestID: uuid.NewString(), SessionID: "ready-worker-session-rule-input", DispatchID: input.invocation.Command.DispatchID, TaskID: "ready-worker-task-rule-input"}
				input.invocation.NativeSessionObservation, input.invocation.Input = source, nil
				input.invocation.Command = workspace.OrcaCommand{Action: "request.show", Controller: input.invocation.Scope.Controller, TaskID: input.invocation.Scope.RootTaskID, DispatchID: source.DispatchID, RequestID: source.StartRequestID}
				if name == "agent" || name == "revoked-agent" {
					grant := input.grant(t, creator)
					input.invocation.Caller.ID, input.invocation.Caller.Kind, input.invocation.Caller.GrantExpiresAt = creator, "agent", grant.ExpiresAt
					if name == "revoked-agent" {
						if _, err := input.projects.RevokeProjectAgent(context.Background(), input.human, input.project.ID, creator); err != nil {
							t.Fatal(err)
						}
					}
				}
				if err := os.WriteFile(filepath.Join(input.project.Root, "context.txt"), []byte("工作中的代码已被允许的原生工具修改。"), 0o600); err != nil {
					t.Fatal(err)
				}
				switch name {
				case "deleted-input":
					if err := os.Remove(filepath.Join(input.project.Root, "input.txt")); err != nil {
						t.Fatal(err)
					}
				case "ordinary-input":
					input.invocation.NativeSessionObservation, input.invocation.Input = nil, originalInput
					input.invocation.Command = workspace.OrcaCommand{Action: "worker.send", Controller: input.invocation.Scope.Controller, DispatchID: source.DispatchID, RequestID: uuid.NewString(), InputFile: originalInput.Path}
				case "wrong-request":
					input.invocation.Command.RequestID = uuid.NewString()
				case "wrong-dispatch":
					input.invocation.Command.DispatchID = "another-worker"
				case "wrong-root":
					input.invocation.Command.TaskID = "another-root"
				case "wrong-project":
					input.invocation.Command.ProjectID = "another-project"
				case "root-worker-task":
					source.TaskID = input.invocation.Scope.RootTaskID
				case "empty-session":
					source.SessionID = ""
				case "mixed-delegation":
					input.invocation.NativeDelegation = &workspace.OrcaNativeDelegation{}
				case "mixed-question":
					input.invocation.QuestionAsk = &workspace.OrcaQuestionAsk{}
				case "mixed-project-tool":
					input.invocation.NativeProjectTool = &workspace.OrcaNativeProjectTool{}
				case "mixed-handoff":
					input.invocation.Handoff = &workspace.OrcaHandoffResume{}
				case "mixed-submission":
					input.invocation.Submission = &workspace.OrcaRunSubmission{}
				case "mutating-start":
					input.invocation.Command.Action = "worker.start"
				case "mutating-send":
					input.invocation.Command.Action = "worker.send"
				case "outside-history":
					input.invocation.Scope.Context.Files[0].Path = "../outside.txt"
				}
				allowed := name == "human" || name == "agent" || name == "text-only" || name == "deleted-input"
				input.check(t, allowed)
				if allowed {
					result, err := input.service.AdmitOrcaDelivery(context.Background(), input.invocation)
					if err != nil || result.RequestID != source.StartRequestID || len(result.WritableRoots) != 0 {
						t.Fatal("会话观察改变了原 start 请求或授予了命令目录", result, err)
					}
				}
			})
		}
	}
}
