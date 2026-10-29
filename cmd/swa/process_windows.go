package main

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"github.com/google/uuid"
	"golang.org/x/sys/windows"
)

type resourceSample struct {
	UTC            time.Time `json:"utc"`
	CPUPercent     float64   `json:"cpu_percent"`
	CPUScope       string    `json:"cpu_scope"`
	AvailableBytes uint64    `json:"available_bytes"`
	ElapsedSeconds float64   `json:"elapsed_seconds"`
}

func configureServiceChild(command *exec.Cmd) {
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}

func requirePlainDataPath(path string) error {
	for current := filepath.Clean(path); ; current = filepath.Dir(current) {
		name, err := windows.UTF16PtrFromString(current)
		if err != nil {
			return err
		}
		attributes, err := windows.GetFileAttributes(name)
		if err != nil && !errors.Is(err, windows.ERROR_FILE_NOT_FOUND) && !errors.Is(err, windows.ERROR_PATH_NOT_FOUND) {
			return err
		}
		if err == nil && attributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
			return fmt.Errorf("产品数据路径经过 reparse point: %s", current)
		}
		if filepath.Dir(current) == current {
			return nil
		}
	}
}

type serviceJob struct {
	handle    windows.Handle
	ownership serviceJobOwnership
	adopted   *serviceJobOwnership
}

func ownServiceTree(data, install string) (*serviceJob, error) {
	body, err := os.ReadFile(filepath.Join(install, "VERSION"))
	if err != nil {
		return nil, err
	}
	revision := strings.TrimSpace(string(body))
	decoded, err := hex.DecodeString(revision)
	if err != nil || len(decoded) != 20 || revision != strings.ToLower(revision) {
		return nil, errors.New("实际安装源码版本无效")
	}
	prior, err := readServiceDaemonRecord(data, install, revision)
	if err != nil {
		return nil, err
	}
	created, err := serviceProcessCreated(windows.CurrentProcess())
	if err != nil {
		return nil, err
	}
	var sessionID uint32
	if err := windows.ProcessIdToSessionId(uint32(os.Getpid()), &sessionID); err != nil {
		return nil, err
	}
	job := &serviceJob{ownership: serviceJobOwnership{Name: `Local\SWAService` + uuid.NewString(), ServePID: uint32(os.Getpid()), ServeCreatedAtMS: created, WindowsSessionID: sessionID, DataRoot: data, InstallRoot: install, SourceRevision: revision}}
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return nil, err
	}
	if prior != nil {
		owner := prior.ServiceJob
		if owner.WindowsSessionID != 0 && owner.WindowsSessionID != sessionID {
			return nil, errServiceOwnershipUnknown
		}
		if err := serviceProcessExited(owner.ServePID, owner.ServeCreatedAtMS, owner.WindowsSessionID); err != nil {
			return nil, errors.Join(errServiceOwnershipUnknown, err)
		}
		name, err := windows.UTF16PtrFromString(owner.Name)
		if err != nil {
			return nil, err
		}
		opened, _, callErr := windows.NewLazySystemDLL("kernel32.dll").NewProc("OpenJobObjectW").Call(uintptr(windows.READ_CONTROL|0x0004|0x0001), 0, uintptr(unsafe.Pointer(name)))
		if opened == 0 {
			// 同一 Local 命名空间中的 Job 已销毁，且两个原始身份均已退出，才建立新一代。
			if !errors.Is(callErr, windows.ERROR_FILE_NOT_FOUND) || owner.WindowsSessionID == 0 {
				return nil, errors.Join(errServiceOwnershipUnknown, callErr)
			}
			if err := serviceProcessExited(owner.DaemonPID, owner.DaemonCreatedAtMS, owner.WindowsSessionID); err != nil {
				return nil, errors.Join(errServiceOwnershipUnknown, err)
			}
		} else {
			job.ownership.Name = owner.Name
			job.adopted = owner
			job.handle = windows.Handle(opened)
		}
	}
	if job.handle == 0 {
		acl := "O:" + user.User.Sid.String() + "D:P(A;;0x1f003f;;;" + user.User.Sid.String() + ")(A;;0x1f003f;;;SY)"
		descriptor, err := windows.SecurityDescriptorFromString(acl)
		if err != nil {
			return nil, err
		}
		attributes := windows.SecurityAttributes{Length: uint32(unsafe.Sizeof(windows.SecurityAttributes{})), SecurityDescriptor: descriptor}
		name, err := windows.UTF16PtrFromString(job.ownership.Name)
		if err != nil {
			return nil, err
		}
		handle, err := windows.CreateJobObject(&attributes, name)
		if err != nil {
			return nil, err
		}
		job.handle = handle
	}
	if err := job.security(user.User.Sid); err != nil {
		return nil, errors.Join(errServiceOwnershipUnknown, err, job.close())
	}
	if job.adopted != nil {
		if err := job.verifyDaemon(*job.adopted); err != nil {
			return nil, errors.Join(errServiceOwnershipUnknown, err, job.close())
		}
		if err := job.rejectOtherServe(install); err != nil {
			return nil, errors.Join(errServiceOwnershipUnknown, err, job.close())
		}
	}
	// 当前 serve 在启动子进程前加入同一命名 Job，句柄关闭不终止成员。
	if err := windows.AssignProcessToJobObject(job.handle, windows.CurrentProcess()); err != nil {
		return nil, errors.Join(err, job.close())
	}
	active, err := job.active()
	if err != nil || job.adopted == nil && active != 1 || job.adopted != nil && active < 2 {
		return nil, errors.Join(fmt.Errorf("serve Job 初始成员不确定: active=%d", active), err, job.close())
	}
	return job, nil
}

