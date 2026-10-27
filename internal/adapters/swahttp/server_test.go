package swahttp

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/projectfiles"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/swastore"
	"github.com/songconmaisaix31-design/Astrocyte/internal/foundation"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	migrations "github.com/songconmaisaix31-design/Astrocyte/migrations/swa"
)

type actualHTTP struct {
	t      *testing.T
	url    string
	client *http.Client
	csrf   string
	db     *swastore.DB
}

func actualServer(t *testing.T, web string) *actualHTTP {
	t.Helper()
	db, err := swastore.Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	if err := db.RunMigrations(context.Background(), migrations.FS); err != nil {
		t.Fatal(err)
	}
	projects := workspace.NewLocalProjectService(db, nil, projectfiles.Files{}, nil)
	server := NewServer(Config{Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), WebDir: web, Services: Services{Foundation: foundation.NewSWAService(2, false), LocalProjects: projects, ProjectSpaces: workspace.NewProjectSpaceService(swastore.NewProjectSpaceRepository(db), workspace.ProjectSpaceOptions{})}})
	actual := httptest.NewServer(server.server.Handler)
	t.Cleanup(actual.Close)
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	return &actualHTTP{t: t, url: actual.URL, client: &http.Client{Jar: jar}, db: db}
}
func (s *actualHTTP) request(method, path string, body any, headers map[string]string, want int) map[string]any {
	s.t.Helper()
	var raw []byte
	var err error
	if body != nil {
		raw, err = json.Marshal(body)
		if err != nil {
			s.t.Fatal(err)
		}
	}
	r, err := http.NewRequest(method, s.url+path, bytes.NewReader(raw))
	if err != nil {
		s.t.Fatal(err)
	}
	r.Header.Set("Origin", s.url)
	r.Header.Set("Content-Type", "application/json")
	if s.csrf != "" {
		r.Header.Set("X-CSRF-Token", s.csrf)
	}
	if m, ok := body.(map[string]any); ok {
		if key, ok := m["request_id"].(string); ok {
			r.Header.Set("Idempotency-Key", key)
		}
	}
	for key, value := range headers {
		if key == "Host" {
			r.Host = value
		} else {
			r.Header.Set(key, value)
		}
	}
	response, err := s.client.Do(r)
	if err != nil {
		s.t.Fatal(err)
	}
	defer response.Body.Close()
	var value map[string]any
	if err := json.NewDecoder(response.Body).Decode(&value); err != nil {
		s.t.Fatalf("%s %s did not return JSON: %v", method, path, err)
	}
	if response.StatusCode != want {
		s.t.Fatalf("%s %s status %d, want %d: %v", method, path, response.StatusCode, want, value)
	}
	if response.Header.Get("X-Request-ID") == "" {
		s.t.Fatal("missing trace ID")
	}
	return value
}
func command(fields map[string]any) map[string]any {
	fields["schema_version"] = 1
	fields["request_id"] = uuid.NewString()
	fields["expected_version"] = 1
	return fields
}
func (s *actualHTTP) login() {
	s.csrf = s.request("GET", "/api/v1/auth/session", nil, nil, 200)["csrf_token"].(string)
}

