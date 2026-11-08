package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

type localProjectService struct {
	mu              sync.Mutex
	discoveryGate   chan struct{}
	discoveryRepo   RegisteredProjectRepository
	discoverySource RegisteredProjectSource
	repo            LocalProjectRepository
	refs            ProjectReferences
	files           ProjectFiles
	registry        NativeRegistry
	externalCLI     ExternalCLIRegistry

	nativeMessageMu      sync.RWMutex
	nativeMessageOptions nativeMessageOptions

	repositoryCleanup projectCleanupNotifier
}

func NewLocalProjectService(repo LocalProjectRepository, refs ProjectReferences, files ProjectFiles, registry NativeRegistry) *localProjectService {
	return &localProjectService{repo: repo, refs: refs, files: files, registry: registry, discoveryGate: make(chan struct{}, 1)}
}

// 独立 SWA 使用 Orca Worker；未组装旧会话 Registry 时明确拒绝其专属操作。
func (s *localProjectService) nativeAdapter(id string) (NativeAdapter, error) {
	if s.registry == nil {
		return nil, projectError(apierrors.UnsupportedCapability, "legacy native session control is not assembled; use the SWA Worker entry")
	}
	return s.registry.Adapter(id)
}

func (s *localProjectService) ConfigureExternalCLIRegistry(port ExternalCLIRegistry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if port == nil || s.externalCLI != nil {
		return errors.New("external CLI registry requires one non-nil binding before serving")
	}
	s.externalCLI = port
	return nil
}

func projectError(code apierrors.Code, message string) error {
	return &apierrors.ServiceError{Code: code, Message: message, RequiredAction: "review_project_permissions_and_native_state"}
}
func human(c domain.Caller) error {
	if c.Kind != "human" || c.ID == "" {
		return projectError(apierrors.ScopeDenied, "only an authenticated human can change project permissions")
	}
	return nil
}
func has(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}
func validActions(items []string) bool {
	for _, item := range items {
		if !projectActionKnown(item) {
			return false
		}
	}
	return true
}

func (s *localProjectService) authorize(ctx context.Context, c domain.Caller, id, action string) (domain.LocalProject, error) {
	p, err := s.repo.LoadProject(ctx, id)
	if err != nil {
		return p, err
	}
	if c.Kind == "human" && c.ID != "" {
		return p, nil
	}
	if c.Kind != "agent" || c.ID == "" || c.ProjectID != id {
		return p, projectError(apierrors.ScopeDenied, "Agent identity is outside this project")
	}
	g, err := s.repo.LoadGrant(ctx, id, c.ID)
	if err != nil || g.RevokedAt != nil || (g.ExpiresAt != nil && !g.ExpiresAt.After(time.Now())) {
		return p, projectError(apierrors.ApprovalRevoked, "project Agent grant is absent, expired or revoked")
	}
	if !has(g.Actions, action) {
		return p, projectError(apierrors.ScopeDenied, "Agent grant does not allow this action")
	}
	if has([]string{"start", "resume", "send", "stop"}, action) && (!p.Settings.AllowAgentControl || !has(p.Settings.AllowedActions, action)) {
		return p, projectError(apierrors.ScopeDenied, "Agent project control is disabled or not approved")
	}
	return p, nil
}

