package app_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/projectfiles"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

func TestRunSubmissionDetectsSameSizeSameTimeInputChanges(t *testing.T) {
	input := newDeliveryAdmissionInput(t, "original-agent")
	path := filepath.Join(input.project.Root, "input.txt")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	reader := projectfiles.Files{}
	before, err := reader.ReadProjectFiles(context.Background(), input.project, []string{"input.txt"})
	if err != nil || len(before) != 1 {
		t.Fatal("actual input read failed", err)
	}
	submission := workspace.OrcaRunSubmission{SpecInput: before[0], LeadInput: before[0]}
	if err := submission.ValidateInput(before[0], false); err != nil {
		t.Fatal(err)
	}
	changed := strings.Replace(before[0].Text, "请", "再", 1)
	if changed == before[0].Text || len(changed) != len(before[0].Text) {
		t.Fatal("the actual file change must keep its byte length")
	}
	if err := os.WriteFile(path, []byte(changed), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(path, info.ModTime(), info.ModTime()); err != nil {
		t.Fatal(err)
	}
	after, err := reader.ReadProjectFiles(context.Background(), input.project, []string{"input.txt"})
	if err != nil || len(after) != 1 {
		t.Fatal("changed input read failed", err)
	}
	if before[0].Version != after[0].Version {
		t.Fatal("the reproduction did not preserve the original filesystem version")
	}
	for _, specification := range []bool{false, true} {
		if submission.ValidateInput(after[0], specification) == nil {
			t.Fatal("changed content was accepted with the same filesystem version")
		}
	}
}
