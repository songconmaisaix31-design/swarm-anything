package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
)

func bindHTTPListener(port int) (net.Listener, error) {
	if port < 0 || port > 65535 {
		return nil, errors.New("HTTP port must be 0..65535")
	}
	return net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
}

func announceHTTPListener(output io.Writer, listener net.Listener) error {
	address, ok := listener.Addr().(*net.TCPAddr)
	if !ok || !address.IP.IsLoopback() || address.Port < 1 || address.Port > 65535 {
		return errors.New("HTTP listener address is unavailable")
	}
	return json.NewEncoder(output).Encode(struct {
		Type   string `json:"type"`
		APIURL string `json:"api_url"`
	}{Type: "http_listening", APIURL: "http://" + address.String()})
}
