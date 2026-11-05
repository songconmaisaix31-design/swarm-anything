package agentcli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/sourcegraph/jsonrpc2"
)

type AgentInfo struct {
	Name    string `json:"name"`
	Title   string `json:"title,omitempty"`
	Version string `json:"version"`
}

type Handshake struct {
	SchemaVersion     int                        `json:"schema_version"`
	AgentID           string                     `json:"agent_id"`
	ProtocolVersion   int                        `json:"protocol_version"`
	AgentInfo         *AgentInfo                 `json:"agent_info,omitempty"`
	AgentCapabilities map[string]json.RawMessage `json:"agent_capabilities,omitempty"`
}

type acpPipe struct {
	io.Reader
	io.WriteCloser
	output io.Closer
}

func (p *acpPipe) Close() error {
	return errors.Join(p.WriteCloser.Close(), p.output.Close())
}

type handshakeClient struct{}

func (handshakeClient) Handle(ctx context.Context, conn *jsonrpc2.Conn, request *jsonrpc2.Request) {
	if request.Notif {
		return
	}
	if request.Method == "session/request_permission" {
		_ = conn.Reply(ctx, request.ID, map[string]any{"outcome": map[string]string{"outcome": "cancelled"}})
		return
	}
	_ = conn.ReplyWithError(ctx, request.ID, &jsonrpc2.Error{Code: jsonrpc2.CodeMethodNotFound, Message: "unsupported during ACP handshake"})
}

func Connect(ctx context.Context, entry Entry, project string) (Handshake, error) {
	if entry.ACPArgs == nil {
		return Handshake{}, errors.New("该 Agent 尚无 ACP 适配器")
	}
	if !filepath.IsAbs(project) {
		return Handshake{}, errors.New("项目目录必须使用绝对路径")
	}
	info, err := os.Stat(project)
	if err != nil {
		return Handshake{}, fmt.Errorf("访问项目目录: %w", err)
	}
	if !info.IsDir() {
		return Handshake{}, errors.New("项目路径必须为目录")
	}
	path, err := Resolve(entry.Command)
	if err != nil {
		return Handshake{}, fmt.Errorf("无法定位已安装的 Agent %s: %w", entry.ID, err)
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	cmd, err := ownedCommand(ctx, path, entry.ACPArgs)
	if err != nil {
		return Handshake{}, err
	}
	cmd.Dir = project
	cmd.Stderr = io.Discard
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return Handshake{}, err
	}
	defer stdin.Close()
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return Handshake{}, err
	}
	defer stdout.Close()
	cleanup, err := startOwned(cmd)
	if err != nil {
		return Handshake{}, fmt.Errorf("启动 Agent %s: %w", entry.ID, err)
	}
	defer cleanup()
	pipe := &acpPipe{Reader: io.LimitReader(stdout, 1<<20), WriteCloser: stdin, output: stdout}
	conn := jsonrpc2.NewConn(ctx, jsonrpc2.NewPlainObjectStream(pipe), handshakeClient{}, jsonrpc2.SetLogger(log.New(io.Discard, "", 0)))
	defer func() {
		_ = conn.Close()
		// 给收到 EOF 的 Agent 留出退出时间，再按所属进程组回收。
		forceStop := time.AfterFunc(500*time.Millisecond, cancel)
		_ = cmd.Wait()
		forceStop.Stop()
	}()
	var response struct {
		ProtocolVersion   int                        `json:"protocolVersion"`
		AgentInfo         *AgentInfo                 `json:"agentInfo"`
		AgentCapabilities map[string]json.RawMessage `json:"agentCapabilities"`
	}
	request := map[string]any{
		"protocolVersion": 1, "clientCapabilities": struct{}{},
		"clientInfo": AgentInfo{Name: "swarm-anything", Version: "0.1.0"},
	}
	if err := conn.Call(ctx, "initialize", request, &response); err != nil {
		if ctx.Err() != nil {
			return Handshake{}, fmt.Errorf("Agent %s ACP 握手中断: %w", entry.ID, ctx.Err())
		}
		var protocolError *jsonrpc2.Error
		if errors.As(err, &protocolError) {
			return Handshake{}, fmt.Errorf("Agent %s 拒绝 ACP initialize，错误码 %d", entry.ID, protocolError.Code)
		}
		return Handshake{}, fmt.Errorf("Agent %s 未返回有效 ACP initialize 响应", entry.ID)
	}
	if response.ProtocolVersion != 1 {
		return Handshake{}, fmt.Errorf("Agent %s 返回不支持的 ACP 协议版本 %d", entry.ID, response.ProtocolVersion)
	}
	return Handshake{
		SchemaVersion: 1, AgentID: entry.ID, ProtocolVersion: response.ProtocolVersion,
		AgentInfo: response.AgentInfo, AgentCapabilities: response.AgentCapabilities,
	}, nil
}
