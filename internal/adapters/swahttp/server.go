package swahttp

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/songconmaisaix31-design/Astrocyte/internal/apierrors"
	"github.com/songconmaisaix31-design/Astrocyte/internal/foundation"
	workspace "github.com/songconmaisaix31-design/Astrocyte/internal/workspace/app"
)

type Services struct {
	Foundation    foundation.Service
	LocalProjects workspace.LocalProjects
	ProjectSpaces workspace.ProjectSpaces
	OrcaExecution workspace.OrcaExecution
}
type Config struct {
	Port               int
	Logger             *slog.Logger
	WebDir             string
	AllowedOrigins     []string
	SWAOwnerCapability string
	Services           Services
}
type Server struct{ server *http.Server }

func NewServer(cfg Config) *Server {
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	h := &handler{services: cfg.Services}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		value, err := h.services.Foundation.Health(r.Context())
		h.result(w, r, http.StatusOK, value, err)
	})
	mux.HandleFunc("GET /api/v1/foundation", func(w http.ResponseWriter, r *http.Request) {
		value, err := h.services.Foundation.Foundation(r.Context())
		h.result(w, r, http.StatusOK, value, err)
	})
	mux.HandleFunc("GET /api/v1/local-agents", func(w http.ResponseWriter, r *http.Request) {
		h.result(w, r, 0, nil, &apierrors.ServiceError{Code: apierrors.UnsupportedCapability, Message: "global Agent inventory is not assembled; inspect the current project capabilities", RequiredAction: "inspect_project_capabilities"})
	})
	h.registerProjects(mux)
	h.registerSpaces(mux)
	h.registerCommands(mux)
	guard := newSessionGuard(cfg)
	mux.HandleFunc("GET /api/v1/auth/session", guard.bootstrap)
	for _, path := range []string{"/api/", "/api"} {
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			h.result(w, r, 0, nil, &apierrors.ServiceError{Code: apierrors.NotFound, Message: "API route not found", RequiredAction: "check_path_and_method"})
		})
	}
	var inner http.Handler = mux
	if cfg.WebDir != "" {
		inner = spaHandler(cfg.WebDir, mux)
	}
	stack := requestIDMiddleware(loopbackMiddleware(loggingMiddleware(cfg.Logger, guard.middleware(inner))))
	return &Server{server: &http.Server{Addr: fmt.Sprintf("127.0.0.1:%d", cfg.Port), Handler: stack, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 150 * time.Second, IdleTimeout: 60 * time.Second}}
}

func (s *Server) Serve(listener net.Listener) error {
	if listener == nil {
		return errors.New("HTTP listener is required")
	}
	address, ok := listener.Addr().(*net.TCPAddr)
	if !ok || !address.IP.IsLoopback() || address.Port < 1 || address.Port > 65535 {
		return errors.New("HTTP listener must be bound to a loopback TCP address")
	}
	return s.server.Serve(listener)
}
func (s *Server) Shutdown(ctx context.Context) error { return s.server.Shutdown(ctx) }

func spaHandler(webDir string, api http.Handler) http.Handler {
	files := http.FileServer(http.Dir(webDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/api" || strings.HasPrefix(path, "/api/") {
			api.ServeHTTP(w, r)
			return
		}
		filePath := strings.TrimPrefix(path, "/")
		if filePath == "" {
			filePath = "index.html"
		}
		info, err := os.Stat(webDir + "/" + filePath)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			http.Error(w, "Static content unavailable", http.StatusInternalServerError)
			return
		}
		if errors.Is(err, os.ErrNotExist) && strings.HasPrefix(path, "/assets/") {
			w.Header().Set("Cache-Control", "no-store")
			http.NotFound(w, r)
			return
		}
		if errors.Is(err, os.ErrNotExist) || info.IsDir() {
			http.ServeFile(w, r, webDir+"/index.html")
			return
		}
		files.ServeHTTP(w, r)
	})
}

func isLoopbackHost(host string) bool {
	h, _, err := net.SplitHostPort(host)
	if err != nil {
		h = host
	}
	switch h {
	case "localhost", "127.0.0.1", "::1", "[::1]":
		return true
	}
	return false
}
