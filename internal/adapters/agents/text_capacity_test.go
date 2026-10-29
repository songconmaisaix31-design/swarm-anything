package agents

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

func TestSelectedTextFinalPromptUTF8BoundaryBeforeLaunch(t *testing.T) {
	packet := domain.ContextPacket{SchemaVersion: 1, ProjectID: "00000000-0000-0000-0000-000000000000", Mode: "selected_text"}
	overhead := len(packetPrompt(packet, ""))
	if SelectedTextPromptBytes("文") != overhead+3 {
		t.Fatal("wire UTF8 measurement differs from actual envelope")
	}
	for _, size := range []int{128*1024 + 1, 512*1024 - overhead} {
		prompt := strings.Repeat("x", size)
		if err := ValidateSelectedTextPrompt(prompt); err != nil {
			t.Fatalf("%d total bytes: %v", size+overhead, err)
		}
	}
	for _, prompt := range []string{strings.Repeat("x", 512*1024-overhead+1), strings.Repeat("文", (512*1024-overhead)/3+1), "\xff"} {
		// 空 Registry 没有原生适配器，格式错误必须在选择配置之前失败。
		_, err := (&Registry{}).ProcessSelectedText(context.Background(), domain.TextRequest{CLI: "codex", Prompt: prompt})
		serviceErr, ok := err.(*apierrors.ServiceError)
		if !ok || serviceErr.Code != apierrors.ValidationFailed {
			t.Fatalf("oversize reached native selection: %v", err)
		}
	}
	_, err := (&Registry{}).ProcessSelectedText(context.Background(), domain.TextRequest{CLI: "uninstalled", Prompt: strings.Repeat("x", 128*1024+1)})
	if e, ok := err.(*apierrors.ServiceError); !ok || e.Code != apierrors.UnsupportedCapability {
		t.Fatalf("valid expanded prompt rejected before actual registry selection: %v", err)
	}
}

