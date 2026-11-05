package agents

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

// 自有配置与最后合并的环境权限逐项禁止工具，会话权限继续独立核查。
const opencodeDenyPermission = `{"*":"deny","read":"deny","edit":"deny","bash":"deny","glob":"deny","grep":"deny","webfetch":"deny","websearch":"deny","task":"deny","skill":"deny","lsp":"deny","question":"deny","external_directory":"deny","doom_loop":"deny"}`

// 官方 1.18.35 SessionCreateData/SessionUpdateData 的 permission 规则。
type opencodePermissionRule struct {
	Permission string `json:"permission"`
	Pattern    string `json:"pattern"`
	Action     string `json:"action"`
}

// 会话规则最后合并，准确的末尾通配 deny 规则禁止所有工具。
var opencodeSessionDenyPermission = []opencodePermissionRule{{Permission: "*", Pattern: "*", Action: "deny"}}

// 固定版本的实际 OpenCode 使用自有来源目录及带 Basic auth 的 loopback HTTP。
// 原宿主 auth、配置和历史不读取、不复制；当前模型保持未知。
type opencodeNative struct {
	mu            sync.Mutex
	id, stateRoot string
	slots         chan struct{}
	processes     map[string]*opencodeProcess
	capabilities  map[string]domain.CapabilityObservation
	version       string
}

var _ app.NativeAdapter = (*opencodeNative)(nil)

func newOpencodeNative(stateRoot string, slots chan struct{}) *opencodeNative {
	return &opencodeNative{
		id:           "opencode",
		stateRoot:    stateRoot,
		slots:        slots,
		processes:    map[string]*opencodeProcess{},
		capabilities: domain.UnknownNativeCapabilities(),
	}
}

func (n *opencodeNative) ID() string { return n.id }
func (n *opencodeNative) Version() string {
	n.mu.Lock()
	defer n.mu.Unlock()
	if n.version == "" {
		return "native_version_not_observed"
	}
	return n.version
}
func (n *opencodeNative) Capabilities() map[string]domain.CapabilityObservation {
	n.mu.Lock()
	defer n.mu.Unlock()
	result := map[string]domain.CapabilityObservation{}
	for k, v := range n.capabilities {
		result[k] = v
	}
	return result
}
func (n *opencodeNative) observed(capability string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	now := time.Now().UTC()
	n.capabilities[capability] = domain.CapabilityObservation{Status: "supported", Reason: "owned_native_protocol_succeeded", CheckedAt: &now}
}

// 当前模型在付费轮次前没有原生观察，Configured 保持 unknown。
func (n *opencodeNative) snapshot() domain.LocalAgent {
	caps := n.Capabilities()
	item := domain.LocalAgent{
		ID:                      n.id,
		NativeAdapterRegistered: true,
		Capabilities:            caps,
		Configured:              domain.Observation{Status: "unknown", Reason: "native_current_model_not_observed_before_paid_turn"},
		Startable:               domain.Observation{Status: "unknown", Reason: "native_start_not_authorized_or_tested"},
	}
	n.mu.Lock()
	if n.version != "" {
		v := n.version
		item.Version = &v
	}
	n.mu.Unlock()
	if caps["start"].Status == "supported" {
		item.Startable = domain.Observation{Status: "available", Reason: "native_protocol_session_start_observed_not_model_readiness", CheckedAt: caps["start"].CheckedAt}
	}
	return item
}

