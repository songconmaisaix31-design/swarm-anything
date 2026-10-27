package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

const caller = "swa-codex-n3-20261022"
const publicRoot = "/workspace/swa-public-case-20261022/public-project"
const projectName = "SWA Codex N3 public stats"
const spaceTitle = "SWA Codex N3 public stats 20261022"
const requiredGo = "go1.27.2"
const piProfile = "stepfun-pi-n3"
const piN4Profile = "stepfun-pi-n4"
const piN6Profile = "stepfun-pi-n6"
const piQuestionsProfile = "stepfun-pi-questions"
const openCodeSingleProfile = "stepfun-opencode-single"
const openCodeN4Profile = "stepfun-opencode-n4"
const openCodeN6Profile = "stepfun-opencode-n6"

var stages = []string{"session", "space", "project", "observe-settings", "observe-grant", "observe-token", "execute-settings", "execute-grant", "execute-token", "revoke"}
var actions = []string{"read_context", "observe", "start", "send", "stop"}

type executionPackage struct {
	SchemaVersion      int               `json:"schema_version"`
	Profile            string            `json:"profile,omitempty"`
	Installation       string            `json:"installation"`
	Revision           string            `json:"source_revision"`
	DataRoot           string            `json:"data_root,omitempty"`
	Project            string            `json:"project"`
	Endpoint           string            `json:"endpoint"`
	CodexSourceHome    string            `json:"codex_api_key_home,omitempty"`
	PiSourceHome       string            `json:"pi_source_home,omitempty"`
	OpenCodeSourceHome string            `json:"opencode_api_key_home,omitempty"`
	ProtectedRoots     []string          `json:"protected_roots"`
	SourceRepository   string            `json:"source_repository"`
	EvidenceRoot       string            `json:"evidence_root"`
	ReadyFile          string            `json:"ready_file,omitempty"`
	ProofFile          string            `json:"live_proof_file,omitempty"`
	LaunchFile         string            `json:"launch_record_file,omitempty"`
	ExpectedRuntimeID  string            `json:"expected_runtime_id,omitempty"`
	ReadySHA           string            `json:"ready_sha256,omitempty"`
	ProofSHA           string            `json:"live_proof_sha256,omitempty"`
	LaunchSHA          string            `json:"launch_record_sha256,omitempty"`
	OwnerHandoffFile   string            `json:"owner_handoff_file,omitempty"`
	OwnerHandoffSHA    string            `json:"owner_handoff_sha256,omitempty"`
	QuestionGUIFile    string            `json:"question_gui_file,omitempty"`
	QuestionGUISHA     string            `json:"question_gui_sha256,omitempty"`
	QuestionScenario   string            `json:"question_scenario,omitempty"`
	BaselineFile       string            `json:"question_baseline_file,omitempty"`
	BaselineSHA        string            `json:"question_baseline_sha256,omitempty"`
	DriverSHA          string            `json:"driver_sha256,omitempty"`
	DefinitionSHA      string            `json:"public_definition_sha256,omitempty"`
	DriverSourceSHA    map[string]string `json:"driver_dependency_sha256,omitempty"`
	ConsumerSHA        string            `json:"offline_consumer_sha256,omitempty"`
	HelperSHA          string            `json:"helper_binary_sha256,omitempty"`
	NodeSHA            string            `json:"installed_node_sha256,omitempty"`
	SWASHA             string            `json:"installed_swa_sha256,omitempty"`
	HostConsumerSHA    string            `json:"windows_host_consumer_sha256,omitempty"`
	Caller             string            `json:"caller"`
	Agent              string            `json:"agent"`
	Model              string            `json:"model"`
	Workers            int               `json:"workers"`
	AllowRevoke        bool              `json:"delegate_final_revoke"`
	RevokeAfterUnknown bool              `json:"delegate_revoke_after_human_unknown"`
	Requests           map[string]string `json:"request_intents"`
}

type profileScope struct {
	agent, model, caller, project, space, version, provider, accountSource string
	sourceName, sourceHome                                                 string
	dependencies                                                           []string
	workers                                                                int
	projectRoot                                                            string
}

type hostPathSet struct {
	node, swa, server, platform, project string
}

func isOpenCodeProfile(profile string) bool {
	return profile == openCodeSingleProfile || profile == openCodeN4Profile || profile == openCodeN6Profile
}

func fixedProfile(p executionPackage) (profileScope, error) {
	if p.Profile != piQuestionsProfile && (p.OwnerHandoffFile != "" || p.OwnerHandoffSHA != "" || p.QuestionGUIFile != "" || p.QuestionGUISHA != "" || p.QuestionScenario != "" || p.BaselineFile != "" || p.BaselineSHA != "") {
		return profileScope{}, fail("question_fields_require_question_profile")
	}
	if p.Profile == piQuestionsProfile {
		switch p.QuestionScenario {
		case "full":
			if p.BaselineFile != "" || p.BaselineSHA != "" {
				return profileScope{}, fail("question_full_forbids_baseline")
			}
		case "answer-conflict":
			if p.BaselineFile == "" || p.BaselineSHA == "" {
				return profileScope{}, fail("question_conflict_requires_explicit_baseline")
			}
		default:
			return profileScope{}, fail("fixed_question_scenario_required")
		}
	}
	scope := profileScope{
		agent: "codex", model: "gpt-5.5", caller: caller, project: projectName, space: spaceTitle,
		version: "0.163.0", provider: "openai", accountSource: "codex-native-api-key",
		sourceName: "codex_api_key_home", sourceHome: p.CodexSourceHome,
		dependencies: []string{"driver-failure.mjs", "codex-event-view.mjs", "prepare-source-observer.mjs", "source-observer-entry.ts", "extract-observer-source.py", "pi-event-view.mjs"},
		workers:      3,
	}
	switch p.Profile {
	case "":
		if p.PiSourceHome != "" || p.OpenCodeSourceHome != "" {
			return profileScope{}, fail("source_does_not_match_profile")
		}
	case piProfile, piN4Profile, piN6Profile, piQuestionsProfile:
		if p.CodexSourceHome != "" || p.OpenCodeSourceHome != "" {
			return profileScope{}, fail("source_does_not_match_profile")
		}
		if p.Profile == piN4Profile {
			scope.workers = 4
		} else if p.Profile == piN6Profile {
			scope.workers = 6
		}
		count := strconv.Itoa(scope.workers)
		scope.agent, scope.model, scope.caller = "pi", "stepfun/step-3.5-flash", "swa-stepfun-pi-n"+count+"-20261023"
		scope.project, scope.space = "SWA StepFun Pi N"+count+" public stats", "SWA StepFun Pi N"+count+" public stats 20261023"
		scope.version, scope.provider, scope.accountSource = "1.0.1", "stepfun", "pi-api-key-file"
		scope.sourceName, scope.sourceHome = "pi_source_home", p.PiSourceHome
		scope.dependencies = append(scope.dependencies, "pi-source-observer-entry.ts")
		if p.Profile == piQuestionsProfile {
			scope.workers = 2
			scope.caller = "swa-stepfun-pi-questions-20261023"
			scope.project, scope.space = "SWA StepFun Pi questions public stats", "SWA StepFun Pi questions public stats 20261023"
			scope.dependencies = append(scope.dependencies, "public-case-definition.mjs", "pi-question-event-view.mjs")
		}
	case openCodeSingleProfile, openCodeN4Profile, openCodeN6Profile:
		if p.CodexSourceHome != "" || p.PiSourceHome != "" {
			return profileScope{}, fail("source_does_not_match_profile")
		}
		label := "SINGLE"
		scope.workers = 1
		if p.Profile == openCodeN4Profile {
			label = "N4"
			scope.workers = 4
		} else if p.Profile == openCodeN6Profile {
			label = "N6"
			scope.workers = 6
		}
		scope.agent, scope.model, scope.caller = "opencode", "stepfun/step-3.5-flash", "swa-stepfun-opencode-"+strings.ToLower(label)+"-20261023"
		scope.project, scope.space = "SWA StepFun OpenCode "+label+" public stats", "SWA StepFun OpenCode "+label+" public stats 20261023"
		scope.version, scope.provider, scope.accountSource = "2.0.31", "stepfun", "opencode-native-stepfun-api-key"
		scope.sourceName, scope.sourceHome = "opencode_api_key_home", p.OpenCodeSourceHome
		scope.dependencies = append(scope.dependencies, "opencode-event-view.mjs", "opencode-source-observer-entry.ts")
	default:
		return profileScope{}, fail("reviewed_profile_required")
	}
	paths, err := hostPaths(p)
	if err != nil {
		return profileScope{}, err
	}
	scope.projectRoot = paths.project
	if p.SchemaVersion != 1 || p.Caller != scope.caller || p.Agent != scope.agent || p.Model != scope.model || p.Workers != scope.workers || p.Project != scope.projectRoot {
		return profileScope{}, fail("fixed_public_case_scope_required")
	}
	return scope, nil
}

