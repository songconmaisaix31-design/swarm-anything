package app_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/importers"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/sqlite"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	. "github.com/songconmaisaix31-design/Astrocyte/internal/attention/app"
)

type observedListing struct {
	reader    PublicListingReader
	mu        sync.Mutex
	cursors   []string
	interrupt context.CancelFunc
}

func (r *observedListing) ReadPage(ctx context.Context, source TrackingSource, cursor string, limit int) (ListingPage, error) {
	r.mu.Lock()
	r.cursors = append(r.cursors, cursor)
	if len(r.cursors) == 2 && r.interrupt != nil {
		r.interrupt()
	}
	r.mu.Unlock()
	return r.reader.ReadPage(ctx, source, cursor, limit)
}

func TestActualPartialListingFailureRetainsCursorAndBudget(t *testing.T) {
	ctx := context.Background()
	reader := publicListing()
	folders, err := reader.ListCollections(ctx, "bilibili", "3494358764489275")
	if err != nil {
		t.Fatal("observe approved actual two-page source")
	}
	var chosen *SourceCollection
	for i := range folders {
		if folders[i].ItemCount != nil && *folders[i].ItemCount > 20 {
			chosen = &folders[i]
			break
		}
	}
	if chosen == nil {
		t.Fatal("actual two-page source prerequisite unavailable")
	}
	// 生产收藏夹窗口固定为 20；实际页尾与下一页分别占用本次两个名额。
	cursor := "1:19"
	source := TrackingSource{Platform: "bilibili", SourceKind: "favorites", ExternalID: chosen.ExternalID, OwnerID: chosen.OwnerID}
	boundary, err := reader.ReadPage(ctx, source, cursor, 2)
	if err != nil || boundary.Observed != 1 || len(boundary.Items) != 1 || !boundary.HasMore || boundary.NextCursor == nil || *boundary.NextCursor != "2" {
		t.Fatal("actual public page boundary prerequisite unavailable")
	}
	next, err := reader.ReadPage(ctx, source, *boundary.NextCursor, 1)
	if err != nil || next.Observed != 1 || len(next.Items) != 1 {
		t.Fatal("actual public next-page item prerequisite unavailable")
	}
	_, db, objects := fixture(t)
	workCtx, interrupt := context.WithCancel(ctx)
	defer interrupt()
	observed := &observedListing{reader: reader, interrupt: interrupt}
	s := NewAttentionService(sqlite.NewAttentionRepository(db), importers.NewReader(nil), objects, ServiceOptions{ListingReader: observed, JobTimeout: 3 * time.Minute})
	r, err := s.BindTrackingSource(ctx, human, BindTrackingSourceCommand{CommandMeta: meta("partial-bind", 1), Platform: "bilibili", SourceKind: "favorites", ExternalID: chosen.ExternalID, OwnerID: "3494358764489275", Locator: chosen.Locator})
	if err != nil {
		t.Fatal("bind actual public source")
	}
	queued, err := s.SyncTrackingSource(ctx, human, r.Source.ID, SyncTrackingSourceCommand{CommandMeta: meta("partial-sync", r.Source.Version), Cursor: cursor, Limit: 2})
	if err != nil || len(queued.Jobs) != 1 {
		t.Fatal("queue actual partial source window")
	}
	if _, err = s.ProcessNextJob(workCtx); err != nil {
		t.Fatal("controlled real context interruption failed")
	}
	r, err = s.GetTrackingSource(ctx, human, r.Source.ID)
	if err != nil {
		t.Fatal("load actual partial source cache")
	}
	job, err := s.GetJob(ctx, human, queued.Jobs[0].JobID)
	if err != nil || job.Status != "failed" || len(r.Items) != 1 || !r.Items[0].Stale || r.Source.LastSuccessAt != nil || r.Source.LastError == nil || job.Error == nil || !job.Error.Retryable {
		t.Fatal("interrupted actual first page became empty or successful")
	}
	op, deadline := job.OperationID, job.DeadlineAt
	observed.mu.Lock()
	observed.interrupt = nil
	observed.mu.Unlock()
	// 按实际重试间隔等待，生产 Run 自行恢复同一可安全读取作业。
	time.Sleep(2 * time.Second)
	runCtx, stop := context.WithCancel(ctx)
	defer stop()
	done := make(chan error, 1)
	go func() { done <- s.Run(runCtx) }()
	finish := time.Now().Add(10 * time.Second)
	for {
		job, err = s.GetJob(ctx, human, job.JobID)
		if err != nil {
			t.Fatal("read actual retried job")
		}
		if job.Status == "succeeded" {
			break
		}
		if time.Now().After(finish) {
			t.Fatal("actual safe retry did not finish saved cursor")
		}
		time.Sleep(20 * time.Millisecond)
	}
	stop()
	if err = <-done; err != nil {
		t.Fatal("stop actual retry worker")
	}
	r, err = s.GetTrackingSource(ctx, human, r.Source.ID)
	if err != nil {
		t.Fatal("load actual resumed cache")
	}
	observed.mu.Lock()
	calls := append([]string(nil), observed.cursors...)
	observed.mu.Unlock()
	if job.Status != "succeeded" || job.Attempts != 2 || job.OperationID != op || !job.DeadlineAt.Equal(deadline) || len(r.Items) != 2 || r.Items[0].Stale || r.Items[1].Stale || len(calls) != 3 || calls[2] != calls[1] {
		t.Fatal("actual safe retry lost cursor, cache, operation or budget")
	}
}

