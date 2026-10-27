package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	orcaadapter "github.com/songconmaisaix31-design/Astrocyte/internal/adapters/orca"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/projectfiles"
)

func serve(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	output := cliOutput{stdout: stdout, stderr: stderr, action: "serve"}
	flags := flag.NewFlagSet("swa serve", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	data := flags.String("data-dir", "", "明确的私有数据目录")
	port := flags.Int("port", 0, "明确的回环 HTTP 端口")
	asJSON := flags.Bool("json", false, "输出实际 readiness")
	agentProfile := flags.String("agent-profile", "", "既有原 Orca profile 的只读绝对路径")
	protected := flags.String("protected-roots", os.Getenv("SWA_PROTECTED_ROOTS"), "本机 Orca 及账户受保护目录列表")
	flags.Lookup("protected-roots").DefValue = ""
	webDirectory := flags.String("web-dir", "", "本 combined 安装内 web 的绝对目录；省略时只提供 API")
	parseError := flags.Parse(args)
	output.pretty = !*asJSON
	if errors.Is(parseError, flag.ErrHelp) {
		return writeHelp(&output, flags)
	}
	codexAPIKeyHome := os.Getenv("SWA_CODEX_API_KEY_HOME")
	claudeAPIKeyHome := os.Getenv("SWA_CLAUDE_API_KEY_HOME")
	opencodeAPIKeyHome := os.Getenv("SWA_OPENCODE_API_KEY_HOME")
	if parseError != nil || flags.NArg() != 0 || !filepath.IsAbs(*data) || *agentProfile != "" && !filepath.IsAbs(*agentProfile) || *webDirectory != "" && !filepath.IsAbs(*webDirectory) || codexAPIKeyHome != "" && !filepath.IsAbs(codexAPIKeyHome) || claudeAPIKeyHome != "" && !filepath.IsAbs(claudeAPIKeyHome) || *port < 1 || *port > 65535 || *protected == "" {
		return output.failure("validation_failed", "需要明确的数据目录、端口、受保护目录和绝对路径的可选只读来源", "correct_serve_configuration", 2)
	}
	ownerEOF := errors.New("所属 stdin 已结束")
	ownerError := errors.New("所属 stdin 读取失败")
	ctx, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)
	go func() {
		if _, err := io.Copy(io.Discard, os.Stdin); err != nil {
			cancel(errors.Join(ownerError, err))
			return
		}
		cancel(ownerEOF)
	}()
	cancelled := func() int {
		code := 130
		if errors.Is(context.Cause(ctx), ownerError) {
			code = 6
		}
		return output.failure("delivery_unknown", "启动结果尚未交付，所属等待已取消", "inspect_private_runtime_and_owned_processes", code)
	}
	if ctx.Err() != nil {
		return cancelled()
	}
	if runtime.GOOS != "windows" && runtime.GOOS != "linux" {
		return output.failure("provider_unavailable", "此产品安装候选支持 Windows 和 Linux", "inspect_supported_platform", 4)
	}
	probe, err := net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(*port))
	if err != nil {
		return output.failure("address_in_use", err.Error(), "choose_unused_explicit_port", 5)
	}
	if err := probe.Close(); err != nil {
		return output.failure("provider_unavailable", err.Error(), "inspect_explicit_port", 4)
	}
	executable, err := os.Executable()
	if err != nil {
		return output.failure("provider_unavailable", err.Error(), "inspect_installation", 4)
	}
	install, err := projectfiles.CanonicalRoot(filepath.Dir(executable))
	if err != nil {
		return output.failure("provider_unavailable", err.Error(), "inspect_installation", 4)
	}
	webDir, err := orcaadapter.InstalledWebDirectory(install, *webDirectory)
	if err != nil {
		return output.failure("validation_failed", err.Error(), "inspect_combined_installation_web_assets", 2)
	}
	roots := filepath.SplitList(*protected)
	canonicalData, err := privateDataDirectory(*data, install, roots)
	if err != nil {
		return output.failure("scope_denied", err.Error(), "choose_private_product_roots", 3)
	}
	for _, name := range []string{"home", "temp"} {
		if err := os.MkdirAll(filepath.Join(canonicalData, name), 0o700); err != nil {
			return output.failure("storage_failed", err.Error(), "inspect_private_data_root", 7)
		}
	}
	discoveryHome, err := os.UserHomeDir()
	if err != nil {
		return output.failure("provider_unavailable", err.Error(), "inspect_local_agent_home", 4)
	}
	ownerSecret := make([]byte, 32)
	if _, err := rand.Read(ownerSecret); err != nil {
		return output.failure("provider_unavailable", err.Error(), "inspect_private_owner_capability", 4)
	}
	native, err := orcaadapter.New(orcaadapter.Config{
		InstallRoot: install, DataRoot: canonicalData,
		NodeExecutable:        filepath.Join(install, "node", serviceProgramName("node")),
		ClientEntry:           filepath.Join(install, "runtime", "client.cjs"),
		AgentProfile:          *agentProfile,
		DiscoveryHome:         discoveryHome,
		DiscoveryAppData:      os.Getenv("APPDATA"),
		DiscoveryLocalAppData: os.Getenv("LOCALAPPDATA"),
		DiscoveryCodexHome:    os.Getenv("CODEX_HOME"),
		CodexAPIKeyHome:       codexAPIKeyHome,
		DiscoveryClaudeHome:   os.Getenv("CLAUDE_CONFIG_DIR"),
		ClaudeAPIKeyHome:      claudeAPIKeyHome,
		OpenCodeAPIKeyHome:    opencodeAPIKeyHome,
		DiscoveryPiHome:       os.Getenv("PI_CODING_AGENT_DIR"),
		ProtectedRoots:        roots,
		OwnerCapability:       hex.EncodeToString(ownerSecret),
	})
	if err != nil {
		return output.failure("provider_unavailable", err.Error(), "inspect_installed_runtime", 4)
	}
	samples, err := resourceAdmission(ctx)
	_ = json.NewEncoder(stderr).Encode(map[string]any{"type": "resource_admission", "samples": samples, "accepted": err == nil})
	if err != nil {
		if ctx.Err() != nil {
			return cancelled()
		}
		return output.failure("resource_refused", err.Error(), "inspect_current_resources", 5)
	}
	job, err := ownServiceTree(canonicalData, install)
	if err != nil {
		if errors.Is(err, errServiceAlreadyOwned) {
			return output.failure("orcad_instance_lock_held", err.Error(), "inspect_original_private_service", 5)
		}
		if errors.Is(err, errServiceOwnershipUnknown) {
			return output.failure("operation_unknown", err.Error(), "inspect_original_daemon_and_service_job", 6)
		}
		return output.failure("provider_unavailable", err.Error(), "inspect_owned_service_job", 4)
	}
	var node, server *ownedService
	var stopped *nativeStopped
	finish := func(code int, message string) int {
		if ctx.Err() != nil && !output.attempted {
			code, message = 130, "启动结果尚未交付，所属等待已取消"
		}
		if errors.Is(context.Cause(ctx), ownerError) {
			code, message = 6, context.Cause(ctx).Error()
		}
		// HTTP 先停止接收请求，原生后台随后按自己的资源与daemon关闭条件退出。
		for _, child := range []*ownedService{server, node} {
			if child == nil {
				continue
			}
			closeError := child.closeOwner()
			childCode := child.await(stderr)
			if closeError != nil && !(errors.Is(closeError, os.ErrClosed) && childCode != 6 && child.confirmedExit()) {
				_, _ = fmt.Fprintf(stderr, "所属服务 stdin 关闭失败: %v\n", closeError)
				code = 6
			}
			if childCode == 7 && code == 130 {
				childCode = 6
			}
			if childCode == 6 || childCode == 7 && code != 6 {
				code = childCode
			}
		}
		if node != nil {
			select {
			case <-node.done:
				if stopped == nil && (output.identity.RuntimeID != "" || node.waitError == nil) {
					_, _ = fmt.Fprintln(stderr, "原生空闲关闭尚未确认；保留原请求与资源记录。")
					code = 6
				}
			default:
				code = 6
			}
		}
		if err := job.awaitDescendants(stderr); err != nil {
			_, _ = fmt.Fprintf(stderr, "全部所属后代退出尚未确认: %v\n", err)
			code = 6
		}
		if err := job.close(); err != nil {
			_, _ = fmt.Fprintf(stderr, "所属 Job 句柄关闭失败: %v\n", err)
			code = 6
		}
		if code == 0 {
			return 0
		}
		failureCode := "runtime_error"
		if code == 4 {
			failureCode = "provider_unavailable"
		}
		if code == 6 || code == 130 {
			failureCode = "delivery_unknown"
		}
		return output.failure(failureCode, message, "inspect_private_runtime_and_owned_processes", code)
	}
	if ctx.Err() != nil {
		return finish(130, "启动已取消")
	}
	baseEnv := native.ChildEnvironment()
	ownership, err := json.Marshal(job.ownership)
	if err != nil {
		return finish(7, "实际服务 Job 身份无法编码")
	}
	baseEnv = append(baseEnv, "ASTROCYTE_PORT="+strconv.Itoa(*port), "SWA_LIFECYCLE_STDIN=1", "SWA_SERVICE_JOB="+string(ownership))
	nodeCommand := exec.Command(filepath.Join(install, "node", serviceProgramName("node")), filepath.Join(install, "runtime", "host.cjs"))
	nodeCommand.Env, nodeCommand.Dir, nodeCommand.Stderr = baseEnv, install, stderr
	ready := make(chan nativeStartup, 1)
	node, err = startOwnedService(nodeCommand, func(stream io.Reader) error {
		return readNativeLifecycle(stream, ready, &stopped, canonicalData, nodeCommand.Path)
	})
	if err != nil {
		return finish(4, err.Error())
	}
	if err := job.observeChild(node.command, stderr); err != nil {
		return finish(6, err.Error())
	}
	var nativeReady nativeReadiness
	select {
	case actual := <-ready:
		if actual.err != nil {
			return finish(7, actual.err.Error())
		}
		if err := job.verifyDaemon(actual.ownership); err != nil {
			return finish(6, err.Error())
		}
		nativeReady = actual.readiness
		output.identity.RuntimeID = nativeReady.RuntimeID
	case <-node.done:
		return finish(7, "私有原生后台提前退出")
	case <-ctx.Done():
		return finish(130, "启动已取消")
	case <-time.After(60 * time.Second):
		return finish(6, "原生 readiness 尚未确认")
	}
	if ctx.Err() != nil {
		return finish(130, "启动已取消")
	}
	endpoint := "http://127.0.0.1:" + strconv.Itoa(*port)
	listening := make(chan error, 1)
	serverCommand := exec.Command(filepath.Join(install, serviceProgramName("server")))
	serverCommand.Env, serverCommand.Dir, serverCommand.Stderr = append(baseEnv, "ASTROCYTE_WEB_DIR="+webDir), install, stderr
	server, err = startOwnedService(serverCommand, func(stream io.Reader) error {
		var announcement struct {
			Type   string `json:"type"`
			APIURL string `json:"api_url"`
		}
		decoder := json.NewDecoder(stream)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&announcement); err != nil {
			listening <- err
			return err
		}
		if announcement.Type != "http_listening" || announcement.APIURL != endpoint {
			err := errors.New("所属 HTTP 子进程未确认实际指定监听地址")
			listening <- err
			return err
		}
		listening <- nil
		if err := decoder.Decode(&struct{}{}); err != io.EOF {
			return errors.New("所属 HTTP 子进程返回了额外或损坏的 stdout")
		}
		return nil
	})
	if err != nil {
		return finish(4, err.Error())
	}
	if err := job.observeChild(server.command, stderr); err != nil {
		return finish(6, err.Error())
	}
	var startupError error
	select {
	case startupError = <-listening:
		if startupError == nil {
			startupError = waitHTTPHealth(ctx, endpoint)
		}
	case <-ctx.Done():
		startupError = ctx.Err()
	case <-node.done:
		startupError = errors.New("私有原生后台在 HTTP 就绪前退出")
	case <-server.done:
		startupError = errors.New("私有 HTTP 服务在就绪前退出")
	case <-time.After(15 * time.Second):
		startupError = errors.New("所属 HTTP 子进程监听未确认")
	}
	if startupError != nil {
		return finish(7, startupError.Error())
	}
	if ctx.Err() != nil {
		return finish(130, "启动已取消")
	}
	select {
	case <-node.done:
		return finish(7, "私有原生后台在 readiness 发布前退出")
	case <-server.done:
		return finish(7, "私有 HTTP 服务在 readiness 发布前退出")
	default:
	}
	state := map[string]any{"ok": true, "readiness": nativeReady, "http": endpoint, "data_root": canonicalData, "install_root": install, "runtime_pid": node.command.Process.Pid, "server_pid": server.command.Process.Pid, "resource_samples": samples}
	if err := output.publish(state); err != nil {
		return finish(output.outputFailure(err), "readiness 输出失败")
	}
	select {
	case <-ctx.Done():
		if context.Cause(ctx) == ownerEOF {
			return finish(0, "所属 stdin 已结束")
		}
		return finish(130, "所属服务等待已取消")
	case <-server.done:
		return finish(7, "私有 HTTP 服务意外退出")
	case <-node.done:
		return finish(7, "私有原生后台意外退出")
	}
}

