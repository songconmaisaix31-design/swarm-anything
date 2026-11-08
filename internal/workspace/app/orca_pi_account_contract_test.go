package app

import (
	"bytes"
	"encoding/json"
	"path/filepath"
	"reflect"
	"testing"
)

// 只验证未调用的账号输入合同；不创建凭据或原生会话，不调用Runtime。
func TestPiPerSessionNativeAccountSerializationContract(t *testing.T) {
	directory := t.TempDir()
	project := "1bfa20bb-0aad-405d-a935-9dd8ccb4dc6f"
	source := filepath.Join(directory, "unobserved-account-source")
	legacy := OrcaNativeLaunchAccount{
		Kind: "pi-native-api-key", Provider: "openai", SourceHome: source,
		AuthSource:  OrcaNativeConfigurationSource{Path: filepath.Join(source, "auth.json"), Version: "unobserved-contract-input"},
		PrivateHome: filepath.Join(directory, "pi", project),
		ModelTarget: OrcaNativeModelTarget{ModelID: "gpt-contract-input", API: "openai-responses", BaseURL: "https://api.openai.com"},
	}
	perSession := legacy
	perSession.Kind, perSession.PrivateHome = "pi-native-api-key-per-session", ""
	perSession.PrivateRoot = filepath.Join(directory, "pi-workers", project)
	for _, account := range []OrcaNativeLaunchAccount{legacy, perSession} {
		for _, withModels := range []bool{false, true} {
			name := account.Kind + "/null-models"
			if withModels {
				name = account.Kind + "/models-source"
				account.ModelsSource = &OrcaNativeConfigurationSource{Path: filepath.Join(source, "models.json"), Version: "unobserved-contract-input"}
			}
			t.Run(name, func(t *testing.T) {
				encoded, err := json.Marshal(account)
				if err != nil {
					t.Fatal(err)
				}
				var fields map[string]json.RawMessage
				if err := json.Unmarshal(encoded, &fields); err != nil || len(fields) != 7 {
					t.Fatal("account output changed its exact field inventory", err)
				}
				own, other := "private_home", "private_root"
				if account.Kind == "pi-native-api-key-per-session" {
					own, other = other, own
				}
				if fields[own] == nil || fields[other] != nil || fields["models_source"] == nil || bytes.Equal(fields["models_source"], []byte("null")) == withModels {
					t.Fatal("account output changed its layout or nullable models field")
				}
				var decoded OrcaNativeLaunchAccount
				if err := json.Unmarshal(encoded, &decoded); err != nil || !reflect.DeepEqual(decoded, account) {
					t.Fatal("account roundtrip changed the selected representation", err)
				}
				reencoded, err := json.Marshal(decoded)
				if err != nil || !bytes.Equal(encoded, reencoded) {
					t.Fatal("account roundtrip changed the exact output", err)
				}
			})
		}
	}
	encoded, err := json.Marshal(perSession)
	if err != nil {
		t.Fatal(err)
	}
	reject := func(t *testing.T, change func(map[string]json.RawMessage)) {
		t.Helper()
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(encoded, &fields); err != nil {
			t.Fatal(err)
		}
		change(fields)
		changed, err := json.Marshal(fields)
		if err != nil {
			t.Fatal(err)
		}
		var decoded OrcaNativeLaunchAccount
		if json.Unmarshal(changed, &decoded) == nil {
			t.Fatal("invalid per-session account representation was accepted")
		}
	}
	for field, wrongType := range map[string]string{
		"kind": "[]", "provider": "false", "source_home": "5", "auth_source": "[]", "models_source": "false", "private_root": "{}", "model_target": "[]",
	} {
		t.Run("missing-"+field, func(t *testing.T) { reject(t, func(fields map[string]json.RawMessage) { delete(fields, field) }) })
		t.Run("type-"+field, func(t *testing.T) {
			reject(t, func(fields map[string]json.RawMessage) { fields[field] = json.RawMessage(wrongType) })
		})
		if field != "models_source" {
			t.Run("null-"+field, func(t *testing.T) {
				reject(t, func(fields map[string]json.RawMessage) { fields[field] = json.RawMessage("null") })
			})
		}
	}
	for _, field := range []string{"private_home", "key", "credential_id", "config_source", "catalog_source", "session_id", "home_layout"} {
		t.Run("extra-"+field, func(t *testing.T) {
			reject(t, func(fields map[string]json.RawMessage) { fields[field] = json.RawMessage("null") })
		})
	}
	t.Run("legacy-kind-with-new-layout", func(t *testing.T) {
		reject(t, func(fields map[string]json.RawMessage) { fields["kind"] = json.RawMessage(`"pi-native-api-key"`) })
	})
	t.Run("new-kind-with-legacy-layout", func(t *testing.T) {
		reject(t, func(fields map[string]json.RawMessage) {
			fields["private_home"] = fields["private_root"]
			delete(fields, "private_root")
		})
	})
}

