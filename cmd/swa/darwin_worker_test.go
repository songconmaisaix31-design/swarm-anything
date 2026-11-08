//go:build darwin && cgo

package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sys/unix"
)

func TestDarwinWorkerHelper(t *testing.T) {
	index := -1
	for i, arg := range os.Args {
		if arg == "--" {
			index = i + 1
			break
		}
	}
	if index < 0 {
		return
	}
	args := os.Args[index:]
	switch args[0] {
	case "supervisor":
		os.Exit(darwinWorkerCommand(context.Background(), args[1:]))
	case "ignored":
		signal.Ignore(syscall.SIGCHLD)
		os.Exit(darwinWorkerCommand(context.Background(), args[1:]))
	case "fds":
		for _, fd := range []int{3, 4} {
			var stat unix.Stat_t
			if unix.Fstat(fd, &stat) == nil && (stat.Mode&unix.S_IFMT == unix.S_IFIFO || stat.Mode&unix.S_IFMT == unix.S_IFSOCK) {
				os.Exit(41)
			}
		}
		fmt.Println("isolated")
		_, _ = io.Copy(io.Discard, os.Stdin)
	case "detached":
		child := exec.Command("/bin/sleep", "0.6")
		child.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
		if err := child.Start(); err != nil {
			os.Exit(42)
		}
		fmt.Println(child.Process.Pid)
		_, _ = io.Copy(io.Discard, os.Stdin)
		_ = child.Wait()
	case "term-ignore":
		signal.Ignore(syscall.SIGTERM)
		fmt.Println("ready")
		for {
			time.Sleep(time.Second)
		}
	case "exec-switch":
		fmt.Println("ready")
		var data [1]byte
		_, _ = os.Stdin.Read(data[:])
		if syscall.Exec("/bin/sleep", []string{"sleep", "0.4"}, os.Environ()) != nil {
			os.Exit(44)
		}
	default:
		os.Exit(43)
	}
	os.Exit(0)
}

type darwinWorkerHarness struct {
	command     *exec.Cmd
	stdin       *os.File
	control     *os.File
	events      chan map[string]json.RawMessage
	output      *bufio.Reader
	done        chan error
	eventReader *os.File
}

func darwinWorkerTestStart(t *testing.T, socket bool, role string, program string, args ...string) *darwinWorkerHarness {
	t.Helper()
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	var eventRead, eventWrite, controlRead, controlWrite *os.File
	if socket {
		pair, err := unix.Socketpair(unix.AF_UNIX, unix.SOCK_STREAM, 0)
		if err != nil {
			t.Fatal(err)
		}
		for _, fd := range pair {
			unix.CloseOnExec(fd)
			if err := unix.SetNonblock(fd, true); err != nil {
				t.Fatal(err)
			}
		}
		eventRead, eventWrite = os.NewFile(uintptr(pair[0]), "events-read"), os.NewFile(uintptr(pair[1]), "events-write")
		pair, err = unix.Socketpair(unix.AF_UNIX, unix.SOCK_STREAM, 0)
		if err != nil {
			t.Fatal(err)
		}
		for _, fd := range pair {
			unix.CloseOnExec(fd)
			if err := unix.SetNonblock(fd, true); err != nil {
				t.Fatal(err)
			}
		}
		controlRead, controlWrite = os.NewFile(uintptr(pair[0]), "control-read"), os.NewFile(uintptr(pair[1]), "control-write")
	} else {
		eventRead, eventWrite, err = os.Pipe()
		if err != nil {
			t.Fatal(err)
		}
		controlRead, controlWrite, err = os.Pipe()
		if err != nil {
			t.Fatal(err)
		}
	}
	stdinRead, stdinWrite, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	stdoutRead, stdoutWrite, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	argv := append([]string{"-test.run=^TestDarwinWorkerHelper$", "--", role, program}, args...)
	command := exec.Command(self, argv...)
	command.Stdin, command.Stdout, command.Stderr = stdinRead, stdoutWrite, os.Stderr
	command.ExtraFiles = []*os.File{eventWrite, controlRead}
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	_ = eventWrite.Close()
	_ = controlRead.Close()
	_ = stdinRead.Close()
	_ = stdoutWrite.Close()
	h := &darwinWorkerHarness{command: command, stdin: stdinWrite, control: controlWrite, events: make(chan map[string]json.RawMessage, 128), output: bufio.NewReader(stdoutRead), done: make(chan error, 1), eventReader: eventRead}
	go func() {
		defer close(h.events)
		decoder := json.NewDecoder(eventRead)
		for {
			var event map[string]json.RawMessage
			if decoder.Decode(&event) != nil {
				return
			}
			h.events <- event
		}
	}()
	go func() { h.done <- command.Wait(); close(h.done) }()
	t.Cleanup(func() {
		_ = controlWrite.Close()
		_ = stdinWrite.Close()
		select {
		case <-h.done:
		case <-time.After(4 * time.Second):
			_ = command.Process.Kill()
			<-h.done
		}
		_ = stdoutRead.Close()
		_ = eventRead.Close()
	})
	return h
}

