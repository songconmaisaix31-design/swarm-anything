package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"

	"github.com/prometheus/procfs"
	"golang.org/x/sys/unix"
)

func checkHostRuntime() error {
	if runtime.GOOS != "linux" || runtime.GOARCH != "amd64" || runtime.Version() != requiredGo {
		return fail("reviewed_linux_go_required")
	}
	return nil
}

func hostPaths(p executionPackage) (hostPathSet, error) {
	project := publicRoot
	switch p.Profile {
	case piN4Profile, openCodeN4Profile:
		project = "/workspace/swa-public-case-20261023-n4/public-project"
	case piN6Profile, openCodeN6Profile:
		project = "/workspace/swa-public-case-20261023-n6/public-project"
	case piQuestionsProfile:
		project = "/workspace/swa-public-question-case-20261023/public-project"
	case openCodeSingleProfile:
		project = "/workspace/swa-public-opencode-single-20261023/public-project"
	}
	return hostPathSet{node: filepath.Join(p.Installation, "node/node"), swa: filepath.Join(p.Installation, "swa"), server: filepath.Join(p.Installation, "server"), platform: "linux-x64-glibc", project: project}, nil
}

func checkHostPathComponent(path string) error { return nil }

func checkHostPrivatePath(path string, directory bool) error {
	info, err := os.Lstat(path)
	if err != nil {
		return fail("private_path_required")
	}
	owner, ok := info.Sys().(*syscall.Stat_t)
	if !ok || owner.Uid != uint32(os.Getuid()) || info.Mode().Perm() != map[bool]os.FileMode{true: 0700, false: 0600}[directory] || info.Mode()&(os.ModeSetuid|os.ModeSetgid|os.ModeSticky) != 0 {
		return fail("private_path_required")
	}
	return nil
}

func createHostPrivateFile(path string) (*os.File, error) {
	return os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
}

func createHostPrivateDirectory(path string) error { return os.Mkdir(path, 0700) }

func bindHostConsumer(p *executionPackage, prepare bool) error {
	return require(p.HostConsumerSHA == "", "windows_consumer_requires_windows_host")
}

func childEnvironment(home string) []string {
	return []string{"PATH=/usr/bin:/bin", "LANG=C.UTF-8", "LC_ALL=C.UTF-8", "HOME=" + home, "TMPDIR=" + home, "GIT_TERMINAL_PROMPT=0", "GIT_OPTIONAL_LOCKS=0"}
}

type proofWire struct {
	Type    string `json:"type"`
	Boot    string `json:"boot_id"`
	RootPID int    `json:"root_pid"`
	Members []struct {
		PID   int    `json:"pid"`
		Ticks uint64 `json:"start_ticks"`
	} `json:"members"`
}
type daemonWire struct {
	PID       int `json:"pid"`
	Ownership struct {
		Platform    string `json:"platform"`
		Source      string `json:"source_revision"`
		Install     string `json:"install_root"`
		Data        string `json:"data_root"`
		Boot        string `json:"boot_id"`
		UID         string `json:"owner_uid"`
		ServePID    int    `json:"serve_pid"`
		ServeTicks  string `json:"serve_start_ticks"`
		DaemonPID   int    `json:"daemon_pid"`
		DaemonTicks string `json:"daemon_start_ticks"`
	} `json:"swa_service_job"`
}

