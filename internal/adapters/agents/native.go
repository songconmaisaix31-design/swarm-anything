package agents

import (
	"context"
	"errors"
	"fmt"
	"github.com/google/uuid"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

// nativeSnapshotter is the registry-internal observation surface shared by the
// stdio and HTTP session drivers so SnapshotNative renders them uniformly.
type nativeSnapshotter interface {
	app.NativeAdapter
	snapshot() domain.LocalAgent
}

type Registry struct {
	adapters map[string]app.NativeAdapter
}

// NewRegistry registers protocol implementations, not inferred CLI readiness.
// stateRoot is controller-owned durable native session storage, not a user
// transcript search root or an arbitrarily supplied HTTP directory.
func NewRegistry(stateRoot string) *Registry {
	r := &Registry{adapters: map[string]app.NativeAdapter{}}
	slots := make(chan struct{}, 4)
	for _, id := range []string{"codex", "pi", "claude"} {
		r.adapters[id] = &Native{id: id, stateRoot: stateRoot, slots: slots, processes: map[string]*nativeProcess{}, capabilities: domain.UnknownNativeCapabilities()}
	}
	r.adapters["opencode"] = newOpencodeNative(stateRoot, slots)
	return r
}

func (r *Registry) Adapter(id string) (app.NativeAdapter, error) {
	adapter, ok := r.adapters[id]
	if !ok {
		return nil, nativeError(apierrors.UnsupportedCapability, "selected CLI has no verified native adapter")
	}
	return adapter, nil
}
func (r *Registry) List() []string { return []string{"codex", "pi", "claude", "opencode"} }

// Cached native observations only. Installation belongs to the PATH inventory.
func (r *Registry) SnapshotNative(ctx context.Context) ([]domain.LocalAgent, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	items := []domain.LocalAgent{}
	for _, cli := range r.List() {
		if snapshotter, ok := r.adapters[cli].(nativeSnapshotter); ok {
			items = append(items, snapshotter.snapshot())
		}
	}
	return items, nil
}

// snapshot renders the registry observation for the stdio session driver.
func (n *Native) snapshot() domain.LocalAgent {
	caps := n.Capabilities()
	item := domain.LocalAgent{ID: n.id, NativeAdapterRegistered: true, Capabilities: caps, Configured: domain.Observation{Status: "unknown", Reason: "native_configuration_not_observed"}, Startable: domain.Observation{Status: "unknown", Reason: "native_start_not_observed"}}
	n.mu.Lock()
	if n.version != "" {
		v := n.version
		item.Version = &v
	}
	if n.configID != "" && time.Since(n.configAt) <= 5*time.Minute {
		checked := n.configAt.UTC()
		item.Configured = domain.Observation{Status: "available", Reason: "native_current_model_configuration_observed_authentication_not_proven", CheckedAt: &checked}
	}
	n.mu.Unlock()
	if caps["start"].Status == "supported" {
		item.Startable = domain.Observation{Status: "available", Reason: "native_protocol_session_start_observed_not_model_readiness", CheckedAt: caps["start"].CheckedAt}
	}
	return item
}

type Native struct {
	mu              sync.Mutex
	startMu         sync.Mutex
	completionMu    sync.Mutex
	id, stateRoot   string
	processes       map[string]*nativeProcess
	capabilities    map[string]domain.CapabilityObservation
	version         string
	configID        string
	configAt        time.Time
	slots           chan struct{}
	relayCaptures   map[string]*relayNativeCapture
	relayInputGuard RelayBeforeFirstInput
}

func (n *Native) ID() string { return n.id }
func (n *Native) Version() string {
	n.mu.Lock()
	defer n.mu.Unlock()
	if n.version == "" {
		return "native_version_not_observed"
	}
	return n.version
}
func (n *Native) Capabilities() map[string]domain.CapabilityObservation {
	n.mu.Lock()
	defer n.mu.Unlock()
	result := map[string]domain.CapabilityObservation{}
	for k, v := range n.capabilities {
		result[k] = v
	}
	return result
}
func (n *Native) observed(capability string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	now := time.Now().UTC()
	n.capabilities[capability] = domain.CapabilityObservation{Status: "supported", Reason: "owned_native_protocol_succeeded", CheckedAt: &now}
}

func (n *Native) Discover(ctx context.Context, p domain.LocalProject) ([]domain.NativeSession, error) {
	// Protocol discovery here is restricted to sessions owned by this controller;
	// global CLI thread/list would read personal history without registered roots.
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	items, err := discoverHistory(ctx, n.id, p)
	if err == nil {
		n.observed("discover")
	}
	return items, err
}

func (n *Native) get(s domain.NativeSession) (*nativeProcess, error) {
	n.mu.Lock()
	p, ok := n.processes[s.ID]
	n.mu.Unlock()
	if !ok {
		return nil, nativeError(apierrors.DeliveryUnknown, "native process ownership is not established in this service instance")
	}
	p.mu.Lock()
	identityMatches := p.nativeID == s.NativeID
	p.mu.Unlock()
	if !identityMatches {
		return nil, nativeError(apierrors.DeliveryUnknown, "native process ownership is not established in this service instance")
	}
	return p, nil
}

func (n *Native) processConfiguration(p *nativeProcess) string {
	p.mu.Lock()
	model, provider := p.model, p.provider
	p.mu.Unlock()
	if model == "" || provider == "" {
		return ""
	}
	return fmt.Sprintf("cli:%s;version:%s;model:%s;provider:%s;policy:selected-text-tools-disabled-v1", n.id, n.Version(), model, provider)
}

func (n *Native) refreshConfiguration(p *nativeProcess) {
	if config := n.processConfiguration(p); config != "" {
		p.mu.Lock()
		observedAt := p.modelObservedAt
		p.mu.Unlock()
		n.mu.Lock()
		n.configID, n.configAt = config, observedAt
		n.mu.Unlock()
	}
}

func (n *Native) ReadContext(ctx context.Context, s domain.NativeSession) ([]domain.NativeEvent, error) {
	if s.Ownership == "external_observed" {
		events, err := readHistory(ctx, s)
		if err == nil {
			n.observed("read_context")
		}
		return events, err
	}
	p, err := n.get(s)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	events, err := n.readOwnedContext(ctx, p, s)
	if err == nil {
		n.observed("read_context")
	}
	return events, err
}

var codexDisabledFeatures = []string{"shell_tool", "unified_exec", "plugins", "apps", "browser_use", "browser_use_external", "browser_use_full_cdp_access", "computer_use", "view_image", "image_generation", "multi_agent", "multi_agent_v2", "memories", "hooks", "code_mode", "code_mode_host", "skill_search", "tool_suggest", "workspace_dependencies", "realtime_conversation", "remote_plugin", "remote_models", "in_app_browser", "in_app_local_automation", "sleep_tool"}

func (n *Native) launch(ctx context.Context, r domain.NativeRequest, resume bool) (*nativeProcess, error) {
	probeCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	probe, err := installedCommand(n.id, []string{"--version"})
	if err != nil {
		return nil, err
	}
	probeOutput := &boundedOutput{}
	probe.Stdout = probeOutput
	probe.Stderr = probeOutput
	cleanup, err := startOwnedNative(probe)
	if err != nil {
		return nil, err
	}
	probeDone := make(chan error, 1)
	go func() { probeDone <- probe.Wait(); cleanup() }()
	select {
	case err := <-probeDone:
		if err != nil {
			return nil, nativeError(apierrors.ProviderUnavailable, "native version probe failed")
		}
	case <-probeCtx.Done():
		_ = probe.Cancel()
		<-probeDone
		return nil, nativeError(apierrors.ProviderUnavailable, "native version probe timed out")
	}
	version := versionPattern.FindString(string(probeOutput.Bytes))
	if version == "" {
		return nil, nativeError(apierrors.EvidenceMissing, "native version was not reported")
	}
	n.mu.Lock()
	n.version = version
	n.mu.Unlock()
	seconds := r.Command.DeadlineSeconds
	if seconds == 0 {
		seconds = 180
	}
	if seconds < 1 || seconds > 1800 {
		return nil, nativeError(apierrors.BudgetExhausted, "native deadline must be 1 to 1800 seconds")
	}
	if !filepath.IsAbs(n.stateRoot) {
		return nil, nativeError(apierrors.ProviderUnavailable, "controller native state root is not configured")
	}
	dir := filepath.Join(n.stateRoot, r.Project.ID, n.id)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	args := []string{}
	if n.id == "codex" {
		if len(r.Project.Settings.AllowedTools) > 0 {
			return nil, nativeError(apierrors.UnsupportedCapability, "Codex selected-context adapter does not provide selectively scoped filesystem tools")
		}
		args = []string{"app-server", "-c", "project_doc_max_bytes=0", "-c", `web_search="disabled"`, "-c", "agents.enabled=false", "-c", "skills.include_instructions=false", "-c", "include_apps_instructions=false", "-c", "mcp_servers={}", "--enable", "skip_host_skill_discovery"}
		for _, feature := range codexDisabledFeatures {
			args = append(args, "--disable", feature)
		}
	} else if n.id == "claude" {
		if len(r.Project.Settings.AllowedTools) > 0 {
			return nil, nativeError(apierrors.UnsupportedCapability, "Claude file tools are not mediated by the project scope adapter")
		}
		args = []string{"-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--safe-mode", "--tools=", "--disallowedTools", "mcp__*", "--strict-mcp-config", "--mcp-config", `{"mcpServers":{}}`, "--max-turns", "2"}
		if resume {
			args = append(args, "--resume="+r.Session.NativeID)
		} else {
			args = append(args, "--session-id="+r.SessionID)
		}
	} else {
		args = []string{"--mode", "rpc", "--session-dir", dir, "--no-tools", "--no-extensions", "--no-skills", "--no-prompt-templates"}
		// The native read tool is not an OS sandbox. Until per-tool filesystem
		// mediation exists, only already approved context is supplied to Pi.
		if len(r.Project.Settings.AllowedTools) > 0 {
			return nil, nativeError(apierrors.UnsupportedCapability, "Pi filesystem tools cannot enforce the project file allowlist")
		}
		if resume {
			// The saved opaque ID is a native path created inside controller state.
			if !filepath.IsAbs(r.Session.NativeID) || !inside(dir, r.Session.NativeID) {
				return nil, nativeError(apierrors.ScopeDenied, "saved Pi session is outside owned native storage")
			}
			info, err := os.Lstat(r.Session.NativeID)
			if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
				return nil, nativeError(apierrors.DeliveryUnknown, "saved native Pi session is unavailable")
			}
			args = append(args, "--session", r.Session.NativeID)
		}
	}
	n.mu.Lock()
	relayCapture := n.relayCaptures[r.SessionID]
	n.mu.Unlock()
	if relayCapture != nil {
		args = append(args, "-c", "thread_unload_delay_secs=0")
	}
	return launchNative(n.id, args, r.Project.Root, time.Duration(seconds)*time.Second, relayCapture)
}

