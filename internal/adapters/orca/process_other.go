//go:build !windows

package orca

import "os/exec"

func configureHiddenProcess(cmd *exec.Cmd) {}