// 只验证主动输入的纯合同；不读取账号目录或调用原生端口。
func TestPiPerSessionNativeLaunchActiveContract(t *testing.T) {
	directory := t.TempDir()
	project := "1bfa20bb-0aad-405d-a935-9dd8ccb4dc6f"
	source := filepath.Join(directory, "unobserved-account-source")
	selection := OrcaAgentSelection{
		AgentID: "pi", ExternalTarget: "pi", ExecutionMode: "structured", Version: "1.0.1", Model: "stepfun/step-3.5-flash", Provider: "stepfun",
		NativeLaunch: OrcaNativeLaunchPolicy{
			Schema: "swa.native-launch.v1",
			Account: OrcaNativeLaunchAccount{
				Kind: "pi-native-api-key-per-session", Provider: "stepfun", SourceHome: source,
				AuthSource:  OrcaNativeConfigurationSource{Path: filepath.Join(source, "auth.json"), Version: "unobserved-contract-input"},
				PrivateRoot: filepath.Join(directory, "pi-workers", project),
				ModelTarget: OrcaNativeModelTarget{ModelID: "step-3.5-flash", API: "openai-completions", BaseURL: "https://api.stepfun.com/v1"},
			},
			Tools: OrcaNativeLaunchTools{Mode: "disabled", NativeContract: "pi-cli-1.0.1"},
		},
	}
	t.Run("approved-contract-fields", func(t *testing.T) {
		if err := validateOrcaNativeLaunch(selection, project); err != nil {
			t.Fatal("the per-session active input contract was refused", err)
		}
	})
	t.Run("models-source", func(t *testing.T) {
		withModels := selection
		withModels.NativeLaunch.Account.ModelsSource = &OrcaNativeConfigurationSource{Path: filepath.Join(source, "models.json"), Version: "unobserved-contract-input"}
		if err := validateOrcaNativeLaunch(withModels, project); err != nil {
			t.Fatal("the per-session models-source contract was refused", err)
		}
	})
	for name, change := range map[string]func(*OrcaAgentSelection){
		"legacy-kind": func(value *OrcaAgentSelection) {
			value.NativeLaunch.Account.Kind = "pi-native-api-key"
			value.NativeLaunch.Account.PrivateHome = filepath.Join(directory, "pi", project)
			value.NativeLaunch.Account.PrivateRoot = ""
		},
		"missing-root": func(value *OrcaAgentSelection) { value.NativeLaunch.Account.PrivateRoot = "" },
		"relative-root": func(value *OrcaAgentSelection) {
			value.NativeLaunch.Account.PrivateRoot = filepath.Join("pi-workers", project)
		},
		"old-root-layout": func(value *OrcaAgentSelection) {
			value.NativeLaunch.Account.PrivateRoot = filepath.Join(directory, "pi", project)
		},
		"wrong-root-project": func(value *OrcaAgentSelection) {
			value.NativeLaunch.Account.PrivateRoot = filepath.Join(directory, "pi-workers", "other-project")
		},
		"session-home-as-root": func(value *OrcaAgentSelection) {
			value.NativeLaunch.Account.PrivateRoot = filepath.Join(value.NativeLaunch.Account.PrivateRoot, "unobserved-session")
		},
		"unclean-root": func(value *OrcaAgentSelection) {
			value.NativeLaunch.Account.PrivateRoot += string(filepath.Separator) + "."
		},
		"legacy-home-present": func(value *OrcaAgentSelection) {
			value.NativeLaunch.Account.PrivateHome = filepath.Join(directory, "pi", project)
		},
		"relative-source": func(value *OrcaAgentSelection) { value.NativeLaunch.Account.SourceHome = "unobserved-account-source" },
		"unclean-source": func(value *OrcaAgentSelection) {
			value.NativeLaunch.Account.SourceHome += string(filepath.Separator) + "."
		},
		"auth-source-path": func(value *OrcaAgentSelection) {
			value.NativeLaunch.Account.AuthSource.Path = filepath.Join(source, "different.json")
		},
		"models-source-path": func(value *OrcaAgentSelection) {
			value.NativeLaunch.Account.ModelsSource = &OrcaNativeConfigurationSource{Path: filepath.Join(directory, "other-models.json"), Version: "unobserved-contract-input"}
		},
		"tools-enabled":   func(value *OrcaAgentSelection) { value.NativeLaunch.Tools.Mode = "enabled" },
		"native-contract": func(value *OrcaAgentSelection) { value.NativeLaunch.Tools.NativeContract = "unreviewed" },
		"external-target": func(value *OrcaAgentSelection) { value.ExternalTarget = "other-agent" },
		"empty-provider": func(value *OrcaAgentSelection) {
			value.NativeLaunch.Account.Provider, value.Provider, value.Model = "", "", "/step-3.5-flash"
		},
		"different-provider": func(value *OrcaAgentSelection) { value.Provider = "other-provider" },
		"different-model":    func(value *OrcaAgentSelection) { value.Model = "stepfun/other-model" },
	} {
		t.Run(name, func(t *testing.T) {
			changed := selection
			change(&changed)
			if validateOrcaNativeLaunch(changed, project) == nil {
				t.Fatal("an invalid active input contract was accepted")
			}
		})
	}
}
