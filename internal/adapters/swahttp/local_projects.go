package swahttp

import (
	"net/http"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

func localList[T any](items []T) apierrors.ListResult {
	result := apierrors.EmptyList()
	for _, item := range items {
		result.Items = append(result.Items, item)
	}
	return result
}
func localEnvelope(key string, value any) any { return map[string]any{"schema_version": 1, key: value} }

type registerCommand struct {
	workspace.WorkspaceCommandMeta
	domain.RegisterProjectCommand
}
type discoverCommand struct {
	workspace.WorkspaceCommandMeta
	Root string `json:"root"`
}
type settingsCommand struct {
	workspace.WorkspaceCommandMeta
	domain.SettingsCommand
}
type grantCommand struct {
	workspace.WorkspaceCommandMeta
	AgentID string   `json:"agent_id"`
	Actions []string `json:"actions"`
}
type agentCommand struct {
	workspace.WorkspaceCommandMeta
	AgentID string `json:"agent_id"`
}
type contextCommand struct {
	workspace.WorkspaceCommandMeta
	domain.ContextRequest
}

func (h *handler) registerProjects(mux *http.ServeMux) {
	s := h.services.LocalProjects
	if s == nil {
		return
	}
	mux.HandleFunc("GET /api/v1/local-projects", func(w http.ResponseWriter, r *http.Request) {
		projects, err := s.ListProjects(r.Context(), localCaller(r))
		h.result(w, r, http.StatusOK, localList(projects), err)
	})
	mux.HandleFunc("POST /api/v1/local-projects", commandHandler(h, func(c *registerCommand) *workspace.WorkspaceCommandMeta { return &c.WorkspaceCommandMeta }, http.StatusOK, func(r *http.Request, c registerCommand) (any, error) {
		p, err := s.RegisterProject(r.Context(), localCaller(r), c.RegisterProjectCommand)
		return localEnvelope("project", p), err
	}))
	mux.HandleFunc("POST /api/v1/local-projects/discover", commandHandler(h, func(c *discoverCommand) *workspace.WorkspaceCommandMeta { return &c.WorkspaceCommandMeta }, http.StatusOK, func(r *http.Request, c discoverCommand) (any, error) {
		p, err := s.DiscoverProjects(r.Context(), localCaller(r), c.Root)
		return localList(p), err
	}))
	mux.HandleFunc("PUT /api/v1/local-projects/{id}/settings", commandHandler(h, func(c *settingsCommand) *workspace.WorkspaceCommandMeta { return &c.WorkspaceCommandMeta }, http.StatusOK, func(r *http.Request, c settingsCommand) (any, error) {
		p, err := s.SetProjectSettings(r.Context(), localCaller(r), r.PathValue("id"), c.SettingsCommand)
		return localEnvelope("project", p), err
	}))
	mux.HandleFunc("POST /api/v1/local-projects/{id}/grants", commandHandler(h, func(c *grantCommand) *workspace.WorkspaceCommandMeta { return &c.WorkspaceCommandMeta }, http.StatusOK, func(r *http.Request, c grantCommand) (any, error) {
		p, err := s.GrantProjectAgent(r.Context(), localCaller(r), r.PathValue("id"), domain.ProjectGrant{AgentID: c.AgentID, Actions: c.Actions})
		return localEnvelope("grant", p), err
	}))
	mux.HandleFunc("POST /api/v1/local-projects/{id}/grants/revoke", commandHandler(h, func(c *agentCommand) *workspace.WorkspaceCommandMeta { return &c.WorkspaceCommandMeta }, http.StatusOK, func(r *http.Request, c agentCommand) (any, error) {
		p, err := s.RevokeProjectAgent(r.Context(), localCaller(r), r.PathValue("id"), c.AgentID)
		return localEnvelope("grant", p), err
	}))
	mux.HandleFunc("POST /api/v1/local-projects/{id}/agent-token", commandHandler(h, func(c *agentCommand) *workspace.WorkspaceCommandMeta { return &c.WorkspaceCommandMeta }, http.StatusOK, func(r *http.Request, c agentCommand) (any, error) {
		p, err := s.IssueProjectAgentToken(r.Context(), localCaller(r), r.PathValue("id"), c.AgentID)
		return localEnvelope("credential", p), err
	}))
	mux.HandleFunc("POST /api/v1/local-projects/{id}/context", commandHandler(h, func(c *contextCommand) *workspace.WorkspaceCommandMeta { return &c.WorkspaceCommandMeta }, http.StatusOK, func(r *http.Request, c contextCommand) (any, error) {
		return s.ReadProjectContext(r.Context(), localCaller(r), r.PathValue("id"), c.ContextRequest)
	}))
}