func publicListing() *importers.PublicListing {
	python := os.Getenv("ASTROCYTE_LISTING_PYTHON")
	if python == "" {
		python = filepath.Join(os.Getenv("LOCALAPPDATA"), "Astrocyte", "media", "yt-dlp-2026.08.19", "Scripts", "python.exe")
	}
	return importers.NewPublicListingReader(python)
}

func TestSavedFinalListingPageCompletesWithoutReader(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	_, db, objects := fixture(t)
	reader := publicListing()
	captureResponses(t, reader.Bilibili.Client)
	folders, err := reader.ListCollections(ctx, "bilibili", "3494358764489275")
	if err != nil {
		t.Fatal("observe authorized actual public collections")
	}
	var chosen *SourceCollection
	for i := range folders {
		if folders[i].ItemCount != nil && *folders[i].ItemCount > 0 {
			chosen = &folders[i]
			break
		}
	}
	if chosen == nil {
		t.Fatal("actual final-page source prerequisite unavailable")
	}
	position := *chosen.ItemCount - 1
	cursor := strconv.Itoa(position/20 + 1)
	if position%20 != 0 {
		cursor += fmt.Sprintf(":%d", position%20)
	}
	s := NewAttentionService(sqlite.NewAttentionRepository(db), importers.NewReader(nil), objects, ServiceOptions{ListingReader: reader, JobTimeout: 3 * time.Minute})
	r, err := s.BindTrackingSource(ctx, human, BindTrackingSourceCommand{CommandMeta: meta("saved-bind", 1), Platform: "bilibili", SourceKind: "favorites", ExternalID: chosen.ExternalID, OwnerID: "3494358764489275", Locator: chosen.Locator})
	if err != nil {
		t.Fatal("bind approved actual listing")
	}
	// 只阻断完成事务，真实目录页先由生产 Service 持久化。
	if _, err = db.Conn().Exec("CREATE TRIGGER attention_test_saved_page_failure BEFORE INSERT ON attention_outbox WHEN NEW.type='attention.job_succeeded' BEGIN SELECT RAISE(ABORT, 'owned completion writes refused'); END"); err != nil {
		t.Fatal("restrict owned final-page completion")
	}
	queued, err := s.SyncTrackingSource(ctx, human, r.Source.ID, SyncTrackingSourceCommand{CommandMeta: meta("saved-final-page", r.Source.Version), Cursor: cursor})
	if err != nil || len(queued.Jobs) != 1 {
		t.Fatal("queue real final source window")
	}
	if _, err = s.ProcessNextJob(ctx); err == nil {
		t.Fatal("owned completion restriction did not fail at its transaction")
	}
	job, err := s.GetJob(ctx, human, queued.Jobs[0].JobID)
	if err != nil || job.Status != "running" || job.DeliveryUnknown {
		t.Fatal("known completion obstruction lost real saved page")
	}
	var payload struct {
		Done         bool
		Count, Limit int
		Seen         []string
	}
	if err = json.Unmarshal(job.Payload, &payload); err != nil {
		t.Fatal("decode actual persisted final page")
	}
	if !payload.Done || payload.Count != 1 || payload.Limit != 100 || len(payload.Seen) != 1 {
		code := "unknown"
		if job.Error != nil {
			code = string(job.Error.Code)
		}
		t.Fatalf("actual final-window prerequisite: done=%t count=%d limit=%d seen=%d code=%s", payload.Done, payload.Count, payload.Limit, len(payload.Seen), code)
	}
	if _, err = db.Conn().Exec("DROP TRIGGER attention_test_saved_page_failure"); err != nil {
		t.Fatal("restore owned final-page completion")
	}
	var dbPath string
	if err = db.Conn().QueryRow("SELECT file FROM pragma_database_list WHERE name='main'").Scan(&dbPath); err != nil {
		t.Fatal("locate owned durable database")
	}
	if err = db.Close(); err != nil {
		t.Fatal("close actual database before restart")
	}
	db, err = sqlite.Open(dbPath)
	if err != nil {
		t.Fatal("reopen actual saved-page database")
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error("close reopened saved-page database")
		}
	})
	s = NewAttentionService(sqlite.NewAttentionRepository(db), importers.NewReader(nil), objects, ServiceOptions{JobTimeout: 3 * time.Minute})
	if err = s.RecoverJobs(ctx); err != nil {
		t.Fatal("recover actual interrupted saved-page completion")
	}
	job, err = s.GetJob(ctx, human, job.JobID)
	if err != nil || job.Status != "failed" || job.DeliveryUnknown {
		t.Fatal("safe cached-page recovery changed delivery semantics")
	}
	if _, err = s.RetryJob(ctx, human, job.JobID, meta("saved-page-retry", job.Version)); err != nil {
		t.Fatal("retry saved real final-page completion")
	}
	if _, err = s.ProcessNextJob(ctx); err != nil {
		t.Fatal("complete durable page with no listing reader")
	}
	r, err = s.GetTrackingSource(ctx, human, r.Source.ID)
	job, jobErr := s.GetJob(ctx, human, job.JobID)
	if err != nil || jobErr != nil || job.Status != "succeeded" || r.Source.LastSuccessAt == nil || len(r.Items) != 1 || r.Items[0].Stale {
		t.Fatal("durable real final page discarded or fetched again")
	}
}

