//go:build darwin

package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"sort"
	"strconv"
	"syscall"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sys/unix"
)

const darwinWorkerSchema = "swa.darwin-worker.v1"

type darwinWorkerExecutable struct {
	State string `json:"state"`
	Path  string `json:"path"`
}

type darwinWorkerIdentity struct {
	Schema     string                 `json:"schema"`
	Platform   string                 `json:"platform"`
	State      string                 `json:"state"`
	PID        int                    `json:"pid"`
	PPID       int                    `json:"ppid"`
	OwnerUID   string                 `json:"owner_uid"`
	StartTicks string                 `json:"start_ticks"`
	BootID     string                 `json:"boot_id"`
	Executable darwinWorkerExecutable `json:"executable"`
}

func darwinWorkerReadIdentity(pid int) (darwinWorkerIdentity, error) {
	boot, err := darwinBootID()
	if err != nil {
		return darwinWorkerIdentity{}, err
	}
	first, err := darwinIdentity(pid)
	if err != nil || first.State == 5 {
		return darwinWorkerIdentity{}, errors.Join(errServiceOwnershipUnknown, err)
	}
	path, err := darwinExecutable(pid)
	if err != nil {
		return darwinWorkerIdentity{}, err
	}
	last, err := darwinIdentity(pid)
	if err != nil || !sameDarwinProcess(first, last) || first.PPID != last.PPID || last.State == 5 {
		return darwinWorkerIdentity{}, errServiceOwnershipUnknown
	}
	lastPath, err := darwinExecutable(pid)
	if err != nil || path != lastPath {
		return darwinWorkerIdentity{}, errServiceOwnershipUnknown
	}
	lastBoot, err := darwinBootID()
	if err != nil || boot != lastBoot {
		return darwinWorkerIdentity{}, errServiceOwnershipUnknown
	}
	return darwinWorkerIdentity{"swa.darwin-process-identity.v1", "darwin", "present", pid, first.PPID, strconv.FormatUint(uint64(first.UID), 10), strconv.FormatUint(first.Start, 10), boot, darwinWorkerExecutable{"observed", path}}, nil
}

type darwinWorkerStop struct {
	Type      string               `json:"type"`
	RequestID string               `json:"request_id"`
	Expected  darwinWorkerIdentity `json:"expected"`
	Signal    string               `json:"signal"`
}

type darwinWorkerReceipt struct {
	Schema    string `json:"schema"`
	Type      string `json:"type"`
	RequestID string `json:"request_id"`
	Accepted  bool   `json:"accepted"`
	Reason    string `json:"reason"`
}

type darwinWorkerRequest struct {
	stop  darwinWorkerStop
	valid bool
	eof   bool
}

type darwinWorkerRemembered struct {
	stop    darwinWorkerStop
	receipt darwinWorkerReceipt
}

type darwinWorkerObservation struct {
	Identity darwinWorkerIdentity `json:"identity"`
	State    string               `json:"state"`
}

// 只有事件循环拥有身份比较、Signal 与 Wait4；输出和输入任务不操作进程。
type darwinWorker struct {
	child             *exec.Cmd
	identity          *darwinWorkerIdentity
	queue             int
	exitSeen          bool
	signalDisabled    bool
	observationFailed bool
	reaped            bool
	status            syscall.WaitStatus
	stdin             *os.File
	observed          map[int]*darwinWorkerObservation
	receipts          map[string]darwinWorkerRemembered
}

func init() { nativeDarwinWorker = darwinWorkerCommand }

func darwinWorkerPipe(fd int, write bool) (*os.File, error) {
	var stat unix.Stat_t
	if err := unix.Fstat(fd, &stat); err != nil {
		return nil, err
	}
	kind := stat.Mode & unix.S_IFMT
	if kind != unix.S_IFIFO && kind != unix.S_IFSOCK {
		return nil, errors.New("control transport is not a pipe")
	}
	flags, err := unix.FcntlInt(uintptr(fd), unix.F_GETFL, 0)
	if err != nil {
		return nil, err
	}
	mode := flags & unix.O_ACCMODE
	if (write && mode == unix.O_RDONLY) || (!write && mode == unix.O_WRONLY) {
		return nil, errors.New("incorrect pipe direction")
	}
	unix.CloseOnExec(fd)
	if err := unix.SetNonblock(fd, true); err != nil {
		return nil, err
	}
	return os.NewFile(uintptr(fd), "darwin-worker-pipe"), nil
}

