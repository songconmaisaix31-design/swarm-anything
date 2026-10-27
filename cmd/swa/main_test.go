package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/google/uuid"
	workspaceapp "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

func requireLocalRefusal(t *testing.T, code, wantedExit int, wantedCode, wantedRequest string, stdout *bytes.Buffer) {
	t.Helper()
	decoder := json.NewDecoder(stdout)
	var reply workspaceapp.OrcaEnvelope
	if err := decoder.Decode(&reply); err != nil {
		t.Fatal("CLI did not publish one structured refusal")
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		t.Fatal("CLI published more than one result")
	}
	if code != wantedExit || reply.OK || reply.Error == nil || reply.Error.Code != wantedCode || reply.Error.RequiredAction == "" || reply.Error.Retryable || reply.RequestID != wantedRequest || reply.RuntimeID != "" || reply.AuthorityDomain != "" || reply.RunID != "" {
		t.Fatal("The pretransport refusal lost its expected result or invented native identity")
	}
}

func TestOrcaCLIRejectsAuthorityArgumentsBeforeTransport(t *testing.T) {
	for _, option := range []string{"--from", "--actor", "--human", "--runtime-id", "--pid"} {
		t.Run(option, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			code := run(context.Background(), []string{"worker", "stop", "--controller", "unresolved-controller", "--dispatch", "unresolved-dispatch", option, "untrusted-input", "--json"}, &stdout, &stderr)
			requireLocalRefusal(t, code, 2, "validation_failed", "", &stdout)
		})
	}
	request := uuid.NewString()
	for _, test := range []struct {
		args []string
		want string
	}{
		{[]string{"worker", "stop", "--request-id", request, "--from", "untrusted-input", "--json"}, request},
		{[]string{"worker", "stop", "--from", "untrusted-input", "--request-id", request, "--json"}, ""},
		{[]string{"worker", "stop", "--request-id", "invalid-request", "--from", "untrusted-input", "--json"}, ""},
	} {
		var stdout, stderr bytes.Buffer
		code := run(context.Background(), test.args, &stdout, &stderr)
		requireLocalRefusal(t, code, 2, "validation_failed", test.want, &stdout)
	}
}

func TestOrcaCLIRejectsUnknownActionAndIrrelevantInput(t *testing.T) {
	for _, args := range [][]string{
		{"worker", "launch", "--json"},
		{"status", "--input-file", "unapproved.txt", "--json"},
		{"capabilities", "--limit", "100", "--json"},
		{"worker", "read", "--controller", "unresolved-controller", "--dispatch", "unresolved-dispatch", "--source", "terminal", "--json"},
	} {
		var stdout, stderr bytes.Buffer
		code := run(context.Background(), args, &stdout, &stderr)
		requireLocalRefusal(t, code, 2, "validation_failed", "", &stdout)
	}
}

func TestOrcaCLIMissingCurrentGrantIsDenied(t *testing.T) {
	t.Setenv("SWA_PROJECT_TOKEN", "")
	var stdout, stderr bytes.Buffer
	code := run(context.Background(), []string{"status", "--project", "unresolved-project", "--json"}, &stdout, &stderr)
	requireLocalRefusal(t, code, 3, "scope_denied", "", &stdout)
}

