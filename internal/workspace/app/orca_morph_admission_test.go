package app_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/projectfiles"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

func bindMorphAdmission(input *deliveryAdmissionInput, action string) {
	parent := filepath.Dir(input.project.Root)
	tools := workspace.OrcaNativeLaunchTools{Mode: "morph", NativeContract: "pi-cli-1.0.1", Allowed: []string{"morph_list_tools", "morph_call_tool"},
		Extension:       &workspace.OrcaNativeConfigurationSource{Path: filepath.Join(parent, "uninvoked-install", "runtime", "pi-morph-extension.mjs"), Version: "unobserved-rule-source"},
		MorphConfig:     &workspace.OrcaNativeConfigurationSource{Path: filepath.Join(parent, "bridge.json"), Version: "unobserved-rule-source"},
		MorphHostConfig: &workspace.OrcaNativeConfigurationSource{Path: filepath.Join(parent, "host.json"), Version: "unobserved-rule-source"}}
	input.invocation.Selection.NativeLaunch.Tools = tools
	if action == "worker.start" {
		input.invocation.Command = workspace.OrcaCommand{Action: action, Controller: input.invocation.Scope.Controller, TaskID: input.invocation.Scope.RootTaskID,
			Name: "researcher", InputFile: input.invocation.Input.Path, Agent: input.invocation.Selection.AgentID, Model: input.invocation.Selection.Model, MorphConfig: tools.MorphConfig.Path, RequestID: uuid.NewString()}
	} else if action == "observation" {
		source := &workspace.OrcaNativeSessionObservation{Schema: "swa.native-session-observation.v1", StartRequestID: uuid.NewString(), SessionID: "morph-session-rule-input", DispatchID: input.invocation.Command.DispatchID, TaskID: "morph-worker-rule-task"}
		input.invocation.NativeSessionObservation, input.invocation.Input = source, nil
		input.invocation.Command = workspace.OrcaCommand{Action: "request.show", Controller: input.invocation.Scope.Controller, TaskID: input.invocation.Scope.RootTaskID, DispatchID: source.DispatchID, RequestID: source.StartRequestID}
	}
}

// 原生来源是构造输入；实际 SQLite 权限、原 Grant 与项目目录门均执行生产准入。
func TestMorphAdmissionRequiresCurrentToolsGrantAndWholeRootSQLite(t *testing.T) {
	for _, action := range []string{"worker.start", "worker.send", "observation"} {
		for _, name := range []string{"human", "agent", "no-tools", "list-only", "call-only", "no-start", "no-send", "revoked-agent", "expired-agent", "agent-no-send", "directory-disabled", "subdirectory-only"} {
			t.Run(action+"/"+name, func(t *testing.T) {
				creator := "delivery-current-human"
				if name == "agent" || name == "revoked-agent" || name == "expired-agent" || name == "agent-no-send" {
					creator = "morph-original-agent"
				}
				input := newDeliveryAdmissionInput(t, creator, func(settings *domain.ProjectSettings) {
					settings.AllowedTools = []string{"morph_list_tools", "morph_call_tool"}
					switch name {
					case "no-tools":
						settings.AllowedTools = []string{}
					case "list-only":
						settings.AllowedTools = []string{"morph_list_tools"}
					case "call-only":
						settings.AllowedTools = []string{"morph_call_tool"}
					case "no-start":
						settings.AllowedActions = []string{"observe", "read_context", "send"}
					case "no-send":
						settings.AllowedActions = []string{"observe", "read_context", "start"}
					}
				})
				bindMorphAdmission(input, action)
				if creator == "morph-original-agent" {
					grant := input.grant(t, creator)
					input.invocation.Caller.ID, input.invocation.Caller.Kind, input.invocation.Caller.GrantExpiresAt = creator, "agent", grant.ExpiresAt
					switch name {
					case "revoked-agent":
						if _, err := input.projects.RevokeProjectAgent(context.Background(), input.human, input.project.ID, creator); err != nil {
							t.Fatal(err)
						}
					case "expired-agent":
						past := time.Now().UTC().Add(-time.Minute)
						grant.ExpiresAt = &past
						if err := input.db.SaveGrant(context.Background(), grant); err != nil {
							t.Fatal(err)
						}
					case "agent-no-send":
						grant.Actions = []string{"observe", "read_context", "start"}
						if err := input.db.SaveGrant(context.Background(), grant); err != nil {
							t.Fatal(err)
						}
					}
				}
				if name == "directory-disabled" || name == "subdirectory-only" {
					settings := input.project.Settings
					if name == "directory-disabled" {
						settings.AllowDirectory = false
					} else {
						settings.AllowedSubdirs = []string{"approved"}
					}
					input.project = saveAdmissionSettings(t, input.db, input.project, settings)
					input.invocation.Project = input.project
					input.invocation.Caller.SettingsRevision = input.project.Settings.Revision
					input.invocation.Scope.Context.SettingsRevision = input.project.Settings.Revision
					// 同步构造的历史版本，确保失败来自目录边界，而非版本过期。
					_, err := input.service.AdmitOrcaDelivery(context.Background(), input.invocation)
					var service *apierrors.ServiceError
					if !errors.As(err, &service) || service.Code != apierrors.ScopeDenied {
						t.Fatal("whole-root permission was not checked before the saved Run association", err)
					}
				}
				input.check(t, name == "human" || name == "agent")
			})
		}
	}
}

