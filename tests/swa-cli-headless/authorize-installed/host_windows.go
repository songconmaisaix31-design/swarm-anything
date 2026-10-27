package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

func checkHostRuntime() error {
	if runtime.GOOS != "windows" || runtime.GOARCH != "amd64" || runtime.Version() != requiredGo {
		return fail("reviewed_windows_go_required")
	}
	return nil
}

func hostPaths(p executionPackage) (hostPathSet, error) {
	revision, err := hex.DecodeString(p.Revision)
	if err != nil || len(revision) != 20 || strings.ToLower(p.Revision) != p.Revision {
		return hostPathSet{}, fail("exact_source_revision_required")
	}
	var label string
	switch p.Profile {
	case piN4Profile, openCodeN4Profile:
		label = "n4"
	case piN6Profile, openCodeN6Profile:
		label = "n6"
	case openCodeSingleProfile:
		label = "opencode-single"
	default:
		return hostPathSet{}, fail("reviewed_windows_profile_required")
	}
	temporary := os.Getenv("RUNNER_TEMP")
	if !filepath.IsAbs(temporary) {
		return hostPathSet{}, fail("windows_runner_temp_required")
	}
	temporary, err = filepath.EvalSymlinks(temporary)
	if err != nil {
		return hostPathSet{}, fail("windows_runner_temp_required")
	}
	if err := plain(temporary, true, false); err != nil {
		return hostPathSet{}, err
	}
	// owner 已独占创建 W；所有后继检查只读，不更改 runner 祖先权限。
	root := filepath.Join(temporary, "swa-n46-"+p.Revision)
	if err := plain(root, true, true); err != nil {
		return hostPathSet{}, err
	}
	return hostPathSet{
		node:     filepath.Join(p.Installation, "node", "node.exe"),
		swa:      filepath.Join(p.Installation, "swa.exe"),
		server:   filepath.Join(p.Installation, "server.exe"),
		platform: "win32-x64",
		project:  filepath.Join(root, "public", label, "public-project"),
	}, nil
}

func checkHostPathComponent(path string) error {
	name, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return fail("ordinary_path_required")
	}
	attributes, err := windows.GetFileAttributes(name)
	if err != nil || attributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
		return fail("ordinary_path_required")
	}
	return nil
}

func currentHostUser() (*windows.Tokenuser, error) {
	// GetCurrentProcessToken 返回伪句柄，读取用户即可，不关闭它。
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil || user == nil || user.User.Sid == nil || !user.User.Sid.IsValid() {
		return nil, fail("private_path_required")
	}
	return user, nil
}

func checkPrivateHandle(handle windows.Handle, user *windows.SID, directory bool) error {
	var information windows.ByHandleFileInformation
	if err := windows.GetFileInformationByHandle(handle, &information); err != nil {
		return fail("private_path_required")
	}
	if information.FileAttributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 || (information.FileAttributes&windows.FILE_ATTRIBUTE_DIRECTORY != 0) != directory {
		return fail("private_path_required")
	}
	descriptor, err := windows.GetSecurityInfo(handle, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
	if err != nil || descriptor == nil {
		return fail("private_path_required")
	}
	owner, _, err := descriptor.Owner()
	if err != nil || owner == nil || !owner.Equals(user) {
		return fail("private_path_required")
	}
	control, _, err := descriptor.Control()
	if err != nil || control&windows.SE_DACL_PROTECTED == 0 {
		return fail("private_path_required")
	}
	trustees := map[string]bool{user.String(): true, "S-1-5-18": true}
	acl, _, err := descriptor.DACL()
	if err != nil || acl == nil || int(acl.AceCount) != len(trustees) {
		return fail("private_path_required")
	}
	var inheritance byte
	if directory {
		inheritance = windows.OBJECT_INHERIT_ACE | windows.CONTAINER_INHERIT_ACE
	}
	for index := uint32(0); index < uint32(acl.AceCount); index++ {
		var ace *windows.ACCESS_ALLOWED_ACE
		if err := windows.GetAce(acl, index, &ace); err != nil {
			return fail("private_path_required")
		}
		if ace.Header.AceType != windows.ACCESS_ALLOWED_ACE_TYPE || ace.Header.AceFlags != inheritance || ace.Mask != 0x1f01ff {
			return fail("private_path_required")
		}
		sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart)).String()
		if !trustees[sid] {
			return fail("private_path_required")
		}
		delete(trustees, sid)
	}
	return require(len(trustees) == 0, "private_path_required")
}

