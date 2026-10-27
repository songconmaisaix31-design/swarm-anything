package app_test

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

func TestOpenCodeStepFunAccountWireIsStrict(t *testing.T) {
	// 仅验证公开合同形状，不创建账户、数据库或模型成功回执。
	value := app.OrcaNativeLaunchAccount{Kind: "opencode-native-stepfun-api-key", Provider: "stepfun", ModelTarget: app.OrcaNativeModelTarget{ModelID: "step-3.5-flash", API: "openai-completions", BaseURL: "https://api.stepfun.com/v1"}}
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	var decoded app.OrcaNativeLaunchAccount
	if err := json.Unmarshal(encoded, &decoded); err != nil || decoded.Kind != value.Kind || decoded.ModelTarget != value.ModelTarget {
		t.Fatal("StepFun 合同往返失败", err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &fields); err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"catalog_source", "models_source", "private_home", "key"} {
		if _, exists := fields[forbidden]; exists {
			t.Fatal("OpenCode 合同包含其他账户字段", forbidden)
		}
	}
	fields["key"] = json.RawMessage(`"ordinary-shape-marker"`)
	invalid, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	if json.Unmarshal(invalid, &decoded) == nil {
		t.Fatal("OpenCode 账户接受了未声明字段")
	}
}

func TestOrcaCLIRealCurrentProjectAuthorization(t *testing.T) {
	if os.Getenv("SWA_REAL_ENABLED") != "1" {
		t.Skip("真实链路须在已授窗口和同安装候选运行，当前不计验收")
	}
	endpoint, project, token := os.Getenv("SWA_ENDPOINT"), os.Getenv("SWA_PROJECT_ID"), os.Getenv("SWA_PROJECT_TOKEN")
	data := os.Getenv("SWA_REAL_DATA_ROOT")
	if endpoint == "" || project == "" || token == "" || !filepath.IsAbs(data) {
		t.Fatal("实际HTTP、项目批准或私有根缺失")
	}
	client := &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	request, err := http.NewRequest(http.MethodPost, endpoint+"/api/v1/local-projects/"+url.PathEscape(project)+"/orca/commands", bytes.NewBufferString(`{"action":"status"}`))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var reply struct {
		OK        bool   `json:"ok"`
		RuntimeID string `json:"runtime_id"`
		Result    struct {
			Databases []struct {
				Name string `json:"name"`
				File string `json:"file"`
			} `json:"databases"`
		} `json:"result"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 2*1024*1024)).Decode(&reply); err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK || !reply.OK || reply.RuntimeID != os.Getenv("SWA_REAL_RUNTIME_ID") {
		t.Fatal("真实当前项目批准没有取得同一私有 runtime 结果")
	}
	found := false
	for _, database := range reply.Result.Databases {
		if database.Name != "main" {
			continue
		}
		rel, err := filepath.Rel(data, database.File)
		if err != nil || !filepath.IsAbs(database.File) || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			t.Fatal("实际 SQLite 不属于本项私有数据根")
		}
		if _, err := os.Stat(database.File); err != nil {
			t.Fatal(err)
		}
		found = true
	}
	if !found {
		t.Fatal("实际 PRAGMA database_list 缺少主库")
	}
	request, err = http.NewRequest(http.MethodPost, endpoint+"/api/v1/local-projects/"+url.PathEscape(project)+"/orca/commands", bytes.NewBufferString(`{"action":"capabilities"}`))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	client.Timeout = 130 * time.Second
	response, err = client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var capabilities struct {
		OK        bool   `json:"ok"`
		RuntimeID string `json:"runtime_id"`
		Result    struct {
			Schema         string `json:"schema"`
			SourceRevision string `json:"source_revision"`
			Registry       struct {
				Version string `json:"orca_version"`
				SHA256  string `json:"artifact_sha256"`
			} `json:"registry"`
			Agents []struct {
				ID         string `json:"id"`
				Adapter    string `json:"adapter"`
				Registered struct {
					Status string `json:"status"`
				} `json:"registered"`
				Installed struct {
					Status     string `json:"status"`
					Executable string `json:"executable"`
					Version    string `json:"version"`
				} `json:"installed"`
			} `json:"agents"`
		} `json:"result"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 2*1024*1024)).Decode(&capabilities); err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK || !capabilities.OK || capabilities.RuntimeID != reply.RuntimeID || capabilities.Result.Schema != "swa.capabilities.v1" || capabilities.Result.Registry.Version != "1.4.230" || len(capabilities.Result.Agents) == 0 {
		t.Fatal("实际独立发现没有返回同一私有 runtime 的真实注册清单")
	}
	install := os.Getenv("SWA_REAL_INSTALL_ROOT")
	version, err := os.ReadFile(filepath.Join(install, "VERSION"))
	if err != nil {
		t.Fatal(err)
	}
	artifact, err := os.ReadFile(filepath.Join(install, "runtime", "host.cjs"))
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(artifact)
	if capabilities.Result.SourceRevision != strings.TrimSpace(string(version)) || capabilities.Result.Registry.SHA256 != fmt.Sprintf("%x", digest) {
		t.Fatal("发现来源与实际安装候选不一致")
	}
	seen := map[string]bool{}
	for _, agent := range capabilities.Result.Agents {
		if agent.ID == "" || seen[agent.ID] || agent.Adapter == "" || agent.Registered.Status != "available" {
			t.Fatal("真实 registry 存在缺失或重复的 adapter 身份")
		}
		seen[agent.ID] = true
		if agent.Installed.Status == "available" && (!filepath.IsAbs(agent.Installed.Executable) || agent.Installed.Version == "") {
			t.Fatal("已安装状态没有提供真实程序和版本")
		}
	}
}
