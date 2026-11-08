package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"github.com/google/uuid"
	"golang.org/x/sys/windows"
)

type actualCLIRequest struct {
	Candidate     string   `json:"candidate"`
	Source        string   `json:"source_revision"`
	Controller    string   `json:"controller"`
	RequestID     string   `json:"request_id"`
	Arguments     []string `json:"arguments"`
	OutputPrefix  string   `json:"output_prefix"`
	ProtectedPIDs []uint32 `json:"protected_process_ids"`
}

func exclusiveFile(path string) (*os.File, error) {
	return os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
}

func currentConsole() ([]uint32, error) {
	buffer := make([]uint32, 16)
	count, _, callErr := windows.NewLazySystemDLL("kernel32.dll").NewProc("GetConsoleProcessList").Call(uintptr(unsafe.Pointer(&buffer[0])), uintptr(len(buffer)))
	if count == 0 || count > uintptr(len(buffer)) {
		return nil, fmt.Errorf("实际独立console成员无法确认: count=%d error=%v", count, callErr)
	}
	buffer = buffer[:int(count)]
	sort.Slice(buffer, func(left, right int) bool { return buffer[left] < buffer[right] })
	return buffer, nil
}

func samePIDs(actual []uint32, expected ...uint32) bool {
	sort.Slice(expected, func(left, right int) bool { return expected[left] < expected[right] })
	if len(actual) != len(expected) {
		return false
	}
	for index := range actual {
		if actual[index] != expected[index] {
			return false
		}
	}
	return true
}

func processIdentity(handle windows.Handle) (uint64, string, error) {
	var created, exited, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(handle, &created, &exited, &kernel, &user); err != nil {
		return 0, "", err
	}
	buffer := make([]uint16, 32768)
	size := uint32(len(buffer))
	if err := windows.QueryFullProcessImageName(handle, 0, &buffer[0], &size); err != nil {
		return 0, "", err
	}
	ticks := uint64(created.HighDateTime)<<32 | uint64(created.LowDateTime)
	return ticks/10000 - 11644473600000, windows.UTF16ToString(buffer[:size]), nil
}

func actualEnvironment() []string {
	result := []string{}
	for _, key := range []string{"SystemRoot", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "TEMP", "TMP", "SWA_ENDPOINT", "SWA_PROJECT_ID", "SWA_PROJECT_TOKEN"} {
		if value := os.Getenv(key); value != "" {
			result = append(result, key+"="+value)
		}
	}
	return result
}

