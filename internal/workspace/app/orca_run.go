package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"time"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

// 提交描述属于原生请求回执；不保存第二份 Run 状态。
type OrcaRunSubmission struct {
	Schema          string               `json:"schema"`
	Command         OrcaCommand          `json:"command"`
	Caller          OrcaExecutionCaller  `json:"caller"`
	SpecInput       domain.ContextFile   `json:"spec_input"`
	LeadInput       domain.ContextFile   `json:"lead_input"`
	Context         domain.ContextPacket `json:"context"`
	Selection       OrcaAgentSelection   `json:"selection"`
	TaskRequestID   string               `json:"task_request_id"`
	WorkerRequestID string               `json:"worker_request_id"`
}

// 固定输入同时核正文和路径；文件时间与大小不能代替内容身份。
func (s *OrcaRunSubmission) ValidateInput(file domain.ContextFile, specification bool) error {
	expected := s.LeadInput
	if specification {
		expected = s.SpecInput
	}
	if file != expected {
		return projectError(apierrors.ContextStale, "run submission input content, path or version changed")
	}
	return nil
}

func orcaRunRequestIDs(requestID string) (string, string) {
	namespace := uuid.MustParse(requestID)
	return uuid.NewSHA1(namespace, []byte("swa.run/task.create")).String(), uuid.NewSHA1(namespace, []byte("swa.run/worker.start")).String()
}

func orcaContextContent(packet domain.ContextPacket) domain.ContextPacket {
	packet.ID, packet.CreatedAt = "", time.Time{}
	return packet
}

func decodeOrcaTaskSpec(file domain.ContextFile) (OrcaTaskSpec, error) {
	var spec OrcaTaskSpec
	if !json.Valid([]byte(file.Text)) {
		return spec, projectError(apierrors.ValidationFailed, "task specification must contain exactly one JSON object")
	}
	decoder := json.NewDecoder(bytes.NewBufferString(file.Text))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&spec); err != nil {
		return spec, projectError(apierrors.ValidationFailed, "invalid task specification: "+err.Error())
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal([]byte(file.Text), &fields); err != nil {
		return spec, projectError(apierrors.ValidationFailed, "invalid task specification object")
	}
	if value, present := fields["initial_workers"]; present && bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
		return spec, projectError(apierrors.ValidationFailed, "initial_workers must be a positive integer when present")
	}
	return spec, validateOrcaTaskSpec(spec)
}

func applyOrcaRunRole(spec *OrcaTaskSpec, command OrcaCommand) error {
	if command.RoleID != "" {
		if spec.RoleID != "" && (spec.RoleID != command.RoleID || spec.RoleRevision != command.Revision) {
			return projectError(apierrors.ContextStale, "selected role differs from the fixed task specification")
		}
		spec.RoleID, spec.RoleRevision = command.RoleID, command.Revision
	}
	if command.ConversationID != "" {
		if spec.ConversationID != "" && spec.ConversationID != command.ConversationID {
			return projectError(apierrors.ContextStale, "selected conversation differs from the fixed task specification")
		}
		spec.ConversationID = command.ConversationID
	}
	return nil
}