func (n *opencodeNative) get(s domain.NativeSession) (*opencodeProcess, error) {
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

func (n *opencodeNative) Discover(ctx context.Context, p domain.LocalProject) ([]domain.NativeSession, error) {
	// 历史来源范围协议尚未核实，拒绝读取宿主全局历史。
	return nil, nativeError(apierrors.UnsupportedCapability, "this CLI history header scope protocol has not been verified")
}

func (n *opencodeNative) ReadContext(ctx context.Context, s domain.NativeSession) ([]domain.NativeEvent, error) {
	p, err := n.get(s)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	events, err := p.readMessages(ctx, s.NativeID)
	if err == nil {
		n.observed("read_context")
	}
	return events, err
}

func (n *opencodeNative) Start(ctx context.Context, r domain.NativeRequest) (domain.NativeSession, error) {
	return n.start(ctx, r, false)
}

func (n *opencodeNative) Resume(ctx context.Context, r domain.NativeRequest) (domain.NativeSession, error) {
	if !r.Session.StopConfirmed || r.Session.NativeID == "" {
		return r.Session, nativeError(apierrors.DeliveryUnknown, "resume requires confirmed stop and an original native ID")
	}
	return n.start(ctx, r, true)
}

func (n *opencodeNative) start(ctx context.Context, r domain.NativeRequest, resume bool) (domain.NativeSession, error) {
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
	s.Limitations = []string{"cooperative native CLI; no operating-system read isolation guarantee", "owned home/config/data/state/cache/temp/managed sources; no host authentication inherited", "tools denied by owned config and verified session permission", "existing external sessions are not taken over", "current model is not reported before a paid turn"}
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
		stopErr := p.stop(context.Background())
		s.Status = "unknown"
		s.StopConfirmed = p.observe().StopConfirmed
		return s, errors.Join(err, stopErr)
	}
	var sessionID string
	if resume {
		// 从自有持久目录读取原生 ID，恢复时保持同一会话身份。
		sessionID = r.Session.NativeID
		if err := p.verifySession(ctx, sessionID); err != nil {
			return fail(err)
		}
	} else {
		sessionID, err = p.createSession(ctx, r.Project.ID)
		if err != nil {
			return fail(err)
		}
		// 发送前核实实际会话返回的 deny 规则。
		if err := p.verifySession(ctx, sessionID); err != nil {
			return fail(err)
		}
	}
	p.mu.Lock()
	p.nativeID = sessionID
	p.mu.Unlock()
	s.NativeID = sessionID
	s.Version = n.Version()
	s.Status = "idle"
	s.UpdatedAt = time.Now().UTC()
	if resume {
		n.observed("resume")
	} else {
		n.observed("start")
	}
	if strings.TrimSpace(r.Command.Message) != "" {
		obs, err := n.Send(ctx, s, packetPrompt(r.Packet, r.Command.Message))
		if err != nil {
			return s, err
		}
		s.Status = obs.Status
	}
	return s, nil
}

func (n *opencodeNative) Send(ctx context.Context, s domain.NativeSession, message string) (domain.NativeObservation, error) {
	if err := ctx.Err(); err != nil {
		return domain.NativeObservation{}, err
	}
	p, err := n.get(s)
	if err != nil {
		return domain.NativeObservation{}, err
	}
	obs := p.observe()
	if obs.StopConfirmed || obs.Status == "running" || obs.Status == "blocked" {
		return obs, nativeError(apierrors.VersionConflict, "native session is stopped, occupied or blocked")
	}
	p.mu.Lock()
	p.status = "running"
	p.mu.Unlock()
	text, err := p.sendMessage(ctx, s.NativeID, message)
	if err != nil {
		return p.observe(), err
	}
	p.mu.Lock()
	if p.status != "failed" {
		p.status = "completed"
	}
	p.mu.Unlock()
	if text != "" {
		p.addEvent("text", text)
	}
	n.observed("send")
	return p.observe(), nil
}

func (n *opencodeNative) Stop(ctx context.Context, s domain.NativeSession) (domain.NativeObservation, error) {
	p, err := n.get(s)
	if err != nil {
		return domain.NativeObservation{Status: "blocked"}, err
	}
	err = p.stop(ctx)
	obs := p.observe()
	if err == nil && obs.StopConfirmed {
		n.observed("stop")
	}
	return obs, err
}

func (n *opencodeNative) Observe(ctx context.Context, s domain.NativeSession) (domain.NativeObservation, error) {
	if err := ctx.Err(); err != nil {
		return domain.NativeObservation{}, err
	}
	p, err := n.get(s)
	if err != nil {
		return domain.NativeObservation{Status: "unknown"}, err
	}
	n.observed("observe")
	return p.observe(), nil
}

