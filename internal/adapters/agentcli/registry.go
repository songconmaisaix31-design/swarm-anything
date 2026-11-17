package agentcli

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

type Entry struct {
	ID          string   `json:"id"`
	DisplayName string   `json:"display_name"`
	Command     string   `json:"command"`
	ACPArgs     []string `json:"acp_args"`

	aliases          []string
	defaultPaths     func() []string
	skipVersionProbe bool
}

func LegacyEntries() []Entry {
	return []Entry{
		{ID: "codex", DisplayName: "Codex", Command: "codex"},
		{ID: "claude", DisplayName: "Claude Code", Command: "claude"},
		{ID: "opencode", DisplayName: "OpenCode", Command: "opencode", ACPArgs: []string{"acp"}},
		{ID: "pi", DisplayName: "Pi", Command: "pi"},
		{ID: "grok", DisplayName: "Grok", Command: "grok", ACPArgs: []string{"--no-auto-update", "agent", "stdio"}},
		{ID: "kimi", DisplayName: "Kimi CLI / Kimi Code", Command: "kimi", ACPArgs: []string{"acp"}},
		{ID: "qwen", DisplayName: "Qwen Code", Command: "qwen", ACPArgs: []string{"--acp"}},
		{ID: "cursor", DisplayName: "Cursor", Command: "cursor"},
		{ID: "gemini", DisplayName: "Gemini CLI", Command: "gemini", ACPArgs: []string{"--acp"}},
		{ID: "cursor-agent", DisplayName: "Cursor Agent", Command: "cursor-agent", ACPArgs: []string{"acp"}},
	}
}

func builtinEntries() []Entry {
	return append(LegacyEntries(),
		Entry{ID: "dsh", DisplayName: "DeepSeek Harness", Command: "dsh", ACPArgs: []string{"--profile", "acp"}},
		Entry{ID: "muse", DisplayName: "Muse Code", Command: "muse", ACPArgs: []string{"acp"}},
		Entry{ID: "qoder", DisplayName: "Qoder", Command: "qodercli", ACPArgs: []string{"--acp"}, aliases: []string{"qoder"}},
		Entry{ID: "qoder-cn", DisplayName: "Qoder CN", Command: "qoderclicn", ACPArgs: []string{"--acp"}, aliases: []string{"qodercn"}},
		Entry{ID: "trae", DisplayName: "TRAE CN", Command: "traecli", ACPArgs: []string{"acp", "serve"}},
		Entry{ID: "codebuddy", DisplayName: "CodeBuddy Code", Command: "codebuddy", ACPArgs: []string{"--acp"}},
		Entry{ID: "workbuddy", DisplayName: "WorkBuddy"},
		Entry{ID: "tabbit", DisplayName: "Tabbit", Command: "tabbit-cli", defaultPaths: tabbitDefaultPaths, skipVersionProbe: true},
		Entry{ID: "kiro", DisplayName: "Kiro CLI", Command: "kiro-cli", ACPArgs: []string{"acp", "--agent-engine=v3"}},
		Entry{ID: "goose", DisplayName: "Goose", Command: "goose", ACPArgs: []string{"acp"}},
		Entry{ID: "copilot", DisplayName: "GitHub Copilot CLI", Command: "copilot", ACPArgs: []string{"--acp"}},
		Entry{ID: "cline", DisplayName: "Cline CLI", Command: "cline", ACPArgs: []string{"--acp"}},
		Entry{ID: "mistral-vibe", DisplayName: "Mistral Vibe", Command: "vibe-acp", ACPArgs: []string{}},
		Entry{ID: "autohand", DisplayName: "Autohand", Command: "autohand", ACPArgs: []string{"--acp"}},
		Entry{ID: "junie", DisplayName: "Junie CLI", Command: "junie", ACPArgs: []string{"--acp=true"}},
		Entry{ID: "minimax", DisplayName: "MiniMax Code", Command: "mcode", ACPArgs: []string{"acp"}},
		Entry{ID: "antigravity", DisplayName: "Antigravity CLI", Command: "agy", ACPArgs: []string{"acp"}},
	)
}