type morphPermissionRuntime struct {
	selection workspace.OrcaAgentSelection
	scope     workspace.OrcaScope
	executed  int
}

func (r *morphPermissionRuntime) Capabilities(context.Context, string, string, workspace.OrcaCapabilityRequirements) (workspace.OrcaEnvelope, error) {
	return workspace.OrcaEnvelope{}, errors.New("rule-only runtime cannot discover capabilities")
}
func (r *morphPermissionRuntime) ResolveSelection(context.Context, string, workspace.OrcaCommand) (workspace.OrcaAgentSelection, error) {
	return r.selection, nil
}
func (r *morphPermissionRuntime) ResolveScope(context.Context, string, workspace.OrcaCommand) (workspace.OrcaScope, error) {
	return r.scope, nil
}
func (r *morphPermissionRuntime) Execute(context.Context, workspace.OrcaInvocation) (workspace.OrcaEnvelope, error) {
	r.executed++
	return workspace.OrcaEnvelope{}, errors.New("rule-only runtime must not execute")
}

func TestMorphPublicStartsRejectMissingToolsBeforeNativeDelivery(t *testing.T) {
	for _, action := range []string{"worker.start", "run.submit"} {
		for name, tools := range map[string][]string{"no-tools": {}, "list-only": {"morph_list_tools"}, "call-only": {"morph_call_tool"}} {
			t.Run(action+"/"+name, func(t *testing.T) {
				input := newDeliveryAdmissionInput(t, "delivery-current-human", func(settings *domain.ProjectSettings) { settings.AllowedTools = tools })
				bindMorphAdmission(input, "worker.start")
				runtime := &morphPermissionRuntime{selection: *input.invocation.Selection, scope: input.invocation.Scope}
				service, err := workspace.NewOrcaExecutionService(input.db, projectfiles.Files{}, input.projects, runtime, input.db)
				if err != nil {
					t.Fatal(err)
				}
				command := input.invocation.Command
				if action == "run.submit" {
					command.Action, command.ProjectID, command.Workdir, command.Controller, command.TaskID = action, input.project.ID, input.project.Root, "", ""
					command.SpecFile = "task.json"
					if err := os.WriteFile(filepath.Join(input.project.Root, command.SpecFile), []byte(`{"goal":"permission rule","source_repo":"public-rule-input","source_revision":"unobserved","success_criteria":["deny native delivery"],"max_workers":1,"initial_workers":1,"context":{"references":[],"files":[]}}`), 0o600); err != nil {
						t.Fatal(err)
					}
				}
				_, err = service.ExecuteOrca(context.Background(), input.human, command)
				var failure *apierrors.ServiceError
				if !errors.As(err, &failure) || failure.Code != apierrors.ScopeDenied || runtime.executed != 0 {
					t.Fatal("missing Morph tool permission reached native delivery", runtime.executed, err)
				}
			})
		}
	}
}

func TestMorphToolNamesCanBeExplicitlyGrantedThroughSettings(t *testing.T) {
	input := newDeliveryAdmissionInput(t, "delivery-current-human")
	projects := workspace.NewLocalProjectService(input.db, nil, projectfiles.Files{}, nil)
	if err := projects.ConfigureExternalCLIRegistry(&modelCLIRegistrationRule{}); err != nil {
		t.Fatal(err)
	}
	for _, tools := range [][]string{{"morph_list_tools"}, {"morph_call_tool"}, {"morph_list_tools", "morph_call_tool"}} {
		settings := input.project.Settings
		settings.AllowedTools = tools
		var err error
		input.project, err = projects.SetProjectSettings(context.Background(), input.human, input.project.ID, domain.SettingsCommand{ExpectedRevision: settings.Revision, Settings: settings})
		if err != nil {
			t.Fatal("explicit Morph tool names could not be granted", err)
		}
	}
	for _, tools := range [][]string{{"morph_other"}, {"morph_call_tool", "morph_call_tool"}} {
		settings := input.project.Settings
		settings.AllowedTools = tools
		if _, err := projects.SetProjectSettings(context.Background(), input.human, input.project.ID, domain.SettingsCommand{ExpectedRevision: settings.Revision, Settings: settings}); err == nil {
			t.Fatal("unknown or repeated Morph tool capability was accepted")
		}
	}
}
