package sqlite_test

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/rolecards"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/sqlite"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	swarmapp "github.com/songconmaisaix31-design/Astrocyte/internal/swarm/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/swarm/domain"
	"github.com/songconmaisaix31-design/Astrocyte/migrations"
)

func TestRoleCardsActualSQLitePersistenceAndVersions(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "roles.sqlite")
	catalog, err := rolecards.New()
	if err != nil {
		t.Fatal(err)
	}
	var db *sqlite.DB
	open := func() *swarmapp.RoleCardService {
		t.Helper()
		db, err = sqlite.Open(path)
		if err != nil {
			t.Fatal(err)
		}
		if err := db.RunMigrations(ctx, migrations.FS); err != nil {
			t.Fatal(err)
		}
		repo, err := sqlite.NewSwarmRepository(db)
		if err != nil {
			t.Fatal(err)
		}
		return swarmapp.NewRoleCardService(catalog, repo)
	}
	service := open()
	t.Cleanup(func() { db.Close() })
	items, err := service.List(ctx)
	if err != nil || len(items) != 6 {
		t.Fatalf("默认角色: %v", err)
	}
	for _, item := range items {
		if item.Version != 1 {
			t.Fatalf("内置版本: %+v", item)
		}
	}
	human := domain.Principal{ID: "local-human", Kind: "human"}
	command := func(role domain.RoleCard, expected int) swarmapp.RoleCardCommand {
		t.Helper()
		data, err := json.Marshal(role)
		if err != nil {
			t.Fatal(err)
		}
		return swarmapp.RoleCardCommand{Meta: domain.Meta{SchemaVersion: 1, RequestID: uuid.NewString(), IdempotencyKey: uuid.NewString(), ExpectedVersion: expected}, Role: data}
	}
	assertCode := func(err error, code apierrors.Code) {
		t.Helper()
		var rule *domain.RuleError
		var serviceError *apierrors.ServiceError
		if errors.As(err, &rule) && rule.Code == string(code) || errors.As(err, &serviceError) && serviceError.Code == code {
			return
		}
		t.Fatalf("预期错误 %s，实际 %v", code, err)
	}
	base, err := catalog.Find("builtin.reviewer")
	if err != nil {
		t.Fatal(err)
	}
	role := base
	role.ID, role.Name = "custom.review", "项目审查者"
	create := command(role, 1)
	created, err := service.Write(ctx, human, "", true, create)
	if err != nil || created.Version != 1 {
		t.Fatalf("创建: %+v %v", created, err)
	}
	create.RequestID = uuid.NewString()
	replay, err := service.Write(ctx, human, "", true, create)
	if err != nil || !reflect.DeepEqual(replay, created) {
		t.Fatalf("幂等结果: %+v %v", replay, err)
	}
	changed := create
	changed.ExpectedVersion = 2
	_, err = service.Write(ctx, human, "", true, changed)
	assertCode(err, apierrors.VersionConflict)
	if !errors.As(err, new(*apierrors.ServiceError)) {
		t.Fatal("幂等正文冲突缺少结构化处理建议")
	}
	_, err = service.Write(ctx, human, "", true, command(role, 1))
	assertCode(err, apierrors.VersionConflict)
	_, err = service.Write(ctx, human, "custom.other", false, command(role, 1))
	assertCode(err, apierrors.ValidationFailed)
	_, err = service.Write(ctx, human, "custom.review", false, command(role, 9))
	assertCode(err, apierrors.VersionConflict)
	unchanged, err := service.Get(ctx, role.ID)
	if err != nil || !reflect.DeepEqual(unchanged, created) {
		t.Fatalf("CAS 失败改变数据: %v", err)
	}
	role.ID = "custom.absent"
	_, err = service.Write(ctx, human, role.ID, false, command(role, 1))
	assertCode(err, apierrors.NotFound)
	_, err = service.Write(ctx, domain.Principal{ID: "development", Kind: "agent"}, "", true, command(role, 1))
	assertCode(err, apierrors.ScopeDenied)
	custom := base
	empty := []string{}
	custom.Tools, custom.Agents = &empty, &empty
	custom.Name = "只读审查者"
	update := command(custom, 1)
	updated, err := service.Write(ctx, human, custom.ID, false, update)
	if err != nil || updated.Version != 2 {
		t.Fatalf("内置覆盖: %+v %v", updated, err)
	}
	currentBase, err := catalog.Find(base.ID)
	if err != nil || !reflect.DeepEqual(base, currentBase) {
		t.Fatal("内置源角色发生变化")
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	service = open()
	read, err := service.Get(ctx, custom.ID)
	if err != nil || !reflect.DeepEqual(read, updated) || read.Role.Tools == nil || len(*read.Role.Tools) != 0 || read.Role.Agents == nil || len(*read.Role.Agents) != 0 {
		t.Fatalf("重开后的空列表或版本变化: %+v %v", read, err)
	}
	replay, err = service.Write(ctx, human, custom.ID, false, update)
	if err != nil || !reflect.DeepEqual(replay, updated) {
		t.Fatalf("重开后的幂等结果: %+v %v", replay, err)
	}
	for _, original := range items {
		if original.Role.ID == base.ID {
			continue
		}
		actual, err := service.Get(ctx, original.Role.ID)
		if err != nil || !reflect.DeepEqual(actual, original) {
			t.Fatalf("其他默认角色变化: %s %v", original.Role.ID, err)
		}
	}
}
