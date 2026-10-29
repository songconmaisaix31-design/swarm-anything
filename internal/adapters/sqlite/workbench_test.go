package sqlite

import (
	"context"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	workbench "github.com/songconmaisaix31-design/Astrocyte/internal/workbench/app"
)

// 只消费协调者明确提供的公开生产回放出版物，源目录保持只读。
func copyWorkbenchPublication(t *testing.T, sourceRoot, targetRoot, pointerName string) workbenchPublication {
	t.Helper()
	if !filepath.IsAbs(sourceRoot) {
		t.Fatal("explicit absolute public cognition publication required")
	}
	data, err := os.ReadFile(filepath.Join(sourceRoot, "current.json"))
	if err != nil {
		t.Fatal(err)
	}
	var publication workbenchPublication
	if err = json.Unmarshal(data, &publication); err != nil {
		t.Fatal(err)
	}
	if publication.Generation == "" || filepath.Base(publication.Generation) != publication.Generation || strings.ContainsAny(publication.Generation, "/\\:") {
		t.Fatal("invalid actual publication generation")
	}
	dir := filepath.Join(targetRoot, "snapshots", publication.Generation)
	if err = os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"snapshot.sqlite", "history.json"} {
		body, err := os.ReadFile(filepath.Join(sourceRoot, "snapshots", publication.Generation, name))
		if err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(filepath.Join(dir, name), body, 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err = os.WriteFile(filepath.Join(targetRoot, pointerName), data, 0600); err != nil {
		t.Fatal(err)
	}
	return publication
}

func workbenchActualPublication(t *testing.T) *WorkbenchReader {
	return workbenchSelectedPublication(t, "ASTROCYTE_TEST_COGNITION_LOCALAPPDATA")
}

func workbenchSelectedPublication(t *testing.T, variable string) *WorkbenchReader {
	t.Helper()
	local := os.Getenv(variable)
	if !filepath.IsAbs(local) {
		t.Fatalf("%s must select the authorized actual public publication", variable)
	}
	root := t.TempDir()
	publication := copyWorkbenchPublication(t, filepath.Join(local, "astrocyte-workbench", "v0.1"), root, "current.json")
	if _, err := time.Parse(time.RFC3339Nano, publication.SnapshotAt); err != nil {
		t.Fatal(err)
	}
	return NewWorkbenchReader(root)
}

// 独立 SQL 连接仅读副本；期望事件由完整 JSON 字段解码得到。
func workbenchIndependentDB(t *testing.T, s *WorkbenchReader) *sql.DB {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(s.root, "current.json"))
	if err != nil {
		t.Fatal(err)
	}
	var publication workbenchPublication
	if err = json.Unmarshal(data, &publication); err != nil {
		t.Fatal(err)
	}
	path := filepath.ToSlash(filepath.Join(s.root, "snapshots", publication.Generation, "snapshot.sqlite"))
	if filepath.VolumeName(path) != "" {
		path = "/" + path
	}
	uri := url.URL{Scheme: "file", Path: path, RawQuery: "mode=ro&immutable=1"}
	db, err := sql.Open("sqlite", uri.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	return db
}

func workbenchExpectedEvents(t *testing.T, db *sql.DB, where string, args ...any) []workbench.Event {
	t.Helper()
	rows, err := db.Query(`SELECT id,kind,topic,data,ts FROM attention_engine_events WHERE `+where+` ORDER BY ts DESC,id ASC`, args...)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	result := []workbench.Event{}
	for rows.Next() {
		var event workbench.Event
		var body string
		var timestamp int64
		if err = rows.Scan(&event.ID, &event.Kind, &event.Topic, &body, &timestamp); err != nil {
			t.Fatal(err)
		}
		var metadata struct {
			Tokens *int64 `json:"tokens"`
			Scope  string `json:"scope"`
		}
		if err = json.Unmarshal([]byte(body), &metadata); err != nil {
			t.Fatal(err)
		}
		event.Tokens, event.Scope = metadata.Tokens, metadata.Scope
		event.TS = time.UnixMilli(timestamp).UTC().Format(time.RFC3339Nano)
		result = append(result, event)
	}
	if err = rows.Err(); err != nil {
		t.Fatal(err)
	}
	return result
}

func TestWorkbenchProjectionPaginationAndShanghaiDays(t *testing.T) {
	s := workbenchActualPublication(t)
	db := workbenchIndependentDB(t, s)
	var topic string
	if err := db.QueryRow(`SELECT topic FROM attention_engine_events WHERE topic<>'' GROUP BY topic HAVING COUNT(*)>20 ORDER BY COUNT(*) DESC,topic LIMIT 1`).Scan(&topic); err != nil {
		t.Fatal("actual multi-page topic missing", err)
	}
	expected := workbenchExpectedEvents(t, db, "topic=?", topic)
	for _, size := range []int{1, 20, 50} {
		actual := []workbench.Event{}
		for page := 1; page <= (len(expected)+size-1)/size+1; page++ {
			v, err := s.Read(context.Background(), "events", workbench.Query{Topic: topic, Page: page, PageSize: size})
			if err != nil {
				t.Fatal(err)
			}
			if v.Events.Total != len(expected) || v.Events.Page != page || v.Events.PageSize != size {
				t.Fatal("actual pagination metadata mismatch")
			}
			actual = append(actual, v.Events.Events...)
		}
		if !reflect.DeepEqual(actual, expected) {
			t.Fatal("actual event ordering, token or field mismatch")
		}
	}
	for _, event := range expected {
		data, err := json.Marshal(event)
		if err != nil {
			t.Fatal(err)
		}
		var fields map[string]any
		if err = json.Unmarshal(data, &fields); err != nil {
			t.Fatal(err)
		}
		if len(fields) != 6 {
			t.Fatal("event projection is not six fields")
		}
		for _, key := range []string{"event_id", "kind", "topic", "tokens", "scope", "ts"} {
			if _, ok := fields[key]; !ok {
				t.Fatal("safe event field missing")
			}
		}
	}
	// 上海日界用独立时区计算，并按真实数据库的时间逐条核对。
	days := map[string]int{}
	for _, event := range workbenchExpectedEvents(t, db, "1=1") {
		stamp, err := time.Parse(time.RFC3339Nano, event.TS)
		if err != nil {
			t.Fatal(err)
		}
		days[stamp.In(s.zone).Format("2006-01-02")]++
	}
	eligible := []string{}
	for day, count := range days {
		if count >= 2 && count <= 100 && day < s.clock().In(s.zone).Format("2006-01-02") {
			eligible = append(eligible, day)
		}
	}
	if len(eligible) == 0 {
		t.Fatal("actual Shanghai-day pagination sample unavailable")
	}
	sort.Strings(eligible)
	day := eligible[len(eligible)-1]
	start, err := time.ParseInLocation("2006-01-02", day, s.zone)
	if err != nil {
		t.Fatal(err)
	}
	byDay := workbenchExpectedEvents(t, db, "ts>=? AND ts<?", start.UnixMilli(), start.AddDate(0, 0, 1).UnixMilli())
	if len(byDay) < 2 || len(byDay) > 100 {
		t.Fatal("actual Shanghai-day pagination sample unavailable")
	}
	v, err := s.Read(context.Background(), "events", workbench.Query{Start: day, End: day, PageSize: 100})
	if err != nil || v.Events.Total != len(byDay) || !reflect.DeepEqual(v.Events.Events, byDay) {
		t.Fatal("actual Shanghai-day event mismatch", err)
	}
	v, err = s.Read(context.Background(), "events", workbench.Query{Topic: "missing"})
	if err != nil || v.Events.Total != 0 || len(v.Events.Events) != 0 {
		t.Fatal("unknown filter not empty")
	}
	v, err = s.Read(context.Background(), "events", workbench.Query{Topic: "' OR 1=1 --"})
	if err != nil || v.Events.Total != 0 {
		t.Fatal("filter not bound")
	}
	v, err = s.Read(context.Background(), "topics/evidence", workbench.Query{Topic: topic})
	if err != nil || v.Evidence.Total != len(expected) {
		t.Fatal("aggregates lost actual evidence", err)
	}
	counts := map[string]int{}
	for _, event := range expected {
		timestamp, err := time.Parse(time.RFC3339Nano, event.TS)
		if err != nil {
			t.Fatal(err)
		}
		counts[timestamp.In(s.zone).Format("2006-01-02")+":"+event.Kind]++
	}
	if len(v.Evidence.Aggregates) != len(counts) {
		t.Fatal("actual aggregate groups mismatch")
	}
	for _, aggregate := range v.Evidence.Aggregates {
		if aggregate.Count != counts[aggregate.Day+":"+aggregate.Kind] {
			t.Fatal("actual aggregate count mismatch")
		}
	}
}

func TestWorkbenchTodayEmptyDayAndConfirmedHistory(t *testing.T) {
	s := workbenchActualPublication(t)
	db := workbenchIndependentDB(t, s)
	observed := s.clock()
	current, err := s.Read(context.Background(), "today", workbench.Query{})
	if err != nil {
		t.Fatal(err)
	}
	localDay := observed.In(s.zone)
	start := time.Date(localDay.Year(), localDay.Month(), localDay.Day(), 0, 0, 0, 0, s.zone)
	activity := workbenchExpectedEvents(t, db, "ts>=? AND ts<?", start.UnixMilli(), start.AddDate(0, 0, 1).UnixMilli())
	if len(activity) < 2 || current.Today.Day != start.Format("2006-01-02") || !reflect.DeepEqual(current.Today.Activity, activity[:min(50, len(activity))]) || len(current.Today.DailyCounts) != 7 {
		t.Fatal("actual Today activity or seven-day counts missing")
	}
	for _, count := range current.Today.DailyCounts {
		boundary, err := time.ParseInLocation("2006-01-02", count.Day, s.zone)
		if err != nil {
			t.Fatal(err)
		}
		var expected int
		if err = db.QueryRow(`SELECT COUNT(*) FROM attention_engine_events WHERE ts>=? AND ts<?`, boundary.UnixMilli(), boundary.AddDate(0, 0, 1).UnixMilli()).Scan(&expected); err != nil || count.Count != expected {
			t.Fatal("actual seven-day count mismatch", err)
		}
	}
	empty := workbenchSelectedPublication(t, "ASTROCYTE_TEST_COGNITION_EMPTY_LOCALAPPDATA")
	v, err := empty.Read(context.Background(), "today", workbench.Query{})
	if err != nil {
		t.Fatal(err)
	}
	if v.Today.Day != observed.In(s.zone).Format("2006-01-02") || len(v.Today.Activity) != 0 || v.Today.Sleep.Status != "not_produced" || len(v.Today.Focus) != 0 || len(v.Today.DailyCounts) != 7 {
		t.Fatal("empty day fabricated")
	}
	v, err = s.Read(context.Background(), "focus", workbench.Query{})
	if err != nil || len(v.Focus.Topics) < 2 || len(v.Focus.Series) != len(v.Focus.Topics) {
		t.Fatal("actual focus unavailable", err)
	}
	opened, publication, dir, err := s.open(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if err = opened.Close(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(dir, "history.json"))
	if err != nil {
		t.Fatal(err)
	}
	var history map[string][]workbenchPoint
	if err = json.Unmarshal(data, &history); err != nil {
		t.Fatal(err)
	}
	for i, series := range v.Focus.Series {
		points := history[series.Topic]
		sort.Slice(points, func(i, j int) bool { return points[i].TS < points[j].TS })
		expected := []workbench.Point{}
		seen := map[int64]bool{}
		for _, point := range points {
			if !seen[point.TS] {
				expected = append(expected, workbench.Point{TS: time.UnixMilli(point.TS).UTC().Format(time.RFC3339Nano), Attention: point.Attention})
				seen[point.TS] = true
			}
		}
		if len(expected) < 2 || !reflect.DeepEqual(series.Points, expected) {
			t.Fatal("actual history missing, interpolated or not deduplicated")
		}
		// 规则输入仅重复同一个真实历史点，不改时间或数值，不写出版事实。
		repeated := append(append([]workbenchPoint(nil), points...), points[0], points[0])
		before := append([]workbenchPoint(nil), repeated...)
		if projected := workbenchSeries(series.Topic, repeated); !reflect.DeepEqual(projected, series) || !reflect.DeepEqual(repeated, before) {
			t.Fatal("explicit repeated real-point projection changed history")
		}
		var topic workbench.Topic
		if err = db.QueryRow(`SELECT topic,attention,momentum,confidence FROM attention_engine_nodes WHERE topic=?`, series.Topic).Scan(&topic.Topic, &topic.Attention, &topic.Momentum, &topic.Confidence); err != nil || topic != v.Focus.Topics[i] {
			t.Fatal("actual focus scalar mismatch", err)
		}
	}
	if v.SnapshotAt != publication.SnapshotAt {
		t.Fatal("actual publication identity changed")
	}
	closed := workbenchSelectedPublication(t, "ASTROCYTE_TEST_COGNITION_CLOSED_DAY_LOCALAPPDATA")
	closedDB := workbenchIndependentDB(t, closed)
	var completed, started int64
	yesterday := observed.In(s.zone).AddDate(0, 0, -1).Format("2006-01-02")
	if err = closedDB.QueryRow(`SELECT started_at,completed_at FROM attention_engine_sleep_runs WHERE day=?`, yesterday).Scan(&started, &completed); err != nil {
		t.Fatal("actual manually processed closed-day Sleep unavailable", err)
	}
	if completed < started || time.UnixMilli(started).In(s.zone).Format("2006-01-02") != observed.In(s.zone).Format("2006-01-02") {
		t.Fatal("closed-day processing did not retain its actual execution day")
	}
	v, err = closed.Read(context.Background(), "today", workbench.Query{})
	stamp := time.UnixMilli(completed).UTC().Format(time.RFC3339Nano)
	if err != nil || v.Today.Sleep.Status != "completed" || v.Today.Sleep.CompletedAt == nil || *v.Today.Sleep.CompletedAt != stamp {
		t.Fatal("actual Sleep mismatch", err)
	}
	v, err = s.Read(context.Background(), "agents", workbench.Query{})
	if err != nil || len(v.Agents.Groups) == 0 {
		t.Fatal("actual source groups unavailable", err)
	}
	end := time.Date(observed.In(s.zone).Year(), observed.In(s.zone).Month(), observed.In(s.zone).Day()+1, 0, 0, 0, 0, s.zone)
	for _, group := range v.Agents.Groups {
		for _, window := range []struct{ days, actual int }{{1, group.Today}, {7, group.Days7}, {30, group.Days30}} {
			var expected int
			if err = db.QueryRow(`SELECT COUNT(*) FROM attention_engine_events WHERE source=? AND ts>=? AND ts<?`, group.Source, end.AddDate(0, 0, -window.days).UnixMilli(), end.UnixMilli()).Scan(&expected); err != nil || window.actual != expected {
				t.Fatal("actual source window mismatch", err)
			}
		}
		expected := workbenchExpectedEvents(t, db, "source=?", group.Source)
		if !reflect.DeepEqual(group.Recent, expected[:min(5, len(expected))]) {
			t.Fatal("actual recent source events mismatch")
		}
	}
	v, err = s.Read(context.Background(), "filters", workbench.Query{})
	if err != nil {
		t.Fatal(err)
	}
	for _, filter := range []struct {
		column string
		actual []string
	}{{"source", v.Filters.Sources}, {"kind", v.Filters.Kinds}, {"topic", v.Filters.Topics}} {
		query := `SELECT DISTINCT ` + filter.column + ` FROM attention_engine_events ORDER BY 1`
		if filter.column == "topic" {
			query = `SELECT topic FROM attention_engine_events UNION SELECT topic FROM attention_engine_nodes ORDER BY 1`
		}
		rows, err := db.Query(query)
		if err != nil {
			t.Fatal(err)
		}
		expected := []string{}
		for rows.Next() {
			var value string
			if err = rows.Scan(&value); err != nil {
				t.Fatal(err)
			}
			expected = append(expected, value)
		}
		if err = errors.Join(rows.Err(), rows.Close()); err != nil || !reflect.DeepEqual(filter.actual, expected) {
			t.Fatal("actual filters mismatch", err)
		}
	}
}

func TestWorkbenchReadOnlyAndPublicationReopen(t *testing.T) {
	s := workbenchActualPublication(t)
	db, previous, _, err := s.open(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`DELETE FROM attention_engine_events`); err == nil {
		t.Fatal("copy writable")
	}
	var queryOnly int
	if err = db.row(`PRAGMA query_only`).Scan(&queryOnly); err != nil || queryOnly != 1 {
		t.Fatal("query_only not enabled")
	}
	if err = db.Close(); err != nil {
		t.Fatal(err)
	}
	pointer := filepath.Join(s.root, "current.json")
	staged := pointer + ".next"
	other := os.Getenv("ASTROCYTE_TEST_COGNITION_PRE_SLEEP_LOCALAPPDATA")
	if !filepath.IsAbs(other) {
		t.Fatal("explicit second actual public publication required for reopen")
	}
	next := copyWorkbenchPublication(t, filepath.Join(other, "astrocyte-workbench", "v0.1"), s.root, "current.json.next")
	if next.Generation == previous.Generation || next.SnapshotAt == previous.SnapshotAt {
		t.Fatal("actual publication switch sample is unchanged")
	}
	if err = os.Rename(staged, pointer); err != nil {
		t.Fatal(err)
	}
	v, err := s.Read(context.Background(), "health", workbench.Query{})
	if err != nil || v.Health.SnapshotAt != next.SnapshotAt {
		t.Fatal("publication not reopened")
	}
}

func TestWorkbenchSanitizedFailureAndQueryValidation(t *testing.T) {
	s := workbenchActualPublication(t)
	for _, q := range []workbench.Query{{Page: -1}, {PageSize: 101}, {Start: "2026-13-01"}, {Start: "2026-10-14", End: "2026-10-13"}} {
		if _, err := s.Read(context.Background(), "events", q); !errors.Is(err, workbench.ErrInvalidQuery) {
			t.Fatal("invalid query accepted")
		}
	}
	if err := os.WriteFile(filepath.Join(s.root, "current.json"), []byte(`{"generation":"../PRIVATE_CANARY","snapshot_at":"x"}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Read(context.Background(), "health", workbench.Query{}); err != workbench.ErrUnavailable || strings.Contains(err.Error(), "PRIVATE_CANARY") {
		t.Fatal("private error escaped")
	}
}

func TestWorkbenchConfiguredSourceAndHardlinkIdentityRejected(t *testing.T) {
	s := workbenchActualPublication(t)
	opened, _, dir, err := s.open(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if err = opened.Close(); err != nil {
		t.Fatal(err)
	}
	snapshot := filepath.Join(dir, "snapshot.sqlite")
	for _, original := range []string{snapshot, filepath.Join(s.root, "source-alias.sqlite")} {
		if original != snapshot {
			if err := os.Link(snapshot, original); err != nil {
				t.Fatal(err)
			}
		}
		reader := NewWorkbenchReader(s.root, original)
		if _, err := reader.Read(context.Background(), "health", workbench.Query{}); !errors.Is(err, workbench.ErrUnavailable) {
			t.Fatal("same-file source/snapshot accepted")
		}
	}
	if len(NewWorkbenchReader(s.root).protectedSources) != 0 {
		t.Fatal("default reader inferred a personal source")
	}
	different := filepath.Join(t.TempDir(), "actual-source.sqlite")
	db, err := Open(different)
	if err != nil {
		t.Fatal(err)
	}
	if err = db.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err = NewWorkbenchReader(s.root, different).Read(context.Background(), "health", workbench.Query{}); err != nil {
		t.Fatal("independent actual source rejected", err)
	}
}

func TestWorkbenchRejectsRedirectedGeneration(t *testing.T) {
	s := workbenchActualPublication(t)
	alias := filepath.Join(s.root, "snapshots", "redirected")
	opened, publication, target, err := s.open(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if err = opened.Close(); err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS == "windows" {
		if output, err := exec.Command("cmd", "/c", "mklink", "/J", alias, target).CombinedOutput(); err != nil {
			t.Fatalf("owned junction creation failed: %v bytes=%d", err, len(output))
		}
	} else if err := os.Symlink(target, alias); err != nil {
		t.Fatal(err)
	}
	// 故障输入只改变本树副本指针的目录，保留实际出版时间。
	publication.Generation = "redirected"
	data, err := json.Marshal(publication)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(s.root, "current.json"), data, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Read(context.Background(), "health", workbench.Query{}); !errors.Is(err, workbench.ErrUnavailable) {
		t.Fatal("redirected generation accepted")
	}
}

func TestWorkbenchRejectsRedirectedRoot(t *testing.T) {
	s := workbenchActualPublication(t)
	alias := filepath.Join(t.TempDir(), "root-alias")
	if runtime.GOOS == "windows" {
		if output, err := exec.Command("cmd", "/c", "mklink", "/J", alias, s.root).CombinedOutput(); err != nil {
			t.Fatalf("owned root junction creation failed: %v bytes=%d", err, len(output))
		}
	} else if err := os.Symlink(s.root, alias); err != nil {
		t.Fatal(err)
	}
	if _, err := NewWorkbenchReader(alias).Read(context.Background(), "health", workbench.Query{}); !errors.Is(err, workbench.ErrUnavailable) {
		t.Fatal("redirected publication ancestor accepted")
	}
}

// 以下为 JSON 投影的明确输入和期望值，不创建来源事件或认知状态。
func TestWorkbenchTokenProjectionExplicitJSONValues(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "projection-values.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	for _, input := range []struct {
		body  string
		valid bool
		value int64
	}{
		{`{"tokens":null}`, false, 0},
		{`{}`, false, 0},
		{`{"tokens":"7"}`, false, 0},
		{`{"tokens":7}`, true, 7},
		{`{"tokens":0}`, true, 0},
	} {
		var actual sql.NullInt64
		if err = db.Conn().QueryRow(`SELECT CASE WHEN json_type(?,'$.tokens')='integer' THEN json_extract(?,'$.tokens') END`, input.body, input.body).Scan(&actual); err != nil || actual.Valid != input.valid || actual.Int64 != input.value {
			t.Fatal("explicit JSON token projection mismatch", err)
		}
	}
}

func TestWorkbenchActualPublicOriginsAndPrivacy(t *testing.T) {
	s := workbenchActualPublication(t)
	db := workbenchIndependentDB(t, s)
	repo, ref := os.Getenv("ASTROCYTE_TEST_COGNITION_REPOSITORY"), os.Getenv("ASTROCYTE_TEST_COGNITION_PUBLIC_REF")
	if !filepath.IsAbs(repo) || ref == "" {
		t.Fatal("explicit actual public Git repository and ref required")
	}
	remoteBytes, err := exec.Command("git", "-C", repo, "remote", "get-url", "origin").Output()
	remote := strings.TrimSpace(string(remoteBytes))
	canonical := strings.TrimSuffix(remote, ".git")
	if err != nil || (canonical != "https://github.com/songconmaisaix31-design/Astrocyte" && canonical != "https://github.com/songconmaisaix31-design/swarm-anything") {
		t.Fatal("actual repository is outside approved public source")
	}
	history, err := exec.Command("git", "-C", repo, "log", "--format=%H,%ct", ref, "--").Output()
	if err != nil {
		t.Fatal("actual public ref history unavailable")
	}
	rows, err := csv.NewReader(strings.NewReader(string(history))).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	commits := map[string]int64{}
	for _, row := range rows {
		if len(row) != 2 {
			t.Fatal("actual Git history fields incomplete")
		}
		stamp, err := strconv.ParseInt(row[1], 10, 64)
		if err != nil {
			t.Fatal(err)
		}
		commits[row[0]] = stamp * 1000
	}
	expected := workbenchExpectedEvents(t, db, "1=1")
	if len(expected) == 0 || len(expected) != len(commits) {
		t.Fatal("authorized immutable public replay cohort mismatch")
	}
	actual := []workbench.Event{}
	for page := 1; page <= (len(expected)+99)/100; page++ {
		view, err := s.Read(context.Background(), "events", workbench.Query{Page: page, PageSize: 100})
		if err != nil || view.Events.Total != len(expected) {
			t.Fatal("actual full cohort read failed", err)
		}
		actual = append(actual, view.Events.Events...)
	}
	if !reflect.DeepEqual(actual, expected) {
		t.Fatal("actual public cohort projection mismatch")
	}
	nullTokens := 0
	for _, event := range actual {
		var origin, commit, repository, subject string
		var originalTS, storedTS int64
		if err := db.QueryRow(`SELECT origin_key,json_extract(raw_bytes,'$.commit'),json_extract(raw_bytes,'$.public_repository'),json_extract(raw_bytes,'$.subject'),json_extract(raw_bytes,'$.ts'),ts FROM attention_engine_events WHERE id=?`, event.ID).Scan(&origin, &commit, &repository, &subject, &originalTS, &storedTS); err != nil {
			t.Fatal("actual public origin lookup failed", err)
		}
		stamp, present := commits[commit]
		if origin != "git:"+commit || len(commit) != 40 || repository != remote || !present || stamp != storedTS || originalTS != storedTS || event.TS != time.UnixMilli(originalTS).UTC().Format(time.RFC3339Nano) {
			t.Fatal("actual public origin or source timestamp changed")
		}
		delete(commits, commit)
		if len(subject) >= 8 && subject != event.Kind && subject != event.Topic && subject != event.Scope && subject != event.ID && subject != event.TS {
			body, err := json.Marshal(event)
			if err != nil {
				t.Fatal(err)
			}
			var values map[string]json.RawMessage
			if err = json.Unmarshal(body, &values); err != nil {
				t.Fatal(err)
			}
			quoted, err := json.Marshal(subject)
			if err != nil {
				t.Fatal(err)
			}
			for _, value := range values {
				if string(value) == string(quoted) {
					t.Fatal("public source subject escaped the safe projection")
				}
			}
		}
		if event.Tokens == nil {
			nullTokens++
		}
	}
	if len(commits) != 0 {
		t.Fatal("actual public commits are missing from the event cohort")
	}
	// Git 的整数投影不代表已观测模型 usage；null 样本数量直接按当前副本报告。
	t.Logf("actual_public_origins=%d projected_null_tokens=%d projected_integer_tokens=%d", len(actual), nullTokens, len(actual)-nullTokens)
}

func TestWorkbenchActualNativeNullableProjection(t *testing.T) {
	s := workbenchSelectedPublication(t, "ASTROCYTE_TEST_COGNITION_NATIVE_LOCALAPPDATA")
	db := workbenchIndependentDB(t, s)
	expected := workbenchExpectedEvents(t, db, "1=1")
	if len(expected) < 18 {
		t.Fatal("authorized actual native source cohort unavailable")
	}
	nullTokens := 0
	for _, event := range expected {
		if event.Tokens == nil {
			nullTokens++
		}
	}
	if nullTokens < 17 {
		t.Fatal("actual native nullable source coverage unavailable")
	}
	actual := []workbench.Event{}
	for page := 1; page <= (len(expected)+99)/100; page++ {
		view, err := s.Read(context.Background(), "events", workbench.Query{Page: page, PageSize: 100})
		if err != nil || view.Events.Total != len(expected) {
			t.Fatal("actual nullable source read failed", err)
		}
		actual = append(actual, view.Events.Events...)
	}
	if !reflect.DeepEqual(actual, expected) {
		t.Fatal("actual nullable source did not preserve every SQL event field")
	}
	for _, event := range actual {
		var id string
		if err := db.QueryRow(`SELECT id FROM attention_engine_events WHERE id=?`, event.ID).Scan(&id); err != nil || id != event.ID {
			t.Fatal("actual native event identity missing", err)
		}
	}
	t.Logf("actual_native_events=%d projected_null_tokens=%d", len(actual), nullTokens)
}
