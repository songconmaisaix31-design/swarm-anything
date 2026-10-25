package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

type relayService struct {
	store                RelayStore
	works                Works
	projects             LocalProjectRepository
	workspaces           RelayWorkspaces
	structured, terminal RelayDriver
	events               RelayEventSink
	options              RelayServiceOptions
	agentsMu             sync.RWMutex
}

var _ RelayRuntime = (*relayService)(nil)

func NewRelayService(store RelayStore, works Works, projects LocalProjectRepository, workspaces RelayWorkspaces, structured, terminal RelayDriver, events RelayEventSink, options RelayServiceOptions) RelayRuntime {
	if options.Clock == nil {
		options.Clock = time.Now
	}
	options.Agents = cloneRelayAgents(options.Agents)
	return &relayService{store: store, works: works, projects: projects, workspaces: workspaces, structured: structured, terminal: terminal, events: events, options: options}
}

func relayError(code apierrors.Code, message string) *apierrors.ServiceError {
	action := "review_relay_permissions_and_state"
	if code == apierrors.DeliveryUnknown {
		action = "reload_relay_without_replay"
	}
	return &apierrors.ServiceError{Code: code, Message: message, RequiredAction: action}
}

func relayOperation(c domain.Caller) error {
	if err := human(c); err != nil {
		return err
	}
	if _, err := uuid.Parse(c.OperationID); err != nil {
		return relayError(apierrors.ValidationFailed, "a UUID operation identity is required")
	}
	return nil
}

func (s *relayService) now() time.Time  { return s.options.Clock().UTC() }
func relayActor(c domain.Caller) string { return c.Kind + ":" + c.ID }

func (s *relayService) spec(name string) (domain.AgentSpec, error) {
	s.agentsMu.RLock()
	defer s.agentsMu.RUnlock()
	for _, v := range s.options.Agents {
		if v.Name == name && (v.DriveMode == "structured" || v.DriveMode == "terminal" || v.DriveMode == "both") {
			return cloneRelayAgents([]domain.AgentSpec{v})[0], nil
		}
	}
	return domain.AgentSpec{}, relayError(apierrors.UnsupportedCapability, "selected Agent has no valid relay registration")
}

func (s *relayService) ListAgents(ctx context.Context, c domain.Caller) ([]domain.AgentSpec, error) {
	if err := human(c); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	s.agentsMu.RLock()
	defer s.agentsMu.RUnlock()
	return cloneRelayAgents(s.options.Agents), nil
}

func (s *relayService) snapshot(ctx context.Context, c domain.Caller) (RelayState, error) {
	if err := human(c); err != nil {
		return RelayState{}, err
	}
	if s.store == nil {
		return RelayState{}, relayError(apierrors.UnsupportedCapability, "relay store is not connected")
	}
	return s.store.Snapshot(ctx)
}

func (s *relayService) view(st RelayState, id string) (domain.RelayTaskView, error) {
	t, ok := st.Tasks[id]
	if !ok {
		return domain.RelayTaskView{}, apierrors.NewNotFound("relay task", id)
	}
	v := domain.RelayTaskView{Task: t, Transitions: []domain.RelayTransition{}}
	if completion, ok := st.Completions[id]; ok {
		copied := cloneRelayCompletion(completion)
		v.Completion = &copied
	}
	v.EventPublication.Status = "none"
	for _, e := range st.Events {
		if e.TaskID == id {
			if st.Published[e.ID] {
				v.EventPublication.PublishedEvents++
			} else {
				v.EventPublication.PendingEvents++
			}
		}
	}
	if v.EventPublication.PublishedEvents > 0 {
		v.EventPublication.Status = "published"
	}
	if v.EventPublication.PendingEvents > 0 {
		v.EventPublication.Status = "pending"
	}
	if st.PublicationErrors[id] {
		v.EventPublication.Status = "error"
	}
	if terminal, ok := st.Terminals[t.TerminalID]; ok {
		terminal.Liveness = domain.RelayLiveness(terminal.LastEventAt, terminal.ExitedAt, s.now(), s.options.LivenessWindow)
		v.Terminal = &terminal
		if terminal.ExitedAt != nil && t.State != domain.RelayDone && t.State != domain.RelayReleased {
			v.Task.Condition = "terminal_exited"
		}
	}
	if workspace, ok := st.Workspaces[t.WorktreeID]; ok {
		v.Workspace = &workspace
	}
	for _, edge := range st.Transitions {
		if edge.TaskID == id {
			v.Transitions = append(v.Transitions, edge)
		}
	}
	return v, nil
}

func (s *relayService) GetTask(ctx context.Context, c domain.Caller, id string) (domain.RelayTaskView, error) {
	st, err := s.snapshot(ctx, c)
	if err != nil {
		return domain.RelayTaskView{}, err
	}
	return s.view(st, id)
}

func (s *relayService) ListTasks(ctx context.Context, c domain.Caller) ([]domain.RelayTaskView, error) {
	st, err := s.snapshot(ctx, c)
	if err != nil {
		return nil, err
	}
	items := []domain.RelayTaskView{}
	for id := range st.Tasks {
		v, e := s.view(st, id)
		if e != nil {
			return nil, e
		}
		items = append(items, v)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Task.CreatedAt.Equal(items[j].Task.CreatedAt) {
			return items[i].Task.ID < items[j].Task.ID
		}
		return items[i].Task.CreatedAt.After(items[j].Task.CreatedAt)
	})
	return items, nil
}

func (s *relayService) ListEvents(ctx context.Context, c domain.Caller, id string) ([]domain.RelayEvent, error) {
	st, err := s.snapshot(ctx, c)
	if err != nil {
		return nil, err
	}
	if id != "" {
		if _, err = s.view(st, id); err != nil {
			return nil, err
		}
	}
	items := []domain.RelayEvent{}
	for _, v := range st.Events {
		if id == "" || v.TaskID == id {
			items = append(items, v)
		}
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].TS.After(items[j].TS) })
	return items, nil
}

