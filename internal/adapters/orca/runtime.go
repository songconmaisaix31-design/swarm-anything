package orca

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

type Config struct {
	InstallRoot           string
	DataRoot              string
	NodeExecutable        string
	ClientEntry           string
	AgentProfile          string
	DiscoveryHome         string
	DiscoveryAppData      string
	DiscoveryLocalAppData string
	DiscoveryCodexHome    string
	CodexAPIKeyHome       string
	DiscoveryClaudeHome   string
	ClaudeAPIKeyHome      string
	OpenCodeAPIKeyHome    string
	DiscoveryPiHome       string
	ProtectedRoots        []string
	OwnerCapability       string
}

type Runtime struct{ config Config }

func platformExecutable(name string) string {
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}

var _ app.OrcaExecutionRuntime = (*Runtime)(nil)

func contains(root, path string) bool {
	if runtime.GOOS == "windows" {
		root, path = strings.ToLower(root), strings.ToLower(path)
	}
	rel, err := filepath.Rel(root, path)
	return err == nil && !filepath.IsAbs(rel) && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// 只接受已经安装的明确路径，缺失时不会启动本机 Orca 或选择其他入口。
func New(config Config) (*Runtime, error) {
	if len(config.ProtectedRoots) == 0 || !filepath.IsAbs(config.DiscoveryHome) {
		return nil, errors.New("explicit protected roots and local Agent discovery home are required")
	}
	for _, item := range []*string{&config.InstallRoot, &config.DataRoot, &config.NodeExecutable, &config.ClientEntry} {
		if !filepath.IsAbs(*item) {
			return nil, errors.New("Orca runtime paths must be absolute")
		}
		actual, err := filepath.EvalSymlinks(*item)
		if err != nil {
			return nil, fmt.Errorf("resolve product runtime path: %w", err)
		}
		*item = actual
	}
	if !contains(config.InstallRoot, config.NodeExecutable) || !contains(config.InstallRoot, config.ClientEntry) || contains(config.InstallRoot, config.DataRoot) || contains(config.DataRoot, config.InstallRoot) {
		return nil, errors.New("product code and private writable roots must be disjoint")
	}
	if config.AgentProfile != "" {
		if !filepath.IsAbs(config.AgentProfile) {
			return nil, errors.New("read-only Agent profile must be absolute")
		}
		actual, err := filepath.EvalSymlinks(config.AgentProfile)
		if err != nil {
			return nil, fmt.Errorf("resolve read-only Agent profile: %w", err)
		}
		info, err := os.Stat(actual)
		if err != nil || !info.IsDir() || contains(config.DataRoot, actual) || contains(actual, config.DataRoot) {
			return nil, errors.New("read-only Agent profile must be an existing directory disjoint from private state")
		}
		config.AgentProfile = actual
	}
	for _, protected := range config.ProtectedRoots {
		if !filepath.IsAbs(protected) {
			return nil, errors.New("protected root must be absolute")
		}
		protected, err := filepath.EvalSymlinks(protected)
		if err != nil {
			return nil, fmt.Errorf("resolve protected root: %w", err)
		}
		if contains(protected, config.DataRoot) || contains(config.DataRoot, protected) || contains(protected, config.InstallRoot) || contains(config.InstallRoot, protected) {
			return nil, errors.New("product root overlaps a protected Orca or Agent root")
		}
	}
	codexHome, err := apiKeySourceHome(config.CodexAPIKeyHome, config, config.ClaudeAPIKeyHome, config.OpenCodeAPIKeyHome)
	if err != nil {
		return nil, err
	}
	config.CodexAPIKeyHome = codexHome
	claudeHome, err := apiKeySourceHome(config.ClaudeAPIKeyHome, config, config.CodexAPIKeyHome, config.OpenCodeAPIKeyHome)
	if err != nil {
		return nil, err
	}
	config.ClaudeAPIKeyHome = claudeHome
	opencodeHome, err := apiKeySourceHome(config.OpenCodeAPIKeyHome, config, config.CodexAPIKeyHome, config.ClaudeAPIKeyHome)
	if err != nil {
		return nil, err
	}
	config.OpenCodeAPIKeyHome = opencodeHome
	return &Runtime{config: config}, nil
}

func apiKeySourceHome(input string, config Config, otherSources ...string) (string, error) {
	if input == "" {
		return "", nil
	}
	invalid := errors.New("explicit native API-key source home must be an independent plain absolute directory")
	if !filepath.IsAbs(input) || plainInstalledPath(input) != nil {
		return "", invalid
	}
	info, err := os.Stat(input)
	if err != nil || !info.IsDir() {
		return "", invalid
	}
	source, err := filepath.EvalSymlinks(input)
	if err != nil {
		return "", invalid
	}
	roots := append([]string{
		config.InstallRoot, config.DataRoot, config.AgentProfile,
		config.DiscoveryCodexHome, os.Getenv("CODEX_HOME"), os.Getenv("SWA_DISCOVERY_CODEX_HOME"), filepath.Join(config.DiscoveryHome, ".codex"),
		config.DiscoveryClaudeHome, os.Getenv("CLAUDE_CONFIG_DIR"), os.Getenv("SWA_DISCOVERY_CLAUDE_HOME"), filepath.Join(config.DiscoveryHome, ".claude"),
	}, config.ProtectedRoots...)
	roots = append(roots, otherSources...)
	for _, root := range roots {
		if root == "" {
			continue
		}
		actual, err := metadataRoot(root)
		if err != nil || contains(actual, source) || contains(source, actual) {
			return "", invalid
		}
	}
	return source, nil
}

// 尚未创建的保护目录也保留边界，只解析已有祖先的路径元数据。
func metadataRoot(input string) (string, error) {
	if !filepath.IsAbs(input) {
		return "", errors.New("source protection requires an absolute root")
	}
	current := filepath.Clean(input)
	var missing []string
	for {
		_, err := os.Lstat(current)
		if err == nil {
			actual, err := filepath.EvalSymlinks(current)
			if err != nil {
				return "", err
			}
			for index := len(missing) - 1; index >= 0; index-- {
				actual = filepath.Join(actual, missing[index])
			}
			return actual, nil
		}
		if !errors.Is(err, os.ErrNotExist) || filepath.Dir(current) == current {
			return "", err
		}
		missing = append(missing, filepath.Base(current))
		current = filepath.Dir(current)
	}
}

func (r *Runtime) ChildEnvironment() []string { return r.environment() }

type bridgeRequest struct {
	Operation    string                          `json:"operation"`
	AgentID      string                          `json:"agent_id,omitempty"`
	ProjectID    string                          `json:"project_id,omitempty"`
	ProjectRoot  string                          `json:"project_root,omitempty"`
	Command      *app.OrcaCommand                `json:"command,omitempty"`
	Invocation   *app.OrcaInvocation             `json:"invocation,omitempty"`
	Requirements *app.OrcaCapabilityRequirements `json:"requirements,omitempty"`
}

type bridgeResponse struct {
	Scope     *app.OrcaScope          `json:"scope,omitempty"`
	Envelope  *app.OrcaEnvelope       `json:"envelope,omitempty"`
	Error     *app.OrcaNativeError    `json:"error,omitempty"`
	Selection *app.OrcaAgentSelection `json:"selection,omitempty"`
}

func (r *Runtime) environment() []string {
	env := make([]string, 0, 32)
	for _, item := range os.Environ() {
		key, _, _ := strings.Cut(item, "=")
		upper := strings.ToUpper(key)
		if strings.HasPrefix(upper, "ORCA_") || strings.HasPrefix(upper, "PI_") || strings.HasPrefix(upper, "CODEX_") || strings.HasPrefix(upper, "CLAUDE_") || strings.HasPrefix(upper, "OPENCODE_") || strings.HasPrefix(upper, "ANTHROPIC_") || strings.HasPrefix(upper, "SWA_") || strings.HasPrefix(upper, "NODE_") || strings.HasPrefix(upper, "ASTROCYTE_") || upper == "OPENAI_API_KEY" || upper == "HOME" || upper == "USERPROFILE" || upper == "APPDATA" || upper == "LOCALAPPDATA" || upper == "TEMP" || upper == "TMP" {
			continue
		}
		env = append(env, item)
	}
	// 仅转交宿主启动时明确选择的工具链目录；其 JSON 与目录边界由原生工具 policy 核验。
	if roots := os.Getenv("SWA_PROJECT_TOOLCHAIN_ROOTS"); roots != "" {
		env = append(env, "SWA_PROJECT_TOOLCHAIN_ROOTS="+roots)
	}
	return append(env,
		"ORCA_USER_DATA="+r.config.DataRoot,
		"ORCA_USER_DATA_PATH="+r.config.DataRoot,
		"ORCA_TELEMETRY_DISABLED=1",
		"PI_CODING_AGENT_DIR="+filepath.Join(r.config.DataRoot, "pi"),
		"SWA_DATA_DIR="+r.config.DataRoot,
		"SWA_INSTALL_ROOT="+r.config.InstallRoot,
		"SWA_OWNER_CAPABILITY="+r.config.OwnerCapability,
		"SWA_PROTECTED_ROOTS="+strings.Join(r.config.ProtectedRoots, string(filepath.ListSeparator)),
		"SWA_EXECUTABLE="+filepath.Join(r.config.InstallRoot, platformExecutable("swa")),
		"SWA_AGENT_PROFILE="+r.config.AgentProfile,
		"SWA_DISCOVERY_HOME="+r.config.DiscoveryHome,
		"SWA_DISCOVERY_APPDATA="+r.config.DiscoveryAppData,
		"SWA_DISCOVERY_LOCALAPPDATA="+r.config.DiscoveryLocalAppData,
		"SWA_DISCOVERY_CODEX_HOME="+r.config.DiscoveryCodexHome,
		"SWA_CODEX_API_KEY_HOME="+r.config.CodexAPIKeyHome,
		"SWA_CLAUDE_API_KEY_HOME="+r.config.ClaudeAPIKeyHome,
		"SWA_OPENCODE_API_KEY_HOME="+r.config.OpenCodeAPIKeyHome,
		"SWA_DISCOVERY_CLAUDE_HOME="+r.config.DiscoveryClaudeHome,
		"SWA_DISCOVERY_PI_HOME="+r.config.DiscoveryPiHome,
		"SWA_NODE_EXECUTABLE="+r.config.NodeExecutable,
		"HOME="+filepath.Join(r.config.DataRoot, "home"),
		"USERPROFILE="+filepath.Join(r.config.DataRoot, "home"),
		"APPDATA="+filepath.Join(r.config.DataRoot, "home"),
		"LOCALAPPDATA="+filepath.Join(r.config.DataRoot, "home"),
		"TEMP="+filepath.Join(r.config.DataRoot, "temp"),
		"TMP="+filepath.Join(r.config.DataRoot, "temp"),
		"NODE_OPTIONS=--max-old-space-size=1024",
	)
}

func (r *Runtime) call(ctx context.Context, request bridgeRequest, mutation bool) (bridgeResponse, error) {
	var reply bridgeResponse
	body, err := json.Marshal(request)
	if err != nil {
		return reply, err
	}
	cmd := exec.CommandContext(ctx, r.config.NodeExecutable, "--max-old-space-size=1024", r.config.ClientEntry)
	cmd.Dir = r.config.InstallRoot
	cmd.Env = r.environment()
	cmd.Stdin = bytes.NewReader(body)
	cmd.WaitDelay = 5 * time.Second
	configureHiddenProcess(cmd)
	var stdout, stderr boundedBuffer
	responseAction := ""
	if request.Operation == "execute" && request.Invocation != nil {
		responseAction = request.Invocation.Command.Action
	}
	stdout.maximum, stderr.maximum = int(app.OrcaResponseByteLimit(responseAction)), 256*1024
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Start(); err != nil {
		return reply, &apierrors.ServiceError{Code: apierrors.ProviderUnavailable, Message: "the installed native RuntimeClient could not start", RequiredAction: "inspect_product_installation"}
	}
	waitErr := cmd.Wait()
	decode := json.NewDecoder(bytes.NewReader(stdout.Bytes()))
	if request.Operation == "registered_agent" {
		decode.DisallowUnknownFields()
	}
	decodeErr := decode.Decode(&reply)
	if decodeErr == nil {
		var extra any
		if err := decode.Decode(&extra); err != io.EOF {
			decodeErr = errors.New("native client returned trailing data")
		}
	}
	if decodeErr != nil {
		code := apierrors.ProviderUnavailable
		if mutation {
			code = apierrors.DeliveryUnknown
		}
		return reply, &apierrors.ServiceError{Code: code, Message: "native client response unavailable; preserve the original request", RequiredAction: "inspect_original_request"}
	}
	if reply.Error != nil {
		return reply, reply.Error
	}
	if waitErr != nil {
		return reply, &apierrors.ServiceError{Code: apierrors.DeliveryUnknown, Message: "native client exited without a successful transport result", RequiredAction: "inspect_original_request"}
	}
	return reply, nil
}

func (r *Runtime) ResolveScope(ctx context.Context, projectID string, command app.OrcaCommand) (app.OrcaScope, error) {
	response, err := r.call(ctx, bridgeRequest{Operation: "scope", ProjectID: projectID, Command: &command}, false)
	if err != nil {
		return app.OrcaScope{}, err
	}
	if response.Scope == nil {
		return app.OrcaScope{}, &apierrors.ServiceError{Code: apierrors.EvidenceMissing, Message: "native controller scope is unavailable", RequiredAction: "inspect_controller_and_original_request"}
	}
	return *response.Scope, nil
}

func (r *Runtime) Capabilities(ctx context.Context, projectID, projectRoot string, requirements app.OrcaCapabilityRequirements) (app.OrcaEnvelope, error) {
	response, err := r.call(ctx, bridgeRequest{Operation: "capabilities", ProjectID: projectID, ProjectRoot: projectRoot, Requirements: &requirements}, false)
	if err != nil {
		return app.OrcaEnvelope{}, err
	}
	if response.Envelope == nil {
		return app.OrcaEnvelope{}, &apierrors.ServiceError{Code: apierrors.EvidenceMissing, Message: "native capabilities result is unavailable", RequiredAction: "inspect_product_discovery"}
	}
	return *response.Envelope, nil
}

func (r *Runtime) ResolveSelection(ctx context.Context, projectID string, command app.OrcaCommand) (app.OrcaAgentSelection, error) {
	response, err := r.call(ctx, bridgeRequest{Operation: "selection", ProjectID: projectID, Command: &command}, false)
	if err != nil {
		return app.OrcaAgentSelection{}, err
	}
	if response.Selection == nil {
		return app.OrcaAgentSelection{}, &apierrors.ServiceError{Code: apierrors.EvidenceMissing, Message: "native Agent selection is unavailable", RequiredAction: "inspect_selected_agent"}
	}
	return *response.Selection, nil
}

func (r *Runtime) Execute(ctx context.Context, invocation app.OrcaInvocation) (app.OrcaEnvelope, error) {
	mutations := map[string]bool{"controller.open": true, "controller.close": true, "controller.recover": true, "task.create": true, "task.complete": true, "worker.start": true, "worker.send": true, "worker.stop": true, "worker.release": true, "question.answer": true, "question.resume": true}
	response, err := r.call(ctx, bridgeRequest{Operation: "execute", Invocation: &invocation}, mutations[invocation.Command.Action])
	if err != nil {
		if response.Envelope != nil {
			return *response.Envelope, err
		}
		return app.OrcaEnvelope{}, err
	}
	if response.Envelope == nil {
		return app.OrcaEnvelope{}, &apierrors.ServiceError{Code: apierrors.DeliveryUnknown, Message: "native client omitted the original operation result", RequiredAction: "inspect_original_request"}
	}
	return *response.Envelope, nil
}

type boundedBuffer struct {
	bytes.Buffer
	maximum int
}

func (b *boundedBuffer) Write(value []byte) (int, error) {
	if len(value) > b.maximum-b.Len() {
		return 0, errors.New("native client output exceeds the declared bound")
	}
	return b.Buffer.Write(value)
}
