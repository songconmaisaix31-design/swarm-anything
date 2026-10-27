package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

var errServiceOwnershipUnknown = errors.New("私有后台 Job 归属无法核验")
var errServiceAlreadyOwned = errors.New("私有数据目录已有所属服务")

// 固定 Orca v1.4.230 的 daemon-protocol-version.ts 定义为 49。
const serviceDaemonPIDFilename = "daemon-v49.pid"

type serviceJobOwnership struct {
	Name              string `json:"name"`
	Platform          string `json:"platform,omitempty"`
	ServePID          uint32 `json:"serve_pid"`
	ServeCreatedAtMS  uint64 `json:"serve_created_at_ms,omitempty"`
	ServeStartTicks   string `json:"serve_start_ticks,omitempty"`
	BootID            string `json:"boot_id,omitempty"`
	OwnerUID          string `json:"owner_uid,omitempty"`
	DataRoot          string `json:"data_root"`
	InstallRoot       string `json:"install_root"`
	SourceRevision    string `json:"source_revision"`
	DaemonPID         uint32 `json:"daemon_pid,omitempty"`
	DaemonCreatedAtMS uint64 `json:"daemon_created_at_ms,omitempty"`
	DaemonStartTicks  string `json:"daemon_start_ticks,omitempty"`
	DaemonSession     string `json:"daemon_session,omitempty"`
}

func sameServicePath(left, right string) bool {
	if runtime.GOOS == "windows" {
		return strings.EqualFold(left, right)
	}
	return left == right
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
	if err != nil || !sameServicePath(canonical, directory) {
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
		if err != nil || !sameServicePath(canonical, path) {
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
		if owner == nil || owner.ServePID == 0 || owner.DaemonPID != parsed.PID || parsed.StartedAtMS <= 0 || owner.DaemonSession != parsed.LaunchNonce || owner.SourceRevision != revision || !sameServicePath(owner.DataRoot, data) || !sameServicePath(owner.InstallRoot, install) {
			return nil, errServiceOwnershipUnknown
		}
		prefix := `Local\SWAService`
		if runtime.GOOS == "linux" {
			prefix = "SWAService"
			if owner.Platform != "linux" || owner.ServeStartTicks == "" || owner.DaemonStartTicks == "" || owner.BootID == "" || owner.OwnerUID == "" || owner.ServeCreatedAtMS != 0 || owner.DaemonCreatedAtMS != 0 || parsed.LinuxStartTicks != owner.DaemonStartTicks || parsed.BootID != owner.BootID {
				return nil, errServiceOwnershipUnknown
			}
			boot, err := uuid.Parse(owner.BootID)
			if err != nil || boot.String() != owner.BootID {
				return nil, errServiceOwnershipUnknown
			}
			for index, value := range []string{owner.ServeStartTicks, owner.DaemonStartTicks, owner.OwnerUID} {
				number, err := strconv.ParseUint(value, 10, 64)
				if err != nil || strconv.FormatUint(number, 10) != value || index < 2 && number == 0 {
					return nil, errServiceOwnershipUnknown
				}
			}
		} else if owner.Platform != "" || owner.ServeCreatedAtMS == 0 || owner.DaemonCreatedAtMS == 0 || owner.ServeStartTicks != "" || owner.DaemonStartTicks != "" || owner.BootID != "" || owner.OwnerUID != "" {
			return nil, errServiceOwnershipUnknown
		}
		id, err := uuid.Parse(strings.TrimPrefix(owner.Name, prefix))
		if err != nil || owner.Name != prefix+id.String() || parsed.LaunchNonce == "" {
			return nil, errServiceOwnershipUnknown
		}
		if !sameServicePath(filepath.Clean(parsed.EntryPath), filepath.Join(install, "runtime", "daemon-entry.js")) || !sameServicePath(filepath.Clean(parsed.SpawnerExecPath), filepath.Join(install, "node", serviceProgramName("node"))) {
			return nil, fmt.Errorf("%w: daemon 来源不属于同一安装候选", errServiceOwnershipUnknown)
		}
		record = &parsed
	}
	return record, nil
}
