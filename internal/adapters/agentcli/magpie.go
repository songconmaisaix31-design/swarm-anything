package agentcli

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strconv"
	"time"
)

const (
	magpieTimeout  = 2 * time.Second
	magpieMaxBody  = 256 << 10
	magpieMaxItems = 128
)

// MagpieQuota 是与具体 Run 或 CLI 凭据无绑定的本机缓存观察。
type MagpieQuota struct {
	State    string              `json:"state"`
	Provider string              `json:"provider,omitempty"`
	Windows  []MagpieQuotaWindow `json:"windows,omitempty"`
}

type MagpieQuotaWindow struct {
	Kind             string     `json:"kind"`
	Unit             string     `json:"unit,omitempty"`
	Balance          *float64   `json:"balance,omitempty"`
	AmountUsed       *float64   `json:"amount_used,omitempty"`
	Limit            *float64   `json:"limit,omitempty"`
	RemainingPercent *float64   `json:"remaining_percent,omitempty"`
	Unlimited        bool       `json:"unlimited,omitempty"`
	ReadAt           *time.Time `json:"read_at,omitempty"`
	ResetsAt         *time.Time `json:"resets_at,omitempty"`
	ExpiresAt        *time.Time `json:"expires_at,omitempty"`
}

type magpieCard struct {
	Provider string         `json:"provider"`
	From     string         `json:"from"`
	Error    string         `json:"error"`
	ReadAt   *time.Time     `json:"readAt"`
	AsOf     *time.Time     `json:"asOf"`
	Windows  []magpieWindow `json:"windows"`
}

type magpieWindow struct {
	Unlimited     bool       `json:"unlimited"`
	Text          bool       `json:"text"`
	Unit          string     `json:"unit"`
	Balance       *float64   `json:"balance"`
	Amount        *float64   `json:"amount"`
	AmountUnknown bool       `json:"amountUnknown"`
	Limit         *float64   `json:"limit"`
	Used          *float64   `json:"used"`
	Remaining     *float64   `json:"remaining"`
	ResetsAt      *time.Time `json:"resetsAt"`
	RunsOutAt     *time.Time `json:"runsOutAt"`
}

// ReadMagpieQuota 仅读取已明确选择的本机缓存接口，不探测账号或触发供应商刷新。
func ReadMagpieQuota(ctx context.Context, agentID string, port int) (MagpieQuota, error) {
	provider := agentID
	switch agentID {
	case "trae":
		provider = "trae-cn"
	case "qoder", "qoder-cn", "workbuddy":
	default:
		return MagpieQuota{State: "unknown"}, nil
	}
	unknown := MagpieQuota{State: "unknown", Provider: provider}
	if port < 1 || port > 65535 {
		return unknown, errors.New("invalid local Magpie port")
	}
	endpoint := "http://" + net.JoinHostPort("127.0.0.1", strconv.Itoa(port)) + "/v1/magpie/quotas?kept=1"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return unknown, errors.New("cannot create local Magpie cache request")
	}
	req.Header.Set("Accept", "application/json")
	client := http.Client{
		Timeout:       magpieTimeout,
		Transport:     &http.Transport{DisableKeepAlives: true, DisableCompression: true, MaxResponseHeaderBytes: 16 << 10},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	res, err := client.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return unknown, ctx.Err()
		}
		return unknown, errors.New("local Magpie cache unavailable")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return unknown, errors.New("local Magpie cache rejected the read")
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, magpieMaxBody+1))
	if err != nil || len(data) > magpieMaxBody {
		return unknown, errors.New("local Magpie cache response exceeds limits or could not be read")
	}
	return decodeMagpieQuota(data, unknown)
}

func decodeMagpieQuota(data []byte, unknown MagpieQuota) (MagpieQuota, error) {
	var envelope struct {
		Object string       `json:"object"`
		Data   []magpieCard `json:"data"`
	}
	if json.Unmarshal(data, &envelope) != nil || envelope.Object != "list" || envelope.Data == nil || len(envelope.Data) > magpieMaxItems {
		return unknown, errors.New("invalid local Magpie cache response")
	}
	result := unknown
	count := 0
	for _, card := range envelope.Data {
		count += len(card.Windows)
		if count > magpieMaxItems {
			return unknown, errors.New("local Magpie cache has too many windows")
		}
		if card.Provider != unknown.Provider || card.From != "" || card.Error != "" {
			continue
		}
		readAt := card.ReadAt
		if readAt == nil {
			readAt = card.AsOf
		}
		for _, window := range card.Windows {
			if sanitized, ok := sanitizeMagpieWindow(window, readAt); ok {
				result.Windows = append(result.Windows, sanitized)
			}
		}
	}
	if len(result.Windows) > 0 {
		result.State = "cached"
	}
	return result, nil
}

func sanitizeMagpieWindow(window magpieWindow, readAt *time.Time) (MagpieQuotaWindow, bool) {
	if window.Text {
		return MagpieQuotaWindow{}, false
	}
	result := MagpieQuotaWindow{Kind: "allowance", ReadAt: readAt, ResetsAt: window.ResetsAt, ExpiresAt: window.RunsOutAt}
	switch window.Unit {
	case "credits", "points", "tokens", "CNY", "RMB", "USD":
		result.Unit = window.Unit
	}
	if window.Balance != nil {
		// 钱包内余额不是百分比；上游仍可能为它填充默认的 100%。
		result.Kind, result.Balance = "wallet", window.Balance
		return result, *window.Balance >= 0
	}
	if window.Unlimited {
		result.Unlimited = true
		return result, true
	}
	if window.Limit != nil && *window.Limit > 0 && result.Unit != "" {
		result.Limit = window.Limit
		if !window.AmountUnknown && window.Amount != nil && *window.Amount >= 0 {
			result.AmountUsed = window.Amount
		}
	}
	// 缺失用量时可能得到默认 0%/100%；已知上限不代表已知用量。
	if !window.AmountUnknown && window.Used != nil && *window.Used >= 0 && window.Remaining != nil && *window.Remaining >= 0 && *window.Remaining <= 100 && (*window.Used > 0 || result.AmountUsed != nil) {
		result.RemainingPercent = window.Remaining
	}
	return result, result.Limit != nil || result.RemainingPercent != nil
}
