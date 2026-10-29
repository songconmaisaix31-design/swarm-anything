package s1_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/cookiejar"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/sqlite"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/attention/app"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	workdomain "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

func localCommand(version int) app.CommandMeta {
	key := uuid.NewString()
	return app.CommandMeta{SchemaVersion: 1, RequestID: key, IdempotencyKey: key, ExpectedVersion: version}
}

type automaticHTTP struct {
	t                                 *testing.T
	dir, executable, root, base, csrf string
	client                            *http.Client
	process                           *exec.Cmd
	log                               *os.File
	jobSeconds                        int
	maxAttempts                       int
	relayArchive                      bool
}

func newAutomaticHTTP(t *testing.T) *automaticHTTP {
	t.Helper()
	return newAutomaticHTTPWithRelay(t, false)
}

func newAutomaticHTTPWithRelay(t *testing.T, relayArchive bool) *automaticHTTP {
	t.Helper()
	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal("resolve public worktree")
	}
	evidence := os.Getenv("ASTROCYTE_TEST_OUTPUT_ROOT")
	if evidence == "" || !filepath.IsAbs(evidence) {
		t.Fatal("ASTROCYTE_TEST_OUTPUT_ROOT must name an explicit absolute owned evidence directory")
	}
	if err = os.MkdirAll(evidence, 0700); err != nil {
		t.Fatal("create evidence root")
	}
	dir, err := os.MkdirTemp(evidence, "s1-native-")
	if err != nil {
		t.Fatal("create owned verification directory")
	}
	t.Logf("owned production server evidence directory=%s", dir)
	log, err := os.OpenFile(filepath.Join(dir, "server.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		t.Fatal("open local evidence log")
	}
	executable := filepath.Join(dir, "astrocyte.exe")
	build := exec.Command("go", "build", "-mod=readonly", "-o", executable, "./cmd/server")
	build.Dir, build.Stdout, build.Stderr = root, log, log
	if err = build.Run(); err != nil {
		log.Close()
		t.Fatal("production server build failed; local evidence retained")
	}
	server := &automaticHTTP{t: t, dir: dir, executable: executable, root: root, log: log, jobSeconds: 1800, maxAttempts: 1, relayArchive: relayArchive}
	t.Cleanup(func() {
		server.stop()
		if err := log.Close(); err != nil {
			t.Error("close local evidence log")
		}
	})
	server.start()
	return server
}

func (s *automaticHTTP) start() {
	s.t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		s.t.Fatal("reserve owned HTTP port")
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if err = listener.Close(); err != nil {
		s.t.Fatal("release reserved HTTP port")
	}
	s.base = "http://127.0.0.1:" + strconv.Itoa(port)
	cmd := exec.Command(s.executable)
	cmd.Dir, cmd.Stdout, cmd.Stderr = s.root, s.log, s.log
	var environment []string
	for _, value := range os.Environ() {
		key, _, _ := strings.Cut(value, "=")
		if !strings.HasPrefix(strings.ToUpper(key), "ASTROCYTE_") && !strings.EqualFold(key, "TEMP") && !strings.EqualFold(key, "TMP") && !(s.relayArchive && strings.EqualFold(key, "LOCALAPPDATA")) {
			environment = append(environment, value)
		}
	}
	temp := filepath.Join(s.dir, "native-temp")
	if err = os.MkdirAll(temp, 0700); err != nil {
		s.t.Fatal("create owned native temporary directory")
	}
	cmd.Env = append(environment, "ASTROCYTE_PORT="+strconv.Itoa(port), "ASTROCYTE_DATA_DIR="+s.dataDirectory(), "ASTROCYTE_PROJECT_DISCOVERY_ROOTS=[]", "ASTROCYTE_ENABLE_CODEX_DISTILLATION=false", "ASTROCYTE_ENABLE_SUMMARIZE=false", "ASTROCYTE_JOB_CONCURRENCY=1", "ASTROCYTE_JOB_MAX_ATTEMPTS="+strconv.Itoa(s.maxAttempts), "ASTROCYTE_JOB_TIMEOUT_SECONDS="+strconv.Itoa(s.jobSeconds), "TEMP="+temp, "TMP="+temp)
	if s.relayArchive {
		cmd.Env = append(cmd.Env, "ASTROCYTE_RELAY=1", "ASTROCYTE_RELAY_SESSION_SOURCE=archive", "LOCALAPPDATA="+filepath.Join(s.dir, "relay-local"))
	}
	if err = cmd.Start(); err != nil {
		s.t.Fatal("start actual production HTTP server")
	}
	s.process = cmd
	jar, err := cookiejar.New(nil)
	if err != nil {
		s.t.Fatal("create session cookie jar")
	}
	s.client = &http.Client{Jar: jar, Timeout: 45 * time.Second}
	deadline := time.Now().Add(30 * time.Second)
	for {
		response, err := s.client.Get(s.base + "/api/v1/health")
		if err == nil {
			response.Body.Close()
			if response.StatusCode == http.StatusOK {
				break
			}
		}
		if time.Now().After(deadline) {
			s.t.Fatal("actual server readiness failed; local evidence retained")
		}
		time.Sleep(100 * time.Millisecond)
	}
	var session struct {
		CSRF string `json:"csrf_token"`
	}
	s.request("GET", "/api/v1/auth/session", nil, http.StatusOK, &session)
	s.csrf = session.CSRF
	if s.csrf == "" {
		s.t.Fatal("production session bootstrap omitted CSRF")
	}
}

