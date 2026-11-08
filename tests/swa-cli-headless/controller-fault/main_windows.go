package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

type processIdentity struct {
	PID     uint32 `json:"pid"`
	Created uint64 `json:"creationTimeMs"`
	Name    string `json:"name"`
}

type controllerOwner struct {
	Controller string `json:"controller"`
	Binding    struct {
		PtyID       string `json:"ptyId"`
		Incarnation string `json:"processIncarnation"`
	} `json:"binding"`
	Process processIdentity `json:"process"`
	Helper  processIdentity `json:"helper"`
}

type serviceOwnership struct {
	Name        string `json:"name"`
	Data        string `json:"data_root"`
	Install     string `json:"install_root"`
	Revision    string `json:"source_revision"`
	DaemonPID   uint32 `json:"daemon_pid"`
	DaemonBirth uint64 `json:"daemon_created_at_ms"`
	Session     string `json:"daemon_session"`
}

type heldProcess struct {
	Handle  windows.Handle `json:"-"`
	PID     uint32         `json:"pid"`
	Created uint64         `json:"creation_time_ms"`
	Image   string         `json:"executable"`
}

func samePath(left, right string) bool { return strings.EqualFold(left, right) }

func canonical(path string) (string, error) {
	if !filepath.IsAbs(path) {
		return "", errors.New("需要实际绝对路径")
	}
	actual, err := filepath.EvalSymlinks(path)
	if err != nil || !samePath(actual, filepath.Clean(path)) {
		return "", errors.Join(errors.New("实际路径缺失或发生重定向"), err)
	}
	return actual, nil
}

func readJSON(path string, value any) error {
	body, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(body, value)
}

func live(process windows.Handle) (uint64, error) {
	state, err := windows.WaitForSingleObject(process, 0)
	if err != nil || state != uint32(windows.WAIT_TIMEOUT) {
		return 0, errors.Join(errors.New("所持目标句柄没有活进程"), err)
	}
	var created, exited, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(process, &created, &exited, &kernel, &user); err != nil {
		return 0, err
	}
	ticks := uint64(created.HighDateTime)<<32 | uint64(created.LowDateTime)
	return ticks/10000 - 11644473600000, nil
}

func member(job, process windows.Handle) error {
	var belongs int32
	result, _, err := windows.NewLazySystemDLL("kernel32.dll").NewProc("IsProcessInJob").Call(uintptr(process), uintptr(job), uintptr(unsafe.Pointer(&belongs)))
	if result == 0 || belongs == 0 {
		return fmt.Errorf("实际所持句柄不属于本项 Job: %v", err)
	}
	return nil
}

func checkJob(job windows.Handle) error {
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return err
	}
	descriptor, err := windows.GetSecurityInfo(job, windows.SE_KERNEL_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		return err
	}
	owner, _, err := descriptor.Owner()
	if err != nil || owner == nil || !owner.Equals(user.User.Sid) {
		return errors.Join(errors.New("实际 Job owner 无法确认"), err)
	}
	control, _, err := descriptor.Control()
	if err != nil || control&windows.SE_DACL_PROTECTED == 0 {
		return errors.Join(errors.New("实际 Job DACL 未受保护"), err)
	}
	acl, _, err := descriptor.DACL()
	if err != nil || acl == nil || acl.AceCount != 2 {
		return errors.Join(errors.New("实际 Job DACL 范围不符"), err)
	}
	trustees := map[string]bool{user.User.Sid.String(): true, "S-1-5-18": true}
	for index := uint32(0); index < 2; index++ {
		var ace *windows.ACCESS_ALLOWED_ACE
		if err := windows.GetAce(acl, index, &ace); err != nil {
			return err
		}
		sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart)).String()
		if ace.Header.AceType != windows.ACCESS_ALLOWED_ACE_TYPE || ace.Header.AceFlags != 0 || ace.Mask != 0x1f003f || !trustees[sid] {
			return errors.New("实际 Job 权限不符")
		}
		delete(trustees, sid)
	}
	var limits windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION
	if err := windows.QueryInformationJobObject(job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits)), nil); err != nil {
		return err
	}
	if len(trustees) != 0 || limits.BasicLimitInformation.LimitFlags != 0 {
		return errors.New("实际 Job containment 发生变化")
	}
	return nil
}