type classifiedError struct {
	Code      string
	Stage     string
	RequestID string
	HTTP      int
}

func (e *classifiedError) Error() string { return e.Code }
func fail(code string) error             { return &classifiedError{Code: code} }
func require(ok bool, code string) error {
	if !ok {
		return fail(code)
	}
	return nil
}
func safeError(err error) map[string]any {
	var known *classifiedError
	if errors.As(err, &known) {
		return map[string]any{"code": known.Code, "stage": known.Stage, "request_id": known.RequestID, "http_status": known.HTTP}
	}
	return map[string]any{"code": "local_operation_failed"}
}

func hashFile(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err = io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
func hashBytes(body []byte) string { sum := sha256.Sum256(body); return hex.EncodeToString(sum[:]) }
func readBounded(path string, maximum int64) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	body, err := io.ReadAll(io.LimitReader(file, maximum+1))
	if err != nil || int64(len(body)) > maximum {
		return nil, fail("bounded_file_required")
	}
	return body, nil
}
func inside(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && !filepath.IsAbs(rel) && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
func plain(path string, directory, private bool) error {
	if !filepath.IsAbs(path) || filepath.Clean(path) != path {
		return fail("absolute_canonical_path_required")
	}
	canonical, err := filepath.EvalSymlinks(path)
	if err != nil || canonical != path {
		return fail("ordinary_path_required")
	}
	for current := path; ; current = filepath.Dir(current) {
		if err := checkHostPathComponent(current); err != nil {
			return err
		}
		info, err := os.Lstat(current)
		if err != nil || info.Mode()&os.ModeSymlink != 0 {
			return fail("ordinary_path_required")
		}
		if current == path {
			if directory && !info.IsDir() || !directory && !info.Mode().IsRegular() {
				return fail("ordinary_path_required")
			}
			if private {
				if err := checkHostPrivatePath(path, directory); err != nil {
					return err
				}
			}
		} else if !info.IsDir() {
			return fail("ordinary_ancestor_required")
		}
		if filepath.Dir(current) == current {
			return nil
		}
	}
}
func readJSON(path string, value any, private bool) error {
	if err := plain(path, false, private); err != nil {
		return err
	}
	body, err := readBounded(path, 1<<20)
	if err != nil {
		return fail("bounded_json_required")
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return fail("invalid_package_json")
	}
	if decoder.Decode(new(any)) != io.EOF {
		return fail("one_json_document_required")
	}
	return nil
}
func persist(path string, value any) error {
	body, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	file, err := createHostPrivateFile(path)
	if err != nil {
		return err
	}
	_, writeErr := file.Write(append(body, '\n'))
	syncErr := file.Sync()
	closeErr := file.Close()
	return errors.Join(writeErr, syncErr, closeErr)
}
func checkedEndpoint(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "http" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.Port() == "" || u.Hostname() != "127.0.0.1" && u.Hostname() != "::1" {
		return fail("explicit_loopback_origin_required")
	}
	port, err := strconv.Atoi(u.Port())
	if err != nil || port < 1 || port > 65535 {
		return fail("explicit_loopback_origin_required")
	}
	return nil
}
func driverPath(p executionPackage) string {
	if p.Profile == piQuestionsProfile {
		return filepath.Join(p.SourceRepository, "tests/swa-product-acceptance/run-question-installed.mjs")
	}
	return filepath.Join(p.SourceRepository, "tests/swa-product-acceptance/run-installed.mjs")
}
func definitionPath(p executionPackage) string {
	if p.Profile == piQuestionsProfile {
		return filepath.Join(p.SourceRepository, "tests/swa-product-acceptance/question-case-definition.mjs")
	}
	return filepath.Join(p.SourceRepository, "tests/swa-product-acceptance/public-case-definition.mjs")
}
func consumerPath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Join(filepath.Dir(exe), "public-case-preflight.mjs"), nil
}

func bindHash(path string, expected *string, prepare bool) error {
	if err := plain(path, false, false); err != nil {
		return err
	}
	actual, err := hashFile(path)
	if err != nil {
		return err
	}
	if prepare && *expected == "" {
		*expected = actual
	}
	return require(*expected == actual, "approved_source_bytes_changed")
}
func gitSource(p executionPackage, relative, path string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", "-c", "core.fsmonitor=false", "-c", "core.hooksPath="+filepath.Join(filepath.Dir(p.Project), "empty-hooks"), "-C", p.SourceRepository, "show", p.Revision+":"+relative)
	cmd.Env = childEnvironment(p.EvidenceRoot)
	body, err := runBounded(cmd, 8<<20, 64<<10)
	if err != nil {
		return fail("installed_revision_source_unavailable")
	}
	actual, err := hashFile(path)
	if err != nil || actual != hashBytes(body) {
		return fail("driver_source_differs_from_installed_revision")
	}
	return nil
}

