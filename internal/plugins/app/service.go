package app

import (
	"context"
	"errors"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/plugins/domain"
)

type Authorizer interface {
	AuthorizePluginProject(context.Context, domain.Principal, string, string) error
}

type Repository interface {
	WithPluginTransaction(context.Context, func(context.Context) error) error
	LoadPluginConnection(context.Context, string, string) (domain.Connection, error)
	SavePluginConnection(context.Context, domain.Connection, int) error
	SavePluginReference(context.Context, domain.Reference) error
	LoadPluginReference(context.Context, domain.Reference) (domain.Reference, error)
	RecordPluginEvent(context.Context, domain.Event) (domain.RecordedEvent, error)
	LoadPluginEvent(context.Context, string, string, string) (domain.RecordedEvent, error)
}

type Service struct {
	repo Repository
	auth Authorizer
}

func NewService(repo Repository, auth Authorizer) (*Service, error) {
	if repo == nil || auth == nil {
		return nil, errors.New("plugin service requires storage and current project authorization")
	}
	return &Service{repo: repo, auth: auth}, nil
}

func fail(code apierrors.Code, message string) error {
	return &apierrors.ServiceError{Code: code, Message: message, RequiredAction: "inspect_plugin_connection_and_current_project_grant"}
}

func (s *Service) Configure(ctx context.Context, p domain.Principal, c domain.Connection, expected int) error {
	if p.Kind != "human" || p.ID == "" {
		return fail(apierrors.ScopeDenied, "only an authenticated human can configure plugin access")
	}
	if err := c.Validate(); err != nil {
		return fail(apierrors.ValidationFailed, err.Error())
	}
	if expected < 0 || c.Version != expected+1 {
		return fail(apierrors.VersionConflict, "plugin connection version must advance once")
	}
	return s.repo.WithPluginTransaction(ctx, func(tx context.Context) error {
		if err := s.auth.AuthorizePluginProject(tx, p, c.ProjectID, "discover"); err != nil {
			return err
		}
		return s.repo.SavePluginConnection(tx, c, expected)
	})
}

func (s *Service) Connection(ctx context.Context, p domain.Principal, project, plugin string) (result domain.Connection, err error) {
	err = s.repo.WithPluginTransaction(ctx, func(tx context.Context) error {
		if err := s.auth.AuthorizePluginProject(tx, p, project, "observe"); err != nil {
			return err
		}
		var err error
		result, err = s.repo.LoadPluginConnection(tx, project, plugin)
		return err
	})
	return
}

func (s *Service) authorize(ctx context.Context, p domain.Principal, project, plugin, action, scope string) error {
	if err := s.auth.AuthorizePluginProject(ctx, p, project, action); err != nil {
		return err
	}
	c, err := s.repo.LoadPluginConnection(ctx, project, plugin)
	if err != nil {
		return err
	}
	if !c.Allows(scope) {
		return fail(apierrors.ScopeDenied, "plugin connection does not allow the requested reference operation")
	}
	return nil
}

func (s *Service) Remember(ctx context.Context, p domain.Principal, r domain.Reference) error {
	if err := r.Validate(); err != nil {
		return fail(apierrors.ValidationFailed, err.Error())
	}
	return s.repo.WithPluginTransaction(ctx, func(tx context.Context) error {
		if err := s.authorize(tx, p, r.ProjectID, r.PluginID, "read_context", "references.read"); err != nil {
			return err
		}
		return s.repo.SavePluginReference(tx, r)
	})
}

func (s *Service) Reference(ctx context.Context, p domain.Principal, r domain.Reference) (result domain.Reference, err error) {
	if err := r.Validate(); err != nil {
		return result, fail(apierrors.ValidationFailed, err.Error())
	}
	err = s.repo.WithPluginTransaction(ctx, func(tx context.Context) error {
		if err := s.authorize(tx, p, r.ProjectID, r.PluginID, "read_context", "references.read"); err != nil {
			return err
		}
		var err error
		result, err = s.repo.LoadPluginReference(tx, r)
		return err
	})
	return
}

// Record 仅持久化引用事件，不批准提案、不启动 Run，也不证明插件已消费正文。
func (s *Service) Record(ctx context.Context, p domain.Principal, e domain.Event) (result domain.RecordedEvent, err error) {
	if err := e.Validate(); err != nil {
		return result, fail(apierrors.ValidationFailed, err.Error())
	}
	err = s.repo.WithPluginTransaction(ctx, func(tx context.Context) error {
		if err := s.authorize(tx, p, e.ProjectID, e.ObjectRef.PluginID, "observe", "events.record"); err != nil {
			return err
		}
		var err error
		result, err = s.repo.RecordPluginEvent(tx, e)
		return err
	})
	return
}

func (s *Service) Event(ctx context.Context, p domain.Principal, project, plugin, source, id string) (result domain.RecordedEvent, err error) {
	err = s.repo.WithPluginTransaction(ctx, func(tx context.Context) error {
		if err := s.authorize(tx, p, project, plugin, "observe", "events.record"); err != nil {
			return err
		}
		var err error
		result, err = s.repo.LoadPluginEvent(tx, project, source, id)
		if err == nil && result.Event.ObjectRef.PluginID != plugin {
			return fail(apierrors.ScopeDenied, "event belongs to another plugin")
		}
		return err
	})
	return
}
