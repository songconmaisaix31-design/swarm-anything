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
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	workspaceapp "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

type runView struct {
	Schema     string `json:"schema"`
	Controller string `json:"controller"`
	RunID      string `json:"run_id"`
	RootTaskID string `json:"root_task_id"`
	Status     string `json:"status"`
	Acceptance string `json:"acceptance"`
	Root       struct {
		ID     string          `json:"id"`
		Status string          `json:"status"`
		Result json.RawMessage `json:"result"`
	} `json:"root"`
	Tasks []struct {
		ID     string          `json:"id"`
		Result json.RawMessage `json:"result"`
	} `json:"tasks"`
	Dispatches        []json.RawMessage     `json:"dispatches"`
	Questions         []runQuestion         `json:"questions"`
	AnsweredQuestions []runAnsweredQuestion `json:"answered_questions"`
	Blockers          []json.RawMessage     `json:"blockers"`
	Failures          []json.RawMessage     `json:"failures"`
	Deliverables      []json.RawMessage     `json:"deliverables"`
	Handoffs          []json.RawMessage     `json:"handoffs"`
	Complete          bool                  `json:"complete"`
	ObservedAt        string                `json:"observed_at"`
}

type runQuestion struct {
	ID                   string `json:"id"`
	TaskID               string `json:"task_id"`
	DispatchID           string `json:"dispatch_id"`
	Question             string `json:"question"`
	ContinuationRequired bool   `json:"continuation_required"`
	ReadState            string `json:"read_state"`
}

type runAnsweredQuestion struct {
	QuestionID           string `json:"question_id"`
	TaskID               string `json:"task_id"`
	DispatchID           string `json:"dispatch_id"`
	Question             string `json:"question"`
	ContinuationRequired bool   `json:"continuation_required"`
	ReadState            string `json:"read_state"`
}

func (question runAnsweredQuestion) actionQuestion() runQuestion {
	return runQuestion{ID: question.QuestionID, TaskID: question.TaskID, DispatchID: question.DispatchID, Question: question.Question, ContinuationRequired: question.ContinuationRequired, ReadState: question.ReadState}
}

type runCallFailure struct {
	code, message, action string
	exit                  int
	temporary             bool
}

type runClient struct {
	base, project, token string
	http                 *http.Client
}

