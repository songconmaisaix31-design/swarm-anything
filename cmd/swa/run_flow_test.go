package main

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"
	workspaceapp "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

func TestRunCLIHelpIsLocal(t *testing.T) {
	t.Setenv("SWA_PROJECT_TOKEN", "")
	t.Setenv("SWA_ENDPOINT", "invalid-endpoint")
	for _, verb := range []string{"run", "wait", "export"} {
		var stdout, stderr bytes.Buffer
		exit := run(context.Background(), []string{verb, "--help"}, &stdout, &stderr)
		if exit != 0 || stderr.Len() != 0 || !strings.Contains(stdout.String(), "swa run") || !strings.Contains(stdout.String(), "8=等待超时") || !strings.Contains(stdout.String(), "9=需要用户回答") || strings.Contains(stdout.String(), "invalid-endpoint") {
			t.Fatalf("完整任务帮助依赖服务或遗漏退出状态：exit=%d", exit)
		}
	}
}

func TestRunCLIRejectsInvalidOptionsBeforeTransport(t *testing.T) {
	t.Setenv("SWA_ENDPOINT", "invalid-endpoint")
	t.Setenv("SWA_PROJECT_TOKEN", "")
	for _, args := range [][]string{
		{"run", "--project", "unresolved-project", "--request-id", "invalid", "--json"},
		{"run", "--project", "unresolved-project", "--timeout", "0s", "--json"},
		{"run", "--project", "unresolved-project", "--on-input", "stop", "--json"},
		{"wait", "--project", "unresolved-project", "--controller", "unresolved-controller", "--task", "unresolved-root", "--json"},
		{"wait", "--project", "unresolved-project", "--request-id", uuid.NewString(), "--json"},
		{"export", "--project", "unresolved-project", "--strict", "--json"},
		{"run", "--from", "untrusted-identity", "--json"},
		{"run", "--unknown", "--help", "--json"},
	} {
		var stdout, stderr bytes.Buffer
		exit := run(context.Background(), args, &stdout, &stderr)
		requireLocalRefusal(t, exit, 2, "validation_failed", "", &stdout)
	}
}

func TestRunCLIRequiresExistingGrant(t *testing.T) {
	t.Setenv("SWA_PROJECT_TOKEN", "")
	var stdout, stderr bytes.Buffer
	exit := run(context.Background(), []string{"wait", "--project", "unresolved-project", "--controller", "unresolved-controller", "--task", "unresolved-root", "--run", "unresolved-run", "--json"}, &stdout, &stderr)
	if exit != 3 || !strings.Contains(stdout.String(), `"code":"scope_denied"`) {
		t.Fatalf("只读重连绕过当前项目授权：exit=%d", exit)
	}
}