func (s *OrcaExecutionService) submitOrcaRun(ctx context.Context, caller domain.Caller, command OrcaCommand) (OrcaEnvelope, error) {
	var reply OrcaEnvelope
	if err := ValidateOrcaCommand(command); err != nil {
		return reply, err
	}
	p, err := s.authorize(ctx, caller, command.ProjectID, "observe", nil, "")
	if err != nil {
		return reply, err
	}
	root, err := s.files.CanonicalRoot(command.Workdir)
	if err != nil {
		return reply, err
	}
	command.Workdir = root
	if _, err = s.authorize(ctx, caller, p.ID, "start", []string{root}, command.Agent); err != nil {
		return reply, err
	}
	specFile, err := s.readInput(ctx, p, command.SpecFile)
	if err != nil {
		return reply, err
	}
	spec, err := decodeOrcaTaskSpec(specFile)
	if err != nil {
		return reply, err
	}
	if err = applyOrcaRunRole(&spec, command); err != nil {
		return reply, err
	}
	command.RoleID, command.Revision, command.ConversationID = spec.RoleID, spec.RoleRevision, spec.ConversationID
	if command.Agent == "" && command.RoleID == "" {
		return reply, projectError(apierrors.ValidationFailed, "run submit requires an Agent and model or an assigned role")
	}
	input, err := s.readInput(ctx, p, command.InputFile)
	if err != nil {
		return reply, err
	}
	packet, err := s.contexts.ReadProjectContext(ctx, caller, p.ID, spec.Context)
	if err != nil {
		return reply, err
	}
	selection, err := s.runtime.ResolveSelection(ctx, p.ID, command)
	if err != nil {
		return reply, err
	}
	if selection.AgentID == "" || selection.Model == "" || selection.ExternalTarget != selection.AgentID || command.Agent != "" && (selection.AgentID != command.Agent || selection.Model != command.Model) || selection.Executable == "" || selection.Version == "" || selection.Provider == "" || selection.ConfigurationVersion == "" {
		return reply, projectError(apierrors.EvidenceMissing, "run submission requires the exact configured Agent and model")
	}
	if err = validateOrcaNativeLaunch(selection, p.ID); err != nil {
		return reply, err
	}
	if err = validateOrcaQuestionSelection(command, selection); err != nil {
		return reply, err
	}
	current, err := s.authorize(ctx, caller, p.ID, "start", []string{root}, selection.ExternalTarget)
	if err != nil {
		return reply, err
	}
	if current.Settings.Revision != p.Settings.Revision || packet.SettingsRevision != p.Settings.Revision {
		return reply, projectError(apierrors.ContextStale, "project settings changed during run submission preparation")
	}
	if selection.NativeLaunch.Tools.Mode == "collaboration" {
		if err := s.authorizeOrcaDelegation(ctx, caller, current, selection.ExternalTarget); err != nil {
			return reply, err
		}
	}
	taskRequest, workerRequest := orcaRunRequestIDs(command.RequestID)
	submission := &OrcaRunSubmission{
		Schema: "swa.run-submission.v1", Command: command,
		Caller:    OrcaExecutionCaller{ID: caller.ID, Kind: caller.Kind, ProjectID: p.ID, SettingsRevision: p.Settings.Revision},
		SpecInput: specFile, LeadInput: input, Context: orcaContextContent(packet), Selection: selection,
		TaskRequestID: taskRequest, WorkerRequestID: workerRequest,
	}
	stages := []OrcaCommand{
		{Action: "controller.open", ProjectID: p.ID, Workdir: root, RequestID: command.RequestID},
		{Action: "task.create", ProjectID: p.ID, SpecFile: command.SpecFile, RequestID: taskRequest},
		{Action: "worker.start", ProjectID: p.ID, Name: command.Name, Agent: command.Agent, Model: command.Model, QuestionMode: command.QuestionMode, DelegationMode: command.DelegationMode, InputFile: command.InputFile, RequestID: workerRequest, RoleID: command.RoleID, Revision: command.Revision},
	}
	identity := OrcaEnvelope{RequestID: command.RequestID}
	for i := range stages {
		stage := stages[i]
		if i > 0 {
			stage.Controller = identity.Controller
		}
		if i == 2 {
			stage.TaskID = identity.TaskID
		}
		observed, found, err := s.completedOrcaRunStage(ctx, caller, stage, submission)
		if err == nil && !found {
			observed, err = s.executeOrcaCommand(ctx, caller, stage, submission)
		}
		if observed.RuntimeID != "" {
			identity.RuntimeID, identity.AuthorityDomain = observed.RuntimeID, observed.AuthorityDomain
		}
		if observed.Controller != "" {
			identity.Controller = observed.Controller
		}
		if observed.RunID != "" {
			identity.RunID = observed.RunID
		}
		if i == 1 && observed.TaskID != "" {
			identity.TaskID = observed.TaskID
		}
		if observed.DispatchID != "" {
			identity.DispatchID = observed.DispatchID
		}
		identity.Result = map[string]any{"submission": map[string]any{"request_id": command.RequestID, "task_request_id": taskRequest, "worker_request_id": workerRequest, "stage": stage.Action}, "stage_result": observed.Result}
		if err != nil {
			var native *OrcaNativeError
			if !errors.As(err, &native) {
				native = &OrcaNativeError{Code: "operation_unknown", Message: err.Error(), RequiredAction: "inspect_original_run_stage"}
				var service *apierrors.ServiceError
				if errors.As(err, &service) {
					native.Code = string(service.Code)
				}
			}
			identity.Error = native
			return identity, native
		}
		if identity.Controller == "" || i > 0 && (identity.RunID == "" || identity.TaskID == "") || i == 2 && identity.DispatchID == "" {
			native := &OrcaNativeError{Code: "operation_unknown", Message: "completed run stage omitted its native identity", RequiredAction: "inspect_original_run_stage"}
			identity.Error = native
			return identity, native
		}
	}
	identity.OK = true
	return identity, nil
}

