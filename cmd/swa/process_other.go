//go:build !windows && !linux

package main

import (
	"context"
	"errors"
	"io"
	"os/exec"
)

func configureServiceChild(_ *exec.Cmd) {}

func ensurePrivateDataRoot(_ string) error {
	return errors.New("此产品安装候选仅支持 Windows 和 Linux")
}

func requirePlainDataPath(_ string) error {
	return errors.New("此产品安装候选仅支持 Windows")
}

type serviceJob struct{ ownership serviceJobOwnership }

func ownServiceTree(_, _ string) (*serviceJob, error) {
	return nil, errors.New("此产品安装候选仅支持 Windows")
}

func (*serviceJob) verifyDaemon(_ serviceJobOwnership) error {
	return errors.New("此产品安装候选仅支持 Windows")
}

func (*serviceJob) awaitDescendants(_ io.Writer) error {
	return errors.New("此产品安装候选仅支持 Windows")
}

func (*serviceJob) observeChild(_ *exec.Cmd, _ io.Writer) error {
	return errors.New("此产品安装候选仅支持 Windows")
}

func (*serviceJob) close() error { return nil }

func resourceAdmission(_ context.Context) (any, error) {
	return nil, errors.New("此产品安装候选仅支持 Windows")
}