func TestWorkerStartRoleAndHandoffArguments(t *testing.T) {
	t.Setenv("SWA_PROJECT_TOKEN", "")
	request := uuid.NewString()
	base := []string{"worker", "start", "--project", "project", "--controller", "controller", "--task", "root-task", "--name", "reviewer", "--agent", "pi", "--model", "provider/model", "--input-file", "brief.txt", "--request-id", request, "--json"}
	for _, test := range []struct {
		name     string
		extra    []string
		wantExit int
		wantCode string
	}{
		{"role and handoff", []string{"--role", "reviewer-role", "--role-revision", "2", "--parent-task", "parent-task", "--handoff-mode", "consult", "--reply-mode", "resume", "--completion-criterion", "review the change", "--completion-criterion", "report findings"}, 3, "scope_denied"},
		{"role without revision", []string{"--role", "reviewer-role"}, 2, "validation_failed"},
		{"parent without criteria", []string{"--parent-task", "parent-task"}, 2, "validation_failed"},
		{"invalid handoff", []string{"--handoff-mode", "other"}, 2, "validation_failed"},
		{"invalid reply", []string{"--reply-mode", "other"}, 2, "validation_failed"},
		{"blank repeated criterion", []string{"--parent-task", "parent-task", "--completion-criterion", "review", "--completion-criterion", " "}, 2, "validation_failed"},
	} {
		t.Run(test.name, func(t *testing.T) {
			args := append(append([]string{}, base...), test.extra...)
			var stdout, stderr bytes.Buffer
			code := run(context.Background(), args, &stdout, &stderr)
			requireLocalRefusal(t, code, test.wantExit, test.wantCode, request, &stdout)
		})
	}
	var stdout, stderr bytes.Buffer
	code := run(context.Background(), []string{"worker", "list", "--controller", "controller", "--task", "task", "--role", "reviewer", "--role-revision", "2", "--json"}, &stdout, &stderr)
	requireLocalRefusal(t, code, 2, "validation_failed", "", &stdout)
}

func TestRoleFileInput(t *testing.T) {
	t.Setenv("SWA_PROJECT_TOKEN", "")
	directory := t.TempDir()
	definition := `{"name":"Reviewer","responsibilities":"Review public changes","default_agent":"pi","default_model":"stepfun/step-3.5-flash","skills":[],"knowledge":[]}`
	request := uuid.NewString()
	for _, test := range []struct {
		name, content string
		action        string
		extra         []string
		wantExit      int
		wantCode      string
	}{
		{"create", definition, "create", nil, 3, "scope_denied"},
		{"update", definition, "update", []string{"--role", "reviewer", "--role-revision", "1"}, 3, "scope_denied"},
		{"unknown field", strings.TrimSuffix(definition, "}") + `,"unexpected":true}`, "create", nil, 2, "validation_failed"},
		{"multiple objects", definition + definition, "create", nil, 2, "validation_failed"},
		{"null", "null", "create", nil, 2, "validation_failed"},
		{"invalid UTF-8", string([]byte{0xff}), "create", nil, 2, "validation_failed"},
		{"oversize", strings.Repeat(" ", 256*1024+1), "create", nil, 2, "validation_failed"},
		{"missing file", "", "create", nil, 2, "validation_failed"},
		{"missing revision", definition, "update", []string{"--role", "reviewer"}, 2, "validation_failed"},
		{"irrelevant file", definition, "archive", []string{"--role", "reviewer", "--role-revision", "1"}, 2, "validation_failed"},
	} {
		t.Run(test.name, func(t *testing.T) {
			file := filepath.Join(directory, test.name+".json")
			if test.content != "" {
				if err := os.WriteFile(file, []byte(test.content), 0600); err != nil {
					t.Fatal(err)
				}
			}
			args := append([]string{"role", test.action, "--project", "project", "--request-id", request, "--role-file", file, "--json"}, test.extra...)
			var stdout, stderr bytes.Buffer
			code := run(context.Background(), args, &stdout, &stderr)
			requireLocalRefusal(t, code, test.wantExit, test.wantCode, request, &stdout)
		})
	}
}

