//go:build !windows

package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/agentcli"
)

func TestVerifyACPSessionReopensOnlyNewSession(t *testing.T) {
	bin, scratch := t.TempDir(), t.TempDir()
	t.Setenv("PATH", bin)
	t.Setenv("SWA_AGENT_REGISTRY", "")
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	t.Setenv("SWA_WORKBUDDY_ACCESS_TOKEN", "private-workbuddy-credential")
	t.Setenv("SWA_PROJECT_TOKEN", "private-swa-credential")
	launcher := `#!/bin/sh
[ -z "$SWA_WORKBUDDY_ACCESS_TOKEN" ] && [ -z "$SWA_PROJECT_TOKEN" ] || exit 8
[ "$#" = 5 ] && [ "$1" = "--acp" ] && [ "$2" = "--tools=" ] && [ "$3" = "--strict-mcp-config" ] && [ "$4" = "--setting-sources=" ] && [ "$5" = "--permission-mode=default" ] || exit 2
IFS= read -r init || exit 3
case "$init" in
  *'"method":"initialize"'*) ;;
  *) exit 4;;
esac
printf '%s\n' '{"jsonrpc":"2.0","id":0,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":true}}}'
IFS= read -r session || exit 5
case "$session" in
  *'"method":"session/new"'*'swa-acp-'*'"mcpServers":[]'*)
    printf '%s\n' '{"jsonrpc":"2.0","id":1,"result":{"sessionId":"only-this-session"}}';;
  *'"method":"session/load"'*'swa-acp-'*'"sessionId":"only-this-session"'*)
    printf '%s\n' '{"jsonrpc":"2.0","id":1,"result":{}}';;
  *) exit 6;;
esac
if IFS= read -r unexpected; then exit 7; fi
`
	if err := os.WriteFile(filepath.Join(bin, "qodercli"), []byte(launcher), 0700); err != nil {
		t.Fatal(err)
	}
	var out, stderr bytes.Buffer
	args := []string{"agents", "verify", "qoder", "--scratch", scratch, "--reload", "--json"}
	if got := run(args, strings.NewReader(""), &out, &stderr); got != 0 {
		t.Fatalf("verify exited %d: %s", got, stderr.String())
	}
	var result agentcli.ACPVerification
	if err := json.Unmarshal(out.Bytes(), &result); err != nil || result.ProtocolVersion != 1 || result.SessionNew.State != "passed" || result.SessionLoad.State != "passed" || result.WorkspaceRetained {
		t.Fatalf("unexpected verify output: %s, %v", out.String(), err)
	}
	if strings.Contains(out.String(), "only-this-session") || strings.Contains(out.String(), scratch) {
		t.Fatalf("public report leaked session or filesystem details: %s", out.String())
	}
	// 在Git仓库内不得创建用于诊断的子目录或启动Agent。
	if err := os.WriteFile(filepath.Join(scratch, ".git"), []byte("gitdir: ../other-worktree"), 0600); err != nil {
		t.Fatal(err)
	}
	out.Reset()
	stderr.Reset()
	if got := run(args, strings.NewReader(""), &out, &stderr); got == 0 || out.Len() != 0 {
		t.Fatalf("accepted real repository as scratch: %s", out.String())
	}
}