func (s *localProjectService) ListProjects(ctx context.Context, c domain.Caller) ([]domain.LocalProject, error) {
	if c.Kind == "agent" {
		p, err := s.authorize(ctx, c, c.ProjectID, "discover")
		if err != nil {
			return nil, err
		}
		return []domain.LocalProject{p}, nil
	}
	if err := human(c); err != nil {
		return nil, err
	}
	return s.repo.ListProjects(ctx)
}
func (s *localProjectService) DiscoverProjects(ctx context.Context, c domain.Caller, root string) ([]domain.ProjectCandidate, error) {
	if err := human(c); err != nil {
		return nil, err
	}
	return s.files.DiscoverProjects(ctx, root)
}
func (s *localProjectService) RegisterProject(ctx context.Context, c domain.Caller, cmd domain.RegisterProjectCommand) (domain.LocalProject, error) {
	var p domain.LocalProject
	if err := human(c); err != nil {
		return p, err
	}
	if strings.TrimSpace(cmd.Name) == "" || cmd.SpaceID == "" || len(cmd.Name) > 200 {
		return p, projectError(apierrors.ValidationFailed, "project name and existing top-level space are required")
	}
	root, err := s.files.CanonicalRoot(cmd.Root)
	if err != nil {
		return p, err
	}
	p = domain.LocalProject{ID: uuid.NewString(), Name: cmd.Name, Root: root, SpaceID: cmd.SpaceID, CreatedAt: time.Now().UTC(), Settings: domain.ProjectSettings{Revision: 1, HistoryRoots: map[string]string{}, AllowedSubdirs: []string{}, AllowedActions: []string{}, AllowedTools: []string{}}}
	err = s.repo.SaveProject(ctx, p, 0)
	return p, err
}
func (s *localProjectService) SetProjectSettings(ctx context.Context, c domain.Caller, id string, cmd domain.SettingsCommand) (domain.LocalProject, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var p domain.LocalProject
	if err := human(c); err != nil {
		return p, err
	}
	p, err := s.repo.LoadProject(ctx, id)
	if err != nil {
		return p, err
	}
	if cmd.ExpectedRevision != p.Settings.Revision {
		return p, projectError(apierrors.VersionConflict, "project settings changed")
	}
	if !validActions(cmd.Settings.AllowedActions) || len(cmd.Settings.AllowedSubdirs) > 32 {
		return p, projectError(apierrors.ValidationFailed, "project action or directory scope is invalid")
	}
	for _, sub := range cmd.Settings.AllowedSubdirs {
		if _, err := s.files.ValidateProjectPath(p.Root, sub); err != nil {
			return p, err
		}
	}
	for cli, root := range cmd.Settings.HistoryRoots {
		if _, err := s.nativeAdapter(cli); err != nil {
			return p, err
		}
		if _, err := s.files.CanonicalRoot(root); err != nil {
			return p, err
		}
	}
	modelCLIs := cmd.Settings.ExternalModelCLIs
	if len(modelCLIs) == 0 && cmd.Settings.ExternalModelCLI != "" {
		modelCLIs = []string{cmd.Settings.ExternalModelCLI}
	}
	if len(modelCLIs) > 0 && (cmd.Settings.ExternalModelCLI == "" || !has(modelCLIs, cmd.Settings.ExternalModelCLI)) {
		return p, projectError(apierrors.ValidationFailed, "the default model CLI must belong to the explicit permitted list")
	}
	seenCLIs := map[string]bool{}
	for _, cli := range modelCLIs {
		if cli == "" || strings.TrimSpace(cli) != cli || seenCLIs[cli] {
			return p, projectError(apierrors.ValidationFailed, "permitted model CLIs must be nonempty unique identifiers")
		}
		seenCLIs[cli] = true
		if s.externalCLI != nil {
			if err := s.externalCLI.ValidateExternalCLI(ctx, cli); err != nil {
				return p, err
			}
		} else {
			if _, err := s.nativeAdapter(cli); err != nil {
				return p, err
			}
		}
	}
	seenTools := map[string]bool{}
	for _, tool := range cmd.Settings.AllowedTools {
		if tool != "swa_delegate" && tool != "project_shell" && tool != "morph_list_tools" && tool != "morph_call_tool" || seenTools[tool] {
			return p, projectError(apierrors.UnsupportedCapability, "project tools must be unique supported capabilities")
		}
		seenTools[tool] = true
	}
	cmd.Settings.Revision = p.Settings.Revision + 1
	if cmd.Settings.HistoryRoots == nil {
		cmd.Settings.HistoryRoots = map[string]string{}
	}
	if cmd.Settings.AllowedSubdirs == nil {
		cmd.Settings.AllowedSubdirs = []string{}
	}
	if cmd.Settings.AllowedActions == nil {
		cmd.Settings.AllowedActions = []string{}
	}
	if cmd.Settings.AllowedTools == nil {
		cmd.Settings.AllowedTools = []string{}
	}
	p.Settings = cmd.Settings
	if err := s.repo.SaveProject(ctx, p, cmd.ExpectedRevision); err != nil {
		return p, err
	}
	if err := s.wakeRepositoryCleanupAfterCommit(ctx); err != nil {
		return p, err
	}
	sessions, err := s.repo.ListSessions(ctx, id)
	if err != nil {
		return p, err
	}
	var stopErrors []error
	for _, session := range sessions {
		if session.Ownership == "owned" && !session.StopConfirmed {
			if err := s.stopOwned(ctx, session); err != nil {
				stopErrors = append(stopErrors, err)
			}
		}
	}
	return p, errors.Join(stopErrors...)
}
func (s *localProjectService) GrantProjectAgent(ctx context.Context, c domain.Caller, id string, g domain.ProjectGrant) (domain.ProjectGrant, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := human(c); err != nil {
		return g, err
	}
	if _, err := s.repo.LoadProject(ctx, id); err != nil {
		return g, err
	}
	if g.AgentID == "" || len(g.AgentID) > 100 || strings.ContainsAny(g.AgentID, ". /\\\r\n") || !validActions(g.Actions) {
		return g, projectError(apierrors.ValidationFailed, "Agent ID or grant actions are invalid")
	}
	g.ProjectID = id
	g.TokenDigest = ""
	g.RevokedAt = nil
	g.ExpiresAt = nil
	return g, s.repo.SaveGrant(ctx, g)
}
func (s *localProjectService) RevokeProjectAgent(ctx context.Context, c domain.Caller, id, agentID string) (domain.ProjectGrant, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var g domain.ProjectGrant
	if err := human(c); err != nil {
		return g, err
	}
	g, err := s.repo.LoadGrant(ctx, id, agentID)
	if err != nil {
		return g, err
	}
	now := time.Now().UTC()
	g.RevokedAt = &now
	g.TokenDigest = ""
	if err := s.repo.SaveGrant(ctx, g); err != nil {
		return g, err
	}
	sessions, err := s.repo.ListSessions(ctx, id)
	if err != nil {
		return g, err
	}
	var stopErrors []error
	for _, session := range sessions {
		if session.Ownership == "owned" && !session.StopConfirmed {
			if err := s.stopOwned(ctx, session); err != nil {
				stopErrors = append(stopErrors, err)
			}
		}
	}
	return g, errors.Join(stopErrors...)
}
func (s *localProjectService) IssueProjectAgentToken(ctx context.Context, c domain.Caller, id, agentID string) (domain.AgentToken, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var result domain.AgentToken
	if err := human(c); err != nil {
		return result, err
	}
	g, err := s.repo.LoadGrant(ctx, id, agentID)
	if err != nil {
		return result, err
	}
	if g.RevokedAt != nil {
		return result, projectError(apierrors.ApprovalRevoked, "grant is revoked")
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return result, err
	}
	token := id + "." + agentID + "." + base64.RawURLEncoding.EncodeToString(secret)
	digest := sha256.Sum256([]byte(token))
	g.TokenDigest = hex.EncodeToString(digest[:])
	expiry := time.Now().UTC().Add(time.Hour)
	g.ExpiresAt = &expiry
	if err := s.repo.SaveGrant(ctx, g); err != nil {
		return result, err
	}
	return domain.AgentToken{Token: token, ProjectID: id, AgentID: agentID, ExpiresAt: expiry}, nil
}
func (s *localProjectService) AuthenticateAgentToken(ctx context.Context, token string) (domain.Caller, error) {
	var c domain.Caller
	parts := strings.Split(token, ".")
	if len(parts) != 3 || len(token) > 512 {
		return c, projectError(apierrors.ScopeDenied, "invalid scoped Agent token")
	}
	g, err := s.repo.LoadGrant(ctx, parts[0], parts[1])
	if err != nil || g.RevokedAt != nil || g.ExpiresAt == nil || !g.ExpiresAt.After(time.Now()) {
		return c, projectError(apierrors.ApprovalRevoked, "scoped Agent token is revoked or expired")
	}
	digest := sha256.Sum256([]byte(token))
	if subtle.ConstantTimeCompare([]byte(hex.EncodeToString(digest[:])), []byte(g.TokenDigest)) != 1 {
		return c, projectError(apierrors.ScopeDenied, "invalid scoped Agent token")
	}
	return domain.Caller{Kind: "agent", ID: g.AgentID, ProjectID: g.ProjectID}, nil
}