func offline(p *executionPackage, prepare bool) ([]string, error) {
	if err := checkHostRuntime(); err != nil {
		return nil, err
	}
	if err := checkedEndpoint(p.Endpoint); err != nil {
		return nil, err
	}
	scope, err := fixedProfile(*p)
	if err != nil {
		return nil, err
	}
	paths, err := hostPaths(*p)
	if err != nil {
		return nil, err
	}
	if id, err := hex.DecodeString(p.Revision); err != nil || len(id) != 20 || strings.ToLower(p.Revision) != p.Revision {
		return nil, fail("exact_source_revision_required")
	}
	for _, root := range []string{p.Installation, p.SourceRepository, p.Project} {
		if err := plain(root, true, root != p.SourceRepository); err != nil {
			return nil, err
		}
	}
	if err := plain(filepath.Dir(p.EvidenceRoot), true, false); err != nil {
		return nil, err
	}
	if !filepath.IsAbs(p.EvidenceRoot) || filepath.Clean(p.EvidenceRoot) != p.EvidenceRoot {
		return nil, fail("absolute_evidence_root_required")
	}
	for _, root := range []string{p.Installation, p.SourceRepository, p.Project} {
		if inside(root, p.EvidenceRoot) || inside(p.EvidenceRoot, root) {
			return nil, fail("evidence_overlaps_input_root")
		}
	}
	if isOpenCodeProfile(p.Profile) {
		if err := openCodeOwnerLayout(*p); err != nil {
			return nil, err
		}
	}
	for _, name := range []string{"VERSION", "PLATFORM", "EDITION"} {
		if err := plain(filepath.Join(p.Installation, name), false, false); err != nil {
			return nil, err
		}
	}
	version, err := readBounded(filepath.Join(p.Installation, "VERSION"), 4096)
	if err != nil || strings.TrimSpace(string(version)) != p.Revision {
		return nil, fail("installation_version_mismatch")
	}
	platform, err := readBounded(filepath.Join(p.Installation, "PLATFORM"), 4096)
	if err != nil || strings.TrimSpace(string(platform)) != paths.platform {
		return nil, fail("installation_platform_mismatch")
	}
	edition, err := readBounded(filepath.Join(p.Installation, "EDITION"), 4096)
	if err != nil || strings.TrimSpace(string(edition)) != "cli" && strings.TrimSpace(string(edition)) != "combined" {
		return nil, fail("installation_edition_mismatch")
	}
	if p.Profile == piQuestionsProfile && strings.TrimSpace(string(edition)) != "combined" {
		return nil, fail("question_gui_requires_combined_installation")
	}
	consumer, err := consumerPath()
	if err != nil {
		return nil, err
	}
	executable, err := os.Executable()
	if err != nil {
		return nil, err
	}
	for _, entry := range []struct {
		path     string
		expected *string
	}{
		{driverPath(*p), &p.DriverSHA}, {definitionPath(*p), &p.DefinitionSHA}, {consumer, &p.ConsumerSHA}, {executable, &p.HelperSHA},
		{paths.node, &p.NodeSHA}, {paths.swa, &p.SWASHA},
	} {
		if err := bindHash(entry.path, entry.expected, prepare); err != nil {
			return nil, err
		}
	}
	if err := gitSource(*p, "tests/swa-product-acceptance/"+filepath.Base(definitionPath(*p)), definitionPath(*p)); err != nil {
		return nil, err
	}
	if err := gitSource(*p, "tests/swa-product-acceptance/"+filepath.Base(driverPath(*p)), driverPath(*p)); err != nil {
		return nil, err
	}
	if err := bindHostConsumer(p, prepare); err != nil {
		return nil, err
	}
	dependencies := scope.dependencies
	if prepare && p.DriverSourceSHA == nil {
		p.DriverSourceSHA = map[string]string{}
	}
	if len(p.DriverSourceSHA) != len(dependencies) && !prepare {
		return nil, fail("exact_driver_dependency_pins_required")
	}
	for _, name := range dependencies {
		relative := "tests/swa-product-acceptance/" + name
		path := filepath.Join(p.SourceRepository, filepath.FromSlash(relative))
		expected := p.DriverSourceSHA[name]
		if err := bindHash(path, &expected, prepare); err != nil {
			return nil, err
		}
		p.DriverSourceSHA[name] = expected
		if err := gitSource(*p, relative, path); err != nil {
			return nil, err
		}
	}
	if len(p.DriverSourceSHA) != len(dependencies) {
		return nil, fail("exact_driver_dependency_pins_required")
	}
	if p.Requests == nil {
		p.Requests = map[string]string{}
	}
	seen := map[string]bool{}
	for _, stage := range stages {
		if prepare && p.Requests[stage] == "" {
			id, err := uuid.NewRandom()
			if err != nil {
				return nil, err
			}
			p.Requests[stage] = id.String()
		}
		id, err := uuid.Parse(p.Requests[stage])
		if err != nil || id.String() != p.Requests[stage] || seen[id.String()] {
			return nil, fail("distinct_canonical_request_intents_required")
		}
		seen[id.String()] = true
	}
	if p.RevokeAfterUnknown && !p.AllowRevoke {
		return nil, fail("independent_revoke_delegation_inconsistent")
	}
	missing, err := privateRuntimeRoots(*p, scope)
	if err != nil {
		return nil, err
	}
	if p.ExpectedRuntimeID == "" {
		missing = append(missing, "expected_runtime_id")
	}
	for _, entry := range []struct {
		name, path string
		expected   *string
	}{{"ready_file", p.ReadyFile, &p.ReadySHA}, {"live_proof_file", p.ProofFile, &p.ProofSHA}, {"launch_record_file", p.LaunchFile, &p.LaunchSHA}} {
		if entry.path == "" {
			missing = append(missing, entry.name)
		} else {
			if !inside(p.EvidenceRoot, entry.path) || filepath.Base(entry.path) == "auth.json" || filepath.Base(entry.path) == "settings.json" {
				return nil, fail("service_wire_outside_this_evidence_root")
			}
			if err := plain(entry.path, false, true); err != nil {
				return nil, err
			}
			if err := bindHash(entry.path, entry.expected, prepare); err != nil {
				return nil, err
			}
		}
	}
	if p.Profile == piQuestionsProfile {
		if p.OwnerHandoffFile == "" {
			missing = append(missing, "owner_handoff_file")
		} else {
			if p.OwnerHandoffFile != filepath.Join(p.EvidenceRoot, "service-handoff.json") {
				return nil, fail("question_owner_handoff_path_mismatch")
			}
			if err := plain(p.OwnerHandoffFile, false, true); err != nil {
				return nil, err
			}
			if err := bindHash(p.OwnerHandoffFile, &p.OwnerHandoffSHA, prepare); err != nil {
				return nil, err
			}
		}
		if p.QuestionGUIFile == "" {
			missing = append(missing, "question_gui_file")
		} else {
			if p.QuestionGUIFile != filepath.Join(p.SourceRepository, ".verification/cloud-setup/question-gui-installed.mjs") {
				return nil, fail("fixed_question_gui_path_required")
			}
			if p.QuestionGUISHA == "" {
				missing = append(missing, "question_gui_sha256")
			} else if err := bindHash(p.QuestionGUIFile, &p.QuestionGUISHA, false); err != nil {
				// ignored GUI 仅采用 Root 审定的准确 SHA，不自动采纳或冒称安装 Git 源。
				return nil, err
			}
		}
		if p.QuestionScenario == "answer-conflict" {
			if err := checkQuestionBaseline(*p); err != nil {
				return nil, err
			}
		}
	}
	return missing, nil
}

func checkQuestionBaseline(p executionPackage) error {
	if filepath.Base(p.BaselineFile) != "question-baseline.json" || filepath.Base(filepath.Dir(p.BaselineFile)) != "driver-report" {
		return fail("fixed_question_baseline_path_required")
	}
	for _, root := range []string{p.Installation, p.SourceRepository, p.Project, p.DataRoot, p.PiSourceHome, p.EvidenceRoot} {
		if root != "" && inside(root, p.BaselineFile) {
			return fail("question_baseline_overlaps_current_scope")
		}
	}
	if err := plain(filepath.Dir(p.BaselineFile), true, true); err != nil {
		return err
	}
	if err := plain(p.BaselineFile, false, true); err != nil {
		return err
	}
	body, err := readBounded(p.BaselineFile, 1<<20)
	if err != nil {
		return err
	}
	return require(p.BaselineSHA == hashBytes(body), "approved_question_baseline_bytes_changed")
}

