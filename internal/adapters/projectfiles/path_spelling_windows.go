package projectfiles

import (
	"path/filepath"

	"golang.org/x/sys/windows"
)

// 展开 Windows 8.3 名称，保留原符号链接及目录重定向以供检查。
func pathSpelling(path string) string {
	clean := filepath.Clean(path)
	if !filepath.IsAbs(clean) {
		return clean
	}
	ptr, err := windows.UTF16PtrFromString(clean)
	if err != nil {
		return clean
	}
	buf := make([]uint16, 32768)
	n, err := windows.GetLongPathName(ptr, &buf[0], uint32(len(buf)))
	if err == nil && n > 0 && n < uint32(len(buf)) {
		return filepath.Clean(windows.UTF16ToString(buf[:n]))
	}
	// 已移除的 checkout 保留登记关联，只展开实际存在的祖先目录。
	if err == windows.ERROR_FILE_NOT_FOUND || err == windows.ERROR_PATH_NOT_FOUND {
		parent := filepath.Dir(clean)
		if parent != clean {
			return filepath.Join(pathSpelling(parent), filepath.Base(clean))
		}
	}
	return clean
}

func pathIsRedirect(path string) bool {
	ptr, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return true
	}
	attrs, err := windows.GetFileAttributes(ptr)
	return err == nil && attrs&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0
}
