package s1_test

import (
	"net/http"
	"path/filepath"
	"testing"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/sqlite"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/attention/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

func TestNativeMessageActualProductionPreparationAndPermission(t *testing.T) {
	s := newAutomaticHTTP(t)
	var space app.ProjectSpaceResult
	s.request("POST", "/api/v1/project-spaces", app.ProjectSpaceCommand{CommandMeta: localCommand(1), Title: "Public native message verification"}, http.StatusCreated, &space)
	var registered struct {
		Project domain.LocalProject `json:"project"`
	}
	s.request("POST", "/api/v1/local-projects", struct {
		app.CommandMeta
		domain.RegisterProjectCommand
	}{localCommand(1), domain.RegisterProjectCommand{Name: "Public native message", Root: s.root, SpaceID: space.Space.ID}}, http.StatusOK, &registered)
	project := registered.Project
	settings := project.Settings
	settings.AllowedActions = []string{"read_context", "start", "send", "observe", "stop"}
	settings.AllowedTools = []string{}
	settings.AllowDirectory = true
	settings.AllowedSubdirs = []string{"."}
	settings.ExternalModelCLI = "codex"
	s.request("PUT", "/api/v1/local-projects/"+project.ID+"/settings", struct {
		app.CommandMeta
		domain.SettingsCommand
	}{localCommand(1), domain.SettingsCommand{ExpectedRevision: project.Settings.Revision, Settings: settings}}, http.StatusOK, &registered)
	var started struct {
		Session domain.NativeSession `json:"session"`
	}
	s.request("POST", "/api/v1/local-projects/"+project.ID+"/sessions", struct {
		app.CommandMeta
		domain.NativeCommand
	}{localCommand(1), domain.NativeCommand{CLI: "codex", Context: domain.ContextRequest{Files: []string{"README.md"}}}}, http.StatusOK, &started)
	if started.Session.NativeID == "" || started.Session.Ownership != "owned" {
		t.Fatal("actual owned Codex session unavailable")
	}
	path := "/api/v1/local-projects/" + project.ID + "/sessions/" + started.Session.ID
	defer func() {
		var stopped struct {
			Observation domain.NativeObservation `json:"observation"`
		}
		s.request("POST", path+"/stop", localCommand(1), http.StatusOK, &stopped)
		if !stopped.Observation.StopConfirmed {
			t.Error("actual native stop was not confirmed")
		}
	}()
	command := struct {
		app.CommandMeta
		Message string `json:"message"`
	}{localCommand(1), "仅依据固定公开 README 回复项目名称。不要调用工具。"}
	var observation struct {
		Observation domain.NativeObservation `json:"observation"`
	}
	s.request("POST", path+"/send", command, http.StatusOK, &observation)
	s.request("GET", path+"/observe", nil, http.StatusOK, &observation)
	s.request("POST", path+"/send", command, http.StatusOK, &observation)
	db, err := sqlite.Open(filepath.Join(s.dir, "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var status string
	if err := db.Conn().QueryRow("SELECT json_extract(data, '$.operations.\"' || ? || '\".status') FROM local_agent_sessions WHERE id=?", command.RequestID, started.Session.ID).Scan(&status); err != nil || status != "accepted" {
		t.Fatal("actual native send receipt was not retained", err)
	}
	settings.AllowedActions = []string{"read_context", "start", "observe", "stop"}
	s.request("PUT", "/api/v1/local-projects/"+project.ID+"/settings", struct {
		app.CommandMeta
		domain.SettingsCommand
	}{localCommand(1), domain.SettingsCommand{ExpectedRevision: registered.Project.Settings.Revision, Settings: settings}}, http.StatusOK, &registered)
	command.CommandMeta = localCommand(1)
	var denied apierrors.ErrorEnvelope
	s.request("POST", path+"/send", command, http.StatusForbidden, &denied)
	if denied.Error == nil || denied.Error.Code != apierrors.ScopeDenied {
		t.Fatal("revoked native send permission was not preserved")
	}
	t.Logf("actual native preparation, send, duplicate and permission rejection; evidence=%s native_id=%s", s.dir, started.Session.NativeID)
}