// 只复用已完成原回执；在途或结果未知时不重新投递。
func (s *OrcaExecutionService) completedOrcaRunStage(ctx context.Context, caller domain.Caller, stage OrcaCommand, submission *OrcaRunSubmission) (OrcaEnvelope, bool, error) {
	observed, err := s.executeOrcaCommand(ctx, caller, OrcaCommand{Action: "request.show", ProjectID: stage.ProjectID, RequestID: stage.RequestID}, nil)
	if err != nil {
		return observed, false, err
	}
	data, err := json.Marshal(observed.Result)
	if err != nil {
		return observed, false, err
	}
	var request struct {
		RequestID string          `json:"requestId"`
		State     string          `json:"state"`
		Method    string          `json:"method"`
		Receipt   json.RawMessage `json:"receipt"`
	}
	if err = json.Unmarshal(data, &request); err != nil || request.RequestID != stage.RequestID {
		return observed, false, projectError(apierrors.EvidenceMissing, "original run stage identity is unavailable")
	}
	if request.State == "absent" {
		return observed, false, nil
	}
	method := map[string]string{"controller.open": "swa.controllerOpen", "task.create": "swa.taskCreate", "worker.start": "swa.controllerDeliver"}[stage.Action]
	if request.Method != method {
		return observed, true, projectError(apierrors.ContextStale, "submission request ID is already used by another method")
	}
	if request.State != "completed" {
		return observed, true, &OrcaNativeError{Code: "operation_unknown", Message: "the original run stage remains unresolved", RequiredAction: "inspect_original_run_stage"}
	}
	var receipt struct {
		ProjectID  string             `json:"project_id"`
		Controller string             `json:"controller"`
		RunID      string             `json:"run_id"`
		RootTaskID string             `json:"root_task_id"`
		Submission *OrcaRunSubmission `json:"submission"`
		Invocation *OrcaInvocation    `json:"invocation"`
		Native     struct {
			DispatchID string `json:"dispatchId"`
			State      string `json:"state"`
		} `json:"native"`
	}
	if err = json.Unmarshal(request.Receipt, &receipt); err != nil {
		return observed, true, err
	}
	original := receipt.Submission
	if stage.Action != "controller.open" && receipt.Invocation != nil {
		original = receipt.Invocation.Submission
		if !reflect.DeepEqual(receipt.Invocation.Command, stage) {
			return observed, true, projectError(apierrors.ContextStale, "original run stage command differs")
		}
	}
	if receipt.ProjectID != stage.ProjectID || !reflect.DeepEqual(original, submission) || stage.Controller != "" && receipt.Controller != stage.Controller || stage.Action == "worker.start" && (receipt.RootTaskID != stage.TaskID || receipt.Native.State != "ready") {
		return observed, true, projectError(apierrors.ContextStale, "the original submission scope or approved input changed")
	}
	observed.RequestID, observed.Controller, observed.RunID, observed.TaskID, observed.DispatchID = stage.RequestID, receipt.Controller, receipt.RunID, receipt.RootTaskID, receipt.Native.DispatchID
	observed.Result = request.Receipt
	if stage.Action == "task.create" {
		link := OrcaExecutionLink{ProjectID: stage.ProjectID, GrantAgentID: caller.ID, SettingsRevision: submission.Caller.SettingsRevision, AuthorityDomain: observed.AuthorityDomain, RunID: receipt.RunID, RootTaskID: receipt.RootTaskID, CreatedAt: time.Now().UTC()}
		if err := s.links.SaveOrcaExecutionLink(ctx, link); err != nil {
			return observed, true, &OrcaNativeError{Code: "operation_unknown", Message: "native task exists; restoring its original project association failed: " + err.Error(), RequiredAction: "inspect_original_request_and_native_run"}
		}
	}
	return observed, true, nil
}