func (n *Native) Start(ctx context.Context, r domain.NativeRequest) (domain.NativeSession, error) {
	operation, err := nativeRequestOperation(r, "start")
	if err != nil {
		return r.Session, &domain.NativePrelaunchFailure{Cause: err}
	}
	if n.relayInputGuard != nil {
		return n.StartRelayOperationWithInputGuard(ctx, r, operation, n.relayInputGuard)
	}
	return n.start(ctx, r, false, operation)
}
func (n *Native) Resume(ctx context.Context, r domain.NativeRequest) (domain.NativeSession, error) {
	if !r.Session.StopConfirmed || r.Session.NativeID == "" {
		return r.Session, nativeError(apierrors.DeliveryUnknown, "resume requires confirmed stop and an original native ID")
	}
	operation, err := nativeRequestOperation(r, "resume")
	if err != nil {
		return r.Session, err
	}
	if n.relayInputGuard != nil {
		return n.ResumeRelayOperation(ctx, r, operation)
	}
	if operation != "" {
		return n.ResumeOperation(ctx, r, operation)
	}
	p, err := n.get(r.Session)
	if err != nil {
		return r.Session, err
	}
	p.mu.Lock()
	identity := p.projectID == r.Project.ID && sameRelayMetadataCWD(p.cmd.Dir, r.Project.Root)
	p.mu.Unlock()
	if !identity || !p.observe().StopConfirmed {
		return r.Session, nativeError(apierrors.DeliveryUnknown, "original stopped controller and workspace must be held for resume")
	}
	return n.start(ctx, r, true, operation)
}

