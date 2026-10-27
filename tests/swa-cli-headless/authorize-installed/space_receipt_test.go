package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/cookiejar"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/projectfiles"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/swahttp"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/swastore"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
	migrations "github.com/songconmaisaix31-design/Astrocyte/migrations/swa"
)

func TestActualSpaceReceiptAndProjectRegistration(t *testing.T) {
	base, err := filepath.Abs(filepath.Join("..", "..", "..", ".verification", "cloud-setup"))
	if err != nil {
		t.Fatal(err)
	}
	root, err := os.MkdirTemp(base, "authorize-space-http-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.RemoveAll(root); err != nil {
			t.Error(err)
		}
	})
	db, err := swastore.Open(filepath.Join(root, "state.sqlite"))
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
	spaces := swastore.NewProjectSpaceRepository(db)
	server := swahttp.NewServer(swahttp.Config{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Services: swahttp.Services{
			ProjectSpaces: workspace.NewProjectSpaceService(spaces, workspace.ProjectSpaceOptions{}),
			LocalProjects: workspace.NewLocalProjectService(db, nil, projectfiles.Files{}, nil),
		},
	})
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			t.Error(err)
		}
		if err := <-done; !errors.Is(err, http.ErrServerClosed) {
			t.Errorf("actual HTTP shutdown: %v", err)
		}
	})
	endpoint := "http://" + listener.Addr().String()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Jar: jar, Timeout: 5 * time.Second}
	var csrf string
	request := func(method, path string, body map[string]any, want int) []byte {
		t.Helper()
		var encoded []byte
		if body != nil {
			encoded, err = json.Marshal(body)
			if err != nil {
				t.Fatal(err)
			}
		}
		req, err := http.NewRequest(method, endpoint+path, bytes.NewReader(encoded))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Origin", endpoint)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Idempotency-Key", body["request_id"].(string))
			req.Header.Set("X-CSRF-Token", csrf)
		}
		response, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		result, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
		if err != nil || response.StatusCode != want || !json.Valid(result) {
			t.Fatalf("actual %s %s: status=%d want=%d read=%v", method, path, response.StatusCode, want, err)
		}
		return result
	}
	session := request("GET", "/api/v1/auth/session", nil, 200)
	var human struct {
		Schema int    `json:"schema_version"`
		Kind   string `json:"actor_kind"`
		ID     string `json:"actor_id"`
		CSRF   string `json:"csrf_token"`
	}
	if json.Unmarshal(session, &human) != nil || human.Schema != 1 || human.Kind != "human" || human.ID != "local-human" || human.CSRF == "" {
		t.Fatal("actual human session was not established")
	}
	csrf = human.CSRF
	const title = "Public local space receipt validation"
	spaceRequest := uuid.NewString()
	body := request("POST", "/api/v1/project-spaces", map[string]any{"schema_version": 1, "request_id": spaceRequest, "expected_version": 1, "title": title}, 201)
	space, err := readSpaceReceipt(body, title)
	if err != nil {
		t.Fatal("actual service space receipt was rejected", err)
	}
	if uuid.Validate(space.ID) == nil {
		t.Fatal("actual service did not reproduce its opaque non-UUID space identity")
	}
	readBack := request("GET", "/api/v1/project-spaces/"+space.ID, nil, 200)
	observed, err := readSpaceReceipt(readBack, title)
	if err != nil || !reflect.DeepEqual(observed, space) {
		t.Fatal("read-only space response differs from the original receipt", err)
	}
	if err := spaces.WithProjectSpaceTx(context.Background(), func(tx workspace.ProjectSpaceTx) error {
		receipt, err := tx.LoadProjectSpaceReceipt("human:local-human", "CreateProjectSpace", spaceRequest)
		if err != nil {
			return err
		}
		saved, err := readSpaceReceipt(receipt.Result, title)
		if err != nil || !reflect.DeepEqual(saved, space) {
			return errors.New("original SQLite receipt differs from the actual HTTP receipt")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	projectRoot := filepath.Join(root, "public-project")
	if err := os.Mkdir(projectRoot, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(projectRoot, "public.txt"), []byte("Public receipt test input.\n"), 0600); err != nil {
		t.Fatal(err)
	}
	projectBody := request("POST", "/api/v1/local-projects", map[string]any{"schema_version": 1, "request_id": uuid.NewString(), "expected_version": 1, "name": "Public receipt test", "root": projectRoot, "space_id": space.ID}, 200)
	project, err := field[domain.LocalProject](projectBody, "project")
	initial := domain.ProjectSettings{Revision: 1, HistoryRoots: map[string]string{}, AllowedSubdirs: []string{}, AllowedActions: []string{}, AllowedTools: []string{}}
	if err != nil || uuid.Validate(project.ID) != nil || project.Root != projectRoot || project.SpaceID != space.ID || project.Name != "Public receipt test" || !reflect.DeepEqual(project.Settings, initial) {
		t.Fatal("actual project identity, space or default permissions differ", err)
	}
	stored, err := db.LoadProject(context.Background(), project.ID)
	if err != nil || !reflect.DeepEqual(stored, project) {
		t.Fatal("registered project differs from its actual SQLite row", err)
	}
	// These are parser-only variants of the real response, not extra HTTP writes.
	for name, mutate := range map[string]func(map[string]any, map[string]any){
		"schema":        func(e, _ map[string]any) { e["schema_version"] = 2 },
		"missing-space": func(e, _ map[string]any) { delete(e, "space") },
		"empty-id":      func(_, s map[string]any) { s["id"] = "" },
		"spaced-id":     func(_, s map[string]any) { s["id"] = " " + s["id"].(string) },
		"version":       func(_, s map[string]any) { s["version"] = 2 },
		"title":         func(_, s map[string]any) { s["title"] = title + " other" },
		"null-refs":     func(_, s map[string]any) { s["material_refs"] = nil },
		"nonempty-refs": func(_, s map[string]any) {
			s["material_refs"] = []any{map[string]any{"material_id": "unexpected", "revision": 1, "locator": "public"}}
		},
		"missing-time": func(_, s map[string]any) { delete(s, "created_at") },
		"invalid-time": func(_, s map[string]any) { s["created_at"] = "invalid" },
	} {
		t.Run(name, func(t *testing.T) {
			var envelope map[string]any
			if err := json.Unmarshal(body, &envelope); err != nil {
				t.Fatal(err)
			}
			mutate(envelope, envelope["space"].(map[string]any))
			changed, err := json.Marshal(envelope)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := readSpaceReceipt(changed, title); err == nil {
				t.Fatal("invalid receipt was accepted")
			}
		})
	}
	t.Run("uuid-compatibility-parser-only", func(t *testing.T) {
		var envelope map[string]any
		if err := json.Unmarshal(body, &envelope); err != nil {
			t.Fatal(err)
		}
		envelope["space"].(map[string]any)["id"] = uuid.NewString()
		changed, err := json.Marshal(envelope)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := readSpaceReceipt(changed, title); err != nil {
			t.Fatal("opaque UUID identity was incorrectly rejected", err)
		}
	})
}