func serviceProcessCreated(process windows.Handle) (uint64, error) {
	var created, exited, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(process, &created, &exited, &kernel, &user); err != nil {
		return 0, err
	}
	return ticks(created)/10000 - 11644473600000, nil
}

func serviceProcessExited(pid uint32, expected uint64, expectedSession uint32) (result error) {
	process, err := windows.OpenProcess(windows.SYNCHRONIZE|windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if errors.Is(err, windows.ERROR_INVALID_PARAMETER) {
		// 系统已不存在此 PID；仅仍存在的 PID 才能核对创建时间和 Session。
		return nil
	}
	if err != nil {
		return err
	}
	defer func() { result = errors.Join(result, windows.CloseHandle(process)) }()
	var sessionID uint32
	if err := windows.ProcessIdToSessionId(pid, &sessionID); err != nil || expectedSession != 0 && sessionID != expectedSession {
		return errors.Join(errServiceOwnershipUnknown, err)
	}
	created, err := serviceProcessCreated(process)
	if err != nil || created != expected {
		return errors.Join(errors.New("原 serve 创建身份发生变化"), err)
	}
	state, err := windows.WaitForSingleObject(process, 0)
	if err != nil || state != windows.WAIT_OBJECT_0 {
		return errors.Join(errors.New("原 serve 尚未确认退出"), err)
	}
	return nil
}

func (job *serviceJob) security(user *windows.SID) error {
	descriptor, err := windows.GetSecurityInfo(job.handle, windows.SE_KERNEL_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		return err
	}
	owner, _, err := descriptor.Owner()
	if err != nil || owner == nil || !owner.Equals(user) {
		return errors.Join(errors.New("私有 Job owner 发生变化"), err)
	}
	control, _, err := descriptor.Control()
	if err != nil || control&windows.SE_DACL_PROTECTED == 0 {
		return errors.Join(errors.New("私有 Job DACL 未受保护"), err)
	}
	acl, _, err := descriptor.DACL()
	if err != nil || acl == nil || acl.AceCount != 2 {
		return errors.Join(errors.New("私有 Job DACL 不符合当前用户与 SYSTEM 范围"), err)
	}
	trustees := map[string]bool{user.String(): true, "S-1-5-18": true}
	for index := uint32(0); index < uint32(acl.AceCount); index++ {
		var ace *windows.ACCESS_ALLOWED_ACE
		if err := windows.GetAce(acl, index, &ace); err != nil {
			return err
		}
		sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart)).String()
		if ace.Header.AceType != windows.ACCESS_ALLOWED_ACE_TYPE || ace.Header.AceFlags != 0 || ace.Mask != 0x1f003f || !trustees[sid] {
			return errors.New("私有 Job DACL 权限发生变化")
		}
		delete(trustees, sid)
	}
	var limits windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
	if err := windows.QueryInformationJobObject(job.handle, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits)), nil); err != nil {
		return err
	}
	if len(trustees) != 0 || limits.BasicLimitInformation.LimitFlags != 0 {
		return errors.New("私有 Job containment 或关闭规则发生变化")
	}
	return nil
}

