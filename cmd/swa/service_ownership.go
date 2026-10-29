package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

var errServiceOwnershipUnknown = errors.New("私有后台 Job 归属无法核验")

// 固定 Orca v1.4.230 的 daemon-protocol-version.ts 定义为 49。
const serviceDaemonPIDFilename = "daemon-v49.pid"

type serviceJobOwnership struct {
	Name              string `json:"name"`
	ServePID          uint32 `json:"serve_pid"`
	ServeCreatedAtMS  uint64 `json:"serve_created_at_ms"`
	WindowsSessionID  uint32 `json:"windows_session_id,omitempty"`
	DataRoot          string `json:"data_root"`
	InstallRoot       string `json:"install_root"`
	SourceRevision    string `json:"source_revision"`
	DaemonPID         uint32 `json:"daemon_pid,omitempty"`
	DaemonCreatedAtMS uint64 `json:"daemon_created_at_ms,omitempty"`
	DaemonSession     string `json:"daemon_session,omitempty"`
}

type serviceDaemonRecord struct {
	PID             uint32               `json:"pid"`
	StartedAtMS     float64              `json:"startedAtMs"`
	EntryPath       string               `json:"entryPath"`
	AppVersion      string               `json:"appVersion"`
	LaunchNonce     string               `json:"launchNonce"`
	LinuxStartTicks string               `json:"linuxStartTicks"`
	BootID          string               `json:"bootId"`
	SpawnerExecPath string               `json:"spawnerExecPath"`
	CgroupUnit      *string              `json:"cgroupUnit"`
	ProcessCeiling  json.RawMessage      `json:"processCeiling"`
	ServiceJob      *serviceJobOwnership `json:"swa_service_job"`
}

func readServiceDaemonRecord(data, install, revision string) (*serviceDaemonRecord, error) {
	directory := filepath.Join(data, "daemon")
	entries, err := os.ReadDir(directory)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, errors.Join(errServiceOwnershipUnknown, err)
	}
	canonical, err := filepath.EvalSymlinks(directory)
	if err != nil || !strings.EqualFold(canonical, directory) {
		return nil, errors.Join(errServiceOwnershipUnknown, err)
	}
	var record *serviceDaemonRecord
	for _, entry := range entries {
		matched, err := filepath.Match("daemon-v*.pid", entry.Name())
		if err != nil {
			return nil, errors.Join(errServiceOwnershipUnknown, err)
		}
		if !matched {
			continue
		}
		if entry.Name() != serviceDaemonPIDFilename {
			return nil, fmt.Errorf("%w: daemon 协议版本不属于固定来源", errServiceOwnershipUnknown)
		}
		if record != nil || entry.IsDir() || entry.Type()&os.ModeSymlink != 0 {
			return nil, errServiceOwnershipUnknown
		}
		path := filepath.Join(directory, entry.Name())
		canonical, err := filepath.EvalSymlinks(path)
		if err != nil || !strings.EqualFold(canonical, path) {
			return nil, errors.Join(errServiceOwnershipUnknown, err)
		}
		body, err := os.ReadFile(path)
		if err != nil {
			return nil, errors.Join(errServiceOwnershipUnknown, err)
		}
		var parsed serviceDaemonRecord
		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&parsed); err != nil {
			return nil, errors.Join(errServiceOwnershipUnknown, err)
		}
		if err := decoder.Decode(&struct{}{}); err != io.EOF {
			return nil, errServiceOwnershipUnknown
		}
		owner := parsed.ServiceJob
		if owner == nil || owner.ServePID == 0 || owner.ServeCreatedAtMS == 0 || owner.DaemonPID != parsed.PID || owner.DaemonCreatedAtMS == 0 || parsed.StartedAtMS <= 0 || owner.DaemonSession != parsed.LaunchNonce || owner.SourceRevision != revision || !strings.EqualFold(owner.DataRoot, data) || !strings.EqualFold(owner.InstallRoot, install) {
			return nil, errServiceOwnershipUnknown
		}
		const prefix = `Local\SWAService`
		id, err := uuid.Parse(strings.TrimPrefix(owner.Name, prefix))
		if err != nil || owner.Name != prefix+id.String() || parsed.LaunchNonce == "" {
			return nil, errServiceOwnershipUnknown
		}
		if !strings.EqualFold(filepath.Clean(parsed.EntryPath), filepath.Join(install, "runtime", "daemon-entry.js")) || !strings.EqualFold(filepath.Clean(parsed.SpawnerExecPath), filepath.Join(install, "node", "node.exe")) {
			return nil, fmt.Errorf("%w: daemon 来源不属于同一安装候选", errServiceOwnershipUnknown)
		}
		record = &parsed
	}
	return record, nil
}