func (h *darwinWorkerHarness) event(t *testing.T, kind string) map[string]json.RawMessage {
	t.Helper()
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	for {
		select {
		case event, ok := <-h.events:
			if !ok {
				t.Fatalf("event stream closed before %s", kind)
			}
			if string(event["schema"]) != `"swa.darwin-worker.v1"` {
				t.Fatalf("bad schema: %s", event["schema"])
			}
			if string(event["type"]) == strconv.Quote(kind) {
				return event
			}
		case <-timer.C:
			t.Fatalf("timeout waiting for %s", kind)
		}
	}
}

func (h *darwinWorkerHarness) identity(t *testing.T) darwinWorkerIdentity {
	t.Helper()
	event := h.event(t, "started")
	var identity, supervisor darwinWorkerIdentity
	if err := json.Unmarshal(event["identity"], &identity); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(event["supervisor"], &supervisor); err != nil {
		t.Fatal(err)
	}
	if supervisor.PID != h.command.Process.Pid || identity.PPID != supervisor.PID || string(event["pgid"]) != strconv.Itoa(identity.PID) {
		t.Fatal("incorrect parent or process group")
	}
	return identity
}

func (h *darwinWorkerHarness) send(t *testing.T, stop darwinWorkerStop) darwinWorkerReceipt {
	t.Helper()
	if err := json.NewEncoder(h.control).Encode(stop); err != nil {
		t.Fatal(err)
	}
	event := h.event(t, "stop_result")
	data, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}
	var receipt darwinWorkerReceipt
	if err := json.Unmarshal(data, &receipt); err != nil {
		t.Fatal(err)
	}
	return receipt
}

func (h *darwinWorkerHarness) exited(t *testing.T, expectedSignal string) map[string]json.RawMessage {
	t.Helper()
	event := h.event(t, "exited")
	if string(event["tree"]) != `"unknown"` || string(event["reaped"]) != "true" {
		t.Fatalf("exit not reaped/unknown: %v", event)
	}
	if expectedSignal != "" && string(event["signal"]) != strconv.Quote(expectedSignal) {
		t.Fatalf("signal=%s", event["signal"])
	}
	select {
	case err := <-h.done:
		var exit *exec.ExitError
		if err == nil {
			t.Fatal("supervisor must return unknown")
		}
		if value, ok := err.(*exec.ExitError); ok {
			exit = value
		}
		if exit == nil || exit.ExitCode() != 6 {
			t.Fatalf("supervisor exit=%v", err)
		}
	case <-time.After(4 * time.Second):
		t.Fatal("supervisor did not terminate")
	}
	t.Logf("root reaped, tree unknown, supervisor exit 6, signal=%s", event["signal"])
	return event
}

func TestDarwinWorkerSignals(t *testing.T) {
	for _, signal := range []string{"SIGTERM", "SIGKILL"} {
		t.Run(signal, func(t *testing.T) {
			h := darwinWorkerTestStart(t, false, "supervisor", "/bin/sleep", "10")
			identity := h.identity(t)
			receipt := h.send(t, darwinWorkerStop{"stop", uuid.NewString(), identity, signal})
			if !receipt.Accepted || receipt.Reason != "signal_sent" {
				t.Fatal(receipt)
			}
			h.exited(t, signal)
		})
	}
}

