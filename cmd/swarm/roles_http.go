package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/songconmaisaix31-design/Astrocyte/internal/adapters/rolecards"
	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	swarmapp "github.com/songconmaisaix31-design/Astrocyte/internal/swarm/app"
	"github.com/songconmaisaix31-design/Astrocyte/internal/swarm/domain"
)

type roleHTTPOptions struct {
	Group, Action, Target, File, Endpoint, Name, Identity, RequestID string
	ExpectedVersion                                                  int
}

func remoteRoleCommand(options roleHTTPOptions, stdin io.Reader, stdout io.Writer, catalog *rolecards.Catalog) error {
	if options.Group != "roles" {
		return fmt.Errorf("--endpoint 用于共享角色管理")
	}
	if options.ExpectedVersion < 0 {
		return fmt.Errorf("expected-version 必须为正整数")
	}
	base, err := url.Parse(options.Endpoint)
	if err != nil {
		return err
	}
	port, err := strconv.Atoi(base.Port())
	if err != nil || port < 1 || port > 65535 || base.Scheme != "http" || !net.ParseIP(base.Hostname()).IsLoopback() || base.User != nil || base.RawQuery != "" || base.Fragment != "" || base.Path != "" && base.Path != "/" {
		return fmt.Errorf("endpoint 必须为带端口的本地 HTTP 地址")
	}
	base.Path = "/api/v1"
	jar, err := cookiejar.New(nil)
	if err != nil {
		return err
	}
	client := &http.Client{Jar: jar, Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return fmt.Errorf("角色 API 不接受重定向") }}
	var session struct {
		CSRF string `json:"csrf_token"`
	}
	key := options.RequestID
	if key == "" {
		key = uuid.NewString()
	} else if _, err := uuid.Parse(key); err != nil {
		return fmt.Errorf("request-id 必须为 UUID")
	}
	do := func(method, path string, body any, result any) error {
		var reader io.Reader
		if body != nil {
			data, err := json.Marshal(body)
			if err != nil {
				return err
			}
			reader = bytes.NewReader(data)
		}
		request, err := http.NewRequest(method, base.String()+path, reader)
		if err != nil {
			return err
		}
		if body != nil {
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("X-CSRF-Token", session.CSRF)
			request.Header.Set("Idempotency-Key", key)
		}
		response, err := client.Do(request)
		if err != nil {
			if body != nil {
				return &apierrors.ServiceError{Code: apierrors.DeliveryUnknown, RequestID: key, Message: "角色写入响应不可用，请查询当前角色并保留原命令身份", RequiredAction: "read_role_before_replaying_original_command"}
			}
			return &apierrors.ServiceError{Code: apierrors.ProviderUnavailable, Message: err.Error(), RequiredAction: "检查本地服务地址和运行状态"}
		}
		defer response.Body.Close()
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			var envelope apierrors.ErrorEnvelope
			if err := json.NewDecoder(response.Body).Decode(&envelope); err != nil {
				return err
			}
			if envelope.Error == nil {
				return fmt.Errorf("角色 API 返回 HTTP %d", response.StatusCode)
			}
			return envelope.Error
		}
		if err := json.NewDecoder(response.Body).Decode(result); err != nil {
			if body != nil {
				return &apierrors.ServiceError{Code: apierrors.DeliveryUnknown, RequestID: key, Message: "角色写入响应不完整", RequiredAction: "read_role_before_replaying_original_command"}
			}
			return err
		}
		return nil
	}
	if err := do(http.MethodGet, "/auth/session", nil, &session); err != nil {
		return err
	}
	encoder := json.NewEncoder(stdout)
	encoder.SetIndent("", "  ")
	if options.Action == "list" {
		var response struct {
			Items []swarmapp.RoleCardRecord `json:"items"`
		}
		if err := do(http.MethodGet, "/roles", nil, &response); err != nil {
			return err
		}
		items := make([]domain.RoleCard, 0, len(response.Items))
		for _, item := range response.Items {
			items = append(items, item.Role)
		}
		return encoder.Encode(map[string]any{"schema_version": 1, "items": items})
	}
	var record swarmapp.RoleCardRecord
	if options.Action == "show" || options.Action == "edit" {
		if options.Target == "" {
			return fmt.Errorf("需要角色 ID")
		}
		if err := do(http.MethodGet, "/roles/"+url.PathEscape(options.Target), nil, &record); err != nil {
			return err
		}
		if options.Action == "show" {
			return encoder.Encode(map[string]any{"schema_version": 1, "role": record.Role, "version": record.Version})
		}
	}
	if options.Action != "new" && options.Action != "edit" {
		return fmt.Errorf("共享角色命令支持 list/show/new/edit")
	}
	file := options.File
	if options.Action == "new" && file == "" {
		file = options.Target
	}
	if file != "" {
		data, err := readCard(file, stdin)
		if err != nil {
			return err
		}
		role, err := catalog.ParseRole(data)
		if err != nil {
			return err
		}
		record.Role = role
	} else if options.Action == "new" || options.Name == "" && options.Identity == "" {
		return fmt.Errorf("共享新建需要角色文件；共享编辑需要 --file、--name 或 --identity")
	}
	if options.Name != "" {
		record.Role.Name = options.Name
	}
	if options.Identity != "" {
		record.Role.Identity = options.Identity
	}
	if options.Action == "new" {
		if options.ExpectedVersion != 0 && options.ExpectedVersion != 1 {
			return fmt.Errorf("共享新建角色的版本为1")
		}
		record.Version = 1
	} else if options.ExpectedVersion > 0 {
		record.Version = options.ExpectedVersion
	}
	method, path := http.MethodPost, "/roles"
	if options.Action == "edit" {
		method, path = http.MethodPut, "/roles/"+url.PathEscape(options.Target)
	}
	command := map[string]any{"schema_version": 1, "request_id": key, "expected_version": record.Version, "role": record.Role}
	var saved swarmapp.RoleCardRecord
	if err := do(method, path, command, &saved); err != nil {
		return err
	}
	return encoder.Encode(map[string]any{"schema_version": 1, "role": saved.Role, "version": saved.Version, "request_id": key})
}
