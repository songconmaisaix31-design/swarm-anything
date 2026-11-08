package swastore

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

var _ app.OrcaExecutionLinks = (*DB)(nil)

func (db *DB) LoadOrcaExecutionLink(ctx context.Context, authority, runID string) (app.OrcaExecutionLink, error) {
	var link app.OrcaExecutionLink
	var created string
	err := db.conn.QueryRowContext(ctx, `SELECT project_id, grant_agent_id, settings_revision,
        authority_domain, native_run_id, native_root_task_id, created_at
        FROM orca_execution_links WHERE authority_domain=? AND native_run_id=?`, authority, runID).
		Scan(&link.ProjectID, &link.GrantAgentID, &link.SettingsRevision, &link.AuthorityDomain, &link.RunID, &link.RootTaskID, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return link, apierrors.NewNotFound("Orca execution association", runID)
	}
	if err != nil {
		return link, err
	}
	link.CreatedAt, err = time.Parse(time.RFC3339Nano, created)
	return link, err
}

func (db *DB) SaveOrcaExecutionLink(ctx context.Context, link app.OrcaExecutionLink) error {
	if link.ProjectID == "" || link.GrantAgentID == "" || link.SettingsRevision < 1 || link.AuthorityDomain == "" || link.RunID == "" || link.RootTaskID == "" || link.CreatedAt.IsZero() {
		return &apierrors.ServiceError{Code: apierrors.ValidationFailed, Message: "complete project and native association identity is required", RequiredAction: "inspect_native_task_creation"}
	}
	_, err := db.conn.ExecContext(ctx, `INSERT INTO orca_execution_links
        (authority_domain, native_run_id, native_root_task_id, project_id, grant_agent_id, settings_revision, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(authority_domain, native_run_id) DO NOTHING`,
		link.AuthorityDomain, link.RunID, link.RootTaskID, link.ProjectID, link.GrantAgentID, link.SettingsRevision, link.CreatedAt.UTC().Format(time.RFC3339Nano))
	if err != nil {
		return err
	}
	stored, err := db.LoadOrcaExecutionLink(ctx, link.AuthorityDomain, link.RunID)
	if err != nil {
		return err
	}
	if stored.ProjectID != link.ProjectID || stored.GrantAgentID != link.GrantAgentID || stored.SettingsRevision != link.SettingsRevision || stored.RootTaskID != link.RootTaskID {
		return &apierrors.ServiceError{Code: apierrors.VersionConflict, Message: "native Run already has a different project association", RequiredAction: "inspect_existing_native_run_association"}
	}
	return nil
}
