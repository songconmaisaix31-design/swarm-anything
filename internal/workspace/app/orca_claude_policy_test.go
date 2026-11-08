package app

import (
	"encoding/json"
	"path/filepath"
	"reflect"
	"testing"
)

// 这些选择仅是合同输入，不创建账号文件，不调用Native，也不证明路径/账号已被观察。
func TestClaudeNativeLaunchContract(t *testing.T) {
	directory := t.TempDir()
	project := "1bfa20bb-0aad-405d-a935-9dd8ccb4dc6f"
	source := filepath.Join(directory, "explicit-source")
	selection := OrcaAgentSelection{
		AgentID: "claude", ExternalTarget: "claude", ExecutionMode: "structured", Version: "2.1.284", Model: "claude-opus-5", Provider: "anthropic",
		NativeLaunch: OrcaNativeLaunchPolicy{
			Schema: "swa.native-launch.v1",
			Account: OrcaNativeLaunchAccount{
				Kind: "claude-native-api-key", Provider: "anthropic", SourceHome: source,
				AuthSource:  OrcaNativeConfigurationSource{Path: filepath.Join(source, "settings.json"), Version: "unobserved-contract-input"},
				PrivateRoot: filepath.Join(directory, "data", "claude", project),
				ModelTarget: OrcaNativeModelTarget{ModelID: "claude-opus-5", API: "anthropic-messages", BaseURL: "https://api.anthropic.com"},
			},
			Tools: OrcaNativeLaunchTools{Mode: "disabled", NativeContract: "claude-cli-2.1.284-sdk-0.3.284"},
		},
	}
	if err := validateOrcaNativeLaunch(selection, project); err != nil {
		t.Fatal(err)
	}
	changes := map[string]func(*OrcaAgentSelection){
		"agent":        func(s *OrcaAgentSelection) { s.AgentID = "codex" },
		"target":       func(s *OrcaAgentSelection) { s.ExternalTarget = "codex" },
		"version":      func(s *OrcaAgentSelection) { s.Version = "2.1.283" },
		"model":        func(s *OrcaAgentSelection) { s.Model = "opus" },
		"provider":     func(s *OrcaAgentSelection) { s.Provider = "openai" },
		"account":      func(s *OrcaAgentSelection) { s.NativeLaunch.Account.Provider = "openai" },
		"kind":         func(s *OrcaAgentSelection) { s.NativeLaunch.Account.Kind = "codex-native-api-key" },
		"mode":         func(s *OrcaAgentSelection) { s.NativeLaunch.Tools.Mode = "enabled" },
		"tools":        func(s *OrcaAgentSelection) { s.NativeLaunch.Tools.NativeContract = "codex-cli-0.163.0" },
		"native-model": func(s *OrcaAgentSelection) { s.NativeLaunch.Account.ModelTarget.ModelID = "opus" },
		"api":          func(s *OrcaAgentSelection) { s.NativeLaunch.Account.ModelTarget.API = "openai-responses" },
		"endpoint":     func(s *OrcaAgentSelection) { s.NativeLaunch.Account.ModelTarget.BaseURL += "/other" },
		"source-home":  func(s *OrcaAgentSelection) { s.NativeLaunch.Account.SourceHome = "relative-source" },
		"auth-path": func(s *OrcaAgentSelection) {
			s.NativeLaunch.Account.AuthSource.Path = filepath.Join(source, ".credentials.json")
		},
		"source-version": func(s *OrcaAgentSelection) { s.NativeLaunch.Account.AuthSource.Version = "" },
		"private-agent": func(s *OrcaAgentSelection) {
			s.NativeLaunch.Account.PrivateRoot = filepath.Join(directory, "data", "codex", project)
		},
		"private-project": func(s *OrcaAgentSelection) {
			s.NativeLaunch.Account.PrivateRoot = filepath.Join(directory, "data", "claude", "other-project")
		},
	}
	for name, change := range changes {
		t.Run(name, func(t *testing.T) {
			changed := selection
			change(&changed)
			if validateOrcaNativeLaunch(changed, project) == nil {
				t.Fatal("changed native Claude contract was accepted")
			}
		})
	}
	encoded, err := json.Marshal(selection.NativeLaunch.Account)
	if err != nil {
		t.Fatal(err)
	}
	var decoded OrcaNativeLaunchAccount
	if err := json.Unmarshal(encoded, &decoded); err != nil || !reflect.DeepEqual(decoded, selection.NativeLaunch.Account) {
		t.Fatal("Claude account roundtrip changed its exact fields", err)
	}
	for _, field := range []string{"key", "config_source", "catalog_source", "models_source", "database_source", "credential_id", "private_home"} {
		t.Run("unknown-"+field, func(t *testing.T) {
			var account map[string]json.RawMessage
			if err := json.Unmarshal(encoded, &account); err != nil {
				t.Fatal(err)
			}
			account[field] = json.RawMessage("null")
			changed, err := json.Marshal(account)
			if err != nil {
				t.Fatal(err)
			}
			if json.Unmarshal(changed, &decoded) == nil {
				t.Fatal("cross-kind or secret field accepted")
			}
		})
	}
	for _, field := range []string{"provider", "source_home", "auth_source", "private_root", "model_target"} {
		t.Run("null-"+field, func(t *testing.T) {
			var account map[string]json.RawMessage
			if err := json.Unmarshal(encoded, &account); err != nil {
				t.Fatal(err)
			}
			account[field] = json.RawMessage("null")
			changed, err := json.Marshal(account)
			if err != nil {
				t.Fatal(err)
			}
			if json.Unmarshal(changed, &decoded) == nil {
				t.Fatal("null required account field accepted")
			}
		})
	}
}