// 只验证人工绑定参数和持久化，不声称已读取这些配置对应的外部目录。
func TestSourceIdentityAndPublicOnlyBinding(t *testing.T) {
	ctx := context.Background()
	s, db, _ := fixture(t)
	first, err := s.BindTrackingSource(ctx, human, BindTrackingSourceCommand{CommandMeta: meta("bind", 1), Platform: "bilibili", SourceKind: "uploads", Locator: "3494358764489275"})
	if err != nil {
		t.Fatal("bind approved source identity")
	}
	r, err := s.BindTrackingSource(ctx, human, BindTrackingSourceCommand{CommandMeta: meta("bind-alias", 1), Platform: "bilibili", SourceKind: "uploads", ExternalID: "3494358764489275", Locator: "https://space.bilibili.com/3494358764489275/upload/video?tracking=1"})
	if err != nil || r.Source.ID != first.Source.ID || countRows(t, db, "attention_tracking_sources") != 1 {
		t.Fatal("account aliases duplicated durable binding")
	}
	_, err = s.BindTrackingSource(ctx, human, BindTrackingSourceCommand{CommandMeta: meta("second-account", 1), Platform: "bilibili", SourceKind: "uploads", Locator: "12345"})
	if err != nil || countRows(t, db, "attention_tracking_sources") != 2 {
		t.Fatal("multiple explicit binding parameters not retained")
	}
	_, err = s.BindTrackingSource(ctx, human, BindTrackingSourceCommand{CommandMeta: meta("douyin-self", 1), Platform: "douyin", SourceKind: "favorites", Locator: "https://www.douyin.com/user/self?showTab=favorite_collection"})
	errorCode(t, err, apierrors.ScopeDenied)
	_, err = s.BindTrackingSource(ctx, human, BindTrackingSourceCommand{CommandMeta: meta("mismatch", 1), Platform: "bilibili", SourceKind: "uploads", ExternalID: "1", Locator: "3494358764489275"})
	errorCode(t, err, apierrors.ValidationFailed)
	_, err = s.BindTrackingSource(ctx, human, BindTrackingSourceCommand{CommandMeta: meta("folder", 1), Platform: "bilibili", SourceKind: "favorites", Locator: "https://space.bilibili.com/3494358764489275/favlist?fid=456"})
	if err != nil || countRows(t, db, "attention_tracking_sources") != 3 {
		t.Fatal("explicit folder not retained as separate configuration")
	}
}

