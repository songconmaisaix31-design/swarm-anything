package swastore

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	pluginapp "github.com/songconmaisaix31-design/Astrocyte/internal/plugins/app"
	plugin "github.com/songconmaisaix31-design/Astrocyte/internal/plugins/domain"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
	migrations "github.com/songconmaisaix31-design/Astrocyte/migrations/swa"
)

func TestPluginReferencesPersistWithoutContentAndRecheckCurrentGrants(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "plugins.sqlite")
	db, err := Open(path)
	if err != nil { t.Fatal(err) }
	t.Cleanup(func() { if err := db.Close(); err != nil { t.Error(err) } })
	if err := db.RunMigrations(ctx, migrations.FS); err != nil { t.Fatal(err) }
	p := workspace.LocalProject{ID: "project-one", Name: "Plugin boundary verification", Root: t.TempDir(), Settings: workspace.ProjectSettings{Revision: 1}}
	if err := db.SaveProject(ctx, p, 0); err != nil { t.Fatal(err) }
	service, err := pluginapp.NewService(db, db)
	if err != nil { t.Fatal(err) }
	human := plugin.Principal{Kind: "human", ID: "test-owner"}
	agent := plugin.Principal{Kind: "agent", ID: "test-agent", ProjectID: p.ID}
	c := plugin.Connection{SchemaVersion: 1, ProjectID: p.ID, PluginID: "attention-mirror-plugin", Transport: "stdio", ConfigurationRef: "attention-local", ContractVersion: "1", Scopes: []string{"references.read", "events.record"}, Version: 1}
	if err := service.Configure(ctx, agent, c, 0); err == nil { t.Fatal("Agent configured plugin permissions") }
	if err := service.Configure(ctx, human, c, 0); err != nil { t.Fatal(err) }
	if err := service.Configure(ctx, human, c, 0); err == nil { t.Fatal("stale connection version replaced the current row") }
	r := plugin.Reference{SchemaVersion: 1, ProjectID: p.ID, PluginID: c.PluginID, Kind: "opportunity", ObjectID: "opportunity-one", Revision: 3}
	if err := service.Remember(ctx, agent, r); err == nil { t.Fatal("plugin scope bypassed a missing project grant") }
	grant := workspace.ProjectGrant{ProjectID: p.ID, AgentID: agent.ID, Actions: []string{"read_context", "observe"}}
	if err := db.SaveGrant(ctx, grant); err != nil { t.Fatal(err) }
	if err := service.Remember(ctx, agent, r); err != nil { t.Fatal(err) }
	if actual, err := service.Reference(ctx, agent, r); err != nil || actual != r { t.Fatalf("fixed reference not retained: %#v %v", actual, err) }
	e := plugin.Event{SchemaVersion: 1, Source: c.PluginID, EventID: "admission-one", ProjectID: p.ID, OccurredAt: time.Date(2026, 11, 8, 14, 0, 0, 0, time.UTC), CorrelationID: "command-one", CausationID: "admission-command-one", ObjectRef: r}
	first, err := service.Record(ctx, agent, e)
	if err != nil || first.Receipt.Status != "recorded" { t.Fatalf("record failed: %#v %v", first, err) }
	if again, err := service.Record(ctx, agent, e); err != nil || again != first { t.Fatalf("same event did not return original reference receipt: %#v %v", again, err) }
	e.ObjectRef.Revision++
	_, err = service.Record(ctx, agent, e)
	var conflict *apierrors.ServiceError
	if !errors.As(err, &conflict) || conflict.Code != apierrors.VersionConflict { t.Fatalf("same identity accepted different content: %v", err) }
	if _, err := service.Reference(ctx, agent, e.ObjectRef); err == nil { t.Fatal("conflicting event inserted an extra reference") }
	now := time.Now().UTC()
	grant.RevokedAt = &now
	if err := db.SaveGrant(ctx, grant); err != nil { t.Fatal(err) }
	if _, err := service.Reference(ctx, agent, r); err == nil { t.Fatal("saved plugin scope survived current project grant revocation") }
	if _, err := service.Event(ctx, agent, p.ID, c.PluginID, first.Event.Source, first.Event.EventID); err == nil { t.Fatal("revoked Agent read original event") }
	if err := db.Close(); err != nil { t.Fatal(err) }
	db, err = Open(path)
	if err != nil { t.Fatal(err) }
	service, err = pluginapp.NewService(db, db)
	if err != nil { t.Fatal(err) }
	after, err := service.Event(ctx, human, p.ID, c.PluginID, first.Event.Source, first.Event.EventID)
	if err != nil || after != first { t.Fatalf("original event lost on database reopen: %#v %v", after, err) }
	c.Scopes = []string{}
	c.Version = 2
	if err := service.Configure(ctx, human, c, 1); err != nil { t.Fatal(err) }
	if _, err := service.Reference(ctx, human, r); err == nil { t.Fatal("empty plugin scope did not revoke access") }
	var copiedTables int
	if err := db.conn.QueryRowContext(ctx, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('attention_materials','engine_experiences','engine_knowledge')").Scan(&copiedTables); err != nil || copiedTables != 0 { t.Fatalf("SWA created plugin content tables: %d %v", copiedTables, err) }
}

func TestPluginContractsRejectBodyAndCallerInjection(t *testing.T) {
	for _, data := range []string{
		`{"schema_version":1,"plugin_id":"astrocyte-plugin","project_id":"project-one","kind":"experience","object_id":"experience-one","revision":1,"text":"private experience"}`,
		`{"schema_version":1,"plugin_id":"astrocyte-plugin","project_id":"project-one","kind":"experience","object_id":"experience-one","revision":1,"actor":{"kind":"human"}}`,
	} {
		var r plugin.Reference
		if err := json.Unmarshal([]byte(data), &r); err == nil { t.Fatal("reference accepted content or caller identity") }
	}
	var c plugin.Connection
	if err := json.Unmarshal([]byte(`{"schema_version":1,"project_id":"project-one","plugin_id":"astrocyte-plugin","transport":"stdio","configuration_ref":"astro-local","contract_version":"1","scopes":[],"version":1,"token":"secret"}`), &c); err == nil { t.Fatal("connection accepted a secret") }
	var e plugin.Event
	if err := json.Unmarshal([]byte(`{"schema_version":1,"source":"swa","event_id":"event-one","project_id":"project-one","occurred_at":"2026-11-08T14:00:00Z","correlation_id":"command-one","causation_id":"command-one","object_ref":{"schema_version":1,"plugin_id":"astrocyte-plugin","project_id":"project-one","kind":"completion","object_id":"task-one","revision":1},"payload":{"approval":"approved"}}`), &e); err == nil { t.Fatal("event accepted arbitrary approval payload") }
	e = plugin.Event{SchemaVersion: 1, Source: "swa", EventID: "event-one", ProjectID: "project-one", OccurredAt: time.Now(), CorrelationID: "command-one", CausationID: "command-one", ObjectRef: plugin.Reference{SchemaVersion: 1, PluginID: "astrocyte-plugin", ProjectID: "other-project", Kind: "completion", ObjectID: "task-one", Revision: 1}}
	if err := e.Validate(); err == nil { t.Fatal("event accepted cross-project reference") }
}
