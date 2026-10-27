package app

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
)

func TestRunCommandScopeAndRoleValidation(t *testing.T) {
	id := uuid.NewString()
	submit := OrcaCommand{Action: "run.submit", ProjectID: "project", Workdir: filepath.Join(t.TempDir(), "project"), SpecFile: "task.json", InputFile: "input.txt", Agent: "pi", Model: "stepfun/step-3.5-flash", Name: "lead", RequestID: id}
	if err := ValidateOrcaCommand(submit); err != nil {
		t.Fatal(err)
	}
	for _, mutate := range []func(*OrcaCommand){
		func(c *OrcaCommand) { c.Controller = "another-controller" },
		func(c *OrcaCommand) { c.RunID = "another-run" },
		func(c *OrcaCommand) { c.RoleID = "reviewer" },
		func(c *OrcaCommand) { c.Revision = 1 },
		func(c *OrcaCommand) { c.SpecFile = "" },
		func(c *OrcaCommand) { c.RequestID = "not-a-uuid" },
	} {
		invalid := submit
		mutate(&invalid)
		if ValidateOrcaCommand(invalid) == nil {
			t.Fatalf("accepted invalid submit: %+v", invalid)
		}
	}
	show := OrcaCommand{Action: "run.show", Controller: "controller", RunID: "run", TaskID: "root"}
	if err := ValidateOrcaCommand(show); err != nil {
		t.Fatal(err)
	}
	for _, mutate := range []func(*OrcaCommand){
		func(c *OrcaCommand) { c.RunID = "" },
		func(c *OrcaCommand) { c.TaskID = "" },
		func(c *OrcaCommand) { c.InputFile = "input.txt" },
		func(c *OrcaCommand) { c.RequestID = id },
	} {
		invalid := show
		mutate(&invalid)
		if ValidateOrcaCommand(invalid) == nil {
			t.Fatalf("accepted invalid observation: %+v", invalid)
		}
	}
	export := show
	export.Action = "run.export"
	export.OutputDir = "relative-output"
	if ValidateOrcaCommand(export) == nil {
		t.Fatal("accepted a relative export root")
	}
}

func TestRunSubmissionRequestIdentity(t *testing.T) {
	id, other := uuid.NewString(), uuid.NewString()
	task, worker := orcaRunRequestIDs(id)
	replayedTask, replayedWorker := orcaRunRequestIDs(id)
	otherTask, otherWorker := orcaRunRequestIDs(other)
	if task != replayedTask || worker != replayedWorker {
		t.Fatal("same submission changed its stage IDs")
	}
	seen := map[string]bool{}
	for _, value := range []string{id, task, worker, other, otherTask, otherWorker} {
		parsed, err := uuid.Parse(value)
		if err != nil || parsed.String() != value || seen[value] {
			t.Fatal("submission stages must have distinct canonical UUIDs")
		}
		seen[value] = true
	}
}

func TestRunRolePreservesFixedSpecification(t *testing.T) {
	spec := OrcaTaskSpec{RoleID: "reviewer", RoleRevision: 2, ConversationID: "discussion"}
	if err := applyOrcaRunRole(&spec, OrcaCommand{RoleID: "reviewer", Revision: 2, ConversationID: "discussion"}); err != nil {
		t.Fatal(err)
	}
	original := spec
	for _, command := range []OrcaCommand{{RoleID: "another", Revision: 2}, {RoleID: "reviewer", Revision: 3}, {ConversationID: "another"}} {
		candidate := original
		if applyOrcaRunRole(&candidate, command) == nil {
			t.Fatal("submission changed a fixed role or conversation")
		}
	}
}

func TestRoleAndDiscussionDoNotAcceptExecutionAuthority(t *testing.T) {
	role := &OrcaRoleDefinition{Name: "审查员", Responsibilities: "审查公开修改和验证结果", DefaultAgent: "pi", DefaultModel: "stepfun/step-3.5-flash", Skills: []string{"review"}, Knowledge: []string{"README.md"}}
	create := OrcaCommand{Action: "role.create", ProjectID: "project", Role: role, RequestID: uuid.NewString()}
	if err := ValidateOrcaCommand(create); err != nil {
		t.Fatal(err)
	}
	invalid := create
	invalid.DispatchID = "worker"
	if ValidateOrcaCommand(invalid) == nil {
		t.Fatal("role metadata accepted an execution selector")
	}
	duplicate := *role
	duplicate.Skills = []string{"review", "review"}
	invalid = create
	invalid.Role = &duplicate
	if ValidateOrcaCommand(invalid) == nil {
		t.Fatal("duplicate skill references accepted")
	}
	appendEntry := OrcaCommand{Action: "conversation.append", ProjectID: "project", ConversationID: "discussion", Text: "补充验收条件", RequestID: uuid.NewString()}
	if err := ValidateOrcaCommand(appendEntry); err != nil {
		t.Fatal(err)
	}
	appendEntry.DispatchID = "worker"
	if ValidateOrcaCommand(appendEntry) == nil {
		t.Fatal("saving discussion must not implicitly send to a Worker")
	}
}