func darwinWorkerControls(ctx context.Context, input *os.File, requests chan<- darwinWorkerRequest) {
	defer func() {
		select {
		case requests <- darwinWorkerRequest{eof: true}:
		case <-ctx.Done():
		}
	}()
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, 4096), 65536)
	for scanner.Scan() {
		var request darwinWorkerRequest
		decoder := json.NewDecoder(bytes.NewReader(scanner.Bytes()))
		decoder.DisallowUnknownFields()
		err := decoder.Decode(&request.stop)
		var extra any
		request.valid = err == nil && decoder.Decode(&extra) == io.EOF
		select {
		case requests <- request:
		case <-ctx.Done():
			return
		}
	}
}

func darwinWorkerOutputs(output *os.File, events <-chan any, lost chan<- struct{}, done chan<- struct{}) {
	defer close(done)
	defer output.Close()
	encoder := json.NewEncoder(output)
	for event := range events {
		if err := output.SetWriteDeadline(time.Now().Add(500 * time.Millisecond)); err != nil {
			lost <- struct{}{}
			return
		}
		if err := encoder.Encode(event); err != nil {
			lost <- struct{}{}
			return
		}
	}
}

func (worker *darwinWorker) register(pid int) error {
	event := unix.Kevent_t{Ident: uint64(pid), Filter: unix.EVFILT_PROC, Flags: unix.EV_ADD | unix.EV_ENABLE | unix.EV_CLEAR, Fflags: unix.NOTE_EXIT | unix.NOTE_FORK}
	_, err := unix.Kevent(worker.queue, []unix.Kevent_t{event}, nil, nil)
	return err
}

func (worker *darwinWorker) drain() error {
	events := make([]unix.Kevent_t, 64)
	for batch := 0; batch < 4; batch++ {
		n, err := unix.Kevent(worker.queue, nil, events, &unix.Timespec{})
		if err != nil {
			if errors.Is(err, unix.EINTR) {
				continue
			}
			return err
		}
		for _, event := range events[:n] {
			if event.Flags&unix.EV_ERROR != 0 {
				return errServiceOwnershipUnknown
			}
			if event.Fflags&unix.NOTE_EXIT != 0 {
				if int(event.Ident) == worker.child.Process.Pid {
					worker.exitSeen, worker.signalDisabled = true, true
				} else if known := worker.observed[int(event.Ident)]; known != nil {
					known.State = "exited"
				}
			}
		}
		if n < len(events) {
			return nil
		}
	}
	return nil
}

func (worker *darwinWorker) signal(signal syscall.Signal) string {
	if worker.exitSeen || worker.reaped || worker.signalDisabled {
		return "child_exited"
	}
	if !worker.observationFailed {
		if err := worker.drain(); err != nil {
			worker.observationFailed = true
		}
	}
	if worker.exitSeen {
		return "child_exited"
	}
	actual, err := darwinWorkerReadIdentity(worker.child.Process.Pid)
	if err != nil {
		return "identity_unavailable"
	}
	if worker.identity == nil || actual != *worker.identity {
		return "identity_mismatch"
	}
	// 直接子进程尚未 Wait，身份比较到 Signal 之间不会复用 PID。
	if err := worker.child.Process.Signal(signal); err != nil {
		return "signal_failed"
	}
	return "signal_sent"
}

func (worker *darwinWorker) stop(request darwinWorkerRequest) darwinWorkerReceipt {
	stop := request.stop
	receipt := darwinWorkerReceipt{Schema: darwinWorkerSchema, Type: "stop_result", RequestID: stop.RequestID, Reason: "invalid_request"}
	id, err := uuid.Parse(stop.RequestID)
	if !request.valid || err != nil || id.String() != stop.RequestID || stop.Type != "stop" || (stop.Signal != "SIGTERM" && stop.Signal != "SIGKILL") {
		return receipt
	}
	if prior, ok := worker.receipts[stop.RequestID]; ok {
		if prior.stop == stop {
			return prior.receipt
		}
		receipt.Reason = "request_id_conflict"
		return receipt
	}
	if len(worker.receipts) >= 1024 {
		receipt.Reason = "request_limit"
		return receipt
	}
	if worker.identity == nil || stop.Expected != *worker.identity {
		receipt.Reason = "identity_mismatch"
	} else {
		signal := syscall.SIGTERM
		if stop.Signal == "SIGKILL" {
			signal = syscall.SIGKILL
		}
		receipt.Reason = worker.signal(signal)
		receipt.Accepted = receipt.Reason == "signal_sent"
	}
	worker.receipts[stop.RequestID] = darwinWorkerRemembered{stop, receipt}
	return receipt
}

