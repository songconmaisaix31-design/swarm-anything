package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

type ProjectSpaceCommand struct {
	WorkspaceCommandMeta
	Title string `json:"title"`
}

type ProjectSpaceResult struct {
	SchemaVersion int                 `json:"schema_version"`
	Space         domain.ProjectSpace `json:"space"`
}

type ProjectSpaces interface {
	ListProjectSpaces(context.Context, domain.Caller) (apierrors.ListResult, error)
	CreateProjectSpace(context.Context, domain.Caller, ProjectSpaceCommand) (ProjectSpaceResult, error)
	GetProjectSpace(context.Context, domain.Caller, string) (ProjectSpaceResult, error)
}

type ProjectSpaceRepository interface {
	WithProjectSpaceTx(context.Context, func(ProjectSpaceTx) error) error
}

type ProjectSpaceTx interface {
	ListProjectSpaces() ([]domain.ProjectSpace, error)
	LoadProjectSpace(string) (domain.ProjectSpace, error)
	SaveProjectSpace(domain.ProjectSpace, int) error
	LoadProjectSpaceReceipt(caller, command, key string) (WorkspaceReceipt, error)
	SaveProjectSpaceReceipt(caller, command, key string, receipt WorkspaceReceipt) error
	AppendProjectSpaceEvent(WorkspaceEvent) error
}

type ProjectSpaceOptions struct{ Clock func() time.Time }

type ProjectSpaceService struct {
	repo  ProjectSpaceRepository
	clock func() time.Time
}

func NewProjectSpaceService(repo ProjectSpaceRepository, options ProjectSpaceOptions) *ProjectSpaceService {
	if options.Clock == nil {
		options.Clock = time.Now
	}
	return &ProjectSpaceService{repo: repo, clock: options.Clock}
}

func projectSpaceError(err error, requestID string) error {
	if err == nil {
		return nil
	}
	var current *apierrors.ServiceError
	if !errors.As(err, &current) {
		current = &apierrors.ServiceError{Code: apierrors.InternalError, Message: "Project space operation could not be completed", RequiredAction: "check_service_and_retry"}
	}
	copy := *current
	copy.RequestID = requestID
	return &copy
}

func (s *ProjectSpaceService) ready(c domain.Caller) error {
	if err := human(c); err != nil {
		return err
	}
	if s.repo == nil {
		return apierrors.NewUnsupported("project_spaces")
	}
	return nil
}

func normalizeProjectSpace(space domain.ProjectSpace) domain.ProjectSpace {
	if space.MaterialRefs == nil {
		space.MaterialRefs = []domain.ProjectSpaceReference{}
	}
	return space
}

func (s *ProjectSpaceService) ListProjectSpaces(ctx context.Context, c domain.Caller) (apierrors.ListResult, error) {
	result := apierrors.EmptyList()
	if err := s.ready(c); err != nil {
		return result, err
	}
	err := s.repo.WithProjectSpaceTx(ctx, func(tx ProjectSpaceTx) error {
		spaces, err := tx.ListProjectSpaces()
		if err != nil {
			return err
		}
		for _, space := range spaces {
			result.Items = append(result.Items, normalizeProjectSpace(space))
		}
		return nil
	})
	return result, projectSpaceError(err, "")
}

func (s *ProjectSpaceService) GetProjectSpace(ctx context.Context, c domain.Caller, id string) (ProjectSpaceResult, error) {
	result := ProjectSpaceResult{SchemaVersion: 1}
	if err := s.ready(c); err != nil {
		return result, err
	}
	err := s.repo.WithProjectSpaceTx(ctx, func(tx ProjectSpaceTx) error {
		var err error
		result.Space, err = tx.LoadProjectSpace(id)
		return err
	})
	result.Space = normalizeProjectSpace(result.Space)
	return result, projectSpaceError(err, "")
}

func (s *ProjectSpaceService) CreateProjectSpace(ctx context.Context, c domain.Caller, command ProjectSpaceCommand) (result ProjectSpaceResult, err error) {
	defer func() { err = projectSpaceError(err, command.RequestID) }()
	if err = s.ready(c); err != nil {
		return result, err
	}
	if command.SchemaVersion != 1 || strings.TrimSpace(command.RequestID) == "" || strings.TrimSpace(command.IdempotencyKey) == "" || command.ExpectedVersion != 1 || strings.TrimSpace(command.Title) == "" {
		return result, projectError(apierrors.ValidationFailed, "complete command metadata, version 1 and a nonempty space title are required")
	}
	input, err := semanticWorkspaceInput(command)
	if err != nil {
		return result, err
	}
	hash := sha256.Sum256(input)
	digest := hex.EncodeToString(hash[:])
	caller := c.Kind + ":" + c.ID
	err = s.repo.WithProjectSpaceTx(ctx, func(tx ProjectSpaceTx) error {
		previous, err := tx.LoadProjectSpaceReceipt(caller, "CreateProjectSpace", command.IdempotencyKey)
		if err == nil {
			if previous.Digest != digest {
				return projectError(apierrors.VersionConflict, "idempotency key was used with different input")
			}
			return json.Unmarshal(previous.Result, &result)
		}
		if !absent(err) {
			return err
		}
		space := domain.ProjectSpace{ID: rand.Text(), Version: 1, Title: strings.TrimSpace(command.Title), MaterialRefs: []domain.ProjectSpaceReference{}, CreatedAt: s.clock()}
		if err = tx.SaveProjectSpace(space, 0); err != nil {
			return err
		}
		payload, err := json.Marshal(map[string]any{"space_id": space.ID})
		if err != nil {
			return err
		}
		// 已存回执与事件身份继续可读，避免改名后相同请求再次创建空间。
		if err = tx.AppendProjectSpaceEvent(WorkspaceEvent{ID: rand.Text(), Type: "attention.project_space_created", AggregateID: space.ID, AggregateVersion: space.Version, OccurredAt: s.clock(), CorrelationID: command.RequestID, CausationID: command.IdempotencyKey, Payload: payload}); err != nil {
			return err
		}
		result = ProjectSpaceResult{SchemaVersion: 1, Space: space}
		body, err := json.Marshal(result)
		if err != nil {
			return err
		}
		return tx.SaveProjectSpaceReceipt(caller, "CreateProjectSpace", command.IdempotencyKey, WorkspaceReceipt{Digest: digest, Result: body})
	})
	return result, err
}
