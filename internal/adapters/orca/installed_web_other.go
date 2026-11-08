//go:build !windows

package orca

func rejectInstalledReparsePoint(_ string) error { return nil }