func broker(sourceFile string) (result error) {
	input, err := os.Open(sourceFile)
	if err != nil {
		return err
	}
	var request actualCLIRequest
	decoder := json.NewDecoder(io.LimitReader(input, 65537))
	decoder.DisallowUnknownFields()
	err = decoder.Decode(&request)
	err = errors.Join(err, input.Close())
	if err != nil {
		return err
	}
	if !filepath.IsAbs(request.Candidate) || !filepath.IsAbs(request.OutputPrefix) || request.Controller == "" || len(request.ProtectedPIDs) == 0 {
		return errors.New("实际候选、控制端、输出或保护PID缺失")
	}
	if _, err := uuid.Parse(request.RequestID); err != nil {
		return err
	}
	version, err := os.ReadFile(filepath.Join(request.Candidate, "VERSION"))
	if err != nil || strings.TrimSpace(string(version)) != request.Source {
		return errors.Join(errors.New("实际候选VERSION与请求来源不符"), err)
	}
	if len(request.Arguments) < 2 || request.Arguments[0] != "controller" || request.Arguments[1] != "recover" {
		return errors.New("只接受本项真实recover CLI")
	}
	arguments := flag.NewFlagSet("实际recover", flag.ContinueOnError)
	controller := arguments.String("controller", "", "")
	requestID := arguments.String("request-id", "", "")
	arguments.String("project", "", "")
	arguments.String("endpoint", "", "")
	asJSON := arguments.Bool("json", false, "")
	if err := arguments.Parse(request.Arguments[2:]); err != nil || arguments.NArg() != 0 || *controller != request.Controller || *requestID != request.RequestID || !*asJSON {
		return errors.Join(errors.New("实际CLI参数与原请求不符"), err)
	}
	console, err := currentConsole()
	if err != nil || !samePIDs(console, uint32(os.Getpid())) {
		return errors.Join(errors.New("控制进程没有独占本项新console"), err)
	}
	stdout, err := exclusiveFile(request.OutputPrefix + ".stdout.log")
	if err != nil {
		return err
	}
	defer func() { result = errors.Join(result, stdout.Close()) }()
	stderr, err := exclusiveFile(request.OutputPrefix + ".stderr.log")
	if err != nil {
		return err
	}
	defer func() { result = errors.Join(result, stderr.Close()) }()
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	cli := exec.CommandContext(ctx, filepath.Join(request.Candidate, "swa.exe"), request.Arguments...)
	cli.Env = actualEnvironment()
	cli.Dir = request.Candidate
	cli.Stderr = stderr
	cli.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NEW_PROCESS_GROUP}
	reader, err := cli.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cli.Start(); err != nil {
		return err
	}
	copyDone := make(chan error, 1)
	go func() { _, copyErr := io.Copy(stdout, reader); copyDone <- copyErr }()
	pid := uint32(cli.Process.Pid)
	for _, protected := range request.ProtectedPIDs {
		if protected == pid {
			cancel()
			copyErr := <-copyDone
			return errors.Join(errors.New("实际新子进程与保护PID重合"), copyErr, cli.Wait())
		}
	}
	handle, err := windows.OpenProcess(windows.SYNCHRONIZE|windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		cancel()
		copyErr := <-copyDone
		return errors.Join(err, copyErr, cli.Wait())
	}
	defer func() { result = errors.Join(result, windows.CloseHandle(handle)) }()
	created, image, err := processIdentity(handle)
	if err != nil || !strings.EqualFold(image, filepath.Join(request.Candidate, "swa.exe")) {
		cancel()
		copyErr := <-copyDone
		return errors.Join(errors.New("实际子进程程序来源无法确认"), err, copyErr, cli.Wait())
	}
	console, err = currentConsole()
	if err != nil || !samePIDs(console, uint32(os.Getpid()), pid) {
		cancel()
		copyErr := <-copyDone
		waitErr := cli.Wait()
		return errors.Join(errors.New("实际console中出现本项以外的成员"), err, waitErr, copyErr)
	}
	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{"type": "swa_actual_cli_fault_ready", "request_id": request.RequestID, "controller": request.Controller, "pid": pid, "creation_time_ms": created, "group_id": pid, "console_members": console}); err != nil {
		cancel()
		copyErr := <-copyDone
		waitErr := cli.Wait()
		return errors.Join(err, waitErr, copyErr)
	}
	type controlMessage struct {
		Action    string `json:"action"`
		RequestID string `json:"request_id"`
	}
	type controlResult struct {
		message controlMessage
		err     error
	}
	controlDone := make(chan controlResult, 1)
	go func() {
		var message controlMessage
		decoder := json.NewDecoder(os.Stdin)
		decoder.DisallowUnknownFields()
		err := decoder.Decode(&message)
		controlDone <- controlResult{message: message, err: err}
	}()
	var control controlMessage
	var controlErr error
	select {
	case received := <-controlDone:
		control, controlErr = received.message, received.err
	case <-ctx.Done():
		controlErr = ctx.Err()
	}
	if controlErr == nil && control.RequestID != request.RequestID {
		controlErr = errors.New("故障控制指令不属于原请求")
	}
	if controlErr == nil && control.Action != "observe" {
		state, waitErr := windows.WaitForSingleObject(handle, 0)
		if waitErr != nil || state != uint32(windows.WAIT_TIMEOUT) {
			controlErr = errors.Join(errors.New("实际CLI已结束或无法确认等待窗口"), waitErr)
		}
	}
	if controlErr == nil && control.Action != "observe" {
		currentCreated, currentImage, identityErr := processIdentity(handle)
		console, err = currentConsole()
		if identityErr != nil || currentCreated != created || currentImage != image || err != nil || !samePIDs(console, uint32(os.Getpid()), pid) {
			controlErr = errors.Join(errors.New("故障前所持身份或console发生变化"), identityErr, err)
		}
	}
	if controlErr == nil {
		switch control.Action {
		case "observe":
		case "cancel":
			accepted, _, callErr := windows.NewLazySystemDLL("kernel32.dll").NewProc("GenerateConsoleCtrlEvent").Call(1, uintptr(pid))
			if accepted == 0 {
				controlErr = fmt.Errorf("真实CTRL_BREAK_EVENT未交付: %v", callErr)
			}
		case "stdout-close":
			controlErr = reader.Close()
		default:
			controlErr = errors.New("未支持的本项故障控制动作")
		}
	}
	if controlErr != nil {
		cancel()
	}
	copyErr := <-copyDone
	waitErr := cli.Wait()
	state, exitErr := windows.WaitForSingleObject(handle, 0)
	report := map[string]any{"request_id": request.RequestID, "controller": request.Controller, "actual_action": control.Action, "pid": pid, "creation_time_ms": created, "group_id": pid, "actual_handle_signaled": state == windows.WAIT_OBJECT_0 && exitErr == nil, "deadline": errors.Is(ctx.Err(), context.DeadlineExceeded)}
	if cli.ProcessState != nil {
		report["actual_cli_exit"] = cli.ProcessState.ExitCode()
	}
	if waitErr != nil {
		report["actual_wait_error"] = waitErr.Error()
	}
	var stdoutFileErr, unknownCopyErr error
	if copyErr != nil {
		var pathErr *os.PathError
		if errors.As(copyErr, &pathErr) && pathErr.Op == "read" {
			report["actual_pipe_read_error"] = copyErr.Error()
		} else if pathErr != nil && pathErr.Op == "write" {
			stdoutFileErr = copyErr
			report["actual_stdout_file_error"] = copyErr.Error()
		} else {
			unknownCopyErr = copyErr
			report["actual_unclassified_copy_error"] = copyErr.Error()
		}
	}
	if controlErr != nil {
		report["control_error"] = controlErr.Error()
	}
	output, err := exclusiveFile(request.OutputPrefix + ".result.json")
	if err != nil {
		return errors.Join(controlErr, err)
	}
	writeErr := errors.Join(json.NewEncoder(output).Encode(report), output.Close())
	return errors.Join(controlErr, exitErr, writeErr, stdoutFileErr, unknownCopyErr)
}

func main() {
	inside := flag.Bool("broker", false, "本项隐藏console控制进程")
	source := flag.String("request-file", "", "原真实CLI参数及来源文件")
	flag.Parse()
	if !*inside {
		executable, err := os.Executable()
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(6)
		}
		child := exec.Command(executable, "--broker", "--request-file", *source)
		child.Env = actualEnvironment()
		child.Stdin, child.Stdout, child.Stderr = os.Stdin, os.Stdout, os.Stderr
		child.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NEW_CONSOLE}
		if err := child.Run(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(6)
		}
		return
	}
	if err := broker(*source); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(6)
	}
}