func (s *localProjectService) ReadProjectContext(ctx context.Context, c domain.Caller, id string, request domain.ContextRequest) (domain.ContextPacket, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.readProjectContext(ctx, c, id, request)
}

func (s *localProjectService) readProjectContext(ctx context.Context, c domain.Caller, id string, request domain.ContextRequest) (domain.ContextPacket, error) {
	var packet domain.ContextPacket
	p, err := s.authorize(ctx, c, id, "read_context")
	if err != nil {
		return packet, err
	}
	packet = domain.ContextPacket{ID: uuid.NewString(), SchemaVersion: 1, ProjectID: id, SettingsRevision: p.Settings.Revision, Mode: "selected_context", Materials: []domain.ContextMaterial{}, Files: []domain.ContextFile{}, CreatedAt: time.Now().UTC()}
	if len(request.References) > 32 {
		return packet, projectError(apierrors.BudgetExhausted, "too many context references")
	}
	visited := map[domain.FixedReference]bool{}
	remaining := 128 * 1024
	var walk func(domain.FixedReference, int) error
	walk = func(ref domain.FixedReference, depth int) error {
		if visited[ref] {
			return nil
		}
		if ref.MaterialID == "" || ref.Revision < 1 || depth > 4 || len(visited) >= 32 {
			return projectError(apierrors.BudgetExhausted, "reference traversal exceeds fixed context bounds")
		}
		if _, err := s.authorize(ctx, c, id, "read_context"); err != nil {
			return err
		}
		if s.refs == nil {
			return projectError(apierrors.UnsupportedCapability, "project reference reader is not connected")
		}
		material, err := s.refs.ReadSelected(ctx, c, p.SpaceID, ref, depth > 0)
		if err != nil {
			return err
		}
		if material.Reference != ref {
			return projectError(apierrors.ScopeDenied, "reference reader changed the fixed version")
		}
		remaining -= len(material.Text)
		if remaining < 0 {
			return projectError(apierrors.BudgetExhausted, "context output exceeds 128 KiB")
		}
		visited[ref] = true
		material.Expanded = depth > 0
		packet.Materials = append(packet.Materials, material)
		if p.Settings.ExpandReferences && depth == 0 {
			links, err := s.refs.Linked(ctx, c, p.SpaceID, ref)
			if err != nil {
				return err
			}
			for _, link := range links {
				if err := walk(link, depth+1); err != nil {
					return err
				}
			}
		}
		return nil
	}
	for _, ref := range request.References {
		if err := walk(ref, 0); err != nil {
			return packet, err
		}
	}
	packet.Files, err = s.files.ReadProjectFiles(ctx, p, request.Files)
	if err != nil {
		return packet, err
	}
	for _, file := range packet.Files {
		remaining -= len(file.Text)
	}
	if remaining < 0 {
		return packet, projectError(apierrors.BudgetExhausted, "combined context output exceeds 128 KiB")
	}
	_, err = s.authorize(ctx, c, id, "read_context")
	return packet, err
}

