package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	workspaceapp "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

const usage = `swa serve --data-dir D --port N --protected-roots R [--agent-profile P] --json
swa status|capabilities --json
swa controller open --project P --workdir W --request-id UUID --json
swa controller show|close|recover --controller C [--request-id UUID] --json
swa task create --controller C --spec-file F --request-id UUID --json
swa task show|list|complete|result --controller C [--task T] [--result-file F|--output-dir O] [--request-id UUID] --json
swa worker start --controller C --task T --name A --agent AGENT --model PROVIDER/MODEL [--role developer|reviewer|coordinator] --input-file F --request-id UUID --json
swa worker show|list|read|send|stop|release --controller C [--task T|--dispatch X] [--source transcript --limit 100 --cursor K] [--input-file F] [--request-id UUID] --json
swa request show --controller C|--project P --request-id UUID --json

查询和控制使用 SWA_ENDPOINT、SWA_PROJECT_ID、SWA_PROJECT_TOKEN。
SWA_PROJECT_TOKEN 必须来自当前项目授权。后台启动不会发行项目授权。
可用 --endpoint 明确指定已启动的回环 HTTP 服务；查询不会启动服务。
serve 的 D、F 必须是绝对路径；R 是 Windows 分号分隔的本机 Orca/账户保护目录。
安装及完整调用说明见安装目录 USAGE.md；使用独立目录，保持 serve 所属 stdin 开启。
`

var version = "development"

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	os.Exit(run(ctx, os.Args[1:], os.Stdout, os.Stderr))
}

func run(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	output := cliOutput{stdout: stdout, stderr: stderr}
	if len(args) == 1 && args[0] == "--version" {
		if _, err := fmt.Fprintln(stdout, version); err != nil {
			return output.outputFailure(err)
		}
		return 0
	}
	if len(args) == 0 || args[0] == "help" || args[0] == "--help" {
		if _, err := io.WriteString(stdout, usage); err != nil {
			return output.outputFailure(err)
		}
		return 0
	}
	if args[0] == "serve" {
		return serve(ctx, args[1:], stdout, stderr)
	}
	action, rest := args[0], args[1:]
	if action != "status" && action != "capabilities" {
		if len(rest) == 0 {
			return output.failure("validation_failed", "缺少命令动作", "read_swa_help", 2)
		}
		action, rest = action+"."+rest[0], rest[1:]
	}
	command := workspaceapp.OrcaCommand{Action: action}
	flags := flag.NewFlagSet("swa", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	project := flags.String("project", "", "项目 ID")
	endpoint := flags.String("endpoint", os.Getenv("SWA_ENDPOINT"), "明确的回环 HTTP 服务")
	asJSON := flags.Bool("json", false, "输出 JSON")
	flags.StringVar(&command.Controller, "controller", "", "原生控制端 selector")
	flags.StringVar(&command.TaskID, "task", "", "原生根 Task ID")
	flags.StringVar(&command.DispatchID, "dispatch", "", "原生 Dispatch ID")
	flags.StringVar(&command.RequestID, "request-id", "", "原始 UUID")
	flags.StringVar(&command.Workdir, "workdir", "", "明确项目目录")
	flags.StringVar(&command.SpecFile, "spec-file", "", "固定任务文件")
	flags.StringVar(&command.InputFile, "input-file", "", "明确输入文件")
	flags.StringVar(&command.ResultFile, "result-file", "", "明确结果文件")
	flags.StringVar(&command.OutputDir, "output-dir", "", "不存在的结果目录")
	flags.StringVar(&command.Name, "name", "", "Worker 名称")
	flags.StringVar(&command.Agent, "agent", "", "已批准的 Agent")
	flags.StringVar(&command.Model, "model", "", "已批准的 provider/model")
	flags.StringVar(&command.Role, "role", "", "内置角色 ID，见 capabilities.roles")
	flags.StringVar(&command.Source, "source", "", "明确原件来源")
	flags.StringVar(&command.Cursor, "cursor", "", "原来源 cursor")
	defaultLimit := 0
	if action == "worker.read" {
		defaultLimit = 100
	}
	flags.IntVar(&command.Limit, "limit", defaultLimit, "读取上限，worker read 默认为 100")
	parseError := flags.Parse(rest)
	output.parsedRequest(command)
	output.pretty = !*asJSON
	if parseError != nil || flags.NArg() != 0 {
		return output.failure("validation_failed", "命令参数无效", "read_swa_help", 2)
	}
	command.ProjectID = *project
	if err := workspaceapp.ValidateOrcaCommand(command); err != nil {
		var service *apierrors.ServiceError
		if errors.As(err, &service) {
			return output.failure(string(service.Code), service.Message, service.RequiredAction, failureExit(string(service.Code)))
		}
		return output.failure("validation_failed", err.Error(), "read_swa_help", 2)
	}
	output.validatedCommand(command)
	projectID := *project
	if projectID == "" {
		projectID = os.Getenv("SWA_PROJECT_ID")
	}
	if projectID == "" || strings.ContainsAny(projectID, "/\\?#") {
		return output.failure("validation_failed", "需要明确的项目 ID", "set_current_project_id", 2)
	}
	output.projectID = projectID
	token := os.Getenv("SWA_PROJECT_TOKEN")
	if token == "" {
		return output.failure("scope_denied", "缺少当前项目授权令牌", "obtain_current_project_grant", 3)
	}
	base, err := loopbackEndpoint(*endpoint)
	if err != nil {
		return output.failure("validation_failed", err.Error(), "set_explicit_loopback_endpoint", 2)
	}
	body, err := json.Marshal(command)
	if err != nil {
		return output.failure("validation_failed", err.Error(), "correct_command", 2)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/api/v1/local-projects/"+url.PathEscape(projectID)+"/orca/commands", bytes.NewReader(body))
	if err != nil {
		return output.failure("validation_failed", err.Error(), "correct_endpoint", 2)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	if command.RequestID != "" {
		request.Header.Set("Idempotency-Key", command.RequestID)
	}
	client := &http.Client{Timeout: 150 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return errors.New("SWA refuses redirects") }}
	response, err := client.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			return output.failure("delivery_unknown", "当前 CLI 等待已取消；后台效果按原请求查询", "inspect_original_request", 130)
		}
		var network *net.OpError
		if errors.As(err, &network) && network.Op == "dial" {
			return output.failure("provider_unavailable", "指定 HTTP 服务连接尚未建立", "inspect_explicit_service_endpoint", 4)
		}
		return output.failure("delivery_unknown", "HTTP 结果不可用；保留原始请求 ID", "inspect_original_request", 6)
	}
	defer response.Body.Close()
	traceDiagnostic := func() {
		if trace := response.Header.Get("X-Request-ID"); trace != "" {
			_, _ = fmt.Fprintf(stderr, "HTTP trace=%q status=%d\n", trace, response.StatusCode)
		}
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, 16*1024*1024+1))
	if ctx.Err() != nil && err != nil {
		traceDiagnostic()
		return output.failure("delivery_unknown", "当前 CLI 等待已取消；后台效果按原请求查询", "inspect_original_request", 130)
	}
	if err != nil || len(data) > 16*1024*1024 {
		traceDiagnostic()
		return output.failure("delivery_unknown", "HTTP 响应不完整或超过声明上限", "inspect_original_request", 6)
	}
	reply, err := output.response(data, response.StatusCode)
	if err != nil {
		traceDiagnostic()
		return output.failure("delivery_unknown", err.Error(), "inspect_original_request", 6)
	}
	output.identity = reply
	if reply.Error != nil {
		traceDiagnostic()
	}
	if command.Action == "task.result" && reply.OK && reply.Error == nil && response.StatusCode == http.StatusOK {
		if err := exportResult(command.OutputDir, data); err != nil {
			return output.failure("result_export_failed", err.Error(), "inspect_explicit_output_directory", 7)
		}
	}
	if err := output.publish(reply); err != nil {
		return output.outputFailure(err)
	}
	if reply.Error != nil {
		return failureExit(reply.Error.Code)
	}
	if !reply.OK || response.StatusCode != http.StatusOK {
		return 7
	}
	return 0
}