func runWorkflow(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	output := cliOutput{stdout: stdout, stderr: stderr}
	verb := args[0]
	command := workspaceapp.OrcaCommand{Action: "run.show"}
	if verb == "run" {
		command.Action = "run.submit"
	} else if verb == "export" {
		command.Action = "run.export"
	}
	flags := flag.NewFlagSet("swa "+verb, flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	project := flags.String("project", "", "当前项目 ID")
	endpoint := flags.String("endpoint", os.Getenv("SWA_ENDPOINT"), "明确的回环 HTTP 服务")
	flags.Lookup("endpoint").DefValue = ""
	asJSON := flags.Bool("json", false, "输出一个最终 JSON")
	var exportPath string
	timeout := 30 * time.Minute
	onInput := "exit"
	strict := false
	if verb == "run" {
		flags.StringVar(&command.Workdir, "workdir", "", "项目目录")
		flags.StringVar(&command.SpecFile, "spec-file", "", "固定任务文件")
		flags.StringVar(&command.InputFile, "input-file", "", "主 Agent 输入文件")
		flags.StringVar(&command.Agent, "agent", "", "已批准的 Agent")
		flags.StringVar(&command.Model, "model", "", "实际 provider/model")
		flags.StringVar(&command.QuestionMode, "question-mode", "", "disabled 或 native；默认关闭原生问答工具")
		flags.StringVar(&command.Name, "name", "lead", "主 Worker 名称")
		flags.StringVar(&command.RequestID, "request-id", "", "稳定提交 UUID")
		flags.StringVar(&command.RoleID, "role", "", "复用的长期角色 ID")
		flags.Int64Var(&command.Revision, "role-revision", 0, "角色当前版本")
		flags.StringVar(&command.ConversationID, "conversation", "", "关联的讨论会话 ID")
	} else {
		flags.StringVar(&command.Controller, "controller", "", "原控制端")
		flags.StringVar(&command.TaskID, "task", "", "原根 Task ID")
		flags.StringVar(&command.RunID, "run", "", "原 Run ID")
	}
	if verb == "export" {
		flags.StringVar(&exportPath, "output-dir", "", "不存在的绝对导出目录")
	} else {
		flags.StringVar(&exportPath, "export", "", "完成后导出的新绝对目录")
		flags.DurationVar(&timeout, "timeout", timeout, "等待上限，如 90s、5m、2h")
		flags.StringVar(&onInput, "on-input", onInput, "需要回答时 exit 或 wait")
		flags.BoolVar(&strict, "strict", false, "任一递归子任务失败即返回失败")
	}
	parseErr := flags.Parse(args[1:])
	output.parsedRequest(command)
	output.pretty = !*asJSON
	if errors.Is(parseErr, flag.ErrHelp) {
		return writeHelp(&output, flags)
	}
	if parseErr != nil || flags.NArg() != 0 || timeout <= 0 || onInput != "exit" && onInput != "wait" {
		return output.failure("validation_failed", "完整任务命令参数无效", "read_swa_help", 2)
	}
	projectID := *project
	if projectID == "" {
		projectID = os.Getenv("SWA_PROJECT_ID")
	}
	if projectID == "" || strings.ContainsAny(projectID, "/\\?#") {
		return output.failure("validation_failed", "需要明确的项目 ID", "set_current_project_id", 2)
	}
	command.ProjectID = projectID
	if verb == "export" {
		command.OutputDir = exportPath
	}
	if err := workspaceapp.ValidateOrcaCommand(command); err != nil {
		var service *apierrors.ServiceError
		if errors.As(err, &service) {
			return output.failure(string(service.Code), service.Message, service.RequiredAction, failureExit(string(service.Code)))
		}
		return output.failure("validation_failed", err.Error(), "read_swa_help", 2)
	}
	output.projectID = projectID
	output.validatedCommand(command)
	output.identity.RunID = command.RunID
	if exportPath != "" {
		path, err := prepareRunExport(exportPath)
		if err != nil {
			return output.failure("validation_failed", err.Error(), "choose_new_absolute_output_directory", 2)
		}
		exportPath = path
		if verb == "export" {
			command.OutputDir = path
		}
	}
	token := os.Getenv("SWA_PROJECT_TOKEN")
	if token == "" {
		return output.failure("scope_denied", "缺少当前项目授权令牌", "obtain_current_project_grant", 3)
	}
	base, err := loopbackEndpoint(*endpoint)
	if err != nil {
		return output.failure("validation_failed", err.Error(), "set_explicit_loopback_endpoint", 2)
	}
	client := runClient{base: base, project: projectID, token: token, http: &http.Client{Timeout: 150 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return errors.New("SWA refuses redirects") }}}
	if verb == "run" {
		reply, failure := client.call(ctx, command, &output, false)
		if failure != nil {
			return output.failure(failure.code, failure.message, failure.action, failure.exit)
		}
		output.identity = reply
		if reply.Controller == "" || reply.RunID == "" || reply.TaskID == "" {
			return output.failure("delivery_unknown", "提交结果缺少原 Run 或根 Task 身份", "inspect_original_request", 6)
		}
		submitted, _ := json.Marshal(map[string]any{"event": "run_submitted", "request_id": reply.RequestID, "controller": reply.Controller, "run_id": reply.RunID, "task_id": reply.TaskID, "dispatch_id": reply.DispatchID})
		if _, err := fmt.Fprintln(stderr, string(submitted)); err != nil {
			return output.outputFailure(err)
		}
		command = workspaceapp.OrcaCommand{Action: "run.show", ProjectID: projectID, Controller: reply.Controller, RunID: reply.RunID, TaskID: reply.TaskID}
		writeRunReconnect(&output)
	}
	if verb == "export" {
		reply, failure := client.call(ctx, command, &output, true)
		if failure != nil {
			return output.failure(failure.code, failure.message, failure.action, failure.exit)
		}
		output.identity = reply
		if err := writeRunExport(exportPath, reply); err != nil {
			return output.failure("result_export_failed", err.Error(), "inspect_explicit_output_directory", 7)
		}
		if err := output.publish(reply); err != nil {
			return output.outputFailure(err)
		}
		return 0
	}
	waitCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	var previousProgress []byte
	for {
		reply, failure := client.call(waitCtx, command, &output, true)
		if failure != nil {
			if waitCtx.Err() != nil {
				return finishRunWaitContext(&output, ctx)
			}
			if !failure.temporary {
				return output.failure(failure.code, failure.message, failure.action, failure.exit)
			}
			progress, _ := json.Marshal(map[string]any{"event": "run_reconnecting", "run_id": command.RunID, "reason": failure.code})
			if !bytes.Equal(progress, previousProgress) {
				if _, err := fmt.Fprintln(stderr, string(progress)); err != nil {
					return output.outputFailure(err)
				}
				previousProgress = progress
			}
		} else {
			output.identity = reply
			view, err := decodeRunView(reply)
			if err != nil {
				return output.failure("delivery_unknown", err.Error(), "inspect_original_run", 6)
			}
			progress, _ := json.Marshal(map[string]any{"event": "run_progress", "run_id": view.RunID, "task_id": view.RootTaskID, "status": view.Status, "acceptance": view.Acceptance, "complete": view.Complete, "tasks": len(view.Tasks), "failures": len(view.Failures), "questions": len(view.Questions), "blockers": view.Blockers, "handoffs": len(view.Handoffs)})
			if !bytes.Equal(progress, previousProgress) {
				if _, err := fmt.Fprintln(stderr, string(progress)); err != nil {
					return output.outputFailure(err)
				}
				previousProgress = progress
			}
			if view.Status == "unknown" {
				return output.failure("operation_unknown", "后端尚不能确认完整任务状态", "inspect_original_run", 6)
			}
			if view.Status == "waiting_input" && onInput == "exit" {
				action, err := writeRunQuestionActions(&output, view)
				if err != nil {
					return output.outputFailure(err)
				}
				writeRunReconnect(&output)
				return output.failure("run_input_required", "该 Run 需要回答或确认原问题的继续状态；按所示原请求指引操作", action, 9)
			}
			if view.Complete {
				if exportPath != "" {
					exportCommand := command
					exportCommand.Action, exportCommand.OutputDir = "run.export", exportPath
					exported, exportFailure := client.call(waitCtx, exportCommand, &output, true)
					if exportFailure != nil {
						if waitCtx.Err() != nil {
							return finishRunWaitContext(&output, ctx)
						}
						return output.failure(exportFailure.code, exportFailure.message, exportFailure.action, exportFailure.exit)
					}
					output.identity = exported
					if err := writeRunExport(exportPath, exported); err != nil {
						return output.failure("result_export_failed", err.Error(), "inspect_explicit_output_directory", 7)
					}
					reply = exported
				}
				if view.Status == "failed" || strict && len(view.Failures) > 0 {
					return output.failure("run_failed", "Run 或严格检查中的子任务失败", "inspect_original_run", 7)
				}
				if view.Status != "completed" {
					return output.failure("delivery_unknown", "后端完整任务状态不一致", "inspect_original_run", 6)
				}
				if err := output.publish(reply); err != nil {
					return output.outputFailure(err)
				}
				return 0
			}
		}
		timer := time.NewTimer(time.Second)
		select {
		case <-waitCtx.Done():
			timer.Stop()
			return finishRunWaitContext(&output, ctx)
		case <-timer.C:
		}
	}
}