// 每个实例持有一个实际 serve 子进程及其 HTTP 客户端。
type opencodeProcess struct {
	mu         sync.Mutex
	cmd        *exec.Cmd
	cleanup    func()
	done       chan struct{}
	client     *http.Client
	baseURL    string
	username   string
	password   string
	nativeID   string
	status     string
	events     []domain.NativeEvent
	sequence   int
	bytes      int
	truncated  bool
	stopping   bool
	version    string
	model      string
	provider   string
	observedAt time.Time
}

func (p *opencodeProcess) observe() domain.NativeObservation {
	p.mu.Lock()
	defer p.mu.Unlock()
	stopped := false
	select {
	case <-p.done:
		stopped = true
	default:
	}
	return domain.NativeObservation{Status: p.status, Events: append([]domain.NativeEvent{}, p.events...), StopConfirmed: stopped, OutputTruncated: p.truncated}
}

func (p *opencodeProcess) addEvent(kind, text string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.truncated {
		return
	}
	if len(p.events) >= 256 || p.bytes+len(text) > 128*1024 {
		p.truncated = true
		p.status = "blocked"
		return
	}
	p.sequence++
	p.bytes += len(text)
	p.events = append(p.events, domain.NativeEvent{Sequence: p.sequence, Kind: kind, Text: text})
}

func (p *opencodeProcess) do(ctx context.Context, method, path string, body any) (data []byte, status int, err error) {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, p.baseURL+path, reader)
	if err != nil {
		return nil, 0, err
	}
	req.SetBasicAuth(p.username, p.password)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer func() { err = errors.Join(err, resp.Body.Close()) }()
	data, err = io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024+1))
	if err != nil {
		return nil, resp.StatusCode, err
	}
	if len(data) > 2*1024*1024 {
		return nil, resp.StatusCode, nativeError(apierrors.BudgetExhausted, "OpenCode response exceeds the bounded native window")
	}
	return data, resp.StatusCode, nil
}

// 创建会话时提交 deny 规则，后续读取和恢复均使用服务返回的原生 ID。
func (p *opencodeProcess) createSession(ctx context.Context, title string) (string, error) {
	data, status, err := p.do(ctx, http.MethodPost, "/session", map[string]any{"title": title, "permission": opencodeSessionDenyPermission})
	if err != nil {
		return "", nativeError(apierrors.DeliveryUnknown, "OpenCode session create delivery is unknown")
	}
	if status < 200 || status >= 300 {
		return "", nativeError(apierrors.ProviderUnavailable, "OpenCode server rejected session create")
	}
	var session struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(data, &session) != nil || session.ID == "" {
		return "", nativeError(apierrors.EvidenceMissing, "OpenCode session identity was not reported")
	}
	return session.ID, nil
}

// 核实同一原生 ID 与实际末尾 deny 规则，缺失即拒绝发送。
func (p *opencodeProcess) verifySession(ctx context.Context, sessionID string) error {
	data, status, err := p.do(ctx, http.MethodGet, "/session/"+sessionID, nil)
	if err != nil {
		return nativeError(apierrors.DeliveryUnknown, "OpenCode session resume verification delivery is unknown")
	}
	if status == http.StatusNotFound {
		return nativeError(apierrors.DeliveryUnknown, "original native session is unavailable")
	}
	if status < 200 || status >= 300 {
		return nativeError(apierrors.ProviderUnavailable, "OpenCode server rejected the session resume")
	}
	var session struct {
		ID         string                   `json:"id"`
		Permission []opencodePermissionRule `json:"permission"`
	}
	if json.Unmarshal(data, &session) != nil || session.ID != sessionID {
		return nativeError(apierrors.ScopeDenied, "native session identity differs")
	}
	// 末尾规则按原生 findLast 语义生效，必须准确禁止全部 permission/pattern。
	if len(session.Permission) == 0 {
		return nativeError(apierrors.ScopeDenied, "session permission is empty; refusing to send")
	}
	last := session.Permission[len(session.Permission)-1]
	if last.Permission != "*" || last.Pattern != "*" || last.Action != "deny" {
		return nativeError(apierrors.ScopeDenied, "session deny-by-default permission is not effective; refusing to send")
	}
	return nil
}

