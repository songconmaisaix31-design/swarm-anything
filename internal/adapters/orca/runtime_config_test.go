package orca

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

func TestRuntimeResponseBoundsKeepOrdinaryCallsSmall(t *testing.T) {
	// 这里只测试传输字节，不模拟提供者协议或成功回执。
	payload := bytes.Repeat([]byte("x"), 20*1024*1024)
	for _, action := range []string{"task.result", "run.export", "worker.read", "run.show", "controller.open", ""} {
		t.Run(action, func(t *testing.T) {
			limit := app.OrcaResponseByteLimit(action)
			output := boundedBuffer{maximum: int(limit)}
			n, err := output.Write(payload)
			if action != "task.result" && action != "run.export" {
				if limit != 16*1024*1024 || err == nil || n != 0 || output.Len() != 0 {
					t.Fatal("普通响应超过原16MiB时没有完整拒绝")
				}
				return
			}
			if limit != 128*1024*1024 || err != nil || n != len(payload) || !bytes.Equal(output.Bytes(), payload) {
				t.Fatal("完整成果响应不能保留超过旧界的实际字节")
			}
			chunk := make([]byte, 64*1024)
			for output.Len() < int(limit) {
				if _, err := output.Write(chunk); err != nil {
					t.Fatal(err)
				}
			}
			if n, err := output.Write([]byte{0}); err == nil || n != 0 || output.Len() != int(limit) {
				t.Fatal("完整成果响应超过上限时没有保留完整拒绝语义")
			}
		})
	}
}