func TestDarwinWorkerForgeryAndReplay(t *testing.T) {
	h := darwinWorkerTestStart(t, true, "supervisor", "/bin/cat")
	identity := h.identity(t)
	mutations := []func(*darwinWorkerIdentity){
		func(i *darwinWorkerIdentity) { i.PID++ }, func(i *darwinWorkerIdentity) { i.PPID++ },
		func(i *darwinWorkerIdentity) { i.StartTicks = "1" }, func(i *darwinWorkerIdentity) { i.OwnerUID = "0" },
		func(i *darwinWorkerIdentity) { i.BootID += "x" }, func(i *darwinWorkerIdentity) { i.Executable.Path = "/bin/sleep" },
		func(i *darwinWorkerIdentity) { i.Schema = "v0" }, func(i *darwinWorkerIdentity) { i.State = "absent" },
		func(i *darwinWorkerIdentity) { i.Platform = "linux" }, func(i *darwinWorkerIdentity) { i.Executable.State = "unknown" },
	}
	for _, mutate := range mutations {
		wrong := identity
		mutate(&wrong)
		stop := darwinWorkerStop{"stop", uuid.NewString(), wrong, "SIGKILL"}
		first := h.send(t, stop)
		if first.Accepted || first.Reason != "identity_mismatch" {
			t.Fatal(first)
		}
		if second := h.send(t, stop); second != first {
			t.Fatal("receipt changed")
		}
		stop.Expected = identity
		if conflict := h.send(t, stop); conflict.Accepted || conflict.Reason != "request_id_conflict" {
			t.Fatal(conflict)
		}
	}
	if _, err := io.WriteString(h.stdin, "native bytes unchanged\n"); err != nil {
		t.Fatal(err)
	}
	line, err := h.output.ReadString('\n')
	if err != nil || line != "native bytes unchanged\n" {
		t.Fatalf("stdout=%q err=%v", line, err)
	}
	_ = h.stdin.Close()
	event := h.exited(t, "")
	if string(event["code"]) != "0" || string(event["signal"]) != "null" {
		t.Fatal("incorrect normal exit")
	}
	t.Log("all v1 fields checked; stale start time and forged PID rejected; socketpair accepted")
}

func TestDarwinWorkerEOF(t *testing.T) {
	h := darwinWorkerTestStart(t, false, "supervisor", "/bin/cat")
	_ = h.identity(t)
	_ = h.control.Close()
	h.exited(t, "")
}

func TestDarwinWorkerImmediateExit(t *testing.T) {
	for i := 0; i < 4; i++ {
		h := darwinWorkerTestStart(t, false, "supervisor", "/usr/bin/true")
		h.exited(t, "")
	}
}

func TestDarwinWorkerFDIsolation(t *testing.T) {
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	h := darwinWorkerTestStart(t, true, "supervisor", self, "-test.run=^TestDarwinWorkerHelper$", "--", "fds")
	_ = h.identity(t)
	line, err := h.output.ReadString('\n')
	if err != nil || line != "isolated\n" {
		t.Fatalf("fd isolation=%q %v", line, err)
	}
	_ = h.stdin.Close()
	event := h.exited(t, "")
	if string(event["code"]) != "0" {
		t.Fatal("inherited control/events fd")
	}
}

func TestDarwinWorkerDetachedObservation(t *testing.T) {
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	h := darwinWorkerTestStart(t, false, "supervisor", self, "-test.run=^TestDarwinWorkerHelper$", "--", "detached")
	_ = h.identity(t)
	line, err := h.output.ReadString('\n')
	if err != nil {
		t.Fatal(err)
	}
	pid, err := strconv.Atoi(strings.TrimSpace(line))
	if err != nil {
		t.Fatal(err)
	}
	row, err := darwinIdentity(pid)
	if err != nil || row.PGID != pid {
		t.Fatalf("detached identity: %v", err)
	}
	time.Sleep(100 * time.Millisecond)
	_ = h.stdin.Close()
	event := h.exited(t, "")
	var observed []darwinWorkerObservation
	if err := json.Unmarshal(event["observed"], &observed); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, known := range observed {
		if known.Identity.PID == pid {
			found = true
			t.Logf("detached descendant state=%s", known.State)
		}
	}
	if !found {
		t.Fatal("detached descendant not observed")
	}
}

func TestDarwinWorkerIgnoredSIGCHLD(t *testing.T) {
	h := darwinWorkerTestStart(t, false, "ignored", "/bin/sleep", "10")
	event := h.event(t, "error")
	if string(event["reason"]) != `"sigchld_ignored"` {
		t.Fatalf("reason=%s", event["reason"])
	}
	select {
	case <-h.done:
	case <-time.After(time.Second):
		t.Fatal("ignored SIGCHLD did not reject launch")
	}
}

