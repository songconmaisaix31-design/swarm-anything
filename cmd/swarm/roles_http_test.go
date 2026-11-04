package main

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
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/httpapi"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/rolecards"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/sqlite"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	swarmapp "github.com/songconmaisaix31-design/Astrocyte/internal/swarm/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/swarm/domain"
	"github.com/songconmaisaix31-design/Astrocyte/migrations"
)

func TestRoleCardsActualHTTPAndCLI(t *testing.T) {
	dir := t.TempDir()
	db, err := sqlite.Open(filepath.Join(dir, "roles.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	if err := db.RunMigrations(context.Background(), migrations.FS); err != nil {
		t.Fatal(err)
	}
	catalog, err := rolecards.New()
	if err != nil {
		t.Fatal(err)
	}
	store, err := sqlite.NewSwarmRepository(db)
	if err != nil {
		t.Fatal(err)
	}
	agentToken := uuid.NewString()
	server := httptest.NewServer(httpapi.NewServer(httpapi.Config{
		AgentToken: agentToken,
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Services:   httpapi.Services{RoleCards: swarmapp.NewRoleCardService(catalog, store)},
	}).Handler())
	t.Cleanup(func() { server.Close(); db.Close() })
	client := server.Client()
	client.Jar, err = cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	var csrf string
	type response struct {
		Role    domain.RoleCard           `json:"role"`
		Version int                       `json:"version"`
		Items   []swarmapp.RoleCardRecord `json:"items"`
		Error   *apierrors.ServiceError   `json:"error"`
		CSRF    string                    `json:"csrf_token"`
	}
	send := func(c *http.Client, method, path string, body any, key, csrf, authorization string, expected int) response {
		t.Helper()
		var reader io.Reader
		if body != nil {
			data, err := json.Marshal(body)
			if err != nil {
				t.Fatal(err)
			}
			reader = bytes.NewReader(data)
		}
		request, err := http.NewRequest(method, server.URL+"/api/v1"+path, reader)
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Idempotency-Key", key)
		request.Header.Set("X-CSRF-Token", csrf)
		if authorization != "" {
			request.Header.Set("Authorization", authorization)
		}
		result, err := c.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		defer result.Body.Close()
		var value response
		if err := json.NewDecoder(result.Body).Decode(&value); err != nil {
			t.Fatal(err)
		}
		if result.StatusCode != expected {
			t.Fatalf("%s %s: HTTP %d，预期 %d，错误 %+v", method, path, result.StatusCode, expected, value.Error)
		}
		return value
	}
	send(server.Client(), "GET", "/roles", nil, "", "", "", 403)
	csrf = send(client, "GET", "/auth/session", nil, "", "", "", 200).CSRF
	listed := send(client, "GET", "/roles", nil, "", "", "", 200)
	if len(listed.Items) != 6 {
		t.Fatalf("默认角色 %d", len(listed.Items))
	}
	role, err := catalog.Find("builtin.writer")
	if err != nil {
		t.Fatal(err)
	}
	role.ID = "custom.http-writer"
	command := func(r domain.RoleCard, version int) map[string]any {
		return map[string]any{"schema_version": 1, "request_id": uuid.NewString(), "expected_version": version, "role": r}
	}
	key := uuid.NewString()
	body := command(role, 1)
	send(client, "POST", "/roles", body, key, "", "", 403)
	send(server.Client(), "POST", "/roles", body, key, "", "Bearer "+agentToken, 403)
	created := send(client, "POST", "/roles", body, key, csrf, "", 200)
	if created.Version != 1 || created.Role.ID != role.ID {
		t.Fatalf("创建结果 %+v", created)
	}
	read := send(client, "GET", "/roles/"+role.ID, nil, "", "", "", 200)
	if read.Version != 1 || read.Role.Name != role.Name {
		t.Fatal("HTTP 读取与写入内容不同")
	}
	replayed := send(client, "POST", "/roles", body, key, csrf, "", 200)
	if replayed.Version != 1 {
		t.Fatal("重复写入增加版本")
	}
	role.Name = "新写作者"
	conflict := send(client, "POST", "/roles", command(role, 1), key, csrf, "", 409)
	if conflict.Error.Code != apierrors.VersionConflict || conflict.Error.RequiredAction != "use_new_command_identity" {
		t.Fatalf("幂等冲突错误 %+v", conflict.Error)
	}
	send(client, "POST", "/roles", command(role, 1), uuid.NewString(), csrf, "", 409)
	send(client, "PUT", "/roles/custom.absent", command(role, 1), uuid.NewString(), csrf, "", 400)
	updated := send(client, "PUT", "/roles/"+role.ID, command(role, 1), uuid.NewString(), csrf, "", 200)
	if updated.Version != 2 || updated.Role.Name != role.Name {
		t.Fatal("HTTP 修改结果错误")
	}
	send(client, "PUT", "/roles/"+role.ID, command(role, 1), uuid.NewString(), csrf, "", 409)
	read = send(client, "GET", "/roles/"+role.ID, nil, "", "", "", 200)
	if read.Version != 2 {
		t.Fatal("CAS 失败改变版本")
	}
	role.ID = "custom.absent"
	send(client, "PUT", "/roles/"+role.ID, command(role, 1), uuid.NewString(), csrf, "", 404)
	send(client, "GET", "/roles/custom.absent", nil, "", "", "", 404)
	encoded, err := json.Marshal(role)
	if err != nil {
		t.Fatal(err)
	}
	var invalid map[string]any
	if err := json.Unmarshal(encoded, &invalid); err != nil {
		t.Fatal(err)
	}
	invalid["name"] = 7
	invalidData, err := json.Marshal(invalid)
	if err != nil {
		t.Fatal(err)
	}
	_, localErr := catalog.ParseRole(invalidData)
	failed := send(client, "POST", "/roles", map[string]any{"schema_version": 1, "request_id": uuid.NewString(), "expected_version": 1, "role": invalid}, uuid.NewString(), csrf, "", 400)
	if localErr == nil || failed.Error.Code != apierrors.ValidationFailed || !strings.Contains(failed.Error.Message, localErr.Error()) {
		t.Fatalf("本地与 HTTP 格式校验不一致: %v %+v", localErr, failed.Error)
	}
	invoke := func(args ...string) string {
		t.Helper()
		var out, stderr bytes.Buffer
		args = append(args, "--endpoint", server.URL, "--json")
		if code := run(args, strings.NewReader(""), &out, &stderr); code != 0 {
			t.Fatalf("CLI %v 退出 %d: %s", args, code, stderr.String())
		}
		return out.String()
	}
	invoke("roles", "list")
	invoke("roles", "show", "builtin.reviewer")
	role.ID = "custom.cli-writer"
	file := filepath.Join(dir, "cli-role.json")
	data, err := json.Marshal(role)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, data, 0600); err != nil {
		t.Fatal(err)
	}
	invoke("roles", "new", file)
	editKey := uuid.NewString()
	invoke("roles", "edit", role.ID, "--name", "CLI 修改的写作者", "--request-id", editKey, "--expected-version", "1")
	invoke("roles", "edit", role.ID, "--name", "CLI 修改的写作者", "--request-id", editKey, "--expected-version", "1")
	var shown swarmapp.RoleCardRecord
	if err := json.Unmarshal([]byte(invoke("roles", "show", role.ID)), &shown); err != nil {
		t.Fatal(err)
	}
	if shown.Role.Name != "CLI 修改的写作者" || shown.Version != 2 {
		t.Fatal("远程 CLI 没有读取当前角色")
	}
}
