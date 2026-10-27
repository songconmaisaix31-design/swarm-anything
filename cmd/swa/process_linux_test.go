//go:build linux

package main

import (
	"bufio"
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
	"github.com/prometheus/procfs"
	"golang.org/x/sys/unix"
)

func TestLinuxServiceRejectsOuterProcBeforeCreatingLock(t *testing.T) {
	fs, err := procfs.NewFS("/proc")
	if err != nil {
		t.Fatal(err)
	}
	self, err := fs.Self()
	if err != nil {
		t.Fatal(err)
	}
	status, err := self.NewStatus()
	if err != nil {
		t.Fatal(err)
	}
	if self.PID == os.Getpid() && len(status.NSpids) <= 1 {
		t.Skip("当前 /proc 与进程使用同一 PID namespace")
	}
	root := t.TempDir()
	install, data := filepath.Join(root, "install"), filepath.Join(root, "data")
	for _, path := range []string{install, data} {
		if err := os.Mkdir(path, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(install, "VERSION"), []byte(strings.Repeat("0", 40)), 0o600); err != nil {
		t.Fatal(err)
	}
	job, err := ownServiceTree(data, install)
	if job != nil {
		_ = job.close()
		t.Fatal("外层 proc 被用于服务进程管理")
	}
	if err == nil || !strings.Contains(err.Error(), "/proc 不属于当前 PID namespace") {
		t.Fatalf("未提示 proc 挂载问题: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(data, "service.lock")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("错误环境仍然创建了服务锁: %v", err)
	}
}

func TestLinuxServiceRealProcessTree(t *testing.T) {
	if os.Getenv("SWA_LINUX_TREE_TEST_HELPER") != "1" {
		foreign := exec.Command("sleep", "10")
		if err := foreign.Start(); err != nil {
			t.Fatal(err)
		}
		defer func() { _ = foreign.Process.Kill(); _ = foreign.Wait() }()
		self, err := os.Executable()
		if err != nil {
			t.Fatal(err)
		}
		child := exec.Command(self, "-test.run=^TestLinuxServiceRealProcessTree$", "-test.v")
		child.Env = append(os.Environ(), "SWA_LINUX_TREE_TEST_HELPER=1", "SWA_LINUX_FOREIGN_PID="+strconv.Itoa(foreign.Process.Pid))
		output, err := child.CombinedOutput()
		if err != nil {
			t.Fatalf("独立 subreaper 实际检查失败: %v\n%s", err, output)
		}
		t.Log(string(output))
		if err := foreign.Process.Signal(syscall.Signal(0)); err != nil {
			t.Fatalf("同 UID 非所属进程受到影响: %v", err)
		}
		return
	}
	root := t.TempDir()
	install, data := filepath.Join(root, "install"), filepath.Join(root, "data")
	for _, path := range []string{install, data} {
		if err := os.Mkdir(path, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	revision, err := exec.Command("git", "rev-parse", "HEAD").Output()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(install, "VERSION"), revision, 0o600); err != nil {
		t.Fatal(err)
	}
	job, err := ownServiceTree(data, install)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := job.close(); err != nil {
			t.Error(err)
		}
	}()
	if _, err := ownServiceTree(data, install); !errors.Is(err, errServiceAlreadyOwned) {
		t.Fatalf("重复服务没有受到实际文件锁拒绝: %v", err)
	}
	lockPath := filepath.Join(data, "service.lock")
	if err := os.Chmod(lockPath, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := ownServiceTree(data, install); err == nil || errors.Is(err, errServiceAlreadyOwned) {
		t.Fatalf("锁文件未先拒绝非私有权限: %v", err)
	}
	if err := os.Chmod(lockPath, 0o600); err != nil {
		t.Fatal(err)
	}
	linked := filepath.Join(root, "outside-lock-link")
	if err := os.Link(lockPath, linked); err != nil {
		t.Fatal(err)
	}
	if _, err := ownServiceTree(data, install); err == nil || errors.Is(err, errServiceAlreadyOwned) {
		t.Fatalf("锁文件未先拒绝跨目录硬链接: %v", err)
	}
	if err := os.Remove(linked); err != nil {
		t.Fatal(err)
	}
	child := exec.Command("sh", "-c", "setsid sleep 1 & echo $!; read wait || :")
	stdin, err := child.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, err := child.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := child.Start(); err != nil {
		t.Fatal(err)
	}
	waited := false
	defer func() {
		_ = stdin.Close()
		if !waited {
			_ = child.Wait()
		}
		if err := job.awaitDescendants(io.Discard); err != nil {
			t.Error(err)
		}
	}()
	if err := job.observeChild(child, io.Discard); err != nil {
		t.Fatal(err)
	}
	scanner := bufio.NewScanner(stdout)
	if !scanner.Scan() {
		t.Fatalf("实际 shell 没有返回所属孙进程 PID: %v", scanner.Err())
	}
	grandchildPID, err := strconv.Atoi(strings.TrimSpace(scanner.Text()))
	if err != nil {
		t.Fatal(err)
	}
	grandchild, err := job.identity(grandchildPID)
	for deadline := time.Now().Add(500 * time.Millisecond); err == nil && grandchild.Session != grandchildPID && time.Now().Before(deadline); {
		time.Sleep(time.Millisecond)
		grandchild, err = job.identity(grandchildPID)
	}
	if err != nil || grandchild.Session != grandchildPID {
		t.Fatalf("实际 setsid 孙进程没有独立会话: %v", err)
	}
	t.Logf("真实资源身份: boot_id=%s serve_pid=%d serve_start_ticks=%s detached_pid=%d detached_start_ticks=%d session=%d", job.ownership.BootID, job.ownership.ServePID, job.ownership.ServeStartTicks, grandchildPID, grandchild.Starttime, grandchild.Session)
	actual := job.ownership
	actual.DaemonPID, actual.DaemonStartTicks, actual.DaemonSession = uint32(grandchildPID), strconv.FormatUint(grandchild.Starttime, 10), uuid.NewString()
	if err := job.verifyDaemon(actual); err != nil {
		t.Fatalf("真实所属进程的内核身份无法核验: %v", err)
	}
	wrong := actual
	wrong.BootID = uuid.NewString()
	if err := job.verifyDaemon(wrong); err == nil {
		t.Fatal("错误 boot_id 未被拒绝")
	}
	wrong = actual
	wrong.DaemonStartTicks = strconv.FormatUint(grandchild.Starttime+1, 10)
	if err := job.verifyDaemon(wrong); err == nil {
		t.Fatal("错误 start_ticks 未被拒绝")
	}
	foreignPID, err := strconv.Atoi(os.Getenv("SWA_LINUX_FOREIGN_PID"))
	if err != nil {
		t.Fatal(err)
	}
	foreign, err := job.identity(foreignPID)
	if err != nil {
		t.Fatal(err)
	}
	wrong.DaemonPID, wrong.DaemonStartTicks = uint32(foreignPID), strconv.FormatUint(foreign.Starttime, 10)
	if err := job.verifyDaemon(wrong); err == nil {
		t.Fatal("同 UID 非所属进程被误认为服务后代")
	}
	missing, err := procfs.NewFS(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	actualFS := job.fs
	job.fs = missing
	_, unavailable := job.snapshot()
	job.fs = actualFS
	if unavailable == nil {
		t.Fatal("缺少真实 proc 表仍返回了可验证快照")
	}
	if err := stdin.Close(); err != nil {
		t.Fatal(err)
	}
	err = child.Wait()
	waited = true
	if err != nil {
		t.Fatal(err)
	}
	adopted, err := job.identity(grandchildPID)
	if err != nil || adopted.PPID != os.Getpid() {
		t.Fatalf("detached 孙进程没有被当前 subreaper 收养: %v", err)
	}
	t.Logf("真实收养: pid=%d start_ticks=%d ppid=%d", adopted.PID, adopted.Starttime, adopted.PPID)
	if err := job.awaitDescendants(os.Stderr); err != nil {
		t.Fatal(err)
	}
	if _, err := job.fs.Proc(grandchildPID); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("已收养孙进程尚未实际回收: %v", err)
	}
	for _, known := range job.processes {
		fd, err := unix.Dup(known.pidfd)
		if err != nil {
			t.Fatal(err)
		}
		if err := unix.Close(fd); err != nil {
			t.Fatal(err)
		}
		if _, err := linuxPidfdExited(fd); err == nil {
			t.Fatal("无法查询的真实 pidfd 没有保留未知")
		}
		break
	}
}
