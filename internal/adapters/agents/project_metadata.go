package agents

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

type projectMetadataSource struct {
	cli, root string
	depth     int
}

func knownProjectMetadataSources() []projectMetadataSource {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	codexHome := os.Getenv("CODEX_HOME")
	if codexHome == "" {
		codexHome = filepath.Join(home, ".codex")
	}
	piHome := os.Getenv("PI_CODING_AGENT_DIR")
	if piHome == "" {
		piHome = filepath.Join(home, ".pi", "agent")
	}
	claudeHome := os.Getenv("CLAUDE_CONFIG_DIR")
	if claudeHome == "" {
		claudeHome = filepath.Join(home, ".claude")
	}
	return []projectMetadataSource{{"codex", filepath.Join(codexHome, "sessions"), 3}, {"pi", filepath.Join(piHome, "sessions"), 1}, {"claude", filepath.Join(claudeHome, "projects"), 1}}
}

// No database, credentials, messages, summaries, tools or filename-derived
// completion data. Only a bounded first record is decoded into these fields.
func readProjectHeader(path, cli string) (id, cwd string, stamp *time.Time, err error) {
	f, err := os.Open(path)
	if err != nil {
		return "", "", nil, err
	}
	defer f.Close()
	if cli == "claude" {
		return readClaudeProjectMetadata(f)
	}
	line, err := bufio.NewReaderSize(io.LimitReader(f, 64*1024+1), 64*1024+1).ReadBytes('\n')
	if (err != nil && err != io.EOF) || len(line) > 64*1024 {
		return "", "", nil, errors.New("header_unavailable_or_over_bound")
	}
	var header struct {
		Type      string `json:"type"`
		ID        string `json:"id"`
		Cwd       string `json:"cwd"`
		Timestamp string `json:"timestamp"`
		Payload   struct {
			ID        string `json:"id"`
			Cwd       string `json:"cwd"`
			Timestamp string `json:"timestamp"`
		} `json:"payload"`
	}
	if json.Unmarshal(line, &header) != nil {
		return "", "", nil, errors.New("header_invalid")
	}
	value := header.Timestamp
	if cli == "codex" && header.Type == "session_meta" {
		id, cwd = header.Payload.ID, header.Payload.Cwd
		if header.Payload.Timestamp != "" {
			value = header.Payload.Timestamp
		}
	} else if cli == "pi" && header.Type == "session" {
		id, cwd = header.ID, header.Cwd
	} else {
		return "", "", nil, errors.New("header_type_unverified")
	}
	if !regexp.MustCompile(`^[a-zA-Z0-9._-]{1,100}$`).MatchString(id) || !filepath.IsAbs(cwd) {
		return "", "", nil, errors.New("header_identity_invalid")
	}
	if t, e := time.Parse(time.RFC3339Nano, value); e == nil && !t.After(time.Now().Add(time.Minute)) {
		utc := t.UTC()
		stamp = &utc
	}
	return id, cwd, stamp, nil
}

// Anthropic's official SDK documents metadata in the JSONL initial records.
// Unlike its listing implementation, this reads no tail, firstPrompt, summary
// or content. Sixteen records share one 64KiB budget; no cwd is followed.
func readClaudeProjectMetadata(input io.Reader) (id, cwd string, stamp *time.Time, err error) {
	reader := bufio.NewReaderSize(io.LimitReader(input, 64*1024+1), 64*1024+1)
	bytesRead := 0
	for record := 0; record < 16; record++ {
		line, e := reader.ReadBytes('\n')
		bytesRead += len(line)
		if bytesRead > 64*1024 || (e != nil && e != io.EOF) {
			return "", "", nil, errors.New("initial_metadata_over_bound")
		}
		var header struct {
			Type      string `json:"type"`
			SessionID string `json:"sessionId"`
			Cwd       string `json:"cwd"`
			Timestamp string `json:"timestamp"`
		}
		if json.Unmarshal(line, &header) == nil && (header.Type == "user" || header.Type == "assistant" || header.Type == "system") && regexp.MustCompile(`^[a-zA-Z0-9._-]{1,100}$`).MatchString(header.SessionID) && filepath.IsAbs(header.Cwd) {
			if t, e := time.Parse(time.RFC3339Nano, header.Timestamp); e == nil && !t.After(time.Now().Add(time.Minute)) {
				utc := t.UTC()
				stamp = &utc
			}
			return header.SessionID, header.Cwd, stamp, nil
		}
		if e == io.EOF {
			break
		}
	}
	return "", "", nil, errors.New("initial_metadata_absent_or_unverified")
}