type ownedService struct {
	command              *exec.Cmd
	owner                io.WriteCloser
	done                 chan struct{}
	waitError, readError error
	closeOnce            sync.Once
	closeError           error
}

func startOwnedService(command *exec.Cmd, read func(io.Reader) error) (*ownedService, error) {
	configureServiceChild(command)
	owner, err := command.StdinPipe()
	if err != nil {
		return nil, err
	}
	stream, err := command.StdoutPipe()
	if err != nil {
		return nil, errors.Join(err, owner.Close())
	}
	if err := command.Start(); err != nil {
		return nil, errors.Join(err, owner.Close(), stream.Close())
	}
	child := &ownedService{command: command, owner: owner, done: make(chan struct{})}
	go func() {
		child.readError = read(stream)
		// 先消费实际 stdout 到 EOF，再 Wait，避免 Wait 提前关闭尚未读取的原生确认。
		_, drainError := io.Copy(io.Discard, stream)
		child.readError = errors.Join(child.readError, drainError)
		child.waitError = command.Wait()
		close(child.done)
	}()
	return child, nil
}

func (child *ownedService) closeOwner() error {
	child.closeOnce.Do(func() { child.closeError = child.owner.Close() })
	return child.closeError
}

func (child *ownedService) confirmedExit() bool {
	select {
	case <-child.done:
		state := child.command.ProcessState
		return state != nil && child.command.Process != nil && state.Pid() == child.command.Process.Pid && state.Exited()
	default:
		return false
	}
}