func TestRunExportPreflightUsesRealFilesystem(t *testing.T) {
	parent := t.TempDir()
	path := filepath.Join(parent, "new-export")
	if actual, err := prepareRunExport(path); err != nil || actual != path {
		t.Fatalf("新绝对目录前置失败：%v", err)
	}
	if _, err := os.Lstat(path); !os.IsNotExist(err) {
		t.Fatal("前置验证擅自创建了目录")
	}
	if err := os.Mkdir(path, 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := prepareRunExport(path); err == nil {
		t.Fatal("已存在目录被接受")
	}
	if _, err := prepareRunExport("relative-output"); err == nil {
		t.Fatal("相对导出路径被接受")
	}
	if _, err := prepareRunExport(filepath.Join(parent, "missing", "output")); err == nil {
		t.Fatal("不存在父目录被接受")
	}
	link := filepath.Join(parent, "linked-parent")
	if err := os.Symlink(parent, link); err != nil {
		t.Logf("当前环境不允许创建实际符号链接：%v", err)
		return
	}
	for _, relative := range []string{"output", filepath.Join("new-export", "output")} {
		if _, err := prepareRunExport(filepath.Join(link, relative)); err == nil {
			t.Fatal("符号链接父目录或祖先被接受")
		}
		if _, err := os.Lstat(filepath.Join(parent, relative)); !os.IsNotExist(err) {
			t.Fatal("符号链接拒绝后创建了实际导出目标")
		}
	}
}

func TestRunQuestionCommandUsesOriginalSelectors(t *testing.T) {
	view := runView{Controller: "rule-controller's value", RunID: "rule-run", RootTaskID: "rule-root"}
	question := runQuestion{ID: "rule-question", TaskID: "rule-child", DispatchID: "rule-dispatch", Question: "保留原问题"}
	for _, platform := range []string{"linux", "windows"} {
		command := runQuestionCommand("rule-project", view, question, platform)
		for _, required := range []string{"swa question answer", "--run 'rule-run'", "--task 'rule-root'", "--dispatch 'rule-dispatch'", "--question 'rule-question'", "--input-file '<ANSWER_FILE>'", "--request-id '<NEW_UUID>'", "--json"} {
			if !strings.Contains(command, required) {
				t.Fatalf("回答指引遗漏准确选择或必要输入：%s", command)
			}
		}
		quoted := "'rule-controller'\"'\"'s value'"
		if platform == "windows" {
			quoted = "'rule-controller''s value'"
		}
		if !strings.Contains(command, "--controller "+quoted) {
			t.Fatalf("平台参数引用错误：%s", command)
		}
	}
	var stdout, stderr bytes.Buffer
	view.Questions = []runQuestion{question}
	output := cliOutput{stdout: &stdout, stderr: &stderr, projectID: "rule-project", identity: workspaceapp.OrcaEnvelope{Controller: view.Controller, RunID: view.RunID, TaskID: view.RootTaskID}}
	action, err := writeRunQuestionActions(&output, view)
	if err != nil {
		t.Fatal(err)
	}
	writeRunReconnect(&output)
	if code := output.failure("run_input_required", "原问题待答", action, 9); code != 9 {
		t.Fatalf("观察待答退出码改变：%d", code)
	}
	var reply workspaceapp.OrcaEnvelope
	if err := json.Unmarshal(stdout.Bytes(), &reply); err != nil || reply.Error == nil || reply.Error.RequiredAction != action || reply.RunID != view.RunID || !strings.Contains(stderr.String(), "swa wait") || !strings.Contains(stderr.String(), "run_question") {
		t.Fatal("待答指引没有保留原 Run、可执行回答和只读重连", err)
	}
}

func TestQuestionCLIRequiresCurrentGrant(t *testing.T) {
	t.Setenv("SWA_PROJECT_TOKEN", "")
	var stdout, stderr bytes.Buffer
	requestID := uuid.NewString()
	exit := run(context.Background(), []string{"question", "answer", "--project", "rule-project", "--controller", "rule-controller", "--run", "rule-run", "--task", "rule-root", "--dispatch", "rule-dispatch", "--question", "rule-question", "--input-file", "input.txt", "--request-id", requestID, "--json"}, &stdout, &stderr)
	var reply workspaceapp.OrcaEnvelope
	if err := json.Unmarshal(stdout.Bytes(), &reply); err != nil || exit != 3 || reply.RequestID != requestID || reply.RunID != "rule-run" || reply.QuestionID != "rule-question" || reply.RuntimeID != "" || reply.Error == nil || reply.Error.Code != "scope_denied" {
		t.Fatal("回答入口未按当前授权拒绝或丢失原选择", err, exit)
	}
}

func TestQuestionResumeCLIRequiresCurrentGrant(t *testing.T) {
	t.Setenv("SWA_PROJECT_TOKEN", "")
	var stdout, stderr bytes.Buffer
	requestID := uuid.NewString()
	exit := run(context.Background(), []string{"question", "resume", "--project", "rule-project", "--controller", "rule-controller", "--run", "rule-run", "--task", "rule-root", "--dispatch", "rule-dispatch", "--question", "rule-question", "--request-id", requestID, "--json"}, &stdout, &stderr)
	var reply workspaceapp.OrcaEnvelope
	if err := json.Unmarshal(stdout.Bytes(), &reply); err != nil || exit != 3 || reply.RequestID != requestID || reply.RunID != "rule-run" || reply.QuestionID != "rule-question" || reply.RuntimeID != "" || reply.Error == nil || reply.Error.Code != "scope_denied" {
		t.Fatal("继续入口未按当前授权拒绝或丢失原选择", err, exit)
	}
}

func TestRunQuestionResumeCommandRequiresObservedEligibility(t *testing.T) {
	view := runView{Controller: "original-controller", RunID: "original-run", RootTaskID: "original-root"}
	question := runQuestion{ID: "original-question", TaskID: "original-child", DispatchID: "original-dispatch", Question: "原问题", ReadState: "continuation_required", ContinuationRequired: true}
	for _, platform := range []string{"linux", "windows"} {
		command := runQuestionCommand("original-project", view, question, platform)
		if !strings.Contains(command, "swa question resume") || strings.Contains(command, "--input-file") || !strings.Contains(command, "--request-id '<NEW_UUID>'") || !strings.Contains(command, "--question 'original-question'") || !strings.Contains(command, "--task 'original-root'") {
			t.Fatal("继续命令没有保留原选择或引入自定义输入", command)
		}
	}
	for _, eligible := range []bool{true, false} {
		question.ContinuationRequired = eligible
		question.ReadState = "read_unconfirmed"
		if eligible {
			question.ReadState = "continuation_required"
		}
		view.AnsweredQuestions = []runAnsweredQuestion{{QuestionID: question.ID, TaskID: question.TaskID, DispatchID: question.DispatchID, Question: question.Question, ReadState: question.ReadState, ContinuationRequired: eligible}}
		var stdout, stderr bytes.Buffer
		output := cliOutput{stdout: &stdout, stderr: &stderr, projectID: "original-project"}
		action, err := writeRunQuestionActions(&output, view)
		if err != nil || strings.Contains(action, "swa question resume") != eligible || strings.Contains(stderr.String(), "swa question answer") || strings.Contains(stderr.String(), "ANSWER_FILE") {
			t.Fatal("未确认读取状态被改写成再次回答或自动继续", eligible, action, err)
		}
		if exit := output.failure("run_input_required", "原问题待继续", action, 9); exit != 9 {
			t.Fatal("原问题继续改变了待答退出码", exit)
		}
	}
}

func TestRunAndWorkerQuestionModeFlagIsValidatedLocally(t *testing.T) {
	t.Setenv("SWA_PROJECT_TOKEN", "")
	for _, command := range [][]string{
		{"run", "--project", "original-project", "--workdir", t.TempDir(), "--spec-file", "task.json", "--input-file", "input.txt", "--agent", "pi", "--model", "stepfun/step-3.5-flash", "--request-id", uuid.NewString()},
		{"worker", "start", "--project", "original-project", "--controller", "original-controller", "--task", "original-root", "--name", "lead", "--input-file", "input.txt", "--agent", "pi", "--model", "stepfun/step-3.5-flash", "--request-id", uuid.NewString()},
	} {
		for _, mode := range []string{"disabled", "native", "arbitrary-tools"} {
			args := append(append([]string{}, command...), "--question-mode", mode, "--json")
			var stdout, stderr bytes.Buffer
			exit := run(context.Background(), args, &stdout, &stderr)
			wantedExit := 3
			if mode == "arbitrary-tools" {
				wantedExit = 2
			}
			if exit != wantedExit {
				t.Fatal("问答选择没有在实际 CLI 解析与当前授权前置正确处理", command[0], mode, exit)
			}
		}
	}
}

func TestRunAndWorkerNativeQuestionsKeepUnsupportedCapability(t *testing.T) {
	t.Setenv("SWA_PROJECT_TOKEN", "")
	t.Setenv("SWA_ENDPOINT", "invalid-endpoint")
	requestID := uuid.NewString()
	for _, command := range [][]string{
		{"run", "--project", "original-project", "--workdir", t.TempDir(), "--spec-file", "task.json", "--input-file", "input.txt", "--agent", "codex", "--model", "gpt-5.5", "--request-id", requestID},
		{"worker", "start", "--project", "original-project", "--controller", "original-controller", "--task", "original-root", "--name", "lead", "--input-file", "input.txt", "--agent", "codex", "--model", "gpt-5.5", "--request-id", requestID},
	} {
		var stdout, stderr bytes.Buffer
		args := append(append([]string{}, command...), "--question-mode", "native", "--json")
		exit := run(context.Background(), args, &stdout, &stderr)
		var reply workspaceapp.OrcaEnvelope
		if err := json.Unmarshal(stdout.Bytes(), &reply); err != nil || exit != 4 || reply.Error == nil || reply.Error.Code != "unsupported_capability" || reply.RequestID != requestID || reply.OK || reply.RuntimeID != "" || reply.AuthorityDomain != "" {
			t.Fatal("完整 Run 与 Worker 启动未保留原能力拒绝类别", command[0], exit, err)
		}
	}
}
