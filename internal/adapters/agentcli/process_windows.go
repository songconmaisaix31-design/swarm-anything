//go:build windows

package agentcli

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var shimArg = regexp.MustCompile(`^[A-Za-z0-9_.:/=\\-]+$`)

func ownedCommand(ctx context.Context, path string, args []string) (*exec.Cmd, error) {
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if ext := strings.ToLower(filepath.Ext(path)); ext == ".cmd" || ext == ".bat" {
		for _, arg := range args {
			if !shimArg.MatchString(arg) {
				return nil, fmt.Errorf("Windows 批处理入口仅支持简单参数，请登记原生可执行文件")
			}
		}
		interpreter := filepath.Join(os.Getenv("SystemRoot"), "System32", "cmd.exe")
		if !filepath.IsAbs(interpreter) {
			return nil, fmt.Errorf("无法定位 Windows 系统命令解释器")
		}
		cmd = exec.CommandContext(ctx, interpreter)
		cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CmdLine: fmt.Sprintf(`cmd.exe /d /s /c ""%s" %s"`, path, strings.Join(args, " "))}
	}
	cmd.WaitDelay = time.Second
	return cmd, nil
}

func startOwned(cmd *exec.Cmd) (func(), error) {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return nil, err
	}
	cleanup := func() { _ = windows.CloseHandle(job) }
	limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	if _, err := windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); err != nil {
		cleanup()
		return nil, err
	}
	cmd.Cancel = func() error { return windows.TerminateJobObject(job, 1) }
	if err := cmd.Start(); err != nil {
		cleanup()
		return nil, err
	}
	handle, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, uint32(cmd.Process.Pid))
	if err == nil {
		err = windows.AssignProcessToJobObject(job, handle)
		windows.CloseHandle(handle)
	}
	if err != nil {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		cleanup()
		return nil, err
	}
	return cleanup, nil
}
