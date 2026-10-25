package app_test

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/projectfiles"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

// 注册端口使用明确构造的标识；实际 SQLite 设置保存与权限判断使用生产实现。
type modelCLIRegistrationRule struct{ checked []string }

func (r *modelCLIRegistrationRule) ValidateExternalCLI(_ context.Context, cli string) error {
	r.checked = append(r.checked, cli)
	if cli != "pi" && cli != "codex" && cli != "claude" && cli != "opencode" {
		return errors.New("unregistered CLI rule input")
	}
	return nil
}

func TestMultiAgentPermissionKeepsLegacyAndExplicitScope(t *testing.T) {
	for _, raw := range []string{`{"external_model_cli":"pi"}`, `{"external_model_cli":"pi","external_model_clis":[]}`} {
		var settings domain.ProjectSettings
		if err := json.Unmarshal([]byte(raw), &settings); err != nil {
			t.Fatal(err)
		}
		if !settings.AllowsExternalModelCLI("pi") || settings.AllowsExternalModelCLI("codex") || settings.AllowsExternalModelCLI("") {
			t.Fatal("旧项目的模型处理许可被扩大")
		}
	}
	settings := domain.ProjectSettings{Revision: 1, ExternalModelCLI: "pi", ExternalModelCLIs: []string{"pi", "codex"}, AllowAgentControl: true, AllowedActions: []string{"start", "send"}}
	project := domain.LocalProject{ID: "permission-rule", Settings: settings}
	for _, cli := range []string{"pi", "codex", "claude"} {
		err := workspace.ValidateProjectActionScope(project, workspace.ProjectActionScope{ProjectID: project.ID, SettingsRevision: 1, Action: "send", ExternalTargets: []string{cli}})
		if (err == nil) != (cli != "claude") {
			t.Fatal("显式许可集合判断错误", cli, err)
		}
	}
	settings.ExternalModelCLI = ""
	if settings.AllowsExternalModelCLI("codex") {
		t.Fatal("清空默认客户端后仍允许模型处理")
	}
}

func TestMultiAgentSettingsValidateAndPersistSQLite(t *testing.T) {
	input := newDeliveryAdmissionInput(t, "delivery-current-human")
	projects := workspace.NewLocalProjectService(input.db, nil, projectfiles.Files{}, nil)
	registry := &modelCLIRegistrationRule{}
	if err := projects.ConfigureExternalCLIRegistry(registry); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	settings := input.project.Settings
	settings.ExternalModelCLIs = []string{"pi", "codex", "claude", "opencode"}
	updated, err := projects.SetProjectSettings(ctx, input.human, input.project.ID, domain.SettingsCommand{ExpectedRevision: settings.Revision, Settings: settings})
	if err != nil || !reflect.DeepEqual(registry.checked, settings.ExternalModelCLIs) {
		t.Fatal("没有逐项核对新增许可", registry.checked, err)
	}
	stored, err := input.db.LoadProject(ctx, updated.ID)
	if err != nil || !reflect.DeepEqual(stored.Settings, updated.Settings) {
		t.Fatal("多客户端许可没有完整保存在原项目记录", err)
	}
	for _, item := range []struct {
		name, defaultCLI string
		allowed          []string
	}{
		{"no-default", "", []string{"pi"}},
		{"default-outside-list", "pi", []string{"codex"}},
		{"duplicate", "pi", []string{"pi", "pi"}},
		{"empty", "pi", []string{"pi", ""}},
		{"whitespace", "pi", []string{"pi", " codex"}},
		{"unregistered", "pi", []string{"pi", "unregistered"}},
	} {
		t.Run(item.name, func(t *testing.T) {
			invalid := updated.Settings
			invalid.ExternalModelCLI, invalid.ExternalModelCLIs = item.defaultCLI, item.allowed
			if _, err := projects.SetProjectSettings(ctx, input.human, updated.ID, domain.SettingsCommand{ExpectedRevision: updated.Settings.Revision, Settings: invalid}); err == nil {
				t.Fatal("接受了无效许可列表")
			}
			current, err := input.db.LoadProject(ctx, updated.ID)
			if err != nil || !reflect.DeepEqual(current.Settings, updated.Settings) {
				t.Fatal("拒绝后改写了项目许可", err)
			}
		})
	}
	if _, err := projects.SetProjectSettings(ctx, domain.Caller{Kind: "agent", ID: "rule-agent", ProjectID: updated.ID}, updated.ID, domain.SettingsCommand{ExpectedRevision: updated.Settings.Revision, Settings: updated.Settings}); err == nil {
		t.Fatal("Agent 获得了修改许可列表的权限")
	}
}

func TestMultiAgentDeliveryUsesCurrentPermissionSQLite(t *testing.T) {
	input := newDeliveryAdmissionInput(t, "delivery-current-human", func(settings *domain.ProjectSettings) {
		settings.ExternalModelCLI, settings.ExternalModelCLIs = "codex", []string{"codex", "pi"}
	})
	input.check(t, true)
	settings := input.project.Settings
	settings.ExternalModelCLIs = []string{"codex"}
	input.project = saveAdmissionSettings(t, input.db, input.project, settings)
	input.check(t, false)
}
