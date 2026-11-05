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
	"strings"
)

type Entry struct {
	ID          string   `json:"id"`
	DisplayName string   `json:"display_name"`
	Command     string   `json:"command"`
	ACPArgs     []string `json:"acp_args"`
}

func LegacyEntries() []Entry {
	return []Entry{
		{ID: "codex", DisplayName: "Codex", Command: "codex"},
		{ID: "claude", DisplayName: "Claude Code", Command: "claude"},
		{ID: "opencode", DisplayName: "OpenCode", Command: "opencode", ACPArgs: []string{"acp"}},
		{ID: "pi", DisplayName: "Pi", Command: "pi"},
		{ID: "grok", DisplayName: "Grok", Command: "grok", ACPArgs: []string{"--no-auto-update", "agent", "stdio"}},
		{ID: "kimi", DisplayName: "Kimi Code", Command: "kimi"},
		{ID: "qwen", DisplayName: "Qwen Code", Command: "qwen"},
		{ID: "cursor", DisplayName: "Cursor", Command: "cursor"},
		{ID: "gemini", DisplayName: "Gemini CLI", Command: "gemini"},
		{ID: "cursor-agent", DisplayName: "Cursor Agent", Command: "cursor-agent"},
	}
}

func builtinEntries() []Entry {
	return append(LegacyEntries(),
		Entry{ID: "dsh", DisplayName: "DeepSeek Harness", Command: "dsh", ACPArgs: []string{"--profile", "acp"}},
		Entry{ID: "muse", DisplayName: "Muse Code", Command: "muse"},
	)
}

var entryID = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,47}$`)

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

func unsafePath(path string) bool {
	return strings.ContainsAny(path, "\x00\r\n\"%&|^<>!")
}
