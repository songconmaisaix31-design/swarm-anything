package swastore

import (
	"context"
	"errors"
	"reflect"
	"testing"

	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
	migrations "github.com/songconmaisaix31-design/Astrocyte/migrations/swa"
)

// 原件由保存点真实服务生成；当前消费者不重建旧产品，也不手写资料行。
func TestLegacyMaterialReferenceAndReceiptSurviveStandaloneMigration(t *testing.T) {
	original, _ := readLegacyFixture(t)
	db := openStore(t, true)
	ctx := context.Background()
	snapshot := func() map[string][]string {
		result := map[string][]string{}
		for _, table := range []string{"attention_materials", "attention_material_revisions", "attention_project_spaces", "attention_receipts", "attention_outbox", "local_agent_projects", "local_agent_grants"} {
			rows, err := db.Conn().Query("SELECT * FROM " + table + " ORDER BY 1,2")
			if err != nil {
				t.Fatal(err)
			}
			columns, err := rows.Columns()
			if err != nil {
				t.Fatal(err)
			}
			for rows.Next() {
				values := make([]string, len(columns))
				destinations := make([]any, len(columns))
				for i := range values {
					destinations[i] = &values[i]
				}
				if err := rows.Scan(destinations...); err != nil {
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
	var digest string
	if err := db.Conn().QueryRow("SELECT content_digest FROM attention_material_revisions WHERE material_id=? AND revision=1", original.MaterialID).Scan(&digest); err != nil || digest != original.ContentSHA256 {
		t.Fatal("actual original material content differs", err)
	}
	var count int
	if err := db.Conn().QueryRow("SELECT COUNT(*) FROM attention_receipts").Scan(&count); err != nil || count != original.ReceiptCount {
		t.Fatal("original service receipts are absent", err)
	}
	if err := db.Conn().QueryRow("SELECT COUNT(*) FROM attention_receipts WHERE key=?", original.ReferenceRequestID).Scan(&count); err != nil || count != 1 {
		t.Fatal("original reference request receipt is absent", err)
	}
	if err := db.RunMigrations(ctx, migrations.FS); err != nil {
		t.Fatal(err)
	}
	if after := snapshot(); !reflect.DeepEqual(before, after) {
		t.Fatal("standalone migration changed original material, locator, reference or receipt bytes")
	}
	caller := domain.Caller{ID: original.CallerID, Kind: "human"}
	service := workspace.NewProjectSpaceService(NewProjectSpaceRepository(db), workspace.ProjectSpaceOptions{})
	read, err := service.GetProjectSpace(ctx, caller, original.SpaceID)
	if err != nil || read.Space.Version != original.SpaceVersion || len(read.Space.MaterialRefs) != 1 || read.Space.MaterialRefs[0].MaterialID != original.MaterialID || read.Space.MaterialRefs[0].Locator != original.SourceLocator {
		t.Fatal("current actual space consumer lost the original reference", err)
	}
	if err := db.RunMigrations(ctx, migrations.FS); err != nil {
		t.Fatal(err)
	}
	if after := snapshot(); !reflect.DeepEqual(before, after) {
		t.Fatal("current read or repeated migration changed the original rows")
	}
}
