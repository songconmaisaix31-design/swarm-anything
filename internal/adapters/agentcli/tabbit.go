package agentcli

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
)

// DiagnoseTabbit 只检查官方 launcher 的 diagnose；退出成功不代表已执行网页任务。
func DiagnoseTabbit(ctx context.Context, entry Entry) error {
	if entry.ID != "tabbit" {
		return errors.New("此检查只支持 Tabbit 浏览器工具")
	}
	path, err := ResolveEntry(entry)
	if err != nil {
		return errors.New("未找到可用的 Tabbit CLI，请安装并打开官方 Tabbit")
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	cmd, err := ownedCommand(ctx, path, []string{"diagnose"})
	if err != nil {
		return errors.New("无法准备 Tabbit CLI 诊断")
	}
	// 上游诊断可能打印本机路径和浏览器实例标识，只报告退出状态。
	cmd.Stdout, cmd.Stderr = io.Discard, io.Discard
	cleanup, err := startOwned(cmd)
	if err != nil {
		return errors.New("无法启动 Tabbit CLI 诊断")
	}
	defer cleanup()
	err = cmd.Wait()
	if ctx.Err() != nil {
		return errors.New("Tabbit CLI 诊断未在规定时间内完成")
	}
	if err != nil {
		return errors.New("Tabbit CLI 诊断未通过，请在本机检查官方启动器和正在运行的浏览器")
	}
	return nil
}

const (
	tabbitFixtureURL   = "https://go.tabbit.ai/blog/tabbit-cli-complete-guide/fixture.html"
	tabbitFixtureTitle = "Tabbit CLI task space practice"
	tabbitFixtureID    = "DEMO-F08"
	tabbitFixtureCode  = `
await page.goto("https://go.tabbit.ai/blog/tabbit-cli-complete-guide/fixture.html", {waitUntil: "domcontentloaded", timeout: 9000});
if (page.url() !== "https://go.tabbit.ai/blog/tabbit-cli-complete-guide/fixture.html") throw new Error("unexpected fixture URL");
const title = await page.getByRole("heading", {name: "Tabbit CLI task space practice", exact: true}).innerText({timeout: 3000});
const source = page.locator("#source");
const before = await source.isVisible();
if (before) throw new Error("fixture was already expanded");
await page.locator("details > summary").filter({hasText: /^Show source details$/}).click({timeout: 3000});
await source.waitFor({state: "visible", timeout: 3000});
return {url: page.url(), title, before, source: (await source.innerText()).trim()};
`
)

// TabbitVerification 只记录本次测试的标识和公开样例，不返回浏览器配置或上游原文。
type TabbitVerification struct {
	SchemaVersion   int    `json:"schema_version"`
	AgentID         string `json:"agent_id"`
	State           string `json:"state"`
	TaskName        string `json:"task_name"`
	RequestID       string `json:"request_id"`
	Fixture         string `json:"fixture"`
	CleanupVerified bool   `json:"cleanup_verified"`
}

type tabbitFrame struct {
	Status    string `json:"status"`
	RequestID string `json:"requestId"`
	Task      *struct {
		ID              string `json:"taskId"`
		Name            string `json:"taskName"`
		Reused          bool   `json:"reused"`
		ClaimedTabCount int    `json:"claimedTabCount"`
	} `json:"task"`
	Result *struct {
		Value json.RawMessage `json:"value"`
	} `json:"result"`
	Receipt   *tabbitFrame `json:"receipt"`
	Finished  bool         `json:"finished"`
	Keep      *bool        `json:"keep"`
	ClosedIDs []int64      `json:"closedTabIds"`
}

// VerifyTabbit 只对官方公开演练页执行固定检查。使用一次连接和一个全新的任务，
// 不检查、接管、恢复或关闭调用前已有的标签页。
func VerifyTabbit(ctx context.Context, entry Entry) (report TabbitVerification, err error) {
	if entry.ID != "tabbit" {
		return report, errors.New("此验收只支持 Tabbit 浏览器工具")
	}
	path, err := ResolveEntry(entry)
	if err != nil {
		return report, errors.New("未找到可用的 Tabbit CLI，请安装并打开官方 Tabbit")
	}
	id, err := uuid.NewRandom()
	if err != nil {
		return report, errors.New("无法创建本次 Tabbit 验收标识")
	}
	report = TabbitVerification{
		SchemaVersion: 1, AgentID: entry.ID, State: "unverified",
		TaskName: "SWA-practice-" + id.String(), RequestID: "swa-practice-" + id.String(), Fixture: "official_cli_practice",
	}
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	cmd, err := ownedCommand(ctx, path, []string{"persistent"})
	if err != nil {
		return report, errors.New("无法准备 Tabbit CLI 持久连接")
	}
	cmd.Stderr = io.Discard
	input, err := cmd.StdinPipe()
	if err != nil {
		return report, errors.New("无法建立 Tabbit CLI 输入管道")
	}
	defer input.Close()
	output, err := cmd.StdoutPipe()
	if err != nil {
		return report, errors.New("无法建立 Tabbit CLI 输出管道")
	}
	defer output.Close()
	done, err := startOwned(cmd)
	if err != nil {
		return report, errors.New("无法启动 Tabbit CLI 持久连接")
	}
	defer done()
	defer func() {
		// 向启动器送 EOF，留出短暂时间正常退出，再由所属进程回收。
		_ = input.Close()
		stop := time.AfterFunc(2*time.Second, cancel)
		defer stop.Stop()
		if waitErr := cmd.Wait(); waitErr != nil && err == nil {
			report.State = "unverified"
			err = fmt.Errorf("Tabbit CLI 未正常退出（任务 %s，请求 %s）", report.TaskName, report.RequestID)
		}
	}()
	return verifyTabbitFixture(input, output, report)
}

func verifyTabbitFixture(input io.Writer, output io.Reader, report TabbitVerification) (TabbitVerification, error) {
	encoder := json.NewEncoder(input)
	scanner := bufio.NewScanner(output)
	scanner.Buffer(make([]byte, 4<<10), 64<<10)
	synchronized := true
	exchange := func(frame any) (reply tabbitFrame, err error) {
		if !synchronized {
			return reply, errors.New("Tabbit CLI 已失去同步")
		}
		synchronized = false
		if err := encoder.Encode(frame); err != nil || !scanner.Scan() || json.Unmarshal(scanner.Bytes(), &reply) != nil {
			return reply, errors.New("未收到有效的 Tabbit CLI 回执")
		}
		synchronized = true
		return reply, nil
	}
	fail := func(phase string) (TabbitVerification, error) {
		return report, fmt.Errorf("未能确认 Tabbit 验收的%s（任务 %s，请求 %s）", phase, report.TaskName, report.RequestID)
	}
	// 上游新旧两代支持的求值超时交集从 60 秒开始；页面自己的交互超时较短。
	invoke := map[string]any{"op": "bootstrap", "taskName": report.TaskName, "requestId": report.RequestID, "code": tabbitFixtureCode, "timeoutMs": 60000}
	reply, err := exchange(invoke)
	if err != nil || reply.Task == nil || reply.Task.ID == "" || reply.Task.Name != report.TaskName || reply.Task.Reused || reply.Task.ClaimedTabCount != 0 {
		return fail("任务身份")
	}
	// 同一连接内已证实任务身份。不重新打开连接，不重送 bootstrap。
	workVerified := false
	if reply.RequestID != "" && reply.RequestID != report.RequestID {
		return fail("请求身份")
	}
	if reply.Status == "queued" || reply.Status == "running" {
		reply, err = exchange(map[string]any{"op": "inspect", "requestId": report.RequestID, "waitMs": 60000})
	}
	if err == nil && reply.Status == "succeeded" && (reply.RequestID == "" || reply.RequestID == report.RequestID) {
		receipt, receiptErr := exchange(map[string]string{"op": "receipt", "requestId": report.RequestID})
		if receiptErr == nil {
			if receipt.Receipt != nil {
				receipt = *receipt.Receipt
			}
			workVerified = tabbitFixtureReceiptMatches(receipt, report.RequestID)
		}
	}
	if synchronized {
		// 本次没有 claim 或 resume；丢弃只关闭本次创建的演练标签。
		finish, finishErr := exchange(map[string]any{"op": "finish", "keep": false})
		report.CleanupVerified = finishErr == nil && finish.Finished && finish.Keep != nil && !*finish.Keep && len(finish.ClosedIDs) == 1 && finish.ClosedIDs[0] > 0
	}
	if !workVerified {
		return fail("页面结果与原请求回执")
	}
	if !report.CleanupVerified {
		return fail("本次标签清理")
	}
	report.State = "browser_task_verified"
	return report, nil
}

func tabbitFixtureReceiptMatches(receipt tabbitFrame, requestID string) bool {
	if receipt.Status != "succeeded" || receipt.RequestID != requestID || receipt.Result == nil {
		return false
	}
	var value struct {
		URL    string `json:"url"`
		Title  string `json:"title"`
		Before *bool  `json:"before"`
		Source string `json:"source"`
	}
	if json.Unmarshal(receipt.Result.Value, &value) != nil {
		return false
	}
	return value.URL == tabbitFixtureURL && value.Title == tabbitFixtureTitle && value.Before != nil && !*value.Before &&
		(value.Source == tabbitFixtureID || strings.TrimPrefix(value.Source, "Source ID: ") == tabbitFixtureID)
}
