package app_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

func bindQuestionAdmission(input *deliveryAdmissionInput, inline bool) {
	input.invocation.Command.Action = "question.answer"
	input.invocation.Command.RunID = input.invocation.Scope.RunID
	input.invocation.Command.TaskID = input.invocation.Scope.RootTaskID
	input.invocation.Command.QuestionID = "question-admission-rule-input"
	if inline {
		input.invocation.Command.InputFile = ""
		input.invocation.Command.Text = "  按原公开要求继续。\n保留正文与换行。 \n"
		input.invocation.Input = nil
	}
}

func TestOrcaQuestionAnswerCurrentApprovalSQLite(t *testing.T) {
	for _, state := range []string{"human-file", "human-inline", "agent-inline", "revoked", "expired", "missing-send", "changed-context", "changed-file", "wrong-external", "wrong-run", "wrong-root", "wrong-project", "wrong-creator-agent", "inline-file", "handoff", "submission", "oversized-file"} {
		t.Run(state, func(t *testing.T) {
			input := newDeliveryAdmissionInput(t, "original-agent")
			bindQuestionAdmission(input, state != "human-file" && state != "changed-file" && state != "oversized-file")
			if state == "agent-inline" || state == "revoked" || state == "expired" || state == "wrong-creator-agent" {
				id := "original-agent"
				if state == "wrong-creator-agent" {
					id = "another-agent"
				}
				grant := input.grant(t, id)
				input.invocation.Caller.ID, input.invocation.Caller.Kind, input.invocation.Caller.GrantExpiresAt = id, "agent", grant.ExpiresAt
				if state == "revoked" {
					if _, err := input.projects.RevokeProjectAgent(context.Background(), input.human, input.project.ID, id); err != nil {
						t.Fatal(err)
					}
				}
				if state == "expired" {
					past := time.Now().UTC().Add(-time.Minute)
					grant.ExpiresAt, input.invocation.Caller.GrantExpiresAt = &past, &past
					if err := input.db.SaveGrant(context.Background(), grant); err != nil {
						t.Fatal(err)
					}
				}
			}
			switch state {
			case "missing-send":
				settings := input.project.Settings
				settings.AllowedActions = []string{"observe", "read_context", "start"}
				saveAdmissionSettings(t, input.db, input.project, settings)
			case "changed-context", "changed-file", "oversized-file":
				path, text := "input.txt", "公开输入内容改变。"
				if state == "changed-context" {
					path = "context.txt"
				}
				if state == "oversized-file" {
					text = strings.Repeat("界", 10667)
				}
				if err := os.WriteFile(filepath.Join(input.project.Root, path), []byte(text), 0o600); err != nil {
					t.Fatal(err)
				}
			case "wrong-external":
				input.invocation.Selection.ExternalTarget = "another-agent"
			case "wrong-run":
				input.invocation.Command.RunID = "another-run"
			case "wrong-root":
				input.invocation.Command.TaskID = "another-root"
			case "wrong-project":
				input.invocation.Caller.ProjectID = uuid.NewString()
			case "inline-file":
				input.invocation.Input = &domain.ContextFile{Path: "input.txt", Version: "not-an-input-source", Text: input.invocation.Command.Text}
			case "handoff":
				input.invocation.Handoff = &workspace.OrcaHandoffResume{}
			case "submission":
				input.invocation.Submission = &workspace.OrcaRunSubmission{}
			}
			input.check(t, state == "human-file" || state == "human-inline" || state == "agent-inline")
		})
	}
}

func TestOrcaQuestionAnswerCommandBody(t *testing.T) {
	command := workspace.OrcaCommand{Action: "question.answer", Controller: "rule-controller", RunID: "rule-run", TaskID: "rule-root", DispatchID: "rule-dispatch", QuestionID: "rule-question", RequestID: uuid.NewString(), Text: "  回答\n \n"}
	for _, change := range []string{"valid", "multibyte-limit", "oversized", "blank", "invalid-utf8", "both", "neither", "missing-question", "missing-run", "missing-root", "missing-dispatch", "missing-request", "irrelevant-model"} {
		t.Run(change, func(t *testing.T) {
			c := command
			switch change {
			case "multibyte-limit":
				c.Text = strings.Repeat("界", 10666) + "ab"
			case "oversized":
				c.Text = strings.Repeat("界", 10667)
			case "blank":
				c.Text = " \t\n"
			case "invalid-utf8":
				c.Text = string([]byte{0xff})
			case "both":
				c.InputFile = "input.txt"
			case "neither":
				c.Text = ""
			case "missing-question":
				c.QuestionID = ""
			case "missing-run":
				c.RunID = ""
			case "missing-root":
				c.TaskID = ""
			case "missing-dispatch":
				c.DispatchID = ""
			case "missing-request":
				c.RequestID = ""
			case "irrelevant-model":
				c.Model = "another-model"
			}
			err := workspace.ValidateOrcaCommand(c)
			if (err == nil) != (change == "valid" || change == "multibyte-limit") {
				t.Fatalf("question command %s: %v", change, err)
			}
		})
	}
}

func TestOrcaQuestionAnswerWireSource(t *testing.T) {
	input := newDeliveryAdmissionInput(t, "original-agent")
	bindQuestionAdmission(input, true)
	input.check(t, true)
	body, err := json.Marshal(input.invocation.Command)
	if err != nil {
		t.Fatal(err)
	}
	var decoded workspace.OrcaCommand
	if err := json.Unmarshal(body, &decoded); err != nil || decoded.Text != input.invocation.Command.Text {
		t.Fatal("原回答正文没有通过 Go JSON 保持原文", err)
	}
	if path := os.Getenv("SWA_QUESTION_WIRE_OUTPUT"); path != "" {
		if err := os.WriteFile(path, body, 0o600); err != nil {
			t.Fatal(err)
		}
	}
}
