package app_test

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/admissionbridge"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/importers"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/sqlite"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	. "github.com/songconmaisaix31-design/Astrocyte/internal/attention/app"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	workdomain "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

func realReadyOpportunity(t *testing.T) (*Service, *sqlite.DB, *observedObjects, MaterialDetail, OpportunityDetail) {
	t.Helper()
	s, db, objects, _, material := automaticPublicSource(t)
	return readyOpportunity(t, s, db, objects, material)
}

func readyOpportunity(t *testing.T, s *Service, db *sqlite.DB, objects *observedObjects, material MaterialDetail) (*Service, *sqlite.DB, *observedObjects, MaterialDetail, OpportunityDetail) {
	t.Helper()
	ctx := context.Background()
	// 显式人工记录作为待审候选前置，不提供模型输出或已完成判断。
	topic, err := s.RecordDistillation(ctx, human, RecordDistillationCommand{CommandMeta: meta("admission-human-question", 1), InputRefs: sourceRefs(material), Stage: "topic", ProcessingConfig: "manual", OutputText: "人工记录：后续验证仍需核查原文和附加证据。", PendingQuestions: []string{"选定资料的证据覆盖哪些范围，仍有哪些未核实内容？"}})
	if err != nil || topic.Distillation.Provenance.Mode != "manual" || topic.Distillation.Status != "succeeded" {
		t.Fatal("persist explicit human question against actual fixed source")
	}
	beforePublications := objects.publishes.Load()
	beforeEvents := countRows(t, db, "attention_outbox")
	ready, err := s.CreateOpportunity(ctx, human, OpportunityCommand{CommandMeta: meta("admission-ready-candidate", 1), Title: material.Material.Title, EvidenceRefs: sourceRefs(material), DistillationIDs: []string{topic.Distillation.ID}, Purpose: "审阅选定资料的固定来源和公开证据，保留未核实问题。", NextStep: "人工检查资料版本、引用关系和待补证据。"})
	if err != nil || ready.Opportunity.State != "ready_for_review" || ready.Opportunity.Revision != 1 || ready.Opportunity.Version != 1 || len(ready.Revisions) != 1 {
		t.Fatal("actual fixed source did not create a review-ready candidate")
	}
	if len(ready.Opportunity.EvidenceRefs) != 1 || ready.Opportunity.EvidenceRefs[0] != sourceRefs(material)[0] || len(ready.Opportunity.GoalRefs) != 0 || ready.Opportunity.Dimensions.GoalProgress.Value != nil || ready.Opportunity.CompositeScore != nil {
		t.Fatal("ready candidate replaced fixed evidence or invented a goal or score")
	}
	if objects.publishes.Load() != beforePublications || countRows(t, db, "attention_outbox") != beforeEvents+1 {
		t.Fatal("creating a ready candidate produced unrelated work")
	}
	var created, admitted int
	if err = db.Conn().QueryRow("SELECT COUNT(*) FROM attention_outbox WHERE type='attention.opportunity_created' AND aggregate_id=?", ready.Opportunity.ID).Scan(&created); err != nil || created != 1 {
		t.Fatal("actual candidate creation event missing or duplicated")
	}
	if err = db.Conn().QueryRow("SELECT COUNT(*) FROM attention_outbox WHERE type='attention.opportunity_admitted'").Scan(&admitted); err != nil || admitted != 0 || countRows(t, db, "local_agent_sessions") != 0 {
		t.Fatal("ready candidate started admission or a native session")
	}
	return s, db, objects, material, ready
}

