package agentcli

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMagpieQuotaSanitizesAndDoesNotInventAllowance(t *testing.T) {
	data := []byte(`{"object":"list","data":[
		{"provider":"qoder","windows":[{"balance":99}]},
		{"provider":"office/trae-cn","from":"PRIVATE-REMOTE","windows":[{"balance":99}]},
		{"provider":"trae-cn","from":"PRIVATE-REMOTE","windows":[{"balance":99}]},
		{"provider":"trae-cn","error":"PRIVATE-ERROR","windows":[{"balance":99}]},
		{"provider":"trae-cn","user":"PRIVATE-EMAIL","name":"PRIVATE-NAME","alias":"PRIVATE-ALIAS","balance":"PRIVATE-BALANCE","readAt":"2026-11-16T12:34:56Z","windows":[
			{"name":"PRIVATE-WINDOW","display":"PRIVATE-DISPLAY","balance":0,"unit":"credits","used":0,"remaining":100},
			{"balance":2,"unit":"PRIVATE-UNIT"},
			{"used":0,"remaining":100},
			{"text":true,"used":25,"remaining":75},
			{"used":0,"remaining":100,"amount":null,"limit":10000,"unit":"credits"},
			{"used":0,"remaining":100,"amount":0,"amountUnknown":true,"limit":10000,"unit":"credits"},
			{"used":25,"remaining":75,"amount":10,"limit":40,"unit":"credits","resetsAt":"2026-11-17T12:34:56Z"}
		]}
	]}`)
	unknown := MagpieQuota{State: "unknown", Provider: "trae-cn"}
	quota, err := decodeMagpieQuota(data, unknown)
	if err != nil || quota.State != "cached" || len(quota.Windows) != 5 {
		t.Fatalf("quota = %+v, err = %v", quota, err)
	}
	wallet, other, allowance := quota.Windows[0], quota.Windows[1], quota.Windows[4]
	if wallet.Kind != "wallet" || wallet.Balance == nil || *wallet.Balance != 0 || wallet.RemainingPercent != nil || wallet.Unit != "credits" || wallet.ReadAt == nil {
		t.Fatalf("wrong zero-wallet observation: %+v", wallet)
	}
	if other.Unit != "" || other.Balance == nil || *other.Balance != 2 {
		t.Fatalf("wrong unknown unit observation: %+v", other)
	}
	for _, partial := range quota.Windows[2:4] {
		if partial.Limit == nil || *partial.Limit != 10000 || partial.AmountUsed != nil || partial.RemainingPercent != nil {
			t.Fatalf("invented remaining allowance from a known limit: %+v", partial)
		}
	}
	if allowance.Kind != "allowance" || allowance.AmountUsed == nil || *allowance.AmountUsed != 10 || allowance.Limit == nil || *allowance.Limit != 40 || allowance.RemainingPercent == nil || *allowance.RemainingPercent != 75 || allowance.ResetsAt == nil {
		t.Fatalf("wrong allowance observation: %+v", allowance)
	}
	encoded, err := json.Marshal(quota)
	if err != nil || strings.Contains(string(encoded), "PRIVATE-") {
		t.Fatalf("the observation contains data outside its projection: %s, %v", encoded, err)
	}
	if quota, err := decodeMagpieQuota([]byte(`{"object":"list","data":[]}`), unknown); err != nil || quota.State != "unknown" || len(quota.Windows) != 0 {
		t.Fatalf("missing provider was not unknown: %+v, %v", quota, err)
	}
	if quota, err := decodeMagpieQuota([]byte(`{"object":"list","data":[`+strings.Repeat(`{},`, magpieMaxItems)+`{}]}`), unknown); err == nil || quota.State != "unknown" {
		t.Fatalf("oversized response was accepted: %+v, %v", quota, err)
	}
}

func TestReadMagpieQuotaUsesOnlyCachedLoopbackEndpoint(t *testing.T) {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Skipf("local sockets not available: %v", err)
	}
	var requests int
	server := &httptest.Server{Listener: listener, Config: &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.Method != http.MethodGet || r.URL.Path != "/v1/magpie/quotas" || r.URL.RawQuery != "kept=1" || r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL)
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		// 即使重定向仍指向本地服务，也不能发送第二次请求。
		http.Redirect(w, r, "/not-the-cache", http.StatusFound)
	})}}
	server.Start()
	defer server.Close()
	port := listener.Addr().(*net.TCPAddr).Port
	if quota, err := ReadMagpieQuota(t.Context(), "codebuddy", port); err != nil || quota.State != "unknown" {
		t.Fatalf("unsupported provider must not cause a request: %+v, %v", quota, err)
	}
	quota, err := ReadMagpieQuota(t.Context(), "trae", port)
	if err == nil || quota.State != "unknown" || quota.Provider != "trae-cn" {
		t.Fatalf("accepted a redirect: %+v, %v", quota, err)
	}
	server.Close()
	if requests != 1 {
		t.Fatalf("made %d local requests, expected one", requests)
	}
}
