//go:build darwin && cgo

package main

/*
#include <libproc.h>
#include <sys/acl.h>
#include <errno.h>
#include <stdlib.h>
#include <fcntl.h>
#include <unistd.h>
static int swa_path(int pid, char *out) { return proc_pidpath(pid, out, PROC_PIDPATHINFO_MAXSIZE); }
static int swa_acl(const char *path) {
  int fd = open(path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC);
  if (fd < 0) return -1;
  acl_t acl = acl_get_fd_np(fd, ACL_TYPE_EXTENDED);
  int saved_errno = errno;
  close(fd);
  if (!acl) { errno = saved_errno; return saved_errno == ENOENT ? 0 : -1; }
  acl_entry_t entry;
  int result = acl_get_entry(acl, ACL_FIRST_ENTRY, &entry);
  acl_free(acl);
  // Darwin 成功取得条目返回 0；存在条目或无法判定均拒绝。
  return result == 0 ? 1 : -1;
}
*/
import "C"

import (
	"errors"
	"unsafe"
)

func darwinExecutable(pid int) (string, error) {
	buffer := make([]byte, C.PROC_PIDPATHINFO_MAXSIZE)
	n, err := C.swa_path(C.int(pid), (*C.char)(unsafe.Pointer(&buffer[0])))
	if n <= 0 {
		return "", errors.Join(errServiceOwnershipUnknown, err)
	}
	return C.GoString((*C.char)(unsafe.Pointer(&buffer[0]))), nil
}

func darwinPrivateACL(path string) error {
	value := C.CString(path)
	defer C.free(unsafe.Pointer(value))
	result, err := C.swa_acl(value)
	if result != 0 {
		return errors.Join(errors.New("私有路径包含 ACL 或无法查询 ACL"), err)
	}
	return nil
}