func (c *runClient) call(ctx context.Context, command workspaceapp.OrcaCommand, output *cliOutput, observe bool) (workspaceapp.OrcaEnvelope, *runCallFailure) {
	var empty workspaceapp.OrcaEnvelope
	body, err := json.Marshal(command)
	if err != nil {
		return empty, &runCallFailure{code: "validation_failed", message: "命令无法编码", action: "correct_command", exit: 2}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/api/v1/local-projects/"+url.PathEscape(c.project)+"/orca/commands", bytes.NewReader(body))
	if err != nil {
		return empty, &runCallFailure{code: "validation_failed", message: "命令地址无效", action: "correct_endpoint", exit: 2}
	}
	request.Header.Set("Authorization", "Bearer "+c.token)
	request.Header.Set("Content-Type", "application/json")
	if command.RequestID != "" {
		request.Header.Set("Idempotency-Key", command.RequestID)
	}
	response, err := c.http.Do(request)
	if err != nil {
		code, exit := "delivery_unknown", 6
		var network *net.OpError
		isNetwork := errors.As(err, &network)
		if isNetwork && network.Op == "dial" {
			code, exit = "provider_unavailable", 4
		}
		var networkTimeout net.Error
		transient := isNetwork || errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) || errors.As(err, &networkTimeout) && networkTimeout.Timeout()
		if ctx.Err() != nil {
			exit = 130
		}
		return empty, &runCallFailure{code: code, message: "HTTP 结果未确认；保留原请求和 Run 身份", action: "inspect_original_request", exit: exit, temporary: observe && transient}
	}
	defer response.Body.Close()
	responseLimit := workspaceapp.OrcaResponseByteLimit(command.Action)
	data, err := io.ReadAll(io.LimitReader(response.Body, responseLimit+1))
	if err != nil || int64(len(data)) > responseLimit {
		return empty, &runCallFailure{code: "delivery_unknown", message: "HTTP 响应不完整或超过声明上限", action: "inspect_original_run", exit: 6, temporary: observe && err != nil}
	}
	reply, err := output.response(data, response.StatusCode)
	if err != nil {
		return empty, &runCallFailure{code: "delivery_unknown", message: err.Error(), action: "inspect_original_run", exit: 6, temporary: observe && (response.StatusCode == 502 || response.StatusCode == 503 || response.StatusCode == 504)}
	}
	if reply.Error != nil {
		output.identity = reply
		return empty, &runCallFailure{code: reply.Error.Code, message: reply.Error.Message, action: reply.Error.RequiredAction, exit: failureExit(reply.Error.Code)}
	}
	if !reply.OK || response.StatusCode != http.StatusOK {
		return empty, &runCallFailure{code: "operation_unknown", message: "服务未确认完整任务查询", action: "inspect_original_run", exit: 6}
	}
	if observe && (reply.Controller != command.Controller || reply.RunID != command.RunID || reply.TaskID != command.TaskID) {
		return empty, &runCallFailure{code: "delivery_unknown", message: "响应改变了原 Run、根 Task 或控制端身份", action: "inspect_original_run", exit: 6}
	}
	return reply, nil
}

