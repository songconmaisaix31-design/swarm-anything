package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"runtime"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	workspaceapp "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

type cliOutput struct {
	stdout, stderr io.Writer
	identity       workspaceapp.OrcaEnvelope
	projectID      string
	action         string
	selected       workspaceapp.OrcaCommand
	pretty         bool
	attempted      bool
}

func (o *cliOutput) parsedRequest(command workspaceapp.OrcaCommand) {
	parsed, err := uuid.Parse(command.RequestID)
	if err == nil && parsed.String() == command.RequestID {
		o.identity.RequestID = command.RequestID
	}
}

func (o *cliOutput) validatedCommand(command workspaceapp.OrcaCommand) {
	o.action = command.Action
	o.selected = command
	o.identity.Controller = command.Controller
	o.identity.TaskID = command.TaskID
	o.identity.RunID = command.RunID
	o.identity.DispatchID = command.DispatchID
	o.identity.QuestionID = command.QuestionID
}

func (o *cliOutput) publish(value any) error {
	if o.attempted {
		return errors.New("CLI result publication was already attempted")
	}
	var data []byte
	var err error
	if o.pretty {
		data, err = json.MarshalIndent(value, "", "  ")
	} else {
		data, err = json.Marshal(value)
	}
	if err != nil {
		return err
	}
	// 写入尝试包含部分写入；失败后只发布诊断，不再写第二个结果。
	o.attempted = true
	data = append(data, '\n')
	written, err := o.stdout.Write(data)
	if err != nil {
		return err
	}
	if written != len(data) {
		return io.ErrShortWrite
	}
	return nil
}

func (o *cliOutput) recovery() {
	if o.identity.RequestID == "" {
		return
	}
	quote := func(value string) string {
		if runtime.GOOS == "windows" {
			return "'" + strings.ReplaceAll(value, "'", "''") + "'"
		}
		return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
	}
	if o.projectID != "" {
		_, _ = fmt.Fprintf(o.stderr, "查询原请求：swa request show --project %s --request-id %s --json\n", quote(o.projectID), quote(o.identity.RequestID))
	} else if o.identity.Controller != "" {
		_, _ = fmt.Fprintf(o.stderr, "查询原请求：swa request show --controller %s --request-id %s --json\n", quote(o.identity.Controller), quote(o.identity.RequestID))
	}
}

func (o *cliOutput) outputFailure(err error) int {
	_, _ = fmt.Fprintf(o.stderr, "CLI 输出失败：%v\n", err)
	var associations []string
	for _, field := range []struct{ name, value string }{
		{"request_id", o.identity.RequestID},
		{"runtime_id", o.identity.RuntimeID},
		{"authority_domain", o.identity.AuthorityDomain},
		{"controller", o.identity.Controller},
		{"run_id", o.identity.RunID},
		{"task_id", o.identity.TaskID},
		{"dispatch_id", o.identity.DispatchID},
		{"question_id", o.identity.QuestionID},
		{"requested_controller", o.selected.Controller},
		{"requested_task_id", o.selected.TaskID},
		{"requested_dispatch_id", o.selected.DispatchID},
		{"requested_question_id", o.selected.QuestionID},
	} {
		if field.value != "" {
			associations = append(associations, fmt.Sprintf("%s=%q", field.name, field.value))
		}
	}
	if len(associations) > 0 {
		_, _ = fmt.Fprintf(o.stderr, "已知关联：%s\n", strings.Join(associations, " "))
	}
	o.recovery()
	switch o.action {
	case "controller.open", "controller.close", "controller.recover", "task.create", "task.complete", "worker.start", "worker.send", "worker.stop", "worker.release", "question.answer", "question.resume", "run.submit", "serve":
		return 6
	default:
		return 7
	}
}

func (o *cliOutput) failure(code, message, action string, exit int) int {
	if o.attempted {
		_, _ = fmt.Fprintf(o.stderr, "%s: %s; required_action=%s\n", code, message, action)
		o.recovery()
		return exit
	}
	reply := o.identity
	reply.OK = false
	reply.Error = &workspaceapp.OrcaNativeError{Code: code, Message: message, RequiredAction: action}
	if err := o.publish(reply); err != nil {
		return o.outputFailure(err)
	}
	if exit == 6 || exit == 130 {
		o.recovery()
	}
	return exit
}

func decodeOneJSON(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return errors.New("HTTP response must contain exactly one JSON object")
	}
	return nil
}

func (o *cliOutput) response(data []byte, status int) (workspaceapp.OrcaEnvelope, error) {
	var reply workspaceapp.OrcaEnvelope
	if !utf8.Valid(data) || !json.Valid(data) {
		return reply, errors.New("HTTP response is not complete UTF-8 JSON")
	}
	var shape struct {
		OK            *bool `json:"ok"`
		SchemaVersion *int  `json:"schema_version"`
	}
	if err := json.Unmarshal(data, &shape); err != nil {
		return reply, err
	}
	switch {
	case shape.OK != nil && shape.SchemaVersion == nil:
		if err := decodeOneJSON(data, &reply); err != nil {
			return reply, err
		}
		if reply.OK && (reply.Error != nil || status != 200 || reply.RuntimeID == "" || reply.AuthorityDomain == "") || !reply.OK && reply.Error == nil {
			return reply, errors.New("The actual native result has inconsistent success or identity fields")
		}
		if reply.RequestID != "" && o.identity.RequestID != "" && reply.RequestID != o.identity.RequestID {
			return reply, errors.New("The native response has a different original request ID")
		}
		if o.identity.QuestionID != "" && reply.QuestionID != "" && reply.QuestionID != o.identity.QuestionID {
			return reply, errors.New("The native answer response changed its original question ID")
		}
	case shape.OK == nil && shape.SchemaVersion != nil && *shape.SchemaVersion == apierrors.SchemaVersion:
		var actual apierrors.ErrorEnvelope
		if err := decodeOneJSON(data, &actual); err != nil {
			return reply, err
		}
		if actual.Error == nil || actual.Error.Code == "" || actual.Error.RequiredAction == "" {
			return reply, errors.New("The actual HTTP error envelope is incomplete")
		}
		reply = o.identity
		reply.Error = &workspaceapp.OrcaNativeError{Code: string(actual.Error.Code), Message: actual.Error.Message, RequiredAction: actual.Error.RequiredAction, Data: json.RawMessage(data)}
	default:
		return reply, errors.New("The actual HTTP response has an unsupported envelope shape")
	}
	if reply.Error != nil && (reply.Error.Code == "" || reply.Error.RequiredAction == "") {
		return reply, errors.New("The actual native error is incomplete")
	}
	if reply.RequestID == "" {
		reply.RequestID = o.identity.RequestID
	}
	if reply.Controller == "" {
		reply.Controller = o.identity.Controller
	}
	if reply.TaskID == "" {
		reply.TaskID = o.identity.TaskID
	}
	if reply.RunID == "" {
		reply.RunID = o.identity.RunID
	}
	if reply.QuestionID == "" {
		reply.QuestionID = o.identity.QuestionID
	}
	if reply.DispatchID == "" {
		reply.DispatchID = o.identity.DispatchID
	}
	return reply, nil
}