func TestPublicTrackingSourceCapacity(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	_, db, objects := fixture(t)
	reader := publicListing()
	s := NewAttentionService(sqlite.NewAttentionRepository(db), importers.NewReader(nil), objects, ServiceOptions{ListingReader: reader, MaxAttempts: 1, JobTimeout: 3 * time.Minute})
	bound, err := s.BindTrackingSource(ctx, human, BindTrackingSourceCommand{CommandMeta: meta("public-bind", 1), Platform: "bilibili", SourceKind: "uploads", Locator: "3494358764489275"})
	if err != nil {
		t.Fatal("bind authorized public source")
	}
	queued, err := s.SyncTrackingSource(ctx, human, bound.Source.ID, SyncTrackingSourceCommand{CommandMeta: meta("public-sync", bound.Source.Version)})
	if err != nil || len(queued.Jobs) != 1 {
		t.Fatal("queue actual public listing observation")
	}
	if _, err = s.ProcessNextJob(ctx); err != nil {
		t.Fatal("process actual public listing job")
	}
	job, err := s.GetJob(ctx, human, queued.Jobs[0].JobID)
	if err != nil {
		t.Fatal("load actual public listing job")
	}
	if job.Status != "succeeded" {
		code := "unknown"
		if job.Error != nil {
			code = string(job.Error.Code)
		}
		t.Fatalf("public listing did not succeed: status=%s code=%s; raw evidence remains in owned SQLite", job.Status, code)
	}
	observed, err := s.GetTrackingSource(ctx, human, bound.Source.ID)
	if err != nil {
		t.Fatal("load observed public metadata")
	}
	if len(observed.Items) != 100 || !observed.HasMore {
		t.Fatalf("public source cannot validate 100-item truncation: observed=%d has_more=%t", len(observed.Items), observed.HasMore)
	}
	if countRows(t, db, "attention_materials") != 0 {
		t.Fatal("metadata sync imported unselected bodies")
	}
}