func (job *serviceJob) verifyDaemon(actual serviceJobOwnership) (result error) {
	if actual.Name != job.ownership.Name || actual.SourceRevision != job.ownership.SourceRevision || !strings.EqualFold(actual.DataRoot, job.ownership.DataRoot) || !strings.EqualFold(actual.InstallRoot, job.ownership.InstallRoot) || actual.DaemonPID == 0 || actual.DaemonCreatedAtMS == 0 || actual.DaemonSession == "" {
		return errServiceOwnershipUnknown
	}
	if job.adopted != nil && actual != *job.adopted {
		return errServiceOwnershipUnknown
	}
	if job.adopted == nil && (actual.ServePID != job.ownership.ServePID || actual.ServeCreatedAtMS != job.ownership.ServeCreatedAtMS) {
		return errServiceOwnershipUnknown
	}
	process, err := windows.OpenProcess(windows.SYNCHRONIZE|windows.PROCESS_QUERY_LIMITED_INFORMATION, false, actual.DaemonPID)
	if err != nil {
		return err
	}
	defer func() { result = errors.Join(result, windows.CloseHandle(process)) }()
	var sessionID uint32
	if err := windows.ProcessIdToSessionId(actual.DaemonPID, &sessionID); err != nil || sessionID != job.ownership.WindowsSessionID || actual.WindowsSessionID != 0 && actual.WindowsSessionID != sessionID {
		return errors.Join(errServiceOwnershipUnknown, err)
	}
	created, err := serviceProcessCreated(process)
	if err != nil || created != actual.DaemonCreatedAtMS {
		return errors.Join(errServiceOwnershipUnknown, err)
	}
	state, err := windows.WaitForSingleObject(process, 0)
	if err != nil || state != uint32(windows.WAIT_TIMEOUT) {
		return errors.Join(errServiceOwnershipUnknown, err)
	}
	return job.member(process)
}

func (job *serviceJob) rejectOtherServe(install string) error {
	for capacity := 64; capacity <= 1048576; capacity *= 4 {
		storage := make([]byte, 8+capacity*int(unsafe.Sizeof(uintptr(0))))
		list := (*struct {
			Assigned uint32
			Count    uint32
			IDs      [1]uintptr
		})(unsafe.Pointer(&storage[0]))
		err := windows.QueryInformationJobObject(job.handle, windows.JobObjectBasicProcessIdList, uintptr(unsafe.Pointer(list)), uint32(len(storage)), nil)
		if errors.Is(err, windows.ERROR_MORE_DATA) || err == nil && list.Assigned != list.Count {
			continue
		}
		if err != nil || list.Count > uint32(capacity) {
			return errors.Join(errServiceOwnershipUnknown, err)
		}
		for _, pid := range unsafe.Slice(&list.IDs[0], int(list.Count)) {
			process, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
			if err != nil {
				return err
			}
			buffer := make([]uint16, 32768)
			size := uint32(len(buffer))
			err = windows.QueryFullProcessImageName(process, 0, &buffer[0], &size)
			closeErr := windows.CloseHandle(process)
			if err != nil || closeErr != nil {
				return errors.Join(err, closeErr)
			}
			if strings.EqualFold(windows.UTF16ToString(buffer[:size]), filepath.Join(install, "swa.exe")) {
				return errors.New("同一私有 Job 仍有实际 serve 或控制程序")
			}
		}
		return nil
	}
	return errServiceOwnershipUnknown
}

func (job *serviceJob) active() (uint32, error) {
	if err := job.member(windows.CurrentProcess()); err != nil {
		return 0, err
	}
	var accounting struct {
		UserTime, KernelTime, PeriodUserTime, PeriodKernelTime  int64
		PageFaults, TotalProcesses, ActiveProcesses, Terminated uint32
	}
	var length uint32
	if err := windows.QueryInformationJobObject(job.handle, windows.JobObjectBasicAccountingInformation, uintptr(unsafe.Pointer(&accounting)), uint32(unsafe.Sizeof(accounting)), &length); err != nil {
		return 0, err
	}
	if length != uint32(unsafe.Sizeof(accounting)) || accounting.ActiveProcesses < 1 || accounting.TotalProcesses < accounting.ActiveProcesses {
		return 0, errors.New("serve Job 实际 accounting 无效")
	}
	return accounting.ActiveProcesses, nil
}

func (job *serviceJob) member(process windows.Handle) error {
	var member int32
	call := windows.NewLazySystemDLL("kernel32.dll").NewProc("IsProcessInJob")
	result, _, err := call.Call(uintptr(process), uintptr(job.handle), uintptr(unsafe.Pointer(&member)))
	if result == 0 {
		return fmt.Errorf("IsProcessInJob: %w", err)
	}
	if member == 0 {
		return errors.New("实际进程不属于本次 serve Job")
	}
	return nil
}