func TestRoleAndHandoffCLITransport(t *testing.T) {
	// 这里只检查 CLI 发出的 HTTP 字段；接收端拒绝执行，不作为真实 Worker 验收。
	commands := make(chan workspaceapp.OrcaCommand, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var command workspaceapp.OrcaCommand
		if err := json.NewDecoder(r.Body).Decode(&command); err != nil {
			t.Error(err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if r.Method != http.MethodPost || r.URL.Path != "/api/v1/local-projects/project/orca/commands" || r.Header.Get("Idempotency-Key") != command.RequestID {
			t.Error("CLI transport changed the action endpoint or original request")
		}
		commands <- command
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(workspaceapp.OrcaEnvelope{RequestID: command.RequestID, Error: &workspaceapp.OrcaNativeError{Code: "scope_denied", Message: "Transport test does not execute Workers", RequiredAction: "use_real_service_for_acceptance"}})
	}))
	defer server.Close()
	t.Setenv("SWA_PROJECT_TOKEN", "transport-rule-input")
	t.Setenv("SWA_ENDPOINT", server.URL)
	role := workspaceapp.OrcaRoleDefinition{Name: "Reviewer", Responsibilities: "Review public changes", DefaultAgent: "pi", DefaultModel: "stepfun/step-3.5-flash", DelegationMode: "native", Skills: []string{}, Knowledge: []string{}}
	data, err := json.Marshal(role)
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(t.TempDir(), "role.json")
	if err := os.WriteFile(file, data, 0600); err != nil {
		t.Fatal(err)
	}
	request := uuid.NewString()
	var stdout, stderr bytes.Buffer
	if code := run(context.Background(), []string{"role", "create", "--project", "project", "--role-file", file, "--request-id", request, "--json"}, &stdout, &stderr); code != 3 {
		t.Fatalf("role transport exit=%d: %s", code, stdout.String())
	}
	if command := <-commands; command.Action != "role.create" || command.Role == nil || !reflect.DeepEqual(*command.Role, role) {
		t.Fatal("CLI did not transmit the exact role definition")
	}
	for _, explicit := range []bool{false, true} {
		args := []string{"worker", "start", "--project", "project", "--controller", "controller", "--task", "root", "--name", "reviewer", "--input-file", "brief.txt", "--role", "reviewer-role", "--role-revision", "2", "--parent-task", "parent", "--handoff-mode", "consult", "--reply-mode", "resume", "--delegation-mode", "disabled", "--completion-criterion", "Review code", "--completion-criterion", "Report findings", "--request-id", request, "--json"}
		if explicit {
			args = append(args, "--agent", "opencode", "--model", "stepfun/step-3.5-flash")
		}
		stdout.Reset()
		stderr.Reset()
		if code := run(context.Background(), args, &stdout, &stderr); code != 3 {
			t.Fatalf("worker transport exit=%d: %s", code, stdout.String())
		}
		command := <-commands
		if command.Action != "worker.start" || command.RoleID != "reviewer-role" || command.Revision != 2 || command.ParentTaskID != "parent" || command.HandoffMode != "consult" || command.ReplyMode != "resume" || command.DelegationMode != "disabled" || !reflect.DeepEqual(command.CompletionCriteria, []string{"Review code", "Report findings"}) {
			t.Fatal("CLI lost the selected role or handoff fields")
		}
		if explicit && (command.Agent != "opencode" || command.Model != "stepfun/step-3.5-flash") || !explicit && (command.Agent != "" || command.Model != "") {
			t.Fatal("CLI changed the explicit override or resolved role defaults locally")
		}
	}
	stdout.Reset()
	stderr.Reset()
	if code := run(context.Background(), []string{"run", "--project", "project", "--workdir", t.TempDir(), "--spec-file", "task.json", "--input-file", "brief.txt", "--role", "reviewer-role", "--role-revision", "2", "--delegation-mode", "native", "--request-id", request, "--json"}, &stdout, &stderr); code != 3 {
		t.Fatalf("run transport exit=%d: %s", code, stdout.String())
	}
	if command := <-commands; command.Action != "run.submit" || command.DelegationMode != "native" || command.RoleID != "reviewer-role" || command.Revision != 2 || command.Agent != "" || command.Model != "" {
		t.Fatal("Run CLI lost delegation mode or changed the role default selection")
	}
}