func (s *relayService) ListReceipts(ctx context.Context, c domain.Caller, id string) ([]domain.RelayReceipt, error) {
	st, err := s.snapshot(ctx, c)
	if err != nil {
		return nil, err
	}
	if id != "" {
		if _, err = s.view(st, id); err != nil {
			return nil, err
		}
	}
	items := []domain.RelayReceipt{}
	for _, v := range st.Receipts {
		if id == "" || v.TaskID == id {
			v.Input = nil
			items = append(items, v)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].ID < items[j].ID
		}
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	return items, nil
}

func (s *relayService) move(st *RelayState, task *domain.RelayTask, to, actor string) {
	st.Transitions = append(st.Transitions, domain.RelayTransition{TaskID: task.ID, From: task.State, To: to, TS: s.now(), Operator: actor})
	task.State = to
	task.UpdatedAt = s.now()
	st.Tasks[task.ID] = *task
}

func sameRelayRoot(a, b string) bool {
	a, b = filepath.Clean(a), filepath.Clean(b)
	if runtime.GOOS == "windows" {
		return strings.EqualFold(a, b)
	}
	return a == b
}

func (s *relayService) work(ctx context.Context, c domain.Caller, workID, projectID string) (domain.Work, domain.LocalProject, error) {
	if s.works == nil || s.projects == nil {
		return domain.Work{}, domain.LocalProject{}, relayError(apierrors.UnsupportedCapability, "relay work/project source is not connected")
	}
	p, err := s.projects.LoadProject(ctx, projectID)
	if err != nil {
		return domain.Work{}, p, err
	}
	album, err := s.works.ListWorks(ctx, c)
	if err != nil {
		return domain.Work{}, p, err
	}
	for _, w := range album.Works {
		if w.ID == workID {
			if !sameRelayRoot(w.Root, p.Root) {
				return w, p, relayError(apierrors.ScopeDenied, "work does not match the approved project root")
			}
			return w, p, nil
		}
	}
	return domain.Work{}, p, apierrors.NewNotFound("work", workID)
}

// The A/B/C labels summarize existing, independent scope switches. A confirm
// must acknowledge the current scope, not silently reduce C or directory B.
func RelayPermissionLevel(settings domain.ProjectSettings) string {
	if settings.ExpandReferences {
		return "C"
	}
	if settings.AllowDirectory {
		return "B"
	}
	return "A"
}

func (s *relayService) permission(ctx context.Context, c domain.Caller, t domain.RelayTask, action string) (domain.LocalProject, error) {
	p, err := s.projects.LoadProject(ctx, t.ProjectID)
	if err != nil {
		return p, err
	}
	if p.Settings.Revision != t.SettingsRevision || RelayPermissionLevel(p.Settings) != t.PermissionLevel {
		return p, relayError(apierrors.ApprovalRevoked, "project permission changed; review a new intent")
	}
	if !p.Settings.AllowsExternalModelCLI(t.Agent) || !has(p.Settings.AllowedActions, action) {
		return p, relayError(apierrors.ApprovalRequired, "project permission does not cover the Agent and action")
	}
	// Human controls keep the existing native human policy. Agent tokens cannot
	// invoke this human-only surface; grants are reloaded if the project already
	// has an explicit grant for the selected Agent.
	g, e := s.projects.LoadGrant(ctx, t.ProjectID, t.Agent)
	if e == nil {
		if g.RevokedAt != nil || (g.ExpiresAt != nil && !g.ExpiresAt.After(s.now())) {
			return p, relayError(apierrors.ApprovalRevoked, "selected Agent grant is revoked or expired")
		}
		if !has(g.Actions, action) {
			return p, relayError(apierrors.ScopeDenied, "selected Agent grant excludes the action")
		}
	} else {
		var known *apierrors.ServiceError
		if !errors.As(e, &known) || known.Code != apierrors.NotFound {
			return p, e
		}
	}
	return p, nil
}

// An exact action+operator+operation key is durable; final RED and unknown are
// replayed as evidence rather than run again. No process effect occurs here.
func (s *relayService) begin(ctx context.Context, c domain.Caller, id, action string, input any) (domain.RelayReceipt, bool, error) {
	var r domain.RelayReceipt
	if err := relayOperation(c); err != nil {
		return r, false, err
	}
	if s.store == nil {
		return r, false, relayError(apierrors.UnsupportedCapability, "relay store is not connected")
	}
	data, err := json.Marshal(struct {
		TaskID string
		Input  any
	}{id, input})
	if err != nil {
		return r, false, err
	}
	key := relayActor(c) + ":" + action + ":" + c.OperationID
	fresh := false
	err = s.store.Update(ctx, func(st *RelayState) error {
		if old, ok := st.Receipts[key]; ok {
			r = old
			if old.TaskID != id || !bytes.Equal(old.Input, data) {
				return relayError(apierrors.VersionConflict, "operation identity has a different target or input")
			}
			return nil
		}
		r = domain.RelayReceipt{ID: key, OperationID: c.OperationID, TaskID: id, Action: action, Operator: relayActor(c), Status: "pending", Input: data, CreatedAt: s.now()}
		st.Receipts[key] = r
		fresh = true
		return nil
	})
	return r, fresh, err
}

func receiptError(r domain.RelayReceipt) error {
	if r.Error != nil {
		return &apierrors.ServiceError{Code: apierrors.Code(r.Error.Code), Message: r.Error.Message, RequiredAction: r.Error.RequiredAction}
	}
	if r.Status == "accepted" {
		return nil
	}
	return relayError(apierrors.DeliveryUnknown, "action is pending or has unknown delivery; do not replay")
}