func privateRuntimeRoots(p executionPackage, scope profileScope) ([]string, error) {
	var missing []string
	for _, entry := range []struct{ name, path string }{{"data_root", p.DataRoot}, {scope.sourceName, scope.sourceHome}} {
		if entry.path == "" {
			missing = append(missing, entry.name)
			continue
		}
		if err := plain(entry.path, true, true); err != nil {
			return nil, err
		}
		for _, root := range []string{p.Installation, p.SourceRepository, p.Project, p.EvidenceRoot} {
			if inside(root, entry.path) || inside(entry.path, root) {
				return nil, fail("private_runtime_root_overlaps_other_scope")
			}
		}
	}
	if p.DataRoot != "" && scope.sourceHome != "" && (inside(p.DataRoot, scope.sourceHome) || inside(scope.sourceHome, p.DataRoot)) {
		return nil, fail("source_overlaps_product_data")
	}
	for _, protected := range p.ProtectedRoots {
		if err := plain(protected, true, false); err != nil {
			return nil, err
		}
		for _, root := range []string{p.Installation, p.DataRoot, scope.sourceHome} {
			if root != "" && (inside(protected, root) || inside(root, protected)) {
				return nil, fail("runtime_root_overlaps_protected_root")
			}
		}
	}
	return missing, nil
}

func checkPublic(p executionPackage) (json.RawMessage, error) {
	scope, err := fixedProfile(p)
	if err != nil {
		return nil, err
	}
	paths, err := hostPaths(p)
	if err != nil {
		return nil, err
	}
	consumer, err := consumerPath()
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	args := []string{consumer, definitionPath(p), p.Project, strconv.Itoa(scope.workers)}
	if p.Profile == piQuestionsProfile {
		args = append(args, "native-questions")
	} else if p.Profile == openCodeSingleProfile {
		args = append(args, "opencode-single")
	}
	cmd := exec.CommandContext(ctx, paths.node, args...)
	cmd.Env = childEnvironment(p.EvidenceRoot)
	stdout, err := runBounded(cmd, 64<<10, 64<<10)
	if err != nil {
		return nil, fail("fixed_public_input_verification_failed")
	}
	var observed struct {
		Status  string `json:"status"`
		Workers int    `json:"workers"`
	}
	if json.Unmarshal(stdout, &observed) != nil || observed.Status != "VERIFIED_FIXED_PUBLIC_INPUT" || observed.Workers != scope.workers {
		return nil, fail("fixed_public_input_verification_failed")
	}
	return append(json.RawMessage(nil), stdout...), nil
}

type readyWire struct {
	OK        bool   `json:"ok"`
	HTTP      string `json:"http"`
	Data      string `json:"data_root"`
	Install   string `json:"install_root"`
	NodePID   int    `json:"runtime_pid"`
	ServerPID int    `json:"server_pid"`
	Readiness struct {
		RuntimeID string `json:"runtimeId"`
		Data      string `json:"dataRoot"`
		Node      string `json:"node"`
	} `json:"readiness"`
}

// This is only the original serve owner's non-secret spawn record, not a product wire.
type launchBase struct {
	Installation string `json:"installation"`
	Revision     string `json:"source_revision"`
	DataRoot     string `json:"data_root"`
	Endpoint     string `json:"endpoint"`
	ServePID     int    `json:"serve_pid"`
}
type launchWire struct {
	launchBase
	CodexSourceHome string `json:"codex_api_key_home"`
}
type piLaunchWire struct {
	launchBase
	PiSourceHome string `json:"pi_source_home"`
}
type openCodeLaunchWire struct {
	launchBase
	OpenCodeSourceHome string `json:"opencode_api_key_home"`
}

// 本轮只消费原 owner 已保存的非秘密交接，不生成或改写其来源记录。
type questionOwnerHandoffWire struct {
	launchBase
	Status            string   `json:"status"`
	PiSourceHome      string   `json:"pi_source_home"`
	EvidenceRoot      string   `json:"evidence_root"`
	ExpectedRuntimeID string   `json:"expected_runtime_id"`
	LaunchFile        string   `json:"launch_record_file"`
	LaunchSHA         string   `json:"launch_record_sha256"`
	ReadyFile         string   `json:"ready_file"`
	ReadySHA          string   `json:"ready_sha256"`
	ProofFile         string   `json:"live_proof_file"`
	ProofSHA          string   `json:"live_proof_sha256"`
	ProtectedRoots    []string `json:"protected_roots"`
	HoldUntil         string   `json:"hold_until"`
	Authorization     string   `json:"authorization"`
	Account           string   `json:"account"`
	ProviderCalls     *int     `json:"provider_calls_by_producer"`
	ModelCalls        *int     `json:"model_calls_by_producer"`
}

func readQuestionOwnerHandoff(p executionPackage) (questionOwnerHandoffWire, time.Time, error) {
	var owner questionOwnerHandoffWire
	if p.Profile != piQuestionsProfile || p.OwnerHandoffFile != filepath.Join(p.EvidenceRoot, "service-handoff.json") || p.OwnerHandoffSHA == "" {
		return owner, time.Time{}, fail("fixed_question_owner_handoff_required")
	}
	if err := plain(p.EvidenceRoot, true, true); err != nil {
		return owner, time.Time{}, err
	}
	if err := readWire(p.OwnerHandoffFile, &owner, p.OwnerHandoffSHA); err != nil {
		return owner, time.Time{}, err
	}
	if owner.Status != "SERVICE_BASELINE_OBSERVED" || owner.Installation != p.Installation || owner.Revision != p.Revision || owner.DataRoot != p.DataRoot || owner.Endpoint != p.Endpoint || owner.PiSourceHome != p.PiSourceHome || owner.EvidenceRoot != p.EvidenceRoot || owner.ExpectedRuntimeID != p.ExpectedRuntimeID || owner.ServePID <= 0 || !reflect.DeepEqual(owner.ProtectedRoots, p.ProtectedRoots) || owner.Authorization != "REQUIRES_EXACT_USER_DELEGATION" || owner.Account != "NOT_VERIFIED" || owner.ProviderCalls == nil || *owner.ProviderCalls != 0 || owner.ModelCalls == nil || *owner.ModelCalls != 0 {
		return owner, time.Time{}, fail("question_owner_handoff_scope_mismatch")
	}
	if owner.ReadyFile != p.ReadyFile || owner.ReadyFile != filepath.Join(p.EvidenceRoot, "ready.json") || owner.ReadySHA != p.ReadySHA || owner.LaunchFile != p.LaunchFile || owner.LaunchFile != filepath.Join(p.EvidenceRoot, "pi-launch-record.json") || owner.LaunchSHA != p.LaunchSHA || owner.ProofFile != p.ProofFile || owner.ProofFile != filepath.Join(p.EvidenceRoot, "live-proof.json") || owner.ProofSHA != p.ProofSHA {
		return owner, time.Time{}, fail("question_owner_handoff_wire_mismatch")
	}
	deadline, err := time.Parse(time.RFC3339Nano, owner.HoldUntil)
	if err != nil || !deadline.After(time.Now()) {
		return owner, time.Time{}, fail("question_owner_hold_expired_or_invalid")
	}
	return owner, deadline, nil
}

