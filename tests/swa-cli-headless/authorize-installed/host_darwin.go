package main

import "os"

// 此工具的固定执行包只授权历史 Linux/Windows 项目，macOS 使用独立验收入口。
func checkHostRuntime() error                          { return fail("reviewed_execution_package_unavailable_on_darwin") }
func hostPaths(executionPackage) (hostPathSet, error)  { return hostPathSet{}, checkHostRuntime() }
func checkHostPathComponent(string) error              { return checkHostRuntime() }
func checkHostPrivatePath(string, bool) error          { return checkHostRuntime() }
func createHostPrivateFile(string) (*os.File, error)   { return nil, checkHostRuntime() }
func createHostPrivateDirectory(string) error          { return checkHostRuntime() }
func bindHostConsumer(*executionPackage, bool) error   { return checkHostRuntime() }
func childEnvironment(string) []string                 { return nil }
func serviceIdentity(executionPackage) (string, error) { return "", checkHostRuntime() }
