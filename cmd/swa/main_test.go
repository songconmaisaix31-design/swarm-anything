package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
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