func serviceIdentity(p executionPackage) (string, error) {
	scope, err := fixedProfile(p)
	if err != nil || scope.sourceHome == "" {
		return "", fail("fixed_service_source_required")
	}
	var ready readyWire
	var proof proofWire
	var daemon daemonWire
	var launch launchBase
	var sourceHome string
	if p.ExpectedRuntimeID == "" || p.ReadySHA == "" || p.ProofSHA == "" || p.LaunchSHA == "" {
		return "", fail("fixed_service_baseline_required")
	}
	if scope.agent == "opencode" {
		if err := openCodeOwnerLayout(p); err != nil {
			return "", err
		}
	}
	if err := readWire(p.ReadyFile, &ready, p.ReadySHA); err != nil {
		return "", err
	}
	if err := readWire(p.ProofFile, &proof, p.ProofSHA); err != nil {
		return "", err
	}
	if scope.agent == "pi" {
		var record piLaunchWire
		if err := readWire(p.LaunchFile, &record, p.LaunchSHA); err != nil {
			return "", err
		}
		launch, sourceHome = record.launchBase, record.PiSourceHome
	} else if scope.agent == "opencode" {
		var record openCodeLaunchWire
		if err := readWire(p.LaunchFile, &record, p.LaunchSHA); err != nil {
			return "", err
		}
		launch, sourceHome = record.launchBase, record.OpenCodeSourceHome
	} else {
		var record launchWire
		if err := readWire(p.LaunchFile, &record, p.LaunchSHA); err != nil {
			return "", err
		}
		launch, sourceHome = record.launchBase, record.CodexSourceHome
	}
	if err := readWire(filepath.Join(p.DataRoot, "daemon/daemon-v49.pid"), &daemon, ""); err != nil {
		return "", err
	}
	o := daemon.Ownership
	if !ready.OK || ready.HTTP != p.Endpoint || ready.Data != p.DataRoot || ready.Install != p.Installation || ready.Readiness.Data != p.DataRoot || ready.Readiness.Node != filepath.Join(p.Installation, "node/node") || ready.Readiness.RuntimeID != p.ExpectedRuntimeID || proof.Type != "process_tree_observed" || o.Platform != "linux" || o.Source != p.Revision || o.Install != p.Installation || o.Data != p.DataRoot || o.Boot != proof.Boot || o.ServePID != proof.RootPID || o.DaemonPID != daemon.PID || o.UID != strconv.Itoa(os.Getuid()) || launch.Installation != p.Installation || launch.Revision != p.Revision || launch.DataRoot != p.DataRoot || launch.Endpoint != p.Endpoint || launch.ServePID != o.ServePID || sourceHome != scope.sourceHome {
		return "", fail("actual_service_wire_mismatch")
	}
	if p.Profile == piQuestionsProfile {
		owner, _, err := readQuestionOwnerHandoff(p)
		if err != nil {
			return "", err
		}
		if owner.ServePID != launch.ServePID {
			return "", fail("question_owner_handoff_process_mismatch")
		}
	}
	boot, err := readBounded("/proc/sys/kernel/random/boot_id", 4096)
	if err != nil || strings.TrimSpace(string(boot)) != proof.Boot {
		return "", fail("service_boot_mismatch")
	}
	var mount unix.Statfs_t
	if unix.Statfs("/proc", &mount) != nil || mount.Type != unix.PROC_SUPER_MAGIC {
		return "", fail("kernel_procfs_required")
	}
	fs, err := procfs.NewFS("/proc")
	if err != nil {
		return "", fail("kernel_procfs_required")
	}
	ticks := map[int]uint64{}
	for _, member := range proof.Members {
		if member.PID <= 0 || member.Ticks == 0 || ticks[member.PID] != 0 {
			return "", fail("service_incarnation_incomplete")
		}
		ticks[member.PID] = member.Ticks
	}
	if strconv.FormatUint(ticks[o.ServePID], 10) != o.ServeTicks || strconv.FormatUint(ticks[daemon.PID], 10) != o.DaemonTicks {
		return "", fail("service_incarnation_mismatch")
	}
	for pid, exe := range map[int]string{o.ServePID: filepath.Join(p.Installation, "swa"), ready.NodePID: filepath.Join(p.Installation, "node/node"), ready.ServerPID: filepath.Join(p.Installation, "server"), daemon.PID: filepath.Join(p.Installation, "node/node")} {
		if ticks[pid] == 0 {
			return "", fail("service_incarnation_incomplete")
		}
		process, err := fs.Proc(pid)
		if err != nil {
			return "", fail("service_process_unavailable")
		}
		before, err := process.Stat()
		if err != nil || before.Starttime != ticks[pid] {
			return "", fail("service_process_changed")
		}
		fd, err := unix.PidfdOpen(pid, 0)
		if err != nil {
			return "", fail("service_pidfd_unavailable")
		}
		checkErr := func() error {
			after, err := process.Stat()
			if err != nil || after.Starttime != before.Starttime {
				return fail("service_process_changed")
			}
			status, err := process.NewStatus()
			if err != nil || status.TGID != pid {
				return fail("service_uid_unavailable")
			}
			for _, uid := range status.UIDs {
				if uid != uint64(os.Getuid()) {
					return fail("service_uid_mismatch")
				}
			}
			info, err := os.Stat(filepath.Join("/proc", strconv.Itoa(pid)))
			if err != nil {
				return fail("service_uid_unavailable")
			}
			owner, ok := info.Sys().(*syscall.Stat_t)
			if !ok || owner.Uid != uint32(os.Getuid()) {
				return fail("service_uid_mismatch")
			}
			actual, err := process.Executable()
			if err != nil || actual != exe {
				return fail("service_executable_mismatch")
			}
			running, err := os.Stat(filepath.Join("/proc", strconv.Itoa(pid), "exe"))
			if err != nil {
				return fail("service_executable_unavailable")
			}
			installed, err := os.Stat(exe)
			if err != nil || !os.SameFile(running, installed) {
				return fail("service_executable_mismatch")
			}
			poll := []unix.PollFd{{Fd: int32(fd), Events: unix.POLLIN}}
			if _, err := unix.Poll(poll, 0); err != nil || poll[0].Revents != 0 {
				return fail("service_process_not_live")
			}
			return nil
		}()
		_ = unix.Close(fd)
		if checkErr != nil {
			return "", checkErr
		}
	}
	return ready.Readiness.RuntimeID, nil
}
