package swahttp

import (
	"encoding/json"
	"io"
	"mime"
	"net/http"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	plugin "github.com/songconmaisaix31-design/Astrocyte/internal/plugins/domain"
)

func decodePlugin(h *handler, w http.ResponseWriter, r *http.Request, target any) bool {
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		h.result(w, r, 0, nil, invalid("Content-Type must be application/json"))
		return false
	}
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	d.DisallowUnknownFields()
	if err := d.Decode(target); err != nil {
		h.result(w, r, 0, nil, invalid("invalid plugin JSON or unsupported fields"))
		return false
	}
	if err := d.Decode(new(any)); err != io.EOF {
		h.result(w, r, 0, nil, invalid("one plugin command is required"))
		return false
	}
	return true
}

func pluginPrincipal(r *http.Request) plugin.Principal {
	c := localCaller(r)
	return plugin.Principal{ID: c.ID, Kind: c.Kind, ProjectID: c.ProjectID}
}

func pluginScope(r *http.Request, project, id string) error {
	if project != r.PathValue("id") || id != r.PathValue("plugin") {
		return &apierrors.ServiceError{Code: apierrors.ScopeDenied, Message: "plugin request does not match its project route", RequiredAction: "inspect_plugin_connection_and_current_project_grant"}
	}
	return nil
}

func (h *handler) registerPlugins(mux *http.ServeMux) {
	s := h.services.Plugins
	if s == nil {
		return
	}
	base := "/api/v1/local-projects/{id}/plugins/{plugin}"
	mux.HandleFunc("GET "+base, func(w http.ResponseWriter, r *http.Request) {
		c, err := s.Connection(r.Context(), pluginPrincipal(r), r.PathValue("id"), r.PathValue("plugin"))
		h.result(w, r, http.StatusOK, c, err)
	})
	mux.HandleFunc("PUT "+base, func(w http.ResponseWriter, r *http.Request) {
		var cmd struct {
			Connection      plugin.Connection `json:"connection"`
			ExpectedVersion int               `json:"expected_version"`
		}
		if !decodePlugin(h, w, r, &cmd) {
			return
		}
		if err := pluginScope(r, cmd.Connection.ProjectID, cmd.Connection.PluginID); err != nil {
			h.result(w, r, 0, nil, err)
			return
		}
		err := s.Configure(r.Context(), pluginPrincipal(r), cmd.Connection, cmd.ExpectedVersion)
		h.result(w, r, http.StatusOK, cmd.Connection, err)
	})
	mux.HandleFunc("POST "+base+"/references", func(w http.ResponseWriter, r *http.Request) {
		var ref plugin.Reference
		if !decodePlugin(h, w, r, &ref) {
			return
		}
		if err := pluginScope(r, ref.ProjectID, ref.PluginID); err != nil {
			h.result(w, r, 0, nil, err)
			return
		}
		err := s.Remember(r.Context(), pluginPrincipal(r), ref)
		h.result(w, r, http.StatusOK, ref, err)
	})
	mux.HandleFunc("POST "+base+"/events", func(w http.ResponseWriter, r *http.Request) {
		var event plugin.Event
		if !decodePlugin(h, w, r, &event) {
			return
		}
		if err := pluginScope(r, event.ProjectID, event.ObjectRef.PluginID); err != nil {
			h.result(w, r, 0, nil, err)
			return
		}
		receipt, err := s.Record(r.Context(), pluginPrincipal(r), event)
		h.result(w, r, http.StatusOK, receipt, err)
	})
	mux.HandleFunc("GET "+base+"/events", func(w http.ResponseWriter, r *http.Request) {
		receipt, err := s.Event(r.Context(), pluginPrincipal(r), r.PathValue("id"), r.PathValue("plugin"), r.URL.Query().Get("source"), r.URL.Query().Get("event_id"))
		h.result(w, r, http.StatusOK, receipt, err)
	})
}
