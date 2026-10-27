package main

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/sqlitebase"
)

func TestSWACompositionRejectsRelativeOpenCodeSourceBeforeRegistry(t *testing.T) {
	// 只有普通空目录；非法来源须在任何外部 registry 调用前失败。
	root := t.TempDir()
	for _, name := range []string{"node", "runtime"} {
		if err := os.Mkdir(filepath.Join(root, name), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	node := "node"
	if runtime.GOOS == "windows" {
		node += ".exe"
	}
	for _, file := range []string{filepath.Join(root, "node", node), filepath.Join(root, "runtime", "client.cjs")} {
		if err := os.WriteFile(file, []byte("ordinary path fixture; never executed"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	for key, value := range map[string]string{"SWA_INSTALL_ROOT": root, "SWA_DATA_DIR": t.TempDir(), "SWA_OPENCODE_API_KEY_HOME": "relative-source", "SWA_CODEX_API_KEY_HOME": "", "SWA_CLAUDE_API_KEY_HOME": "", "SWA_AGENT_PROFILE": "", "SWA_DISCOVERY_HOME": t.TempDir(), "SWA_PROTECTED_ROOTS": t.TempDir()} {
		t.Setenv(key, value)
	}
	if _, err := composeExecution(nil, nil); err == nil || !strings.Contains(err.Error(), "explicit native API-key source home") {
		t.Fatal("服务 composition 未在准确来源检查拒绝相对路径", err)
	}
}

func TestSWAActualCompositionListenerAndShutdown(t *testing.T) {
	root := t.TempDir()
	for key, value := range map[string]string{"SWA_INSTALL_ROOT": "", "SWA_DATA_DIR": root, "SWA_PORT": "0", "ASTROCYTE_PORT": "", "SWA_WEB_DIR": "", "ASTROCYTE_WEB_DIR": "", "SWA_ALLOWED_ORIGIN": ""} {
		t.Setenv(key, value)
	}
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	original := os.Stdout
	os.Stdout = writer
	ctx, cancel := context.WithCancel(context.Background())
	type listenerAnnouncement struct {
		Type   string `json:"type"`
		APIURL string `json:"api_url"`
	}
	type announcementResult struct {
		value listenerAnnouncement
		err   error
	}
	announcementReady := make(chan announcementResult, 1)
	readerExited, serviceExited := make(chan struct{}), make(chan struct{})
	var serviceErr error
	defer func() {
		cancel()
		_ = reader.Close()
		_ = writer.Close()
		timer := time.NewTimer(10 * time.Second)
		defer timer.Stop()
		for _, exited := range []<-chan struct{}{readerExited, serviceExited} {
			select {
			case <-exited:
			case <-timer.C:
				// 未确认退出时终止本次测试进程，不让异步服务污染后续测试。
				panic("actual composed service cleanup did not finish")
			}
		}
		os.Stdout = original
		if serviceErr != nil {
			t.Errorf("actual composed service exit: %v", serviceErr)
		}
	}()
	go func() {
		defer close(readerExited)
		var value listenerAnnouncement
		err := json.NewDecoder(reader).Decode(&value)
		announcementReady <- announcementResult{value: value, err: err}
	}()
	go func() {
		defer close(serviceExited)
		serviceErr = runProduct(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)))
	}()
	var announcement listenerAnnouncement
	select {
	case result := <-announcementReady:
		if result.err != nil {
			t.Fatal("actual listener announcement", result.err)
		}
		announcement = result.value
	case <-serviceExited:
		t.Fatal("actual service exited before its listener announcement", serviceErr)
	case <-time.After(10 * time.Second):
		t.Fatal("actual listener announcement timed out")
	}
	if announcement.Type != "http_listening" || announcement.APIURL == "" {
		t.Fatal("missing actual listener address")
	}
	client := &http.Client{Timeout: 10 * time.Second}
	defer client.CloseIdleConnections()
	response, err := client.Get(announcement.APIURL + "/api/v1/health")
	if err != nil {
		t.Fatal(err)
	}
	var health map[string]any
	err = json.NewDecoder(response.Body).Decode(&health)
	response.Body.Close()
	if err != nil || response.StatusCode != 200 || health["service"] != "astrocyte" {
		t.Fatal("actual composed health", err)
	}
	cancel()
	select {
	case <-serviceExited:
		if serviceErr != nil {
			t.Fatal(serviceErr)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("actual service failed to shut down")
	}
	address := announcement.APIURL[len("http://"):]
	if conn, err := net.DialTimeout("tcp", address, time.Second); err == nil {
		conn.Close()
		t.Fatal("owned HTTP listener survived shutdown")
	}
	db, err := sqlitebase.Open(filepath.Join(root, "workspace", "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var count int
	if err := db.Conn().QueryRow("SELECT COUNT(*) FROM local_agent_sessions").Scan(&count); err != nil || count != 0 {
		t.Fatal("metadata startup created a native session", err)
	}
}

func TestSWAPortCompatibilityRejectsConflictingConfiguration(t *testing.T) {
	t.Setenv("SWA_PORT", "12345")
	t.Setenv("ASTROCYTE_PORT", "12346")
	if _, err := compatibleEnv("SWA_PORT", "ASTROCYTE_PORT"); err == nil {
		t.Fatal("conflicting owner and direct port accepted")
	}
	t.Setenv("SWA_PORT", "")
	if value, err := compatibleEnv("SWA_PORT", "ASTROCYTE_PORT"); err != nil || value != "12346" {
		t.Fatal("installed owner compatibility port lost", err)
	}
}