func (n *Native) start(ctx context.Context, r domain.NativeRequest, resume bool, operations ...string) (domain.NativeSession, error) {
	operation := ""
	if len(operations) != 0 {
		operation = operations[0]
	}
	return n.startWithInputGuard(ctx, r, resume, operation, nil)
}

func (n *Native) startWithInputGuard(ctx context.Context, r domain.NativeRequest, resume bool, operation string, guard func(context.Context, domain.NativeSession) error) (domain.NativeSession, error) {
	n.startMu.Lock()
	defer n.startMu.Unlock()
	if err := ctx.Err(); err != nil {
		return r.Session, &domain.NativePrelaunchFailure{Cause: err}
	}
	if r.Command.Message != "" || guard != nil || n.relayInputGuard != nil {
		if err := relayNativeToolsDisabled(n.id); err != nil {
			return r.Session, &domain.NativePrelaunchFailure{Cause: err}
		}
	}
	if n.relayInputGuard != nil {
		if operation == "" {
			return r.Session, &domain.NativePrelaunchFailure{Cause: nativeError(apierrors.ValidationFailed, "guarded native startup operation is required")}
		}
		if guard == nil {
			guard = n.relaySourceCheckpoint(n.relayInputGuard)
		}
	}
	if operation != "" {
		if _, err := uuid.Parse(operation); err != nil {
			return r.Session, &domain.NativePrelaunchFailure{Cause: nativeError(apierrors.ValidationFailed, "relay operation must be a UUID")}
		}
	}
	s := r.Session
	s.Ownership = "owned"
	s.ID = r.SessionID
	s.ProjectID = r.Project.ID
	s.CLI = n.id
	s.Version = n.Version()
	s.ContextPacket = r.Packet
	s.Mode = "native"
	s.Status = "starting"
	s.StopConfirmed = false
	s.Limitations = []string{"cooperative native CLI; no operating-system read isolation guarantee", "filesystem and command tools disabled; only explicitly delivered fixed context", "existing external sessions are not taken over"}
	if n.id == "codex" {
		s.Limitations[1] = "native file tool disablement unavailable through the configured app-server; restricted model input is denied"
	}
	n.mu.Lock()
	existing, ok := n.processes[s.ID]
	n.mu.Unlock()
	if ok && !existing.observe().StopConfirmed {
		return s, nativeError(apierrors.VersionConflict, "owned session is still running")
	}
	select {
	case n.slots <- struct{}{}:
	default:
		s.Ownership, s.Status, s.StopConfirmed = "unstarted", "failed", true
		if resume {
			s.Ownership = r.Session.Ownership
		}
		return s, &domain.NativePrelaunchFailure{Cause: nativeError(apierrors.BudgetExhausted, "controller native concurrency limit is four")}
	}
	p, err := n.launch(ctx, r, resume)
	if err != nil {
		<-n.slots
		var uncertain *nativeOwnershipError
		if !errors.As(err, &uncertain) {
			// launch did not create a native session process. A definitely
			// rejected request is distinct from delivered/unknown protocol IO.
			s.Ownership = "unstarted"
			s.StopConfirmed = true
			s.Status = "failed"
			if resume {
				s.Ownership = r.Session.Ownership
			}
			return s, &domain.NativePrelaunchFailure{Cause: err}
		}
		return s, err
	}
	go func() { <-p.done; <-n.slots }()
	p.mu.Lock()
	p.projectID = r.Project.ID
	p.relayInputGuard = guard
	p.relayEvidence.SessionID = s.ID
	p.relayEvidence.StartupOperationID = operation
	p.relayEvidence.Relation = "new"
	if resume {
		p.relayEvidence.Relation = "resume"
		if existing != nil {
			existing.mu.Lock()
			p.relayEvidence.PreviousControllerID = existing.relayEvidence.ControllerID
			existing.mu.Unlock()
		}
	}
	p.mu.Unlock()
	// Keep the actual process reachable even if initialization or its stop is
	// uncertain. Never lose a still-owned process on a failed handshake.
	n.mu.Lock()
	if len(n.processes) >= 256 {
		for id, old := range n.processes {
			if id != s.ID && old.observe().StopConfirmed {
				delete(n.processes, id)
				break
			}
		}
	}
	n.processes[s.ID] = p
	n.mu.Unlock()
	fail := func(err error) (domain.NativeSession, error) {
		_ = p.stop(context.Background())
		p.mu.Lock()
		s.NativeID = p.nativeID
		p.mu.Unlock()
		s.Status = "unknown"
		s.StopConfirmed = p.observe().StopConfirmed
		return s, err
	}
	if n.id == "codex" {
		if _, err = p.call(ctx, "initialize", map[string]any{"clientInfo": map[string]any{"name": "astrocyte", "title": "Astrocyte", "version": "0.1.0"}, "capabilities": map[string]any{"experimentalApi": true}}, false); err != nil {
			return fail(err)
		}
		if err = p.write(map[string]any{"method": "initialized"}); err != nil {
			return fail(err)
		}
		p.mu.Lock()
		p.relayFact("controller_initialized", "codex_initialize", operation)
		p.mu.Unlock()
		params := map[string]any{"cwd": r.Project.Root, "approvalPolicy": "never", "sandbox": "read-only"}
		method := "thread/start"
		if resume {
			method = "thread/resume"
			params["threadId"] = r.Session.NativeID
		}
		if p.relayCapture != nil {
			if resume {
				params["excludeTurns"] = true
			} else {
				params["experimentalRawEvents"] = true
			}
		}
		response, err := p.call(ctx, method, params, false)
		if err != nil {
			return fail(err)
		}
		var result struct {
			Model          string `json:"model"`
			ModelProvider  string `json:"modelProvider"`
			ApprovalPolicy string `json:"approvalPolicy"`
			Sandbox        struct {
				Type string `json:"type"`
			} `json:"sandbox"`
			Thread struct {
				ID  string `json:"id"`
				Cwd string `json:"cwd"`
			} `json:"thread"`
		}
		if err = decodeNativeValue(response["result"], &result); err != nil {
			return fail(err)
		}
		if result.Thread.ID == "" || (resume && result.Thread.ID != r.Session.NativeID) || filepath.Clean(result.Thread.Cwd) != filepath.Clean(r.Project.Root) {
			return fail(nativeError(apierrors.ScopeDenied, "native thread identity or project differs"))
		}
		// 实际响应明确违反请求策略时立即失败；缺失响应不冒称已核实。
		if (result.ApprovalPolicy != "" && result.ApprovalPolicy != "never") || (result.Sandbox.Type != "" && result.Sandbox.Type != "readOnly") {
			return fail(nativeError(apierrors.ScopeDenied, "native thread did not acknowledge the requested permission policy"))
		}
		if p.relayCapture != nil {
			if err = p.relayCapture.bind(response["result"], r, resume); err != nil {
				return fail(err)
			}
		}
		p.mu.Lock()
		p.nativeID = result.Thread.ID
		p.relayFact("session_confirmed", "codex_thread_identity", operation)
		p.model, p.provider = result.Model, result.ModelProvider
		if result.ApprovalPolicy == "never" && result.Sandbox.Type == "readOnly" {
			p.permissionPolicy = "never_read_only"
		}
		p.modelObservedAt = time.Now()
		p.mu.Unlock()
	} else if n.id == "claude" {
		if _, err := p.call(ctx, "initialize", map[string]any{"hooks": map[string]any{}, "agents": map[string]any{}}, false); err != nil {
			return fail(err)
		}
		p.mu.Lock()
		p.relayFact("controller_initialized", "claude_initialize", operation)
		p.nativeID = r.SessionID
		if resume {
			p.nativeID = r.Session.NativeID
		}
		p.mu.Unlock()
	} else {
		response, err := p.call(ctx, "get_state", map[string]any{}, true)
		if err != nil {
			return fail(err)
		}
		var state struct {
			Model struct {
				ID       string `json:"id"`
				Provider string `json:"provider"`
			} `json:"model"`
			SessionFile string `json:"sessionFile"`
			SessionID   string `json:"sessionId"`
		}
		if err = decodeNativeValue(response["data"], &state); err != nil {
			return fail(err)
		}
		if state.SessionFile == "" || !inside(filepath.Join(n.stateRoot, r.Project.ID, n.id), state.SessionFile) || (resume && state.SessionFile != r.Session.NativeID) {
			return fail(nativeError(apierrors.ScopeDenied, "native Pi session identity differs or is unavailable"))
		}
		p.mu.Lock()
		p.nativeID = state.SessionFile
		p.relayFact("session_confirmed", "pi_get_state", operation)
		p.model, p.provider = state.Model.ID, state.Model.Provider
		p.modelObservedAt = time.Now()
		p.mu.Unlock()
	}
	p.mu.Lock()
	s.NativeID = p.nativeID
	p.mu.Unlock()
	s.Version = n.Version()
	n.refreshConfiguration(p)
	s.Status = "idle"
	s.UpdatedAt = time.Now().UTC()
	if resume {
		n.observed("resume")
	} else {
		n.observed("start")
	}
	if err = p.captureOriginalSession(s); err != nil {
		return fail(err)
	}
	if strings.TrimSpace(r.Command.Message) != "" {
		obs, err := n.send(ctx, s, packetPrompt(r.Packet, r.Command.Message), operation)
		if err != nil {
			if captureErr := p.captureOriginalSession(s); captureErr != nil {
				return s, errors.Join(err, captureErr)
			}
			return s, err
		}
		s.Status = obs.Status
	}
	if err := p.captureOriginalSession(s); err != nil {
		return s, err
	}
	return s, nil
}

