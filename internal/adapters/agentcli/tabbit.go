package agentcli

import (
	"context"
	"errors"
	"io"
	"time"
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
