package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
	workspaceapp "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

func TestMorphCLITransmitsExactDescriptorWithoutExecutingWorker(t *testing.T) {
	// 接收端只检查 HTTP 字段并拒绝执行；此检查不声明原生工具桥通过。
	commands := make(chan workspaceapp.OrcaCommand, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var command workspaceapp.OrcaCommand
		if err := json.NewDecoder(r.Body).Decode(&command); err != nil {
			t.Error(err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if r.Header.Get("Idempotency-Key") != command.RequestID {
			t.Error("CLI changed the original mutation ID")
		}
		commands <- command
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(workspaceapp.OrcaEnvelope{RequestID: command.RequestID, Error: &workspaceapp.OrcaNativeError{Code: "scope_denied", Message: "Transport-only rule check", RequiredAction: "use_real_service_for_acceptance"}})
	}))
	defer server.Close()
	t.Setenv("SWA_PROJECT_TOKEN", "transport-rule-input")
	t.Setenv("SWA_ENDPOINT", server.URL)
	directory := t.TempDir()
	descriptor := filepath.Join(directory, "private", "worker.json")
	for _, action := range []string{"worker.start", "run.submit"} {
		t.Run(action, func(t *testing.T) {
			request := uuid.NewString()
			args := []string{"worker", "start", "--controller", "controller", "--task", "root"}
			if action == "run.submit" {
				args = []string{"run", "--workdir", filepath.Join(directory, "project"), "--spec-file", "task.json"}
			}
			args = append(args, "--project", "project", "--agent", "pi", "--model", "provider/model", "--name", "researcher", "--input-file", "input.txt", "--morph-config", descriptor, "--request-id", request, "--json")
			var stdout, stderr bytes.Buffer
			code := run(context.Background(), args, &stdout, &stderr)
			requireLocalRefusal(t, code, 3, "scope_denied", request, &stdout)
			if command := <-commands; command.Action != action || command.MorphConfig != descriptor || command.RequestID != request || command.Agent != "pi" {
				t.Fatal("CLI changed the exact Morph bridge selection")
			}
		})
	}
}
