//go:build !windows

package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTabbitDiagnoseCLIUsesOnlyVendorProbeAndHidesOutput(t *testing.T) {
	bin := t.TempDir()
	t.Setenv("PATH", bin)
	t.Setenv("SWA_AGENT_REGISTRY", "")
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	stub := filepath.Join(bin, "tabbit-cli")
	for _, step := range []struct {
		exit, want int
	}{{0, 0}, {1, 4}} {
		content := "#!/bin/sh\n[ \"$#\" -eq 1 ] && [ \"$1\" = diagnose ] || exit 9\nprintf '%s' 'private-browser-instance'\n"
		if step.exit != 0 {
			content += "exit 1\n"
		}
		if err := os.WriteFile(stub, []byte(content), 0700); err != nil {
			t.Fatal(err)
		}
		var stdout, stderr bytes.Buffer
		if code := run([]string{"agents", "diagnose", "tabbit", "--json"}, strings.NewReader(""), &stdout, &stderr); code != step.want || strings.Contains(stdout.String()+stderr.String(), "private-browser-instance") {
			t.Fatalf("unexpected diagnostic result: %d %q %q", code, stdout.String(), stderr.String())
		}
		if step.exit == 0 {
			var response struct {
				AgentID string `json:"agent_id"`
				State   string `json:"state"`
			}
			if err := json.Unmarshal(stdout.Bytes(), &response); err != nil || response.AgentID != "tabbit" || response.State != "diagnose_exit_ok" {
				t.Fatalf("wrong diagnostic observation: %q %v", stdout.String(), err)
			}
		}
	}
}
