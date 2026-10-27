package app_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/workspace/domain"
)

func bindHandoffAdmissionRule(input *deliveryAdmissionInput) {
	// 标识只作为 Go 准入规则的输入；实际邮件和父子来源由原生链另行验收。
	handoff := &workspace.OrcaHandoffResume{Schema: "swa.handoff-resume.v1", SourceTaskID: "child-task", SourceDispatchID: "child-dispatch", ParentTaskID: "parent-task", ParentDispatchID: input.invocation.Command.DispatchID, MailID: "child-task/completed"}
	input.invocation.Handoff = handoff
	input.invocation.Command.InputFile = "native-handoff:" + handoff.MailID
	input.invocation.Input = &domain.ContextFile{Path: input.invocation.Command.InputFile, Version: handoff.MailID, Text: "公开接口的准入规则结果。"}
}

func TestOrcaHandoffCurrentApprovalSQLite(t *testing.T) {
	for _, state := range []string{"current-human", "current-agent", "wrong-creator-human", "revoked", "expired", "missing-send", "changed-context", "changed-revision"} {
		t.Run(state, func(t *testing.T) {
			creator := "delivery-current-human"
			if state == "wrong-creator-human" || state == "current-agent" || state == "revoked" || state == "expired" {
				creator = "original-agent"
			}
			input := newDeliveryAdmissionInput(t, creator)
			bindHandoffAdmissionRule(input)
			if state == "current-agent" || state == "revoked" || state == "expired" {
				grant := input.grant(t, creator)
				input.invocation.Caller.ID, input.invocation.Caller.Kind, input.invocation.Caller.GrantExpiresAt = creator, "agent", grant.ExpiresAt
				if state == "revoked" {
					if _, err := input.projects.RevokeProjectAgent(context.Background(), input.human, input.project.ID, creator); err != nil {
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
			case "changed-context":
				if err := os.WriteFile(filepath.Join(input.project.Root, "context.txt"), []byte("原公开上下文发生变更。"), 0o600); err != nil {
					t.Fatal(err)
				}
			case "changed-revision":
				input.invocation.Caller.SettingsRevision++
			}
			input.check(t, state == "current-human" || state == "current-agent")
		})
	}
}

func TestOrcaHandoffBindingRejectedSQLite(t *testing.T) {
	for _, boundary := range []string{"missing-binding", "schema", "source-task", "source-dispatch", "parent-task", "parent-dispatch", "mail", "command-path", "input-path", "input-version", "empty-result", "self-task", "self-dispatch", "root-task", "submission"} {
		t.Run(boundary, func(t *testing.T) {
			input := newDeliveryAdmissionInput(t, "delivery-current-human")
			bindHandoffAdmissionRule(input)
			handoff := input.invocation.Handoff
			switch boundary {
			case "missing-binding":
				input.invocation.Handoff = nil
			case "schema":
				handoff.Schema = "other"
			case "source-task":
				handoff.SourceTaskID = ""
			case "source-dispatch":
				handoff.SourceDispatchID = ""
			case "parent-task":
				handoff.ParentTaskID = ""
			case "parent-dispatch":
				handoff.ParentDispatchID = "other-parent"
			case "mail":
				handoff.MailID = "other-mail"
			case "command-path":
				input.invocation.Command.InputFile = "input.txt"
			case "input-path":
				input.invocation.Input.Path = "input.txt"
			case "input-version":
				input.invocation.Input.Version = "other-version"
			case "empty-result":
				input.invocation.Input.Text = ""
			case "self-task":
				handoff.ParentTaskID = handoff.SourceTaskID
			case "self-dispatch":
				handoff.SourceDispatchID = handoff.ParentDispatchID
			case "root-task":
				handoff.ParentTaskID = input.invocation.Scope.RootTaskID
			case "submission":
				input.invocation.Submission = &workspace.OrcaRunSubmission{}
			}
			input.check(t, false)
		})
	}
}