func checkHostPrivatePath(path string, directory bool) (result error) {
	user, err := currentHostUser()
	if err != nil {
		return err
	}
	name, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return fail("private_path_required")
	}
	flags := uint32(windows.FILE_FLAG_OPEN_REPARSE_POINT)
	if directory {
		flags |= windows.FILE_FLAG_BACKUP_SEMANTICS
	}
	handle, err := windows.CreateFile(name, windows.READ_CONTROL|windows.FILE_READ_ATTRIBUTES,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE, nil, windows.OPEN_EXISTING, flags, 0)
	if err != nil {
		return fail("private_path_required")
	}
	defer func() { result = errors.Join(result, windows.CloseHandle(handle)) }()
	return checkPrivateHandle(handle, user.User.Sid, directory)
}

func privateHostDescriptor(user *windows.SID, directory bool) (*windows.SECURITY_DESCRIPTOR, error) {
	inheritance := ""
	if directory {
		inheritance = "OICI"
	}
	sid := user.String()
	sddl := "O:" + sid + "D:P(A;" + inheritance + ";FA;;;" + sid + ")"
	if sid != "S-1-5-18" {
		sddl += "(A;" + inheritance + ";FA;;;SY)"
	}
	return windows.SecurityDescriptorFromString(sddl)
}

