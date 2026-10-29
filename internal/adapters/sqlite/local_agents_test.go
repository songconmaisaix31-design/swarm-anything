package sqlite

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/agents"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

type localReferences struct {
	denied  bool
	calls   int
	agentID string
}

func (r *localReferences) ReadSelected(ctx context.Context, c domain.Caller, space string, ref domain.FixedReference, expanded bool) (domain.ContextMaterial, error) {
	r.calls++
	r.agentID = c.ID
	if r.denied || (ref.MaterialID != "fixed" && !(expanded && ref.MaterialID == "linked")) {
		return domain.ContextMaterial{}, &apierrors.ServiceError{Code: apierrors.ScopeDenied}
	}
	return domain.ContextMaterial{Reference: ref, Text: "fixed original selected body"}, nil
}
func (r *localReferences) Linked(ctx context.Context, c domain.Caller, space string, ref domain.FixedReference) ([]domain.FixedReference, error) {
	return []domain.FixedReference{{MaterialID: "linked", Revision: 2}, {MaterialID: "fixed", Revision: 1}}, nil
}

type localNative struct {
	starts, sends, resumes, stops int
	failSend, failStop            bool
}

func (*localNative) ID() string      { return "codex" }
func (*localNative) Version() string { return "offline-protocol-fixture" }
func (*localNative) Capabilities() map[string]domain.CapabilityObservation {
	return domain.UnknownNativeCapabilities()
}
func (*localNative) Discover(context.Context, domain.LocalProject) ([]domain.NativeSession, error) {
	return nil, nil
}
func (*localNative) ReadContext(context.Context, domain.NativeSession) ([]domain.NativeEvent, error) {
	return nil, nil
}
func (n *localNative) Start(ctx context.Context, r domain.NativeRequest) (domain.NativeSession, error) {
	n.starts++
	s := r.Session
	s.NativeID = "original-native"
	s.Ownership = "owned"
	s.ContextPacket = r.Packet
	s.Status = "idle"
	return s, nil
}
func (n *localNative) Resume(ctx context.Context, r domain.NativeRequest) (domain.NativeSession, error) {
	n.resumes++
	s := r.Session
	s.StopConfirmed = false
	s.Status = "idle"
	s.ContextPacket = r.Packet
	return s, nil
}
func (n *localNative) Send(context.Context, domain.NativeSession, string) (domain.NativeObservation, error) {
	n.sends++
	if n.failSend {
		return domain.NativeObservation{Status: "unknown"}, &apierrors.ServiceError{Code: apierrors.DeliveryUnknown}
	}
	return domain.NativeObservation{Status: "completed"}, nil
}
func (n *localNative) Stop(context.Context, domain.NativeSession) (domain.NativeObservation, error) {
	n.stops++
	if n.failStop {
		return domain.NativeObservation{Status: "blocked"}, &apierrors.ServiceError{Code: apierrors.DeliveryUnknown}
	}
	return domain.NativeObservation{Status: "stopped", StopConfirmed: true}, nil
}
func (*localNative) Observe(context.Context, domain.NativeSession) (domain.NativeObservation, error) {
	return domain.NativeObservation{Status: "idle"}, nil
}

type localRegistry struct{ n *localNative }

func (r localRegistry) Adapter(cli string) (workspace.NativeAdapter, error) {
	if cli != "codex" {
		return nil, &apierrors.ServiceError{Code: apierrors.UnsupportedCapability}
	}
	return r.n, nil
}
func (localRegistry) List() []string { return []string{"codex"} }

