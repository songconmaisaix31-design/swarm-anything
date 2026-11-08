package app

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
)

func TestMorphCommandRequiresExplicitExclusivePiConfiguration(t *testing.T) {
	root := t.TempDir()
	command := OrcaCommand{Action: "worker.start", Controller: "controller", TaskID: "root", Name: "researcher", InputFile: "input.txt", Agent: "pi", Model: "provider/model", RequestID: uuid.NewString(), MorphConfig: filepath.Join(root, "worker.json")}
	if err := ValidateOrcaCommand(command); err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]func(*OrcaCommand){
		"implicit-agent": func(c *OrcaCommand) { c.Agent, c.Model = "", "" },
		"other-agent":    func(c *OrcaCommand) { c.Agent = "codex" },
		"relative-path":  func(c *OrcaCommand) { c.MorphConfig = "worker.json" },
		"unclean-path": func(c *OrcaCommand) {
			c.MorphConfig = root + string(filepath.Separator) + ".." + string(filepath.Separator) + "worker.json"
		},
		"role":        func(c *OrcaCommand) { c.RoleID, c.Revision = "researcher", 1 },
		"consult":     func(c *OrcaCommand) { c.HandoffMode = "consult" },
		"handoff":     func(c *OrcaCommand) { c.HandoffMode = "work" },
		"question":    func(c *OrcaCommand) { c.QuestionMode = "native" },
		"delegation":  func(c *OrcaCommand) { c.DelegationMode = "native" },
		"development": func(c *OrcaCommand) { c.DevelopmentMode = "project" },
		"send":        func(c *OrcaCommand) { c.Action = "worker.send" },
	} {
		t.Run(name, func(t *testing.T) {
			invalid := command
			change(&invalid)
			if ValidateOrcaCommand(invalid) == nil {
				t.Fatal("unapproved Morph tool selection was accepted")
			}
		})
	}
	command.QuestionMode, command.DelegationMode, command.DevelopmentMode = "disabled", "disabled", "disabled"
	if err := ValidateOrcaCommand(command); err != nil {
		t.Fatal("explicitly disabled other tools rejected", err)
	}
	command.Action, command.ProjectID, command.Workdir, command.Controller, command.TaskID = "run.submit", "project", root, "", ""
	command.SpecFile = "task.json"
	if err := ValidateOrcaCommand(command); err != nil {
		t.Fatal("run submit rejected its exact Morph configuration", err)
	}
}

func TestMorphSelectionPreservesConfigurationAcrossStartAndSend(t *testing.T) {
	path := filepath.Join(t.TempDir(), "worker.json")
	selection := OrcaAgentSelection{NativeLaunch: OrcaNativeLaunchPolicy{Tools: OrcaNativeLaunchTools{Mode: "morph", MorphConfig: &OrcaNativeConfigurationSource{Path: path, Version: "rule-input"}}}}
	command := OrcaCommand{Action: "worker.start", Agent: "pi", MorphConfig: path}
	if err := validateOrcaQuestionSelection(command, selection); err != nil {
		t.Fatal(err)
	}
	command.MorphConfig = filepath.Join(filepath.Dir(path), "other.json")
	if validateOrcaQuestionSelection(command, selection) == nil {
		t.Fatal("selection changed the requested host configuration")
	}
	command.MorphConfig = ""
	if validateOrcaQuestionSelection(command, selection) == nil {
		t.Fatal("selection added unrequested Morph tools")
	}
	command.Action = "worker.send"
	if err := validateOrcaQuestionSelection(command, selection); err != nil {
		t.Fatal("send did not preserve the original session policy", err)
	}
	command.Action = "worker.start"
	command.MorphConfig = path
	selection.NativeLaunch.Tools.Mode = "disabled"
	if validateOrcaQuestionSelection(command, selection) == nil {
		t.Fatal("selection silently removed the requested Morph bridge")
	}
}

func TestMorphNativeLaunchRequiresExactPinnedSources(t *testing.T) {
	// 构造输入只验证公开准入规则，不作为实际原生会话证据。
	directory, project := t.TempDir(), "project"
	source := filepath.Join(directory, "pi-source")
	selection := OrcaAgentSelection{AgentID: "pi", ExternalTarget: "pi", ExecutionMode: "structured", Version: "1.0.1", Model: "provider/model", Provider: "provider",
		NativeLaunch: OrcaNativeLaunchPolicy{Schema: "swa.native-launch.v1", Account: OrcaNativeLaunchAccount{Kind: "pi-native-api-key-per-session", Provider: "provider", SourceHome: source,
			AuthSource: OrcaNativeConfigurationSource{Path: filepath.Join(source, "auth.json"), Version: "rule-input"}, PrivateRoot: filepath.Join(directory, "pi-workers", project),
			ModelTarget: OrcaNativeModelTarget{ModelID: "model", API: "openai-responses", BaseURL: "https://provider.example/v1"}},
			Tools: OrcaNativeLaunchTools{Mode: "morph", NativeContract: "pi-cli-1.0.1", Allowed: []string{"morph_list_tools", "morph_call_tool"},
				Extension:   &OrcaNativeConfigurationSource{Path: filepath.Join(directory, "install", "runtime", "pi-morph-extension.mjs"), Version: "rule-input"},
				MorphConfig: &OrcaNativeConfigurationSource{Path: filepath.Join(directory, "bridge.json"), Version: "rule-input"}, MorphHostConfig: &OrcaNativeConfigurationSource{Path: filepath.Join(directory, "host.json"), Version: "rule-input"}}}}
	if err := validateOrcaNativeLaunch(selection, project); err != nil {
		t.Fatal(err)
	}
	wire, err := json.Marshal(selection)
	if err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]func(*OrcaAgentSelection){
		"missing-descriptor": func(s *OrcaAgentSelection) { s.NativeLaunch.Tools.MorphConfig = nil },
		"missing-host":       func(s *OrcaAgentSelection) { s.NativeLaunch.Tools.MorphHostConfig = nil },
		"unversioned-host":   func(s *OrcaAgentSelection) { s.NativeLaunch.Tools.MorphHostConfig.Version = "" },
		"relative-host":      func(s *OrcaAgentSelection) { s.NativeLaunch.Tools.MorphHostConfig.Path = "host.json" },
		"custom-extension": func(s *OrcaAgentSelection) {
			s.NativeLaunch.Tools.Extension.Path = filepath.Join(directory, "install", "runtime", "custom.mjs")
		},
		"extra-tool": func(s *OrcaAgentSelection) {
			s.NativeLaunch.Tools.Allowed = append(s.NativeLaunch.Tools.Allowed, "bash")
		},
		"reordered-tools": func(s *OrcaAgentSelection) {
			s.NativeLaunch.Tools.Allowed = []string{"morph_call_tool", "morph_list_tools"}
		},
		"disabled-with-host": func(s *OrcaAgentSelection) {
			s.NativeLaunch.Tools = OrcaNativeLaunchTools{Mode: "disabled", NativeContract: "pi-cli-1.0.1", MorphHostConfig: s.NativeLaunch.Tools.MorphHostConfig}
		},
	} {
		t.Run(name, func(t *testing.T) {
			var invalid OrcaAgentSelection
			if err := json.Unmarshal(wire, &invalid); err != nil {
				t.Fatal(err)
			}
			change(&invalid)
			if validateOrcaNativeLaunch(invalid, project) == nil {
				t.Fatal("changed Morph launch policy was accepted")
			}
		})
	}
}
