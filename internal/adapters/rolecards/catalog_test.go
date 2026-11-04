package rolecards_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/songconmaisaix31-design/Astrocyte/contracts"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/rolecards"
	"github.com/songconmaisaix31-design/Astrocyte/internal/swarm/domain"
	"github.com/songconmaisaix31-design/Astrocyte/roles"
)

func TestBuiltinCardsAndExamples(t *testing.T) {
	catalog, err := rolecards.New()
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"builtin.implementer", "builtin.operator", "builtin.planner", "builtin.researcher", "builtin.reviewer", "builtin.writer"}
	if len(catalog.List()) != len(want) {
		t.Fatalf("角色数量: %d", len(catalog.List()))
	}
	for index, role := range catalog.List() {
		if role.ID != want[index] {
			t.Fatalf("角色 %s，预期 %s", role.ID, want[index])
		}
		found, err := catalog.Find(role.ID)
		if err != nil || !reflect.DeepEqual(found, role) {
			t.Fatalf("读取角色 %s: %v", role.ID, err)
		}
	}
	for _, name := range []string{"document-writer", "text-reviewer"} {
		data, err := roles.Files.ReadFile("examples/" + name + ".yaml")
		if err != nil {
			t.Fatal(err)
		}
		role, err := catalog.ParseRole(data)
		if err != nil {
			t.Fatal(err)
		}
		encoded, err := json.Marshal(role)
		if err != nil {
			t.Fatal(err)
		}
		roundTrip, err := catalog.ParseRole(encoded)
		if err != nil || !reflect.DeepEqual(role, roundTrip) {
			t.Fatalf("JSON/YAML 内容不一致: %v", err)
		}
	}
	data, err := contracts.CardSchemas.ReadFile("examples/handoff-card.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := catalog.ParseHandoff(data); err != nil {
		t.Fatal(err)
	}
	if err := catalog.Load(roles.Files, "builtin/*.yaml"); err == nil {
		t.Fatal("重复角色 ID 未拒绝")
	}
	if _, err := catalog.Find("builtin.missing"); err == nil {
		t.Fatal("未知角色未拒绝")
	}
}

func TestRoleFormatErrors(t *testing.T) {
	catalog, err := rolecards.New()
	if err != nil {
		t.Fatal(err)
	}
	source, err := roles.Files.ReadFile("builtin/reviewer.yaml")
	if err != nil {
		t.Fatal(err)
	}
	valid, err := catalog.ParseRole(source)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(valid)
	if err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(map[string]any){
		"missing_id":      func(v map[string]any) { delete(v, "id") },
		"version":         func(v map[string]any) { v["schema_version"] = "0.2" },
		"unknown":         func(v map[string]any) { v["unknown"] = true },
		"name_type":       func(v map[string]any) { v["name"] = 1 },
		"icon_type":       func(v map[string]any) { v["icon"] = []string{} },
		"zero_budget":     func(v map[string]any) { v["budget"].(map[string]any)["max_context_tokens"] = 0 },
		"negative_steps":  func(v map[string]any) { v["budget"].(map[string]any)["max_steps"] = -1 },
		"duplicate_tools": func(v map[string]any) { v["tools"] = []string{"read", "read"} },
		"spaced_tools":    func(v map[string]any) { v["tools"] = []string{"read write"} },
		"spaced_agent":    func(v map[string]any) { v["agents"] = []string{"open code"} },
		"context_field":   func(v map[string]any) { v["handoff_policy"].(map[string]any)["accept_context"] = []string{"password"} },
		"empty_emit":      func(v map[string]any) { v["handoff_policy"].(map[string]any)["emit"] = []string{""} },
		"role_reference":  func(v map[string]any) { v["handoff_policy"].(map[string]any)["auto_handoff"] = []string{"invalid id"} },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			var value map[string]any
			if err := json.Unmarshal(encoded, &value); err != nil {
				t.Fatal(err)
			}
			mutate(value)
			data, err := json.Marshal(value)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := catalog.ParseRole(data); err == nil {
				t.Fatal("非法角色格式未拒绝")
			}
		})
	}
	for _, data := range []string{"name: [", string(source) + "\nid: builtin.other\n", string(source) + "\n---\nname: extra\n"} {
		if _, err := catalog.ParseRole([]byte(data)); err == nil {
			t.Fatal("损坏、重复字段或多个文档未拒绝")
		}
	}
	dir := t.TempDir()
	valid.ID = "custom.duplicate"
	duplicate, err := json.Marshal(valid)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"a.yaml", "b.yaml"} {
		if err := os.WriteFile(filepath.Join(dir, name), duplicate, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := catalog.Load(os.DirFS(dir), "*.yaml"); err == nil {
		t.Fatal("目录中的重复 ID 未拒绝")
	}
}

func TestHandoffFormatErrors(t *testing.T) {
	catalog, err := rolecards.New()
	if err != nil {
		t.Fatal(err)
	}
	source, err := contracts.CardSchemas.ReadFile("examples/handoff-card.yaml")
	if err != nil {
		t.Fatal(err)
	}
	card, err := catalog.ParseHandoff(source)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(card)
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"schema_version", "handoff_id", "session_id", "from_role", "to_role", "at", "card"} {
		t.Run("missing_"+field, func(t *testing.T) {
			var value map[string]any
			if err := json.Unmarshal(encoded, &value); err != nil {
				t.Fatal(err)
			}
			delete(value, field)
			data, err := json.Marshal(value)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := catalog.ParseHandoff(data); err == nil {
				t.Fatalf("缺少 %s 未拒绝", field)
			}
		})
	}
	for _, mutate := range []func(*domain.HandoffCard){
		func(c *domain.HandoffCard) { c.At = "yesterday" },
		func(c *domain.HandoffCard) { c.SchemaVersion = "unknown" },
		func(c *domain.HandoffCard) { c.HandoffID = "id with spaces" },
		func(c *domain.HandoffCard) { c.Card.SourceTrace = []domain.SourceTrace{} },
		func(c *domain.HandoffCard) { c.Card.SourceTrace[0].Field = domain.ContextDone },
	} {
		var copy domain.HandoffCard
		if err := json.Unmarshal(encoded, &copy); err != nil {
			t.Fatal(err)
		}
		mutate(&copy)
		data, err := json.Marshal(copy)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := catalog.ParseHandoff(data); err == nil {
			t.Fatal("非法交接时间、版本或来源未拒绝")
		}
	}
	englishGoal := "Review the project documentation"
	card.Card.Goal = &englishGoal
	data, err := json.Marshal(card)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := catalog.ParseHandoff(data); err != nil {
		t.Fatalf("交接正文应允许英文空格: %v", err)
	}
}