func TestLocalProjectPermissionsTokensAndNativeReceiptsSurviveSQLiteRestart(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "state.sqlite")
	db := openAttentionDB(t, dbPath)
	refs := &localReferences{}
	native := &localNative{}
	registry := localRegistry{native}
	service := workspace.NewLocalProjectService(db, refs, agents.ProjectFiles{}, registry)
	human := domain.Caller{Kind: "human", ID: "browser-human"}
	root := t.TempDir()
	_ = os.WriteFile(filepath.Join(root, "allowed.txt"), []byte("bounded directory"), 0600)
	project, err := service.RegisterProject(ctx, human, domain.RegisterProjectCommand{Name: "temporary test", Root: root, SpaceID: "top-space"})
	if err != nil {
		t.Fatal(err)
	}
	if project.Settings.AllowDirectory || project.Settings.ExpandReferences || project.Settings.ExternalModelCLI != "" {
		t.Fatal("registration widened A default")
	}
	request := domain.ContextRequest{References: []domain.FixedReference{{MaterialID: "fixed", Revision: 1}}}
	packet, err := service.ReadProjectContext(ctx, human, project.ID, request)
	if err != nil || len(packet.Materials) != 1 {
		t.Fatalf("A scoped read: %+v %v", packet, err)
	}
	if _, err := service.ReadProjectContext(ctx, human, project.ID, domain.ContextRequest{Files: []string{"allowed.txt"}}); err == nil {
		t.Fatal("B default not denied")
	}
	if _, err := service.StartNativeSession(ctx, domain.Caller{Kind: "human", ID: human.ID, OperationID: uuid.NewString()}, project.ID, domain.NativeCommand{CLI: "codex", Context: request}); err == nil {
		t.Fatal("missing model consent allowed native start")
	}
	settings := project.Settings
	settings.AllowDirectory = true
	settings.AllowedSubdirs = []string{"."}
	settings.ExpandReferences = true
	settings.ExternalModelCLI = "codex"
	settings.AllowedActions = []string{"start", "resume", "send", "stop", "observe"}
	settings.AllowAgentControl = true
	project, err = service.SetProjectSettings(ctx, human, project.ID, domain.SettingsCommand{ExpectedRevision: 1, Settings: settings})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.SetProjectSettings(ctx, human, project.ID, domain.SettingsCommand{ExpectedRevision: 1, Settings: settings}); err == nil {
		t.Fatal("stale setting writer accepted")
	}
	packet, err = service.ReadProjectContext(ctx, human, project.ID, request)
	if err != nil || len(packet.Materials) != 2 || !packet.Materials[1].Expanded {
		t.Fatalf("C one-hop cycle-safe expansion: %+v %v", packet, err)
	}
	grant, err := service.GrantProjectAgent(ctx, human, project.ID, domain.ProjectGrant{AgentID: "application-agent", Actions: []string{"read_context", "discover", "start", "send", "stop", "observe", "resume"}})
	if err != nil {
		t.Fatal(err)
	}
	token, err := service.IssueProjectAgentToken(ctx, human, project.ID, grant.AgentID)
	if err != nil {
		t.Fatal(err)
	}
	agent, err := service.AuthenticateAgentToken(ctx, token.Token)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.SetProjectSettings(ctx, agent, project.ID, domain.SettingsCommand{ExpectedRevision: project.Settings.Revision, Settings: settings}); err == nil {
		t.Fatal("Agent self-approved settings")
	}
	if _, err := service.GrantProjectAgent(ctx, agent, project.ID, grant); err == nil {
		t.Fatal("Agent self-issued grant")
	}
	if _, err := service.IssueProjectAgentToken(ctx, agent, project.ID, grant.AgentID); err == nil {
		t.Fatal("Agent minted human authority")
	}
	if _, err := service.ReadProjectContext(ctx, agent, project.ID, request); err != nil || refs.agentID != agent.ID {
		t.Fatal("actual Agent identity not propagated")
	}
	other, err := service.RegisterProject(ctx, human, domain.RegisterProjectCommand{Name: "other", Root: t.TempDir(), SpaceID: "other-space"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.ReadProjectContext(ctx, agent, other.ID, request); err == nil {
		t.Fatal("cross-project read accepted")
	}
	agent.OperationID = uuid.NewString()
	session, err := service.StartNativeSession(ctx, agent, project.ID, domain.NativeCommand{CLI: "codex", Context: request})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.StartNativeSession(ctx, agent, project.ID, domain.NativeCommand{CLI: "codex", Context: request}); err != nil || native.starts != 1 {
		t.Fatal("duplicate start invoked native twice")
	}
	var stored string
	if err := db.Conn().QueryRow("SELECT data FROM local_agent_sessions WHERE id=?", session.ID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(stored, "fixed original selected body") {
		t.Fatal("SQLite native session duplicated original material body")
	}
	if _, err := service.ObserveNativeSession(ctx, agent, other.ID, session.ID); err == nil {
		t.Fatal("cross-project native session accepted")
	}
	agent.OperationID = uuid.NewString()
	if _, err := service.SendNativeMessage(ctx, agent, project.ID, session.ID, "first delivery"); err == nil {
		t.Fatal("native send without the actual native message composition was accepted")
	} else {
		var refused *apierrors.ServiceError
		if !errors.As(err, &refused) || refused.Code != apierrors.UnsupportedCapability {
			t.Fatal("native send refusal did not identify the missing native message composition", err)
		}
	}
	if native.sends != 0 {
		t.Fatal("refused native send reached the native adapter")
	}
	native.failStop = true
	if obs, err := service.StopNativeSession(ctx, agent, project.ID, session.ID); err == nil || obs.StopConfirmed {
		t.Fatal("unverified stop falsely confirmed")
	}
	agent.OperationID = uuid.NewString()
	if _, err := service.ResumeNativeSession(ctx, agent, project.ID, session.ID, domain.NativeCommand{Context: request}); err == nil || native.resumes != 0 {
		t.Fatal("unverified stop allowed resume")
	}
	native.failStop = false
	if _, err := service.StopNativeSession(ctx, agent, project.ID, session.ID); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	db = openAttentionDB(t, dbPath)
	defer db.Close()
	service = workspace.NewLocalProjectService(db, refs, agents.ProjectFiles{}, registry)
	if _, err := service.AuthenticateAgentToken(ctx, token.Token); err != nil {
		t.Fatal("scoped token did not survive actual SQLite reopen")
	}
	saved, err := db.LoadSession(ctx, session.ID)
	if err != nil || !saved.StopConfirmed || saved.NativeID != session.NativeID {
		t.Fatalf("native stop receipt restart %+v %v", saved, err)
	}
	agent.OperationID = uuid.NewString()
	if _, err := service.ResumeNativeSession(ctx, agent, project.ID, session.ID, domain.NativeCommand{Context: request}); err != nil || native.resumes != 1 {
		t.Fatalf("confirmed native resume: %v", err)
	}
	refs.denied = true
	if _, err := service.ReadProjectContext(ctx, agent, project.ID, request); err == nil {
		t.Fatal("reference revocation did not stop native context read")
	}
	if _, err := service.RevokeProjectAgent(ctx, human, project.ID, agent.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.AuthenticateAgentToken(ctx, token.Token); err == nil {
		t.Fatal("revoked scoped token still authenticates")
	}
	data, _ := json.Marshal(grant)
	if strings.Contains(string(data), "TokenDigest") || strings.Contains(string(data), "private_token_digest") {
		t.Fatal("grant API leaked private token digest")
	}
	if _, err := service.ReadProjectContext(ctx, agent, project.ID, request); err == nil {
		t.Fatal("revoked Agent identity still reads")
	}
	var serviceErr *apierrors.ServiceError
	_, err = service.ReadProjectContext(ctx, agent, project.ID, request)
	if !errors.As(err, &serviceErr) || serviceErr.Code != apierrors.ApprovalRevoked {
		t.Fatalf("wrong revoked outcome %v", err)
	}
}