func TestActualPublicMetadataRequiresRecommendationBeforeBodySelection(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	_, db, objects := fixture(t)
	listing := publicListing()
	captureResponses(t, listing.Bilibili.Client)
	reader := &observedSource{Reader: importers.NewReader(nil)}
	s := NewAttentionService(sqlite.NewAttentionRepository(db), reader, objects, ServiceOptions{ListingReader: listing, MaxAttempts: 1, JobTimeout: 3 * time.Minute})
	bound, err := s.BindTrackingSource(ctx, human, BindTrackingSourceCommand{CommandMeta: meta("gate-bind", 1), Platform: "bilibili", SourceKind: "uploads", Locator: "3494358764489275"})
	if err != nil {
		t.Fatal("bind authorized public source for selection gate")
	}
	queued, err := s.SyncTrackingSource(ctx, human, bound.Source.ID, SyncTrackingSourceCommand{CommandMeta: meta("gate-sync", bound.Source.Version)})
	if err != nil || len(queued.Jobs) != 1 {
		t.Fatal("queue actual public metadata observation")
	}
	if _, err = s.ProcessNextJob(ctx); err != nil {
		t.Fatal("process actual public metadata observation")
	}
	job, err := s.GetJob(ctx, human, queued.Jobs[0].JobID)
	if err != nil || job.Status != "succeeded" {
		t.Fatal("actual public metadata prerequisite failed")
	}
	observed, err := s.GetTrackingSource(ctx, human, bound.Source.ID)
	if err != nil {
		t.Fatal("read actual public metadata cache")
	}
	var selection []SourceItemSelection
	for _, item := range observed.Items {
		if !item.Stale && item.Metadata.UnavailableReason == "" && item.Metadata.Locator != "" {
			selection = []SourceItemSelection{{ExternalID: item.ExternalID, Revision: item.Revision}}
			break
		}
	}
	if len(selection) != 1 || reader.calls.Load() != 0 || objects.publishes.Load() != 0 || countRows(t, db, "attention_materials") != 0 {
		t.Fatal("actual metadata missing or unselected body was imported")
	}
	beforeJobs := countRows(t, db, "attention_jobs")
	beforeReceipts := countRows(t, db, "attention_receipts")
	_, err = s.SelectSourceItems(ctx, human, observed.Source.ID, SelectSourceItemsCommand{CommandMeta: meta("gate-before-recommendation", observed.Source.Version), Items: selection})
	errorCode(t, err, apierrors.EvidenceMissing)
	command := RecommendSourceItemsCommand{CommandMeta: meta("gate-unconfigured-recommendation", observed.Source.Version), ProjectID: "unselected-public-project", CLI: "codex", Items: selection}
	_, err = s.RecommendSourceItems(ctx, human, observed.Source.ID, command)
	errorCode(t, err, apierrors.ProviderUnavailable)
	command.CommandMeta = meta("gate-agent-recommendation", observed.Source.Version)
	_, err = s.RecommendSourceItems(ctx, agent, observed.Source.ID, command)
	errorCode(t, err, apierrors.ScopeDenied)
	if countRows(t, db, "attention_jobs") != beforeJobs || countRows(t, db, "attention_receipts") != beforeReceipts || countRows(t, db, "attention_materials") != 0 || reader.calls.Load() != 0 || objects.publishes.Load() != 0 {
		t.Fatal("refused selection or recommendation performed body work")
	}
	current, err := s.GetTrackingSource(ctx, human, observed.Source.ID)
	if err != nil || current.Source.Version != observed.Source.Version {
		t.Fatal("refused actions changed source version")
	}
	for _, item := range current.Items {
		if item.Selected || item.ImportJobID != nil || item.Recommendation != nil {
			t.Fatal("refused actions fabricated selection or recommendation")
		}
	}
}

func TestPublicFavoriteSourceCapacity(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	reader := publicListing()
	captureResponses(t, reader.Bilibili.Client)
	folders, err := reader.ListCollections(ctx, "bilibili", "3494358764489275")
	if err != nil {
		t.Fatal("actual approved public collection metadata unavailable")
	}
	var chosen *SourceCollection
	maxCount := 0
	for i := range folders {
		folder := &folders[i]
		if folder.ItemCount != nil {
			if *folder.ItemCount > maxCount {
				maxCount = *folder.ItemCount
			}
			if *folder.ItemCount > 100 && chosen == nil {
				chosen = folder
			}
		}
	}
	if chosen == nil {
		t.Fatalf("approved public favorites cannot validate 100-item truncation: collections=%d max_items=%d", len(folders), maxCount)
	}
	t.Logf("approved public collection observation: folders=%d selected_items=%d", len(folders), *chosen.ItemCount)
	_, db, objects := fixture(t)
	s := NewAttentionService(sqlite.NewAttentionRepository(db), importers.NewReader(nil), objects, ServiceOptions{ListingReader: reader, MaxAttempts: 1, JobTimeout: 3 * time.Minute})
	bound, err := s.BindTrackingSource(ctx, human, BindTrackingSourceCommand{CommandMeta: meta("public-favorite-bind", 1), Platform: "bilibili", SourceKind: "favorites", ExternalID: chosen.ExternalID, OwnerID: "3494358764489275", Locator: chosen.Locator})
	if err != nil {
		t.Fatal("bind observed approved public favorite folder")
	}
	queued, err := s.SyncTrackingSource(ctx, human, bound.Source.ID, SyncTrackingSourceCommand{CommandMeta: meta("public-favorite-sync", bound.Source.Version)})
	if err != nil || len(queued.Jobs) != 1 {
		t.Fatal("queue actual public favorite listing")
	}
	if _, err = s.ProcessNextJob(ctx); err != nil {
		t.Fatal("process actual public favorite listing")
	}
	job, err := s.GetJob(ctx, human, queued.Jobs[0].JobID)
	if err != nil || job.Status != "succeeded" {
		code, action := "unknown", "unknown"
		if job.Error != nil {
			code, action = string(job.Error.Code), job.Error.RequiredAction
		}
		t.Fatalf("actual public favorite listing failed: status=%s code=%s action=%s", job.Status, code, action)
	}
	observed, err := s.GetTrackingSource(ctx, human, bound.Source.ID)
	if err != nil || len(observed.Items) != 100 || !observed.HasMore {
		t.Fatalf("actual public favorite capacity failed: observed=%d has_more=%t", len(observed.Items), observed.HasMore)
	}
	if countRows(t, db, "attention_materials") != 0 {
		t.Fatal("public favorite metadata sync imported unselected bodies")
	}
	t.Logf("source_kind=favorites actual observed metadata=%d has_more=%t", len(observed.Items), observed.HasMore)
}

