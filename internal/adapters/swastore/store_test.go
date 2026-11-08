package swastore

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/projectfiles"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
	migrations "github.com/songconmaisaix31-design/Astrocyte/migrations/swa"
)

type legacyFixture struct {
	SourceRevision       string `json:"source_revision"`
	SourcePath           string `json:"source_path"`
	SourceLocator        string `json:"source_locator"`
	ContentSHA256        string `json:"content_sha256"`
	DatabaseSHA256       string `json:"database_sha256"`
	MaterialID           string `json:"material_id"`
	SpaceID              string `json:"space_id"`
	SpaceVersion         int    `json:"space_version"`
	CallerID             string `json:"caller_id"`
	ReferenceRequestID   string `json:"reference_request_id"`
	ReceiptCount         int    `json:"receipt_count"`
	OriginalReopenReplay bool   `json:"original_reopen_replay"`
}

func readLegacyFixture(t *testing.T) (legacyFixture, []byte) {
	t.Helper()
	root := filepath.Join("testdata", "legacy", "fixture")
	metadata, err := os.ReadFile(filepath.Join(root, "source.json"))
	if err != nil {
		t.Fatal(err)
	}
	var original legacyFixture
	if err := json.Unmarshal(metadata, &original); err != nil {
		t.Fatal(err)
	}
	if original.SourceRevision != "644bbe8701ae1b1c30b54f18621c28e03dbf6082" || original.SourcePath != "LICENSE" || !original.OriginalReopenReplay {
		t.Fatal("actual legacy source and original replay provenance are missing")
	}
	database, err := os.ReadFile(filepath.Join(root, "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(database)
	if hex.EncodeToString(sum[:]) != original.DatabaseSHA256 {
		t.Fatal("actual closed legacy database differs from its recorded source")
	}
	content, err := os.ReadFile(filepath.Join(root, "objects", original.ContentSHA256))
	if err != nil {
		t.Fatal(err)
	}
	sum = sha256.Sum256(content)
	if hex.EncodeToString(sum[:]) != original.ContentSHA256 {
		t.Fatal("actual legacy public source object changed")
	}
	return original, database
}

func openStore(t *testing.T, full bool) *DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "state.sqlite")
	if full {
		_, original := readLegacyFixture(t)
		if err := os.WriteFile(path, original, 0600); err != nil {
			t.Fatal(err)
		}
	}
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	if full {
		return db
	}
	if err := db.RunMigrations(context.Background(), migrations.FS); err != nil {
		t.Fatal(err)
	}
	return db
}
func createSpace(t *testing.T, db *DB) (domain.Caller, workspace.ProjectSpaceCommand, workspace.ProjectSpaceResult) {
	t.Helper()
	caller := domain.Caller{ID: "local-human", Kind: "human"}
	id := uuid.NewString()
	command := workspace.ProjectSpaceCommand{WorkspaceCommandMeta: workspace.WorkspaceCommandMeta{SchemaVersion: 1, RequestID: id, IdempotencyKey: id, ExpectedVersion: 1}, Title: "SWA storage verification"}
	value, err := workspace.NewProjectSpaceService(NewProjectSpaceRepository(db), workspace.ProjectSpaceOptions{}).CreateProjectSpace(context.Background(), caller, command)
	if err != nil {
		t.Fatal(err)
	}
	return caller, command, value
}
func TestIndependentStoreFreshSchemaAndActualPermissions(t *testing.T) {
	db := openStore(t, false)
	ctx := context.Background()
	caller, command, created := createSpace(t, db)
	spaces := workspace.NewProjectSpaceService(NewProjectSpaceRepository(db), workspace.ProjectSpaceOptions{})
	replayed, err := spaces.CreateProjectSpace(ctx, caller, command)
	if err != nil || replayed.Space.ID != created.Space.ID {
		t.Fatal("original space receipt was not reused", err)
	}
	for _, table := range []string{"attention_materials", "attention_material_revisions", "cognition_nodes", "knowledge_entries", "materials"} {
		var count int
		if err := db.Conn().QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&count); err != nil || count != 0 {
			t.Fatal("unexpected other product table", table, count, err)
		}
	}
	var foreignKeys int
	if err := db.Conn().QueryRow("PRAGMA foreign_keys").Scan(&foreignKeys); err != nil || foreignKeys != 1 {
		t.Fatal("foreign keys disabled", err)
	}
	projects := workspace.NewLocalProjectService(db, nil, projectfiles.Files{}, nil)
	project, err := projects.RegisterProject(ctx, caller, domain.RegisterProjectCommand{Name: "Independent actual directory", Root: t.TempDir(), SpaceID: created.Space.ID})
	if err != nil {
		t.Fatal(err)
	}
	settings := domain.SettingsCommand{ExpectedRevision: project.Settings.Revision, Settings: domain.ProjectSettings{AllowedActions: []string{"observe", "read_context"}}}
	project, err = projects.SetProjectSettings(ctx, caller, project.ID, settings)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := projects.SetProjectSettings(ctx, caller, project.ID, settings); err == nil {
		t.Fatal("stale settings accepted")
	}
	settings.ExpectedRevision = project.Settings.Revision
	settings.Settings.ExternalModelCLI = "codex"
	_, err = projects.SetProjectSettings(ctx, caller, project.ID, settings)
	var denied *apierrors.ServiceError
	if !errors.As(err, &denied) || denied.Code != apierrors.UnsupportedCapability {
		t.Fatal("missing native registry was not explicitly unavailable", err)
	}
	grant, err := projects.GrantProjectAgent(ctx, caller, project.ID, domain.ProjectGrant{AgentID: "storage-review", Actions: []string{"observe"}})
	if err != nil {
		t.Fatal(err)
	}
	token, err := projects.IssueProjectAgentToken(ctx, caller, project.ID, grant.AgentID)
	if err != nil {
		t.Fatal(err)
	}
	actor, err := projects.AuthenticateAgentToken(ctx, token.Token)
	if err != nil || actor.ProjectID != project.ID {
		t.Fatal("actual token did not bind project", err)
	}
	if _, err = projects.RevokeProjectAgent(ctx, caller, project.ID, grant.AgentID); err != nil {
		t.Fatal(err)
	}
	if _, err = projects.AuthenticateAgentToken(ctx, token.Token); err == nil {
		t.Fatal("revoked credential remained valid")
	}
	if err := db.RunMigrations(ctx, migrations.FS); err != nil {
		t.Fatal("migration replay", err)
	}
}