func processParents() (parents map[uint32]uint32, result error) {
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, err
	}
	defer func() { result = errors.Join(result, windows.CloseHandle(snapshot)) }()
	parents = map[uint32]uint32{}
	entry := windows.ProcessEntry32{Size: uint32(unsafe.Sizeof(windows.ProcessEntry32{}))}
	for err := windows.Process32First(snapshot, &entry); ; err = windows.Process32Next(snapshot, &entry) {
		if errors.Is(err, windows.ERROR_NO_MORE_FILES) {
			return parents, nil
		}
		if err != nil {
			return nil, err
		}
		parents[entry.ProcessID] = entry.ParentProcessID
	}
}

func perform(candidate, data, ownerFile, database, protected, inspectionFile string, helperOnly bool) (report map[string]any, result error) {
	report = map[string]any{"actual_exit": false}
	install, err := canonical(candidate)
	if err != nil {
		return report, err
	}
	data, err = canonical(data)
	if err != nil {
		return report, err
	}
	var envelope struct {
		OK     bool            `json:"ok"`
		Result controllerOwner `json:"result"`
	}
	if err := readJSON(ownerFile, &envelope); err != nil {
		return report, err
	}
	owner := envelope.Result
	if !envelope.OK || owner.Controller == "" || owner.Binding.PtyID == "" || owner.Binding.Incarnation == "" {
		return report, errors.New("真实控制端 owner 缺失")
	}
	var record struct {
		PID   uint32           `json:"pid"`
		Nonce string           `json:"launchNonce"`
		Job   serviceOwnership `json:"swa_service_job"`
	}
	pidFile, err := canonical(filepath.Join(data, "daemon", "daemon-v49.pid"))
	if err != nil {
		return report, err
	}
	if err := readJSON(pidFile, &record); err != nil {
		return report, err
	}
	body, err := os.ReadFile(filepath.Join(install, "VERSION"))
	if err != nil {
		return report, err
	}
	jobOwner := record.Job
	if !strings.HasPrefix(jobOwner.Name, `Local\SWAService`) || len(jobOwner.Name) > 256 || !samePath(jobOwner.Data, data) || !samePath(jobOwner.Install, install) || jobOwner.Revision != strings.TrimSpace(string(body)) || record.PID == 0 || jobOwner.DaemonPID != record.PID || jobOwner.Session == "" || jobOwner.Session != record.Nonce {
		return report, errors.New("实际 daemon 的安装、私有根或 Job 归属不符")
	}
	name, err := windows.UTF16PtrFromString(jobOwner.Name)
	if err != nil {
		return report, err
	}
	opened, _, callErr := windows.NewLazySystemDLL("kernel32.dll").NewProc("OpenJobObjectW").Call(uintptr(windows.READ_CONTROL|0x0004), 0, uintptr(unsafe.Pointer(name)))
	if opened == 0 {
		return report, callErr
	}
	job := windows.Handle(opened)
	defer func() { result = errors.Join(result, windows.CloseHandle(job)) }()
	if err := checkJob(job); err != nil {
		return report, err
	}
	protectedPIDs := map[uint32]bool{uint32(os.Getpid()): true}
	if protected == "" {
		return report, errors.New("原进程保护列表缺失")
	}
	for _, value := range strings.Split(protected, ",") {
		pid, err := strconv.ParseUint(value, 10, 32)
		if err != nil || pid == 0 {
			return report, errors.New("原进程保护列表无效")
		}
		protectedPIDs[uint32(pid)] = true
	}
	held := map[uint32]heldProcess{}
	defer func() {
		for _, process := range held {
			result = errors.Join(result, windows.CloseHandle(process.Handle))
		}
	}()
	openProcess := func(pid uint32, terminate bool) (heldProcess, error) {
		if process, exists := held[pid]; exists {
			return process, nil
		}
		if pid == 0 || protectedPIDs[pid] {
			return heldProcess{}, errors.New("目标与受保护进程重合")
		}
		rights := uint32(windows.SYNCHRONIZE | windows.PROCESS_QUERY_LIMITED_INFORMATION)
		if terminate {
			rights |= windows.PROCESS_TERMINATE
		}
		handle, err := windows.OpenProcess(rights, false, pid)
		if err != nil {
			return heldProcess{}, err
		}
		process := heldProcess{Handle: handle, PID: pid}
		held[pid] = process
		created, err := live(handle)
		if err != nil {
			return process, err
		}
		if err := member(job, handle); err != nil {
			return process, err
		}
		buffer := make([]uint16, 32768)
		size := uint32(len(buffer))
		if err := windows.QueryFullProcessImageName(handle, 0, &buffer[0], &size); err != nil {
			return process, err
		}
		process.Created, process.Image = created, windows.UTF16ToString(buffer[:size])
		held[pid] = process
		return process, nil
	}
	for _, expected := range []processIdentity{owner.Process, owner.Helper} {
		process, err := openProcess(expected.PID, !helperOnly || expected.PID == owner.Helper.PID)
		if err != nil || process.Created != expected.Created || !samePath(filepath.Base(process.Image), expected.Name) {
			return report, errors.Join(errors.New("所持目标句柄的创建身份或程序不符"), err)
		}
	}
	if owner.Process.PID == owner.Helper.PID || !samePath(held[owner.Helper.PID].Image, filepath.Join(install, "node", "node.exe")) {
		return report, errors.New("实际 helper 来源不属于同一安装")
	}
	daemon, err := openProcess(record.PID, false)
	if err != nil || daemon.Created != jobOwner.DaemonBirth || !samePath(daemon.Image, filepath.Join(install, "node", "node.exe")) {
		return report, errors.Join(errors.New("实际 daemon 创建身份或安装来源不符"), err)
	}
	started := time.Now().UTC()
	probeContext, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	command := exec.CommandContext(probeContext, filepath.Join(install, "node", "node.exe"), "--max-old-space-size=1024", filepath.Join(install, "runtime", "controller-inspection.cjs"), "--candidate", install, "--data-root", data, "--owner-file", ownerFile, "--database", database, "--output", inspectionFile)
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	for _, key := range []string{"SystemRoot", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "TEMP", "TMP", "ProgramFiles"} {
		if value := os.Getenv(key); value != "" {
			command.Env = append(command.Env, key+"="+value)
		}
	}
	command.Stderr = os.Stderr
	if err := command.Run(); err != nil {
		return report, err
	}
	var inspection struct {
		Observed time.Time        `json:"observed_at"`
		Job      serviceOwnership `json:"service_job"`
		Session  struct {
			ID          string `json:"sessionId"`
			Incarnation string `json:"incarnationId"`
			Controller  string `json:"terminalHandle"`
			PID         uint32 `json:"pid"`
			Alive       bool   `json:"isAlive"`
		} `json:"session"`
	}
	if err := readJSON(inspectionFile, &inspection); err != nil {
		return report, err
	}
	if inspection.Observed.Before(started) || time.Since(inspection.Observed) > 5*time.Second || inspection.Job != jobOwner || inspection.Session.ID != owner.Binding.PtyID || inspection.Session.Incarnation != owner.Binding.Incarnation || inspection.Session.Controller != owner.Controller || inspection.Session.PID != owner.Process.PID || !inspection.Session.Alive {
		return report, errors.New("新鲜 authenticated daemon PTY 或 incarnation 证明不符")
	}
	parents, err := processParents()
	if err != nil {
		return report, err
	}
	chains := [][]heldProcess{}
	for _, pair := range [][2]uint32{{owner.Helper.PID, owner.Process.PID}, {owner.Process.PID, record.PID}} {
		chain := []heldProcess{held[pair[0]]}
		seen := map[uint32]bool{pair[0]: true}
		for chain[len(chain)-1].PID != pair[1] {
			child := chain[len(chain)-1]
			pid := parents[child.PID]
			if pid == 0 || seen[pid] || len(chain) >= 128 {
				return report, errors.New("实际 helper、PTY root 与 daemon 父链不完整")
			}
			parent, err := openProcess(pid, false)
			if err != nil || parent.Created > child.Created {
				return report, errors.Join(errors.New("实际父进程创建顺序不符"), err)
			}
			seen[pid] = true
			chain = append(chain, parent)
		}
		chains = append(chains, chain)
	}
	for _, process := range held {
		rel, err := filepath.Rel(install, process.Image)
		private := err == nil && rel != "." && rel != ".." && !strings.HasPrefix(rel, `..\`) && !filepath.IsAbs(rel)
		systemRoot := os.Getenv("SystemRoot")
		allowed := private
		for _, source := range []string{filepath.Join(systemRoot, "System32", "cmd.exe"), filepath.Join(systemRoot, "System32", "conhost.exe"), filepath.Join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), filepath.Join(os.Getenv("ProgramFiles"), "PowerShell", "7", "pwsh.exe")} {
			allowed = allowed || samePath(process.Image, source)
		}
		created, err := live(process.Handle)
		if err != nil || created != process.Created || !allowed {
			return report, errors.Join(errors.New("所持父链或目标的安装来源与活身份不符"), err)
		}
		if err := member(job, process.Handle); err != nil {
			return report, err
		}
	}
	if time.Since(inspection.Observed) > 5*time.Second {
		return report, errors.New("实际 PTY 观察已过期")
	}
	report["controller"], report["service_job"], report["actual_held_chains"] = owner.Controller, jobOwner, chains
	report["actual_inspection_file"], report["protected_process_ids"] = inspectionFile, protected
	targets := []uint32{owner.Helper.PID}
	if !helperOnly {
		targets = append(targets, owner.Process.PID)
	}
	terminated := []uint32{}
	for _, pid := range targets {
		state, err := windows.WaitForSingleObject(held[pid].Handle, 0)
		if err != nil {
			return report, err
		}
		if state == windows.WAIT_OBJECT_0 {
			continue
		}
		if state != uint32(windows.WAIT_TIMEOUT) {
			return report, errors.New("所持目标句柄的终止前状态不明")
		}
		if err := windows.TerminateProcess(held[pid].Handle, 1); err != nil {
			return report, err
		}
		terminated = append(terminated, pid)
	}
	report["helper_only"], report["terminated_process_ids"] = helperOnly, terminated
	for _, pid := range []uint32{owner.Helper.PID, owner.Process.PID} {
		state, err := windows.WaitForSingleObject(held[pid].Handle, 10000)
		if err != nil || state != windows.WAIT_OBJECT_0 {
			return report, errors.Join(errors.New("实际所持目标句柄退出未确认"), err)
		}
	}
	report["actual_exit"] = true
	return report, nil
}

func main() {
	candidate := flag.String("candidate", "", "准确安装目录")
	data := flag.String("data-root", "", "实际私有根")
	owner := flag.String("owner-file", "", "真实 controller open 回执")
	database := flag.String("database", "", "真实原生 SQLite")
	protected := flag.String("protected-pids", "", "原进程保护列表")
	inspection := flag.String("inspection-output", "", "新鲜真实 daemon 观察")
	output := flag.String("output", "", "实际故障原件")
	serviceRequest := flag.String("service-request-file", "", "真实服务故障请求原件")
	helperOnly := flag.Bool("helper-only", false, "只终止所持helper句柄并等待原Shell实际退出")
	flag.Parse()
	var report map[string]any
	var err error
	if *serviceRequest != "" {
		if *candidate != "" || *data != "" || *owner != "" || *database != "" || *protected != "" || *inspection != "" || *helperOnly {
			fmt.Fprintln(os.Stderr, "服务故障请求与控制端故障参数不能同时提供")
			os.Exit(2)
		}
		report, err = performServiceFault(*serviceRequest)
	} else {
		report, err = perform(*candidate, *data, *owner, *database, *protected, *inspection, *helperOnly)
	}
	if err != nil {
		report["error"] = err.Error()
	}
	file, writeErr := os.OpenFile(*output, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if writeErr == nil {
		writeErr = errors.Join(json.NewEncoder(file).Encode(report), file.Close())
	}
	if err != nil || writeErr != nil {
		fmt.Fprintln(os.Stderr, errors.Join(err, writeErr))
		os.Exit(6)
	}
}