func readyOpportunityFromPublicGit(t *testing.T) (*Service, *sqlite.DB, *observedObjects, MaterialDetail, OpportunityDetail) {
	t.Helper()
	_, db, objects := fixture(t)
	var databaseFile string
	if err := db.Conn().QueryRow("SELECT file FROM pragma_database_list WHERE name='main'").Scan(&databaseFile); err != nil {
		t.Fatal("resolve actual fixed Git evidence directory")
	}
	root, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal("resolve approved public worktree")
	}
	readGit := func(args ...string) []byte {
		command := exec.Command("git", append([]string{"-C", root}, args...)...)
		file, err := os.OpenFile(filepath.Join(filepath.Dir(databaseFile), "git-error.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
		if err != nil {
			t.Fatal("retain original fixed Git error locally")
		}
		defer file.Close()
		command.Stderr = file
		data, err := command.Output()
		if err != nil {
			t.Fatal("read actual approved public Git source; original error retained locally")
		}
		return data
	}
	const publicRepository = "https://github.com/songconmaisaix31-design/swarm-anything"
	origin := strings.TrimSpace(string(readGit("remote", "get-url", "origin")))
	if origin != publicRepository && origin != publicRepository+".git" {
		t.Fatal("actual Git source is outside approved public repository")
	}
	head := strings.TrimSpace(string(readGit("rev-parse", "HEAD")))
	body := readGit("show", head+":README.md")
	if len(body) == 0 {
		t.Fatal("actual fixed public README is empty")
	}
	file := filepath.Join(filepath.Dir(databaseFile), "fixed-public-readme.txt")
	if err = os.WriteFile(file, body, 0600); err != nil {
		t.Fatal("retain original fixed public README locally")
	}
	s := NewAttentionService(sqlite.NewAttentionRepository(db), importers.NewReader([]string{filepath.Dir(file)}), objects, ServiceOptions{})
	queued, err := s.ImportMaterial(context.Background(), human, ImportMaterialCommand{CommandMeta: meta("admission-fixed-public-git", 1), Adapter: "manual", Kind: "text", Title: "swarm-anything README.md", SourceLocator: publicRepository + "/blob/" + head + "/README.md", LocalFileRef: file, SourceSpans: []string{"README.md at Git commit " + head}})
	if err != nil {
		t.Fatal("queue explicit manual import of actual fixed public README")
	}
	if _, err = s.ProcessNextJob(context.Background()); err != nil {
		t.Fatal("process actual fixed public README")
	}
	job, err := s.GetJob(context.Background(), human, queued.JobID)
	if err != nil || job.Status != "succeeded" || job.MaterialID == nil {
		t.Fatal("actual fixed public README import failed")
	}
	material, err := s.GetMaterial(context.Background(), human, *job.MaterialID)
	if err != nil || len(material.Revisions) != 1 || material.Revisions[0].Provenance.Mode != "manual" {
		t.Fatal("actual fixed public README lost explicit manual provenance")
	}
	t.Logf("admission input fixed public Git commit=%s; original file=%s", head, file)
	return readyOpportunity(t, s, db, objects, material)
}

func TestActualFixedPaperReadyCandidateDoesNotAdmitOrExecute(t *testing.T) {
	s, db, _, material, ready := realReadyOpportunity(t)
	loaded, err := s.GetOpportunity(context.Background(), human, ready.Opportunity.ID)
	if err != nil || loaded.Opportunity.Revision != ready.Opportunity.Revision || loaded.Opportunity.State != "ready_for_review" || loaded.Revisions[0].EvidenceRefs[0] != sourceRefs(material)[0] || countRows(t, db, "attention_opportunities") != 1 {
		t.Fatal("actual review-ready candidate or immutable evidence was not persisted")
	}
}

func assertNoAdmissionExecution(t *testing.T, db *sqlite.DB) {
	t.Helper()
	for _, table := range []string{"local_agent_sessions", "workspace_approvals", "workspace_context_packets", "workspace_session_bindings", "swarm_missions", "swarm_work_items", "swarm_leases", "swarm_artifacts"} {
		if countRows(t, db, table) != 0 {
			t.Fatalf("admission produced protected execution rows in %s", table)
		}
	}
}

func admissionConsumerReceipts(t *testing.T, db *sqlite.DB) int {
	t.Helper()
	var count int
	if err := db.Conn().QueryRow("SELECT COUNT(*) FROM foundation_idempotency WHERE caller='workspace.admission_consumer' AND command_type='workspace.opportunity_admitted'").Scan(&count); err != nil {
		t.Fatal("count actual admission consumer receipts")
	}
	return count
}

// 持久化回执按完整 JSON 契约比较，保留全部字段和时间精度。
func sameAdmissionJSON(t *testing.T, first, second any) bool {
	t.Helper()
	left, err := json.Marshal(first)
	if err != nil {
		t.Fatal("encode original admission contract")
	}
	right, err := json.Marshal(second)
	if err != nil {
		t.Fatal("encode persisted admission contract")
	}
	return bytes.Equal(left, right)
}

func assertAdmissionEvent(t *testing.T, db *sqlite.DB, eventID, eventType, admissionID string, version int) {
	t.Helper()
	var kind, aggregate, data string
	var actualVersion int
	if err := db.Conn().QueryRow("SELECT type,aggregate_id,aggregate_version,payload FROM attention_outbox WHERE id=?", eventID).Scan(&kind, &aggregate, &actualVersion, &data); err != nil {
		t.Fatal("locate original admission event in actual outbox")
	}
	var payload struct {
		AdmissionID string `json:"admission_id"`
	}
	if err := json.Unmarshal([]byte(data), &payload); err != nil || kind != eventType || aggregate != admissionID || actualVersion != version || payload.AdmissionID != admissionID {
		t.Fatal("original admission event changed its identity, version or payload")
	}
}

func reopenAdmissionServices(t *testing.T, db *sqlite.DB, objects *observedObjects) (*Service, *sqlite.DB, *workspace.S2Service, *AdmissionService) {
	t.Helper()
	var file string
	if err := db.Conn().QueryRow("SELECT file FROM pragma_database_list WHERE name='main'").Scan(&file); err != nil {
		t.Fatal("resolve actual admission database for reopen")
	}
	if err := db.Close(); err != nil {
		t.Fatal("close actual admission database")
	}
	reopened, err := sqlite.Open(file)
	if err != nil {
		t.Fatal("reopen actual admission database")
	}
	t.Cleanup(func() {
		if err := reopened.Close(); err != nil {
			t.Error("close reopened admission database")
		}
	})
	core := NewAttentionService(sqlite.NewAttentionRepository(reopened), importers.NewReader(nil), objects, ServiceOptions{})
	proposals := workspace.NewS2Service(sqlite.NewWorkspaceRepository(reopened), nil, nil)
	admissions, err := admissionbridge.Connect(core, sqlite.NewAdmissionRepository(reopened), proposals, AdmissionOptions{})
	if err != nil {
		t.Fatal("connect reopened actual same-database admission services")
	}
	return core, reopened, proposals, admissions
}

func TestActualAdmissionServiceAndDraftLifecycle(t *testing.T) {
	core, db, objects, material, ready := realReadyOpportunity(t)
	assertActualAdmissionLifecycle(t, core, db, objects, material, ready)
}

func TestActualPublicGitAdmissionServiceAndDraftLifecycle(t *testing.T) {
	core, db, objects, material, ready := readyOpportunityFromPublicGit(t)
	assertActualAdmissionLifecycle(t, core, db, objects, material, ready)
}

func assertActualAdmissionLifecycle(t *testing.T, core *Service, db *sqlite.DB, objects *observedObjects, material MaterialDetail, ready OpportunityDetail) {
	t.Helper()
	ctx := context.Background()
	proposals := workspace.NewS2Service(sqlite.NewWorkspaceRepository(db), nil, nil)
	admissions, err := admissionbridge.Connect(core, sqlite.NewAdmissionRepository(db), proposals, AdmissionOptions{})
	if err != nil {
		t.Fatal("connect actual same-database admission and draft services")
	}
	command := AdmissionCommand{CommandMeta: meta("real-admit", ready.Opportunity.Version), ExpectedRevision: ready.Opportunity.Revision}
	assertUnchanged := func(t *testing.T, receipts, events int) {
		t.Helper()
		if countRows(t, db, "attention_admissions") != 0 || countRows(t, db, "workspace_proposals") != 0 || admissionConsumerReceipts(t, db) != 0 || countRows(t, db, "attention_receipts") != receipts || countRows(t, db, "attention_outbox") != events {
			t.Fatal("rejected admission retained partial state, receipt, event or draft")
		}
		assertNoAdmissionExecution(t, db)
	}
	t.Run("ungranted_callers", func(t *testing.T) {
		receipts, events := countRows(t, db, "attention_receipts"), countRows(t, db, "attention_outbox")
		_, err := admissions.AdmitOpportunity(ctx, agent, ready.Opportunity.ID, command)
		errorCode(t, err, apierrors.ScopeDenied)
		_, err = admissions.AdmitOpportunityWithJudgment(ctx, "ungranted-workflow", "unrecorded-decision", ready.Opportunity.ID, command)
		errorCode(t, err, apierrors.ApprovalRequired)
		assertUnchanged(t, receipts, events)
	})
	t.Run("incubating_candidate", func(t *testing.T) {
		incubating, err := core.CreateOpportunity(ctx, human, OpportunityCommand{CommandMeta: meta("real-incubating", 1), Title: "人工待完善候选", EvidenceRefs: sourceRefs(material), Purpose: "人工审阅", NextStep: "补充明确关联或待查问题"})
		if err != nil || incubating.Opportunity.State != "incubating" {
			t.Fatal("persist actual incomplete candidate")
		}
		receipts, events := countRows(t, db, "attention_receipts"), countRows(t, db, "attention_outbox")
		_, err = admissions.AdmitOpportunity(ctx, human, incubating.Opportunity.ID, AdmissionCommand{CommandMeta: meta("real-not-ready", incubating.Opportunity.Version), ExpectedRevision: incubating.Opportunity.Revision})
		errorCode(t, err, apierrors.EvidenceMissing)
		assertUnchanged(t, receipts, events)
	})
	if t.Failed() {
		return
	}
	oldRevision := ready.Opportunity.Revision
	ready, err = core.ReviseOpportunity(ctx, human, ready.Opportunity.ID, OpportunityCommand{CommandMeta: meta("real-revised-candidate", ready.Opportunity.Version), Title: ready.Opportunity.Title, EvidenceRefs: ready.Opportunity.EvidenceRefs, DistillationIDs: ready.Opportunity.DistillationIDs, Purpose: ready.Opportunity.Purpose, NextStep: "人工重新检查固定资料及待补充证据"})
	if err != nil || ready.Opportunity.State != "ready_for_review" || ready.Opportunity.Revision != oldRevision+1 {
		t.Fatal("persist actual revised ready candidate")
	}
	t.Run("old_candidate_revision", func(t *testing.T) {
		receipts, events := countRows(t, db, "attention_receipts"), countRows(t, db, "attention_outbox")
		_, err := admissions.AdmitOpportunity(ctx, human, ready.Opportunity.ID, AdmissionCommand{CommandMeta: meta("real-old-revision", ready.Opportunity.Version), ExpectedRevision: oldRevision})
		errorCode(t, err, apierrors.VersionConflict)
		assertUnchanged(t, receipts, events)
	})
	command.CommandMeta, command.ExpectedRevision = meta("real-admit", ready.Opportunity.Version), ready.Opportunity.Revision
	t.Run("outbox_rollback", func(t *testing.T) {
		receipts, events := countRows(t, db, "attention_receipts"), countRows(t, db, "attention_outbox")
		restore := refuseOutbox(t, db)
		failed := command
		failed.CommandMeta = meta("real-outbox-failure", ready.Opportunity.Version)
		_, err := admissions.AdmitOpportunity(ctx, human, ready.Opportunity.ID, failed)
		restore()
		if err == nil {
			t.Fatal("actual SQLite outbox failure was accepted")
		}
		assertUnchanged(t, receipts, events)
		current, err := core.GetOpportunity(ctx, human, ready.Opportunity.ID)
		if err != nil || current.Opportunity.Version != ready.Opportunity.Version || current.Opportunity.State != "ready_for_review" {
			t.Fatal("failed admission changed ready candidate")
		}
	})
	if t.Failed() {
		return
	}
	beforePublications := objects.publishes.Load()
	receipts, events := countRows(t, db, "attention_receipts"), countRows(t, db, "attention_outbox")
	admitted, err := admissions.AdmitOpportunity(ctx, human, ready.Opportunity.ID, command)
	if err != nil {
		var ownedDatabase string
		if pathErr := db.Conn().QueryRow("SELECT file FROM pragma_database_list WHERE name='main'").Scan(&ownedDatabase); pathErr != nil {
			t.Fatal("resolve owned admission failure evidence directory")
		}
		raw, encodeErr := json.Marshal(struct {
			Error string `json:"error"`
		}{Error: err.Error()})
		if encodeErr != nil {
			t.Fatal("encode original admission failure")
		}
		file := filepath.Join(filepath.Dir(ownedDatabase), "admission-consumer-error.json")
		if writeErr := os.WriteFile(file, raw, 0600); writeErr != nil {
			t.Fatal("retain original admission failure in owned evidence directory")
		}
		t.Logf("original admission failure evidence=%s", file)
		assertUnchanged(t, receipts, events)
		t.Fatal("actual human admission failed before persisted draft; original dependency failure retained")
	}
	if admitted.Admission.Status != "active" || admitted.Admission.Version != 1 || admitted.Admission.OwnerNamespace != "human:"+human.ID || string(admitted.Admission.Authority) != "human" || admitted.Admission.PolicyVersion != "" || admitted.Admission.Model != "" || admitted.Draft == nil || admitted.Draft.ID == "" || admitted.Draft.Version != 1 {
		t.Fatal("actual human admission or persisted draft identity missing")
	}
	if admitted.Admission.OpportunityRevision != ready.Opportunity.Revision || len(admitted.Admission.Inputs) != 1 || admitted.Admission.Inputs[0].Kind != "material" || admitted.Admission.Inputs[0].ID != material.Material.ID || admitted.Admission.Inputs[0].Revision != 1 {
		t.Fatal("admission changed fixed candidate or source revision")
	}
	var data string
	if err = db.Conn().QueryRow("SELECT data FROM workspace_proposals WHERE id=?", admitted.Draft.ID).Scan(&data); err != nil {
		t.Fatal("read actual persisted proposal")
	}
	var proposal workdomain.Proposal
	if err = json.Unmarshal([]byte(data), &proposal); err != nil || proposal.Status != workdomain.ProposalDraft || proposal.AssignmentStatus != "unassigned" || proposal.Content.Goal.ID != "" || proposal.GrantID != "" || proposal.OwnerNamespace != admitted.Admission.OwnerNamespace || proposal.AdmissionID != admitted.Admission.ID || len(proposal.Content.Inputs) != 1 || proposal.Content.Inputs[0].MaterialID != material.Material.ID || proposal.Content.Inputs[0].Revision != 1 {
		t.Fatal("admission draft invented goal, assignment, grant or source")
	}
	if countRows(t, db, "attention_admissions") != 1 || countRows(t, db, "workspace_proposals") != 1 || admissionConsumerReceipts(t, db) != 1 || countRows(t, db, "attention_receipts") != receipts+1 || countRows(t, db, "attention_outbox") != events+1 {
		t.Fatal("admission and outbox were not committed exactly once")
	}
	assertAdmissionEvent(t, db, admitted.Admission.AdmittedEventID, "attention.opportunity_admitted", admitted.Admission.ID, 1)
	snapshot, err := admissions.ReadAdmittedOpportunitySnapshot(ctx, admitted.Admission.AdmittedEventID)
	if err != nil || !snapshot.Active || snapshot.AdmissionID != admitted.Admission.ID || snapshot.EventID != admitted.Admission.AdmittedEventID || len(snapshot.GoalRefs) != 0 || !reflect.DeepEqual(snapshot.Inputs, sourceRefs(material)) {
		t.Fatal("actual admission event did not resolve its fixed source")
	}
	replay, err := admissions.AdmitOpportunity(ctx, human, ready.Opportunity.ID, command)
	if err != nil || !sameAdmissionJSON(t, replay, admitted) {
		t.Fatal("same admission receipt changed or repeated work")
	}
	replayedDraft, err := proposals.ConsumeOpportunityAdmission(ctx, admitted.Admission.AdmittedEventID)
	if err != nil || replayedDraft.ID != admitted.Draft.ID || countRows(t, db, "workspace_proposals") != 1 || countRows(t, db, "attention_outbox") != events+1 {
		t.Fatal("duplicate actual event created another draft or event")
	}
	assertNoAdmissionExecution(t, db)
	core, db, proposals, admissions = reopenAdmissionServices(t, db, objects)
	reopenedAdmission, err := admissions.GetAdmission(ctx, human, admitted.Admission.ID)
	if err != nil || !sameAdmissionJSON(t, reopenedAdmission.Admission, admitted.Admission) {
		t.Fatal("reopen changed persisted active admission")
	}
	reopenedReplay, err := admissions.AdmitOpportunity(ctx, human, ready.Opportunity.ID, command)
	if err != nil || !sameAdmissionJSON(t, reopenedReplay, admitted) {
		t.Fatal("reopen changed original admission receipt")
	}
	reopenedDraft, err := proposals.ConsumeOpportunityAdmission(ctx, admitted.Admission.AdmittedEventID)
	if err != nil || !sameAdmissionJSON(t, reopenedDraft, replayedDraft) || admissionConsumerReceipts(t, db) != 1 || countRows(t, db, "attention_receipts") != receipts+1 || countRows(t, db, "attention_outbox") != events+1 {
		t.Fatal("reopen changed fixed draft or repeated admission consumption")
	}
	assertAdmissionEvent(t, db, admitted.Admission.AdmittedEventID, "attention.opportunity_admitted", admitted.Admission.ID, 1)
	other := Principal{Kind: "human", ID: "other-owner"}
	_, err = admissions.GetAdmission(ctx, other, admitted.Admission.ID)
	errorCode(t, err, apierrors.ScopeDenied)
	_, err = admissions.RevokeAdmission(ctx, other, admitted.Admission.ID, RevokeAdmissionCommand{CommandMeta: meta("other-owner-revoke", 1), Reason: "不属于当前所有者的操作参数"})
	errorCode(t, err, apierrors.ScopeDenied)
	changed := command
	changed.ExpectedRevision = oldRevision
	_, err = admissions.AdmitOpportunity(ctx, human, ready.Opportunity.ID, changed)
	errorCode(t, err, apierrors.VersionConflict)
	revoke := RevokeAdmissionCommand{CommandMeta: meta("real-revoke", admitted.Admission.Version), Reason: "人工撤销资料准入，保持执行批准独立"}
	revoked, err := admissions.RevokeAdmission(ctx, human, admitted.Admission.ID, revoke)
	if err != nil || revoked.Admission.Status != "revoked" || revoked.Admission.Version != 2 || revoked.Admission.AdmittedEventID != admitted.Admission.AdmittedEventID || revoked.Admission.RevokedEventID == "" {
		t.Fatal("actual revocation changed original admission identity")
	}
	repeatedRevoke, err := admissions.RevokeAdmission(ctx, human, admitted.Admission.ID, revoke)
	if err != nil || !sameAdmissionJSON(t, repeatedRevoke, revoked) || countRows(t, db, "attention_outbox") != events+2 {
		t.Fatal("revocation replay changed result or repeated event")
	}
	assertAdmissionEvent(t, db, revoked.Admission.RevokedEventID, "attention.admission_revoked", admitted.Admission.ID, 2)
	core, db, proposals, admissions = reopenAdmissionServices(t, db, objects)
	reopenedRevoked, err := admissions.GetAdmission(ctx, human, admitted.Admission.ID)
	if err != nil || !sameAdmissionJSON(t, reopenedRevoked.Admission, revoked.Admission) {
		t.Fatal("reopen changed persisted revocation")
	}
	reopenedRevokeReplay, err := admissions.RevokeAdmission(ctx, human, admitted.Admission.ID, revoke)
	if err != nil || !sameAdmissionJSON(t, reopenedRevokeReplay, revoked) || countRows(t, db, "attention_receipts") != receipts+2 || admissionConsumerReceipts(t, db) != 1 || countRows(t, db, "attention_outbox") != events+2 {
		t.Fatal("reopen repeated revocation or changed original receipt")
	}
	assertAdmissionEvent(t, db, admitted.Admission.AdmittedEventID, "attention.opportunity_admitted", admitted.Admission.ID, 1)
	assertAdmissionEvent(t, db, revoked.Admission.RevokedEventID, "attention.admission_revoked", admitted.Admission.ID, 2)
	inactive, err := admissions.ReadAdmittedOpportunitySnapshot(ctx, admitted.Admission.AdmittedEventID)
	if err != nil || inactive.Active || inactive.AdmissionVersion != 2 || !reflect.DeepEqual(inactive.Inputs, snapshot.Inputs) {
		t.Fatal("revocation lost fixed source or stayed active")
	}
	_, err = proposals.ConsumeOpportunityAdmission(ctx, admitted.Admission.AdmittedEventID)
	errorCode(t, err, apierrors.EvidenceMissing)
	currentMaterial, err := core.GetMaterial(ctx, human, material.Material.ID)
	if err != nil {
		t.Fatal("load current source lifecycle")
	}
	_, err = core.UpdateMaterial(ctx, human, material.Material.ID, UpdateMaterialCommand{CommandMeta: meta("real-withdraw-source", currentMaterial.Material.Version), Lifecycle: "withdrawn"})
	if err != nil {
		t.Fatal("withdraw actual fixed source")
	}
	_, err = admissions.ReadAdmittedOpportunitySnapshot(ctx, admitted.Admission.AdmittedEventID)
	errorCode(t, err, apierrors.ScopeDenied)
	_, err = admissions.AdmitOpportunity(ctx, human, ready.Opportunity.ID, command)
	errorCode(t, err, apierrors.ScopeDenied)
	if objects.publishes.Load() != beforePublications || countRows(t, db, "attention_admissions") != 1 || countRows(t, db, "workspace_proposals") != 1 {
		t.Fatal("admission or source revocation produced unrelated work")
	}
	assertNoAdmissionExecution(t, db)
}
