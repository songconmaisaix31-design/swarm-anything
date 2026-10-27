package app

import (
	"encoding/json"
	"path/filepath"
	"reflect"
	"testing"
)

// 只验证输入合同，不创建凭据、调用原生程序或把路径当作已观察的来源。
func TestCodexNativeLaunchContract(t *testing.T) {
	directory := t.TempDir()
	project := "1bfa20bb-0aad-405d-a935-9dd8ccb4dc6f"
	selection := OrcaAgentSelection{AgentID: "codex", ExecutionMode: "structured", Version: "0.163.0", Model: "gpt-5.5", Provider: "openai", NativeLaunch: OrcaNativeLaunchPolicy{Schema: "swa.native-launch.v1", Account: OrcaNativeLaunchAccount{Kind: "codex-native-api-key", Provider: "openai", SourceHome: filepath.Join(directory, "explicit-source"), AuthSource: OrcaNativeConfigurationSource{Path: filepath.Join(directory, "explicit-source", "auth.json"), Version: "unobserved-contract-input"}, CatalogSource: OrcaNativeConfigurationSource{Path: filepath.Join(directory, "install", "runtime", "codex-policy", "models.json"), Version: "unobserved-contract-input"}, PrivateRoot: filepath.Join(directory, "data", "codex", project), ModelTarget: OrcaNativeModelTarget{ModelID: "gpt-5.5", API: "openai-responses", BaseURL: "https://api.openai.com/v1"}}, Tools: OrcaNativeLaunchTools{Mode: "disabled", NativeContract: "codex-cli-0.163.0"}}}
	if err := validateOrcaNativeLaunch(selection, project); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"agent", "version", "model", "provider", "url", "api", "tools", "kind", "source-path", "catalog-path", "private-root", "source-version"} {
		t.Run(name, func(t *testing.T) {
			changed := selection
			switch name {
			case "agent":
				changed.AgentID = "pi"
			case "version":
				changed.Version = "0.164.0"
			case "model":
				changed.Model = "openai/gpt-5.5"
			case "provider":
				changed.NativeLaunch.Account.Provider = "custom"
			case "url":
				changed.NativeLaunch.Account.ModelTarget.BaseURL += "/other"
			case "api":
				changed.NativeLaunch.Account.ModelTarget.API = "openai-completions"
			case "tools":
				changed.NativeLaunch.Tools.NativeContract = "pi-cli-1.0.1"
			case "kind":
				changed.NativeLaunch.Account.Kind = "pi-native-api-key"
			case "source-path":
				changed.NativeLaunch.Account.AuthSource.Path = filepath.Join(directory, "other", "auth.json")
			case "catalog-path":
				changed.NativeLaunch.Account.CatalogSource.Path = filepath.Join(directory, "models.json")
			case "private-root":
				changed.NativeLaunch.Account.PrivateRoot = filepath.Join(directory, "data", "pi", project)
			case "source-version":
				changed.NativeLaunch.Account.AuthSource.Version = ""
			}
			if validateOrcaNativeLaunch(changed, project) == nil {
				t.Fatal("changed native account contract was accepted")
			}
		})
	}
	encoded, err := json.Marshal(selection.NativeLaunch.Account)
	if err != nil {
		t.Fatal(err)
	}
	var decoded OrcaNativeLaunchAccount
	if err := json.Unmarshal(encoded, &decoded); err != nil || !reflect.DeepEqual(decoded, selection.NativeLaunch.Account) {
		t.Fatal("Codex account roundtrip changed its exact fields", err)
	}
	for _, field := range []string{"key", "credential_id", "models_source", "config_source", "private_home"} {
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
}
