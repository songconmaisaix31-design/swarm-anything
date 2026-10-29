package relayworktree

import (
	"path/filepath"
	"strings"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"golang.org/x/sys/windows"
)

func gitDirectory(root string) (string, error) {
	absolute, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	native := absolute
	if !strings.HasPrefix(native, `\\?\`) {
		if strings.HasPrefix(native, `\\`) {
			native = `\\?\UNC\` + strings.TrimPrefix(native, `\\`)
		} else {
			native = `\\?\` + native
		}
	}
	ptr, err := windows.UTF16PtrFromString(native)
	if err != nil {
		return "", err
	}
	buffer := make([]uint16, 32768)
	n, err := windows.GetShortPathName(ptr, &buffer[0], uint32(len(buffer)))
	if err != nil {
		return "", err
	}
	if n == 0 || n >= uint32(len(buffer)) {
		return "", failure(apierrors.UnsupportedCapability, "Windows did not provide a bounded Git directory")
	}
	directory := windows.UTF16ToString(buffer[:n])
	if strings.HasPrefix(directory, `\\?\UNC\`) {
		directory = `\\` + strings.TrimPrefix(directory, `\\?\UNC\`)
	} else {
		directory = strings.TrimPrefix(directory, `\\?\`)
	}
	// Git 的工作目录受 MAX_PATH 限制；系统别名必须仍指向获准目录。
	encoded, err := windows.UTF16FromString(directory)
	if err != nil || len(encoded) >= 260 {
		return "", failure(apierrors.UnsupportedCapability, "Windows directory has no Git-compatible short path")
	}
	if !sameExistingDirectory(absolute, directory) {
		return "", failure(apierrors.ScopeDenied, "Windows Git alias does not identify the approved directory")
	}
	return directory, nil
}
