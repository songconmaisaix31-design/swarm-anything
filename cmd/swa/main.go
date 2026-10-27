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
	"unicode/utf8"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	workspaceapp "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

const usage = `swa serve --data-dir D --port N --protected-roots R [--agent-profile P] [--web-dir INSTALL/web] --json
swa status|capabilities --json
swa run --project P --workdir W --spec-file F --input-file I --request-id UUID [--agent A --model M] [--role ID --role-revision N] [--question-mode disabled|native] [--delegation-mode disabled|native] [--name lead] [--conversation ID] [--timeout 30m] [--on-input exit|wait] [--strict] [--export O] --json
swa wait --controller C --task T --run R [--timeout 30m] [--on-input exit|wait] [--strict] [--export O] --json
swa export --controller C --task T --run R --output-dir O [--audit] --json
swa question answer --controller C --run R --task T --dispatch D --question Q --input-file F --request-id UUID --json
swa question resume --controller C --run R --task T --dispatch D --question Q --request-id UUID --json
swa controller open --project P --workdir W --request-id UUID --json
swa controller show|close|recover --controller C [--request-id UUID] --json
swa task create --controller C --spec-file F --request-id UUID --json
swa task show|list|complete|result --controller C [--task T] [--result-file F|--output-dir O] [--request-id UUID] --json
swa worker start --controller C --task T --name NAME --input-file F --request-id UUID [--agent AGENT --model PROVIDER/MODEL] [--role ID --role-revision N] [--parent-task T --completion-criterion TEXT ...] [--handoff-mode work|consult] [--reply-mode poll|resume] [--question-mode disabled|native] [--delegation-mode disabled|native] --json
swa worker show|list|read|send|stop|release --controller C [--task T|--dispatch X] [--source transcript --limit 100 --cursor K] [--input-file F] [--request-id UUID] --json
swa request show --controller C|--project P --request-id UUID --json
swa role create --project P --role-file F --request-id UUID --json
swa role update --project P --role ID --role-revision N --role-file F --request-id UUID --json
swa role list|show|archive --project P [--role ID] [--role-revision N --request-id UUID] --json

查询和控制使用 SWA_ENDPOINT、SWA_PROJECT_ID、SWA_PROJECT_TOKEN。
SWA_PROJECT_TOKEN 必须来自当前项目授权。后台启动不会发行项目授权。
SWA_CODEX_API_KEY_HOME 仅选择显式独立的 Codex API-key 来源目录；缺省未配置，不使用原 CODEX_HOME 登录。
SWA_CLAUDE_API_KEY_HOME 仅选择显式独立的 Claude API-key 来源目录；缺省未配置，不使用原 Claude 登录。
可用 --endpoint 明确指定已启动的回环 HTTP 服务；查询不会启动服务。
serve 的数据目录、可选 profile 与网页目录必须是绝对路径；R 是本机 Orca/账户保护目录列表，Windows 用分号分隔，Linux 用冒号分隔。
--web-dir 仅接受 combined 安装中的 web 绝对目录，由同一 HTTP 服务提供网页。
task spec 的 max_workers 是任务批准创建或预留的 Worker 总席位；已完成或释放的 child Task 仍计数，不自动归还席位。每次 start 使用独立名称、输入与 request ID。
业务 --json 调用只输出一个 JSON 结果；help/--help/--version 输出本地文本，不连接服务。
退出码：0=命令成功，2=参数错误，3=权限或批准不足，4=能力不可用，5=资源拒绝，6=效果未知，7=运行或导出失败，8=等待超时，9=需要用户回答，130=等待已取消。
run 默认等待同一 Run 的全部递归任务；wait 只读重连，--strict 在任一子任务失败时返回7。
question-mode 默认关闭；native 仅为实际 Pi 开放固定 swa_ask 问答工具。question resume 只在原问题已答且原 Worker 需要显式继续时使用，不接受自定义输入。
delegation-mode 默认关闭；native 仅为 Pi 开放项目明确许可的 swa_delegate，省略时继承角色默认值。它与 question-mode 独立。
run/wait 的超时和 Ctrl-C 仅结束当前等待；stderr 显示进度和原 Run 重连命令。
普通查询/控制的 Ctrl-C 只取消当前 CLI 等待，不停止 Worker；serve 的 Ctrl-C/所属 stdin 结束会关闭本次所属服务。
安装及完整调用说明见安装目录 USAGE.md；使用独立目录，保持 serve 所属 stdin 开启。
`

var version = "development"

type completionCriteria []string

