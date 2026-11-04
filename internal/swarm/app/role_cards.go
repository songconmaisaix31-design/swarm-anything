package app

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/swarm/domain"
)

type CardCatalog interface {
	List() []domain.RoleCard
	ParseRole([]byte) (domain.RoleCard, error)
}

type RoleCardRecord struct {
	Role    domain.RoleCard `json:"role"`
	Version int             `json:"version"`
}

type RoleCardTransaction interface {
	LoadRoleCard(string) (RoleCardRecord, bool, error)
	SaveRoleCard(RoleCardRecord, int) error
	Receipt(string, string, string) (Receipt, bool, error)
	SaveReceipt(string, string, string, Receipt) error
}

type RoleCardStore interface {
	ListRoleCards(context.Context) ([]RoleCardRecord, error)
	LoadRoleCard(context.Context, string) (RoleCardRecord, bool, error)
	WithinRoleCards(context.Context, func(RoleCardTransaction) error) error
}

type RoleCardCommand struct {
	domain.Meta
	Role json.RawMessage `json:"role"`
}

type RoleCardService struct {
	catalog CardCatalog
	store   RoleCardStore
	builtin map[string]domain.RoleCard
}

func NewRoleCardService(catalog CardCatalog, store RoleCardStore) *RoleCardService {
	builtin := make(map[string]domain.RoleCard)
	for _, role := range catalog.List() {
		builtin[role.ID] = role
	}
	return &RoleCardService{catalog: catalog, store: store, builtin: builtin}
}

func (s *RoleCardService) List(ctx context.Context) ([]RoleCardRecord, error) {
	records, err := s.store.ListRoleCards(ctx)
	if err != nil {
		return nil, err
	}
	merged := make(map[string]RoleCardRecord)
	for _, role := range s.builtin {
		merged[role.ID] = RoleCardRecord{Role: role, Version: 1}
	}
	for _, record := range records {
		merged[record.Role.ID] = record
	}
	items := make([]RoleCardRecord, 0, len(merged))
	for _, record := range merged {
		items = append(items, record)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Role.ID < items[j].Role.ID })
	return items, nil
}

func (s *RoleCardService) Get(ctx context.Context, id string) (RoleCardRecord, error) {
	record, found, err := s.store.LoadRoleCard(ctx, id)
	if err != nil || found {
		return record, err
	}
	role, found := s.builtin[id]
	if !found {
		return record, apierrors.NewNotFound("role", id)
	}
	return RoleCardRecord{Role: role, Version: 1}, nil
}

func (s *RoleCardService) Write(ctx context.Context, p domain.Principal, id string, create bool, command RoleCardCommand) (RoleCardRecord, error) {
	var result RoleCardRecord
	if err := validateMeta(p, command.Meta); err != nil {
		return result, err
	}
	if err := human(p); err != nil {
		return result, err
	}
	if command.ExpectedVersion < 1 {
		return result, domain.Failure(apierrors.ValidationFailed, "角色 expected_version 必须为正整数")
	}
	role, err := s.catalog.ParseRole(command.Role)
	if err != nil {
		return result, domain.Failure(apierrors.ValidationFailed, err.Error())
	}
	if !create && id != role.ID {
		return result, domain.Failure(apierrors.ValidationFailed, "URL 角色 ID 必须与正文相同")
	}
	commandType := "role.update"
	if create {
		commandType = "role.create"
	}
	d, err := digest(struct {
		ID              string
		Role            domain.RoleCard
		ExpectedVersion int
	}{id, role, command.ExpectedVersion})
	if err != nil {
		return result, err
	}
	err = s.store.WithinRoleCards(ctx, func(tx RoleCardTransaction) error {
		receipt, found, err := tx.Receipt(actor(p), commandType, command.IdempotencyKey)
		if err != nil {
			return err
		}
		if found {
			if receipt.Digest != d {
				return &apierrors.ServiceError{Code: apierrors.VersionConflict, Message: "幂等键已用于其他角色正文", RequiredAction: "use_new_command_identity"}
			}
			return json.Unmarshal(receipt.Result, &result)
		}
		current, stored, err := tx.LoadRoleCard(role.ID)
		if err != nil {
			return err
		}
		storageVersion := current.Version
		exists := stored
		if !stored {
			builtin, found := s.builtin[role.ID]
			if found {
				current, exists = RoleCardRecord{Role: builtin, Version: 1}, true
			}
		}
		if create {
			if exists {
				return domain.Failure(apierrors.VersionConflict, "角色 ID 已存在")
			}
			if command.ExpectedVersion != 1 {
				return domain.Failure(apierrors.ValidationFailed, "新建角色的 expected_version 必须为1")
			}
			result = RoleCardRecord{Role: role, Version: 1}
		} else {
			if !exists {
				return apierrors.NewNotFound("role", role.ID)
			}
			if current.Version != command.ExpectedVersion {
				return domain.Failure(apierrors.VersionConflict, fmt.Sprintf("角色当前版本为%d，提交版本为%d", current.Version, command.ExpectedVersion))
			}
			result = RoleCardRecord{Role: role, Version: current.Version + 1}
		}
		if err := tx.SaveRoleCard(result, storageVersion); err != nil {
			return err
		}
		encoded, err := json.Marshal(result)
		if err != nil {
			return err
		}
		return tx.SaveReceipt(actor(p), commandType, command.IdempotencyKey, Receipt{Digest: d, Result: encoded})
	})
	return result, err
}