func (n *Native) Send(ctx context.Context, s domain.NativeSession, message string) (domain.NativeObservation, error) {
	operation, err := nativeRequestOperation(domain.NativeRequest{Session: s}, "send")
	if err != nil {
		return domain.NativeObservation{}, err
	}
	if operation == "" {
		return domain.NativeObservation{}, nativeError(apierrors.DeliveryUnknown, "original pending send operation is unrecorded")
	}
	if n.relayInputGuard != nil {
		p, err := n.get(s)
		if err != nil {
			return domain.NativeObservation{}, err
		}
		original, err := p.relayInputSession(s)
		if err != nil {
			return domain.NativeObservation{}, err
		}
		message = packetPrompt(original.ContextPacket, message)
	}
	return n.send(ctx, s, message, operation)
}

func (n *Native) send(ctx context.Context, s domain.NativeSession, message, operation string) (domain.NativeObservation, error) {
	if strings.TrimSpace(message) == "" || len(message) > 512*1024 || !utf8.ValidString(message) {
		return domain.NativeObservation{}, &domain.RelayInputNotSubmitted{Cause: nativeError(apierrors.ValidationFailed, "native fixed input is empty, invalid UTF-8 or exceeds 512 KiB")}
	}
	if operation != "" {
		if _, err := uuid.Parse(operation); err != nil {
			return domain.NativeObservation{}, nativeError(apierrors.ValidationFailed, "relay operation must be a UUID")
		}
	}
	if err := ctx.Err(); err != nil {
		return domain.NativeObservation{}, err
	}
	p, err := n.get(s)
	if err != nil {
		return domain.NativeObservation{}, err
	}
	if err := relayNativeToolsDisabled(n.id); err != nil {
		return domain.NativeObservation{}, &domain.RelayInputNotSubmitted{Cause: err}
	}
	p.operationMu.Lock()
	defer p.operationMu.Unlock()
	if operation != "" {
		p.mu.Lock()
		alreadyWritten := false
		for _, fact := range p.relayEvidence.Facts {
			if fact.OperationID == operation && (fact.Kind == "input_written" || fact.Kind == "input_accepted") {
				alreadyWritten = true
				break
			}
		}
		p.mu.Unlock()
		if alreadyWritten {
			return p.observe(), nativeError(apierrors.VersionConflict, "original input operation was already submitted; do not replay")
		}
	}
	obs := p.observe()
	if obs.StopConfirmed || obs.Status == "running" || obs.Status == "blocked" {
		return obs, nativeError(apierrors.VersionConflict, "native session is stopped, occupied or blocked")
	}
	if p.relayInputGuard != nil {
		original, err := p.relayInputSession(s)
		if err != nil {
			return p.observe(), err
		}
		if err = p.relayInputGuard(ctx, original); err != nil {
			stopErr := p.stop(context.Background())
			if stopErr != nil {
				return p.observe(), errors.Join(err, stopErr)
			}
			return p.observe(), &domain.RelayInputNotSubmitted{Cause: err}
		}
	}
	p.mu.Lock()
	p.status = "running"
	p.inputOperationID = operation
	if n.id == "codex" {
		p.turnID = ""
	}
	p.mu.Unlock()
	if n.id == "codex" {
		params := map[string]any{"threadId": s.NativeID, "input": []any{map[string]any{"type": "text", "text": message}}, "approvalPolicy": "never", "sandboxPolicy": map[string]any{"type": "readOnly"}}
		if schema := p.completionExperienceSchema(); schema != nil {
			params["outputSchema"] = schema
		}
		response, err := p.call(ctx, "turn/start", params, false)
		if err != nil {
			return p.observe(), err
		}
		var result struct {
			Turn struct {
				ID string `json:"id"`
			} `json:"turn"`
		}
		if err = decodeNativeValue(response["result"], &result); err != nil {
			p.failOutput()
			return p.observe(), err
		}
		if result.Turn.ID == "" {
			p.failOutput()
			return p.observe(), nativeError(apierrors.DeliveryUnknown, "native turn identity is unavailable; do not replay")
		}
		p.mu.Lock()
		if err := p.bindRelayTurn(s, operation, result.Turn.ID); err != nil {
			p.mu.Unlock()
			p.failOutput()
			return p.observe(), nativeError(apierrors.DeliveryUnknown, "native input was submitted but its original turn binding is unconfirmed; do not replay")
		}
		p.turnID = result.Turn.ID
		p.relayFact("input_accepted", "codex_turn_acknowledgement", operation)
		p.consumptionUnknown(operation)
		if when, exists := p.relayStartedTurns[result.Turn.ID]; exists && operation != "" {
			p.addEvent("turn_started", "")
			p.relayFact("turn_started", "codex_turn_started", operation)
			p.relayEvidence.Facts[len(p.relayEvidence.Facts)-1].TS = when
			p.markRelayTurnStarted(result.Turn.ID, when)
			if p.relayPublishedTurns == nil {
				p.relayPublishedTurns = map[string]bool{}
			}
			p.relayPublishedTurns[result.Turn.ID] = true
			delete(p.relayStartedTurns, result.Turn.ID)
		}
		p.mu.Unlock()
	} else if n.id == "claude" {
		if err := p.write(map[string]any{"type": "user", "session_id": s.NativeID, "message": map[string]any{"role": "user", "content": message}, "parent_tool_use_id": nil}); err != nil {
			return p.observe(), nativeError(apierrors.DeliveryUnknown, "Claude user-message delivery is unknown")
		}
		p.mu.Lock()
		p.relayFact("input_written", "claude_stream_input", operation)
		p.consumptionUnknown(operation)
		p.mu.Unlock()
	} else {
		if _, err := p.call(ctx, "prompt", map[string]any{"message": message}, true); err != nil {
			return p.observe(), err
		}
		p.mu.Lock()
		p.relayFact("input_accepted", "pi_prompt_acknowledgement", operation)
		p.consumptionUnknown(operation)
		p.mu.Unlock()
	}
	n.observed("send")
	return p.observe(), nil
}