func (s *relayService) result(ctx context.Context, _ domain.Caller, r domain.RelayReceipt) (domain.RelayActionResult, error) {
	if r.TaskID == "" {
		r.Input = nil
		return domain.RelayActionResult{Receipt: r}, nil
	}
	st, err := s.store.Snapshot(ctx)
	if err != nil {
		return domain.RelayActionResult{}, err
	}
	v, err := s.view(st, r.TaskID)
	r.Input = nil
	return domain.RelayActionResult{View: v, Receipt: r}, err
}

func (s *relayService) finish(ctx context.Context, c domain.Caller, r domain.RelayReceipt, obs RelayObservation, effectErr error, knownUnstarted bool) (domain.RelayActionResult, error) {
	err := s.store.Update(context.WithoutCancel(ctx), func(st *RelayState) error {
		var err error
		r, err = s.finalize(st, r, obs, effectErr, knownUnstarted)
		return err
	})
	if err != nil {
		return domain.RelayActionResult{}, relayError(apierrors.DeliveryUnknown, "effect receipt could not be finalized; reload without replay")
	}
	_ = s.publish(context.WithoutCancel(ctx), r.TaskID)
	result, err := s.result(context.WithoutCancel(ctx), c, r)
	if err != nil {
		return result, err
	}
	return result, receiptError(r)
}

// finalize is data-only and shared by explicit actions and changed background
// observations. Callers supply the transaction; observation has no process effect.
func (s *relayService) finalize(st *RelayState, r domain.RelayReceipt, obs RelayObservation, effectErr error, knownUnstarted bool) (domain.RelayReceipt, error) {
	current, ok := st.Receipts[r.ID]
	if !ok || current.Status != "pending" {
		return r, relayError(apierrors.VersionConflict, "receipt already finalized")
	}
	r = current
	now := s.now()
	r.FinishedAt = &now
	r.Status = "accepted"
	if effectErr != nil {
		var archiveFailure *domain.RelayArchiveObservationFailure
		metadataOnlyFailure := errors.As(effectErr, &archiveFailure)
		var inputFailure *domain.RelayInputNotSubmitted
		inputNotSubmitted := errors.As(effectErr, &inputFailure)
		var known *apierrors.ServiceError
		if !errors.As(effectErr, &known) {
			known = relayError(apierrors.DeliveryUnknown, "action delivery could not be verified")
		}
		r.Status = "rejected"
		if metadataOnlyFailure && (r.Action == "dispatch" || r.Action == "send" || r.Action == "resume" || r.Action == "stop") {
			r.Status = "accepted"
			known = &apierrors.ServiceError{Code: apierrors.Code(archiveFailureCode(effectErr)), Message: "native operation accepted; archive metadata observation failed", RequiredAction: "inspect_archive_source_without_replaying_input"}
		} else if !inputNotSubmitted && (known.Code == apierrors.DeliveryUnknown || (!knownUnstarted && (r.Action == "dispatch" || r.Action == "prepare"))) {
			r.Status = "delivery_unknown"
			known = relayError(apierrors.DeliveryUnknown, "launch delivery is unknown; no second writer may be started")
		}
		r.Error = &domain.RelayReceiptError{Code: string(known.Code), Message: known.Message, RequiredAction: known.RequiredAction}
	}
	t, exists := st.Tasks[r.TaskID]
	if exists {
		// A delivered or uncertain write/resume can reopen the archive. Previous
		// attachment closure/append-only evidence cannot certify this operation;
		// only fresh positive metadata in obs may restore either current claim.
		if (r.Action == "send" || r.Action == "resume") && r.Status != "rejected" {
			if bound, ok := st.OwnedSessions[t.ID]; ok {
				bound.ArchiveFinalized, bound.ArchiveAppendOnly = "unknown", "unknown"
				if bound.NativeCapture != nil {
					capture := *bound.NativeCapture
					capture.Finalized = "unknown"
					bound.NativeCapture = &capture
				}
				st.OwnedSessions[t.ID] = bound
			}
		}
		if r.Status == "delivery_unknown" {
			t.Condition = "delivery_unknown"
			st.Tasks[t.ID] = t
		}
		if knownUnstarted && r.Status != "delivery_unknown" && (r.Action == "dispatch" || r.Action == "prepare") && st.PendingActions[t.ID] == r.ID && st.Sessions[t.TerminalID].Ownership != "owned" {
			w := st.Workspaces[t.WorktreeID]
			if w.ActiveTaskID == t.ID {
				w.ActiveTaskID = ""
				st.Workspaces[w.ID] = w
			}
		}
		if t.TerminalID != "" {
			if err := s.observe(st, &t, obs); err != nil {
				// 观察失败终止该动作；保留已交付后的占用和原控制器返回的准确会话。
				r.Status = "delivery_unknown"
				r.Error = &domain.RelayReceiptError{Code: string(apierrors.DeliveryUnknown), Message: "controller evidence was rejected; delivery must be inspected without replay", RequiredAction: "inspect_controller_without_replaying_input"}
				t.Condition = "delivery_unknown"
				st.Tasks[t.ID] = t
				previous := st.Sessions[t.TerminalID]
				if obs.Session.ID != "" && obs.Session.NativeID != "" && obs.Session.Ownership == "owned" && obs.Session.ProjectID == t.ProjectID && obs.Session.CLI == t.Agent && (previous.ID == "" || previous.ID == obs.Session.ID && previous.NativeID == obs.Session.NativeID) {
					st.Sessions[t.TerminalID] = relaySessionMetadata(obs.Session)
					s.observeOwnedSession(st, t, st.Terminals[t.TerminalID], RelayObservation{Session: obs.Session, ArchiveGap: "controller_evidence_rejected"})
				}
				reason := "controller_evidence_rejected"
				var failure *apierrors.ServiceError
				if errors.As(err, &failure) {
					reason = string(failure.Code)
				}
				st.RuntimeFacts = append(st.RuntimeFacts, domain.RelayRuntimeFact{ID: uuid.NewString(), TaskID: t.ID, TerminalID: t.TerminalID, WorktreeID: t.WorktreeID, ReceiptID: r.ID, OperationID: r.OperationID, Kind: "observation_rejected", Status: "unknown", Source: "relay_store", Reason: reason, TS: now})
			}
		}
	}
	st.Receipts[r.ID] = r
	reason := ""
	if r.Error != nil {
		reason = r.Error.Code
	}
	task := st.Tasks[r.TaskID]
	st.RuntimeFacts = append(st.RuntimeFacts, domain.RelayRuntimeFact{ID: uuid.NewString(), TaskID: r.TaskID, TerminalID: task.TerminalID, WorktreeID: task.WorktreeID, ReceiptID: r.ID, OperationID: r.OperationID, Kind: "action_result", Status: r.Status, Source: "relay_store", Reason: reason, TS: now})
	if st.PendingActions[r.TaskID] == r.ID {
		delete(st.PendingActions, r.TaskID)
	}
	return r, nil
}