func TestQuestionCLIOutputFailureRetainsOriginalRequest(t *testing.T) {
	for _, action := range []string{"question.answer", "question.resume"} {
		t.Run(action, func(t *testing.T) {
			file, err := os.Create(filepath.Join(t.TempDir(), "closed-output.json"))
			if err != nil {
				t.Fatal(err)
			}
			if err := file.Close(); err != nil {
				t.Fatal(err)
			}
			command := workspaceapp.OrcaCommand{Action: action, Controller: "original-controller", RunID: uuid.NewString(), TaskID: uuid.NewString(), DispatchID: uuid.NewString(), QuestionID: uuid.NewString(), RequestID: uuid.NewString()}
			if action == "question.answer" {
				command.Text = "原问题回答"
			}
			var stderr bytes.Buffer
			output := cliOutput{stdout: file, stderr: &stderr, projectID: "original-project"}
			output.parsedRequest(command)
			output.validatedCommand(command)
			err = output.publish(output.identity)
			if err == nil || output.outputFailure(err) != 6 || !output.attempted {
				t.Fatal("实际输出失败没有保留变更效果未知退出码")
			}
			for _, value := range []string{command.RequestID, command.RunID, command.QuestionID, "swa request show", "original-project"} {
				if !strings.Contains(stderr.String(), value) {
					t.Fatalf("输出失败丢失原请求查询定位 %q", value)
				}
			}
			if output.publish(output.identity) == nil {
				t.Fatal("输出失败后不应再次写结果")
			}
		})
	}
}

func TestOrcaCLIHelpDoesNotRequireGrantOrService(t *testing.T) {
	t.Setenv("SWA_PROJECT_TOKEN", "")
	t.Setenv("SWA_ENDPOINT", "invalid-endpoint")
	t.Setenv("SWA_CODEX_API_KEY_HOME", "unvalidated-relative-source")
	t.Setenv("SWA_CLAUDE_API_KEY_HOME", "unvalidated-relative-source")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	for _, args := range [][]string{
		{"--help"}, {"controller", "--help"}, {"worker", "-h"},
		{"status", "--help"}, {"task", "create", "--help"},
		{"worker", "start", "--help"}, {"request", "show", "-h"},
		{"question", "--help"}, {"question", "answer", "--help"}, {"question", "resume", "--help"},
		{"role", "--help"}, {"role", "create", "--help"},
		{"serve", "--help"}, {"serve", "--json", "--help"},
	} {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			code := run(ctx, args, &stdout, &stderr)
			if code != 0 || stderr.Len() != 0 || !strings.Contains(stdout.String(), "swa worker start") || !strings.Contains(stdout.String(), "--web-dir") || !strings.Contains(stdout.String(), "6=效果未知") || strings.Contains(stdout.String(), "invalid-endpoint") || strings.Contains(stdout.String(), "unvalidated-relative-source") {
				t.Fatalf("帮助依赖了服务或未返回完整本地用法：exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
			}
		})
	}
}

func TestOrcaCLIServeRejectsRelativeAPIKeyHomeBeforeStartup(t *testing.T) {
	for _, key := range []string{"SWA_CODEX_API_KEY_HOME", "SWA_CLAUDE_API_KEY_HOME"} {
		t.Run(key, func(t *testing.T) {
			t.Setenv("SWA_CODEX_API_KEY_HOME", "")
			t.Setenv("SWA_CLAUDE_API_KEY_HOME", "")
			t.Setenv(key, "unvalidated-relative-source")
			var stdout, stderr bytes.Buffer
			code := run(context.Background(), []string{"serve", "--data-dir", t.TempDir(), "--port", "18793", "--protected-roots", t.TempDir(), "--json"}, &stdout, &stderr)
			requireLocalRefusal(t, code, 2, "validation_failed", "", &stdout)
			if strings.Contains(stdout.String()+stderr.String(), "unvalidated-relative-source") {
				t.Fatal("配置拒绝回显了未验证的来源路径")
			}
		})
	}
}

func TestOrcaCLIHelpPreservesArgumentRefusals(t *testing.T) {
	for _, args := range [][]string{
		{"status", "--unknown-option", "--help", "--json"},
		{"worker", "start", "--unknown-option", "--help", "--json"},
		{"worker", "start", "--json"},
		{"serve", "--port", "invalid", "--help", "--json"},
		{"serve", "--unknown-option", "--help", "--json"},
		{"serve", "--json"},
	} {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			code := run(context.Background(), args, &stdout, &stderr)
			requireLocalRefusal(t, code, 2, "validation_failed", "", &stdout)
		})
	}
}
