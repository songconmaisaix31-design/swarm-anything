package s1_test

import (
	"net/http"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/sqlite"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/attention/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

func TestNativeMessageActualProductionPreparationAndToolRestriction(t *testing.T) {
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
	var rejected apierrors.ErrorEnvelope
	s.request("POST", path+"/send", command, http.StatusNotImplemented, &rejected)
	if rejected.Error == nil || rejected.Error.Code != apierrors.UnsupportedCapability {
		t.Fatal("actual native tool restriction was not preserved")
	}
	db, err := sqlite.Open(filepath.Join(s.dir, "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	prepared, err := db.LoadNativeMessagePreparation(t.Context(), started.Session.ID, command.RequestID)
	if err != nil {
		t.Fatal(err)
	}
	if prepared.Phase != "send_attempted" || prepared.ObjectRef == "" || prepared.Input.ControllerID == "" || prepared.Input.StartupOperationID == "" || prepared.Input.OperationID != command.RequestID || prepared.Input.Session.ID != started.Session.ID || prepared.Input.Session.NativeID != started.Session.NativeID {
		t.Fatal("actual native message preparation was not retained")
	}
	readSession := func() string {
		var data, status string
		if err := db.Conn().QueryRowContext(t.Context(), "SELECT data, json_extract(data, '$.operations.\"' || ? || '\".status') FROM local_agent_sessions WHERE id=?", command.RequestID, started.Session.ID).Scan(&data, &status); err != nil || status != "unknown" {
			t.Fatal("actual unknown native send receipt was not retained", err)
		}
		return data
	}
	before := readSession()
	s.request("POST", path+"/send", command, http.StatusConflict, &rejected)
	if rejected.Error == nil || rejected.Error.Code != apierrors.DeliveryUnknown {
		t.Fatal("duplicate unknown native send was not rejected")
	}
	after, err := db.LoadNativeMessagePreparation(t.Context(), started.Session.ID, command.RequestID)
	if err != nil || !reflect.DeepEqual(prepared, after) || readSession() != before {
		t.Fatal("duplicate native send changed the original preparation or session", err)
	}
	settings.AllowedActions = []string{"read_context", "start", "observe", "stop"}
	s.request("PUT", "/api/v1/local-projects/"+project.ID+"/settings", struct {
		app.CommandMeta
		domain.SettingsCommand
	}{localCommand(1), domain.SettingsCommand{ExpectedRevision: registered.Project.Settings.Revision, Settings: settings}}, http.StatusOK, &registered)
	command.CommandMeta = localCommand(1)
	var denied apierrors.ErrorEnvelope
	s.request("POST", path+"/send", command, http.StatusForbidden, &denied)
	if denied.Error == nil || denied.Error.Code != apierrors.ApprovalRequired {
		t.Fatalf("revoked native send permission was not preserved: %+v", denied.Error)
	}
	t.Logf("actual native preparation, tool restriction, unknown receipt, duplicate rejection and revoked permission; evidence=%s native_id=%s", s.dir, started.Session.NativeID)
}
