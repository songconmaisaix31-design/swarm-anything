package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestOrcaCLIRealInstalledController(t *testing.T) {
	if os.Getenv("SWA_REAL_ENABLED") != "1" {
		t.Skip("真实链路须在已授窗口和同安装候选运行，当前不计验收")
	}
	root, controller := os.Getenv("SWA_REAL_INSTALL_ROOT"), os.Getenv("SWA_REAL_CONTROLLER")
	if !filepath.IsAbs(root) || controller == "" || os.Getenv("SWA_PROJECT_TOKEN") == "" {
		t.Fatal("真实安装、controller 或当前项目批准缺失")
	}
	expected, err := os.ReadFile(filepath.Join(root, "VERSION"))
	if err != nil {
		t.Fatal(err)
	}
	versionOutput, err := exec.Command(filepath.Join(root, serviceProgramName("swa")), "--version").Output()
	if err != nil || strings.TrimSpace(string(versionOutput)) != strings.TrimSpace(string(expected)) {
		t.Fatalf("实际安装版本不符: %v", err)
	}
	output, err := exec.Command(filepath.Join(root, serviceProgramName("swa")), "controller", "show", "--controller", controller, "--json").Output()
	if err != nil {
		t.Fatal(err)
	}
	var reply struct {
		OK         bool   `json:"ok"`
		Controller string `json:"controller"`
		RuntimeID  string `json:"runtime_id"`
	}
	if err := json.Unmarshal(output, &reply); err != nil {
		t.Fatal(err)
	}
	if !reply.OK || reply.Controller != controller || reply.RuntimeID != os.Getenv("SWA_REAL_RUNTIME_ID") {
		t.Fatal("实际控制端查询未证明同一安装 runtime/controller")
	}
}