func createHostPrivateFile(path string) (*os.File, error) {
	if err := plain(filepath.Dir(path), true, true); err != nil {
		return nil, err
	}
	user, err := currentHostUser()
	if err != nil {
		return nil, err
	}
	descriptor, err := privateHostDescriptor(user.User.Sid, false)
	if err != nil {
		return nil, err
	}
	name, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	attributes := windows.SecurityAttributes{Length: uint32(unsafe.Sizeof(windows.SecurityAttributes{})), SecurityDescriptor: descriptor}
	handle, err := windows.CreateFile(name, windows.GENERIC_WRITE|windows.READ_CONTROL|windows.FILE_READ_ATTRIBUTES,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE, &attributes, windows.CREATE_NEW,
		windows.FILE_ATTRIBUTE_NORMAL|windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	runtime.KeepAlive(descriptor)
	runtime.KeepAlive(user)
	if err != nil {
		return nil, err
	}
	if err := checkPrivateHandle(handle, user.User.Sid, false); err != nil {
		return nil, errors.Join(err, windows.CloseHandle(handle))
	}
	return os.NewFile(uintptr(handle), path), nil
}

func createHostPrivateDirectory(path string) error {
	if !filepath.IsAbs(path) || filepath.Clean(path) != path {
		return fail("absolute_canonical_path_required")
	}
	if err := plain(filepath.Dir(path), true, false); err != nil {
		return err
	}
	user, err := currentHostUser()
	if err != nil {
		return err
	}
	descriptor, err := privateHostDescriptor(user.User.Sid, true)
	if err != nil {
		return err
	}
	name, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	attributes := windows.SecurityAttributes{Length: uint32(unsafe.Sizeof(windows.SecurityAttributes{})), SecurityDescriptor: descriptor}
	err = windows.CreateDirectory(name, &attributes)
	runtime.KeepAlive(descriptor)
	runtime.KeepAlive(user)
	if err != nil {
		return err
	}
	return plain(path, true, true)
}

func childEnvironment(home string) []string {
	return []string{
		"PATH=" + os.Getenv("PATH"), "SystemRoot=" + os.Getenv("SystemRoot"),
		"WINDIR=" + os.Getenv("WINDIR"), "RUNNER_TEMP=" + os.Getenv("RUNNER_TEMP"),
		"HOME=" + home, "USERPROFILE=" + home, "TEMP=" + home, "TMP=" + home,
		"LANG=C.UTF-8", "LC_ALL=C.UTF-8", "GIT_TERMINAL_PROMPT=0", "GIT_OPTIONAL_LOCKS=0",
	}
}

func bindHostConsumer(p *executionPackage, prepare bool) error {
	relative := "tests/swa-cli-headless/authorize-installed/windows-host.mjs"
	path := filepath.Join(p.SourceRepository, filepath.FromSlash(relative))
	if err := bindHash(path, &p.HostConsumerSHA, prepare); err != nil {
		return err
	}
	return gitSource(*p, relative, path)
}

func checkInheritedDaemonHandle(handle windows.Handle, user *windows.SID, directory bool) error {
	var information windows.ByHandleFileInformation
	if err := windows.GetFileInformationByHandle(handle, &information); err != nil {
		return fail("daemon_record_permissions_unavailable")
	}
	if information.FileAttributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 || (information.FileAttributes&windows.FILE_ATTRIBUTE_DIRECTORY != 0) != directory || !directory && information.NumberOfLinks != 1 {
		return fail("daemon_record_identity_invalid")
	}
	descriptor, err := windows.GetSecurityInfo(handle, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
	if err != nil || descriptor == nil {
		return fail("daemon_record_permissions_unavailable")
	}
	owner, _, err := descriptor.Owner()
	if err != nil || owner == nil || !owner.Equals(user) {
		return fail("daemon_record_permissions_invalid")
	}
	control, _, err := descriptor.Control()
	if err != nil || control&windows.SE_DACL_PROTECTED != 0 {
		return fail("daemon_record_permissions_invalid")
	}
	trustees := map[string]bool{user.String(): true, "S-1-5-18": true}
	acl, _, err := descriptor.DACL()
	if err != nil || acl == nil || int(acl.AceCount) != len(trustees) {
		return fail("daemon_record_permissions_invalid")
	}
	inheritance := byte(windows.INHERITED_ACE)
	if directory {
		inheritance |= windows.OBJECT_INHERIT_ACE | windows.CONTAINER_INHERIT_ACE
	}
	for index := uint32(0); index < uint32(acl.AceCount); index++ {
		var ace *windows.ACCESS_ALLOWED_ACE
		if err := windows.GetAce(acl, index, &ace); err != nil {
			return fail("daemon_record_permissions_unavailable")
		}
		if ace.Header.AceType != windows.ACCESS_ALLOWED_ACE_TYPE || ace.Header.AceFlags != inheritance || ace.Mask != 0x1f01ff {
			return fail("daemon_record_permissions_invalid")
		}
		sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart)).String()
		if !trustees[sid] {
			return fail("daemon_record_permissions_invalid")
		}
		delete(trustees, sid)
	}
	return require(len(trustees) == 0, "daemon_record_permissions_invalid")
}

func sameWindowsFile(left, right windows.ByHandleFileInformation) bool {
	return left.VolumeSerialNumber == right.VolumeSerialNumber && left.FileIndexHigh == right.FileIndexHigh && left.FileIndexLow == right.FileIndexLow
}

func daemonRecordDigest(file *os.File, handle windows.Handle, user *windows.SID) (string, error) {
	if err := checkInheritedDaemonHandle(handle, user, false); err != nil {
		return "", err
	}
	var before, after windows.ByHandleFileInformation
	if err := windows.GetFileInformationByHandle(handle, &before); err != nil {
		return "", err
	}
	if before.FileSizeHigh != 0 || before.FileSizeLow == 0 || before.FileSizeLow > 1<<20 {
		return "", fail("bounded_daemon_record_required")
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return "", err
	}
	body, err := io.ReadAll(io.LimitReader(file, (1<<20)+1))
	if err != nil {
		return "", err
	}
	if err := windows.GetFileInformationByHandle(handle, &after); err != nil {
		return "", err
	}
	if !sameWindowsFile(before, after) || before.LastWriteTime != after.LastWriteTime || before.FileSizeHigh != after.FileSizeHigh || before.FileSizeLow != after.FileSizeLow || after.NumberOfLinks != 1 || len(body) != int(before.FileSizeLow) {
		return "", fail("daemon_record_changed_during_read")
	}
	if err := checkInheritedDaemonHandle(handle, user, false); err != nil {
		return "", err
	}
	return hashBytes(body), nil
}