func (s *RegisteredProjects) observeProjectMetadata(ctx context.Context, result *domain.ProjectDiscoverySnapshot) {
	byRoot := map[string]int{}
	for i, p := range result.Projects {
		byRoot[rootKey(p.Root)] = i
		result.Projects[i].Contributors = []domain.ProjectContributor{}
	}
	available := map[string]bool{}
	for _, source := range s.metadataSources() {
		available[source.cli] = true
		obs := domain.ProjectSourceObservation{CLI: source.cli, Source: "native_session_header", Status: "known", Reason: "bounded_headers_and_fixed_project_root_markers_only"}
		partial := func(reason string) { obs.Status = "partial"; obs.Reason = reason }
		if !filepath.IsAbs(source.root) {
			obs.Status = "unknown"
			obs.Reason = "absolute_known_source_required"
			result.Sources = append(result.Sources, obs)
			continue
		}
		// Exclude redirected native-state roots, including symlinked ancestors.
		resolved, err := filepath.EvalSymlinks(source.root)
		if err != nil || hasRedirectedAncestor(source.root) || rootKey(resolved) != rootKey(source.root) {
			obs.Status = "unknown"
			obs.Reason = "known_source_unavailable_or_redirected"
			result.Sources = append(result.Sources, obs)
			continue
		}
		seen := map[string]bool{}
		perRoot := map[string]int{}
		matchedRoots := map[string]bool{}
		var walk func(string, int) error
		walk = func(dir string, depth int) error {
			if err := ctx.Err(); err != nil {
				return err
			}
			f, err := os.Open(dir)
			if err != nil {
				return err
			}
			defer f.Close()
			for {
				entries, e := f.ReadDir(32)
				for _, entry := range entries {
					if err := ctx.Err(); err != nil {
						return err
					}
					obs.EntriesExamined++
					if obs.EntriesExamined > 2048 {
						return errors.New("entry_bound")
					}
					path := filepath.Join(dir, entry.Name())
					if entry.Type()&os.ModeSymlink != 0 {
						partial("redirected_entries_excluded")
						continue
					}
					if entry.IsDir() {
						// Codex's date layout only; Pi's immediate encoded-cwd dirs.
						if depth >= source.depth {
							partial("depth_bound")
							continue
						}
						if source.cli == "codex" && !regexp.MustCompile(`^[0-9]{2,4}$`).MatchString(entry.Name()) {
							continue
						}
						if err := walk(path, depth+1); err != nil {
							return err
						}
						continue
					}
					if filepath.Ext(entry.Name()) != ".jsonl" || !entry.Type().IsRegular() {
						continue
					}
					obs.HeadersExamined++
					id, cwd, stamp, err := readProjectHeader(path, source.cli)
					if err != nil {
						partial("unverified_or_over_bound_headers_excluded")
						continue
					}
					if seen[id] {
						continue
					}
					index, ok := byRoot[rootKey(cwd)]
					if !ok {
						// The user also approved project roots directly identified
						// by native metadata. Inspect only this exact cwd's fixed
						// marker stat; never walk its parent or read source files.
						canonical, e := metadataProjectRoot(cwd)
						if e != nil {
							partial("unavailable_redirected_or_nonproject_cwd_excluded")
							continue
						}
						if len(result.Projects) >= 256 {
							return errors.New("project_bound")
						}
						index = len(result.Projects)
						byRoot[rootKey(canonical)] = index
						result.Projects = append(result.Projects, domain.RegisteredProject{Root: canonical, Name: filepath.Base(canonical), Source: "native_project_metadata", Git: domain.ProjectGitObservation{Status: "unknown", Reason: "not_observed"}, Activity: domain.ProjectActivityObservation{Status: "unknown", Source: "native_session_header"}, Contributors: []domain.ProjectContributor{}, Limitations: []string{"native_header_identified_root_fixed_marker_only", "initial_metadata_timestamp_is_not_latest_activity", "observation_only_no_context_or_execution_permission"}})
					}
					obs.MatchedHeaders++
					matchedRoots[rootKey(result.Projects[index].Root)] = true
					seen[id] = true
					if perRoot[rootKey(result.Projects[index].Root)] >= 4 {
						partial("per_root_session_sample_bound")
						reason := "native_session_sample_bound:" + source.cli
						found := false
						for _, old := range result.Projects[index].Limitations {
							if old == reason {
								found = true
							}
						}
						if !found {
							result.Projects[index].Limitations = append(result.Projects[index].Limitations, reason)
						}
						continue
					}
					if obs.RetainedAssociations >= 256 {
						return errors.New("header_bound")
					}
					perRoot[rootKey(result.Projects[index].Root)]++
					obs.RetainedAssociations++
					result.Projects[index].Contributors = append(result.Projects[index].Contributors, domain.ProjectContributor{CLI: source.cli, Source: "native_session_header", Root: result.Projects[index].Root, SessionID: id, ObservedAt: result.ObservedAt, CreatedAt: stamp})
				}
				if e == io.EOF {
					return nil
				}
				if e != nil {
					return e
				}
			}
		}
		if err := walk(source.root, 0); err != nil {
			partial("known_source_incomplete_or_bound_reached")
		}
		obs.MatchedRoots = len(matchedRoots)
		result.Sources = append(result.Sources, obs)
	}
	for _, def := range definitions {
		if !available[def.ID] {
			result.Sources = append(result.Sources, domain.ProjectSourceObservation{CLI: def.ID, Source: "native_project_metadata", Status: "unknown", Reason: "no_reliable_metadata_only_adapter"})
		}
	}
	for _, obs := range result.Sources {
		if obs.Status != "known" {
			result.Status = "partial"
		}
	}
	// An empty supported source means no matched headers were observed, never
	// that its CLI is absent, idle, configured or finished.
}