func loopbackEndpoint(input string) (string, error) {
	u, err := url.Parse(input)
	if err != nil || u.Scheme != "http" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" && u.Path != "/" {
		return "", errors.New("SWA_ENDPOINT 必须是明确的回环 HTTP 地址")
	}
	ip := net.ParseIP(u.Hostname())
	port, err := strconv.Atoi(u.Port())
	if ip == nil || !ip.IsLoopback() || err != nil || port < 1 || port > 65535 {
		return "", errors.New("SWA_ENDPOINT 必须指定回环 IP 和端口")
	}
	return strings.TrimSuffix(u.String(), "/"), nil
}

func failureExit(code string) int {
	switch code {
	case "validation_failed", "invalid_argument", "request_mismatch":
		return 2
	case "scope_denied", "forbidden", "approval_required", "approval_revoked", "worker_identity_changed", "stable_pane_required", "legacy_read_only", "consumer_fenced":
		return 3
	case "provider_unavailable", "unsupported_capability", "structured_agent_session_unsupported":
		return 4
	case "resource_limit", "resource_refused", "orcad_instance_lock_held", "address_in_use":
		return 5
	case "delivery_unknown", "operation_unknown", "start_unknown", "stop_unknown", "release_unknown", "release_pending", "worker_release_unconfirmed", "operation_in_progress", "controller_closing", "controller_unverifiable":
		return 6
	default:
		return 7
	}
}

func exportResult(path string, body []byte) error {
	if !filepath.IsAbs(path) {
		return errors.New("结果目录必须是绝对路径")
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(path))
	if err != nil {
		return err
	}
	actual := filepath.Join(parent, filepath.Base(path))
	if err := os.Mkdir(actual, 0o700); err != nil {
		return fmt.Errorf("创建独占结果目录: %w", err)
	}
	file, err := os.OpenFile(filepath.Join(actual, "result.json"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	_, writeErr := file.Write(body)
	closeErr := file.Close()
	return errors.Join(writeErr, closeErr)
}