func readWire(path string, value any, expectedSHA string) error {
	if err := plain(path, false, true); err != nil {
		return err
	}
	body, err := readBounded(path, 1<<20)
	if err != nil {
		return fail("bounded_service_wire_required")
	}
	if expectedSHA != "" && hashBytes(body) != expectedSHA {
		return fail("approved_service_wire_bytes_changed")
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	switch value.(type) {
	case *launchWire, *piLaunchWire, *openCodeLaunchWire, *questionOwnerHandoffWire:
		decoder.DisallowUnknownFields()
	}
	if err = decoder.Decode(value); err != nil || decoder.Decode(new(any)) != io.EOF {
		return fail("actual_service_wire_invalid")
	}
	return nil
}
func openCodeOwnerLayout(p executionPackage) error {
	if filepath.Base(p.DataRoot) != "data" || p.EvidenceRoot != filepath.Join(filepath.Dir(p.DataRoot), "evidence") || p.ReadyFile != filepath.Join(p.EvidenceRoot, "ready.json") || p.ProofFile != filepath.Join(p.EvidenceRoot, "live-proof.json") || p.LaunchFile != filepath.Join(p.EvidenceRoot, "opencode-launch-record.json") {
		return fail("fixed_opencode_owner_layout_required")
	}
	return plain(p.EvidenceRoot, true, true)
}

type humanClient struct {
	p              executionPackage
	client         *http.Client
	transport      *http.Transport
	csrf           string
	unknown        bool
	grantConfirmed bool
	projectID      string
	runtimeID      string
}

func newHumanClient(p executionPackage) (*humanClient, error) {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return nil, err
	}
	protocols := new(http.Protocols)
	protocols.SetHTTP1(true)
	transport := &http.Transport{Proxy: nil, Protocols: protocols, DisableKeepAlives: true, MaxIdleConnsPerHost: -1, ResponseHeaderTimeout: 30 * time.Second}
	client := &http.Client{Jar: jar, Transport: transport, Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	return &humanClient{p: p, client: client, transport: transport}, nil
}
func (c *humanClient) request(stage, method, path string, body any, want int) ([]byte, error) {
	actualRuntime, err := serviceIdentity(c.p)
	if err != nil {
		return nil, err
	}
	if actualRuntime != c.runtimeID || actualRuntime != c.p.ExpectedRuntimeID {
		return nil, fail("fixed_service_runtime_changed")
	}
	var payload []byte
	if body != nil {
		payload, err = json.Marshal(body)
		if err != nil {
			return nil, err
		}
	}
	intent := map[string]any{"local_intent_id": c.p.Requests[stage], "method": method, "path": path, "state": "PREPARED_NO_EFFECT_PROOF"}
	if len(payload) > 0 {
		intent["request_id"] = c.p.Requests[stage]
		intent["body"] = body
		intent["body_sha256"] = hashBytes(payload)
	}
	if stage != "health" && stage != "list-projects" && stage != "list-spaces" {
		if err := persist(filepath.Join(c.p.EvidenceRoot, "human-"+stage+".intent.json"), intent); err != nil {
			return nil, err
		}
	}
	req, err := http.NewRequest(method, c.p.Endpoint+path, io.NopCloser(bytes.NewReader(payload)))
	if err != nil {
		return nil, err
	}
	req.ContentLength = int64(len(payload))
	req.GetBody = nil
	req.Close = true
	if len(payload) == 0 {
		req.Body = nil
	}
	req.Header.Set("Origin", c.p.Endpoint)
	if len(payload) > 0 {
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", c.p.Requests[stage])
		req.Header.Set("X-CSRF-Token", c.csrf)
	}
	response, err := c.client.Do(req)
	unknown := func(status int) error {
		if stage != "health" && stage != "list-projects" && stage != "list-spaces" {
			c.unknown = true
		}
		return &classifiedError{Code: "human_effect_or_response_unknown", Stage: stage, RequestID: c.p.Requests[stage], HTTP: status}
	}
	if err != nil {
		return nil, unknown(0)
	}
	defer response.Body.Close()
	result, err := io.ReadAll(io.LimitReader(response.Body, 1<<20+1))
	if err != nil || len(result) > 1<<20 || response.StatusCode != want {
		return nil, unknown(response.StatusCode)
	}
	if !json.Valid(result) {
		return nil, unknown(response.StatusCode)
	}
	if stage != "health" && stage != "list-projects" && stage != "list-spaces" {
		if err := persist(filepath.Join(c.p.EvidenceRoot, "human-"+stage+".response-metadata.json"), map[string]any{"stage": stage, "request_id": c.p.Requests[stage], "http_status": response.StatusCode, "response": "COMPLETE_JSON_IN_MEMORY_ONLY"}); err != nil {
			return nil, unknown(response.StatusCode)
		}
	}
	return result, nil
}
func (c *humanClient) command(stage, method, path string, fields map[string]any, want int) ([]byte, error) {
	fields["schema_version"] = 1
	fields["request_id"] = c.p.Requests[stage]
	fields["expected_version"] = 1
	return c.request(stage, method, path, fields, want)
}
func field[T any](body []byte, name string) (T, error) {
	var value T
	var envelope map[string]json.RawMessage
	if json.Unmarshal(body, &envelope) != nil || json.Unmarshal(envelope[name], &value) != nil {
		return value, fail("actual_response_field_missing")
	}
	return value, nil
}
func readSpaceReceipt(body []byte, title string) (domain.ProjectSpace, error) {
	var result struct {
		SchemaVersion int                 `json:"schema_version"`
		Space         domain.ProjectSpace `json:"space"`
	}
	if json.Unmarshal(body, &result) != nil || result.SchemaVersion != 1 || result.Space.ID == "" || strings.TrimSpace(result.Space.ID) != result.Space.ID || result.Space.Version != 1 || result.Space.Title != title || result.Space.MaterialRefs == nil || len(result.Space.MaterialRefs) != 0 || result.Space.CreatedAt.IsZero() {
		return domain.ProjectSpace{}, fail("actual_space_receipt_missing")
	}
	return result.Space, nil
}
func (c *humanClient) receipt(stage string, fields map[string]any) error {
	fields["stage"] = stage
	fields["local_intent_id"] = c.p.Requests[stage]
	fields["runtime_id"] = c.runtimeID
	fields["state"] = "VERIFIED_BUSINESS_RECEIPT"
	if err := persist(filepath.Join(c.p.EvidenceRoot, "human-"+stage+".verified-receipt.json"), fields); err != nil {
		c.unknown = true
		return &classifiedError{Code: "verified_human_receipt_not_durable", Stage: stage, RequestID: c.p.Requests[stage]}
	}
	return nil
}
func safeProjectReceipt(p domain.LocalProject) map[string]any {
	return map[string]any{"project_id": p.ID, "space_id": p.SpaceID, "project_root": p.Root, "name": p.Name, "settings": p.Settings}
}
func safeGrantReceipt(grant domain.ProjectGrant) map[string]any {
	return map[string]any{"project_id": grant.ProjectID, "agent_id": grant.AgentID, "actions": grant.Actions, "expires_at": grant.ExpiresAt, "revoked_at": grant.RevokedAt}
}
func (c *humanClient) settings(stage string, p domain.LocalProject, settings domain.ProjectSettings) (domain.LocalProject, error) {
	body, err := c.command(stage, "PUT", "/api/v1/local-projects/"+p.ID+"/settings", map[string]any{"expected_revision": p.Settings.Revision, "settings": settings}, 200)
	if err != nil {
		return p, err
	}
	updated, err := field[domain.LocalProject](body, "project")
	settings.Revision = p.Settings.Revision + 1
	if err != nil || updated.ID != p.ID || updated.Root != p.Root || !reflect.DeepEqual(updated.Settings, settings) {
		c.unknown = true
		return p, fail("actual_settings_cas_receipt_mismatch")
	}
	receipt := safeProjectReceipt(updated)
	receipt["expected_revision"] = p.Settings.Revision
	if err := c.receipt(stage, receipt); err != nil {
		return p, err
	}
	return updated, nil
}
func (c *humanClient) grant(stage string, approved []string) error {
	body, err := c.command(stage, "POST", "/api/v1/local-projects/"+c.projectID+"/grants", map[string]any{"agent_id": c.p.Caller, "actions": approved}, 200)
	if err != nil {
		return err
	}
	grant, err := field[domain.ProjectGrant](body, "grant")
	if err != nil || grant.ProjectID != c.projectID || grant.AgentID != c.p.Caller || !reflect.DeepEqual(grant.Actions, approved) || grant.RevokedAt != nil {
		c.unknown = true
		return fail("actual_grant_receipt_mismatch")
	}
	c.grantConfirmed = true
	return c.receipt(stage, safeGrantReceipt(grant))
}
func (c *humanClient) token(stage string) (domain.AgentToken, error) {
	body, err := c.command(stage, "POST", "/api/v1/local-projects/"+c.projectID+"/agent-token", map[string]any{"agent_id": c.p.Caller}, 200)
	if err != nil {
		return domain.AgentToken{}, err
	}
	token, err := field[domain.AgentToken](body, "credential")
	if err != nil || token.ProjectID != c.projectID || token.AgentID != c.p.Caller || token.Token == "" || !token.ExpiresAt.After(time.Now()) {
		c.unknown = true
		return domain.AgentToken{}, fail("actual_token_receipt_mismatch")
	}
	if err := c.receipt(stage, map[string]any{"project_id": token.ProjectID, "agent_id": token.AgentID, "expires_at": token.ExpiresAt}); err != nil {
		return domain.AgentToken{}, err
	}
	return token, nil
}
func cliMetadata(p executionPackage, token, projectID, action string) (json.RawMessage, error) {
	paths, err := hostPaths(p)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, paths.swa, action, "--json")
	cmd.Env = append(childEnvironment(p.EvidenceRoot), "SWA_ENDPOINT="+p.Endpoint, "SWA_PROJECT_ID="+projectID, "SWA_PROJECT_TOKEN="+token)
	body, err := runBounded(cmd, 1<<20, 64<<10)
	if err != nil || bytes.Contains(body, []byte(token)) {
		return nil, fail("actual_scoped_metadata_unavailable")
	}
	return body, nil
}

