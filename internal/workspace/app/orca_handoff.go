package app

import (
	"strings"
	"unicode/utf8"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
)

// 仅宿主内部准入使用；原生消费者负责从同 Run 的真实邮件和终态任务核对来源。
type OrcaHandoffResume struct {
	Schema           string `json:"schema"`
	SourceTaskID     string `json:"source_task_id"`
	SourceDispatchID string `json:"source_dispatch_id"`
	ParentTaskID     string `json:"parent_task_id"`
	ParentDispatchID string `json:"parent_dispatch_id"`
	MailID           string `json:"mail_id"`
}

func validateOrcaHandoffResume(invocation OrcaInvocation) error {
	handoff, input, command := invocation.Handoff, invocation.Input, invocation.Command
	if handoff == nil || handoff.Schema != "swa.handoff-resume.v1" || command.Action != "worker.send" || input == nil || invocation.Submission != nil {
		return projectError(apierrors.ScopeDenied, "the original handoff delivery binding is incomplete")
	}
	for _, id := range []string{handoff.SourceTaskID, handoff.SourceDispatchID, handoff.ParentTaskID, handoff.ParentDispatchID, handoff.MailID} {
		if strings.TrimSpace(id) == "" || len(id) > 512 || !utf8.ValidString(id) {
			return projectError(apierrors.ScopeDenied, "the original handoff identity is invalid")
		}
	}
	marker := "native-handoff:" + handoff.MailID
	if handoff.SourceTaskID == handoff.ParentTaskID || handoff.SourceDispatchID == handoff.ParentDispatchID || handoff.SourceTaskID == invocation.Scope.RootTaskID || handoff.ParentTaskID == invocation.Scope.RootTaskID || handoff.MailID != handoff.SourceTaskID+"/completed" || command.DispatchID != handoff.ParentDispatchID || command.InputFile != marker || input.Path != marker || input.Version != handoff.MailID {
		return projectError(apierrors.ScopeDenied, "the original handoff and parent input identities differ")
	}
	if strings.TrimSpace(input.Text) == "" || !utf8.ValidString(input.Text) || len(input.Text) > 1024*1024 {
		return projectError(apierrors.ValidationFailed, "the original handoff result is empty, invalid or exceeds its input bound")
	}
	return nil
}