func (s *automaticHTTP) dataDirectory() string {
	if s.relayArchive {
		return filepath.Join(s.dir, "relay-local", "astrocyte-workbench", "v0.2-access", "app-state")
	}
	return s.dir
}

func (s *automaticHTTP) stop() {
	if s.process == nil {
		return
	}
	if err := s.process.Process.Kill(); err != nil {
		s.t.Error("stop owned HTTP process")
	}
	_ = s.process.Wait()
	s.process = nil
}

func (s *automaticHTTP) request(method, path string, input any, status int, output any) {
	s.t.Helper()
	var body bytes.Buffer
	if input != nil {
		if err := json.NewEncoder(&body).Encode(input); err != nil {
			s.t.Fatal("encode HTTP request")
		}
	}
	request, err := http.NewRequest(method, s.base+path, &body)
	if err != nil {
		s.t.Fatal("create HTTP request")
	}
	request.Header.Set("Origin", s.base)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-CSRF-Token", s.csrf)
	if input != nil {
		var identity struct {
			RequestID string `json:"request_id"`
		}
		if err = json.Unmarshal(body.Bytes(), &identity); err != nil || identity.RequestID == "" {
			s.t.Fatal("request identity missing")
		}
		request.Header.Set("Idempotency-Key", identity.RequestID)
	}
	response, err := s.client.Do(request)
	if err != nil {
		s.t.Fatal("actual HTTP request failed; local server evidence retained")
	}
	defer response.Body.Close()
	if response.StatusCode != status {
		var failure apierrors.ErrorEnvelope
		if json.NewDecoder(response.Body).Decode(&failure) == nil && failure.Error != nil {
			if encoded, err := json.Marshal(failure); err == nil {
				if err := os.WriteFile(filepath.Join(s.dir, "http-error-"+request.Header.Get("Idempotency-Key")+".json"), encoded, 0600); err != nil {
					s.t.Fatal("save actual HTTP failure")
				}
			}
			s.t.Logf("actual HTTP failure code=%s required_action=%s", failure.Error.Code, failure.Error.RequiredAction)
		}
		s.t.Fatalf("HTTP %s returned %d, expected %d", path, response.StatusCode, status)
	}
	if output != nil {
		if err = json.NewDecoder(response.Body).Decode(output); err != nil {
			s.t.Fatal("decode actual HTTP response")
		}
	}
}

func (s *automaticHTTP) job(id string) app.Job {
	var job app.Job
	s.request("GET", "/api/v1/jobs/"+id, nil, http.StatusOK, &job)
	return job
}