type boundedDiagnostic struct {
	body  bytes.Buffer
	limit int
	total int
}

func (w *boundedDiagnostic) Write(body []byte) (int, error) {
	w.total += len(body)
	remaining := w.limit - w.body.Len()
	if remaining > 0 {
		kept := len(body)
		if kept > remaining {
			kept = remaining
		}
		_, _ = w.body.Write(body[:kept])
	}
	return len(body), nil
}
func runBounded(cmd *exec.Cmd, stdoutLimit, stderrLimit int) ([]byte, error) {
	stdout := &boundedDiagnostic{limit: stdoutLimit}
	stderr := &boundedDiagnostic{limit: stderrLimit}
	cmd.Stdout, cmd.Stderr = stdout, stderr
	cmd.WaitDelay = 2 * time.Second
	err := cmd.Run()
	if err != nil || stdout.total > stdoutLimit || stderr.total > stderrLimit {
		return nil, fail("bounded_child_output_unavailable")
	}
	return append([]byte(nil), stdout.body.Bytes()...), nil
}
func runDriver(p executionPackage, projectID string, token domain.AgentToken) error {
	scope, err := fixedProfile(p)
	if err != nil {
		return err
	}
	paths, err := hostPaths(p)
	if err != nil {
		return err
	}
	if actualRuntime, err := serviceIdentity(p); err != nil || actualRuntime != p.ExpectedRuntimeID {
		return fail("fixed_service_identity_unavailable_before_driver")
	}
	for name, expected := range p.DriverSourceSHA {
		if err := bindHash(filepath.Join(p.SourceRepository, "tests/swa-product-acceptance", name), &expected, false); err != nil {
			return err
		}
	}
	for _, source := range []struct{ path, expected string }{{driverPath(p), p.DriverSHA}, {definitionPath(p), p.DefinitionSHA}} {
		if err := bindHash(source.path, &source.expected, false); err != nil {
			return err
		}
	}
	deadline := token.ExpiresAt.Add(-30 * time.Second)
	if p.Profile == piQuestionsProfile {
		_, ownerDeadline, err := readQuestionOwnerHandoff(p)
		if err != nil {
			return err
		}
		if err := bindHash(p.QuestionGUIFile, &p.QuestionGUISHA, false); err != nil {
			return err
		}
		if p.QuestionScenario == "answer-conflict" {
			if err := checkQuestionBaseline(p); err != nil {
				return err
			}
		}
		if beforeCleanup := ownerDeadline.Add(-30 * time.Second); beforeCleanup.Before(deadline) {
			deadline = beforeCleanup
		}
		if !deadline.After(time.Now()) {
			return fail("question_driver_deadline_exhausted")
		}
	}
	ctx, cancel := context.WithDeadline(context.Background(), deadline)
	defer cancel()
	args := []string{driverPath(p), "--candidate", p.Installation, "--data-root", p.DataRoot, "--project", p.Project, "--project-id", projectID, "--endpoint", p.Endpoint, "--agent", scope.agent, "--model", scope.model, "--workers", strconv.Itoa(scope.workers), "--output", filepath.Join(p.EvidenceRoot, "driver-report"), "--source-repository", p.SourceRepository}
	args = append(args, "--service-ready-record", p.ReadyFile, "--service-ready-sha256", p.ReadySHA)
	if scope.agent == "pi" {
		args = append(args, "--pi-launch-record", p.LaunchFile, "--pi-launch-sha256", p.LaunchSHA)
	} else if scope.agent == "opencode" {
		args = append(args, "--opencode-launch-record", p.LaunchFile, "--opencode-launch-sha256", p.LaunchSHA)
	}
	if p.Profile == piQuestionsProfile {
		args = append(args, "--owner-handoff", p.OwnerHandoffFile, "--gui-driver", p.QuestionGUIFile, "--gui-sha256", p.QuestionGUISHA, "--question-scenario", p.QuestionScenario)
		if p.QuestionScenario == "answer-conflict" {
			args = append(args, "--question-baseline-file", p.BaselineFile, "--question-baseline-sha256", p.BaselineSHA)
		}
	}
	cmd := exec.CommandContext(ctx, paths.node, args...)
	cmd.Env = append(childEnvironment(p.EvidenceRoot), "SWA_PROJECT_TOKEN="+token.Token)
	cmd.Stdin = os.Stdin
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr := &boundedDiagnostic{limit: 256 << 10}
	cmd.Stderr = stderr
	if err = cmd.Start(); err != nil {
		return fail("acceptance_driver_start_failed")
	}
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 4096), 64<<10)
	var lines []map[string]any
	total := 0
	var scanErr error
	for scanner.Scan() {
		line := append([]byte(nil), scanner.Bytes()...)
		total += len(line)
		if total > 256<<10 || bytes.Contains(line, []byte(token.Token)) || !json.Valid(line) {
			scanErr = fail("driver_output_not_safe")
			_ = cmd.Process.Kill()
			break
		}
		lines = append(lines, map[string]any{"bytes": len(line), "sha256": hashBytes(line)})
		var note map[string]json.RawMessage
		_ = json.Unmarshal(line, &note)
		var state string
		_ = json.Unmarshal(note["state"], &state)
		if state == "ACTUAL_BUSINESS_REVIEW_REQUIRED" {
			var result string
			_ = json.Unmarshal(note["result"], &result)
			if !filepath.IsAbs(result) || !inside(p.EvidenceRoot, result) {
				scanErr = fail("driver_review_path_outside_evidence")
				_ = cmd.Process.Kill()
				break
			}
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"state": state, "result": result, "review_input": "current real Reviewer must provide the original driver's JSON review; no human session is obtained"})
		}
	}
	if scanner.Err() != nil {
		scanErr = fail("driver_output_incomplete")
		_ = cmd.Process.Kill()
	}
	waitErr := cmd.Wait()
	if bytes.Contains(stderr.body.Bytes(), []byte(token.Token)) || stderr.total > 256<<10 {
		return fail("driver_diagnostic_not_safe")
	}
	if err := persist(filepath.Join(p.EvidenceRoot, "driver-stdout-identities.json"), lines); err != nil {
		return err
	}
	if err := persist(filepath.Join(p.EvidenceRoot, "driver-stderr-metadata.json"), map[string]any{"bytes": stderr.total, "raw_text_retained": false}); err != nil {
		return err
	}
	if scanErr != nil {
		return scanErr
	}
	if waitErr != nil {
		return fail("acceptance_driver_failed_preserve_original_requests")
	}
	return nil
}
func execute(p executionPackage) (report map[string]any, returned error) {
	report = map[string]any{"authorization": "USER_DELEGATION_MUST_HAVE_BEEN_CONFIRMED_BY_ROOT", "model_acceptance": "REQUIRES_INDEPENDENT_REVIEW", "revoke": "NOT_RUN"}
	scope, err := fixedProfile(p)
	if err != nil {
		return report, err
	}
	runtimeID, err := serviceIdentity(p)
	if err != nil {
		return report, err
	}
	human, err := newHumanClient(p)
	if err != nil {
		return report, err
	}
	human.runtimeID = runtimeID
	defer human.transport.CloseIdleConnections()
	defer func() {
		if human.grantConfirmed && p.AllowRevoke && (!human.unknown || p.RevokeAfterUnknown) {
			body, err := human.command("revoke", "POST", "/api/v1/local-projects/"+human.projectID+"/grants/revoke", map[string]any{"agent_id": p.Caller}, 200)
			if err == nil {
				grant, decodeErr := field[domain.ProjectGrant](body, "grant")
				if decodeErr != nil || grant.ProjectID != human.projectID || grant.AgentID != p.Caller || grant.RevokedAt == nil {
					human.unknown = true
					err = fail("revoke_receipt_unverified")
				} else {
					err = human.receipt("revoke", safeGrantReceipt(grant))
				}
			}
			if err != nil {
				human.unknown = true
				report["revoke"] = "UNKNOWN"
				returned = errors.Join(returned, err)
			} else {
				report["revoke"] = "CONFIRMED"
			}
		}
		report["human_effect_unknown"] = human.unknown
		human.csrf = ""
		human.client.Jar = nil
		report["service_shutdown"] = "REQUIRES_ORIGINAL_SERVE_OWNER_NORMAL_EOF_AND_WHOLE_TREE_PROOF"
	}()
	health, err := human.request("health", "GET", "/api/v1/health", nil, 200)
	if err != nil {
		return report, err
	}
	var healthBody map[string]any
	if json.Unmarshal(health, &healthBody) != nil || !reflect.DeepEqual(healthBody, map[string]any{"schema_version": float64(1), "status": "ok", "service": "astrocyte"}) {
		return report, fail("actual_health_body_mismatch")
	}
	session, err := human.request("session", "GET", "/api/v1/auth/session", nil, 200)
	if err != nil {
		return report, err
	}
	var actor struct {
		Schema int    `json:"schema_version"`
		Kind   string `json:"actor_kind"`
		ID     string `json:"actor_id"`
		CSRF   string `json:"csrf_token"`
	}
	if json.Unmarshal(session, &actor) != nil || actor.Schema != 1 || actor.Kind != "human" || actor.ID != "local-human" || actor.CSRF == "" {
		human.unknown = true
		return report, fail("actual_human_session_unverified")
	}
	human.csrf = actor.CSRF
	cookieURL, _ := url.Parse(p.Endpoint + "/api/v1/")
	hasSessionCookie := false
	for _, cookie := range human.client.Jar.Cookies(cookieURL) {
		if cookie.Name == "astrocyte_session" && cookie.Value != "" {
			hasSessionCookie = true
		}
	}
	if !hasSessionCookie {
		human.unknown = true
		return report, fail("actual_human_session_cookie_missing")
	}
	if err := human.receipt("session", map[string]any{"schema_version": actor.Schema, "actor_kind": actor.Kind, "actor_id": actor.ID, "session_cookie_present": true}); err != nil {
		return report, err
	}
	for _, entry := range []struct{ stage, path string }{{"list-projects", "/api/v1/local-projects"}, {"list-spaces", "/api/v1/project-spaces"}} {
		body, err := human.request(entry.stage, "GET", entry.path, nil, 200)
		if err != nil {
			return report, err
		}
		items, err := field[[]json.RawMessage](body, "items")
		if err != nil || len(items) != 0 {
			return report, fail("fresh_private_project_state_required")
		}
	}
	spaceBody, err := human.command("space", "POST", "/api/v1/project-spaces", map[string]any{"title": scope.space}, 201)
	if err != nil {
		return report, err
	}
	space, err := readSpaceReceipt(spaceBody, scope.space)
	if err != nil {
		human.unknown = true
		return report, fail("actual_space_receipt_missing")
	}
	if err := human.receipt("space", map[string]any{"space_id": space.ID, "submitted_title": scope.space}); err != nil {
		return report, err
	}
	projectBody, err := human.command("project", "POST", "/api/v1/local-projects", map[string]any{"name": scope.project, "root": p.Project, "space_id": space.ID}, 200)
	if err != nil {
		return report, err
	}
	project, err := field[domain.LocalProject](projectBody, "project")
	if err != nil || uuid.Validate(project.ID) != nil || project.Root != p.Project || project.SpaceID != space.ID || project.Name != scope.project || project.Settings.Revision != 1 || project.Settings.AllowDirectory || project.Settings.AllowAgentControl || len(project.Settings.AllowedActions) != 0 || len(project.Settings.AllowedTools) != 0 || len(project.Settings.HistoryRoots) != 0 || project.Settings.ExternalModelCLI != "" {
		human.unknown = true
		return report, fail("actual_project_receipt_mismatch")
	}
	human.projectID = project.ID
	if err := human.receipt("project", safeProjectReceipt(project)); err != nil {
		return report, err
	}
	report["project_id"] = project.ID
	report["runtime_id"] = runtimeID
	observe := project.Settings
	observe.AllowedActions = []string{"observe"}
	project, err = human.settings("observe-settings", project, observe)
	if err != nil {
		return report, err
	}
	if err = human.grant("observe-grant", []string{"observe"}); err != nil {
		return report, err
	}
	observing, err := human.token("observe-token")
	if err != nil {
		return report, err
	}
	status, err := cliMetadata(p, observing.Token, project.ID, "status")
	if err != nil {
		return report, err
	}
	var statusWire struct {
		OK        bool   `json:"ok"`
		RuntimeID string `json:"runtime_id"`
	}
	if json.Unmarshal(status, &statusWire) != nil || !statusWire.OK || statusWire.RuntimeID != runtimeID {
		return report, fail("actual_status_runtime_mismatch")
	}
	capabilities, err := cliMetadata(p, observing.Token, project.ID, "capabilities")
	if err != nil {
		return report, err
	}
	type observation struct {
		Status string `json:"status"`
	}
	var capabilityWire struct {
		RuntimeID string `json:"runtime_id"`
		Result    struct {
			Source string `json:"source_revision"`
			Agents []struct {
				ID         string      `json:"id"`
				Registered observation `json:"registered"`
				Enabled    observation `json:"enabled"`
				Launchable observation `json:"launchable"`
				Installed  struct {
					Status     string `json:"status"`
					Version    string `json:"version"`
					Executable string `json:"executable"`
				} `json:"installed"`
				Configured struct {
					Status   string `json:"status"`
					Model    string `json:"model"`
					Provider string `json:"provider"`
					Source   string `json:"account_source"`
				} `json:"configured"`
				Control struct {
					Start     observation `json:"start"`
					Send      observation `json:"send"`
					Stop      observation `json:"stop"`
					Read      observation `json:"read"`
					Tools     observation `json:"tools"`
					Questions observation `json:"questions"`
				} `json:"control"`
			} `json:"agents"`
		} `json:"result"`
	}
	if json.Unmarshal(capabilities, &capabilityWire) != nil || capabilityWire.RuntimeID != runtimeID || capabilityWire.Result.Source != p.Revision {
		return report, fail("actual_capability_source_mismatch")
	}
	found := false
	matches := 0
	for _, agent := range capabilityWire.Result.Agents {
		if agent.ID == scope.agent {
			matches++
			found = agent.Installed.Status == "available" && agent.Installed.Version == scope.version && agent.Configured.Status == "available" && agent.Configured.Model == scope.model && agent.Configured.Provider == scope.provider && agent.Configured.Source == scope.accountSource
			if scope.agent == "pi" || scope.agent == "opencode" {
				found = found && agent.Registered.Status == "available" && agent.Enabled.Status == "available" && agent.Control.Start.Status == "available" && agent.Control.Send.Status == "available" && agent.Control.Stop.Status == "available" && plain(agent.Installed.Executable, false, false) == nil
				for _, status := range []string{agent.Launchable.Status, agent.Control.Read.Status, agent.Control.Tools.Status} {
					found = found && (status == "unknown" || status == "available")
				}
				if scope.agent == "opencode" {
					found = found && agent.Control.Questions.Status == "unavailable"
				}
				report[scope.agent+"_live_capabilities"] = map[string]string{"launchable": agent.Launchable.Status, "read": agent.Control.Read.Status, "tools": agent.Control.Tools.Status}
			}
		}
	}
	if !found || (scope.agent == "pi" || scope.agent == "opencode") && matches != 1 {
		if scope.agent == "pi" {
			return report, fail("pi_source_not_observed_available")
		}
		if scope.agent == "opencode" {
			return report, fail("opencode_source_not_observed_available")
		}
		return report, fail("codex_source_not_observed_available")
	}
	approved := project.Settings
	approved.AllowDirectory = true
	approved.AllowedSubdirs = []string{"."}
	approved.ExpandReferences = false
	approved.AllowedActions = append([]string{}, actions...)
	approved.AllowedTools = []string{}
	approved.ExternalModelCLI = scope.agent
	approved.AllowAgentControl = true
	project, err = human.settings("execute-settings", project, approved)
	if err != nil {
		return report, err
	}
	if err = human.grant("execute-grant", actions); err != nil {
		return report, err
	}
	observing.Token = ""
	credential, err := human.token("execute-token")
	if err != nil {
		return report, err
	}
	defer func() { credential.Token = "" }()
	report["expires_at"] = credential.ExpiresAt
	report["settings_revision"] = project.Settings.Revision
	err = runDriver(p, project.ID, credential)
	return report, err
}