func TestStartupResumesCurrentFailureButNotSupersededFailure(t *testing.T) {
	for _, superseded := range []bool{false, true} {
		t.Run(fmt.Sprint(superseded), func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
			defer cancel()
			_, db, objects := fixture(t)
			reader := publicListing()
			folders, err := reader.ListCollections(ctx, "bilibili", "3494358764489275")
			if err != nil {
				t.Fatal("read approved actual public final-page source")
			}
			var chosen *SourceCollection
			for i := range folders {
				if folders[i].ItemCount != nil && *folders[i].ItemCount > 0 {
					chosen = &folders[i]
					break
				}
			}
			if chosen == nil {
				t.Fatal("actual source prerequisite unavailable")
			}
			position := *chosen.ItemCount - 1
			cursor := strconv.Itoa(position/20 + 1)
			if position%20 != 0 {
				cursor += fmt.Sprintf(":%d", position%20)
			}
			s := NewAttentionService(sqlite.NewAttentionRepository(db), importers.NewReader(nil), objects, ServiceOptions{ListingReader: reader, JobTimeout: 3 * time.Minute})
			r, err := s.BindTrackingSource(ctx, human, BindTrackingSourceCommand{CommandMeta: meta("startup-bind", 1), Platform: "bilibili", SourceKind: "favorites", ExternalID: chosen.ExternalID, OwnerID: "3494358764489275", Locator: chosen.Locator})
			if err != nil {
				t.Fatal("bind approved public source")
			}
			if _, err = db.Conn().Exec("CREATE TRIGGER attention_test_startup_failure BEFORE INSERT ON attention_outbox WHEN NEW.type='attention.job_succeeded' BEGIN SELECT RAISE(ABORT, 'owned completion writes refused'); END"); err != nil {
				t.Fatal("restrict owned completion transaction")
			}
			queued, err := s.SyncTrackingSource(ctx, human, r.Source.ID, SyncTrackingSourceCommand{CommandMeta: meta("old-failed-sync", r.Source.Version), Cursor: cursor})
			if err != nil || len(queued.Jobs) != 1 {
				t.Fatal("queue actual source window")
			}
			if _, err = s.ProcessNextJob(ctx); err == nil {
				t.Fatal("actual completion restriction did not interrupt worker")
			}
			if _, err = db.Conn().Exec("DROP TRIGGER attention_test_startup_failure"); err != nil {
				t.Fatal("restore owned completion")
			}
			var dbPath string
			if err = db.Conn().QueryRow("SELECT file FROM pragma_database_list WHERE name='main'").Scan(&dbPath); err != nil {
				t.Fatal("locate owned database")
			}
			if err = db.Close(); err != nil {
				t.Fatal("close interrupted service database")
			}
			db, err = sqlite.Open(dbPath)
			if err != nil {
				t.Fatal("reopen interrupted service database")
			}
			t.Cleanup(func() { db.Close() })
			s = NewAttentionService(sqlite.NewAttentionRepository(db), importers.NewReader(nil), objects, ServiceOptions{ListingReader: reader, JobTimeout: 3 * time.Minute})
			if err = s.RecoverJobs(ctx); err != nil {
				t.Fatal("recover real interrupted job")
			}
			old, err := s.GetJob(ctx, human, queued.Jobs[0].JobID)
			if err != nil || old.Status != "failed" || old.Error == nil || !old.Error.Retryable || old.DeliveryUnknown {
				t.Fatal("actual safe interruption did not remain recoverable")
			}
			if superseded {
				r, err = s.GetTrackingSource(ctx, human, r.Source.ID)
				if err != nil {
					t.Fatal("reload actual recovered source")
				}
				newer, err := s.SyncTrackingSource(ctx, human, r.Source.ID, SyncTrackingSourceCommand{CommandMeta: meta("newer-sync", r.Source.Version), Cursor: cursor})
				if err != nil || len(newer.Jobs) != 1 {
					t.Fatal("queue human-selected newer source operation")
				}
				if _, err = s.ProcessNextJob(ctx); err != nil {
					t.Fatal("process actual newer source operation")
				}
				completed, err := s.GetJob(ctx, human, newer.Jobs[0].JobID)
				if err != nil || completed.Status != "succeeded" || !completed.CreatedAt.After(old.CreatedAt) {
					t.Fatal("actual newer operation did not complete after prior failure")
				}
			}
			before := countRows(t, db, "attention_jobs")
			if err = s.SyncSourcesOnce(ctx); err != nil {
				t.Fatal("run production startup sync")
			}
			expected := before
			if superseded {
				expected++
			}
			persisted, err := s.GetJob(ctx, human, old.JobID)
			if err != nil || countRows(t, db, "attention_jobs") != expected || persisted.Status != "failed" {
				t.Fatal("startup replayed obsolete failure or suppressed current sync")
			}
		})
	}
}

