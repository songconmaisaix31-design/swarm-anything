//go:build linux

package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/prometheus/procfs"
	"golang.org/x/sys/unix"
)

func configureServiceChild(_ *exec.Cmd) {}

func ensurePrivateDataRoot(path string) error { return os.MkdirAll(path, 0o700) }

func requirePlainDataPath(path string) error {
	for current := filepath.Clean(path); ; current = filepath.Dir(current) {
		info, err := os.Lstat(current)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		if err == nil && info.Mode()&os.ModeSymlink != 0 {
			return errors.New("产品路径经过符号链接")
		}
		if filepath.Dir(current) == current {
			return nil
		}
	}
}

type linuxServiceProcess struct {
	PID        int    `json:"pid"`
	StartTicks uint64 `json:"start_ticks"`
	PPID       int    `json:"ppid"`
	State      string `json:"state"`
	pidfd      int
	direct     bool
}

type serviceJob struct {
	ownership serviceJobOwnership
	fs        procfs.FS
	processes map[string]*linuxServiceProcess
	lock      int
}

func linuxBootID() (string, error) {
	body, err := os.ReadFile("/proc/sys/kernel/random/boot_id")
	if err != nil {
		return "", err
	}
	value := strings.TrimSpace(string(body))
	id, err := uuid.Parse(value)
	if err != nil || id.String() != value {
		return "", errors.New("内核 boot_id 无效")
	}
	return value, nil
}

func (job *serviceJob) identity(pid int) (procfs.ProcStat, error) {
	process, err := job.fs.Proc(pid)
	if err != nil {
		return procfs.ProcStat{}, err
	}
	stat, err := process.Stat()
	if err != nil || stat.Starttime == 0 {
		return stat, errors.Join(errServiceOwnershipUnknown, err)
	}
	status, err := process.NewStatus()
	if err != nil || status.TGID != stat.PID {
		return stat, errors.Join(errServiceOwnershipUnknown, err)
	}
	for _, uid := range status.UIDs {
		if strconv.FormatUint(uid, 10) != job.ownership.OwnerUID {
			return stat, errors.New("所属进程 UID 不符")
		}
	}
	info, err := os.Stat(filepath.Join("/proc", strconv.Itoa(pid)))
	if err != nil {
		return stat, err
	}
	kernel, ok := info.Sys().(*syscall.Stat_t)
	if !ok || !info.IsDir() || strconv.FormatUint(uint64(kernel.Uid), 10) != job.ownership.OwnerUID {
		return stat, errors.New("内核 proc 目录 UID 不符")
	}
	return stat, nil
}

func processKey(pid int, ticks uint64) string {
	return strconv.Itoa(pid) + ":" + strconv.FormatUint(ticks, 10)
}

func (job *serviceJob) bind(stat procfs.ProcStat, direct bool) error {
	key := processKey(stat.PID, stat.Starttime)
	if prior := job.processes[key]; prior != nil {
		prior.direct = prior.direct || direct
		return nil
	}
	fd, err := unix.PidfdOpen(stat.PID, 0)
	if err != nil {
		return err
	}
	actual, err := job.identity(stat.PID)
	if err != nil || actual.Starttime != stat.Starttime {
		return errors.Join(errServiceOwnershipUnknown, err, unix.Close(fd))
	}
	job.processes[key] = &linuxServiceProcess{PID: stat.PID, StartTicks: stat.Starttime, PPID: actual.PPID, State: actual.State, pidfd: fd, direct: direct}
	return nil
}