func run() int {
	mode := flag.String("mode", "", "prepare, verify, or execute-authorized; execute requires prior user delegation for the scope and a current verified technical package")
	packageFile := flag.String("package", "", "absolute private JSON package path; profile is empty (Codex), stepfun-pi-n3/n4/n6, stepfun-pi-questions, or stepfun-opencode-single/n4/n6; prepare writes a separate .prepared.json")
	flag.Parse()
	if flag.NArg() != 0 || (*mode != "prepare" && *mode != "verify" && *mode != "execute-authorized") {
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"status": "INVALID_ARGUMENTS", "http_calls": 0})
		return 2
	}
	var p executionPackage
	if err := readJSON(*packageFile, &p, true); err != nil {
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"status": "REFUSED_BEFORE_HTTP", "error": safeError(err), "http_calls": 0})
		return 2
	}
	missing, err := offline(&p, *mode == "prepare")
	if err != nil {
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"status": "REFUSED_BEFORE_HTTP", "error": safeError(err), "http_calls": 0})
		return 2
	}
	if *mode == "prepare" {
		if p.Profile == piQuestionsProfile || isOpenCodeProfile(p.Profile) {
			// 原 owner 已独占创建该根；仅明确同源且仍活动的服务可共享其证据目录。
			if len(missing) == 0 {
				_, err = serviceIdentity(p)
				if err != nil {
					missing = append(missing, "actual_service_identity_not_live")
				}
			}
			if len(missing) != 0 {
				_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"status": "INCOMPLETE_NO_AUTH", "missing": missing, "http_calls": 0, "model_calls": 0})
				return 3
			}
		} else if err = createHostPrivateDirectory(p.EvidenceRoot); err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"status": "REFUSED_BEFORE_HTTP", "error": safeError(err), "http_calls": 0})
			return 2
		}
	}
	if err = plain(p.EvidenceRoot, true, true); err != nil {
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"status": "REFUSED_BEFORE_HTTP", "error": safeError(err), "http_calls": 0})
		return 2
	}
	public, err := checkPublic(p)
	if err != nil {
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"status": "REFUSED_BEFORE_HTTP", "error": safeError(err), "http_calls": 0})
		return 2
	}
	if len(missing) == 0 {
		if _, err = serviceIdentity(p); err != nil {
			missing = append(missing, "actual_service_identity_not_live")
		}
	}
	if *mode == "prepare" {
		if isOpenCodeProfile(p.Profile) && len(missing) != 0 {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"status": "INCOMPLETE_NO_AUTH", "missing": missing, "http_calls": 0, "model_calls": 0})
			return 3
		}
		if err = persist(*packageFile+".prepared.json", p); err == nil {
			err = persist(filepath.Join(p.EvidenceRoot, "public-input-proof.json"), public)
		}
		if err != nil {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"status": "LOCAL_EVIDENCE_FAILED", "error": safeError(err), "http_calls": 0})
			return 2
		}
	}
	if *mode != "execute-authorized" {
		status := "VERIFIED_LOCAL_ONLY"
		code := 0
		if len(missing) > 0 {
			status = "INCOMPLETE_NO_AUTH"
			code = 3
		}
		note := map[string]any{"status": status, "missing": missing, "http_calls": 0, "model_calls": 0, "user_delegation": "STILL_REQUIRED_FOR_EFFECTS", "package_file": *packageFile}
		if *mode == "prepare" {
			note["prepared_package"] = *packageFile + ".prepared.json"
		}
		_ = json.NewEncoder(os.Stdout).Encode(note)
		return code
	}
	if len(missing) > 0 {
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"status": "REFUSED_BEFORE_HTTP", "missing": missing, "http_calls": 0})
		return 3
	}
	report, err := execute(p)
	report["status"] = "EXECUTED_REQUIRES_INDEPENDENT_REVIEW"
	code := 0
	if err != nil {
		report["status"] = "INCOMPLETE_PRESERVE_ORIGINAL_INTENTS"
		report["error"] = safeError(err)
		code = 1
	}
	if saveErr := persist(filepath.Join(p.EvidenceRoot, "authorization-outcome.json"), report); saveErr != nil {
		report["status"] = "OUTCOME_WRITE_UNKNOWN"
		report["error"] = safeError(saveErr)
		code = 1
	}
	_ = json.NewEncoder(os.Stdout).Encode(report)
	return code
}
func main() { os.Exit(run()) }
