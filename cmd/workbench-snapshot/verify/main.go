package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
	_ "time/tzdata"

	"github.com/songconmaisaix31-design/Astrocyte/cmd/internal/attentionruntime"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/events"
	adapter "github.com/songconmaisaix31-design/Astrocyte/internal/adapters/sqlite"
	"github.com/songconmaisaix31-design/Astrocyte/internal/attention/app"
	workbench "github.com/songconmaisaix31-design/Astrocyte/internal/workbench/app"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "PUBLIC_SOURCE_VERIFICATION_FAILED")
		os.Exit(1)
	}
}
func write(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), "safe-*.json")
	if err != nil {
		return err
	}
	if _, err = f.Write(b); err == nil {
		err = f.Sync()
	}
	err = errors.Join(err, f.Close())
	if err != nil {
		return err
	}
	return os.Rename(f.Name(), path)
}
func git(ctx context.Context, repo string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", repo}, args...)...)
	b, err := cmd.Output()
	return strings.TrimSpace(string(b)), err
}
func approvedPublicRepository(remote string) bool {
	remote = strings.TrimSuffix(remote, ".git")
	return remote == "https://github.com/songconmaisaix31-design/Astrocyte" || remote == "https://github.com/songconmaisaix31-design/swarm-anything"
}
func run() (finalErr error) {
	f := flag.NewFlagSet("actual-public-cognition", flag.ContinueOnError)
	mode := f.String("mode", "", "collect, inspect or progress")
	source := f.String("source", "", "explicit server-initialized independent SQLite")
	repo := f.String("repository", "", "explicit public bare Git checkout")
	ref := f.String("ref", "", "explicit actual reachable public Git ref")
	scope := f.String("scope", "", "actual source project scope")
	root := f.String("root", "", "published snapshot root")
	out := f.String("output", "", "owned verification directory")
	strength := f.Float64("strength", -1, "explicit approved signal strength")
	decay := f.Float64("decay", -1, "explicit approved decay")
	confidence := f.Float64("initial-confidence", -1, "explicit approved initial confidence")
	seed := f.Bool("authorized-public-replay", false, "coordinator-authorized manual entry at actual earliest source time")
	pace := f.Duration("pace", 0, "explicit local ingestion pacing; source event times remain unchanged")
	minimumToday := f.Int("minimum-today", 0, "required actual Shanghai today event count for inspection")
	closedDay := f.String("closed-day", "", "require yesterday Sleep actually executed today during inspection")
	if err := f.Parse(os.Args[1:]); err != nil {
		return err
	}
	defer func() {
		if finalErr != nil && *out != "" {
			_ = os.WriteFile(filepath.Join(*out, "verification-error.txt"), []byte(finalErr.Error()), 0600)
		}
	}()
	if *source == "" || (*out == "" && *mode != "progress") || f.NArg() != 0 {
		return errors.New("explicit paths required")
	}
	if *mode == "progress" {
		db, err := readonly(*source)
		if err != nil {
			return err
		}
		defer db.Close()
		var recorded int
		if err := db.QueryRow("SELECT COUNT(*) FROM attention_engine_events").Scan(&recorded); err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(map[string]int{"recorded": recorded})
	}
	if err := os.MkdirAll(*out, 0700); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	if *mode == "inspect" {
		if *minimumToday < 0 || ((*minimumToday > 0 || *closedDay != "") && *root == "") {
			return errors.New("nonnegative minimum and explicit published root required")
		}
		if (*repo == "") != (*ref == "") {
			return errors.New("actual public repository and ref must be supplied together")
		}
		return inspect(ctx, *source, *root, *out, *minimumToday, *closedDay, *repo, *ref)
	}
	if *mode != "collect" || *repo == "" || *ref == "" || *scope == "" || !*seed || *strength < 0 || *decay < 0 || *confidence < 0 || *confidence > 1 {
		return errors.New("explicit approved collection configuration required")
	}
	if _, err := os.Stat(*source); err != nil {
		return err
	}
	remote, err := git(ctx, *repo, "remote", "get-url", "origin")
	if err != nil {
		return err
	}
	if !approvedPublicRepository(remote) {
		return errors.New("only approved public repository allowed")
	}
	commits, err := publicGitRecords(ctx, *repo, *ref)
	if err != nil {
		return err
	}
	var records []app.StoredEvent
	for _, commit := range commits {
		raw, e := json.Marshal(struct {
			events.GitLogRecord
			PublicRepository string `json:"public_repository"`
		}{commit, remote})
		if e != nil {
			return e
		}
		row, e := events.MapGitLogRecord(*scope, raw, time.Now().UnixMilli())
		if e != nil {
			return e
		}
		records = append(records, row)
	}
	sort.Slice(records, func(i, j int) bool {
		if records[i].Observation.TS == records[j].Observation.TS {
			return records[i].OriginKey < records[j].OriginKey
		}
		return records[i].Observation.TS < records[j].Observation.TS
	})
	db, err := adapter.Open(*source)
	if err != nil {
		return err
	}
	defer db.Close()
	var initial int
	if err = db.Conn().QueryRowContext(ctx, "SELECT COUNT(*) FROM attention_engine_events").Scan(&initial); err != nil {
		return err
	}
	if initial != 0 {
		return errors.New("collection requires real initialized empty source")
	}
	// 只在本次自有库关闭自动 checkpoint，便于实际并发 WAL 备份核查。
	if _, err = db.Conn().ExecContext(ctx, "PRAGMA wal_autocheckpoint=0"); err != nil {
		return err
	}
	engine := app.NewDynamicsEngine(adapter.NewDynamicsRepository(db), app.DynamicsOptions{Decay: decay, InitialConfidence: confidence})
	repository := adapter.NewEventRepository(db)
	recorder := attentionruntime.EventRecorder{Events: app.NewEventService(repository, *strength), Repository: repository, Engine: engine}
	seeded := map[string]int64{}
	for _, row := range records {
		if row.Event.Topic == "" {
			continue
		}
		if _, ok := seeded[row.Event.Topic]; ok {
			continue
		}
		// 本次获准人工入口使用实际公开来源时间，保留历史重放说明。
		if _, err = engine.SeedTopic(ctx, app.Principal{ID: "authorized-public-replay", Kind: "human"}, row.Event.Topic, row.Event.TS); err != nil {
			return err
		}
		seeded[row.Event.Topic] = row.Event.TS
	}
	if err = write(filepath.Join(*out, "writer-started.json"), map[string]any{"pid": os.Getpid(), "actual_commits": len(records), "seeded_source_times": seeded, "source": remote, "ref": *ref, "scope": *scope}); err != nil {
		return err
	}
	for _, row := range records {
		if _, err = recorder.Record(ctx, []app.StoredEvent{row}); err != nil {
			return err
		}
		if *pace > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(*pace):
			}
		}
	}
	return write(filepath.Join(*out, "writer-completed.json"), map[string]any{"recorded": len(records), "source": remote, "ref": *ref, "scope": *scope, "seeded_source_times": seeded})
}