func (job *serviceJob) observeChild(command *exec.Cmd, stderr io.Writer) error {
	process, err := windows.OpenProcess(windows.PROCESS_QUERY_INFORMATION, false, uint32(command.Process.Pid))
	if err != nil {
		return err
	}
	observe := func() error {
		if err := job.member(process); err != nil {
			return err
		}
		var created, exited, kernel, user windows.Filetime
		if err := windows.GetProcessTimes(process, &created, &exited, &kernel, &user); err != nil {
			return err
		}
		active, err := job.active()
		if err != nil {
			return err
		}
		if created.Nanoseconds() <= 0 || active <= 1 {
			return errors.New("所属子进程的创建身份或非空 Job 成员未确认")
		}
		_, err = fmt.Fprintf(stderr, "serve Job 子进程: pid=%d created_utc=%s active=%d\n", command.Process.Pid, time.Unix(0, created.Nanoseconds()).UTC().Format(time.RFC3339Nano), active)
		return err
	}
	return errors.Join(observe(), windows.CloseHandle(process))
}

func (job *serviceJob) awaitDescendants(stderr io.Writer) error {
	deadline := time.NewTimer(15 * time.Second)
	defer deadline.Stop()
	tick := time.NewTicker(100 * time.Millisecond)
	defer tick.Stop()
	consecutive := 0
	for {
		active, err := job.active()
		if err != nil {
			return err
		}
		if active == 1 {
			consecutive++
			_, _ = fmt.Fprintf(stderr, "serve Job 退出观察: utc=%s active=%d consecutive=%d\n", time.Now().UTC().Format(time.RFC3339Nano), active, consecutive)
			if consecutive == 2 {
				return nil
			}
		} else {
			consecutive = 0
		}
		select {
		case <-deadline.C:
			return fmt.Errorf("serve Job 仍有所属后代: active=%d", active)
		case <-tick.C:
		}
	}
}

func (job *serviceJob) close() error { return windows.CloseHandle(job.handle) }

type cpuTimes struct{ idle, kernel, user windows.Filetime }

func readCPUTimes() (cpuTimes, error) {
	var times cpuTimes
	call := windows.NewLazySystemDLL("kernel32.dll").NewProc("GetSystemTimes")
	result, _, err := call.Call(uintptr(unsafe.Pointer(&times.idle)), uintptr(unsafe.Pointer(&times.kernel)), uintptr(unsafe.Pointer(&times.user)))
	if result == 0 {
		return times, fmt.Errorf("GetSystemTimes: %w", err)
	}
	return times, nil
}

func ticks(value windows.Filetime) uint64 {
	return uint64(value.HighDateTime)<<32 | uint64(value.LowDateTime)
}

func resourceAdmission(ctx context.Context) ([]resourceSample, error) {
	started := time.Now()
	samples := make([]resourceSample, 0, 1)
	for index := 0; index < 1; index++ {
		before, err := readCPUTimes()
		if err != nil {
			return samples, err
		}
		select {
		case <-ctx.Done():
			return samples, ctx.Err()
		case <-time.After(time.Second):
		}
		after, err := readCPUTimes()
		if err != nil {
			return samples, err
		}
		idle := ticks(after.idle) - ticks(before.idle)
		total := ticks(after.kernel) - ticks(before.kernel) + ticks(after.user) - ticks(before.user)
		if total == 0 || idle > total {
			return samples, errors.New("实际系统 CPU 计时不能形成有效阻塞样本")
		}
		var memory struct {
			Length, Load                                                       uint32
			TotalPhysical, AvailablePhysical, TotalPageFile, AvailablePageFile uint64
			TotalVirtual, AvailableVirtual, AvailableExtendedVirtual           uint64
		}
		memory.Length = uint32(unsafe.Sizeof(memory))
		call := windows.NewLazySystemDLL("kernel32.dll").NewProc("GlobalMemoryStatusEx")
		result, _, err := call.Call(uintptr(unsafe.Pointer(&memory)))
		if result == 0 {
			return samples, fmt.Errorf("GlobalMemoryStatusEx: %w", err)
		}
		samples = append(samples, resourceSample{UTC: time.Now().UTC(), CPUPercent: 100 * float64(total-idle) / float64(total), CPUScope: "primary_processor_group", AvailableBytes: memory.AvailablePhysical, ElapsedSeconds: time.Since(started).Seconds()})
	}
	return samples, nil
}
