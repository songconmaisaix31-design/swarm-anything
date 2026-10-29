package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/events"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/httpapi"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/sqlite"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	attention "github.com/songconmaisaix31-design/Astrocyte/internal/attention/app"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
	"github.com/songconmaisaix31-design/Astrocyte/migrations"
)

// A controlled driver verifies real HTTP/service/SQLite boundaries without
// claiming the user-pending CLI tool/workspace policy has been exercised.
type relayControlledDriver struct {
	workspace.RelayDriver
	launches, sends int
	now             *time.Time
}

func (d *relayControlledDriver) Launch(_ context.Context, r workspace.RelayLaunch) (workspace.RelayObservation, error) {
	d.launches++
	if !strings.Contains(r.Input, "HANDOFF_MANUAL:") || !strings.Contains(r.Input, "TASK:") {
		return workspace.RelayObservation{}, &apierrors.ServiceError{Code: apierrors.EvidenceMissing}
	}
	return workspace.RelayObservation{Session: domain.NativeSession{ID: "fixture-native", Status: "running"}, Events: []domain.RelayEvent{{Kind: "turn_started", Source: "native", Sequence: 1, TS: *d.now}}}, nil
}
func (d *relayControlledDriver) Send(context.Context, workspace.RelayLaunch, string) (workspace.RelayObservation, error) {
	d.sends++
	return workspace.RelayObservation{}, &apierrors.ServiceError{Code: apierrors.DeliveryUnknown, Message: "PRIVATE_CANARY"}
}
func (d *relayControlledDriver) Read(context.Context, workspace.RelayLaunch) (workspace.RelayObservation, error) {
	return workspace.RelayObservation{Events: []domain.RelayEvent{{Kind: "turn_started", Source: "native", Sequence: 1, TS: *d.now}}}, nil
}

type relayFailureSink struct {
	delegate workspace.RelayEventSink
	fail     bool
	calls    int
}

func (s *relayFailureSink) EmitRelayEvent(ctx context.Context, v domain.RelayEvent) error {
	s.calls++
	if s.fail {
		return errors.New("PRIVATE_CANARY source error")
	}
	return s.delegate.EmitRelayEvent(ctx, v)
}
func (d *relayControlledDriver) Stop(context.Context, workspace.RelayLaunch) (workspace.RelayObservation, error) {
	return workspace.RelayObservation{ExitConfirmed: true}, nil
}

type relayControlledWorkspace struct {
	root     string
	prepared int
}

func (w *relayControlledWorkspace) Prepare(_ context.Context, _ domain.Work, v domain.RelayWorkspace) (domain.RelayWorkspace, error) {
	if !v.Prepared {
		w.prepared++
		v.Root = filepath.Join(w.root, v.ID)
		v.Prepared = true
		v.Branch = "fixture/relay"
	}
	return v, nil
}
func (w *relayControlledWorkspace) Observe(context.Context, domain.RelayWorkspace) (string, error) {
	return "fixture-git-state", nil
}

type relayPersistentHTTP struct {
	t       *testing.T
	server  *httptest.Server
	cookie  *http.Cookie
	csrf    string
	samples []relayContractSample
}
type relayContractSample struct {
	Schema string          `json:"schema"`
	Body   json.RawMessage `json:"body"`
}