func TestBoundedPrefixDoesNotMarkUnobservedOlderCacheStale(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	reader := publicListing()
	folders, err := reader.ListCollections(ctx, "bilibili", "3494358764489275")
	if err != nil {
		t.Fatal("observe approved actual prefix source")
	}
	var chosen *SourceCollection
	for i := range folders {
		if folders[i].ItemCount != nil && *folders[i].ItemCount > 110 {
			chosen = &folders[i]
			break
		}
	}
	if chosen == nil {
		t.Fatal("actual public source cannot supply original 110-item cache prerequisite")
	}
	_, db, objects := fixture(t)
	s := NewAttentionService(sqlite.NewAttentionRepository(db), importers.NewReader(nil), objects, ServiceOptions{ListingReader: reader, JobTimeout: 3 * time.Minute})
	r, err := s.BindTrackingSource(ctx, human, BindTrackingSourceCommand{CommandMeta: meta("prefix-bind", 1), Platform: "bilibili", SourceKind: "favorites", ExternalID: chosen.ExternalID, OwnerID: "3494358764489275", Locator: chosen.Locator})
	if err != nil {
		t.Fatal("bind observed actual prefix source")
	}
	for i := 0; i < 3; i++ {
		cursor, limit := "", 100
		if i == 1 {
			if r.NextCursor == nil || *r.NextCursor == "" {
				t.Fatal("actual prefix omitted next cursor")
			}
			cursor, limit = *r.NextCursor, 10
		}
		queued, err := s.SyncTrackingSource(ctx, human, r.Source.ID, SyncTrackingSourceCommand{CommandMeta: meta(fmt.Sprintf("prefix-%d", i), r.Source.Version), Cursor: cursor, Limit: limit})
		if err != nil || len(queued.Jobs) != 1 {
			t.Fatal("queue actual bounded source window")
		}
		if _, err = s.ProcessNextJob(ctx); err != nil {
			t.Fatal("read actual bounded source window")
		}
		job, err := s.GetJob(ctx, human, queued.Jobs[0].JobID)
		if err != nil || job.Status != "succeeded" {
			t.Fatal("actual prefix source window did not succeed")
		}
		r, err = s.GetTrackingSource(ctx, human, r.Source.ID)
		if err != nil {
			t.Fatal("load actual prefix cache")
		}
	}
	if len(r.Items) != 110 || !r.HasMore {
		t.Fatal("bounded prefix lost original 110-item cache or window state")
	}
	for _, item := range r.Items {
		if item.Stale {
			t.Fatal("unobserved actual older cache item marked stale")
		}
	}
}