func TestActualSWAHTTPProjectsPermissionsAndUnavailableRuntime(t *testing.T) {
	s := actualServer(t, "")
	s.request("GET", "/api/v1/local-projects", nil, nil, 403)
	s.request("GET", "/api/v1/auth/session", nil, map[string]string{"Origin": "http://outside.invalid"}, 403)
	s.request("GET", "/api/v1/health", nil, map[string]string{"Host": "outside.invalid"}, 403)
	s.login()
	spaceBody := command(map[string]any{"title": "HTTP actual space"})
	s.request("POST", "/api/v1/project-spaces", spaceBody, map[string]string{"X-CSRF-Token": ""}, 403)
	space := s.request("POST", "/api/v1/project-spaces", spaceBody, nil, 201)["space"].(map[string]any)
	replay := s.request("POST", "/api/v1/project-spaces", spaceBody, nil, 201)["space"].(map[string]any)
	if replay["id"] != space["id"] {
		t.Fatal("HTTP retry duplicated space")
	}
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "public.txt"), []byte("explicit HTTP context"), 0600); err != nil {
		t.Fatal(err)
	}
	project := s.request("POST", "/api/v1/local-projects", command(map[string]any{"name": "HTTP actual directory", "root": root, "space_id": space["id"]}), nil, 200)["project"].(map[string]any)
	id := project["id"].(string)
	base := "/api/v1/local-projects/" + id
	settings := command(map[string]any{"expected_revision": 1, "settings": map[string]any{"history_roots": map[string]string{}, "allowed_subdirs": []string{"public.txt"}, "allowed_actions": []string{"read_context", "observe"}, "allowed_tools": []string{}}})
	s.request("PUT", base+"/settings", settings, nil, 200)
	s.request("PUT", base+"/settings", settings, nil, 409)
	s.request("POST", base+"/grants", command(map[string]any{"agent_id": "http-review", "actions": []string{"read_context"}}), nil, 200)
	credential := s.request("POST", base+"/agent-token", command(map[string]any{"agent_id": "http-review"}), nil, 200)["credential"].(map[string]any)
	authorization := map[string]string{"Authorization": "Bearer " + credential["token"].(string)}
	contextBody := command(map[string]any{"references": []any{}, "files": []string{"public.txt"}})
	s.request("POST", base+"/context", contextBody, authorization, 403)
	settings["expected_revision"] = 2
	settings["settings"].(map[string]any)["allow_directory"] = true
	s.request("PUT", base+"/settings", settings, nil, 200)
	packet := s.request("POST", base+"/context", contextBody, authorization, 200)
	files := packet["files"].([]any)
	if len(files) != 1 || files[0].(map[string]any)["text"] != "explicit HTTP context" {
		t.Fatal("actual selected file missing")
	}
	s.request("POST", "/api/v1/local-projects/another-project/context", contextBody, authorization, 403)
	s.request("POST", base+"/grants", command(map[string]any{"agent_id": "http-review", "actions": []string{"observe"}}), authorization, 403)
	s.request("POST", base+"/grants/revoke", command(map[string]any{"agent_id": "http-review"}), nil, 200)
	s.request("POST", base+"/context", contextBody, authorization, 403)
	response := s.request("POST", base+"/orca/commands", map[string]any{"schema_version": 1, "action": "run.submit", "request_id": uuid.NewString(), "objective": "Not configured"}, nil, 503)
	if response["error"].(map[string]any)["required_action"] != "start_installed_swa_service" {
		t.Fatal("runtime absence was not explicit")
	}
	s.request("POST", base+"/sessions", command(map[string]any{}), nil, 404)
	s.request("POST", orcaDeliveryAdmissionPath, map[string]any{}, nil, 403)
	s.request("GET", "/api/v1/local-agents", nil, nil, 501)
	health := s.request("GET", "/api/v1/health", nil, nil, 200)
	if health["service"] != "astrocyte" {
		t.Fatal("historical machine health identity changed")
	}
	foundation := s.request("GET", "/api/v1/foundation", nil, nil, 200)
	capabilities := foundation["capabilities"].(map[string]any)
	if foundation["stage"] != "SWA" || capabilities["imports"] != false || capabilities["execution"] != false {
		t.Fatal("unassembled capability was advertised")
	}
}

func TestActualSWAHTTPStaticAssetsAndAPIIsolation(t *testing.T) {
	web, err := filepath.Abs("../../../web/dist")
	if err != nil {
		t.Fatal(err)
	}
	index, err := os.ReadFile(filepath.Join(web, "index.html"))
	if err != nil {
		t.Fatal("build the actual SWA Web assets first", err)
	}
	s := actualServer(t, web)
	for _, path := range []string{"/", "/swarm/run"} {
		response, err := s.client.Get(s.url + path)
		if err != nil {
			t.Fatal(err)
		}
		body, readErr := io.ReadAll(response.Body)
		closeErr := response.Body.Close()
		if readErr != nil || closeErr != nil || response.StatusCode != 200 || !bytes.Equal(body, index) {
			t.Fatal("actual SPA asset was not served", path, readErr, closeErr)
		}
	}
	response, err := s.client.Get(s.url + "/assets/does-not-exist.js")
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != 404 || response.Header.Get("Cache-Control") != "no-store" {
		t.Fatal("missing asset did not return uncached 404")
	}
	response.Body.Close()
	s.login()
	s.request("GET", "/api/v1/materials", nil, nil, 404)
}
