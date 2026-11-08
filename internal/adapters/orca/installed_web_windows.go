package orca

import (
	"errors"

	"golang.org/x/sys/windows"
)

func rejectInstalledReparsePoint(path string) error {
	name, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	attributes, err := windows.GetFileAttributes(name)
	if err != nil {
		return err
	}
	if attributes&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
		return errors.New("installed Web paths cannot contain reparse points")
	}
	return nil
}