var entryID = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,47}$`)
var errUnverifiedCLI = errors.New("尚未核实此 Agent 的官方 CLI")

func LoadRegistry() ([]Entry, error) {
	path := os.Getenv("SWA_AGENT_REGISTRY")
	explicit := path != ""
	if !explicit {
		config, err := os.UserConfigDir()
		if err != nil {
			return nil, err
		}
		path = filepath.Join(config, "swarm", "agents.json")
	}
	if !filepath.IsAbs(path) {
		return nil, errors.New("Agent 登记文件必须使用绝对路径")
	}
	entries := builtinEntries()
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) && !explicit {
		return entries, nil
	}
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > 64*1024 {
		return nil, errors.New("Agent 登记文件必须为 64 KiB 以内的常规文件")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	info, err = file.Stat()
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > 64*1024 {
		return nil, errors.New("Agent 登记文件必须为 64 KiB 以内的常规文件")
	}
	decoder := json.NewDecoder(io.LimitReader(file, 64*1024+1))
	decoder.DisallowUnknownFields()
	var document struct {
		SchemaVersion int     `json:"schema_version"`
		Agents        []Entry `json:"agents"`
	}
	if err := decoder.Decode(&document); err != nil {
		return nil, fmt.Errorf("解析 Agent 登记文件: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, errors.New("Agent 登记文件只能包含一个 JSON 对象")
	}
	if document.SchemaVersion != 1 || document.Agents == nil || len(document.Agents) > 32 {
		return nil, errors.New("Agent 登记文件需要 schema_version 1 和最多 32 个条目")
	}
	seen := make(map[string]bool, len(entries)+len(document.Agents))
	for _, entry := range entries {
		seen[entry.ID] = true
	}
	for _, entry := range document.Agents {
		if !entryID.MatchString(entry.ID) || seen[entry.ID] || strings.TrimSpace(entry.DisplayName) == "" || len(entry.DisplayName) > 128 || !filepath.IsAbs(entry.Command) || unsafePath(entry.Command) || entry.ACPArgs == nil || len(entry.ACPArgs) > 16 {
			return nil, fmt.Errorf("无效或重复的 ACP Agent 条目 %q", entry.ID)
		}
		for _, arg := range entry.ACPArgs {
			if len(arg) > 256 || strings.ContainsAny(arg, "\x00\r\n") {
				return nil, fmt.Errorf("无效的 ACP Agent 参数 %q", entry.ID)
			}
		}
		seen[entry.ID] = true
		entries = append(entries, entry)
	}
	return entries, nil
}

func Resolve(command string) (string, error) {
	path, err := exec.LookPath(command)
	if err != nil {
		return "", err
	}
	if !filepath.IsAbs(path) || unsafePath(path) {
		return "", errors.New("Agent 可执行文件需要可信的绝对路径")
	}
	return path, nil
}

// ResolveEntry 只在命令不存在时继续查同一 Agent 的候选入口。
func ResolveEntry(entry Entry) (string, error) {
	return resolveEntry(entry, Resolve)
}

func resolveEntry(entry Entry, lookup func(string) (string, error)) (string, error) {
	if entry.Command == "" {
		return "", errUnverifiedCLI
	}
	path, err := lookup(entry.Command)
	if err == nil || !cliNotFound(err) {
		return path, err
	}
	candidates := entry.aliases
	if entry.defaultPaths != nil {
		candidates = append(append([]string(nil), candidates...), entry.defaultPaths()...)
	}
	for _, candidate := range candidates {
		path, err := lookup(candidate)
		if err == nil || !cliNotFound(err) {
			return path, err
		}
	}
	return "", err
}

func cliNotFound(err error) bool {
	return errors.Is(err, exec.ErrNotFound) || errors.Is(err, os.ErrNotExist)
}

func agentCLIEnvironment() []string {
	values := os.Environ()
	result := make([]string, 0, len(values))
	for _, value := range values {
		key, _, _ := strings.Cut(value, "=")
		if !strings.HasPrefix(strings.ToUpper(key), "SWA_") {
			result = append(result, value)
		}
	}
	return result
}

func tabbitDefaultPaths() []string {
	if runtime.GOOS == "windows" {
		if root := os.Getenv("LOCALAPPDATA"); filepath.IsAbs(root) {
			return []string{filepath.Join(root, "Tabbit", "LocalAgent", "bin", "tabbit-cli.exe")}
		}
		return nil
	}
	if home, err := os.UserHomeDir(); err == nil && filepath.IsAbs(home) {
		return []string{filepath.Join(home, ".local", "bin", "tabbit-cli")}
	}
	return nil
}

func unsafePath(path string) bool {
	return strings.ContainsAny(path, "\x00\r\n\"%&|^<>!")
}