func ownServiceTree(data, install string) (*serviceJob, error) {
	info, err := os.Stat(data)
	if err != nil || !info.IsDir() || info.Mode().Perm()&0o077 != 0 {
		return nil, errors.Join(errors.New("Linux 私有数据根需要当前用户独占权限"), err)
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || stat.Uid != uint32(os.Geteuid()) || os.Getuid() != os.Geteuid() {
		return nil, errors.New("Linux 私有数据根不属于当前用户")
	}
	body, err := os.ReadFile(filepath.Join(install, "VERSION"))
	if err != nil {
		return nil, err
	}
	revision := strings.TrimSpace(string(body))
	decoded, err := hex.DecodeString(revision)
	if err != nil || len(decoded) != 20 || revision != strings.ToLower(revision) {
		return nil, errors.New("实际安装源码版本无效")
	}
	fs, err := procfs.NewFS("/proc")
	if err != nil {
		return nil, err
	}
	var procMount unix.Statfs_t
	if err := unix.Statfs("/proc", &procMount); err != nil || procMount.Type != unix.PROC_SUPER_MAGIC {
		return nil, errors.Join(errors.New("进程观察必须来自实际内核 proc 文件系统"), err)
	}
	boot, err := linuxBootID()
	if err != nil {
		return nil, err
	}
	lock, err := unix.Open(filepath.Join(data, "service.lock"), unix.O_RDWR|unix.O_CREAT|unix.O_CLOEXEC|unix.O_NOFOLLOW, 0o600)
	if err != nil {
		return nil, err
	}
	var lockStat unix.Stat_t
	if err := unix.Fstat(lock, &lockStat); err != nil || lockStat.Mode&unix.S_IFMT != unix.S_IFREG || lockStat.Uid != uint32(os.Geteuid()) || lockStat.Mode&0o7777 != 0o600 || lockStat.Nlink != 1 {
		return nil, errors.Join(errors.New("Linux 服务锁不是当前用户独占的普通单链接文件"), err, unix.Close(lock))
	}
	if err := unix.Flock(lock, unix.LOCK_EX|unix.LOCK_NB); err != nil {
		return nil, errors.Join(errServiceAlreadyOwned, err, unix.Close(lock))
	}
	job := &serviceJob{fs: fs, lock: lock, processes: make(map[string]*linuxServiceProcess), ownership: serviceJobOwnership{
		Platform: "linux", Name: "SWAService" + uuid.NewString(), ServePID: uint32(os.Getpid()), BootID: boot,
		OwnerUID: strconv.Itoa(os.Geteuid()), DataRoot: data, InstallRoot: install, SourceRevision: revision,
	}}
	self, err := job.identity(os.Getpid())
	if err != nil {
		return nil, errors.Join(err, job.close())
	}
	job.ownership.ServeStartTicks = strconv.FormatUint(self.Starttime, 10)
	prior, err := readServiceDaemonRecord(data, install, revision)
	if err != nil {
		return nil, errors.Join(err, job.close())
	}
	if prior != nil {
		if prior.ServiceJob.OwnerUID != job.ownership.OwnerUID {
			return nil, errors.Join(errServiceOwnershipUnknown, job.close())
		}
		for index := 0; index < 2; index++ {
			if index != 0 {
				time.Sleep(50 * time.Millisecond)
			}
			if prior.ServiceJob.BootID != boot {
				continue
			}
			for _, expected := range []struct {
				pid   uint32
				ticks string
			}{{prior.ServiceJob.ServePID, prior.ServiceJob.ServeStartTicks}, {prior.ServiceJob.DaemonPID, prior.ServiceJob.DaemonStartTicks}} {
				process, err := job.fs.Proc(int(expected.pid))
				if err != nil && !errors.Is(err, os.ErrNotExist) {
					return nil, errors.Join(errServiceOwnershipUnknown, err, job.close())
				}
				if err != nil {
					continue
				}
				observed, err := process.Stat()
				if err != nil && !errors.Is(err, os.ErrNotExist) {
					return nil, errors.Join(errServiceOwnershipUnknown, err, job.close())
				}
				if err == nil && strconv.FormatUint(observed.Starttime, 10) == expected.ticks {
					return nil, errors.Join(errServiceOwnershipUnknown, errors.New("原 Linux 服务或 daemon 尚未确认退出，不能自动接管"), job.close())
				}
			}
		}
	}
	if err := unix.Prctl(unix.PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0); err != nil {
		return nil, errors.Join(err, job.close())
	}
	return job, nil
}

func (job *serviceJob) snapshot() ([]procfs.ProcStat, error) {
	boot, err := linuxBootID()
	if err != nil || boot != job.ownership.BootID {
		return nil, errors.Join(errServiceOwnershipUnknown, err)
	}
	self, err := job.identity(int(job.ownership.ServePID))
	if err != nil || strconv.FormatUint(self.Starttime, 10) != job.ownership.ServeStartTicks {
		return nil, errors.Join(errServiceOwnershipUnknown, err)
	}
	processes, err := job.fs.AllProcs()
	if err != nil {
		return nil, err
	}
	rows := make(map[int]procfs.ProcStat, len(processes))
	for _, process := range processes {
		row, err := process.Stat()
		if errors.Is(err, os.ErrNotExist) || errors.Is(err, unix.ESRCH) {
			continue
		}
		if err != nil {
			return nil, err
		}
		rows[row.PID] = row
	}
	if root, exists := rows[int(job.ownership.ServePID)]; !exists || root.Starttime != self.Starttime {
		return nil, errServiceOwnershipUnknown
	}
	owned := map[int]bool{int(job.ownership.ServePID): true}
	for added := true; added; {
		added = false
		for pid, row := range rows {
			if !owned[pid] && owned[row.PPID] {
				parent := rows[row.PPID]
				if row.Starttime < parent.Starttime {
					return nil, errServiceOwnershipUnknown
				}
				owned[pid], added = true, true
			}
		}
	}
	var descendants []procfs.ProcStat
	for pid, row := range rows {
		if pid == int(job.ownership.ServePID) || !owned[pid] {
			continue
		}
		if err := job.bind(row, false); err != nil {
			return nil, err
		}
		descendants = append(descendants, row)
	}
	for _, known := range job.processes {
		if row, exists := rows[known.PID]; exists && row.Starttime == known.StartTicks && !owned[known.PID] {
			return nil, errors.New("原所属进程离开当前 subreaper 的可证祖先链")
		}
	}
	sort.Slice(descendants, func(i, j int) bool { return descendants[i].PID < descendants[j].PID })
	return descendants, nil
}

func (job *serviceJob) observeChild(command *exec.Cmd, stderr io.Writer) error {
	if command.Process == nil {
		return errServiceOwnershipUnknown
	}
	stat, err := job.identity(command.Process.Pid)
	if err != nil || stat.PPID != int(job.ownership.ServePID) {
		return errors.Join(errServiceOwnershipUnknown, err)
	}
	if err := job.bind(stat, true); err != nil {
		return err
	}
	_, err = fmt.Fprintf(stderr, "Linux 所属服务子进程: pid=%d start_ticks=%d boot_id=%s\n", stat.PID, stat.Starttime, job.ownership.BootID)
	return err
}

func (job *serviceJob) verifyDaemon(actual serviceJobOwnership) error {
	base := actual
	base.DaemonPID, base.DaemonStartTicks, base.DaemonSession = 0, "", ""
	if base != job.ownership || actual.DaemonPID == 0 || actual.DaemonStartTicks == "" || actual.DaemonCreatedAtMS != 0 {
		return errServiceOwnershipUnknown
	}
	if id, err := uuid.Parse(actual.DaemonSession); err != nil || id.String() != actual.DaemonSession {
		return errServiceOwnershipUnknown
	}
	rows, err := job.snapshot()
	if err != nil {
		return err
	}
	for _, row := range rows {
		if row.PID == int(actual.DaemonPID) && strconv.FormatUint(row.Starttime, 10) == actual.DaemonStartTicks && row.State != "Z" {
			return nil
		}
	}
	return errServiceOwnershipUnknown
}

func linuxPidfdExited(fd int) (bool, error) {
	items := []unix.PollFd{{Fd: int32(fd), Events: unix.POLLIN}}
	if _, err := unix.Poll(items, 0); err != nil {
		return false, err
	}
	if items[0].Revents&(unix.POLLERR|unix.POLLNVAL) != 0 {
		return false, errors.New("所属 pidfd 无法查询")
	}
	return items[0].Revents&unix.POLLIN != 0, nil
}

func (job *serviceJob) awaitDescendants(stderr io.Writer) error {
	deadline := time.Now().Add(15 * time.Second)
	consecutive := 0
	for time.Now().Before(deadline) {
		rows, err := job.snapshot()
		if err != nil {
			return errors.Join(errServiceOwnershipUnknown, err)
		}
		for _, row := range rows {
			known := job.processes[processKey(row.PID, row.Starttime)]
			if row.PPID != int(job.ownership.ServePID) || row.State != "Z" || known == nil || known.direct {
				continue
			}
			exited, err := linuxPidfdExited(known.pidfd)
			if err != nil || !exited {
				return errors.Join(errServiceOwnershipUnknown, err)
			}
			var status unix.WaitStatus
			pid, err := unix.Wait4(row.PID, &status, unix.WNOHANG, nil)
			if err != nil || pid != row.PID {
				return errors.Join(errServiceOwnershipUnknown, err)
			}
		}
		exited := len(rows) == 0
		for _, known := range job.processes {
			gone, err := linuxPidfdExited(known.pidfd)
			if err != nil {
				return errors.Join(errServiceOwnershipUnknown, err)
			}
			exited = exited && gone
		}
		_ = json.NewEncoder(stderr).Encode(map[string]any{"type": "linux_service_descendants", "boot_id": job.ownership.BootID, "owned_count": len(rows), "all_observed_pidfds_exited": exited})
		if exited {
			consecutive++
		} else {
			consecutive = 0
		}
		if consecutive >= 2 {
			return nil
		}
		time.Sleep(50 * time.Millisecond)
	}
	return errors.New("Linux 所属后代退出尚未完整确认")
}

func (job *serviceJob) close() error {
	var result error
	for key, process := range job.processes {
		result = errors.Join(result, unix.Close(process.pidfd))
		delete(job.processes, key)
	}
	if job.lock >= 0 {
		result = errors.Join(result, unix.Close(job.lock))
		job.lock = -1
	}
	return result
}

func resourceAdmission(ctx context.Context) (any, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	fs, err := procfs.NewFS("/proc")
	if err != nil {
		return nil, err
	}
	memory, err := fs.Meminfo()
	if err != nil || memory.MemAvailableBytes == nil {
		return nil, errors.Join(errors.New("实际 Linux 内存资源不可查询"), err)
	}
	return map[string]any{"platform": "linux", "logical_cpus": runtime.NumCPU(), "available_bytes": *memory.MemAvailableBytes, "sampled_at": time.Now().UTC()}, nil
}
