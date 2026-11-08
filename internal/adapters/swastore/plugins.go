package swastore

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"slices"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	pluginapp "github.com/songconmaisaix31-design/Astrocyte/internal/plugins/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/plugins/domain"
)

var _ pluginapp.Repository = (*DB)(nil)
var _ pluginapp.Authorizer = (*DB)(nil)

// 许可由当前项目与原有 Grant 共同决定，插件 scopes 不替代项目授权。
func (db *DB) AuthorizePluginProject(ctx context.Context, p domain.Principal, project, action string) error {
	if _, err := db.LoadProject(ctx, project); err != nil {
		return err
	}
	if p.Kind == "human" && p.ID != "" {
		return nil
	}
	if p.Kind != "agent" || p.ID == "" || p.ProjectID != project {
		return pluginDenied("plugin caller is outside this project")
	}
	g, err := db.LoadGrant(ctx, project, p.ID)
	if err != nil || g.RevokedAt != nil || g.ExpiresAt != nil && !g.ExpiresAt.After(time.Now()) {
		return pluginDenied("project Agent grant is absent, expired or revoked")
	}
	if !slices.Contains(g.Actions, action) {
		return pluginDenied("current project grant does not allow this reference action")
	}
	return nil
}

func pluginDenied(message string) error {
	return &apierrors.ServiceError{Code: apierrors.ScopeDenied, Message: message, RequiredAction: "review_current_project_grant"}
}

func (db *DB) WithPluginTransaction(ctx context.Context, fn func(context.Context) error) error {
	return db.transactions.WithTransaction(ctx, func(tx context.Context, _ *sql.Conn) error { return fn(tx) })
}

func (db *DB) LoadPluginConnection(ctx context.Context, project, plugin string) (result domain.Connection, err error) {
	conn, err := db.ProjectConnection(ctx)
	if err != nil {
		return result, err
	}
	var data string
	err = conn.QueryRowContext(ctx, "SELECT data FROM swa_plugin_connections WHERE project_id=? AND plugin_id=?", project, plugin).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return result, apierrors.NewNotFound("plugin connection", plugin)
	}
	if err != nil {
		return result, err
	}
	err = json.Unmarshal([]byte(data), &result)
	return
}

func (db *DB) SavePluginConnection(ctx context.Context, c domain.Connection, expected int) error {
	if err := c.Validate(); err != nil {
		return err
	}
	if err := requireVersion(c.Version, expected); err != nil {
		return err
	}
	conn, err := db.ProjectConnection(ctx)
	if err != nil {
		return err
	}
	data, err := json.Marshal(c)
	if err != nil {
		return err
	}
	var result sql.Result
	if expected == 0 {
		result, err = conn.ExecContext(ctx, "INSERT INTO swa_plugin_connections(project_id,plugin_id,version,data) VALUES(?,?,?,?) ON CONFLICT(project_id,plugin_id) DO NOTHING", c.ProjectID, c.PluginID, c.Version, string(data))
	} else {
		result, err = conn.ExecContext(ctx, "UPDATE swa_plugin_connections SET version=?,data=? WHERE project_id=? AND plugin_id=? AND version=?", c.Version, string(data), c.ProjectID, c.PluginID, expected)
	}
	return workspaceCAS(result, err)
}

func (db *DB) SavePluginReference(ctx context.Context, r domain.Reference) error {
	if err := r.Validate(); err != nil {
		return err
	}
	conn, err := db.ProjectConnection(ctx)
	if err != nil {
		return err
	}
	_, err = conn.ExecContext(ctx, "INSERT INTO swa_plugin_references(project_id,plugin_id,kind,object_id,revision) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING", r.ProjectID, r.PluginID, r.Kind, r.ObjectID, r.Revision)
	return err
}

func (db *DB) LoadPluginReference(ctx context.Context, r domain.Reference) (domain.Reference, error) {
	if err := r.Validate(); err != nil {
		return domain.Reference{}, err
	}
	conn, err := db.ProjectConnection(ctx)
	if err != nil {
		return domain.Reference{}, err
	}
	var present int
	err = conn.QueryRowContext(ctx, "SELECT 1 FROM swa_plugin_references WHERE project_id=? AND plugin_id=? AND kind=? AND object_id=? AND revision=?", r.ProjectID, r.PluginID, r.Kind, r.ObjectID, r.Revision).Scan(&present)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.Reference{}, apierrors.NewNotFound("plugin reference", r.ObjectID)
	}
	return r, err
}

func (db *DB) RecordPluginEvent(ctx context.Context, e domain.Event) (result domain.RecordedEvent, err error) {
	if err := e.Validate(); err != nil {
		return result, err
	}
	e.OccurredAt = e.OccurredAt.UTC()
	err = db.WithPluginTransaction(ctx, func(tx context.Context) error {
		conn, err := db.ProjectConnection(tx)
		if err != nil {
			return err
		}
		data, err := json.Marshal(e)
		if err != nil {
			return err
		}
		if _, err := conn.ExecContext(tx, "INSERT INTO swa_plugin_events(source,event_id,project_id,data) VALUES(?,?,?,?) ON CONFLICT(source,event_id) DO NOTHING", e.Source, e.EventID, e.ProjectID, string(data)); err != nil {
			return err
		}
		var original string
		if err := conn.QueryRowContext(tx, "SELECT data FROM swa_plugin_events WHERE source=? AND event_id=?", e.Source, e.EventID).Scan(&original); err != nil {
			return err
		}
		if original != string(data) {
			return conflict("plugin event identity already refers to different content")
		}
		if err := db.SavePluginReference(tx, e.ObjectRef); err != nil {
			return err
		}
		result = recorded(e)
		return nil
	})
	return
}

func (db *DB) LoadPluginEvent(ctx context.Context, project, source, id string) (domain.RecordedEvent, error) {
	conn, err := db.ProjectConnection(ctx)
	if err != nil {
		return domain.RecordedEvent{}, err
	}
	var data string
	var e domain.Event
	err = conn.QueryRowContext(ctx, "SELECT data FROM swa_plugin_events WHERE project_id=? AND source=? AND event_id=?", project, source, id).Scan(&data)
	if errors.Is(err, sql.ErrNoRows) {
		return domain.RecordedEvent{}, apierrors.NewNotFound("plugin event", id)
	}
	if err != nil {
		return domain.RecordedEvent{}, err
	}
	if err := json.Unmarshal([]byte(data), &e); err != nil {
		return domain.RecordedEvent{}, err
	}
	return recorded(e), nil
}

func recorded(e domain.Event) domain.RecordedEvent {
	return domain.RecordedEvent{Event: e, Receipt: domain.EventReceipt{SchemaVersion: 1, Source: e.Source, EventID: e.EventID, Status: "recorded"}}
}