func runWindowsServiceConsumer(p executionPackage, paths hostPathSet, consumer string, input map[string]any) (body []byte, result error) {
	user, err := currentHostUser()
	if err != nil {
		return nil, err
	}
	names := [3]string{p.DataRoot, filepath.Join(p.DataRoot, "daemon"), filepath.Join(p.DataRoot, "daemon", "daemon-v49.pid")}
	var handles [3]windows.Handle
	var identities [3]windows.ByHandleFileInformation
	var record *os.File
	for index, path := range names {
		if err := plain(path, index != 2, index == 0); err != nil {
			return nil, err
		}
		name, err := windows.UTF16PtrFromString(path)
		if err != nil {
			return nil, err
		}
		access := uint32(windows.READ_CONTROL | windows.FILE_READ_ATTRIBUTES)
		flags := uint32(windows.FILE_FLAG_OPEN_REPARSE_POINT)
		if index == 2 {
			access |= windows.GENERIC_READ
		} else {
			flags |= windows.FILE_FLAG_BACKUP_SEMANTICS
		}
		handle, err := windows.CreateFile(name, access, windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE, nil, windows.OPEN_EXISTING, flags, 0)
		if err != nil {
			return nil, err
		}
		handles[index] = handle
		// 不共享 DELETE，三个实际对象保持至 Node 与后核完成；仍允许原 producer 写入。
		if index == 2 {
			record = os.NewFile(uintptr(handle), path)
			defer func() { result = errors.Join(result, record.Close()) }()
		} else {
			defer func(actual windows.Handle) { result = errors.Join(result, windows.CloseHandle(actual)) }(handle)
		}
		if index == 0 {
			err = checkPrivateHandle(handle, user.User.Sid, true)
		} else {
			err = checkInheritedDaemonHandle(handle, user.User.Sid, index == 1)
		}
		if err != nil {
			return nil, err
		}
		if err := windows.GetFileInformationByHandle(handle, &identities[index]); err != nil {
			return nil, err
		}
	}
	digest, err := daemonRecordDigest(record, handles[2], user.User.Sid)
	if err != nil {
		return nil, err
	}
	input["daemon_sha256"] = digest
	encoded, err := json.Marshal(input)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, paths.node, consumer)
	command.Env = childEnvironment(p.EvidenceRoot)
	command.Stdin = bytes.NewReader(encoded)
	body, childErr := runBounded(command, 64<<10, 64<<10)
	if childErr != nil {
		childErr = fail("actual_service_identity_unavailable")
	}
	verifyErr := func() error {
		for index, handle := range handles {
			var actual windows.ByHandleFileInformation
			if err := windows.GetFileInformationByHandle(handle, &actual); err != nil {
				return err
			}
			if !sameWindowsFile(actual, identities[index]) {
				return fail("daemon_record_identity_changed")
			}
			if index == 0 {
				err = checkPrivateHandle(handle, user.User.Sid, true)
			} else {
				err = checkInheritedDaemonHandle(handle, user.User.Sid, index == 1)
			}
			if err != nil {
				return err
			}
			if err := plain(names[index], index != 2, index == 0); err != nil {
				return err
			}
		}
		after, err := daemonRecordDigest(record, handles[2], user.User.Sid)
		if err != nil {
			return err
		}
		return require(after == digest, "daemon_record_changed_during_observation")
	}()
	return body, errors.Join(childErr, verifyErr)
}