func (s *localProjectService) ListNativeSessions(ctx context.Context, c domain.Caller, id string) ([]domain.NativeSession, error) {
	if _, err := s.authorize(ctx, c, id, "observe"); err != nil {
		return nil, err
	}
	return s.repo.ListSessions(ctx, id)
}
func (s *localProjectService) session(ctx context.Context, c domain.Caller, projectID, sessionID, action string) (domain.LocalProject, domain.NativeSession, NativeAdapter, error) {
	p, err := s.authorize(ctx, c, projectID, action)
	if err != nil {
		return p, domain.NativeSession{}, nil, err
	}
	session, err := s.repo.LoadSession(ctx, sessionID)
	if err != nil {
		return p, session, nil, err
	}
	if session.ProjectID != projectID {
		return p, session, nil, projectError(apierrors.ScopeDenied, "native session belongs to another project")
	}
	a, err := s.nativeAdapter(session.CLI)
	return p, session, a, err
}
func (s *localProjectService) nativePermission(ctx context.Context, c domain.Caller, p domain.LocalProject, cli, action string) error {
	if !has(p.Settings.AllowedActions, action) {
		return projectError(apierrors.ApprovalRequired, "native action has not been approved in project settings")
	}
	if !p.Settings.AllowsExternalModelCLI(cli) {
		return projectError(apierrors.ApprovalRequired, "project external model consent does not cover this CLI")
	}
	_, err := s.authorize(ctx, c, p.ID, action)
	return err
}
func (s *localProjectService) checkPacket(ctx context.Context, c domain.Caller, p domain.LocalProject, packet domain.ContextPacket) error {
	if len(packet.Materials) > 0 && s.refs == nil {
		return projectError(apierrors.UnsupportedCapability, "project reference reader is not connected")
	}
	for _, material := range packet.Materials {
		if material.Expanded && !p.Settings.ExpandReferences {
			return projectError(apierrors.ApprovalRevoked, "expanded reference context is revoked")
		}
		if _, err := s.refs.ReadSelected(ctx, c, p.SpaceID, material.Reference, material.Expanded && p.Settings.ExpandReferences); err != nil {
			return err
		}
	}
	for _, file := range packet.Files {
		if !p.Settings.AllowDirectory {
			return projectError(apierrors.ApprovalRevoked, "directory context is revoked")
		}
		if _, err := s.files.ReadProjectFiles(ctx, p, []string{file.Path}); err != nil {
			return err
		}
	}
	return nil
}
func operationID(c domain.Caller, cmd domain.NativeCommand) (string, error) {
	id := c.OperationID
	if id == "" {
		id = cmd.OperationID
	}
	if _, err := uuid.Parse(id); err != nil {
		return "", projectError(apierrors.ValidationFailed, "a verified UUID operation identity is required")
	}
	return id, nil
}
func (s *localProjectService) StartNativeSession(ctx context.Context, c domain.Caller, id string, cmd domain.NativeCommand) (domain.NativeSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var session domain.NativeSession
	p, err := s.authorize(ctx, c, id, "start")
	if err != nil {
		return session, err
	}
	if err := s.nativePermission(ctx, c, p, cmd.CLI, "start"); err != nil {
		return session, err
	}
	op, err := operationID(c, cmd)
	if err != nil {
		return session, err
	}
	if existing, err := s.repo.LoadSession(ctx, op); err == nil {
		if existing.ProjectID != id || existing.CLI != cmd.CLI {
			return session, projectError(apierrors.ScopeDenied, "operation identity belongs to a different native request")
		}
		if receipt, ok := existing.Operations[op]; ok && receipt.Status != "accepted" {
			if receipt.Status == "failed" {
				return existing, projectError(apierrors.VersionConflict, "original native start failed; use a new explicit operation identity")
			}
			return existing, projectError(apierrors.DeliveryUnknown, "original native start remains pending or unknown; do not replay")
		}
		return existing, nil
	} else {
		var service *apierrors.ServiceError
		if !errors.As(err, &service) || service.Code != apierrors.NotFound {
			return session, err
		}
	}
	if cmd.Mode != "" && cmd.Mode != "native" && cmd.Mode != "context_handoff" {
		return session, projectError(apierrors.ValidationFailed, "native mode must be explicit")
	}
	if cmd.Mode == "context_handoff" {
		_, source, _, err := s.session(ctx, c, id, cmd.SourceSessionID, "observe")
		if err != nil {
			return session, err
		}
		if !source.StopConfirmed {
			return session, projectError(apierrors.DeliveryUnknown, "source session stop is unconfirmed")
		}
	}
	packet, err := s.readProjectContext(ctx, c, id, cmd.Context)
	if err != nil {
		return session, err
	}
	adapter, err := s.nativeAdapter(cmd.CLI)
	if err != nil {
		return session, err
	}
	sessions, err := s.repo.ListSessions(ctx, id)
	if err != nil {
		return session, err
	}
	active := 0
	for _, v := range sessions {
		if v.Ownership == "owned" && !v.StopConfirmed {
			active++
		}
	}
	if active >= 1 {
		return session, projectError(apierrors.BudgetExhausted, "project native concurrency limit is one")
	}
	session = domain.NativeSession{ID: op, ProjectID: id, CLI: cmd.CLI, Mode: cmd.Mode, ContextPacket: packet, SourceSessionID: cmd.SourceSessionID, Status: "starting", PendingOperation: op, LastOperationID: op, UpdatedAt: time.Now().UTC()}
	session.Operations = map[string]domain.NativeOperation{op: {Action: "start", Status: "pending", CreatedAt: session.UpdatedAt}}
	if err := s.repo.SaveSession(ctx, session); err != nil {
		return session, err
	}
	result, err := adapter.Start(ctx, domain.NativeRequest{SessionID: session.ID, Project: p, Session: session, Command: cmd, Packet: packet})
	if cmd.Mode == "context_handoff" {
		result.Mode = "context_handoff"
	}
	return s.finishNative(ctx, result, op, err)
}
func (s *localProjectService) finishNative(ctx context.Context, session domain.NativeSession, op string, operationErr error) (domain.NativeSession, error) {
	session.LastOperationID = op
	session.UpdatedAt = time.Now().UTC()
	var prelaunch *domain.NativePrelaunchFailure
	knownUnstarted := operationErr != nil && errors.As(operationErr, &prelaunch) && session.StopConfirmed
	if operationErr != nil {
		if knownUnstarted {
			session.Status = "failed"
			session.PendingOperation = ""
		} else {
			session.Status = "unknown"
			session.PendingOperation = op
		}
	} else {
		session.PendingOperation = ""
	}
	if receipt, ok := session.Operations[op]; ok {
		now := time.Now().UTC()
		receipt.FinishedAt = &now
		if operationErr != nil {
			if knownUnstarted {
				receipt.Status = "failed"
			} else {
				receipt.Status = "unknown"
			}
		} else {
			receipt.Status = "accepted"
		}
		session.Operations[op] = receipt
	}
	if err := s.repo.SaveSession(context.WithoutCancel(ctx), session); err != nil {
		return session, err
	}
	return session, operationErr
}
func (s *localProjectService) ResumeNativeSession(ctx context.Context, c domain.Caller, projectID, sessionID string, cmd domain.NativeCommand) (domain.NativeSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, session, a, err := s.session(ctx, c, projectID, sessionID, "resume")
	if err != nil {
		return session, err
	}
	if session.Ownership != "owned" {
		return session, projectError(apierrors.UnsupportedCapability, "external observed session requires a verified native occupancy handoff")
	}
	if cmd.CLI != "" && cmd.CLI != session.CLI {
		return session, projectError(apierrors.ScopeDenied, "resume cannot switch CLI")
	}
	if err := s.nativePermission(ctx, c, p, session.CLI, "resume"); err != nil {
		return session, err
	}
	op, err := operationID(c, cmd)
	if err != nil {
		return session, err
	}
	if session.LastOperationID == op {
		if receipt, ok := session.Operations[op]; ok && receipt.Status != "accepted" {
			if receipt.Status == "failed" {
				return session, projectError(apierrors.VersionConflict, "original native resume failed; use a new explicit operation identity")
			}
			return session, projectError(apierrors.DeliveryUnknown, "original native resume was not accepted; inspect its receipt")
		}
		return session, nil
	}
	if !session.StopConfirmed || session.NativeID == "" || session.PendingOperation != "" {
		return session, projectError(apierrors.DeliveryUnknown, "native resume requires positively confirmed stop and settled delivery")
	}
	if err := s.checkPacket(ctx, c, p, session.ContextPacket); err != nil {
		return session, err
	}
	sessions, err := s.repo.ListSessions(ctx, projectID)
	if err != nil {
		return session, err
	}
	for _, other := range sessions {
		if other.ID != sessionID && other.Ownership == "owned" && !other.StopConfirmed {
			return session, projectError(apierrors.BudgetExhausted, "project native concurrency limit is one")
		}
	}
	packet, err := s.readProjectContext(ctx, c, projectID, cmd.Context)
	if err != nil {
		return session, err
	}
	packet = mergeNativeContext(session.ContextPacket, packet)
	if len(packet.Materials) > 32 || len(packet.Files) > 32 {
		return session, projectError(apierrors.BudgetExhausted, "cumulative native context scope exceeds bound")
	}
	session.PendingOperation = op
	if session.Operations == nil {
		session.Operations = map[string]domain.NativeOperation{}
	}
	if _, exists := session.Operations[op]; exists {
		return session, projectError(apierrors.DeliveryUnknown, "this native operation was already delivered; inspect its receipt")
	}
	if len(session.Operations) >= 64 {
		return session, projectError(apierrors.BudgetExhausted, "native session command receipt bound reached")
	}
	session.Operations[op] = domain.NativeOperation{Action: "resume", Status: "pending", CreatedAt: time.Now().UTC()}
	if err := s.repo.SaveSession(ctx, session); err != nil {
		return session, err
	}
	result, err := a.Resume(ctx, domain.NativeRequest{SessionID: session.ID, Project: p, Session: session, Command: cmd, Packet: packet})
	result.ContextPacket = packet
	return s.finishNative(ctx, result, op, err)
}
func (s *localProjectService) SendNativeMessage(ctx context.Context, c domain.Caller, projectID, sessionID, message string) (domain.NativeObservation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sendPreparedNativeMessage(ctx, c, projectID, sessionID, message)
}
func (s *localProjectService) stopOwned(ctx context.Context, session domain.NativeSession) error {
	if session.Ownership != "owned" {
		return projectError(apierrors.ScopeDenied, "only a controller-owned native process may be stopped")
	}
	a, err := s.nativeAdapter(session.CLI)
	if err != nil {
		return err
	}
	obs, err := a.Stop(ctx, session)
	session.StopConfirmed = obs.StopConfirmed
	session.Status = obs.Status
	if !obs.StopConfirmed {
		session.Status = "blocked"
	} else {
		session.PendingOperation = ""
	}
	session.UpdatedAt = time.Now().UTC()
	if saveErr := s.repo.SaveSession(context.WithoutCancel(ctx), session); saveErr != nil {
		return saveErr
	}
	if !obs.StopConfirmed && err == nil {
		return projectError(apierrors.DeliveryUnknown, "owned native stop was not positively confirmed")
	}
	return err
}