func metadataProjectRoot(cwd string) (string, error) {
	canonical, err := CanonicalRoot(cwd)
	if err != nil || hasRedirectedAncestor(cwd) || rootKey(canonical) != rootKey(cwd) {
		return "", errors.New("metadata_root_unavailable_or_redirected")
	}
	home, _ := os.UserHomeDir()
	if home != "" && rootKey(canonical) == rootKey(home) {
		return "", errors.New("home_root_excluded")
	}
	for _, part := range strings.FieldsFunc(canonical, func(c rune) bool { return c == '/' || c == '\\' }) {
		if secretComponent(part) {
			return "", errors.New("native_or_secret_root_excluded")
		}
	}
	for _, key := range []string{"SystemRoot", "ProgramFiles", "ProgramFiles(x86)", "ProgramData"} {
		if system := os.Getenv(key); system != "" && inside(system, canonical) {
			return "", errors.New("system_root_excluded")
		}
	}
	for _, marker := range []string{".git", "go.mod", "package.json", "pyproject.toml", "Cargo.toml", "CMakeLists.txt"} {
		if info, e := os.Lstat(filepath.Join(canonical, marker)); e == nil && info.Mode()&os.ModeSymlink == 0 && ((marker == ".git" && (info.IsDir() || info.Mode().IsRegular())) || (marker != ".git" && info.Mode().IsRegular())) {
			return canonical, nil
		}
	}
	return "", errors.New("cwd_has_no_fixed_project_marker")
}
