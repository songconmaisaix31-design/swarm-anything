//go:build live_acp

package agentcli

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/sourcegraph/jsonrpc2"
)

const liveACPMarker = "SWA_ACP_SMOKE_OK"

// 默认跳过；仅用于已从官方 CLI 登录的操作者主动验证一次固定文本响应。
func TestOfficialACPModelLive(t *testing.T) {
	if os.Getenv("SWA_LIVE_ALLOW_MODEL") != "1" {
		t.Skip("未明确允许真实模型调用")
	}
	id := os.Getenv("SWA_LIVE_AGENT")
	expectedVersion := ""
	switch id {
	case "qoder", "qoder-cn":
		expectedVersion = "1.1.90"
	case "codebuddy":
		expectedVersion = "2.184.0"
	default:
		t.Fatal("SWA_LIVE_AGENT 只支持 qoder、qoder-cn 或 codebuddy")
	}
	entry := builtinEntry(t, id)
	entry, project, err := prepareACPVerification(entry, os.Getenv("SWA_LIVE_SCRATCH"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.Remove(project); err != nil {
			t.Logf("测试目录仍有文件，保留目录名 %s", filepath.Base(project))
		}
	})
	t.Chdir(project)
	probe, cancel := context.WithTimeout(t.Context(), 8*time.Second)
	version, versionErr := Probe(probe, entry.Command, "--version")
	cancel()
	match := VersionPattern.FindStringSubmatch(version)
	if versionErr != nil || len(match) < 2 || match[1] != expectedVersion {
		t.Fatalf("需要安装已核实的 %s %s；未发送提示词", id, expectedVersion)
	}

	liveContext, stop := context.WithCancel(t.Context())
	defer stop()
	observer := &liveACPObserver{stop: stop}
	newState := "not_attempted"
	var promptEnded bool
	_, err = useACPWithHandler(liveContext, entry, project, 75*time.Second, observer, func(ctx context.Context, conn *jsonrpc2.Conn, _ Handshake) {
		var created acpSessionResult
		check := sessionCall(ctx, conn, "session/new", map[string]any{"cwd": project, "mcpServers": []any{}}, &created, "")
		newState = check.State
		if check.State != "passed" || !observer.begin(created.SessionID) {
			return
		}
		var result struct {
			StopReason string `json:"stopReason"`
		}
		params := map[string]any{
			"sessionId": created.SessionID,
			"prompt": []map[string]string{{
				"type": "text",
				"text": "Reply with exactly " + liveACPMarker + ". Do not use any tool or include other text.",
			}},
		}
		// 不重试任何提交；响应不完整或超时不能证明本次未消耗额度。
		promptEnded = conn.Call(ctx, "session/prompt", params, &result) == nil && result.StopReason == "end_turn"
		observer.end()
	})
	if got := observer.failure(); got != "" {
		t.Fatal(got)
	}
	if err != nil {
		t.Fatal("未完成 ACP 握手，未获得模型执行证据")
	}
	if newState != "passed" {
		t.Fatalf("未建立空白会话：%s；未发送提示词", newState)
	}
	if !promptEnded {
		t.Fatal("原提示请求未返回 end_turn；执行和额度结果无法确认，未重试")
	}
	if !observer.markerMatched() {
		t.Fatal("原会话的文本响应未匹配固定验收标记")
	}
	t.Logf("%s %s：ACP v1 固定文本单轮通过；未观察到请求或调用工具", id, expectedVersion)
}

type liveACPObserver struct {
	mu         sync.Mutex
	stop       context.CancelFunc
	sessionID  string
	messageID  string
	collecting bool
	text       strings.Builder
	problem    string
}

func (o *liveACPObserver) fail(message string) {
	if o.problem == "" {
		o.problem = message
	}
}

func (o *liveACPObserver) begin(sessionID string) bool {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.sessionID != "" && o.sessionID != sessionID {
		o.fail("会话创建返回的身份与通知身份不一致")
	}
	if o.problem != "" {
		return false
	}
	o.sessionID, o.collecting = sessionID, true
	return true
}

func (o *liveACPObserver) end() {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.collecting = false
}

func (o *liveACPObserver) failure() string {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.problem
}

func (o *liveACPObserver) markerMatched() bool {
	o.mu.Lock()
	defer o.mu.Unlock()
	return strings.TrimSpace(o.text.String()) == liveACPMarker
}

func (o *liveACPObserver) Handle(ctx context.Context, conn *jsonrpc2.Conn, request *jsonrpc2.Request) {
	if !request.Notif {
		o.mu.Lock()
		o.fail("Agent 向客户端发起了请求；固定文本验收不委托工具或许可")
		o.mu.Unlock()
		handshakeClient{}.Handle(ctx, conn, request)
		o.stop()
		return
	}
	if request.Method != "session/update" {
		if strings.HasPrefix(request.Method, "fs/") || strings.HasPrefix(request.Method, "terminal/") || request.Method == "session/request_permission" {
			o.mu.Lock()
			o.fail("Agent 发出了不适用于固定文本验收的工具通知")
			o.mu.Unlock()
			o.stop()
		}
		return
	}
	var event struct {
		SessionID string `json:"sessionId"`
		Update    struct {
			Kind      string `json:"sessionUpdate"`
			MessageID string `json:"messageId"`
			ToolCall  string `json:"toolCallId"`
			Content   struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"update"`
	}
	o.mu.Lock()
	defer func() {
		if o.problem != "" {
			o.stop()
		}
		o.mu.Unlock()
	}()
	if request.Params == nil || json.Unmarshal(*request.Params, &event) != nil || event.SessionID == "" || event.Update.Kind == "" {
		o.fail("收到无法验证的 ACP 会话通知")
		return
	}
	if o.sessionID != "" && event.SessionID != o.sessionID {
		o.fail("收到另一会话的通知")
		return
	}
	o.sessionID = event.SessionID
	if event.Update.ToolCall != "" {
		o.fail("收到工具调用或调用进度事件")
		return
	}
	switch event.Update.Kind {
	case "tool_call", "tool_call_update":
		o.fail("收到工具调用或调用进度事件")
	case "agent_message_chunk":
		if !o.collecting || event.Update.Content.Type != "text" || len(event.Update.Content.Text) > 4096-o.text.Len() {
			o.fail("收到超出固定文本验收范围的助手事件")
			return
		}
		if id := event.Update.MessageID; id != "" {
			if o.messageID != "" && o.messageID != id {
				o.fail("固定文本验收需由一条助手消息完成")
				return
			}
			o.messageID = id
		}
		o.text.WriteString(event.Update.Content.Text)
	}
}
