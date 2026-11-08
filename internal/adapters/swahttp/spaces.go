package swahttp

import (
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"net/http"
)

func (h *handler) registerSpaces(mux *http.ServeMux) {
	s := h.services.ProjectSpaces
	if s == nil {
		return
	}
	mux.HandleFunc("GET /api/v1/project-spaces", func(w http.ResponseWriter, r *http.Request) {
		value, err := s.ListProjectSpaces(r.Context(), localCaller(r))
		h.result(w, r, http.StatusOK, value, err)
	})
	mux.HandleFunc("GET /api/v1/project-spaces/{id}", func(w http.ResponseWriter, r *http.Request) {
		value, err := s.GetProjectSpace(r.Context(), localCaller(r), r.PathValue("id"))
		h.result(w, r, http.StatusOK, value, err)
	})
	mux.HandleFunc("POST /api/v1/project-spaces", commandHandler(h, func(c *workspace.ProjectSpaceCommand) *workspace.WorkspaceCommandMeta { return &c.WorkspaceCommandMeta }, http.StatusCreated, func(r *http.Request, c workspace.ProjectSpaceCommand) (any, error) {
		return s.CreateProjectSpace(r.Context(), localCaller(r), c)
	}))
}
