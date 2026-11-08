package main

import (
	"bytes"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"syscall"
	"testing"
	"unsafe"

	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/projectfiles"
	"golang.org/x/sys/windows"
)

type privateDirectoryObservation struct {
	fileID   [3]uint32
	security string
}

func observeTestDirectory(t *testing.T, path string) privateDirectoryObservation {
	t.Helper()
	name, err := windows.UTF16PtrFromString(path)
	if err != nil {
		t.Fatal("测试目录名称无法转换")
	}
	handle, err := windows.CreateFile(name, windows.READ_CONTROL|windows.FILE_READ_ATTRIBUTES,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE, nil, windows.OPEN_EXISTING,
		windows.FILE_FLAG_BACKUP_SEMANTICS|windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if err != nil {
		t.Fatal("无法读取实际测试目录句柄")
	}
	var information windows.ByHandleFileInformation
	if err := windows.GetFileInformationByHandle(handle, &information); err != nil {
		_ = windows.CloseHandle(handle)
		t.Fatal("实际目录 FileId 不可用")
	}
	if err := windows.CloseHandle(handle); err != nil {
		t.Fatal("实际目录观察句柄关闭失败")
	}
	descriptor, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
	if err != nil || descriptor == nil {
		t.Fatal("实际测试目录安全描述符不可用")
	}
	return privateDirectoryObservation{fileID: [3]uint32{information.VolumeSerialNumber, information.FileIndexHigh, information.FileIndexLow}, security: descriptor.String()}
}

func assertTestPrivateDirectory(t *testing.T, path string, user *windows.SID) {
	t.Helper()
	descriptor, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
	if err != nil || descriptor == nil {
		t.Fatal("真实新目录安全读取失败")
	}
	owner, _, err := descriptor.Owner()
	if err != nil || owner == nil || !owner.Equals(user) {
		t.Fatal("真实新目录 owner 不匹配当前用户")
	}
	control, _, err := descriptor.Control()
	if err != nil || control&windows.SE_DACL_PROTECTED == 0 {
		t.Fatal("真实新目录 DACL 未保护")
	}
	trustees := map[string]bool{user.String(): true, "S-1-5-18": true}
	acl, _, err := descriptor.DACL()
	if err != nil || acl == nil || int(acl.AceCount) != len(trustees) {
		t.Fatal("真实新目录 ACE 数量不匹配")
	}
	for index := uint32(0); index < uint32(acl.AceCount); index++ {
		var ace *windows.ACCESS_ALLOWED_ACE
		if windows.GetAce(acl, index, &ace) != nil || ace.Header.AceType != windows.ACCESS_ALLOWED_ACE_TYPE || ace.Header.AceFlags != 3 || ace.Mask != 0x1f01ff {
			t.Fatal("真实新目录 ACE 权限不匹配")
		}
		sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart)).String()
		if !trustees[sid] {
			t.Fatal("真实新目录包含额外或重复主体")
		}
		delete(trustees, sid)
	}
	if len(trustees) != 0 {
		t.Fatal("真实新目录缺少必要主体")
	}
}

func createTestDirectorySecurity(path, owner, user, extra string) error {
	acl := "O:" + owner + "D:P(A;OICI;FA;;;" + user + ")"
	if user != "S-1-5-18" {
		acl += "(A;OICI;FA;;;SY)"
	}
	acl += extra
	descriptor, err := windows.SecurityDescriptorFromString(acl)
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
	return err
}