func TestHandoffNotifyRequiresApprovedInputFile(t *testing.T) {
	command := OrcaCommand{Action: "handoff.notify", Controller: "controller", TaskID: "root", DispatchID: "recipient", InputFile: "README.md", RequestID: uuid.NewString()}
	if err := ValidateOrcaCommand(command); err != nil {
		t.Fatal(err)
	}
	withoutFile := command
	withoutFile.InputFile = ""
	if ValidateOrcaCommand(withoutFile) == nil {
		t.Fatal("notification accepted without an approved input file")
	}
	withText := command
	withText.Text = "Unbound inline input"
	if ValidateOrcaCommand(withText) == nil {
		t.Fatal("notification accepted inline text outside the file contract")
	}
}

func TestNativeQuestionModePreservesExplicitSelection(t *testing.T) {
	for _, action := range []string{"run.submit", "worker.start"} {
		command := OrcaCommand{Action: action, ProjectID: "project", Agent: "pi", Model: "stepfun/step-3.5-flash", Name: "lead", InputFile: "input.txt", RequestID: uuid.NewString()}
		if action == "run.submit" {
			command.Workdir, command.SpecFile = t.TempDir(), "task.json"
		} else {
			command.Controller, command.TaskID = "original-controller", "original-root"
		}
		for _, mode := range []string{"", "disabled", "native"} {
			command.QuestionMode = mode
			if err := ValidateOrcaCommand(command); err != nil {
				t.Fatal(action, mode, err)
			}
			selection := OrcaAgentSelection{NativeLaunch: OrcaNativeLaunchPolicy{Tools: OrcaNativeLaunchTools{Mode: "disabled"}}}
			if mode == "native" {
				selection.NativeLaunch.Tools.Mode = "questions-only"
			}
			if err := validateOrcaQuestionSelection(command, selection); err != nil {
				t.Fatal(action, mode, err)
			}
			selection.NativeLaunch.Tools.Mode = "enabled"
			if validateOrcaQuestionSelection(command, selection) == nil {
				t.Fatal("原选择改变问答模式仍被接受")
			}
		}
		command.QuestionMode = "native"
		command.Agent = "codex"
		if ValidateOrcaCommand(command) == nil {
			t.Fatal("未适配 Agent 接受原生问题模式")
		}
		command.Agent = "pi"
		command.QuestionMode = "enabled"
		if ValidateOrcaCommand(command) == nil {
			t.Fatal("未知问答模式被接受")
		}
	}
	role := OrcaRoleDefinition{Name: "澄清员", Responsibilities: "按原 Run 提问", DefaultAgent: "pi", DefaultModel: "stepfun/step-3.5-flash", QuestionMode: "native"}
	command := OrcaCommand{Action: "role.create", Role: &role, RequestID: uuid.NewString()}
	if err := ValidateOrcaCommand(command); err != nil {
		t.Fatal(err)
	}
	wire, err := json.Marshal(command)
	var decoded OrcaCommand
	if err != nil || json.Unmarshal(wire, &decoded) != nil || decoded.Role == nil || decoded.Role.QuestionMode != "native" {
		t.Fatal("角色原问答模式未保存到公共表示", err)
	}
	role.DefaultAgent = "codex"
	if ValidateOrcaCommand(command) == nil {
		t.Fatal("角色以其他 Agent 选择了 Pi 问答模式")
	}
}

func TestQuestionResumeAllowsOnlyExactIdentity(t *testing.T) {
	command := OrcaCommand{Action: "question.resume", Controller: "original-controller", RunID: "original-run", TaskID: "original-root", DispatchID: "original-dispatch", QuestionID: "original-question", RequestID: uuid.NewString()}
	if err := ValidateOrcaCommand(command); err != nil {
		t.Fatal(err)
	}
	for _, mutate := range []func(*OrcaCommand){
		func(c *OrcaCommand) { c.InputFile = "input.txt" },
		func(c *OrcaCommand) { c.Text = "未批准自定义输入" },
		func(c *OrcaCommand) { c.QuestionMode = "native" },
		func(c *OrcaCommand) { c.QuestionID = "" },
		func(c *OrcaCommand) { c.RunID = "" },
		func(c *OrcaCommand) { c.TaskID = "" },
		func(c *OrcaCommand) { c.DispatchID = "" },
		func(c *OrcaCommand) { c.RequestID = "not-a-request" },
	} {
		invalid := command
		mutate(&invalid)
		if ValidateOrcaCommand(invalid) == nil {
			t.Fatalf("受限继续入口接受了额外输入或缺失身份：%+v", invalid)
		}
	}
	permission, mutation, known := orcaAction(command.Action)
	if permission != "send" || !mutation || !known {
		t.Fatal("继续入口未沿用原 send 权限")
	}
}