func serviceIdentity(p executionPackage) (string, error) {
	scope, err := fixedProfile(p)
	if err != nil || scope.sourceHome == "" {
		return "", fail("fixed_service_source_required")
	}
	paths, err := hostPaths(p)
	if err != nil {
		return "", err
	}
	if p.ExpectedRuntimeID == "" || p.ReadySHA == "" || p.ProofSHA == "" || p.LaunchSHA == "" || p.HostConsumerSHA == "" || p.NodeSHA == "" {
		return "", fail("fixed_service_baseline_required")
	}
	if scope.agent == "opencode" {
		if err := openCodeOwnerLayout(p); err != nil {
			return "", err
		}
	}
	for _, entry := range []struct{ path, hash string }{{p.ReadyFile, p.ReadySHA}, {p.ProofFile, p.ProofSHA}, {p.LaunchFile, p.LaunchSHA}} {
		if err := plain(entry.path, false, true); err != nil {
			return "", err
		}
		if err := bindHash(entry.path, &entry.hash, false); err != nil {
			return "", err
		}
	}
	consumer := filepath.Join(p.SourceRepository, "tests", "swa-cli-headless", "authorize-installed", "windows-host.mjs")
	if err := bindHash(consumer, &p.HostConsumerSHA, false); err != nil {
		return "", err
	}
	if err := bindHash(paths.node, &p.NodeSHA, false); err != nil {
		return "", err
	}
	input := map[string]any{
		"installation": p.Installation, "source_revision": p.Revision, "data_root": p.DataRoot,
		"endpoint": p.Endpoint, "expected_runtime_id": p.ExpectedRuntimeID,
		"agent": scope.agent, "source_home": scope.sourceHome,
		"ready_file": p.ReadyFile, "ready_sha256": p.ReadySHA,
		"proof_file": p.ProofFile, "proof_sha256": p.ProofSHA,
		"launch_file": p.LaunchFile, "launch_sha256": p.LaunchSHA,
	}
	body, err := runWindowsServiceConsumer(p, paths, consumer, input)
	if err != nil {
		return "", err
	}
	var observed windowsServiceProof
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&observed); err != nil || !observed.matches(p) {
		return "", fail("actual_service_identity_mismatch")
	}
	if decoder.Decode(new(any)) != io.EOF {
		return "", fail("actual_service_identity_mismatch")
	}
	return observed.RuntimeID, nil
}

type windowsServiceProof struct {
	Source    string `json:"source_revision"`
	RuntimeID string `json:"runtime_id"`
	Data      string `json:"data_root"`
	Health    struct {
		Schema  int    `json:"schema_version"`
		Status  string `json:"status"`
		Service string `json:"service"`
	} `json:"health"`
	Job     string `json:"service_job_name"`
	Members []struct {
		Role   string `json:"role"`
		PID    uint32 `json:"pid"`
		Birth  uint64 `json:"creation_time_ms"`
		Name   string `json:"name"`
		Parent uint32 `json:"parent_pid"`
		Member bool   `json:"actual_named_job_membership"`
	} `json:"members"`
	Verified bool   `json:"job_owner_and_dacl_verified"`
	Observed string `json:"observed_at"`
}

func (proof windowsServiceProof) matches(p executionPackage) bool {
	if proof.Source != p.Revision || proof.RuntimeID != p.ExpectedRuntimeID || proof.Data != p.DataRoot || !proof.Verified || proof.Health.Schema != 1 || proof.Health.Status != "ok" || proof.Health.Service != "astrocyte" || !strings.HasPrefix(proof.Job, `Local\SWAService`) || len(proof.Members) != 4 {
		return false
	}
	if _, err := time.Parse(time.RFC3339Nano, proof.Observed); err != nil {
		return false
	}
	roles := map[string]string{"serve": "swa.exe", "runtime": "node.exe", "server": "server.exe", "daemon": "node.exe"}
	seen := map[uint32]bool{}
	for _, member := range proof.Members {
		name, exists := roles[member.Role]
		if !exists || member.PID == 0 || member.Birth == 0 || seen[member.PID] || !member.Member || !strings.EqualFold(member.Name, name) {
			return false
		}
		seen[member.PID] = true
		delete(roles, member.Role)
	}
	return len(roles) == 0
}
