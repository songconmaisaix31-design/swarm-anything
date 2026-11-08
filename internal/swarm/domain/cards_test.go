package domain_test

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/songconmaisaix31-design/Astrocyte/internal/swarm/domain"
)

func TestRolePermissionAndBudget(t *testing.T) {
	role := domain.RoleCard{ID: "custom.writer"}
	defaults := []string{"read", "write"}
	if !reflect.DeepEqual(role.EffectiveTools(defaults), defaults) || !role.AllowsAgent("opencode") {
		t.Fatal("缺省工具和 Agent 语义错误")
	}
	empty := []string{}
	role.Tools, role.Agents = &empty, &empty
	if role.EffectiveTools(defaults) == nil || len(role.EffectiveTools(defaults)) != 0 || !role.AllowsAgent("opencode") {
		t.Fatal("显式空工具和 Agent 语义错误")
	}
	selected := []string{"read"}
	role.Tools = &selected
	agents := []string{"opencode"}
	role.Agents = &agents
	if !reflect.DeepEqual(role.EffectiveTools(defaults), selected) || !role.AllowsAgent("opencode") || role.AllowsAgent("codex") {
		t.Fatal("白名单语义错误")
	}
	if got := role.EffectiveBudget(); got.MaxContextTokens != 16000 || got.MaxSteps != 20 {
		t.Fatalf("缺省预算: %+v", got)
	}
	for _, counts := range [][2]int{{0, 0}, {16000, 19}} {
		if err := role.CheckBudget(counts[0], counts[1]); err != nil {
			t.Fatal(err)
		}
	}
	for _, counts := range [][2]int{{16001, 0}, {1, 20}, {-1, 0}, {0, -1}} {
		if err := role.CheckBudget(counts[0], counts[1]); err == nil {
			t.Fatalf("预算未拒绝: %+v", counts)
		}
	}
	role.Budget = domain.RoleBudget{MaxContextTokens: 8000, MaxSteps: 10}
	if err := role.CheckBudget(8000, 9); err != nil {
		t.Fatal(err)
	}
	if err := role.CheckBudget(8001, 9); err == nil {
		t.Fatal("角色预算覆盖没有生效")
	}
}

func TestHandoffSelectiveContext(t *testing.T) {
	goal := "编写使用说明"
	done, decisions, artifacts, todos := []string{"读取现有文档"}, []string{"使用现有 CLI"}, []string{"CONTRIBUTING.md"}, []string{"检查命令"}
	card := domain.HandoffContent{Goal: &goal, Done: &done, Decisions: &decisions, Artifacts: &artifacts, Todos: &todos}
	fields := []domain.ContextField{domain.ContextGoal, domain.ContextDone, domain.ContextDecisions, domain.ContextArtifacts, domain.ContextTodos}
	for _, field := range fields {
		card.SourceTrace = append(card.SourceTrace, domain.SourceTrace{Field: field, Role: "builtin.planner", MsgID: "documentation.request"})
	}
	before, err := json.Marshal(card)
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range fields {
		t.Run(string(field), func(t *testing.T) {
			accept := []domain.ContextField{field}
			role := domain.RoleCard{HandoffPolicy: domain.HandoffPolicy{AcceptContext: &accept}}
			selected := card.SelectFor(role)
			for _, other := range fields {
				if selected.Has(other) != (other == field) {
					t.Fatalf("字段选择错误: %s", other)
				}
			}
			if len(selected.SourceTrace) != 1 || selected.SourceTrace[0].Field != field || selected.SourceTrace[0].Role != "builtin.planner" || selected.SourceTrace[0].MsgID != "documentation.request" {
				t.Fatalf("来源关系改变: %+v", selected.SourceTrace)
			}
			if err := selected.ValidateTrace(); err != nil {
				t.Fatal(err)
			}
			if selected.Goal != nil {
				*selected.Goal = "修改派生内容"
			}
			if selected.Artifacts != nil {
				(*selected.Artifacts)[0] = "修改派生成果"
			}
			selected.SourceTrace[0].MsgID = "derived.message"
			after, err := json.Marshal(card)
			if err != nil || string(before) != string(after) {
				t.Fatalf("原卡片发生变化: %v", err)
			}
		})
	}
	empty := []domain.ContextField{}
	selected := card.SelectFor(domain.RoleCard{HandoffPolicy: domain.HandoffPolicy{AcceptContext: &empty}})
	if len(selected.SourceTrace) != 0 || selected.Goal != nil || selected.Done != nil || selected.Decisions != nil || selected.Artifacts != nil || selected.Todos != nil {
		t.Fatal("空 accept_context 应不携带业务字段")
	}
	if !reflect.DeepEqual(card, card.SelectFor(domain.RoleCard{})) {
		t.Fatal("缺省 accept_context 应接收所有业务字段")
	}
}