func (child *ownedService) await(stderr io.Writer) int {
	select {
	case <-child.done:
		if !child.confirmedExit() {
			_, _ = fmt.Fprintf(stderr, "所属服务 PID %d 的实际退出状态尚未确认: %v\n", child.command.Process.Pid, child.waitError)
			return 6
		}
		if child.waitError != nil {
			var actualExit *exec.ExitError
			if !errors.As(child.waitError, &actualExit) {
				_, _ = fmt.Fprintf(stderr, "所属服务 PID %d 的等待结果尚未确认: %v\n", child.command.Process.Pid, child.waitError)
				return 6
			}
		}
		if err := errors.Join(child.waitError, child.readError); err != nil {
			_, _ = fmt.Fprintf(stderr, "所属服务 PID %d 退出失败: %v\n", child.command.Process.Pid, err)
			return 7
		}
		return 0
	case <-time.After(15 * time.Second):
		_, _ = fmt.Fprintf(stderr, "所属服务 PID %d 退出尚未确认，保留资源及原请求。\n", child.command.Process.Pid)
		return 6
	}
}

type nativeReadiness struct {
	RuntimeID string `json:"runtimeId"`
	DataRoot  string `json:"dataRoot"`
	Node      string `json:"node"`
}

type nativeStopped struct {
	Type      string `json:"type"`
	RuntimeID string `json:"runtime_id"`
	DataRoot  string `json:"data_root"`
}