func readonly(path string) (*sql.DB, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	p := filepath.ToSlash(absolute)
	if filepath.VolumeName(absolute) != "" {
		p = "/" + p
	}
	u := url.URL{Scheme: "file", Path: p, RawQuery: "mode=ro&_pragma=query_only(1)"}
	db, err := sql.Open("sqlite", u.String())
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	return db, nil
}
func inspect(ctx context.Context, source, root, out string, minimumToday int, closedDay, repo, ref string) error {
	db, err := readonly(source)
	if err != nil {
		return err
	}
	defer db.Close()
	counts := map[string]int{}
	for _, table := range []string{"attention_engine_events", "attention_engine_signals", "attention_engine_nodes", "attention_engine_sleep_runs"} {
		var n int
		if err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+table).Scan(&n); err != nil {
			return err
		}
		counts[table] = n
	}
	var origins, signals int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM attention_engine_events WHERE origin_key LIKE 'git:%'`).Scan(&origins); err != nil {
		return err
	}
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM attention_engine_signals s JOIN attention_engine_events e ON e.id=s.event_id WHERE e.origin_key LIKE 'git:%'`).Scan(&signals); err != nil {
		return err
	}
	if err = write(filepath.Join(out, "actual-counts.json"), map[string]any{"counts": counts, "actual_git_origins": origins, "signals_linked_to_git": signals}); err != nil {
		return err
	}
	if root == "" {
		return nil
	}
	root, err = filepath.Abs(root)
	if err != nil {
		return err
	}
	reader := adapter.NewWorkbenchReader(root)
	views := map[string]workbench.View{}
	for _, name := range []string{"health", "today", "focus", "agents", "events", "filters", "topics/evidence"} {
		v, e := reader.Read(ctx, name, workbench.Query{})
		if e != nil {
			return e
		}
		views[name] = v
	}
	if err = write(filepath.Join(out, "production-reader-safe.json"), views); err != nil {
		return err
	}
	// 独立 SQL 只读取六字段及所需聚合，不输出 observation/raw/data。
	rows, err := db.QueryContext(ctx, `SELECT id,kind,topic,CASE WHEN json_type(data,'$.tokens')='integer' THEN json_extract(data,'$.tokens') END,CASE WHEN json_type(data,'$.scope')='text' THEN json_extract(data,'$.scope') ELSE '' END,ts FROM attention_engine_events ORDER BY ts DESC,id ASC`)
	if err != nil {
		return err
	}
	safe := []workbench.Event{}
	for rows.Next() {
		var x workbench.Event
		var tokens sql.NullInt64
		var ts int64
		if err = rows.Scan(&x.ID, &x.Kind, &x.Topic, &tokens, &x.Scope, &ts); err != nil {
			rows.Close()
			return err
		}
		if tokens.Valid {
			v := tokens.Int64
			x.Tokens = &v
		}
		x.TS = time.UnixMilli(ts).UTC().Format(time.RFC3339Nano)
		safe = append(safe, x)
	}
	err = errors.Join(rows.Err(), rows.Close())
	if err != nil {
		return err
	}
	if err = write(filepath.Join(out, "events-six-fields.json"), safe); err != nil {
		return err
	}
	publicIDs := map[string]int64{}
	publicRepository := ""
	if repo != "" {
		remote, e := git(ctx, repo, "remote", "get-url", "origin")
		if e != nil || !approvedPublicRepository(remote) {
			return errors.New("only approved actual public repository allowed")
		}
		publicRepository = remote
		_, commits, e := publicGitMetadata(ctx, repo, ref)
		if e != nil {
			return e
		}
		for _, commit := range commits {
			publicIDs[commit.Commit] = commit.TS
		}
		if len(publicIDs) != len(safe) {
			return errors.New("SQL event cohort differs from actual reachable public commits")
		}
	}
	for _, event := range safe {
		var origin, commit, repository string
		var observed, stored int64
		if err = db.QueryRowContext(ctx, `SELECT origin_key,json_extract(raw_bytes,'$.commit'),json_extract(raw_bytes,'$.public_repository'),json_extract(raw_bytes,'$.ts'),ts FROM attention_engine_events WHERE id=?`, event.ID).Scan(&origin, &commit, &repository, &observed, &stored); err != nil {
			return err
		}
		if publicRepository == "" {
			publicRepository = repository
		}
		if origin != "git:"+strings.ToLower(commit) || !approvedPublicRepository(repository) || repository != publicRepository || observed != stored || time.UnixMilli(stored).UTC().Format(time.RFC3339Nano) != event.TS {
			return errors.New("event origin differs from actual public commit")
		}
		if repo != "" {
			stamp, present := publicIDs[commit]
			if !present {
				return errors.New("SQL contains repeated or out of cohort public commit")
			}
			if stamp != stored {
				return errors.New("SQL event time differs from actual Git commit time")
			}
			delete(publicIDs, commit)
		}
	}
	if len(publicIDs) != 0 {
		return errors.New("actual public commits missing from SQL")
	}
	if err = write(filepath.Join(out, "origin-safe.json"), map[string]any{"event_ids_located": len(safe), "actual_git_origins_matched": len(safe), "source": publicRepository, "source_ts_preserved": true, "public_ref": ref, "reachable_commits_sql_verified": repo != ""}); err != nil {
		return err
	}
	wire, err := json.Marshal(views)
	if err != nil {
		return err
	}
	var wireValues any
	if err = json.Unmarshal(wire, &wireValues); err != nil {
		return err
	}
	stringsInView := map[string]bool{}
	var visit func(any)
	visit = func(value any) {
		switch x := value.(type) {
		case string:
			stringsInView[x] = true
		case []any:
			for _, child := range x {
				visit(child)
			}
		case map[string]any:
			for _, child := range x {
				visit(child)
			}
		}
	}
	visit(wireValues)
	allowed := map[string]bool{}
	for _, x := range safe {
		allowed[x.ID] = true
		allowed[x.Kind] = true
		allowed[x.Topic] = true
		allowed[x.Scope] = true
		allowed[x.TS] = true
	}
	raw, err := db.QueryContext(ctx, `SELECT json_extract(raw_bytes,'$.subject') FROM attention_engine_events WHERE origin_key LIKE 'git:%'`)
	if err != nil {
		return err
	}
	rawChecked := 0
	for raw.Next() {
		var subject string
		if err = raw.Scan(&subject); err != nil {
			raw.Close()
			return err
		}
		if len(subject) >= 8 && !allowed[subject] {
			rawChecked++
			if stringsInView[subject] {
				raw.Close()
				return errors.New("raw public source subject leaked into Reader")
			}
		}
	}
	err = errors.Join(raw.Err(), raw.Close())
	if err != nil {
		return err
	}
	if err = write(filepath.Join(out, "privacy-safe.json"), map[string]any{"event_fields": []string{"event_id", "kind", "topic", "tokens", "scope", "ts"}, "raw_source_strings_checked": rawChecked, "raw_string_leaks": 0, "projected_events": len(safe)}); err != nil {
		return err
	}
	for page := 1; page <= (len(safe)+99)/100; page++ {
		v, e := reader.Read(ctx, "events", workbench.Query{Page: page, PageSize: 100})
		if e != nil {
			return e
		}
		length := min(100, len(safe)-(page-1)*100)
		if v.Events.Total != len(safe) || len(v.Events.Events) != length {
			return errors.New("Reader page length or total differs from source SQL")
		}
		for i, x := range v.Events.Events {
			expected := safe[(page-1)*100+i]
			a, _ := json.Marshal(x)
			b, _ := json.Marshal(expected)
			if string(a) != string(b) {
				return errors.New("Reader six fields differ from source SQL")
			}
		}
	}
	last, e := reader.Read(ctx, "events", workbench.Query{Page: (len(safe)+99)/100 + 1, PageSize: 100})
	if e != nil {
		return e
	}
	if len(last.Events.Events) != 0 || last.Events.Total != len(safe) {
		return errors.New("Reader final page or total differs from SQL")
	}
	if len(views["focus"].Focus.Topics) < 2 {
		return errors.New("fewer than two actual topics")
	}
	ranked, err := db.QueryContext(ctx, `SELECT topic,attention,momentum,confidence FROM attention_engine_nodes ORDER BY attention DESC,topic ASC`)
	if err != nil {
		return err
	}
	rank := 0
	for ranked.Next() {
		var topic string
		var a, m, c float64
		if err = ranked.Scan(&topic, &a, &m, &c); err != nil {
			ranked.Close()
			return err
		}
		if rank >= len(views["focus"].Focus.Topics) {
			ranked.Close()
			return errors.New("Reader topic ranking lost nodes")
		}
		actual := views["focus"].Focus.Topics[rank]
		if actual.Topic != topic || actual.Attention != a || actual.Momentum != m || actual.Confidence != c {
			ranked.Close()
			return errors.New("Reader topic rank or scalars differ from SQL")
		}
		rank++
	}
	err = errors.Join(ranked.Err(), ranked.Close())
	if err != nil {
		return err
	}
	if rank != len(views["focus"].Focus.Topics) {
		return errors.New("Reader topic ranking added nodes")
	}
	topic := views["focus"].Focus.Topics[0].Topic
	var total int
	if err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM attention_engine_events WHERE topic=?", topic).Scan(&total); err != nil {
		return err
	}
	var sampleTopic string
	var sampleCount int
	if err = db.QueryRowContext(ctx, `SELECT topic,COUNT(*) FROM attention_engine_events WHERE topic<>'' GROUP BY topic HAVING COUNT(*)>20 ORDER BY COUNT(*) DESC,topic ASC LIMIT 1`).Scan(&sampleTopic, &sampleCount); err != nil {
		return errors.New("no actual topic has more than twenty events")
	}
	sample := []workbench.Event{}
	for _, event := range safe {
		if event.Topic == sampleTopic {
			sample = append(sample, event)
		}
	}
	if len(sample) != sampleCount {
		return errors.New("topic sample differs from SQL count")
	}
	for _, size := range []int{20, 50} {
		for page := 1; page <= (sampleCount+size-1)/size+1; page++ {
			v, e := reader.Read(ctx, "topics/evidence", workbench.Query{Topic: sampleTopic, Page: page, PageSize: size})
			if e != nil {
				return e
			}
			expectedLength := max(0, min(size, sampleCount-(page-1)*size))
			if v.Evidence.Events.Total != sampleCount || len(v.Evidence.Events.Events) != expectedLength {
				return errors.New("topic evidence pagination lost events")
			}
			for i, event := range v.Evidence.Events.Events {
				a, _ := json.Marshal(event)
				b, _ := json.Marshal(sample[(page-1)*size+i])
				if string(a) != string(b) {
					return errors.New("topic evidence page differs from SQL")
				}
			}
		}
	}
	values := []map[string]any{}
	zone, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return err
	}
	today := time.Now().In(zone)
	day := today.Format(time.DateOnly)
	for i := 2; i >= 0; i-- {
		d := today.AddDate(0, 0, -i)
		start := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, zone)
		var n int
		if err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM attention_engine_events WHERE ts>=? AND ts<?", start.UnixMilli(), start.AddDate(0, 0, 1).UnixMilli()).Scan(&n); err != nil {
			return err
		}
		values = append(values, map[string]any{"route": "/cognition/today", "metric": "daily_count", "day": start.Format(time.DateOnly), "value": n, "query": map[string]any{}})
	}
	for _, metric := range []string{"attention", "momentum", "confidence"} {
		var n float64
		if err = db.QueryRowContext(ctx, "SELECT "+metric+" FROM attention_engine_nodes WHERE topic=?", topic).Scan(&n); err != nil {
			return err
		}
		values = append(values, map[string]any{"route": "/cognition/focus", "metric": metric, "topic": topic, "value": n, "query": map[string]any{}})
	}
	var src string
	if err = db.QueryRowContext(ctx, "SELECT source FROM attention_engine_events GROUP BY source ORDER BY COUNT(*) DESC,source LIMIT 1").Scan(&src); err != nil {
		return err
	}
	for _, item := range []struct {
		metric string
		days   int
	}{{"today", 1}, {"days7", 7}, {"days30", 30}} {
		start := today.AddDate(0, 0, -item.days+1)
		start = time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, zone)
		end := time.Date(today.Year(), today.Month(), today.Day()+1, 0, 0, 0, 0, zone)
		var n int
		if err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM attention_engine_events WHERE source=? AND ts>=? AND ts<?", src, start.UnixMilli(), end.UnixMilli()).Scan(&n); err != nil {
			return err
		}
		values = append(values, map[string]any{"route": "/cognition/agents", "metric": item.metric, "source": src, "value": n, "query": map[string]any{}})
	}
	var all int
	if err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM attention_engine_events").Scan(&all); err != nil {
		return err
	}
	values = append(values, map[string]any{"route": "/cognition/evidence", "metric": "total", "value": all, "query": map[string]any{}})
	if err = write(filepath.Join(out, "sql-expected.json"), map[string]any{"snapshot_at": views["health"].SnapshotAt, "day": day, "values": values}); err != nil {
		return err
	}
	if len(values) != 10 {
		return errors.New("four route SQL expectations must contain exactly ten values")
	}
	for _, expected := range values {
		var actual any
		switch expected["route"] {
		case "/cognition/today":
			for _, daily := range views["today"].Today.DailyCounts {
				if daily.Day == expected["day"] {
					actual = daily.Count
				}
			}
		case "/cognition/focus":
			top := views["focus"].Focus.Topics[0]
			switch expected["metric"] {
			case "attention":
				actual = top.Attention
			case "momentum":
				actual = top.Momentum
			case "confidence":
				actual = top.Confidence
			}
		case "/cognition/agents":
			for _, group := range views["agents"].Agents.Groups {
				if group.Source == expected["source"] {
					switch expected["metric"] {
					case "today":
						actual = group.Today
					case "days7":
						actual = group.Days7
					case "days30":
						actual = group.Days30
					}
				}
			}
		case "/cognition/evidence":
			actual = views["events"].Events.Total
		}
		if actual == nil || actual != expected["value"] {
			return errors.New("production Reader differs from four route SQL expectations")
		}
	}
	startToday := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, zone)
	var todayCount, yesterdayCount int
	if err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM attention_engine_events WHERE ts>=? AND ts<?", startToday.UnixMilli(), startToday.AddDate(0, 0, 1).UnixMilli()).Scan(&todayCount); err != nil {
		return err
	}
	if err = db.QueryRowContext(ctx, "SELECT COUNT(*) FROM attention_engine_events WHERE ts>=? AND ts<?", startToday.AddDate(0, 0, -1).UnixMilli(), startToday.UnixMilli()).Scan(&yesterdayCount); err != nil {
		return err
	}
	if todayCount < minimumToday || views["today"].Today.Day != day {
		return errors.New("actual today events below required sample or Reader day differs")
	}
	for _, daily := range views["today"].Today.DailyCounts {
		if daily.Day == day && daily.Count != todayCount {
			return errors.New("Reader today count differs from SQL")
		}
	}
	var sleepStarted, sleepCompleted int64
	if closedDay != "" {
		if counts["attention_engine_sleep_runs"] != 1 {
			return errors.New("cross-day isolated source must contain exactly one actual Sleep")
		}
		if closedDay != startToday.AddDate(0, 0, -1).Format(time.DateOnly) || yesterdayCount == 0 {
			return errors.New("closed day must be actual yesterday with real source events")
		}
		if err = db.QueryRowContext(ctx, "SELECT started_at,completed_at FROM attention_engine_sleep_runs WHERE day=?", closedDay).Scan(&sleepStarted, &sleepCompleted); err != nil {
			return err
		}
		actualSleep := views["today"].Today.Sleep
		if sleepStarted < startToday.UnixMilli() || sleepCompleted < sleepStarted || sleepCompleted > time.Now().UnixMilli() || actualSleep.Day != closedDay || actualSleep.Status != "completed" || actualSleep.CompletedAt == nil || *actualSleep.CompletedAt != time.UnixMilli(sleepCompleted).UTC().Format(time.RFC3339Nano) {
			return errors.New("yesterday Sleep must actually complete today and match Reader")
		}
	}
	historyCounts := map[string]int{}
	for _, series := range views["focus"].Focus.Series {
		historyCounts[series.Topic] = len(series.Points)
		if len(series.Points) < 2 {
			return errors.New("actual topic history has fewer than two state points")
		}
		var updated int64
		var attention float64
		if err = db.QueryRowContext(ctx, "SELECT updated_at,attention FROM attention_engine_nodes WHERE topic=?", series.Topic).Scan(&updated, &attention); err != nil {
			return err
		}
		found := false
		previous := int64(0)
		for _, point := range series.Points {
			stamp, e := time.Parse(time.RFC3339Nano, point.TS)
			if e != nil || stamp.UnixMilli() <= previous || stamp.UnixMilli() > time.Now().UnixMilli() {
				return errors.New("history must preserve strictly increasing actual state times")
			}
			previous = stamp.UnixMilli()
			if previous == updated && point.Attention == attention {
				found = true
			}
		}
		if !found {
			return errors.New("actual SQL node state is absent from history")
		}
	}
	if len(historyCounts) != rank {
		return errors.New("history must cover every actual topic")
	}
	if err = write(filepath.Join(out, "cross-day-safe.json"), map[string]any{"day": day, "today_events": todayCount, "yesterday_events": yesterdayCount, "minimum_today": minimumToday, "closed_day": closedDay, "sleep_started_at": sleepStarted, "sleep_completed_at": sleepCompleted, "zero_token_git_is_model_usage": false, "actual_history_sql_verified": true}); err != nil {
		return err
	}
	phase := "before_sleep"
	if counts["attention_engine_sleep_runs"] > 0 {
		phase = "after_sleep"
	}
	if err = write(filepath.Join(out, "admission-safe.json"), map[string]any{"status": "PASS", "state_phase": phase, "actual_sleep_runs": counts["attention_engine_sleep_runs"], "provenance": "actual-public-Git-production-replay", "highest_attention_topic": topic, "highest_topic_events": total, "highest_rank_and_scalars_sql_verified": true, "pagination_topic": sampleTopic, "pagination_events": sampleCount, "page_sizes_verified": []int{20, 50}, "required_sample_events": ">20", "history_points": historyCounts, "six_field_sql_matches": len(safe), "sql_ui_values": len(values)}); err != nil {
		return err
	}
	return nil
}
