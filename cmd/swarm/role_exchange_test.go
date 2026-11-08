package main

import (
	"bytes"
	"strings"
	"testing"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/rolecards"
)

func TestRoleExchangeBuiltinReviewer(t *testing.T) {
	catalog, err := rolecards.New()
	if err != nil {
		t.Fatal(err)
	}
	reviewer, err := catalog.Find("builtin.reviewer")
	if err != nil {
		t.Fatal(err)
	}
	for _, format := range []string{"dossier", "skill", "grok-build", "text"} {
		t.Run(format, func(t *testing.T) {
			var exported, imported bytes.Buffer
			if err := executeRoleExchange([]string{"export", "../../roles/builtin/reviewer.yaml", "--to", format}, nil, &exported); err != nil {
				t.Fatal(err)
			}
			args := []string{"import", "-", "--from", format}
			if format == "grok-build" || format == "text" {
				args = append(args, "--id", reviewer.ID, "--name", reviewer.Name)
			}
			if format == "text" {
				args = append(args, "--description", reviewer.Description)
			}
			if err := executeRoleExchange(args, &exported, &imported); err != nil {
				t.Fatal(err)
			}
			restored, err := catalog.ParseRole(imported.Bytes())
			if err != nil {
				t.Fatal(err)
			}
			if restored.ID != reviewer.ID || restored.Name != reviewer.Name || restored.Description != reviewer.Description || restored.Identity != reviewer.Identity {
				t.Fatalf("角色身份未完整恢复: %+v", restored)
			}
			if restored.Tools == nil || len(*restored.Tools) != 0 {
				t.Fatalf("导入角色不得继承本地默认工具: %+v", restored.Tools)
			}
		})
	}
}

func TestRoleExchangeRejectsChangedDossier(t *testing.T) {
	var original bytes.Buffer
	if err := executeRoleExchange([]string{"export", "../../roles/builtin/reviewer.yaml", "--to", "dossier"}, nil, &original); err != nil {
		t.Fatal(err)
	}
	modified := strings.Replace(original.String(), "name: ", "name: changed-", 1)
	var imported bytes.Buffer
	err := executeRoleExchange([]string{"import", "-", "--from", "dossier"}, strings.NewReader(modified), &imported)
	if err == nil || !strings.Contains(err.Error(), "指纹") || imported.Len() != 0 {
		t.Fatalf("dossier 变更应当在输出前被拒绝，实际为 %v, %q", err, imported.String())
	}
}
