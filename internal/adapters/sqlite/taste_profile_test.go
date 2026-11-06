package sqlite

import (
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/importers"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/objects"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	attention "github.com/songconmaisaix31-design/Astrocyte/internal/attention/app"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/migrations"
)

func tasteDirectory(t *testing.T) string {
	t.Helper()
	base, err := filepath.Abs("../../../.verification")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(base, 0700); err != nil {
		t.Fatal(err)
	}
	directory, err := os.MkdirTemp(base, "taste-profile-actual-")
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("owned actual SQLite and objects: %s", directory)
	return directory
}

func tasteMeta() attention.CommandMeta {
	return attention.CommandMeta{SchemaVersion: 1, RequestID: uuid.NewString(), IdempotencyKey: uuid.NewString(), ExpectedVersion: 1}
}

func tasteService(t *testing.T, db *DB, directory string) *attention.Service {
	t.Helper()
	store, err := objects.New(filepath.Join(directory, "objects"))
	if err != nil {
		t.Fatal(err)
	}
	return attention.NewAttentionService(NewAttentionRepository(db), importers.NewReader(nil), store, attention.ServiceOptions{})
}

// 明确的配置规则输入仅用于服务验证，不代表用户的实际品味或授权。
func tasteCommand(t *testing.T, service *attention.Service, principal attention.Principal) attention.UpdateTasteProfileCommand {
	t.Helper()
	body, err := os.ReadFile("../../../README.md")
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	imported, err := service.ImportMaterial(ctx, principal, attention.ImportMaterialCommand{
		CommandMeta: tasteMeta(), Adapter: "manual", Kind: "text", Title: "Astrocyte README",
		SourceLocator: "https://github.com/songconmaisaix31-design/Astrocyte/blob/" + "4ec19cddb24068e09597357b0aabc6ecb9420930/README.md", ExportText: string(body),
	})
	if err != nil {
		t.Fatal(err)
	}
	if processed, err := service.ProcessNextJob(ctx); err != nil || !processed {
		t.Fatal("actual manual import did not process", processed, err)
	}
	job, err := service.GetJob(ctx, principal, imported.JobID)
	if err != nil || job.Status != "succeeded" || job.MaterialID == nil || job.MaterialRevision == nil {
		t.Fatal("actual manual import failed", job.Status, err)
	}
	material, err := service.GetMaterial(ctx, principal, *job.MaterialID)
	if err != nil {
		t.Fatal(err)
	}
	revision := material.Revisions[*job.MaterialRevision-1]
	return attention.UpdateTasteProfileCommand{
		CommandMeta: tasteMeta(), Enabled: true,
		Rubrics: []attention.TasteRubric{{ID: "readme-rule", QuestionType: "truth", Criteria: "核查固定 README 是否包含开发入口说明", Options: []attention.TasteOption{}, Levels: []string{}}},
		Examples: []attention.TasteExample{{ID: "readme-example", RubricID: "readme-rule", MaterialID: material.Material.ID,
			Revision: revision.Revision, ContentDigest: revision.ContentDigest, Expected: "1"}},
		Delegations: []attention.TasteDelegation{},
	}
}

func tasteCode(t *testing.T, err error, code apierrors.Code) {
	t.Helper()
	var serviceError *apierrors.ServiceError
	if !errors.As(err, &serviceError) || serviceError.Code != code {
		t.Fatalf("expected %s, actual %v", code, err)
	}
}