func decodeRunView(reply workspaceapp.OrcaEnvelope) (runView, error) {
	var content struct {
		Native struct {
			View *runView `json:"run_view"`
		} `json:"native"`
	}
	data, err := json.Marshal(reply.Result)
	if err == nil {
		err = json.Unmarshal(data, &content)
	}
	if err != nil || content.Native.View == nil {
		return runView{}, errors.New("完整任务响应缺少 Run 视图")
	}
	view := *content.Native.View
	if view.Schema != "swa.run-view.v1" || view.Controller != reply.Controller || view.RunID != reply.RunID || view.RootTaskID != reply.TaskID || view.Root.ID != reply.TaskID || view.ObservedAt == "" {
		return runView{}, errors.New("Run 视图的版本或原身份不符")
	}
	if view.Tasks == nil || view.Dispatches == nil || view.Questions == nil || view.AnsweredQuestions == nil || view.Blockers == nil || view.Failures == nil || view.Deliverables == nil || view.Handoffs == nil || view.Acceptance != "unreviewed" {
		return runView{}, errors.New("Run 视图缺少完整任务、阻塞或失败集合")
	}
	seen := make(map[string]bool, len(view.Tasks))
	for _, task := range view.Tasks {
		if task.ID == "" || seen[task.ID] {
			return runView{}, errors.New("Run 任务集合缺少身份或包含重复身份")
		}
		seen[task.ID] = true
	}
	if !seen[view.RootTaskID] {
		return runView{}, errors.New("Run 任务集合缺少原根任务")
	}
	questionIDs := make(map[string]bool, len(view.Questions))
	questions := append([]runQuestion{}, view.Questions...)
	for _, answer := range view.AnsweredQuestions {
		questions = append(questions, answer.actionQuestion())
	}
	for _, question := range questions {
		if question.ID == "" || questionIDs[question.ID] || question.DispatchID == "" || !seen[question.TaskID] || strings.TrimSpace(question.Question) == "" {
			return runView{}, errors.New("原问题缺少准确身份、正文或原 Task 关联")
		}
		questionIDs[question.ID] = true
		if question.ContinuationRequired && question.ReadState != "continuation_required" {
			return runView{}, errors.New("问题继续操作缺少确切的原读取状态")
		}
	}
	if view.Status == "waiting_input" && len(view.Questions) == 0 && len(view.AnsweredQuestions) == 0 {
		return runView{}, errors.New("等待回答的 Run 没有提供原问题")
	}
	switch view.Status {
	case "active", "waiting_input", "blocked", "completed", "failed", "unknown":
	default:
		return runView{}, errors.New("Run 视图状态未知")
	}
	if view.Status == "completed" && !view.Complete {
		return runView{}, errors.New("Run 完成状态未包含完整结算")
	}
	return view, nil
}