func (worker *darwinWorker) reap() {
	if worker.reaped || (!worker.exitSeen && !worker.signalDisabled) {
		return
	}
	var status syscall.WaitStatus
	pid, err := syscall.Wait4(worker.child.Process.Pid, &status, syscall.WNOHANG, nil)
	if err == nil && pid == worker.child.Process.Pid {
		worker.reaped, worker.signalDisabled, worker.status = true, true, status
		_ = worker.child.Process.Release()
	}
}

func (worker *darwinWorker) snapshot() {
	if worker.identity == nil {
		return
	}
	all, err := unix.SysctlKinfoProcSlice("kern.proc.uid", os.Geteuid())
	if err != nil {
		return
	}
	rows := make(map[int]darwinProcess)
	for _, k := range all {
		row, err := darwinRow(k)
		if err == nil {
			rows[row.PID] = row
		}
	}
	owned := make(map[int]bool)
	root := worker.child.Process.Pid
	if row, ok := rows[root]; ok && strconv.FormatUint(row.Start, 10) == worker.identity.StartTicks && row.UID == uint32(os.Geteuid()) && !worker.reaped {
		owned[root] = true
	}
	for pid, known := range worker.observed {
		row, ok := rows[pid]
		if !ok {
			if known.State != "exited" {
				known.State = "absent"
			}
			continue
		}
		if strconv.FormatUint(row.Start, 10) != known.Identity.StartTicks || row.UID != uint32(os.Geteuid()) {
			known.State = "unknown"
			continue
		}
		if known.State == "present" {
			owned[pid] = true
		}
	}
	for changed := true; changed; {
		changed = false
		for pid, row := range rows {
			if owned[pid] || worker.observed[pid] != nil || !owned[row.PPID] || row.State == 5 {
				continue
			}
			parent := rows[row.PPID]
			if row.Start < parent.Start || row.UID != parent.UID || len(worker.observed) >= 1024 {
				continue
			}
			identity, err := darwinWorkerReadIdentity(pid)
			if err != nil || identity.PPID != row.PPID || identity.StartTicks != strconv.FormatUint(row.Start, 10) {
				continue
			}
			if err := worker.register(pid); err != nil {
				continue
			}
			after, err := darwinWorkerReadIdentity(pid)
			if err != nil || after != identity {
				continue
			}
			worker.observed[pid] = &darwinWorkerObservation{identity, "present"}
			owned[pid], changed = true, true
		}
	}
}

func (worker *darwinWorker) final() any {
	observed := make([]darwinWorkerObservation, 0, len(worker.observed))
	for _, known := range worker.observed {
		observed = append(observed, *known)
	}
	sort.Slice(observed, func(i, j int) bool { return observed[i].Identity.PID < observed[j].Identity.PID })
	var code, signal any
	if worker.reaped {
		if worker.status.Exited() {
			code = worker.status.ExitStatus()
		}
		if worker.status.Signaled() {
			signal = unix.SignalName(unix.Signal(worker.status.Signal()))
		}
	}
	return map[string]any{"schema": darwinWorkerSchema, "type": "exited", "identity": worker.identity, "code": code, "signal": signal, "reaped": worker.reaped, "observed": observed, "tree": "unknown"}
}