func TestSelectedTextDirectoryStaysUnderControllerOwnedRoot(t *testing.T) {
	stateRoot := filepath.Join(t.TempDir(), "native-sessions")
	root, err := selectedTextRoot(stateRoot)
	if err != nil {
		t.Fatal(err)
	}
	if !inside(filepath.Join(stateRoot, "selected-text"), root) {
		t.Fatal("selected text directory escaped the controller-owned root")
	}
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		t.Fatalf("owned directory unavailable: %v", err)
	}
	if _, err = selectedTextRoot("relative-native-state"); err == nil {
		t.Fatal("relative runtime root was accepted")
	}
	blockedRoot := filepath.Join(t.TempDir(), "not-a-directory")
	if err = os.WriteFile(blockedRoot, []byte("人工创建的目录类型错误输入"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = selectedTextRoot(blockedRoot); err == nil {
		t.Fatal("actual filesystem failure was suppressed")
	}
}

// 拒绝输入是调用者声明，不代表已存在的原生来源或进程。
func TestOwnedTextExecutionRejectsUnattestedIdentity(t *testing.T) {
	registry := NewRegistry(filepath.Join(t.TempDir(), "native-sessions"))
	adapter, err := registry.Adapter("codex")
	if err != nil {
		t.Fatal(err)
	}
	native := adapter.(*Native)
	for _, input := range []struct {
		session domain.NativeSession
		code    apierrors.Code
	}{
		{domain.NativeSession{}, apierrors.DeliveryUnknown},
		{domain.NativeSession{ID: "unattested-id", NativeID: "unattested-native-id", ProjectID: "unattested-project", CLI: "codex", Ownership: "external"}, apierrors.ScopeDenied},
		{domain.NativeSession{ID: "unattested-id", NativeID: "unattested-native-id", ProjectID: "unattested-project", CLI: "claude", Ownership: "owned"}, apierrors.ScopeDenied},
		{domain.NativeSession{ID: "unattested-id", NativeID: "unattested-native-id", ProjectID: "unattested-project", CLI: "codex", Ownership: "owned"}, apierrors.DeliveryUnknown},
	} {
		_, err := native.OwnedRelayExecution(context.Background(), input.session)
		var service *apierrors.ServiceError
		if !errors.As(err, &service) || service.Code != input.code {
			t.Fatalf("unattested ownership accepted: %v", err)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err = native.OwnedRelayExecution(ctx, domain.NativeSession{}); !errors.Is(err, context.Canceled) {
		t.Fatal("actual cancellation was swallowed")
	}
}

func TestSelectedTextActualOwnedSourceWithoutModel(t *testing.T) {
	base := os.Getenv("ASTROCYTE_TEST_OUTPUT_ROOT")
	if base == "" {
		var err error
		base, err = filepath.Abs("../../../.verification")
		if err != nil {
			t.Fatal(err)
		}
	}
	if !filepath.IsAbs(base) {
		t.Fatal("selected-text verification requires an absolute output root")
	}
	if err := os.MkdirAll(base, 0700); err != nil {
		t.Fatal(err)
	}
	stateRoot, err := os.MkdirTemp(base, "selected-text-stop-actual-")
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("actual owned native evidence directory: %s", stateRoot)
	registry := NewRegistry(stateRoot)
	adapter, err := registry.Adapter("codex")
	if err != nil {
		t.Fatal(err)
	}
	native := adapter.(*Native)
	publicRoot, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	id := uuid.NewString()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	session, err := native.Start(ctx, domain.NativeRequest{SessionID: id, Project: domain.LocalProject{ID: id, Root: publicRoot, Settings: domain.ProjectSettings{Revision: 1}}, Session: domain.NativeSession{ID: id, ProjectID: id}, Command: domain.NativeCommand{DeadlineSeconds: 60}, Packet: domain.ContextPacket{SchemaVersion: 1, ProjectID: id, Mode: "selected_context"}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		observation, err := native.Stop(ctx, session)
		if err != nil || !observation.StopConfirmed {
			t.Errorf("actual owned source probe stop unconfirmed: %v", err)
		}
	})
	source, err := native.selectedTextSource(ctx, session, domain.TextRequest{ProjectID: id, OperationID: uuid.NewString(), CLI: "codex"})
	if err != nil {
		t.Fatal(err)
	}
	if source.NativeID != session.NativeID || source.Execution.ProcessID <= 0 || source.Execution.LaunchPolicy != "selected_context_command_tools_disabled_v1" || source.SourceStatus != "owned_metadata_pointer_observed" || source.Execution.EffectiveToolSet != "unknown" {
		t.Fatal("actual owned source identity or launch observation mismatch")
	}
	if err = source.retainOriginal(); err != nil {
		t.Fatal(err)
	}
	if source.SourceSnapshot != "" {
		t.Fatal("a model-free source probe claimed an original window")
	}
	if _, err = os.Stat(source.file); err != nil {
		t.Fatal(err)
	}
	if err := native.finishSelectedText(session, source); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(source.file)
	if err != nil {
		t.Fatal(err)
	}
	var stored selectedTextSource
	if err := json.Unmarshal(raw, &stored); err != nil {
		t.Fatal(err)
	}
	if stored.NativeID != session.NativeID || stored.SessionID != session.ID || stored.Execution.ProcessID != source.Execution.ProcessID || !stored.Execution.ExitConfirmed || stored.Stop == nil || !stored.Stop.Confirmed || stored.Stop.ObservedAt.IsZero() || stored.Stop.Error != "" || stored.Execution.EffectiveToolSet != "unknown" || stored.Phase != "started" || stored.SourceSnapshot != "" {
		t.Fatal("actual owned stop was not preserved independently from model or tool observations")
	}
	blocked := filepath.Join(stateRoot, "blocked-record")
	if err := os.Mkdir(blocked, 0700); err != nil {
		t.Fatal(err)
	}
	source.file = blocked
	if err := native.finishSelectedText(session, source); err == nil {
		t.Fatal("actual final source write failure returned success")
	}
	execution, err := native.OwnedRelayExecution(ctx, session)
	if err != nil || !execution.ExitConfirmed {
		t.Fatal("source write failure obscured the original controller exit", err)
	}
	t.Logf("actual_native_id=%s owned_pid=%d metadata_pointer_observed=true model_turns=0 effective_tool_set=unknown", session.NativeID, source.Execution.ProcessID)
}