func (criteria *completionCriteria) String() string { return strings.Join(*criteria, ", ") }
func (criteria *completionCriteria) Set(value string) error {
	*criteria = append(*criteria, value)
	return nil
}

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
	if args[0] == "run" || args[0] == "wait" || args[0] == "export" {
		return runWorkflow(ctx, args, stdout, stderr)
	}
	action, rest := args[0], args[1:]
	if action != "status" && action != "capabilities" {
		if len(rest) == 0 {
			return output.failure("validation_failed", "缺少命令动作", "read_swa_help", 2)
		}
		if (rest[0] == "--help" || rest[0] == "-h") && (action == "controller" || action == "task" || action == "worker" || action == "request" || action == "question" || action == "role") {
			return writeHelp(&output, nil)
		}
		action, rest = action+"."+rest[0], rest[1:]
	}
	command := workspaceapp.OrcaCommand{Action: action}
	flags := flag.NewFlagSet("swa", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	project := flags.String("project", "", "项目 ID")
	endpoint := flags.String("endpoint", os.Getenv("SWA_ENDPOINT"), "明确的回环 HTTP 服务")
	flags.Lookup("endpoint").DefValue = ""
	asJSON := flags.Bool("json", false, "输出 JSON")
	flags.StringVar(&command.Controller, "controller", "", "原生控制端 selector")
	flags.StringVar(&command.TaskID, "task", "", "原生根 Task ID")
	flags.StringVar(&command.RunID, "run", "", "原生 Run ID")
	flags.StringVar(&command.DispatchID, "dispatch", "", "原生 Dispatch ID")
	flags.StringVar(&command.QuestionID, "question", "", "原生问题 ID")
	flags.StringVar(&command.RequestID, "request-id", "", "原始 UUID")
	flags.StringVar(&command.Workdir, "workdir", "", "明确项目目录")
	flags.StringVar(&command.SpecFile, "spec-file", "", "固定任务文件")
	flags.StringVar(&command.InputFile, "input-file", "", "明确输入文件")
	flags.StringVar(&command.ResultFile, "result-file", "", "明确结果文件")
	flags.StringVar(&command.OutputDir, "output-dir", "", "不存在的结果目录")
	flags.StringVar(&command.Name, "name", "", "Worker 名称")
	flags.StringVar(&command.Agent, "agent", "", "已批准的 Agent")
	flags.StringVar(&command.Model, "model", "", "已批准的 provider/model")
	flags.StringVar(&command.RoleID, "role", "", "角色 ID")
	flags.Int64Var(&command.Revision, "role-revision", 0, "角色当前版本")
	roleFile := flags.String("role-file", "", "创建或更新角色的 JSON 文件")
	flags.StringVar(&command.ParentTaskID, "parent-task", "", "同一 Run 中的父 Task ID")
	flags.StringVar(&command.HandoffMode, "handoff-mode", "", "work 或 consult")
	flags.StringVar(&command.ReplyMode, "reply-mode", "", "poll 或 resume")
	flags.Var((*completionCriteria)(&command.CompletionCriteria), "completion-criterion", "完成条件；可重复")
	flags.StringVar(&command.QuestionMode, "question-mode", "", "disabled 或 native；只在启动时选择")
	flags.StringVar(&command.DelegationMode, "delegation-mode", "", "disabled 或 native；只在启动时选择")
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
	if errors.Is(parseError, flag.ErrHelp) {
		return writeHelp(&output, flags)
	}
	if parseError != nil || flags.NArg() != 0 {
		return output.failure("validation_failed", "命令参数无效", "read_swa_help", 2)
	}
	if *roleFile != "" {
		if command.Action != "role.create" && command.Action != "role.update" {
			return output.failure("validation_failed", "--role-file 仅用于创建或更新角色", "read_swa_help", 2)
		}
		var err error
		command.Role, err = readRoleDefinition(*roleFile)
		if err != nil {
			return output.failure("validation_failed", "角色文件须为不超过 256 KiB 的普通 UTF-8 JSON 文件，且只包含角色定义字段", "correct_role_file", 2)
		}
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
	responseLimit := workspaceapp.OrcaResponseByteLimit(command.Action)
	data, err := io.ReadAll(io.LimitReader(response.Body, responseLimit+1))
	if ctx.Err() != nil && err != nil {
		traceDiagnostic()
		return output.failure("delivery_unknown", "当前 CLI 等待已取消；后台效果按原请求查询", "inspect_original_request", 130)
	}
	if err != nil || int64(len(data)) > responseLimit {
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

func readRoleDefinition(path string) (*workspaceapp.OrcaRoleDefinition, error) {
	const limit = 256 * 1024
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > limit {
		return nil, errors.New("role definition must be a bounded regular file")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	info, err = file.Stat()
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() > limit {
		return nil, errors.New("role definition must be a bounded regular file")
	}
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, err
	}
	if len(data) > limit || !utf8.Valid(data) {
		return nil, errors.New("role definition must be bounded UTF-8")
	}
	var role *workspaceapp.OrcaRoleDefinition
	if err := decodeOneJSON(data, &role); err != nil {
		return nil, err
	}
	if role == nil {
		return nil, errors.New("role definition must be an object")
	}
	return role, nil
}

func writeHelp(output *cliOutput, flags *flag.FlagSet) int {
	var text bytes.Buffer
	text.WriteString(usage)
	if flags != nil {
		text.WriteString("\n共享选项；每项动作只接受上述用法中的字段：\n")
		flags.SetOutput(&text)
		flags.PrintDefaults()
	}
	if _, err := io.Copy(output.stdout, &text); err != nil {
		return output.outputFailure(err)
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
