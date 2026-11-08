//go:build darwin

package main

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sys/unix"
)

type darwinProcess struct {
	PID   int
	PPID  int
	PGID  int
	UID   uint32
	Start uint64
	State int8
}

type darwinObserved struct {
	row    darwinProcess
	exited bool
}

type serviceJob struct {
	ownership    serviceJobOwnership
	mu           sync.Mutex
	processes    map[int]*darwinObserved
	lock         int
	queue        int
	stop         chan struct{}
	done         chan struct{}
	observeError error
	sawFork      bool
}

func configureServiceChild(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

func requirePlainDataPath(path string) error {
	if !filepath.IsAbs(path) {
		return errors.New("产品路径必须为绝对路径")
	}
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

func ensurePrivateDataRoot(path string) error {
	if err := requirePlainDataPath(path); err != nil {
		return err
	}
	if err := os.MkdirAll(path, 0o700); err != nil {
		return err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || !info.IsDir() || info.Mode().Perm() != 0o700 || stat.Uid != uint32(os.Geteuid()) || os.Getuid() != os.Geteuid() {
		return errors.New("macOS 私有数据根必须属于当前 UID 且权限为 0700")
	}
	return darwinPrivateACL(path)
}

func darwinBootID() (string, error) {
	t, err := unix.SysctlTimeval("kern.boottime")
	if err != nil {
		return "", err
	}
	if t.Sec <= 0 || t.Usec < 0 || t.Usec >= 1000000 {
		return "", errServiceOwnershipUnknown
	}
	return fmt.Sprintf("darwin-boottime:%d:%d", t.Sec, t.Usec), nil
}

func darwinRow(k unix.KinfoProc) (darwinProcess, error) {
	t := k.Proc.P_starttime
	if t.Sec <= 0 || uint64(t.Sec) > (math.MaxUint64-999999)/1000000 || t.Usec < 0 || t.Usec >= 1000000 {
		return darwinProcess{}, errServiceOwnershipUnknown
	}
	if k.Eproc.Pcred.P_ruid != k.Eproc.Ucred.Uid || k.Eproc.Pcred.P_svuid != k.Eproc.Ucred.Uid {
		return darwinProcess{}, errServiceOwnershipUnknown
	}
	return darwinProcess{PID: int(k.Proc.P_pid), PPID: int(k.Eproc.Ppid), PGID: int(k.Eproc.Pgid), UID: k.Eproc.Ucred.Uid, Start: uint64(t.Sec)*1000000 + uint64(t.Usec), State: k.Proc.P_stat}, nil
}

func darwinIdentity(pid int) (darwinProcess, error) {
	if pid <= 0 || pid > math.MaxInt32 {
		return darwinProcess{}, errServiceOwnershipUnknown
	}
	rows, err := unix.SysctlKinfoProcSlice("kern.proc.pid", pid)
	if err != nil {
		return darwinProcess{}, err
	}
	if len(rows) == 0 {
		return darwinProcess{}, unix.ESRCH
	}
	if len(rows) != 1 || int(rows[0].Proc.P_pid) != pid {
		return darwinProcess{}, errServiceOwnershipUnknown
	}
	row, err := darwinRow(rows[0])
	if err != nil || row.UID != uint32(os.Geteuid()) {
		return darwinProcess{}, errors.Join(errServiceOwnershipUnknown, err)
	}
	return row, nil
}

func sameDarwinProcess(a, b darwinProcess) bool {
	return a.PID == b.PID && a.Start == b.Start && a.UID == b.UID
}

func init() { nativeProcessIdentity = darwinProcessIdentityCommand }

func darwinProcessIdentityCommand(args []string, stdout, stderr io.Writer) int {
	if len(args) != 1 {
		return 2
	}
	pid, err := strconv.Atoi(args[0])
	if err != nil || pid <= 0 || pid > math.MaxInt32 || strconv.Itoa(pid) != args[0] {
		return 2
	}
	result := map[string]any{"schema": "swa.darwin-process-identity.v1", "platform": "darwin", "pid": pid}
	boot, err := darwinBootID()
	if err != nil {
		return 6
	}
	before, err := darwinIdentity(pid)
	if errors.Is(err, unix.ESRCH) || errors.Is(err, os.ErrNotExist) {
		result["state"] = "absent"
	} else {
		if err != nil {
			return 6
		}
		path, err := darwinExecutable(pid)
		if err != nil {
			return 6
		}
		after, err := darwinIdentity(pid)
		if err != nil || !sameDarwinProcess(before, after) || before.PPID != after.PPID {
			return 6
		}
		endBoot, err := darwinBootID()
		if err != nil || boot != endBoot {
			return 6
		}
		endPath, err := darwinExecutable(pid)
		if err != nil || endPath != path {
			return 6
		}
		final, err := darwinIdentity(pid)
		if err != nil || !sameDarwinProcess(before, final) || before.PPID != final.PPID {
			return 6
		}
		result["state"], result["ppid"] = "present", before.PPID
		result["owner_uid"], result["start_ticks"], result["boot_id"] = strconv.FormatUint(uint64(before.UID), 10), strconv.FormatUint(before.Start, 10), boot
		result["executable"] = map[string]string{"state": "observed", "path": path}
	}
	if err := json.NewEncoder(stdout).Encode(result); err != nil {
		return 6
	}
	return 0
}

func ownServiceTree(data, install string) (*serviceJob, error) {
	if err := ensurePrivateDataRoot(data); err != nil {
		return nil, err
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
	boot, err := darwinBootID()
	if err != nil {
		return nil, err
	}
	self, err := darwinIdentity(os.Getpid())
	if err != nil {
		return nil, err
	}
	lock, err := unix.Open(filepath.Join(data, "service.lock"), unix.O_RDWR|unix.O_CREAT|unix.O_CLOEXEC|unix.O_NOFOLLOW, 0o600)
	if err != nil {
		return nil, err
	}
	var stat unix.Stat_t
	if err := unix.Fstat(lock, &stat); err != nil || stat.Mode&unix.S_IFMT != unix.S_IFREG || stat.Mode&0o7777 != 0o600 || stat.Uid != uint32(os.Geteuid()) || stat.Nlink != 1 {
		return nil, errors.Join(errServiceOwnershipUnknown, err, unix.Close(lock))
	}
	if err := darwinPrivateACL(filepath.Join(data, "service.lock")); err != nil {
		return nil, errors.Join(err, unix.Close(lock))
	}
	if err := unix.Flock(lock, unix.LOCK_EX|unix.LOCK_NB); err != nil {
		return nil, errors.Join(errServiceAlreadyOwned, err, unix.Close(lock))
	}
	queue, err := unix.Kqueue()
	if err != nil {
		return nil, errors.Join(err, unix.Close(lock))
	}
	unix.CloseOnExec(queue)
	job := &serviceJob{lock: lock, queue: queue, processes: make(map[int]*darwinObserved), stop: make(chan struct{}), done: make(chan struct{}), ownership: serviceJobOwnership{Platform: "darwin", Name: "SWAService" + uuid.NewString(), ServePID: uint32(self.PID), ServeStartTicks: strconv.FormatUint(self.Start, 10), BootID: boot, OwnerUID: strconv.Itoa(os.Geteuid()), DataRoot: data, InstallRoot: install, SourceRevision: revision}}
	prior, err := readServiceDaemonRecord(data, install, revision, false)
	if err == nil && prior != nil {
		if prior.ServiceJob.OwnerUID != job.ownership.OwnerUID {
			err = errServiceOwnershipUnknown
		}
		if prior.ServiceJob.BootID == boot {
			for _, pid := range []uint32{prior.ServiceJob.ServePID, prior.ServiceJob.DaemonPID} {
				_, observed := darwinIdentity(int(pid))
				// 旧记录不能证明未观察到的脱组后代已经退出，保持拒绝自动接管。
				if observed == nil || !errors.Is(observed, unix.ESRCH) {
					err = errServiceOwnershipUnknown
				}
			}
			if err == nil {
				err = errors.Join(errServiceOwnershipUnknown, errors.New("旧 macOS 服务的全部后代未获独立退出证明，拒绝自动接管"))
			}
		}
	}
	if err != nil {
		_ = unix.Close(queue)
		_ = unix.Close(lock)
		return nil, err
	}
	go job.monitor()
	return job, nil
}

func (job *serviceJob) bind(row darwinProcess) error {
	if row.UID != uint32(os.Geteuid()) {
		return errServiceOwnershipUnknown
	}
	if prior := job.processes[row.PID]; prior != nil {
		if !sameDarwinProcess(prior.row, row) {
			return errServiceOwnershipUnknown
		}
		return nil
	}
	event := unix.Kevent_t{Ident: uint64(row.PID), Filter: unix.EVFILT_PROC, Flags: unix.EV_ADD | unix.EV_ENABLE | unix.EV_CLEAR, Fflags: unix.NOTE_EXIT | unix.NOTE_FORK}
	if _, err := unix.Kevent(job.queue, []unix.Kevent_t{event}, nil, nil); err != nil {
		return err
	}
	after, err := darwinIdentity(row.PID)
	if err != nil || !sameDarwinProcess(row, after) {
		return errors.Join(errServiceOwnershipUnknown, err)
	}
	job.processes[row.PID] = &darwinObserved{row: row}
	return nil
}

func (job *serviceJob) snapshotLocked() ([]darwinProcess, error) {
	boot, err := darwinBootID()
	if err != nil || boot != job.ownership.BootID {
		return nil, errors.Join(errServiceOwnershipUnknown, err)
	}
	self, err := darwinIdentity(int(job.ownership.ServePID))
	if err != nil || strconv.FormatUint(self.Start, 10) != job.ownership.ServeStartTicks {
		return nil, errors.Join(errServiceOwnershipUnknown, err)
	}
	all, err := unix.SysctlKinfoProcSlice("kern.proc.uid", os.Geteuid())
	if err != nil {
		return nil, err
	}
	rows := make(map[int]darwinProcess)
	for _, k := range all {
		row, e := darwinRow(k)
		if e != nil {
			continue
		}
		rows[row.PID] = row
	}
	owned := map[int]bool{self.PID: true}
	for pid, known := range job.processes {
		if row, ok := rows[pid]; ok && sameDarwinProcess(row, known.row) {
			owned[pid] = true
		}
	}
	for changed := true; changed; {
		changed = false
		for pid, row := range rows {
			parent, ok := rows[row.PPID]
			if !owned[pid] && ok && owned[row.PPID] && row.Start >= parent.Start && row.Start >= self.Start && row.UID == self.UID {
				owned[pid] = true
				changed = true
			}
		}
	}
	var result []darwinProcess
	for pid, row := range rows {
		if pid == self.PID || !owned[pid] {
			continue
		}
		if err := job.bind(row); err != nil {
			return nil, err
		}
		result = append(result, row)
	}
	return result, nil
}

func (job *serviceJob) drainLocked() error {
	events := make([]unix.Kevent_t, len(job.processes)+1)
	n, err := unix.Kevent(job.queue, nil, events, &unix.Timespec{})
	if err != nil {
		return err
	}
	for _, event := range events[:n] {
		known := job.processes[int(event.Ident)]
		if known == nil || event.Flags&unix.EV_ERROR != 0 {
			return errServiceOwnershipUnknown
		}
		if event.Fflags&unix.NOTE_EXIT != 0 {
			known.exited = true
		}
		if event.Fflags&unix.NOTE_FORK != 0 {
			job.sawFork = true
		}
	}
	return nil
}

func (job *serviceJob) monitor() {
	defer close(job.done)
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-job.stop:
			return
		case <-ticker.C:
			job.mu.Lock()
			_, err := job.snapshotLocked()
			observation := errors.Join(err, job.drainLocked())
			if job.observeError == nil {
				job.observeError = observation
			}
			job.mu.Unlock()
		}
	}
}

func (job *serviceJob) observeChild(command *exec.Cmd, stderr io.Writer) error {
	job.mu.Lock()
	defer job.mu.Unlock()
	if command.Process == nil {
		return errServiceOwnershipUnknown
	}
	row, err := darwinIdentity(command.Process.Pid)
	if err != nil || row.PPID != int(job.ownership.ServePID) || row.PGID != row.PID {
		return errors.Join(errServiceOwnershipUnknown, err)
	}
	if err := job.bind(row); err != nil {
		return err
	}
	_, err = fmt.Fprintf(stderr, "macOS 所属服务子进程: pid=%d start_us=%d uid=%d pgid=%d\n", row.PID, row.Start, row.UID, row.PGID)
	return err
}

func (job *serviceJob) verifyDaemon(actual serviceJobOwnership) error {
	job.mu.Lock()
	defer job.mu.Unlock()
	base := actual
	base.DaemonPID, base.DaemonStartTicks, base.DaemonSession = 0, "", ""
	if base != job.ownership || actual.DaemonPID == 0 || actual.DaemonCreatedAtMS != 0 {
		return errServiceOwnershipUnknown
	}
	if id, err := uuid.Parse(actual.DaemonSession); err != nil || id.String() != actual.DaemonSession {
		return errServiceOwnershipUnknown
	}
	rows, err := job.snapshotLocked()
	if err != nil {
		return err
	}
	for _, row := range rows {
		if row.PID == int(actual.DaemonPID) && strconv.FormatUint(row.Start, 10) == actual.DaemonStartTicks && row.State != 5 {
			return nil
		}
	}
	return errServiceOwnershipUnknown
}

func (job *serviceJob) awaitDescendants(stderr io.Writer) error {
	consecutive := 0
	for deadline := time.Now().Add(15 * time.Second); time.Now().Before(deadline); {
		job.mu.Lock()
		rows, err := job.snapshotLocked()
		err = errors.Join(err, job.drainLocked(), job.observeError)
		exited := len(rows) == 0
		for _, known := range job.processes {
			current, queryErr := darwinIdentity(known.row.PID)
			absent := errors.Is(queryErr, unix.ESRCH)
			if queryErr != nil && !absent {
				err = errors.Join(err, queryErr)
			}
			if queryErr == nil && !sameDarwinProcess(current, known.row) {
				err = errors.Join(err, errServiceOwnershipUnknown)
			}
			exited = exited && absent && known.exited
		}
		forked := job.sawFork
		count := len(job.processes)
		job.mu.Unlock()
		_ = json.NewEncoder(stderr).Encode(map[string]any{"type": "darwin_service_descendants", "owned_count": len(rows), "observed_count": count, "all_observed_exited": exited, "fork_observed": forked, "fork_inventory_complete": false})
		if err != nil {
			return errors.Join(errServiceOwnershipUnknown, err)
		}
		if exited {
			consecutive++
		} else {
			consecutive = 0
		}
		if consecutive >= 2 {
			// 注册前的 fork 没有历史事件，未收到 NOTE_FORK 也不能证明完整性。
			return errors.Join(errServiceOwnershipUnknown, errors.New("已观察后代均退出，但 macOS 无法证明观察注册前及快照之间的脱组 fork 完整性"))
		}
		time.Sleep(50 * time.Millisecond)
	}
	return errors.Join(errServiceOwnershipUnknown, errors.New("macOS 所属后代退出尚未完整确认"))
}

func (job *serviceJob) close() error {
	close(job.stop)
	<-job.done
	return errors.Join(unix.Close(job.queue), unix.Close(job.lock))
}

func resourceAdmission(ctx context.Context) (any, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	total, err := unix.SysctlUint64("hw.memsize")
	if err != nil {
		return nil, err
	}
	return map[string]any{"platform": "darwin", "logical_cpus": runtime.NumCPU(), "total_bytes": total, "available_bytes": nil, "available_memory_state": "unknown", "sampled_at": time.Now().UTC()}, nil
}
