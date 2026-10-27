package orca

import (
	"os/exec"
	"syscall"

	"golang.org/x/sys/windows"
)

func configureHiddenProcess(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.BELOW_NORMAL_PRIORITY_CLASS}
}