func TestTasteProfileActualServiceHistoryCASAndRestart(t *testing.T) {
	ctx := context.Background()
	directory := tasteDirectory(t)
	path := filepath.Join(directory, "state.sqlite")
	db := openAttentionDB(t, path)
	service := tasteService(t, db, directory)
	principal := attention.Principal{Kind: "human", ID: "local-taste-rule-test"}
	empty, err := service.GetTasteProfile(ctx, principal)
	if err != nil || empty.Configured || empty.Profile != nil {
		t.Fatal("unconfigured actual database produced taste values", err)
	}
	command := tasteCommand(t, service, principal)
	first, err := service.UpdateTasteProfile(ctx, principal, command)
	if err != nil {
		t.Fatal(err)
	}
	if !first.Configured || first.Profile.Version != 1 || first.Profile.ConfiguredBy != principal.ID || first.Profile.CreatedAt.IsZero() || len(first.Profile.Delegations) != 0 {
		t.Fatal("actual profile configuration or empty delegations changed")
	}
	for _, questionType := range []string{"choice", "score", "truth", "source-check", ""} {
		// 仅验证题型规则，不宣称执行了这些题型的模型判断。
		rule := *first.Profile
		rule.Rubrics = append([]attention.TasteRubric(nil), rule.Rubrics...)
		rule.Examples = append([]attention.TasteExample(nil), rule.Examples...)
		rule.Rubrics[0].QuestionType = questionType
		switch questionType {
		case "choice":
			rule.Rubrics[0].Options = []attention.TasteOption{{ID: "present", Description: "包含开发入口"}, {ID: "absent", Description: "缺少开发入口"}}
			rule.Examples[0].Expected = "present"
		case "score":
			rule.Rubrics[0].Levels = []string{"缺少开发入口", "包含开发入口"}
		}
		err := attention.ValidateTasteProfile(rule)
		if (err == nil) != (questionType == "choice" || questionType == "score" || questionType == "truth") {
			t.Fatal("taste question type differs from the three supported judgment types", questionType, err)
		}
	}
	for _, expected := range []string{"null", "true", `"1"`, "-0.1", "1.1", "NaN", "1 2"} {
		rule := *first.Profile
		rule.Examples = append([]attention.TasteExample(nil), rule.Examples...)
		rule.Examples[0].Expected = expected
		if err := attention.ValidateTasteProfile(rule); err == nil {
			t.Fatal("truth accepted a nonnumeric or out-of-range expected value", expected)
		}
	}
	malformed := command
	malformed.CommandMeta = tasteMeta()
	malformed.Examples = append([]attention.TasteExample(nil), command.Examples...)
	malformed.Examples[0].Expected = "unknown"
	_, err = service.UpdateTasteProfile(ctx, principal, malformed)
	tasteCode(t, err, apierrors.ValidationFailed)
	otherDB := openAttentionDB(t, path)
	otherService := tasteService(t, otherDB, directory)
	results := make(chan error, 8)
	var group sync.WaitGroup
	for i := range 8 {
		group.Go(func() {
			update := command
			update.CommandMeta = tasteMeta()
			update.Enabled = false
			target := service
			if i%2 == 1 {
				target = otherService
			}
			_, err := target.UpdateTasteProfile(ctx, principal, update)
			results <- err
		})
	}
	group.Wait()
	close(results)
	winners := 0
	for err := range results {
		if err == nil {
			winners++
		} else {
			tasteCode(t, err, apierrors.VersionConflict)
		}
	}
	if winners != 1 {
		t.Fatalf("actual two-connection CAS winners=%d", winners)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	if err := otherDB.Close(); err != nil {
		t.Fatal(err)
	}
	reopened := openAttentionDB(t, path)
	service = tasteService(t, reopened, directory)
	snapshot, err := service.ReadTasteProfile(ctx, principal, "attention", 1)
	if err != nil || !snapshot.Configured || snapshot.Current.Version != 2 || snapshot.Current.Enabled || !reflect.DeepEqual(snapshot.Fixed, first.Profile) {
		t.Fatal("fixed/current profile or immutable history changed on restart", err)
	}
	replayed, err := service.UpdateTasteProfile(ctx, principal, command)
	if err != nil || !reflect.DeepEqual(first, replayed) {
		t.Fatal("restart did not replay original complete receipt", err)
	}
	for _, query := range []string{
		"SELECT COUNT(*) FROM attention_taste_profile_revisions",
		"SELECT COUNT(*) FROM attention_receipts WHERE command='UpdateTasteProfile'",
		"SELECT COUNT(*) FROM attention_outbox WHERE type='attention.taste_profile_updated'",
	} {
		var count int
		if err := reopened.Conn().QueryRow(query).Scan(&count); err != nil || count != 2 {
			t.Fatal("actual CAS/replay created additional records", count, err)
		}
	}
	_, err = service.UpdateTasteProfile(ctx, attention.Principal{Kind: "agent", ID: "ungranted-agent"}, command)
	tasteCode(t, err, apierrors.ScopeDenied)
	changed := command
	changed.Enabled = false
	_, err = service.UpdateTasteProfile(ctx, principal, changed)
	tasteCode(t, err, apierrors.VersionConflict)
	_, err = service.ReadTasteProfile(ctx, principal, "attention", 3)
	tasteCode(t, err, apierrors.NotFound)
	if err := NewAttentionRepository(reopened).WithTx(ctx, func(tx attention.AttentionTx) error {
		return tx.(attention.TasteProfileTx).SaveTasteProfile(*first.Profile, 0)
	}); err == nil {
		t.Fatal("existing immutable first revision was overwritten")
	}
}

func TestTasteProfileActualTransactionSourceAndRollback(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	directory := tasteDirectory(t)
	db := openAttentionDB(t, filepath.Join(directory, "state.sqlite"))
	service := tasteService(t, db, directory)
	principal := attention.Principal{Kind: "human", ID: "local-taste-rule-test"}
	command := tasteCommand(t, service, principal)
	before := db.Conn().Stats().WaitCount
	err := NewWorkspaceRepository(db).WithWorkspaceTx(ctx, func(tx workspace.WorkspaceTx) error {
		configured, err := service.UpdateTasteProfile(tx.Context(), principal, command)
		if err != nil {
			return err
		}
		if _, err := service.ReadTasteProfile(tx.Context(), principal, "attention", configured.Profile.Version); err != nil {
			return err
		}
		// 同一真实事务中再次插入已有主键，整项配置、回执和事件必须回滚。
		conn, err := WorkspaceTransaction(tx.Context(), db)
		if err != nil {
			return err
		}
		_, err = conn.ExecContext(tx.Context(), "INSERT INTO attention_taste_profile_revisions SELECT * FROM attention_taste_profile_revisions")
		return storageError(err)
	})
	tasteCode(t, err, apierrors.VersionConflict)
	if db.Conn().Stats().WaitCount != before {
		t.Fatal("same-database source read borrowed another connection")
	}
	for _, query := range []string{
		"SELECT COUNT(*) FROM attention_taste_profiles", "SELECT COUNT(*) FROM attention_taste_profile_revisions",
		"SELECT COUNT(*) FROM attention_receipts WHERE command='UpdateTasteProfile'",
		"SELECT COUNT(*) FROM attention_outbox WHERE type='attention.taste_profile_updated'",
	} {
		var count int
		if err := db.Conn().QueryRow(query).Scan(&count); err != nil || count != 0 {
			t.Fatal("failed actual transaction left profile state", count, err)
		}
	}
	configured, err := service.UpdateTasteProfile(ctx, principal, command)
	if err != nil {
		t.Fatal(err)
	}
	wrongDigest := command
	wrongDigest.CommandMeta = tasteMeta()
	wrongDigest.Examples = append([]attention.TasteExample(nil), command.Examples...)
	wrongDigest.Examples[0].ContentDigest = "explicit-invalid-digest-rule-input"
	_, err = service.UpdateTasteProfile(ctx, principal, wrongDigest)
	tasteCode(t, err, apierrors.VersionConflict)
	material, err := service.GetMaterial(ctx, principal, command.Examples[0].MaterialID)
	if err != nil {
		t.Fatal(err)
	}
	meta := tasteMeta()
	meta.ExpectedVersion = material.Material.Version
	if _, err := service.UpdateMaterial(ctx, principal, material.Material.ID, attention.UpdateMaterialCommand{CommandMeta: meta, Lifecycle: "withdrawn"}); err != nil {
		t.Fatal(err)
	}
	_, err = service.ReadTasteProfile(ctx, principal, "attention", configured.Profile.Version)
	tasteCode(t, err, apierrors.ScopeDenied)
	retry := command
	retry.CommandMeta = tasteMeta()
	_, err = service.UpdateTasteProfile(ctx, principal, retry)
	tasteCode(t, err, apierrors.ScopeDenied)
	other := openAttentionDB(t, filepath.Join(directory, "other.sqlite"))
	wrongService := tasteService(t, other, directory)
	err = NewWorkspaceRepository(db).WithWorkspaceTx(ctx, func(tx workspace.WorkspaceTx) error {
		_, err := wrongService.ReadTasteProfile(tx.Context(), principal, "attention", 1)
		return err
	})
	if err == nil {
		t.Fatal("taste reader accepted another actual database transaction")
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := service.GetTasteProfile(ctx, principal); err == nil {
		t.Fatal("closed actual database returned a profile")
	}
}

func TestTasteProfileActualMigrationUpgrade(t *testing.T) {
	directory := tasteDirectory(t)
	oldDirectory := filepath.Join(directory, "previous-migrations")
	if err := os.Mkdir(oldDirectory, 0700); err != nil {
		t.Fatal(err)
	}
	names, err := fs.Glob(migrations.FS, "*.sql")
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 28 || names[25] != "026_taste_profiles.sql" || names[26] != "027_openviking.sql" || names[27] != "028_orca_execution_links.sql" {
		t.Fatalf("actual upgrade requires the current 28 migration sources: %v", names)
	}
	for _, name := range names {
		if name >= "026_taste_profiles.sql" {
			continue
		}
		body, err := migrations.FS.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(oldDirectory, name), body, 0600); err != nil {
			t.Fatal(err)
		}
	}
	db, err := Open(filepath.Join(directory, "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	ctx := context.Background()
	if err := db.RunMigrations(ctx, os.DirFS(oldDirectory)); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := db.Conn().QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'attention_taste_%'").Scan(&count); err != nil || count != 0 {
		t.Fatal("actual previous schema already contains taste tables", count, err)
	}
	if err := db.RunMigrations(ctx, migrations.FS); err != nil {
		t.Fatal(err)
	}
	if err := db.Conn().QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'attention_taste_%'").Scan(&count); err != nil || count != 2 {
		t.Fatal("upgrade did not add exactly two taste tables", count, err)
	}
	backups, err := filepath.Glob(filepath.Join(directory, "backups", "*.sqlite"))
	if err != nil || len(backups) != 1 {
		t.Fatal("actual upgrade backup missing", backups, err)
	}
	if err := db.RunMigrations(ctx, migrations.FS); err != nil {
		t.Fatal(err)
	}
	if err := db.Conn().QueryRow("SELECT COUNT(*) FROM _migrations").Scan(&count); err != nil || count != len(names) {
		t.Fatal("migration idempotence or existing migrations changed", count, err)
	}
	rows, err := db.Conn().QueryContext(ctx, "SELECT id FROM _migrations ORDER BY id")
	if err != nil {
		t.Fatal(err)
	}
	var applied []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		applied = append(applied, id)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if err := rows.Close(); err != nil {
		t.Fatal(err)
	}
	expected := make([]string, len(names))
	for index, name := range names {
		expected[index] = strings.TrimSuffix(name, ".sql")
	}
	if !reflect.DeepEqual(applied, expected) {
		t.Fatalf("actual applied migration IDs differ: got=%v want=%v", applied, expected)
	}
	if err := db.Conn().QueryRow("SELECT COUNT(*) FROM attention_taste_profiles").Scan(&count); err != nil || count != 0 {
		t.Fatal("upgrade invented a human profile", count, err)
	}
}
