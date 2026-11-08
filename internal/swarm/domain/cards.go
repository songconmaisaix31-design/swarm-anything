package domain

import (
	"fmt"
	"slices"
)

type ContextField string

const (
	ContextGoal      ContextField = "goal"
	ContextDone      ContextField = "done"
	ContextDecisions ContextField = "decisions"
	ContextArtifacts ContextField = "artifacts"
	ContextTodos     ContextField = "todos"
)

type RoleCard struct {
	SchemaVersion string        `json:"schema_version"`
	ID            string        `json:"id"`
	Name          string        `json:"name"`
	Icon          string        `json:"icon,omitempty"`
	Description   string        `json:"description,omitempty"`
	Identity      string        `json:"identity"`
	Tools         *[]string     `json:"tools,omitempty"`
	Agents        *[]string     `json:"agents,omitempty"`
	HandoffPolicy HandoffPolicy `json:"handoff_policy"`
	Budget        RoleBudget    `json:"budget"`
}

type HandoffPolicy struct {
	AcceptContext *[]ContextField `json:"accept_context,omitempty"`
	Emit          []string        `json:"emit"`
	AutoHandoff   []string        `json:"auto_handoff"`
}

type RoleBudget struct {
	MaxContextTokens int `json:"max_context_tokens"`
	MaxSteps         int `json:"max_steps"`
}

func (r RoleCard) EffectiveBudget() RoleBudget {
	budget := r.Budget
	if budget.MaxContextTokens == 0 {
		budget.MaxContextTokens = 16000
	}
	if budget.MaxSteps == 0 {
		budget.MaxSteps = 20
	}
	return budget
}

func (r RoleCard) CheckBudget(contextTokens, completedSteps int) error {
	if contextTokens < 0 || completedSteps < 0 {
		return fmt.Errorf("上下文 tokens 和已完成步骤必须为非负数")
	}
	budget := r.EffectiveBudget()
	if contextTokens > budget.MaxContextTokens {
		return fmt.Errorf("角色 %s 上下文为 %d tokens，超过上限 %d", r.ID, contextTokens, budget.MaxContextTokens)
	}
	if completedSteps >= budget.MaxSteps {
		return fmt.Errorf("角色 %s 已完成 %d 步，达到上限 %d", r.ID, completedSteps, budget.MaxSteps)
	}
	return nil
}

func (r RoleCard) AllowsAgent(id string) bool {
	return r.Agents == nil || len(*r.Agents) == 0 || slices.Contains(*r.Agents, id)
}

func (r RoleCard) EffectiveTools(defaults []string) []string {
	if r.Tools == nil {
		return slices.Clone(defaults)
	}
	return slices.Clone(*r.Tools)
}

func (r RoleCard) Accepts(field ContextField) bool {
	return r.HandoffPolicy.AcceptContext == nil || slices.Contains(*r.HandoffPolicy.AcceptContext, field)
}

type HandoffCard struct {
	SchemaVersion string         `json:"schema_version"`
	HandoffID     string         `json:"handoff_id"`
	SessionID     string         `json:"session_id"`
	FromRole      string         `json:"from_role"`
	ToRole        string         `json:"to_role"`
	At            string         `json:"at"`
	Card          HandoffContent `json:"card"`
}

type HandoffContent struct {
	Goal        *string       `json:"goal,omitempty"`
	Done        *[]string     `json:"done,omitempty"`
	Decisions   *[]string     `json:"decisions,omitempty"`
	Artifacts   *[]string     `json:"artifacts,omitempty"`
	Todos       *[]string     `json:"todos,omitempty"`
	SourceTrace []SourceTrace `json:"source_trace"`
}

type SourceTrace struct {
	Field ContextField `json:"field"`
	Role  string       `json:"role"`
	MsgID string       `json:"msg_id"`
}

func (c HandoffContent) Has(field ContextField) bool {
	switch field {
	case ContextGoal:
		return c.Goal != nil
	case ContextDone:
		return c.Done != nil
	case ContextDecisions:
		return c.Decisions != nil
	case ContextArtifacts:
		return c.Artifacts != nil
	case ContextTodos:
		return c.Todos != nil
	default:
		return false
	}
}

func (c HandoffContent) SelectFor(role RoleCard) HandoffContent {
	selected := HandoffContent{SourceTrace: []SourceTrace{}}
	if c.Goal != nil && role.Accepts(ContextGoal) {
		goal := *c.Goal
		selected.Goal = &goal
	}
	copyField := func(field ContextField, value *[]string) *[]string {
		if value == nil || !role.Accepts(field) {
			return nil
		}
		copy := slices.Clone(*value)
		return &copy
	}
	selected.Done = copyField(ContextDone, c.Done)
	selected.Decisions = copyField(ContextDecisions, c.Decisions)
	selected.Artifacts = copyField(ContextArtifacts, c.Artifacts)
	selected.Todos = copyField(ContextTodos, c.Todos)
	for _, trace := range c.SourceTrace {
		if selected.Has(trace.Field) {
			selected.SourceTrace = append(selected.SourceTrace, trace)
		}
	}
	return selected
}

func (c HandoffContent) ValidateTrace() error {
	fields := []ContextField{ContextGoal, ContextDone, ContextDecisions, ContextArtifacts, ContextTodos}
	for _, trace := range c.SourceTrace {
		if !c.Has(trace.Field) {
			return fmt.Errorf("交接来源引用未携带的字段 %s", trace.Field)
		}
	}
	for _, field := range fields {
		if !c.Has(field) {
			continue
		}
		found := slices.ContainsFunc(c.SourceTrace, func(trace SourceTrace) bool { return trace.Field == field })
		if !found {
			return fmt.Errorf("交接字段 %s 缺少来源角色和消息", field)
		}
	}
	return nil
}
