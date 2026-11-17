package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestAgentCatalogSeparatesACPAndVerification(t *testing.T) {
	t.Setenv("SWA_AGENT_REGISTRY", "")
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	t.Setenv("APPDATA", t.TempDir())
	var stdout, stderr bytes.Buffer
	if code := run([]string{"agents", "list", "--json"}, strings.NewReader(""), &stdout, &stderr); code != 0 {
		t.Fatalf("agent inventory: %d %s", code, stderr.String())
	}
	var catalog struct {
		SchemaVersion int             `json:"schema_version"`
		Items         []agentListItem `json:"items"`
	}
	if err := json.Unmarshal(stdout.Bytes(), &catalog); err != nil || catalog.SchemaVersion != 1 {
		t.Fatalf("invalid inventory envelope: %v", err)
	}
	matches := map[string][2]string{
		"qwen": {"acp", ""}, "gemini": {"acp", ""}, "qoder": {"acp", "acp_session"},
		"tabbit": {"browser-cli", "browser_fixture"}, "workbuddy": {"", ""}, "cursor": {"", ""},
	}
	for _, item := range catalog.Items {
		if want, ok := matches[item.ID]; ok {
			if item.Adapter != want[0] || item.Verification != want[1] || item.Startable.Status != "unknown" {
				t.Errorf("%s overstates its current capability: %+v", item.ID, item)
			}
			delete(matches, item.ID)
		}
	}
	if len(matches) != 0 {
		t.Fatalf("missing catalog entries: %v", matches)
	}
}
