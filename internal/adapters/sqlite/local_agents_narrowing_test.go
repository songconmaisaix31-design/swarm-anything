package sqlite

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/agents"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	attention "github.com/songconmaisaix31-design/Astrocyte/internal/attention/app"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

func TestNativeResumeRetainsCumulativeScopeAndNarrowingDeniesOldContext(t *testing.T) {
	ctx := context.Background()
	db := openAttentionDB(t, filepath.Join(t.TempDir(), "state.sqlite"))
	defer db.Close()
	native := &localNative{}
	service := workspace.NewLocalProjectService(db, &localReferences{}, agents.ProjectFiles{}, localRegistry{native})
	human := domain.Caller{Kind: "human", ID: "human"}
	root := t.TempDir()
	_ = os.WriteFile(filepath.Join(root, "original.txt"), []byte("formerly approved B context"), 0600)
	p, err := service.RegisterProject(ctx, human, domain.RegisterProjectCommand{Name: "scope test", Root: root, SpaceID: "space"})
	if err != nil {
		t.Fatal(err)
	}
	settings := p.Settings
	settings.AllowDirectory = true
	settings.AllowedSubdirs = []string{"."}
	settings.ExternalModelCLI = "codex"
	settings.AllowAgentControl = true
	settings.AllowedActions = []string{"start", "resume", "send", "stop"}
	p, err = service.SetProjectSettings(ctx, human, p.ID, domain.SettingsCommand{ExpectedRevision: p.Settings.Revision, Settings: settings})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.GrantProjectAgent(ctx, human, p.ID, domain.ProjectGrant{AgentID: "scoped", Actions: []string{"observe", "read_context"}}); err != nil {
		t.Fatal(err)
	}
	human.OperationID = uuid.NewString()
	session, err := service.StartNativeSession(ctx, human, p.ID, domain.NativeCommand{CLI: "codex", Context: domain.ContextRequest{Files: []string{"original.txt"}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.StopNativeSession(ctx, human, p.ID, session.ID); err != nil {
		t.Fatal(err)
	}
	human.OperationID = uuid.NewString()
	session, err = service.ResumeNativeSession(ctx, human, p.ID, session.ID, domain.NativeCommand{})
	if err != nil {
		t.Fatal(err)
	}
	if len(session.ContextPacket.Files) != 1 || session.ContextPacket.Files[0].Path != "original.txt" {
		t.Fatal("empty resume forgot prior native context scope")
	}
	settings = p.Settings
	settings.AllowDirectory = false
	settings.AllowedSubdirs = []string{}
	if _, err := service.SetProjectSettings(ctx, human, p.ID, domain.SettingsCommand{ExpectedRevision: p.Settings.Revision, Settings: settings}); err != nil {
		t.Fatal(err)
	}
	human.OperationID = uuid.NewString()
	if _, err := service.SendNativeMessage(ctx, human, p.ID, session.ID, "reexport old context"); err == nil {
		t.Fatal("B revoked after resume but old context exported")
	}
	if _, err := service.ReadNativeContext(ctx, human, p.ID, session.ID); err == nil {
		t.Fatal("B revoked but historical native context still readable")
	}
	if _, err := service.ObserveNativeSession(ctx, human, p.ID, session.ID); err == nil {
		t.Fatal("B revoked but native model event output still readable")
	}
	if _, err := service.ObserveNativeSession(ctx, domain.Caller{Kind: "agent", ID: "scoped", ProjectID: p.ID}, p.ID, session.ID); err == nil {
		t.Fatal("scoped Agent could read old B output after permission narrowing")
	}
	if _, err := service.ResumeNativeSession(ctx, human, p.ID, session.ID, domain.NativeCommand{}); err == nil {
		t.Fatal("B revoked but native full history restored")
	}
	if native.sends != 0 || native.resumes != 1 {
		t.Fatalf("denied operations reached native adapter: sends=%d resumes=%d", native.sends, native.resumes)
	}
}

type blockedNativeObservation struct {
	*localNative
	entered, release chan struct{}
	block            bool
}

func (n *blockedNativeObservation) Observe(ctx context.Context, s domain.NativeSession) (domain.NativeObservation, error) {
	if n.block {
		n.block = false
		close(n.entered)
		<-n.release
	}
	return domain.NativeObservation{Status: "idle", Events: []domain.NativeEvent{}}, nil
}

type observationRegistry struct{ adapter *blockedNativeObservation }

func (r observationRegistry) Adapter(string) (workspace.NativeAdapter, error) { return r.adapter, nil }
func (observationRegistry) List() []string                                    { return []string{"codex"} }

func TestConcurrentObservationCannotEraseAcceptedDeliveryReceipt(t *testing.T) {
	ctx := context.Background()
	db := openAttentionDB(t, filepath.Join(t.TempDir(), "state.sqlite"))
	defer db.Close()
	n := &blockedNativeObservation{localNative: &localNative{}, entered: make(chan struct{}), release: make(chan struct{}), block: true}
	service := workspace.NewLocalProjectService(db, &localReferences{}, agents.ProjectFiles{}, observationRegistry{n})
	human := domain.Caller{Kind: "human", ID: "human"}
	p, err := service.RegisterProject(ctx, human, domain.RegisterProjectCommand{Name: "receipt serialization", Root: t.TempDir(), SpaceID: "space"})
	if err != nil {
		t.Fatal(err)
	}
	settings := p.Settings
	settings.ExternalModelCLI, settings.AllowedActions = "codex", []string{"start", "send", "stop"}
	p, err = service.SetProjectSettings(ctx, human, p.ID, domain.SettingsCommand{ExpectedRevision: p.Settings.Revision, Settings: settings})
	if err != nil {
		t.Fatal(err)
	}
	human.OperationID = uuid.NewString()
	session, err := service.StartNativeSession(ctx, human, p.ID, domain.NativeCommand{CLI: "codex"})
	if err != nil {
		t.Fatal(err)
	}
	receiptOperation := uuid.NewString()
	now := time.Now().UTC()
	session.Operations = map[string]domain.NativeOperation{receiptOperation: {Action: "send", Status: "accepted", CreatedAt: now, FinishedAt: &now}}
	if err := db.SaveSession(ctx, session); err != nil {
		t.Fatal(err)
	}
	observed := make(chan error, 1)
	go func() { _, err := service.ObserveNativeSession(ctx, human, p.ID, session.ID); observed <- err }()
	select {
	case <-n.entered:
	case <-time.After(time.Second):
		t.Fatal("observation did not start")
	}
	stopped := make(chan error, 1)
	go func() {
		_, err := service.StopNativeSession(ctx, human, p.ID, session.ID)
		stopped <- err
	}()
	select {
	case err := <-stopped:
		close(n.release)
		t.Fatalf("native stop raced unsynchronized stale observation: %v", err)
	case <-time.After(30 * time.Millisecond):
	}
	close(n.release)
	if err := <-observed; err != nil {
		t.Fatal(err)
	}
	if err := <-stopped; err != nil {
		t.Fatal(err)
	}
	saved, err := db.LoadSession(ctx, session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if receipt, exists := saved.Operations[receiptOperation]; !exists || receipt.Status != "accepted" {
		t.Fatal("observation erased durable accepted receipt", err)
	}
	if !saved.StopConfirmed {
		t.Fatal("concurrent native stop was not retained")
	}
}

func TestProjectOldRowsNormalizeAndUnknownHistoryTimeIsNull(t *testing.T) {
	ctx := context.Background()
	db := openAttentionDB(t, filepath.Join(t.TempDir(), "state.sqlite"))
	defer db.Close()
	// Write an old-format row directly to verify read normalization, not only
	// the modern registration/save constructor.
	_, err := db.conn.ExecContext(ctx, "INSERT INTO local_agent_projects(id,version,data) VALUES(?,?,?)", "old", 1, `{"id":"old","settings":{"revision":1,"history_roots":null}}`)
	if err != nil {
		t.Fatal(err)
	}
	items, err := db.ListProjects(ctx)
	if err != nil || len(items) != 1 || items[0].Settings.HistoryRoots == nil || items[0].Settings.AllowedActions == nil || items[0].Settings.AllowedSubdirs == nil || items[0].Settings.AllowedTools == nil {
		t.Fatal("old settings remain null", err)
	}
	p, err := db.LoadProject(ctx, "old")
	if err != nil || p.Settings.HistoryRoots == nil {
		t.Fatal("old single-project settings remain null", err)
	}
	data, err := json.Marshal(domain.NativeSession{Ownership: "external_observed"})
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	if err := json.Unmarshal(data, &document); err != nil {
		t.Fatal(err)
	}
	if value, exists := document["updated_at"]; !exists || value != nil {
		t.Fatal("unknown historical time became a fake date")
	}
}

func TestNativeResumeCannotCreateSecondProjectWriter(t *testing.T) {
	ctx := context.Background()
	db := openAttentionDB(t, filepath.Join(t.TempDir(), "state.sqlite"))
	defer db.Close()
	native := &localNative{}
	service := workspace.NewLocalProjectService(db, &localReferences{}, agents.ProjectFiles{}, localRegistry{native})
	human := domain.Caller{Kind: "human", ID: "human"}
	p, err := service.RegisterProject(ctx, human, domain.RegisterProjectCommand{Name: "writer bound", Root: t.TempDir(), SpaceID: "space"})
	if err != nil {
		t.Fatal(err)
	}
	settings := p.Settings
	settings.ExternalModelCLI = "codex"
	settings.AllowedActions = []string{"start", "resume", "stop"}
	p, err = service.SetProjectSettings(ctx, human, p.ID, domain.SettingsCommand{ExpectedRevision: p.Settings.Revision, Settings: settings})
	if err != nil {
		t.Fatal(err)
	}
	human.OperationID = uuid.NewString()
	first, err := service.StartNativeSession(ctx, human, p.ID, domain.NativeCommand{CLI: "codex"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.StopNativeSession(ctx, human, p.ID, first.ID); err != nil {
		t.Fatal(err)
	}
	human.OperationID = uuid.NewString()
	if _, err := service.StartNativeSession(ctx, human, p.ID, domain.NativeCommand{CLI: "codex"}); err != nil {
		t.Fatal(err)
	}
	human.OperationID = uuid.NewString()
	if _, err := service.ResumeNativeSession(ctx, human, p.ID, first.ID, domain.NativeCommand{}); err == nil {
		t.Fatal("resume launched a second project writer")
	}
	if native.resumes != 0 {
		t.Fatal("denied resume reached native adapter")
	}
}

func TestNativeUnavailableLaunchDoesNotLeaveGhostWriter(t *testing.T) {
	// 通过真实缺失的可执行程序触发启动前失败，不启动原生控制器或模型。
	t.Setenv("PATH", "")
	ctx := context.Background()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	directory, err := os.MkdirTemp(filepath.Join(root, ".verification"), "native-prelaunch-actual-")
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("actual owned prelaunch directory: %s", directory)
	db := openAttentionDB(t, filepath.Join(directory, "state.sqlite"))
	registry := agents.NewRegistry(filepath.Join(directory, "native"))
	service := workspace.NewLocalProjectService(db, nil, agents.ProjectFiles{}, registry)
	human := domain.Caller{Kind: "human", ID: uuid.NewString()}
	space, err := attention.NewAttentionService(NewAttentionRepository(db), nil, nil, attention.ServiceOptions{}).CreateProjectSpace(ctx, attention.Principal{Kind: human.Kind, ID: human.ID}, attention.ProjectSpaceCommand{
		CommandMeta: attention.CommandMeta{SchemaVersion: 1, RequestID: uuid.NewString(), IdempotencyKey: uuid.NewString(), ExpectedVersion: 1},
		Title:       "Public project prelaunch failure validation",
	})
	if err != nil {
		t.Fatal(err)
	}
	p, err := service.RegisterProject(ctx, human, domain.RegisterProjectCommand{Name: "Actual public checkout with unavailable native CLI", Root: root, SpaceID: space.Space.ID})
	if err != nil {
		t.Fatal(err)
	}
	settings := p.Settings
	settings.ExternalModelCLI = "codex"
	settings.AllowedActions = []string{"start", "stop"}
	p, err = service.SetProjectSettings(ctx, human, p.ID, domain.SettingsCommand{ExpectedRevision: p.Settings.Revision, Settings: settings})
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		human.OperationID = uuid.NewString()
		session, err := service.StartNativeSession(ctx, human, p.ID, domain.NativeCommand{CLI: "codex"})
		var failure *apierrors.ServiceError
		if !errors.As(err, &failure) || failure.Code != apierrors.ProviderUnavailable {
			t.Fatalf("unavailable launch %d: %v", i, err)
		}
		if !session.StopConfirmed || session.Ownership != "unstarted" || session.PendingOperation != "" || session.Operations[human.OperationID].Status != "failed" {
			t.Fatalf("unstarted failure left ghost ownership: %+v", session)
		}
		stored, err := db.LoadSession(ctx, session.ID)
		if err != nil || stored.NativeID != "" || stored.Ownership != "unstarted" || !stored.StopConfirmed || stored.PendingOperation != "" || stored.Operations[human.OperationID].Status != "failed" {
			t.Fatalf("actual prelaunch failure lacks its durable unstarted receipt: %+v %v", stored, err)
		}
		if _, err := service.StartNativeSession(ctx, human, p.ID, domain.NativeCommand{CLI: "codex"}); err == nil {
			t.Fatal("duplicate failed native start falsely succeeded")
		}
	}
}

func TestProvenUnstartedResumePreservesOwnedOriginalSession(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	root, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	verification := os.Getenv("ASTROCYTE_TEST_OUTPUT_ROOT")
	if verification == "" {
		verification = filepath.Join(root, ".verification")
	}
	if !filepath.IsAbs(verification) {
		t.Fatal("native verification requires an explicit absolute output root")
	}
	if err := os.MkdirAll(verification, 0700); err != nil {
		t.Fatal(err)
	}
	directory, err := os.MkdirTemp(verification, "native-resume-owned-actual-")
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("actual owned resume evidence directory: %s", directory)
	for _, name := range []string{"TEMP", "TMP", "GOTMPDIR"} {
		t.Setenv(name, directory)
	}
	db := openAttentionDB(t, filepath.Join(directory, "state.sqlite"))
	registryRoot := filepath.Join(directory, "native")
	registry := agents.NewRegistry(registryRoot)
	service := workspace.NewLocalProjectService(db, nil, agents.ProjectFiles{}, registry)
	human := domain.Caller{Kind: "human", ID: uuid.NewString()}
	space, err := attention.NewAttentionService(NewAttentionRepository(db), nil, nil, attention.ServiceOptions{}).CreateProjectSpace(ctx, attention.Principal{Kind: human.Kind, ID: human.ID}, attention.ProjectSpaceCommand{
		CommandMeta: attention.CommandMeta{SchemaVersion: 1, RequestID: uuid.NewString(), IdempotencyKey: uuid.NewString(), ExpectedVersion: 1},
		Title:       "Public project original controller resume validation",
	})
	if err != nil {
		t.Fatal(err)
	}
	p, err := service.RegisterProject(ctx, human, domain.RegisterProjectCommand{Name: "Actual public checkout original session", Root: root, SpaceID: space.Space.ID})
	if err != nil {
		t.Fatal(err)
	}
	settings := p.Settings
	settings.ExternalModelCLI, settings.AllowedActions = "codex", []string{"start", "resume", "stop"}
	p, err = service.SetProjectSettings(ctx, human, p.ID, domain.SettingsCommand{ExpectedRevision: p.Settings.Revision, Settings: settings})
	if err != nil {
		t.Fatal(err)
	}
	var session domain.NativeSession
	t.Cleanup(func() {
		if session.ID == "" || session.StopConfirmed {
			return
		}
		cleanup, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		observation, stopErr := service.StopNativeSession(cleanup, human, p.ID, session.ID)
		if stopErr != nil || !observation.StopConfirmed {
			t.Error("actual original controller cleanup did not confirm exit", stopErr)
		}
	})
	// 复用实际空输入探测入口，原生控制器生成身份并实际停止；不发送模型输入。
	human.OperationID = uuid.NewString()
	session, err = service.ProbeNativeCLI(ctx, human, p.ID, "codex")
	if err != nil {
		t.Fatal(err)
	}
	if session.NativeID == "" || session.Ownership != "owned" || !session.StopConfirmed || session.PendingOperation != "" || session.Operations[human.OperationID].Status != "accepted" {
		t.Fatal("actual original controller lacks a settled start and positive stop")
	}
	// 在同一 Registry 已持有真实原控制器后，实际缺失 CLI 才构成启动前失败。
	t.Setenv("PATH", "")
	for i := 0; i < 2; i++ {
		human.OperationID = uuid.NewString()
		result, err := service.ResumeNativeSession(ctx, human, p.ID, session.ID, domain.NativeCommand{})
		var failure *domain.NativePrelaunchFailure
		if !errors.As(err, &failure) {
			t.Fatalf("resume %d did not reach proven unavailable prelaunch: %v", i, err)
		}
		if result.NativeID != session.NativeID || result.Ownership != "owned" || !result.StopConfirmed || result.PendingOperation != "" || result.Operations[human.OperationID].Status != "failed" {
			t.Fatalf("unstarted resume destroyed original durable session: %+v", result)
		}
		stored, err := db.LoadSession(ctx, session.ID)
		if err != nil || stored.NativeID != session.NativeID || stored.Ownership != "owned" || !stored.StopConfirmed || stored.PendingOperation != "" || stored.Operations[human.OperationID].Status != "failed" {
			t.Fatal("actual prelaunch failure changed the original stored identity or receipt", err)
		}
	}
	// 新 Registry 只读取同一真实记录，持久化身份不会生成控制器拥有权。
	coldRegistry := agents.NewRegistry(registryRoot)
	coldService := workspace.NewLocalProjectService(db, nil, agents.ProjectFiles{}, coldRegistry)
	human.OperationID = uuid.NewString()
	result, err := coldService.ResumeNativeSession(ctx, human, p.ID, session.ID, domain.NativeCommand{})
	var unknown *apierrors.ServiceError
	if !errors.As(err, &unknown) || unknown.Code != apierrors.DeliveryUnknown {
		t.Fatal("cold registry did not preserve unknown original controller ownership", err)
	}
	if result.NativeID != session.NativeID || result.Ownership != "owned" || result.Operations[human.OperationID].Status != "unknown" || result.PendingOperation != human.OperationID {
		t.Fatal("cold registry did not retain the actual original identity and unknown receipt")
	}
	observations, err := coldRegistry.SnapshotNative(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range observations {
		if item.Capabilities["start"].Status != "unknown" || item.Startable.Status != "unknown" {
			t.Fatal("cold registry rejection created a native startup observation")
		}
	}
}
