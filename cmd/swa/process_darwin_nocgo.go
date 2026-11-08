//go:build darwin && !cgo

package main

func darwinExecutable(int) (string, error) { return "", errServiceOwnershipUnknown }
func darwinPrivateACL(string) error        { return errServiceOwnershipUnknown }
