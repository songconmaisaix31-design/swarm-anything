package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"reflect"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/objects"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/sqlite"
	attention "github.com/songconmaisaix31-design/Astrocyte/internal/attention/app"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
	"github.com/songconmaisaix31-design/Astrocyte/migrations"
)

const revision = "644bbe8701ae1b1c30b54f18621c28e03dbf6082"

func main() {
	output := flag.String("output", "", "new fixture output directory")
	flag.Parse()
	if err := generate(*output); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

// 仅在恢复的准确旧源码中运行，输入为该源码的公开 LICENSE。
func generate(output string) error {
	if !filepath.IsAbs(output) {
		return fmt.Errorf("output must be an absolute new directory")
	}
	if err := os.Mkdir(output, 0700); err != nil {
		return err
	}
	ctx := context.Background()
	db, err := sqlite.Open(filepath.Join(output, "state.sqlite"))
	if err != nil {
		return err
	}
	defer db.Close()
	if err := db.RunMigrations(ctx, migrations.FS); err != nil {
		return err
	}
	content, err := os.ReadFile("LICENSE")
	if err != nil {
		return err
	}
	originals, err := objects.New(filepath.Join(output, "objects"))
	if err != nil {
		return err
	}
	digest, err := originals.Publish(ctx, content)
	if err != nil {
		return err
	}
	locator := "https://github.com/songconmaisaix31-design/swarm-anything/blob/" + revision + "/LICENSE"
	materialID := uuid.NewString()
	material := attention.MaterialDetail{
		SchemaVersion: 1,
		Material:      attention.Material{ID: materialID, Version: 1, CurrentRevision: 1, Kind: "paper", Lifecycle: "active", Title: "Public source license"},
		Revisions:     []attention.MaterialRevision{{MaterialID: materialID, Revision: 1, SourceKey: locator, SourceLocator: locator, ContentDigest: digest, ObjectRef: digest}},
		Uses:          []attention.Usage{}, Distillations: []attention.Distillation{},
	}
	repo := sqlite.NewAttentionRepository(db)
	if err := repo.WithTx(ctx, func(tx attention.AttentionTx) error { return tx.SaveMaterial(material, 0) }); err != nil {
		return err
	}
	caller := domain.Caller{ID: "public-legacy-compatibility", Kind: "human"}
	id := uuid.NewString()
	spaces := workspace.NewProjectSpaceService(sqlite.NewProjectSpaceRepository(db), workspace.ProjectSpaceOptions{})
	created, err := spaces.CreateProjectSpace(ctx, caller, workspace.ProjectSpaceCommand{WorkspaceCommandMeta: workspace.WorkspaceCommandMeta{SchemaVersion: 1, RequestID: id, IdempotencyKey: id, ExpectedVersion: 1}, Title: "Public legacy reference compatibility"})
	if err != nil {
		return err
	}
	id = uuid.NewString()
	command := attention.ReferenceMaterialCommand{CommandMeta: attention.CommandMeta{SchemaVersion: 1, RequestID: id, IdempotencyKey: id, ExpectedVersion: 1}, MaterialID: materialID, Revision: 1}
	service := attention.NewAttentionService(repo, nil, nil, attention.ServiceOptions{})
	principal := attention.Principal{ID: caller.ID, Kind: caller.Kind}
	referenced, err := service.ReferenceMaterial(ctx, principal, created.Space.ID, command)
	if err != nil || len(referenced.Space.MaterialRefs) != 1 {
		return fmt.Errorf("actual reference command: %w", err)
	}
	var receiptCount int
	if err := db.Conn().QueryRow("SELECT COUNT(*) FROM attention_receipts").Scan(&receiptCount); err != nil {
		return err
	}
	if err := db.Close(); err != nil {
		return err
	}
	db, err = sqlite.Open(filepath.Join(output, "state.sqlite"))
	if err != nil {
		return err
	}
	defer db.Close()
	service = attention.NewAttentionService(sqlite.NewAttentionRepository(db), nil, nil, attention.ServiceOptions{})
	replayed, err := service.ReferenceMaterial(ctx, principal, created.Space.ID, command)
	if err != nil || !reflect.DeepEqual(referenced, replayed) {
		return fmt.Errorf("original request did not replay after reopening: %w", err)
	}
	var afterCount int
	if err := db.Conn().QueryRow("SELECT COUNT(*) FROM attention_receipts").Scan(&afterCount); err != nil || afterCount != receiptCount {
		return fmt.Errorf("original replay changed receipt count: %w", err)
	}
	var integrity string
	if err := db.Conn().QueryRow("PRAGMA integrity_check").Scan(&integrity); err != nil || integrity != "ok" {
		return fmt.Errorf("fixture integrity: %s %w", integrity, err)
	}
	if _, err := db.Conn().Exec("VACUUM"); err != nil {
		return err
	}
	if err := db.Close(); err != nil {
		return err
	}
	database, err := os.ReadFile(filepath.Join(output, "state.sqlite"))
	if err != nil {
		return err
	}
	sum := sha256.Sum256(database)
	metadata := map[string]any{
		"source_revision": revision, "source_path": "LICENSE", "source_locator": locator,
		"content_sha256": digest, "database_sha256": hex.EncodeToString(sum[:]),
		"material_id": materialID, "space_id": created.Space.ID, "space_version": referenced.Space.Version,
		"caller_id": caller.ID, "reference_request_id": id, "receipt_count": receiptCount,
		"original_reopen_replay": true,
	}
	body, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(output, "source.json"), append(body, '\n'), 0600); err != nil {
		return err
	}
	fmt.Printf("generated actual legacy reference fixture: %d bytes, original reopen replay confirmed\n", len(database))
	return nil
}