// Shutdown 在入口关闭 SQLite 前保存自有进程的明确退出结果。
// 异常重启遗留记录继续保持未确认。
func (s *localProjectService) Shutdown(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	projects, err := s.repo.ListProjects(ctx)
	if err != nil {
		return err
	}
	var failures []error
	for _, project := range projects {
		sessions, err := s.repo.ListSessions(ctx, project.ID)
		if err != nil {
			failures = append(failures, err)
			continue
		}
		for _, session := range sessions {
			if session.Ownership == "owned" && !session.StopConfirmed {
				if err := s.stopOwned(ctx, session); err != nil {
					failures = append(failures, err)
				}
			}
		}
	}
	return errors.Join(failures...)
}

func (s *localProjectService) CheckProjectModel(ctx context.Context, c domain.Caller, id, cli string) (domain.LocalProject, error) {
	p, err := s.authorize(ctx, c, id, "read_context")
	if err != nil {
		return p, err
	}
	if !p.Settings.AllowsExternalModelCLI(cli) {
		return p, projectError(apierrors.ApprovalRequired, "project external model consent does not cover the selected CLI")
	}
	if _, err := s.nativeAdapter(cli); err != nil {
		return p, err
	}
	return p, nil
}

// Probe 由人工明确触发，使用空输入启动自有控制器并在返回前停止。
func (s *localProjectService) ProbeNativeCLI(ctx context.Context, c domain.Caller, projectID, cli string) (domain.NativeSession, error) {
	if err := human(c); err != nil {
		return domain.NativeSession{}, err
	}
	started, err := s.StartNativeSession(ctx, c, projectID, domain.NativeCommand{CLI: cli, DeadlineSeconds: 30, Mode: "native"})
	if err != nil {
		return started, err
	}
	_, err = s.StopNativeSession(ctx, c, projectID, started.ID)
	if err != nil {
		return started, err
	}
	return s.repo.LoadSession(ctx, started.ID)
}