type nativeStartup struct {
	readiness nativeReadiness
	ownership serviceJobOwnership
	err       error
}

func readNativeLifecycle(stream io.Reader, ready chan<- nativeStartup, stopped **nativeStopped, data, node string) error {
	decoder := json.NewDecoder(stream)
	decoder.DisallowUnknownFields()
	var first struct {
		OK        bool                 `json:"ok"`
		Readiness nativeReadiness      `json:"readiness"`
		Type      string               `json:"type"`
		RuntimeID string               `json:"runtime_id"`
		DataRoot  string               `json:"data_root"`
		Ownership *serviceJobOwnership `json:"ownership"`
	}
	if err := decoder.Decode(&first); err != nil {
		ready <- nativeStartup{err: err}
		return err
	}
	var final nativeStopped
	if first.OK && first.Type == "" && first.RuntimeID == "" && first.DataRoot == "" && first.Ownership != nil && first.Readiness.RuntimeID != "" && sameServicePath(first.Readiness.DataRoot, data) && sameServicePath(first.Readiness.Node, node) {
		ready <- nativeStartup{readiness: first.Readiness, ownership: *first.Ownership}
		if err := decoder.Decode(&final); err != nil {
			return err
		}
		if final.RuntimeID != first.Readiness.RuntimeID {
			return errors.New("原生关闭确认的 runtime 发生变化")
		}
	} else if !first.OK && first.Type == "swa_runtime_stopped" && first.Readiness == (nativeReadiness{}) {
		ready <- nativeStartup{err: errors.New("原生后台在 readiness 前结束所属关闭")}
		final = nativeStopped{Type: first.Type, RuntimeID: first.RuntimeID, DataRoot: first.DataRoot}
	} else {
		err := errors.New("私有原生后台未返回准确 readiness")
		ready <- nativeStartup{err: err}
		return err
	}
	if final.Type != "swa_runtime_stopped" || final.RuntimeID == "" || !sameServicePath(final.DataRoot, data) {
		return errors.New("私有原生后台的关闭确认无效")
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return errors.New("私有原生后台关闭确认后仍有额外或损坏的输出")
	}
	*stopped = &final
	return nil
}