// 同步发送明确消息，模型与 provider 只从实际回复记录。
func (p *opencodeProcess) sendMessage(ctx context.Context, sessionID, message string) (string, error) {
	body := map[string]any{"parts": []map[string]any{{"type": "text", "text": message}}}
	data, status, err := p.do(ctx, http.MethodPost, "/session/"+sessionID+"/message", body)
	if err != nil {
		if ctx.Err() != nil {
			return "", nativeError(apierrors.DeliveryUnknown, "OpenCode reply deadline elapsed; do not replay automatically")
		}
		return "", nativeError(apierrors.DeliveryUnknown, "OpenCode message delivery is unknown")
	}
	if status < 200 || status >= 300 {
		return "", nativeError(apierrors.ProviderUnavailable, "OpenCode server rejected the message")
	}
	text, model, provider, err := decodeOpencodeReply(data)
	if err != nil {
		return "", err
	}
	if model != "" {
		p.mu.Lock()
		p.model, p.provider, p.observedAt = model, provider, time.Now()
		p.mu.Unlock()
	}
	return text, nil
}

// 回复投影只解析明确提供的 JSON，不建立模型或交付事实。
func decodeOpencodeReply(data []byte) (string, string, string, error) {
	var reply struct {
		Info struct {
			Role       string `json:"role"`
			ModelID    string `json:"modelID"`
			ProviderID string `json:"providerID"`
		} `json:"info"`
		Parts []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"parts"`
	}
	if json.Unmarshal(data, &reply) != nil {
		return "", "", "", nativeError(apierrors.EvidenceMissing, "OpenCode message schema is unavailable")
	}
	var text strings.Builder
	for _, part := range reply.Parts {
		if part.Type == "text" {
			text.WriteString(part.Text)
		}
	}
	return text.String(), reply.Info.ModelID, reply.Info.ProviderID, nil
}

// 读取同一自有会话的消息并投影为有界事件，不发起模型轮次。
func (p *opencodeProcess) readMessages(ctx context.Context, sessionID string) ([]domain.NativeEvent, error) {
	data, status, err := p.do(ctx, http.MethodGet, "/session/"+sessionID+"/message", nil)
	if err != nil {
		return nil, nativeError(apierrors.DeliveryUnknown, "OpenCode context read delivery is unknown")
	}
	if status < 200 || status >= 300 {
		return nil, nativeError(apierrors.ProviderUnavailable, "OpenCode server rejected the context read")
	}
	var messages []struct {
		Info struct {
			Role string `json:"role"`
		} `json:"info"`
		Parts []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"parts"`
	}
	if json.Unmarshal(data, &messages) != nil {
		return nil, nativeError(apierrors.EvidenceMissing, "OpenCode message list schema is unavailable")
	}
	projection := contextProjection{events: []domain.NativeEvent{}}
	for _, message := range messages {
		for _, part := range message.Parts {
			if part.Type == "text" {
				if err := projection.add(message.Info.Role, part.Text); err != nil {
					return nil, err
				}
			}
		}
	}
	return projection.events, nil
}