func (s *localProjectService) DiscoverNativeSessions(ctx context.Context, c domain.Caller, id, cli string) ([]domain.NativeSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, err := s.authorize(ctx, c, id, "discover")
	if err != nil {
		return nil, err
	}
	a, err := s.nativeAdapter(cli)
	if err != nil {
		return nil, err
	}
	items, err := a.Discover(ctx, p)
	if err != nil {
		return nil, err
	}
	for i := range items {
		items[i].ContextPacket = domain.ContextPacket{SchemaVersion: 1, ID: uuid.NewString(), CreatedAt: time.Now().UTC(), ProjectID: id, SettingsRevision: p.Settings.Revision, Mode: "observed_history", Materials: []domain.ContextMaterial{}, Files: []domain.ContextFile{}}
		if err := s.repo.SaveSession(ctx, items[i]); err != nil {
			return nil, err
		}
	}
	return items, nil
}
func (s *localProjectService) ReadNativeContext(ctx context.Context, c domain.Caller, projectID, sessionID string) ([]domain.NativeEvent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, session, a, err := s.session(ctx, c, projectID, sessionID, "read_context")
	if err != nil {
		return nil, err
	}
	if session.Ownership == "owned" {
		if err := s.checkPacket(ctx, c, p, session.ContextPacket); err != nil {
			return nil, err
		}
	}
	if session.Ownership == "external_observed" && (p.Settings.HistoryRoots[session.CLI] == "" || p.Settings.Revision != session.ContextPacket.SettingsRevision) {
		return nil, projectError(apierrors.ApprovalRevoked, "native history scope changed; rediscover under current permissions")
	}
	return a.ReadContext(ctx, session)
}
func (s *localProjectService) StopNativeSession(ctx context.Context, c domain.Caller, projectID, sessionID string) (domain.NativeObservation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, session, _, err := s.session(ctx, c, projectID, sessionID, "stop")
	if err != nil {
		return domain.NativeObservation{}, err
	}
	err = s.stopOwned(ctx, session)
	saved, loadErr := s.repo.LoadSession(context.WithoutCancel(ctx), sessionID)
	if loadErr != nil {
		return domain.NativeObservation{}, loadErr
	}
	return domain.NativeObservation{Status: saved.Status, StopConfirmed: saved.StopConfirmed, Events: []domain.NativeEvent{}}, err
}
func (s *localProjectService) ObserveNativeSession(ctx context.Context, c domain.Caller, projectID, sessionID string) (domain.NativeObservation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, session, a, err := s.session(ctx, c, projectID, sessionID, "observe")
	if err != nil {
		return domain.NativeObservation{}, err
	}
	if session.Ownership == "owned" {
		if err := s.checkPacket(ctx, c, p, session.ContextPacket); err != nil {
			return domain.NativeObservation{}, err
		}
	}
	obs, err := a.Observe(ctx, session)
	if err != nil {
		return obs, err
	}
	session.Status = obs.Status
	session.StopConfirmed = obs.StopConfirmed
	session.UpdatedAt = time.Now().UTC()
	if saveErr := s.repo.SaveSession(ctx, session); saveErr != nil {
		return obs, saveErr
	}
	return obs, nil
}
