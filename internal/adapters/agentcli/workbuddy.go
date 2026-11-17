package agentcli

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"time"
)

const (
	workBuddyStatusURL = "https://www.workbuddy.cn/openapi/v2/localassistant"
	workBuddyTimeout   = 5 * time.Second
	workBuddyMaxBody   = 64 << 10
)

var workBuddyBearer = regexp.MustCompile(`^[A-Za-z0-9._~+/-]+=*$`)

type WorkBuddyVerification struct {
	SchemaVersion int    `json:"schema_version"`
	AgentID       string `json:"agent_id"`
	State         string `json:"state"`
}

// CheckWorkBuddy 仅使用显式传入、具备 user.localassistant.readable 的 OAuth
// 凭据查询桌面助理在线状态；不发送消息，也不复用桌面登录文件。
// https://open.workbuddy.cn/docs/openapi
func CheckWorkBuddy(ctx context.Context, token string) (WorkBuddyVerification, error) {
	return checkWorkBuddy(ctx, token, &http.Transport{
		DisableKeepAlives:      true,
		DisableCompression:     true,
		MaxResponseHeaderBytes: 16 << 10,
	})
}

func checkWorkBuddy(ctx context.Context, token string, transport http.RoundTripper) (WorkBuddyVerification, error) {
	verified := WorkBuddyVerification{SchemaVersion: 1, AgentID: "workbuddy", State: "unknown"}
	if token == "" {
		return verified, errors.New("需要 WorkBuddy 开放平台的只读 OAuth 访问令牌")
	}
	if len(token) > 8192 || !workBuddyBearer.MatchString(token) {
		return verified, errors.New("WorkBuddy OAuth 访问令牌的格式无效")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, workBuddyStatusURL, nil)
	if err != nil {
		return verified, errors.New("无法构建 WorkBuddy 状态请求")
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	client := http.Client{
		Transport:     transport,
		Timeout:       workBuddyTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	res, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return verified, ctx.Err()
		}
		return verified, errors.New("无法访问 WorkBuddy 官方状态接口")
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return verified, errors.New("WorkBuddy 拒绝该令牌；请检查有效期和 user.localassistant.readable 权限")
	}
	if res.StatusCode != http.StatusOK {
		return verified, errors.New("WorkBuddy 官方接口未返回成功状态")
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, workBuddyMaxBody+1))
	if err != nil || len(data) > workBuddyMaxBody {
		return verified, errors.New("WorkBuddy 状态响应读取失败或超过大小限制")
	}
	var body struct {
		Code *int `json:"code"`
		Data struct {
			Online *bool `json:"online"`
		} `json:"data"`
	}
	if json.Unmarshal(data, &body) != nil || body.Code == nil || *body.Code != 0 || body.Data.Online == nil {
		return verified, errors.New("WorkBuddy 官方接口未返回可确认的在线状态")
	}
	if *body.Data.Online {
		verified.State = "online"
	} else {
		verified.State = "offline"
	}
	return verified, nil
}
