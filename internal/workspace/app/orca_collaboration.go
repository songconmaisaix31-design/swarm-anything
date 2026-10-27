package app

import (
	"strings"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
)

func validateOrcaCollaborationCommand(c OrcaCommand) error {
	invalid := func(message string) error { return projectError(apierrors.ValidationFailed, message) }
	if c.Action == "role.show" || c.Action == "role.update" || c.Action == "role.archive" {
		if strings.TrimSpace(c.RoleID) == "" {
			return invalid("role_id is required")
		}
	}
	if c.Action == "role.update" || c.Action == "role.archive" {
		if c.Revision < 1 || c.Revision > 9007199254740991 {
			return invalid("an exact positive role revision is required")
		}
	}
	if c.Action == "role.create" || c.Action == "role.update" {
		role := c.Role
		if role == nil || strings.TrimSpace(role.Name) == "" || strings.TrimSpace(role.Responsibilities) == "" || strings.TrimSpace(role.DefaultAgent) == "" || strings.TrimSpace(role.DefaultModel) == "" {
			return invalid("a role requires its name, responsibilities, default Agent and model")
		}
		if len(role.Name) > 200 || len(role.Responsibilities) > 16000 || len(role.Skills) > 32 || len(role.Knowledge) > 32 {
			return invalid("role metadata exceeds its declared bound")
		}
		if role.QuestionMode != "" && role.QuestionMode != "disabled" && role.QuestionMode != "native" || role.QuestionMode == "native" && role.DefaultAgent != "pi" {
			return invalid("role question mode requires disabled or native with the Pi default Agent")
		}
		for _, values := range [][]string{role.Skills, role.Knowledge} {
			seen := map[string]bool{}
			for _, value := range values {
				if strings.TrimSpace(value) == "" || len(value) > 2048 || seen[value] {
					return invalid("role references must be unique non-empty values within 2048 bytes")
				}
				seen[value] = true
			}
		}
	}
	if c.Action == "conversation.create" {
		if c.Conversation == nil || strings.TrimSpace(c.Conversation.Title) == "" || len(c.Conversation.Title) > 200 {
			return invalid("a conversation requires a title within 200 bytes")
		}
	}
	if c.Action == "conversation.show" || c.Action == "conversation.append" {
		if strings.TrimSpace(c.ConversationID) == "" {
			return invalid("conversation_id is required")
		}
	}
	if c.Action == "conversation.append" && (strings.TrimSpace(c.Text) == "" || len(c.Text) > 32000) {
		return invalid("a conversation entry requires text within 32000 bytes")
	}
	return nil
}