func (s *relayService) CreateIntent(ctx context.Context, c domain.Caller, cmd RelayIntentCommand) (domain.RelayTaskView, error) {
	r, fresh, err := s.begin(ctx, c, "", "intent", cmd)
	if err != nil {
		return domain.RelayTaskView{}, err
	}
	if !fresh {
		v, e := s.GetTask(ctx, c, r.TaskID)
		if e != nil {
			return v, receiptError(r)
		}
		return v, receiptError(r)
	}
	var project domain.LocalProject
	validate := func() error {
		if strings.TrimSpace(cmd.Task) == "" || len(cmd.Task) > 64*1024 {
			return relayError(apierrors.ValidationFailed, "bounded nonempty task description required")
		}
		if _, e := s.spec(cmd.Agent); e != nil {
			return e
		}
		_, p, e := s.work(ctx, c, cmd.WorkID, cmd.ProjectID)
		project = p
		if e != nil {
			return e
		}
		return s.validateHandoff(ctx, c, p, cmd)
	}
	if e := validate(); e != nil {
		_, err = s.finish(ctx, c, r, RelayObservation{}, e, true)
		return domain.RelayTaskView{}, err
	}
	id := uuid.NewString()
	err = s.store.Update(ctx, func(st *RelayState) error {
		if cmd.HandoffFromTaskID != "" {
			if err := relayHandoffState(*st, project, cmd); err != nil {
				return err
			}
		}
		t := domain.RelayTask{ID: id, WorkID: cmd.WorkID, ProjectID: cmd.ProjectID, Agent: cmd.Agent, Description: cmd.Task, PermissionLevel: RelayPermissionLevel(project.Settings), SettingsRevision: project.Settings.Revision, CreatedAt: s.now()}
		s.move(st, &t, domain.RelayReady, relayActor(c))
		r.TaskID = id
		r.Status = "accepted"
		now := s.now()
		r.FinishedAt = &now
		st.Receipts[r.ID] = r
		if cmd.HandoffFromTaskID != "" {
			if st.HandoffDeclarations == nil {
				st.HandoffDeclarations = map[string]string{}
			}
			st.HandoffDeclarations[id] = cmd.HandoffFromTaskID
			st.RuntimeFacts = append(st.RuntimeFacts, domain.RelayRuntimeFact{ID: uuid.NewString(), TaskID: id, ReceiptID: r.ID, OperationID: r.OperationID, Kind: "handoff_declared", Status: "confirmed", Source: "human_intent", TS: now})
			st.SessionRelations = append(st.SessionRelations, domain.RelaySessionRelation{TaskID: id, PreviousTask: cmd.HandoffFromTaskID, WorktreeID: st.Tasks[cmd.HandoffFromTaskID].WorktreeID, OperationID: r.OperationID, Kind: "handoff", Status: "unknown", Source: "human_intent", TS: now})
		}
		return nil
	})
	if err != nil {
		return domain.RelayTaskView{}, relayError(apierrors.DeliveryUnknown, "intent receipt could not be persisted; reload without replay")
	}
	return s.GetTask(ctx, c, id)
}

func (s *relayService) ConfirmIntent(ctx context.Context, c domain.Caller, id string, cmd RelayConfirmCommand) (domain.RelayActionResult, error) {
	return s.confirmIntent(ctx, c, id, cmd, false)
}

func (s *relayService) PrepareIntent(ctx context.Context, c domain.Caller, id string, cmd RelayConfirmCommand) (domain.RelayActionResult, error) {
	return s.confirmIntent(ctx, c, id, cmd, true)
}