func (p *opencodeProcess) stop(ctx context.Context) error {
	select {
	case <-p.done:
		return nil
	default:
	}
	p.mu.Lock()
	p.stopping = true
	p.mu.Unlock()
	// HTTP 清理失败仍执行进程树停止，并保留所有实际失败。
	short, cancel := context.WithTimeout(ctx, time.Second)
	var cleanupErr error
	paths := []string{"/instance/dispose"}
	if p.nativeID != "" {
		paths = append([]string{"/session/" + p.nativeID + "/abort"}, paths...)
	}
	for _, path := range paths {
		_, status, err := p.do(short, http.MethodPost, path, nil)
		if err == nil && (status < 200 || status >= 300) {
			err = nativeError(apierrors.ProviderUnavailable, "OpenCode rejected native cleanup")
		}
		cleanupErr = errors.Join(cleanupErr, err)
	}
	cancel()
	if err := p.cmd.Cancel(); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return errors.Join(cleanupErr, nativeError(apierrors.DeliveryUnknown, "native process tree stop is unconfirmed"), err)
	}
	select {
	case <-p.done:
		return cleanupErr
	case <-ctx.Done():
		return errors.Join(cleanupErr, ctx.Err())
	case <-time.After(5 * time.Second):
		return errors.Join(cleanupErr, nativeError(apierrors.DeliveryUnknown, "native process exit is unconfirmed"))
	}
}

// 启动使用完整自有来源的实际进程，并核实健康接口。
func (n *opencodeNative) launch(ctx context.Context, r domain.NativeRequest, resume bool) (*opencodeProcess, error) {
	if !filepath.IsAbs(n.stateRoot) || !filepath.IsAbs(r.Project.Root) {
		return nil, nativeError(apierrors.ProviderUnavailable, "controller native state and project roots must be absolute")
	}
	dir := filepath.Join(n.stateRoot, r.Project.ID, n.id, r.SessionID)
	if !inside(n.stateRoot, dir) || filepath.Clean(dir) == filepath.Clean(n.stateRoot) {
		return nil, nativeError(apierrors.ScopeDenied, "OpenCode isolation root leaves owned state")
	}
	username, password, err := randomBasicAuth()
	if err != nil {
		return nil, err
	}
	env, err := opencodeIsolationEnv(filepath.Join(dir, "isolated"), username, password)
	if err != nil {
		return nil, err
	}
	probeCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	probe, err := installedCommand(n.id, []string{"--version"})
	if err != nil {
		return nil, err
	}
	probe.Env = env
	probe.Dir = r.Project.Root
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
		cancelErr := probe.Cancel()
		if errors.Is(cancelErr, os.ErrProcessDone) {
			cancelErr = nil
		}
		waitErr := <-probeDone
		return nil, errors.Join(nativeError(apierrors.ProviderUnavailable, "native version probe timed out"), probeCtx.Err(), cancelErr, waitErr)
	}
	version := versionPattern.FindString(string(probeOutput.Bytes))
	if version == "" {
		return nil, nativeError(apierrors.EvidenceMissing, "native version was not reported")
	}
	if version != "1.18.35" {
		return nil, nativeError(apierrors.UnsupportedCapability, "OpenCode isolation requires the verified native version 1.18.35")
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

	port, err := freeLoopbackPort()
	if err != nil {
		return nil, err
	}
	configDir := filepath.Join(dir, "isolated", "config")
	if err := os.WriteFile(filepath.Join(configDir, "opencode.json"), []byte(`{"$schema":"https://opencode.ai/config.json","permission":`+opencodeDenyPermission+`}`+"\n"), 0600); err != nil {
		return nil, err
	}
	args := []string{"serve", "--hostname", "127.0.0.1", "--port", port, "--pure"}
	cmd, err := installedCommand(n.id, args)
	if err != nil {
		return nil, err
	}
	cmd.Dir = r.Project.Root
	cmd.Env = env
	privateLog, err := os.CreateTemp(dir, "native-process-*.log")
	if err != nil {
		return nil, err
	}
	cmd.Stderr = privateLog
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, errors.Join(err, privateLog.Close())
	}
	processCtx, processCancel := context.WithTimeout(context.Background(), time.Duration(seconds)*time.Second)
	process := &opencodeProcess{
		cmd:      cmd,
		done:     make(chan struct{}),
		client:   &http.Client{Timeout: time.Duration(seconds) * time.Second},
		baseURL:  "http://127.0.0.1:" + port,
		username: username,
		password: password,
		version:  version,
		status:   "idle",
	}
	cleanup, err = startOwnedNative(cmd)
	if err != nil {
		processCancel()
		return nil, errors.Join(err, privateLog.Close())
	}
	process.cleanup = cleanup
	announcement := make(chan error, 1)
	outputDone := make(chan error, 1)
	go func() { outputDone <- readOpencodeAnnouncement(stdout, privateLog, process.baseURL, announcement) }()
	go func() {
		outputErr := <-outputDone
		waitErr := errors.Join(outputErr, cmd.Wait())
		if closeErr := privateLog.Close(); closeErr != nil {
			waitErr = errors.Join(waitErr, closeErr)
		}
		cleanup()
		process.mu.Lock()
		if waitErr != nil && !process.stopping && process.status != "blocked" && process.status != "completed" {
			process.status = "failed"
			process.addEventLocked("process_exit", fmt.Sprintf("exit_code:%d", exitCode(waitErr)))
			slog.Warn("owned OpenCode process exited", "exit_code", exitCode(waitErr))
		} else if process.status != "completed" && process.status != "failed" && process.status != "blocked" {
			process.status = "stopped"
		}
		process.mu.Unlock()
		close(process.done)
		processCancel()
	}()
	go func() {
		select {
		case <-processCtx.Done():
			if err := process.stop(context.Background()); err != nil {
				slog.Warn("owned OpenCode lifetime stop failed", "error_code", "native_stop_unconfirmed")
			}
		case <-process.done:
		}
	}()
	startup, startupCancel := context.WithTimeout(ctx, 20*time.Second)
	defer startupCancel()
	select {
	case err := <-announcement:
		if err != nil {
			return nil, errors.Join(err, process.stop(context.Background()))
		}
	case <-startup.Done():
		return nil, errors.Join(startup.Err(), process.stop(context.Background()))
	}
	// 只接受已公布 listener 的实际健康响应，失败先停止本实例再返回原错误。
	if err := waitHealth(startup, process); err != nil {
		return nil, errors.Join(err, process.stop(context.Background()))
	}
	return process, nil
}

