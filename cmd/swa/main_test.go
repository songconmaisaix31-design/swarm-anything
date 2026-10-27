package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
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