func (s *relayService) confirmIntent(ctx context.Context, c domain.Caller, id string, cmd RelayConfirmCommand, initialize bool) (domain.RelayActionResult, error) {
	action := "dispatch"
	if initialize {
		action = "prepare"
	}
	r, fresh, err := s.begin(ctx, c, id, action, cmd)
	if err != nil {
		return domain.RelayActionResult{}, err
	}
	if !fresh {
		result, e := s.result(ctx, c, r)
		if e != nil {
			return result, e
		}
		return result, receiptError(r)
	}
	reject := func(e error) (domain.RelayActionResult, error) {
		return s.finish(ctx, c, r, RelayObservation{}, e, true)
	}
	v, err := s.GetTask(ctx, c, id)
	if err != nil {
		return reject(err)
	}
	if !cmd.PermissionConfirmed {
		return reject(relayError(apierrors.ApprovalRequired, "permission confirmation is required before dispatch"))
	}
	if cmd.PermissionLevel == "" {
		cmd.PermissionLevel = "A"
	}
	w, p, err := s.work(ctx, c, v.Task.WorkID, v.Task.ProjectID)
	if err != nil {
		return reject(err)
	}
	if v.Task.SettingsRevision != p.Settings.Revision || v.Task.PermissionLevel != RelayPermissionLevel(p.Settings) {
		return reject(relayError(apierrors.ApprovalRevoked, "project permission changed; review a new intent"))
	}
	if cmd.ProjectSettingsRevision != p.Settings.Revision || cmd.PermissionLevel != RelayPermissionLevel(p.Settings) {
		return reject(relayError(apierrors.VersionConflict, "permission confirmation does not match current project settings"))
	}
	if _, err = s.permission(ctx, c, v.Task, "start"); err != nil {
		return reject(err)
	}
	if strings.TrimSpace(w.Handoff.Content) == "" {
		return reject(relayError(apierrors.EvidenceMissing, "complete handoff manual is required"))
	}
	if !initialize && v.Task.TerminalID != "" {
		state, err := s.store.Snapshot(ctx)
		if err != nil {
			return reject(err)
		}
		if state.Sessions[v.Task.TerminalID].Ownership == "owned" {
			return s.submitPreparedIntent(ctx, c, r, v.Task, w, p)
		}
	}
	if initialize {
		spec, err := s.spec(v.Task.Agent)
		if err != nil {
			return reject(err)
		}
		if _, ok := s.structured.(RelayDriverInitializer); !ok || spec.Name != "codex" || spec.DriveMode == "terminal" {
			return reject(relayError(apierrors.UnsupportedCapability, "selected path has no verified two-stage initializer"))
		}
	}
	if s.workspaces == nil {
		return reject(relayError(apierrors.UnsupportedCapability, "neutral workspace provider is not connected"))
	}
	workspaceID := ""
	err = s.store.Update(ctx, func(st *RelayState) error {
		t := st.Tasks[id]
		if st.PendingActions[id] != "" {
			return relayError(apierrors.VersionConflict, "another task action is pending")
		}
		if t.State != domain.RelayReady || t.Condition == "delivery_unknown" {
			return relayError(apierrors.VersionConflict, "task has already been dispatched or has unknown delivery")
		}
		if previous := st.HandoffDeclarations[id]; previous != "" {
			if err := relayHandoffState(*st, p, RelayIntentCommand{WorkID: t.WorkID, Agent: t.Agent, HandoffFromTaskID: previous}); err != nil {
				return err
			}
			workspaceID = st.Tasks[previous].WorktreeID
		}
		for _, existing := range st.Workspaces {
			if workspaceID != "" {
				break
			}
			if sameRelayRoot(existing.SourceRoot, p.Root) {
				workspaceID = existing.ID
				break
			}
		}
		if workspaceID == "" {
			workspaceID = uuid.NewString()
			st.Workspaces[workspaceID] = domain.RelayWorkspace{ID: workspaceID, ProjectID: p.ID, SourceRoot: p.Root, CreatedAt: s.now()}
		}
		workspace := st.Workspaces[workspaceID]
		if workspace.ActiveTaskID != "" {
			e := relayError(apierrors.VersionConflict, "neutral workspace already has an active task")
			e.RequiredAction = "view_existing_task:" + workspace.ActiveTaskID
			return e
		}
		workspace.ActiveTaskID = id
		st.Workspaces[workspaceID] = workspace
		t.WorktreeID = workspaceID
		st.Tasks[id] = t
		st.PendingActions[id] = r.ID
		s.claimFact(st, r)
		return nil
	})
	if err != nil {
		return reject(err)
	}
	st, err := s.store.Snapshot(ctx)
	if err != nil {
		return s.finish(ctx, c, r, RelayObservation{}, err, false)
	}
	workspace, err := s.workspaces.Prepare(ctx, w, st.Workspaces[workspaceID])
	if err != nil {
		return reject(err)
	}
	// Attach only after the neutral workspace exists. Reuse an exited terminal's
	// durable identity; a new native session remains a separate identity.
	spec, _ := s.spec(v.Task.Agent)
	err = s.store.Update(ctx, func(st *RelayState) error {
		t := st.Tasks[id]
		workspace.ActiveTaskID = id
		st.Workspaces[workspace.ID] = workspace
		terminalID := ""
		createdAt := s.now()
		for _, candidate := range st.Terminals {
			if candidate.WorktreeID == workspace.ID && candidate.Agent == t.Agent {
				terminalID = candidate.ID
				createdAt = candidate.CreatedAt
				break
			}
		}
		if terminalID == "" {
			terminalID = uuid.NewString()
		}
		st.Terminals[terminalID] = domain.RelayTerminal{ID: terminalID, WorktreeID: workspace.ID, Agent: t.Agent, DriveMode: spec.DriveMode, Liveness: domain.RelayUnverifiable, CreatedAt: createdAt}
		// A released task permits reusing the terminal identity, not its native
		// conversation. Resume of an unfinished task never takes this path.
		delete(st.Sessions, terminalID)
		t.TerminalID = terminalID
		st.Tasks[id] = t
		s.attachOwnedSession(st, t, workspace, st.Terminals[terminalID])
		return nil
	})
	if err != nil {
		return s.finish(ctx, c, r, RelayObservation{}, err, false)
	}
	launch, err := s.launch(ctx, c, id, "start")
	if err != nil {
		return reject(err)
	}
	launch.Input = "HANDOFF_MANUAL:\n" + w.Handoff.Content + "\n\nTASK:\n" + v.Task.Description
	if initialize {
		launch.Input = ""
	}
	launch.OperationID = r.OperationID
	if s.options.LaunchContext != nil {
		if _, err = s.permission(ctx, c, v.Task, "read_context"); err != nil {
			return reject(err)
		}
		launch.Packet, err = s.options.LaunchContext.ReadRelayLaunchContext(ctx, c, launch)
		if err != nil {
			return reject(err)
		}
		if launch.Packet.ID == "" || launch.Packet.ProjectID != p.ID || launch.Packet.SettingsRevision != p.Settings.Revision {
			return reject(relayError(apierrors.ScopeDenied, "launch context differs from the confirmed project revision"))
		}
		if _, err = s.permission(ctx, c, v.Task, "start"); err != nil {
			return reject(err)
		}
	}
	driver := s.structured
	mode := "structured"
	if spec.DriveMode == "terminal" {
		driver = s.terminal
		mode = "terminal"
	}
	var obs RelayObservation
	var launchErr error
	if driver == nil {
		launchErr = &domain.NativePrelaunchFailure{Cause: relayError(apierrors.UnsupportedCapability, "selected drive path is not connected")}
	} else if initialize {
		obs, launchErr = driver.(RelayDriverInitializer).Initialize(ctx, launch)
	} else {
		obs, launchErr = driver.Launch(ctx, launch)
	}
	var prelaunch *domain.NativePrelaunchFailure
	degraded := false
	if !initialize && launchErr != nil && mode == "structured" && errors.As(launchErr, &prelaunch) {
		var known *apierrors.ServiceError
		if errors.As(prelaunch.Cause, &known) && known.Code == apierrors.UnsupportedCapability && s.terminal != nil {
			degraded = true
			mode = "terminal"
			obs, launchErr = s.terminal.Launch(ctx, launch)
		}
	}
	prelaunch = nil
	knownUnstarted := launchErr != nil && errors.As(launchErr, &prelaunch)
	// Drive choice and accepted edge persist before observation edges.
	err = s.store.Update(context.WithoutCancel(ctx), func(st *RelayState) error {
		t := st.Tasks[id]
		t.DegradedLaunch = degraded
		terminal := st.Terminals[t.TerminalID]
		terminal.DriveMode = mode
		st.Terminals[terminal.ID] = terminal
		if !initialize && relayNativeEffectAccepted(launchErr) {
			s.move(st, &t, domain.RelayAccepted, relayActor(c))
		}
		// A proven unstarted process is not an observed process exit. Its durable
		// terminal identity remains unverifiable rather than fabricated exited.
		return nil
	})
	if err != nil {
		return domain.RelayActionResult{}, relayError(apierrors.DeliveryUnknown, "launch state could not be persisted; do not replay")
	}
	return s.finish(ctx, c, r, obs, launchErr, knownUnstarted)
}

