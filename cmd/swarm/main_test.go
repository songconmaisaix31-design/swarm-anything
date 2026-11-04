package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/rolecards"
	"github.com/songconmaisaix31-design/Astrocyte/internal/swarm/domain"
	"github.com/songconmaisaix31-design/Astrocyte/roles"
)

func TestRoleCommands(t *testing.T) {
	invoke := func(args []string, input string, expected int) string {
		t.Helper()
		var out, stderr bytes.Buffer
		code := run(args, strings.NewReader(input), &out, &stderr)
		if code != expected {
			t.Fatalf("%v 退出 %d，预期 %d: %s", args, code, expected, stderr.String())
		}
		return out.String()
	}
	var list struct {
		Items []domain.RoleCard `json:"items"`
	}
	if err := json.Unmarshal([]byte(invoke([]string{"roles", "list", "--json"}, "", 0)), &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Items) != 6 {
		t.Fatalf("内置角色: %d", len(list.Items))
	}
	catalog, err := rolecards.New()
	if err != nil {
		t.Fatal(err)
	}
	for _, role := range catalog.List() {
		var shown domain.RoleCard
		if err := json.Unmarshal([]byte(invoke([]string{"roles", "show", role.ID, "--json"}, "", 0)), &shown); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(role, shown) {
			t.Fatalf("show 与源资产不同: %s", role.ID)
		}
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "writer.yaml")
	invoke([]string{"roles", "new", "--id", "custom.writer", "--name", "写作者", "--identity", "根据目标编写使用说明。", "--output", path, "--json"}, "", 0)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	created, err := catalog.ParseRole(data)
	if err != nil || created.ID != "custom.writer" {
		t.Fatalf("新建角色: %v", err)
	}
	invoke([]string{"roles", "edit", path, "--name", "文档写作者", "--json"}, "", 0)
	invoke([]string{"roles", "validate", path, "--json"}, "", 0)
	invoke([]string{"roles", "list", "--roles-dir", dir, "--json"}, "", 0)
	invoke([]string{"roles", "show", "custom.writer", "--roles-dir", dir, "--json"}, "", 0)
	invoke([]string{"roles", "show", "builtin.missing"}, "", 2)
	invoke([]string{"roles", "list", "--roles-dir", filepath.Join(dir, "missing")}, "", 2)
	invoke([]string{"roles", "validate", filepath.Join(dir, "missing.yaml")}, "", 2)
	invoke([]string{"roles", "new", "--output", path, "--id", "custom.other", "--name", "其他", "--identity", "说明", "--json"}, "", 2)
	invoke([]string{"roles", "edit", "-", "--json", "--name", "其他"}, "", 2)
	interactive := filepath.Join(dir, "interactive.json")
	invoke([]string{"roles", "new", "--output", interactive}, "custom.interactive\n交互角色\n整理项目说明。\n", 0)
	invoke([]string{"roles", "edit", interactive}, "新名称\n\n", 0)
	roleSource, err := roles.Files.ReadFile("builtin/reviewer.yaml")
	if err != nil {
		t.Fatal(err)
	}
	invoke([]string{"roles", "validate", "-", "--json"}, string(roleSource), 0)
	invoke([]string{"roles", "validate", "-"}, "id: [", 2)
	handoffSource, err := roles.Files.ReadFile("examples/handoff.yaml")
	if err != nil {
		t.Fatal(err)
	}
	invoke([]string{"handoff", "validate", "-", "--json"}, string(handoffSource), 0)
	invoke([]string{"handoff", "validate", "-"}, string(roleSource), 2)
}