func serviceProgramName(name string) string {
	if runtime.GOOS == "windows" {
		return name + ".exe"
	}
	return name
}

func waitHTTPHealth(ctx context.Context, endpoint string) error {
	deadline := time.NewTimer(10 * time.Second)
	defer deadline.Stop()
	tick := time.NewTicker(100 * time.Millisecond)
	defer tick.Stop()
	client := &http.Client{Timeout: time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return errors.New("redirect refused") }}
	for {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"/api/v1/health", nil)
		if err != nil {
			return err
		}
		response, err := client.Do(request)
		if err == nil {
			_ = response.Body.Close()
			if response.StatusCode == http.StatusOK {
				return nil
			}
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-deadline.C:
			return errors.New("指定端口的产品 HTTP 健康检查未成功")
		case <-tick.C:
		}
	}
}

func privateDataDirectory(input, install string, protected []string) (string, error) {
	path := filepath.Clean(input)
	if err := requirePlainDataPath(path); err != nil {
		return "", err
	}
	var parts []string
	ancestor := path
	for {
		_, err := os.Stat(ancestor)
		if err == nil {
			break
		}
		if !errors.Is(err, os.ErrNotExist) || filepath.Dir(ancestor) == ancestor {
			return "", err
		}
		parts = append(parts, filepath.Base(ancestor))
		ancestor = filepath.Dir(ancestor)
	}
	actual, err := projectfiles.CanonicalRoot(ancestor)
	if err != nil {
		return "", err
	}
	for i := len(parts) - 1; i >= 0; i-- {
		actual = filepath.Join(actual, parts[i])
	}
	for _, root := range append([]string{install}, protected...) {
		if err := requirePlainDataPath(root); err != nil {
			return "", err
		}
		root, err := projectfiles.CanonicalRoot(root)
		if err != nil {
			return "", err
		}
		if pathContains(root, actual) || pathContains(actual, root) {
			return "", errors.New("产品数据目录与安装目录或受保护目录重叠")
		}
	}
	for _, name := range []string{"home", "temp"} {
		if err := requirePlainDataPath(filepath.Join(actual, name)); err != nil {
			return "", err
		}
	}
	if err := ensurePrivateDataRoot(actual); err != nil {
		return "", err
	}
	return projectfiles.CanonicalRoot(actual)
}

func pathContains(root, path string) bool {
	if runtime.GOOS == "windows" {
		root, path = strings.ToLower(root), strings.ToLower(path)
	}
	rel, err := filepath.Rel(root, path)
	return err == nil && !filepath.IsAbs(rel) && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