func darwinWorkerCommand(parent context.Context, args []string) int {
	output, err := darwinWorkerPipe(3, true)
	if err != nil {
		return 6
	}
	input, err := darwinWorkerPipe(4, false)
	if err != nil {
		_ = output.Close()
		return 6
	}
	defer input.Close()
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	events, lost, outputDone := make(chan any, 32), make(chan struct{}, 1), make(chan struct{})
	go darwinWorkerOutputs(output, events, lost, outputDone)
	defer func() {
		close(events)
		select {
		case <-outputDone:
		case <-time.After(750 * time.Millisecond):
			_ = output.Close()
		}
	}()
	ownerLost := false
	emit := func(event any) {
		select {
		case events <- event:
		default:
			ownerLost = true
		}
	}
	fail := func(reason string) {
		emit(map[string]any{"schema": darwinWorkerSchema, "type": "error", "reason": reason})
	}
	if len(args) == 0 || !filepath.IsAbs(args[0]) {
		fail("invalid_program")
		return 6
	}
	if signal.Ignored(syscall.SIGCHLD) {
		fail("sigchld_ignored")
		return 6
	}
	program, err := filepath.EvalSymlinks(args[0])
	if err != nil {
		fail("invalid_program")
		return 6
	}
	supervisor, err := darwinWorkerReadIdentity(os.Getpid())
	if err != nil {
		fail("supervisor_identity_unavailable")
		return 6
	}
	queue, err := unix.Kqueue()
	if err != nil {
		fail("observation_unavailable")
		return 6
	}
	defer unix.Close(queue)
	unix.CloseOnExec(queue)
	read, write, err := os.Pipe()
	if err != nil {
		fail("stdin_unavailable")
		return 6
	}
	defer write.Close()
	child := exec.Command(program, args[1:]...)
	child.Stdin, child.Stdout, child.Stderr = read, os.Stdout, os.Stderr
	child.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := child.Start(); err != nil {
		_ = read.Close()
		fail("spawn_failed")
		return 6
	}
	_ = read.Close()
	// 可关闭的字节转发保持原生输入，并允许控制管道 EOF 关闭目标 stdin。
	go func() { _, _ = io.Copy(write, os.Stdin); _ = write.Close() }()
	worker := &darwinWorker{child: child, queue: queue, stdin: write, observed: make(map[int]*darwinWorkerObservation), receipts: make(map[string]darwinWorkerRemembered)}
	identity, identityErr := darwinWorkerReadIdentity(child.Process.Pid)
	if identityErr == nil {
		worker.identity = &identity
	}
	row, rowErr := darwinIdentity(child.Process.Pid)
	registerErr := worker.register(child.Process.Pid)
	after, afterErr := darwinWorkerReadIdentity(child.Process.Pid)
	startupFailed := identityErr != nil || rowErr != nil || row.PGID != row.PID || identity.PPID != os.Getpid() || registerErr != nil || afterErr != nil || after != identity
	if registerErr == nil {
		if err := worker.drain(); err != nil {
			worker.observationFailed = true
			startupFailed = true
		}
		startupFailed = startupFailed || worker.exitSeen
	}
	if startupFailed {
		fail("startup_identity_unavailable")
		worker.signalDisabled = worker.signalDisabled || worker.identity == nil
		worker.observationFailed = worker.observationFailed || registerErr != nil
		ownerLost = true
	} else {
		emit(map[string]any{"schema": darwinWorkerSchema, "type": "started", "supervisor": supervisor, "identity": identity, "pgid": row.PGID, "launch_program": program})
	}
	requests := make(chan darwinWorkerRequest, 32)
	go darwinWorkerControls(ctx, input, requests)
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	var cleanupAt time.Time
	termSent, killSent := false, false
	parentDone := ctx.Done()
	for {
		if worker.observationFailed {
			ownerLost = true
		}
		if !worker.observationFailed {
			if err := worker.drain(); err != nil {
				fail("observation_failed")
				ownerLost, worker.observationFailed = true, true
			}
		}
		transport := []unix.PollFd{{Fd: 3, Events: unix.POLLOUT}}
		if _, err := unix.Poll(transport, 0); err != nil || transport[0].Revents&(unix.POLLERR|unix.POLLHUP|unix.POLLNVAL) != 0 {
			ownerLost = true
		}
		worker.reap()
		worker.snapshot()
		if worker.reaped {
			emit(worker.final())
			return 6
		}
		if ownerLost {
			if cleanupAt.IsZero() {
				cleanupAt = time.Now()
				_ = write.Close()
			}
			if !termSent {
				termSent = true
				_ = worker.signal(syscall.SIGTERM)
			}
			if !killSent && time.Since(cleanupAt) >= 500*time.Millisecond {
				killSent = true
				_ = worker.signal(syscall.SIGKILL)
			}
			if time.Since(cleanupAt) >= 2*time.Second {
				worker.signalDisabled = true
				worker.reap()
				emit(worker.final())
				return 6
			}
		}
		select {
		case request := <-requests:
			if request.eof {
				ownerLost = true
			} else {
				emit(worker.stop(request))
			}
		case <-lost:
			ownerLost = true
		case <-parentDone:
			ownerLost = true
			parentDone = nil
		case <-ticker.C:
		}
	}
}