func TestIndependentStoreNestedTransactionRollbackAndDatabaseIdentity(t *testing.T) {
	db := openStore(t, false)
	other := openStore(t, false)
	ctx := context.Background()
	_, _, created := createSpace(t, db)
	err := db.transactions.WithTransaction(ctx, func(ctx context.Context, conn *sql.Conn) error {
		if err := db.transactions.WithTransaction(ctx, func(_ context.Context, nested *sql.Conn) error {
			if nested != conn {
				t.Fatal("nested transaction acquired another connection")
			}
			return nil
		}); err != nil {
			return err
		}
		if _, err := other.ProjectConnection(ctx); err == nil {
			t.Fatal("another database accepted transaction")
		}
		if _, err := conn.ExecContext(ctx, "UPDATE attention_project_spaces SET version=2 WHERE id=?", created.Space.ID); err != nil {
			return err
		}
		_, err := conn.ExecContext(ctx, "INSERT INTO local_agent_grants(project_id,agent_id,data) VALUES(?,?,?)", uuid.NewString(), "constraint-check", "{}")
		return err
	})
	if err == nil {
		t.Fatal("actual foreign key constraint did not fail")
	}
	var version int
	if err := db.Conn().QueryRow("SELECT version FROM attention_project_spaces WHERE id=?", created.Space.ID).Scan(&version); err != nil || version != 1 {
		t.Fatal("preceding space write was not rolled back", version, err)
	}
}

func TestIndependentMigrationsPreserveActualLegacyRows(t *testing.T) {
	db := openStore(t, true)
	ctx := context.Background()
	caller, command, created := createSpace(t, db)
	projects := workspace.NewLocalProjectService(db, nil, projectfiles.Files{}, nil)
	project, err := projects.RegisterProject(ctx, caller, domain.RegisterProjectCommand{Name: "Existing project", Root: t.TempDir(), SpaceID: created.Space.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := projects.GrantProjectAgent(ctx, caller, project.ID, domain.ProjectGrant{AgentID: "migration-review", Actions: []string{"observe"}}); err != nil {
		t.Fatal(err)
	}
	snapshot := func() map[string][]string {
		result := map[string][]string{}
		for _, table := range []string{"attention_project_spaces", "attention_receipts", "attention_outbox", "local_agent_projects", "local_agent_grants"} {
			rows, err := db.Conn().Query("SELECT * FROM " + table + " ORDER BY 1")
			if err != nil {
				t.Fatal(err)
			}
			cols, err := rows.Columns()
			if err != nil {
				t.Fatal(err)
			}
			for rows.Next() {
				values := make([]string, len(cols))
				scan := make([]any, len(cols))
				for i := range values {
					scan[i] = &values[i]
				}
				if err := rows.Scan(scan...); err != nil {
					t.Fatal(err)
				}
				result[table] = append(result[table], values...)
			}
			if err := errors.Join(rows.Err(), rows.Close()); err != nil {
				t.Fatal(err)
			}
		}
		return result
	}
	before := snapshot()
	if err := db.RunMigrations(ctx, migrations.FS); err != nil {
		t.Fatal(err)
	}
	if after := snapshot(); !reflect.DeepEqual(before, after) {
		t.Fatal("standalone migration changed original durable rows")
	}
	var original int
	if err := db.Conn().QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE name='attention_materials'").Scan(&original); err != nil || original != 1 {
		t.Fatal("legacy table was removed", err)
	}
	replay, err := workspace.NewProjectSpaceService(NewProjectSpaceRepository(db), workspace.ProjectSpaceOptions{}).CreateProjectSpace(ctx, caller, command)
	if err != nil || replay.Space.ID != created.Space.ID {
		t.Fatal("legacy receipt identity changed", err)
	}
}
