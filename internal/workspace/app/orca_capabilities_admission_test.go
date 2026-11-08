package app_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

func TestOrcaCapabilitiesRejectBeforeNativeSQLite(t *testing.T) {
	for _, boundary := range []string{"client_workdir", "observe_not_allowed", "root_missing", "root_redirected"} {
		t.Run(boundary, func(t *testing.T) {
			input := newDeliveryAdmissionInput(t, "original-agent")
			expected := apierrors.ContextStale
			command := workspace.OrcaCommand{Action: "capabilities", ProjectID: input.project.ID}
			switch boundary {
			case "client_workdir":
				command.Workdir = filepath.Dir(input.project.Root)
				expected = apierrors.ValidationFailed
			case "observe_not_allowed":
				settings := input.project.Settings
				settings.AllowedActions = []string{"read_context", "start", "send", "stop"}
				saveAdmissionSettings(t, input.db, input.project, settings)
				expected = apierrors.ApprovalRequired
			case "root_missing":
				if err := os.Rename(input.project.Root, input.project.Root+"-moved"); err != nil {
					t.Fatal(err)
				}
			case "root_redirected":
				target := input.project.Root + "-moved"
				if err := os.Rename(input.project.Root, target); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(target, input.project.Root); err != nil {
					// Windows 无创建 symlink 权限时不把这一分支算通过。
					t.Skipf("real directory symlink unavailable: %v", err)
				}
			}
			// 真实 SQLite/文件与当前权限规则；空实际 Runtime 不会提供任何成功返回。
			// 一旦越过应有的早拒，测试就会进入未配置端口并失败，不代表 HTTP/native 正向。
			reply, err := input.service.ExecuteOrca(context.Background(), input.human, command)
			var service *apierrors.ServiceError
			if !errors.As(err, &service) || service.Code != expected || reply.OK || reply.Result != nil {
				t.Fatalf("capability early rejection differs: code=%s error=%v", expected, err)
			}
			var count int
			if err := input.db.Conn().QueryRow("SELECT COUNT(*) FROM local_agent_sessions").Scan(&count); err != nil || count != 0 {
				t.Fatal("capability rejection created a session", count, err)
			}
		})
	}
}