func (n *Native) Stop(ctx context.Context, s domain.NativeSession) (domain.NativeObservation, error) {
	p, err := n.get(s)
	if err != nil {
		return domain.NativeObservation{Status: "blocked"}, err
	}
	// Interrupt is best effort, but only positive process-tree exit is stop.
	p.mu.Lock()
	turn := p.turnID
	p.mu.Unlock()
	short, cancel := context.WithTimeout(ctx, time.Second)
	if n.id == "codex" && turn != "" && p.observe().Status == "running" {
		_, _ = p.call(short, "turn/interrupt", map[string]any{"threadId": s.NativeID, "turnId": turn}, false)
	}
	if n.id == "pi" {
		_, _ = p.call(short, "clear_queue", map[string]any{}, true)
		_, _ = p.call(short, "abort", map[string]any{}, true)
	}
	if n.id == "claude" && p.observe().Status == "running" {
		_, _ = p.call(short, "interrupt", map[string]any{}, false)
	}
	cancel()
	err = p.stop(ctx)
	obs := p.observe()
	if err == nil && obs.StopConfirmed {
		n.observed("stop")
	}
	return obs, err
}
func (n *Native) Observe(ctx context.Context, s domain.NativeSession) (domain.NativeObservation, error) {
	if err := ctx.Err(); err != nil {
		return domain.NativeObservation{}, err
	}
	p, err := n.get(s)
	if err != nil {
		return domain.NativeObservation{Status: "unknown"}, err
	}
	n.observed("observe")
	obs := p.observe()
	if obs.Status == "completed" {
		n.refreshConfiguration(p)
	}
	return obs, nil
}

type ProjectFiles struct{}

func (ProjectFiles) CanonicalRoot(root string) (string, error) { return CanonicalRoot(root) }
func (ProjectFiles) ValidateProjectPath(root, rel string) (string, error) {
	return ValidateProjectPath(root, rel)
}
func (ProjectFiles) ReadProjectFiles(ctx context.Context, p domain.LocalProject, paths []string) ([]domain.ContextFile, error) {
	return ReadProjectFiles(ctx, p, paths)
}
func (ProjectFiles) DiscoverProjects(ctx context.Context, root string) ([]domain.ProjectCandidate, error) {
	return DiscoverProjects(ctx, root)
}
