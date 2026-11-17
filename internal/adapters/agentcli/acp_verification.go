package agentcli

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/sourcegraph/jsonrpc2"
)

type ACPCheck struct {
	State     string `json:"state"`
	ErrorCode *int64 `json:"error_code,omitempty"`
}

type ACPVerification struct {
	SchemaVersion     int      `json:"schema_version"`
	AgentID           string   `json:"agent_id"`
	ProtocolVersion   int      `json:"protocol_version"`
	SessionNew        ACPCheck `json:"session_new"`
	SessionLoad       ACPCheck `json:"session_load"`
	WorkspaceRetained bool     `json:"workspace_retained"`
	WorkspaceName     string   `json:"workspace_name,omitempty"`
}

type acpSessionResult struct {
	SessionID string `json:"sessionId"`
}

func sessionCall(ctx context.Context, conn *jsonrpc2.Conn, method string, args map[string]any, dst *acpSessionResult, expectedID string) ACPCheck {
	var result json.RawMessage
	if err := conn.Call(ctx, method, args, &result); err != nil {
		var rpc *jsonrpc2.Error
		if errors.As(err, &rpc) {
			code := rpc.Code
			state := "rejected"
			switch code {
			case -32000:
				state = "authentication_required"
			case jsonrpc2.CodeMethodNotFound:
				state = "unsupported"
			}
			return ACPCheck{State: state, ErrorCode: &code}
		}
		return ACPCheck{State: "unknown"}
	}
	if len(result) < 2 || result[0] != '{' || json.Unmarshal(result, dst) != nil {
		return ACPCheck{State: "unknown"}
	}
	id := dst.SessionID
	if method == "session/new" && (id == "" || len(id) > 512 || strings.TrimSpace(id) != id || strings.ContainsAny(id, "\x00\r\n")) ||
		method == "session/load" && id != "" && id != expectedID {
		return ACPCheck{State: "unknown"}
	}
	return ACPCheck{State: "passed"}
}

func supportsACPLoad(handshake Handshake) bool {
	var load bool
	return json.Unmarshal(handshake.AgentCapabilities["loadSession"], &load) == nil && load
}

func outsideGitWorkspace(dir string) bool {
	for {
		marker := filepath.Join(dir, ".git")
		info, err := os.Lstat(marker)
		if err == nil && info.IsDir() {
			// Git 工作树的目录标记需要 HEAD；平台空占位目录不视作工作树。
			_, err = os.Lstat(filepath.Join(marker, "HEAD"))
		}
		if !errors.Is(err, os.ErrNotExist) {
			return false
		}
		if parent := filepath.Dir(dir); parent != dir {
			dir = parent
		} else {
			return true
		}
	}
}

func prepareACPVerification(entry Entry, scratch string) (Entry, string, error) {
	switch entry.ID {
	case "qoder", "qoder-cn", "trae", "codebuddy":
	default:
		return Entry{}, "", errors.New("该 Agent 不支持空白会话诊断")
	}
	if !filepath.IsAbs(scratch) {
		return Entry{}, "", errors.New("测试目录的父目录必须使用绝对路径")
	}
	root, err := filepath.EvalSymlinks(scratch)
	if err != nil {
		return Entry{}, "", errors.New("无法访问测试目录的父目录")
	}
	// 一些提供方从祖先仓库加载项目配置。临时目录也不能放在实际仓库内。
	if !outsideGitWorkspace(root) {
		return Entry{}, "", errors.New("空白会话检查需要 Git 仓库外的测试目录")
	}
	path, err := ResolveEntry(entry)
	if err != nil {
		return Entry{}, "", errors.New("未找到可用的 Agent CLI")
	}
	entry.Command, entry.aliases, entry.defaultPaths = path, nil, nil
	switch entry.ID {
	case "qoder", "qoder-cn", "codebuddy":
		entry.ACPArgs = append(append([]string(nil), entry.ACPArgs...), "--tools=", "--strict-mcp-config", "--setting-sources=", "--permission-mode=default")
	}
	project, err := os.MkdirTemp(root, "swa-acp-")
	if err != nil {
		return Entry{}, "", errors.New("无法创建空白测试目录")
	}
	return entry, project, nil
}

// VerifyACPSession 只创建一条测试会话；不发送提示词，也不打开任何已有会话。
func VerifyACPSession(ctx context.Context, entry Entry, scratch string, reload bool) (reply ACPVerification, err error) {
	entry, project, err := prepareACPVerification(entry, scratch)
	if err != nil {
		return reply, err
	}
	defer func() {
		// 只删除该进程创建的空目录；客户端写入的文件留给用户检查。
		reply.WorkspaceRetained = os.Remove(project) != nil
		if reply.WorkspaceRetained {
			reply.WorkspaceName = filepath.Base(project)
		}
	}()
	reply = ACPVerification{SchemaVersion: 1, AgentID: entry.ID,
		SessionNew: ACPCheck{State: "unknown"}, SessionLoad: ACPCheck{State: "not_requested"}}
	args := map[string]any{"cwd": project, "mcpServers": []any{}}
	var created acpSessionResult
	first, err := useACP(ctx, entry, project, func(ctx context.Context, conn *jsonrpc2.Conn, _ Handshake) {
		reply.SessionNew = sessionCall(ctx, conn, "session/new", args, &created, "")
	})
	if err != nil {
		return reply, err
	}
	reply.ProtocolVersion = first.ProtocolVersion
	if !reload {
		return reply, nil
	}
	switch {
	case reply.SessionNew.State != "passed":
		reply.SessionLoad.State = "not_attempted"
	case !supportsACPLoad(first):
		reply.SessionLoad.State = "unsupported"
	default:
		reply.SessionLoad.State = "unknown"
		args["sessionId"] = created.SessionID
		_, _ = useACP(ctx, entry, project, func(ctx context.Context, conn *jsonrpc2.Conn, second Handshake) {
			if !supportsACPLoad(second) {
				reply.SessionLoad.State = "unsupported"
				return
			}
			var loaded acpSessionResult
			reply.SessionLoad = sessionCall(ctx, conn, "session/load", args, &loaded, created.SessionID)
		})
	}
	return reply, nil
}
