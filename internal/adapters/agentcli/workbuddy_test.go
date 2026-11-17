package agentcli

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type workBuddyFixtureTransport func(*http.Request) (*http.Response, error)

func (f workBuddyFixtureTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestWorkBuddyVerificationRequiresExplicitToken(t *testing.T) {
	for _, token := range []string{"", "token\r\nAnother: header"} {
		result, err := checkWorkBuddy(context.Background(), token, workBuddyFixtureTransport(func(*http.Request) (*http.Response, error) {
			t.Fatal("must not contact WorkBuddy without a valid explicit token")
			return nil, nil
		}))
		if err == nil || result.State != "unknown" {
			t.Fatalf("unexpected observation: %+v, %v", result, err)
		}
	}
}

func TestWorkBuddyVerificationReadsOnlyOfficialStatus(t *testing.T) {
	const token = "SWA.fixture_token"
	for _, fixture := range []struct {
		name, body, state string
		status            int
	}{
		{"online", `{"code":0,"data":{"online":true}}`, "online", http.StatusOK},
		{"offline", `{"code":0,"data":{"online":false}}`, "offline", http.StatusOK},
		{"missing code", `{"data":{"online":true}}`, "unknown", http.StatusOK},
		{"missing online", `{"code":0,"data":{}}`, "unknown", http.StatusOK},
		{"rejected", `{"code":14,"msg":"private detail","data":{"online":true}}`, "unknown", http.StatusOK},
		{"expired", `{"message":"private detail"}`, "unknown", http.StatusUnauthorized},
		{"redirect", `{"code":0,"data":{"online":true}}`, "unknown", http.StatusFound},
		{"oversized", `{"code":0,"data":{"online":true}}` + strings.Repeat(" ", workBuddyMaxBody), "unknown", http.StatusOK},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			calls := 0
			result, err := checkWorkBuddy(t.Context(), token, workBuddyFixtureTransport(func(req *http.Request) (*http.Response, error) {
				calls++
				if req.URL.String() != "https://www.workbuddy.cn/openapi/v2/localassistant" ||
					req.Method != http.MethodGet || req.Body != nil ||
					req.Header.Get("Authorization") != "Bearer "+token ||
					req.Header.Get("Cookie") != "" || req.Header.Get("Accept") != "application/json" {
					t.Fatalf("unexpected request: %s %s", req.Method, req.URL)
				}
				return &http.Response{
					StatusCode: fixture.status,
					Header:     http.Header{"Location": []string{"https://redirect.invalid/"}},
					Body:       io.NopCloser(strings.NewReader(fixture.body)),
				}, nil
			}))
			if calls != 1 || result.State != fixture.state || result.SchemaVersion != 1 || result.AgentID != "workbuddy" ||
				(err != nil) != (fixture.state == "unknown") {
				t.Fatalf("wrong status observation: %+v, %v; %d requests", result, err, calls)
			}
			if err != nil && (strings.Contains(err.Error(), token) || strings.Contains(err.Error(), "private detail")) {
				t.Fatal("credential or raw vendor response was exposed")
			}
		})
	}
}

func TestWorkBuddyVerificationDoesNotExposeTransportErrors(t *testing.T) {
	_, err := checkWorkBuddy(t.Context(), "fixture_token", workBuddyFixtureTransport(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("private transport detail involving fixture_token")
	}))
	if err == nil || strings.Contains(err.Error(), "fixture_token") {
		t.Fatal("expected a safe local transport error")
	}
}