func (c *relayPersistentHTTP) request(method, path, body, key string, status int) []byte {
	c.t.Helper()
	r, e := http.NewRequest(method, c.server.URL+path, strings.NewReader(body))
	if e != nil {
		c.t.Fatal("request unavailable")
	}
	if c.cookie != nil {
		r.AddCookie(c.cookie)
	}
	if method == "POST" {
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-CSRF-Token", c.csrf)
		if key == "" {
			key = uuid.NewString()
		}
		r.Header.Set("Idempotency-Key", key)
	}
	resp, e := http.DefaultClient.Do(r)
	if e != nil {
		c.t.Fatal("HTTP transport unavailable")
	}
	defer resp.Body.Close()
	b, e := io.ReadAll(resp.Body)
	if e != nil || resp.StatusCode != status {
		var safeFailure struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		_ = json.Unmarshal(b, &safeFailure)
		c.t.Fatalf("HTTP status=%d expected=%d public_code=%s", resp.StatusCode, status, safeFailure.Error.Code)
	}
	if strings.Contains(string(b), "PRIVATE_CANARY") {
		c.t.Fatal("private provider error leaked")
	}
	if status == 200 && strings.Contains(path, "/relay/") {
		schema := "RelayTaskResultV1"
		switch {
		case path == "/api/v1/relay/agents":
			schema = "RelayAgentsV1"
		case strings.HasSuffix(path, "/receipts"):
			schema = "RelayReceiptsV1"
		case strings.HasSuffix(path, "/events"):
			schema = "RelayEventsV1"
		case path == "/api/v1/relay/tasks":
			schema = "RelayTasksV1"
		case method == "POST" && path != "/api/v1/relay/intents" && !strings.HasSuffix(path, "/transition") && !strings.HasSuffix(path, "/events/reconcile"):
			schema = "RelayActionResultV1"
		}
		c.samples = append(c.samples, relayContractSample{schema, append(json.RawMessage(nil), b...)})
	}
	if path == "/api/v1/auth/session" {
		c.cookie = resp.Cookies()[0]
		var a struct {
			CSRF string `json:"csrf_token"`
		}
		if json.Unmarshal(b, &a) != nil {
			c.t.Fatal("bootstrap response invalid")
		}
		c.csrf = a.CSRF
	}
	return b
}