func (s *relayService) launch(ctx context.Context, c domain.Caller, id, action string) (RelayLaunch, error) {
	st, err := s.store.Snapshot(ctx)
	if err != nil {
		return RelayLaunch{}, err
	}
	t, ok := st.Tasks[id]
	if !ok {
		return RelayLaunch{}, apierrors.NewNotFound("relay task", id)
	}
	p, err := s.permission(ctx, c, t, action)
	if err != nil {
		return RelayLaunch{}, err
	}
	spec, err := s.spec(t.Agent)
	if err != nil {
		return RelayLaunch{}, err
	}
	w, ok := st.Workspaces[t.WorktreeID]
	if !ok || !w.Prepared || w.ActiveTaskID != t.ID {
		return RelayLaunch{}, relayError(apierrors.VersionConflict, "task does not own a prepared neutral workspace")
	}
	if !sameRelayRoot(w.SourceRoot, p.Root) {
		return RelayLaunch{}, relayError(apierrors.ScopeDenied, "project root changed from the confirmed workspace source")
	}
	terminal, ok := st.Terminals[t.TerminalID]
	if !ok {
		return RelayLaunch{}, relayError(apierrors.EvidenceMissing, "task terminal identity is absent")
	}
	return RelayLaunch{Spec: spec, Project: p, Workspace: w, Terminal: terminal, Session: st.Sessions[terminal.ID], ControllerID: st.ControllerEvidence[t.ID].ControllerID}, nil
}

func (s *relayService) observe(st *RelayState, t *domain.RelayTask, obs RelayObservation) error {
	if err := s.observeRuntimeFacts(st, *t, obs); err != nil {
		return err
	}
	terminal := st.Terminals[t.TerminalID]
	if obs.Session.ID != "" {
		st.Sessions[terminal.ID] = relaySessionMetadata(obs.Session)
	}
	if obs.NativeCapture != nil {
		previous := st.OwnedSessions[t.ID].NativeCapture
		var sequence int64
		if previous != nil {
			sequence = previous.LastSequence
		}
		for _, event := range obs.NativeCapture.Events {
			if event.Sequence > sequence && !event.TS.IsZero() && !event.TS.After(s.now()) {
				when := event.TS.UTC()
				if terminal.LastEventAt == nil || when.After(*terminal.LastEventAt) {
					terminal.LastEventAt = &when
				}
			}
		}
	}
	for _, event := range obs.Events {
		if event.Sequence <= terminal.LastSequence || event.TS.IsZero() || event.TS.After(s.now()) {
			continue
		}
		terminal.LastSequence = event.Sequence
		when := event.TS.UTC()
		if terminal.LastEventAt == nil || when.After(*terminal.LastEventAt) {
			terminal.LastEventAt = &when
		}
		event.ID = uuid.NewString()
		event.TaskID = t.ID
		event.TerminalID = terminal.ID
		event.WorktreeID = t.WorktreeID
		event.Agent = t.Agent
		event.Topic = "relay:" + t.ID
		event.Scope = t.ProjectID
		st.Events = append(st.Events, event)
		if t.State == domain.RelayAccepted {
			s.move(st, t, domain.RelayWorking, "observation:"+event.Source)
		}
	}
	if obs.ExitConfirmed {
		if terminal.ExitedAt == nil {
			now := s.now()
			terminal.ExitedAt = &now
		}
		if t.State != domain.RelayDone && t.State != domain.RelayReleased {
			t.Condition = "terminal_exited"
			st.Tasks[t.ID] = *t
		}
	}
	terminal.Liveness = domain.RelayLiveness(terminal.LastEventAt, terminal.ExitedAt, s.now(), s.options.LivenessWindow)
	st.Terminals[terminal.ID] = terminal
	s.observeOwnedSession(st, *t, terminal, obs)
	return nil
}

