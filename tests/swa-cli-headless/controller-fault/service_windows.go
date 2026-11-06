package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

type actualServiceFault struct {
	Action         string          `json:"action"`
	Candidate      string          `json:"candidate"`
	DataRoot       string          `json:"data_root"`
	Database       string          `json:"database"`
	OwnerFile      string          `json:"owner_file"`
	ReadinessFile  string          `json:"readiness_file"`
	Inspection     string          `json:"inspection_output"`
	InspectionMode string          `json:"inspection_mode,omitempty"`
	Root           processIdentity `json:"actual_serve_process"`
	ProtectedPIDs  []uint32        `json:"protected_process_ids"`
}

func performServiceFault(requestFile string) (report map[string]any, result error) {
	report = map[string]any{"actual_targets_exited": false, "same_daemon_preserved": false}
	var request actualServiceFault
	if err := readJSON(requestFile, &request); err != nil {
		return report, err
	}
	install, err := canonical(request.Candidate)
	if err != nil {
		return report, err
	}
	data, err := canonical(request.DataRoot)
	if err != nil {
		return report, err
	}
	if (request.Action != "observe" && request.Action != "stop-service" && request.Action != "stop-http") || !filepath.IsAbs(request.Inspection) || len(request.ProtectedPIDs) == 0 || request.Root.PID == 0 || request.Root.Created == 0 || !samePath(request.Root.Name, "swa.exe") {
		return report, errors.New("实际根创建身份、保护列表或原件路径缺失")
	}
	switch request.InspectionMode {
	case "", "live":
		if !filepath.IsAbs(request.OwnerFile) {
			return report, errors.New("live检查需要真实owner-file")
		}
	case "historical-owner":
		if request.Action != "stop-http" || !filepath.IsAbs(request.OwnerFile) {
			return report, errors.New("历史检查只接受stop-http及真实owner-file")
		}
	case "idle":
		if request.Action != "stop-http" || request.OwnerFile != "" {
			return report, errors.New("空闲检查只接受stop-http且不得提供owner-file")
		}
	default:
		return report, errors.New("实际检查模式无效")
	}
	database, err := canonical(request.Database)
	if err != nil {
		return report, err
	}
	expectedDatabase, err := canonical(filepath.Join(data, "orchestration.db"))
	if err != nil {
		return report, err
	}
	if !samePath(database, expectedDatabase) {
		return report, errors.New("实际orchestration.db不能由同根其他SQLite替代")
	}
	request.Database = database
	var readiness struct {
		OK          bool   `json:"ok"`
		Install     string `json:"install_root"`
		Data        string `json:"data_root"`
		HostPID     uint32 `json:"runtime_pid"`
		ServerPID   uint32 `json:"server_pid"`
		NativeReady struct {
			RuntimeID string `json:"runtimeId"`
			DataRoot  string `json:"dataRoot"`
			Node      string `json:"node"`
		} `json:"readiness"`
	}
	if err := readJSON(request.ReadinessFile, &readiness); err != nil {
		return report, err
	}
	var metadata struct {
		RuntimeID string `json:"runtimeId"`
		PID       uint32 `json:"pid"`
	}
	metadataFile, err := canonical(filepath.Join(data, "orca-runtime.json"))
	if err != nil {
		return report, err
	}
	if err := readJSON(metadataFile, &metadata); err != nil {
		return report, err
	}
	if !readiness.OK || !samePath(readiness.Install, install) || !samePath(readiness.Data, data) || !samePath(readiness.NativeReady.DataRoot, data) || !samePath(readiness.NativeReady.Node, filepath.Join(install, "node", "node.exe")) || readiness.HostPID == 0 || readiness.ServerPID == 0 || metadata.PID != readiness.HostPID || metadata.RuntimeID == "" || metadata.RuntimeID != readiness.NativeReady.RuntimeID {
		return report, errors.New("真实readiness与原生metadata的安装、私有根、PID或runtime不符")
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
	version, err := os.ReadFile(filepath.Join(install, "VERSION"))
	if err != nil {
		return report, err
	}
	ownership := record.Job
	if !strings.HasPrefix(ownership.Name, `Local\SWAService`) || len(ownership.Name) > 256 || !samePath(ownership.Data, data) || !samePath(ownership.Install, install) || ownership.Revision != strings.TrimSpace(string(version)) || record.PID == 0 || ownership.DaemonPID != record.PID || ownership.Session == "" || ownership.Session != record.Nonce {
		return report, errors.New("实际daemon PID record和具名Job来源不符")
	}
	name, err := windows.UTF16PtrFromString(ownership.Name)
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
	protected := map[uint32]bool{uint32(os.Getpid()): true, record.PID: true}
	for _, pid := range request.ProtectedPIDs {
		if pid == 0 {
			return report, errors.New("实际保护PID不合法")
		}
		protected[pid] = true
	}
	held := map[uint32]heldProcess{}
	defer func() {
		for _, process := range held {
			result = errors.Join(result, windows.CloseHandle(process.Handle))
		}
	}()
	for _, expected := range []struct {
		PID       uint32
		Image     string
		Terminate bool
	}{{record.PID, filepath.Join(install, "node", "node.exe"), false}, {request.Root.PID, filepath.Join(install, "swa.exe"), true}, {readiness.HostPID, filepath.Join(install, "node", "node.exe"), true}, {readiness.ServerPID, filepath.Join(install, "server.exe"), true}} {
		if expected.PID == 0 || (expected.Terminate && protected[expected.PID]) {
			return report, errors.New("实际故障目标与原进程或daemon重合")
		}
		if _, exists := held[expected.PID]; exists {
			return report, errors.New("实际根、host、server或daemon PID重复")
		}
		rights := uint32(windows.SYNCHRONIZE | windows.PROCESS_QUERY_LIMITED_INFORMATION)
		if expected.Terminate && request.Action == "stop-service" || expected.PID == readiness.ServerPID && request.Action == "stop-http" {
			rights |= windows.PROCESS_TERMINATE
		}
		handle, err := windows.OpenProcess(rights, false, expected.PID)
		if err != nil {
			return report, err
		}
		process := heldProcess{Handle: handle, PID: expected.PID}
		held[expected.PID] = process
		created, err := live(handle)
		if err != nil {
			return report, err
		}
		buffer := make([]uint16, 32768)
		size := uint32(len(buffer))
		if err := windows.QueryFullProcessImageName(handle, 0, &buffer[0], &size); err != nil {
			return report, err
		}
		process.Created, process.Image = created, windows.UTF16ToString(buffer[:size])
		held[expected.PID] = process
		if !samePath(process.Image, expected.Image) {
			return report, errors.New("实际持有进程的完整安装路径不符")
		}
		if err := member(job, handle); err != nil {
			return report, err
		}
	}
	if held[request.Root.PID].Created != request.Root.Created || held[record.PID].Created != ownership.DaemonBirth {
		return report, errors.New("实际根或daemon创建身份不符")
	}
	parents, err := processParents()
	if err != nil {
		return report, err
	}
	for _, pid := range []uint32{readiness.HostPID, readiness.ServerPID} {
		if parents[pid] != request.Root.PID || held[pid].Created < held[request.Root.PID].Created {
			return report, errors.New("实际host/server父链或创建顺序不符")
		}
	}
	started := time.Now().UTC()
	probeContext, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	probeArgs := []string{filepath.Join(install, "runtime", "controller-inspection.cjs"), "--candidate", install, "--data-root", data, "--database", request.Database, "--output", request.Inspection}
	if request.InspectionMode == "idle" {
		probeArgs = append(probeArgs, "--idle-only")
	} else {
		probeArgs = append(probeArgs, "--owner-file", request.OwnerFile)
		if request.InspectionMode == "historical-owner" {
			probeArgs = append(probeArgs, "--historical-owner")
		}
	}
	probe := exec.CommandContext(probeContext, filepath.Join(install, "node", "node.exe"), probeArgs...)
	probe.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	for _, key := range []string{"SystemRoot", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "TEMP", "TMP", "ProgramFiles"} {
		if value := os.Getenv(key); value != "" {
			probe.Env = append(probe.Env, key+"="+value)
		}
	}
	probe.Stderr = os.Stderr
	if err := probe.Run(); err != nil {
		return report, err
	}
	var inspection struct {
		Observed   time.Time        `json:"observed_at"`
		Job        serviceOwnership `json:"service_job"`
		OwnerState string           `json:"owner_state"`
	}
	if err := readJSON(request.Inspection, &inspection); err != nil {
		return report, err
	}
	if inspection.Observed.Before(started) || time.Since(inspection.Observed) > 5*time.Second || inspection.Job != ownership {
		return report, errors.New("原DaemonClient真实观察的时间或Job来源不符")
	}
	validState := inspection.OwnerState == "live"
	if request.InspectionMode == "historical-owner" {
		validState = inspection.OwnerState == "historical" || inspection.OwnerState == "absent"
	}
	if request.InspectionMode == "idle" {
		validState = inspection.OwnerState == "idle"
	}
	if !validState {
		return report, errors.New("实际原生观察与请求检查模式不符")
	}
	for _, process := range held {
		created, err := live(process.Handle)
		if err != nil || created != process.Created {
			return report, errors.Join(errors.New("故障前同句柄的实际创建身份发生变化"), err)
		}
		if err := member(job, process.Handle); err != nil {
			return report, err
		}
	}
	report["source_revision"], report["runtime_id"], report["service_job"] = ownership.Revision, metadata.RuntimeID, ownership
	report["actual_held_processes"], report["actual_inspection_file"] = held, request.Inspection
	report["protected_process_ids"] = request.ProtectedPIDs
	report["actual_action"] = request.Action
	report["actual_inspection_mode"], report["actual_owner_state"] = request.InspectionMode, inspection.OwnerState
	if request.Action == "observe" {
		report["same_daemon_preserved"] = true
		return report, nil
	}
	report["actual_fault_started_at"] = time.Now().UTC()
	targets := []uint32{readiness.HostPID, readiness.ServerPID, request.Root.PID}
	if request.Action == "stop-http" {
		targets = []uint32{readiness.ServerPID}
	}
	report["actual_termination_targets"] = targets
	for _, pid := range targets {
		state, err := windows.WaitForSingleObject(held[pid].Handle, 0)
		if err != nil {
			return report, err
		}
		if state == windows.WAIT_OBJECT_0 {
			continue
		}
		if state != uint32(windows.WAIT_TIMEOUT) {
			return report, errors.New("实际故障目标状态未知")
		}
		if err := windows.TerminateProcess(held[pid].Handle, 1); err != nil {
			return report, err
		}
	}
	for _, pid := range targets {
		state, err := windows.WaitForSingleObject(held[pid].Handle, 10000)
		if err != nil || state != windows.WAIT_OBJECT_0 {
			return report, errors.Join(errors.New("实际服务目标未由相同句柄确认退出"), err)
		}
	}
	report["actual_targets_exited"] = true
	report["actual_targets_exited_at"] = time.Now().UTC()
	if request.Action == "stop-http" {
		report["actual_daemon_state"] = "unknown"
		report["actual_daemon_observed_at"] = time.Now().UTC()
		state, err := windows.WaitForSingleObject(held[record.PID].Handle, 0)
		if err != nil {
			return report, err
		}
		switch state {
		case windows.WAIT_OBJECT_0:
			report["actual_daemon_state"] = "exited"
		case uint32(windows.WAIT_TIMEOUT):
			report["actual_daemon_state"] = "alive"
			report["same_daemon_preserved"] = true
		default:
			return report, errors.New("HTTP故障后的原daemon同句柄状态未知")
		}
		return report, nil
	}
	created, err := live(held[record.PID].Handle)
	if err != nil || created != ownership.DaemonBirth {
		return report, errors.Join(fmt.Errorf("原daemon在实际服务故障后未保持同一活身份: pid=%d", record.PID), err)
	}
	if err := member(job, held[record.PID].Handle); err != nil {
		return report, err
	}
	report["same_daemon_preserved"] = true
	return report, nil
}