func (s *automaticHTTP) finished(id string) app.Job {
	s.t.Helper()
	deadline := time.Now().Add(5 * time.Minute)
	for {
		job := s.job(id)
		if job.Status == "succeeded" || job.Status == "failed" || job.Status == "cancelled" {
			return job
		}
		if time.Now().After(deadline) {
			s.t.Fatal("original job remains unknown; no automatic resend")
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func TestAutomaticHTTPRejectsUntrustedCallerWithoutSideEffects(t *testing.T) {
	s := newAutomaticHTTP(t)
	command := app.RequestDistillationCommand{CommandMeta: localCommand(1), Stage: "content", ProcessingConfig: "selected-public-request", InputRefs: []app.SourceRef{{MaterialID: "unselected", Revision: 1, Locator: "https://github.com/songconmaisaix31-design/Astrocyte"}}}
	body, err := json.Marshal(command)
	if err != nil {
		t.Fatal("encode authorization test request")
	}
	for _, mode := range []string{"no_session", "invalid_agent", "foreign_origin"} {
		t.Run(mode, func(t *testing.T) {
			request, err := http.NewRequest("POST", s.base+"/api/v1/distillations/jobs", bytes.NewReader(body))
			if err != nil {
				t.Fatal("create real authorization request")
			}
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Idempotency-Key", command.IdempotencyKey)
			request.Header.Set("Origin", s.base)
			client := &http.Client{Timeout: 15 * time.Second}
			if mode == "invalid_agent" {
				request.Header.Set("Authorization", "Bearer ungranted")
			}
			if mode == "foreign_origin" {
				client = s.client
				request.Header.Set("Origin", "https://unauthorized.invalid")
				request.Header.Set("X-CSRF-Token", s.csrf)
			}
			response, err := client.Do(request)
			if err != nil {
				t.Fatal("actual authorization HTTP request failed")
			}
			defer response.Body.Close()
			if response.StatusCode != http.StatusForbidden {
				t.Fatalf("actual untrusted %s request returned %d", mode, response.StatusCode)
			}
		})
	}
	db, err := sqlite.Open(filepath.Join(s.dir, "state.sqlite"))
	if err != nil {
		t.Fatal("read actual owned SQLite")
	}
	defer db.Close()
	for _, table := range []string{"attention_jobs", "attention_receipts", "attention_distillations", "attention_materials"} {
		var rows int
		if err = db.Conn().QueryRow("SELECT COUNT(*) FROM " + table).Scan(&rows); err != nil || rows != 0 {
			t.Fatal("permission refusal created durable side effects")
		}
	}
	t.Logf("actual HTTP permission refusals=3; zero durable side effects; evidence=%s", s.dir)
}

func TestProductionTasteHTTPKeepsUnconfiguredStateAfterRestart(t *testing.T) {
	s := newAutomaticHTTP(t)
	read := func() {
		t.Helper()
		var profile app.TasteProfileDetail
		s.request(http.MethodGet, "/api/v1/attention-taste-profile", nil, http.StatusOK, &profile)
		if profile.SchemaVersion != 1 || profile.Configured || profile.Profile != nil {
			t.Fatal("actual main server invented a configured complete Taste profile")
		}
	}
	read()
	s.stop()
	s.start()
	read()
	db, err := sqlite.Open(filepath.Join(s.dir, "state.sqlite"))
	if err != nil {
		t.Fatal("open actual main server database after Taste restart")
	}
	defer db.Close()
	for _, table := range []string{"attention_taste_profiles", "attention_taste_profile_revisions", "attention_jobs", "local_agent_sessions"} {
		var rows int
		if err = db.Conn().QueryRow("SELECT COUNT(*) FROM " + table).Scan(&rows); err != nil || rows != 0 {
			t.Fatal("unconfigured Taste read or restart created configuration or execution state")
		}
	}
	t.Logf("actual main server complete Taste read and process restart; unconfigured state retained; evidence=%s", s.dir)
}

func TestProductionCompletionHTTPMissingSourceSurvivesProcessRestart(t *testing.T) {
	s := newAutomaticHTTPWithRelay(t, true)
	var space app.ProjectSpaceResult
	s.request(http.MethodPost, "/api/v1/project-spaces", app.ProjectSpaceCommand{CommandMeta: localCommand(1), Title: "Actual production completion restart verification"}, http.StatusCreated, &space)
	var registered struct {
		Project workdomain.LocalProject `json:"project"`
	}
	s.request(http.MethodPost, "/api/v1/local-projects", struct {
		app.CommandMeta
		workdomain.RegisterProjectCommand
	}{localCommand(1), workdomain.RegisterProjectCommand{Name: "Actual public completion restart verification", Root: s.root, SpaceID: space.Space.ID}}, http.StatusOK, &registered)
	project := registered.Project
	if project.ID == "" || project.ID == project.Root || project.ID == project.SpaceID {
		t.Fatal("production project registration lost its actual local project identity")
	}
	// 明确缺失的 UUID 只验证拒绝，不创建完成事件或 Interpreter 输出。
	command := app.CaptureCompletionExperienceCommand{CommandMeta: localCommand(1), LocalProjectID: project.ID, EventID: uuid.NewString()}
	t.Setenv("LOCALAPPDATA", filepath.Join(s.dir, "relay-local"))
	relayRoot, err := sqlite.RelayStateRoot()
	if err != nil {
		t.Fatal("resolve original owned Relay directory")
	}
	snapshot := func() workspace.RelayState {
		t.Helper()
		store, err := sqlite.OpenRelayStore(relayRoot)
		if err != nil {
			t.Fatal("open original owned Relay store for independent inspection")
		}
		state, readErr := store.Snapshot(context.Background())
		closeErr := store.Close()
		if readErr != nil || closeErr != nil {
			t.Fatal("read and close original owned Relay store")
		}
		return state
	}
	originalRelay := snapshot()
	if len(originalRelay.Tasks) != 0 || len(originalRelay.Completions) != 0 || len(originalRelay.Receipts) != 0 || len(originalRelay.Sessions) != 0 || len(originalRelay.ControllerEvidence) != 0 {
		t.Fatal("actual fresh Relay store contains completion or execution evidence")
	}
	readCounts := func() (int, int) {
		t.Helper()
		db, err := sqlite.Open(filepath.Join(s.dataDirectory(), "state.sqlite"))
		if err != nil {
			t.Fatal("open original production main database")
		}
		defer func() {
			if err := db.Close(); err != nil {
				t.Error("close independent main database inspection")
			}
		}()
		stored, err := db.LoadProject(context.Background(), project.ID)
		if err != nil || !reflect.DeepEqual(project, stored) {
			t.Fatal("production completion reading changed the actual registered project")
		}
		for _, table := range []string{"attention_engine_experiences", "experience_completion_sources", "attention_jobs", "local_agent_sessions"} {
			var count int
			if err = db.Conn().QueryRow("SELECT COUNT(*) FROM " + table).Scan(&count); err != nil || count != 0 {
				t.Fatal("missing completion created experience, source, job or native session")
			}
		}
		var receipts, events int
		if err = db.Conn().QueryRow("SELECT COUNT(*) FROM attention_receipts").Scan(&receipts); err != nil {
			t.Fatal("read actual main command receipt count")
		}
		if err = db.Conn().QueryRow("SELECT COUNT(*) FROM attention_outbox").Scan(&events); err != nil {
			t.Fatal("read actual main event count")
		}
		return receipts, events
	}
	receipts, events := readCounts()
	verify := func() {
		t.Helper()
		var missing apierrors.ErrorEnvelope
		s.request(http.MethodPost, "/api/v1/experiences/completions", command, http.StatusNotFound, &missing)
		if missing.Error == nil || missing.Error.Code != apierrors.NotFound || missing.Error.RequestID == "" {
			t.Fatal("actual main completion command did not reach the original missing Relay source")
		}
		afterReceipts, afterEvents := readCounts()
		if afterReceipts != receipts || afterEvents != events || !reflect.DeepEqual(originalRelay, snapshot()) {
			t.Fatal("missing completion capture changed an original receipt, event or Relay state")
		}
	}
	verify()
	s.stop()
	s.start()
	verify()
	t.Logf("actual main completion source reading and same-store process restart; original missing command preserved; evidence=%s", s.dir)
}

func TestReadOnlyImportHTTPProcessExitPreservesDeadline(t *testing.T) {
	s := newAutomaticHTTP(t)
	s.stop()
	s.jobSeconds, s.maxAttempts = 2, 3
	s.start()
	var queued app.ImportJobResult
	s.request("POST", "/api/v1/materials/imports", app.ImportMaterialCommand{CommandMeta: localCommand(1), Adapter: "arxiv", Kind: "paper", SourceLocator: "https://arxiv.org/abs/2501.12948v1"}, http.StatusAccepted, &queued)
	var entered app.Job
	deadline := time.Now().Add(2 * time.Second)
	for {
		entered = s.job(queued.JobID)
		if entered.Status == "running" && entered.ExternalStarted {
			break
		}
		if entered.Status == "succeeded" || entered.Status == "failed" || time.Now().After(deadline) {
			t.Fatal("actual read-only interruption window was not observed")
		}
		time.Sleep(5 * time.Millisecond)
	}
	s.stop()
	db, err := sqlite.Open(filepath.Join(s.dir, "state.sqlite"))
	if err != nil {
		t.Fatal("open actual interrupted SQLite")
	}
	var beforePayload, beforeCaller string
	if err = db.Conn().QueryRow("SELECT payload,caller FROM attention_jobs WHERE id=?", entered.JobID).Scan(&beforePayload, &beforeCaller); err != nil {
		db.Close()
		t.Fatal("read actual interrupted request")
	}
	if err = db.Close(); err != nil {
		t.Fatal("close actual interrupted SQLite")
	}
	remaining := time.Until(entered.DeadlineAt)
	if remaining > 3*time.Second {
		t.Fatal("actual test deadline exceeds configured bound")
	}
	if remaining > 0 {
		time.Sleep(remaining + 50*time.Millisecond)
	}
	s.start()
	recovered := s.job(entered.JobID)
	if recovered.Status != "failed" || recovered.DeliveryUnknown || recovered.OperationID != entered.OperationID || !recovered.DeadlineAt.Equal(entered.DeadlineAt) || recovered.Attempts != 1 {
		t.Fatal("actual service restart collapsed safe reads or reset durable budget")
	}
	var rejected apierrors.ErrorEnvelope
	s.request("POST", "/api/v1/jobs/"+entered.JobID+"/retry", localCommand(recovered.Version), http.StatusBadRequest, &rejected)
	if rejected.Error == nil || rejected.Error.Code != apierrors.ValidationFailed {
		t.Fatal("expired actual read accepted a retry")
	}
	db, err = sqlite.Open(filepath.Join(s.dir, "state.sqlite"))
	if err != nil {
		t.Fatal("reopen actual recovered SQLite")
	}
	defer db.Close()
	var afterPayload, afterCaller string
	if err = db.Conn().QueryRow("SELECT payload,caller FROM attention_jobs WHERE id=?", entered.JobID).Scan(&afterPayload, &afterCaller); err != nil {
		t.Fatal("read actual recovered request")
	}
	if afterPayload != beforePayload || afterCaller != beforeCaller {
		t.Fatal("real process restart changed request or caller")
	}
}

func TestSelectedProjectMembershipAndRevocationBeforeNativeStart(t *testing.T) {
	s := newAutomaticHTTP(t)
	var imported app.ImportJobResult
	s.request("POST", "/api/v1/materials/imports", app.ImportMaterialCommand{CommandMeta: localCommand(1), Adapter: "manual", Kind: "text", SourceLocator: "https://github.com/songconmaisaix31-design/Astrocyte", ExportText: "这是固定公开项目权限验证的人工输入参数，未声称外部正文或模型输出。"}, http.StatusAccepted, &imported)
	job := s.finished(imported.JobID)
	if job.Status != "succeeded" || job.MaterialID == nil {
		t.Fatal("actual manual import prerequisite failed")
	}
	var material app.MaterialDetail
	s.request("GET", "/api/v1/materials/"+*job.MaterialID, nil, http.StatusOK, &material)
	var space app.ProjectSpaceResult
	s.request("POST", "/api/v1/project-spaces", app.ProjectSpaceCommand{CommandMeta: localCommand(1), Title: "Public fixed membership verification"}, http.StatusCreated, &space)
	var registered struct {
		Project workdomain.LocalProject `json:"project"`
	}
	s.request("POST", "/api/v1/local-projects", struct {
		app.CommandMeta
		workdomain.RegisterProjectCommand
	}{localCommand(1), workdomain.RegisterProjectCommand{Name: "Public fixed permission validation", Root: s.root, SpaceID: space.Space.ID}}, http.StatusOK, &registered)
	settings := workdomain.ProjectSettings{AllowedActions: []string{"read_context", "start", "observe", "stop"}, AllowedTools: []string{}, ExternalModelCLI: "codex"}
	s.request("PUT", "/api/v1/local-projects/"+registered.Project.ID+"/settings", struct {
		app.CommandMeta
		workdomain.SettingsCommand
	}{localCommand(1), workdomain.SettingsCommand{ExpectedRevision: registered.Project.Settings.Revision, Settings: settings}}, http.StatusOK, &registered)
	command := app.RequestDistillationCommand{CommandMeta: localCommand(1), Stage: "content", ProjectID: registered.Project.ID, CLI: "codex", InputRefs: []app.SourceRef{{MaterialID: material.Material.ID, Revision: 1, Locator: material.Material.SourceLocator}}}
	var denied apierrors.ErrorEnvelope
	s.request("POST", "/api/v1/distillations/jobs", command, http.StatusForbidden, &denied)
	if denied.Error == nil || denied.Error.Code != apierrors.ScopeDenied {
		t.Fatal("unreferenced source entered selected project processing")
	}
	s.request("POST", "/api/v1/project-spaces/"+space.Space.ID+"/references", app.ReferenceMaterialCommand{CommandMeta: localCommand(space.Space.Version), MaterialID: material.Material.ID, Revision: 1}, http.StatusOK, &space)
	command.CommandMeta = localCommand(1)
	var unavailable app.ImportJobResult
	s.request("POST", "/api/v1/distillations/jobs", command, http.StatusAccepted, &unavailable)
	failed := s.finished(unavailable.JobID)
	if failed.Status != "failed" || failed.Error == nil || failed.Error.Code != apierrors.EvidenceMissing || failed.ExternalStarted || failed.DeliveryUnknown || failed.DistillationID != nil {
		t.Fatal("unobserved native configuration claimed external processing")
	}
	settings.ExternalModelCLI = ""
	s.request("PUT", "/api/v1/local-projects/"+registered.Project.ID+"/settings", struct {
		app.CommandMeta
		workdomain.SettingsCommand
	}{localCommand(1), workdomain.SettingsCommand{ExpectedRevision: registered.Project.Settings.Revision, Settings: settings}}, http.StatusOK, &registered)
	command.CommandMeta = localCommand(1)
	command.Question = "模型许可撤销后的新请求"
	s.request("POST", "/api/v1/distillations/jobs", command, http.StatusForbidden, &denied)
	if denied.Error == nil || denied.Error.Code != apierrors.ApprovalRequired {
		t.Fatal("revoked selected model permission entered another processing route")
	}
	db, err := sqlite.Open(filepath.Join(s.dir, "state.sqlite"))
	if err != nil {
		t.Fatal("open actual permission verification SQLite")
	}
	defer db.Close()
	for _, table := range []string{"local_agent_sessions", "attention_distillations", "attention_opportunities"} {
		var count int
		if err = db.Conn().QueryRow("SELECT COUNT(*) FROM " + table).Scan(&count); err != nil || count != 0 {
			t.Fatal("pre-native permission checks produced session, result or candidate")
		}
	}
	var operations int
	if err = db.Conn().QueryRow("SELECT COUNT(*) FROM attention_jobs WHERE json_extract(data,'$.kind')='distillation'").Scan(&operations); err != nil || operations != 1 {
		t.Fatal("denied selected project request created another operation")
	}
	t.Logf("actual selected-project membership and revoked consent verified before native start; evidence=%s", s.dir)
}

// 应用取消和同库重启保持 unknown；原生 Send 和工具配置按 owner 证据另行核验。
func TestAutomaticUnknownSurvivesSQLiteReopenWithoutRetry(t *testing.T) {
	s := newAutomaticHTTP(t)
	var material app.MaterialDetail
	for _, revision := range []string{"v1", "v2"} {
		var receipt app.ImportJobResult
		s.request("POST", "/api/v1/materials/imports", app.ImportMaterialCommand{CommandMeta: localCommand(1), Adapter: "arxiv", Kind: "paper", SourceLocator: "https://arxiv.org/abs/2501.12948" + revision}, http.StatusAccepted, &receipt)
		job := s.finished(receipt.JobID)
		if job.Status != "succeeded" || job.MaterialID == nil {
			t.Fatal("official Atom/PDF import did not succeed")
		}
		s.request("GET", "/api/v1/materials/"+*job.MaterialID, nil, http.StatusOK, &material)
	}
	if material.Material.CurrentRevision != 2 {
		t.Fatal("second source revision missing")
	}
	var oldText app.ContentResult
	s.request("GET", "/api/v1/materials/"+material.Material.ID+"/revisions/1/content", nil, http.StatusOK, &oldText)
	var space app.ProjectSpaceResult
	s.request("POST", "/api/v1/project-spaces", app.ProjectSpaceCommand{CommandMeta: localCommand(1), Title: "Public fixed Attention validation"}, http.StatusCreated, &space)
	s.request("POST", "/api/v1/project-spaces/"+space.Space.ID+"/references", app.ReferenceMaterialCommand{CommandMeta: localCommand(space.Space.Version), MaterialID: material.Material.ID, Revision: 1}, http.StatusOK, &space)
	var registered struct {
		Project workdomain.LocalProject `json:"project"`
	}
	s.request("POST", "/api/v1/local-projects", struct {
		app.CommandMeta
		workdomain.RegisterProjectCommand
	}{localCommand(1), workdomain.RegisterProjectCommand{Name: "Attention owned public worktree", Root: s.root, SpaceID: space.Space.ID}}, http.StatusOK, &registered)
	project := registered.Project
	settings := workdomain.ProjectSettings{AllowedActions: []string{"read_context", "start", "observe", "stop"}, AllowedTools: []string{}, ExternalModelCLI: "codex", AllowAgentControl: true}
	s.request("PUT", "/api/v1/local-projects/"+project.ID+"/settings", struct {
		app.CommandMeta
		workdomain.SettingsCommand
	}{localCommand(1), workdomain.SettingsCommand{ExpectedRevision: project.Settings.Revision, Settings: settings}}, http.StatusOK, &registered)
	var probe struct {
		Session workdomain.NativeSession `json:"session"`
	}
	s.request("POST", "/api/v1/local-projects/"+project.ID+"/sessions/probe", struct {
		app.CommandMeta
		CLI string `json:"cli"`
	}{localCommand(1), "codex"}, http.StatusOK, &probe)
	if probe.Session.NativeID == "" || !probe.Session.StopConfirmed {
		t.Fatal("real native configuration probe or stop missing")
	}
	request := app.RequestDistillationCommand{CommandMeta: localCommand(1), InputRefs: []app.SourceRef{{MaterialID: material.Material.ID, Revision: 1, Locator: material.Revisions[0].SourceLocator}}, Stage: "content", ProcessingConfig: "owned-native-selected-v1", Question: "仅依据选定旧版本说明已知信息及待查问题，保留未知。", ProjectID: project.ID, CLI: "codex"}
	var original app.ImportJobResult
	s.request("POST", "/api/v1/distillations/jobs", request, http.StatusAccepted, &original)
	duplicate := request
	duplicate.CommandMeta = localCommand(1)
	var reused app.ImportJobResult
	s.request("POST", "/api/v1/distillations/jobs", duplicate, http.StatusAccepted, &reused)
	if reused.JobID != original.JobID {
		t.Fatal("dedupe created another native operation")
	}
	var entered app.Job
	deadline := time.Now().Add(30 * time.Second)
	for {
		entered = s.job(original.JobID)
		if entered.Status == "running" && entered.ExternalStarted {
			break
		}
		if entered.Status == "failed" || entered.Status == "succeeded" || time.Now().After(deadline) {
			t.Fatal("native cancellation precondition was not observed")
		}
		time.Sleep(20 * time.Millisecond)
	}
	// ExternalStarted 是应用提交的调用边界；精确原生 Send 证据另行核查。
	var cancelled app.Job
	s.request("POST", "/api/v1/jobs/"+entered.JobID+"/cancel", localCommand(entered.Version), http.StatusOK, &cancelled)
	job := s.finished(original.JobID)
	if job.Status != "cancelled" || !job.DeliveryUnknown || job.Error == nil || job.Error.Code != apierrors.DeliveryUnknown {
		t.Fatal("actual cancellation collapsed unknown delivery")
	}
	db, err := sqlite.Open(filepath.Join(s.dir, "state.sqlite"))
	if err != nil {
		t.Fatal("open real persisted SQLite")
	}
	defer func() { db.Close() }()
	var persistedPayload, persistedCaller string
	if err = db.Conn().QueryRow("SELECT payload,caller FROM attention_jobs WHERE id=?", job.JobID).Scan(&persistedPayload, &persistedCaller); err != nil {
		t.Fatal("read persisted unknown request")
	}
	var payload struct {
		Snapshots []app.SourceSnapshot
		Result    *app.DistillationOutput
	}
	if err = json.Unmarshal([]byte(persistedPayload), &payload); err != nil {
		t.Fatal("decode persisted request")
	}
	if payload.Result != nil {
		t.Fatal("unknown result was fabricated")
	}
	if len(payload.Snapshots) != 1 || payload.Snapshots[0].Ref != request.InputRefs[0] || payload.Snapshots[0].ContentDigest != material.Revisions[0].ContentDigest || payload.Snapshots[0].Text != "" {
		t.Fatal("processor input was not frozen to selected old revision")
	}
	if err = db.Close(); err != nil {
		t.Fatal("close independent SQLite")
	}
	s.stop()
	s.start()
	restarted := s.job(job.JobID)
	if !restarted.DeliveryUnknown || restarted.OperationID != job.OperationID {
		t.Fatal("restart replaced original unknown operation")
	}
	var rejected apierrors.ErrorEnvelope
	s.request("POST", "/api/v1/jobs/"+job.JobID+"/retry", localCommand(restarted.Version), http.StatusConflict, &rejected)
	if rejected.Error == nil || rejected.Error.Code != apierrors.DeliveryUnknown {
		t.Fatal("unknown retry did not preserve delivery_unknown")
	}
	db, err = sqlite.Open(filepath.Join(s.dir, "state.sqlite"))
	if err != nil {
		t.Fatal("reopen persisted SQLite")
	}
	var afterPayload, afterCaller string
	if err = db.Conn().QueryRow("SELECT payload,caller FROM attention_jobs WHERE id=?", job.JobID).Scan(&afterPayload, &afterCaller); err != nil {
		t.Fatal("read reopened unknown request")
	}
	if afterPayload != persistedPayload || afterCaller != persistedCaller {
		t.Fatal("unknown request or caller changed after restart")
	}
	for _, table := range []string{"attention_distillations", "attention_opportunities"} {
		var count int
		if err = db.Conn().QueryRow("SELECT COUNT(*) FROM " + table).Scan(&count); err != nil || count != 0 {
			t.Fatal("unknown processing generated a record or candidate")
		}
	}
	var observed app.MaterialDetail
	s.request("GET", "/api/v1/materials/"+material.Material.ID, nil, http.StatusOK, &observed)
	if observed.Material.HumanUsageCount != material.Material.HumanUsageCount+1 || observed.Material.AgentUsageCount != material.Material.AgentUsageCount+1 {
		t.Fatal("model retrieval changed human signals or was counted twice")
	}
	var content app.ContentResult
	s.request("GET", "/api/v1/materials/"+material.Material.ID+"/revisions/1/content", nil, http.StatusOK, &content)
	if content.Text != oldText.Text {
		t.Fatal("unknown processing lost original material")
	}
	var operations int
	if err = db.Conn().QueryRow("SELECT COUNT(*) FROM attention_jobs WHERE json_extract(data,'$.kind')='distillation'").Scan(&operations); err != nil || operations != 1 {
		t.Fatal("restart or rejected retry resent unknown work")
	}
	t.Logf("actual HTTP/SQLite application cancellation persisted; source revisions=2 durable operations=%d; evidence=%s", operations, s.dir)
}