func (s *relayService) publish(ctx context.Context, id string) error {
	if s.events == nil {
		return nil
	}
	st, err := s.store.Snapshot(ctx)
	if err != nil {
		return err
	}
	if st.PublicationErrors[id] {
		return relayError(apierrors.DeliveryUnknown, "event publication is pending explicit reconciliation")
	}
	for _, event := range st.Events {
		if event.TaskID != id || st.Published[event.ID] {
			continue
		}
		if err = s.events.EmitRelayEvent(ctx, event); err != nil {
			_ = s.store.Update(context.WithoutCancel(ctx), func(current *RelayState) error { current.PublicationErrors[id] = true; return nil })
			return relayError(apierrors.DeliveryUnknown, "derived event publication could not be verified")
		}
		if err = s.store.Update(ctx, func(current *RelayState) error { current.Published[event.ID] = true; return nil }); err != nil {
			return err
		}
	}
	return nil
}

func (s *relayService) action(ctx context.Context, c domain.Caller, id, action string, input any) (domain.RelayActionResult, error) {
	r, fresh, err := s.begin(ctx, c, id, action, input)
	if err != nil {
		return domain.RelayActionResult{}, err
	}
	if !fresh {
		result, e := s.result(ctx, c, r)
		if e != nil {
			return result, e
		}
		return result, receiptError(r)
	}
	reject := func(e error) (domain.RelayActionResult, error) {
		return s.finish(ctx, c, r, RelayObservation{}, e, true)
	}
	permissionAction := action
	if action == "read" {
		permissionAction = "observe"
	}
	launch, err := s.launch(ctx, c, id, permissionAction)
	if err != nil {
		return reject(err)
	}
	view, err := s.GetTask(ctx, c, id)
	if err != nil {
		return reject(err)
	}
	if view.Task.State == domain.RelayReleased {
		return reject(relayError(apierrors.VersionConflict, "released task cannot control the terminal"))
	}
	if action == "read" && launch.Terminal.DriveMode != "terminal" && (view.Task.Condition == "delivery_unknown" || view.Terminal.ExitedAt != nil) {
		return reject(relayError(apierrors.VersionConflict, "native read requires a current process without an unresolved delivery or confirmed exit"))
	}
	if action == "send" && (view.Task.Condition == "delivery_unknown" || view.Terminal.ExitedAt != nil || view.Task.State == domain.RelayDone) {
		return reject(relayError(apierrors.VersionConflict, "task cannot accept another input"))
	}
	if action == "send" && view.Task.State == domain.RelayReady {
		return reject(relayError(apierrors.VersionConflict, "initialized task requires explicit dispatch confirmation before input"))
	}
	if action == "resume" && (view.Terminal.ExitedAt == nil || view.Task.State == domain.RelayDone) {
		return reject(relayError(apierrors.DeliveryUnknown, "resume requires a confirmed exit of the original task"))
	}
	// Serialize conflicting actions durably without holding SQL across process IO.
	err = s.store.Update(ctx, func(st *RelayState) error {
		if st.PendingActions[id] != "" {
			return relayError(apierrors.VersionConflict, "another task action is pending")
		}
		current := st.Tasks[id]
		terminal := st.Terminals[current.TerminalID]
		session := st.Sessions[current.TerminalID]
		if current.TerminalID != launch.Terminal.ID || current.WorktreeID != launch.Workspace.ID || st.Workspaces[current.WorktreeID].ActiveTaskID != id || current.State == domain.RelayReleased || st.ControllerEvidence[id].ControllerID != launch.ControllerID || session.ID != launch.Session.ID || session.NativeID != launch.Session.NativeID {
			return relayError(apierrors.VersionConflict, "task controller or reservation changed before execution")
		}
		if action == "send" && (current.Condition == "delivery_unknown" || terminal.ExitedAt != nil || current.State == domain.RelayDone || current.State == domain.RelayReady) {
			return relayError(apierrors.VersionConflict, "task cannot accept another input")
		}
		if action == "read" && terminal.DriveMode != "terminal" && (current.Condition == "delivery_unknown" || terminal.ExitedAt != nil) {
			return relayError(apierrors.VersionConflict, "native read requires a current process without unresolved delivery or confirmed exit")
		}
		if action == "resume" && (terminal.ExitedAt == nil || current.State == domain.RelayDone) {
			return relayError(apierrors.DeliveryUnknown, "resume requires confirmed original exit")
		}
		st.PendingActions[id] = r.ID
		s.claimFact(st, r)
		return nil
	})
	if err != nil {
		return reject(err)
	}
	driver := s.structured
	if launch.Terminal.DriveMode == "terminal" {
		driver = s.terminal
	}
	if driver == nil {
		return reject(relayError(apierrors.UnsupportedCapability, "task drive path is not connected"))
	}
	var obs RelayObservation
	launch.OperationID = r.OperationID
	switch action {
	case "send":
		cmd := input.(RelaySendCommand)
		if strings.TrimSpace(cmd.Input) == "" || len(cmd.Input) > 64*1024 {
			return reject(relayError(apierrors.ValidationFailed, "bounded nonempty input required"))
		}
		obs, err = driver.Send(ctx, launch, cmd.Input)
	case "read":
		obs, err = driver.Read(ctx, launch)
		if err == nil && launch.Terminal.DriveMode == "terminal" && s.workspaces != nil {
			err = s.observeGit(ctx, id, launch)
		}
	case "stop":
		obs, err = driver.Stop(ctx, launch)
	case "resume":
		obs, err = driver.Resume(ctx, launch)
	}
	if action == "resume" && relayNativeEffectAccepted(err) {
		if e := s.store.Update(context.WithoutCancel(ctx), func(st *RelayState) error {
			t := st.Tasks[id]
			t.Condition = ""
			st.Tasks[id] = t
			terminal := st.Terminals[t.TerminalID]
			terminal.ExitedAt = nil
			terminal.LastEventAt = nil
			terminal.LastSequence = 0
			st.Terminals[terminal.ID] = terminal
			if bound, ok := st.OwnedSessions[id]; ok {
				bound.ExitedAt = nil
				st.OwnedSessions[id] = bound
			}
			return nil
		}); e != nil {
			return domain.RelayActionResult{}, relayError(apierrors.DeliveryUnknown, "resume state is uncertain; do not replay")
		}
	}
	return s.finish(ctx, c, r, obs, err, false)
}

