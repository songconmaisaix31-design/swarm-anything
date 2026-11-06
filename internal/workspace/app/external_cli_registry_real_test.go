package app_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
	_ "modernc.org/sqlite"
)

func TestExternalCLIRegistryRealHumanApproval(t *testing.T) {
	if os.Getenv("SWA_REAL_ENABLED") != "1" {
		t.Skip("需要已授窗口、同安装候选和用户本人完成的实际注册批准")
	}
	endpoint, project := os.Getenv("SWA_ENDPOINT"), os.Getenv("SWA_REAL_REGISTRY_PROJECT_ID")
	token, agent := os.Getenv("SWA_REAL_REGISTRY_PROJECT_TOKEN"), os.Getenv("SWA_REAL_REGISTRY_AGENT")
	if endpoint == "" || project == "" || token == "" || agent == "" || agent == "codex" || agent == "claude" || agent == "pi" || agent == "opencode" {
		t.Fatal("需要旧四CLI之外实际注册ID及用户已批准项目的观察token")
	}
	root := os.Getenv("SWA_REAL_DATA_ROOT")
	if !filepath.IsAbs(root) {
		t.Fatal("需要同安装实际私有数据根")
	}
	root, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatal(err)
	}
	databasePath, err := filepath.EvalSymlinks(filepath.Join(root, "workspace", "state.sqlite"))
	if err != nil || filepath.Clean(databasePath) != filepath.Join(root, "workspace", "state.sqlite") {
		t.Fatal("实际项目SQLite缺失或重定向")
	}
	path := filepath.ToSlash(databasePath)
	if filepath.VolumeName(path) != "" {
		path = "/" + path
	}
	uri := url.URL{Scheme: "file", Path: path, RawQuery: "mode=ro"}
	database, err := sql.Open("sqlite", uri.String())
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	database.SetMaxOpenConns(1)
	client := &http.Client{Timeout: 130 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	readProject := func() domain.LocalProject {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		var data string
		if err := database.QueryRowContext(ctx, "SELECT data FROM local_agent_projects WHERE id=?", project).Scan(&data); err != nil {
			t.Fatal(err)
		}
		var result domain.LocalProject
		if err := json.Unmarshal([]byte(data), &result); err != nil || result.ID != project {
			t.Fatal("实际只读SQLite项目记录不匹配")
		}
		return result
	}
	before := readProject()
	if before.Settings.ExternalModelCLI != agent || before.Settings.Revision < 2 || len(before.Settings.AllowedTools) != 0 {
		t.Fatal("用户实际保存的注册批准或工具限制不符合当前条件")
	}
	request, err := http.NewRequest(http.MethodPost, endpoint+"/api/v1/local-projects/"+url.PathEscape(project)+"/orca/commands", bytes.NewBufferString(`{"action":"capabilities"}`))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	var discovery struct {
		OK        bool   `json:"ok"`
		RuntimeID string `json:"runtime_id"`
		Result    struct {
			Schema string `json:"schema"`
			Agents []struct {
				ID         string `json:"id"`
				Adapter    string `json:"adapter"`
				Registered struct {
					Status string `json:"status"`
				} `json:"registered"`
			} `json:"agents"`
		} `json:"result"`
	}
	decodeErr := json.NewDecoder(io.LimitReader(response.Body, 2*1024*1024)).Decode(&discovery)
	response.Body.Close()
	if decodeErr != nil || response.StatusCode != http.StatusOK || !discovery.OK || discovery.RuntimeID != os.Getenv("SWA_REAL_RUNTIME_ID") || discovery.Result.Schema != "swa.capabilities.v1" {
		t.Fatal("注册批准必须对应同安装实际Native发现")
	}
	found := false
	for _, item := range discovery.Result.Agents {
		if item.ID == agent && item.Adapter != "" && item.Registered.Status == "available" {
			found = true
		}
	}
	if !found {
		t.Fatal("人工批准的ID没有出现在实际Native注册表")
	}
	body, err := json.Marshal(map[string]any{"schema_version": 1, "request_id": uuid.NewString(), "expected_version": 1, "expected_revision": before.Settings.Revision, "settings": before.Settings})
	if err != nil {
		t.Fatal(err)
	}
	request, err = http.NewRequest(http.MethodPut, endpoint+"/api/v1/local-projects/"+url.PathEscape(project)+"/settings", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", uuid.NewString())
	response, err = client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusForbidden {
		t.Fatal("实际Agent bearer修改批准必须拒绝")
	}
	var refusal apierrors.ErrorEnvelope
	if err := json.NewDecoder(io.LimitReader(response.Body, 2*1024*1024)).Decode(&refusal); err != nil || refusal.SchemaVersion != 1 || refusal.Error == nil || refusal.Error.Code != apierrors.ScopeDenied || refusal.Error.Message != "Agent credential requires a current human project grant and permitted operation" {
		t.Fatal("实际拒绝必须来自项目Agent操作权限，不得用依赖失败代替")
	}
	if !reflect.DeepEqual(before, readProject()) {
		t.Fatal("拒绝后实际项目与设置必须保持")
	}
}