func TestWindowsPrivateDataDirectory(t *testing.T) {
	base := t.TempDir()
	install, protected := filepath.Join(base, "install"), filepath.Join(base, "protected")
	for _, path := range []string{install, protected} {
		if err := os.Mkdir(path, 0o700); err != nil {
			t.Fatal("无法创建公开路径边界夹具")
		}
	}
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil || user == nil || user.User.Sid == nil {
		t.Fatal("真实当前 TokenUser 不可用")
	}
	call := func(path string) (string, error) { return privateDataDirectory(path, install, []string{protected}) }
	t.Run("fresh_nested_and_existing_private", func(t *testing.T) {
		first, target := filepath.Join(base, "fresh"), filepath.Join(base, "fresh", "data")
		actual, err := call(target)
		if err != nil {
			t.Fatal("真实多级私有目录创建失败")
		}
		canonical, err := projectfiles.CanonicalRoot(target)
		if err != nil || !sameServicePath(actual, canonical) {
			t.Fatal("真实多级私有目录未返回目标的规范路径")
		}
		assertTestPrivateDirectory(t, first, user.User.Sid)
		assertTestPrivateDirectory(t, target, user.User.Sid)
		content := []byte("ordinary public directory control\n")
		if err := os.WriteFile(filepath.Join(target, "public.txt"), content, 0o600); err != nil {
			t.Fatal("真实公开控制文件创建失败")
		}
		before := observeTestDirectory(t, target)
		if _, err := call(target); err != nil {
			t.Fatal("合法现存私有目录未被接受")
		}
		after := observeTestDirectory(t, target)
		actualContent, err := os.ReadFile(filepath.Join(target, "public.txt"))
		if err != nil || !bytes.Equal(actualContent, content) || !reflect.DeepEqual(before, after) {
			t.Fatal("合法既有目录身份、安全或内容被修改")
		}
	})
	t.Run("existing_extra_administrators_ace_unchanged", func(t *testing.T) {
		target := filepath.Join(base, "extra-administrators")
		if err := createTestDirectorySecurity(target, user.User.Sid.String(), user.User.Sid.String(), "(A;OICI;FA;;;BA)"); err != nil {
			t.Fatal("真实额外 ACL 目录创建失败")
		}
		before := observeTestDirectory(t, target)
		if _, err := call(target); err == nil {
			t.Fatal("存在额外 Administrators ACE 的目录被接受")
		}
		if !reflect.DeepEqual(before, observeTestDirectory(t, target)) {
			t.Fatal("拒绝时修改了既有目录身份或 ACL")
		}
	})
	t.Run("existing_wrong_owner_unchanged", func(t *testing.T) {
		target := filepath.Join(base, "other-owner")
		err := createTestDirectorySecurity(target, "BA", user.User.Sid.String(), "")
		if err != nil {
			if errors.Is(err, windows.ERROR_PRIVILEGE_NOT_HELD) || errors.Is(err, windows.ERROR_INVALID_OWNER) || errors.Is(err, windows.ERROR_ACCESS_DENIED) {
				var code syscall.Errno
				if !errors.As(err, &code) {
					t.Fatal("实际 owner 夹具错误无法分类")
				}
				t.Skipf("NOT_RUN: host cannot create the wrong-owner fixture (Win32=%d)", uint32(code))
			}
			t.Fatal("真实 owner 夹具创建出现其它错误")
		}
		before := observeTestDirectory(t, target)
		if _, err := call(target); err == nil {
			t.Fatal("错误 owner 的目录被接受")
		}
		if !reflect.DeepEqual(before, observeTestDirectory(t, target)) {
			t.Fatal("拒绝时修改了既有 owner 或目录身份")
		}
	})
	t.Run("ordinary_file_unchanged", func(t *testing.T) {
		target, content := filepath.Join(base, "ordinary-file"), []byte("public file bytes\n")
		if err := os.WriteFile(target, content, 0o600); err != nil {
			t.Fatal("真实普通文件创建失败")
		}
		if _, err := call(target); err == nil {
			t.Fatal("普通文件被接受为 data 根")
		}
		after, err := os.ReadFile(target)
		if err != nil || !bytes.Equal(after, content) {
			t.Fatal("拒绝时修改了真实普通文件")
		}
	})
	t.Run("reparse_target_and_ancestor", func(t *testing.T) {
		target := filepath.Join(base, "link-target")
		if _, err := call(target); err != nil {
			t.Fatal("真实 reparse 控制目标创建失败")
		}
		link := filepath.Join(base, "directory-link")
		if _, err := exec.Command("cmd.exe", "/d", "/c", "mklink", "/J", link, target).CombinedOutput(); err != nil {
			var exit *exec.ExitError
			if errors.As(err, &exit) {
				if _, statErr := os.Lstat(link); errors.Is(statErr, os.ErrNotExist) {
					t.Skipf("NOT_RUN: host cannot create a real directory junction (command exit=%d)", exit.ExitCode())
				}
			}
			t.Fatal("真实 junction 夹具创建结果不可确认")
		}
		linkName, err := windows.UTF16PtrFromString(link)
		if err != nil {
			t.Fatal("真实 junction 路径不可用")
		}
		attributes, err := windows.GetFileAttributes(linkName)
		if err != nil || attributes&windows.FILE_ATTRIBUTE_REPARSE_POINT == 0 {
			t.Fatal("实际创建结果不是 reparse 目录")
		}
		if err := os.Mkdir(filepath.Join(target, "nested"), 0o700); err != nil {
			t.Fatal("真实 junction 祖先控制目录创建失败")
		}
		before := observeTestDirectory(t, target)
		for _, path := range []string{link, filepath.Join(link, "new-data")} {
			if _, err := call(path); err == nil {
				t.Fatal("经过真实 reparse 的 data 目录被接受")
			}
		}
		if _, err := os.Stat(filepath.Join(target, "new-data")); !errors.Is(err, os.ErrNotExist) {
			t.Fatal("reparse 拒绝后创建了实际目标")
		}
		for _, relative := range []string{"new-export", filepath.Join("nested", "new-export")} {
			if _, err := prepareRunExport(filepath.Join(link, relative)); err == nil {
				t.Fatal("真实 junction 父目录或祖先的导出路径被接受")
			}
			if _, err := os.Stat(filepath.Join(target, relative)); !errors.Is(err, os.ErrNotExist) {
				t.Fatal("junction 拒绝后创建了实际导出目标")
			}
		}
		if !reflect.DeepEqual(before, observeTestDirectory(t, target)) {
			t.Fatal("reparse 拒绝修改了真实目标")
		}
	})
	t.Run("protected_roots_before_creation", func(t *testing.T) {
		for _, path := range []string{filepath.Join(protected, "new-data"), filepath.Join(install, "new-data")} {
			if _, err := call(path); err == nil {
				t.Fatal("重叠保护根的 data 目录被接受")
			}
			if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
				t.Fatal("保护根拒绝前发生目录创建")
			}
		}
	})
}