func TestDarwinWorkerOwnerLostEscalation(t *testing.T) {
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	h := darwinWorkerTestStart(t, false, "supervisor", self, "-test.run=^TestDarwinWorkerHelper$", "--", "term-ignore")
	_ = h.identity(t)
	line, err := h.output.ReadString('\n')
	if err != nil || line != "ready\n" {
		t.Fatal("child not ready")
	}
	_ = h.control.Close()
	h.exited(t, "SIGKILL")
}

func TestDarwinWorkerExecutableChange(t *testing.T) {
	self, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	h := darwinWorkerTestStart(t, false, "supervisor", self, "-test.run=^TestDarwinWorkerHelper$", "--", "exec-switch")
	identity := h.identity(t)
	if _, err := h.output.ReadString('\n'); err != nil {
		t.Fatal(err)
	}
	if _, err := h.stdin.Write([]byte{1}); err != nil {
		t.Fatal(err)
	}
	changed := false
	for deadline := time.Now().Add(time.Second); time.Now().Before(deadline); {
		path, err := darwinExecutable(identity.PID)
		if err == nil && path != identity.Executable.Path {
			changed = true
			break
		}
		time.Sleep(time.Millisecond)
	}
	if !changed {
		t.Fatal("exec change not observed")
	}
	receipt := h.send(t, darwinWorkerStop{"stop", uuid.NewString(), identity, "SIGKILL"})
	if receipt.Accepted || receipt.Reason != "identity_mismatch" {
		t.Fatal(receipt)
	}
	event := h.exited(t, "")
	if string(event["code"]) != "0" {
		t.Fatal("changed executable was signaled")
	}
}

func TestDarwinWorkerOutputDisconnected(t *testing.T) {
	h := darwinWorkerTestStart(t, true, "supervisor", "/bin/sleep", "10")
	identity := h.identity(t)
	_ = h.eventReader.Close()
	select {
	case err := <-h.done:
		if exit, ok := err.(*exec.ExitError); !ok || exit.ExitCode() != 6 {
			t.Fatalf("exit=%v", err)
		}
	case <-time.After(4 * time.Second):
		t.Fatal("event EOF did not trigger cleanup")
	}
	if _, err := darwinIdentity(identity.PID); !errors.Is(err, unix.ESRCH) {
		t.Fatalf("child not reaped: %v", err)
	}
}

func TestDarwinWorkerOutputBackpressure(t *testing.T) {
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	events, lost, done := make(chan any, 1), make(chan struct{}, 1), make(chan struct{})
	go darwinWorkerOutputs(writer, events, lost, done)
	events <- map[string]string{"payload": strings.Repeat("x", 1024*1024)}
	select {
	case <-lost:
	case <-time.After(2 * time.Second):
		t.Fatal("output backpressure did not expire")
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("output writer did not close")
	}
}

func TestDarwinWorkerObservationFailureCleanup(t *testing.T) {
	child := exec.Command("/bin/sleep", "10")
	child.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := child.Start(); err != nil {
		t.Fatal(err)
	}
	// 真实直接子进程与真实身份；只注入已失效的观察句柄。
	identity, err := darwinWorkerReadIdentity(child.Process.Pid)
	if err != nil {
		_ = child.Process.Kill()
		_ = child.Wait()
		t.Fatal(err)
	}
	worker := &darwinWorker{child: child, identity: &identity, queue: -1}
	t.Cleanup(func() {
		if !worker.reaped {
			_ = child.Process.Kill()
			_ = child.Wait()
		}
	})
	if reason := worker.signal(syscall.SIGTERM); reason != "signal_sent" {
		t.Fatal(reason)
	}
	if !worker.observationFailed {
		t.Fatal("observation failure was lost")
	}
	worker.signalDisabled = true
	for deadline := time.Now().Add(time.Second); time.Now().Before(deadline) && !worker.reaped; {
		worker.reap()
		time.Sleep(time.Millisecond)
	}
	if !worker.reaped {
		t.Fatal("observation failure cleanup did not reap")
	}
	if reason := worker.signal(syscall.SIGKILL); reason != "child_exited" {
		t.Fatal("signal allowed after reap")
	}
}