func (s *relayService) Send(ctx context.Context, c domain.Caller, id string, cmd RelaySendCommand) (domain.RelayActionResult, error) {
	return s.action(ctx, c, id, "send", cmd)
}
func (s *relayService) Read(ctx context.Context, c domain.Caller, id string) (domain.RelayActionResult, error) {
	return s.action(ctx, c, id, "read", nil)
}
func (s *relayService) Stop(ctx context.Context, c domain.Caller, id string) (domain.RelayActionResult, error) {
	return s.action(ctx, c, id, "stop", nil)
}
func (s *relayService) Resume(ctx context.Context, c domain.Caller, id string) (domain.RelayActionResult, error) {
	return s.action(ctx, c, id, "resume", nil)
}

func (s *relayService) Transition(ctx context.Context, c domain.Caller, id string, cmd RelayTransitionCommand) (domain.RelayTaskView, error) {
	// begin 在写入收据前检查 human 身份；人工完成和释放检查已有 observe 许可。
	r, fresh, err := s.begin(ctx, c, id, "transition", cmd)
	if err != nil {
		return domain.RelayTaskView{}, err
	}
	if !fresh {
		v, e := s.GetTask(ctx, c, id)
		if e != nil {
			return v, e
		}
		return v, receiptError(r)
	}
	view, e := s.GetTask(ctx, c, id)
	if e == nil {
		_, e = s.permission(ctx, c, view.Task, "observe")
	}
	if e != nil {
		_, finishErr := s.finish(ctx, c, r, RelayObservation{}, e, true)
		return domain.RelayTaskView{}, finishErr
	}
	completion, verification, e := s.prepareCompletion(ctx, c, view.Task, cmd, r)
	if e != nil {
		_, finishErr := s.finish(ctx, c, r, RelayObservation{}, e, true)
		return domain.RelayTaskView{}, finishErr
	}
	if _, e = s.permission(ctx, c, view.Task, "observe"); e != nil {
		_, finishErr := s.finish(ctx, c, r, RelayObservation{}, e, true)
		return domain.RelayTaskView{}, finishErr
	}
	err = s.store.Update(ctx, func(st *RelayState) error {
		t, ok := st.Tasks[id]
		if !ok {
			return apierrors.NewNotFound("relay task", id)
		}
		if st.PendingActions[id] != "" {
			return relayError(apierrors.VersionConflict, "another task action is pending")
		}
		if t.State != cmd.From || !domain.ValidRelayTransition(cmd.From, cmd.To) {
			return relayError(apierrors.VersionConflict, "invalid or stale task transition")
		}
		if cmd.To != domain.RelayDone && cmd.To != domain.RelayReleased {
			return relayError(apierrors.ScopeDenied, "accepted and working are execution observations")
		}
		workspace, ownsWorkspace := st.Workspaces[t.WorktreeID]
		terminal, ownsTerminal := st.Terminals[t.TerminalID]
		if !ownsWorkspace || !workspace.Prepared || workspace.ActiveTaskID != t.ID || workspace.ProjectID != t.ProjectID || !ownsTerminal || terminal.WorktreeID != workspace.ID || terminal.Agent != t.Agent {
			return relayError(apierrors.VersionConflict, "task does not own its prepared workspace and terminal")
		}
		if cmd.To == domain.RelayDone && !cmd.CompletionConfirmed {
			return relayError(apierrors.ApprovalRequired, "human task completion confirmation is required")
		}
		if cmd.To == domain.RelayDone {
			if _, exists := st.Completions[id]; exists {
				return relayError(apierrors.VersionConflict, "task completion is already recorded")
			}
			if verification != nil {
				if err := s.checkGoalVerification(*st, t, *verification); err != nil {
					return err
				}
			}
		}
		if cmd.To == domain.RelayReleased {
			if terminal.ExitedAt == nil {
				return relayError(apierrors.DeliveryUnknown, "release requires confirmed process exit")
			}
			for _, other := range st.Receipts {
				if other.ID != r.ID && other.TaskID == id && other.Status == "pending" {
					return relayError(apierrors.VersionConflict, "task action is pending")
				}
			}
			if workspace.ActiveTaskID == id {
				workspace.ActiveTaskID = ""
				st.Workspaces[workspace.ID] = workspace
			}
		}
		s.claimFact(st, r)
		if cmd.To == domain.RelayDone {
			if st.Completions == nil {
				st.Completions = map[string]domain.RelayCompletion{}
			}
			completion.TS = s.now()
			st.Completions[id] = completion
			st.RuntimeFacts = append(st.RuntimeFacts, domain.RelayRuntimeFact{ID: completion.ID, TaskID: id, TerminalID: t.TerminalID, WorktreeID: t.WorktreeID, ReceiptID: r.ID, OperationID: r.OperationID, Kind: "human_target_confirmed", Status: "confirmed", Source: "human_transition", Reason: completion.Channel, TS: completion.TS})
		}
		if cmd.To == domain.RelayReleased {
			st.RuntimeFacts = append(st.RuntimeFacts, domain.RelayRuntimeFact{ID: uuid.NewString(), TaskID: id, TerminalID: t.TerminalID, WorktreeID: t.WorktreeID, ReceiptID: r.ID, OperationID: r.OperationID, Kind: "resources_released", Status: "confirmed", Source: "human_transition", TS: s.now()})
		}
		s.move(st, &t, cmd.To, relayActor(c))
		return nil
	})
	_, finishErr := s.finish(ctx, c, r, RelayObservation{}, err, true)
	if finishErr != nil {
		return domain.RelayTaskView{}, finishErr
	}
	return s.GetTask(ctx, c, id)
}
