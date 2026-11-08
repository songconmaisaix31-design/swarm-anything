package swahttp_test

import (
	"bytes"
	"io"
	"net/http"
	"net/url"
	"os"
	"testing"
	"time"
)

func TestOrcaCLIRealHTTPAuthorityBoundary(t *testing.T) {
	if os.Getenv("SWA_REAL_ENABLED") != "1" {
		t.Skip("真实链路须在已授窗口和同安装候选运行，当前不计验收")
	}
	endpoint, project, token := os.Getenv("SWA_ENDPOINT"), os.Getenv("SWA_PROJECT_ID"), os.Getenv("SWA_PROJECT_TOKEN")
	if endpoint == "" || project == "" || token == "" {
		t.Fatal("实际服务和当前项目批准缺失")
	}
	client := &http.Client{Timeout: 30 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	for _, input := range []struct {
		name, body, credential string
		expected               int
	}{
		{"actual_missing_credential", `{"action":"status"}`, "", http.StatusForbidden},
		{"agent_cannot_supply_human_actor", `{"action":"status","actor":"human"}`, token, http.StatusBadRequest},
		{"agent_cannot_supply_runtime_identity", `{"action":"status","runtime_id":"` + os.Getenv("SWA_REAL_RUNTIME_ID") + `"}`, token, http.StatusBadRequest},
	} {
		t.Run(input.name, func(t *testing.T) {
			request, err := http.NewRequest(http.MethodPost, endpoint+"/api/v1/local-projects/"+url.PathEscape(project)+"/orca/commands", bytes.NewBufferString(input.body))
			if err != nil {
				t.Fatal(err)
			}
			request.Header.Set("Content-Type", "application/json")
			if input.credential != "" {
				request.Header.Set("Authorization", "Bearer "+input.credential)
			}
			response, err := client.Do(request)
			if err != nil {
				t.Fatal(err)
			}
			_, readErr := io.Copy(io.Discard, io.LimitReader(response.Body, 1024*1024))
			response.Body.Close()
			if readErr != nil || response.StatusCode != input.expected {
				t.Fatalf("真实HTTP拒绝状态不符: status=%d error=%v", response.StatusCode, readErr)
			}
		})
	}
}