func finishRunWaitContext(output *cliOutput, parent context.Context) int {
	writeRunReconnect(output)
	if parent.Err() != nil {
		return output.failure("run_wait_cancelled", "当前等待已取消，原任务继续运行", "wait_for_original_run", 130)
	}
	return output.failure("run_wait_timed_out", "等待超时，原任务继续运行", "wait_for_original_run", 8)
}

func writeRunReconnect(output *cliOutput) {
	quote := func(value string) string { return quoteRunArgument(value, runtime.GOOS) }
	r := output.identity
	if r.Controller != "" && r.TaskID != "" && r.RunID != "" {
		command := fmt.Sprintf("swa wait --project %s --controller %s --task %s --run %s --json", quote(output.projectID), quote(r.Controller), quote(r.TaskID), quote(r.RunID))
		encoded, _ := json.Marshal(map[string]any{"event": "run_reconnect", "controller": r.Controller, "run_id": r.RunID, "task_id": r.TaskID, "command": command})
		_, _ = fmt.Fprintln(output.stderr, string(encoded))
	}
}

func quoteRunArgument(value, platform string) string {
	if platform == "windows" {
		return "'" + strings.ReplaceAll(value, "'", "''") + "'"
	}
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func runQuestionCommand(projectID string, view runView, question runQuestion, platform string) string {
	quote := func(value string) string { return quoteRunArgument(value, platform) }
	if question.ContinuationRequired {
		return fmt.Sprintf("swa question resume --project %s --controller %s --run %s --task %s --dispatch %s --question %s --request-id %s --json", quote(projectID), quote(view.Controller), quote(view.RunID), quote(view.RootTaskID), quote(question.DispatchID), quote(question.ID), quote("<NEW_UUID>"))
	}
	return fmt.Sprintf("swa question answer --project %s --controller %s --run %s --task %s --dispatch %s --question %s --input-file %s --request-id %s --json", quote(projectID), quote(view.Controller), quote(view.RunID), quote(view.RootTaskID), quote(question.DispatchID), quote(question.ID), quote("<ANSWER_FILE>"), quote("<NEW_UUID>"))
}

func writeRunQuestionActions(output *cliOutput, view runView) (string, error) {
	var first string
	questions := append([]runQuestion{}, view.Questions...)
	for _, question := range view.AnsweredQuestions {
		if question.ContinuationRequired {
			questions = append(questions, question.actionQuestion())
		}
	}
	for _, question := range questions {
		command := runQuestionCommand(output.projectID, view, question, runtime.GOOS)
		if first == "" {
			first = command
		}
		required := []string{"NEW_UUID: 此次操作首次发送前保存的规范 UUID"}
		if !question.ContinuationRequired {
			required = append(required, "ANSWER_FILE: 当前项目获准的回答文件")
		}
		encoded, err := json.Marshal(map[string]any{"event": "run_question", "run_id": view.RunID, "task_id": view.RootTaskID, "dispatch_id": question.DispatchID, "question_id": question.ID, "command": command, "required_values": required})
		if err != nil {
			return "", err
		}
		if _, err := fmt.Fprintln(output.stderr, string(encoded)); err != nil {
			return "", err
		}
	}
	if first == "" {
		quote := func(value string) string { return quoteRunArgument(value, runtime.GOOS) }
		first = fmt.Sprintf("swa wait --project %s --controller %s --run %s --task %s --json", quote(output.projectID), quote(view.Controller), quote(view.RunID), quote(view.RootTaskID))
	}
	return first, nil
}

func prepareRunExport(path string) (string, error) {
	if !filepath.IsAbs(path) || filepath.Clean(path) != path || filepath.Base(path) == "." {
		return "", errors.New("导出目录必须是规范的绝对路径")
	}
	parent, err := filepath.EvalSymlinks(filepath.Dir(path))
	if err != nil {
		return "", fmt.Errorf("导出父目录不可用: %w", err)
	}
	if runtime.GOOS == "windows" {
		if err := requirePlainDataPath(filepath.Dir(path)); err != nil {
			return "", errors.New("导出父路径不能经过符号链接或重解析点")
		}
	} else if parent != filepath.Dir(path) {
		return "", errors.New("导出父路径不能经过符号链接或重解析点")
	}
	if _, err := os.Lstat(path); err == nil {
		return "", errors.New("导出目录必须不存在")
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	return path, nil
}

func writeRunExport(path string, reply workspaceapp.OrcaEnvelope) error {
	view, err := decodeRunView(reply)
	if err != nil {
		return err
	}
	if !view.Complete {
		return errors.New("Run 尚未完整结算，不能导出最终成果")
	}
	var content struct {
		Native struct {
			View   json.RawMessage `json:"run_view"`
			Result json.RawMessage `json:"result"`
		} `json:"native"`
	}
	body, err := json.Marshal(reply.Result)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(body, &content); err != nil {
		return err
	}
	if len(content.Native.Result) == 0 || bytes.Equal(content.Native.Result, []byte("null")) {
		return errors.New("后端未返回完整原生成果")
	}
	type textArtifact struct {
		TaskID string `json:"task_id"`
		File   string `json:"file"`
		Text   string `json:"-"`
	}
	artifacts := []textArtifact{}
	for _, task := range view.Tasks {
		if len(task.Result) == 0 || bytes.Equal(task.Result, []byte("null")) {
			continue
		}
		var text string
		if err := json.Unmarshal(task.Result, &text); err != nil {
			return errors.New("实际任务成果文本格式不可导出")
		}
		if text != "" {
			artifacts = append(artifacts, textArtifact{TaskID: task.ID, File: fmt.Sprintf("results/task-%04d.md", len(artifacts)+1), Text: text})
		}
	}
	if _, err := prepareRunExport(path); err != nil {
		return err
	}
	if err := os.Mkdir(path, 0o700); err != nil {
		return err
	}
	write := func(name string, data []byte) error {
		file, err := os.OpenFile(filepath.Join(path, name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if err != nil {
			return err
		}
		_, writeErr := file.Write(append(data, '\n'))
		return errors.Join(writeErr, file.Close())
	}
	if err := write("run.json", content.Native.View); err != nil {
		return err
	}
	if err := write("result.json", content.Native.Result); err != nil {
		return err
	}
	if err := os.Mkdir(filepath.Join(path, "results"), 0o700); err != nil {
		return err
	}
	for _, artifact := range artifacts {
		if err := write(filepath.FromSlash(artifact.File), []byte(artifact.Text)); err != nil {
			return err
		}
	}
	index, err := json.Marshal(artifacts)
	if err != nil {
		return err
	}
	if err := write(filepath.Join("results", "index.json"), index); err != nil {
		return err
	}
	return nil
}