func codexSourceConfig(t *testing.T) Config {
	t.Helper()
	root := t.TempDir()
	directory := func(name string) string {
		path := filepath.Join(root, name)
		if err := os.Mkdir(path, 0o700); err != nil {
			t.Fatal(err)
		}
		return path
	}
	config := Config{InstallRoot: directory("install"), DataRoot: directory("data"), DiscoveryHome: directory("home"), AgentProfile: directory("original-profile"), DiscoveryCodexHome: directory("discovery-codex"), DiscoveryClaudeHome: directory("discovery-claude"), ProtectedRoots: []string{directory("protected-account")}}
	// 普通文件只参与配置路径检查，不会作为程序执行。
	ordinary := filepath.Join(config.InstallRoot, "ordinary-path-fixture.txt")
	if err := os.WriteFile(ordinary, []byte("ordinary filesystem metadata fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	config.NodeExecutable, config.ClientEntry = ordinary, ordinary
	t.Setenv("CODEX_HOME", directory("ordinary-codex"))
	t.Setenv("SWA_DISCOVERY_CODEX_HOME", directory("inherited-discovery-codex"))
	t.Setenv("SWA_CODEX_API_KEY_HOME", filepath.Join(root, "unselected-source"))
	t.Setenv("CLAUDE_CONFIG_DIR", directory("ordinary-claude"))
	t.Setenv("SWA_DISCOVERY_CLAUDE_HOME", directory("inherited-discovery-claude"))
	t.Setenv("SWA_CLAUDE_API_KEY_HOME", filepath.Join(root, "unselected-claude-source"))
	return config
}

func TestRuntimeClaudeAPIKeyHomeIsExplicitAndFiltersInheritance(t *testing.T) {
	config := codexSourceConfig(t)
	for _, selected := range []string{"", t.TempDir()} {
		config.ClaudeAPIKeyHome = selected
		native, err := New(config)
		if err != nil {
			t.Fatal(err)
		}
		wanted := selected
		if wanted != "" {
			wanted, err = filepath.EvalSymlinks(wanted)
			if err != nil {
				t.Fatal(err)
			}
		}
		found := 0
		for _, entry := range native.ChildEnvironment() {
			key, value, _ := strings.Cut(entry, "=")
			if strings.EqualFold(key, "SWA_CLAUDE_API_KEY_HOME") {
				found++
				if value != wanted {
					t.Fatal("Claude 子进程来源没有保持显式选择或空配置")
				}
			}
			if strings.EqualFold(key, "CLAUDE_CONFIG_DIR") {
				t.Fatal("子进程继承了普通 Claude 登录目录")
			}
		}
		if found != 1 {
			t.Fatal("Claude 来源环境必须唯一，未配置时仍须传空值")
		}
	}
}

func TestRuntimePassesOnlyExplicitProjectToolchainEnvironment(t *testing.T) {
	config := codexSourceConfig(t)
	roots, err := json.Marshal([]string{t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("SWA_UNSELECTED_RULE_VALUE", "ordinary-filter-rule-input")
	t.Setenv("SWA_OWNER_CAPABILITY", "unselected-owner-rule-input")
	for _, selected := range []string{"", string(roots)} {
		t.Setenv("SWA_PROJECT_TOOLCHAIN_ROOTS", selected)
		native, err := New(config)
		if err != nil {
			t.Fatal(err)
		}
		found := 0
		for _, entry := range native.ChildEnvironment() {
			key, value, _ := strings.Cut(entry, "=")
			if strings.EqualFold(key, "SWA_PROJECT_TOOLCHAIN_ROOTS") {
				found++
				if value != selected {
					t.Fatal("工具链目录没有保留宿主显式选择")
				}
			}
			if strings.EqualFold(key, "SWA_UNSELECTED_RULE_VALUE") || strings.EqualFold(key, "SWA_OWNER_CAPABILITY") && value != config.OwnerCapability {
				t.Fatal("工具链环境传递开放了其他 SWA 环境继承")
			}
		}
		if selected == "" && found != 0 || selected != "" && found != 1 {
			t.Fatal("工具链来源必须只在显式选择时传递一次", found)
		}
	}
}

func TestRuntimeAPIKeyHomesAreMutuallyIsolated(t *testing.T) {
	config := codexSourceConfig(t)
	parent := t.TempDir()
	child := filepath.Join(parent, "child")
	if err := os.Mkdir(child, 0o700); err != nil {
		t.Fatal(err)
	}
	for _, pair := range [][2]string{{parent, parent}, {parent, child}, {child, parent}} {
		config.CodexAPIKeyHome, config.ClaudeAPIKeyHome = pair[0], pair[1]
		if _, err := New(config); err == nil {
			t.Fatal("两个显式来源相同或互相包含却未被拒绝")
		}
	}
	adjacent := parent + "-claude-source"
	if err := os.Mkdir(adjacent, 0o700); err != nil {
		t.Fatal(err)
	}
	config.CodexAPIKeyHome, config.ClaudeAPIKeyHome = parent, adjacent
	if _, err := New(config); err != nil {
		t.Fatalf("独立来源的相邻前缀被误判为重叠: %v", err)
	}
}

func TestRuntimeOpenCodeSourceIsExplicitAndIndependent(t *testing.T) {
	config := codexSourceConfig(t)
	t.Setenv("SWA_OPENCODE_API_KEY_HOME", filepath.Join(t.TempDir(), "inherited-unselected"))
	t.Setenv("OPENCODE_AUTH_CONTENT", "ordinary-environment-filter-marker")
	for _, selected := range []string{"", t.TempDir()} {
		config.OpenCodeAPIKeyHome = selected
		native, err := New(config)
		if err != nil {
			t.Fatal(err)
		}
		found := 0
		for _, entry := range native.ChildEnvironment() {
			key, value, _ := strings.Cut(entry, "=")
			if strings.EqualFold(key, "SWA_OPENCODE_API_KEY_HOME") {
				found++
				if value != selected {
					t.Fatal("OpenCode 来源没有保持显式选择")
				}
			}
			if strings.HasPrefix(strings.ToUpper(key), "OPENCODE_") {
				t.Fatal("继承了未审核 OpenCode 覆盖")
			}
		}
		if found != 1 {
			t.Fatal("OpenCode 来源环境必须唯一")
		}
	}
	parent := t.TempDir()
	child := filepath.Join(parent, "child")
	if err := os.Mkdir(child, 0o700); err != nil {
		t.Fatal(err)
	}
	for _, source := range []string{parent, child} {
		for _, other := range []string{parent, child} {
			for _, provider := range []string{"codex", "claude"} {
				input := config
				input.OpenCodeAPIKeyHome = source
				if provider == "codex" {
					input.CodexAPIKeyHome = other
				} else {
					input.ClaudeAPIKeyHome = other
				}
				if _, err := New(input); err == nil {
					t.Fatal("OpenCode 与其他显式来源重叠却未拒绝")
				}
			}
		}
	}
}

func TestRuntimeClaudeAPIKeyHomeRejectsOrdinaryAndDefaultAccountRoots(t *testing.T) {
	config := codexSourceConfig(t)
	for _, source := range []string{os.Getenv("CLAUDE_CONFIG_DIR"), config.DiscoveryClaudeHome, os.Getenv("SWA_DISCOVERY_CLAUDE_HOME"), config.DiscoveryHome, os.Getenv("CODEX_HOME"), config.DiscoveryCodexHome} {
		config.ClaudeAPIKeyHome = source
		if _, err := New(config); err == nil {
			t.Fatal("Claude 显式来源与已知普通、发现或默认账户目录重叠却未拒绝")
		}
	}
}

func TestRuntimeCodexAPIKeyHomeIsExplicitAndFiltersInheritance(t *testing.T) {
	config := codexSourceConfig(t)
	for _, selected := range []string{"", t.TempDir()} {
		config.CodexAPIKeyHome = selected
		native, err := New(config)
		if err != nil {
			t.Fatal(err)
		}
		wanted := selected
		if wanted != "" {
			wanted, err = filepath.EvalSymlinks(wanted)
			if err != nil {
				t.Fatal(err)
			}
		}
		found := 0
		for _, entry := range native.ChildEnvironment() {
			key, value, _ := strings.Cut(entry, "=")
			if strings.EqualFold(key, "SWA_CODEX_API_KEY_HOME") {
				found++
				if value != wanted {
					t.Fatal("子进程未保留显式来源，或缺省采用了继承来源")
				}
			}
			if strings.EqualFold(key, "CODEX_HOME") {
				t.Fatal("子进程继承了普通 Codex 登录目录")
			}
		}
		if found != 1 {
			t.Fatal("显式来源环境必须只有一个条目，未配置时仍须传空值")
		}
	}
}

func TestRuntimeCodexAPIKeyHomeRejectsInvalidAndOverlappingPaths(t *testing.T) {
	config := codexSourceConfig(t)
	root := filepath.Dir(config.InstallRoot)
	file := filepath.Join(root, "ordinary-file.txt")
	if err := os.WriteFile(file, []byte("ordinary metadata fixture"), 0o600); err != nil {
		t.Fatal(err)
	}
	child := filepath.Join(config.ProtectedRoots[0], "child")
	if err := os.Mkdir(child, 0o700); err != nil {
		t.Fatal(err)
	}
	for name, source := range map[string]string{
		"relative": "relative-source", "missing": filepath.Join(root, "missing"), "file": file,
		"install-equal": config.InstallRoot, "data-equal": config.DataRoot, "profile-equal": config.AgentProfile,
		"source-ancestor": root, "source-descendant": child, "protected-equal": config.ProtectedRoots[0],
		"ordinary-codex": os.Getenv("CODEX_HOME"), "discovery-codex": config.DiscoveryCodexHome,
		"inherited-discovery-codex": os.Getenv("SWA_DISCOVERY_CODEX_HOME"), "default-codex-ancestor": config.DiscoveryHome,
	} {
		t.Run(name, func(t *testing.T) {
			input := config
			input.CodexAPIKeyHome = source
			if _, err := New(input); err == nil {
				t.Fatal("非法或重叠的显式来源没有在启动子进程前拒绝")
			}
		})
	}
	adjacent := config.ProtectedRoots[0] + "-source"
	if err := os.Mkdir(adjacent, 0o700); err != nil {
		t.Fatal(err)
	}
	config.CodexAPIKeyHome = adjacent
	if _, err := New(config); err != nil {
		t.Fatalf("相邻前缀目录被误判为重叠: %v", err)
	}
}

func TestRuntimeCodexAPIKeyHomeRejectsLinkedSourceAndAncestor(t *testing.T) {
	config := codexSourceConfig(t)
	target := t.TempDir()
	child := filepath.Join(target, "plain")
	if err := os.Mkdir(child, 0o700); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(filepath.Dir(config.InstallRoot), "linked-source")
	if err := os.Symlink(target, link); err != nil {
		if runtime.GOOS == "windows" {
			t.Skip("当前 Windows 用户没有创建本测试符号链接的权限，实际 reparse 验证未执行")
		}
		t.Fatal(err)
	}
	for _, source := range []string{link, filepath.Join(link, "plain")} {
		config.CodexAPIKeyHome = source
		if _, err := New(config); err == nil {
			t.Fatal("显式来源经过符号链接却未被拒绝")
		}
	}
}

func TestRuntimeCodexAPIKeyHomeUsesPlatformCaseSemantics(t *testing.T) {
	config := codexSourceConfig(t)
	source := filepath.Join(filepath.Dir(config.InstallRoot), "CaseSource")
	if err := os.Mkdir(source, 0o700); err != nil {
		t.Fatal(err)
	}
	config.CodexAPIKeyHome = source
	config.DiscoveryCodexHome = filepath.Join(filepath.Dir(source), "casesource")
	_, err := New(config)
	if (err != nil) != (runtime.GOOS == "windows") {
		t.Fatal("来源重叠检查没有使用当前平台的大小写规则")
	}
}
