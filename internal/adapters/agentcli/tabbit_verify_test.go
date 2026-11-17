package agentcli

import (
	"bytes"
	"encoding/json"
	"io"
	"reflect"
	"strings"
	"testing"
)

func TestTabbitFixtureUsesOriginalReceiptAndDiscardsOnlyNewTask(t *testing.T) {
	t.Parallel()
	report := TabbitVerification{TaskName: "SWA-practice-local", RequestID: "request-original"}
	bootstrap := `{"status":"queued","requestId":"request-original","task":{"taskId":"new","taskName":"SWA-practice-local"}}`
	inspection := `{"status":"succeeded","requestId":"request-original"}`
	evaluation := `{"status":"succeeded","requestId":"request-original","result":{"value":{"url":"` + tabbitFixtureURL + `","title":"` + tabbitFixtureTitle + `","before":false,"source":"Source ID: DEMO-F08"}}}`
	finish := `{"finished":true,"keep":false,"closedTabIds":[41]}`
	for _, tc := range []struct {
		name    string
		replies []string
		want    []string
		pass    bool
		cleaned bool
	}{
		{"verified", []string{bootstrap, inspection, evaluation, finish}, []string{"bootstrap", "inspect", "receipt", "finish"}, true, true},
		{"wrong request", []string{bootstrap, inspection, strings.Replace(evaluation, "request-original", "other-request", 1), finish}, []string{"bootstrap", "inspect", "receipt", "finish"}, false, true},
		{"still pending", []string{bootstrap, `{"status":"running"}`, finish}, []string{"bootstrap", "inspect", "finish"}, false, true},
		{"wrong task", []string{strings.Replace(bootstrap, "SWA-practice-local", "other-task", 1)}, []string{"bootstrap"}, false, false},
		{"reused task", []string{strings.Replace(bootstrap, `"taskId":"new"`, `"taskId":"new","reused":true`, 1)}, []string{"bootstrap"}, false, false},
		{"lost receipt", []string{bootstrap, inspection}, []string{"bootstrap", "inspect", "receipt"}, false, false},
		{"missing cleanup", []string{bootstrap, inspection, evaluation, `{"finished":true,"keep":false}`}, []string{"bootstrap", "inspect", "receipt", "finish"}, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var commands bytes.Buffer
			got, err := verifyTabbitFixture(&commands, strings.NewReader(strings.Join(tc.replies, "\n")+"\n"), report)
			if (err == nil) != tc.pass || (got.State == "browser_task_verified") != tc.pass || got.CleanupVerified != tc.cleaned {
				t.Fatalf("unexpected verification result: %+v err=%v", got, err)
			}
			decode := json.NewDecoder(&commands)
			var operations []string
			for {
				var cmd struct {
					Operation string  `json:"op"`
					TaskName  string  `json:"taskName"`
					RequestID string  `json:"requestId"`
					Code      string  `json:"code"`
					Keep      *bool   `json:"keep"`
					Claim     []int64 `json:"claimTabIds"`
				}
				if err := decode.Decode(&cmd); err == io.EOF {
					break
				} else if err != nil {
					t.Fatal(err)
				}
				operations = append(operations, cmd.Operation)
				switch cmd.Operation {
				case "bootstrap":
					if cmd.TaskName != report.TaskName || cmd.RequestID != report.RequestID || cmd.Code != tabbitFixtureCode || len(cmd.Claim) != 0 {
						t.Fatal("bootstrap did not use only the new task and fixed fixture")
					}
				case "receipt", "inspect":
					if cmd.TaskName != "" || cmd.RequestID != report.RequestID || cmd.Code != "" {
						t.Fatal("read did not use the original request")
					}
				case "finish":
					if cmd.TaskName != "" || cmd.Keep == nil || *cmd.Keep || cmd.Code != "" {
						t.Fatal("cleanup did not use the existing bound workspace")
					}
				}
			}
			if !reflect.DeepEqual(operations, tc.want) {
				t.Fatalf("operations %v, want %v", operations, tc.want)
			}
		})
	}
}