func TestRelayPersistentRealHTTPReceiptsMutexAndRestart(t *testing.T) {
	ctx := context.Background()
	testDataBase := relayTestLocalAppData(t)
	evidenceRoot := filepath.Join(testDataBase, "astrocyte-workbench", "v0.2-access", "verification")
	local := filepath.Join(testDataBase, "astrocyte-workbench", "v0.2-access", "verification", "relay-runtime-http", uuid.NewString())
	if os.MkdirAll(local, 0700) != nil {
		t.Fatal("test state directory unavailable")
	}
	t.Setenv("LOCALAPPDATA", local)
	root, e := relayRoot()
	if e != nil {
		t.Fatal("state root unavailable")
	}
	appDir := filepath.Join(root, "app-state")
	if os.MkdirAll(appDir, 0700) != nil {
		t.Fatal("app state unavailable")
	}
	db, e := sqlite.Open(filepath.Join(appDir, "state.sqlite"))
	if e != nil {
		t.Fatal("app DB unavailable")
	}
	defer db.Close()
	if db.RunMigrations(ctx, migrations.FS) != nil {
		t.Fatal("app schema unavailable")
	}
	p := domain.LocalProject{ID: "project-a", Root: filepath.Join(root, "fixture-source"), Settings: domain.ProjectSettings{Revision: 1, ExternalModelCLI: "fixture-agent", AllowedActions: []string{"start", "send", "observe", "stop", "resume", "reconcile"}}}
	if db.SaveProject(ctx, p, 0) != nil {
		t.Fatal("project seed unavailable")
	}
	if db.SaveWorksSnapshot(ctx, domain.WorksSnapshot{Works: []domain.Work{{ID: "work-a", Root: p.Root, Platform: "fixture-platform", Kind: domain.WorkKindFolder}}}) != nil {
		t.Fatal("works seed unavailable")
	}
	if db.SaveWorkMetadata(ctx, "work-a", domain.WorkHumanMetadata{Revision: 1, Handoff: domain.WorkHandoff{Content: "controlled fixture handoff", Source: "human"}}, 0) != nil {
		t.Fatal("handoff seed unavailable")
	}
	works := workspace.NewWorksService(db, nil, nil, nil, workspace.WorksServiceOptions{})
	now := time.Now().UTC()
	driver := &relayControlledDriver{now: &now}
	neutral := &relayControlledWorkspace{root: filepath.Join(root, "worktrees")}
	options := workspace.RelayServiceOptions{Agents: []domain.AgentSpec{{Name: "fixture-agent", LaunchCmd: []string{"fixture-agent"}, DriveMode: "structured"}}, LivenessWindow: time.Minute, Clock: func() time.Time { return now }}
	store, e := sqlite.OpenRelayStore(root)
	if e != nil {
		t.Fatal("relay DB unavailable")
	}
	sink := &relayFailureSink{delegate: events.NewRelayEventSink(attention.NewPendingEventService(sqlite.NewEventRepository(db)), func() time.Time { return now }), fail: true}
	runtime := workspace.NewRelayService(store, works, db, neutral, driver, nil, sink, options)
	client := &relayPersistentHTTP{t: t, server: httptest.NewServer(httpapi.NewServer(httpapi.Config{Services: httpapi.Services{Relay: runtime}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}).Handler())}
	defer func() { client.server.Close(); store.Close() }()
	client.request("GET", "/api/v1/auth/session", "", "", 200)
	intent := `{"work_id":"work-a","project_id":"project-a","agent":"fixture-agent","task":"controlled human task"}`
	b := client.request("POST", "/api/v1/relay/intents", intent, "", 200)
	var ready struct {
		View domain.RelayTaskView `json:"view"`
	}
	if json.Unmarshal(b, &ready) != nil || ready.View.Task.State != "ready" || driver.launches != 0 {
		t.Fatal("intent launched or did not persist ready")
	}
	id := ready.View.Task.ID
	badKey := uuid.NewString()
	bad := `{"permission_confirmed":false,"permission_level":"A","project_settings_revision":1}`
	client.request("POST", "/api/v1/relay/intents/"+id+"/confirm", bad, badKey, 403)
	client.request("POST", "/api/v1/relay/intents/"+id+"/confirm", bad, badKey, 403)
	confirm := `{"permission_confirmed":true,"permission_level":"A","project_settings_revision":1}`
	key := uuid.NewString()
	b = client.request("POST", "/api/v1/relay/intents/"+id+"/confirm", confirm, key, 200)
	var accepted struct {
		View    domain.RelayTaskView `json:"view"`
		Receipt domain.RelayReceipt  `json:"receipt"`
	}
	if json.Unmarshal(b, &accepted) != nil || accepted.Receipt.Status != "accepted" || accepted.View.Task.State != "working" || accepted.View.Terminal.Liveness != "live" || driver.launches != 1 {
		t.Fatal("confirmed runtime state/receipt/live mismatch")
	}
	terminalID := accepted.View.Terminal.ID
	b = client.request("GET", "/api/v1/relay/tasks/"+id, "", "", 200)
	if json.Unmarshal(b, &ready) != nil || ready.View.EventPublication.Status != "error" || ready.View.EventPublication.PendingEvents != 1 || ready.View.EventPublication.PublishedEvents != 0 || sink.calls != 1 {
		t.Fatal("sink failure hidden or accepted launch changed")
	}
	client.request("POST", "/api/v1/relay/intents/"+id+"/confirm", confirm, key, 200)
	if driver.launches != 1 {
		t.Fatal("confirmed dispatch replay launched twice")
	}
	b = client.request("GET", "/api/v1/relay/tasks", "", "", 200)
	var list struct {
		IDs []string `json:"dispatched_work_ids"`
	}
	if json.Unmarshal(b, &list) != nil || len(list.IDs) != 1 || list.IDs[0] != "work-a" {
		t.Fatal("actual accepted dispatch count missing")
	}
	b = client.request("POST", "/api/v1/relay/intents", intent, "", 200)
	var other struct {
		View domain.RelayTaskView `json:"view"`
	}
	if json.Unmarshal(b, &other) != nil {
		t.Fatal("second intent unavailable")
	}
	b = client.request("POST", "/api/v1/relay/intents/"+other.View.Task.ID+"/confirm", confirm, "", 409)
	var conflict struct {
		Error struct {
			RequiredAction string `json:"required_action"`
		} `json:"error"`
	}
	if json.Unmarshal(b, &conflict) != nil || conflict.Error.RequiredAction != "view_existing_task:"+id {
		t.Fatal("mutex denial did not expose the verified existing public task")
	}
	b = client.request("GET", "/api/v1/relay/tasks/"+other.View.Task.ID+"/receipts", "", "", 200)
	var mutexReceipts struct {
		Receipts []domain.RelayReceipt `json:"receipts"`
	}
	if json.Unmarshal(b, &mutexReceipts) != nil || len(mutexReceipts.Receipts) != 2 {
		t.Fatal("mutex denial receipt unavailable")
	}
	foundConflict := false
	for _, receipt := range mutexReceipts.Receipts {
		if receipt.Action == "dispatch" && receipt.Status == "rejected" && receipt.Error != nil && receipt.Error.RequiredAction == "view_existing_task:"+id {
			foundConflict = true
		}
	}
	if !foundConflict {
		t.Fatal("saved mutex receipt lost existing public task")
	}
	if driver.launches != 1 || neutral.prepared != 1 {
		t.Fatal("exclusive workspace allowed second writer")
	}
	now = now.Add(2 * time.Minute)
	if runtime.(workspace.RelayLifecycle).ObserveOwned(ctx) != nil {
		t.Fatal("owned observation unavailable")
	}
	b = client.request("GET", "/api/v1/relay/tasks/"+id, "", "", 200)
	if json.Unmarshal(b, &ready) != nil || ready.View.Terminal.Liveness != "unverifiable" {
		t.Fatal("silent terminal inferred live or exited")
	}
	if ready.View.EventPublication.Status != "error" || sink.calls != 1 {
		t.Fatal("observer retried failed sink or renewed duplicate event")
	}
	sink.fail = false
	b = client.request("POST", "/api/v1/relay/tasks/"+id+"/events/reconcile", `{}`, "", 200)
	if json.Unmarshal(b, &ready) != nil || ready.View.EventPublication.Status != "published" || ready.View.EventPublication.PublishedEvents != 1 || ready.View.EventPublication.PendingEvents != 0 || sink.calls != 2 || driver.launches != 1 {
		t.Fatal("human stable event reconciliation replayed launch or did not publish")
	}
	sendKey := uuid.NewString()
	client.request("POST", "/api/v1/relay/tasks/"+id+"/send", `{"input":"controlled input"}`, sendKey, 409)
	client.request("POST", "/api/v1/relay/tasks/"+id+"/send", `{"input":"controlled input"}`, sendKey, 409)
	if driver.sends != 1 {
		t.Fatal("unknown delivery retried")
	}
	client.request("POST", "/api/v1/relay/tasks/"+id+"/read", `{}`, "", 409)
	client.request("POST", "/api/v1/relay/tasks/"+id+"/stop", `{}`, "", 200)
	b = client.request("GET", "/api/v1/relay/tasks/"+id, "", "", 200)
	if json.Unmarshal(b, &ready) != nil || ready.View.Terminal.Liveness != "exited" || ready.View.Task.Condition != "terminal_exited" || ready.View.Task.State != "working" {
		t.Fatal("confirmed exit conflated with task done")
	}
	client.server.Close()
	if store.Close() != nil {
		t.Fatal("store close unavailable")
	}
	store, e = sqlite.OpenRelayStore(root)
	if e != nil {
		t.Fatal("restart store unavailable")
	}
	runtime = workspace.NewRelayService(store, works, db, neutral, driver, nil, sink, options)
	client.server = httptest.NewServer(httpapi.NewServer(httpapi.Config{Services: httpapi.Services{Relay: runtime}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}).Handler())
	client.cookie = nil
	client.request("GET", "/api/v1/auth/session", "", "", 200)
	b = client.request("GET", "/api/v1/relay/tasks/"+id, "", "", 200)
	if json.Unmarshal(b, &ready) != nil || ready.View.Terminal.ID != terminalID || ready.View.Terminal.Liveness != "exited" {
		t.Fatal("restart lost terminal identity/exit evidence")
	}
	b = client.request("GET", "/api/v1/relay/tasks/"+id+"/receipts", "", "", 200)
	var receipts struct {
		Receipts []domain.RelayReceipt `json:"receipts"`
	}
	if json.Unmarshal(b, &receipts) != nil {
		t.Fatal("receipts unavailable")
	}
	firstRejected, unknown, read, stop := 0, 0, 0, 0
	for _, r := range receipts.Receipts {
		if r.OperationID == badKey && r.Status == "rejected" {
			firstRejected++
		}
		if r.OperationID == sendKey && r.Status == "delivery_unknown" {
			unknown++
		}
		if r.Action == "read" && r.Status == "rejected" && r.Error != nil && r.Error.Code == string(apierrors.VersionConflict) {
			read++
		}
		if r.Action == "stop" && r.Status == "accepted" {
			stop++
		}
	}
	if firstRejected != 1 || unknown != 1 || read != 1 || stop != 1 {
		t.Fatal("first RED/unknown or action receipts not durable exactly once")
	}
	b = client.request("GET", "/api/v1/relay/tasks/"+other.View.Task.ID+"/receipts", "", "", 200)
	if json.Unmarshal(b, &mutexReceipts) != nil {
		t.Fatal("original mutex receipt unavailable after reopen")
	}
	foundConflict = false
	for _, receipt := range mutexReceipts.Receipts {
		if receipt.Action == "dispatch" && receipt.Status == "rejected" && receipt.Error != nil && receipt.Error.RequiredAction == "view_existing_task:"+id {
			foundConflict = true
		}
	}
	if !foundConflict {
		t.Fatal("original mutex hint lost after reopen")
	}
	client.request("POST", "/api/v1/relay/tasks/"+id+"/send", `{"input":"controlled input"}`, sendKey, 409)
	if driver.sends != 1 {
		t.Fatal("restart replay retried unknown send")
	}
	rows, e := sqlite.NewEventRepository(db).ListEvents(ctx, 0, now.Add(time.Hour).UnixMilli())
	if e != nil || len(rows) != 1 || rows[0].Event != nil || rows[0].Observation.Outcome != "unknown" {
		t.Fatal("derived observation not pending or inferred model success")
	}
	if e = db.SaveGrant(ctx, domain.ProjectGrant{ProjectID: p.ID, AgentID: "fixture-agent", Actions: []string{"start", "send", "observe", "stop"}, RevokedAt: &now}); e != nil {
		t.Fatal("revocation fixture unavailable")
	}
	client.request("POST", "/api/v1/relay/tasks/"+id+"/read", `{}`, "", 403)
	b = client.request("GET", "/api/v1/relay/tasks/"+id+"/receipts", "", "", 200)
	if json.Unmarshal(b, &receipts) != nil {
		t.Fatal("denial receipt unavailable")
	}
	denied := 0
	for _, r := range receipts.Receipts {
		if r.Action == "read" && r.Status == "rejected" && r.Error != nil && r.Error.Code == "approval_revoked" {
			denied++
		}
	}
	if denied != 1 {
		t.Fatal("current revoked grant not checked or denial receipt missing")
	}
	encoded, e := json.Marshal(client.samples)
	if e != nil || os.WriteFile(filepath.Join(evidenceRoot, "http-runtime-contract-samples.json"), encoded, 0600) != nil {
		t.Fatal("local response validation evidence unavailable")
	}
}
