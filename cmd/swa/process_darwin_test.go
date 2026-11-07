//go:build darwin && cgo

package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/google/uuid"
)

func darwinTestJob(t *testing.T) *serviceJob {
	t.Helper()
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	data, install := filepath.Join(root, "data"), filepath.Join(root, "install")
	if err := os.Mkdir(install, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(install, "VERSION"), []byte(strings.Repeat("a", 40)), 0o600); err != nil {
		t.Fatal(err)
	}
	job, err := ownServiceTree(data, install)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := job.close(); err != nil {
			t.Error(err)
		}
	})
	return job
}

func TestDarwinIdentityCommand(t *testing.T) {
	var out bytes.Buffer
	if code := darwinProcessIdentityCommand([]string{strconv.Itoa(os.Getpid())}, &out, io.Discard); code != 0 {
		t.Fatalf("identity exit=%d", code)
	}
	var value map[string]any
	if err := json.Unmarshal(out.Bytes(), &value); err != nil {
		t.Fatal(err)
	}
	if value["state"] != "present" || value["owner_uid"] != strconv.Itoa(os.Geteuid()) {
		t.Fatal(value)
	}
	t.Log(out.String())
	for _, arg := range []string{"0", "-1", "01", "1;echo", "2147483648", "4294967297"} {
		if darwinProcessIdentityCommand([]string{arg}, io.Discard, io.Discard) != 2 {
			t.Fatal(arg)
		}
	}
}

func TestDarwinServiceChildAndShutdown(t *testing.T) {
	job := darwinTestJob(t)
	child := exec.Command("/bin/cat")
	configureServiceChild(child)
	stdin, err := child.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := child.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = stdin.Close(); _ = child.Process.Kill(); _ = child.Wait() })
	if err := job.observeChild(child, os.Stderr); err != nil {
		t.Fatal(err)
	}
	row, err := darwinIdentity(child.Process.Pid)
	if err != nil {
		t.Fatal(err)
	}
	actual := job.ownership
	actual.DaemonPID, actual.DaemonStartTicks, actual.DaemonSession = uint32(row.PID), strconv.FormatUint(row.Start, 10), uuid.NewString()
	if err := job.verifyDaemon(actual); err != nil {
		t.Fatal(err)
	}
	wrong := actual
	wrong.DaemonStartTicks = strconv.FormatUint(row.Start+1, 10)
	if job.verifyDaemon(wrong) == nil {
		t.Fatal("复用 PID 身份未被拒绝")
	}
	wrong = actual
	wrong.OwnerUID = "0"
	if job.verifyDaemon(wrong) == nil {
		t.Fatal("伪造 UID 未被拒绝")
	}
	if err := stdin.Close(); err != nil {
		t.Fatal(err)
	}
	if err := child.Wait(); err != nil {
		t.Fatal(err)
	}
	var shutdown bytes.Buffer
	if err := job.awaitDescendants(&shutdown); !errors.Is(err, errServiceOwnershipUnknown) {
		t.Fatalf("注册前 fork 完整性应保持未知: %v", err)
	}
	if !strings.Contains(shutdown.String(), `"all_observed_exited":true`) {
		t.Fatal(shutdown.String())
	}
	t.Log(shutdown.String())
	t.Log("独立进程组、精确子进程身份、伪造身份拒绝、kqueue 退出与独立内核复核均通过")
}

func TestDarwinPrivateACL(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := darwinPrivateACL(root); err != nil {
		t.Fatal(err)
	}
	if err := darwinPrivateACL(filepath.Join(root, "missing")); err == nil {
		t.Fatal("缺失路径不得通过 ACL 检查")
	}
	if output, err := exec.Command("/bin/chmod", "+a", "everyone allow read", root).CombinedOutput(); err != nil {
		t.Fatalf("设置测试目录 ACL: %v %s", err, output)
	}
	if err := darwinPrivateACL(root); err == nil {
		t.Fatal("非空 ACL 不得通过私有路径检查")
	}
}

func TestDarwinDetachedDescendant(t *testing.T) {
	if os.Getenv("SWA_DARWIN_TEST_CHILD") == "1" {
		child := exec.Command("/bin/sleep", "0.5")
		child.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
		if err := child.Start(); err != nil {
			os.Exit(3)
		}
		_, _ = io.WriteString(os.Stdout, strconv.Itoa(child.Process.Pid)+"\n")
		_, _ = io.Copy(io.Discard, os.Stdin)
		_ = child.Wait()
		os.Exit(0)
	}
	job := darwinTestJob(t)
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	child := exec.Command(self, "-test.run=^TestDarwinDetachedDescendant$")
	child.Env = append(os.Environ(), "SWA_DARWIN_TEST_CHILD=1")
	configureServiceChild(child)
	stdin, _ := child.StdinPipe()
	var output bytes.Buffer
	child.Stdout = &output
	if err := child.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = stdin.Close(); _ = child.Process.Kill(); _ = child.Wait() })
	if err := job.observeChild(child, io.Discard); err != nil {
		t.Fatal(err)
	}
	var detached darwinProcess
	for deadline := time.Now().Add(2 * time.Second); time.Now().Before(deadline); {
		job.mu.Lock()
		rows, err := job.snapshotLocked()
		job.mu.Unlock()
		if err != nil {
			t.Fatal(err)
		}
		for _, row := range rows {
			if row.PPID == child.Process.Pid && row.PGID == row.PID {
				detached = row
			}
		}
		if detached.PID != 0 {
			break
		}
		time.Sleep(time.Millisecond)
	}
	if detached.PID == 0 {
		t.Fatal("未识别实际脱组后代")
	}
	t.Logf("实际脱组后代 pid=%d ppid=%d pgid=%d start_us=%d", detached.PID, detached.PPID, detached.PGID, detached.Start)
	_ = stdin.Close()
	if err := child.Wait(); err != nil {
		t.Fatal(err)
	}
	if err := job.awaitDescendants(os.Stderr); !errors.Is(err, errServiceOwnershipUnknown) {
		t.Fatalf("fork 完整性应保持未知: %v", err)
	}
	if _, err := darwinIdentity(detached.PID); err == nil {
		t.Fatal("实际后代仍存在")
	}
	t.Log("已观察后代实际退出；未将不完整 fork 发现证明报告为整树释放")
}

func TestDarwinPrivateRoot(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	data := filepath.Join(root, "data")
	if err := ensurePrivateDataRoot(data); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(data, 0o755); err != nil {
		t.Fatal(err)
	}
	if ensurePrivateDataRoot(data) == nil {
		t.Fatal("接受非私有权限")
	}
	link := filepath.Join(root, "link")
	if err := os.Symlink(data, link); err != nil {
		t.Fatal(err)
	}
	if requirePlainDataPath(filepath.Join(link, "child")) == nil {
		t.Fatal("接受符号链接路径段")
	}
}
