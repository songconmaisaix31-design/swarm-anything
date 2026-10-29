package httpapi

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/sqlite"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	workbench "github.com/songconmaisaix31-design/Astrocyte/internal/workbench/app"
)

func TestWorkbenchUsesSharedSessionOriginAndErrorV1(t *testing.T) {
	ctx := t.Context()
	local := os.Getenv("ASTROCYTE_TEST_COGNITION_LOCALAPPDATA")
	expectedPath := os.Getenv("ASTROCYTE_TEST_COGNITION_SQL_EXPECTED_FILE")
	output := os.Getenv("ASTROCYTE_TEST_OUTPUT_ROOT")
	for _, path := range []string{local, expectedPath, output} {
		if !filepath.IsAbs(path) {
			t.Fatal("explicit absolute public publication, SQL expectation and owned output paths are required")
		}
	}
	if err := os.MkdirAll(output, 0700); err != nil {
		t.Fatal(err)
	}
	directory, err := os.MkdirTemp(output, "workbench-http-actual-")
	if err != nil {
		t.Fatal(err)
	}
	sourceRoot, err := filepath.EvalSymlinks(filepath.Join(local, "astrocyte-workbench", "v0.1"))
	if err != nil {
		t.Fatal(err)
	}
	for _, pair := range [][2]string{{sourceRoot, directory}, {directory, sourceRoot}} {
		relative, err := filepath.Rel(pair[0], pair[1])
		if err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative) {
			t.Fatal("actual source publication and owned output must be separate")
		}
	}
	pointer, err := os.ReadFile(filepath.Join(sourceRoot, "current.json"))
	if err != nil {
		t.Fatal(err)
	}
	var publication struct {
		Generation string `json:"generation"`
		SnapshotAt string `json:"snapshot_at"`
	}
	if err := json.Unmarshal(pointer, &publication); err != nil {
		t.Fatal(err)
	}
	if publication.Generation == "" || publication.Generation == "." || publication.Generation == ".." || filepath.Base(publication.Generation) != publication.Generation || strings.ContainsAny(publication.Generation, "/\\:") {
		t.Fatal("actual publication generation is invalid")
	}
	if _, err := time.Parse(time.RFC3339Nano, publication.SnapshotAt); err != nil {
		t.Fatal(err)
	}
	var independent struct {
		SnapshotAt string `json:"snapshot_at"`
		Values     []struct {
			Metric string  `json:"metric"`
			Route  string  `json:"route"`
			Value  float64 `json:"value"`
		} `json:"values"`
	}
	expectedJSON, err := os.ReadFile(expectedPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(expectedJSON, &independent); err != nil {
		t.Fatal(err)
	}
	if independent.SnapshotAt != publication.SnapshotAt {
		t.Fatal("independent SQL expectations belong to another actual publication")
	}
	var expectedTotal float64
	for _, value := range independent.Values {
		if value.Route == "/cognition/evidence" && value.Metric == "total" {
			expectedTotal = value.Value
		}
	}
	if expectedTotal <= 100 {
		t.Fatal("actual public multi-page event population is required")
	}
	ownedRoot := filepath.Join(directory, "publication")
	ownedGeneration := filepath.Join(ownedRoot, "snapshots", publication.Generation)
	if err := os.MkdirAll(ownedGeneration, 0700); err != nil {
		t.Fatal(err)
	}
	type sourceFile struct {
		info os.FileInfo
		body []byte
	}
	sources := map[string]sourceFile{}
	for _, relative := range []string{"current.json", filepath.Join("snapshots", publication.Generation, "snapshot.sqlite"), filepath.Join("snapshots", publication.Generation, "history.json")} {
		path := filepath.Join(sourceRoot, relative)
		info, err := os.Stat(path)
		if err != nil || !info.Mode().IsRegular() {
			t.Fatal("actual public publication requires regular original files", err)
		}
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		sources[path] = sourceFile{info: info, body: body}
		if err := os.WriteFile(filepath.Join(ownedRoot, relative), body, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if !bytes.Equal(pointer, sources[filepath.Join(sourceRoot, "current.json")].body) {
		t.Fatal("actual publication pointer changed while selecting its immutable source")
	}
	t.Cleanup(func() {
		for path, before := range sources {
			after, err := os.Stat(path)
			if err != nil || !os.SameFile(before.info, after) || before.info.Size() != after.Size() || !before.info.ModTime().Equal(after.ModTime()) {
				t.Error("original public publication file identity, size or mtime changed")
				continue
			}
			body, err := os.ReadFile(path)
			if err != nil || !bytes.Equal(body, before.body) {
				t.Error("original public publication bytes changed")
			}
		}
	})
	sourceSnapshot := filepath.Join(sourceRoot, "snapshots", publication.Generation, "snapshot.sqlite")
	uriPath := filepath.ToSlash(sourceSnapshot)
	if filepath.VolumeName(sourceSnapshot) != "" {
		uriPath = "/" + uriPath
	}
	uri := url.URL{Scheme: "file", Path: uriPath}
	query := uri.Query()
	query.Set("mode", "ro")
	query.Set("immutable", "1")
	query.Add("_pragma", "query_only(1)")
	uri.RawQuery = query.Encode()
	originalDB, err := sql.Open("sqlite", uri.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := originalDB.Close(); err != nil {
			t.Error(err)
		}
	})
	var queryOnly int
	sourceContext, cancelSource := context.WithTimeout(ctx, 30*time.Second)
	defer cancelSource()
	if err := originalDB.QueryRowContext(sourceContext, "PRAGMA query_only").Scan(&queryOnly); err != nil || queryOnly != 1 {
		t.Fatal("original public SQLite connection must remain query_only", err)
	}
	type originalEvent struct {
		safe   workbench.Event
		origin string
		raw    []byte
	}
	rows, err := originalDB.QueryContext(sourceContext, "SELECT id,kind,topic,data,ts,origin_key,raw_bytes FROM attention_engine_events ORDER BY ts DESC,id ASC")
	if err != nil {
		t.Fatal(err)
	}
	expected := []originalEvent{}
	for rows.Next() {
		var record originalEvent
		var data string
		var timestamp int64
		if err := rows.Scan(&record.safe.ID, &record.safe.Kind, &record.safe.Topic, &data, &timestamp, &record.origin, &record.raw); err != nil {
			t.Fatal(err)
		}
		var metadata struct {
			Tokens *int64 `json:"tokens"`
			Scope  string `json:"scope"`
		}
		if err := json.Unmarshal([]byte(data), &metadata); err != nil {
			t.Fatal(err)
		}
		record.safe.Tokens, record.safe.Scope = metadata.Tokens, metadata.Scope
		record.safe.TS = time.UnixMilli(timestamp).UTC().Format(time.RFC3339Nano)
		if record.safe.ID == "" || !strings.HasPrefix(record.origin, "git:") || len(record.raw) == 0 {
			t.Fatal("actual event is missing its original public Git receipt")
		}
		expected = append(expected, record)
	}
	if err := errors.Join(rows.Err(), rows.Close()); err != nil {
		t.Fatal(err)
	}
	cancelSource()
	if float64(len(expected)) != expectedTotal {
		t.Fatal("actual public SQL population differs from its independent published expectation")
	}
	ownedSnapshot := filepath.Join(ownedGeneration, "snapshot.sqlite")
	ownedDB, err := sqlite.Open(ownedSnapshot)
	if err != nil {
		t.Fatal(err)
	}
	ownedClosed := false
	t.Cleanup(func() {
		if !ownedClosed {
			if err := ownedDB.Close(); err != nil {
				t.Error(err)
			}
		}
	})
	// GetEvent 仅读取本次实际副本，不调用 Record、迁移或任何来源生成入口。
	events := sqlite.NewEventRepository(ownedDB)
	reader := sqlite.NewWorkbenchReader(ownedRoot, sourceSnapshot)
	server := NewServer(Config{Services: Services{Workbench: reader}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	origin := "http://" + listener.Addr().String()
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	stopped := false
	stop := func() {
		if stopped {
			return
		}
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			t.Fatal(err)
		}
		if err := <-done; !errors.Is(err, http.ErrServerClosed) {
			t.Fatal("actual Workbench HTTP did not shut down normally", err)
		}
		stopped = true
	}
	t.Cleanup(stop)
	request := func(client *http.Client, method, path, requestOrigin string, status int) []byte {
		req, err := http.NewRequestWithContext(ctx, method, origin+path, nil)
		if err != nil {
			t.Fatal(err)
		}
		if requestOrigin != "" {
			req.Header.Set("Origin", requestOrigin)
		}
		response, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		body, readErr := io.ReadAll(response.Body)
		if err := errors.Join(readErr, response.Body.Close()); err != nil || response.StatusCode != status {
			t.Fatal("actual Workbench HTTP returned unexpected status", method, path, response.StatusCode, status, err)
		}
		if status == http.StatusOK && strings.HasPrefix(path, "/api/v1/cognition/") && response.Header.Get("X-Snapshot-At") != publication.SnapshotAt {
			t.Fatal("actual HTTP response changed the selected immutable snapshot identity")
		}
		for _, private := range []string{"raw_unique", "raw_bytes", "origin_key", "snapshot.sqlite", filepath.Base(directory)} {
			if bytes.Contains(body, []byte(private)) {
				t.Fatal("actual Workbench HTTP exposed private source fields or paths")
			}
		}
		return body
	}
	assertError := func(body []byte, code apierrors.Code) {
		var envelope apierrors.ErrorEnvelope
		if err := json.Unmarshal(body, &envelope); err != nil || envelope.SchemaVersion != 1 || envelope.Error == nil || envelope.Error.Code != code || envelope.Error.RequestID == "" || envelope.Error.RequiredAction == "" {
			t.Fatal("actual Workbench error lacks the exact shared ErrorV1 contract")
		}
	}
	unauthenticated := &http.Client{Timeout: 5 * time.Second}
	t.Cleanup(unauthenticated.CloseIdleConnections)
	for _, name := range []string{"health", "today", "focus", "topics/evidence", "agents", "events", "filters"} {
		assertError(request(unauthenticated, http.MethodGet, "/api/v1/cognition/"+name, "", http.StatusForbidden), apierrors.ScopeDenied)
	}
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatal(err)
	}
	client := &http.Client{Jar: jar, Timeout: 5 * time.Second}
	t.Cleanup(client.CloseIdleConnections)
	var session struct {
		Kind string `json:"actor_kind"`
		CSRF string `json:"csrf_token"`
	}
	if err := json.Unmarshal(request(client, http.MethodGet, "/api/v1/auth/session", "", http.StatusOK), &session); err != nil || session.Kind != "human" || session.CSRF == "" {
		t.Fatal("actual Workbench human bootstrap failed")
	}
	for _, name := range []string{"health", "today", "focus", "topics/evidence", "agents", "events", "filters"} {
		var body map[string]json.RawMessage
		if err := json.Unmarshal(request(client, http.MethodGet, "/api/v1/cognition/"+name, "", http.StatusOK), &body); err != nil {
			t.Fatal(err)
		}
	}
	resolved := map[string]bool{}
	for _, size := range []int{20, 50} {
		for page := 1; page <= (len(expected)+size-1)/size+1; page++ {
			body := request(client, http.MethodGet, "/api/v1/cognition/events?page="+strconv.Itoa(page)+"&page_size="+strconv.Itoa(size), "", http.StatusOK)
			var actual workbench.Events
			var fields struct {
				Events []map[string]json.RawMessage `json:"events"`
			}
			if err := json.Unmarshal(body, &actual); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(body, &fields); err != nil {
				t.Fatal(err)
			}
			start := min((page-1)*size, len(expected))
			end := min(start+size, len(expected))
			if actual.Total != len(expected) || actual.Page != page || actual.PageSize != size || len(actual.Events) != end-start || len(fields.Events) != end-start {
				t.Fatal("actual HTTP pagination differs from the original SQL population")
			}
			for index, event := range actual.Events {
				keys := []string{}
				for key := range fields.Events[index] {
					keys = append(keys, key)
				}
				slices.Sort(keys)
				if !slices.Equal(keys, []string{"event_id", "kind", "scope", "tokens", "topic", "ts"}) || !reflect.DeepEqual(event, expected[start+index].safe) {
					t.Fatal("actual HTTP event differs from the six original SQL fields")
				}
				if !resolved[event.ID] {
					readContext, cancelRead := context.WithTimeout(ctx, 30*time.Second)
					stored, err := events.GetEvent(readContext, event.ID)
					cancelRead()
					original := expected[start+index]
					if err != nil || stored.ID != event.ID || stored.Event == nil || stored.OriginKey != original.origin || !bytes.Equal(stored.RawBytes, original.raw) || stored.Event.Kind != event.Kind || stored.Event.Topic != event.Topic || stored.Event.Scope != event.Scope || time.UnixMilli(stored.Event.TS).UTC().Format(time.RFC3339Nano) != event.TS {
						t.Fatal("actual event_id does not resolve through production GetEvent to its original Git receipt", err)
					}
					resolved[event.ID] = true
				}
			}
		}
	}
	if len(resolved) != len(expected) {
		t.Fatal("actual HTTP pagination omitted original event identities")
	}
	for _, test := range []struct {
		method, path, origin string
		status               int
		code                 apierrors.Code
	}{
		{http.MethodGet, "/api/v1/cognition/events", "http://localhost:9999", 403, apierrors.ScopeDenied},
		{http.MethodGet, "/api/v1/cognition/events?page=bad", "", 400, apierrors.ValidationFailed},
		{http.MethodHead, "/api/v1/cognition/events", "", 405, apierrors.UnsupportedCapability},
		{http.MethodGet, "/api/v1/cognition/unknown", "", 404, apierrors.NotFound},
		{http.MethodGet, "/api/v1/cognition/events?topic=%zz", "", 400, apierrors.ValidationFailed},
	} {
		body := request(client, test.method, test.path, test.origin, test.status)
		if test.method != http.MethodHead {
			assertError(body, test.code)
		}
	}
	if err := ownedDB.Close(); err != nil {
		t.Fatal(err)
	}
	ownedClosed = true
	// 成功读取真实发布物后，只让本次自有副本实际离线，再恢复同一文件。
	offline := filepath.Join(ownedGeneration, "offline.sqlite")
	if err := os.Rename(ownedSnapshot, offline); err != nil {
		t.Fatal(err)
	}
	defer func() {
		if _, err := os.Stat(offline); err == nil {
			if err := os.Rename(offline, ownedSnapshot); err != nil {
				t.Error(err)
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			t.Error(err)
		}
	}()
	body := request(client, http.MethodGet, "/api/v1/cognition/events", "", http.StatusServiceUnavailable)
	assertError(body, apierrors.ProviderUnavailable)
	var unavailable apierrors.ErrorEnvelope
	if err := json.Unmarshal(body, &unavailable); err != nil || unavailable.Error.Message != "Workbench snapshot unavailable" || !unavailable.Error.Retryable {
		t.Fatal("actual offline publication error exposed adapter details")
	}
	if err := os.Rename(offline, ownedSnapshot); err != nil {
		t.Fatal(err)
	}
	request(client, http.MethodGet, "/api/v1/cognition/events?page_size=1", "", http.StatusOK)
	stop()
	t.Logf("actual publication=%s snapshot_at=%s original_events=%d real_GetEvent_resolutions=%d page_sizes=20,50 original_query_only=1 owned_offline_503_and_recovery=true", publication.Generation, publication.SnapshotAt, len(expected), len(resolved))
}