func (p *opencodeProcess) addEventLocked(kind, text string) {
	if p.truncated {
		return
	}
	if len(p.events) >= 256 || p.bytes+len(text) > 128*1024 {
		p.truncated = true
		p.status = "blocked"
		return
	}
	p.sequence++
	p.bytes += len(text)
	p.events = append(p.events, domain.NativeEvent{Sequence: p.sequence, Kind: kind, Text: text})
}

func exitCode(err error) int {
	var nativeExit *exec.ExitError
	if errors.As(err, &nativeExit) {
		return nativeExit.ExitCode()
	}
	return -1
}

func waitHealth(ctx context.Context, p *opencodeProcess) error {
	data, status, err := p.do(ctx, http.MethodGet, "/global/health", nil)
	if err != nil {
		return errors.Join(nativeError(apierrors.ProviderUnavailable, "OpenCode health transport failed"), err)
	}
	if status != http.StatusOK {
		return nativeError(apierrors.ProviderUnavailable, "OpenCode health endpoint rejected the request")
	}
	var health struct {
		Healthy bool `json:"healthy"`
	}
	if err := json.Unmarshal(data, &health); err != nil {
		return errors.Join(nativeError(apierrors.EvidenceMissing, "OpenCode health schema is unavailable"), err)
	}
	if !health.Healthy {
		return nativeError(apierrors.ProviderUnavailable, "OpenCode server reported unhealthy")
	}
	return nil
}

func freeLoopbackPort() (string, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", err
	}
	_, port, err := net.SplitHostPort(listener.Addr().String())
	return port, errors.Join(err, listener.Close())
}

func randomBasicAuth() (string, string, error) {
	usernameBytes := make([]byte, 12)
	passwordBytes := make([]byte, 24)
	if _, err := rand.Read(usernameBytes); err != nil {
		return "", "", err
	}
	if _, err := rand.Read(passwordBytes); err != nil {
		return "", "", err
	}
	return hex.EncodeToString(usernameBytes), hex.EncodeToString(passwordBytes), nil
}
