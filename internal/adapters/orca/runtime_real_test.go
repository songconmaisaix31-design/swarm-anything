package orca

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

func TestOrcaCLIRealPrivateRuntimeScope(t *testing.T) {
	if os.Getenv("SWA_REAL_ENABLED") != "1" {
		t.Skip("真实链路须在已授窗口和同安装候选运行，当前不计验收")
	}
	root, data := os.Getenv("SWA_REAL_INSTALL_ROOT"), os.Getenv("SWA_REAL_DATA_ROOT")
	controller, project := os.Getenv("SWA_REAL_CONTROLLER"), os.Getenv("SWA_PROJECT_ID")
	if !filepath.IsAbs(root) || !filepath.IsAbs(data) || controller == "" || project == "" {
		t.Fatal("实际私有安装、项目或控制端缺失")
	}
	config := Config{InstallRoot: root, DataRoot: data, NodeExecutable: filepath.Join(root, "node", "node.exe"), ClientEntry: filepath.Join(root, "runtime", "client.cjs"), AgentProfile: os.Getenv("SWA_REAL_AGENT_PROFILE"), DiscoveryHome: os.Getenv("SWA_REAL_DISCOVERY_HOME"), DiscoveryAppData: os.Getenv("APPDATA"), DiscoveryLocalAppData: os.Getenv("LOCALAPPDATA"), DiscoveryCodexHome: os.Getenv("CODEX_HOME"), DiscoveryClaudeHome: os.Getenv("CLAUDE_CONFIG_DIR"), DiscoveryPiHome: os.Getenv("PI_CODING_AGENT_DIR"), ProtectedRoots: filepath.SplitList(os.Getenv("SWA_REAL_PROTECTED_ROOTS"))}
	runtime, err := New(config)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	scope, err := runtime.ResolveScope(ctx, project, app.OrcaCommand{Action: "controller.show", Controller: controller})
	var refusal *app.OrcaNativeError
	if !errors.As(err, &refusal) || refusal.Code != "scope_denied" || refusal.Message != "The private product owner capability is required" {
		t.Fatal("没有私有 owner 凭据的直接 Native 请求必须明确因owner权限拒绝", err)
	}
	endpoint, token := os.Getenv("SWA_ENDPOINT"), os.Getenv("SWA_PROJECT_TOKEN")
	if endpoint == "" || token == "" {
		t.Fatal("需要已批准的实际项目 HTTP 入口")
	}
	body, err := json.Marshal(app.OrcaCommand{Action: "controller.show", Controller: controller})
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint+"/api/v1/local-projects/"+url.PathEscape(project)+"/orca/commands", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var reply struct {
		OK     bool `json:"ok"`
		Result struct {
			Scope app.OrcaScope `json:"scope"`
		} `json:"result"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 2*1024*1024)).Decode(&reply); err != nil {
		t.Fatal(err)
	}
	scope = reply.Result.Scope
	if response.StatusCode != http.StatusOK || !reply.OK || scope.ProjectID != project || scope.Controller != controller || scope.AuthorityDomain == "" {
		t.Fatal("实际 HTTP 批准与真实原生记录未证明当前项目和控制端")
	}
	config.ProtectedRoots = append(config.ProtectedRoots, data)
	if _, err := New(config); err == nil {
		t.Fatal("实际私有数据根与保护目录重合时必须拒绝")
	}
}
